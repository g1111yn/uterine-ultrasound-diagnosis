"""GET /api/metrics — operational metrics (admin-only).

Intentionally lightweight: no Prometheus dependency, no histogram library.
Returns a single JSON blob that the admin stats page renders.
"""
from __future__ import annotations

import time
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config import BASE_DIR
from app.middleware import five_xx_counter
from app.models.db import Case, LoginAttempt, User, get_db
from app.services import auth
from app.services.inference import inferencer
from app.services.inference_queue import queue

router = APIRouter()

_start_time = time.time()


@router.get("/metrics")
async def metrics(
    db: Session = Depends(get_db),
    _admin: User = Depends(auth.require_admin),
):
    db_file = BASE_DIR / "data" / "app.db"
    try:
        db_size_mb = round(db_file.stat().st_size / (1024 * 1024), 2) if db_file.exists() else 0.0
    except OSError:
        db_size_mb = 0.0

    today_start = datetime.utcnow() - timedelta(hours=24)
    auth_failures_today = (
        db.query(LoginAttempt)
        .filter(LoginAttempt.attempted_at >= today_start, LoginAttempt.success.is_(False))
        .count()
    )

    return {
        "uptime_seconds": int(time.time() - _start_time),
        "model_version": inferencer.model_version,
        "model_loaded": inferencer.loaded,
        "inference": queue.metrics_snapshot(),
        "database": {
            "size_mb": db_size_mb,
            "case_count": db.query(Case).count(),
            "user_count": db.query(User).count(),
        },
        "errors": {
            "5xx_today": five_xx_counter.snapshot(),
            "auth_failures_today": auth_failures_today,
        },
    }
