import L from 'leaflet'
import { useEffect, useEffectEvent } from 'react'
import type { LatLon } from '../../lib/geometry'
import { FIELD_STYLE, handleIcon, ringToLatLngs, toLatLng, useLeafletMap } from './useLeafletMap'

type Props = {
  value: LatLon | null
  onChange: (value: LatLon) => void
  fallbackCenter: LatLon
  fallbackZoom?: number
  preview?: GeoJSON.Polygon | null
  label: string
  base?: 'map' | 'satellite'
}

/** Tap the map (or drag the pin) to choose a point. Buttons elsewhere offer keyboard alternatives. */
export function LocationPicker({ value, onChange, fallbackCenter, fallbackZoom = 4, preview, label, base = 'map' }: Props) {
  const { containerRef, map } = useLeafletMap({
    center: value ?? fallbackCenter,
    zoom: value ? 15 : fallbackZoom,
    base,
  })
  const choose = useEffectEvent((latlng: L.LatLng) => onChange({ lat: round(latlng.lat), lon: round(latlng.lng) }))

  useEffect(() => {
    if (!map) return
    const onClick = (e: L.LeafletMouseEvent) => choose(e.latlng)
    map.on('click', onClick)
    return () => {
      map.off('click', onClick)
    }
  }, [map])

  useEffect(() => {
    if (!map || !value) return
    const marker = L.marker(toLatLng(value), { icon: handleIcon('pin'), draggable: true, keyboard: false }).addTo(map)
    marker.on('dragend', () => choose(marker.getLatLng()))
    // From a country-level view, zoom in so the farmer can fine-tune the pin; otherwise only re-centre if off-screen.
    if (map.getZoom() < MIN_DETAIL_ZOOM) map.setView(toLatLng(value), DETAIL_ZOOM, { animate: false })
    else if (!map.getBounds().pad(-0.2).contains(toLatLng(value))) map.panTo(toLatLng(value))
    return () => {
      marker.remove()
    }
  }, [map, value])

  useEffect(() => {
    if (!map || !preview) return
    const shape = L.polygon(ringToLatLngs(preview), { ...FIELD_STYLE, interactive: false }).addTo(map)
    return () => {
      shape.remove()
    }
  }, [map, preview])

  return <div ref={containerRef} role="application" aria-label={label} className="isolate h-72 w-full cursor-crosshair overflow-hidden rounded-xl sm:h-96" />
}

const round = (n: number) => Math.round(n * 1e6) / 1e6
const MIN_DETAIL_ZOOM = 12
const DETAIL_ZOOM = 15
