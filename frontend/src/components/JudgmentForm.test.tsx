import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import JudgmentForm from './JudgmentForm'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderWithRouter(element: ReactElement) {
  const router = createMemoryRouter([{ path: '/', element }])
  return render(<RouterProvider router={router} />)
}

describe('JudgmentForm', () => {
  it('requires a doctor to actively choose a final judgment for a new case', () => {
    renderWithRouter(<JudgmentForm initialClass={null} onSubmit={async () => undefined} />)

    expect(screen.getByRole('button', { name: '保存判断' })).toBeDisabled()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('shows four choices and submits an indeterminate judgment', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderWithRouter(<JudgmentForm initialClass={null} onSubmit={onSubmit} />)

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
    renderWithRouter(
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
    renderWithRouter(<JudgmentForm initialClass="polyp" onSubmit={async () => undefined} />)

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
    renderWithRouter(<JudgmentForm initialClass="polyp" onSubmit={onSubmit} />)

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

  it('reports dirty false after a primary save succeeds', async () => {
    const user = userEvent.setup()
    const onDirtyChange = vi.fn()
    renderWithRouter(
      <JudgmentForm
        initialClass="polyp"
        onSubmit={async () => undefined}
        onDirtyChange={onDirtyChange}
      />,
    )

    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false))
    await user.type(screen.getByRole('textbox', { name: '备注' }), '已编辑')
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true))

    await user.click(screen.getByRole('button', { name: '保存判断' }))

    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false))
    expect(onDirtyChange.mock.calls.map(([dirty]) => dirty)).toEqual([false, true, false])
  })

  it('stays dirty when an awaited save rejects', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockRejectedValue(new Error('保存失败'))
    renderWithRouter(<JudgmentForm initialClass="polyp" onSubmit={onSubmit} />)

    await user.selectOptions(screen.getByRole('combobox', { name: '处置建议' }), 'followup')
    await user.click(screen.getByRole('button', { name: '保存判断' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '保存判断' })).toBeEnabled())

    const rejectedEvent = new Event('beforeunload', { cancelable: true })
    fireEvent(window, rejectedEvent)
    expect(rejectedEvent.defaultPrevented).toBe(true)
  })

  it('submits the current judgment only through the secondary action', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const onSecondarySubmit = vi.fn().mockResolvedValue(undefined)
    renderWithRouter(
      <JudgmentForm
        initialClass="polyp"
        onSubmit={onSubmit}
        secondarySubmitLabel="保存并进入下一位"
        onSecondarySubmit={onSecondarySubmit}
      />,
    )

    await user.click(screen.getByRole('radio', { name: '疑似子宫内膜癌' }))
    await user.selectOptions(screen.getByRole('combobox', { name: '处置建议' }), 'biopsy')
    await user.type(screen.getByRole('textbox', { name: '备注' }), '建议取样')
    await user.click(screen.getByRole('button', { name: '保存并进入下一位' }))

    expect(onSecondarySubmit).toHaveBeenCalledWith({
      final_class: 'endometrial_cancer',
      recommendation: 'biopsy',
      note: '建议取样',
    })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('does not render the secondary action when only its label is provided', () => {
    renderWithRouter(
      <JudgmentForm
        initialClass="polyp"
        onSubmit={async () => undefined}
        secondarySubmitLabel="保存并进入下一位"
      />,
    )

    expect(screen.queryByRole('button', { name: '保存并进入下一位' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('does not render the secondary action when only its handler is provided', () => {
    renderWithRouter(
      <JudgmentForm
        initialClass="polyp"
        onSubmit={async () => undefined}
        onSecondarySubmit={async () => undefined}
      />,
    )

    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: '保存判断' })).toBeVisible()
  })

  it('reports dirty true then false after a secondary save succeeds', async () => {
    const user = userEvent.setup()
    const onDirtyChange = vi.fn()
    renderWithRouter(
      <JudgmentForm
        initialClass="polyp"
        onSubmit={async () => undefined}
        secondarySubmitLabel="保存并进入下一位"
        onSecondarySubmit={async () => undefined}
        onDirtyChange={onDirtyChange}
      />,
    )

    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false))
    await user.type(screen.getByRole('textbox', { name: '备注' }), '已编辑')
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true))

    await user.click(screen.getByRole('button', { name: '保存并进入下一位' }))

    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false))
    expect(onDirtyChange.mock.calls.map(([dirty]) => dirty)).toEqual([false, true, false])
  })

  it('retains values and stays dirty when the secondary save rejects', async () => {
    const user = userEvent.setup()
    const onDirtyChange = vi.fn()
    const onSecondarySubmit = vi.fn().mockRejectedValue(new Error('保存失败'))
    renderWithRouter(
      <JudgmentForm
        initialClass="polyp"
        onSubmit={async () => undefined}
        secondarySubmitLabel="保存并进入下一位"
        onSecondarySubmit={onSecondarySubmit}
        onDirtyChange={onDirtyChange}
      />,
    )

    await user.selectOptions(screen.getByRole('combobox', { name: '处置建议' }), 'followup')
    await user.type(screen.getByRole('textbox', { name: '备注' }), '三个月后复查')
    await user.click(screen.getByRole('button', { name: '保存并进入下一位' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '保存并进入下一位' })).toBeEnabled())

    expect(screen.getByRole('combobox', { name: '处置建议' })).toHaveValue('followup')
    expect(screen.getByRole('textbox', { name: '备注' })).toHaveValue('三个月后复查')
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
  })

  it('disables both actions and blocks duplicate submissions while either is pending', async () => {
    const user = userEvent.setup()
    let resolvePrimary!: () => void
    let resolveSecondary!: () => void
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => {
      resolvePrimary = resolve
    }))
    const onSecondarySubmit = vi.fn(() => new Promise<void>((resolve) => {
      resolveSecondary = resolve
    }))
    renderWithRouter(
      <JudgmentForm
        initialClass="polyp"
        onSubmit={onSubmit}
        secondarySubmitLabel="保存并进入下一位"
        onSecondarySubmit={onSecondarySubmit}
      />,
    )
    const primaryButton = screen.getByRole('button', { name: '保存判断' })
    const secondaryButton = screen.getByRole('button', { name: '保存并进入下一位' })

    await user.click(secondaryButton)

    expect(primaryButton).toBeDisabled()
    expect(secondaryButton).toBeDisabled()
    await user.click(primaryButton)
    await user.click(secondaryButton)
    expect(onSecondarySubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()

    resolveSecondary()
    await waitFor(() => expect(primaryButton).toBeEnabled())
    expect(secondaryButton).toBeEnabled()

    await user.click(primaryButton)

    expect(primaryButton).toBeDisabled()
    expect(secondaryButton).toBeDisabled()
    await user.click(primaryButton)
    await user.click(secondaryButton)
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith({
      final_class: 'polyp',
      recommendation: '',
      note: '',
    })
    expect(onSecondarySubmit).toHaveBeenCalledTimes(1)

    resolvePrimary()
    await waitFor(() => expect(primaryButton).toBeEnabled())
    expect(secondaryButton).toBeEnabled()
  })
})
