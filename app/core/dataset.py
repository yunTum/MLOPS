import os
import pandas as pd
from sqlalchemy.orm import Session
from app.db import models
from app.schemas import dataset as schemas
from app.core import storage
import uuid

DATA_ROOT = "data/datasets"

def get_dataset_by_name(db: Session, name: str):
    return db.query(models.Dataset).filter(models.Dataset.name == name).first()

def create_dataset(db: Session, dataset: schemas.DatasetCreate):
    db_dataset = models.Dataset(name=dataset.name, description=dataset.description)
    db.add(db_dataset)
    db.commit()
    db.refresh(db_dataset)
    return db_dataset

def create_dataset_version(db: Session, dataset_id: int, df: pd.DataFrame, version_tag: str = None):
    # 1. Determine version
    # If version_tag is not provided, increment or use timestamp/UUID
    if not version_tag:
        version_tag = f"v_{uuid.uuid4().hex[:8]}"

    # 2. Save file
    # data/datasets/{dataset_id}/{version_tag}.parquet
    dataset = db.query(models.Dataset).filter(models.Dataset.id == dataset_id).first()
    if not dataset:
        raise ValueError("Dataset not found")
        
    save_path = f"{DATA_ROOT}/{dataset.name}/{version_tag}.parquet"
    full_path = os.path.abspath(save_path)
    
    storage.save_dataframe_to_parquet(df, full_path)
    
    # 3. Get Schema Info
    schema_info = df.dtypes.astype(str).to_dict()
    
    # 4. Save to DB
    db_version = models.DatasetVersion(
        dataset_id=dataset_id,
        version=version_tag,
        path=full_path,
        schema_info=schema_info
    )
    db.add(db_version)
    db.commit()
    db.refresh(db_version)
    return db_version

def create_dataset_version_from_chunks(db: Session, dataset_id: int, chunks_iterator, version_tag: str = None):
    # 1. Determine version
    if not version_tag:
        version_tag = f"v_{uuid.uuid4().hex[:8]}"

    # 2. Prepare path
    dataset = db.query(models.Dataset).filter(models.Dataset.id == dataset_id).first()
    if not dataset:
        raise ValueError("Dataset not found")
        
    save_path = f"{DATA_ROOT}/{dataset.name}/{version_tag}.parquet"
    full_path = os.path.abspath(save_path)
    
    # 3. Save chunks and capture schema from first chunk (wrapper)
    # We need to peek at the first chunk to get schema info, then yield it back
    
    first_chunk_schema = {}
    
    def peek_and_save(iterator):
        nonlocal first_chunk_schema
        for i, chunk in enumerate(iterator):
            if i == 0:
                first_chunk_schema = chunk.dtypes.astype(str).to_dict()
            yield chunk

    storage.save_chunks_to_parquet(peek_and_save(chunks_iterator), full_path)
    
    if not os.path.exists(full_path):
        raise RuntimeError("Failed to save dataset version: No data processed or file not created.")

    # 4. Save to DB
    db_version = models.DatasetVersion(
        dataset_id=dataset_id,
        version=version_tag,
        path=full_path,
        schema_info=first_chunk_schema
    )
    db.add(db_version)
    db.commit()
    db.refresh(db_version)
    return db_version

def get_latest_version(db: Session, dataset_id: int):
    return db.query(models.DatasetVersion).filter(
        models.DatasetVersion.dataset_id == dataset_id
    ).order_by(models.DatasetVersion.created_at.desc()).first()

def check_quality(df: pd.DataFrame) -> dict:
    """
    Basic quality checks.
    """
    return {
        "rows": len(df),
        "columns": len(df.columns),
        "missing_values": df.isnull().sum().to_dict(),
        "duplicates": df.duplicated().sum()
    }

def get_dataset_versions(db: Session, dataset_id: int):
    return db.query(models.DatasetVersion).filter(models.DatasetVersion.dataset_id == dataset_id).all()

