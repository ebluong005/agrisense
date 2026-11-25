export const SQ_METERS_PER_ACRE = 4046.8564224
export const SQ_METERS_PER_HECTARE = 10_000
const MM_PER_INCH = 25.4

export const hectaresToAcres = (ha: number) => (ha * SQ_METERS_PER_HECTARE) / SQ_METERS_PER_ACRE
export const acresToHectares = (acres: number) => (acres * SQ_METERS_PER_ACRE) / SQ_METERS_PER_HECTARE
export const mmToInches = (mm: number) => mm / MM_PER_INCH
export const celsiusToFahrenheit = (c: number) => (c * 9) / 5 + 32

function round(value: number, digits: number) {
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/** "12.4 acres (5.0 ha)"; small fields keep two decimals so they never show as 0. */
export function formatArea(hectares: number): string {
  const acres = hectaresToAcres(hectares)
  const digits = acres < 10 ? 2 : 1
  return `${round(acres, digits)} acres (${round(hectares, digits)} ha)`
}

/** "1.62 in (41.2 mm)" */
export function formatRainfall(mm: number): string {
  return `${round(mmToInches(mm), 2)} in (${round(mm, 1)} mm)`
}

/** "63 °F (17.2 °C)" */
export function formatTemperature(c: number): string {
  return `${round(celsiusToFahrenheit(c), 0)} °F (${round(c, 1)} °C)`
}

export function formatCoordinates(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lon >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lon).toFixed(4)}° ${ew}`
}
