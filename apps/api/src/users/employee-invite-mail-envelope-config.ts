import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  decodeIdentityMailEncryptionKey,
  resolveIdentityMailAadEnvironment,
} from '../config/environment-validation';
import { IDENTITY_MAIL_INDEPENDENT_SECRET_KEYS } from '../auth/identity-mail-independent-secret-keys';
import type { EmployeeInviteEnvelopeConfig } from './employee-invite-secret-envelope';

export const EMPLOYEE_INVITE_ENCRYPTION_KEY_ENV =
  'IDENTITY_EMPLOYEE_INVITE_ENCRYPTION_KEY' as const;
export const EMPLOYEE_INVITE_ENCRYPTION_KEY_VERSION_ENV =
  'IDENTITY_EMPLOYEE_INVITE_ENCRYPTION_KEY_VERSION' as const;
export const EMPLOYEE_INVITE_AAD_ENVIRONMENT_ENV =
  'IDENTITY_EMPLOYEE_INVITE_AAD_ENVIRONMENT' as const;
export const EMPLOYEE_INVITE_ENCRYPTION_KEY_VERSION = 'v1' as const;

const FORBIDDEN_REUSE_KEYS = [
  ...IDENTITY_MAIL_INDEPENDENT_SECRET_KEYS,
  'IDENTITY_MAIL_ENCRYPTION_KEY',
] as const;

/**
 * Resolves the dormant CURRENT189 envelope configuration without a fallback.
 * The employee-mail domain must never share the initial-owner or application
 * key material even though both envelopes currently use AES-256-GCM.
 */
export function resolveEmployeeInviteEnvelopeConfig(
  config: ConfigService,
): EmployeeInviteEnvelopeConfig {
  const encodedKey = config.get<unknown>(EMPLOYEE_INVITE_ENCRYPTION_KEY_ENV);
  const keyVersion = config.get<unknown>(
    EMPLOYEE_INVITE_ENCRYPTION_KEY_VERSION_ENV,
  );
  const aadEnvironment = resolveIdentityMailAadEnvironment(
    config.get<unknown>(EMPLOYEE_INVITE_AAD_ENVIRONMENT_ENV),
  );
  const encryptionKey = decodeIdentityMailEncryptionKey(encodedKey);

  if (
    !encryptionKey ||
    keyVersion !== EMPLOYEE_INVITE_ENCRYPTION_KEY_VERSION ||
    !aadEnvironment ||
    reusesIndependentSecret(config, encodedKey)
  ) {
    throw unavailable();
  }

  return {
    encryptionKey,
    keyVersion: EMPLOYEE_INVITE_ENCRYPTION_KEY_VERSION,
    aadEnvironment,
  };
}

function reusesIndependentSecret(
  config: ConfigService,
  encodedKey: unknown,
): boolean {
  if (typeof encodedKey !== 'string') {
    return false;
  }
  return FORBIDDEN_REUSE_KEYS.some((key) => {
    if (key === EMPLOYEE_INVITE_ENCRYPTION_KEY_ENV) {
      return false;
    }
    const other = config.get<unknown>(key);
    return typeof other === 'string' && other.trim() === encodedKey;
  });
}

function unavailable() {
  return new ServiceUnavailableException({
    message: 'Employee invite encryption configuration is unavailable',
    reasonCode: 'EMPLOYEE_INVITE_ENCRYPTION_CONFIGURATION_UNAVAILABLE',
  });
}
