import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import {
  dayNumberFromIso,
  dayNumberToIso,
  isInGameHoldout,
} from './guest-game-effect-core';
import { GuestGameEffectService } from './guest-game-effect.service';

const NOW = new Date('2026-10-14T09:00:00Z');
const ZONE = 'Asia/Yekaterinburg';
const ACTIVATION = '2026-09-01';
const A = dayNumberFromIso(ACTIVATION);

type DailyRow = {
  guestId: string;
  day: string;
  storeId: string | null;
  sessions: number;
  playMinutes: number;
  balanceSpend: number;
  barRevenue: number;
};

function visitRows(guestId: string, days: number[], storeId = 'store-1') {
  return days.map(
    (day): DailyRow => ({
      guestId,
      day: dayNumberToIso(day),
      storeId,
      sessions: 1,
      playMinutes: 90,
      balanceSpend: 250,
      barRevenue: 50,
    }),
  );
}

function range(from: number, to: number, step: number) {
  const days: number[] = [];
  for (let day = from; day <= to; day += step) days.push(day);
  return days;
}

function createService(overrides: { lootBoxes?: unknown[] } = {}) {
  const players = Array.from({ length: 12 }, (_, index) => ({
    id: `profile-${index}`,
    guestId: `player-${index}`,
    gameActivatedAt: new Date(`${ACTIVATION}T10:00:00Z`),
    isStaffTest: false,
  }));
  const daily: DailyRow[] = [
    // Players: weekly before activation, twice a week after.
    ...players.flatMap((player) =>
      visitRows(player.guestId, [
        ...range(A - 28, A, 7),
        ...range(A + 1, A + 28, 3),
      ]),
    ),
    // Non-players: weekly all along.
    ...Array.from({ length: 20 }, (_, index) =>
      visitRows(`guest-${index}`, range(A - 28, A + 28, 7)),
    ).flat(),
    // A staff tester that must never count.
    ...visitRows('staff-guest', range(A - 28, A + 28, 1)),
  ];
  const prisma = {
    store: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'store-1', name: 'Радищева', timeZone: ZONE },
        { id: 'store-2', name: 'Родонитовая', timeZone: ZONE },
      ]),
    },
    guestGameProfile: {
      findMany: jest.fn().mockResolvedValue([
        ...players,
        {
          id: 'profile-staff',
          guestId: 'staff-guest',
          gameActivatedAt: new Date(`${ACTIVATION}T10:00:00Z`),
          isStaffTest: true,
        },
        {
          id: 'profile-unlinked',
          guestId: null,
          gameActivatedAt: new Date(`${ACTIVATION}T10:00:00Z`),
          isStaffTest: false,
        },
      ]),
    },
    guestGameMission: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'mission-1',
          name: '7 ДНЕЙ',
          status: 'ACTIVE',
          storeIds: null,
          holdoutPercent: 0,
          holdoutStartedAt: null,
        },
      ]),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    guestGameLootBox: {
      findMany: jest.fn().mockResolvedValue(overrides.lootBoxes ?? []),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    guestGameSeason: { findMany: jest.fn().mockResolvedValue([]) },
    guestGameReward: {
      findMany: jest.fn().mockResolvedValue(
        players.slice(0, 6).map((player) => ({
          guestId: null,
          profileId: player.id,
          missionId: 'mission-1',
          lootBoxId: null,
          seasonId: null,
          status: 'PAID',
          rewardType: 'BONUS_BALANCE',
          rewardAmount: new Prisma.Decimal(500),
          qualifiedAt: new Date(`${ACTIVATION}T12:00:00Z`),
          paidAt: new Date('2026-09-05T12:00:00Z'),
        })),
      ),
    },
    $queryRaw: jest
      .fn()
      .mockImplementation((query: { sql?: string; strings?: string[] }) => {
        const text = (query.strings ?? [query.sql ?? '']).join('?');
        if (text.includes('AS dated')) {
          return Promise.resolve([{ dated: 10, undated: 0, anomalous: 1 }]);
        }
        return Promise.resolve(daily);
      }),
  };
  const service = new GuestGameEffectService(
    prisma as unknown as PrismaService,
  );
  return { service, prisma };
}

