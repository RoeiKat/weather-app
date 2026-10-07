import { describe, expect, it } from 'vitest'
import { forecastDayShort, forecastLabel, forecastTime, groupForecast, selectionKey, utcOffsetLabel, utcTimestamp } from './forecast'
import { weather } from './test/fixtures'

describe('city-offset forecast presentation', () => {
  it('groups all 40 points chronologically across six local dates, preserving partial edges', () => {
    const days = groupForecast(weather)
    expect(days.map((day) => day.date)).toEqual([
      '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12',
    ])
    expect(days.map((day) => day.points.length)).toEqual([1, 8, 8, 8, 8, 7])
    expect(days.flatMap((day) => day.points)).toEqual(weather.forecast)
  })

  it('crosses midnight using the city offset rather than the browser timezone', () => {
    const positive = { ...weather, timezoneOffsetSeconds: 19800, forecast: [weather.forecast[0]] }
    const negative = { ...weather, timezoneOffsetSeconds: -43200, forecast: [weather.forecast[1]] }
    expect(groupForecast(positive)[0].date).toBe('2026-10-08')
    expect(forecastTime(weather.forecast[0].forecastAt, 19800)).toBe('02:30')
    expect(groupForecast(negative)[0].date).toBe('2026-10-07')
    expect(forecastTime(weather.forecast[1].forecastAt, -43200)).toBe('12:00')
    expect(forecastLabel(weather.forecast[0].forecastAt, 19800)).toContain('02:30 (UTC+05:30)')
    expect(forecastDayShort(weather.forecast[0].forecastAt, 19800)).toBe('Thu 8')
    expect(forecastDayShort(weather.forecast[1].forecastAt, -43200)).toBe('Wed 7')
    expect(forecastDayShort('2026-10-07T23:59:50Z', 15)).toBe('Thu 8')
  })

  it('labels whole, fractional and extreme supplied offsets, without inferring DST', () => {
    expect(utcOffsetLabel(0)).toBe('UTC+00:00')
    expect(utcOffsetLabel(-12600)).toBe('UTC-03:30')
    expect(utcOffsetLabel(19815)).toBe('UTC+05:30:15')
    expect(utcOffsetLabel(50400)).toBe('UTC+14:00')
  })

  it('keeps stored forecast and creation timestamps explicitly UTC', () => {
    expect(utcTimestamp('2026-10-08T00:00:00Z')).toContain('UTC')
    expect(utcTimestamp('2026-10-08T00:00:00Z')).toContain('12:00:00 AM')
  })

  it('identifies a save by coordinates and the instant, never location name or temperature', () => {
    const first = selectionKey(weather.location, weather.forecast[0].forecastAt)
    expect(selectionKey({ ...weather.location, name: 'Renamed' }, '2026-10-07T21:00:00Z')).toBe(first)
    expect(selectionKey(weather.location, weather.forecast[1].forecastAt)).not.toBe(first)
    expect(selectionKey({ ...weather.location, latitude: 60 }, weather.forecast[0].forecastAt)).not.toBe(first)
  })
})
