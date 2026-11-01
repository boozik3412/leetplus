import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserAccessScope, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const STORE_DELETED_ACTION = 'STORE_DELETED';
export const STORE_DELETE_CONFIRMATION = 'УДАЛИТЬ';

export type StoreDeletionActorKind = 'PLATFORM_ADMIN' | 'NETWORK_OWNER';

/**
 * What happens to rows that name a deleted club:
 * - DELETE: the club's own operational data, removed together with the club;
 * - ARCHIVE: club-only settings (checklists, courses, regulations…) are
 *   archived before the FK clears their club, because a setting without a
 *   club applies to the whole network and must not silently widen;
 * - DETACH: network history kept without a club (the FK is ON DELETE SET NULL);
 * - BLOCK: append-only history that cannot be removed, the club stays;
 * - KEEP: id lists and audit copies without a FK; a stale id matches no club,
 *   so a scoped rule never widens to the whole network.
 */
export type StoreReferenceAction =
  | 'DELETE'
  | 'ARCHIVE'
  | 'DETACH'
  | 'BLOCK'
  | 'KEEP';

type StoreReferenceKind = 'ID' | 'JSONB_IDS' | 'TEXT_IDS';

type StoreReference = {
  table: string;
  column: string;
  kind: StoreReferenceKind;
  action: StoreReferenceAction;
  label: string;
  /** ARCHIVE only: the SET list that takes the row out of use. */
  archiveSet?: string;
};

/**
 * Every column that points at a club. The PostgreSQL spec compares this list
 * with the catalog, so a new reference must be classified here.
 */
