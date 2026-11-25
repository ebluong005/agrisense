import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Button } from './Button'

type Props = {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  pending?: boolean
  error?: string | null
}

/** Native <dialog>: the browser handles focus trapping, Escape and screen readers. */
export function ConfirmDialog({ open, title, children, confirmLabel, onConfirm, onCancel, pending, error }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        if (!pending) onCancel()
      }}
      aria-labelledby={titleId}
      className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-2xl p-0 backdrop:bg-stone-900/50"
    >
      <div className="p-6">
        <h2 id={titleId} className="text-xl font-bold text-stone-900">
          {title}
        </h2>
        <div className="mt-2 text-base text-stone-700">{children}</div>
        {error && (
          <p role="alert" className="mt-3 text-base font-medium text-red-700">
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={pending}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  )
}
