import { CloudOff, LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from './Button'

const wrap = (fullPage?: boolean) =>
  `flex flex-col items-center justify-center gap-3 px-6 text-center ${fullPage ? 'min-h-dvh' : 'py-12'}`

export function LoadingState({ label = 'Loading…', fullPage }: { label?: string; fullPage?: boolean }) {
  return (
    <div role="status" className={wrap(fullPage)}>
      <LoaderCircle aria-hidden className="size-8 animate-spin text-brand-700" />
      <p className="text-base text-stone-700">{label}</p>
    </div>
  )
}

type ErrorStateProps = {
  message: string
  onRetry?: () => void
  fullPage?: boolean
  secondaryAction?: { label: string; onClick: () => void }
}

export function ErrorState({ message, onRetry, fullPage, secondaryAction }: ErrorStateProps) {
  return (
    <div role="alert" className={wrap(fullPage)}>
      <CloudOff aria-hidden className="size-10 text-stone-500" />
      <p className="max-w-md text-base text-stone-800">{message}</p>
      <div className="flex flex-wrap justify-center gap-3">
        {onRetry && <Button onClick={onRetry}>Try again</Button>}
        {secondaryAction && (
          <Button variant="secondary" onClick={secondaryAction.onClick}>
            {secondaryAction.label}
          </Button>
        )}
      </div>
    </div>
  )
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-stone-300 bg-white px-6 py-10 text-center">
      {icon && <div className="text-brand-700">{icon}</div>}
      <h2 className="text-xl font-bold text-stone-900">{title}</h2>
      {children && <div className="max-w-md text-base text-stone-700">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
