from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.schemas import feature as schemas
from app.core import feature_store as core_features
from typing import List, Dict, Any
import uuid
import pandas as pd

router = APIRouter()

@router.post("/sets", response_model=schemas.FeatureSet, status_code=202)
async def create_feature_set(
    config: schemas.FeatureSetCreate, 
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    from app.core.config import get_settings
    settings = get_settings()

    # For MVP, running synchronously or background task.
    # Ideally send to RQ.
    # We will try synchronous for simplicity unless heavy.
    try:
        if settings.USE_LOCAL_SERVICES:
            # Sync execution
            fs, _ = core_features.create_feature_set(db, config)
            return fs
        else:
             # TODO: Offload to RQ in future or use BackgroundTasks
             # For now we stick to inline even for external mode in this MVP step
             # unless RQ is fully wired in endpoints.
             # We effectively do sync for both now, but preparing logic.
             fs, _ = core_features.create_feature_set(db, config)
             return fs
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=f"Source data file not found: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/sets/{id}", response_model=schemas.FeatureSet)
def update_feature_set(id: int, config: schemas.FeatureSetUpdate, db: Session = Depends(get_db)):
    try:
        fs, _ = core_features.update_feature_set(db, id, config)
        return fs
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/sets/{id}")
def delete_feature_set(id: int, db: Session = Depends(get_db)):
    try:
        core_features.delete_feature_set(db, id)
        return {"status": "success"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/sets/{id}/columns/delete")
def delete_feature_columns(
    id: int, 
    request: schemas.DeleteColumnsRequest, 
    db: Session = Depends(get_db)
):
    columns = request.columns
    from app.core import storage
    fs = core_features.get_feature_set(db, id)
    if not fs:
        raise HTTPException(status_code=404, detail="Feature Set not found")
        
    path = fs.path
    if not os.path.exists(path):
         raise HTTPException(status_code=404, detail="Feature Set file not found")
         
    try:
        # Load
        df = storage.load_parquet_to_dataframe(path)
        
        # Drop
        cols_to_drop = [c for c in columns if c in df.columns]
        if not cols_to_drop:
             return {"message": "No columns to drop found", "columns": df.columns.tolist()}
             
        df = df.drop(columns=cols_to_drop)
        
        # Save (Overwrite)
        storage.save_dataframe_to_parquet(df, path)
        
        return {"status": "success", "deleted": cols_to_drop, "remaining_columns": df.columns.tolist()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sets/{id}", response_model=schemas.FeatureSet)
def get_feature_set(id: int, db: Session = Depends(get_db)):
    fs = core_features.get_feature_set(db, id)
    if not fs:
        raise HTTPException(status_code=404, detail="Feature Set not found")
    return fs

@router.get("/sets", response_model=List[schemas.FeatureSet])
def list_feature_sets(db: Session = Depends(get_db)):
    return core_features.get_feature_sets(db)

@router.post("/analyze", response_model=List[schemas.FeatureAnalysisResult])
def analyze_features(
    request: schemas.FeatureAnalysisRequest,
    db: Session = Depends(get_db)
):
    from app.core import analysis, storage
    from app.db import models
    
    # Load data
    path = None
    if request.feature_set_id:
        fs = core_features.get_feature_set(db, request.feature_set_id)
        if not fs:
            raise HTTPException(status_code=444, detail="Feature Set not found")
        path = fs.path
    elif request.dataset_version_id:
        ds_version = db.query(models.DatasetVersion).filter(models.DatasetVersion.id == request.dataset_version_id).first()
        if not ds_version:
            raise HTTPException(status_code=404, detail="Dataset version not found")
        path = ds_version.path
    else:
        raise HTTPException(status_code=400, detail="Must provide either dataset_version_id or feature_set_id")

    df = storage.load_parquet_to_dataframe(path)

    # Filter columns if requested
    if request.features:
        # Ensure target is included
        cols_to_use = list(set(request.features + [request.target_col]))
        # Check existence
        missing = [c for c in cols_to_use if c not in df.columns]
        if missing:
             raise HTTPException(status_code=400, detail=f"Columns not found: {missing}")
        df = df[cols_to_use]
    
    # Calculate relevance
    try:
        # Sampling to prevent OOM on large datasets
        if len(df) > 10000:
            df = df.sample(n=10000, random_state=42)
            
        relevance = analysis.calculate_relevance(df, request.target_col, request.task_type)
        leaks = analysis.detect_leakage(relevance)
        
        results = []
        for feat in relevance.index:
            row = relevance.loc[feat]
            results.append(schemas.FeatureAnalysisResult(
                feature=feat,
                pearson=row.get("pearson"),
                spearman=row.get("spearman"),
                mutual_info=row.get("mutual_info"),
                is_leak=(feat in leaks)
            ))
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/auto-generate", response_model=Dict[str, Any])
def auto_generate_features(
    request: schemas.AutoGenerateRequest,
    db: Session = Depends(get_db)
):
    from app.core import feature_store
    import uuid
    import os
    
    # Verify inputs
    if not request.dataset_version_id and not request.feature_set_id:
        raise HTTPException(status_code=400, detail="Must provide dataset_version_id or feature_set_id")

    # Determine Base
    if request.feature_set_id:
        existing_fs = core_features.get_feature_set(db, request.feature_set_id)
        if not existing_fs:
             raise HTTPException(status_code=404, detail="Feature Set not found")
        base_version_id = existing_fs.dataset_version_id
        # COPY the list to ensure SQLAlchemy detects the change (new object reference)
        transformations = list(existing_fs.transformations) if existing_fs.transformations else []
        name = existing_fs.name
        description = existing_fs.description
    else:
        existing_fs = None
        base_version_id = request.dataset_version_id
        transformations = []
        name = "Auto Generated Features"
        description = "Features generated automatically"

    # Create Auto-Gen Transformation Step
    method = request.generation_method
    
    new_step = {
        "id": f"autogen_{uuid.uuid4().hex[:8]}",
        "op": "auto_gen",
        "method": method,
        "source_columns": request.source_columns,
        "target_column": request.target_column,
        "variance_threshold": request.variance_threshold,
        "correlation_threshold": request.correlation_threshold
    }
    
    transformations.append(new_step)
    
    # Config
    config = schemas.FeatureSetCreate(
        name=name or f"Auto Generated Features {uuid.uuid4().hex[:6]}",
        description=description or "Features generated automatically",
        dataset_version_id=base_version_id,
        transformations=transformations,
        version=existing_fs.version if existing_fs else None # Keep version tag if existing
    )
    
    try:
        if request.feature_set_id:
             updated_fs, all_columns = feature_store.update_feature_set(db, request.feature_set_id, config)
        else:
             updated_fs, all_columns = feature_store.create_feature_set(db, config)
        
        # The response_model is schemas.FeatureSet, but the instruction implies a dict return.
        # Assuming the instruction wants to change the *return value* to a dict,
        # and the response_model annotation might need adjustment or this is an internal detail.
        # For now, I'll return the dict as requested by the instruction.
        return {
            "status": "success",
            "feature_set_id": updated_fs.id,
            "message": f"Generated features using {request.generation_method}",
            "columns": all_columns,
            "new_feature_count": len(all_columns)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")

@router.get("/sets/{id}/preview")
def preview_feature_set(id: int, limit: int = 20, db: Session = Depends(get_db)):
    from app.core import storage
    fs = core_features.get_feature_set(db, id)
    if not fs:
        raise HTTPException(status_code=404, detail="Feature Set not found")
    
    import os
    
    path = fs.path
    if not os.path.exists(path):
        # Fallback for Windows-created paths running in Docker
        # We assume the structure is standard: .../data/features/...
        # And in Docker, valid path is relative data/features/... or /app/data/features/...
        
        # Normalize separators
        norm_path = path.replace("\\", "/")
        
        if "data/features" in norm_path:
            # Extract everything after data/features
            # Split by 'data/features' and take the last part
            parts = norm_path.split("data/features")
            if len(parts) > 1:
                rel_part = parts[-1].lstrip("/")
                # Try relative to CWD (which is /app in Docker)
                candidate = f"data/features/{rel_part}"
                if os.path.exists(candidate):
                    path = candidate
                    print(f"DEBUG: Path fixed to {path}")
                else:
                    print(f"DEBUG: Candidate path {candidate} not found")
            
    try:
        # Use storage helper to read first N rows
        print(f"DEBUG: Previewing feature set {id} at path: {path}")
        df_head = storage.peek_parquet(path, n=limit)
        
        # Convert to dict for JSON
        # Records format: [{"col1": val, "col2": val}, ...]
        data = df_head.to_dict(orient="records")
        
        # Strict sanitization loop (safe for small N=20)
        def clean_val(x):
            if isinstance(x, float):
                import math
                if math.isnan(x) or math.isinf(x):
                    return None
            return x

        cleaned_data = []
        for row in data:
            cleaned_row = {k: clean_val(v) for k, v in row.items()}
            cleaned_data.append(cleaned_row)
            
        return {"data": cleaned_data}
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"ERROR: Failed to preview feature set {id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to read feature set preview: {str(e)}")

