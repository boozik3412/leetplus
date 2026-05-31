import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StaffTaskRecurringRulesService } from './staff-task-recurring-rules.service';

const DEFAULT_INTERVAL_MS = 60 * 1000;
const DEFAULT_LIMIT = 50;

@Injectable()
export class StaffTaskRecurringRulesSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    StaffTaskRecurringRulesSchedulerService.name,
  );
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly staffTaskRecurringRulesService: StaffTaskRecurringRulesService,
  ) {}

  onModuleInit() {
    if (!this.isSchedulerEnabled()) {
      this.logger.log('Staff task recurring rules scheduler is disabled');
      return;
    }

    const intervalMs = this.getPositiveInt(
      'STAFF_TASK_RULES_SCHEDULER_INTERVAL_MS',
      DEFAULT_INTERVAL_MS,
    );
    this.logger.log(
      `Staff task recurring rules scheduler is enabled with ${intervalMs}ms interval`,
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
    const tenants = await this.prisma.tenant.findMany({
      select: { id: true, slug: true },
      orderBy: { slug: 'asc' },
    });
    const limit = this.getPositiveInt(
      'STAFF_TASK_RULES_SCHEDULER_LIMIT',
      DEFAULT_LIMIT,
    );

    for (const tenant of tenants) {
      try {
        const result =
          await this.staffTaskRecurringRulesService.runDueRulesForTenant(
            tenant.id,
            {
              now: now.toISOString(),
              limit,
            },
          );

        if (result.due > 0 || result.failed > 0) {
          this.logger.log(
            `Staff task rules for ${tenant.slug}: due=${result.due}, created=${result.created}, skipped=${result.skipped}, failed=${result.failed}`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to run staff task rules for ${tenant.slug}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  private isSchedulerEnabled() {
    const explicit = this.configService
      .get<string>('STAFF_TASK_RULES_SCHEDULER_ENABLED')
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

  private getPositiveInt(key: string, fallback: number) {
    const value = Math.trunc(Number(this.configService.get<string>(key)));

    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
