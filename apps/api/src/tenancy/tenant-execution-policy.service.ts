import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  TenantCustomerStage,
  TenantLifecycleStatus,
  TenantModule,
  TenantOnboardingStatus,
} from '@prisma/client';
import { COMPLETE_TENANT_MODULE_PROFILE } from './tenant-entitlement-profile.service';

export const TENANT_EXECUTION_ACTIONS = ['READ', 'WRITE', 'OUTBOUND'] as const;

export type TenantExecutionAction = (typeof TENANT_EXECUTION_ACTIONS)[number];

export const TENANT_EXECUTION_DENIAL_REASONS = [
  'TENANT_INACTIVE',
  'TENANT_ONBOARDING_BLOCKED',
  'TENANT_ACTIVATION_LIFECYCLE_BLOCKED',
  'TENANT_ACTIVATION_ONBOARDING_BLOCKED',
  'TENANT_ACTIVATION_OUTBOUND_ENABLED',
  'TRIAL_WINDOW_MISSING',
  'TRIAL_WINDOW_INVALID',
  'TRIAL_NOT_STARTED',
  'TRIAL_EXPIRED',
  'ENTITLEMENT_PROFILE_REVISION_UNINITIALIZED',
  'ENTITLEMENT_PROFILE_INCOMPLETE',
  'ENTITLEMENT_MISSING',
  'ENTITLEMENT_AMBIGUOUS',
  'ENTITLEMENT_PROFILE_REVISION_MISMATCH',
  'ENTITLEMENT_INVALID',
  'ENTITLEMENT_NOT_STARTED',
  'ENTITLEMENT_EXPIRED',
  'ENTITLEMENT_READ_DISABLED',
  'ENTITLEMENT_WRITE_DISABLED',
  'ENTITLEMENT_OUTBOUND_DISABLED',
] as const;

export type TenantExecutionDenialReason =
  (typeof TENANT_EXECUTION_DENIAL_REASONS)[number];

export type PersistedTenantModuleEntitlement = {
  module: TenantModule;
  readEnabled: boolean;
  writeEnabled: boolean;
  outboundEnabled: boolean;
  validFrom: Date | null;
  validUntil: Date | null;
  profileRevision: number;
};

export type PersistedTenantExecutionSubject = {
  id: string;
  status: TenantLifecycleStatus;
  customerStage: TenantCustomerStage;
  onboardingStatus: TenantOnboardingStatus;
  trialStartsAt: Date | null;
  trialEndsAt: Date | null;
  entitlementProfileRevision: number;
  executionRevision: number;
  moduleEntitlements?: readonly PersistedTenantModuleEntitlement[];
};

export type TenantExecutionDecision = {
  allowed: boolean;
  tenantId: string;
  reasonCode: 'ALLOWED' | TenantExecutionDenialReason;
  module?: TenantModule;
  action?: TenantExecutionAction;
  entitlementProfileRevision: number;
};

const SESSION_ADMITTED_ONBOARDING_STATUSES = new Set<TenantOnboardingStatus>([
  TenantOnboardingStatus.ONBOARDING,
  TenantOnboardingStatus.READY,
  TenantOnboardingStatus.ACTIVE,
]);

const ACTIVATION_ADMITTED_ONBOARDING_STATUSES = new Set<TenantOnboardingStatus>(
  [
    TenantOnboardingStatus.OWNER_INVITED,
    TenantOnboardingStatus.ONBOARDING,
    TenantOnboardingStatus.READY,
    TenantOnboardingStatus.ACTIVE,
  ],
);

const INVITE_ADMITTED_ONBOARDING_STATUSES = new Set<TenantOnboardingStatus>([
  TenantOnboardingStatus.OWNER_INVITED,
  TenantOnboardingStatus.ONBOARDING,
  TenantOnboardingStatus.READY,
  TenantOnboardingStatus.ACTIVE,
]);

