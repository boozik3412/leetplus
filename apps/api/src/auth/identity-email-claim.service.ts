import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IdentityEmailClaimType, Prisma } from '@prisma/client';
import { createHmac } from 'node:crypto';

const IDENTITY_EMAIL_FINGERPRINT_KEY = 'IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY';
const IDENTITY_EMAIL_FINGERPRINT_KEY_VERSION =
  'IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY_VERSION';
const SUPPORTED_FINGERPRINT_KEY_VERSION = 'v1';
const FINGERPRINT_DOMAIN = 'leetplus:identity-email-fingerprint:v1\0';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SAFE_ASCII_EMAIL_PATTERN = /^[^@ ]+@[^@ ]+\.[^@ ]+$/u;
const MINIMUM_HMAC_KEY_BYTES = 32;
const MAXIMUM_HMAC_KEY_BYTES = 4096;
declare const identityEmailClaimTransactionBrand: unique symbol;

export type IdentityEmailClaimTransaction = Pick<
  Prisma.TransactionClient,
  '$queryRaw'
> & {
  readonly [identityEmailClaimTransactionBrand]: true;
};

export type IdentityEmailFingerprint = {
  fingerprint: string;
  keyVersion: typeof SUPPORTED_FINGERPRINT_KEY_VERSION;
};

export type ReserveIdentityInviteInput = {
  email: string;
  tenantId: string;
  subjectId: string;
};

export type AssertIdentityInviteInput = {
  email: string;
  tenantId: string;
  subjectId: string;
  expectedRevision: number;
};

export type TransitionIdentityInviteInput = {
  email: string;
  tenantId: string;
  expectedSubjectId: string;
  expectedRevision: number;
  nextClaimType:
    | typeof IdentityEmailClaimType.INVITE
    | typeof IdentityEmailClaimType.USER;
  nextSubjectId: string;
};

export type ReleaseIdentityInviteInput = {
  email: string;
  tenantId: string;
  expectedSubjectId: string;
  expectedRevision: number;
};

export type ReserveIdentityInviteReceipt = IdentityEmailFingerprint & {
  schemaVersion: 1;
  operation: 'RESERVE_INVITE';
  decision: 'CREATED' | 'ALREADY_RESERVED';
  claimType: typeof IdentityEmailClaimType.INVITE;
  tenantId: string;
  subjectId: string;
  revision: number;
};

export type AssertIdentityInviteReceipt = {
  schemaVersion: 1;
  operation: 'ASSERT_INVITE';
  decision: 'MATCHED';
  claimType: typeof IdentityEmailClaimType.INVITE;
  tenantId: string;
  subjectId: string;
  revision: number;
};

export type TransitionIdentityInviteReceipt = {
  schemaVersion: 1;
  operation: 'TRANSITION_INVITE';
  decision: 'TRANSITIONED' | 'ALREADY_TRANSITIONED';
  claimType:
    | typeof IdentityEmailClaimType.INVITE
    | typeof IdentityEmailClaimType.USER;
  tenantId: string;
  subjectId: string;
  revision: number;
};

export type ReleaseIdentityInviteReceipt = {
  schemaVersion: 1;
  operation: 'RELEASE_INVITE';
  decision: 'RELEASED';
  tenantId: string;
  subjectId: string;
  releasedRevision: number;
};

type JsonRpcRow = {
  receipt: Prisma.JsonValue;
};

@Injectable()
export class IdentityEmailClaimService {
  constructor(private readonly configService: ConfigService) {}

  bindTransaction(tx: Prisma.TransactionClient): IdentityEmailClaimTransaction {
    const candidate = tx as unknown as Record<string, unknown>;
    if (
      typeof candidate.$connect === 'function' ||
      typeof candidate.$disconnect === 'function'
    ) {
      throw new ServiceUnavailableException({
        message: 'Identity claim command requires an interactive transaction',
        reasonCode: 'IDENTITY_CLAIM_TRANSACTION_REQUIRED',
      });
    }
    return tx as unknown as IdentityEmailClaimTransaction;
  }

  fingerprint(email: string): IdentityEmailFingerprint {
    const canonicalEmail = this.canonicalEmail(email);
    const { key, keyVersion } = this.fingerprintKey();
    return {
      fingerprint: createHmac('sha256', key)
        .update(FINGERPRINT_DOMAIN)
        .update(canonicalEmail)
        .digest('hex'),
      keyVersion,
    };
  }

