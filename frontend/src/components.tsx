import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode, type Ref } from 'react'
import type { ApiError, ForecastPoint, ForecastResponse, Location } from './api'
import { forecastDayShort, forecastLabel, forecastTime, groupForecast, utcOffsetLabel, utcTimestamp } from './forecast'

export function ErrorMessage({ error, message }: { error: ApiError | null; message?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (error && !error.fields.length) ref.current?.focus() }, [error])
  if (!error) return null
  return (
    <div className="message bg-danger-tint text-danger" role="alert" tabIndex={-1} ref={ref}>
      <p>{message ?? error.message}</p>
      {error.code === 'LOCATION_NOT_FOUND' && <p>Check the city spelling or add a country code.</p>}
      {error.retryAfter !== undefined && <p>Wait {error.retryAfter} seconds before trying again.</p>}
    </div>
  )
}

export function Field({
  label, error, hint, id, control, ...props
}: InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; error?: string; hint?: string; control?: ReactNode }) {
  const description = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className="font-semibold">{label}</label>
      <div className="relative">
        <input {...props} className={control ? 'pr-16' : undefined} id={id} aria-invalid={!!error} aria-describedby={description} />
        {control}
      </div>
      {hint && !error && <p id={`${id}-hint`} className="text-xs leading-5 text-muted">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-sm text-danger">{error}</p>}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`min-w-0 rounded-3xl bg-surface p-5 shadow-surface sm:p-6 ${className}`}>{children}</div>
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

export function WeatherIcon({ code, className = '' }: { code: ForecastPoint['condition']['code']; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true" focusable="false" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {icons[code] ?? icons.other}
    </svg>
  )
}

export function WeatherArtwork({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 280 210" fill="none" aria-hidden="true" focusable="false">
      <circle cx="145" cy="100" r="90" fill="#DBEAFE" />
      <circle cx="179" cy="71" r="35" fill="#FBBF24" />
      <path d="M179 20V9m0 124v-11m51-51h11m-124 0h11m15-36-8-8m80 80 8 8m-80-8-8 8m80-80 8-8" stroke="#FBBF24" strokeWidth="5" strokeLinecap="round" />
      <path d="M71 151a29 29 0 0 1-3-58 42 42 0 0 1 81-6 33 33 0 1 1 15 64Z" fill="white" stroke="#93C5FD" strokeWidth="3" />
      <path d="M59 174h106m-83 14h60" stroke="#93C5FD" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`rounded-2xl bg-skeleton motion-safe:animate-pulse motion-reduce:animate-none ${className}`} />
}

const weatherLayout = 'grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]'

export function WeatherSkeleton({ weather }: { weather: ForecastResponse | null }) {
  const pointCount = weather ? groupForecast(weather)[0].points.length : 4
  return (
    <div className={weatherLayout} aria-hidden="true">
      <Card className="space-y-4">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-5 w-full" />
      </Card>
      <Card className="space-y-4">
        <Skeleton className="h-7 w-3/4" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-6 w-2/3" />
        <div className="flex max-w-full gap-2 overflow-x-auto p-1 pb-3">
          {Array.from({ length: pointCount }, (_, point) => <Skeleton key={point} className="h-40 w-24 shrink-0" />)}
        </div>
      </Card>
    </div>
  )
}

export function SavedSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2" aria-hidden="true">
      {[0, 1].map((row) => (
        <div key={row} className="space-y-3 rounded-2xl bg-tint p-4">
          <div className="w-full space-y-3">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/4" />
          </div>
          <Skeleton className="h-11 w-full" />
        </div>
      ))}
    </div>
  )
}

