import { TenantCustomerStage } from '@prisma/client';

export const TENANT_BACKGROUND_EXECUTION_STAGES = [
  'INTERNAL',
  'EXTERNAL',
] as const;

export type TenantBackgroundExecutionStage =
  (typeof TENANT_BACKGROUND_EXECUTION_STAGES)[number];

export const TENANT_BACKGROUND_JOB_KINDS = [
  'REPORT_DIGEST_SMTP',
  'GUEST_BONUS_LEDGER_LANGAME',
  'LANGAME_SCHEDULED_SYNC',
  'LANGAME_DAILY_SYNC',
  'LANGAME_BUSINESS_SNAPSHOT',
  'LANGAME_GUEST_DATA_FOUNDATION',
  'GUEST_GAMIFICATION_SNAPSHOT_PIPELINE',
  'GUEST_GAMIFICATION_SUPPLEMENTAL_PIPELINE',
  'GUEST_GAME_DELIVERY_DISPATCH',
  'GUEST_GAME_DELIVERY_BOT_PULL',
  'GUEST_ACTIVITY_LEDGER_SYNC',
  'GUEST_GAME_DATA_RETENTION',
  'GUEST_GAME_LEDGER_FALLBACK',
  'GUEST_GAME_LOOT_BOX_RECOVERY',
  'GUEST_GAME_QUALITY_MONITORING',
  'GUEST_GAME_REWARD_MATERIALIZER',
  'STAFF_TASK_RECURRING_RULES',
] as const;

export type TenantBackgroundJobKind =
  (typeof TENANT_BACKGROUND_JOB_KINDS)[number];

export type TenantBackgroundExternalPolicy =
  | 'REVISION_FENCED'
  | 'EXTERNAL_DENY';

export const TENANT_BACKGROUND_EXECUTION_REGISTRY = Object.freeze({
  REPORT_DIGEST_SMTP: 'REVISION_FENCED',
  GUEST_BONUS_LEDGER_LANGAME: 'REVISION_FENCED',
  LANGAME_SCHEDULED_SYNC: 'EXTERNAL_DENY',
  LANGAME_DAILY_SYNC: 'EXTERNAL_DENY',
  LANGAME_BUSINESS_SNAPSHOT: 'EXTERNAL_DENY',
  LANGAME_GUEST_DATA_FOUNDATION: 'EXTERNAL_DENY',
  GUEST_GAMIFICATION_SNAPSHOT_PIPELINE: 'EXTERNAL_DENY',
  GUEST_GAMIFICATION_SUPPLEMENTAL_PIPELINE: 'EXTERNAL_DENY',
  GUEST_GAME_DELIVERY_DISPATCH: 'EXTERNAL_DENY',
  GUEST_GAME_DELIVERY_BOT_PULL: 'EXTERNAL_DENY',
  GUEST_ACTIVITY_LEDGER_SYNC: 'EXTERNAL_DENY',
  GUEST_GAME_DATA_RETENTION: 'EXTERNAL_DENY',
  GUEST_GAME_LEDGER_FALLBACK: 'EXTERNAL_DENY',
  GUEST_GAME_LOOT_BOX_RECOVERY: 'EXTERNAL_DENY',
  GUEST_GAME_QUALITY_MONITORING: 'EXTERNAL_DENY',
  GUEST_GAME_REWARD_MATERIALIZER: 'EXTERNAL_DENY',
  STAFF_TASK_RECURRING_RULES: 'EXTERNAL_DENY',
} satisfies Record<TenantBackgroundJobKind, TenantBackgroundExternalPolicy>);

export type TenantBackgroundExecutionPolicyReasonCode =
  | 'ALLOWED_INTERNAL_LEGACY'
  | 'ALLOWED_EXTERNAL_REVISION_FENCED'
  | 'BACKGROUND_EXECUTION_STAGE_REQUIRED'
  | 'BACKGROUND_EXECUTION_STAGE_UNKNOWN'
  | 'BACKGROUND_JOB_KIND_REQUIRED'
  | 'BACKGROUND_JOB_KIND_UNKNOWN'
  | 'BACKGROUND_EXTERNAL_EXECUTION_DENIED';

export type TenantBackgroundExecutionPolicyDecision = {
  allowed: boolean;
  reasonCode: TenantBackgroundExecutionPolicyReasonCode;
  note: string;
  stage: TenantBackgroundExecutionStage | null;
  jobKind: TenantBackgroundJobKind | null;
  externalPolicy: TenantBackgroundExternalPolicy | null;
};

export type TenantBackgroundExecutionPolicyInput = Readonly<{
  stage?: unknown;
  jobKind?: unknown;
}>;

