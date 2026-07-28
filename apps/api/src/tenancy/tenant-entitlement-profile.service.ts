import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TenantCustomerStage,
  TenantLifecycleStatus,
  TenantModule,
  TenantOnboardingStatus,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

export const COMPLETE_TENANT_MODULE_PROFILE = [
  TenantModule.GAMIFICATION,
  TenantModule.ASSORTMENT,
  TenantModule.STAFF,
  TenantModule.COMMUNICATIONS,
  TenantModule.USERS_ROLES,
  TenantModule.INTEGRATIONS,
] as const;

const ENTITLEMENT_PROFILE_AUDIT_ACTION = 'TENANT_ENTITLEMENT_PROFILE_CHANGED';

type ReplaceTenantEntitlementProfileDto = {
  confirmation?: unknown;
  expectedProfileRevision?: unknown;
  reason?: unknown;
  requestId?: unknown;
  supportTicket?: unknown;
  customerStage?: unknown;
  onboardingStatus?: unknown;
  cohortKey?: unknown;
  supportOwnerUserId?: unknown;
  trialStartsAt?: unknown;
  trialEndsAt?: unknown;
  modules?: unknown;
};

type ParsedModuleEntitlement = {
  module: TenantModule;
  readEnabled: boolean;
  writeEnabled: boolean;
  outboundEnabled: boolean;
  validFrom: Date | null;
  validUntil: Date | null;
};

type ParsedProfileReplacement = {
  expectedProfileRevision: number;
  reason: string;
  requestId: string;
  supportTicket: string | null;
  customerStage: TenantCustomerStage;
  onboardingStatus: TenantOnboardingStatus;
  cohortKey: string;
  supportOwnerUserId: string;
  trialStartsAt: Date | null;
  trialEndsAt: Date | null;
  modules: ParsedModuleEntitlement[];
};

type SerializedModuleEntitlement = {
  module: TenantModule;
  readEnabled: boolean;
  writeEnabled: boolean;
  outboundEnabled: boolean;
  validFrom: string | null;
  validUntil: string | null;
  profileRevision: number;
  reason: string;
};

type SerializedTenantEntitlementProfile = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  lifecycleStatus: string;
  customerStage: TenantCustomerStage;
  onboardingStatus: TenantOnboardingStatus;
  cohortKey: string | null;
  supportOwnerUserId: string | null;
  trialStartsAt: string | null;
  trialEndsAt: string | null;
  profileRevision: number;
  executionRevision: number;
  modules: SerializedModuleEntitlement[];
};

type ReplaceTenantEntitlementProfileResult = {
  ok: true;
  tenantId: string;
  profileRevision: number;
  executionRevision: number;
  customerStage: TenantCustomerStage;
  onboardingStatus: TenantOnboardingStatus;
  cohortKey: string | null;
  supportOwnerUserId: string | null;
  trialStartsAt: string | null;
  trialEndsAt: string | null;
  modules: SerializedModuleEntitlement[];
};