const TRIAL_BOUND_STAGES = new Set<TenantCustomerStage>([
  TenantCustomerStage.PILOT,
  TenantCustomerStage.BETA,
]);

@Injectable()
export class TenantExecutionPolicyService {
  evaluateSession(
    subject: PersistedTenantExecutionSubject,
    now = new Date(),
  ): TenantExecutionDecision {
    if (subject.status !== TenantLifecycleStatus.ACTIVE) {
      return this.deny(subject, 'TENANT_INACTIVE');
    }

    if (!SESSION_ADMITTED_ONBOARDING_STATUSES.has(subject.onboardingStatus)) {
      return this.deny(subject, 'TENANT_ONBOARDING_BLOCKED');
    }

    const trialDecision = this.evaluateTrialWindow(subject, now);
    if (trialDecision) {
      return trialDecision;
    }

    const profileDecision = this.evaluateExternalProfile(subject);
    if (profileDecision) {
      return profileDecision;
    }

    return this.allow(subject);
  }

  evaluateInvite(
    subject: PersistedTenantExecutionSubject,
    now = new Date(),
  ): TenantExecutionDecision {
    if (subject.status !== TenantLifecycleStatus.ACTIVE) {
      return this.deny(subject, 'TENANT_INACTIVE');
    }

    if (!INVITE_ADMITTED_ONBOARDING_STATUSES.has(subject.onboardingStatus)) {
      return this.deny(subject, 'TENANT_ONBOARDING_BLOCKED');
    }

    const trialDecision = this.evaluateTrialWindow(subject, now);
    if (trialDecision) {
      return trialDecision;
    }

    const profileDecision = this.evaluateExternalProfile(subject);
    if (profileDecision) {
      return profileDecision;
    }

    return this.allow(subject);
  }

  evaluateActivation(
    subject: PersistedTenantExecutionSubject,
    now = new Date(),
  ): TenantExecutionDecision {
    if (subject.status !== TenantLifecycleStatus.SUSPENDED) {
      return this.deny(subject, 'TENANT_ACTIVATION_LIFECYCLE_BLOCKED');
    }

    if (
      !ACTIVATION_ADMITTED_ONBOARDING_STATUSES.has(subject.onboardingStatus)
    ) {
      return this.deny(subject, 'TENANT_ACTIVATION_ONBOARDING_BLOCKED');
    }

    const trialDecision = this.evaluateTrialWindow(subject, now);
    if (trialDecision) {
      return trialDecision;
    }

    if (
      !Number.isSafeInteger(subject.entitlementProfileRevision) ||
      subject.entitlementProfileRevision < 1
    ) {
      return this.deny(subject, 'ENTITLEMENT_PROFILE_REVISION_UNINITIALIZED');
    }

    const entitlements = subject.moduleEntitlements ?? [];
    const modules = new Set(entitlements.map((entry) => entry.module));
    if (
      entitlements.length !== COMPLETE_TENANT_MODULE_PROFILE.length ||
      modules.size !== entitlements.length ||
      COMPLETE_TENANT_MODULE_PROFILE.some((module) => !modules.has(module))
    ) {
      return this.deny(subject, 'ENTITLEMENT_PROFILE_INCOMPLETE');
    }

    for (const module of COMPLETE_TENANT_MODULE_PROFILE) {
      const entitlement = entitlements.find((entry) => entry.module === module);
      if (!entitlement) {
        return this.deny(subject, 'ENTITLEMENT_PROFILE_INCOMPLETE');
      }

      if (entitlement.outboundEnabled) {
        return this.deny(subject, 'TENANT_ACTIVATION_OUTBOUND_ENABLED');
      }

      const decision = this.evaluateEntitlement(
        subject,
        entitlement,
        module,
        'WRITE',
        now,
      );
      if (!decision.allowed) {
        return decision;
      }
    }

    return this.allow(subject);
  }

