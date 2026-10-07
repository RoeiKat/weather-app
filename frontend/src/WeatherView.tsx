import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { api, asApiError, type ApiError, type AuthState, type ForecastPoint, type ForecastResponse, type Preference } from './api'
import { Card, ErrorMessage, Field, ForecastSummary, LocationName } from './components'
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
      <Card className="search-card">
        <h2>Find a city forecast</h2>
        <form className="search-form" onSubmit={submit} noValidate>
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
          <button type="submit" disabled={weatherLoading}>Show forecast{weatherLoading ? ' — loading' : ''}</button>
        </form>
      </Card>
      <div className="dashboard">
        <section className="weather-area" aria-label="Multi-day forecast" aria-busy={weatherLoading}>
          <p role="status">{weatherLoading ? 'Loading a fresh forecast…' : ''}</p>
          <ErrorMessage error={weatherError} />
          {weatherError && lastQuery && <button className="secondary" disabled={weatherLoading} onClick={() => { void lookup(lastQuery) }}>Retry forecast</button>}
          <ErrorMessage error={saveError} />
          {weather && sessionLoading && <p role="status">Checking your session…</p>}
          {weather ? (
            <ForecastSummary weather={weather} previous={previous} headingRef={forecastHeading} renderAction={(point) => {
              if (sessionLoading) return null
              if (!session?.user) return <p className="supporting">{loginLink} to save this forecast.</p>
              const key = selectionKey(weather.location, point.forecastAt)
              const saved = savedKeys.has(key)
              const pending = saving.includes(key)
              return <button disabled={saved || pending || weatherLoading || !preferenceReady || preferenceLoading}
                aria-label={`${saved ? 'Saved forecast' : 'Save forecast'} for ${weather.location.name}, ${forecastLabel(point.forecastAt, weather.timezoneOffsetSeconds)}`}
                onClick={() => { void save(point) }}>
                {saved ? 'Saved' : pending ? 'Save forecast — saving' : 'Save forecast'}
              </button>
            }} />
          ) : (
            <Card className="weather-placeholder">
              <h2>{weatherLoading ? 'Finding your forecast' : 'The coming days, at a glance'}</h2>
              <p>{weatherLoading ? 'Please wait for your lookup to complete.' : 'Search for a city to see its five-day / three-hour forecast in Celsius.'}</p>
            </Card>
          )}
          <p className="supporting attribution">Forecast data by <a href="https://openweathermap.org/" rel="noreferrer">OpenWeather</a>. Free five-day / three-hour forecast.</p>
        </section>
        <section className="saved-area" aria-labelledby="saved-heading" aria-busy={preferenceLoading}>
          <Card>
            <h2 id="saved-heading" tabIndex={-1} ref={savedHeading}>Saved forecasts</h2>
            <p role="status">{notice}</p>
            {sessionLoading && <p role="status">Checking your session…</p>}
            {!sessionLoading && !session?.user && <p>{loginLink} to save a specific forecast point and find it here next time.</p>}
            {session?.user && (
              <>
                <ErrorMessage error={preferenceError} />
                {preferenceError && <button className="secondary" disabled={preferenceLoading} onClick={() => { void loadPreferences() }}>Reload saved forecasts</button>}
                {preferenceLoading && <p role="status">Loading saved forecasts…</p>}
                {preferenceReady && !preferenceLoading && !visiblePreferences.length && <p>No saved forecasts yet. Search for a city, then select Save forecast beside a time.</p>}
                <ul className="saved-list">
                  {visiblePreferences.map((preference) => (
                    <li key={preference.id}>
                      <h3><LocationName location={preference.location} /></h3>
                      <p className="supporting">Coordinates: {preference.location.latitude}, {preference.location.longitude}</p>
                      <p><strong>Saved forecast snapshot</strong></p>
                      <p>Forecast time: <time dateTime={preference.snapshot.forecastAt}>{utcTimestamp(preference.snapshot.forecastAt)}</time></p>
                      <p className="snapshot-temperature">{preference.snapshot.temperatureC} °C</p>
                      <p>{preference.snapshot.description}</p>
                      <p className="supporting">Saved at <time dateTime={preference.createdAt}>{utcTimestamp(preference.createdAt)}</time></p>
                      <button className="secondary" aria-label={`Open fresh forecast for ${preference.location.name}, saved ${utcTimestamp(preference.snapshot.forecastAt)}`} onClick={() => {
                        void lookup({ latitude: preference.location.latitude, longitude: preference.location.longitude }, true)
                      }}>
                        Open fresh forecast
                      </button>
                      <button className="destructive" disabled={removing.includes(preference.id) || sessionLoading}
                        aria-label={`Remove saved forecast for ${preference.location.name}, ${utcTimestamp(preference.snapshot.forecastAt)}`}
                        onClick={() => { void remove(preference.id) }}>
                        Remove{removing.includes(preference.id) ? ' — removing' : ''}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </section>
      </div>
    </>
  )
}
