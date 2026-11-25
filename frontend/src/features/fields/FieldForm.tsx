import { LocateFixed, MapPin } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import type { Field, FieldInput } from '../../api/types'
import { BoundaryEditor } from '../../components/map/BoundaryEditor'
import { LocationPicker } from '../../components/map/LocationPicker'
import { Button } from '../../components/ui/Button'
import { Notice } from '../../components/ui/Notice'
import { TextField } from '../../components/ui/TextField'
import { useGeolocation } from '../../hooks/useGeolocation'
import { MAX_FIELD_ACRES, MIN_FIELD_ACRES, polygonAreaSqMeters, polygonCenter, squareAroundPoint, type LatLon } from '../../lib/geometry'
import { formatArea } from '../../lib/units'

const CROPS = ['Corn', 'Soybeans', 'Wheat', 'Cotton', 'Hay', 'Pasture', 'Vegetables', 'Fruit trees', 'Rice', 'Sorghum']
type Method = 'draw' | 'size'

type Props = {
  farmCenter: LatLon
  initial?: Field
  otherFields: Field[]
  submitLabel: string
  pending: boolean
  error: string | null
  onSubmit: (input: FieldInput) => void
}

export function FieldForm({ farmCenter, initial, otherFields, submitLabel, pending, error, onSubmit }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [crop, setCrop] = useState(initial && initial.crop_type !== 'Unknown' ? initial.crop_type : '')
  const [plantingDate, setPlantingDate] = useState(initial?.planting_date ?? '')
  const [method, setMethod] = useState<Method>('draw')
  const [drawn, setDrawn] = useState<GeoJSON.Polygon | null>(initial?.boundary ?? null)
  const [point, setPoint] = useState<LatLon | null>(initial ? polygonCenter(initial.boundary) : null)
  const [acresText, setAcresText] = useState('')
  const [errors, setErrors] = useState<{ name?: string; boundary?: string }>({})
  const geo = useGeolocation()

  const acres = Number(acresText)
  const acresValid = acresText.trim() !== '' && acres >= MIN_FIELD_ACRES && acres <= MAX_FIELD_ACRES
  const square = useMemo(() => (point && acresValid ? squareAroundPoint(point, acres) : null), [point, acres, acresValid])
  const boundary = method === 'draw' ? drawn : square

  function submit(e: FormEvent) {
    e.preventDefault()
    const next: typeof errors = {}
    if (!name.trim()) next.name = 'Please give this field a name.'
    if (!boundary)
      next.boundary =
        method === 'draw'
          ? 'Please draw the field on the map.'
          : 'Please tap the middle of the field on the map and enter its size in acres.'
    setErrors(next)
    if (next.name || !boundary) return
    onSubmit({ name: name.trim(), crop_type: crop.trim() || 'Unknown', planting_date: plantingDate || null, boundary })
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {error && <Notice tone="error">{error}</Notice>}
      <TextField label="Field name" hint='For example "Creek field" or "Back pasture".' required maxLength={160} value={name} error={errors.name} onChange={(e) => setName(e.target.value)} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Crop" optional list="crop-options" maxLength={80} hint="Pick from the list or type your own." value={crop} onChange={(e) => setCrop(e.target.value)} />
        <TextField label="Planting date" optional type="date" value={plantingDate} onChange={(e) => setPlantingDate(e.target.value)} />
      </div>
      <datalist id="crop-options">
        {CROPS.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <fieldset className="space-y-4">
        <legend className="text-base font-semibold text-stone-800">Field boundary</legend>
        <div role="radiogroup" aria-label="How do you want to add the boundary?" className="grid gap-2 sm:grid-cols-2">
          <MethodOption value="draw" current={method} onSelect={setMethod} title="Draw it on the map" body="Tap each corner of the field on a satellite map. Most accurate." />
          <MethodOption value="size" current={method} onSelect={setMethod} title="Enter its size" body="Tap the middle of the field and type how many acres. Quick and simple." />
        </div>

        {method === 'draw' ? (
          <BoundaryEditor center={drawn ? polygonCenter(drawn) : farmCenter} initial={drawn} otherFields={otherFields} onChange={setDrawn} />
        ) : (
          <div className="space-y-3">
            <TextField
              label="Field size in acres"
              inputMode="decimal"
              required
              value={acresText}
              hint="An estimate is fine."
              error={acresText.trim() && !acresValid ? `Enter a number between ${MIN_FIELD_ACRES} and ${MAX_FIELD_ACRES.toLocaleString()}.` : null}
              onChange={(e) => setAcresText(e.target.value)}
              className="max-w-xs"
            />
            <p className="text-base text-stone-800">Where is the middle of the field? Tap the map, or:</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon={<LocateFixed aria-hidden className="size-5" />} loading={geo.locating} onClick={() => geo.locate(setPoint)}>
                I&apos;m standing in the field
              </Button>
              <Button variant="secondary" icon={<MapPin aria-hidden className="size-5" />} onClick={() => setPoint(farmCenter)}>
                Use the farm location
              </Button>
            </div>
            {geo.error && <Notice tone="warning">{geo.error}</Notice>}
            <LocationPicker
              value={point}
              onChange={setPoint}
              fallbackCenter={farmCenter}
              fallbackZoom={15}
              preview={square}
              base="satellite"
              label="Field location map. Tap the middle of the field."
            />
            <p className="text-sm text-stone-600">AgriSense will use a square of this size around your point. You can draw the exact shape later.</p>
          </div>
        )}
        <p aria-live="polite" className="text-base font-semibold text-stone-900">
          {boundary ? `Boundary area: about ${formatArea(polygonAreaSqMeters(boundary) / 10_000)}` : ''}
        </p>
        {errors.boundary && !boundary && (
          <p role="alert" className="text-sm font-medium text-red-700">
            {errors.boundary}
          </p>
        )}
      </fieldset>

      <Button type="submit" fullWidth loading={pending} className="sm:w-auto">
        {submitLabel}
      </Button>
    </form>
  )
}

function MethodOption({ value, current, onSelect, title, body }: { value: Method; current: Method; onSelect: (m: Method) => void; title: string; body: string }) {
  const checked = value === current
  return (
    <label
      className={`grid min-h-16 cursor-pointer grid-cols-[auto_1fr] gap-x-3 rounded-xl border-2 p-4 ${checked ? 'border-brand-700 bg-brand-50' : 'border-stone-200 bg-white'}`}
    >
      <input type="radio" name="boundary-method" value={value} checked={checked} onChange={() => onSelect(value)} className="row-span-2 mt-1 size-5 accent-brand-700" />
      <span className="text-base font-bold text-stone-900">{title}</span>
      <span className="text-sm text-stone-600">{body}</span>
    </label>
  )
}
