import { createServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { createApp } from './app.js';
import type { Config } from './config.js';
import { createPool } from './db.js';
import { logFailure } from './errors.js';
import { Store } from './store.js';
import { OpenWeather } from './weather.js';

export async function startBackend(config: Config) {
  const pool = createPool(config);
  const store = new Store(pool);
  let app: Awaited<ReturnType<typeof createApp>>;
  try {
    app = await createApp(config, store, new OpenWeather(config.OPENWEATHER_API_KEY!, config.WEATHER_TIMEOUT_MS));
  } catch (error) {
    await pool.end();
    throw error;
  }
  const server = createHttpServer(app);
  server.requestTimeout = 15_000;
  server.headersTimeout = 15_000;
  server.timeout = 20_000;
  server.keepAliveTimeout = 5000;
  const readiness = createServer((socket) => socket.end());
  readiness.on('error', () => logFailure('readiness_listener_failure'));
  let stopping = false;
  let timer: NodeJS.Timeout | undefined;
  let checking: Promise<void> | undefined;
  const closeReadiness = async () => {
    if (readiness.listening) await new Promise<void>((resolve) => readiness.close(() => resolve()));
  };
  const check = async () => {
    try {
      await store.ready();
      if (!stopping && !readiness.listening) {
        await new Promise<void>((resolve, reject) => {
          readiness.once('error', reject);
          readiness.listen(config.PROBE_PORT, '0.0.0.0', () => {
            readiness.removeListener('error', reject);
            resolve();
          });
        });
      }
    } catch {
      logFailure('readiness_check_failed');
      await closeReadiness();
    } finally {
      if (!stopping) timer = setTimeout(() => { checking = check(); }, 5000);
    }
  };
  const close = async () => {
    if (stopping) return;
    stopping = true;
    clearTimeout(timer);
    await checking;
    await closeReadiness();
    try {
      if (server.listening) {
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    } finally { await pool.end(); }
  };
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(config.PORT, '0.0.0.0', () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
    checking = check();
    await checking;
    return { app, server, store, close };
  } catch (error) {
    await close();
    throw error;
  }
}
