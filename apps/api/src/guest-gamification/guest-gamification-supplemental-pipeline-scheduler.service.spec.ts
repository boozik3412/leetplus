import { GuestGamificationSupplementalPipelineSchedulerService } from './guest-gamification-supplemental-pipeline-scheduler.service';
import type { GuestGameSupplementalPipelineRunResult } from './guest-gamification.service';

function result(
  overrides: Partial<GuestGameSupplementalPipelineRunResult> = {},
): GuestGameSupplementalPipelineRunResult {
  return {
    mode: 'SHADOW',
    checkedTenants: 1,
    processedTenants: 1,
    skippedTenants: 0,
    erroredTenants: 0,
    checkedFacts: 1,
    processedFacts: 0,
    shadowFacts: 1,
    duplicateFacts: 0,
    failedFacts: 0,
    createdEvents: 0,
    createdRewards: 0,
    tenants: [],
    ...overrides,
  };
}

function createScheduler(values: Record<string, string> = {}) {
  const config = {
    get: jest.fn((key: string) => values[key]),
  };
  const gamificationService = {
    runSupplementalPipelineScheduled: jest.fn().mockResolvedValue(result()),
  };
  return {
    scheduler: new GuestGamificationSupplementalPipelineSchedulerService(
      config as never,
      gamificationService as never,
    ),
    gamificationService,
  };
}

describe('GuestGamificationSupplementalPipelineSchedulerService', () => {
  it('does nothing while the supplemental mode is OFF', async () => {
    const { scheduler, gamificationService } = createScheduler();

    await expect(scheduler.runOnce()).resolves.toBeNull();
    expect(
      gamificationService.runSupplementalPipelineScheduled,
    ).not.toHaveBeenCalled();
  });

  it('runs only the explicitly allowed balance fact in SHADOW', async () => {
    const { scheduler, gamificationService } = createScheduler({
      GUEST_GAME_SUPPLEMENTAL_PIPELINE_MODE: 'SHADOW',
      GUEST_GAME_SUPPLEMENTAL_FACT_TYPES: 'BALANCE_TOPUP,PRODUCT_PURCHASE',
      GUEST_GAME_SUPPLEMENTAL_PIPELINE_BATCH_SIZE: '12',
      GUEST_GAME_SUPPLEMENTAL_PIPELINE_TENANT_SLUG: 'demo',
    });

    await expect(scheduler.runOnce()).resolves.toMatchObject({
      mode: 'SHADOW',
      shadowFacts: 1,
      createdEvents: 0,
      createdRewards: 0,
    });
    expect(
      gamificationService.runSupplementalPipelineScheduled,
    ).toHaveBeenCalledWith({
      mode: 'SHADOW',
      factTypes: ['BALANCE_TOPUP'],
      limit: 12,
      tenantSlug: 'demo',
    });
  });

  it('honors the emergency kill switch even in LIVE mode', async () => {
    const { scheduler, gamificationService } = createScheduler({
      GUEST_GAME_SUPPLEMENTAL_PIPELINE_MODE: 'LIVE',
      GUEST_GAME_SUPPLEMENTAL_PIPELINE_KILL_SWITCH: 'true',
    });

    await expect(scheduler.runOnce()).resolves.toBeNull();
    expect(
      gamificationService.runSupplementalPipelineScheduled,
    ).not.toHaveBeenCalled();
  });
});
