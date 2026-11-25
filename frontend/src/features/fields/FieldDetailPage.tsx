import { Pencil } from 'lucide-react'
import { useParams } from 'react-router'
import { farmsApi, fieldsApi } from '../../api/endpoints'
import { FieldsMap } from '../../components/map/FieldsMap'
import { ButtonLink } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { PageHeader } from '../../components/ui/PageHeader'
import { ErrorState, LoadingState } from '../../components/ui/States'
import { useApi } from '../../hooks/useApi'
import { formatDate } from '../../lib/dates'
import { polygonCenter } from '../../lib/geometry'
import { formatArea } from '../../lib/units'
import { WeatherSection } from '../weather/WeatherSection'

/** One field: its boundary and the weather estimated at its centre. */
export function FieldDetailPage() {
  const params = useParams()
  const farmId = Number(params.farmId)
  const fieldId = Number(params.fieldId)
  const farm = useApi(`farm:${farmId}`, (signal) => farmsApi.get(farmId, { signal }))
  const fields = useApi(`fields:${farmId}`, (signal) => fieldsApi.list(farmId, { signal }))

  if ((farm.loading && !farm.data) || (fields.loading && !fields.data)) return <LoadingState label="Loading field…" />
  const loadError = farm.error ?? fields.error
  if (loadError || !farm.data) return <ErrorState message={loadError?.message ?? 'Farm not found.'} onRetry={() => (farm.reload(), fields.reload())} />
  const field = fields.data?.find((f) => f.id === fieldId)
  if (!field) return <ErrorState message="We couldn't find that field. It may have been deleted." />

  const crop = field.crop_type && field.crop_type !== 'Unknown' ? field.crop_type : 'Crop not set'
  return (
    <>
      <PageHeader
        title={field.name}
        back={{ to: `/farms/${farmId}`, label: farm.data.name }}
        description={`${crop} · about ${formatArea(field.area_hectares)}${field.planting_date ? ` · planted ${formatDate(field.planting_date)}` : ''}`}
        actions={
          <ButtonLink variant="secondary" to={`/farms/${farmId}/fields/${field.id}/edit`} icon={<Pencil aria-hidden className="size-5" />}>
            Edit field
          </ButtonLink>
        }
      />
      <div className="space-y-5">
        <Card title="Boundary">
          <FieldsMap center={polygonCenter(field.boundary)} fields={[field]} label={`Map of ${field.name}`} />
        </Card>
        <WeatherSection target={{ kind: 'field', id: field.id }} />
      </div>
    </>
  )
}
