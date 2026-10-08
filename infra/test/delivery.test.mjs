import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test, mock } from 'node:test';
import { candidateTraffic, findResource, immutableImage, productionTraffic, promotedTraffic, smoke } from '../scripts/azure.mjs';
import { extract } from '../scripts/frontdoor-prefixes.mjs';
import { artifactFiles, sha256, verifyManifest } from '../scripts/frontend-release.mjs';
import { release } from '../scripts/backend-release.mjs';
import { fingerprint, verifyMetadata } from '../scripts/terraform-plan.mjs';
import { administer, sqlSteps } from '../scripts/database-admin.mjs';

const image = `weatheracr.azurecr.io/weather-backend@sha256:${'a'.repeat(64)}`;
const original = [{ revisionName: 'weather-api--old', weight: 100, latestRevision: false }];
const container = { name: 'api', image, resources: { cpu: 0.5, memory: '1Gi' }, env: [{ name: 'PGSSL', value: 'true' }] };
const appFixture = () => ({
  name: 'weather-api',
  properties: {
    template: { containers: [structuredClone(container)], revisionSuffix: 'old', scale: { minReplicas: 2 } },
    latestRevisionName: 'weather-api--old',
    configuration: { ingress: { targetPort: 3000, traffic: structuredClone(original), ipSecurityRestrictions: [{ action: 'Allow', ipAddressRange: '192.0.2.0/24' }] } },
  },
});

test('main-root tagged resources ignore only policy tag keys and existing lifecycle-owned fields', () => {
  const root = resolve(import.meta.dirname, '..');
  const resources = readdirSync(root).filter((file) => file.endsWith('.tf')).flatMap((file) =>
    [...readFileSync(join(root, file), 'utf8').matchAll(/^resource "([^"]+)" "([^"]+)" \{([\s\S]*?)^\}/gm)]
  ).filter(([, , , body]) => /^  tags\s*=/m.test(body));
  const existingIgnores = {
    'azurerm_container_app.api': [
      'template[0].container[0].image', 'template[0].revision_suffix', 'ingress[0].traffic_weight',
    ],
    'azurerm_container_app_job.migrate': ['template[0].container[0].image'],
    'azurerm_postgresql_flexible_server.database': ['zone', 'high_availability[0].standby_availability_zone'],
  };
  assert.equal(resources.length, 21, 'Every tagged main-root resource must be checked.');
  for (const [, type, name, body] of resources) {
    const address = `${type}.${name}`;
    const lifecycle = [...body.matchAll(/^  lifecycle \{\r?\n([\s\S]*?)^  \}/gm)];
    assert.equal(lifecycle.length, 1, `${address} must have exactly one lifecycle block.`);
    const ignored = lifecycle[0][1].match(/^    ignore_changes\s*=\s*\[\r?\n([\s\S]*?)^    \]/m);
    assert.ok(ignored, `${address} must have an explicit ignore list.`);
    const entries = ignored[1].trim().split(/\r?\n/).map((entry) => entry.trim().replace(/,$/, ''));
    assert.deepEqual(entries, [
      ...(existingIgnores[address] ?? []), 'tags["created_By"]', 'tags["created_Date"]',
    ], `${address} must retain existing ignores and ignore only the two policy-owned tag keys.`);
    assert.match(body, /^  tags\s*=\s*local\.tags$/m, `${address} must retain Terraform-managed tags.`);
  }
});

test('release fields are named, immutable and retain known-good traffic', () => {
  const app = appFixture();
  assert.deepEqual(productionTraffic(app), original);
  const candidate = candidateTraffic(original, 'weather-api--new');
  assert.equal(candidate[0].weight, 100);
  assert.equal(candidate[1].weight, 0);
  assert.equal(candidate[1].label, 'candidate');
  const promoted = promotedTraffic(candidate, 'weather-api--new');
  assert.equal(promoted[0].weight, 0);
  assert.equal(promoted[1].weight, 100);
  assert.deepEqual(original, [{ revisionName: 'weather-api--old', weight: 100, latestRevision: false }]);
  assert.equal(immutableImage(image, 'weatheracr.azurecr.io'), image);
  assert.throws(() => immutableImage('weatheracr.azurecr.io/weather-backend:latest', 'weatheracr.azurecr.io'));
  assert.throws(() => immutableImage(image, 'another.azurecr.io'));
  app.properties.configuration.ingress.traffic[0].latestRevision = true;
  assert.throws(() => productionTraffic(app));
  app.properties.configuration.ingress.traffic = [
    { revisionName: 'old', weight: 50 }, { revisionName: 'new', weight: 50 },
  ];
  assert.throws(() => productionTraffic(app));
});

