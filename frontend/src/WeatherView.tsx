import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { api, asApiError, type ApiError, type AuthState, type ForecastPoint, type ForecastResponse, type Preference } from './api'
import { Card, ErrorMessage, Field, ForecastSummary, LocationName, SavedSkeleton, WeatherArtwork, WeatherIcon, WeatherSkeleton, displayTemperature, useRetryDelay } from './components'
import { forecastLabel, selectionKey, utcTimestamp } from './forecast'

export function WeatherView({ session, sessionLoading, onFailure, loginLink }: {
  session: AuthState | null
  sessionLoading: boolean
  onFailure: (error: ApiError) => void
  loginLink: ReactNode
}) {
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [fields, setFields] = useState({ city: '', country: '' })
  const [submitted, setSubmitted] = useState(false)
  const [weather, setWeather] = useState<ForecastResponse | null>(null)
  const [weatherError, setWeatherError] = useState<ApiError | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [previous, setPrevious] = useState(false)
  const [lastQuery, setLastQuery] = useState<Parameters<typeof api.weather>[0] | null>(null)
  const search = useRef<AbortController | null>(null)
  const searchVersion = useRef(0)
  const forecastHeading = useRef<HTMLHeadingElement>(null)
  const focusOnResult = useRef(false)

  const [preferences, setPreferences] = useState<Preference[]>([])
  const [preferenceOwner, setPreferenceOwner] = useState<string | null>(null)
  const [preferenceLoading, setPreferenceLoading] = useState(false)
  const [preferenceError, setPreferenceError] = useState<ApiError | null>(null)
  const [preferenceReady, setPreferenceReady] = useState(false)
  const [saving, setSaving] = useState<string[]>([])
  const [removing, setRemoving] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const [saveError, setSaveError] = useState<ApiError | null>(null)
  const preferenceVersion = useRef(0)
  const currentSession = useRef(session)
  const savedHeading = useRef<HTMLHeadingElement>(null)
  const userId = session?.user?.id ?? null
  const retrySeconds = useRetryDelay(weatherError)

  useEffect(() => {
    currentSession.current = session
  }, [session])

  useEffect(() => {
    setSaving([])
    setRemoving([])
  }, [session?.csrfToken])

  const loadPreferences = useCallback(async () => {
    if (!userId) return
    const version = ++preferenceVersion.current
    setPreferenceLoading(true)
    setPreferenceError(null)
    try {
      const result = await api.preferences()
      if (version !== preferenceVersion.current) return
      setPreferences(result.preferences)
      setPreferenceOwner(userId)
      setPreferenceReady(true)
    } catch (failure) {
      if (version !== preferenceVersion.current) return
      const next = asApiError(failure)
      setPreferenceError(next)
      onFailure(next)
    } finally {
      if (version === preferenceVersion.current) setPreferenceLoading(false)
    }
  }, [userId, onFailure])

  useEffect(() => {
    const counter = preferenceVersion
    setPreferences([])
    setPreferenceOwner(null)
    setPreferenceReady(false)
    setPreferenceLoading(false)
    setPreferenceError(null)
    setSaveError(null)
    setSaving([])
    setRemoving([])
    setNotice('')
    void loadPreferences()
    return () => { counter.current++ }
  }, [loadPreferences])

  useEffect(() => () => {
    search.current?.abort()
    searchVersion.current++
  }, [])

  useEffect(() => {
    if (focusOnResult.current) {
      forecastHeading.current?.focus()
      focusOnResult.current = false
    }
  }, [weather])

  async function lookup(query: Parameters<typeof api.weather>[0], focusResult = false) {
    if (retrySeconds) return
    search.current?.abort()
    const controller = new AbortController()
    search.current = controller
    const version = ++searchVersion.current
    focusOnResult.current = focusResult
    setLastQuery(query)
    setWeatherLoading(true)
    setWeatherError(null)
    setPrevious(true)
    setSaveError(null)
    try {
      const result = await api.weather(query, controller.signal)
      if (version !== searchVersion.current) return
      setWeather(result)
      setPrevious(false)
    } catch (failure) {
      if (version !== searchVersion.current || controller.signal.aborted) return
      const next = asApiError(failure)
      setWeatherError(next)
      onFailure(next)
    } finally {
      if (version === searchVersion.current) setWeatherLoading(false)
    }
  }

  function validateSearch(nextCity: string, nextCountry: string) {
    return {
      city: [...nextCity.trim()].length < 1 || [...nextCity.trim()].length > 100 ? 'Enter a city name of 1-100 characters.' : '',
      country: nextCountry.trim() && !/^[a-zA-Z]{2}$/.test(nextCountry.trim()) ? 'Enter a two-letter country code or leave it empty.' : '',
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    const invalid = validateSearch(city, country)
    setFields(invalid)
    if (invalid.city || invalid.country) {
      document.getElementById(invalid.city ? 'city' : 'country')?.focus()
      return
    }
    void lookup({ q: city.trim(), ...(country.trim() ? { countryCode: country.trim().toUpperCase() } : {}) })
  }

  function sameSession(snapshot: AuthState) {
    return currentSession.current?.user?.id === snapshot.user?.id
      && currentSession.current?.csrfToken === snapshot.csrfToken
  }

  async function save(point: ForecastPoint) {
    if (!session?.user || !weather || sessionLoading || weatherLoading || !preferenceReady || preferenceLoading) return
    const key = selectionKey(weather.location, point.forecastAt)
    if (saving.includes(key)) return
    const snapshot = session
    setSaving((keys) => [...keys, key])
    setSaveError(null)
    setNotice('')
    try {
      const { preference } = await api.save(weather.location, {
        forecastAt: point.forecastAt,
        temperatureC: point.temperatureC,
        description: point.condition.description,
      }, snapshot.csrfToken)
      if (!sameSession(snapshot)) return
      preferenceVersion.current++
      setPreferenceLoading(false)
      setPreferences((items) => [...items.filter((item) => item.id !== preference.id), preference]
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)))
      setNotice('Forecast saved.')
    } catch (failure) {
      if (!sameSession(snapshot)) return
      const next = asApiError(failure)
      setSaveError(next)
      onFailure(next)
    } finally {
      if (sameSession(snapshot)) setSaving((keys) => keys.filter((value) => value !== key))
    }
  }

  async function remove(id: string) {
    if (!session?.user || removing.includes(id) || sessionLoading) return
    const snapshot = session
    setRemoving((ids) => [...ids, id])
    setPreferenceError(null)
    setNotice('')
    try {
      await api.remove(id, snapshot.csrfToken)
      if (!sameSession(snapshot)) return
      preferenceVersion.current++
      setPreferenceLoading(false)
      setPreferences((items) => items.filter((item) => item.id !== id))
      setNotice('Saved forecast removed.')
      savedHeading.current?.focus()
    } catch (failure) {
      if (!sameSession(snapshot)) return
      const next = asApiError(failure)
      setPreferenceError(next)
      onFailure(next)
    } finally {
      if (sameSession(snapshot)) setRemoving((ids) => ids.filter((value) => value !== id))
    }
  }

  const visiblePreferences = preferenceOwner === userId && userId ? preferences : []
  const savedKeys = new Set(visiblePreferences.map(({ location, snapshot }) => selectionKey(location, snapshot.forecastAt)))

  return (
    <>
      <Card className="my-5 space-y-3">
        <h2 className="text-lg">Find a city forecast</h2>
        <form className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]" onSubmit={submit} noValidate>
          <Field id="city" label="City" placeholder="Stockholm" required value={city} error={fields.city}
            onChange={(event) => {
              setCity(event.target.value)
              if (submitted) setFields(validateSearch(event.target.value, country))
            }} />
          <Field id="country" label="Country code (optional)" hint="Two letters, for example SE." value={country} error={fields.country}
            onChange={(event) => {
              setCountry(event.target.value)
              if (submitted) setFields(validateSearch(city, event.target.value))
            }} />
          <button className="self-start sm:col-span-2 lg:col-span-1 lg:mt-8" type="submit" disabled={weatherLoading || retrySeconds > 0}>
            {weatherLoading ? 'Loading forecast...' : retrySeconds ? `Try again in ${retrySeconds}s` : 'Show forecast'}
          </button>
        </form>
      </Card>
      <div className="space-y-5">
        <p className="sr-only" role="status">{saving.length ? 'Saving...' : removing.length ? 'Removing...' : ''}</p>
        <section className="min-w-0" aria-label="Multi-day forecast" aria-busy={weatherLoading}>
          <p className="sr-only" role="status">{weatherLoading ? 'Loading a fresh forecast…' : ''}</p>
          <ErrorMessage error={weatherError} />
          {weatherError && lastQuery && <button className="secondary mb-6" disabled={weatherLoading || retrySeconds > 0} onClick={() => { void lookup(lastQuery) }}>
            Retry forecast{retrySeconds ? ` (${retrySeconds}s)` : ''}
          </button>}
          {weatherLoading ? <WeatherSkeleton weather={weather} /> : weather ? (
            <ForecastSummary weather={weather} previous={previous} headingRef={forecastHeading} actionError={saveError} renderAction={(point) => {
              if (sessionLoading) return <p className="text-sm text-muted">Account actions are unavailable while your session is being checked.</p>
              if (!session?.user) return <p className="text-sm text-muted">{loginLink} to save this forecast.</p>
              const key = selectionKey(weather.location, point.forecastAt)
              const saved = savedKeys.has(key)
              const pending = saving.includes(key)
              return <button className="w-full" disabled={saved || pending || !preferenceReady || preferenceLoading}
                aria-label={`${saved ? 'Saved forecast' : 'Save forecast'} for ${weather.location.name}, ${forecastLabel(point.forecastAt, weather.timezoneOffsetSeconds)}`}
                onClick={() => { void save(point) }}>
                {saved ? 'Saved' : pending ? 'Saving...' : 'Save forecast'}
              </button>
            }} />
          ) : (
            <Card className="flex items-center gap-3 bg-gradient-to-br from-blue-100 via-sky-50 to-blue-50 sm:gap-6">
              <WeatherArtwork className="w-20 shrink-0 sm:w-44" />
              <div className="space-y-2">
                <p className="text-xs font-semibold tracking-widest text-primary">A LOOK AHEAD</p>
                <h2 className="text-lg sm:text-2xl">The coming days, at a glance</h2>
                <p className="max-w-lg text-sm text-muted">Search for a city to see its five-day / three-hour forecast in Celsius.</p>
              </div>
            </Card>
          )}
          <p className="mt-2 text-xs text-muted">Forecast data by <a href="https://openweathermap.org/" rel="noreferrer">OpenWeather</a>. Free five-day / three-hour forecast.</p>
        </section>
        <section className="min-w-0" aria-labelledby="saved-heading" aria-busy={preferenceLoading || sessionLoading}>
          <div className="rounded-3xl bg-blue-100/50 p-5 sm:p-6">
            <h2 className="text-xl" id="saved-heading" tabIndex={-1} ref={savedHeading}>Saved forecasts</h2>
            <p className="mt-2 text-sm text-muted">Your saved moments, kept separately from fresh forecasts.</p>
            <p className={notice ? 'message success' : ''} role="status">{notice}</p>
            {sessionLoading && <p className="mt-4 text-sm text-muted">Saved forecasts are unavailable until your session is ready.</p>}
            {!sessionLoading && !session?.user && <p className="mt-4 text-muted">{loginLink} to save a specific forecast point and find it here next time.</p>}
            {session?.user && (
              <>
                <ErrorMessage error={preferenceError} />
                {preferenceError && <button className="secondary" disabled={preferenceLoading} onClick={() => { void loadPreferences() }}>Reload saved forecasts</button>}
                <p className="sr-only" role="status">{preferenceLoading ? 'Loading saved forecasts…' : ''}</p>
                {preferenceLoading && <div className="mt-4"><SavedSkeleton /></div>}
                {preferenceReady && !preferenceLoading && !preferenceError && !visiblePreferences.length && <p className="mt-4 rounded-2xl bg-tint p-4 text-muted">No saved forecasts yet. Save a forecast point to see it here. <a href="#city">Search for a city</a></p>}
                <ul className="mt-4 grid gap-3 md:grid-cols-2">
                  {!preferenceLoading && visiblePreferences.map((preference) => (
                    <li key={preference.id} className="flex min-w-0 flex-col gap-3 rounded-2xl bg-gradient-to-br from-white to-blue-50 p-4 shadow-surface">
                      <div className="min-w-0 space-y-2">
                        <p className="w-fit rounded-full bg-tint px-3 py-1 text-xs font-semibold text-primary">Saved forecast snapshot</p>
                        <h3><LocationName location={preference.location} /></h3>
                        <p className="text-xs text-muted">Forecast time: <time dateTime={preference.snapshot.forecastAt}>{utcTimestamp(preference.snapshot.forecastAt)}</time></p>
                        <div className="flex items-center gap-3">
                          <WeatherIcon code="cloudy" className="h-10 w-10 shrink-0 rounded-xl bg-tint p-2 text-primary" />
                          <div className="min-w-0">
                            <p className="text-2xl font-semibold tabular-nums">{displayTemperature(preference.snapshot.temperatureC)} °C</p>
                            <p className="text-sm">{preference.snapshot.description}</p>
                          </div>
                        </div>
                        <p className="text-xs text-muted">Saved at <time dateTime={preference.createdAt}>{utcTimestamp(preference.createdAt)}</time></p>
                      </div>
                      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-divider pt-3">
                      <button className="secondary" disabled={retrySeconds > 0} aria-label={`Open fresh forecast for ${preference.location.name}, saved ${utcTimestamp(preference.snapshot.forecastAt)}`} onClick={() => {
                        void lookup({ latitude: preference.location.latitude, longitude: preference.location.longitude }, true)
                      }}>
                        Open fresh forecast
                      </button>
                      <button className="destructive" disabled={removing.includes(preference.id) || sessionLoading}
                        aria-label={`Remove saved forecast for ${preference.location.name}, ${utcTimestamp(preference.snapshot.forecastAt)}`}
                        onClick={() => { void remove(preference.id) }}>
                        {removing.includes(preference.id) ? 'Removing...' : 'Remove'}
                      </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>
      </div>
    </>
  )
}
