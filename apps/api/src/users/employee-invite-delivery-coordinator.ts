import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth.types';
import { hasCapability } from '../auth/capabilities';
import type { PrismaService } from '../prisma/prisma.service';
import type { FreshStoreScope } from '../tenancy/fresh-store-scope.service';
import { isCanonicalIdentityEmail } from '../utilities/canonical-identity-email';
import {
  EMPLOYEE_INVITE_DIGEST_VERSION,
  EMPLOYEE_INVITE_ENVELOPE_VERSION,
  EMPLOYEE_INVITE_MAIL_TEMPLATE,
  EMPLOYEE_INVITE_SECRET_ENVELOPE_BYTES,
  type EmployeeInviteSecretBinding,
  type SealedEmployeeInviteToken,
} from './employee-invite-secret-envelope';

const COORDINATOR_CONTRACT =
  'EXTERNAL_EMPLOYEE_INVITE_DELIVERY_CURRENT189_V1' as const;
const ISSUE_OPERATION = 'ISSUE_EMPLOYEE_INVITE' as const;
const REISSUE_OPERATION = 'REISSUE_EMPLOYEE_INVITE' as const;
const REVOKE_OPERATION = 'REVOKE_EMPLOYEE_INVITE' as const;
const PENDING_STATUS = 'PENDING' as const;
const CANCELED_STATUS = 'CANCELED' as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const CANONICAL_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MINIMUM_LIFETIME_MS = 15 * 60 * 1_000;
const MAXIMUM_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;
const MAXIMUM_STORES = 100;
const TENANT_LOCK_DOMAIN = 'leetplus:identity-mail-tenant:v1:';
const TENANT_LOCK_SEED = 180;

const ISSUE_FIELDS = new Set([
  'requestId',
  'email',
  'fullName',
  'role',
  'customRoleId',
  'scope',
  'storeIds',
  'expiresAt',
]);
const REVOKE_FIELDS = new Set(['requestId', 'reason']);

export const EMPLOYEE_INVITE_DORMANT_POLICY = Object.freeze({
  enabled: false,
  executionMode: 'DORMANT_TEST_ONLY' as const,
  environment: 'test' as const,
  lostResponseRetries: 1 as const,
});

export const EMPLOYEE_INVITE_TRANSACTION_OPTIONS = Object.freeze({
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 5_000,
  timeout: 30_000,
});

export type EmployeeInviteDormantPolicy = Readonly<{
  enabled: boolean;
  executionMode: 'DORMANT_TEST_ONLY';
  environment: 'test' | 'ci';
  lostResponseRetries: 0 | 1;
}>;

export type EmployeeInviteScope = 'NETWORK' | 'STORES';
export type EmployeeInviteOperation =
  | typeof ISSUE_OPERATION
  | typeof REISSUE_OPERATION;

type ParsedIssueCommand = Readonly<{
  requestId: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  customRoleId: string | null;
  scope: EmployeeInviteScope;
  storeIds: readonly string[];
  expiresAt: Date;
}>;

export type EmployeeInviteDeliveryInput = Readonly<{
  operation: EmployeeInviteOperation;
  commandId: string;
  requestId: string;
  requestDigest: string;
  actorUserId: string;
  tenantId: string;
  previousInviteId: string | null;
  reservationSubjectId: string | null;
  deliveryLocator: string;
  inviteId: string;
  outboxId: string;
  messageKey: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  customRoleId: string | null;
  scope: EmployeeInviteScope;
  storeIds: readonly string[];
  tokenHash: string;
  tokenDigestVersion: typeof EMPLOYEE_INVITE_DIGEST_VERSION;
  secretCiphertext: Buffer;
  envelopeVersion: typeof EMPLOYEE_INVITE_ENVELOPE_VERSION;
  keyVersion: string;
  aadEnvironment: string;
  expiresAt: Date;
}>;

export type EmployeeInviteRevokeInput = Readonly<{
  operation: typeof REVOKE_OPERATION;
  commandId: string;
  requestId: string;
  requestDigest: string;
  actorUserId: string;
  tenantId: string;
  inviteId: string;
}>;

