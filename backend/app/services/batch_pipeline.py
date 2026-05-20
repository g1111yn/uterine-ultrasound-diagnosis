"""Patient-oriented batch inference pipeline (V1).

Workflow
--------
1. Client uploads a ZIP containing manifest.csv and one subdirectory per
   patient, each holding 1..N images.
2. The service creates a BatchJob, plus one Case + N CaseImage rows per
   patient, and enqueues every image as a priority-5 inference task.
3. When the last image of a patient completes, a priority-5 aggregation
   task fires and writes that patient's Prediction row; the BatchJob
   counters are updated.
4. Single-case (priority-0) tasks can still jump the queue.

This file owns ZIP parsing, batch kick-off, and the per-batch aggregation
callbacks. The queue + inference primitives come from
app.services.inference_queue / app.services.aggregation.
"""
from __future__ import annotations

import csv
import io
import os
import shutil
import threading
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.config import BATCH_DIR, DATA_DIR
from app.models.db import (
    BatchJob,
    Case,
    CaseImage,
    PerImagePrediction,
    Prediction,
    SessionLocal,
)
from app.services.aggregation import PerImageResult, get_strategy
from app.services.inference_queue import TaskRecord, queue
from app.utils.ids import generate_batch_id, generate_case_id, generate_task_id
from app.utils.image import save_upload_with_preview


BATCH_PRIORITY = 5
MAX_UNCOMPRESSED_BYTES = int(os.getenv("BATCH_MAX_UNCOMPRESSED_BYTES", str(500 * 1024 * 1024)))  # 500 MB
MAX_IMAGES_PER_PATIENT_BATCH = int(os.getenv("BATCH_MAX_IMAGES_PER_PATIENT", "20"))
ALLOWED_EXTS = {"jpg", "jpeg", "png", "bmp", "tif", "tiff", "dcm"}

# user_id -> lock; ensures one in-flight batch submission per user.
_user_locks: dict[str, threading.Lock] = {}
_user_locks_guard = threading.Lock()


class BatchError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


# -- ZIP + manifest parsing --------------------------------------------------


def _safe_extract_zip(archive: bytes, dest: Path) -> None:
    """Extract ZIP, guarding against path traversal + zip bombs."""
    dest.mkdir(parents=True, exist_ok=True)
    total = 0
    with zipfile.ZipFile(io.BytesIO(archive)) as zf:
        for info in zf.infolist():
            target = dest / info.filename
            resolved = target.resolve()
            if not str(resolved).startswith(str(dest.resolve()) + os.sep) and resolved != dest.resolve():
                raise BatchError("UNSAFE_PATH", f"ZIP 中存在非法路径：{info.filename}")
            # Per-file compression ratio check (zip-bomb defence).
            if info.compress_size > 0:
                ratio = info.file_size / max(info.compress_size, 1)
                if ratio > 200:
                    raise BatchError(
                        "COMPRESSION_RATIO",
                        f"{info.filename} 压缩比 {ratio:.0f}× 超过阈值，疑似 zip-bomb，已拒绝。",
                    )
            total += info.file_size
            if total > MAX_UNCOMPRESSED_BYTES:
                raise BatchError(
                    "ARCHIVE_TOO_LARGE",
                    f"解压后超过 {MAX_UNCOMPRESSED_BYTES // (1024*1024)} MB，已拒绝。",
                )
        zf.extractall(dest)


DEFAULT_CHECK_PROJECT = "经阴道三维超声"


def _parse_manifest(path: Path) -> dict[str, tuple[str, str]]:
    """manifest.csv columns: patient_no, clinical_text, [check_project].

    Returns patient_no -> (check_project, clinical_text) mapping.
    check_project 缺省为 DEFAULT_CHECK_PROJECT，与单例推理默认值一致。
    """
    if not path.exists():
        raise BatchError("NO_MANIFEST", "ZIP 内缺少 manifest.csv")
    try:
        text = path.read_text(encoding="utf-8-sig")
    except UnicodeDecodeError:
        raise BatchError("MANIFEST_ENCODING", "manifest.csv 必须是 UTF-8 编码")
    reader = csv.DictReader(io.StringIO(text))
    fields = [f.strip() for f in (reader.fieldnames or [])]
    if "patient_no" not in fields:
        raise BatchError("MANIFEST_MISSING_COLUMN", "manifest.csv 必须包含 patient_no 列")
    if "clinical_text" not in fields:
        raise BatchError("MANIFEST_MISSING_COLUMN", "manifest.csv 必须包含 clinical_text 列")

    out: dict[str, tuple[str, str]] = {}
    for row in reader:
        pno = (row.get("patient_no") or "").strip()
        txt = (row.get("clinical_text") or "").strip()
        proj = (row.get("check_project") or "").strip() or DEFAULT_CHECK_PROJECT
        if len(txt) > 10000:
            txt = txt[:10000]
        if pno:
            out[pno] = (proj, txt)
    if not out:
        raise BatchError("MANIFEST_EMPTY", "manifest.csv 中没有有效的病人记录")
    return out


