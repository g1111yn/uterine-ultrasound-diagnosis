from datetime import datetime, timezone
from fastapi import APIRouter, UploadFile, File, Form, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.models.db import get_db, Case, Prediction
from app.models.schemas import PredictResponse, PredictionOut, ProbabilitiesOut, CLASS_ZH
from app.services.inference import inferencer
from app.services.gradcam import generate_placeholder_gradcam
from app.services.batch_runner import submit_batch, parse_manifest
from app.utils.ids import generate_case_id, generate_batch_id
from app.utils.image import save_upload_with_preview
from app.models.db import BatchJob

router = APIRouter()


@router.post("/predict", response_model=PredictResponse)
async def predict(
    image: UploadFile = File(...),
    clinical_text: str = Form(""),
    patient_no: str = Form(""),
    doctor_id: str = Form("default"),
    db: Session = Depends(get_db),
):
    content = await image.read()
    if not content:
        return JSONResponse(status_code=400, content={"error": {"code": "EMPTY_IMAGE", "message": "Image file is empty."}})

    case_id = generate_case_id()
    rel_path, fmt, preview_path = save_upload_with_preview(content, image.filename or "upload.jpg")
    if fmt == "dcm" and not preview_path:
        return JSONResponse(
            status_code=400,
            content={"error": {"code": "DICOM_DECODE_FAILED", "message": "无法解析该 DICOM 文件的像素数据，可能已损坏或使用了不支持的传输语法。"}},
        )
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
    )
    db.add(case)

    now = datetime.now(timezone.utc)
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
        created_at=now,
    )
    db.add(pred)
    db.commit()

    return PredictResponse(
        case_id=case_id,
        prediction=PredictionOut(
            predicted_class=result.predicted_class,
            predicted_class_zh=CLASS_ZH.get(result.predicted_class, result.predicted_class),
            confidence=result.confidence,
            probabilities=ProbabilitiesOut(
                normal=result.prob_normal,
                endometrial_cancer=result.prob_cancer,
                polyp=result.prob_polyp,
            ),
            gradcam_url=f"/api/cases/{case_id}/gradcam.png",
            model_version=result.model_version,
            inference_ms=result.inference_ms,
        ),
        created_at=now,
    )


@router.post("/predict/batch")
async def predict_batch(
    images: list[UploadFile] = File(...),
    manifest: UploadFile | None = File(None),
    doctor_id: str = Form("default"),
    db: Session = Depends(get_db),
):
    if not images:
        return JSONResponse(status_code=400, content={"error": {"code": "NO_IMAGES", "message": "No images provided."}})

    manifest_rows = None
    if manifest:
        manifest_content = await manifest.read()
        if manifest_content:
            manifest_rows = parse_manifest(manifest_content)

    file_data = []
    for img in images:
        content = await img.read()
        file_data.append((img.filename or "unknown.jpg", content))

    job_id = generate_batch_id()
    job = BatchJob(
        job_id=job_id,
        total=len(file_data),
        completed=0,
        succeeded=0,
        failed=0,
        status="pending",
        doctor_id=doctor_id,
    )
    db.add(job)
    db.commit()

    submit_batch(file_data, manifest_rows, doctor_id, job_id)

    return JSONResponse(
        status_code=202,
        content={
            "job_id": job_id,
            "total": len(file_data),
            "status_url": f"/api/batch/{job_id}",
        },
    )
