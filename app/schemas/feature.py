from pydantic import BaseModel
from typing import Optional, List, Dict, Any, Union
from datetime import datetime

class FeatureDefinitionBase(BaseModel):
    name: str
    description: Optional[str] = None
    expression: Dict[str, Any] # JSON configuration for transformation

class FeatureDefinitionCreate(FeatureDefinitionBase):
    pass

class FeatureDefinition(FeatureDefinitionBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class FeatureSetBase(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    dataset_version_id: Optional[int] = None
    version: Optional[str] = None

class FeatureSetCreate(FeatureSetBase):
    # Overriding to allow creating with name/desc only
    name: str 
    description: Optional[str] = None
    dataset_version_id: Optional[int] = None
    version: Optional[str] = None
    transformations: Optional[List[Dict[str, Any]]] = None
    active_features: Optional[List[str]] = None
    target_column: Optional[str] = None

class FeatureSetUpdate(FeatureSetBase):
    name: Optional[str] = None
    description: Optional[str] = None
    dataset_version_id: Optional[int] = None
    version: Optional[str] = None
    transformations: Optional[List[Dict[str, Any]]] = None
    active_features: Optional[List[str]] = None
    target_column: Optional[str] = None


from .dataset import DatasetVersion

class FeatureSet(FeatureSetBase):
    id: int
    name: Optional[str] = None
    description: Optional[str] = None
    path: Optional[str] = None
    transformations: Optional[List[Dict[str, Any]]] = None
    active_features: Optional[List[str]] = None
    target_column: Optional[str] = None
    created_at: datetime
    dataset_version: Optional[DatasetVersion] = None
    
    class Config:
        from_attributes = True

class FeatureAnalysisRequest(BaseModel):
    dataset_version_id: Optional[int] = None
    feature_set_id: Optional[int] = None
    target_col: str
    features: Optional[List[str]] = None
    task_type: str = "regression" # regression or classification

class FeatureAnalysisResult(BaseModel):
    feature: str
    pearson: Optional[float] = None
    spearman: Optional[float] = None
    mutual_info: Optional[float] = None
    is_leak: bool = False

class AutoGenerateRequest(BaseModel):
    dataset_version_id: int
    feature_set_id: Optional[int] = None
    target_column: Optional[str] = None
    source_columns: Optional[List[str]] = None
    generation_method: str = "arithmetic" # arithmetic, featuretools
    variance_threshold: float = 0.0
    correlation_threshold: float = 0.95
    include_arithmetic: bool = True

class DeleteColumnsRequest(BaseModel):
    columns: List[str]
