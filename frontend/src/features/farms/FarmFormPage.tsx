import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { farmsApi } from '../../api/endpoints'
import type { FarmInput } from '../../api/types'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { PageHeader } from '../../components/ui/PageHeader'
import { ErrorState, LoadingState } from '../../components/ui/States'
import { useAction, useApi } from '../../hooks/useApi'
import { FarmForm } from './FarmForm'

export function NewFarmPage() {
  const navigate = useNavigate()
  const save = useAction(farmsApi.create)
  async function submit(input: FarmInput) {
    const farm = await save.run(input)
    if (farm) navigate(`/farms/${farm.id}`, { replace: true })
  }
  return (
    <>
      <PageHeader title="Add a farm" back={{ to: '/', label: 'My farms' }} />
      <FarmForm submitLabel="Save farm" pending={save.pending} error={save.error?.message ?? null} onSubmit={submit} />
    </>
  )
}

export function EditFarmPage() {
  const farmId = Number(useParams().farmId)
  const navigate = useNavigate()
  const farm = useApi(`farm:${farmId}`, (signal) => farmsApi.get(farmId, { signal }))
  const save = useAction((input: FarmInput) => farmsApi.update(farmId, input))
  const remove = useAction(async () => {
    await farmsApi.remove(farmId)
    return true // distinguishes success from useAction's undefined-on-error
  })
  const [confirming, setConfirming] = useState(false)

  if (farm.loading) return <LoadingState label="Loading farm…" />
  if (farm.error || !farm.data) return <ErrorState message={farm.error?.message ?? 'Farm not found.'} onRetry={farm.reload} />

  async function submit(input: FarmInput) {
    if (await save.run(input)) navigate(`/farms/${farmId}`, { replace: true })
  }
  async function confirmDelete() {
    if (await remove.run()) navigate('/', { replace: true })
  }

  return (
    <>
      <PageHeader title={`Edit ${farm.data.name}`} back={{ to: `/farms/${farmId}`, label: 'Back to farm' }} />
      <FarmForm initial={farm.data} submitLabel="Save changes" pending={save.pending} error={save.error?.message ?? null} onSubmit={submit} />
      <Card title="Delete this farm" className="mt-10 border-red-200">
        <p className="mb-4 text-base text-stone-700">This removes the farm and all of its fields. It can&apos;t be undone.</p>
        <Button variant="danger" icon={<Trash2 aria-hidden className="size-5" />} onClick={() => setConfirming(true)}>
          Delete farm
        </Button>
      </Card>
      <ConfirmDialog
        open={confirming}
        title={`Delete ${farm.data.name}?`}
        confirmLabel="Yes, delete farm"
        pending={remove.pending}
        error={remove.error?.message}
        onCancel={() => setConfirming(false)}
        onConfirm={confirmDelete}
      >
        The farm and every field on it will be permanently removed.
      </ConfirmDialog>
    </>
  )
}
