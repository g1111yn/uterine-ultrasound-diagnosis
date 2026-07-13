import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, RouterProvider, createMemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { useUnsavedChangesWarning } from './useUnsavedChangesWarning'

function Harness({ dirty }: { dirty: boolean }) {
  useUnsavedChangesWarning(dirty)
  return null
}

describe('useUnsavedChangesWarning', () => {
  it('registers the warning only while changes are dirty and cleans it up', () => {
    const cleanRouter = createMemoryRouter([{ path: '/', element: <Harness dirty={false} /> }])
    const { unmount: unmountClean } = render(<RouterProvider router={cleanRouter} />)

    const cleanEvent = new Event('beforeunload', { cancelable: true })
    fireEvent(window, cleanEvent)
    expect(cleanEvent.defaultPrevented).toBe(false)
    unmountClean()

    const dirtyRouter = createMemoryRouter([{ path: '/', element: <Harness dirty /> }])
    const { unmount } = render(<RouterProvider router={dirtyRouter} />)
    const dirtyEvent = new Event('beforeunload', { cancelable: true })
    fireEvent(window, dirtyEvent)
    expect(dirtyEvent.defaultPrevented).toBe(true)

    unmount()
    const afterUnmountEvent = new Event('beforeunload', { cancelable: true })
    fireEvent(window, afterUnmountEvent)
    expect(afterUnmountEvent.defaultPrevented).toBe(false)
  })

  it('keeps the doctor on the page when internal navigation is declined', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const router = createMemoryRouter([
      {
        path: '/',
        element: (
          <>
            <Harness dirty />
            <Link to="/history">离开页面</Link>
          </>
        ),
      },
      { path: '/history', element: <div>历史记录</div> },
    ])

    render(<RouterProvider router={router} />)
    await user.click(screen.getByRole('link', { name: '离开页面' }))

    expect(confirm).toHaveBeenCalledOnce()
    expect(screen.getByRole('link', { name: '离开页面' })).toBeVisible()
    expect(screen.queryByText('历史记录')).not.toBeInTheDocument()
    confirm.mockRestore()
  })
})