test('service-tag extraction excludes IPv6 and fails closed on wrong, empty or unsafe sources', () => {
  const document = { values: [{ name: 'AzureFrontDoor.Backend', properties: {
    changeNumber: 42, addressPrefixes: ['192.0.2.0/24', '2001:db8::/48', '192.0.2.0/24'],
  } }] };
  assert.deepEqual(extract(document), { frontdoor_backend_ipv4: ['192.0.2.0/24'], frontdoor_service_tag_change_number: '42' });
  assert.throws(() => extract({ values: [] }));
  assert.throws(() => extract({ values: [document.values[0], document.values[0]] }));
  for (const prefix of ['::/0', '0.0.0.0/0', '192.0.2.999/24', '192.0.2.0/33']) {
    document.values[0].properties.addressPrefixes = [prefix];
    assert.throws(() => extract(document));
  }
});

test('public artifact manifest permits only expected hashed assets, index and real 404', () => {
  const parent = resolve('infra/validation-output');
  mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, 'artifact-test-'));
  try {
    mkdirSync(join(directory, 'assets'));
    writeFileSync(join(directory, 'index.html'), '<html>shell</html>');
    writeFileSync(join(directory, '404.html'), 'Not found');
    writeFileSync(join(directory, 'assets', 'index-abcdefgh.js'), 'console.info("test");');
    const files = artifactFiles(directory);
    const checksums = Object.fromEntries(files.map((file) => [file.key, file.hash]));
    verifyManifest(files, checksums);
    assert.equal(files.find((file) => file.key.endsWith('.js')).type, 'text/javascript; charset=utf-8');
    assert.equal(checksums['index.html'], sha256('<html>shell</html>'));
    assert.throws(() => verifyManifest(files, { ...checksums, 'index.html': 'altered' }));
    writeFileSync(join(directory, '.env'), 'SYNTHETIC=not-a-secret');
    assert.throws(() => artifactFiles(directory));
  } finally { rmSync(directory, { recursive: true }); }
});

test('smoke checks enforce target, no-store and response shape without retaining session values', async () => {
  const mocked = mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.headers['X-Weather-Release-Target'], 'candidate');
    return new Response(JSON.stringify(url.endsWith('/health') ? { status: 'ok' } : { user: null, csrfToken: 'synthetic' }), {
      status: 200, headers: { 'Cache-Control': 'no-store', 'X-Weather-Release-Target': 'candidate' },
    });
  });
  try {
    await smoke('https://weather.example', true);
    mocked.mock.mockImplementation(async () => new Response('{}', { status: 200 }));
    await assert.rejects(smoke('https://weather.example', true), /status\/cache\/target/);
    await assert.rejects(smoke('http://weather.example'), /HTTPS/);
  } finally { mocked.mock.restore(); }
});