export type EmployeeInviteDeliveryReceipt = Readonly<{
  schemaVersion: 1;
  operation: EmployeeInviteOperation;
  decision: 'CREATED' | 'REPLAYED';
  tenantId: string;
  actorUserId: string;
  requestId: string;
  commandId: string;
  previousInviteId: string | null;
  inviteId: string;
  outboxId: string;
  outboxStatus: typeof PENDING_STATUS;
  expiresAtEpochMs: number;
  createdTransactionId: string;
}>;

export type EmployeeInviteRevokeReceipt = Readonly<{
  schemaVersion: 1;
  operation: typeof REVOKE_OPERATION;
  decision: 'REVOKED' | 'REPLAYED';
  tenantId: string;
  actorUserId: string;
  requestId: string;
  commandId: string;
  inviteId: string;
  outboxStatus: typeof CANCELED_STATUS;
  claimReleased: true;
  createdTransactionId: string;
}>;

export interface EmployeeInviteDeliveryDriver {
  issue(
    input: EmployeeInviteDeliveryInput,
  ): Promise<EmployeeInviteDeliveryReceipt>;
  reissue(
    input: EmployeeInviteDeliveryInput,
  ): Promise<EmployeeInviteDeliveryReceipt>;
  revoke(
    input: EmployeeInviteRevokeInput,
  ): Promise<EmployeeInviteRevokeReceipt>;
}

export interface EmployeeInviteFreshNetworkAuthority {
  assertNetwork(user: AuthenticatedUser): Promise<FreshStoreScope>;
}

export interface EmployeeInviteEnvelope {
  seal(binding: EmployeeInviteSecretBinding): SealedEmployeeInviteToken;
}

export type EmployeeInviteCoordinatorResult = Readonly<{
  ok: true;
  coordinatorContract: typeof COORDINATOR_CONTRACT;
  operation:
    | typeof ISSUE_OPERATION
    | typeof REISSUE_OPERATION
    | typeof REVOKE_OPERATION;
  decision: 'CREATED' | 'REISSUED' | 'REVOKED' | 'REPLAYED';
  replayed: boolean;
  tenantId: string;
  invite: {
    id: string;
    deliveryStatus: typeof PENDING_STATUS | typeof CANCELED_STATUS;
    expiresAt: string | null;
  };
  replacedInviteId: string | null;
}>;

/**
 * Candidate application seam for an external tenant OWNER creating employee
 * accounts through mailbox-bound invitations. It is intentionally absent from
 * UsersModule and has no production execution mode.
 */
export class EmployeeInviteDeliveryCoordinator {
  constructor(
    private readonly freshNetworkAuthority: EmployeeInviteFreshNetworkAuthority,
    private readonly driver: EmployeeInviteDeliveryDriver,
    private readonly envelope: EmployeeInviteEnvelope,
    private readonly policy: EmployeeInviteDormantPolicy = EMPLOYEE_INVITE_DORMANT_POLICY,
    private readonly clock: () => Date = () => new Date(),
    private readonly uuidFactory: () => string = randomUUID,
  ) {}

  async issue(
    actor: AuthenticatedUser,
    command: unknown,
  ): Promise<EmployeeInviteCoordinatorResult> {
    this.assertDormantPolicy();
    const scope = await this.assertFreshNetworkOwner(actor);
    const parsed = this.parseIssueCommand(command);
    return this.deliver(ISSUE_OPERATION, actor, scope, null, parsed);
  }

  async reissue(
    actor: AuthenticatedUser,
    previousInviteId: unknown,
    command: unknown,
  ): Promise<EmployeeInviteCoordinatorResult> {
    this.assertDormantPolicy();
    const scope = await this.assertFreshNetworkOwner(actor);
    const replacedId = requiredUuid(previousInviteId, 'previousInviteId');
    const parsed = this.parseIssueCommand(command);
    return this.deliver(REISSUE_OPERATION, actor, scope, replacedId, parsed);
  }

