import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useUnsavedChangesWarning } from './useUnsavedChangesWarning'

function Harness({ dirty }: { dirty: boolean }) {
  useUnsavedChangesWarning(dirty)
  return null
}

describe('useUnsavedChangesWarning', () => {
  it('registers the warning only while changes are dirty and cleans it up', () => {
    const { rerender, unmount } = render(<Harness dirty={false} />)

    const cleanEvent = new Event('beforeunload', { cancelable: true })
    fireEvent(window, cleanEvent)
    expect(cleanEvent.defaultPrevented).toBe(false)

    rerender(<Harness dirty />)
    const dirtyEvent = new Event('beforeunload', { cancelable: true })
    fireEvent(window, dirtyEvent)
    expect(dirtyEvent.defaultPrevented).toBe(true)

    unmount()
    const afterUnmountEvent = new Event('beforeunload', { cancelable: true })
    fireEvent(window, afterUnmountEvent)
    expect(afterUnmountEvent.defaultPrevented).toBe(false)
  })
})
