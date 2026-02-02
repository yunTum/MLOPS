import lightgbm as lgb
import mlflow
import optuna
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg') # Non-interactive backend
import matplotlib.pyplot as plt
import shap
import os
import tempfile
import json
from sqlalchemy.orm import Session
from app.db import models
from app.core import storage, mlflow_utils
from sklearn.model_selection import train_test_split
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    silhouette_score, davies_bouldin_score,
    mean_squared_error, mean_absolute_error, r2_score,
    roc_auc_score, accuracy_score, f1_score, log_loss,
    confusion_matrix, roc_curve
)
from sklearn.decomposition import PCA
from datetime import datetime

class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super(NumpyEncoder, self).default(obj)

# ...

def train_clustering(
    db: Session,
    X: pd.DataFrame,
    params: dict,
    features: list,
    experiment_name: str,
    feature_set_id: int
):
    # Setup MLflow
    experiment = mlflow_utils.setup_mlflow_experiment(experiment_name)
    
    with mlflow.start_run(experiment_id=experiment.experiment_id) as run:
        # Log Params
        mlflow_utils.log_params_to_mlflow(params)
        mlflow.log_param("feature_set_id", feature_set_id)
        mlflow.log_param("features_count", len(features))
        mlflow.log_param("rows", len(X))
        
        # Train KMeans (Pipeline)
        from sklearn.pipeline import Pipeline
        
        n_clusters = int(params.get("n_clusters", 3))
        init = params.get("init", "k-means++") 

        pipeline = Pipeline([
            ('imputer', SimpleImputer(strategy='constant', fill_value=0)),
            ('scaler', StandardScaler()),
            ('kmeans', KMeans(n_clusters=n_clusters, init=init, random_state=42))
        ])
        
        clusters = pipeline.fit_predict(X)
        kmeans = pipeline.named_steps['kmeans'] # Access for metrics (inertia)
        X_scaled = pipeline.named_steps['scaler'].transform(X) # Re-create X_scaled for metrics
        
        # Calculate Metrics
        metrics = {}
        if len(X) > 1:
            try:
                metrics['silhouette'] = silhouette_score(X_scaled, clusters)
                metrics['davies_bouldin'] = davies_bouldin_score(X_scaled, clusters)
                metrics['inertia'] = kmeans.inertia_
            except Exception as e:
                print(f"Clustering metrics error: {e}")
        
        # Log Metrics
        for k, v in metrics.items():
            mlflow.log_metric(k, v)
            
        # Visualizations
        with tempfile.TemporaryDirectory() as tmp_dir:
            # PCA Plot (Use Scaled Data)
            plot_clusters_pca(X_scaled, clusters, tmp_dir)
            
            # Feature Importance (Inverse of Cluster Centers Std/Mean? Or just centers heatmap)
            # For now, maybe just Cluster Centers?
            # Let's support Correlation Matrix still
            plot_correlation_matrix(X, features, tmp_dir)
            
            # Log artifacts
            mlflow.log_artifacts(tmp_dir, artifact_path="plots")
            
        # Log Model (Sklearn Pipeline)
        mlflow.sklearn.log_model(pipeline, "model")
        
        # Save to DB
        db_model = models.Model(
            name=f"kmeans_{datetime.now().strftime('%Y%m%d%H%M%S')}",
            feature_set_id=feature_set_id,
            mlflow_run_id=run.info.run_id,
            stage="dev",
            metrics=metrics,
            feature_names=features,
            target_column=None, # No target
            parameters=params 
        )
        db.add(db_model)
        db.commit()
        db.refresh(db_model)
        
        return db_model

