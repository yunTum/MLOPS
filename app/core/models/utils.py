import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import pandas as pd
import numpy as np
import os
import json
import shap
from sklearn.decomposition import PCA
from sklearn.metrics import roc_curve, confusion_matrix, ConfusionMatrixDisplay

class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super(NumpyEncoder, self).default(obj)

def plot_clusters_pca(X, clusters, output_dir):
    try:
        pca = PCA(n_components=2)
        X_pca = pca.fit_transform(X)
        
        # Save JSON
        data = []
        for i in range(len(X_pca)):
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

def plot_correlation_matrix(X_train, feature_names, output_dir, top_features=None):
    try:
        X_numeric = X_train.select_dtypes(include=[np.number])
        valid_features = [f for f in feature_names if f in X_numeric.columns]
        if len(valid_features) < 2:
            return

        # Use only used features, cap at 50
        if top_features:
             feats_to_plot = [f for f in top_features if f in X_numeric.columns][:20]
        else:
             feats_to_plot = valid_features[:50]
             
        corr = X_numeric[feats_to_plot].corr()

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
        plt.title("Feature Correlation Matrix", y=1.02)
        plt.savefig(os.path.join(output_dir, "correlation_matrix.png"), bbox_inches='tight')
        plt.close()
    except Exception as e:
        print(f"Failed to plot correlation: {e}")

def plot_learning_curve(evals_result, metric_name, output_dir):
    try:
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
        
        df_imp_sorted = df_imp.sort_values('importance', ascending=False)
        imp_data = df_imp_sorted.to_dict(orient='records')
        with open(os.path.join(output_dir, "feature_importance.json"), "w") as f:
            json.dump(imp_data, f, cls=NumpyEncoder)

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
        # Check if X_val contains object/category columns. SHAP TreeExplainer might fail on raw categories?
        # LGBM handles them, but SHAP uses the model.
        # But SHAP might need encoding or numeric. 
        # For safety in plotting, we might need to rely on LGBM's handling.
        # If issues arise, we can wrap or skip.
        if len(X_val) > 1000:
            X_shap = X_val.sample(1000, random_state=42)
        else:
            X_shap = X_val  
        explainer = shap.TreeExplainer(bst)
        shap_values = explainer.shap_values(X_shap)
        plt.figure()
        # Handle multiclass list output
        shap_vals_to_plot = shap_values[1] if isinstance(shap_values, list) and len(shap_values) > 1 else shap_values   
        shap.summary_plot(shap_vals_to_plot, X_shap, show=False)
        plt.tight_layout()
        plt.savefig(os.path.join(output_dir, "shap_summary.png"))
        plt.close()
    except Exception as e:
        print(f"Failed to generate SHAP summary: {e}")

def plot_confusion_matrix(bst, X_val, y_val, output_dir):
    try:
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

def plot_actual_vs_predicted(y_true, y_pred, output_dir, objective):
    try:
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
