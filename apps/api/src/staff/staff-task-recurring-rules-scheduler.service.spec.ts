import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import type { StaffTaskRecurringRulesService } from './staff-task-recurring-rules.service';
import { StaffTaskRecurringRulesSchedulerService } from './staff-task-recurring-rules-scheduler.service';

function createService(configValues: Record<string, string | undefined> = {}) {
  const configService = {
    get: jest.fn((key: string) => configValues[key]),
  } as unknown as ConfigService;
  const prisma = {
    tenant: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const recurringRulesService = {
    runDueRulesForTenant: jest.fn(),
  };
  const service = new StaffTaskRecurringRulesSchedulerService(
    configService,
    prisma as unknown as PrismaService,
    recurringRulesService as unknown as StaffTaskRecurringRulesService,
  );

  return { prisma, recurringRulesService, service };
}

describe('StaffTaskRecurringRulesSchedulerService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('starts only when explicitly enabled with true', () => {
    const { prisma, service } = createService({
      STAFF_TASK_RULES_SCHEDULER_ENABLED: 'true',
    });

    service.onModuleInit();

    expect(prisma.tenant.findMany).toHaveBeenCalledTimes(1);
    service.onModuleDestroy();
  });

  it('stays disabled when explicitly set to false', () => {
    const { prisma, service } = createService({
      STAFF_TASK_RULES_SCHEDULER_ENABLED: 'false',
    });

    service.onModuleInit();

    expect(prisma.tenant.findMany).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });

  it('stays disabled when the flag is unset', () => {
    const { prisma, service } = createService();

    service.onModuleInit();

    expect(prisma.tenant.findMany).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });

  it('does not auto-enable in production when a sync token is configured', () => {
    const { prisma, service } = createService({
      NODE_ENV: 'production',
      SYNC_SERVICE_TOKEN: 'sync-token',
    });

    service.onModuleInit();

    expect(prisma.tenant.findMany).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });
});