def plot_clusters_pca(X, clusters, output_dir):
    try:
        pca = PCA(n_components=2)
        X_pca = pca.fit_transform(X)
        
        # Save JSON
        data = []
        for i in range(len(X_pca)):
             # Limit size if needed
             if i > 2000: break
             data.append({
                 "x": float(X_pca[i, 0]),
                 "y": float(X_pca[i, 1]),
                 "cluster": int(clusters[i])
             })
             
        with open(os.path.join(output_dir, "cluster_pca.json"), "w") as f:
            json.dump(data, f)

        plt.figure(figsize=(10, 8))
        scatter = plt.scatter(X_pca[:, 0], X_pca[:, 1], c=clusters, cmap='viridis', alpha=0.6)
        plt.colorbar(scatter, label='Cluster')
        plt.title(f"Clustering (PCA) - {len(set(clusters))} Clusters")
        plt.xlabel("PC1")
        plt.ylabel("PC2")
        plt.grid(True, alpha=0.3)
        plt.savefig(os.path.join(output_dir, "cluster_pca.png"))
        plt.close()
    except Exception as e:
        print(f"Failed to plot clusters PCA: {e}")

def optimize_lightgbm(X_train, y_train, base_params, metric, n_trials=20, timeout=600, progress_callback=None):
    """
    Optimize LightGBM hyperparameters using Optuna.
    Returns the best parameters found.
    """
    import optuna
    
    # Define optimization direction
    # metrics: rmse(min), mae(min), auc(max), binary_logloss(min), multi_logloss(min)
    direction = 'maximize' if metric in ['auc', 'accuracy', 'f1'] else 'minimize'
    
    study = optuna.create_study(direction=direction)
    
    # Split for validation during optimization (internal split)
    from sklearn.model_selection import train_test_split
    X_t, X_v, y_t, y_v = train_test_split(X_train, y_train, test_size=0.2, random_state=42)
    
    def objective(trial):
        # Notify progress
        if progress_callback:
            progress_callback(trial.number / n_trials * 100 * 0.5) # Assume opt takes 50% of time

        # Suggest params
        param = {
            'objective': base_params.get('objective', 'regression'),
            'metric': metric,
            'verbosity': -1,
            'boosting_type': 'gbdt',
            'lambda_l1': trial.suggest_float('lambda_l1', 1e-8, 10.0, log=True),
            'lambda_l2': trial.suggest_float('lambda_l2', 1e-8, 10.0, log=True),
            'num_leaves': trial.suggest_int('num_leaves', 2, 256),
            'feature_fraction': trial.suggest_float('feature_fraction', 0.4, 1.0),
            'bagging_fraction': trial.suggest_float('bagging_fraction', 0.4, 1.0),
            'bagging_freq': trial.suggest_int('bagging_freq', 1, 7),
            'min_child_samples': trial.suggest_int('min_child_samples', 5, 100),
            'learning_rate': trial.suggest_float('learning_rate', 0.01, 0.3)
        }
        
        # Handle class weights if needed (omitted for now)
        
        train_data = lgb.Dataset(X_t, label=y_t)
        valid_data = lgb.Dataset(X_v, label=y_v, reference=train_data)
        
        # Pruning callback
        pruning_callback = optuna.integration.LightGBMPruningCallback(trial, metric)
        
        try:
            bst = lgb.train(
                param, 
                train_data, 
                valid_sets=[valid_data], 
                num_boost_round=1000,
                callbacks=[
                    # lgb.early_stopping(stopping_rounds=20), # Use callbacks list correctly
                    pruning_callback
                ]
            )
            
            # Eval
            preds = bst.predict(X_v)
            
            if metric == 'rmse':
                return np.sqrt(mean_squared_error(y_v, preds))
            elif metric == 'mae':
                return mean_absolute_error(y_v, preds)
            elif metric == 'auc':
                 return roc_auc_score(y_v, preds)
            # ... add others
            return np.sqrt(mean_squared_error(y_v, preds)) # Default
        except Exception as e:
            print(f"Trial {trial.number} failed: {e}")
            import traceback
            traceback.print_exc()
            raise e

    # Run Optimization
    # Use simple lgb.cv or manual train/test? Manual is faster for large data as we control split.
    # Note: Using Optuna's LightGBM integration is also possible but manual gives more control.
    
    # We need to correctly handle the metric return above.
    # Simplified version using lgb.train directly in objective.

    # Fix: Use try-except for timeout
    try:
        study.optimize(objective, n_trials=n_trials, timeout=timeout)
    except Exception as e:
        print(f"Optimization stopped or failed: {e}")
        
    print(f"Optimization finished. Trials: {len(study.trials)}")
    completed_trials = [t for t in study.trials if t.state == optuna.trial.TrialState.COMPLETE]
    if not completed_trials:
        print("No trials completed. Returning base params.")
        return base_params

    print(f"Best params: {study.best_params}")
    return study.best_params

