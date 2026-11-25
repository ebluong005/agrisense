import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useCallback, useRef, useState } from 'react'
import type { LatLon } from '../../lib/geometry'

export type BaseLayer = 'map' | 'satellite'

function baseLayers() {
  return {
    map: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }),
    // Aerial imagery helps farmers recognise their own fields. Review Esri's terms before public launch.
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
    }),
  }
}

/**
 * Creates a Leaflet map on the returned callback ref and removes it on unmount.
 * `initial` is only read once: later view changes are done by the caller via the map.
 */
export function useLeafletMap(initial: { center: LatLon; zoom: number; base?: BaseLayer }) {
  const initialRef = useRef(initial)
  const [map, setMap] = useState<L.Map | null>(null)

  const containerRef = useCallback((element: HTMLDivElement | null) => {
    if (!element) return
    const { center, zoom, base = 'map' } = initialRef.current
    const instance = L.map(element, {
      center: [center.lat, center.lon],
      zoom,
      zoomControl: true,
      // Maps sit inside scrolling pages: the mouse wheel must scroll the page, not zoom the map.
      // Zoom stays available via the +/- buttons, pinch and double-tap.
      scrollWheelZoom: false,
    })
    const layers = baseLayers()
    layers[base].addTo(instance)
    L.control.layers({ Map: layers.map, Satellite: layers.satellite }, undefined, { position: 'topright' }).addTo(instance)
    // Keep Leaflet's cached size in sync with the container (phone toolbars, layout shifts),
    // otherwise tiles misalign and taps land on the wrong coordinates.
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => instance.invalidateSize({ pan: false }))
    resizeObserver?.observe(element)
    setMap(instance)
    return () => {
      resizeObserver?.disconnect()
      instance.stop() // cancel pan animations; programmatic zooms below are not animated
      instance.remove()
      setMap(null)
    }
  }, [])

  return { containerRef, map }
}

export const toLatLng = (p: LatLon): L.LatLngTuple => [p.lat, p.lon]
export const ringToLatLngs = (polygon: GeoJSON.Polygon): L.LatLngTuple[] =>
  polygon.coordinates[0].map(([lon, lat]) => [lat, lon])

/** Small round handle, with a larger invisible touch area around it. */
export const handleIcon = (variant: 'vertex' | 'first' | 'pin') =>
  L.divIcon({
    className: '',
    iconSize: variant === 'pin' ? [40, 40] : [36, 36],
    iconAnchor: variant === 'pin' ? [20, 20] : [18, 18],
    html:
      variant === 'pin'
        ? '<span class="block size-10 rounded-full border-4 border-white bg-amber-500 shadow-lg ring-2 ring-stone-900/30"></span>'
        : variant === 'first'
          ? // The first corner is larger and amber: clicking it closes the shape.
            '<span class="m-[6px] block size-6 rounded-full border-4 border-amber-500 bg-white shadow"></span>'
          : '<span class="m-[9px] block size-[18px] rounded-full border-[3px] border-brand-700 bg-white shadow"></span>',
  })

export const FIELD_STYLE: L.PathOptions = { color: '#facc15', weight: 3, fillColor: '#facc15', fillOpacity: 0.2 }
export const OTHER_FIELD_STYLE: L.PathOptions = { color: '#ffffff', weight: 2, dashArray: '6 6', fillOpacity: 0.08 }
