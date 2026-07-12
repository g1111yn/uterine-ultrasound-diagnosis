"""Patient-oriented batch inference pipeline (V2 — serial per-patient).

Workflow
--------
1. Client uploads a ZIP containing manifest.csv and one subdirectory per
   patient, each holding 1..N images.
2. The service creates a BatchJob, plus one Case + N CaseImage rows per
   patient, then kicks off a background thread that processes patients
   **one at a time** (serial). Within each patient, images are inferred
   sequentially via the priority queue.
3. After each image completes, ``completed_images`` is incremented so the
   frontend sees real-time progress. After all images for a patient
   finish, aggregation runs inline and ``completed_patients`` increments.
4. Single-case (priority-0) tasks can still jump the queue between images.
"""
from __future__ import annotations

import csv
import io
import os
import shutil
import threading
import zipfile
from datetime import datetime, timezone
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
MAX_IMAGES_PER_PATIENT_BATCH = int(os.getenv("BATCH_MAX_IMAGES_PER_PATIENT", "30"))
ALLOWED_EXTS = {"jpg", "jpeg", "png", "bmp", "tif", "tiff", "dcm"}

KNOWN_MANIFEST_COLUMNS = {"patient_no", "clinical_text", "check_project"}

# user_id -> lock; ensures one in-flight batch submission per user.
_user_locks: dict[str, threading.Lock] = {}
_user_locks_guard = threading.Lock()


def _batch_without_work_error(patient_work: list) -> tuple[str, str]:
    if not patient_work:
        return "NO_VALID_IMAGES", "批量任务中没有可处理的有效图像。"
    return "", ""


def _fail_batch_without_work(job: BatchJob, patient_work: list) -> bool:
    code, message = _batch_without_work_error(patient_work)
    if not code:
        return False
    job.status = "failed"
    job.finished_at = datetime.now(timezone.utc)
    job.error_message = message
    return True


def _completed_task_record(done_event, task_result: list, *, timeout: int):
    if not done_event.wait(timeout=timeout):
        return None
    return task_result[0] if task_result else None


def _transition_running_batch(db, job_id: str, status: str, *, error_message: str = "") -> bool:
    updated = (
        db.query(BatchJob)
        .filter(BatchJob.job_id == job_id, BatchJob.status == "running")
        .update(
            {
                BatchJob.status: status,
                BatchJob.finished_at: datetime.now(timezone.utc),
                BatchJob.error_message: error_message,
            },
            synchronize_session=False,
        )
    )
    db.commit()
    return bool(updated)


def _begin_immediate_batch(db) -> None:
    db.connection().exec_driver_sql("BEGIN IMMEDIATE")


def _cancel_inference_task_if_supported(task_id: str) -> None:
    cancel = getattr(queue, "cancel", None)
    if callable(cancel):
        cancel(task_id)


class _TaskResultGate:
    def __init__(self, done_event, task_result: list):
        self._done_event = done_event
        self._task_result = task_result
        self._accepting = True
        self._lock = threading.Lock()

    def accept(self, record: TaskRecord) -> bool:
        with self._lock:
            if not self._accepting:
                return False
            self._task_result.append(record)
            self._done_event.set()
            return True

    def close(self) -> None:
        with self._lock:
            self._accepting = False


class BatchError(Exception):
    """Hard validation error — submission cannot continue.

    ``details`` is an optional list of structured diagnostics keyed by
    ``kind`` so the frontend can render an itemized error list.
    """

    def __init__(
        self,
        code: str,
        message: str,
        status: int = 400,
        details: Optional[list[dict]] = None,
    ):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.details: list[dict] = details or []


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


