import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCaseDetail, postJudgment } from '@/api/client'
import type { CaseDetail as CaseDetailData } from '@/lib/types'
import CaseDetail from './CaseDetail'

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  return {
    ...actual,
    getCaseDetail: vi.fn(),
    postJudgment: vi.fn(),
  }
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

const pendingCase: CaseDetailData = {
  case_id: 'case-pending',
  patient_no: 'P-WAIT-1',
  check_project: '经阴道超声',
  clinical_text: '等待推理的检查所见',
  doctor_id: 'doctor-1',
  created_at: '2026-07-13T08:00:00Z',
  images: [],
  prediction: null,
  judgment: null,
}

function renderCaseDetail(detail: CaseDetailData) {
  vi.mocked(getCaseDetail).mockResolvedValue(detail)
  const router = createMemoryRouter([
    { path: '/case/:caseId', element: <CaseDetail /> },
    { path: '/history', element: <div>历史记录</div> },
  ], { initialEntries: [`/case/${detail.case_id}`] })

  return render(
    <QueryClientProvider client={new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('CaseDetail diagnosis eligibility', () => {
  it('keeps case details but does not render a judgment form without a prediction', async () => {
    renderCaseDetail(pendingCase)

    expect(await screen.findByRole('heading', { name: '病例详情' })).toBeVisible()
    expect(screen.getByText('P-WAIT-1')).toBeVisible()
    expect(screen.getByRole('button', { name: '返回历史' })).toBeVisible()
    const doctorRegion = screen.getByRole('region', { name: '医生确认' })
    expect(within(doctorRegion).getByText('病例尚未完成推理，暂不能提交医生判断')).toBeVisible()
    expect(within(doctorRegion).queryByRole('button', { name: '保存判断' }))
      .not.toBeInTheDocument()
    expect(within(doctorRegion).queryByRole('group', { name: '诊断分类' }))
      .not.toBeInTheDocument()
    expect(postJudgment).not.toHaveBeenCalled()
  })

  it('retains the judgment form when a prediction exists', async () => {
    renderCaseDetail({
      ...pendingCase,
      case_id: 'case-predicted',
      prediction: {
        predicted_class: 'normal',
        predicted_class_zh: '正常',
        confidence: 0.9,
        probabilities: { normal: 0.9, endometrial_cancer: 0.05, polyp: 0.05 },
        aggregation_strategy: 'mean',
        image_count: 1,
        model_version: 'model-v2',
      },
    })

    expect(await screen.findByRole('button', { name: '保存判断' })).toBeVisible()
    expect(screen.getByRole('group', { name: '诊断分类' })).toBeVisible()
  })
})
