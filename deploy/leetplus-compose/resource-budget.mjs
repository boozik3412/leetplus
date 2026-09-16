import fs from 'node:fs';
import path from 'node:path';
import { CONTRACT, API_RESOURCE_PROFILE, canonical, demand, digest, renderCompose } from './contract.mjs';

export const GIB = 1024 ** 3;
export const HOST_RESERVE_BYTES = 8 * GIB;
const AGE_MS = 30000;
const integer = (value, label, minimum = 0) => demand(Number.isSafeInteger(value) && value >= minimum, `Invalid ${label}`);

function bytes(value) {
  const match = /^(\d+)([mg])$/.exec(value ?? '');
  demand(match, 'Expected an explicit Compose memory limit');
  const result = Number(match[1]) * (match[2] === 'g' ? GIB : 1024 ** 2);
  integer(result, 'Compose memory limit', 1);
  return result;
}

/** A conservative observed envelope, NOT a reservation or unlimited-workload ceiling. */
export function evaluateResourceBudget({ compose, observation }, now = Date.now()) {
  demand(['leetplus', 'leetplus-rehearsal'].includes(compose?.name), 'Unknown budget project');
  const timestamp = Date.parse(observation?.capturedAt);
  demand(Number.isFinite(timestamp) && now >= timestamp && now - timestamp <= AGE_MS, 'Resource observation is stale or in the future');
  const { totalBytes, availableBytes, containers } = observation;
  integer(totalBytes, 'host RAM', 1); integer(availableBytes, 'available RAM');
  demand(availableBytes <= totalBytes && Array.isArray(containers), 'Invalid resource inventory');
  const planned = new Map();
  for (const [role, service] of Object.entries(compose.services ?? {})) {
    if (compose.name === 'leetplus-rehearsal' && service.profiles?.includes('workers')) continue;
    demand(service.container_name === `${compose.name}-${role}` && service.labels?.['ru.leetplus.contract'] === CONTRACT &&
      service.labels?.['ru.leetplus.role'] === role, 'Unbound planned container');
    planned.set(service.container_name, { role, cap: bytes(service.mem_limit) });
  }
  demand(planned.size === (compose.name === 'leetplus' ? 8 : 6), 'Incomplete resource plan');
  let observedBytes = 0, plannedCurrentBytes = 0, otherFiniteBytes = 0, otherUnlimitedBytes = 0;
  const ids = new Set(), names = new Set(), unlimited = [];
  for (const item of containers) {
    demand(/^[a-f0-9]{64}$/.test(item.id ?? '') && typeof item.name === 'string' && !ids.has(item.id) && !names.has(item.name), 'Duplicate or invalid container inventory');
    ids.add(item.id); names.add(item.name);
    integer(item.limitBytes, 'container limit'); integer(item.currentBytes, 'container memory');
    observedBytes += item.currentBytes;
    const target = planned.get(item.name);
    if (target) {
      demand(item.project === compose.name && item.contract === CONTRACT && item.role === target.role, 'Budget target identity mismatch');
      plannedCurrentBytes += item.currentBytes;
    } else if (item.limitBytes) {
      otherFiniteBytes += Math.max(item.limitBytes, item.currentBytes);
    } else {
      otherUnlimitedBytes += item.currentBytes;
      unlimited.push({ id: item.id, name: item.name, currentBytes: item.currentBytes });
    }
  }
  const plannedBytes = [...planned.values()].reduce((sum, item) => sum + item.cap, 0);
  const nonContainerObservedBytes = Math.max(0, totalBytes - availableBytes - observedBytes);
  const reserveBytes = Math.max(HOST_RESERVE_BYTES, nonContainerObservedBytes);
  const envelopeBytes = plannedBytes + otherFiniteBytes + otherUnlimitedBytes + reserveBytes;
  const additionalPlannedBytes = Math.max(0, plannedBytes - plannedCurrentBytes);
  const reasons = [];
  if (envelopeBytes > totalBytes) reasons.push('CONFIGURED_ENVELOPE_EXCEEDS_RAM');
  if (additionalPlannedBytes + HOST_RESERVE_BYTES > availableBytes) reasons.push('INSUFFICIENT_AVAILABLE_RAM_WITH_RESERVE');
  return {
    contract: 'LEETPLUS_RESOURCE_BUDGET_V1',
    decision: reasons.length ? 'HOLD' : 'OBSERVED_ENVELOPE_PASS',
    capturedAt: observation.capturedAt, composeSha256: digest(compose), observationSha256: digest(observation),
    totalBytes, availableBytes, plannedBytes, otherFiniteBytes, otherUnlimitedBytes,
    nonContainerObservedBytes, reserveBytes, envelopeBytes, additionalPlannedBytes,
    headroomBytes: totalBytes - envelopeBytes, reasons, unlimited,
    guaranteedFutureCeiling: false,
    warnings: unlimited.length ? ['OTHER_UNLIMITED_WORKLOADS_REQUIRE_MONITORING'] : [],
  };
}

