
import os
import sys
import pandas as pd
import pyarrow.parquet as pq
from sqlalchemy.orm import Session
from app.db.database import SessionLocal
from app.db import models

def debug_feature_detection():
    db: Session = SessionLocal()
    try:
        # Get the most recent InferenceDataset
        dataset = db.query(models.InferenceDataset).order_by(models.InferenceDataset.id.desc()).first()
        if not dataset:
            print("No InferenceDataset found.")
            return

        print(f"Checking Dataset ID: {dataset.id}, Name: {dataset.name}")
        print(f"Path: {dataset.path}")
        
        if not dataset.feature_set:
            print("ERROR: dataset.feature_set is None.")
            return
        
        print(f"FeatureSet ID: {dataset.feature_set.id}, Name: {dataset.feature_set.name}")
        
        if not dataset.feature_set.dataset_version:
             print("ERROR: dataset.feature_set.dataset_version is None.")
             # Check if we can link via FeatureSet? 
             # FeatureSet is linked to DatasetVersion.
             return

        source_ds_version = dataset.feature_set.dataset_version
        print(f"Source DatasetVersion ID: {source_ds_version.id}")
        ds_path = source_ds_version.path
        print(f"Source Path: {ds_path}")
        
        if not ds_path or not os.path.exists(ds_path):
            print(f"ERROR: Source path does not exist: {ds_path}")
            return

        # Try reading schemas
        try:
            print("Reading source schema via pyarrow...")
            source_cols = pq.read_schema(ds_path).names
            print(f"Source Columns ({len(source_cols)}): {source_cols[:5]}...")
        except Exception as e:
            print(f"ERROR reading source schema: {e}")
            return

        try:
            print("Reading inference schema via pyarrow...")
            inference_cols = pq.read_schema(dataset.path).names
            print(f"Inference Columns ({len(inference_cols)}): {inference_cols[:5]}...")
        except Exception as e:
            print(f"ERROR reading inference schema: {e}")
            return
            
        created = list(set(inference_cols) - set(source_cols))
        print(f"Calculated Created Features ({len(created)}): {created}")
        
        if not created:
             print("WARNING: Created features list is empty. Sets might be identical or subset.")
             print("Are source and inference paths pointing to same file?")
             print(f"Source:    {ds_path}")
             print(f"Inference: {dataset.path}")

    except Exception as e:
        print(f"Exception in debug: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    debug_feature_detection()
