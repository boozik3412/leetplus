import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { canonical, digest, SCHEMA } from './contract.mjs';
import { DOWNLOAD_CONTRACT, acquire, assertOwnerMode, validateRemote, verifyDownloadedBundle } from './download-admitted-app-bundle.mjs';

const sha = 'a'.repeat(40);
const hash = letter => letter.repeat(64);
const image = letter => `sha256:${hash(letter)}`;
const fileHash = value => crypto.createHash('sha256').update(value).digest('hex');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'leetplus-app-download-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bundle = {
    schemaVersion: 2, contract: 'LEETPLUS_COMPOSE_APP_BUNDLE_V2', releaseLane: 'L1_APP_ONLY', releaseSha: sha,
    builtAt: '2026-09-24T00:00:00Z', apiResourceProfile: 'API_6G_V1',
    sourceImpact: { baseSha: 'b'.repeat(40), headSha: sha, classifierId: 'LEETPLUS_RELEASE_IMPACT_V1', rulesSha256: hash('1'), impactReceiptSha256: hash('2') },
    appImages: { api: image('3'), web: image('4') },
    schemaRequirement: { migrationCount: SCHEMA.migrationCount, migration: SCHEMA.migration, prismaSchemaSha256: hash('5'), migrationsInventorySha256: hash('6') },
    compatibilityRequirements: { policySha256: hash('7'), composeRuntimeContractSha256: hash('8'), controllerCapability: 'APP_ONLY_V2_BASELINE_CERTIFICATION', dataContract: 'LEETPLUS_COMPOSE_BLUE_GREEN_V1' },
    runtimeEvidence: { transportValidationSha256: hash('9'), apiRuntimeValidationSha256: hash('d'), archiveRoundtripSha256: hash('a'), networkValidationSha256: hash('b'), runtimeValidationSha256: hash('c') },
  };
  const files = {
    'app-bundle.json': canonical(bundle), 'app-images.tar.gz': 'api-web-image-archive', 'control.tar.gz': 'control-archive',
    'transport-validation.json': canonical({ decision: 'PASS' }), 'archive-roundtrip.json': canonical({ decision: 'PASS' }),
    'app-api-runtime-validation.json': canonical({ decision: 'PASS' }),
    'network-validation.json': canonical({ decision: 'PASS' }), 'runtime-validation.json': canonical({ decision: 'PASS' }),
  };
  files.SHA256SUMS = Object.keys(files).sort().map(name => `${fileHash(files[name])}  ${name}`).join('\n') + '\n';
  const admission = {
    schemaVersion: 2, contract: 'LEETPLUS_COMPOSE_APP_ADMISSION_V2', decision: 'PASS', releaseLane: 'L1_APP_ONLY', releaseSha: sha,
    repository: 'boozik3412/leetplus', ref: 'refs/heads/main', event: 'push', runId: '123', runAttempt: '1',
    workflowRef: 'boozik3412/leetplus/.github/workflows/ci.yml@refs/heads/main', workflowSha: sha,
    parentCandidateReceiptSha256: hash('d'), parentImpactReceiptSha256: hash('e'), requiredGateReceiptSha256: hash('f'),
    gateReceiptSha256: { authorityRootTrust: hash('1'), application: hash('2'), postgresqlAssortment: hash('3'), migrationSmoke: hash('4'), appImageRuntime: hash('5') },
    appArtifact: { name: `leetplus-compose-app-${sha}-123-1`, id: '456', transportDigest: hash('6') },
    bundleManifestSha256: fileHash(files['app-bundle.json']), appArchiveSha256: fileHash(files['app-images.tar.gz']),
    transportValidationSha256: fileHash(files['transport-validation.json']), apiRuntimeValidationSha256: fileHash(files['app-api-runtime-validation.json']), archiveRoundtripSha256: fileHash(files['archive-roundtrip.json']),
    networkValidationSha256: fileHash(files['network-validation.json']), runtimeValidationSha256: fileHash(files['runtime-validation.json']),
    appImages: bundle.appImages, schemaRequirementSha256: digest(bundle.schemaRequirement), compatibilityRequirementsSha256: digest(bundle.compatibilityRequirements),
  };
  const admissionFile = path.join(root, 'app-admission.json'); fs.writeFileSync(admissionFile, canonical(admission));
  const input = { contract: DOWNLOAD_CONTRACT, releaseSha: sha, admissionSha256: fileHash(canonical(admission)), runId: '123', runAttempt: '1', artifactId: '456' };
  const run = { id: 123, run_attempt: 1, repository: { full_name: 'boozik3412/leetplus' }, head_repository: { full_name: 'boozik3412/leetplus' }, path: '.github/workflows/ci.yml', status: 'completed', conclusion: 'success', event: 'push', head_branch: 'main', head_sha: sha };
  const artifact = { id: 456, name: `leetplus-compose-app-${sha}-123-1`, expired: false, digest: `sha256:${hash('6')}`, workflow_run: { id: 123, head_sha: sha, head_branch: 'main' } };
  let downloads = 0;
  function executor({ loseResponse = false } = {}) {
    return (_command, args, options) => {
      if (args[0] === 'api') return spawnSync(process.execPath, ['--input-type=module', '-e', `process.stdout.write(${JSON.stringify(JSON.stringify(args[1].includes('/artifacts/') ? artifact : run))})`], options);
      downloads++;
      const code = `import fs from 'node:fs';import path from 'node:path';for(const [name,value] of Object.entries(${JSON.stringify(files)}))fs.writeFileSync(path.join(${JSON.stringify(path.join(root, 'download', 'bundle'))},name),value);process.exit(${loseResponse ? 7 : 0})`;
      return spawnSync(process.execPath, ['--input-type=module', '-e', code], options);
    };
  }
  return { root, input, files, admissionFile, admission, run, artifact, executor, downloads: () => downloads };
}

