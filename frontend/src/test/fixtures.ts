import type { AuthState, ForecastResponse, Preference } from '../api'

export const anonymous: AuthState = { user: null, csrfToken: 'synthetic-anonymous-token' }
export const signedIn: AuthState = {
  user: { id: 'usr_test', email: 'reader@example.test' },
  csrfToken: 'synthetic-rotated-token',
}
export const weather: ForecastResponse = {
  location: { name: 'Stockholm', countryCode: 'SE', latitude: 59.3293, longitude: 18.0686 },
  units: 'metric',
  fetchedAt: '2026-10-07T18:30:00Z',
  timezoneOffsetSeconds: 7200,
  forecast: Array.from({ length: 40 }, (_, index) => ({
    forecastAt: new Date(Date.parse('2026-10-07T21:00:00Z') + index * 3 * 60 * 60 * 1000).toISOString(),
    temperatureC: index === 0 ? 12.4 : 11.2,
    condition: { code: index === 0 ? 'cloudy' : 'rain', description: index === 0 ? 'Overcast clouds' : 'Light rain' },
  })),
}
export const preference: Preference = {
  id: 'pref_test',
  location: weather.location,
  snapshot: {
    forecastAt: weather.forecast[0].forecastAt,
    temperatureC: weather.forecast[0].temperatureC,
    description: weather.forecast[0].condition.description,
  },
  createdAt: '2026-10-07T18:35:00Z',
}
export function errorBody(code: string, message = 'Please try again.') {
  return { error: { code, message, requestId: 'req_synthetic' } }
}
