import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { createServer, connect } from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, cases, describe, each, expect, it, vi } from './testing.js';
import { createApp, BODY_LIMIT } from '../src/app.js';
import { runMigrations } from '../src/migrations.js';
import { Passwords } from '../src/passwords.js';
import { Store, tokenHash } from '../src/store.js';
import { startBackend } from '../src/runtime.js';
import { OpenWeather } from '../src/weather.js';
import { providerForecast, location, password, snapshot, testConfig } from './fixtures.js';

import { send, waitFor } from './http.js';

type App = Awaited<ReturnType<typeof createApp>>;
interface Browser { cookie: string; csrf: string }
let database: EmbeddedPostgres;
let directory: string;
let pool: pg.Pool;
let store: Store;
let app: App;
let productionApp: App;
let passwordHash: string;
const fdid = '00000000-0000-4000-8000-000000000001';
const fetcher = vi.fn<typeof fetch>();
const origin = 'http://localhost:5173';

async function freePort(): Promise<number> {
  const listener = createServer();
  await new Promise<void>((done) => listener.listen(0, '127.0.0.1', done));
  const address = listener.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address.');
  await new Promise<void>((done) => listener.close(() => done()));
  return address.port;
}

async function browser(api = app, extra: Record<string, string> = {}): Promise<Browser> {
  const result = await send(api, { method: 'GET', url: '/api/v1/auth/session', headers: extra });
  expect(result.statusCode).toBe(200);
  const header = result.headers['set-cookie'];
  if (typeof header !== 'string') throw new Error('Expected session cookie.');
  return { cookie: header.split(';')[0]!, csrf: result.body.csrfToken };
}
function headers(session: Browser) {
  return { cookie: session.cookie, origin, 'x-csrf-token': session.csrf };
}
async function signedIn(email = 'reader@example.test'): Promise<Browser> {
  await store.register(email, passwordHash);
  const anonymous = await browser();
  const result = await send(app, {
    method: 'POST', url: '/api/v1/auth/login', headers: headers(anonymous), payload: { email, password },
  });
  expect(result.statusCode).toBe(200);
  const cookie = result.headers['set-cookie'];
  if (typeof cookie !== 'string') throw new Error('Expected cookie.');
  return { cookie: cookie.split(';')[0]!, csrf: result.body.csrfToken };
}

beforeAll(async () => {
  await mkdir(resolve('.test-postgres'), { recursive: true });
  directory = await mkdtemp(join(resolve('.test-postgres'), 'cluster-'));
  const port = await freePort();
  database = new EmbeddedPostgres({
    databaseDir: directory, user: 'weather_test', password: 'synthetic-test-only', port,
    persistent: true, authMethod: 'scram-sha-256', postgresFlags: ['-h', '127.0.0.1'],
    onLog: () => {}, onError: () => console.error('test_postgres_diagnostic'),
  });
  await database.initialise();
  await database.start();
  await database.createDatabase('weather_test');
  pool = new pg.Pool({
    host: '127.0.0.1', port, database: 'weather_test', user: 'weather_test', password: 'synthetic-test-only',
    max: 5, connectionTimeoutMillis: 5000, statement_timeout: 5000,
  });
  await runMigrations(pool);
  store = new Store(pool);
  const passwords = await Passwords.create();
  passwordHash = await passwords.hash(password);
  app = await createApp(testConfig(), store, new OpenWeather('synthetic-key', 100, fetcher));
  productionApp = await createApp(testConfig({
    NODE_ENV: 'production', DB_AUTH_MODE: 'entra', PGSSL: 'true', AZURE_CLIENT_ID: fdid,
    FRONT_DOOR_ID: fdid, ALLOWED_ORIGINS: 'https://weather.example.test',
  }), store, new OpenWeather('synthetic-key', 100, fetcher));
});

beforeEach(async () => {
  await pool.query('TRUNCATE users, sessions, preferences, rate_limits');
  fetcher.mockReset();
  fetcher.mockImplementation(async () => Response.json(providerForecast));
});

