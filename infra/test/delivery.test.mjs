import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import timers from 'node:timers/promises';
import { join, resolve } from 'node:path';
import { test, mock } from 'node:test';
import { az, azureCommand, candidateTraffic, findResource, immutableImage, productionTraffic, promotedTraffic, rest, smoke, trafficMatches } from '../scripts/azure.mjs';
import { extract } from '../scripts/frontdoor-prefixes.mjs';
import { artifactFiles, frontendSmoke, sha256, verifyManifest } from '../scripts/frontend-release.mjs';
import { release } from '../scripts/backend-release.mjs';
import { fingerprint, platformInputs, verifyMetadata } from '../scripts/terraform-plan.mjs';
import { administer, sqlSteps } from '../scripts/database-admin.mjs';
import { changedSurfaces } from '../scripts/delivery-changes.mjs';

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

function azureCliArgs(binary, args) {
  const command = azureCommand([]);
  assert.equal(binary, command.executable);
  assert.deepEqual(args.slice(0, command.args.length), command.args);
  const cliArgs = args.slice(command.args.length);
  assert.deepEqual(cliArgs.slice(-3), ['--only-show-errors', '--output', 'json']);
  return cliArgs;
}

function azureBody(args) {
  const index = args.indexOf('--body');
  if (index === -1) return null;
  const value = args[index + 1];
  assert.ok(value.startsWith('@') && !value.startsWith('@{'), 'REST must use the CLI @path file convention, not literal @{path}.');
  return JSON.parse(readFileSync(value.slice(1), 'utf8'));
}

function assertJobExecutionBody(body) {
  assert.ok(Object.keys(body).every((key) => ['containers', 'initContainers'].includes(key)));
  for (const container of [...body.containers, ...(body.initContainers ?? [])]) {
    assert.ok(Object.keys(container).every((key) => ['name', 'image', 'command', 'args', 'env', 'resources'].includes(key)));
  }
}

test('CLI transport is shell-free and resolves the installed Windows launcher interpreter', () => {
  const directory = mkdtempSync(join(tmpdir(), 'weather cli & % ! '));
  const wbin = join(directory, 'wbin');
  const args = ['rest', '--method', 'patch', '--body', `@${join(directory, 'body with spaces.json')}`];
  const originalArgs = [...args];
  try {
    mkdirSync(wbin);
    writeFileSync(join(wbin, 'az.cmd'), 'synthetic launcher');
    const python = join(directory, 'python.exe');
    writeFileSync(python, '');
    for (const platform of ['linux', 'darwin']) {
      assert.deepEqual(azureCommand(args, platform), { executable: 'az', args });
    }
    const command = azureCommand(args, 'win32', `"${wbin}"`);
    assert.equal(command.executable, python);
    assert.deepEqual(command.args, ['-IBm', 'azure.cli', ...args]);
    assert.deepEqual(args, originalArgs);
    assert.throws(() => azureCommand(args, 'win32', directory), /not found on PATH/);
    rmSync(python);
    assert.throws(() => azureCommand(args, 'win32', wbin), /no companion python.exe/);
    writeFileSync(join(wbin, 'az.exe'), '');
    assert.deepEqual(azureCommand(args, 'win32', wbin), { executable: join(wbin, 'az.exe'), args });
  } finally { rmSync(directory, { recursive: true }); }
});

