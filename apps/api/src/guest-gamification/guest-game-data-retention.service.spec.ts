/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import { GuestGameDataRetentionService } from './guest-game-data-retention.service';

function createFixture(configValues: Record<string, string | undefined> = {}) {
  const delegates = {
    tenant: { findMany: jest.fn().mockResolvedValue([{ id: 'tenant-1' }]) },
    guestGameDataRetentionPolicy: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    guestGameDataRetentionRun: {
      create: jest.fn().mockResolvedValue({ id: 'run-1' }),
      update: jest.fn().mockResolvedValue({ id: 'run-1' }),
    },
    guestActivityRawRecord: retentionDelegate(2),
    guestActivityFact: retentionDelegate(3),
    guestGameRuleDecision: retentionDelegate(4),
    guestGameAuditEvent: retentionDelegate(5),
    guestGameReward: { count: jest.fn().mockResolvedValue(6) },
    guestGameEntitlement: { count: jest.fn().mockResolvedValue(7) },
  };
  const config = {
    get: jest.fn((key: string) => configValues[key]),
  } as unknown as ConfigService;
  const service = new GuestGameDataRetentionService(
    delegates as unknown as PrismaService,
    config,
  );

  return { service, delegates };
}

function retentionDelegate(count: number) {
  return {
    count: jest.fn().mockResolvedValue(count),
    findMany: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  };
}

describe('GuestGameDataRetentionService', () => {
  const now = new Date('2026-07-12T00:00:00.000Z');

  it('runs daily reports in dry-run mode without deleting data', async () => {
    const { service, delegates } = createFixture();

    const result = await service.runAll({ now, liveRequested: false });

    expect(result.results[0]).toMatchObject({
      mode: 'DRY_RUN',
      status: 'DRY_RUN_COMPLETE',
      candidates: {
        rawRecords: 2,
        facts: 3,
        decisions: 4,
        auditEvents: 5,
        protectedRewards: 6,
        protectedEntitlements: 7,
      },
    });
    expect(delegates.guestActivityRawRecord.deleteMany).not.toHaveBeenCalled();
    expect(delegates.guestGameDataRetentionRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DRY_RUN_COMPLETE' }),
      }),
    );
  });

  it('requires both the global flag and tenant policy for live deletion', async () => {
    const { service, delegates } = createFixture({
      GUEST_GAME_RETENTION_LIVE_ENABLED: 'true',
    });
    delegates.guestGameDataRetentionPolicy.findMany.mockResolvedValue([
      {
        tenantId: 'tenant-1',
        rawRetentionDays: 365,
        factRetentionDays: 1095,
        decisionRetentionDays: 1095,
        auditRetentionDays: 1095,
        liveCleanupEnabled: false,
      },
    ]);

    const result = await service.runAll({ now, liveRequested: true });

    expect(result.results[0]).toMatchObject({ mode: 'DRY_RUN' });
    expect(delegates.guestActivityFact.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes only bounded candidates when both live guards are enabled', async () => {
    const { service, delegates } = createFixture({
      GUEST_GAME_RETENTION_LIVE_ENABLED: 'true',
    });
    delegates.guestGameDataRetentionPolicy.findMany.mockResolvedValue([
      {
        tenantId: 'tenant-1',
        rawRetentionDays: 365,
        factRetentionDays: 1095,
        decisionRetentionDays: 1095,
        auditRetentionDays: 1095,
        liveCleanupEnabled: true,
      },
    ]);
    for (const delegate of [
      delegates.guestActivityFact,
      delegates.guestGameRuleDecision,
      delegates.guestGameAuditEvent,
      delegates.guestActivityRawRecord,
    ]) {
      delegate.findMany.mockResolvedValue([{ id: 'old-1' }]);
      delegate.deleteMany.mockResolvedValue({ count: 1 });
    }

    const result = await service.runAll({ now, liveRequested: true });

    expect(result.results[0]).toMatchObject({
      mode: 'LIVE',
      status: 'LIVE_COMPLETE',
      deleted: {
        rawRecords: 1,
        facts: 1,
        decisions: 1,
        auditEvents: 1,
        protectedRewards: 0,
        protectedEntitlements: 0,
      },
    });
    expect(delegates.guestGameReward).not.toHaveProperty('deleteMany');
    expect(delegates.guestGameEntitlement).not.toHaveProperty('deleteMany');
  });
});
