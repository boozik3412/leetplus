import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserAccessScope, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const STORE_DELETED_ACTION = 'STORE_DELETED';
export const STORE_DELETE_CONFIRMATION = 'УДАЛИТЬ';

export type StoreDeletionActorKind = 'PLATFORM_ADMIN' | 'NETWORK_OWNER';

type StoreReferenceKind = 'ID' | 'JSONB_IDS' | 'TEXT_IDS';

type StoreReference = {
  table: string;
  column: string;
  kind: StoreReferenceKind;
  label: string;
};

/**
 * Every column that points at a club. Most foreign keys to Store are
 * ON DELETE SET NULL, so deleting a club that is still referenced would
 * silently detach sales, guests or staff from it; deletion therefore refuses
 * while any row below still names the club. The PostgreSQL spec compares this
 * list with the catalog, so a new reference must be added here.
 */
export const STORE_REFERENCES: readonly StoreReference[] = [
  ref('SalesFact', 'storeId', 'продажи'),
  ref('ClubRevenueFact', 'storeId', 'выручка'),
  ref('InventorySnapshot', 'storeId', 'остатки'),
  ref('StockMovement', 'storeId', 'движения товаров'),
  ref('LangameClubProductConfiguration', 'storeId', 'настройки Langame'),
  ref('GuestSession', 'storeId', 'сеансы гостей'),
  ref('GuestTransaction', 'storeId', 'операции гостей'),
  ref('GuestActivityRawRecord', 'storeId', 'активность гостей'),
  ref('GuestActivityFact', 'storeId', 'активность гостей'),
  ref('GuestActivitySyncState', 'storeId', 'синхронизация гостей'),
  ref('GuestActivitySourceSyncState', 'storeId', 'синхронизация гостей'),
  ref('GuestActivitySyncJob', 'storeId', 'синхронизация гостей'),
  ref('GuestOperationLog', 'storeId', 'операции гостей'),
  ref('GuestWorkingShift', 'storeId', 'смены'),
  ref('GuestBonusLedgerEntry', 'storeId', 'бонусы гостей'),
  ref('GuestSupportTicket', 'storeId', 'обращения гостей'),
  ref('GuestPortalOtpChallenge', 'storeId', 'входы гостей'),
  ref('GuestGameTelegramLinkChallenge', 'storeId', 'игра'),
  ref('GuestGameReward', 'storeId', 'игра'),
  ref('GuestGameRewardWalletItem', 'storeId', 'игра'),
  ref('GuestGameDelivery', 'storeId', 'игра'),
  ref('GuestGameDeliveryEvent', 'storeId', 'игра'),
  ref('GuestGameDeliveryAttempt', 'storeId', 'игра'),
  ref('GuestGameAuditEvent', 'storeId', 'игра'),
  ref('GuestGameRuleDecision', 'storeId', 'игра'),
  ref('GuestGameEntitlement', 'storeId', 'игра'),
  ref('GuestGameVisualDraft', 'storeId', 'игра'),
  ref('GuestLeaderboardPeriodResult', 'storeId', 'игра'),
  ref('GuestGameSeason', 'storeIds', 'игра', 'JSONB_IDS'),
  ref('GuestGameMission', 'storeIds', 'игра', 'JSONB_IDS'),
  ref('GuestGameLootBox', 'storeIds', 'игра', 'JSONB_IDS'),
  ref('GuestGamePromoCard', 'storeIds', 'игра', 'JSONB_IDS'),
  ref('MarketingCampaign', 'storeIds', 'маркетинг', 'JSONB_IDS'),
  ref('MarketingMission', 'storeIds', 'маркетинг', 'JSONB_IDS'),
  ref('MarketingPromoBundleLaunch', 'storeIds', 'маркетинг', 'JSONB_IDS'),
  ref('MarketingMissionReward', 'storeId', 'маркетинг'),
  ref('MarketingPromoBundleUsage', 'storeId', 'маркетинг'),
  ref('StaffMember', 'storeId', 'сотрудники'),
  ref('StaffTask', 'storeId', 'задачи'),
  ref('StaffTaskTemplate', 'storeId', 'задачи'),
  ref('StaffTaskRecurringRule', 'storeId', 'задачи'),
  ref('StaffTaskCatalogAuditEvent', 'effectiveStoreId', 'задачи'),
  ref('StaffChecklistTemplate', 'storeId', 'чек-листы'),
  ref('StaffChecklistRun', 'storeId', 'чек-листы'),
  ref('StaffKnowledgeArticle', 'storeId', 'база знаний'),
  ref('StaffTrainingCourse', 'storeId', 'обучение'),
  ref('StaffOnboardingPlan', 'storeId', 'обучение'),
  ref('StaffAssessment', 'storeId', 'обучение'),
  ref('StaffShiftRegulation', 'storeId', 'регламенты смен'),
  ref('StaffShiftRegulationVersion', 'storeId', 'регламенты смен'),
  ref('StaffDisciplinePolicy', 'storeId', 'дисциплина'),
  ref('StaffDisciplineRecord', 'storeId', 'дисциплина'),
  ref('StaffSalaryScheme', 'storeId', 'зарплата'),
  ref('StaffSalaryPeriod', 'storeIds', 'зарплата', 'TEXT_IDS'),
  ref('StaffNotification', 'storeId', 'уведомления сотрудников'),
  ref('StaffChatChannel', 'storeId', 'чат'),
  ref('StaffChatMessage', 'storeId', 'чат'),
  ref('StaffAttachmentBinding', 'resourceStoreId', 'вложения'),
  ref('StoreClosure', 'storeId', 'дни закрытия'),
];

