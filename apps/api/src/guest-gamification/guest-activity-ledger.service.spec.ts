/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { IntegrationProvider, TenantCustomerStage } from '@prisma/client';
import type { GuestIdentityResolverService } from '../integrations/guest-identity-resolver.service';
import type { LangameClient } from '../integrations/langame.client';
import type { LangameSettingsService } from '../integrations/langame-settings.service';
import type { PrismaService } from '../prisma/prisma.service';
import * as genericSessionRemediation from './guest-game-generic-session-remediation';
import {
  classifyGuestActivitySyncFailure,
  GuestActivityLedgerService,
  isRecoverableSyncState,
  relevantFactsForRule,
  sanitizeGuestActivityEvidencePayload,
  sanitizeGuestActivityRawPayload,
  sanitizeGuestActivityText,
} from './guest-activity-ledger.service';

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
    rawRecordId?: string | null;
    sourceHash?: string;
    happenedAt?: Date | null;
    storeId?: string | null;
    parseStatus?: string;
    confidence?: string;
    evidence?: unknown;
    tariffType?: string | null;
    durationMinutes?: number | null;
    parserVersion?: string;
    normalizationRunId?: string | null;
    lifecycleStatus?: string;
    supersededAt?: Date | null;
    sessionExternalId?: string | null;
    createdAt?: Date;
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
    id?: string | { not?: string; in?: string[] };
    tenantId?: string;
    profileId?: string;
    externalDomain?: string;
    externalProvider?: IntegrationProvider;
    sourceKind?: string;
    factType?: string | { in?: string[] };
    sessionExternalId?: string | { in?: string[] };
    lifecycleStatus?: string;
    happenedAt?: DateRange;
  };
  type RawUniqueWhere = {
    tenantId_sourceKind_externalProvider_externalDomain_sourceHash: {
      sourceHash: string;
    };
  };
  type FactUniqueWhere = {
    tenantId_factType_sourceHash_parserVersion: {
      factType: string;
      sourceHash: string;
      parserVersion: string;
    };
  };
  type SyncState = {
    status: string;
    lastStartedAt: Date | null;
    lastSuccessfulTo: Date | null;
    syncFrom: Date | null;
    rawRecordsCount: number;
    factsCount: number;
    diagnostics?: unknown;
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
    orderBy?: Array<Record<string, 'asc' | 'desc'>>;
  };
  type MockLangameSettingsService = {
    resolveTenantAccess: jest.MockedFunction<
      LangameSettingsService['resolveTenantAccess']
    >;
  };
  type MockLangameClient = {
    listGuestLogs: jest.MockedFunction<LangameClient['listGuestLogs']>;
    listGuestSessions: jest.MockedFunction<LangameClient['listGuestSessions']>;
    listTariffTypeGroups: jest.MockedFunction<
      LangameClient['listTariffTypeGroups']
    >;
    listTransactions: jest.MockedFunction<LangameClient['listTransactions']>;
    listProductExpenses: jest.MockedFunction<
      LangameClient['listProductExpenses']
    >;
    listBalanceTopups: jest.MockedFunction<LangameClient['listBalanceTopups']>;
    listGoods: jest.MockedFunction<LangameClient['listGoods']>;
  };
  type MockGuestIdentityResolverService = {
    findActiveGuestForProfileDomain: jest.MockedFunction<
      GuestIdentityResolverService['findActiveGuestForProfileDomain']
    >;
  };

  let rawRecords: Map<string, LedgerRow>;
  let facts: Map<string, LedgerRow>;
  let syncState: SyncState | null;
  let syncStateUpdate: jest.Mock;
  let sourceSyncStates: Map<string, Record<string, unknown>>;
  let syncJobs: Map<string, Record<string, any>>;
  let prisma: PrismaService;
  let langameClient: MockLangameClient;
  let guestIdentityResolver: MockGuestIdentityResolverService;
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
    if (typeof where.id === 'string' && row.id !== where.id) {
      return false;
    }

    if (
      typeof where.id === 'object' &&
      where.id.not &&
      row.id === where.id.not
    ) {
      return false;
    }

    if (
      typeof where.id === 'object' &&
      where.id.in &&
      !where.id.in.includes(row.id)
    ) {
      return false;
    }

    if (where.tenantId && row.tenantId !== where.tenantId) {
      return false;
    }

    if (where.profileId && row.profileId !== where.profileId) {
      return false;
    }

    if (where.externalDomain && row.externalDomain !== where.externalDomain) {
      return false;
    }

    if (
      where.externalProvider &&
      row.externalProvider !== where.externalProvider
    ) {
      return false;
    }

    if (where.sourceKind && row.sourceKind !== where.sourceKind) {
      return false;
    }

    if (typeof where.factType === 'string' && row.factType !== where.factType) {
      return false;
    }

    if (
      typeof where.factType === 'object' &&
      where.factType.in &&
      !where.factType.in.includes(String(row.factType))
    ) {
      return false;
    }

    if (
      typeof where.sessionExternalId === 'string' &&
      row.sessionExternalId !== where.sessionExternalId
    ) {
      return false;
    }

    if (
      typeof where.sessionExternalId === 'object' &&
      where.sessionExternalId.in &&
      !where.sessionExternalId.in.includes(String(row.sessionExternalId))
    ) {
      return false;
    }

    if (
      where.lifecycleStatus &&
      row.lifecycleStatus !== where.lifecycleStatus
    ) {
      return false;
    }

    return inDateRange(row.happenedAt, where.happenedAt);
  };

  beforeEach(() => {
    rawRecords = new Map();
    facts = new Map();
    syncState = null;
    syncStateUpdate = jest.fn().mockResolvedValue({});
    sourceSyncStates = new Map();
    syncJobs = new Map();
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn(
        (callback: (tx: PrismaService) => unknown): unknown => callback(prisma),
      ),
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
      langameClubProductConfiguration: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      langameProductGroup: {
        findMany: jest.fn().mockResolvedValue([]),
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
        findMany: jest.fn().mockResolvedValue([]),
        update: syncStateUpdate,
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
      guestActivitySourceSyncState: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          const sourceKind =
            where
              .tenantId_externalProvider_externalDomain_externalGuestId_sourceKind
              .sourceKind;
          return Promise.resolve(sourceSyncStates.get(sourceKind) ?? null);
        }),
        upsert: jest.fn().mockImplementation(({ where, create, update }) => {
          const sourceKind =
            where
              .tenantId_externalProvider_externalDomain_externalGuestId_sourceKind
              .sourceKind;
          const row = {
            ...(sourceSyncStates.get(sourceKind) ?? create),
            ...update,
          };
          sourceSyncStates.set(sourceKind, row);
          return Promise.resolve(row);
        }),
      },
      guestActivitySyncJob: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.jobKey) {
            return Promise.resolve(syncJobs.get(where.jobKey) ?? null);
          }
          return Promise.resolve(
            Array.from(syncJobs.values()).find((row) => row.id === where.id) ??
              null,
          );
        }),
        findFirst: jest.fn().mockImplementation(() => {
          const row = Array.from(syncJobs.values()).find((candidate) =>
            ['PENDING', 'RETRY'].includes(candidate.status),
          );
          return Promise.resolve(
            row
              ? {
                  ...row,
                  tenant: {
                    customerStage: TenantCustomerStage.INTERNAL,
                  },
                }
              : null,
          );
        }),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) => {
          const row = {
            ...data,
            id: `sync-job-${syncJobs.size + 1}`,
            attempts: data.attempts ?? 0,
            rerunRequested: data.rerunRequested ?? false,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          syncJobs.set(data.jobKey, row);
          return Promise.resolve(row);
        }),
        upsert: jest.fn().mockImplementation(({ where, create, update }) => {
          const existing = syncJobs.get(where.jobKey);
          const row = existing
            ? { ...existing, ...update, updatedAt: new Date() }
            : {
                ...create,
                id: `sync-job-${syncJobs.size + 1}`,
                attempts: create.attempts ?? 0,
                rerunRequested: create.rerunRequested ?? false,
                createdAt: new Date(),
                updatedAt: new Date(),
              };
          syncJobs.set(where.jobKey, row);
          return Promise.resolve(row);
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const entry = Array.from(syncJobs.entries()).find(
            ([, row]) => row.id === where.id,
          );
          if (!entry) {
            return Promise.resolve(null);
          }
          const [key, existing] = entry;
          const row = { ...existing, ...data, updatedAt: new Date() };
          syncJobs.set(key, row);
          return Promise.resolve(row);
        }),
        updateMany: jest.fn().mockImplementation(({ where, data }) => {
          const entry = Array.from(syncJobs.entries()).find(
            ([, row]) => row.id === where.id,
          );
          if (!entry) {
            return Promise.resolve({ count: 0 });
          }
          const [key, existing] = entry;
          syncJobs.set(key, {
            ...existing,
            ...data,
            attempts: existing.attempts + (data.attempts?.increment ?? 0),
            updatedAt: new Date(),
          });
          return Promise.resolve({ count: 1 });
        }),
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
            const unique = where.tenantId_factType_sourceHash_parserVersion;
            return Promise.resolve(
              facts.get(
                `${unique.factType}:${unique.sourceHash}:${unique.parserVersion}`,
              ) ?? null,
            );
          }),
        upsert: jest
          .fn()
          .mockImplementation(({ where, create, update }: FactUpsertArgs) => {
            const unique = where.tenantId_factType_sourceHash_parserVersion;
            const key = `${unique.factType}:${unique.sourceHash}:${unique.parserVersion}`;
            const existing = facts.get(key);
            if (existing) {
              Object.assign(existing, update);
              return Promise.resolve(existing);
            }
            const fact = {
              ...create,
              id: `fact-${facts.size + 1}`,
              createdAt: new Date(Date.now() + facts.size),
            };
            facts.set(key, fact);
            return Promise.resolve(fact);
          }),
        updateMany: jest.fn().mockImplementation(({ where, data }) => {
          let count = 0;
          for (const fact of facts.values()) {
            if (!matchesFactWhere(fact, where)) {
              continue;
            }
            if (where.rawRecordId && fact.rawRecordId !== where.rawRecordId) {
              continue;
            }

            const matchesOr = !where.OR?.length
              ? true
              : where.OR.some((clause: Record<string, any>) => {
                  if (Object.keys(clause).length === 0) {
                    return true;
                  }
                  if (clause.parserVersion?.not) {
                    return fact.parserVersion !== clause.parserVersion.not;
                  }
                  if (clause.factType?.notIn) {
                    return !clause.factType.notIn.includes(fact.factType);
                  }
                  return false;
                });
            if (!matchesOr) {
              continue;
            }

            Object.assign(fact, data);
            count += 1;
          }
          return Promise.resolve({ count });
        }),
        findMany: jest
          .fn()
          .mockImplementation(
            ({ where, select, orderBy }: FactFindManyArgs) => {
              const rows = Array.from(facts.values()).filter((row) =>
                matchesFactWhere(row, where ?? {}),
              );
              if (orderBy?.length) {
                rows.sort((left, right) => {
                  for (const ordering of orderBy) {
                    const [field, direction] =
                      Object.entries(ordering)[0] ?? [];
                    if (!field || !direction) continue;
                    const comparison =
                      field === 'createdAt'
                        ? (left.createdAt?.getTime() ?? 0) -
                          (right.createdAt?.getTime() ?? 0)
                        : field === 'id'
                          ? left.id.localeCompare(right.id)
                          : 0;
                    if (comparison !== 0) {
                      return direction === 'desc' ? -comparison : comparison;
                    }
                  }
                  return 0;
                });
              }
              return Promise.resolve(
                rows.map((row) => selectFields(row, select)),
              );
            },
          ),
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
      listTariffTypeGroups: jest
        .fn<LangameClient['listTariffTypeGroups']>()
        .mockResolvedValue([
          { id: 1, type: 'basic', name: 'Почасовой тариф' },
          { id: 9, type: 'subscription', name: 'Абонемент' },
        ]),
      listTransactions: jest
        .fn<LangameClient['listTransactions']>()
        .mockResolvedValue([]),
      listProductExpenses: jest
        .fn<LangameClient['listProductExpenses']>()
        .mockResolvedValue([]),
      listBalanceTopups: jest
        .fn<LangameClient['listBalanceTopups']>()
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
    guestIdentityResolver = {
      findActiveGuestForProfileDomain: jest
        .fn<GuestIdentityResolverService['findActiveGuestForProfileDomain']>()
        .mockResolvedValue(null),
    };
    service = new GuestActivityLedgerService(
      prisma,
      langameSettingsService as unknown as LangameSettingsService,
      langameClient as unknown as LangameClient,
      guestIdentityResolver as unknown as GuestIdentityResolverService,
    );
  });

  it('runs generic-session remediation before acknowledging parser replay success', async () => {
    const remediation = jest
      .spyOn(
        genericSessionRemediation,
        'drainLegacyGenericSessionClassifications',
      )
      .mockResolvedValue({
        scanned: 1,
        remediated: 1,
        quarantined: 0,
        deferred: 0,
        failed: 0,
        hasMore: false,
        complete: true,
        batches: 1,
      });

    try {
      const result = await service.syncProfile({
        tenantId,
        profileId,
        storeId,
        reason: 'HOURLY_SESSION_EXPAND_REPLAY',
      });

      expect(result.status).toBe('SUCCESS');
      expect(remediation).toHaveBeenCalledWith(prisma, {
        tenantId,
        limit: 100,
        maxBatches: 20,
        includeSessionStart: true,
        includePlayTime: true,
      });
      expect(syncState).toEqual(
        expect.objectContaining({
          diagnostics: expect.objectContaining({
            genericSessionClassificationRemediation: {
              scanned: 1,
              remediated: 1,
              quarantined: 0,
              deferred: 0,
              failed: 0,
              hasMore: false,
              complete: true,
              batches: 1,
            },
          }),
        }),
      );
    } finally {
      remediation.mockRestore();
    }
  });

  it('prefers the active identity link for the selected store domain', async () => {
    const domainGuestId = 'guest-domain-1';
    const domainExternalGuestId = '7331';
    guestIdentityResolver.findActiveGuestForProfileDomain.mockResolvedValue({
      id: domainGuestId,
      phoneHash: 'domain-phone-hash',
      phoneMasked: '***0000',
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain: source.domain,
      externalGuestId: domainExternalGuestId,
    });

    const result = await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'DOMAIN_IDENTITY_LINK',
    });

    expect(result.status).toBe('SUCCESS');
    expect(
      guestIdentityResolver.findActiveGuestForProfileDomain,
    ).toHaveBeenCalledWith({
      tenantId,
      profileId,
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain: source.domain,
    });
    expect(langameClient.listGuestLogs).toHaveBeenCalledWith(
      source.baseUrl,
      'api-key',
      expect.objectContaining({ guestId: domainExternalGuestId }),
    );
    expect(langameClient.listGuestLogs).not.toHaveBeenCalledWith(
      source.baseUrl,
      'api-key',
      expect.objectContaining({ guestId: externalGuestId }),
    );
  });

  it('does not use an identity link from another domain', async () => {
    guestIdentityResolver.findActiveGuestForProfileDomain.mockImplementation(
      ({ externalDomain }) =>
        externalDomain === 'other.langame'
          ? {
              id: 'guest-other-domain',
              phoneHash: 'other-phone-hash',
              phoneMasked: '***0000',
              externalProvider: IntegrationProvider.LANGAME,
              externalDomain: 'other.langame',
              externalGuestId: '9999',
            }
          : null,
    );

    const result = await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'IGNORE_OTHER_DOMAIN_LINK',
    });

    expect(result.status).toBe('SUCCESS');
    expect(
      guestIdentityResolver.findActiveGuestForProfileDomain,
    ).toHaveBeenCalledTimes(1);
    expect(
      guestIdentityResolver.findActiveGuestForProfileDomain,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ externalDomain: source.domain }),
    );
    expect(langameClient.listGuestLogs).toHaveBeenCalledWith(
      source.baseUrl,
      'api-key',
      expect.objectContaining({ guestId: externalGuestId }),
    );
    expect(langameClient.listGuestLogs).not.toHaveBeenCalledWith(
      source.baseUrl,
      'api-key',
      expect.objectContaining({ guestId: '9999' }),
    );
  });

  it('fails closed when both explicit and legacy guests belong to another selected store domain', async () => {
    prisma.guestGameProfile.findFirst.mockResolvedValue({
      id: profileId,
      guestId,
      phoneHash: 'phone-hash',
      guest: {
        id: guestId,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: 'legacy.langame.ru',
        externalGuestId,
      },
    });
    prisma.guest.findFirst.mockResolvedValue(null);

    const result = await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      guestId: 'explicit-other-domain-guest',
      reason: 'DOMAIN_SCOPE_FAIL_CLOSED',
    });

    expect(result.status).toBe('SKIPPED');
    expect(prisma.guest.findFirst.mock.calls).toEqual([
      [
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'explicit-other-domain-guest',
            externalDomain: source.domain,
          }),
        }),
      ],
    ]);
    expect(langameClient.listGuestLogs.mock.calls).toHaveLength(0);
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

  it('keeps a technical session start generic without an explicit tariff marker', async () => {
    langameClient.listGuestLogs.mockResolvedValue([
      {
        guest_id: externalGuestId,
        club_id: '15',
        date: '07.07.2026 18:16:53',
        type: 'start_session_on',
      },
    ]);

    const result = await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'TECHNICAL_SESSION_START',
    });

    const rawRecord = Array.from(rawRecords.values()).find(
      (record) => record.rawType === 'start_session_on',
    );
    const technicalFacts = Array.from(facts.values()).filter(
      (fact) => fact.rawRecordId === rawRecord?.id,
    );

    expect(result.status).toBe('SUCCESS');
    expect(technicalFacts).toEqual([
      expect.objectContaining({
        factType: 'SESSION_STARTED',
        confidence: 'TEXT_MATCH',
        tariffType: null,
      }),
    ]);
  });

  it('keeps an explicitly hourly text session start typed as hourly', async () => {
    langameClient.listGuestLogs.mockResolvedValue([
      {
        guest_id: externalGuestId,
        club_id: '15',
        date: '07.07.2026 18:16:53',
        type: 'Старт сессии по почасовому тарифу',
      },
    ]);

    await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'EXPLICIT_HOURLY_SESSION_START',
    });

    const rawRecord = Array.from(rawRecords.values()).find((record) =>
      String(record.rawText).includes('почасовому тарифу'),
    );
    const explicitFacts = Array.from(facts.values()).filter(
      (fact) => fact.rawRecordId === rawRecord?.id,
    );

    expect(explicitFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ factType: 'SESSION_STARTED' }),
        expect.objectContaining({
          factType: 'HOURLY_SESSION_STARTED',
          confidence: 'TEXT_MATCH',
          tariffType: 'hourly',
        }),
      ]),
    );
    expect(
      explicitFacts.some(
        (fact) => fact.factType === 'PACKAGE_OR_SUBSCRIPTION_USED',
      ),
    ).toBe(false);
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
        packet: 1,
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

  it('keeps an expanded session generic when its final tariff marker is hourly', async () => {
    langameClient.listGuestLogs.mockResolvedValue([]);
    langameClient.listGuestSessions.mockResolvedValue([
      {
        id: 'session-expanded-final-hourly-1',
        guest_id: externalGuestId,
        club_id: '15',
        date_start: '07.07.2026 10:00',
        date_stop: '07.07.2026 11:35',
        packet: 1,
        expand: 1,
      },
    ]);

    await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'EXPANDED_FINAL_HOURLY',
    });

    const sessionFacts = Array.from(facts.values()).filter(
      (fact) => fact.sessionExternalId === 'session-expanded-final-hourly-1',
    );
    const playTimeFact = sessionFacts.find(
      (fact) => fact.factType === 'SESSION_PLAY_TIME_ACCUMULATED',
    );
    const rawRecord = Array.from(rawRecords.values()).find(
      (record) => record.sourceExternalId === 'session-expanded-final-hourly-1',
    );

    expect(sessionFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ factType: 'SESSION_STARTED' }),
        expect.objectContaining({ factType: 'SESSION_ENDED' }),
        expect.objectContaining({
          factType: 'SESSION_PLAY_TIME_ACCUMULATED',
          durationMinutes: 95,
          tariffType: null,
        }),
      ]),
    );
    expect(
      sessionFacts.some((fact) =>
        [
          'HOURLY_SESSION_STARTED',
          'PACKAGE_OR_SUBSCRIPTION_USED',
          'HOURLY_PLAY_TIME_ACCUMULATED',
        ].includes(String(fact.factType)),
      ),
    ).toBe(false);
    expect(playTimeFact?.evidence).toEqual(
      expect.objectContaining({
        expand: 1,
        expanded: true,
        observedSessionBillingKind: 'hourly',
        sessionBillingKind: 'unknown',
      }),
    );
    expect(rawRecord?.rawPayload).toEqual(
      expect.objectContaining({ expand: 1, packet: 1 }),
    );
  });

  it('keeps a confirmed hourly start while expanded play time stays generic across replay', async () => {
    const sessionExternalId = 'session-expanded-hourly-history-1';
    const originalHourlySession = {
      id: sessionExternalId,
      guest_id: externalGuestId,
      club_id: '15',
      date_start: '07.07.2026 10:00',
      date_stop: '07.07.2026 11:00',
      packet: 1,
      expand: false,
    };
    const expandedFinalHourlySession = {
      ...originalHourlySession,
      date_stop: '07.07.2026 11:35',
      expand: true,
    };
    langameClient.listGuestLogs.mockResolvedValue([]);
    langameClient.listGuestSessions
      .mockResolvedValueOnce([originalHourlySession])
      .mockResolvedValueOnce([expandedFinalHourlySession])
      .mockResolvedValueOnce([originalHourlySession]);

    await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'ORIGINAL_HOURLY_SESSION',
    });
    await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'EXPANDED_FINAL_HOURLY_RECONCILIATION',
    });
    await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'REPLAY_ORIGINAL_HOURLY_SESSION',
    });

    expect(
      Array.from(facts.values()).some(
        (fact) =>
          fact.sessionExternalId === sessionExternalId &&
          fact.factType === 'HOURLY_SESSION_STARTED' &&
          fact.lifecycleStatus === 'ACTIVE',
      ),
    ).toBe(true);
    expect(
      Array.from(facts.values()).filter(
        (fact) =>
          fact.sessionExternalId === sessionExternalId &&
          fact.lifecycleStatus === 'ACTIVE' &&
          [
            'SESSION_PLAY_TIME_ACCUMULATED',
            'HOURLY_PLAY_TIME_ACCUMULATED',
            'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
          ].includes(String(fact.factType)),
      ),
    ).toEqual([
      expect.objectContaining({
        factType: 'SESSION_PLAY_TIME_ACCUMULATED',
        tariffType: null,
      }),
    ]);
  });

  it('keeps a confirmed package start when the final expanded marker looks hourly', async () => {
    const sessionExternalId = 'session-package-expanded-hourly-history-1';
    const originalPackageSession = {
      id: sessionExternalId,
      guest_id: externalGuestId,
      club_id: '15',
      date_start: '07.07.2026 10:00',
      date_stop: '07.07.2026 11:00',
      packet: 9,
      expand: false,
    };
    const expandedFinalHourlySession = {
      ...originalPackageSession,
      date_stop: '07.07.2026 11:35',
      packet: 1,
      expand: true,
    };
    langameClient.listGuestLogs.mockResolvedValue([]);
    langameClient.listGuestSessions
      .mockResolvedValueOnce([originalPackageSession])
      .mockResolvedValueOnce([expandedFinalHourlySession]);

    await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'ORIGINAL_PACKAGE_SESSION',
    });
    await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'PACKAGE_TO_EXPANDED_FINAL_HOURLY',
    });

    const activeFacts = Array.from(facts.values()).filter(
      (fact) =>
        fact.sessionExternalId === sessionExternalId &&
        fact.lifecycleStatus === 'ACTIVE',
    );
    expect(activeFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          factType: 'PACKAGE_OR_SUBSCRIPTION_USED',
          tariffType: 'package_or_subscription',
        }),
        expect.objectContaining({
          factType: 'SESSION_PLAY_TIME_ACCUMULATED',
          tariffType: null,
        }),
      ]),
    );
    expect(
      activeFacts.some((fact) => fact.factType === 'HOURLY_SESSION_STARTED'),
    ).toBe(false);
  });

  it.each([
    ['hourly', 1, 'HOURLY_SESSION_STARTED'],
    ['package', 9, 'PACKAGE_OR_SUBSCRIPTION_USED'],
  ])(
    'preserves a known %s start classification when a later unexpanded version omits the tariff',
    async (_classification, packet, expectedFactType) => {
      const sessionExternalId = `session-known-${String(_classification)}-1`;
      const knownSession = {
        id: sessionExternalId,
        guest_id: externalGuestId,
        club_id: '15',
        date_start: '07.07.2026 10:00',
        date_stop: '07.07.2026 11:00',
        packet,
        expand: 0,
      };
      const laterUnknownSession = {
        id: sessionExternalId,
        guest_id: externalGuestId,
        club_id: '15',
        date_start: '07.07.2026 10:00',
        date_stop: '07.07.2026 11:05',
        expand: 0,
      };
      langameClient.listGuestLogs.mockResolvedValue([]);
      langameClient.listGuestSessions
        .mockResolvedValueOnce([knownSession])
        .mockResolvedValueOnce([laterUnknownSession]);

      await service.syncProfile({
        tenantId,
        profileId,
        storeId,
        reason: 'KNOWN_SESSION_CLASSIFICATION',
      });
      await service.syncProfile({
        tenantId,
        profileId,
        storeId,
        reason: 'LATER_UNKNOWN_SESSION_CLASSIFICATION',
      });

      expect(
        Array.from(facts.values()).some(
          (fact) =>
            fact.sessionExternalId === sessionExternalId &&
            fact.factType === expectedFactType &&
            fact.lifecycleStatus === 'ACTIVE',
        ),
      ).toBe(true);
    },
  );

  it('normalizes completed packet sessions into package play minutes facts', async () => {
    langameClient.listGuestLogs.mockResolvedValue([]);
    langameClient.listGuestSessions.mockResolvedValue([
      {
        id: 'session-package-1',
        guest_id: externalGuestId,
        club_id: '15',
        date_start: '07.07.2026 10:00',
        date_stop: '07.07.2026 12:00',
        packet: 9,
        expand: 1,
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
        sourceExternalId: 'session-package-1',
        evidence: expect.objectContaining({
          expanded: true,
          observedSessionBillingKind: 'package_or_subscription',
          sessionBillingKind: 'package_or_subscription',
        }),
      }),
    );
  });

  it('keeps only the latest observed Langame session fact version active for a stable session id', async () => {
    langameClient.listGuestLogs.mockResolvedValue([]);
    const originalSession = {
      id: 'session-shifted-1',
      guest_id: externalGuestId,
      club_id: '15',
      date_start: '07.07.2026 10:00',
      date_stop: '07.07.2026 11:00',
      packet: 1,
    };
    const correctedSession = {
      ...originalSession,
      date_start: '07.07.2026 10:05',
      date_stop: '07.07.2026 11:10',
    };
    langameClient.listGuestSessions
      .mockResolvedValueOnce([originalSession])
      .mockResolvedValueOnce([correctedSession])
      .mockResolvedValueOnce([originalSession]);

    await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'SESSION_VERSION_ORIGINAL',
    });
    await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'SESSION_VERSION_CORRECTED',
    });
    await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'SESSION_VERSION_REPLAY_OLD',
    });

    const sessionFacts = Array.from(facts.values()).filter(
      (fact) => fact.sessionExternalId === originalSession.id,
    );
    const factTypes = new Set(sessionFacts.map((fact) => fact.factType));

    expect(rawRecords.size).toBe(2);
    expect(sessionFacts).toHaveLength(factTypes.size * 2);
    for (const factType of factTypes) {
      const versions = sessionFacts.filter(
        (fact) => fact.factType === factType,
      );
      expect(
        versions.filter((fact) => fact.lifecycleStatus === 'ACTIVE'),
      ).toHaveLength(1);
      expect(
        versions.filter(
          (fact) =>
            fact.lifecycleStatus === 'SUPERSEDED' &&
            fact.supersededAt instanceof Date,
        ),
      ).toHaveLength(1);
    }
    expect(
      sessionFacts.find(
        (fact) =>
          fact.factType === 'HOURLY_PLAY_TIME_ACCUMULATED' &&
          fact.lifecycleStatus === 'ACTIVE',
      ),
    ).toEqual(expect.objectContaining({ durationMinutes: 65 }));
  });

  it('supersedes historical duplicate session facts outside the incremental source window', async () => {
    langameClient.listGuestLogs.mockResolvedValue([]);
    langameClient.listGuestSessions.mockResolvedValue([]);
    const base = {
      tenantId,
      profileId,
      guestId,
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain: source.domain,
      sourceKind: 'LANGAME_GUEST_SESSION',
      factType: 'HOURLY_PLAY_TIME_ACCUMULATED',
      sessionExternalId: 'historical-session-1',
      lifecycleStatus: 'ACTIVE',
      supersededAt: null,
    };
    facts.set('historical-old', {
      ...base,
      id: 'historical-old',
      sourceHash: 'historical-old-hash',
      createdAt: new Date('2026-07-13T12:00:00.000Z'),
    });
    facts.set('historical-new', {
      ...base,
      id: 'historical-new',
      sourceHash: 'historical-new-hash',
      createdAt: new Date('2026-07-14T12:00:00.000Z'),
    });

    await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'HISTORICAL_SESSION_RECONCILIATION',
    });

    expect(facts.get('historical-new')).toEqual(
      expect.objectContaining({
        lifecycleStatus: 'ACTIVE',
        supersededAt: null,
      }),
    );
    expect(facts.get('historical-old')).toEqual(
      expect.objectContaining({
        lifecycleStatus: 'SUPERSEDED',
        supersededAt: expect.any(Date),
      }),
    );
  });

  it('keeps exact play time neutral when Langame omits the packet marker', async () => {
    langameClient.listGuestLogs.mockResolvedValue([]);
    langameClient.listGuestSessions.mockResolvedValue([
      {
        id: 'session-unknown-payment-1',
        guest_id: externalGuestId,
        club_id: '15',
        date_start: '07.07.2026 10:00',
        date_stop: '07.07.2026 11:00',
      },
    ]);

    await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'UNKNOWN_SESSION_PAYMENT',
    });

    const sessionFacts = Array.from(facts.values()).filter(
      (fact) => fact.sessionExternalId === 'session-unknown-payment-1',
    );
    expect(sessionFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ factType: 'SESSION_STARTED' }),
        expect.objectContaining({ factType: 'SESSION_ENDED' }),
        expect.objectContaining({
          factType: 'SESSION_PLAY_TIME_ACCUMULATED',
          confidence: 'EXACT',
          durationMinutes: 60,
          tariffType: null,
          evidence: expect.objectContaining({
            sessionBillingKind: 'unknown',
            calculation: 'date_stop - date_start',
          }),
        }),
      ]),
    );
    expect(
      sessionFacts.some((fact) =>
        [
          'HOURLY_SESSION_STARTED',
          'HOURLY_PLAY_TIME_ACCUMULATED',
          'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
        ].includes(String(fact.factType)),
      ),
    ).toBe(false);
  });

  it('reclassifies one session across the exact play-time fact family without leaving two active durations', async () => {
    langameClient.listGuestLogs.mockResolvedValue([]);
    const sessionWithoutTariff = {
      id: 'session-reclassified-1',
      guest_id: externalGuestId,
      club_id: '15',
      date_start: '07.07.2026 10:00',
      date_stop: '07.07.2026 11:00',
    };
    const classifiedHourlySession = {
      ...sessionWithoutTariff,
      packet: 1,
    };
    const reclassifiedPackageSession = {
      ...sessionWithoutTariff,
      packet: 9,
    };
    langameClient.listGuestSessions
      .mockResolvedValueOnce([sessionWithoutTariff])
      .mockResolvedValueOnce([classifiedHourlySession])
      .mockResolvedValueOnce([reclassifiedPackageSession]);

    await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'SESSION_WITHOUT_TARIFF',
    });
    await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'SESSION_RECLASSIFIED_AS_HOURLY',
    });
    await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'SESSION_RECLASSIFIED_AS_PACKAGE',
    });

    const playTimeFacts = Array.from(facts.values()).filter(
      (fact) =>
        fact.sessionExternalId === sessionWithoutTariff.id &&
        [
          'SESSION_PLAY_TIME_ACCUMULATED',
          'HOURLY_PLAY_TIME_ACCUMULATED',
          'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
        ].includes(String(fact.factType)),
    );
    const typedStartFacts = Array.from(facts.values()).filter(
      (fact) =>
        fact.sessionExternalId === sessionWithoutTariff.id &&
        ['HOURLY_SESSION_STARTED', 'PACKAGE_OR_SUBSCRIPTION_USED'].includes(
          String(fact.factType),
        ),
    );

    expect(playTimeFacts).toHaveLength(3);
    expect(
      playTimeFacts.filter((fact) => fact.lifecycleStatus === 'ACTIVE'),
    ).toEqual([
      expect.objectContaining({
        factType: 'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
        durationMinutes: 60,
        tariffType: 'package_or_subscription',
      }),
    ]);
    expect(
      playTimeFacts.filter(
        (fact) =>
          fact.factType !== 'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
      ),
    ).toEqual([
      expect.objectContaining({
        factType: 'SESSION_PLAY_TIME_ACCUMULATED',
        lifecycleStatus: 'SUPERSEDED',
        supersededAt: expect.any(Date),
      }),
      expect.objectContaining({
        factType: 'HOURLY_PLAY_TIME_ACCUMULATED',
        lifecycleStatus: 'SUPERSEDED',
        supersededAt: expect.any(Date),
      }),
    ]);
    expect(
      typedStartFacts.filter((fact) => fact.lifecycleStatus === 'ACTIVE'),
    ).toEqual([
      expect.objectContaining({
        factType: 'PACKAGE_OR_SUBSCRIPTION_USED',
        tariffType: 'package_or_subscription',
      }),
    ]);
  });

  it('keeps one physical exact session on the corrected profile when the stale binding is synced again', async () => {
    const staleProfileId = 'profile-stale-binding';
    const correctedProfileId = 'profile-corrected-binding';
    const staleExternalGuestId = 'external-stale-binding';
    const correctedExternalGuestId = 'external-corrected-binding';
    const physicalSessionId = 'physical-session-after-rebind';
    const profileRow = (
      id: string,
      linkedGuestId: string,
      externalId: string,
    ) => ({
      id,
      guestId: linkedGuestId,
      phoneHash: `phone-hash-${id}`,
      guest: {
        id: linkedGuestId,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: source.domain,
        externalGuestId: externalId,
      },
    });
    (prisma.guestGameProfile.findFirst as jest.Mock)
      .mockResolvedValueOnce(
        profileRow(staleProfileId, 'guest-stale-binding', staleExternalGuestId),
      )
      .mockResolvedValueOnce(
        profileRow(
          correctedProfileId,
          'guest-corrected-binding',
          correctedExternalGuestId,
        ),
      )
      .mockResolvedValueOnce(
        profileRow(staleProfileId, 'guest-stale-binding', staleExternalGuestId),
      );
    langameClient.listGuestLogs.mockResolvedValue([]);
    langameClient.listGuestSessions
      .mockResolvedValueOnce([
        {
          id: physicalSessionId,
          guest_id: staleExternalGuestId,
          club_id: '15',
          packet: 1,
          date_start: '07.07.2026 10:00',
          date_stop: '07.07.2026 11:00',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: physicalSessionId,
          guest_id: correctedExternalGuestId,
          club_id: '15',
          packet: 1,
          date_start: '07.07.2026 10:00',
          date_stop: '07.07.2026 11:00',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: physicalSessionId,
          guest_id: staleExternalGuestId,
          club_id: '15',
          packet: 1,
          date_start: '07.07.2026 10:00',
          date_stop: '07.07.2026 11:00',
        },
      ]);

    await service.syncProfile({
      tenantId,
      profileId: staleProfileId,
      storeId,
      reason: 'STALE_PROFILE_BINDING',
    });
    await service.syncProfile({
      tenantId,
      profileId: correctedProfileId,
      storeId,
      reason: 'CORRECTED_PROFILE_BINDING',
    });
    await service.syncProfile({
      tenantId,
      profileId: staleProfileId,
      storeId,
      reason: 'STALE_PROFILE_REPLAY',
    });

    const exactSessionFacts = Array.from(facts.values()).filter(
      (fact) =>
        fact.sessionExternalId === physicalSessionId &&
        [
          'SESSION_PLAY_TIME_ACCUMULATED',
          'HOURLY_PLAY_TIME_ACCUMULATED',
          'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
        ].includes(String(fact.factType)),
    );

    expect(exactSessionFacts).toHaveLength(2);
    expect(
      exactSessionFacts.filter((fact) => fact.lifecycleStatus === 'ACTIVE'),
    ).toEqual([
      expect.objectContaining({
        profileId: correctedProfileId,
        factType: 'HOURLY_PLAY_TIME_ACCUMULATED',
        durationMinutes: 60,
      }),
    ]);
    expect(
      exactSessionFacts.find((fact) => fact.profileId === staleProfileId),
    ).toEqual(
      expect.objectContaining({
        lifecycleStatus: 'SUPERSEDED',
        supersededAt: expect.any(Date),
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
    (
      prisma.langameClubProductConfiguration.findMany as jest.Mock
    ).mockResolvedValue([
      {
        externalClubId: '15',
        externalProductId: '415',
        externalGroupId: '9',
        product: {
          category: { id: 'leet-category-hot', name: 'Горячая еда LeetPlus' },
        },
      },
    ]);
    (prisma.langameProductGroup.findMany as jest.Mock).mockResolvedValue([
      { externalGroupId: '9', name: 'Горячая кухня' },
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
        sourceExternalId: '260973',
      }),
    );
    expect(productFact).toEqual(
      expect.objectContaining({
        confidence: 'EXACT',
        amount: 250,
        storeId,
        sourceExternalId: '260973',
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
        categoryId: 'leet-category-hot',
        categoryName: 'Горячая еда LeetPlus',
        externalCategoryKey: 'demo.langame:9',
        externalCategoryId: '9',
        externalCategoryName: 'Горячая кухня',
      }),
    );
  });

  it('keeps cancelled, returned, and non-positive product expenses out of active purchase facts', async () => {
    langameClient.listGuestLogs.mockResolvedValue([]);
    langameClient.listProductExpenses.mockResolvedValue([
      {
        id: 260974,
        date: '10.07.2026 16:12:00',
        list_goods_id: 415,
        list_clubs_id: 15,
        real_guest_id: externalGuestId,
        price_sale: 250,
        count: 1,
        cancel: 1,
      },
      {
        id: 260975,
        date: '10.07.2026 16:13:00',
        list_goods_id: 415,
        list_clubs_id: 15,
        real_guest_id: externalGuestId,
        price_sale: 250,
        count: -1,
        cancel: 0,
      },
      {
        id: 260976,
        date: '10.07.2026 16:14:00',
        list_goods_id: 415,
        list_clubs_id: 15,
        real_guest_id: externalGuestId,
        price_sale: 250,
        count: 0,
        cancel: 0,
      },
      {
        id: 260977,
        date: '10.07.2026 16:15:00',
        list_goods_id: 415,
        list_clubs_id: 15,
        real_guest_id: externalGuestId,
        price_sale: 0,
        count: 1,
        cancel: 0,
      },
    ]);

    await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'PRODUCT_PURCHASE_REVERSALS',
    });

    expect(
      Array.from(rawRecords.values()).filter(
        (row) => row.sourceKind === 'LANGAME_PRODUCT_EXPENSE',
      ),
    ).toHaveLength(4);
    expect(
      Array.from(facts.values()).filter(
        (fact) => fact.factType === 'PRODUCT_PURCHASED',
      ),
    ).toHaveLength(0);
  });

  it('normalizes guest-linked balance history rows into exact topup facts', async () => {
    langameClient.listGuestLogs.mockResolvedValue([]);
    langameClient.listBalanceTopups.mockResolvedValue([
      {
        id: 901,
        guest_id: externalGuestId,
        guest_name: 'Sensitive guest name',
        phone: 'sensitive-value',
        amount: '500.00',
        date: '14.07.2026 12:30:00',
      },
      {
        id: 902,
        guest_id: 'another-guest',
        amount: '1000.00',
        date: '14.07.2026 12:31:00',
      },
    ]);

    const result = await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'BALANCE_TOPUPS',
    });

    const topupRaw = Array.from(rawRecords.values()).find(
      (row) => row.sourceKind === 'LANGAME_BALANCE_TOPUP',
    );
    const topupFact = Array.from(facts.values()).find(
      (fact) => fact.factType === 'BALANCE_TOPUP',
    );

    expect(result.status).toBe('SUCCESS');
    expect(langameClient.listBalanceTopups).toHaveBeenCalledWith(
      source.baseUrl,
      'api-key',
      expect.objectContaining({ dateFrom: '2026-06-30' }),
    );
    expect(
      Array.from(rawRecords.values()).filter(
        (row) => row.sourceKind === 'LANGAME_BALANCE_TOPUP',
      ),
    ).toHaveLength(1);
    expect(topupRaw).toEqual(
      expect.objectContaining({
        rawType: 'BALANCE_TOPUP',
        amount: 500,
        storeId: null,
        sourceExternalId: '901',
      }),
    );
    expect(topupRaw?.rawPayload).toEqual({
      id: 901,
      guest_id: externalGuestId,
      amount: '500.00',
      date: '14.07.2026 12:30:00',
    });
    expect(topupFact).toEqual(
      expect.objectContaining({
        confidence: 'EXACT',
        amount: 500,
        storeId: null,
        sourceExternalId: '901',
      }),
    );
    expect(topupFact?.evidence).toEqual({
      sourceKind: 'LANGAME_BALANCE_TOPUP',
      operationId: '901',
      amount: 500,
      scope: 'LANGAME_DOMAIN',
    });
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

  it('versions normalized facts and supersedes facts no longer confirmed by the parser', async () => {
    langameClient.listGuestLogs.mockResolvedValueOnce([
      {
        id: 501,
        guest_id: externalGuestId,
        club_id: '15',
        date: '10.07.2026 12:00',
        type: 'Старт сессии',
      },
    ]);

    await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'VERSIONED_NORMALIZATION',
    });

    const rawRecord = Array.from(rawRecords.values()).find((record) =>
      String(record.rawText).includes('Старт сессии'),
    );
    expect(rawRecord).toBeDefined();
    const createdFacts = Array.from(facts.values()).filter(
      (fact) => fact.rawRecordId === rawRecord!.id,
    );
    expect(createdFacts.length).toBeGreaterThan(0);
    expect(createdFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          parserVersion: 'guest-activity-v4',
          lifecycleStatus: 'ACTIVE',
          normalizationRunId: expect.any(String),
        }),
      ]),
    );

    Object.assign(rawRecord!, {
      rawType: 'unclassified',
      rawText: 'Техническая запись без игрового события',
      rawPayload: { type: 'unclassified' },
    });

    const rebuilt = await service.rebuildProfileFacts({
      tenantId,
      profileId,
      storeId,
      reason: 'PARSER_REBUILD',
    });

    expect(rebuilt).toEqual(
      expect.objectContaining({
        parserVersion: 'guest-activity-v4',
        rawRecordsProcessed: rawRecords.size,
      }),
    );
    expect(
      createdFacts.every(
        (fact) =>
          fact.lifecycleStatus === 'SUPERSEDED' &&
          fact.supersededAt instanceof Date,
      ),
    ).toBe(true);
  });

  it('replays the historical source window once when the stored parser version is stale', async () => {
    const syncFrom = new Date('2026-07-01T05:00:00.000Z');
    const lastSuccessfulTo = new Date('2026-07-29T05:00:00.000Z');
    syncState = {
      status: 'SUCCESS',
      lastStartedAt: null,
      lastSuccessfulTo,
      syncFrom,
      rawRecordsCount: 12,
      factsCount: 18,
      diagnostics: {
        parserVersion: 'guest-activity-v4',
        replayVersion: 'legacy-hourly-policy',
      },
    };
    sourceSyncStates.set('LANGAME_GUEST_SESSION', {
      status: 'SUCCESS',
      lastSuccessfulTo,
      syncFrom,
      diagnostics: {
        parserVersion: 'guest-activity-v4',
        replayVersion: 'legacy-hourly-policy',
      },
    });
    sourceSyncStates.set('LANGAME_TRANSACTION', {
      status: 'SUCCESS',
      lastSuccessfulTo,
      syncFrom,
      diagnostics: {
        parserVersion: 'guest-activity-v4',
        replayVersion: 'legacy-hourly-policy',
      },
    });

    const first = await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'PARSER_V5_HISTORICAL_REPLAY',
    });

    expect(first.status).toBe('SUCCESS');
    expect(langameClient.listGuestSessions).toHaveBeenCalledWith(
      source.baseUrl,
      'api-key',
      expect.objectContaining({ dateFrom: '2026-06-30', page: 1 }),
    );
    expect(langameClient.listTransactions).toHaveBeenCalledWith(
      source.baseUrl,
      'api-key',
      expect.objectContaining({ dateFrom: '2026-07-28', page: 1 }),
    );
    expect(syncState?.diagnostics).toEqual(
      expect.objectContaining({
        parserVersion: 'guest-activity-v4',
        replayVersion: 'hourly-session-expand-v1',
        parserReplay: true,
      }),
    );
    expect(sourceSyncStates.get('LANGAME_GUEST_SESSION')).toEqual(
      expect.objectContaining({
        diagnostics: expect.objectContaining({
          parserVersion: 'guest-activity-v4',
          replayVersion: 'hourly-session-expand-v1',
          parserReplay: true,
        }),
      }),
    );

    langameClient.listGuestSessions.mockClear();
    const second = await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'PARSER_V5_INCREMENTAL_SYNC',
    });

    expect(second.status).toBe('SUCCESS');
    expect(langameClient.listGuestSessions).toHaveBeenCalledWith(
      source.baseUrl,
      'api-key',
      expect.objectContaining({
        dateFrom: expect.not.stringMatching(/^2026-06-30$/),
        page: 1,
      }),
    );
    expect(sourceSyncStates.get('LANGAME_GUEST_SESSION')).toEqual(
      expect.objectContaining({
        diagnostics: expect.objectContaining({
          parserVersion: 'guest-activity-v4',
          replayVersion: 'hourly-session-expand-v1',
          parserReplay: false,
        }),
      }),
    );
  });

  it('does not checkpoint the replay before fetched rows persist and retries it successfully', async () => {
    const syncFrom = new Date('2026-07-01T05:00:00.000Z');
    const lastSuccessfulTo = new Date('2026-07-29T05:00:00.000Z');
    syncState = {
      status: 'SUCCESS',
      lastStartedAt: null,
      lastSuccessfulTo,
      syncFrom,
      rawRecordsCount: 4,
      factsCount: 6,
      diagnostics: {
        parserVersion: 'guest-activity-v4',
        replayVersion: 'legacy-hourly-policy',
      },
    };
    sourceSyncStates.set('LANGAME_GUEST_LOG', {
      status: 'SUCCESS',
      lastSuccessfulTo,
      syncFrom,
      diagnostics: {
        parserVersion: 'guest-activity-v4',
        replayVersion: 'legacy-hourly-policy',
      },
    });
    langameClient.listGuestLogs.mockResolvedValue([
      {
        id: 9601,
        guest_id: externalGuestId,
        club_id: '15',
        date: '07.07.2026 18:16:53',
        type: 'start_session_on',
      },
    ]);
    (
      prisma.guestActivityRawRecord.upsert as unknown as jest.Mock
    ).mockRejectedValueOnce(new Error('injected raw persistence failure'));

    await expect(
      service.syncProfile({
        tenantId,
        profileId,
        storeId,
        reason: 'REPLAY_PERSISTENCE_FAILURE',
      }),
    ).rejects.toThrow('injected raw persistence failure');

    expect(sourceSyncStates.get('LANGAME_GUEST_LOG')).toEqual(
      expect.objectContaining({
        status: 'RUNNING',
        lastSuccessfulTo,
        diagnostics: expect.not.objectContaining({
          replayVersion: 'hourly-session-expand-v1',
        }),
      }),
    );

    const retried = await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'REPLAY_AFTER_PERSISTENCE_FAILURE',
    });

    expect(retried.status).toBe('SUCCESS');
    expect(langameClient.listGuestLogs).toHaveBeenLastCalledWith(
      source.baseUrl,
      'api-key',
      expect.objectContaining({ dateFrom: '2026-06-30', page: 1 }),
    );
    expect(sourceSyncStates.get('LANGAME_GUEST_LOG')).toEqual(
      expect.objectContaining({
        status: 'SUCCESS',
        lastSuccessfulTo: expect.any(Date),
        diagnostics: expect.objectContaining({
          parserVersion: 'guest-activity-v4',
          replayVersion: 'hourly-session-expand-v1',
          parserReplay: true,
        }),
      }),
    );
  });

  it('keeps the stable generic fact id while replay supersedes a legacy inferred hourly fact', async () => {
    const technicalStart = {
      id: 9501,
      guest_id: externalGuestId,
      club_id: '15',
      date: '07.07.2026 18:16:53',
      type: 'start_session_on',
    };
    langameClient.listGuestLogs.mockResolvedValue([technicalStart]);

    await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'SEED_STABLE_TECHNICAL_START',
    });

    const rawRecord = Array.from(rawRecords.values()).find(
      (record) => record.rawType === 'start_session_on',
    );
    const genericFact = Array.from(facts.values()).find(
      (fact) =>
        fact.rawRecordId === rawRecord?.id &&
        fact.factType === 'SESSION_STARTED',
    );
    expect(rawRecord).toBeDefined();
    expect(genericFact).toBeDefined();

    const legacyHourlyKey = `HOURLY_SESSION_STARTED:${String(rawRecord?.sourceHash)}:guest-activity-v4`;
    facts.set(legacyHourlyKey, {
      ...genericFact!,
      id: 'legacy-inferred-hourly-fact',
      factType: 'HOURLY_SESSION_STARTED',
      tariffType: 'hourly',
      confidence: 'INFERRED',
      lifecycleStatus: 'ACTIVE',
      supersededAt: null,
      createdAt: new Date('2026-07-07T13:17:00.000Z'),
    });
    syncState = {
      ...syncState!,
      diagnostics: {
        parserVersion: 'guest-activity-v4',
        replayVersion: 'legacy-hourly-policy',
      },
    };
    sourceSyncStates.set('LANGAME_GUEST_LOG', {
      ...sourceSyncStates.get('LANGAME_GUEST_LOG'),
      diagnostics: {
        parserVersion: 'guest-activity-v4',
        replayVersion: 'legacy-hourly-policy',
      },
    });

    await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'REPLAY_TECHNICAL_START_IN_PLACE',
    });

    const replayedGenericFacts = Array.from(facts.values()).filter(
      (fact) =>
        fact.rawRecordId === rawRecord!.id &&
        fact.factType === 'SESSION_STARTED',
    );
    expect(replayedGenericFacts).toHaveLength(1);
    expect(replayedGenericFacts[0]).toEqual(
      expect.objectContaining({
        id: genericFact!.id,
        parserVersion: 'guest-activity-v4',
        lifecycleStatus: 'ACTIVE',
      }),
    );
    expect(facts.get(legacyHourlyKey)).toEqual(
      expect.objectContaining({
        id: 'legacy-inferred-hourly-fact',
        lifecycleStatus: 'SUPERSEDED',
        supersededAt: expect.any(Date),
      }),
    );
  });

  it('reactivates the confirmed initial typed start after a legacy expanded version superseded it', async () => {
    const sessionExternalId = 'session-reactivate-initial-hourly-1';
    const common = {
      tenantId,
      profileId,
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain: source.domain,
      sourceKind: 'LANGAME_GUEST_SESSION',
      sessionExternalId,
    };
    facts.set('generic-expanded', {
      ...common,
      id: 'generic-expanded',
      factType: 'SESSION_STARTED',
      sourceHash: 'expanded-hash',
      lifecycleStatus: 'ACTIVE',
      createdAt: new Date('2026-07-15T05:00:00.000Z'),
      evidence: {
        expanded: true,
        observedSessionBillingKind: 'hourly',
        sessionBillingKind: 'unknown',
      },
    });
    facts.set('generic-initial', {
      ...common,
      id: 'generic-initial',
      factType: 'SESSION_STARTED',
      sourceHash: 'initial-hash',
      lifecycleStatus: 'SUPERSEDED',
      createdAt: new Date('2026-07-10T05:00:00.000Z'),
      // Production rows created before tariff evidence was added kept the
      // exact classification only in the typed sibling with the same hash.
      evidence: { sourceKind: 'LANGAME_GUEST_SESSION' },
    });
    facts.set('typed-expanded-legacy', {
      ...common,
      id: 'typed-expanded-legacy',
      factType: 'HOURLY_SESSION_STARTED',
      sourceHash: 'expanded-hash',
      lifecycleStatus: 'ACTIVE',
      supersededAt: null,
      createdAt: new Date('2026-07-15T05:00:01.000Z'),
    });
    facts.set('typed-initial', {
      ...common,
      id: 'typed-initial',
      factType: 'HOURLY_SESSION_STARTED',
      sourceHash: 'initial-hash',
      lifecycleStatus: 'SUPERSEDED',
      supersededAt: new Date('2026-07-15T05:00:01.000Z'),
      createdAt: new Date('2026-07-10T05:00:01.000Z'),
    });

    await (service as any).reconcileSessionStartClassificationVersions(
      {
        tenantId,
        profile: { id: profileId },
        externalDomain: source.domain,
      },
      sessionExternalId,
    );

    expect(facts.get('typed-initial')).toEqual(
      expect.objectContaining({
        lifecycleStatus: 'ACTIVE',
        supersededAt: null,
      }),
    );
    expect(facts.get('typed-expanded-legacy')).toEqual(
      expect.objectContaining({
        lifecycleStatus: 'SUPERSEDED',
        supersededAt: expect.any(Date),
      }),
    );
    expect((prisma as any).$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: 'Serializable' },
    );
  });

  it('keeps a first-observed expanded hourly session without an active typed start', async () => {
    const sessionExternalId = 'session-first-expanded-hourly-1';
    const common = {
      tenantId,
      profileId,
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain: source.domain,
      sourceKind: 'LANGAME_GUEST_SESSION',
      sessionExternalId,
      sourceHash: 'first-expanded-hash',
    };
    facts.set('generic-first-expanded', {
      ...common,
      id: 'generic-first-expanded',
      factType: 'SESSION_STARTED',
      lifecycleStatus: 'ACTIVE',
      createdAt: new Date('2026-07-15T05:00:00.000Z'),
      evidence: {
        expanded: true,
        observedSessionBillingKind: 'hourly',
        sessionBillingKind: 'unknown',
      },
    });
    facts.set('typed-first-expanded-legacy', {
      ...common,
      id: 'typed-first-expanded-legacy',
      factType: 'HOURLY_SESSION_STARTED',
      lifecycleStatus: 'ACTIVE',
      supersededAt: null,
      createdAt: new Date('2026-07-15T05:00:01.000Z'),
    });

    await (service as any).reconcileSessionStartClassificationVersions(
      {
        tenantId,
        profile: { id: profileId },
        externalDomain: source.domain,
      },
      sessionExternalId,
    );

    expect(facts.get('typed-first-expanded-legacy')).toEqual(
      expect.objectContaining({
        lifecycleStatus: 'SUPERSEDED',
        supersededAt: expect.any(Date),
      }),
    );
    expect(
      Array.from(facts.values()).filter(
        (fact) =>
          fact.sessionExternalId === sessionExternalId &&
          fact.factType !== 'SESSION_STARTED' &&
          fact.lifecycleStatus === 'ACTIVE',
      ),
    ).toHaveLength(0);
  });

  it('does not reactivate an all-superseded historical session classification', async () => {
    const sessionExternalId = 'session-expanded-tombstone-1';
    facts.set('legacy-hourly-v3', {
      id: 'legacy-hourly-v3',
      tenantId,
      profileId,
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain: source.domain,
      sourceKind: 'LANGAME_GUEST_SESSION',
      sourceHash: 'legacy-hourly-hash-v3',
      factType: 'HOURLY_SESSION_STARTED',
      sessionExternalId,
      lifecycleStatus: 'SUPERSEDED',
      supersededAt: new Date('2026-07-20T05:00:00.000Z'),
      createdAt: new Date('2026-07-10T05:00:00.000Z'),
    });
    facts.set('legacy-hourly-v4', {
      id: 'legacy-hourly-v4',
      tenantId,
      profileId,
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain: source.domain,
      sourceKind: 'LANGAME_GUEST_SESSION',
      sourceHash: 'legacy-hourly-hash-v4',
      factType: 'HOURLY_SESSION_STARTED',
      sessionExternalId,
      lifecycleStatus: 'SUPERSEDED',
      supersededAt: new Date('2026-07-20T05:00:00.000Z'),
      createdAt: new Date('2026-07-15T05:00:00.000Z'),
    });

    await (service as any).reconcileHistoricalSessionFactVersions({
      tenantId,
      profile: { id: profileId },
      externalDomain: source.domain,
    });

    expect(
      Array.from(facts.values()).filter(
        (fact) => fact.sessionExternalId === sessionExternalId,
      ),
    ).toEqual([
      expect.objectContaining({
        id: 'legacy-hourly-v3',
        lifecycleStatus: 'SUPERSEDED',
      }),
      expect.objectContaining({
        id: 'legacy-hourly-v4',
        lifecycleStatus: 'SUPERSEDED',
      }),
    ]);
  });

  it('continues a partial source from the saved next page without advancing its watermark', async () => {
    const fullPage = Array.from({ length: 200 }, (_, index) => ({
      id: index + 1,
      guest_id: externalGuestId,
      club_id: '15',
      date: '06.07.2026 17:00',
      type: `log-${index}`,
    }));
    langameClient.listGuestLogs.mockImplementation((_url, _key, query) =>
      (query?.page ?? 1) <= 20 ? fullPage : [],
    );

    const first = await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'PARTIAL_FIRST',
    });
    const partialState = sourceSyncStates.get('LANGAME_GUEST_LOG');

    expect(first.status).toBe('PARTIAL');
    expect(partialState).toEqual(
      expect.objectContaining({
        status: 'PARTIAL',
        nextPage: 21,
      }),
    );
    expect(partialState).not.toHaveProperty('lastSuccessfulTo');

    langameClient.listGuestLogs.mockClear();
    const second = await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'PARTIAL_CONTINUE',
    });

    expect(second.status).toBe('SUCCESS');
    expect(langameClient.listGuestLogs).toHaveBeenCalledWith(
      source.baseUrl,
      'api-key',
      expect.objectContaining({ page: 21 }),
    );
    expect(sourceSyncStates.get('LANGAME_GUEST_LOG')).toEqual(
      expect.objectContaining({
        status: 'SUCCESS',
        nextPage: null,
        lastSuccessfulTo: expect.any(Date),
      }),
    );
  });

  it('keeps successful sources when one Langame endpoint fails', async () => {
    langameClient.listTransactions.mockRejectedValue(
      new Error('transactions unavailable'),
    );

    const result = await service.syncProfile({
      tenantId,
      profileId,
      storeId,
      reason: 'ONE_SOURCE_FAILED',
    });

    expect(result.status).toBe('PARTIAL');
    expect(sourceSyncStates.get('LANGAME_TRANSACTION')).toEqual(
      expect.objectContaining({
        status: 'FAILED',
        errorMessage: 'transactions unavailable',
      }),
    );
    expect(sourceSyncStates.get('LANGAME_TRANSACTION')).not.toHaveProperty(
      'lastSuccessfulTo',
    );
    expect(sourceSyncStates.get('LANGAME_GUEST_LOG')).toEqual(
      expect.objectContaining({ status: 'SUCCESS' }),
    );
  });

  it('persists queued sync work and marks a claimed job successful', async () => {
    await service.enqueueProfileSync({
      tenantId,
      profileId,
      guestId,
      storeId,
      reason: 'GAME_SUMMARY',
    });
    jest.spyOn(service, 'syncProfile').mockResolvedValue({
      status: 'SUCCESS',
    } as any);

    const result = await service.processQueuedSyncJobs(1, 'test-worker');
    const job = Array.from(syncJobs.values())[0];

    expect(result).toMatchObject({ processed: 1, success: 1 });
    expect(
      (prisma.guestActivitySyncJob.findFirst as jest.Mock).mock.calls[0]?.[0],
    ).toMatchObject({
      where: {
        tenant: {
          customerStage: TenantCustomerStage.INTERNAL,
        },
      },
      include: {
        tenant: {
          select: {
            customerStage: true,
          },
        },
      },
    });
    expect(job).toEqual(
      expect.objectContaining({
        status: 'SUCCESS',
        attempts: 1,
        lockedAt: null,
        lockedBy: null,
      }),
    );
  });

  it('keeps a dedicated worker claim inside its exact tenant', async () => {
    await service.enqueueProfileSync({
      tenantId,
      profileId,
      guestId,
      storeId,
      reason: 'DEDICATED_WORKER',
    });
    jest.spyOn(service, 'syncProfile').mockResolvedValue({
      status: 'SUCCESS',
    } as any);

    await service.processQueuedSyncJobs(1, 'systemd-worker', tenantId);

    expect(
      (prisma.guestActivitySyncJob.findFirst as jest.Mock).mock.calls[0]?.[0],
    ).toMatchObject({ where: { tenantId } });
    expect(
      (prisma.guestActivitySyncJob.updateMany as jest.Mock).mock.calls[0]?.[0],
    ).toMatchObject({ where: { tenantId } });
  });

  it('does not claim queued sync work for an external tenant', async () => {
    await service.enqueueProfileSync({
      tenantId,
      profileId,
      guestId,
      storeId,
      reason: 'EXTERNAL_CONTAINMENT',
    });
    const job = Array.from(syncJobs.values())[0];
    (prisma.guestActivitySyncJob.findFirst as jest.Mock).mockResolvedValueOnce({
      ...job,
      tenant: {
        customerStage: TenantCustomerStage.PILOT,
      },
    });
    const syncProfile = jest.spyOn(service, 'syncProfile');

    const result = await service.processQueuedSyncJobs(1, 'test-worker');

    expect(result).toMatchObject({ processed: 0 });
    expect(
      (prisma.guestActivitySyncJob.updateMany as jest.Mock).mock.calls,
    ).toHaveLength(0);
    expect(syncProfile).not.toHaveBeenCalled();
  });

  it('does not claim queued sync work when runtime tenant identity is missing', async () => {
    await service.enqueueProfileSync({
      tenantId,
      profileId,
      guestId,
      storeId,
      reason: 'RUNTIME_IDENTITY_CONTAINMENT',
    });
    const job = Array.from(syncJobs.values())[0];
    (prisma.guestActivitySyncJob.findFirst as jest.Mock).mockResolvedValueOnce({
      ...job,
      tenantId: '',
      tenant: {
        customerStage: TenantCustomerStage.INTERNAL,
      },
    });
    const syncProfile = jest.spyOn(service, 'syncProfile');

    const result = await service.processQueuedSyncJobs(1, 'test-worker');

    expect(result).toMatchObject({ processed: 0 });
    expect(
      (prisma.guestActivitySyncJob.updateMany as jest.Mock).mock.calls,
    ).toHaveLength(0);
    expect(syncProfile).not.toHaveBeenCalled();
  });

  it('marks a queued stale external guest sync as skipped', async () => {
    await service.enqueueProfileSync({
      tenantId,
      profileId,
      guestId,
      storeId,
      reason: 'STALE_BINDING_TEST',
    });
    jest.spyOn(service, 'syncProfile').mockResolvedValue({
      status: 'STALE_BINDING',
      errorMessage: 'Guest not found',
    } as any);

    const result = await service.processQueuedSyncJobs(1, 'test-worker');
    const job = Array.from(syncJobs.values())[0];

    expect(result).toMatchObject({ processed: 1, skipped: 1, failed: 0 });
    expect(job.status).toBe('SKIPPED');
  });

  it('queues recoverable partial states and skips stale guest bindings', async () => {
    (prisma.guestActivitySyncState.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'sync-partial',
        tenantId,
        profileId,
        guestId,
        storeId,
        status: 'PARTIAL',
        errorMessage: 'upstream timeout',
        diagnostics: null,
        tenant: {
          customerStage: TenantCustomerStage.INTERNAL,
        },
      },
      {
        id: 'sync-stale',
        tenantId,
        profileId: 'profile-stale',
        guestId: 'guest-stale',
        storeId,
        status: 'FAILED',
        errorMessage: 'Guest not found',
        diagnostics: null,
        tenant: {
          customerStage: TenantCustomerStage.INTERNAL,
        },
      },
    ]);

    const result = await service.enqueueDueRecoverySyncs(10);

    expect(result).toEqual({ scanned: 2, queued: 1, skipped: 1 });
    expect(
      (prisma.guestActivitySyncState.findMany as jest.Mock).mock.calls[0]?.[0],
    ).toMatchObject({
      where: {
        tenant: {
          customerStage: TenantCustomerStage.INTERNAL,
        },
      },
      select: {
        tenant: {
          select: {
            customerStage: true,
          },
        },
      },
    });
    expect(Array.from(syncJobs.values())).toEqual([
      expect.objectContaining({
        profileId,
        status: 'PENDING',
        reason: 'AUTOMATIC_HOURLY_SESSION_REPLAY',
      }),
    ]);
    expect(syncStateUpdate).toHaveBeenCalledWith({
      where: { id: 'sync-stale' },
      data: { status: 'STALE_BINDING' },
    });
  });

  it('queues a successful source whose hourly-session replay marker is stale', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([
      {
        id: 'sync-success-before-hourly-replay',
        tenantId,
        profileId,
        guestId,
        storeId,
        status: 'SUCCESS',
        errorMessage: null,
        diagnostics: { replayVersion: 'older-replay' },
        customerStage: TenantCustomerStage.INTERNAL,
      },
    ]);

    const result = await service.enqueueDueRecoverySyncs(10);

    expect(result).toEqual({ scanned: 1, queued: 1, skipped: 0 });
    expect(Array.from(syncJobs.values())).toEqual([
      expect.objectContaining({
        profileId,
        status: 'PENDING',
        reason: 'AUTOMATIC_HOURLY_SESSION_REPLAY',
      }),
    ]);
    const replayQuery = (prisma.$queryRaw as jest.Mock).mock.calls[0]?.[0] as {
      strings: readonly string[];
      values: readonly unknown[];
    };
    expect(replayQuery.strings.join(' ')).toContain('FROM "GuestActivityFact"');
    expect(replayQuery.strings.join(' ')).toContain(
      'LEFT JOIN "GuestActivitySyncState"',
    );
    expect(replayQuery.strings.join(' ')).toContain('INNER JOIN "Tenant"');
    expect(replayQuery.strings.join(' ')).toContain('tenant."customerStage"');
    expect(replayQuery.strings.join(' ')).toContain("'INTERNAL'");
    expect(replayQuery.strings.join(' ')).toContain('state."id" IS NULL');
    expect(replayQuery.values).toContain('hourly-session-expand-v1');
  });

  it('keeps automatic recovery reads inside its exact worker tenant', async () => {
    await service.enqueueDueRecoverySyncs(
      10,
      new Date('2026-09-04T12:00:00.000Z'),
      tenantId,
    );

    expect(
      (prisma.guestActivitySyncState.findMany as jest.Mock).mock.calls[0]?.[0],
    ).toMatchObject({ where: { tenantId } });
    const replayQuery = (prisma.$queryRaw as jest.Mock).mock.calls[0]?.[0] as {
      strings: readonly string[];
      values: readonly unknown[];
    };
    expect(replayQuery.strings.join(' ')).toContain('AND fact."tenantId" =');
    expect(replayQuery.values).toContain(tenantId);
  });

  it('does not enqueue or mutate recovery state for an external tenant', async () => {
    (prisma.guestActivitySyncState.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'sync-external',
        tenantId,
        profileId,
        guestId,
        storeId,
        status: 'FAILED',
        errorMessage: 'upstream timeout',
        diagnostics: null,
        tenant: {
          customerStage: TenantCustomerStage.PILOT,
        },
      },
    ]);
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([
      {
        id: 'sync-external-hourly-replay',
        tenantId,
        profileId,
        guestId,
        storeId,
        status: 'SUCCESS',
        errorMessage: null,
        diagnostics: { replayVersion: 'older-replay' },
        customerStage: TenantCustomerStage.BETA,
      },
    ]);
    const enqueueProfileSync = jest.spyOn(service, 'enqueueProfileSync');

    const result = await service.enqueueDueRecoverySyncs(10);

    expect(result).toEqual({ scanned: 2, queued: 0, skipped: 2 });
    expect(enqueueProfileSync).not.toHaveBeenCalled();
    expect(syncStateUpdate).not.toHaveBeenCalled();
  });

  it('does not enqueue or mutate recovery state when runtime tenant identity is missing', async () => {
    (prisma.guestActivitySyncState.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'sync-missing-tenant',
        tenantId: '',
        profileId,
        guestId,
        storeId,
        status: 'FAILED',
        errorMessage: 'upstream timeout',
        diagnostics: null,
        tenant: {
          customerStage: TenantCustomerStage.INTERNAL,
        },
      },
    ]);
    const enqueueProfileSync = jest.spyOn(service, 'enqueueProfileSync');

    const result = await service.enqueueDueRecoverySyncs(10);

    expect(result).toEqual({ scanned: 1, queued: 0, skipped: 1 });
    expect(enqueueProfileSync).not.toHaveBeenCalled();
    expect(syncStateUpdate).not.toHaveBeenCalled();
  });

  it('requests a rerun without releasing an already running sync job', async () => {
    await service.enqueueProfileSync({
      tenantId,
      profileId,
      guestId,
      storeId,
      reason: 'FIRST',
    });
    const job = Array.from(syncJobs.values())[0];
    job.status = 'RUNNING';

    await service.enqueueProfileSync({
      tenantId,
      profileId,
      guestId,
      storeId,
      reason: 'SECOND',
    });

    expect(Array.from(syncJobs.values())[0]).toEqual(
      expect.objectContaining({
        status: 'RUNNING',
        rerunRequested: true,
        reason: 'SECOND',
      }),
    );
  });

  it('retries a failed queued sync with backoff', async () => {
    await service.enqueueProfileSync({
      tenantId,
      profileId,
      guestId,
      storeId,
      reason: 'GAME_SUMMARY',
    });
    jest
      .spyOn(service, 'syncProfile')
      .mockRejectedValue(new Error('temporary Langame error'));

    const result = await service.processQueuedSyncJobs(1, 'test-worker');
    const job = Array.from(syncJobs.values())[0];

    expect(result).toMatchObject({ processed: 1, retried: 1 });
    expect(job).toEqual(
      expect.objectContaining({
        status: 'RETRY',
        attempts: 1,
        lastError: 'temporary Langame error',
        nextAttemptAt: expect.any(Date),
      }),
    );
  });
});