@Injectable()
export class TenantEntitlementProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async replaceProfile(
    actor: AuthenticatedUser,
    tenantId: string,
    dto: ReplaceTenantEntitlementProfileDto,
  ): Promise<ReplaceTenantEntitlementProfileResult> {
    this.assertPlatformAdmin(actor);
    const parsed = this.parseReplacement(dto);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        customerStage: true,
        onboardingStatus: true,
        cohortKey: true,
        supportOwnerUserId: true,
        trialStartsAt: true,
        trialEndsAt: true,
        entitlementProfileRevision: true,
        executionRevision: true,
        updatedAt: true,
        moduleEntitlements: {
          select: {
            module: true,
            readEnabled: true,
            writeEnabled: true,
            outboundEnabled: true,
            validFrom: true,
            validUntil: true,
            profileRevision: true,
            reason: true,
          },
          orderBy: { module: 'asc' },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant was not found');
    }

    this.assertConfirmation(dto.confirmation, tenant.slug);

    const requestDigest = this.requestDigest(tenant.id, parsed);
    const replay = await this.findIdempotentReplay(
      tenant.id,
      parsed.requestId,
      requestDigest,
    );
    if (replay) {
      return replay;
    }

    this.assertCustomerStageMutation(
      tenant.customerStage,
      parsed.customerStage,
    );
    this.assertOnboardingMutation(
      tenant.onboardingStatus,
      parsed.onboardingStatus,
    );
    this.assertTrialWindowAllowed(
      tenant.status,
      parsed.customerStage,
      parsed.onboardingStatus,
      parsed.trialStartsAt,
      parsed.trialEndsAt,
    );

    if (tenant.entitlementProfileRevision !== parsed.expectedProfileRevision) {
      throw new ConflictException('Tenant entitlement profile has changed');
    }

    const nextProfileRevision = parsed.expectedProfileRevision + 1;
    if (!Number.isSafeInteger(nextProfileRevision)) {
      throw new ConflictException('Tenant entitlement revision is exhausted');
    }
    if (
      !Number.isSafeInteger(tenant.executionRevision) ||
      tenant.executionRevision < 0 ||
      tenant.executionRevision >= 2_147_483_647
    ) {
      throw new ConflictException('Tenant execution revision is exhausted');
    }
    const nextExecutionRevision = tenant.executionRevision + 1;

    const changedAt = new Date();
    const before = this.serializeProfile(
      tenant,
      tenant.entitlementProfileRevision,
      tenant.moduleEntitlements,
    );
    const afterTenant = {
      ...tenant,
      customerStage: parsed.customerStage,
      onboardingStatus: parsed.onboardingStatus,
      cohortKey: parsed.cohortKey,
      supportOwnerUserId: parsed.supportOwnerUserId,
      trialStartsAt: parsed.trialStartsAt,
      trialEndsAt: parsed.trialEndsAt,
      executionRevision: nextExecutionRevision,
    };
    const after = this.serializeProfile(
      afterTenant,
      nextProfileRevision,
      parsed.modules.map((module) => ({
        ...module,
        profileRevision: nextProfileRevision,
        reason: parsed.reason,
      })),
    );

    try {
      await this.prisma.$transaction(async (tx) => {
        const supportOwner = await tx.user.findUnique({
          where: { id: parsed.supportOwnerUserId },
          select: {
            id: true,
            isActive: true,
            isPlatformAdmin: true,
          },
        });
        if (
          !supportOwner ||
          !supportOwner.isActive ||
          !supportOwner.isPlatformAdmin
        ) {
          throw new BadRequestException(
            'supportOwnerUserId must identify an active platform administrator',
          );
        }

        const claimed = await tx.tenant.updateMany({
          where: {
            id: tenant.id,
            entitlementProfileRevision: parsed.expectedProfileRevision,
            executionRevision: tenant.executionRevision,
            updatedAt: tenant.updatedAt,
          },
          data: {
            customerStage: parsed.customerStage,
            onboardingStatus: parsed.onboardingStatus,
            cohortKey: parsed.cohortKey,
            supportOwnerUserId: supportOwner.id,
            trialStartsAt: parsed.trialStartsAt,
            trialEndsAt: parsed.trialEndsAt,
            entitlementProfileRevision: nextProfileRevision,
          },
        });

        if (claimed.count !== 1) {
          throw new ConflictException('Tenant entitlement profile has changed');
        }
        const advancedTenant = await tx.tenant.findUniqueOrThrow({
          where: { id: tenant.id },
          select: {
            entitlementProfileRevision: true,
            executionRevision: true,
          },
        });
        if (
          advancedTenant.entitlementProfileRevision !== nextProfileRevision ||
          advancedTenant.executionRevision !== nextExecutionRevision
        ) {
          throw new ConflictException(
            'Tenant execution revision changed during entitlement profile replacement',
          );
        }

        await tx.tenantModuleEntitlement.deleteMany({
          where: { tenantId: tenant.id },
        });
        await tx.tenantModuleEntitlement.createMany({
          data: parsed.modules.map((module) => ({
            id: randomUUID(),
            tenantId: tenant.id,
            ...module,
            profileRevision: nextProfileRevision,
            reason: parsed.reason,
            createdAt: changedAt,
            updatedAt: changedAt,
          })),
        });
        await tx.platformAdminAuditEvent.create({
          data: {
            tenantId: tenant.id,
            actorUserId: actor.id,
            requestId: parsed.requestId,
            action: ENTITLEMENT_PROFILE_AUDIT_ACTION,
            targetType: 'TENANT_ENTITLEMENT_PROFILE',
            targetId: tenant.id,
            reason: parsed.reason,
            before,
            after,
            metadata: {
              requestId: parsed.requestId,
              requestDigest,
              supportTicket: parsed.supportTicket,
              expectedProfileRevision: parsed.expectedProfileRevision,
              nextProfileRevision,
              expectedExecutionRevision: tenant.executionRevision,
              nextExecutionRevision,
              moduleCount: parsed.modules.length,
              confirmationRule: 'tenant_slug',
            },
          },
        });
      });
    } catch (error) {
      const concurrentReplay = await this.findIdempotentReplay(
        tenant.id,
        parsed.requestId,
        requestDigest,
      );
      if (concurrentReplay) {
        return concurrentReplay;
      }
      throw error;
    }

    return this.resultFromProfile(after);
  }

  private async findIdempotentReplay(
    tenantId: string,
    requestId: string,
    requestDigest: string,
  ): Promise<ReplaceTenantEntitlementProfileResult | null> {
    const event = await this.prisma.platformAdminAuditEvent.findUnique({
      where: {
        tenantId_action_requestId: {
          tenantId,
          action: ENTITLEMENT_PROFILE_AUDIT_ACTION,
          requestId,
        },
      },
      select: {
        after: true,
        metadata: true,
      },
    });
    if (!event) {
      return null;
    }

    if (
      !this.record(event.metadata) ||
      event.metadata.requestDigest !== requestDigest
    ) {
      throw new ConflictException(
        'requestId was already used with a different entitlement profile',
      );
    }

    return this.resultFromProfile(this.deserializeProfile(event.after));
  }

  private requestDigest(
    tenantId: string,
    parsed: ParsedProfileReplacement,
  ): string {
    const canonicalPayload = JSON.stringify({
      tenantId,
      expectedProfileRevision: parsed.expectedProfileRevision,
      reason: parsed.reason,
      requestId: parsed.requestId,
      supportTicket: parsed.supportTicket,
      customerStage: parsed.customerStage,
      onboardingStatus: parsed.onboardingStatus,
      cohortKey: parsed.cohortKey,
      supportOwnerUserId: parsed.supportOwnerUserId,
      trialStartsAt: parsed.trialStartsAt?.toISOString() ?? null,
      trialEndsAt: parsed.trialEndsAt?.toISOString() ?? null,
      modules: parsed.modules.map((module) => ({
        ...module,
        validFrom: module.validFrom?.toISOString() ?? null,
        validUntil: module.validUntil?.toISOString() ?? null,
      })),
    });

    return createHash('sha256').update(canonicalPayload).digest('hex');
  }

  private resultFromProfile(
    profile: SerializedTenantEntitlementProfile,
  ): ReplaceTenantEntitlementProfileResult {
    return {
      ok: true,
      tenantId: profile.tenantId,
      profileRevision: profile.profileRevision,
      executionRevision: profile.executionRevision,
      customerStage: profile.customerStage,
      onboardingStatus: profile.onboardingStatus,
      cohortKey: profile.cohortKey,
      supportOwnerUserId: profile.supportOwnerUserId,
      trialStartsAt: profile.trialStartsAt,
      trialEndsAt: profile.trialEndsAt,
      modules: profile.modules,
    };
  }

  private deserializeProfile(
    value: Prisma.JsonValue | null,
  ): SerializedTenantEntitlementProfile {
    if (!this.record(value) || !Array.isArray(value.modules)) {
      throw new ConflictException(
        'Stored entitlement idempotency record is invalid',
      );
    }

    const customerStage = Object.values(TenantCustomerStage).find(
      (candidate) => candidate === value.customerStage,
    );
    const onboardingStatus = Object.values(TenantOnboardingStatus).find(
      (candidate) => candidate === value.onboardingStatus,
    );
    const profileRevision = value.profileRevision;
    const executionRevision = value.executionRevision;
    const modules = value.modules.map((module) =>
      this.deserializeModule(module),
    );
    const moduleKeys = new Set(modules.map((module) => module.module));

    if (
      typeof value.tenantId !== 'string' ||
      typeof value.tenantName !== 'string' ||
      typeof value.tenantSlug !== 'string' ||
      typeof value.lifecycleStatus !== 'string' ||
      !customerStage ||
      !onboardingStatus ||
      !Number.isSafeInteger(profileRevision) ||
      typeof profileRevision !== 'number' ||
      profileRevision < 1 ||
      !Number.isSafeInteger(executionRevision) ||
      typeof executionRevision !== 'number' ||
      executionRevision < 0 ||
      !this.nullableString(value.cohortKey) ||
      !this.nullableString(value.supportOwnerUserId) ||
      !this.nullableTimestamp(value.trialStartsAt) ||
      !this.nullableTimestamp(value.trialEndsAt) ||
      modules.length !== COMPLETE_TENANT_MODULE_PROFILE.length ||
      moduleKeys.size !== modules.length ||
      COMPLETE_TENANT_MODULE_PROFILE.some(
        (module) => !moduleKeys.has(module),
      ) ||
      modules.some((module) => module.profileRevision !== profileRevision)
    ) {
      throw new ConflictException(
        'Stored entitlement idempotency record is invalid',
      );
    }

    return {
      tenantId: value.tenantId,
      tenantName: value.tenantName,
      tenantSlug: value.tenantSlug,
      lifecycleStatus: value.lifecycleStatus,
      customerStage,
      onboardingStatus,
      cohortKey: value.cohortKey,
      supportOwnerUserId: value.supportOwnerUserId,
      trialStartsAt: value.trialStartsAt,
      trialEndsAt: value.trialEndsAt,
      profileRevision,
      executionRevision,
      modules,
    };
  }

  private deserializeModule(
    value: Prisma.JsonValue,
  ): SerializedModuleEntitlement {
    if (!this.record(value)) {
      throw new ConflictException(
        'Stored entitlement idempotency record is invalid',
      );
    }

    const module = COMPLETE_TENANT_MODULE_PROFILE.find(
      (candidate) => candidate === value.module,
    );
    if (
      !module ||
      typeof value.readEnabled !== 'boolean' ||
      typeof value.writeEnabled !== 'boolean' ||
      typeof value.outboundEnabled !== 'boolean' ||
      !this.nullableTimestamp(value.validFrom) ||
      !this.nullableTimestamp(value.validUntil) ||
      typeof value.profileRevision !== 'number' ||
      !Number.isSafeInteger(value.profileRevision) ||
      typeof value.reason !== 'string' ||
      !value.reason
    ) {
      throw new ConflictException(
        'Stored entitlement idempotency record is invalid',
      );
    }

    return {
      module,
      readEnabled: value.readEnabled,
      writeEnabled: value.writeEnabled,
      outboundEnabled: value.outboundEnabled,
      validFrom: value.validFrom,
      validUntil: value.validUntil,
      profileRevision: value.profileRevision,
      reason: value.reason,
    };
  }

  private nullableString(value: unknown): value is string | null {
    return value === null || typeof value === 'string';
  }

  private nullableTimestamp(value: unknown): value is string | null {
    if (value === null) {
      return true;
    }
    return (
      typeof value === 'string' &&
      !Number.isNaN(new Date(value).getTime()) &&
      value.includes('T')
    );
  }

  private parseReplacement(
    dto: ReplaceTenantEntitlementProfileDto,
  ): ParsedProfileReplacement {
    const expectedProfileRevision = dto.expectedProfileRevision;
    if (
      typeof expectedProfileRevision !== 'number' ||
      !Number.isSafeInteger(expectedProfileRevision) ||
      expectedProfileRevision < 0
    ) {
      throw new BadRequestException(
        'expectedProfileRevision must be a non-negative integer',
      );
    }

    const reason = this.requiredText(dto.reason, 'reason', 10, 500);
    const requestId = this.requiredText(dto.requestId, 'requestId', 8, 200);
    const supportTicket = this.optionalText(
      dto.supportTicket,
      'supportTicket',
      200,
    );
    const customerStage = this.enumValue(
      dto.customerStage,
      'customerStage',
      Object.values(TenantCustomerStage),
    );
    const onboardingStatus = this.enumValue(
      dto.onboardingStatus,
      'onboardingStatus',
      Object.values(TenantOnboardingStatus),
    );
    const cohortKey = this.requiredText(dto.cohortKey, 'cohortKey', 3, 100);
    const supportOwnerUserId = this.requiredText(
      dto.supportOwnerUserId,
      'supportOwnerUserId',
      1,
      100,
    );
    const trialStartsAt = this.optionalDate(dto.trialStartsAt, 'trialStartsAt');
    const trialEndsAt = this.optionalDate(dto.trialEndsAt, 'trialEndsAt');

    if (Boolean(trialStartsAt) !== Boolean(trialEndsAt)) {
      throw new BadRequestException(
        'trialStartsAt and trialEndsAt must both be set or both be null',
      );
    }

    if (trialStartsAt && trialEndsAt && trialStartsAt >= trialEndsAt) {
      throw new BadRequestException('trialStartsAt must be before trialEndsAt');
    }

    if (!Array.isArray(dto.modules)) {
      throw new BadRequestException('modules must be an array');
    }

    const modules = dto.modules.map((value, index) =>
      this.parseModule(value, index),
    );
    const actualModules = new Set(modules.map((module) => module.module));
    const missingModules = COMPLETE_TENANT_MODULE_PROFILE.filter(
      (module) => !actualModules.has(module),
    );

    if (
      modules.length !== COMPLETE_TENANT_MODULE_PROFILE.length ||
      actualModules.size !== modules.length ||
      missingModules.length > 0
    ) {
      throw new BadRequestException(
        'modules must contain each supported tenant module exactly once',
      );
    }

    modules.sort(
      (left, right) =>
        COMPLETE_TENANT_MODULE_PROFILE.indexOf(left.module) -
        COMPLETE_TENANT_MODULE_PROFILE.indexOf(right.module),
    );

    if (modules.some((module) => module.outboundEnabled)) {
      throw new BadRequestException(
        'Outbound actions require the dedicated outbound-enablement workflow',
      );
    }

    return {
      expectedProfileRevision,
      reason,
      requestId,
      supportTicket,
      customerStage,
      onboardingStatus,
      cohortKey,
      supportOwnerUserId,
      trialStartsAt,
      trialEndsAt,
      modules,
    };
  }

  private parseModule(value: unknown, index: number): ParsedModuleEntitlement {
    if (!this.record(value)) {
      throw new BadRequestException(`modules[${index}] must be an object`);
    }

    const module = COMPLETE_TENANT_MODULE_PROFILE.find(
      (candidate) => candidate === value.module,
    );
    if (!module) {
      throw new BadRequestException(
        `modules[${index}].module is not supported`,
      );
    }

    const readEnabled = this.booleanValue(
      value.readEnabled,
      `modules[${index}].readEnabled`,
    );
    const writeEnabled = this.booleanValue(
      value.writeEnabled,
      `modules[${index}].writeEnabled`,
    );
    const outboundEnabled = this.booleanValue(
      value.outboundEnabled,
      `modules[${index}].outboundEnabled`,
    );

    if (writeEnabled && !readEnabled) {
      throw new BadRequestException(
        `modules[${index}] cannot enable write without read`,
      );
    }

    if (outboundEnabled && !writeEnabled) {
      throw new BadRequestException(
        `modules[${index}] cannot enable outbound without write`,
      );
    }

    const validFrom = this.optionalDate(
      value.validFrom,
      `modules[${index}].validFrom`,
    );
    const validUntil = this.optionalDate(
      value.validUntil,
      `modules[${index}].validUntil`,
    );

    if (validFrom && validUntil && validFrom >= validUntil) {
      throw new BadRequestException(
        `modules[${index}].validFrom must be before validUntil`,
      );
    }

    return {
      module,
      readEnabled,
      writeEnabled,
      outboundEnabled,
      validFrom,
      validUntil,
    };
  }

  private serializeProfile(
    tenant: {
      id: string;
      name: string;
      slug: string;
      status: string;
      customerStage: TenantCustomerStage;
      onboardingStatus: TenantOnboardingStatus;
      cohortKey: string | null;
      supportOwnerUserId: string | null;
      trialStartsAt: Date | null;
      trialEndsAt: Date | null;
      executionRevision: number;
    },
    profileRevision: number,
    modules: readonly {
      module: TenantModule;
      readEnabled: boolean;
      writeEnabled: boolean;
      outboundEnabled: boolean;
      validFrom: Date | null;
      validUntil: Date | null;
      profileRevision: number;
      reason: string;
    }[],
  ): SerializedTenantEntitlementProfile {
    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      lifecycleStatus: tenant.status,
      customerStage: tenant.customerStage,
      onboardingStatus: tenant.onboardingStatus,
      cohortKey: tenant.cohortKey,
      supportOwnerUserId: tenant.supportOwnerUserId,
      trialStartsAt: tenant.trialStartsAt?.toISOString() ?? null,
      trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
      profileRevision,
      executionRevision: tenant.executionRevision,
      modules: [...modules]
        .sort(
          (left, right) =>
            COMPLETE_TENANT_MODULE_PROFILE.indexOf(left.module) -
            COMPLETE_TENANT_MODULE_PROFILE.indexOf(right.module),
        )
        .map((module) => ({
          module: module.module,
          readEnabled: module.readEnabled,
          writeEnabled: module.writeEnabled,
          outboundEnabled: module.outboundEnabled,
          validFrom: module.validFrom?.toISOString() ?? null,
          validUntil: module.validUntil?.toISOString() ?? null,
          profileRevision: module.profileRevision,
          reason: module.reason,
        })),
    };
  }

  private assertPlatformAdmin(actor: AuthenticatedUser): void {
    if (!actor?.id || !actor.isPlatformAdmin) {
      throw new ForbiddenException('Platform administrator access is required');
    }
  }

  private assertOnboardingMutation(
    current: TenantOnboardingStatus,
    requested: TenantOnboardingStatus,
  ): void {
    if (requested === current) {
      return;
    }

    throw new ConflictException(
      'Onboarding transition requires its dedicated workflow',
    );
  }

  private assertCustomerStageMutation(
    current: TenantCustomerStage,
    requested: TenantCustomerStage,
  ): void {
    if (requested === current) {
      return;
    }

    throw new ConflictException(
      'Customer-stage transition requires its dedicated workflow',
    );
  }

  private assertTrialWindowAllowed(
    lifecycleStatus: TenantLifecycleStatus,
    customerStage: TenantCustomerStage,
    onboardingStatus: TenantOnboardingStatus,
    trialStartsAt: Date | null,
    trialEndsAt: Date | null,
  ): void {
    if (
      customerStage !== TenantCustomerStage.PILOT &&
      customerStage !== TenantCustomerStage.BETA
    ) {
      return;
    }

    if (trialStartsAt && trialEndsAt) {
      return;
    }

    if (
      lifecycleStatus === TenantLifecycleStatus.SUSPENDED &&
      onboardingStatus === TenantOnboardingStatus.PROVISIONING
    ) {
      return;
    }

    throw new BadRequestException(
      'PILOT and BETA stages require a finite trial window outside the SUSPENDED/PROVISIONING shell',
    );
  }

  private assertConfirmation(value: unknown, tenantSlug: string): void {
    if (typeof value !== 'string' || value.trim() !== tenantSlug) {
      throw new BadRequestException('Tenant slug confirmation is required');
    }
  }

  private record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private enumValue<T extends string>(
    value: unknown,
    field: string,
    supported: readonly T[],
  ): T {
    if (typeof value !== 'string' || !supported.includes(value as T)) {
      throw new BadRequestException(
        `${field} must be one of ${supported.join(', ')}`,
      );
    }
    return value as T;
  }

  private booleanValue(value: unknown, field: string): boolean {
    if (typeof value !== 'boolean') {
      throw new BadRequestException(`${field} must be a boolean`);
    }
    return value;
  }

  private optionalDate(value: unknown, field: string): Date | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    if (typeof value !== 'string') {
      throw new BadRequestException(`${field} must be an ISO-8601 timestamp`);
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()) || !value.includes('T')) {
      throw new BadRequestException(`${field} must be an ISO-8601 timestamp`);
    }
    return parsed;
  }

  private requiredText(
    value: unknown,
    field: string,
    minimumLength: number,
    maximumLength: number,
  ): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(`${field} is required`);
    }

    const normalized = value.trim();
    if (
      normalized.length < minimumLength ||
      normalized.length > maximumLength
    ) {
      throw new BadRequestException(
        `${field} must contain ${minimumLength}-${maximumLength} characters`,
      );
    }
    return normalized;
  }

  private optionalText(
    value: unknown,
    field: string,
    maximumLength: number,
  ): string | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    if (typeof value !== 'string') {
      throw new BadRequestException(`${field} must be a string`);
    }

    const normalized = value.trim();
    if (!normalized || normalized.length > maximumLength) {
      throw new BadRequestException(
        `${field} must contain 1-${maximumLength} characters`,
      );
    }
    return normalized;
  }
}
