import { readConfig } from './config.js';
import { createPool } from './db.js';
import { logFailure } from './errors.js';
import { runMigrations } from './migrations.js';

let pool;
try {
  pool = createPool(readConfig(process.env, 'database'));
  await runMigrations(pool);
  console.info(JSON.stringify({ event: 'migrations_completed' }));
} catch {
  logFailure('migration_failed');
  process.exitCode = 1;
} finally {
  await pool?.end();
}
