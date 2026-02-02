from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.schemas import model as schemas
from app.schemas import task as task_schemas
from app.core import trainer, jobs
from app.db import models as db_models
from typing import List, Union
from rq import Queue
from redis import Redis
import os
import uuid

router = APIRouter()

@router.post("/train", response_model=Union[schemas.Model, task_schemas.Task])
def train_model_endpoint(
    request: schemas.ModelTrainRequest,
    db: Session = Depends(get_db)
):
    from app.core.config import get_settings
    settings = get_settings()

    try:
        # Synch for now
        if settings.USE_LOCAL_SERVICES:
            model = trainer.train_model(
                db, 
                request.feature_set_id, 
                request.target_col, 
                request.params, 
                request.experiment_name,
                request.features,
                request.optimize_hyperparameters,
                request.optimization_timeout,
                request.optimization_metric,
                request.n_trials
            )
            return model
        else:
            # Async Background Task
            task_id = str(uuid.uuid4())
            # Convert Pydantic model to dict for JSON storage
            # Use jsonable_encoder or .dict() (model_dump in v2)
            # .dict() is simpler for now.
            
            new_task = db_models.Task(
                id=task_id,
                name=f"Train: {request.experiment_name}",
                task_type="TRAINING",
                status="pending",
                progress=0,
                details=request.dict()
            )
            db.add(new_task)
            db.commit()
            db.refresh(new_task)

            # Connect to Redis
            redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
            conn = Redis.from_url(redis_url)
            q = Queue(connection=conn)

            # Enqueue
            q.enqueue(
                jobs.train_model_job,
                task_id=task_id,
                feature_set_id=request.feature_set_id,
                target_col=request.target_col,
                params=request.params,
                experiment_name=request.experiment_name,
                features=request.features,
                optimize_hyperparameters=request.optimize_hyperparameters,
                optimization_timeout=request.optimization_timeout,
                optimization_metric=request.optimization_metric,
                n_trials=request.n_trials,
                job_timeout='24h'
            )
            return new_task
            
    except ValueError as e:
        import traceback
        traceback.print_exc()
        print(f"TRAIN ERROR [ValueError]: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"TRAIN ERROR [Exception]: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("", response_model=List[schemas.Model])
def list_models(db: Session = Depends(get_db)):
    from sqlalchemy.orm import joinedload
    return db.query(db_models.Model).options(joinedload(db_models.Model.feature_set)).order_by(db_models.Model.created_at.desc()).all()

@router.get("/{model_id}", response_model=schemas.Model)
def get_model(model_id: int, db: Session = Depends(get_db)):
    from sqlalchemy.orm import joinedload
    model = db.query(db_models.Model).options(joinedload(db_models.Model.feature_set)).filter(db_models.Model.id == model_id).first()
    if not model:
        raise HTTPException(404, "Model not found")
    return model

@router.get("/{model_id}/plots/{plot_type}")
def get_model_plot(model_id: int, plot_type: str, db: Session = Depends(get_db)):
    import mlflow
    import tempfile
    from fastapi.responses import FileResponse
    from app.core.config import get_settings # Ensure env vars loaded

    model = db.query(db_models.Model).filter(db_models.Model.id == model_id).first()
    if not model:
        raise HTTPException(404, "Model not found")

    valid_types = ["learning_curve", "feature_importance", "shap_summary", "confusion_matrix", "correlation_matrix", "actual_vs_predicted", "cluster_pca"]
    
    base_type = plot_type
    ext = "png"
    if plot_type.endswith(".json"):
        base_type = plot_type[:-5]
        ext = "json"

    if base_type not in valid_types:
        raise HTTPException(400, "Invalid plot type. Must be one of: " + ", ".join(valid_types))

    try:
        # Ensure tracking URI is set if not by env
        # mlflow.set_tracking_uri(get_settings().MLFLOW_TRACKING_URI)
        
        tmp_dir = tempfile.mkdtemp()
        artifact_path = f"plots/{base_type}.{ext}"
        
        # Download artifact
        local_path = mlflow.artifacts.download_artifacts(
            run_id=model.mlflow_run_id, 
            artifact_path=artifact_path,
            dst_path=tmp_dir
        )
        return FileResponse(local_path)
    except Exception as e:
        print(f"Failed to fetch artifact: {e}")
        # Return a placeholder or 404? 
        # 404 is better so frontend handles "No Data"
        raise HTTPException(404, f"Plot not found. Model might be trained before this feature or plotting failed. ({str(e)})")

@router.delete("/{model_id}", status_code=204)
def delete_model(model_id: int, db: Session = Depends(get_db)):
    import mlflow
    from app.core.config import get_settings # Ensure env vars loaded

    model = db.query(db_models.Model).filter(db_models.Model.id == model_id).first()
    if not model:
        raise HTTPException(404, "Model not found")

    try:
        # Delete from MLflow
        if model.mlflow_run_id:
             try:
                 mlflow.delete_run(model.mlflow_run_id)
             except Exception as e:
                 print(f"Warning: Failed to delete MLflow run: {e}")

        # Delete from DB
        db.delete(model)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Failed to delete model: {str(e)}")

