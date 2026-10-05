#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CONTRACT, SCHEMA, PORTS, canonical, demand, digest, release, renderCompose, verifyContainer } from './contract.mjs';
import { PHASES, execute, validateApproval, validateChain, validatePlan } from './orchestrator.mjs';
import { validateWorkerGrant } from './worker-authority.mjs';
import { controlLockPolicy, verifyKernelControlLocks, verifyExternalCleanupSingletonLock } from './control-locks.mjs';
import { validateControlHandoffAuthority, validatePendingControlHandoffAuthority } from './control-handoff-authority.mjs';
import { validateAcceptedExactTargetHandoff, validatePendingExactTargetHandoff } from './exact-target-handoff-authority.mjs';
import { validatePendingNetworkBootAuthority } from './control-handoff-runtime.mjs';
import { requireResourceBudget, verifyResourceAcceptance } from './resource-budget.mjs';
import { reconcileBoundEvidence } from './bind-reconcile.mjs';
import { PLAN_CONTRACT as APP_ONLY_PLAN, synthesizeRelease, validateAppOnlyPlan } from './app-only-baseline.mjs';
import { validateAppAdmission, validateAppBundle } from './app-only-artifact.mjs';
import { collectInstalledCertificationCandidate } from './app-only-installed-certifier.mjs';
import { createReadOnlyPhaseReconciler } from './control-reconcile.mjs';
import { CONTRACT as WORKER_CONTINUATION_V2, WORKERS, TIMER_UNITS,
  validateCurrentWorkerContinuation, validateForwardWorkerContinuation } from './worker-continuation.mjs';
import { beginWorkerContinuation as beginLegacyWorkers, bindForwardWorkerContinuation as bindLegacyWorkers,
  completeWorkerContinuation as completeLegacyWorkers, abortUncommittedWorkerContinuation as abortLegacyWorkers,
  rollbackWorkerContinuation as rollbackLegacyWorkers, preflightWorkerContinuation as preflightLegacyWorkers,
  validateWorkerContinuationReceipt } from './worker-continuation-runtime.mjs';
import { validateWorkerSetV3, validateWorkerSetEnvelopes } from './worker-set-v3.mjs';
import { runExternalWorker, validateExternalRunReceipt, validateFrozenExternalContainer } from './external-worker-runtime.mjs';
import { cleanupExternalWorker, EXTERNAL_CLEANUP_CONTRACT } from './external-worker-cleanup.mjs';
import { ENROLLMENT_CONTRACT, validateExternalEnrollmentPlan, validateExternalEnrollmentApproval, validateExternalEnrollmentReceipt } from './external-worker-enrollment.mjs';
import { applyExternalEnrollment } from './external-worker-enrollment-runtime.mjs';
import { validateExternalNetworkObservation } from './external-network-policy.mjs';
import { EXTERNAL_WORKER_PUBLIC_ROOT_PATH, EXTERNAL_WORKER_ROOT_CONTRACT,
  externalWorkerRootIntent, externalWorkerRootDer, validateExternalWorkerRootEnrollment,
  validateExternalWorkerRootRecovery, validateExternalWorkerRootAuthority, validateExternalWorkerRootRetirement } from './external-worker-public-root.mjs';
import { beginExternalWorkerContinuation, bindForwardExternalWorkerContinuation, completeExternalWorkerContinuation,
  abortExternalWorkerContinuation, rollbackExternalWorkerContinuation, preflightExternalWorkerContinuation,
  validateExternalWorkerContinuationReceipt } from './external-worker-continuation-runtime.mjs';