  async revoke(
    actor: AuthenticatedUser,
    inviteIdValue: unknown,
    command: unknown,
  ): Promise<EmployeeInviteCoordinatorResult> {
    this.assertDormantPolicy();
    const scope = await this.assertFreshNetworkOwner(actor);
    const inviteId = requiredUuid(inviteIdValue, 'inviteId');
    const parsed = exactRecord(command, REVOKE_FIELDS);
    const requestId = requiredUuid(parsed.requestId, 'requestId');
    const reason = requiredText(parsed.reason, 'reason', 8, 500);
    const input: EmployeeInviteRevokeInput = Object.freeze({
      operation: REVOKE_OPERATION,
      commandId: this.candidateUuid(),
      requestId,
      requestDigest: digest({
        coordinatorContract: COORDINATOR_CONTRACT,
        operation: REVOKE_OPERATION,
        tenantId: scope.tenantId,
        actorUserId: scope.userId,
        inviteId,
        requestId,
        reasonDigest: digestText('revoke-reason', reason),
      }),
      actorUserId: scope.userId,
      tenantId: scope.tenantId,
      inviteId,
    });
    const receipt = await this.withBoundedReplay(() =>
      this.driver.revoke(input),
    );
    this.assertRevokeReceipt(receipt, input);
    return {
      ok: true,
      coordinatorContract: COORDINATOR_CONTRACT,
      operation: REVOKE_OPERATION,
      decision: receipt.decision,
      replayed: receipt.decision === 'REPLAYED',
      tenantId: receipt.tenantId,
      invite: {
        id: receipt.inviteId,
        deliveryStatus: CANCELED_STATUS,
        expiresAt: null,
      },
      replacedInviteId: null,
    };
  }

  private async deliver(
    operation: EmployeeInviteOperation,
    actor: AuthenticatedUser,
    freshScope: FreshStoreScope,
    previousInviteId: string | null,
    command: ParsedIssueCommand,
  ): Promise<EmployeeInviteCoordinatorResult> {
    const identifiers = {
      commandId: this.candidateUuid(),
      deliveryLocator: this.candidateUuid(),
      inviteId: this.candidateUuid(),
      outboxId: this.candidateUuid(),
      messageKey: this.candidateUuid(),
    };
    const reservationSubjectId =
      operation === ISSUE_OPERATION ? identifiers.deliveryLocator : null;
    const requestDigest = digest({
      coordinatorContract: COORDINATOR_CONTRACT,
      operation,
      requestId: command.requestId,
      tenantId: freshScope.tenantId,
      actorUserId: freshScope.userId,
      previousInviteId,
      email: command.email,
      fullName: command.fullName,
      role: command.role,
      customRoleId: command.customRoleId,
      scope: command.scope,
      storeIds: command.storeIds,
      expiresAt: command.expiresAt.toISOString(),
    });
    const binding: EmployeeInviteSecretBinding = {
      tenantId: freshScope.tenantId,
      deliveryLocator: identifiers.deliveryLocator,
      inviteId: identifiers.inviteId,
      outboxId: identifiers.outboxId,
      template: EMPLOYEE_INVITE_MAIL_TEMPLATE,
      messageKey: identifiers.messageKey,
      requestDigest,
      recipientEmail: command.email,
      expiresAt: command.expiresAt,
    };
    const sealed = this.envelope.seal(binding);
    try {
      this.assertSealed(sealed);
      const input: EmployeeInviteDeliveryInput = Object.freeze({
        operation,
        ...identifiers,
        requestId: command.requestId,
        requestDigest,
        actorUserId: freshScope.userId,
        tenantId: freshScope.tenantId,
        previousInviteId,
        reservationSubjectId,
        email: command.email,
        fullName: command.fullName,
        role: command.role,
        customRoleId: command.customRoleId,
        scope: command.scope,
        storeIds: command.storeIds,
        tokenHash: sealed.tokenHash,
        tokenDigestVersion: sealed.digestVersion,
        secretCiphertext: sealed.secretCiphertext,
        envelopeVersion: sealed.envelopeVersion,
        keyVersion: sealed.keyVersion,
        aadEnvironment: sealed.aadEnvironment,
        expiresAt: command.expiresAt,
      });
      const receipt = await this.withBoundedReplay(() =>
        operation === ISSUE_OPERATION
          ? this.driver.issue(input)
          : this.driver.reissue(input),
      );
      this.assertDeliveryReceipt(receipt, input);
      return {
        ok: true,
        coordinatorContract: COORDINATOR_CONTRACT,
        operation,
        decision:
          receipt.decision === 'REPLAYED'
            ? 'REPLAYED'
            : operation === ISSUE_OPERATION
              ? 'CREATED'
              : 'REISSUED',
        replayed: receipt.decision === 'REPLAYED',
        tenantId: receipt.tenantId,
        invite: {
          id: receipt.inviteId,
          deliveryStatus: PENDING_STATUS,
          expiresAt: new Date(receipt.expiresAtEpochMs).toISOString(),
        },
        replacedInviteId: receipt.previousInviteId,
      };
    } finally {
      sealed.secretCiphertext.fill(0);
    }
  }

