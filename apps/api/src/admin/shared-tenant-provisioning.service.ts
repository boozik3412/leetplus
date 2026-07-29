import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  IdentityEmailClaimType,
  Prisma,
  TenantCustomerStage,
  TenantLifecycleStatus,
  TenantModule,
  TenantOnboardingStatus,
  UserRole,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SHARED_BETA_INITIAL_OWNER_CAPABILITIES } from '../auth/capabilities';
import {
  IdentityEmailClaimService,
  type IdentityEmailFingerprint,
} from '../auth/identity-email-claim.service';
import { PrismaService } from '../prisma/prisma.service';
import { COMPLETE_TENANT_MODULE_PROFILE } from '../tenancy/tenant-entitlement-profile.service';

const SHARED_BETA_SHELL_PROFILE_VERSION = 'SHARED_MULTI_TENANT_BETA_SHELL_V1';
const SHARED_BETA_SHELL_PROVISION_ACTION =
  'SHARED_BETA_TENANT_SHELL_PROVISIONED';
const ALLOWED_PROVISIONING_FIELDS = new Set([
  'confirmation',
  'requestId',
  'reason',
  'supportTicket',
  'tenantName',
  'tenantSlug',
  'cohortKey',
  'supportOwnerUserId',
  'storeName',
  'storeTimeZone',
  'ownerEmail',
]);

type ProvisionSharedTenantDto = {
  confirmation?: unknown;
  requestId?: unknown;
  reason?: unknown;
  supportTicket?: unknown;
  tenantName?: unknown;
  tenantSlug?: unknown;
  cohortKey?: unknown;
  supportOwnerUserId?: unknown;
  storeName?: unknown;
  storeTimeZone?: unknown;
  ownerEmail?: unknown;
};

type ParsedProvisioning = {
  requestId: string;
  reason: string;
  supportTicket: string | null;
  tenantName: string;
  tenantSlug: string;
  cohortKey: string;
  supportOwnerUserId: string;
  storeName: string;
  storeTimeZone: string;
  storePublicSlug: string;
  ownerEmail: string;
  ownerIdentity: IdentityEmailFingerprint;
};

type ShellProvisioningReceipt = {
  profileVersion: typeof SHARED_BETA_SHELL_PROFILE_VERSION;
  tenant: {
    id: string;
    slug: string;
    status: typeof TenantLifecycleStatus.SUSPENDED;
    customerStage: typeof TenantCustomerStage.PILOT;
    onboardingStatus: typeof TenantOnboardingStatus.PROVISIONING;
    profileRevision: 1;
    executionRevision: number;
    trialStartsAt: null;
    trialEndsAt: null;
  };
  store: {
    id: string;
    name: string;
    isActive: false;
    gamificationEnabled: false;
    backgroundExecutionEnabled: false;
  };
  ownerIdentity: {
    claimType: typeof IdentityEmailClaimType.INVITE;
    reservationId: string;
    claimRevision: 1;
  };
  modules: Array<{
    module: TenantModule;
    readEnabled: true;
    writeEnabled: true;
    outboundEnabled: false;
    profileRevision: 1;
  }>;
};

export type ShellProvisioningResult = ShellProvisioningReceipt & {
  ok: true;
  decision: 'SHELL_PROVISIONED' | 'ALREADY_PROVISIONED';
  replayed: boolean;
  activationRequired: true;
};

