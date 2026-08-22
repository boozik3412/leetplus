import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { TenantModule, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { hasCapability, resolveUserCapabilities } from '../auth/capabilities';
import { TransactionalMailService } from '../mail/transactional-mail.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  TenantExecutionAdmissionDecision,
  TenantExecutionAdmissionService,
  type TenantExecutionPermitAcquisition,
} from '../tenancy/tenant-execution-admission.service';
import {
  evaluateTenantBackgroundExecutionPolicy,
  evaluateTenantBackgroundRuntimeIdentity,
  tenantBackgroundStageForCustomerStage,
  type TenantBackgroundExecutionPolicyDecision,
  type TenantBackgroundExecutionPolicyReasonCode,
  type TenantBackgroundRuntimeIdentityDecision,
  type TenantBackgroundRuntimeIdentityReasonCode,
} from '../tenancy/tenant-background-execution-policy';
import type {
  ReportDigestType,
  SendReportDigestEmailDto,
  SendScheduledReportDigestDto,
} from './reports.dto';
import { ReportsExportService } from './reports-export.service';
import { ReportsService, type OperationalReport } from './reports.service';

const EMAIL_REGEXP = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
export const REPORT_DIGEST_OUTBOUND_REQUIREMENTS = [
  { module: TenantModule.ASSORTMENT, action: 'OUTBOUND' },
  { module: TenantModule.COMMUNICATIONS, action: 'OUTBOUND' },
] as const;

type SendScheduledDigestsOptions = {
  tenantId?: string;
  permitAcquisition?: TenantExecutionPermitAcquisition;
};

type ScheduledDigestSkippedResult = {
  status: 'SKIPPED';
  tenantId: string;
  tenantSlug: string;
  recipientEmail: string;
  reasonCode:
    | TenantExecutionAdmissionDecision['reasonCode']
    | TenantBackgroundExecutionPolicyReasonCode
    | TenantBackgroundRuntimeIdentityReasonCode
    | 'CAPABILITY_EXPORT_REPORTS_REQUIRED'
    | 'RECIPIENT_AUTHORITY_REVOKED';
  failedRequirement: TenantExecutionAdmissionDecision['failedRequirement'];
};

type ScheduledDigestRecipient = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  isPlatformAdmin: boolean;
  tenantId: string;
  customRoleId: string | null;
  customRole: {
    id: string;
    name: string;
    permissions: string[];
  } | null;
  tenant: { slug: string };
};

@Injectable()
export class ReportsDigestService {
  private readonly logger = new Logger(ReportsDigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reportsService: ReportsService,
    private readonly reportsExportService: ReportsExportService,
    private readonly transactionalMailService: TransactionalMailService,
    private readonly tenantExecutionAdmissionService: TenantExecutionAdmissionService,
  ) {}

  async sendDigest(user: AuthenticatedUser, dto: SendReportDigestEmailDto) {
    const type = this.resolveDigestType(dto.type);
    const recipientEmail = this.resolveRecipientEmail(
      dto.recipientEmail,
      user.email,
    );
    const permit = await this.tenantExecutionAdmissionService.issuePermit(
      user.tenantId,
      REPORT_DIGEST_OUTBOUND_REQUIREMENTS,
    );
    const digest = await this.buildDigest(user, type);

    await this.tenantExecutionAdmissionService.assertPermitCurrent(permit);
    await this.assertFreshManualExportAuthority(user, permit.executionRevision);
    await this.sendDigestEmail(recipientEmail, digest);

    return {
      ok: true,
      type,
      recipientEmail,
      from: digest.from,
      to: digest.to,
      attachmentFileName: digest.attachment?.fileName ?? null,
    };
  }

