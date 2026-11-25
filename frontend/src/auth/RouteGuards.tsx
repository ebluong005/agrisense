import { Navigate, Outlet, useLocation } from 'react-router'
import { ErrorState, LoadingState } from '../components/ui/States'
import { useAuth } from './AuthContext'

function Unreachable() {
  const { retryCheck, signOut } = useAuth()
  return (
    <ErrorState
      fullPage
      message="Can't reach AgriSense. Check your internet connection and try again."
      onRetry={retryCheck}
      secondaryAction={{ label: 'Sign out', onClick: () => signOut() }}
    />
  )
}

export function RequireAuth() {
  const { state } = useAuth()
  const location = useLocation()
  if (state.status === 'checking') return <LoadingState label="Checking your account…" fullPage />
  if (state.status === 'unreachable') return <Unreachable />
  if (state.status === 'signedOut') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

export function PublicOnly() {
  const { state } = useAuth()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/'
  if (state.status === 'checking') return <LoadingState label="Checking your account…" fullPage />
  if (state.status === 'unreachable') return <Unreachable />
  if (state.status === 'signedIn') return <Navigate to={from} replace />
  return <Outlet />
}
