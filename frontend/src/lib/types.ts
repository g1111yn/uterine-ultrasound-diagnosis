// ========== 通用 ==========
export interface HealthResponse {
  status: string
  model_version: string
  model_loaded: boolean
  uptime_seconds: number
  queue_length?: number
}

// ========== 预测类别 ==========
export interface Probabilities {
  normal: number
  endometrial_cancer: number
  polyp: number
}

export type PredictedClass = 'normal' | 'endometrial_cancer' | 'polyp'
export type JudgmentClass = PredictedClass | 'indeterminate'

// ========== 认证 ==========
export type UserRole = 'admin' | 'doctor'

export interface User {
  user_id: string
  display_name: string
  department: string | null
  role: UserRole
  is_active: boolean
  must_change_password: boolean
  last_login_at: string | null
  created_at: string
}

export interface LoginRequest {
  user_id: string
  password: string
}

export interface LoginResponse {
  user: User
}

export interface MeResponse {
  user: User
}

export interface ChangePasswordRequest {
  current_password: string
  new_password: string
}

// ========== 图像级预测 ==========
export interface PerImagePrediction {
  image_id: string
  predicted_class: PredictedClass
  predicted_class_zh: string
  confidence: number
  probabilities: Probabilities
  gradcam_url: string
  model_version: string
  inference_ms: number
}

export interface CaseImage {
  image_id: string
  sequence: number
  image_url: string
  original_url: string
  image_format: string
  original_filename: string
  per_image_prediction: PerImagePrediction | null
}

// ========== 病人级预测 ==========
export type AggregationStrategy = 'mean' | 'max_severity' | 'majority_vote'

export interface CasePrediction {
  predicted_class: PredictedClass
  predicted_class_zh: string
  confidence: number
  probabilities: Probabilities
  aggregation_strategy: AggregationStrategy
  image_count: number
  model_version: string
}

// ========== 单例推理提交 ==========
export interface PredictResponse {
  case_id: string
  task_id: string
  image_count: number
  estimated_wait_ms: number
  status_url?: string
}

// ========== 任务状态 ==========
export type TaskStatus = 'queued' | 'running' | 'done' | 'failed'

export interface TaskStatusResponse {
  task_id: string
  kind: string
  status: TaskStatus
  priority?: number
  queue_position: number
  estimated_wait_ms: number
  error: string | null
  case_id: string | null
}

// ========== 医生判断 ==========
export interface Judgment {
  final_class: JudgmentClass
  final_class_zh: string
  recommendation: string
  note: string
  doctor_id: string
  judged_at: string
}

export interface JudgmentRequest {
  final_class: JudgmentClass
  recommendation?: string | null
  note: string
}

export interface JudgmentResponse {
  ok: boolean
  judgment: Judgment
}

// ========== 病例列表 & 详情 ==========
export interface CaseListItem {
  case_id: string
  patient_no: string
  created_at: string
  image_count: number
  predicted_class_zh: string
  confidence: number
  doctor_judgment: JudgmentClass | null
  doctor_judgment_zh: string | null
  agreement: boolean | null
  doctor_name: string | null
}

export interface CaseListResponse {
  total: number
  page: number
  page_size: number
  items: CaseListItem[]
}

export interface CaseDetail {
  case_id: string
  patient_no: string
  check_project: string
  clinical_text: string
  doctor_id: string
  created_at: string
  images: CaseImage[]
  prediction: CasePrediction | null
  judgment: Judgment | null
}

export interface CaseListParams {
  keyword?: string
  class?: PredictedClass
  date_from?: string
  date_to?: string
  doctor_id?: string
  source?: 'single' | 'batch'
  page?: number
  page_size?: number
}

// ========== 批量推理 ==========

export interface BatchDiagnostic {
  /** 诊断类型 */
  kind:
    | 'unknown_column'
    | 'empty_patient_no'
    | 'duplicate_patient_no'
    | 'clinical_text_truncated'
    | 'missing_directory'
    | 'directory_not_in_manifest'
  /** manifest.csv 中的行号（如适用） */
  row?: number
  /** 列名（unknown_column 用） */
  column?: string
  /** 编辑距离推荐的列名 */
  suggest?: string | null
  /** patient_no（如适用） */
  patient_no?: string
  /** 给医生看的中文描述 */
  message: string
}

export interface BatchSubmitResponse {
  job_id: string
  total_patients: number
  total_images: number
  status_url: string
  warnings: BatchDiagnostic[]
}

export type BatchJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface BatchResultItem {
  patient_no: string
  case_id: string | null
  image_count: number
  predicted_class: PredictedClass | null
  predicted_class_zh: string | null
  confidence: number | null
  error: string | null
}

export interface BatchJobListItem {
  job_id: string
  status: BatchJobStatus
  total_patients: number
  completed_patients: number
  succeeded_patients: number
  failed_patients: number
  total_images: number
  completed_images: number
  aggregation_strategy: AggregationStrategy
  started_at: string
  finished_at: string | null
}

export interface BatchJobListResponse {
  total: number
  page: number
  page_size: number
  items: BatchJobListItem[]
}

export interface BatchStatusResponse {
  job_id: string
  status: BatchJobStatus
  total_patients: number
  completed_patients: number
  total_images: number
  completed_images: number
  estimated_remaining_ms: number
  current_patient: string | null
  started_at: string
  finished_at: string | null
  aggregation_strategy: AggregationStrategy
  results: BatchResultItem[]
  error: string | null
}

// ========== 管理员：用户 ==========
export interface AdminUserListResponse {
  total: number
  items: User[]
}

export interface AdminUserCreateIn {
  user_id: string
  display_name: string
  department?: string
  password: string
  role: UserRole
}

export interface AdminUserPatchIn {
  display_name?: string
  department?: string
  role?: UserRole
  is_active?: boolean
  new_password?: string
  force_password_change?: boolean
}

// ========== 管理员：审计日志 ==========
export interface AuditLogItem {
  id: number
  timestamp: string
  user_id: string | null
  display_name: string | null
  action: string
  resource_type: string | null
  resource_id: string | null
  ip_address: string | null
  success: boolean
  detail: string | null
}

export interface AuditLogListResponse {
  total: number
  page: number
  page_size: number
  items: AuditLogItem[]
}

export interface AuditLogParams {
  user_id?: string
  action?: string
  success?: boolean
  date_from?: string
  date_to?: string
  page?: number
  page_size?: number
}
