import { describe, expect, it } from 'vitest'
import { formatDate, isoDaysAgo } from './dates'
import { formatArea, formatCoordinates, formatRainfall, formatTemperature } from './units'

describe('units', () => {
  it('shows acres first with hectares', () => {
    expect(formatArea(1)).toBe('2.47 acres (1.00 ha)')
    expect(formatArea(40.5)).toBe('100.1 acres (40.5 ha)')
  })
  it('shows inches/°F first for US farmers', () => {
    expect(formatRainfall(25.4)).toBe('1.00 in (25.4 mm)')
    expect(formatTemperature(0)).toBe('32 °F (0.0 °C)')
  })
  it('labels hemispheres', () => {
    expect(formatCoordinates(32.2226, -110.9747)).toBe('32.2226° N, 110.9747° W')
  })
})

describe('dates', () => {
  it('counts back in UTC days', () => {
    expect(isoDaysAgo(4, new Date('2026-11-24T23:30:00Z'))).toBe('2026-11-20')
    expect(isoDaysAgo(0, new Date('2026-03-01T00:10:00Z'))).toBe('2026-03-01')
  })
  it('formats without shifting the day across timezones', () => {
    expect(formatDate('2026-11-03')).toBe('Nov 3, 2026')
  })
})
