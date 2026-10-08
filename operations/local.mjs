import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { az } from '../infra/scripts/azure.mjs';

const infra = fileURLToPath(new URL('../infra', import.meta.url));
export const config = JSON.parse(readFileSync(new URL('config.json', import.meta.url), 'utf8'));
function parseJson(text, label) {
  try { return JSON.parse(text); }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new Error(`${label} is invalid JSON; contents withheld.`);
  }
}
const readJson = (path) => parseJson(readFileSync(path, 'utf8'), 'Local operations/state file');
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();

export function names(c = config) {
  const subscription = `/subscriptions/${c.subscriptionId}`;
  const appGroup = `${c.name}-prod`;
  const stateGroup = `${c.name}-state`;
  const stateAccount = `${c.name}state`;
  return {
    subscription, appGroup, stateGroup, stateAccount, stateKey: 'production.tfstate',
    appId: `${subscription}/resourceGroups/${appGroup}`,
    stateId: `${subscription}/resourceGroups/${stateGroup}`,
    accountId: `${subscription}/resourceGroups/${stateGroup}/providers/Microsoft.Storage/storageAccounts/${stateAccount}`,
  };
}

export function verifyAccount(account, c = config) {
  if (!same(account.id, c.subscriptionId) || !same(account.tenantId, c.tenantId)) {
    throw new Error(`Wrong Azure subscription/tenant: active ${account.id}; expected ${c.subscriptionId} in tenant ${c.tenantId}. Run az account set --subscription ${c.subscriptionId}. Nothing was destroyed.`);
  }
  if (account.user?.type !== 'user') throw new Error('Authenticate as a local human with az login, not a service principal or managed identity.');
}

export function terraformEnvironment(env = process.env, c = config) {
  const clean = Object.fromEntries(Object.entries(env).filter(([key]) =>
    !/^(ARM_|TF_|AZURE_(CLIENT|TENANT|SUBSCRIPTION|FEDERATED|AUTHORITY)|ACTIONS_ID_TOKEN_)/i.test(key)));
  return {
    ...clean, ARM_SUBSCRIPTION_ID: c.subscriptionId, ARM_TENANT_ID: c.tenantId,
    ARM_USE_CLI: 'true', ARM_USE_OIDC: 'false', ARM_USE_MSI: 'false', ARM_USE_AZUREAD: 'true',
    TF_IN_AUTOMATION: 'true',
  };
}

export function instances(state) {
  return (state.resources ?? []).filter((r) => r.mode === 'managed').flatMap((r) =>
    r.instances.map((i) => ({
      address: `${r.type}.${r.name}${i.index_key === undefined ? '' : `[${JSON.stringify(i.index_key)}]`}`,
      type: r.type, values: i.attributes,
    })));
}

export function assertOwned(resources, root, c = config) {
  const n = names(c);
  for (const { address, type, values } of resources) {
    const group = root === 'main' ? n.appId : n.stateId;
    const id = values?.id;
    let allowed = same(id, group) || (typeof id === 'string' && id.toLowerCase().startsWith(`${group.toLowerCase()}/`));
    if (root === 'state') {
      allowed = (address === 'azurerm_resource_group.state' && same(id, n.stateId)) ||
        (address === 'azurerm_storage_account.state' && same(id, n.accountId));
      for (const container of ['tfstate', 'tfplans', 'tfdiagnostics']) {
        const scope = `${n.accountId}/blobServices/default/containers/${container}`;
        if (address === `azurerm_storage_container.protected["${container}"]`) allowed = same(id, scope);
        if (address === `azurerm_role_assignment.state["${container}"]`) {
          allowed = same(values.scope, scope) && same(values.principal_id, c.ciPrincipalId) &&
            values.role_definition_name === 'Storage Blob Data Contributor' &&
            typeof id === 'string' && id.toLowerCase().startsWith(`${scope.toLowerCase()}/providers/microsoft.authorization/roleassignments/`);
        }
      }
      if (address === 'azurerm_role_assignment.operator') {
        allowed = same(values.scope, n.accountId) && same(values.principal_id, c.bootstrapOperatorObjectId) &&
          values.role_definition_name === 'Storage Blob Data Contributor' &&
          typeof id === 'string' && id.toLowerCase().startsWith(`${n.accountId.toLowerCase()}/providers/microsoft.authorization/roleassignments/`);
      }
    }
    if (root === 'state' && address === 'azurerm_role_definition.discovery[0]') {
      allowed = same(values.scope, n.subscription) &&
        values.name === `${c.name}-assignment-discovery` &&
        typeof id === 'string' && id.toLowerCase().startsWith(`${n.subscription.toLowerCase()}/providers/microsoft.authorization/roledefinitions/`);
    } else if (root === 'state' && address === 'azurerm_role_assignment.discovery[0]') {
      allowed = same(values.scope, n.subscription) && same(values.principal_id, c.ciPrincipalId) &&
        values.role_definition_name === `${c.name}-assignment-discovery` &&
        typeof id === 'string' && id.toLowerCase().startsWith(`${n.subscription.toLowerCase()}/providers/microsoft.authorization/roleassignments/`);
    }
    if (type === 'azurerm_role_assignment' && root === 'main') {
      allowed &&= same(values.scope, group) || values.scope?.toLowerCase().startsWith(`${group.toLowerCase()}/`);
    }
    if (!allowed) throw new Error(`Refusing out-of-assignment ${root} target: ${address}. No apply will run.`);
  }
}