def _collect_patient_images(root: Path) -> dict[str, list[Path]]:
    """For every subdirectory under `root`, collect supported images.

    Subdirectory name == patient_no. Files in `root` itself are ignored
    except manifest.csv.
    """
    out: dict[str, list[Path]] = {}
    for child in sorted(root.iterdir()):
        if not child.is_dir():
            continue
        imgs = []
        for f in sorted(child.rglob("*")):
            if not f.is_file():
                continue
            ext = f.suffix.lower().lstrip(".")
            if ext in ALLOWED_EXTS:
                imgs.append(f)
        if imgs:
            out[child.name] = imgs[:MAX_IMAGES_PER_PATIENT_BATCH]
    return out


# -- Limits ------------------------------------------------------------------


def _get_user_lock(user_id: str) -> threading.Lock:
    with _user_locks_guard:
        lock = _user_locks.get(user_id)
        if lock is None:
            lock = threading.Lock()
            _user_locks[user_id] = lock
        return lock


def _count_active_batches_for_user(db, user_id: str) -> int:
    return (
        db.query(BatchJob)
        .filter(BatchJob.user_id == user_id, BatchJob.status.in_(("pending", "running")))
        .count()
    )


def _count_pending_batches_total(db) -> int:
    return db.query(BatchJob).filter(BatchJob.status.in_(("pending", "running"))).count()


MAX_ACTIVE_BATCHES_PER_USER = int(os.getenv("MAX_ACTIVE_BATCHES_PER_USER", "1"))
MAX_PENDING_BATCHES_GLOBAL = int(os.getenv("MAX_PENDING_BATCHES_GLOBAL", "10"))


# -- Submission --------------------------------------------------------------


def submit_batch(archive: bytes, *, user_id: str, aggregation_strategy: Optional[str]) -> dict:
    """Kick off a batch: parse ZIP, persist rows, enqueue per-image tasks.

    Returns a summary dict {job_id, total_patients, total_images, status_url}.
    Raises BatchError on validation failure.
    """
    with _get_user_lock(user_id):
        db = SessionLocal()
        try:
            if _count_active_batches_for_user(db, user_id) >= MAX_ACTIVE_BATCHES_PER_USER:
                raise BatchError("BATCH_LIMIT_PER_USER", "你已有正在进行的批量任务，请等其结束后再提交。", 429)
            if _count_pending_batches_total(db) >= MAX_PENDING_BATCHES_GLOBAL:
                raise BatchError("BATCH_LIMIT_GLOBAL", "全局批量队列已满，请稍后再试。", 503)

            job_id = generate_batch_id()
            job_dir = BATCH_DIR / job_id
            try:
                _safe_extract_zip(archive, job_dir)
            except zipfile.BadZipFile:
                raise BatchError("BAD_ZIP", "上传文件不是有效的 ZIP 压缩包。")

            manifest = _parse_manifest(job_dir / "manifest.csv")
            patients = _collect_patient_images(job_dir)

            # Only keep patients that exist in manifest AND have images.
            active_patients: list[tuple[str, str, str, list[Path]]] = []
            for pno, (check_project, clinical_text) in manifest.items():
                imgs = patients.get(pno)
                if imgs:
                    active_patients.append((pno, check_project, clinical_text, imgs))

            if not active_patients:
                shutil.rmtree(job_dir, ignore_errors=True)
                raise BatchError("NO_PATIENTS", "manifest.csv 中的病人都没有找到对应图像文件夹。")

            strategy = get_strategy(aggregation_strategy)
            total_images = sum(len(imgs) for _, _, _, imgs in active_patients)

            job = BatchJob(
                job_id=job_id,
                user_id=user_id,
                total_patients=len(active_patients),
                total_images=total_images,
                status="running",
                aggregation_strategy=strategy.name,
                started_at=datetime.utcnow(),
            )
            db.add(job)
            db.flush()

            # Persist Case + CaseImage for each patient; enqueue per-image tasks.
            for pno, check_project, clinical_text, imgs in active_patients:
                case_id = generate_case_id()
                case = Case(
                    case_id=case_id,
                    patient_no=pno,
                    check_project=check_project,
                    clinical_text=clinical_text,
                    doctor_id=user_id,
                    batch_job_id=job_id,
                )
                db.add(case)
                db.flush()

                image_rows: list[CaseImage] = []
                for seq, src in enumerate(imgs, start=1):
                    content = src.read_bytes()
                    rel_path, fmt, preview_path = save_upload_with_preview(content, src.name)
                    if fmt == "dcm" and not preview_path:
                        # Skip undecodable DICOM for this patient; count as one failed image.
                        continue
                    ci = CaseImage(
                        case_id=case_id,
                        image_path=rel_path,
                        preview_path=preview_path,
                        image_format=fmt,
                        original_filename=src.name,
                        file_size=len(content),
                        sequence=seq,
                    )
                    db.add(ci)
                    db.flush()
                    image_rows.append(ci)

                if not image_rows:
                    # No usable images for this patient — mark the job's failure counter.
                    job.completed_patients += 1
                    job.failed_patients += 1
                    continue

                _enqueue_patient_inference(
                    job_id=job_id,
                    case_id=case_id,
                    check_project=check_project,
                    clinical_text=clinical_text,
                    images=[(ci, ci_path_bytes(ci)) for ci in image_rows],
                    strategy_name=strategy.name,
                )

            db.commit()
            return {
                "job_id": job_id,
                "total_patients": job.total_patients,
                "total_images": job.total_images,
                "status_url": f"/api/batch/{job_id}",
            }
        except BatchError:
            db.rollback()
            raise
        finally:
            db.close()


