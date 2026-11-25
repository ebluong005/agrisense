import { useEffect, useEffectEvent, useState } from 'react'
import { ApiError, toApiError } from '../api/client'

type Settled<T> = { requestKey: string; key: string; data?: T; error?: ApiError }

export type ApiState<T> = {
  data: T | undefined // last successful data for this key (kept while reloading)
  error: ApiError | undefined
  loading: boolean
  reload: () => void
}

/**
 * Load data for `key` (pass null to skip). Re-runs when the key changes or on reload().
 * Aborts in-flight requests on unmount or key change, so stale responses never win.
 */
export function useApi<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>): ApiState<T> {
  const [reloads, setReloads] = useState(0)
  const [settled, setSettled] = useState<Settled<T> | null>(null)
  const run = useEffectEvent((signal: AbortSignal) => load(signal))
  const requestKey = key === null ? null : `${key}#${reloads}`

  useEffect(() => {
    if (requestKey === null || key === null) return
    const controller = new AbortController()
    run(controller.signal).then(
      (data) => !controller.signal.aborted && setSettled({ requestKey, key, data }),
      (error) => !controller.signal.aborted && setSettled({ requestKey, key, error: toApiError(error) }),
    )
    return () => controller.abort()
  }, [requestKey, key])

  const current = settled?.requestKey === requestKey ? settled : null
  const sameKey = settled?.key === key ? settled : null
  return {
    data: current ? current.data : sameKey?.data,
    error: current?.error,
    loading: requestKey !== null && current === null,
    reload: () => setReloads((n) => n + 1),
  }
}

/** Wrap a mutation with pending/error state for forms and buttons. */
export function useAction<Args extends unknown[], R>(action: (...args: Args) => Promise<R>) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  async function run(...args: Args): Promise<R | undefined> {
    setPending(true)
    setError(null)
    try {
      return await action(...args)
    } catch (e) {
      setError(toApiError(e))
      return undefined
    } finally {
      setPending(false)
    }
  }
  return { run, pending, error, clearError: () => setError(null) }
}