export const STORE_REFERENCES: readonly StoreReference[] = [
  // Deleted with the club, children first.
  ref('GuestPortalOtpChallenge', 'storeId', 'DELETE', 'входы гостей'),
  ref('GuestGameTelegramLinkChallenge', 'storeId', 'DELETE', 'входы гостей'),
  ref('GuestSupportTicket', 'storeId', 'DELETE', 'обращения гостей'),
  ref('StaffTask', 'storeId', 'DELETE', 'задачи'),
  ref('StaffTaskRecurringRule', 'storeId', 'DELETE', 'задачи'),
  ref('StaffTaskTemplate', 'storeId', 'DELETE', 'задачи'),
  ref('StoreClosure', 'storeId', 'DELETE', 'дни закрытия'),
  ref('StockMovement', 'storeId', 'DELETE', 'движения товаров'),
  ref('InventorySnapshot', 'storeId', 'DELETE', 'остатки'),
  ref('SalesFact', 'storeId', 'DELETE', 'продажи'),
  ref('ClubRevenueFact', 'storeId', 'DELETE', 'выручка'),
  ref(
    'LangameClubProductConfiguration',
    'storeId',
    'DELETE',
    'настройки Langame',
  ),
  ref('GuestGameVisualDraft', 'storeId', 'DELETE', 'оформление игры'),
  ref('StaffDisciplinePolicy', 'storeId', 'DELETE', 'правила дисциплины'),
  // Club-only settings: archived, then detached, never widened to the network.
  archived('StaffChecklistTemplate', 'чек-листы', `"status" = 'ARCHIVED'`),
  archived('StaffKnowledgeArticle', 'база знаний', `"status" = 'ARCHIVED'`),
  archived('StaffTrainingCourse', 'обучение', `"status" = 'ARCHIVED'`),
  archived('StaffOnboardingPlan', 'обучение', `"status" = 'ARCHIVED'`),
  archived('StaffAssessment', 'обучение', `"status" = 'ARCHIVED'`),
  archived(
    'StaffShiftRegulation',
    'регламенты смен',
    `"status" = 'ARCHIVED', "archivedAt" = COALESCE("archivedAt", now())`,
  ),
  archived('StaffSalaryScheme', 'зарплата', `"status" = 'ARCHIVED'`),
  archived('StaffChatChannel', 'чат', `"isArchived" = true`),
  // Append-only prize delivery history.
  ref('GuestGameDelivery', 'storeId', 'BLOCK', 'выдачи призов игры'),
  ref('GuestGameDeliveryAttempt', 'storeId', 'BLOCK', 'выдачи призов игры'),
  ref('GuestGameDeliveryEvent', 'storeId', 'BLOCK', 'выдачи призов игры'),
  // Network history that stays without a club.
  ref('GuestSession', 'storeId', 'DETACH', 'сеансы гостей'),
  ref('GuestTransaction', 'storeId', 'DETACH', 'операции гостей'),
  ref('GuestActivityRawRecord', 'storeId', 'DETACH', 'активность гостей'),
  ref('GuestActivityFact', 'storeId', 'DETACH', 'активность гостей'),
  ref('GuestActivitySyncState', 'storeId', 'DETACH', 'синхронизация гостей'),
  ref(
    'GuestActivitySourceSyncState',
    'storeId',
    'DETACH',
    'синхронизация гостей',
  ),
  ref('GuestActivitySyncJob', 'storeId', 'DETACH', 'синхронизация гостей'),
  ref('GuestOperationLog', 'storeId', 'DETACH', 'операции гостей'),
  ref('GuestWorkingShift', 'storeId', 'DETACH', 'смены'),
  ref('GuestBonusLedgerEntry', 'storeId', 'DETACH', 'бонусы гостей'),
  ref('GuestGameReward', 'storeId', 'DETACH', 'игра'),
  ref('GuestGameRewardWalletItem', 'storeId', 'DETACH', 'игра'),
  ref('GuestGameAuditEvent', 'storeId', 'DETACH', 'игра'),
  ref('GuestGameRuleDecision', 'storeId', 'DETACH', 'игра'),
  ref('GuestGameEntitlement', 'storeId', 'DETACH', 'игра'),
  ref('MarketingMissionReward', 'storeId', 'DETACH', 'маркетинг'),
  ref('MarketingPromoBundleUsage', 'storeId', 'DETACH', 'маркетинг'),
  ref('StaffMember', 'storeId', 'DETACH', 'сотрудники'),
  ref('StaffChecklistRun', 'storeId', 'DETACH', 'чек-листы'),
  ref('StaffShiftRegulationVersion', 'storeId', 'DETACH', 'регламенты смен'),
  ref('StaffDisciplineRecord', 'storeId', 'DETACH', 'дисциплина'),
  ref('StaffNotification', 'storeId', 'DETACH', 'уведомления сотрудников'),
  ref('StaffChatMessage', 'storeId', 'DETACH', 'чат'),
  // Id lists and audit copies without a FK.
  ref('GuestLeaderboardPeriodResult', 'storeId', 'KEEP', 'игра'),
  ref('GuestGameSeason', 'storeIds', 'KEEP', 'игра', 'JSONB_IDS'),
  ref('GuestGameMission', 'storeIds', 'KEEP', 'игра', 'JSONB_IDS'),
  ref('GuestGameLootBox', 'storeIds', 'KEEP', 'игра', 'JSONB_IDS'),
  ref('GuestGamePromoCard', 'storeIds', 'KEEP', 'игра', 'JSONB_IDS'),
  ref('MarketingCampaign', 'storeIds', 'KEEP', 'маркетинг', 'JSONB_IDS'),
  ref('MarketingMission', 'storeIds', 'KEEP', 'маркетинг', 'JSONB_IDS'),
  ref(
    'MarketingPromoBundleLaunch',
    'storeIds',
    'KEEP',
    'маркетинг',
    'JSONB_IDS',
  ),
  ref('StaffSalaryPeriod', 'storeIds', 'KEEP', 'зарплата', 'TEXT_IDS'),
  ref('StaffAttachmentBinding', 'resourceStoreId', 'KEEP', 'вложения'),
  ref('StaffTaskCatalogAuditEvent', 'effectiveStoreId', 'KEEP', 'задачи'),
];

/**
 * Columns handled by their own rules: club access rows go with the club
 * (ON DELETE CASCADE) unless an account would be left without clubs, and
 * pending invites to the club are revoked.
 */
export const STORE_REFERENCES_HANDLED_SEPARATELY: readonly string[] = [
  'UserStoreAccess.storeId',
  'UserInvite.storeIds',
];

export type NetworkStoreSummary = {
  id: string;
  name: string;
  isActive: boolean;
};

export type StoreDataCount = { label: string; count: number };