def train_model(
    db: Session,
    feature_set_id: int,
    target_col: str, # Can be None/Empty for clustering
    params: dict,
    experiment_name: str = "Default",
    features: list = None,
    optimize_hyperparameters: bool = False,
    optimization_timeout: int = 600,
    optimization_metric: str = "rmse",
    n_trials: int = 20,
    progress_callback = None
):
    # 1. Load Data
    fs = db.query(models.FeatureSet).filter(models.FeatureSet.id == feature_set_id).first()
    if not fs:
        raise ValueError("Feature set not found")
        
    df = storage.load_parquet_to_dataframe(fs.path)
    
    # Auto-convert types
    for col in df.columns:
        df[col] = pd.to_numeric(df[col], errors='ignore')
    
    # Handle Clustering Objective
    objective = params.get('objective', 'regression')
    if objective == 'clustering':
        # Drop target if it exists and wasn't intended (but for clustering usually we ignore target)
        # Assuming all selected features are X
        X = df
        
        # Filter features
        if features and len(features) > 0:
            missing = [f for f in features if f not in X.columns]
            if missing:
                 raise ValueError(f"Requested features not found: {missing}")
            X = X[features]
        # If target_col is provided, drop it from X (clustering shouldn't see label)
        if target_col and target_col in X.columns:
             X = X.drop(columns=[target_col])
             
        # Only numeric for KMeans
        X = X.select_dtypes(include=[np.number])
        # Fill NA with 0 or mean? KMeans fails on NA.
        X = X.fillna(0) 

        return train_clustering(db, X, params, list(X.columns), experiment_name, feature_set_id)

    # ... (Regression/Classification Logic continues below)
    
    for col in df.select_dtypes(include=['object']).columns:
        df[col] = df[col].astype('category')
    
    if not target_col or target_col not in df.columns:
         raise ValueError(f"Target column {target_col} not found in feature set")
        
    # Drop rows where target is NaN
    df = df.dropna(subset=[target_col])
        
    X = df.drop(columns=[target_col])
    
    # Filter features if specified
    if features and len(features) > 0:
        missing = [f for f in features if f not in X.columns]
        if missing:
             raise ValueError(f"Requested features not found: {missing}")
        X = X[features]
    
    used_features = list(X.columns)
    y = df[target_col]
    
    # Simple Split
    X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42)

    # Optimization Step
    if optimize_hyperparameters:
        print("Starting Hyperparameter Optimization...")
        best_params = optimize_lightgbm(
            X_train, y_train, 
            base_params=params, 
            metric=optimization_metric, 
            n_trials=n_trials, 
            timeout=optimization_timeout,
            progress_callback=progress_callback
        )
        # Update params with best found
        params.update(best_params)
        # Mark as optimized for logging
        params['is_optimized'] = True
    
    # 2. Setup MLflow
    experiment = mlflow_utils.setup_mlflow_experiment(experiment_name)
    
    with mlflow.start_run(experiment_id=experiment.experiment_id) as run:
        # Log params
        mlflow_utils.log_params_to_mlflow(params)
        mlflow.log_param("feature_set_id", feature_set_id)
        mlflow.log_param("features_count", len(used_features))
        mlflow.log_param("rows_train", len(X_train))
        mlflow.log_param("rows_val", len(X_val))
        
        # 3. Train
        train_data = lgb.Dataset(X_train, label=y_train)
        val_data = lgb.Dataset(X_val, label=y_val, reference=train_data)
        
        evals_result = {}

        def lgb_progress_callback(env):
            if progress_callback:
                # Map iteration to progress
                # If HPO ran, map 80-100%. If not, 0-100%.
                start_base = 80 if optimize_hyperparameters else 0
                remaining = 100 - start_base
                
                # env.iteration is 0-indexed
                # env.end_iteration is total rounds (num_boost_round)
                # But it might be early stopped, so total is config.
                current = env.iteration + 1
                total = env.end_iteration
                
                prog = start_base + int((current / total) * remaining)
                progress_callback(prog)
        
        callbacks = [
            lgb.log_evaluation(period=10),
            lgb.early_stopping(stopping_rounds=20),
            lgb.record_evaluation(evals_result),
            lgb_progress_callback
        ]
        
        bst = lgb.train(
            params,
            train_data,
            valid_sets=[train_data, val_data],
            valid_names=['train', 'valid'],
            callbacks=callbacks
        )
        
        # 4. Evaluation & Metrics
        objective = params.get('objective', 'regression')
        metrics = calculate_metrics(bst, X_train, y_train, X_val, y_val, objective)
        
        # Log Metrics
        for k, v in metrics.items():
            mlflow.log_metric(k, v)
            
        # 5. Visualizations & Artifacts
        with tempfile.TemporaryDirectory() as tmp_dir:
            # A. Learning Curve
            plot_learning_curve(evals_result, params.get('metric', 'loss'), tmp_dir)
            
            # B. Feature Importance
            top_features = plot_feature_importance(bst, used_features, tmp_dir)
            
            # C. SHAP Summary
            generate_shap_summary(bst, X_val, tmp_dir)
            
            # D. Confusion Matrix (if classification)
            if objective in ['binary', 'multiclass']:
                plot_confusion_matrix(bst, X_val, y_val, tmp_dir)
            
            # E. Correlation Matrix
            plot_correlation_matrix(X_train, used_features, tmp_dir, top_features)
            
            # F. Actual vs Predicted (Performance)
            # Need predictions on validation set
            pred_val = bst.predict(X_val)
            plot_actual_vs_predicted(y_val, pred_val, tmp_dir, objective)

            # Log all artifacts
            # IMPORTANT: This copies files from tmp_dir to MLflow Artifact Root
            mlflow.log_artifacts(tmp_dir, artifact_path="plots")

        # Log Model Binary
        mlflow.lightgbm.log_model(bst, "model")

        # 6. Save to DB
        db_model = models.Model(
            name=f"lgbm_{datetime.now().strftime('%Y%m%d%H%M%S')}",
            feature_set_id=feature_set_id,
            mlflow_run_id=run.info.run_id,
            stage="dev",
            metrics=metrics,
            feature_names=used_features,
            target_column=target_col,
            parameters=params 
        )
        db.add(db_model)
        db.commit()
        db.refresh(db_model)
        
        return db_model

