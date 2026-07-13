import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  MemoryRouter,
  Route,
  RouterProvider,
  Routes,
  createMemoryRouter,
} from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cancelBatch, getBatchStatus, getCaseDetail, postJudgment } from '@/api/client'
import type {
  BatchJobStatus,
  BatchResultItem,
  BatchStatusResponse,
  CaseDetail,
  JudgmentResponse,
} from '@/lib/types'
import BatchDetail, { BatchCancelButton } from './BatchDetail'

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  return {
    ...actual,
    cancelBatch: vi.fn(),
    getBatchStatus: vi.fn(),
    getCaseDetail: vi.fn(),
    postJudgment: vi.fn(),
  }
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
  vi.restoreAllMocks()
})

const results: BatchResultItem[] = [
  {
    patient_no: 'P000',
    case_id: 'case-pending',
    image_count: 1,
    predicted_class: null,
    predicted_class_zh: null,
    confidence: null,
    error: null,
    has_judgment: false,
  },
  {
    patient_no: 'P001',
    case_id: 'case-1',
    image_count: 1,
    predicted_class: 'normal',
    predicted_class_zh: '正常',
    confidence: 0.91,
    error: null,
    has_judgment: false,
  },
  {
    patient_no: 'P002',
    case_id: 'case-2',
    image_count: 1,
    predicted_class: 'polyp',
    predicted_class_zh: '子宫内膜息肉',
    confidence: 0.83,
    error: null,
    has_judgment: true,
  },
  {
    patient_no: 'P003',
    case_id: 'case-3',
    image_count: 1,
    predicted_class: 'endometrial_cancer',
    predicted_class_zh: '疑似子宫内膜癌',
    confidence: 0.74,
    error: null,
    has_judgment: false,
  },
  {
    patient_no: 'P004',
    case_id: 'case-4',
    image_count: 1,
    predicted_class: null,
    predicted_class_zh: null,
    confidence: null,
    error: '原始 DICOM 文件损坏，无法完成推理',
    has_judgment: false,
  },
]

function makeBatchStatus(
  overrides: Partial<BatchStatusResponse> = {},
): BatchStatusResponse {
  return {
    job_id: 'job-1',
    status: 'running',
    total_patients: results.length,
    completed_patients: 4,
    total_images: results.length,
    completed_images: 4,
    estimated_remaining_ms: 2_000,
    current_patient: 'P000',
    started_at: '2026-07-12T08:00:00Z',
    finished_at: null,
    aggregation_strategy: 'mean',
    results,
    error: null,
    ...overrides,
  }
}

function makeCaseDetail(caseId: string): CaseDetail {
  const item = results.find((result) => result.case_id === caseId) ?? results[1]
  const judged = item.has_judgment
    ? {
        final_class: 'polyp' as const,
        final_class_zh: '息肉',
        recommendation: 'followup',
        note: '已完成诊断',
        doctor_id: 'doctor-1',
        judged_at: '2026-07-12T09:00:00Z',
      }
    : null

  return {
    case_id: caseId,
    patient_no: item.patient_no,
    check_project: '经阴道超声',
    clinical_text: `${item.patient_no} 检查所见`,
    doctor_id: 'doctor-1',
    created_at: '2026-07-12T08:00:00Z',
    images: [],
    prediction: item.predicted_class
      ? {
          predicted_class: item.predicted_class,
          predicted_class_zh: item.predicted_class_zh!,
          confidence: item.confidence!,
          probabilities: {
            normal: item.predicted_class === 'normal' ? item.confidence! : 0.1,
            endometrial_cancer: item.predicted_class === 'endometrial_cancer' ? item.confidence! : 0.1,
            polyp: item.predicted_class === 'polyp' ? item.confidence! : 0.1,
          },
          aggregation_strategy: 'mean',
          image_count: 1,
          model_version: 'model-v2',
        }
      : null,
    judgment: judged,
  }
}

const judgmentResponse: JudgmentResponse = {
  ok: true,
  judgment: {
    final_class: 'normal',
    final_class_zh: '正常',
    recommendation: '',
    note: '',
    doctor_id: 'doctor-1',
    judged_at: '2026-07-12T09:30:00Z',
  },
}

