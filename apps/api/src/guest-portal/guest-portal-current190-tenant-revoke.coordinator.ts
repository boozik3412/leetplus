import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHmac } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';

const CONTRACT = 'GUEST_PORTAL_TENANT_REVOKE_CURRENT190_V1' as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;
const MAX_BATCH_LIMIT = 500;
const MAX_BATCHES = 1_000;
const TENANT_LOCK_DOMAIN = 'leetplus:identity-mail-tenant:v1:';
const TENANT_LOCK_SEED = 180;

const COMMAND_FIELDS = new Set([
  'batchLimit',
  'confirmation',
  'maxBatches',
  'reason',
  'requestId',
]);

export const GUEST_PORTAL_TENANT_REVOKE_CURRENT190_DORMANT_POLICY =
  Object.freeze({
    enabled: false,
    executionMode: 'DORMANT_TEST_ONLY' as const,
    environment: 'test' as const,
    lostResponseRetries: 1 as const,
  });

export type GuestPortalTenantRevokeCurrent190DormantPolicy = Readonly<{
  enabled: boolean;
  executionMode: 'DORMANT_TEST_ONLY';
  environment: 'test' | 'ci';
  lostResponseRetries: 0 | 1;
}>;

export type GuestPortalTenantRevokeCurrent190BatchInput = Readonly<{
  tenantId: string;
  fenceRequestDigest: string;
  batchRequestDigest: string;
  proposedBatchId: string;
  batchLimit: number;
}>;

export type GuestPortalTenantRevokeCurrent190BatchReceipt = Readonly<{
  batchId: string;
  fenceVersion: number;
  batchSequence: number;
  fenceStatus: 'DRAINING' | 'CLOSED';
  revokedCount: number;
  remainingActiveCount: bigint;
  totalRevokedCount: bigint;
  batchCompletedAt: Date;
  replayed: boolean;
}>;

export interface GuestPortalTenantRevokeCurrent190Driver {
  revokeBatch(
    input: GuestPortalTenantRevokeCurrent190BatchInput,
  ): Promise<GuestPortalTenantRevokeCurrent190BatchReceipt>;
}

export interface GuestPortalTenantRevokeCurrent190AdminAuthority {
  assertFreshPlatformAdmin(actor: AuthenticatedUser): Promise<
    Readonly<{
      userId: string;
      active: true;
      platformAdmin: true;
    }>
  >;
}

export type GuestPortalTenantRevokeCurrent190Result = Readonly<{
  ok: true;
  contractVersion: typeof CONTRACT;
  tenantId: string;
  fenceStatus: 'CLOSED';
  fenceVersion: 1;
  batchCount: number;
  totalRevokedCount: string;
  remainingActiveCount: '0';
  replayedBatchCount: number;
  completedAt: string;
}>;

/**
 * Dormant Platform Admin orchestration for the sealed CURRENT190 revoke-all
 * RPC. It has no Nest decorator, module registration, controller or CLI.
 */
export class GuestPortalTenantRevokeCurrent190Coordinator {
  constructor(
    private readonly driver: GuestPortalTenantRevokeCurrent190Driver,
    private readonly adminAuthority: GuestPortalTenantRevokeCurrent190AdminAuthority,
    private readonly hmacSecret: string,
    private readonly policy: GuestPortalTenantRevokeCurrent190DormantPolicy = GUEST_PORTAL_TENANT_REVOKE_CURRENT190_DORMANT_POLICY,
  ) {}

  readiness() {
    return {
      status: 'DORMANT_TENANT_REVOKE_COORDINATOR',
      canonical: false,
      deployable: false,
      routeActive: false,
      runtimeRoleEnrolled: false,
    } as const;
  }

