import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

describe('AppController', () => {
  let appController: AppController;
  let prisma: {
    $queryRaw: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ ok: 1 }])
        .mockResolvedValueOnce([
          {
            migration_name: '20260726110000_reconcile_completed_reward_wallet',
            completed_count: 150,
            unfinished_count: 0,
          },
        ]),
    };
    const config = new ConfigService({
      RELEASE_SHA: 'release-sha',
      BUILD_TIME: '2026-07-26T15:00:00.000Z',
    });
    const appService = new AppService(
      config,
      prisma as unknown as PrismaService,
    );
    appController = new AppController(appService);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  it('returns liveness without accessing the database', () => {
    expect(appController.getLiveness()).toMatchObject({
      ok: true,
      service: 'leetplus-api',
      release: {
        sha: 'release-sha',
        builtAt: '2026-07-26T15:00:00.000Z',
      },
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('returns database readiness with the current migration', async () => {
    await expect(appController.getReadiness()).resolves.toMatchObject({
      ok: true,
      dependencies: {
        database: {
          ok: true,
          migration: '20260726110000_reconcile_completed_reward_wallet',
          migrationCount: 150,
        },
      },
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('fails readiness without leaking a database error', async () => {
    prisma.$queryRaw.mockReset().mockRejectedValue(new Error('db secret'));

    await expect(appController.getReadiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    try {
      await appController.getReadiness();
    } catch (error) {
      const response = (error as ServiceUnavailableException).getResponse();
      expect(JSON.stringify(response)).not.toContain('db secret');
    }
  });

  it('fails readiness when Prisma has an unfinished migration', async () => {
    prisma.$queryRaw
      .mockReset()
      .mockResolvedValueOnce([{ ok: 1 }])
      .mockResolvedValueOnce([
        {
          migration_name: '20260726110000_reconcile_completed_reward_wallet',
          completed_count: 150,
          unfinished_count: 1,
        },
      ]);

    await expect(appController.getReadiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('fails readiness when the release expects another migration count', async () => {
    prisma.$queryRaw
      .mockReset()
      .mockResolvedValueOnce([{ ok: 1 }])
      .mockResolvedValueOnce([
        {
          migration_name: '20260726110000_reconcile_completed_reward_wallet',
          completed_count: 149,
          unfinished_count: 0,
        },
      ]);
    const service = new AppService(
      new ConfigService({
        EXPECTED_DATABASE_MIGRATION_COUNT: '150',
      }),
      prisma as unknown as PrismaService,
    );

    try {
      await service.getReadiness();
      throw new Error('Expected readiness to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(
        (error as ServiceUnavailableException).getResponse(),
      ).toMatchObject({
        dependencies: {
          database: {
            ok: false,
            reason: 'MIGRATION_COUNT_MISMATCH',
          },
        },
      });
    }
  });

  it('reports release identity separately', () => {
    expect(appController.getVersion()).toEqual({
      service: 'leetplus-api',
      release: {
        sha: 'release-sha',
        builtAt: '2026-07-26T15:00:00.000Z',
      },
    });
  });

  it.each([
    ['CORPORATE', 'leetplus-api-corporate'],
    ['GUEST', 'leetplus-api-guest'],
  ])('reports the %s pool identity', (role, serviceName) => {
    const service = new AppService(
      new ConfigService({ LEETPLUS_API_RUNTIME_ROLE: role }),
      prisma as unknown as PrismaService,
    );

    expect(service.getLiveness()).toMatchObject({ service: serviceName });
    expect(service.getVersion()).toMatchObject({ service: serviceName });
  });
});
