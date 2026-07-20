import { ConfigService } from '@nestjs/config';
import { GuestGamificationPipelineSchedulerService } from './guest-gamification-pipeline-scheduler.service';
import type {
  GuestGamificationService,
  GuestGameScheduledPipelineRunResult,
} from './guest-gamification.service';

function scheduledResult(
  overrides: Partial<GuestGameScheduledPipelineRunResult> = {},
): GuestGameScheduledPipelineRunResult {
  return {
    dryRunOnly: false,
    langameWrite: false,
    checkedTenants: 1,
    processedTenants: 1,
    skippedTenants: 0,
    erroredTenants: 0,
    availableFacts: 1,
    checkedFacts: 1,
    processedFacts: 1,
    skippedFacts: 0,
    duplicateFacts: 0,
    erroredFacts: 0,
    appliedXpDelta: 10,
    queuedRewards: 1,
    queuedRewardAmount: 100,
    tenants: [],
    note: 'processed',
    ...overrides,
  };
}

function createService(configValues: Record<string, string | undefined> = {}) {
  const config = {
    get: jest.fn((key: string) => configValues[key]),
  } as unknown as ConfigService;
  const gamificationService = {
    runSnapshotPipelineScheduled: jest
      .fn()
      .mockResolvedValue(scheduledResult()),
  };
  const service = new GuestGamificationPipelineSchedulerService(
    config,
    gamificationService as unknown as GuestGamificationService,
  );

  return { gamificationService, service };
}

describe('GuestGamificationPipelineSchedulerService', () => {
  beforeEach(() => jest.useFakeTimers());

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('stays disabled by default outside production', () => {
    const { gamificationService, service } = createService();

    service.onModuleInit();

    expect(
      gamificationService.runSnapshotPipelineScheduled,
    ).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });

  it('starts automatically in production when the sync token is configured', () => {
    const { service } = createService({
      NODE_ENV: 'production',
      SYNC_SERVICE_TOKEN: 'sync-token',
    });
    const runOnce = jest.spyOn(service, 'runOnce').mockResolvedValue(null);

    service.onModuleInit();

    expect(runOnce).toHaveBeenCalledTimes(1);
    service.onModuleDestroy();
  });

  it('runs the live pipeline with configured scope', async () => {
    const { gamificationService, service } = createService({
      GUEST_GAME_PIPELINE_SCHEDULER_LIMIT: '12',
      GUEST_GAME_PIPELINE_SCHEDULER_TENANT_SLUG: 'demo',
    });

    await service.runOnce();

    expect(
      gamificationService.runSnapshotPipelineScheduled,
    ).toHaveBeenCalledWith({
      dryRunOnly: false,
      limit: 12,
      tenantSlug: 'demo',
    });
  });

  it('keeps the ordinary scheduler tick active while historical backfill is OFF', async () => {
    const { gamificationService, service } = createService({
      GUEST_GAME_PIPELINE_BACKFILL_MODE: 'OFF',
      GUEST_GAME_PIPELINE_BACKFILL_KILL_SWITCH: 'true',
    });

    await service.runOnce();

    expect(
      gamificationService.runSnapshotPipelineScheduled,
    ).toHaveBeenCalledWith({ dryRunOnly: false, limit: 30 });
  });

  it('skips overlapping ticks', async () => {
    const { gamificationService, service } = createService();
    let resolveRun:
      | ((result: GuestGameScheduledPipelineRunResult) => void)
      | null = null;

    gamificationService.runSnapshotPipelineScheduled.mockReturnValueOnce(
      new Promise<GuestGameScheduledPipelineRunResult>((resolve) => {
        resolveRun = resolve;
      }),
    );

    const firstRun = service.runOnce();

    await expect(service.runOnce()).resolves.toBeNull();
    expect(
      gamificationService.runSnapshotPipelineScheduled,
    ).toHaveBeenCalledTimes(1);

    resolveRun?.(scheduledResult());
    await expect(firstRun).resolves.toMatchObject({ processedFacts: 1 });
  });
});
