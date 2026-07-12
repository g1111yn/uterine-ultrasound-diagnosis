import axios, { type AxiosError } from 'axios'
import type {
  HealthResponse,
  PredictResponse,
  BatchSubmitResponse,
  BatchStatusResponse,
  BatchJobListResponse,
  BatchJobStatus,
  CaseListResponse,
  CaseListParams,
  CaseDetail,
  JudgmentRequest,
  JudgmentResponse,
  TaskStatusResponse,
  LoginRequest,
  LoginResponse,
  MeResponse,
  ChangePasswordRequest,
  AggregationStrategy,
  AdminUserListResponse,
  AdminUserCreateIn,
  AdminUserPatchIn,
  User,
  AuditLogListResponse,
  AuditLogParams,
} from '@/lib/types'

const client = axios.create({
  baseURL: '/api',
  timeout: 60000,
  withCredentials: true,
})

// 401 导航回调：由 AuthContext 注册
let onUnauthorized: (() => void) | null = null
export function registerUnauthorizedHandler(cb: (() => void) | null) {
  onUnauthorized = cb
}

// 统一错误抽取
function extractErrorMessage(error: AxiosError): string {
  const data = error.response?.data as
    | { error?: { code?: string; message?: string }; detail?: unknown }
    | undefined
  if (data?.error?.message) return data.error.message
  // detail 可能是对象 {code, message} 或字符串
  const detail = data?.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object') {
    const d = detail as { message?: string; code?: string }
    if (d.message) return d.message
  }
  return error.message || '请求失败'
}

function extractErrorCode(error: AxiosError): string | undefined {
  const data = error.response?.data as
    | { error?: { code?: string }; detail?: { code?: string } }
    | undefined
  return data?.error?.code ?? (typeof data?.detail === 'object' ? data?.detail?.code : undefined)
}

function extractErrorDetails(error: AxiosError): unknown[] | undefined {
  const data = error.response?.data as
    | { error?: { details?: unknown[] } }
    | undefined
  return data?.error?.details
}

client.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    const status = error.response?.status
    const code = extractErrorCode(error)
    const message = extractErrorMessage(error)
    const details = extractErrorDetails(error)

    // 401 统一跳登录（登录请求本身不跳）
    if (status === 401) {
      const url = error.config?.url ?? ''
      const isLoginCall = url.includes('/auth/login')
      if (!isLoginCall && onUnauthorized) {
        onUnauthorized()
      }
    }

    const err = new Error(message) as Error & {
      code?: string
      status?: number
      details?: unknown[]
    }
    if (code) err.code = code
    if (status) err.status = status
    if (details) err.details = details
    return Promise.reject(err)
  },
)

export default client

// ========== 健康 ==========
export async function getHealth(): Promise<HealthResponse> {
  const { data } = await client.get<HealthResponse>('/health')
  return data
}

// ========== 认证 ==========
export async function login(body: LoginRequest): Promise<LoginResponse> {
  const { data } = await client.post<LoginResponse>('/auth/login', body)
  return data
}

export async function logout(): Promise<void> {
  await client.post('/auth/logout')
}

export async function getMe(): Promise<MeResponse> {
  const { data } = await client.get<MeResponse>('/auth/me')
  return data
}

export async function changePassword(body: ChangePasswordRequest): Promise<{ ok: boolean }> {
  const { data } = await client.post<{ ok: boolean }>('/auth/change-password', body)
  return data
}

// ========== 推理 ==========
export interface PredictFormData {
  images: File[]
  clinical_text: string
  check_project: string
  patient_no: string
  idempotency_key: string
}

export async function postPredict(params: PredictFormData): Promise<PredictResponse> {
  const form = new FormData()
  params.images.forEach((f) => form.append('images', f))
  form.append('clinical_text', params.clinical_text)
  form.append('check_project', params.check_project)
  form.append('patient_no', params.patient_no)
  form.append('idempotency_key', params.idempotency_key)
  const { data } = await client.post<PredictResponse>('/predict', form)
  return data
}

export async function getTaskStatus(taskId: string): Promise<TaskStatusResponse> {
  const { data } = await client.get<TaskStatusResponse>(`/tasks/${taskId}`)
  return data
}

// ========== 批量推理 ==========
export async function postBatchPredict(
  archive: File,
  aggregationStrategy: AggregationStrategy,
): Promise<BatchSubmitResponse> {
  const form = new FormData()
  form.append('archive', archive)
  form.append('aggregation_strategy', aggregationStrategy)
  const { data } = await client.post<BatchSubmitResponse>('/predict/batch', form)
  return data
}

export async function getBatchJobs(
  page = 1,
  pageSize = 20,
  status?: BatchJobStatus,
): Promise<BatchJobListResponse> {
  const { data } = await client.get<BatchJobListResponse>('/batch', {
    params: { page, page_size: pageSize, ...(status && { status }) },
  })
  return data
}

export async function getBatchStatus(jobId: string): Promise<BatchStatusResponse> {
  const { data } = await client.get<BatchStatusResponse>(`/batch/${jobId}`)
  return data
}

export async function cancelBatch(jobId: string): Promise<{ ok: boolean }> {
  const { data } = await client.post<{ ok: boolean }>(`/batch/${jobId}/cancel`)
  return data
}

// ========== 病例 ==========
export async function getCases(params: CaseListParams): Promise<CaseListResponse> {
  const { data } = await client.get<CaseListResponse>('/cases', { params })
  return data
}

export async function getCaseDetail(caseId: string): Promise<CaseDetail> {
  const { data } = await client.get<CaseDetail>(`/cases/${caseId}`)
  return data
}

export async function postJudgment(
  caseId: string,
  body: JudgmentRequest,
): Promise<JudgmentResponse> {
  const { data } = await client.post<JudgmentResponse>(
    `/cases/${caseId}/judgment`,
    body,
  )
  return data
}

export function getReportUrl(caseId: string): string {
  return `/api/cases/${caseId}/report.pdf`
}

// ========== 图像 ==========
export function getImageUrl(imageId: string): string {
  return `/api/images/${imageId}`
}

export function getOriginalImageUrl(imageId: string): string {
  return `/api/images/${imageId}/original`
}

export function getGradcamUrl(imageId: string): string {
  return `/api/images/${imageId}/gradcam`
}

// ========== 管理员：用户 ==========
export async function adminListUsers(): Promise<AdminUserListResponse> {
  const { data } = await client.get<AdminUserListResponse>('/admin/users')
  return data
}

export async function adminCreateUser(body: AdminUserCreateIn): Promise<User> {
  const { data } = await client.post<User>('/admin/users', body)
  return data
}

export async function adminPatchUser(userId: string, body: AdminUserPatchIn): Promise<User> {
  const { data } = await client.patch<User>(`/admin/users/${userId}`, body)
  return data
}

// ========== 管理员：审计 ==========
export async function adminGetAuditLogs(params: AuditLogParams): Promise<AuditLogListResponse> {
  const { data } = await client.get<AuditLogListResponse>('/admin/audit-logs', { params })
  return data
}

export function buildAuditLogCsvUrl(params: AuditLogParams): string {
  const usp = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      usp.append(k, String(v))
    }
  })
  const q = usp.toString()
  return `/api/admin/audit-logs.csv${q ? `?${q}` : ''}`
}