  async sendScheduledDigests(
    dto: SendScheduledReportDigestDto,
    options: SendScheduledDigestsOptions = {},
  ) {
    this.assertSuppliedAcquisitionScope(options);
    const type = this.resolveDigestType(dto.type);
    const recipients = await this.prisma.user.findMany({
      where: {
        ...(options.tenantId ? { tenantId: options.tenantId } : {}),
        isActive: true,
        accessScope: 'NETWORK',
        role: { in: [UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER] },
      },
      include: {
        tenant: {
          select: {
            slug: true,
          },
        },
        customRole: {
          select: {
            id: true,
            name: true,
            permissions: true,
          },
        },
      },
      orderBy: [{ tenantId: 'asc' }, { email: 'asc' }],
    });
    const validRecipients = recipients.filter((user) =>
      EMAIL_REGEXP.test(user.email.trim().toLowerCase()),
    );
    const roleOverrides = validRecipients.length
      ? await this.prisma.userRoleOverride.findMany({
          where: {
            tenantId: {
              in: Array.from(
                new Set(validRecipients.map((recipient) => recipient.tenantId)),
              ),
            },
            role: {
              in: Array.from(
                new Set(validRecipients.map((recipient) => recipient.role)),
              ),
            },
          },
          select: {
            tenantId: true,
            role: true,
            permissions: true,
          },
        })
      : [];
    const roleOverridesByTenantRole = new Map(
      roleOverrides.map((override) => [
        this.tenantRoleKey(override.tenantId, override.role),
        override,
      ]),
    );
    const acquisitionsByTenant = new Map<
      string,
      TenantExecutionPermitAcquisition
    >();
    if (options.permitAcquisition) {
      acquisitionsByTenant.set(
        options.permitAcquisition.decision.tenantId,
        options.permitAcquisition,
      );
    }

    if (dto.dryRun) {
      const skippedResults: ScheduledDigestSkippedResult[] = [];
      let eligible = 0;

      for (const recipient of validRecipients) {
        const user = this.userToAuthenticatedUser(
          recipient,
          roleOverridesByTenantRole,
        );
        if (!hasCapability(user, 'export_reports')) {
          skippedResults.push(this.toCapabilitySkippedResult(recipient));
          continue;
        }

        const acquisition = await this.resolveScheduledPermitAcquisition(
          recipient.tenantId,
          acquisitionsByTenant,
        );
        if (!acquisition.permit) {
          skippedResults.push(
            this.toSkippedResult(recipient, acquisition.decision),
          );
          continue;
        }

        eligible += 1;
      }

      return {
        ok: true,
        type,
        dryRun: true as const,
        recipients: validRecipients.length,
        eligible,
        skipped: skippedResults.length,
        skippedResults,
      };
    }

    const results: {
      tenantSlug: string;
      recipientEmail: string;
      from: string;
      to: string;
    }[] = [];
    const skippedResults: ScheduledDigestSkippedResult[] = [];

    for (const recipient of validRecipients) {
      const user = this.userToAuthenticatedUser(
        recipient,
        roleOverridesByTenantRole,
      );
      if (!hasCapability(user, 'export_reports')) {
        skippedResults.push(this.toCapabilitySkippedResult(recipient));
        continue;
      }

      const acquisition = await this.resolveScheduledPermitAcquisition(
        user.tenantId,
        acquisitionsByTenant,
      );
      if (!acquisition.permit) {
        skippedResults.push(
          this.toSkippedResult(recipient, acquisition.decision),
        );
        continue;
      }

      const digest = await this.buildDigest(user, type);

      const freshRecipient = await this.loadFreshScheduledRecipient(recipient);
      if (!freshRecipient) {
        skippedResults.push(this.toAuthorityRevokedSkippedResult(recipient));
        continue;
      }
      const freshRoleOverrides =
        await this.loadScheduledRecipientRoleOverrides(freshRecipient);
      const freshUser = this.userToAuthenticatedUser(
        freshRecipient,
        freshRoleOverrides,
      );
      if (!hasCapability(freshUser, 'export_reports')) {
        skippedResults.push(this.toCapabilitySkippedResult(freshRecipient));
        continue;
      }

      const effectAdmission =
        await this.tenantExecutionAdmissionService.evaluatePermit(
          acquisition.permit,
        );
      if (!effectAdmission.allowed) {
        skippedResults.push(
          this.toSkippedResult(freshRecipient, effectAdmission),
        );
        continue;
      }

      const backgroundExecution = evaluateTenantBackgroundExecutionPolicy({
        stage: tenantBackgroundStageForCustomerStage(
          effectAdmission.customerStage,
        ),
        jobKind: 'REPORT_DIGEST_SMTP',
      });
      if (!backgroundExecution.allowed) {
        skippedResults.push(
          this.toBackgroundExecutionSkippedResult(
            freshRecipient,
            backgroundExecution,
          ),
        );
        continue;
      }

      const runtimeIdentity = evaluateTenantBackgroundRuntimeIdentity({
        decision: backgroundExecution,
        actorKind: 'TENANT_SYSTEM',
        tenantId: freshUser.tenantId,
      });
      if (!runtimeIdentity.accepted) {
        skippedResults.push(
          this.toBackgroundExecutionSkippedResult(
            freshRecipient,
            runtimeIdentity,
          ),
        );
        continue;
      }

      await this.sendDigestEmail(freshRecipient.email, digest);
      results.push({
        tenantSlug: freshUser.tenantSlug,
        recipientEmail: freshRecipient.email,
        from: digest.from,
        to: digest.to,
      });
    }

    return {
      ok: true,
      type,
      dryRun: false as const,
      sent: results.length,
      skipped: skippedResults.length,
      results,
      skippedResults,
    };
  }

