import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  TenantCustomerStage,
  TenantLifecycleStatus,
  TenantModule,
  TenantOnboardingStatus,
  UserAccessScope,
  UserRole,
} from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SHARED_BETA_INITIAL_OWNER_CAPABILITIES } from '../auth/capabilities';
import { PrismaService } from '../prisma/prisma.service';
import { COMPLETE_TENANT_MODULE_PROFILE } from '../tenancy/tenant-entitlement-profile.service';

const SHARED_BETA_PROFILE_VERSION = 'SHARED_MULTI_TENANT_BETA_V1';
const SHARED_BETA_PROVISION_ACTION = 'SHARED_BETA_TENANT_PROVISIONED';
const SHARED_BETA_INITIAL_INVITE_REVOKE_ACTION =
  'SHARED_BETA_INITIAL_OWNER_INVITE_REVOKED';
const MAXIMUM_TRIAL_DURATION_MS = 90 * 24 * 60 * 60 * 1000;
const MINIMUM_TRIAL_DURATION_MS = 24 * 60 * 60 * 1000;
const MINIMUM_INVITE_ACCEPTANCE_WINDOW_MS = 24 * 60 * 60 * 1000;

type ProvisionSharedTenantDto = {
  confirmation?: unknown;
  requestId?: unknown;
  reason?: unknown;
  supportTicket?: unknown;
  tenantName?: unknown;
  tenantSlug?: unknown;
  cohortKey?: unknown;
  supportOwnerUserId?: unknown;
  trialStartsAt?: unknown;
  trialEndsAt?: unknown;
  storeName?: unknown;
  storeTimeZone?: unknown;
  ownerEmail?: unknown;
  ownerFullName?: unknown;
  inviteExpiresInDays?: unknown;
};

type RevokeInitialOwnerInviteDto = {
  confirmation?: unknown;
  requestId?: unknown;
  reason?: unknown;
  supportTicket?: unknown;
};

type ParsedProvisioning = {
  requestId: string;
  reason: string;
  supportTicket: string | null;
  tenantName: string;
  tenantSlug: string;
  cohortKey: string;
  supportOwnerUserId: string;
  trialStartsAt: Date;
  trialEndsAt: Date;
  storeName: string;
  storeTimeZone: string;
  storePublicSlug: string;
  ownerEmail: string;
  ownerFullName: string | null;
  inviteExpiresInDays: number;
};

type ProvisioningReceipt = {
  profileVersion: typeof SHARED_BETA_PROFILE_VERSION;
  tenant: {
    id: string;
    slug: string;
    status: typeof TenantLifecycleStatus.SUSPENDED;
    customerStage: typeof TenantCustomerStage.PILOT;
    onboardingStatus: typeof TenantOnboardingStatus.OWNER_INVITED;
    profileRevision: number;
    executionRevision: number;
  };
  store: {
    id: string;
    name: string;
    isActive: false;
    gamificationEnabled: false;
  };
  ownerInvite: {
    id: string;
    expiresAt: string;
  };
  modules: Array<{
    module: TenantModule;
    readEnabled: true;
    writeEnabled: true;
    outboundEnabled: false;
    profileRevision: number;
  }>;
};

type ProvisioningResult = ProvisioningReceipt & {
  ok: true;
  decision: 'PROVISIONED_SUSPENDED' | 'ALREADY_PROVISIONED';
  replayed: boolean;
  activationRequired: true;
  ownerInvite: ProvisioningReceipt['ownerInvite'] & {
    registrationUrl: string | null;
    oneTimeSecretAvailable: boolean;
  };
};

type RevokeReceipt = {
  tenantId: string;
  tenantSlug: string;
  revokedInviteId: string;
  lifecycleStatus: typeof TenantLifecycleStatus.SUSPENDED;
  onboardingStatus: typeof TenantOnboardingStatus.PROVISIONING;
  executionRevisionBefore: number;
  executionRevisionAfter: number;
};

