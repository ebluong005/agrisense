import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError, clearToken, getToken, setToken, setUnauthorizedHandler } from '../api/client'
import { authApi } from '../api/endpoints'
import type { User } from '../api/types'

type AuthState =
  | { status: 'checking' }
  | { status: 'signedOut'; notice?: string }
  | { status: 'signedIn'; user: User }
  | { status: 'unreachable' } // saved session, but the API could not be reached to confirm it

type AuthContextValue = {
  state: AuthState
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: (notice?: string) => void
  retryCheck: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => (getToken() ? { status: 'checking' } : { status: 'signedOut' }))

  const signOut = useCallback((notice?: string) => {
    clearToken()
    setState({ status: 'signedOut', notice })
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => signOut('Your session has ended. Please sign in again.'))
    return () => setUnauthorizedHandler(null)
  }, [signOut])

  // Validate a token saved from a previous visit.
  const checking = state.status === 'checking'
  useEffect(() => {
    if (!checking) return
    const controller = new AbortController()
    authApi.me({ signal: controller.signal }).then(
      (user) => setState({ status: 'signedIn', user }),
      (error) => {
        if (controller.signal.aborted) return
        if (error instanceof ApiError && error.status === 401) return // handler already signed out
        // Flaky rural connections are common: keep the saved session and offer a retry.
        setState({ status: 'unreachable' })
      },
    )
    return () => controller.abort()
  }, [checking])

  const value = useMemo<AuthContextValue>(() => {
    async function startSession(token: string) {
      setToken(token)
      const user = await authApi.me()
      setState({ status: 'signedIn', user })
    }
    return {
      state,
      signOut,
      retryCheck: () => setState({ status: 'checking' }),
      signIn: async (email, password) => startSession((await authApi.login(email, password)).access_token),
      signUp: async (email, password) => startSession((await authApi.register(email, password)).access_token),
    }
  }, [state, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
