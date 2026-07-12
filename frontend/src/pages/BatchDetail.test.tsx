import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cancelBatch, getBatchStatus } from '@/api/client'
import type { BatchJobStatus } from '@/lib/types'
import BatchDetail, { BatchCancelButton } from './BatchDetail'

vi.mock('@/api/client', () => ({
  cancelBatch: vi.fn(),
  getBatchStatus: vi.fn(),
  getCaseDetail: vi.fn(),
  getImageUrl: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

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