function renderPage(
  status: BatchStatusResponse = makeBatchStatus(),
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
) {
  vi.mocked(getBatchStatus).mockResolvedValue(status)
  vi.mocked(getCaseDetail).mockImplementation(async (caseId) => makeCaseDetail(caseId))

  const router = createMemoryRouter([
    { path: '/batch/:jobId', element: <BatchDetail /> },
  ], { initialEntries: ['/batch/job-1'] })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return { ...view, queryClient }
}

function renderCancel(status: BatchJobStatus, queryClient = new QueryClient()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <BatchCancelButton jobId="job-1" status={status} />
    </QueryClientProvider>,
  )
}

describe('BatchCancelButton', () => {
  it.each(['queued', 'running'] as const)('shows for %s jobs', (status) => {
    renderCancel(status)
    expect(screen.getByRole('button', { name: '取消任务' })).toBeVisible()
  })

  it.each(['completed', 'failed', 'cancelled'] as const)('stays hidden for %s jobs', (status) => {
    renderCancel(status)
    expect(screen.queryByRole('button', { name: '取消任务' })).not.toBeInTheDocument()
  })

  it('confirms, disables while cancelling, and refreshes status and job-list caches', async () => {
    const user = userEvent.setup()
    let resolveCancel!: (value: { ok: boolean }) => void
    vi.mocked(cancelBatch).mockImplementation(() => new Promise((resolve) => {
      resolveCancel = resolve
    }))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    renderCancel('running', queryClient)

    const button = screen.getByRole('button', { name: '取消任务' })
    await user.click(button)

    expect(window.confirm).toHaveBeenCalledWith('确定要取消这个批量任务吗？已完成的结果将保留。')
    expect(cancelBatch).toHaveBeenCalledWith('job-1')
    expect(button).toBeDisabled()

    resolveCancel({ ok: true })
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['batch-status', 'job-1'] })
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['batch-jobs'] })
    })
  })

  it('does not cancel when confirmation is declined and shows API failures', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const view = renderCancel('queued')
    await user.click(screen.getByRole('button', { name: '取消任务' }))
    expect(cancelBatch).not.toHaveBeenCalled()

    vi.mocked(cancelBatch).mockRejectedValue(new Error('取消失败：任务已结束'))
    vi.mocked(window.confirm).mockReturnValue(true)
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <BatchCancelButton jobId="job-1" status="queued" />
      </QueryClientProvider>,
    )
    await user.click(screen.getByRole('button', { name: '取消任务' }))
    expect(await screen.findByText('取消失败：任务已结束')).toBeVisible()
  })
})

