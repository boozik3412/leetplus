import crypto from 'node:crypto';
import path from 'node:path';

export const CONTRACT = 'LEETPLUS_COMPOSE_BLUE_GREEN_V1';
export const SCHEMA = { migrationCount: 191, migration: '20260908180000_external_langame_simple_onboarding' };
export const SLOTS = ['blue', 'green'];
export const PORTS = { blue: { web: 13100, api: 14100 }, green: { web: 13200, api: 14200 } };
export const USERS = { 'api-blue': 12010, 'api-green': 12011, 'web-blue': 12020, 'web-green': 12021, postgres: 12030, redis: 12031, 'bonus-ledger-worker': 12040, 'langame-daily-worker': 12041 };
export const SAFE_API = Object.freeze({
  NODE_ENV: 'production', API_RUNTIME_ROLE: 'COMBINED', API_BIND_HOST: '0.0.0.0', PORT: '4000',
  PRODUCTION_NETWORK_PROFILE: 'DOCKER_BRIDGE', COMPOSE_RUNTIME_CONTRACT: CONTRACT,
  ACCESS_SCOPE_ENFORCEMENT_MODE: 'ENFORCED', STAFF_ATTACHMENT_ACL_MODE: 'ENFORCED',
  GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED: 'false', LANGAME_DAILY_SYNC_SCHEDULER_ENABLED: 'false',
  LANGAME_SCHEDULED_HTTP_ENABLED: 'false', GUEST_ACTIVITY_LEDGER_SCHEDULER_ENABLED: 'false',
  GUEST_GAME_PIPELINE_SCHEDULER_ENABLED: 'false', GUEST_GAME_REWARD_MATERIALIZER_ENABLED: 'false',
  GUEST_GAME_REWARD_MATERIALIZER_KILL_SWITCH: 'false', GUEST_GAME_SUPPLEMENTAL_PIPELINE_MODE: 'OFF',
  GUEST_GAME_MONITORING_ENABLED: 'false', GUEST_BUG_REPORTING_MODE: 'LIVE', GUEST_SUPPORT_SCHEMA_BRIDGE_MODE: 'OFF',
  LANGAME_DISCREPANCY_LOG_ROOT: '/var/lib/leetplus/langame-sync',
});
export function canonical(value) { return `${JSON.stringify(value, null, 2)}\n`; }
export function digest(value) { return crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex'); }
export function demand(condition, message) { if (!condition) throw new Error(message); }
export function imageId(value) { demand(/^sha256:[a-f0-9]{64}$/.test(value ?? ''), 'Image must be an exact loaded image ID'); return value; }
export function release(value) {
  demand(value?.contract === CONTRACT && /^[a-f0-9]{40}$/.test(value.releaseSha ?? ''), 'Invalid release identity');
  demand(value.migrationCount === SCHEMA.migrationCount && value.migration === SCHEMA.migration, 'Only CURRENT191 is admitted');
  demand(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value.builtAt ?? '') && Number.isFinite(Date.parse(value.builtAt)), 'Invalid build time');
  for (const role of ['api', 'web', 'postgres', 'redis']) imageId(value.images?.[role]);
  return value;
}
export function rootPath(root, rehearsal) {
  demand(root === (rehearsal ? '/srv/leetplus-migration/rehearsal' : '/srv/leetplus'), 'Noncanonical project root');
  demand(path.posix.normalize(root) === root, 'Unsafe root');
  return root;
}
function metadata(r) {
  return { RELEASE_SHA: r.releaseSha, BUILD_TIME: r.builtAt, WEB_BUILD_ID: r.releaseSha,
    EXPECTED_DATABASE_MIGRATION: r.migration, EXPECTED_DATABASE_MIGRATION_COUNT: String(r.migrationCount) };
}
export function renderCompose({ blue, green, activeSlot = 'blue', rehearsal = false }) {
  release(blue); release(green); demand(SLOTS.includes(activeSlot), 'Invalid active slot');
  demand(blue.images.postgres === green.images.postgres && blue.images.redis === green.images.redis, 'Data services cannot change in an application rollout');
  const root = rootPath(rehearsal ? '/srv/leetplus-migration/rehearsal' : '/srv/leetplus', rehearsal);
  const project = rehearsal ? 'leetplus-rehearsal' : 'leetplus';
  const offset = rehearsal ? 10 : 0;
  const subnet = n => `172.31.${40 + offset + n}`;
  const services = {};
  const network = (name, suffix) => ({ [name]: { ipv4_address: `${subnet({ blue: 0, green: 1, data: 2, egress: 3 }[name])}.${suffix}` } });
  const bind = (source, target, readOnly = true) => ({ type: 'bind', source: `${root}/${source}`, target, read_only: readOnly, bind: { create_host_path: false } });
  const base = (name, image, r, memory = '1g', cpus = '1.0') => ({
    image: imageId(image), platform: 'linux/amd64', container_name: `${project}-${name}`,
    user: `${USERS[name]}:${USERS[name]}`, read_only: true, cap_drop: ['ALL'],
    security_opt: ['no-new-privileges:true'], pids_limit: 256, mem_limit: memory, cpus,
    restart: 'unless-stopped', init: true, stop_grace_period: '45s',
    tmpfs: ['/tmp:rw,noexec,nosuid,nodev,size=134217728,mode=1777'],
    labels: { 'ru.leetplus.contract': CONTRACT, 'ru.leetplus.release': r.releaseSha, 'ru.leetplus.role': name },
    logging: { driver: 'local', options: { 'max-size': '10m', 'max-file': '3' } },
  });
  for (const slot of SLOTS) {
    const r = slot === 'blue' ? blue : green;
    const api = `api-${slot}`, web = `web-${slot}`;
    const apiBase = base(api, r.images.api, r, '1g', '2.0');
    services[api] = { ...apiBase, entrypoint: ['node', '/opt/leetplus/runtime-entry.cjs'], command: ['api'], environment: { ...SAFE_API, ...metadata(r) },
      ports: [{ target: 4000, published: String(PORTS[slot].api + (rehearsal ? 10000 : 0)), host_ip: '127.0.0.1', protocol: 'tcp' }],
      networks: { ...network(slot, 2), ...network('data', slot === 'blue' ? 10 : 11), ...(!rehearsal ? network('egress', slot === 'blue' ? 10 : 11) : {}) },
      volumes: [bind(`secrets/${api}.json`, '/run/secrets/runtime.json'), bind('secrets/db-ca.pem', '/run/secrets/db-ca.pem'), bind('data/langame-sync', '/var/lib/leetplus/langame-sync', false)],
      group_add: ['12050'],
      healthcheck: { test: ['CMD', 'node', '/opt/leetplus/health.cjs', 'api'], interval: '10s', timeout: '6s', retries: 9, start_period: '30s' },
      depends_on: { postgres: { condition: 'service_healthy' } },
    };
    services[web] = { ...base(web, r.images.web, r), entrypoint: ['node', '/opt/leetplus/runtime-entry.cjs'], command: ['web'],
      environment: { ...metadata(r), NODE_ENV: 'production', API_URL: `http://${api}:4000`, NEXT_PUBLIC_API_URL: 'https://api.leetplus.ru', NEXT_TELEMETRY_DISABLED: '1' },
      ports: [{ target: 3000, published: String(PORTS[slot].web + (rehearsal ? 10000 : 0)), host_ip: '127.0.0.1', protocol: 'tcp' }],
      networks: network(slot, 3), volumes: [bind(`data/web-cache-${slot}`, '/app/apps/web/.next/cache', false)],
      healthcheck: { test: ['CMD', 'node', '/opt/leetplus/health.cjs', 'web'], interval: '10s', timeout: '6s', retries: 9, start_period: '30s' },
      depends_on: { [api]: { condition: 'service_healthy' } },
    };
  }
  services.postgres = { ...base('postgres', blue.images.postgres, blue, '8g', '4.0'), shm_size: '1g', entrypoint: ['/usr/local/bin/leetplus-postgres'],
    networks: network('data', 2),
    volumes: [bind('data/postgres', '/var/lib/postgresql/16/main', false), bind('secrets/postgres', '/etc/leetplus-postgres')],
    healthcheck: { test: ['CMD', '/usr/lib/postgresql/16/bin/pg_isready', '-h', '127.0.0.1'], interval: '5s', timeout: '4s', retries: 12 },
  };
  services.redis = { ...base('redis', blue.images.redis, blue, '256m', '0.5'), entrypoint: ['docker-entrypoint.sh'], command: ['redis-server', '--save', '', '--appendonly', 'no', '--maxmemory', '128mb', '--maxmemory-policy', 'allkeys-lru'], networks: network('data', 3), volumes: [bind('data/redis', '/data', false)] };
  const active = activeSlot === 'blue' ? blue : green;
  for (const [index, name] of ['bonus-ledger-worker', 'langame-daily-worker'].entries()) {
    services[name] = { ...base(name, active.images.api, active, '1g', '2.0'), entrypoint: ['node', '/opt/leetplus/runtime-entry.cjs'], command: [name], restart: 'no', profiles: ['workers'],
      environment: { ...metadata(active), NODE_ENV: 'production' },
      networks: { ...network('data', 20 + index), ...(!rehearsal ? network('egress', 20 + index) : {}) },
      volumes: [bind(`secrets/${name}.json`, '/run/secrets/runtime.json'), bind('secrets/db-ca.pem', '/run/secrets/db-ca.pem'), ...(index === 1 ? [bind('data/langame-sync', '/var/lib/leetplus/langame-sync', false)] : [])],
      group_add: index === 1 ? ['12050'] : [], stop_grace_period: '900s',
    };
  }
  const networks = {};
  for (const [index, name] of ['blue', 'green', 'data', 'egress'].entries()) {
    if (name === 'egress' && rehearsal) continue;
    networks[name] = { name: `${project}-${name}`, driver: 'bridge', enable_ipv6: false, internal: name !== 'egress', ipam: { config: [{ subnet: `${subnet(index)}.0/24` }] } };
  }
  return { name: project, services, networks };
}

