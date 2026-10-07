import { z } from 'zod';

const port = z.coerce.number().int().min(1).max(65535);
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: port.default(3000),
  PROBE_PORT: port.default(3001),
  ALLOWED_ORIGINS: z.string().min(1).optional(),
  FRONT_DOOR_ID: z.string().uuid().optional(),
  DB_AUTH_MODE: z.enum(['password', 'entra']).default('password'),
  PGHOST: z.string().min(1),
  PGPORT: port.default(5432),
  PGDATABASE: z.string().min(1),
  PGUSER: z.string().min(1),
  PGPASSWORD: z.string().min(1).optional(),
  PGSSL: z.enum(['true', 'false']).default('false'),
  AZURE_CLIENT_ID: z.string().uuid().optional(),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
  OPENWEATHER_API_KEY: z.string().min(1).optional(),
  WEATHER_TIMEOUT_MS: z.coerce.number().int().min(100).max(15000).default(5000),
});

export function readConfig(env: NodeJS.ProcessEnv, purpose: 'api' | 'database' = 'api') {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) throw new Error('Invalid environment configuration (values redacted).');
  const value = parsed.data;
  if (purpose === 'api' && !value.ALLOWED_ORIGINS) {
    throw new Error('The API requires ALLOWED_ORIGINS.');
  }
  const origins = value.ALLOWED_ORIGINS?.split(',').map((origin) => origin.trim()) ?? [];
  for (const origin of origins) {
    const url = new URL(origin);
    if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol) ||
        (value.NODE_ENV === 'production' && url.protocol !== 'https:')) {
      throw new Error('ALLOWED_ORIGINS must contain exact HTTP(S) origins.');
    }
  }
  if (value.PORT === value.PROBE_PORT) throw new Error('API and probe ports must differ.');
  if (value.DB_AUTH_MODE === 'password' && !value.PGPASSWORD) {
    throw new Error('Local password authentication requires PGPASSWORD.');
  }
  if (value.DB_AUTH_MODE === 'entra' && (!value.AZURE_CLIENT_ID || value.PGSSL !== 'true')) {
    throw new Error('Entra authentication requires an explicit identity and validated TLS.');
  }
  if (value.NODE_ENV === 'production' &&
      (value.DB_AUTH_MODE !== 'entra' || value.PGSSL !== 'true' ||
       (purpose === 'api' && !value.FRONT_DOOR_ID))) {
    throw new Error('Production requires Entra, validated TLS, and an API Front Door boundary.');
  }
  if (purpose === 'api' && !value.OPENWEATHER_API_KEY) {
    throw new Error('The API requires OPENWEATHER_API_KEY.');
  }
  return { ...value, origins, production: value.NODE_ENV === 'production' };
}

export type Config = ReturnType<typeof readConfig>;
