import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationProvider, Prisma } from '@prisma/client';
import {
  createCipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { LangameClient } from './langame.client';
import { LangameSettingsService } from './langame-settings.service';
import type {
  LangameCashTransaction,
  LangameGuest,
  LangameGuestBalance,
  LangameGuestBonusBalance,
  LangameGuestLog,
  LangameGuestSession,
  LangameOperationLog,
  LangamePcTypeInClub,
  LangamePcTypeLink,
  LangameProductExpense,
  LangameTransaction,
  LangameWorkingShift,
} from './langame.types';

const DEFAULT_PAGE_LIMIT = 200;
const DEFAULT_PROFILE_DAYS = 90;
const MAX_PROFILE_DAYS = 90;
const MAX_OPERATION_LOG_PERIOD_DAYS = 31;
const STALE_RUNNING_SYNC_MS = 2 * 60 * 60 * 1000;
const STALE_RUNNING_SYNC_MESSAGE =
  'Синхронизация остановлена: не было завершения больше 2 часов. Запустите повторно.';

export type GuestDataFoundationSyncQuery = {
  dateFrom?: string;
  dateTo?: string;
  includeGuestLogs?: boolean;
  includeOperationLog?: boolean;
  includeCashTransactions?: boolean;
  includeWorkingShifts?: boolean;
};

export type GuestDataFoundationSyncResult = {
  tenantId: string;
  sources: number;
  failedSources: number;
  sourceResults: GuestDataFoundationSourceResult[];
};

export type GuestDataFoundationStartResult = {
  status: 'STARTED';
  tenantId: string;
  sources: number;
  dateFrom: string;
  dateTo: string;
};

export type GuestDataFoundationStatusResult = {
  status: 'IDLE' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  running: boolean;
  nextRun: {
    dateFrom: string;
    dateTo: string;
    basedOnFinishedAt: string | null;
  };
  latestRun: {
    domain: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    dateFrom: string | null;
    dateTo: string | null;
    guestsCount: number;
    sessionsCount: number;
    transactionsCount: number;
    productSalesLinked: number;
    errorMessage: string | null;
    diagnostics: {
      endpointErrors: Record<string, string>;
      pcTypesInClubs: FieldDiagnostics;
      pcTypeLinks: FieldDiagnostics;
    };
  } | null;
};

export type GuestDataFoundationSourceResult = {
  domain: string;
  status: 'SUCCESS' | 'FAILED';
  profileRunId: string;
  guests: number;
  groups: number;
  balances: number;
  bonusBalances: number;
  sessions: number;
  transactions: number;
  guestLogs: number;
  operationLogs: number;
  cashTransactions: number;
  workingShifts: number;
  productSalesLinked: number;
  endpointErrors: Record<string, string>;
  errorMessage: string | null;
};

type GuestRef = {
  id: string;
};

type StoreRef = {
  id: string;
};

type ResolvedPeriod = {
  fromDate: Date;
  toDate: Date;
  from: string;
  to: string;
  basedOnFinishedAt: Date | null;
};

type FieldDiagnostics = {
  total: number;
  fieldCounts: Record<string, number>;
  candidateFields: Record<string, number>;
};

type StaffOperatorHint = {
  count: number;
  fields: Record<string, string[]>;
};

type StaffOperatorHints = Record<string, StaffOperatorHint>;

type SourceProfile = {
  period: {
    from: string;
    to: string;
  };
  guests: {
    total: number;
    withPhone: number;
    withEmail: number;
    withFullName: number;
    withBirthday: number;
    withIdentityDocument: number;
    duplicatePhoneHashes: number;
    duplicateEmailHashes: number;
  };
  sessions: {
    total: number;
    withoutGuestId: number;
    invalidDates: number;
  };
  transactions: {
    total: number;
    withoutGuestId: number;
    invalidDates: number;
    typeCounts: Record<string, number>;
  };
  guestLogs: {
    total: number;
    withoutGuestId: number;
    invalidDates: number;
    typeCounts: Record<string, number>;
  };
  operationLogs: {
    total: number;
    invalidDates: number;
    typeCounts: Record<string, number>;
  } & FieldDiagnostics;
  cashTransactions: FieldDiagnostics;
  workingShifts: FieldDiagnostics;
  pcTypesInClubs: FieldDiagnostics;
  pcTypeLinks: FieldDiagnostics;
  operatorHints: {
    operationLogs: StaffOperatorHints;
    cashTransactions: StaffOperatorHints;
    workingShifts: StaffOperatorHints;
  };
  productSales: {
    total: number;
    withGuestId: number;
    linked: number;
    missingSalesFact: number;
  };
  balances: {
    total: number;
    sumBalance: string;
  };
  bonusBalances: {
    total: number;
    sumBonusBalance: string;
  };
  endpointErrors: Record<string, string>;
};

@Injectable()
export class GuestDataFoundationService {
  private readonly logger = new Logger(GuestDataFoundationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
    private readonly langameClient: LangameClient,
    private readonly langameSettingsService: LangameSettingsService,
    private readonly configService: ConfigService,
  ) {}

  async syncTenant(
    user: AuthenticatedUser,
    query: GuestDataFoundationSyncQuery,
  ): Promise<GuestDataFoundationSyncResult> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const { apiKey, sources } =
      await this.langameSettingsService.resolveTenantAccess(tenantId);
    const period = await this.resolvePeriod(tenantId, query);
    const result: GuestDataFoundationSyncResult = {
      tenantId,
      sources: sources.length,
      failedSources: 0,
      sourceResults: [],
    };

    for (const source of sources) {
      const run = await this.prisma.guestDataProfileRun.create({
        data: {
          tenantId,
          integrationSourceId: source.id,
          provider: IntegrationProvider.LANGAME,
          domain: source.domain,
          status: 'RUNNING',
          dateFrom: period.fromDate,
          dateTo: period.toDate,
        },
      });

      const sourceResult: GuestDataFoundationSourceResult = {
        domain: source.domain,
        status: 'FAILED',
        profileRunId: run.id,
        guests: 0,
        groups: 0,
        balances: 0,
        bonusBalances: 0,
        sessions: 0,
        transactions: 0,
        guestLogs: 0,
        operationLogs: 0,
        cashTransactions: 0,
        workingShifts: 0,
        productSalesLinked: 0,
        endpointErrors: {},
        errorMessage: null,
      };

      try {
        const syncResult = await this.syncSource({
          tenantId,
          baseUrl: source.baseUrl,
          domain: source.domain,
          apiKey,
          period,
          query,
        });

        Object.assign(sourceResult, syncResult, { status: 'SUCCESS' });

        await this.prisma.guestDataProfileRun.update({
          where: { id: run.id },
          data: {
            status: 'SUCCESS',
            finishedAt: new Date(),
            guestsCount: syncResult.guests,
            sessionsCount: syncResult.sessions,
            transactionsCount: syncResult.transactions,
            productSalesLinked: syncResult.productSalesLinked,
            profile: syncResult.profile,
          },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Guest sync failed';
        result.failedSources += 1;
        sourceResult.errorMessage = message;

        await this.prisma.guestDataProfileRun.update({
          where: { id: run.id },
          data: {
            status: 'FAILED',
            finishedAt: new Date(),
            errorMessage: message,
          },
        });
      }

      result.sourceResults.push(sourceResult);
    }

    return result;
  }

  async startTenantSync(
    user: AuthenticatedUser,
    query: GuestDataFoundationSyncQuery,
  ): Promise<GuestDataFoundationStartResult> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    await this.failStaleRunningRuns(tenantId);
    const { sources } =
      await this.langameSettingsService.resolveTenantAccess(tenantId);
    const period = await this.resolvePeriod(tenantId, query);
    const syncQuery: GuestDataFoundationSyncQuery = {
      ...query,
      dateFrom: period.from,
      dateTo: period.to,
    };

    setImmediate(() => {
      void this.syncTenant(user, syncQuery).catch((error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : 'Guest background sync failed';
        this.logger.error(message);
      });
    });

    return {
      status: 'STARTED',
      tenantId,
      sources: sources.length,
      dateFrom: period.from,
      dateTo: period.to,
    };
  }

  async getTenantSyncStatus(
    user: AuthenticatedUser,
  ): Promise<GuestDataFoundationStatusResult> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    await this.failStaleRunningRuns(tenantId);
    const nextPeriod = await this.resolvePeriod(tenantId, {});
    const [runningRun, latestRun] = await Promise.all([
      this.prisma.guestDataProfileRun.findFirst({
        where: {
          tenantId,
          provider: IntegrationProvider.LANGAME,
          status: 'RUNNING',
        },
        orderBy: { startedAt: 'desc' },
        select: this.profileRunStatusSelect(),
      }),
      this.prisma.guestDataProfileRun.findFirst({
        where: {
          tenantId,
          provider: IntegrationProvider.LANGAME,
        },
        orderBy: { startedAt: 'desc' },
        select: this.profileRunStatusSelect(),
      }),
    ]);
    const run = runningRun ?? latestRun;

    if (!run) {
      return {
        status: 'IDLE',
        running: false,
        nextRun: {
          dateFrom: nextPeriod.from,
          dateTo: nextPeriod.to,
          basedOnFinishedAt:
            nextPeriod.basedOnFinishedAt?.toISOString() ?? null,
        },
        latestRun: null,
      };
    }

    return {
      status: runningRun
        ? 'RUNNING'
        : run.status === 'SUCCESS'
          ? 'SUCCESS'
          : run.status === 'FAILED'
            ? 'FAILED'
            : 'IDLE',
      running: Boolean(runningRun),
      nextRun: {
        dateFrom: nextPeriod.from,
        dateTo: nextPeriod.to,
        basedOnFinishedAt: nextPeriod.basedOnFinishedAt?.toISOString() ?? null,
      },
      latestRun: {
        domain: run.domain,
        status: run.status,
        startedAt: run.startedAt.toISOString(),
        finishedAt: run.finishedAt?.toISOString() ?? null,
        dateFrom: run.dateFrom ? this.toDateInputValue(run.dateFrom) : null,
        dateTo: run.dateTo ? this.toDateInputValue(run.dateTo) : null,
        guestsCount: run.guestsCount,
        sessionsCount: run.sessionsCount,
        transactionsCount: run.transactionsCount,
        productSalesLinked: run.productSalesLinked,
        errorMessage: run.errorMessage,
        diagnostics: this.statusDiagnosticsFromProfile(run.profile),
      },
    };
  }

  async syncComputerCountsForTenant(tenantId: string) {
    const { apiKey, sources } =
      await this.langameSettingsService.resolveTenantAccess(tenantId);
    const syncedAt = new Date();
    let updatedStores = 0;

    for (const source of sources) {
      try {
        const [pcTypesInClubs, pcTypeLinks] = await Promise.all([
          this.langameClient.listPcTypesInClubs(source.baseUrl, apiKey),
          this.langameClient.listPcTypeLinks(source.baseUrl, apiKey),
        ]);

        updatedStores += await this.syncStoreComputerCounts(
          tenantId,
          source.domain,
          pcTypesInClubs,
          pcTypeLinks,
          syncedAt,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Computer count sync failed';
        this.logger.warn(
          `Computer count sync failed for ${source.domain}: ${message}`,
        );
      }
    }

    return updatedStores;
  }

  private profileRunStatusSelect() {
    return {
      domain: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      dateFrom: true,
      dateTo: true,
      guestsCount: true,
      sessionsCount: true,
      transactionsCount: true,
      productSalesLinked: true,
      errorMessage: true,
      profile: true,
    } satisfies Prisma.GuestDataProfileRunSelect;
  }

  private async failStaleRunningRuns(tenantId: string) {
    const staleStartedBefore = new Date(Date.now() - STALE_RUNNING_SYNC_MS);

    await this.prisma.guestDataProfileRun.updateMany({
      where: {
        tenantId,
        provider: IntegrationProvider.LANGAME,
        status: 'RUNNING',
        startedAt: { lt: staleStartedBefore },
      },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        errorMessage: STALE_RUNNING_SYNC_MESSAGE,
      },
    });
  }

  private statusDiagnosticsFromProfile(profile: Prisma.JsonValue | null) {
    const profileRecord = this.jsonRecord(profile);

    return {
      endpointErrors: this.stringRecord(profileRecord.endpointErrors),
      pcTypesInClubs: this.fieldDiagnosticsFromProfile(
        profileRecord.pcTypesInClubs,
      ),
      pcTypeLinks: this.fieldDiagnosticsFromProfile(profileRecord.pcTypeLinks),
    };
  }

  private fieldDiagnosticsFromProfile(value: unknown): FieldDiagnostics {
    const record = this.jsonRecord(value);

    return {
      total: this.numberFromProfile(record.total),
      fieldCounts: this.numberRecord(record.fieldCounts),
      candidateFields: this.numberRecord(record.candidateFields),
    };
  }

  private jsonRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private stringRecord(value: unknown) {
    const record = this.jsonRecord(value);

    return Object.fromEntries(
      Object.entries(record).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  }

  private numberRecord(value: unknown) {
    const record = this.jsonRecord(value);

    return Object.fromEntries(
      Object.entries(record)
        .map(([key, item]) => [key, this.numberFromProfile(item)] as const)
        .filter(([, item]) => item > 0),
    );
  }

  private numberFromProfile(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private async syncSource(params: {
    tenantId: string;
    baseUrl: string;
    domain: string;
    apiKey: string;
    period: ResolvedPeriod;
    query: GuestDataFoundationSyncQuery;
  }) {
    const { tenantId, baseUrl, domain, apiKey, period, query } = params;
    const profile = this.createEmptyProfile(period);
    const now = new Date();
    const snapshotDate = this.startOfUtcDay(now);
    const storesByExternalClubId = await this.loadStoreLookup(tenantId, domain);
    const langamePeriod = this.toLangameDatePeriod(period);

    const pcTypesInClubs = await this.captureEndpoint(
      profile,
      'global/types_of_pc_in_clubs/list',
      () => this.langameClient.listPcTypesInClubs(baseUrl, apiKey),
    );
    const pcTypeLinks = await this.captureEndpoint(
      profile,
      'global/linking_pc_by_type/list',
      () => this.langameClient.listPcTypeLinks(baseUrl, apiKey),
    );
    this.profileRows(profile.pcTypesInClubs, pcTypesInClubs);
    this.profileRows(profile.pcTypeLinks, pcTypeLinks);
    await this.syncStoreComputerCounts(
      tenantId,
      domain,
      pcTypesInClubs,
      pcTypeLinks,
      now,
    );

    const groups = await this.captureEndpoint(profile, 'guests/groups', () =>
      this.langameClient.listGuestGroups(baseUrl, apiKey),
    );
    for (const group of groups) {
      await this.prisma.guestGroup.upsert({
        where: {
          tenantId_externalProvider_externalDomain_externalGroupId: {
            tenantId,
            externalProvider: IntegrationProvider.LANGAME,
            externalDomain: domain,
            externalGroupId: String(group.id),
          },
        },
        create: {
          tenantId,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: domain,
          externalGroupId: String(group.id),
          name: group.name,
          percent: this.toDecimalOrNull(group.percent),
          countHoursFrom: this.toDecimalOrNull(group.count_hours_from),
          countHoursTo: this.toDecimalOrNull(group.count_hours_to),
          bonusBirthday: this.toDecimalOrNull(group.bonus_birthday),
          sourcePayloadHash: this.payloadHash(group),
          lastSyncedAt: now,
        },
        update: {
          name: group.name,
          percent: this.toDecimalOrNull(group.percent),
          countHoursFrom: this.toDecimalOrNull(group.count_hours_from),
          countHoursTo: this.toDecimalOrNull(group.count_hours_to),
          bonusBirthday: this.toDecimalOrNull(group.bonus_birthday),
          sourcePayloadHash: this.payloadHash(group),
          lastSyncedAt: now,
        },
      });
    }

    const guests = await this.captureEndpoint(profile, 'guests/list', () =>
      this.langameClient.listGuests(baseUrl, apiKey),
    );
    await this.syncGuests(tenantId, domain, guests, profile, now);
    const guestsByExternalId = await this.loadGuestLookup(tenantId, domain);

    const balances = await this.captureEndpoint(profile, 'guests/balance', () =>
      this.langameClient.listGuestBalances(baseUrl, apiKey),
    );
    await this.syncBalances(
      tenantId,
      domain,
      balances,
      guestsByExternalId,
      snapshotDate,
      profile,
    );

    const bonusBalances = await this.captureEndpoint(
      profile,
      'guests/bonus_balance',
      () => this.langameClient.listGuestBonusBalances(baseUrl, apiKey),
    );
    await this.syncBonusBalances(
      tenantId,
      domain,
      bonusBalances,
      guestsByExternalId,
      snapshotDate,
      profile,
    );

    const sessions = await this.captureEndpoint(
      profile,
      'guests/sessions',
      () =>
        this.paginate((page) =>
          this.langameClient.listGuestSessions(baseUrl, apiKey, {
            page,
            pageLimit: DEFAULT_PAGE_LIMIT,
            dateFrom: langamePeriod.from,
            dateTo: langamePeriod.to,
          }),
        ),
    );
    await this.syncSessions(
      tenantId,
      domain,
      sessions,
      guestsByExternalId,
      storesByExternalClubId,
      profile,
    );

    const transactions = await this.captureEndpoint(
      profile,
      'transactions/list',
      () =>
        this.paginate((page) =>
          this.langameClient.listTransactions(baseUrl, apiKey, {
            page,
            pageLimit: DEFAULT_PAGE_LIMIT,
            dateFrom: langamePeriod.from,
            dateTo: langamePeriod.to,
          }),
        ),
    );
    await this.syncTransactions(
      tenantId,
      domain,
      transactions,
      guestsByExternalId,
      storesByExternalClubId,
      profile,
    );

    let guestLogs: LangameGuestLog[] = [];
    if (query.includeGuestLogs ?? true) {
      guestLogs = await this.captureEndpoint(profile, 'guests/logs', () =>
        this.paginate((page) =>
          this.langameClient.listGuestLogs(baseUrl, apiKey, {
            page,
            pageLimit: DEFAULT_PAGE_LIMIT,
            dateFrom: langamePeriod.from,
            dateTo: langamePeriod.to,
          }),
        ),
      );
      await this.syncGuestLogs(
        tenantId,
        domain,
        guestLogs,
        guestsByExternalId,
        profile,
      );
    }

    let operationLogs: LangameOperationLog[] = [];
    if (query.includeOperationLog ?? true) {
      operationLogs = await this.captureEndpoint(
        profile,
        'all_operations_log/list',
        () =>
          this.syncOperationLogs(
            tenantId,
            baseUrl,
            domain,
            apiKey,
            period,
            storesByExternalClubId,
            profile,
          ),
      );
    }

    let cashTransactions: LangameCashTransaction[] = [];
    if (query.includeCashTransactions ?? true) {
      cashTransactions = await this.captureEndpoint(
        profile,
        'log_cash_transaction/list',
        async () => {
          const rows: LangameCashTransaction[] = [];

          for (const externalClubId of storesByExternalClubId.keys()) {
            rows.push(
              ...(await this.langameClient.listCashTransactions(
                baseUrl,
                apiKey,
                {
                  clubId: externalClubId,
                  dateFrom: langamePeriod.from,
                  dateTo: langamePeriod.to,
                },
              )),
            );
          }

          return rows;
        },
      );
      this.profileRows(profile.cashTransactions, cashTransactions);
      cashTransactions.forEach((row) =>
        this.profileOperatorHints(profile.operatorHints.cashTransactions, row),
      );
    }

    let workingShifts: LangameWorkingShift[] = [];
    if (query.includeWorkingShifts ?? true) {
      workingShifts = await this.captureEndpoint(
        profile,
        'working_shifts/list',
        () =>
          this.paginate((page) =>
            this.langameClient.listWorkingShifts(baseUrl, apiKey, {
              page,
              pageLimit: DEFAULT_PAGE_LIMIT,
              dateFrom: langamePeriod.from,
              dateTo: langamePeriod.to,
            }),
          ),
      );
      this.profileRows(profile.workingShifts, workingShifts);
      workingShifts.forEach((row) =>
        this.profileOperatorHints(profile.operatorHints.workingShifts, row),
      );
      await this.syncWorkingShifts(
        tenantId,
        domain,
        workingShifts,
        guestsByExternalId,
        storesByExternalClubId,
      );
    }

    const productExpenses = await this.captureEndpoint(
      profile,
      'products/expense',
      () =>
        this.paginate((page) =>
          this.langameClient.listProductExpenses(baseUrl, apiKey, {
            page,
            pageLimit: DEFAULT_PAGE_LIMIT,
            dateFrom: period.from,
            dateTo: period.to,
          }),
        ),
    );
    const productSalesLinked = await this.linkProductSalesToGuests(
      tenantId,
      domain,
      productExpenses,
      guestsByExternalId,
      profile,
    );

    return {
      groups: groups.length,
      guests: guests.length,
      balances: balances.length,
      bonusBalances: bonusBalances.length,
      sessions: sessions.length,
      transactions: transactions.length,
      guestLogs: guestLogs.length,
      operationLogs: operationLogs.length,
      cashTransactions: cashTransactions.length,
      workingShifts: workingShifts.length,
      productSalesLinked,
      endpointErrors: profile.endpointErrors,
      profile,
    };
  }

  private async captureEndpoint<T>(
    profile: SourceProfile,
    endpoint: string,
    load: () => Promise<T[]>,
  ) {
    try {
      return await load();
    } catch (error) {
      profile.endpointErrors[endpoint] =
        error instanceof Error ? error.message : 'Endpoint failed';
      return [];
    }
  }

  private async syncStoreComputerCounts(
    tenantId: string,
    domain: string,
    pcTypesInClubs: LangamePcTypeInClub[],
    pcTypeLinks: LangamePcTypeLink[],
    syncedAt: Date,
  ) {
    const typeToClub = new Map<string, string>();
    const countByClub = new Map<string, number>();

    for (const row of pcTypesInClubs) {
      const typeId = this.firstStringField(row, [
        'id',
        'type_id',
        'pc_type_id',
        'type_pc_id',
        'types_of_pc_in_clubs_id',
        'type_pc_in_club_id',
        'types_pc_id',
        'list_type_pc_id',
        'list_pc_type_id',
        'list_types_of_pc_in_clubs_id',
      ]);
      const clubId = this.firstStringField(row, [
        'club_id',
        'clubId',
        'list_clubs_id',
        'list_club_id',
        'external_club_id',
        'id_club',
        'clubs_id',
      ]);

      if (typeId && clubId) {
        typeToClub.set(typeId, clubId);
      }

      const directCount = this.firstNumberField(row, [
        'count',
        'pc_count',
        'pcs_count',
        'computers_count',
        'computer_count',
        'count_pc',
        'count_pcs',
        'pcCount',
        'computerCount',
        'qty',
        'quantity',
      ]);
      if (clubId && directCount !== null) {
        countByClub.set(clubId, (countByClub.get(clubId) ?? 0) + directCount);
      }
    }

    if (pcTypeLinks.length > 0) {
      const linkedCountByClub = new Map<string, number>();
      const seenPcByClub = new Map<string, Set<string>>();

      for (const row of pcTypeLinks) {
        const typeId = this.firstStringField(row, [
          'type_id',
          'pc_type_id',
          'type_pc_id',
          'types_of_pc_in_clubs_id',
          'pc_type_in_club_id',
          'type_pc_in_club_id',
          'types_pc_id',
          'list_type_pc_id',
          'list_pc_type_id',
          'list_types_of_pc_in_clubs_id',
        ]);
        const directClubId = this.firstStringField(row, [
          'club_id',
          'clubId',
          'list_clubs_id',
          'list_club_id',
          'external_club_id',
          'id_club',
          'clubs_id',
        ]);
        const clubId = directClubId ?? (typeId ? typeToClub.get(typeId) : null);

        if (!clubId) {
          continue;
        }

        const pcId =
          this.firstStringField(row, [
            'pc_id',
            'pcId',
            'id',
            'list_pc_id',
            'list_pcs_id',
            'computer_id',
            'computerId',
            'global_pc_id',
            'host_id',
            'hostname',
            'uuid',
            'UUID',
            'name',
            'pc_name',
            'computer_name',
          ]) ?? this.payloadHash(row);
        const seen = seenPcByClub.get(clubId) ?? new Set<string>();
        seen.add(pcId);
        seenPcByClub.set(clubId, seen);
      }

      for (const [clubId, seen] of seenPcByClub.entries()) {
        linkedCountByClub.set(clubId, seen.size);
      }

      if (linkedCountByClub.size > 0) {
        countByClub.clear();
        for (const [clubId, count] of linkedCountByClub.entries()) {
          countByClub.set(clubId, count);
        }
      }
    }

    const updates = await Promise.all(
      Array.from(countByClub.entries()).map(([externalClubId, count]) =>
        this.prisma.store.updateMany({
          where: {
            tenantId,
            externalProvider: IntegrationProvider.LANGAME,
            externalDomain: domain,
            externalClubId,
          },
          data: {
            computerCount: count,
            computerCountSyncedAt: syncedAt,
          },
        }),
      ),
    );

    return updates.reduce((sum, update) => sum + update.count, 0);
  }

  private async syncGuests(
    tenantId: string,
    domain: string,
    rows: LangameGuest[],
    profile: SourceProfile,
    syncedAt: Date,
  ) {
    const seenPhoneHashes = new Set<string>();
    const duplicatePhoneHashes = new Set<string>();
    const seenEmailHashes = new Set<string>();
    const duplicateEmailHashes = new Set<string>();

    for (const row of rows) {
      const externalGuestId = this.toNullableString(row.guest_id);
      if (!externalGuestId) {
        continue;
      }

      const phone = this.sensitiveValue(row.phone, 'phone');
      const email = this.sensitiveValue(row.email, 'email');
      const fullName = this.sensitiveValue(row.fio, 'name');
      const birthday = this.birthdayParts(row.birthday);

      profile.guests.total += 1;
      profile.guests.withPhone += phone.hash ? 1 : 0;
      profile.guests.withEmail += email.hash ? 1 : 0;
      profile.guests.withFullName += fullName.hash ? 1 : 0;
      profile.guests.withBirthday += birthday ? 1 : 0;
      profile.guests.withIdentityDocument +=
        row.identity_document || row.identity_document_data ? 1 : 0;

      this.trackDuplicateHash(
        phone.hash,
        seenPhoneHashes,
        duplicatePhoneHashes,
      );
      this.trackDuplicateHash(
        email.hash,
        seenEmailHashes,
        duplicateEmailHashes,
      );

      await this.prisma.guest.upsert({
        where: {
          tenantId_externalProvider_externalDomain_externalGuestId: {
            tenantId,
            externalProvider: IntegrationProvider.LANGAME,
            externalDomain: domain,
            externalGuestId,
          },
        },
        create: {
          tenantId,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: domain,
          externalGuestId,
          externalGuestTypeId: this.toNullableString(row.guest_type_id),
          phoneHash: phone.hash,
          phoneMasked: phone.masked,
          phoneEncrypted: phone.encrypted,
          emailHash: email.hash,
          emailMasked: email.masked,
          fullNameHash: fullName.hash,
          fullNameMasked: fullName.masked,
          fullNameEncrypted: fullName.encrypted,
          birthYear: birthday?.year,
          birthMonth: birthday?.month,
          birthDay: birthday?.day,
          gender: this.toNullableString(row.gender),
          insertedAt: this.parseLangameDate(row.date_insert),
          lastActivityAt: this.parseLangameDate(row.date_last_activity),
          isVirtual: this.toBoolean(row.virtual),
          isTemporary: this.toBoolean(row.temp_guest),
          isDisabled: this.toBoolean(row.disabled),
          isSimpleRegistration: this.toBoolean(row.simple_reg),
          isConfirmed: this.toBoolean(row.confirm),
          currentCountHours: this.toDecimalOrNull(row.current_count_hours),
          isMobileRegistration: this.toBoolean(row.mobile_reg),
          identityDocumentPresent: Boolean(
            row.identity_document || row.identity_document_data,
          ),
          bonusProgramNumber: this.toNullableString(row.bonus_program_number),
          sourcePayloadHash: this.safeGuestPayloadHash(row),
          lastSyncedAt: syncedAt,
        },
        update: {
          externalGuestTypeId: this.toNullableString(row.guest_type_id),
          phoneHash: phone.hash,
          phoneMasked: phone.masked,
          phoneEncrypted: phone.encrypted,
          emailHash: email.hash,
          emailMasked: email.masked,
          fullNameHash: fullName.hash,
          fullNameMasked: fullName.masked,
          fullNameEncrypted: fullName.encrypted,
          birthYear: birthday?.year,
          birthMonth: birthday?.month,
          birthDay: birthday?.day,
          gender: this.toNullableString(row.gender),
          insertedAt: this.parseLangameDate(row.date_insert),
          lastActivityAt: this.parseLangameDate(row.date_last_activity),
          isVirtual: this.toBoolean(row.virtual),
          isTemporary: this.toBoolean(row.temp_guest),
          isDisabled: this.toBoolean(row.disabled),
          isSimpleRegistration: this.toBoolean(row.simple_reg),
          isConfirmed: this.toBoolean(row.confirm),
          currentCountHours: this.toDecimalOrNull(row.current_count_hours),
          isMobileRegistration: this.toBoolean(row.mobile_reg),
          identityDocumentPresent: Boolean(
            row.identity_document || row.identity_document_data,
          ),
          bonusProgramNumber: this.toNullableString(row.bonus_program_number),
          sourcePayloadHash: this.safeGuestPayloadHash(row),
          lastSyncedAt: syncedAt,
        },
      });
    }

    profile.guests.duplicatePhoneHashes = duplicatePhoneHashes.size;
    profile.guests.duplicateEmailHashes = duplicateEmailHashes.size;
  }

  private async syncBalances(
    tenantId: string,
    domain: string,
    rows: LangameGuestBalance[],
    guestsByExternalId: Map<string, GuestRef>,
    snapshotDate: Date,
    profile: SourceProfile,
  ) {
    let total = new Prisma.Decimal(0);

    for (const row of rows) {
      const externalGuestId = this.toNullableString(row.guest_id);
      if (!externalGuestId) {
        continue;
      }
      const balance =
        this.toDecimalOrNull(row.balance) ?? new Prisma.Decimal(0);
      total = total.add(balance);

      await this.prisma.guestBalanceSnapshot.upsert({
        where: {
          tenantId_externalProvider_externalDomain_externalGuestId_snapshotDate:
            {
              tenantId,
              externalProvider: IntegrationProvider.LANGAME,
              externalDomain: domain,
              externalGuestId,
              snapshotDate,
            },
        },
        create: {
          tenantId,
          guestId: guestsByExternalId.get(externalGuestId)?.id ?? null,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: domain,
          externalGuestId,
          snapshotDate,
          balance,
          sourcePayloadHash: this.payloadHash(row),
        },
        update: {
          guestId: guestsByExternalId.get(externalGuestId)?.id ?? null,
          balance,
          sourcePayloadHash: this.payloadHash(row),
        },
      });
    }

    profile.balances.total = rows.length;
    profile.balances.sumBalance = total.toFixed(2);
  }

  private async syncBonusBalances(
    tenantId: string,
    domain: string,
    rows: LangameGuestBonusBalance[],
    guestsByExternalId: Map<string, GuestRef>,
    snapshotDate: Date,
    profile: SourceProfile,
  ) {
    let total = new Prisma.Decimal(0);

    for (const row of rows) {
      const externalGuestId = this.toNullableString(row.guest_id);
      if (!externalGuestId) {
        continue;
      }
      const bonusBalance =
        this.toDecimalOrNull(row.bonus_balance) ?? new Prisma.Decimal(0);
      total = total.add(bonusBalance);

      await this.prisma.guestBonusBalanceSnapshot.upsert({
        where: {
          tenantId_externalProvider_externalDomain_externalGuestId_snapshotDate:
            {
              tenantId,
              externalProvider: IntegrationProvider.LANGAME,
              externalDomain: domain,
              externalGuestId,
              snapshotDate,
            },
        },
        create: {
          tenantId,
          guestId: guestsByExternalId.get(externalGuestId)?.id ?? null,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: domain,
          externalGuestId,
          snapshotDate,
          bonusBalance,
          sourcePayloadHash: this.payloadHash(row),
        },
        update: {
          guestId: guestsByExternalId.get(externalGuestId)?.id ?? null,
          bonusBalance,
          sourcePayloadHash: this.payloadHash(row),
        },
      });
    }

    profile.bonusBalances.total = rows.length;
    profile.bonusBalances.sumBonusBalance = total.toFixed(2);
  }

  private async syncSessions(
    tenantId: string,
    domain: string,
    rows: LangameGuestSession[],
    guestsByExternalId: Map<string, GuestRef>,
    storesByExternalClubId: Map<string, StoreRef>,
    profile: SourceProfile,
  ) {
    for (const row of rows) {
      const externalSessionId = this.toNullableString(row.id);
      if (!externalSessionId) {
        continue;
      }
      const externalGuestId = this.toNullableString(row.guest_id);
      const externalClubId = this.toNullableString(
        row.club_id ?? row.list_clubs_id,
      );
      const startedAt = this.parseLangameDate(
        this.toNullableString(row.date_start),
      );
      const stoppedAt = this.parseLangameDate(
        this.toNullableString(row.date_stop),
      );

      profile.sessions.total += 1;
      profile.sessions.withoutGuestId += externalGuestId ? 0 : 1;
      profile.sessions.invalidDates +=
        (row.date_start && !startedAt) || (row.date_stop && !stoppedAt) ? 1 : 0;

      await this.prisma.guestSession.upsert({
        where: {
          tenantId_externalProvider_externalDomain_externalSessionId: {
            tenantId,
            externalProvider: IntegrationProvider.LANGAME,
            externalDomain: domain,
            externalSessionId,
          },
        },
        create: {
          tenantId,
          guestId: externalGuestId
            ? (guestsByExternalId.get(externalGuestId)?.id ?? null)
            : null,
          storeId: externalClubId
            ? (storesByExternalClubId.get(externalClubId)?.id ?? null)
            : null,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: domain,
          externalSessionId,
          externalGuestId,
          externalClubId,
          externalUuid: this.toNullableString(row.UUID),
          startedAt,
          stoppedAt,
          durationMinutes: this.durationMinutes(startedAt, stoppedAt),
          normalStop: this.toOptionalBoolean(row.normal_stop),
          expand: this.toOptionalBoolean(row.expand),
          createByRezerv: this.toOptionalBoolean(row.create_by_rezerv),
          packet: this.toOptionalBoolean(row.packet),
          sourcePayloadHash: this.payloadHash(row),
        },
        update: {
          guestId: externalGuestId
            ? (guestsByExternalId.get(externalGuestId)?.id ?? null)
            : null,
          storeId: externalClubId
            ? (storesByExternalClubId.get(externalClubId)?.id ?? null)
            : null,
          externalGuestId,
          externalClubId,
          externalUuid: this.toNullableString(row.UUID),
          startedAt,
          stoppedAt,
          durationMinutes: this.durationMinutes(startedAt, stoppedAt),
          normalStop: this.toOptionalBoolean(row.normal_stop),
          expand: this.toOptionalBoolean(row.expand),
          createByRezerv: this.toOptionalBoolean(row.create_by_rezerv),
          packet: this.toOptionalBoolean(row.packet),
          sourcePayloadHash: this.payloadHash(row),
        },
      });
    }
  }

  private async syncTransactions(
    tenantId: string,
    domain: string,
    rows: LangameTransaction[],
    guestsByExternalId: Map<string, GuestRef>,
    storesByExternalClubId: Map<string, StoreRef>,
    profile: SourceProfile,
  ) {
    for (const row of rows) {
      const externalTransactionId = this.toNullableString(row.id);
      if (!externalTransactionId) {
        continue;
      }
      const externalGuestId = this.toNullableString(
        row.real_guest_id ?? row.guest_id,
      );
      const externalClubId = this.toNullableString(
        row.club_id ?? row.list_clubs_id,
      );
      const type = this.toNullableString(row.type);
      const happenedAt = this.parseLangameDate(
        row.date ??
          row.date_normal ??
          row.date_insert ??
          row.created_at ??
          row.created ??
          row.time ??
          row.datetime,
      );
      const updatedAtExternal = this.parseLangameDate(row.date_update);
      const amount = this.toBoolean(row.cancel)
        ? null
        : this.toDecimalOrNull(row.amount ?? row.sum ?? row.balance);
      const hasTransactionDate = Boolean(
        row.date ??
        row.date_normal ??
        row.date_insert ??
        row.created_at ??
        row.created ??
        row.time ??
        row.datetime ??
        row.date_update,
      );

      profile.transactions.total += 1;
      profile.transactions.withoutGuestId += externalGuestId ? 0 : 1;
      profile.transactions.invalidDates +=
        hasTransactionDate && !happenedAt && !updatedAtExternal ? 1 : 0;
      this.increment(profile.transactions.typeCounts, type ?? 'unknown');

      await this.prisma.guestTransaction.upsert({
        where: {
          tenantId_externalProvider_externalDomain_externalTransactionId: {
            tenantId,
            externalProvider: IntegrationProvider.LANGAME,
            externalDomain: domain,
            externalTransactionId,
          },
        },
        create: {
          tenantId,
          guestId: externalGuestId
            ? (guestsByExternalId.get(externalGuestId)?.id ?? null)
            : null,
          storeId: externalClubId
            ? (storesByExternalClubId.get(externalClubId)?.id ?? null)
            : null,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: domain,
          externalTransactionId,
          externalGuestId,
          externalClubId,
          type,
          happenedAt,
          updatedAtExternal,
          amount,
          balance: this.toDecimalOrNull(row.balance),
          bonusBalance: this.toDecimalOrNull(row.bonus_balance),
          sourcePayloadHash: this.payloadHash(row),
        },
        update: {
          guestId: externalGuestId
            ? (guestsByExternalId.get(externalGuestId)?.id ?? null)
            : null,
          storeId: externalClubId
            ? (storesByExternalClubId.get(externalClubId)?.id ?? null)
            : null,
          externalGuestId,
          externalClubId,
          type,
          happenedAt,
          updatedAtExternal,
          amount,
          balance: this.toDecimalOrNull(row.balance),
          bonusBalance: this.toDecimalOrNull(row.bonus_balance),
          sourcePayloadHash: this.payloadHash(row),
        },
      });
    }
  }

  private async syncGuestLogs(
    tenantId: string,
    domain: string,
    rows: LangameGuestLog[],
    guestsByExternalId: Map<string, GuestRef>,
    profile: SourceProfile,
  ) {
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const externalGuestId = this.toNullableString(row.guest_id);
      const type = this.toNullableString(row.type);
      const happenedAt = this.parseLangameDate(row.date);
      const sourceKey = this.sourceKey([
        externalGuestId,
        type,
        row.date,
        index,
      ]);

      profile.guestLogs.total += 1;
      profile.guestLogs.withoutGuestId += externalGuestId ? 0 : 1;
      profile.guestLogs.invalidDates += row.date && !happenedAt ? 1 : 0;
      this.increment(profile.guestLogs.typeCounts, type ?? 'unknown');

      await this.prisma.guestLog.upsert({
        where: {
          tenantId_externalProvider_externalDomain_sourceKey: {
            tenantId,
            externalProvider: IntegrationProvider.LANGAME,
            externalDomain: domain,
            sourceKey,
          },
        },
        create: {
          tenantId,
          guestId: externalGuestId
            ? (guestsByExternalId.get(externalGuestId)?.id ?? null)
            : null,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: domain,
          sourceKey,
          externalGuestId,
          type,
          happenedAt,
          sourcePayloadHash: this.payloadHash(row),
        },
        update: {
          guestId: externalGuestId
            ? (guestsByExternalId.get(externalGuestId)?.id ?? null)
            : null,
          externalGuestId,
          type,
          happenedAt,
          sourcePayloadHash: this.payloadHash(row),
        },
      });
    }
  }

  private async syncOperationLogs(
    tenantId: string,
    baseUrl: string,
    domain: string,
    apiKey: string,
    period: ResolvedPeriod,
    storesByExternalClubId: Map<string, StoreRef>,
    profile: SourceProfile,
  ) {
    const allRows: LangameOperationLog[] = [];
    const operationTypeFilters = [null, 'Списание', 'Пополнение'] as const;

    for (const chunk of this.splitPeriod(
      period,
      MAX_OPERATION_LOG_PERIOD_DAYS,
    )) {
      const rows = await this.loadOperationLogChunk(
        baseUrl,
        apiKey,
        chunk,
        operationTypeFilters,
      );
      allRows.push(...rows);

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const externalClubId = this.toNullableString(row.club_id);
        const type = this.toNullableString(row.type);
        const happenedAt = this.parseLangameDate(row.date_normal);
        const sourceKey = this.sourceKey([
          chunk.from,
          chunk.to,
          index,
          row.date_normal,
          externalClubId,
          type,
          row.sum,
        ]);

        profile.operationLogs.total += 1;
        profile.operationLogs.invalidDates +=
          row.date_normal && !happenedAt ? 1 : 0;
        this.increment(profile.operationLogs.typeCounts, type ?? 'unknown');
        this.profileRowFields(profile.operationLogs, row);
        this.profileOperatorHints(profile.operatorHints.operationLogs, row);

        await this.prisma.guestOperationLog.upsert({
          where: {
            tenantId_externalProvider_externalDomain_sourceKey: {
              tenantId,
              externalProvider: IntegrationProvider.LANGAME,
              externalDomain: domain,
              sourceKey,
            },
          },
          create: {
            tenantId,
            storeId: externalClubId
              ? (storesByExternalClubId.get(externalClubId)?.id ?? null)
              : null,
            externalProvider: IntegrationProvider.LANGAME,
            externalDomain: domain,
            sourceKey,
            externalClubId,
            type,
            happenedAt,
            amount: this.toDecimalOrNull(row.sum),
            sourcePayloadHash: this.payloadHash(row),
          },
          update: {
            storeId: externalClubId
              ? (storesByExternalClubId.get(externalClubId)?.id ?? null)
              : null,
            externalClubId,
            type,
            happenedAt,
            amount: this.toDecimalOrNull(row.sum),
            sourcePayloadHash: this.payloadHash(row),
          },
        });
      }
    }

    return allRows;
  }

  private async loadOperationLogChunk(
    baseUrl: string,
    apiKey: string,
    chunk: ResolvedPeriod,
    operationTypeFilters: readonly (string | null)[],
  ) {
    const rowsByHash = new Map<string, LangameOperationLog>();
    const dateFrom = chunk.from;
    const dateTo = chunk.to;

    for (const operationType of operationTypeFilters) {
      let rows: LangameOperationLog[];
      try {
        rows = await this.langameClient.listAllOperationsLog(baseUrl, apiKey, {
          dateFrom,
          dateTo,
          ...(operationType ? { operationType } : {}),
        });
      } catch (error) {
        if (!operationType) {
          throw error;
        }
        continue;
      }

      rows.forEach((row) => rowsByHash.set(this.payloadHash(row), row));
    }

    return [...rowsByHash.values()];
  }

  private async syncWorkingShifts(
    tenantId: string,
    domain: string,
    rows: LangameWorkingShift[],
    guestsByExternalId: Map<string, GuestRef>,
    storesByExternalClubId: Map<string, StoreRef>,
  ) {
    const staffGuestIdsByExternalUserId =
      await this.loadStaffGuestIdentityMappings(tenantId, domain);

    for (const row of rows) {
      const externalShiftId = this.toNullableString(row.id);
      if (!externalShiftId) {
        continue;
      }

      const externalUserId = this.toNullableString(row.user_id);
      const externalClubId = this.toNullableString(row.list_clubs_id);
      const startedAt = this.parseLangameDate(
        this.toNullableString(row.date_start),
      );
      const stoppedAt = this.parseLangameDate(
        this.toNullableString(row.date_stop),
      );
      const guestId = externalUserId
        ? (staffGuestIdsByExternalUserId.get(externalUserId) ??
          guestsByExternalId.get(externalUserId)?.id ??
          null)
        : null;

      await this.prisma.guestWorkingShift.upsert({
        where: {
          tenantId_externalProvider_externalDomain_externalShiftId: {
            tenantId,
            externalProvider: IntegrationProvider.LANGAME,
            externalDomain: domain,
            externalShiftId,
          },
        },
        create: {
          tenantId,
          guestId,
          storeId: externalClubId
            ? (storesByExternalClubId.get(externalClubId)?.id ?? null)
            : null,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: domain,
          externalShiftId,
          externalUserId,
          externalClubId,
          startedAt,
          stoppedAt,
          durationMinutes: this.durationMinutes(startedAt, stoppedAt),
          cashStart: this.toDecimalOrNull(row.start),
          cashAmount: this.toDecimalOrNull(row.nal),
          cashlessAmount: this.toDecimalOrNull(row.beznal),
          refundsCash: this.toDecimalOrNull(row.refunds_nal),
          refundsCashless: this.toDecimalOrNull(row.refunds_beznal),
          mobilePay: this.toDecimalOrNull(row.mobile_pay),
          yandexPay: this.toDecimalOrNull(row.yandex_pay),
          incassAmount: this.toDecimalOrNull(row.incass),
          middleCheck: this.toDecimalOrNull(row.middle_check),
          message: this.toNullableString(row.message),
          sourcePayloadHash: this.payloadHash(row),
        },
        update: {
          guestId,
          storeId: externalClubId
            ? (storesByExternalClubId.get(externalClubId)?.id ?? null)
            : null,
          externalUserId,
          externalClubId,
          startedAt,
          stoppedAt,
          durationMinutes: this.durationMinutes(startedAt, stoppedAt),
          cashStart: this.toDecimalOrNull(row.start),
          cashAmount: this.toDecimalOrNull(row.nal),
          cashlessAmount: this.toDecimalOrNull(row.beznal),
          refundsCash: this.toDecimalOrNull(row.refunds_nal),
          refundsCashless: this.toDecimalOrNull(row.refunds_beznal),
          mobilePay: this.toDecimalOrNull(row.mobile_pay),
          yandexPay: this.toDecimalOrNull(row.yandex_pay),
          incassAmount: this.toDecimalOrNull(row.incass),
          middleCheck: this.toDecimalOrNull(row.middle_check),
          message: this.toNullableString(row.message),
          sourcePayloadHash: this.payloadHash(row),
        },
      });
    }
  }

  private async loadStaffGuestIdentityMappings(
    tenantId: string,
    domain: string,
  ) {
    const mappings = await this.prisma.guestStaffIdentityMapping.findMany({
      where: {
        tenantId,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: domain,
      },
      select: {
        externalUserId: true,
        guestId: true,
      },
    });

    return new Map(
      mappings.map((mapping) => [mapping.externalUserId, mapping.guestId]),
    );
  }

  private async linkProductSalesToGuests(
    tenantId: string,
    domain: string,
    rows: LangameProductExpense[],
    guestsByExternalId: Map<string, GuestRef>,
    profile: SourceProfile,
  ) {
    let linked = 0;

    for (const row of rows) {
      const externalGuestId = this.toNullableString(
        row.real_guest_id ?? row.guest_id,
      );
      profile.productSales.total += 1;
      profile.productSales.withGuestId += externalGuestId ? 1 : 0;

      if (!externalGuestId) {
        continue;
      }

      const sale = await this.prisma.salesFact.updateMany({
        where: {
          tenantId,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: domain,
          externalSaleId: String(row.id),
        },
        data: {
          externalGuestId,
          guestId: guestsByExternalId.get(externalGuestId)?.id ?? null,
        },
      });

      if (sale.count > 0) {
        linked += sale.count;
      } else {
        profile.productSales.missingSalesFact += 1;
      }
    }

    profile.productSales.linked = linked;
    return linked;
  }

  private async loadGuestLookup(tenantId: string, domain: string) {
    const guests = await this.prisma.guest.findMany({
      where: {
        tenantId,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: domain,
      },
      select: {
        id: true,
        externalGuestId: true,
      },
    });

    return new Map(
      guests.map((guest) => [guest.externalGuestId, { id: guest.id }]),
    );
  }

  private async loadStoreLookup(tenantId: string, domain: string) {
    const stores = await this.prisma.store.findMany({
      where: {
        tenantId,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: domain,
      },
      select: {
        id: true,
        externalClubId: true,
      },
    });

    return new Map(
      stores
        .filter((store) => store.externalClubId)
        .map((store) => [store.externalClubId as string, { id: store.id }]),
    );
  }

  private async paginate<T>(fetchPage: (page: number) => Promise<T[]>) {
    const rows: T[] = [];
    let page = 1;

    while (true) {
      const pageRows = await fetchPage(page);
      rows.push(...pageRows);

      if (pageRows.length < DEFAULT_PAGE_LIMIT) {
        break;
      }

      page += 1;
    }

    return rows;
  }

  private async resolvePeriod(
    tenantId: string,
    query: GuestDataFoundationSyncQuery,
  ): Promise<ResolvedPeriod> {
    const now = new Date();
    const defaultTo = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const previousRun = query.dateFrom
      ? null
      : await this.findLatestSuccessfulRun(tenantId);
    const toDate = query.dateTo
      ? this.parseDateInput(query.dateTo, 'dateTo')
      : defaultTo;
    const fromDate = query.dateFrom
      ? this.parseDateInput(query.dateFrom, 'dateFrom')
      : previousRun?.finishedAt
        ? new Date(previousRun.finishedAt)
        : new Date(toDate);

    if (!query.dateFrom && !previousRun) {
      fromDate.setUTCDate(fromDate.getUTCDate() - (DEFAULT_PROFILE_DAYS - 1));
    }

    fromDate.setUTCHours(0, 0, 0, 0);
    toDate.setUTCHours(23, 59, 59, 999);

    if (fromDate > toDate) {
      throw new BadRequestException('dateFrom must be before dateTo');
    }

    const days =
      Math.floor((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;
    if (days > MAX_PROFILE_DAYS) {
      throw new BadRequestException(
        `Guest foundation period must be ${MAX_PROFILE_DAYS} days or less`,
      );
    }

    return {
      fromDate,
      toDate,
      from: this.toDateInputValue(fromDate),
      to: this.toDateInputValue(toDate),
      basedOnFinishedAt: previousRun?.finishedAt ?? null,
    };
  }

  private findLatestSuccessfulRun(tenantId: string) {
    return this.prisma.guestDataProfileRun.findFirst({
      where: {
        tenantId,
        provider: IntegrationProvider.LANGAME,
        status: 'SUCCESS',
        finishedAt: { not: null },
      },
      orderBy: { finishedAt: 'desc' },
      select: { finishedAt: true },
    });
  }

  private parseDateInput(value: string, field: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

    if (!match) {
      throw new BadRequestException(`${field} must be YYYY-MM-DD`);
    }

    return new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    );
  }

  private splitPeriod(period: ResolvedPeriod, maxDays: number) {
    const chunks: ResolvedPeriod[] = [];
    let cursor = this.startOfUtcDay(period.fromDate);
    const end = this.startOfUtcDay(period.toDate);

    while (cursor <= end) {
      const chunkFrom = new Date(cursor);
      const chunkTo = new Date(cursor);
      chunkTo.setUTCDate(chunkTo.getUTCDate() + maxDays - 1);
      if (chunkTo > end) {
        chunkTo.setTime(end.getTime());
      }

      chunks.push({
        fromDate: chunkFrom,
        toDate: chunkTo,
        from: this.toDateInputValue(chunkFrom),
        to: this.toDateInputValue(chunkTo),
        basedOnFinishedAt: period.basedOnFinishedAt,
      });

      cursor = new Date(chunkTo);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return chunks;
  }

  private startOfUtcDay(value: Date) {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }

  private toDateInputValue(value: Date) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private toLangameDatePeriod(period: ResolvedPeriod) {
    return {
      from: period.from,
      to: period.to,
    };
  }

  private parseLangameDate(value: string | null | undefined) {
    if (!value) {
      return null;
    }

    const trimmed = value.trim();
    const ruDate =
      /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(
        trimmed,
      );
    if (ruDate) {
      return new Date(
        Date.UTC(
          Number(ruDate[3]),
          Number(ruDate[2]) - 1,
          Number(ruDate[1]),
          Number(ruDate[4] ?? 0),
          Number(ruDate[5] ?? 0),
          Number(ruDate[6] ?? 0),
        ),
      );
    }

    const normalized = trimmed.includes('T')
      ? trimmed
      : trimmed.replace(' ', 'T');
    const withTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized)
      ? normalized
      : `${normalized}Z`;
    const date = new Date(withTimezone);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  private birthdayParts(value: string | null | undefined) {
    const date = this.parseLangameDate(value);
    if (!date) {
      return null;
    }

    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    };
  }

  private durationMinutes(startedAt: Date | null, stoppedAt: Date | null) {
    if (!startedAt || !stoppedAt || stoppedAt < startedAt) {
      return null;
    }

    return Math.round((stoppedAt.getTime() - startedAt.getTime()) / 60_000);
  }

  private toDecimalOrNull(value: unknown) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const stringValue = this.scalarToString(value);
    if (!stringValue) {
      return null;
    }

    try {
      return new Prisma.Decimal(stringValue.replace(',', '.'));
    } catch {
      return null;
    }
  }

  private toNullableString(value: unknown) {
    if (value === null || value === undefined) {
      return null;
    }

    const stringValue = this.scalarToString(value)?.trim();
    return stringValue ? stringValue : null;
  }

  private firstStringField(row: Record<string, unknown>, fields: string[]) {
    const normalizedFields = this.normalizedFieldNames(fields);

    for (const field of fields) {
      const value = this.toNullableString(row[field]);

      if (value) {
        return value;
      }
    }

    for (const value of this.objectFieldValues(row, normalizedFields)) {
      const stringValue = this.toNullableString(value);

      if (stringValue) {
        return stringValue;
      }
    }

    return null;
  }

  private firstNumberField(row: Record<string, unknown>, fields: string[]) {
    const normalizedFields = this.normalizedFieldNames(fields);

    for (const field of fields) {
      const value = row[field];
      if (value === null || value === undefined || value === '') {
        continue;
      }

      const numberValue =
        typeof value === 'number'
          ? value
          : Number(this.scalarToString(value)?.replace(',', '.'));

      if (Number.isFinite(numberValue)) {
        return numberValue;
      }
    }

    for (const value of this.objectFieldValues(row, normalizedFields)) {
      if (value === null || value === undefined || value === '') {
        continue;
      }

      const numberValue =
        typeof value === 'number'
          ? value
          : Number(this.scalarToString(value)?.replace(',', '.'));

      if (Number.isFinite(numberValue)) {
        return numberValue;
      }
    }

    return null;
  }

  private normalizedFieldNames(fields: string[]) {
    return new Set(fields.map((field) => this.normalizeFieldName(field)));
  }

  private *objectFieldValues(
    row: Record<string, unknown>,
    normalizedFields: Set<string>,
  ): Generator<unknown> {
    for (const [field, value] of Object.entries(row)) {
      yield* this.objectFieldValuesForKey(field, value, normalizedFields, 0);
    }
  }

  private *objectFieldValuesForKey(
    field: string,
    value: unknown,
    normalizedFields: Set<string>,
    depth: number,
  ): Generator<unknown> {
    if (normalizedFields.has(this.normalizeFieldName(field))) {
      yield value;
    }

    if (
      depth >= 1 ||
      value === null ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      return;
    }

    for (const [nestedField, nestedValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      yield* this.objectFieldValuesForKey(
        `${field}_${nestedField}`,
        nestedValue,
        normalizedFields,
        depth + 1,
      );
    }
  }

  private normalizeFieldName(field: string) {
    return field.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private toBoolean(value: unknown) {
    return this.toOptionalBoolean(value) ?? false;
  }

  private toOptionalBoolean(value: unknown) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    if (typeof value === 'boolean') {
      return value;
    }

    const stringValue = this.scalarToString(value);
    if (!stringValue) {
      return null;
    }

    return Number(stringValue) === 1 || stringValue.toLowerCase() === 'true';
  }

  private scalarToString(value: unknown) {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }

    return null;
  }

  private sensitiveValue(
    value: string | null | undefined,
    type: 'phone' | 'email' | 'name',
  ) {
    const normalized = this.normalizeSensitiveValue(value, type);
    if (!normalized) {
      return { hash: null, masked: null, encrypted: null };
    }

    return {
      hash: createHmac('sha256', this.piiSecret())
        .update(normalized)
        .digest('hex'),
      masked: this.maskSensitiveValue(normalized, type),
      encrypted:
        type === 'email'
          ? null
          : this.encryptSensitiveValue(
              this.displaySensitiveValue(value, type) ?? normalized,
            ),
    };
  }

  private normalizeSensitiveValue(
    value: string | null | undefined,
    type: 'phone' | 'email' | 'name',
  ) {
    const trimmed = value?.trim();
    if (!trimmed) {
      return null;
    }

    if (type === 'phone') {
      const digits = trimmed.replace(/\D/g, '');
      return digits || null;
    }

    return trimmed.toLowerCase().replace(/\s+/g, ' ');
  }

  private maskSensitiveValue(value: string, type: 'phone' | 'email' | 'name') {
    if (type === 'phone') {
      return value.length <= 4 ? '****' : `***${value.slice(-4)}`;
    }

    if (type === 'email') {
      const [local, domain] = value.split('@');
      if (!domain) {
        return '***';
      }
      return `${local.slice(0, 1)}***@${domain}`;
    }

    return value
      .split(' ')
      .filter(Boolean)
      .map((part) => `${part.slice(0, 1).toUpperCase()}.`)
      .join(' ');
  }

  private displaySensitiveValue(
    value: string | null | undefined,
    type: 'phone' | 'email' | 'name',
  ) {
    const trimmed = value?.trim();
    if (!trimmed) {
      return null;
    }

    if (type === 'name') {
      return trimmed.replace(/\s+/g, ' ');
    }

    if (type === 'phone') {
      return trimmed;
    }

    return trimmed.toLowerCase();
  }

  private encryptSensitiveValue(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.piiEncryptionKey(), iv);
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return [
      'v1',
      iv.toString('base64url'),
      tag.toString('base64url'),
      encrypted.toString('base64url'),
    ].join(':');
  }

  private piiSecret() {
    const secret =
      this.configService.get<string>('APP_ENCRYPTION_KEY')?.trim() ||
      this.configService.get<string>('JWT_SECRET')?.trim();

    if (!secret) {
      throw new BadRequestException('APP_ENCRYPTION_KEY is not configured');
    }

    return secret;
  }

  private piiEncryptionKey() {
    return createHash('sha256').update(this.piiSecret()).digest();
  }

  private safeGuestPayloadHash(row: LangameGuest) {
    const safeRow = {
      ...row,
      phone: Boolean(row.phone),
      email: Boolean(row.email),
      fio: Boolean(row.fio),
      identity_document: Boolean(row.identity_document),
      identity_document_data: Boolean(row.identity_document_data),
    };

    return this.payloadHash(safeRow);
  }

  private payloadHash(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private sourceKey(parts: unknown[]) {
    return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  }

  private trackDuplicateHash(
    hash: string | null,
    seen: Set<string>,
    duplicates: Set<string>,
  ) {
    if (!hash) {
      return;
    }

    if (seen.has(hash)) {
      duplicates.add(hash);
      return;
    }

    seen.add(hash);
  }

  private increment(counts: Record<string, number>, key: string) {
    counts[key] = (counts[key] ?? 0) + 1;
  }

  private profileRows(
    diagnostics: FieldDiagnostics,
    rows: Array<Record<string, unknown>>,
  ) {
    for (const row of rows) {
      diagnostics.total += 1;
      this.profileRowFields(diagnostics, row);
    }
  }

  private profileRowFields(
    diagnostics: Pick<FieldDiagnostics, 'fieldCounts' | 'candidateFields'>,
    row: Record<string, unknown>,
  ) {
    for (const [field, value] of Object.entries(row)) {
      if (value === null || value === undefined || value === '') {
        continue;
      }

      this.increment(diagnostics.fieldCounts, field);

      if (this.isPotentialStaffField(field)) {
        this.increment(diagnostics.candidateFields, field);
      }
    }
  }

  private profileOperatorHints(
    hints: StaffOperatorHints,
    row: Record<string, unknown>,
  ) {
    const operatorIds = this.extractOperatorIds(row);

    if (operatorIds.length === 0) {
      return;
    }

    for (const operatorId of operatorIds) {
      if (!hints[operatorId] && Object.keys(hints).length >= 50) {
        continue;
      }

      const hint = hints[operatorId] ?? { count: 0, fields: {} };
      hint.count += 1;

      for (const [field, value] of Object.entries(row)) {
        if (!this.isPotentialStaffField(field)) {
          continue;
        }

        const sample = this.toDiagnosticSample(value);
        if (!sample) {
          continue;
        }

        const current = hint.fields[field] ?? [];
        if (current.length < 5 && !current.includes(sample)) {
          current.push(sample);
        }
        hint.fields[field] = current;
      }

      hints[operatorId] = hint;
    }
  }

  private extractOperatorIds(row: Record<string, unknown>) {
    const ids: string[] = [];

    for (const [field, value] of Object.entries(row)) {
      if (!this.isPotentialOperatorIdField(field)) {
        continue;
      }

      const id = this.toDiagnosticSample(value);
      const key = id ? `${field}=${id}` : null;
      if (key && !ids.includes(key)) {
        ids.push(key);
      }
    }

    return ids.slice(0, 3);
  }

  private isPotentialOperatorIdField(field: string) {
    const normalized = field.toLowerCase().replace(/[^a-z0-9]/g, '');
    const hasStaffWord =
      normalized.includes('admin') ||
      normalized.includes('operator') ||
      normalized.includes('cashier') ||
      normalized.includes('employee') ||
      normalized.includes('staff') ||
      normalized.includes('manager') ||
      normalized.includes('user') ||
      normalized.includes('creator') ||
      normalized.includes('author') ||
      normalized.includes('worker');

    return hasStaffWord && normalized.endsWith('id');
  }

  private toDiagnosticSample(value: unknown) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed ? trimmed.slice(0, 80) : null;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }

    return null;
  }

  private isPotentialStaffField(field: string) {
    const normalized = field.toLowerCase();

    return (
      normalized.includes('admin') ||
      normalized.includes('operator') ||
      normalized.includes('cashier') ||
      normalized.includes('employee') ||
      normalized.includes('staff') ||
      normalized.includes('manager') ||
      normalized.includes('user') ||
      normalized.includes('creator') ||
      normalized.includes('author') ||
      normalized.includes('worker') ||
      normalized.includes('shift') ||
      normalized.includes('kass')
    );
  }

  private createEmptyProfile(period: ResolvedPeriod): SourceProfile {
    return {
      period: {
        from: period.from,
        to: period.to,
      },
      guests: {
        total: 0,
        withPhone: 0,
        withEmail: 0,
        withFullName: 0,
        withBirthday: 0,
        withIdentityDocument: 0,
        duplicatePhoneHashes: 0,
        duplicateEmailHashes: 0,
      },
      sessions: {
        total: 0,
        withoutGuestId: 0,
        invalidDates: 0,
      },
      transactions: {
        total: 0,
        withoutGuestId: 0,
        invalidDates: 0,
        typeCounts: {},
      },
      guestLogs: {
        total: 0,
        withoutGuestId: 0,
        invalidDates: 0,
        typeCounts: {},
      },
      operationLogs: {
        total: 0,
        invalidDates: 0,
        typeCounts: {},
        fieldCounts: {},
        candidateFields: {},
      },
      cashTransactions: {
        total: 0,
        fieldCounts: {},
        candidateFields: {},
      },
      workingShifts: {
        total: 0,
        fieldCounts: {},
        candidateFields: {},
      },
      pcTypesInClubs: {
        total: 0,
        fieldCounts: {},
        candidateFields: {},
      },
      pcTypeLinks: {
        total: 0,
        fieldCounts: {},
        candidateFields: {},
      },
      operatorHints: {
        operationLogs: {},
        cashTransactions: {},
        workingShifts: {},
      },
      productSales: {
        total: 0,
        withGuestId: 0,
        linked: 0,
        missingSalesFact: 0,
      },
      balances: {
        total: 0,
        sumBalance: '0.00',
      },
      bonusBalances: {
        total: 0,
        sumBonusBalance: '0.00',
      },
      endpointErrors: {},
    };
  }
}
