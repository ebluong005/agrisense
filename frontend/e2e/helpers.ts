import { test as base, expect, type Locator, type Page } from '@playwright/test'

export type Farm = { id: number; latitude: number; longitude: number; name: string }

/** Fails the test on any uncaught page error or console error (map tiles excluded: they need internet). */
export const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
      page.on('console', (m) => {
        if (m.type() === 'error' && !/tile|net::ERR|Failed to load resource/i.test(m.text())) errors.push(`console: ${m.text()}`)
      })
      await use(errors)
      expect(errors, 'JavaScript errors during the test').toEqual([])
    },
    { auto: true },
  ],
})
export { expect }

let counter = 0
/** New user + farm via the API; the page starts signed in. */
export async function signedInWithFarm(page: Page, farm = { name: 'Test Farm', latitude: 41.5868, longitude: -93.625 }) {
  const email = `e2e-${Date.now()}-${counter++}@example.com`
  const reg = await page.request.post('/api/v1/auth/register', { data: { email, password: 'e2e-password-123' } })
  expect(reg.status()).toBe(201)
  const token = (await reg.json()).access_token as string
  const created = await page.request.post('/api/v1/farms', { data: farm, headers: { Authorization: `Bearer ${token}` } })
  expect(created.status()).toBe(201)
  await page.addInitScript((t) => localStorage.setItem('agrisense_token', t), token)
  return { token, farm: (await created.json()) as Farm, auth: { Authorization: `Bearer ${token}` } }
}

export const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1000) < 500

/** Click (desktop) or tap (phone) at fractions of an element's box. */
export async function tapAt(page: Page, target: Locator, fx: number, fy: number) {
  await target.scrollIntoViewIfNeeded()
  const b = (await target.boundingBox())!
  const [x, y] = [b.x + b.width * fx, b.y + b.height * fy]
  if (isPhone(page)) await page.touchscreen.tap(x, y)
  else await page.mouse.click(x, y)
}

/** Press-drag-release across an element: real touch events on phone, mouse on desktop. */
export async function dragAcross(page: Page, target: Locator, from: [number, number], to: [number, number]) {
  await target.scrollIntoViewIfNeeded()
  const b = (await target.boundingBox())!
  const p = (f: [number, number]) => ({ x: b.x + b.width * f[0], y: b.y + b.height * f[1] })
  const [a, z] = [p(from), p(to)]
  const steps = 12
  if (isPhone(page)) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] })
    for (let i = 1; i <= steps; i++)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + ((z.x - a.x) * i) / steps, y: a.y + ((z.y - a.y) * i) / steps }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } else {
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    await page.mouse.move(z.x, z.y, { steps })
    await page.mouse.up()
  }
}

/** Leaflet's pane offset: changes when the map is panned. */
export const mapPan = (map: Locator) => map.locator('.leaflet-map-pane').evaluate((el) => (el as HTMLElement).style.transform)
