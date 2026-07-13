import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactNode } from 'react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCaseDetail, postJudgment } from '@/api/client'
import type { CaseDetail, JudgmentResponse } from '@/lib/types'
import { formatDateTime } from '@/lib/utils'
import BatchPatientDiagnosis from './BatchPatientDiagnosis'

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

const caseDetail: CaseDetail = {
  case_id: 'case-1',
  patient_no: 'P-001',
  check_project: '经阴道超声',
  clinical_text: '宫腔内见稍高回声结节。',
  doctor_id: 'doctor-owner',
  created_at: '2026-07-12T08:00:00Z',
  images: [
    {
      image_id: 'image-1',
      sequence: 1,
      image_url: '',
      original_url: '',
      image_format: 'png',
      original_filename: 'patient-001.png',
      per_image_prediction: {
        image_id: 'image-1',
        predicted_class: 'polyp',
        predicted_class_zh: '息肉',
        confidence: 0.82,
        probabilities: {
          normal: 0.1,
          endometrial_cancer: 0.08,
          polyp: 0.82,
        },
        gradcam_url: '',
        model_version: 'model-v2',
        inference_ms: 850,
      },
    },
  ],
  prediction: {
    predicted_class: 'polyp',
    predicted_class_zh: '息肉',
    confidence: 0.82,
    probabilities: {
      normal: 0.1,
      endometrial_cancer: 0.08,
      polyp: 0.82,
    },
    aggregation_strategy: 'mean',
    image_count: 1,
    model_version: 'model-v2',
  },
  judgment: {
    final_class: 'polyp',
    final_class_zh: '息肉',
    recommendation: 'followup',
    note: '三个月后复查',
    doctor_id: 'doctor-7',
    judged_at: '2026-07-12T09:30:00Z',
  },
}

const judgmentResponse: JudgmentResponse = {
  ok: true,
  judgment: caseDetail.judgment!,
}

const caseDetailB: CaseDetail = {
  ...caseDetail,
  case_id: 'case-b',
  patient_no: 'P-002',
  prediction: null,
  judgment: null,
}

beforeEach(() => {
  vi.mocked(getCaseDetail).mockResolvedValue(caseDetail)
})

interface RenderOptions {
  detail?: CaseDetail
  onDirtyChange?: (dirty: boolean) => void
  onSaved?: (caseId: string) => void
  onSavedAndNext?: (caseId: string) => void
  queryClient?: QueryClient
}

function renderDiagnosis({
  detail = caseDetail,
  onDirtyChange = vi.fn(),
  onSaved = vi.fn(),
  onSavedAndNext = vi.fn(),
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
}: RenderOptions = {}) {
  if (detail !== caseDetail) {
    vi.mocked(getCaseDetail).mockResolvedValue(detail)
  }

  const renderWorkspace = ({ center, right }: { center: ReactNode; right: ReactNode }) => (
    <div>
      <section aria-label="批量影像工作区">{center}</section>
      <section aria-label="批量诊断工作区">{right}</section>
    </div>
  )

  const router = createMemoryRouter([
    {
      path: '/',
      element: (
        <BatchPatientDiagnosis
          caseId="case-1"
          jobId="job-running"
          onDirtyChange={onDirtyChange}
          onSaved={onSaved}
          onSavedAndNext={onSavedAndNext}
        >
          {renderWorkspace}
        </BatchPatientDiagnosis>
      ),
    },
  ])
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return { ...view, queryClient, onDirtyChange, onSaved, onSavedAndNext }
}

