#!/usr/bin/env node
// Installed, read-only observation bridge for app-only-live-certification.
// Authority publication deliberately remains in control.mjs while its write lock is held.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { canonical, demand, digest } from './contract.mjs';
import { createDataBaselineCertificationCandidate, PRISMA_MIGRATIONS_READ_ONLY_SQL } from './app-only-live-certification.mjs';
import { controlLockPolicy, verifyKernelControlLocks } from './control-locks.mjs';

const STATE = '/var/lib/leetplus-compose';
const ROOT = '/srv/leetplus';
const CONTROL = path.dirname(fileURLToPath(import.meta.url));
const DOCKER = '/usr/bin/docker';
const PYTHON = '/usr/bin/python3';
const CLEAN_ENV = Object.freeze({ PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TZ: 'UTC' });
const SHA = /^[a-f0-9]{40}$/;
const HASH = /^[a-f0-9]{64}$/;
const CONTROL_LEAVES = Object.freeze([
  'app-only-artifact.mjs', 'app-only-baseline.mjs', 'app-only-live-certification.mjs',
  'app-only-installed-certifier.mjs',
  'contract.mjs', 'control.mjs', 'orchestrator.mjs',
]);
const ARCHIVE_LEAVES_SCRIPT = String.raw`import hashlib,io,json,re,sys,tarfile
archive=sys.stdin.buffer.read(16*1024*1024+1)
if len(archive)>16*1024*1024: raise ValueError('control archive is too large')
leaves={}
with tarfile.open(fileobj=io.BytesIO(archive),mode='r:gz') as tar:
 for item in tar:
  if item.isdir() and item.name.rstrip('/') in ('deploy','deploy/leetplus-compose'):
   continue
  prefix='deploy/leetplus-compose/'
  if not item.isfile() or not item.name.startswith(prefix):
   raise ValueError('unsafe control archive member')
  leaf=item.name[len(prefix):]
  if not re.fullmatch(r'[A-Za-z0-9_.@-]+',leaf) or leaf in ('.','..','install-manifest.json') or leaf in leaves or item.size>2*1024*1024:
   raise ValueError('invalid control archive leaf')
  stream=tar.extractfile(item)
  content=stream.read(2*1024*1024+1)
  if len(content)!=item.size:
   raise ValueError('control leaf size drift')
  leaves[leaf]=hashlib.sha256(content).hexdigest()
print(json.dumps(leaves,sort_keys=True,separators=(',',':')))`;
const SOURCE_SCRIPT = String.raw`const fs=require('fs'),p='/app/packages/database/prisma';const b=x=>fs.readFileSync(x).toString('base64');const m=fs.readdirSync(p+'/migrations',{withFileTypes:true}).filter(x=>x.isDirectory()&&/^\d{14}_[a-z0-9_]+$/.test(x.name)).map(x=>x.name).sort().map(name=>({migration_name:name,migrationSqlBase64:b(p+'/migrations/'+name+'/migration.sql')}));process.stdout.write(JSON.stringify({prismaSchemaBase64:b(p+'/schema.prisma'),migrations:m}));`;

function safeFile(fsApi, file, { limit = 16 * 1024 * 1024, immutable = false } = {}) {
  demand(path.isAbsolute(file) && (path.normalize(file) === file || process.platform === 'win32'), 'Noncanonical installed file path');
  for (let ancestor = path.dirname(file); ; ancestor = path.dirname(ancestor)) {
    const stat = fsApi.lstatSync(ancestor);
    demand(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === 0 && !(stat.mode & 0o022), 'Untrusted installed file ancestor');
    if (ancestor === path.parse(file).root) break;
  }
  const fd = fsApi.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fsApi.fstatSync(fd);
    demand(stat.isFile() && stat.uid === 0 && stat.nlink === 1 && !(stat.mode & 0o022) && stat.size > 0 && stat.size <= limit &&
      (!immutable || (stat.mode & 0o777) === 0o400), 'Untrusted installed file identity');
    return fsApi.readFileSync(fd);
  } finally { fsApi.closeSync(fd); }
}

