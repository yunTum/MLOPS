from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

class DatasetBase(BaseModel):
    name: str
    description: Optional[str] = None

class DatasetCreate(DatasetBase):
    pass

class Dataset(DatasetBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

class DatasetVersionBase(BaseModel):
    version: str
    schema_info: Optional[Dict[str, Any]] = None

class DatasetVersionCreate(DatasetVersionBase):
    dataset_id: int
    # In a real app, file might be uploaded via MultiPart, 
    # but strictly speaking Pydantic schema here is for response/metadata
    pass

class DatasetVersion(DatasetVersionBase):
    id: int
    dataset_id: int
    path: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class DatasetSchemaUpdateRequest(BaseModel):
    schema_map: Dict[str, str] # col -> type (int, float, string, datetime)
