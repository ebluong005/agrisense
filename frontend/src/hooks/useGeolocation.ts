import { useState } from 'react'
import type { LatLon } from '../lib/geometry'

const MESSAGES: Record<number, string> = {
  1: 'Location permission was denied. You can tap the map instead.',
  2: "Your location isn't available right now. You can tap the map instead.",
  3: 'Finding your location took too long. You can tap the map instead.',
}

/** Ask the device for its position (needs HTTPS or localhost). */
export function useGeolocation() {
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator

  function locate(onFound: (p: LatLon) => void) {
    if (!supported) {
      setError("This device can't share its location. You can tap the map instead.")
      return
    }
    setLocating(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        onFound({ lat: Math.round(pos.coords.latitude * 1e6) / 1e6, lon: Math.round(pos.coords.longitude * 1e6) / 1e6 })
      },
      (err) => {
        setLocating(false)
        setError(MESSAGES[err.code] ?? MESSAGES[2])
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    )
  }
  return { locate, locating, error, supported }
}
