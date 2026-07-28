import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { GuestBonusLedgerService } from './guest-bonus-ledger.service';
import { GuestGamificationScheduledController } from './guest-gamification-scheduled.controller';
import type { GuestGamificationService } from './guest-gamification.service';

function createSubject(configValues: Record<string, string | undefined> = {}) {
  const configService = {
    get: jest.fn((key: string) => configValues[key]),
  } as unknown as ConfigService;
  const gamificationService = {
    runSnapshotPipelineScheduled: jest.fn().mockResolvedValue({}),
    runDeliveryDispatchScheduled: jest.fn().mockResolvedValue({}),
    pullBotDeliveries: jest.fn().mockResolvedValue({}),
    ackBotDelivery: jest.fn().mockResolvedValue({}),
  };
  const bonusLedgerService = {
    runScheduledDispatch: jest.fn().mockResolvedValue({}),
  };
  const controller = new GuestGamificationScheduledController(
    configService,
    gamificationService as unknown as GuestGamificationService,
    bonusLedgerService as unknown as GuestBonusLedgerService,
  );

  return { controller, gamificationService, bonusLedgerService };
}

describe('GuestGamificationScheduledController', () => {
  it('rejects every scheduled endpoint before service execution in isolated mode', () => {
    const { controller, gamificationService, bonusLedgerService } =
      createSubject({
        DESIGN_PARTNER_ISOLATED_MODE: 'true',
        SYNC_SERVICE_TOKEN: 'sync-token',
      });
    const calls = [
      () => controller.runScheduledPipeline('sync-token', {}),
      () => controller.runScheduledDeliveryDispatch('sync-token', {}),
      () => controller.pullBotDeliveries('sync-token', {}),
      () => controller.ackBotDelivery('sync-token', {}),
      () => controller.runScheduledBonusLedgerDispatch('sync-token', {}),
    ];

    for (const call of calls) {
      expect(call).toThrow(ServiceUnavailableException);
    }
    expect(
      gamificationService.runSnapshotPipelineScheduled,
    ).not.toHaveBeenCalled();
    expect(
      gamificationService.runDeliveryDispatchScheduled,
    ).not.toHaveBeenCalled();
    expect(gamificationService.pullBotDeliveries).not.toHaveBeenCalled();
    expect(gamificationService.ackBotDelivery).not.toHaveBeenCalled();
    expect(bonusLedgerService.runScheduledDispatch).not.toHaveBeenCalled();
  });
});
