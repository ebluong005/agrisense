import { LocateFixed } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { FarmInput } from '../../api/types'
import { LocationPicker } from '../../components/map/LocationPicker'
import { Button } from '../../components/ui/Button'
import { Notice } from '../../components/ui/Notice'
import { TextField } from '../../components/ui/TextField'
import { useGeolocation } from '../../hooks/useGeolocation'
import { isValidLatLon, type LatLon } from '../../lib/geometry'
import { formatCoordinates } from '../../lib/units'

const US_CENTER: LatLon = { lat: 39.5, lon: -98.35 }

type Props = {
  initial?: FarmInput
  submitLabel: string
  pending: boolean
  error: string | null
  onSubmit: (input: FarmInput) => void
}

export function FarmForm({ initial, submitLabel, pending, error, onSubmit }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [location, setLocation] = useState<LatLon | null>(initial ? { lat: initial.latitude, lon: initial.longitude } : null)
  const [latText, setLatText] = useState(initial ? String(initial.latitude) : '')
  const [lonText, setLonText] = useState(initial ? String(initial.longitude) : '')
  const [errors, setErrors] = useState<{ name?: string; location?: string }>({})
  const geo = useGeolocation()

  function pick(p: LatLon) {
    setLocation(p)
    setLatText(String(p.lat))
    setLonText(String(p.lon))
    setErrors((e) => ({ ...e, location: undefined }))
  }

  function typed(lat: string, lon: string) {
    setLatText(lat)
    setLonText(lon)
    const [la, lo] = [Number(lat), Number(lon)]
    if (lat.trim() && lon.trim() && isValidLatLon(la, lo)) setLocation({ lat: la, lon: lo })
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const next: typeof errors = {}
    if (!name.trim()) next.name = 'Please give your farm a name.'
    if (!location) next.location = 'Please mark where your farm is: use your location, tap the map, or type coordinates.'
    setErrors(next)
    if (next.name || !location) return
    onSubmit({ name: name.trim(), latitude: location.lat, longitude: location.lon })
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {error && <Notice tone="error">{error}</Notice>}
      <TextField
        label="Farm name"
        hint='For example "Home farm" or "North 40".'
        required
        maxLength={160}
        value={name}
        error={errors.name}
        onChange={(e) => setName(e.target.value)}
      />

      <fieldset className="space-y-3">
        <legend className="text-base font-semibold text-stone-800">Where is your farm?</legend>
        <p className="text-sm text-stone-600">We use this point to get rainfall and temperature for your area.</p>
        <Button variant="secondary" icon={<LocateFixed aria-hidden className="size-5" />} loading={geo.locating} onClick={() => geo.locate(pick)}>
          {geo.locating ? 'Finding your location…' : 'Use my current location'}
        </Button>
        {geo.error && <Notice tone="warning">{geo.error}</Notice>}
        <p className="text-sm text-stone-600">Or tap the map where your farm is. You can drag the pin to adjust.</p>
        <LocationPicker value={location} onChange={pick} fallbackCenter={US_CENTER} label="Farm location map. Tap to place the farm pin." />
        <p aria-live="polite" className="text-base text-stone-800">
          {location ? `Selected: ${formatCoordinates(location.lat, location.lon)}` : 'No location selected yet.'}
        </p>
        {errors.location && (
          <p role="alert" className="text-sm font-medium text-red-700">
            {errors.location}
          </p>
        )}
        <details className="rounded-xl border border-stone-200 bg-white p-4">
          <summary className="min-h-8 cursor-pointer text-base font-semibold text-stone-800">Type coordinates instead</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <TextField label="Latitude" hint="Between -90 and 90" inputMode="decimal" value={latText} onChange={(e) => typed(e.target.value, lonText)} />
            <TextField label="Longitude" hint="Between -180 and 180 (negative in the US)" inputMode="decimal" value={lonText} onChange={(e) => typed(latText, e.target.value)} />
          </div>
        </details>
      </fieldset>

      <Button type="submit" fullWidth loading={pending} className="sm:w-auto">
        {submitLabel}
      </Button>
    </form>
  )
}