export function assertInventory(inventory, resources) {
  const ownedIds = resources.filter((r) => r.type !== 'azurerm_resource_group')
    .map((r) => r.values.id.toLowerCase());
  for (const resource of inventory) {
    const id = resource.id.toLowerCase();
    if (!ownedIds.some((owned) => id === owned || id.startsWith(`${owned}/`))) {
      throw new Error(`Untracked Azure resource ${resource.name} (${resource.type}) would be deleted with the group. Stop and review ownership.`);
    }
  }
}

export function destroyInputs(state, c = config) {
  const resources = instances(state);
  const get = (type, name) => {
    const value = resources.find((r) => r.address === `${type}.${name}` || r.address === `${type}.${name}[0]`)?.values;
    if (!value) throw new Error(`Cannot derive destroy inputs: ${type}.${name} is absent. Retain the local operations input snapshot when retrying a partial teardown.`);
    return value;
  };
  const app = get('azurerm_container_app', 'api');
  const admin = get('azurerm_postgresql_flexible_server_active_directory_administrator', 'human');
  const ingress = app.ingress[0];
  const change = ingress.ip_security_restriction[0]?.description?.match(/change ([0-9]+)$/)?.[1];
  const inputs = {
    subscription_id: c.subscriptionId, tenant_id: c.tenantId, name: c.name,
    ci_principal_id: c.ciPrincipalId, tags: get('azurerm_resource_group', 'app').tags,
    bootstrap_image: app.template[0].container[0].image,
    frontdoor_backend_ipv4: ingress.ip_security_restriction.map((r) => r.ip_address_range),
    frontdoor_service_tag_change_number: change,
    entra_admin_object_id: admin.object_id, entra_admin_name: admin.principal_name,
    entra_admin_type: admin.principal_type,
    alert_email: get('azurerm_monitor_action_group', 'operations').email_receiver[0].email_address,
    api_cpu: app.template[0].container[0].cpu, max_replicas: app.template[0].max_replicas,
    waf_mode: get('azurerm_cdn_frontdoor_firewall_policy', 'app').mode,
  };
  if (Object.values(inputs).some((v) => v === undefined || v === null) ||
      !inputs.frontdoor_backend_ipv4.length || !same(admin.tenant_id, c.tenantId) ||
      !same(get('azurerm_role_assignment', 'push').principal_id, c.ciPrincipalId)) {
    throw new Error('State does not contain the expected complete nonsecret assignment inputs.');
  }
  return inputs;
}

export function inspectPlan(plan, root, c = config) {
  if (plan.errored || plan.complete === false) throw new Error(`Incomplete ${root} destroy plan.`);
  const targets = [];
  for (const resource of plan.resource_changes ?? []) {
    if (resource.mode !== 'managed') continue;
    const actions = resource.change.actions;
    if (actions.length === 1 && actions[0] === 'no-op') continue;
    if (actions.length !== 1 || actions[0] !== 'delete') {
      throw new Error(`Refusing non-delete action on ${resource.address}.`);
    }
    targets.push({ address: resource.address, type: resource.type, values: resource.change.before });
  }
  assertOwned(targets, root, c);
  return { count: targets.length, targets: targets.map(({ address }) => address) };
}

