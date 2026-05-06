import axios from 'axios'
import type {
  HealthResponse,
  PredictResponse,
  BatchSubmitResponse,
  BatchStatusResponse,
  CaseListResponse,
  CaseListParams,
  CaseDetail,
  JudgmentRequest,
  JudgmentResponse,
} from '@/lib/types'

const client = axios.create({
  baseURL: '/api',
  timeout: 60000,
})

client.interceptors.response.use(
  (res) => res,
  (error) => {
    const message =
      error.response?.data?.error?.message ??
      error.response?.data?.detail ??
      error.message ??
      '请求失败'
    return Promise.reject(new Error(message))
  },
)

export async function getHealth(): Promise<HealthResponse> {
  const { data } = await client.get<HealthResponse>('/health')
  return data
}

export async function postPredict(
  image: File,
  clinicalText: string,
  patientNo?: string,
): Promise<PredictResponse> {
  const form = new FormData()
  form.append('image', image)
  form.append('clinical_text', clinicalText)
  if (patientNo) form.append('patient_no', patientNo)
  const { data } = await client.post<PredictResponse>('/predict', form)
  return data
}

export async function postBatchPredict(
  images: File[],
  manifest?: File,
): Promise<BatchSubmitResponse> {
  const form = new FormData()
  images.forEach((f) => form.append('images', f))
  if (manifest) form.append('manifest', manifest)
  const { data } = await client.post<BatchSubmitResponse>('/predict/batch', form)
  return data
}

export async function getBatchStatus(jobId: string): Promise<BatchStatusResponse> {
  const { data } = await client.get<BatchStatusResponse>(`/batch/${jobId}`)
  return data
}

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

export function getCaseImageUrl(caseId: string): string {
  return `/api/cases/${caseId}/image`
}
