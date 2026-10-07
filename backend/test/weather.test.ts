import { cases, describe, each, expect, it, vi } from './testing.js';
import { OpenWeather } from '../src/weather.js';
import { providerForecast, forecastStart } from './fixtures.js';

describe('free five-day / three-hour forecast normalization', () => {
  it('resolves city, requests the full free forecast, and returns exactly contract fields', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json([{ name: 'Stockholm', country: 'SE', lat: 59.32931, lon: 18.06864 }]))
      .mockResolvedValueOnce(Response.json(providerForecast));
    const before = Date.now();
    const value = await new OpenWeather('synthetic-key', 1000, fetcher).lookup({ q: 'Stockholm', countryCode: 'SE' });
    expect(value).toEqual({
      location: { name: 'Stockholm', countryCode: 'SE', latitude: 59.3293, longitude: 18.0686 },
      units: 'metric', fetchedAt: expect.any(String), timezoneOffsetSeconds: 7200,
      forecast: providerForecast.list.map((point) => ({
        forecastAt: new Date(point.dt * 1000).toISOString(), temperatureC: point.main.temp,
        condition: { code: 'cloudy', description: 'Overcast clouds' },
      })),
    });
    expect(Date.parse(value.fetchedAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(value.fetchedAt)).toBeLessThanOrEqual(Date.now());
    expect(value.forecast).toHaveLength(40);
    expect(Date.parse(value.forecast[39]!.forecastAt) - Date.parse(value.forecast[0]!.forecastAt))
      .toBe(39 * 3 * 60 * 60 * 1000);
    const geocoding = new URL(String(fetcher.mock.calls[0]?.[0]));
    const weather = new URL(String(fetcher.mock.calls[1]?.[0]));
    expect(geocoding.origin).toBe('https://api.openweathermap.org');
    expect(geocoding.searchParams.get('q')).toBe('Stockholm,SE');
    expect(geocoding.searchParams.get('limit')).toBe('1');
    expect(weather.pathname).toBe('/data/2.5/forecast');
    expect(weather.searchParams.get('units')).toBe('metric');
    expect(weather.searchParams.has('cnt')).toBe(false);
    expect(weather.searchParams.get('lat')).toBe('59.32931');
    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe('error');
  });

  each([
    [200, 'thunderstorm'], [301, 'drizzle'], [501, 'rain'], [601, 'snow'],
    [701, 'mist'], [800, 'clear'], [803, 'cloudy'], [999, 'other'],
  ])('maps condition %i', async (id, expected) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      ...providerForecast,
      list: providerForecast.list.map((point) => ({ ...point, weather: [{ id, description: 'Synthetic condition' }] })),
    }));
    const result = await new OpenWeather('synthetic-key', 1000, fetcher).lookup({ latitude: 0, longitude: 0 });
    expect(result.forecast[0]?.condition.code).toBe(expected);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  each([
    [404, 404, 'LOCATION_NOT_FOUND'], [401, 502, 'WEATHER_PROVIDER_ERROR'],
    [500, 502, 'WEATHER_PROVIDER_ERROR'], [429, 503, 'WEATHER_UNAVAILABLE'],
    [503, 503, 'WEATHER_UNAVAILABLE'],
  ])('translates HTTP %i without exposing its body', async (upstream, status, code) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('private-upstream-body', {
      status: upstream, headers: { 'Retry-After': '17' },
    }));
    await expect(new OpenWeather('synthetic-key', 1000, fetcher).lookup({ latitude: 0, longitude: 0 }))
      .rejects.toMatchObject({ status, code });
  });

  it('maps empty geocoding to no-match', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json([]));
    await expect(new OpenWeather('synthetic-key', 1000, fetcher).lookup({ q: 'No Match' }))
      .rejects.toMatchObject({ status: 404, code: 'LOCATION_NOT_FOUND' });
  });

  cases([
    {},
    { ...providerForecast, list: [] },
    { ...providerForecast, list: [{ ...providerForecast.list[0], dt: 0 }] },
    { ...providerForecast, list: [{ ...providerForecast.list[0], main: {} }] },
    { ...providerForecast, list: [{ ...providerForecast.list[0], main: { temp: null } }] },
    { ...providerForecast, list: [{ ...providerForecast.list[0], weather: [] }] },
    { ...providerForecast, list: [{ ...providerForecast.list[0], weather: [{ id: 800, description: '<script>' }] }] },
    { ...providerForecast, city: { ...providerForecast.city, country: 'ZZ' } },
    { ...providerForecast, city: { ...providerForecast.city, timezone: 50401 } },
    { ...providerForecast, city: { ...providerForecast.city, timezone: 1.5 } },
    { ...providerForecast, city: { ...providerForecast.city, timezone: undefined } },
    { ...providerForecast, list: [providerForecast.list[0], providerForecast.list[0]] },
    { ...providerForecast, list: [providerForecast.list[0], { dt: 1 }] },
  ])('rejects missing/invalid entries instead of silently dropping them', async (payload) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload));
    await expect(new OpenWeather('synthetic-key', 1000, fetcher).lookup({ latitude: 0, longitude: 0 }))
      .rejects.toMatchObject({ code: 'WEATHER_PROVIDER_ERROR' });
  });

  it('sorts valid points and excludes valid elapsed times from the future horizon', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      ...providerForecast,
      list: [...providerForecast.list].reverse().concat([{ ...providerForecast.list[0]!, dt: 1 }]),
    }));
    const result = await new OpenWeather('synthetic-key', 1000, fetcher).lookup({ latitude: 0, longitude: 0 });
    expect(result.forecast).toHaveLength(40);
    expect(result.forecast[0]?.forecastAt).toBe(new Date(forecastStart).toISOString());
    for (let index = 1; index < result.forecast.length; index++) {
      expect(Date.parse(result.forecast[index]!.forecastAt))
        .toBeGreaterThan(Date.parse(result.forecast[index - 1]!.forecastAt));
    }
  });

  it('fails explicitly when no future forecast point remains', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      ...providerForecast, list: [{ ...providerForecast.list[0], dt: 1 }],
    }));
    await expect(new OpenWeather('synthetic-key', 1000, fetcher).lookup({ latitude: 0, longitude: 0 }))
      .rejects.toMatchObject({ code: 'WEATHER_PROVIDER_ERROR' });
  });

  it('uses null only for unavailable country and normalizes negative zero', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      ...providerForecast,
      city: { ...providerForecast.city, country: undefined, coord: { lat: -0.00001, lon: 0.00001 } },
    }));
    const result = await new OpenWeather('synthetic-key', 1000, fetcher).lookup({ latitude: 0, longitude: 0 });
    expect(result.location).toEqual({ name: 'Stockholm', countryCode: null, latitude: 0, longitude: 0 });
    expect(Object.is(result.location.latitude, -0)).toBe(false);
  });

  it('bounds malformed JSON and oversized provider bodies', async () => {
    for (const body of ['not-json', 'x'.repeat(65537)]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(body));
      await expect(new OpenWeather('synthetic-key', 1000, fetcher).lookup({ latitude: 0, longitude: 0 }))
        .rejects.toMatchObject({ status: 502, code: 'WEATHER_PROVIDER_ERROR' });
    }
  });

  it('aborts provider work at the lookup deadline', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('synthetic abort')), { once: true });
      }));
    await expect(new OpenWeather('synthetic-key', 20, fetcher).lookup({ q: 'Stockholm' }))
      .rejects.toMatchObject({ status: 504, code: 'WEATHER_TIMEOUT' });
  });

  it('uses one deadline across geocoding and forecast', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockImplementationOnce(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return Response.json([{ name: 'Stockholm', country: 'SE', lat: 59.3, lon: 18 }]);
      })
      .mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
        if (init?.signal?.aborted) reject(new Error('synthetic abort'));
        else init?.signal?.addEventListener('abort', () => reject(new Error('synthetic abort')), { once: true });
      }));
    await expect(new OpenWeather('synthetic-key', 50, fetcher).lookup({ q: 'Stockholm' }))
      .rejects.toMatchObject({ code: 'WEATHER_TIMEOUT' });
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBe(fetcher.mock.calls[1]?.[1]?.signal);
  });
});
