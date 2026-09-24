import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

import {
  APP_ADMISSION_CONTRACT,
  APP_BUNDLE_CONTRACT,
  CONTROLLER_CAPABILITY,
  DATA_CONTRACT,
  RELEASE_LANE,
  REQUIRED_GATES,
  REQUIRED_GATES_CONTRACT,
  canonical,
  digest,
  validateAppAdmission,
  validateAppBundle,
  validateAppOnlyReceipt,
  validateRequiredGateReceipt,
} from './app-only-artifact.mjs';
import { validateArtifactPayload } from './admit-app-images.mjs';

const sha = 'a'.repeat(40);
const hash = character => character.repeat(64);
const image = character => `sha256:${hash(character)}`;

function bundle() {
  return {
    schemaVersion: 2,
    contract: APP_BUNDLE_CONTRACT,
    releaseLane: RELEASE_LANE,
    releaseSha: sha,
    builtAt: '2026-09-24T00:00:00Z',
    apiResourceProfile: 'API_6G_V1',
    sourceImpact: {
      baseSha: 'b'.repeat(40),
      headSha: sha,
      classifierId: 'LEETPLUS_RELEASE_IMPACT_V1',
      rulesSha256: hash('1'),
      impactReceiptSha256: hash('2'),
    },
    appImages: { api: image('3'), web: image('4') },
    schemaRequirement: {
      migrationCount: 191,
      migration: '20260908180000_external_langame_simple_onboarding',
      prismaSchemaSha256: hash('5'),
      migrationsInventorySha256: hash('6'),
    },
    compatibilityRequirements: {
      policySha256: hash('7'),
      composeRuntimeContractSha256: hash('8'),
      controllerCapability: CONTROLLER_CAPABILITY,
      dataContract: DATA_CONTRACT,
    },
    runtimeEvidence: {
      transportValidationSha256: hash('9'),
      archiveRoundtripSha256: hash('a'),
      networkValidationSha256: hash('b'),
      runtimeValidationSha256: hash('c'),
    },
  };
}

function gates() {
  return {
    contract: REQUIRED_GATES_CONTRACT,
    decision: 'PASS',
    releaseLane: RELEASE_LANE,
    releaseSha: sha,
    repository: 'boozik3412/leetplus',
    ref: 'refs/heads/main',
    event: 'push',
    runId: '12',
    runAttempt: '1',
    workflowRef: 'boozik3412/leetplus/.github/workflows/ci.yml@refs/heads/main',
    workflowSha: sha,
    candidateReceiptSha256: hash('d'),
    appOnlyReceiptSha256: hash('e'),
    requiredGates: [...REQUIRED_GATES],
    gateReceipts: Object.fromEntries(REQUIRED_GATES.map((name, index) => [name, { result: 'SUCCESS', sha256: String(index + 1).repeat(64) }])),
  };
}

test('AppBundle V2 accepts only exact API/Web and current schema requirements', () => {
  assert.equal(validateAppBundle(bundle()).contract, APP_BUNDLE_CONTRACT);
  const withPostgres = structuredClone(bundle());
  withPostgres.appImages.postgres = image('f');
  assert.throws(() => validateAppBundle(withPostgres), /app images keys are not exact/);
  const wrongSchema = structuredClone(bundle());
  wrongSchema.schemaRequirement.migrationCount = 192;
  assert.throws(() => validateAppBundle(wrongSchema), /not CURRENT191/);
  const missingEvidence = structuredClone(bundle());
  delete missingEvidence.runtimeEvidence.networkValidationSha256;
  assert.throws(() => validateAppBundle(missingEvidence), /runtime evidence keys are not exact/);
});

test('app-only and gate receipts fail closed on mixed or missing authority', () => {
  const receipt = {
    contract: 'LEETPLUS_APP_ONLY_IMPACT_V2', decision: 'PASS', releaseLane: RELEASE_LANE,
    releaseSha: sha, diffBaseSha: 'b'.repeat(40), impactReceiptSha256: hash('1'),
    candidateReceiptSha256: hash('2'), allowlistSha256: hash('3'), changedPaths: ['apps/web/src/components/executive-trend-chart.tsx'],
  };
  assert.equal(validateAppOnlyReceipt(receipt).releaseSha, sha);
  assert.throws(() => validateAppOnlyReceipt({ ...receipt, changedPaths: [] }), /nonempty/);
  assert.equal(validateRequiredGateReceipt(gates()).decision, 'PASS');
  const failed = structuredClone(gates());
  failed.gateReceipts.MIGRATION_SMOKE.result = 'FAILURE';
  assert.throws(() => validateRequiredGateReceipt(failed), /MIGRATION_SMOKE/);
  const missing = structuredClone(gates());
  missing.requiredGates = missing.requiredGates.slice(0, -1);
  assert.throws(() => validateRequiredGateReceipt(missing), /gate set or order/);
});