def update_version_schema(db: Session, version_id: int, new_schema: dict):
    """
    Apply type casting based on new_schema and save as new version.
    Optimized for large files using streaming processing.
    """
    import pyarrow.parquet as pq
    import pyarrow as pa
    
    # 1. Load original
    original_version = db.query(models.DatasetVersion).filter(models.DatasetVersion.id == version_id).first()
    if not original_version:
        raise ValueError("Version not found")
        
    # 2. Prepare new version tag
    tag = original_version.version
    if "_typed" not in tag:
        new_tag = f"{tag}_typed"
    else:
        # Avoid _typed_typed...
        base = tag.split("_typed")[0]
        new_tag = f"{base}_typed_{uuid.uuid4().hex[:4]}"
        
    # 3. Create generator to process chunks
    def process_batches():
        parquet_file = pq.ParquetFile(original_version.path)
        # Iterate over row groups or batches
        for batch in parquet_file.iter_batches(batch_size=10000):
            df = batch.to_pandas()
            
            # Apply types
            for col, dtype in new_schema.items():
                if col in df.columns:
                    try:
                        if dtype == 'datetime':
                            df[col] = pd.to_datetime(df[col], errors='coerce')
                        elif dtype == 'string':
                             df[col] = df[col].astype(str)
                        elif dtype == 'int':
                             df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0).astype(int)
                        elif dtype == 'float':
                             df[col] = pd.to_numeric(df[col], errors='coerce')
                        else:
                            df[col] = df[col].astype(dtype)
                    except Exception as e:
                        print(f"Failed to cast {col} to {dtype}: {e}")
            yield df

    # 4. Save new version from chunks
    return create_dataset_version_from_chunks(db, original_version.dataset_id, process_batches(), version_tag=new_tag)

def detect_schema_types(db: Session, version_id: int) -> dict:
    """
    Guess types for a dataset version.
    Optimized to peek only top 1000 rows.
    """
    version = db.query(models.DatasetVersion).filter(models.DatasetVersion.id == version_id).first()
    if not version:
        raise ValueError("Version not found")
        
    # Optimize: Read only sample
    df = storage.peek_parquet(version.path, n=1000)
    
    # Use pandas convert_dtypes to guess
    df_converted = df.convert_dtypes()
    
    schema_map = {}
    for col in df.columns:
        # check converted type
        series = df_converted[col]
        dt = str(series.dtype)
        
        if "int" in dt.lower():
            schema_map[col] = "int"
        elif "float" in dt.lower():
            schema_map[col] = "float"
        elif "datetime" in dt.lower():
            schema_map[col] = "datetime"
        else:
            schema_map[col] = "string"
            
    return schema_map
            
def get_dataset_preview(db: Session, version_id: int, limit: int = 5) -> dict:
    """
    Get a preview of the dataset version (first n rows).
    """
    version = db.query(models.DatasetVersion).filter(models.DatasetVersion.id == version_id).first()
    if not version:
        raise ValueError("Version not found")
        
    df = storage.peek_parquet(version.path, n=limit)
    
    # JSON serialization safety
    # Replace NaN with None
    df = df.where(pd.notnull(df), None)
    
    # Convert dates/timestamps to string
    # Try generic conversion for object columns that might contain non-serializable objects
    for col in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[col]):
             df[col] = df[col].astype(str)
             
    return df.to_dict(orient='list')

def delete_dataset_version(db: Session, version_id: int):
    # 1. Fetch
    version = db.query(models.DatasetVersion).filter(models.DatasetVersion.id == version_id).first()
    if not version:
        raise ValueError("Version not found")
        
    # 2. Check dependencies (Optional but good practice)
    # Check if any FeatureSets use this version
    features = db.query(models.FeatureSet).filter(models.FeatureSet.dataset_version_id == version_id).all()
    if features:
        raise ValueError(f"Cannot delete version. Used by {len(features)} feature sets.")

    # 3. Delete File
    if version.path and os.path.exists(version.path):
        try:
            os.remove(version.path)
        except Exception as e:
            print(f"Warning: Failed to delete file at {version.path}. {e}")
            
    # 4. Delete Record
    db.delete(version)
    db.commit()
    return True