  private async assertFreshNetworkOwner(
    actor: AuthenticatedUser,
  ): Promise<FreshStoreScope> {
    if (
      !actor ||
      actor.isPlatformAdmin ||
      actor.role !== UserRole.OWNER ||
      actor.isActive === false ||
      !hasCapability(actor, 'manage_users') ||
      !uuid(actor.id) ||
      !uuid(actor.tenantId)
    ) {
      throw new ForbiddenException('Active tenant NETWORK OWNER is required');
    }
    const fresh = await this.freshNetworkAuthority.assertNetwork(actor);
    if (
      fresh.userId !== actor.id ||
      fresh.tenantId !== actor.tenantId ||
      fresh.tenantSlug !== actor.tenantSlug ||
      fresh.mode !== 'NETWORK' ||
      fresh.allowedStoreIds.length !== 0
    ) {
      throw new ServiceUnavailableException({
        message: 'Fresh employee invite authority is invalid',
        reasonCode: 'EMPLOYEE_INVITE_FRESH_AUTHORITY_INVALID',
      });
    }
    return fresh;
  }

  private parseIssueCommand(value: unknown): ParsedIssueCommand {
    const command = exactRecord(value, ISSUE_FIELDS);
    const requestId = requiredUuid(command.requestId, 'requestId');
    if (!isCanonicalIdentityEmail(command.email)) {
      throw invalidCommand();
    }
    const fullName = nullableText(command.fullName, 'fullName', 200);
    const role = employeeRole(command.role);
    const customRoleId = nullableUuid(command.customRoleId, 'customRoleId');
    if (customRoleId !== null && role !== UserRole.CLUB_ADMINISTRATOR) {
      throw invalidCommand();
    }
    const scope = employeeScope(command.scope);
    const storeIds = canonicalStoreIds(command.storeIds);
    if (
      (scope === 'NETWORK' && storeIds.length !== 0) ||
      (scope === 'STORES' && storeIds.length === 0)
    ) {
      throw invalidCommand();
    }
    const expiresAt = boundedFuture(command.expiresAt, this.clock());
    return {
      requestId,
      email: command.email,
      fullName,
      role,
      customRoleId,
      scope,
      storeIds,
      expiresAt,
    };
  }

  private assertSealed(sealed: SealedEmployeeInviteToken): void {
    if (
      !SHA256_PATTERN.test(sealed.tokenHash) ||
      sealed.digestVersion !== EMPLOYEE_INVITE_DIGEST_VERSION ||
      !Buffer.isBuffer(sealed.secretCiphertext) ||
      sealed.secretCiphertext.length !==
        EMPLOYEE_INVITE_SECRET_ENVELOPE_BYTES ||
      sealed.envelopeVersion !== EMPLOYEE_INVITE_ENVELOPE_VERSION ||
      !validLabel(sealed.keyVersion, 16) ||
      !validLabel(sealed.aadEnvironment, 64)
    ) {
      throw new ServiceUnavailableException({
        message: 'Employee invite sealed payload is invalid',
        reasonCode: 'EMPLOYEE_INVITE_SEALED_PAYLOAD_INVALID',
      });
    }
  }

  private assertDeliveryReceipt(
    receipt: EmployeeInviteDeliveryReceipt,
    input: EmployeeInviteDeliveryInput,
  ): void {
    if (
      !exactKeys(receipt, DELIVERY_RECEIPT_FIELDS) ||
      receipt.schemaVersion !== 1 ||
      receipt.operation !== input.operation ||
      !['CREATED', 'REPLAYED'].includes(receipt.decision) ||
      receipt.tenantId !== input.tenantId ||
      receipt.actorUserId !== input.actorUserId ||
      receipt.requestId !== input.requestId ||
      receipt.outboxStatus !== PENDING_STATUS ||
      !uuid(receipt.commandId) ||
      !uuid(receipt.inviteId) ||
      !uuid(receipt.outboxId) ||
      (receipt.previousInviteId !== null && !uuid(receipt.previousInviteId)) ||
      receipt.previousInviteId !== input.previousInviteId ||
      !positiveSafeInteger(receipt.expiresAtEpochMs) ||
      receipt.expiresAtEpochMs !== input.expiresAt.getTime() ||
      !transactionId(receipt.createdTransactionId)
    ) {
      throw invalidReceipt();
    }
  }