export type StoreDeletionPreview = {
  store: NetworkStoreSummary & { langameLinked: boolean };
  /** Rows deleted together with the club. */
  deletes: StoreDataCount[];
  /** Club-only settings archived and kept without a club. */
  archives: StoreDataCount[];
  /** Rows kept for the network without a club. */
  detaches: StoreDataCount[];
  /** Reasons the club cannot be deleted at all. */
  blockers: string[];
  warnings: string[];
};

export type DeleteStoreResult = {
  ok: true;
  tenantId: string;
  storeId: string;
  storeName: string;
  deleted: StoreDataCount[];
  archived: StoreDataCount[];
  detached: StoreDataCount[];
  revokedInvites: number;
};

type DeleteStoreCommand = {
  tenantId: string;
  storeId: string;
  actorUserId: string;
  actorKind: StoreDeletionActorKind;
  /** First confirmation: the exact club name. */
  storeName: unknown;
  /** Second confirmation: the word «УДАЛИТЬ». */
  confirmation: unknown;
  /** Re-checks the actor's authority inside the deleting transaction. */
  authorize: (tx: Prisma.TransactionClient) => Promise<void>;
};

type LockedStore = {
  id: string;
  name: string;
  isActive: boolean;
  publicSlug: string | null;
  externalClubId: string | null;
  integrationSourceId: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
/** A large club deletes hundreds of thousands of sales rows. */
const DELETE_TRANSACTION_TIMEOUT_MS = 5 * 60 * 1000;

@Injectable()
export class StoreDeletionService {
  private readonly logger = new Logger(StoreDeletionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listStores(tenantId: string): Promise<NetworkStoreSummary[]> {
    this.assertUuid(tenantId, 'Сеть не найдена');
    return this.prisma.store.findMany({
      where: { tenantId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, isActive: true },
    });
  }

  /** What deleting the club would remove, keep and why it may be refused. */
  async preview(
    tenantId: string,
    storeId: string,
  ): Promise<StoreDeletionPreview> {
    this.assertUuid(tenantId, 'Клуб не найден');
    this.assertUuid(storeId, 'Клуб не найден');
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, tenantId },
      select: {
        id: true,
        name: true,
        isActive: true,
        publicSlug: true,
        externalClubId: true,
        integrationSourceId: true,
      },
    });
    if (!store) {
      throw new NotFoundException('Клуб не найден');
    }
    return this.inspect(this.prisma, tenantId, store);
  }

  async deleteStore(command: DeleteStoreCommand): Promise<DeleteStoreResult> {
    this.assertUuid(command.tenantId, 'Клуб не найден');
    this.assertUuid(command.storeId, 'Клуб не найден');
    if (command.confirmation !== STORE_DELETE_CONFIRMATION) {
      throw new BadRequestException(
        `Для удаления клуба подтвердите действие словом «${STORE_DELETE_CONFIRMATION}»`,
      );
    }

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await command.authorize(tx);
          // One deletion per network at a time, so two requests cannot each
          // leave the other as the remaining active club.
          await tx.$queryRaw(
            Prisma.sql`
              SELECT pg_advisory_xact_lock(
                hashtextextended(${'store-delete:' + command.tenantId}, 0)
              )::TEXT AS acquired
            `,
          );
          // FOR UPDATE conflicts with the KEY SHARE lock every insert that
          // references the club takes, so nothing new attaches to it between
          // the checks and the delete.
          const locked = await tx.$queryRaw<Array<{ id: string }>>(
            Prisma.sql`
              SELECT "id" FROM public."Store"
              WHERE "id" = ${command.storeId} AND "tenantId" = ${command.tenantId}
              FOR UPDATE
            `,
          );
          if (locked.length === 0) {
            throw new NotFoundException('Клуб не найден');
          }
          const store = await tx.store.findUniqueOrThrow({
            where: { id: command.storeId },
            select: {
              id: true,
              name: true,
              isActive: true,
              publicSlug: true,
              externalClubId: true,
              integrationSourceId: true,
            },
          });
          if (
            typeof command.storeName !== 'string' ||
            command.storeName.trim() !== store.name.trim()
          ) {
            throw new BadRequestException(
              'Название клуба для подтверждения введено неверно',
            );
          }
          const preview = await this.inspect(tx, command.tenantId, store);
          if (preview.blockers.length > 0) {
            throw new ConflictException(
              `Клуб нельзя удалить: ${preview.blockers.join('; ')}`,
            );
          }

          for (const reference of STORE_REFERENCES) {
            const target = Prisma.sql`
              ${Prisma.raw(`public."${reference.table}"`)}
            `;
            const scope = Prisma.sql`
              "tenantId" = ${command.tenantId}
              AND ${Prisma.raw(`"${reference.column}"`)} = ${store.id}
            `;
            if (reference.action === 'DELETE') {
              await tx.$executeRaw(
                Prisma.sql`DELETE FROM ${target} WHERE ${scope}`,
              );
            } else if (reference.action === 'ARCHIVE') {
              await tx.$executeRaw(
                Prisma.sql`
                  UPDATE ${target}
                  SET ${Prisma.raw(reference.archiveSet ?? '')},
                    "updatedAt" = now()
                  WHERE ${scope}
                `,
              );
            }
          }
          const revokedInvites = await tx.$executeRaw(
            Prisma.sql`
              UPDATE public."UserInvite"
              SET "revokedAt" = now(), "updatedAt" = now()
              WHERE "tenantId" = ${command.tenantId}
                AND ${store.id}::TEXT = ANY("storeIds")
                AND "acceptedAt" IS NULL
                AND "revokedAt" IS NULL
            `,
          );
          await tx.store.delete({ where: { id: store.id } });
          await tx.platformAdminAuditEvent.create({
            data: {
              tenantId: command.tenantId,
              actorUserId: command.actorUserId,
              action: STORE_DELETED_ACTION,
              targetType: 'STORE',
              targetId: store.id,
              reason:
                command.actorKind === 'PLATFORM_ADMIN'
                  ? 'Platform admin deleted a club'
                  : 'Network owner deleted a club',
              before: {
                id: store.id,
                name: store.name,
                isActive: store.isActive,
                publicSlug: store.publicSlug,
                externalClubId: store.externalClubId,
              },
              after: Prisma.JsonNull,
              metadata: {
                actorKind: command.actorKind,
                deleted: preview.deletes,
                archived: preview.archives,
                detached: preview.detaches,
                revokedInvites,
              },
            },
          });

          return {
            ok: true as const,
            tenantId: command.tenantId,
            storeId: store.id,
            storeName: store.name,
            deleted: preview.deletes,
            archived: preview.archives,
            detached: preview.detaches,
            revokedInvites,
          };
        },
        { timeout: DELETE_TRANSACTION_TIMEOUT_MS },
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      // Protected history (attachments, append-only guards) refuses the whole
      // transaction; nothing is deleted.
      this.logger.warn(
        `Club ${command.storeId} deletion refused by the database: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new ConflictException(
        'База данных не дала удалить клуб: часть его истории защищена от удаления (например, вложения задач). Ничего не удалено, клуб можно отправить в архив',
      );
    }
  }

  /** Fresh check that the actor is an active network-wide owner of the tenant. */
  async assertFreshNetworkOwner(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    tenantId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<
      Array<{
        tenantId: string;
        isActive: boolean;
        role: UserRole;
        accessScope: UserAccessScope;
      }>
    >(
      Prisma.sql`
        SELECT "tenantId", "isActive", "role"::TEXT AS "role",
          "accessScope"::TEXT AS "accessScope"
        FROM public."User"
        WHERE "id" = ${actorUserId}
        FOR SHARE
      `,
    );
    const actor = rows[0];
    if (
      !actor?.isActive ||
      actor.tenantId !== tenantId ||
      actor.role !== UserRole.OWNER ||
      actor.accessScope !== UserAccessScope.NETWORK
    ) {
      throw new ForbiddenException(
        'Удалять клубы может только владелец сети с доступом ко всей сети',
      );
    }
  }

  private async inspect(
    client: Prisma.TransactionClient,
    tenantId: string,
    store: LockedStore,
  ): Promise<StoreDeletionPreview> {
    const counted = STORE_REFERENCES.filter(
      (reference) => reference.action !== 'KEEP',
    );
    const rows = await client.$queryRaw<
      Array<{ action: StoreReferenceAction; label: string; count: number }>
    >(
      Prisma.sql`${Prisma.join(
        counted.map(
          (reference) => Prisma.sql`
            SELECT ${reference.action}::TEXT AS "action",
              ${reference.label}::TEXT AS "label",
              count(*)::INT AS "count"
            FROM ${Prisma.raw(`public."${reference.table}"`)}
            WHERE "tenantId" = ${tenantId}
              AND ${Prisma.raw(`"${reference.column}"`)} = ${store.id}
          `,
        ),
        ' UNION ALL ',
      )}`,
    );
    const sum = (action: StoreReferenceAction) => {
      const totals = new Map<string, number>();
      for (const row of rows) {
        if (row.action === action && row.count > 0) {
          totals.set(row.label, (totals.get(row.label) ?? 0) + row.count);
        }
      }
      return [...totals].map(([label, count]) => ({ label, count }));
    };

    const blockers: string[] = [];
    if (store.isActive) {
      const otherActiveStores = await client.store.count({
        where: { tenantId, isActive: true, id: { not: store.id } },
      });
      if (otherActiveStores === 0) {
        blockers.push(
          'это единственный действующий клуб сети, сначала добавьте другой',
        );
      }
    }
    for (const blocked of sum('BLOCK')) {
      blockers.push(
        `${blocked.label} (${blocked.count}): эта история неизменяема`,
      );
    }
    // The database refuses to delete a task while a file is bound to it.
    const boundAttachments = await client.$queryRaw<Array<{ count: number }>>(
      Prisma.sql`
        SELECT count(*)::INT AS "count"
        FROM public."StaffAttachmentBinding" AS binding
        JOIN public."StaffTask" AS task
          ON task."id" = binding."resourceId"
         AND task."tenantId" = binding."tenantId"
        WHERE binding."tenantId" = ${tenantId}
          AND binding."resourceKind" = 'STAFF_TASK'
          AND binding."state" = 'BOUND'
          AND task."storeId" = ${store.id}
      `,
    );
    if ((boundAttachments[0]?.count ?? 0) > 0) {
      blockers.push(
        `к задачам клуба прикреплены файлы (${boundAttachments[0].count}), сначала удалите их из задач`,
      );
    }
    const strandedStaff = await client.$queryRaw<Array<{ count: number }>>(
      Prisma.sql`
        SELECT count(*)::INT AS "count"
        FROM public."UserStoreAccess" AS access
        JOIN public."User" AS app_user ON app_user."id" = access."userId"
        WHERE access."storeId" = ${store.id}
          AND app_user."isActive" = true
          AND NOT EXISTS (
            SELECT 1 FROM public."UserStoreAccess" AS other
            WHERE other."userId" = access."userId"
              AND other."storeId" <> access."storeId"
          )
      `,
    );
    if ((strandedStaff[0]?.count ?? 0) > 0) {
      blockers.push(
        `у сотрудников (${strandedStaff[0].count}) это единственный клуб доступа, сначала дайте им другой клуб или отключите их`,
      );
    }

    const warnings: string[] = [];
    const langameLinked = Boolean(
      store.externalClubId || store.integrationSourceId,
    );
    if (langameLinked) {
      warnings.push(
        'Клуб подключён к Langame: если он остаётся в Langame, следующая синхронизация создаст его заново, уже без старых данных',
      );
    }

    return {
      store: {
        id: store.id,
        name: store.name,
        isActive: store.isActive,
        langameLinked,
      },
      deletes: sum('DELETE'),
      archives: sum('ARCHIVE'),
      detaches: sum('DETACH'),
      blockers,
      warnings,
    };
  }

  private assertUuid(value: string, message: string): void {
    if (!UUID_PATTERN.test(value)) {
      throw new NotFoundException(message);
    }
  }
}

function ref(
  table: string,
  column: string,
  action: StoreReferenceAction,
  label: string,
  kind: StoreReferenceKind = 'ID',
): StoreReference {
  return { table, column, kind, action, label };
}

function archived(
  table: string,
  label: string,
  archiveSet: string,
): StoreReference {
  return {
    table,
    column: 'storeId',
    kind: 'ID',
    action: 'ARCHIVE',
    label,
    archiveSet,
  };
}
