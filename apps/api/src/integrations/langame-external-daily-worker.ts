import { TenantCustomerStage } from '@prisma/client';
import type {
  DailySyncResult,
  LangameDailySyncService,
} from './langame-daily-sync.service';
import {
  createLangameExternalPilotAuthority,
  type LangameExternalPilotAuthority,
} from './langame-external-pilot-authority';

export type LangameExternalWorkerConfig = Readonly<{
  runId: string;
  mode: 'CANARY' | 'TIMER';
  date: string | null;
  businessDate: string;
  authority: LangameExternalPilotAuthority;
}>;

export type LangameExternalWorkerTerminal = Readonly<{
  contract: 'LEETPLUS_LANGAME_EXTERNAL_WORKER_RESULT_V1';
  worker: 'langame-external-daily-worker';
  runId: string;
  originalRunId: string | null;
  replayed: boolean;
  mode: 'CANARY' | 'TIMER';
  businessDate: string;
  tenantId: string;
  tenantSlug: string;
  sourceId: string;
  storeId: string;
  profileRevision: number;
  executionRevision: number;
  storeRevision: number;
  decision: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  partialScopes: string[];
  failedScopes: string[];
}>;

const EXPECTED_DAILY_SCOPES = [
  'BUSINESS_FACTS',
  'GUEST_FOUNDATION',
  'STAFF_SHIFTS',
  'BUSINESS_SNAPSHOTS',
] as const;

function exactDailyScopes(result: DailySyncResult) {
  const scopes = result.results[0]?.scopes ?? [];
  const names = new Set(scopes.map((scope) => scope.scope));
  return (
    scopes.length === EXPECTED_DAILY_SCOPES.length &&
    names.size === EXPECTED_DAILY_SCOPES.length &&
    EXPECTED_DAILY_SCOPES.every((scope) => names.has(scope)) &&
    scopes.every((scope) => scope.status !== 'RUNNING') &&
    scopes.every((scope) => !scope.partial || scope.status === 'FAILED')
  );
}

export class ExternalWorkerIncompleteError extends Error {
  constructor(
    message: string,
    readonly result: DailySyncResult,
  ) {
    super(message);
  }
}

const requiredBoolean = (
  env: NodeJS.ProcessEnv,
  key: string,
  expected: string,
) => {
  if (env[key] !== expected) throw new Error(`${key}=${expected} is required`);
};
const requireValue = (env: NodeJS.ProcessEnv, key: string) => {
  const value = env[key];
  if (!value || value !== value.trim() || /[\r\n\0]/.test(value)) {
    throw new Error(`${key} must be one exact nonempty value`);
  }
  return value;
};

/** Consumes a separately signed external-only Compose secret profile. */
export function loadLangameExternalWorkerConfig(
  env: NodeJS.ProcessEnv = process.env,
): LangameExternalWorkerConfig {
  requiredBoolean(env, 'LANGAME_EXTERNAL_WORKER_ENABLED', 'true');
  requiredBoolean(env, 'LANGAME_EXTERNAL_WORKER_LIVE', 'true');
  requiredBoolean(env, 'LANGAME_DAILY_SYNC_SCHEDULER_ENABLED', 'false');
  requiredBoolean(env, 'LANGAME_SCHEDULED_HTTP_ENABLED', 'false');
  requiredBoolean(env, 'GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED', 'false');
  // This worker has no reward, activity recovery, retention or guest-game effect.
  for (const key of [
    'LANGAME_DAILY_WORKER_ACTIVITY_RECOVERY_ENABLED',
    'LANGAME_DAILY_WORKER_RETENTION_ENABLED',
    'LANGAME_DAILY_WORKER_RETENTION_LIVE',
    'LANGAME_BONUS_ACCRUAL_ENABLED',
  ]) {
    if (env[key] && env[key] !== 'false') {
      throw new Error(`${key} must remain disabled for the external worker`);
    }
  }

  const mode = requireValue(env, 'LANGAME_EXTERNAL_WORKER_MODE');
  if (mode !== 'CANARY' && mode !== 'TIMER') {
    throw new Error('LANGAME_EXTERNAL_WORKER_MODE must be CANARY or TIMER');
  }
  const date = env.LANGAME_EXTERNAL_WORKER_DATE ?? null;
  if (mode === 'CANARY') {
    if (!date || !validBusinessDate(date)) {
      throw new Error('External canary requires one ISO business date');
    }
  } else if (date !== null) {
    throw new Error('External timer must not carry a canary date');
  }
  const businessDate = requireValue(
    env,
    'LANGAME_EXTERNAL_WORKER_BUSINESS_DATE',
  );
  if (!validBusinessDate(businessDate) || (date && date !== businessDate)) {
    throw new Error(
      'External native business date must match the exact worker day',
    );
  }

  const revisionText = requireValue(
    env,
    'LANGAME_EXTERNAL_WORKER_EXECUTION_REVISION',
  );
  const revision = Number(revisionText);
  const profileRevision = Number(
    requireValue(env, 'LANGAME_EXTERNAL_WORKER_PROFILE_REVISION'),
  );
  const storeRevision = Number(
    requireValue(env, 'LANGAME_EXTERNAL_WORKER_STORE_REVISION'),
  );
  const runId = requireValue(env, 'LANGAME_EXTERNAL_WORKER_RUN_ID');
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      runId,
    )
  ) {
    throw new Error('External worker run ID must be a UUID');
  }
  const customerStage = requireValue(
    env,
    'LANGAME_EXTERNAL_WORKER_CUSTOMER_STAGE',
  );
  if (customerStage !== TenantCustomerStage.LIVE) {
    throw new Error('External worker requires the LIVE customer stage');
  }
  const authority = createLangameExternalPilotAuthority({
    tenantId: requireValue(env, 'LANGAME_EXTERNAL_WORKER_TENANT_ID'),
    tenantSlug: requireValue(env, 'LANGAME_EXTERNAL_WORKER_TENANT_SLUG'),
    sourceId: requireValue(env, 'LANGAME_EXTERNAL_WORKER_SOURCE_ID'),
    storeId: requireValue(env, 'LANGAME_EXTERNAL_WORKER_STORE_ID'),
    externalDomain: requireValue(env, 'LANGAME_EXTERNAL_WORKER_DOMAIN'),
    externalClubId: requireValue(env, 'LANGAME_EXTERNAL_WORKER_CLUB_ID'),
    profileRevision,
    executionRevision: revision,
    storeRevision,
    customerStage,
  });
  return Object.freeze({ runId, mode, date, businessDate, authority });
}

