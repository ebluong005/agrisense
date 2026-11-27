import { lazy } from 'react'
import { createBrowserRouter, Link, RouterProvider } from 'react-router'
import { AuthProvider } from './auth/AuthContext'
import { PublicOnly, RequireAuth } from './auth/RouteGuards'
import { AppShell } from './components/layout/AppShell'
import { RouteError } from './components/layout/RouteError'
import { AccountPage } from './features/account/AccountPage'
import { LoginPage } from './features/auth/LoginPage'
import { RegisterPage } from './features/auth/RegisterPage'
import { FarmListPage } from './features/farms/FarmListPage'

// Map-heavy screens load on demand so the first visit stays small on slow connections.
const FarmDetailPage = lazy(() => import('./features/farms/FarmDetailPage').then((m) => ({ default: m.FarmDetailPage })))
const NewFarmPage = lazy(() => import('./features/farms/FarmFormPage').then((m) => ({ default: m.NewFarmPage })))
const EditFarmPage = lazy(() => import('./features/farms/FarmFormPage').then((m) => ({ default: m.EditFarmPage })))
const FieldDetailPage = lazy(() => import('./features/fields/FieldDetailPage').then((m) => ({ default: m.FieldDetailPage })))
const FieldFormPage = lazy(() => import('./features/fields/FieldFormPage').then((m) => ({ default: m.FieldFormPage })))

function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <Link to="/" className="mt-4 inline-block min-h-11 font-semibold text-brand-800 underline">
        Go to my farms
      </Link>
    </div>
  )
}

const routes = [
  {
    element: <PublicOnly />,
    errorElement: <RouteError />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <FarmListPage /> },
          { path: '/farms/new', element: <NewFarmPage /> },
          { path: '/farms/:farmId', element: <FarmDetailPage /> },
          { path: '/farms/:farmId/edit', element: <EditFarmPage /> },
          { path: '/farms/:farmId/fields/new', element: <FieldFormPage /> },
          { path: '/farms/:farmId/fields/:fieldId', element: <FieldDetailPage /> },
          { path: '/farms/:farmId/fields/:fieldId/edit', element: <FieldFormPage /> },
          { path: '/account', element: <AccountPage /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]

const router = createBrowserRouter(routes)

export function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
