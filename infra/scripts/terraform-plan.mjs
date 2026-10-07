import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { az, findResource, required } from './azure.mjs';
import { extract } from './frontdoor-prefixes.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');

export function fingerprint({
  group = required('AZURE_RESOURCE_GROUP'),
  subscription = required('AZURE_SUBSCRIPTION_ID'),
  appName = required('ACA_APP_NAME'),
  jobName = required('MIGRATION_JOB_NAME'),
} = {}) {
  const base = `/subscriptions/${subscription}/resourceGroups/${group}/providers/Microsoft.App`;
  const app = findResource(`${base}/containerApps/${appName}`);
  const job = findResource(`${base}/jobs/${jobName}`);
  return hash(JSON.stringify({
    app: app ? {
      image: app.properties.template.containers[0].image,
      suffix: app.properties.template.revisionSuffix,
      traffic: [...app.properties.configuration.ingress.traffic].sort((a, b) => a.revisionName.localeCompare(b.revisionName)),
    } : null,
    jobImage: job ? job.properties.template.containers[0].image : null,
  }));
}

export function verifyMetadata(metadata, inputs, liveFingerprint, planBytes, now = Date.now()) {
  const age = now - Date.parse(metadata.created);
  if (metadata.sha !== required('GITHUB_SHA') || metadata.repository !== required('GITHUB_REPOSITORY') ||
      metadata.run !== required('PLAN_RUN_ID') || metadata.attempt !== required('PLAN_RUN_ATTEMPT') ||
      metadata.configHash !== hash(JSON.stringify(inputs)) || !Number.isFinite(age) || age < 0 ||
      age > 24 * 60 * 60 * 1000 || metadata.planHash !== hash(planBytes) ||
      metadata.fingerprint !== liveFingerprint) {
    throw new Error('Saved plan is stale, altered, for another commit/input/run, or predates a release. Generate a new reviewed plan.');
  }
}

function main() {
  const inputs = JSON.parse(required('TERRAFORM_INPUTS_JSON'));
  const configHash = hash(JSON.stringify(inputs));
  const mode = process.argv[2];
  if (mode === 'inputs') {
    const current = extract(az(['network', 'list-service-tags', '--location', 'swedencentral']));
    if (JSON.stringify([...inputs.frontdoor_backend_ipv4].sort()) !== JSON.stringify(current.frontdoor_backend_ipv4) ||
        String(inputs.frontdoor_service_tag_change_number) !== current.frontdoor_service_tag_change_number) {
      throw new Error('Front Door service-tag data changed. Review the complete current IPv4 set and update inputs; last good Azure ACL is unchanged.');
    }
    writeFileSync('infra/runtime.auto.tfvars.json', JSON.stringify(inputs));
    writeFileSync('plan-fingerprint.json', JSON.stringify({ fingerprint: fingerprint(), configHash }));
  } else if (mode === 'seal') {
    const before = JSON.parse(readFileSync('plan-fingerprint.json', 'utf8'));
    if (before.fingerprint !== fingerprint()) throw new Error('A release changed during planning; regenerate/review the plan.');
    const metadata = {
      ...before, sha: required('GITHUB_SHA'), repository: required('GITHUB_REPOSITORY'),
      run: required('GITHUB_RUN_ID'), attempt: required('GITHUB_RUN_ATTEMPT'),
      created: new Date().toISOString(), planHash: hash(readFileSync('production.tfplan')),
    };
    writeFileSync('plan-metadata.json', JSON.stringify(metadata, null, 2));
    const plan = JSON.parse(execFileSync('terraform', ['-chdir=infra', 'show', '-json', resolve('production.tfplan')], {
      encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    }));
    const counts = {};
    for (const resource of plan.resource_changes ?? []) {
      const action = resource.change.actions.join('/');
      counts[action] = (counts[action] ?? 0) + 1;
    }
    appendFileSync(required('GITHUB_STEP_SUMMARY'),
      `### Protected Terraform plan\nCommit: \`${metadata.sha}\`\n\nPlan SHA256: \`${metadata.planHash}\`\n\nCreated: ${metadata.created}\n\nAction counts: ${JSON.stringify(counts)}\n\nReview the exact private tfplans blob with authorized Azure access before approving apply. No plan/state is uploaded to GitHub.\n`);
  } else if (mode === 'verify') {
    verifyMetadata(JSON.parse(readFileSync('plan-metadata.json', 'utf8')), inputs, fingerprint(), readFileSync('production.tfplan'));
    writeFileSync('infra/runtime.auto.tfvars.json', JSON.stringify(inputs));
    console.info('Verified exact private plan. Terraform additionally enforces state lineage/serial.');
  } else { throw new Error('Use inputs, seal or verify.'); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
