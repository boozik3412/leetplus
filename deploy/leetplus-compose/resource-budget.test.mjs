import assert from 'node:assert/strict';
import test from 'node:test';
import { API_RESOURCE_PROFILE, CONTRACT, SCHEMA, renderCompose, digest } from './contract.mjs';
import { GIB, evaluateResourceBudget, collectResourceObservation, verifyResourceAcceptance } from './resource-budget.mjs';

const release = { contract: CONTRACT, ...SCHEMA, apiResourceProfile: API_RESOURCE_PROFILE,
  releaseSha: 'a'.repeat(40), builtAt: '2026-09-10T12:00:00Z',
  images: Object.fromEntries(['api', 'web', 'postgres', 'redis'].map((role, i) => [role, `sha256:${String(i).repeat(64)}`])) };
const now = Date.parse('2026-09-16T10:00:00Z');
const spec = rehearsal => renderCompose({ blue: release, green: release, rehearsal });
const snapshot = containers => ({ capturedAt: new Date(now).toISOString(), totalBytes: 64 * GIB, availableBytes: 48 * GIB, containers });
const item = (n, fields = {}) => ({ id: String(n).padStart(64, '0'), name: `other-${n}`, project: 'other', contract: null, role: null, limitBytes: 4 * GIB, currentBytes: GIB, ...fields });
const evaluate = (observation, rehearsal = false) => evaluateResourceBudget({ compose: spec(rehearsal), observation }, now);

test('production expansion requires exact release/profile/clone cleanup and measured cooldown evidence', () => {
  const hash = 'a'.repeat(64), composeSha256 = digest(spec(true));
  const roles = ['api-blue', 'api-green', 'web-blue', 'web-green'];
  const value = { decision: 'PASS', releaseSha: release.releaseSha, apiResourceProfile: API_RESOURCE_PROFILE,
    sourceDumpSha256: hash, providerEgress: 'DENIED', liveWorkers: 'NOT_STARTED', resourceAcceptance: {
      decision: 'PASS', mode: 'BOUNDED_MONITORED_REHEARSAL', composeSha256,
      guard: { decision: 'PASS', composeSha256, failure: null, activeReceiptSha256: hash, samplesSha256: hash,
        pinned: Object.fromEntries(roles.map((role, i) => [role, { id: String(i).repeat(64) }])),
        cleanup: roles.map((role, i) => ({ role, id: String(i).repeat(64), decision: 'STOPPED' })) },
      corpus: { decision: 'PASS', releaseSha: release.releaseSha, sourceDumpSha256: hash, apiResourceProfile: API_RESOURCE_PROFILE, businessCountsUnchanged: true, cooldownSeconds: 60 },
      cooldown: { decision: 'PASS' } } };
  assert.equal(verifyResourceAcceptance(value, release), value);
  for (const mutate of [
    v => delete v.apiResourceProfile,
    v => v.resourceAcceptance.guard.composeSha256 = 'b'.repeat(64),
    v => v.resourceAcceptance.corpus.sourceDumpSha256 = 'b'.repeat(64),
    v => v.resourceAcceptance.guard.cleanup.pop(),
    v => v.resourceAcceptance.guard.cleanup[0].decision = 'STOP_FAILED',
    v => v.resourceAcceptance.cooldown.decision = 'HOLD',
  ]) { const bad = structuredClone(value); mutate(bad); assert.throws(() => verifyResourceAcceptance(bad, release)); }
});

test('reserves both API slots, data and dormant production workers; rehearsal excludes workers', () => {
  const report = evaluate(snapshot([item(1)]));
  assert.equal(report.plannedBytes, 24.25 * GIB);
  assert.equal(report.otherFiniteBytes, 4 * GIB);
  assert.equal(report.decision, 'OBSERVED_ENVELOPE_PASS');
  assert.equal(evaluate(snapshot([]), true).plannedBytes, 22.25 * GIB);
  assert.equal(report.guaranteedFutureCeiling, false);
});