  private assertRevokeReceipt(
    receipt: EmployeeInviteRevokeReceipt,
    input: EmployeeInviteRevokeInput,
  ): void {
    if (
      !exactKeys(receipt, REVOKE_RECEIPT_FIELDS) ||
      receipt.schemaVersion !== 1 ||
      receipt.operation !== REVOKE_OPERATION ||
      !['REVOKED', 'REPLAYED'].includes(receipt.decision) ||
      receipt.tenantId !== input.tenantId ||
      receipt.actorUserId !== input.actorUserId ||
      receipt.requestId !== input.requestId ||
      receipt.inviteId !== input.inviteId ||
      !uuid(receipt.commandId) ||
      receipt.outboxStatus !== CANCELED_STATUS ||
      receipt.claimReleased !== true ||
      !transactionId(receipt.createdTransactionId)
    ) {
      throw invalidReceipt();
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
        if (!ambiguousFailure(error)) {
          throw containedFailure(error);
        }
        if (attempt === this.policy.lostResponseRetries) {
          throw new ServiceUnavailableException({
            message: 'Employee invite operation requires reconciliation',
            reasonCode: 'EMPLOYEE_INVITE_RECONCILIATION_REQUIRED',
          });
        }
      }
    }
    throw new ServiceUnavailableException({
      message: 'Employee invite operation requires reconciliation',
      reasonCode: 'EMPLOYEE_INVITE_RECONCILIATION_REQUIRED',
    });
  }

  private assertDormantPolicy(): void {
    if (
      process.env.NODE_ENV === 'production' ||
      this.policy.enabled !== true ||
      this.policy.executionMode !== 'DORMANT_TEST_ONLY' ||
      !['test', 'ci'].includes(this.policy.environment) ||
      ![0, 1].includes(this.policy.lostResponseRetries)
    ) {
      throw new ServiceUnavailableException({
        message: 'Employee invite delivery coordinator is dormant',
        reasonCode: 'EMPLOYEE_INVITE_COORDINATOR_DORMANT',
      });
    }
  }

  private candidateUuid(): string {
    return requiredUuid(this.uuidFactory(), 'candidateId');
  }
}

const DELIVERY_RECEIPT_FIELDS = new Set([
  'schemaVersion',
  'operation',
  'decision',
  'tenantId',
  'actorUserId',
  'requestId',
  'commandId',
  'previousInviteId',
  'inviteId',
  'outboxId',
  'outboxStatus',
  'expiresAtEpochMs',
  'createdTransactionId',
]);
const REVOKE_RECEIPT_FIELDS = new Set([
  'schemaVersion',
  'operation',
  'decision',
  'tenantId',
  'actorUserId',
  'requestId',
  'commandId',
  'inviteId',
  'outboxStatus',
  'claimReleased',
  'createdTransactionId',
]);

type EmployeeInviteRpcClient = Pick<Prisma.TransactionClient, '$queryRaw'>;

/** Candidate-only exact RPC adapter; it is not a Nest provider. */
export class PrismaEmployeeInviteDeliveryDriver implements EmployeeInviteDeliveryDriver {
  constructor(private readonly prisma: Pick<PrismaService, '$transaction'>) {}

  issue(
    input: EmployeeInviteDeliveryInput,
  ): Promise<EmployeeInviteDeliveryReceipt> {
    return this.deliveryRpc(
      'identity_employee_invite_issue_current189_v1',
      input,
    );
  }

  reissue(
    input: EmployeeInviteDeliveryInput,
  ): Promise<EmployeeInviteDeliveryReceipt> {
    return this.deliveryRpc(
      'identity_employee_invite_reissue_current189_v1',
      input,
    );
  }

  revoke(
    input: EmployeeInviteRevokeInput,
  ): Promise<EmployeeInviteRevokeReceipt> {
    return this.transaction(input.tenantId, (tx) =>
      this.oneReceipt<EmployeeInviteRevokeReceipt>(
        tx,
        Prisma.sql`
          SELECT public."identity_employee_invite_revoke_current189_v1"(
            ${input.commandId}::TEXT,
            ${input.tenantId}::TEXT,
            ${input.actorUserId}::TEXT,
            ${input.requestId}::TEXT,
            ${input.requestDigest}::TEXT,
            ${input.inviteId}::TEXT
          ) AS receipt
        `,
      ),
    );
  }

