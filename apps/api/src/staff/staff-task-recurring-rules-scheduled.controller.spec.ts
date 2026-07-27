import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { StaffModule } from './staff.module';
import { StaffTaskRecurringRulesScheduledController } from './staff-task-recurring-rules-scheduled.controller';
import { StaffTaskRecurringRulesSchedulerService } from './staff-task-recurring-rules-scheduler.service';
import type { StaffTaskRecurringRulesService } from './staff-task-recurring-rules.service';

function createSubject(configValues: Record<string, string | undefined> = {}) {
  const configService = {
    get: jest.fn((key: string) => configValues[key]),
  } as unknown as ConfigService;
  const recurringRulesService = {
    runDueRulesForAllTenants: jest.fn().mockResolvedValue({
      now: '2026-07-27T00:00:00.000Z',
      dryRun: false,
      limit: 50,
      due: 0,
      created: 0,
      skipped: 0,
      failed: 0,
      runs: [],
    }),
  };
  const controller = new StaffTaskRecurringRulesScheduledController(
    configService,
    recurringRulesService as unknown as StaffTaskRecurringRulesService,
  );

  return { controller, recurringRulesService };
}

describe('StaffTaskRecurringRulesScheduledController', () => {
  it('keeps the scheduled controller and scheduler outside the StaffModule runtime graph', () => {
    const controllers: unknown = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      StaffModule,
    );
    const providers: unknown = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      StaffModule,
    );

    expect(Array.isArray(controllers)).toBe(true);
    expect(Array.isArray(providers)).toBe(true);
    expect(controllers).not.toContain(
      StaffTaskRecurringRulesScheduledController,
    );
    expect(providers).not.toContain(StaffTaskRecurringRulesSchedulerService);
  });

  it('stays unavailable when the HTTP flag is unset', () => {
    const { controller, recurringRulesService } = createSubject();

    expect(() => controller.runDueRules(undefined, {})).toThrow(
      ServiceUnavailableException,
    );
    expect(
      recurringRulesService.runDueRulesForAllTenants,
    ).not.toHaveBeenCalled();
  });

  it('stays unavailable when the HTTP flag is false', () => {
    const { controller, recurringRulesService } = createSubject({
      STAFF_TASK_RULES_SCHEDULED_HTTP_ENABLED: 'false',
    });

    expect(() => controller.runDueRules(undefined, {})).toThrow(
      ServiceUnavailableException,
    );
    expect(
      recurringRulesService.runDueRulesForAllTenants,
    ).not.toHaveBeenCalled();
  });

  it('does not auto-enable in production when a sync token is configured', () => {
    const { controller, recurringRulesService } = createSubject({
      NODE_ENV: 'production',
      SYNC_SERVICE_TOKEN: 'sync-token',
    });

    expect(() => controller.runDueRules('sync-token', {})).toThrow(
      ServiceUnavailableException,
    );
    expect(
      recurringRulesService.runDueRulesForAllTenants,
    ).not.toHaveBeenCalled();
  });

  it('checks the sync token only after the HTTP endpoint is enabled', () => {
    const { controller, recurringRulesService } = createSubject({
      STAFF_TASK_RULES_SCHEDULED_HTTP_ENABLED: 'true',
      SYNC_SERVICE_TOKEN: 'sync-token',
    });

    expect(() => controller.runDueRules('invalid-token', {})).toThrow(
      UnauthorizedException,
    );
    expect(
      recurringRulesService.runDueRulesForAllTenants,
    ).not.toHaveBeenCalled();
  });

  it('delegates only when explicitly enabled and the sync token is valid', async () => {
    const { controller, recurringRulesService } = createSubject({
      STAFF_TASK_RULES_SCHEDULED_HTTP_ENABLED: 'true',
      SYNC_SERVICE_TOKEN: 'sync-token',
    });
    const dto = { limit: 25, dryRun: true };

    await expect(controller.runDueRules('sync-token', dto)).resolves.toEqual(
      expect.objectContaining({ limit: 50, runs: [] }),
    );
    expect(recurringRulesService.runDueRulesForAllTenants).toHaveBeenCalledWith(
      dto,
    );
  });
});
