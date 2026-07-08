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
  let rawRecords: Map<string, { id: string; parseStatus?: string }>;
  let facts: Map<string, { id: string }>;
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
        upsert: jest.fn().mockImplementation(({ where, create }) => {
          const hash =
            where.tenantId_sourceKind_externalProvider_externalDomain_sourceHash
              .sourceHash;
          const existing = rawRecords.get(hash);
          if (existing) {
            return Promise.resolve(existing);
          }
          const record = { id: `raw-${rawRecords.size + 1}` };
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
        findMany: jest.fn().mockResolvedValue([]),
      },
      guestActivityFact: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          const unique = where.tenantId_factType_sourceHash;
          return Promise.resolve(
            facts.get(`${unique.factType}:${unique.sourceHash}`) ?? null,
          );
        }),
        upsert: jest.fn().mockImplementation(({ where }) => {
          const unique = where.tenantId_factType_sourceHash;
          const key = `${unique.factType}:${unique.sourceHash}`;
          const existing = facts.get(key);
          if (existing) {
            return Promise.resolve(existing);
          }
          const fact = { id: `fact-${facts.size + 1}` };
          facts.set(key, fact);
          return Promise.resolve(fact);
        }),
        findMany: jest.fn().mockResolvedValue([]),
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