  async revokeTenant(
    actor: AuthenticatedUser,
    routeTenantId: unknown,
    body: unknown,
  ): Promise<GuestPortalTenantRevokeCurrent190Result> {
    this.assertDormantPolicy();
    this.assertPlatformAdmin(actor);
    const tenantId = requiredUuid(routeTenantId, 'tenantId');
    const command = parseCommand(body, tenantId);
    await this.assertFreshPlatformAdmin(actor);
    const fenceRequestDigest = hmac(this.hmacSecret, [
      CONTRACT,
      'FENCE',
      tenantId,
      actor.id,
      command.requestId,
      digestReason(this.hmacSecret, command.reason),
      String(command.batchLimit),
    ]);

    let previousTotal = 0n;
    let replayedBatchCount = 0;
    for (let index = 1; index <= command.maxBatches; index += 1) {
      const batchRequestDigest = hmac(this.hmacSecret, [
        CONTRACT,
        'BATCH',
        fenceRequestDigest,
        String(index),
        String(command.batchLimit),
      ]);
      const proposedBatchId = deterministicUuid(
        this.hmacSecret,
        tenantId,
        command.requestId,
        String(index),
      );
      const input: GuestPortalTenantRevokeCurrent190BatchInput = Object.freeze({
        tenantId,
        fenceRequestDigest,
        batchRequestDigest,
        proposedBatchId,
        batchLimit: command.batchLimit,
      });
      const receipt = await this.withBoundedReplay(() =>
        this.driver.revokeBatch(input),
      );
      assertReceipt(receipt, input, index, previousTotal);
      previousTotal = receipt.totalRevokedCount;
      replayedBatchCount += receipt.replayed ? 1 : 0;

      if (receipt.fenceStatus === 'CLOSED') {
        return Object.freeze({
          ok: true as const,
          contractVersion: CONTRACT,
          tenantId,
          fenceStatus: 'CLOSED' as const,
          fenceVersion: 1 as const,
          batchCount: index,
          totalRevokedCount: receipt.totalRevokedCount.toString(),
          remainingActiveCount: '0' as const,
          replayedBatchCount,
          completedAt: receipt.batchCompletedAt.toISOString(),
        });
      }
    }

    throw new ServiceUnavailableException({
      message: 'Guest portal tenant revoke requires continuation',
      reasonCode: 'GUEST_PORTAL_TENANT_REVOKE_CONTINUATION_REQUIRED',
    });
  }

  private assertDormantPolicy(): void {
    if (
      process.env.NODE_ENV === 'production' ||
      this.policy.enabled !== true ||
      this.policy.executionMode !== 'DORMANT_TEST_ONLY' ||
      !['test', 'ci'].includes(this.policy.environment) ||
      ![0, 1].includes(this.policy.lostResponseRetries) ||
      typeof this.hmacSecret !== 'string' ||
      this.hmacSecret.length < 32
    ) {
      throw new ServiceUnavailableException({
        message: 'Guest portal tenant revoke coordinator is dormant',
        reasonCode: 'GUEST_PORTAL_TENANT_REVOKE_COORDINATOR_DORMANT',
      });
    }
  }

  private assertPlatformAdmin(actor: AuthenticatedUser): void {
    if (!actor?.isPlatformAdmin) {
      throw new ForbiddenException('Platform administrator access is required');
    }
    requiredUuid(actor.id, 'actorId');
  }

  private async assertFreshPlatformAdmin(
    actor: AuthenticatedUser,
  ): Promise<void> {
    let authority: Awaited<
      ReturnType<
        GuestPortalTenantRevokeCurrent190AdminAuthority['assertFreshPlatformAdmin']
      >
    >;
    try {
      authority = await this.adminAuthority.assertFreshPlatformAdmin(actor);
    } catch {
      throw new ForbiddenException('Fresh platform authority is required');
    }
    if (
      !record(authority) ||
      !exactKeys(authority, ['active', 'platformAdmin', 'userId']) ||
      authority.userId !== actor.id ||
      authority.active !== true ||
      authority.platformAdmin !== true
    ) {
      throw new ServiceUnavailableException({
        message: 'Fresh platform authority receipt is invalid',
        reasonCode: 'GUEST_PORTAL_TENANT_REVOKE_AUTHORITY_INVALID',
      });
    }
  }

