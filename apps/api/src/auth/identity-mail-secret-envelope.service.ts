import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import {
  decodeIdentityMailEncryptionKey,
  IDENTITY_MAIL_ENCRYPTION_KEY_VERSION,
  resolveIdentityMailAadEnvironment,
} from '../config/environment-validation';

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
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/u;
const IDENTITY_MAIL_AAD_DOMAIN =
  'leetplus:identity-mail-secret-envelope' as const;
const IDENTITY_MAIL_AAD_SCHEMA_VERSION = 1 as const;
const IDENTITY_MAIL_TEMPLATE = 'INITIAL_OWNER_INVITE' as const;
const INDEPENDENT_SECRET_KEYS = [
  'JWT_SECRET',
  'GUEST_PORTAL_JWT_SECRET',
  'GUEST_GAME_REFERRAL_SECRET',
  'APP_ENCRYPTION_KEY',
  'INTEGRATION_ENCRYPTION_KEY',
  'IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY',
  'SYNC_SERVICE_TOKEN',
] as const;

export const IDENTITY_MAIL_ENVELOPE_VERSION = 1 as const;
export const IDENTITY_MAIL_TOKEN_DIGEST_VERSION = 'sha256-v1' as const;
export const IDENTITY_MAIL_SECRET_ENVELOPE_BYTES = ENVELOPE_BYTES;

export type IdentityMailSecretBinding = {
  tenantId: string;
  workflowLocator: string;
  inviteId: string;
  outboxId: string;
  template: typeof IDENTITY_MAIL_TEMPLATE;
  messageKey: string;
  requestDigest: string;
  expiresAt: Date;
};

export type SealedIdentityMailInviteToken = {
  tokenHash: string;
  digestVersion: typeof IDENTITY_MAIL_TOKEN_DIGEST_VERSION;
  secretCiphertext: Buffer;
  envelopeVersion: typeof IDENTITY_MAIL_ENVELOPE_VERSION;
  keyVersion: typeof IDENTITY_MAIL_ENCRYPTION_KEY_VERSION;
  aadEnvironment: string;
};

export type OpenIdentityMailInviteTokenInput = IdentityMailSecretBinding & {
  tokenHash: string;
  digestVersion: typeof IDENTITY_MAIL_TOKEN_DIGEST_VERSION;
  secretCiphertext: Buffer;
  envelopeVersion: typeof IDENTITY_MAIL_ENVELOPE_VERSION;
  keyVersion: typeof IDENTITY_MAIL_ENCRYPTION_KEY_VERSION;
  aadEnvironment: string;
};

type CanonicalIdentityMailSecretBinding = Omit<
  IdentityMailSecretBinding,
  'expiresAt'
> & {
  expiresAt: string;
};

@Injectable()
export class IdentityMailSecretEnvelopeService {
  private readonly encryptionKey: Buffer;
  private readonly aadEnvironment: string;

  constructor(private readonly configService: ConfigService) {
    const configuredKey = this.configService.get<unknown>(
      'IDENTITY_MAIL_ENCRYPTION_KEY',
    );
    const configuredKeyVersion = this.configService.get<unknown>(
      'IDENTITY_MAIL_ENCRYPTION_KEY_VERSION',
    );
    const configuredAadEnvironment = this.configService.get<unknown>(
      'IDENTITY_MAIL_AAD_ENVIRONMENT',
    );
    const encryptionKey = decodeIdentityMailEncryptionKey(configuredKey);
    const aadEnvironment = resolveIdentityMailAadEnvironment(
      configuredAadEnvironment,
    );

    if (
      !encryptionKey ||
      configuredKeyVersion !== IDENTITY_MAIL_ENCRYPTION_KEY_VERSION ||
      !aadEnvironment ||
      this.reusesIndependentSecret(configuredKey)
    ) {
      throw this.configurationUnavailable();
    }

    this.encryptionKey = encryptionKey;
    this.aadEnvironment = aadEnvironment;
  }

