import { Sprout } from 'lucide-react'
import type { ReactNode } from 'react'

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-brand-50 to-stone-50 px-4 py-10">
      <div className="mb-6 flex items-center gap-2 text-2xl font-bold text-brand-800">
        <Sprout aria-hidden className="size-8" />
        AgriSense
      </div>
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold text-stone-900">{title}</h1>
        <p className="mt-1 mb-6 text-base text-stone-600">{subtitle}</p>
        {children}
      </div>
      <p className="mt-6 max-w-md text-center text-sm text-stone-600">
        Weather and field monitoring for small farms. Free to use. No sensors needed.
      </p>
    </main>
  )
}