test('REST file transport preserves JSON and removes the file after success, CLI failure or invalid output', () => {
  const id = '/subscriptions/synthetic/resourceGroups/weather-prod/providers/Microsoft.App/jobs/weather-migrate';
  const body = { properties: { configuration: { secrets: [{ name: 'temporary-sql-admin', value: 'synthetic-private-token' }] } },
    text: 'spaces "quotes" \\ slashes\n & | % ! ^ < >', args: ['node', '--eval', 'console.log("synthetic")'] };
  let scenario = 'success';
  const files = [];
  const command = mock.method(childProcess, 'execFileSync', (binary, executableArgs) => {
    const args = azureCliArgs(binary, executableArgs);
    assert.deepEqual(azureBody(args), body);
    assert.equal(executableArgs.some((arg) => arg.includes('synthetic-private-token')), false);
    assert.equal(new URL(args[args.indexOf('--url') + 1]).searchParams.get('api-version'), '2025-07-01');
    files.push(args[args.indexOf('--body') + 1].slice(1));
    if (scenario === 'failure') {
      throw Object.assign(new Error(`Raw command ${JSON.stringify(body)}`), {
        status: 1, stderr: `ERROR: Unsupported Media Type({"error":{"code":"UnsupportedMediaType","message":"Content type is not supported."},"request":${JSON.stringify(body)}})`,
      });
    }
    return scenario === 'invalid-output' ? '{"accessToken":"synthetic-private-token"' : '{"ok":true}';
  });
  syncBuiltinESMExports();
  try {
    assert.deepEqual(rest('patch', id, body, '', 'Attach temporary SQL administrator token'), { ok: true });
    scenario = 'failure';
    assert.throws(() => rest('patch', id, body, '', 'Attach temporary SQL administrator token'), (error) => {
      assert.match(error.message, /rest patch \(Attach temporary SQL administrator token\)/);
      assert.match(error.message, /UnsupportedMediaType: Content type is not supported/);
      assert.equal(error.message.includes('synthetic-private-token'), false);
      assert.equal(error.message.includes(JSON.stringify(body)), false);
      assert.equal(error.cause, undefined, 'Raw subprocess error must not be retained.');
      return true;
    });
    scenario = 'invalid-output';
    assert.throws(() => rest('patch', id, body), /invalid JSON; response withheld/);
    const cyclic = {};
    cyclic.self = cyclic;
    assert.throws(() => rest('patch', id, cyclic), /circular/i);
    assert.equal(files.length, 3, 'Invalid input must fail before allocating a body file or executing the CLI.');
    for (const file of files) {
      assert.equal(existsSync(file), false);
      assert.equal(existsSync(resolve(file, '..')), false);
    }
    assert.equal(azureBody(['group', 'exists']), null);
    assert.throws(() => azureBody(['rest', '--body', `@${files[0]}`]), { code: 'ENOENT' });
    const fixtureDirectory = mkdtempSync(join(tmpdir(), 'weather-body-fixture-'));
    try {
      const fixture = join(fixtureDirectory, 'body with spaces.json');
      writeFileSync(fixture, '{');
      assert.throws(() => azureBody(['rest', '--body', `@${fixture}`]), SyntaxError);
      assert.throws(() => azureBody(['rest', '--body', `@{${fixture}}`]), /@path file convention/);
    } finally { rmSync(fixtureDirectory, { recursive: true }); }
  } finally { command.mock.restore(); syncBuiltinESMExports(); }
});

