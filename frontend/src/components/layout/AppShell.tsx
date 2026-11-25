import { CirclePlus, Sprout, Tractor, UserRound } from 'lucide-react'
import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router'
import { LoadingState } from '../ui/States'

const NAV = [
  { to: '/', label: 'My farms', icon: Tractor, end: true },
  { to: '/farms/new', label: 'Add farm', icon: CirclePlus, end: true },
  { to: '/account', label: 'Account', icon: UserRound, end: true },
]

export function AppShell() {
  return (
    <div className="min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:pb-0">
      <a href="#main" className="sr-only z-50 rounded-lg bg-white p-3 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to main content
      </a>
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <NavLink to="/" className="flex min-h-11 items-center gap-2 text-lg font-bold text-brand-800">
            <Sprout aria-hidden className="size-6" />
            AgriSense
          </NavLink>
          <nav aria-label="Main" className="hidden gap-1 sm:flex">
            {NAV.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex min-h-11 items-center rounded-lg px-3 text-base font-semibold ${isActive ? 'bg-brand-50 text-brand-800' : 'text-stone-700 hover:bg-stone-100'}`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-5xl px-4 py-5 sm:py-8">
        <Suspense fallback={<LoadingState />}>
          <Outlet />
        </Suspense>
      </main>

      {/* Phone navigation: thumb-reachable, icon + text label (never icon-only). */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
        <ul className="grid grid-cols-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex min-h-16 flex-col items-center justify-center gap-1 text-sm font-semibold ${isActive ? 'text-brand-800' : 'text-stone-600'}`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon aria-hidden className={`size-6 ${isActive ? 'stroke-[2.5]' : ''}`} />
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
