import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { validateCredentials } from './AuthForm'
import { forecastDate, forecastLabel, groupForecast } from './forecast'
import { anonymous, errorBody, preference, signedIn, weather } from './test/fixtures'

const saveName = `Save forecast for Stockholm, ${forecastLabel(weather.forecast[0].forecastAt, weather.timezoneOffsetSeconds)}`
const savedName = `Saved forecast for Stockholm, ${forecastLabel(weather.forecast[0].forecastAt, weather.timezoneOffsetSeconds)}`

type Handler = (url: string, options: RequestInit) => Response | Promise<Response>
const json = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
})
function mockApi(handler?: Handler, authenticated = false) {
  const fetch = vi.fn(async (url: string, options: RequestInit) => {
    if (handler) return handler(url, options)
    if (url === '/api/v1/auth/session') return json(authenticated ? signedIn : anonymous)
    if (url === '/api/v1/preferences') return json({ preferences: [] })
    if (url.startsWith('/api/v1/weather?')) return json(weather)
    throw new Error(`Unexpected test route: ${url}`)
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}
const defaults: Handler = (url) => {
  if (url === '/api/v1/auth/session') return json(signedIn)
  if (url === '/api/v1/preferences') return json({ preferences: [] })
  if (url.startsWith('/api/v1/weather?')) return json(weather)
  throw new Error(`Unexpected test route: ${url}`)
}
async function searchCity(name = 'Stockholm') {
  const user = userEvent.setup()
  await user.clear(screen.getByLabelText('City'))
  await user.type(screen.getByLabelText('City'), name)
  await user.click(screen.getByRole('button', { name: 'Show forecast' }))
}
async function findForecastText(text: string) {
  return within(await screen.findByRole('region', { name: 'Selected forecast' })).findByText(text)
}
async function selectPoint(index: number) {
  const point = weather.forecast[index]
  await userEvent.click(within(screen.getByRole('group', { name: 'Forecast days' })).getByRole('button', {
    name: forecastDate(point.forecastAt, weather.timezoneOffsetSeconds),
  }))
  await userEvent.click(screen.getByRole('button', {
    name: `${forecastLabel(point.forecastAt, weather.timezoneOffsetSeconds)}, ${point.temperatureC} °C, ${point.condition.description}`,
  }))
}
beforeEach(() => {
  window.history.replaceState(null, '', '/')
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('weather and authentication journeys', () => {
  it('shares bootstrap across StrictMode effect replay so cookie/token responses cannot race', async () => {
    let resolveSession!: (response: Response) => void
    const fetch = mockApi(() => new Promise((resolve) => { resolveSession = resolve }))
    render(<StrictMode><App /></StrictMode>)
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('/auth/session'))).toHaveLength(1)
    expect(screen.queryByRole('link', { name: 'Register' })).not.toBeInTheDocument()
    await act(async () => { resolveSession(json(anonymous)) })
    expect(await screen.findByRole('link', { name: 'Register' })).toBeVisible()
  })

  it('keeps public search usable during a failed session bootstrap, without pretending to be anonymous', async () => {
    mockApi((url) => url.endsWith('/auth/session') ? json(errorBody('SERVICE_UNAVAILABLE'), 503) : json(weather))
    render(<App />)
    expect(await screen.findByRole('button', { name: 'Retry session' })).toBeVisible()
    expect(screen.getByText('Account unavailable')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Register' })).toBeVisible()
    await searchCity()
    expect(await screen.findByRole('heading', { name: 'Stockholm, SE' })).toBeVisible()
    expect(screen.queryByText(/to save this forecast/)).not.toBeInTheDocument()
  })

  it('exposes every city-local day but renders only the selected day, with UTC retrieval time', async () => {
    mockApi()
    render(<App />)
    expect(await screen.findByRole('link', { name: 'Register' })).toBeVisible()
    expect(screen.getByText(/Search for a city to see/)).toBeVisible()
    await searchCity()
    expect(await findForecastText('Overcast clouds')).toBeVisible()
    expect(within(screen.getByRole('list', { name: /forecast points/ })).getByRole('button', { pressed: true })).toHaveTextContent('12.4 °C')
    expect(screen.getByText(/City time: UTC\+02:00/)).toBeVisible()
    expect(screen.getByText(/Retrieved at/)).toHaveTextContent('UTC')
    const selector = within(screen.getByRole('group', { name: 'Forecast days' }))
    expect(selector.getAllByRole('button')).toHaveLength(6)
    expect(screen.getAllByRole('heading', { level: 4 })).toHaveLength(1)
    expect(screen.getByText(/Partial day - available times/)).toBeVisible()
    const groups = groupForecast(weather)
    for (const day of groups) {
      await userEvent.click(selector.getByRole('button', { name: day.label }))
      expect(screen.getByRole('region', { name: 'Multi-day forecast' }).querySelectorAll('.forecast-rows li')).toHaveLength(day.points.length)
      expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent(day.label)
      expect(within(screen.getByRole('list', { name: /forecast points/ })).getByRole('button', { pressed: true }))
        .toHaveAccessibleName(new RegExp(day.points[0].condition.description))
    }
    expect(groups.flatMap((day) => day.points)).toHaveLength(40)
    expect(screen.getByText(/Coordinates: 59.3293, 18.0686/)).toBeVisible()
    expect(screen.queryByRole('button', { name: saveName })).not.toBeInTheDocument()
  })

  it('validates search accessibly before calling weather', async () => {
    const fetch = mockApi()
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: 'Show forecast' }))
    expect(screen.getByLabelText('City')).toHaveFocus()
    expect(screen.getByLabelText('City')).toHaveAttribute('aria-invalid', 'true')
    expect(fetch.mock.calls.some(([url]) => url.includes('/weather'))).toBe(false)
    await userEvent.type(screen.getByLabelText('City'), 'Stockholm')
    await userEvent.type(screen.getByLabelText('Country code (optional)'), 'S')
    await userEvent.click(screen.getByRole('button', { name: 'Show forecast' }))
    expect(screen.getByLabelText('Country code (optional)')).toHaveFocus()
  })

  it('selects with the keyboard without moving focus, updates the whole hero, and saves unrounded values', async () => {
    const point = {
      ...weather.forecast[1], temperatureC: 11.234,
      condition: { code: 'snow' as const, description: 'Light snow' },
    }
    const selectedWeather = { ...weather, forecast: [weather.forecast[0], point, ...weather.forecast.slice(2)] }
    const snapshot = { forecastAt: point.forecastAt, temperatureC: point.temperatureC, description: point.condition.description }
    const fetch = mockApi((url, options) => {
      if (url.includes('/weather')) return json(selectedWeather)
      if (url === '/api/v1/preferences' && options.method === 'POST') return json({ preference: { ...preference, snapshot } }, 201)
      return defaults(url, options)
    })
    render(<App />)
    await searchCity()
    await userEvent.click(within(await screen.findByRole('group', { name: 'Forecast days' })).getByRole('button', {
      name: forecastDate(point.forecastAt, weather.timezoneOffsetSeconds),
    }))
    await selectPoint(2)
    const control = await screen.findByRole('button', {
      name: `${forecastLabel(point.forecastAt, weather.timezoneOffsetSeconds)}, 11.2 °C, Light snow`,
    })
    control.focus()
    expect(control).toHaveAttribute('aria-pressed', 'false')
    await userEvent.keyboard('{Enter}')
    expect(control).toHaveFocus()
    expect(within(screen.getByRole('list', { name: /forecast points/ })).getAllByRole('button', { pressed: true })).toEqual([control])
    const hero = within(screen.getByRole('region', { name: 'Selected forecast' }))
    expect(hero.getByText('11.2')).toBeVisible()
    expect(hero.getByText('Light snow')).toBeVisible()
    expect(hero.getByText(forecastLabel(point.forecastAt, weather.timezoneOffsetSeconds))).toBeVisible()
    await userEvent.click(hero.getByRole('button', { name: `Save forecast for Stockholm, ${forecastLabel(point.forecastAt, weather.timezoneOffsetSeconds)}` }))
    await screen.findByText('Forecast saved.')
    const save = fetch.mock.calls.find(([url, options]) => url === '/api/v1/preferences' && options.method === 'POST')!
    expect(JSON.parse(String(save[1].body))).toEqual({ location: weather.location, snapshot })
  })

  it('replaces previous weather with noninteractive skeletons during a fresh lookup', async () => {
    let resolveWeather!: (response: Response) => void
    let lookups = 0
    mockApi((url, options) => url.includes('/weather')
      ? ++lookups === 1 ? json(weather) : new Promise((resolve) => { resolveWeather = resolve })
      : defaults(url, options))
    render(<App />)
    await searchCity()
    await findForecastText('Overcast clouds')
    await selectPoint(1)
    await searchCity('Another city')
    expect(screen.queryByRole('region', { name: 'Selected forecast' })).not.toBeInTheDocument()
    const region = screen.getByRole('region', { name: 'Multi-day forecast' })
    expect(region).toHaveAttribute('aria-busy', 'true')
    expect(region.querySelectorAll('[aria-hidden="true"] button')).toHaveLength(0)
    await act(async () => { resolveWeather(json(weather)) })
    expect(await findForecastText('Overcast clouds')).toBeVisible()
    expect(within(screen.getByRole('list', { name: /forecast points/ })).getByRole('button', { pressed: true })).toHaveAccessibleName(/Overcast clouds/)
  })

  it('shows weather loading, prevents duplicate submission, and never invents a result', async () => {
    let resolveWeather!: (response: Response) => void
    mockApi((url) => url.includes('/weather') ? new Promise((resolve) => { resolveWeather = resolve }) : json(anonymous))
    render(<App />)
    await searchCity()
    expect(screen.getByText('Loading a fresh forecast…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Loading forecast...' })).toBeDisabled()
    expect(screen.getByRole('region', { name: 'Multi-day forecast' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText('12.4')).not.toBeInTheDocument()
    await act(async () => { resolveWeather(json(weather)) })
    expect(await findForecastText('Overcast clouds')).toBeVisible()
  })

  it('respects Retry-After without issuing automatic forecast requests', async () => {
    vi.useFakeTimers()
    const fetch = mockApi((url) => url.includes('/weather')
      ? new Response(JSON.stringify(errorBody('WEATHER_UNAVAILABLE', 'Forecast is unavailable.')), {
        status: 503, headers: { 'Content-Type': 'application/json', 'Retry-After': '3' },
      }) : json(anonymous))
    render(<App />)
    await act(async () => {
      fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Stockholm' } })
      fireEvent.click(screen.getByRole('button', { name: 'Show forecast' }))
    })
    expect(screen.getByRole('button', { name: 'Retry forecast (3s)' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Try again in 3s' })).toBeDisabled()
    act(() => { vi.advanceTimersByTime(2999) })
    expect(screen.getByRole('button', { name: 'Retry forecast (1s)' })).toBeDisabled()
    act(() => { vi.advanceTimersByTime(1) })
    expect(screen.getByRole('button', { name: 'Retry forecast' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Show forecast' })).toBeEnabled()
    expect(fetch.mock.calls.filter(([url]) => url.includes('/weather'))).toHaveLength(1)
  })

  it('retains a clearly marked previous forecast and can save its explicit snapshot during a provider outage', async () => {
    let lookup = 0
    const fetch = mockApi((url, options) => {
      if (url === '/api/v1/preferences' && options.method === 'POST') return json({ preference }, 201)
      return url.includes('/weather')
        ? json(++lookup === 1 ? weather : errorBody('WEATHER_TIMEOUT', 'Forecast is unavailable.'), lookup === 1 ? 200 : 504)
        : defaults(url, options)
    })
    render(<App />)
    await searchCity()
    await findForecastText('Overcast clouds')
    await searchCity('Another city')
    expect(await screen.findByText('Forecast is unavailable.')).toBeVisible()
    expect(screen.getByText('Previous forecast - not the latest lookup')).toBeVisible()
    expect(screen.getByRole('button', { name: saveName })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Retry forecast' })).toBeVisible()
    expect(screen.getByText(/No saved forecasts yet/)).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: saveName }))
    expect(await screen.findByRole('button', { name: savedName })).toBeDisabled()
    expect(lookup).toBe(2)
    expect(screen.getByText('Previous forecast - not the latest lookup')).toBeVisible()
    expect(screen.getByText('Forecast is unavailable.')).toBeVisible()
    const save = fetch.mock.calls.find(([url, options]) => url === '/api/v1/preferences' && options.method === 'POST')!
    expect(save[1].body).toBe(JSON.stringify({ location: weather.location, snapshot: preference.snapshot }))
  })

  it('explains no match without exposing diagnostic references', async () => {
    mockApi((url) => url.includes('/weather')
      ? json(errorBody('LOCATION_NOT_FOUND', 'No matching city.'), 404) : json(anonymous))
    render(<App />)
    await searchCity('Nowhere')
    expect(await screen.findByText(/Check the city spelling/)).toBeVisible()
    expect(screen.getByRole('alert')).toHaveFocus()
    expect(screen.queryByText('Reference: req_synthetic')).not.toBeInTheDocument()
    expect(screen.getByLabelText('City')).toHaveValue('Nowhere')
  })

  it('ignores an older saved-location lookup that completes after the latest one', async () => {
    const resolvers: ((response: Response) => void)[] = []
    mockApi((url) => {
      if (url === '/api/v1/auth/session') return json(signedIn)
      if (url === '/api/v1/preferences') return json({ preferences: [preference, { ...preference, id: 'pref_two', location: { ...weather.location, name: 'Second city', latitude: 60 } }] })
      return new Promise((resolve) => { resolvers.push(resolve) })
    })
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: /Open fresh forecast for Stockholm/ }))
    await userEvent.click(screen.getByRole('button', { name: /Open fresh forecast for Second city/ }))
    await act(async () => { resolvers[1](json({ ...weather, location: { ...weather.location, name: 'Newest' } })) })
    expect(await screen.findByRole('heading', { name: 'Newest, SE' })).toBeVisible()
    await act(async () => { resolvers[0](json(weather)) })
    expect(screen.queryByRole('heading', { name: 'Stockholm, SE', level: 2 })).not.toBeInTheDocument()
  })

  it('registers without automatic login, discards password, and uses rotated CSRF for saves after login', async () => {
    let loggedIn = false
    const fetch = mockApi((url, options) => {
      if (url.endsWith('/auth/session')) return json(loggedIn ? signedIn : anonymous)
      if (url.endsWith('/auth/register')) return json({ user: signedIn.user }, 201)
      if (url.endsWith('/auth/login')) { loggedIn = true; return json(signedIn) }
      if (url === '/api/v1/preferences' && options.method === 'POST') return json({ preference }, 201)
      if (url === '/api/v1/preferences') return json({ preferences: [] })
      return json(weather)
    })
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('link', { name: 'Register' }))
    await user.type(screen.getByLabelText('Email'), 'Reader@example.test')
    await user.type(screen.getByLabelText('Password'), '  synthetic-password  ')
    await user.click(screen.getByRole('button', { name: 'Register' }))
    expect(await screen.findByText('Account created. Log in with your email and password.')).toBeVisible()
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('/auth/login'))).toHaveLength(0)
    await user.type(screen.getByLabelText('Email'), 'reader@example.test')
    await user.type(screen.getByLabelText('Password'), '  synthetic-password  ')
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    await screen.findByText('Signed in')
    await searchCity()
    await user.click(await screen.findByRole('button', { name: saveName }))
    expect(await screen.findByRole('button', { name: savedName })).toBeDisabled()
    const save = fetch.mock.calls.find(([url, options]) => url === '/api/v1/preferences' && options.method === 'POST')!
    expect(save[1].headers).toMatchObject({ 'X-CSRF-Token': signedIn.csrfToken })
    expect(save[1].body).toBe(JSON.stringify({ location: weather.location, snapshot: preference.snapshot }))
    const registration = fetch.mock.calls.find(([url]) => url.endsWith('/auth/register'))!
    expect(JSON.parse(String(registration[1].body)).password).toBe('  synthetic-password  ')
  })

  it('saves different forecast times for the same city as distinct minimal snapshots', async () => {
    const secondPoint = weather.forecast[1]
    const secondSnapshot = {
      forecastAt: secondPoint.forecastAt, temperatureC: secondPoint.temperatureC, description: secondPoint.condition.description,
    }
    let saves = 0
    const fetch = mockApi((url, options) => {
      if (url === '/api/v1/preferences' && options.method === 'POST') {
        return json(++saves === 1 ? { preference } : {
          preference: { ...preference, id: 'pref_second', snapshot: secondSnapshot, createdAt: '2026-10-07T18:35:00.001Z' },
        }, 201)
      }
      return defaults(url, options)
    })
    render(<App />)
    await searchCity()
    await userEvent.click(await screen.findByRole('button', { name: saveName }))
    expect(await screen.findByRole('button', { name: savedName })).toBeDisabled()
    const secondName = `Save forecast for Stockholm, ${forecastLabel(secondPoint.forecastAt, weather.timezoneOffsetSeconds)}`
    await selectPoint(1)
    expect(screen.getByRole('button', { name: secondName })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: secondName }))
    expect(await screen.findByRole('button', { name: secondName.replace('Save forecast', 'Saved forecast') })).toBeDisabled()
    const savedRegion = within(screen.getByRole('region', { name: 'Saved forecasts' }))
    expect(savedRegion.getAllByText('Saved forecast snapshot')).toHaveLength(2)
    expect(savedRegion.getAllByText(/Forecast time:/)[0].querySelector('time')).toHaveAttribute('datetime', preference.snapshot.forecastAt)
    expect(savedRegion.getAllByText(/Forecast time:/).every((element) => element.textContent?.includes('UTC'))).toBe(true)
    expect(savedRegion.getAllByText(/Saved at/).every((element) => element.textContent?.includes('UTC'))).toBe(true)
    const bodies = fetch.mock.calls.filter(([url, options]) => url === '/api/v1/preferences' && options.method === 'POST')
      .map(([, options]) => JSON.parse(String(options.body)))
    expect(bodies).toEqual([
      { location: weather.location, snapshot: preference.snapshot },
      { location: weather.location, snapshot: secondSnapshot },
    ])
  })

  it('keeps a pending save tied to its point when another point is selected', async () => {
    let resolveSave!: (response: Response) => void
    mockApi((url, options) => url === '/api/v1/preferences' && options.method === 'POST'
      ? new Promise((resolve) => { resolveSave = resolve }) : defaults(url, options))
    render(<App />)
    await searchCity()
    await userEvent.click(await screen.findByRole('button', { name: saveName }))
    expect(screen.getByRole('button', { name: saveName })).toBeDisabled()
    expect(screen.queryByRole('button', { name: savedName })).not.toBeInTheDocument()
    await selectPoint(1)
    expect(screen.getByRole('button', {
      name: `Save forecast for Stockholm, ${forecastLabel(weather.forecast[1].forecastAt, weather.timezoneOffsetSeconds)}`,
    })).toBeEnabled()
    await act(async () => { resolveSave(json({ preference }, 201)) })
    expect(screen.getByRole('button', {
      name: `Save forecast for Stockholm, ${forecastLabel(weather.forecast[1].forecastAt, weather.timezoneOffsetSeconds)}`,
    })).toBeEnabled()
    await selectPoint(0)
    expect(await screen.findByRole('button', { name: savedName })).toBeDisabled()
  })

  it('reopens a past saved snapshot with a new backend request every time, without overwriting it', async () => {
    const past = {
      ...preference,
      snapshot: { forecastAt: '2020-01-01T00:00:00Z', temperatureC: -3, description: 'Stored winter snapshot' },
      createdAt: '2020-01-01T00:05:00Z',
    }
    let lookups = 0
    const fetch = mockApi((url, options) => {
      if (url === '/api/v1/preferences') return json({ preferences: [past] })
      if (url.includes('/weather')) return json({
        ...weather,
        forecast: [{
          ...weather.forecast[0], temperatureC: 20 + ++lookups,
          condition: { code: 'clear', description: `Fresh prediction ${lookups}` },
        }, ...weather.forecast.slice(1)],
      })
      return defaults(url, options)
    })
    render(<App />)
    const open = await screen.findByRole('button', { name: /Open fresh forecast for Stockholm/ })
    expect(lookups).toBe(0)
    await userEvent.click(open)
    expect(await findForecastText('Fresh prediction 1')).toBeVisible()
    expect(screen.getByRole('heading', { level: 2, name: 'Stockholm, SE' })).toHaveFocus()
    await userEvent.click(open)
    expect(await findForecastText('Fresh prediction 2')).toBeVisible()
    expect(lookups).toBe(2)
    const savedRegion = within(screen.getByRole('region', { name: 'Saved forecasts' }))
    expect(savedRegion.getByText('Stored winter snapshot')).toBeVisible()
    expect(savedRegion.getByText('-3 °C')).toBeVisible()
    expect(savedRegion.getByText(/Forecast time:/)).toHaveTextContent('2020')
    expect(savedRegion.queryByText('Fresh prediction 2')).not.toBeInTheDocument()
    expect(fetch.mock.calls.filter(([url]) => url.includes('/weather')).map(([url]) => url))
      .toEqual(Array(2).fill('/api/v1/weather?latitude=59.3293&longitude=18.0686'))
    expect(fetch.mock.calls.some(([, options]) => options.method === 'POST')).toBe(false)
  })

  it('keeps the saved snapshot and removal usable when reopening fails at the provider', async () => {
    let lookups = 0
    mockApi((url, options) => {
      if (url === '/api/v1/preferences') return json({ preferences: [preference] })
      if (url.includes('/weather')) return ++lookups === 1
        ? json(weather)
        : json(errorBody('WEATHER_UNAVAILABLE', 'Forecast is unavailable.'), 503)
      return defaults(url, options)
    })
    render(<App />)
    const open = await screen.findByRole('button', { name: /Open fresh forecast for Stockholm/ })
    await userEvent.click(open)
    await screen.findByRole('heading', { name: 'Forecast for the coming days' })
    await userEvent.click(open)
    expect(await screen.findByText('Forecast is unavailable.')).toBeVisible()
    expect(screen.getByText('Previous forecast - not the latest lookup')).toBeVisible()
    const savedRegion = within(screen.getByRole('region', { name: 'Saved forecasts' }))
    expect(savedRegion.getByText('Saved forecast snapshot')).toBeVisible()
    expect(savedRegion.getByText('Overcast clouds')).toBeVisible()
    expect(savedRegion.getByRole('button', { name: /Remove saved forecast/ })).toBeEnabled()
  })

  it('keeps credential failures generic and preserves values for retry', async () => {
    window.history.replaceState(null, '', '/login')
    mockApi((url) => url.endsWith('/auth/login')
      ? json(errorBody('INVALID_CREDENTIALS', 'Email or password is incorrect.'), 401) : json(anonymous))
    render(<App />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled())
    await userEvent.type(screen.getByLabelText('Email'), 'reader@example.test')
    await userEvent.type(screen.getByLabelText('Password'), 'synthetic-password')
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByText('Email or password is incorrect.')).toBeVisible()
    expect(screen.getByLabelText('Password')).toHaveValue('synthetic-password')
    expect(screen.getByRole('alert')).toHaveFocus()
  })

  it('clears private preferences on session expiry, retains public weather, and never replays the save', async () => {
    let bootstraps = 0
    const fetch = mockApi((url, options) => {
      if (url.endsWith('/auth/session')) return json(++bootstraps === 1 ? signedIn : anonymous)
      if (url === '/api/v1/preferences' && options.method === 'POST') return json(errorBody('UNAUTHENTICATED'), 401)
      if (url === '/api/v1/preferences') return json({ preferences: [{ ...preference, location: { ...preference.location, name: 'Private saved city', latitude: 60 } }] })
      return defaults(url, options)
    })
    render(<App />)
    await screen.findByRole('button', { name: /Open fresh forecast for Private saved city/ })
    await searchCity()
    await userEvent.click(await screen.findByRole('button', { name: saveName }))
    expect(await screen.findByText(/Your session expired/)).toBeVisible()
    await screen.findByRole('link', { name: 'Register' })
    expect(within(screen.getByRole('region', { name: 'Selected forecast' })).getByText('Overcast clouds')).toBeVisible()
    expect(screen.queryByRole('button', { name: saveName })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Open fresh forecast for Private saved city/ })).not.toBeInTheDocument()
    expect(fetch.mock.calls.filter(([url, options]) => url === '/api/v1/preferences' && options.method === 'POST')).toHaveLength(1)
  })

  it('refreshes a failed CSRF token but requires explicit mutation retry', async () => {
    let bootstraps = 0
    let saves = 0
    const fetch = mockApi((url, options) => {
      if (url.endsWith('/auth/session')) return json({ ...signedIn, csrfToken: ++bootstraps === 1 ? 'old-synthetic' : 'new-synthetic' })
      if (url === '/api/v1/preferences' && options.method === 'POST') return ++saves === 1 ? json(errorBody('CSRF_FAILED'), 403) : json({ preference }, 201)
      return defaults(url, options)
    })
    render(<App />)
    await searchCity()
    await userEvent.click(await screen.findByRole('button', { name: saveName }))
    expect(await screen.findByText(/Your security session needs refreshing/)).toBeVisible()
    await waitFor(() => expect(screen.getByRole('button', { name: saveName })).toBeEnabled())
    expect(saves).toBe(1)
    await userEvent.click(screen.getByRole('button', { name: saveName }))
    await screen.findByRole('button', { name: savedName })
    const calls = fetch.mock.calls.filter(([url, options]) => url === '/api/v1/preferences' && options.method === 'POST')
    expect(calls[1][1].headers).toMatchObject({ 'X-CSRF-Token': 'new-synthetic' })
  })

  it('preserves confirmed preferences while a deletion fails; removes only after success with sensible focus', async () => {
    let deletes = 0
    mockApi((url, options) => {
      if (options.method === 'DELETE') return ++deletes === 1 ? json(errorBody('SERVICE_UNAVAILABLE', 'Removal unavailable.'), 503) : json(undefined, 204)
      if (url === '/api/v1/preferences') return json({ preferences: [preference] })
      return defaults(url, options)
    })
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: /Remove saved forecast for Stockholm/ }))
    expect(await screen.findByText('Removal unavailable.')).toBeVisible()
    expect(screen.getByRole('button', { name: /Open fresh forecast for Stockholm/ })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: /Remove saved forecast for Stockholm/ }))
    expect(await screen.findByText('Saved forecast removed.')).toBeVisible()
    expect(screen.queryByRole('button', { name: /Open fresh forecast for Stockholm/ })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Saved forecasts' })).toHaveFocus()
  })

  it('shows failed preference loading as an error, never as an empty success', async () => {
    mockApi((url, options) => url === '/api/v1/preferences' ? json(errorBody('SERVICE_UNAVAILABLE'), 503) : defaults(url, options))
    render(<App />)
    expect(await screen.findByRole('button', { name: 'Reload saved forecasts' })).toBeVisible()
    expect(screen.queryByText(/No saved forecasts yet/)).not.toBeInTheDocument()
  })

  it('ignores a late private preference list after confirmed logout', async () => {
    let resolvePreferences!: (response: Response) => void
    let revoked = false
    mockApi((url) => {
      if (url.endsWith('/auth/session')) return json(revoked ? anonymous : signedIn)
      if (url.endsWith('/auth/logout')) { revoked = true; return json(undefined, 204) }
      return new Promise((resolve) => { resolvePreferences = resolve })
    })
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Log out' }))
    await screen.findByRole('link', { name: 'Register' })
    await act(async () => { resolvePreferences(json({ preferences: [preference] })) })
    expect(screen.queryByRole('button', { name: /Open fresh forecast for Stockholm/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remove saved forecast for Stockholm/ })).not.toBeInTheDocument()
  })

  it('does not claim logout success after failure; retries revocation then bootstraps before further mutations', async () => {
    let attempts = 0
    let revoked = false
    mockApi((url, options) => {
      if (url.endsWith('/auth/session')) return json(revoked ? anonymous : signedIn)
      if (url.endsWith('/auth/logout')) {
        if (++attempts === 1) return json(errorBody('SERVICE_UNAVAILABLE', 'Service unavailable.'), 503)
        revoked = true
        return json(undefined, 204)
      }
      return defaults(url, options)
    })
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Log out' }))
    expect(await screen.findByText('Logout did not complete. Service unavailable.')).toBeVisible()
    expect(screen.getByText('Signed in')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Retry logout' }))
    expect(await screen.findByText('You are signed out.')).toBeVisible()
    expect(await screen.findByRole('link', { name: 'Register' })).toBeVisible()
  })

  it('uses real routes, supports popstate and focuses the main heading', async () => {
    mockApi()
    render(<App />)
    await userEvent.click(await screen.findByRole('link', { name: 'Register' }))
    expect(window.location.pathname).toBe('/register')
    expect(screen.getByRole('heading', { level: 1, name: 'Create your account' })).toHaveFocus()
    window.history.replaceState(null, '', '/login/')
    fireEvent.popState(window)
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back' })).toHaveFocus()
    expect(within(screen.getByRole('main')).getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password')
  })

  it('shows one password message and integrates the visibility control without changing spaces', async () => {
    window.history.replaceState(null, '', '/register')
    const fetch = mockApi()
    render(<App />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Register' })).toBeEnabled())
    const password = screen.getByLabelText('Password')
    expect(password).toHaveAccessibleDescription('Use 12-128 characters. Spaces are preserved.')
    await userEvent.type(screen.getByLabelText('Email'), 'reader@example.test')
    await userEvent.type(password, '  short  ')
    await userEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(password).toHaveFocus()
    expect(password).toHaveAccessibleDescription('Use 12-128 characters.')
    expect(screen.queryByText('Use 12-128 characters. Spaces are preserved.')).not.toBeInTheDocument()
    expect(screen.getAllByText('Use 12-128 characters.')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password).toHaveAttribute('type', 'text')
    expect(password).toHaveValue('  short  ')
    await userEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(password).toHaveAttribute('type', 'password')
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/auth/register'))).toBe(false)
  })
})

describe('Unicode credential bounds', () => {
  it('counts code points, not UTF-16 units, and never normalizes spaces', () => {
    expect(validateCredentials('reader@example.test', '🌦'.repeat(12)).password).toBe('')
    expect(validateCredentials('reader@example.test', '🌦'.repeat(11)).password).not.toBe('')
    expect(validateCredentials('reader@example.test', 'x'.repeat(128)).password).toBe('')
    expect(validateCredentials('reader@example.test', 'x'.repeat(129)).password).not.toBe('')
    expect(validateCredentials('reader@example.test', ' '.repeat(12)).password).toBe('')
  })
})
