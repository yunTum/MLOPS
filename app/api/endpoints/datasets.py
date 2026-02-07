from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.schemas import dataset as schemas
from app.core import dataset as core_dataset
from typing import List
import pandas as pd
import io

router = APIRouter()

@router.post("", response_model=schemas.Dataset)
def create_dataset(dataset: schemas.DatasetCreate, db: Session = Depends(get_db)):
    db_dataset = core_dataset.get_dataset_by_name(db, dataset.name)
    if db_dataset:
        raise HTTPException(status_code=400, detail="Dataset already exists")
    return core_dataset.create_dataset(db, dataset)

@router.get("", response_model=List[schemas.Dataset])
def list_datasets(db: Session = Depends(get_db)):
    return db.query(core_dataset.models.Dataset).all()

@router.post("/{dataset_id}/upload", response_model=schemas.DatasetVersion)
async def upload_dataset_version(
    dataset_id: int, 
    file: UploadFile = File(...), 
    db: Session = Depends(get_db)
):
    print(f"DEBUG: Starting upload processing for dataset_id={dataset_id}, filename={file.filename}")
    # Determine file type and load
    # Use streaming to avoid OOM on large files
    try:
        if file.filename.endswith('.csv'):
            # Chunked processing for CSV
            chunk_size = 5000 # Increased from 1000 for better throughput, still safe
            # Force all columns to be strings to handle mixed types/clean later
            chunks = pd.read_csv(file.file, chunksize=chunk_size, dtype=str)
            
            # Note: Quality checks are skipped for chunked uploads in MVP 
            # or could be implemented incrementally.
            
            version = core_dataset.create_dataset_version_from_chunks(db, dataset_id, chunks)
            return version

        elif file.filename.endswith('.parquet'):
            # For Parquet, load fully for now (usually smaller/compressed)
            # Or could use pyarrow.parquet.ParquetFile for streaming if needed
            df = pd.read_parquet(file.file)
            params = core_dataset.check_quality(df) # Check quality for full load
            version = core_dataset.create_dataset_version(db, dataset_id, df)
            return version
            
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Use CSV or Parquet.")

    except Exception as parse_error:
        import traceback
        traceback.print_exc()
        print(f"UPLOAD ERROR: {str(parse_error)}")
        raise HTTPException(status_code=400, detail=f"Failed to process file: {str(parse_error)}")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{dataset_id}/versions", response_model=List[schemas.DatasetVersion])
def list_dataset_versions(dataset_id: int, db: Session = Depends(get_db)):
    versions = core_dataset.get_dataset_versions(db, dataset_id)
    return versions


@router.post("/{dataset_id}/versions/{version_id}/schema", response_model=schemas.DatasetVersion)
def update_schema(
    dataset_id: int, 
    version_id: int, 
    request: schemas.DatasetSchemaUpdateRequest,
    db: Session = Depends(get_db)
):
    try:
        return core_dataset.update_version_schema(db, version_id, request.schema_map)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{dataset_id}/versions/{version_id}/detect_schema")
def detect_schema(
    dataset_id: int, 
    version_id: int, 
    db: Session = Depends(get_db)
):
    try:
        return core_dataset.detect_schema_types(db, version_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{dataset_id}/versions/{version_id}/preview")
def get_version_preview(
    dataset_id: int, 
    version_id: int, 
    limit: int = 5,
    db: Session = Depends(get_db)
):
    try:
        return core_dataset.get_dataset_preview(db, version_id, limit)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{dataset_id}/versions/{version_id}/unique_values")
def get_version_unique_values(
    dataset_id: int, 
    version_id: int, 
    column: str,
    limit: int = 1000,
    db: Session = Depends(get_db)
):
    try:
        return core_dataset.get_unique_values(db, version_id, column, limit)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/versions/{version_id}")
def delete_version(version_id: int, db: Session = Depends(get_db)):
    try:
        core_dataset.delete_dataset_version(db, version_id)
        return {"status": "success"}
    except ValueError as e:
        if "Cannot delete" in str(e):
             raise HTTPException(status_code=400, detail=str(e))
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