for (const scenario of ['migration-failure', 'promotion-failure', 'success', 'rollback', 'platform-unchanged', 'platform-propagation']) {
test(`release orchestration: ${scenario}`, async () => {
  const parent = resolve('infra/validation-output');
  mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, 'release-test-'));
  const cwd = process.cwd();
  const environment = { ...process.env };
  const app = appFixture();
  const calls = [];
  const originalTemplate = structuredClone(app.properties.template);
  const originalIngress = structuredClone(app.properties.configuration.ingress);
  const revisions = new Map(['weather-api--old', 'weather-api--retained'].map((name) => [name, {
    name, properties: {
      active: name !== 'weather-api--retained', healthState: 'Healthy', provisioningState: 'Provisioned',
      template: originalTemplate,
    },
  }]));
  const jobTemplate = { containers: [{ name: 'migration', image, command: ['npm'], args: ['run', 'migrate'], env: [] }] };
  let started = false;
  let smokeRequests = 0;
  const command = mock.method(childProcess, 'execFileSync', (_binary, args) => {
    assert.equal(_binary, 'az');
    if (args[0] === 'group' && args[1] === 'exists') return 'true';
    const url = new URL(args[args.indexOf('--url') + 1]);
    const method = args[args.indexOf('--method') + 1];
    const body = args.includes('--body') ? JSON.parse(args[args.indexOf('--body') + 1]) : null;
    calls.push({ method, path: url.pathname, body });
    let result;
    if (url.pathname.endsWith('/containerApps')) {
      result = { value: [app] };
    } else if (url.pathname.endsWith('/start')) {
      assert.equal(body.containers[0].image, image);
      started = true;
      result = { name: 'execution1' };
    } else if (url.pathname.endsWith('/executions/execution1')) {
      result = { properties: { status: scenario === 'migration-failure' ? 'Failed' : 'Succeeded', template: jobTemplate } };
    } else if (url.pathname.endsWith('/executions')) {
      result = { value: started ? [{ name: 'execution1', properties: { status: 'Running' } }] : [] };
    } else if (url.pathname.endsWith('/weather-migrate')) {
      result = { properties: { template: jobTemplate } };
    } else if (url.pathname.endsWith('/replicas')) {
      result = { value: [1, 2].map(() => ({ properties: { containers: [{ ready: true }] } })) };
    } else if (url.pathname.endsWith('/revisions')) {
      result = { value: [...revisions.values()] };
    } else if (url.pathname.endsWith('/activate')) {
      revisions.get(url.pathname.split('/').at(-2)).properties.active = true;
      result = null;
    } else if (url.pathname.includes('/revisions/')) {
      result = revisions.get(url.pathname.split('/').at(-1));
    } else if (url.pathname.endsWith('/weather-api')) {
      if (method === 'patch' && body.properties.template) {
        const template = body.properties.template;
        app.properties.template = template;
        const name = `weather-api--${template.revisionSuffix}`;
        app.properties.latestRevisionName = name;
        revisions.set(name, { name, properties: {
          active: true, healthState: 'Healthy', provisioningState: 'Provisioned', template,
        } });
      } else if (method === 'patch') {
        app.properties.configuration.ingress = body.properties.configuration.ingress;
      }
      result = app;
    } else { throw new Error(`Unexpected fake Azure path: ${url.pathname}`); }
    return JSON.stringify(result);
  });
  syncBuiltinESMExports();
  const fetchMock = mock.method(globalThis, 'fetch', async (url, options) => {
    smokeRequests++;
    const candidate = options.headers['X-Weather-Release-Target'] === 'candidate';
    const failed = (scenario === 'promotion-failure' && !candidate &&
      app.properties.configuration.ingress.traffic.some((item) => item.weight === 100 && item.revisionName !== 'weather-api--old')) ||
      (scenario === 'platform-propagation' && smokeRequests === 1);
    return new Response(JSON.stringify(
      url.endsWith('/health') ? { status: 'ok' } : { user: null, csrfToken: 'synthetic' },
    ), { status: failed ? 503 : 200, headers: {
      'Cache-Control': 'no-store', ...(candidate ? { 'X-Weather-Release-Target': 'candidate' } : {}),
    } });
  });
  const timerMock = mock.method(globalThis, 'setTimeout', (callback) => { queueMicrotask(callback); });
  try {
    process.chdir(directory);
    Object.assign(process.env, {
      AZURE_RESOURCE_GROUP: 'weather-prod', AZURE_SUBSCRIPTION_ID: 'synthetic',
      ACA_APP_NAME: 'weather-api', MIGRATION_JOB_NAME: 'weather-migrate',
      PUBLIC_URL: 'https://weather.example', ACR_LOGIN_SERVER: 'weatheracr.azurecr.io',
      RELEASE_IMAGE: image, GITHUB_SHA: 'synthetic-commit', GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '1',
    });
    delete process.env.GITHUB_STEP_SUMMARY;
    delete process.env.ROLLBACK_REVISION;
    delete process.env.PLATFORM_REVISION_ONLY;
    delete process.env.BOOTSTRAP_ONLY;
    if (scenario === 'rollback') {
      process.env.ROLLBACK_REVISION = 'weather-api--retained';
      process.env.SCHEMA_COMPATIBILITY_APPROVED = 'true';
    }
    if (scenario.startsWith('platform-')) process.env.PLATFORM_REVISION_ONLY = 'true';
    if (scenario === 'migration-failure') {
      await assert.rejects(release(), /Migration Failed/);
      assert.equal(calls.filter((call) => call.body?.properties?.template).length, 0);
      assert.deepEqual(app.properties.template, originalTemplate);
      assert.deepEqual(app.properties.configuration.ingress, originalIngress);
    } else if (scenario === 'promotion-failure') {
      await assert.rejects(release(), /Smoke/);
      assert.deepEqual(app.properties.configuration.ingress, originalIngress);
    } else {
      await release();
      const expected = scenario === 'rollback' ? 'weather-api--retained' :
        scenario.startsWith('platform-') ? 'weather-api--old' : 'weather-api--r42-1';
      assert.equal(app.properties.configuration.ingress.traffic.find((item) => item.weight === 100).revisionName, expected);
      if (scenario === 'rollback' || scenario.startsWith('platform-')) assert.equal(started, false);
    }
    assert.deepEqual(app.properties.configuration.ingress.ipSecurityRestrictions, originalIngress.ipSecurityRestrictions);
    assert.deepEqual(app.properties.template.containers[0].env, originalTemplate.containers[0].env);
    assert.deepEqual(app.properties.template.scale, originalTemplate.scale);
    const receipt = JSON.parse(readFileSync('release-receipt.json', 'utf8'));
    assert.equal(receipt.outcome, scenario.endsWith('failure') ? 'failed' : scenario.startsWith('platform-') ? 'unchanged' : 'promoted');
    if (scenario === 'promotion-failure') assert.match(receipt.recovery, /restored/);
    assert.equal(JSON.stringify(receipt).includes('csrfToken'), false);
  } finally {
    command.mock.restore();
    syncBuiltinESMExports();
    fetchMock.mock.restore();
    timerMock.mock.restore();
    process.chdir(cwd);
    for (const key of Object.keys(process.env)) if (!(key in environment)) delete process.env[key];
    Object.assign(process.env, environment);
    rmSync(directory, { recursive: true });
  }
});
}