function groupExists(group) {
  const exists = az(['group', 'exists', '--subscription', config.subscriptionId, '--name', group]);
  if (typeof exists !== 'boolean') throw new Error('Invalid Azure resource-group existence response.');
  return exists;
}

function inventory(group) {
  if (!groupExists(group)) return [];
  return az(['resource', 'list', '--subscription', config.subscriptionId, '--resource-group', group,
    '--query', '[].{id:id,name:name,type:type}']);
}

function account() {
  const current = az(['account', 'show']);
  console.info(`Active subscription: ${current.name} (${current.id})`);
  verifyAccount(current);
}

function deletedVaults() {
  const result = az(['keyvault', 'list-deleted', '--subscription', config.subscriptionId,
    '--query', `[?name=='${config.name}-kv'].{name:name,purgeDate:properties.scheduledPurgeDate}`]);
  console.info(`Soft-deleted assignment vaults: ${result.length ? JSON.stringify(result) : 'none'}. No purge is performed.`);
}

export function status() {
  account();
  const n = names();
  const appExists = groupExists(n.appGroup);
  const stateExists = groupExists(n.stateGroup);
  console.info(`${n.appGroup}: ${appExists ? 'exists' : 'absent'}`);
  console.info(`${n.stateGroup}: ${stateExists ? 'exists' : 'absent'}`);
  const appResources = appExists ? inventory(n.appGroup) : [];
  const stateResources = stateExists ? inventory(n.stateGroup) : [];
  for (const [label, type, name] of [
    ['Container App', 'Microsoft.App/containerApps', `${config.name}-api`],
    ['Front Door endpoint', 'Microsoft.Cdn/profiles/afdEndpoints', `${config.name}-frontdoor/${config.name}-public`],
    ['PostgreSQL server', 'Microsoft.DBforPostgreSQL/flexibleServers', `${config.name}-postgres`],
  ]) {
    const found = appResources.find((r) => same(r.type, type) && same(r.name, name));
    let detail = '';
    if (found && label === 'Container App') {
      const app = az(['resource', 'show', '--ids', found.id, '--api-version', '2025-07-01',
        '--query', '{provisioning:properties.provisioningState,running:properties.runningStatus}']);
      detail = ` ${JSON.stringify(app)}`;
    }
    console.info(`${label}: ${found ? `exists${detail}` : 'absent'}`);
  }
  const storage = stateResources.some((r) => same(r.id, n.accountId));
  console.info(`State storage account ${n.stateAccount}: ${storage ? 'exists' : 'absent'}`);
  if (storage) {
    // Read blob properties, never its contents, access keys or credentials.
    const blob = az(['storage', 'blob', 'show', '--auth-mode', 'login', '--account-name', n.stateAccount,
      '--container-name', 'tfstate', '--name', n.stateKey, '--query', '{bytes:properties.contentLength}']);
    console.info(`Remote state tfstate/${n.stateKey}: accessible (${blob.bytes} bytes)`);
  } else {
    console.info('Remote state: unavailable because its storage account is absent.');
  }
  deletedVaults();
}

