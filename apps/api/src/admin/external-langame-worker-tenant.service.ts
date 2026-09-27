import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IntegrationProvider,
  Prisma,
  TenantCustomerStage,
  TenantLifecycleStatus,
  TenantModule,
  TenantOnboardingStatus,
} from '@prisma/client';
import { createHash, randomUUID, verify } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { EZ_GAME_LANGAME_SCOPE } from '../integrations/langame-external-pilot-authority';
import { COMPLETE_TENANT_MODULE_PROFILE } from '../tenancy/tenant-entitlement-profile.service';

/** The first external worker is deliberately bound to this one reviewed network. */
export const EZ_GAME_WORKER_SCOPE = EZ_GAME_LANGAME_SCOPE;

export const EXTERNAL_WORKER_OUTBOUND_MODULES: readonly TenantModule[] =
  Object.freeze([
    TenantModule.INTEGRATIONS,
    TenantModule.ASSORTMENT,
    TenantModule.STAFF,
  ]);

const CONTRACT = 'LEETPLUS_EXTERNAL_LANGAME_TENANT_CHANGE_V1';
export const EXTERNAL_TENANT_APPROVAL_CONTRACT =
  'LEETPLUS_EXTERNAL_LANGAME_TENANT_APPROVAL_V1';
const ACTIONS = ['ACTIVATE_LIVE', 'REVOKE_OUTBOUND'] as const;
type Action = (typeof ACTIONS)[number];
const AUDIT_ACTION: Record<Action, string> = {
  ACTIVATE_LIVE: 'EXTERNAL_LANGAME_WORKER_TENANT_ACTIVATED',
  REVOKE_OUTBOUND: 'EXTERNAL_LANGAME_WORKER_TENANT_REVOKED',
};
const SHA256 = /^[a-f0-9]{64}$/;
const UTC_ISO = /^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ModuleState = {
  id: string;
  module: TenantModule;
  readEnabled: boolean;
  writeEnabled: boolean;
  outboundEnabled: boolean;
  validFrom: string | null;
  validUntil: string | null;
  profileRevision: number;
  reason: string;
  updatedAt: string;
};

type Snapshot = {
  tenant: {
    id: string;
    slug: string;
    status: TenantLifecycleStatus;
    customerStage: TenantCustomerStage;
    onboardingStatus: TenantOnboardingStatus;
    entitlementProfileRevision: number;
    executionRevision: number;
    trialStartsAt: string | null;
    trialEndsAt: string | null;
    updatedAt: string;
  };
  source: {
    id: string;
    tenantId: string;
    provider: IntegrationProvider;
    domain: string;
    isActive: boolean;
    updatedAt: string;
  };
  store: {
    id: string;
    tenantId: string;
    externalProvider: IntegrationProvider | null;
    integrationSourceId: string | null;
    externalDomain: string | null;
    externalClubId: string | null;
    isActive: boolean;
    backgroundExecutionEnabled: boolean;
    executionRevision: number;
    updatedAt: string;
  };
  modules: ModuleState[];
};

export type ExternalLangameTenantPlan = {
  contract: typeof CONTRACT;
  action: Action;
  tenantId: string;
  tenantSlug: string;
  sourceId: string;
  storeId: string;
  domain: string;
  clubId: string;
  preimageSha256: string;
  profileRevisionBefore: number;
  profileRevisionAfter: number;
  executionRevisionBefore: number;
  executionRevisionAfter: number;
  storeRevision: number;
  customerStageBefore: TenantCustomerStage;
  customerStageAfter: typeof TenantCustomerStage.LIVE;
  outboundModules: readonly TenantModule[];
  otherModulesOutbound: false;
  storeBackgroundExecutionChanged: false;
  trialWindowCleared: boolean;
};

type ApplyInput = {
  action?: unknown;
  confirmation?: unknown;
  planSha256?: unknown;
  requestId?: unknown;
  reason?: unknown;
  approval?: unknown;
};

export type ExternalTenantApprovalStatement = {
  contract: typeof EXTERNAL_TENANT_APPROVAL_CONTRACT;
  tenantId: string;
  action: Action;
  planSha256: string;
  requestId: string;
  reasonSha256: string;
  issuedAt: string;
  expiresAt: string;
};

