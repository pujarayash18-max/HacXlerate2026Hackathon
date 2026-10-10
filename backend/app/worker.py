"""Stage 9: background jobs - scheduled sync + retraining (Celery + Redis)."""
import os
from celery import Celery
from .db import SessionLocal
from . import ml

app = Celery("worker", broker=os.getenv("REDIS_URL", "redis://redis:6379/0"))
app.conf.beat_schedule = {"retrain-nightly": {"task": "app.worker.retrain", "schedule": 24 * 3600.0},
                          "sync-sources": {"task": "app.worker.sync_sources", "schedule": 6 * 3600.0}}

@app.task
def retrain():
    with SessionLocal() as db:
        try: return ml.train(db)
        except ValueError as e: return {"skipped": str(e)}

@app.task
def sync_sources():
    # Pilot phase: add Moodle web-services / Google Classroom / ERP connectors here and call app.ingest.ingest().
    return {"connectors_configured": 0}
