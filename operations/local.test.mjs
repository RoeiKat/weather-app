import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { test, mock } from 'node:test';
import { azureCommand } from '../infra/scripts/azure.mjs';
import { changedSurfaces } from '../infra/scripts/delivery-changes.mjs';
import {
  assertInventory, assertOwned, bootstrapImports, config, destroyInputs,
  executeDestroy, inspectPlan, instances, names, parseArgs, pendingBootstrapImports, status,
  terraformEnvironment, verifyAccount,
} from './local.mjs';

const n = names();
const account = { id: config.subscriptionId, tenantId: config.tenantId, user: { type: 'user' } };
const resource = (address, id, extra = {}) => ({ address, type: address.split('.')[0], values: { id, ...extra } });
const group = resource('azurerm_resource_group.app', n.appId);
const app = resource('azurerm_container_app.api[0]', `${n.appId}/providers/Microsoft.App/containerApps/${config.name}-api`);
const plan = (resources, actions = ['delete']) => ({
  complete: true,
  resource_changes: resources.map((r) => ({
    address: r.address, type: r.type, mode: 'managed', change: { actions, before: r.values },
  })),
});

test('subscription/tenant/user guard rejects all unexpected Azure contexts', () => {
  verifyAccount(account);
  for (const patch of [
    { id: 'unrelated' }, { tenantId: 'unrelated' }, { user: { type: 'servicePrincipal' } }, { user: undefined },
  ]) assert.throws(() => verifyAccount({ ...account, ...patch }), /Wrong Azure|local human/);
});

test('Terraform environment always uses local CLI and rejects inherited credentials/argument injection', () => {
  const env = terraformEnvironment({
    PATH: 'keep', ARM_CLIENT_SECRET: 'synthetic', ARM_CLIENT_ID: 'synthetic',
    ARM_ACCESS_KEY: 'synthetic', ARM_USE_OIDC: 'true', TF_VAR_name: 'unrelated',
    TF_CLI_ARGS_apply: '-auto-approve', TF_DATA_DIR: 'unrelated',
    AZURE_CLIENT_SECRET: 'synthetic', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'synthetic',
  });
  assert.equal(env.PATH, 'keep');
  assert.equal(env.ARM_USE_CLI, 'true');
  assert.equal(env.ARM_USE_OIDC, 'false');
  assert.equal(env.ARM_SUBSCRIPTION_ID, config.subscriptionId);
  assert.equal(Object.values(env).includes('synthetic'), false);
  assert.equal(env.TF_CLI_ARGS_apply, undefined);
});

test('flags never allow dry-run/force ambiguity or status mutation flags', () => {
  assert.deepEqual(parseArgs(['status']), { mode: 'status', dryRun: false, force: false });
  assert.equal(parseArgs(['destroy', '--dry-run']).dryRun, true);
  assert.equal(parseArgs(['destroy', '--force']).force, true);
  for (const args of [[], ['apply'], ['status', '--force'], ['destroy', '--yes'],
    ['destroy', '--force', '--dry-run'], ['destroy', '--force', '--force']]) {
    assert.throws(() => parseArgs(args), /Unknown\/combined unsafe/);
  }
});

test('delete-only plan summary contains addresses/counts, never state fields', () => {
  const summary = inspectPlan(plan([group, { ...app, values: { ...app.values, secret: 'synthetic-private' } }]), 'main');
  assert.deepEqual(summary, { count: 2, targets: [group.address, app.address] });
  assert.equal(JSON.stringify(summary).includes('synthetic-private'), false);
  for (const actions of [['create'], ['update'], ['delete', 'create']]) {
    assert.throws(() => inspectPlan(plan([app], actions), 'main'), /non-delete/);
  }
  assert.throws(() => inspectPlan({ complete: false }, 'main'), /Incomplete/);
  assert.throws(() => inspectPlan({ errored: true }, 'main'), /Incomplete/);
});

test('main plans refuse another group/subscription or out-of-scope RBAC', () => {
  for (const item of [
    resource('azurerm_resource_group.other', `${n.subscription}/resourceGroups/unrelated`),
    resource('azurerm_container_app.other', '/subscriptions/unrelated/resourceGroups/weatherroeidev-prod/providers/app/other'),
    resource('azurerm_role_assignment.other', `${n.appId}/providers/Microsoft.Authorization/roleAssignments/other`, { scope: n.subscription }),
  ]) assert.throws(() => inspectPlan(plan([item]), 'main'), /out-of-assignment/);
});

