import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, TenantCustomerStage, TenantModule } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  TenantExecutionAction,
  TenantExecutionDecision,
  TenantExecutionDenialReason,
  TenantExecutionPolicyService,
} from './tenant-execution-policy.service';

export const TENANT_EXECUTION_ADMISSION_DENIAL_REASONS = [
  'TENANT_NOT_FOUND',
  'TENANT_EXECUTION_REQUIREMENTS_EMPTY',
] as const;

export type TenantExecutionAdmissionDenialReason =
  | TenantExecutionDenialReason
  | (typeof TENANT_EXECUTION_ADMISSION_DENIAL_REASONS)[number];

export type TenantExecutionRequirement = {
  module: TenantModule;
  action: TenantExecutionAction;
};

export type TenantExecutionRequirementInput =
  | TenantExecutionRequirement
  | readonly TenantExecutionRequirement[];

export type TenantExecutionAdmissionDecision = {
  allowed: boolean;
  tenantId: string;
  reasonCode: 'ALLOWED' | TenantExecutionAdmissionDenialReason;
  failedRequirement: TenantExecutionRequirement | null;
  entitlementProfileRevision: number | null;
  customerStage: TenantCustomerStage | null;
  internalEntitlementBypass: boolean;
};

const tenantExecutionSubjectSelect = {
  id: true,
  status: true,
  customerStage: true,
  onboardingStatus: true,
  trialStartsAt: true,
  trialEndsAt: true,
  entitlementProfileRevision: true,
  moduleEntitlements: {
    select: {
      module: true,
      readEnabled: true,
      writeEnabled: true,
      outboundEnabled: true,
      validFrom: true,
      validUntil: true,
      profileRevision: true,
    },
  },
} satisfies Prisma.TenantSelect;

type LoadedTenantExecutionSubject = Prisma.TenantGetPayload<{
  select: typeof tenantExecutionSubjectSelect;
}>;

@Injectable()
export class TenantExecutionAdmissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TenantExecutionPolicyService,
  ) {}

  async evaluate(
    tenantId: string,
    requirementInput: TenantExecutionRequirementInput,
    now = new Date(),
  ): Promise<TenantExecutionAdmissionDecision> {
    const subject = await this.loadSubject(tenantId);
    if (!subject) {
      return {
        allowed: false,
        tenantId,
        reasonCode: 'TENANT_NOT_FOUND',
        failedRequirement: null,
        entitlementProfileRevision: null,
        customerStage: null,
        internalEntitlementBypass: false,
      };
    }

    const requirements = this.normalizeRequirements(requirementInput);
    if (requirements.length === 0) {
      return {
        allowed: false,
        tenantId: subject.id,
        reasonCode: 'TENANT_EXECUTION_REQUIREMENTS_EMPTY',
        failedRequirement: null,
        entitlementProfileRevision: subject.entitlementProfileRevision,
        customerStage: subject.customerStage,
        internalEntitlementBypass: false,
      };
    }

    if (subject.customerStage === TenantCustomerStage.INTERNAL) {
      return this.fromPolicyDecision(
        subject,
        this.policy.evaluateSession(subject, now),
        requirements[0],
        true,
      );
    }

    for (const requirement of requirements) {
      const decision = this.policy.evaluateModule(
        subject,
        requirement.module,
        requirement.action,
        now,
      );
      if (!decision.allowed) {
        return this.fromPolicyDecision(subject, decision, requirement, false);
      }
    }

    return {
      allowed: true,
      tenantId: subject.id,
      reasonCode: 'ALLOWED',
      failedRequirement: null,
      entitlementProfileRevision: subject.entitlementProfileRevision,
      customerStage: subject.customerStage,
      internalEntitlementBypass: false,
    };
  }

  async assertAllowed(
    tenantId: string,
    requirementInput: TenantExecutionRequirementInput,
    now = new Date(),
  ): Promise<TenantExecutionAdmissionDecision> {
    const decision = await this.evaluate(tenantId, requirementInput, now);
    if (!decision.allowed) {
      throw new ForbiddenException({
        message: `Tenant execution is not admitted: ${decision.reasonCode}`,
        reasonCode: decision.reasonCode,
        tenantId: decision.tenantId,
        failedRequirement: decision.failedRequirement,
      });
    }

    return decision;
  }

  private loadSubject(
    tenantId: string,
  ): Promise<LoadedTenantExecutionSubject | null> {
    return this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: tenantExecutionSubjectSelect,
    });
  }

  private normalizeRequirements(
    requirementInput: TenantExecutionRequirementInput,
  ): readonly TenantExecutionRequirement[] {
    if (Array.isArray(requirementInput)) {
      return requirementInput as readonly TenantExecutionRequirement[];
    }

    return [requirementInput as TenantExecutionRequirement];
  }

  private fromPolicyDecision(
    subject: LoadedTenantExecutionSubject,
    decision: TenantExecutionDecision,
    requirement: TenantExecutionRequirement,
    internalEntitlementBypass: boolean,
  ): TenantExecutionAdmissionDecision {
    return {
      allowed: decision.allowed,
      tenantId: decision.tenantId,
      reasonCode: decision.reasonCode,
      failedRequirement: decision.allowed ? null : requirement,
      entitlementProfileRevision: decision.entitlementProfileRevision,
      customerStage: subject.customerStage,
      internalEntitlementBypass,
    };
  }
}
