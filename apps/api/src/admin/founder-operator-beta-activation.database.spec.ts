import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_ROLE } from '../config/environment-validation';
import { FounderOperatorBetaActivationDatabaseService } from './founder-operator-beta-activation.database';

const PASSWORD = 'p'.repeat(40);
const DEDICATED_URL =
  `postgresql://${FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_ROLE}:${PASSWORD}` +
  '@db.example.test:5432/leetplus?schema=public&connection_limit=2&pool_timeout=5&connect_timeout=5&sslmode=verify-full';

function fixture(
  activationDatabaseUrl: unknown,
  primaryDatabaseUrl = 'postgresql://leetplus_api:primary-password@db.example.test:5432/leetplus',
  sessionOverrides: Partial<{
    currentUser: string;
    databaseName: string;
    sessionUser: string;
    tlsActive: boolean;
    tlsVersion: string | null;
  }> = {},
) {
  const queryRaw = jest.fn().mockResolvedValue([
    {
      currentUser: FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_ROLE,
      databaseName: 'leetplus',
      sessionUser: FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_ROLE,
      tlsActive: true,
      tlsVersion: 'TLSv1.3',
      ...sessionOverrides,
    },
  ]);
  const transaction = jest.fn(
    <T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) =>
      operation({
        marker: 'dedicated',
        $queryRaw: queryRaw,
      } as unknown as Prisma.TransactionClient),
  );
  const disconnect = jest.fn().mockResolvedValue(undefined);
  const factory = jest.fn(() => ({
    $transaction: transaction,
    $disconnect: disconnect,
  }));
  const values: Record<string, unknown> = {
    FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_URL: activationDatabaseUrl,
    DATABASE_URL: primaryDatabaseUrl,
  };
  const config = {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
  const service = new FounderOperatorBetaActivationDatabaseService(
    config,
    factory,
  );
  return { service, factory, transaction, queryRaw, disconnect };
}

describe('FounderOperatorBetaActivationDatabaseService', () => {
  it.each([undefined, '', 'postgresql://leetplus_api:password@db/leetplus'])(
    'rejects a missing or non-dedicated URL without constructing Prisma: %s',
    async (databaseUrl) => {
      const { service, factory } = fixture(databaseUrl);
      await expect(
        service.$transaction(() => Promise.resolve('unreachable')),
      ).rejects.toMatchObject({
        response: {
          reasonCode: 'FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_URL_INVALID',
        },
      });
      expect(factory).not.toHaveBeenCalled();
    },
  );

  it('uses only the exact dedicated URL and lazily reuses one client', async () => {
    const { service, factory, transaction, queryRaw, disconnect } =
      fixture(DEDICATED_URL);

    await expect(
      service.$transaction((tx) =>
        Promise.resolve((tx as unknown as { marker: string }).marker),
      ),
    ).resolves.toBe('dedicated');
    await service.$transaction(() => Promise.resolve('second'));

    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith(DEDICATED_URL);
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(queryRaw).toHaveBeenCalledTimes(2);
    await service.onModuleDestroy();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('rejects reuse of the activation role by the primary pool', async () => {
    const { service, factory } = fixture(DEDICATED_URL, DEDICATED_URL);
    await expect(
      service.$transaction(() => Promise.resolve('unreachable')),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      service.$transaction(() => Promise.resolve('unreachable')),
    ).rejects.toMatchObject({
      response: {
        reasonCode: 'FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_ROLE_REUSED',
      },
    });
    expect(factory).not.toHaveBeenCalled();
  });

  it('does not accept arbitrary query options or weak passwords', async () => {
    const invalidUrls = [
      DEDICATED_URL.replace('p'.repeat(40), 'short'),
      `${DEDICATED_URL}&application_name=api`,
      DEDICATED_URL.replace('connection_limit=2', 'connection_limit=20'),
      DEDICATED_URL.replace('sslmode=verify-full', 'sslmode=prefer'),
    ];
    for (const databaseUrl of invalidUrls) {
      const { service, factory } = fixture(databaseUrl);
      await expect(
        service.$transaction(() => Promise.resolve('unreachable')),
      ).rejects.toMatchObject({
        response: {
          reasonCode: 'FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_URL_INVALID',
        },
      });
      expect(factory).not.toHaveBeenCalled();
    }
  });

  it.each([
    [{ sessionUser: 'leetplus_api' }, 'session user'],
    [{ currentUser: 'postgres' }, 'current user'],
    [{ databaseName: 'postgres' }, 'database'],
    [{ tlsActive: false, tlsVersion: null }, 'TLS'],
    [{ tlsVersion: 'TLSv1.1' }, 'TLS version'],
  ] as const)(
    'rejects a mismatched dedicated pool %s before invoking the operation',
    async (sessionOverrides) => {
      const { service } = fixture(DEDICATED_URL, undefined, sessionOverrides);
      const operation = jest.fn().mockResolvedValue('unreachable');

      await expect(service.$transaction(operation)).rejects.toMatchObject({
        response: {
          reasonCode:
            'FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_SESSION_INVALID',
        },
      });
      expect(operation).not.toHaveBeenCalled();
    },
  );

  it('contains pool attestation query failures without exposing the driver error', async () => {
    const { service, queryRaw } = fixture(DEDICATED_URL);
    queryRaw.mockRejectedValueOnce(
      new Error('postgresql://user:secret@forbidden.example.test/database'),
    );

    await expect(
      service.$transaction(() => Promise.resolve('unreachable')),
    ).rejects.toMatchObject({
      response: {
        reasonCode: 'FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_SESSION_INVALID',
      },
    });
  });
});
