import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { AuthProvider } from '../auth/AuthContext'
import { PublicOnly, RequireAuth } from '../auth/RouteGuards'

/** Render `element` at `path` inside the real auth provider and guards. */
export function renderRoute(path: string, element: ReactNode, { publicPage = false, extra = [] as { path: string; element: ReactNode }[] } = {}) {
  const router = createMemoryRouter(
    [
      { element: <PublicOnly />, children: [{ path: '/login', element: publicPage && path === '/login' ? element : <p>Login screen</p> }, ...(publicPage && path !== '/login' ? [{ path, element }] : [])] },
      { element: <RequireAuth />, children: [...(publicPage ? [] : [{ path, element }]), ...extra] },
    ],
    { initialEntries: [path] },
  )
  return { router, ...render(<AuthProvider><RouterProvider router={router} /></AuthProvider>) }
}
