from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime

class TaskBase(BaseModel):
    name: str
    task_type: str

class TaskCreate(TaskBase):
    id: str # We generate UUID on creation or let DB do it? Better pass it from API to Worker.
    details: Optional[Any] = None

class TaskUpdate(BaseModel):
    status: Optional[str] = None
    progress: Optional[int] = None
    result: Optional[Any] = None
    error: Optional[str] = None

class Task(TaskBase):
    id: str
    status: str
    progress: int
    details: Optional[Any]
    result: Optional[Any]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True
