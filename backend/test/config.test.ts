import { ManagedIdentityCredential } from '@azure/identity';
import { cases, describe, expect, it, vi } from './testing.js';
import { createPool } from '../src/db.js';
import { readConfig } from '../src/config.js';
import { credentialsSchema, parseWeatherQuery, validate } from '../src/validation.js';
import { testConfig } from './fixtures.js';

const identity = '00000000-0000-4000-8000-000000000001';
const production = {
  NODE_ENV: 'production', DB_AUTH_MODE: 'entra', PGSSL: 'true', AZURE_CLIENT_ID: identity,
  FRONT_DOOR_ID: identity, ALLOWED_ORIGINS: 'https://weather.example.test',
};

describe('configuration and validation', () => {
  it('fails closed for insecure production settings', () => {
    expect(() => testConfig({ NODE_ENV: 'production' })).toThrow();
    expect(() => testConfig({ ...production, PGSSL: 'false' })).toThrow();
    expect(() => testConfig({ ...production, ALLOWED_ORIGINS: 'http://weather.example.test' })).toThrow();
    expect(() => testConfig({ ALLOWED_ORIGINS: 'http://localhost:5173/' })).toThrow();
    expect(() => testConfig({ ALLOWED_ORIGINS: '*' })).toThrow();
    expect(() => testConfig({ PORT: '3001' })).toThrow();
  });

  it('allows database jobs without provider secrets or Front Door ID', () => {
    const config = readConfig({
      ...production, FRONT_DOOR_ID: undefined, ALLOWED_ORIGINS: undefined,
      PGHOST: 'db.example.test', PGUSER: 'migration-role',
      PGDATABASE: 'weather', OPENWEATHER_API_KEY: undefined,
    }, 'database');
    expect(config.DB_AUTH_MODE).toBe('entra');
  });

  it('requests a fresh-valid token on every physical-connection password callback', async () => {
    const token = vi.spyOn(ManagedIdentityCredential.prototype, 'getToken')
      .mockResolvedValueOnce({ token: 'synthetic-token-1', expiresOnTimestamp: Date.now() + 120_000 })
      .mockResolvedValueOnce({ token: 'synthetic-token-2', expiresOnTimestamp: Date.now() + 120_000 })
      .mockResolvedValueOnce({ token: 'expired-synthetic-token', expiresOnTimestamp: Date.now() - 1 });
    const pool = createPool(testConfig(production));
    try {
      const password = pool.options.password;
      if (typeof password !== 'function') throw new Error('Expected token callback.');
      expect(await password()).toBe('synthetic-token-1');
      expect(await password()).toBe('synthetic-token-2');
      await expect(password()).rejects.toThrow('near expiry');
      expect(token).toHaveBeenCalledWith('https://ossrdbms-aad.database.windows.net/.default');
      expect(pool.options.ssl).toMatchObject({ rejectUnauthorized: true, minVersion: 'TLSv1.2', servername: '127.0.0.1' });
    } finally {
      token.mockRestore();
      await pool.end();
    }
  });

  it('counts passwords in Unicode code points without truncation or trimming', () => {
    const password = '😀'.repeat(128);
    const result = validate(credentialsSchema, { email: ' Reader@Example.Test ', password });
    expect(result).toEqual({ email: 'reader@example.test', password });
    expect(() => validate(credentialsSchema, { email: 'r@example.test', password: '😀'.repeat(129) })).toThrow();
    expect(validate(credentialsSchema, { email: 'r@example.test', password: '  1234567890  ' }).password)
      .toBe('  1234567890  ');
  });

  cases([
    '', 'q=x&q=y', 'q=x&latitude=0&longitude=0', 'latitude=0', 'latitude=NaN&longitude=0',
    'latitude=91&longitude=0', 'latitude=0&longitude=181', 'q=x&units=metric', 'q=x&countryCode=ZZ',
    'q=x&appid=anything', 'latitude=0x10&longitude=0', 'countryCode=SE',
  ])('rejects invalid query %s', (query) => {
    expect(() => parseWeatherQuery(new URLSearchParams(query))).toThrow();
  });
});
