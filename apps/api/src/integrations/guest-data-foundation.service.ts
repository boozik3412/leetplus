import { BadRequestException, Injectable } from '@nestjs/common';
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
  LangameGuest,
  LangameGuestBalance,
  LangameGuestBonusBalance,
  LangameGuestLog,
  LangameGuestSession,
  LangameOperationLog,
  LangameProductExpense,
  LangameTransaction,
} from './langame.types';

const DEFAULT_PAGE_LIMIT = 200;
const DEFAULT_PROFILE_DAYS = 90;
const MAX_PROFILE_DAYS = 90;
const MAX_OPERATION_LOG_PERIOD_DAYS = 31;

export type GuestDataFoundationSyncQuery = {
  dateFrom?: string;
  dateTo?: string;
  includeGuestLogs?: boolean;
  includeOperationLog?: boolean;
};

export type GuestDataFoundationSyncResult = {
  tenantId: string;
  sources: number;
  failedSources: number;
  sourceResults: GuestDataFoundationSourceResult[];
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
};

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
    const period = this.resolvePeriod(query);
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
            dateFrom: period.from,
            dateTo: period.to,
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
            dateFrom: period.from,
            dateTo: period.to,
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
            dateFrom: period.from,
            dateTo: period.to,
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
      const startedAt = this.parseLangameDate(row.date_start);
      const stoppedAt = this.parseLangameDate(row.date_stop);

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
      const happenedAt = this.parseLangameDate(row.date ?? row.date_insert);
      const updatedAtExternal = this.parseLangameDate(row.date_update);

      profile.transactions.total += 1;
      profile.transactions.withoutGuestId += externalGuestId ? 0 : 1;
      profile.transactions.invalidDates +=
        (row.date || row.date_insert || row.date_update) &&
        !happenedAt &&
        !updatedAtExternal
          ? 1
          : 0;
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
          amount: this.toDecimalOrNull(row.amount ?? row.sum),
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
          amount: this.toDecimalOrNull(row.amount ?? row.sum),
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

    for (const chunk of this.splitPeriod(
      period,
      MAX_OPERATION_LOG_PERIOD_DAYS,
    )) {
      const rows = await this.langameClient.listAllOperationsLog(
        baseUrl,
        apiKey,
        {
          dateFrom: chunk.from,
          dateTo: chunk.to,
        },
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

  private resolvePeriod(query: GuestDataFoundationSyncQuery): ResolvedPeriod {
    const now = new Date();
    const defaultTo = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const toDate = query.dateTo
      ? this.parseDateInput(query.dateTo, 'dateTo')
      : defaultTo;
    const fromDate = query.dateFrom
      ? this.parseDateInput(query.dateFrom, 'dateFrom')
      : new Date(toDate);

    if (!query.dateFrom) {
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
    };
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
