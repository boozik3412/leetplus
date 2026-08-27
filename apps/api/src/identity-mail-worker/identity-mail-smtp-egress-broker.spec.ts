import { request } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import type { AddressInfo, Server as NetServer } from 'node:net';
import type { EnabledIdentityMailSmtpEgressBrokerConfig } from './identity-mail-smtp-egress-broker.config';
import {
  IdentityMailSmtpEgressBroker,
  IdentityMailSmtpEgressBrokerError,
  isPublicIpv4Address,
  type IdentityMailSmtpEgressBrokerDependencies,
  type IdentityMailSmtpEgressBrokerLogger,
} from './identity-mail-smtp-egress-broker';

const RELEASE_SHA = 'a'.repeat(40);

function config(): EnabledIdentityMailSmtpEgressBrokerConfig {
  return {
    enabled: true,
    releaseSha: RELEASE_SHA,
    listenHost: '127.0.0.1',
    listenPort: 0,
    healthHost: '127.0.0.1',
    healthPort: 0,
    targetHost: 'smtp.example.test',
    targetPort: 465,
    connectTimeoutMs: 1_000,
    idleTimeoutMs: 10_000,
    maxConnections: 1,
  };
}

function logger(): IdentityMailSmtpEgressBrokerLogger {
  return {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

function dependencies(
  address = '8.8.8.8',
): IdentityMailSmtpEgressBrokerDependencies {
  return {
    lookupAllIpv4: jest.fn().mockResolvedValue([{ address, family: 4 }]),
    connect: jest.fn(() => {
      throw new Error('outbound connection was not expected');
    }),
  };
}

type InspectableBroker = {
  relayServer: NetServer | null;
  healthServer: HttpServer | null;
};

describe('IdentityMailSmtpEgressBroker', () => {
  let broker: IdentityMailSmtpEgressBroker | null = null;

  afterEach(async () => {
    await broker?.stop();
    broker = null;
  });

  it('binds relay and health listeners only to numeric loopback', async () => {
    const safeLogger = logger();
    const connect = jest.fn(() => {
      throw new Error('outbound connection was not expected');
    });
    const safeDependencies: IdentityMailSmtpEgressBrokerDependencies = {
      lookupAllIpv4: jest
        .fn()
        .mockResolvedValue([{ address: '8.8.8.8', family: 4 }]),
      connect,
    };
    broker = new IdentityMailSmtpEgressBroker(
      config(),
      safeLogger,
      safeDependencies,
    );
    await broker.start();

    const inspectable = broker as unknown as InspectableBroker;
    const relayAddress = inspectable.relayServer?.address() as AddressInfo;
    const healthAddress = inspectable.healthServer?.address() as AddressInfo;
    expect(relayAddress.address).toBe('127.0.0.1');
    expect(healthAddress.address).toBe('127.0.0.1');
    expect(connect).not.toHaveBeenCalled();

    const response = await healthRequest(healthAddress.port);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      service: 'identity-mail-smtp-egress',
      release: RELEASE_SHA,
      ok: true,
      reasonCode: null,
    });
  });

  it('refuses to start when any resolved destination is non-public', async () => {
    broker = new IdentityMailSmtpEgressBroker(
      config(),
      logger(),
      dependencies('127.0.0.1'),
    );

    await expect(broker.start()).rejects.toEqual(
      new IdentityMailSmtpEgressBrokerError(
        'IDENTITY_MAIL_SMTP_EGRESS_DNS_POLICY_REJECTED',
      ),
    );
  });
});

describe('isPublicIpv4Address', () => {
  it.each(['8.8.8.8', '1.1.1.1', '142.250.74.14'])(
    'admits public IPv4 %s',
    (address) => {
      expect(isPublicIpv4Address(address)).toBe(true);
    },
  );

  it.each([
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.0.0.9',
    '192.0.2.1',
    '192.168.0.1',
    '198.18.0.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '::1',
  ])('rejects non-public destination %s', (address) => {
    expect(isPublicIpv4Address(address)).toBe(false);
  });
});

function healthRequest(
  port: number,
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const outgoing = request(
      { hostname: '127.0.0.1', port, path: '/health', method: 'GET' },
      (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
        incoming.once('error', reject);
        incoming.once('end', () => {
          resolve({
            statusCode: incoming.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    outgoing.once('error', reject);
    outgoing.end();
  });
}
