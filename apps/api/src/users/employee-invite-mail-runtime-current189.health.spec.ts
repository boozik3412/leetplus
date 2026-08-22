import { request, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  EmployeeInviteMailRuntimeCurrent189HealthServer,
  type EmployeeInviteMailRuntimeCurrent189HealthState,
} from './employee-invite-mail-runtime-current189.health';

const RELEASE_SHA = 'a'.repeat(40);

type HealthResponse = Readonly<{
  statusCode: number;
  headers: IncomingHttpHeaders;
  body: string;
}>;

type InspectableHealthServer = Readonly<{
  server: Server | null;
}>;

function boundAddress(
  health: EmployeeInviteMailRuntimeCurrent189HealthServer,
): AddressInfo {
  const server = (health as unknown as InspectableHealthServer).server;
  const address = server?.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected a bound loopback employee-invite health server');
  }
  return address;
}

function healthRequest(
  port: number,
  path: '/health' | '/ready' | '/unknown' = '/health',
  method = 'GET',
): Promise<HealthResponse> {
  return new Promise((resolve, reject) => {
    const outgoing = request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
      },
      (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
        incoming.once('error', reject);
        incoming.once('end', () => {
          resolve({
            statusCode: incoming.statusCode ?? 0,
            headers: incoming.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    outgoing.once('error', reject);
    outgoing.end();
  });
}

function parsedState(response: HealthResponse) {
  return JSON.parse(
    response.body,
  ) as EmployeeInviteMailRuntimeCurrent189HealthState;
}

function expectNoStore(response: HealthResponse): void {
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['content-type']).toBe(
    'application/json; charset=utf-8',
  );
}

describe('EmployeeInviteMailRuntimeCurrent189HealthServer', () => {
  let health: EmployeeInviteMailRuntimeCurrent189HealthServer | null = null;

  afterEach(async () => {
    await health?.stop();
    health = null;
  });

  it('binds an ephemeral loopback port and separates liveness from readiness', async () => {
    health = new EmployeeInviteMailRuntimeCurrent189HealthServer(
      '127.0.0.1',
      0,
      RELEASE_SHA,
    );
    await health.start();

    const address = boundAddress(health);
    expect(address.address).toBe('127.0.0.1');
    expect(address.port).toBeGreaterThan(0);

    const startingHealth = await healthRequest(address.port, '/health');
    const startingReady = await healthRequest(address.port, '/ready');
    expect(startingHealth.statusCode).toBe(200);
    expect(startingReady.statusCode).toBe(503);
    expectNoStore(startingHealth);
    expectNoStore(startingReady);
    expect(parsedState(startingHealth)).toEqual({
      service: 'employee-invite-mail-worker-current189',
      contract: 'IDENTITY_EMPLOYEE_INVITE_CURRENT189_V1',
      candidateStatus: 'NOT_DEPLOYABLE',
      release: RELEASE_SHA,
      live: true,
      ready: false,
      mode: 'ACTIVE',
      inflight: 0,
      completedCycles: 0,
      reasonCode: 'EMPLOYEE_INVITE_MAIL_STARTING',
    });

    health.ready();

    const ready = await healthRequest(address.port, '/ready');
    expect(ready.statusCode).toBe(200);
    expectNoStore(ready);
    expect(parsedState(ready)).toMatchObject({
      live: true,
      ready: true,
      mode: 'ACTIVE',
      inflight: 0,
      reasonCode: 'EMPLOYEE_INVITE_MAIL_READY',
    });
  });

  it('leaves readiness while draining but stays live until inflight work finishes', async () => {
    health = new EmployeeInviteMailRuntimeCurrent189HealthServer(
      '127.0.0.1',
      0,
      RELEASE_SHA,
    );
    await health.start();
    health.ready();
    health.cycleStarted();
    health.beginDrain();

    expect(health.snapshot()).toMatchObject({
      live: true,
      ready: false,
      mode: 'DRAINING',
      inflight: 1,
      completedCycles: 0,
      reasonCode: 'EMPLOYEE_INVITE_MAIL_DRAINING',
    });

    const drainingHealth = await healthRequest(
      boundAddress(health).port,
      '/health',
    );
    const drainingReady = await healthRequest(
      boundAddress(health).port,
      '/ready',
    );
    expect(drainingHealth.statusCode).toBe(200);
    expect(drainingReady.statusCode).toBe(503);
    expectNoStore(drainingHealth);
    expectNoStore(drainingReady);
    expect(parsedState(drainingHealth).inflight).toBe(1);

    health.cycleFinished();

    expect(health.snapshot()).toMatchObject({
      live: true,
      ready: false,
      mode: 'DRAINING',
      inflight: 0,
      completedCycles: 1,
    });
  });

  it('returns 503 from both probes after an emergency kill', async () => {
    health = new EmployeeInviteMailRuntimeCurrent189HealthServer(
      '127.0.0.1',
      0,
      RELEASE_SHA,
    );
    await health.start();
    health.ready();
    health.killed();

    const port = boundAddress(health).port;
    const killedHealth = await healthRequest(port, '/health');
    const killedReady = await healthRequest(port, '/ready');
    expect(killedHealth.statusCode).toBe(503);
    expect(killedReady.statusCode).toBe(503);
    expectNoStore(killedHealth);
    expectNoStore(killedReady);
    expect(parsedState(killedHealth)).toMatchObject({
      live: false,
      ready: false,
      mode: 'KILLED',
      inflight: 0,
      reasonCode: 'EMPLOYEE_INVITE_MAIL_KILLED',
    });
  });

  it('replaces an arbitrary failure containing PII with a fixed reason code', async () => {
    health = new EmployeeInviteMailRuntimeCurrent189HealthServer(
      '127.0.0.1',
      0,
      RELEASE_SHA,
    );
    await health.start();
    health.ready();
    health.failed(
      'SMTP failed for synthetic.person@example.invalid token=secret-value',
    );

    const port = boundAddress(health).port;
    const failedHealth = await healthRequest(port, '/health');
    const failedReady = await healthRequest(port, '/ready');
    expect(failedHealth.statusCode).toBe(503);
    expect(failedReady.statusCode).toBe(503);
    expectNoStore(failedHealth);
    expectNoStore(failedReady);
    expect(parsedState(failedHealth)).toMatchObject({
      live: false,
      ready: false,
      mode: 'KILLED',
      reasonCode: 'EMPLOYEE_INVITE_MAIL_RUNTIME_FAILED',
    });
    expect(failedHealth.body).not.toContain('synthetic.person@example.invalid');
    expect(failedHealth.body).not.toContain('secret-value');
  });

  it.each([
    ['unknown path', 'GET', '/unknown'],
    ['wrong method', 'POST', '/health'],
  ] as const)('returns a no-store 404 for %s', async (_case, method, path) => {
    health = new EmployeeInviteMailRuntimeCurrent189HealthServer(
      '127.0.0.1',
      0,
      RELEASE_SHA,
    );
    await health.start();

    const response = await healthRequest(
      boundAddress(health).port,
      path,
      method,
    );
    expect(response.statusCode).toBe(404);
    expectNoStore(response);
    expect(response.body).toBe('{"ok":false}');
  });
});