@Injectable()
export class ExternalLangameWorkerTenantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async prepare(
    actor: AuthenticatedUser,
    tenantId: string,
    actionInput: unknown,
  ): Promise<{ plan: ExternalLangameTenantPlan; planSha256: string }> {
    this.assertActor(actor);
    const action = this.parseAction(actionInput);
    const snapshot = await this.loadSnapshot(this.prisma, tenantId, action);
    const plan = this.buildPlan(snapshot, action);
    return { plan, planSha256: this.digest(plan) };
  }

  async apply(
    actor: AuthenticatedUser,
    tenantId: string,
    input: ApplyInput,
  ): Promise<ExternalLangameTenantPlan> {
    this.assertActor(actor);
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input).some(
        (key) =>
          ![
            'action',
            'confirmation',
            'planSha256',
            'requestId',
            'reason',
            'approval',
          ].includes(key),
      )
    ) {
      throw new BadRequestException(
        'Unsupported external tenant change fields',
      );
    }
    const action = this.parseAction(input.action);
    if (input.confirmation !== EZ_GAME_WORKER_SCOPE.tenantSlug) {
      throw new BadRequestException(
        'Exact tenant-slug confirmation is required',
      );
    }
    const planSha256 = input.planSha256;
    if (typeof planSha256 !== 'string' || !SHA256.test(planSha256)) {
      throw new BadRequestException('Exact prepared plan digest is required');
    }
    const requestId = input.requestId;
    if (typeof requestId !== 'string' || !UUID.test(requestId)) {
      throw new BadRequestException('requestId must be a UUID');
    }
    const reason = input.reason;
    if (
      typeof reason !== 'string' ||
      reason !== reason.trim() ||
      reason.length < 10 ||
      reason.length > 500
    ) {
      throw new BadRequestException('A specific reason is required');
    }
    const requestSha256 = this.digest({
      tenantId,
      action,
      confirmation: input.confirmation,
      planSha256,
      requestId,
      reason,
    });
    const replay = await this.findReplay(
      tenantId,
      action,
      requestId,
      requestSha256,
    );
    if (replay) return replay;
    const approvalEvidence = this.assertApproval(input.approval, {
      tenantId,
      action,
      planSha256,
      requestId,
      reasonSha256: this.digest(reason),
    });

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const persistedActor = await tx.user.findUnique({
            where: { id: actor.id },
            select: { isActive: true, isPlatformAdmin: true },
          });
          if (!persistedActor?.isActive || !persistedActor.isPlatformAdmin) {
            throw new ForbiddenException(
              'Active platform administrator required',
            );
          }
          // Acquire row locks before the signed preimage read. A concurrent
          // deactivation or rebind is ordered before or after this exact CAS,
          // never between the scope read and activation commit.
          await tx.$queryRaw(Prisma.sql`
            SELECT "id" FROM "Tenant"
            WHERE "id" = ${tenantId} FOR UPDATE
          `);
          await tx.$queryRaw(Prisma.sql`
            SELECT "id" FROM "IntegrationSource"
            WHERE "id" = ${EZ_GAME_WORKER_SCOPE.sourceId}
              AND "tenantId" = ${tenantId} FOR UPDATE
          `);
          await tx.$queryRaw(Prisma.sql`
            SELECT "id" FROM "Store"
            WHERE "id" = ${EZ_GAME_WORKER_SCOPE.storeId}
              AND "tenantId" = ${tenantId} FOR UPDATE
          `);
          const snapshot = await this.loadSnapshot(tx, tenantId, action);
          const plan = this.buildPlan(snapshot, action);
          if (this.digest(plan) !== planSha256) {
            throw new ConflictException(
              'External worker tenant plan has drifted',
            );
          }
          this.assertApproval(input.approval, {
            tenantId,
            action,
            planSha256,
            requestId,
            reasonSha256: this.digest(reason),
          });
          const now = new Date();
          const claimed = await tx.tenant.updateMany({
            where: {
              id: snapshot.tenant.id,
              updatedAt: new Date(snapshot.tenant.updatedAt),
              entitlementProfileRevision: plan.profileRevisionBefore,
              executionRevision: plan.executionRevisionBefore,
              customerStage: snapshot.tenant.customerStage,
            },
            data: {
              customerStage: TenantCustomerStage.LIVE,
              ...(action === 'ACTIVATE_LIVE'
                ? { trialStartsAt: null, trialEndsAt: null }
                : {}),
              entitlementProfileRevision: plan.profileRevisionAfter,
            },
          });
          if (claimed.count !== 1) {
            throw new ConflictException('External worker tenant CAS changed');
          }
          const advanced = await tx.tenant.findUniqueOrThrow({
            where: { id: tenantId },
            select: {
              entitlementProfileRevision: true,
              executionRevision: true,
            },
          });
          if (
            advanced.entitlementProfileRevision !== plan.profileRevisionAfter ||
            advanced.executionRevision !== plan.executionRevisionAfter
          ) {
            throw new ConflictException(
              'Tenant execution revision did not advance once',
            );
          }
          await tx.tenantModuleEntitlement.deleteMany({
            where: { tenantId },
          });
          await tx.tenantModuleEntitlement.createMany({
            data: snapshot.modules.map((entry) => ({
              id: randomUUID(),
              tenantId,
              module: entry.module,
              readEnabled: entry.readEnabled,
              writeEnabled: entry.writeEnabled,
              outboundEnabled:
                EXTERNAL_WORKER_OUTBOUND_MODULES.includes(entry.module) &&
                action === 'ACTIVATE_LIVE',
              validFrom: entry.validFrom ? new Date(entry.validFrom) : null,
              validUntil: entry.validUntil ? new Date(entry.validUntil) : null,
              profileRevision: plan.profileRevisionAfter,
              reason,
              createdAt: now,
              updatedAt: now,
            })),
          });
          await tx.platformAdminAuditEvent.create({
            data: {
              tenantId,
              actorUserId: actor.id,
              requestId,
              action: AUDIT_ACTION[action],
              targetType: 'TENANT_EXTERNAL_LANGAME_WORKER',
              targetId: EZ_GAME_WORKER_SCOPE.storeId,
              reason,
              before: snapshot,
              after: plan,
              metadata: {
                contract: CONTRACT,
                requestSha256,
                planSha256,
                sourceId: EZ_GAME_WORKER_SCOPE.sourceId,
                storeId: EZ_GAME_WORKER_SCOPE.storeId,
                profileRevisionBefore: plan.profileRevisionBefore,
                profileRevisionAfter: plan.profileRevisionAfter,
                executionRevisionBefore: plan.executionRevisionBefore,
                executionRevisionAfter: plan.executionRevisionAfter,
                storeBackgroundExecutionChanged: false,
                approvalSha256: approvalEvidence.approvalSha256,
                approvalRootSha256: approvalEvidence.approvalRootSha256,
                approvalExpiresAt: approvalEvidence.expiresAt,
              },
            },
          });
          return plan;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      const replayAfterConflict = await this.findReplay(
        tenantId,
        action,
        requestId,
        requestSha256,
      );
      if (replayAfterConflict) return replayAfterConflict;
      throw error;
    }
  }

  private async findReplay(
    tenantId: string,
    action: Action,
    requestId: string,
    requestSha256: string,
  ): Promise<ExternalLangameTenantPlan | null> {
    const event = await this.prisma.platformAdminAuditEvent.findUnique({
      where: {
        tenantId_action_requestId: {
          tenantId,
          action: AUDIT_ACTION[action],
          requestId,
        },
      },
      select: { after: true, metadata: true },
    });
    if (!event) return null;
    const metadata = event.metadata;
    if (
      !metadata ||
      typeof metadata !== 'object' ||
      Array.isArray(metadata) ||
      metadata.requestSha256 !== requestSha256
    ) {
      throw new ConflictException('requestId was used for a different change');
    }
    const after = event.after;
    if (
      !after ||
      typeof after !== 'object' ||
      Array.isArray(after) ||
      after.contract !== CONTRACT ||
      after.action !== action
    ) {
      throw new ConflictException('Stored external tenant change is invalid');
    }
    return after as unknown as ExternalLangameTenantPlan;
  }

  private async loadSnapshot(
    db: Prisma.TransactionClient,
    tenantId: string,
    action: Action,
  ): Promise<Snapshot> {
    if (tenantId !== EZ_GAME_WORKER_SCOPE.tenantId) {
      throw new ForbiddenException(
        'External worker tenant is outside the reviewed scope',
      );
    }
    const [tenant, source, store, activeSources, activeStores] =
      await Promise.all([
        db.tenant.findUnique({
          where: { id: tenantId },
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
            updatedAt: true,
            moduleEntitlements: {
              select: {
                id: true,
                module: true,
                readEnabled: true,
                writeEnabled: true,
                outboundEnabled: true,
                validFrom: true,
                validUntil: true,
                profileRevision: true,
                reason: true,
                updatedAt: true,
              },
              orderBy: { module: 'asc' },
            },
          },
        }),
        db.integrationSource.findUnique({
          where: { id: EZ_GAME_WORKER_SCOPE.sourceId },
          select: {
            id: true,
            tenantId: true,
            provider: true,
            domain: true,
            isActive: true,
            updatedAt: true,
          },
        }),
        db.store.findUnique({
          where: { id: EZ_GAME_WORKER_SCOPE.storeId },
          select: {
            id: true,
            tenantId: true,
            externalProvider: true,
            integrationSourceId: true,
            externalDomain: true,
            externalClubId: true,
            isActive: true,
            backgroundExecutionEnabled: true,
            executionRevision: true,
            updatedAt: true,
          },
        }),
        db.integrationSource.findMany({
          where: {
            tenantId,
            provider: IntegrationProvider.LANGAME,
            isActive: true,
          },
          select: { id: true },
        }),
        db.store.findMany({
          where: {
            tenantId,
            externalProvider: IntegrationProvider.LANGAME,
            isActive: true,
          },
          select: { id: true },
        }),
      ]);
    if (!tenant)
      throw new NotFoundException('External worker tenant was not found');
    if (
      tenant.slug !== EZ_GAME_WORKER_SCOPE.tenantSlug ||
      !source ||
      source.tenantId !== tenantId ||
      !store ||
      store.tenantId !== tenantId
    ) {
      throw new ConflictException(
        'External Langame source or Store binding changed',
      );
    }
    if (
      action === 'ACTIVATE_LIVE' &&
      (source.provider !== IntegrationProvider.LANGAME ||
        !source.isActive ||
        source.domain !== EZ_GAME_WORKER_SCOPE.domain ||
        store.externalProvider !== IntegrationProvider.LANGAME ||
        !store.isActive ||
        store.backgroundExecutionEnabled ||
        store.integrationSourceId !== source.id ||
        store.externalDomain !== EZ_GAME_WORKER_SCOPE.domain ||
        store.externalClubId !== EZ_GAME_WORKER_SCOPE.clubId ||
        activeSources.length !== 1 ||
        activeSources[0].id !== source.id ||
        activeStores.length !== 1 ||
        activeStores[0].id !== store.id)
    ) {
      throw new ConflictException('External Langame active binding changed');
    }
    return {
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        status: tenant.status,
        customerStage: tenant.customerStage,
        onboardingStatus: tenant.onboardingStatus,
        entitlementProfileRevision: tenant.entitlementProfileRevision,
        executionRevision: tenant.executionRevision,
        trialStartsAt: tenant.trialStartsAt?.toISOString() ?? null,
        trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
        updatedAt: tenant.updatedAt.toISOString(),
      },
      source: {
        ...source,
        updatedAt: source.updatedAt.toISOString(),
      },
      store: {
        ...store,
        updatedAt: store.updatedAt.toISOString(),
      },
      modules: tenant.moduleEntitlements.map((entry) => ({
        ...entry,
        validFrom: entry.validFrom?.toISOString() ?? null,
        validUntil: entry.validUntil?.toISOString() ?? null,
        updatedAt: entry.updatedAt.toISOString(),
      })),
    };
  }

  private buildPlan(
    snapshot: Snapshot,
    action: Action,
  ): ExternalLangameTenantPlan {
    const { tenant, modules } = snapshot;
    if (
      tenant.status !== TenantLifecycleStatus.ACTIVE ||
      !new Set<TenantOnboardingStatus>([
        TenantOnboardingStatus.ONBOARDING,
        TenantOnboardingStatus.READY,
        TenantOnboardingStatus.ACTIVE,
      ]).has(tenant.onboardingStatus)
    ) {
      throw new ConflictException(
        'External tenant is not active for a data worker',
      );
    }
    if (
      !Number.isSafeInteger(tenant.entitlementProfileRevision) ||
      tenant.entitlementProfileRevision < 1 ||
      tenant.entitlementProfileRevision >= 2_147_483_647 ||
      !Number.isSafeInteger(tenant.executionRevision) ||
      tenant.executionRevision < 1 ||
      tenant.executionRevision >= 2_147_483_647
    ) {
      throw new ConflictException('External tenant revisions are invalid');
    }
    if (
      modules.length !== COMPLETE_TENANT_MODULE_PROFILE.length ||
      new Set(modules.map((entry) => entry.module)).size !== modules.length ||
      COMPLETE_TENANT_MODULE_PROFILE.some(
        (module) => !modules.some((entry) => entry.module === module),
      ) ||
      modules.some(
        (entry) => entry.profileRevision !== tenant.entitlementProfileRevision,
      )
    ) {
      throw new ConflictException(
        'External tenant module profile is incomplete',
      );
    }
    const required = modules.filter((entry) =>
      EXTERNAL_WORKER_OUTBOUND_MODULES.includes(entry.module),
    );
    const dataModules = modules.filter((entry) =>
      [...EXTERNAL_WORKER_OUTBOUND_MODULES, TenantModule.GAMIFICATION].includes(
        entry.module,
      ),
    );
    if (
      dataModules.some(
        (entry) =>
          !entry.readEnabled ||
          !entry.writeEnabled ||
          entry.validFrom !== null ||
          entry.validUntil !== null,
      ) ||
      modules.some(
        (entry) =>
          !EXTERNAL_WORKER_OUTBOUND_MODULES.includes(entry.module) &&
          entry.outboundEnabled,
      )
    ) {
      throw new ConflictException(
        'External tenant entitlements exceed the worker scope',
      );
    }
    if (action === 'ACTIVATE_LIVE') {
      if (
        tenant.customerStage !== TenantCustomerStage.PILOT ||
        !tenant.trialStartsAt ||
        !tenant.trialEndsAt ||
        required.some((entry) => entry.outboundEnabled)
      ) {
        throw new ConflictException(
          'External tenant LIVE activation preimage changed',
        );
      }
    } else if (
      tenant.customerStage !== TenantCustomerStage.LIVE ||
      !required.some((entry) => entry.outboundEnabled)
    ) {
      throw new ConflictException(
        'External tenant outbound revoke preimage changed',
      );
    }
    return {
      contract: CONTRACT,
      action,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      sourceId: snapshot.source.id,
      storeId: snapshot.store.id,
      domain: EZ_GAME_WORKER_SCOPE.domain,
      clubId: EZ_GAME_WORKER_SCOPE.clubId,
      preimageSha256: this.digest(snapshot),
      profileRevisionBefore: tenant.entitlementProfileRevision,
      profileRevisionAfter: tenant.entitlementProfileRevision + 1,
      executionRevisionBefore: tenant.executionRevision,
      executionRevisionAfter: tenant.executionRevision + 1,
      storeRevision: snapshot.store.executionRevision,
      customerStageBefore: tenant.customerStage,
      customerStageAfter: TenantCustomerStage.LIVE,
      outboundModules:
        action === 'ACTIVATE_LIVE' ? EXTERNAL_WORKER_OUTBOUND_MODULES : [],
      otherModulesOutbound: false,
      storeBackgroundExecutionChanged: false,
      trialWindowCleared: action === 'ACTIVATE_LIVE',
    };
  }

  private assertActor(actor: AuthenticatedUser) {
    if (!actor?.id || !actor.isPlatformAdmin || actor.isActive === false) {
      throw new ForbiddenException('Active platform administrator required');
    }
  }

  private parseAction(input: unknown): Action {
    if (input !== ACTIONS[0] && input !== ACTIONS[1]) {
      throw new BadRequestException(
        'Unsupported external worker tenant action',
      );
    }
    return input;
  }

  private digest(value: unknown): string {
    return createHash('sha256')
      .update(`${JSON.stringify(value, null, 2)}\n`)
      .digest('hex');
  }

  private assertApproval(
    input: unknown,
    expected: Pick<
      ExternalTenantApprovalStatement,
      'tenantId' | 'action' | 'planSha256' | 'requestId' | 'reasonSha256'
    >,
  ) {
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input).sort().join(',') !==
        [
          'contract',
          'tenantId',
          'action',
          'planSha256',
          'requestId',
          'reasonSha256',
          'issuedAt',
          'expiresAt',
          'signature',
        ]
          .sort()
          .join(',')
    ) {
      throw new ForbiddenException('Exact detached tenant approval required');
    }
    const value = input as Record<string, unknown>;
    if (
      value.contract !== EXTERNAL_TENANT_APPROVAL_CONTRACT ||
      value.tenantId !== expected.tenantId ||
      value.action !== expected.action ||
      value.planSha256 !== expected.planSha256 ||
      value.requestId !== expected.requestId ||
      value.reasonSha256 !== expected.reasonSha256 ||
      typeof value.issuedAt !== 'string' ||
      typeof value.expiresAt !== 'string' ||
      !UTC_ISO.test(value.issuedAt) ||
      !UTC_ISO.test(value.expiresAt) ||
      typeof value.signature !== 'string' ||
      !/^[A-Za-z0-9+/]{86}==$/.test(value.signature)
    ) {
      throw new ForbiddenException('Detached tenant approval identity drift');
    }
    const issued = Date.parse(value.issuedAt);
    const expires = Date.parse(value.expiresAt);
    const now = Date.now();
    if (
      !Number.isFinite(issued) ||
      !Number.isFinite(expires) ||
      issued > now + 30_000 ||
      expires <= now ||
      expires <= issued ||
      expires - issued > 30 * 60_000
    ) {
      throw new ForbiddenException(
        'Detached tenant approval expired or unbounded',
      );
    }
    const publicKeyText = this.config.get<string>(
      'LANGAME_EXTERNAL_TENANT_APPROVAL_PUBLIC_KEY_SPKI_B64',
    );
    if (!publicKeyText) {
      throw new ServiceUnavailableException(
        'External tenant approval root is not configured',
      );
    }
    const publicKey = Buffer.from(publicKeyText, 'base64');
    if (
      publicKey.length !== 44 ||
      publicKey.toString('base64') !== publicKeyText
    ) {
      throw new ServiceUnavailableException(
        'External tenant approval root is invalid',
      );
    }
    const statement: ExternalTenantApprovalStatement = {
      contract: EXTERNAL_TENANT_APPROVAL_CONTRACT,
      tenantId: expected.tenantId,
      action: expected.action,
      planSha256: expected.planSha256,
      requestId: expected.requestId,
      reasonSha256: expected.reasonSha256,
      issuedAt: value.issuedAt,
      expiresAt: value.expiresAt,
    };
    let valid = false;
    try {
      valid = verify(
        null,
        Buffer.from(`${JSON.stringify(statement, null, 2)}\n`),
        { key: publicKey, format: 'der', type: 'spki' },
        Buffer.from(value.signature, 'base64'),
      );
    } catch {
      valid = false;
    }
    if (!valid) {
      throw new ForbiddenException(
        'Detached tenant approval signature is invalid',
      );
    }
    return {
      approvalSha256: this.digest({
        ...statement,
        signature: value.signature,
      }),
      approvalRootSha256: createHash('sha256').update(publicKey).digest('hex'),
      expiresAt: value.expiresAt,
    };
  }
}
