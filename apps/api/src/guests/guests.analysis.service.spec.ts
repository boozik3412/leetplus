import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { GuestsService } from './guests.service';

type GuestRow = ReturnType<typeof guestRow>;

const NOW = new Date();
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

function guestRow(index: number, encrypt: (value: string) => string) {
  return {
    id: `guest-${index}`,
    externalDomain: 'club.langame.test',
    externalGuestId: String(1000 + index),
    externalGuestTypeId: null,
    phoneMasked: `***${String(1000 + index).slice(-4)}`,
    phoneEncrypted: encrypt(`+7 900 000-${String(1000 + index).slice(-4)}`),
    emailMasked: null,
    fullNameMasked: `Г. ${index}`,
    fullNameEncrypted: encrypt(`Гость Полный ${index}`),
    insertedAt: daysAgo(200),
    lastActivityAt: daysAgo(index % 20),
    isDisabled: false,
    currentCountHours: null,
    crmStatus: 'NONE',
    crmNote: null,
    nextAction: null,
    nextContactAt: null,
    crmUpdatedAt: null,
    phoneConsentStatus: 'GRANTED',
  };
}

describe('GuestsService shared analysis', () => {
  const config = new ConfigService({
    APP_ENCRYPTION_KEY: 'analysis-spec-secret',
    NODE_ENV: 'development',
  });
  const user = {
    id: 'user-1',
    role: 'OWNER',
    isPlatformAdmin: false,
    tenantId: 'tenant-1',
    tenantSlug: 'demo',
    permissions: ['view_guests', 'view_guest_gamification'],
  } as never;

  function createService(guestCount: number) {
    const holder: { service: GuestsService | null } = { service: null };
    const encrypt = (value: string) =>
      (
        holder.service as unknown as {
          encryptSensitiveValue: (input: string) => string;
        }
      ).encryptSensitiveValue(value);
    const guestFindMany = jest.fn();
    const prisma = {
      guest: {
        findMany: guestFindMany,
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      guestGroup: { findMany: jest.fn().mockResolvedValue([]) },
      store: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      guestSession: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      guestTransaction: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      salesFact: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      guestBonusBalanceCurrent: { findMany: jest.fn().mockResolvedValue([]) },
      guestBonusBalanceSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
      guestCrmTask: { findMany: jest.fn().mockResolvedValue([]) },
      guestCrmEvent: { create: jest.fn() },
      guestDataProfileRun: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const gameInsights = {
      loadGuestGameFacts: jest.fn().mockResolvedValue(new Map()),
      countUnlinkedProfiles: jest.fn().mockResolvedValue(0),
      loadGuestGameDetail: jest.fn().mockResolvedValue(null),
    };
    const service = new GuestsService(
      prisma as never,
      {
        resolve: (input: { tenantId: string; tenantSlug: string }) => ({
          tenantId: input.tenantId,
          tenantSlug: input.tenantSlug,
        }),
      } as never,
      config,
      { syncComputerCountsForTenant: jest.fn() } as never,
      {} as never,
      {} as never,
      gameInsights as never,
    );
    holder.service = service;
    const guests: GuestRow[] = Array.from({ length: guestCount }, (_, index) =>
      guestRow(index, encrypt),
    );
    guestFindMany.mockResolvedValue(guests);

    return { service, prisma, guestFindMany, gameInsights, guests };
  }

  it('shares one computation between the dashboard and the list, then serves from cache', async () => {
    const { service, guestFindMany, prisma } = createService(5);

    const [summary, list] = await Promise.all([
      service.getSummary(user, {}),
      service.getGuests(user, {}),
    ]);
    await service.getGuests(user, { page: '1', sort: 'ltv' });
    await service.getSummary(user, {});

    expect(guestFindMany).toHaveBeenCalledTimes(1);
    expect(prisma.guestSession.findMany).toHaveBeenCalledTimes(2); // main window + previous period
    expect(summary.totalGuests).toBe(5);
    expect(list.totalRows).toBe(5);
    expect(Date.parse(summary.dataAsOf)).not.toBeNaN();
  });

  it('decrypts personal data only for the rows it returns', async () => {
    const { service } = createService(60);
    const decrypt = jest.spyOn(
      service as unknown as {
        decryptSensitiveValue: (value: string) => string;
      },
      'decryptSensitiveValue',
    );

    const list = await service.getGuests(user, { pageSize: '10' });

    expect(list.rows).toHaveLength(10);
    expect(
      list.rows.every((row) => row.displayName.startsWith('Гость Полный')),
    ).toBe(true);
    expect(list.rows.every((row) => row.contact.startsWith('+7 900'))).toBe(
      true,
    );
    expect(decrypt.mock.calls.length).toBeLessThanOrEqual(20);
  });

  it('never caches searches, and a search does not evict the cached analysis', async () => {
    const { service, guestFindMany } = createService(3);

    await service.getGuests(user, {});
    await service.getGuests(user, { search: 'abc' });
    await service.getGuests(user, { search: 'abc' });
    await service.getGuests(user, {});

    expect(guestFindMany).toHaveBeenCalledTimes(3);
  });

  it('recomputes after a CRM write invalidates the tenant', async () => {
    const { service, prisma, guestFindMany } = createService(3);
    jest.spyOn(service, 'getGuest').mockResolvedValue({} as never);
    prisma.guest.findFirst.mockResolvedValue({ id: 'guest-1' });

    await service.getGuests(user, {});
    await service.getGuests(user, {});
    expect(guestFindMany).toHaveBeenCalledTimes(1);

    await service.updateGuestCrm(user, 'guest-1', {
      crmStatus: 'VIP',
    } as never);
    await service.getGuests(user, {});

    expect(guestFindMany).toHaveBeenCalledTimes(2);
  });

  it('applies database aggregated lifetime revenue to the guest LTV', async () => {
    const { service, prisma } = createService(2);
    prisma.$queryRaw.mockResolvedValue([
      {
        guestId: 'guest-0',
        transactionSum: new Prisma.Decimal('1200.50'),
        barSum: new Prisma.Decimal('300'),
        revenueDays: 4,
        firstAt: new Date('2026-01-10T10:00:00.000Z'),
        lastAt: new Date('2026-09-01T10:00:00.000Z'),
      },
      {
        guestId: 'someone-else',
        transactionSum: new Prisma.Decimal('99'),
        barSum: null,
        revenueDays: 1,
        firstAt: null,
        lastAt: null,
      },
    ]);

    const list = await service.getGuests(user, { sort: 'ltv' });
    const top = list.rows[0];

    expect(top.id).toBe('guest-0');
    expect(top.ltv).toEqual(
      expect.objectContaining({
        totalRevenue: 1500.5,
        transactionRevenue: 1200.5,
        barRevenue: 300,
        revenueDays: 4,
        firstRevenueAt: '2026-01-10T10:00:00.000Z',
        lastRevenueAt: '2026-09-01T10:00:00.000Z',
      }),
    );
    expect(list.rows[1].ltv.totalRevenue).toBe(0);
  });

  it('reads the tenant once instead of per-1000 chunks for a large network', async () => {
    const { service, prisma, gameInsights } = createService(2_100);

    await service.getGuests(user, { pageSize: '10' });

    const bonusCalls = prisma.guestBonusBalanceCurrent.findMany.mock
      .calls as Array<[{ where: { guestId?: unknown } }]>;
    expect(
      bonusCalls.filter(
        ([args]) => JSON.stringify(args.where.guestId) === '{"not":null}',
      ),
    ).toHaveLength(1);
    expect(
      bonusCalls.filter(([args]) =>
        JSON.stringify(args.where.guestId)?.includes('"in"'),
      ),
    ).toHaveLength(0);
    expect(gameInsights.loadGuestGameFacts).toHaveBeenCalledTimes(1);
    const lifetimeCall = prisma.$queryRaw.mock.calls[0] as unknown[];
    expect(JSON.stringify(lifetimeCall)).not.toContain('ANY(');
  });

  it('scopes the lifetime query to the guest ids for small sets', async () => {
    const { service, prisma } = createService(3);

    await service.getGuests(user, {});

    const lifetimeCall = (prisma.$queryRaw.mock.calls as unknown[][])[0][0] as {
      strings: string[];
    };
    expect(lifetimeCall.strings.join(' ')).toContain('ANY(');
  });

  it('skips game facts and hides game fields without the capability', async () => {
    const { service, gameInsights } = createService(3);
    const plain = {
      ...(user as object),
      role: 'MANAGER',
      permissions: ['view_guests'],
    } as never;

    const summary = await service.getSummary(plain, {});

    expect(gameInsights.loadGuestGameFacts).not.toHaveBeenCalled();
    expect(summary.gamification).toEqual({
      available: false,
      reason: 'NO_CAPABILITY',
    });
  });
});