test('bootstrap subscription-level exceptions are restricted to exact assignment discovery ownership', () => {
  const definition = resource('azurerm_role_definition.discovery[0]', `${n.subscription}/providers/Microsoft.Authorization/roleDefinitions/synthetic|${n.subscription}`,
    { name: `${config.name}-assignment-discovery`, scope: n.subscription });
  const assignment = resource('azurerm_role_assignment.discovery[0]', `${n.subscription}/providers/Microsoft.Authorization/roleAssignments/synthetic`,
    { principal_id: config.ciPrincipalId, scope: n.subscription, role_definition_name: `${config.name}-assignment-discovery` });
  assert.equal(inspectPlan(plan([definition, assignment]), 'state').count, 2);
  for (const values of [{ ...definition.values, name: 'unrelated' }, { ...definition.values, scope: n.appId }]) {
    assert.throws(() => assertOwned([{ ...definition, values }], 'state'), /out-of-assignment/);
  }
  assert.throws(() => assertOwned([{ ...assignment, values: { ...assignment.values, principal_id: 'unrelated' } }], 'state'), /out-of-assignment/);
  assert.throws(() => assertOwned([resource('azurerm_storage_account.unrelated', `${n.stateId}/providers/Microsoft.Storage/storageAccounts/unrelated`)], 'state'), /out-of-assignment/);
});

test('Azure inventory refuses untracked resources before deleting a containing group', () => {
  assertInventory([{ id: `${app.values.id}/revisions/owned`, name: 'owned' }], [group, app]);
  assert.throws(() => assertInventory([{ id: `${n.appId}/providers/Microsoft.Storage/storageAccounts/unrelated`, name: 'unrelated' }], [group, app]), /Untracked Azure resource/);
});

