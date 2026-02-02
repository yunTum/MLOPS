from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.api.api import api_router
import uvicorn

settings = get_settings()
app = FastAPI(title="MLOps Platform API")

# Set all CORS enabled origins
if settings.USE_LOCAL_SERVICES:
    origins = ["*"]
else:
    origins = [
        "http://localhost",
        "http://localhost:3000",
        "http://localhost:8501", # Keep Streamlit for now
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")

@app.get("/")
def root():
    return {"message": "Welcome to MLOps App API"}

@app.on_event("startup")
def startup_event():
    from app.db.database import SessionLocal
    from app.db import models
    
    db = SessionLocal()
    try:
        # Reset stuck tasks
        stuck_statuses = ["pending", "running"]
        tasks = db.query(models.Task).filter(models.Task.status.in_(stuck_statuses)).all()
        for task in tasks:
            print(f"Resetting stuck task {task.id} (Status: {task.status})")
            task.status = "failed"
            task.result = {"error": "Interrupted by server restart"}
            db.commit()
    except Exception as e:
        print(f"Error resetting tasks: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.API_PORT, reload=True)
