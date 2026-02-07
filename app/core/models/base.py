from abc import ABC, abstractmethod
import mlflow
import pandas as pd
import numpy as np
import tempfile
import os
from datetime import datetime
from sqlalchemy.orm import Session
from app.db import models
from app.core import mlflow_utils

class BaseTrainer(ABC):
    def __init__(self, db: Session, feature_set_id: int, experiment_name: str, params: dict, progress_callback=None):
        self.db = db
        self.feature_set_id = feature_set_id
        self.experiment_name = experiment_name
        self.params = params
        self.progress_callback = progress_callback
        self.used_features = []
        self.target_col = None

    def run(self, df: pd.DataFrame, target_col: str = None, features: list = None):
        """
        Main execution method (Template Method Pattern).
        """
        self.target_col = target_col
        
        # 1. Prepare Data (Abstract) - Handling splits, filtering, etc.
        # Returns an internal data structure (tuple, dist, object) specific to the implementation
        data_bundle = self.prepare_data(df, target_col, features)
        
        # 2. Setup MLflow
        experiment = mlflow_utils.setup_mlflow_experiment(self.experiment_name)
        
        with mlflow.start_run(experiment_id=experiment.experiment_id) as run:
            # 3. Log Params
            mlflow_utils.log_params_to_mlflow(self.params)
            mlflow.log_param("feature_set_id", self.feature_set_id)
            mlflow.log_param("features_count", len(self.used_features))
            
            # 4. Train & Evaluate (Abstract)
            # Should return (model_object, metrics_dict, artifacts_dir_path)
            # Helper to create logs in a temp dir
            with tempfile.TemporaryDirectory() as tmp_dir:
                model, metrics = self.train_and_evaluate(data_bundle, tmp_dir)
                
                # 5. Log Metrics
                for k, v in metrics.items():
                    mlflow.log_metric(k, v)
                    
                # 6. Log Artifacts
                mlflow.log_artifacts(tmp_dir, artifact_path="plots")
                
                # 7. Log Model (Abstract - specific to sklearn/lgb)
                self.log_model_to_mlflow(model, "model")
                
                # 8. Save to DB
                db_model = self.save_to_db(run.info.run_id, metrics, model)
                
                return db_model

    @abstractmethod
    def prepare_data(self, df: pd.DataFrame, target_col: str, features: list):
        """Prepare data splits and return necessary data objects."""
        pass

    @abstractmethod
    def train_and_evaluate(self, data_bundle, output_dir: str):
        """Train model, calculate metrics, generate plots. Returns (model, metrics)."""
        pass
        
    @abstractmethod
    def log_model_to_mlflow(self, model, artifact_path: str):
        """Log the model object to MLflow using the appropriate flavor."""
        pass

    def save_to_db(self, run_id: str, metrics: dict, model):
        """Save metadata to Database."""
        db_model = models.Model(
            name=f"{self.get_model_prefix()}_{datetime.now().strftime('%Y%m%d%H%M%S')}",
            feature_set_id=self.feature_set_id,
            mlflow_run_id=run_id,
            stage="dev",
            metrics=metrics,
            feature_names=self.used_features,
            target_column=self.target_col,
            parameters=self.params 
        )
        self.db.add(db_model)
        self.db.commit()
        self.db.refresh(db_model)
        return db_model

    @abstractmethod
    def get_model_prefix(self) -> str:
        """Return prefix for model name in DB (e.g. 'lgbm', 'kmeans')."""
        pass
