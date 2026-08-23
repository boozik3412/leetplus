import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHmac, randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth.types';
import { isProductionConfig } from '../config/environment-validation';
import { PrismaService } from '../prisma/prisma.service';
import { FreshStoreScopeService } from '../tenancy/fresh-store-scope.service';
import { LangameClient } from './langame.client';
import { SecretEncryptionService } from './secret-encryption.service';

const STAGED_ONBOARDING_ENABLED_ENV =
  'LANGAME_STAGED_ONBOARDING_FOUNDATION_ENABLED';
const STAGED_ONBOARDING_HMAC_ENV = 'LANGAME_STAGED_ONBOARDING_HMAC_SECRET';
const STAGED_ONBOARDING_ACTIVATION_ENABLED_ENV =
  'LANGAME_STAGED_ONBOARDING_ACTIVATION_CURRENT188_ENABLED';
const STAGED_ONBOARDING_STATUS_ENABLED_ENV =
  'LANGAME_STAGED_ONBOARDING_STATUS_CURRENT188_ENABLED';
const STAGED_ONBOARDING_RECONCILE_ENABLED_ENV =
  'LANGAME_STAGED_ONBOARDING_RECONCILE_CURRENT188_ENABLED';
const STAGED_ONBOARDING_DIAGNOSTIC_TIMEOUT_MS = 5_000;
const CURRENT188_STAGE_CONTRACT =
  'LANGAME_ONBOARDING_STAGED_RECEIPT_CURRENT188_V1';
const LANGAME_DOMAIN_SUFFIXES = ['.langame.ru', '.langamepro.ru'] as const;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const EXTERNAL_CLUB_ID_PATTERN = /^[1-9][0-9]{0,18}$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

export type LangameOnboardingStagedPreviewDto = {
  requestId?: string;
  apiKey?: string;
  domain?: string;
  storeId?: string;
  externalClubId?: string;
};

export type LangameOnboardingActivationDto = {
  receiptId?: string;
  requestId?: string;
  configDigest?: string;
  storeId?: string;
  domain?: string;
  externalClubId?: string;
};

export type LangameOnboardingStatusDto = {
  storeId?: string;
};

export type LangameOnboardingReconciliationDto = LangameOnboardingActivationDto;

type StageReceiptRow = {
  receiptId: string;
  status: string;
  expiresAt: Date | string;
  bindingDigest: string;
  replayed: boolean;
};

type ActivationReceiptRow = {
  receiptId: string;
  status: 'ACTIVATED' | 'REPLAYED';
  consumedAt: Date | string;
  claimDigest: string;
  replayed: boolean;
};

type StatusReceiptRow = {
  receiptId: string;
  status: 'PENDING' | 'CONSUMED' | 'EXPIRED';
  expiresAt: Date;
  consumedAt: Date | null;
  configDigest: string;
  bindingDigest: string;
  externalDomain: string | null;
  externalClubId: string | null;
  claimDigest: string | null;
  activatedAt: Date | null;
};

type ReconciliationReceiptRow = {
  receiptId: string;
  status: 'PENDING' | 'CONSUMED' | 'EXPIRED';
  expiresAt: Date;
  consumedAt: Date | null;
  configDigest: string;
  bindingDigest: string;
  activationRequestId: string | null;
  activationRequestDigest: string | null;
  claimId: string | null;
  resolvedClaimId: string | null;
  externalDomain: string | null;
  externalClubId: string | null;
  claimDigest: string | null;
  activatedAt: Date | null;
  storeExternalProvider: string | null;
  storeExternalDomain: string | null;
  storeExternalClubId: string | null;
  storeIntegrationSourceId: string | null;
  sourceId: string | null;
  sourceProvider: string | null;
  sourceDomain: string | null;
  sourceBaseUrl: string | null;
  sourceIsActive: boolean | null;
  credentialId: string | null;
  credentialProvider: string | null;
  credentialIsActive: boolean | null;
  auditId: string | null;
  auditRequestDigest: string | null;
  auditConfigDigest: string | null;
  auditBindingDigest: string | null;
  auditClaimDigest: string | null;
  auditEventAt: Date | null;
};