describe('GuestGameEffectService', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
  });
  afterEach(() => jest.useRealTimers());

  it('reports the game effect against same-day non-players', async () => {
    const { service } = createService();
    const report = await service.getReport('tenant-1');

    expect(report.timeZone).toBe(ZONE);
    expect(report.lastCompleteDay).toBe('2026-10-13');
    expect(report.dataQuality).toMatchObject({
      transactionsAnomalous: 1,
      playersWithoutGuest: 1,
    });
    // 12 players, the staff tester is neither a participant nor comparison.
    expect(report.game.participants).toBe(12);
    expect(report.game.measured).toBe(12);
    expect(report.game.comparisonGuests).toBe(20);
    expect(report.game.metrics.visitDays.effect).toBe(6);
    expect(report.game.metrics.money.effect).toBe(6 * 300);
    expect(report.game.verdict).toBe('POSITIVE');
    // Bonuses paid inside the window, nominal value.
    expect(report.game.cost.bonusRub).toBe(3000);
    expect(report.game.moneyPerBonusRub).toBe(
      Math.round(((12 * 6 * 300) / 3000) * 100) / 100,
    );
    expect(report.game.byStore.map((row) => row.storeId)).toEqual([
      'store-1',
      'store-2',
    ]);
    expect(report.game.byStore[1].cohort.participants).toBe(0);
  });

  it('measures a scenario against players who did not take part', async () => {
    const { service } = createService();
    const report = await service.getReport('tenant-1');
    const mission = report.scenarios.find((row) => row.id === 'mission-1');

    expect(mission?.cohort.participants).toBe(6);
    // Comparison = players activated before their own visit day who did not
    // take part: on the anchor day nobody qualifies (all activated that day),
    // so the 6 other players visiting the next day are used.
    expect(mission?.cohort.measured).toBe(6);
    expect(mission?.cohort.comparisonGuests).toBe(6);
    expect(mission?.cohort.cost.bonusRub).toBe(3000);
    expect(mission?.holdout).toBeNull();
  });

  it('filters the report to the home club of guests', async () => {
    const { service } = createService();
    const report = await service.getReport('tenant-1', { storeId: 'store-2' });
    expect(report.storeId).toBe('store-2');
    expect(report.game.participants).toBe(0);
    expect(report.game.byStore).toEqual([]);

    const unknown = await service.getReport('tenant-1', { storeId: 'nope' });
    expect(unknown.storeId).toBeNull();
  });

  it('caches one dataset per tenant', async () => {
    const { service, prisma } = createService();
    await Promise.all([
      service.getReport('tenant-1'),
      service.getGuestEffect('tenant-1', 'player-1'),
    ]);
    expect(prisma.store.findMany).toHaveBeenCalledTimes(1);
  });

  it('gives one guest their own before/after and costs', async () => {
    const { service } = createService();
    const effect = await service.getGuestEffect('tenant-1', 'player-1');

    expect(effect.activation).toMatchObject({
      status: 'MEASURED',
      exposureDate: ACTIVATION,
      windowDays: 28,
      complete: true,
    });
    if (effect.activation?.status !== 'MEASURED') return;
    expect(effect.activation.before.visitDays).toBe(4);
    expect(effect.activation.after.visitDays).toBe(10);
    expect(effect.activation.effect.visitDays).toBe(6);
    expect(effect.cost).toEqual({ bonusRub: 500, prizes: 0 });
    expect(effect.scenarios).toEqual([
      expect.objectContaining({
        id: 'mission-1',
        firstDate: ACTIVATION,
        bonusRub: 500,
        inHoldout: null,
      }),
    ]);

    const outsider = await service.getGuestEffect('tenant-1', 'guest-1');
    expect(outsider.activation).toBeNull();
    expect(outsider.scenarios).toEqual([]);
  });

  it('measures a running holdout of a standalone case', async () => {
    const startedAt = new Date('2026-09-10T00:00:00Z');
    const { service } = createService({
      lootBoxes: [
        {
          id: 'case-1',
          name: 'КЕЙС «УТРО»',
          status: 'ACTIVE',
          usageKind: 'STANDALONE',
          storeIds: null,
          holdoutPercent: 50,
          holdoutStartedAt: startedAt,
        },
        {
          id: 'case-gift',
          name: 'КЕЙС «КАМБЭК»',
          status: 'ACTIVE',
          usageKind: 'REWARD_TEMPLATE',
          storeIds: null,
          holdoutPercent: 30,
          holdoutStartedAt: startedAt,
        },
      ],
    });
    const report = await service.getReport('tenant-1');
    const standalone = report.scenarios.find((row) => row.id === 'case-1');
    const gift = report.scenarios.find((row) => row.id === 'case-gift');

    expect(standalone?.holdout).toMatchObject({ percent: 50 });
    const held = Array.from({ length: 12 }, (_, index) =>
      isInGameHoldout({
        scenarioId: 'case-1',
        profileId: `profile-${index}`,
        percent: 50,
      }),
    ).filter(Boolean).length;
    expect(standalone?.holdout?.result).toMatchObject({
      holdout: held,
      treatment: 12 - held,
    });
    // A reward-template case is handed out by a mission: no holdout.
    expect(gift?.holdout).toBeNull();
  });

  it('validates and restarts the holdout split on change', async () => {
    const { service, prisma } = createService();
    await expect(
      service.setHoldout('tenant-1', { kind: 'MISSION', id: 'm', percent: 70 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.setHoldout('tenant-1', { kind: 'SEASON', id: 's', percent: 10 }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.guestGameMission.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.setHoldout('tenant-1', { kind: 'MISSION', id: 'm', percent: 10 }),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.guestGameLootBox.findFirst.mockResolvedValueOnce({
      holdoutPercent: 0,
      holdoutStartedAt: null,
      usageKind: 'REWARD_TEMPLATE',
    });
    await expect(
      service.setHoldout('tenant-1', {
        kind: 'LOOT_BOX',
        id: 'gift',
        percent: 10,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.guestGameMission.findFirst.mockResolvedValueOnce({
      holdoutPercent: 0,
      holdoutStartedAt: null,
    });
    prisma.guestGameMission.updateMany.mockResolvedValueOnce({ count: 1 });
    const result = await service.setHoldout('tenant-1', {
      kind: 'MISSION',
      id: 'mission-1',
      percent: 10,
    });
    expect(result).toEqual({
      kind: 'MISSION',
      id: 'mission-1',
      holdoutPercent: 10,
      holdoutStartedAt: NOW.toISOString(),
    });
    expect(prisma.guestGameMission.updateMany).toHaveBeenCalledWith({
      where: { id: 'mission-1', tenantId: 'tenant-1' },
      data: { holdoutPercent: 10, holdoutStartedAt: NOW },
    });

    prisma.guestGameMission.findFirst.mockResolvedValueOnce({
      holdoutPercent: 10,
      holdoutStartedAt: NOW,
    });
    await service.setHoldout('tenant-1', {
      kind: 'MISSION',
      id: 'mission-1',
      percent: 10,
    });
    expect(prisma.guestGameMission.updateMany).toHaveBeenCalledTimes(1);
  });
});
