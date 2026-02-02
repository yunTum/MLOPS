from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db import models
from app.core.config import get_settings

settings = get_settings()
engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

print("--- DataSets ---")
datasets = db.query(models.Dataset).all()
for d in datasets:
    print(f"ID: {d.id}, Name: {d.name}")

print("\n--- FeatureSet ID 2 ---")
fs = db.query(models.FeatureSet).filter(models.FeatureSet.id == 2).first()
if fs:
    print(f"FOUND ID: {fs.id}")
    print(f"Path: '{fs.path}'")
    print(f"Version: '{fs.version}'")
else:
    print("FeatureSet ID 2 NOT FOUND")

print("\n--- DatasetVersions ---")
versions = db.query(models.DatasetVersion).all()
for v in versions:
    print(f"ID: {v.id}, DatasetID: {v.dataset_id}, Path: {v.path}")