test('downloads the exact admitted API/Web artifact and reuses verified bytes', t => {
  const f = fixture(t); const destination = path.join(f.root, 'download');
  const receipt = acquire(f.input, destination, { admissionFile: f.admissionFile, execute: f.executor() });
  assert.equal(receipt.decision, 'PASS'); assert.equal(Object.keys(receipt.files).length, 9);
  assert.deepEqual(acquire(f.input, destination, { admissionFile: f.admissionFile, execute: () => assert.fail('no second transfer') }), receipt);
  assert.equal(f.downloads(), 1);
});

test('tampered bundle and extra PostgreSQL image claims are rejected', t => {
  const f = fixture(t); const destination = path.join(f.root, 'download'); acquire(f.input, destination, { admissionFile: f.admissionFile, execute: f.executor() });
  fs.writeFileSync(path.join(destination, 'bundle', 'app-images.tar.gz'), 'changed');
  assert.throws(() => verifyDownloadedBundle(f.input, path.join(destination, 'bundle'), f.admissionFile), /checksum mismatch/);
  fs.writeFileSync(path.join(destination, 'bundle', 'app-images.tar.gz'), f.files['app-images.tar.gz']);
  const alteredAdmission = canonical({ ...f.admission, appImages: { api: image('3'), web: image('4'), postgres: image('7') } });
  fs.writeFileSync(f.admissionFile, alteredAdmission);
  assert.throws(() => verifyDownloadedBundle({ ...f.input, admissionSha256: fileHash(alteredAdmission) }, path.join(destination, 'bundle'), f.admissionFile), /keys are not exact/);
});

test('stale and non-main runs, wrong attempts, and wrong artifact identity are rejected', t => {
  const f = fixture(t); validateRemote(f.input, f.run, f.artifact);
  for (const changed of [{ event: 'workflow_dispatch' }, { head_branch: 'release' }, { head_sha: 'c'.repeat(40) }, { run_attempt: 2 }, { conclusion: 'failure' }]) assert.throws(() => validateRemote(f.input, { ...f.run, ...changed }, f.artifact));
  for (const changed of [{ expired: true }, { name: 'leetplus-compose-app-other-123-1' }, { workflow_run: { ...f.artifact.workflow_run, head_sha: 'd'.repeat(40) } }, { digest: `sha256:${hash('7')}` }]) assert.throws(() => validateRemote(f.input, f.run, { ...f.artifact, ...changed }, hash('6')));
});

test('a lost transfer response is reconciled from existing bytes without another download', t => {
  const f = fixture(t); const destination = path.join(f.root, 'download');
  assert.throws(() => acquire(f.input, destination, { admissionFile: f.admissionFile, execute: f.executor({ loseResponse: true }) }), /download failed/);
  assert.equal(acquire(f.input, destination, { admissionFile: f.admissionFile, execute: () => assert.fail('no retry') }).decision, 'PASS');
  assert.equal(f.downloads(), 1);
});

test('Unix download state requires private owner and unwritable files', () => {
  assert.doesNotThrow(() => assertOwnerMode({ uid: 1000, mode: 0o100600 }, { platform: 'linux', uid: 1000 }));
  assert.throws(() => assertOwnerMode({ uid: 1001, mode: 0o100600 }, { platform: 'linux', uid: 1000 }), /owner\/mode/);
  assert.throws(() => assertOwnerMode({ uid: 1000, mode: 0o100666 }, { platform: 'linux', uid: 1000 }), /owner\/mode/);
  assert.doesNotThrow(() => assertOwnerMode({ uid: 1000, mode: 0o40700 }, { platform: 'linux', uid: 1000, directory: true }));
  assert.throws(() => assertOwnerMode({ uid: 1000, mode: 0o40770 }, { platform: 'linux', uid: 1000, directory: true }), /owner\/mode/);
});