/**
 * Columns checked by their own queries below: club access rows exist only for
 * accounts limited to clubs (the database refuses them for network-wide
 * accounts), and only pending invites block deletion.
 */
export const STORE_REFERENCES_HANDLED_SEPARATELY: readonly string[] = [
  'UserStoreAccess.storeId',
  'UserInvite.storeIds',
];

export type StoreDeletionCandidate = {
  id: string;
  name: string;
  isActive: boolean;
  blockers: string[];
};

export type DeleteStoreResult = {
  ok: true;
  tenantId: string;
  storeId: string;
  storeName: string;
};

type DeleteStoreCommand = {
  tenantId: string;
  storeId: string;
  actorUserId: string;
  actorKind: StoreDeletionActorKind;
  confirmation: unknown;
  /** Re-checks the actor's authority inside the deleting transaction. */
  authorize: (tx: Prisma.TransactionClient) => Promise<void>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

@Injectable()
export class StoreDeletionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Clubs of a network with the reasons each one cannot be deleted yet. */
  async listCandidates(tenantId: string): Promise<StoreDeletionCandidate[]> {
    if (!UUID_PATTERN.test(tenantId)) {
      throw new NotFoundException('Сеть не найдена');
    }
    const stores = await this.prisma.store.findMany({
      where: { tenantId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        isActive: true,
        externalClubId: true,
        integrationSourceId: true,
      },
    });
    const activeCount = stores.filter((store) => store.isActive).length;
    const candidates: StoreDeletionCandidate[] = [];
    for (const store of stores) {
      const blockers = await this.blockers(this.prisma, tenantId, store);
      if (store.isActive && activeCount <= 1) {
        blockers.unshift('это единственный действующий клуб сети');
      }
      candidates.push({
        id: store.id,
        name: store.name,
        isActive: store.isActive,
        blockers,
      });
    }
    return candidates;
  }

  async deleteStore(command: DeleteStoreCommand): Promise<DeleteStoreResult> {
    if (command.confirmation !== STORE_DELETE_CONFIRMATION) {
      throw new BadRequestException(
        `Для удаления клуба введите «${STORE_DELETE_CONFIRMATION}»`,
      );
    }
    if (
      !UUID_PATTERN.test(command.tenantId) ||
      !UUID_PATTERN.test(command.storeId)
    ) {
      throw new NotFoundException('Клуб не найден');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await command.authorize(tx);
        // One deletion per network at a time, so two requests cannot each
        // leave the other as the "remaining" club.
        await tx.$queryRaw(
          Prisma.sql`
            SELECT pg_advisory_xact_lock(
              hashtextextended(${'store-delete:' + command.tenantId}, 0)
            )::TEXT AS acquired
          `,
        );
        // FOR UPDATE conflicts with the KEY SHARE lock every insert that
        // references the club takes, so nothing new can attach to it between
        // the checks below and the delete.
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
        const otherActiveStores = await tx.store.count({
          where: {
            tenantId: command.tenantId,
            isActive: true,
            id: { not: store.id },
          },
        });
        if (otherActiveStores === 0) {
          throw new ConflictException(
            'Нельзя удалить единственный действующий клуб сети. Сначала добавьте другой клуб',
          );
        }
        const blockers = await this.blockers(tx, command.tenantId, store);
        if (blockers.length > 0) {
          throw new ConflictException(
            `Удалить можно только клуб без данных. У этого клуба есть: ${blockers.join(', ')}. Его можно отправить в архив`,
          );
        }

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
                ? 'Platform admin deleted an empty club'
                : 'Network owner deleted an empty club',
            before: {
              id: store.id,
              name: store.name,
              isActive: store.isActive,
              publicSlug: store.publicSlug,
            },
            after: Prisma.JsonNull,
            metadata: { actorKind: command.actorKind },
          },
        });

        return {
          ok: true as const,
          tenantId: command.tenantId,
          storeId: store.id,
          storeName: store.name,
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'У клуба остались связанные данные, удалить его нельзя. Его можно отправить в архив',
        );
      }
      throw error;
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

  private async blockers(
    client: Prisma.TransactionClient,
    tenantId: string,
    store: {
      id: string;
      externalClubId: string | null;
      integrationSourceId: string | null;
    },
  ): Promise<string[]> {
    const checks = [
      ...STORE_REFERENCES.map((reference) =>
        this.referenceCheck(reference, tenantId, store.id),
      ),
      Prisma.sql`
        SELECT 'сотрудники с доступом только к этому клубу' AS "label"
        WHERE EXISTS (
            SELECT 1 FROM public."UserStoreAccess" WHERE "storeId" = ${store.id}
        )
      `,
      Prisma.sql`
        SELECT 'неиспользованные приглашения' AS "label"
        WHERE EXISTS (
          SELECT 1 FROM public."UserInvite"
          WHERE "tenantId" = ${tenantId}
            AND ${store.id}::TEXT = ANY("storeIds")
            AND "acceptedAt" IS NULL
            AND "revokedAt" IS NULL
        )
      `,
    ];
    const rows = await client.$queryRaw<Array<{ label: string }>>(
      Prisma.sql`${Prisma.join(checks, ' UNION ALL ')}`,
    );
    const labels = [...new Set(rows.map((row) => row.label))];
    if (store.externalClubId || store.integrationSourceId) {
      labels.unshift('подключение к Langame');
    }
    return labels;
  }

  private referenceCheck(
    reference: StoreReference,
    tenantId: string,
    storeId: string,
  ): Prisma.Sql {
    const table = Prisma.raw(`public."${reference.table}"`);
    const column = Prisma.raw(`"${reference.column}"`);
    const match =
      reference.kind === 'ID'
        ? Prisma.sql`${column} = ${storeId}`
        : reference.kind === 'JSONB_IDS'
          ? Prisma.sql`${column} @> jsonb_build_array(${storeId}::TEXT)`
          : Prisma.sql`${storeId}::TEXT = ANY(${column})`;
    return Prisma.sql`
      SELECT ${reference.label}::TEXT AS "label"
      WHERE EXISTS (
        SELECT 1 FROM ${table}
        WHERE "tenantId" = ${tenantId} AND ${match}
      )
    `;
  }
}

function ref(
  table: string,
  column: string,
  label: string,
  kind: StoreReferenceKind = 'ID',
): StoreReference {
  return { table, column, kind, label };
}