@Injectable()
export class SharedTenantProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async provision(
    actor: AuthenticatedUser,
    dto: ProvisionSharedTenantDto,
  ): Promise<ProvisioningResult> {
    this.assertPlatformAdmin(actor);
    const parsed = this.parseProvisioning(dto);
    this.assertConfirmation(dto.confirmation, `PROVISION ${parsed.tenantSlug}`);
    const requestDigest = this.provisioningRequestDigest(parsed);

    const existing = await this.prisma.tenant.findFirst({
      where: {
        slug: {
          equals: parsed.tenantSlug,
          mode: 'insensitive',
        },
      },
      select: { id: true },
    });
    if (existing) {
      return this.resolveExistingProvisioning(
        existing.id,
        parsed,
        requestDigest,
      );
    }

    const now = new Date();
    this.assertNewProvisioningTemporalAdmission(parsed, now);
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    const registrationUrl = this.buildInviteUrl(rawToken);
    const requestedInviteExpiry = new Date(
      now.getTime() + parsed.inviteExpiresInDays * 24 * 60 * 60 * 1000,
    );
    const inviteExpiresAt = new Date(
      Math.min(requestedInviteExpiry.getTime(), parsed.trialEndsAt.getTime()),
    );
    if (
      inviteExpiresAt.getTime() <
      Math.max(now.getTime(), parsed.trialStartsAt.getTime()) +
        MINIMUM_INVITE_ACCEPTANCE_WINDOW_MS
    ) {
      throw new BadRequestException(
        'Initial owner invite must remain valid for at least 24 hours after provisioning or trialStartsAt, whichever is later',
      );
    }

    try {
      const transactionResult = await this.prisma.$transaction(
        async (tx) => {
          await this.acquireProvisioningLocks(tx, [
            `shared-beta-owner-email:${parsed.ownerEmail}`,
            `shared-beta-tenant-slug:${parsed.tenantSlug}`,
          ]);

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
              receipt: this.replayReceipt(replay, requestDigest),
              created: false,
            };
          }

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

          const [conflictingUser, conflictingInvite] = await Promise.all([
            tx.user.findFirst({
              where: {
                email: {
                  equals: parsed.ownerEmail,
                  mode: 'insensitive',
                },
              },
              select: { id: true },
            }),
            tx.userInvite.findFirst({
              where: {
                email: {
                  equals: parsed.ownerEmail,
                  mode: 'insensitive',
                },
                acceptedAt: null,
                expiresAt: { gt: now },
              },
              select: { id: true },
            }),
          ]);
          if (conflictingUser || conflictingInvite) {
            throw new ConflictException(
              'Owner email already belongs to a user or a live invite',
            );
          }

          const tenant = await tx.tenant.create({
            data: {
              name: parsed.tenantName,
              slug: parsed.tenantSlug,
              status: TenantLifecycleStatus.SUSPENDED,
              customerStage: TenantCustomerStage.PILOT,
              onboardingStatus: TenantOnboardingStatus.OWNER_INVITED,
              cohortKey: parsed.cohortKey,
              supportOwnerUserId: supportOwner.id,
              trialStartsAt: parsed.trialStartsAt,
              trialEndsAt: parsed.trialEndsAt,
              entitlementProfileRevision: 1,
              statusChangedAt: now,
              statusReason: `Awaiting shared beta admission: ${parsed.reason}`,
            },
            select: {
              id: true,
              slug: true,
              status: true,
              customerStage: true,
              onboardingStatus: true,
              entitlementProfileRevision: true,
              executionRevision: true,
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
            },
            select: {
              id: true,
              name: true,
              isActive: true,
              gamificationEnabled: true,
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
              validFrom: parsed.trialStartsAt,
              validUntil: parsed.trialEndsAt,
              profileRevision: 1,
              reason: parsed.reason,
              createdAt: now,
              updatedAt: now,
            })),
          });
          const invite = await tx.userInvite.create({
            data: {
              tenantId: tenant.id,
              email: parsed.ownerEmail,
              fullName: parsed.ownerFullName,
              role: UserRole.OWNER,
              accessScope: UserAccessScope.NETWORK,
              storeIds: [],
              tokenHash,
              expiresAt: inviteExpiresAt,
              createdByUserId: actor.id,
            },
            select: {
              id: true,
              expiresAt: true,
            },
          });

          const receipt: ProvisioningReceipt = {
            profileVersion: SHARED_BETA_PROFILE_VERSION,
            tenant: {
              id: tenant.id,
              slug: tenant.slug,
              status: TenantLifecycleStatus.SUSPENDED,
              customerStage: TenantCustomerStage.PILOT,
              onboardingStatus: TenantOnboardingStatus.OWNER_INVITED,
              profileRevision: tenant.entitlementProfileRevision,
              executionRevision: tenant.executionRevision,
            },
            store: {
              id: store.id,
              name: store.name,
              isActive: false,
              gamificationEnabled: false,
            },
            ownerInvite: {
              id: invite.id,
              expiresAt: invite.expiresAt.toISOString(),
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
              action: SHARED_BETA_PROVISION_ACTION,
              targetType: 'TENANT',
              targetId: tenant.id,
              reason: parsed.reason,
              before: Prisma.JsonNull,
              after: receipt,
              metadata: {
                profileVersion: SHARED_BETA_PROFILE_VERSION,
                requestDigest,
                supportTicket: parsed.supportTicket,
                supportOwnerUserId: supportOwner.id,
                ownerInviteEmailBound: true,
                ownerInviteOneTimeSecret: true,
                initialOwnerScope: UserAccessScope.NETWORK,
                initialStoreCount: 1,
                moduleCount: COMPLETE_TENANT_MODULE_PROFILE.length,
                outboundDefault: 'OFF',
                activationRequired: true,
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
          ? 'PROVISIONED_SUSPENDED'
          : 'ALREADY_PROVISIONED',
        !transactionResult.created,
        transactionResult.created ? registrationUrl : null,
      );
    } catch (error) {
      const concurrentTenant = await this.prisma.tenant.findFirst({
        where: {
          slug: {
            equals: parsed.tenantSlug,
            mode: 'insensitive',
          },
        },
        select: { id: true },
      });
      if (concurrentTenant) {
        const replay = await this.findProvisioningReplay(
          this.prisma,
          concurrentTenant.id,
          parsed.requestId,
        );
        if (replay) {
          return this.provisioningResult(
            this.replayReceipt(replay, requestDigest),
            'ALREADY_PROVISIONED',
            true,
            null,
          );
        }
      }
      throw error;
    }
  }

  async revokeInitialOwnerInvite(
    actor: AuthenticatedUser,
    tenantId: string,
    dto: RevokeInitialOwnerInviteDto,
  ) {
    this.assertPlatformAdmin(actor);
    const requestId = this.requiredText(dto.requestId, 'requestId', 8, 200);
    const reason = this.requiredText(dto.reason, 'reason', 10, 500);
    const supportTicket = this.optionalText(
      dto.supportTicket,
      'supportTicket',
      200,
    );
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, slug: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant was not found');
    }
    this.assertConfirmation(dto.confirmation, `REVOKE ${tenant.slug}`);
    const requestDigest = this.revokeRequestDigest(
      tenant.id,
      requestId,
      reason,
      supportTicket,
    );

    const replay = await this.findAuditReplay(
      this.prisma,
      tenant.id,
      SHARED_BETA_INITIAL_INVITE_REVOKE_ACTION,
      requestId,
    );
    if (replay) {
      return {
        ok: true,
        replayed: true,
        ...this.replayRevokeReceipt(replay, requestDigest),
      };
    }

    try {
      const transactionResult = await this.prisma.$transaction(
        async (tx) => {
          const concurrentReplay = await this.findAuditReplay(
            tx,
            tenant.id,
            SHARED_BETA_INITIAL_INVITE_REVOKE_ACTION,
            requestId,
          );
          if (concurrentReplay) {
            return {
              receipt: this.replayRevokeReceipt(
                concurrentReplay,
                requestDigest,
              ),
              replayed: true,
            };
          }

          const lockedRows = await tx.$queryRaw<
            Array<{
              id: string;
              slug: string;
              status: TenantLifecycleStatus;
              customerStage: TenantCustomerStage;
              onboardingStatus: TenantOnboardingStatus;
              entitlementProfileRevision: number;
              executionRevision: number;
              updatedAt: Date;
            }>
          >(Prisma.sql`
            SELECT
              "id",
              "slug",
              "status",
              "customerStage",
              "onboardingStatus",
              "entitlementProfileRevision",
              "executionRevision",
              "updatedAt"
            FROM "Tenant"
            WHERE "id" = ${tenant.id}
            FOR UPDATE
          `);
          const current = lockedRows[0];
          if (!current || current.slug !== tenant.slug) {
            throw new ConflictException(
              'Tenant changed while revoking the initial invite',
            );
          }
          if (
            current.customerStage !== TenantCustomerStage.PILOT &&
            current.customerStage !== TenantCustomerStage.BETA
          ) {
            throw new ForbiddenException(
              'Initial owner revoke is only available for an external beta tenant',
            );
          }
          if (
            current.onboardingStatus !== TenantOnboardingStatus.OWNER_INVITED
          ) {
            throw new ConflictException(
              'Tenant is not waiting for its initial owner',
            );
          }

          const provisionMarker = await tx.platformAdminAuditEvent.findFirst({
            where: {
              tenantId: tenant.id,
              action: SHARED_BETA_PROVISION_ACTION,
            },
            orderBy: { createdAt: 'desc' },
            select: { after: true },
          });
          if (!provisionMarker) {
            throw new ForbiddenException(
              'Shared beta provisioning marker is missing',
            );
          }
          const provisionReceipt = this.parseProvisioningReceipt(
            provisionMarker.after,
          );
          const invite = await tx.userInvite.findUnique({
            where: { id: provisionReceipt.ownerInvite.id },
            select: {
              id: true,
              tenantId: true,
              role: true,
              accessScope: true,
              customRoleId: true,
              storeIds: true,
              acceptedAt: true,
              expiresAt: true,
            },
          });
          if (
            !invite ||
            invite.tenantId !== tenant.id ||
            invite.role !== UserRole.OWNER ||
            invite.accessScope !== UserAccessScope.NETWORK ||
            invite.customRoleId !== null ||
            invite.storeIds.length !== 0 ||
            invite.acceptedAt !== null
          ) {
            throw new ConflictException(
              'Initial owner invite no longer matches the provisioned receipt',
            );
          }

          const [
            userCount,
            otherInviteCount,
            sourceCount,
            credentialCount,
            stores,
          ] = await Promise.all([
              tx.user.count({ where: { tenantId: tenant.id } }),
              tx.userInvite.count({
                where: {
                  tenantId: tenant.id,
                  id: { not: invite.id },
                },
              }),
              tx.integrationSource.count({
                where: { tenantId: tenant.id },
              }),
              tx.integrationCredential.count({
                where: { tenantId: tenant.id },
              }),
              tx.store.findMany({
                where: { tenantId: tenant.id },
                select: {
                  id: true,
                  isActive: true,
                  gamificationEnabled: true,
                  integrationSourceId: true,
                  externalProvider: true,
                  externalDomain: true,
                  externalClubId: true,
                },
              }),
            ]);
          if (
            userCount !== 0 ||
            otherInviteCount !== 0 ||
            sourceCount !== 0 ||
            credentialCount !== 0 ||
            stores.length !== 1 ||
            stores[0]?.id !== provisionReceipt.store.id ||
            stores[0].isActive ||
            stores[0].gamificationEnabled ||
            stores[0].integrationSourceId !== null ||
            stores[0].externalProvider !== null ||
            stores[0].externalDomain !== null ||
            stores[0].externalClubId !== null
          ) {
            throw new ConflictException(
              'Initial invite revoke requires a pristine pre-owner tenant',
            );
          }

          await tx.userInvite.delete({ where: { id: invite.id } });
          const changedAt = new Date();
          const suspended = await tx.tenant.updateMany({
            where: {
              id: current.id,
              status: current.status,
              onboardingStatus: current.onboardingStatus,
              entitlementProfileRevision: current.entitlementProfileRevision,
              executionRevision: current.executionRevision,
              updatedAt: current.updatedAt,
            },
            data: {
              status: TenantLifecycleStatus.SUSPENDED,
              onboardingStatus: TenantOnboardingStatus.PROVISIONING,
              statusChangedAt: changedAt,
              statusReason: reason,
            },
          });
          if (suspended.count !== 1) {
            throw new ConflictException(
              'Tenant changed while revoking the initial invite',
            );
          }

          const revokedTenant = await tx.tenant.findUniqueOrThrow({
            where: { id: current.id },
            select: {
              status: true,
              onboardingStatus: true,
              executionRevision: true,
            },
          });
          if (
            revokedTenant.status !== TenantLifecycleStatus.SUSPENDED ||
            revokedTenant.onboardingStatus !==
              TenantOnboardingStatus.PROVISIONING ||
            revokedTenant.executionRevision !== current.executionRevision + 1
          ) {
            throw new ConflictException(
              'Tenant execution revision changed while revoking the initial invite',
            );
          }

          const revokeReceipt: RevokeReceipt = {
            tenantId: tenant.id,
            tenantSlug: tenant.slug,
            revokedInviteId: invite.id,
            lifecycleStatus: TenantLifecycleStatus.SUSPENDED,
            onboardingStatus: TenantOnboardingStatus.PROVISIONING,
            executionRevisionBefore: current.executionRevision,
            executionRevisionAfter: revokedTenant.executionRevision,
          };
          await tx.platformAdminAuditEvent.create({
            data: {
              tenantId: tenant.id,
              actorUserId: actor.id,
              requestId,
              action: SHARED_BETA_INITIAL_INVITE_REVOKE_ACTION,
              targetType: 'USER_INVITE',
              targetId: invite.id,
              reason,
              before: {
                inviteId: invite.id,
                expiresAt: invite.expiresAt.toISOString(),
                lifecycleStatus: current.status,
                onboardingStatus: current.onboardingStatus,
                executionRevision: current.executionRevision,
              },
              after: {
                ...revokeReceipt,
                executionRevision: revokedTenant.executionRevision,
              },
              metadata: {
                requestDigest,
                supportTicket,
                provisioningProfileVersion: SHARED_BETA_PROFILE_VERSION,
                confirmationRule: 'REVOKE tenant_slug',
                executionRevisionBefore: current.executionRevision,
                executionRevisionAfter: revokedTenant.executionRevision,
              },
            },
          });

          return { receipt: revokeReceipt, replayed: false };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      return {
        ok: true,
        replayed: transactionResult.replayed,
        ...transactionResult.receipt,
      };
    } catch (error) {
      const concurrentReplay = await this.findAuditReplay(
        this.prisma,
        tenant.id,
        SHARED_BETA_INITIAL_INVITE_REVOKE_ACTION,
        requestId,
      );
      if (concurrentReplay) {
        return {
          ok: true,
          replayed: true,
          ...this.replayRevokeReceipt(concurrentReplay, requestDigest),
        };
      }
      throw error;
    }
  }

  private async resolveExistingProvisioning(
    tenantId: string,
    parsed: ParsedProvisioning,
    requestDigest: string,
  ): Promise<ProvisioningResult> {
    const replay = await this.findProvisioningReplay(
      this.prisma,
      tenantId,
      parsed.requestId,
    );
    if (!replay) {
      throw new ConflictException('Tenant slug is already in use');
    }
    return this.provisioningResult(
      this.replayReceipt(replay, requestDigest),
      'ALREADY_PROVISIONED',
      true,
      null,
    );
  }

  private async acquireProvisioningLocks(
    tx: Prisma.TransactionClient,
    keys: readonly string[],
  ): Promise<void> {
    for (const key of [...keys].sort()) {
      await tx.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
      );
    }
  }

  private findProvisioningReplay(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    requestId: string,
  ) {
    return this.findAuditReplay(
      client,
      tenantId,
      SHARED_BETA_PROVISION_ACTION,
      requestId,
    );
  }

  private findAuditReplay(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    action: string,
    requestId: string,
  ) {
    return client.platformAdminAuditEvent.findUnique({
      where: {
        tenantId_action_requestId: {
          tenantId,
          action,
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
  ): ProvisioningReceipt {
    this.assertReplayDigest(event.metadata, requestDigest);
    return this.parseProvisioningReceipt(event.after);
  }

  private replayRevokeReceipt(
    event: {
      after: Prisma.JsonValue | null;
      metadata: Prisma.JsonValue | null;
    },
    requestDigest: string,
  ): RevokeReceipt {
    this.assertReplayDigest(event.metadata, requestDigest);
    if (!this.record(event.after)) {
      throw new ConflictException('Stored revoke receipt is invalid');
    }
    const receipt = event.after;
    const executionRevisionBefore = receipt.executionRevisionBefore;
    const executionRevisionAfter = receipt.executionRevisionAfter;
    if (
      typeof receipt.tenantId !== 'string' ||
      typeof receipt.tenantSlug !== 'string' ||
      typeof receipt.revokedInviteId !== 'string' ||
      receipt.lifecycleStatus !== TenantLifecycleStatus.SUSPENDED ||
      receipt.onboardingStatus !== TenantOnboardingStatus.PROVISIONING ||
      typeof executionRevisionBefore !== 'number' ||
      !Number.isSafeInteger(executionRevisionBefore) ||
      executionRevisionBefore < 0 ||
      typeof executionRevisionAfter !== 'number' ||
      !Number.isSafeInteger(executionRevisionAfter) ||
      executionRevisionAfter !== executionRevisionBefore + 1
    ) {
      throw new ConflictException('Stored revoke receipt is invalid');
    }
    return {
      tenantId: receipt.tenantId,
      tenantSlug: receipt.tenantSlug,
      revokedInviteId: receipt.revokedInviteId,
      lifecycleStatus: TenantLifecycleStatus.SUSPENDED,
      onboardingStatus: TenantOnboardingStatus.PROVISIONING,
      executionRevisionBefore,
      executionRevisionAfter,
    };
  }

  private assertReplayDigest(
    metadata: Prisma.JsonValue | null,
    requestDigest: string,
  ): void {
    if (!this.record(metadata) || metadata.requestDigest !== requestDigest) {
      throw new ConflictException(
        'requestId was already used with a different operation payload',
      );
    }
  }

  private parseProvisioningReceipt(
    value: Prisma.JsonValue | null,
  ): ProvisioningReceipt {
    if (
      !this.record(value) ||
      value.profileVersion !== SHARED_BETA_PROFILE_VERSION ||
      !this.record(value.tenant) ||
      !this.record(value.store) ||
      !this.record(value.ownerInvite) ||
      !Array.isArray(value.modules)
    ) {
      throw new ConflictException('Stored provisioning receipt is invalid');
    }
    const tenant = value.tenant;
    const store = value.store;
    const ownerInvite = value.ownerInvite;
    const modules = value.modules;
    const expectedModules = new Set(COMPLETE_TENANT_MODULE_PROFILE);
    const moduleRecords: Array<Record<string, unknown> | null> = modules.map(
      (module) => (this.record(module) ? module : null),
    );
    const actualModules = new Set(
      moduleRecords
        .filter((module): module is Record<string, unknown> => module !== null)
        .map((module) => module.module),
    );
    if (
      typeof tenant.id !== 'string' ||
      typeof tenant.slug !== 'string' ||
      tenant.status !== TenantLifecycleStatus.SUSPENDED ||
      tenant.customerStage !== TenantCustomerStage.PILOT ||
      tenant.onboardingStatus !== TenantOnboardingStatus.OWNER_INVITED ||
      tenant.profileRevision !== 1 ||
      !Number.isSafeInteger(tenant.executionRevision) ||
      (tenant.executionRevision as number) < 0 ||
      typeof store.id !== 'string' ||
      typeof store.name !== 'string' ||
      store.isActive !== false ||
      store.gamificationEnabled !== false ||
      typeof ownerInvite.id !== 'string' ||
      !this.isoTimestamp(ownerInvite.expiresAt) ||
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
      throw new ConflictException('Stored provisioning receipt is invalid');
    }

    return value as unknown as ProvisioningReceipt;
  }

  private provisioningResult(
    receipt: ProvisioningReceipt,
    decision: ProvisioningResult['decision'],
    replayed: boolean,
    registrationUrl: string | null,
  ): ProvisioningResult {
    return {
      ok: true,
      decision,
      replayed,
      activationRequired: true,
      ...receipt,
      ownerInvite: {
        ...receipt.ownerInvite,
        registrationUrl,
        oneTimeSecretAvailable: registrationUrl !== null,
      },
    };
  }

  private parseProvisioning(dto: ProvisionSharedTenantDto): ParsedProvisioning {
    const tenantSlug = this.requiredText(
      dto.tenantSlug,
      'tenantSlug',
      3,
      63,
    ).toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tenantSlug)) {
      throw new BadRequestException(
        'tenantSlug must contain lowercase letters, digits and single hyphens',
      );
    }

    const trialStartsAt = this.requiredDate(dto.trialStartsAt, 'trialStartsAt');
    const trialEndsAt = this.requiredDate(dto.trialEndsAt, 'trialEndsAt');
    const trialDuration = trialEndsAt.getTime() - trialStartsAt.getTime();
    if (
      trialDuration < MINIMUM_TRIAL_DURATION_MS ||
      trialDuration > MAXIMUM_TRIAL_DURATION_MS
    ) {
      throw new BadRequestException(
        'Trial duration must be between 1 and 90 days',
      );
    }

    const storeTimeZone = this.requiredText(
      dto.storeTimeZone,
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

    const inviteExpiresInDays =
      dto.inviteExpiresInDays === undefined ? 7 : dto.inviteExpiresInDays;
    if (
      typeof inviteExpiresInDays !== 'number' ||
      !Number.isInteger(inviteExpiresInDays) ||
      inviteExpiresInDays < 1 ||
      inviteExpiresInDays > 14
    ) {
      throw new BadRequestException(
        'inviteExpiresInDays must be an integer from 1 to 14',
      );
    }

    return {
      requestId: this.requiredText(dto.requestId, 'requestId', 8, 200),
      reason: this.requiredText(dto.reason, 'reason', 10, 500),
      supportTicket: this.optionalText(dto.supportTicket, 'supportTicket', 200),
      tenantName: this.requiredText(dto.tenantName, 'tenantName', 2, 120),
      tenantSlug,
      cohortKey: this.requiredText(dto.cohortKey, 'cohortKey', 3, 100),
      supportOwnerUserId: this.requiredText(
        dto.supportOwnerUserId,
        'supportOwnerUserId',
        1,
        100,
      ),
      trialStartsAt,
      trialEndsAt,
      storeName: this.requiredText(dto.storeName, 'storeName', 2, 120),
      storeTimeZone,
      storePublicSlug: `${tenantSlug}-main`,
      ownerEmail: this.email(dto.ownerEmail),
      ownerFullName: this.optionalText(dto.ownerFullName, 'ownerFullName', 120),
      inviteExpiresInDays,
    };
  }

  private assertNewProvisioningTemporalAdmission(
    parsed: ParsedProvisioning,
    now: Date,
  ): void {
    if (parsed.trialEndsAt.getTime() <= now.getTime()) {
      throw new BadRequestException('trialEndsAt must be in the future');
    }
    if (
      parsed.trialStartsAt.getTime() <
        now.getTime() - 24 * 60 * 60 * 1000 ||
      parsed.trialStartsAt.getTime() >
        now.getTime() + 24 * 60 * 60 * 1000
    ) {
      throw new BadRequestException(
        'trialStartsAt must be within 24 hours of provisioning',
      );
    }
  }

  private provisioningRequestDigest(parsed: ParsedProvisioning): string {
    return this.digest({
      profileVersion: SHARED_BETA_PROFILE_VERSION,
      ...parsed,
      trialStartsAt: parsed.trialStartsAt.toISOString(),
      trialEndsAt: parsed.trialEndsAt.toISOString(),
      modules: COMPLETE_TENANT_MODULE_PROFILE,
      moduleAccess: {
        readEnabled: true,
        writeEnabled: true,
        outboundEnabled: false,
      },
      ownerRole: UserRole.OWNER,
      ownerScope: UserAccessScope.NETWORK,
      initialLifecycle: TenantLifecycleStatus.SUSPENDED,
    });
  }

  private revokeRequestDigest(
    tenantId: string,
    requestId: string,
    reason: string,
    supportTicket: string | null,
  ): string {
    return this.digest({
      tenantId,
      requestId,
      reason,
      supportTicket,
      action: SHARED_BETA_INITIAL_INVITE_REVOKE_ACTION,
    });
  }

  private digest(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private buildInviteUrl(token: string): string {
    const configuredBase =
      this.configService.get<string>('WEB_URL') ??
      this.configService.get<string>('FRONTEND_URL') ??
      this.configService.get<string>('NEXT_PUBLIC_WEB_URL') ??
      'https://leetplus.ru';
    const base = configuredBase.replace(/\/+$/, '');
    return `${base}/register?invite=${encodeURIComponent(token)}`;
  }

  private email(value: unknown): string {
    const email = this.requiredText(value, 'ownerEmail', 3, 320).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('ownerEmail must be a valid email');
    }
    return email;
  }

  private requiredDate(value: unknown, field: string): Date {
    if (typeof value !== 'string' || !value.includes('T')) {
      throw new BadRequestException(`${field} must be an ISO-8601 timestamp`);
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
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
        `${field} must contain ${minimumLength}..${maximumLength} characters`,
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
    if (!normalized) {
      return null;
    }
    if (normalized.length > maximumLength) {
      throw new BadRequestException(
        `${field} must not exceed ${maximumLength} characters`,
      );
    }
    return normalized;
  }

  private assertConfirmation(value: unknown, expected: string): void {
    if (typeof value !== 'string' || value.trim() !== expected) {
      throw new BadRequestException(`confirmation must equal ${expected}`);
    }
  }

  private assertPlatformAdmin(actor: AuthenticatedUser): void {
    if (!actor?.id || !actor.isPlatformAdmin) {
      throw new ForbiddenException('Platform administrator access is required');
    }
  }

  private record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private isoTimestamp(value: unknown): value is string {
    return (
      typeof value === 'string' &&
      value.includes('T') &&
      !Number.isNaN(new Date(value).getTime())
    );
  }
}
