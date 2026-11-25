import { CircleAlert, CircleCheck, Info } from 'lucide-react'
import type { ReactNode } from 'react'

type Tone = 'error' | 'info' | 'success' | 'warning'
const styles: Record<Tone, string> = {
  error: 'border-red-200 bg-red-50 text-red-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-950',
  info: 'border-sky-200 bg-sky-50 text-sky-950',
  success: 'border-brand-100 bg-brand-50 text-brand-900',
}
const icons: Record<Tone, ReactNode> = {
  error: <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />,
  warning: <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />,
  info: <Info aria-hidden className="mt-0.5 size-5 shrink-0" />,
  success: <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0" />,
}

/** Inline message. Errors are announced immediately (role="alert"); others politely. */
export function Notice({ tone = 'info', title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex gap-3 rounded-xl border p-4 text-base ${styles[tone]}`}>
      {icons[tone]}
      <div>
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-1' : ''}>{children}</div>}
      </div>
    </div>
  )
}
