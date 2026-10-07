import { useEffect, useRef, type InputHTMLAttributes, type ReactNode, type Ref } from 'react'
import type { ApiError, ForecastPoint, ForecastResponse, Location } from './api'
import { forecastTime, groupForecast, utcOffsetLabel, utcTimestamp } from './forecast'

export function ErrorMessage({ error }: { error: ApiError | null }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (error) ref.current?.focus() }, [error])
  if (!error) return null
  return (
    <div className="message error" role="alert" tabIndex={-1} ref={ref}>
      <p>{error.message}</p>
      {error.code === 'LOCATION_NOT_FOUND' && <p>Check the city spelling or add a country code.</p>}
      {error.retryAfter !== undefined && <p>Wait {error.retryAfter} seconds before trying again.</p>}
      {error.requestId && <p className="supporting">Reference: {error.requestId}</p>}
    </div>
  )
}

export function Field({
  label, error, hint, id, ...props
}: InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; error?: string; hint?: string }) {
  const description = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ')
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint && <p id={`${id}-hint`} className="supporting">{hint}</p>}
      <input {...props} id={id} aria-invalid={!!error} aria-describedby={description || undefined} />
      {error && <p id={`${id}-error`} className="field-error">{error}</p>}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>
}

export function LocationName({ location }: { location: Location }) {
  return <>{location.name}{location.countryCode ? `, ${location.countryCode}` : ''}</>
}

const icons: Record<ForecastPoint['condition']['code'], ReactNode> = {
  clear: <><circle cx="24" cy="24" r="9" /><path d="M24 3v5m0 32v5M3 24h5m32 0h5M9 9l4 4m22 22 4 4M9 39l4-4m22-22 4-4" /></>,
  cloudy: <path d="M12 36a9 9 0 0 1-1-18 13 13 0 0 1 25 1 9 9 0 0 1 0 17Z" />,
  rain: <><path d="M12 29a8 8 0 0 1 0-16 12 12 0 0 1 23 2 7 7 0 0 1 0 14Z" /><path d="m15 35-3 7m13-7-3 7m13-7-3 7" /></>,
  drizzle: <><path d="M12 29a8 8 0 0 1 0-16 12 12 0 0 1 23 2 7 7 0 0 1 0 14Z" /><path d="M15 37v2m10-2v2m10-2v2" /></>,
  thunderstorm: <><path d="M12 29a8 8 0 0 1 0-16 12 12 0 0 1 23 2 7 7 0 0 1 0 14Z" /><path d="m26 25-9 12h8l-4 9 12-15h-9l5-6" /></>,
  snow: <><path d="M24 5v38M8 14l32 20M8 34l32-20M17 9l7 7 7-7m-14 30 7-7 7 7M9 23l10-3-2-10m14 28-2-10 10-3M9 25l10 3-2 10m14-28-2 10 10 3" /></>,
  mist: <path d="M6 13h36M10 24h28M6 35h36" />,
  other: <><circle cx="24" cy="24" r="18" /><path d="M24 15v12m0 6v1" /></>,
}

export function ForecastSummary({ weather, previous, renderAction, headingRef }: {
  weather: ForecastResponse
  previous: boolean
  renderAction: (point: ForecastPoint) => ReactNode
  headingRef: Ref<HTMLHeadingElement>
}) {
  return (
    <Card className="weather-card">
      {previous && <p className="previous">Previous forecast - not the latest lookup</p>}
      <h2 tabIndex={-1} ref={headingRef}><LocationName location={weather.location} /></h2>
      <p className="supporting">Coordinates: {weather.location.latitude}, {weather.location.longitude}</p>
      <p className="supporting">Retrieved at <time dateTime={weather.fetchedAt}>{utcTimestamp(weather.fetchedAt)}</time></p>
      <h3>Forecast for the coming days</h3>
      <p className="supporting">City time: {utcOffsetLabel(weather.timezoneOffsetSeconds)} (fixed offset). Available three-hour predictions; the first and last days may be partial.</p>
      <div className="forecast-days">
        {groupForecast(weather).map((day) => (
          <section className="forecast-day" key={day.date} aria-labelledby={`day-${day.date}`}>
            <h4 id={`day-${day.date}`}>{day.label}</h4>
            <p className="supporting">{day.points.length < 8 ? 'Partial day - available times' : 'Three-hour forecast times'}</p>
            <ul className="forecast-rows">
              {day.points.map((point) => (
                <li key={point.forecastAt}>
                  <div className="forecast-measurement">
                    <time dateTime={point.forecastAt}>{forecastTime(point.forecastAt, weather.timezoneOffsetSeconds)}</time>
                    <span className="forecast-temperature">{point.temperatureC} °C</span>
                  </div>
                  <div className="condition">
                    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {icons[point.condition.code]}
                    </svg>
                    <p>{point.condition.description}</p>
                  </div>
                  {renderAction(point)}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  )
}