  async reserveInvite(
    tx: IdentityEmailClaimTransaction,
    input: ReserveIdentityInviteInput,
  ): Promise<ReserveIdentityInviteReceipt> {
    const canonicalEmail = this.canonicalEmail(input.email);
    const tenantId = this.uuid(input.tenantId);
    const subjectId = this.uuid(input.subjectId);
    const fingerprint = this.fingerprint(canonicalEmail);

    try {
      const rows = await tx.$queryRaw<JsonRpcRow[]>(Prisma.sql`
        SELECT public."identity_email_claim_reserve_invite_v1"(
          ${canonicalEmail}::TEXT,
          ${tenantId}::TEXT,
          ${subjectId}::TEXT
        ) AS receipt
      `);
      const receipt = this.reserveReceipt(rows);
      if (
        receipt.tenantId !== tenantId ||
        receipt.subjectId !== subjectId ||
        receipt.revision !== 1
      ) {
        throw this.invalidReceipt();
      }
      return {
        ...receipt,
        ...fingerprint,
      };
    } catch (error) {
      throw this.boundaryError(error);
    }
  }

  async assertInvite(
    tx: IdentityEmailClaimTransaction,
    input: AssertIdentityInviteInput,
  ): Promise<AssertIdentityInviteReceipt> {
    const canonicalEmail = this.canonicalEmail(input.email);
    const tenantId = this.uuid(input.tenantId);
    const subjectId = this.uuid(input.subjectId);
    const expectedRevision = this.revision(input.expectedRevision);

    try {
      const rows = await tx.$queryRaw<JsonRpcRow[]>(Prisma.sql`
        SELECT public."identity_email_claim_assert_invite_v1"(
          ${canonicalEmail}::TEXT,
          ${tenantId}::TEXT,
          ${subjectId}::TEXT,
          ${expectedRevision}::INTEGER
        ) AS receipt
      `);
      const receipt = this.assertReceipt(rows);
      if (
        receipt.tenantId !== tenantId ||
        receipt.subjectId !== subjectId ||
        receipt.revision !== expectedRevision
      ) {
        throw this.invalidReceipt();
      }
      return receipt;
    } catch (error) {
      throw this.boundaryError(error);
    }
  }

  async transitionInvite(
    tx: IdentityEmailClaimTransaction,
    input: TransitionIdentityInviteInput,
  ): Promise<TransitionIdentityInviteReceipt> {
    const canonicalEmail = this.canonicalEmail(input.email);
    const tenantId = this.uuid(input.tenantId);
    const expectedSubjectId = this.uuid(input.expectedSubjectId);
    const expectedRevision = this.revision(input.expectedRevision);
    const nextSubjectId = this.uuid(input.nextSubjectId);
    if (expectedSubjectId === nextSubjectId) {
      throw this.invalidCommand();
    }
    if (
      input.nextClaimType !== IdentityEmailClaimType.INVITE &&
      input.nextClaimType !== IdentityEmailClaimType.USER
    ) {
      throw this.invalidCommand();
    }

    try {
      const rows = await tx.$queryRaw<JsonRpcRow[]>(Prisma.sql`
        SELECT public."identity_email_claim_transition_v1"(
          ${canonicalEmail}::TEXT,
          ${tenantId}::TEXT,
          ${IdentityEmailClaimType.INVITE}::TEXT,
          ${expectedSubjectId}::TEXT,
          ${expectedRevision}::INTEGER,
          ${input.nextClaimType}::TEXT,
          ${nextSubjectId}::TEXT
        ) AS receipt
      `);
      const receipt = this.transitionReceipt(rows);
      if (
        receipt.tenantId !== tenantId ||
        receipt.subjectId !== nextSubjectId ||
        receipt.claimType !== input.nextClaimType ||
        receipt.revision !== expectedRevision + 1
      ) {
        throw this.invalidReceipt();
      }
      return receipt;
    } catch (error) {
      throw this.boundaryError(error);
    }
  }

  async releaseInvite(
    tx: IdentityEmailClaimTransaction,
    input: ReleaseIdentityInviteInput,
  ): Promise<ReleaseIdentityInviteReceipt> {
    const canonicalEmail = this.canonicalEmail(input.email);
    const tenantId = this.uuid(input.tenantId);
    const expectedSubjectId = this.uuid(input.expectedSubjectId);
    const expectedRevision = this.revision(input.expectedRevision);

    try {
      const rows = await tx.$queryRaw<JsonRpcRow[]>(Prisma.sql`
        SELECT public."identity_email_claim_release_v1"(
          ${canonicalEmail}::TEXT,
          ${tenantId}::TEXT,
          ${IdentityEmailClaimType.INVITE}::TEXT,
          ${expectedSubjectId}::TEXT,
          ${expectedRevision}::INTEGER
        ) AS receipt
      `);
      const receipt = this.releaseReceipt(rows);
      if (
        receipt.tenantId !== tenantId ||
        receipt.subjectId !== expectedSubjectId ||
        receipt.releasedRevision !== expectedRevision
      ) {
        throw this.invalidReceipt();
      }
      return receipt;
    } catch (error) {
      throw this.boundaryError(error);
    }
  }

