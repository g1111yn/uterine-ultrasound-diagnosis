from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse, Response
from sqlalchemy.orm import Session

from app.models.db import get_db, Case, Prediction, Judgment
from app.services.report_pdf import generate_report_pdf

router = APIRouter()


@router.get("/cases/{case_id}/report.pdf")
async def get_report_pdf(case_id: str, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.case_id == case_id).first()
    if not case:
        return JSONResponse(status_code=404, content={"error": {"code": "NOT_FOUND", "message": f"Case {case_id} not found."}})

    prediction = db.query(Prediction).filter(Prediction.case_id == case_id).first()
    judgment = db.query(Judgment).filter(Judgment.case_id == case_id).first()

    pdf_bytes = generate_report_pdf(case, prediction, judgment)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="report-{case_id}.pdf"'},
    )