const policyNotes = Object.freeze({
  ALLOWED_INTERNAL_LEGACY:
    'Known background job is allowed in the legacy internal stage.',
  ALLOWED_EXTERNAL_REVISION_FENCED:
    'External background job is allowed because its effect path is revision-fenced.',
  BACKGROUND_EXECUTION_STAGE_REQUIRED:
    'Background execution stage is required.',
  BACKGROUND_EXECUTION_STAGE_UNKNOWN:
    'Background execution stage is not recognized.',
  BACKGROUND_JOB_KIND_REQUIRED: 'Background job kind is required.',
  BACKGROUND_JOB_KIND_UNKNOWN: 'Background job kind is not recognized.',
  BACKGROUND_EXTERNAL_EXECUTION_DENIED:
    'External execution is denied until this background job has a revision-fenced effect path.',
} satisfies Record<TenantBackgroundExecutionPolicyReasonCode, string>);

export function evaluateTenantBackgroundExecutionPolicy(
  input: TenantBackgroundExecutionPolicyInput,
): TenantBackgroundExecutionPolicyDecision {
  if (isMissingPolicyValue(input.stage)) {
    return deniedDecision(
      'BACKGROUND_EXECUTION_STAGE_REQUIRED',
      null,
      null,
      null,
    );
  }

  if (!isTenantBackgroundExecutionStage(input.stage)) {
    return deniedDecision(
      'BACKGROUND_EXECUTION_STAGE_UNKNOWN',
      null,
      null,
      null,
    );
  }

  const stage = input.stage;

  if (isMissingPolicyValue(input.jobKind)) {
    return deniedDecision('BACKGROUND_JOB_KIND_REQUIRED', stage, null, null);
  }

  if (!isTenantBackgroundJobKind(input.jobKind)) {
    return deniedDecision('BACKGROUND_JOB_KIND_UNKNOWN', stage, null, null);
  }

  const jobKind = input.jobKind;
  const externalPolicy = TENANT_BACKGROUND_EXECUTION_REGISTRY[jobKind];

  if (stage === 'INTERNAL') {
    return allowedDecision(
      'ALLOWED_INTERNAL_LEGACY',
      stage,
      jobKind,
      externalPolicy,
    );
  }

  if (externalPolicy === 'REVISION_FENCED') {
    return allowedDecision(
      'ALLOWED_EXTERNAL_REVISION_FENCED',
      stage,
      jobKind,
      externalPolicy,
    );
  }

  return deniedDecision(
    'BACKGROUND_EXTERNAL_EXECUTION_DENIED',
    stage,
    jobKind,
    externalPolicy,
  );
}

export function tenantBackgroundStageForCustomerStage(
  value: unknown,
): TenantBackgroundExecutionStage | null {
  if (value === TenantCustomerStage.INTERNAL) {
    return 'INTERNAL';
  }

  if (
    value === TenantCustomerStage.PILOT ||
    value === TenantCustomerStage.BETA ||
    value === TenantCustomerStage.LIVE
  ) {
    return 'EXTERNAL';
  }

  return null;
}

export function tenantBackgroundExecutionNote(
  decision: TenantBackgroundExecutionPolicyDecision,
): string {
  return `Background execution ${decision.reasonCode}: ${decision.note}`;
}

export function isTenantBackgroundJobKind(
  value: unknown,
): value is TenantBackgroundJobKind {
  return (
    typeof value === 'string' &&
    TENANT_BACKGROUND_JOB_KINDS.some((jobKind) => jobKind === value)
  );
}

export function isTenantBackgroundExecutionStage(
  value: unknown,
): value is TenantBackgroundExecutionStage {
  return value === 'INTERNAL' || value === 'EXTERNAL';
}

function isMissingPolicyValue(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function allowedDecision(
  reasonCode: 'ALLOWED_INTERNAL_LEGACY' | 'ALLOWED_EXTERNAL_REVISION_FENCED',
  stage: TenantBackgroundExecutionStage,
  jobKind: TenantBackgroundJobKind,
  externalPolicy: TenantBackgroundExternalPolicy,
): TenantBackgroundExecutionPolicyDecision {
  return {
    allowed: true,
    reasonCode,
    note: policyNotes[reasonCode],
    stage,
    jobKind,
    externalPolicy,
  };
}

function deniedDecision(
  reasonCode: Exclude<
    TenantBackgroundExecutionPolicyReasonCode,
    'ALLOWED_INTERNAL_LEGACY' | 'ALLOWED_EXTERNAL_REVISION_FENCED'
  >,
  stage: TenantBackgroundExecutionStage | null,
  jobKind: TenantBackgroundJobKind | null,
  externalPolicy: TenantBackgroundExternalPolicy | null,
): TenantBackgroundExecutionPolicyDecision {
  return {
    allowed: false,
    reasonCode,
    note: policyNotes[reasonCode],
    stage,
    jobKind,
    externalPolicy,
  };
}