test('first-plan fingerprint supports absent group/resources and detects their creation; Azure errors fail closed', () => {
  const options = { group: 'weather-prod', subscription: 'synthetic', appName: 'weather-api', jobName: 'weather-migrate' };
  let exists = false;
  let app = null;
  let job = null;
  const command = mock.method(childProcess, 'execFileSync', (_binary, args) => {
    if (args[0] === 'group') return JSON.stringify(exists);
    const path = new URL(args[args.indexOf('--url') + 1]).pathname;
    return JSON.stringify({ value: path.endsWith('/containerApps') ? (app ? [app] : []) : (job ? [job] : []) });
  });
  syncBuiltinESMExports();
  try {
    const empty = fingerprint(options);
    exists = true;
    assert.equal(fingerprint(options), empty);
    job = { name: 'weather-migrate', properties: { template: { containers: [{ image }] } } };
    const core = fingerprint(options);
    assert.notEqual(core, empty);
    app = appFixture();
    const deployed = fingerprint(options);
    assert.notEqual(deployed, core);
    app.properties.template.containers[0].image = image.replace('a'.repeat(64), 'b'.repeat(64));
    assert.notEqual(fingerprint(options), deployed);
    command.mock.mockImplementation(() => { throw Object.assign(new Error('SYNTHETIC auth failure'), { status: 1 }); });
    assert.throws(() => fingerprint(options), /Azure command failed/);
    assert.throws(() => findResource('not-a-resource-id'), /Invalid Container/);
  } finally { command.mock.restore(); syncBuiltinESMExports(); }
});

