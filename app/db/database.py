from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

from app.core.config import get_settings

load_dotenv()

settings = get_settings()

if settings.USE_LOCAL_SERVICES:
    # Use SQLite
    DATABASE_URL = "sqlite:///./mlops.db"
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    # Use Postgres
    DATABASE_URL = settings.DATABASE_URL
    engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
