import { StrictMode } from 'react'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MultiImageUploader from './MultiImageUploader'

describe('MultiImageUploader previews', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps the mounted preview URL alive and revokes it on unmount', () => {
    let nextUrl = 0
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation(() => `blob:preview-${++nextUrl}`)
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const file = new File(['image'], 'scan.png', { type: 'image/png' })

    const { unmount } = render(
      <StrictMode>
        <MultiImageUploader files={[file]} onChange={() => undefined} />
      </StrictMode>,
    )

    const previewUrl = screen.getByRole('img', { name: file.name }).getAttribute('src')
    expect(createObjectURL).toHaveBeenCalled()
    expect(revokeObjectURL).not.toHaveBeenCalledWith(previewUrl)

    unmount()
    expect(revokeObjectURL).toHaveBeenCalledWith(previewUrl)
  })
})
