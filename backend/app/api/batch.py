"""Batch inference API (V2)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.models.db import BatchJob, Case, Prediction, User, get_db
from app.models.schemas import (
    BatchJobListItem,
    BatchJobListResponse,
    BatchResultItem,
    BatchStatusResponse,
    CLASS_ZH,
)
from app.services import audit, auth
from app.services.batch_pipeline import BatchError, cancel_batch, submit_batch

router = APIRouter()


def _public_status(status: str) -> str:
    return "queued" if status == "pending" else status


def _internal_status_filter(status: str) -> str:
    return "pending" if status == "queued" else status


def _err(code: str, message: str, status: int = 400, details: list[dict] | None = None):
    body: dict = {"error": {"code": code, "message": message}}
    if details:
        body["error"]["details"] = details
    return JSONResponse(status_code=status, content=body)


@router.get("/batch", response_model=BatchJobListResponse)
async def list_batch_jobs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_user),
):
    q = db.query(BatchJob).filter(BatchJob.user_id == current_user.user_id)
    if status:
        q = q.filter(BatchJob.status == _internal_status_filter(status))
    total = q.count()
    jobs = (
        q.order_by(BatchJob.started_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    items = [
        BatchJobListItem(
            job_id=j.job_id,
            status=_public_status(j.status),
            total_patients=j.total_patients,
            completed_patients=j.completed_patients,
            succeeded_patients=j.succeeded_patients,
            failed_patients=j.failed_patients,
            total_images=j.total_images,
            completed_images=j.completed_images,
            aggregation_strategy=j.aggregation_strategy,
            started_at=j.started_at,
            finished_at=j.finished_at,
        )
        for j in jobs
    ]
    return BatchJobListResponse(total=total, page=page, page_size=page_size, items=items)


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
        return _err(exc.code, exc.message, exc.status, details=exc.details)

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

    # All patients for this batch (no limit — batch detail page needs full list).
    rows = (
        db.query(Case, Prediction)
        .outerjoin(Prediction, Case.case_id == Prediction.case_id)
        .filter(Case.batch_job_id == job_id)
        .order_by(Case.created_at.asc())
        .all()
    )
    results = []
    for case, pred in rows:
        if pred:
            results.append(BatchResultItem(
                case_id=case.case_id,
                patient_no=case.patient_no,
                predicted_class=pred.predicted_class,
                predicted_class_zh=CLASS_ZH.get(pred.predicted_class, pred.predicted_class),
                confidence=pred.confidence,
                image_count=pred.image_count,
            ))
        else:
            results.append(BatchResultItem(
                case_id=case.case_id,
                patient_no=case.patient_no,
                image_count=0,
                error="推理未完成",
            ))

    # Rough ETA: remaining images * moving-average per-image latency.
    from app.services.inference_queue import queue  # local import avoids cycle
    remaining_images = (
        max(job.total_images - job.completed_images, 0)
        if job.status in ("pending", "running")
        else 0
    )
    eta_ms = int(remaining_images * queue._ema_ms) if remaining_images else 0

    return BatchStatusResponse(
        job_id=job.job_id,
        total_patients=job.total_patients,
        completed_patients=job.completed_patients,
        succeeded_patients=job.succeeded_patients,
        failed_patients=job.failed_patients,
        total_images=job.total_images,
        completed_images=job.completed_images,
        status=_public_status(job.status),
        error=job.error_message or None,
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
