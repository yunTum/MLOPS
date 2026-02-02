import mlflow
import pandas as pd
import numpy as np
from app.db import models

def _get_model_and_features(db, model_id: int):
    # 1. Fetch model record
    model_record = db.query(models.Model).filter(models.Model.id == model_id).first()
    if not model_record:
        raise ValueError(f"Model {model_id} not found")

    if not model_record.mlflow_run_id:
        raise ValueError(f"Model {model_id} has no associated MLflow Run ID")

    # 2. Load Model from MLflow
    model_uri = f"runs:/{model_record.mlflow_run_id}/model"
    try:
        # Check objective to determine loader
        params = model_record.parameters or {}
        objective = params.get('objective', 'regression')
        
        if objective == 'clustering':
            loaded_model = mlflow.sklearn.load_model(model_uri)
        else:
            loaded_model = mlflow.lightgbm.load_model(model_uri)
            
    except Exception as e:
        if "No such file or directory" in str(e):
             raise RuntimeError(f"Model artifact not found. This model may be corrupted. {e}")
        raise RuntimeError(f"Failed to load model ({objective}): {e}")
    
    return loaded_model, model_record.feature_names, model_record.feature_set, objective

def predict_single(db, model_id: int, data: dict):
    loaded_model, feature_names, feature_set, objective = _get_model_and_features(db, model_id)

    # Prepare Input
    # Construct DF first
    record = {k: [v] for k, v in data.items()}
    df = pd.DataFrame.from_dict(record)

    # Auto-Transform
    if feature_set and feature_set.path:
        import os
        import joblib
        from app.core import feature_store
        
        pkl_path = feature_set.path.replace(".parquet", ".pkl")
        if os.path.exists(pkl_path):
             try:
                 transformers = joblib.load(pkl_path)
                 df, _ = feature_store.apply_transformations(df, feature_set.transformations, fitted_transformers=transformers)
             except Exception as e:
                 print(f"Warning: Failed to apply transformations: {e}")

    if not feature_names:
         feature_names = df.columns.tolist()
    
    # Validation & Prediction
    return _run_prediction(loaded_model, df, feature_names, objective)[0]

def predict_batch(db, model_id: int, df: pd.DataFrame):
    loaded_model, feature_names, feature_set, objective = _get_model_and_features(db, model_id)

    # Auto-Transform
    if feature_set and feature_set.path:
        import os
        import joblib
        from app.core import feature_store
        
        pkl_path = feature_set.path.replace(".parquet", ".pkl")
        if os.path.exists(pkl_path):
             try:
                 transformers = joblib.load(pkl_path)
                 df, _ = feature_store.apply_transformations(df, feature_set.transformations, fitted_transformers=transformers)
             except Exception as e:
                 print(f"Warning: Failed to apply transformations: {e}")

    if not feature_names:
        # Fallback: use all columns in DF
        feature_names = df.columns.tolist()

    # Run Prediction
    predictions = _run_prediction(loaded_model, df, feature_names, objective)
    return predictions

def _run_prediction(model, df: pd.DataFrame, feature_names: list, objective: str):
    # Trust the model's feature names if available (Booster)
    model_features = []
    categorical_feats = []
    
    is_sklearn = objective == 'clustering' or hasattr(model, 'predict') and not hasattr(model, 'feature_name')

    if is_sklearn:
        # Sklearn models/pipelines expect specific feature order, assumed to match `feature_names` passed from DB
        model_features = feature_names
    else:
        # LightGBM
        try:
            model_features = model.feature_name()
            # Get categorical features from model dump
            model_dump = model.dump_model()
            cat_indices = model_dump.get('categorical_feature', [])
            categorical_feats = [model_features[i] for i in cat_indices]
        except Exception as e:
            print(f"DEBUG: Could not extract features from model: {e}")
            # Fallback
            model_features = feature_names

    # Check for missing features
    missing = [f for f in model_features if f not in df.columns]
    if missing:
        raise ValueError(f"Missing features for prediction: {missing}")

    # Create inference dataframe with correct columns
    X = df[model_features].copy()

    # Apply type enforcement securely
    for col in model_features:
        if col in categorical_feats:
            # Force to category
            X[col] = X[col].astype('category')
        else:
            # Force to numeric
            X[col] = pd.to_numeric(X[col], errors='coerce') 
    
    # Bypass LightGBM pandas check if no categoricals are expected
    if not is_sklearn and not categorical_feats:
        X = X.values
    
    # Predict
    try:
        pred = model.predict(X)
        return pred.tolist() if isinstance(pred, np.ndarray) else pred
    except Exception as e:
         import traceback
         traceback.print_exc()
         raise RuntimeError(f"Prediction failed: {e}")

