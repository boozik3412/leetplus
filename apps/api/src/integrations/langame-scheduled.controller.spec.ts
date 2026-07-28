import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { LangameDailySyncService } from './langame-daily-sync.service';
import { LangameScheduledController } from './langame-scheduled.controller';
import type { LangameSyncService } from './langame-sync.service';

function createSubject(configValues: Record<string, string | undefined> = {}) {
  const configService = {
    get: jest.fn((key: string) => configValues[key]),
  } as unknown as ConfigService;
  const langameSyncService = {
    syncConfiguredTenants: jest.fn().mockResolvedValue({}),
  };
  const langameDailySyncService = {
    runDailySync: jest.fn().mockResolvedValue({}),
  };
  const controller = new LangameScheduledController(
    configService,
    langameSyncService as unknown as LangameSyncService,
    langameDailySyncService as unknown as LangameDailySyncService,
  );

  return { controller, langameSyncService, langameDailySyncService };
}

describe('LangameScheduledController', () => {
  it('rejects every scheduled endpoint before service execution in isolated mode', () => {
    const { controller, langameSyncService, langameDailySyncService } =
      createSubject({
        DESIGN_PARTNER_ISOLATED_MODE: 'true',
        SYNC_SERVICE_TOKEN: 'sync-token',
      });

    expect(() => controller.sync('sync-token', {})).toThrow(
      ServiceUnavailableException,
    );
    expect(() => controller.dailySync('sync-token', {})).toThrow(
      ServiceUnavailableException,
    );
    expect(langameSyncService.syncConfiguredTenants).not.toHaveBeenCalled();
    expect(langameDailySyncService.runDailySync).not.toHaveBeenCalled();
  });

  it('keeps token validation and delegation unchanged outside isolated mode', async () => {
    const { controller, langameSyncService, langameDailySyncService } =
      createSubject({
        DESIGN_PARTNER_ISOLATED_MODE: 'false',
        SYNC_SERVICE_TOKEN: 'sync-token',
      });

    expect(() => controller.sync('invalid-token', {})).toThrow(
      UnauthorizedException,
    );
    await expect(controller.sync('sync-token', {})).resolves.toEqual({});
    await expect(controller.dailySync('sync-token', {})).resolves.toEqual({});
    expect(langameSyncService.syncConfiguredTenants).toHaveBeenCalledWith({
      mode: 'QUICK',
      trigger: 'AUTO',
    });
    expect(langameDailySyncService.runDailySync).toHaveBeenCalledWith({});
  });
});
