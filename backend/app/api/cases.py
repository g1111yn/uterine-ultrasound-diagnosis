from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse, FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_, outerjoin, select

from app.models.db import get_db, Case, Prediction, Judgment
from app.models.schemas import (
    CaseListResponse, CaseListItem, CaseDetailResponse, CaseDetailPrediction,
    CaseDetailJudgment, ProbabilitiesOut, JudgmentIn, JudgmentResponse, JudgmentOut,
    CLASS_ZH, RECOMMENDATION_OPTIONS,
)
from app.config import DATA_DIR

router = APIRouter()


@router.get("/cases", response_model=CaseListResponse)
async def list_cases(
    keyword: Optional[str] = Query(None),
    predicted_class: Optional[str] = Query(None, alias="class"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    doctor_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    q = db.query(Case, Prediction, Judgment).outerjoin(
        Prediction, Case.case_id == Prediction.case_id
    ).outerjoin(
        Judgment, Case.case_id == Judgment.case_id
    )

    if keyword:
        pattern = f"%{keyword}%"
        q = q.filter(or_(Case.patient_no.like(pattern), Case.case_id.like(pattern), Case.clinical_text.like(pattern)))
    if doctor_id:
        q = q.filter(Case.doctor_id == doctor_id)
    if date_from:
        try:
            dt = datetime.fromisoformat(date_from)
            q = q.filter(Case.created_at >= dt)
        except ValueError:
            pass
    if date_to:
        try:
            dt = datetime.fromisoformat(date_to)
            q = q.filter(Case.created_at <= dt)
        except ValueError:
            pass

    if predicted_class:
        q = q.filter(Prediction.predicted_class == predicted_class)

    total = q.count()
    rows = q.order_by(Case.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    items = []
    for c, pred, judg in rows:
        predicted_class_zh = CLASS_ZH.get(pred.predicted_class, pred.predicted_class) if pred else None
        confidence = pred.confidence if pred else None
        doctor_judgment = judg.final_class if judg else None
        doctor_judgment_zh = CLASS_ZH.get(judg.final_class, judg.final_class) if judg else None
        agreement = None
        if pred and judg:
            agreement = pred.predicted_class == judg.final_class

        items.append(CaseListItem(
            case_id=c.case_id,
            patient_no=c.patient_no,
            created_at=c.created_at,
            predicted_class_zh=predicted_class_zh,
            confidence=confidence,
            doctor_judgment=doctor_judgment,
            doctor_judgment_zh=doctor_judgment_zh,
            agreement=agreement,
            doctor_name=c.doctor_id,
        ))

    return CaseListResponse(total=total, page=page, page_size=page_size, items=items)


@router.get("/cases/{case_id}", response_model=CaseDetailResponse)
async def get_case(case_id: str, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.case_id == case_id).first()
    if not case:
        return JSONResponse(status_code=404, content={"error": {"code": "NOT_FOUND", "message": f"Case {case_id} not found."}})

    pred = db.query(Prediction).filter(Prediction.case_id == case_id).first()
    judg = db.query(Judgment).filter(Judgment.case_id == case_id).first()

    prediction_out = None
    if pred:
        prediction_out = CaseDetailPrediction(
            predicted_class=pred.predicted_class,
            predicted_class_zh=CLASS_ZH.get(pred.predicted_class, pred.predicted_class),
            confidence=pred.confidence,
            probabilities=ProbabilitiesOut(
                normal=pred.prob_normal,
                endometrial_cancer=pred.prob_cancer,
                polyp=pred.prob_polyp,
            ),
            gradcam_url=f"/api/cases/{case_id}/gradcam.png",
            model_version=pred.model_version,
            inference_ms=pred.inference_ms,
            created_at=pred.created_at,
        )

    judgment_out = None
    if judg:
        judgment_out = CaseDetailJudgment(
            final_class=judg.final_class,
            final_class_zh=CLASS_ZH.get(judg.final_class, judg.final_class),
            recommendation=judg.recommendation,
            note=judg.note,
            doctor_id=judg.doctor_id,
            judged_at=judg.judged_at,
        )

    return CaseDetailResponse(
        case_id=case.case_id,
        patient_no=case.patient_no,
        image_path=case.image_path,
        image_format=case.image_format,
        clinical_text=case.clinical_text,
        doctor_id=case.doctor_id,
        created_at=case.created_at,
        prediction=prediction_out,
        judgment=judgment_out,
    )


@router.post("/cases/{case_id}/judgment", response_model=JudgmentResponse)
async def submit_judgment(
    case_id: str,
    body: JudgmentIn,
    db: Session = Depends(get_db),
):
    case = db.query(Case).filter(Case.case_id == case_id).first()
    if not case:
        return JSONResponse(status_code=404, content={"error": {"code": "NOT_FOUND", "message": f"Case {case_id} not found."}})

    valid_classes = {"normal", "endometrial_cancer", "polyp"}
    if body.final_class not in valid_classes:
        return JSONResponse(status_code=400, content={"error": {"code": "INVALID_CLASS", "message": f"final_class must be one of {valid_classes}"}})
    if body.recommendation not in RECOMMENDATION_OPTIONS:
        return JSONResponse(status_code=400, content={"error": {"code": "INVALID_RECOMMENDATION", "message": f"recommendation must be one of {RECOMMENDATION_OPTIONS}"}})

    existing = db.query(Judgment).filter(Judgment.case_id == case_id).first()
    if existing:
        existing.final_class = body.final_class
        existing.recommendation = body.recommendation
        existing.note = body.note
        db.commit()
        db.refresh(existing)
        judg = existing
    else:
        judg = Judgment(
            case_id=case_id,
            final_class=body.final_class,
            recommendation=body.recommendation,
            note=body.note,
            doctor_id=case.doctor_id,
        )
        db.add(judg)
        db.commit()
        db.refresh(judg)

    return JudgmentResponse(
        ok=True,
        judgment=JudgmentOut(
            id=judg.id,
            case_id=judg.case_id,
            final_class=judg.final_class,
            recommendation=judg.recommendation,
            note=judg.note,
            doctor_id=judg.doctor_id,
            judged_at=judg.judged_at,
        ),
    )


@router.get("/cases/{case_id}/image")
async def get_case_image(case_id: str, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.case_id == case_id).first()
    if not case:
        return JSONResponse(status_code=404, content={"error": {"code": "NOT_FOUND", "message": f"Case {case_id} not found."}})

    # For DICOM cases, serve the decoded PNG preview so browsers can render it.
    if case.image_format == "dcm" and getattr(case, "preview_path", None):
        preview_path = DATA_DIR / case.preview_path
        if preview_path.exists():
            return FileResponse(str(preview_path), media_type="image/png")

    file_path = DATA_DIR / case.image_path
    if not file_path.exists():
        return JSONResponse(status_code=404, content={"error": {"code": "NOT_FOUND", "message": "Image file missing."}})

    media_types = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "bmp": "image/bmp", "dcm": "application/dicom"}
    media_type = media_types.get(case.image_format, "application/octet-stream")
    return FileResponse(str(file_path), media_type=media_type)


@router.get("/cases/{case_id}/original")
async def get_case_original(case_id: str, db: Session = Depends(get_db)):
    """Download the original uploaded file (e.g. raw DICOM) as an attachment."""
    case = db.query(Case).filter(Case.case_id == case_id).first()
    if not case:
        return JSONResponse(status_code=404, content={"error": {"code": "NOT_FOUND", "message": f"Case {case_id} not found."}})

    file_path = DATA_DIR / case.image_path
    if not file_path.exists():
        return JSONResponse(status_code=404, content={"error": {"code": "NOT_FOUND", "message": "Original file missing."}})

    media_types = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "bmp": "image/bmp", "dcm": "application/dicom"}
    media_type = media_types.get(case.image_format, "application/octet-stream")
    filename = f"{case.case_id}.{case.image_format}"
    return FileResponse(
        str(file_path),
        media_type=media_type,
        filename=filename,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/cases/{case_id}/gradcam.png")
async def get_gradcam(case_id: str, db: Session = Depends(get_db)):
    pred = db.query(Prediction).filter(Prediction.case_id == case_id).first()
    if not pred or not pred.gradcam_path:
        return JSONResponse(status_code=404, content={"error": {"code": "NOT_FOUND", "message": "Grad-CAM image not found."}})

    file_path = DATA_DIR / pred.gradcam_path
    if not file_path.exists():
        return JSONResponse(status_code=404, content={"error": {"code": "NOT_FOUND", "message": "Grad-CAM file missing."}})

    return FileResponse(str(file_path), media_type="image/png")
