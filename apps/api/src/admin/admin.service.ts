import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  IntegrationProvider,
  IntegrationSyncStatus,
  Prisma,
  TenantLifecycleStatus,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { LangameSettingsService } from '../integrations/langame-settings.service';
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

type SourceSupportAction = 'DISABLE' | 'ENABLE' | 'MARK_FOR_REVIEW';

type SourceSupportActionDto = {
  action?: unknown;
  confirmation?: unknown;
  reason?: unknown;
  supportTicket?: unknown;
};

export type PlatformAdminAuditEventQuery = {
  tenantId?: unknown;
  actor?: unknown;
  actorUserId?: unknown;
  targetType?: unknown;
  dateFrom?: unknown;
  dateTo?: unknown;
  limit?: unknown;
};

type ParsedAuditEventQuery = {
  tenantId?: string;
  actor?: string;
  actorUserId?: string;
  targetType?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit: number;
};

type AuditEventWithRelations = Prisma.PlatformAdminAuditEventGetPayload<{
  include: {
    tenant: {
      select: {
        id: true;
        name: true;
        slug: true;
      };
    };
    actor: {
      select: {
        id: true;
        email: true;
        fullName: true;
      };
    };
  };
}>;

type CsvCell = string | number | boolean | null | undefined | Date;