  sealInitialOwnerInviteToken(
    binding: IdentityMailSecretBinding,
  ): SealedIdentityMailInviteToken {
    const canonicalBinding = this.canonicalBinding(binding);
    let plaintext: Buffer | undefined;
    let randomTokenBytes: Buffer | undefined;

    try {
      randomTokenBytes = this.secureRandomBytes(TOKEN_BYTES);
      const rawToken = randomTokenBytes.toString('base64url');
      if (
        rawToken.length !== TOKEN_CHARACTERS ||
        !TOKEN_PATTERN.test(rawToken)
      ) {
        throw this.invalidEnvelope();
      }

      const tokenHash = this.hashToken(rawToken);
      const nonce = this.secureRandomBytes(NONCE_BYTES);
      const cipher = createCipheriv(ALGORITHM, this.encryptionKey, nonce, {
        authTagLength: AUTH_TAG_BYTES,
      });
      plaintext = Buffer.from(rawToken, 'utf8');
      cipher.setAAD(
        this.canonicalAad(
          canonicalBinding,
          tokenHash,
          IDENTITY_MAIL_TOKEN_DIGEST_VERSION,
          IDENTITY_MAIL_ENCRYPTION_KEY_VERSION,
          IDENTITY_MAIL_ENVELOPE_VERSION,
        ),
        { plaintextLength: plaintext.length },
      );
      const ciphertext = Buffer.concat([
        cipher.update(plaintext),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      if (
        ciphertext.length !== CIPHERTEXT_BYTES ||
        authTag.length !== AUTH_TAG_BYTES
      ) {
        throw this.invalidEnvelope();
      }

      const secretCiphertext = Buffer.concat([nonce, ciphertext, authTag]);
      if (secretCiphertext.length !== ENVELOPE_BYTES) {
        throw this.invalidEnvelope();
      }

      return {
        tokenHash,
        digestVersion: IDENTITY_MAIL_TOKEN_DIGEST_VERSION,
        secretCiphertext,
        envelopeVersion: IDENTITY_MAIL_ENVELOPE_VERSION,
        keyVersion: IDENTITY_MAIL_ENCRYPTION_KEY_VERSION,
        aadEnvironment: this.aadEnvironment,
      };
    } catch {
      throw this.cryptographyUnavailable();
    } finally {
      plaintext?.fill(0);
      randomTokenBytes?.fill(0);
    }
  }

  openInitialOwnerInviteToken(input: OpenIdentityMailInviteTokenInput): string {
    let plaintext: Buffer | undefined;
    const plaintextChunks: Buffer[] = [];

    try {
      const canonicalBinding = this.canonicalBinding(input);
      if (
        input.digestVersion !== IDENTITY_MAIL_TOKEN_DIGEST_VERSION ||
        input.envelopeVersion !== IDENTITY_MAIL_ENVELOPE_VERSION ||
        input.keyVersion !== IDENTITY_MAIL_ENCRYPTION_KEY_VERSION ||
        input.aadEnvironment !== this.aadEnvironment ||
        !SHA256_HEX_PATTERN.test(input.tokenHash) ||
        !Buffer.isBuffer(input.secretCiphertext) ||
        input.secretCiphertext.length !== ENVELOPE_BYTES
      ) {
        throw this.invalidEnvelope();
      }

      const nonce = input.secretCiphertext.subarray(0, NONCE_BYTES);
      const ciphertext = input.secretCiphertext.subarray(
        NONCE_BYTES,
        NONCE_BYTES + CIPHERTEXT_BYTES,
      );
      const authTag = input.secretCiphertext.subarray(
        NONCE_BYTES + CIPHERTEXT_BYTES,
      );
      const decipher = createDecipheriv(ALGORITHM, this.encryptionKey, nonce, {
        authTagLength: AUTH_TAG_BYTES,
      });
      decipher.setAAD(
        this.canonicalAad(
          canonicalBinding,
          input.tokenHash,
          input.digestVersion,
          input.keyVersion,
          input.envelopeVersion,
        ),
        { plaintextLength: ciphertext.length },
      );
      decipher.setAuthTag(authTag);
      plaintextChunks.push(decipher.update(ciphertext));
      plaintextChunks.push(decipher.final());
      plaintext = Buffer.concat(plaintextChunks);

      if (plaintext.length !== TOKEN_CHARACTERS) {
        throw this.invalidEnvelope();
      }

      const rawToken = plaintext.toString('utf8');
      if (
        Buffer.byteLength(rawToken, 'utf8') !== TOKEN_CHARACTERS ||
        !TOKEN_PATTERN.test(rawToken) ||
        !this.verifyTokenHash(rawToken, input.tokenHash, input.digestVersion)
      ) {
        throw this.invalidEnvelope();
      }

      return rawToken;
    } catch {
      throw this.invalidEnvelope();
    } finally {
      plaintext?.fill(0);
      for (const chunk of plaintextChunks) {
        chunk.fill(0);
      }
    }
  }

  verifyTokenHash(
    token: unknown,
    expectedHash: unknown,
    digestVersion: unknown,
  ): boolean {
    if (
      typeof token !== 'string' ||
      !TOKEN_PATTERN.test(token) ||
      typeof expectedHash !== 'string' ||
      !SHA256_HEX_PATTERN.test(expectedHash) ||
      digestVersion !== IDENTITY_MAIL_TOKEN_DIGEST_VERSION
    ) {
      return false;
    }

    const actual = createHash('sha256').update(token).digest();
    const expected = Buffer.from(expectedHash, 'hex');
    return timingSafeEqual(actual, expected);
  }

  private canonicalBinding(
    binding: IdentityMailSecretBinding,
  ): CanonicalIdentityMailSecretBinding {
    if (
      !binding ||
      !this.uuid(binding.tenantId) ||
      !this.uuid(binding.workflowLocator) ||
      !this.uuid(binding.inviteId) ||
      !this.uuid(binding.outboxId) ||
      binding.template !== IDENTITY_MAIL_TEMPLATE ||
      !this.uuid(binding.messageKey) ||
      !SHA256_HEX_PATTERN.test(binding.requestDigest) ||
      !(binding.expiresAt instanceof Date) ||
      !Number.isFinite(binding.expiresAt.getTime())
    ) {
      throw this.invalidEnvelope();
    }

    return {
      tenantId: binding.tenantId,
      workflowLocator: binding.workflowLocator,
      inviteId: binding.inviteId,
      outboxId: binding.outboxId,
      template: binding.template,
      messageKey: binding.messageKey,
      requestDigest: binding.requestDigest,
      expiresAt: binding.expiresAt.toISOString(),
    };
  }

  private canonicalAad(
    binding: CanonicalIdentityMailSecretBinding,
    tokenHash: string,
    digestVersion: typeof IDENTITY_MAIL_TOKEN_DIGEST_VERSION,
    keyVersion: typeof IDENTITY_MAIL_ENCRYPTION_KEY_VERSION,
    envelopeVersion: typeof IDENTITY_MAIL_ENVELOPE_VERSION,
  ): Buffer {
    return Buffer.from(
      JSON.stringify({
        domain: IDENTITY_MAIL_AAD_DOMAIN,
        schemaVersion: IDENTITY_MAIL_AAD_SCHEMA_VERSION,
        environment: this.aadEnvironment,
        tenantId: binding.tenantId,
        workflowLocator: binding.workflowLocator,
        inviteId: binding.inviteId,
        outboxId: binding.outboxId,
        template: binding.template,
        messageKey: binding.messageKey,
        requestDigest: binding.requestDigest,
        tokenHash,
        digestVersion,
        expiresAt: binding.expiresAt,
        keyVersion,
        envelopeVersion,
      }),
      'utf8',
    );
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private uuid(value: unknown): value is string {
    return typeof value === 'string' && UUID_PATTERN.test(value);
  }

  private reusesIndependentSecret(configuredKey: unknown): boolean {
    if (typeof configuredKey !== 'string') {
      return false;
    }

    return INDEPENDENT_SECRET_KEYS.some((key) => {
      const value = this.configService.get<unknown>(key);
      return typeof value === 'string' && value.trim() === configuredKey;
    });
  }

  private secureRandomBytes(size: number): Buffer {
    return randomBytes(size);
  }

  private configurationUnavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      message: 'Identity mail encryption is unavailable',
      reasonCode: 'IDENTITY_MAIL_ENCRYPTION_UNAVAILABLE',
    });
  }

  private cryptographyUnavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      message: 'Identity mail cryptography is unavailable',
      reasonCode: 'IDENTITY_MAIL_CRYPTOGRAPHY_UNAVAILABLE',
    });
  }

  private invalidEnvelope(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      message: 'Identity mail secret envelope is invalid',
      reasonCode: 'IDENTITY_MAIL_SECRET_ENVELOPE_INVALID',
    });
  }
}
