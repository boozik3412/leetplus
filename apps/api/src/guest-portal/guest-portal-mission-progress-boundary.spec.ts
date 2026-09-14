/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

import { GuestPortalService } from './guest-portal.service';

describe('GuestPortalService mission progress history boundaries', () => {
  it('keeps post-rule top-up and purchase history before game activation while excluding it from ordinary gameplay', async () => {
    const profileActivatedAt = new Date('2026-08-24T09:54:21.000Z');
    const topupRuleActivatedAt = new Date('2026-08-20T00:00:00.000Z');
    const productRuleActivatedAt = new Date('2026-08-22T00:00:00.000Z');
    const gameRuleActivatedAt = new Date('2026-08-20T00:00:00.000Z');
    const prisma = {
      guestGameEvent: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            event('BALANCE_TOPUP', '2026-08-19T12:00:00.000Z', 800),
            event('BALANCE_TOPUP', '2026-08-21T12:00:00.000Z', 800),
            event('BALANCE_TOPUP', '2026-08-23T12:00:00.000Z', 800),
            event('BALANCE_TOPUP', '2026-08-24T09:52:00.000Z', 800),
            event('BALANCE_TOPUP', '2026-08-28T12:00:00.000Z', 5_000),
            event('BALANCE_TOPUP', '2026-09-11T12:00:00.000Z', 800),
            event(
              'BALANCE_TOPUP',
              '2026-09-12T12:00:00.000Z',
              800,
              null,
              'other-club.langame.ru',
            ),
            event('PRODUCT_PURCHASE', '2026-08-21T12:00:00.000Z', 100),
            event('PRODUCT_PURCHASE', '2026-08-23T12:00:00.000Z', 100),
            event(
              'PRODUCT_PURCHASE',
              '2026-08-25T12:00:00.000Z',
              100,
              'store-2',
            ),
            event('PRODUCT_PURCHASE', '2026-08-26T12:00:00.000Z', 100),
            event('APP_OPEN', '2026-08-23T12:00:00.000Z'),
            event('APP_OPEN', '2026-08-25T12:00:00.000Z'),
          ]),
      },
      guestGameReward: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new GuestPortalService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const progress = await (service as any).buildMissionProgress(
      'tenant-1',
      { id: 'guest-1' },
      { id: 'profile-1', gameActivatedAt: profileActivatedAt },
      [
        mission({
          id: 'topup',
          activatedAt: topupRuleActivatedAt,
          triggerKind: 'BALANCE_TOPUP',
          target: 10,
          storeIds: ['store-1'],
          externalDomains: ['club-1.langame.ru'],
        }),
        mission({
          id: 'purchase',
          activatedAt: productRuleActivatedAt,
          triggerKind: 'PRODUCT_PURCHASE',
          target: 10,
          storeIds: ['store-1'],
        }),
        mission({
          id: 'app-open',
          activatedAt: gameRuleActivatedAt,
          triggerKind: 'APP_OPEN',
          target: 10,
        }),
      ],
      'UTC',
    );

    expect(progress.get('topup')).toMatchObject({ current: 5 });
    expect(progress.get('purchase')).toMatchObject({ current: 2 });
    expect(progress.get('app-open')).toMatchObject({ current: 1 });
    expect(prisma.guestGameEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          occurredAt: { gte: topupRuleActivatedAt },
        }),
        take: 1000,
      }),
    );
    expect(prisma.guestGameReward.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          qualifiedAt: { gte: topupRuleActivatedAt },
        }),
      }),
    );
  });
});

function mission({
  id,
  activatedAt,
  triggerKind,
  target,
  storeIds = [],
  externalDomains = [],
}: {
  id: string;
  activatedAt: Date;
  triggerKind: string;
  target: number;
  storeIds?: string[];
  externalDomains?: string[];
}) {
  return {
    id,
    createdAt: activatedAt,
    definitionVersion: 2,
    triggerKind,
    conditions: {
      activatedAt: activatedAt.toISOString(),
      externalDomains,
      metric: {
        eventType: triggerKind,
        aggregation: 'count',
        target,
      },
    },
    storeIds,
    periodFrom: null,
    periodTo: null,
    progressTarget: target,
    progressUnit: 'events',
  };
}

function event(
  eventType: string,
  occurredAt: string,
  spendAmount?: number,
  storeId: string | null = 'store-1',
  externalDomain = 'club-1.langame.ru',
) {
  return {
    eventType,
    occurredAt: new Date(occurredAt),
    externalDomain,
    payload: {
      input: { spendAmount },
      store: { id: storeId },
    },
  };
}
