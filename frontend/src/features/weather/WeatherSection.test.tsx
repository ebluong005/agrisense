import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { mockApi } from '../../test/fetchMock'
import { weatherSummary } from '../../test/weatherFixture'
import { WeatherSection } from './WeatherSection'

const charts = vi.hoisted(() => ({ fail: false }))
vi.mock('./WeatherCharts', () => ({
  default: () => {
    if (charts.fail) throw new TypeError('Failed to fetch dynamically imported module: /assets/WeatherCharts.js')
    return <p>charts</p>
  },
}))

const lowRain = {
  code: 'LOW_RAINFALL_7D',
  severity: 'watch' as const,
  title: 'Very little rain in the last 7 days',
  explanation: '1.4 mm …',
  evidence: { rainfall_mm: 1.4, threshold_mm: 2, window_start: '2026-11-14', window_end: '2026-11-20', valid_days: 6, expected_days: 7 },
  limitations: 'This is based on area-wide rainfall estimates. It does not measure soil moisture, does not account for irrigation, and is not a drought classification.',
  suggested_action: "If the crop isn't irrigated, consider checking soil moisture and plant condition in the field.",
  source: 'NASA POWER',
}

describe('WeatherSection', () => {
  it('shows 7- and 30-day totals with their dates, coverage, freshness and source', async () => {
    mockApi({ 'GET /farms/7/weather/summary': () => ({ json: weatherSummary() }) })
    render(<WeatherSection target={{ kind: 'farm', id: 7 }} />)
    const week = (await screen.findByText('Rain, last 7 days')).parentElement!
    expect(week).toHaveTextContent('1.00 in (25.4 mm)')
    expect(week).toHaveTextContent('Nov 14, 2026 to Nov 20, 2026')
    expect(week).toHaveTextContent('All 7 days have data')
    const month = screen.getByText('Rain, last 30 days').parentElement!
    expect(month).toHaveTextContent('2.00 in (50.8 mm)')
    expect(month).toHaveTextContent('Based on 28 of 30 days. Some days have no data')
    expect(screen.getByText('Temperature, last 30 days').parentElement).toHaveTextContent('Low 32 °F (0.0 °C), high 86 °F (30.0 °C)')
    expect(screen.getByText(/Latest data:/).parentElement).toHaveTextContent('Latest data: Nov 20, 2026 (4 days ago)')
    expect(screen.getByText(/Not a measurement taken in your field/)).toHaveTextContent("Estimated for the farm's location (32.2200° N, 110.9700° W)")
    expect(screen.getByText('No low-rainfall warnings').closest('[role=status]')).toHaveTextContent("doesn't guarantee your crops are healthy")
  })

  it('explains each alert: the measurement, the threshold, and what it does not mean', async () => {
    mockApi({ 'GET /fields/3/weather/summary': () => ({ json: weatherSummary({ alerts: [lowRain] }) }) })
    render(<WeatherSection target={{ kind: 'field', id: 3 }} />)
    const card = await screen.findByRole('region', { name: 'Very little rain in the last 7 days' })
    expect(card).toHaveTextContent('Why: about 0.06 in (1.4 mm) of rain was estimated from Nov 14, 2026 to Nov 20, 2026 (6 of 7 days had data)')
    expect(card).toHaveTextContent('We flag less than 0.08 in (2.0 mm) over 7 days')
    expect(card).toHaveTextContent('does not measure soil moisture')
    expect(card).toHaveTextContent('not a drought classification')
    expect(within(card).getByText(/What you could do/)).toBeInTheDocument()
  })

  it('warns when data is delayed or served from the saved copy', async () => {
    mockApi({
      'GET /farms/7/weather/summary': () => ({
        json: weatherSummary({
          freshness: { status: 'delayed', latest_observation_date: '2026-11-10', days_since_latest: 14, retrieved_at: null, stale: true, warning: 'NASA POWER could not be reached, so saved data is shown.' },
        }),
      }),
    })
    render(<WeatherSection target={{ kind: 'farm', id: 7 }} />)
    expect(await screen.findByText('Weather data is running late')).toBeInTheDocument()
    expect(screen.getByText('Showing saved weather data').parentElement).toHaveTextContent('could not be reached')
  })

  it('says when there is not enough data instead of showing zeros', async () => {
    mockApi({
      'GET /farms/7/weather/summary': () => ({
        json: weatherSummary({
          precipitation: null,
          temperature: null,
          freshness: { status: 'no_data', latest_observation_date: null, days_since_latest: null, retrieved_at: null, stale: false, warning: null },
          checks: weatherSummary().checks.map((c) => ({ ...c, status: 'insufficient_data' as const })),
        }),
      }),
    })
    render(<WeatherSection target={{ kind: 'farm', id: 7 }} />)
    expect(await screen.findByText('Not enough recent data to check rainfall')).toBeInTheDocument()
    expect(screen.getByText(/has no rainfall data for this location/)).toBeInTheDocument()
    expect(screen.queryByText(/0\.00 in/)).not.toBeInTheDocument()
  })

  it('shows provider outages with a retry', async () => {
    let down = true
    mockApi({ 'GET /farms/7/weather/summary': () => (down ? { status: 504, json: { detail: 'NASA POWER took too long to respond. Please try again later.' } } : { json: weatherSummary() }) })
    render(<WeatherSection target={{ kind: 'farm', id: 7 }} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('NASA POWER took too long to respond')
    down = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Rain, last 7 days')).toBeInTheDocument()
  })

  it('keeps totals and warnings usable when the chart code fails to load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    charts.fail = true
    try {
      mockApi({ 'GET /farms/7/weather/summary': () => ({ json: weatherSummary() }) })
      render(<WeatherSection target={{ kind: 'farm', id: 7 }} />)
      expect(await screen.findByText("The charts couldn't be loaded. The numbers above are still correct.")).toBeInTheDocument()
      expect(screen.getByText('Rain, last 7 days')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument()
    } finally {
      charts.fail = false
    }
  })
})
