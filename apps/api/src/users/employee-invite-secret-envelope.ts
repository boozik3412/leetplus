import { ServiceUnavailableException } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { isCanonicalIdentityEmail } from '../utilities/canonical-identity-email';

const ALGORITHM = 'aes-256-gcm';
const TOKEN_BYTES = 32;
const TOKEN_CHARACTERS = 43;
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const CIPHERTEXT_BYTES = TOKEN_CHARACTERS;
const ENVELOPE_BYTES = NONCE_BYTES + CIPHERTEXT_BYTES + AUTH_TAG_BYTES;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const AAD_DOMAIN = 'leetplus:employee-invite-mail-secret-envelope' as const;
const AAD_SCHEMA_VERSION = 1 as const;

export const EMPLOYEE_INVITE_MAIL_TEMPLATE = 'EMPLOYEE_USER_INVITE' as const;
export const EMPLOYEE_INVITE_ENVELOPE_VERSION = 1 as const;
export const EMPLOYEE_INVITE_DIGEST_VERSION = 'sha256-v1' as const;
export const EMPLOYEE_INVITE_SECRET_ENVELOPE_BYTES = ENVELOPE_BYTES;

export type EmployeeInviteSecretBinding = Readonly<{
  tenantId: string;
  deliveryLocator: string;
  inviteId: string;
  outboxId: string;
  template: typeof EMPLOYEE_INVITE_MAIL_TEMPLATE;
  messageKey: string;
  requestDigest: string;
  recipientEmail: string;
  expiresAt: Date;
}>;

export type SealedEmployeeInviteToken = Readonly<{
  tokenHash: string;
  digestVersion: typeof EMPLOYEE_INVITE_DIGEST_VERSION;
  secretCiphertext: Buffer;
  envelopeVersion: typeof EMPLOYEE_INVITE_ENVELOPE_VERSION;
  keyVersion: string;
  aadEnvironment: string;
}>;

export type EmployeeInviteEnvelopeConfig = Readonly<{
  encryptionKey: Buffer;
  keyVersion: string;
  aadEnvironment: string;
}>;

type CanonicalBinding = Omit<EmployeeInviteSecretBinding, 'expiresAt'> & {
  expiresAt: string;
};

/**
 * Candidate-only employee invite envelope. It deliberately has a distinct AAD
 * domain/template and is not a Nest provider, so it cannot widen the sealed
 * INITIAL_OWNER_INVITE envelope through accidental dependency injection.
 */
export class EmployeeInviteSecretEnvelope {
  private readonly encryptionKey: Buffer;
  private readonly keyVersion: string;
  private readonly aadEnvironment: string;

  constructor(
    config: EmployeeInviteEnvelopeConfig,
    private readonly randomSource: (size: number) => Buffer = randomBytes,
  ) {
    if (
      !Buffer.isBuffer(config.encryptionKey) ||
      config.encryptionKey.length !== 32 ||
      !validLabel(config.keyVersion, 16) ||
      !validLabel(config.aadEnvironment, 64)
    ) {
      throw unavailable();
    }
    this.encryptionKey = Buffer.from(config.encryptionKey);
    this.keyVersion = config.keyVersion;
    this.aadEnvironment = config.aadEnvironment;
  }

