import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { API_RESOURCE_PROFILE, CONTRACT, SCHEMA, renderCompose, verifyContainer, digest } from './contract.mjs';

const r = { contract: CONTRACT, ...SCHEMA, releaseSha: 'a'.repeat(40), builtAt: '2026-09-10T12:00:00Z', images: Object.fromEntries(['api', 'web', 'postgres', 'redis'].map((x, i) => [x, `sha256:${String(i + 1).repeat(64)}`])) };
const clone = v => structuredClone(v);
const withoutApiResources = service => { const value = { ...service }; delete value.mem_limit; delete value.memswap_limit; return value; };
const GIB = 1024 ** 3;
const bytes = value => {
  const [, amount, unit] = /^(\d+)([kmg])$/.exec(value);
  return Number(amount) * ({ k: 1024, m: 1024 ** 2, g: GIB })[unit];
};
function observed(service) {
  const project = service.container_name.slice(0, -service.labels['ru.leetplus.role'].length - 1);
  return { Id: 'b'.repeat(64), Name: `/${service.container_name}`, Image: service.image,
    Config: { User: service.user, Cmd: service.command, Entrypoint: service.entrypoint, Labels: service.labels, Env: Object.entries(service.environment ?? {}).map(([k, v]) => `${k}=${v}`) },
    HostConfig: { NetworkMode: 'leetplus-blue', Privileged: false, PublishAllPorts: false, PidMode: '', IpcMode: 'private', CapAdd: null, CapDrop: ['ALL'], SecurityOpt: ['no-new-privileges:true'], GroupAdd: service.group_add ?? null, ReadonlyRootfs: true, Memory: bytes(service.mem_limit), MemorySwap: Object.hasOwn(service, 'memswap_limit') ? bytes(service.memswap_limit) : 0, NanoCpus: Number(service.cpus) * 1_000_000_000, PidsLimit: 256, PortBindings: Object.fromEntries((service.ports ?? []).map(p => [`${p.target}/${p.protocol}`, [{ HostIp: p.host_ip, HostPort: p.published }]])) },
    Mounts: (service.volumes ?? []).map(m => ({ Type: m.type, Source: m.source, Destination: m.target, RW: !m.read_only })),
    NetworkSettings: { Ports: Object.fromEntries((service.ports ?? []).map(p => [`${p.target}/${p.protocol}`, [{ HostIp: p.host_ip, HostPort: p.published }]])), Networks: Object.fromEntries(Object.entries(service.networks).map(([k, v]) => [`${project}-${k}`, { IPAddress: v.ipv4_address, GwPriority: v.gw_priority ?? 0 }])) },
    State: { Running: true, Health: { Status: 'healthy' }, StartedAt: '2026-09-10T12:00:00Z' },
  };
}
test('stable rendering, exact image IDs and separate Web/DB/worker boundaries', () => {
  const compose = renderCompose({ blue: r, green: r });
  assert.equal(digest(compose), digest(renderCompose({ blue: r, green: r })));
  assert.equal(digest(compose), 'fceb4f0a8efb938ef0ea734b05fcac8e62d09fa1ebe96ceb9bdfe9c4debfff21');
  assert.equal(digest(renderCompose({ blue: r, green: r, rehearsal: true })), '38054f1ff7f69704b2328a52c1367269b888f200b1aea065fd5854d4f493cce2');
  assert.deepEqual(Object.keys(compose.services['web-blue'].networks), ['blue']);
  assert.equal(compose.services['web-blue'].environment.DATABASE_URL, undefined);
  assert.equal(compose.services.postgres.ports, undefined);
  assert.equal(compose.services.redis.ports, undefined);
  assert.deepEqual(compose.services['bonus-ledger-worker'].profiles, ['workers']);
  for (const s of Object.values(compose.services)) {
    assert.equal(s.read_only, true);
    assert.ok(!s.user.startsWith('0:'));
    for (const p of s.ports ?? []) assert.equal(p.host_ip, '127.0.0.1');
  }
});
test('release-bound API resource profiles preserve legacy bytes and isolate 6GiB API slots', () => {
  const api6 = { ...r, apiResourceProfile: API_RESOURCE_PROFILE };
  for (const rehearsal of [false, true]) {
    const legacy = renderCompose({ blue: r, green: r, rehearsal });
    const mixed = renderCompose({ blue: r, green: api6, rehearsal });
    const all6 = renderCompose({ blue: api6, green: api6, rehearsal });
    assert.deepEqual([mixed.services['api-blue'].mem_limit, mixed.services['api-blue'].memswap_limit], ['4g', undefined]);
    assert.deepEqual([mixed.services['api-green'].mem_limit, mixed.services['api-green'].memswap_limit], ['6g', '8g']);
    for (const name of ['api-blue', 'api-green']) assert.deepEqual([all6.services[name].mem_limit, all6.services[name].memswap_limit], ['6g', '8g']);
    assert.deepEqual(withoutApiResources(legacy.services['api-blue']), withoutApiResources(all6.services['api-blue']));
    const nonApi = ['web-blue', 'web-green', 'postgres', 'redis', 'bonus-ledger-worker', 'langame-daily-worker'];
    assert.deepEqual(Object.fromEntries(nonApi.map(name => [name, all6.services[name]])), Object.fromEntries(nonApi.map(name => [name, mixed.services[name]])));
    assert.deepEqual(Object.fromEntries(nonApi.map(name => [name, all6.services[name]])), Object.fromEntries(nonApi.map(name => [name, legacy.services[name]])));
  }
  const inherited = Object.assign(Object.create({ apiResourceProfile: API_RESOURCE_PROFILE }), r);
  assert.equal(digest(renderCompose({ blue: inherited, green: r })), digest(renderCompose({ blue: r, green: r })));
});
test('rehearsal has no egress network or production ports/directories', () => {
  const c = renderCompose({ blue: r, green: r, rehearsal: true });
  assert.equal(c.networks.data.internal, true);
  assert.equal(c.networks.blue.internal, false);
  assert.equal(c.networks.green.internal, false);
  assert.ok(Object.values(c.services).every(s => !s.networks.egress));
  assert.equal(c.services['api-blue'].ports[0].published, '24100');
  assert.ok(c.services.postgres.volumes[0].source.startsWith('/srv/leetplus-migration/rehearsal/'));
});
test('application and worker local dates preserve their distinct source timezones', () => {
  for (const rehearsal of [false, true]) {
    const compose = renderCompose({ blue: r, green: r, rehearsal });
    for (const [name, expectedDay] of [
      ['api-blue', 11], ['api-green', 11], ['web-blue', 11], ['web-green', 11],
      ['bonus-ledger-worker', 10], ['langame-daily-worker', 10],
    ]) {
      const result = spawnSync(process.execPath, ['-e', 'console.log(new Date("2026-09-10T22:30:00Z").getDate())'], {
        encoding: 'utf8', env: { ...process.env, TZ: compose.services[name].environment.TZ },
      });
      assert.equal(result.status, 0);
      assert.equal(Number(result.stdout.trim()), expectedDay, `${name} local date changed`);
    }
  }
});
test('rejects arbitrary tag, schema mismatch, unknown API profile and data-image drift', () => {
  for (const mutate of [x => x.images.api = 'node:latest', x => x.releaseSha = 'main', x => x.migrationCount = 192, x => x.apiResourceProfile = null, x => x.apiResourceProfile = 'API_12G_V1', x => x.apiResourceProfile = undefined]) {
    const bad = clone(r); mutate(bad);
    assert.throws(() => renderCompose({ blue: bad, green: r }));
  }
  const bad = clone(r); bad.images.postgres = `sha256:${'9'.repeat(64)}`;
  assert.throws(() => renderCompose({ blue: r, green: bad }));
});
test('attests exact rendered API memory, CPU and explicit total memory+swap ceilings', () => {
  const api6 = { ...r, apiResourceProfile: API_RESOURCE_PROFILE };
  const service = renderCompose({ blue: api6, green: api6 }).services['api-blue'];
  assert.equal(verifyContainer(observed(service), service, 'api-blue').image, service.image);
  const mutations = [
    x => x.HostConfig.Memory = 0,
    x => x.HostConfig.Memory = 5 * GIB,
    x => x.HostConfig.Memory = 7 * GIB,
    x => x.HostConfig.NanoCpus = 1_000_000_000,
    x => x.HostConfig.NanoCpus = 3_000_000_000,
    x => x.HostConfig.MemorySwap = 0,
    x => x.HostConfig.MemorySwap = 7 * GIB,
    x => x.HostConfig.MemorySwap = 9 * GIB,
  ];
  for (const mutate of mutations) { const value = observed(service); mutate(value); assert.throws(() => verifyContainer(value, service, 'api-blue')); }
  const legacy = renderCompose({ blue: r, green: r }).services['api-blue'];
  const legacyObserved = observed(legacy);
  legacyObserved.HostConfig.MemorySwap = 12 * GIB;
  assert.equal(verifyContainer(legacyObserved, legacy, 'api-blue').image, legacy.image);
  for (const [field, bad] of [['mem_limit', '0g'], ['mem_limit', '99999999999999999g'], ['cpus', '0']]) {
    const invalid = { ...service, [field]: bad };
    assert.throws(() => verifyContainer(observed(invalid), invalid, 'api-blue'));
  }
});
test('attests live Docker identity and rejects privilege, network, secret and command drift', () => {
  const service = renderCompose({ blue: r, green: r }).services['web-blue'];
  assert.equal(verifyContainer(observed(service), service, 'web-blue').image, service.image);
  const mutations = [
    x => x.Image = `sha256:${'9'.repeat(64)}`, x => x.Config.User = '0:0',
    x => x.HostConfig.Privileged = true, x => x.HostConfig.NetworkMode = 'host',
    x => x.HostConfig.ReadonlyRootfs = false, x => x.HostConfig.CapAdd = ['NET_ADMIN'],
    x => x.HostConfig.GroupAdd = ['0'],
    x => x.HostConfig.PidMode = 'host', x => x.Config.Cmd = ['api'],
    x => x.Config.Entrypoint = ['sh', '-c'],
    x => x.HostConfig.PortBindings['3000/tcp'][0].HostIp = '0.0.0.0',
    x => x.NetworkSettings.Ports['3000/tcp'] = null,
    x => x.Mounts.push({ Type: 'bind', Source: '/var/run/docker.sock', Destination: '/var/run/docker.sock', RW: true }),
    x => x.NetworkSettings.Networks['leetplus-data'] = { IPAddress: '172.31.42.99' },
    x => x.Config.Env = x.Config.Env.filter(v => !v.startsWith('API_URL=')),
    x => x.Config.Env = x.Config.Env.map(v => v.startsWith('TZ=') ? 'TZ=UTC' : v),
    x => x.State.Health.Status = 'unhealthy',
  ];
  for (const mutate of mutations) { const value = observed(service); mutate(value); assert.throws(() => verifyContainer(value, service, 'web-blue')); }
});