  evaluateModule(
    subject: PersistedTenantExecutionSubject,
    module: TenantModule,
    action: TenantExecutionAction,
    now = new Date(),
  ): TenantExecutionDecision {
    const sessionDecision = this.evaluateSession(subject, now);
    if (!sessionDecision.allowed) {
      return { ...sessionDecision, module, action };
    }

    if (
      !Number.isSafeInteger(subject.entitlementProfileRevision) ||
      subject.entitlementProfileRevision < 1
    ) {
      return this.deny(
        subject,
        'ENTITLEMENT_PROFILE_REVISION_UNINITIALIZED',
        module,
        action,
      );
    }

    const matches = (subject.moduleEntitlements ?? []).filter(
      (entitlement) => entitlement.module === module,
    );

    if (matches.length === 0) {
      return this.deny(subject, 'ENTITLEMENT_MISSING', module, action);
    }

    if (matches.length !== 1) {
      return this.deny(subject, 'ENTITLEMENT_AMBIGUOUS', module, action);
    }

    return this.evaluateEntitlement(subject, matches[0], module, action, now);
  }

  assertSessionAllowed(
    subject: PersistedTenantExecutionSubject,
    now = new Date(),
  ): void {
    const decision = this.evaluateSession(subject, now);
    if (!decision.allowed) {
      throw new UnauthorizedException(
        `Tenant session is not admitted: ${decision.reasonCode}`,
      );
    }
  }

  assertModuleAllowed(
    subject: PersistedTenantExecutionSubject,
    module: TenantModule,
    action: TenantExecutionAction,
    now = new Date(),
  ): void {
    const decision = this.evaluateModule(subject, module, action, now);
    if (!decision.allowed) {
      throw new ForbiddenException(
        `Tenant module action is not admitted: ${decision.reasonCode}`,
      );
    }
  }

  assertInviteAllowed(
    subject: PersistedTenantExecutionSubject,
    now = new Date(),
  ): void {
    const decision = this.evaluateInvite(subject, now);
    if (!decision.allowed) {
      throw new UnauthorizedException(
        `Tenant invite is not admitted: ${decision.reasonCode}`,
      );
    }
  }

  assertActivationAllowed(
    subject: PersistedTenantExecutionSubject,
    now = new Date(),
  ): void {
    const decision = this.evaluateActivation(subject, now);
    if (!decision.allowed) {
      throw new ForbiddenException(
        `Tenant activation is not admitted: ${decision.reasonCode}`,
      );
    }
  }

  private evaluateTrialWindow(
    subject: PersistedTenantExecutionSubject,
    now: Date,
  ): TenantExecutionDecision | null {
    if (!TRIAL_BOUND_STAGES.has(subject.customerStage)) {
      return null;
    }

    if (!subject.trialStartsAt || !subject.trialEndsAt) {
      return this.deny(subject, 'TRIAL_WINDOW_MISSING');
    }

    if (
      !this.validDate(subject.trialStartsAt) ||
      !this.validDate(subject.trialEndsAt) ||
      subject.trialStartsAt >= subject.trialEndsAt
    ) {
      return this.deny(subject, 'TRIAL_WINDOW_INVALID');
    }

    if (now < subject.trialStartsAt) {
      return this.deny(subject, 'TRIAL_NOT_STARTED');
    }

    if (now >= subject.trialEndsAt) {
      return this.deny(subject, 'TRIAL_EXPIRED');
    }

    return null;
  }

