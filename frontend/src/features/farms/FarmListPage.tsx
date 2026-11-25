import { ChevronRight, MapPin, Plus, Tractor } from 'lucide-react'
import { Link } from 'react-router'
import { farmsApi } from '../../api/endpoints'
import { ButtonLink } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States'
import { useApi } from '../../hooks/useApi'
import { formatCoordinates } from '../../lib/units'

export function FarmListPage() {
  const farms = useApi('farms', (signal) => farmsApi.list({ signal }))

  if (farms.loading && !farms.data) return <LoadingState label="Loading your farms…" />
  if (farms.error) return <ErrorState message={farms.error.message} onRetry={farms.reload} />
  const list = farms.data ?? []

  return (
    <>
      <PageHeader
        title="My farms"
        description={list.length ? 'Choose a farm to see its fields and weather.' : undefined}
        actions={
          list.length > 0 && (
            <ButtonLink to="/farms/new" icon={<Plus aria-hidden className="size-5" />}>
              Add farm
            </ButtonLink>
          )
        }
      />
      {list.length === 0 ? (
        <EmptyState
          icon={<Tractor aria-hidden className="size-12" />}
          title="Let's add your first farm"
          action={
            <ButtonLink to="/farms/new" icon={<Plus aria-hidden className="size-5" />}>
              Add my farm
            </ButtonLink>
          }
        >
          Give it a name and mark where it is. Then you can map your fields and see rainfall and temperature for your area.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((farm) => (
            <li key={farm.id}>
              <Link
                to={`/farms/${farm.id}`}
                className="flex min-h-20 items-center gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm hover:border-brand-600"
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  <Tractor aria-hidden className="size-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-lg font-bold text-stone-900">{farm.name}</span>
                  <span className="mt-0.5 flex items-center gap-1 text-sm text-stone-600">
                    <MapPin aria-hidden className="size-4 shrink-0" />
                    {formatCoordinates(farm.latitude, farm.longitude)}
                  </span>
                </span>
                <ChevronRight aria-hidden className="size-6 text-stone-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