test('CLI diagnostics expose errors, not tokens, bodies, personal data or raw process output', () => {
  const previous = process.env.SYNTHETIC_ACCESS_TOKEN;
  process.env.SYNTHETIC_ACCESS_TOKEN = 'synthetic-environment-token';
  let stderr;
  const command = mock.method(childProcess, 'execFileSync', () => {
    throw Object.assign(new Error('Raw command contains synthetic-private-token'), {
      code: 'ETIMEDOUT', status: 1, signal: 'SIGTERM', stderr,
      stdout: '{"accessToken":"synthetic-stdout-token"}',
    });
  });
  syncBuiltinESMExports();
  try {
    for (stderr of [
      'ERROR: (AuthorizationFailed) Permission denied.\nRequest body: {"secret":"synthetic-private-token"}',
      'ERROR: Bad Request({"error":{"code":"InvalidParameter","message":"Invalid input."},"request":{"secret":"synthetic-private-token"}})',
      'ERROR: Bad Request({"title":"One or more validation errors occurred.","status":400,"errors":{"$":["Unknown properties volumes in StartJobExecutionTemplate are not supported"]},"request":{"secret":"synthetic-private-token"}})',
      'ERROR: Authentication failed for human@example.test using synthetic-environment-token',
      'ERROR: Authorization: Bearer eyJsynthetic.eyJpayload.syntheticSignature',
      'ERROR: Password=synthetic-unstructured-password',
      'ERROR: Invalid JSON {"secrets":[{"value":"synthetic-private-token"}]}',
      undefined,
    ]) {
      assert.throws(() => az(['account', 'show']), (error) => {
        assert.match(error.message, /code ETIMEDOUT, status 1, signal SIGTERM/);
        for (const secret of ['synthetic-private-token', 'synthetic-stdout-token', 'synthetic-environment-token',
          'human@example.test', 'eyJsynthetic', 'synthetic-unstructured-password', '"secrets"']) {
          assert.equal(error.message.includes(secret), false);
        }
        if (stderr?.includes('AuthorizationFailed')) assert.match(error.message, /AuthorizationFailed.*Permission denied/);
        if (stderr?.includes('InvalidParameter')) assert.match(error.message, /InvalidParameter: Invalid input/);
        if (stderr?.includes('StartJobExecutionTemplate')) assert.match(error.message, /Unknown properties volumes in StartJobExecutionTemplate are not supported/);
        return true;
      });
    }
  } finally {
    command.mock.restore(); syncBuiltinESMExports();
    if (previous === undefined) delete process.env.SYNTHETIC_ACCESS_TOKEN;
    else process.env.SYNTHETIC_ACCESS_TOKEN = previous;
  }
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

for (const scenario of ['previous-health-failure', 'migration-failure', 'promotion-failure', 'wrong-candidate-image-failure', 'arm-normalization', 'success', 'rollback', 'platform-unchanged', 'platform-propagation']) {
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
  const jobTemplate = { containers: [{ name: 'migration', image, command: ['npm'], args: ['run', 'migrate'], env: [], probes: [],
    resources: { cpu: 0.5, memory: '1Gi' } }], volumes: [], initContainers: scenario === 'success' ? [{
      name: 'init', image, command: ['node'], args: ['--version'], env: [], probes: [], resources: { cpu: 0.5, memory: '1Gi' },
    }] : [] };
  let started = false;
  if (scenario === 'arm-normalization') {
    revisions.set('weather-api--superseded', { name: 'weather-api--superseded', properties: {
      active: true, healthState: 'Healthy', provisioningState: 'Provisioned', template: originalTemplate,
    } });
  }
  if (scenario === 'previous-health-failure') {
    Object.assign(revisions.get('weather-api--old').properties, { runningState: 'ActivationFailed', healthState: 'Unhealthy' });
  }
  let smokeRequests = 0;
  const command = mock.method(childProcess, 'execFileSync', (binary, executableArgs) => {
    const args = azureCliArgs(binary, executableArgs);
    if (args[0] === 'group' && args[1] === 'exists') return 'true';
    const url = new URL(args[args.indexOf('--url') + 1]);
    const method = args[args.indexOf('--method') + 1];
    const body = azureBody(args);
    calls.push({ method, path: url.pathname, body });
    let result;
    if (url.pathname.endsWith('/containerApps')) {
      result = { value: [app] };
    } else if (url.pathname.endsWith('/start')) {
      assertJobExecutionBody(body);
      assert.deepEqual(body.containers[0].resources, jobTemplate.containers[0].resources);
      if (scenario === 'success') {
        assert.equal(body.initContainers[0].image, image);
        assert.deepEqual(body.initContainers[0].command, ['node']);
        assert.deepEqual(body.initContainers[0].args, ['--version']);
        assert.deepEqual(body.initContainers[0].env, []);
        assert.deepEqual(body.initContainers[0].resources, { cpu: 0.5, memory: '1Gi' });
        assert.deepEqual(jobTemplate.initContainers[0].probes, []);
      }
      assert.deepEqual(jobTemplate.volumes, [], 'The Terraform-owned platform template must remain unchanged.');
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
    } else if (url.pathname.endsWith('/deactivate')) {
      revisions.get(url.pathname.split('/').at(-2)).properties.active = false;
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
          active: true, healthState: 'Healthy', provisioningState: 'Provisioned',
          template: scenario === 'wrong-candidate-image-failure'
            ? { ...template, containers: [{ ...template.containers[0], image: image.replace(/a{64}$/, 'b'.repeat(64)) }] }
            : template,
        } });
      } else if (method === 'patch') {
        app.properties.configuration.ingress = body.properties.configuration.ingress;
        if (scenario === 'arm-normalization') {
          app.properties.configuration.ingress.traffic = app.properties.configuration.ingress.traffic.filter((item) =>
            item.weight > 0 || item.label);
        }
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
    if (scenario === 'previous-health-failure') {
      await assert.rejects(release(), /running=ActivationFailed, health=Unhealthy/);
      assert.equal(started, false);
      assert.equal(calls.filter((call) => call.body?.properties?.template).length, 0);
      assert.deepEqual(app.properties.configuration.ingress, originalIngress);
    } else if (scenario === 'migration-failure') {
      await assert.rejects(release(), /Migration Failed/);
      assert.equal(calls.filter((call) => call.body?.properties?.template).length, 0);
      assert.deepEqual(app.properties.template, originalTemplate);
      assert.deepEqual(app.properties.configuration.ingress, originalIngress);
    } else if (scenario === 'wrong-candidate-image-failure') {
      await assert.rejects(release(), /exact release digest/);
      assert.deepEqual(app.properties.configuration.ingress, originalIngress);
    } else if (scenario === 'promotion-failure') {
      await assert.rejects(release(), /Smoke/);
      assert.deepEqual(app.properties.configuration.ingress, originalIngress);
    } else {
      await release();
      const expected = scenario === 'rollback' ? 'weather-api--retained' :
        scenario.startsWith('platform-') ? 'weather-api--old' : 'weather-api--r42-1';
      assert.equal(app.properties.configuration.ingress.traffic.find((item) => item.weight === 100).revisionName, expected);
      if (scenario === 'arm-normalization') {
        assert.equal(revisions.get('weather-api--superseded').properties.active, false);
        assert.equal(revisions.get('weather-api--old').properties.active, true);
        assert.equal(revisions.get(expected).properties.active, true);
      }
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

test('change detection handles independent surfaces and delivery changes without losing accumulated paths', () => {
  assert.deepEqual(changedSurfaces(['backend/src/app.ts', 'frontend/src/App.tsx']), { backend: true, frontend: true, infra: false });
  assert.deepEqual(changedSurfaces(['infra/database.tf']), { backend: false, frontend: false, infra: true });
  assert.deepEqual(changedSurfaces(['frontend/src/App.tsx']), { backend: false, frontend: true, infra: false });
  assert.deepEqual(changedSurfaces(['.github/workflows/production.yml']), { backend: true, frontend: true, infra: true });
  assert.deepEqual(changedSurfaces(['infra/scripts/backend-release.mjs']), { backend: true, frontend: true, infra: true });
  assert.deepEqual(changedSurfaces(['docs/ai/20-final-deployment-and-cd-automation.md']), { backend: false, frontend: false, infra: false });
});

test('traffic confirmation accepts ARM zero-weight pruning, but never another serving revision or label', () => {
  const expected = promotedTraffic(candidateTraffic(original, 'weather-api--new'), 'weather-api--new');
  const actual = expected.filter((item) => item.weight > 0 || item.label);
  assert.equal(trafficMatches(actual, expected), true);
  assert.equal(trafficMatches([{ ...actual[0], weight: 90 }], expected), false);
  assert.equal(trafficMatches([{ ...actual[0], label: 'unexpected' }], expected), false);
  assert.equal(trafficMatches([{ ...actual[0], latestRevision: true }], expected), false);
  assert.equal(trafficMatches(original, expected), false);
});

test('platform inputs derive the existing image and complete current global IPv4 tags without manual digest copying', () => {
  const inputs = { name: 'weather', bootstrap_image: null, frontdoor_backend_ipv4: ['192.0.2.0/24'] };
  const tags = { values: [{ name: 'AzureFrontDoor.Backend', properties: {
    addressPrefixes: ['2001:db8::/32', '198.51.100.0/24', '198.51.100.0/24'], changeNumber: 27,
  } }] };
  const effective = platformInputs(inputs, appFixture(), tags);
  assert.equal(effective.bootstrap_image, image);
  assert.deepEqual(effective.frontdoor_backend_ipv4, ['198.51.100.0/24']);
  assert.equal(effective.frontdoor_service_tag_change_number, '27');
  assert.equal(inputs.bootstrap_image, null);
  assert.equal(platformInputs(inputs, null, tags).bootstrap_image, null);
  assert.throws(() => platformInputs(inputs, appFixture(), { values: [] }), /exactly one global/);
});

test('frontend smoke permits only real anonymous static 404s, never immutable errors or cacheable private failures', async () => {
  const html = '<html>synthetic shell</html>';
  const script = 'synthetic built JavaScript';
  const files = [{ key: 'index.html', hash: sha256(html) }, { key: 'assets/index-synthetic.js', asset: true, hash: sha256(script) }];
  let bad = '';
  const fetchMock = mock.method(globalThis, 'fetch', async (url) => {
    const path = new URL(url).pathname;
    if (path === '/api/v1/health') return new Response('{"status":"ok"}', { headers: { 'Cache-Control': 'no-store' } });
    if (path === '/api/v1/auth/session') return new Response('{"user":null,"csrfToken":"synthetic"}', { headers: { 'Cache-Control': 'no-store' } });
    if (path === '/assets/index-synthetic.js') return new Response(script, { headers: {
      'Cache-Control': 'public, max-age=31536000, immutable', 'Content-Type': 'text/javascript',
    } });
    if (['/assets/not-a-real-release-file.js', '/not-a-client-route', '/api/v1/not-a-route'].includes(path)) {
      return new Response('synthetic error document', {
        status: bad === 'success-shaped' && path.startsWith('/assets/') ? 200 : 404,
        headers: path.startsWith('/assets/')
          ? bad === 'immutable' ? { 'Cache-Control': 'public, immutable' } : {}
          : bad === 'private-cache' ? {} : { 'Cache-Control': 'no-store' },
      });
    }
    return new Response(html, { headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/html',
      'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "script-src 'self'" } });
  });
  try {
    await frontendSmoke('https://weather.example', files);
    for (bad of ['success-shaped', 'immutable', 'private-cache']) {
      await assert.rejects(frontendSmoke('https://weather.example', files), /404\/cache-isolation/);
    }
  } finally { fetchMock.mock.restore(); }
});

test('first-plan fingerprint supports absent group/resources and detects their creation; Azure errors fail closed', () => {
  const options = { group: 'weather-prod', subscription: 'synthetic', appName: 'weather-api', jobName: 'weather-migrate' };
  let exists = false;
  let app = null;
  let job = null;
  const command = mock.method(childProcess, 'execFileSync', (binary, executableArgs) => {
    const args = azureCliArgs(binary, executableArgs);
    assert.equal(azureBody(args), null);
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
  const template = { containers: [{ name: 'migration', image, command: ['npm'], args: ['run', 'migrate'], env: [], probes: [] }], volumes: [] };
  let started = false;
  let executionTemplate;
  const command = mock.method(childProcess, 'execFileSync', (binary, executableArgs) => {
    const args = azureCliArgs(binary, executableArgs);
    if (args[0] === 'group') return 'true';
    const path = new URL(args[args.indexOf('--url') + 1]).pathname;
    const method = args[args.indexOf('--method') + 1];
    assert.notEqual(method, 'patch', 'First deployment must not mutate API or Job platform templates.');
    if (path.endsWith('/containerApps')) return '{"value":[]}';
    if (path.endsWith('/jobs')) return JSON.stringify({ value: ['missing-job', 'core-missing-job'].includes(scenario) ? [] : [{ name: 'weather-migrate' }] });
    if (path.endsWith('/weather-migrate')) return JSON.stringify({ properties: { template } });
    if (path.endsWith('/start')) {
      executionTemplate = azureBody(args);
      assertJobExecutionBody(executionTemplate);
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

for (const scenario of ['success', 'job-failure', 'cleanup-failure', 'nonhuman-credential',
  'initial-get-failure', 'initial-list-failure', 'existing-secret', 'overlap', 'mutable-image',
  'attach-failure', 'attach-verification-failure', 'start-failure', 'execution-list-failure',
  'poll-failure', 'cleanup-verification-failure', 'attach-and-cleanup-failure', 'secret-propagation',
  'wrong-execution-image', 'wrong-execution-command', 'omitted-secrets', 'invalid-cleanup-secrets',
  'unsupported-template']) {
test(`human SQL Job token lifecycle: ${scenario}`, async () => {
  const environment = { ...process.env };
  const values = {
    api_role: 'weather-api', api_object_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    migration_role: 'weather-migrator', migration_object_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    fqdn: 'weather-postgres.postgres.database.azure.com',
  };
  let started = false;
  let executionTemplate;
  let secrets = scenario === 'existing-secret' ? [{ name: 'temporary-sql-admin' }] : [];
  let provisioningPending = false;
  let attachmentVerified = false;
  let pendingReads = 0;
  const secretUpdates = [];
  const events = [];
  const logs = [];
  const log = mock.method(console, 'info', (message) => logs.push(message));
  const pause = mock.method(timers, 'setTimeout', async () => {});
  function cliFailure() {
    throw Object.assign(new Error('Raw synthetic-token must not escape'), {
      status: 1, stderr: 'ERROR: Bad Request({"error":{"code":"InvalidParameter","message":"Synthetic request rejected."}})',
    });
  }
  const command = mock.method(childProcess, 'execFileSync', (binary, executableArgs) => {
    if (binary === 'terraform') return JSON.stringify(values);
    const args = azureCliArgs(binary, executableArgs);
    if (args[0] === 'account' && args[1] === 'show') {
      return JSON.stringify({ user: { type: scenario === 'nonhuman-credential' ? 'servicePrincipal' : 'user' } });
    }
    if (args[0] === 'account' && args[1] === 'get-access-token') return '{"accessToken":"synthetic-token"}';
    const path = new URL(args[args.indexOf('--url') + 1]).pathname;
    const method = args[args.indexOf('--method') + 1];
    const body = azureBody(args);
    events.push({ method, path });
    if (path.endsWith('/weather-migrate')) {
      let provisioningState = 'Succeeded';
      if (method === 'patch') {
        const update = body.properties.configuration.secrets;
        secretUpdates.push(update);
        if ((['attach-failure', 'attach-and-cleanup-failure'].includes(scenario) && update.length) ||
            (['cleanup-failure', 'attach-and-cleanup-failure'].includes(scenario) && !update.length)) cliFailure();
        secrets = update.map(({ name }) => ({ name }));
        provisioningPending = scenario === 'secret-propagation';
      } else {
        if ((scenario === 'initial-get-failure' && !secretUpdates.length) ||
            (scenario === 'attach-verification-failure' && secretUpdates.length === 1) ||
            (scenario === 'cleanup-verification-failure' && secretUpdates.length === 2)) cliFailure();
        if (provisioningPending) {
          provisioningState = 'InProgress';
          provisioningPending = false;
          pendingReads++;
        } else if (secretUpdates.length === 1 && secrets.length) attachmentVerified = true;
      }
      return JSON.stringify({ properties: {
        provisioningState,
        configuration: { triggerType: 'Manual',
          ...(scenario === 'omitted-secrets' && !secrets.length ? {} : {
            secrets: scenario === 'invalid-cleanup-secrets' && secretUpdates.length === 2 ? 'invalid shape' : secrets.length ? secrets : null,
          }) },
        template: { containers: [{ name: 'migration', image, command: ['npm'], args: ['run', 'migrate'],
          env: [{ name: 'PGHOST', value: values.fqdn }], probes: [] }], volumes: scenario === 'unsupported-template' ? [{ name: 'unsupported' }] : [] },
      } });
    }
    if (path.endsWith('/start')) {
      assert.equal(attachmentVerified, true, 'Do not start while the token PATCH is still provisioning.');
      if (scenario === 'start-failure') cliFailure();
      executionTemplate = body;
      assertJobExecutionBody(body);
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
    if (path.endsWith('/executions/admin1')) {
      if (scenario === 'poll-failure') cliFailure();
      const actual = structuredClone(executionTemplate);
      if (scenario === 'wrong-execution-image') actual.containers[0].image = 'weatheracr.azurecr.io/weather-backend:latest';
      if (scenario === 'wrong-execution-command') actual.containers[0].command = ['npm'];
      return JSON.stringify({ properties: {
        status: scenario === 'job-failure' ? 'Failed' : 'Succeeded', template: actual,
      } });
    }
    if (path.endsWith('/executions')) {
      if ((scenario === 'initial-list-failure' && !secretUpdates.length) ||
          (scenario === 'execution-list-failure' && started)) cliFailure();
      return JSON.stringify({ value: started || scenario === 'overlap' ? [{ name: 'admin1', properties: { status: 'Running' } }] : [] });
    }
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
    if (scenario === 'mutable-image') process.env.RELEASE_IMAGE = 'weatheracr.azurecr.io/weather-backend:latest';
    const errors = {
      'nonhuman-credential': /approved human/, 'initial-get-failure': /Read SQL administration Job/,
      'initial-list-failure': /Check SQL administration overlap/, 'existing-secret': /Unexpected Job secrets/,
      overlap: /Pause releases/, 'mutable-image': /immutable backend digest/,
      'job-failure': /Database administration Failed/, 'cleanup-failure': /Cleanup failed:.*Remove temporary SQL administrator token/,
      'attach-failure': /Attach temporary SQL administrator token/,
      'attach-verification-failure': /Verify temporary SQL administrator token attachment/,
      'start-failure': /Database administration: start Job/, 'execution-list-failure': /Database administration: discover started execution/,
      'poll-failure': /Database administration: poll execution/,
      'cleanup-verification-failure': /Cleanup failed:.*Verify temporary SQL administrator token removal/,
      'attach-and-cleanup-failure': /SQL operation also failed:.*Attach temporary SQL administrator token.*Cleanup failed:.*Remove temporary SQL administrator token/,
      'wrong-execution-image': /approved digest and command/, 'wrong-execution-command': /approved digest and command/,
      'invalid-cleanup-secrets': /Cleanup failed:.*invalid Job secrets/, 'unsupported-template': /do not support volumes/,
    };
    if (errors[scenario]) await assert.rejects(administer('principals'), (error) => {
      assert.match(error.message, errors[scenario]);
      assert.equal(error.message.includes('synthetic-token'), false);
      if (scenario.includes('cleanup')) assert.match(error.message, /token removal FAILED/);
      if (scenario === 'attach-and-cleanup-failure') assert.equal(error.errors.length, 2);
      return true;
    });
    else await administer('principals');
    if (['nonhuman-credential', 'initial-get-failure', 'initial-list-failure', 'existing-secret', 'overlap', 'mutable-image'].includes(scenario)) {
      assert.deepEqual(secretUpdates, []);
      assert.equal(started, false);
    } else {
      assert.deepEqual(secretUpdates, [[{ name: 'temporary-sql-admin', value: 'synthetic-token' }], []]);
      assert.equal(started, !['attach-failure', 'attach-and-cleanup-failure', 'attach-verification-failure', 'start-failure', 'unsupported-template'].includes(scenario));
      if (!scenario.includes('cleanup')) {
        assert.deepEqual(secrets, []);
        assert.equal(events.at(-1).method, 'get', 'Cleanup success requires a read-back.');
        assert.ok(logs.some((message) => message.includes('Removed temporary')));
      } else assert.equal(logs.some((message) => message.includes('Removed temporary')), false);
    }
    assert.equal(logs.join('\n').includes('synthetic-token'), false);
    if (scenario === 'secret-propagation') assert.equal(pendingReads, 2, 'Both PATCH operations must be observed completing.');
  } finally {
    command.mock.restore(); pause.mock.restore(); syncBuiltinESMExports(); log.mock.restore();
    for (const key of Object.keys(process.env)) if (!(key in environment)) delete process.env[key];
    Object.assign(process.env, environment);
  }
});
}
