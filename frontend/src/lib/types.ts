export interface HealthResponse {
  status: string
  model_version: string
  model_loaded: boolean
  uptime_seconds: number
}

export interface Probabilities {
  normal: number
  endometrial_cancer: number
  polyp: number
}

export type PredictedClass = 'normal' | 'endometrial_cancer' | 'polyp'

export interface Prediction {
  predicted_class: PredictedClass
  predicted_class_zh: string
  confidence: number
  probabilities: Probabilities
  gradcam_url: string
  model_version: string
  inference_ms: number
}

export interface PredictResponse {
  case_id: string
  prediction: Prediction
  created_at: string
}

export interface BatchSubmitResponse {
  job_id: string
  total: number
  status_url: string
}

export interface BatchResultItem {
  case_id: string
  filename: string
  predicted_class_zh: string
  confidence: number
}

export type BatchStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface BatchStatusResponse {
  job_id: string
  total: number
  completed: number
  succeeded: number
  failed: number
  status: BatchStatus
  started_at: string
  results: BatchResultItem[]
}

export interface Judgment {
  final_class: PredictedClass
  final_class_zh: string
  recommendation: string
  note: string
  doctor_id: string
  judged_at: string
}

export interface CaseListItem {
  case_id: string
  patient_no: string
  created_at: string
  predicted_class_zh: string
  confidence: number
  doctor_judgment: PredictedClass | null
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
  created_at: string
  clinical_text: string
  image_path: string
  image_format: string
  doctor_id: string
  prediction: Prediction | null
  judgment: Judgment | null
}

export interface JudgmentRequest {
  final_class: PredictedClass
  recommendation: string
  note: string
}

export interface JudgmentResponse {
  ok: boolean
  judgment: Judgment
}

export interface CaseListParams {
  keyword?: string
  class?: PredictedClass
  date_from?: string
  date_to?: string
  doctor_id?: string
  page?: number
  page_size?: number
}
