import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router'
import { farmsApi, fieldsApi } from '../../api/endpoints'
import type { FieldInput } from '../../api/types'
import { PageHeader } from '../../components/ui/PageHeader'
import { ErrorState, LoadingState } from '../../components/ui/States'
import { useAction, useApi } from '../../hooks/useApi'
import { FieldForm } from './FieldForm'

/** Create (/farms/:farmId/fields/new) or edit (/farms/:farmId/fields/:fieldId/edit) a field. */
export function FieldFormPage() {
  const params = useParams()
  const farmId = Number(params.farmId)
  const fieldId = params.fieldId ? Number(params.fieldId) : null
  const navigate = useNavigate()
  const farm = useApi(`farm:${farmId}`, (signal) => farmsApi.get(farmId, { signal }))
  const fields = useApi(`fields:${farmId}`, (signal) => fieldsApi.list(farmId, { signal }))
  const save = useAction((input: FieldInput) => (fieldId === null ? fieldsApi.create(farmId, input) : fieldsApi.update(fieldId, input)))

  const editing = fieldId === null ? undefined : fields.data?.find((f) => f.id === fieldId)
  const others = useMemo(() => (fields.data ?? []).filter((f) => f.id !== fieldId), [fields.data, fieldId])

  if (farm.loading || fields.loading) return <LoadingState label="Loading…" />
  const loadError = farm.error ?? fields.error
  if (loadError || !farm.data) return <ErrorState message={loadError?.message ?? 'Farm not found.'} onRetry={() => (farm.reload(), fields.reload())} />
  if (fieldId !== null && !editing) return <ErrorState message="We couldn't find that field. It may have been deleted." />

  async function submit(input: FieldInput) {
    if (await save.run(input)) navigate(`/farms/${farmId}`, { replace: true })
  }

  return (
    <>
      <PageHeader title={editing ? `Edit ${editing.name}` : 'Add a field'} description={farm.data.name} back={{ to: `/farms/${farmId}`, label: 'Back to farm' }} />
      <FieldForm
        key={editing?.id ?? 'new'}
        farmCenter={{ lat: farm.data.latitude, lon: farm.data.longitude }}
        initial={editing}
        otherFields={others}
        submitLabel={editing ? 'Save changes' : 'Save field'}
        pending={save.pending}
        error={save.error?.message ?? null}
        onSubmit={submit}
      />
    </>
  )
}
