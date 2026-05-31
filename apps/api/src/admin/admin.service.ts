import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  IntegrationProvider,
  IntegrationSyncStatus,
  TenantLifecycleStatus,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

type TenantLifecycleAction = 'ACTIVATE' | 'SUSPEND' | 'ARCHIVE';

type TenantLifecycleDto = {
  action?: unknown;
  confirmation?: unknown;
  reason?: unknown;
  supportTicket?: unknown;
};

type TenantSupportNoteDto = {
  confirmation?: unknown;
  note?: unknown;
  visibility?: unknown;
  supportTicket?: unknown;
};

const STALE_SYNC_THRESHOLD_MS = 24 * 60 * 60 * 1000;

const lifecycleStatusByAction: Record<
  TenantLifecycleAction,
  TenantLifecycleStatus
> = {
  ACTIVATE: TenantLifecycleStatus.ACTIVE,
  SUSPEND: TenantLifecycleStatus.SUSPENDED,
  ARCHIVE: TenantLifecycleStatus.ARCHIVED,
};

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const failedSince = new Date(Date.now() - STALE_SYNC_THRESHOLD_MS);
    const [
      tenants,
      usersCount,
      storesCount,
      productsCount,
      salesFactsCount,
      integrationSourcesCount,
      tenantUsers,
      tenantStores,
      recentSyncJobs,
      failedSyncJobs,
      auditEvents,
    ] = await Promise.all([
      this.prisma.tenant.findMany({
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: {
              users: true,
              stores: true,
              products: true,
              salesFacts: true,
            },
          },
          integrationSources: {
            where: { provider: IntegrationProvider.LANGAME },
            select: {
              domain: true,
              isActive: true,
              lastSyncedAt: true,
            },
            orderBy: { domain: 'asc' },
          },
        },
      }),
      this.prisma.user.count(),
      this.prisma.store.count(),
      this.prisma.product.count(),
      this.prisma.salesFact.count(),
      this.prisma.integrationSource.count({
        where: { provider: IntegrationProvider.LANGAME },
      }),
      this.prisma.user.findMany({
        select: {
          tenantId: true,
          isActive: true,
        },
      }),
      this.prisma.store.findMany({
        select: {
          tenantId: true,
          isActive: true,
        },
      }),
      this.prisma.integrationSyncJob.findMany({
        where: { provider: IntegrationProvider.LANGAME },
        orderBy: { startedAt: 'desc' },
        take: 40,
      }),
      this.prisma.integrationSyncJob.findMany({
        where: {
          provider: IntegrationProvider.LANGAME,
          status: IntegrationSyncStatus.FAILED,
          startedAt: { gte: failedSince },
        },
        select: {
          tenantId: true,
        },
      }),
      this.prisma.platformAdminAuditEvent.findMany({
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          actor: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
        },
      }),
    ]);

    const userCounts = this.countByTenantAndActivity(tenantUsers);
    const storeCounts = this.countByTenantAndActivity(tenantStores);
    const failedCounts = this.countByTenant(failedSyncJobs);
    const latestSyncByTenant = new Map<
      string,
      (typeof recentSyncJobs)[number]
    >();

    for (const job of recentSyncJobs) {
      if (!latestSyncByTenant.has(job.tenantId)) {
        latestSyncByTenant.set(job.tenantId, job);
      }
    }

    const tenantItems = tenants.map((tenant) => {
      const activeSources = tenant.integrationSources.filter(
        (source) => source.isActive,
      );
      const staleSources = activeSources.filter(
        (source) =>
          !source.lastSyncedAt ||
          Date.now() - source.lastSyncedAt.getTime() > STALE_SYNC_THRESHOLD_MS,
      );
      const tenantUserCounts = userCounts.get(tenant.id) ?? {
        active: 0,
        inactive: 0,
      };
      const tenantStoreCounts = storeCounts.get(tenant.id) ?? {
        active: 0,
        inactive: 0,
      };
      const failedSyncJobs24h = failedCounts.get(tenant.id) ?? 0;
      const lastSyncJob = latestSyncByTenant.get(tenant.id) ?? null;
      const issues = [
        tenant.status !== TenantLifecycleStatus.ACTIVE
          ? 'tenant не активен'
          : null,
        activeSources.length === 0 ? 'нет активных Langame источников' : null,
        staleSources.length > 0
          ? `устаревших источников: ${staleSources.length}`
          : null,
        failedSyncJobs24h > 0
          ? `ошибок синхронизации за 24ч: ${failedSyncJobs24h}`
          : null,
      ].filter((issue): issue is string => Boolean(issue));

      const severity =
        tenant.status !== TenantLifecycleStatus.ACTIVE ||
        activeSources.length === 0 ||
        failedSyncJobs24h > 0
          ? 'CRITICAL'
          : staleSources.length > 0
            ? 'WARNING'
            : 'OK';

      return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        statusChangedAt: tenant.statusChangedAt?.toISOString() ?? null,
        statusReason: tenant.statusReason,
        usersCount: tenant._count.users,
        activeUsersCount: tenantUserCounts.active,
        inactiveUsersCount: tenantUserCounts.inactive,
        storesCount: tenant._count.stores,
        activeStoresCount: tenantStoreCounts.active,
        inactiveStoresCount: tenantStoreCounts.inactive,
        productsCount: tenant._count.products,
        salesFactsCount: tenant._count.salesFacts,
        langameSources: tenant.integrationSources.map((source) => ({
          domain: source.domain,
          isActive: source.isActive,
          lastSyncedAt: source.lastSyncedAt?.toISOString() ?? null,
        })),
        diagnostics: {
          severity,
          activeLangameSources: activeSources.length,
          staleLangameSources: staleSources.length,
          failedSyncJobs24h,
          lastSyncStatus: lastSyncJob?.status ?? null,
          lastSyncAt: lastSyncJob?.startedAt.toISOString() ?? null,
          issues,
        },
      };
    });

    return {
      totals: {
        tenants: tenants.length,
        users: usersCount,
        stores: storesCount,
        products: productsCount,
        salesFacts: salesFactsCount,
        integrationSources: integrationSourcesCount,
        criticalTenants: tenantItems.filter(
          (tenant) => tenant.diagnostics.severity === 'CRITICAL',
        ).length,
        warningTenants: tenantItems.filter(
          (tenant) => tenant.diagnostics.severity === 'WARNING',
        ).length,
      },
      tenants: tenantItems,
      recentSyncJobs: recentSyncJobs.slice(0, 10).map((job) => ({
        id: job.id,
        tenantId: job.tenantId,
        domain: job.domain,
        status: job.status,
        mode: job.mode,
        trigger: job.trigger,
        startedAt: job.startedAt.toISOString(),
        finishedAt: job.finishedAt?.toISOString() ?? null,
        storesCount: job.storesCount,
        productsCount: job.productsCount,
        inventoryCount: job.inventoryCount,
        salesCount: job.salesCount,
        discrepancyCount: job.discrepancyCount,
        errorMessage: job.errorMessage,
      })),
      auditEvents: auditEvents.map((event) => ({
        id: event.id,
        tenantId: event.tenantId,
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId,
        reason: event.reason,
        before: event.before,
        after: event.after,
        metadata: event.metadata,
        createdAt: event.createdAt.toISOString(),
        tenant: event.tenant
          ? {
              id: event.tenant.id,
              name: event.tenant.name,
              slug: event.tenant.slug,
            }
          : null,
        actor: event.actor
          ? {
              id: event.actor.id,
              email: event.actor.email,
              fullName: event.actor.fullName,
            }
          : null,
      })),
    };
  }

  async updateTenantLifecycle(
    actor: AuthenticatedUser,
    tenantId: string,
    dto: TenantLifecycleDto,
  ) {
    const action = this.parseLifecycleAction(dto.action);
    const reason = this.normalizeRequiredText(dto.reason, 'reason', 10);
    const supportTicket = this.normalizeOptionalText(dto.supportTicket);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        statusChangedAt: true,
        statusReason: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant was not found');
    }

    this.assertConfirmation(dto.confirmation, tenant.slug);

    const nextStatus = lifecycleStatusByAction[action];

    if (tenant.status === nextStatus) {
      throw new BadRequestException('Tenant is already in requested status');
    }

    const before = this.serializeTenantStatus(tenant);
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.tenant.update({
        where: { id: tenant.id },
        data: {
          status: nextStatus,
          statusChangedAt: new Date(),
          statusReason: reason,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          statusChangedAt: true,
          statusReason: true,
        },
      });

      await tx.platformAdminAuditEvent.create({
        data: {
          tenantId: tenant.id,
          actorUserId: actor.id,
          action: `TENANT_${action}`,
          targetType: 'TENANT',
          targetId: tenant.id,
          reason,
          before,
          after: this.serializeTenantStatus(result),
          metadata: {
            supportTicket,
            confirmationRule: 'tenant_slug',
          },
        },
      });

      return result;
    });

    return {
      ok: true,
      tenant: this.serializeTenantStatus(updated),
    };
  }

  async addTenantSupportNote(
    actor: AuthenticatedUser,
    tenantId: string,
    dto: TenantSupportNoteDto,
  ) {
    const note = this.normalizeRequiredText(dto.note, 'note', 5);
    const visibility = this.normalizeOptionalText(dto.visibility) ?? 'INTERNAL';
    const supportTicket = this.normalizeOptionalText(dto.supportTicket);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        statusChangedAt: true,
        statusReason: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant was not found');
    }

    this.assertConfirmation(dto.confirmation, tenant.slug);

    const event = await this.prisma.platformAdminAuditEvent.create({
      data: {
        tenantId: tenant.id,
        actorUserId: actor.id,
        action: 'SUPPORT_NOTE',
        targetType: 'TENANT',
        targetId: tenant.id,
        reason: note,
        before: this.serializeTenantStatus(tenant),
        after: this.serializeTenantStatus(tenant),
        metadata: {
          visibility,
          supportTicket,
          confirmationRule: 'tenant_slug',
        },
      },
      select: {
        id: true,
        createdAt: true,
      },
    });

    return {
      ok: true,
      event: {
        id: event.id,
        createdAt: event.createdAt.toISOString(),
      },
    };
  }

  private countByTenantAndActivity(
    rows: Array<{ tenantId: string; isActive: boolean }>,
  ) {
    const counts = new Map<string, { active: number; inactive: number }>();

    for (const row of rows) {
      const current = counts.get(row.tenantId) ?? {
        active: 0,
        inactive: 0,
      };

      if (row.isActive) {
        current.active += 1;
      } else {
        current.inactive += 1;
      }

      counts.set(row.tenantId, current);
    }

    return counts;
  }

  private countByTenant(rows: Array<{ tenantId: string }>) {
    const counts = new Map<string, number>();

    for (const row of rows) {
      counts.set(row.tenantId, (counts.get(row.tenantId) ?? 0) + 1);
    }

    return counts;
  }

  private parseLifecycleAction(value: unknown): TenantLifecycleAction {
    if (value === 'ACTIVATE' || value === 'SUSPEND' || value === 'ARCHIVE') {
      return value;
    }

    throw new BadRequestException('Unsupported tenant lifecycle action');
  }

  private normalizeRequiredText(
    value: unknown,
    field: string,
    minLength: number,
  ) {
    if (typeof value !== 'string') {
      throw new BadRequestException(`${field} is required`);
    }

    const normalized = value.trim();

    if (normalized.length < minLength) {
      throw new BadRequestException(
        `${field} must contain at least ${minLength} characters`,
      );
    }

    return normalized;
  }

  private normalizeOptionalText(value: unknown) {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized || null;
  }

  private assertConfirmation(value: unknown, tenantSlug: string) {
    if (typeof value !== 'string' || value.trim() !== tenantSlug) {
      throw new BadRequestException('Tenant slug confirmation is required');
    }
  }

  private serializeTenantStatus(tenant: {
    id: string;
    name: string;
    slug: string;
    status: TenantLifecycleStatus;
    statusChangedAt: Date | null;
    statusReason: string | null;
  }) {
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      statusChangedAt: tenant.statusChangedAt?.toISOString() ?? null,
      statusReason: tenant.statusReason,
    };
  }
}
