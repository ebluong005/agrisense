import { CircleCheck, CloudRain, Info, Thermometer, TriangleAlert } from 'lucide-react'
import { lazy, Suspense, type ReactNode } from 'react'
import { weatherApi } from '../../api/endpoints'
import type { RainfallWindow, WeatherAlert, WeatherSummary } from '../../api/types'
import { Card } from '../../components/ui/Card'
import { Notice } from '../../components/ui/Notice'
import { ErrorState, LoadingState } from '../../components/ui/States'
import { useApi } from '../../hooks/useApi'
import { formatDate } from '../../lib/dates'
import { formatCoordinates, formatRainfall, formatTemperature } from '../../lib/units'

const WeatherCharts = lazy(() => import('./WeatherCharts'))

export type WeatherTarget = { kind: 'farm' | 'field'; id: number }

/** Warnings, freshness, rainfall/temperature totals and trends for one farm or field. */
export function WeatherSection({ target }: { target: WeatherTarget }) {
  const summary = useApi(`weather-summary:${target.kind}:${target.id}`, (signal) =>
    target.kind === 'farm' ? weatherApi.farmSummary(target.id, { signal }) : weatherApi.fieldSummary(target.id, { signal }),
  )

  if (summary.loading && !summary.data)
    return (
      <Card title="Weather">
        <LoadingState label="Getting weather data. The first time can take up to a minute…" />
      </Card>
    )
  if (summary.error || !summary.data)
    return (
      <Card title="Weather">
        <ErrorState message={summary.error?.message ?? 'Weather is not available right now.'} onRetry={summary.reload} />
      </Card>
    )
  const s = summary.data
  return (
    <div className="space-y-4">
      <Warnings summary={s} />
      <Card title="Weather">
        <div className="space-y-4">
          <FreshnessLine summary={s} />
          {s.precipitation && s.temperature ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <RainStat label="Rain, last 7 days" window={s.precipitation.last_7_days} />
                <RainStat label="Rain, last 30 days" window={s.precipitation.last_30_days} />
                <Stat
                  icon={<Thermometer aria-hidden className="size-6" />}
                  label="Temperature, last 30 days"
                  value={s.temperature.mean_c === null ? 'No data' : `Average ${formatTemperature(s.temperature.mean_c)}`}
                  notes={[
                    s.temperature.lowest_c !== null && s.temperature.highest_c !== null
                      ? `Low ${formatTemperature(s.temperature.lowest_c)}, high ${formatTemperature(s.temperature.highest_c)}`
                      : 'Daily lows and highs not available',
                    coverage(s.temperature.valid_days, s.temperature.expected_days),
                  ]}
                />
              </div>
              <Suspense fallback={<LoadingState label="Loading charts…" />}>
                <WeatherCharts daily={s.daily} />
              </Suspense>
            </>
          ) : (
            <p className="text-base text-stone-700">
              {s.source.name} has no rainfall data for this location in the last {s.daily.length} days. This can happen right after an outage
              at the provider. Please check again later.
            </p>
          )}
          <SourceNote summary={s} />
        </div>
      </Card>
    </div>
  )
}

function Warnings({ summary }: { summary: WeatherSummary }) {
  if (summary.alerts.length) return <>{summary.alerts.map((a) => <AlertCard key={a.code} alert={a} />)}</>
  const checked = summary.checks.filter((c) => c.status !== 'insufficient_data')
  if (!checked.length)
    return (
      <Notice tone="info" title="Not enough recent data to check rainfall">
        We need most days of the period to have data before we warn about low rainfall.
      </Notice>
    )
  return (
    <div role="status" className="flex gap-3 rounded-2xl border border-brand-100 bg-brand-50 p-4 text-brand-900">
      <CircleCheck aria-hidden className="mt-0.5 size-6 shrink-0" />
      <div>
        <p className="text-lg font-bold">No low-rainfall warnings</p>
        <p className="text-base">We only check recent rainfall. This doesn&apos;t guarantee your crops are healthy.</p>
        <RuleDetails summary={summary} />
      </div>
    </div>
  )
}