def calculate_metrics(bst, X_train, y_train, X_val, y_val, objective):
    metrics = {}
    pred_val = bst.predict(X_val)
    pred_train = bst.predict(X_train)
    
    if objective == 'regression':
        metrics['val_rmse'] = np.sqrt(mean_squared_error(y_val, pred_val))
        metrics['val_mae'] = mean_absolute_error(y_val, pred_val)
        metrics['val_r2'] = r2_score(y_val, pred_val)
        metrics['train_rmse'] = np.sqrt(mean_squared_error(y_train, pred_train))
        if metrics['train_rmse'] > 0:
            metrics['overfit_ratio'] = metrics['val_rmse'] / metrics['train_rmse']
            
    elif objective == 'binary':
        pred_val_binary = np.round(pred_val)
        metrics['val_auc'] = roc_auc_score(y_val, pred_val)
        metrics['val_accuracy'] = accuracy_score(y_val, pred_val_binary)
        metrics['val_f1'] = f1_score(y_val, pred_val_binary)
        metrics['val_logloss'] = log_loss(y_val, pred_val)
        
    elif objective == 'multiclass':
        pred_val_class = np.argmax(pred_val, axis=1)
        metrics['val_accuracy'] = accuracy_score(y_val, pred_val_class)
        metrics['val_multi_logloss'] = log_loss(y_val, pred_val)

    if bst.best_score:
        valid_key = list(bst.best_score.keys())[0]
        metric_key = list(bst.best_score[valid_key].keys())[0]
        metrics['best_val_score'] = bst.best_score[valid_key][metric_key]
        
    return metrics

