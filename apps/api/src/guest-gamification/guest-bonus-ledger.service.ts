import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IntegrationProvider,
  Prisma,
  TenantLifecycleStatus,
  UserRole,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { LangameClient } from '../integrations/langame.client';
import { LangameSettingsService } from '../integrations/langame-settings.service';
import { SecretEncryptionService } from '../integrations/secret-encryption.service';
import { PrismaService } from '../prisma/prisma.service';

const langameBalancePhonePath = '/guests/balance/phone';
const langameBalancePhoneMasterPath = `/master_api${langameBalancePhonePath}`;
const defaultBonusRewardTypes = [
  'BONUS',
  'BONUS_POINTS',
  'BONUS_BALANCE',
  'LOYALTY_BONUS',
] as const;
const moneyBalanceRewardTypes = [
  'BALANCE',
  'MONEY_BALANCE',
  'CASH_BALANCE',
  'DEPOSIT',
  'WALLET_BALANCE',
  'LANGAME_BALANCE',
] as const;
const scheduledBonusLedgerActorRoles = [
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
] as const;

type BonusLedgerMode = 'DISABLED' | 'DRY_RUN' | 'READY';
type BonusLedgerItemStatus =
  | 'QUEUED'
  | 'DRY_RUN'
  | 'CONFIRMED'
  | 'FAILED'
  | 'SKIPPED'
  | 'CANCELED'
  | 'BLOCKED';
type LangameBalanceType = 'balance' | 'bonus_balance';

export type GuestGameBonusLedgerQueueDto = {
  rewardTypes?: string[] | string | null;
  limit?: number | string | null;
  storeId?: string | null;
};

export type GuestGameBonusLedgerDispatchDto = GuestGameBonusLedgerQueueDto & {
  dryRun?: boolean | string | null;
  queueApprovedRewards?: boolean | string | null;
  canary?: boolean | string | null;
};

export type GuestGameScheduledBonusLedgerDispatchDto =
  GuestGameBonusLedgerDispatchDto & {
    tenantId?: string | null;
    tenantSlug?: string | null;
  };

export type GuestGameBonusLedgerCancelDto = {
  reason?: string | null;
};

export type GuestGameBonusLedgerStatus = {
  mode: BonusLedgerMode;
  modeLabel: string;
  ready: boolean;
  langamePath: string | null;
  rewardTypes: string[];
  pendingApprovedRewards: number;
  pending: number;
  processing: number;
  confirmed: number;
  failed: number;
  canceled: number;
  total: number;
  note: string;
};

export type GuestGameBonusLedgerQueueResult = {
  checkedRewards: number;
  queued: number;
  skipped: number;
  rewardTypes: string[];
  items: GuestGameBonusLedgerQueueItem[];
  note: string;
};

export type GuestGameBonusLedgerQueueItem = {
  rewardId: string;
  status: 'QUEUED' | 'SKIPPED';
  reason: string | null;
  externalDomain: string | null;
  externalGuestId: string | null;
  amount: number;
};

export type GuestGameBonusLedgerDispatchResult = {
  mode: BonusLedgerMode;
  dryRun: boolean;
  canary: boolean;
  ready: boolean;
  queued: GuestGameBonusLedgerQueueResult | null;
  checked: number;
  confirmed: number;
  failed: number;
  skipped: number;
  blocked: number;
  items: GuestGameBonusLedgerDispatchItem[];
  status: GuestGameBonusLedgerStatus;
  note: string;
};

export type GuestGameBonusLedgerDispatchItem = {
  ledgerEntryId: string;
  rewardId: string | null;
  status: BonusLedgerItemStatus;
  amount: number;
  externalDomain: string | null;
  externalGuestId: string | null;
  note: string;
};

export type GuestGameScheduledBonusLedgerTenantResult = {
  tenantId: string;
  tenantSlug: string;
  status: 'PROCESSED' | 'SKIPPED' | 'ERROR';
  reason: string | null;
  result: GuestGameBonusLedgerDispatchResult | null;
};

export type GuestGameScheduledBonusLedgerDispatchResult = {
  mode: BonusLedgerMode;
  dryRun: boolean;
  checkedTenants: number;
  processedTenants: number;
  skippedTenants: number;
  erroredTenants: number;
  queued: number;
  checked: number;
  confirmed: number;
  failed: number;
  skipped: number;
  blocked: number;
  tenants: GuestGameScheduledBonusLedgerTenantResult[];
  note: string;
};

type BonusLedgerConfig = {
  mode: BonusLedgerMode;
  dryRun: boolean;
  canary: boolean;
  ready: boolean;
  enabled: boolean;
  path: string | null;
  rewardTypes: string[];
  storeId: string | null;
  limit: number;
  maxAttempts: number;
  retryMinutes: number;
  staleLockMinutes: number;
};

type ClaimedBonusLedgerEntry = {
  id: string;
  tenantId: string;
  guestId: string | null;
  profileId: string | null;
  rewardId: string | null;
  storeId: string | null;
  externalProvider: IntegrationProvider | null;
  externalDomain: string | null;
  externalGuestId: string | null;
  idempotencyKey: string;
  entryType: string;
  source: string;
  status: string;
  amount: Prisma.Decimal;
  attempts: number;
  reason: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
};

