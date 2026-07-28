import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ReportsDigestScheduledController } from './reports-digest-scheduled.controller';
import type { ReportsDigestService } from './reports-digest.service';

function createSubject(configValues: Record<string, string | undefined> = {}) {
  const configService = {
    get: jest.fn((key: string) => configValues[key]),
  } as unknown as ConfigService;
  const reportsDigestService = {
    sendScheduledDigests: jest.fn().mockResolvedValue({}),
  };
  const controller = new ReportsDigestScheduledController(
    configService,
    reportsDigestService as unknown as ReportsDigestService,
  );

  return { controller, reportsDigestService };
}

describe('ReportsDigestScheduledController', () => {
  it('rejects isolated scheduled HTTP before any digest is sent', () => {
    const { controller, reportsDigestService } = createSubject({
      DESIGN_PARTNER_ISOLATED_MODE: 'true',
      REPORT_DIGEST_SCHEDULED_HTTP_ENABLED: 'true',
      SYNC_SERVICE_TOKEN: 'sync-token',
    });

    expect(() => controller.sendScheduledDigests('sync-token', {})).toThrow(
      ServiceUnavailableException,
    );
    expect(reportsDigestService.sendScheduledDigests).not.toHaveBeenCalled();
  });

  it('requires the explicit scheduled HTTP enable flag', () => {
    const { controller, reportsDigestService } = createSubject({
      SYNC_SERVICE_TOKEN: 'sync-token',
    });

    expect(() =>
      controller.sendScheduledDigests('sync-token', { dryRun: true }),
    ).toThrow(ServiceUnavailableException);
    expect(reportsDigestService.sendScheduledDigests).not.toHaveBeenCalled();
  });

  it('keeps token validation for the explicitly enabled dry-run path', async () => {
    const { controller, reportsDigestService } = createSubject({
      REPORT_DIGEST_SCHEDULED_HTTP_ENABLED: 'true',
      SYNC_SERVICE_TOKEN: 'sync-token',
    });

    expect(() =>
      controller.sendScheduledDigests('invalid-token', { dryRun: true }),
    ).toThrow(UnauthorizedException);
    await expect(
      controller.sendScheduledDigests('sync-token', { dryRun: true }),
    ).resolves.toEqual({});
    expect(reportsDigestService.sendScheduledDigests).toHaveBeenCalledWith({
      dryRun: true,
    });
  });

  it('rejects live HTTP sends until they use the persisted run coordinator', () => {
    const { controller, reportsDigestService } = createSubject({
      REPORT_DIGEST_SCHEDULED_HTTP_ENABLED: 'true',
      SYNC_SERVICE_TOKEN: 'sync-token',
    });

    expect(() =>
      controller.sendScheduledDigests('sync-token', { type: 'DAILY' }),
    ).toThrow(ServiceUnavailableException);
    expect(reportsDigestService.sendScheduledDigests).not.toHaveBeenCalled();
  });
});
