import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RouteError } from './RouteError'

function renderThrowing(error: Error) {
  const Boom = () => {
    throw error
  }
  const router = createMemoryRouter([{ path: '/', element: <Boom />, errorElement: <RouteError /> }])
  render(<RouterProvider router={router} />)
}

describe('RouteError', () => {
  afterEach(() => sessionStorage.clear())

  it('shows a plain-language page instead of the developer screen', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderThrowing(new Error('boom'))
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByText(/saved farms and fields are not affected/)).toBeInTheDocument()
    expect(screen.queryByText(/Hey developer/)).not.toBeInTheDocument()
  })

  it('reloads automatically once for a stale code chunk', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    renderThrowing(new TypeError('Failed to fetch dynamically imported module: /assets/x.js'))
    expect(screen.getByText('Updating AgriSense to the latest version…')).toBeInTheDocument()
    expect(reload).toHaveBeenCalledOnce()
  })

  it('does not loop: right after a reload it explains instead', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    sessionStorage.setItem('agrisense:chunk-reload-at', String(Date.now()))
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    renderThrowing(new TypeError('Failed to fetch dynamically imported module: /assets/x.js'))
    expect(screen.getByText(/AgriSense was just updated/)).toBeInTheDocument()
    expect(reload).not.toHaveBeenCalled()
  })
})
