import { describe, expect, it, vi } from 'vitest'
import { canAutoReload, isChunkLoadError, markAndReload } from './chunkErrors'

describe('chunk load errors', () => {
  it.each([
    'TypeError: Failed to fetch dynamically imported module: http://x/src/a.tsx', // Chrome
    'TypeError: error loading dynamically imported module', // Firefox
    'TypeError: Importing a module script failed.', // Safari
    'ChunkLoadError: Loading chunk 42 failed.',
  ])('recognises %s', (message) => expect(isChunkLoadError(new TypeError(message))).toBe(true))

  it('ignores ordinary errors', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
  })

  it('reloads once, then refuses within 30 s so a broken deploy cannot loop', () => {
    const reload = vi.fn()
    const t0 = 1_000_000
    expect(canAutoReload(sessionStorage, t0)).toBe(true)
    markAndReload(sessionStorage, reload, t0)
    expect(reload).toHaveBeenCalledOnce()
    expect(canAutoReload(sessionStorage, t0 + 5_000)).toBe(false)
    expect(canAutoReload(sessionStorage, t0 + 31_000)).toBe(true)
  })
})
