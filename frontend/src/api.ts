const API_BASE_URL = import.meta.env.VITE_API_BASE_URL

export interface User {
  id: string
  email: string
}

export interface AuthState {
  user: User | null
  csrfToken: string
}

export interface Location {
  name: string
  countryCode: string | null
  latitude: number
  longitude: number
}

export interface ForecastPoint {
  forecastAt: string
  temperatureC: number
  condition: {
    code: 'clear' | 'cloudy' | 'rain' | 'drizzle' | 'thunderstorm' | 'snow' | 'mist' | 'other'
    description: string
  }
}

export interface ForecastResponse {
  location: Location
  units: 'metric'
  fetchedAt: string
  timezoneOffsetSeconds: number
  forecast: ForecastPoint[]
}

export interface ForecastSnapshot {
  forecastAt: string
  temperatureC: number
  description: string
}

export interface Preference {
  id: string
  location: Location
  snapshot: ForecastSnapshot
  createdAt: string
}

export type FieldError = { field: string; message: string }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFieldError(value: unknown): value is FieldError {
  return isObject(value) && typeof value.field === 'string' && typeof value.message === 'string'
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly code = 'TRANSPORT_ERROR',
    readonly requestId?: string,
    readonly fields: FieldError[] = [],
    readonly retryAfter?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!API_BASE_URL) throw new ApiError('The API base URL is not configured.', 0, 'CONFIGURATION_ERROR')
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json', ...options.headers },
    })
  } catch (error) {
    if (options.signal?.aborted || ((error instanceof Error || error instanceof DOMException) && error.name === 'AbortError')) throw error
    throw new ApiError('Could not connect to the service. Check your connection and try again.')
  }
  if (response.status === 204) return undefined as T

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new ApiError('The service returned an unreadable response. Please try again.', response.status, 'SERVICE_RESPONSE_ERROR')
  }
  if (!response.ok) {
    const error = isObject(body) ? body.error : undefined
    if (!isObject(error) || typeof error.code !== 'string' || typeof error.message !== 'string' || typeof error.requestId !== 'string') {
      throw new ApiError('The service returned an unexpected error. Please try again.', response.status, 'SERVICE_RESPONSE_ERROR')
    }
    const fields = error.fields === undefined ? [] : error.fields
    if (!Array.isArray(fields) || !fields.every(isFieldError)) {
      throw new ApiError('The service returned an unexpected error. Please try again.', response.status, 'SERVICE_RESPONSE_ERROR')
    }
    const retry = response.headers.get('Retry-After')
    throw new ApiError(
      error.message, response.status, error.code, error.requestId, fields,
      retry && /^\d+$/.test(retry) ? Number(retry) : undefined,
    )
  }
  return body as T
}

function mutation(method: 'POST' | 'DELETE', csrfToken: string, body?: unknown): RequestInit {
  if (!csrfToken) throw new ApiError('Refresh your session before trying again.', 403, 'CSRF_FAILED')
  return {
    method,
    headers: {
      'X-CSRF-Token': csrfToken,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }
}

export const api = {
  session: () => request<AuthState>('/auth/session'),
  register: (email: string, password: string, token: string) =>
    request<{ user: User }>('/auth/register', mutation('POST', token, { email, password })),
  login: (email: string, password: string, token: string) =>
    request<AuthState>('/auth/login', mutation('POST', token, { email, password })),
  logout: (token: string) =>
    request<void>('/auth/logout', mutation('POST', token)),
  weather: async (query: { q: string; countryCode?: string } | { latitude: number; longitude: number }, signal?: AbortSignal) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) params.set(key, String(value))
    const result = await request<ForecastResponse>(`/weather?${params}`, { signal })
    if (!result || !Array.isArray(result.forecast) || !result.forecast.length) {
      throw new ApiError('The service returned no forecast. Please try again.', 502, 'SERVICE_RESPONSE_ERROR')
    }
    return result
  },
  preferences: () => request<{ preferences: Preference[] }>('/preferences'),
  save: (location: Location, snapshot: ForecastSnapshot, token: string) =>
    request<{ preference: Preference }>('/preferences', mutation('POST', token, { location, snapshot })),
  remove: (id: string, token: string) =>
    request<void>(`/preferences/${encodeURIComponent(id)}`, mutation('DELETE', token)),
}

export function asApiError(error: unknown): ApiError {
  return error instanceof ApiError
    ? error
    : new ApiError('Something went wrong. Please try again.', 0, 'CLIENT_ERROR')
}
