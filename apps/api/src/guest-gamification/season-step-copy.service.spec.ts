import { ConflictException, ForbiddenException } from '@nestjs/common';
import { SeasonStepCopyService } from './season-step-copy.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const seasonId = '55555555-5555-4555-8555-555555555555';
const requestId = '116e67df-41ba-472c-8ddc-80a751e9d97a';
const oldCondition =
  'Играй в будни до 17:00, почасовая игровая сессия или пакетом.';
const oldDescription =
  'Начните игровую сессию в будни в период с 08:00 до 17:00 (минимум 60 минут)';
const condition =
  'В будни завершите одну сессию от 60 минут между 08:00 и 17:00.';
const description =
  'Почасовая или пакетная сессия должна длиться не менее 60 минут и завершиться в будний день с 08:00 до 17:00 по времени клуба. Время разных сессий не суммируется.';
const expectedAt = '2026-09-21T05:01:17.377Z';

const command = {
  expectedTenantId: tenantId,
  expectedUpdatedAt: expectedAt,
  expectedLevelsMd5: '0123456789abcdef0123456789abcdef',
  expectedStepId: 'level-4',
  expectedCondition: oldCondition,
  expectedDescription: oldDescription,
  condition,
  description,
  requestId,
};

function fixture() {
  const levels = Array.from({ length: 11 }, (_, index) => ({
    id: `level-${index + 1}`,
    sequence: index + 1,
    condition: index === 3 ? oldCondition : 'other',
    description: index === 3 ? oldDescription : 'other',
    activationRules: { source: 'PLAY_HOUR' },
  }));
  const tx = {
    guestGameAuditEvent: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    guestGameSeason: {
      findFirst: jest.fn().mockResolvedValue({
        status: 'ACTIVE',
        levels,
        updatedAt: new Date(expectedAt),
      }),
      findFirstOrThrow: jest
        .fn()
        .mockResolvedValue({ updatedAt: new Date('2026-09-24T09:00:00.000Z') }),
      updateMany: jest.fn(),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ id: seasonId }]),
  };
  const prisma = {
    $transaction: jest.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  };
  const service = new SeasonStepCopyService(prisma as never);
  const actor = {
    id: '44444444-4444-4444-8444-444444444444',
    tenantId,
  } as never;
  return { service, prisma, tx, actor, levels };
}

describe('SeasonStepCopyService', () => {
  it('rejects a different tenant before the database transaction', async () => {
    const { service, prisma, actor } = fixture();
    await expect(
      service.updateCopy(actor, seasonId, '4', {
        ...command,
        expectedTenantId: requestId,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('changes only the two copy fields through one guarded JSONB update and audit', async () => {
    const { service, tx, actor } = fixture();
    const result = await service.updateCopy(actor, seasonId, '4', command);
    expect(result.replayed).toBe(false);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.guestGameSeason.updateMany).not.toHaveBeenCalled();
    expect(tx.guestGameAuditEvent.create).toHaveBeenCalledTimes(1);
    const created = (
      tx.guestGameAuditEvent.create.mock.calls as unknown as Array<
        [
          {
            data: {
              tenantId: string;
              entityId: string;
              action: string;
              payload: {
                actorUserId: string;
                requestId: string;
                sequence: number;
                stepId: string;
              };
            };
          },
        ]
      >
    )[0]?.[0]?.data;
    expect(created?.tenantId).toBe(tenantId);
    expect(created?.entityId).toBe(seasonId);
    expect(created?.action).toBe('STEP_COPY_UPDATED_BY_SUPPORT');
    expect(created?.payload).toEqual({
      ...created?.payload,
      actorUserId: '44444444-4444-4444-8444-444444444444',
      requestId,
      sequence: 4,
      stepId: 'level-4',
    });
  });

  it('rolls back when the full-levels CAS finds drift', async () => {
    const { service, tx, actor } = fixture();
    tx.$queryRaw.mockResolvedValue([]);
    await expect(
      service.updateCopy(actor, seasonId, '4', command),
    ).rejects.toThrow(ConflictException);
    expect(tx.guestGameAuditEvent.create).not.toHaveBeenCalled();
  });

  it('recognizes only the same actor and exact command as an idempotent replay', async () => {
    const { service, tx, actor, levels } = fixture();
    await service.updateCopy(actor, seasonId, '4', command);
    const prior = (
      tx.guestGameAuditEvent.create.mock.calls as unknown as Array<
        [
          {
            data: {
              action: string;
              status: string;
              payload: Record<string, unknown>;
            };
          },
        ]
      >
    )[0]?.[0]?.data;
    expect(prior).toBeDefined();
    tx.guestGameAuditEvent.findUnique.mockResolvedValue({
      tenantId,
      entityId: seasonId,
      action: prior.action,
      status: prior.status,
      payload: prior.payload,
    });
    tx.guestGameSeason.findFirst.mockResolvedValue({
      updatedAt: new Date('2026-09-24T09:00:00.000Z'),
      levels: levels.map((level, index) =>
        index === 3 ? { ...level, condition, description } : level,
      ),
    });
    expect(
      (await service.updateCopy(actor, seasonId, '4', command)).replayed,
    ).toBe(true);
    await expect(
      service.updateCopy(
        { id: requestId, tenantId } as never,
        seasonId,
        '4',
        command,
      ),
    ).rejects.toThrow(ConflictException);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
