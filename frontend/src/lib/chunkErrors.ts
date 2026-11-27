/**
 * After a new deploy, a page that was already open asks for code chunks that no longer
 * exist (or a dev server's dependency cache went stale). Browsers report this differently.
 */
const CHUNK_ERROR = /dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk [\w-]+ failed/i

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error)
  return CHUNK_ERROR.test(message)
}

const KEY = 'agrisense:chunk-reload-at'
const WINDOW_MS = 30_000

/** True unless we already reloaded for this reason in the last 30 s (prevents reload loops). */
export function canAutoReload(storage: Storage = sessionStorage, now = Date.now()): boolean {
  return now - Number(storage.getItem(KEY) ?? 0) >= WINDOW_MS
}

export function markAndReload(storage: Storage = sessionStorage, reload: () => void = () => window.location.reload(), now = Date.now()): void {
  storage.setItem(KEY, String(now))
  reload()
}