function fixedRun(execute, binary, args, { input, timeout = 120_000, trim = true } = {}) {
  demand(binary === DOCKER || binary === PYTHON, 'Unexpected certifier executable');
  const result = execute(binary, args, { encoding: 'utf8', env: CLEAN_ENV, timeout, maxBuffer: 16 * 1024 * 1024, input, windowsHide: true });
  demand(result && result.status === 0 && !result.error && !result.signal, `Fixed certifier probe failed: ${path.basename(binary)}`);
  demand(typeof result.stdout === 'string' && result.stdout.length <= 16 * 1024 * 1024, 'Fixed certifier probe output is invalid');
  return trim ? result.stdout.trim() : result.stdout;
}

function docker(execute, args, options) {
  return fixedRun(execute, DOCKER, ['--host', 'unix:///var/run/docker.sock', '--config', '/etc/leetplus-compose/docker-cli', ...args], options);
}

function installedManifest(fsApi, control) {
  const raw = safeFile(fsApi, `${control}/install-manifest.json`, { immutable: true, limit: 1024 * 1024 });
  const manifest = JSON.parse(raw.toString('utf8'));
  demand(raw.toString('utf8') === canonical(manifest) && manifest?.files && typeof manifest.files === 'object', 'Installed controller manifest is not canonical');
  const leaves = {};
  for (const leaf of CONTROL_LEAVES) demand(HASH.test(manifest.files[leaf] ?? ''), 'Installed controller lacks certifier leaf');
  for (const leaf of Object.keys(manifest.files)) {
    demand(/^[A-Za-z0-9_.@-]+$/.test(leaf) && !['.', '..', 'install-manifest.json'].includes(leaf) &&
      HASH.test(manifest.files[leaf]), 'Installed controller manifest leaf is invalid');
    leaves[leaf] = digest(safeFile(fsApi, `${control}/${leaf}`, { immutable: !/\.(?:sh|py)$/.test(leaf), limit: 2 * 1024 * 1024 }));
    demand(leaves[leaf] === manifest.files[leaf], 'Installed controller leaf digest drift');
  }
  return { raw, leaves };
}

function candidateControlLeaves(fsApi, execute, archive) {
  const archiveBytes = safeFile(fsApi, archive, { limit: 16 * 1024 * 1024 });
  const leaves = JSON.parse(fixedRun(execute, PYTHON, ['-I', '-S', '-E', '-c', ARCHIVE_LEAVES_SCRIPT],
    { timeout: 60_000, input: archiveBytes }));
  demand(safeFile(fsApi, archive, { limit: 16 * 1024 * 1024 }).equals(archiveBytes),
    'Control archive changed while deriving its installed-compatible leaves');
  demand(leaves && typeof leaves === 'object' && !Array.isArray(leaves) &&
    Object.keys(leaves).length >= CONTROL_LEAVES.length && Object.values(leaves).every(value => HASH.test(value)),
  'Candidate control archive leaf map is invalid');
  return { archiveSha256: digest(archiveBytes), leaves };
}

function activeApiSource(execute, imageId) {
  const raw = docker(execute, ['run', '--rm', '--read-only', '--network', 'none', '--entrypoint', 'node', imageId, '-e', SOURCE_SCRIPT], { timeout: 120_000 });
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error('Fixed active API source probe is not JSON'); }
  demand(parsed && typeof parsed.prismaSchemaBase64 === 'string' && Array.isArray(parsed.migrations), 'Fixed active API source probe shape is invalid');
  return {
    imageId,
    prismaSchemaBytes: Buffer.from(parsed.prismaSchemaBase64, 'base64'),
    migrations: parsed.migrations.map(row => {
      demand(row && typeof row.migration_name === 'string' && typeof row.migrationSqlBase64 === 'string', 'Fixed active API migration probe shape is invalid');
      return { migration_name: row.migration_name, migrationSqlBytes: Buffer.from(row.migrationSqlBase64, 'base64') };
    }),
  };
}

