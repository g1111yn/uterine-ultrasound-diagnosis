import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import JudgmentForm from './JudgmentForm'

afterEach(cleanup)

describe('JudgmentForm', () => {
  it('requires a doctor to actively choose a final judgment for a new case', () => {
    render(<JudgmentForm initialClass={null} onSubmit={() => undefined} />)

    expect(screen.getByRole('button', { name: '保存判断' })).toBeDisabled()
  })

  it('shows four choices and submits an indeterminate judgment', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<JudgmentForm initialClass={null} onSubmit={onSubmit} />)

    expect(screen.getByRole('radio', { name: '正常' })).toBeVisible()
    expect(screen.getByRole('radio', { name: '息肉' })).toBeVisible()
    expect(screen.getByRole('radio', { name: '疑似子宫内膜癌' })).toBeVisible()
    expect(screen.getByRole('radio', { name: '无法判断 / 需进一步检查' })).toBeVisible()

    await user.click(screen.getByRole('radio', { name: '无法判断 / 需进一步检查' }))
    expect(screen.getByRole('button', { name: '保存判断' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: '保存判断' }))
    expect(onSubmit).toHaveBeenCalledWith({
      final_class: 'indeterminate',
      recommendation: '',
      note: '',
    })
  })

  it('loads an existing judgment and its recommendation and note', () => {
    render(
      <JudgmentForm
        initialClass="polyp"
        initialRecommendation="followup"
        initialNote="三个月后复查"
        onSubmit={() => undefined}
      />,
    )

    expect(screen.getByRole('radio', { name: '息肉' })).toBeChecked()
    expect(screen.getByRole('combobox', { name: '处置建议' })).toHaveValue('followup')
    expect(screen.getByRole('textbox', { name: '备注' })).toHaveValue('三个月后复查')
  })

  it('blocks beforeunload only after a field has changed', async () => {
    const user = userEvent.setup()
    render(<JudgmentForm initialClass="polyp" onSubmit={() => undefined} />)

    const cleanEvent = new Event('beforeunload', { cancelable: true })
    fireEvent(window, cleanEvent)
    expect(cleanEvent.defaultPrevented).toBe(false)

    await user.type(screen.getByRole('textbox', { name: '备注' }), '新增备注')

    const dirtyEvent = new Event('beforeunload', { cancelable: true })
    fireEvent(window, dirtyEvent)
    expect(dirtyEvent.defaultPrevented).toBe(true)
  })
})