const STATE = '/var/lib/leetplus-compose';
const ROOT = '/srv/leetplus';
const CONTROL = path.dirname(fileURLToPath(import.meta.url));
const NGINX = '/etc/nginx/leetplus-compose';
const CLEAN_ENV = { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TZ: 'UTC' };
const [command, ...args] = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  demand(/^--[a-z-]+$/.test(args[i]) && args[i + 1] && !options[args[i].slice(2)], 'Expected unique named arguments');
  options[args[i].slice(2)] = args[i + 1];
}
function safeFile(p, { limit = 16 * 1024 * 1024, immutable = false } = {}) {
  demand(path.isAbsolute(p) && path.normalize(p) === p, 'Noncanonical file path');
  for (let ancestor = path.dirname(p); ; ancestor = path.dirname(ancestor)) {
    const s = fs.lstatSync(ancestor);
    demand(s.isDirectory() && !s.isSymbolicLink() && s.uid === 0 && !(s.mode & 0o022), 'Untrusted file ancestor');
    if (ancestor === '/') break;
  }
  const fd = fs.openSync(p, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const s = fs.fstatSync(fd);
    demand(s.isFile() && s.uid === 0 && s.nlink === 1 && !(s.mode & 0o022) && s.size <= limit && (!immutable || (s.mode & 0o777) === 0o400), 'Untrusted file identity');
    return fs.readFileSync(fd);
  } finally { fs.closeSync(fd); }
}
function readJSON(p, opts) { return JSON.parse(safeFile(p, opts)); }
function syncDir(p) { const fd = fs.openSync(p, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
function directory(p) {
  if (!fs.existsSync(p)) { fs.mkdirSync(p, { mode: 0o700 }); syncDir(path.dirname(p)); }
  const s = fs.lstatSync(p); demand(s.isDirectory() && !s.isSymbolicLink() && s.uid === 0 && (s.mode & 0o077) === 0, 'Private state directory required');
}
function publish(p, value) {
  const bytes = Buffer.from(canonical(value));
  if (fs.existsSync(p)) { demand(safeFile(p, { immutable: true }).equals(bytes), 'Immutable publication conflict'); return; }
  // Every control invocation holds the same kernel flock. Publish complete
  // fsynced bytes by atomic rename, never leave a partially written final record.
  const tmp = `${p}.publishing-${crypto.randomUUID()}`;
  const fd = fs.openSync(tmp, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o400);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  demand(!fs.existsSync(p), 'Concurrent immutable publication outside control lock');
  fs.renameSync(tmp, p);
  syncDir(path.dirname(p));
}
function publishPrivateBytes(p, bytes) {
  if (fs.existsSync(p)) { demand(safeFile(p, { immutable: true }).equals(bytes), 'Immutable private byte conflict'); return; }
  const tmp = `${p}.publishing-${crypto.randomUUID()}`;
  const fd = fs.openSync(tmp, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o400);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try {
    demand(!fs.existsSync(p), 'Concurrent immutable private publication outside control lock');
    fs.renameSync(tmp, p);
    syncDir(path.dirname(p));
  } finally { if (fs.existsSync(tmp)) { fs.unlinkSync(tmp); syncDir(path.dirname(p)); } }
  demand(safeFile(p, { immutable: true }).equals(bytes), 'Published private bytes changed');
}
function replace(p, bytes, mode = 0o600) {
  const tmp = `${p}.next-${crypto.randomUUID()}`;
  const fd = fs.openSync(tmp, 'wx', mode);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, p); syncDir(path.dirname(p));
}
function replaceOwned(p, bytes, { mode, gid }) {
  const tmp = `${p}.next-${crypto.randomUUID()}`;
  const fd = fs.openSync(tmp, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, mode);
  try { fs.fchownSync(fd, 0, gid); fs.fchmodSync(fd, mode); fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  try { fs.renameSync(tmp, p); syncDir(path.dirname(p)); }
  finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
}
function run(binary, argv, { timeout = 120000, input, json = false } = {}) {
  const result = spawnSync(binary, argv, { encoding: 'utf8', env: CLEAN_ENV, timeout, maxBuffer: 16 * 1024 * 1024, input });
  if (result.status !== 0) {
    const error = { time: new Date().toISOString(), executable: path.basename(binary), exitCode: result.status, signal: result.signal, reason: result.error?.code ?? 'COMMAND_FAILED' };
    if (binary === '/usr/bin/python3' && argv[0] === `${CONTROL}/network-fence.py`) {
      try {
        const diagnostic = JSON.parse(result.stdout);
        if (diagnostic.decision === 'FAIL' && /^[A-Z_]{1,64}$/.test(diagnostic.reasonCode ?? '')) {
          error.reason = diagnostic.reasonCode;
          console.error(JSON.stringify({ ...error, providerSetState: diagnostic.observation?.result ?? 'UNKNOWN' }));
        }
      } catch { /* Never copy arbitrary child output or provider details. */ }
    }
    fs.appendFileSync(`${STATE}/command-errors.jsonl`, `${JSON.stringify(error)}\n`, { mode: 0o600 });
    throw new Error(`${error.executable}: ${error.reason} (exit ${error.exitCode})`);
  }
  return json ? JSON.parse(result.stdout) : result.stdout.trim();
}
function docker(argv, options) { return run('/usr/bin/docker', ['--host', 'unix:///var/run/docker.sock', '--config', '/etc/leetplus-compose/docker-cli', ...argv], options); }
function compose(argv) { return docker(['compose', '--project-name', 'leetplus', '--file', `${ROOT}/compose.json`, ...argv]); }
function databaseIdentity() {
  return docker(['exec', 'leetplus-postgres', '/usr/lib/postgresql/16/bin/psql', '-XAt', '-h', '/tmp', '-U', 'postgres', '-d', 'leetplus', '-c', 'SELECT system_identifier::text FROM pg_control_system();']);
}
function attestAdmittedRelease(value, expectedAdmissionSha256) {
  release(value);
  const inbox = `${ROOT}/inbox/${value.releaseSha}`;
  const raw = safeFile(`${inbox}/docker-admission.json`);
  const admission = JSON.parse(raw);
  demand(!expectedAdmissionSha256 || digest(raw) === expectedAdmissionSha256, 'Release admission digest changed');
  demand(admission.contract === `${CONTRACT}_ADMISSION` && admission.decision === 'PASS' && admission.repository === 'boozik3412/leetplus' && admission.ref === 'refs/heads/main' && admission.event === 'push' && admission.releaseSha === value.releaseSha, 'Release is not exact-main admitted');
  const manifest = safeFile(`${inbox}/release.json`);
  demand(digest(manifest) === admission.releaseManifestSha256 && canonical(JSON.parse(manifest)) === canonical(value) && canonical(admission.images) === canonical(value.images), 'Release images do not match the admitted manifest');
  return digest(raw);
}
function appOnlyRoot(releaseSha) {
  demand(/^[a-f0-9]{40}$/.test(releaseSha ?? ''), 'Invalid app-only release identity');
  return `${STATE}/app-downloads/${releaseSha}`;
}
function attestAppOnlyOperation(plan, dir, { allowExpired = false } = {}) {
  demand(plan.contract === APP_ONLY_PLAN, 'Not an app-only plan');
  const root = appOnlyRoot(plan[plan.targetSlot].releaseSha), bundlePath = `${root}/bundle/app-bundle.json`;
  const admissionPath = `${root}/app-admission.json`, archivePath = `${root}/bundle/app-images.tar.gz`;
  const bundleRaw = safeFile(`${dir}/app-bundle.json`, { immutable: true });
  const admissionRaw = safeFile(`${dir}/app-admission.json`, { immutable: true });
  const certRaw = safeFile(`${dir}/data-baseline-certification.json`, { immutable: true });
  demand(bundleRaw.equals(safeFile(bundlePath)) && admissionRaw.equals(safeFile(admissionPath, { immutable: true })),
    'Operation-owned app admission differs from downloaded bytes');
  const bundle = validateAppBundle(JSON.parse(bundleRaw)), admission = validateAppAdmission(JSON.parse(admissionRaw));
  const certification = JSON.parse(certRaw);
  demand(digest(admissionRaw) === plan.appAdmissionSha256 && digest(certRaw) === plan.dataBaselineCertificationSha256 &&
    admission.bundleManifestSha256 === digest(bundleRaw) &&
    run('/usr/bin/sha256sum', ['--', archivePath]).split(/\s/)[0] === plan.appArchiveSha256,
  'App-only immutable artifact/operation digest drift');
  validateAppOnlyPlan(plan, { bundle, admission, certification,
    readinessReceiptSha256: certification.readinessReceiptSha256, allowExpired });
  return { bundle, admission, certification, archivePath };
}
function assertPrimaryDatabase(expectedIdentity) {
  demand(digest(databaseIdentity()) === expectedIdentity, 'Database system identity changed');
  const facts = docker(['exec', 'leetplus-postgres', '/usr/lib/postgresql/16/bin/psql', '-XAt', '-h', '/tmp', '-U', 'postgres', '-d', 'leetplus', '-c', "SELECT pg_is_in_recovery(),rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls,has_schema_privilege('leetplus_runtime','public','CREATE') FROM pg_roles WHERE rolname='leetplus_runtime';"]);
  demand(facts === 'f|f|f|f|f|f|f|f', 'Database is not the admitted primary with a bounded runtime role');
}
function installedDigest() {
  const manifest = readJSON(`${CONTROL}/install-manifest.json`, { immutable: true });
  demand(manifest.contract === `${CONTRACT}_INSTALL` && manifest.files && Object.keys(manifest.files).length > 5, 'Missing installed control manifest');
  for (const [name, hash] of Object.entries(manifest.files)) {
    demand(/^[a-zA-Z0-9_.@-]+$/.test(name) && !['.', '..'].includes(name) && /^[a-f0-9]{64}$/.test(hash), 'Invalid installed file record');
    demand(digest(safeFile(`${CONTROL}/${name}`)) === hash, 'Installed control digest mismatch');
  }
  for (const name of ['control.mjs', 'orchestrator.mjs', 'contract.mjs', 'control.sh',
    'control-reconcile.mjs', 'worker-continuation.mjs', 'worker-continuation-runtime.mjs',
    'exact-target-handoff-authority.mjs',
    'app-only-artifact.mjs', 'app-only-baseline.mjs', 'app-only-live-certification.mjs',
    'app-only-installed-certifier.mjs', 'external-worker-contract.mjs', 'external-worker-runtime.mjs',
    'external-worker-continuation-runtime.mjs', 'external-worker-enrollment.mjs', 'external-worker-enrollment-runtime.mjs',
    'external-worker-public-root.mjs', 'external-worker-cleanup.mjs', 'external-tenant-public-root.mjs', 'external-worker-image-capability.mjs',
    'external-network-policy.mjs', 'worker-set-v3.mjs',
    'external-network-fence.py', 'leetplus-compose-external-daily.service',
    'leetplus-compose-external-daily.timer']) {
    demand(manifest.files[name], 'Required control file is not attested');
  }
  return digest(manifest);
}
function hostIdentity() { return digest(safeFile('/etc/machine-id').toString().trim()); }
function active() { return fs.existsSync(`${STATE}/active.json`) ? readJSON(`${STATE}/active.json`) : null; }
function assertControllerContinuity() {
  demand(fs.realpathSync('/usr/local/sbin/leetplus-compose') === `${CONTROL}/control.sh`, 'Use the currently serving controller');
  const current = active();
  if (!current) return;
  const plan = readJSON(`${operation(current.operationId)}/plan.json`, { immutable: true });
  demand(current.planSha256 === digest(plan), 'Active application plan drift');
  const controlSha256 = installedDigest();
  if (plan.controlSha256 === controlSha256) return;
  const context = { controlSha256, hostIdentitySha256: hostIdentity(),
    activeSha256: digest(safeFile(`${STATE}/active.json`)),
    mainTarget: fs.realpathSync('/usr/local/sbin/leetplus-compose'),
    unitSha256: digest(safeFile('/etc/systemd/system/leetplus-compose-network-refresh.service')) };
  const publicKey = safeFile('/etc/leetplus-compose/approval-root.pem');
  const acceptPointer = pointer => {
    demand(/^[a-f0-9-]{36}$/.test(pointer.operationId ?? ''), 'Invalid control handoff pointer');
    const directory = `${STATE}/control-handoffs/${pointer.operationId}`;
    demand(!fs.existsSync(`${directory}/rolled-back.json`), 'Controller handoff was rolled back');
    const handoffPlan = readJSON(`${directory}/plan.json`, { immutable: true });
    if (handoffPlan.contract === 'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V2_PLAN') {
      validateAcceptedExactTargetHandoff({ plan: handoffPlan,
        permitEnvelope: readJSON(`${directory}/permit.json`, { immutable: true }),
        receipt: readJSON(`${directory}/receipt.json`, { immutable: true }), pointer },
      publicKey, context);
    } else validateControlHandoffAuthority({ plan: handoffPlan,
      approvalEnvelope: readJSON(`${directory}/approval.json`, { immutable: true }),
      receipt: readJSON(`${directory}/receipt.json`, { immutable: true }), pointer }, publicKey, context);
  };
  try { acceptPointer(readJSON(`${STATE}/control-handoffs/active.json`)); return; } catch {
    // A crash after the atomic core switch must not brick ordinary accepted
    // lifecycle/boot. This is explicit provisional authority, not a fabricated
    // completion receipt; operational deployment stays fenced while pending.
    const pending = readJSON(`${STATE}/control-handoff.pending.json`);
    demand(/^[a-f0-9-]{36}$/.test(pending.operationId ?? ''), 'Invalid pending handoff');
    const directory = `${STATE}/control-handoffs/${pending.operationId}`;
    const pendingPlan = readJSON(`${directory}/plan.json`, { immutable: true });
    if (pendingPlan.oldControlSha256 === controlSha256 && pendingPlan.oldMainTarget === `${CONTROL}/control.sh` && pendingPlan.previousPointer) {
      // During an interrupted reverse switch, only the independently signed
      // previous controller authority can restore ordinary lifecycle rights.
      demand(typeof pendingPlan.previousPointer === 'string' && pendingPlan.previousPointer.length <= 8192, 'Invalid previous control pointer');
      acceptPointer(JSON.parse(Buffer.from(pendingPlan.previousPointer, 'base64').toString('utf8')));
      return;
    }
    demand(!fs.existsSync(`${directory}/rolled-back.json`), 'Pending control was rolled back');
    if (pendingPlan.contract === 'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V2_PLAN') {
      validatePendingExactTargetHandoff({ plan: pendingPlan,
        permitEnvelope: readJSON(`${directory}/permit.json`, { immutable: true }),
        intent: readJSON(`${directory}/bridge-apply.intent.json`, { immutable: true }), pending },
      publicKey, context);
    } else validatePendingControlHandoffAuthority({ plan: pendingPlan,
      approvalEnvelope: readJSON(`${directory}/approval.json`, { immutable: true }),
      intent: readJSON(`${directory}/apply-main.intent.json`, { immutable: true }), pending }, publicKey, context);
  }
}
function operation(id) { demand(/^[a-f0-9-]{36}$/.test(id ?? ''), 'Invalid operation ID'); return `${STATE}/operations/${id}`; }
function storeFor(dir) {
  const read = async () => {
    const records = {};
    for (const [i, phase] of PHASES.entries()) {
      const record = {};
      for (const type of ['intent', 'evidence', 'receipt']) {
        const p = `${dir}/${i + 1}-${phase}.${type}.json`;
        if (fs.existsSync(p)) record[type] = readJSON(p, { immutable: true });
      }
      if (Object.keys(record).length) records[phase] = record;
    }
    return { records, final: fs.existsSync(`${dir}/final.json`) ? readJSON(`${dir}/final.json`, { immutable: true }) : null, rolledBack: fs.existsSync(`${dir}/rolled-back.json`) ? readJSON(`${dir}/rolled-back.json`, { immutable: true }) : null };
  };
  return { read, publish: async (phase, type, value) => publish(`${dir}/${PHASES.indexOf(phase) + 1}-${phase}.${type}.json`, value), finalize: async value => publish(`${dir}/final.json`, value) };
}
function canonicalPrivateJSON(file) {
  const bytes = safeFile(file, { immutable: true });
  const value = JSON.parse(bytes);
  demand(bytes.equals(Buffer.from(canonical(value))), 'Worker continuation JSON bytes are not canonical');
  return value;
}
function externalWorkerPublicKey() {
  const publicPem = safeFile(EXTERNAL_WORKER_PUBLIC_ROOT_PATH);
  const root = `${STATE}/external-worker-root`;
  const receipt = canonicalPrivateJSON(`${root}/receipt.json`);
  return validateExternalWorkerRootAuthority({ envelope: canonicalPrivateJSON(`${root}/approval.json`),
    receipt, publicPem, intent: canonicalPrivateJSON(`${root}/intent.json`),
    recoveryEnvelope: receipt.recoveryEnvelopeSha256 ? canonicalPrivateJSON(`${root}/recovery-${receipt.recoveryOperationId}.json`) : null,
    deploymentPublicPem: safeFile('/etc/leetplus-compose/approval-root.pem'), hostIdentitySha256: hostIdentity() });
}
function workerTimer(unit) {
  demand(Object.values(TIMER_UNITS).includes(unit), 'Unknown worker continuation timer');
  const raw = run('/usr/bin/systemctl', ['show', unit, '--property=LoadState,ActiveState,UnitFileState,SubState']);
  const fields = Object.fromEntries(raw.split('\n').filter(Boolean).map(line => line.split('=', 2)));
  demand(fields.LoadState === 'loaded' && ['enabled', 'disabled'].includes(fields.UnitFileState) &&
    ['active', 'inactive'].includes(fields.ActiveState) && ['waiting', 'dead'].includes(fields.SubState),
  'Untrusted worker timer observation');
  return { unit, loadState: fields.LoadState, enabled: fields.UnitFileState === 'enabled',
    active: fields.ActiveState === 'active', subState: fields.SubState };
}
function workerContinuationAdapters(dir) {
  const statePath = worker => { demand(WORKERS.includes(worker), 'Unknown worker grant'); return `${STATE}/worker-grants/${worker}.json`; };
  const lifecyclePaths = { intent: `${dir}/worker-continuation.intent.json`, receipt: `${dir}/worker-continuation.receipt.json`,
    abortReceipt: `${dir}/worker-continuation.abort.json`, rollbackIntent: `${dir}/worker-continuation-rollback.intent.json`,
    rollbackReceipt: `${dir}/worker-continuation-rollback.receipt.json` };
  return {
    readGrant: async worker => canonicalPrivateJSON(statePath(worker)),
    writeGrantAtomic: async (worker, envelope) => replace(statePath(worker), Buffer.from(canonical(envelope)), 0o400),
    readTimer: async unit => workerTimer(unit),
    systemctl: async (action, unit) => {
      demand(['stop', 'start', 'enable', 'disable'].includes(action) && Object.values(TIMER_UNITS).includes(unit), 'Unscoped worker timer command');
      run('/usr/bin/systemctl', [action, unit]);
    },
    readLifecycle: async () => Object.fromEntries(Object.entries(lifecyclePaths)
      .filter(([, file]) => fs.existsSync(file)).map(([type, file]) => [type, canonicalPrivateJSON(file)])),
    publish: async (type, value) => { demand(Object.hasOwn(lifecyclePaths, type), 'Unknown worker continuation record'); publish(lifecyclePaths[type], value); },
    assertExclusiveLock: async () => verifyKernelControlLocks({ mode: 'WRITE', singleton: null }, {
      globalLock: fs.lstatSync(`${STATE}/control.lock`), locks: fs.readFileSync('/proc/locks', 'utf8'), parentPid: process.ppid,
    }),
  };
}
function workerContinuationArguments(plan, dir, current = active()) {
  demand(plan.workerContinuation?.contract === WORKER_CONTINUATION_V2, 'Executable worker continuation is required');
  const forwardEnvelopes = WORKERS.map(worker => canonicalPrivateJSON(`${dir}/worker-forward-${worker}.json`));
  const rollbackEnvelopes = WORKERS.map(worker => canonicalPrivateJSON(`${dir}/worker-rollback-${worker}.json`));
  const profiles = Object.fromEntries(WORKERS.map(worker => [worker, safeFile(`${ROOT}/secrets/${worker}.json`)]));
  for (const binding of plan.workerContinuation.profileBindings) {
    demand(digest(safeFile(`${dir}/worker-profile-${binding.worker}.json`, { immutable: true })) === binding.profileSha256 &&
      digest(profiles[binding.worker]) === binding.profileSha256, 'Worker profile snapshot or live bytes drift');
  }
  return { plan, forwardEnvelopes, rollbackEnvelopes, external: plan.workerSetV3 ? externalContinuationArguments(plan, dir, current) : null,
    context: { publicKey: safeFile('/etc/leetplus-compose/approval-root.pem'), hostIdentitySha256: hostIdentity(),
      profiles, now: Date.now(), current }, adapters: workerContinuationAdapters(dir) };
}
function externalTimer() {
  const unit = 'leetplus-compose-external-daily.timer';
  const raw = run('/usr/bin/systemctl', ['show', unit, '--property=LoadState,ActiveState,UnitFileState,SubState,DropInPaths']);
  const fields = Object.fromEntries(raw.split('\n').filter(Boolean).map(line => line.split('=', 2)));
  demand(!fields.DropInPaths, 'External timer has unreviewed drop-ins');
  if (fields.LoadState === 'not-found') return { unit, loadState: 'not-found', enabled: false, active: false, subState: 'dead' };
  demand(fields.LoadState === 'loaded' && ['enabled', 'disabled'].includes(fields.UnitFileState) &&
    ['active', 'inactive'].includes(fields.ActiveState) && ['waiting', 'dead'].includes(fields.SubState), 'External timer state ambiguous');
  return { unit, loadState: 'loaded', enabled: fields.UnitFileState === 'enabled', active: fields.ActiveState === 'active', subState: fields.SubState };
}
function validateExternalPreimage(plan, previous, profiles, now = Date.now()) {
  if (!plan.workerSetV3) {
    demand(!plan[plan.targetSlot].externalWorkerCapability && !previous?.[previous.activeSlot]?.externalWorkerCapability,
      'Capable rollout requires V3 external worker continuation');
    return null;
  }
  const policy = validateWorkerSetV3(plan.workerSetV3, plan), external = policy.external;
  demand(canonical(policy.legacy) === canonical(plan.workerContinuation), 'V3 does not preserve the native V2 policy');
  demand(canonical(externalTimer()) === canonical(external.originalTimer), 'External timer differs from plan preimage');
  const grantPath = `${STATE}/worker-grants/${external.worker}.json`, secretPath = `${ROOT}/secrets/${external.worker}.json`;
  const grantEnvelope = fs.existsSync(grantPath) ? canonicalPrivateJSON(grantPath) : null;
  const profile = external.preimage === 'PRESENT' ? safeFile(secretPath) : null;
  if (external.preimage === 'PRESENT') {
    const pointer = readJSON(`${STATE}/external-worker/enrollment.json`, { immutable: true });
    demand(pointer?.contract === 'LEETPLUS_LANGAME_EXTERNAL_WORKER_ENROLLMENT_V1_POINTER' &&
      /^[a-f0-9-]{36}$/.test(pointer.operationId ?? '') &&
      digest(safeFile(`${STATE}/external-worker/enrollments/${pointer.operationId}/receipt.json`, { immutable: true })) === external.enrollmentReceiptSha256 &&
      pointer.receiptSha256 === external.enrollmentReceiptSha256 && digest(profile) === external.profileSha256,
    'External profile/enrollment receipt is not exact');
  }
  validateWorkerSetEnvelopes(policy, { plan, stage: 'CURRENT', legacyEnvelopes: policy.legacy.originalGrantEnvelopes,
    externalEnvelope: grantEnvelope, publicKey: safeFile('/etc/leetplus-compose/approval-root.pem'), active: previous,
    externalPublicKey: external.preimage === 'PRESENT' ? externalWorkerPublicKey() : undefined,
    hostIdentitySha256: plan.hostIdentitySha256, profiles, externalProfile: profile, now });
  return profile;
}
function enrolledCanaryEvidence(plan, serviceUnitBytes, timerUnitBytes, publicKey) {
  if (plan.mode !== 'TIMER') return null;
  const root = `${STATE}/external-worker/enrollments`, matches = fs.readdirSync(root).filter(id =>
    /^[a-f0-9-]{36}$/.test(id) && fs.existsSync(`${root}/${id}/receipt.json`) &&
    digest(safeFile(`${root}/${id}/receipt.json`, { immutable: true })) === plan.previousEnrollmentReceiptSha256);
  demand(matches.length === 1, 'TIMER enrollment lacks one exact CANARY enrollment receipt');
  const prior = `${root}/${matches[0]}`;
  const enrollmentPlan = canonicalPrivateJSON(`${prior}/plan.json`), enrollmentReceipt = canonicalPrivateJSON(`${prior}/receipt.json`);
  const approval = canonicalPrivateJSON(`${prior}/approval.json`), grantEnvelope = canonicalPrivateJSON(`${prior}/grant.json`);
  const secretBytes = safeFile(`${prior}/secret.json`, { immutable: true }), priorActive = canonicalPrivateJSON(`${prior}/active.json`);
  const priorController = canonicalPrivateJSON(`${prior}/controller.json`);
  demand(priorController.contract === `${CONTRACT}_INSTALL` && digest(priorController) === enrollmentPlan.controllerManifestSha256 &&
    safeFile(`/usr/local/lib/leetplus-compose/${priorController.releaseSha}/install-manifest.json`, { immutable: true })
      .equals(Buffer.from(canonical(priorController))), 'CANARY enrollment original controller manifest drift');
  const networkReceiptSha256 = digest(safeFile(`${prior}/network.json`, { immutable: true }));
  const timerState = canonicalPrivateJSON(`${prior}/timer-state.json`);
  demand(enrollmentPlan.mode === 'CANARY' && enrollmentPlan.action === 'ENROLL_CANARY', 'External predecessor was not a CANARY enrollment');
  validateExternalEnrollmentPlan(enrollmentPlan, { current: priorActive, controllerManifestSha256: digest(priorController),
    hostIdentitySha256: hostIdentity(), secretBytes, grantEnvelope, serviceUnitBytes, timerUnitBytes,
    networkPolicySha256: digest(safeFile(`${CONTROL}/external-network-fence.py`)),
    previousEnrollmentReceiptSha256: null, canaryReceiptSha256: null, publicKey, allowExpired: true });
  validateExternalEnrollmentApproval(enrollmentPlan, approval, publicKey, Date.now(), { allowExpired: true });
  validateExternalEnrollmentReceipt(enrollmentReceipt, { plan: enrollmentPlan, approvalEnvelope: approval,
    current: priorActive, secretBytes, grantEnvelope, serviceUnitBytes, timerUnitBytes,
    networkReceiptSha256, timerState });
  const runRoot = `${STATE}/external-worker-runs`, runs = fs.readdirSync(runRoot).filter(leaf =>
    /^[a-f0-9-]{36}\.receipt\.json$/.test(leaf) &&
    digest(safeFile(`${runRoot}/${leaf}`, { immutable: true })) === plan.canaryReceiptSha256);
  demand(runs.length === 1, 'TIMER enrollment lacks one exact terminal CANARY run receipt');
  const identity = runs[0].slice(0, -'.receipt.json'.length);
  const runIntent = canonicalPrivateJSON(`${runRoot}/${identity}.intent.json`),
    runResult = canonicalPrivateJSON(`${runRoot}/${identity}.result.json`),
    runReceipt = canonicalPrivateJSON(`${runRoot}/${identity}.receipt.json`);
  validateExternalRunReceipt(runReceipt, { intent: runIntent, result: runResult,
    output: `${JSON.stringify(runResult)}\n`, grantEnvelope, current: priorActive });
  return { enrollmentPlan, enrollmentReceipt, grantEnvelope, secretBytes, active: priorActive,
    runIntent, runResult, runReceipt };
}
function acceptedExternalEnrollment() {
  const pointer = readJSON(`${STATE}/external-worker/enrollment.json`, { immutable: true });
  demand(pointer?.contract === 'LEETPLUS_LANGAME_EXTERNAL_WORKER_ENROLLMENT_V1_POINTER' &&
    /^[a-f0-9-]{36}$/.test(pointer.operationId ?? '') && /^[a-f0-9]{64}$/.test(pointer.receiptSha256 ?? ''),
  'External enrollment pointer is not exact');
  const dir = `${STATE}/external-worker/enrollments/${pointer.operationId}`;
  const plan = canonicalPrivateJSON(`${dir}/plan.json`), approvalEnvelope = canonicalPrivateJSON(`${dir}/approval.json`);
  const receipt = canonicalPrivateJSON(`${dir}/receipt.json`), originalCurrent = canonicalPrivateJSON(`${dir}/active.json`);
  const originalSecret = safeFile(`${dir}/secret.json`, { immutable: true });
  const originalGrant = canonicalPrivateJSON(`${dir}/grant.json`);
  const networkRaw = safeFile(`${dir}/network.json`, { immutable: true });
  const networkReceiptSha256 = digest(networkRaw);
  validateExternalNetworkObservation(JSON.parse(networkRaw));
  const originalTimer = canonicalPrivateJSON(`${dir}/timer-state.json`);
  const serviceUnitBytes = safeFile(`${dir}/service.unit`, { immutable: true });
  const timerUnitBytes = safeFile(`${dir}/timer.unit`, { immutable: true });
  const canaryEvidence = enrolledCanaryEvidence(plan, serviceUnitBytes, timerUnitBytes, externalWorkerPublicKey());
  demand(pointer.receiptSha256 === digest(receipt), 'External enrollment pointer/receipt digest drift');
  if (plan.previousEnrollmentReceiptSha256) {
    const previous = fs.readdirSync(`${STATE}/external-worker/enrollments`).filter(id => /^[a-f0-9-]{36}$/.test(id) &&
      id !== pointer.operationId && fs.existsSync(`${STATE}/external-worker/enrollments/${id}/receipt.json`) &&
      digest(safeFile(`${STATE}/external-worker/enrollments/${id}/receipt.json`, { immutable: true })) === plan.previousEnrollmentReceiptSha256);
    demand(previous.length === 1, 'External enrollment predecessor receipt lineage is ambiguous');
  }
  const controller = canonicalPrivateJSON(`${dir}/controller.json`);
  demand(controller.contract === `${CONTRACT}_INSTALL` && digest(controller) === plan.controllerManifestSha256 &&
    /^[a-f0-9]{40}$/.test(controller.releaseSha ?? ''), 'Historical external enrollment controller identity drift');
  const historicalRoot = `/usr/local/lib/leetplus-compose/${controller.releaseSha}`;
  demand(safeFile(`${historicalRoot}/install-manifest.json`, { immutable: true }).equals(Buffer.from(canonical(controller))),
    'External enrollment original controller manifest is missing');
  for (const [leaf, hash] of Object.entries(controller.files)) {
    demand(/^[a-zA-Z0-9_.@-]+$/.test(leaf) && !['.', '..'].includes(leaf) &&
      digest(safeFile(`${historicalRoot}/${leaf}`)) === hash, 'External enrollment original controller file drift');
  }
  validateExternalEnrollmentPlan(plan, { current: originalCurrent, controllerManifestSha256: digest(controller),
    hostIdentitySha256: hostIdentity(), secretBytes: originalSecret, grantEnvelope: originalGrant,
    serviceUnitBytes, timerUnitBytes, networkPolicySha256: digest(safeFile(`${CONTROL}/external-network-fence.py`)),
    previousEnrollmentReceiptSha256: plan.previousEnrollmentReceiptSha256,
    canaryReceiptSha256: plan.canaryReceiptSha256,
    canaryEvidence,
    publicKey: externalWorkerPublicKey(), allowExpired: true });
  validateExternalEnrollmentApproval(plan, approvalEnvelope, externalWorkerPublicKey(), Date.now(), { allowExpired: true });
  validateExternalEnrollmentReceipt(receipt, { plan, approvalEnvelope, current: originalCurrent,
    secretBytes: originalSecret, grantEnvelope: originalGrant, serviceUnitBytes, timerUnitBytes,
    networkReceiptSha256, timerState: originalTimer });
  return { pointer, plan, receipt, originalCurrent, originalSecret, originalGrant };
}
function externalContinuationArguments(plan, dir, current) {
  const policy = validateWorkerSetV3(plan.workerSetV3, plan), name = policy.external.worker;
  const grantPath = `${STATE}/worker-grants/${name}.json`;
  const readGrant = () => fs.existsSync(grantPath) ? canonicalPrivateJSON(grantPath) : null;
  const paths = ['intent', 'forward', 'complete', 'abort', 'rollback'].map(type => `external-worker-${type}.json`);
  const readLifecycle = leaf => { demand(paths.includes(leaf), 'Unknown external continuation leaf'); return fs.existsSync(`${dir}/${leaf}`) ? canonicalPrivateJSON(`${dir}/${leaf}`) : null; };
  const profile = policy.external.preimage === 'PRESENT' ? safeFile(`${ROOT}/secrets/${name}.json`) : null;
  if (profile) demand(digest(profile) === policy.external.profileSha256 &&
    digest(safeFile(`${dir}/worker-profile-${name}.json`, { immutable: true })) === policy.external.profileSha256,
  'External worker profile snapshot/live drift');
  return { plan, context: { current, publicKey: policy.external.preimage === 'PRESENT' ? externalWorkerPublicKey() : null,
    hostIdentitySha256: hostIdentity(), externalProfile: profile, now: Date.now(),
    forwardEnvelope: policy.external.forward.state === 'ACTIVE' ? canonicalPrivateJSON(`${dir}/worker-forward-${name}.json`) : null,
    rollbackEnvelope: policy.external.rollback.state === 'ACTIVE' ? canonicalPrivateJSON(`${dir}/worker-rollback-${name}.json`) : null },
  adapters: { readExternalGrant: async () => readGrant(), readExternalTimer: async () => externalTimer(), readLifecycle: async leaf => readLifecycle(leaf),
    publish: async (leaf, value) => { demand(paths.includes(leaf), 'Unknown external continuation publication'); publish(`${dir}/${leaf}`, value); },
    writeExternalGrantCAS: async (expected, desired) => { demand(canonical(readGrant()) === canonical(expected), 'External grant CAS preimage drift'); replace(grantPath, Buffer.from(canonical(desired)), 0o400); },
    removeExternalGrantCAS: async expected => { demand(canonical(readGrant()) === canonical(expected), 'External grant removal preimage drift'); if (expected) { fs.unlinkSync(grantPath); syncDir(path.dirname(grantPath)); } },
    systemctl: async (action, unit) => { demand(['stop', 'start', 'enable', 'disable'].includes(action) && unit === 'leetplus-compose-external-daily.timer', 'External timer command scope drift'); run('/usr/bin/systemctl', [action, unit]); },
    assertExclusiveLock: async () => verifyKernelControlLocks({ mode: 'WRITE', singleton: null }, { globalLock: fs.lstatSync(`${STATE}/control.lock`), locks: fs.readFileSync('/proc/locks', 'utf8'), parentPid: process.ppid }) } };
}
async function preflightWorkerContinuation(args) { await preflightLegacyWorkers(args); if (args.external) await preflightExternalWorkerContinuation(args.external); }
async function beginWorkerContinuation(args) { const value = await beginLegacyWorkers(args); if (args.external) await beginExternalWorkerContinuation(args.external); return value; }
async function bindForwardWorkerContinuation(args) { const value = await bindLegacyWorkers(args); if (args.external) await bindForwardExternalWorkerContinuation(args.external); return value; }
async function completeWorkerContinuation(args) { const value = await completeLegacyWorkers(args); if (args.external) await completeExternalWorkerContinuation(args.external); return value; }
async function abortUncommittedWorkerContinuation(args) { if (args.external && await args.external.adapters.readLifecycle('external-worker-intent.json')) await abortExternalWorkerContinuation(args.external); return abortLegacyWorkers(args); }
async function rollbackWorkerContinuation(args) { const value = await rollbackLegacyWorkers(args); if (args.external) await rollbackExternalWorkerContinuation(args.external); return value; }
async function workerContinuationPostimage(args) {
  return { current: args.context.current,
    grantEnvelopes: await Promise.all(WORKERS.map(worker => args.adapters.readGrant(worker))),
    timers: await Promise.all(WORKERS.map(async worker => ({ worker, ...(await args.adapters.readTimer(TIMER_UNITS[worker])) }))) };
}
async function acceptedWorkerContinuation(args, mode) {
  const lifecycle = await args.adapters.readLifecycle();
  const receipt = mode === 'ROLLBACK' ? lifecycle.rollbackReceipt : lifecycle.receipt;
  demand(receipt, 'Accepted application lacks worker continuation receipt');
  validateWorkerContinuationReceipt({ plan: args.plan, receipt,
    postimage: await workerContinuationPostimage(args),
    context: { ...args.context, intent: lifecycle.intent, rollbackIntent: lifecycle.rollbackIntent,
      forwardEnvelopes: args.forwardEnvelopes, rollbackEnvelopes: args.rollbackEnvelopes } });
  if (args.external) {
    const ext = args.external, leaf = mode === 'ROLLBACK' ? 'external-worker-rollback.json' : 'external-worker-complete.json';
    const stage = args.plan.workerSetV3.external[mode === 'ROLLBACK' ? 'rollback' : 'forward'];
    const originalTimer = args.plan.workerSetV3.external.originalTimer;
    const historicalTimer = stage.state === 'ACTIVE' ? originalTimer : { ...originalTimer, enabled: false, active: false, subState: 'dead' };
    validateExternalWorkerContinuationReceipt({ plan: args.plan, receipt: await ext.adapters.readLifecycle(leaf),
      context: { ...ext.context, allowExpired: true, intent: await ext.adapters.readLifecycle('external-worker-intent.json') },
      postimage: { grant: stage.state === 'ACTIVE' ? (mode === 'ROLLBACK' ? ext.context.rollbackEnvelope : ext.context.forwardEnvelope) : null,
        timer: historicalTimer } });
  }
  return receipt;
}
async function externalContinuationEvidence(plan, dir, mode = 'FORWARD') {
  if (!plan.workerSetV3) return {};
  const leaf = mode === 'ROLLBACK' ? 'external-worker-rollback.json' : 'external-worker-complete.json';
  const receipt = canonicalPrivateJSON(`${dir}/${leaf}`);
  return { externalWorkerContinuationReceiptSha256: digest(receipt) };
}
function assertNoPending(except) {
  const externalRunning = docker(['ps', '--filter', 'name=^/leetplus-langame-external-daily-worker$', '--format', '{{.ID}}']);
  demand(!externalRunning, 'An external worker container survived its native controller; reconcile and stop it before any new control effect');
  for (const id of fs.readdirSync(`${STATE}/operations`)) {
    if (id === except) continue;
    const dir = operation(id);
    if (!fs.existsSync(`${dir}/final.json`)) {
      const plan = readJSON(`${dir}/plan.json`, { immutable: true });
      const rollback = readJSON(`${dir}/rolled-back.json`, { immutable: true });
      demand(rollback.contract === `${CONTRACT}_ROLLED_BACK` && rollback.planSha256 === digest(plan) && plan.previous && rollback.active?.generation === plan.generation + 2 && rollback.active?.activeSlot === plan.previous.activeSlot, 'Another deployment operation is unfinished');
    }
  }
}
function http(url, { headers = {}, resolve } = {}) {
  const argv = ['--fail', '--silent', '--show-error', '--max-time', '45', '--proto', '=http,https', '--max-redirs', '0'];
  if (resolve) argv.push('--resolve', resolve);
  for (const [key, value] of Object.entries(headers)) {
    demand(/^(Authorization|Cookie|X-Platform-Tenant-Context)$/.test(key) && typeof value === 'string' && !/[\r\n\0]/.test(value), 'Invalid smoke header');
  }
  // Credentials travel through stdin to curl's config, never argv or output.
  const config = Object.entries(headers).map(([key, value]) => `header = ${JSON.stringify(`${key}: ${value}`)}`).join('\n');
  if (config) argv.push('--config', '-');
  argv.push(url);
  return run('/usr/bin/curl', argv, { timeout: 50000, input: config || undefined });
}
function probeSlot(plan, slot) {
  const expected = plan[slot];
  const api = JSON.parse(http(`http://127.0.0.1:${PORTS[slot].api}/health/ready`));
  const web = JSON.parse(http(`http://127.0.0.1:${PORTS[slot].web}/api/release-identity`));
  demand(api.ok === true && api.release?.sha === expected.releaseSha && api.dependencies?.database?.migration === SCHEMA.migration && api.dependencies?.database?.migrationCount === SCHEMA.migrationCount, 'API readiness mismatch');
  demand(web.release?.sha === expected.releaseSha && web.release?.webBuildId === expected.releaseSha, 'Web release identity mismatch');
  const specification = renderCompose({ blue: plan.blue, green: plan.green, dataRelease: plan.dataRelease, activeSlot: plan.targetSlot });
  for (const [name, expected] of Object.entries(specification.networks)) {
    const actual = docker(['network', 'inspect', expected.name], { json: true })[0];
    demand(actual.Internal === expected.internal && actual.EnableIPv6 === false && actual.Driver === 'bridge' && actual.IPAM.Config.length === 1 && actual.IPAM.Config[0].Subnet === expected.ipam.config[0].subnet, `${name}: network isolation drift`);
  }
  return ['api', 'web'].map(role => {
    const name = `${role}-${slot}`;
    const imageEnvironment = docker(['image', 'inspect', specification.services[name].image], { json: true })[0].Config.Env;
    return verifyContainer(docker(['inspect', specification.services[name].container_name], { json: true })[0], specification.services[name], name, { imageEnvironment });
  });
}
function authenticatedSmoke(slot) {
  const auth = readJSON(`${ROOT}/secrets/acceptance.json`);
  demand(auth.corporateHeaders && auth.guestHeaders, 'Both corporate and guest smoke identities are required');
  const base = `http://127.0.0.1:${PORTS[slot].api}`;
  return ['/auth/me', '/stores', '/guest-portal/session/game-summary'].map((route, i) => ({ route, responseSha256: digest(http(`${base}${route}`, { headers: i < 2 ? auth.corporateHeaders : auth.guestHeaders })) }));
}
function acceptedLink(slot) {
  const file = `${NGINX}/active.conf`;
  if (!fs.existsSync(file)) return false;
  return fs.lstatSync(file).isSymbolicLink() && fs.readlinkSync(file) === `${slot}.conf`;
}
function switchLink(slot) {
  const tmp = `${NGINX}/active.next-${crypto.randomUUID()}`;
  fs.symlinkSync(`${slot}.conf`, tmp);
  fs.renameSync(tmp, `${NGINX}/active.conf`); syncDir(NGINX);
}
async function finishRollbackWorkerContinuation(p, dir, current) {
  const continuation = p.workerContinuation?.contract === WORKER_CONTINUATION_V2 ? workerContinuationArguments(p, dir, current) : null;
  const workerReceipt = continuation ? await rollbackWorkerContinuation(continuation) : null;
  publish(`${dir}/rolled-back.json`, { contract: `${CONTRACT}_ROLLED_BACK`, planSha256: digest(p), reason: 'POSTCHECK_FAILED', active: current,
    ...(workerReceipt ? { workerContinuationReceiptSha256: digest(workerReceipt) } : {}),
    ...await externalContinuationEvidence(p, dir, 'ROLLBACK') });
  return workerReceipt;
}
function rollbackActive(p) {
  return { operationId: p.operationId, generation: p.generation + 2, activeSlot: p.previous.activeSlot,
    blue: p.blue, green: p.green, dataRelease: p.dataRelease,
    dataAdmissionSha256: p.dataAdmissionSha256, planSha256: digest(p), outcome: 'ROLLED_BACK' };
}
function rollbackIntent(p) {
  return { planSha256: digest(p), fromGeneration: p.generation + 1, targetSlot: p.previous.activeSlot };
}
async function resumeRollbackAfterPostcheck(p, dir, { effectsAllowed }) {
  const intent = canonicalPrivateJSON(`${dir}/rollback.intent.json`);
  demand(canonical(intent) === canonical(rollbackIntent(p)), 'Rollback intent does not bind the exact plan');
  const current = active(), expected = rollbackActive(p);
  if (canonical(current) === canonical(expected)) {
    demand(acceptedLink(p.previous.activeSlot), 'Rollback active state has a different nginx link');
    probeSlot(p, p.previous.activeSlot);
    const live = JSON.parse(http('https://api.leetplus.ru/health/ready', { resolve: 'api.leetplus.ru:443:127.0.0.1' }));
    demand(live.release?.sha === p.previous[p.previous.activeSlot].releaseSha,
      'Rollback active state is not the public serving release');
    if (effectsAllowed) await finishRollbackWorkerContinuation(p, dir, current);
    const terminal = await storeFor(dir).read();
    demand(terminal.rolledBack?.workerContinuationReceiptSha256,
      'Rollback is not terminally accepted after authorization expiry');
    return terminal.rolledBack;
  }
  demand(current?.operationId === p.operationId && current.generation === p.generation + 1 &&
    current.activeSlot === p.targetSlot, 'Rollback recovery has ambiguous active state');
  demand(effectsAllowed, 'Rollback routing is unfinished after authorization expiry');
  probeSlot(p, p.previous.activeSlot);
  authenticatedSmoke(p.previous.activeSlot);
  const publicRelease = () => {
    try {
      const ready = JSON.parse(http('https://api.leetplus.ru/health/ready', { resolve: 'api.leetplus.ru:443:127.0.0.1' }));
      const web = JSON.parse(http('https://leetplus.ru/api/release-identity', { resolve: 'leetplus.ru:443:127.0.0.1' }));
      return ready.release?.sha === web.release?.sha ? ready.release.sha : null;
    } catch { return null; }
  };
  const linkWasPrevious = acceptedLink(p.previous.activeSlot);
  if (!linkWasPrevious) {
    demand(acceptedLink(p.targetSlot), 'Rollback routing link is ambiguous');
    switchLink(p.previous.activeSlot);
  }
  const served = publicRelease();
  if (!linkWasPrevious && served === p.previous[p.previous.activeSlot].releaseSha) {
    demand(false, 'Rollback link changed without a provable nginx generation; manual recovery required');
  }
  if (served !== p.previous[p.previous.activeSlot].releaseSha) {
    demand(served === p[p.targetSlot].releaseSha && acceptedLink(p.previous.activeSlot),
      'Rollback public routing is ambiguous before nginx reload');
    run('/usr/sbin/nginx', ['-t']); run('/usr/bin/systemctl', ['reload', 'nginx']);
  }
  demand(publicRelease() === p.previous[p.previous.activeSlot].releaseSha,
    'Rollback public routing did not reach the previous release');
  probeSlot(p, p.previous.activeSlot);
  replace(`${STATE}/active.json`, canonical(expected));
  await finishRollbackWorkerContinuation(p, dir, expected);
  return (await storeFor(dir).read()).rolledBack;
}
async function rollbackAfterPostcheck(p, dir) {
  demand(p.previous, 'Bootstrap has no local predecessor to roll back to');
  probeSlot(p, p.previous.activeSlot); authenticatedSmoke(p.previous.activeSlot);
  publish(`${dir}/rollback.intent.json`, rollbackIntent(p));
  switchLink(p.previous.activeSlot);
  run('/usr/sbin/nginx', ['-t']); run('/usr/bin/systemctl', ['reload', 'nginx']);
  probeSlot(p, p.previous.activeSlot);
  const current = rollbackActive(p);
  replace(`${STATE}/active.json`, canonical(current));
  await finishRollbackWorkerContinuation(p, dir, current);
}
function driverFor(dir) {
  const driver = {
    preflight: async (p) => {
      demand(hostIdentity() === p.hostIdentitySha256 && installedDigest() === p.controlSha256, 'Host/control identity drift');
      for (const [leaf, hash] of Object.entries(p.secretDigests)) demand(digest(safeFile(`${ROOT}/secrets/${leaf}`)) === hash, 'Runtime secret-file binding drift');
      demand(digest(safeFile('/etc/leetplus-compose/providers.json')) === p.networkPolicySha256, 'Provider policy binding drift');
      run('/usr/bin/python3', [`${CONTROL}/network-fence.py`, 'verify']);
      assertPrimaryDatabase(p.databaseIdentitySha256);
      if (p.contract === APP_ONLY_PLAN) {
        const phaseState = await storeFor(dir).read();
        const pendingIntent = PHASES.some(phase => phaseState.records[phase]?.intent && !phaseState.records[phase]?.receipt);
        attestAppOnlyOperation(p, dir, { allowExpired: pendingIntent });
      } else attestAdmittedRelease(p[p.targetSlot], p.admissionSha256);
      attestAdmittedRelease(p.dataRelease, p.dataAdmissionSha256);
      const dataSpec = renderCompose({ blue: p.blue, green: p.green, dataRelease: p.dataRelease, activeSlot: p.targetSlot });
      for (const name of ['postgres', 'redis']) verifyContainer(docker(['inspect', `leetplus-${name}`], { json: true })[0], dataSpec.services[name], name);
      assertNoPending(p.operationId);
      const current = active();
      demand(canonical(current) === canonical(p.previous) ||
        (current?.operationId === p.operationId &&
          ((current.generation === p.generation + 1 && current.activeSlot === p.targetSlot) ||
            (current.generation === p.generation + 2 && current.activeSlot === p.previous?.activeSlot && current.outcome === 'ROLLED_BACK'))),
      'Active generation drift');
      if (p.workerContinuation?.contract === WORKER_CONTINUATION_V2) {
        const continuation = workerContinuationArguments(p, dir, current);
        const phaseState = await storeFor(dir).read();
        const interruptedCutover = phaseState.records.CUTOVER?.intent && !phaseState.records.CUTOVER?.receipt;
        const interruptedPostcheck = phaseState.records.POSTCHECK?.intent && !phaseState.records.POSTCHECK?.receipt;
        if (canonical(current) === canonical(p.previous) && !interruptedCutover) await preflightWorkerContinuation(continuation);
        else if (interruptedCutover) demand(fs.existsSync(`${dir}/worker-continuation.intent.json`),
          'Interrupted cutover lacks worker continuation intent');
        else if (interruptedPostcheck || phaseState.records.POSTCHECK?.receipt || fs.existsSync(`${dir}/rollback.intent.json`)) {
          demand(fs.existsSync(`${dir}/worker-continuation.intent.json`), 'Accepted cutover lacks worker continuation intent');
        } else demand(false, 'Worker continuation state is not tied to a native phase');
      }
      if (p.contract !== APP_ONLY_PLAN) {
        const inbox = `${ROOT}/inbox/${p[p.targetSlot].releaseSha}`;
        demand(digest(safeFile(`${inbox}/docker-admission.json`)) === p.admissionSha256, 'Admission drift');
        const a = readJSON(`${inbox}/docker-admission.json`);
        demand(a.contract === `${CONTRACT}_ADMISSION` && a.decision === 'PASS' && a.releaseSha === p[p.targetSlot].releaseSha && a.archiveSha256 === p.archiveSha256 && a.repository === 'boozik3412/leetplus' && a.ref === 'refs/heads/main' && a.event === 'push', 'Artifact is not a deployable exact-main handoff');
      }
      for (const [name, hash] of [['backup', p.backupReceiptSha256], ['rehearsal', p.rehearsalReceiptSha256], ...(p.action === 'BOOTSTRAP' ? [['migration', p.migrationReceiptSha256]] : [])]) {
        const receipt = safeFile(`${dir}/${name}.json`, { immutable: true });
        demand(digest(receipt) === hash, `${name} evidence changed`);
        const value = JSON.parse(receipt);
        demand(value.decision === 'PASS' && value.releaseSha === p[p.targetSlot].releaseSha, `${name} did not accept this release`);
        if (name === 'rehearsal' && p[p.targetSlot].apiResourceProfile) {
          verifyResourceAcceptance(value, p[p.targetSlot]);
        }
        if (name === 'migration') demand(value.sourceFenced === true && value.targetPromoted === true && value.finalLsnReplayed === true, 'Migration does not establish a single writer');
      }
    },
    run: async function (phase, p) {
      const bound = { phase, planSha256: digest(p) };
      const spec = renderCompose({ blue: p.blue, green: p.green, dataRelease: p.dataRelease, activeSlot: p.targetSlot });
      if (phase === 'HYDRATE') {
        const archive = p.contract === APP_ONLY_PLAN
          ? `${appOnlyRoot(p[p.targetSlot].releaseSha)}/bundle/app-images.tar.gz`
          : `${ROOT}/inbox/${p[p.targetSlot].releaseSha}/images.tar.gz`;
        // A bounded stream hash avoids loading the image archive into Node RAM.
        const hash = run('/usr/bin/sha256sum', ['--', archive]).split(/\s/)[0];
        demand(hash === p.archiveSha256, 'Image archive checksum mismatch');
        docker(['load', '--input', archive], { timeout: 600000 });
        for (const image of Object.values(p[p.targetSlot].images)) demand(docker(['image', 'inspect', '--format', '{{.Id}}', image]) === image, 'Loaded image ID mismatch');
        return { ...bound, images: p[p.targetSlot].images };
      }
      if (phase === 'BIND') {
        const resourceBudget = p[p.targetSlot].apiResourceProfile ? requireResourceBudget(spec, docker) : null;
        publish(`${dir}/target-fence.json`, { planSha256: digest(p), slot: p.targetSlot });
        if (fs.existsSync(`${ROOT}/compose.json`)) compose(['stop', `api-${p.targetSlot}`, `web-${p.targetSlot}`]);
        replace(`${ROOT}/compose.json`, canonical(spec));
        compose(['up', '--no-start', '--no-deps', '--force-recreate', `api-${p.targetSlot}`, `web-${p.targetSlot}`]);
        for (const role of ['api', 'web']) demand(docker(['inspect', '--format', '{{.State.Running}}', `leetplus-${role}-${p.targetSlot}`]) === 'false', 'Target did not stop');
        return { ...bound, composeSha256: digest(spec), slot: p.targetSlot, ...(resourceBudget ? { resourceBudget } : {}) };
      }
      if (phase === 'SMOKE') {
        const resourceBudget = p[p.targetSlot].apiResourceProfile ? requireResourceBudget(spec, docker) : null;
        compose(['up', '--detach', '--no-deps', `api-${p.targetSlot}`, `web-${p.targetSlot}`]);
        const deadline = Date.now() + 120000;
        let observed;
        do {
          try { observed = probeSlot(p, p.targetSlot); break; } catch { await new Promise(resolve => setTimeout(resolve, 1500)); }
        } while (Date.now() < deadline);
        demand(observed, 'Target did not become healthy before deadline');
        return { ...bound, observed, authenticated: authenticatedSmoke(p.targetSlot), ...(resourceBudget ? { resourceBudget } : {}) };
      }
      if (phase === 'CUTOVER') {
        probeSlot(p, p.targetSlot); authenticatedSmoke(p.targetSlot);
        if (p.previous) { demand(acceptedLink(p.previous.activeSlot) || acceptedLink(p.targetSlot), 'Unexpected nginx link'); probeSlot(p, p.previous.activeSlot); }
        const continuation = p.workerContinuation?.contract === WORKER_CONTINUATION_V2 ? workerContinuationArguments(p, dir) : null;
        if (continuation) {
          try {
            const begun = await beginWorkerContinuation(continuation);
            demand(begun.decision === 'WORKER_CONTINUATION_BEGUN', 'Worker continuation is already terminal before CUTOVER');
          } catch (error) {
            const lifecycle = await continuation.adapters.readLifecycle();
            if (lifecycle.intent && !lifecycle.abortReceipt && acceptedLink(p.previous.activeSlot) &&
              canonical(active()) === canonical(p.previous)) {
              await abortUncommittedWorkerContinuation(workerContinuationArguments(p, dir));
            }
            throw error;
          }
        }
        try {
          switchLink(p.targetSlot);
          run('/usr/sbin/nginx', ['-t']); run('/usr/bin/systemctl', ['reload', 'nginx']);
          for (let sample = 0; sample < 3; sample++) { probeSlot(p, p.targetSlot); await new Promise(resolve => setTimeout(resolve, 1000)); }
        } catch (error) {
          if (p.previous) {
            switchLink(p.previous.activeSlot); run('/usr/sbin/nginx', ['-t']); run('/usr/bin/systemctl', ['reload', 'nginx']);
            if (continuation) await abortUncommittedWorkerContinuation(workerContinuationArguments(p, dir));
          }
          throw error;
        }
        const current = { operationId: p.operationId, generation: p.generation + 1, activeSlot: p.targetSlot, blue: p.blue, green: p.green, dataRelease: p.dataRelease, dataAdmissionSha256: p.dataAdmissionSha256, planSha256: digest(p) };
        replace(`${STATE}/active.json`, canonical(current));
        if (continuation) await bindForwardWorkerContinuation(workerContinuationArguments(p, dir, current));
        return { ...bound, generation: current.generation, slot: current.activeSlot,
          ...(continuation ? { workerContinuationIntentSha256: digest((await continuation.adapters.readLifecycle()).intent) } : {}) };
      }
      demand(phase === 'POSTCHECK', 'Unknown phase');
      demand(acceptedLink(p.targetSlot) && active()?.operationId === p.operationId, 'Cutover is not accepted');
      try {
        const ready = JSON.parse(http('https://api.leetplus.ru/health/ready', { resolve: 'api.leetplus.ru:443:127.0.0.1' }));
        const web = JSON.parse(http('https://leetplus.ru/api/release-identity', { resolve: 'leetplus.ru:443:127.0.0.1' }));
        demand(ready.release?.sha === p[p.targetSlot].releaseSha && web.release?.sha === p[p.targetSlot].releaseSha, 'Nginx TLS/SNI readiness mismatch');
        const authenticated = authenticatedSmoke(p.targetSlot);
        const continuation = p.workerContinuation?.contract === WORKER_CONTINUATION_V2 ? workerContinuationArguments(p, dir) : null;
        const workerReceipt = continuation ? await completeWorkerContinuation(continuation) : null;
        return { ...bound, slot: p.targetSlot, generation: p.generation + 1, authenticated,
          ...(workerReceipt ? { workerContinuationReceiptSha256: digest(workerReceipt) } : {}),
          ...await externalContinuationEvidence(p, dir) };
      } catch (error) {
        if (p.previous) await rollbackAfterPostcheck(p, dir);
        throw error;
      }
    },
  };
  const bound = p => ({ phase: 'BIND', planSha256: digest(p) });
  const stoppedTarget = (p, spec, name) => {
    const service = spec.services[name], item = docker(['inspect', service.container_name], { json: true })[0];
    demand(item.State.Running === false, 'BIND target unexpectedly running before its receipt');
    const imageEnvironment = docker(['image', 'inspect', service.image], { json: true })[0].Config.Env;
    verifyContainer(item, service, name, { imageEnvironment, configurationOnly: true });
  };
  const observePhase = createReadOnlyPhaseReconciler({
    readState: () => storeFor(dir).read(),
    observers: {
      HYDRATE: async (p, evidence) => {
        const images = p[p.targetSlot].images;
        for (const image of Object.values(images)) demand(docker(['image', 'inspect', '--format', '{{.Id}}', image]) === image, 'Hydrated image ID mismatch');
        if (evidence) {
          demand(canonical(evidence.images) === canonical(images), 'HYDRATE evidence image drift');
          return evidence;
        }
        return { phase: 'HYDRATE', planSha256: digest(p), images };
      },
      BIND: async (p, evidence) => {
        const spec = renderCompose({ blue: p.blue, green: p.green, dataRelease: p.dataRelease, activeSlot: p.targetSlot });
        const live = {
          plan: p,
          spec,
          evidence: evidence ?? { ...bound(p), composeSha256: digest(spec), slot: p.targetSlot },
          composeSha256: digest(safeFile(`${ROOT}/compose.json`)),
          fence: readJSON(`${dir}/target-fence.json`, { immutable: true }),
          assertStoppedConfiguration: name => stoppedTarget(p, spec, name),
        };
        if (!evidence) demand(!p[p.targetSlot].apiResourceProfile, 'BIND intent without durable resource evidence is ambiguous');
        return reconcileBoundEvidence(live);
      },
      SMOKE: async (p, evidence) => {
        demand(evidence, 'SMOKE intent without durable evidence is ambiguous');
        const observed = probeSlot(p, p.targetSlot);
        demand(canonical(observed) === canonical(evidence.observed), 'Smoke identity changed after evidence publication');
        return evidence;
      },
      CUTOVER: async (p, evidence) => {
        const current = active();
        demand(current?.operationId === p.operationId && current.planSha256 === digest(p) &&
          current.generation === p.generation + 1 && current.activeSlot === p.targetSlot,
        'CUTOVER intent does not have an accepted active postimage');
        demand(acceptedLink(p.targetSlot), 'Committed cutover link drift');
        probeSlot(p, p.targetSlot);
        let workerIntentSha256;
        if (p.workerContinuation?.contract === WORKER_CONTINUATION_V2) {
          const args = workerContinuationArguments(p, dir, current);
          const lifecycle = await args.adapters.readLifecycle();
          demand(lifecycle.intent?.operationId === p.operationId && lifecycle.intent.planSha256 === digest(p) &&
            lifecycle.intent.policySha256 === digest(p.workerContinuation) && !lifecycle.abortReceipt,
          'CUTOVER worker continuation intent is absent or drifted');
          validateForwardWorkerContinuation(p.workerContinuation,
            await Promise.all(WORKERS.map(worker => args.adapters.readGrant(worker))), args.context);
          for (const binding of p.workerContinuation.originalTimers) {
            const timer = await args.adapters.readTimer(binding.unit);
            demand(!timer.active && timer.enabled === binding.enabled, 'CUTOVER worker timer postimage drift');
          }
          workerIntentSha256 = digest(lifecycle.intent);
        }
        const observed = { phase: 'CUTOVER', planSha256: digest(p), generation: current.generation, slot: current.activeSlot,
          ...(workerIntentSha256 ? { workerContinuationIntentSha256: workerIntentSha256 } : {}) };
        if (evidence) {
          demand(canonical(evidence) === canonical(observed), 'CUTOVER evidence drift');
          return evidence;
        }
        return observed;
      },
      POSTCHECK: async (p, evidence) => {
        demand(evidence, 'POSTCHECK intent without durable evidence is ambiguous');
        const current = active();
        if (current?.operationId === p.operationId && current.generation === p.generation + 2 &&
          current.activeSlot === p.previous?.activeSlot && current.outcome === 'ROLLED_BACK') {
          const terminal = await storeFor(dir).read();
          demand(terminal.rolledBack?.workerContinuationReceiptSha256,
            'POSTCHECK rollback has no terminal worker continuation receipt');
          return evidence;
        }
        demand(acceptedLink(p.targetSlot) && current?.operationId === p.operationId && current.planSha256 === digest(p) &&
          current.generation === p.generation + 1 && current.activeSlot === p.targetSlot,
        'POSTCHECK intent does not have an accepted cutover postimage');
        const ready = JSON.parse(http('https://api.leetplus.ru/health/ready', { resolve: 'api.leetplus.ru:443:127.0.0.1' }));
        const web = JSON.parse(http('https://leetplus.ru/api/release-identity', { resolve: 'leetplus.ru:443:127.0.0.1' }));
        demand(ready.release?.sha === p[p.targetSlot].releaseSha && web.release?.sha === p[p.targetSlot].releaseSha, 'Nginx TLS/SNI readiness mismatch');
        demand(evidence.slot === p.targetSlot && evidence.generation === p.generation + 1, 'POSTCHECK evidence drift');
        if (p.workerContinuation?.contract === WORKER_CONTINUATION_V2) {
          const receipt = await acceptedWorkerContinuation(workerContinuationArguments(p, dir, current), 'FORWARD');
          demand(evidence.workerContinuationReceiptSha256 === digest(receipt), 'POSTCHECK worker continuation receipt drift');
        }
        return evidence;
      },
    },
  });
  driver.reconcile = async (phase, plan, { effectsAllowed = false } = {}) => {
    if (plan.workerContinuation?.contract !== WORKER_CONTINUATION_V2 || !['CUTOVER', 'POSTCHECK'].includes(phase)) {
      return observePhase(phase, plan);
    }
    const current = active(), state = await storeFor(dir).read();
    demand(state.records[phase]?.intent && !state.records[phase]?.receipt,
      `${phase} reconciliation requires an unfinished exact intent`);
    if (phase === 'POSTCHECK') {
      if (fs.existsSync(`${dir}/rollback.intent.json`)) {
        const terminal = await resumeRollbackAfterPostcheck(plan, dir, { effectsAllowed });
        demand(terminal?.workerContinuationReceiptSha256, 'Rollback continuation is not terminal');
        return { phase, planSha256: digest(plan), rolledBack: true };
      }
      if (current?.operationId === plan.operationId && current.generation === plan.generation + 2 &&
        current.activeSlot === plan.previous.activeSlot && current.outcome === 'ROLLED_BACK') {
        if (effectsAllowed) await finishRollbackWorkerContinuation(plan, dir, current);
        const after = await storeFor(dir).read();
        demand(after.rolledBack?.workerContinuationReceiptSha256, 'Pending rollback is not terminally accepted');
        return { phase, planSha256: digest(plan), rolledBack: true };
      }
      demand(current?.operationId === plan.operationId && current.generation === plan.generation + 1 &&
        current.activeSlot === plan.targetSlot, 'POSTCHECK active state is ambiguous');
      demand(acceptedLink(plan.targetSlot), 'POSTCHECK routing link differs from target before worker recovery');
      probeSlot(plan, plan.targetSlot);
      const preReady = JSON.parse(http('https://api.leetplus.ru/health/ready', { resolve: 'api.leetplus.ru:443:127.0.0.1' }));
      const preWeb = JSON.parse(http('https://leetplus.ru/api/release-identity', { resolve: 'leetplus.ru:443:127.0.0.1' }));
      demand(preReady.release?.sha === plan[plan.targetSlot].releaseSha &&
        preWeb.release?.sha === plan[plan.targetSlot].releaseSha,
      'POSTCHECK public identity differs from target before worker recovery');
      if (effectsAllowed) {
        const args = workerContinuationArguments(plan, dir, current), lifecycle = await args.adapters.readLifecycle();
        const externalMissing = args.external && !await args.external.adapters.readLifecycle('external-worker-complete.json');
        if ((!lifecycle.receipt || externalMissing) && !lifecycle.rollbackIntent) await completeWorkerContinuation(args);
      }
      const args = workerContinuationArguments(plan, dir, current);
      const receipt = await acceptedWorkerContinuation(args, 'FORWARD');
      const ready = JSON.parse(http('https://api.leetplus.ru/health/ready', { resolve: 'api.leetplus.ru:443:127.0.0.1' }));
      const web = JSON.parse(http('https://leetplus.ru/api/release-identity', { resolve: 'leetplus.ru:443:127.0.0.1' }));
      demand(ready.release?.sha === plan[plan.targetSlot].releaseSha && web.release?.sha === plan[plan.targetSlot].releaseSha,
        'POSTCHECK public identity drift during reconciliation');
      const evidence = state.records.POSTCHECK.evidence;
      if (!evidence) {
        demand(effectsAllowed, 'POSTCHECK acceptance evidence is absent after authorization expiry');
        const authenticated = authenticatedSmoke(plan.targetSlot);
        return { phase, planSha256: digest(plan), slot: plan.targetSlot, generation: plan.generation + 1,
          authenticated, workerContinuationReceiptSha256: digest(receipt),
          ...await externalContinuationEvidence(plan, dir),
          reconciliationBasis: 'FRESH_BOUNDED_AUTHENTICATED_READ_AFTER_LOST_RESPONSE' };
      }
      demand(evidence.workerContinuationReceiptSha256 === digest(receipt), 'POSTCHECK worker evidence drift');
      if (plan.workerSetV3) demand(evidence.externalWorkerContinuationReceiptSha256 === (await externalContinuationEvidence(plan, dir)).externalWorkerContinuationReceiptSha256,
        'POSTCHECK external worker evidence drift');
      return observePhase(phase, plan);
    }
    if (canonical(current) === canonical(plan.previous)) {
      if (effectsAllowed) {
        const args = workerContinuationArguments(plan, dir, current), lifecycle = await args.adapters.readLifecycle();
        demand(acceptedLink(plan.previous.activeSlot),
          'Partial CUTOVER routing differs from active state; manual incident recovery required');
        if (lifecycle.intent && !lifecycle.abortReceipt) await abortUncommittedWorkerContinuation(args);
      }
      demand(false, 'CUTOVER was not committed; original timer state must be reviewed before a new plan');
    }
    demand(current?.operationId === plan.operationId && current.generation === plan.generation + 1 &&
      current.activeSlot === plan.targetSlot, 'CUTOVER active state is ambiguous');
    demand(acceptedLink(plan.targetSlot), 'CUTOVER routing link differs from target before worker recovery');
    probeSlot(plan, plan.targetSlot);
    const preReady = JSON.parse(http('https://api.leetplus.ru/health/ready', { resolve: 'api.leetplus.ru:443:127.0.0.1' }));
    const preWeb = JSON.parse(http('https://leetplus.ru/api/release-identity', { resolve: 'leetplus.ru:443:127.0.0.1' }));
    demand(preReady.release?.sha === plan[plan.targetSlot].releaseSha &&
      preWeb.release?.sha === plan[plan.targetSlot].releaseSha,
    'CUTOVER public identity differs from target before worker recovery');
    if (effectsAllowed) {
      const args = workerContinuationArguments(plan, dir, current);
      const lifecycle = await args.adapters.readLifecycle();
      if (!lifecycle.receipt) await bindForwardWorkerContinuation(args);
    }
    return observePhase(phase, plan);
  };
  return driver;
}

if (command === 'help' || !command) {
  console.log('leetplus-compose status | prepare|prepare-app-only --request <root-owned.json> | apply|resume --operation <uuid> --approval <root-owned.json>');
} else {
  demand(process.platform === 'linux' && process.getuid() === 0 && process.versions.node.split('.')[0] === '22', 'Linux root and Node 22 required');
  demand(process.env.LEETPLUS_COMPOSE_LOCKED === '1', 'Use the installed flock bootstrap');
  const lockInfo = fs.lstatSync(`${STATE}/control.lock`);
  const locks = fs.readFileSync('/proc/locks', 'utf8').split('\n');
  const lockPolicy = controlLockPolicy(command, options);
  const parentStatus = lockPolicy.singleton ? fs.readFileSync(`/proc/${process.ppid}/status`, 'utf8') : '';
  if (command === 'external-worker-cleanup') verifyExternalCleanupSingletonLock({
    singletonLock: fs.lstatSync(`${STATE}/langame-external-daily-worker.lock`), locks, parentPid: process.ppid });
  else verifyKernelControlLocks(lockPolicy, { globalLock: lockInfo, singletonLock: lockPolicy.singleton ? fs.lstatSync(`${STATE}/${lockPolicy.singleton}.lock`) : undefined, locks, parentPid: process.ppid, outerPid: parentStatus.match(/^PPid:\s+(\d+)$/m)?.[1] });
  directory(STATE); directory(`${STATE}/operations`);
  installedDigest();
  if (lockPolicy.mode === 'WRITE' && command !== 'external-worker-cleanup') {
    const externalRunning = docker(['ps', '--filter', 'name=^/leetplus-langame-external-daily-worker$', '--format', '{{.ID}}']);
    demand(!externalRunning, 'A running external container must be cleaned before any global control writer effect');
  }
  const observational = command === 'status' || (command === 'network' && ['refresh', 'status', 'verify', 'verify-rehearsal'].includes(options.operation));
  if (!observational) {
    const handoffPending = fs.existsSync(`${STATE}/control-handoff.pending.json`);
    if (handoffPending && (['prepare', 'prepare-app-only', 'apply', 'resume'].includes(command) || command === 'network')) {
      demand(command === 'network' && options.operation === 'install', 'Controller handoff must be reconciled before other control effects');
      // Only the existing systemd boot unit may restore its accepted firewall
      // during provisional lifecycle. A manual CLI has no such network grant.
      const current = active();
      demand(current, 'Pending network boot requires an accepted application');
      const dir = operation(current.operationId);
      validatePendingNetworkBootAuthority({ cgroup: fs.readFileSync('/proc/self/cgroup', 'utf8'), active: current,
        publicKey: safeFile('/etc/leetplus-compose/approval-root.pem'),
        histories: [{ plan: readJSON(`${dir}/plan.json`, { immutable: true }), approval: readJSON(`${dir}/approval.json`, { immutable: true }), ...await storeFor(dir).read() }] });
    }
    if (command !== 'external-worker-cleanup') assertControllerContinuity();
  } else if (command === 'network' && options.operation === 'refresh') {
    // A pending handoff must not let provider addresses expire, but a queued
    // obsolete controller may not act after a newer atomic pointer switch.
    demand(fs.realpathSync('/usr/local/sbin/leetplus-compose') === `${CONTROL}/control.sh`, 'Refresh must use the currently serving controller');
  }
  if (command === 'status') {
    const operations = [];
    for (const id of fs.readdirSync(`${STATE}/operations`)) {
      const dir = operation(id), plan = readJSON(`${dir}/plan.json`, { immutable: true }), state = await storeFor(dir).read();
      validatePlan(plan); validateChain(plan, state.records);
      operations.push({ operationId: id, targetSlot: plan.targetSlot, completed: Boolean(state.final), rolledBack: Boolean(state.rolledBack), phases: Object.keys(state.records) });
    }
    console.log(canonical({ active: active(), operations, controller: { releaseSha: path.basename(CONTROL), manifestSha256: installedDigest(), isServing: fs.realpathSync('/usr/local/sbin/leetplus-compose') === `${CONTROL}/control.sh`, handoffPending: fs.existsSync(`${STATE}/control-handoff.pending.json`), preparationEvidenceExpiryEnforced: true, appOnlyV2BaselineCertification: true } }));
  } else if (command === 'network') {
    demand(Object.keys(options).length === 1 && Object.hasOwn(options, 'operation'), 'Exact network operation required');
    demand(['install', 'refresh', 'verify', 'status', 'install-rehearsal', 'verify-rehearsal'].includes(options.operation), 'Unknown network operation');
    console.log(run('/usr/bin/python3', [`${CONTROL}/network-fence.py`, options.operation]));
  } else if (command === 'backup') {
    console.log(run('/usr/bin/python3', [`${CONTROL}/daily-backup.py`], { timeout: 3600000 }));
  } else if (command === 'external-worker-root-enroll') {
    demand(Object.keys(options).sort().join(',') === ['approval', 'public'].join(','), 'Exact external worker public-root enrollment inputs required');
    assertNoPending();
    const publicPem = safeFile(options.public, { limit: 65536 }), envelope = readJSON(options.approval);
    const deploymentPublicPem = safeFile('/etc/leetplus-compose/approval-root.pem');
    const observed = { envelope, publicPem, deploymentPublicPem, hostIdentitySha256: hostIdentity() };
    const root = `${STATE}/external-worker-root`;
    if (fs.existsSync(`${root}/receipt.json`)) {
      const receipt = canonicalPrivateJSON(`${root}/receipt.json`);
      demand(fs.existsSync(EXTERNAL_WORKER_PUBLIC_ROOT_PATH) &&
        safeFile(EXTERNAL_WORKER_PUBLIC_ROOT_PATH).equals(publicPem), 'External root terminal postimage drift');
      validateExternalWorkerRootAuthority({ ...observed, receipt,
        intent: canonicalPrivateJSON(`${root}/intent.json`),
        recoveryEnvelope: receipt.recoveryEnvelopeSha256 ? canonicalPrivateJSON(`${root}/recovery-${receipt.recoveryOperationId}.json`) : null });
      console.log(canonical(receipt));
    } else {
      validateExternalWorkerRootEnrollment(observed);
      let publicationRoot = root;
      if (fs.existsSync(root)) {
        demand(fs.readdirSync(root).every(leaf => ['approval.json', 'public.pem', 'intent.json'].includes(leaf)),
          'External root enrollment has an unknown partial record');
        if (fs.existsSync(`${root}/approval.json`)) demand(canonical(canonicalPrivateJSON(`${root}/approval.json`)) === canonical(envelope), 'External root approval intent drift');
        if (fs.existsSync(`${root}/public.pem`)) demand(safeFile(`${root}/public.pem`, { immutable: true }).equals(publicPem), 'External root public intent drift');
      } else {
        demand(!fs.existsSync(EXTERNAL_WORKER_PUBLIC_ROOT_PATH), 'External root origin is occupied');
        const retirementRoot = `${STATE}/external-worker-root-retirements`;
        if (fs.existsSync(retirementRoot)) for (const id of fs.readdirSync(retirementRoot)) {
          demand(/^[a-f0-9-]{36}$/.test(id) && fs.existsSync(`${retirementRoot}/${id}/retirement.json`),
            'Unfinished external public-root retirement blocks new enrollment');
        }
        publicationRoot = `${STATE}/external-worker-root-staging-${envelope.statement.operationId}`;
        directory(publicationRoot);
      }
      publish(`${publicationRoot}/approval.json`, envelope);
      publishPrivateBytes(`${publicationRoot}/public.pem`, publicPem);
      publish(`${publicationRoot}/intent.json`, externalWorkerRootIntent(observed));
      if (publicationRoot !== root) {
        demand(!fs.existsSync(root) && fs.readdirSync(publicationRoot).sort().join(',') ===
          ['approval.json', 'intent.json', 'public.pem'].sort().join(','), 'Public-root staged intent inventory drift');
        fs.renameSync(publicationRoot, root); syncDir(STATE);
      }
      validateExternalWorkerRootEnrollment(observed);
      if (fs.existsSync(EXTERNAL_WORKER_PUBLIC_ROOT_PATH)) demand(safeFile(EXTERNAL_WORKER_PUBLIC_ROOT_PATH).equals(publicPem), 'External public-root CAS postimage drift');
      else replaceOwned(EXTERNAL_WORKER_PUBLIC_ROOT_PATH, publicPem, { mode: 0o444, gid: 0 });
      demand(safeFile(EXTERNAL_WORKER_PUBLIC_ROOT_PATH).equals(publicPem), 'External public root did not reach exact postimage');
      const installed = fs.lstatSync(EXTERNAL_WORKER_PUBLIC_ROOT_PATH);
      demand(installed.isFile() && !installed.isSymbolicLink() && installed.uid === 0 && installed.nlink === 1 &&
        (installed.mode & 0o777) === 0o444, 'External public root file identity drift');
      validateExternalWorkerRootEnrollment(observed);
      const receipt = { contract: `${EXTERNAL_WORKER_ROOT_CONTRACT}_RECEIPT`, decision: 'PUBLIC_ONLY_ENROLLED',
        operationId: envelope.statement.operationId, envelopeSha256: digest(envelope),
        publicDerSha256: digest(externalWorkerRootDer(publicPem)), acceptedAt: new Date().toISOString() };
      validateExternalWorkerRootAuthority({ ...observed, receipt, intent: externalWorkerRootIntent(observed) });
      publish(`${root}/receipt.json`, receipt);
      console.log(canonical(receipt));
    }
  } else if (command === 'external-worker-root-recover') {
    demand(Object.keys(options).sort().join(',') === 'approval', 'Exact public-root recovery approval path required');
    const root = `${STATE}/external-worker-root`;
    const recoveryEnvelope = readJSON(options.approval);
    const retirementRoot = `${STATE}/external-worker-root-retirements`;
    const deploymentPublicPem = safeFile('/etc/leetplus-compose/approval-root.pem');
    const installedCurrent = fs.existsSync(EXTERNAL_WORKER_PUBLIC_ROOT_PATH) ? safeFile(EXTERNAL_WORKER_PUBLIC_ROOT_PATH) : null;
    if (fs.existsSync(`${root}/receipt.json`)) {
      const originalEnvelope = canonicalPrivateJSON(`${root}/approval.json`),
        originalIntent = canonicalPrivateJSON(`${root}/intent.json`),
        publicPem = safeFile(`${root}/public.pem`, { immutable: true }),
        receipt = canonicalPrivateJSON(`${root}/receipt.json`);
      demand(installedCurrent?.equals(publicPem) && receipt.recoveryEnvelopeSha256,
        'Recovered root terminal is missing exact installed bytes/permit');
      const recordedPermit = canonicalPrivateJSON(`${root}/recovery-${receipt.recoveryOperationId}.json`);
      validateExternalWorkerRootAuthority({ envelope: originalEnvelope, receipt, intent: originalIntent,
        recoveryEnvelope: recordedPermit, publicPem, deploymentPublicPem, hostIdentitySha256: hostIdentity() });
      if (digest(recoveryEnvelope) !== digest(recordedPermit))
        validateExternalWorkerRootRecovery({ originalEnvelope, recoveryEnvelope, intent: originalIntent,
          publicPem, deploymentPublicPem, hostIdentitySha256: hostIdentity(), installedPublicBytes: installedCurrent });
      console.log(canonical(receipt));
    } else {
    const retiredTerminals = !fs.existsSync(root) && fs.existsSync(retirementRoot) ? fs.readdirSync(retirementRoot).filter(id =>
      /^[a-f0-9-]{36}$/.test(id) && fs.existsSync(`${retirementRoot}/${id}/retirement.json`) &&
      fs.existsSync(`${retirementRoot}/${id}/approval.json`) &&
      canonicalPrivateJSON(`${retirementRoot}/${id}/approval.json`).statement.operationId === recoveryEnvelope?.statement?.originalOperationId) : [];
    demand(retiredTerminals.length <= 1, 'Conflicting external root retirement terminals');
    if (retiredTerminals.length === 1) {
      const retired = `${retirementRoot}/${retiredTerminals[0]}`,
        originalEnvelope = canonicalPrivateJSON(`${retired}/approval.json`),
        originalIntent = canonicalPrivateJSON(`${retired}/intent.json`),
        publicPem = safeFile(`${retired}/public.pem`, { immutable: true }),
        terminal = canonicalPrivateJSON(`${retired}/retirement.json`);
      demand(!installedCurrent && terminal.contract === `${EXTERNAL_WORKER_ROOT_CONTRACT}_RETIREMENT` &&
        terminal.decision === 'RETIRED_ABSENT' && terminal.originalOperationId === originalEnvelope.statement.operationId &&
        terminal.intentSha256 === digest(originalIntent) && /^[a-f0-9-]{36}$/.test(terminal.operationId ?? ''),
      'External root retirement terminal/postimage drift');
      const recordedPermit = canonicalPrivateJSON(`${retired}/recovery-${terminal.operationId}.json`);
      validateExternalWorkerRootRetirement({ envelope: originalEnvelope, intent: originalIntent,
        retirement: terminal, recoveryEnvelope: recordedPermit, publicPem, deploymentPublicPem,
        hostIdentitySha256: hostIdentity(), installedPublicBytes: null });
      if (digest(recoveryEnvelope) !== digest(recordedPermit))
        validateExternalWorkerRootRecovery({ originalEnvelope, recoveryEnvelope, intent: originalIntent,
          publicPem, deploymentPublicPem, hostIdentitySha256: hostIdentity(), installedPublicBytes: null });
      console.log(canonical(terminal));
    } else {
    let source = root, alreadyRetired = false;
    if (!fs.existsSync(root)) {
      const candidates = fs.existsSync(retirementRoot) ? fs.readdirSync(retirementRoot).filter(id =>
        /^[a-f0-9-]{36}$/.test(id) && fs.existsSync(`${retirementRoot}/${id}/approval.json`) &&
        !fs.existsSync(`${retirementRoot}/${id}/retirement.json`) &&
        canonicalPrivateJSON(`${retirementRoot}/${id}/approval.json`).statement.operationId === recoveryEnvelope?.statement?.originalOperationId) : [];
      demand(candidates.length === 1, 'External root retirement origin is absent or ambiguous');
      source = `${retirementRoot}/${candidates[0]}`; alreadyRetired = true;
    }
    demand(!fs.existsSync(`${source}/receipt.json`), 'External public root is not an unreceipted partial enrollment');
    const envelope = canonicalPrivateJSON(`${source}/approval.json`), intent = canonicalPrivateJSON(`${source}/intent.json`);
    const publicPem = safeFile(`${source}/public.pem`, { immutable: true });
    const installed = installedCurrent;
    demand(!installed || installed.equals(publicPem), 'Foreign external public root cannot be recovered');
    const recovery = validateExternalWorkerRootRecovery({ originalEnvelope: envelope, recoveryEnvelope, intent,
      publicPem, deploymentPublicPem, hostIdentitySha256: hostIdentity(), installedPublicBytes: installed });
    if (recovery.statement.action === 'RECOVER_INSTALLED') {
      demand(!alreadyRetired, 'Installed root cannot recover from a retired directory');
      demand(fs.readdirSync(root).every(leaf => ['approval.json', 'public.pem', 'intent.json'].includes(leaf) ||
        /^recovery-[a-f0-9-]{36}\.json$/.test(leaf)),
        'External root recovery has unknown state');
      publish(`${root}/recovery-${recovery.statement.operationId}.json`, recoveryEnvelope);
      const receipt = { contract: `${EXTERNAL_WORKER_ROOT_CONTRACT}_RECEIPT`, decision: 'PUBLIC_ONLY_ENROLLED',
        operationId: envelope.statement.operationId, envelopeSha256: digest(envelope),
        publicDerSha256: digest(externalWorkerRootDer(publicPem)),
        recoveryEnvelopeSha256: digest(recoveryEnvelope), recoveryOperationId: recovery.statement.operationId,
        acceptedAt: new Date().toISOString() };
      validateExternalWorkerRootAuthority({ envelope, receipt, intent, recoveryEnvelope, publicPem,
        deploymentPublicPem, hostIdentitySha256: hostIdentity() });
      publish(`${root}/receipt.json`, receipt);
      console.log(canonical(receipt));
    } else {
      demand(!installed, 'RETIRE_ABSENT cannot remove an installed public root');
      directory(retirementRoot);
      const retirementDir = alreadyRetired ? source : `${retirementRoot}/${recovery.statement.operationId}`;
      if (!alreadyRetired) {
        demand(fs.readdirSync(root).sort().join(',') === ['approval.json', 'intent.json', 'public.pem'].sort().join(','),
          'External root partial record changed before atomic retirement');
        demand(!fs.existsSync(retirementDir), 'External root retirement operation already exists');
        fs.renameSync(root, retirementDir); syncDir(STATE); syncDir(retirementRoot);
      }
      demand(fs.readdirSync(retirementDir).every(leaf => ['approval.json', 'public.pem', 'intent.json'].includes(leaf) ||
        /^recovery-[a-f0-9-]{36}\.json$/.test(leaf)), 'Retired external root contains foreign files');
      publish(`${retirementDir}/recovery-${recovery.statement.operationId}.json`, recoveryEnvelope);
      const retirement = { contract: `${EXTERNAL_WORKER_ROOT_CONTRACT}_RETIREMENT`, decision: 'RETIRED_ABSENT',
        operationId: recovery.statement.operationId, originalOperationId: envelope.statement.operationId,
        recoveryEnvelopeSha256: digest(recoveryEnvelope), intentSha256: digest(intent), retiredAt: new Date().toISOString() };
      validateExternalWorkerRootRetirement({ envelope, intent, retirement, recoveryEnvelope, publicPem,
        deploymentPublicPem, hostIdentitySha256: hostIdentity(), installedPublicBytes: null });
      publish(`${retirementDir}/retirement.json`, retirement);
      console.log(canonical(retirement));
    }
    }
    }
  } else if (command === 'external-worker-enroll') {
    demand(Object.keys(options).sort().join(',') === 'request', 'Exact root-owned external enrollment request required');
    assertNoPending();
    const request = readJSON(options.request);
    demand(request && Object.keys(request).sort().join(',') === ['plan', 'approvalEnvelope', 'grantEnvelope', 'secretFile'].sort().join(','),
      'External enrollment request fields are not exact');
    const plan = request.plan, current = active();
    demand(current && /^[a-f0-9-]{36}$/.test(plan?.operationId ?? ''), 'External enrollment needs an accepted native application');
    const activeDir = operation(current.operationId), activePlan = canonicalPrivateJSON(`${activeDir}/plan.json`);
    const history = await storeFor(activeDir).read();
    demand(current.planSha256 === digest(activePlan) &&
      (current.outcome === 'ROLLED_BACK' ? Boolean(history.rolledBack) : Boolean(history.final && history.records.POSTCHECK?.receipt)),
      'External enrollment cannot precede native app POSTCHECK');
    validateApproval(activePlan, canonicalPrivateJSON(`${activeDir}/approval.json`), safeFile('/etc/leetplus-compose/approval-root.pem'), { allowExpired: true });
    validateChain(activePlan, history.records);
    demand(activePlan.workerContinuation?.contract === WORKER_CONTINUATION_V2, 'External enrollment needs executable native worker history');
    await acceptedWorkerContinuation(workerContinuationArguments(activePlan, activeDir, current), current.outcome === 'ROLLED_BACK' ? 'ROLLBACK' : 'FORWARD');
    const root = `${STATE}/external-worker`, enrollmentRoot = `${root}/enrollments`, dir = `${enrollmentRoot}/${plan.operationId}`;
    const historicalIntent = fs.existsSync(`${dir}/intent.json`);
    const historicalReceipt = fs.existsSync(`${dir}/receipt.json`);
    const secretBytes = safeFile(request.secretFile, { limit: 65536 }), publicKey = externalWorkerPublicKey();
    const serviceUnitBytes = safeFile(`${CONTROL}/leetplus-compose-external-daily.service`), timerUnitBytes = safeFile(`${CONTROL}/leetplus-compose-external-daily.timer`);
    const networkPolicySha256 = digest(safeFile(`${CONTROL}/external-network-fence.py`));
    const canaryEvidence = enrolledCanaryEvidence(plan, serviceUnitBytes, timerUnitBytes, publicKey);
    const previous = plan.previousEnrollmentReceiptSha256 ? { pointer: { receiptSha256: digest(canaryEvidence.enrollmentReceipt) } } : null;
    const currentPointer = fs.existsSync(`${root}/enrollment.json`) ? canonicalPrivateJSON(`${root}/enrollment.json`) : null;
    demand(currentPointer?.receiptSha256 === plan.previousEnrollmentReceiptSha256 ||
      currentPointer === null && plan.previousEnrollmentReceiptSha256 === null ||
      historicalReceipt && currentPointer?.operationId === plan.operationId &&
        currentPointer.receiptSha256 === digest(safeFile(`${dir}/receipt.json`, { immutable: true })),
    'External enrollment previous/current pointer is not exact');
    const name = 'langame-external-daily-worker', secretPath = `${ROOT}/secrets/${name}.json`, grantPath = `${STATE}/worker-grants/${name}.json`,
      lockPath = `${STATE}/${name}.lock`, servicePath = '/etc/systemd/system/leetplus-compose-external-daily.service',
      timerPath = '/etc/systemd/system/leetplus-compose-external-daily.timer';
    const optionalDigest = file => fs.existsSync(file) ? digest(safeFile(file)) : null;
    const readNetworkState = () => {
      const file = `${STATE}/external-network-fence.json`;
      if (!fs.existsSync(file)) return 'ABSENT';
      const value = readJSON(file);
      demand(value.contract === 'LEETPLUS_LANGAME_EXTERNAL_NETWORK_V1' && ['INSTALLING', 'ACTIVE'].includes(value.state), 'External network lineage invalid');
      return value.state;
    };
    const readState = () => {
      if (fs.existsSync(lockPath)) {
        const stat = fs.lstatSync(lockPath);
        demand(stat.isFile() && !stat.isSymbolicLink() && stat.uid === 0 && stat.nlink === 1 && !(stat.mode & 0o077), 'External worker singleton lock drift');
      }
      return { lockPresent: fs.existsSync(lockPath), serviceUnitSha256: optionalDigest(servicePath), timerUnitSha256: optionalDigest(timerPath),
        networkState: readNetworkState(), secretSha256: optionalDigest(secretPath), grantEnvelopeSha256: optionalDigest(grantPath), timer: externalTimer() };
    };
    const preimageFile = `${dir}/preimage.json`, intentFile = `${dir}/intent.json`;
    const preimage = fs.existsSync(intentFile) ? canonicalPrivateJSON(preimageFile) : readState();
    if (!previous && !fs.existsSync(intentFile)) demand(!preimage.lockPresent && preimage.secretSha256 === null &&
      preimage.grantEnvelopeSha256 === null && preimage.serviceUnitSha256 === null && preimage.timerUnitSha256 === null &&
      preimage.networkState === 'ABSENT' && preimage.timer.loadState === 'not-found', 'External first enrollment origin is occupied');
    const context = { current, controllerManifestSha256: installedDigest(), hostIdentitySha256: hostIdentity(),
      secretBytes, grantEnvelope: request.grantEnvelope, serviceUnitBytes, timerUnitBytes, networkPolicySha256,
      previousEnrollmentReceiptSha256: previous?.pointer.receiptSha256 ?? null, canaryReceiptSha256: plan.canaryReceiptSha256,
      canaryEvidence, publicKey, now: Date.now(), preimage };
    validateExternalEnrollmentPlan(plan, { ...context, allowExpired: historicalIntent || historicalReceipt });
    validateExternalEnrollmentApproval(plan, request.approvalEnvelope, publicKey, Date.now(), { allowExpired: historicalIntent || historicalReceipt });
    directory(root); directory(enrollmentRoot); directory(dir);
    for (const [leaf, value] of [['plan.json', plan], ['approval.json', request.approvalEnvelope], ['grant.json', request.grantEnvelope],
      ['active.json', current], ['preimage.json', preimage], ['controller.json', canonicalPrivateJSON(`${CONTROL}/install-manifest.json`)]]) publish(`${dir}/${leaf}`, value);
    publishPrivateBytes(`${dir}/secret.json`, secretBytes);
    publishPrivateBytes(`${dir}/service.unit`, serviceUnitBytes);
    publishPrivateBytes(`${dir}/timer.unit`, timerUnitBytes);
    const opNames = { intent: 'intent.json', network: 'network.json', receipt: 'receipt.json' };
    const adapters = {
      now: Date.now,
      assertExclusiveLock: async () => verifyKernelControlLocks({ mode: 'WRITE', singleton: null }, {
        globalLock: fs.lstatSync(`${STATE}/control.lock`), locks: fs.readFileSync('/proc/locks', 'utf8'), parentPid: process.ppid }),
      readState: async () => readState(),
      readOp: async type => { demand(Object.hasOwn(opNames, type), 'Unknown enrollment read'); return fs.existsSync(`${dir}/${opNames[type]}`) ? canonicalPrivateJSON(`${dir}/${opNames[type]}`) : null; },
      publishOp: async (type, value) => { demand(Object.hasOwn(opNames, type), 'Unknown enrollment publication');
        if (type === 'receipt') publish(`${dir}/timer-state.json`, externalTimer()); publish(`${dir}/${opNames[type]}`, value); },
      installLockCAS: async expected => { demand(fs.existsSync(lockPath) === expected, 'External lock origin drift'); publishPrivateBytes(lockPath, Buffer.alloc(0)); },
      installUnitsCAS: async (before, after) => {
        demand(optionalDigest(servicePath) === before.service && optionalDigest(timerPath) === before.timer &&
          digest(serviceUnitBytes) === after.service && digest(timerUnitBytes) === after.timer, 'External unit CAS drift');
        if (!fs.existsSync(servicePath)) replaceOwned(servicePath, serviceUnitBytes, { mode: 0o644, gid: 0 });
        if (!fs.existsSync(timerPath)) replaceOwned(timerPath, timerUnitBytes, { mode: 0o644, gid: 0 });
        run('/usr/bin/systemctl', ['daemon-reload']);
      },
      installNetwork: async hash => {
        demand(networkPolicySha256 === hash, 'External network source changed');
        const output = run('/usr/bin/python3', [`${CONTROL}/external-network-fence.py`, 'install'], { json: true });
        validateExternalNetworkObservation(output); publish(`${dir}/network.json`, output);
      },
      writeSecretCAS: async (before, bytes) => { demand(optionalDigest(secretPath) === before && digest(bytes) === plan.secretSha256, 'External secret CAS drift');
        replaceOwned(secretPath, bytes, { mode: 0o440, gid: 12042 }); },
      writeGrantCAS: async (before, envelope) => { demand(optionalDigest(grantPath) === before && digest(envelope) === plan.grantEnvelopeSha256, 'External grant CAS drift');
        replace(grantPath, Buffer.from(canonical(envelope)), 0o400); },
      setTimer: async (before, after) => {
        demand(canonical(externalTimer()) === canonical(before), 'External enrollment timer origin drift');
        validateExternalEnrollmentApproval(plan, request.approvalEnvelope, publicKey);
        if (before.active && !after.active) run('/usr/bin/systemctl', ['stop', after.unit]);
        validateExternalEnrollmentApproval(plan, request.approvalEnvelope, publicKey);
        if (before.enabled !== after.enabled) run('/usr/bin/systemctl', [after.enabled ? 'enable' : 'disable', after.unit]);
        validateExternalEnrollmentApproval(plan, request.approvalEnvelope, publicKey);
        if (externalTimer().active !== after.active) run('/usr/bin/systemctl', [after.active ? 'start' : 'stop', after.unit]);
        demand(canonical(externalTimer()) === canonical(after), 'External enrollment timer effect did not persist');
      },
      publishPointer: async (id, receiptSha256) => {
        const pointer = { contract: `${ENROLLMENT_CONTRACT}_POINTER`, operationId: id, receiptSha256 };
        const file = `${root}/enrollment.json`, old = fs.existsSync(file) ? canonicalPrivateJSON(file) : null;
        demand(old === null && plan.previousEnrollmentReceiptSha256 === null || canonical(old) === canonical(pointer) ||
          old?.receiptSha256 === plan.previousEnrollmentReceiptSha256, 'External enrollment pointer CAS drift');
        replace(file, Buffer.from(canonical(pointer)), 0o400);
      },
    };
    console.log(canonical(await applyExternalEnrollment({ plan, approvalEnvelope: request.approvalEnvelope, context, adapters })));
  } else if (command === 'prepare-app-only') {
    demand(Object.keys(options).sort().join(',') === 'request', 'Exact app-only preparation request required');
    assertNoPending();
    const request = readJSON(options.request);
    demand(request?.contract === 'LEETPLUS_COMPOSE_APP_PREPARATION_V2' &&
      Object.keys(request).sort().join(',') === ['contract', 'releaseSha', 'targetSlot', 'preparationGuard',
        'workerContinuation', 'backupReceiptSha256', 'rehearsalReceiptSha256',
        'preparationEvidenceExpiresAt', ...(Object.hasOwn(request ?? {}, 'workerSetV3') ? ['workerSetV3'] : [])].sort().join(','), 'App-only request fields are not exact');
    demand(/^[a-f0-9]{40}$/.test(request.releaseSha ?? '') && ['blue', 'green'].includes(request.targetSlot) &&
      [request.backupReceiptSha256, request.rehearsalReceiptSha256].every(value => /^[a-f0-9]{64}$/.test(value ?? '')),
    'Invalid app-only request release/evidence binding');
    const previous = active(), now = Date.now();
    demand(previous && previous.activeSlot !== request.targetSlot &&
      Number.isFinite(Date.parse(request.preparationEvidenceExpiresAt)) &&
      Date.parse(request.preparationEvidenceExpiresAt) > now,
    'App-only preparation needs an existing active slot and fresh evidence window');
    const controlSha256 = installedDigest(), hostIdentitySha256 = hostIdentity();
    const guard = request.preparationGuard;
    demand(guard?.contract === 'LEETPLUS_PREPARATION_GUARD_V1' &&
      guard.hostIdentitySha256 === hostIdentitySha256 && guard.controllerManifestSha256 === controlSha256 &&
      guard.activeSha256 === digest(previous) && guard.generation === previous.generation &&
      guard.activeSlot === previous.activeSlot, 'App-only preparation guard drift');
    const root = appOnlyRoot(request.releaseSha);
    const bundleRaw = safeFile(`${root}/bundle/app-bundle.json`);
    const admissionRaw = safeFile(`${root}/app-admission.json`, { immutable: true });
    const bundle = validateAppBundle(JSON.parse(bundleRaw));
    const admission = validateAppAdmission(JSON.parse(admissionRaw));
    demand(bundle.releaseSha === request.releaseSha && admission.releaseSha === request.releaseSha &&
      admission.bundleManifestSha256 === digest(bundleRaw), 'App-only downloaded source/admission mismatch');
    const cert = collectInstalledCertificationCandidate({ bundle, admission, previous, now,
      ttlMs: Math.min(4 * 3600000, Date.parse(request.preparationEvidenceExpiresAt) - now) });
    demand(Date.parse(request.preparationEvidenceExpiresAt) <= Date.parse(cert.expiresAt),
      'Preparation cannot extend certified data baseline');
    const target = synthesizeRelease(bundle, cert.dataRelease), id = crypto.randomUUID();
    const plan = {
      contract: APP_ONLY_PLAN, operationId: id, action: 'ROLLOUT', generation: previous.generation,
      hostIdentitySha256, controlSha256, previous, targetSlot: request.targetSlot,
      blue: request.targetSlot === 'blue' ? target : previous.blue,
      green: request.targetSlot === 'green' ? target : previous.green,
      dataRelease: previous.dataRelease, dataAdmissionSha256: attestAdmittedRelease(previous.dataRelease, previous.dataAdmissionSha256),
      admissionSha256: digest(admissionRaw), archiveSha256: admission.appArchiveSha256,
      appAdmissionSha256: digest(admissionRaw), appArchiveSha256: admission.appArchiveSha256,
      dataBaselineCertificationSha256: digest(cert), dataBaselineExpiresAt: cert.expiresAt,
      releaseLane: 'L1_APP_ONLY', backupReceiptSha256: request.backupReceiptSha256,
      rehearsalReceiptSha256: request.rehearsalReceiptSha256,
      preparationGuard: guard, preparationEvidenceExpiresAt: request.preparationEvidenceExpiresAt,
      workerContinuation: request.workerContinuation,
      ...(Object.hasOwn(request, 'workerSetV3') ? { workerSetV3: request.workerSetV3 } : {}),
      secretDigests: Object.fromEntries(['acceptance.json', 'api-blue.json', 'api-green.json', 'db-ca.pem'].map(leaf => [leaf, digest(safeFile(`${ROOT}/secrets/${leaf}`))])),
      networkPolicySha256: digest(safeFile('/etc/leetplus-compose/providers.json')),
      databaseIdentitySha256: digest(databaseIdentity()),
    };
    const plannedCompose = renderCompose({ blue: plan.blue, green: plan.green, dataRelease: plan.dataRelease, activeSlot: plan.targetSlot });
    plan.composeSha256 = digest(plannedCompose);
    plan.resourceBudget = requireResourceBudget(plannedCompose, docker);
    validateAppOnlyPlan(plan, { bundle, admission, certification: cert,
      readinessReceiptSha256: cert.readinessReceiptSha256, now });
    const policy = plan.workerContinuation;
    const profiles = Object.fromEntries(WORKERS.map(worker => [worker, safeFile(`${ROOT}/secrets/${worker}.json`)]));
    validateCurrentWorkerContinuation(policy, WORKERS.map(worker => canonicalPrivateJSON(`${STATE}/worker-grants/${worker}.json`)), {
      publicKey: safeFile('/etc/leetplus-compose/approval-root.pem'), current: previous,
      hostIdentitySha256, profiles, now,
    });
    const externalProfile = validateExternalPreimage(plan, previous, profiles, now);
    for (const binding of policy.originalTimers) {
      const timer = workerTimer(binding.unit);
      demand(timer.enabled === binding.enabled && timer.active === binding.active,
        'Original worker timer state changed before app-only preparation');
    }
    const dir = operation(id);
    directory(`${STATE}/preparation-staging`);
    const stagedDir = `${STATE}/preparation-staging/${id}`;
    demand(!fs.existsSync(dir) && !fs.existsSync(stagedDir), 'App-only operation ID is not fresh');
    directory(stagedDir);
    publish(`${stagedDir}/app-bundle.json`, bundle);
    publish(`${stagedDir}/app-admission.json`, admission);
    publish(`${stagedDir}/data-baseline-certification.json`, cert);
    for (const binding of policy.profileBindings) {
      const bytes = safeFile(`${ROOT}/secrets/${binding.worker}.json`);
      demand(digest(bytes) === binding.profileSha256, 'Worker profile drift during app-only preparation');
      publishPrivateBytes(`${stagedDir}/worker-profile-${binding.worker}.json`, bytes);
    }
    if (externalProfile) publishPrivateBytes(`${stagedDir}/worker-profile-${plan.workerSetV3.external.worker}.json`, externalProfile);
    publish(`${stagedDir}/plan.json`, plan);
    fs.renameSync(stagedDir, dir);
    syncDir(`${STATE}/preparation-staging`); syncDir(`${STATE}/operations`);
    console.log(canonical({ decision: 'PREPARED_NOT_AUTHORIZATION', operationId: id,
      planSha256: digest(plan), planPath: `${dir}/plan.json` }));
  } else if (command === 'prepare') {
    assertNoPending();
    const request = readJSON(options.request);
    const previous = active(), id = crypto.randomUUID();
    const plan = { ...request, contract: `${CONTRACT}_PLAN`, operationId: id, hostIdentitySha256: hostIdentity(), controlSha256: installedDigest(), previous, generation: previous?.generation ?? 0, action: previous ? 'ROLLOUT' : 'BOOTSTRAP' };
    plan.dataRelease = previous ? previous.dataRelease : plan.blue;
    plan.dataAdmissionSha256 = attestAdmittedRelease(plan.dataRelease, previous?.dataAdmissionSha256);
    attestAdmittedRelease(plan[plan.targetSlot], plan.admissionSha256);
    plan.secretDigests = Object.fromEntries(['acceptance.json', 'api-blue.json', 'api-green.json', 'db-ca.pem'].map(leaf => [leaf, digest(safeFile(`${ROOT}/secrets/${leaf}`))]));
    plan.networkPolicySha256 = digest(safeFile('/etc/leetplus-compose/providers.json'));
    plan.databaseIdentitySha256 = digest(databaseIdentity());
    const plannedCompose = renderCompose({ blue: plan.blue, green: plan.green, dataRelease: plan.dataRelease, activeSlot: plan.targetSlot });
    plan.composeSha256 = digest(plannedCompose);
    if (plan[plan.targetSlot].apiResourceProfile) plan.resourceBudget = requireResourceBudget(plannedCompose, docker);
    if (plan.action === 'ROLLOUT') {
      demand(plan.workerContinuation?.contract === WORKER_CONTINUATION_V2,
        'New application preparation requires executable V2 worker continuation');
      const policy = plan.workerContinuation;
      const profiles = Object.fromEntries(WORKERS.map(worker => [worker, safeFile(`${ROOT}/secrets/${worker}.json`)]));
      validateCurrentWorkerContinuation(policy, WORKERS.map(worker => canonicalPrivateJSON(`${STATE}/worker-grants/${worker}.json`)), {
        publicKey: safeFile('/etc/leetplus-compose/approval-root.pem'), current: previous,
        hostIdentitySha256: plan.hostIdentitySha256, profiles, now: Date.now(),
      });
      validateExternalPreimage(plan, previous, profiles);
      for (const binding of policy.originalTimers) {
        const timer = workerTimer(binding.unit);
        demand(timer.enabled === binding.enabled && timer.active === binding.active,
          'Original worker timer state changed before native preparation');
      }
    }
    validatePlan(plan);
    const dir = operation(id);
    directory(`${STATE}/preparation-staging`);
    const stagedDir = `${STATE}/preparation-staging/${id}`;
    demand(!fs.existsSync(dir) && !fs.existsSync(stagedDir), 'Native preparation operation ID is not fresh');
    directory(stagedDir);
    if (plan.workerContinuation?.contract === WORKER_CONTINUATION_V2) {
      for (const binding of plan.workerContinuation.profileBindings) {
        const bytes = safeFile(`${ROOT}/secrets/${binding.worker}.json`);
        demand(digest(bytes) === binding.profileSha256, 'Worker profile drift during native preparation');
        publishPrivateBytes(`${stagedDir}/worker-profile-${binding.worker}.json`, bytes);
      }
    }
    if (plan.workerSetV3?.external.preimage === 'PRESENT') {
      const external = plan.workerSetV3.external;
      const bytes = safeFile(`${ROOT}/secrets/${external.worker}.json`);
      demand(digest(bytes) === external.profileSha256, 'External worker profile changed before native preparation');
      publishPrivateBytes(`${stagedDir}/worker-profile-${external.worker}.json`, bytes);
    }
    publish(`${stagedDir}/plan.json`, plan);
    fs.renameSync(stagedDir, dir);
    syncDir(`${STATE}/preparation-staging`); syncDir(`${STATE}/operations`);
    console.log(canonical({ decision: 'PREPARED_NOT_AUTHORIZATION', operationId: id, planSha256: digest(plan), planPath: `${dir}/plan.json` }));
  } else if (command === 'boot') {
    const current = active();
    if (!current) {
      console.log(canonical({ decision: 'NO_PRODUCTION_ACTIVATION', started: false }));
    } else {
      const dir = operation(current.operationId), plan = readJSON(`${dir}/plan.json`, { immutable: true });
      const history = await storeFor(dir).read();
      validatePlan(plan); validateChain(plan, history.records);
      validateApproval(plan, readJSON(`${dir}/approval.json`, { immutable: true }), safeFile('/etc/leetplus-compose/approval-root.pem'), { allowExpired: true });
      const accepted = current.outcome === 'ROLLED_BACK'
        ? history.rolledBack && canonical(history.rolledBack.active) === canonical(current) && plan.previous && current.generation === plan.generation + 2 && current.activeSlot === plan.previous.activeSlot
        : current.generation === plan.generation + 1 && current.activeSlot === plan.targetSlot && history.records.SMOKE?.receipt && history.records.CUTOVER?.intent;
      demand(current.planSha256 === digest(plan) && accepted && acceptedLink(current.activeSlot), 'No accepted routing authority for reboot');
      demand(canonical(current.dataRelease) === canonical(plan.dataRelease) && current.dataAdmissionSha256 === plan.dataAdmissionSha256, 'Accepted data baseline changed');
      attestAdmittedRelease(plan.dataRelease, plan.dataAdmissionSha256);
      run('/usr/bin/python3', [`${CONTROL}/network-fence.py`, 'verify']);
      assertPrimaryDatabase(plan.databaseIdentitySha256);
      const slot = current.activeSlot;
      demand(digest(safeFile(`${ROOT}/secrets/api-${slot}.json`)) === plan.secretDigests[`api-${slot}.json`] && digest(safeFile(`${ROOT}/secrets/db-ca.pem`)) === plan.secretDigests['db-ca.pem'], 'Accepted runtime secret identity drift');
      const spec = renderCompose({ blue: current.blue, green: current.green, dataRelease: current.dataRelease, activeSlot: slot });
      for (const role of ['api', 'web']) {
        const name = `${role}-${slot}`, service = spec.services[name];
        const item = docker(['inspect', service.container_name], { json: true })[0];
        // Configuration-only attestation is distinct from a live-state proof;
        // the real observed state is never rewritten to manufacture readiness.
        const imageEnvironment = docker(['image', 'inspect', service.image], { json: true })[0].Config.Env;
        verifyContainer(item, service, name, { imageEnvironment, configurationOnly: true });
        docker(['start', service.container_name]);
      }
      let ready = false;
      for (let attempt = 0; attempt < 60; attempt++) {
        try { probeSlot(plan, slot); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 1000)); }
      }
      demand(ready, 'Accepted runtime did not recover after restart');
      console.log(canonical({ decision: 'ACCEPTED_RUNTIME_RESTARTED', slot, generation: current.generation }));
    }
  } else if (command === 'worker-run') {
    const name = options.name;
    demand(['bonus-ledger-worker', 'langame-daily-worker'].includes(name), 'Unknown worker');
    const current = active();
    demand(current, 'No accepted active release');
    const activePlan = readJSON(`${operation(current.operationId)}/plan.json`, { immutable: true });
    demand(current.planSha256 === digest(activePlan), 'Worker active plan drift');
    if (activePlan.workerContinuation?.contract === WORKER_CONTINUATION_V2) {
      const dir = operation(current.operationId), history = await storeFor(dir).read();
      const mode = current.outcome === 'ROLLED_BACK' ? 'ROLLBACK' : 'FORWARD';
      demand(mode === 'ROLLBACK' ? Boolean(history.rolledBack) : Boolean(history.final && history.records.POSTCHECK?.receipt),
        'Worker continuation has no accepted native terminal history');
      const receipt = await acceptedWorkerContinuation(workerContinuationArguments(activePlan, dir, current), mode);
      const boundSha256 = mode === 'ROLLBACK' ? history.rolledBack.workerContinuationReceiptSha256
        : history.records.POSTCHECK.evidence.workerContinuationReceiptSha256;
      demand(boundSha256 === digest(receipt), 'Worker continuation is not bound to the accepted native receipt');
    }
    demand(canonical(current.dataRelease) === canonical(activePlan.dataRelease) && current.dataAdmissionSha256 === activePlan.dataAdmissionSha256, 'Worker data baseline drift');
    attestAdmittedRelease(activePlan.dataRelease, activePlan.dataAdmissionSha256);
    assertPrimaryDatabase(activePlan.databaseIdentitySha256);
    run('/usr/bin/python3', [`${CONTROL}/network-fence.py`, 'verify']);
    const secretBytes = safeFile(`${ROOT}/secrets/${name}.json`);
    const grant = validateWorkerGrant(readJSON(`${STATE}/worker-grants/${name}.json`, { immutable: true }), safeFile('/etc/leetplus-compose/approval-root.pem'), current, hostIdentity(), secretBytes);
    const key = grant.mode === 'CANARY' ? grant.id : crypto.randomUUID();
    const dir = `${STATE}/worker-runs`; directory(dir);
    demand(!fs.existsSync(`${dir}/${key}.intent.json`), 'Canary already attempted; reconcile its existing outcome');
    const spec = renderCompose({ blue: current.blue, green: current.green, dataRelease: current.dataRelease, activeSlot: current.activeSlot });
    // A prepared/inactive application slot must not stop the accepted worker.
    // Bind this tick to its own immutable accepted-state Compose document.
    const workerCompose = `${dir}/${key}.compose.json`;
    publish(workerCompose, spec);
    const existing = docker(['ps', '--all', '--filter', `name=^/leetplus-${name}$`, '--format', '{{.ID}}']);
    if (existing) {
      const prior = docker(['inspect', `leetplus-${name}`], { json: true })[0];
      demand(prior.Config.Labels?.['ru.leetplus.contract'] === CONTRACT && prior.Config.Labels?.['com.docker.compose.project'] === 'leetplus', 'Existing worker container is not owned by this project');
      demand(!prior.State.Running && prior.State.Pid === 0, 'A prior worker is still running; no overlapping tick allowed');
    }
    publish(`${dir}/${key}.intent.json`, { grantId: grant.id, activeGeneration: current.generation, releaseSha: grant.releaseSha, worker: name, startedAt: new Date().toISOString() });
    docker(['compose', '--project-name', 'leetplus', '--file', workerCompose, 'up', '--no-start', '--no-deps', '--force-recreate', name]);
    const service = spec.services[name];
    const imageEnvironment = docker(['image', 'inspect', service.image], { json: true })[0].Config.Env;
    verifyContainer(docker(['inspect', service.container_name], { json: true })[0], service, name, { beforeStart: true, imageEnvironment });
    const output = docker(['start', '--attach', service.container_name], { timeout: name === 'langame-daily-worker' ? 2700000 : 960000 });
    const observed = docker(['inspect', service.container_name], { json: true })[0];
    demand(!observed.State.Running && observed.State.ExitCode === 0, 'Worker did not finish successfully');
    const receipt = { grantId: grant.id, activeGeneration: current.generation, releaseSha: grant.releaseSha, worker: name, completedAt: new Date().toISOString(), containerId: observed.Id, outputSha256: digest(output), decision: 'PASS' };
    publish(`${dir}/${key}.receipt.json`, receipt);
    console.log(canonical(receipt));
  } else if (command === 'external-worker-run') {
    demand(Object.keys(options).length === 0, 'External worker run takes no caller-supplied scope');
    const name = 'langame-external-daily-worker', runRoot = `${STATE}/external-worker-runs`;
    const tickStarted = Date.now();
    const externalGrantPath = `${STATE}/worker-grants/${name}.json`, externalSecretPath = `${ROOT}/secrets/${name}.json`;
    const authority = async () => {
      const current = active(); demand(current, 'No accepted external worker application');
      const dir = operation(current.operationId), plan = readJSON(`${dir}/plan.json`, { immutable: true });
      demand(current.planSha256 === digest(plan) && current[current.activeSlot]?.externalWorkerCapability === 'LANGAME_EXTERNAL_SET1_V1',
        'External worker active release/plan is not capable');
      const history = await storeFor(dir).read();
      demand(current.outcome === 'ROLLED_BACK' ? Boolean(history.rolledBack) : Boolean(history.final && history.records.POSTCHECK?.receipt),
        'External worker application lacks accepted native terminal');
      if (plan.workerContinuation?.contract === WORKER_CONTINUATION_V2) await acceptedWorkerContinuation(workerContinuationArguments(plan, dir, current),
        current.outcome === 'ROLLED_BACK' ? 'ROLLBACK' : 'FORWARD');
      attestAdmittedRelease(current.dataRelease, current.dataAdmissionSha256);
      assertPrimaryDatabase(plan.databaseIdentitySha256);
      return { current, publicKey: externalWorkerPublicKey(), hostIdentitySha256: hostIdentity(),
        secretBytes: safeFile(externalSecretPath), grantEnvelope: canonicalPrivateJSON(externalGrantPath) };
    };
    const adapters = {
      assertLocks: async () => verifyKernelControlLocks({ mode: 'READ', singleton: name }, {
        globalLock: fs.lstatSync(`${STATE}/control.lock`), singletonLock: fs.lstatSync(`${STATE}/${name}.lock`),
        locks: fs.readFileSync('/proc/locks', 'utf8'), parentPid: process.ppid,
        outerPid: fs.readFileSync(`/proc/${process.ppid}/status`, 'utf8').match(/^PPid:\s+(\d+)$/m)?.[1] }),
      attestAccepted: authority,
      attestEnrollment: async ({ current, secretBytes, grantEnvelope }) => {
        const enrollment = acceptedExternalEnrollment();
        demand(enrollment.plan.worker === name && enrollment.originalSecret.equals(secretBytes) &&
          enrollment.plan.mode === grantEnvelope.grant.mode,
        'External worker enrollment/profile/mode drift');
        const timer = externalTimer();
        demand(timer.loadState === 'loaded' &&
          (grantEnvelope.grant.mode === 'TIMER' ? timer.enabled && timer.active : !timer.enabled && !timer.active),
        'External worker timer is not in an accepted enrolled state');
        demand(current[current.activeSlot].externalWorkerCapability === 'LANGAME_EXTERNAL_SET1_V1', 'External worker image capability disappeared');
      },
      verifyNetwork: async () => {
        run('/usr/bin/python3', [`${CONTROL}/network-fence.py`, 'verify']);
        const output = run('/usr/bin/python3', [`${CONTROL}/external-network-fence.py`, 'verify'], { json: true });
        validateExternalNetworkObservation(output);
      },
      readPriorRun: async identity => fs.existsSync(`${runRoot}/${identity}.intent.json`) ? canonicalPrivateJSON(`${runRoot}/${identity}.intent.json`) : null,
      assertNoAmbiguousDate: async () => {
        if (!fs.existsSync(runRoot)) return;
        for (const leaf of fs.readdirSync(runRoot).filter(leaf => leaf.endsWith('.intent.json'))) {
          demand(/^[a-f0-9-]{36}\.intent\.json$/.test(leaf), 'Untrusted external run intent name');
          const prior = canonicalPrivateJSON(`${runRoot}/${leaf}`);
          demand(prior?.contract === 'LEETPLUS_LANGAME_EXTERNAL_NATIVE_RUN_V1_INTENT', 'Unknown external run intent contract');
          const identity = leaf.slice(0, -'.intent.json'.length);
          demand(fs.existsSync(`${runRoot}/${identity}.receipt.json`), 'Prior external run intent has no terminal; no blind provider retry');
        }
      },
      publishRun: async (identity, type, value) => {
        demand(/^[a-f0-9-]{36}$/.test(identity) && ['compose', 'intent', 'result', 'receipt'].includes(type), 'External run publication escaped scope');
        directory(runRoot); publish(`${runRoot}/${identity}.${type}.json`, value);
      },
      createStopped: async (spec, intent) => {
        const existing = docker(['ps', '--all', '--filter', `name=^/leetplus-${name}$`, '--format', '{{.ID}}']);
        if (existing) {
          const prior = docker(['inspect', `leetplus-${name}`], { json: true })[0];
          demand(prior.Config.Labels?.['ru.leetplus.contract'] === CONTRACT && prior.Config.Labels?.['com.docker.compose.project'] === 'leetplus' &&
            !prior.State.Running && prior.State.Pid === 0, 'Existing external worker container is not a stopped owned instance');
        }
        docker(['compose', '--project-name', 'leetplus', '--file', `${runRoot}/${intent.identity}.compose.json`, '--profile', 'external-workers',
          'up', '--no-start', '--no-deps', '--force-recreate', name]);
      },
      verifyStopped: async spec => {
        const service = spec.services[name], imageEnvironment = docker(['image', 'inspect', service.image], { json: true })[0].Config.Env;
        verifyContainer(docker(['inspect', service.container_name], { json: true })[0], service, name, { beforeStart: true, imageEnvironment });
      },
      freezeContainer: async (spec, intent) => {
        demand(Date.now() - tickStarted < 300000, 'External worker pre-start budget exhausted before provider effect');
        const service = spec.services[name], item = docker(['inspect', service.container_name], { json: true })[0];
        const imageEnvironment = docker(['image', 'inspect', service.image], { json: true })[0].Config.Env;
        verifyContainer(item, service, name, { beforeStart: true, imageEnvironment });
        const record = { contract: `${EXTERNAL_CLEANUP_CONTRACT}_CONTAINER`, identity: intent.identity,
          intentSha256: digest(intent), composeSha256: digest(spec), containerId: item.Id,
          image: service.image, name: service.container_name };
        publish(`${runRoot}/${intent.identity}.container.json`, record);
        replace(`${runRoot}/active.json`, Buffer.from(canonical({ contract: `${EXTERNAL_CLEANUP_CONTRACT}_POINTER`,
          identity: intent.identity, containerRecordSha256: digest(record) })), 0o400);
        return item.Id;
      },
      startAttached: async (frozenId, intent) => {
        demand(Date.now() - tickStarted < 300000, 'External worker pre-start budget exhausted before attached provider effect');
        const original = docker(['inspect', frozenId], { json: true })[0];
        const frozen = canonicalPrivateJSON(`${runRoot}/${intent.identity}.container.json`);
        validateFrozenExternalContainer(frozen, intent, original, frozenId);
        demand(!original.State.Running && original.State.Pid === 0 &&
          original.Config.Labels?.['ru.leetplus.contract'] === CONTRACT &&
          original.Config.Labels?.['com.docker.compose.project'] === 'leetplus', 'External run container preimage drift');
        const result = spawnSync('/usr/bin/docker', ['--host', 'unix:///var/run/docker.sock', '--config', '/etc/leetplus-compose/docker-cli',
          'start', '--attach', original.Id], { encoding: 'utf8', env: CLEAN_ENV, timeout: 2700000, maxBuffer: 4 * 1024 * 1024 });
        if (result.error || result.signal !== null || ![0, 1, 75].includes(result.status)) {
          docker(['stop', '--time', '120', original.Id], { timeout: 180000 });
          const after = docker(['inspect', original.Id], { json: true })[0];
          demand(!after.State.Running && after.State.Pid === 0, 'Ambiguous external worker did not stop; control effects remain fenced');
          demand(false, 'External worker outcome is ambiguous; owned container stopped, preserve intent and reconcile without retry');
        }
        return { exitCode: result.status, stdout: result.stdout, containerId: frozenId };
      },
      inspectStopped: async frozenId => {
        const item = docker(['inspect', frozenId], { json: true })[0];
        demand(item.Id === frozenId, 'External stopped container ID drift');
        return { running: item.State.Running, pid: item.State.Pid, exitCode: item.State.ExitCode, containerId: item.Id };
      },
    };
    console.log(canonical(await runExternalWorker({ adapters })));
  } else if (command === 'external-worker-cleanup') {
    demand(Object.keys(options).length === 0, 'External worker cleanup takes no caller scope');
    const runRoot = `${STATE}/external-worker-runs`, name = 'langame-external-daily-worker';
    const read = (identity, type) => canonicalPrivateJSON(`${runRoot}/${identity}.${type}.json`);
    const adapters = {
      assertWorkerLocks: async () => verifyExternalCleanupSingletonLock({
        singletonLock: fs.lstatSync(`${STATE}/${name}.lock`),
        locks: fs.readFileSync('/proc/locks', 'utf8'), parentPid: process.ppid }),
      readPointer: async () => fs.existsSync(`${runRoot}/active.json`) ? canonicalPrivateJSON(`${runRoot}/active.json`) : null,
      readIntent: async id => read(id, 'intent'), readCompose: async id => read(id, 'compose'),
      readContainerRecord: async id => read(id, 'container'),
      inspectById: async id => {
        const item = docker(['inspect', id], { json: true })[0];
        return { raw: item, id: item.Id, name: item.Name.slice(1), image: item.Image,
          running: item.State.Running, pid: item.State.Pid };
      },
      verifyOwned: async (observed, record, spec) => {
        demand(observed.id === record.containerId && observed.name === record.name && observed.image === record.image &&
          observed.raw.Config.Labels?.['ru.leetplus.contract'] === CONTRACT &&
          observed.raw.Config.Labels?.['com.docker.compose.project'] === 'leetplus', 'Foreign container cannot be stopped by external cleanup');
        const service = spec.services[name], imageEnvironment = docker(['image', 'inspect', service.image], { json: true })[0].Config.Env;
        verifyContainer(observed.raw, service, name, { configurationOnly: true, imageEnvironment });
      },
      stopById: async id => { docker(['stop', '--time', '120', id], { timeout: 180000 }); },
      readCleanupReceipt: async id => fs.existsSync(`${runRoot}/${id}.cleanup.json`) ? read(id, 'cleanup') : null,
      publishCleanupReceipt: async (id, value) => publish(`${runRoot}/${id}.cleanup.json`, value),
    };
    console.log(canonical(await cleanupExternalWorker(adapters)));
  } else {
    demand(['apply', 'resume'].includes(command), 'Unknown command');
    const dir = operation(options.operation), plan = readJSON(`${dir}/plan.json`, { immutable: true });
    const approvalPath = `${dir}/approval.json`;
    if (command === 'apply') publish(approvalPath, readJSON(options.approval));
    demand(fs.existsSync(approvalPath), 'Resume cannot create an approval');
    const result = await execute(plan, readJSON(approvalPath, { immutable: true }), safeFile('/etc/leetplus-compose/approval-root.pem'), storeFor(dir), driverFor(dir));
    console.log(canonical(result));
  }
}