export type PlatformAdminAuditExportFile = {
  fileName: string;
  contentType: string;
  buffer: Buffer;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly langameSettingsService: LangameSettingsService,
  ) {}

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
              id: true,
              domain: true,
              isActive: true,
              lastSyncedAt: true,
              supportDisabledAt: true,
              supportDisabledReason: true,
              supportReviewRequestedAt: true,
              supportReviewReason: true,
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
          id: source.id,
          domain: source.domain,
          isActive: source.isActive,
          lastSyncedAt: source.lastSyncedAt?.toISOString() ?? null,
          supportDisabledAt: source.supportDisabledAt?.toISOString() ?? null,
          supportDisabledReason: source.supportDisabledReason,
          supportReviewRequestedAt:
            source.supportReviewRequestedAt?.toISOString() ?? null,
          supportReviewReason: source.supportReviewReason,
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
      auditEvents: auditEvents.map((event) => this.mapAuditEvent(event)),
    };
  }

  async getAuditEvents(query: PlatformAdminAuditEventQuery) {
    const parsed = this.parseAuditEventQuery(query, 200);
    const events = await this.findAuditEvents(parsed);

    return {
      events: events.map((event) => this.mapAuditEvent(event)),
      count: events.length,
    };
  }

  async exportAuditEvents(
    query: PlatformAdminAuditEventQuery,
  ): Promise<PlatformAdminAuditExportFile> {
    const parsed = this.parseAuditEventQuery(query, 1000);
    const events = await this.findAuditEvents(parsed);
    const rows: CsvCell[][] = [
      [
        'Дата',
        'Tenant',
        'Slug',
        'Actor',
        'Actor email',
        'Действие',
        'Тип объекта',
        'ID объекта',
        'Причина',
        'Metadata',
        'Before',
        'After',
      ],
      ...events.map((event) => [
        event.createdAt,
        event.tenant?.name ?? '',
        event.tenant?.slug ?? '',
        event.actor?.fullName ?? '',
        event.actor?.email ?? '',
        event.action,
        event.targetType,
        event.targetId,
        event.reason,
        this.stringifyAuditJson(event.metadata),
        this.stringifyAuditJson(event.before),
        this.stringifyAuditJson(event.after),
      ]),
    ];
    const from = this.normalizeOptionalText(query.dateFrom) ?? 'all';
    const to = this.normalizeOptionalText(query.dateTo) ?? 'all';

    return {
      fileName: `leetplus-platform-audit-${from}-${to}.csv`,
      contentType: 'text/csv; charset=utf-8',
      buffer: Buffer.from(this.toCsv(rows), 'utf8'),
    };
  }

  async getTenantLangameServiceDiagnostics(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant was not found');
    }

    return {
      tenant,
      diagnostics:
        await this.langameSettingsService.getServiceDiagnosticsForTenant(
          tenant.id,
        ),
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

  async updateIntegrationSourceSupportAction(
    actor: AuthenticatedUser,
    sourceId: string,
    dto: SourceSupportActionDto,
  ) {
    const action = this.parseSourceSupportAction(dto.action);
    const reason = this.normalizeRequiredText(dto.reason, 'reason', 10);
    const supportTicket = this.normalizeOptionalText(dto.supportTicket);
    const source = await this.prisma.integrationSource.findUnique({
      where: { id: sourceId },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!source) {
      throw new NotFoundException('Integration source was not found');
    }

    this.assertConfirmation(dto.confirmation, source.tenant.slug);

    const before = this.serializeIntegrationSource(source);
    const updated = await this.prisma.$transaction(async (tx) => {
      const data =
        action === 'DISABLE'
          ? {
              isActive: false,
              supportDisabledAt: new Date(),
              supportDisabledReason: reason,
            }
          : action === 'ENABLE'
            ? {
                isActive: true,
                supportDisabledAt: null,
                supportDisabledReason: null,
                supportReviewRequestedAt: null,
                supportReviewReason: null,
              }
            : {
                supportReviewRequestedAt: new Date(),
                supportReviewReason: reason,
              };

      const result = await tx.integrationSource.update({
        where: { id: source.id },
        data,
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });

      await tx.platformAdminAuditEvent.create({
        data: {
          tenantId: source.tenantId,
          actorUserId: actor.id,
          action: `LANGAME_SOURCE_${action}`,
          targetType: 'INTEGRATION_SOURCE',
          targetId: source.id,
          reason,
          before,
          after: this.serializeIntegrationSource(result),
          metadata: {
            domain: source.domain,
            supportTicket,
            confirmationRule: 'tenant_slug',
          },
        },
      });

      return result;
    });

    return {
      ok: true,
      source: this.serializeIntegrationSource(updated),
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

  private parseSourceSupportAction(value: unknown): SourceSupportAction {
    if (
      value === 'DISABLE' ||
      value === 'ENABLE' ||
      value === 'MARK_FOR_REVIEW'
    ) {
      return value;
    }

    throw new BadRequestException('Unsupported integration source action');
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

  private parseAuditEventQuery(
    query: PlatformAdminAuditEventQuery,
    maxLimit: number,
  ): ParsedAuditEventQuery {
    const dateFrom = this.parseAuditDate(query.dateFrom, 'dateFrom', false);
    const dateTo = this.parseAuditDate(query.dateTo, 'dateTo', true);

    if (dateFrom && dateTo && dateFrom.getTime() > dateTo.getTime()) {
      throw new BadRequestException('dateFrom must be before dateTo');
    }

    return {
      tenantId: this.normalizeOptionalText(query.tenantId) ?? undefined,
      actor: this.normalizeOptionalText(query.actor) ?? undefined,
      actorUserId: this.normalizeOptionalText(query.actorUserId) ?? undefined,
      targetType: this.normalizeOptionalText(query.targetType) ?? undefined,
      dateFrom: dateFrom ?? undefined,
      dateTo: dateTo ?? undefined,
      limit: this.parseLimit(query.limit, maxLimit),
    };
  }

  private parseAuditDate(value: unknown, field: string, endOfDay: boolean) {
    const text = this.normalizeOptionalText(value);

    if (!text) {
      return null;
    }

    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(text)
      ? `${text}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`
      : text;
    const date = new Date(normalized);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} must be a valid date`);
    }

    return date;
  }

  private parseLimit(value: unknown, maxLimit: number) {
    const fallback = Math.min(100, maxLimit);

    if (typeof value !== 'string' || value.trim() === '') {
      return fallback;
    }

    const parsed = Number(value);

    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new BadRequestException('limit must be a positive integer');
    }

    return Math.min(parsed, maxLimit);
  }

  private buildAuditWhere(
    query: ParsedAuditEventQuery,
  ): Prisma.PlatformAdminAuditEventWhereInput {
    const createdAt: Prisma.DateTimeFilter = {};

    if (query.dateFrom) {
      createdAt.gte = query.dateFrom;
    }

    if (query.dateTo) {
      createdAt.lte = query.dateTo;
    }

    return {
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.actor
        ? {
            actor: {
              is: {
                OR: [
                  {
                    email: {
                      contains: query.actor,
                      mode: 'insensitive',
                    },
                  },
                  {
                    fullName: {
                      contains: query.actor,
                      mode: 'insensitive',
                    },
                  },
                  { id: query.actor },
                ],
              },
            },
          }
        : {}),
      ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
    };
  }

  private findAuditEvents(query: ParsedAuditEventQuery) {
    return this.prisma.platformAdminAuditEvent.findMany({
      where: this.buildAuditWhere(query),
      orderBy: { createdAt: 'desc' },
      take: query.limit,
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
    });
  }

  private mapAuditEvent(event: AuditEventWithRelations) {
    return {
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
    };
  }

  private stringifyAuditJson(value: Prisma.JsonValue) {
    if (value === null) {
      return '';
    }

    return JSON.stringify(value);
  }

  private toCsv(rows: CsvCell[][]) {
    return `\uFEFF${rows.map((row) => this.csvRow(row)).join('\n')}`;
  }

  private csvRow(row: CsvCell[]) {
    return row.map((cell) => this.csvCell(cell)).join(';');
  }

  private csvCell(cell: CsvCell) {
    if (cell === null || cell === undefined) {
      return '';
    }

    const value = cell instanceof Date ? cell.toISOString() : String(cell);
    const escaped = value.replace(/"/g, '""');

    if (/[;\n\r"]/.test(escaped)) {
      return `"${escaped}"`;
    }

    return escaped;
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

  private serializeIntegrationSource(source: {
    id: string;
    tenantId: string;
    provider: IntegrationProvider;
    domain: string;
    isActive: boolean;
    lastSyncedAt: Date | null;
    supportDisabledAt: Date | null;
    supportDisabledReason: string | null;
    supportReviewRequestedAt: Date | null;
    supportReviewReason: string | null;
    tenant: {
      id: string;
      name: string;
      slug: string;
    };
  }) {
    return {
      id: source.id,
      tenantId: source.tenantId,
      tenantName: source.tenant.name,
      tenantSlug: source.tenant.slug,
      provider: source.provider,
      domain: source.domain,
      isActive: source.isActive,
      lastSyncedAt: source.lastSyncedAt?.toISOString() ?? null,
      supportDisabledAt: source.supportDisabledAt?.toISOString() ?? null,
      supportDisabledReason: source.supportDisabledReason,
      supportReviewRequestedAt:
        source.supportReviewRequestedAt?.toISOString() ?? null,
      supportReviewReason: source.supportReviewReason,
    };
  }
}