def plot_learning_curve(evals_result, metric_name, output_dir):
    try:
        # Save JSON
        with open(os.path.join(output_dir, "learning_curve.json"), "w") as f:
            json.dump(evals_result, f, cls=NumpyEncoder)

        plt.figure(figsize=(10, 6))
        for dataset_name, metrics in evals_result.items():
            for m_name, values in metrics.items():
                plt.plot(values, label=f"{dataset_name} - {m_name}")
        plt.title("Learning Curve")
        plt.xlabel("Iterations")
        plt.ylabel("Metric")
        plt.legend()
        plt.grid(True)
        plt.savefig(os.path.join(output_dir, "learning_curve.png"))
        plt.close()
    except Exception as e:
        print(f"Failed to plot learning curve: {e}")

def plot_feature_importance(bst, feature_names, output_dir):
    try:
        importance = bst.feature_importance(importance_type='gain')
        df_imp = pd.DataFrame({'feature': feature_names, 'importance': importance})
        
        # Save JSON (Full)
        df_imp_sorted = df_imp.sort_values('importance', ascending=False)
        imp_data = df_imp_sorted.to_dict(orient='records')
        with open(os.path.join(output_dir, "feature_importance.json"), "w") as f:
            json.dump(imp_data, f, cls=NumpyEncoder)

        # Plot Top 20 (Legacy/Fallback)
        df_imp_top = df_imp_sorted.head(20)
        
        plt.figure(figsize=(10, 8))
        plt.barh(df_imp_top['feature'], df_imp_top['importance'], color='skyblue')
        plt.xlabel("Importance (Gain)")
        plt.title("Top 20 Feature Importance")
        plt.gca().invert_yaxis()
        plt.grid(axis='x')
        plt.tight_layout()
        plt.savefig(os.path.join(output_dir, "feature_importance.png"))
        plt.close()
        
        return df_imp_top['feature'].tolist()
    except Exception as e:
        print(f"Failed to plot feature importance: {e}")
        return []

def generate_shap_summary(bst, X_val, output_dir):
    try:
        if len(X_val) > 1000:
            X_shap = X_val.sample(1000, random_state=42)
        else:
            X_shap = X_val  
        explainer = shap.TreeExplainer(bst)
        shap_values = explainer.shap_values(X_shap)
        plt.figure()
        shap_vals_to_plot = shap_values[1] if isinstance(shap_values, list) and len(shap_values) > 1 else shap_values   
        shap.summary_plot(shap_vals_to_plot, X_shap, show=False)
        plt.tight_layout()
        plt.savefig(os.path.join(output_dir, "shap_summary.png"))
        plt.close()
    except Exception as e:
        print(f"Failed to generate SHAP summary: {e}")