@Injectable()
export class LangameOnboardingStagedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly freshStoreScopeService: FreshStoreScopeService,
    private readonly configService: ConfigService,
    private readonly langameClient: LangameClient,
    private readonly secretEncryptionService: SecretEncryptionService,
  ) {}

  async preview(
    user: AuthenticatedUser,
    dto: LangameOnboardingStagedPreviewDto,
  ) {
    const scope = await this.freshStoreScopeService.assertNetwork(user);
    const hmacSecret = this.requireFoundationConfiguration();
    const requestId = this.requiredRequestId(dto.requestId);
    const apiKey = this.requiredText(dto.apiKey, 'Langame API key', 4_096);
    const domain = this.normalizeLangameDomain(dto.domain);
    const storeId = this.requiredText(dto.storeId, 'Store id', 128);
    const externalClubId = this.requiredExternalClubId(dto.externalClubId);

    const store = await this.prisma.store.findFirst({
      where: {
        id: storeId,
        tenantId: scope.tenantId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!store) {
      throw new BadRequestException('Selected store is unavailable');
    }

    let payload: unknown;
    try {
      payload = await this.langameClient.getDiagnosticEndpoint(
        `https://${domain}/public_api`,
        apiKey,
        '/clubs/list',
        {},
        { timeoutMs: STAGED_ONBOARDING_DIAGNOSTIC_TIMEOUT_MS },
      );
    } catch {
      throw new BadRequestException('Langame onboarding diagnostic failed');
    }

    const exactMatches = this.extractRows(payload).filter(
      (row) => this.scalarIdentifier(row.id) === externalClubId,
    );
    if (exactMatches.length !== 1 || !this.isActiveClub(exactMatches[0])) {
      throw new BadRequestException(
        'Selected Langame club was not confirmed by the diagnostic',
      );
    }

    const credentialDigest = this.hmacDigest(hmacSecret, [
      CURRENT188_STAGE_CONTRACT,
      'CREDENTIAL',
      scope.tenantId,
      apiKey,
    ]);
    const configDigest = this.hmacDigest(hmacSecret, [
      CURRENT188_STAGE_CONTRACT,
      'CONFIG',
      scope.tenantId,
      scope.userId,
      requestId,
      storeId,
      domain,
      externalClubId,
      credentialDigest,
    ]);
    const requestDigest = this.hmacDigest(hmacSecret, [
      CURRENT188_STAGE_CONTRACT,
      'REQUEST',
      scope.tenantId,
      scope.userId,
      requestId,
      configDigest,
    ]);
    const actorDigest = this.hmacDigest(hmacSecret, [
      CURRENT188_STAGE_CONTRACT,
      'ACTOR',
      scope.tenantId,
      scope.userId,
    ]);
    const bindingDigest = this.hmacDigest(hmacSecret, [
      CURRENT188_STAGE_CONTRACT,
      'BINDING',
      scope.tenantId,
      storeId,
      domain,
      externalClubId,
      configDigest,
    ]);
    const stagedApiKeyEncrypted = this.secretEncryptionService.encrypt(apiKey);
    const proposedReceiptId = randomUUID();

    let rows: unknown;
    try {
      rows = await this.prisma.$queryRaw(
        Prisma.sql`
          SELECT *
          FROM public.langame_onboarding_stage_receipt_current188_v1(
            ${proposedReceiptId},
            ${scope.tenantId},
            ${scope.userId},
            ${actorDigest},
            ${requestId},
            ${requestDigest},
            ${configDigest},
            ${credentialDigest},
            ${bindingDigest},
            ${storeId},
            ${domain},
            ${externalClubId},
            ${stagedApiKeyEncrypted}
          )
        `,
      );
    } catch {
      throw new ServiceUnavailableException(
        'Staged Langame onboarding foundation is unavailable',
      );
    }

    const receipt = this.parseStageReceipt(rows);
    if (receipt.bindingDigest !== bindingDigest) {
      throw new ServiceUnavailableException(
        'Invalid staged Langame onboarding receipt',
      );
    }

    return {
      contractVersion: CURRENT188_STAGE_CONTRACT,
      receiptId: receipt.receiptId,
      status: receipt.status,
      expiresAt: new Date(receipt.expiresAt).toISOString(),
      configDigest,
      bindingDigest: receipt.bindingDigest,
      replayed: receipt.replayed,
      activationAvailable: false,
      externalSyncStarted: false,
    };
  }

  async activate(user: AuthenticatedUser, dto: LangameOnboardingActivationDto) {
    const scope = await this.freshStoreScopeService.assertNetwork(user);
    const hmacSecret = this.requireFoundationConfiguration();
    this.requireActivationConfiguration();

    const receiptId = this.requiredText(dto.receiptId, 'Receipt id', 128);
    const requestId = this.requiredRequestId(dto.requestId);
    const configDigest = this.requiredDigest(dto.configDigest, 'Config digest');
    const storeId = this.requiredText(dto.storeId, 'Store id', 128);
    const domain = this.normalizeLangameDomain(dto.domain);
    const externalClubId = this.requiredExternalClubId(dto.externalClubId);
    const bindingDigest = this.hmacDigest(hmacSecret, [
      CURRENT188_STAGE_CONTRACT,
      'BINDING',
      scope.tenantId,
      storeId,
      domain,
      externalClubId,
      configDigest,
    ]);
    const activationRequestDigest = this.hmacDigest(hmacSecret, [
      CURRENT188_STAGE_CONTRACT,
      'ACTIVATE',
      scope.tenantId,
      scope.userId,
      receiptId,
      requestId,
      configDigest,
      bindingDigest,
      storeId,
      domain,
      externalClubId,
    ]);

    let rows: unknown;
    try {
      rows = await this.prisma.$queryRaw(
        Prisma.sql`
          SELECT *
          FROM public.langame_onboarding_activate_current188_v1(
            ${scope.tenantId},
            ${scope.userId},
            ${receiptId},
            ${requestId},
            ${activationRequestDigest},
            ${configDigest},
            ${bindingDigest},
            ${storeId},
            ${domain},
            ${externalClubId}
          )
        `,
      );
    } catch {
      throw new ServiceUnavailableException(
        'Staged Langame onboarding activation is unavailable',
      );
    }

    const receipt = this.parseActivationReceipt(rows);
    if (
      receipt.receiptId !== receiptId ||
      receipt.claimDigest !== bindingDigest ||
      receipt.replayed !== (receipt.status === 'REPLAYED')
    ) {
      throw new ServiceUnavailableException(
        'Invalid staged Langame onboarding activation receipt',
      );
    }

    return {
      contractVersion: CURRENT188_STAGE_CONTRACT,
      receiptId: receipt.receiptId,
      status: receipt.status,
      consumedAt: new Date(receipt.consumedAt).toISOString(),
      claimDigest: receipt.claimDigest,
      replayed: receipt.replayed,
      externalSyncStarted: false,
      initialReadOnlySyncAvailable: false,
      productionActivationAllowed: false,
    } as const;
  }

  async status(user: AuthenticatedUser, dto: LangameOnboardingStatusDto) {
    const scope = await this.freshStoreScopeService.assertNetwork(user);
    this.requireStatusConfiguration();
    const storeId = this.requiredText(dto.storeId, 'Store id', 128);

    const store = await this.prisma.store.findFirst({
      where: {
        id: storeId,
        tenantId: scope.tenantId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!store) {
      throw new BadRequestException('Selected store is unavailable');
    }

    let rows: unknown;
    try {
      rows = await this.prisma.$queryRaw(
        Prisma.sql`
          SELECT
            receipt."id" AS "receiptId",
            receipt."status" AS "status",
            receipt."expiresAt" AS "expiresAt",
            receipt."consumedAt" AS "consumedAt",
            receipt."configDigest" AS "configDigest",
            receipt."bindingDigest" AS "bindingDigest",
            claim."externalDomain" AS "externalDomain",
            claim."externalClubId" AS "externalClubId",
            claim."claimDigest" AS "claimDigest",
            claim."activatedAt" AS "activatedAt"
          FROM public."LangameOnboardingStagedReceiptV1" AS receipt
          LEFT JOIN public."LangameExternalClubClaimV1" AS claim
            ON claim."receiptId" = receipt."id"
           AND claim."tenantId" = receipt."tenantId"
           AND claim."storeId" = receipt."storeId"
          WHERE receipt."tenantId" = ${scope.tenantId}
            AND receipt."storeId" = ${storeId}
          ORDER BY
            CASE WHEN claim."id" IS NULL THEN 1 ELSE 0 END,
            receipt."createdAt" DESC,
            receipt."id" DESC
          LIMIT 1
        `,
      );
    } catch {
      throw new ServiceUnavailableException(
        'Staged Langame onboarding status is unavailable',
      );
    }

    const receipt = this.parseStatusReceipt(rows);
    if (!receipt) {
      return {
        contractVersion: CURRENT188_STAGE_CONTRACT,
        storeId,
        status: 'NOT_CONFIGURED',
        receiptId: null,
        expiresAt: null,
        consumedAt: null,
        configDigest: null,
        bindingDigest: null,
        externalDomain: null,
        externalClubId: null,
        claimDigest: null,
        activatedAt: null,
        activationAvailable: false,
        reconciliationAvailable: false,
        initialReadOnlySyncAvailable: false,
        productionStatusAllowed: false,
      } as const;
    }

    const activated = receipt.status === 'CONSUMED';
    const effectiveStatus = activated
      ? ('ACTIVATED' as const)
      : receipt.status === 'EXPIRED' ||
          receipt.expiresAt.getTime() <= Date.now()
        ? ('EXPIRED' as const)
        : ('PENDING' as const);
    return {
      contractVersion: CURRENT188_STAGE_CONTRACT,
      storeId,
      status: effectiveStatus,
      receiptId: receipt.receiptId,
      expiresAt: receipt.expiresAt.toISOString(),
      consumedAt: receipt.consumedAt?.toISOString() ?? null,
      configDigest: receipt.configDigest,
      bindingDigest: receipt.bindingDigest,
      externalDomain: receipt.externalDomain,
      externalClubId: receipt.externalClubId,
      claimDigest: receipt.claimDigest,
      activatedAt: receipt.activatedAt?.toISOString() ?? null,
      activationAvailable: effectiveStatus === 'PENDING',
      reconciliationAvailable: false,
      initialReadOnlySyncAvailable: false,
      productionStatusAllowed: false,
    } as const;
  }

  async reconcile(
    user: AuthenticatedUser,
    dto: LangameOnboardingReconciliationDto,
  ) {
    const scope = await this.freshStoreScopeService.assertNetwork(user);
    this.requireReconciliationConfiguration();
    const hmacSecret = this.requireFoundationConfiguration();
    const receiptId = this.requiredText(dto.receiptId, 'Receipt id', 128);
    const requestId = this.requiredRequestId(dto.requestId);
    const configDigest = this.requiredDigest(dto.configDigest, 'Config digest');
    const storeId = this.requiredText(dto.storeId, 'Store id', 128);
    const domain = this.normalizeLangameDomain(dto.domain);
    const externalClubId = this.requiredExternalClubId(dto.externalClubId);
    const bindingDigest = this.hmacDigest(hmacSecret, [
      CURRENT188_STAGE_CONTRACT,
      'BINDING',
      scope.tenantId,
      storeId,
      domain,
      externalClubId,
      configDigest,
    ]);
    const activationRequestDigest = this.hmacDigest(hmacSecret, [
      CURRENT188_STAGE_CONTRACT,
      'ACTIVATE',
      scope.tenantId,
      scope.userId,
      receiptId,
      requestId,
      configDigest,
      bindingDigest,
      storeId,
      domain,
      externalClubId,
    ]);

    const store = await this.prisma.store.findFirst({
      where: { id: storeId, tenantId: scope.tenantId, isActive: true },
      select: { id: true },
    });
    if (!store) {
      throw new BadRequestException('Selected store is unavailable');
    }

    let rows: unknown;
    try {
      rows = await this.prisma.$queryRaw(
        Prisma.sql`
          SELECT
            receipt."id" AS "receiptId",
            receipt."status" AS "status",
            receipt."expiresAt" AS "expiresAt",
            receipt."consumedAt" AS "consumedAt",
            receipt."configDigest" AS "configDigest",
            receipt."bindingDigest" AS "bindingDigest",
            receipt."activationRequestId" AS "activationRequestId",
            receipt."activationRequestDigest" AS "activationRequestDigest",
            receipt."claimId" AS "claimId",
            claim."id" AS "resolvedClaimId",
            claim."externalDomain" AS "externalDomain",
            claim."externalClubId" AS "externalClubId",
            claim."claimDigest" AS "claimDigest",
            claim."activatedAt" AS "activatedAt",
            store."externalProvider"::TEXT AS "storeExternalProvider",
            store."externalDomain" AS "storeExternalDomain",
            store."externalClubId" AS "storeExternalClubId",
            store."integrationSourceId" AS "storeIntegrationSourceId",
            source."id" AS "sourceId",
            source."provider"::TEXT AS "sourceProvider",
            source."domain" AS "sourceDomain",
            source."baseUrl" AS "sourceBaseUrl",
            source."isActive" AS "sourceIsActive",
            credential."id" AS "credentialId",
            credential."provider"::TEXT AS "credentialProvider",
            credential."isActive" AS "credentialIsActive",
            audit."id" AS "auditId",
            audit."requestDigest" AS "auditRequestDigest",
            audit."configDigest" AS "auditConfigDigest",
            audit."bindingDigest" AS "auditBindingDigest",
            audit."claimDigest" AS "auditClaimDigest",
            audit."eventAt" AS "auditEventAt"
          FROM public."LangameOnboardingStagedReceiptV1" AS receipt
          INNER JOIN public."Store" AS store
            ON store."tenantId" = receipt."tenantId"
           AND store."id" = receipt."storeId"
           AND store."isActive" = TRUE
          LEFT JOIN public."LangameExternalClubClaimV1" AS claim
            ON claim."id" = receipt."claimId"
           AND claim."tenantId" = receipt."tenantId"
           AND claim."storeId" = receipt."storeId"
           AND claim."receiptId" = receipt."id"
          LEFT JOIN public."IntegrationSource" AS source
            ON source."tenantId" = store."tenantId"
           AND source."id" = store."integrationSourceId"
          LEFT JOIN public."IntegrationCredential" AS credential
            ON credential."tenantId" = source."tenantId"
           AND credential."id" = source."credentialId"
          LEFT JOIN public."LangameOnboardingAuditEventV1" AS audit
            ON audit."tenantId" = receipt."tenantId"
           AND audit."receiptId" = receipt."id"
           AND audit."eventType" = 'ACTIVATED'
          WHERE receipt."tenantId" = ${scope.tenantId}
            AND receipt."actorUserId" = ${scope.userId}
            AND receipt."id" = ${receiptId}
            AND receipt."storeId" = ${storeId}
          LIMIT 2
        `,
      );
    } catch {
      throw new ServiceUnavailableException(
        'Staged Langame onboarding reconciliation is unavailable',
      );
    }

    const receipt = this.parseReconciliationReceipt(rows);
    const baseBound =
      receipt.receiptId === receiptId &&
      receipt.configDigest === configDigest &&
      receipt.bindingDigest === bindingDigest;
    if (!baseBound) {
      throw new ServiceUnavailableException(
        'Invalid staged Langame onboarding reconciliation receipt',
      );
    }

    if (receipt.status !== 'CONSUMED') {
      const noActivationEvidence =
        receipt.consumedAt === null &&
        receipt.activationRequestId === null &&
        receipt.activationRequestDigest === null &&
        receipt.claimId === null &&
        receipt.resolvedClaimId === null &&
        receipt.auditId === null;
      if (!noActivationEvidence) {
        throw new ServiceUnavailableException(
          'Invalid staged Langame onboarding reconciliation receipt',
        );
      }
      const expired =
        receipt.status === 'EXPIRED' ||
        receipt.expiresAt.getTime() <= Date.now();
      return {
        contractVersion: CURRENT188_STAGE_CONTRACT,
        receiptId,
        storeId,
        outcome: expired ? ('EXPIRED' as const) : ('NOT_APPLIED' as const),
        consumedAt: null,
        claimDigest: null,
        retryActivationAllowed: !expired,
        externalSyncStarted: false,
        initialReadOnlySyncAvailable: false,
        productionReconciliationAllowed: false,
      } as const;
    }

    const activationBound =
      receipt.consumedAt !== null &&
      receipt.activationRequestId === requestId &&
      receipt.activationRequestDigest === activationRequestDigest &&
      receipt.claimId !== null &&
      receipt.claimId === receipt.resolvedClaimId &&
      receipt.externalDomain === domain &&
      receipt.externalClubId === externalClubId &&
      receipt.claimDigest === bindingDigest &&
      receipt.activatedAt?.getTime() === receipt.consumedAt.getTime() &&
      receipt.storeExternalProvider === 'LANGAME' &&
      receipt.storeExternalDomain === domain &&
      receipt.storeExternalClubId === externalClubId &&
      receipt.storeIntegrationSourceId !== null &&
      receipt.storeIntegrationSourceId === receipt.sourceId &&
      receipt.sourceProvider === 'LANGAME' &&
      receipt.sourceDomain === domain &&
      receipt.sourceBaseUrl === `https://${domain}/public_api` &&
      receipt.sourceIsActive === true &&
      receipt.credentialId !== null &&
      receipt.credentialProvider === 'LANGAME' &&
      receipt.credentialIsActive === true &&
      receipt.auditId !== null &&
      receipt.auditRequestDigest === activationRequestDigest &&
      receipt.auditConfigDigest === configDigest &&
      receipt.auditBindingDigest === bindingDigest &&
      receipt.auditClaimDigest === bindingDigest &&
      receipt.auditEventAt?.getTime() === receipt.consumedAt.getTime();
    if (!activationBound || receipt.consumedAt === null) {
      throw new ServiceUnavailableException(
        'Invalid staged Langame onboarding reconciliation receipt',
      );
    }

    return {
      contractVersion: CURRENT188_STAGE_CONTRACT,
      receiptId,
      storeId,
      outcome: 'ACTIVATED' as const,
      consumedAt: receipt.consumedAt.toISOString(),
      claimDigest: bindingDigest,
      retryActivationAllowed: false,
      externalSyncStarted: false,
      initialReadOnlySyncAvailable: false,
      productionReconciliationAllowed: false,
    } as const;
  }

  private requireActivationConfiguration() {
    if (isProductionConfig(this.configService)) {
      throw new ServiceUnavailableException(
        'CURRENT188 activation is not production-authorized',
      );
    }
    if (
      this.configService
        .get<string>(STAGED_ONBOARDING_ACTIVATION_ENABLED_ENV)
        ?.trim() !== 'true'
    ) {
      throw new ServiceUnavailableException(
        'CURRENT188 activation adapter is disabled',
      );
    }
  }

  private requireStatusConfiguration() {
    if (isProductionConfig(this.configService)) {
      throw new ServiceUnavailableException(
        'CURRENT188 status is not production-authorized',
      );
    }
    if (
      this.configService
        .get<string>(STAGED_ONBOARDING_STATUS_ENABLED_ENV)
        ?.trim() !== 'true'
    ) {
      throw new ServiceUnavailableException(
        'CURRENT188 status adapter is disabled',
      );
    }
  }

  private requireReconciliationConfiguration() {
    if (isProductionConfig(this.configService)) {
      throw new ServiceUnavailableException(
        'CURRENT188 reconciliation is not production-authorized',
      );
    }
    if (
      this.configService
        .get<string>(STAGED_ONBOARDING_RECONCILE_ENABLED_ENV)
        ?.trim() !== 'true'
    ) {
      throw new ServiceUnavailableException(
        'CURRENT188 reconciliation adapter is disabled',
      );
    }
  }

  private requireFoundationConfiguration() {
    if (
      this.configService.get<string>(STAGED_ONBOARDING_ENABLED_ENV)?.trim() !==
      'true'
    ) {
      throw new ServiceUnavailableException(
        'Staged Langame onboarding foundation is disabled',
      );
    }

    const secret = this.configService
      .get<string>(STAGED_ONBOARDING_HMAC_ENV)
      ?.trim();
    if (!secret || secret.length < 32) {
      throw new ServiceUnavailableException(
        'Staged Langame onboarding foundation is unavailable',
      );
    }

    return secret;
  }

  private parseStageReceipt(value: unknown): StageReceiptRow {
    if (!Array.isArray(value) || value.length !== 1) {
      throw new ServiceUnavailableException(
        'Invalid staged Langame onboarding receipt',
      );
    }

    const row: unknown = value[0];
    if (!this.isPlainObject(row)) {
      throw new ServiceUnavailableException(
        'Invalid staged Langame onboarding receipt',
      );
    }

    const expectedKeys = [
      'bindingDigest',
      'expiresAt',
      'receiptId',
      'replayed',
      'status',
    ];
    if (Object.keys(row).sort().join('|') !== expectedKeys.join('|')) {
      throw new ServiceUnavailableException(
        'Invalid staged Langame onboarding receipt',
      );
    }

    const expiresAt = row.expiresAt;
    const expiresAtDate =
      expiresAt instanceof Date ? expiresAt : new Date(String(expiresAt));
    if (
      typeof row.receiptId !== 'string' ||
      row.status !== 'PENDING' ||
      typeof row.bindingDigest !== 'string' ||
      !DIGEST_PATTERN.test(row.bindingDigest) ||
      typeof row.replayed !== 'boolean' ||
      Number.isNaN(expiresAtDate.getTime())
    ) {
      throw new ServiceUnavailableException(
        'Invalid staged Langame onboarding receipt',
      );
    }

    return {
      receiptId: row.receiptId,
      status: row.status,
      expiresAt: expiresAtDate,
      bindingDigest: row.bindingDigest,
      replayed: row.replayed,
    };
  }

  private parseActivationReceipt(value: unknown): ActivationReceiptRow {
    if (!Array.isArray(value) || value.length !== 1) {
      throw new ServiceUnavailableException(
        'Invalid staged Langame onboarding activation receipt',
      );
    }
    const row: unknown = value[0];
    if (!this.isPlainObject(row)) {
      throw new ServiceUnavailableException(
        'Invalid staged Langame onboarding activation receipt',
      );
    }
    const expectedKeys = [
      'claimDigest',
      'consumedAt',
      'receiptId',
      'replayed',
      'status',
    ];
    const consumedAt =
      row.consumedAt instanceof Date
        ? row.consumedAt
        : new Date(String(row.consumedAt));
    if (
      Object.keys(row).sort().join('|') !== expectedKeys.join('|') ||
      typeof row.receiptId !== 'string' ||
      (row.status !== 'ACTIVATED' && row.status !== 'REPLAYED') ||
      typeof row.claimDigest !== 'string' ||
      !DIGEST_PATTERN.test(row.claimDigest) ||
      typeof row.replayed !== 'boolean' ||
      Number.isNaN(consumedAt.getTime())
    ) {
      throw new ServiceUnavailableException(
        'Invalid staged Langame onboarding activation receipt',
      );
    }
    return {
      receiptId: row.receiptId,
      status: row.status,
      consumedAt,
      claimDigest: row.claimDigest,
      replayed: row.replayed,
    };
  }

  private parseStatusReceipt(value: unknown): StatusReceiptRow | null {
    if (!Array.isArray(value) || value.length > 1) {
      throw new ServiceUnavailableException(
        'Invalid staged Langame onboarding status receipt',
      );
    }
    if (value.length === 0) return null;

    const row: unknown = value[0];
    const expectedKeys = [
      'activatedAt',
      'bindingDigest',
      'claimDigest',
      'configDigest',
      'consumedAt',
      'expiresAt',
      'externalClubId',
      'externalDomain',
      'receiptId',
      'status',
    ];
    if (
      !this.isPlainObject(row) ||
      Object.keys(row).sort().join('|') !== expectedKeys.join('|')
    ) {
      throw new ServiceUnavailableException(
        'Invalid staged Langame onboarding status receipt',
      );
    }

    const expiresAt = this.optionalDate(row.expiresAt);
    const consumedAt = this.optionalDate(row.consumedAt);
    const activatedAt = this.optionalDate(row.activatedAt);
    const receiptId = typeof row.receiptId === 'string' ? row.receiptId : null;
    const status =
      row.status === 'PENDING' ||
      row.status === 'CONSUMED' ||
      row.status === 'EXPIRED'
        ? row.status
        : null;
    const configDigest =
      typeof row.configDigest === 'string' ? row.configDigest : null;
    const bindingDigest =
      typeof row.bindingDigest === 'string' ? row.bindingDigest : null;
    const externalDomain =
      typeof row.externalDomain === 'string' ? row.externalDomain : null;
    const externalClubId =
      typeof row.externalClubId === 'string' ? row.externalClubId : null;
    const claimDigest =
      typeof row.claimDigest === 'string' ? row.claimDigest : null;
    const baseValid =
      receiptId !== null &&
      receiptId.length > 0 &&
      receiptId.length <= 128 &&
      status !== null &&
      expiresAt !== null &&
      configDigest !== null &&
      DIGEST_PATTERN.test(configDigest) &&
      bindingDigest !== null &&
      DIGEST_PATTERN.test(bindingDigest);
    const hasNoClaim =
      row.externalDomain === null &&
      row.externalClubId === null &&
      row.claimDigest === null &&
      activatedAt === null;
    const hasExactClaim =
      externalDomain !== null &&
      this.isNormalizedLangameDomain(externalDomain) &&
      externalClubId !== null &&
      EXTERNAL_CLUB_ID_PATTERN.test(externalClubId) &&
      claimDigest !== null &&
      DIGEST_PATTERN.test(claimDigest) &&
      claimDigest === bindingDigest &&
      consumedAt !== null &&
      activatedAt !== null &&
      activatedAt.getTime() === consumedAt.getTime();
    if (
      !baseValid ||
      (status === 'CONSUMED'
        ? !hasExactClaim
        : consumedAt !== null || !hasNoClaim)
    ) {
      throw new ServiceUnavailableException(
        'Invalid staged Langame onboarding status receipt',
      );
    }

    return {
      receiptId,
      status,
      expiresAt,
      consumedAt,
      configDigest,
      bindingDigest,
      externalDomain,
      externalClubId,
      claimDigest,
      activatedAt,
    };
  }

  private parseReconciliationReceipt(value: unknown): ReconciliationReceiptRow {
    if (!Array.isArray(value) || value.length !== 1) {
      throw new ServiceUnavailableException(
        'Invalid staged Langame onboarding reconciliation receipt',
      );
    }
    const row: unknown = value[0];
    const expectedKeys = [
      'activatedAt',
      'activationRequestDigest',
      'activationRequestId',
      'auditBindingDigest',
      'auditClaimDigest',
      'auditConfigDigest',
      'auditEventAt',
      'auditId',
      'auditRequestDigest',
      'bindingDigest',
      'claimDigest',
      'claimId',
      'configDigest',
      'consumedAt',
      'credentialId',
      'credentialIsActive',
      'credentialProvider',
      'expiresAt',
      'externalClubId',
      'externalDomain',
      'receiptId',
      'resolvedClaimId',
      'sourceBaseUrl',
      'sourceDomain',
      'sourceId',
      'sourceIsActive',
      'sourceProvider',
      'status',
      'storeExternalClubId',
      'storeExternalDomain',
      'storeExternalProvider',
      'storeIntegrationSourceId',
    ];
    if (
      !this.isPlainObject(row) ||
      Object.keys(row).sort().join('|') !== expectedKeys.join('|')
    ) {
      throw new ServiceUnavailableException(
        'Invalid staged Langame onboarding reconciliation receipt',
      );
    }

    const status =
      row.status === 'PENDING' ||
      row.status === 'CONSUMED' ||
      row.status === 'EXPIRED'
        ? row.status
        : null;
    const expiresAt = this.optionalDate(row.expiresAt);
    const consumedAt = this.optionalDate(row.consumedAt);
    const activatedAt = this.optionalDate(row.activatedAt);
    const auditEventAt = this.optionalDate(row.auditEventAt);
    if (
      typeof row.receiptId !== 'string' ||
      row.receiptId.length < 1 ||
      row.receiptId.length > 128 ||
      status === null ||
      expiresAt === null ||
      typeof row.configDigest !== 'string' ||
      !DIGEST_PATTERN.test(row.configDigest) ||
      typeof row.bindingDigest !== 'string' ||
      !DIGEST_PATTERN.test(row.bindingDigest) ||
      !this.isNullableText(row.activationRequestId, 128) ||
      !this.isNullableDigest(row.activationRequestDigest) ||
      !this.isNullableText(row.claimId, 128) ||
      !this.isNullableText(row.resolvedClaimId, 128) ||
      !this.isNullableText(row.externalDomain, 253) ||
      !this.isNullableText(row.externalClubId, 19) ||
      !this.isNullableDigest(row.claimDigest) ||
      !this.isNullableText(row.storeExternalProvider, 32) ||
      !this.isNullableText(row.storeExternalDomain, 253) ||
      !this.isNullableText(row.storeExternalClubId, 19) ||
      !this.isNullableText(row.storeIntegrationSourceId, 128) ||
      !this.isNullableText(row.sourceId, 128) ||
      !this.isNullableText(row.sourceProvider, 32) ||
      !this.isNullableText(row.sourceDomain, 253) ||
      !this.isNullableText(row.sourceBaseUrl, 512) ||
      !this.isNullableBoolean(row.sourceIsActive) ||
      !this.isNullableText(row.credentialId, 128) ||
      !this.isNullableText(row.credentialProvider, 32) ||
      !this.isNullableBoolean(row.credentialIsActive) ||
      !this.isNullableText(row.auditId, 128) ||
      !this.isNullableDigest(row.auditRequestDigest) ||
      !this.isNullableDigest(row.auditConfigDigest) ||
      !this.isNullableDigest(row.auditBindingDigest) ||
      !this.isNullableDigest(row.auditClaimDigest)
    ) {
      throw new ServiceUnavailableException(
        'Invalid staged Langame onboarding reconciliation receipt',
      );
    }

    return {
      receiptId: row.receiptId,
      status,
      expiresAt,
      consumedAt,
      configDigest: row.configDigest,
      bindingDigest: row.bindingDigest,
      activationRequestId: row.activationRequestId,
      activationRequestDigest: row.activationRequestDigest,
      claimId: row.claimId,
      resolvedClaimId: row.resolvedClaimId,
      externalDomain: row.externalDomain,
      externalClubId: row.externalClubId,
      claimDigest: row.claimDigest,
      activatedAt,
      storeExternalProvider: row.storeExternalProvider,
      storeExternalDomain: row.storeExternalDomain,
      storeExternalClubId: row.storeExternalClubId,
      storeIntegrationSourceId: row.storeIntegrationSourceId,
      sourceId: row.sourceId,
      sourceProvider: row.sourceProvider,
      sourceDomain: row.sourceDomain,
      sourceBaseUrl: row.sourceBaseUrl,
      sourceIsActive: row.sourceIsActive,
      credentialId: row.credentialId,
      credentialProvider: row.credentialProvider,
      credentialIsActive: row.credentialIsActive,
      auditId: row.auditId,
      auditRequestDigest: row.auditRequestDigest,
      auditConfigDigest: row.auditConfigDigest,
      auditBindingDigest: row.auditBindingDigest,
      auditClaimDigest: row.auditClaimDigest,
      auditEventAt,
    };
  }

  private normalizeLangameDomain(value: unknown) {
    const domain = this.requiredText(value, 'Langame domain', 253)
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '')
      .toLowerCase();
    if (
      !/^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i.test(domain) ||
      domain.includes('..') ||
      !LANGAME_DOMAIN_SUFFIXES.some(
        (suffix) => domain === suffix.slice(1) || domain.endsWith(suffix),
      )
    ) {
      throw new BadRequestException('Unsupported Langame domain');
    }

    return domain;
  }

  private isNormalizedLangameDomain(domain: string) {
    return (
      domain.length <= 253 &&
      domain === domain.toLowerCase() &&
      /^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i.test(domain) &&
      !domain.includes('..') &&
      LANGAME_DOMAIN_SUFFIXES.some(
        (suffix) => domain === suffix.slice(1) || domain.endsWith(suffix),
      )
    );
  }

  private optionalDate(value: unknown) {
    if (value === null) return null;
    return value instanceof Date && !Number.isNaN(value.getTime())
      ? value
      : null;
  }

  private isNullableText(
    value: unknown,
    maxLength: number,
  ): value is string | null {
    return (
      value === null ||
      (typeof value === 'string' &&
        value.length > 0 &&
        value.length <= maxLength)
    );
  }

  private isNullableDigest(value: unknown): value is string | null {
    return (
      value === null ||
      (typeof value === 'string' && DIGEST_PATTERN.test(value))
    );
  }

  private isNullableBoolean(value: unknown): value is boolean | null {
    return value === null || typeof value === 'boolean';
  }

  private requiredRequestId(value: unknown) {
    const requestId = this.requiredText(value, 'Request id', 128);
    if (!REQUEST_ID_PATTERN.test(requestId)) {
      throw new BadRequestException('Invalid request id');
    }
    return requestId;
  }

  private requiredExternalClubId(value: unknown) {
    const externalClubId = this.requiredText(value, 'External club id', 19);
    if (!EXTERNAL_CLUB_ID_PATTERN.test(externalClubId)) {
      throw new BadRequestException('Invalid external club id');
    }
    return externalClubId;
  }

  private requiredDigest(value: unknown, label: string) {
    const digest = this.requiredText(value, label, 64);
    if (!DIGEST_PATTERN.test(digest)) {
      throw new BadRequestException(`Invalid ${label.toLowerCase()}`);
    }
    return digest;
  }

  private requiredText(value: unknown, label: string, maxLength: number) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized || normalized.length > maxLength) {
      throw new BadRequestException(`${label} is required`);
    }
    return normalized;
  }

  private extractRows(payload: unknown): Record<string, unknown>[] {
    if (Array.isArray(payload)) {
      return payload.filter((row) => this.isPlainObject(row));
    }
    if (!this.isPlainObject(payload)) {
      return [];
    }
    return Array.isArray(payload.data)
      ? payload.data.filter((row) => this.isPlainObject(row))
      : [];
  }

  private isActiveClub(row: Record<string, unknown>) {
    return row.active === 1 || row.active === true || row.active === '1';
  }

  private scalarIdentifier(value: unknown) {
    return typeof value === 'string' || typeof value === 'number'
      ? String(value).trim()
      : '';
  }

  private hmacDigest(secret: string, fields: readonly string[]) {
    return createHmac('sha256', secret)
      .update(JSON.stringify(fields), 'utf8')
      .digest('hex');
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
