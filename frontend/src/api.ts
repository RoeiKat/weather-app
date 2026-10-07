import { z } from 'zod'

const nonempty = z.string().min(1)
const utcDate = z.iso.datetime()
const userSchema = z.strictObject({ id: nonempty, email: nonempty })
const authSchema = z.strictObject({ user: userSchema.nullable(), csrfToken: nonempty })
const locationSchema = z.strictObject({
  name: z.string().min(1).max(100).refine((name) => name === name.trim()),
  countryCode: z.string().regex(/^[A-Z]{2}$/).nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
})
const forecastPointSchema = z.strictObject({
  forecastAt: utcDate,
  temperatureC: z.number(),
  condition: z.strictObject({
    code: z.enum(['clear', 'cloudy', 'rain', 'drizzle', 'thunderstorm', 'snow', 'mist', 'other']),
    description: z.string().min(1).max(200),
  }),
})
const weatherSchema = z.strictObject({
  location: locationSchema,
  units: z.literal('metric'),
  fetchedAt: utcDate,
  timezoneOffsetSeconds: z.number().int().min(-43200).max(50400),
  forecast: z.array(forecastPointSchema).min(1).refine((points) =>
    points.every((point, index) => index === 0 || Date.parse(point.forecastAt) > Date.parse(points[index - 1].forecastAt))),
})
const snapshotSchema = z.strictObject({
  forecastAt: utcDate,
  temperatureC: z.number(),
  description: z.string().min(1).max(200),
})
const preferenceSchema = z.strictObject({
  id: nonempty,
  location: locationSchema,
  snapshot: snapshotSchema,
  createdAt: utcDate,
})
const errorSchema = z.strictObject({
  error: z.strictObject({
    code: nonempty,
    message: nonempty,
    requestId: nonempty,
    fields: z.array(z.strictObject({ field: nonempty, message: nonempty })).min(1).optional(),
  }),
})

export type AuthState = z.infer<typeof authSchema>
export type Location = z.infer<typeof locationSchema>
export type ForecastResponse = z.infer<typeof weatherSchema>
export type ForecastPoint = z.infer<typeof forecastPointSchema>
export type ForecastSnapshot = z.infer<typeof snapshotSchema>
export type Preference = z.infer<typeof preferenceSchema>
export type FieldError = { field: string; message: string }

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

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  statuses: number[],
  options: RequestInit = {},
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api/v1${path}`, {
      ...options,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json', ...options.headers },
    })
  } catch (error) {
    if (options.signal?.aborted || ((error instanceof Error || error instanceof DOMException) && error.name === 'AbortError')) throw error
    throw new ApiError('Could not connect to the service. Check your connection and try again.')
  }
  if (response.status === 204 && statuses.includes(204)) return schema.parse(undefined)

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new ApiError('The service returned an unreadable response. Please try again.', response.status, 'SERVICE_RESPONSE_ERROR')
  }
  if (!response.ok) {
    const result = errorSchema.safeParse(body)
    if (!result.success) {
      throw new ApiError('The service returned an unexpected error. Please try again.', response.status, 'SERVICE_RESPONSE_ERROR')
    }
    const error = result.data.error
    const retry = response.headers.get('Retry-After')
    throw new ApiError(
      error.message, response.status, error.code, error.requestId, error.fields,
      retry && /^\d+$/.test(retry) ? Number(retry) : undefined,
    )
  }
  const result = schema.safeParse(body)
  if (!statuses.includes(response.status) || !result.success) {
    throw new ApiError('The service returned an unexpected response. Please try again.', response.status, 'SERVICE_RESPONSE_ERROR')
  }
  return result.data
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
  session: () => request('/auth/session', authSchema, [200]),
  register: (email: string, password: string, token: string) =>
    request('/auth/register', z.strictObject({ user: userSchema }), [201], mutation('POST', token, { email, password })),
  login: (email: string, password: string, token: string) =>
    request('/auth/login', authSchema, [200], mutation('POST', token, { email, password })),
  logout: (token: string) =>
    request('/auth/logout', z.undefined(), [204], mutation('POST', token)),
  weather: (query: { q: string; countryCode?: string } | { latitude: number; longitude: number }, signal?: AbortSignal) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) params.set(key, String(value))
    return request(`/weather?${params}`, weatherSchema, [200], { signal })
  },
  preferences: () => request('/preferences', z.strictObject({ preferences: z.array(preferenceSchema) }), [200]),
  save: (location: Location, snapshot: ForecastSnapshot, token: string) =>
    request('/preferences', z.strictObject({ preference: preferenceSchema }), [200, 201], mutation('POST', token, { location, snapshot })),
  remove: (id: string, token: string) =>
    request(`/preferences/${encodeURIComponent(id)}`, z.undefined(), [204], mutation('DELETE', token)),
}

export function asApiError(error: unknown): ApiError {
  return error instanceof ApiError
    ? error
    : new ApiError('Something went wrong. Please try again.', 0, 'CLIENT_ERROR')
}
