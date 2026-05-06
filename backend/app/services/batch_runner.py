import csv
import io
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from app.models.db import SessionLocal, Case, Prediction, BatchJob
from app.services.inference import inferencer
from app.services.gradcam import generate_placeholder_gradcam
from app.utils.ids import generate_case_id
from app.utils.image import save_upload_with_preview

_executor = ThreadPoolExecutor(max_workers=4)


def submit_batch(files: list[tuple[str, bytes]], manifest_rows: dict[str, str] | None, doctor_id: str, job_id: str):
    _executor.submit(_run_batch, files, manifest_rows, doctor_id, job_id)


def _run_batch(files: list[tuple[str, bytes]], manifest_rows: dict[str, str] | None, doctor_id: str, job_id: str):
    db = SessionLocal()
    try:
        job = db.query(BatchJob).filter(BatchJob.job_id == job_id).first()
        if not job:
            return
        job.status = "running"
        db.commit()

        for filename, content in files:
            case_id = generate_case_id()
            clinical_text = ""
            patient_no = ""
            if manifest_rows and filename in manifest_rows:
                clinical_text = manifest_rows.get(filename, "")

            try:
                rel_path, fmt, preview_path = save_upload_with_preview(content, filename)
                if fmt == "dcm" and not preview_path:
                    raise ValueError("DICOM decode failed")
                result = inferencer.predict(content, clinical_text)
                gradcam_path = generate_placeholder_gradcam(case_id)

                case = Case(
                    case_id=case_id,
                    patient_no=patient_no,
                    image_path=rel_path,
                    image_format=fmt,
                    preview_path=preview_path,
                    clinical_text=clinical_text,
                    doctor_id=doctor_id,
                    batch_job_id=job_id,
                )
                db.add(case)

                pred = Prediction(
                    case_id=case_id,
                    model_version=result.model_version,
                    prob_normal=result.prob_normal,
                    prob_cancer=result.prob_cancer,
                    prob_polyp=result.prob_polyp,
                    predicted_class=result.predicted_class,
                    confidence=result.confidence,
                    gradcam_path=gradcam_path,
                    inference_ms=result.inference_ms,
                )
                db.add(pred)
                db.commit()

                job.completed += 1
                job.succeeded += 1
            except Exception:
                db.rollback()
                job.completed += 1
                job.failed += 1

            db.commit()

        job.status = "completed"
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
    except Exception:
        db.rollback()
        try:
            job = db.query(BatchJob).filter(BatchJob.job_id == job_id).first()
            if job:
                job.status = "failed"
                job.finished_at = datetime.now(timezone.utc)
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


def parse_manifest(content: bytes) -> dict[str, str]:
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    mapping = {}
    for row in reader:
        fn = row.get("filename", "").strip()
        ct = row.get("clinical_text", "").strip()
        if fn:
            mapping[fn] = ct
    return mapping
