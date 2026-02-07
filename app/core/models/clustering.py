import mlflow
import numpy as np
import pandas as pd
from sklearn.pipeline import Pipeline
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.metrics import silhouette_score, davies_bouldin_score
from app.core.models.base import BaseTrainer
from app.core.models import utils

class ClusteringTrainer(BaseTrainer):
    def prepare_data(self, df: pd.DataFrame, target_col: str, features: list):
        # 1. Filter features
        X = df
        if features and len(features) > 0:
            missing = [f for f in features if f not in X.columns]
            if missing:
                 raise ValueError(f"Requested features not found: {missing}")
            X = X[features]
            
        # 2. Drop target if exists (Unsupervised)
        if target_col and target_col in X.columns:
             X = X.drop(columns=[target_col])
             
        # 3. Numeric only
        X = X.select_dtypes(include=[np.number])
        X = X.fillna(0)
        
        self.used_features = list(X.columns)
        return X

    def train_and_evaluate(self, data_bundle, output_dir: str):
        X = data_bundle
        
        n_clusters = int(self.params.get("n_clusters", 3))
        init = self.params.get("init", "k-means++")

        pipeline = Pipeline([
            ('imputer', SimpleImputer(strategy='constant', fill_value=0)),
            ('scaler', StandardScaler()),
            ('kmeans', KMeans(n_clusters=n_clusters, init=init, random_state=42))
        ])
        
        clusters = pipeline.fit_predict(X)
        kmeans = pipeline.named_steps['kmeans']
        X_scaled = pipeline.named_steps['scaler'].transform(X) # Re-create X_scaled for metrics
        
        # Calculate Metrics
        metrics = {}
        if len(X) > 1:
            try:
                metrics['silhouette'] = silhouette_score(X_scaled, clusters)
                metrics['davies_bouldin'] = davies_bouldin_score(X_scaled, clusters)
                metrics['inertia'] = kmeans.inertia_
            except Exception as e:
                print(f"Clustering metrics error: {e}")
                
        # Plots
        utils.plot_clusters_pca(X_scaled, clusters, output_dir)
        utils.plot_correlation_matrix(X, self.used_features, output_dir)
        
        return pipeline, metrics

    def log_model_to_mlflow(self, model, artifact_path: str):
        mlflow.sklearn.log_model(model, artifact_path)

    def get_model_prefix(self) -> str:
        return "kmeans"
