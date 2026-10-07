import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from './api'
import { anonymous, errorBody, preference, signedIn, weather } from './test/fixtures'

function respond(body: unknown, status = 200, headers = {}) {
  const fetch = vi.fn().mockResolvedValue(new Response(status === 204 ? null : JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', ...headers },
  }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('backend-only API client', () => {
  it('bootstraps credentials without caching or browser storage', async () => {
    const fetch = respond(anonymous)
    expect(await api.session()).toEqual(anonymous)
    expect(fetch).toHaveBeenCalledWith('/api/v1/auth/session', expect.objectContaining({
      credentials: 'include', cache: 'no-store',
    }))
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it.each([
    'http://localhost:3000/api/v1',
    '/api/v1',
  ])('uses the configured backend base URL %s with cookies', async (baseUrl) => {
    vi.resetModules()
    vi.stubEnv('VITE_API_BASE_URL', baseUrl)
    const { api: configuredApi } = await import('./api')
    const fetch = respond(anonymous)
    await configuredApi.session()
    expect(fetch).toHaveBeenCalledWith(`${baseUrl}/auth/session`, expect.objectContaining({ credentials: 'include' }))
  })

  it('reports missing API configuration instead of requesting an undefined URL', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_API_BASE_URL', undefined)
    const { api: configuredApi } = await import('./api')
    const fetch = respond(anonymous)
    await expect(configuredApi.session()).rejects.toMatchObject({ code: 'CONFIGURATION_ERROR' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends only contract city parameters and never adds units/provider parameters', async () => {
    const fetch = respond(weather)
    await api.weather({ q: 'New York', countryCode: 'US' })
    expect(fetch.mock.calls[0][0]).toBe('/api/v1/weather?q=New+York&countryCode=US')
  })

  it('uses exact canonical coordinates for saved lookup', async () => {
    const fetch = respond(weather)
    await api.weather({ latitude: 59.3293, longitude: 18.0686 })
    expect(fetch.mock.calls[0][0]).toBe('/api/v1/weather?latitude=59.3293&longitude=18.0686')
  })

  it('sends registration JSON and anonymous CSRF; login returns the rotated token', async () => {
    const fetch = respond({ user: signedIn.user }, 201)
    await api.register('reader@example.test', 'synthetic-password', anonymous.csrfToken)
    expect(fetch).toHaveBeenCalledWith('/api/v1/auth/register', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ email: 'reader@example.test', password: 'synthetic-password' }),
      headers: expect.objectContaining({ 'X-CSRF-Token': anonymous.csrfToken, 'Content-Type': 'application/json' }),
    }))
    respond(signedIn)
    expect(await api.login('reader@example.test', 'synthetic-password', anonymous.csrfToken)).toEqual(signedIn)
  })

  it.each([200, 201])('accepts the idempotent save status %s without adding user IDs', async (status) => {
    const fetch = respond({ preference }, status)
    expect(await api.save(weather.location, preference.snapshot, signedIn.csrfToken)).toEqual({ preference })
    expect(fetch.mock.calls[0][1].body).toBe(JSON.stringify({ location: weather.location, snapshot: preference.snapshot }))
    expect(fetch.mock.calls[0][1].headers['X-CSRF-Token']).toBe(signedIn.csrfToken)
  })

  it('encodes opaque deletion IDs and uses bodyless DELETE/POST with 204', async () => {
    const fetch = respond(undefined, 204)
    await api.remove('opaque/id ?', signedIn.csrfToken)
    await api.logout(signedIn.csrfToken)
    expect(fetch.mock.calls[0][0]).toBe('/api/v1/preferences/opaque%2Fid%20%3F')
    expect(fetch.mock.calls[0][1].method).toBe('DELETE')
    expect(fetch.mock.calls[0][1].body).toBeUndefined()
    expect(fetch.mock.calls[1][0]).toBe('/api/v1/auth/logout')
    expect(fetch.mock.calls[1][1].body).toBeUndefined()
  })

  it('does not send unsafe requests without a token', () => {
    const fetch = respond(undefined)
    expect(() => api.logout('')).toThrow(ApiError)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('preserves sanitized field errors, diagnostic reference, and retry timing', async () => {
    respond({ error: { ...errorBody('RATE_LIMITED').error, fields: [{ field: 'email', message: 'Check email.' }] } }, 429, { 'Retry-After': '60' })
    await expect(api.session()).rejects.toMatchObject({
      status: 429, code: 'RATE_LIMITED', requestId: 'req_synthetic', retryAfter: 60,
      fields: [{ field: 'email', message: 'Check email.' }],
    })
  })

  it('preserves the full 40-point horizon rather than selecting or aggregating days', async () => {
    respond(weather)
    expect(await api.weather({ q: 'Stockholm' })).toEqual(weather)
  })

  it('returns the backend saved snapshots without transforming them', async () => {
    respond({ preferences: [preference] })
    expect(await api.preferences()).toEqual({ preferences: [preference] })
  })

  it('handles non-JSON and malformed edge errors without showing raw content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>edge details</html>', { status: 502 })))
    await expect(api.session()).rejects.toMatchObject({ code: 'SERVICE_RESPONSE_ERROR' })
    respond({ unsafe: 'internal details' }, 500)
    await expect(api.session()).rejects.toMatchObject({ code: 'SERVICE_RESPONSE_ERROR' })
  })

  it.each([null, [], { error: 'internal detail' }, {
    error: { ...errorBody('VALIDATION_ERROR').error, fields: [{ field: 'email', message: 123 }] },
  }])('reports malformed error payloads explicitly', async (body) => {
    respond(body, 500)
    await expect(api.session()).rejects.toMatchObject({ code: 'SERVICE_RESPONSE_ERROR' })
  })

  it.each([null, {}, { ...weather, forecast: [] }])('reports absent forecast points instead of inventing weather', async (body) => {
    respond(body)
    await expect(api.weather({ q: 'Stockholm' })).rejects.toMatchObject({ code: 'SERVICE_RESPONSE_ERROR' })
  })

  it('handles network failures explicitly and propagates cancellation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network detail')))
    await expect(api.session()).rejects.toMatchObject({ code: 'TRANSPORT_ERROR' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')))
    await expect(api.weather({ q: 'Stockholm' })).rejects.toMatchObject({ name: 'AbortError' })
  })
})
