import { useId, type InputHTMLAttributes, type ReactNode } from 'react'

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  /** Adds "(optional)" to the label. Explicit, because not every non-required input is optional. */
  optional?: boolean
  hint?: ReactNode
  error?: string | null
}

export function TextField({ label, optional, hint, error, className = '', ...input }: Props) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-base font-semibold text-stone-800">
        {label}
        {optional && <span className="font-normal text-stone-500"> (optional)</span>}
      </label>
      {hint && (
        <p id={hintId} className="mb-1.5 text-sm text-stone-600">
          {hint}
        </p>
      )}
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        className={`block min-h-12 w-full rounded-xl border bg-white px-4 text-base text-stone-900 placeholder:text-stone-400 ${
          error ? 'border-red-600' : 'border-stone-300'
        }`}
        {...input}
      />
      {error && (
        <p id={errorId} className="mt-1.5 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