describe('guest activity sync failure classification', () => {
  it('separates stale identities, configuration errors and transient failures', () => {
    expect(
      classifyGuestActivitySyncFailure(
        '400 Bad Request: guest_id validation failed, Guest not found',
      ),
    ).toBe('STALE_EXTERNAL_GUEST');
    expect(classifyGuestActivitySyncFailure('401 Unauthorized')).toBe(
      'AUTH_CONFIGURATION',
    );
    expect(classifyGuestActivitySyncFailure('504 upstream timeout')).toBe(
      'TRANSIENT_UPSTREAM',
    );
  });

  it('retries cursor partials and transient errors but not stale bindings', () => {
    expect(
      isRecoverableSyncState({
        status: 'PARTIAL',
        errorMessage: null,
        diagnostics: { sourceResults: { logs: { nextPage: 21 } } },
      }),
    ).toBe(true);
    expect(
      isRecoverableSyncState({
        status: 'PARTIAL',
        errorMessage: null,
        diagnostics: {
          sourceResults: {
            logs: { errorMessage: '503 service unavailable' },
          },
        },
      }),
    ).toBe(true);
    expect(
      isRecoverableSyncState({
        status: 'FAILED',
        errorMessage: 'Guest not found',
        diagnostics: null,
      }),
    ).toBe(false);
  });
});

