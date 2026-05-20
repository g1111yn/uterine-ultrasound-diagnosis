"""POST /api/predict — submit a patient case with 1..N images, asynchronously.

Returns 202 with a task_id immediately. The client polls
/api/tasks/{task_id} until status == "done", then fetches the final
result via /api/cases/{case_id}.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, UploadFile, File, Form, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.models.db import (
    get_db,
    SessionLocal,
    Case,
    CaseImage,
    PerImagePrediction,
    Prediction,
    IdempotencyRecord,
    User,
)
from app.models.schemas import PredictAcceptedResponse
from app.services import audit, auth
from app.services.aggregation import PerImageResult, get_strategy
from app.services.inference_queue import queue, TaskRecord
from app.utils.ids import generate_case_id, generate_task_id
from app.utils.image import save_upload_with_preview, sniff_image_mime

router = APIRouter()

MAX_IMAGES_PER_CASE = int(os.getenv("MAX_IMAGES_PER_CASE", "30"))
MAX_IMAGE_BYTES = int(os.getenv("MAX_IMAGE_BYTES", str(50 * 1024 * 1024)))  # 50 MB
ALLOWED_EXTS = {"jpg", "jpeg", "png", "bmp", "tif", "tiff", "dcm"}
ALLOWED_MIMES = {
    "image/jpeg",
    "image/png",
    "image/bmp",
    "image/tiff",
    "application/dicom",
}


def _err(code: str, message: str, status: int = 400):
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


def _check_idempotency(db: Session, key: str, user_id: str) -> Optional[dict]:
    if not key:
        return None
    now = datetime.utcnow()
    rec = db.query(IdempotencyRecord).filter(IdempotencyRecord.key == key).first()
    if rec is None:
        return None
    if rec.expires_at < now:
        db.delete(rec)
        db.commit()
        return None
    if rec.user_id != user_id:
        return None
    try:
        return json.loads(rec.response_json)
    except Exception:
        return None


def _store_idempotency(db: Session, key: str, user_id: str, response: dict):
    if not key:
        return
    now = datetime.utcnow()
    rec = IdempotencyRecord(
        key=key,
        user_id=user_id,
        response_json=json.dumps(response),
        created_at=now,
        expires_at=now + timedelta(hours=24),
    )
    db.merge(rec)
    db.commit()


def _make_aggregation_callback(case_id: str, child_task_ids: list[str]):
    """Return an on_complete callback for the aggregation task that pulls
    per-image results out of the queue and writes the patient-level
    Prediction row."""

    def _cb(agg_rec: TaskRecord):
        db = SessionLocal()
        try:
            images = (
                db.query(CaseImage)
                .filter(CaseImage.case_id == case_id)
                .order_by(CaseImage.sequence)
                .all()
            )
            per_results: list[PerImageResult] = []
            first_model_version: Optional[str] = None

            for img in images:
                idx = img.sequence - 1
                if idx < 0 or idx >= len(child_task_ids):
                    continue
                child = queue.get(child_task_ids[idx])
                if child is None or child.status != "done" or child.result is None:
                    continue
                res = child.result  # InferenceResult
                first_model_version = first_model_version or res.model_version
                db.add(PerImagePrediction(
                    image_id=img.id,
                    prob_normal=res.prob_normal,
                    prob_cancer=res.prob_cancer,
                    prob_polyp=res.prob_polyp,
                    predicted_class=res.predicted_class,
                    confidence=res.confidence,
                    gradcam_path=res.gradcam_path or "",
                    inference_ms=res.inference_ms,
                    model_version=res.model_version,
                ))
                per_results.append(PerImageResult(
                    prob_normal=res.prob_normal,
                    prob_cancer=res.prob_cancer,
                    prob_polyp=res.prob_polyp,
                    predicted_class=res.predicted_class,
                    confidence=res.confidence,
                ))

            if not per_results:
                db.rollback()
                agg_rec.status = "failed"
                agg_rec.error = "No per-image results available for aggregation."
                return

            strategy = get_strategy()
            agg = strategy.aggregate(per_results)

            db.add(Prediction(
                case_id=case_id,
                aggregation_strategy=agg.strategy,
                aggregation_threshold=agg.threshold,
                prob_normal=agg.prob_normal,
                prob_cancer=agg.prob_cancer,
                prob_polyp=agg.prob_polyp,
                predicted_class=agg.predicted_class,
                confidence=agg.confidence,
                image_count=agg.image_count,
                model_version=first_model_version or "",
            ))
            db.commit()
            agg_rec.case_id = case_id
            agg_rec.result = {"case_id": case_id, "predicted_class": agg.predicted_class}
        except Exception as exc:
            db.rollback()
            agg_rec.status = "failed"
            agg_rec.error = f"{type(exc).__name__}: {exc}"
        finally:
            db.close()

    return _cb


def _make_child_callback(aggregation_task_id: str, sibling_ids: list[str]):
    """Return an on_complete callback for a per-image task that enqueues the
    aggregation task when all siblings (including self) are terminal."""

    def _cb(child_rec: TaskRecord):
        # Check if all siblings have reached a terminal state.
        for tid in sibling_ids:
            s = queue.get(tid)
            if s is None:
                return
            if s.status not in ("done", "failed"):
                return
        queue.enqueue_ready_aggregation(aggregation_task_id)

    return _cb


@router.post("/predict", status_code=202, response_model=PredictAcceptedResponse)
async def predict(
    request: Request,
    images: list[UploadFile] = File(...),
    clinical_text: str = Form(""),
    check_project: str = Form(""),
    patient_no: str = Form(""),
    idempotency_key: str = Form(""),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_user),
):
    doctor_id = current_user.user_id
    if not images:
        return _err("NO_IMAGES", "At least one image is required.", 400)
    if len(images) > MAX_IMAGES_PER_CASE:
        return _err(
            "TOO_MANY_IMAGES",
            f"最多支持 {MAX_IMAGES_PER_CASE} 张图/病例，收到 {len(images)} 张。",
            400,
        )

    # Idempotency: replay previous response if key seen.
    replay = _check_idempotency(db, idempotency_key, doctor_id)
    if replay is not None:
        return JSONResponse(status_code=202, content=replay)

    # Read all bytes up front; validate.
    file_records: list[tuple[str, bytes]] = []
    for uf in images:
        content = await uf.read()
        if not content:
            return _err("EMPTY_IMAGE", f"文件 {uf.filename} 为空。", 400)
        if len(content) > MAX_IMAGE_BYTES:
            return _err(
                "IMAGE_TOO_LARGE",
                f"文件 {uf.filename} 超过 {MAX_IMAGE_BYTES // (1024*1024)} MB 限制。",
                400,
            )
        ext = (uf.filename or "").split(".")[-1].lower()
        if ext and ext not in ALLOWED_EXTS:
            return _err(
                "UNSUPPORTED_FORMAT",
                f"不支持的文件类型 .{ext}，请上传 JPG/PNG/BMP/TIFF/DCM。",
                400,
            )
        real_mime = sniff_image_mime(content, uf.filename or "")
        if real_mime not in ALLOWED_MIMES:
            return _err(
                "MIME_MISMATCH",
                f"文件 {uf.filename} 实际类型 {real_mime} 与扩展名不符，已拒绝。",
                400,
            )
        file_records.append((uf.filename or "upload.bin", content))

    # Persist Case + CaseImage rows; save files to disk.
    case_id = generate_case_id()
    case = Case(
        case_id=case_id,
        patient_no=patient_no,
        check_project=check_project,
        clinical_text=clinical_text,
        doctor_id=doctor_id,
    )
    db.add(case)
    db.flush()

    image_records: list[tuple[CaseImage, bytes]] = []
    for seq, (fname, content) in enumerate(file_records, start=1):
        rel_path, fmt, preview_path = save_upload_with_preview(content, fname)
        if fmt == "dcm" and not preview_path:
            db.rollback()
            return _err(
                "DICOM_DECODE_FAILED",
                f"无法解析 DICOM 文件 {fname}，可能损坏或使用了不支持的传输语法。",
                400,
            )
        ci = CaseImage(
            case_id=case_id,
            image_path=rel_path,
            preview_path=preview_path,
            image_format=fmt,
            original_filename=fname,
            file_size=len(content),
            sequence=seq,
        )
        db.add(ci)
        db.flush()
        image_records.append((ci, content))

    db.commit()

    # Build tasks.
    child_task_ids = [generate_task_id("img") for _ in image_records]
    aggregation_task_id = generate_task_id("agg")

    agg_cb = _make_aggregation_callback(case_id, child_task_ids)
    queue.submit_aggregation(
        aggregation_task_id,
        priority=0,
        case_id=case_id,
        child_task_ids=child_task_ids,
        on_complete=agg_cb,
    )

    child_cb = _make_child_callback(aggregation_task_id, child_task_ids)
    for tid, (ci, content) in zip(child_task_ids, image_records):
        # Capture content by closure; avoid keeping huge lambdas in __repr__.
        data = content

        def getter(_data=data) -> bytes:
            return _data

        queue.submit_per_image(
            tid,
            priority=0,
            image_bytes_getter=getter,
            check_project=check_project,
            check_seen=clinical_text,
            on_complete=child_cb,
        )

    snap = queue.status_snapshot(aggregation_task_id) or {}
    response = {
        "case_id": case_id,
        "task_id": aggregation_task_id,
        "image_count": len(image_records),
        "estimated_wait_ms": snap.get("estimated_wait_ms") or 0,
        "status_url": f"/api/tasks/{aggregation_task_id}",
    }

    if idempotency_key:
        _store_idempotency(db, idempotency_key, doctor_id, response)

    audit.log_event(
        user_id=doctor_id,
        action="create_case",
        resource_type="case",
        resource_id=case_id,
        request=request,
        detail={"image_count": len(image_records), "patient_no": patient_no},
    )

    return JSONResponse(status_code=202, content=response)
