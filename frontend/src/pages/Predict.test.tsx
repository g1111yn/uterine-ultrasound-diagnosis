import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import Predict from './Predict'

afterEach(cleanup)

function renderPredict() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const router = createMemoryRouter([{ path: '/', element: <Predict /> }])

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('Predict initial workspace', () => {
  it('uses the shared 1600px workspace instead of a narrow page override', () => {
    renderPredict()

    const grid = screen.getByRole('heading', { name: '输入' }).parentElement?.parentElement
    const container = grid?.parentElement

    expect(container).toHaveClass('w-full', 'max-w-[1600px]', 'mx-auto')
    expect(container).not.toHaveClass('max-w-6xl')
  })

  it('keeps the initial workspace single-column until the desktop breakpoint', () => {
    renderPredict()

    const grid = screen.getByRole('heading', { name: '输入' }).parentElement?.parentElement
    expect(grid).toHaveClass('grid', 'grid-cols-1', 'lg:grid-cols-2')
  })
})
