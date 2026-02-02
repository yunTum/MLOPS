import mlflow
import os
from app.core.config import get_settings

settings = get_settings()

def setup_mlflow_experiment(experiment_name: str, artifact_location: str = None):
    """
    Sets up the MLflow experiment.
    """
    if settings.USE_LOCAL_SERVICES:
        # Use local directory logic
        mlflow.set_tracking_uri("file:./mlruns")
        # Ensure experiment exists
        experiment = mlflow.get_experiment_by_name(experiment_name)
        if experiment is None:
             mlflow.create_experiment(experiment_name)
    else:
        mlflow.set_tracking_uri(settings.MLFLOW_TRACKING_URI)
        
        experiment = mlflow.get_experiment_by_name(experiment_name)
        if experiment is None:
            try:
                mlflow.create_experiment(experiment_name, artifact_location=artifact_location)
            except Exception as e:
                # Potentially race condition if multiple workers try to create
                print(f"Error creating experiment {experiment_name}: {e}")
                pass
    
    mlflow.set_experiment(experiment_name)
    return mlflow.get_experiment_by_name(experiment_name)

def log_params_to_mlflow(params: dict):
    mlflow.log_params(params)

def log_metrics_to_mlflow(metrics: dict):
    mlflow.log_metrics(metrics)
