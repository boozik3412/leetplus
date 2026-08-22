import { request, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { IdentityMailWorkerHealthServer } from './identity-mail-worker-health';

const RELEASE_SHA = 'a'.repeat(40);

type HealthResponse = {
  statusCode: number;
  headers: IncomingHttpHeaders;
  body: string;
};

type InspectableHealthServer = {
  server: Server | null;
};

function boundAddress(health: IdentityMailWorkerHealthServer): AddressInfo {
  const server = (health as unknown as InspectableHealthServer).server;
  const address = server?.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected a bound loopback health server');
  }
  return address;
}

function healthRequest(
  port: number,
  path = '/health',
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

describe('IdentityMailWorkerHealthServer', () => {
  let health: IdentityMailWorkerHealthServer | null = null;

  afterEach(async () => {
    await health?.stop();
    health = null;
  });

  it('binds only loopback and returns bounded 503 while starting', async () => {
    health = new IdentityMailWorkerHealthServer('127.0.0.1', 0, RELEASE_SHA);
    await health.start();
    const address = boundAddress(health);

    expect(address.address).toBe('127.0.0.1');
    const response = await healthRequest(address.port);
    expect(response.statusCode).toBe(503);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-type']).toBe(
      'application/json; charset=utf-8',
    );
    expect(JSON.parse(response.body)).toEqual({
      service: 'identity-mail-worker',
      release: RELEASE_SHA,
      ok: false,
      reasonCode: 'IDENTITY_MAIL_WORKER_STARTING',
    });
  });

  it('returns 200 only after the worker marks itself ready', async () => {
    health = new IdentityMailWorkerHealthServer('127.0.0.1', 0, RELEASE_SHA);
    await health.start();
    health.ready();

    const response = await healthRequest(boundAddress(health).port);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      service: 'identity-mail-worker',
      release: RELEASE_SHA,
      ok: true,
      reasonCode: null,
    });
  });

  it('returns a bounded 503 after a worker failure', async () => {
    health = new IdentityMailWorkerHealthServer('127.0.0.1', 0, RELEASE_SHA);
    await health.start();
    health.ready();
    health.failed('IDENTITY_MAIL_WORKER_DATABASE_AUTHORITY_MISMATCH');

    const response = await healthRequest(boundAddress(health).port);
    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toEqual({
      service: 'identity-mail-worker',
      release: RELEASE_SHA,
      ok: false,
      reasonCode: 'IDENTITY_MAIL_WORKER_DATABASE_AUTHORITY_MISMATCH',
    });
  });

  it('leaves readiness immediately when shutdown starts', async () => {
    health = new IdentityMailWorkerHealthServer('127.0.0.1', 0, RELEASE_SHA);
    await health.start();
    health.ready();
    health.failed('IDENTITY_MAIL_WORKER_STOPPING');

    const response = await healthRequest(boundAddress(health).port);
    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toEqual({
      service: 'identity-mail-worker',
      release: RELEASE_SHA,
      ok: false,
      reasonCode: 'IDENTITY_MAIL_WORKER_STOPPING',
    });
  });

  it.each([
    ['unknown path', 'GET', '/ready'],
    ['wrong method', 'POST', '/health'],
  ])('returns 404 for %s', async (_case, method, path) => {
    health = new IdentityMailWorkerHealthServer('127.0.0.1', 0, RELEASE_SHA);
    await health.start();

    const response = await healthRequest(
      boundAddress(health).port,
      path,
      method,
    );
    expect(response.statusCode).toBe(404);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toBe('{"ok":false}');
  });
});
