import { describe, expect, it } from 'vitest'
import { boundaryProblem, isSimplePolygon, polygonAreaSqMeters, polygonCenter, polygonFromVertices, rectangleVertices, squareAroundPoint, verticesFromPolygon } from './geometry'
import { SQ_METERS_PER_ACRE } from './units'

describe('squareAroundPoint (no-drawing fallback)', () => {
  it.each([0.5, 10, 160, 5000])('produces a closed square of about %s acres', (acres) => {
    const poly = squareAroundPoint({ lat: 41.6, lon: -93.6 }, acres)
    const ring = poly.coordinates[0]
    expect(ring).toHaveLength(5)
    expect(ring[0]).toEqual(ring[4])
    const measured = polygonAreaSqMeters(poly) / SQ_METERS_PER_ACRE
    expect(Math.abs(measured - acres) / acres).toBeLessThan(0.01)
  })

  it('is centred on the point, longitude first', () => {
    const c = polygonCenter(squareAroundPoint({ lat: 32.2, lon: -110.9 }, 40))
    expect(c.lat).toBeCloseTo(32.2, 5)
    expect(c.lon).toBeCloseTo(-110.9, 5)
  })

  it('rejects sizes the API would refuse', () => {
    expect(() => squareAroundPoint({ lat: 0, lon: 0 }, 0)).toThrow(RangeError)
    expect(() => squareAroundPoint({ lat: 0, lon: 0 }, Number.NaN)).toThrow(RangeError)
  })
})

describe('drawn polygons', () => {
  const sq = [
    { lat: 0, lon: 0 },
    { lat: 0, lon: 1 },
    { lat: 1, lon: 1 },
    { lat: 1, lon: 0 },
  ]
  it('round-trips vertices and closes the ring', () => {
    const poly = polygonFromVertices(sq)
    expect(poly.coordinates[0][0]).toEqual(poly.coordinates[0][4])
    expect(verticesFromPolygon(poly)).toEqual(sq)
  })
  it('needs at least 3 corners', () => {
    expect(() => polygonFromVertices(sq.slice(0, 2))).toThrow(RangeError)
  })
  it('detects self-intersecting ("bow-tie") shapes the server rejects', () => {
    expect(isSimplePolygon(sq)).toBe(true)
    expect(isSimplePolygon([sq[0], sq[2], sq[1], sq[3]])).toBe(false)
  })
})

describe('rectangle tool', () => {
  it('builds the same box whichever direction it is dragged', () => {
    const a = { lat: 41.6, lon: -93.7 }
    const b = { lat: 41.5, lon: -93.6 }
    expect(rectangleVertices(a, b)).toEqual(rectangleVertices(b, a))
    expect(rectangleVertices(a, b)).toEqual([
      { lat: 41.5, lon: -93.7 },
      { lat: 41.5, lon: -93.6 },
      { lat: 41.6, lon: -93.6 },
      { lat: 41.6, lon: -93.7 },
    ])
  })
  it('produces valid GeoJSON with longitude first and a closed ring', () => {
    const poly = polygonFromVertices(rectangleVertices({ lat: 41.5, lon: -93.7 }, { lat: 41.51, lon: -93.69 }))
    expect(poly.type).toBe('Polygon')
    expect(poly.coordinates[0][0]).toEqual([-93.7, 41.5]) // [lon, lat]
    expect(poly.coordinates[0].at(-1)).toEqual(poly.coordinates[0][0])
  })
})

describe('boundaryProblem', () => {
  const box = rectangleVertices({ lat: 41.5, lon: -93.7 }, { lat: 41.51, lon: -93.69 })
  it('accepts a normal field', () => expect(boundaryProblem(box)).toBeNull())
  it('counts how many corners are still needed', () => {
    expect(boundaryProblem([])).toBe('Place 3 more corners (at least 3 are needed).')
    expect(boundaryProblem(box.slice(0, 2))).toBe('Place 1 more corner (at least 3 are needed).')
  })
  it('explains crossing edges', () => expect(boundaryProblem([box[0], box[2], box[1], box[3]])).toMatch(/edges cross/))
  it('rejects shapes the server would reject for size', () => {
    expect(boundaryProblem(rectangleVertices({ lat: 41.5, lon: -93.7 }, { lat: 41.50001, lon: -93.69999 }))).toMatch(/too small/)
    expect(boundaryProblem(rectangleVertices({ lat: 30, lon: -100 }, { lat: 40, lon: -90 }))).toMatch(/too large/)
  })
})