@Injectable()
export class SharedTenantProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identityClaimBoundary: IdentityEmailClaimService,
  ) {}

  async provision(
    actor: AuthenticatedUser,
    dto: unknown,
  ): Promise<ShellProvisioningResult> {
    this.assertPlatformAdmin(actor);
    const parsed = this.parseProvisioning(dto);
    this.assertConfirmation(dto, `PROVISION ${parsed.tenantSlug}`);
    const requestDigest = this.provisioningRequestDigest(parsed);

    for (let attempt = 0; ; attempt += 1) {
      try {
        const transactionResult = await this.prisma.$transaction(
          async (tx) => {
            await this.acquireTenantSlugLock(tx, parsed.tenantSlug);
            await this.assertFreshPlatformAuthority(
              tx,
              actor.id,
              parsed.supportOwnerUserId,
            );

            const tenantWithSlug = await tx.tenant.findFirst({
              where: {
                slug: {
                  equals: parsed.tenantSlug,
                  mode: 'insensitive',
                },
              },
              select: { id: true },
            });
            if (tenantWithSlug) {
              const replay = await this.findProvisioningReplay(
                tx,
                tenantWithSlug.id,
                parsed.requestId,
              );
              if (!replay) {
                throw new ConflictException('Tenant slug is already in use');
              }
              return {
                receipt: await this.validateProvisioningReplay(
                  tx,
                  replay,
                  requestDigest,
                  parsed,
                  tenantWithSlug.id,
                ),
                created: false,
              };
            }

            const now = new Date();
            const tenant = await tx.tenant.create({
              data: {
                name: parsed.tenantName,
                slug: parsed.tenantSlug,
                status: TenantLifecycleStatus.SUSPENDED,
                customerStage: TenantCustomerStage.PILOT,
                onboardingStatus: TenantOnboardingStatus.PROVISIONING,
                cohortKey: parsed.cohortKey,
                supportOwnerUserId: parsed.supportOwnerUserId,
                trialStartsAt: null,
                trialEndsAt: null,
                entitlementProfileRevision: 1,
                statusChangedAt: now,
                statusReason: `Awaiting protected shared beta activation: ${parsed.reason}`,
              },
              select: {
                id: true,
                slug: true,
                status: true,
                customerStage: true,
                onboardingStatus: true,
                entitlementProfileRevision: true,
                executionRevision: true,
                trialStartsAt: true,
                trialEndsAt: true,
              },
            });
            const store = await tx.store.create({
              data: {
                tenantId: tenant.id,
                name: parsed.storeName,
                publicSlug: parsed.storePublicSlug,
                timeZone: parsed.storeTimeZone,
                isActive: false,
                gamificationEnabled: false,
                backgroundExecutionEnabled: false,
              },
              select: {
                id: true,
                name: true,
                isActive: true,
                gamificationEnabled: true,
                backgroundExecutionEnabled: true,
              },
            });

            await tx.userRoleOverride.create({
              data: {
                tenantId: tenant.id,
                role: UserRole.OWNER,
                permissions: [...SHARED_BETA_INITIAL_OWNER_CAPABILITIES],
              },
            });
            await tx.tenantModuleEntitlement.createMany({
              data: COMPLETE_TENANT_MODULE_PROFILE.map((module) => ({
                id: randomUUID(),
                tenantId: tenant.id,
                module,
                readEnabled: true,
                writeEnabled: true,
                outboundEnabled: false,
                validFrom: null,
                validUntil: null,
                profileRevision: 1,
                reason: parsed.reason,
                createdAt: now,
                updatedAt: now,
              })),
            });

            const reservationId = randomUUID();
            const identityTransaction =
              this.identityClaimBoundary.bindTransaction(tx);
            const identityReservation =
              await this.identityClaimBoundary.reserveInvite(
                identityTransaction,
                {
                  email: parsed.ownerEmail,
                  tenantId: tenant.id,
                  subjectId: reservationId,
                },
              );
            if (
              identityReservation.decision !== 'CREATED' ||
              identityReservation.tenantId !== tenant.id ||
              identityReservation.subjectId !== reservationId ||
              identityReservation.revision !== 1 ||
              identityReservation.fingerprint !==
                parsed.ownerIdentity.fingerprint ||
              identityReservation.keyVersion !== parsed.ownerIdentity.keyVersion
            ) {
              throw new ConflictException(
                'Initial owner identity reservation was not created',
              );
            }

            const receipt: ShellProvisioningReceipt = {
              profileVersion: SHARED_BETA_SHELL_PROFILE_VERSION,
              tenant: {
                id: tenant.id,
                slug: tenant.slug,
                status: TenantLifecycleStatus.SUSPENDED,
                customerStage: TenantCustomerStage.PILOT,
                onboardingStatus: TenantOnboardingStatus.PROVISIONING,
                profileRevision: 1,
                executionRevision: tenant.executionRevision,
                trialStartsAt: null,
                trialEndsAt: null,
              },
              store: {
                id: store.id,
                name: store.name,
                isActive: false,
                gamificationEnabled: false,
                backgroundExecutionEnabled: false,
              },
              ownerIdentity: {
                claimType: IdentityEmailClaimType.INVITE,
                reservationId,
                claimRevision: 1,
              },
              modules: COMPLETE_TENANT_MODULE_PROFILE.map((module) => ({
                module,
                readEnabled: true,
                writeEnabled: true,
                outboundEnabled: false,
                profileRevision: 1,
              })),
            };

            await tx.platformAdminAuditEvent.create({
              data: {
                tenantId: tenant.id,
                actorUserId: actor.id,
                requestId: parsed.requestId,
                action: SHARED_BETA_SHELL_PROVISION_ACTION,
                targetType: 'TENANT',
                targetId: tenant.id,
                reason: parsed.reason,
                before: Prisma.JsonNull,
                after: receipt,
                metadata: {
                  profileVersion: SHARED_BETA_SHELL_PROFILE_VERSION,
                  requestDigest,
                  supportTicket: parsed.supportTicket,
                  supportOwnerUserId: parsed.supportOwnerUserId,
                  ownerEmailFingerprint: identityReservation.fingerprint,
                  ownerEmailFingerprintKeyVersion:
                    identityReservation.keyVersion,
                  initialOwnerRole: UserRole.OWNER,
                  initialOwnerScopeAfterActivation: 'NETWORK',
                  ownerIdentityReservationId: reservationId,
                  initialStoreCount: 1,
                  moduleCount: COMPLETE_TENANT_MODULE_PROFILE.length,
                  outboundDefault: 'OFF',
                  activationRequired: true,
                  inviteCreated: false,
                  trialStarted: false,
                  confirmationRule: 'PROVISION tenant_slug',
                  executionRevision: tenant.executionRevision,
                },
              },
            });

            return { receipt, created: true };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );

        return this.provisioningResult(
          transactionResult.receipt,
          transactionResult.created
            ? 'SHELL_PROVISIONED'
            : 'ALREADY_PROVISIONED',
          !transactionResult.created,
        );
      } catch (error) {
        if (!this.recoverableProvisioningRace(error)) {
          throw error;
        }
        const concurrentReceipt = await this.recoverProvisioningReplay(
          actor.id,
          parsed,
          requestDigest,
        );
        if (concurrentReceipt) {
          return this.provisioningResult(
            concurrentReceipt,
            'ALREADY_PROVISIONED',
            true,
          );
        }
        if (attempt === 0 && this.retryableProvisioningSerialization(error)) {
          continue;
        }
        throw error;
      }
    }
  }

  private recoverableProvisioningRace(error: unknown): boolean {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return true;
    }
    return this.retryableProvisioningSerialization(error);
  }

  private retryableProvisioningSerialization(error: unknown): boolean {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034'
    ) {
      return true;
    }
    if (!(error instanceof ConflictException)) {
      return false;
    }
    const response = error.getResponse();
    return (
      this.record(response) &&
      response.reasonCode === 'IDENTITY_CLAIM_RETRY_REQUIRED'
    );
  }

  private async recoverProvisioningReplay(
    actorUserId: string,
    parsed: ParsedProvisioning,
    requestDigest: string,
  ): Promise<ShellProvisioningReceipt | null> {
    return this.prisma.$transaction(
      async (tx) => {
        await this.acquireTenantSlugLock(tx, parsed.tenantSlug);
        await this.assertFreshPlatformAuthority(
          tx,
          actorUserId,
          parsed.supportOwnerUserId,
        );
        const tenant = await tx.tenant.findFirst({
          where: {
            slug: {
              equals: parsed.tenantSlug,
              mode: 'insensitive',
            },
          },
          select: { id: true },
        });
        if (!tenant) {
          return null;
        }
        const replay = await this.findProvisioningReplay(
          tx,
          tenant.id,
          parsed.requestId,
        );
        return replay
          ? this.validateProvisioningReplay(
              tx,
              replay,
              requestDigest,
              parsed,
              tenant.id,
            )
          : null;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  private async assertFreshPlatformAuthority(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    supportOwnerUserId: string,
  ): Promise<void> {
    const administratorIds = [
      ...new Set([actorUserId, supportOwnerUserId]),
    ].sort();
    await tx.$queryRaw(
      Prisma.sql`
        SELECT "id"
        FROM public."User"
        WHERE "id" IN (${Prisma.join(administratorIds)})
        ORDER BY "id"
        FOR SHARE
      `,
    );
    const administrators = await tx.user.findMany({
      where: {
        id: {
          in: administratorIds,
        },
      },
      select: {
        id: true,
        isActive: true,
        isPlatformAdmin: true,
      },
    });
    const actorRecord = administrators.find(
      (candidate) => candidate.id === actorUserId,
    );
    if (!actorRecord || !actorRecord.isActive || !actorRecord.isPlatformAdmin) {
      throw new ForbiddenException(
        'Platform administrator authority is no longer active',
      );
    }
    const supportOwner = administrators.find(
      (candidate) => candidate.id === supportOwnerUserId,
    );
    if (
      !supportOwner ||
      !supportOwner.isActive ||
      !supportOwner.isPlatformAdmin
    ) {
      throw new BadRequestException(
        'supportOwnerUserId must identify an active platform administrator',
      );
    }
  }

  private async acquireTenantSlugLock(
    tx: Prisma.TransactionClient,
    tenantSlug: string,
  ): Promise<void> {
    await tx.$queryRaw(
      Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${'shared-beta-tenant-slug:' + tenantSlug}, 0)
        )::TEXT AS acquired
      `,
    );
  }

  private findProvisioningReplay(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    requestId: string,
  ) {
    return client.platformAdminAuditEvent.findUnique({
      where: {
        tenantId_action_requestId: {
          tenantId,
          action: SHARED_BETA_SHELL_PROVISION_ACTION,
          requestId,
        },
      },
      select: {
        after: true,
        metadata: true,
      },
    });
  }

  private replayReceipt(
    event: {
      after: Prisma.JsonValue | null;
      metadata: Prisma.JsonValue | null;
    },
    requestDigest: string,
  ): ShellProvisioningReceipt {
    if (
      !this.record(event.metadata) ||
      event.metadata.requestDigest !== requestDigest
    ) {
      throw new ConflictException(
        'requestId was already used with a different operation payload',
      );
    }
    return this.parseProvisioningReceipt(event.after);
  }

  private async validateProvisioningReplay(
    tx: Prisma.TransactionClient,
    event: {
      after: Prisma.JsonValue | null;
      metadata: Prisma.JsonValue | null;
    },
    requestDigest: string,
    parsed: ParsedProvisioning,
    expectedTenantId: string,
  ): Promise<ShellProvisioningReceipt> {
    const receipt = this.replayReceipt(event, requestDigest);
    if (
      receipt.tenant.id !== expectedTenantId ||
      receipt.tenant.slug !== parsed.tenantSlug
    ) {
      throw new ConflictException(
        'Stored shell provisioning receipt is invalid',
      );
    }
    await this.identityClaimBoundary.assertInvite(
      this.identityClaimBoundary.bindTransaction(tx),
      {
        email: parsed.ownerEmail,
        tenantId: expectedTenantId,
        subjectId: receipt.ownerIdentity.reservationId,
        expectedRevision: receipt.ownerIdentity.claimRevision,
      },
    );
    return receipt;
  }

  private parseProvisioningReceipt(
    value: Prisma.JsonValue | null,
  ): ShellProvisioningReceipt {
    if (
      !this.record(value) ||
      !this.hasExactKeys(value, [
        'profileVersion',
        'tenant',
        'store',
        'ownerIdentity',
        'modules',
      ]) ||
      value.profileVersion !== SHARED_BETA_SHELL_PROFILE_VERSION ||
      !this.record(value.tenant) ||
      !this.record(value.store) ||
      !this.record(value.ownerIdentity) ||
      !Array.isArray(value.modules)
    ) {
      throw new ConflictException(
        'Stored shell provisioning receipt is invalid',
      );
    }
    const tenant = value.tenant;
    const store = value.store;
    const ownerIdentity = value.ownerIdentity;
    const modules = value.modules;
    if (
      !this.hasExactKeys(tenant, [
        'id',
        'slug',
        'status',
        'customerStage',
        'onboardingStatus',
        'profileRevision',
        'executionRevision',
        'trialStartsAt',
        'trialEndsAt',
      ]) ||
      !this.hasExactKeys(store, [
        'id',
        'name',
        'isActive',
        'gamificationEnabled',
        'backgroundExecutionEnabled',
      ]) ||
      !this.hasExactKeys(ownerIdentity, [
        'claimType',
        'reservationId',
        'claimRevision',
      ])
    ) {
      throw new ConflictException(
        'Stored shell provisioning receipt is invalid',
      );
    }
    const expectedModules = new Set(COMPLETE_TENANT_MODULE_PROFILE);
    const moduleRecords: Array<Record<string, unknown> | null> = [];
    for (const module of modules) {
      moduleRecords.push(
        this.record(module) &&
          this.hasExactKeys(module, [
            'module',
            'readEnabled',
            'writeEnabled',
            'outboundEnabled',
            'profileRevision',
          ])
          ? module
          : null,
      );
    }
    const actualModules = new Set(
      moduleRecords
        .filter((module): module is Record<string, unknown> => module !== null)
        .map((module) => module.module),
    );
    if (
      !this.uuid(tenant.id) ||
      typeof tenant.slug !== 'string' ||
      tenant.slug.length < 3 ||
      tenant.slug.length > 63 ||
      tenant.status !== TenantLifecycleStatus.SUSPENDED ||
      tenant.customerStage !== TenantCustomerStage.PILOT ||
      tenant.onboardingStatus !== TenantOnboardingStatus.PROVISIONING ||
      tenant.profileRevision !== 1 ||
      !Number.isSafeInteger(tenant.executionRevision) ||
      (tenant.executionRevision as number) < 0 ||
      tenant.trialStartsAt !== null ||
      tenant.trialEndsAt !== null ||
      !this.uuid(store.id) ||
      typeof store.name !== 'string' ||
      store.name.length < 2 ||
      store.name.length > 120 ||
      store.isActive !== false ||
      store.gamificationEnabled !== false ||
      store.backgroundExecutionEnabled !== false ||
      ownerIdentity.claimType !== IdentityEmailClaimType.INVITE ||
      !this.uuid(ownerIdentity.reservationId) ||
      ownerIdentity.claimRevision !== 1 ||
      modules.length !== COMPLETE_TENANT_MODULE_PROFILE.length ||
      actualModules.size !== COMPLETE_TENANT_MODULE_PROFILE.length ||
      COMPLETE_TENANT_MODULE_PROFILE.some(
        (module) => !actualModules.has(module),
      ) ||
      moduleRecords.some(
        (module) =>
          module === null ||
          !expectedModules.has(module.module as TenantModule) ||
          module.readEnabled !== true ||
          module.writeEnabled !== true ||
          module.outboundEnabled !== false ||
          module.profileRevision !== 1,
      )
    ) {
      throw new ConflictException(
        'Stored shell provisioning receipt is invalid',
      );
    }

    const modulesByKey = new Map(
      moduleRecords.map((module) => [
        module?.module as TenantModule,
        module as Record<string, unknown>,
      ]),
    );
    return {
      profileVersion: SHARED_BETA_SHELL_PROFILE_VERSION,
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        status: TenantLifecycleStatus.SUSPENDED,
        customerStage: TenantCustomerStage.PILOT,
        onboardingStatus: TenantOnboardingStatus.PROVISIONING,
        profileRevision: 1,
        executionRevision: tenant.executionRevision as number,
        trialStartsAt: null,
        trialEndsAt: null,
      },
      store: {
        id: store.id,
        name: store.name,
        isActive: false,
        gamificationEnabled: false,
        backgroundExecutionEnabled: false,
      },
      ownerIdentity: {
        claimType: IdentityEmailClaimType.INVITE,
        reservationId: ownerIdentity.reservationId,
        claimRevision: 1,
      },
      modules: COMPLETE_TENANT_MODULE_PROFILE.map((module) => {
        const stored = modulesByKey.get(module);
        if (!stored) {
          throw new ConflictException(
            'Stored shell provisioning receipt is invalid',
          );
        }
        return {
          module,
          readEnabled: true,
          writeEnabled: true,
          outboundEnabled: false,
          profileRevision: 1,
        };
      }),
    };
  }

  private provisioningResult(
    receipt: ShellProvisioningReceipt,
    decision: ShellProvisioningResult['decision'],
    replayed: boolean,
  ): ShellProvisioningResult {
    return {
      ok: true,
      decision,
      replayed,
      activationRequired: true,
      ...receipt,
    };
  }

  private parseProvisioning(dto: unknown): ParsedProvisioning {
    if (!this.record(dto)) {
      throw new BadRequestException('Provisioning body must be an object');
    }
    const unexpectedFields = Object.keys(dto).filter(
      (field) => !ALLOWED_PROVISIONING_FIELDS.has(field),
    );
    if (unexpectedFields.length > 0) {
      throw new BadRequestException({
        message: 'Provisioning body contains unsupported fields',
        reasonCode: 'SHARED_BETA_PROVISIONING_FIELD_NOT_ALLOWED',
      });
    }
    const input = dto as ProvisionSharedTenantDto;
    const tenantSlug = this.requiredText(
      input.tenantSlug,
      'tenantSlug',
      3,
      63,
    ).toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(tenantSlug)) {
      throw new BadRequestException(
        'tenantSlug must contain lowercase letters, digits and single hyphens',
      );
    }

    const storeTimeZone = this.requiredText(
      input.storeTimeZone,
      'storeTimeZone',
      1,
      100,
    );
    try {
      new Intl.DateTimeFormat('en', { timeZone: storeTimeZone }).format();
    } catch {
      throw new BadRequestException(
        'storeTimeZone must be a valid IANA time zone',
      );
    }

    const ownerEmail = this.ownerEmail(input.ownerEmail);
    const ownerIdentity = this.identityClaimBoundary.fingerprint(ownerEmail);
    const parsed: ParsedProvisioning = {
      requestId: this.requiredText(input.requestId, 'requestId', 8, 200),
      reason: this.requiredText(input.reason, 'reason', 10, 500),
      supportTicket: this.optionalText(
        input.supportTicket,
        'supportTicket',
        200,
      ),
      tenantName: this.requiredText(input.tenantName, 'tenantName', 2, 120),
      tenantSlug,
      cohortKey: this.requiredText(input.cohortKey, 'cohortKey', 3, 100),
      supportOwnerUserId: this.requiredText(
        input.supportOwnerUserId,
        'supportOwnerUserId',
        1,
        100,
      ),
      storeName: this.requiredText(input.storeName, 'storeName', 2, 120),
      storeTimeZone,
      storePublicSlug: `${tenantSlug}-main`,
      ownerEmail,
      ownerIdentity,
    };
    this.assertIdentityNotCopiedIntoOperationalText(parsed);
    return parsed;
  }

  private assertConfirmation(dto: unknown, expected: string): void {
    if (
      !this.record(dto) ||
      typeof dto.confirmation !== 'string' ||
      dto.confirmation.trim() !== expected
    ) {
      throw new BadRequestException(
        `confirmation must exactly equal "${expected}"`,
      );
    }
  }

  private assertIdentityNotCopiedIntoOperationalText(
    parsed: ParsedProvisioning,
  ): void {
    const canonicalEmail = parsed.ownerEmail.trim().toLowerCase();
    const operationalText = [
      parsed.requestId,
      parsed.reason,
      parsed.supportTicket,
      parsed.tenantName,
      parsed.tenantSlug,
      parsed.cohortKey,
      parsed.storeName,
    ];
    if (
      operationalText.some((value) =>
        value?.toLowerCase().includes(canonicalEmail),
      )
    ) {
      throw new BadRequestException({
        message: 'Owner identity must not be copied into operational metadata',
        reasonCode: 'SHARED_BETA_OWNER_IDENTITY_METADATA_FORBIDDEN',
      });
    }
  }

  private provisioningRequestDigest(parsed: ParsedProvisioning): string {
    return this.digest({
      profileVersion: SHARED_BETA_SHELL_PROFILE_VERSION,
      requestId: parsed.requestId,
      reason: parsed.reason,
      supportTicket: parsed.supportTicket,
      tenantName: parsed.tenantName,
      tenantSlug: parsed.tenantSlug,
      cohortKey: parsed.cohortKey,
      supportOwnerUserId: parsed.supportOwnerUserId,
      storeName: parsed.storeName,
      storeTimeZone: parsed.storeTimeZone,
      storePublicSlug: parsed.storePublicSlug,
      ownerEmailFingerprint: parsed.ownerIdentity.fingerprint,
      ownerEmailFingerprintKeyVersion: parsed.ownerIdentity.keyVersion,
      modules: COMPLETE_TENANT_MODULE_PROFILE,
      moduleAccess: {
        readEnabled: true,
        writeEnabled: true,
        outboundEnabled: false,
      },
      ownerRole: UserRole.OWNER,
      initialLifecycle: TenantLifecycleStatus.SUSPENDED,
      initialOnboarding: TenantOnboardingStatus.PROVISIONING,
      trialStartsAt: null,
      trialEndsAt: null,
    });
  }

  private digest(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private requiredText(
    value: unknown,
    field: string,
    min: number,
    max: number,
  ): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(`${field} must be a string`);
    }
    const trimmed = value.trim();
    if (trimmed.length < min || trimmed.length > max) {
      throw new BadRequestException(
        `${field} must contain ${min}-${max} characters`,
      );
    }
    return trimmed;
  }

  private optionalText(
    value: unknown,
    field: string,
    max: number,
  ): string | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    return this.requiredText(value, field, 1, max);
  }

  private ownerEmail(value: unknown): string {
    if (typeof value !== 'string' || !/^[ -~]+$/u.test(value)) {
      throw new BadRequestException('ownerEmail must use printable ASCII');
    }
    return this.requiredText(value, 'ownerEmail', 3, 320);
  }

  private assertPlatformAdmin(actor: AuthenticatedUser): void {
    if (!actor.isPlatformAdmin) {
      throw new ForbiddenException('Platform administrator access is required');
    }
  }

  private uuid(value: unknown): value is string {
    return (
      typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
        value,
      )
    );
  }

  private record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private hasExactKeys(
    value: Record<string, unknown>,
    expectedKeys: readonly string[],
  ): boolean {
    const actualKeys = Object.keys(value).sort();
    const expected = [...expectedKeys].sort();
    return (
      actualKeys.length === expected.length &&
      actualKeys.every((key, index) => key === expected[index])
    );
  }
}
