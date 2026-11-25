import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

export function PageHeader({ title, description, back, actions }: { title: string; description?: ReactNode; back?: { to: string; label: string }; actions?: ReactNode }) {
  return (
    <header className="mb-5">
      {back && (
        <Link to={back.to} className="mb-2 inline-flex min-h-11 items-center gap-1 rounded-lg pr-2 text-base font-semibold text-brand-800 hover:underline">
          <ChevronLeft aria-hidden className="size-5" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold break-words text-stone-900 sm:text-3xl">{title}</h1>
          {description && <div className="mt-1 text-base text-stone-600">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  )
}