  private reserveReceipt(
    rows: JsonRpcRow[],
  ): Omit<ReserveIdentityInviteReceipt, keyof IdentityEmailFingerprint> {
    const receipt = this.receiptRecord(rows, [
      'schemaVersion',
      'operation',
      'decision',
      'claimType',
      'tenantId',
      'subjectId',
      'revision',
    ]);
    if (
      receipt.schemaVersion !== 1 ||
      receipt.operation !== 'RESERVE_INVITE' ||
      (receipt.decision !== 'CREATED' &&
        receipt.decision !== 'ALREADY_RESERVED') ||
      receipt.claimType !== IdentityEmailClaimType.INVITE
    ) {
      throw this.invalidReceipt();
    }
    return {
      schemaVersion: 1,
      operation: 'RESERVE_INVITE',
      decision: receipt.decision,
      claimType: IdentityEmailClaimType.INVITE,
      tenantId: this.receiptUuid(receipt.tenantId),
      subjectId: this.receiptUuid(receipt.subjectId),
      revision: this.receiptRevision(receipt.revision),
    };
  }

  private assertReceipt(rows: JsonRpcRow[]): AssertIdentityInviteReceipt {
    const receipt = this.receiptRecord(rows, [
      'schemaVersion',
      'operation',
      'decision',
      'claimType',
      'tenantId',
      'subjectId',
      'revision',
    ]);
    if (
      receipt.schemaVersion !== 1 ||
      receipt.operation !== 'ASSERT_INVITE' ||
      receipt.decision !== 'MATCHED' ||
      receipt.claimType !== IdentityEmailClaimType.INVITE
    ) {
      throw this.invalidReceipt();
    }
    return {
      schemaVersion: 1,
      operation: 'ASSERT_INVITE',
      decision: 'MATCHED',
      claimType: IdentityEmailClaimType.INVITE,
      tenantId: this.receiptUuid(receipt.tenantId),
      subjectId: this.receiptUuid(receipt.subjectId),
      revision: this.receiptRevision(receipt.revision),
    };
  }

  private transitionReceipt(
    rows: JsonRpcRow[],
  ): TransitionIdentityInviteReceipt {
    const receipt = this.receiptRecord(rows, [
      'schemaVersion',
      'operation',
      'decision',
      'claimType',
      'tenantId',
      'subjectId',
      'revision',
    ]);
    if (
      receipt.schemaVersion !== 1 ||
      receipt.operation !== 'TRANSITION_INVITE' ||
      (receipt.decision !== 'TRANSITIONED' &&
        receipt.decision !== 'ALREADY_TRANSITIONED') ||
      (receipt.claimType !== IdentityEmailClaimType.INVITE &&
        receipt.claimType !== IdentityEmailClaimType.USER)
    ) {
      throw this.invalidReceipt();
    }
    return {
      schemaVersion: 1,
      operation: 'TRANSITION_INVITE',
      decision: receipt.decision,
      claimType: receipt.claimType,
      tenantId: this.receiptUuid(receipt.tenantId),
      subjectId: this.receiptUuid(receipt.subjectId),
      revision: this.receiptRevision(receipt.revision),
    };
  }

  private releaseReceipt(rows: JsonRpcRow[]): ReleaseIdentityInviteReceipt {
    const receipt = this.receiptRecord(rows, [
      'schemaVersion',
      'operation',
      'decision',
      'tenantId',
      'subjectId',
      'releasedRevision',
    ]);
    if (
      receipt.schemaVersion !== 1 ||
      receipt.operation !== 'RELEASE_INVITE' ||
      receipt.decision !== 'RELEASED'
    ) {
      throw this.invalidReceipt();
    }
    return {
      schemaVersion: 1,
      operation: 'RELEASE_INVITE',
      decision: receipt.decision,
      tenantId: this.receiptUuid(receipt.tenantId),
      subjectId: this.receiptUuid(receipt.subjectId),
      releasedRevision: this.receiptRevision(receipt.releasedRevision),
    };
  }

  private receiptRecord(
    rows: JsonRpcRow[],
    exactKeys: readonly string[],
  ): Record<string, unknown> {
    if (
      !Array.isArray(rows) ||
      rows.length !== 1 ||
      !this.record(rows[0]?.receipt)
    ) {
      throw this.invalidReceipt();
    }
    const receipt = rows[0].receipt;
    const actualKeys = Object.keys(receipt).sort();
    const expectedKeys = [...exactKeys].sort();
    if (
      actualKeys.length !== expectedKeys.length ||
      actualKeys.some((key, index) => key !== expectedKeys[index])
    ) {
      throw this.invalidReceipt();
    }
    return receipt;
  }

