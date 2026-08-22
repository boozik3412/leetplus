import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHmac } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth.types';
import { isProductionConfig } from '../config/environment-validation';
import { PrismaService } from '../prisma/prisma.service';
import { FreshStoreScopeService } from '../tenancy/fresh-store-scope.service';
import { LangameClient } from './langame.client';
import { SecretEncryptionService } from './secret-encryption.service';

const CURRENT188_CONTRACT = 'LANGAME_ONBOARDING_STAGED_RECEIPT_CURRENT188_V1';
const PREFLIGHT_ENABLED_ENV =
  'LANGAME_INITIAL_SYNC_PREFLIGHT_CURRENT188_ENABLED';
const FOUNDATION_ENABLED_ENV = 'LANGAME_STAGED_ONBOARDING_FOUNDATION_ENABLED';
const FOUNDATION_HMAC_ENV = 'LANGAME_STAGED_ONBOARDING_HMAC_SECRET';
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const EXTERNAL_CLUB_ID_PATTERN = /^[1-9][0-9]{0,18}$/;
const EXTERNAL_ENTITY_ID_PATTERN = /^[1-9][0-9]{0,18}$/;
const LANGAME_DOMAIN_SUFFIXES = ['.langame.ru', '.langamepro.ru'] as const;
const PROVIDER_TIMEOUT_MS = 5_000;
const CLUB_RESPONSE_BYTES = 1024 * 1024;
const ASSORTMENT_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_CLUB_ROWS = 1_000;
const MAX_ASSORTMENT_ROWS = 50_000;

export type LangameInitialSyncPreflightCurrent188Dto = {
  receiptId?: string;
  activationRequestId?: string;
  syncRequestId?: string;
  configDigest?: string;
  storeId?: string;
  domain?: string;
  externalClubId?: string;
};

type ActivatedBindingRow = {
  receiptId: string;
  status: 'CONSUMED';
  consumedAt: Date;
  configDigest: string;
  bindingDigest: string;
  activationRequestId: string;
  activationRequestDigest: string;
  claimId: string;
  resolvedClaimId: string;
  externalDomain: string;
  externalClubId: string;
  claimDigest: string;
  activatedAt: Date;
  storeExternalProvider: 'LANGAME';
  storeExternalDomain: string;
  storeExternalClubId: string;
  storeIntegrationSourceId: string;
  sourceId: string;
  sourceCredentialId: string;
  sourceProvider: 'LANGAME';
  sourceDomain: string;
  sourceBaseUrl: string;
  sourceIsActive: true;
  credentialId: string;
  credentialProvider: 'LANGAME';
  credentialIsActive: true;
  credentialApiKeyEncrypted: string;
  credentialApiKeyEnvVar: null;
  credentialUpdatedAt: Date;
  auditId: string;
  auditRequestDigest: string;
  auditConfigDigest: string;
  auditBindingDigest: string;
  auditClaimDigest: string;
  auditEventAt: Date;
};

