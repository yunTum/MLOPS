from fastapi import APIRouter
from app.api.endpoints import health, datasets, features, models, inference, tasks

api_router = APIRouter()

api_router.include_router(health.router, tags=["health"])
api_router.include_router(datasets.router, prefix="/datasets", tags=["datasets"])
api_router.include_router(features.router, prefix="/features", tags=["features"])
api_router.include_router(models.router, prefix="/models", tags=["models"])
api_router.include_router(inference.router, prefix="/inference", tags=["inference"])
api_router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