  private async withBoundedReplay<T>(operation: () => Promise<T>): Promise<T> {
    for (
      let attempt = 0;
      attempt <= this.policy.lostResponseRetries;
      attempt += 1
    ) {
      try {
        return await operation();
      } catch (error) {
        if (!isGuestPortalTenantRevokeCurrent190AmbiguousFailure(error)) {
          throw containedFailure(error);
        }
        if (attempt === this.policy.lostResponseRetries) {
          throw new ServiceUnavailableException({
            message: 'Guest portal tenant revoke requires reconciliation',
            reasonCode: 'GUEST_PORTAL_TENANT_REVOKE_RECONCILIATION_REQUIRED',
          });
        }
      }
    }
    throw new ServiceUnavailableException({
      message: 'Guest portal tenant revoke requires reconciliation',
      reasonCode: 'GUEST_PORTAL_TENANT_REVOKE_RECONCILIATION_REQUIRED',
    });
  }
}

type RevokeRpcClient = Pick<Prisma.TransactionClient, '$queryRaw'>;

/** Candidate-only RPC adapter; a future runtime must supply its own pool. */
export class PrismaGuestPortalTenantRevokeCurrent190Driver implements GuestPortalTenantRevokeCurrent190Driver {
  constructor(private readonly prisma: Pick<PrismaService, '$transaction'>) {}

  revokeBatch(
    input: GuestPortalTenantRevokeCurrent190BatchInput,
  ): Promise<GuestPortalTenantRevokeCurrent190BatchReceipt> {
    assertDriverInput(input);
    return this.prisma.$transaction(
      async (tx) => {
        await assertTransaction(tx, input.tenantId);
        const rows = await tx.$queryRaw<
          Array<Record<string, unknown>>
        >(Prisma.sql`
        SELECT *
        FROM public.guest_portal_sessions_revoke_tenant_current190_v1(
          ${input.tenantId},
          ${input.fenceRequestDigest},
          ${input.batchRequestDigest},
          ${input.proposedBatchId},
          ${input.batchLimit}
        )
      `);
        return parseDriverReceipt(rows);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5_000,
        timeout: 30_000,
      },
    );
  }
}

async function assertTransaction(
  tx: RevokeRpcClient,
  tenantId: string,
): Promise<void> {
  const settings = await tx.$queryRaw<
    Array<{
      isolationLevel: string;
      statementTimeout: string;
      lockTimeout: string;
    }>
  >(Prisma.sql`
    SELECT
      pg_catalog.current_setting('transaction_isolation') AS "isolationLevel",
      pg_catalog.set_config('statement_timeout', '25s', true)
        AS "statementTimeout",
      pg_catalog.set_config('lock_timeout', '5s', true) AS "lockTimeout"
  `);
  if (
    settings.length !== 1 ||
    settings[0]?.isolationLevel !== 'read committed' ||
    settings[0]?.statementTimeout !== '25s' ||
    settings[0]?.lockTimeout !== '5s'
  ) {
    throw invalidReceipt();
  }
  const locks = await tx.$queryRaw<Array<{ tenantId: string }>>(Prisma.sql`
    WITH tenant_lock AS MATERIALIZED (
      SELECT pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          ${TENANT_LOCK_DOMAIN} || ${tenantId}::TEXT,
          ${TENANT_LOCK_SEED}
        )
      ) AS acquired
    )
    SELECT ${tenantId}::TEXT AS "tenantId" FROM tenant_lock
  `);
  if (locks.length !== 1 || locks[0]?.tenantId !== tenantId) {
    throw invalidReceipt();
  }
}

