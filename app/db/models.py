from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, Boolean, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base

class Dataset(Base):
    __tablename__ = "mlops_datasets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    description = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    versions = relationship("DatasetVersion", back_populates="dataset")

class DatasetVersion(Base):
    __tablename__ = "mlops_dataset_versions"

    id = Column(Integer, primary_key=True, index=True)
    dataset_id = Column(Integer, ForeignKey("mlops_datasets.id"))
    version = Column(String, index=True) # e.g., v1, v2
    path = Column(String) # Path to Parquet file
    schema_info = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    dataset = relationship("Dataset", back_populates="versions")
    feature_sets = relationship("FeatureSet", back_populates="dataset_version")

class FeatureDefinition(Base):
    __tablename__ = "mlops_feature_definitions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    description = Column(String, nullable=True)
    expression = Column(String) # definition DSL or config
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class FeatureSet(Base):
    __tablename__ = "mlops_feature_sets"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=True)
    description = Column(String, nullable=True)
    dataset_version_id = Column(Integer, ForeignKey("mlops_dataset_versions.id"), nullable=True)
    version = Column(String, nullable=True)
    path = Column(String, nullable=True) # Path to Parquet (features)
    transformations = Column(JSON, nullable=True)
    active_features = Column(JSON, nullable=True) # List of selected feature names
    target_column = Column(String, nullable=True) # Default target column name
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    dataset_version = relationship("DatasetVersion", back_populates="feature_sets")
    models = relationship("Model", back_populates="feature_set")

class Model(Base):
    __tablename__ = "mlops_models"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    feature_set_id = Column(Integer, ForeignKey("mlops_feature_sets.id"))
    mlflow_run_id = Column(String, index=True)
    stage = Column(String, default="dev") # dev, staging, prod
    metrics = Column(JSON, nullable=True)
    feature_names = Column(JSON, nullable=True) # List of feature names used
    target_column = Column(String, nullable=True)
    parameters = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    feature_set = relationship("FeatureSet", back_populates="models")

class InferenceDataset(Base):
    __tablename__ = "mlops_inference_datasets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    path = Column(String) # Path to Parquet (processed)
    feature_set_id = Column(Integer, ForeignKey("mlops_feature_sets.id"), nullable=True) # Optional link to source FS
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    feature_set = relationship("FeatureSet")

class Task(Base):
    __tablename__ = "mlops_tasks"

    id = Column(String, primary_key=True, index=True) # UUID
    name = Column(String)
    task_type = Column(String) # TRAINING, ANALYSIS, etc.
    status = Column(String, default="pending") # pending, running, completed, failed
    progress = Column(Integer, default=0)
    details = Column(JSON, nullable=True) # Params or metadata
    result = Column(JSON, nullable=True) # Output or error message
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