test('saved plans reject creation/release drift, altered bytes/inputs and expired plans', () => {
  const environment = { ...process.env };
  Object.assign(process.env, { GITHUB_SHA: 'commit', GITHUB_REPOSITORY: 'RoeiKat/weather-app', PLAN_RUN_ID: '1', PLAN_RUN_ATTEMPT: '1' });
  const inputs = { bootstrap_image: null };
  const bytes = Buffer.from('synthetic plan');
  const now = Date.now();
  const metadata = {
    sha: 'commit', repository: 'RoeiKat/weather-app', run: '1', attempt: '1',
    created: new Date(now).toISOString(), configHash: sha256(JSON.stringify(inputs)),
    planHash: sha256(bytes), fingerprint: 'missing-resources',
  };
  try {
    verifyMetadata(metadata, inputs, 'missing-resources', bytes, now);
    assert.throws(() => verifyMetadata(metadata, inputs, 'created-resources', bytes, now), /stale/);
    assert.throws(() => verifyMetadata(metadata, { bootstrap_image: image }, 'missing-resources', bytes, now), /stale/);
    assert.throws(() => verifyMetadata(metadata, inputs, 'missing-resources', Buffer.from('altered'), now), /stale/);
    assert.throws(() => verifyMetadata(metadata, inputs, 'missing-resources', bytes, now + 24 * 60 * 60 * 1000 + 1), /stale/);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in environment)) delete process.env[key];
    Object.assign(process.env, environment);
  }
});

for (const scenario of ['core-apply', 'core-missing-job', 'missing-expected-api', 'prepare', 'prepare-failure', 'missing-job', 'deploy-before-bootstrap', 'overlap']) {
test(`first deployment: ${scenario}`, async () => {
  const parent = resolve('infra/validation-output');
  mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, 'bootstrap-test-'));
  const cwd = process.cwd();
  const environment = { ...process.env };
  const template = { containers: [{ name: 'migration', image, command: ['npm'], args: ['run', 'migrate'], env: [] }] };
  let started = false;
  let executionTemplate;
  const command = mock.method(childProcess, 'execFileSync', (_binary, args) => {
    if (args[0] === 'group') return 'true';
    const path = new URL(args[args.indexOf('--url') + 1]).pathname;
    const method = args[args.indexOf('--method') + 1];
    assert.notEqual(method, 'patch', 'First deployment must not mutate API or Job platform templates.');
    if (path.endsWith('/containerApps')) return '{"value":[]}';
    if (path.endsWith('/jobs')) return JSON.stringify({ value: ['missing-job', 'core-missing-job'].includes(scenario) ? [] : [{ name: 'weather-migrate' }] });
    if (path.endsWith('/weather-migrate')) return JSON.stringify({ properties: { template } });
    if (path.endsWith('/start')) {
      executionTemplate = JSON.parse(args[args.indexOf('--body') + 1]);
      assert.equal(executionTemplate.containers[0].image, image);
      assert.deepEqual(executionTemplate.containers[0].command, ['npm']);
      assert.deepEqual(executionTemplate.containers[0].args, ['run', 'migrate']);
      started = true;
      return '{"name":"execution1"}';
    }
    if (path.endsWith('/executions/execution1')) return JSON.stringify({ properties: {
      status: scenario === 'prepare-failure' ? 'Failed' : 'Succeeded', template: executionTemplate,
    } });
    if (path.endsWith('/executions')) return JSON.stringify({
      value: started || scenario === 'overlap' ? [{ name: 'execution1', properties: { status: 'Running' } }] : [],
    });
    throw new Error(`Unexpected bootstrap Azure call: ${path}`);
  });
  syncBuiltinESMExports();
  const fetchMock = mock.method(globalThis, 'fetch', () => { throw new Error('Absent API must not receive smoke traffic.'); });
  try {
    process.chdir(directory);
    Object.assign(process.env, {
      AZURE_RESOURCE_GROUP: 'weather-prod', AZURE_SUBSCRIPTION_ID: 'synthetic',
      ACA_APP_NAME: 'weather-api', MIGRATION_JOB_NAME: 'weather-migrate',
      ACR_LOGIN_SERVER: 'weatheracr.azurecr.io', RELEASE_IMAGE: image,
      GITHUB_SHA: 'commit', GITHUB_RUN_ID: '1', BOOTSTRAP_ONLY: 'true',
    });
    delete process.env.GITHUB_STEP_SUMMARY;
    delete process.env.PLATFORM_REVISION_ONLY;
    if (['core-apply', 'core-missing-job', 'missing-expected-api'].includes(scenario)) {
      process.env.PLATFORM_REVISION_ONLY = 'true';
      process.env.EXPECT_API_CREATED = scenario === 'missing-expected-api' ? 'true' : 'false';
    }
    if (scenario === 'deploy-before-bootstrap') delete process.env.BOOTSTRAP_ONLY;
    const error = {
      'prepare-failure': /Migration Failed/, 'missing-job': /Create core infrastructure/,
      'deploy-before-bootstrap': /First deployment requires/, overlap: /refusing overlap/,
      'core-missing-job': /Expected core migration Job/, 'missing-expected-api': /Terraform expected an API/,
    }[scenario];
    if (error) await assert.rejects(release(), error);
    else await release();
    const receipt = JSON.parse(readFileSync('release-receipt.json', 'utf8'));
    assert.equal(receipt.outcome, error ? 'failed' : scenario === 'core-apply' ? 'core-infrastructure-only' : 'prepared-not-deployed');
    assert.equal(started, scenario === 'prepare' || scenario === 'prepare-failure');
  } finally {
    command.mock.restore(); syncBuiltinESMExports(); fetchMock.mock.restore();
    process.chdir(cwd);
    for (const key of Object.keys(process.env)) if (!(key in environment)) delete process.env[key];
    Object.assign(process.env, environment);
    rmSync(directory, { recursive: true });
  }
});
}

