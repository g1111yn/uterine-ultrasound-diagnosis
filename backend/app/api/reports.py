from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response
from sqlalchemy.orm import Session

from app.models.db import get_db, Case, CaseImage, Prediction, Judgment, User
from app.services import audit, auth
from app.services.report_pdf import generate_report_pdf

router = APIRouter()


@router.get("/cases/{case_id}/report.pdf")
async def get_report_pdf(
    case_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_user),
):
    case = db.query(Case).filter(Case.case_id == case_id).first()
    if not case:
        return JSONResponse(
            status_code=404,
            content={"error": {"code": "NOT_FOUND", "message": f"Case {case_id} not found."}},
        )

    prediction = db.query(Prediction).filter(Prediction.case_id == case_id).first()
    judgment = db.query(Judgment).filter(Judgment.case_id == case_id).first()
    images = (
        db.query(CaseImage)
        .filter(CaseImage.case_id == case_id)
        .order_by(CaseImage.sequence)
        .all()
    )

    pdf_bytes = generate_report_pdf(case, prediction, judgment, images=images)

    audit.log_event(
        user_id=current_user.user_id,
        action="export_report",
        resource_type="case",
        resource_id=case_id,
        request=request,
    )

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="report-{case_id}.pdf"'},
    )
