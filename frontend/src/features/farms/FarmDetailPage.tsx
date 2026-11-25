import { MapPin, Pencil, Plus, Sprout } from 'lucide-react'
import { useParams } from 'react-router'
import { farmsApi, fieldsApi } from '../../api/endpoints'
import { FieldsMap } from '../../components/map/FieldsMap'
import { ButtonLink } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { PageHeader } from '../../components/ui/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States'
import { useApi } from '../../hooks/useApi'
import { formatArea, formatCoordinates } from '../../lib/units'
import { WeatherSection } from '../weather/WeatherSection'
import { FieldList } from './FieldList'

export function FarmDetailPage() {
  const farmId = Number(useParams().farmId)
  const farm = useApi(`farm:${farmId}`, (signal) => farmsApi.get(farmId, { signal }))
  const fields = useApi(`fields:${farmId}`, (signal) => fieldsApi.list(farmId, { signal }))

  if (farm.loading && !farm.data) return <LoadingState label="Loading farm…" />
  if (farm.error || !farm.data) return <ErrorState message={farm.error?.message ?? 'Farm not found.'} onRetry={farm.reload} />

  const f = farm.data
  const list = fields.data ?? []
  const totalHa = list.reduce((sum, x) => sum + x.area_hectares, 0)
  const addField = (
    <ButtonLink to={`/farms/${farmId}/fields/new`} icon={<Plus aria-hidden className="size-5" />}>
      Add a field
    </ButtonLink>
  )

  return (
    <>
      <PageHeader
        title={f.name}
        back={{ to: '/', label: 'My farms' }}
        description={
          <span className="inline-flex items-center gap-1">
            <MapPin aria-hidden className="size-4" />
            {formatCoordinates(f.latitude, f.longitude)}
          </span>
        }
        actions={
          <ButtonLink variant="secondary" to={`/farms/${farmId}/edit`} icon={<Pencil aria-hidden className="size-5" />}>
            Edit farm
          </ButtonLink>
        }
      />
      <div className="space-y-5">
        <WeatherSection target={{ kind: 'farm', id: farmId }} />
        <Card title="Fields" action={list.length > 0 && addField}>
          {fields.loading && !fields.data ? (
            <LoadingState label="Loading fields…" />
          ) : fields.error ? (
            <ErrorState message={fields.error.message} onRetry={fields.reload} />
          ) : list.length === 0 ? (
            <EmptyState icon={<Sprout aria-hidden className="size-10" />} title="No fields yet" action={addField}>
              Add a field by drawing its edges on a map, or just enter its size.
            </EmptyState>
          ) : (
            <div className="space-y-4">
              <p className="text-base text-stone-700">
                {list.length} {list.length === 1 ? 'field' : 'fields'}, about {formatArea(totalHa)} in total. Areas are estimates.
              </p>
              <FieldsMap center={{ lat: f.latitude, lon: f.longitude }} fields={list} label={`Map of ${list.length} fields on ${f.name}`} />
              <FieldList farmId={farmId} fields={list} onChanged={fields.reload} />
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
