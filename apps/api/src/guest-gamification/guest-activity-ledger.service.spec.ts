import { IntegrationProvider } from '@prisma/client';
import { GuestActivityLedgerService } from './guest-activity-ledger.service';

describe('GuestActivityLedgerService', () => {
  const tenantId = 'tenant-1';
  const profileId = 'profile-1';
  const guestId = 'guest-1';
  const storeId = 'store-1';
  const sourceId = 'source-1';
  const externalGuestId = '6330';
  const source = {
    id: sourceId,
    domain: 'demo.langame',
    baseUrl: 'https://langame.test',
  };
  const store = {
    id: storeId,
    name: '1337-Пушкинская',
    externalDomain: source.domain,
    externalClubId: '15',
    integrationSourceId: sourceId,
    timeZone: 'Asia/Yekaterinburg',
  };
  let rawRecords: Map<string, Record<string, any>>;
  let facts: Map<string, Record<string, any>>;
  let syncState: {
    status: string;
    lastStartedAt: Date | null;
    lastSuccessfulTo: Date | null;
    syncFrom: Date | null;
    rawRecordsCount: number;
    factsCount: number;
  } | null;
  let prisma: any;
  let langameClient: any;
  let service: GuestActivityLedgerService;

  const selectFields = (
    row: Record<string, any>,
    select?: Record<string, boolean>,
  ) => {
    if (!select) {
      return row;
    }

    return Object.fromEntries(
      Object.entries(select)
        .filter(([, enabled]) => enabled)
        .map(([key]) => [key, row[key]]),
    );
  };

  const inDateRange = (
    value: Date | null | undefined,
    range?: { gte?: Date; lte?: Date },
  ) => {
    if (!range) {
      return true;
    }

    if (!value) {
      return false;
    }

    return (
      (!range.gte || value.getTime() >= range.gte.getTime()) &&
      (!range.lte || value.getTime() <= range.lte.getTime())
    );
  };

  const matchesRawWhere = (
    row: Record<string, any>,
    where: Record<string, any>,
  ) => {
    if (where.profileId && row.profileId !== where.profileId) {
      return false;
    }

    if (where.externalDomain && row.externalDomain !== where.externalDomain) {
      return false;
    }

    if (where.sourceKind && row.sourceKind !== where.sourceKind) {
      return false;
    }

    if (where.rawType?.in && !where.rawType.in.includes(row.rawType)) {
      return false;
    }

    if (!inDateRange(row.happenedAt, where.happenedAt)) {
      return false;
    }

    if (Array.isArray(where.OR)) {
      return where.OR.some((clause: Record<string, any>) =>
        matchesRawWhere(row, { ...where, OR: undefined, ...clause }),
      );
    }

    return true;
  };

  const matchesFactWhere = (
    row: Record<string, any>,
    where: Record<string, any>,
  ) => {
    if (where.profileId && row.profileId !== where.profileId) {
      return false;
    }

    if (where.externalDomain && row.externalDomain !== where.externalDomain) {
      return false;
    }

    if (where.factType && row.factType !== where.factType) {
      return false;
    }

    return inDateRange(row.happenedAt, where.happenedAt);
  };

  beforeEach(() => {
    rawRecords = new Map();
    facts = new Map();
    syncState = null;
    prisma = {
      guestGameProfile: {
        findFirst: jest.fn().mockResolvedValue({
          id: profileId,
          guestId,
          phoneHash: 'phone-hash',
          guest: {
            id: guestId,
            externalProvider: IntegrationProvider.LANGAME,
            externalDomain: source.domain,
            externalGuestId,
          },
        }),
      },
      guest: {
        findFirst: jest.fn(),
      },
      store: {
        findFirst: jest.fn().mockResolvedValue(store),
        findMany: jest.fn().mockResolvedValue([store]),
      },
      guestGameLootBox: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'lootbox-1',
            name: 'КЕЙС «БУДНИ»',
            status: 'ACTIVE',
            triggerKind: 'SESSION_START',
            sessionType: 'PACKAGE_OR_SUBSCRIPTION',
            storeIds: [storeId],
            createdAt: new Date('2026-07-01T05:00:00.000Z'),
          },
        ]),
      },
      guestGameMission: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      guestGameSeason: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      guestGamePromoCard: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      guestActivitySyncState: {
        findUnique: jest.fn().mockImplementation(() => syncState),
        upsert: jest.fn().mockImplementation(({ create, update }) => {
          syncState = {
            ...(syncState ?? create),
            ...update,
            status: update.status ?? create.status,
            lastSuccessfulTo:
              update.lastSuccessfulTo === undefined
                ? (syncState?.lastSuccessfulTo ?? create.lastSuccessfulTo)
                : update.lastSuccessfulTo,
            rawRecordsCount: update.rawRecordsCount ?? create.rawRecordsCount,
            factsCount: update.factsCount ?? create.factsCount,
          };
          return Promise.resolve(syncState);
        }),
        findFirst: jest.fn(),
      },
      guestActivityRawRecord: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          const hash =
            where.tenantId_sourceKind_externalProvider_externalDomain_sourceHash
              .sourceHash;
          return Promise.resolve(rawRecords.get(hash) ?? null);
        }),
        upsert: jest.fn().mockImplementation(({ where, create, update }) => {
          const hash =
            where.tenantId_sourceKind_externalProvider_externalDomain_sourceHash
              .sourceHash;
          const existing = rawRecords.get(hash);
          if (existing) {
            Object.assign(existing, update);
            return Promise.resolve(existing);
          }
          const record = { ...create, id: `raw-${rawRecords.size + 1}` };
          rawRecords.set(hash, record);
          return Promise.resolve(record);
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const record = Array.from(rawRecords.values()).find(
            (item) => item.id === where.id,
          );
          if (record) {
            record.parseStatus = data.parseStatus;
          }
          return Promise.resolve(record);
        }),
        findMany: jest.fn().mockImplementation(({ where, select }) => {
          const rows = Array.from(rawRecords.values()).filter((row) =>
            matchesRawWhere(row, where ?? {}),
          );
          return Promise.resolve(rows.map((row) => selectFields(row, select)));
        }),
      },
      guestActivityFact: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          const unique = where.tenantId_factType_sourceHash;
          return Promise.resolve(
            facts.get(`${unique.factType}:${unique.sourceHash}`) ?? null,
          );
        }),
        upsert: jest.fn().mockImplementation(({ where, create, update }) => {
          const unique = where.tenantId_factType_sourceHash;
          const key = `${unique.factType}:${unique.sourceHash}`;
          const existing = facts.get(key);
          if (existing) {
            Object.assign(existing, update);
            return Promise.resolve(existing);
          }
          const fact = { ...create, id: `fact-${facts.size + 1}` };
          facts.set(key, fact);
          return Promise.resolve(fact);
        }),
        findMany: jest.fn().mockImplementation(({ where, select }) => {
          const rows = Array.from(facts.values()).filter((row) =>
            matchesFactWhere(row, where ?? {}),
          );
          return Promise.resolve(rows.map((row) => selectFields(row, select)));
        }),
      },
    };
    langameClient = {
      listGuestLogs: jest.fn().mockResolvedValue([
        {
          guest_id: externalGuestId,
          club_id: '15',
          date: '06.07.2026 17:00',
          type: 'Покупка абонемент ADMIN 10 ЧАСОВ, 0 ₽ + 500 бонусы',
        },
        {
          guest_id: externalGuestId,
          club_id: '15',
          date: '06.07.2026 17:00',
          type: 'Продление сессии на 6 в центре 1337 по тарифу ADMIN 10 ЧАСОВ длительностью 600 мин.',
        },
      ]),
      listGuestSessions: jest.fn().mockResolvedValue([]),
      listTransactions: jest.fn().mockResolvedValue([]),
    };
    service = new GuestActivityLedgerService(
      prisma,
      {
        resolveTenantAccess: jest.fn().mockResolvedValue({
          apiKey: 'api-key',
          sources: [source],
        }),
      } as any,
      langameClient,
    );
  });

  it('syncs guest logs from the earliest active rule minus one day', async () => {
    const result = await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'TEST',
    });

    expect(result.status).toBe('SUCCESS');
    expect(langameClient.listGuestLogs).toHaveBeenCalledWith(
      source.baseUrl,
      'api-key',
      expect.objectContaining({
        guestId: externalGuestId,
        dateFrom: '2026-06-30',
      }),
    );
    expect(rawRecords.size).toBe(2);
    expect(
      Array.from(facts.keys()).some((key) =>
        key.startsWith('PACKAGE_OR_SUBSCRIPTION_PURCHASED:'),
      ),
    ).toBe(true);
    expect(
      Array.from(facts.keys()).some((key) =>
        key.startsWith('PACKAGE_OR_SUBSCRIPTION_USED:'),
      ),
    ).toBe(true);
  });

  it('infers package or subscription usage from technical Langame session logs', async () => {
    langameClient.listGuestLogs.mockResolvedValue([
      {
        guest_id: externalGuestId,
        club_id: '15',
        date: '06.07.2026 17:00:49',
        type: 'success_subscription_buy_log',
      },
      {
        guest_id: externalGuestId,
        club_id: '15',
        date: '07.07.2026 18:16:53',
        type: 'start_session_on',
      },
      {
        guest_id: externalGuestId,
        club_id: '15',
        date: '07.07.2026 18:17:10',
        type: 'expand_session_on',
      },
    ]);

    const result = await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'TECHNICAL_LOGS',
    });

    const inferredUsageFacts = Array.from(facts.values()).filter(
      (fact) =>
        fact.factType === 'PACKAGE_OR_SUBSCRIPTION_USED' &&
        fact.confidence === 'INFERRED',
    );

    expect(result.status).toBe('SUCCESS');
    expect(
      Array.from(facts.values()).some(
        (fact) => fact.factType === 'PACKAGE_OR_SUBSCRIPTION_PURCHASED',
      ),
    ).toBe(true);
    expect(inferredUsageFacts).toHaveLength(2);
    expect(inferredUsageFacts[0].evidence).toEqual(
      expect.objectContaining({
        inference: 'recent_package_or_subscription_signal_near_session',
      }),
    );
  });

  it('keeps repeated sync idempotent with the same source hashes', async () => {
    await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'FIRST',
    });
    const rawCount = rawRecords.size;
    const factCount = facts.size;

    await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'SECOND',
    });

    expect(rawRecords.size).toBe(rawCount);
    expect(facts.size).toBe(factCount);
  });
});
