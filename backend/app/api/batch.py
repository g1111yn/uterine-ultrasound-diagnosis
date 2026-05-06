from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.models.db import get_db, BatchJob, Prediction, Case
from app.models.schemas import BatchStatusResponse, BatchResultItem, CLASS_ZH

router = APIRouter()


@router.get("/batch/{job_id}", response_model=BatchStatusResponse)
async def get_batch_status(job_id: str, db: Session = Depends(get_db)):
    job = db.query(BatchJob).filter(BatchJob.job_id == job_id).first()
    if not job:
        return JSONResponse(status_code=404, content={"error": {"code": "NOT_FOUND", "message": f"Batch job {job_id} not found."}})

    results = []
    if job.completed > 0:
        preds = (
            db.query(Prediction, Case)
            .join(Case, Prediction.case_id == Case.case_id)
            .filter(Case.batch_job_id == job_id)
            .order_by(Prediction.created_at.desc())
            .all()
        )
        for pred, case in preds:
            results.append(BatchResultItem(
                case_id=pred.case_id,
                filename=case.image_path.split("/")[-1],
                predicted_class_zh=CLASS_ZH.get(pred.predicted_class, pred.predicted_class),
                confidence=pred.confidence,
            ))

    return BatchStatusResponse(
        job_id=job.job_id,
        total=job.total,
        completed=job.completed,
        succeeded=job.succeeded,
        failed=job.failed,
        status=job.status,
        started_at=job.started_at,
        results=results,
    )
