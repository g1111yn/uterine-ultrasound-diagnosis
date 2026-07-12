import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import BatchNav from './BatchNav'

afterEach(cleanup)

describe('BatchNav', () => {
  it('renders the three exact batch destinations and marks only the current one active', () => {
    render(
      <MemoryRouter initialEntries={['/batch/running']}>
        <BatchNav />
      </MemoryRouter>,
    )

    const create = screen.getByRole('link', { name: '新建任务' })
    const running = screen.getByRole('link', { name: '运行中' })
    const history = screen.getByRole('link', { name: '历史记录' })

    expect(create).toHaveAttribute('href', '/batch')
    expect(running).toHaveAttribute('href', '/batch/running')
    expect(history).toHaveAttribute('href', '/batch/history')
    expect(create).not.toHaveAttribute('aria-current')
    expect(running).toHaveAttribute('aria-current', 'page')
    expect(history).not.toHaveAttribute('aria-current')
  })

  it('allows keyboard users to focus each tab in order', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/batch']}>
        <BatchNav />
      </MemoryRouter>,
    )

    for (const label of ['新建任务', '运行中', '历史记录']) {
      await user.tab()
      expect(screen.getByRole('link', { name: label })).toHaveFocus()
    }
  })
})
