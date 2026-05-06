from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


CLASS_ZH = {
    "normal": "子宫正常大",
    "endometrial_cancer": "子宫内膜癌",
    "polyp": "息肉",
}

RECOMMENDATION_OPTIONS = {"none", "followup", "biopsy", "surgery", "other"}


class ProbabilitiesOut(BaseModel):
    normal: float
    endometrial_cancer: float
    polyp: float


class PredictionOut(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    predicted_class: str
    predicted_class_zh: str
    confidence: float
    probabilities: ProbabilitiesOut
    gradcam_url: str
    model_version: str
    inference_ms: int


class PredictResponse(BaseModel):
    case_id: str
    prediction: PredictionOut
    created_at: datetime


class BatchCreateResponse(BaseModel):
    job_id: str
    total: int
    status_url: str


class BatchResultItem(BaseModel):
    case_id: str
    filename: str
    predicted_class_zh: str
    confidence: float


class BatchStatusResponse(BaseModel):
    job_id: str
    total: int
    completed: int
    succeeded: int
    failed: int
    status: str
    started_at: Optional[datetime] = None
    results: list[BatchResultItem] = []


class CaseListItem(BaseModel):
    case_id: str
    patient_no: str
    created_at: datetime
    predicted_class_zh: Optional[str] = None
    confidence: Optional[float] = None
    doctor_judgment: Optional[str] = None
    doctor_judgment_zh: Optional[str] = None
    agreement: Optional[bool] = None
    doctor_name: Optional[str] = None


class CaseListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[CaseListItem]


class JudgmentIn(BaseModel):
    final_class: str
    recommendation: str = "none"
    note: str = ""


class JudgmentOut(BaseModel):
    id: int
    case_id: str
    final_class: str
    recommendation: str
    note: str
    doctor_id: str
    judged_at: datetime


class JudgmentResponse(BaseModel):
    ok: bool
    judgment: JudgmentOut


class CaseDetailPrediction(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    predicted_class: str
    predicted_class_zh: str
    confidence: float
    probabilities: ProbabilitiesOut
    gradcam_url: str
    model_version: str
    inference_ms: int
    created_at: datetime


class CaseDetailJudgment(BaseModel):
    final_class: str
    final_class_zh: str
    recommendation: str
    note: str
    doctor_id: str
    judged_at: datetime


class CaseDetailResponse(BaseModel):
    case_id: str
    patient_no: str
    image_path: str
    image_format: str
    clinical_text: str
    doctor_id: str
    created_at: datetime
    prediction: Optional[CaseDetailPrediction] = None
    judgment: Optional[CaseDetailJudgment] = None


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail


class HealthResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    status: str
    model_version: str
    model_loaded: bool
    uptime_seconds: int