test('private human SQL bootstrap renders actual SQL phases safely and cannot run as CI', async () => {
  const values = {
    api_role: 'weather-api', api_object_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    migration_role: 'weather-migrator', migration_object_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  };
  const steps = sqlSteps(readFileSync(new URL('../scripts/bootstrap-database.sql', import.meta.url), 'utf8'), values);
  assert.deepEqual(steps.map((step) => step.database), ['postgres', 'weather']);
  assert.match(steps[0].sql, /pgaadauth_create_principal_with_oid\('weather-api'/);
  assert.match(steps[0].sql, /GRANT "weather-migrator" TO CURRENT_USER/);
  assert.match(steps[1].sql, /GRANT USAGE, CREATE ON SCHEMA public TO "weather-migrator"/);
  const grants = sqlSteps(readFileSync(new URL('../scripts/grant-runtime.sql', import.meta.url), 'utf8'), values);
  assert.match(grants[0].sql, /SET ROLE "weather-migrator"/);
  assert.match(grants[0].sql, /REVOKE ALL ON public.schema_migrations FROM "weather-api"/);
  assert.throws(() => sqlSteps('\\connect weather\nGRANT USAGE TO :"api_role";', { api_role: 'bad"; SQL' }), /Invalid SQL/);
  assert.throws(() => sqlSteps('\\connect weather\n\\include another-file', values), /Unsupported/);
  const previous = process.env.GITHUB_ACTIONS;
  process.env.GITHUB_ACTIONS = 'true';
  try { await assert.rejects(administer('principals'), /human administrator/); }
  finally {
    if (previous === undefined) delete process.env.GITHUB_ACTIONS;
    else process.env.GITHUB_ACTIONS = previous;
  }
});

for (const scenario of ['success', 'job-failure', 'cleanup-failure', 'nonhuman-credential']) {
test(`human SQL Job token lifecycle: ${scenario}`, async () => {
  const environment = { ...process.env };
  const values = {
    api_role: 'weather-api', api_object_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    migration_role: 'weather-migrator', migration_object_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    fqdn: 'weather-postgres.postgres.database.azure.com',
  };
  let started = false;
  let executionTemplate;
  const secretUpdates = [];
  const command = mock.method(childProcess, 'execFileSync', (binary, args) => {
    if (binary === 'terraform') return JSON.stringify(values);
    if (args[0] === 'account' && args[1] === 'show') {
      return JSON.stringify({ user: { type: scenario === 'nonhuman-credential' ? 'servicePrincipal' : 'user' } });
    }
    if (args[0] === 'account' && args[1] === 'get-access-token') return '{"accessToken":"synthetic-token"}';
    const path = new URL(args[args.indexOf('--url') + 1]).pathname;
    const method = args[args.indexOf('--method') + 1];
    const body = args.includes('--body') ? JSON.parse(args[args.indexOf('--body') + 1]) : null;
    if (path.endsWith('/weather-migrate')) {
      if (method === 'patch') {
        secretUpdates.push(body.properties.configuration.secrets);
        if (scenario === 'cleanup-failure' && body.properties.configuration.secrets.length === 0) {
          throw Object.assign(new Error('synthetic cleanup error'), { status: 1 });
        }
      }
      return JSON.stringify({ properties: {
        configuration: { triggerType: 'Manual', secrets: [] },
        template: { containers: [{ name: 'migration', image, command: ['npm'], args: ['run', 'migrate'],
          env: [{ name: 'PGHOST', value: values.fqdn }] }] },
      } });
    }
    if (path.endsWith('/start')) {
      executionTemplate = body;
      started = true;
      const container = body.containers[0];
      assert.equal(container.image, image);
      assert.deepEqual(container.command, ['node']);
      assert.match(container.args[2], /pgaadauth_create_principal_with_oid/);
      assert.equal(JSON.stringify(body).includes('synthetic-token'), false);
      assert.deepEqual(container.env.find((item) => item.name === 'PGADMIN_TOKEN'), {
        name: 'PGADMIN_TOKEN', secretRef: 'temporary-sql-admin',
      });
      return '{"name":"admin1"}';
    }
    if (path.endsWith('/executions/admin1')) return JSON.stringify({ properties: {
      status: scenario === 'job-failure' ? 'Failed' : 'Succeeded', template: executionTemplate,
    } });
    if (path.endsWith('/executions')) return JSON.stringify({ value: started ? [{ name: 'admin1', properties: { status: 'Running' } }] : [] });
    throw new Error(`Unexpected human bootstrap fake path ${path}`);
  });
  syncBuiltinESMExports();
  try {
    Object.assign(process.env, {
      AZURE_SUBSCRIPTION_ID: 'synthetic', AZURE_RESOURCE_GROUP: 'weather-prod',
      MIGRATION_JOB_NAME: 'weather-migrate', RELEASE_IMAGE: image,
      ACR_LOGIN_SERVER: 'weatheracr.azurecr.io', PGADMIN_NAME: 'human@example.test',
    });
    delete process.env.GITHUB_ACTIONS;
    if (scenario === 'nonhuman-credential') {
      await assert.rejects(administer('principals'), /approved human/);
      assert.deepEqual(secretUpdates, []);
    } else {
      if (scenario === 'cleanup-failure') await assert.rejects(administer('principals'), /token removal FAILED/);
      else if (scenario === 'job-failure') await assert.rejects(administer('principals'), /Database administration Failed/);
      else await administer('principals');
      assert.deepEqual(secretUpdates, [[{ name: 'temporary-sql-admin', value: 'synthetic-token' }], []]);
      assert.equal(started, true);
    }
  } finally {
    command.mock.restore(); syncBuiltinESMExports();
    for (const key of Object.keys(process.env)) if (!(key in environment)) delete process.env[key];
    Object.assign(process.env, environment);
  }
});
}