  seal(binding: EmployeeInviteSecretBinding): SealedEmployeeInviteToken {
    const canonical = canonicalBinding(binding);
    let randomToken: Buffer | undefined;
    let plaintext: Buffer | undefined;

    try {
      randomToken = this.randomSource(TOKEN_BYTES);
      if (!Buffer.isBuffer(randomToken) || randomToken.length !== TOKEN_BYTES) {
        throw invalidEnvelope();
      }
      const rawToken = randomToken.toString('base64url');
      if (
        rawToken.length !== TOKEN_CHARACTERS ||
        !TOKEN_PATTERN.test(rawToken)
      ) {
        throw invalidEnvelope();
      }
      const tokenHash = sha256(rawToken);
      const nonce = this.randomSource(NONCE_BYTES);
      if (!Buffer.isBuffer(nonce) || nonce.length !== NONCE_BYTES) {
        throw invalidEnvelope();
      }
      const cipher = createCipheriv(ALGORITHM, this.encryptionKey, nonce, {
        authTagLength: AUTH_TAG_BYTES,
      });
      plaintext = Buffer.from(rawToken, 'utf8');
      cipher.setAAD(
        aad(canonical, tokenHash, this.keyVersion, this.aadEnvironment),
        { plaintextLength: plaintext.length },
      );
      const ciphertext = Buffer.concat([
        cipher.update(plaintext),
        cipher.final(),
      ]);
      const secretCiphertext = Buffer.concat([
        nonce,
        ciphertext,
        cipher.getAuthTag(),
      ]);
      if (secretCiphertext.length !== ENVELOPE_BYTES) {
        secretCiphertext.fill(0);
        throw invalidEnvelope();
      }
      return {
        tokenHash,
        digestVersion: EMPLOYEE_INVITE_DIGEST_VERSION,
        secretCiphertext,
        envelopeVersion: EMPLOYEE_INVITE_ENVELOPE_VERSION,
        keyVersion: this.keyVersion,
        aadEnvironment: this.aadEnvironment,
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw unavailable();
    } finally {
      plaintext?.fill(0);
      randomToken?.fill(0);
    }
  }

  open(
    binding: EmployeeInviteSecretBinding,
    sealed: SealedEmployeeInviteToken,
  ): string {
    const canonical = canonicalBinding(binding);
    let plaintext: Buffer | undefined;
    const chunks: Buffer[] = [];
    try {
      if (
        sealed.digestVersion !== EMPLOYEE_INVITE_DIGEST_VERSION ||
        sealed.envelopeVersion !== EMPLOYEE_INVITE_ENVELOPE_VERSION ||
        sealed.keyVersion !== this.keyVersion ||
        sealed.aadEnvironment !== this.aadEnvironment ||
        !SHA256_PATTERN.test(sealed.tokenHash) ||
        !Buffer.isBuffer(sealed.secretCiphertext) ||
        sealed.secretCiphertext.length !== ENVELOPE_BYTES
      ) {
        throw invalidEnvelope();
      }
      const nonce = sealed.secretCiphertext.subarray(0, NONCE_BYTES);
      const ciphertext = sealed.secretCiphertext.subarray(
        NONCE_BYTES,
        NONCE_BYTES + CIPHERTEXT_BYTES,
      );
      const authTag = sealed.secretCiphertext.subarray(
        NONCE_BYTES + CIPHERTEXT_BYTES,
      );
      const decipher = createDecipheriv(ALGORITHM, this.encryptionKey, nonce, {
        authTagLength: AUTH_TAG_BYTES,
      });
      decipher.setAAD(
        aad(canonical, sealed.tokenHash, this.keyVersion, this.aadEnvironment),
        { plaintextLength: ciphertext.length },
      );
      decipher.setAuthTag(authTag);
      chunks.push(decipher.update(ciphertext));
      chunks.push(decipher.final());
      plaintext = Buffer.concat(chunks);
      const token = plaintext.toString('utf8');
      if (!TOKEN_PATTERN.test(token) || !verifyHash(token, sealed.tokenHash)) {
        throw invalidEnvelope();
      }
      return token;
    } catch {
      throw invalidEnvelope();
    } finally {
      plaintext?.fill(0);
      for (const chunk of chunks) {
        chunk.fill(0);
      }
    }
  }
}

function canonicalBinding(
  binding: EmployeeInviteSecretBinding,
): CanonicalBinding {
  if (
    !binding ||
    !uuid(binding.tenantId) ||
    !uuid(binding.deliveryLocator) ||
    !uuid(binding.inviteId) ||
    !uuid(binding.outboxId) ||
    binding.template !== EMPLOYEE_INVITE_MAIL_TEMPLATE ||
    !uuid(binding.messageKey) ||
    !SHA256_PATTERN.test(binding.requestDigest) ||
    !isCanonicalIdentityEmail(binding.recipientEmail) ||
    !(binding.expiresAt instanceof Date) ||
    !Number.isFinite(binding.expiresAt.getTime())
  ) {
    throw invalidEnvelope();
  }
  return { ...binding, expiresAt: binding.expiresAt.toISOString() };
}

function aad(
  binding: CanonicalBinding,
  tokenHash: string,
  keyVersion: string,
  aadEnvironment: string,
): Buffer {
  return Buffer.from(
    JSON.stringify({
      domain: AAD_DOMAIN,
      schemaVersion: AAD_SCHEMA_VERSION,
      environment: aadEnvironment,
      ...binding,
      tokenHash,
      digestVersion: EMPLOYEE_INVITE_DIGEST_VERSION,
      keyVersion,
      envelopeVersion: EMPLOYEE_INVITE_ENVELOPE_VERSION,
    }),
    'utf8',
  );
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function verifyHash(token: string, expected: string): boolean {
  const actual = createHash('sha256').update(token).digest();
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}

function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
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

function unavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    message: 'Employee invite encryption is unavailable',
    reasonCode: 'EMPLOYEE_INVITE_ENCRYPTION_UNAVAILABLE',
  });
}

function invalidEnvelope(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    message: 'Employee invite secret envelope is invalid',
    reasonCode: 'EMPLOYEE_INVITE_SECRET_ENVELOPE_INVALID',
  });
}
