from pydantic import BaseModel, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime
import math

def clean_floats(obj: Any) -> Any:
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: clean_floats(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [clean_floats(v) for v in obj]
    return obj

class ModelBase(BaseModel):
    name: str

class ModelTrainRequest(BaseModel):
    feature_set_id: int
    target_col: Optional[str] = None
    params: Dict[str, Any] = {"objective": "regression", "metric": "rmse"}
    experiment_name: Optional[str] = "Default"
    features: Optional[List[str]] = None
    optimize_hyperparameters: bool = False
    optimization_timeout: int = 600
    optimization_metric: str = "rmse"
    n_trials: int = 20

class Model(ModelBase):
    id: int
    feature_set_id: Optional[int] = None
    mlflow_run_id: str
    stage: str
    metrics: Optional[Dict[str, Any]] = None
    feature_names: Optional[List[str]] = None
    target_column: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None
    created_at: datetime
    
    @field_validator("metrics", "parameters", mode="before")
    @classmethod
    def sanitize_dict(cls, v):
        return clean_floats(v)

    class Config:
        from_attributes = True

class PredictionRequest(BaseModel):
    model_id: int
    data: List[Dict[str, Any]] # JSON payload for prediction dataframe

class PredictionResponse(BaseModel):
    predictions: List[float]

    @field_validator("predictions", mode="before")
    @classmethod
    def sanitize_list(cls, v):
        return clean_floats(v)
