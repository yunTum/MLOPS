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

def predict_single(db, model_id: int, data: dict, skip_transform: bool = False):
    loaded_model, feature_names, feature_set, objective = _get_model_and_features(db, model_id)

    # Prepare Input
    # Construct DF first
    record = {k: [v] for k, v in data.items()}
    df = pd.DataFrame.from_dict(record)

    # Auto-Transform
    if not skip_transform and feature_set and feature_set.path:
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

def predict_batch(db, model_id: int, df: pd.DataFrame, skip_transform: bool = False):
    loaded_model, feature_names, feature_set, objective = _get_model_and_features(db, model_id)

    # Auto-Transform
    if not skip_transform and feature_set and feature_set.path:
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

def prepare_input(model, df: pd.DataFrame, feature_names: list, objective: str):
    """
    Prepares the input DataFrame for prediction:
    - Aligns columns with model features
    - Applies category mapping/encodings
    - Handles defaults and type conversions
    - Returns the final X (DataFrame or Numpy Array) ready for model.predict()
    """
    # Trust the model's feature names if available (Booster)
    model_features = []
    categorical_feats = []
    cat_indices = []
    pandas_cats = []
    
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
            
            # Retrieve pandas_categorical mapping if available
            pandas_cats = model_dump.get('pandas_categorical', [])
            
            # Map Feature Name -> List of Categories
            cat_mapping = {}
            
            if cat_indices:
                for idx, feature_name in enumerate(categorical_feats):
                     if idx < len(pandas_cats):
                         cat_mapping[feature_name] = pandas_cats[idx]
            elif pandas_cats:
                 pass
        except Exception as e:
            # Fallback
            model_features = feature_names

    # Check for missing features
    missing = [f for f in model_features if f not in df.columns]
    if missing:
        raise ValueError(f"Missing features for prediction: {missing}")

    # Create inference dataframe with correct columns
    X = df[model_features].copy()

    # Init cat_mapping for sklearn or fallback
    if 'cat_mapping' not in locals():
         cat_mapping = {}
         
    # HEURISTIC: If cat_indices was empty but we have pandas_cats, try to match to object columns in X
    if not cat_indices and pandas_cats:
         # Find object columns in X
         obj_cols = [c for c in X.columns if X[c].dtype == 'object' or isinstance(X[c].dtype, pd.CategoricalDtype)]
         
         if len(obj_cols) == len(pandas_cats):
             for i, col in enumerate(obj_cols):
                 cat_mapping[col] = pandas_cats[i]
                 # Also add to categorical_feats list so loop below treats them
                 if col not in categorical_feats:
                      categorical_feats.append(col)
         
    # Apply type enforcement securely
    for col in model_features:
        if col in categorical_feats:
            if col in cat_mapping:
                 cats = cat_mapping[col]
                 
                 # 1. Normalize Cats (if string)
                 if cats and isinstance(cats[0], str):
                      import unicodedata
                      cats = [unicodedata.normalize('NFKC', str(c)).strip() for c in cats]
                 
                 # 2. Normalize X (if string/object)
                 if X[col].dtype == 'object':
                      import unicodedata
                      X[col] = X[col].astype(str).apply(lambda x: unicodedata.normalize('NFKC', x).strip())
                 
                 # ordered=False usually for LGBM unless specified
                 X[col] = X[col].astype(pd.CategoricalDtype(categories=cats))
                 
                # CRITICAL: Model expects numeric input (categorical_feature=[]), so we must pass codes.
                 X[col] = X[col].cat.codes
                 
            else:
                 X[col] = X[col].astype('category')
                 # Also convert default cats to codes?
                 X[col] = X[col].cat.codes
        else:
            # Try numeric first
            series_numeric = pd.to_numeric(X[col], errors='coerce')
            
            # If we lost data (NaNs) where there was valid data before, and it's object type
            # It likely means it's a categorical string feature that wasn't tagged in categorical_feats
            if series_numeric.isna().sum() > X[col].isna().sum() and (X[col].dtype == 'object' or isinstance(X[col].dtype, pd.CategoricalDtype)):
                 X[col] = X[col].astype('category')
            else:
                 X[col] = series_numeric
    
    
    # Bypass LightGBM pandas check if no categoricals are expected
    if not is_sklearn and not categorical_feats:
         # Check dynamic categories
         has_cats = any(isinstance(X[c].dtype, pd.CategoricalDtype) for c in X.columns)
         if has_cats:
             pass # Keep as DF
         else:
             X = X.values
    
    # CRITICAL FALLBACK:
    if 'cat_mapping' in locals() and cat_mapping and not cat_indices:
         if isinstance(X, pd.DataFrame):
              X = X.values
              
    return X


def _run_prediction(model, df: pd.DataFrame, feature_names: list, objective: str):
    X = prepare_input(model, df, feature_names, objective)
    
    try:
        pred = model.predict(X)
        return pred.tolist() if isinstance(pred, np.ndarray) else pred
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise ValueError(f"Model prediction failed: {e}. Input shape: {X.shape}")

