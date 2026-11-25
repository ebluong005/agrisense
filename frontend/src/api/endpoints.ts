import { apiRequest } from './client'
import type { Farm, FarmInput, Field, FieldInput, TokenResponse, User, WeatherSummary } from './types'

type Opts = { signal?: AbortSignal }

export const authApi = {
  register: (email: string, password: string) =>
    apiRequest<TokenResponse>('/auth/register', { method: 'POST', body: { email, password } }),
  login: (email: string, password: string) =>
    apiRequest<TokenResponse>('/auth/login', { method: 'POST', body: { email, password } }),
  me: (o: Opts = {}) => apiRequest<User>('/auth/me', o),
}

export const farmsApi = {
  list: (o: Opts = {}) => apiRequest<Farm[]>('/farms', o),
  get: (id: number, o: Opts = {}) => apiRequest<Farm>(`/farms/${id}`, o),
  create: (input: FarmInput) => apiRequest<Farm>('/farms', { method: 'POST', body: input }),
  update: (id: number, input: FarmInput) => apiRequest<Farm>(`/farms/${id}`, { method: 'PUT', body: input }),
  remove: (id: number) => apiRequest<void>(`/farms/${id}`, { method: 'DELETE' }),
}

export const fieldsApi = {
  list: (farmId: number, o: Opts = {}) => apiRequest<Field[]>(`/farms/${farmId}/fields`, o),
  create: (farmId: number, input: FieldInput) =>
    apiRequest<Field>(`/farms/${farmId}/fields`, { method: 'POST', body: input }),
  update: (id: number, input: FieldInput) => apiRequest<Field>(`/fields/${id}`, { method: 'PUT', body: input }),
  remove: (id: number) => apiRequest<void>(`/fields/${id}`, { method: 'DELETE' }),
}

export const weatherApi = {
  farmSummary: (farmId: number, o: Opts = {}) => apiRequest<WeatherSummary>(`/farms/${farmId}/weather/summary`, o),
  fieldSummary: (fieldId: number, o: Opts = {}) => apiRequest<WeatherSummary>(`/fields/${fieldId}/weather/summary`, o),
}