  private assertSuppliedAcquisitionScope(options: SendScheduledDigestsOptions) {
    const acquisition = options.permitAcquisition;
    if (!acquisition) {
      return;
    }

    const tenantId = acquisition.decision.tenantId;
    if (
      (options.tenantId && options.tenantId !== tenantId) ||
      (acquisition.permit && acquisition.permit.tenantId !== tenantId)
    ) {
      throw new BadRequestException(
        'Scheduled digest permit acquisition tenant mismatch',
      );
    }
  }

  private async resolveScheduledPermitAcquisition(
    tenantId: string,
    acquisitionsByTenant: Map<string, TenantExecutionPermitAcquisition>,
  ) {
    const cached = acquisitionsByTenant.get(tenantId);
    if (cached) {
      return cached;
    }

    const acquisition =
      await this.tenantExecutionAdmissionService.acquirePermit(
        tenantId,
        REPORT_DIGEST_OUTBOUND_REQUIREMENTS,
      );
    acquisitionsByTenant.set(tenantId, acquisition);

    return acquisition;
  }

  private async assertFreshManualExportAuthority(
    user: Pick<
      AuthenticatedUser,
      'id' | 'tenantId' | 'accessScope' | 'allowedStoreIds'
    >,
    expectedExecutionRevision: number,
  ) {
    const freshUser = await this.prisma.user.findFirst({
      where: {
        id: user.id,
        tenantId: user.tenantId,
        isActive: true,
      },
      select: {
        role: true,
        accessScope: true,
        tenant: {
          select: {
            executionRevision: true,
          },
        },
        customRole: {
          select: {
            permissions: true,
          },
        },
        storeAccesses: {
          select: {
            storeId: true,
            store: {
              select: {
                tenantId: true,
              },
            },
          },
        },
      },
    });

    if (
      !freshUser ||
      freshUser.tenant.executionRevision !== expectedExecutionRevision ||
      !this.isSameManualAccessScope(user, freshUser)
    ) {
      throw new ForbiddenException({
        reasonCode: 'REPORT_EXPORT_AUTHORITY_REVOKED',
        message: 'Report export authority is no longer current',
      });
    }

    const roleOverride = freshUser.customRole
      ? null
      : await this.prisma.userRoleOverride.findUnique({
          where: {
            tenantId_role: {
              tenantId: user.tenantId,
              role: freshUser.role,
            },
          },
          select: {
            permissions: true,
          },
        });
    const permissions = resolveUserCapabilities({
      role: freshUser.role,
      customRole: freshUser.customRole,
      roleOverride,
    });

    if (!hasCapability({ permissions }, 'export_reports')) {
      throw new ForbiddenException({
        reasonCode: 'CAPABILITY_EXPORT_REPORTS_REQUIRED',
        message: 'Report export capability is no longer current',
      });
    }
  }