@Injectable()
export class LangameInitialSyncPreflightCurrent188Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly freshStoreScopeService: FreshStoreScopeService,
    private readonly configService: ConfigService,
    private readonly langameClient: LangameClient,
    private readonly secretEncryptionService: SecretEncryptionService,
  ) {}

  async preflight(
    user: AuthenticatedUser,
    dto: LangameInitialSyncPreflightCurrent188Dto,
  ) {
    const scope = await this.freshStoreScopeService.assertNetwork(user);
    this.requirePreflightConfiguration();
    const hmacSecret = this.requireFoundationConfiguration();
    const receiptId = this.requiredText(dto.receiptId, 'Receipt id', 128);
    const activationRequestId = this.requiredRequestId(
      dto.activationRequestId,
      'Activation request id',
    );
    const syncRequestId = this.requiredRequestId(
      dto.syncRequestId,
      'Sync request id',
    );
    if (syncRequestId === activationRequestId) {
      throw new BadRequestException('Sync request id must be independent');
    }
    const configDigest = this.requiredDigest(dto.configDigest, 'Config digest');
    const storeId = this.requiredText(dto.storeId, 'Store id', 128);
    const domain = this.normalizeLangameDomain(dto.domain);
    const externalClubId = this.requiredExternalClubId(dto.externalClubId);
    const bindingDigest = this.hmacDigest(hmacSecret, [
      CURRENT188_CONTRACT,
      'BINDING',
      scope.tenantId,
      storeId,
      domain,
      externalClubId,
      configDigest,
    ]);
    const activationRequestDigest = this.hmacDigest(hmacSecret, [
      CURRENT188_CONTRACT,
      'ACTIVATE',
      scope.tenantId,
      scope.userId,
      receiptId,
      activationRequestId,
      configDigest,
      bindingDigest,
      storeId,
      domain,
      externalClubId,
    ]);
    const approvalDigest = this.hmacDigest(hmacSecret, [
      CURRENT188_CONTRACT,
      'INITIAL_READ_ONLY_SYNC_PREFLIGHT',
      scope.tenantId,
      scope.userId,
      receiptId,
      activationRequestId,
      syncRequestId,
      configDigest,
      bindingDigest,
      storeId,
      domain,
      externalClubId,
    ]);

    const before = await this.readActivatedBinding(
      scope.tenantId,
      scope.userId,
      receiptId,
      storeId,
    );
    this.assertActivatedBinding(before, {
      receiptId,
      activationRequestId,
      activationRequestDigest,
      configDigest,
      bindingDigest,
      storeId,
      domain,
      externalClubId,
    });
    const beforeDigest = this.bindingEvidenceDigest(hmacSecret, before);

    let apiKey: string;
    try {
      apiKey = this.secretEncryptionService.decrypt(
        before.credentialApiKeyEncrypted,
      );
    } catch {
      throw new ServiceUnavailableException(
        'Langame initial sync credential is unavailable',
      );
    }
    if (!apiKey || apiKey.length > 4_096) {
      throw new ServiceUnavailableException(
        'Langame initial sync credential is unavailable',
      );
    }

    let clubsPayload: unknown;
    let productsPayload: unknown;
    let goodsPayload: unknown;
    try {
      [clubsPayload, productsPayload, goodsPayload] = await Promise.all([
        this.langameClient.getDiagnosticEndpoint(
          before.sourceBaseUrl,
          apiKey,
          '/clubs/list',
          {},
          {
            timeoutMs: PROVIDER_TIMEOUT_MS,
            maxResponseBytes: CLUB_RESPONSE_BYTES,
          },
        ),
        this.langameClient.getDiagnosticEndpoint(
          before.sourceBaseUrl,
          apiKey,
          '/products/list',
          {},
          {
            timeoutMs: PROVIDER_TIMEOUT_MS,
            maxResponseBytes: ASSORTMENT_RESPONSE_BYTES,
          },
        ),
        this.langameClient.getDiagnosticEndpoint(
          before.sourceBaseUrl,
          apiKey,
          '/goods/list',
          { club_id: externalClubId },
          {
            timeoutMs: PROVIDER_TIMEOUT_MS,
            maxResponseBytes: ASSORTMENT_RESPONSE_BYTES,
          },
        ),
      ]);
    } catch {
      throw new ServiceUnavailableException(
        'Langame initial read-only sync preflight failed',
      );
    }

    const clubs = this.strictRows(clubsPayload, MAX_CLUB_ROWS);
    const products = this.strictRows(productsPayload, MAX_ASSORTMENT_ROWS);
    const goods = this.strictRows(goodsPayload, MAX_ASSORTMENT_ROWS);
    const selectedClubs = clubs.filter(
      (row) => this.scalarIdentifier(row.id) === externalClubId,
    );
    if (selectedClubs.length !== 1 || !this.isActiveClub(selectedClubs[0])) {
      throw new ServiceUnavailableException(
        'Selected Langame club changed during initial sync preflight',
      );
    }

    const productIds = this.uniqueIdentifiers(products, 'product');
    const goodsIds = this.uniqueIdentifiers(goods, 'inventory');
    const productIdSet = new Set(productIds);
    if (goodsIds.some((id) => !productIdSet.has(id))) {
      throw new ServiceUnavailableException(
        'Langame initial sync read set is inconsistent',
      );
    }

    const freshScope = await this.freshStoreScopeService.assertNetwork(user);
    if (
      freshScope.tenantId !== scope.tenantId ||
      freshScope.userId !== scope.userId
    ) {
      throw new ServiceUnavailableException(
        'Langame initial sync authority changed during preflight',
      );
    }

    const after = await this.readActivatedBinding(
      scope.tenantId,
      scope.userId,
      receiptId,
      storeId,
    );
    this.assertActivatedBinding(after, {
      receiptId,
      activationRequestId,
      activationRequestDigest,
      configDigest,
      bindingDigest,
      storeId,
      domain,
      externalClubId,
    });
    if (this.bindingEvidenceDigest(hmacSecret, after) !== beforeDigest) {
      throw new ServiceUnavailableException(
        'Langame onboarding binding changed during initial sync preflight',
      );
    }

    const readSetDigest = this.hmacDigest(hmacSecret, [
      CURRENT188_CONTRACT,
      'INITIAL_READ_ONLY_SYNC_READ_SET',
      approvalDigest,
      beforeDigest,
      externalClubId,
      productIds.sort().join('|'),
      goodsIds.sort().join('|'),
    ]);

    return {
      contractVersion: CURRENT188_CONTRACT,
      receiptId,
      storeId,
      syncRequestId,
      status: 'READY' as const,
      approvalDigest,
      readSetDigest,
      readSet: {
        selectedClubs: 1 as const,
        products: productIds.length,
        inventoryItems: goodsIds.length,
      },
      providerReadsPerformed: 3 as const,
      providerWritesStarted: false as const,
      platformImportStarted: false as const,
      initialReadOnlySyncAvailable: false as const,
      productionPreflightAllowed: false as const,
    } as const;
  }

  private async readActivatedBinding(
    tenantId: string,
    actorUserId: string,
    receiptId: string,
    storeId: string,
  ) {
    let rows: unknown;
    try {
      rows = await this.prisma.$queryRaw(
        Prisma.sql`
          SELECT
            receipt."id" AS "receiptId",
            receipt."status" AS "status",
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
            source."credentialId" AS "sourceCredentialId",
            source."provider"::TEXT AS "sourceProvider",
            source."domain" AS "sourceDomain",
            source."baseUrl" AS "sourceBaseUrl",
            source."isActive" AS "sourceIsActive",
            credential."id" AS "credentialId",
            credential."provider"::TEXT AS "credentialProvider",
            credential."isActive" AS "credentialIsActive",
            credential."apiKeyEncrypted" AS "credentialApiKeyEncrypted",
            credential."apiKeyEnvVar" AS "credentialApiKeyEnvVar",
            credential."updatedAt" AS "credentialUpdatedAt",
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
          INNER JOIN public."LangameExternalClubClaimV1" AS claim
            ON claim."id" = receipt."claimId"
           AND claim."tenantId" = receipt."tenantId"
           AND claim."storeId" = receipt."storeId"
           AND claim."receiptId" = receipt."id"
          INNER JOIN public."IntegrationSource" AS source
            ON source."tenantId" = store."tenantId"
           AND source."id" = store."integrationSourceId"
          INNER JOIN public."IntegrationCredential" AS credential
            ON credential."tenantId" = source."tenantId"
           AND credential."id" = source."credentialId"
          INNER JOIN public."LangameOnboardingAuditEventV1" AS audit
            ON audit."tenantId" = receipt."tenantId"
           AND audit."receiptId" = receipt."id"
           AND audit."eventType" = 'ACTIVATED'
          WHERE receipt."tenantId" = ${tenantId}
            AND receipt."actorUserId" = ${actorUserId}
            AND receipt."id" = ${receiptId}
            AND receipt."storeId" = ${storeId}
          LIMIT 2
        `,
      );
    } catch {
      throw new ServiceUnavailableException(
        'Langame initial sync binding is unavailable',
      );
    }

    return this.parseActivatedBinding(rows);
  }

  private parseActivatedBinding(value: unknown): ActivatedBindingRow {
    if (!Array.isArray(value) || value.length !== 1) {
      throw new ServiceUnavailableException(
        'Invalid Langame initial sync binding',
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
      'credentialApiKeyEncrypted',
      'credentialApiKeyEnvVar',
      'credentialId',
      'credentialIsActive',
      'credentialProvider',
      'credentialUpdatedAt',
      'externalClubId',
      'externalDomain',
      'receiptId',
      'resolvedClaimId',
      'sourceBaseUrl',
      'sourceCredentialId',
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
        'Invalid Langame initial sync binding',
      );
    }

    for (const key of [
      'receiptId',
      'activationRequestId',
      'claimId',
      'resolvedClaimId',
      'externalDomain',
      'externalClubId',
      'storeExternalDomain',
      'storeExternalClubId',
      'storeIntegrationSourceId',
      'sourceId',
      'sourceCredentialId',
      'sourceDomain',
      'sourceBaseUrl',
      'credentialId',
      'credentialApiKeyEncrypted',
      'auditId',
    ] as const) {
      if (typeof row[key] !== 'string' || row[key].length === 0) {
        throw new ServiceUnavailableException(
          'Invalid Langame initial sync binding',
        );
      }
    }
    for (const key of [
      'configDigest',
      'bindingDigest',
      'activationRequestDigest',
      'claimDigest',
      'auditRequestDigest',
      'auditConfigDigest',
      'auditBindingDigest',
      'auditClaimDigest',
    ] as const) {
      if (typeof row[key] !== 'string' || !DIGEST_PATTERN.test(row[key])) {
        throw new ServiceUnavailableException(
          'Invalid Langame initial sync binding',
        );
      }
    }
    const consumedAt = this.requiredDate(row.consumedAt);
    const activatedAt = this.requiredDate(row.activatedAt);
    const auditEventAt = this.requiredDate(row.auditEventAt);
    const credentialUpdatedAt = this.requiredDate(row.credentialUpdatedAt);
    if (
      row.status !== 'CONSUMED' ||
      row.storeExternalProvider !== 'LANGAME' ||
      row.sourceProvider !== 'LANGAME' ||
      row.credentialProvider !== 'LANGAME' ||
      row.sourceIsActive !== true ||
      row.credentialIsActive !== true ||
      row.credentialApiKeyEnvVar !== null
    ) {
      throw new ServiceUnavailableException(
        'Invalid Langame initial sync binding',
      );
    }

    return {
      ...(row as Omit<
        ActivatedBindingRow,
        'consumedAt' | 'activatedAt' | 'auditEventAt' | 'credentialUpdatedAt'
      >),
      consumedAt,
      activatedAt,
      auditEventAt,
      credentialUpdatedAt,
    };
  }

  private assertActivatedBinding(
    row: ActivatedBindingRow,
    expected: {
      receiptId: string;
      activationRequestId: string;
      activationRequestDigest: string;
      configDigest: string;
      bindingDigest: string;
      storeId: string;
      domain: string;
      externalClubId: string;
    },
  ) {
    const activatedAt = row.consumedAt.getTime();
    if (
      row.receiptId !== expected.receiptId ||
      row.activationRequestId !== expected.activationRequestId ||
      row.activationRequestDigest !== expected.activationRequestDigest ||
      row.configDigest !== expected.configDigest ||
      row.bindingDigest !== expected.bindingDigest ||
      row.claimId !== row.resolvedClaimId ||
      row.externalDomain !== expected.domain ||
      row.externalClubId !== expected.externalClubId ||
      row.claimDigest !== expected.bindingDigest ||
      row.activatedAt.getTime() !== activatedAt ||
      row.storeExternalDomain !== expected.domain ||
      row.storeExternalClubId !== expected.externalClubId ||
      row.storeIntegrationSourceId !== row.sourceId ||
      row.sourceCredentialId !== row.credentialId ||
      row.sourceDomain !== expected.domain ||
      row.sourceBaseUrl !== `https://${expected.domain}/public_api` ||
      row.auditRequestDigest !== expected.activationRequestDigest ||
      row.auditConfigDigest !== expected.configDigest ||
      row.auditBindingDigest !== expected.bindingDigest ||
      row.auditClaimDigest !== expected.bindingDigest ||
      row.auditEventAt.getTime() !== activatedAt
    ) {
      throw new ServiceUnavailableException(
        'Invalid Langame initial sync binding',
      );
    }
  }

  private bindingEvidenceDigest(secret: string, row: ActivatedBindingRow) {
    return this.hmacDigest(secret, [
      CURRENT188_CONTRACT,
      'INITIAL_READ_ONLY_SYNC_BINDING_EVIDENCE',
      row.receiptId,
      row.consumedAt.toISOString(),
      row.configDigest,
      row.bindingDigest,
      row.activationRequestId,
      row.activationRequestDigest,
      row.claimId,
      row.sourceId,
      row.sourceCredentialId,
      row.credentialId,
      row.credentialApiKeyEncrypted,
      row.credentialUpdatedAt.toISOString(),
      row.auditId,
    ]);
  }

  private strictRows(payload: unknown, maxRows: number) {
    const rows = Array.isArray(payload)
      ? payload
      : this.isPlainObject(payload) && Array.isArray(payload.data)
        ? payload.data
        : null;
    if (
      rows === null ||
      rows.length > maxRows ||
      rows.some((row) => !this.isPlainObject(row))
    ) {
      throw new ServiceUnavailableException(
        'Invalid Langame initial sync read set',
      );
    }
    return rows as Record<string, unknown>[];
  }

  private uniqueIdentifiers(
    rows: readonly Record<string, unknown>[],
    label: string,
  ) {
    const identifiers = rows.map((row) => this.scalarIdentifier(row.id));
    if (
      identifiers.some(
        (identifier) => !EXTERNAL_ENTITY_ID_PATTERN.test(identifier),
      ) ||
      new Set(identifiers).size !== identifiers.length
    ) {
      throw new ServiceUnavailableException(
        `Invalid Langame ${label} read set`,
      );
    }
    return identifiers;
  }

  private requirePreflightConfiguration() {
    if (isProductionConfig(this.configService)) {
      throw new ServiceUnavailableException(
        'CURRENT188 initial sync preflight is not production-authorized',
      );
    }
    if (
      this.configService.get<string>(PREFLIGHT_ENABLED_ENV)?.trim() !== 'true'
    ) {
      throw new ServiceUnavailableException(
        'CURRENT188 initial sync preflight is disabled',
      );
    }
  }

  private requireFoundationConfiguration() {
    if (
      this.configService.get<string>(FOUNDATION_ENABLED_ENV)?.trim() !== 'true'
    ) {
      throw new ServiceUnavailableException(
        'Staged Langame onboarding foundation is disabled',
      );
    }
    const secret = this.configService.get<string>(FOUNDATION_HMAC_ENV)?.trim();
    if (!secret || secret.length < 32) {
      throw new ServiceUnavailableException(
        'Staged Langame onboarding foundation is unavailable',
      );
    }
    return secret;
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

  private requiredExternalClubId(value: unknown) {
    const externalClubId = this.requiredText(value, 'External club id', 19);
    if (!EXTERNAL_CLUB_ID_PATTERN.test(externalClubId)) {
      throw new BadRequestException('Invalid external club id');
    }
    return externalClubId;
  }

  private requiredRequestId(value: unknown, label: string) {
    const requestId = this.requiredText(value, label, 128);
    if (!REQUEST_ID_PATTERN.test(requestId)) {
      throw new BadRequestException(`Invalid ${label.toLowerCase()}`);
    }
    return requestId;
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

  private requiredDate(value: unknown) {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new ServiceUnavailableException(
        'Invalid Langame initial sync binding',
      );
    }
    return value;
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
