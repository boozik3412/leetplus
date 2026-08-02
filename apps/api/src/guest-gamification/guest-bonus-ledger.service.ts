import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IntegrationProvider,
  Prisma,
  TenantLifecycleStatus,
  TenantModule,
  UserRole,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { LangameClient } from '../integrations/langame.client';
import { LangameSettingsService } from '../integrations/langame-settings.service';
import { SecretEncryptionService } from '../integrations/secret-encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  TenantExecutionAdmissionService,
  type TenantExecutionAdmissionDecision,
  type TenantExecutionPermit,
  type TenantExecutionRequirement,
} from '../tenancy/tenant-execution-admission.service';
import {
  evaluateTenantBackgroundExecutionPolicy,
  tenantBackgroundExecutionNote,
  tenantBackgroundStageForCustomerStage,
  type TenantBackgroundExecutionPolicyDecision,
} from '../tenancy/tenant-background-execution-policy';
import {
  evaluateLegacyGuestGameDeliveryProtocolGate,
  isLegacyGuestGameProviderDeliveryChannel,
} from './guest-game-delivery-protocol-gate';

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
const guestPortalExternalDomain = 'leetplus-guest-portal';
const guestPortalExternalDomains = new Set([guestPortalExternalDomain]);
const staffTestProfileErrorCode = 'STAFF_TEST_PROFILE';
const staffTestProfileReasons = {
  staffPhone: 'STAFF_PHONE_MATCH',
  langameStaffPhone: 'LANGAME_STAFF_PHONE_MATCH',
} as const;
const staffTestRewardAccrualEnabledEnv =
  'GUEST_GAME_STAFF_TEST_REWARD_ACCRUAL_ENABLED';
const bonusLedgerOutboundRequirements = [
  {
    module: TenantModule.GAMIFICATION,
    action: 'OUTBOUND',
  },
  {
    module: TenantModule.INTEGRATIONS,
    action: 'OUTBOUND',
  },
] as const satisfies readonly TenantExecutionRequirement[];

type BonusLedgerMode = 'DISABLED' | 'DRY_RUN' | 'READY';
type BonusLedgerItemStatus =
  | 'QUEUED'
  | 'DRY_RUN'
  | 'CONFIRMED'
  | 'FAILED'
  | 'SKIPPED'
  | 'CANCELED'
  | 'RECONCILIATION_REQUIRED'
  | 'BLOCKED';
type LangameBalanceType = 'balance' | 'bonus_balance';

