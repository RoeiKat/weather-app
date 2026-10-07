import type { ForecastPoint, ForecastResponse, Location } from './api'

function cityDate(timestamp: string, offset: number) {
  return new Date(Date.parse(timestamp) + offset * 1000)
}

export function utcOffsetLabel(offset: number) {
  const absolute = Math.abs(offset)
  const hours = String(Math.floor(absolute / 3600)).padStart(2, '0')
  const minutes = String(Math.floor(absolute % 3600 / 60)).padStart(2, '0')
  const seconds = absolute % 60
  return `UTC${offset < 0 ? '-' : '+'}${hours}:${minutes}${seconds ? `:${String(seconds).padStart(2, '0')}` : ''}`
}

export function forecastTime(timestamp: string, offset: number) {
  return new Intl.DateTimeFormat('en', {
    timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(cityDate(timestamp, offset))
}

export function forecastDate(timestamp: string, offset: number) {
  return new Intl.DateTimeFormat('en', {
    timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'short', day: 'numeric',
  }).format(cityDate(timestamp, offset))
}

export function forecastLabel(timestamp: string, offset: number) {
  return `${forecastDate(timestamp, offset)} at ${forecastTime(timestamp, offset)} (${utcOffsetLabel(offset)})`
}

export function utcTimestamp(timestamp: string) {
  return new Intl.DateTimeFormat('en', {
    timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'long',
  }).format(new Date(timestamp))
}

export function selectionKey(location: Location, forecastAt: string) {
  return `${location.latitude},${location.longitude}@${Date.parse(forecastAt)}`
}

export function groupForecast(weather: ForecastResponse) {
  const days = new Map<string, { date: string; label: string; points: ForecastPoint[] }>()
  for (const point of weather.forecast) {
    const date = cityDate(point.forecastAt, weather.timezoneOffsetSeconds).toISOString().slice(0, 10)
    const day = days.get(date)
    if (day) day.points.push(point)
    else days.set(date, {
      date, label: forecastDate(point.forecastAt, weather.timezoneOffsetSeconds), points: [point],
    })
  }
  return [...days.values()]
}
