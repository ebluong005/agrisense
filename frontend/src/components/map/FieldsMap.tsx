import L from 'leaflet'
import { useEffect } from 'react'
import type { Field } from '../../api/types'
import type { LatLon } from '../../lib/geometry'
import { formatArea } from '../../lib/units'
import { FIELD_STYLE, ringToLatLngs, useLeafletMap } from './useLeafletMap'

/** Read-only overview of a farm's fields. */
export function FieldsMap({ center, fields, label }: { center: LatLon; fields: Field[]; label: string }) {
  const { containerRef, map } = useLeafletMap({ center, zoom: 14, base: 'satellite' })

  useEffect(() => {
    if (!map) return
    const group = L.featureGroup(
      fields.map((f) =>
        L.polygon(ringToLatLngs(f.boundary), FIELD_STYLE).bindTooltip(`${f.name} · ${formatArea(f.area_hectares)}`, { sticky: true }),
      ),
    ).addTo(map)
    // animate: false — removing a map mid zoom-animation (fast navigation) crashes Leaflet.
    if (fields.length) map.fitBounds(group.getBounds(), { padding: [24, 24], maxZoom: 17, animate: false })
    else map.setView([center.lat, center.lon], 14, { animate: false })
    return () => {
      group.remove()
    }
  }, [map, fields, center.lat, center.lon])

  return <div ref={containerRef} role="img" aria-label={label} className="isolate h-72 w-full overflow-hidden rounded-xl sm:h-96" />
}