  private evaluateExternalProfile(
    subject: PersistedTenantExecutionSubject,
  ): TenantExecutionDecision | null {
    if (subject.customerStage === TenantCustomerStage.INTERNAL) {
      return null;
    }

    if (
      !Number.isSafeInteger(subject.entitlementProfileRevision) ||
      subject.entitlementProfileRevision < 1
    ) {
      return this.deny(
        subject,
        'ENTITLEMENT_PROFILE_REVISION_UNINITIALIZED',
      );
    }

    const entitlements = subject.moduleEntitlements ?? [];
    const modules = new Set(entitlements.map((entry) => entry.module));
    if (
      entitlements.length !== COMPLETE_TENANT_MODULE_PROFILE.length ||
      modules.size !== entitlements.length ||
      COMPLETE_TENANT_MODULE_PROFILE.some((module) => !modules.has(module))
    ) {
      return this.deny(subject, 'ENTITLEMENT_PROFILE_INCOMPLETE');
    }

    if (
      entitlements.some(
        (entry) =>
          entry.profileRevision !== subject.entitlementProfileRevision,
      )
    ) {
      return this.deny(
        subject,
        'ENTITLEMENT_PROFILE_REVISION_MISMATCH',
      );
    }

    return null;
  }

  private evaluateEntitlement(
    subject: PersistedTenantExecutionSubject,
    entitlement: PersistedTenantModuleEntitlement,
    module: TenantModule,
    action: TenantExecutionAction,
    now: Date,
  ): TenantExecutionDecision {
    if (entitlement.profileRevision !== subject.entitlementProfileRevision) {
      return this.deny(
        subject,
        'ENTITLEMENT_PROFILE_REVISION_MISMATCH',
        module,
        action,
      );
    }

    if (
      !Number.isSafeInteger(entitlement.profileRevision) ||
      entitlement.profileRevision < 1 ||
      (entitlement.writeEnabled && !entitlement.readEnabled) ||
      (entitlement.outboundEnabled && !entitlement.writeEnabled) ||
      (entitlement.validFrom !== null &&
        !this.validDate(entitlement.validFrom)) ||
      (entitlement.validUntil !== null &&
        !this.validDate(entitlement.validUntil)) ||
      (entitlement.validFrom !== null &&
        entitlement.validUntil !== null &&
        entitlement.validFrom >= entitlement.validUntil)
    ) {
      return this.deny(subject, 'ENTITLEMENT_INVALID', module, action);
    }

    if (entitlement.validFrom !== null && now < entitlement.validFrom) {
      return this.deny(subject, 'ENTITLEMENT_NOT_STARTED', module, action);
    }

    if (entitlement.validUntil !== null && now >= entitlement.validUntil) {
      return this.deny(subject, 'ENTITLEMENT_EXPIRED', module, action);
    }

    if (!entitlement.readEnabled) {
      return this.deny(subject, 'ENTITLEMENT_READ_DISABLED', module, action);
    }

    if (
      (action === 'WRITE' || action === 'OUTBOUND') &&
      !entitlement.writeEnabled
    ) {
      return this.deny(subject, 'ENTITLEMENT_WRITE_DISABLED', module, action);
    }

    if (action === 'OUTBOUND' && !entitlement.outboundEnabled) {
      return this.deny(
        subject,
        'ENTITLEMENT_OUTBOUND_DISABLED',
        module,
        action,
      );
    }

    return this.allow(subject, module, action);
  }

  private validDate(value: Date): boolean {
    return !Number.isNaN(value.getTime());
  }

  private allow(
    subject: PersistedTenantExecutionSubject,
    module?: TenantModule,
    action?: TenantExecutionAction,
  ): TenantExecutionDecision {
    return {
      allowed: true,
      tenantId: subject.id,
      reasonCode: 'ALLOWED',
      module,
      action,
      entitlementProfileRevision: subject.entitlementProfileRevision,
    };
  }

  private deny(
    subject: PersistedTenantExecutionSubject,
    reasonCode: TenantExecutionDenialReason,
    module?: TenantModule,
    action?: TenantExecutionAction,
  ): TenantExecutionDecision {
    return {
      allowed: false,
      tenantId: subject.id,
      reasonCode,
      module,
      action,
      entitlementProfileRevision: subject.entitlementProfileRevision,
    };
  }
}
