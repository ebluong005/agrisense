import { SQ_METERS_PER_ACRE } from './units'

export type LatLon = { lat: number; lon: number }

const METERS_PER_DEGREE_LAT = 111_320
export const MIN_FIELD_ACRES = 0.01
export const MAX_FIELD_ACRES = 240_000 // backend limit is 100,000 ha

export function isValidLatLon(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
}

/**
 * Approximate square field boundary centred on a point, for farmers who cannot
 * draw on a map. Accurate to well under 1% for field-sized squares away from the poles.
 */
export function squareAroundPoint(center: LatLon, acres: number): GeoJSON.Polygon {
  if (!(acres >= MIN_FIELD_ACRES && acres <= MAX_FIELD_ACRES)) {
    throw new RangeError(`Field size must be between ${MIN_FIELD_ACRES} and ${MAX_FIELD_ACRES} acres`)
  }
  const halfSide = Math.sqrt(acres * SQ_METERS_PER_ACRE) / 2
  const dLat = halfSide / METERS_PER_DEGREE_LAT
  const dLon = halfSide / (METERS_PER_DEGREE_LAT * Math.cos((center.lat * Math.PI) / 180))
  const { lat, lon } = center
  const ring: GeoJSON.Position[] = [
    [lon - dLon, lat - dLat],
    [lon + dLon, lat - dLat],
    [lon + dLon, lat + dLat],
    [lon - dLon, lat + dLat],
    [lon - dLon, lat - dLat],
  ]
  return { type: 'Polygon', coordinates: [ring.map(([x, y]) => [round6(x), round6(y)])] }
}

/** Mean of the outer ring's distinct vertices: good enough to centre a map. */
export function polygonCenter(polygon: GeoJSON.Polygon): LatLon {
  const ring = polygon.coordinates[0]
  const points = ring.length > 1 ? ring.slice(0, -1) : ring
  const sum = points.reduce((acc, [lon, lat]) => ({ lat: acc.lat + lat, lon: acc.lon + lon }), { lat: 0, lon: 0 })
  return { lat: sum.lat / points.length, lon: sum.lon / points.length }
}

/** Approximate geodesic area in m² (spherical excess; matches Leaflet.draw's formula). */
export function polygonAreaSqMeters(polygon: GeoJSON.Polygon): number {
  const ring = polygon.coordinates[0]
  const R = 6_378_137
  let area = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const [lon1, lat1] = ring[i]
    const [lon2, lat2] = ring[i + 1]
    area += toRad(lon2 - lon1) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)))
  }
  return Math.abs((area * R * R) / 2)
}

const toRad = (deg: number) => (deg * Math.PI) / 180
const round6 = (n: number) => Math.round(n * 1e6) / 1e6

/** Outer-ring vertices without the repeated closing point. */
export function verticesFromPolygon(polygon: GeoJSON.Polygon): LatLon[] {
  const ring = polygon.coordinates[0]
  const open = ring.length > 1 && ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1] ? ring.slice(0, -1) : ring
  return open.map(([lon, lat]) => ({ lat, lon }))
}

/** Closed GeoJSON polygon (longitude first) from corner points. */
export function polygonFromVertices(vertices: LatLon[]): GeoJSON.Polygon {
  if (vertices.length < 3) throw new RangeError('A field boundary needs at least 3 corners')
  const ring = vertices.map((v) => [round6(v.lon), round6(v.lat)])
  return { type: 'Polygon', coordinates: [[...ring, ring[0]]] }
}

/** True if no two non-adjacent edges cross (the server rejects self-intersecting fields). */
export function isSimplePolygon(vertices: LatLon[]): boolean {
  const n = vertices.length
  if (n < 4) return n === 3
  const edge = (i: number): [LatLon, LatLon] => [vertices[i], vertices[(i + 1) % n]]
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue // adjacent edges share a corner
      if (segmentsCross(...edge(i), ...edge(j))) return false
    }
  }
  return true
}

function segmentsCross(a: LatLon, b: LatLon, c: LatLon, d: LatLon): boolean {
  const orient = (p: LatLon, q: LatLon, r: LatLon) => Math.sign((q.lon - p.lon) * (r.lat - p.lat) - (q.lat - p.lat) * (r.lon - p.lon))
  return orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0
}

/** The four corners of the box spanned by two opposite corners (any drag direction). */
export function rectangleVertices(a: LatLon, b: LatLon): LatLon[] {
  const south = Math.min(a.lat, b.lat)
  const north = Math.max(a.lat, b.lat)
  const west = Math.min(a.lon, b.lon)
  const east = Math.max(a.lon, b.lon)
  return [
    { lat: south, lon: west },
    { lat: south, lon: east },
    { lat: north, lon: east },
    { lat: north, lon: west },
  ]
}

// Mirrors backend/app/geometry.py so problems are caught before saving.
const MIN_FIELD_SQ_METERS = 10 // 0.001 ha
const MAX_FIELD_SQ_METERS = 1_000_000_000 // 100,000 ha
const MAX_CORNERS = 500

/** Why these corners can't be saved as a field boundary yet, in plain words; null if valid. */
export function boundaryProblem(vertices: LatLon[]): string | null {
  if (vertices.length < 3) {
    const left = 3 - vertices.length
    return `Place ${left} more corner${left === 1 ? '' : 's'} (at least 3 are needed).`
  }
  if (vertices.length > MAX_CORNERS) return `A boundary can have at most ${MAX_CORNERS} corners.`
  if (!isSimplePolygon(vertices)) return "The edges cross each other. Drag the corners so they don't cross, or start over."
  const area = polygonAreaSqMeters(polygonFromVertices(vertices))
  if (area < MIN_FIELD_SQ_METERS) return 'This shape is too small. Zoom in and draw around the whole field.'
  if (area > MAX_FIELD_SQ_METERS) return 'This shape is too large for one field. Zoom in and draw around a single field.'
  return null
}
