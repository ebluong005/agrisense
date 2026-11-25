// Mirrors backend/app/schemas.py. Keep in sync when the API contract changes.
export type User = { id: number; email: string }
export type TokenResponse = { access_token: string; token_type: string }

export type FarmInput = { name: string; latitude: number; longitude: number }
export type Farm = FarmInput & { id: number; owner_id: number; created_at: string }

export type FieldInput = {
  name: string
  crop_type: string
  planting_date: string | null // YYYY-MM-DD
  boundary: GeoJSON.Polygon
}
export type Field = {
  id: number
  farm_id: number
  name: string
  crop_type: string
  planting_date: string | null
  boundary: GeoJSON.Polygon
  area_hectares: number
}

// GET /farms/{id}/weather/summary and /fields/{id}/weather/summary (backend/app/schemas.py WeatherSummary)
export type RainfallWindow = {
  start: string
  end: string
  expected_days: number
  valid_days: number
  total_mm: number | null // null when no day had data: never a fake 0
  complete: boolean
}
export type WeatherAlert = {
  code: string
  severity: 'watch'
  title: string
  explanation: string
  evidence: { rainfall_mm: number; threshold_mm: number; window_start: string; window_end: string; valid_days: number; expected_days: number }
  limitations: string
  suggested_action: string
  source: string
}
export type RuleCheck = {
  code: string
  status: 'triggered' | 'not_triggered' | 'insufficient_data'
  threshold_mm: number
  window_days: number
  explanation: string
}
export type DailyObservation = {
  date: string
  precipitation_mm: number | null
  temperature_c: number | null
  temperature_min_c: number | null
  temperature_max_c: number | null
}
export type WeatherSummary = {
  target: { kind: 'farm' | 'field'; id: number; name: string; basis: string }
  location: { latitude: number; longitude: number }
  requested_range: { start: string; end: string }
  source: { name: string; url: string; dataset: string; parameters: Record<string, string>; spatial_resolution: string; description: string }
  units: { precipitation: string; temperature: string }
  freshness: {
    status: 'current' | 'delayed' | 'no_data'
    latest_observation_date: string | null
    days_since_latest: number | null
    retrieved_at: string | null
    stale: boolean
    warning: string | null
  }
  precipitation: { last_7_days: RainfallWindow; last_30_days: RainfallWindow } | null
  temperature: { mean_c: number | null; lowest_c: number | null; highest_c: number | null; valid_days: number; expected_days: number } | null
  alerts: WeatherAlert[]
  checks: RuleCheck[]
  daily: DailyObservation[]
}
