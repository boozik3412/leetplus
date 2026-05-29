import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ReportDigestType } from './reports.dto';
import { ReportsDigestService } from './reports-digest.service';
import { PrismaService } from '../prisma/prisma.service';

type DigestSchedule = {
  type: ReportDigestType;
  time: string;
  weekday?: number;
};

const DEFAULT_INTERVAL_MS = 60 * 1000;
const DEFAULT_WINDOW_MINUTES = 15;
const DEFAULT_TIMEZONE_OFFSET_MINUTES = 5 * 60;

@Injectable()
export class ReportsDigestSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ReportsDigestSchedulerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly reportsDigestService: ReportsDigestService,
  ) {}

  onModuleInit() {
    if (!this.isSchedulerEnabled()) {
      this.logger.log('Report digest scheduler is disabled');
      return;
    }

    const intervalMs = this.getPositiveInt(
      'REPORT_DIGEST_SCHEDULER_INTERVAL_MS',
      DEFAULT_INTERVAL_MS,
    );
    this.logger.log(
      `Report digest scheduler is enabled with ${intervalMs}ms interval`,
    );

    void this.tick(new Date());
    this.timer = setInterval(() => void this.tick(new Date()), intervalMs);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(now: Date) {
    const timezoneOffsetMinutes = this.getInt(
      'REPORT_DIGEST_SCHEDULER_TIMEZONE_OFFSET_MINUTES',
      DEFAULT_TIMEZONE_OFFSET_MINUTES,
    );
    const localNow = new Date(
      now.getTime() + timezoneOffsetMinutes * 60 * 1000,
    );
    const dateKey = localNow.toISOString().slice(0, 10);
    const schedules = this.getSchedules();
    const dueSchedules = schedules.filter((schedule) =>
      this.isScheduleDue(schedule, localNow),
    );

    if (dueSchedules.length === 0) {
      return;
    }

    const tenants = await this.prisma.tenant.findMany({
      select: {
        id: true,
        slug: true,
      },
      orderBy: { slug: 'asc' },
    });

    for (const schedule of dueSchedules) {
      for (const tenant of tenants) {
        await this.runTenantDigest({
          tenant,
          type: schedule.type,
          dateKey,
        });
      }
    }
  }

  private async runTenantDigest({
    tenant,
    type,
    dateKey,
  }: {
    tenant: { id: string; slug: string };
    type: ReportDigestType;
    dateKey: string;
  }) {
    const run = await this.createScheduleRun({
      tenantId: tenant.id,
      type,
      dateKey,
    });

    if (!run) {
      return;
    }

    try {
      const result = await this.reportsDigestService.sendScheduledDigests(
        { type },
        { tenantId: tenant.id },
      );
      const sentCount = result.dryRun ? 0 : result.sent;

      await this.prisma.reportDigestScheduleRun.update({
        where: { id: run.id },
        data: {
          status: 'SENT',
          sentCount,
          completedAt: new Date(),
        },
      });
      this.logger.log(
        `Sent ${type} report digest for ${tenant.slug}: ${sentCount} recipient(s)`,
      );
    } catch (error) {
      await this.prisma.reportDigestScheduleRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage: this.errorMessage(error),
        },
      });
      this.logger.error(
        `Failed to send ${type} report digest for ${tenant.slug}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async createScheduleRun({
    tenantId,
    type,
    dateKey,
  }: {
    tenantId: string;
    type: ReportDigestType;
    dateKey: string;
  }) {
    try {
      return await this.prisma.reportDigestScheduleRun.create({
        data: {
          tenantId,
          type,
          scheduledForDate: dateKey,
        },
        select: {
          id: true,
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        return null;
      }

      throw error;
    }
  }

  private getSchedules(): DigestSchedule[] {
    return [
      {
        type: 'DAILY',
        time:
          this.configService.get<string>('REPORT_DIGEST_DAILY_TIME') ?? '09:00',
      },
      {
        type: 'WEEKLY',
        time:
          this.configService.get<string>('REPORT_DIGEST_WEEKLY_TIME') ??
          '09:30',
        weekday: this.getInt('REPORT_DIGEST_WEEKLY_DAY', 1),
      },
    ];
  }

  private isScheduleDue(schedule: DigestSchedule, localNow: Date) {
    const targetMinute = this.parseTime(schedule.time);
    const currentMinute =
      localNow.getUTCHours() * 60 + localNow.getUTCMinutes();
    const windowMinutes = this.getPositiveInt(
      'REPORT_DIGEST_SCHEDULER_WINDOW_MINUTES',
      DEFAULT_WINDOW_MINUTES,
    );

    if (
      schedule.weekday !== undefined &&
      localNow.getUTCDay() !== schedule.weekday
    ) {
      return false;
    }

    return (
      currentMinute >= targetMinute &&
      currentMinute < targetMinute + windowMinutes
    );
  }

  private parseTime(value: string) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());

    if (!match) {
      return 9 * 60;
    }

    const hours = Math.min(Math.max(Number(match[1]), 0), 23);
    const minutes = Math.min(Math.max(Number(match[2]), 0), 59);

    return hours * 60 + minutes;
  }

  private isSchedulerEnabled() {
    const explicit = this.configService
      .get<string>('REPORT_DIGEST_SCHEDULER_ENABLED')
      ?.trim()
      .toLowerCase();

    if (explicit) {
      return ['1', 'true', 'yes', 'on'].includes(explicit);
    }

    const nodeEnv = this.configService.get<string>('NODE_ENV')?.trim();
    const syncToken = this.configService
      .get<string>('SYNC_SERVICE_TOKEN')
      ?.trim();

    return nodeEnv === 'production' && Boolean(syncToken);
  }

  private getInt(key: string, fallback: number) {
    const value = this.configService.get<string>(key);
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private getPositiveInt(key: string, fallback: number) {
    const value = Math.trunc(this.getInt(key, fallback));

    return value > 0 ? value : fallback;
  }

  private errorMessage(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    return message.slice(0, 1000);
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    );
  }
}
