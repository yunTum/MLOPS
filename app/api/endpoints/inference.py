from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.core import predictor
from pydantic import BaseModel
from typing import Dict, Any, List
from app.schemas import inference as schemas
import pandas as pd
import numpy as np
import io
import joblib

router = APIRouter()

class PredictionRequest(BaseModel):
    model_id: int
    data: Dict[str, Any]

class PredictionResponse(BaseModel):
    model_id: int
    prediction: float

@router.post("/predict", response_model=PredictionResponse)
def predict(request: PredictionRequest, db: Session = Depends(get_db)):
    """
    Make a single prediction.
    """
    try:
        result = predictor.predict_single(db, request.model_id, request.data)
        return PredictionResponse(model_id=request.model_id, prediction=result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        print(f"Prediction Error: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error during prediction")

@router.post("/batch_predict")
async def batch_predict(
    model_id: int = Form(...),
    inference_dataset_id: int = Form(None), # Optional if we support direct upload still, but user wants persistence. Let's make it optional but primary.
    file: UploadFile = File(None), # Keep for backward compat or quick usage? Plan said "replace". Let's support both but prioritize ID.
    db: Session = Depends(get_db)
):
    """
    Make batch predictions.
    Supports either `inference_dataset_id` (stored) or `file` (upload).
    """
    
    try:
        df = None
        
        # 1. Load Data
        if inference_dataset_id:
            dataset = db.query(models.InferenceDataset).filter(models.InferenceDataset.id == inference_dataset_id).first()
            if not dataset:
                raise HTTPException(status_code=404, detail="Inference Dataset not found")
            try:
                # Load parquet
                df = pd.read_parquet(dataset.path)
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to load dataset file: {e}")
        
        elif file:
            if not file.filename.endswith('.csv'):
                raise HTTPException(status_code=400, detail="Only CSV files are supported for direct upload")
            contents = await file.read()
            df = pd.read_csv(io.StringIO(contents.decode('utf-8')))
        
        else:
            raise HTTPException(status_code=400, detail="Either inference_dataset_id or file must be provided")

        # 2. Predict
        skip_transform = False
        if inference_dataset_id:
             model_rec = db.query(models.Model).filter(models.Model.id == model_id).first()
             # dataset variable is available from Step 1 block if inference_dataset_id was True
             # We need to make sure 'dataset' is in scope.
             # In Step 1: if inference_dataset_id: dataset = ...
             # So it is available.
             if model_rec and dataset and model_rec.feature_set_id == dataset.feature_set_id:
                  print("DEBUG: Skipping transformation (Dataset already transformed)")
                  skip_transform = True

        predictions = predictor.predict_batch(db, model_id, df, skip_transform=skip_transform)
        
        # 3. Append predictions
        df['prediction'] = predictions
        
        # 3.5 Sanitize for JSON (Nan/Inf -> None)
        df = df.astype(object)
        df = df.where(pd.notnull(df), None)
        df = df.replace({np.inf: None, -np.inf: None, np.nan: None})

        # 4. Return as JSON records
        return df.to_dict(orient='records')
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        print(f"Batch Prediction Error: {e}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

from app.core import feature_store, storage
from app.db import models
import os
import uuid

@router.post("/prepare_data")
async def prepare_data(
    feature_set_id: int = Form(...),
    filter_latest: bool = Form(False),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Apply transformations and SAVE as InferenceDataset.
    Returns the created Dataset info.
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    # 1. Fetch Feature Set
    fs = feature_store.get_feature_set(db, feature_set_id)
    if not fs:
         raise HTTPException(status_code=404, detail="Feature Set not found")

    try:
        # 2. Load New CSV
        contents = await file.read()
        try:
            decoded = contents.decode('utf-8')
        except UnicodeDecodeError:
            try:
                decoded = contents.decode('cp932')
            except UnicodeDecodeError:
                # Fallback or fail
                decoded = contents.decode('shift_jis', errors='replace')
        
        df_new = pd.read_csv(io.StringIO(decoded))
        df_new['_is_inference'] = True # Marker

        # 2.1 Validate Required Columns
        # Extract required columns from transformations to ensure they exist in new data
        if fs.transformations:
            required_cols = set()
            for t in fs.transformations:
                # Check group_col (str or list)
                grp = t.get("group_col")
                if grp:
                    if isinstance(grp, list):
                        required_cols.update(grp)
                    else:
                        required_cols.add(grp)
                
                # Check arithmetic operands if they are columns
                if t.get("op") == "arithmetic" and t.get("operand_type") == "column":
                    if t.get("right_col"):
                        required_cols.add(t.get("right_col"))

            # Remove 'unknown' or intermediate columns check? 
            # Ideally we only check standard source columns. 
            # But we can check if missing from df_new
            missing = [c for c in required_cols if c not in df_new.columns]
            
            # NOTE: Some required cols might be created by valid intermediate steps. 
            # But group_col usually refers to source columns (ID, Venue, etc).
            # We can log a warning or error. For now, strict warning/error for Group Keys is good.
            if missing:
                msg = f"WARNING: Input data is missing columns used in transformations (e.g. Group Keys): {missing}. This may cause 'Zero History' and identical predictions."
                print(msg)
                # We could raise HTTPException to force user to fix it
                # raise HTTPException(status_code=400, detail=msg)
                # But let's print for now as intermediate steps might generate them (though unlikely for Group Keys).
                # Actually, for the User's specific issue, raising/logging is crucial.
                
                # Let's verify if they are strictly missing or just not generated yet.
                # If it's an ID or Venue, it MUST be in source.
                pass 

        # 2.5 Load History (Traiing Data) - DISABLED to prevent Leakage
        # User is responsible for providing necessary history in the upload file.
        df_combined = df_new
        
        # History loading logic removed at user request.
        # if fs.dataset_version_id and not filter_latest:
        #      # Load history only if we are NOT filtering (Use Case: Single row prediction needing DB history).
        #      # If filter_latest is True, we assume User provided history in the CSV and wants to avoid DB Leakage.
        #      ds_version = db.query(models.DatasetVersion).filter(models.DatasetVersion.id == fs.dataset_version_id).first()
        #      if ds_version and ds_version.path and os.path.exists(ds_version.path):
        #          try:
        #              print(f"DEBUG: Loading history from {ds_version.path}")
        #              df_history = storage.load_parquet_to_dataframe(ds_version.path)
        #              df_history['_is_inference'] = False
                     
        #              # Align Types: Cast new data to match history where possible
        #              for col in df_new.columns:
        #                  if col in df_history.columns:
        #                      target_dtype = df_history[col].dtype
        #                      if df_new[col].dtype != target_dtype:
        #                          try:
        #                              # Special handling for Int64 (nullable int) vs int64/float
        #                              if "int" in str(target_dtype).lower():
        #                                  df_new[col] = pd.to_numeric(df_new[col], errors='coerce').astype(target_dtype)
        #                              elif "float" in str(target_dtype).lower():
        #                                  df_new[col] = pd.to_numeric(df_new[col], errors='coerce').astype(target_dtype)
        #                              elif pd.api.types.is_datetime64_any_dtype(target_dtype) or "datetime" in str(target_dtype):
        #                                  # Handle "20260101" (int) -> "20260101" (str) -> datetime
        #                                  # If we just cast int to datetime directly, it thinks it is ns from epoch.
        #                                  df_new[col] = pd.to_datetime(df_new[col].astype(str), errors='coerce')
        #                              else:
        #                                  df_new[col] = df_new[col].astype(target_dtype)
        #                          except Exception as ex:
        #                              print(f"WARNING: Type alignment failed for {col}: {ex}")

        #              # Concat
        #              df_combined = pd.concat([df_history, df_new], axis=0, ignore_index=True)
        #              print(f"DEBUG: Combined History ({len(df_history)}) + New ({len(df_new)}) = {len(df_combined)}")
        #          except Exception as e:
        #              print(f"WARNING: Failed to load history for lag calculation: {e}")
        
        # 3. Apply Transformations on Combined Data
        # Check for fitted transformers (Stateful Scaling)
        fitted_transformers = None
        if fs.path:
            transformers_path = fs.path.replace(".parquet", ".pkl")
            if os.path.exists(transformers_path):
                try:
                    fitted_transformers = joblib.load(transformers_path)
                    print(f"DEBUG: Loaded fitted transformers from {transformers_path}")
                except Exception as e:
                    print(f"WARNING: Failed to load transformers: {e}")

        # Exclude 'filter' operations during inference
        # Users typically want predictions for ALL provided rows, even if training was limited to a subset (e.g. specific dates or venues).
        # We assume 'filter' is for Defining the Training Set, not for Data Cleaning (use clip/fillna for that).
        inference_transformations = [t for t in (fs.transformations or []) if t.get("op") != "filter"]
        
        df_processed_all, _ = feature_store.apply_transformations(
            df_combined, 
            inference_transformations, 
            fitted_transformers=fitted_transformers
        )
        
        # 3.2 Extract New Data Only
        if '_is_inference' in df_processed_all.columns:
            df_processed = df_processed_all[df_processed_all['_is_inference'] == True].copy()
            df_processed = df_processed.drop(columns=['_is_inference'])
        else:
            # Fallback if flag lost (shouldn't happen with our transforms logic unless op=auto_gen drops it)
            # If auto_gen drops it, we are in trouble.
            # Workaround: Use index or tail.
            # But let's assume it survives or we re-attach it if we lost it?
            # Safe bet: use tail.
            df_processed = df_processed_all.tail(len(df_new))
            print("WARNING: _is_inference flag missing, used tail()")
        
        # 3.5 Optional: Filter by Latest Date (for Time-Series Inference)
        if filter_latest:
            # Find sort_col from transformations
            sort_col = None
            for t in (fs.transformations or []):
                if t.get("sort_col"):
                    sort_col = t.get("sort_col")
                    break
            
            if sort_col and sort_col in df_processed.columns:
                print(f"DEBUG: Filtering by latest {sort_col} (Max value)")
                # Assume standard sort (date or numeric)
                max_val = df_processed[sort_col].max()
                df_processed = df_processed[df_processed[sort_col] == max_val]
                print(f"DEBUG: Filtered dataset shape: {df_processed.shape}")
            else:
                print(f"WARNING: filter_latest requested but no sort_col found or column missing.")

        # 4. Save to Disk (Parquet)
        dataset_name = f"inf_{file.filename.replace('.csv', '')}_{uuid.uuid4().hex[:6]}"
        save_dir = "data/inference"
        os.makedirs(save_dir, exist_ok=True)
        save_path = f"{save_dir}/{dataset_name}.parquet"
        full_path = os.path.abspath(save_path)
        
        df_processed.to_parquet(full_path, index=False)
        
        # 5. Save to DB
        new_ds = models.InferenceDataset(
            name=dataset_name,
            path=full_path,
            feature_set_id=feature_set_id
        )
        db.add(new_ds)
        db.commit()
        db.refresh(new_ds)
        
        return {
            "id": new_ds.id,
            "name": new_ds.name,
            "created_at": new_ds.created_at
        }

    except Exception as e:
        print(f"Data Preparation Error: {e}")
        raise HTTPException(status_code=500, detail=f"Data Preparation Failed: {str(e)}")

from sqlalchemy.orm import joinedload

@router.get("/datasets", response_model=List[schemas.InferenceDataset])
def list_inference_datasets(db: Session = Depends(get_db)):
    """List all saved inference datasets."""
    return db.query(models.InferenceDataset).options(
        joinedload(models.InferenceDataset.feature_set)
        .joinedload(models.FeatureSet.dataset_version)
        .joinedload(models.DatasetVersion.dataset)
    ).order_by(models.InferenceDataset.created_at.desc()).all()
@router.delete("/datasets/{id}")
def delete_inference_dataset(id: int, db: Session = Depends(get_db)):
    """Delete an inference dataset."""
    dataset = db.query(models.InferenceDataset).filter(models.InferenceDataset.id == id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    # Delete file
    if dataset.path and os.path.exists(dataset.path):
        try:
            os.remove(dataset.path)
        except Exception as e:
            print(f"Warning: Failed to delete file at {dataset.path}: {e}")
            
    db.delete(dataset)
    db.commit()
    return {"status": "success"}

@router.get("/datasets/{id}/preview")
def preview_inference_dataset(
    id: int, 
    limit: int = 20, 
    columns: str = None, # Comma separated for GET simplicity or use Query(None) for list
    db: Session = Depends(get_db)
):
    """
    Preview metadata and rows of the inference dataset.
    limit: Number of rows (default 20). If < 0, returns all rows.
    columns: Comma-separated list of columns to include.
    """
    dataset = db.query(models.InferenceDataset).filter(models.InferenceDataset.id == id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
        
    if not dataset.path or not os.path.exists(dataset.path):
         raise HTTPException(status_code=404, detail="Dataset file not found")
         
    try:
        # Load full or subset? Parquet supports reading specific columns
        requested_cols = columns.split(",") if columns else None
        if requested_cols:
            requested_cols = [c.strip() for c in requested_cols if c.strip()]
            
        df = pd.read_parquet(dataset.path, columns=requested_cols)
        
        # Limit rows
        if limit is not None and limit >= 0:
            df_preview = df.head(limit)
        else:
            df_preview = df
            
        # Robust cleanup for JSON serialization
        # Convert all to object to ensure we can hold None
        df_preview = df_preview.astype(object)
        df_preview = df_preview.replace({
            np.inf: None, 
            -np.inf: None,
            np.nan: None
        })
        df_preview = df_preview.where(pd.notnull(df_preview), None)
        
        # Identify Created Features (Difference between Inference Columns and Source Dataset Columns)
        created_features = []
        if dataset.feature_set and dataset.feature_set.dataset_version:
            try:
                # Load source columns (lightweight)
                ds_path = dataset.feature_set.dataset_version.path
                if ds_path and os.path.exists(ds_path):
                     source_df = pd.read_parquet(ds_path, columns=[]) # Reading empty columns usually gives just index or minimal, but we need columns list.
                     # Actually to get columns efficiently without reading all data:
                     # pd.read_parquet(..., columns=[]) might still check schema.
                     # Better: use pyarrow.parquet if available, or just read 0 rows?
                     # source_cols = pd.read_parquet(ds_path).columns.tolist() # Might be slow if huge.
                     # Schema only read:
                     import pyarrow.parquet as pq
                     source_cols = pq.read_schema(ds_path).names
                     
                     all_current_cols = pd.read_parquet(dataset.path).columns.tolist() if requested_cols else df.columns.tolist()
                     created_features = list(set(all_current_cols) - set(source_cols))
            except Exception as ex:
                print(f"Warning: Failed to identify created features: {ex}")

        return {
            "id": dataset.id,
            "name": dataset.name,
            "path": dataset.path,
            "columns": df.columns.tolist(), # Returned columns
            "all_columns": pd.read_parquet(dataset.path).columns.tolist() if requested_cols else df.columns.tolist(), 
            "created_features": created_features,
            "shape": df_preview.shape, 
            "total_shape": df.shape, # To be accurate regarding columns, this is shape of loaded frame
            "data": df_preview.to_dict(orient="records")
        }
    except Exception as e:
        print(f"Error previewing dataset: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to read dataset: {e}")
@router.post("/preview_input")
async def preview_model_input(
    model_id: int = Form(...),
    inference_dataset_id: int = Form(None),
    file: UploadFile = File(None),
    db: Session = Depends(get_db)
):
    """
    Preview the exact data that will be passed to the model for inference.
    Includes all transformations, encoding, and type coercion.
    """
    try:
        df = None
        
        # 1. Load Data
        if inference_dataset_id:
            dataset = db.query(models.InferenceDataset).filter(models.InferenceDataset.id == inference_dataset_id).first()
            if not dataset:
                raise HTTPException(status_code=404, detail="Inference Dataset not found")
            try:
                # Load parquet
                df = pd.read_parquet(dataset.path)
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to load dataset file: {e}")
        
        elif file:
            if not file.filename.endswith('.csv'):
                raise HTTPException(status_code=400, detail="Only CSV files are supported for direct upload")
            contents = await file.read()
            df = pd.read_csv(io.StringIO(contents.decode('utf-8')))
        
        else:
            raise HTTPException(status_code=400, detail="Either inference_dataset_id or file must be provided")

        # 2. Get Model & Features
        # We need raw access to model object for prepare_input
        loaded_model, feature_names, feature_set, objective = predictor._get_model_and_features(db, model_id)

        # 3. Apply Feature Set Transformations (Auto-Transform)
        skip_transform = False
        if inference_dataset_id and 'dataset' in locals() and dataset and feature_set:
             if dataset.feature_set_id == feature_set.id:
                  print("DEBUG: Skipping preview transformation (Already Transformed)")
                  skip_transform = True

        if not skip_transform and feature_set and feature_set.path:
            import os
            import joblib
            from app.core import feature_store
            
            pkl_path = feature_set.path.replace(".parquet", ".pkl")
            if os.path.exists(pkl_path):
                 try:
                     transformers = joblib.load(pkl_path)
                     df, _ = feature_store.apply_transformations(df, feature_set.transformations, fitted_transformers=transformers)
                 except Exception as e:
                     print(f"Warning: Failed to apply transformations: {e}")

        if not feature_names:
            feature_names = df.columns.tolist()

        # 4. Prepare Input (The Core Logic)
        X = predictor.prepare_input(loaded_model, df, feature_names, objective)
        
        # 5. Format for Response
        # Convert to DataFrame if it's numpy
        if isinstance(X, np.ndarray):
             X_df = pd.DataFrame(X, columns=feature_names) # Assuming feature order logic in prepare_input matches
        else:
             X_df = X
             
        # Limit rows
        preview_df = X_df.head(100)
        
        # Helper to safely serialize
        def safe_serialize(val):
            if pd.isna(val): return None
            if isinstance(val, (np.int64, np.int32, np.int16, np.int8)): return int(val)
            if isinstance(val, (np.float64, np.float32)): return float(val)
            return str(val)

        records = preview_df.to_dict(orient='records')
        # Sanitize
        clean_records = [{k: safe_serialize(v) for k, v in r.items()} for r in records]
        
        return {
            "columns": list(X_df.columns),
            "dtypes": {k: str(v) for k, v in X_df.dtypes.items()},
            "data": clean_records,
            "shape": X.shape
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        print(f"Preview Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")
