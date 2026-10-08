import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { required } from './azure.mjs';

export function changedSurfaces(paths) {
  const delivery = paths.some((path) => path.startsWith('.github/workflows/') ||
    path.startsWith('infra/scripts/') || path.startsWith('infra/test/'));
  return {
    backend: delivery || paths.some((path) => path.startsWith('backend/')),
    frontend: delivery || paths.some((path) => path.startsWith('frontend/')),
    infra: delivery || paths.some((path) => path.startsWith('infra/')),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [before, after] = process.argv.slice(2);
    if (![before, after].every((value) => /^[a-f0-9]{40}$/.test(value ?? ''))) {
      throw new Error('Change detection requires exact commit SHAs.');
    }
    const args = /^0+$/.test(before)
      ? ['ls-tree', '-r', '--name-only', after]
      : ['diff', '--name-only', before, after, '--'];
    const paths = execFileSync('git', args, { encoding: 'utf8' }).trim().split(/\r?\n/);
    const changes = changedSurfaces(paths);
    appendFileSync(required('GITHUB_OUTPUT'),
      Object.entries(changes).map(([key, value]) => `${key}=${value}\n`).join(''));
    console.info(JSON.stringify(changes));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