function terraform(root, args) {
  let output;
  try {
    output = execFileSync('terraform', [`-chdir=${root}`, ...args], {
      encoding: 'utf8', env: terraformEnvironment(), timeout: 5_400_000,
      maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    // State and plans can contain sensitive provider fields. Never echo raw output.
    const summaries = String(error.stdout ?? '').split(/\r?\n/).flatMap((line) => {
      if (!line.startsWith('{')) return [];
      const message = parseJson(line, 'Terraform diagnostic');
      return message.type === 'diagnostic' ? [message.diagnostic?.summary] : [];
    }).filter(Boolean).join('; ').replace(/[\r\n]/g, ' ').slice(0, 400);
    throw new Error(`Terraform ${args[0]} failed (exit ${error.status ?? 'unknown'}). ${summaries || 'Raw state/plan diagnostics withheld.'} No further teardown steps will run. Check read-only status before retrying.`);
  }
  return output;
}

function isolatedRoot(directory, source, label) {
  const root = join(directory, label);
  mkdirSync(root);
  for (const name of readdirSync(source).filter((name) => name.endsWith('.tf') || name === '.terraform.lock.hcl')) {
    copyFileSync(join(source, name), join(root, name));
  }
  return root;
}

function initMain(root) {
  const n = names();
  terraform(root, ['init', '-input=false', '-reconfigure', '-lockfile=readonly',
    ...Object.entries({
      resource_group_name: n.stateGroup, storage_account_name: n.stateAccount,
      container_name: 'tfstate', key: n.stateKey, subscription_id: config.subscriptionId,
      tenant_id: config.tenantId, use_oidc: false, use_cli: true, use_msi: false, use_azuread_auth: true,
    }).map(([key, value]) => `-backend-config=${key}=${value}`)]);
}

export function bootstrapImports(azure, c = config) {
  const n = names(c);
  const result = [
    ['azurerm_resource_group.state', n.stateId],
    ['azurerm_storage_account.state', n.accountId],
  ];
  const roles = azure(['role', 'assignment', 'list', '--subscription', c.subscriptionId, '--all',
    '--query', '[].{id:id,scope:scope,principal_id:principalId,role:roleDefinitionName,definition:roleDefinitionId}']);
  const role = (address, scope, principal, roleName) => {
    const matches = roles.filter((r) => same(r.scope, scope) && same(r.principal_id, principal) && r.role === roleName);
    if (matches.length !== 1) throw new Error(`Cannot safely recover ${address}: expected exactly one matching assignment.`);
    result.push([address, matches[0].id]);
  };
  for (const container of ['tfstate', 'tfplans', 'tfdiagnostics']) {
    const id = `${n.accountId}/blobServices/default/containers/${container}`;
    result.push([`azurerm_storage_container.protected["${container}"]`, id]);
    role(`azurerm_role_assignment.state["${container}"]`, id, c.ciPrincipalId, 'Storage Blob Data Contributor');
  }
  role('azurerm_role_assignment.operator', n.accountId, c.bootstrapOperatorObjectId, 'Storage Blob Data Contributor');
  const definitions = azure(['role', 'definition', 'list', '--subscription', c.subscriptionId,
    '--name', `${c.name}-assignment-discovery`, '--query', '[].{id:id,roleName:roleName,scopes:assignableScopes}']);
  if (definitions.length !== 1 || definitions[0].scopes.length !== 1 || !same(definitions[0].scopes[0], n.subscription)) {
    throw new Error('Cannot safely recover the assignment-specific discovery role.');
  }
  result.push(['azurerm_role_definition.discovery[0]', `${definitions[0].id}|${n.subscription}`]);
  role('azurerm_role_assignment.discovery[0]', n.subscription, c.ciPrincipalId, `${c.name}-assignment-discovery`);
  return result;
}

export function pendingBootstrapImports(imports, existing) {
  return imports.filter(([address, id]) => {
    const resource = existing.find((r) => r.address === address);
    if (!resource) return true;
    if (!same(resource.values.id, id)) throw new Error(`Bootstrap ownership conflicts with live Azure at ${address}. Refusing to overwrite local state.`);
    return false;
  });
}

function initBootstrap(root) {
  const stateFile = join(infra, 'state', 'terraform.tfstate');
  const recovery = join(infra, '.local-operations', 'bootstrap-imports.json');
  // Bootstrap state must outlive the storage account it describes.
  writeFileSync(join(root, 'local-backend.tf'),
    `terraform {\n  backend "local" {\n    path = ${JSON.stringify(stateFile.replaceAll('\\', '/'))}\n  }\n}\n`);
  writeFileSync(join(root, 'inputs.auto.tfvars.json'),
    JSON.stringify({ name: config.name, ci_principal_id: config.ciPrincipalId }), { mode: 0o600 });
  terraform(root, ['init', '-input=false', '-reconfigure', '-lockfile=readonly']);
  const existing = existsSync(stateFile) ? instances(readJson(stateFile)) : [];
  assertOwned(existing, 'state');
  const receipt = join(infra, '.local-operations', 'main-removed.json');
  const imports = existsSync(recovery) ? readJson(recovery) :
    existsSync(receipt) ? [] : bootstrapImports(az);
  const pending = pendingBootstrapImports(imports, existing);
  if (pending.length) {
    console.info('Recovering bootstrap ownership into ignored local state via Terraform imports (Azure reads only).');
    mkdirSync(join(infra, '.local-operations'), { recursive: true });
    writeFileSync(recovery, JSON.stringify(imports), { mode: 0o600 });
    for (const [address, id] of pending) {
      terraform(root, ['import', '-input=false', '-lock-timeout=60s', address, id]);
    }
  }
  if (existsSync(recovery)) rmSync(recovery);
  const state = parseJson(terraform(root, ['state', 'pull']), 'Bootstrap state');
  assertOwned(instances(state), 'state');
  return state;
}

function createPlan(root, label) {
  const path = join(root, 'destroy.tfplan');
  terraform(root, ['validate', '-json']);
  terraform(root, ['plan', '-destroy', '-input=false', '-lock-timeout=60s', '-json', `-out=${path}`]);
  const summary = inspectPlan(parseJson(terraform(root, ['show', '-json', path]), 'Destroy plan'), label);
  console.info(`${label} destroy plan: ${summary.count} resources to delete`);
  const important = /^(azurerm_resource_group|azurerm_container_app|azurerm_container_app_environment|azurerm_container_app_job|azurerm_container_registry|azurerm_key_vault|azurerm_postgresql_flexible_server|azurerm_cdn_frontdoor_profile|azurerm_cdn_frontdoor_endpoint|azurerm_storage_account|azurerm_role_definition)\./;
  for (const target of summary.targets.filter((target) => important.test(target))) console.info(`  ${target}`);
  return { root, path, summary };
}

function prepare(directory) {
  const n = names();
  const receipt = join(infra, '.local-operations', 'main-removed.json');
  const stateRoot = isolatedRoot(directory, join(infra, 'state'), 'state');
  if (existsSync(receipt)) {
    const previous = readJson(receipt);
    if (!same(previous.subscriptionId, config.subscriptionId) || previous.name !== config.name ||
        groupExists(n.appGroup)) throw new Error('Invalid prior main teardown receipt or application group has reappeared. Refusing state deletion.');
    const bootstrap = initBootstrap(stateRoot);
    assertInventory(inventory(n.stateGroup), instances(bootstrap));
    return { main: null, storage: createPlan(stateRoot, 'state') };
  }
  const mainRoot = isolatedRoot(directory, infra, 'main');
  initMain(mainRoot);
  const state = parseJson(terraform(mainRoot, ['state', 'pull']), 'Production state');
  const managed = instances(state);
  assertOwned(managed, 'main');
  assertInventory(inventory(n.appGroup), managed);
  const snapshot = join(infra, '.local-operations', 'inputs.json');
  if (managed.length) {
    const inputs = existsSync(snapshot) ? readJson(snapshot) : destroyInputs(state);
    if (!same(inputs.subscription_id, config.subscriptionId) || !same(inputs.tenant_id, config.tenantId) ||
        inputs.name !== config.name || !same(inputs.ci_principal_id, config.ciPrincipalId)) {
      throw new Error('Local destroy input snapshot is for another assignment.');
    }
    mkdirSync(join(infra, '.local-operations'), { recursive: true });
    writeFileSync(snapshot, JSON.stringify(inputs), { mode: 0o600 });
    copyFileSync(snapshot, join(mainRoot, 'inputs.auto.tfvars.json'));
  } else {
    if (groupExists(n.appGroup)) throw new Error('Application group exists but remote state is empty. Refusing deletion.');
    if (!existsSync(snapshot)) throw new Error('Empty main state without a retry snapshot. Refusing to discard the backend without proven main teardown.');
    copyFileSync(snapshot, join(mainRoot, 'inputs.auto.tfvars.json'));
  }
  const main = createPlan(mainRoot, 'main');
  const bootstrap = initBootstrap(stateRoot);
  assertInventory(inventory(n.stateGroup), instances(bootstrap));
  const storage = createPlan(stateRoot, 'state');
  if (!storage.summary.count) throw new Error('Bootstrap state is empty. Refusing an incomplete teardown.');
  return { main, storage };
}

async function confirm() {
  if (!process.stdin.isTTY) throw new Error('Interactive confirmation requires a terminal. Use --force only when explicitly authorizing destruction.');
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await prompt.question(`Type DESTROY ${config.name} to permanently remove both roots and all application data: `) === `DESTROY ${config.name}`;
  } finally { prompt.close(); }
}

export async function executeDestroy({ dryRun = false, force = false }, ops) {
  ops.checkAccount();
  ops.preview();
  const plans = ops.prepare();
  if (dryRun) {
    ops.log('DRY RUN: destroy plans inspected; no apply/destroy or Azure resource deletion executed.');
    return plans;
  }
  if (!force && !await ops.confirm()) throw new Error('Teardown cancelled. No resources were destroyed.');
  ops.checkAccount();
  if (plans.main) ops.apply(plans.main);
  if (ops.appExists()) throw new Error('Application resource group still exists. State/bootstrap teardown is BLOCKED.');
  ops.recordMainRemoval();
  ops.checkAccount();
  ops.checkBootstrapInventory();
  ops.apply(plans.storage);
  if (ops.stateExists()) throw new Error('State resource group still exists. Teardown is incomplete.');
  ops.log('Both assignment resource groups are absent. Key Vault soft-delete retention is 7 days; no purge attempted.');
  ops.log('Entra GitHub app/SP/federation and GitHub configuration are intentionally retained. No tenant identity was deleted.');
  return plans;
}

async function destroy(options) {
  let directory;
  let completed = false;
  const snapshot = join(infra, '.local-operations', 'inputs.json');
  const snapshotExisted = existsSync(snapshot);
  try {
    const n = names();
    await executeDestroy(options, {
      checkAccount: account,
      preview: () => console.info(`Assignment teardown preview\nSubscription: ${config.subscriptionId}\nApplication group: ${n.appGroup}\nState group: ${n.stateGroup}\nState account: ${n.stateAccount}\nState key: tfstate/${n.stateKey}\nPublic application: ${config.name}-public\nRoots: infra then infra/state\nDo not run concurrently with production delivery; local operations do not acquire the GitHub concurrency lock.`),
      prepare: () => {
        directory = mkdtempSync(join(tmpdir(), 'weather-local-operations-'));
        return prepare(directory);
      }, confirm,
      apply: ({ root, path }) => {
        console.info(`Applying inspected destroy plan for ${root.endsWith('main') ? 'infra' : 'infra/state'}...`);
        terraform(root, ['apply', '-input=false', '-lock-timeout=60s', '-json', path]);
      },
      appExists: () => groupExists(n.appGroup), stateExists: () => groupExists(n.stateGroup),
      recordMainRemoval: () => writeFileSync(join(infra, '.local-operations', 'main-removed.json'),
        JSON.stringify({ subscriptionId: config.subscriptionId, name: config.name, verifiedAt: new Date().toISOString() }), { mode: 0o600 }),
      checkBootstrapInventory: () => assertInventory(inventory(n.stateGroup), instances(readJson(join(infra, 'state', 'terraform.tfstate')))),
      log: console.info,
    });
    completed = !options.dryRun;
    if (completed) {
      console.info('Outside Terraform: manual CI Contributor and Role Based Access Control Administrator at subscription scope remain; review/revoke separately with their owner.');
      deletedVaults();
    }
  } finally {
    if (directory) rmSync(directory, { recursive: true, force: true });
    if ((completed || (options.dryRun && !snapshotExisted)) && existsSync(snapshot)) rmSync(snapshot);
    const receipt = join(infra, '.local-operations', 'main-removed.json');
    if (completed && existsSync(receipt)) rmSync(receipt);
  }
}

export function parseArgs(args) {
  const [mode, ...flags] = args;
  if (mode === '--help') return { mode: 'help' };
  if (!['status', 'destroy'].includes(mode) || new Set(flags).size !== flags.length ||
      flags.some((flag) => !['--dry-run', '--force'].includes(flag)) ||
      (mode === 'status' && flags.length) || (flags.includes('--dry-run') && flags.includes('--force'))) {
    throw new Error('Use status or destroy [--dry-run | --force]. Unknown/combined unsafe flags are rejected.');
  }
  return { mode, dryRun: flags.includes('--dry-run'), force: flags.includes('--force') };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.mode === 'status') status();
    else if (options.mode === 'destroy') await destroy(options);
    else console.info('npm run infra:status\nnpm run infra:destroy [-- --dry-run | --force]\nRequires Node, Azure CLI (az login) and Terraform 1.16.5. Dry run never applies.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