type TenantAccess = Awaited<
  ReturnType<LangameSettingsService['resolveTenantAccess']>
>;

@Injectable()
export class GuestBonusLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly langameClient: LangameClient,
    private readonly langameSettingsService: LangameSettingsService,
    private readonly secretEncryptionService: SecretEncryptionService,
  ) {}

  async getStatus(
    user: Pick<AuthenticatedUser, 'tenantId'>,
    dto: GuestGameBonusLedgerQueueDto = {},
  ): Promise<GuestGameBonusLedgerStatus> {
    const config = this.resolveConfig(dto);
    const grouped = await this.prisma.guestBonusLedgerEntry.groupBy({
      by: ['status'],
      where: {
        tenantId: user.tenantId,
        ...(config.storeId ? { storeId: config.storeId } : {}),
      },
      _count: { _all: true },
    });
    const counts = new Map(
      grouped.map((row) => [row.status, row._count._all] as const),
    );
    const pendingApprovedRewards = await this.countApprovedRewards(
      user.tenantId,
      config.rewardTypes,
      config.storeId,
    );
    const total = [...counts.values()].reduce((sum, value) => sum + value, 0);

    return {
      mode: config.mode,
      modeLabel: bonusLedgerModeLabel(config.mode),
      ready: config.ready,
      langamePath: config.path,
      rewardTypes: config.rewardTypes,
      pendingApprovedRewards,
      pending: counts.get('PENDING') ?? 0,
      processing: counts.get('PROCESSING') ?? 0,
      confirmed: counts.get('CONFIRMED') ?? 0,
      failed: counts.get('FAILED') ?? 0,
      canceled: counts.get('CANCELED') ?? 0,
      total,
      note: bonusLedgerStatusNote(config),
    };
  }

  async queueApprovedRewards(
    user: Pick<AuthenticatedUser, 'id' | 'tenantId'>,
    dto: GuestGameBonusLedgerQueueDto = {},
  ): Promise<GuestGameBonusLedgerQueueResult> {
    const rewardTypes = this.resolveRewardTypes(dto.rewardTypes);
    const storeId = nullableString(dto.storeId);
    const limit = positiveInt(dto.limit, 500, 1000);
    const rewards = await this.prisma.guestGameReward.findMany({
      where: {
        tenantId: user.tenantId,
        status: 'APPROVED',
        ...(storeId ? { storeId } : {}),
        rewardAmount: { gt: 0 },
        OR: rewardTypes.map((type) => ({
          rewardType: { equals: type, mode: 'insensitive' as const },
        })),
        bonusLedgerEntries: {
          none: {
            tenantId: user.tenantId,
            source: 'GAMIFICATION_REWARD',
          },
        },
      },
      select: {
        id: true,
        profileId: true,
        guestId: true,
        storeId: true,
        externalProvider: true,
        externalDomain: true,
        guestExternalId: true,
        rewardType: true,
        rewardAmount: true,
        rewardLabel: true,
        rewardCode: true,
        guest: {
          select: {
            externalProvider: true,
            externalDomain: true,
            externalGuestId: true,
            phoneEncrypted: true,
            phoneMasked: true,
          },
        },
      },
      orderBy: [{ qualifiedAt: 'asc' }, { createdAt: 'asc' }],
      take: limit,
    });
    const items: GuestGameBonusLedgerQueueItem[] = [];
    const data: Prisma.GuestBonusLedgerEntryCreateManyInput[] = [];

    for (const reward of rewards) {
      const externalGuestId =
        nullableString(reward.guestExternalId) ??
        nullableString(reward.guest?.externalGuestId);
      const externalDomain =
        nullableString(reward.externalDomain) ??
        nullableString(reward.guest?.externalDomain);
      const externalProvider =
        reward.externalProvider ??
        reward.guest?.externalProvider ??
        IntegrationProvider.LANGAME;
      const amount = decimalToNumber(reward.rewardAmount);
      const phone = this.resolveEncryptedPhone(reward.guest);
      const balanceType = langameBalanceTypeForRewardType(reward.rewardType);

      if (!phone) {
        items.push({
          rewardId: reward.id,
          status: 'SKIPPED',
          reason:
            'У гостя нет расшифровываемого телефона для Langame /master_api/guests/balance/phone.',
          externalDomain,
          externalGuestId,
          amount,
        });
        continue;
      }

      const idempotencyKey = `guest-game-reward:${reward.id}:bonus:v1`;
      data.push({
        tenantId: user.tenantId,
        guestId: reward.guestId,
        profileId: reward.profileId,
        rewardId: reward.id,
        storeId: reward.storeId,
        createdByUserId: user.id,
        externalProvider,
        externalDomain,
        externalGuestId,
        idempotencyKey,
        entryType: 'EARN',
        source: 'GAMIFICATION_REWARD',
        status: 'PENDING',
        amount: reward.rewardAmount,
        reason: reward.rewardLabel,
        metadata: {
          langameBalanceType: balanceType,
          rewardType: reward.rewardType,
          rewardLabel: reward.rewardLabel,
          rewardCode: reward.rewardCode,
          phoneMasked: phone.masked,
        },
      });
      items.push({
        rewardId: reward.id,
        status: 'QUEUED',
        reason: null,
        externalDomain,
        externalGuestId,
        amount,
      });
    }

    const created =
      data.length > 0
        ? await this.prisma.guestBonusLedgerEntry.createMany({
            data,
            skipDuplicates: true,
          })
        : { count: 0 };

    return {
      checkedRewards: rewards.length,
      queued: created.count,
      skipped: items.filter((item) => item.status === 'SKIPPED').length,
      rewardTypes,
      items,
      note:
        created.count > 0
          ? 'Согласованные бонусные награды поставлены в ledger-очередь.'
          : 'Новых бонусных наград для ledger-очереди не найдено.',
    };
  }

  async dispatch(
    user: Pick<AuthenticatedUser, 'id' | 'tenantId'>,
    dto: GuestGameBonusLedgerDispatchDto = {},
  ): Promise<GuestGameBonusLedgerDispatchResult> {
    const config = this.resolveConfig(dto);
    const shouldQueue =
      !config.canary && booleanValue(dto.queueApprovedRewards, true);
    const queued =
      shouldQueue && !config.dryRun
        ? await this.queueApprovedRewards(user, dto)
        : null;

    if (config.dryRun) {
      const preview = await this.previewPendingEntries(user.tenantId, config);
      const status = await this.getStatus(user, dto);

      return {
        mode: 'DRY_RUN',
        dryRun: true,
        canary: config.canary,
        ready: config.ready,
        queued,
        checked: preview.length,
        confirmed: 0,
        failed: 0,
        skipped: preview.length,
        blocked: 0,
        items: preview.map((entry) => ({
          ledgerEntryId: entry.id,
          rewardId: entry.rewardId,
          status: 'DRY_RUN',
          amount: decimalToNumber(entry.amount),
          externalDomain: entry.externalDomain,
          externalGuestId: entry.externalGuestId,
          note: 'Dry-run: запись в Langame не выполнялась.',
        })),
        status,
        note: 'Dry-run проверил очередь без claim, статусов и записи в Langame.',
      };
    }

    if (!config.ready) {
      const status = await this.getStatus(user, dto);

      return {
        mode: config.mode,
        dryRun: false,
        canary: config.canary,
        ready: false,
        queued,
        checked: 0,
        confirmed: 0,
        failed: 0,
        skipped: 0,
        blocked: status.pending + status.failed,
        items: [],
        status,
        note: 'Langame write API для бонусов не включен: ledger не был claim-нут, статусы не изменены.',
      };
    }

    const access = await this.langameSettingsService.resolveTenantAccess(
      user.tenantId,
    );
    const entries = await this.claimReadyEntries(user.tenantId, config);
    const items: GuestGameBonusLedgerDispatchItem[] = [];

    for (const entry of entries) {
      items.push(
        await this.processClaimedEntry(user.id, entry, config, access),
      );
    }

    const status = await this.getStatus(user, dto);
    const dispatchNote = config.canary
      ? entries.length > 0
        ? 'Canary ledger обработан: ровно одна подготовленная запись прошла live dispatch.'
        : 'Canary ledger не нашел подготовленную запись для live dispatch.'
      : entries.length > 0
        ? 'Ledger batch обработан: успешные записи подтверждены, ошибки поставлены на retry.'
        : 'Готовых ledger-записей для обработки нет.';

    return {
      mode: 'READY',
      dryRun: false,
      canary: config.canary,
      ready: true,
      queued,
      checked: entries.length,
      confirmed: items.filter((item) => item.status === 'CONFIRMED').length,
      failed: items.filter((item) => item.status === 'FAILED').length,
      skipped: items.filter((item) => item.status === 'SKIPPED').length,
      blocked: items.filter((item) => item.status === 'BLOCKED').length,
      items,
      status,
      note: dispatchNote,
    };
  }

  async cancelEntry(
    user: Pick<AuthenticatedUser, 'id' | 'tenantId'>,
    id: string,
    dto: GuestGameBonusLedgerCancelDto = {},
  ): Promise<GuestGameBonusLedgerDispatchItem> {
    const reason = nullableString(dto.reason) ?? 'Отменено вручную.';
    const row = await this.prisma.guestBonusLedgerEntry.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!row) {
      throw new BadRequestException('Ledger-запись не найдена.');
    }

    if (row.status === 'CONFIRMED') {
      throw new BadRequestException(
        'Подтвержденную ledger-запись нельзя отменить без обратной операции.',
      );
    }

    const config = this.resolveConfig();
    if (
      row.status === 'PROCESSING' &&
      bonusLedgerLockIsFresh(row.lockedAt, config.staleLockMinutes)
    ) {
      throw new BadRequestException(
        'Ledger-запись сейчас обрабатывается worker-ом. Дождитесь завершения или протухания lock перед отменой.',
      );
    }

    const canceled = await this.prisma.$transaction(async (tx) => {
      const canceledAt = new Date();
      await tx.guestBonusLedgerEntry.update({
        where: { id },
        data: {
          status: 'CANCELED',
          processedByUserId: user.id,
          canceledAt,
          lockedAt: null,
          nextAttemptAt: null,
          errorMessage: reason,
        },
      });

      if (!row.rewardId) {
        return { rewards: 0, deliveries: 0 };
      }

      const rewards = await tx.guestGameReward.updateMany({
        where: {
          id: row.rewardId,
          tenantId: user.tenantId,
          status: 'APPROVED',
        },
        data: {
          status: 'CANCELED',
        },
      });

      let deliveryCount = 0;

      if (rewards.count > 0) {
        const deliveries = await tx.guestGameDelivery.findMany({
          where: {
            tenantId: user.tenantId,
            rewardId: row.rewardId,
            status: { notIn: ['SENT', 'CANCELED'] },
          },
          select: {
            id: true,
            rewardId: true,
            status: true,
            channel: true,
          },
        });
        const eventData: Prisma.GuestGameDeliveryEventCreateManyInput[] = [];
        const note = truncate(
          `Отменено вместе с bonus ledger ${row.id}: ${reason}`,
          1000,
        );

        for (const delivery of deliveries) {
          const updated = await tx.guestGameDelivery.updateMany({
            where: {
              id: delivery.id,
              tenantId: user.tenantId,
              status: { notIn: ['SENT', 'CANCELED'] },
            },
            data: {
              status: 'CANCELED',
              canceledAt,
              note,
            },
          });

          if (updated.count > 0) {
            deliveryCount += updated.count;
            eventData.push({
              tenantId: user.tenantId,
              deliveryId: delivery.id,
              rewardId: delivery.rewardId,
              actorUserId: user.id,
              eventType: 'DELIVERY_CANCELED_BY_LEDGER',
              fromStatus: delivery.status,
              toStatus: 'CANCELED',
              channel: delivery.channel,
              note,
              payload: {
                ledgerEntryId: row.id,
                reason,
              },
            });
          }
        }

        if (eventData.length > 0) {
          await tx.guestGameDeliveryEvent.createMany({ data: eventData });
        }
      }

      return { rewards: rewards.count, deliveries: deliveryCount };
    });

    return {
      ledgerEntryId: row.id,
      rewardId: row.rewardId,
      status: 'CANCELED',
      amount: decimalToNumber(row.amount),
      externalDomain: row.externalDomain,
      externalGuestId: row.externalGuestId,
      note: bonusLedgerCancelNote(reason, canceled),
    };
  }

  async runScheduledDispatch(
    dto: GuestGameScheduledBonusLedgerDispatchDto = {},
  ): Promise<GuestGameScheduledBonusLedgerDispatchResult> {
    const tenantId = nullableString(dto.tenantId);
    const tenantSlug = nullableString(dto.tenantSlug);
    const config = this.resolveConfig(dto);
    const tenants = await this.prisma.tenant.findMany({
      where: clean({
        id: tenantId,
        slug: tenantSlug,
      }),
      select: {
        id: true,
        slug: true,
        status: true,
        users: {
          where: {
            isActive: true,
            role: { in: [...scheduledBonusLedgerActorRoles] },
          },
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            customRoleId: true,
            isPlatformAdmin: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { slug: 'asc' },
    });
    const tenantResults: GuestGameScheduledBonusLedgerTenantResult[] = [];

    for (const tenant of tenants) {
      if (tenant.status !== TenantLifecycleStatus.ACTIVE) {
        tenantResults.push({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          status: 'SKIPPED',
          reason:
            'Tenant is not active; scheduled bonus ledger dispatcher skipped.',
          result: null,
        });
        continue;
      }

      const actor = this.pickScheduledActor(tenant.users);

      if (!actor) {
        tenantResults.push({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          status: 'SKIPPED',
          reason:
            'No active owner, system administrator or network manager user found for audit-safe run.',
          result: null,
        });
        continue;
      }

      try {
        const result = await this.dispatch(
          {
            id: actor.id,
            tenantId: tenant.id,
          },
          dto,
        );

        tenantResults.push({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          status: 'PROCESSED',
          reason: null,
          result,
        });
      } catch (error) {
        tenantResults.push({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          status: 'ERROR',
          reason: errorMessage(error),
          result: null,
        });
      }
    }

    return this.buildScheduledSummary(config, tenantResults);
  }

  private async countApprovedRewards(
    tenantId: string,
    rewardTypes: string[],
    storeId: string | null,
  ) {
    return this.prisma.guestGameReward.count({
      where: {
        tenantId,
        status: 'APPROVED',
        ...(storeId ? { storeId } : {}),
        rewardAmount: { gt: 0 },
        OR: rewardTypes.map((type) => ({
          rewardType: { equals: type, mode: 'insensitive' as const },
        })),
        bonusLedgerEntries: {
          none: {
            tenantId,
            source: 'GAMIFICATION_REWARD',
          },
        },
      },
    });
  }

  private async previewPendingEntries(
    tenantId: string,
    config: BonusLedgerConfig,
  ) {
    return this.prisma.guestBonusLedgerEntry.findMany({
      where: {
        tenantId,
        ...(config.storeId ? { storeId: config.storeId } : {}),
        status: { in: ['PENDING', 'FAILED'] },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
      },
      orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
      take: config.limit,
    });
  }

  private async claimReadyEntries(
    tenantId: string,
    config: BonusLedgerConfig,
  ): Promise<ClaimedBonusLedgerEntry[]> {
    const storeFilter = config.storeId
      ? Prisma.sql`AND "storeId" = ${config.storeId}`
      : Prisma.empty;

    return this.prisma.$queryRaw<ClaimedBonusLedgerEntry[]>(Prisma.sql`
      UPDATE "GuestBonusLedgerEntry"
      SET
        "status" = 'PROCESSING',
        "lockedAt" = NOW(),
        "processedAt" = NOW(),
        "attempts" = "attempts" + 1,
        "updatedAt" = NOW()
      WHERE "id" IN (
        SELECT "id"
        FROM "GuestBonusLedgerEntry"
        WHERE "tenantId" = ${tenantId}
          ${storeFilter}
          AND (
            "status" = 'PENDING'
            OR (
              "status" = 'FAILED'
              AND "attempts" < ${config.maxAttempts}
              AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= NOW())
            )
            OR (
              "status" = 'PROCESSING'
              AND "attempts" < ${config.maxAttempts}
              AND "lockedAt" < NOW() - (${config.staleLockMinutes} * INTERVAL '1 minute')
            )
          )
        ORDER BY COALESCE("nextAttemptAt", "createdAt"), "createdAt"
        LIMIT ${config.limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING
        "id",
        "tenantId",
        "guestId",
        "profileId",
        "rewardId",
        "storeId",
        "externalProvider",
        "externalDomain",
        "externalGuestId",
        "idempotencyKey",
        "entryType",
        "source",
        "status",
        "amount",
        "attempts",
        "reason",
        "metadata",
        "createdAt"
    `);
  }

  private async processClaimedEntry(
    actorUserId: string,
    entry: ClaimedBonusLedgerEntry,
    config: BonusLedgerConfig,
    access: TenantAccess,
  ): Promise<GuestGameBonusLedgerDispatchItem> {
    try {
      const source = this.resolveEntrySource(entry, access);
      const phone = await this.resolveEntryPhone(entry);
      const payload = this.buildLangamePayload(entry, phone.value);
      const response = await this.langameClient.adjustGuestBalanceByPhone(
        source.baseUrl,
        access.apiKey,
        payload,
        config.path ?? langameBalancePhoneMasterPath,
      );

      await this.confirmEntry(
        actorUserId,
        entry,
        this.buildLangameAuditPayload(payload, phone.masked),
        sanitizeLangameBalanceResponse(response),
      );

      return {
        ledgerEntryId: entry.id,
        rewardId: entry.rewardId,
        status: 'CONFIRMED',
        amount: decimalToNumber(entry.amount),
        externalDomain: entry.externalDomain,
        externalGuestId: entry.externalGuestId,
        note: langameBalanceConfirmationNote(entry),
      };
    } catch (error) {
      await this.failEntry(actorUserId, entry, config, error);

      return {
        ledgerEntryId: entry.id,
        rewardId: entry.rewardId,
        status: 'FAILED',
        amount: decimalToNumber(entry.amount),
        externalDomain: entry.externalDomain,
        externalGuestId: entry.externalGuestId,
        note: errorMessage(error),
      };
    }
  }

  private async confirmEntry(
    actorUserId: string,
    entry: ClaimedBonusLedgerEntry,
    request: Record<string, unknown>,
    response: unknown,
  ) {
    const now = new Date();
    const amount = toDecimal(entry.amount);
    const langameBalanceType = langameBalanceTypeForEntry(entry);

    await this.prisma.$transaction(async (tx) => {
      const tracksBonusBalance = langameBalanceType === 'bonus_balance';
      const current = tracksBonusBalance
        ? await this.findCurrentBalance(tx, entry)
        : null;
      const balanceBefore = tracksBonusBalance
        ? (current?.bonusBalance ?? new Prisma.Decimal(0))
        : null;
      const balanceAfter = balanceBefore ? balanceBefore.plus(amount) : null;

      if (current && balanceAfter) {
        await tx.guestBonusBalanceCurrent.update({
          where: { id: current.id },
          data: {
            bonusBalance: balanceAfter,
            snapshotDate: now,
            source: 'LANGAME_LEDGER',
            lastSyncedAt: now,
            sourcePayloadHash: entry.idempotencyKey,
            externalProvider: entry.externalProvider,
            externalDomain: entry.externalDomain,
            externalGuestId: entry.externalGuestId ?? current.externalGuestId,
          },
        });
      } else if (tracksBonusBalance && entry.externalGuestId && balanceAfter) {
        await tx.guestBonusBalanceCurrent.create({
          data: {
            tenantId: entry.tenantId,
            guestId: entry.guestId,
            externalProvider: entry.externalProvider,
            externalDomain: entry.externalDomain,
            externalGuestId: entry.externalGuestId,
            bonusBalance: balanceAfter,
            snapshotDate: now,
            source: 'LANGAME_LEDGER',
            lastSyncedAt: now,
            sourcePayloadHash: entry.idempotencyKey,
          },
        });
      }

      await tx.guestBonusLedgerEntry.update({
        where: { id: entry.id },
        data: {
          status: 'CONFIRMED',
          processedByUserId: actorUserId,
          lockedAt: null,
          nextAttemptAt: null,
          processedAt: now,
          confirmedAt: now,
          failedAt: null,
          errorCode: null,
          errorMessage: null,
          balanceBefore,
          balanceAfter,
          langameRequest: request as Prisma.InputJsonValue,
          langameResponse: jsonValue(response),
        },
      });

      if (entry.rewardId) {
        const reward = await tx.guestGameReward.findFirst({
          where: {
            id: entry.rewardId,
            tenantId: entry.tenantId,
          },
          select: {
            id: true,
            status: true,
            tenantId: true,
            profileId: true,
            guestId: true,
            lootBoxId: true,
            missionId: true,
            seasonId: true,
            rewardLabel: true,
            rewardCode: true,
            approvedByUserId: true,
          },
        });

        if (reward?.status === 'APPROVED') {
          await tx.guestGameReward.update({
            where: { id: reward.id },
            data: {
              status: 'PAID',
              paidAt: now,
              approvedByUserId: reward.approvedByUserId ?? actorUserId,
            },
          });
          await tx.guestGameEvent.create({
            data: {
              tenantId: reward.tenantId,
              profileId: reward.profileId,
              guestId: reward.guestId,
              lootBoxId: reward.lootBoxId,
              missionId: reward.missionId,
              seasonId: reward.seasonId,
              createdByUserId: actorUserId,
              eventType: 'REWARD_PAID',
              source: 'SYSTEM',
              externalProvider: entry.externalProvider,
              externalDomain: entry.externalDomain,
              externalId: `bonus-ledger:${entry.id}`,
              xpDelta: 0,
              occurredAt: now,
              payload: {
                ledgerEntryId: entry.id,
                idempotencyKey: entry.idempotencyKey,
                amount: decimalToNumber(amount),
                balanceType: langameBalanceType,
                balanceBefore: decimalToNullableNumber(balanceBefore),
                balanceAfter: decimalToNullableNumber(balanceAfter),
              },
              note: `${reward.rewardLabel} · ${reward.rewardCode ?? entry.idempotencyKey}`,
            },
          });
        }
      }
    });
  }

  private async failEntry(
    actorUserId: string,
    entry: ClaimedBonusLedgerEntry,
    config: BonusLedgerConfig,
    error: unknown,
  ) {
    const now = new Date();
    const terminal = entry.attempts >= config.maxAttempts;
    const nextAttemptAt = terminal
      ? null
      : new Date(now.getTime() + config.retryMinutes * 60 * 1000);

    await this.prisma.guestBonusLedgerEntry.update({
      where: { id: entry.id },
      data: {
        status: 'FAILED',
        processedByUserId: actorUserId,
        lockedAt: null,
        failedAt: now,
        nextAttemptAt,
        errorCode: terminal ? 'MAX_ATTEMPTS_REACHED' : 'LANGAME_WRITE_FAILED',
        errorMessage: truncate(errorMessage(error), 1000),
      },
    });
  }

  private async findCurrentBalance(
    tx: Prisma.TransactionClient,
    entry: ClaimedBonusLedgerEntry,
  ) {
    if (entry.guestId) {
      const byGuest = await tx.guestBonusBalanceCurrent.findUnique({
        where: { guestId: entry.guestId },
      });

      if (byGuest) {
        return byGuest;
      }
    }

    if (!entry.externalGuestId) {
      return null;
    }

    return tx.guestBonusBalanceCurrent.findFirst({
      where: {
        tenantId: entry.tenantId,
        externalProvider: entry.externalProvider,
        externalDomain: entry.externalDomain,
        externalGuestId: entry.externalGuestId,
      },
    });
  }

  private resolveEncryptedPhone(
    guest: {
      phoneEncrypted: string | null;
      phoneMasked: string | null;
    } | null,
  ) {
    if (!guest?.phoneEncrypted) {
      return null;
    }

    let phone: string | null;

    try {
      phone = normalizeLangamePhone(
        this.secretEncryptionService.decrypt(guest.phoneEncrypted),
      );
    } catch {
      phone = null;
    }

    if (!phone) {
      return null;
    }

    return {
      value: phone,
      masked: guest.phoneMasked ?? maskPhoneForAudit(phone),
    };
  }

  private async resolveEntryPhone(entry: ClaimedBonusLedgerEntry) {
    const select = {
      phoneEncrypted: true,
      phoneMasked: true,
    } satisfies Prisma.GuestSelect;
    const guest = entry.guestId
      ? await this.prisma.guest.findFirst({
          where: {
            id: entry.guestId,
            tenantId: entry.tenantId,
          },
          select,
        })
      : entry.externalGuestId
        ? await this.prisma.guest.findFirst({
            where: clean({
              tenantId: entry.tenantId,
              externalProvider: entry.externalProvider,
              externalDomain: entry.externalDomain,
              externalGuestId: entry.externalGuestId,
            }),
            select,
          })
        : null;
    const phone = this.resolveEncryptedPhone(guest);

    if (!phone) {
      throw new BadRequestException(
        'У ledger-записи нет расшифровываемого телефона гостя для Langame /master_api/guests/balance/phone.',
      );
    }

    return phone;
  }

  private resolveEntrySource(
    entry: ClaimedBonusLedgerEntry,
    access: TenantAccess,
  ) {
    if (entry.externalDomain) {
      const matched = access.sources.find(
        (source) => source.domain === entry.externalDomain,
      );

      if (matched) {
        return matched;
      }

      throw new BadRequestException(
        `Langame domain ${entry.externalDomain} is not active for this tenant.`,
      );
    }

    if (access.sources.length === 1) {
      return access.sources[0];
    }

    throw new BadRequestException(
      'Ledger-запись не привязана к Langame domain, а у tenant несколько источников.',
    );
  }

  private buildLangamePayload(
    entry: ClaimedBonusLedgerEntry,
    phone: string,
  ): {
    phone: string;
    type: LangameBalanceType;
    sum: number;
    comment: string;
  } {
    return {
      phone,
      type: langameBalanceTypeForEntry(entry),
      sum: decimalToNumber(entry.amount),
      comment: truncate(
        [
          'LeetPlus',
          entry.reason,
          entry.rewardId ? `reward:${entry.rewardId}` : null,
          `ledger:${entry.id}`,
        ]
          .filter(Boolean)
          .join(' | '),
        240,
      ),
    };
  }

  private buildLangameAuditPayload(
    payload: ReturnType<GuestBonusLedgerService['buildLangamePayload']>,
    phoneMasked: string,
  ) {
    return {
      ...payload,
      phone: phoneMasked,
    };
  }

  private resolveConfig(
    dto: GuestGameBonusLedgerDispatchDto | GuestGameBonusLedgerQueueDto = {},
    forceDryRun = false,
  ): BonusLedgerConfig {
    const path = normalizeLangameBalancePath(
      nullableString(
        this.configService.get<string>('LANGAME_BONUS_ACCRUAL_PATH'),
      ) ?? langameBalancePhoneMasterPath,
    );
    const enabled = booleanValue(
      this.configService.get<string>('LANGAME_BONUS_ACCRUAL_ENABLED'),
      false,
    );
    const dryRun =
      forceDryRun ||
      booleanValue('dryRun' in dto ? dto.dryRun : undefined, !enabled);
    const canary = booleanValue(
      'canary' in dto ? dto.canary : undefined,
      false,
    );
    const ready = enabled && !dryRun;
    const mode: BonusLedgerMode = dryRun
      ? 'DRY_RUN'
      : ready
        ? 'READY'
        : 'DISABLED';

    return {
      mode,
      dryRun,
      canary,
      ready,
      enabled,
      path,
      rewardTypes: this.resolveRewardTypes(dto.rewardTypes),
      storeId: nullableString(dto.storeId),
      limit: canary ? 1 : positiveInt(dto.limit, 50, 250),
      maxAttempts: positiveInt(
        this.configService.get<string>('LANGAME_BONUS_ACCRUAL_MAX_ATTEMPTS'),
        5,
        20,
      ),
      retryMinutes: positiveInt(
        this.configService.get<string>('LANGAME_BONUS_ACCRUAL_RETRY_MINUTES'),
        15,
        24 * 60,
      ),
      staleLockMinutes: positiveInt(
        this.configService.get<string>(
          'LANGAME_BONUS_ACCRUAL_STALE_LOCK_MINUTES',
        ),
        15,
        24 * 60,
      ),
    };
  }

  private resolveRewardTypes(value?: string[] | string | null) {
    const configured = this.configService.get<string>(
      'LANGAME_BONUS_ACCRUAL_REWARD_TYPES',
    );
    const rawValues = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(',')
        : configured
          ? configured.split(',')
          : [...defaultBonusRewardTypes];
    const values = rawValues
      .map((item) => nullableString(item)?.toUpperCase())
      .filter((item): item is string => Boolean(item));

    return [
      ...new Set(values.length > 0 ? values : [...defaultBonusRewardTypes]),
    ].slice(0, 20);
  }

  private pickScheduledActor(
    users: Array<{
      id: string;
      email: string;
      fullName: string | null;
      role: UserRole;
      customRoleId: string | null;
      isPlatformAdmin: boolean;
    }>,
  ) {
    return [...users].sort(
      (left, right) =>
        scheduledRoleRank(left.role) - scheduledRoleRank(right.role),
    )[0];
  }

  private buildScheduledSummary(
    config: BonusLedgerConfig,
    tenants: GuestGameScheduledBonusLedgerTenantResult[],
  ): GuestGameScheduledBonusLedgerDispatchResult {
    const processed = tenants.filter((tenant) => tenant.status === 'PROCESSED');
    const results = processed
      .map((tenant) => tenant.result)
      .filter((result): result is GuestGameBonusLedgerDispatchResult =>
        Boolean(result),
      );

    return {
      mode: config.mode,
      dryRun: config.dryRun,
      checkedTenants: tenants.length,
      processedTenants: processed.length,
      skippedTenants: tenants.filter((tenant) => tenant.status === 'SKIPPED')
        .length,
      erroredTenants: tenants.filter((tenant) => tenant.status === 'ERROR')
        .length,
      queued: sum(results.map((result) => result.queued?.queued ?? 0)),
      checked: sum(results.map((result) => result.checked)),
      confirmed: sum(results.map((result) => result.confirmed)),
      failed: sum(results.map((result) => result.failed)),
      skipped: sum(results.map((result) => result.skipped)),
      blocked: sum(results.map((result) => result.blocked)),
      tenants,
      note: config.dryRun
        ? 'Scheduled bonus ledger dispatcher ran in dry-run mode without claims or Langame writes.'
        : config.ready
          ? 'Scheduled bonus ledger dispatcher processed ledger queue through Langame master balance endpoint.'
          : 'Scheduled bonus ledger dispatcher is disabled until LANGAME_BONUS_ACCRUAL_ENABLED is configured.',
    };
  }
}

function scheduledRoleRank(role: UserRole) {
  const index = scheduledBonusLedgerActorRoles.findIndex(
    (value) => value === role,
  );

  return index >= 0 ? index : scheduledBonusLedgerActorRoles.length;
}

function bonusLedgerModeLabel(mode: BonusLedgerMode) {
  switch (mode) {
    case 'READY':
      return 'Готов к записи в Langame';
    case 'DRY_RUN':
      return 'Безопасная проверка';
    case 'DISABLED':
    default:
      return 'Запись в Langame выключена';
  }
}

function bonusLedgerStatusNote(config: BonusLedgerConfig) {
  if (config.mode === 'READY') {
    return 'Worker может claim-ить ledger и отправлять начисления в Langame /master_api/guests/balance/phone.';
  }

  if (config.mode === 'DRY_RUN') {
    return 'Worker проверяет очередь без claim и без записи в Langame.';
  }

  return 'Для боевого режима задайте LANGAME_BONUS_ACCRUAL_ENABLED=true; путь по умолчанию /master_api/guests/balance/phone.';
}

function normalizeLangameBalancePath(path: string) {
  const normalized = path.startsWith('/') ? path : `/${path}`;

  if (normalized.startsWith('/master_api/')) {
    return normalized;
  }

  if (normalized.startsWith('/guests/')) {
    return `/master_api${normalized}`;
  }

  return normalized;
}

function langameBalanceTypeForRewardType(rewardType: string | null) {
  const normalized = rewardType?.trim().toUpperCase();

  return normalized &&
    moneyBalanceRewardTypes.includes(
      normalized as (typeof moneyBalanceRewardTypes)[number],
    )
    ? 'balance'
    : 'bonus_balance';
}

function langameBalanceTypeForEntry(
  entry: ClaimedBonusLedgerEntry,
): LangameBalanceType {
  const metadata = jsonRecord(entry.metadata);
  const configuredType = nullableString(metadata.langameBalanceType)
    ?.trim()
    .toLowerCase();

  if (configuredType === 'balance' || configuredType === 'bonus_balance') {
    return configuredType;
  }

  return langameBalanceTypeForRewardType(nullableString(metadata.rewardType));
}

function langameBalanceConfirmationNote(entry: ClaimedBonusLedgerEntry) {
  const balanceLabel =
    langameBalanceTypeForEntry(entry) === 'balance'
      ? 'денежного баланса'
      : 'бонусного баланса';
  const actionLabel = toDecimal(entry.amount).lt(0) ? 'списание' : 'начисление';

  return `Langame подтвердил ${actionLabel} ${balanceLabel}.`;
}

function bonusLedgerCancelNote(
  reason: string,
  canceled: { rewards: number; deliveries: number },
) {
  const details = [
    canceled.rewards ? `reward canceled: ${canceled.rewards}` : null,
    canceled.deliveries ? `deliveries canceled: ${canceled.deliveries}` : null,
  ].filter(Boolean);

  return details.length ? `${reason} ${details.join(', ')}.` : reason;
}

function bonusLedgerLockIsFresh(
  lockedAt: Date | string | null | undefined,
  staleLockMinutes: number,
) {
  if (!lockedAt) {
    return false;
  }

  const value = lockedAt instanceof Date ? lockedAt : new Date(lockedAt);
  const lockedAtMs = value.getTime();

  if (!Number.isFinite(lockedAtMs)) {
    return false;
  }

  return Date.now() - lockedAtMs < staleLockMinutes * 60 * 1000;
}

function normalizeLangamePhone(value: string | null) {
  const digits = value?.replace(/\D/g, '') ?? '';

  if (digits.length === 10) {
    return `7${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('8')) {
    return `7${digits.slice(1)}`;
  }

  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

function maskPhoneForAudit(value: string) {
  const digits = value.replace(/\D/g, '');
  const suffix = digits.slice(-4);

  return suffix ? `***${suffix}` : '***';
}

function sanitizeLangameBalanceResponse(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeLangameBalanceResponse);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      isPhoneLikeKey(key) && typeof entry === 'string'
        ? maskPhoneForAudit(entry)
        : sanitizeLangameBalanceResponse(entry),
    ]),
  );
}

function isPhoneLikeKey(key: string) {
  const normalized = key.toLowerCase();

  return (
    normalized === 'phone' ||
    normalized === 'phone_number' ||
    normalized === 'tel'
  );
}

function jsonRecord(value: Prisma.JsonValue | null) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function booleanValue(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      return true;
    }

    if (['0', 'false', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

function positiveInt(value: unknown, fallback: number, max: number) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(Math.floor(parsed), max);
}

function nullableString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function decimalToNumber(value: Prisma.Decimal | number | string) {
  return Number(value.toString());
}

function decimalToNullableNumber(
  value: Prisma.Decimal | number | string | null,
) {
  return value === null ? null : decimalToNumber(value);
}

function toDecimal(value: Prisma.Decimal | number | string) {
  return new Prisma.Decimal(value.toString());
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength
    ? `${value.slice(0, maxLength - 3)}...`
    : value;
}

function clean<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, entry]) => entry !== undefined && entry !== null,
    ),
  );
}

function jsonValue(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined) {
    return Prisma.JsonNull;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}
