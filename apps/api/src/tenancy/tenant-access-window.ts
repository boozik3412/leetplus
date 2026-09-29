import { TenantCustomerStage } from '@prisma/client';
import { TRIAL_BOUND_STAGES } from './tenant-execution-policy.service';

/**
 * "Access until further notice" for a PILOT/BETA tenant.
 *
 * The schema requires PILOT/BETA tenants to carry a finite, ordered trial
 * window (`Tenant_external_stage_trial_check`) and the execution policy denies
 * sessions once `trialEndsAt` passes. An open-ended window is therefore stored
 * as this far-future end instead of NULL: both invariants stay untouched and no
 * schema change is needed. The value stays in year 9999 in every time zone.
 */
export const OPEN_ENDED_TENANT_ACCESS_ENDS_AT = new Date(
  '9999-12-31T00:00:00.000Z',
);

const OPEN_ENDED_THRESHOLD_MS = Date.UTC(9999, 0, 1);
const DAY_MS = 24 * 60 * 60 * 1000;

/** Days before the end when the platform overview starts warning. */
export const TENANT_ACCESS_EXPIRY_WARNING_DAYS = 7;

export type TenantAccessState =
  /** INTERNAL/LIVE: no time limit applies to this stage at all. */
  | 'NOT_TIME_BOUND'
  /** PILOT/BETA shell that has not been activated yet. */
  | 'NOT_CONFIGURED'
  | 'NOT_STARTED'
  | 'OPEN_ENDED'
  | 'ACTIVE_UNTIL'
  | 'EXPIRED';

export type TenantAccessSummary = {
  state: TenantAccessState;
  /** The platform admin can change the window for this tenant. */
  manageable: boolean;
  startsAt: string | null;
  /** Null for NOT_TIME_BOUND, NOT_CONFIGURED and OPEN_ENDED. */
  endsAt: string | null;
  /** Whole days left for ACTIVE_UNTIL, rounded up. */
  daysLeft: number | null;
  executionRevision: number;
};

export function isOpenEndedTenantAccess(endsAt: Date): boolean {
  return endsAt.getTime() >= OPEN_ENDED_THRESHOLD_MS;
}

export function isTimeBoundCustomerStage(stage: TenantCustomerStage): boolean {
  return TRIAL_BOUND_STAGES.has(stage);
}

export function describeTenantAccess(
  tenant: {
    customerStage: TenantCustomerStage;
    trialStartsAt: Date | null;
    trialEndsAt: Date | null;
    executionRevision: number;
  },
  now = new Date(),
): TenantAccessSummary {
  const base = {
    startsAt: tenant.trialStartsAt?.toISOString() ?? null,
    executionRevision: tenant.executionRevision,
  };

  if (!isTimeBoundCustomerStage(tenant.customerStage)) {
    return {
      ...base,
      state: 'NOT_TIME_BOUND',
      manageable: false,
      endsAt: null,
      daysLeft: null,
    };
  }

  if (!tenant.trialStartsAt || !tenant.trialEndsAt) {
    return {
      ...base,
      state: 'NOT_CONFIGURED',
      manageable: false,
      endsAt: null,
      daysLeft: null,
    };
  }

  const manageable = { ...base, manageable: true };

  if (isOpenEndedTenantAccess(tenant.trialEndsAt)) {
    return {
      ...manageable,
      state: now < tenant.trialStartsAt ? 'NOT_STARTED' : 'OPEN_ENDED',
      endsAt: null,
      daysLeft: null,
    };
  }

  const endsAt = tenant.trialEndsAt.toISOString();

  if (now >= tenant.trialEndsAt) {
    return { ...manageable, state: 'EXPIRED', endsAt, daysLeft: null };
  }

  if (now < tenant.trialStartsAt) {
    return { ...manageable, state: 'NOT_STARTED', endsAt, daysLeft: null };
  }

  return {
    ...manageable,
    state: 'ACTIVE_UNTIL',
    endsAt,
    daysLeft: Math.ceil(
      (tenant.trialEndsAt.getTime() - now.getTime()) / DAY_MS,
    ),
  };
}
