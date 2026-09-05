import type {
  GuestBonusLedgerService,
  GuestGameScheduledBonusLedgerDispatchDto,
  GuestGameScheduledBonusLedgerDispatchResult,
} from './guest-bonus-ledger.service';

export type GuestBonusLedgerWorkerLogger = Pick<
  Console,
  'error' | 'log' | 'warn'
>;

export type GuestBonusLedgerWorkerConfig = {
  tenantId: string | null;
  tenantSlug: string | null;
  rewardId: string | null;
  rewardTypes: string[];
  limit: number;
  dryRun: boolean;
  canary: boolean;
  queueApprovedRewards: boolean;
};

const workerEnabledKey = 'GUEST_BONUS_LEDGER_WORKER_ENABLED';
const liveWriteEnabledKey = 'LANGAME_BONUS_ACCRUAL_ENABLED';
const tenantSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const rewardTypePattern = /^[A-Z][A-Z0-9_]{0,63}$/;

export function loadGuestBonusLedgerWorkerConfig(
  env: NodeJS.ProcessEnv = process.env,
): GuestBonusLedgerWorkerConfig {
  if (parseBoolean(env[workerEnabledKey], false, workerEnabledKey) !== true) {
    throw new Error(`${workerEnabledKey}=true is required`);
  }

  requireBoundedWorkerDatabasePool(env.DATABASE_URL);

  const tenantId = optional(env.GUEST_BONUS_LEDGER_WORKER_TENANT_ID);
  const tenantSlug = optional(env.GUEST_BONUS_LEDGER_WORKER_TENANT_SLUG);
  if (Boolean(tenantId) === Boolean(tenantSlug)) {
    throw new Error(
      'Exactly one GUEST_BONUS_LEDGER_WORKER_TENANT_ID or GUEST_BONUS_LEDGER_WORKER_TENANT_SLUG is required',
    );
  }
  if (tenantId && !uuidPattern.test(tenantId)) {
    throw new Error('GUEST_BONUS_LEDGER_WORKER_TENANT_ID must be a UUID');
  }
  if (tenantSlug && !tenantSlugPattern.test(tenantSlug)) {
    throw new Error(
      'GUEST_BONUS_LEDGER_WORKER_TENANT_SLUG must be a lowercase slug',
    );
  }

  const dryRun = parseBoolean(
    env.GUEST_BONUS_LEDGER_WORKER_DRY_RUN,
    true,
    'GUEST_BONUS_LEDGER_WORKER_DRY_RUN',
  );
  const canary = parseBoolean(
    env.GUEST_BONUS_LEDGER_WORKER_CANARY,
    true,
    'GUEST_BONUS_LEDGER_WORKER_CANARY',
  );
  const queueApprovedRewards = parseBoolean(
    env.GUEST_BONUS_LEDGER_WORKER_QUEUE_APPROVED_REWARDS,
    true,
    'GUEST_BONUS_LEDGER_WORKER_QUEUE_APPROVED_REWARDS',
  );
  if (
    !dryRun &&
    parseBoolean(env[liveWriteEnabledKey], false, liveWriteEnabledKey) !== true
  ) {
    throw new Error(
      `${liveWriteEnabledKey}=true is required for a live worker tick`,
    );
  }

  const rewardId = optional(env.GUEST_BONUS_LEDGER_WORKER_REWARD_ID);
  if (rewardId && !uuidPattern.test(rewardId)) {
    throw new Error('GUEST_BONUS_LEDGER_WORKER_REWARD_ID must be a UUID');
  }
  if (rewardId && !canary) {
    throw new Error(
      'GUEST_BONUS_LEDGER_WORKER_REWARD_ID is allowed only in canary mode',
    );
  }

  const configuredLimit = boundedPositiveInt(
    env.GUEST_BONUS_LEDGER_WORKER_LIMIT,
    canary ? 1 : 50,
    250,
    'GUEST_BONUS_LEDGER_WORKER_LIMIT',
  );
  if (canary && configuredLimit !== 1) {
    throw new Error(
      'GUEST_BONUS_LEDGER_WORKER_LIMIT must equal 1 in canary mode',
    );
  }

  const rewardTypes = parseRewardTypes(
    env.GUEST_BONUS_LEDGER_WORKER_REWARD_TYPES ??
      env.LANGAME_BONUS_ACCRUAL_REWARD_TYPES,
  );

  return {
    tenantId,
    tenantSlug,
    rewardId,
    rewardTypes,
    limit: configuredLimit,
    dryRun,
    canary,
    queueApprovedRewards,
  };
}