afterAll(async () => {
  await pool?.end();
  if (database) await database.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe('API and persistent authentication contract', () => {
  it('has bounded database-only health, no-store, and no provider dependency', async () => {
    const result = await send(app, { url: '/api/v1/health' });
    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual({ status: 'ok' });
    expect(result.headers['cache-control']).toBe('no-store');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('bootstraps anonymous state and reuses the same durable session', async () => {
    const session = await browser();
    const result = await send(app, { url: '/api/v1/auth/session', headers: { cookie: session.cookie } });
    expect(result.body).toEqual({ user: null, csrfToken: session.csrf });
    expect(result.headers['set-cookie']).toBeUndefined();
    const row = await pool.query('SELECT token_hash FROM sessions');
    expect(row.rows[0].token_hash).toBe(tokenHash(session.cookie.split('=')[1]!));
    expect(row.rows[0].token_hash).not.toBe(session.cookie.split('=')[1]);
    expect(session.cookie).not.toContain('__Host-');
  });

  it('registers with salted Argon2id and does not log in', async () => {
    const session = await browser();
    const result = await send(app, {
      method: 'POST', url: '/api/v1/auth/register', headers: headers(session),
      payload: { email: ' Reader@Example.Test ', password: '😀'.repeat(128) },
    });
    expect(result.statusCode).toBe(201);
    expect(result.body).toEqual({ user: { id: expect.stringMatching(/^usr_/), email: 'reader@example.test' } });
    const account = await store.account('reader@example.test');
    expect(account?.password_hash).toMatch(/^\$argon2id\$v=19\$/);
    expect(account?.password_hash.split('$')[3]?.split(',').sort()).toEqual(['m=65536', 'p=1', 't=3']);
    expect(account?.password_hash).not.toContain(password);
    const state = await send(app, { url: '/api/v1/auth/session', headers: { cookie: session.cookie } });
    expect(state.body).toEqual({ user: null, csrfToken: session.csrf });
    expect(await (await Passwords.create()).verify(account?.password_hash, '😀'.repeat(128))).toBe(true);
  });

  it('enforces email uniqueness for concurrent registrations', async () => {
    const session = await browser();
    const responses = await Promise.all([1, 2].map(() => send(app, {
      method: 'POST', url: '/api/v1/auth/register', headers: headers(session),
      payload: { email: 'reader@example.test', password },
    })));
    expect(responses.map((result) => result.statusCode).sort()).toEqual([201, 409]);
    expect(responses.find((result) => result.statusCode === 409)?.body.error.code).toBe('EMAIL_IN_USE');
  });

  it('uses generic failures for unknown account and wrong password', async () => {
    await store.register('reader@example.test', passwordHash);
    const session = await browser();
    for (const email of ['reader@example.test', 'unknown@example.test']) {
      const result = await send(app, {
        method: 'POST', url: '/api/v1/auth/login', headers: headers(session),
        payload: { email, password: 'incorrect-password' },
      });
      expect(result.statusCode).toBe(401);
      expect(result.body.error).toMatchObject({
        code: 'INVALID_CREDENTIALS', message: 'The email or password is incorrect.',
      });
    }
  });

  it('rotates cookie and CSRF, invalidates old session, and survives a second replica', async () => {
    await store.register('reader@example.test', passwordHash);
    const old = await browser();
    const login = await send(app, {
      method: 'POST', url: '/api/v1/auth/login', headers: headers(old),
      payload: { email: 'READER@example.test', password },
    });
    expect(login.statusCode).toBe(200);
    expect(login.body.csrfToken).not.toBe(old.csrf);
    const cookie = String(login.headers['set-cookie']).split(';')[0]!;
    expect(cookie).not.toBe(old.cookie);
    const replica = await createApp(testConfig(), new Store(pool), new OpenWeather('synthetic-key', 100, fetcher));
    const state = await send(replica, { url: '/api/v1/auth/session', headers: { cookie } });
    expect(state.body).toEqual(login.body);
    const expired = await send(replica, { url: '/api/v1/preferences', headers: { cookie: old.cookie } });
    expect(expired.statusCode).toBe(401);
  });

  it('atomically allows only one concurrent login rotation', async () => {
    await store.register('reader@example.test', passwordHash);
    const session = await browser();
    const responses = await Promise.all([1, 2].map(() => send(app, {
      method: 'POST', url: '/api/v1/auth/login', headers: headers(session),
      payload: { email: 'reader@example.test', password },
    })));
    expect(responses.map((result) => result.statusCode).sort()).toEqual([200, 403]);
    expect((await pool.query('SELECT * FROM sessions WHERE user_id IS NOT NULL')).rowCount).toBe(1);
  });

  it('preserves current login during registration and replaces it on explicit account-switch login', async () => {
    const first = await signedIn();
    const registered = await send(app, {
      method: 'POST', url: '/api/v1/auth/register', headers: headers(first),
      payload: { email: 'second@example.test', password },
    });
    expect(registered.statusCode).toBe(201);
    const state = await send(app, { url: '/api/v1/auth/session', headers: { cookie: first.cookie } });
    expect(state.body.user.email).toBe('reader@example.test');
    const switched = await send(app, {
      method: 'POST', url: '/api/v1/auth/login', headers: headers(first),
      payload: { email: 'second@example.test', password },
    });
    expect(switched.statusCode).toBe(200);
    expect(switched.body.user.email).toBe('second@example.test');
    expect(switched.body.csrfToken).not.toBe(first.csrf);
    expect((await send(app, { url: '/api/v1/preferences', headers: { cookie: first.cookie } })).statusCode).toBe(401);
  });

  it('revokes anonymous and authenticated logout without success fallbacks', async () => {
    const sessions = [await browser(), await signedIn()];
    for (const session of sessions) {
      const result = await send(app, { method: 'POST', url: '/api/v1/auth/logout', headers: headers(session) });
      expect(result.statusCode).toBe(204);
      expect(result.text).toBe('');
      expect(result.headers['set-cookie']).toContain('Expires=Thu, 01 Jan 1970');
      const repeat = await send(app, { method: 'POST', url: '/api/v1/auth/logout', headers: headers(session) });
      expect(repeat.statusCode).toBe(403);
    }
  });

  cases(['expires_at', 'idle_expires_at'])('enforces %s and bootstraps new anonymous state', async (column) => {
    const session = await signedIn();
    await pool.query(`UPDATE sessions SET ${column} = now() - interval '1 second'`);
    const protectedResult = await send(app, { url: '/api/v1/preferences', headers: { cookie: session.cookie } });
    expect(protectedResult.statusCode).toBe(401);
    const state = await send(app, { url: '/api/v1/auth/session', headers: { cookie: session.cookie } });
    expect(state.body.user).toBeNull();
    expect(state.body.csrfToken).not.toBe(session.csrf);
    expect(state.headers['set-cookie']).toBeDefined();
  });

  it('does not extend absolute expiry when refreshing idle lifetime', async () => {
    const session = await signedIn();
    await pool.query("UPDATE sessions SET expires_at = now() + interval '2 minutes'");
    const before = (await pool.query<{ expires_at: Date }>('SELECT expires_at FROM sessions WHERE user_id IS NOT NULL')).rows[0]!;
    await send(app, { url: '/api/v1/auth/session', headers: { cookie: session.cookie } });
    const after = (await pool.query<{ expires_at: Date; idle_expires_at: Date }>(
      'SELECT expires_at, idle_expires_at FROM sessions WHERE user_id IS NOT NULL')).rows[0]!;
    expect(after.expires_at).toEqual(before.expires_at);
    expect(after.idle_expires_at).toEqual(after.expires_at);
  });

  it('checks authentication before CSRF on protected mutations', async () => {
    const result = await send(app, { method: 'POST', url: '/api/v1/preferences', payload: { location, snapshot } });
    expect(result.statusCode).toBe(401);
    expect(result.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects missing/wrong token and absent/disallowed Origin on every unsafe auth route', async () => {
    const session = await browser();
    for (const route of ['register', 'login', 'logout']) {
      for (const invalidHeaders of [
        { cookie: session.cookie, origin },
        { cookie: session.cookie, origin, 'x-csrf-token': 'incorrect' },
        { cookie: session.cookie, 'x-csrf-token': session.csrf },
        { cookie: session.cookie, origin: 'https://forbidden.example.test', 'x-csrf-token': session.csrf },
      ]) {
        const result = await send(app, { method: 'POST', url: `/api/v1/auth/${route}`, headers: invalidHeaders });
        expect(result.statusCode).toBe(403);
        expect(result.body.error.code).toBe('CSRF_FAILED');
      }
    }
  });

  it('rejects missing, wrong, duplicated and comma-joined FDID before any DB access', async () => {
    const ready = vi.spyOn(store, 'ready');
    for (const value of [undefined, 'wrong', `${fdid},${fdid}`, [fdid, fdid]]) {
      const result = await send(productionApp, {
        url: '/api/v1/health', headers: value === undefined ? {} : { 'x-azure-fdid': value },
      });
      expect(result.statusCode).toBe(403);
      expect(result.body.error.code).toBe('ORIGIN_FORBIDDEN');
      expect(result.headers['cache-control']).toBe('no-store');
    }
    expect(ready).not.toHaveBeenCalled();
    ready.mockRestore();
    const result = await send(productionApp, { url: '/api/v1/health', headers: { 'x-azure-fdid': fdid } });
    expect(result.statusCode).toBe(200);
    const session = await send(productionApp, { url: '/api/v1/auth/session', headers: { 'x-azure-fdid': fdid } });
    expect(session.headers['set-cookie']).toContain('__Host-weather-session=');
    expect(session.headers['set-cookie']).toContain('Secure');
    expect(session.headers['set-cookie']).toContain('HttpOnly');
    expect(session.headers['set-cookie']).toContain('SameSite=Lax');
    expect(session.headers['set-cookie']).toContain('Path=/');
    expect(session.headers['set-cookie']).not.toContain('Domain=');
  });

  it('supports only exact credentialed CORS allowlists', async () => {
    const allowed = await send(app, {
      method: 'OPTIONS', url: '/api/v1/auth/login',
      headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,x-csrf-token' },
    });
    expect(allowed.statusCode).toBe(204);
    expect(allowed.headers['access-control-allow-origin']).toBe(origin);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    const forbidden = await send(app, {
      method: 'OPTIONS', url: '/api/v1/auth/login',
      headers: { origin: 'https://forbidden.example.test', 'access-control-request-method': 'POST' },
    });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('returns explicit dependency failures for health/auth, not anonymous success', async () => {
    const query = vi.spyOn(pool, 'query').mockImplementation(() => { throw new Error('synthetic-private-database-error'); });
    const connect = vi.spyOn(pool, 'connect').mockImplementation(() => { throw new Error('synthetic-private-database-error'); });
    try {
      for (const url of ['/api/v1/health', '/api/v1/auth/session']) {
        const result = await send(app, { url });
        expect(result.statusCode).toBe(503);
        expect(result.body.error.code).toBe('SERVICE_UNAVAILABLE');
        expect(result.text).not.toContain('synthetic-private-database-error');
        expect(result.headers['set-cookie']).toBeUndefined();
      }
    } finally { query.mockRestore(); connect.mockRestore(); }
  });

  it('persists bounded login attempts and returns integer Retry-After', async () => {
    const session = await browser();
    for (let i = 0; i < 6; i++) {
      const result = await send(app, {
        method: 'POST', url: '/api/v1/auth/login', headers: headers(session),
        payload: { email: 'unknown@example.test', password },
      });
      expect(result.statusCode).toBe(i < 5 ? 401 : 429);
      if (i === 5) {
        expect(result.headers['retry-after']).toMatch(/^\d+$/);
        expect(result.body.error.code).toBe('RATE_LIMITED');
      }
    }
  });

  it('counts registration and weather quotas atomically across store replicas', async () => {
    const replica = new Store(pool);
    for (const [key, limit, seconds] of [['register:synthetic', 10, 3600], ['weather:synthetic', 60, 60]] as const) {
      await Promise.all(Array.from({ length: limit }, (_, index) =>
        (index % 2 ? replica : store).rateLimit(key, limit, seconds)));
      await expect(replica.rateLimit(key, limit, seconds)).rejects.toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    }
    await pool.query("UPDATE rate_limits SET expires_at = now() - interval '1 second'");
    await expect(replica.rateLimit('register:synthetic', 10, 3600)).resolves.toBeUndefined();
  });

  it('enforces exactly ten registrations and sixty weather lookups on the routes', async () => {
    const session = await browser();
    for (let index = 0; index < 11; index++) {
      const result = await send(app, {
        method: 'POST', url: '/api/v1/auth/register', headers: headers(session),
        payload: { email: `synthetic-${index}@example.test`, password },
      });
      expect(result.statusCode).toBe(index < 10 ? 201 : 429);
      if (index === 10) expect(result.headers['retry-after']).toMatch(/^\d+$/);
    }
    for (let index = 0; index < 61; index++) {
      const result = await send(app, {
        url: '/api/v1/weather?latitude=0&longitude=0', headers: { cookie: session.cookie },
      });
      expect(result.statusCode).toBe(index < 60 ? 200 : 429);
      if (index === 60) expect(result.headers['retry-after']).toMatch(/^\d+$/);
    }
    expect(fetcher).toHaveBeenCalledTimes(60);
  });
});

describe('preferences, validation and weather route', () => {
  it('saves canonical coordinates once under concurrent writes and preserves original data', async () => {
    const session = await signedIn();
    const responses = await Promise.all([1, 2].map(() => send(app, {
      method: 'POST', url: '/api/v1/preferences', headers: headers(session),
      payload: { location: { ...location, latitude: 59.32931 }, snapshot },
    })));
    expect(responses.map((result) => result.statusCode).sort()).toEqual([200, 201]);
    expect(responses[0]!.body).toEqual(responses[1]!.body);
    const duplicate = await send(app, {
      method: 'POST', url: '/api/v1/preferences', headers: headers(session),
      payload: {
        location: { ...location, name: 'Do not overwrite', countryCode: null },
        snapshot: { ...snapshot, temperatureC: 99, description: 'Do not overwrite snapshot' },
      },
    });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.body).toEqual(responses[0]!.body);
    expect(Object.keys(duplicate.body.preference).sort()).toEqual(['createdAt', 'id', 'location', 'snapshot']);
    expect(duplicate.body.preference.createdAt).toMatch(/Z$/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('isolates users and deletes by owner with indistinguishable 404 responses', async () => {
    const first = await signedIn();
    const second = await signedIn('second@example.test');
    const saved = await send(app, {
      method: 'POST', url: '/api/v1/preferences', headers: headers(first), payload: { location, snapshot },
    });
    const id = saved.body.preference.id;
    expect((await send(app, { url: '/api/v1/preferences', headers: { cookie: second.cookie } })).body)
      .toEqual({ preferences: [] });
    for (const preferenceId of [id, 'nonexistent']) {
      const result = await send(app, {
        method: 'DELETE', url: `/api/v1/preferences/${preferenceId}`, headers: headers(second),
      });
      expect(result.statusCode).toBe(404);
      expect(result.body.error.code).toBe('PREFERENCE_NOT_FOUND');
    }
    const sameBeforeDelete = await send(app, {
      method: 'POST', url: '/api/v1/preferences', headers: headers(second), payload: { location, snapshot },
    });
    expect(sameBeforeDelete.statusCode).toBe(201);
    expect(sameBeforeDelete.body.preference.id).not.toBe(id);
    const own = await send(app, {
      method: 'DELETE', url: `/api/v1/preferences/${id}`, headers: headers(first),
    });
    expect(own.statusCode).toBe(204);
    expect(own.text).toBe('');
    const sameCoordinates = await send(app, {
      method: 'POST', url: '/api/v1/preferences', headers: headers(second), payload: { location, snapshot },
    });
    expect(sameCoordinates.statusCode).toBe(200);
  });

  it('lists preferences by createdAt then ID', async () => {
    const session = await signedIn();
    for (const lat of [10, 11, 12]) await send(app, {
      method: 'POST', url: '/api/v1/preferences', headers: headers(session),
      payload: { location: { ...location, latitude: lat }, snapshot },
    });
    await pool.query("UPDATE preferences SET created_at = '2026-10-07T12:00:00Z'");
    const result = await send(app, { url: '/api/v1/preferences', headers: { cookie: session.cookie } });
    const ids: string[] = result.body.preferences.map((preference: { id: string }) => preference.id);
    expect(ids).toEqual([...ids].sort());
  });

  it('validates JSON, allowed fields, content type and the exact 16 KiB size bound', async () => {
    const session = await browser();
    const sendBody = (payload: string, mediaType = 'application/json') => send(app, {
      method: 'POST', url: '/api/v1/auth/register',
      headers: { ...headers(session), 'content-type': mediaType }, payload,
    });
    expect((await sendBody('{')).statusCode).toBe(400);
    expect((await sendBody('{}', 'text/plain')).statusCode).toBe(415);
    expect((await sendBody(JSON.stringify({ email: 'r@example.test', password, userId: 'forbidden' }))).statusCode).toBe(400);
    expect((await sendBody(JSON.stringify({ email: 'bad', password: 'short' }))).body.error.fields).not.toHaveLength(0);
    const base = JSON.stringify({ email: 'r@example.test', password });
    expect((await sendBody(base + ' '.repeat(BODY_LIMIT - Buffer.byteLength(base)))).statusCode).toBe(201);
    const over = await sendBody(base + ' '.repeat(BODY_LIMIT + 1 - Buffer.byteLength(base)));
    expect(over.statusCode).toBe(413);
    expect(over.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(over.headers['cache-control']).toBe('no-store');
  });

  it('rejects unknown nested fields and invalid country/coordinate preferences', async () => {
    const session = await signedIn();
    for (const payload of [
      { location, snapshot, userId: 'forbidden' },
      { location: { ...location, latitude: 91 }, snapshot },
      { location: { ...location, countryCode: 'ZZ' }, snapshot },
      { location: { ...location, extra: true }, snapshot },
      { location: { ...location, longitude: '18' }, snapshot },
    ]) {
      const result = await send(app, { method: 'POST', url: '/api/v1/preferences', headers: headers(session), payload });
      expect(result.statusCode).toBe(400);
    }
  });

  it('requires current-session CSRF on protected save and delete', async () => {
    const session = await signedIn();
    const another = await browser();
    for (const method of ['POST', 'DELETE'] as const) {
      const result = await send(app, {
        method, url: method === 'POST' ? '/api/v1/preferences' : '/api/v1/preferences/nonexistent',
        headers: { ...headers(session), 'x-csrf-token': another.csrf },
        ...(method === 'POST' ? { payload: { location, snapshot } } : {}),
      });
      expect(result.statusCode).toBe(403);
      expect(result.body.error.code).toBe('CSRF_FAILED');
    }
  });

  it('rejects unexpected query/body data on routes that define none', async () => {
    const session = await browser();
    for (const url of ['/api/v1/health?extra=1', '/api/v1/auth/session?extra=1', '/api/v1/weather?q=a&q=b']) {
      expect((await send(app, { url })).statusCode).toBe(400);
    }
    const result = await send(app, {
      method: 'POST', url: '/api/v1/auth/logout', headers: headers(session), payload: {},
    });
    expect(result.statusCode).toBe(400);
  });

  it('returns normalized public weather without provider raw fields', async () => {
    const result = await send(app, { url: '/api/v1/weather?latitude=59.3293&longitude=18.0686' });
    expect(result.statusCode).toBe(200);
    expect(result.body.location).toEqual(location);
    expect(result.body.units).toBe('metric');
    expect(result.text).not.toContain('ignoredProviderField');
    expect(result.text).not.toContain('synthetic-key');
  });

  each([
    [404, 404, 'LOCATION_NOT_FOUND'],
    [429, 503, 'WEATHER_UNAVAILABLE'],
    [503, 503, 'WEATHER_UNAVAILABLE'],
    [401, 502, 'WEATHER_PROVIDER_ERROR'],
  ])('uses application error envelope for provider %i', async (providerStatus, status, code) => {
    fetcher.mockResolvedValue(new Response('private-provider-error', {
      status: providerStatus, headers: { 'Retry-After': '20' },
    }));
    const result = await send(app, { url: '/api/v1/weather?latitude=0&longitude=0' });
    expect(result.statusCode).toBe(status);
    expect(result.body.error).toEqual({ code, message: expect.any(String), requestId: expect.stringMatching(/^req_/) });
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.text).not.toContain('private-provider-error');
    expect(result.headers['retry-after']).toBe(status === 503 ? '20' : undefined);
  });

  it('returns provider timeout errors while preference operations remain available', async () => {
    const session = await signedIn();
    fetcher.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('synthetic-timeout')));
    }));
    const weather = await send(app, { url: '/api/v1/weather?latitude=0&longitude=0' });
    expect(weather.statusCode).toBe(504);
    expect(weather.body.error.code).toBe('WEATHER_TIMEOUT');
    const saved = await send(app, {
      method: 'POST', url: '/api/v1/preferences', headers: headers(session), payload: { location, snapshot },
    });
    expect(saved.statusCode).toBe(201);
    expect((await send(app, { url: '/api/v1/preferences', headers: { cookie: session.cookie } })).statusCode).toBe(200);
  });

  it('runs versioned migrations idempotently with recorded checksums', async () => {
    await runMigrations(pool);
    expect((await pool.query('SELECT * FROM schema_migrations')).rowCount).toBe(2);
    const original = (await pool.query<{ checksum: string }>(
      "SELECT checksum FROM schema_migrations WHERE version = '001_initial.sql'")).rows[0]!;
    await pool.query("UPDATE schema_migrations SET checksum = 'mismatch' WHERE version = '001_initial.sql'");
    try { await expect(runMigrations(pool)).rejects.toThrow('checksum mismatch'); }
    finally { await pool.query("UPDATE schema_migrations SET checksum = $1 WHERE version = '001_initial.sql'", [original.checksum]); }
  });

  it('persists minimal snapshots and permits distinct forecast times for one city', async () => {
    const session = await signedIn();
    const selected = [snapshot, {
      ...snapshot, forecastAt: new Date(Date.parse(snapshot.forecastAt) + 10_800_000).toISOString(), temperatureC: 11.2,
    }];
    for (const point of selected) {
      const saved = await send(app, {
        method: 'POST', url: '/api/v1/preferences', headers: headers(session), payload: { location, snapshot: point },
      });
      expect(saved.statusCode).toBe(201);
      expect(saved.body.preference.snapshot).toEqual(point);
      expect(Object.keys(saved.body.preference.snapshot).sort()).toEqual(['description', 'forecastAt', 'temperatureC']);
      expect(saved.body.preference.userId).toBeUndefined();
    }
    const equivalentTime = await send(app, {
      method: 'POST', url: '/api/v1/preferences', headers: headers(session),
      payload: { location, snapshot: { ...snapshot, forecastAt: snapshot.forecastAt.replace('.000Z', 'Z') } },
    });
    expect(equivalentTime.statusCode).toBe(200);
    const listed = await send(app, { url: '/api/v1/preferences', headers: { cookie: session.cookie } });
    expect(listed.body.preferences.map((item: { snapshot: typeof snapshot }) => item.snapshot)).toEqual(selected);
    const rows = await pool.query<{ user_id: string; forecast_at: Date; temperature_c: number; description: string }>(
      'SELECT user_id, forecast_at, temperature_c, description FROM preferences ORDER BY created_at, id');
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows[0]).toEqual({
      user_id: expect.stringMatching(/^usr_/), forecast_at: new Date(snapshot.forecastAt),
      temperature_c: snapshot.temperatureC, description: snapshot.description,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('validates the complete snapshot without accepting provider objects or client ownership/timestamps', async () => {
    const session = await signedIn();
    for (const payload of [
      { location },
      { location, snapshot: { ...snapshot, forecastAt: 'not-a-date' } },
      { location, snapshot: { ...snapshot, forecastAt: '2026-02-30T00:00:00Z' } },
      { location, snapshot: { ...snapshot, forecastAt: '2026-10-08T00:00:00+02:00' } },
      { location, snapshot: { ...snapshot, temperatureC: '12.4' } },
      { location, snapshot: { ...snapshot, temperatureC: null } },
      { location, snapshot: { ...snapshot, description: '' } },
      { location, snapshot: { ...snapshot, description: 'x'.repeat(201) } },
      { location, snapshot: { ...snapshot, description: '<script>' } },
      { location, snapshot: { ...snapshot, rawProviderData: providerForecast } },
      { location, snapshot, userId: 'another-user' },
      { location, snapshot, createdAt: snapshot.forecastAt },
      { location, snapshot: { forecastAt: snapshot.forecastAt, temperatureC: snapshot.temperatureC } },
    ]) {
      const result = await send(app, {
        method: 'POST', url: '/api/v1/preferences', headers: headers(session), payload,
      });
      expect(result.statusCode).toBe(400);
      expect(result.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect((await pool.query('SELECT * FROM preferences')).rowCount).toBe(0);
  });

  it('reopens a past saved selection with fresh provider calls and never mutates its snapshot', async () => {
    const session = await signedIn();
    const historical = { ...snapshot, forecastAt: '2020-01-01T00:00:00.000Z', temperatureC: -2 };
    const saved = await send(app, {
      method: 'POST', url: '/api/v1/preferences', headers: headers(session),
      payload: { location, snapshot: historical },
    });
    expect(saved.statusCode).toBe(201);
    const listedBefore = await send(app, { url: '/api/v1/preferences', headers: { cookie: session.cookie } });
    expect(fetcher).not.toHaveBeenCalled();
    const url = `/api/v1/weather?latitude=${location.latitude}&longitude=${location.longitude}`;
    const first = await send(app, { url, headers: { cookie: session.cookie } });
    fetcher.mockImplementation(async () => Response.json({
      ...providerForecast,
      list: providerForecast.list.map((point) => ({ ...point, main: { temp: point.main.temp + 5 } })),
    }));
    const second = await send(app, { url, headers: { cookie: session.cookie } });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(second.body.forecast[0].temperatureC).toBe(first.body.forecast[0].temperatureC + 5);
    const listedAfter = await send(app, { url: '/api/v1/preferences', headers: { cookie: session.cookie } });
    expect(listedAfter.body).toEqual(listedBefore.body);
    expect(listedAfter.body.preferences[0].snapshot).toEqual(historical);
  });

  it('upgrades the original schema without losing accounts, sessions, or legacy location rows', async () => {
    await pool.query('CREATE SCHEMA legacy_upgrade_test');
    const upgrade = new pg.Pool({
      host: '127.0.0.1', port: pool.options.port, database: 'weather_test', user: 'weather_test',
      password: 'synthetic-test-only', options: '-c search_path=legacy_upgrade_test',
    });
    try {
      const initial = await readFile(new URL('../migrations/001_initial.sql', import.meta.url), 'utf8');
      await upgrade.query(initial);
      await upgrade.query('CREATE TABLE schema_migrations (version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
      await upgrade.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)',
        ['001_initial.sql', createHash('sha256').update(initial).digest('hex')]);
      await upgrade.query('INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)',
        ['usr_legacy', 'legacy@example.test', passwordHash]);
      const token = 's'.repeat(43);
      await upgrade.query(`INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at, idle_expires_at)
        VALUES ($1, 'usr_legacy', 'synthetic-legacy-csrf', now() + interval '1 hour', now() + interval '30 minutes')`,
      [tokenHash(token)]);
      await upgrade.query(`INSERT INTO preferences (id, user_id, name, country_code, latitude, longitude)
        VALUES ('pref_legacy', 'usr_legacy', 'Stockholm', 'SE', 59.3293, 18.0686)`);
      await runMigrations(upgrade);
      const upgradedStore = new Store(upgrade);
      expect((await upgradedStore.account('legacy@example.test'))?.password_hash).toBe(passwordHash);
      expect((await upgradedStore.loadSession(token))?.user_id).toBe('usr_legacy');
      expect((await upgrade.query('SELECT * FROM preferences WHERE forecast_at IS NULL')).rowCount).toBe(1);
      expect(await upgradedStore.preferences('usr_legacy')).toEqual([]);
      await expect(upgradedStore.deletePreference('usr_legacy', 'pref_legacy'))
        .rejects.toMatchObject({ code: 'PREFERENCE_NOT_FOUND' });
      expect((await upgradedStore.savePreference('usr_legacy', location, snapshot)).created).toBe(true);
      expect(await upgradedStore.preferences('usr_legacy')).toHaveLength(1);
      expect((await upgrade.query('SELECT * FROM preferences')).rowCount).toBe(2);
      await runMigrations(upgrade);
    } finally {
      await upgrade.end();
      await pool.query('DROP SCHEMA legacy_upgrade_test CASCADE');
    }
  });

  it('executes migration and expiry cleanup commands separately from API startup', async () => {
    const session = await browser();
    await store.rateLimit('expired-synthetic', 5, 60);
    await pool.query("UPDATE sessions SET expires_at = now() - interval '1 second'");
    await pool.query("UPDATE rate_limits SET expires_at = now() - interval '1 second'");
    const env = {
      ...process.env, NODE_ENV: 'test', DB_AUTH_MODE: 'password', PGSSL: 'false',
      PGHOST: '127.0.0.1', PGPORT: String(pool.options.port), PGDATABASE: 'weather_test',
      PGUSER: 'weather_test', PGPASSWORD: 'synthetic-test-only',
      ALLOWED_ORIGINS: undefined, OPENWEATHER_API_KEY: undefined,
    };
    const execute = promisify(execFile);
    const migration = await execute(process.execPath, ['--import', 'tsx', 'src/migrate.ts'], { env });
    expect(migration.stdout).toContain('migrations_completed');
    const cleanup = await execute(process.execPath, ['--import', 'tsx', 'src/cleanup.ts'], { env });
    expect(cleanup.stdout).toContain('expired_state_cleanup_completed');
    expect((await pool.query('SELECT * FROM sessions')).rowCount).toBe(0);
    expect((await pool.query('SELECT * FROM rate_limits')).rowCount).toBe(0);
    expect(await store.loadSession(session.cookie.split('=')[1])).toBeNull();
  });

  it('serves actual TCP/HTTP traffic, closes readiness on DB failure, recovers and drains', async () => {
    const port = await freePort();
    const probePort = await freePort();
    const runtime = await startBackend(testConfig({
      PORT: String(port), PROBE_PORT: String(probePort), PGPORT: String(pool.options.port),
    }));
    const probe = () => new Promise<void>((resolve, reject) => {
      const socket = connect(probePort, '127.0.0.1');
      socket.once('connect', () => { socket.end(); resolve(); });
      socket.once('error', reject);
    });
    try {
      await probe();
      expect((await fetch(`http://127.0.0.1:${port}/api/v1/health`)).status).toBe(200);
      const unavailable = vi.spyOn(runtime.store, 'ready').mockRejectedValue(new Error('synthetic failure'));
      await new Promise((resolve) => setTimeout(resolve, 5200));
      await expect(probe()).rejects.toMatchObject({ code: 'ECONNREFUSED' });
      unavailable.mockRestore();
      await new Promise((resolve) => setTimeout(resolve, 5200));
      await probe();
      let complete!: () => void;
      const pending = new Promise<void>((resolve) => { complete = resolve; });
      const ready = vi.spyOn(runtime.store, 'ready').mockImplementation(() => pending);
      const response = fetch(`http://127.0.0.1:${port}/api/v1/health`);
      await waitFor(() => expect(ready).toHaveBeenCalled());
      const closing = runtime.close();
      complete();
      expect((await response).status).toBe(200);
      await closing;
      ready.mockRestore();
      await expect(probe()).rejects.toMatchObject({ code: 'ECONNREFUSED' });
    } finally {
      await runtime.close();
    }
  });

  it('executes the Node entrypoint SIGTERM handler and exits after serving real HTTP', async () => {
    const port = await freePort();
    const probePort = await freePort();
    const env = {
      ...process.env, NODE_ENV: 'test', DB_AUTH_MODE: 'password', PGSSL: 'false',
      PGHOST: '127.0.0.1', PGPORT: String(pool.options.port), PGDATABASE: 'weather_test',
      PGUSER: 'weather_test', PGPASSWORD: 'synthetic-test-only', ALLOWED_ORIGINS: origin,
      OPENWEATHER_API_KEY: 'synthetic-key', PORT: String(port), PROBE_PORT: String(probePort),
    };
    const script = `
      await import('./src/server.ts');
      const result = await fetch('http://127.0.0.1:${port}/api/v1/health');
      if (result.status !== 200) throw new Error('health failed');
      process.emit('SIGTERM');
      console.info('synthetic_sigterm_invoked');
    `;
    const output = await promisify(execFile)(process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', script], { env, timeout: 10_000 });
    expect(output.stdout).toContain('api_started');
    expect(output.stdout).toContain('synthetic_sigterm_invoked');
    expect(output.stderr).toBe('');
  });
});
