import type { WeatherSummary } from '../api/types'

const day = (date: string, rain: number | null, t: number | null = 15) => ({
  date,
  precipitation_mm: rain,
  temperature_c: t,
  temperature_min_c: t === null ? null : t - 5,
  temperature_max_c: t === null ? null : t + 5,
})

/** A realistic summary: data through Nov 20, published 4 days late. Override parts per test. */
export function weatherSummary(overrides: Partial<WeatherSummary> = {}): WeatherSummary {
  return {
    target: { kind: 'farm', id: 7, name: 'Creek Farm', basis: "the farm's location" },
    location: { latitude: 32.22, longitude: -110.97 },
    requested_range: { start: '2026-10-10', end: '2026-11-23' },
    source: {
      name: 'NASA POWER',
      url: 'https://power.larc.nasa.gov/',
      dataset: 'Daily point data, Agroclimatology community',
      parameters: {},
      spatial_resolution: 'About 0.5° × 0.625° grid cells (roughly 50 km across)',
      description: 'Modelled estimates for the surrounding area from satellite observations and weather models. Not a measurement taken in your field.',
    },
    units: { precipitation: 'mm', temperature: '°C' },
    freshness: { status: 'current', latest_observation_date: '2026-11-20', days_since_latest: 4, retrieved_at: '2026-11-24T12:00:00Z', stale: false, warning: null },
    precipitation: {
      last_7_days: { start: '2026-11-14', end: '2026-11-20', expected_days: 7, valid_days: 7, total_mm: 25.4, complete: true },
      last_30_days: { start: '2026-10-22', end: '2026-11-20', expected_days: 30, valid_days: 28, total_mm: 50.8, complete: false },
    },
    temperature: { mean_c: 15, lowest_c: 0, highest_c: 30, valid_days: 30, expected_days: 30 },
    alerts: [],
    checks: [
      { code: 'LOW_RAINFALL_7D', status: 'not_triggered', threshold_mm: 2, window_days: 7, explanation: '25.4 mm of rain was estimated for Nov 14, 2026 to Nov 20, 2026 (all days had data). This rule would trigger below 2 mm.' },
      { code: 'LOW_RAINFALL_30D', status: 'not_triggered', threshold_mm: 12.7, window_days: 30, explanation: '50.8 mm ... would trigger below 12.7 mm.' },
    ],
    daily: [day('2026-11-19', 0), day('2026-11-20', 25.4), day('2026-11-21', null, null)],
    ...overrides,
  }
}
