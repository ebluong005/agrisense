import type { Page } from '@playwright/test'
import { expect, signedInWithFarm, test } from './helpers'

/**
 * Expected values mirror e2e/fake_nasa.py: for the 45 days ending yesterday (UTC),
 * the last 3 are unpublished, the 10 before them are dry, earlier days get 6 mm when
 * day-of-year % 5 == 0. Temperatures are a constant 15 °C (8 to 22).
 */
const DAY = 86_400_000
const utcMidnight = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
const dayOfYear = (t: number) => Math.round((t - Date.UTC(new Date(t).getUTCFullYear(), 0, 1)) / DAY) + 1
const label = (t: number) => new Date(t).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })

function expected() {
  const today = utcMidnight(new Date())
  const end = today - DAY // the API requests up to yesterday
  const latest = end - 3 * DAY // newest published day
  const rain = (t: number) => ((end - t) / DAY < 13 ? 0 : dayOfYear(t) % 5 === 0 ? 6 : 0)
  let total30 = 0
  for (let i = 0; i < 30; i++) total30 += rain(latest - i * DAY)
  return { latest, total30, weekStart: latest - 6 * DAY, monthStart: latest - 29 * DAY }
}

const NASA = 'http://127.0.0.1:8101'
const nasaCount = async (page: Page) => (await (await page.request.get(`${NASA}/__count`)).json()).count as number
const mm = (v: number) => `${(v / 25.4).toFixed(2)} in (${v.toFixed(1)} mm)`

test('farm dashboard shows rainfall totals, freshness, trends and an explained alert', async ({ page }) => {
  const e = expected()
  const { farm } = await signedInWithFarm(page, { name: 'Weather Farm', latitude: 38.5, longitude: -121.7 })
  await page.goto(`/farms/${farm.id}`)

  const week = page.getByText('Rain, last 7 days').locator('..')
  await expect(week).toContainText(mm(0))
  await expect(week).toContainText(`${label(e.weekStart)} to ${label(e.latest)}`)
  await expect(week).toContainText('All 7 days have data')
  const month = page.getByText('Rain, last 30 days').locator('..')
  await expect(month).toContainText(mm(e.total30))
  await expect(month).toContainText(`${label(e.monthStart)} to ${label(e.latest)}`)
  await expect(page.getByText('Temperature, last 30 days').locator('..')).toContainText('Average 59 °F (15.0 °C)')
  await expect(page.getByText(/Latest data:/).locator('..')).toContainText(`Latest data: ${label(e.latest)} (4 days ago)`)
  await expect(page.getByText(/Source: NASA POWER/)).toContainText('Not a measurement taken in your field')

  const alert = page.getByRole('region', { name: 'Very little rain in the last 7 days' })
  await expect(alert).toContainText(`Why: about ${mm(0)} of rain was estimated from ${label(e.weekStart)} to ${label(e.latest)}`)
  await expect(alert).toContainText('not a drought classification')

  // Trend charts render real marks (rain bars exist only on rainy days).
  await expect(page.locator('.recharts-line-curve')).toHaveCount(1)
  if (e.total30 > 0) await expect(page.locator('.recharts-bar-rectangle').first()).toBeVisible()
  await page.getByText('Show daily numbers').click()
  await expect(page.getByRole('cell', { name: 'No data' }).first()).toBeVisible() // unpublished days, not 0
})

test('weather is cached: reloading the dashboard does not call NASA again', async ({ page }) => {
  const { farm } = await signedInWithFarm(page, { name: 'Cache Farm', latitude: 36.1, longitude: -115.1 })
  await page.goto(`/farms/${farm.id}`)
  await expect(page.getByText('Rain, last 7 days')).toBeVisible()
  const before = await nasaCount(page)
  await page.reload()
  await expect(page.getByText('Rain, last 7 days')).toBeVisible()
  expect(await nasaCount(page)).toBe(before)
})

test('field page shows weather for the centre of that field', async ({ page }) => {
  const { farm, auth } = await signedInWithFarm(page, { name: 'Field Farm', latitude: 40.0, longitude: -100.0 })
  // Centre (40.52, -99.52): far from the farm point, so the request must use the field.
  const boundary = { type: 'Polygon', coordinates: [[[-99.53, 40.51], [-99.51, 40.51], [-99.51, 40.53], [-99.53, 40.53], [-99.53, 40.51]]] }
  const res = await page.request.post(`/api/v1/farms/${farm.id}/fields`, { headers: auth, data: { name: 'Far field', crop_type: 'Corn', boundary } })
  expect(res.status()).toBe(201)
  await page.goto(`/farms/${farm.id}`)
  await page.getByRole('link', { name: 'Far field', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Far field' })).toBeVisible()
  await expect(page.getByText(/Source: NASA POWER/)).toContainText('Estimated for the centre of the field boundary (40.5200° N, 99.5200° W)')
  await expect(page.getByText('Rain, last 7 days')).toBeVisible()
})

test('a NASA outage shows a clear error, and "Try again" recovers', async ({ page }, testInfo) => {
  // A location no other test has cached (each project gets its own), so the backend must call NASA.
  const lat = testInfo.project.name === 'phone' ? '30.4' : '30.3'
  const { farm } = await signedInWithFarm(page, { name: 'Outage Farm', latitude: Number(lat), longitude: -97.7 })
  // Outage lasts until we end it (dev StrictMode may send the request twice, so don't count attempts).
  await page.request.get(`${NASA}/__fail?n=1000&lat=${lat}`)
  await page.goto(`/farms/${farm.id}`)
  await expect(page.getByRole('alert')).toContainText('NASA POWER is temporarily unavailable. Please try again later.', { timeout: 15_000 })
  await page.request.get(`${NASA}/__fail?n=0&lat=${lat}`)
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('Rain, last 7 days')).toBeVisible()
})
