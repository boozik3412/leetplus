import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { IntegrationProvider, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth.types';
import { LangameClient } from '../integrations/langame.client';
import { parseLangameDate } from '../integrations/langame-date';
import { LangameSettingsService } from '../integrations/langame-settings.service';
import type {
  LangameGuestLog,
  LangameGuestSession,
  LangameProductExpense,
  LangameTransaction,
} from '../integrations/langame.types';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_PAGE_LIMIT = 200;
const MAX_SYNC_PAGES_PER_SOURCE = 20;
const DEFAULT_BASELINE_DAYS = 7;
const SYNC_OVERLAP_DAYS = 1;
const RUNNING_SYNC_STALE_MS = 5 * 60 * 1000;
const INFERRED_PACKAGE_USAGE_LOOKBACK_DAYS = 30;
const INFERRED_PACKAGE_USAGE_SIGNAL_WINDOW_MS = 15 * 60 * 1000;

const SOURCE_GUEST_LOG = 'LANGAME_GUEST_LOG';
const SOURCE_GUEST_SESSION = 'LANGAME_GUEST_SESSION';
const SOURCE_TRANSACTION = 'LANGAME_TRANSACTION';
const SOURCE_PRODUCT_EXPENSE = 'LANGAME_PRODUCT_EXPENSE';

type GuestActivityFactType =
  | 'SESSION_STARTED'
  | 'SESSION_ENDED'
  | 'PACKAGE_OR_SUBSCRIPTION_PURCHASED'
  | 'PACKAGE_OR_SUBSCRIPTION_USED'
  | 'HOURLY_SESSION_STARTED'
  | 'HOURLY_PLAY_TIME_ACCUMULATED'
  | 'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED'
  | 'PRODUCT_PURCHASED'
  | 'BALANCE_WRITE_OFF'
  | 'BONUS_TOPUP'
  | 'VISIT'
  | 'REWARD_TRACE';

type GuestActivityConfidence = 'EXACT' | 'TEXT_MATCH' | 'INFERRED' | 'UNKNOWN';

type GuestActivitySyncStatus =
  | 'IDLE'
  | 'RUNNING'
  | 'SUCCESS'
  | 'PARTIAL'
  | 'FAILED'
  | 'SKIPPED';

type LedgerSyncInput = {
  tenantId: string;
  profileId: string;
  storeId?: string | null;
  guestId?: string | null;
  reason?: string;
};

type LedgerSyncContext = {
  tenantId: string;
  profile: {
    id: string;
    guestId: string | null;
    phoneHash: string | null;
  };
  guest: {
    id: string;
    externalProvider: IntegrationProvider | null;
    externalDomain: string | null;
    externalGuestId: string | null;
  } | null;
  store: {
    id: string;
    name: string;
    externalDomain: string | null;
    externalClubId: string | null;
    integrationSourceId: string | null;
    timeZone: string | null;
  } | null;
  stores: Array<{
    id: string;
    externalDomain: string | null;
    externalClubId: string | null;
    integrationSourceId: string | null;
    timeZone: string | null;
  }>;
  source: {
    id: string;
    domain: string;
    baseUrl: string;
  };
  apiKey: string;
  externalGuestId: string;
  externalDomain: string;
  timeZone: string;
};

type RawRecordDraft = {
  sourceKind: string;
  sourceKey: string;
  sourceHash: string;
  rawType: string | null;
  rawText: string | null;
  happenedAt: Date | null;
  sourceLocalDate: string | null;
  externalClubId: string | null;
  storeId: string | null;
  sessionExternalId: string | null;
  amount: number | null;
  bonusAmount: number | null;
  rawPayload: Prisma.InputJsonValue;
};

type ProductNamesByClub = Map<string, Map<string, string>>;

type FactDraft = {
  factType: GuestActivityFactType;
  happenedAt: Date | null;
  sourceLocalDate: string | null;
  externalClubId: string | null;
  storeId: string | null;
  sessionExternalId: string | null;
  tariffName: string | null;
  tariffType: string | null;
  amount: number | null;
  bonusAmount: number | null;
  durationMinutes: number | null;
  confidence: GuestActivityConfidence;
  evidence: Prisma.InputJsonValue;
};

type SyncWindow = {
  from: Date;
  to: Date;
  initial: boolean;
  earliestRuleAt: Date | null;
};

export type GuestActivityLedgerDiagnostics = {
  syncState: unknown;
  rawRecords: unknown[];
  facts: unknown[];
  activeRuleWindow: {
    earliestRuleAt: string | null;
    syncFrom: string | null;
    storeId: string | null;
  };
  potentialMatches: Array<{
    ruleType: string;
    ruleId: string;
    title: string;
    status: string;
    storeIds: string[];
    relevantFactTypes: string[];
    matchingFacts: number;
  }>;
};

@Injectable()
export class GuestActivityLedgerService {
  private readonly logger = new Logger(GuestActivityLedgerService.name);
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly langameSettingsService: LangameSettingsService,
    private readonly langameClient: LangameClient,
  ) {}

  scheduleProfileSync(input: LedgerSyncInput) {
    const key = `${input.tenantId}:${input.profileId}:${input.storeId ?? ''}`;

    if (this.inFlight.has(key)) {
      return;
    }

    const promise = this.syncProfile(input)
      .then(() => undefined)
      .catch((error) => {
        this.logger.warn(
          `Guest activity ledger sync failed for profile ${input.profileId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, promise);
  }

  async syncProfile(input: LedgerSyncInput) {
    const context = await this.resolveContext(input);

    if (!context) {
      return { status: 'SKIPPED' as GuestActivitySyncStatus };
    }

    const state = await this.prisma.guestActivitySyncState.findUnique({
      where: {
        tenantId_externalProvider_externalDomain_externalGuestId: {
          tenantId: context.tenantId,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: context.externalDomain,
          externalGuestId: context.externalGuestId,
        },
      },
    });

    if (this.isFreshRunningSync(state?.status, state?.lastStartedAt)) {
      return { status: 'SKIPPED' as GuestActivitySyncStatus };
    }

    const window = await this.resolveSyncWindow(context, state);

    await this.upsertSyncState(context, {
      status: 'RUNNING',
      window,
      rawRecordsCount: state?.rawRecordsCount ?? 0,
      factsCount: state?.factsCount ?? 0,
      diagnostics: {
        reason: input.reason ?? null,
        startedAt: new Date().toISOString(),
      },
    });

    try {
      const result = await this.fetchAndPersist(context, window);
      const status: GuestActivitySyncStatus = result.partial
        ? 'PARTIAL'
        : 'SUCCESS';

      await this.upsertSyncState(context, {
        status,
        window,
        rawRecordsCount: result.rawRecordsCount,
        factsCount: result.factsCount,
        diagnostics: {
          reason: input.reason ?? null,
          sourceCounts: result.sourceCounts,
          partial: result.partial,
          earliestRuleAt: window.earliestRuleAt?.toISOString() ?? null,
        },
      });

      return { status, ...result };
    } catch (error) {
      await this.upsertSyncState(context, {
        status: 'FAILED',
        window,
        rawRecordsCount: state?.rawRecordsCount ?? 0,
        factsCount: state?.factsCount ?? 0,
        errorMessage: error instanceof Error ? error.message : String(error),
        diagnostics: {
          reason: input.reason ?? null,
          failedAt: new Date().toISOString(),
        },
      });
      throw error;
    }
  }

  async getDiagnostics(
    user: AuthenticatedUser,
    query: {
      profileId?: string;
      guestId?: string;
      externalGuestId?: string;
      limit?: string | number;
    },
  ): Promise<GuestActivityLedgerDiagnostics> {
    const tenantId = this.requireTenantId(user);
    const limit = clampNumber(Number(query.limit ?? 30), 5, 100);
    const profile = query.profileId
      ? await this.prisma.guestGameProfile.findFirst({
          where: { id: query.profileId, tenantId },
          select: { id: true, guestId: true },
        })
      : null;
    const guestId = query.guestId ?? profile?.guestId ?? null;
    const guest = guestId
      ? await this.prisma.guest.findFirst({
          where: { id: guestId, tenantId },
          select: {
            id: true,
            externalDomain: true,
            externalGuestId: true,
          },
        })
      : query.externalGuestId
        ? await this.prisma.guest.findFirst({
            where: { tenantId, externalGuestId: query.externalGuestId },
            select: {
              id: true,
              externalDomain: true,
              externalGuestId: true,
            },
          })
        : null;

    if (!profile && !guest && !query.externalGuestId) {
      throw new BadRequestException(
        'Укажите profileId, guestId или externalGuestId для диагностики.',
      );
    }

    const externalGuestId =
      guest?.externalGuestId ?? nullableString(query.externalGuestId);
    const externalDomain = guest?.externalDomain ?? undefined;

    const baseWhere = {
      tenantId,
      ...(profile?.id ? { profileId: profile.id } : {}),
      ...(guest?.id ? { guestId: guest.id } : {}),
      ...(externalGuestId && !guest?.id ? { externalGuestId } : {}),
      ...(externalDomain ? { externalDomain } : {}),
    };

    const [syncState, rawRecords, facts, activeRuleWindow] = await Promise.all([
      externalGuestId
        ? this.prisma.guestActivitySyncState.findFirst({
            where: baseWhere,
            orderBy: { updatedAt: 'desc' },
          })
        : null,
      this.prisma.guestActivityRawRecord.findMany({
        where: baseWhere,
        orderBy: [{ happenedAt: 'desc' }, { createdAt: 'desc' }],
        take: limit,
      }),
      this.prisma.guestActivityFact.findMany({
        where: baseWhere,
        orderBy: [{ happenedAt: 'desc' }, { createdAt: 'desc' }],
        take: limit,
      }),
      this.resolveEarliestActiveRuleDate(tenantId, null),
    ]);

    return {
      syncState,
      rawRecords,
      facts,
      activeRuleWindow: {
        earliestRuleAt: activeRuleWindow?.toISOString() ?? null,
        syncFrom: syncState?.syncFrom?.toISOString() ?? null,
        storeId: null,
      },
      potentialMatches: await this.resolvePotentialMatches(
        tenantId,
        null,
        facts.map((fact) => fact.factType),
      ),
    };
  }

  private async resolveContext(
    input: LedgerSyncInput,
  ): Promise<LedgerSyncContext | null> {
    const profile = await this.prisma.guestGameProfile.findFirst({
      where: { id: input.profileId, tenantId: input.tenantId },
      select: {
        id: true,
        guestId: true,
        phoneHash: true,
        guest: {
          select: {
            id: true,
            externalProvider: true,
            externalDomain: true,
            externalGuestId: true,
          },
        },
      },
    });

    if (!profile) {
      return null;
    }

    const guest =
      profile.guest ??
      (profile.guestId
        ? await this.prisma.guest.findFirst({
            where: { id: profile.guestId, tenantId: input.tenantId },
            select: {
              id: true,
              externalProvider: true,
              externalDomain: true,
              externalGuestId: true,
            },
          })
        : null);
    const externalGuestId = nullableString(guest?.externalGuestId);

    if (!guest || !externalGuestId) {
      return null;
    }

    const store = input.storeId
      ? await this.prisma.store.findFirst({
          where: { id: input.storeId, tenantId: input.tenantId },
          select: {
            id: true,
            name: true,
            externalDomain: true,
            externalClubId: true,
            integrationSourceId: true,
            timeZone: true,
          },
        })
      : null;
    const { apiKey, sources } =
      await this.langameSettingsService.resolveTenantAccess(input.tenantId);
    const externalDomain =
      nullableString(store?.externalDomain) ??
      nullableString(guest.externalDomain) ??
      nullableString(sources[0]?.domain);
    const source =
      sources.find((item) => item.id === store?.integrationSourceId) ??
      sources.find((item) => item.domain === externalDomain) ??
      sources[0];

    if (!source) {
      return null;
    }

    const stores = await this.prisma.store.findMany({
      where: {
        tenantId: input.tenantId,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: source.domain,
      },
      select: {
        id: true,
        externalDomain: true,
        externalClubId: true,
        integrationSourceId: true,
        timeZone: true,
      },
    });

    return {
      tenantId: input.tenantId,
      profile: {
        id: profile.id,
        guestId: guest.id,
        phoneHash: profile.phoneHash,
      },
      guest,
      store,
      stores,
      source: {
        id: source.id,
        domain: source.domain,
        baseUrl: source.baseUrl,
      },
      apiKey,
      externalGuestId,
      externalDomain: source.domain,
      timeZone: store?.timeZone ?? 'Asia/Yekaterinburg',
    };
  }

  private async resolveSyncWindow(
    context: LedgerSyncContext,
    state: { lastSuccessfulTo: Date | null; syncFrom: Date | null } | null,
  ): Promise<SyncWindow> {
    const to = new Date();

    if (state?.lastSuccessfulTo) {
      return {
        from: subtractDays(state.lastSuccessfulTo, SYNC_OVERLAP_DAYS),
        to,
        initial: false,
        earliestRuleAt: state.syncFrom,
      };
    }

    const earliestRuleAt = await this.resolveEarliestActiveRuleDate(
      context.tenantId,
      context.store?.id ?? null,
    );

    return {
      from: earliestRuleAt
        ? subtractDays(earliestRuleAt, SYNC_OVERLAP_DAYS)
        : subtractDays(to, DEFAULT_BASELINE_DAYS),
      to,
      initial: true,
      earliestRuleAt,
    };
  }

  private async resolveEarliestActiveRuleDate(
    tenantId: string,
    storeId: string | null,
  ) {
    const [lootBoxes, missions, seasons, promoCards] = await Promise.all([
      this.prisma.guestGameLootBox.findMany({
        where: { tenantId, status: 'ACTIVE' },
        select: {
          createdAt: true,
          storeIds: true,
        },
      }),
      this.prisma.guestGameMission.findMany({
        where: { tenantId, status: 'ACTIVE' },
        select: {
          createdAt: true,
          periodFrom: true,
          storeIds: true,
        },
      }),
      this.prisma.guestGameSeason.findMany({
        where: { tenantId, status: 'ACTIVE' },
        select: {
          createdAt: true,
          periodFrom: true,
          storeIds: true,
        },
      }),
      this.prisma.guestGamePromoCard.findMany({
        where: { tenantId, status: 'ACTIVE' },
        select: {
          createdAt: true,
          periodFrom: true,
          storeIds: true,
        },
      }),
    ]);
    const dates = [
      ...lootBoxes
        .filter((rule) => ruleAppliesToStore(rule.storeIds, storeId))
        .map((rule) => rule.createdAt),
      ...missions
        .filter((rule) => ruleAppliesToStore(rule.storeIds, storeId))
        .map((rule) => rule.periodFrom ?? rule.createdAt),
      ...seasons
        .filter((rule) => ruleAppliesToStore(rule.storeIds, storeId))
        .map((rule) => rule.periodFrom ?? rule.createdAt),
      ...promoCards
        .filter((rule) => ruleAppliesToStore(rule.storeIds, storeId))
        .map((rule) => rule.periodFrom ?? rule.createdAt),
    ];

    if (dates.length === 0) {
      return null;
    }

    return dates.reduce((earliest, date) =>
      date.getTime() < earliest.getTime() ? date : earliest,
    );
  }

  private async fetchAndPersist(
    context: LedgerSyncContext,
    window: SyncWindow,
  ) {
    const sourceCounts = {
      guestLogs: 0,
      sessions: 0,
      transactions: 0,
      productExpenses: 0,
    };
    let partial = false;
    const dateFrom = formatDateParam(window.from);
    const dateTo = formatDateParam(window.to);

    const guestLogs = await this.fetchPaged(
      (page) =>
        this.langameClient.listGuestLogs(
          context.source.baseUrl,
          context.apiKey,
          {
            page,
            pageLimit: DEFAULT_PAGE_LIMIT,
            dateFrom,
            dateTo,
            guestId: context.externalGuestId,
          },
        ),
      (row) => this.rowMatchesGuest(row, context.externalGuestId, true),
    );
    sourceCounts.guestLogs = guestLogs.rows.length;
    partial ||= guestLogs.partial;

    const sessions = await this.fetchPaged(
      (page) =>
        this.langameClient.listGuestSessions(
          context.source.baseUrl,
          context.apiKey,
          {
            page,
            pageLimit: DEFAULT_PAGE_LIMIT,
            dateFrom,
            dateTo,
          },
        ),
      (row) => this.rowMatchesGuest(row, context.externalGuestId),
    );
    sourceCounts.sessions = sessions.rows.length;
    partial ||= sessions.partial;

    const transactions = await this.fetchPaged(
      (page) =>
        this.langameClient.listTransactions(
          context.source.baseUrl,
          context.apiKey,
          {
            page,
            pageLimit: DEFAULT_PAGE_LIMIT,
            dateFrom,
            dateTo,
          },
        ),
      (row) => this.rowMatchesGuest(row, context.externalGuestId),
    );
    sourceCounts.transactions = transactions.rows.length;
    partial ||= transactions.partial;

    const productExpenses = await this.fetchPaged(
      (page) =>
        this.langameClient.listProductExpenses(
          context.source.baseUrl,
          context.apiKey,
          {
            page,
            pageLimit: DEFAULT_PAGE_LIMIT,
            dateFrom,
            dateTo,
          },
        ),
      (row) => this.rowMatchesGuest(row, context.externalGuestId),
    );
    sourceCounts.productExpenses = productExpenses.rows.length;
    partial ||= productExpenses.partial;
    const productNamesByClub = await this.fetchProductNamesByClub(
      context,
      productExpenses.rows,
    );

    let rawRecordsCount = 0;
    let factsCount = 0;

    for (const row of guestLogs.rows) {
      const persisted = await this.persistRow(
        context,
        SOURCE_GUEST_LOG,
        row,
        this.buildRawRecordFromGuestLog(context, row),
      );
      rawRecordsCount += persisted.rawRecordCreated ? 1 : 0;
      factsCount += persisted.factsCreated;
    }

    for (const row of sessions.rows) {
      const persisted = await this.persistRow(
        context,
        SOURCE_GUEST_SESSION,
        row,
        this.buildRawRecordFromSession(context, row),
      );
      rawRecordsCount += persisted.rawRecordCreated ? 1 : 0;
      factsCount += persisted.factsCreated;
    }

    for (const row of transactions.rows) {
      const persisted = await this.persistRow(
        context,
        SOURCE_TRANSACTION,
        row,
        this.buildRawRecordFromTransaction(context, row),
      );
      rawRecordsCount += persisted.rawRecordCreated ? 1 : 0;
      factsCount += persisted.factsCreated;
    }

    for (const row of productExpenses.rows) {
      const persisted = await this.persistRow(
        context,
        SOURCE_PRODUCT_EXPENSE,
        row,
        this.buildRawRecordFromProductExpense(context, row, productNamesByClub),
      );
      rawRecordsCount += persisted.rawRecordCreated ? 1 : 0;
      factsCount += persisted.factsCreated;
    }

    const inferredPackageUsageFacts =
      await this.inferPackageSubscriptionUsageFacts(context, window);
    factsCount += inferredPackageUsageFacts;

    return {
      rawRecordsCount,
      factsCount,
      sourceCounts,
      inferredPackageUsageFacts,
      partial,
    };
  }

  private async inferPackageSubscriptionUsageFacts(
    context: LedgerSyncContext,
    window: SyncWindow,
  ) {
    const sessionSignals = await this.prisma.guestActivityRawRecord.findMany({
      where: {
        tenantId: context.tenantId,
        profileId: context.profile.id,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: context.externalDomain,
        sourceKind: SOURCE_GUEST_LOG,
        rawType: { in: ['start_session_on', 'expand_session_on'] },
        happenedAt: {
          gte: window.from,
          lte: window.to,
        },
      },
      orderBy: { happenedAt: 'asc' },
      select: {
        id: true,
        sourceHash: true,
        rawType: true,
        rawText: true,
        happenedAt: true,
        sourceLocalDate: true,
        externalClubId: true,
        storeId: true,
        sessionExternalId: true,
      },
    });

    if (sessionSignals.length === 0) {
      return 0;
    }

    const purchaseFacts = await this.prisma.guestActivityFact.findMany({
      where: {
        tenantId: context.tenantId,
        profileId: context.profile.id,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: context.externalDomain,
        factType: 'PACKAGE_OR_SUBSCRIPTION_PURCHASED',
        happenedAt: {
          gte: subtractDays(window.from, INFERRED_PACKAGE_USAGE_LOOKBACK_DAYS),
          lte: window.to,
        },
      },
      orderBy: { happenedAt: 'desc' },
      select: {
        id: true,
        happenedAt: true,
        sourceLocalDate: true,
        storeId: true,
        tariffName: true,
        tariffType: true,
        confidence: true,
        evidence: true,
      },
    });

    const nearbyRawSignals = await this.prisma.guestActivityRawRecord.findMany({
      where: {
        tenantId: context.tenantId,
        profileId: context.profile.id,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: context.externalDomain,
        happenedAt: {
          gte: new Date(
            window.from.getTime() - INFERRED_PACKAGE_USAGE_SIGNAL_WINDOW_MS,
          ),
          lte: new Date(
            window.to.getTime() + INFERRED_PACKAGE_USAGE_SIGNAL_WINDOW_MS,
          ),
        },
        OR: [
          { sourceKind: SOURCE_TRANSACTION },
          {
            sourceKind: SOURCE_GUEST_LOG,
            rawType: {
              in: [
                'success_subscription_buy_log',
                'widrawed_rubbles_and_bonuses',
              ],
            },
          },
        ],
      },
      orderBy: { happenedAt: 'asc' },
      select: {
        id: true,
        sourceKind: true,
        rawType: true,
        rawText: true,
        happenedAt: true,
        storeId: true,
        amount: true,
        bonusAmount: true,
      },
    });

    let factsCreated = 0;

    for (const signal of sessionSignals) {
      if (!signal.happenedAt) {
        continue;
      }

      const purchase = purchaseFacts.find(
        (fact) =>
          Boolean(fact.happenedAt) &&
          fact.happenedAt!.getTime() <= signal.happenedAt!.getTime() &&
          signal.happenedAt!.getTime() - fact.happenedAt!.getTime() <=
            INFERRED_PACKAGE_USAGE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000 &&
          storesMatchOrUnknown(fact.storeId, signal.storeId),
      );
      const nearbyRawSignal = nearbyRawSignals.find((raw) =>
        isPackageUsageRawSignalNearSession(raw, signal),
      );

      if (!purchase && !nearbyRawSignal) {
        continue;
      }

      const beforeFact = await this.prisma.guestActivityFact.findUnique({
        where: {
          tenantId_factType_sourceHash: {
            tenantId: context.tenantId,
            factType: 'PACKAGE_OR_SUBSCRIPTION_USED',
            sourceHash: signal.sourceHash,
          },
        },
        select: { id: true },
      });

      await this.prisma.guestActivityFact.upsert({
        where: {
          tenantId_factType_sourceHash: {
            tenantId: context.tenantId,
            factType: 'PACKAGE_OR_SUBSCRIPTION_USED',
            sourceHash: signal.sourceHash,
          },
        },
        create: {
          tenantId: context.tenantId,
          rawRecordId: signal.id,
          guestId: context.guest?.id ?? null,
          profileId: context.profile.id,
          storeId: signal.storeId,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: context.externalDomain,
          externalGuestId: context.externalGuestId,
          externalClubId: signal.externalClubId,
          sourceKind: SOURCE_GUEST_LOG,
          sourceHash: signal.sourceHash,
          factType: 'PACKAGE_OR_SUBSCRIPTION_USED',
          happenedAt: signal.happenedAt,
          sourceLocalDate: signal.sourceLocalDate,
          sessionExternalId: signal.sessionExternalId,
          tariffName: purchase?.tariffName ?? null,
          tariffType: 'package_or_subscription',
          amount: null,
          bonusAmount: null,
          durationMinutes: null,
          confidence: 'INFERRED',
          evidence: buildInferredPackageUsageEvidence(
            signal,
            purchase,
            nearbyRawSignal,
          ),
        },
        update: {
          rawRecordId: signal.id,
          guestId: context.guest?.id ?? null,
          profileId: context.profile.id,
          storeId: signal.storeId,
          happenedAt: signal.happenedAt,
          sourceLocalDate: signal.sourceLocalDate,
          sessionExternalId: signal.sessionExternalId,
          tariffName: purchase?.tariffName ?? null,
          tariffType: 'package_or_subscription',
          confidence: 'INFERRED',
          evidence: buildInferredPackageUsageEvidence(
            signal,
            purchase,
            nearbyRawSignal,
          ),
        },
      });

      await this.prisma.guestActivityRawRecord.update({
        where: { id: signal.id },
        data: { parseStatus: 'FACTS_CREATED' },
      });

      if (!beforeFact) {
        factsCreated += 1;
      }
    }

    return factsCreated;
  }

  private async fetchPaged<T>(
    loadPage: (page: number) => Promise<T[]>,
    filterRow: (row: T) => boolean,
  ) {
    const rows: T[] = [];
    let partial = false;

    for (let page = 1; page <= MAX_SYNC_PAGES_PER_SOURCE; page += 1) {
      const pageRows = await loadPage(page);
      rows.push(...pageRows.filter(filterRow));

      if (pageRows.length < DEFAULT_PAGE_LIMIT) {
        return { rows, partial };
      }
    }

    partial = true;
    return { rows, partial };
  }

  private buildRawRecordFromGuestLog(
    context: LedgerSyncContext,
    row: LangameGuestLog,
  ): RawRecordDraft {
    const payload = sanitizePayload(row);
    const text = extractText(row);
    const happenedAt = parseLangameDate(
      firstString(row.date, row.date_normal, row.created_at, row.created),
      context.timeZone,
    );
    const externalClubId = firstString(row.club_id, row.list_clubs_id);
    const storeId = this.resolveStoreId(context, externalClubId);
    const rawType = nullableString(row.type);
    const amount = firstNumber(row.sum, row.amount, row.balance);
    const bonusAmount = firstNumber(row.bonus_balance, row.bonus, row.bonuses);
    const sourceHash = buildSourceHash({
      sourceKind: SOURCE_GUEST_LOG,
      externalDomain: context.externalDomain,
      externalGuestId: context.externalGuestId,
      rawType,
      text,
      happenedAt: happenedAt?.toISOString() ?? null,
      externalClubId,
      amount,
      bonusAmount,
      payload,
    });

    return {
      sourceKind: SOURCE_GUEST_LOG,
      sourceKey: `${SOURCE_GUEST_LOG}:${context.externalGuestId}:${sourceHash.slice(
        0,
        16,
      )}`,
      sourceHash,
      rawType,
      rawText: text,
      happenedAt,
      sourceLocalDate: sourceLocalDate(happenedAt, context.timeZone),
      externalClubId,
      storeId,
      sessionExternalId: firstString(row.session_id, row.UUID),
      amount,
      bonusAmount,
      rawPayload: payload,
    };
  }

  private buildRawRecordFromSession(
    context: LedgerSyncContext,
    row: LangameGuestSession,
  ): RawRecordDraft {
    const payload = sanitizePayload(row);
    const startedAt = parseLangameDate(row.date_start, context.timeZone);
    const stoppedAt = parseLangameDate(row.date_stop, context.timeZone);
    const happenedAt = startedAt ?? stoppedAt;
    const externalClubId = firstString(row.club_id, row.list_clubs_id);
    const storeId = this.resolveStoreId(context, externalClubId);
    const sourceHash = buildSourceHash({
      sourceKind: SOURCE_GUEST_SESSION,
      externalDomain: context.externalDomain,
      externalGuestId: context.externalGuestId,
      externalSessionId: firstString(row.id, row.UUID),
      startedAt: startedAt?.toISOString() ?? null,
      stoppedAt: stoppedAt?.toISOString() ?? null,
      externalClubId,
      payload,
    });

    return {
      sourceKind: SOURCE_GUEST_SESSION,
      sourceKey: `${SOURCE_GUEST_SESSION}:${context.externalGuestId}:${sourceHash.slice(
        0,
        16,
      )}`,
      sourceHash,
      rawType: nullableString(row.packet) ? 'SESSION' : null,
      rawText: extractText(row),
      happenedAt,
      sourceLocalDate: sourceLocalDate(happenedAt, context.timeZone),
      externalClubId,
      storeId,
      sessionExternalId: firstString(row.id, row.UUID),
      amount: null,
      bonusAmount: null,
      rawPayload: payload,
    };
  }

  private buildRawRecordFromTransaction(
    context: LedgerSyncContext,
    row: LangameTransaction,
  ): RawRecordDraft {
    const payload = sanitizePayload(row);
    const text = extractText(row);
    const happenedAt = parseLangameDate(
      firstString(
        row.date_normal,
        row.date,
        row.date_insert,
        row.date_update,
        row.created_at,
        row.created,
        row.time,
        row.datetime,
      ),
      context.timeZone,
    );
    const externalClubId = firstString(row.club_id, row.list_clubs_id);
    const storeId = this.resolveStoreId(context, externalClubId);
    const amount = firstNumber(row.sum, row.amount, row.balance);
    const bonusAmount = firstNumber(row.bonus_balance);
    const sourceHash = buildSourceHash({
      sourceKind: SOURCE_TRANSACTION,
      externalDomain: context.externalDomain,
      externalGuestId: context.externalGuestId,
      transactionId: firstString(row.id),
      rawType: nullableString(row.type),
      text,
      happenedAt: happenedAt?.toISOString() ?? null,
      externalClubId,
      sessionExternalId: firstString(row.session_id, row.UUID),
      amount,
      bonusAmount,
      payload,
    });

    return {
      sourceKind: SOURCE_TRANSACTION,
      sourceKey: `${SOURCE_TRANSACTION}:${
        firstString(row.id) ?? context.externalGuestId
      }:${sourceHash.slice(0, 16)}`,
      sourceHash,
      rawType: nullableString(row.type),
      rawText: text,
      happenedAt,
      sourceLocalDate: sourceLocalDate(happenedAt, context.timeZone),
      externalClubId,
      storeId,
      sessionExternalId: firstString(row.session_id, row.UUID),
      amount,
      bonusAmount,
      rawPayload: payload,
    };
  }

  private buildRawRecordFromProductExpense(
    context: LedgerSyncContext,
    row: LangameProductExpense,
    productNamesByClub: ProductNamesByClub,
  ): RawRecordDraft {
    const externalClubId = firstString(row.list_clubs_id, row.club_id);
    const storeId = this.resolveStoreId(context, externalClubId);
    const productId = firstString(
      row.list_goods_id,
      row.goods_id,
      row.good_id,
      row.product_id,
    );
    const productName =
      firstString(row.name, row.good_name, row.goods_name, row.product_name) ??
      resolveProductName(productNamesByClub, externalClubId, productId);
    const quantity = firstNumber(row.count, row.quantity, row.qty);
    const unitPrice = firstNumber(row.price_sale, row.price, row.unit_price);
    const totalAmount =
      firstNumber(row.total, row.sum, row.amount) ??
      (quantity !== null && unitPrice !== null ? quantity * unitPrice : null);
    const payload = sanitizePayload({
      ...row,
      product_name_resolved: productName,
    });
    const happenedAt = parseLangameDate(
      firstString(
        row.date,
        row.date_normal,
        row.date_insert,
        row.created_at,
        row.created,
        row.time,
        row.datetime,
      ),
      context.timeZone,
    );
    const text = productName ?? extractText(row);
    const sourceHash = buildSourceHash({
      sourceKind: SOURCE_PRODUCT_EXPENSE,
      externalDomain: context.externalDomain,
      externalGuestId: context.externalGuestId,
      expenseId: firstString(row.id),
      happenedAt: happenedAt?.toISOString() ?? null,
      externalClubId,
      productId,
      productName,
      quantity,
      unitPrice,
      totalAmount,
      canceled: isTruthyLangameFlag(row.cancel),
      payload,
    });

    return {
      sourceKind: SOURCE_PRODUCT_EXPENSE,
      sourceKey: `${SOURCE_PRODUCT_EXPENSE}:${
        firstString(row.id) ?? context.externalGuestId
      }:${sourceHash.slice(0, 16)}`,
      sourceHash,
      rawType: 'PRODUCT_PURCHASE',
      rawText: text,
      happenedAt,
      sourceLocalDate: sourceLocalDate(happenedAt, context.timeZone),
      externalClubId,
      storeId,
      sessionExternalId: firstString(row.session_id, row.UUID),
      amount: totalAmount,
      bonusAmount: null,
      rawPayload: payload,
    };
  }

  private async persistRow(
    context: LedgerSyncContext,
    sourceKind: string,
    row: Record<string, unknown>,
    raw: RawRecordDraft,
  ) {
    const before = await this.prisma.guestActivityRawRecord.findUnique({
      where: {
        tenantId_sourceKind_externalProvider_externalDomain_sourceHash: {
          tenantId: context.tenantId,
          sourceKind,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: context.externalDomain,
          sourceHash: raw.sourceHash,
        },
      },
      select: { id: true },
    });
    const rawRecord = await this.prisma.guestActivityRawRecord.upsert({
      where: {
        tenantId_sourceKind_externalProvider_externalDomain_sourceHash: {
          tenantId: context.tenantId,
          sourceKind,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: context.externalDomain,
          sourceHash: raw.sourceHash,
        },
      },
      create: {
        tenantId: context.tenantId,
        guestId: context.guest?.id ?? null,
        profileId: context.profile.id,
        storeId: raw.storeId,
        integrationSourceId: context.source.id,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: context.externalDomain,
        externalGuestId: context.externalGuestId,
        externalClubId: raw.externalClubId,
        sourceKind,
        sourceKey: raw.sourceKey,
        sourceHash: raw.sourceHash,
        rawType: raw.rawType,
        rawText: raw.rawText,
        happenedAt: raw.happenedAt,
        sourceLocalDate: raw.sourceLocalDate,
        sessionExternalId: raw.sessionExternalId,
        amount: raw.amount,
        bonusAmount: raw.bonusAmount,
        rawPayload: raw.rawPayload,
      },
      update: {
        guestId: context.guest?.id ?? null,
        profileId: context.profile.id,
        storeId: raw.storeId,
        integrationSourceId: context.source.id,
        rawType: raw.rawType,
        rawText: raw.rawText,
        happenedAt: raw.happenedAt,
        sourceLocalDate: raw.sourceLocalDate,
        sessionExternalId: raw.sessionExternalId,
        amount: raw.amount,
        bonusAmount: raw.bonusAmount,
        rawPayload: raw.rawPayload,
      },
      select: { id: true },
    });
    const facts = this.normalizeFacts(sourceKind, row, raw, context.timeZone);
    let factsCreated = 0;

    for (const fact of facts) {
      const beforeFact = await this.prisma.guestActivityFact.findUnique({
        where: {
          tenantId_factType_sourceHash: {
            tenantId: context.tenantId,
            factType: fact.factType,
            sourceHash: raw.sourceHash,
          },
        },
        select: { id: true },
      });

      await this.prisma.guestActivityFact.upsert({
        where: {
          tenantId_factType_sourceHash: {
            tenantId: context.tenantId,
            factType: fact.factType,
            sourceHash: raw.sourceHash,
          },
        },
        create: {
          tenantId: context.tenantId,
          rawRecordId: rawRecord.id,
          guestId: context.guest?.id ?? null,
          profileId: context.profile.id,
          storeId: fact.storeId,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: context.externalDomain,
          externalGuestId: context.externalGuestId,
          externalClubId: fact.externalClubId,
          sourceKind,
          sourceHash: raw.sourceHash,
          factType: fact.factType,
          happenedAt: fact.happenedAt,
          sourceLocalDate: fact.sourceLocalDate,
          sessionExternalId: fact.sessionExternalId,
          tariffName: fact.tariffName,
          tariffType: fact.tariffType,
          amount: fact.amount,
          bonusAmount: fact.bonusAmount,
          durationMinutes: fact.durationMinutes,
          confidence: fact.confidence,
          evidence: fact.evidence,
        },
        update: {
          rawRecordId: rawRecord.id,
          guestId: context.guest?.id ?? null,
          profileId: context.profile.id,
          storeId: fact.storeId,
          happenedAt: fact.happenedAt,
          sourceLocalDate: fact.sourceLocalDate,
          sessionExternalId: fact.sessionExternalId,
          tariffName: fact.tariffName,
          tariffType: fact.tariffType,
          amount: fact.amount,
          bonusAmount: fact.bonusAmount,
          durationMinutes: fact.durationMinutes,
          confidence: fact.confidence,
          evidence: fact.evidence,
        },
      });

      if (!beforeFact) {
        factsCreated += 1;
      }
    }

    await this.prisma.guestActivityRawRecord.update({
      where: { id: rawRecord.id },
      data: { parseStatus: facts.length > 0 ? 'FACTS_CREATED' : 'NO_FACTS' },
    });

    return {
      rawRecordCreated: !before,
      factsCreated,
    };
  }

  private normalizeFacts(
    sourceKind: string,
    row: Record<string, unknown>,
    raw: RawRecordDraft,
    timeZone: string,
  ): FactDraft[] {
    if (sourceKind === SOURCE_GUEST_SESSION) {
      return this.normalizeSessionFacts(row, raw, timeZone);
    }

    if (sourceKind === SOURCE_PRODUCT_EXPENSE) {
      return this.normalizeProductExpenseFacts(row, raw);
    }

    const text = normalizeSearchText(raw.rawText);
    const tariffName = extractTariffName(raw.rawText);
    const durationMinutes = extractDurationMinutes(raw.rawText);
    const facts: FactDraft[] = [];
    const addTextFact = (
      factType: GuestActivityFactType,
      tariffType: string | null = null,
      confidence: GuestActivityConfidence = 'TEXT_MATCH',
    ) => {
      facts.push({
        factType,
        happenedAt: raw.happenedAt,
        sourceLocalDate: raw.sourceLocalDate,
        externalClubId: raw.externalClubId,
        storeId: raw.storeId,
        sessionExternalId: raw.sessionExternalId,
        tariffName,
        tariffType,
        amount: raw.amount,
        bonusAmount: raw.bonusAmount,
        durationMinutes,
        confidence,
        evidence: {
          text: raw.rawText,
          sourceKind,
        },
      });
    };

    const hasSessionStart =
      /старт\s+сесс|начал[аи]?\s+сесс|session\s+start|start\s+session/.test(
        text,
      );
    const hasSessionEnd =
      /завершени[ея]\s+сесс|конец\s+сесс|session\s+(end|stop)|stop\s+session/.test(
        text,
      );
    const hasSessionExtend = /продлени[ея]\s+сесс|extend|extension/.test(text);
    const hasPurchase = /покупк|купил|куплен|purchase|buy/.test(text);
    const hasWriteOff = /списан|списано|write[- ]?off|withdraw|debit/.test(
      text,
    );
    const hasBonusTopup = /пополнени|начислен|bonus|бонус/.test(text);
    const hasReward = /награда|лутбокс|квест|задани|reward|loot/.test(text);
    const packageLike = isPackageOrSubscriptionText(text);

    if (hasSessionStart) {
      addTextFact('SESSION_STARTED');

      if (packageLike) {
        addTextFact('PACKAGE_OR_SUBSCRIPTION_USED', 'package_or_subscription');
      } else {
        addTextFact('HOURLY_SESSION_STARTED', 'hourly', 'INFERRED');
      }
    }

    if (hasSessionExtend && packageLike) {
      addTextFact('PACKAGE_OR_SUBSCRIPTION_USED', 'package_or_subscription');
    }

    if (hasSessionEnd) {
      addTextFact('SESSION_ENDED');
    }

    if (hasPurchase && packageLike) {
      addTextFact(
        'PACKAGE_OR_SUBSCRIPTION_PURCHASED',
        'package_or_subscription',
      );
    }

    if (hasWriteOff) {
      addTextFact('BALANCE_WRITE_OFF', null, 'TEXT_MATCH');
    }

    if (hasBonusTopup && !hasWriteOff) {
      addTextFact('BONUS_TOPUP', null, 'TEXT_MATCH');
    }

    if (hasReward) {
      addTextFact('REWARD_TRACE', null, 'TEXT_MATCH');
    }

    return facts;
  }

  private normalizeProductExpenseFacts(
    row: Record<string, unknown>,
    raw: RawRecordDraft,
  ): FactDraft[] {
    if (isTruthyLangameFlag(row.cancel)) {
      return [];
    }

    const productId = firstString(
      row.list_goods_id,
      row.goods_id,
      row.good_id,
      row.product_id,
    );
    const productName = firstString(
      row.product_name_resolved,
      row.name,
      row.good_name,
      row.goods_name,
      row.product_name,
      raw.rawText,
    );
    const quantity = firstNumber(row.count, row.quantity, row.qty);
    const unitPrice = firstNumber(row.price_sale, row.price, row.unit_price);

    return [
      {
        factType: 'PRODUCT_PURCHASED',
        happenedAt: raw.happenedAt,
        sourceLocalDate: raw.sourceLocalDate,
        externalClubId: raw.externalClubId,
        storeId: raw.storeId,
        sessionExternalId: raw.sessionExternalId,
        tariffName: null,
        tariffType: null,
        amount: raw.amount,
        bonusAmount: null,
        durationMinutes: null,
        confidence: 'EXACT',
        evidence: sanitizePayload({
          sourceKind: SOURCE_PRODUCT_EXPENSE,
          productId,
          productName,
          quantity,
          unitPrice,
          totalAmount: raw.amount,
        }),
      },
    ];
  }
  private normalizeSessionFacts(
    row: Record<string, unknown>,
    raw: RawRecordDraft,
    timeZone: string,
  ): FactDraft[] {
    const facts: FactDraft[] = [];
    const startedAt = parseLangameDate(firstString(row.date_start), timeZone);
    const stoppedAt = parseLangameDate(firstString(row.date_stop), timeZone);
    const sessionExternalId = firstString(row.id, row.UUID);
    const isPackageSession = isTruthyLangameFlag(row.packet);
    const playedMinutes = playedDurationMinutes(startedAt, stoppedAt);

    if (startedAt) {
      facts.push({
        factType: 'SESSION_STARTED',
        happenedAt: startedAt,
        sourceLocalDate: sourceLocalDate(startedAt, timeZone),
        externalClubId: raw.externalClubId,
        storeId: raw.storeId,
        sessionExternalId,
        tariffName: null,
        tariffType: null,
        amount: null,
        bonusAmount: null,
        durationMinutes: null,
        confidence: 'EXACT',
        evidence: { sourceKind: SOURCE_GUEST_SESSION },
      });
      if (isPackageSession) {
        facts.push({
          factType: 'PACKAGE_OR_SUBSCRIPTION_USED',
          happenedAt: startedAt,
          sourceLocalDate: sourceLocalDate(startedAt, timeZone),
          externalClubId: raw.externalClubId,
          storeId: raw.storeId,
          sessionExternalId,
          tariffName: null,
          tariffType: 'package_or_subscription',
          amount: null,
          bonusAmount: null,
          durationMinutes: null,
          confidence: 'EXACT',
          evidence: sanitizePayload({
            sourceKind: SOURCE_GUEST_SESSION,
            packet: row.packet,
          }),
        });
      } else {
        facts.push({
          factType: 'HOURLY_SESSION_STARTED',
          happenedAt: startedAt,
          sourceLocalDate: sourceLocalDate(startedAt, timeZone),
          externalClubId: raw.externalClubId,
          storeId: raw.storeId,
          sessionExternalId,
          tariffName: null,
          tariffType: 'hourly',
          amount: null,
          bonusAmount: null,
          durationMinutes: null,
          confidence: 'INFERRED',
          evidence: {
            sourceKind: SOURCE_GUEST_SESSION,
            note: 'Langame session row has no packet/subscription marker.',
          },
        });
      }
    }

    if (stoppedAt) {
      facts.push({
        factType: 'SESSION_ENDED',
        happenedAt: stoppedAt,
        sourceLocalDate: sourceLocalDate(stoppedAt, timeZone),
        externalClubId: raw.externalClubId,
        storeId: raw.storeId,
        sessionExternalId,
        tariffName: null,
        tariffType: null,
        amount: null,
        bonusAmount: null,
        durationMinutes: null,
        confidence: 'EXACT',
        evidence: { sourceKind: SOURCE_GUEST_SESSION },
      });
    }

    if (playedMinutes !== null) {
      const playTimeFactType: GuestActivityFactType = isPackageSession
        ? 'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED'
        : 'HOURLY_PLAY_TIME_ACCUMULATED';
      const tariffType = isPackageSession
        ? 'package_or_subscription'
        : 'hourly';

      facts.push({
        factType: playTimeFactType,
        happenedAt: stoppedAt,
        sourceLocalDate: sourceLocalDate(stoppedAt, timeZone),
        externalClubId: raw.externalClubId,
        storeId: raw.storeId,
        sessionExternalId,
        tariffName: null,
        tariffType,
        amount: null,
        bonusAmount: null,
        durationMinutes: playedMinutes,
        confidence: 'EXACT',
        evidence: sanitizePayload({
          sourceKind: SOURCE_GUEST_SESSION,
          startedAt: startedAt?.toISOString() ?? null,
          stoppedAt: stoppedAt?.toISOString() ?? null,
          packet: row.packet,
          calculation: 'date_stop - date_start',
        }),
      });
    }

    return facts;
  }

  private async resolvePotentialMatches(
    tenantId: string,
    storeId: string | null,
    factTypes: string[],
  ) {
    const factTypeSet = new Set(factTypes);
    const [lootBoxes, missions, seasons] = await Promise.all([
      this.prisma.guestGameLootBox.findMany({
        where: { tenantId, status: 'ACTIVE' },
        select: {
          id: true,
          name: true,
          status: true,
          triggerKind: true,
          sessionType: true,
          storeIds: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.guestGameMission.findMany({
        where: { tenantId, status: 'ACTIVE' },
        select: {
          id: true,
          name: true,
          status: true,
          triggerKind: true,
          storeIds: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.guestGameSeason.findMany({
        where: { tenantId, status: 'ACTIVE' },
        select: {
          id: true,
          name: true,
          status: true,
          storeIds: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return [
      ...lootBoxes
        .filter((rule) => ruleAppliesToStore(rule.storeIds, storeId))
        .map((rule) => {
          const relevantFactTypes = relevantFactsForRule(
            rule.triggerKind,
            rule.sessionType,
          );
          return {
            ruleType: 'lootBox',
            ruleId: rule.id,
            title: rule.name,
            status: rule.status,
            storeIds: storeIdsFromJson(rule.storeIds),
            relevantFactTypes,
            matchingFacts: relevantFactTypes.filter((type) =>
              factTypeSet.has(type),
            ).length,
          };
        }),
      ...missions
        .filter((rule) => ruleAppliesToStore(rule.storeIds, storeId))
        .map((rule) => {
          const relevantFactTypes = relevantFactsForRule(rule.triggerKind);
          return {
            ruleType: 'mission',
            ruleId: rule.id,
            title: rule.name,
            status: rule.status,
            storeIds: storeIdsFromJson(rule.storeIds),
            relevantFactTypes,
            matchingFacts: relevantFactTypes.filter((type) =>
              factTypeSet.has(type),
            ).length,
          };
        }),
      ...seasons
        .filter((rule) => ruleAppliesToStore(rule.storeIds, storeId))
        .map((rule) => {
          const relevantFactTypes = [
            'SESSION_STARTED',
            'VISIT',
            'REWARD_TRACE',
          ];
          return {
            ruleType: 'battlePass',
            ruleId: rule.id,
            title: rule.name,
            status: rule.status,
            storeIds: storeIdsFromJson(rule.storeIds),
            relevantFactTypes,
            matchingFacts: relevantFactTypes.filter((type) =>
              factTypeSet.has(type),
            ).length,
          };
        }),
    ];
  }

  private async upsertSyncState(
    context: LedgerSyncContext,
    params: {
      status: GuestActivitySyncStatus;
      window: SyncWindow;
      rawRecordsCount: number;
      factsCount: number;
      diagnostics: Prisma.InputJsonValue;
      errorMessage?: string;
    },
  ) {
    await this.prisma.guestActivitySyncState.upsert({
      where: {
        tenantId_externalProvider_externalDomain_externalGuestId: {
          tenantId: context.tenantId,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: context.externalDomain,
          externalGuestId: context.externalGuestId,
        },
      },
      create: {
        tenantId: context.tenantId,
        guestId: context.guest?.id ?? null,
        profileId: context.profile.id,
        storeId: context.store?.id ?? null,
        integrationSourceId: context.source.id,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: context.externalDomain,
        externalGuestId: context.externalGuestId,
        status: params.status,
        syncFrom: params.window.earliestRuleAt ?? params.window.from,
        lastRequestedFrom: params.window.from,
        lastRequestedTo: params.window.to,
        lastSuccessfulTo:
          params.status === 'SUCCESS' || params.status === 'PARTIAL'
            ? params.window.to
            : null,
        lastStartedAt: params.status === 'RUNNING' ? new Date() : null,
        lastFinishedAt: params.status === 'RUNNING' ? null : new Date(),
        rawRecordsCount: params.rawRecordsCount,
        factsCount: params.factsCount,
        diagnostics: params.diagnostics,
        errorMessage: params.errorMessage ?? null,
      },
      update: {
        guestId: context.guest?.id ?? null,
        profileId: context.profile.id,
        storeId: context.store?.id ?? null,
        integrationSourceId: context.source.id,
        status: params.status,
        syncFrom: params.window.earliestRuleAt ?? params.window.from,
        lastRequestedFrom: params.window.from,
        lastRequestedTo: params.window.to,
        lastSuccessfulTo:
          params.status === 'SUCCESS' || params.status === 'PARTIAL'
            ? params.window.to
            : undefined,
        lastStartedAt: params.status === 'RUNNING' ? new Date() : undefined,
        lastFinishedAt: params.status === 'RUNNING' ? null : new Date(),
        rawRecordsCount: params.rawRecordsCount,
        factsCount: params.factsCount,
        diagnostics: params.diagnostics,
        errorMessage: params.errorMessage ?? null,
      },
    });
  }

  private async fetchProductNamesByClub(
    context: LedgerSyncContext,
    rows: LangameProductExpense[],
  ): Promise<ProductNamesByClub> {
    const externalClubIds = Array.from(
      new Set(
        rows
          .map((row) => firstString(row.list_clubs_id, row.club_id))
          .filter((clubId): clubId is string => Boolean(clubId)),
      ),
    );
    const productNamesByClub: ProductNamesByClub = new Map();

    for (const externalClubId of externalClubIds) {
      const clubId = Number(externalClubId);
      if (!Number.isFinite(clubId)) {
        continue;
      }

      try {
        const goods = await this.langameClient.listGoods(
          context.source.baseUrl,
          context.apiKey,
          clubId,
        );
        productNamesByClub.set(
          externalClubId,
          new Map(
            goods
              .map(
                (good) =>
                  [firstString(good.id), nullableString(good.name)] as const,
              )
              .filter(
                (item): item is readonly [string, string] =>
                  Boolean(item[0]) && Boolean(item[1]),
              ),
          ),
        );
      } catch (error) {
        this.logger.warn(
          `Failed to fetch Langame goods for club ${externalClubId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return productNamesByClub;
  }
  private rowMatchesGuest(
    row: Record<string, unknown>,
    externalGuestId: string,
    allowMissingGuestId = false,
  ) {
    const rowGuestId = firstString(row.guest_id, row.real_guest_id);
    return allowMissingGuestId
      ? !rowGuestId || rowGuestId === externalGuestId
      : rowGuestId === externalGuestId;
  }

  private resolveStoreId(
    context: LedgerSyncContext,
    externalClubId: string | null,
  ) {
    if (!externalClubId) {
      return context.store?.id ?? null;
    }

    return (
      context.stores.find(
        (store) => nullableString(store.externalClubId) === externalClubId,
      )?.id ??
      context.store?.id ??
      null
    );
  }

  private isFreshRunningSync(status?: string | null, startedAt?: Date | null) {
    if (status !== 'RUNNING' || !startedAt) {
      return false;
    }

    return Date.now() - startedAt.getTime() < RUNNING_SYNC_STALE_MS;
  }

  private requireTenantId(user: AuthenticatedUser) {
    if (!user.tenantId) {
      throw new BadRequestException('Tenant context is required');
    }

    return user.tenantId;
  }
}

function ruleAppliesToStore(
  value: Prisma.JsonValue | null,
  storeId: string | null,
) {
  if (!storeId || value === null || value === undefined) {
    return true;
  }

  const storeIds = storeIdsFromJson(value);
  return storeIds.length === 0 || storeIds.includes(storeId);
}

function storeIdsFromJson(value: Prisma.JsonValue | null): string[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => primitiveString(item))
      .filter((item): item is string => Boolean(item));
  }

  if (typeof value === 'object') {
    const maybeStoreIds = (value as Record<string, unknown>).storeIds;
    if (Array.isArray(maybeStoreIds)) {
      return maybeStoreIds
        .map((item) => primitiveString(item))
        .filter((item): item is string => Boolean(item));
    }
  }

  return [];
}

function relevantFactsForRule(
  triggerKind: string | null,
  sessionType?: string | null,
) {
  const trigger = normalizeSearchText(triggerKind);
  const session = normalizeSearchText(sessionType);

  if (
    trigger.includes('play_time') ||
    trigger.includes('time_played') ||
    trigger.includes('minute') ||
    trigger.includes('hour')
  ) {
    return [
      'HOURLY_PLAY_TIME_ACCUMULATED',
      'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
    ];
  }

  if (trigger.includes('session')) {
    return session.includes('package') ||
      session.includes('packet') ||
      session.includes('subscription') ||
      session.includes('abonement')
      ? ['SESSION_STARTED', 'PACKAGE_OR_SUBSCRIPTION_USED']
      : ['SESSION_STARTED', 'HOURLY_SESSION_STARTED'];
  }

  if (
    trigger.includes('product') ||
    trigger.includes('goods') ||
    trigger.includes('purchase') ||
    trigger.includes('bar') ||
    trigger.includes('assortment')
  ) {
    return ['PRODUCT_PURCHASED'];
  }

  if (trigger.includes('check')) {
    return ['VISIT', 'SESSION_STARTED'];
  }

  if (trigger.includes('visit') || trigger.includes('app')) {
    return ['VISIT', 'SESSION_STARTED'];
  }

  return ['SESSION_STARTED', 'REWARD_TRACE'];
}

function resolveProductName(
  productNamesByClub: ProductNamesByClub,
  externalClubId: string | null,
  productId: string | null,
) {
  if (!externalClubId || !productId) {
    return null;
  }

  return productNamesByClub.get(externalClubId)?.get(productId) ?? null;
}

function sanitizePayload(value: unknown): Prisma.InputJsonValue {
  return sanitizeJson(value) as Prisma.InputJsonValue;
}

function sanitizeJson(value: unknown, key = ''): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJson(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(
        ([itemKey, item]) => [itemKey, sanitizeJson(item, itemKey)],
      ),
    );
  }

  if (typeof value === 'string' && /(phone|тел|mobile|contact)/i.test(key)) {
    return maskPossiblePhone(value);
  }

  if (typeof value === 'number' && /(phone|тел|mobile|contact)/i.test(key)) {
    return '[redacted]';
  }

  return value ?? null;
}

function maskPossiblePhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 7) {
    return '[redacted]';
  }

  return `***${digits.slice(-4)}`;
}

function extractText(row: Record<string, unknown>) {
  const preferredKeys = [
    'type',
    'comment',
    'name',
    'title',
    'description',
    'message',
    'text',
    'tariff',
    'tarif',
    'tariff_name',
    'tarif_name',
    'tariff_title',
    'tarif_title',
    'operation',
    'source',
  ];
  const parts = new Set<string>();

  for (const key of preferredKeys) {
    const value = nullableString(row[key]);
    if (value) {
      parts.add(value);
    }
  }

  for (const [key, value] of Object.entries(row)) {
    if (/(phone|тел|mobile|contact)/i.test(key)) {
      continue;
    }

    if (typeof value === 'string' && value.length <= 500) {
      parts.add(value);
    }
  }

  return Array.from(parts).join(' · ') || null;
}

function extractTariffName(text: string | null) {
  if (!text) {
    return null;
  }

  const match =
    /по\s+тарифу\s+(.+?)(?:\s+длительностью|[,.;]|$)/i.exec(text) ??
    /тариф\s+(.+?)(?:\s+длительностью|[,.;]|$)/i.exec(text);

  return match?.[1]?.trim() ?? null;
}

function extractDurationMinutes(text: string | null) {
  if (!text) {
    return null;
  }

  const match = /длительностью\s+(\d+)\s*мин/i.exec(text);
  return match ? Number(match[1]) : null;
}