  private isSameManualAccessScope(
    expected: Pick<
      AuthenticatedUser,
      'tenantId' | 'accessScope' | 'allowedStoreIds'
    >,
    actual: {
      accessScope: string | null;
      storeAccesses: Array<{
        storeId: string;
        store: { tenantId: string };
      }>;
    },
  ) {
    if (actual.accessScope !== expected.accessScope) {
      return false;
    }

    const actualStoreIds = actual.storeAccesses
      .filter((access) => access.store.tenantId === expected.tenantId)
      .map((access) => access.storeId)
      .sort();
    const expectedStoreIds = [...expected.allowedStoreIds].sort();

    return (
      actualStoreIds.length === actual.storeAccesses.length &&
      actualStoreIds.length === expectedStoreIds.length &&
      actualStoreIds.every(
        (storeId, index) => storeId === expectedStoreIds[index],
      )
    );
  }

  private toSkippedResult(
    recipient: {
      tenantId: string;
      email: string;
      tenant: { slug: string };
    },
    admission: TenantExecutionAdmissionDecision,
  ): ScheduledDigestSkippedResult {
    return {
      status: 'SKIPPED' as const,
      tenantId: recipient.tenantId,
      tenantSlug: recipient.tenant.slug,
      recipientEmail: recipient.email,
      reasonCode: admission.reasonCode,
      failedRequirement: admission.failedRequirement,
    };
  }

  private toCapabilitySkippedResult(
    recipient: Pick<ScheduledDigestRecipient, 'tenantId' | 'email' | 'tenant'>,
  ): ScheduledDigestSkippedResult {
    return {
      status: 'SKIPPED',
      tenantId: recipient.tenantId,
      tenantSlug: recipient.tenant.slug,
      recipientEmail: recipient.email,
      reasonCode: 'CAPABILITY_EXPORT_REPORTS_REQUIRED',
      failedRequirement: null,
    };
  }

  private toBackgroundExecutionSkippedResult(
    recipient: Pick<ScheduledDigestRecipient, 'tenantId' | 'email' | 'tenant'>,
    decision:
      | TenantBackgroundExecutionPolicyDecision
      | TenantBackgroundRuntimeIdentityDecision,
  ): ScheduledDigestSkippedResult {
    return {
      status: 'SKIPPED',
      tenantId: recipient.tenantId,
      tenantSlug: recipient.tenant.slug,
      recipientEmail: recipient.email,
      reasonCode: decision.reasonCode,
      failedRequirement: null,
    };
  }

  private toAuthorityRevokedSkippedResult(
    recipient: Pick<ScheduledDigestRecipient, 'tenantId' | 'email' | 'tenant'>,
  ): ScheduledDigestSkippedResult {
    return {
      status: 'SKIPPED',
      tenantId: recipient.tenantId,
      tenantSlug: recipient.tenant.slug,
      recipientEmail: recipient.email,
      reasonCode: 'RECIPIENT_AUTHORITY_REVOKED',
      failedRequirement: null,
    };
  }

  private loadFreshScheduledRecipient(
    recipient: Pick<ScheduledDigestRecipient, 'id' | 'tenantId'>,
  ): Promise<ScheduledDigestRecipient | null> {
    return this.prisma.user.findFirst({
      where: {
        id: recipient.id,
        tenantId: recipient.tenantId,
        isActive: true,
        accessScope: 'NETWORK',
        role: { in: [UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER] },
      },
      include: {
        tenant: {
          select: {
            slug: true,
          },
        },
        customRole: {
          select: {
            id: true,
            name: true,
            permissions: true,
          },
        },
      },
    });
  }

  private async loadScheduledRecipientRoleOverrides(
    recipient: ScheduledDigestRecipient,
  ): Promise<ReadonlyMap<string, { permissions: string[] }>> {
    if (recipient.customRole) {
      return new Map();
    }

    const overrides = await this.prisma.userRoleOverride.findMany({
      where: {
        tenantId: recipient.tenantId,
        role: recipient.role,
      },
      select: {
        tenantId: true,
        role: true,
        permissions: true,
      },
    });

    return new Map(
      overrides.map((override) => [
        this.tenantRoleKey(override.tenantId, override.role),
        override,
      ]),
    );
  }

