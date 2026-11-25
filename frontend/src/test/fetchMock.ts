import { vi } from 'vitest'

type Handler = (body: unknown) => { status?: number; json?: unknown }

/** Stub global fetch with handlers keyed by "METHOD /path" (path after /api/v1, query included). */
export function mockApi(handlers: Record<string, Handler>) {
  const calls: { method: string; path: string; body: unknown; headers: Record<string, string> }[] = []
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET'
    const path = String(url).replace(/^.*\/api\/v1/, '')
    const body = init.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method, path, body, headers: (init.headers ?? {}) as Record<string, string> })
    const handler = handlers[`${method} ${path}`] ?? handlers[`${method} ${path.split('?')[0]}`]
    if (!handler) return new Response(JSON.stringify({ detail: `No mock for ${method} ${path}` }), { status: 404 })
    const { status = 200, json } = handler(body)
    return new Response(status === 204 ? null : JSON.stringify(json ?? {}), { status, headers: { 'Content-Type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}

export const farm = { id: 7, owner_id: 1, name: 'Creek Farm', latitude: 32.2226, longitude: -110.9747, created_at: '2026-11-01T00:00:00Z' }
export const square = { type: 'Polygon' as const, coordinates: [[[-110.98, 32.2], [-110.97, 32.2], [-110.97, 32.21], [-110.98, 32.21], [-110.98, 32.2]]] }
export const field = { id: 3, farm_id: 7, name: 'South field', crop_type: 'Wheat', planting_date: '2026-03-15', boundary: square, area_hectares: 104.7 }
