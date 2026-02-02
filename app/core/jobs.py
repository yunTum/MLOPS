import traceback
from sqlalchemy.orm import Session
from app.db import models
from app.db.database import SessionLocal
from app.core import trainer
from datetime import datetime

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def update_task_progress(task_id: str, progress: int):
    db: Session = SessionLocal()
    try:
        task = db.query(models.Task).filter(models.Task.id == task_id).first()
        if task:
            task.progress = progress
            db.commit()
    except Exception as e:
        print(f"Error updating task progress: {e}")
    finally:
        db.close()

def train_model_job(task_id: str, **kwargs):
    db: Session = SessionLocal()
    try:
        task = db.query(models.Task).filter(models.Task.id == task_id).first()
        if not task:
            print(f"Task {task_id} not found")
            return
        
        task.status = "running"
        task.progress = 0
        db.commit()

        def progress_callback(prog):
            # Update DB every 10% or so to reduce load? 
            # For now just update, but maybe throttle in real prod.
            # We recreate session or use function? using function.
            update_task_progress(task_id, int(prog))

        # Call trainer
        # NOTE: trainer.train_model needs a DB session. We pass our session.
        model = trainer.train_model(db, progress_callback=progress_callback, **kwargs)
        
        task.status = "completed"
        task.progress = 100
        task.result = {"model_id": model.id, "model_name": model.name}
        db.commit()
        
    except Exception as e:
        print(f"Job failed: {e}")
        traceback.print_exc()
        if task:
            task.status = "failed"
            task.result = {"error": str(e)}
            db.commit()
    finally:
        db.close()