function isPackageOrSubscriptionText(text: string) {
  return (
    /(абонемент|абонимент|пакет|subscription|package|membership)/.test(text) ||
    /по\s+тарифу\s+[^.]*\d+\s*час/.test(text) ||
    /\b\d+\s*час(?:ов|а)?\b/.test(text)
  );
}

function storesMatchOrUnknown(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  return !left || !right || left === right;
}

function isPackageUsageRawSignalNearSession(
  raw: {
    sourceKind: string;
    rawType: string | null;
    rawText: string | null;
    happenedAt: Date | null;
    storeId: string | null;
    amount: Prisma.Decimal | number | string | null;
    bonusAmount: Prisma.Decimal | number | string | null;
  },
  session: {
    happenedAt: Date | null;
    storeId: string | null;
  },
) {
  if (!raw.happenedAt || !session.happenedAt) {
    return false;
  }

  if (!storesMatchOrUnknown(raw.storeId, session.storeId)) {
    return false;
  }

  const deltaMs = Math.abs(
    raw.happenedAt.getTime() - session.happenedAt.getTime(),
  );

  if (deltaMs > INFERRED_PACKAGE_USAGE_SIGNAL_WINDOW_MS) {
    return false;
  }

  const rawType = normalizeSearchText(raw.rawType);
  const rawText = normalizeSearchText(raw.rawText);

  return (
    rawType === 'success_subscription_buy_log' ||
    rawType === 'widrawed_rubbles_and_bonuses' ||
    isPackageOrSubscriptionText(rawText) ||
    isNegativeAmount(raw.amount) ||
    isNegativeAmount(raw.bonusAmount)
  );
}

