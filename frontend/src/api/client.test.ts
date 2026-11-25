import { describe, expect, it, vi } from 'vitest'
import { mockApi } from '../test/fetchMock'
import { ApiError, apiRequest, messageFromDetail, setToken, setUnauthorizedHandler } from './client'

describe('apiRequest', () => {
  it('sends the bearer token and JSON body', async () => {
    setToken('abc')
    const { calls } = mockApi({ 'POST /farms': () => ({ status: 201, json: { id: 1 } }) })
    await expect(apiRequest('/farms', { method: 'POST', body: { name: 'x' } })).resolves.toEqual({ id: 1 })
    expect(calls[0].headers.Authorization).toBe('Bearer abc')
    expect(calls[0].body).toEqual({ name: 'x' })
  })

  it('turns FastAPI validation errors into one readable sentence', async () => {
    mockApi({
      'POST /farms': () => ({ status: 422, json: { detail: [{ loc: ['body', 'latitude'], msg: 'Input should be less than or equal to 90' }] } }),
    })
    await expect(apiRequest('/farms', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 422,
      message: 'latitude: Input should be less than or equal to 90',
    })
  })

  it('reports network failures in plain language', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const error = await apiRequest('/farms').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(0)
    expect((error as ApiError).message).toMatch(/internet connection/)
  })

  it('hides internal server error details', async () => {
    mockApi({ 'GET /farms': () => ({ status: 500, json: { detail: 'Traceback: secret stuff' } }) })
    await expect(apiRequest('/farms')).rejects.toMatchObject({ message: 'Something went wrong on our side. Please try again.' })
  })

  it('ends the session when a signed-in request gets 401', async () => {
    setToken('expired')
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    mockApi({ 'GET /farms': () => ({ status: 401, json: { detail: 'Invalid or expired token' } }) })
    await expect(apiRequest('/farms')).rejects.toMatchObject({ status: 401 })
    expect(handler).toHaveBeenCalledOnce()
    setUnauthorizedHandler(null)
  })

  it('returns undefined for 204 responses', async () => {
    mockApi({ 'DELETE /farms/1': () => ({ status: 204 }) })
    await expect(apiRequest('/farms/1', { method: 'DELETE' })).resolves.toBeUndefined()
  })
})

describe('messageFromDetail', () => {
  it('passes through strings and ignores unknown shapes', () => {
    expect(messageFromDetail('Farm not found')).toBe('Farm not found')
    expect(messageFromDetail({ weird: true })).toBeNull()
  })
})
