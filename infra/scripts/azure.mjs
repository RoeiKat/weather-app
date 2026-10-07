import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

export const apiVersion = '2025-07-01';

export function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required configuration: ${name}`);
  return value;
}

export function az(args) {
  // Do not echo command bodies, Azure responses, credentials or application config.
  try {
    const result = execFileSync('az', [...args, '--only-show-errors', '--output', 'json'], {
      encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return result.trim() ? JSON.parse(result) : null;
  } catch (error) {
    throw new Error(`Azure command failed: ${args.slice(0, 2).join(' ')} (exit ${error.status ?? 'timeout'})`);
  }
}

export function resourceUrl(id, suffix = '') {
  return `https://management.azure.com${id}${suffix}?api-version=${apiVersion}`;
}

export function rest(method, id, body, suffix = '') {
  const args = ['rest', '--method', method, '--url', resourceUrl(id, suffix)];
  if (body) args.push('--body', JSON.stringify(body));
  return az(args);
}

export function list(id, suffix) {
  const result = [];
  let url = resourceUrl(id, suffix);
  for (let page = 0; page < 100; page++) {
    const response = az(['rest', '--method', 'get', '--url', url]);
    if (!Array.isArray(response.value)) throw new Error('Azure list returned an invalid shape.');
    result.push(...response.value);
    if (!response.nextLink) return result;
    if (new URL(response.nextLink).origin !== 'https://management.azure.com') throw new Error('Unexpected Azure pagination origin.');
    url = response.nextLink;
  }
  throw new Error('Azure pagination exceeded the bounded page limit.');
}

export function findResource(id) {
  const match = /^\/subscriptions\/([^/]+)\/resourceGroups\/([^/]+)\/providers\/Microsoft\.App\/(containerApps|jobs)\/([^/]+)$/.exec(id);
  if (!match) throw new Error('Invalid Container Apps resource ID.');
  const [, subscription, group, collection, name] = match;
  const exists = az(['group', 'exists', '--subscription', subscription, '--name', group]);
  if (exists === false) return null;
  if (exists !== true) throw new Error('Invalid resource-group existence response.');
  const base = id.slice(0, id.lastIndexOf(`/${collection}/`));
  return list(base, `/${collection}`).find((item) => item.name === name) ?? null;
}

export async function waitFor(description, check, timeoutMs = 600_000, intervalMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  do {
    const result = await check();
    if (result) return result;
    await delay(intervalMs);
  } while (Date.now() < deadline);
  throw new Error(`Timed out waiting for ${description}`);
}

export function immutableImage(value, host) {
  if (!/^[a-z0-9]+\.azurecr\.io\/weather-backend@sha256:[a-f0-9]{64}$/.test(value) ||
      !value.startsWith(`${host}/weather-backend@`)) {
    throw new Error('Release must use this registry and an immutable backend digest.');
  }
  return value;
}

export function productionTraffic(app) {
  const traffic = app.properties.configuration.ingress.traffic;
  if (!Array.isArray(traffic) || traffic.some((item) => item.latestRevision || !item.revisionName) ||
      traffic.reduce((sum, item) => sum + item.weight, 0) !== 100) {
    throw new Error('Traffic must use named revisions and total exactly 100%.');
  }
  const serving = traffic.filter((item) => item.weight > 0);
  if (serving.length !== 1 || serving[0].weight !== 100) {
    throw new Error('This bounded release flow requires one known-good 100% serving revision.');
  }
  return structuredClone(traffic);
}

export function candidateTraffic(previous, revision) {
  const result = previous.filter((item) => item.revisionName !== revision).map((item) => {
    const copy = { ...item };
    if (copy.label === 'candidate') delete copy.label;
    return copy;
  });
  result.push({ revisionName: revision, weight: 0, latestRevision: false, label: 'candidate' });
  return result;
}

export function promotedTraffic(traffic, revision) {
  if (!traffic.some((item) => item.revisionName === revision)) throw new Error('Candidate missing from traffic.');
  return traffic.map((item) => ({ ...item, weight: item.revisionName === revision ? 100 : 0, latestRevision: false }));
}

export async function smoke(baseUrl, candidate = false) {
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' || base.origin !== baseUrl) throw new Error('Smoke URL must be the canonical HTTPS origin.');
  const headers = candidate ? { 'X-Weather-Release-Target': 'candidate' } : {};
  for (const path of ['/api/v1/health', '/api/v1/auth/session']) {
    const response = await fetch(`${baseUrl}${path}`, {
      headers, redirect: 'error', signal: AbortSignal.timeout(15_000),
    });
    if (response.status !== 200 || !response.headers.get('cache-control')?.includes('no-store') ||
        (candidate && response.headers.get('x-weather-release-target') !== 'candidate')) {
      await response.body?.cancel();
      throw new Error(`Smoke status/cache/target check failed for ${path}`);
    }
    const body = await response.json();
    if (path.endsWith('/health') ? body.status !== 'ok' :
      body.user !== null || typeof body.csrfToken !== 'string' || !body.csrfToken) {
      throw new Error(`Smoke response shape failed for ${path}`);
    }
    // Session values and response bodies deliberately stay out of release evidence.
  }
}