def _levenshtein(a: str, b: str) -> int:
    """Tiny edit-distance impl for column-name typo detection (≤ ~30 chars)."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cost = 0 if ca == cb else 1
            cur.append(min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost))
        prev = cur
    return prev[-1]


def _suggest_known_column(name: str) -> Optional[str]:
    candidates = [(_levenshtein(name.lower(), k), k) for k in KNOWN_MANIFEST_COLUMNS]
    candidates.sort()
    dist, best = candidates[0]
    if 0 < dist <= 2:
        return best
    return None


def _parse_manifest(
    path: Path,
) -> tuple[dict[str, tuple[str, str]], list[dict]]:
    """Parse manifest.csv → (mapping, warnings).

    Required columns: ``patient_no``, ``clinical_text``.
    Optional column: ``check_project`` (defaults to DEFAULT_CHECK_PROJECT).

    Warnings collected (non-fatal, returned to caller):
      - ``unknown_column``: column name not in KNOWN_MANIFEST_COLUMNS,
        with optional ``suggest`` if a near-match is found
      - ``empty_patient_no``: row with blank patient_no (skipped)
      - ``duplicate_patient_no``: same patient_no listed twice
        (later row overrides earlier)
      - ``clinical_text_truncated``: text > 10000 chars, truncated
    """
    if not path.exists():
        raise BatchError("NO_MANIFEST", "ZIP 内缺少 manifest.csv")
    try:
        text = path.read_text(encoding="utf-8-sig")
    except UnicodeDecodeError:
        raise BatchError(
            "MANIFEST_ENCODING",
            "manifest.csv 必须是 UTF-8 编码（推荐用 Excel「另存为 → CSV UTF-8」导出）",
        )
    reader = csv.DictReader(io.StringIO(text))
    fields = [f.strip() for f in (reader.fieldnames or [])]
    if "patient_no" not in fields:
        raise BatchError("MANIFEST_MISSING_COLUMN", "manifest.csv 必须包含 patient_no 列")
    if "clinical_text" not in fields:
        raise BatchError("MANIFEST_MISSING_COLUMN", "manifest.csv 必须包含 clinical_text 列")

    warnings: list[dict] = []
    for col in fields:
        if col not in KNOWN_MANIFEST_COLUMNS:
            suggest = _suggest_known_column(col)
            warnings.append({
                "kind": "unknown_column",
                "column": col,
                "suggest": suggest,
                "message": (
                    f"未识别的列「{col}」"
                    + (f"，是否想写「{suggest}」？" if suggest else "，已忽略。")
                ),
            })

    out: dict[str, tuple[str, str]] = {}
    for idx, row in enumerate(reader, start=2):  # row 1 is header
        pno = (row.get("patient_no") or "").strip()
        if not pno:
            warnings.append({
                "kind": "empty_patient_no",
                "row": idx,
                "message": f"第 {idx} 行 patient_no 为空，已跳过。",
            })
            continue
        txt = (row.get("clinical_text") or "").strip()
        if len(txt) > 10000:
            warnings.append({
                "kind": "clinical_text_truncated",
                "row": idx,
                "patient_no": pno,
                "message": f"第 {idx} 行（{pno}）clinical_text 超过 10000 字，已截断。",
            })
            txt = txt[:10000]
        proj = (row.get("check_project") or "").strip() or DEFAULT_CHECK_PROJECT
        if pno in out:
            warnings.append({
                "kind": "duplicate_patient_no",
                "row": idx,
                "patient_no": pno,
                "message": f"第 {idx} 行 patient_no「{pno}」重复，使用最后一行的值。",
            })
        out[pno] = (proj, txt)
    if not out:
        raise BatchError("MANIFEST_EMPTY", "manifest.csv 中没有有效的病人记录")
    return out, warnings


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

            manifest, warnings = _parse_manifest(job_dir / "manifest.csv")
            patients = _collect_patient_images(job_dir)

            # Diagnose patients in manifest but missing image directory
            for pno in manifest.keys():
                if pno not in patients:
                    warnings.append({
                        "kind": "missing_directory",
                        "patient_no": pno,
                        "message": f"manifest 中的「{pno}」在 ZIP 内找不到对应子目录，已跳过。",
                    })
            # Diagnose directories with images but not listed in manifest
            for pno in patients.keys():
                if pno not in manifest:
                    warnings.append({
                        "kind": "directory_not_in_manifest",
                        "patient_no": pno,
                        "message": f"目录「{pno}」未在 manifest.csv 中列出，已跳过。",
                    })
            # Diagnose patients with subdirs but no supported images
            # (already filtered upstream — _collect_patient_images skips empty dirs)

            # Only keep patients that exist in manifest AND have images.
            active_patients: list[tuple[str, str, str, list[Path]]] = []
            for pno, (check_project, clinical_text) in manifest.items():
                imgs = patients.get(pno)
                if imgs:
                    active_patients.append((pno, check_project, clinical_text, imgs))

            if not active_patients:
                shutil.rmtree(job_dir, ignore_errors=True)
                raise BatchError(
                    "NO_PATIENTS",
                    "manifest.csv 中的病人都没有找到对应的图像目录。",
                    details=warnings,
                )

            strategy = get_strategy(aggregation_strategy)
            total_images = sum(len(imgs) for _, _, _, imgs in active_patients)

            job = BatchJob(
                job_id=job_id,
                user_id=user_id,
                total_patients=len(active_patients),
                total_images=total_images,
                status="running",
                aggregation_strategy=strategy.name,
                started_at=datetime.now(timezone.utc),
            )
            db.add(job)
            db.flush()

            # Persist Case + CaseImage for each patient (data only, no inference yet).
            patient_work: list[tuple[str, str, str, list[CaseImage]]] = []
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

                image_rows: list[dict] = []
                for seq, src in enumerate(imgs, start=1):
                    content = src.read_bytes()
                    rel_path, fmt, preview_path = save_upload_with_preview(content, src.name)
                    if fmt == "dcm" and not preview_path:
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
                    # Capture plain values now — ORM objects become detached
                    # once this session closes and can't be used in the worker.
                    image_rows.append({"id": ci.id, "image_path": ci.image_path})

                if not image_rows:
                    job.completed_patients += 1
                    job.failed_patients += 1
                    continue

                patient_work.append((case_id, check_project, clinical_text, image_rows))

            job.total_images = sum(
                len(image_rows)
                for _, _, _, image_rows in patient_work
            )

            summary = {
                "job_id": job_id,
                "total_patients": job.total_patients,
                "total_images": job.total_images,
                "status_url": f"/api/batch/{job_id}",
                "warnings": warnings,
            }
            if _fail_batch_without_work(job, patient_work):
                db.commit()
                return summary

            db.commit()

            # Kick off serial background worker for this batch.
            _start_serial_batch_worker(job_id, patient_work, strategy.name)
            return summary
        except BatchError:
            db.rollback()
            raise
        finally:
            db.close()


def _start_serial_batch_worker(
    job_id: str,
    patient_work: list[tuple[str, str, str, list[dict]]],
    strategy_name: str,
) -> threading.Thread:
    """Spawn a daemon thread that processes patients one-by-one.

    For each patient:
      1. Infer each image sequentially via the queue (priority=BATCH_PRIORITY).
      2. After all images done, aggregate inline and write Prediction.
      3. Update completed_images / completed_patients after each step.

    This gives the frontend smooth, per-image progress updates.
    """
    def _worker():
        for case_id, check_project, clinical_text, image_rows in patient_work:
            db = SessionLocal()
            try:
                job = db.query(BatchJob).filter(BatchJob.job_id == job_id).first()
                if job is None or job.status == "cancelled":
                    return

                # Update current_patient for frontend display.
                case = db.query(Case).filter(Case.case_id == case_id).first()
                patient_no = case.patient_no if case else ""
                job.current_patient = patient_no
                db.commit()

                # Infer each image sequentially.
                per_results: list[PerImageResult] = []
                first_model_version: Optional[str] = None

                for ci in image_rows:
                    # Check cancellation before each image.
                    db.refresh(job)
                    if job.status == "cancelled":
                        return

                    img_path = DATA_DIR / ci["image_path"]
                    img_bytes = img_path.read_bytes()
                    task_id = generate_task_id("bimg")
                    done_event = threading.Event()
                    task_result: list = []  # mutable container for closure
                    result_gate = _TaskResultGate(done_event, task_result)

                    def _on_done(
                        rec: TaskRecord,
                        _gate=result_gate,
                    ):
                        _gate.accept(rec)

                    queue.submit_per_image(
                        task_id,
                        priority=BATCH_PRIORITY,
                        image_bytes_getter=lambda _b=img_bytes: _b,
                        check_project=check_project,
                        check_seen=clinical_text,
                        on_complete=_on_done,
                    )

                    # Block until this single image is done.
                    task_record = _completed_task_record(done_event, task_result, timeout=300)
                    result_gate.close()

                    # Cancellation may have happened while inference was running.
                    db.refresh(job)
                    if job.status == "cancelled":
                        return

                    if task_record is None:
                        _cancel_inference_task_if_supported(task_id)
                        if not _transition_running_batch(
                            db,
                            job_id,
                            "failed",
                            error_message="图像推理超时，批量任务已停止，请重新提交。",
                        ):
                            return
                        db.refresh(job)
                        job.completed_images += 1
                        job.completed_patients += 1
                        job.failed_patients += 1
                        db.commit()
                        return

                    # Update completed_images immediately.
                    job.completed_images += 1
                    db.commit()

                    if task_record and task_record.status == "done" and task_record.result:
                        res = task_record.result
                        first_model_version = first_model_version or res.model_version
                        db.add(PerImagePrediction(
                            image_id=ci["id"],
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
                        db.commit()

                # Serialize the final status check with aggregation writes so a
                # concurrent cancellation cannot commit between them.
                _begin_immediate_batch(db)
                job = db.query(BatchJob).filter(BatchJob.job_id == job_id).first()
                if job is None or job.status == "cancelled":
                    db.rollback()
                    return
                job.completed_patients += 1
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

                if job.completed_patients >= job.total_patients:
                    job.status = "completed"
                    job.finished_at = datetime.now(timezone.utc)
                db.commit()
            except Exception:
                db.rollback()
                import traceback
                print(f"[batch-serial-{job_id}] worker error:\n{traceback.format_exc()}")
                # Mark job as failed on unexpected error.
                try:
                    job = db.query(BatchJob).filter(BatchJob.job_id == job_id).first()
                    if job and job.status not in ("completed", "cancelled"):
                        job.status = "failed"
                        job.finished_at = datetime.now(timezone.utc)
                        job.error_message = "批量任务处理失败，请重新提交。"
                        db.commit()
                except Exception:
                    pass
                return
            finally:
                db.close()

    t = threading.Thread(target=_worker, name=f"batch-serial-{job_id}", daemon=True)
    t.start()
    return t


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
        db.rollback()
        (
            db.query(BatchJob)
            .filter(
                BatchJob.job_id == job_id,
                BatchJob.user_id == user_id,
                BatchJob.status.in_(("pending", "running")),
            )
            .update(
                {
                    BatchJob.status: "cancelled",
                    BatchJob.finished_at: datetime.now(timezone.utc),
                },
                synchronize_session=False,
            )
        )
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
            job.finished_at = datetime.now(timezone.utc)
            job.error_message = "服务重启，批量任务已中断，请重新提交。"
            fixed += 1
        db.commit()
    finally:
        db.close()
    return fixed