function rawState(resources) {
  return { resources: resources.map(({ address, type, values }) => ({
    type, name: address.split('.')[1].replace(/\[.*$/, ''), mode: 'managed',
    instances: [{ attributes: values, ...(address.endsWith('[0]') ? { index_key: 0 } : {}) }],
  })) };
}

test('all required main variables are derived from state without key/token values', () => {
  const fixture = rawState([
    { ...group, values: { ...group.values, tags: { application: 'weather' } } },
    { ...app, values: { ...app.values,
      template: [{ container: [{ image: 'registry/backend@sha256:synthetic', cpu: 0.5 }], max_replicas: 4 }],
      ingress: [{ ip_security_restriction: [{ description: 'AzureFrontDoor.Backend change 123', ip_address_range: '192.0.2.0/24' }] }],
      secret: [{ value: 'synthetic-private' }],
    } },
    resource('azurerm_postgresql_flexible_server_active_directory_administrator.human', 'synthetic', {
      tenant_id: config.tenantId, object_id: config.bootstrapOperatorObjectId, principal_name: 'synthetic-admin', principal_type: 'User',
    }),
    resource('azurerm_monitor_action_group.operations', 'synthetic', { email_receiver: [{ email_address: 'synthetic@example.invalid' }] }),
    resource('azurerm_role_assignment.push', 'synthetic', { principal_id: config.ciPrincipalId }),
    resource('azurerm_cdn_frontdoor_firewall_policy.app', 'synthetic', { mode: 'Detection' }),
  ]);
  assert.equal(instances(fixture).length, 6);
  const inputs = destroyInputs(fixture);
  assert.equal(inputs.frontdoor_service_tag_change_number, '123');
  assert.equal(inputs.bootstrap_image, 'registry/backend@sha256:synthetic');
  assert.deepEqual(inputs.frontdoor_backend_ipv4, ['192.0.2.0/24']);
  assert.equal(JSON.stringify(inputs).includes('synthetic-private'), false);
  assert.equal(inputs.ci_principal_id, config.ciPrincipalId);
  assert.throws(() => destroyInputs({ resources: [] }), /Cannot derive/);
});

function recoveryFixture(duplicate = false) {
  const roles = [];
  const add = (scope, principal_id, role) => roles.push({ id: `${scope}/providers/Microsoft.Authorization/roleAssignments/${roles.length}`, scope, principal_id, role });
  for (const container of ['tfstate', 'tfplans', 'tfdiagnostics']) {
    add(`${n.accountId}/blobServices/default/containers/${container}`, config.ciPrincipalId, 'Storage Blob Data Contributor');
  }
  add(n.accountId, config.bootstrapOperatorObjectId, 'Storage Blob Data Contributor');
  add(n.subscription, config.ciPrincipalId, `${config.name}-assignment-discovery`);
  add(n.appId, config.ciPrincipalId, 'Contributor');
  if (duplicate) roles.push({ ...roles[0], id: 'duplicate' });
  return (args) => {
    assert.equal(args[0], 'role');
    assert.equal(args[2], 'list');
    return args[1] === 'assignment' ? roles : [{
      id: `${n.subscription}/providers/Microsoft.Authorization/roleDefinitions/synthetic`,
      scopes: [n.subscription], roleName: `${config.name}-assignment-discovery`,
    }];
  };
}

test('fresh-clone bootstrap recovery discovers exactly 11 owned imports with read-only Azure calls', () => {
  const imports = bootstrapImports(recoveryFixture());
  assert.equal(imports.length, 11);
  assert.equal(imports.some(([, id]) => id.startsWith(n.appId)), false);
  assert.equal(imports.filter(([address]) => address.startsWith('azurerm_storage_container')).length, 3);
  assert.throws(() => bootstrapImports(recoveryFixture(true)), /exactly one/);
});

test('bootstrap recovery imports only missing ownership and never overwrites conflicting local IDs', () => {
  const imports = bootstrapImports(recoveryFixture());
  assert.deepEqual(pendingBootstrapImports(imports, []), imports);
  const existing = imports.map(([address, id]) => resource(address, id));
  assert.deepEqual(pendingBootstrapImports(imports, existing), []);
  assert.deepEqual(pendingBootstrapImports(imports, existing.slice(1)), [imports[0]]);
  existing[0].values.id = 'unrelated';
  assert.throws(() => pendingBootstrapImports(imports, existing), /Refusing to overwrite/);
});

function operations(overrides = {}) {
  const calls = [];
  const ops = {
    checkAccount: () => calls.push('account'), preview: () => calls.push('preview'),
    prepare: () => { calls.push('plan'); return { main: 'main', storage: 'state' }; },
    confirm: async () => { calls.push('confirm'); return true; },
    apply: (root) => calls.push(`apply:${root}`),
    appExists: () => { calls.push('app-check'); return false; },
    recordMainRemoval: () => calls.push('receipt'),
    checkBootstrapInventory: () => calls.push('state-inventory'),
    stateExists: () => { calls.push('state-check'); return false; },
    log: () => {}, ...overrides,
  };
  return { calls, ops };
}

test('normal teardown uses one confirmation and never applies state before main succeeds and disappears', async () => {
  const { calls, ops } = operations();
  await executeDestroy({}, ops);
  assert.deepEqual(calls, ['account', 'preview', 'plan', 'confirm', 'account', 'apply:main',
    'app-check', 'receipt', 'account', 'state-inventory', 'apply:state', 'state-check']);
});

test('dry-run plans both roots but never confirms/applies/deletes', async () => {
  const { calls, ops } = operations();
  await executeDestroy({ dryRun: true }, ops);
  assert.deepEqual(calls, ['account', 'preview', 'plan']);
});

test('force only bypasses the human prompt, never safety checks', async () => {
  const { calls, ops } = operations();
  await executeDestroy({ force: true }, ops);
  assert.equal(calls.includes('confirm'), false);
  assert.equal(calls.filter((c) => c === 'account').length, 3);
  assert.ok(calls.indexOf('app-check') < calls.indexOf('apply:state'));
});

test('declined confirmation and planning failures never apply', async () => {
  for (const overrides of [
    { confirm: async () => false },
    { prepare: () => { throw new Error('plan failure'); } },
    { checkAccount: () => { throw new Error('wrong subscription'); } },
  ]) {
    const { calls, ops } = operations(overrides);
    await assert.rejects(executeDestroy({}, ops));
    assert.equal(calls.some((c) => c.startsWith('apply:')), false);
  }
});

test('main failure, remaining app group, or changed account block state teardown', async () => {
  for (const reason of ['apply', 'exists', 'account']) {
    const { calls, ops } = operations();
    if (reason === 'apply') ops.apply = (root) => { calls.push(`apply:${root}`); throw new Error('main failed'); };
    if (reason === 'exists') ops.appExists = () => true;
    if (reason === 'account') {
      ops.checkAccount = () => { calls.push('account'); if (calls.includes('receipt')) throw new Error('changed account'); };
    }
    await assert.rejects(executeDestroy({}, ops));
    assert.equal(calls.includes('apply:state'), false);
  }
});

test('bootstrap inventory and final removal failures are explicit, never reported as success', async () => {
  for (const overrides of [
    { checkBootstrapInventory: () => { throw new Error('untracked state resource'); } },
    { stateExists: () => true },
  ]) {
    const { ops } = operations(overrides);
    await assert.rejects(executeDestroy({}, ops));
  }
});

test('verified main-removal retry never reinitializes/applies main but still checks group absence', async () => {
  const { calls, ops } = operations({ prepare: () => ({ main: null, storage: 'state' }) });
  await executeDestroy({}, ops);
  assert.equal(calls.includes('apply:main'), false);
  assert.ok(calls.includes('app-check'));
  assert.ok(calls.includes('apply:state'));
});

test('status transport only performs reads and reports explicit errors without secret values', () => {
  const calls = [];
  const output = [];
  let failure = false;
  const consoleMock = mock.method(console, 'info', (line) => output.push(line));
  const command = mock.method(childProcess, 'execFileSync', (binary, args) => {
    const cli = azureCommand([]);
    assert.equal(binary, cli.executable);
    const actual = args.slice(cli.args.length);
    calls.push(actual.slice(0, 3).join(' '));
    const verb = actual.slice(0, 3).join(' ');
    if (verb.startsWith('account show')) return JSON.stringify({ ...account, name: 'assignment' });
    if (verb.startsWith('group exists')) return 'true';
    if (verb.startsWith('resource list')) return JSON.stringify([
      { id: app.values.id, type: 'Microsoft.App/containerApps', name: `${config.name}-api` },
      { id: n.accountId, type: 'Microsoft.Storage/storageAccounts', name: n.stateAccount },
      { id: `${n.appId}/providers/Microsoft.Cdn/profiles/${config.name}-frontdoor/afdEndpoints/${config.name}-public`,
        type: 'Microsoft.Cdn/profiles/afdEndpoints', name: `${config.name}-frontdoor/${config.name}-public` },
      { id: `${n.appId}/providers/Microsoft.DBforPostgreSQL/flexibleServers/${config.name}-postgres`,
        type: 'Microsoft.DBforPostgreSQL/flexibleServers', name: `${config.name}-postgres` },
    ]);
    if (verb.startsWith('resource show')) return '{"provisioning":"Succeeded","running":"Running"}';
    if (verb.startsWith('storage blob show')) {
      assert.ok(actual.includes('login'));
      if (failure) throw Object.assign(new Error('synthetic-private'), { status: 1, stderr: 'ERROR: AuthorizationPermissionMismatch' });
      return '{"bytes":123}';
    }
    if (verb.startsWith('keyvault list-deleted')) return '[]';
    assert.fail(`Unexpected status operation: ${verb}`);
  });
  syncBuiltinESMExports();
  try {
    status();
    assert.ok(output.some((line) => line.includes('accessible (123 bytes)')));
    assert.ok(output.some((line) => line.includes('Running')));
    assert.equal(calls.some((line) => /delete|apply|destroy|set |download|list-keys/.test(line.replace('list-deleted', 'read'))), false);
    failure = true;
    assert.throws(() => status(), /AuthorizationPermissionMismatch/);
    assert.equal(output.some((line) => line.includes('synthetic-private')), false);
  } finally {
    command.mock.restore(); consoleMock.mock.restore(); syncBuiltinESMExports();
  }
});

test('root local operations/documentation cannot trigger application or infrastructure delivery', () => {
  assert.deepEqual(changedSurfaces([
    'operations/local.mjs', 'operations/local.test.mjs', 'operations/config.json',
    'package.json', '.gitignore', 'docs/deployment.md', 'docs/ai/20-final-deployment-and-cd-automation.md',
    'docs/ai/21-local-destroy-and-final-operations.md',
  ]), { backend: false, frontend: false, infra: false });
});