export function verifyContainer(observed, service, name, { beforeStart = false, imageEnvironment } = {}) {
  const h = observed.HostConfig, c = observed.Config;
  demand(observed.Name === `/${service.container_name}`, `${name}: container identity drift`);
  demand(observed.Image === service.image && c.User === service.user, `${name}: image/user drift`);
  demand(h && !h.Privileged && !h.PublishAllPorts && !['host', 'container'].some(x => h.NetworkMode?.startsWith(x)), `${name}: unsafe namespace`);
  demand(!h.PidMode && (!h.IpcMode || h.IpcMode === 'private') && !h.CapAdd?.length && h.ReadonlyRootfs, `${name}: unsafe process/filesystem privileges`);
  demand(!h.Devices?.length && !h.DeviceRequests?.length && !h.ExtraHosts?.length, `${name}: unexpected device or host mapping`);
  demand(h.CapDrop?.length === 1 && h.CapDrop[0].toUpperCase() === 'ALL' && h.SecurityOpt?.length === 1 && h.SecurityOpt.some(x => /^no-new-privileges(?::true)?$/.test(x)), `${name}: missing privilege fence`);
  demand(JSON.stringify(c.Cmd) === JSON.stringify(service.command ?? c.Cmd), `${name}: entrypoint arguments drift`);
  demand(JSON.stringify(c.Entrypoint) === JSON.stringify(service.entrypoint), `${name}: entrypoint drift`);
  const published = Object.entries(h.PortBindings ?? {}).flatMap(([key, values]) => (values ?? []).map(x => `${key}:${x.HostIp}:${x.HostPort}`)).sort();
  const wanted = (service.ports ?? []).map(p => `${p.target}/${p.protocol}:${p.host_ip}:${p.published}`).sort();
  demand(JSON.stringify(published) === JSON.stringify(wanted), `${name}: published port drift`);
  const mounts = observed.Mounts.filter(m => m.Type !== 'tmpfs').map(m => `${m.Type}:${m.Source}:${m.Destination}:${m.RW}`).sort();
  const expectedMounts = (service.volumes ?? []).map(m => `${m.type}:${m.source}:${m.target}:${!m.read_only}`).sort();
  demand(JSON.stringify(mounts) === JSON.stringify(expectedMounts), `${name}: unexpected mount`);
  const project = service.container_name.slice(0, -name.length - 1);
  const actualNetworks = Object.entries(observed.NetworkSettings.Networks).map(([key, value]) => `${key}:${value.IPAddress || (beforeStart ? value.IPAMConfig?.IPv4Address : '')}`).sort();
  const expectedNetworks = Object.entries(service.networks).map(([key, value]) => `${project}-${key}:${value.ipv4_address}`).sort();
  demand(JSON.stringify(actualNetworks) === JSON.stringify(expectedNetworks), `${name}: network membership drift`);
  for (const [key, value] of Object.entries(service.labels)) demand(c.Labels[key] === value, `${name}: label drift`);
  for (const [key, value] of Object.entries(service.environment ?? {})) demand(c.Env.includes(`${key}=${value}`), `${name}: bound environment drift`);
  if (imageEnvironment) {
    const expected = Object.fromEntries(imageEnvironment.map(value => { const i = value.indexOf('='); return [value.slice(0, i), value.slice(i + 1)]; }));
    Object.assign(expected, service.environment ?? {});
    demand(JSON.stringify([...c.Env].sort()) === JSON.stringify(Object.entries(expected).map(([k, v]) => `${k}=${v}`).sort()), `${name}: unexpected process environment`);
  }
  demand(h.Memory > 0 && h.NanoCpus > 0 && h.PidsLimit === service.pids_limit, `${name}: resource bounds missing`);
  demand(beforeStart ? observed.State.Status === 'created' && !observed.State.Running && observed.State.Pid === 0 : observed.State.Running && (!service.healthcheck || observed.State.Health?.Status === 'healthy'), `${name}: unexpected runtime state`);
  return { name, id: observed.Id, image: observed.Image, startedAt: observed.State.StartedAt };
}
