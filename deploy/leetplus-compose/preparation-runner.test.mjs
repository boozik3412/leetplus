import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { CONTRACT, GO_PACKET_CONTRACT, PHASES, PreparationRunner, ensurePrivateTree, fileDigest, validateAdmission } from './preparation-runner.mjs';
import { canonical, digest, renderCompose } from './contract.mjs';

const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const OPERATION = '12345678-1234-4123-8123-123456789abc';
const WORKER_IDS = ['22345678-1234-4123-8123-123456789abc', '32345678-1234-4123-8123-123456789abc'];

function fixture({ resource = true, deadline = '2026-09-22T03:00:00.000Z' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prep-runner-'));
  const write = (name, value, canonicalJson = false) => {
    const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === 'string' || Buffer.isBuffer(value) ? value : (canonicalJson ? canonical(value) : JSON.stringify(value)));
    return file;
  };
  const image = digit => `sha256:${digit.repeat(64)}`;
  const oldRelease = { contract: 'LEETPLUS_COMPOSE_BLUE_GREEN_V1', releaseSha: 'b'.repeat(40), builtAt: '2026-09-21T00:00:00Z', migrationCount: 191, migration: '20260908180000_external_langame_simple_onboarding', apiResourceProfile: 'API_6G_V1', images: { api: image('5'), web: image('6'), postgres: image('7'), redis: image('8') } };
  const release = { contract: 'LEETPLUS_COMPOSE_BLUE_GREEN_V1', releaseSha: 'a'.repeat(40), builtAt: '2026-09-22T00:00:00Z', migrationCount: 191, migration: '20260908180000_external_langame_simple_onboarding', ...(resource ? { apiResourceProfile: 'API_6G_V1' } : {}), images: { api: image('1'), web: image('2'), postgres: image('3'), redis: image('4') } };
  const releaseJson = write('bundle/release.json', release, true);
  const imagesArchive = write('bundle/images.tar.gz', 'images');
  const controlArchive = write('bundle/control.tar.gz', 'control');
  const transportValidation = write('bundle/transport-validation.json', { decision: 'PASS', tlsRequired: true, badCaRejected: true, badHostnameRejected: true, nativeWorkerProfileAccepted: true }, true);
  const archiveRoundtrip = write('bundle/archive-roundtrip.json', { decision: 'PASS', engine: '29.1.3', store: 'containerd', isolatedDaemon: true, images: release.images }, true);
  const networkValidation = write('bundle/network-validation.json', { decision: 'PASS', stoppedCreation: true, loopbackHttp: true, webToApi: true, apiToData: true, webDataDenied: true, hostProxyDenied: true, externalDenied: true }, true);
  const admission = { contract: 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_ADMISSION', decision: 'PASS', event: 'push', ref: 'refs/heads/main', repository: 'boozik3412/leetplus', releaseSha: release.releaseSha, runId: '1', runAttempt: '1', releaseManifestSha256: fileDigest(releaseJson), archiveSha256: fileDigest(imagesArchive), controlArchiveSha256: fileDigest(controlArchive), transportValidationSha256: fileDigest(transportValidation), archiveRoundtripSha256: fileDigest(archiveRoundtrip), networkValidationSha256: fileDigest(networkValidation), images: release.images };
  const admissionJson = write('bundle/docker-admission.json', admission, true);
  const bundleFiles = { 'release.json': releaseJson, 'docker-admission.json': admissionJson, 'images.tar.gz': imagesArchive, 'control.tar.gz': controlArchive, 'transport-validation.json': transportValidation, 'archive-roundtrip.json': archiveRoundtrip, 'network-validation.json': networkValidation };
  const downloadInput = { contract: 'LEETPLUS_RELEASE_DOWNLOAD_V1', releaseSha: release.releaseSha, admissionSha256: fileDigest(admissionJson), runId: '1', runAttempt: '1', artifactId: '2' };
  const downloadReceipt = write('bundle/download.json', { contract: 'LEETPLUS_RELEASE_DOWNLOAD_V1', decision: 'PASS', inputSha256: digest(downloadInput), intentSha256: 'b'.repeat(64), remoteSha256: 'c'.repeat(64), releaseSha: release.releaseSha, runId: '1', runAttempt: '1', artifactId: '2', completedAt: '2026-09-22T00:00:01Z', files: Object.fromEntries(Object.entries(bundleFiles).map(([name, file]) => [name, { sha256: fileDigest(file), bytes: fs.statSync(file).size }])) }, true);
  const sourceCapsule = write('external/rehearsal-source-capsule.tar', 'source');
  const dump = write('external/leetplus.dump', 'dump');
  const globals = write('external/globals.sql', 'globals');
  const restoreManifest = write('external/restore-manifest.json', { contract: 'LEETPLUS_DAILY_BACKUP_V1', sourceReleaseSha: oldRelease.releaseSha, files: { 'leetplus.dump': { sha256: fileDigest(dump), bytes: fs.statSync(dump).size }, 'globals.sql': { sha256: fileDigest(globals), bytes: fs.statSync(globals).size } } }, true);
  const machineId = write('machine-id', 'machine\n');
  const hostIdentitySha256 = digest('machine');
  const active = { operationId: OPERATION, generation: 8, activeSlot: 'blue', blue: oldRelease, green: oldRelease, dataRelease: oldRelease, dataAdmissionSha256: '9'.repeat(64), planSha256: '8'.repeat(64), outcome: 'COMPLETED' };
  const servingControlRoot = path.join(root, 'serving-control'); fs.mkdirSync(servingControlRoot);
  const servingFiles = Object.fromEntries(['install-control.py', 'control.sh'].map((leaf, index) => { const file = path.join(servingControlRoot, leaf); fs.writeFileSync(file, `serving-${index}`); return [leaf, fileDigest(file)]; }));
  const servingManifest = path.join(servingControlRoot, 'install-manifest.json'); fs.writeFileSync(servingManifest, canonical({ contract: 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_INSTALL', releaseSha: 'f'.repeat(40), admissionSha256: 'f'.repeat(64), files: servingFiles }));
  const guard = { contract: 'LEETPLUS_PREPARATION_GUARD_V1', hostIdentitySha256, controllerManifestSha256: fileDigest(servingManifest), activeSha256: digest(active), generation: 8, activeSlot: 'blue' };
  const workers = ['bonus-ledger-worker', 'langame-daily-worker'];
  const controlState = path.join(root, 'control-state'), productionRoot = path.join(root, 'production-root');
  fs.mkdirSync(path.join(controlState, 'worker-grants'), { recursive: true }); fs.mkdirSync(path.join(productionRoot, 'secrets'), { recursive: true });
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519'), workerPublicKey = write('approval-root.pem', publicKey.export({ type: 'spki', format: 'pem' }));
  const profileHashes = workers.map(worker => { const prefix = worker === 'bonus-ledger-worker' ? 'GUEST_BONUS_LEDGER_WORKER' : 'LANGAME_DAILY_WORKER'; const profile = { [`${prefix}_TENANT_SLUG`]: 'tenant', [`${prefix}_CANARY`]: 'false', LANGAME_DAILY_SYNC_SCHEDULER_ENABLED: 'false', LANGAME_SCHEDULED_HTTP_ENABLED: 'false', GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED: 'false', DATABASE_URL: 'postgresql://leetplus_runtime:secret@postgres/leetplus?schema=public&connection_limit=2&pool_timeout=5&connect_timeout=5&sslmode=require&sslcert=%2Frun%2Fsecrets%2Fdb-ca.pem&sslaccept=strict' }; const file = path.join(productionRoot, 'secrets', `${worker}.json`); fs.writeFileSync(file, canonical(profile)); return fileDigest(file); });
  const grantHashes = workers.map((worker, index) => { const profilePath = path.join(productionRoot, 'secrets', `${worker}.json`), grant = { contract: 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_WORKER_GRANT', worker, mode: 'TIMER', releaseSha: oldRelease.releaseSha, generation: 8, hostIdentitySha256, issuedAt: '2026-09-21T23:00:00Z', expiresAt: '2026-09-23T00:00:00Z', id: WORKER_IDS[index], tenantSlug: 'tenant', secretSha256: fileDigest(profilePath) }; const envelope = { grant, signature: crypto.sign(null, Buffer.from(canonical(grant)), privateKey).toString('base64') }; const file = path.join(controlState, 'worker-grants', `${worker}.json`); fs.writeFileSync(file, canonical(envelope)); return fileDigest(file); });
  const workerContinuation = { contract: 'LEETPLUS_WORKER_CONTINUATION_V1', owner: 'NATIVE_WORKER_CONTROLLER', noNewWorker: true, preserveGrantExpiry: true, preserveTenantScope: true,
    originalTimers: workers.map(worker => ({ worker, unit: worker === 'bonus-ledger-worker' ? 'leetplus-compose-bonus.timer' : 'leetplus-compose-daily.timer', enabled: true, active: true })),
    grantBindings: workers.map((worker, index) => ({ worker, grantId: WORKER_IDS[index], grantSha256: grantHashes[index], releaseSha: oldRelease.releaseSha, generation: 8 })),
    profileBindings: workers.map((worker, index) => ({ worker, profileSha256: profileHashes[index] })),
    allowedSteps: ['CHECK_ORIGINAL_STATE', 'VERIFY_EXISTING_GRANT', 'RENEW_EXISTING_GRANT', 'RETURN_ORIGINAL_TIMER', 'CHECK_FINAL_STATE'] };
  const external = { offhostReceipt: path.join(root, 'external/offhost.json'), backupVerificationReceipt: path.join(root, 'external/backup-verification.json'), restoreImportReceipt: path.join(root, 'external/import.json'), browserReceipt: path.join(root, 'external/browser.json') };
  const paths = { rehearsalInputRoot: path.join(root, 'external'), preparation: path.join(root, 'rehearsal/preparation.json'), backup: path.join(root, 'production/latest.json'), restore: path.join(root, 'rehearsal/evidence/restore.json'), acceptance: path.join(root, 'rehearsal/evidence/runtime-acceptance.json'), nativeOperations: path.join(root, 'operations'), machineId, procLocks: path.join(root, 'proc-locks'), controlState, productionRoot, workerPublicKey, controlCommand: path.resolve(root, 'control'), servingControlRoot, candidateControlRoot: path.resolve(root, 'controllers'), preparationLock: path.join(root, 'global-preparation.lock') };
  fs.mkdirSync(path.dirname(paths.preparation), { recursive: true }); fs.mkdirSync(path.dirname(paths.backup), { recursive: true }); fs.mkdirSync(path.dirname(paths.restore), { recursive: true }); fs.mkdirSync(paths.nativeOperations); write('proc-locks', '');
  const candidateRoot = path.join(paths.candidateControlRoot, release.releaseSha); fs.mkdirSync(candidateRoot, { recursive: true });
  const candidateFiles = Object.fromEntries(['prepare-files.py', 'restore-rehearsal.py', 'accept-rehearsal.py', 'run-resource-rehearsal.py', 'control_handoff.py', 'contract.mjs', 'resource-budget.mjs'].map((leaf, index) => { const file = path.join(candidateRoot, leaf); fs.writeFileSync(file, `candidate-${index}`); return [leaf, fileDigest(file)]; }));
  fs.writeFileSync(path.join(candidateRoot, 'install-manifest.json'), canonical({ contract: 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_INSTALL', releaseSha: release.releaseSha, admissionSha256: fileDigest(admissionJson), files: candidateFiles }));
  const input = { contract: CONTRACT, releaseJson, admissionJson, imagesArchive, controlArchive, transportValidation, archiveRoundtrip, networkValidation, downloadReceipt, downloadInputSha256: digest(downloadInput), downloadArtifactId: '2',
    ...external, targetSlot: 'green', wait: { pollIntervalMs: 5000, deadline },
    nativeRequest: { blue: oldRelease, green: release, migrationReceiptSha256: 'd'.repeat(64), preparationGuard: guard, workerContinuation } };
  let tick = Date.parse('2026-09-22T00:00:10Z'); const clock = () => new Date(tick += 1000).toISOString();
  const calls = [];
  function externalReceipts(backup) {
    const plaintext = 'e'.repeat(64);
    write('external/offhost.json', { contract: 'LEETPLUS_BACKUP_EXPORT_V1', decision: 'OFFHOST_BYTES_VERIFIED', sha256: backup.sha256, bytes: backup.bytes, capturedAt: backup.capturedAt, plaintextSha256: plaintext, completedAt: clock() }, true);
    const sourceVerificationSha256 = 'f'.repeat(64);
    write('external/backup-verification.json', { decision: 'AUTHENTICATED_APPLICATION_BACKUP_PASS', backupSha256: backup.sha256, plaintextSha256: plaintext, generation: 8, sourceHostIdentitySha256: hostIdentitySha256, sourceControllerManifestSha256: guard.controllerManifestSha256, sourceActiveSha256: guard.activeSha256, sourceAppSha: oldRelease.releaseSha, sourceVerificationSha256, effectiveExpiresAt: '2026-09-22T02:30:00Z', completedAt: clock() }, true);
    const derivationIdentity = { verificationSha256: sourceVerificationSha256, capsuleSha256: plaintext, preparationInputSha256: digest(input) };
    write('external/import.json', { contract: 'LEETPLUS_PREPARATION_RESTORE_IMPORT_V1', decision: 'PASS', backupSha256: backup.sha256, plaintextSha256: plaintext, derivationIdentity, derivationInputSha256: digest(derivationIdentity), backupVerificationSha256: fileDigest(external.backupVerificationReceipt), manifestPath: restoreManifest, dumpPath: dump, globalsPath: globals, sourceCapsulePath: sourceCapsule, manifestSha256: fileDigest(restoreManifest), dumpSha256: fileDigest(dump), globalsSha256: fileDigest(globals), sourceCapsuleSha256: fileDigest(sourceCapsule), completedAt: clock() }, true);
  }
  const writePlan = requestPath => {
    const request = JSON.parse(fs.readFileSync(requestPath));
    const plan = { ...request, contract: 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_PLAN', operationId: OPERATION, hostIdentitySha256, controlSha256: guard.controllerManifestSha256, previous: active, generation: 8, action: 'ROLLOUT', dataRelease: active.dataRelease, dataAdmissionSha256: active.dataAdmissionSha256, secretDigests: { 'acceptance.json': '1'.repeat(64), 'api-blue.json': '2'.repeat(64), 'api-green.json': '3'.repeat(64), 'db-ca.pem': '4'.repeat(64) }, networkPolicySha256: '5'.repeat(64), databaseIdentitySha256: '6'.repeat(64), composeSha256: '7'.repeat(64), ...(resource ? { resourceBudget: { decision: 'OBSERVED_ENVELOPE_PASS' } } : {}) };
    const operation = path.join(paths.nativeOperations, OPERATION); fs.mkdirSync(operation, { recursive: true }); fs.writeFileSync(path.join(operation, 'plan.json'), canonical(plan)); return plan;
  };
  const execute = async (command, args) => {
    calls.push([path.basename(command), ...args]);
    if (args[0] === 'status') return { exitCode: 0, stdout: canonical({ active, operations: [], controller: { releaseSha: 'f'.repeat(40), manifestSha256: guard.controllerManifestSha256, isServing: true, handoffPending: false, preparationEvidenceExpiryEnforced: true } }), stderr: '' };
    if (path.basename(command) === 'systemctl') return { exitCode: 0, stdout: 'LoadState=loaded\nActiveState=active\nUnitFileState=enabled\nSubState=waiting\n', stderr: '' };
    if (args[0]?.endsWith('install-control.py')) return { exitCode: 0, stdout: canonical({ decision: 'CONTROL_STAGED_NOT_ACTIVATED', releaseSha: release.releaseSha }), stderr: '' };
    if (args.includes('load')) return { exitCode: 0, stdout: 'loaded', stderr: '' };
    if (args.includes('inspect') && args.includes('image')) return { exitCode: 0, stdout: JSON.stringify([{ Id: args.at(-1) }]), stderr: '' };
    if (args[0] === 'backup') { const backup = { contract: 'LEETPLUS_BACKUP_EXPORT_V1', filename: 'backup.lpbackup', sha256: 'a'.repeat(64), bytes: 1024, capturedAt: clock() }; fs.writeFileSync(paths.backup, canonical(backup)); externalReceipts(backup); return { exitCode: 0, stdout: '{}', stderr: '' }; }
    if (args[0]?.endsWith('prepare-files.py')) { fs.writeFileSync(paths.preparation, canonical({ contract: 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_PREPARATION', decision: 'PREPARED_NOT_SERVING', rehearsal: true, releaseSha: release.releaseSha, sourceConfigurationSha256: fileDigest(sourceCapsule), createdAt: clock() })); return { exitCode: 0, stdout: '{}', stderr: '' }; }
    if (args[0]?.endsWith('restore-rehearsal.py')) {
      fs.writeFileSync(paths.restore, canonical({ decision: 'DATABASE_RESTORE_PASS', releaseSha: release.releaseSha, sourceReleaseSha: oldRelease.releaseSha, sourceDumpSha256: fileDigest(dump), completedAt: clock() }));
      const restoreReceiptSha256 = fileDigest(paths.restore), startedAt = clock(), pins = ['api-blue', 'api-green', 'web-blue', 'web-green'].map((role, index) => ({ role, id: String(index + 5).repeat(64) }));
      const cloneWindowReceiptPath = write('external/browser-window.json', { contract: 'LEETPLUS_REHEARSAL_BROWSER_WINDOW_V1', decision: 'READY', releaseSha: release.releaseSha, restoreReceiptSha256, project: 'leetplus-rehearsal', endpoints: { blue: { web: 'http://127.0.0.1:23100', api: 'http://127.0.0.1:24100' }, green: { web: 'http://127.0.0.1:23200', api: 'http://127.0.0.1:24200' } }, pins, startedAt, expiresAt: '2026-09-22T00:25:00Z' }, true);
      const windowReceiptSha256 = fileDigest(cloneWindowReceiptPath);
      const browserResultPath = write('external/browser-result.json', { contract: 'LEETPLUS_REHEARSAL_BROWSER_RESULT_V1', decision: 'PASS', releaseSha: release.releaseSha, restoreReceiptSha256, windowReceiptSha256, productionUrlUsed: false, viewports: [390, 1440], slots: { blue: 'PASS', green: 'PASS' }, completedAt: clock() }, true);
      const apiResultPath = write('external/api-result.json', { contract: 'LEETPLUS_REHEARSAL_API_RESULT_V1', decision: 'PASS', releaseSha: release.releaseSha, restoreReceiptSha256, windowReceiptSha256, providerEgressDenied: true, workerStarted: false, slots: { blue: 'PASS', green: 'PASS' }, completedAt: clock() }, true);
      const cleanupReceiptPath = write('external/browser-cleanup.json', { contract: 'LEETPLUS_REHEARSAL_BROWSER_CLEANUP_V1', decision: 'PASS', windowReceiptSha256, runningCloneCount: 0, stoppedPins: pins, completedAt: clock() }, true);
      fs.writeFileSync(external.browserReceipt, canonical({ contract: 'LEETPLUS_REHEARSAL_BROWSER_API_ACCEPTANCE_V1', decision: 'PASS', releaseSha: release.releaseSha, restoreReceiptSha256: fileDigest(paths.restore), cloneWindowReceiptPath, cloneWindowReceiptSha256: fileDigest(cloneWindowReceiptPath), browserResultPath, browserResultSha256: fileDigest(browserResultPath), apiResultPath, apiResultSha256: fileDigest(apiResultPath), cleanupReceiptPath, cleanupReceiptSha256: fileDigest(cleanupReceiptPath), completedAt: clock() }));
      return { exitCode: 0, stdout: '{}', stderr: '' };
    }
    if (args[0]?.endsWith(resource ? 'run-resource-rehearsal.py' : 'accept-rehearsal.py')) {
      const sourceDumpSha256 = fileDigest(dump), composeSha256 = digest(renderCompose({ blue: release, green: release, rehearsal: true }));
      const pinned = Object.fromEntries(['api-blue', 'api-green', 'web-blue', 'web-green'].map((role, index) => [role, { id: String(index + 1).repeat(64) }]));
      const acceptance = { decision: 'PASS', releaseSha: release.releaseSha, sourceDumpSha256, providerEgress: 'DENIED', liveWorkers: 'NOT_STARTED', completedAt: clock(), ...(resource ? { apiResourceProfile: 'API_6G_V1', resourceAcceptance: { decision: 'PASS', mode: 'BOUNDED_MONITORED_REHEARSAL', composeSha256, guard: { decision: 'PASS', composeSha256, failure: null, activeReceiptSha256: '1'.repeat(64), samplesSha256: '2'.repeat(64), pinned, cleanup: Object.entries(pinned).map(([role, value]) => ({ role, id: value.id, decision: 'STOPPED' })) }, corpus: { decision: 'PASS', releaseSha: release.releaseSha, sourceDumpSha256, apiResourceProfile: 'API_6G_V1', businessCountsUnchanged: true, cooldownSeconds: 60 }, cooldown: { decision: 'PASS' } } } : {}) };
      fs.writeFileSync(paths.acceptance, canonical(acceptance)); return { exitCode: 0, stdout: '{}', stderr: '' };
    }
    if (args[0] === 'prepare') { const plan = writePlan(args[2]); return { exitCode: 0, stdout: canonical({ decision: 'PREPARED_NOT_AUTHORIZATION', operationId: OPERATION, planSha256: digest(plan), planPath: path.join(paths.nativeOperations, OPERATION, 'plan.json') }), stderr: '' }; }
    throw new Error(`unexpected command: ${command} ${args.join(' ')}`);
  };
  return { root, input, paths, execute, calls, clock, release, oldRelease, active, guard, write, writePlan, externalReceipts };
}

test('runs exact admitted bundle through fresh backup, restored acceptance and native prepare', async () => {
  const f = fixture();
  const packet = await new PreparationRunner(f.input, path.join(f.root, 'state'), { execute: f.execute, paths: f.paths, clock: f.clock, workerBusy: async () => false }).run();
  assert.equal(packet.contract, GO_PACKET_CONTRACT); assert.equal(packet.decision, 'PREPARED_NOT_AUTHORIZATION'); assert.equal(packet.nativeOperationId, OPERATION);
  assert.equal(f.calls.filter(call => call.some(part => String(part).endsWith('run-resource-rehearsal.py'))).length, 1, '6G controller must run exactly once');
  assert.equal(f.calls.filter(call => call.some(part => String(part).endsWith('accept-rehearsal.py'))).length, 0);
  for (const leaf of ['backup.json', 'rehearsal.json']) { const file = path.join(f.paths.nativeOperations, OPERATION, leaf); assert.ok(fs.existsSync(file)); if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o400); }
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.paths.nativeOperations, OPERATION, 'rehearsal.json'))).resourceAcceptance.cooldown.decision, 'PASS');
  assert.ok(fs.existsSync(path.join(f.root, 'state', 'go-packet.json')));
  for (const phase of PHASES) {
    const receipt = JSON.parse(fs.readFileSync(path.join(f.root, 'state', `${String(PHASES.indexOf(phase) + 1).padStart(2, '0')}-${phase}.receipt.json`)));
    assert.ok(Date.parse(receipt.detectedAt) <= Date.parse(receipt.completedAt));
    if (receipt.result.detectedAt) assert.equal(receipt.detectedAt, receipt.result.detectedAt);
    assert.equal(typeof receipt.producerCompletionTimeBasis, 'string');
    if (phase === 'IMAGE_STAGE') {
      assert.equal(receipt.producerCompletedAt, null);
      assert.equal(receipt.producerCompletionTimeBasis, 'EXACT_STATE_OBSERVED_COMPLETION_TIME_UNKNOWN');
    }
    if (phase === 'BACKUP') {
      assert.equal(receipt.producerCompletedAt, null);
      assert.ok(Number.isFinite(Date.parse(receipt.producerPublicationTimeProxy)));
      assert.equal(receipt.producerCompletionTimeBasis, 'RECEIPT_PUBLICATION_MTIME_PROXY');
    }
  }
});

test('restart and an existing complete plan never replay accepted effects', async () => {
  const f = fixture({ resource: false }), state = path.join(f.root, 'state');
  await new PreparationRunner(f.input, state, { execute: f.execute, paths: f.paths, clock: f.clock, workerBusy: async () => false }).run();
  const effects = () => f.calls.filter(call => call.some(part => ['install-control.py', 'load', 'prepare-files.py', 'backup', 'restore-rehearsal.py', 'accept-rehearsal.py', 'run-resource-rehearsal.py'].some(marker => String(part).endsWith(marker))));
  const before = effects().length;
  await new PreparationRunner(f.input, state, { execute: f.execute, paths: f.paths, clock: f.clock, workerBusy: async () => false }).run();
  assert.equal(effects().length, before);
});

test('restart revalidates underlying accepted evidence before reusing the GO packet', async () => {
  const f = fixture(), state = path.join(f.root, 'state');
  await new PreparationRunner(f.input, state, { execute: f.execute, paths: f.paths, clock: f.clock, workerBusy: async () => false }).run();
  const browser = JSON.parse(fs.readFileSync(f.input.browserReceipt)); browser.browserResultSha256 = 'f'.repeat(64); fs.writeFileSync(f.input.browserReceipt, canonical(browser));
  await assert.rejects(new PreparationRunner(f.input, state, { execute: f.execute, paths: f.paths, clock: f.clock, workerBusy: async () => false }).run(), /Browser\/API receipt/);
});

test('browser adapter rejects production URL claims and incomplete clone cleanup even with matching hashes', async t => {
  for (const kind of ['production-url', 'cleanup']) await t.test(kind, async () => {
    const f = fixture();
    const execute = async (command, args, options) => {
      const result = await f.execute(command, args, options);
      if (args[0]?.endsWith('restore-rehearsal.py')) {
        const parent = JSON.parse(fs.readFileSync(f.input.browserReceipt));
        const childPath = kind === 'production-url' ? parent.browserResultPath : parent.cleanupReceiptPath;
        const child = JSON.parse(fs.readFileSync(childPath));
        if (kind === 'production-url') child.productionUrlUsed = true; else child.runningCloneCount = 1;
        fs.writeFileSync(childPath, canonical(child));
        parent[kind === 'production-url' ? 'browserResultSha256' : 'cleanupReceiptSha256'] = fileDigest(childPath);
        fs.writeFileSync(f.input.browserReceipt, canonical(parent));
      }
      return result;
    };
    await assert.rejects(new PreparationRunner(f.input, path.join(f.root, 'state'), { execute, paths: f.paths, clock: f.clock, workerBusy: async () => false }).run(), /Browser result|cleanup/);
  });
});

test('lost responses reconcile exact receipts for every effect controller', async t => {
  for (const lost of ['install-control.py', 'load', 'prepare-files.py', 'backup', 'restore-rehearsal.py', 'run-resource-rehearsal.py', 'native-prepare']) await t.test(lost, async () => {
    const f = fixture(), seen = new Set();
    const execute = async (command, args, options) => {
      const result = await f.execute(command, args, options);
      const key = args[0] === 'prepare' ? 'native-prepare' : (args.includes('load') ? 'load' : path.basename(args[0] ?? ''));
      if (key === lost && !seen.has(key)) { seen.add(key); const error = new Error('response lost'); error.code = 'ECONNRESET'; error.stdout = result.stdout; error.stderr = result.stderr; throw error; }
      return result;
    };
    const packet = await new PreparationRunner(f.input, path.join(f.root, 'state'), { execute, paths: f.paths, clock: f.clock, workerBusy: async () => false }).run();
    assert.equal(packet.decision, 'PREPARED_NOT_AUTHORIZATION');
  });
});

test('restart preserves the original intent timestamp and reconciles a later actual receipt', async () => {
  const f = fixture(), state = path.join(f.root, 'state'); let failed = false;
  const execute = async (command, args, options) => {
    if (args[0]?.endsWith('prepare-files.py') && !failed) { failed = true; return { exitCode: 9, stdout: '', stderr: 'interrupted' }; }
    return f.execute(command, args, options);
  };
  await assert.rejects(new PreparationRunner(f.input, state, { execute, paths: f.paths, clock: f.clock, workerBusy: async () => false }).run(), /prepare-files command failed/);
  const intent = fs.readFileSync(path.join(state, '06-PREPARE_FILES.intent.json'), 'utf8');
  fs.writeFileSync(f.paths.preparation, canonical({ contract: 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_PREPARATION', decision: 'PREPARED_NOT_SERVING', rehearsal: true, releaseSha: f.release.releaseSha, sourceConfigurationSha256: fileDigest(path.join(f.root, 'external/rehearsal-source-capsule.tar')), createdAt: f.clock() }));
  const packet = await new PreparationRunner(f.input, state, { execute: f.execute, paths: f.paths, clock: f.clock, workerBusy: async () => false }).run();
  assert.equal(packet.decision, 'PREPARED_NOT_AUTHORIZATION');
  assert.equal(fs.readFileSync(path.join(state, '06-PREPARE_FILES.intent.json'), 'utf8'), intent);
});

test('invalid manifests, phase order and subset native-plan reuse fail closed', async () => {
  const f = fixture(); validateAdmission(f.input);
  const badManifest = JSON.parse(fs.readFileSync(path.join(f.root, 'external/restore-manifest.json'))); delete badManifest.sourceReleaseSha; fs.writeFileSync(path.join(f.root, 'external/restore-manifest.json'), canonical(badManifest));
  await assert.rejects(new PreparationRunner(f.input, path.join(f.root, 'bad'), { execute: f.execute, paths: f.paths, clock: f.clock, workerBusy: async () => false }).run(), /source|digest/i);
  const f2 = fixture(), state = path.join(f2.root, 'ordered'); fs.mkdirSync(state);
  fs.writeFileSync(path.join(state, '04-BACKUP.receipt.json'), '{}');
  assert.throws(() => new PreparationRunner(f2.input, state, { execute: f2.execute, paths: f2.paths, clock: f2.clock }), /phase-order gap/);
  const f3 = fixture(); const request = { ...f3.input.nativeRequest, targetSlot: 'green', admissionSha256: fileDigest(f3.input.admissionJson), archiveSha256: fileDigest(f3.input.imagesArchive), backupReceiptSha256: '1'.repeat(64), rehearsalReceiptSha256: '2'.repeat(64) }; const requestPath = path.join(f3.root, 'request.json'); fs.writeFileSync(requestPath, canonical(request)); const plan = f3.writePlan(requestPath);
  plan.workerContinuation = { ...plan.workerContinuation, noNewWorker: false }; fs.writeFileSync(path.join(f3.paths.nativeOperations, OPERATION, 'plan.json'), canonical(plan));
  const runner = new PreparationRunner(f3.input, path.join(f3.root, 'state3'), { execute: f3.execute, paths: f3.paths, clock: f3.clock, workerBusy: async () => false });
  assert.equal(runner.findNativePlan(request), null);
});

test('expired wait, generation drift and busy worker are explicit blockers', async () => {
  const expired = fixture({ deadline: '2026-09-22T00:00:12Z' }); fs.unlinkSync(expired.input.downloadReceipt);
  await assert.rejects(new PreparationRunner(expired.input, path.join(expired.root, 'state'), { execute: expired.execute, paths: expired.paths, clock: expired.clock, workerBusy: async () => false }).run(), /expired/);
  for (const mode of ['generation', 'worker']) {
    const f = fixture();
    const execute = mode === 'generation' ? async (command, args, options) => { const result = await f.execute(command, args, options); if (args[0] === 'status') { const value = JSON.parse(result.stdout); value.active.generation++; result.stdout = canonical(value); } return result; } : f.execute;
    await assert.rejects(new PreparationRunner(f.input, path.join(f.root, 'state'), { execute, paths: f.paths, clock: f.clock, workerBusy: async () => mode === 'worker' }).run(), mode === 'generation' ? /generation\/release drift/ : /worker is busy/);
  }
  const stale = fixture();
  const staleExecute = async (command, args, options) => { const result = await stale.execute(command, args, options); if (args[0] === 'backup') { const value = JSON.parse(fs.readFileSync(stale.input.backupVerificationReceipt)); value.effectiveExpiresAt = '2020-01-01T00:00:00Z'; fs.writeFileSync(stale.input.backupVerificationReceipt, canonical(value)); } return result; };
  await assert.rejects(new PreparationRunner(stale.input, path.join(stale.root, 'state'), { execute: staleExecute, paths: stale.paths, clock: stale.clock, workerBusy: async () => false }).run(), /evidence expired/);
});

test('grant and profile drift after native prepare block READY', async t => {
  for (const kind of ['grant', 'profile']) await t.test(kind, async () => {
    const f = fixture();
    const execute = async (command, args, options) => {
      const result = await f.execute(command, args, options);
      if (args[0] === 'prepare') {
        const base = kind === 'grant' ? path.join(f.paths.controlState, 'worker-grants') : path.join(f.paths.productionRoot, 'secrets');
        fs.writeFileSync(path.join(base, 'bonus-ledger-worker.json'), canonical({ drift: true }));
      }
      return result;
    };
    await assert.rejects(new PreparationRunner(f.input, path.join(f.root, 'state'), { execute, paths: f.paths, clock: f.clock, workerBusy: async () => false }).run(), kind === 'grant' ? /Worker grant drift/ : /profile drift|secret profile/);
  });
});

test('global operation lock excludes a concurrent client in another state directory and command streams are separate', async () => {
  const f = fixture(), state = path.join(f.root, 'state');
  let release; const gate = new Promise(resolve => { release = resolve; });
  const execute = async (command, args, options) => { if (args.includes('load')) await gate; return f.execute(command, args, options); };
  const first = new PreparationRunner(f.input, state, { execute, paths: f.paths, clock: f.clock, workerBusy: async () => false }).run();
  while (!fs.existsSync(f.paths.preparationLock)) await new Promise(resolve => setTimeout(resolve, 5));
  await assert.rejects(new PreparationRunner(f.input, path.join(f.root, 'other-state'), { execute: f.execute, paths: f.paths, clock: f.clock, workerBusy: async () => false }).run(), /holds the global preparation lock/);
  release(); await first;
  const commandDir = path.join(state, 'commands');
  assert.ok(fs.readdirSync(commandDir).some(name => name.endsWith('.stdout'))); assert.ok(fs.readdirSync(commandDir).some(name => name.endsWith('.stderr'))); assert.ok(fs.readdirSync(commandDir).some(name => name.endsWith('.exit.json')));
});

test('private state creation rejects a symlinked canonical ancestor before writing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prep-private-root-')), outside = fs.mkdtempSync(path.join(os.tmpdir(), 'prep-private-outside-'));
  fs.chmodSync(root, 0o700);
  fs.symlinkSync(outside, path.join(root, 'preparations'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => ensurePrivateTree(root, path.join(root, 'preparations', 'operation'), { requireRoot: false }), /Untrusted private state directory/);
  assert.equal(fs.existsSync(path.join(outside, 'operation')), false);
});
