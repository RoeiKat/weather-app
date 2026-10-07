import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { az, required, smoke } from './azure.mjs';

const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
};
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function artifactFiles(directory) {
  const root = resolve(directory);
  const files = [];
  function visit(path) {
    for (const name of readdirSync(path)) {
      const full = join(path, name);
      const stat = lstatSync(full);
      if (stat.isSymbolicLink()) throw new Error('Symlinks are forbidden in static artifacts.');
      if (stat.isDirectory()) { visit(full); continue; }
      const key = relative(root, full).split(sep).join('/');
      if (['checksums.json'].includes(key)) continue;
      const asset = key.startsWith('assets/');
      if ((!asset && !['index.html', '404.html'].includes(key)) ||
          (asset && !/-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/.test(basename(key))) || !mime[extname(key)]) {
        throw new Error(`Unexpected, unhashed, or unsupported public build file: ${key}`);
      }
      const bytes = readFileSync(full);
      files.push({ key, full, hash: sha256(bytes), type: mime[extname(key)], asset });
    }
  }
  visit(root);
  if (!files.some((file) => file.key === 'index.html') || !files.some((file) => file.key === '404.html') ||
      !files.some((file) => file.asset)) throw new Error('Build must include index, real 404 and hashed assets.');
  return files.sort((a, b) => a.key.localeCompare(b.key));
}

export function verifyManifest(files, manifest) {
  if (Object.keys(manifest).length !== files.length ||
      files.some((file) => manifest[file.key] !== file.hash)) throw new Error('Static artifact checksum mismatch.');
}

async function frontendSmoke(url, files) {
  await smoke(url);
  for (const path of ['/', '/login', '/login/', '/register', '/register/']) {
    const response = await fetch(`${url}${path}`, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
    const html = await response.text();
    if (response.status !== 200 || sha256(html) !== files.find((file) => file.key === 'index.html').hash ||
        !response.headers.get('cache-control')?.includes('no-store') ||
        !response.headers.get('content-type')?.includes('text/html') ||
        response.headers.get('x-content-type-options') !== 'nosniff' ||
        !response.headers.get('content-security-policy')?.includes("script-src 'self'")) {
      throw new Error(`Canonical navigation/header smoke failed: ${path}`);
    }
  }
  const asset = files.find((file) => file.asset && file.key.endsWith('.js'));
  if (!asset) throw new Error('Missing built JavaScript asset.');
  const response = await fetch(`${url}/${asset.key}`, { signal: AbortSignal.timeout(15_000) });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (response.status !== 200 || sha256(bytes) !== asset.hash ||
      !response.headers.get('cache-control')?.includes('immutable') ||
      !response.headers.get('content-type')?.includes('javascript')) throw new Error('Asset MIME/cache/bytes smoke failed.');
  for (const path of ['/assets/not-a-real-release-file.js', '/not-a-client-route', '/api/v1/not-a-route']) {
    const missing = await fetch(`${url}${path}`, { signal: AbortSignal.timeout(15_000) });
    await missing.body?.cancel();
    if (missing.status !== 404 || !missing.headers.get('cache-control')?.includes('no-store')) {
      throw new Error(`404/cache-isolation smoke failed: ${path}`);
    }
  }
}

async function publish(directory) {
  const files = artifactFiles(directory);
  verifyManifest(files, JSON.parse(readFileSync(join(directory, 'checksums.json'), 'utf8')));
  const account = required('FRONTEND_STORAGE_ACCOUNT');
  const storage = ['--account-name', account, '--container-name', '$web', '--auth-mode', 'login'];
  const temp = join(required('RUNNER_TEMP'), 'weather-frontend-release');
  mkdirSync(temp, { recursive: true });
  const previousIndex = join(temp, 'previous-index.html');
  const previousExists = az(['storage', 'blob', 'exists', ...storage, '--name', 'index.html']).exists;
  if (previousExists) {
    az(['storage', 'blob', 'download', ...storage, '--name', 'index.html', '--file', previousIndex, '--overwrite', 'true']);
  }
  const upload = (file, overwrite) => {
    az(['storage', 'blob', 'upload', ...storage, '--name', file.key, '--file', file.full,
      '--overwrite', String(overwrite), '--content-type', file.type,
      '--content-cache-control', file.asset ? 'public, max-age=31536000, immutable' : 'no-store']);
    const download = join(temp, 'verify-bytes');
    az(['storage', 'blob', 'download', ...storage, '--name', file.key, '--file', download, '--overwrite', 'true']);
    if (sha256(readFileSync(download)) !== file.hash) throw new Error(`Uploaded blob checksum mismatch: ${file.key}`);
  };
  let switched = false;
  try {
    for (const file of files.filter((file) => file.asset)) {
      if (az(['storage', 'blob', 'exists', ...storage, '--name', file.key]).exists) {
        const download = join(temp, 'verify-existing');
        az(['storage', 'blob', 'download', ...storage, '--name', file.key, '--file', download, '--overwrite', 'true']);
        if (sha256(readFileSync(download)) !== file.hash) throw new Error(`Refusing to overwrite hashed URL: ${file.key}`);
      } else { upload(file, false); }
    }
    for (const file of files.filter((file) => !file.asset && file.key !== 'index.html')) upload(file, true);
    switched = true;
    upload(files.find((file) => file.key === 'index.html'), true);
    await frontendSmoke(required('PUBLIC_URL'), files);
    console.info('Frontend index promoted; canonical navigation, assets, 404s and same-origin API verified.');
  } catch (error) {
    if (switched && previousExists) {
      try {
        const html = readFileSync(previousIndex, 'utf8');
        const references = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1].slice(1));
        if (!references.length) throw new Error('Prior index has no verifiable retained assets.');
        for (const key of references) {
          if (!az(['storage', 'blob', 'exists', ...storage, '--name', key]).exists) throw new Error('Prior asset missing.');
        }
        upload({ key: 'index.html', full: previousIndex, hash: sha256(html), type: mime['.html'], asset: false }, true);
        const restored = await fetch(`${required('PUBLIC_URL')}/`, { signal: AbortSignal.timeout(15_000) });
        if (restored.status !== 200 || sha256(await restored.text()) !== sha256(html)) throw new Error('Prior index restoration not verified.');
        await smoke(required('PUBLIC_URL'));
        console.error('Frontend release failed; prior index restored and verified. Assets were not deleted.');
      } catch (recoveryError) {
        console.error(`FRONTEND ROLLBACK FAILED: ${recoveryError.message}`);
      }
    } else if (switched) {
      console.error('First frontend release failed: no previous index exists for rollback.');
    }
    throw error;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [operation, directory] = process.argv.slice(2);
  try {
    if (!directory || !existsSync(directory)) throw new Error('Supply an existing static artifact directory.');
    if (operation === 'manifest') {
      const files = artifactFiles(directory);
      writeFileSync(join(directory, 'checksums.json'),
        `${JSON.stringify(Object.fromEntries(files.map((file) => [file.key, file.hash])), null, 2)}\n`);
    } else if (operation === 'publish') {
      await publish(directory);
    } else { throw new Error('Use manifest or publish.'); }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
