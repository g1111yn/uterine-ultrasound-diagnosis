import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BatchResultItem } from '@/lib/types'
import BatchPatientQueue, { matchesBatchPatientFilter } from './BatchPatientQueue'

const results: BatchResultItem[] = [
  {
    patient_no: 'P001',
    case_id: 'case-1',
    image_count: 2,
    predicted_class: 'normal',
    predicted_class_zh: '正常',
    confidence: 0.91,
    error: null,
    has_judgment: false,
  },
  {
    patient_no: 'P002',
    case_id: 'case-2',
    image_count: 3,
    predicted_class: 'polyp',
    predicted_class_zh: '子宫内膜息肉',
    confidence: 0.76,
    error: null,
    has_judgment: true,
  },
  {
    patient_no: 'P003',
    case_id: null,
    image_count: 1,
    predicted_class: null,
    predicted_class_zh: null,
    confidence: null,
    error: '图像格式无法识别',
    has_judgment: false,
  },
  {
    patient_no: 'P004',
    case_id: null,
    image_count: 4,
    predicted_class: null,
    predicted_class_zh: null,
    confidence: null,
    error: null,
    has_judgment: false,
  },
]

afterEach(cleanup)

describe('matchesBatchPatientFilter', () => {
  it('matches successful unjudged, judged, and failed patients by their real state', () => {
    expect(matchesBatchPatientFilter(results[0], 'unjudged')).toBe(true)
    expect(matchesBatchPatientFilter(results[0], 'judged')).toBe(false)
    expect(matchesBatchPatientFilter(results[1], 'judged')).toBe(true)
    expect(matchesBatchPatientFilter(results[2], 'failed')).toBe(true)
    expect(results.every((item) => matchesBatchPatientFilter(item, 'all'))).toBe(true)
  })

  it('keeps pending patients out of failed and unjudged filters', () => {
    expect(matchesBatchPatientFilter(results[3], 'all')).toBe(true)
    expect(matchesBatchPatientFilter(results[3], 'unjudged')).toBe(false)
    expect(matchesBatchPatientFilter(results[3], 'judged')).toBe(false)
    expect(matchesBatchPatientFilter(results[3], 'failed')).toBe(false)
  })
})

describe('BatchPatientQueue', () => {
  it('shows filter counts, the active filter, diagnosed progress, and filtered patients', async () => {
    const user = userEvent.setup()
    const onFilterChange = vi.fn()

    render(
      <BatchPatientQueue
        results={results}
        filter="unjudged"
        selectedCaseId="case-1"
        onFilterChange={onFilterChange}
        onSelect={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: '全部 4' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: '未诊断 1' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '已诊断 1' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: '推理失败 1' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('已诊断 1 / 可诊断 2')).toBeVisible()
    expect(screen.getByRole('button', { name: /患者 P001/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /患者 P002/ })).not.toBeInTheDocument()
    expect(screen.getByText('正常')).toBeVisible()
    expect(screen.getByText('91%')).toBeVisible()

    await user.click(screen.getByRole('button', { name: '已诊断 1' }))
    expect(onFilterChange).toHaveBeenCalledWith('judged')
  })

  it('separates a real inference failure from a patient still waiting', () => {
    const { rerender } = render(
      <BatchPatientQueue
        results={results}
        filter="failed"
        selectedCaseId={null}
        onFilterChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /患者 P003/ })).toBeVisible()
    expect(screen.getByText('推理失败')).toBeVisible()
    expect(screen.queryByRole('button', { name: /患者 P004/ })).not.toBeInTheDocument()

    rerender(
      <BatchPatientQueue
        results={results}
        filter="all"
        selectedCaseId={null}
        onFilterChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /患者 P004/ })).toBeVisible()
    expect(screen.getByText('等待推理')).toBeVisible()
    expect(screen.getByText('未诊断')).toBeVisible()
    expect(screen.getByText('已诊断')).toBeVisible()
  })

  it('uses patient buttons with selection state and only selects a non-null case', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()

    render(
      <BatchPatientQueue
        results={results}
        filter="all"
        selectedCaseId="case-2"
        onFilterChange={vi.fn()}
        onSelect={onSelect}
      />,
    )

    const unjudgedPatient = screen.getByRole('button', { name: /患者 P001/ })
    const judgedPatient = screen.getByRole('button', { name: /患者 P002/ })
    const failedPatient = screen.getByRole('button', { name: /患者 P003/ })

    expect(unjudgedPatient).toHaveAttribute('aria-pressed', 'false')
    expect(judgedPatient).toHaveAttribute('aria-pressed', 'true')
    expect(failedPatient).toHaveAttribute('aria-pressed', 'false')

    await user.click(unjudgedPatient)
    await user.click(failedPatient)

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('case-1')
  })
})