  private canonicalEmail(value: unknown): string {
    if (typeof value !== 'string' || !/^[ -~]+$/u.test(value)) {
      throw this.invalidEmail();
    }
    const canonical = value.trim().toLowerCase();
    if (
      canonical.length < 3 ||
      canonical.length > 320 ||
      !/^[!-~]+$/u.test(canonical) ||
      !SAFE_ASCII_EMAIL_PATTERN.test(canonical)
    ) {
      throw this.invalidEmail();
    }
    return canonical;
  }

  private uuid(value: unknown): string {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value.toLowerCase())) {
      throw this.invalidCommand();
    }
    return value.toLowerCase();
  }

  private revision(value: unknown): number {
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < 1
    ) {
      throw this.invalidCommand();
    }
    return value;
  }

  private receiptUuid(value: unknown): string {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
      throw this.invalidReceipt();
    }
    return value;
  }

  private receiptRevision(value: unknown): number {
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < 1
    ) {
      throw this.invalidReceipt();
    }
    return value;
  }

  private fingerprintKey(): {
    key: string;
    keyVersion: typeof SUPPORTED_FINGERPRINT_KEY_VERSION;
  } {
    const key = this.configService
      .get<string>(IDENTITY_EMAIL_FINGERPRINT_KEY)
      ?.trim();
    const keyVersion = this.configService
      .get<string>(IDENTITY_EMAIL_FINGERPRINT_KEY_VERSION)
      ?.trim();
    const keyBytes = key ? Buffer.byteLength(key, 'utf8') : 0;
    if (
      keyVersion !== SUPPORTED_FINGERPRINT_KEY_VERSION ||
      !key ||
      keyBytes < MINIMUM_HMAC_KEY_BYTES ||
      keyBytes > MAXIMUM_HMAC_KEY_BYTES
    ) {
      throw new ServiceUnavailableException({
        message: 'Identity email fingerprinting is unavailable',
        reasonCode: 'IDENTITY_EMAIL_FINGERPRINT_KEY_UNAVAILABLE',
      });
    }
    return { key, keyVersion };
  }

  private boundaryError(error: unknown): Error {
    if (
      error instanceof BadRequestException ||
      error instanceof ConflictException ||
      error instanceof ServiceUnavailableException
    ) {
      return error;
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034'
    ) {
      return new ConflictException({
        message: 'Identity claim command must be retried',
        reasonCode: 'IDENTITY_CLAIM_RETRY_REQUIRED',
      });
    }
    const sqlState = this.sqlState(error);
    if (sqlState === '22023') {
      return this.invalidEmail();
    }
    if (sqlState === '23505') {
      return new ConflictException({
        message: 'Identity email is unavailable',
        reasonCode: 'IDENTITY_EMAIL_UNAVAILABLE',
      });
    }
    if (sqlState === '23503') {
      return new ConflictException({
        message: 'Identity claim precondition failed',
        reasonCode: 'IDENTITY_CLAIM_PRECONDITION_FAILED',
      });
    }
    if (sqlState === '23514') {
      return new ConflictException({
        message: 'Identity claim state changed',
        reasonCode: 'IDENTITY_CLAIM_STATE_MISMATCH',
      });
    }
    if (sqlState === '42501') {
      return new ServiceUnavailableException({
        message: 'Identity claim boundary is not enrolled',
        reasonCode: 'IDENTITY_CLAIM_BOUNDARY_NOT_ENROLLED',
      });
    }
    return new ServiceUnavailableException({
      message: 'Identity claim boundary is unavailable',
      reasonCode: 'IDENTITY_CLAIM_BOUNDARY_UNAVAILABLE',
    });
  }

  private sqlState(error: unknown): string | null {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2010' ||
      !this.record(error.meta)
    ) {
      return null;
    }
    return typeof error.meta.code === 'string' ? error.meta.code : null;
  }

  private invalidEmail(): BadRequestException {
    return new BadRequestException({
      message: 'Identity email is invalid',
      reasonCode: 'IDENTITY_EMAIL_INVALID',
    });
  }

  private invalidCommand(): BadRequestException {
    return new BadRequestException({
      message: 'Identity claim command is invalid',
      reasonCode: 'IDENTITY_CLAIM_COMMAND_INVALID',
    });
  }

  private invalidReceipt(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      message: 'Identity claim boundary returned an invalid receipt',
      reasonCode: 'IDENTITY_CLAIM_RECEIPT_INVALID',
    });
  }

  private record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