function parseDriverReceipt(
  rows: readonly Record<string, unknown>[],
): GuestPortalTenantRevokeCurrent190BatchReceipt {
  if (rows.length !== 1 || !rows[0]) {
    throw invalidReceipt();
  }
  const row = rows[0];
  const keys = [
    'batchCompletedAt',
    'batchId',
    'batchSequence',
    'fenceStatus',
    'fenceVersion',
    'remainingActiveCount',
    'replayed',
    'revokedCount',
    'totalRevokedCount',
  ];
  if (!exactKeys(row, keys)) {
    throw invalidReceipt();
  }
  const completedAt = date(row.batchCompletedAt);
  const remainingActiveCount = nonNegativeBigInt(row.remainingActiveCount);
  const totalRevokedCount = nonNegativeBigInt(row.totalRevokedCount);
  if (
    !uuid(row.batchId) ||
    !positiveInteger(row.fenceVersion) ||
    !positiveInteger(row.batchSequence) ||
    (row.fenceStatus !== 'DRAINING' && row.fenceStatus !== 'CLOSED') ||
    !nonNegativeInteger(row.revokedCount) ||
    typeof row.replayed !== 'boolean'
  ) {
    throw invalidReceipt();
  }
  return Object.freeze({
    batchId: row.batchId,
    fenceVersion: row.fenceVersion,
    batchSequence: row.batchSequence,
    fenceStatus: row.fenceStatus,
    revokedCount: row.revokedCount,
    remainingActiveCount,
    totalRevokedCount,
    batchCompletedAt: completedAt,
    replayed: row.replayed,
  });
}

function parseCommand(value: unknown, tenantId: string) {
  if (!record(value) || !exactKeys(value, [...COMMAND_FIELDS])) {
    throw invalidCommand();
  }
  const requestId = requiredUuid(value.requestId, 'requestId');
  const reason = requiredText(value.reason, 'reason', 10, 500);
  const batchLimit = boundedInteger(
    value.batchLimit,
    'batchLimit',
    1,
    MAX_BATCH_LIMIT,
  );
  const maxBatches = boundedInteger(
    value.maxBatches,
    'maxBatches',
    1,
    MAX_BATCHES,
  );
  if (value.confirmation !== `REVOKE GUEST SESSIONS ${tenantId}`) {
    throw invalidCommand();
  }
  return { requestId, reason, batchLimit, maxBatches };
}

function assertDriverInput(
  input: GuestPortalTenantRevokeCurrent190BatchInput,
): void {
  if (
    !uuid(input.tenantId) ||
    !DIGEST_PATTERN.test(input.fenceRequestDigest) ||
    !DIGEST_PATTERN.test(input.batchRequestDigest) ||
    !uuid(input.proposedBatchId) ||
    !Number.isSafeInteger(input.batchLimit) ||
    input.batchLimit < 1 ||
    input.batchLimit > MAX_BATCH_LIMIT
  ) {
    throw invalidCommand();
  }
}

function assertReceipt(
  receipt: GuestPortalTenantRevokeCurrent190BatchReceipt,
  input: GuestPortalTenantRevokeCurrent190BatchInput,
  expectedSequence: number,
  previousTotal: bigint,
): void {
  if (
    !record(receipt) ||
    !exactKeys(receipt, [
      'batchCompletedAt',
      'batchId',
      'batchSequence',
      'fenceStatus',
      'fenceVersion',
      'remainingActiveCount',
      'replayed',
      'revokedCount',
      'totalRevokedCount',
    ]) ||
    receipt.batchId !== input.proposedBatchId ||
    receipt.fenceVersion !== 1 ||
    receipt.batchSequence !== expectedSequence ||
    !Number.isSafeInteger(receipt.revokedCount) ||
    receipt.revokedCount < 0 ||
    receipt.revokedCount > input.batchLimit ||
    typeof receipt.remainingActiveCount !== 'bigint' ||
    receipt.remainingActiveCount < 0n ||
    typeof receipt.totalRevokedCount !== 'bigint' ||
    receipt.totalRevokedCount !==
      previousTotal + BigInt(receipt.revokedCount) ||
    (receipt.fenceStatus === 'CLOSED') !==
      (receipt.remainingActiveCount === 0n) ||
    !(receipt.batchCompletedAt instanceof Date) ||
    !Number.isFinite(receipt.batchCompletedAt.getTime()) ||
    typeof receipt.replayed !== 'boolean'
  ) {
    throw invalidReceipt();
  }
}

