import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { TransactionalMailService } from '../mail/transactional-mail.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ReportDigestType,
  SendReportDigestEmailDto,
  SendScheduledReportDigestDto,
} from './reports.dto';
import { ReportsExportService } from './reports-export.service';
import { ReportsService, type OperationalReport } from './reports.service';

const EMAIL_REGEXP = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ReportsDigestService {
  private readonly logger = new Logger(ReportsDigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reportsService: ReportsService,
    private readonly reportsExportService: ReportsExportService,
    private readonly transactionalMailService: TransactionalMailService,
  ) {}

  async sendDigest(user: AuthenticatedUser, dto: SendReportDigestEmailDto) {
    const type = this.resolveDigestType(dto.type);
    const recipientEmail = this.resolveRecipientEmail(
      dto.recipientEmail,
      user.email,
    );
    const digest = await this.buildDigest(user, type);

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
    options: { tenantId?: string } = {},
  ) {
    const type = this.resolveDigestType(dto.type);
    const recipients = await this.prisma.user.findMany({
      where: {
        ...(options.tenantId ? { tenantId: options.tenantId } : {}),
        isActive: true,
        role: { in: [UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER] },
      },
      include: {
        tenant: {
          select: {
            slug: true,
          },
        },
      },
      orderBy: [{ tenantId: 'asc' }, { email: 'asc' }],
    });
    const validRecipients = recipients.filter((user) =>
      EMAIL_REGEXP.test(user.email.trim().toLowerCase()),
    );

    if (dto.dryRun) {
      return {
        ok: true,
        type,
        dryRun: true,
        recipients: validRecipients.length,
      };
    }

    const results: {
      tenantSlug: string;
      recipientEmail: string;
      from: string;
      to: string;
    }[] = [];

    for (const recipient of validRecipients) {
      const user = this.userToAuthenticatedUser(recipient);
      const digest = await this.buildDigest(user, type);
      await this.sendDigestEmail(recipient.email, digest);
      results.push({
        tenantSlug: user.tenantSlug,
        recipientEmail: recipient.email,
        from: digest.from,
        to: digest.to,
      });
    }

    return {
      ok: true,
      type,
      dryRun: false,
      sent: results.length,
      results,
    };
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

  private userToAuthenticatedUser(user: {
    id: string;
    email: string;
    fullName: string | null;
    role: UserRole;
    isPlatformAdmin: boolean;
    tenantId: string;
    tenant: { slug: string };
  }): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      isPlatformAdmin: user.isPlatformAdmin,
      tenantId: user.tenantId,
      tenantSlug: user.tenant.slug,
    };
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