function jsonObjectProbe(raw, label) {
  try { const value = JSON.parse(raw); demand(value && typeof value === 'object' && !Array.isArray(value), `${label} is not an object`); return value; }
  catch (error) { if (error.message === `${label} is not an object`) throw error; throw new Error(`${label} is not JSON`); }
}
function assertDataConfiguration(value) {
  demand(Object.keys(value).sort().join(',') === 'database,inRecovery,serverVersionNum' &&
    value.database === 'leetplus' && value.inRecovery === false && /^16\d{4}$/.test(value.serverVersionNum ?? ''),
  'Observed database is not the CURRENT191 primary profile');
  return digest(canonical(value));
}
function assertRuntimeAcl(value) {
  const runtime = value?.runtime;
  demand(Object.keys(value).sort().join(',') === 'inRecovery,runtime' && value.inRecovery === false &&
    runtime && Object.keys(runtime).sort().join(',') ===
      'publicCreate,rolbypassrls,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolsuper' &&
    Object.values(runtime).every(flag => flag === false),
  'Runtime PostgreSQL role/ACL is elevated or incomplete');
  return digest(canonical(value));
}
function assertActiveApiHealth(value) {
  demand(value.Running === true && value.Status === 'running' && value.Restarting === false &&
    value.Dead === false && Number.isSafeInteger(value.Pid) && value.Pid > 0 &&
    value.Health?.Status === 'healthy', 'Active API is not healthy and running');
  return digest(canonical(value));
}

function assertProductionLock(fsApi, control) {
  demand(process.platform === 'linux' && typeof process.getuid === 'function' && process.getuid() === 0, 'Installed certifier requires root on Linux');
  demand(process.env.LEETPLUS_COMPOSE_LOCKED === '1', 'Installed certifier requires the controller lock bootstrap');
  demand(fsApi.realpathSync('/usr/local/sbin/leetplus-compose') === `${control}/control.sh`, 'Installed certifier requires the serving controller');
  const globalLock = fsApi.lstatSync(`${STATE}/control.lock`);
  const parentStatus = fsApi.readFileSync(`/proc/${process.ppid}/status`, 'utf8');
  const outerPid = parentStatus.match(/^PPid:\s+(\d+)$/m)?.[1];
  verifyKernelControlLocks(controlLockPolicy('certify-app-only'), { globalLock, locks: fsApi.readFileSync('/proc/locks', 'utf8').split('\n'), parentPid: process.ppid, outerPid });
}

