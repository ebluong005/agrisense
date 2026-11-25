import type { ReactNode } from 'react'

export function Card({ title, action, children, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5 ${className}`} aria-label={title}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-lg font-bold text-stone-900">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
