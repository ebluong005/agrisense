import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DailyObservation } from '../../api/types'
import { formatDate } from '../../lib/dates'
import { celsiusToFahrenheit, mmToInches } from '../../lib/units'

const round = (n: number, d: number) => Number(n.toFixed(d))
const f = (c: number | null) => (c === null ? null : round(celsiusToFahrenheit(c), 1))
const axisTick = (v: number) => String(round(v, 2))

/** Daily rainfall and temperature trends. Missing days stay empty (null), never drawn as zero. */
export default function WeatherCharts({ daily }: { daily: DailyObservation[] }) {
  // Trailing days NASA hasn't published yet would only add empty space.
  let lastWithData = daily.length - 1
  while (lastWithData >= 0 && daily[lastWithData].precipitation_mm === null && daily[lastWithData].temperature_c === null) lastWithData--
  const rows = daily.slice(0, lastWithData + 1).map((d) => ({
    date: d.date,
    rainIn: d.precipitation_mm === null ? null : round(mmToInches(d.precipitation_mm), 2),
    meanF: f(d.temperature_c),
    rangeF: d.temperature_min_c === null || d.temperature_max_c === null ? null : [f(d.temperature_min_c), f(d.temperature_max_c)],
  }))
  const xAxis = <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 12 }} minTickGap={24} />

  return (
    <div className="space-y-5">
      <figure>
        <figcaption className="mb-2 text-base font-semibold text-stone-800">Daily rainfall (inches)</figcaption>
        <div className="h-48 w-full" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#e7e5e4" />
              {xAxis}
              <YAxis tick={{ fontSize: 12 }} width={40} tickFormatter={axisTick} />
              <Tooltip labelFormatter={(d) => formatDate(String(d))} formatter={(v) => [v === null ? 'No data' : `${v} in`, 'Rainfall']} />
              <Bar dataKey="rainIn" fill="#0284c7" radius={[3, 3, 0, 0]} maxBarSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </figure>
      <figure>
        <figcaption className="mb-2 text-base font-semibold text-stone-800">Daily temperature (°F): average line, low to high band</figcaption>
        <div className="h-48 w-full" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#e7e5e4" />
              {xAxis}
              <YAxis tick={{ fontSize: 12 }} width={40} domain={['auto', 'auto']} tickFormatter={axisTick} />
              <Tooltip
                labelFormatter={(d) => formatDate(String(d))}
                formatter={(v, name) => [Array.isArray(v) ? `${v[0]} to ${v[1]} °F` : v === null ? 'No data' : `${v} °F`, name === 'rangeF' ? 'Low to high' : 'Average']}
              />
              <Area dataKey="rangeF" stroke="none" fill="#f59e0b" fillOpacity={0.2} connectNulls={false} />
              <Line dataKey="meanF" stroke="#b45309" strokeWidth={2} dot={false} connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </figure>
      <details>
        <summary className="min-h-8 cursor-pointer text-base font-semibold text-brand-800">Show daily numbers</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-base">
            <caption className="sr-only">Daily rainfall and temperature</caption>
            <thead>
              <tr className="border-b border-stone-200 text-sm text-stone-600">
                <th scope="col" className="py-2 pr-3 font-semibold">Date</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Rain</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Average</th>
                <th scope="col" className="py-2 font-semibold">Low / high</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((d) => (
                <tr key={d.date} className="border-b border-stone-100">
                  <td className="py-1.5 pr-3 whitespace-nowrap">{formatDate(d.date)}</td>
                  <td className="py-1.5 pr-3">{d.precipitation_mm === null ? 'No data' : `${round(mmToInches(d.precipitation_mm), 2)} in`}</td>
                  <td className="py-1.5 pr-3">{d.temperature_c === null ? '—' : `${f(d.temperature_c)} °F`}</td>
                  <td className="py-1.5">{d.temperature_min_c === null || d.temperature_max_c === null ? '—' : `${f(d.temperature_min_c)} / ${f(d.temperature_max_c)} °F`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
