import { appendFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  apiVersion, candidateTraffic, findResource, immutableImage, list, productionTraffic,
  promotedTraffic, required, rest, smoke, waitFor,
} from './azure.mjs';

export async function ready(id, revision, minimum = 2) {
  return waitFor(`two ready replicas of ${revision}`, () => {
    const current = list(id, '/revisions').find((item) => item.name === revision);
    if (!current) return false;
    const properties = current.properties;
    if (properties.provisioningState === 'Failed' || properties.runningState === 'Failed') {
      throw new Error('Revision provisioning/health failed.');
    }
    if (!properties.active || properties.healthState !== 'Healthy' || properties.provisioningState !== 'Provisioned') return false;
    const replicas = list(id, `/revisions/${revision}/replicas`);
    return properties.active && properties.healthState === 'Healthy' &&
      properties.provisioningState === 'Provisioned' &&
      replicas.filter((replica) => replica.properties.containers?.length > 0 &&
        replica.properties.containers.every((container) => container.ready === true)).length >= minimum;
  });
}

async function setTraffic(id, traffic) {
  const current = rest('get', id);
  const ingress = { ...current.properties.configuration.ingress, traffic };
  rest('patch', id, { properties: { configuration: { ingress } } });
  await waitFor('exact named traffic allocation', () => {
    const actual = rest('get', id).properties.configuration.ingress.traffic;
    return actual.length === traffic.length && traffic.every((expected) =>
      actual.some((item) => item.revisionName === expected.revisionName &&
        item.weight === expected.weight && item.label === expected.label && !item.latestRevision));
  });
}

export async function executeJob(jobId, template, description = 'Migration') {
  const image = template.containers[0].image;
  const executions = list(jobId, '/executions', `${description}: check execution overlap`);
  if (executions.some((execution) => execution.properties.status === 'Running')) {
    throw new Error('Another Job execution is running; refusing overlap.');
  }
  const containers = [...template.containers, ...(template.initContainers ?? [])];
  if (template.volumes?.length || containers.some((container) => container.probes?.length || container.volumeMounts?.length)) {
    throw new Error('Job start overrides do not support volumes, volume mounts or probes; inspect the platform template.');
  }
  // GET returns a JobTemplate, but /start accepts the narrower JobExecutionTemplate.
  const executionContainer = ({ name, image, command, args, env, resources }) => ({
    name, image, command, args, env, resources,
  });
  const executionTemplate = { containers: template.containers.map(executionContainer) };
  if (template.initContainers) executionTemplate.initContainers = template.initContainers.map(executionContainer);
  // Override this execution, rather than rewrite Terraform-owned Job configuration.
  const started = rest('post', jobId, executionTemplate, '/start', `${description}: start Job`);
  const priorNames = new Set(executions.map((execution) => execution.name));
  const execution = await waitFor('migration execution identity', () => {
    const fresh = list(jobId, '/executions', `${description}: discover started execution`).filter((item) =>
      !priorNames.has(item.name) && (!started?.name || item.name === started.name));
    if (fresh.length > 1) throw new Error('Ambiguous migration execution; stop for human inspection.');
    return fresh.length === 1 ? fresh[0] : false;
  }, 120_000);
  await waitFor('migration completion', () => {
    const current = rest('get', jobId, null, `/executions/${execution.name}`, `${description}: poll execution`);
    const actual = current.properties.template.containers[0];
    const expected = template.containers[0];
    if (actual.image !== image || JSON.stringify(actual.command) !== JSON.stringify(expected.command) ||
        JSON.stringify(actual.args) !== JSON.stringify(expected.args)) {
      throw new Error('Job execution did not use the approved digest and command.');
    }
    const status = current.properties.status;
    if (['Failed', 'Stopped', 'Degraded'].includes(status)) throw new Error(`${description} ${status}; promotion stopped.`);
    return status === 'Succeeded';
  }, 720_000);
  return execution.name;
}

