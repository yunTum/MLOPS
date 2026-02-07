import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
from sqlalchemy.orm import Session
from app.db import models
from app.core import storage
from app.core.models.lightgbm import LightGBMTrainer
from app.core.models.clustering import ClusteringTrainer

def train_model(
    db: Session,
    feature_set_id: int,
    target_col: str,
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
    
    # 2. Add HPO params to main params dict if needed (since Trainer classes expect everything in params)
    if optimize_hyperparameters:
        params['optimize_hyperparameters'] = True
        params['optimization_timeout'] = optimization_timeout
        params['optimization_metric'] = optimization_metric
        params['n_trials'] = n_trials
    
    # 3. Select Trainer
    objective = params.get('objective', 'regression')
    
    if objective == 'clustering':
        trainer = ClusteringTrainer(db, feature_set_id, experiment_name, params, progress_callback)
    elif objective in ['regression', 'binary', 'multiclass', 'lambdarank']:
        trainer = LightGBMTrainer(db, feature_set_id, experiment_name, params, progress_callback)
    else:
        # Default to LightGBM or raise error?
        trainer = LightGBMTrainer(db, feature_set_id, experiment_name, params, progress_callback)
        
    # 4. Run
    # Run handles prepare_data, logging, training, saving to DB
    return trainer.run(df, target_col, features)

def preview_training_data(
    db: Session,
    feature_set_id: int,
    target_col: str,
    features: list,
    params: dict
):
    """
    Simulates the data loading and preprocessing steps of train_model
    and returns a preview of X (features) and y (target).
    """
    # Reuse LightGBMTrainer logic for consistency if possible?
    # Or keep it lightweight. 
    # Let's instantiate the trainer and ask for prepare_data?
    # But prepare_data returns split data. We want full X, y preview?
    # Usually preview wants the data BEFORE split logic (to see what features are included).
    # But `prepare_data` in new classes DOES split.
    # So we keep the lightweight logic here, duplicating checking logic slightly but safer for performance.
    
    fs = db.query(models.FeatureSet).filter(models.FeatureSet.id == feature_set_id).first()
    if not fs:
        raise ValueError("Feature set not found")
        
    df = storage.load_parquet_to_dataframe(fs.path)
    
    # Auto-convert types
    for col in df.columns:
        df[col] = pd.to_numeric(df[col], errors='ignore')
    
    objective = params.get('objective', 'regression')
    is_clustering = objective == 'clustering'
    
    if is_clustering:
        X = df
        if features and len(features) > 0:
            missing = [f for f in features if f not in X.columns]
            X = X[features]
        if target_col and target_col in X.columns:
             X = X.drop(columns=[target_col])
             
        X = X.select_dtypes(include=[np.number])
        X = X.fillna(0)
        y = None
    else:
        # Reg/Class
        for col in df.select_dtypes(include=['object']).columns:
            df[col] = df[col].astype('category')
        
        if not target_col or target_col not in df.columns:
              raise ValueError(f"Target column {target_col} not found in feature set")
            
        df = df.dropna(subset=[target_col])
        X = df.drop(columns=[target_col])
        
        group_col = params.get('group_column')
        
        if features and len(features) > 0:
            missing = [f for f in features if f not in X.columns]
            if missing:
                 raise ValueError(f"Requested features not found: {missing}")
            X = X[features]
                 
        # For Ranking, exclude group_col from X if it was selected
        if objective == 'lambdarank' and group_col and group_col in X.columns:
             X = X.drop(columns=[group_col])

        y = df[target_col]

    return X, y
