import assert from 'node:assert/strict';
import test from 'node:test';
import { CONTRACT, SCHEMA, renderCompose, verifyContainer, digest } from './contract.mjs';

const r = { contract: CONTRACT, ...SCHEMA, releaseSha: 'a'.repeat(40), builtAt: '2026-09-10T12:00:00Z', images: Object.fromEntries(['api', 'web', 'postgres', 'redis'].map((x, i) => [x, `sha256:${String(i + 1).repeat(64)}`])) };
const clone = v => structuredClone(v);
function observed(service) {
  const project = service.container_name.slice(0, -service.labels['ru.leetplus.role'].length - 1);
  return { Id: 'b'.repeat(64), Name: `/${service.container_name}`, Image: service.image,
    Config: { User: service.user, Cmd: service.command, Entrypoint: service.entrypoint, Labels: service.labels, Env: Object.entries(service.environment ?? {}).map(([k, v]) => `${k}=${v}`) },
    HostConfig: { NetworkMode: 'leetplus-blue', Privileged: false, PublishAllPorts: false, PidMode: '', IpcMode: 'private', CapAdd: null, CapDrop: ['ALL'], SecurityOpt: ['no-new-privileges:true'], ReadonlyRootfs: true, Memory: 1024, NanoCpus: 1000, PidsLimit: 256, PortBindings: Object.fromEntries((service.ports ?? []).map(p => [`${p.target}/${p.protocol}`, [{ HostIp: p.host_ip, HostPort: p.published }]])) },
    Mounts: (service.volumes ?? []).map(m => ({ Type: m.type, Source: m.source, Destination: m.target, RW: !m.read_only })),
    NetworkSettings: { Networks: Object.fromEntries(Object.entries(service.networks).map(([k, v]) => [`${project}-${k}`, { IPAddress: v.ipv4_address }])) },
    State: { Running: true, Health: { Status: 'healthy' }, StartedAt: '2026-09-10T12:00:00Z' },
  };
}
test('stable rendering, exact image IDs and separate Web/DB/worker boundaries', () => {
  const compose = renderCompose({ blue: r, green: r });
  assert.equal(digest(compose), digest(renderCompose({ blue: r, green: r })));
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
test('rehearsal has no egress network or production ports/directories', () => {
  const c = renderCompose({ blue: r, green: r, rehearsal: true });
  assert.ok(Object.values(c.networks).every(n => n.internal));
  assert.ok(Object.values(c.services).every(s => !s.networks.egress));
  assert.equal(c.services['api-blue'].ports[0].published, '15100');
  assert.ok(c.services.postgres.volumes[0].source.startsWith('/srv/leetplus-migration/rehearsal/'));
});
test('rejects arbitrary tag, schema mismatch and data-image drift', () => {
  for (const mutate of [x => x.images.api = 'node:latest', x => x.releaseSha = 'main', x => x.migrationCount = 192]) {
    const bad = clone(r); mutate(bad);
    assert.throws(() => renderCompose({ blue: bad, green: r }));
  }
  const bad = clone(r); bad.images.postgres = `sha256:${'9'.repeat(64)}`;
  assert.throws(() => renderCompose({ blue: r, green: bad }));
});
test('attests live Docker identity and rejects privilege, network, secret and command drift', () => {
  const service = renderCompose({ blue: r, green: r }).services['web-blue'];
  assert.equal(verifyContainer(observed(service), service, 'web-blue').image, service.image);
  const mutations = [
    x => x.Image = `sha256:${'9'.repeat(64)}`, x => x.Config.User = '0:0',
    x => x.HostConfig.Privileged = true, x => x.HostConfig.NetworkMode = 'host',
    x => x.HostConfig.ReadonlyRootfs = false, x => x.HostConfig.CapAdd = ['NET_ADMIN'],
    x => x.HostConfig.PidMode = 'host', x => x.Config.Cmd = ['api'],
    x => x.Config.Entrypoint = ['sh', '-c'],
    x => x.HostConfig.PortBindings['3000/tcp'][0].HostIp = '0.0.0.0',
    x => x.Mounts.push({ Type: 'bind', Source: '/var/run/docker.sock', Destination: '/var/run/docker.sock', RW: true }),
    x => x.NetworkSettings.Networks['leetplus-data'] = { IPAddress: '172.31.42.99' },
    x => x.Config.Env = x.Config.Env.filter(v => !v.startsWith('API_URL=')),
    x => x.State.Health.Status = 'unhealthy',
  ];
  for (const mutate of mutations) { const value = observed(service); mutate(value); assert.throws(() => verifyContainer(value, service, 'web-blue')); }
});