// Read-only collection. The caller supplies its bounded, clean-environment
// Docker runner; credentials from inspect never appear in returned evidence.
export function collectResourceObservation(docker, read = file => fs.readFileSync(file, 'utf8'), now = () => Date.now()) {
  const started = now();
  const list = () => docker(['ps', '--no-trunc', '--quiet']).trim().split(/\s+/).filter(Boolean).sort();
  const ids = list();
  demand(ids.every(id => /^[a-f0-9]{64}$/.test(id)) && new Set(ids).size === ids.length && ids.length <= 256, 'Invalid running inventory');
  const inspected = ids.length ? JSON.parse(docker(['inspect', ...ids])) : [];
  const identity = items => items.map(item => ({ id: item.Id, name: item.Name,
    running: item.State?.Running, pid: item.State?.Pid, startedAt: item.State?.StartedAt,
    restarts: item.RestartCount, limit: item.HostConfig.Memory,
    project: item.Config.Labels?.['com.docker.compose.project'],
    contract: item.Config.Labels?.['ru.leetplus.contract'], role: item.Config.Labels?.['ru.leetplus.role'] })).sort((a, b) => a.id.localeCompare(b.id));
  const containers = inspected.map(item => {
    demand(item.State?.Running === true && Number.isSafeInteger(item.State.Pid) && item.State.Pid > 0, 'Container stopped during resource observation');
    const lines = read(`/proc/${item.State.Pid}/cgroup`).trim().split('\n');
    demand(lines.length === 1 && lines[0].startsWith('0::/'), 'Unified cgroup v2 is required');
    const group = lines[0].slice(3);
    demand(path.posix.normalize(group) === group && !group.split('/').includes('..'), 'Invalid cgroup path');
    const raw = read(`/sys/fs/cgroup${group}/memory.current`).trim();
    demand(/^\d+$/.test(raw), 'Invalid cgroup memory counter');
    return { id: item.Id, name: item.Name.replace(/^\//, ''),
      project: item.Config.Labels?.['com.docker.compose.project'] ?? null,
      contract: item.Config.Labels?.['ru.leetplus.contract'] ?? null,
      role: item.Config.Labels?.['ru.leetplus.role'] ?? null,
      limitBytes: item.HostConfig.Memory, currentBytes: Number(raw) };
  });
  demand(canonical(ids) === canonical(containers.map(item => item.id).sort()) && canonical(ids) === canonical(list()), 'Running inventory changed during collection');
  const rechecked = ids.length ? JSON.parse(docker(['inspect', ...ids])) : [];
  demand(canonical(identity(inspected)) === canonical(identity(rechecked)), 'Container identity changed during resource sampling');
  const meminfo = read('/proc/meminfo');
  const memory = name => {
    const match = new RegExp(`^${name}:\\s+(\\d+) kB$`, 'm').exec(meminfo);
    demand(match, 'Host memory information missing');
    return Number(match[1]) * 1024;
  };
  demand(now() - started < AGE_MS, 'Resource collection exceeded freshness bound');
  return { capturedAt: new Date(started).toISOString(), totalBytes: memory('MemTotal'), availableBytes: memory('MemAvailable'), containers };
}

export function requireResourceBudget(compose, docker) {
  const observation = collectResourceObservation(docker);
  const result = evaluateResourceBudget({ compose, observation });
  demand(result.decision === 'OBSERVED_ENVELOPE_PASS', `Resource budget HOLD: ${result.reasons.join(',')}`);
  return result;
}

export function verifyResourceAcceptance(value, target) {
  const expected = digest(renderCompose({ blue: target, green: target, rehearsal: true }));
  const resource = value?.resourceAcceptance, guard = resource?.guard, corpus = resource?.corpus;
  demand(value?.decision === 'PASS' && value.releaseSha === target.releaseSha && value.apiResourceProfile === API_RESOURCE_PROFILE &&
    /^[a-f0-9]{64}$/.test(value.sourceDumpSha256 ?? '') && value.providerEgress === 'DENIED' && value.liveWorkers === 'NOT_STARTED',
  'Exact isolated 6 GiB rehearsal evidence is required');
  demand(resource?.decision === 'PASS' && resource.mode === 'BOUNDED_MONITORED_REHEARSAL' && resource.composeSha256 === expected &&
    guard?.decision === 'PASS' && guard.composeSha256 === expected && guard.failure === null &&
    /^[a-f0-9]{64}$/.test(guard.activeReceiptSha256 ?? '') && /^[a-f0-9]{64}$/.test(guard.samplesSha256 ?? ''),
  'Measured resource window does not bind the admitted Compose');
  demand(corpus?.decision === 'PASS' && corpus.releaseSha === target.releaseSha && corpus.sourceDumpSha256 === value.sourceDumpSha256 &&
    corpus.apiResourceProfile === API_RESOURCE_PROFILE && corpus.businessCountsUnchanged === true &&
    corpus.cooldownSeconds >= 60 && resource.cooldown?.decision === 'PASS', 'Measured resource corpus/cooldown did not pass');
  const roles = ['api-blue', 'api-green', 'web-blue', 'web-green'];
  demand(Array.isArray(guard.cleanup) && guard.cleanup.length === roles.length &&
    canonical(guard.cleanup.map(item => item.role).sort()) === canonical([...roles].sort()) &&
    guard.cleanup.every(item => ['STOPPED', 'ALREADY_STOPPED'].includes(item.decision) && item.id === guard.pinned?.[item.role]?.id),
  'Rehearsal cleanup is incomplete or unbound');
  return value;
}
