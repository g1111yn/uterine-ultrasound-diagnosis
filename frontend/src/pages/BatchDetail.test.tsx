import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cancelBatch } from '@/api/client'
import type { BatchJobStatus } from '@/lib/types'
import { BatchCancelButton } from './BatchDetail'

vi.mock('@/api/client', () => ({
  cancelBatch: vi.fn(),
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