export type GuestGameBonusLedgerQueueDto = {
  rewardTypes?: string[] | string | null;
  limit?: number | string | null;
  storeId?: string | null;
  rewardId?: string | null;
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

export type GuestGameBonusLedgerReconciliationOutcome =
  | 'CONFIRMED'
  | 'NOT_APPLIED';

export type GuestGameBonusLedgerReconciliationResolveDto = {
  outcome?: string | null;
  note?: string | null;
  confirmation?: boolean | string | null;
};

export type GuestGameBonusLedgerReconciliationResolveResult =
  GuestGameBonusLedgerDispatchItem & {
    outcome: GuestGameBonusLedgerReconciliationOutcome;
    resolvedAt: string;
    operatorNote: string;
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
  protocolBlockedDeliveries?: number;
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
  rewardId: string | null;
  limit: number;
  maxAttempts: number;
  retryMinutes: number;
  staleLockMinutes: number;
  staffTestRewardAccrualEnabled: boolean;
  executionRevision: number | null;
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
  claimGeneration: number;
  lockedAt: Date | null;
  executionRevision: number | null;
  reason: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
};

type StaleDispatchingBonusLedgerEntry = {
  id: string;
  tenantId: string;
  rewardId: string | null;
  status: string;
  attempts: number;
  claimGeneration: number;
  lockedAt: Date | null;
  updatedAt: Date;
  errorCode: string | null;
  errorMessage: string | null;
  metadata: Prisma.JsonValue | null;
};

type TenantAccess = Awaited<
  ReturnType<LangameSettingsService['resolveTenantAccess']>
>;

type BonusLedgerDeliveryRevalidation = {
  ready: boolean;
  status: 'BLOCKED' | 'CANCELED' | null;
  note: string | null;
};

type BonusLedgerReconciliationAudit = {
  outcome: GuestGameBonusLedgerReconciliationOutcome;
  note: string;
  confirmation: true;
  actorUserId: string;
  resolvedAt: string;
  previousStatus: 'RECONCILIATION_REQUIRED';
  previousErrorCode: string | null;
  previousErrorMessage: string | null;
  previousAttempts: number;
};

function bonusLedgerRewardDeliveryGate(
  now: Date,
  claimExpiresAtField: Prisma.GuestGameRewardFieldRefs['claimExpiresAt'],
): Prisma.GuestGameRewardWhereInput {
  return {
    OR: [
      {
        claimRequired: false,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      {
        claimRequired: true,
        deliveryRequestedAt: {
          not: null,
          lt: claimExpiresAtField,
        },
        claimExpiresAt: { not: null },
        walletItems: {
          some: {
            kind: 'REWARD',
            status: { in: ['PROCESSING', 'FAILED'] },
          },
        },
      },
    ],
  };
}

function acceptedRewardClaimBeforeDeadline(reward: {
  claimRequired: boolean;
  deliveryRequestedAt: Date | null;
  claimExpiresAt: Date | null;
}) {
  if (!reward.claimRequired) {
    return true;
  }

  return Boolean(
    reward.deliveryRequestedAt &&
    reward.claimExpiresAt &&
    reward.deliveryRequestedAt.getTime() < reward.claimExpiresAt.getTime(),
  );
}

@Injectable()
export class GuestBonusLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly langameClient: LangameClient,
    private readonly langameSettingsService: LangameSettingsService,
    private readonly secretEncryptionService: SecretEncryptionService,
    private readonly tenantExecutionAdmission: TenantExecutionAdmissionService,
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
      processing:
        (counts.get('PROCESSING') ?? 0) +
        (counts.get('DISPATCHING') ?? 0) +
        (counts.get('RECONCILIATION_REQUIRED') ?? 0),
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
    const rewardTypes = this.resolveRewardTypes(dto.rewardTypes).filter(
      isLangameBalanceRewardType,
    );
    const storeId = nullableString(dto.storeId);
    const rewardId = nullableString(dto.rewardId);
    const limit = positiveInt(dto.limit, 500, 1000);
    const staffTestRewardAccrualEnabled =
      this.isStaffTestRewardAccrualEnabled();
    const now = new Date();

    if (rewardTypes.length === 0) {
      return {
        checkedRewards: 0,
        queued: 0,
        skipped: 0,
        rewardTypes: [],
        items: [],
        note: 'Для этой награды нет автоматического начисления через Langame balance API.',
      };
    }

    const rewards = await this.prisma.guestGameReward.findMany({
      where: {
        tenantId: user.tenantId,
        status: 'APPROVED',
        ...(storeId ? { storeId } : {}),
        ...(rewardId ? { id: rewardId } : {}),
        rewardAmount: { gt: 0 },
        OR: rewardTypes.map((type) => ({
          rewardType: { equals: type, mode: 'insensitive' as const },
        })),
        AND: [
          bonusLedgerRewardDeliveryGate(
            now,
            this.prisma.guestGameReward.fields.claimExpiresAt,
          ),
        ],
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
        profile: {
          select: {
            phoneEncrypted: true,
            contactMasked: true,
            isStaffTest: true,
            staffTestReason: true,
          },
        },
        store: {
          select: {
            externalDomain: true,
            integrationSource: {
              select: {
                provider: true,
                domain: true,
                isActive: true,
              },
            },
          },
        },
      },
      orderBy: [{ qualifiedAt: 'asc' }, { createdAt: 'asc' }],
      take: limit,
    });
    const items: GuestGameBonusLedgerQueueItem[] = [];
    const data: Prisma.GuestBonusLedgerEntryCreateManyInput[] = [];
    const staffTestRewardIds: string[] = [];

    for (const reward of rewards) {
      const externalGuestId =
        nullableString(reward.guestExternalId) ??
        nullableString(reward.guest?.externalGuestId);
      const externalDomain =
        langameExternalDomain(reward.externalDomain) ??
        langameExternalDomain(reward.guest?.externalDomain) ??
        this.resolveStoreLangameDomain(reward.store);
      const externalProvider =
        reward.externalProvider ??
        reward.guest?.externalProvider ??
        IntegrationProvider.LANGAME;
      const amount = decimalToNumber(reward.rewardAmount);
      const phone =
        this.resolveEncryptedPhone(reward.guest) ??
        this.resolveEncryptedPhone(reward.profile);
      const balanceType = langameBalanceTypeForRewardType(reward.rewardType);
      const staffTestReason = reward.profile?.isStaffTest
        ? (reward.profile.staffTestReason ?? staffTestProfileReasons.staffPhone)
        : phone
          ? await this.resolveStaffTestReason(user.tenantId, phone.value)
          : null;

      if (staffTestReason) {
        if (reward.profileId) {
          await this.markProfileStaffTest(
            user.tenantId,
            reward.profileId,
            staffTestReason,
          );
        }
        if (!staffTestRewardAccrualEnabled) {
          staffTestRewardIds.push(reward.id);
          items.push({
            rewardId: reward.id,
            status: 'SKIPPED',
            reason:
              'Профиль определен как тест сотрудника; автоначисление в Langame заблокировано.',
            externalDomain,
            externalGuestId,
            amount,
          });
          continue;
        }
      }

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
        createdByUserId: ledgerActorUserId(user),
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
          ...(staffTestReason && staffTestRewardAccrualEnabled
            ? {
                staffTestReason,
                staffTestAccrualOverride: true,
                staffTestRewardAccrualEnabled: true,
                staffTestRewardAccrualEnv: staffTestRewardAccrualEnabledEnv,
              }
            : {}),
        },
      });
      items.push({
        rewardId: reward.id,
        status: 'QUEUED',
        reason:
          staffTestReason && staffTestRewardAccrualEnabled
            ? 'Staff/test награда поставлена в ledger: автоначисление разрешено для всех профилей.'
            : null,
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

    if (staffTestRewardIds.length > 0) {
      await this.cancelStaffTestRewards(user.tenantId, staffTestRewardIds);
    }

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

    if (config.dryRun) {
      const preview = await this.previewPendingEntries(user.tenantId, config);
      const status = await this.getStatus(user, dto);

      return {
        mode: 'DRY_RUN',
        dryRun: true,
        canary: config.canary,
        ready: config.ready,
        queued: null,
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

    const permitAcquisition = await this.tenantExecutionAdmission.acquirePermit(
      user.tenantId,
      bonusLedgerOutboundRequirements,
    );
    if (!permitAcquisition.permit) {
      const status = await this.getStatus(user, dto);

      return {
        mode: config.mode,
        dryRun: false,
        canary: config.canary,
        ready: config.ready,
        queued: null,
        checked: 0,
        confirmed: 0,
        failed: 0,
        skipped: 0,
        blocked: status.pending + status.failed,
        items: [],
        status,
        note: tenantExecutionAdmissionNote(permitAcquisition.decision),
      };
    }

    const backgroundExecution = evaluateTenantBackgroundExecutionPolicy({
      stage: tenantBackgroundStageForCustomerStage(
        permitAcquisition.decision.customerStage,
      ),
      jobKind: 'GUEST_BONUS_LEDGER_LANGAME',
    });
    if (!backgroundExecution.allowed) {
      const status = await this.getStatus(user, dto);

      return {
        mode: config.mode,
        dryRun: false,
        canary: config.canary,
        ready: config.ready,
        queued: null,
        checked: 0,
        confirmed: 0,
        failed: 0,
        skipped: 0,
        blocked: status.pending + status.failed,
        items: [],
        status,
        note: tenantBackgroundExecutionNote(backgroundExecution),
      };
    }

    const queued = shouldQueue
      ? await this.queueApprovedRewards(user, dto)
      : null;

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

    const dispatchConfig: BonusLedgerConfig = {
      ...config,
      executionRevision: permitAcquisition.permit.executionRevision,
    };
    const actorUserId = ledgerActorUserId(user);
    await this.promoteStaleDispatchingEntries(
      user.tenantId,
      actorUserId,
      dispatchConfig,
    );
    const entries = await this.claimReadyEntries(user.tenantId, dispatchConfig);
    const items: GuestGameBonusLedgerDispatchItem[] = [];

    for (const entry of entries) {
      items.push(
        await this.processClaimedEntry(actorUserId, entry, dispatchConfig),
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
      failed: items.filter((item) =>
        ['FAILED', 'RECONCILIATION_REQUIRED'].includes(item.status),
      ).length,
      skipped: items.filter((item) =>
        ['SKIPPED', 'CANCELED'].includes(item.status),
      ).length,
      blocked: items.filter((item) => item.status === 'BLOCKED').length,
      items,
      status,
      note: dispatchNote,
    };
  }

  async resolveReconciliation(
    user: Pick<AuthenticatedUser, 'id' | 'tenantId'>,
    id: string,
    dto: GuestGameBonusLedgerReconciliationResolveDto,
  ): Promise<GuestGameBonusLedgerReconciliationResolveResult> {
    const outcome = nullableString(dto?.outcome)?.toUpperCase();
    if (outcome !== 'CONFIRMED' && outcome !== 'NOT_APPLIED') {
      throw new BadRequestException(
        'Укажите итог сверки: CONFIRMED или NOT_APPLIED.',
      );
    }
    const note = nullableString(dto?.note);
    if (!note) {
      throw new BadRequestException(
        'Для ручного разрешения сверки обязателен комментарий оператора.',
      );
    }
    if (!booleanValue(dto?.confirmation, false)) {
      throw new BadRequestException(
        'Ручное разрешение сверки требует явного подтверждения.',
      );
    }

    const resolvedAt = new Date();
    const rowHint = await this.prisma.guestBonusLedgerEntry.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
      },
      select: { rewardId: true },
    });
    if (!rowHint) {
      throw new BadRequestException('Ledger-запись не найдена.');
    }

    return this.prisma.$transaction(async (tx) => {
      if (rowHint.rewardId) {
        await tx.$queryRaw(Prisma.sql`
          SELECT "id"
          FROM "GuestGameReward"
          WHERE "id" = ${rowHint.rewardId}
            AND "tenantId" = ${user.tenantId}
          FOR UPDATE
        `);
      }
      await tx.$queryRaw(Prisma.sql`
        SELECT "id"
        FROM "GuestBonusLedgerEntry"
        WHERE "id" = ${id}
          AND "tenantId" = ${user.tenantId}
        FOR UPDATE
      `);
      const entry = await tx.guestBonusLedgerEntry.findFirst({
        where: {
          id,
          tenantId: user.tenantId,
        },
      });

      if (!entry) {
        throw new BadRequestException('Ledger-запись не найдена.');
      }
      if (entry.rewardId !== rowHint.rewardId) {
        throw new BadRequestException(
          'Связь ledger-записи с наградой изменилась. Обновите страницу.',
        );
      }
      if (entry.status !== 'RECONCILIATION_REQUIRED') {
        throw new BadRequestException(
          'Ручное разрешение доступно только для ledger-записи в статусе RECONCILIATION_REQUIRED.',
        );
      }
      if (outcome === 'NOT_APPLIED') {
        this.assertReconciliationQuarantineElapsed(entry, resolvedAt);
      }

      const audit: BonusLedgerReconciliationAudit = {
        outcome,
        note: truncate(note, 1000),
        confirmation: true,
        actorUserId: user.id,
        resolvedAt: resolvedAt.toISOString(),
        previousStatus: 'RECONCILIATION_REQUIRED',
        previousErrorCode: entry.errorCode,
        previousErrorMessage: entry.errorMessage,
        previousAttempts: entry.attempts,
      };
      const metadata = {
        ...jsonRecord(entry.metadata),
        reconciliationResolution: audit,
      };

      if (outcome === 'CONFIRMED') {
        await this.confirmEntryInTransaction(
          tx,
          user.id,
          entry,
          entry.langameRequest ?? {},
          {
            operatorResolution: audit,
            previousLangameResponse: entry.langameResponse ?? null,
          },
          'RECONCILIATION_REQUIRED',
          metadata,
          audit,
          resolvedAt,
        );
      } else {
        await this.markReconciliationNotAppliedInTransaction(
          tx,
          user,
          entry,
          metadata,
          note,
          resolvedAt,
        );
      }

      return {
        ledgerEntryId: entry.id,
        rewardId: entry.rewardId,
        status: outcome === 'CONFIRMED' ? 'CONFIRMED' : 'FAILED',
        amount: decimalToNumber(entry.amount),
        externalDomain: entry.externalDomain,
        externalGuestId: entry.externalGuestId,
        note,
        outcome,
        resolvedAt: resolvedAt.toISOString(),
        operatorNote: note,
      };
    });
  }

  async cancelEntry(
    user: Pick<AuthenticatedUser, 'id' | 'tenantId'>,
    id: string,
    dto: GuestGameBonusLedgerCancelDto = {},
  ): Promise<GuestGameBonusLedgerDispatchItem> {
    const reason = nullableString(dto.reason) ?? 'Отменено вручную.';
    const rowHint = await this.prisma.guestBonusLedgerEntry.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { rewardId: true },
    });

    if (!rowHint) {
      throw new BadRequestException('Ledger-запись не найдена.');
    }

    const config = this.resolveConfig();
    const deliveryProtocolGate =
      evaluateLegacyGuestGameDeliveryProtocolGate('LEGACY_PROVIDER_REVOKE');
    const result = await this.prisma.$transaction(async (tx) => {
      // Match the worker lock order (reward -> ledger). The pre-read is only
      // a lock-order hint; all authorization and status decisions use the
      // row fetched again under FOR UPDATE.
      if (rowHint.rewardId) {
        await tx.$queryRaw(Prisma.sql`
          SELECT "id"
          FROM "GuestGameReward"
          WHERE "id" = ${rowHint.rewardId}
            AND "tenantId" = ${user.tenantId}
          FOR UPDATE
        `);
      }
      await tx.$queryRaw(Prisma.sql`
        SELECT "id"
        FROM "GuestBonusLedgerEntry"
        WHERE "id" = ${id}
          AND "tenantId" = ${user.tenantId}
        FOR UPDATE
      `);
      const row = await tx.guestBonusLedgerEntry.findFirst({
        where: { id, tenantId: user.tenantId },
      });
      if (!row) {
        throw new BadRequestException('Ledger-запись не найдена.');
      }
      if (row.rewardId !== rowHint.rewardId) {
        throw new BadRequestException(
          'Связь ledger-записи с наградой изменилась. Обновите страницу.',
        );
      }
      if (row.status === 'CONFIRMED') {
        throw new BadRequestException(
          'Подтвержденную ledger-запись нельзя отменить без обратной операции.',
        );
      }
      if (
        row.status === 'DISPATCHING' ||
        row.status === 'RECONCILIATION_REQUIRED' ||
        (row.status === 'PROCESSING' &&
          bonusLedgerLockIsFresh(row.lockedAt, config.staleLockMinutes))
      ) {
        throw new BadRequestException(
          'Ledger-запись сейчас обрабатывается worker-ом. Дождитесь завершения или протухания lock перед отменой.',
        );
      }
      if (row.rewardId) {
        const acceptedWalletDelivery = await tx.guestGameReward.findFirst({
          where: {
            id: row.rewardId,
            tenantId: user.tenantId,
            claimRequired: true,
            deliveryRequestedAt: { not: null },
            walletItems: {
              some: {
                kind: 'REWARD',
                status: { in: ['PROCESSING', 'FAILED'] },
              },
            },
          },
          select: { id: true },
        });
        if (acceptedWalletDelivery) {
          throw new BadRequestException(
            'Награда уже принята гостем и ожидает сверки выдачи. Отмена запрещена.',
          );
        }
      }

      const canceledAt = new Date();
      const canceledEntry = await tx.guestBonusLedgerEntry.updateMany({
        where: {
          id,
          tenantId: user.tenantId,
          status: row.status,
          ...(row.status === 'PROCESSING' ? { lockedAt: row.lockedAt } : {}),
        },
        data: {
          status: 'CANCELED',
          processedByUserId: user.id,
          canceledAt,
          lockedAt: null,
          nextAttemptAt: null,
          errorMessage: reason,
        },
      });
      if (canceledEntry.count !== 1) {
        throw new BadRequestException(
          'Состояние ledger-записи изменилось. Обновите страницу.',
        );
      }

      if (!row.rewardId) {
        return {
          row,
          canceled: { rewards: 0, deliveries: 0, protocolBlocked: 0 },
        };
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
      let protocolBlockedDeliveryCount = 0;

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
          if (
            !deliveryProtocolGate.allowed &&
            isLegacyGuestGameProviderDeliveryChannel(delivery.channel)
          ) {
            protocolBlockedDeliveryCount += 1;
            continue;
          }

          const updated = await tx.guestGameDelivery.updateMany({
            where: {
              id: delivery.id,
              tenantId: user.tenantId,
              status: { notIn: ['SENT', 'CANCELED'] },
            },
            data: {
              status: 'CANCELED',
              stateReasonCode: 'BONUS_LEDGER_CANCELED',
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
              stateReasonCode: 'BONUS_LEDGER_CANCELED',
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

      return {
        row,
        canceled: {
          rewards: rewards.count,
          deliveries: deliveryCount,
          protocolBlocked: protocolBlockedDeliveryCount,
        },
      };
    });

    return {
      ledgerEntryId: result.row.id,
      rewardId: result.row.rewardId,
      status: 'CANCELED',
      amount: decimalToNumber(result.row.amount),
      externalDomain: result.row.externalDomain,
      externalGuestId: result.row.externalGuestId,
      protocolBlockedDeliveries: result.canceled.protocolBlocked,
      note: bonusLedgerCancelNote(reason, result.canceled),
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
            accessScope: 'NETWORK',
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

      const admission = await this.tenantExecutionAdmission.evaluate(
        tenant.id,
        bonusLedgerOutboundRequirements,
      );
      if (!admission.allowed) {
        tenantResults.push({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          status: 'SKIPPED',
          reason: tenantExecutionAdmissionNote(admission),
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
    const now = new Date();

    return this.prisma.guestGameReward.count({
      where: {
        tenantId,
        status: 'APPROVED',
        ...(storeId ? { storeId } : {}),
        rewardAmount: { gt: 0 },
        OR: rewardTypes.map((type) => ({
          rewardType: { equals: type, mode: 'insensitive' as const },
        })),
        AND: [
          bonusLedgerRewardDeliveryGate(
            now,
            this.prisma.guestGameReward.fields.claimExpiresAt,
          ),
          {
            OR: [
              { profileId: null },
              { profile: { is: { isStaffTest: false } } },
            ],
          },
        ],
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
    const now = new Date();

    return this.prisma.guestBonusLedgerEntry.findMany({
      where: {
        tenantId,
        ...(config.storeId ? { storeId: config.storeId } : {}),
        ...(config.rewardId ? { rewardId: config.rewardId } : {}),
        status: { in: ['PENDING', 'FAILED'] },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        AND: [
          {
            OR: [
              { source: { not: 'GAMIFICATION_REWARD' } },
              {
                reward: {
                  is: bonusLedgerRewardDeliveryGate(
                    now,
                    this.prisma.guestGameReward.fields.claimExpiresAt,
                  ),
                },
              },
            ],
          },
        ],
      },
      orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
      take: config.limit,
    });
  }

  private async promoteStaleDispatchingEntries(
    tenantId: string,
    actorUserId: string | null,
    config: BonusLedgerConfig,
  ) {
    const promotedAt = new Date();
    const cutoff = new Date(
      promotedAt.getTime() - config.staleLockMinutes * 60 * 1000,
    );
    const storeFilter = config.storeId
      ? Prisma.sql`AND ledger."storeId" = ${config.storeId}`
      : Prisma.empty;
    const rewardFilter = config.rewardId
      ? Prisma.sql`AND ledger."rewardId" = ${config.rewardId}`
      : Prisma.empty;
    const limit = Math.max(config.limit, 100);

    return this.prisma.$transaction(async (tx) => {
      const candidates = await tx.$queryRaw<StaleDispatchingBonusLedgerEntry[]>(
        Prisma.sql`
          SELECT
            ledger."id",
            ledger."tenantId",
            ledger."rewardId",
            ledger."status",
            ledger."attempts",
            ledger."claimGeneration",
            ledger."lockedAt",
            ledger."updatedAt",
            ledger."errorCode",
            ledger."errorMessage",
            ledger."metadata"
          FROM "GuestBonusLedgerEntry" AS ledger
          WHERE ledger."tenantId" = ${tenantId}
            AND ledger."status" = 'DISPATCHING'
            ${storeFilter}
            ${rewardFilter}
            AND GREATEST(
              COALESCE(ledger."lockedAt", ledger."createdAt"),
              ledger."updatedAt"
            ) <= ${cutoff}
          ORDER BY
            GREATEST(
              COALESCE(ledger."lockedAt", ledger."createdAt"),
              ledger."updatedAt"
            ),
            ledger."id"
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        `,
      );
      let promoted = 0;

      for (const candidate of candidates) {
        if (
          candidate.status !== 'DISPATCHING' ||
          !(candidate.updatedAt instanceof Date)
        ) {
          continue;
        }
        const latestActivityAt = new Date(
          Math.max(
            new Date(candidate.updatedAt).getTime(),
            candidate.lockedAt
              ? new Date(candidate.lockedAt).getTime()
              : Number.NEGATIVE_INFINITY,
          ),
        );
        // Keep a defensive freshness check even though the SQL predicate
        // already filters candidates. It protects tests/mocks and any future
        // query refactor from promoting a live provider request.
        if (latestActivityAt.getTime() > cutoff.getTime()) {
          continue;
        }

        const audit = {
          promotedAt: promotedAt.toISOString(),
          promotedByUserId: actorUserId,
          previousStatus: 'DISPATCHING',
          previousLockedAt: candidate.lockedAt?.toISOString() ?? null,
          previousUpdatedAt: candidate.updatedAt.toISOString(),
          previousErrorCode: candidate.errorCode,
          previousErrorMessage: candidate.errorMessage,
          attempts: candidate.attempts,
          claimGeneration: candidate.claimGeneration,
          staleThresholdMinutes: config.staleLockMinutes,
          reason: 'DISPATCH_CRASH_OR_HTTP_OUTCOME_UNKNOWN',
        };
        const updated = await tx.guestBonusLedgerEntry.updateMany({
          where: {
            id: candidate.id,
            tenantId,
            status: 'DISPATCHING',
            attempts: candidate.attempts,
            claimGeneration: candidate.claimGeneration,
            lockedAt: candidate.lockedAt,
            updatedAt: candidate.updatedAt,
          },
          data: {
            status: 'RECONCILIATION_REQUIRED',
            processedByUserId: actorUserId,
            lockedAt: null,
            failedAt: promotedAt,
            nextAttemptAt: null,
            errorCode: 'STALE_DISPATCH_OUTCOME_UNKNOWN',
            errorMessage:
              'Dispatch завис в момент внешней записи. Автоповтор запрещён до ручной сверки.',
            metadata: {
              ...jsonRecord(candidate.metadata),
              staleDispatchPromotion: audit,
            },
          },
        });
        promoted += updated.count;
      }

      return promoted;
    });
  }

  private async claimReadyEntries(
    tenantId: string,
    config: BonusLedgerConfig,
  ): Promise<ClaimedBonusLedgerEntry[]> {
    if (
      !Number.isSafeInteger(config.executionRevision) ||
      (config.executionRevision ?? 0) < 1
    ) {
      throw new BadRequestException(
        'Bonus ledger claim requires a current tenant execution revision',
      );
    }

    const storeFilter = config.storeId
      ? Prisma.sql`AND candidate."storeId" = ${config.storeId}`
      : Prisma.empty;
    const rewardFilter = config.rewardId
      ? Prisma.sql`AND candidate."rewardId" = ${config.rewardId}`
      : Prisma.empty;

    return this.prisma.$queryRaw<ClaimedBonusLedgerEntry[]>(Prisma.sql`
      UPDATE "GuestBonusLedgerEntry" AS ledger
      SET
        "status" = 'PROCESSING',
        "lockedAt" = NOW(),
        "processedAt" = NOW(),
        "attempts" = "attempts" + 1,
        "claimGeneration" = "claimGeneration" + 1,
        "executionRevision" = ${config.executionRevision},
        "updatedAt" = NOW()
      WHERE ledger."id" IN (
        SELECT candidate."id"
        FROM "GuestBonusLedgerEntry" AS candidate
        WHERE candidate."tenantId" = ${tenantId}
          ${storeFilter}
          ${rewardFilter}
          AND (
            candidate."status" = 'PENDING'
            OR (
              candidate."status" = 'FAILED'
              AND candidate."attempts" < ${config.maxAttempts}
              AND (
                candidate."nextAttemptAt" IS NULL
                OR candidate."nextAttemptAt" <= NOW()
              )
            )
            OR (
              candidate."status" = 'PROCESSING'
              AND candidate."attempts" < ${config.maxAttempts}
              AND candidate."lockedAt" < NOW() - (${config.staleLockMinutes} * INTERVAL '1 minute')
            )
            OR (
              candidate."status" = 'FAILED'
              AND candidate."attempts" >= ${config.maxAttempts}
              AND candidate."externalDomain" = ${guestPortalExternalDomain}
              AND candidate."errorMessage" ILIKE ${`%${guestPortalExternalDomain}%`}
            )
            OR (
              candidate."status" = 'FAILED'
              AND candidate."attempts" >= ${config.maxAttempts}
              AND candidate."source" = 'GAMIFICATION_REWARD'
              AND EXISTS (
                SELECT 1
                FROM "GuestGameRewardWalletItem" AS retry_wallet
                WHERE retry_wallet."tenantId" = candidate."tenantId"
                  AND retry_wallet."rewardId" = candidate."rewardId"
                  AND retry_wallet."kind" = 'REWARD'
                  AND retry_wallet."status" = 'PROCESSING'
              )
            )
          )
          AND (
            candidate."source" <> 'GAMIFICATION_REWARD'
            OR EXISTS (
              SELECT 1
              FROM "GuestGameReward" AS reward
              WHERE reward."id" = candidate."rewardId"
                AND reward."tenantId" = candidate."tenantId"
                AND reward."status" = 'APPROVED'
                AND (
                  (
                    reward."claimRequired" = FALSE
                    AND (
                      reward."expiresAt" IS NULL
                      OR reward."expiresAt" > NOW()
                    )
                  )
                  OR (
                    reward."claimRequired" = TRUE
                    AND reward."deliveryRequestedAt" IS NOT NULL
                    AND reward."claimExpiresAt" IS NOT NULL
                    AND reward."deliveryRequestedAt" < reward."claimExpiresAt"
                    AND EXISTS (
                      SELECT 1
                      FROM "GuestGameRewardWalletItem" AS wallet
                      WHERE wallet."tenantId" = reward."tenantId"
                        AND wallet."rewardId" = reward."id"
                        AND wallet."kind" = 'REWARD'
                        AND wallet."status" IN ('PROCESSING', 'FAILED')
                    )
                  )
                )
            )
          )
        ORDER BY
          COALESCE(candidate."nextAttemptAt", candidate."createdAt"),
          candidate."createdAt"
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
        "claimGeneration",
        "lockedAt",
        "executionRevision",
        "reason",
        "metadata",
        "createdAt"
    `);
  }

  private async processClaimedEntry(
    actorUserId: string | null,
    entry: ClaimedBonusLedgerEntry,
    config: BonusLedgerConfig,
  ): Promise<GuestGameBonusLedgerDispatchItem> {
    let sourcedEntry = entry;
    let dispatchStarted = false;
    let dispatchLockedAt: Date | null = null;

    try {
      const executionPermit = this.executionPermitForEntry(sourcedEntry);
      const phone = await this.resolveEntryPhone(sourcedEntry);
      let staffTestReason = await this.resolveEntryStaffTestReason(
        sourcedEntry,
        phone.value,
      );

      if (staffTestReason && config.staffTestRewardAccrualEnabled === false) {
        const canceled = await this.cancelStaffTestEntry(
          actorUserId,
          sourcedEntry,
          staffTestReason,
        );

        if (!canceled) {
          return {
            ledgerEntryId: sourcedEntry.id,
            rewardId: sourcedEntry.rewardId,
            status: 'BLOCKED',
            amount: decimalToNumber(sourcedEntry.amount),
            externalDomain: sourcedEntry.externalDomain,
            externalGuestId: sourcedEntry.externalGuestId,
            note: 'Ledger-запись уже была повторно захвачена или изменилась; поздняя отмена тестовой награды не применена.',
          };
        }

        return {
          ledgerEntryId: sourcedEntry.id,
          rewardId: sourcedEntry.rewardId,
          status: 'CANCELED',
          amount: decimalToNumber(sourcedEntry.amount),
          externalDomain: sourcedEntry.externalDomain,
          externalGuestId: sourcedEntry.externalGuestId,
          note: staffTestLedgerNote(),
        };
      }

      const payload = this.buildLangamePayload(sourcedEntry, phone.value);
      const auditPayload = {
        ...this.buildLangameAuditPayload(payload, phone.masked),
        ...(staffTestReason && config.staffTestRewardAccrualEnabled !== false
          ? {
              staffTestReason,
              staffTestAccrualOverride: true,
              staffTestRewardAccrualEnabled: true,
              staffTestRewardAccrualEnv: staffTestRewardAccrualEnabledEnv,
            }
          : {}),
      };
      const delivery = await this.revalidateClaimedEntryForDelivery(
        actorUserId,
        sourcedEntry,
      );

      if (!delivery.ready) {
        return {
          ledgerEntryId: sourcedEntry.id,
          rewardId: sourcedEntry.rewardId,
          status: delivery.status ?? 'BLOCKED',
          amount: decimalToNumber(sourcedEntry.amount),
          externalDomain: sourcedEntry.externalDomain,
          externalGuestId: sourcedEntry.externalGuestId,
          note:
            delivery.note ?? 'Награда больше не готова к внешнему начислению.',
        };
      }

      dispatchLockedAt = new Date();
      dispatchStarted = await this.markEntryDispatching(
        actorUserId,
        sourcedEntry,
        auditPayload,
        dispatchLockedAt,
      );
      if (!dispatchStarted) {
        return {
          ledgerEntryId: sourcedEntry.id,
          rewardId: sourcedEntry.rewardId,
          status: 'BLOCKED',
          amount: decimalToNumber(sourcedEntry.amount),
          externalDomain: sourcedEntry.externalDomain,
          externalGuestId: sourcedEntry.externalGuestId,
          note: 'Ledger-запись не перешла в стадию отправки. Внешнее начисление не выполнялось.',
        };
      }

      const dispatchingDelivery = await this.revalidateClaimedEntryForDelivery(
        actorUserId,
        sourcedEntry,
        'DISPATCHING',
        dispatchLockedAt,
      );
      if (!dispatchingDelivery.ready) {
        return {
          ledgerEntryId: sourcedEntry.id,
          rewardId: sourcedEntry.rewardId,
          status: dispatchingDelivery.status ?? 'BLOCKED',
          amount: decimalToNumber(sourcedEntry.amount),
          externalDomain: sourcedEntry.externalDomain,
          externalGuestId: sourcedEntry.externalGuestId,
          note:
            dispatchingDelivery.note ??
            'Награда больше не готова к внешнему начислению.',
        };
      }

      let dispatchingPhone: Awaited<
        ReturnType<GuestBonusLedgerService['resolveEntryPhone']>
      >;
      try {
        dispatchingPhone = await this.resolveEntryPhone(sourcedEntry);
      } catch (error) {
        await this.returnDispatchingEntryAfterTargetChange(
          actorUserId,
          sourcedEntry,
          dispatchLockedAt,
          errorMessage(error),
        );

        return {
          ledgerEntryId: sourcedEntry.id,
          rewardId: sourcedEntry.rewardId,
          status: 'BLOCKED',
          amount: decimalToNumber(sourcedEntry.amount),
          externalDomain: sourcedEntry.externalDomain,
          externalGuestId: sourcedEntry.externalGuestId,
          note: 'Телефон получателя изменился или больше недоступен после начала dispatch; Langame не вызывался.',
        };
      }
      if (dispatchingPhone.value !== phone.value) {
        await this.returnDispatchingEntryAfterTargetChange(
          actorUserId,
          sourcedEntry,
          dispatchLockedAt,
          'Normalized Langame phone target changed after DISPATCHING.',
        );

        return {
          ledgerEntryId: sourcedEntry.id,
          rewardId: sourcedEntry.rewardId,
          status: 'BLOCKED',
          amount: decimalToNumber(sourcedEntry.amount),
          externalDomain: sourcedEntry.externalDomain,
          externalGuestId: sourcedEntry.externalGuestId,
          note: 'Телефон получателя изменился после начала dispatch; Langame не вызывался.',
        };
      }

      staffTestReason = await this.resolveEntryStaffTestReason(
        sourcedEntry,
        dispatchingPhone.value,
      );
      if (staffTestReason && config.staffTestRewardAccrualEnabled === false) {
        const canceled = await this.cancelStaffTestEntry(
          actorUserId,
          sourcedEntry,
          staffTestReason,
          'DISPATCHING',
          dispatchLockedAt,
        );

        return {
          ledgerEntryId: sourcedEntry.id,
          rewardId: sourcedEntry.rewardId,
          status: canceled ? 'CANCELED' : 'BLOCKED',
          amount: decimalToNumber(sourcedEntry.amount),
          externalDomain: sourcedEntry.externalDomain,
          externalGuestId: sourcedEntry.externalGuestId,
          note: canceled
            ? staffTestLedgerNote()
            : 'Ledger-запись уже была повторно захвачена или изменилась; поздняя отмена тестовой награды не применена.',
        };
      }

      const access = await this.langameSettingsService.resolveTenantAccess(
        sourcedEntry.tenantId,
      );
      const source = await this.resolveEntrySource(sourcedEntry, access);
      sourcedEntry = this.withResolvedEntrySource(sourcedEntry, source.domain);

      const outboundAdmission =
        await this.tenantExecutionAdmission.evaluatePermit(executionPermit);
      if (!outboundAdmission.allowed) {
        await this.returnDispatchingEntryAfterAdmissionDenial(
          actorUserId,
          sourcedEntry,
          outboundAdmission,
          dispatchLockedAt,
        );

        return {
          ledgerEntryId: sourcedEntry.id,
          rewardId: sourcedEntry.rewardId,
          status: 'BLOCKED',
          amount: decimalToNumber(sourcedEntry.amount),
          externalDomain: sourcedEntry.externalDomain,
          externalGuestId: sourcedEntry.externalGuestId,
          note: tenantExecutionAdmissionNote(outboundAdmission),
        };
      }

      const backgroundExecution = evaluateTenantBackgroundExecutionPolicy({
        stage: tenantBackgroundStageForCustomerStage(
          outboundAdmission.customerStage,
        ),
        jobKind: 'GUEST_BONUS_LEDGER_LANGAME',
      });
      if (!backgroundExecution.allowed) {
        await this.returnDispatchingEntryAfterBackgroundExecutionDenial(
          actorUserId,
          sourcedEntry,
          backgroundExecution,
          dispatchLockedAt,
        );

        return {
          ledgerEntryId: sourcedEntry.id,
          rewardId: sourcedEntry.rewardId,
          status: 'BLOCKED',
          amount: decimalToNumber(sourcedEntry.amount),
          externalDomain: sourcedEntry.externalDomain,
          externalGuestId: sourcedEntry.externalGuestId,
          note: tenantBackgroundExecutionNote(backgroundExecution),
        };
      }

      const ownsDispatch = await this.ownsCurrentDispatch(
        sourcedEntry,
        dispatchLockedAt,
      );
      if (!ownsDispatch) {
        return {
          ledgerEntryId: sourcedEntry.id,
          rewardId: sourcedEntry.rewardId,
          status: 'BLOCKED',
          amount: decimalToNumber(sourcedEntry.amount),
          externalDomain: sourcedEntry.externalDomain,
          externalGuestId: sourcedEntry.externalGuestId,
          note: 'Ledger-запись уже была повторно захвачена или изменилась; устаревший worker не вызвал Langame.',
        };
      }

      const response = await this.langameClient.adjustGuestBalanceByPhone(
        source.baseUrl,
        access.apiKey,
        payload,
        config.path ?? langameBalancePhoneMasterPath,
      );

      await this.confirmEntry(
        actorUserId,
        sourcedEntry,
        auditPayload,
        sanitizeLangameBalanceResponse(response),
      );

      return {
        ledgerEntryId: sourcedEntry.id,
        rewardId: sourcedEntry.rewardId,
        status: 'CONFIRMED',
        amount: decimalToNumber(sourcedEntry.amount),
        externalDomain: sourcedEntry.externalDomain,
        externalGuestId: sourcedEntry.externalGuestId,
        note: langameBalanceConfirmationNote(sourcedEntry),
      };
    } catch (error) {
      let stateTransitioned = true;
      if (dispatchStarted) {
        await this.markEntryReconciliationRequired(
          actorUserId,
          sourcedEntry,
          error,
        );
      } else {
        stateTransitioned = await this.failEntry(
          actorUserId,
          sourcedEntry,
          config,
          error,
        );
      }

      return {
        ledgerEntryId: sourcedEntry.id,
        rewardId: sourcedEntry.rewardId,
        status: dispatchStarted
          ? 'RECONCILIATION_REQUIRED'
          : stateTransitioned
            ? 'FAILED'
            : 'BLOCKED',
        amount: decimalToNumber(sourcedEntry.amount),
        externalDomain: sourcedEntry.externalDomain,
        externalGuestId: sourcedEntry.externalGuestId,
        note: stateTransitioned
          ? errorMessage(error)
          : 'Ledger-запись уже изменилась; поздняя ошибка не перезаписала состояние.',
      };
    }
  }

  private async returnDispatchingEntryAfterAdmissionDenial(
    actorUserId: string | null,
    entry: ClaimedBonusLedgerEntry,
    admission: TenantExecutionAdmissionDecision,
    dispatchLockedAt: Date,
  ): Promise<void> {
    await this.prisma.guestBonusLedgerEntry.updateMany({
      where: {
        id: entry.id,
        tenantId: entry.tenantId,
        status: 'DISPATCHING',
        attempts: entry.attempts,
        claimGeneration: entry.claimGeneration,
        lockedAt: dispatchLockedAt,
        executionRevision: entry.executionRevision,
      },
      data: {
        status: 'PENDING',
        processedByUserId: actorUserId,
        attempts: { decrement: 1 },
        lockedAt: null,
        processedAt: null,
        failedAt: null,
        nextAttemptAt: null,
        errorCode: 'TENANT_EXECUTION_NOT_ADMITTED',
        errorMessage: truncate(tenantExecutionAdmissionNote(admission), 1000),
      },
    });
  }

  private async returnDispatchingEntryAfterBackgroundExecutionDenial(
    actorUserId: string | null,
    entry: ClaimedBonusLedgerEntry,
    decision: TenantBackgroundExecutionPolicyDecision,
    dispatchLockedAt: Date,
  ): Promise<void> {
    await this.prisma.guestBonusLedgerEntry.updateMany({
      where: {
        id: entry.id,
        tenantId: entry.tenantId,
        status: 'DISPATCHING',
        attempts: entry.attempts,
        claimGeneration: entry.claimGeneration,
        lockedAt: dispatchLockedAt,
        executionRevision: entry.executionRevision,
      },
      data: {
        status: 'PENDING',
        processedByUserId: actorUserId,
        attempts: { decrement: 1 },
        lockedAt: null,
        processedAt: null,
        failedAt: null,
        nextAttemptAt: null,
        errorCode: 'BACKGROUND_EXECUTION_NOT_ADMITTED',
        errorMessage: truncate(tenantBackgroundExecutionNote(decision), 1000),
      },
    });
  }

  private async returnDispatchingEntryAfterTargetChange(
    actorUserId: string | null,
    entry: ClaimedBonusLedgerEntry,
    dispatchLockedAt: Date,
    detail: string,
  ): Promise<void> {
    await this.prisma.guestBonusLedgerEntry.updateMany({
      where: {
        id: entry.id,
        tenantId: entry.tenantId,
        status: 'DISPATCHING',
        attempts: entry.attempts,
        claimGeneration: entry.claimGeneration,
        lockedAt: dispatchLockedAt,
        executionRevision: entry.executionRevision,
      },
      data: {
        status: 'PENDING',
        processedByUserId: actorUserId,
        attempts: { decrement: 1 },
        lockedAt: null,
        processedAt: null,
        failedAt: null,
        nextAttemptAt: null,
        errorCode: 'LANGAME_TARGET_CHANGED',
        errorMessage: truncate(detail, 1000),
      },
    });
  }

  private async revalidateClaimedEntryForDelivery(
    actorUserId: string | null,
    entry: ClaimedBonusLedgerEntry,
    expectedStatus: 'PROCESSING' | 'DISPATCHING' = 'PROCESSING',
    expectedLockedAt: Date | null = entry.lockedAt,
  ): Promise<BonusLedgerDeliveryRevalidation> {
    if (entry.source !== 'GAMIFICATION_REWARD' || !entry.rewardId) {
      return {
        ready: true,
        status: null,
        note: null,
      };
    }

    const now = new Date();
    const rewardId = entry.rewardId;

    return this.prisma.$transaction(async (tx) => {
      const readyReward = await tx.guestGameReward.findFirst({
        where: {
          id: rewardId,
          tenantId: entry.tenantId,
          status: 'APPROVED',
          AND: [
            bonusLedgerRewardDeliveryGate(
              now,
              tx.guestGameReward.fields.claimExpiresAt,
            ),
          ],
        },
        select: {
          id: true,
          claimRequired: true,
          deliveryRequestedAt: true,
          claimExpiresAt: true,
        },
      });

      if (
        readyReward &&
        acceptedRewardClaimBeforeDeadline(readyReward) &&
        !readyReward.claimRequired
      ) {
        return {
          ready: true,
          status: null,
          note: null,
        };
      }

      if (
        readyReward &&
        acceptedRewardClaimBeforeDeadline(readyReward) &&
        readyReward.claimRequired
      ) {
        const wallet = await tx.guestGameRewardWalletItem.updateMany({
          where: {
            tenantId: entry.tenantId,
            rewardId,
            kind: 'REWARD',
            status: { in: ['PROCESSING', 'FAILED'] },
          },
          data: {
            status: 'PROCESSING',
          },
        });

        if (wallet.count > 0) {
          return {
            ready: true,
            status: null,
            note: null,
          };
        }
      }

      const reward = await tx.guestGameReward.findFirst({
        where: {
          id: rewardId,
          tenantId: entry.tenantId,
        },
        select: {
          status: true,
          claimRequired: true,
          deliveryRequestedAt: true,
          claimExpiresAt: true,
        },
      });
      const waitsForClaim =
        reward?.status === 'APPROVED' &&
        reward.claimRequired &&
        reward.deliveryRequestedAt === null &&
        (reward.claimExpiresAt === null ||
          reward.claimExpiresAt.getTime() > now.getTime());
      const blockedByWalletState =
        reward?.status === 'APPROVED' &&
        reward.claimRequired &&
        acceptedRewardClaimBeforeDeadline(reward);
      const status =
        waitsForClaim || blockedByWalletState ? 'PENDING' : 'CANCELED';
      const itemStatus = status === 'PENDING' ? 'BLOCKED' : 'CANCELED';
      const note =
        status === 'PENDING'
          ? 'Внешнее начисление ожидает подтвержденного получения награды в кошельке.'
          : 'Внешнее начисление отменено: награда отменена, просрочена или не была получена до срока.';

      await tx.guestBonusLedgerEntry.updateMany({
        where: {
          id: entry.id,
          tenantId: entry.tenantId,
          status: expectedStatus,
          attempts: entry.attempts,
          claimGeneration: entry.claimGeneration,
          lockedAt: expectedLockedAt,
          executionRevision: entry.executionRevision,
        },
        data: {
          status,
          processedByUserId: actorUserId,
          lockedAt: null,
          nextAttemptAt: null,
          canceledAt: status === 'CANCELED' ? now : null,
          errorCode:
            status === 'PENDING'
              ? 'WAITING_REWARD_CLAIM'
              : 'REWARD_NOT_DELIVERABLE',
          errorMessage: note,
        },
      });

      return {
        ready: false,
        status: itemStatus,
        note,
      };
    });
  }

  private async markEntryDispatching(
    actorUserId: string | null,
    entry: ClaimedBonusLedgerEntry,
    request: Record<string, unknown>,
    dispatchLockedAt: Date = new Date(),
  ) {
    return this.prisma.$transaction(async (tx) => {
      if (entry.rewardId) {
        await tx.$queryRaw(Prisma.sql`
          SELECT "id"
          FROM "GuestGameReward"
          WHERE "id" = ${entry.rewardId}
            AND "tenantId" = ${entry.tenantId}
          FOR UPDATE
        `);
        const reward = await tx.guestGameReward.findFirst({
          where: {
            id: entry.rewardId,
            tenantId: entry.tenantId,
          },
          select: {
            id: true,
            status: true,
            claimRequired: true,
            deliveryRequestedAt: true,
            claimExpiresAt: true,
            expiresAt: true,
          },
        });

        if (
          !reward ||
          reward.status !== 'APPROVED' ||
          (reward.claimRequired
            ? !acceptedRewardClaimBeforeDeadline(reward)
            : Boolean(
                reward.expiresAt &&
                reward.expiresAt.getTime() <= dispatchLockedAt.getTime(),
              ))
        ) {
          return false;
        }

        if (reward.claimRequired) {
          await tx.$queryRaw(Prisma.sql`
            SELECT "id"
            FROM "GuestGameRewardWalletItem"
            WHERE "tenantId" = ${entry.tenantId}
              AND "rewardId" = ${entry.rewardId}
              AND "kind" = 'REWARD'
            FOR UPDATE
          `);
          const wallet = await tx.guestGameRewardWalletItem.findFirst({
            where: {
              tenantId: entry.tenantId,
              rewardId: entry.rewardId,
              kind: 'REWARD',
              status: 'PROCESSING',
            },
            select: { id: true },
          });
          if (!wallet) {
            return false;
          }
        }
      }

      const dispatching = await tx.guestBonusLedgerEntry.updateMany({
        where: {
          id: entry.id,
          tenantId: entry.tenantId,
          status: 'PROCESSING',
          attempts: entry.attempts,
          claimGeneration: entry.claimGeneration,
          lockedAt: entry.lockedAt,
          executionRevision: entry.executionRevision,
        },
        data: {
          status: 'DISPATCHING',
          processedByUserId: actorUserId,
          lockedAt: dispatchLockedAt,
          nextAttemptAt: null,
          errorCode: null,
          errorMessage: null,
          langameRequest: request as Prisma.InputJsonValue,
        },
      });

      return dispatching.count === 1;
    });
  }

  private async ownsCurrentDispatch(
    entry: ClaimedBonusLedgerEntry,
    dispatchLockedAt: Date,
  ) {
    if (
      !Number.isSafeInteger(entry.executionRevision) ||
      (entry.executionRevision ?? 0) < 1
    ) {
      return false;
    }
    const executionRevision = entry.executionRevision as number;
    const count = await this.prisma.guestBonusLedgerEntry.count({
      where: {
        id: entry.id,
        tenantId: entry.tenantId,
        status: 'DISPATCHING',
        attempts: entry.attempts,
        claimGeneration: entry.claimGeneration,
        lockedAt: dispatchLockedAt,
        executionRevision,
        tenant: {
          executionRevision,
        },
      },
    });

    return count === 1;
  }

  private async confirmEntry(
    actorUserId: string | null,
    entry: ClaimedBonusLedgerEntry,
    request: Record<string, unknown>,
    response: unknown,
  ) {
    await this.prisma.$transaction(async (tx) => {
      if (entry.rewardId) {
        await tx.$queryRaw(Prisma.sql`
          SELECT "id"
          FROM "GuestGameReward"
          WHERE "id" = ${entry.rewardId}
            AND "tenantId" = ${entry.tenantId}
          FOR UPDATE
        `);
      }
      await tx.$queryRaw(Prisma.sql`
        SELECT "id"
        FROM "GuestBonusLedgerEntry"
        WHERE "id" = ${entry.id}
          AND "tenantId" = ${entry.tenantId}
        FOR UPDATE
      `);
      await this.confirmEntryInTransaction(
        tx,
        actorUserId,
        entry,
        request,
        response,
        'DISPATCHING',
      );
    });
  }

  private async confirmEntryInTransaction(
    tx: Prisma.TransactionClient,
    actorUserId: string | null,
    entry: ClaimedBonusLedgerEntry,
    request: unknown,
    response: unknown,
    expectedStatus: 'DISPATCHING' | 'RECONCILIATION_REQUIRED',
    metadata?: Prisma.InputJsonValue,
    reconciliationAudit?: BonusLedgerReconciliationAudit,
    now = new Date(),
  ) {
    const amount = toDecimal(entry.amount);
    const langameBalanceType = langameBalanceTypeForEntry(entry);

    if (entry.rewardId) {
      await tx.$queryRaw(Prisma.sql`
          SELECT "id"
          FROM "GuestGameReward"
          WHERE "id" = ${entry.rewardId}
            AND "tenantId" = ${entry.tenantId}
          FOR UPDATE
        `);
      const deliveryReward = await tx.guestGameReward.findFirst({
        where: {
          id: entry.rewardId,
          tenantId: entry.tenantId,
        },
        select: {
          id: true,
          status: true,
          claimRequired: true,
          deliveryRequestedAt: true,
          claimExpiresAt: true,
          expiresAt: true,
        },
      });
      if (
        !deliveryReward ||
        deliveryReward.status !== 'APPROVED' ||
        (deliveryReward.claimRequired
          ? !acceptedRewardClaimBeforeDeadline(deliveryReward)
          : Boolean(
              deliveryReward.expiresAt &&
              deliveryReward.expiresAt.getTime() <= now.getTime(),
            ))
      ) {
        throw new BadRequestException(
          'Награда больше не находится в состоянии, допускающем подтверждение внешней выдачи.',
        );
      }
      if (deliveryReward.claimRequired) {
        await tx.$queryRaw(Prisma.sql`
            SELECT "id"
            FROM "GuestGameRewardWalletItem"
            WHERE "tenantId" = ${entry.tenantId}
              AND "rewardId" = ${entry.rewardId}
              AND "kind" = 'REWARD'
            FOR UPDATE
          `);
        const wallet = await tx.guestGameRewardWalletItem.findFirst({
          where: {
            tenantId: entry.tenantId,
            rewardId: entry.rewardId,
            kind: 'REWARD',
            status: 'PROCESSING',
          },
          select: { id: true },
        });
        if (!wallet) {
          throw new BadRequestException(
            'Кошелек наград больше не ожидает подтверждения этой выдачи.',
          );
        }
      }
    }

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

    const confirmedLedger = await tx.guestBonusLedgerEntry.updateMany({
      where: {
        id: entry.id,
        tenantId: entry.tenantId,
        status: expectedStatus,
        attempts: entry.attempts,
        claimGeneration: entry.claimGeneration,
        executionRevision: entry.executionRevision,
      },
      data: {
        status: 'CONFIRMED',
        processedByUserId: actorUserId,
        externalProvider: entry.externalProvider,
        externalDomain: entry.externalDomain,
        lockedAt: null,
        nextAttemptAt: null,
        processedAt: now,
        confirmedAt: now,
        failedAt: null,
        errorCode: null,
        errorMessage: null,
        balanceBefore,
        balanceAfter,
        langameRequest: jsonValue(request),
        langameResponse: jsonValue(response),
        ...(metadata ? { metadata } : {}),
      },
    });
    if (confirmedLedger.count !== 1) {
      throw new BadRequestException(
        'Ledger-запись потеряла право подтвердить внешнюю выдачу.',
      );
    }

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
          claimRequired: true,
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
        const claimedWallet = await tx.guestGameRewardWalletItem.updateMany({
          where: {
            tenantId: reward.tenantId,
            rewardId: reward.id,
            kind: 'REWARD',
            status: 'PROCESSING',
          },
          data: {
            status: 'CLAIMED',
            claimedAt: now,
          },
        });
        if (reward.claimRequired && claimedWallet.count !== 1) {
          throw new BadRequestException(
            'Кошелек наград не подтвердил единственную принятую выдачу.',
          );
        }
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
              ...(reconciliationAudit
                ? { reconciliationResolution: reconciliationAudit }
                : {}),
            },
            note: `${reward.rewardLabel} · ${reward.rewardCode ?? entry.idempotencyKey}`,
          },
        });
      }
    }
  }

  private async markReconciliationNotAppliedInTransaction(
    tx: Prisma.TransactionClient,
    user: Pick<AuthenticatedUser, 'id' | 'tenantId'>,
    entry: ClaimedBonusLedgerEntry,
    metadata: Prisma.InputJsonValue,
    note: string,
    now: Date,
  ) {
    let claimRequired = false;

    if (entry.rewardId) {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id"
        FROM "GuestGameReward"
        WHERE "id" = ${entry.rewardId}
          AND "tenantId" = ${entry.tenantId}
        FOR UPDATE
      `);
      const reward = await tx.guestGameReward.findFirst({
        where: {
          id: entry.rewardId,
          tenantId: entry.tenantId,
        },
        select: {
          id: true,
          status: true,
          claimRequired: true,
          deliveryRequestedAt: true,
          claimExpiresAt: true,
          expiresAt: true,
        },
      });
      if (
        !reward ||
        reward.status !== 'APPROVED' ||
        (reward.claimRequired
          ? !acceptedRewardClaimBeforeDeadline(reward)
          : Boolean(
              reward.expiresAt && reward.expiresAt.getTime() <= now.getTime(),
            ))
      ) {
        throw new BadRequestException(
          'Награда больше не допускает безопасную повторную выдачу.',
        );
      }

      claimRequired = reward.claimRequired;
      if (claimRequired) {
        await tx.$queryRaw(Prisma.sql`
          SELECT "id"
          FROM "GuestGameRewardWalletItem"
          WHERE "tenantId" = ${entry.tenantId}
            AND "rewardId" = ${entry.rewardId}
            AND "kind" = 'REWARD'
          FOR UPDATE
        `);
        const wallet = await tx.guestGameRewardWalletItem.findFirst({
          where: {
            tenantId: entry.tenantId,
            rewardId: entry.rewardId,
            kind: 'REWARD',
            status: 'PROCESSING',
          },
          select: { id: true },
        });
        if (!wallet) {
          throw new BadRequestException(
            'Кошелёк наград больше не ожидает результата этой выдачи.',
          );
        }
      }
    }

    const failed = await tx.guestBonusLedgerEntry.updateMany({
      where: {
        id: entry.id,
        tenantId: user.tenantId,
        status: 'RECONCILIATION_REQUIRED',
        attempts: entry.attempts,
        claimGeneration: entry.claimGeneration,
        executionRevision: entry.executionRevision,
      },
      data: {
        status: 'FAILED',
        processedByUserId: user.id,
        lockedAt: null,
        processedAt: now,
        confirmedAt: null,
        failedAt: now,
        canceledAt: null,
        attempts: 0,
        nextAttemptAt: now,
        errorCode: 'RECONCILIATION_NOT_APPLIED',
        errorMessage: truncate(note, 1000),
        metadata,
      },
    });
    if (failed.count !== 1) {
      throw new BadRequestException(
        'Ledger-запись уже была разрешена другим оператором.',
      );
    }

    if (entry.rewardId) {
      const wallet = await tx.guestGameRewardWalletItem.updateMany({
        where: {
          tenantId: entry.tenantId,
          rewardId: entry.rewardId,
          kind: 'REWARD',
          status: 'PROCESSING',
        },
        data: {
          status: 'FAILED',
        },
      });
      if (claimRequired && wallet.count !== 1) {
        throw new BadRequestException(
          'Кошелёк наград не подтвердил перевод выдачи в повторяемую ошибку.',
        );
      }
    }
  }

  private assertReconciliationQuarantineElapsed(
    entry: {
      failedAt: Date | null;
      updatedAt: Date;
      createdAt: Date;
    },
    now: Date,
  ) {
    const quarantineMinutes = positiveInt(
      this.configService.get<string>(
        'LANGAME_BONUS_RECONCILIATION_QUARANTINE_MINUTES',
      ),
      30,
      7 * 24 * 60,
    );
    const quarantineStartedAt =
      entry.failedAt ?? entry.updatedAt ?? entry.createdAt;
    const retryAllowedAt = new Date(
      quarantineStartedAt.getTime() + quarantineMinutes * 60 * 1000,
    );

    if (now.getTime() < retryAllowedAt.getTime()) {
      throw new BadRequestException(
        `NOT_APPLIED retry remains quarantined until ${retryAllowedAt.toISOString()}`,
      );
    }
  }

  private async failEntry(
    actorUserId: string | null,
    entry: ClaimedBonusLedgerEntry,
    config: BonusLedgerConfig,
    error: unknown,
  ) {
    const now = new Date();
    const terminal = entry.attempts >= config.maxAttempts;
    const nextAttemptAt = terminal
      ? null
      : new Date(now.getTime() + config.retryMinutes * 60 * 1000);

    return this.prisma.$transaction(async (tx) => {
      const failed = await tx.guestBonusLedgerEntry.updateMany({
        where: {
          id: entry.id,
          tenantId: entry.tenantId,
          status: 'PROCESSING',
          attempts: entry.attempts,
          claimGeneration: entry.claimGeneration,
          lockedAt: entry.lockedAt,
          executionRevision: entry.executionRevision,
        },
        data: {
          status: 'FAILED',
          processedByUserId: actorUserId,
          externalProvider: entry.externalProvider,
          externalDomain: entry.externalDomain,
          lockedAt: null,
          failedAt: now,
          nextAttemptAt,
          errorCode: terminal ? 'MAX_ATTEMPTS_REACHED' : 'LANGAME_WRITE_FAILED',
          errorMessage: truncate(errorMessage(error), 1000),
        },
      });
      if (failed.count !== 1) {
        return false;
      }

      if (entry.rewardId) {
        await tx.guestGameRewardWalletItem.updateMany({
          where: {
            tenantId: entry.tenantId,
            rewardId: entry.rewardId,
            kind: 'REWARD',
            status: 'PROCESSING',
          },
          data: {
            status: 'FAILED',
          },
        });
      }

      return true;
    });
  }

  private async markEntryReconciliationRequired(
    actorUserId: string | null,
    entry: ClaimedBonusLedgerEntry,
    error: unknown,
  ) {
    const now = new Date();
    const message =
      'Ответ Langame после попытки начисления не получен однозначно. Автоповтор отключён до сверки баланса.';
    await this.prisma.$transaction(async (tx) => {
      await tx.guestBonusLedgerEntry.updateMany({
        where: {
          id: entry.id,
          tenantId: entry.tenantId,
          status: 'DISPATCHING',
          attempts: entry.attempts,
          claimGeneration: entry.claimGeneration,
          executionRevision: entry.executionRevision,
        },
        data: {
          status: 'RECONCILIATION_REQUIRED',
          processedByUserId: actorUserId,
          externalProvider: entry.externalProvider,
          externalDomain: entry.externalDomain,
          lockedAt: null,
          failedAt: now,
          nextAttemptAt: null,
          errorCode: 'LANGAME_WRITE_OUTCOME_UNKNOWN',
          errorMessage: truncate(`${message} ${errorMessage(error)}`, 1000),
        },
      });
      if (entry.rewardId) {
        await tx.guestGameRewardWalletItem.updateMany({
          where: {
            tenantId: entry.tenantId,
            rewardId: entry.rewardId,
            kind: 'REWARD',
            status: 'PROCESSING',
          },
          data: { status: 'PROCESSING' },
        });
      }
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
    entity: {
      phoneEncrypted: string | null;
      phoneMasked?: string | null;
      contactMasked?: string | null;
    } | null,
  ) {
    if (!entity?.phoneEncrypted) {
      return null;
    }

    let phone: string | null;

    try {
      phone = normalizeLangamePhone(
        this.secretEncryptionService.decrypt(entity.phoneEncrypted, 'pii'),
      );
    } catch {
      phone = null;
    }

    if (!phone) {
      return null;
    }

    return {
      value: phone,
      masked:
        entity.phoneMasked ?? entity.contactMasked ?? maskPhoneForAudit(phone),
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

    if (phone) {
      return phone;
    }

    const profile = entry.profileId
      ? await this.prisma.guestGameProfile.findFirst({
          where: {
            id: entry.profileId,
            tenantId: entry.tenantId,
          },
          select: {
            phoneEncrypted: true,
            contactMasked: true,
          },
        })
      : null;
    const profilePhone = this.resolveEncryptedPhone(profile);

    if (!profilePhone) {
      throw new BadRequestException(
        'У ledger-записи нет расшифровываемого телефона гостя для Langame /master_api/guests/balance/phone.',
      );
    }

    return profilePhone;
  }

  private async resolveEntryStaffTestReason(
    entry: ClaimedBonusLedgerEntry,
    phone: string,
  ) {
    if (entry.profileId) {
      const profile = await this.prisma.guestGameProfile.findFirst({
        where: {
          id: entry.profileId,
          tenantId: entry.tenantId,
        },
        select: {
          isStaffTest: true,
          staffTestReason: true,
        },
      });

      if (profile?.isStaffTest) {
        return profile.staffTestReason ?? staffTestProfileReasons.staffPhone;
      }
    }

    const reason = await this.resolveStaffTestReason(entry.tenantId, phone);

    if (reason && entry.profileId) {
      await this.markProfileStaffTest(entry.tenantId, entry.profileId, reason);
    }

    return reason;
  }

  private async resolveStaffTestReason(tenantId: string, phone: string) {
    const [staffMembers, langameStaffUsers] = await Promise.all([
      this.prisma.staffMember.findMany({
        where: {
          tenantId,
          status: { notIn: ['DISMISSED', 'ARCHIVED'] },
          phone: { not: null },
        },
        select: { phone: true },
        take: 1000,
      }),
      this.prisma.langameStaffUser.findMany({
        where: {
          tenantId,
          phone: { not: null },
        },
        select: { phone: true },
        take: 1000,
      }),
    ]);

    if (
      staffMembers.some((member) =>
        phonesMatch(phone, normalizePhoneDigits(member.phone)),
      )
    ) {
      return staffTestProfileReasons.staffPhone;
    }

    if (
      langameStaffUsers.some((staffUser) =>
        phonesMatch(phone, normalizePhoneDigits(staffUser.phone)),
      )
    ) {
      return staffTestProfileReasons.langameStaffPhone;
    }

    return null;
  }

  private async markProfileStaffTest(
    tenantId: string,
    profileId: string,
    reason: string,
  ) {
    await this.prisma.guestGameProfile.updateMany({
      where: {
        id: profileId,
        tenantId,
      },
      data: {
        isStaffTest: true,
        staffTestReason: reason,
        staffTestMatchedAt: new Date(),
      },
    });
  }

  private async cancelStaffTestRewards(tenantId: string, rewardIds: string[]) {
    await this.prisma.guestGameReward.updateMany({
      where: {
        tenantId,
        id: { in: [...new Set(rewardIds)] },
        status: 'APPROVED',
      },
      data: {
        status: 'CANCELED',
      },
    });
  }

  private async cancelStaffTestEntry(
    actorUserId: string | null,
    entry: ClaimedBonusLedgerEntry,
    reason: string,
    expectedStatus: 'PROCESSING' | 'DISPATCHING' = 'PROCESSING',
    expectedLockedAt: Date | null = entry.lockedAt,
  ) {
    const now = new Date();
    const metadata = {
      ...jsonRecord(entry.metadata),
      staffTestBlocked: true,
      staffTestReason: reason,
    };

    return this.prisma.$transaction(async (tx) => {
      const canceled = await tx.guestBonusLedgerEntry.updateMany({
        where: {
          id: entry.id,
          tenantId: entry.tenantId,
          status: expectedStatus,
          attempts: entry.attempts,
          claimGeneration: entry.claimGeneration,
          lockedAt: expectedLockedAt,
          executionRevision: entry.executionRevision,
        },
        data: {
          status: 'CANCELED',
          processedByUserId: actorUserId,
          externalProvider: entry.externalProvider,
          externalDomain: entry.externalDomain,
          lockedAt: null,
          nextAttemptAt: null,
          canceledAt: now,
          failedAt: null,
          errorCode: staffTestProfileErrorCode,
          errorMessage: staffTestLedgerNote(),
          metadata: metadata,
        },
      });
      if (canceled.count !== 1) {
        return false;
      }

      if (entry.rewardId) {
        await tx.guestGameReward.updateMany({
          where: {
            id: entry.rewardId,
            tenantId: entry.tenantId,
            status: { in: ['PENDING', 'APPROVED'] },
          },
          data: {
            status: 'CANCELED',
          },
        });
      }

      if (entry.profileId) {
        await tx.guestGameProfile.updateMany({
          where: {
            id: entry.profileId,
            tenantId: entry.tenantId,
          },
          data: {
            isStaffTest: true,
            staffTestReason: reason,
            staffTestMatchedAt: now,
          },
        });
      }

      return true;
    });
  }

  private async resolveEntrySource(
    entry: ClaimedBonusLedgerEntry,
    access: TenantAccess,
  ) {
    const externalDomain = await this.resolveEntryLangameDomain(entry);

    if (externalDomain) {
      const matched = access.sources.find(
        (source) => source.domain === externalDomain,
      );

      if (matched) {
        return matched;
      }

      throw new BadRequestException(
        `Langame domain ${externalDomain} is not active for this tenant.`,
      );
    }

    if (access.sources.length === 1) {
      return access.sources[0];
    }

    throw new BadRequestException(
      'Ledger-запись не привязана к Langame domain, а у tenant несколько источников.',
    );
  }

  private async resolveEntryLangameDomain(entry: ClaimedBonusLedgerEntry) {
    const entryDomain = langameExternalDomain(entry.externalDomain);

    if (entryDomain) {
      return entryDomain;
    }

    if (!entry.storeId) {
      return null;
    }

    const store = await this.prisma.store.findFirst({
      where: {
        id: entry.storeId,
        tenantId: entry.tenantId,
      },
      select: {
        externalDomain: true,
        integrationSource: {
          select: {
            provider: true,
            domain: true,
            isActive: true,
          },
        },
      },
    });

    return this.resolveStoreLangameDomain(store);
  }

  private resolveStoreLangameDomain(
    store: {
      externalDomain: string | null;
      integrationSource: {
        provider: IntegrationProvider;
        domain: string;
        isActive: boolean;
      } | null;
    } | null,
  ) {
    const source = store?.integrationSource;

    if (source?.provider === IntegrationProvider.LANGAME && source.isActive) {
      return langameExternalDomain(source.domain);
    }

    return langameExternalDomain(store?.externalDomain);
  }

  private withResolvedEntrySource(
    entry: ClaimedBonusLedgerEntry,
    externalDomain: string,
  ): ClaimedBonusLedgerEntry {
    return {
      ...entry,
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain,
    };
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

  private isStaffTestRewardAccrualEnabled() {
    return booleanValue(
      this.configService.get<string>(staffTestRewardAccrualEnabledEnv),
      true,
    );
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
      rewardId: nullableString(dto.rewardId),
      limit: canary ? 1 : positiveInt(dto.limit, 50, 250),
      maxAttempts: positiveInt(
        this.configService.get<string>('LANGAME_BONUS_ACCRUAL_MAX_ATTEMPTS'),
        5,
        20,
      ),
      retryMinutes: positiveInt(
        this.configService.get<string>('LANGAME_BONUS_ACCRUAL_RETRY_MINUTES'),
        1,
        24 * 60,
      ),
      staleLockMinutes: positiveInt(
        this.configService.get<string>(
          'LANGAME_BONUS_ACCRUAL_STALE_LOCK_MINUTES',
        ),
        15,
        24 * 60,
      ),
      staffTestRewardAccrualEnabled: this.isStaffTestRewardAccrualEnabled(),
      executionRevision: null,
    };
  }

  private executionPermitForEntry(
    entry: ClaimedBonusLedgerEntry,
  ): TenantExecutionPermit {
    if (
      !Number.isSafeInteger(entry.executionRevision) ||
      (entry.executionRevision ?? 0) < 1
    ) {
      throw new BadRequestException(
        'Ledger claim does not carry a valid tenant execution revision.',
      );
    }

    return {
      tenantId: entry.tenantId,
      executionRevision: entry.executionRevision as number,
      requirements: bonusLedgerOutboundRequirements,
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

function tenantExecutionAdmissionNote(
  decision: TenantExecutionAdmissionDecision,
) {
  const failedRequirement = decision.failedRequirement
    ? ` (${decision.failedRequirement.module}:${decision.failedRequirement.action})`
    : '';

  return `Tenant execution admission denied: ${decision.reasonCode}${failedRequirement}.`;
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

function ledgerActorUserId(user: Pick<AuthenticatedUser, 'id'>) {
  const id = user.id?.trim();

  return id && !id.startsWith('guest-portal:') ? id : null;
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

function isLangameBalanceRewardType(rewardType: string | null) {
  const normalized = rewardType?.trim().toUpperCase();

  return Boolean(
    normalized &&
    (defaultBonusRewardTypes.includes(
      normalized as (typeof defaultBonusRewardTypes)[number],
    ) ||
      moneyBalanceRewardTypes.includes(
        normalized as (typeof moneyBalanceRewardTypes)[number],
      )),
  );
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

function staffTestLedgerNote() {
  return 'Профиль определен как тест сотрудника; автоначисление в Langame заблокировано.';
}

function bonusLedgerCancelNote(
  reason: string,
  canceled: {
    rewards: number;
    deliveries: number;
    protocolBlocked: number;
  },
) {
  const details = [
    canceled.rewards ? `reward canceled: ${canceled.rewards}` : null,
    canceled.deliveries ? `deliveries canceled: ${canceled.deliveries}` : null,
    canceled.protocolBlocked
      ? `provider deliveries protocol-blocked: ${canceled.protocolBlocked}`
      : null,
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

function normalizePhoneDigits(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, '') ?? '';
  return digits.length >= 6 ? digits : null;
}

function phonesMatch(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  const normalizedLeft = normalizePhoneDigits(left);
  const normalizedRight = normalizePhoneDigits(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  return (
    normalizedLeft.length >= 10 &&
    normalizedRight.length >= 10 &&
    normalizedLeft.slice(-10) === normalizedRight.slice(-10)
  );
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
      isPhoneLikeKey(key)
        ? sanitizePhoneFieldValue(entry)
        : sanitizeLangameBalanceResponse(entry),
    ]),
  );
}

function isPhoneLikeKey(key: string) {
  const tokens = key
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z\d]+/)
    .filter(Boolean);
  const compact = tokens.join('');

  return (
    compact.includes('phone') ||
    compact.includes('telephone') ||
    tokens.includes('tel') ||
    (tokens.includes('mobile') &&
      (tokens.length === 1 ||
        tokens.includes('number') ||
        tokens.includes('no') ||
        tokens.includes('contact'))) ||
    (tokens.includes('contact') &&
      (tokens.includes('number') || tokens.includes('no')))
  );
}

function sanitizePhoneFieldValue(value: unknown) {
  if (value === null || value === undefined) {
    return value;
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint'
  ) {
    return maskPhoneForAudit(String(value));
  }

  // A structured value under a phone-like key may still contain raw digits
  // behind generic child keys. Redact it as a whole instead of recursing.
  return '***';
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

function langameExternalDomain(value: unknown) {
  const domain = nullableString(value);

  return domain && !guestPortalExternalDomains.has(domain.toLowerCase())
    ? domain
    : null;
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