test('AppAdmission V2 rejects wrong lane, PostgreSQL image and gate hash drift', () => {
  const admission = {
    schemaVersion: 2, contract: APP_ADMISSION_CONTRACT, decision: 'PASS', releaseLane: RELEASE_LANE,
    releaseSha: sha, repository: 'boozik3412/leetplus', ref: 'refs/heads/main', event: 'push',
    runId: '12', runAttempt: '1', workflowRef: 'boozik3412/leetplus/.github/workflows/ci.yml@refs/heads/main', workflowSha: sha,
    parentCandidateReceiptSha256: hash('1'), parentImpactReceiptSha256: hash('2'), requiredGateReceiptSha256: hash('3'),
    gateReceiptSha256: { authorityRootTrust: hash('4'), application: hash('5'), postgresqlAssortment: hash('6'), migrationSmoke: hash('7'), appImageRuntime: hash('8') },
    appArtifact: { name: `leetplus-compose-app-${sha}-12-1`, id: '123', transportDigest: hash('9') },
    bundleManifestSha256: hash('a'), appArchiveSha256: hash('b'), transportValidationSha256: hash('c'),
    archiveRoundtripSha256: hash('d'), networkValidationSha256: hash('e'), runtimeValidationSha256: hash('f'),
    appImages: { api: image('1'), web: image('2') }, schemaRequirementSha256: hash('3'), compatibilityRequirementsSha256: hash('4'),
  };
  assert.equal(validateAppAdmission(admission).contract, APP_ADMISSION_CONTRACT);
  assert.throws(() => validateAppAdmission({ ...admission, releaseLane: 'L2_SCHEMA_SECURITY' }), /release identity/);
  const withPostgres = structuredClone(admission);
  withPostgres.appImages.postgres = image('5');
  assert.throws(() => validateAppAdmission(withPostgres), /admitted app images keys are not exact/);
  const missingGate = structuredClone(admission);
  delete missingGate.gateReceiptSha256.migrationSmoke;
  assert.throws(() => validateAppAdmission(missingGate), /gate hashes keys are not exact/);
});

function writeArtifactFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'leetplus-app-artifact-'));
  const b = bundle();
  const control = Buffer.from('exact-git-control-fixture');
  const values = {
    'transport-validation.json': { decision: 'PASS', driver: 'Prisma6', tlsRequired: true, badCaRejected: true, badHostnameRejected: true, nativeWorkerProfileAccepted: true },
    'archive-roundtrip.json': { decision: 'PASS', engine: '29.1.3', store: 'containerd', isolatedDaemon: true,
      images: b.appImages, loadedImageIds: Object.values(b.appImages).sort() },
    'network-validation.json': { decision: 'PASS', stoppedCreation: true, loopbackHttp: true, webToApi: true, apiToData: true, webDataDenied: true, hostProxyDenied: true, externalDenied: true },
  };
  const archiveRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'leetplus-app-archive-'));
  try {
    const manifest = Object.entries(b.appImages).map(([role, id]) => ({
      Config: `${id.slice(7)}.json`, RepoTags: [`leetplus-${role}:${sha}`], Layers: ['layer.tar'],
    }));
    fs.writeFileSync(path.join(archiveRoot, 'manifest.json'), JSON.stringify(manifest));
    for (const id of Object.values(b.appImages)) fs.writeFileSync(path.join(archiveRoot, `${id.slice(7)}.json`), '{}');
    fs.writeFileSync(path.join(archiveRoot, 'layer.tar'), 'fixture');
    const archive = spawnSync('tar', ['-czf', path.join(root, 'app-images.tar.gz'), '-C', archiveRoot,
      'manifest.json', `${b.appImages.api.slice(7)}.json`, `${b.appImages.web.slice(7)}.json`, 'layer.tar']);
    assert.equal(archive.status, 0, archive.stderr?.toString());
  } finally { fs.rmSync(archiveRoot, { recursive: true, force: true }); }
  fs.writeFileSync(path.join(root, 'control.tar.gz'), control);
  for (const [name, value] of Object.entries(values)) fs.writeFileSync(path.join(root, name), canonical(value));
  const runtime = {
    decision: 'PASS', releaseSha: sha, dualSlotConstructionVerified: true, apiBlueCreated: true, apiGreenCreated: true,
    webBlueReady: true, webGreenReady: true, noDataImages: true,
    controlArchiveSha256: digest(control), appImages: b.appImages,
  };
  fs.writeFileSync(path.join(root, 'runtime-validation.json'), canonical(runtime));
  b.runtimeEvidence = {
    transportValidationSha256: digest(canonical(values['transport-validation.json'])),
    archiveRoundtripSha256: digest(canonical(values['archive-roundtrip.json'])),
    networkValidationSha256: digest(canonical(values['network-validation.json'])),
    runtimeValidationSha256: digest(canonical(runtime)),
  };
  fs.writeFileSync(path.join(root, 'app-bundle.json'), canonical(b));
  const files = ['app-bundle.json', 'app-images.tar.gz', 'control.tar.gz', 'transport-validation.json', 'archive-roundtrip.json', 'network-validation.json', 'runtime-validation.json'];
  fs.writeFileSync(path.join(root, 'SHA256SUMS'), files.map(name => `${digest(fs.readFileSync(path.join(root, name)))}  ${name}`).join('\n') + '\n');
  return root;
}

test('artifact payload rejects tampering and data-image claims', () => {
  const root = writeArtifactFixture();
  try {
    assert.equal(validateArtifactPayload(root).bundle.releaseSha, sha);
    fs.appendFileSync(path.join(root, 'app-images.tar.gz'), 'tamper');
    assert.throws(() => validateArtifactPayload(root), /checksum mismatch/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  const root2 = writeArtifactFixture();
  try {
    const file = path.join(root2, 'archive-roundtrip.json');
    const report = JSON.parse(fs.readFileSync(file, 'utf8'));
    report.images.postgres = image('f');
    fs.writeFileSync(file, canonical(report));
    const checksum = path.join(root2, 'SHA256SUMS');
    const lines = fs.readFileSync(checksum, 'utf8').split('\n').map(line => line.endsWith('  archive-roundtrip.json') ? `${digest(fs.readFileSync(file))}  archive-roundtrip.json` : line);
    fs.writeFileSync(checksum, lines.join('\n'));
    assert.throws(() => validateArtifactPayload(root2), /roundtrip images keys are not exact/);
  } finally {
    fs.rmSync(root2, { recursive: true, force: true });
  }

  const root3 = writeArtifactFixture();
  const unpacked = fs.mkdtempSync(path.join(os.tmpdir(), 'leetplus-extra-image-'));
  try {
    const archive = path.join(root3, 'app-images.tar.gz');
    assert.equal(spawnSync('tar', ['-xzf', archive, '-C', unpacked]).status, 0);
    const manifestPath = path.join(unpacked, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.push({ Config: `${hash('f')}.json`, RepoTags: [`leetplus-postgres:${sha}`], Layers: ['layer.tar'] });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    fs.writeFileSync(path.join(unpacked, `${hash('f')}.json`), '{}');
    assert.equal(spawnSync('tar', ['-czf', archive, '-C', unpacked, 'manifest.json',
      `${hash('3')}.json`, `${hash('4')}.json`, `${hash('f')}.json`, 'layer.tar']).status, 0);
    const sums = path.join(root3, 'SHA256SUMS');
    fs.writeFileSync(sums, fs.readFileSync(sums, 'utf8').split('\n').map(line =>
      line.endsWith('  app-images.tar.gz') ? `${digest(fs.readFileSync(archive))}  app-images.tar.gz` : line).join('\n'));
    assert.throws(() => validateArtifactPayload(root3), /extra or missing image/);
  } finally {
    fs.rmSync(root3, { recursive: true, force: true });
    fs.rmSync(unpacked, { recursive: true, force: true });
  }
});
