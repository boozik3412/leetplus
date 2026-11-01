import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  TenantCustomerStage,
  TenantLifecycleStatus,
  TenantOnboardingStatus,
  UserAccessScope,
  UserRole,
} from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SHARED_BETA_INITIAL_OWNER_CAPABILITIES } from '../auth/capabilities';
import { PrismaService } from '../prisma/prisma.service';
import { OPEN_ENDED_TENANT_ACCESS_ENDS_AT } from '../tenancy/tenant-access-window';
import { COMPLETE_TENANT_MODULE_PROFILE } from '../tenancy/tenant-entitlement-profile.service';

export const PLATFORM_NETWORK_CREATED_ACTION = 'PLATFORM_NETWORK_CREATED';
export const PLATFORM_NETWORK_OWNER_LINK_ISSUED_ACTION =
  'PLATFORM_NETWORK_OWNER_LINK_ISSUED';
export const PLATFORM_NETWORK_DELETED_ACTION = 'PLATFORM_NETWORK_DELETED';

/** The only delivery mode of a network-owner link: nothing is mailed. */
export const NETWORK_OWNER_LINK_DELIVERY_MODE = 'LINK';

const DEFAULT_OWNER_LINK_DAYS = 7;
const FIRST_STORE_NAME = 'Компьютерный клуб 1';
const FIRST_STORE_TIME_ZONE = 'Europe/Moscow';
const MAX_OWNER_LINK_DAYS = 30;
const MAX_ACCESS_DAYS = 3650;
const DAY_MS = 24 * 60 * 60 * 1000;
const TENANT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const CREATE_FIELDS = new Set([
  'tenantName',
  'tenantSlug',
  'accessDays',
  'linkExpiresInDays',
]);
const OWNER_LINK_FIELDS = new Set(['confirmation', 'linkExpiresInDays']);
const DELETE_FIELDS = new Set(['confirmation']);

type CreateNetworkCommand = {
  tenantName: string;
  tenantSlug: string;
  /** Null keeps the network open until the platform admin closes it. */
  accessDays: number | null;
  linkExpiresInDays: number;
};

export type PlatformNetworkOwnerLink = {
  inviteId: string;
  expiresAt: string;
  /** Bearer secret: returned once, never stored, logged or audited. */
  registrationUrl: string;
};

export type CreatePlatformNetworkResult = {
  ok: true;
  tenant: {
    id: string;
    name: string;
    slug: string;
    status: TenantLifecycleStatus;
    customerStage: TenantCustomerStage;
    onboardingStatus: TenantOnboardingStatus;
    trialStartsAt: string;
    trialEndsAt: string;
  };
  ownerLink: PlatformNetworkOwnerLink;
};

export type IssuePlatformNetworkOwnerLinkResult = {
  ok: true;
  tenantId: string;
  revokedInviteIds: string[];
  ownerLink: PlatformNetworkOwnerLink;
};

export type DeletePlatformNetworkResult = {
  ok: true;
  tenantId: string;
  tenantSlug: string;
  deletedUsers: number;
  deletedInvites: number;
  deletedStores: number;
};

/**
 * Platform-admin workflow that creates a new club network (tenant) and hands
 * its future owner a one-time registration link, without mail delivery.
 *
 * The network starts as ACTIVE/PILOT/ONBOARDING with the complete module
 * profile (outbound OFF) and one temporary club with gamification and
 * background execution OFF; the owner renames it and adds clubs after sign-up.
 * The owner invite is an open `OWNER/NETWORK` link (`email = NULL`,
 * `deliveryMode = LINK`), so the owner names their own login when
 * registering; `AuthService.acceptInvite` admits it only while the network
 * still has no OWNER and the link was issued by a platform admin.
 */