export async function migrate(jobId, image) {
  const job = rest('get', jobId);
  const template = structuredClone(job.properties.template);
  if (template.containers.length !== 1 || template.containers[0].name !== 'migration' ||
      JSON.stringify(template.containers[0].command) !== '["npm"]' ||
      JSON.stringify(template.containers[0].args) !== '["run","migrate"]') {
    throw new Error('Migration platform template does not match the accepted application command.');
  }
  template.containers[0].image = image;
  return executeJob(jobId, template);
}

export async function release() {
  const group = required('AZURE_RESOURCE_GROUP');
  const subscription = required('AZURE_SUBSCRIPTION_ID');
  const appName = required('ACA_APP_NAME');
  const id = `/subscriptions/${subscription}/resourceGroups/${group}/providers/Microsoft.App/containerApps/${appName}`;
  const jobId = `/subscriptions/${subscription}/resourceGroups/${group}/providers/Microsoft.App/jobs/${required('MIGRATION_JOB_NAME')}`;
  const app = findResource(id);
  if (!app) {
    const receipt = {
      commit: required('GITHUB_SHA'), run: required('GITHUB_RUN_ID'), apiVersion,
      outcome: 'core-infrastructure-only', previousRevision: null,
    };
    try {
      if (process.env.PLATFORM_REVISION_ONLY === 'true') {
        if (process.env.EXPECT_API_CREATED !== 'false') {
          throw new Error('Terraform expected an API but it could not be discovered; refusing a core-only success.');
        }
        if (!findResource(jobId)) throw new Error('Expected core migration Job is missing; inspect the infrastructure deployment.');
        console.info('Core infrastructure is ready; no API exists yet. Prepare the backend before enabling bootstrap_image.');
      } else if (process.env.BOOTSTRAP_ONLY === 'true') {
        if (!findResource(jobId)) throw new Error('Create core infrastructure, including the migration Job, before backend bootstrap.');
        receipt.image = immutableImage(required('RELEASE_IMAGE'), required('ACR_LOGIN_SERVER'));
        receipt.migrationExecution = await migrate(jobId, receipt.image);
        receipt.outcome = 'prepared-not-deployed';
        console.info('Backend migrations prepared. Grant runtime SQL access and set bootstrap_image to this digest in the next reviewed Terraform plan.');
      } else {
        throw new Error('First deployment requires operation=bootstrap, then runtime grants and a reviewed Terraform plan with bootstrap_image.');
      }
    } catch (error) {
      receipt.outcome = 'failed';
      receipt.failure = error.message;
      throw error;
    } finally {
      writeFileSync('release-receipt.json', JSON.stringify(receipt, null, 2));
      if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        `### First-deployment preparation\nOutcome: ${receipt.outcome}\n\nImage: \`${receipt.image ?? 'not yet published'}\`\n\nNo API traffic was promoted.\n`);
    }
    return;
  }
  if (process.env.BOOTSTRAP_ONLY === 'true') throw new Error('The API already exists; use deploy, not bootstrap.');
  const publicUrl = required('PUBLIC_URL');
  const previous = productionTraffic(app);
  const knownGood = previous.find((item) => item.weight === 100).revisionName;
  const knownRevision = rest('get', id, null, `/revisions/${knownGood}`);
  const receipt = {
    commit: required('GITHUB_SHA'), run: required('GITHUB_RUN_ID'), apiVersion,
    previousRevision: knownGood,
    previousImage: knownRevision.properties.template.containers[0].image,
    previousTraffic: previous, outcome: 'started',
  };
  writeFileSync('release-receipt.json', JSON.stringify(receipt, null, 2));
  let candidate;
  let promotionAttempted = false;
  try {
    await ready(id, knownGood);
    if (process.env.PLATFORM_REVISION_ONLY === 'true') {
      await waitFor('canonical smoke after platform/initial-origin propagation', async () => {
        try { await smoke(publicUrl); return true; }
        catch (error) { console.error(`Platform smoke pending: ${error.message}`); return false; }
      }, 300_000);
    } else {
      await smoke(publicUrl);
    }
    const rollback = process.env.ROLLBACK_REVISION;
    if (process.env.PLATFORM_REVISION_ONLY === 'true') {
      candidate = rest('get', id).properties.latestRevisionName;
      const target = rest('get', id, null, `/revisions/${candidate}`);
      immutableImage(target.properties.template.containers[0].image, required('ACR_LOGIN_SERVER'));
    } else if (rollback) {
      if (!process.env.SCHEMA_COMPATIBILITY_APPROVED || process.env.SCHEMA_COMPATIBILITY_APPROVED !== 'true' ||
          !rollback.startsWith(`${appName}--`) || !/^[a-z0-9-]+$/.test(rollback)) {
        throw new Error('Rollback requires a retained revision and explicit schema compatibility approval.');
      }
      candidate = rollback;
      const target = rest('get', id, null, `/revisions/${candidate}`);
      immutableImage(target.properties.template.containers[0].image, required('ACR_LOGIN_SERVER'));
      if (!target.properties.active) rest('post', id, null, `/revisions/${candidate}/activate`);
    } else {
      const image = immutableImage(required('RELEASE_IMAGE'), required('ACR_LOGIN_SERVER'));
      receipt.image = image;
      receipt.migrationExecution = await migrate(jobId, image);
      const suffix = `r${required('GITHUB_RUN_ID')}-${required('GITHUB_RUN_ATTEMPT')}`;
      if (!/^r[0-9]+-[0-9]+$/.test(suffix)) throw new Error('Invalid revision suffix.');
      candidate = `${appName}--${suffix}`;
      const template = structuredClone(app.properties.template);
      if (template.containers.length !== 1 || template.containers[0].name !== 'api') {
        throw new Error('Unexpected API template; refusing to rewrite platform configuration.');
      }
      template.containers[0].image = image;
      template.revisionSuffix = suffix;
      rest('patch', id, { properties: { template } });
    }
    receipt.candidate = candidate;
    await ready(id, candidate);
    if (candidate === knownGood) {
      await smoke(publicUrl);
      receipt.outcome = 'unchanged';
      console.info('The validated platform/rollback target is already the serving revision.');
      return;
    }
    const current = productionTraffic(rest('get', id));
    if (current.find((item) => item.weight === 100).revisionName !== knownGood) {
      throw new Error('Serving revision changed during the serialized release.');
    }
    const labelled = candidateTraffic(previous, candidate);
    await setTraffic(id, labelled);
    await waitFor('same-profile candidate smoke', async () => {
      // Retry only bounded read-only smoke checks while ingress label propagates.
      try { await smoke(publicUrl, true); return true; }
      catch (error) { console.error(`Candidate smoke pending: ${error.message}`); return false; }
    }, 300_000);
    promotionAttempted = true;
    await setTraffic(id, promotedTraffic(labelled, candidate));
    for (let check = 0; check < 6; check++) {
      await ready(id, candidate);
      await smoke(publicUrl);
      if (check < 5) await new Promise((resolve) => setTimeout(resolve, 20_000));
    }
    receipt.outcome = 'promoted';
    console.info(`Promoted ${candidate}; retained warm rollback revision ${knownGood}.`);
  } catch (error) {
    receipt.outcome = 'failed';
    receipt.failure = error.message;
    if (promotionAttempted) {
      try {
        await ready(id, knownGood);
        await setTraffic(id, previous);
        await smoke(publicUrl);
        receipt.recovery = 'known-good traffic restored; schema was not reverted';
        console.error('Release failed; known-good traffic restored and verified.');
      } catch (recoveryError) {
        receipt.recovery = `FAILED: ${recoveryError.message}`;
        console.error('ROLLBACK FAILED. Human intervention/roll-forward required.');
      }
    } else {
      // Restore labels as well; do not leave a failed candidate exposed by the smoke selector.
      try { await setTraffic(id, previous); }
      catch (cleanupError) {
        receipt.recovery = `Traffic/label restoration FAILED: ${cleanupError.message}`;
        console.error(receipt.recovery);
      }
    }
    throw error;
  } finally {
    writeFileSync('release-receipt.json', JSON.stringify(receipt, null, 2));
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        `### Backend release\nOutcome: ${receipt.outcome}\n\nPrevious: \`${knownGood}\`\n\nCandidate: \`${candidate ?? 'not created'}\`\n\n${receipt.recovery ?? ''}\n`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  release().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