export function ForecastSummary({ weather, previous, renderAction, actionError, headingRef }: {
  weather: ForecastResponse
  previous: boolean
  renderAction: (point: ForecastPoint) => ReactNode
  actionError: ApiError | null
  headingRef: Ref<HTMLHeadingElement>
}) {
  const [selection, setSelection] = useState<{ weather: ForecastResponse; point: ForecastPoint } | null>(null)
  const selected = selection?.weather === weather ? selection.point : weather.forecast[0]
  const offset = weather.timezoneOffsetSeconds
  const days = groupForecast(weather)
  const day = days.find((item) => item.points.some((point) => point.forecastAt === selected.forecastAt))!

  return (
    <div className={weatherLayout}>
      <section aria-label="Selected forecast" className="min-w-0">
        <Card className="space-y-4 bg-gradient-to-br from-white to-blue-100">
          {previous && <p className="rounded-2xl bg-tint p-3 font-semibold">Previous forecast - not the latest lookup</p>}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-primary">YOUR CITY FORECAST</p>
            <h2 className="text-2xl sm:text-3xl" tabIndex={-1} ref={headingRef}><LocationName location={weather.location} /></h2>
            <p className="text-xs text-muted">Coordinates: {weather.location.latitude}, {weather.location.longitude}</p>
          </div>
          <p className="text-sm text-muted">Forecast for <time dateTime={selected.forecastAt}>{forecastLabel(selected.forecastAt, offset)}</time></p>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
            <p className="flex flex-wrap items-baseline gap-2 font-semibold tabular-nums">
              <span className="text-6xl leading-none tracking-tight">{displayTemperature(selected.temperatureC)}</span>
              <span className="text-3xl">°C</span>
            </p>
            <p className="mt-2 text-lg">{selected.condition.description}</p>
            </div>
            <WeatherIcon code={selected.condition.code} className="h-24 w-24 shrink-0 text-primary sm:h-28 sm:w-28" />
          </div>
          <div className="space-y-3">
            {renderAction(selected)}
            <ErrorMessage error={actionError} />
          </div>
          <p className="text-xs text-muted">Retrieved at <time dateTime={weather.fetchedAt}>{utcTimestamp(weather.fetchedAt)}</time></p>
        </Card>
      </section>
      <section aria-labelledby="coming-days" className="min-w-0">
        <Card>
          <h3 id="coming-days" className="text-xl">Forecast for the coming days</h3>
          <p className="mt-1 text-xs text-muted">Three-hour forecast · City time: {utcOffsetLabel(offset)} (fixed offset).</p>
          <div className="mt-4 flex gap-2 overflow-x-auto p-1 pb-3" role="group" aria-label="Forecast days">
            {days.map((item) => (
              <button key={item.date} type="button" aria-pressed={item.date === day.date} aria-label={item.label}
                className={item.date === day.date
                  ? 'shrink-0 rounded-xl px-3 py-2 shadow-selected'
                  : 'shrink-0 rounded-xl border-transparent bg-tint px-3 py-2 text-ink hover:border-blue-200 hover:bg-blue-100'}
                onClick={(event) => {
                  setSelection({ weather, point: item.points[0] })
                  event.currentTarget.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
                }}>
                {forecastDayShort(item.points[0].forecastAt, offset)}
              </button>
            ))}
          </div>
          <section aria-labelledby="selected-day-heading" className="mt-2 min-w-0">
                <h4 id="selected-day-heading">{day.label}</h4>
                <p className="mt-1 text-xs text-muted">{day.points.length < 8 ? 'Partial day - available times' : 'Three-hour forecast times'}: {forecastTime(day.points[0].forecastAt, offset)} to {forecastTime(day.points.at(-1)!.forecastAt, offset)}</p>
                <ul className="forecast-rows mt-3 flex max-w-full items-stretch gap-2 overflow-x-auto p-1 pb-3" aria-label={`${day.label} forecast points`}>
              {day.points.map((point) => (
                <li key={point.forecastAt} className="flex w-24 shrink-0">
                  <button type="button" aria-pressed={selected.forecastAt === point.forecastAt}
                    aria-label={`${forecastLabel(point.forecastAt, offset)}, ${displayTemperature(point.temperatureC)} °C, ${point.condition.description}`}
                    className={selected.forecastAt === point.forecastAt
                      ? 'flex min-h-40 w-24 flex-col items-center gap-2 rounded-2xl border-primary bg-primary px-2 py-3 text-white shadow-selected'
                      : 'flex min-h-40 w-24 flex-col items-center gap-2 rounded-2xl border-transparent bg-tint px-2 py-3 text-ink hover:border-blue-200 hover:bg-blue-100'}
                    onClick={(event) => {
                      setSelection({ weather, point })
                      event.currentTarget.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
                    }}>
                    <time dateTime={point.forecastAt} className="text-sm font-normal">{forecastTime(point.forecastAt, offset)}</time>
                    <span className={selected.forecastAt === point.forecastAt ? 'rounded-full border border-white p-2' : 'rounded-full bg-tint p-2 text-primary'}>
                      <WeatherIcon code={point.condition.code} className="h-6 w-6" />
                    </span>
                    <span className="text-base font-semibold tabular-nums">{displayTemperature(point.temperatureC)} °C</span>
                    <span className="text-sm font-normal leading-5">{point.condition.description}</span>
                    <span className="mt-auto text-sm">{selected.forecastAt === point.forecastAt ? 'Selected' : <span aria-hidden="true">&nbsp;</span>}</span>
                  </button>
                </li>
              ))}
                </ul>
          </section>
        </Card>
      </section>
      <p className="sr-only" role="status">Selected forecast: {forecastLabel(selected.forecastAt, offset)}, {displayTemperature(selected.temperatureC)} °C, {selected.condition.description}.</p>
    </div>
  )
}

export function displayTemperature(value: number) {
  return new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value)
}

export function useRetryDelay(error: ApiError | null) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const delay = error?.retryAfter ?? 0
    setSeconds(delay)
    if (!delay) return
    const deadline = Date.now() + delay * 1000
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      setSeconds(remaining)
      if (!remaining) window.clearInterval(timer)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [error])
  return seconds
}