function isNegativeAmount(value: Prisma.Decimal | number | string | null) {
  if (value === null || value === undefined) {
    return false;
  }

  return Number(value) < 0;
}

function buildInferredPackageUsageEvidence(
  signal: {
    id: string;
    rawType: string | null;
    rawText: string | null;
    happenedAt: Date | null;
  },
  purchase:
    | {
        id: string;
        happenedAt: Date | null;
        sourceLocalDate: string | null;
        tariffName: string | null;
        tariffType: string | null;
        confidence: string;
        evidence: Prisma.JsonValue | null;
      }
    | undefined,
  nearbyRawSignal:
    | {
        id: string;
        sourceKind: string;
        rawType: string | null;
        rawText: string | null;
        happenedAt: Date | null;
        amount: Prisma.Decimal | number | string | null;
        bonusAmount: Prisma.Decimal | number | string | null;
      }
    | undefined,
): Prisma.InputJsonValue {
  return {
    sourceKind: SOURCE_GUEST_LOG,
    inference: 'recent_package_or_subscription_signal_near_session',
    confidenceNote:
      'Langame guest logs expose start/extend technical events separately from subscription purchase events, so usage is inferred for diagnostics only.',
    sessionSignal: {
      rawRecordId: signal.id,
      rawType: signal.rawType,
      rawText: signal.rawText,
      happenedAt: signal.happenedAt?.toISOString() ?? null,
    },
    matchedPurchase: purchase
      ? {
          factId: purchase.id,
          happenedAt: purchase.happenedAt?.toISOString() ?? null,
          sourceLocalDate: purchase.sourceLocalDate,
          tariffName: purchase.tariffName,
          tariffType: purchase.tariffType,
          confidence: purchase.confidence,
        }
      : null,
    nearbySignal: nearbyRawSignal
      ? {
          rawRecordId: nearbyRawSignal.id,
          sourceKind: nearbyRawSignal.sourceKind,
          rawType: nearbyRawSignal.rawType,
          rawText: nearbyRawSignal.rawText,
          happenedAt: nearbyRawSignal.happenedAt?.toISOString() ?? null,
          amount:
            nearbyRawSignal.amount === null
              ? null
              : String(nearbyRawSignal.amount),
          bonusAmount:
            nearbyRawSignal.bonusAmount === null
              ? null
              : String(nearbyRawSignal.bonusAmount),
        }
      : null,
    lookbackDays: INFERRED_PACKAGE_USAGE_LOOKBACK_DAYS,
    signalWindowMinutes: INFERRED_PACKAGE_USAGE_SIGNAL_WINDOW_MS / 1000 / 60,
  };
}