describe('BatchDetail request errors', () => {
  it('replaces the spinner with an error, history link, and retry action', async () => {
    const user = userEvent.setup()
    vi.mocked(getBatchStatus).mockRejectedValue(new Error('任务服务不可用'))
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/batch/job-1']}>
          <Routes>
            <Route path="/batch/:jobId" element={<BatchDetail />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('任务服务不可用')
    expect(screen.queryByText('正在推理中...')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '返回批量任务历史' })).toHaveAttribute('href', '/batch/history')

    await user.click(screen.getByRole('button', { name: '重新加载批量任务详情' }))
    await waitFor(() => expect(getBatchStatus).toHaveBeenCalledTimes(2))
  })

  it('names the icon-only history button after a successful load', async () => {
    vi.mocked(getBatchStatus).mockResolvedValue({
      job_id: 'job-1',
      status: 'completed',
      total_patients: 0,
      completed_patients: 0,
      total_images: 0,
      completed_images: 0,
      estimated_remaining_ms: 0,
      current_patient: null,
      started_at: '2026-07-12T08:00:00Z',
      finished_at: '2026-07-12T08:01:00Z',
      aggregation_strategy: 'mean',
      results: [],
      error: null,
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/batch/job-1']}>
          <Routes>
            <Route path="/batch/:jobId" element={<BatchDetail />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('button', { name: '返回批量任务历史' })).toBeVisible()
  })
})

describe('BatchDetail continuous diagnosis workflow', () => {
  it('shows independent diagnosis progress in the top header with failure-first counts', async () => {
    const failedPrediction: BatchResultItem = {
      ...results[1],
      patient_no: 'P006',
      case_id: 'case-6',
      error: '模型结果无效',
      has_judgment: true,
    }
    renderPage(makeBatchStatus({ results: [...results, failedPrediction] }))

    const topProgress = await screen.findByRole('status', { name: '批量诊断进度' })
    const queue = screen.getByRole('region', { name: '批量患者队列' })

    expect(topProgress).toHaveTextContent(/^已诊断 1 \/ 可诊断 3$/)
    expect(queue).not.toContainElement(topProgress)
    expect(within(queue).getByText('已诊断 1 / 可诊断 3')).toBeVisible()
  })

  it('selects the first successful unjudged patient while inference is running', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /患者 P001/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })
    expect(screen.getByRole('button', { name: '未诊断 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(screen.getByRole('region', { name: '批量患者队列' }))
      .getByText('已诊断 1 / 可诊断 3')).toBeVisible()
    expect(screen.getByText(/正在推理中/)).toBeVisible()
    await waitFor(() => expect(getCaseDetail).toHaveBeenCalledWith('case-1'))
  })

  it('falls back to all and the first successful prediction when no unjudged patient exists', async () => {
    const fallbackResults = [results[0], results[4], results[2]]
    renderPage(makeBatchStatus({ results: fallbackResults }))

    expect(await screen.findByRole('button', { name: /患者 P002/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: '全部 3' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(getCaseDetail).toHaveBeenCalledWith('case-2')
  })

  it('falls back to all and selects the first real failed case when all patients failed', async () => {
    const firstFailed = { ...results[4], patient_no: 'P-FAIL-1', case_id: 'case-fail-1' }
    const secondFailed = { ...results[4], patient_no: 'P-FAIL-2', case_id: 'case-fail-2' }
    renderPage(makeBatchStatus({ results: [firstFailed, secondFailed] }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '全部 2' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })
    expect(screen.getByRole('button', { name: /患者 P-FAIL-1/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('region', { name: '医生确认' })).toHaveTextContent(
      '原始 DICOM 文件损坏，无法完成推理',
    )
  })

  it('falls back to all and loads the first real case when all patients are pending', async () => {
    const firstPending = { ...results[0], patient_no: 'P-WAIT-1', case_id: 'case-wait-1' }
    const secondPending = { ...results[0], patient_no: 'P-WAIT-2', case_id: 'case-wait-2' }
    renderPage(makeBatchStatus({ results: [firstPending, secondPending] }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '全部 2' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })
    expect(screen.getByRole('button', { name: /患者 P-WAIT-1/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await waitFor(() => expect(getCaseDetail).toHaveBeenCalledWith('case-wait-1'))
  })

  it('keeps the patient and form when a dirty switch is declined, then switches when accepted', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    renderPage()

    const note = await screen.findByRole('textbox', { name: '备注' })
    await user.type(note, '尚未保存')
    await user.click(screen.getByRole('button', { name: /患者 P003/ }))

    expect(confirm).toHaveBeenLastCalledWith('医生判断尚未保存，确定要切换患者吗？')
    expect(screen.getByRole('button', { name: /患者 P001/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(note).toHaveValue('尚未保存')

    await user.click(screen.getByRole('button', { name: /患者 P003/ }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /患者 P003/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      expect(getCaseDetail).toHaveBeenCalledWith('case-3')
    })
    expect(screen.getByRole('textbox', { name: '备注' })).toHaveValue('')
  })

  it('keeps filter, selection, and form when a dirty filter change is declined', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPage()

    const note = await screen.findByRole('textbox', { name: '备注' })
    await user.type(note, '未保存的过滤测试')
    await user.click(screen.getByRole('button', { name: '已诊断 1' }))

    expect(window.confirm).toHaveBeenCalledWith('医生判断尚未保存，确定要切换患者吗？')
    expect(screen.getByRole('button', { name: '未诊断 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: /患者 P001/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(note).toHaveValue('未保存的过滤测试')
  })

  it('discards a dirty form and selects the first visible patient after confirmation', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPage()

    const note = await screen.findByRole('textbox', { name: '备注' })
    await user.type(note, '不应保留的内容')
    await user.click(screen.getByRole('button', { name: '已诊断 1' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /患者 P002/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      expect(getCaseDetail).toHaveBeenCalledWith('case-2')
    })
    expect(screen.getByRole('button', { name: '已诊断 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.queryByDisplayValue('不应保留的内容')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '备注' })).toHaveValue('已完成诊断')
  })

  it('preserves a clean visible patient and otherwise selects the first patient in the new filter', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('textbox', { name: '备注' })

    await user.click(screen.getByRole('button', { name: '全部 5' }))
    expect(screen.getByRole('button', { name: /患者 P001/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.click(screen.getByRole('button', { name: '已诊断 1' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /患者 P002/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })
  })

  it('clears the selected workbench when the new filter has no real cases', async () => {
    const user = userEvent.setup()
    renderPage(makeBatchStatus({ results: [results[1]] }))
    await screen.findByRole('textbox', { name: '备注' })

    await user.click(screen.getByRole('button', { name: '推理失败 0' }))

    expect(screen.getByRole('button', { name: '推理失败 0' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByText('请从患者队列中选择病例')).toBeVisible()
    expect(screen.queryByRole('button', { name: '保存判断' })).not.toBeInTheDocument()
  })

  it('keeps the primary save action on the current patient', async () => {
    const user = userEvent.setup()
    vi.mocked(postJudgment).mockResolvedValue(judgmentResponse)
    renderPage()

    await user.click(await screen.findByRole('radio', { name: '正常' }))
    await user.click(screen.getByRole('button', { name: '保存判断' }))

    await waitFor(() => expect(postJudgment).toHaveBeenCalledWith('case-1', expect.anything()))
    expect(screen.getByRole('button', { name: /患者 P001/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: '保存并下一位' })).toBeVisible()
  })

  it('moves the secondary save to the next eligible unjudged patient', async () => {
    const user = userEvent.setup()
    vi.mocked(postJudgment).mockResolvedValue(judgmentResponse)
    renderPage()

    await user.click(await screen.findByRole('radio', { name: '正常' }))
    await user.click(screen.getByRole('button', { name: '保存并下一位' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /患者 P003/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      expect(getCaseDetail).toHaveBeenCalledWith('case-3')
    })
    expect(screen.getByRole('button', { name: '未诊断 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('uses refreshed batch status to select a newly completed patient and skip a concurrent judgment', async () => {
    const user = userEvent.setup()
    const newlyCompleted: BatchResultItem = {
      ...results[1],
      patient_no: 'P005',
      case_id: 'case-5',
    }
    const initial = makeBatchStatus({ results: [results[1], results[3]] })
    const refreshed = makeBatchStatus({
      results: [
        { ...results[1], has_judgment: true },
        { ...results[3], has_judgment: true },
        newlyCompleted,
      ],
    })
    vi.mocked(postJudgment).mockResolvedValue(judgmentResponse)
    renderPage(initial)

    await user.click(await screen.findByRole('radio', { name: '正常' }))
    vi.mocked(getBatchStatus).mockResolvedValue(refreshed)
    await user.click(screen.getByRole('button', { name: '保存并下一位' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /患者 P005/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      expect(getCaseDetail).toHaveBeenCalledWith('case-5')
    })
    expect(getCaseDetail).not.toHaveBeenCalledWith('case-3')
  })

  it('wraps once in response order and excludes the current patient', async () => {
    const user = userEvent.setup()
    vi.mocked(postJudgment).mockResolvedValue(judgmentResponse)
    renderPage()

    await screen.findByRole('textbox', { name: '备注' })
    await user.click(screen.getByRole('button', { name: /患者 P003/ }))
    await user.click(await screen.findByRole('radio', { name: '正常' }))
    await user.click(screen.getByRole('button', { name: '保存并下一位' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /患者 P001/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })
    expect(screen.queryByText('本批次已全部诊断')).not.toBeInTheDocument()
  })

  it('stays on the last patient and announces batch completion', async () => {
    const user = userEvent.setup()
    vi.mocked(postJudgment).mockResolvedValue(judgmentResponse)
    renderPage(makeBatchStatus({ results: [results[1], results[2]] }))

    await user.click(await screen.findByRole('radio', { name: '正常' }))
    await user.click(screen.getByRole('button', { name: '保存并下一位' }))

    expect((await screen.findByText('本批次已全部诊断')).closest('[role="status"]'))
      .toBeInTheDocument()
    expect(screen.getByRole('button', { name: /患者 P001/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('preserves the selected patient and dirty form when polling adds completed patients', async () => {
    const user = userEvent.setup()
    const initial = makeBatchStatus()
    const newlyCompleted: BatchResultItem = {
      ...results[1],
      patient_no: 'P005',
      case_id: 'case-5',
    }
    const polled = makeBatchStatus({ results: [...results, newlyCompleted] })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    vi.mocked(getBatchStatus)
      .mockResolvedValueOnce(initial)
      .mockResolvedValue(polled)
    vi.mocked(getCaseDetail).mockImplementation(async (caseId) => makeCaseDetail(caseId))

    const router = createMemoryRouter([
      { path: '/batch/:jobId', element: <BatchDetail /> },
    ], { initialEntries: ['/batch/job-1'] })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    await screen.findByRole('textbox', { name: '备注' })
    await user.click(screen.getByRole('button', { name: /患者 P003/ }))
    const note = await screen.findByRole('textbox', { name: '备注' })
    await user.type(note, '轮询期间保留')

    act(() => {
      queryClient.setQueryData(['batch-status', 'job-1'], polled)
    })

    expect(await screen.findByRole('button', { name: /患者 P005/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /患者 P003/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('textbox', { name: '备注' })).toHaveValue('轮询期间保留')
    expect(getCaseDetail).toHaveBeenCalledTimes(2)
  })

  it('supports all four queue filters while a job is running', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('textbox', { name: '备注' })

    await user.click(screen.getByRole('button', { name: '已诊断 1' }))
    expect(screen.getByRole('button', { name: /患者 P002/ })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '推理失败 1' }))
    expect(screen.getByRole('button', { name: /患者 P004/ })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '全部 5' }))
    expect(screen.getByRole('button', { name: /患者 P000/ })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '未诊断 2' }))
    expect(screen.getByRole('button', { name: /患者 P001/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /患者 P003/ })).toBeVisible()
  })

  it('shows an exact persisted failure reason without a submit-capable form', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('textbox', { name: '备注' })

    await user.click(screen.getByRole('button', { name: '推理失败 1' }))
    await user.click(screen.getByRole('button', { name: /患者 P004/ }))

    const doctorRegion = screen.getByRole('region', { name: '医生确认' })
    expect(within(doctorRegion).getByRole('alert')).toHaveTextContent(
      '原始 DICOM 文件损坏，无法完成推理',
    )
    expect(within(doctorRegion).queryByRole('button', { name: '保存判断' }))
      .not.toBeInTheDocument()
    expect(within(doctorRegion).queryByRole('button', { name: '保存并下一位' }))
      .not.toBeInTheDocument()
    expect(getCaseDetail).not.toHaveBeenCalledWith('case-4')
  })

  it('orders the accessible queue, image, and judgment regions and keeps full details available', async () => {
    renderPage()

    await screen.findByRole('textbox', { name: '备注' })
    const left = screen.getByRole('region', { name: '病例信息' })
    const center = screen.getByRole('region', { name: '影像阅片' })
    const right = screen.getByRole('region', { name: '医生确认' })

    expect(within(left).getByRole('region', { name: '批量患者队列' })).toBeVisible()
    expect(left.compareDocumentPosition(center) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(center.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('link', { name: '打开完整详情' })).toHaveAttribute(
      'href',
      '/case/case-1',
    )
  })
})
