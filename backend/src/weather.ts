import { z } from 'zod';
import { AppError, logFailure } from './errors.js';
import { canonicalLocation, countryCode, displayText, latitude, longitude, type Location, type WeatherQuery } from './validation.js';

export interface ForecastPoint {
  forecastAt: string;
  temperatureC: number;
  condition: { code: 'clear' | 'cloudy' | 'rain' | 'drizzle' | 'thunderstorm' | 'snow' | 'mist' | 'other'; description: string };
}
export interface ForecastResponse {
  location: Location;
  units: 'metric';
  fetchedAt: string;
  timezoneOffsetSeconds: number;
  forecast: ForecastPoint[];
}
const resolvedSchema = z.array(z.object({
  name: displayText(100), country: countryCode.optional(), lat: latitude, lon: longitude,
}));
const forecastSchema = z.object({
  city: z.object({
    coord: z.object({ lat: latitude, lon: longitude }),
    name: displayText(100),
    country: countryCode.optional(),
    timezone: z.number().int().min(-43200).max(50400),
  }),
  list: z.array(z.object({
    dt: z.number().int().positive().max(253402300799),
    main: z.object({ temp: z.number().finite() }),
    weather: z.array(z.object({ id: z.number().int(), description: displayText(200) })).min(1),
  })).min(1),
});
const providerError = () => new AppError(502, 'WEATHER_PROVIDER_ERROR', 'The weather provider could not complete the lookup.');
const notFound = () => new AppError(404, 'LOCATION_NOT_FOUND', 'No matching location was found.');

function conditionCode(id: number): ForecastPoint['condition']['code'] {
  if (id >= 200 && id < 300) return 'thunderstorm';
  if (id >= 300 && id < 400) return 'drizzle';
  if (id >= 500 && id < 600) return 'rain';
  if (id >= 600 && id < 700) return 'snow';
  if (id >= 700 && id < 800) return 'mist';
  if (id === 800) return 'clear';
  if (id > 800 && id <= 804) return 'cloudy';
  return 'other';
}

export class OpenWeather {
  constructor(
    private readonly key: string,
    private readonly timeoutMs: number,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async json(path: string, params: Record<string, string>, signal: AbortSignal): Promise<unknown> {
    const url = new URL(path, 'https://api.openweathermap.org');
    url.search = new URLSearchParams({ ...params, appid: this.key }).toString();
    const response = await this.fetcher(url, { signal, redirect: 'error' });
    if (!response.ok) await response.body?.cancel();
    if (response.status === 404) throw notFound();
    if (response.status === 429 || response.status === 503) {
      const header = response.headers.get('retry-after');
      const retry = header && /^\d+$/.test(header) ? Number(header) : undefined;
      throw new AppError(503, 'WEATHER_UNAVAILABLE', 'Weather is temporarily unavailable.',
        undefined, retry !== undefined && Number.isSafeInteger(retry) ? retry : undefined);
    }
    if (!response.ok) throw providerError();
    // Bound even a successful but unexpectedly large provider body.
    if (!response.body) throw providerError();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 64 * 1024) {
          await reader.cancel();
          throw providerError();
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  }

  async lookup(query: WeatherQuery): Promise<ForecastResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      let resolved: Location | undefined;
      let lat: number;
      let lon: number;
      if ('q' in query) {
        const payload = await this.json('/geo/1.0/direct', {
          q: query.countryCode ? `${query.q},${query.countryCode}` : query.q, limit: '1',
        }, controller.signal);
        const result = resolvedSchema.safeParse(payload);
        if (!result.success) throw providerError();
        const best = result.data[0];
        if (!best) throw notFound();
        resolved = { name: best.name, countryCode: best.country ?? null, latitude: best.lat, longitude: best.lon };
        lat = best.lat;
        lon = best.lon;
      } else {
        lat = query.latitude;
        lon = query.longitude;
      }
      const payload = await this.json('/data/2.5/forecast', {
        lat: String(lat), lon: String(lon), units: 'metric', lang: 'en',
      }, controller.signal);
      const result = forecastSchema.safeParse(payload);
      if (!result.success) throw providerError();
      const value = result.data;
      const fetchedAt = new Date();
      const points = [...value.list].sort((a, b) => a.dt - b.dt);
      if (points.some((point, index) => index > 0 && point.dt === points[index - 1]?.dt)) throw providerError();
      const forecast = points.filter((point) => point.dt * 1000 > fetchedAt.getTime()).map((point) => {
        const condition = point.weather[0];
        if (!condition) throw providerError();
        return {
          forecastAt: new Date(point.dt * 1000).toISOString(),
          temperatureC: point.main.temp,
          condition: { code: conditionCode(condition.id), description: condition.description },
        };
      });
      if (!forecast.length) throw providerError();
      return {
        location: canonicalLocation(resolved ?? {
          name: value.city.name, countryCode: value.city.country ?? null,
          latitude: value.city.coord.lat, longitude: value.city.coord.lon,
        }),
        units: 'metric',
        fetchedAt: fetchedAt.toISOString(),
        timezoneOffsetSeconds: value.city.timezone,
        forecast,
      };
    } catch (error) {
      if (controller.signal.aborted) throw new AppError(504, 'WEATHER_TIMEOUT', 'The weather lookup timed out.');
      if (error instanceof AppError) throw error;
      logFailure('weather_provider_failure');
      throw providerError();
    } finally {
      clearTimeout(timer);
    }
  }
}
