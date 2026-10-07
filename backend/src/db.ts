import { ManagedIdentityCredential } from '@azure/identity';
import pg from 'pg';
import type { Config } from './config.js';
import { logFailure } from './errors.js';

export function createPool(config: Config): pg.Pool {
  const credential = config.DB_AUTH_MODE === 'entra'
    ? new ManagedIdentityCredential({ clientId: config.AZURE_CLIENT_ID! })
    : undefined;
  const pool = new pg.Pool({
    host: config.PGHOST,
    port: config.PGPORT,
    database: config.PGDATABASE,
    user: config.PGUSER,
    password: credential ? async () => {
      const token = await credential.getToken('https://ossrdbms-aad.database.windows.net/.default');
      if (!token || token.expiresOnTimestamp <= Date.now() + 60_000) {
        throw new Error('Database identity token unavailable or near expiry.');
      }
      return token.token;
    } : config.PGPASSWORD,
    ssl: config.PGSSL === 'true'
      ? { rejectUnauthorized: true, minVersion: 'TLSv1.2', servername: config.PGHOST }
      : false,
    max: config.DB_POOL_MAX,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30_000,
    maxLifetimeSeconds: 600,
    statement_timeout: 5000,
    query_timeout: 6000,
    lock_timeout: 3000,
    idle_in_transaction_session_timeout: 10_000,
  });
  pool.on('error', () => logFailure('database_pool_error'));
  return pool;
}