  private deliveryRpc(
    functionName:
      | 'identity_employee_invite_issue_current189_v1'
      | 'identity_employee_invite_reissue_current189_v1',
    input: EmployeeInviteDeliveryInput,
  ): Promise<EmployeeInviteDeliveryReceipt> {
    const query = Prisma.sql`
      SELECT public.${Prisma.raw(`"${functionName}"`)}(
        ${input.commandId}::TEXT,
        ${input.tenantId}::TEXT,
        ${input.actorUserId}::TEXT,
        ${input.requestId}::TEXT,
        ${input.requestDigest}::TEXT,
        ${input.previousInviteId}::TEXT,
        ${input.reservationSubjectId}::TEXT,
        ${input.deliveryLocator}::TEXT,
        ${input.inviteId}::TEXT,
        ${input.outboxId}::TEXT,
        ${input.messageKey}::TEXT,
        ${input.email}::TEXT,
        ${input.fullName}::TEXT,
        ${input.role}::TEXT,
        ${input.customRoleId}::TEXT,
        ${input.scope}::TEXT,
        ${[...input.storeIds]}::TEXT[],
        ${input.tokenHash}::TEXT,
        ${input.secretCiphertext}::BYTEA,
        ${input.envelopeVersion}::INTEGER,
        ${input.keyVersion}::TEXT,
        ${input.aadEnvironment}::TEXT,
        ${input.expiresAt}::TIMESTAMP(3) WITH TIME ZONE
      ) AS receipt
    `;
    return this.transaction(input.tenantId, (tx) =>
      this.oneReceipt<EmployeeInviteDeliveryReceipt>(tx, query),
    );
  }

