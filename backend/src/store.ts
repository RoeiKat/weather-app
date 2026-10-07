import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { AppError, logFailure, unavailable } from './errors.js';
import type { ForecastSnapshot, Location } from './validation.js';

export interface User { id: string; email: string }
export interface Account extends User { password_hash: string }
export interface Session {
  token_hash: string;
  csrf_token: string;
  user_id: string | null;
  email: string | null;
}
export interface Preference { id: string; location: Location; snapshot: ForecastSnapshot; createdAt: string }
interface PreferenceRow {
  id: string; name: string; country_code: string | null;
  latitude: string; longitude: string; created_at: Date;
  forecast_at: Date; temperature_c: number; description: string;
}
export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
export const sessionUser = (session: Session): User | null =>
  session.user_id && session.email ? { id: session.user_id, email: session.email } : null;

function toPreference(row: PreferenceRow): Preference {
  return {
    id: row.id,
    location: {
      name: row.name, countryCode: row.country_code,
      latitude: Number(row.latitude), longitude: Number(row.longitude),
    },
    snapshot: {
      forecastAt: row.forecast_at.toISOString(), temperatureC: row.temperature_c, description: row.description,
    },
    createdAt: row.created_at.toISOString(),
  };
}

export class Store {
  constructor(readonly pool: pg.Pool) {}

  async database<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof AppError) throw error;
      logFailure('database_operation_failed');
      throw unavailable();
    }
  }

  async ready(): Promise<void> {
    await this.database(async () => { await this.pool.query('SELECT 1'); });
  }

  async loadSession(token: string | undefined): Promise<Session | null> {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    return this.database(async () => {
      const result = await this.pool.query<Session>(`
        WITH active AS (
          UPDATE sessions SET idle_expires_at = LEAST(expires_at, now() + interval '30 minutes')
          WHERE token_hash = $1 AND expires_at > now() AND idle_expires_at > now()
          RETURNING token_hash, csrf_token, user_id
        )
        SELECT active.*, users.email FROM active LEFT JOIN users ON users.id = active.user_id
      `, [tokenHash(token)]);
      return result.rows[0] ?? null;
    });
  }

  async createSession(user: User | null, old?: Session): Promise<{ token: string; session: Session }> {
    const token = secret();
    const csrf = secret();
    const session: Session = {
      token_hash: tokenHash(token), csrf_token: csrf, user_id: user?.id ?? null, email: user?.email ?? null,
    };
    return this.database(async () => {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        if (old) {
          const revoked = await client.query(`
            DELETE FROM sessions WHERE token_hash = $1 AND expires_at > now() AND idle_expires_at > now()
            RETURNING token_hash`, [old.token_hash]);
          if (!revoked.rowCount) throw new AppError(403, 'CSRF_FAILED', 'Refresh the session and try again.');
        }
        await client.query(`
          INSERT INTO sessions (token_hash, csrf_token, user_id, expires_at, idle_expires_at)
          VALUES ($1, $2, $3, now() + $4::interval, now() + interval '30 minutes')`,
        [session.token_hash, csrf, session.user_id, user ? '24 hours' : '30 minutes']);
        await client.query('COMMIT');
        return { token, session };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    });
  }

  async revokeSession(session: Session): Promise<void> {
    await this.database(async () => {
      const result = await this.pool.query(`
        DELETE FROM sessions WHERE token_hash = $1 AND expires_at > now() AND idle_expires_at > now()
        RETURNING token_hash`, [session.token_hash]);
      if (!result.rowCount) throw new AppError(403, 'CSRF_FAILED', 'Refresh the session and try again.');
    });
  }

  async account(email: string): Promise<Account | null> {
    return this.database(async () =>
      (await this.pool.query<Account>('SELECT id, email, password_hash FROM users WHERE email = $1', [email]))
        .rows[0] ?? null);
  }

  async register(email: string, hash: string): Promise<User> {
    return this.database(async () => {
      const result = await this.pool.query<User>(`
        INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)
        ON CONFLICT (email) DO NOTHING RETURNING id, email`, [`usr_${randomUUID()}`, email, hash]);
      if (!result.rows[0]) throw new AppError(409, 'EMAIL_IN_USE', 'An account already uses this email.');
      return result.rows[0];
    });
  }

  async rateLimit(key: string, limit: number, seconds: number): Promise<void> {
    await this.database(async () => {
      const result = await this.pool.query<{ count: number; retry_after: number }>(`
        INSERT INTO rate_limits (key, count, expires_at) VALUES ($1, 1, now() + $2::int * interval '1 second')
        ON CONFLICT (key) DO UPDATE SET
          count = CASE WHEN rate_limits.expires_at <= now() THEN 1 ELSE rate_limits.count + 1 END,
          expires_at = CASE WHEN rate_limits.expires_at <= now()
            THEN now() + $2::int * interval '1 second' ELSE rate_limits.expires_at END
        RETURNING count, GREATEST(1, ceil(extract(epoch FROM expires_at - now())))::int AS retry_after`,
      [tokenHash(key), seconds]);
      const row = result.rows[0];
      if (!row) throw unavailable();
      if (row.count > limit) throw new AppError(429, 'RATE_LIMITED', 'Too many requests. Try again later.',
        undefined, row.retry_after);
    });
  }

  async preferences(userId: string): Promise<Preference[]> {
    return this.database(async () => {
      const result = await this.pool.query<PreferenceRow>(
        'SELECT * FROM preferences WHERE user_id = $1 AND forecast_at IS NOT NULL ORDER BY created_at ASC, id ASC', [userId],
      );
      return result.rows.map(toPreference);
    });
  }

  async savePreference(userId: string, location: Location, snapshot: ForecastSnapshot): Promise<{ created: boolean; preference: Preference }> {
    return this.database(async () => {
      const args = [`pref_${randomUUID()}`, userId, location.name, location.countryCode,
        location.latitude, location.longitude, snapshot.forecastAt, snapshot.temperatureC, snapshot.description];
      const inserted = await this.pool.query<PreferenceRow>(`
        INSERT INTO preferences (id, user_id, name, country_code, latitude, longitude, forecast_at, temperature_c, description)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (user_id, latitude, longitude, forecast_at) DO NOTHING RETURNING *`, args);
      if (inserted.rows[0]) return { created: true, preference: toPreference(inserted.rows[0]) };
      // A separate READ COMMITTED statement sees the winner of a concurrent insert.
      const existing = await this.pool.query<PreferenceRow>(`
        SELECT * FROM preferences WHERE user_id = $1 AND latitude = $2 AND longitude = $3 AND forecast_at = $4`,
      [userId, location.latitude, location.longitude, snapshot.forecastAt]);
      if (!existing.rows[0]) throw unavailable();
      return { created: false, preference: toPreference(existing.rows[0]) };
    });
  }

  async deletePreference(userId: string, id: string): Promise<void> {
    await this.database(async () => {
      const result = await this.pool.query(
        'DELETE FROM preferences WHERE user_id = $1 AND id = $2 AND forecast_at IS NOT NULL', [userId, id],
      );
      if (!result.rowCount) throw new AppError(404, 'PREFERENCE_NOT_FOUND', 'Saved location not found.');
    });
  }
}