  private async buildDigest(user: AuthenticatedUser, type: ReportDigestType) {
    const period = this.resolvePeriod(type);
    const previousPeriod = this.previousPeriod(period);
    const [currentReport, previousReport, attachment] = await Promise.all([
      this.reportsService.getOperationalReport(user, {
        from: period.from,
        to: period.to,
      }),
      type === 'WEEKLY'
        ? this.reportsService.getOperationalReport(user, {
            from: previousPeriod.from,
            to: previousPeriod.to,
          })
        : Promise.resolve(null),
      type === 'WEEKLY'
        ? this.reportsExportService.exportReports(user, {
            from: period.from,
            to: period.to,
            format: 'xlsx',
          })
        : Promise.resolve(null),
    ]);

    return {
      type,
      tenantSlug: currentReport.tenantSlug,
      from: currentReport.from,
      to: currentReport.to,
      headline: this.digestHeadline(currentReport, previousReport),
      metrics: this.digestMetrics(currentReport, previousReport),
      actions: this.digestActions(currentReport),
      attachment: attachment
        ? {
            fileName: attachment.fileName,
            contentType: attachment.contentType,
            buffer: attachment.buffer,
          }
        : undefined,
    };
  }

  private async sendDigestEmail(
    recipientEmail: string,
    context: Awaited<ReturnType<ReportsDigestService['buildDigest']>>,
  ) {
    try {
      await this.transactionalMailService.sendReportDigest(
        recipientEmail,
        context,
      );
    } catch (error) {
      this.logger.error(
        'Failed to send report digest email',
        error instanceof Error ? error.stack : String(error),
      );
      throw new ServiceUnavailableException(
        'Почтовый сервер недоступен или не настроен',
      );
    }
  }

  private digestHeadline(
    currentReport: OperationalReport,
    previousReport: OperationalReport | null,
  ) {
    if (!previousReport) {
      return `Выручка сети за период: ${this.formatMoney(
        currentReport.totalRevenue,
      )}, маржа ${this.formatPercent(currentReport.marginPercent)}.`;
    }

    return `Выручка сети: ${this.formatMoney(
      currentReport.totalRevenue,
    )} (${this.formatDelta(
      currentReport.totalRevenue,
      previousReport.totalRevenue,
    )} к прошлому сопоставимому периоду).`;
  }

  private digestMetrics(
    currentReport: OperationalReport,
    previousReport: OperationalReport | null,
  ) {
    const previous = previousReport
      ? {
          revenue: previousReport.totalRevenue,
          grossProfit: previousReport.grossProfit,
          margin: previousReport.marginPercent,
          oos: previousReport.outOfStockRiskProducts.length,
          noSales: previousReport.productsWithoutSales.length,
          writeOffs: previousReport.writeOffAmount,
        }
      : null;

    return [
      {
        label: 'Выручка',
        value: this.formatMoney(currentReport.totalRevenue),
        delta: previous
          ? this.formatDelta(currentReport.totalRevenue, previous.revenue)
          : null,
      },
      {
        label: 'Валовая прибыль',
        value: this.formatMoney(currentReport.grossProfit),
        delta: previous
          ? this.formatDelta(currentReport.grossProfit, previous.grossProfit)
          : null,
      },
      {
        label: 'Маржа',
        value: this.formatPercent(currentReport.marginPercent),
        delta: previous
          ? this.formatPointDelta(currentReport.marginPercent, previous.margin)
          : null,
      },
      {
        label: 'OOS SKU',
        value: this.formatCount(currentReport.outOfStockRiskProducts.length),
        delta: previous
          ? this.formatDelta(
              currentReport.outOfStockRiskProducts.length,
              previous.oos,
            )
          : null,
      },
      {
        label: 'Списания',
        value: this.formatMoney(currentReport.writeOffAmount),
        delta: previous
          ? this.formatDelta(currentReport.writeOffAmount, previous.writeOffs)
          : null,
      },
      {
        label: 'SKU без продаж',
        value: this.formatCount(currentReport.productsWithoutSales.length),
        delta: previous
          ? this.formatDelta(
              currentReport.productsWithoutSales.length,
              previous.noSales,
            )
          : null,
      },
    ];
  }

