import { CloudOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useRouteError } from 'react-router'
import { canAutoReload, isChunkLoadError, markAndReload } from '../../lib/chunkErrors'
import { Button } from '../ui/Button'

/** Replaces React Router's developer error screen with a plain-language one. */
export function RouteError() {
  const error = useRouteError()
  const chunk = isChunkLoadError(error)
  // Decided once per mount: reload automatically only if we haven't just done so.
  const [reloading] = useState(() => chunk && canAutoReload())

  useEffect(() => {
    if (reloading) markAndReload()
  }, [reloading])

  if (reloading) return <p className="p-8 text-center text-base text-stone-700">Updating AgriSense to the latest version…</p>
  return (
    <main role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <CloudOff aria-hidden className="size-12 text-stone-500" />
      <h1 className="text-2xl font-bold text-stone-900">Something went wrong</h1>
      <p className="max-w-md text-base text-stone-700">
        {chunk
          ? "Part of the app couldn't be loaded. This usually means AgriSense was just updated, or the connection dropped."
          : 'An unexpected error stopped this page from loading. Your saved farms and fields are not affected.'}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={() => window.location.reload()}>Reload page</Button>
        <Link to="/" reloadDocument className="inline-flex min-h-12 items-center rounded-xl px-5 text-base font-semibold text-brand-800 hover:bg-brand-50">
          Go to my farms
        </Link>
      </div>
    </main>
  )
}