function AlertCard({ alert }: { alert: WeatherAlert }) {
  const e = alert.evidence
  return (
    <section aria-label={alert.title} className="flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
      <TriangleAlert aria-hidden className="mt-0.5 size-6 shrink-0" />
      <div className="space-y-2">
        <h3 className="text-lg font-bold">{alert.title}</h3>
        <p className="text-base">
          <strong>Why:</strong> about {formatRainfall(e.rainfall_mm)} of rain was estimated from {formatDate(e.window_start)} to {formatDate(e.window_end)}
          {e.valid_days < e.expected_days ? ` (${e.valid_days} of ${e.expected_days} days had data)` : ''}. We flag less than{' '}
          {formatRainfall(e.threshold_mm)} over {e.expected_days} days.
        </p>
        <p className="text-base">
          <strong>What you could do:</strong> {alert.suggested_action}
        </p>
        <p className="text-sm">{alert.limitations}</p>
      </div>
    </section>
  )
}

function RuleDetails({ summary }: { summary: WeatherSummary }) {
  return (
    <details className="mt-2">
      <summary className="min-h-8 cursor-pointer text-base font-semibold">How we check</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {summary.checks.map((c) => (
          <li key={c.code}>
            {c.window_days}-day rainfall below {formatRainfall(c.threshold_mm)}: {c.explanation}
          </li>
        ))}
      </ul>
    </details>
  )
}

function FreshnessLine({ summary }: { summary: WeatherSummary }) {
  const f = summary.freshness
  return (
    <div className="space-y-2">
      {f.latest_observation_date && (
        <p className="text-base text-stone-800">
          <strong>Latest data:</strong> {formatDate(f.latest_observation_date)} ({daysAgo(f.days_since_latest ?? 0)}).{' '}
          <span className="text-stone-600">{summary.source.name} publishes daily data a few days late.</span>
        </p>
      )}
      {f.status === 'delayed' && (
        <Notice tone="warning" title="Weather data is running late">
          The newest available day is {daysAgo(f.days_since_latest ?? 0)}. Totals below cover the most recent period that has data.
        </Notice>
      )}
      {f.stale && f.warning && <Notice tone="warning" title="Showing saved weather data">{f.warning}</Notice>}
    </div>
  )
}

function SourceNote({ summary }: { summary: WeatherSummary }) {
  const { source, location, target } = summary
  return (
    <p className="flex gap-2 text-sm text-stone-600">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>
        Source: {source.name} ({source.dataset}). {source.description} Estimated for {target.basis} ({formatCoordinates(location.latitude, location.longitude)}),
        on a grid of {source.spatial_resolution.replace(/^About/, 'about')}. Units: inches and °F, with {summary.units.precipitation} and {summary.units.temperature}.
      </span>
    </p>
  )
}

function RainStat({ label, window: w }: { label: string; window: RainfallWindow }) {
  return (
    <Stat
      icon={<CloudRain aria-hidden className="size-6" />}
      label={label}
      value={w.total_mm === null ? 'No data' : formatRainfall(w.total_mm)}
      notes={[`${formatDate(w.start)} to ${formatDate(w.end)}`, coverage(w.valid_days, w.expected_days)]}
    />
  )
}

function Stat({ icon, label, value, notes }: { icon: ReactNode; label: string; value: string; notes: string[] }) {
  return (
    <div className="flex gap-3 rounded-xl bg-stone-50 p-4">
      <div className="text-brand-700">{icon}</div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-stone-600">{label}</p>
        <p className="text-xl font-bold text-stone-900">{value}</p>
        {notes.map((n) => (
          <p key={n} className="text-sm text-stone-600">
            {n}
          </p>
        ))}
      </div>
    </div>
  )
}

function coverage(valid: number, expected: number) {
  if (valid === expected) return `All ${expected} days have data`
  return `Based on ${valid} of ${expected} days. Some days have no data`
}

function daysAgo(n: number) {
  return n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`
}
