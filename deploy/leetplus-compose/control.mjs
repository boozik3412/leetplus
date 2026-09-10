#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CONTRACT, SCHEMA, PORTS, canonical, demand, digest, release, renderCompose, verifyContainer } from './contract.mjs';
import { PHASES, execute, validateApproval, validateChain, validatePlan } from './orchestrator.mjs';
import { validateWorkerGrant } from './worker-authority.mjs';

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
function replace(p, bytes, mode = 0o600) {
  const tmp = `${p}.next-${crypto.randomUUID()}`;
  const fd = fs.openSync(tmp, 'wx', mode);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, p); syncDir(path.dirname(p));
}
function run(binary, argv, { timeout = 120000, input, json = false } = {}) {
  const result = spawnSync(binary, argv, { encoding: 'utf8', env: CLEAN_ENV, timeout, maxBuffer: 16 * 1024 * 1024, input });
  if (result.status !== 0) {
    const error = { time: new Date().toISOString(), executable: path.basename(binary), exitCode: result.status, signal: result.signal, reason: result.error?.code ?? 'COMMAND_FAILED' };
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
  for (const name of ['control.mjs', 'orchestrator.mjs', 'contract.mjs', 'control.sh']) demand(manifest.files[name], 'Required control file is not attested');
  return digest(manifest);
}
function hostIdentity() { return digest(safeFile('/etc/machine-id').toString().trim()); }
function active() { return fs.existsSync(`${STATE}/active.json`) ? readJSON(`${STATE}/active.json`) : null; }
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
function assertNoPending(except) {
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
  demand(api.ok === true && api.release?.sha === expected.releaseSha && api.dependencies?.database?.migration === SCHEMA.migration && api.dependencies?.database?.migrationCount === 191, 'API readiness mismatch');
  demand(web.release?.sha === expected.releaseSha && web.release?.webBuildId === expected.releaseSha, 'Web release identity mismatch');
  const specification = renderCompose({ blue: plan.blue, green: plan.green, activeSlot: plan.targetSlot });
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
function rollbackAfterPostcheck(p, dir) {
  demand(p.previous, 'Bootstrap has no local predecessor to roll back to');
  probeSlot(p, p.previous.activeSlot); authenticatedSmoke(p.previous.activeSlot);
  publish(`${dir}/rollback.intent.json`, { planSha256: digest(p), fromGeneration: p.generation + 1, targetSlot: p.previous.activeSlot });
  switchLink(p.previous.activeSlot);
  run('/usr/sbin/nginx', ['-t']); run('/usr/bin/systemctl', ['reload', 'nginx']);
  probeSlot(p, p.previous.activeSlot);
  const current = { operationId: p.operationId, generation: p.generation + 2, activeSlot: p.previous.activeSlot, blue: p.blue, green: p.green, planSha256: digest(p), outcome: 'ROLLED_BACK' };
  replace(`${STATE}/active.json`, canonical(current));
  publish(`${dir}/rolled-back.json`, { contract: `${CONTRACT}_ROLLED_BACK`, planSha256: digest(p), reason: 'POSTCHECK_FAILED', active: current });
}
function driverFor(dir) {
  return {
    preflight: async (p) => {
      demand(hostIdentity() === p.hostIdentitySha256 && installedDigest() === p.controlSha256, 'Host/control identity drift');
      for (const [leaf, hash] of Object.entries(p.secretDigests)) demand(digest(safeFile(`${ROOT}/secrets/${leaf}`)) === hash, 'Runtime secret-file binding drift');
      demand(digest(safeFile('/etc/leetplus-compose/providers.json')) === p.networkPolicySha256, 'Provider policy binding drift');
      run('/usr/bin/python3', [`${CONTROL}/network-fence.py`, 'verify']);
      assertPrimaryDatabase(p.databaseIdentitySha256);
      assertNoPending(p.operationId);
      const current = active();
      demand(canonical(current) === canonical(p.previous) || (current?.operationId === p.operationId && current.generation === p.generation + 1 && current.activeSlot === p.targetSlot), 'Active generation drift');
      const inbox = `${ROOT}/inbox/${p[p.targetSlot].releaseSha}`;
      demand(digest(safeFile(`${inbox}/docker-admission.json`)) === p.admissionSha256, 'Admission drift');
      const a = readJSON(`${inbox}/docker-admission.json`);
      demand(a.contract === `${CONTRACT}_ADMISSION` && a.decision === 'PASS' && a.releaseSha === p[p.targetSlot].releaseSha && a.archiveSha256 === p.archiveSha256 && a.repository === 'boozik3412/leetplus' && a.ref === 'refs/heads/main' && a.event === 'push', 'Artifact is not a deployable exact-main handoff');
      for (const [name, hash] of [['backup', p.backupReceiptSha256], ['rehearsal', p.rehearsalReceiptSha256], ...(p.action === 'BOOTSTRAP' ? [['migration', p.migrationReceiptSha256]] : [])]) {
        const receipt = safeFile(`${dir}/${name}.json`, { immutable: true });
        demand(digest(receipt) === hash, `${name} evidence changed`);
        const value = JSON.parse(receipt);
        demand(value.decision === 'PASS' && value.releaseSha === p[p.targetSlot].releaseSha, `${name} did not accept this release`);
        if (name === 'migration') demand(value.sourceFenced === true && value.targetPromoted === true && value.finalLsnReplayed === true, 'Migration does not establish a single writer');
      }
    },
    run: async function (phase, p) {
      const bound = { phase, planSha256: digest(p) };
      const spec = renderCompose({ blue: p.blue, green: p.green, activeSlot: p.targetSlot });
      if (phase === 'HYDRATE') {
        const archive = `${ROOT}/inbox/${p[p.targetSlot].releaseSha}/images.tar.gz`;
        // A bounded stream hash avoids loading the image archive into Node RAM.
        const hash = run('/usr/bin/sha256sum', ['--', archive]).split(/\s/)[0];
        demand(hash === p.archiveSha256, 'Image archive checksum mismatch');
        docker(['load', '--input', archive], { timeout: 600000 });
        for (const image of Object.values(p[p.targetSlot].images)) demand(docker(['image', 'inspect', '--format', '{{.Id}}', image]) === image, 'Loaded image ID mismatch');
        return { ...bound, images: p[p.targetSlot].images };
      }
      if (phase === 'BIND') {
        publish(`${dir}/target-fence.json`, { planSha256: digest(p), slot: p.targetSlot });
        if (fs.existsSync(`${ROOT}/compose.json`)) compose(['stop', `api-${p.targetSlot}`, `web-${p.targetSlot}`]);
        replace(`${ROOT}/compose.json`, canonical(spec));
        compose(['create', '--no-deps', '--force-recreate', `api-${p.targetSlot}`, `web-${p.targetSlot}`]);
        for (const role of ['api', 'web']) demand(docker(['inspect', '--format', '{{.State.Running}}', `leetplus-${role}-${p.targetSlot}`]) === 'false', 'Target did not stop');
        return { ...bound, composeSha256: digest(spec), slot: p.targetSlot };
      }
      if (phase === 'SMOKE') {
        compose(['up', '--detach', '--no-deps', `api-${p.targetSlot}`, `web-${p.targetSlot}`]);
        const deadline = Date.now() + 120000;
        let observed;
        do {
          try { observed = probeSlot(p, p.targetSlot); break; } catch { await new Promise(resolve => setTimeout(resolve, 1500)); }
        } while (Date.now() < deadline);
        demand(observed, 'Target did not become healthy before deadline');
        return { ...bound, observed, authenticated: authenticatedSmoke(p.targetSlot) };
      }
      if (phase === 'CUTOVER') {
        probeSlot(p, p.targetSlot); authenticatedSmoke(p.targetSlot);
        if (p.previous) { demand(acceptedLink(p.previous.activeSlot) || acceptedLink(p.targetSlot), 'Unexpected nginx link'); probeSlot(p, p.previous.activeSlot); }
        switchLink(p.targetSlot);
        try {
          run('/usr/sbin/nginx', ['-t']); run('/usr/bin/systemctl', ['reload', 'nginx']);
          for (let sample = 0; sample < 3; sample++) { probeSlot(p, p.targetSlot); await new Promise(resolve => setTimeout(resolve, 1000)); }
        } catch (error) {
          if (p.previous) { switchLink(p.previous.activeSlot); run('/usr/sbin/nginx', ['-t']); run('/usr/bin/systemctl', ['reload', 'nginx']); }
          throw error;
        }
        const current = { operationId: p.operationId, generation: p.generation + 1, activeSlot: p.targetSlot, blue: p.blue, green: p.green, planSha256: digest(p) };
        replace(`${STATE}/active.json`, canonical(current));
        return { ...bound, generation: current.generation, slot: current.activeSlot };
      }
      demand(phase === 'POSTCHECK', 'Unknown phase');
      demand(acceptedLink(p.targetSlot) && active()?.operationId === p.operationId, 'Cutover is not accepted');
      try {
        const ready = JSON.parse(http('https://api.leetplus.ru/health/ready', { resolve: 'api.leetplus.ru:443:127.0.0.1' }));
        const web = JSON.parse(http('https://leetplus.ru/api/release-identity', { resolve: 'leetplus.ru:443:127.0.0.1' }));
        demand(ready.release?.sha === p[p.targetSlot].releaseSha && web.release?.sha === p[p.targetSlot].releaseSha, 'Nginx TLS/SNI readiness mismatch');
        return { ...bound, slot: p.targetSlot, generation: p.generation + 1, authenticated: authenticatedSmoke(p.targetSlot) };
      } catch (error) {
        if (p.previous) rollbackAfterPostcheck(p, dir);
        throw error;
      }
    },
    reconcile: async function (phase, p) {
      // Each fixed phase is idempotent at its own boundary. Completed phases
      // are immutable and never re-applied by the orchestrator.
      if (phase === 'CUTOVER' && active()?.operationId === p.operationId) {
        demand(acceptedLink(p.targetSlot), 'Committed cutover link drift'); probeSlot(p, p.targetSlot);
        return { phase, planSha256: digest(p), generation: p.generation + 1, slot: p.targetSlot };
      }
      if (phase === 'SMOKE') {
        const record = await storeFor(dir).read();
        if (record.records.SMOKE?.evidence) {
          const observed = probeSlot(p, p.targetSlot);
          demand(canonical(observed) === canonical(record.records.SMOKE.evidence.observed), 'Smoke identity changed after evidence publication');
          authenticatedSmoke(p.targetSlot);
          return record.records.SMOKE.evidence;
        }
      }
      if (phase === 'POSTCHECK') {
        const record = await storeFor(dir).read();
        await this.run(phase, p);
        if (record.records.POSTCHECK?.evidence) return record.records.POSTCHECK.evidence;
      }
      return this.run(phase, p);
    },
  };
}

if (command === 'help' || !command) {
  console.log('leetplus-compose status | prepare --request <root-owned.json> | apply|resume --operation <uuid> --approval <root-owned.json>');
} else {
  demand(process.platform === 'linux' && process.getuid() === 0 && process.versions.node.split('.')[0] === '22', 'Linux root and Node 22 required');
  demand(process.env.LEETPLUS_COMPOSE_LOCKED === '1', 'Use the installed flock bootstrap');
  const lockInfo = fs.lstatSync(`${STATE}/control.lock`);
  demand(lockInfo.isFile() && !lockInfo.isSymbolicLink() && lockInfo.uid === 0 && lockInfo.nlink === 1 && !(lockInfo.mode & 0o077), 'Untrusted control lock');
  const locks = fs.readFileSync('/proc/locks', 'utf8').split('\n');
  const lockMode = ['status', 'boot', 'backup', 'worker-run'].includes(command) ? 'READ' : 'WRITE';
  demand(locks.some(line => { const fields = line.trim().split(/\s+/); return fields[1] === 'FLOCK' && fields[3] === lockMode && fields[4] === String(process.ppid) && fields[5]?.split(':').at(-1) === String(lockInfo.ino); }), 'Parent does not hold the kernel control lock');
  if (command === 'backup' || command === 'worker-run') {
    const name = command === 'backup' ? 'backup' : options.name;
    demand(['backup', 'bonus-ledger-worker', 'langame-daily-worker'].includes(name), 'Unknown singleton lock');
    const singleton = fs.lstatSync(`${STATE}/${name}.lock`);
    demand(singleton.isFile() && !singleton.isSymbolicLink() && singleton.uid === 0 && singleton.nlink === 1 && !(singleton.mode & 0o077), 'Invalid singleton lock file');
    const parentStatus = fs.readFileSync(`/proc/${process.ppid}/status`, 'utf8');
    const outerPid = parentStatus.match(/^PPid:\s+(\d+)$/m)?.[1];
    demand(locks.some(line => { const fields = line.trim().split(/\s+/); return fields[1] === 'FLOCK' && fields[3] === 'WRITE' && fields[4] === outerPid && fields[5]?.split(':').at(-1) === String(singleton.ino); }), 'Singleton kernel lock is not held');
  }
  directory(STATE); directory(`${STATE}/operations`);
  installedDigest();
  if (command === 'status') {
    const operations = [];
    for (const id of fs.readdirSync(`${STATE}/operations`)) {
      const dir = operation(id), plan = readJSON(`${dir}/plan.json`, { immutable: true }), state = await storeFor(dir).read();
      validatePlan(plan); validateChain(plan, state.records);
      operations.push({ operationId: id, targetSlot: plan.targetSlot, completed: Boolean(state.final), rolledBack: Boolean(state.rolledBack), phases: Object.keys(state.records) });
    }
    console.log(canonical({ active: active(), operations }));
  } else if (command === 'network') {
    demand(['install', 'refresh', 'verify', 'install-rehearsal', 'verify-rehearsal'].includes(options.operation), 'Unknown network operation');
    console.log(run('/usr/bin/python3', [`${CONTROL}/network-fence.py`, options.operation]));
  } else if (command === 'backup') {
    console.log(run('/usr/bin/python3', [`${CONTROL}/daily-backup.py`], { timeout: 3600000 }));
  } else if (command === 'prepare') {
    assertNoPending();
    const request = readJSON(options.request);
    const previous = active(), id = crypto.randomUUID();
    const plan = { ...request, contract: `${CONTRACT}_PLAN`, operationId: id, hostIdentitySha256: hostIdentity(), controlSha256: installedDigest(), previous, generation: previous?.generation ?? 0, action: previous ? 'ROLLOUT' : 'BOOTSTRAP' };
    plan.secretDigests = Object.fromEntries(['acceptance.json', 'api-blue.json', 'api-green.json', 'db-ca.pem'].map(leaf => [leaf, digest(safeFile(`${ROOT}/secrets/${leaf}`))]));
    plan.networkPolicySha256 = digest(safeFile('/etc/leetplus-compose/providers.json'));
    plan.databaseIdentitySha256 = digest(databaseIdentity());
    plan.composeSha256 = digest(renderCompose({ blue: plan.blue, green: plan.green, activeSlot: plan.targetSlot }));
    validatePlan(plan);
    const dir = operation(id); directory(dir); publish(`${dir}/plan.json`, plan);
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
      run('/usr/bin/python3', [`${CONTROL}/network-fence.py`, 'verify']);
      assertPrimaryDatabase(plan.databaseIdentitySha256);
      const slot = current.activeSlot;
      demand(digest(safeFile(`${ROOT}/secrets/api-${slot}.json`)) === plan.secretDigests[`api-${slot}.json`] && digest(safeFile(`${ROOT}/secrets/db-ca.pem`)) === plan.secretDigests['db-ca.pem'], 'Accepted runtime secret identity drift');
      const spec = renderCompose({ blue: current.blue, green: current.green, activeSlot: slot });
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
    assertPrimaryDatabase(activePlan.databaseIdentitySha256);
    run('/usr/bin/python3', [`${CONTROL}/network-fence.py`, 'verify']);
    const secretBytes = safeFile(`${ROOT}/secrets/${name}.json`);
    const grant = validateWorkerGrant(readJSON(`${STATE}/worker-grants/${name}.json`, { immutable: true }), safeFile('/etc/leetplus-compose/approval-root.pem'), current, hostIdentity(), secretBytes);
    const key = grant.mode === 'CANARY' ? grant.id : crypto.randomUUID();
    const dir = `${STATE}/worker-runs`; directory(dir);
    demand(!fs.existsSync(`${dir}/${key}.intent.json`), 'Canary already attempted; reconcile its existing outcome');
    const spec = renderCompose({ blue: current.blue, green: current.green, activeSlot: current.activeSlot });
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
    docker(['compose', '--project-name', 'leetplus', '--file', workerCompose, 'create', '--no-deps', '--force-recreate', name]);
    const service = spec.services[name];
    const imageEnvironment = docker(['image', 'inspect', service.image], { json: true })[0].Config.Env;
    verifyContainer(docker(['inspect', service.container_name], { json: true })[0], service, name, { beforeStart: true, imageEnvironment });
    const output = docker(['start', '--attach', service.container_name], { timeout: 960000 });
    const observed = docker(['inspect', service.container_name], { json: true })[0];
    demand(!observed.State.Running && observed.State.ExitCode === 0, 'Worker did not finish successfully');
    const receipt = { grantId: grant.id, activeGeneration: current.generation, releaseSha: grant.releaseSha, worker: name, completedAt: new Date().toISOString(), containerId: observed.Id, outputSha256: digest(output), decision: 'PASS' };
    publish(`${dir}/${key}.receipt.json`, receipt);
    console.log(canonical(receipt));
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