// Explicit internal boundary for fixtures. It accepts only predeclared root paths
// and an injected fixed-command executor; production callers cannot set either.
export function collectInstalledCertificationCandidateForTest({ bundle, admission, previous, now, ttlMs }, { fsApi = fs, execute = spawnSync, paths }) {
  demand(paths && Object.keys(paths).sort().join(',') === 'control,machineId,root,state', 'Test certifier paths must be exact');
  const releaseSha = bundle?.releaseSha;
  const dataSha = previous?.dataRelease?.releaseSha;
  demand(SHA.test(releaseSha ?? '') && SHA.test(dataSha ?? ''), 'Certification requires exact app and data releases');
  // active.json is atomically replaced by the V1 controller with mode 0600.
  // The kernel lock and exact byte recheck provide continuity; 0400 would
  // incorrectly reject the real accepted state file.
  const activeStateBytes = safeFile(fsApi, `${paths.state}/active.json`, { limit: 1024 * 1024 });
  const dataAdmissionBytes = safeFile(fsApi, `${paths.root}/inbox/${dataSha}/docker-admission.json`, { immutable: true, limit: 1024 * 1024 });
  const controller = installedManifest(fsApi, paths.control);
  const bundleRoot = `${paths.state}/app-downloads/${releaseSha}/bundle`;
  const admittedBundleBytes = safeFile(fsApi, `${bundleRoot}/app-bundle.json`, { limit: 1024 * 1024 });
  const admittedAdmissionBytes = safeFile(fsApi, `${paths.state}/app-downloads/${releaseSha}/app-admission.json`, { immutable: true, limit: 1024 * 1024 });
  const downloadReceiptBytes = safeFile(fsApi, `${paths.state}/app-downloads/${releaseSha}/download-receipt.json`, { immutable: true, limit: 1024 * 1024 });
  const downloadReceipt = JSON.parse(downloadReceiptBytes.toString('utf8'));
  demand(admittedBundleBytes.toString('utf8') === canonical(bundle) &&
    admittedAdmissionBytes.toString('utf8') === canonical(admission) &&
    admission.bundleManifestSha256 === digest(admittedBundleBytes) &&
    downloadReceiptBytes.toString('utf8') === canonical(downloadReceipt) &&
    downloadReceipt.contract === 'LEETPLUS_COMPOSE_APP_DOWNLOAD_V2' &&
    downloadReceipt.decision === 'PASS' && downloadReceipt.releaseSha === releaseSha &&
    downloadReceipt.appAdmissionSha256 === digest(admittedAdmissionBytes) &&
    downloadReceipt.files?.['app-bundle.json']?.sha256 === admission.bundleManifestSha256,
  'Installed app bundle/admission bytes differ from the certification request');
  const candidate = candidateControlLeaves(fsApi, execute, `${bundleRoot}/control.tar.gz`);
  const runtimeValidationBytes = safeFile(fsApi, `${bundleRoot}/runtime-validation.json`, { limit: 1024 * 1024 });
  const activeSlot = previous.activeSlot;
  demand(activeSlot === 'blue' || activeSlot === 'green', 'Certification requires an active slot');
  const activeApiImageId = docker(execute, ['inspect', '--format', '{{.Image}}', `leetplus-api-${activeSlot}`]);
  const postgresImageId = docker(execute, ['inspect', '--format', '{{.Image}}', 'leetplus-postgres']);
  const redisImageId = docker(execute, ['inspect', '--format', '{{.Image}}', 'leetplus-redis']);
  const psql = args => docker(execute, ['exec', 'leetplus-postgres', '/usr/lib/postgresql/16/bin/psql', '-XAt', '-h', '/tmp', '-U', 'postgres', '-d', 'leetplus', '-c', args]);
  const databaseSystemIdentifier = psql('SELECT system_identifier::text FROM pg_control_system();');
  const migrationProbeOutput = psql(PRISMA_MIGRATIONS_READ_ONLY_SQL);
  const dataConfigurationSha256 = assertDataConfiguration(jsonObjectProbe(psql("SELECT pg_catalog.jsonb_build_object('database',current_database(),'inRecovery',pg_is_in_recovery(),'serverVersionNum',current_setting('server_version_num'))::text;"), 'data configuration probe'));
  const aclSha256 = assertRuntimeAcl(jsonObjectProbe(psql("SELECT pg_catalog.jsonb_build_object('inRecovery',pg_is_in_recovery(),'runtime',pg_catalog.jsonb_build_object('rolsuper',rolsuper,'rolcreatedb',rolcreatedb,'rolcreaterole',rolcreaterole,'rolinherit',rolinherit,'rolreplication',rolreplication,'rolbypassrls',rolbypassrls,'publicCreate',has_schema_privilege('leetplus_runtime','public','CREATE')))::text FROM pg_roles WHERE rolname='leetplus_runtime';"), 'runtime ACL probe'));
  const readinessReceiptSha256 = assertActiveApiHealth(jsonObjectProbe(docker(execute, ['inspect', '--format', '{{json .State}}', `leetplus-api-${activeSlot}`]), 'active API readiness probe'));
  return createDataBaselineCertificationCandidate({ bundle, admission, previous, ttlMs, now, observation: {
    contract: 'LEETPLUS_COMPOSE_DATA_BASELINE_OBSERVATION_V1', capturedAt: new Date(now ?? Date.now()).toISOString(),
    hostIdentityBytes: safeFile(fsApi, paths.machineId, { limit: 256 }), activeStateBytes, dataAdmissionBytes,
    controllerManifestBytes: controller.raw, installedControlLeafDigests: controller.leaves,
    candidateControlLeafDigests: candidate.leaves, candidateControlArchiveSha256: candidate.archiveSha256, runtimeValidationBytes,
    activeApiImageId, postgresImageId, redisImageId, databaseSystemIdentifier, dataConfigurationSha256, aclSha256,
    readinessReceiptSha256, migrationProbeOutput, activeApiSource: activeApiSource(execute, activeApiImageId),
  } });
}

export function collectInstalledCertificationCandidate(input) {
  assertProductionLock(fs, CONTROL);
  return collectInstalledCertificationCandidateForTest(input, { fsApi: fs, execute: spawnSync, paths: { state: STATE, root: ROOT, control: CONTROL, machineId: '/etc/machine-id' } });
}
