import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { az, immutableImage, list, required, rest } from './azure.mjs';
import { executeJob } from './backend-release.mjs';

export function sqlSteps(source, values) {
  const steps = [];
  let current;
  for (const line of source.split(/\r?\n/)) {
    if (line === '\\set ON_ERROR_STOP on') continue;
    if (line.startsWith('\\connect ')) {
      const database = line.slice(9);
      if (!['postgres', 'weather'].includes(database)) throw new Error('Unexpected SQL bootstrap database.');
      current = { database, sql: '' };
      steps.push(current);
    } else {
      if (!current || line.startsWith('\\')) throw new Error('Unsupported SQL bootstrap directive.');
      current.sql += `${line}\n`;
    }
  }
  if (steps.length === 0) throw new Error('SQL bootstrap has no database connection.');
  for (const step of steps) {
    step.sql = step.sql.replace(/:'([a-z_]+)'|:"([a-z_]+)"/g, (_match, literal, identifier) => {
      const value = values[literal ?? identifier];
      if (typeof value !== 'string' || !/^[a-zA-Z0-9-]+$/.test(value)) throw new Error('Invalid SQL bootstrap identity.');
      return literal ? `'${value}'` : `"${value}"`;
    });
  }
  return steps;
}

export async function administer(mode) {
  if (!['principals', 'grants'].includes(mode)) throw new Error('Use principals before migrations or grants afterward.');
  if (process.env.GITHUB_ACTIONS === 'true') throw new Error('SQL bootstrap is a human administrator operation, not a CI step.');
  const subscription = required('AZURE_SUBSCRIPTION_ID');
  const account = az(['account', 'show', '--subscription', subscription]);
  if (account.user?.type !== 'user') throw new Error('Log in as the approved human Entra SQL administrator.');
  let values;
  let failure;
  try {
    values = JSON.parse(execFileSync('terraform', ['-chdir=infra', 'output', '-json', 'database_bootstrap'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }));
  } catch { throw new Error('Cannot read database_bootstrap from the initialized Terraform root; check human state access.'); }
  const script = mode === 'principals' ? 'bootstrap-database.sql' : 'grant-runtime.sql';
  const steps = sqlSteps(readFileSync(new URL(script, import.meta.url), 'utf8'), values);
  const id = `/subscriptions/${subscription}/resourceGroups/${required('AZURE_RESOURCE_GROUP')}/providers/Microsoft.App/jobs/${required('MIGRATION_JOB_NAME')}`;
  const job = rest('get', id);
  const configuration = job.properties.configuration;
  if (configuration.secrets?.length) throw new Error('Unexpected Job secrets; refusing to overwrite another operator configuration.');
  if (list(id, '/executions').some((execution) => execution.properties.status === 'Running')) {
    throw new Error('Pause releases and wait for the active Job before SQL administration.');
  }
  const template = structuredClone(job.properties.template);
  if (template.containers.length !== 1 || template.containers[0].name !== 'migration') {
    throw new Error('Unexpected migration Job template.');
  }
  const container = template.containers[0];
  if (container.env.find((item) => item.name === 'PGHOST')?.value !== values.fqdn) {
    throw new Error('Job and Terraform PostgreSQL hosts do not match.');
  }
  container.image = immutableImage(required('RELEASE_IMAGE'), required('ACR_LOGIN_SERVER'));
  container.command = ['node'];
  container.args = ['--input-type=module', '--eval', `
    import pg from 'pg';
    const steps = ${JSON.stringify(steps)};
    try {
      for (const step of steps) {
        const client = new pg.Client({
          host: process.env.PGHOST, port: 5432, database: step.database,
          user: process.env.PGADMIN_USER, password: process.env.PGADMIN_TOKEN,
          ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 10000,
          statement_timeout: 30000,
        });
        try {
          await client.connect();
          await client.query(step.sql);
          const roles = await client.query(
            'SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication FROM pg_roles WHERE rolname = ANY($1::text[])',
            [${JSON.stringify([values.api_role, values.migration_role])}],
          );
          if (roles.rows.length !== 2 || roles.rows.some((role) => Object.values(role).some(Boolean))) {
            throw new Error('Unexpected elevated workload role.');
          }
        } finally { await client.end(); }
      }
      console.info('Human SQL bootstrap completed.');
    } catch (error) { console.error('Human SQL bootstrap failed (SQLSTATE ' + (error.code ?? 'connection/runtime') + '); inspect principal permissions and bootstrap phase. No credentials are logged.'); process.exitCode = 1; }
  `];
  container.env.push(
    { name: 'PGADMIN_USER', value: required('PGADMIN_NAME') },
    { name: 'PGADMIN_TOKEN', secretRef: 'temporary-sql-admin' },
  );
  const token = az(['account', 'get-access-token', '--subscription', subscription,
    '--resource', 'https://ossrdbms-aad.database.windows.net']).accessToken;
  if (typeof token !== 'string' || !token) throw new Error('Azure returned no SQL administrator token.');
  try {
    rest('patch', id, { properties: { configuration: {
      ...configuration, secrets: [{ name: 'temporary-sql-admin', value: token }],
    } } });
    const execution = await executeJob(id, template, 'Database administration');
    console.info(`Human SQL phase ${mode} completed in private Job execution ${execution}.`);
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    try {
      rest('patch', id, { properties: { configuration: { ...configuration, secrets: [] } } });
    } catch (error) {
      throw new AggregateError([failure, error].filter(Boolean),
        `Temporary SQL administrator token removal FAILED; pause releases and remove the Job secret with human authorization. ${failure ? `SQL operation also failed: ${failure.message}` : 'SQL operation completed; cleanup still failed.'}`);
    }
    console.info('Removed temporary SQL administrator token from Job configuration.');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { await administer(process.argv[2]); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