function normalizeSearchText(value: unknown) {
  return (primitiveString(value) ?? '').trim().toLowerCase().replace(/ё/g, 'е');
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const normalized = nullableString(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function nullableString(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = primitiveString(value)?.trim() ?? '';
  return normalized ? normalized : null;
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') {
      continue;
    }

    const normalized = primitiveString(value);
    if (!normalized) {
      continue;
    }

    const number = Number(normalized.replace(',', '.'));
    if (Number.isFinite(number)) {
      return number;
    }
  }

  return null;
}

function isTruthyLangameFlag(value: unknown) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value > 0;
  }

  const normalized = primitiveString(value)?.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (['1', 'true', 'yes', 'y', 'да'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'n', 'нет'].includes(normalized)) {
    return false;
  }

  const numeric = Number(normalized.replace(',', '.'));
  return Number.isFinite(numeric) ? numeric > 0 : false;
}

function playedDurationMinutes(startedAt: Date | null, stoppedAt: Date | null) {
  if (!startedAt || !stoppedAt) {
    return null;
  }

  const minutes = Math.round(
    (stoppedAt.getTime() - startedAt.getTime()) / 60000,
  );
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

function primitiveString(value: unknown) {
  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
    case 'boolean':
    case 'bigint':
      return String(value);
    default:
      return null;
  }
}

function buildSourceHash(payload: unknown) {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function sourceLocalDate(date: Date | null, timeZone: string) {
  if (!date) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function formatDateParam(date: Date) {
  return date.toISOString().slice(0, 10);
}

function subtractDays(date: Date, days: number) {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, Math.trunc(value)));
}