function deterministicUuid(secret: string, ...parts: readonly string[]) {
  const digest = hmac(secret, [CONTRACT, 'BATCH_ID', ...parts]);
  const hex = `${digest.slice(0, 12)}4${digest.slice(13, 16)}8${digest.slice(
    17,
    32,
  )}`;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
    12,
    16,
  )}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function digestReason(secret: string, reason: string) {
  return hmac(secret, [CONTRACT, 'REASON', reason]);
}

function hmac(secret: string, parts: readonly string[]) {
  const result = createHmac('sha256', secret);
  for (const part of parts) {
    result.update(String(Buffer.byteLength(part)));
    result.update(':');
    result.update(part);
    result.update('|');
  }
  return result.digest('hex');
}

function containedFailure(error: unknown): Error {
  const sqlState = databaseSqlState(error);
  if (sqlState === '22023') {
    return invalidCommand();
  }
  if (sqlState === '23505') {
    return new ServiceUnavailableException({
      message: 'Guest portal tenant revoke request conflicts with state',
      reasonCode: 'GUEST_PORTAL_TENANT_REVOKE_CONFLICT',
    });
  }
  return new ServiceUnavailableException({
    message: 'Guest portal tenant revoke failed closed',
    reasonCode: 'GUEST_PORTAL_TENANT_REVOKE_CONTAINED',
  });
}

export function isGuestPortalTenantRevokeCurrent190AmbiguousFailure(
  error: unknown,
): boolean {
  const code = errorCode(error);
  const sqlState = databaseSqlState(error);
  return (
    ['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2034'].includes(
      code ?? '',
    ) ||
    sqlState?.startsWith('08') === true ||
    ['40001', '40003', '40P01', '55P03', '57014'].includes(sqlState ?? '')
  );
}

function databaseSqlState(error: unknown): string | null {
  const code = errorCode(error);
  if (!record(error)) {
    return code && /^[0-9A-Z]{5}$/u.test(code) ? code : null;
  }
  const meta = error.meta;
  if (
    code === 'P2010' &&
    record(meta) &&
    typeof meta.code === 'string' &&
    /^[0-9A-Z]{5}$/u.test(meta.code)
  ) {
    return meta.code;
  }
  return code && /^[0-9A-Z]{5}$/u.test(code) ? code : null;
}

function errorCode(error: unknown): string | null {
  return record(error) && typeof error.code === 'string' ? error.code : null;
}

function date(value: unknown): Date {
  const result =
    value instanceof Date ? new Date(value) : new Date(String(value));
  if (!Number.isFinite(result.getTime())) {
    throw invalidReceipt();
  }
  return result;
}

function nonNegativeBigInt(value: unknown): bigint {
  if (
    (typeof value !== 'bigint' &&
      typeof value !== 'number' &&
      typeof value !== 'string') ||
    !/^(?:0|[1-9][0-9]*)$/u.test(String(value))
  ) {
    throw invalidReceipt();
  }
  return BigInt(value);
}

function boundedInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
) {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < minimum ||
    Number(value) > maximum
  ) {
    throw new BadRequestException(`${field} is invalid`);
  }
  return Number(value);
}

function requiredText(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
) {
  if (typeof value !== 'string' || value !== value.trim()) {
    throw new BadRequestException(`${field} is invalid`);
  }
  if (value.length < minimum || value.length > maximum) {
    throw new BadRequestException(`${field} is invalid`);
  }
  return value;
}

function requiredUuid(value: unknown, field: string): string {
  if (!uuid(value)) {
    throw new BadRequestException(`${field} must be a canonical UUID`);
  }
  return value;
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value);
  return (
    actual.length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function invalidCommand() {
  return new BadRequestException({
    message: 'Guest portal tenant revoke command is invalid',
    reasonCode: 'GUEST_PORTAL_TENANT_REVOKE_COMMAND_INVALID',
  });
}

function invalidReceipt() {
  return new ServiceUnavailableException({
    message: 'Guest portal tenant revoke receipt is invalid',
    reasonCode: 'GUEST_PORTAL_TENANT_REVOKE_RECEIPT_INVALID',
  });
}