function validBusinessDate(value: string) {
  if (!/^20\d\d-\d\d-\d\d$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function externalWorkerBusinessDate(
  config: LangameExternalWorkerConfig,
) {
  return config.businessDate;
}

export function externalWorkerTerminal(
  config: LangameExternalWorkerConfig,
  businessDate: string,
  result?: DailySyncResult,
): LangameExternalWorkerTerminal {
  const tenant = result?.results[0];
  const partialScopes =
    tenant?.scopes
      .filter((scope) => scope.partial === true)
      .map((scope) => scope.scope) ?? [];
  const failedScopes =
    tenant?.scopes
      .filter((scope) => scope.status === 'FAILED' && scope.partial !== true)
      .map((scope) => scope.scope) ?? [];
  const validResult =
    result?.date === businessDate &&
    result.tenants === 1 &&
    result.processedTenants === 1 &&
    result.skippedTenants === 0 &&
    result.results.length === 1 &&
    tenant?.tenantId === config.authority.tenantId &&
    tenant.slug === config.authority.tenantSlug &&
    tenant.status === 'PROCESSED' &&
    !tenant.skipped &&
    exactDailyScopes(result);
  return Object.freeze({
    contract: 'LEETPLUS_LANGAME_EXTERNAL_WORKER_RESULT_V1',
    worker: 'langame-external-daily-worker',
    runId: config.runId,
    originalRunId: null,
    replayed: false,
    mode: config.mode,
    businessDate,
    tenantId: config.authority.tenantId,
    tenantSlug: config.authority.tenantSlug,
    sourceId: config.authority.sourceId,
    storeId: config.authority.storeId,
    profileRevision: config.authority.profileRevision,
    executionRevision: config.authority.executionRevision,
    storeRevision: config.authority.storeRevision,
    decision:
      !validResult || failedScopes.length
        ? 'FAILED'
        : partialScopes.length
          ? 'PARTIAL'
          : 'SUCCESS',
    partialScopes,
    failedScopes: validResult ? failedScopes : ['SCOPE_OR_DATE_MISMATCH'],
  });
}

export async function runLangameExternalWorkerOnce(
  service: Pick<LangameDailySyncService, 'runDailySync'>,
  env: NodeJS.ProcessEnv = process.env,
  logger: Pick<Console, 'log'> = console,
): Promise<DailySyncResult> {
  const config = loadLangameExternalWorkerConfig(env);
  const result = await service.runDailySync({
    tenantSlug: config.authority.tenantSlug,
    externalPilot: config.authority,
    ...(config.date
      ? { date: config.date }
      : { externalBusinessDate: config.businessDate }),
  });
  const tenant = result.results[0];
  if (
    result.tenants !== 1 ||
    result.date !== config.businessDate ||
    result.processedTenants !== 1 ||
    result.skippedTenants !== 0 ||
    result.results.length !== 1 ||
    !tenant ||
    tenant.tenantId !== config.authority.tenantId ||
    tenant.slug !== config.authority.tenantSlug ||
    tenant.status !== 'PROCESSED' ||
    tenant.skipped ||
    !exactDailyScopes(result)
  ) {
    throw new ExternalWorkerIncompleteError(
      'External Langame pilot tenant was not processed exactly once',
      result,
    );
  }
  const failedScopes = tenant.scopes.filter(
    (scope) => scope.status === 'FAILED' && scope.partial !== true,
  );
  const partialScopes = tenant.scopes.filter((scope) => scope.partial === true);
  logger.log(
    `External Langame worker finished: mode=${config.mode} date=${result.date} scopes=${tenant.scopes.length} decision=${failedScopes.length ? 'FAILED' : partialScopes.length ? 'PARTIAL' : 'SUCCESS'} partial=${partialScopes.length} failed=${failedScopes.length}`,
  );
  if (failedScopes.length > 0) {
    throw new ExternalWorkerIncompleteError(
      `External Langame pilot has incomplete scopes: ${failedScopes.map((scope) => scope.scope).join(',')}`,
      result,
    );
  }
  return result;
}
