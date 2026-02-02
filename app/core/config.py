from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    DATABASE_URL: str
    MLFLOW_TRACKING_URI: str
    REDIS_URL: str
    API_PORT: int = 8000
    UI_PORT: int = 8501
    USE_LOCAL_SERVICES: bool = False # Set to True for SQLite/Sync/LocalMLflow

    class Config:
        env_file = ".env"

@lru_cache()
def get_settings():
    return Settings()
