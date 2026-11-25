/** HTTP client for the FastAPI backend: auth header, timeouts, friendly errors. */

const TOKEN_KEY = 'agrisense_token'
const API_ROOT = `${(import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')}/api/v1`
const TIMEOUT_MS = 45_000 // NASA POWER can be slow on a cache miss

export class ApiError extends Error {
  readonly status: number // 0 = network/timeout
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

let onUnauthorized: (() => void) | null = null
/** Called when a signed-in request is rejected (expired or revoked session). */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler
}

type ValidationIssue = { loc?: (string | number)[]; msg?: string }

/** Turn FastAPI's `detail` (string or 422 issue list) into one readable sentence. */
export function messageFromDetail(detail: unknown): string | null {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const parts = (detail as ValidationIssue[]).map((issue) => {
      const field = issue.loc?.filter((p) => p !== 'body').at(-1)
      const msg = (issue.msg ?? 'is invalid').replace(/^Value error, /, '')
      return field !== undefined ? `${String(field).replace(/_/g, ' ')}: ${msg}` : msg
    })
    return parts.join('. ') || null
  }
  return null
}

const FALLBACK: Record<number, string> = {
  0: "Can't reach AgriSense. Check your internet connection and try again.",
  401: 'Please sign in again.',
  404: "We couldn't find that. It may have been deleted.",
  429: 'Too many requests. Please wait a moment and try again.',
  500: 'Something went wrong on our side. Please try again.',
  502: 'A data provider is not responding right now. Please try again later.',
  503: 'This service is temporarily unavailable. Please try again later.',
  504: 'A data provider took too long to respond. Please try again later.',
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  return new ApiError(0, FALLBACK[0])
}

type RequestOptions = { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown; signal?: AbortSignal }

export async function apiRequest<T>(path: string, { method = 'GET', body, signal }: RequestOptions = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  // Plain timer + controller instead of AbortSignal.any/timeout, which older phones lack.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const forwardAbort = () => controller.abort()
  signal?.addEventListener('abort', forwardAbort, { once: true })
  try {
    return await send<T>(path, method, headers, body, controller.signal, signal, token)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', forwardAbort)
  }
}

async function send<T>(
  path: string,
  method: string,
  headers: Record<string, string>,
  body: unknown,
  requestSignal: AbortSignal,
  callerSignal: AbortSignal | undefined,
  token: string | null,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: requestSignal,
    })
  } catch (error) {
    if (callerSignal?.aborted) throw error // caller cancelled; not a user-facing failure
    throw new ApiError(0, FALLBACK[0])
  }

  if (!response.ok) {
    let detail: unknown = null
    try {
      detail = ((await response.json()) as { detail?: unknown }).detail
    } catch {
      // non-JSON error body
    }
    if (response.status === 401 && token) onUnauthorized?.()
    // 5xx bodies are hidden (may leak internals) except the API's own provider-outage messages.
    const fromServer = response.status >= 500 && ![502, 503, 504].includes(response.status) ? null : messageFromDetail(detail)
    throw new ApiError(response.status, fromServer ?? FALLBACK[response.status] ?? `Request failed (${response.status}).`)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
