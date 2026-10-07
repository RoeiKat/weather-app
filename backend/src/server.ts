import { readConfig } from './config.js';
import { logFailure } from './errors.js';
import { startBackend } from './runtime.js';

try {
  const starting = startBackend(readConfig(process.env));
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => {
      logFailure('shutdown_deadline_exceeded');
      process.exit(1);
    }, 15_000);
    deadline.unref();
    try {
      await (await starting).close();
    } catch {
      logFailure('shutdown_failed');
      process.exitCode = 1;
    } finally {
      clearTimeout(deadline);
    }
  };
  process.once('SIGTERM', () => { void shutdown(); });
  process.once('SIGINT', () => { void shutdown(); });
  await starting;
  if (!stopping) console.info(JSON.stringify({ event: 'api_started' }));
} catch {
  logFailure('api_startup_failed');
  process.exitCode = 1;
}
