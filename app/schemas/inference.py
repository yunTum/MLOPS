from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime

# Simplified schemas to break circular dependencies and ensure proper nesting for UI

class DatasetSimple(BaseModel):
    name: str
    class Config:
        from_attributes = True

class DatasetVersionSimple(BaseModel):
    dataset: Optional[DatasetSimple] = None
    class Config:
        from_attributes = True

class FeatureSetSimple(BaseModel):
    id: int
    name: Optional[str] = None
    version: Optional[str] = None
    dataset_version: Optional[DatasetVersionSimple] = None
    class Config:
        from_attributes = True

class InferenceDatasetBase(BaseModel):
    name: str

class InferenceDatasetCreate(InferenceDatasetBase):
    feature_set_id: int

class InferenceDataset(InferenceDatasetBase):
    id: int
    path: str
    feature_set_id: Optional[int] = None
    created_at: datetime
    
    feature_set: Optional[FeatureSetSimple] = None

    class Config:
        from_attributes = True