describe('BatchPatientDiagnosis', () => {
  it('renders the formal image, AI, and judgment panels for a case in a running batch', async () => {
    renderDiagnosis()

    await screen.findByRole('heading', { name: '影像阅片（1）' })
    const center = screen.getByRole('region', { name: '批量影像工作区' })
    const right = screen.getByRole('region', { name: '批量诊断工作区' })

    expect(within(center).getByRole('heading', { name: '影像阅片（1）' })).toBeVisible()
    expect(within(center).getByRole('img', { name: '原图 1' })).toHaveAttribute(
      'src',
      '/api/images/image-1',
    )
    expect(within(right).getByRole('heading', { name: 'AI 辅助建议' })).toBeVisible()
    expect(within(right).getByRole('radio', { name: '息肉' })).toBeChecked()
    expect(within(right).getByRole('combobox', { name: '处置建议' })).toHaveValue(
      'followup',
    )
    expect(within(right).getByRole('textbox', { name: '备注' })).toHaveValue(
      '三个月后复查',
    )
    expect(within(right).getByRole('link', { name: '导出 PDF 报告' })).toHaveAttribute(
      'href',
      '/api/cases/case-1/report.pdf',
    )
    expect(getCaseDetail).toHaveBeenCalledWith('case-1')
  })

  it('shows the saved doctor and time metadata', async () => {
    renderDiagnosis()

    await screen.findByText(/已保存判断/)
    const right = screen.getByRole('region', { name: '批量诊断工作区' })
    expect(within(right).getByText(/已保存判断/)).toHaveTextContent('医生 doctor-7')
    expect(within(right).getByText(/已保存判断/)).toHaveTextContent(
      formatDateTime(caseDetail.judgment!.judged_at),
    )
  })

  it('keeps the primary save action and refreshes both case and batch status after saving', async () => {
    const user = userEvent.setup()
    const onSavedAndNext = vi.fn()
    vi.mocked(postJudgment).mockResolvedValue(judgmentResponse)
    const onSaved = vi.fn()
    const { queryClient } = renderDiagnosis({ onSaved, onSavedAndNext })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    const primary = await screen.findByRole('button', { name: '保存判断' })
    expect(screen.getByRole('button', { name: '保存并下一位' })).toBeVisible()
    await user.click(primary)

    await waitFor(() => expect(postJudgment).toHaveBeenCalledWith('case-1', {
      final_class: 'polyp',
      recommendation: 'followup',
      note: '三个月后复查',
      expected_judged_at: '2026-07-12T09:30:00Z',
    }))
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['case', 'case-1'] })
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['batch-status', 'job-running'] })
    })
    expect(await screen.findByText('判断已保存')).toBeVisible()
    expect(onSaved).toHaveBeenCalledWith('case-1')
    expect(onSavedAndNext).not.toHaveBeenCalled()
  })

  it('advances only after the secondary save succeeds', async () => {
    const user = userEvent.setup()
    let resolveSave!: (response: JudgmentResponse) => void
    vi.mocked(postJudgment).mockImplementation(() => new Promise((resolve) => {
      resolveSave = resolve
    }))
    const onSavedAndNext = vi.fn()
    renderDiagnosis({ onSavedAndNext })

    await user.click(await screen.findByRole('button', { name: '保存并下一位' }))
    expect(postJudgment).toHaveBeenCalledTimes(1)
    expect(onSavedAndNext).not.toHaveBeenCalled()

    resolveSave(judgmentResponse)
    await waitFor(() => expect(onSavedAndNext).toHaveBeenCalledWith('case-1'))
  })

  it('retains checked input, reports an alert, and does not advance when saving fails', async () => {
    const user = userEvent.setup()
    vi.mocked(postJudgment).mockRejectedValue(new Error('判断保存失败，请重试'))
    const onSavedAndNext = vi.fn()
    renderDiagnosis({ onSavedAndNext })

    const cancer = await screen.findByRole('radio', { name: '疑似子宫内膜癌' })
    await user.click(cancer)
    await user.click(screen.getByRole('button', { name: '保存并下一位' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('判断保存失败，请重试')
    expect(cancer).toBeChecked()
    expect(onSavedAndNext).not.toHaveBeenCalled()
  })

  it('retains dirty inputs when the server reports a concurrent judgment conflict', async () => {
    const user = userEvent.setup()
    vi.mocked(postJudgment).mockRejectedValue(
      new Error('判断已被其他医生更新，请刷新后重试'),
    )
    renderDiagnosis()

    const note = await screen.findByRole('textbox', { name: '备注' })
    await user.clear(note)
    await user.type(note, '我的未保存意见')
    await user.click(screen.getByRole('button', { name: '保存判断' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('请刷新后重试')
    expect(note).toHaveValue('我的未保存意见')
    expect(postJudgment).toHaveBeenCalledWith('case-1', expect.objectContaining({
      expected_judged_at: '2026-07-12T09:30:00Z',
      note: '我的未保存意见',
    }))
  })

  it('passes judgment dirty changes through to the batch page', async () => {
    const user = userEvent.setup()
    const onDirtyChange = vi.fn()
    renderDiagnosis({ onDirtyChange })

    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false))
    await user.type(await screen.findByRole('textbox', { name: '备注' }), '，补充说明')
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true))
  })

  it('keeps both workspace regions stable while loading', () => {
    vi.mocked(getCaseDetail).mockImplementation(() => new Promise(() => undefined))
    renderDiagnosis()

    expect(screen.getByRole('region', { name: '批量影像工作区' }).firstElementChild)
      .toHaveClass('min-h-[420px]')
    expect(screen.getByRole('region', { name: '批量诊断工作区' }).firstElementChild)
      .toHaveClass('min-h-[420px]')
  })

  it('keeps the selected workspace and explicitly retries a failed case query', async () => {
    const user = userEvent.setup()
    vi.mocked(getCaseDetail)
      .mockRejectedValueOnce(new Error('病例服务暂时不可用'))
      .mockResolvedValueOnce(caseDetail)
    renderDiagnosis()

    expect(await screen.findByRole('alert')).toHaveTextContent('病例服务暂时不可用')
    expect(screen.getByRole('region', { name: '批量影像工作区' })).toBeVisible()
    expect(screen.getByRole('region', { name: '批量诊断工作区' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: '重新加载病例' }))

    expect(await screen.findByRole('heading', { name: 'AI 辅助建议' })).toBeVisible()
    expect(getCaseDetail).toHaveBeenCalledTimes(2)
  })

  it('shows a no-AI state without disabling doctor judgment', async () => {
    renderDiagnosis({ detail: { ...caseDetail, prediction: null } })

    expect(await screen.findByText('暂无 AI 辅助建议')).toBeVisible()
    expect(screen.getByRole('radio', { name: '息肉' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '保存判断' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '保存并下一位' })).toBeEnabled()
  })

  it('isolates an in-flight save from the next selected patient', async () => {
    const user = userEvent.setup()
    let resolveSave!: (response: JudgmentResponse) => void
    vi.mocked(getCaseDetail).mockImplementation(async (caseId) => (
      caseId === 'case-a' ? { ...caseDetail, case_id: 'case-a' } : caseDetailB
    ))
    vi.mocked(postJudgment).mockImplementation(() => new Promise((resolve) => {
      resolveSave = resolve
    }))
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const onSaved = vi.fn()

    function PatientSwitcher() {
      const [caseId, setCaseId] = useState('case-a')
      return (
        <>
          <button type="button" onClick={() => setCaseId('case-b')}>选择病例 B</button>
          <BatchPatientDiagnosis
            caseId={caseId}
            jobId="job-running"
            onDirtyChange={vi.fn()}
            onSaved={onSaved}
            onSavedAndNext={vi.fn()}
          >
            {({ center, right }) => (
              <div>
                <section aria-label="批量影像工作区">{center}</section>
                <section aria-label="批量诊断工作区">{right}</section>
              </div>
            )}
          </BatchPatientDiagnosis>
        </>
      )
    }

    const router = createMemoryRouter([{ path: '/', element: <PatientSwitcher /> }])
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    await user.click(await screen.findByRole('button', { name: '保存判断' }))
    await user.click(screen.getByRole('button', { name: '选择病例 B' }))
    expect(await screen.findByText('暂无 AI 辅助建议')).toBeVisible()

    await act(async () => resolveSave(judgmentResponse))

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['case', 'case-a'] })
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['batch-status', 'job-running'] })
    })
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['case', 'case-b'] })
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.queryByText('判断已保存')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('clears dirty state when save-and-next switches to a case that fails to load', async () => {
    const user = userEvent.setup()
    vi.mocked(getCaseDetail).mockImplementation((caseId) => {
      if (caseId === 'case-b') return Promise.reject(new Error('下一病例加载失败'))
      return Promise.resolve({ ...caseDetail, case_id: 'case-a' })
    })
    vi.mocked(postJudgment).mockResolvedValue(judgmentResponse)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    function SaveNextHarness() {
      const [caseId, setCaseId] = useState('case-a')
      const [dirty, setDirty] = useState(false)
      return (
        <>
          <output data-testid="parent-dirty">{String(dirty)}</output>
          <BatchPatientDiagnosis
            caseId={caseId}
            jobId="job-running"
            onDirtyChange={setDirty}
            onSaved={vi.fn()}
            onSavedAndNext={() => setCaseId('case-b')}
          >
            {({ center, right }) => (
              <div>
                <section aria-label="批量影像工作区">{center}</section>
                <section aria-label="批量诊断工作区">{right}</section>
              </div>
            )}
          </BatchPatientDiagnosis>
        </>
      )
    }

    const router = createMemoryRouter([{ path: '/', element: <SaveNextHarness /> }])
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    await user.type(await screen.findByRole('textbox', { name: '备注' }), '，已编辑')
    await waitFor(() => expect(screen.getByTestId('parent-dirty')).toHaveTextContent('true'))
    await user.click(screen.getByRole('button', { name: '保存并下一位' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('下一病例加载失败')
    expect(screen.getByTestId('parent-dirty')).toHaveTextContent('false')
  })

  it('keeps dirty inputs when a background case refresh changes judged_at', async () => {
    const user = userEvent.setup()
    const { queryClient } = renderDiagnosis()

    const note = await screen.findByRole('textbox', { name: '备注' })
    await user.clear(note)
    await user.type(note, '尚未保存的本地编辑')
    await waitFor(() => expect(note).toHaveValue('尚未保存的本地编辑'))

    act(() => {
      queryClient.setQueryData<CaseDetail>(['case', 'case-1'], {
        ...caseDetail,
        judgment: {
          ...caseDetail.judgment!,
          note: '后台返回的新内容',
          judged_at: '2026-07-12T10:00:00Z',
        },
      })
    })

    await screen.findByText((content) => (
      content.includes(formatDateTime('2026-07-12T10:00:00Z'))
    ))
    expect(screen.getByRole('textbox', { name: '备注' }))
      .toHaveValue('尚未保存的本地编辑')
    expect(screen.queryByDisplayValue('后台返回的新内容')).not.toBeInTheDocument()
  })

  it('ignores a stale save-and-next continuation after another patient becomes dirty', async () => {
    const user = userEvent.setup()
    let resolveSave!: (response: JudgmentResponse) => void
    vi.mocked(getCaseDetail).mockImplementation(async (caseId) => (
      caseId === 'case-a'
        ? { ...caseDetail, case_id: 'case-a' }
        : {
            ...caseDetail,
            case_id: 'case-b',
            patient_no: 'P-002',
            judgment: {
              ...caseDetail.judgment!,
              note: '病例 B 原始备注',
            },
          }
    ))
    vi.mocked(postJudgment).mockImplementation(() => new Promise((resolve) => {
      resolveSave = resolve
    }))
    const onSavedAndNext = vi.fn()
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    function StaleSecondaryHarness() {
      const [caseId, setCaseId] = useState('case-a')
      const [dirty, setDirty] = useState(false)
      return (
        <>
          <output data-testid="parent-dirty">{String(dirty)}</output>
          <button type="button" onClick={() => setCaseId('case-b')}>选择病例 B</button>
          <BatchPatientDiagnosis
            caseId={caseId}
            jobId="job-running"
            onDirtyChange={setDirty}
            onSaved={vi.fn()}
            onSavedAndNext={onSavedAndNext}
          >
            {({ center, right }) => (
              <div>
                <section aria-label="批量影像工作区">{center}</section>
                <section aria-label="批量诊断工作区">{right}</section>
              </div>
            )}
          </BatchPatientDiagnosis>
        </>
      )
    }

    const router = createMemoryRouter([{ path: '/', element: <StaleSecondaryHarness /> }])
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    await user.click(await screen.findByRole('button', { name: '保存并下一位' }))
    await waitFor(() => expect(postJudgment).toHaveBeenCalledWith('case-a', expect.anything()))
    await user.click(screen.getByRole('button', { name: '选择病例 B' }))

    const note = await screen.findByRole('textbox', { name: '备注' })
    expect(note).toHaveValue('病例 B 原始备注')
    await user.type(note, '，本地编辑')
    await waitFor(() => expect(screen.getByTestId('parent-dirty')).toHaveTextContent('true'))

    await act(async () => resolveSave(judgmentResponse))

    await waitFor(() => {
      expect(queryClient.getQueryState(['case', 'case-a'])?.isInvalidated).toBe(true)
    })
    expect(onSavedAndNext).not.toHaveBeenCalled()
    expect(screen.getByTestId('parent-dirty')).toHaveTextContent('true')
    expect(note).toHaveValue('病例 B 原始备注，本地编辑')
  })
})
