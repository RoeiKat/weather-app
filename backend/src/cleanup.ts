import { readConfig } from './config.js';
import { createPool } from './db.js';
import { logFailure } from './errors.js';

let pool;
try {
  pool = createPool(readConfig(process.env, 'database'));
  await pool.query('DELETE FROM sessions WHERE expires_at <= now() OR idle_expires_at <= now()');
  await pool.query('DELETE FROM rate_limits WHERE expires_at <= now()');
  console.info(JSON.stringify({ event: 'expired_state_cleanup_completed' }));
} catch {
  logFailure('expired_state_cleanup_failed');
  process.exitCode = 1;
} finally {
  await pool?.end();
}