def plot_confusion_matrix(bst, X_val, y_val, output_dir):
    try:
        from sklearn.metrics import ConfusionMatrixDisplay
        preds = bst.predict(X_val)
        if len(preds.shape) > 1:
            y_pred = np.argmax(preds, axis=1)
        else:
            y_pred = np.round(preds)
        cm = confusion_matrix(y_val, y_pred)
        disp = ConfusionMatrixDisplay(confusion_matrix=cm)
        plt.figure(figsize=(8, 6))
        disp.plot(cmap=plt.cm.Blues)
        plt.title("Confusion Matrix")
        plt.tight_layout()
        plt.savefig(os.path.join(output_dir, "confusion_matrix.png"))
        plt.close()
    except Exception as e:
        print(f"Failed to plot confusion matrix: {e}")

def plot_correlation_matrix(X_train, feature_names, output_dir, top_features=None):
    try:
        # Ensure we only use numeric columns for correlation to avoid errors
        X_numeric = X_train.select_dtypes(include=[np.number])
        
        valid_features = [f for f in feature_names if f in X_numeric.columns]
        if len(valid_features) < 2:
            print("Not enough numeric features for correlation matrix")
            return

        # Use only used features, cap at 50 to avoid clutter
        # NOTE: For PNG we keep this. JSON export for matrix is large, maybe skip for now or implement later.
        if top_features:
             feats_to_plot = [f for f in top_features if f in X_numeric.columns][:20]
        else:
             feats_to_plot = valid_features[:50]
             
        corr = X_numeric[feats_to_plot].corr()

        # Save as JSON for interactive heatmap
        try:
            corr_data = {
                "features": feats_to_plot,
                "matrix": corr.where(pd.notnull(corr), None).values.tolist()
            }
            with open(os.path.join(output_dir, "correlation_matrix.json"), "w") as f:
                json.dump(corr_data, f, cls=NumpyEncoder)
        except Exception as e:
            print(f"Failed to save correlation matrix JSON: {e}")
        
        plt.figure(figsize=(12, 10))
        plt.matshow(corr, fignum=1, cmap='coolwarm')
        plt.xticks(range(len(feats_to_plot)), feats_to_plot, rotation=90, fontsize=8)
        plt.yticks(range(len(feats_to_plot)), feats_to_plot, fontsize=8)
        plt.colorbar()
        plt.title("Feature Correlation Matrix (First 50 Numeric Features)", y=1.02)
        plt.savefig(os.path.join(output_dir, "correlation_matrix.png"), bbox_inches='tight')
        plt.close()
    except Exception as e:
        print(f"Failed to plot correlation: {e}")

def plot_actual_vs_predicted(y_true, y_pred, output_dir, objective):
    try:
        # Save JSON (Sampled)
        df_res = pd.DataFrame({'actual': y_true, 'predicted': y_pred})
        if len(df_res) > 2000:
            df_res = df_res.sample(2000, random_state=42)
        
        data = df_res.to_dict(orient='records')
        with open(os.path.join(output_dir, "actual_vs_predicted.json"), "w") as f:
            json.dump(data, f, cls=NumpyEncoder)

        plt.figure(figsize=(8, 8))
        if objective == 'regression':
            plt.scatter(y_true, y_pred, alpha=0.5, color='blue')
            min_val = min(y_true.min(), y_pred.min())
            max_val = max(y_true.max(), y_pred.max())
            plt.plot([min_val, max_val], [min_val, max_val], 'r--')
            plt.xlabel("Actual")
            plt.ylabel("Predicted")
            plt.title("Actual vs Predicted")
        elif objective == 'binary':
             fpr, tpr, _ = roc_curve(y_true, y_pred)
             plt.plot(fpr, tpr, label='ROC curve', color='darkorange')
             plt.plot([0, 1], [0, 1], 'r--', color='navy')
             plt.xlabel('False Positive Rate')
             plt.ylabel('True Positive Rate')
             plt.title('ROC Curve')
             plt.legend()
        
        plt.grid(True)
        plt.tight_layout()
        plt.savefig(os.path.join(output_dir, "actual_vs_predicted.png"))
        plt.close()
    except Exception as e:
         print(f"Failed to plot actual vs predicted: {e}")
