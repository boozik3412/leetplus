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
  'TENANT_EXECUTION_REVISION_INVALID',
  'TENANT_EXECUTION_REVISION_CHANGED',
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
  executionRevision: number | null;
  customerStage: TenantCustomerStage | null;
  internalEntitlementBypass: boolean;
};

export type TenantExecutionPermit = {
  tenantId: string;
  executionRevision: number;
  requirements: readonly TenantExecutionRequirement[];
};

export type TenantExecutionPermitAcquisition = {
  decision: TenantExecutionAdmissionDecision;
  permit: TenantExecutionPermit | null;
};

const tenantExecutionSubjectSelect = {
  id: true,
  status: true,
  customerStage: true,
  onboardingStatus: true,
  trialStartsAt: true,
  trialEndsAt: true,
  entitlementProfileRevision: true,
  executionRevision: true,
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
        executionRevision: null,
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
        executionRevision: subject.executionRevision,
        customerStage: subject.customerStage,
        internalEntitlementBypass: false,
      };
    }

    if (
      !Number.isSafeInteger(subject.executionRevision) ||
      subject.executionRevision < 1
    ) {
      return {
        allowed: false,
        tenantId: subject.id,
        reasonCode: 'TENANT_EXECUTION_REVISION_INVALID',
        failedRequirement: null,
        entitlementProfileRevision: subject.entitlementProfileRevision,
        executionRevision: null,
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
      executionRevision: subject.executionRevision,
      customerStage: subject.customerStage,
      internalEntitlementBypass: false,
    };
  }

  async acquirePermit(
    tenantId: string,
    requirementInput: TenantExecutionRequirementInput,
    now = new Date(),
  ): Promise<TenantExecutionPermitAcquisition> {
    const requirements = this.normalizeRequirements(requirementInput);
    const decision = await this.evaluate(tenantId, requirements, now);
    const permit =
      decision.allowed && decision.executionRevision !== null
        ? {
            tenantId: decision.tenantId,
            executionRevision: decision.executionRevision,
            requirements: requirements.map((requirement) => ({
              ...requirement,
            })),
          }
        : null;

    return { decision, permit };
  }

  async issuePermit(
    tenantId: string,
    requirementInput: TenantExecutionRequirementInput,
    now = new Date(),
  ): Promise<TenantExecutionPermit> {
    const acquisition = await this.acquirePermit(
      tenantId,
      requirementInput,
      now,
    );
    if (!acquisition.permit) {
      this.throwDenied(acquisition.decision);
    }

    return acquisition.permit;
  }

  async evaluatePermit(
    permit: TenantExecutionPermit,
    now = new Date(),
  ): Promise<TenantExecutionAdmissionDecision> {
    const decision = await this.evaluate(
      permit.tenantId,
      permit.requirements,
      now,
    );
    if (
      decision.allowed &&
      decision.executionRevision !== permit.executionRevision
    ) {
      return {
        ...decision,
        allowed: false,
        reasonCode: 'TENANT_EXECUTION_REVISION_CHANGED',
        failedRequirement: null,
      };
    }

    return decision;
  }

  async assertPermitCurrent(
    permit: TenantExecutionPermit,
    now = new Date(),
  ): Promise<TenantExecutionAdmissionDecision> {
    const decision = await this.evaluatePermit(permit, now);
    if (!decision.allowed) {
      this.throwDenied(decision);
    }

    return decision;
  }

  async assertAllowed(
    tenantId: string,
    requirementInput: TenantExecutionRequirementInput,
    now = new Date(),
  ): Promise<TenantExecutionAdmissionDecision> {
    const decision = await this.evaluate(tenantId, requirementInput, now);
    if (!decision.allowed) {
      this.throwDenied(decision);
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
      executionRevision: subject.executionRevision,
      customerStage: subject.customerStage,
      internalEntitlementBypass,
    };
  }

  private throwDenied(decision: TenantExecutionAdmissionDecision): never {
    throw new ForbiddenException({
      message: `Tenant execution is not admitted: ${decision.reasonCode}`,
      reasonCode: decision.reasonCode,
      tenantId: decision.tenantId,
      failedRequirement: decision.failedRequirement,
      executionRevision: decision.executionRevision,
    });
  }
}