  private transaction<T>(
    tenantId: string,
    operation: (tx: EmployeeInviteRpcClient) => Promise<T>,
  ): Promise<T> {
    if (!uuid(tenantId)) {
      return Promise.reject(invalidReceipt());
    }
    return this.prisma.$transaction(async (tx) => {
      const settings = await tx.$queryRaw<
        Array<{
          isolationLevel: string;
          statementTimeout: string;
          lockTimeout: string;
        }>
      >(Prisma.sql`
        SELECT
          pg_catalog.current_setting('transaction_isolation') AS "isolationLevel",
          pg_catalog.set_config('statement_timeout', '25s', true) AS "statementTimeout",
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
      return operation(tx);
    }, EMPLOYEE_INVITE_TRANSACTION_OPTIONS);
  }

  private async oneReceipt<T>(
    tx: EmployeeInviteRpcClient,
    query: Prisma.Sql,
  ): Promise<T> {
    const rows = await tx.$queryRaw<Array<{ receipt: T }>>(query);
    if (rows.length !== 1 || !rows[0]?.receipt) {
      throw invalidReceipt();
    }
    return rows[0].receipt;
  }
}

function employeeRole(value: unknown): UserRole {
  if (
    typeof value !== 'string' ||
    !Object.values(UserRole).includes(value as UserRole) ||
    value === UserRole.OWNER
  ) {
    throw invalidCommand();
  }
  return value as UserRole;
}

function employeeScope(value: unknown): EmployeeInviteScope {
  if (value !== 'NETWORK' && value !== 'STORES') {
    throw invalidCommand();
  }
  return value;
}

function canonicalStoreIds(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length > MAXIMUM_STORES) {
    throw invalidCommand();
  }
  const ids = value.map((item) => requiredUuid(item, 'storeId'));
  if (new Set(ids).size !== ids.length) {
    throw invalidCommand();
  }
  return Object.freeze(
    [...ids].sort((left, right) => left.localeCompare(right)),
  );
}

function boundedFuture(value: unknown, now: Date): Date {
  if (
    typeof value !== 'string' ||
    !CANONICAL_TIMESTAMP_PATTERN.test(value) ||
    !Number.isFinite(now.getTime())
  ) {
    throw invalidCommand();
  }
  const expiresAt = new Date(value);
  if (
    !Number.isFinite(expiresAt.getTime()) ||
    expiresAt.toISOString() !== value ||
    expiresAt.getTime() < now.getTime() + MINIMUM_LIFETIME_MS ||
    expiresAt.getTime() > now.getTime() + MAXIMUM_LIFETIME_MS
  ) {
    throw invalidCommand();
  }
  return expiresAt;
}

function nullableText(
  value: unknown,
  field: string,
  maximum: number,
): string | null {
  if (value === null) {
    return null;
  }
  return requiredText(value, field, 1, maximum);
}

function nullableUuid(value: unknown, field: string): string | null {
  return value === null ? null : requiredUuid(value, field);
}

function requiredText(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(`${field} must be a string`);
  }
  const result = value.trim();
  if (result.length < minimum || result.length > maximum) {
    throw invalidCommand();
  }
  return result;
}

function requiredUuid(value: unknown, field: string): string {
  if (!uuid(value)) {
    throw new BadRequestException(`${field} must be a canonical UUID`);
  }
  return value;
}

function exactRecord(
  value: unknown,
  keys: ReadonlySet<string>,
): Record<string, unknown> {
  if (!record(value) || !exactKeys(value, keys)) {
    throw invalidCommand();
  }
  return value;
}

function exactKeys(value: unknown, keys: ReadonlySet<string>): boolean {
  if (!record(value)) {
    return false;
  }
  const actual = Object.keys(value);
  return actual.length === keys.size && actual.every((key) => keys.has(key));
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function digestText(domain: string, value: string): string {
  return createHash('sha256')
    .update(COORDINATOR_CONTRACT)
    .update('\0')
    .update(domain)
    .update('\0')
    .update(value)
    .digest('hex');
}

function ambiguousFailure(error: unknown): boolean {
  const code = errorCode(error);
  const sqlState = databaseSqlState(error);
  return (
    ['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2034'].includes(
      code ?? '',
    ) ||
    sqlState?.startsWith('08') === true ||
    [
      '40001',
      '40003',
      '40P01',
      '55P03',
      '57014',
      '57P01',
      '57P02',
      '57P03',
    ].includes(sqlState ?? '')
  );
}

function containedFailure(error: unknown): Error {
  const sqlState = databaseSqlState(error);
  if (sqlState === '23505') {
    return new ConflictException({
      message: 'Employee invite conflicts with an existing identity workflow',
      reasonCode: 'EMPLOYEE_INVITE_IDENTITY_CONFLICT',
    });
  }
  if (sqlState === '22023') {
    return invalidCommand();
  }
  if (sqlState === '23503' || sqlState === '23514') {
    return new ConflictException({
      message: 'Employee invite state changed before completion',
      reasonCode: 'EMPLOYEE_INVITE_PRECONDITION_FAILED',
    });
  }
  if (sqlState === '42501') {
    return new ServiceUnavailableException({
      message: 'Employee invite boundary is not enrolled',
      reasonCode: 'EMPLOYEE_INVITE_BOUNDARY_NOT_ENROLLED',
    });
  }
  return new ServiceUnavailableException({
    message: 'Employee invite operation failed closed',
    reasonCode: 'EMPLOYEE_INVITE_OPERATION_CONTAINED',
  });
}

function databaseSqlState(error: unknown): string | null {
  const code = errorCode(error);
  if (
    code === 'P2010' &&
    record(error) &&
    record(error.meta) &&
    typeof error.meta.code === 'string' &&
    /^[0-9A-Z]{5}$/u.test(error.meta.code)
  ) {
    return error.meta.code;
  }
  return code && /^[0-9A-Z]{5}$/u.test(code) ? code : null;
}

function errorCode(error: unknown): string | null {
  return record(error) && typeof error.code === 'string' ? error.code : null;
}

function invalidCommand(): BadRequestException {
  return new BadRequestException({
    message: 'Employee invite command is invalid',
    reasonCode: 'EMPLOYEE_INVITE_COMMAND_INVALID',
  });
}

function invalidReceipt(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    message: 'Employee invite database receipt is invalid',
    reasonCode: 'EMPLOYEE_INVITE_RECEIPT_INVALID',
  });
}

function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function transactionId(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9][0-9]*$/u.test(value);
}

function validLabel(value: unknown, maximum: number): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= maximum &&
    value === value.trim() &&
    /^[A-Za-z0-9._-]+$/u.test(value)
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
