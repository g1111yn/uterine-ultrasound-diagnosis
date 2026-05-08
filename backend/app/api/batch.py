"""Batch inference API (V1.4)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.models.db import BatchJob, Case, Prediction, User, get_db
from app.models.schemas import (
    BatchResultItem,
    BatchStatusResponse,
    CLASS_ZH,
)
from app.services import audit, auth
from app.services.batch_pipeline import BatchError, cancel_batch, submit_batch

router = APIRouter()


def _err(code: str, message: str, status: int = 400):
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


@router.post("/predict/batch", status_code=202)
async def create_batch(
    request: Request,
    archive: UploadFile = File(...),
    aggregation_strategy: str = Form(""),
    current_user: User = Depends(auth.require_user),
):
    content = await archive.read()
    if not content:
        return _err("EMPTY_ARCHIVE", "上传的压缩包为空。")
    try:
        summary = submit_batch(
            content,
            user_id=current_user.user_id,
            aggregation_strategy=aggregation_strategy or None,
        )
    except BatchError as exc:
        audit.log_event(
            user_id=current_user.user_id,
            action="create_batch",
            resource_type="batch",
            resource_id="",
            request=request,
            success=False,
            detail={"code": exc.code, "message": exc.message},
        )
        return _err(exc.code, exc.message, exc.status)

    audit.log_event(
        user_id=current_user.user_id,
        action="create_batch",
        resource_type="batch",
        resource_id=summary["job_id"],
        request=request,
        detail={
            "total_patients": summary["total_patients"],
            "total_images": summary["total_images"],
        },
    )
    return JSONResponse(status_code=202, content=summary)


@router.get("/batch/{job_id}", response_model=BatchStatusResponse)
async def get_batch_status(
    job_id: str,
    db: Session = Depends(get_db),
    _user: User = Depends(auth.require_user),
):
    job = db.query(BatchJob).filter(BatchJob.job_id == job_id).first()
    if not job:
        return _err("NOT_FOUND", f"批量任务 {job_id} 不存在", 404)

    # Recent completions (last 20 by finished order = case created_at desc).
    rows = (
        db.query(Case, Prediction)
        .join(Prediction, Case.case_id == Prediction.case_id)
        .filter(Case.batch_job_id == job_id)
        .order_by(Case.created_at.desc())
        .limit(20)
        .all()
    )
    results = [
        BatchResultItem(
            case_id=case.case_id,
            patient_no=case.patient_no,
            predicted_class_zh=CLASS_ZH.get(pred.predicted_class, pred.predicted_class),
            confidence=pred.confidence,
            image_count=pred.image_count,
        )
        for case, pred in rows
    ]

    # Rough ETA: remaining images * moving-average per-image latency.
    from app.services.inference_queue import queue  # local import avoids cycle
    remaining_images = max(job.total_images - job.completed_images, 0)
    eta_ms = int(remaining_images * queue._ema_ms) if remaining_images else 0

    return BatchStatusResponse(
        job_id=job.job_id,
        total_patients=job.total_patients,
        completed_patients=job.completed_patients,
        succeeded_patients=job.succeeded_patients,
        failed_patients=job.failed_patients,
        total_images=job.total_images,
        completed_images=job.completed_images,
        status=job.status,
        aggregation_strategy=job.aggregation_strategy,
        current_patient=job.current_patient or "",
        started_at=job.started_at,
        finished_at=job.finished_at,
        estimated_remaining_ms=eta_ms,
        results=results,
    )


@router.post("/batch/{job_id}/cancel")
async def cancel(
    job_id: str,
    request: Request,
    current_user: User = Depends(auth.require_user),
):
    try:
        ok = cancel_batch(job_id, user_id=current_user.user_id)
    except BatchError as exc:
        return _err(exc.code, exc.message, exc.status)
    if not ok:
        return _err("NOT_FOUND", f"批量任务 {job_id} 不存在", 404)
    audit.log_event(
        user_id=current_user.user_id,
        action="cancel_batch",
        resource_type="batch",
        resource_id=job_id,
        request=request,
    )
    return {"ok": True}
