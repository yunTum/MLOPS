from app.db.session import SessionLocal
from sqlalchemy import text

def check():
    db = SessionLocal()
    try:
        # Check alembic version
        res = db.execute(text("SELECT version_num FROM alembic_version"))
        version = res.scalar()
        print(f"Current Alembic Version: {version}")

        # Check mlops_feature_sets columns
        res = db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'mlops_feature_sets'"))
        cols = [r[0] for r in res.fetchall()]
        print(f"Feature Set Columns: {cols}")
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    check()
