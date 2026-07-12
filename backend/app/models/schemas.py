from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


CLASS_ZH = {
    "normal": "子宫正常大",
    "endometrial_cancer": "子宫内膜癌",
    "polyp": "息肉",
}

MODEL_CLASSES = set(CLASS_ZH)
VALID_JUDGMENT_CLASSES = MODEL_CLASSES | {"indeterminate"}
JUDGMENT_CLASS_ZH = {
    **CLASS_ZH,
    "endometrial_cancer": "疑似子宫内膜癌",
    "indeterminate": "无法判断 / 需进一步检查",
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
    aggregation_strategy: str
    image_count: int
    model_version: str


class PerImagePredictionOut(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    image_id: int
    predicted_class: str
    predicted_class_zh: str
    confidence: float
    probabilities: ProbabilitiesOut
    gradcam_url: str
    model_version: str
    inference_ms: int


class CaseImageOut(BaseModel):
    image_id: int
    sequence: int
    image_url: str
    original_url: str
    image_format: str
    original_filename: str
    per_image_prediction: Optional[PerImagePredictionOut] = None


class PredictAcceptedResponse(BaseModel):
    case_id: str
    task_id: str
    image_count: int
    estimated_wait_ms: int
    status_url: str


class TaskStatusResponse(BaseModel):
    task_id: str
    kind: str
    status: str  # queued | running | done | failed
    priority: int
    queue_position: Optional[int] = None
    estimated_wait_ms: Optional[int] = None
    error: Optional[str] = None
    case_id: Optional[str] = None


class BatchResultItem(BaseModel):
    case_id: str
    patient_no: str
    predicted_class: Optional[str] = None
    predicted_class_zh: Optional[str] = None
    confidence: Optional[float] = None
    image_count: int
    error: Optional[str] = None


class BatchJobListItem(BaseModel):
    job_id: str
    status: str
    total_patients: int
    completed_patients: int
    succeeded_patients: int
    failed_patients: int
    total_images: int
    completed_images: int
    aggregation_strategy: str
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


class BatchJobListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[BatchJobListItem]


class BatchStatusResponse(BaseModel):
    job_id: str
    total_patients: int
    completed_patients: int
    succeeded_patients: int
    failed_patients: int
    total_images: int
    completed_images: int
    status: str
    error: Optional[str] = None
    aggregation_strategy: str
    current_patient: str = ""
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    estimated_remaining_ms: Optional[int] = None
    results: list[BatchResultItem] = []


class CaseListItem(BaseModel):
    case_id: str
    patient_no: str
    created_at: datetime
    image_count: int
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
    recommendation: Optional[str] = None
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


class CaseDetailJudgment(BaseModel):
    final_class: str
    final_class_zh: str
    recommendation: str
    note: str
    doctor_id: str
    judged_at: datetime


class CaseDetailResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    case_id: str
    patient_no: str
    check_project: str = ""
    clinical_text: str
    doctor_id: str
    created_at: datetime
    images: list[CaseImageOut]
    prediction: Optional[PredictionOut] = None
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
    queue_length: int = 0


# -- Auth / admin ------------------------------------------------------------


class LoginIn(BaseModel):
    user_id: str
    password: str


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


class UserOut(BaseModel):
    user_id: str
    display_name: str
    department: str
    role: str
    is_active: bool
    must_change_password: bool
    last_login_at: Optional[datetime] = None
    created_at: Optional[datetime] = None


class LoginResponse(BaseModel):
    user: UserOut


class MeResponse(BaseModel):
    user: UserOut


class AdminUserCreateIn(BaseModel):
    user_id: str
    display_name: str = ""
    department: str = ""
    password: str
    role: str = "doctor"


class AdminUserUpdateIn(BaseModel):
    display_name: Optional[str] = None
    department: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    new_password: Optional[str] = None
    force_password_change: Optional[bool] = None


class AdminUserListResponse(BaseModel):
    total: int
    items: list[UserOut]


class AuditLogItem(BaseModel):
    id: int
    timestamp: datetime
    user_id: Optional[str]
    action: str
    resource_type: str
    resource_id: str
    ip_address: str
    success: bool
    detail: str


class AuditLogListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[AuditLogItem]
