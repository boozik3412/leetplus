import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { canonical, digest } from './contract.mjs';
import { collectInstalledCertificationCandidateForTest } from './app-only-installed-certifier.mjs';
import { inspectActiveApiSource, MIGRATION_OBSERVATION_CONTRACT } from './app-only-live-certification.mjs';
import { SCHEMA } from './contract.mjs';

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const image = character => `sha256:${character.repeat(64)}`;
const releaseSha = 'c'.repeat(40); const dataSha = 'd'.repeat(40); const baseSha = 'b'.repeat(40);
const leaves = ['app-only-artifact.mjs', 'app-only-baseline.mjs', 'app-only-live-certification.mjs', 'app-only-installed-certifier.mjs', 'contract.mjs', 'control.mjs', 'orchestrator.mjs'];
function migrations() { return Array.from({ length: SCHEMA.migrationCount }, (_, index) => ({ migration_name: index === SCHEMA.migrationCount - 1 ? SCHEMA.migration : `20260101${String(index).padStart(6, '0')}_fixture`, migrationSqlBytes: Buffer.from(`-- ${index}`) })); }
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'certifier-')); const state = path.join(root, 'state'); const srv = path.join(root, 'srv'); const control = path.join(root, 'control');
  for (const directory of [state, srv, control, path.join(srv, 'inbox', dataSha), path.join(state, 'app-downloads', releaseSha, 'bundle')]) fs.mkdirSync(directory, { recursive: true, mode: 0o700 }); fs.writeFileSync(path.join(root, 'machine-id'), 'a'.repeat(32) + '\n', { mode: 0o400 });
  const source = { imageId: image('1'), prismaSchemaBytes: Buffer.from('generator client {}'), migrations: migrations() }; const inspected = inspectActiveApiSource(source);
  const dataRelease = { contract: 'LEETPLUS_COMPOSE_BLUE_GREEN_V1', releaseSha: dataSha, builtAt: '2026-09-20T00:00:00Z', migrationCount: SCHEMA.migrationCount, migration: SCHEMA.migration, images: { api: source.imageId, web: image('2'), postgres: image('3'), redis: image('4') } };
  const previous = { operationId: '11111111-1111-4111-8111-111111111111', generation: 1, activeSlot: 'blue', blue: { ...dataRelease, releaseSha: baseSha }, green: { ...dataRelease, releaseSha: baseSha }, dataRelease, dataAdmissionSha256: '', planSha256: '7'.repeat(64) };
  const dataAdmission = { contract: 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_ADMISSION', decision: 'PASS', repository: 'boozik3412/leetplus', ref: 'refs/heads/main', event: 'push', releaseSha: dataSha, images: dataRelease.images };
  const dataBytes = Buffer.from(canonical(dataAdmission)); previous.dataAdmissionSha256 = digest(dataBytes);
  fs.writeFileSync(path.join(state, 'active.json'), canonical(previous), { mode: 0o400 }); fs.writeFileSync(path.join(srv, 'inbox', dataSha, 'docker-admission.json'), dataBytes, { mode: 0o400 });
  const leafMap = Object.fromEntries(leaves.map(name => [name, hash(name)])); for (const [name, value] of Object.entries(leafMap)) fs.writeFileSync(path.join(control, name), name, { mode: 0o400 }); for (const name of leaves) leafMap[name] = hash(name);
  const manifest = { contract: 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_INSTALL', releaseSha: baseSha, admissionSha256: '8'.repeat(64), files: leafMap }; fs.writeFileSync(path.join(control, 'install-manifest.json'), canonical(manifest), { mode: 0o400 });
  const bundle = { schemaVersion: 2, contract: 'LEETPLUS_COMPOSE_APP_BUNDLE_V2', releaseLane: 'L1_APP_ONLY', releaseSha, builtAt: '2026-09-24T01:00:00.000Z', apiResourceProfile: 'API_6G_V1', sourceImpact: { baseSha, headSha: releaseSha, classifierId: 'LEETPLUS_RELEASE_IMPACT_V1', rulesSha256: 'a'.repeat(64), impactReceiptSha256: 'b'.repeat(64) }, appImages: { api: image('5'), web: image('6') }, schemaRequirement: { migrationCount: SCHEMA.migrationCount, migration: SCHEMA.migration, prismaSchemaSha256: inspected.prismaSchemaSha256, migrationsInventorySha256: inspected.migrationsInventorySha256 }, compatibilityRequirements: { policySha256: 'c'.repeat(64), composeRuntimeContractSha256: 'd'.repeat(64), controllerCapability: 'APP_ONLY_V2_BASELINE_CERTIFICATION', dataContract: 'LEETPLUS_COMPOSE_BLUE_GREEN_V1' }, runtimeEvidence: { transportValidationSha256: 'e'.repeat(64), apiRuntimeValidationSha256: 'f'.repeat(64), archiveRoundtripSha256: 'a'.repeat(64), networkValidationSha256: 'b'.repeat(64), runtimeValidationSha256: '' } };
  const archive = Buffer.from('archive'); const runtime = { decision: 'PASS', releaseSha, dualSlotConstructionVerified: true, apiBlueCreated: true, apiGreenCreated: true, webBlueReady: true, webGreenReady: true, noDataImages: true, controlArchiveSha256: digest(archive), appImages: bundle.appImages }; const runtimeBytes = Buffer.from(canonical(runtime)); bundle.runtimeEvidence.runtimeValidationSha256 = digest(runtimeBytes); fs.writeFileSync(path.join(state, 'app-downloads', releaseSha, 'bundle', 'control.tar.gz'), archive, { mode: 0o400 }); fs.writeFileSync(path.join(state, 'app-downloads', releaseSha, 'bundle', 'runtime-validation.json'), runtimeBytes, { mode: 0o400 });
  const admission = { schemaVersion: 2, contract: 'LEETPLUS_COMPOSE_APP_ADMISSION_V2', decision: 'PASS', releaseLane: 'L1_APP_ONLY', releaseSha, repository: 'boozik3412/leetplus', ref: 'refs/heads/main', event: 'push', runId: '1', runAttempt: '1', workflowRef: `boozik3412/leetplus/.github/workflows/ci.yml@refs/heads/main`, workflowSha: releaseSha, parentCandidateReceiptSha256: 'a'.repeat(64), parentImpactReceiptSha256: 'b'.repeat(64), requiredGateReceiptSha256: 'c'.repeat(64), gateReceiptSha256: { authorityRootTrust: '1'.repeat(64), application: '2'.repeat(64), postgresqlAssortment: '3'.repeat(64), migrationSmoke: '4'.repeat(64), appImageRuntime: '5'.repeat(64) }, appArtifact: { name: `leetplus-compose-app-${releaseSha}-1-1`, id: '1', transportDigest: '6'.repeat(64) }, bundleManifestSha256: digest(bundle), appArchiveSha256: '7'.repeat(64), transportValidationSha256: bundle.runtimeEvidence.transportValidationSha256, apiRuntimeValidationSha256: bundle.runtimeEvidence.apiRuntimeValidationSha256, archiveRoundtripSha256: bundle.runtimeEvidence.archiveRoundtripSha256, networkValidationSha256: bundle.runtimeEvidence.networkValidationSha256, runtimeValidationSha256: bundle.runtimeEvidence.runtimeValidationSha256, appImages: bundle.appImages, schemaRequirementSha256: digest(bundle.schemaRequirement), compatibilityRequirementsSha256: digest(bundle.compatibilityRequirements) };
  fs.writeFileSync(path.join(state, 'app-downloads', releaseSha, 'bundle', 'app-bundle.json'), canonical(bundle), { mode: 0o400 });
  fs.writeFileSync(path.join(state, 'app-downloads', releaseSha, 'app-admission.json'), canonical(admission), { mode: 0o400 });
  fs.writeFileSync(path.join(state, 'app-downloads', releaseSha, 'download-receipt.json'), canonical({
    contract: 'LEETPLUS_COMPOSE_APP_DOWNLOAD_V2', decision: 'PASS', releaseSha,
    appAdmissionSha256: digest(canonical(admission)), files: { 'app-bundle.json': { sha256: digest(canonical(bundle)) } },
  }), { mode: 0o400 });
  const rows = inspected.inventory.map(row => ({ ...row, finished_at: '2026-09-24T00:00:00.000Z', rolled_back_at: null, applied_steps_count: 1 }));
  const execute = (binary, args) => { if (binary.endsWith('python3')) return { status: 0, stdout: JSON.stringify(leafMap) }; const last = args.at(-1); if (args.includes('inspect')) return { status: 0, stdout: args.includes('{{json .State}}') ? '{"Running":true,"Status":"running","Restarting":false,"Dead":false,"Pid":123,"Health":{"Status":"healthy"}}' : last.includes('postgres') ? image('3') : last.includes('redis') ? image('4') : image('1') }; if (args.includes('run')) return { status: 0, stdout: JSON.stringify({ prismaSchemaBase64: source.prismaSchemaBytes.toString('base64'), migrations: source.migrations.map(row => ({ migration_name: row.migration_name, migrationSqlBase64: row.migrationSqlBytes.toString('base64') })) }) }; if (String(last).includes('pg_control_system')) return { status: 0, stdout: '7541234567890123456' }; if (String(last).includes('_prisma_migrations')) return { status: 0, stdout: JSON.stringify({ contract: MIGRATION_OBSERVATION_CONTRACT, rows }) }; if (String(last).includes('server_version_num')) return { status: 0, stdout: '{"database":"leetplus","inRecovery":false,"serverVersionNum":"160000"}' }; return { status: 0, stdout: '{"inRecovery":false,"runtime":{"rolsuper":false,"rolcreatedb":false,"rolcreaterole":false,"rolinherit":false,"rolreplication":false,"rolbypassrls":false,"publicCreate":false}}' }; };
  const unsafePaths = new Set();
  const secureFs = new Proxy(fs, { get(target, key) { const value = target[key]; if (key === 'lstatSync' || key === 'fstatSync') return (...args) => { const stat = value(...args); Object.defineProperty(stat, 'uid', { value: 0 }); Object.defineProperty(stat, 'mode', { value: stat.isDirectory() ? 0o40700 : (key === 'fstatSync' && unsafePaths.size > 0 ? 0o100644 : 0o100400) }); return stat; }; return typeof value === 'function' ? value.bind(target) : value; } });
  return { root, unsafePaths, value: { bundle, admission, previous, now: Date.parse('2026-09-24T02:00:00.000Z'), ttlMs: 60_000 }, options: { paths: { state, root: srv, control, machineId: path.join(root, 'machine-id') }, execute, fsApi: secureFs } };
}
test('collects only fixed installed inputs and returns a candidate without publication', () => { const f = fixture(); try { const cert = collectInstalledCertificationCandidateForTest(f.value, f.options); assert.equal(cert.decision, 'CERTIFIED'); assert.equal(fs.existsSync(path.join(f.root, 'certification.json')), false); } finally { fs.rmSync(f.root, { recursive: true, force: true }); } });
test('rejects unsafe installed paths and an altered candidate controller leaf', () => { const f = fixture(); try { f.unsafePaths.add(path.join(f.options.paths.state, 'active.json')); assert.throws(() => collectInstalledCertificationCandidateForTest(f.value, f.options), /Untrusted installed file identity/); f.unsafePaths.clear(); const original = f.options.execute; f.options.execute = (binary, args) => binary.endsWith('python3') ? { status: 0, stdout: JSON.stringify({ ...JSON.parse(original(binary, args).stdout), 'control.mjs': 'e'.repeat(64) }) } : original(binary, args); assert.throws(() => collectInstalledCertificationCandidateForTest(f.value, f.options), /Candidate control archive differs/); } finally { fs.rmSync(f.root, { recursive: true, force: true }); } });
test('rejects recovery DB, elevated ACL and unhealthy active API before certification', () => {
  const cases = [
    { match: /CURRENT191 primary/, mutate: (binary, args) => String(args.at(-1)).includes('server_version_num'), stdout: '{"database":"leetplus","inRecovery":true,"serverVersionNum":"160013"}' },
    { match: /role\/ACL is elevated/, mutate: (binary, args) => String(args.at(-1)).includes('rolsuper'), stdout: '{"inRecovery":false,"runtime":{"rolsuper":true,"rolcreatedb":false,"rolcreaterole":false,"rolinherit":false,"rolreplication":false,"rolbypassrls":false,"publicCreate":false}}' },
    { match: /not healthy and running/, mutate: (binary, args) => args.includes('{{json .State}}'), stdout: '{"Running":false,"Status":"exited","Restarting":false,"Dead":false,"Pid":0,"Health":{"Status":"unhealthy"}}' },
  ];
  for (const scenario of cases) {
    const f = fixture();
    try {
      const original = f.options.execute;
      f.options.execute = (binary, args) => scenario.mutate(binary, args) ? { status: 0, stdout: scenario.stdout } : original(binary, args);
      assert.throws(() => collectInstalledCertificationCandidateForTest(f.value, f.options), scenario.match);
    } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
  }
});
