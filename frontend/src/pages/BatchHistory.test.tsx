import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getBatchJobs } from '@/api/client'
import BatchHistory from './BatchHistory'

vi.mock('@/api/client', () => ({
  getBatchJobs: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/batch/history']}>
        <BatchHistory />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('BatchHistory', () => {
  it('shows a request error instead of the empty state and lets the user retry', async () => {
    const user = userEvent.setup()
    vi.mocked(getBatchJobs).mockRejectedValue(new Error('网络连接中断'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('网络连接中断')
    expect(screen.queryByText('暂无批量任务记录')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '重新加载批量任务' }))
    await waitFor(() => expect(getBatchJobs).toHaveBeenCalledTimes(2))
  })

  it('gives pagination icon buttons accurate accessible names', async () => {
    vi.mocked(getBatchJobs).mockResolvedValue({
      total: 16,
      page: 1,
      page_size: 15,
      items: [{
        job_id: 'job-1234567890abcdef',
        status: 'completed',
        total_patients: 1,
        completed_patients: 1,
        succeeded_patients: 1,
        failed_patients: 0,
        total_images: 2,
        completed_images: 2,
        aggregation_strategy: 'mean',
        started_at: '2026-07-12T08:00:00Z',
        finished_at: '2026-07-12T08:01:00Z',
      }],
    })
    renderPage()

    await screen.findByRole('link', { name: 'job-12345678' })
    expect(screen.getByRole('button', { name: '上一页批量任务' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '下一页批量任务' })).toBeEnabled()
  })
})
