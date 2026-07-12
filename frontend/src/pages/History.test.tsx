import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCases } from '@/api/client'
import History from './History'

vi.mock('@/api/client', () => ({
  getCases: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('History', () => {
  it('uses the displayed case number as the only case-detail link', async () => {
    vi.mocked(getCases).mockResolvedValue({
      total: 1,
      page: 1,
      page_size: 20,
      items: [{
        case_id: 'case-1234567890abcdef',
        patient_no: 'P-2026-001',
        created_at: '2026-07-12T08:00:00Z',
        image_count: 2,
        predicted_class_zh: '息肉',
        confidence: 0.82,
        doctor_judgment: null,
        doctor_judgment_zh: null,
        agreement: null,
        doctor_name: null,
      }],
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/history']}>
          <History />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const link = await screen.findByRole('link', { name: 'P-2026-001' })
    expect(link).toHaveAttribute('href', '/case/case-1234567890abcdef')
    expect(screen.getAllByRole('link')).toHaveLength(1)

    const row = link.closest('tr')
    expect(row).not.toBeNull()
    expect(row).not.toHaveAttribute('onclick')
    expect(row).not.toHaveClass('cursor-pointer')
    expect(screen.queryByRole('columnheader', { name: '操作' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '详情' })).not.toBeInTheDocument()
    await waitFor(() => expect(getCases).toHaveBeenCalledTimes(1))
  })
})
