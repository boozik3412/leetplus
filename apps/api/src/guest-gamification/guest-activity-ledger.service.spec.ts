import { IntegrationProvider } from '@prisma/client';
import type { LangameClient } from '../integrations/langame.client';
import type { LangameSettingsService } from '../integrations/langame-settings.service';
import type { PrismaService } from '../prisma/prisma.service';
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

  type DateRange = { gte?: Date; lte?: Date };
  type SelectShape = Record<string, boolean>;
  type LedgerRow = Record<string, unknown> & {
    id: string;
    profileId?: string;
    externalDomain?: string | null;
    sourceKind?: string;
    rawType?: string | null;
    rawText?: string | null;
    factType?: string;
    sourceHash?: string;
    happenedAt?: Date | null;
    storeId?: string | null;
    parseStatus?: string;
    confidence?: string;
    evidence?: unknown;
    tariffType?: string | null;
    durationMinutes?: number | null;
  };
  type NewLedgerRow = Omit<LedgerRow, 'id'> & Partial<Pick<LedgerRow, 'id'>>;
  type RawWhere = {
    profileId?: string;
    externalDomain?: string;
    sourceKind?: string;
    rawType?: { in?: string[] };
    happenedAt?: DateRange;
    OR?: RawWhere[];
  };
  type FactWhere = {
    profileId?: string;
    externalDomain?: string;
    factType?: string;
    happenedAt?: DateRange;
  };
  type RawUniqueWhere = {
    tenantId_sourceKind_externalProvider_externalDomain_sourceHash: {
      sourceHash: string;
    };
  };
  type FactUniqueWhere = {
    tenantId_factType_sourceHash: {
      factType: string;
      sourceHash: string;
    };
  };
  type SyncState = {
    status: string;
    lastStartedAt: Date | null;
    lastSuccessfulTo: Date | null;
    syncFrom: Date | null;
    rawRecordsCount: number;
    factsCount: number;
  };
  type SyncStateUpsertArgs = {
    create: SyncState;
    update: Partial<SyncState>;
  };
  type RawUpsertArgs = {
    where: RawUniqueWhere;
    create: NewLedgerRow;
    update: Partial<LedgerRow>;
  };
  type RawUpdateArgs = {
    where: { id: string };
    data: Partial<LedgerRow>;
  };
  type RawFindManyArgs = {
    where?: RawWhere;
    select?: SelectShape;
  };
  type FactUpsertArgs = {
    where: FactUniqueWhere;
    create: NewLedgerRow;
    update: Partial<LedgerRow>;
  };
  type FactFindManyArgs = {
    where?: FactWhere;
    select?: SelectShape;
  };
  type MockLangameSettingsService = {
    resolveTenantAccess: jest.MockedFunction<
      LangameSettingsService['resolveTenantAccess']
    >;
  };
  type MockLangameClient = {
    listGuestLogs: jest.MockedFunction<LangameClient['listGuestLogs']>;
    listGuestSessions: jest.MockedFunction<LangameClient['listGuestSessions']>;
    listTransactions: jest.MockedFunction<LangameClient['listTransactions']>;
    listProductExpenses: jest.MockedFunction<
      LangameClient['listProductExpenses']
    >;
    listGoods: jest.MockedFunction<LangameClient['listGoods']>;
  };

  let rawRecords: Map<string, LedgerRow>;
  let facts: Map<string, LedgerRow>;
  let syncState: SyncState | null;
  let prisma: PrismaService;
  let langameClient: MockLangameClient;
  let service: GuestActivityLedgerService;

  const selectFields = (row: LedgerRow, select?: SelectShape) => {
    if (!select) {
      return row;
    }

    const selected: Record<string, unknown> = {};
    for (const [key, enabled] of Object.entries(select)) {
      if (enabled) {
        selected[key] = row[key];
      }
    }

    return selected;
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

  const matchesRawWhere = (row: LedgerRow, where: RawWhere) => {
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
      return where.OR.some((clause) =>
        matchesRawWhere(row, { ...where, OR: undefined, ...clause }),
      );
    }

    return true;
  };

  const matchesFactWhere = (row: LedgerRow, where: FactWhere) => {
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
        upsert: jest
          .fn()
          .mockImplementation(({ create, update }: SyncStateUpsertArgs) => {
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
        findUnique: jest
          .fn()
          .mockImplementation(({ where }: { where: RawUniqueWhere }) => {
            const hash =
              where
                .tenantId_sourceKind_externalProvider_externalDomain_sourceHash
                .sourceHash;
            return Promise.resolve(rawRecords.get(hash) ?? null);
          }),
        upsert: jest
          .fn()
          .mockImplementation(({ where, create, update }: RawUpsertArgs) => {
            const hash =
              where
                .tenantId_sourceKind_externalProvider_externalDomain_sourceHash
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
        update: jest
          .fn()
          .mockImplementation(({ where, data }: RawUpdateArgs) => {
            const record = Array.from(rawRecords.values()).find(
              (item) => item.id === where.id,
            );
            if (record) {
              record.parseStatus = data.parseStatus;
            }
            return Promise.resolve(record);
          }),
        findMany: jest
          .fn()
          .mockImplementation(({ where, select }: RawFindManyArgs) => {
            const rows = Array.from(rawRecords.values()).filter((row) =>
              matchesRawWhere(row, where ?? {}),
            );
            return Promise.resolve(
              rows.map((row) => selectFields(row, select)),
            );
          }),
      },
      guestActivityFact: {
        findUnique: jest
          .fn()
          .mockImplementation(({ where }: { where: FactUniqueWhere }) => {
            const unique = where.tenantId_factType_sourceHash;
            return Promise.resolve(
              facts.get(`${unique.factType}:${unique.sourceHash}`) ?? null,
            );
          }),
        upsert: jest
          .fn()
          .mockImplementation(({ where, create, update }: FactUpsertArgs) => {
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
        findMany: jest
          .fn()
          .mockImplementation(({ where, select }: FactFindManyArgs) => {
            const rows = Array.from(facts.values()).filter((row) =>
              matchesFactWhere(row, where ?? {}),
            );
            return Promise.resolve(
              rows.map((row) => selectFields(row, select)),
            );
          }),
      },
    } as unknown as PrismaService;
    langameClient = {
      listGuestLogs: jest
        .fn<LangameClient['listGuestLogs']>()
        .mockResolvedValue([
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
      listGuestSessions: jest
        .fn<LangameClient['listGuestSessions']>()
        .mockResolvedValue([]),
      listTransactions: jest
        .fn<LangameClient['listTransactions']>()
        .mockResolvedValue([]),
      listProductExpenses: jest
        .fn<LangameClient['listProductExpenses']>()
        .mockResolvedValue([]),
      listGoods: jest.fn<LangameClient['listGoods']>().mockResolvedValue([]),
    };
    const langameSettingsService: MockLangameSettingsService = {
      resolveTenantAccess: jest
        .fn<LangameSettingsService['resolveTenantAccess']>()
        .mockResolvedValue({
          apiKey: 'api-key',
          sources: [source],
        }),
    };
    service = new GuestActivityLedgerService(
      prisma,
      langameSettingsService as unknown as LangameSettingsService,
      langameClient as unknown as LangameClient,
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

  it('normalizes completed hourly sessions into played minutes facts', async () => {
    langameClient.listGuestLogs.mockResolvedValue([]);
    langameClient.listGuestSessions.mockResolvedValue([
      {
        id: 'session-hourly-1',
        guest_id: externalGuestId,
        club_id: '15',
        date_start: '07.07.2026 10:00',
        date_stop: '07.07.2026 11:35',
        packet: 0,
      },
    ]);

    const result = await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'HOURLY_PLAY_TIME',
    });

    const playTimeFact = Array.from(facts.values()).find(
      (fact) => fact.factType === 'HOURLY_PLAY_TIME_ACCUMULATED',
    );

    expect(result.status).toBe('SUCCESS');
    expect(playTimeFact).toEqual(
      expect.objectContaining({
        confidence: 'EXACT',
        durationMinutes: 95,
        tariffType: 'hourly',
      }),
    );
    expect(
      Array.from(facts.values()).some(
        (fact) =>
          fact.factType === 'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
      ),
    ).toBe(false);
  });

  it('normalizes completed packet sessions into package play minutes facts', async () => {
    langameClient.listGuestLogs.mockResolvedValue([]);
    langameClient.listGuestSessions.mockResolvedValue([
      {
        id: 'session-package-1',
        guest_id: externalGuestId,
        club_id: '15',
        date_start: '07.07.2026 10:00',
        date_stop: '07.07.2026 12:00',
        packet: 1,
      },
    ]);

    const result = await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'PACKAGE_PLAY_TIME',
    });

    const playTimeFact = Array.from(facts.values()).find(
      (fact) =>
        fact.factType === 'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
    );

    expect(result.status).toBe('SUCCESS');
    expect(
      Array.from(facts.values()).some(
        (fact) =>
          fact.factType === 'PACKAGE_OR_SUBSCRIPTION_USED' &&
          fact.confidence === 'EXACT',
      ),
    ).toBe(true);
    expect(playTimeFact).toEqual(
      expect.objectContaining({
        confidence: 'EXACT',
        durationMinutes: 120,
        tariffType: 'package_or_subscription',
      }),
    );
  });

  it('normalizes Langame product expenses into product purchase facts', async () => {
    langameClient.listGuestLogs.mockResolvedValue([]);
    langameClient.listProductExpenses.mockResolvedValue([
      {
        id: 260973,
        date: '10.07.2026 16:11:27',
        list_goods_id: 415,
        list_clubs_id: 15,
        real_guest_id: externalGuestId,
        guest_id: null,
        price_purchase: null,
        price_sale: 250,
        count: 1,
        cancel: 0,
      },
    ]);
    langameClient.listGoods.mockResolvedValue([
      { id: 415, name: 'Чебупицца Пепперони', count: 4 },
    ]);

    const result = await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'PRODUCT_PURCHASES',
    });

    const productRaw = Array.from(rawRecords.values()).find(
      (row) => row.sourceKind === 'LANGAME_PRODUCT_EXPENSE',
    );
    const productFact = Array.from(facts.values()).find(
      (fact) => fact.factType === 'PRODUCT_PURCHASED',
    );

    expect(result.status).toBe('SUCCESS');
    expect(langameClient.listProductExpenses).toHaveBeenCalledWith(
      source.baseUrl,
      'api-key',
      expect.objectContaining({ dateFrom: '2026-06-30' }),
    );
    expect(langameClient.listGoods).toHaveBeenCalledWith(
      source.baseUrl,
      'api-key',
      15,
    );
    expect(productRaw).toEqual(
      expect.objectContaining({
        rawType: 'PRODUCT_PURCHASE',
        rawText: 'Чебупицца Пепперони',
        amount: 250,
        storeId,
      }),
    );
    expect(productFact).toEqual(
      expect.objectContaining({
        confidence: 'EXACT',
        amount: 250,
        storeId,
      }),
    );
    expect(productFact?.evidence).toEqual(
      expect.objectContaining({
        sourceKind: 'LANGAME_PRODUCT_EXPENSE',
        productId: '415',
        productName: 'Чебупицца Пепперони',
        quantity: 1,
        unitPrice: 250,
        totalAmount: 250,
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
