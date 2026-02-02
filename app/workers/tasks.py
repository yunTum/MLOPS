from app.db.database import SessionLocal
from app.core import trainer

def train_model_task(feature_set_id: int, target_col: str, params: dict, experiment_name: str):
    db = SessionLocal()
    try:
        trainer.train_model(db, feature_set_id, target_col, params, experiment_name)
    finally:
        db.close()
