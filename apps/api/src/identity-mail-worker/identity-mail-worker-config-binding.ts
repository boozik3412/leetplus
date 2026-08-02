import { createHash, createHmac, hkdfSync } from 'node:crypto';
import type {
  EnabledIdentityMailWorkerConfig,
  IdentityMailWorkerSmtpConfig,
} from './identity-mail-worker.types';

const AUTHORITY_BINDING_HKDF_SALT =
  'leetplus:identity-mail-worker:config-binding:salt:v1';
const SMTP_PASSWORD_BINDING_HKDF_INFO =
  'leetplus:identity-mail-worker:smtp-password-hmac:v1';

export type IdentityMailWorkerConfigBindings = {
  providerAuthorityDigest: string;
  runtimeConfigDigest: string;
};

export function snapshotIdentityMailWorkerSmtpConfig(
  config: IdentityMailWorkerSmtpConfig,
): IdentityMailWorkerSmtpConfig {
  return Object.freeze({ ...config });
}

export function snapshotEnabledIdentityMailWorkerConfig(
  config: EnabledIdentityMailWorkerConfig,
): EnabledIdentityMailWorkerConfig {
  return Object.freeze({
    ...config,
    canaryTenantIds: Object.freeze([...config.canaryTenantIds].sort()),
    smtp: snapshotIdentityMailWorkerSmtpConfig(config.smtp),
  });
}

/**
 * Separates durable provider authority from per-process scheduling policy.
 *
 * Tenant allowlists and bounded delivery policy are admitted independently by
 * the database. They must not rotate an already enrolled tenant's provider
 * authority merely because another tenant is added to the same worker.
 */
export function buildIdentityMailWorkerConfigBindings(
  config: EnabledIdentityMailWorkerConfig,
): IdentityMailWorkerConfigBindings {
  const keyBytes = Buffer.from(config.encryptionKey, 'base64url');
  let authorityBindingKey: Buffer | undefined;

  try {
    const encryptionKeyFingerprint = createHash('sha256')
      .update(keyBytes)
      .digest('hex');
    authorityBindingKey = Buffer.from(
      hkdfSync(
        'sha256',
        keyBytes,
        AUTHORITY_BINDING_HKDF_SALT,
        SMTP_PASSWORD_BINDING_HKDF_INFO,
        32,
      ),
    );
    const smtpPasswordBindingHmac = createHmac('sha256', authorityBindingKey)
      .update(config.smtp.password, 'utf8')
      .digest('hex');

    const providerAuthorityDigest = digest({
      contract: 'IDENTITY_MAIL_PROVIDER_AUTHORITY_V1',
      expectedDatabase: config.expectedDatabase,
      expectedRole: config.expectedRole,
      databaseTlsRequired: config.databaseTlsRequired,
      databaseConnectTimeoutSeconds: config.databaseConnectTimeoutSeconds,
      databaseSocketTimeoutSeconds: config.databaseSocketTimeoutSeconds,
      expectedMigration: config.expectedMigration,
      expectedMigrationCount: config.expectedMigrationCount,
      releaseSha: config.releaseSha,
      publicWebOrigin: config.publicWebOrigin,
      encryptionKeyVersion: config.encryptionKeyVersion,
      encryptionKeyFingerprint,
      aadEnvironment: config.aadEnvironment,
      smtp: {
        host: config.smtp.host,
        port: config.smtp.port,
        tlsMode: config.smtp.tlsMode,
        servername: config.smtp.servername,
        usernameDigest: digest(config.smtp.username),
        passwordBindingHmac: smtpPasswordBindingHmac,
        from: config.smtp.from,
        messageIdDomain: config.smtp.messageIdDomain,
        connectionTimeoutMs: config.smtp.connectionTimeoutMs,
        greetingTimeoutMs: config.smtp.greetingTimeoutMs,
        socketTimeoutMs: config.smtp.socketTimeoutMs,
      },
    });

    return {
      providerAuthorityDigest,
      runtimeConfigDigest: digest({
        contract: 'IDENTITY_MAIL_RUNTIME_CONFIG_V1',
        providerAuthorityDigest,
        realSendEnabled: config.realSendEnabled,
        liveCanaryEnabled: config.liveCanaryEnabled,
        canaryTenantIds: [...config.canaryTenantIds].sort(),
        pollIntervalMs: config.pollIntervalMs,
        leaseMs: config.leaseMs,
        batchSize: config.batchSize,
        maxAttempts: config.maxAttempts,
        baseRetryMs: config.baseRetryMs,
        maxRetryMs: config.maxRetryMs,
        healthHost: config.healthHost,
        healthPort: config.healthPort,
      }),
    };
  } finally {
    authorityBindingKey?.fill(0);
    keyBytes.fill(0);
  }
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