export async function runGuestBonusLedgerWorkerOnce(
  service: Pick<GuestBonusLedgerService, 'runScheduledDispatch'>,
  env: NodeJS.ProcessEnv = process.env,
  logger: GuestBonusLedgerWorkerLogger = console,
): Promise<GuestGameScheduledBonusLedgerDispatchResult> {
  const config = loadGuestBonusLedgerWorkerConfig(env);
  const dto: GuestGameScheduledBonusLedgerDispatchDto = {
    dryRun: config.dryRun,
    canary: config.canary,
    queueApprovedRewards: config.queueApprovedRewards,
    limit: config.limit,
    rewardTypes: config.rewardTypes,
    ...(config.tenantId ? { tenantId: config.tenantId } : {}),
    ...(config.tenantSlug ? { tenantSlug: config.tenantSlug } : {}),
    ...(config.rewardId ? { rewardId: config.rewardId } : {}),
  };
  const result = await service.runScheduledDispatch(dto);

  logger.log(
    [
      'Guest bonus ledger worker finished:',
      `mode=${result.mode}`,
      `dryRun=${result.dryRun}`,
      `tenants=${result.processedTenants}/${result.checkedTenants}`,
      `queued=${result.queued}`,
      `checked=${result.checked}`,
      `confirmed=${result.confirmed}`,
      `failed=${result.failed}`,
      `blocked=${result.blocked}`,
      `skipped=${result.skipped}`,
    ].join(' '),
  );

  if (result.checkedTenants !== 1 || result.processedTenants !== 1) {
    throw new Error(
      `Worker tenant scope was not processed exactly once: checked=${result.checkedTenants}, processed=${result.processedTenants}`,
    );
  }
  if (result.erroredTenants > 0 || result.failed > 0) {
    throw new Error(
      `Worker tick reported failures: tenants=${result.erroredTenants}, entries=${result.failed}`,
    );
  }
  if (!config.dryRun && (result.mode !== 'READY' || result.dryRun)) {
    throw new Error('Live worker tick did not enter READY mode');
  }
  if (result.blocked > 0) {
    logger.warn(`Guest bonus ledger worker blocked=${result.blocked}`);
  }

  return result;
}

function optional(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseBoolean(
  value: string | undefined,
  fallback: boolean,
  key: string,
) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`${key} must be a boolean`);
}

function boundedPositiveInt(
  value: string | undefined,
  fallback: number,
  maximum: number,
  key: string,
) {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${key} must be an integer between 1 and ${maximum}`);
  }
  return parsed;
}

function parseRewardTypes(value: string | undefined) {
  const values = (value ?? 'BONUS,BONUS_POINTS,BONUS_BALANCE,LOYALTY_BONUS')
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  const unique = [...new Set(values)];
  if (
    unique.length === 0 ||
    unique.length > 20 ||
    unique.some((item) => !rewardTypePattern.test(item))
  ) {
    throw new Error(
      'GUEST_BONUS_LEDGER_WORKER_REWARD_TYPES must contain 1-20 valid reward types',
    );
  }
  return unique;
}

function requireBoundedWorkerDatabasePool(value: string | undefined) {
  const error =
    'DATABASE_URL must reserve the dedicated worker pool with connection_limit=2, pool_timeout=5 and connect_timeout=5';
  if (!value || value !== value.trim()) {
    throw new Error(error);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(error);
  }

  const allowedOptions = new Set([
    'schema',
    'connection_limit',
    'pool_timeout',
    'connect_timeout',
    'sslmode',
    'sslaccept',
  ]);
  const seen = new Set<string>();
  for (const [key] of parsed.searchParams) {
    if (seen.has(key) || !allowedOptions.has(key)) {
      throw new Error(error);
    }
    seen.add(key);
  }

  if (
    parsed.protocol !== 'postgresql:' ||
    !parsed.username ||
    !parsed.password ||
    !parsed.hostname ||
    parsed.pathname.length <= 1 ||
    parsed.hash ||
    parsed.searchParams.get('schema') !== 'public' ||
    parsed.searchParams.get('connection_limit') !== '2' ||
    parsed.searchParams.get('pool_timeout') !== '5' ||
    parsed.searchParams.get('connect_timeout') !== '5'
  ) {
    throw new Error(error);
  }
}
