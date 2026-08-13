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
