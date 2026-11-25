import { dragAcross, expect, isPhone, mapPan, signedInWithFarm, tapAt, test } from './helpers'

const boundaryMap = (page: import('@playwright/test').Page) => page.getByRole('application', { name: 'Field boundary map' })

async function openNewField(page: import('@playwright/test').Page, farmId: number, name = 'North field') {
  await page.goto(`/farms/${farmId}/fields/new`)
  await expect(page.getByRole('heading', { name: 'Add a field' })).toBeVisible()
  await page.getByLabel('Field name').fill(name)
  await expect(boundaryMap(page).locator('.leaflet-tile-pane')).toBeAttached()
}

test('boundary map initializes with controls and drawing tools', async ({ page }) => {
  const { farm } = await signedInWithFarm(page)
  await openNewField(page, farm.id)
  const map = boundaryMap(page)
  await expect(map.locator('.leaflet-control-zoom-in')).toBeVisible()
  await expect(map.locator('.leaflet-control-layers')).toBeVisible()
  expect((await map.boundingBox())!.height).toBeGreaterThan(250)
  await expect(page.getByRole('button', { name: 'Draw a rectangle' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Draw corners (any shape)' })).toBeVisible()
})

test('dragging a box draws a rectangle without moving the map, saves, and survives reload', async ({ page }) => {
  const { farm, auth } = await signedInWithFarm(page)
  await openNewField(page, farm.id, 'Box field')
  await page.getByRole('button', { name: 'Draw a rectangle' }).click()
  const map = boundaryMap(page)
  const panBefore = await mapPan(map)
  await dragAcross(page, map, [0.3, 0.3], [0.7, 0.7])

  await expect(page.getByText('Boundary set. Drag the white dots to adjust the corners.')).toBeVisible()
  expect(await mapPan(map), 'map must not pan while drawing').toBe(panBefore)
  await expect(map.locator('.leaflet-marker-icon')).toHaveCount(4)
  await expect(page.getByText(/Boundary area: about [\d.,]+ acres/)).toBeVisible()

  await page.getByRole('button', { name: 'Save field' }).click()
  await expect(page.getByRole('heading', { name: 'Test Farm' })).toBeVisible()
  await expect(page.getByText('Box field', { exact: true })).toBeVisible()

  // Persisted GeoJSON: closed ring, longitude first, near the farm.
  const fields = await (await page.request.get(`/api/v1/farms/${farm.id}/fields`, { headers: auth })).json()
  const ring: number[][] = fields[0].boundary.coordinates[0]
  expect(fields[0].boundary.type).toBe('Polygon')
  expect(ring).toHaveLength(5)
  expect(ring[0]).toEqual(ring[4])
  for (const [lon, lat] of ring) {
    expect(lon).toBeGreaterThan(-94)
    expect(lon).toBeLessThan(-93)
    expect(lat).toBeGreaterThan(41)
    expect(lat).toBeLessThan(42)
  }

  // After a full reload: shown on the dashboard map, and editable with the same 4 corners.
  await page.reload()
  await expect(page.getByText('Box field', { exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: /Map of 1 field/ }).locator('path.leaflet-interactive')).toHaveCount(1)
  await page.getByRole('link', { name: 'Edit Box field' }).click()
  await expect(page.getByText('Boundary set. Drag the white dots to adjust the corners.')).toBeVisible()
  await expect(boundaryMap(page).locator('.leaflet-marker-icon')).toHaveCount(4)
})

test('a rectangle can also be drawn by clicking two opposite corners', async ({ page }) => {
  const { farm } = await signedInWithFarm(page)
  await openNewField(page, farm.id)
  await page.getByRole('button', { name: 'Draw a rectangle' }).click()
  const map = boundaryMap(page)
  await tapAt(page, map, 0.25, 0.3)
  await expect(page.getByText('Now click or tap the opposite corner of the field.')).toBeVisible()
  await tapAt(page, map, 0.75, 0.7)
  await expect(page.getByText('Boundary set. Drag the white dots to adjust the corners.')).toBeVisible()
  await expect(map.locator('.leaflet-marker-icon')).toHaveCount(4)
})

test('corners tool: Done is enabled once valid, and clicking the first corner closes the shape', async ({ page }) => {
  const { farm, auth } = await signedInWithFarm(page)
  await openNewField(page, farm.id, 'Odd field')
  await page.getByRole('button', { name: 'Draw corners (any shape)' }).click()
  const map = boundaryMap(page)
  const done = page.getByRole('button', { name: 'Done' })

  await tapAt(page, map, 0.3, 0.3)
  await tapAt(page, map, 0.7, 0.3)
  await expect(done).toBeDisabled()
  await expect(page.getByRole('alert')).toHaveText('Place 1 more corner (at least 3 are needed).')
  await expect(done).toBeInViewport() // controls sit above the map

  await tapAt(page, map, 0.6, 0.7)
  await tapAt(page, map, 0.3, 0.65)
  await expect(done).toBeEnabled()
  await tapAt(page, map, 0.3, 0.3) // the first corner again
  await expect(page.getByText('Boundary set. Drag the white dots to adjust the corners.')).toBeVisible()
  await expect(map.locator('.leaflet-marker-icon')).toHaveCount(4) // no duplicate corner

  await page.getByRole('button', { name: 'Save field' }).click()
  await expect(page.getByText('Odd field', { exact: true })).toBeVisible()
  const [saved] = await (await page.request.get(`/api/v1/farms/${farm.id}/fields`, { headers: auth })).json()
  expect(saved.boundary.coordinates[0]).toHaveLength(5)
})

test('Done button finishes a corners boundary', async ({ page }) => {
  const { farm } = await signedInWithFarm(page)
  await openNewField(page, farm.id)
  await page.getByRole('button', { name: 'Draw corners (any shape)' }).click()
  const map = boundaryMap(page)
  for (const [x, y] of [[0.3, 0.3], [0.7, 0.3], [0.5, 0.7]] as const) await tapAt(page, map, x, y)
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText('Boundary set. Drag the white dots to adjust the corners.')).toBeVisible()
  await expect(page.getByText(/Boundary area: about/)).toBeVisible()
})

test('a self-crossing boundary is explained and cannot be finished', async ({ page }) => {
  const { farm } = await signedInWithFarm(page)
  await openNewField(page, farm.id)
  await page.getByRole('button', { name: 'Draw corners (any shape)' }).click()
  const map = boundaryMap(page)
  for (const [x, y] of [[0.2, 0.2], [0.8, 0.8], [0.8, 0.2], [0.2, 0.8]] as const) await tapAt(page, map, x, y)
  await expect(page.getByRole('alert')).toContainText('The edges cross each other')
  await expect(page.getByRole('button', { name: 'Done' })).toBeDisabled()
})

test('saving without a boundary shows a clear message', async ({ page }) => {
  const { farm } = await signedInWithFarm(page)
  await openNewField(page, farm.id)
  await page.getByRole('button', { name: 'Save field' }).click()
  await expect(page.getByRole('alert')).toHaveText('Please draw the field on the map.')
})

test('mouse wheel over the map scrolls the page instead of zooming the map', async ({ page }) => {
  test.skip(isPhone(page), 'no mouse wheel on phones')
  const { farm } = await signedInWithFarm(page)
  await openNewField(page, farm.id)
  const map = boundaryMap(page)
  await map.scrollIntoViewIfNeeded()
  const zoomBefore = await map.locator('.leaflet-tile').first().getAttribute('src')
  const scrollBefore = await page.evaluate(() => scrollY)
  const b = (await map.boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.wheel(0, 400)
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(scrollBefore)
  expect(await map.locator('.leaflet-tile').first().getAttribute('src')).toBe(zoomBefore)
})
