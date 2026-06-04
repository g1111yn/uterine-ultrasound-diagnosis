"""Cases API: list, detail, per-image asset endpoints, judgment."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse, FileResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.config import DATA_DIR
from app.models.db import (
    get_db,
    Case,
    CaseImage,
    PerImagePrediction,
    Prediction,
    Judgment,
    User,
)
from app.models.schemas import (
    CLASS_ZH,
    RECOMMENDATION_OPTIONS,
    CaseDetailJudgment,
    CaseDetailResponse,
    CaseImageOut,
    CaseListItem,
    CaseListResponse,
    JudgmentIn,
    JudgmentOut,
    JudgmentResponse,
    PerImagePredictionOut,
    PredictionOut,
    ProbabilitiesOut,
)
from app.services import audit, auth

router = APIRouter()


MEDIA_TYPES = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "bmp": "image/bmp",
    "tif": "image/tiff",
    "tiff": "image/tiff",
    "dcm": "application/dicom",
}


def _not_found(message: str):
    return JSONResponse(
        status_code=404,
        content={"error": {"code": "NOT_FOUND", "message": message}},
    )


@router.get("/cases", response_model=CaseListResponse)
async def list_cases(
    keyword: Optional[str] = Query(None),
    predicted_class: Optional[str] = Query(None, alias="class"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    doctor_id: Optional[str] = Query(None),
    source: Optional[str] = Query(None),  # "single" | "batch" | None(all)
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _user: User = Depends(auth.require_user),
):
    q = (
        db.query(Case, Prediction, Judgment)
        .outerjoin(Prediction, Case.case_id == Prediction.case_id)
        .outerjoin(Judgment, Case.case_id == Judgment.case_id)
    )

    if keyword:
        pattern = f"%{keyword}%"
        q = q.filter(
            or_(
                Case.patient_no.like(pattern),
                Case.case_id.like(pattern),
                Case.clinical_text.like(pattern),
            )
        )
    if doctor_id:
        q = q.filter(Case.doctor_id == doctor_id)
    if source == "single":
        q = q.filter(Case.batch_job_id.is_(None))
    elif source == "batch":
        q = q.filter(Case.batch_job_id.isnot(None))
    if date_from:
        try:
            q = q.filter(Case.created_at >= datetime.fromisoformat(date_from))
        except ValueError:
            pass
    if date_to:
        try:
            dt = datetime.fromisoformat(date_to)
            # date_to 精确到天时，包含当天全天
            if len(date_to) == 10:
                dt = dt.replace(hour=23, minute=59, second=59)
            q = q.filter(Case.created_at <= dt)
        except ValueError:
            pass
    if predicted_class:
        q = q.filter(Prediction.predicted_class == predicted_class)

    total = q.count()
    rows = (
        q.order_by(Case.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    # Image counts in one extra query.
    case_ids = [c.case_id for c, _, _ in rows]
    counts: dict[str, int] = {}
    if case_ids:
        count_rows = (
            db.query(CaseImage.case_id, func.count(CaseImage.id))
            .filter(CaseImage.case_id.in_(case_ids))
            .group_by(CaseImage.case_id)
            .all()
        )
        counts = {cid: n for cid, n in count_rows}

    items = []
    for c, pred, judg in rows:
        predicted_class_zh = CLASS_ZH.get(pred.predicted_class, pred.predicted_class) if pred else None
        confidence = pred.confidence if pred else None
        doctor_judgment = judg.final_class if judg else None
        doctor_judgment_zh = CLASS_ZH.get(judg.final_class, judg.final_class) if judg else None
        agreement = None
        if pred and judg:
            agreement = pred.predicted_class == judg.final_class

        items.append(
            CaseListItem(
                case_id=c.case_id,
                patient_no=c.patient_no,
                created_at=c.created_at,
                image_count=counts.get(c.case_id, 0),
                predicted_class_zh=predicted_class_zh,
                confidence=confidence,
                doctor_judgment=doctor_judgment,
                doctor_judgment_zh=doctor_judgment_zh,
                agreement=agreement,
                doctor_name=c.doctor_id,
            )
        )

    return CaseListResponse(total=total, page=page, page_size=page_size, items=items)


@router.get("/cases/{case_id}", response_model=CaseDetailResponse)
async def get_case(case_id: str, db: Session = Depends(get_db), _user: User = Depends(auth.require_user)):
    case = db.query(Case).filter(Case.case_id == case_id).first()
    if not case:
        return _not_found(f"Case {case_id} not found.")

    images = (
        db.query(CaseImage)
        .filter(CaseImage.case_id == case_id)
        .order_by(CaseImage.sequence)
        .all()
    )
    image_out: list[CaseImageOut] = []
    for img in images:
        pip = img.per_image_prediction
        pip_out = None
        if pip:
            pip_out = PerImagePredictionOut(
                image_id=img.id,
                predicted_class=pip.predicted_class,
                predicted_class_zh=CLASS_ZH.get(pip.predicted_class, pip.predicted_class),
                confidence=pip.confidence,
                probabilities=ProbabilitiesOut(
                    normal=pip.prob_normal,
                    endometrial_cancer=pip.prob_cancer,
                    polyp=pip.prob_polyp,
                ),
                gradcam_url=f"/api/images/{img.id}/gradcam",
                model_version=pip.model_version,
                inference_ms=pip.inference_ms,
            )
        image_out.append(
            CaseImageOut(
                image_id=img.id,
                sequence=img.sequence,
                image_url=f"/api/images/{img.id}",
                original_url=f"/api/images/{img.id}/original",
                image_format=img.image_format,
                original_filename=img.original_filename,
                per_image_prediction=pip_out,
            )
        )

    pred = case.prediction
    prediction_out = None
    if pred:
        prediction_out = PredictionOut(
            predicted_class=pred.predicted_class,
            predicted_class_zh=CLASS_ZH.get(pred.predicted_class, pred.predicted_class),
            confidence=pred.confidence,
            probabilities=ProbabilitiesOut(
                normal=pred.prob_normal,
                endometrial_cancer=pred.prob_cancer,
                polyp=pred.prob_polyp,
            ),
            aggregation_strategy=pred.aggregation_strategy,
            image_count=pred.image_count,
            model_version=pred.model_version,
        )

    judg = case.judgment
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
        check_project=case.check_project or "",
        clinical_text=case.clinical_text,
        doctor_id=case.doctor_id,
        created_at=case.created_at,
        images=image_out,
        prediction=prediction_out,
        judgment=judgment_out,
    )


@router.post("/cases/{case_id}/judgment", response_model=JudgmentResponse)
async def submit_judgment(
    case_id: str,
    body: JudgmentIn,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_user),
):
    case = db.query(Case).filter(Case.case_id == case_id).first()
    if not case:
        return _not_found(f"Case {case_id} not found.")

    valid_classes = {"normal", "endometrial_cancer", "polyp"}
    if body.final_class not in valid_classes:
        return JSONResponse(
            status_code=400,
            content={"error": {"code": "INVALID_CLASS", "message": f"final_class must be one of {valid_classes}"}},
        )
    if body.recommendation not in RECOMMENDATION_OPTIONS:
        return JSONResponse(
            status_code=400,
            content={"error": {"code": "INVALID_RECOMMENDATION", "message": f"recommendation must be one of {RECOMMENDATION_OPTIONS}"}},
        )

    existing = db.query(Judgment).filter(Judgment.case_id == case_id).first()
    if existing:
        existing.final_class = body.final_class
        existing.recommendation = body.recommendation
        existing.note = body.note
        existing.doctor_id = current_user.user_id
        db.commit()
        db.refresh(existing)
        judg = existing
    else:
        judg = Judgment(
            case_id=case_id,
            final_class=body.final_class,
            recommendation=body.recommendation,
            note=body.note,
            doctor_id=current_user.user_id,
        )
        db.add(judg)
        db.commit()
        db.refresh(judg)

    audit.log_event(
        user_id=current_user.user_id,
        action="submit_judgment",
        resource_type="case",
        resource_id=case_id,
        request=request,
        detail={"final_class": body.final_class, "recommendation": body.recommendation},
    )

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


# -- Per-image asset endpoints -----------------------------------------------


@router.get("/images/{image_id}")
async def get_image(image_id: int, db: Session = Depends(get_db), _user: User = Depends(auth.require_user)):
    img = db.query(CaseImage).filter(CaseImage.id == image_id).first()
    if not img:
        return _not_found(f"Image {image_id} not found.")

    # Browsers can't render raw DICOM, so serve the PNG preview when present.
    if img.image_format == "dcm" and img.preview_path:
        preview = DATA_DIR / img.preview_path
        if preview.exists():
            return FileResponse(str(preview), media_type="image/png")

    path = DATA_DIR / img.image_path
    if not path.exists():
        return _not_found("Image file missing.")
    media_type = MEDIA_TYPES.get(img.image_format, "application/octet-stream")
    return FileResponse(str(path), media_type=media_type)


@router.get("/images/{image_id}/original")
async def get_image_original(image_id: int, db: Session = Depends(get_db), _user: User = Depends(auth.require_user)):
    img = db.query(CaseImage).filter(CaseImage.id == image_id).first()
    if not img:
        return _not_found(f"Image {image_id} not found.")
    path = DATA_DIR / img.image_path
    if not path.exists():
        return _not_found("Original file missing.")
    media_type = MEDIA_TYPES.get(img.image_format, "application/octet-stream")
    filename = f"{img.case_id}-{img.sequence}.{img.image_format}"
    return FileResponse(
        str(path),
        media_type=media_type,
        filename=filename,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/images/{image_id}/gradcam")
async def get_image_gradcam(image_id: int, db: Session = Depends(get_db), _user: User = Depends(auth.require_user)):
    pip = (
        db.query(PerImagePrediction)
        .filter(PerImagePrediction.image_id == image_id)
        .first()
    )
    if not pip or not pip.gradcam_path:
        return _not_found("Grad-CAM not available.")
    path = DATA_DIR / pip.gradcam_path
    if not path.exists():
        return _not_found("Grad-CAM file missing.")
    return FileResponse(str(path), media_type="image/png")
