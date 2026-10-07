import { readConfig } from '../src/config.js';

export const password = 'Synthetic-password-123';
export const location = { name: 'Stockholm', countryCode: 'SE', latitude: 59.3293, longitude: 18.0686 };
export const forecastStart = Math.ceil(Date.now() / 10_800_000) * 10_800_000 + 10_800_000;
export const snapshot = {
  forecastAt: new Date(forecastStart).toISOString(), temperatureC: 12.4, description: 'Overcast clouds',
};
export const providerForecast = {
  city: {
    coord: { lat: 59.32931, lon: 18.06864 }, name: 'Stockholm', country: 'SE', timezone: 7200,
  },
  list: Array.from({ length: 40 }, (_, index) => ({
    dt: (forecastStart + index * 10_800_000) / 1000,
    main: { temp: 12.4 - index / 10, humidity: 72 },
    weather: [{ id: 804, description: 'Overcast clouds', icon: 'never expose' }],
    dt_txt: 'provider-only field',
  })),
  ignoredProviderField: 'never expose',
};
export const testConfig = (extra: NodeJS.ProcessEnv = {}) => readConfig({
  NODE_ENV: 'test',
  ALLOWED_ORIGINS: 'http://localhost:5173',
  PGHOST: '127.0.0.1', PGDATABASE: 'weather_test', PGUSER: 'weather_test',
  PGPASSWORD: 'synthetic-test-only', OPENWEATHER_API_KEY: 'synthetic-provider-key',
  ...extra,
});
