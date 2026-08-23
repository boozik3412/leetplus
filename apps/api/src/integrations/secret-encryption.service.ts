import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import {
  isProductionConfig,
  resolveSecuritySecret,
} from '../config/environment-validation';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const LEGACY_SHARED_KEY_VERSION = 'v1';
const INTEGRATION_KEY_VERSION = 'v2';

export type SecretEncryptionPurpose = 'integration' | 'pii';

@Injectable()
export class SecretEncryptionService {
  constructor(private readonly configService: ConfigService) {}

  encrypt(value: string, purpose: SecretEncryptionPurpose = 'integration') {
    const iv = randomBytes(IV_LENGTH);
    const version =
      purpose === 'pii' ? LEGACY_SHARED_KEY_VERSION : INTEGRATION_KEY_VERSION;
    const cipher = createCipheriv(ALGORITHM, this.keyForPurpose(purpose), iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
      version,
      iv.toString('base64url'),
      authTag.toString('base64url'),
      encrypted.toString('base64url'),
    ].join(':');
  }

  decrypt(value: string, purpose: SecretEncryptionPurpose = 'integration') {
    const [version, iv, authTag, encrypted] = value.split(':');

    if (
      ![LEGACY_SHARED_KEY_VERSION, INTEGRATION_KEY_VERSION].includes(version) ||
      !iv ||
      !authTag ||
      !encrypted
    ) {
      throw new BadRequestException('Encrypted secret format is invalid');
    }

    if (purpose === 'pii' && version !== LEGACY_SHARED_KEY_VERSION) {
      throw new BadRequestException('Encrypted secret purpose is invalid');
    }

    const decipher = createDecipheriv(
      ALGORITHM,
      version === LEGACY_SHARED_KEY_VERSION
        ? this.legacySharedKey()
        : this.integrationKey(),
      Buffer.from(iv, 'base64url'),
      {
        authTagLength: AUTH_TAG_LENGTH,
      },
    );
    decipher.setAuthTag(Buffer.from(authTag, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  private keyForPurpose(purpose: SecretEncryptionPurpose) {
    return purpose === 'pii' ? this.legacySharedKey() : this.integrationKey();
  }

  private integrationKey() {
    const fallbackKeys = isProductionConfig(this.configService)
      ? []
      : (['APP_ENCRYPTION_KEY', 'JWT_SECRET'] as const);
    const secret = resolveSecuritySecret(
      this.configService,
      'INTEGRATION_ENCRYPTION_KEY',
      fallbackKeys,
    );

    return createHash('sha256').update(secret).digest();
  }

  private legacySharedKey() {
    const secret = resolveSecuritySecret(
      this.configService,
      'APP_ENCRYPTION_KEY',
      ['JWT_SECRET'],
    );

    return createHash('sha256').update(secret).digest();
  }
}