  private digestActions(report: OperationalReport) {
    return report.recommendations
      .filter(
        (recommendation) =>
          recommendation.status !== 'DONE' &&
          recommendation.status !== 'HIDDEN' &&
          recommendation.status !== 'REJECTED',
      )
      .sort((a, b) => b.effectAmount - a.effectAmount)
      .slice(0, 5)
      .map((recommendation) =>
        [
          recommendation.title,
          recommendation.storeName ? ` (${recommendation.storeName})` : '',
          ` — эффект ${this.formatMoney(recommendation.effectAmount)}`,
        ].join(''),
      );
  }

  private resolvePeriod(type: ReportDigestType) {
    const today = new Date();
    const todayUtc = Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate(),
    );
    const to = new Date(todayUtc - DAY_IN_MS);
    const from = type === 'DAILY' ? to : new Date(to.getTime() - DAY_IN_MS * 6);

    return {
      from: this.toDateInputValue(from),
      to: this.toDateInputValue(to),
    };
  }

  private previousPeriod(period: { from: string; to: string }) {
    const from = this.parseDate(period.from);
    const to = this.parseDate(period.to);
    const days = Math.max(
      1,
      Math.round((to.getTime() - from.getTime()) / DAY_IN_MS) + 1,
    );
    const previousTo = new Date(from.getTime() - DAY_IN_MS);
    const previousFrom = new Date(
      previousTo.getTime() - DAY_IN_MS * (days - 1),
    );

    return {
      from: this.toDateInputValue(previousFrom),
      to: this.toDateInputValue(previousTo),
    };
  }

  private parseDate(value: string) {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private toDateInputValue(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private resolveDigestType(type: ReportDigestType | undefined) {
    if (!type) {
      return 'DAILY';
    }

    if (type !== 'DAILY' && type !== 'WEEKLY') {
      throw new BadRequestException('Invalid digest type');
    }

    return type;
  }

  private resolveRecipientEmail(
    recipientEmail: string | undefined,
    fallbackEmail: string,
  ) {
    const email = (recipientEmail ?? fallbackEmail).trim().toLowerCase();

    if (!EMAIL_REGEXP.test(email)) {
      throw new BadRequestException('recipientEmail must be a valid email');
    }

    return email;
  }

  private userToAuthenticatedUser(
    user: ScheduledDigestRecipient,
    roleOverridesByTenantRole: ReadonlyMap<string, { permissions: string[] }>,
  ): AuthenticatedUser {
    const roleOverride = user.customRole
      ? null
      : (roleOverridesByTenantRole.get(
          this.tenantRoleKey(user.tenantId, user.role),
        ) ?? null);

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      customRoleId: user.customRole?.id ?? user.customRoleId,
      customRoleName: user.customRole?.name ?? null,
      hasRoleOverride: Boolean(roleOverride),
      permissions: resolveUserCapabilities({
        role: user.role,
        customRole: user.customRole,
        roleOverride,
      }),
      isPlatformAdmin: user.isPlatformAdmin,
      tenantId: user.tenantId,
      tenantSlug: user.tenant.slug,
      accessScope: 'NETWORK',
      allowedStoreIds: [],
    };
  }

  private tenantRoleKey(tenantId: string, role: UserRole) {
    return `${tenantId}:${role}`;
  }

  private formatMoney(value: number) {
    return `${this.formatNumber(value)} руб`;
  }

  private formatCount(value: number) {
    return this.formatNumber(value);
  }

  private formatPercent(value: number) {
    return `${this.formatNumber(value, 1)}%`;
  }

  private formatDelta(current: number, previous: number) {
    const delta = current - previous;
    const sign = delta > 0 ? '+' : '';

    return `${sign}${this.formatNumber(delta)}`;
  }

  private formatPointDelta(current: number, previous: number) {
    const delta = current - previous;
    const sign = delta > 0 ? '+' : '';

    return `${sign}${this.formatNumber(delta, 1)} п.п.`;
  }

  private formatNumber(value: number, maximumFractionDigits = 0) {
    return new Intl.NumberFormat('ru-RU', {
      maximumFractionDigits,
      minimumFractionDigits: 0,
    }).format(value);
  }
}
