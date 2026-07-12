import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import JudgmentForm from './JudgmentForm'

afterEach(cleanup)

describe('JudgmentForm', () => {
  it('requires a doctor to actively choose a final judgment for a new case', () => {
    render(<JudgmentForm initialClass={null} onSubmit={async () => undefined} />)

    expect(screen.getByRole('button', { name: '保存判断' })).toBeDisabled()
  })

  it('shows four choices and submits an indeterminate judgment', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
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
        onSubmit={async () => undefined}
      />,
    )

    expect(screen.getByRole('radio', { name: '息肉' })).toBeChecked()
    expect(screen.getByRole('combobox', { name: '处置建议' })).toHaveValue('followup')
    expect(screen.getByRole('textbox', { name: '备注' })).toHaveValue('三个月后复查')
  })

  it('blocks beforeunload only after a field has changed', async () => {
    const user = userEvent.setup()
    render(<JudgmentForm initialClass="polyp" onSubmit={async () => undefined} />)

    const cleanEvent = new Event('beforeunload', { cancelable: true })
    fireEvent(window, cleanEvent)
    expect(cleanEvent.defaultPrevented).toBe(false)

    await user.type(screen.getByRole('textbox', { name: '备注' }), '新增备注')

    const dirtyEvent = new Event('beforeunload', { cancelable: true })
    fireEvent(window, dirtyEvent)
    expect(dirtyEvent.defaultPrevented).toBe(true)
  })

  it('becomes clean immediately after an awaited save succeeds', async () => {
    const user = userEvent.setup()
    let resolveSave!: () => void
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => {
      resolveSave = resolve
    }))
    render(<JudgmentForm initialClass="polyp" onSubmit={onSubmit} />)

    await user.type(screen.getByRole('textbox', { name: '备注' }), '已编辑')
    const dirtyEvent = new Event('beforeunload', { cancelable: true })
    fireEvent(window, dirtyEvent)
    expect(dirtyEvent.defaultPrevented).toBe(true)

    await user.click(screen.getByRole('button', { name: '保存判断' }))
    expect(screen.getByRole('button', { name: '提交中...' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '提交中...' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)

    resolveSave()
    await waitFor(() => expect(screen.getByRole('button', { name: '保存判断' })).toBeEnabled())

    const savedEvent = new Event('beforeunload', { cancelable: true })
    fireEvent(window, savedEvent)
    expect(savedEvent.defaultPrevented).toBe(false)
  })

  it('stays dirty when an awaited save rejects', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockRejectedValue(new Error('保存失败'))
    render(<JudgmentForm initialClass="polyp" onSubmit={onSubmit} />)

    await user.selectOptions(screen.getByRole('combobox', { name: '处置建议' }), 'followup')
    await user.click(screen.getByRole('button', { name: '保存判断' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '保存判断' })).toBeEnabled())

    const rejectedEvent = new Event('beforeunload', { cancelable: true })
    fireEvent(window, rejectedEvent)
    expect(rejectedEvent.defaultPrevented).toBe(true)
  })
})
