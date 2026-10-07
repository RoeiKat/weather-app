import { readFileSync, writeFileSync } from 'node:fs';
import { isIPv4 } from 'node:net';
import { fileURLToPath } from 'node:url';

export function extract(document) {
  const entries = document.values?.filter((item) => item.name === 'AzureFrontDoor.Backend');
  if (entries?.length !== 1) throw new Error('Expected exactly one global AzureFrontDoor.Backend service tag.');
  const entry = entries[0];
  const prefixes = entry.properties?.addressPrefixes;
  if (!Array.isArray(prefixes) || !prefixes.length) throw new Error('Missing service-tag prefixes.');
  const ipv4 = [];
  for (const prefix of prefixes) {
    if (typeof prefix !== 'string') throw new Error('Invalid prefix shape.');
    if (prefix.includes(':')) continue;
    const [address, mask, extra] = prefix.split('/');
    if (!isIPv4(address) || extra || !/^\d+$/.test(mask) || Number(mask) < 8 || Number(mask) > 32) {
      throw new Error('Invalid or unsafe IPv4 prefix.');
    }
    ipv4.push(prefix);
  }
  const change = String(entry.properties.changeNumber);
  if (!ipv4.length || !/^\d+$/.test(change)) throw new Error('Empty IPv4 set or missing change number.');
  return {
    frontdoor_backend_ipv4: [...new Set(ipv4)].sort(),
    frontdoor_service_tag_change_number: change,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [source, destination] = process.argv.slice(2);
    if (!source || !destination || source === destination) throw new Error('Supply distinct input JSON and output candidate tfvars paths.');
    const candidate = extract(JSON.parse(readFileSync(source, 'utf8')));
    writeFileSync(destination, `${JSON.stringify(candidate, null, 2)}\n`, { flag: 'wx' });
    console.info(`Wrote ${candidate.frontdoor_backend_ipv4.length} reviewed-candidate IPv4 prefixes; no Azure mutation.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