describe('guest activity fact selection for session rules', () => {
  it.each([
    ['SESSION_START', null, ['SESSION_STARTED']],
    ['SESSION_START', 'ANY', ['SESSION_STARTED']],
    ['SESSION_START', 'HOURLY', ['HOURLY_SESSION_STARTED']],
    [
      'SESSION_START',
      'PACKAGE_OR_SUBSCRIPTION',
      ['PACKAGE_OR_SUBSCRIPTION_USED'],
    ],
  ])(
    'selects one canonical fact stream for %s / %s',
    (triggerKind, sessionType, expected) => {
      expect(relevantFactsForRule(triggerKind, sessionType)).toEqual(expected);
    },
  );
});

describe('guest activity payload sanitization', () => {
  it('stores only whitelisted business fields and masks PII', () => {
    expect(
      sanitizeGuestActivityRawPayload({
        id: 42,
        type: 'purchase',
        phone: '+7 922 130-63-30',
        email: 'guest@example.com',
        full_name: 'Иван Иванов',
        product_name: 'Сэндвич',
        secret_internal_note: 'do not persist',
      }),
    ).toEqual({
      id: 42,
      type: 'purchase',
      phone: '***6330',
      email: '[redacted]',
      full_name: '[redacted]',
      product_name: 'Сэндвич',
    });
  });

  it('masks embedded phones and emails in free text and evidence', () => {
    expect(
      sanitizeGuestActivityText(
        'Контакт +7 (922) 130-63-30, почта guest@example.com',
      ),
    ).toBe('Контакт ***6330, почта [redacted-email]');
    expect(
      sanitizeGuestActivityEvidencePayload({
        sourceKind: 'guest_logs',
        comment: 'Позвонить 89221306330',
        email: 'guest@example.com',
      }),
    ).toEqual({
      sourceKind: 'guest_logs',
      comment: 'Позвонить ***6330',
      email: '[redacted]',
    });
  });
});
