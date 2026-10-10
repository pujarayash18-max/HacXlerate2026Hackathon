import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.db import SessionLocal
from app.ingest import ingest
from app.ml import train
from app.panels import generate_insights

def run():
    db = SessionLocal()
    try:
        print("Uploading synthetic data...")
        with open("SYNTHETIC_academic_data_V2.csv", "rb") as f:
            data = f.read()
            ingest(db, data, "SYNTHETIC_academic_data_V2.csv")
            
        print("Training model...")
        train(db)
        
        print("Generating insights...")
        generate_insights(db)
        
        print("Done!")
    finally:
        db.close()

if __name__ == "__main__":
    run()
