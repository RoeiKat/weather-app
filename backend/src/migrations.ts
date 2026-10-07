import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import type pg from 'pg';

export async function runMigrations(pool: pg.Pool): Promise<void> {
  const directory = new URL('../migrations/', import.meta.url);
  const files = (await readdir(directory)).filter((name) => /^\d{3}_[a-z_]+\.sql$/.test(name)).sort();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(713024)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    for (const file of files) {
      const sql = await readFile(new URL(file, directory), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const applied = await client.query<{ checksum: string }>(
        'SELECT checksum FROM schema_migrations WHERE version = $1', [file],
      );
      if (applied.rows[0]) {
        if (applied.rows[0].checksum !== checksum) throw new Error('Applied migration checksum mismatch.');
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [file, checksum]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
