import { Pencil, Sprout, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { fieldsApi } from '../../api/endpoints'
import type { Field } from '../../api/types'
import { Link } from 'react-router'
import { Button, ButtonLink } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { useAction } from '../../hooks/useApi'
import { formatDate } from '../../lib/dates'
import { formatArea } from '../../lib/units'

function cropLabel(crop: string) {
  return crop && crop !== 'Unknown' ? crop : 'Crop not set'
}

export function FieldList({ farmId, fields, onChanged }: { farmId: number; fields: Field[]; onChanged: () => void }) {
  const [deleting, setDeleting] = useState<Field | null>(null)
  const remove = useAction(async (id: number) => {
    await fieldsApi.remove(id)
    return true
  })

  async function confirmDelete() {
    if (deleting && (await remove.run(deleting.id))) {
      setDeleting(null)
      onChanged()
    }
  }

  return (
    <>
      <ul className="divide-y divide-stone-200">
        {fields.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center gap-3 py-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <Sprout aria-hidden className="size-6" />
            </span>
            {/* min-w forces the buttons onto their own line on narrow phones instead of truncating the name */}
            <div className="min-w-[11rem] flex-1">
              <Link to={`/farms/${farmId}/fields/${f.id}`} className="text-lg font-bold break-words text-brand-800 underline-offset-2 hover:underline">
                {f.name}
              </Link>
              <p className="text-sm text-stone-600">
                {cropLabel(f.crop_type)} · about {formatArea(f.area_hectares)}
                {f.planting_date && ` · planted ${formatDate(f.planting_date)}`}
              </p>
            </div>
            <div className="ml-auto flex gap-2">
              <ButtonLink variant="secondary" to={`/farms/${farmId}/fields/${f.id}/edit`} icon={<Pencil aria-hidden className="size-5" />} aria-label={`Edit ${f.name}`}>
                Edit
              </ButtonLink>
              <Button variant="ghost" icon={<Trash2 aria-hidden className="size-5" />} aria-label={`Delete ${f.name}`} onClick={() => setDeleting(f)}>
                <span className="sr-only sm:not-sr-only">Delete</span>
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? 'field'}?`}
        confirmLabel="Yes, delete field"
        pending={remove.pending}
        error={remove.error?.message}
        onCancel={() => {
          remove.clearError()
          setDeleting(null)
        }}
        onConfirm={confirmDelete}
      >
        Its boundary will be permanently removed. Your farm and other fields are not affected.
      </ConfirmDialog>
    </>
  )
}
