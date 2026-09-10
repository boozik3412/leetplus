import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { CONTRACT, canonical, demand, digest, release } from './contract.mjs';

const [imagesRoot, parentRoot, output] = process.argv.slice(2);
demand(imagesRoot && parentRoot && output, 'Expected images directory, parent admission directory and output');
const sha = process.env.CI_RELEASE_SHA;
demand(process.env.GITHUB_EVENT_NAME === 'push' && process.env.GITHUB_REF === 'refs/heads/main' && process.env.GITHUB_REPOSITORY === 'boozik3412/leetplus', 'Only exact-main push may admit images');
const parentFiles = fs.readdirSync(parentRoot).filter(name => /^leetplus-release-admission-[a-f0-9]{40}\.json$/.test(name));
demand(parentFiles.length === 1, 'Expected one exact parent admission');
const parentRaw = fs.readFileSync(path.join(parentRoot, parentFiles[0]));
const parent = JSON.parse(parentRaw);
demand(parent.admission === 'PASS' && parent.schemaVersion === 2 && parent.releaseSha === sha && parent.repository === process.env.GITHUB_REPOSITORY && parent.runId === process.env.GITHUB_RUN_ID && parent.workflowSha === sha && parent.workflowRef === `boozik3412/leetplus/.github/workflows/ci.yml@refs/heads/main`, 'Parent admission identity mismatch');
const r = release(JSON.parse(fs.readFileSync(path.join(imagesRoot, 'release.json'))));
demand(r.releaseSha === sha, 'Images do not belong to admitted source');
async function fileHash(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
const sums = new Map(fs.readFileSync(path.join(imagesRoot, 'SHA256SUMS'), 'utf8').trim().split('\n').map(line => {
  const m = line.match(/^([a-f0-9]{64})  ([a-zA-Z0-9.-]+)$/); demand(m, 'Invalid archive checksum record'); return [m[2], m[1]];
}));
for (const name of ['images.tar.gz', 'release.json', 'control.tar.gz', 'compose.rehearsal.json', 'transport-validation.json', 'archive-roundtrip.json']) {
  demand(sums.has(name) && sums.get(name) === await fileHash(path.join(imagesRoot, name)), 'Image handoff checksum mismatch');
}
const transport = JSON.parse(fs.readFileSync(path.join(imagesRoot, 'transport-validation.json')));
demand(transport.decision === 'PASS' && transport.tlsRequired === true && transport.badCaRejected === true && transport.badHostnameRejected === true, 'Real Prisma TLS negative matrix did not pass');
const roundtrip = JSON.parse(fs.readFileSync(path.join(imagesRoot, 'archive-roundtrip.json')));
demand(roundtrip.decision === 'PASS' && roundtrip.engine === '29.1.3' && roundtrip.store === 'containerd' && roundtrip.isolatedDaemon === true && canonical(roundtrip.images) === canonical(r.images), 'A fresh target-compatible daemon must load and run all four exact images');
const admission = { contract: `${CONTRACT}_ADMISSION`, decision: 'PASS', releaseSha: sha,
  repository: process.env.GITHUB_REPOSITORY, ref: process.env.GITHUB_REF, event: process.env.GITHUB_EVENT_NAME,
  runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT,
  parentAdmissionSha256: digest(parentRaw), parentRunAttempt: parent.runAttempt,
  effectiveLane: parent.effectiveLane, impactReceiptSha256: parent.impactReceiptSha256,
  archiveSha256: sums.get('images.tar.gz'), releaseManifestSha256: sums.get('release.json'), controlArchiveSha256: sums.get('control.tar.gz'),
  transportValidationSha256: sums.get('transport-validation.json'), archiveRoundtripSha256: sums.get('archive-roundtrip.json'), images: r.images };
fs.writeFileSync(output, canonical(admission), { flag: 'wx', mode: 0o440 });