def ci_path_bytes(ci: CaseImage) -> bytes:
    p = DATA_DIR / ci.image_path
    return p.read_bytes()


def _enqueue_patient_inference(
    *,
    job_id: str,
    case_id: str,
    check_project: str,
    clinical_text: str,
    images: list[tuple[CaseImage, bytes]],
    strategy_name: str,
) -> None:
    """Submit per-image tasks + aggregation for one patient inside a batch."""
    child_ids = [generate_task_id("bimg") for _ in images]
    agg_id = generate_task_id("bagg")

    queue.submit_aggregation(
        agg_id,
        priority=BATCH_PRIORITY,
        case_id=case_id,
        child_task_ids=child_ids,
        on_complete=_make_batch_aggregation_cb(job_id, case_id, child_ids, strategy_name),
    )

    child_cb = _make_batch_child_cb(agg_id, child_ids)
    for tid, (_ci, content) in zip(child_ids, images):
        data = content

        def getter(_data=data) -> bytes:
            return _data

        queue.submit_per_image(
            tid,
            priority=BATCH_PRIORITY,
            image_bytes_getter=getter,
            check_project=check_project,
            check_seen=clinical_text,
            on_complete=child_cb,
        )


def _make_batch_child_cb(agg_id: str, sibling_ids: list[str]):
    def _cb(_rec: TaskRecord):
        # Wait until every sibling is terminal.
        for tid in sibling_ids:
            s = queue.get(tid)
            if s is None or s.status not in ("done", "failed"):
                return
        queue.enqueue_ready_aggregation(agg_id)
    return _cb


def _make_batch_aggregation_cb(job_id: str, case_id: str, child_ids: list[str], strategy_name: str):
    def _cb(agg_rec: TaskRecord):
        db = SessionLocal()
        try:
            job = db.query(BatchJob).filter(BatchJob.job_id == job_id).first()
            if job is None:
                return
            if job.status == "cancelled":
                agg_rec.status = "failed"
                agg_rec.error = "Batch cancelled."
                return

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
                if idx < 0 or idx >= len(child_ids):
                    continue
                child = queue.get(child_ids[idx])
                job.completed_images += 1
                if child is None or child.status != "done" or child.result is None:
                    continue
                res = child.result
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

            job.completed_patients += 1
            case = db.query(Case).filter(Case.case_id == case_id).first()
            patient_no = case.patient_no if case else ""
            if per_results:
                strategy = get_strategy(strategy_name)
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
                job.succeeded_patients += 1
            else:
                job.failed_patients += 1

            job.current_patient = patient_no
            # Completion bookkeeping.
            if job.completed_patients >= job.total_patients:
                job.status = "completed"
                job.finished_at = datetime.utcnow()

            db.commit()
            agg_rec.case_id = case_id
            agg_rec.result = {"case_id": case_id, "patient_no": patient_no}
        except Exception as exc:
            db.rollback()
            agg_rec.status = "failed"
            agg_rec.error = f"{type(exc).__name__}: {exc}"
        finally:
            db.close()

    return _cb


# -- Cancellation + Resume ---------------------------------------------------


def cancel_batch(job_id: str, *, user_id: str) -> bool:
    db = SessionLocal()
    try:
        job = db.query(BatchJob).filter(BatchJob.job_id == job_id).first()
        if not job:
            return False
        if job.user_id != user_id:
            raise BatchError("FORBIDDEN", "无权取消该批量任务。", 403)
        if job.status not in ("pending", "running"):
            return True
        job.status = "cancelled"
        job.finished_at = datetime.utcnow()
        db.commit()
        return True
    finally:
        db.close()


def resume_incomplete_batches() -> int:
    """Called at service startup. Any batch row in status running/pending
    that the queue no longer knows about is marked failed — we don't have
    the original bytes anymore, so re-running isn't possible, but leaving
    it stuck is worse than flagging it to the operator.
    """
    db = SessionLocal()
    fixed = 0
    try:
        stuck = (
            db.query(BatchJob)
            .filter(BatchJob.status.in_(("pending", "running")))
            .all()
        )
        for job in stuck:
            job.status = "failed"
            job.finished_at = datetime.utcnow()
            job.error_message = "服务重启，批量任务已中断，请重新提交。"
            fixed += 1
        db.commit()
    finally:
        db.close()
    return fixed
