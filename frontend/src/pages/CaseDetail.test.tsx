import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCaseDetail, postJudgment } from '@/api/client'
import type { CaseDetail as CaseDetailData } from '@/lib/types'
import { formatDateTime } from '@/lib/utils'
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

  it('keeps the form disabled until the saved judgment version has refreshed', async () => {
    const user = userEvent.setup()
    const initial: CaseDetailData = {
      ...pendingCase,
      case_id: 'case-version-refresh',
      prediction: {
        predicted_class: 'polyp',
        predicted_class_zh: '息肉',
        confidence: 0.8,
        probabilities: { normal: 0.1, endometrial_cancer: 0.1, polyp: 0.8 },
        aggregation_strategy: 'mean',
        image_count: 1,
        model_version: 'model-v2',
      },
      judgment: {
        final_class: 'polyp',
        final_class_zh: '息肉',
        recommendation: 'followup',
        note: '旧判断',
        doctor_id: 'doctor-old',
        judged_at: '2026-07-13T08:00:00Z',
      },
    }
    const refreshed: CaseDetailData = {
      ...initial,
      judgment: {
        ...initial.judgment!,
        final_class: 'normal',
        final_class_zh: '正常',
        note: '服务器已保存的新判断',
        doctor_id: 'doctor-current',
        judged_at: '2026-07-13T09:30:00Z',
      },
    }
    let resolveRefresh!: (detail: CaseDetailData) => void
    vi.mocked(postJudgment).mockResolvedValue({
      ok: true,
      judgment: refreshed.judgment!,
    })
    renderCaseDetail(initial)
    await screen.findByRole('button', { name: '保存判断' })
    vi.mocked(getCaseDetail).mockImplementationOnce(() => new Promise((resolve) => {
      resolveRefresh = resolve
    }))

    await user.click(screen.getByRole('radio', { name: '正常' }))
    await user.click(screen.getByRole('button', { name: '保存判断' }))
    await waitFor(() => expect(getCaseDetail).toHaveBeenCalledTimes(2))

    expect(screen.getByRole('button', { name: '提交中...' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: '息肉' })).toBeDisabled()
    await user.click(screen.getByRole('radio', { name: '息肉' }))
    expect(screen.getByRole('radio', { name: '正常' })).toBeChecked()

    await act(async () => resolveRefresh(refreshed))

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: '备注' }))
        .toHaveValue('服务器已保存的新判断')
    })
    expect(screen.getByRole('button', { name: '保存判断' })).toBeEnabled()
    expect(screen.getByText(/doctor-current/)).toBeVisible()
    expect(screen.getByText(formatDateTime(refreshed.judgment!.judged_at))).toBeVisible()
  })
})