test('replaces only exact project identities, never similarly prefixed historical containers', () => {
  const own = item(1, { name: 'leetplus-api-blue', project: 'leetplus', contract: CONTRACT, role: 'api-blue' });
  const old = item(2, { name: 'leetplus-old-api-blue', project: 'leetplus-old' });
  const result = evaluate(snapshot([own, old]));
  assert.equal(result.otherFiniteBytes, 4 * GIB);
  assert.equal(result.additionalPlannedBytes, 23.25 * GIB);
  for (const field of ['project', 'contract', 'role']) {
    assert.throws(() => evaluate(snapshot([{ ...own, [field]: 'wrong' }])), /identity mismatch/);
  }
});

test('insufficient configured or observed headroom blocks even with a superficially large free value', () => {
  const full = evaluate(snapshot([item(1, { limitBytes: 40 * GIB })]));
  assert.equal(full.decision, 'HOLD');
  assert.ok(full.reasons.includes('CONFIGURED_ENVELOPE_EXCEEDS_RAM'));
  const pressure = evaluate({ ...snapshot([]), availableBytes: 10 * GIB });
  assert.equal(pressure.decision, 'HOLD');
  assert.ok(pressure.reasons.includes('INSUFFICIENT_AVAILABLE_RAM_WITH_RESERVE'));
});

test('unlimited peers are explicit observed risk, never silently zero or a guaranteed ceiling', () => {
  const report = evaluate(snapshot([item(1, { limitBytes: 0, currentBytes: 2 * GIB })]));
  assert.equal(report.otherUnlimitedBytes, 2 * GIB);
  assert.equal(report.unlimited.length, 1);
  assert.deepEqual(report.warnings, ['OTHER_UNLIMITED_WORKLOADS_REQUIRE_MONITORING']);
  assert.equal(report.guaranteedFutureCeiling, false);
});

test('rejects stale, future, malformed and duplicate observations', () => {
  for (const delta of [-30001, 1]) assert.throws(() => evaluate({ ...snapshot([]), capturedAt: new Date(now + delta).toISOString() }), /stale|future/);
  for (const value of [-1, NaN, Infinity, 1.5]) assert.throws(() => evaluate(snapshot([item(1, { currentBytes: value })])), /memory/);
  assert.throws(() => evaluate(snapshot([item(1), item(1)])), /Duplicate/);
  assert.throws(() => evaluateResourceBudget({ compose: { ...spec(false), services: {} }, observation: snapshot([]) }, now), /Incomplete/);
});

test('collector keeps only resource metadata, checks cgroup and detects inventory races', () => {
  const id = 'b'.repeat(64);
  const docker = args => args[0] === 'ps' ? id : JSON.stringify([{ Id: id, Name: '/peer', State: { Running: true, Pid: 12 }, Config: { Labels: {}, Env: ['SECRET=never-return'] }, HostConfig: { Memory: GIB } }]);
  const read = file => ({ '/proc/12/cgroup': '0::/system.slice/docker-test.scope\n', '/sys/fs/cgroup/system.slice/docker-test.scope/memory.current': '1024\n', '/proc/meminfo': 'MemTotal: 67108864 kB\nMemAvailable: 50331648 kB\n' })[file];
  const result = collectResourceObservation(docker, read, () => now);
  assert.equal(result.containers[0].currentBytes, 1024);
  assert.equal(JSON.stringify(result).includes('SECRET'), false);
  assert.equal(result.totalBytes, 64 * GIB);
  let lists = 0;
  assert.throws(() => collectResourceObservation(args => args[0] === 'ps' && ++lists === 2 ? '' : docker(args), read, () => now), /inventory changed/);
  let inspections = 0;
  assert.throws(() => collectResourceObservation(args => {
    const value = docker(args);
    if (args[0] !== 'inspect' || ++inspections < 2) return value;
    const changed = JSON.parse(value); changed[0].State.Pid = 13;
    return JSON.stringify(changed);
  }, read, () => now), /identity changed/);
  assert.throws(() => collectResourceObservation(docker, file => file.endsWith('/cgroup') ? '0::/../elsewhere' : read(file), () => now), /cgroup path/);
});