@Injectable()
export class PlatformNetworkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async create(
    actor: AuthenticatedUser,
    dto: unknown,
    now = new Date(),
  ): Promise<CreatePlatformNetworkResult> {
    this.assertPlatformAdminActor(actor);
    const command = this.parseCreate(dto);
    const trialEndsAt =
      command.accessDays === null
        ? OPEN_ENDED_TENANT_ACCESS_ENDS_AT
        : new Date(now.getTime() + command.accessDays * DAY_MS);

    return this.prisma.$transaction(async (tx) => {
      await this.assertFreshPlatformAdmin(tx, actor.id);
      await tx.$queryRaw(
        Prisma.sql`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${'platform-network-slug:' + command.tenantSlug}, 0)
          )::TEXT AS acquired
        `,
      );
      const slugOwner = await tx.tenant.findFirst({
        where: { slug: { equals: command.tenantSlug, mode: 'insensitive' } },
        select: { id: true },
      });
      if (slugOwner) {
        throw new ConflictException('Сеть с таким адресом (slug) уже есть');
      }

      const tenant = await tx.tenant.create({
        data: {
          id: randomUUID(),
          name: command.tenantName,
          slug: command.tenantSlug,
          status: TenantLifecycleStatus.ACTIVE,
          customerStage: TenantCustomerStage.PILOT,
          onboardingStatus: TenantOnboardingStatus.ONBOARDING,
          supportOwnerUserId: actor.id,
          trialStartsAt: now,
          trialEndsAt,
          entitlementProfileRevision: 1,
          // Execution admission refuses revision 0, and after insert the
          // revision is trigger-owned, so a new network must start at 1.
          executionRevision: 1,
          statusChangedAt: now,
          statusReason: 'Created by platform admin with an owner link',
        },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          customerStage: true,
          onboardingStatus: true,
          trialStartsAt: true,
          trialEndsAt: true,
        },
      });
      // The owner's first-run checklist asks to rename this temporary club and
      // check its time zone; the executive dashboard needs one club in scope.
      await tx.store.create({
        data: {
          tenantId: tenant.id,
          name: FIRST_STORE_NAME,
          publicSlug: `${tenant.slug}-main`,
          timeZone: FIRST_STORE_TIME_ZONE,
          isActive: true,
          gamificationEnabled: false,
          backgroundExecutionEnabled: false,
        },
      });
      await tx.userRoleOverride.create({
        data: {
          tenantId: tenant.id,
          role: UserRole.OWNER,
          permissions: [...SHARED_BETA_INITIAL_OWNER_CAPABILITIES],
        },
      });
      await tx.tenantModuleEntitlement.createMany({
        data: COMPLETE_TENANT_MODULE_PROFILE.map((module) => ({
          id: randomUUID(),
          tenantId: tenant.id,
          module,
          readEnabled: true,
          writeEnabled: true,
          outboundEnabled: false,
          validFrom: null,
          validUntil: null,
          profileRevision: 1,
          reason: 'Platform network created',
          createdAt: now,
          updatedAt: now,
        })),
      });

      const ownerLink = await this.createOwnerInvite(
        tx,
        tenant.id,
        actor.id,
        command.linkExpiresInDays,
        now,
      );
      const result: CreatePlatformNetworkResult = {
        ok: true,
        tenant: {
          ...tenant,
          trialStartsAt: now.toISOString(),
          trialEndsAt: trialEndsAt.toISOString(),
        },
        ownerLink,
      };

      await tx.platformAdminAuditEvent.create({
        data: {
          tenantId: tenant.id,
          actorUserId: actor.id,
          action: PLATFORM_NETWORK_CREATED_ACTION,
          targetType: 'TENANT',
          targetId: tenant.id,
          reason: 'Platform admin created a network with an owner link',
          before: Prisma.JsonNull,
          after: result.tenant,
          metadata: {
            ownerInviteId: ownerLink.inviteId,
            ownerInviteExpiresAt: ownerLink.expiresAt,
            ownerInviteDeliveryMode: NETWORK_OWNER_LINK_DELIVERY_MODE,
            accessDays: command.accessDays,
            moduleCount: COMPLETE_TENANT_MODULE_PROFILE.length,
            outboundDefault: 'OFF',
            initialStoreCount: 1,
          },
        },
      });

      return result;
    });
  }

  /**
   * Revokes the pending owner link(s) of a network that still has no OWNER
   * and issues a fresh one. The previous URL is never shown again.
   */
  async issueOwnerLink(
    actor: AuthenticatedUser,
    tenantId: string,
    dto: unknown,
    now = new Date(),
  ): Promise<IssuePlatformNetworkOwnerLinkResult> {
    this.assertPlatformAdminActor(actor);
    const body = this.record(dto, OWNER_LINK_FIELDS);
    const linkExpiresInDays = this.days(
      body.linkExpiresInDays,
      'linkExpiresInDays',
      MAX_OWNER_LINK_DAYS,
      DEFAULT_OWNER_LINK_DAYS,
    );

    return this.prisma.$transaction(async (tx) => {
      await this.assertFreshPlatformAdmin(tx, actor.id);
      const tenant = await this.lockTenant(tx, tenantId);
      if (body.confirmation !== tenant.slug) {
        throw new BadRequestException('Подтвердите действие адресом сети');
      }
      if (
        tenant.status !== TenantLifecycleStatus.ACTIVE ||
        tenant.onboardingStatus !== TenantOnboardingStatus.ONBOARDING ||
        tenant.customerStage === TenantCustomerStage.INTERNAL
      ) {
        throw new ConflictException(
          'Ссылку владельца можно выдать только активной внешней сети на этапе подключения',
        );
      }
      const ownerCount = await tx.user.count({
        where: { tenantId: tenant.id, role: UserRole.OWNER },
      });
      if (ownerCount !== 0) {
        throw new ConflictException('У сети уже есть владелец');
      }

      const pending = await tx.userInvite.findMany({
        where: {
          tenantId: tenant.id,
          role: UserRole.OWNER,
          acceptedAt: null,
          revokedAt: null,
        },
        select: { id: true, email: true, deliveryMode: true },
      });
      if (
        pending.some(
          (invite) =>
            invite.email !== null ||
            invite.deliveryMode !== NETWORK_OWNER_LINK_DELIVERY_MODE,
        )
      ) {
        throw new ConflictException(
          'У сети есть приглашение владельца по почте; используйте отзыв и перевыпуск приглашения',
        );
      }
      const revokedInviteIds = pending.map((invite) => invite.id);
      if (revokedInviteIds.length > 0) {
        await tx.userInvite.updateMany({
          where: {
            id: { in: revokedInviteIds },
            acceptedAt: null,
            revokedAt: null,
          },
          data: { revokedAt: now, revokedByUserId: actor.id },
        });
      }

      const ownerLink = await this.createOwnerInvite(
        tx,
        tenant.id,
        actor.id,
        linkExpiresInDays,
        now,
      );
      await tx.platformAdminAuditEvent.create({
        data: {
          tenantId: tenant.id,
          actorUserId: actor.id,
          action: PLATFORM_NETWORK_OWNER_LINK_ISSUED_ACTION,
          targetType: 'USER_INVITE',
          targetId: ownerLink.inviteId,
          reason: 'Platform admin issued a new network owner link',
          metadata: {
            revokedInviteIds,
            ownerInviteExpiresAt: ownerLink.expiresAt,
            ownerInviteDeliveryMode: NETWORK_OWNER_LINK_DELIVERY_MODE,
          },
        },
      });

      return { ok: true, tenantId: tenant.id, revokedInviteIds, ownerLink };
    });
  }

  /**
   * Permanently removes an empty network: no integrations, products, sales
   * or guests, and no platform admin among its accounts. Its clubs, accounts,
   * invites, role overrides and module rows go with it; worker artifacts
   * cascade; platform audit keeps its rows with `tenantId = NULL`. Anything
   * else still pointing at the network makes the foreign keys refuse it.
   *
   * Accounts that registered through the identity claim boundary hold an
   * `IdentityEmailClaim` the runtime may not delete, so such a network is
   * refused by the foreign key instead of being half-deleted.
   */
  async delete(
    actor: AuthenticatedUser,
    tenantId: string,
    dto: unknown,
  ): Promise<DeletePlatformNetworkResult> {
    this.assertPlatformAdminActor(actor);
    const body = this.record(dto, DELETE_FIELDS);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertFreshPlatformAdmin(tx, actor.id);
        const tenant = await this.lockTenant(tx, tenantId);
        if (body.confirmation !== `DELETE ${tenant.slug}`) {
          throw new BadRequestException(
            `Для удаления введите «DELETE ${tenant.slug}»`,
          );
        }
        if (tenant.id === actor.tenantId) {
          throw new ConflictException(
            'Нельзя удалить сеть, к которой привязан платформенный администратор',
          );
        }

        const [
          platformAdmins,
          integrationSources,
          products,
          salesFacts,
          guests,
          users,
        ] = await Promise.all([
          tx.user.count({
            where: { tenantId: tenant.id, isPlatformAdmin: true },
          }),
          tx.integrationSource.count({ where: { tenantId: tenant.id } }),
          tx.product.count({ where: { tenantId: tenant.id } }),
          tx.salesFact.count({ where: { tenantId: tenant.id } }),
          tx.guest.count({ where: { tenantId: tenant.id } }),
          tx.user.findMany({
            where: { tenantId: tenant.id },
            select: { id: true, role: true },
          }),
        ]);
        if (platformAdmins > 0) {
          throw new ConflictException(
            'В сети есть платформенный администратор, удалить её нельзя',
          );
        }
        const blockers = [
          integrationSources > 0 ? `интеграции: ${integrationSources}` : null,
          products > 0 ? `товары: ${products}` : null,
          salesFacts > 0 ? `продажи: ${salesFacts}` : null,
          guests > 0 ? `гости: ${guests}` : null,
        ].filter((value): value is string => value !== null);
        if (blockers.length > 0) {
          throw new ConflictException(
            `Удалить можно только пустую сеть. В этой сети есть ${blockers.join(', ')}`,
          );
        }

        const userIds = users.map((user) => user.id);
        const invites = await tx.userInvite.deleteMany({
          where: { tenantId: tenant.id },
        });
        if (userIds.length > 0) {
          await tx.userStoreAccess.deleteMany({
            where: { userId: { in: userIds } },
          });
          await tx.user.deleteMany({ where: { id: { in: userIds } } });
        }
        await tx.userRoleOverride.deleteMany({
          where: { tenantId: tenant.id },
        });
        await tx.tenantModuleEntitlement.deleteMany({
          where: { tenantId: tenant.id },
        });
        const stores = await tx.store.deleteMany({
          where: { tenantId: tenant.id },
        });
        await tx.tenant.delete({ where: { id: tenant.id } });

        const result: DeletePlatformNetworkResult = {
          ok: true,
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          deletedUsers: userIds.length,
          deletedInvites: invites.count,
          deletedStores: stores.count,
        };
        await tx.platformAdminAuditEvent.create({
          data: {
            tenantId: null,
            actorUserId: actor.id,
            action: PLATFORM_NETWORK_DELETED_ACTION,
            targetType: 'TENANT',
            targetId: tenant.id,
            reason: 'Platform admin deleted an empty network',
            before: {
              id: tenant.id,
              name: tenant.name,
              slug: tenant.slug,
              status: tenant.status,
              customerStage: tenant.customerStage,
              onboardingStatus: tenant.onboardingStatus,
            },
            after: Prisma.JsonNull,
            metadata: {
              deletedUserIds: userIds,
              deletedUserRoles: users.map((user) => user.role),
              deletedInvites: invites.count,
              deletedStores: stores.count,
            },
          },
        });

        return result;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'В сети остались связанные данные или зарегистрированные учётные записи, поэтому удалить её целиком нельзя',
        );
      }
      throw error;
    }
  }

  private async createOwnerInvite(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string,
    linkExpiresInDays: number,
    now: Date,
  ): Promise<PlatformNetworkOwnerLink> {
    const rawToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + linkExpiresInDays * DAY_MS);
    const invite = await tx.userInvite.create({
      data: {
        id: randomUUID(),
        tenantId,
        email: null,
        fullName: null,
        role: UserRole.OWNER,
        customRoleId: null,
        accessScope: UserAccessScope.NETWORK,
        storeIds: [],
        tokenHash: createHash('sha256').update(rawToken).digest('hex'),
        expiresAt,
        createdByUserId: actorUserId,
        identityClaimRevision: null,
        deliveryMode: NETWORK_OWNER_LINK_DELIVERY_MODE,
      },
      select: { id: true, expiresAt: true },
    });

    return {
      inviteId: invite.id,
      expiresAt: invite.expiresAt.toISOString(),
      registrationUrl: this.buildRegistrationUrl(rawToken),
    };
  }

  private async lockTenant(tx: Prisma.TransactionClient, tenantId: string) {
    if (!this.isUuid(tenantId)) {
      throw new NotFoundException('Сеть не найдена');
    }
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM public."Tenant" WHERE "id" = ${tenantId} FOR UPDATE`,
    );
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        customerStage: true,
        onboardingStatus: true,
      },
    });
    if (!tenant) {
      throw new NotFoundException('Сеть не найдена');
    }
    return tenant;
  }

  private async assertFreshPlatformAdmin(
    tx: Prisma.TransactionClient,
    actorUserId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<
      Array<{ isActive: boolean; isPlatformAdmin: boolean }>
    >(
      Prisma.sql`
        SELECT "isActive", "isPlatformAdmin"
        FROM public."User"
        WHERE "id" = ${actorUserId}
        FOR SHARE
      `,
    );
    if (!rows[0]?.isActive || !rows[0]?.isPlatformAdmin) {
      throw new ForbiddenException(
        'Platform administrator authority is no longer active',
      );
    }
  }

  private assertPlatformAdminActor(actor: AuthenticatedUser): void {
    if (!actor?.id || !actor.isPlatformAdmin || actor.isActive === false) {
      throw new ForbiddenException('Platform administrator access is required');
    }
  }

  private parseCreate(dto: unknown): CreateNetworkCommand {
    const body = this.record(dto, CREATE_FIELDS);
    const tenantName =
      typeof body.tenantName === 'string' ? body.tenantName.trim() : '';
    if (tenantName.length < 2 || tenantName.length > 120) {
      throw new BadRequestException(
        'Название сети должно быть от 2 до 120 символов',
      );
    }
    const tenantSlug =
      typeof body.tenantSlug === 'string'
        ? body.tenantSlug.trim().toLowerCase()
        : '';
    if (
      tenantSlug.length < 3 ||
      tenantSlug.length > 63 ||
      !TENANT_SLUG_PATTERN.test(tenantSlug)
    ) {
      throw new BadRequestException(
        'Адрес сети (slug): 3–63 символа, латиница в нижнем регистре, цифры и одиночные дефисы',
      );
    }

    return {
      tenantName,
      tenantSlug,
      accessDays:
        body.accessDays === null || body.accessDays === undefined
          ? null
          : this.days(body.accessDays, 'accessDays', MAX_ACCESS_DAYS, 0),
      linkExpiresInDays: this.days(
        body.linkExpiresInDays,
        'linkExpiresInDays',
        MAX_OWNER_LINK_DAYS,
        DEFAULT_OWNER_LINK_DAYS,
      ),
    };
  }

  private record(
    dto: unknown,
    allowed: ReadonlySet<string>,
  ): Record<string, unknown> {
    if (typeof dto !== 'object' || dto === null || Array.isArray(dto)) {
      throw new BadRequestException('Request body must be an object');
    }
    const unexpected = Object.keys(dto).filter((key) => !allowed.has(key));
    if (unexpected.length > 0) {
      throw new BadRequestException(
        `Unsupported fields: ${unexpected.join(', ')}`,
      );
    }
    return dto as Record<string, unknown>;
  }

  private days(
    value: unknown,
    field: string,
    max: number,
    fallback: number,
  ): number {
    if (value === undefined || value === null) {
      if (fallback > 0) {
        return fallback;
      }
      throw new BadRequestException(`${field} is required`);
    }
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < 1 ||
      value > max
    ) {
      throw new BadRequestException(`${field} must be an integer 1..${max}`);
    }
    return value;
  }

  private isUuid(value: unknown): value is string {
    return (
      typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        value,
      )
    );
  }

  private buildRegistrationUrl(token: string): string {
    const configuredBase =
      this.config.get<string>('WEB_URL') ??
      this.config.get<string>('FRONTEND_URL') ??
      this.config.get<string>('NEXT_PUBLIC_WEB_URL') ??
      'https://leetplus.ru';
    return `${configuredBase.replace(/\/+$/u, '')}/register#invite=${token}`;
  }
}
