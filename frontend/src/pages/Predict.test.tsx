import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatDateTime } from '@/lib/utils'
import Predict from './Predict'

const apiMocks = vi.hoisted(() => ({
  postPredict: vi.fn(),
  getTaskStatus: vi.fn(),
  getCaseDetail: vi.fn(),
  postJudgment: vi.fn(),
}))

vi.mock('@/api/client', () => ({
  ...apiMocks,
  getReportUrl: (caseId: string) => `/api/cases/${caseId}/report.pdf`,
  getImageUrl: (imageId: string) => `/api/images/${imageId}`,
}))

afterEach(cleanup)

function renderPredict() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const router = createMemoryRouter([{ path: '/', element: <Predict /> }])

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('Predict initial workspace', () => {
  it('uses the shared 1600px workspace instead of a narrow page override', () => {
    renderPredict()

    const grid = screen.getByRole('heading', { name: '输入' }).parentElement?.parentElement
    const container = grid?.parentElement

    expect(container).toHaveClass('w-full', 'max-w-[1600px]', 'mx-auto')
    expect(container).not.toHaveClass('max-w-6xl')
  })

  it('keeps the initial workspace single-column until the desktop breakpoint', () => {
    renderPredict()

    const grid = screen.getByRole('heading', { name: '输入' }).parentElement?.parentElement
    expect(grid).toHaveClass('grid', 'grid-cols-1', 'lg:grid-cols-2')
  })

  it('shows saved doctor and time metadata in the result workbench', async () => {
    const user = userEvent.setup()
    apiMocks.postPredict.mockResolvedValue({
      task_id: 'task-1',
      case_id: 'case-1',
      image_count: 1,
    })
    apiMocks.getTaskStatus.mockResolvedValue({
      task_id: 'task-1',
      status: 'done',
      case_id: 'case-1',
      queue_position: 0,
      estimated_wait_ms: 0,
    })
    apiMocks.getCaseDetail.mockResolvedValue({
      case_id: 'case-1',
      patient_no: 'p-1',
      check_project: '经阴道三维超声',
      clinical_text: '',
      doctor_id: 'doctor-owner',
      created_at: '2026-07-12T08:00:00Z',
      images: [],
      prediction: null,
      judgment: {
        final_class: 'normal',
        final_class_zh: '正常',
        recommendation: '',
        note: '',
        doctor_id: 'doctor-reviewer',
        judged_at: '2026-07-12T09:30:00Z',
      },
    })
    const { container } = renderPredict()

    await user.type(screen.getByPlaceholderText('20260502-1138'), 'p-1')
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [new File(['image'], 'image.jpg', { type: 'image/jpeg' })] } })
    await user.click(screen.getByRole('button', { name: '开始分析' }))

    await waitFor(() => {
      expect(screen.getByText(/已保存判断 · 医生 doctor-reviewer/)).toBeVisible()
    })
    expect(screen.getByText(/2026/)).toBeVisible()
  })

  it('keeps the result form disabled until the saved judgment version has refreshed', async () => {
    const user = userEvent.setup()
    const initialDetail = {
      case_id: 'case-refresh',
      patient_no: 'p-refresh',
      check_project: '经阴道三维超声',
      clinical_text: '',
      doctor_id: 'doctor-owner',
      created_at: '2026-07-13T08:00:00Z',
      images: [],
      prediction: null,
      judgment: {
        final_class: 'polyp' as const,
        final_class_zh: '息肉',
        recommendation: 'followup',
        note: '旧判断',
        doctor_id: 'doctor-old',
        judged_at: '2026-07-13T08:00:00Z',
      },
    }
    const refreshedDetail = {
      ...initialDetail,
      judgment: {
        ...initialDetail.judgment,
        final_class: 'normal' as const,
        final_class_zh: '正常',
        note: '新版本判断',
        doctor_id: 'doctor-current',
        judged_at: '2026-07-13T09:30:00Z',
      },
    }
    apiMocks.postPredict.mockResolvedValue({
      task_id: 'task-refresh',
      case_id: 'case-refresh',
      image_count: 1,
    })
    apiMocks.getTaskStatus.mockResolvedValue({
      task_id: 'task-refresh',
      status: 'done',
      case_id: 'case-refresh',
      queue_position: 0,
      estimated_wait_ms: 0,
    })
    apiMocks.getCaseDetail.mockResolvedValue(initialDetail)
    apiMocks.postJudgment.mockResolvedValue({
      ok: true,
      judgment: refreshedDetail.judgment,
    })
    const { container } = renderPredict()

    await user.type(screen.getByPlaceholderText('20260502-1138'), 'p-refresh')
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, {
      target: { files: [new File(['image'], 'image.jpg', { type: 'image/jpeg' })] },
    })
    await user.click(screen.getByRole('button', { name: '开始分析' }))
    await screen.findByRole('button', { name: '保存判断' })

    const detailCallsBeforeSave = apiMocks.getCaseDetail.mock.calls.length
    let resolveRefresh!: (detail: typeof refreshedDetail) => void
    apiMocks.getCaseDetail.mockImplementationOnce(() => new Promise((resolve) => {
      resolveRefresh = resolve
    }))
    await user.click(screen.getByRole('radio', { name: '正常' }))
    await user.click(screen.getByRole('button', { name: '保存判断' }))
    await waitFor(() => {
      expect(apiMocks.getCaseDetail).toHaveBeenCalledTimes(detailCallsBeforeSave + 1)
    })

    expect(screen.getByRole('button', { name: '提交中...' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: '息肉' })).toBeDisabled()
    await user.click(screen.getByRole('radio', { name: '息肉' }))
    expect(screen.getByRole('radio', { name: '正常' })).toBeChecked()

    await act(async () => resolveRefresh(refreshedDetail))

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: '备注' })).toHaveValue('新版本判断')
    })
    expect(screen.getByRole('button', { name: '保存判断' })).toBeEnabled()
    expect(screen.getByText(/doctor-current/)).toBeVisible()
    expect(screen.getByText(formatDateTime(refreshedDetail.judgment.judged_at))).toBeVisible()
  })
})
