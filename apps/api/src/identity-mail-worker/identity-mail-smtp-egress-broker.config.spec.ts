import {
  IdentityMailSmtpEgressBrokerConfigurationError,
  loadIdentityMailSmtpEgressBrokerConfig,
} from './identity-mail-smtp-egress-broker.config';
import type { IdentityMailWorkerEnvironment } from './identity-mail-worker.types';

const RELEASE_SHA = 'a'.repeat(40);

function enabledEnvironment(): IdentityMailWorkerEnvironment {
  return {
    IDENTITY_MAIL_SMTP_EGRESS_ENABLED: 'true',
    IDENTITY_MAIL_SMTP_EGRESS_RELEASE_SHA: RELEASE_SHA,
    RELEASE_SHA,
    IDENTITY_MAIL_SMTP_EGRESS_LISTEN_HOST: '127.0.0.1',
    IDENTITY_MAIL_SMTP_EGRESS_LISTEN_PORT: '4465',
    IDENTITY_MAIL_SMTP_EGRESS_HEALTH_HOST: '127.0.0.1',
    IDENTITY_MAIL_SMTP_EGRESS_HEALTH_PORT: '4466',
    IDENTITY_MAIL_SMTP_EGRESS_TARGET_HOST: 'smtp.example.test',
    IDENTITY_MAIL_SMTP_EGRESS_TARGET_PORT: '465',
    IDENTITY_MAIL_SMTP_EGRESS_CONNECT_TIMEOUT_MS: '10000',
    IDENTITY_MAIL_SMTP_EGRESS_IDLE_TIMEOUT_MS: '120000',
    IDENTITY_MAIL_SMTP_EGRESS_MAX_CONNECTIONS: '4',
  };
}

describe('loadIdentityMailSmtpEgressBrokerConfig', () => {
  it('is disabled by default', () => {
    expect(loadIdentityMailSmtpEgressBrokerConfig({})).toEqual({
      enabled: false,
    });
  });

  it('loads one exact secret-free loopback profile', () => {
    const config = loadIdentityMailSmtpEgressBrokerConfig(enabledEnvironment());
    expect(config).toEqual({
      enabled: true,
      releaseSha: RELEASE_SHA,
      listenHost: '127.0.0.1',
      listenPort: 4465,
      healthHost: '127.0.0.1',
      healthPort: 4466,
      targetHost: 'smtp.example.test',
      targetPort: 465,
      connectTimeoutMs: 10_000,
      idleTimeoutMs: 120_000,
      maxConnections: 4,
    });
    expect(Object.isFrozen(config)).toBe(true);
  });

  it.each([
    [
      'non-loopback listener',
      { IDENTITY_MAIL_SMTP_EGRESS_LISTEN_HOST: '0.0.0.0' },
      'IDENTITY_MAIL_SMTP_EGRESS_LISTEN_HOST_INVALID',
    ],
    [
      'provider port outside the admitted pair',
      { IDENTITY_MAIL_SMTP_EGRESS_TARGET_PORT: '25' },
      'IDENTITY_MAIL_SMTP_EGRESS_TARGET_PORT_INVALID',
    ],
    [
      'release alias drift',
      { RELEASE_SHA: 'b'.repeat(40) },
      'IDENTITY_MAIL_SMTP_EGRESS_RELEASE_SHA_MISMATCH',
    ],
    [
      'listen and health port collision',
      { IDENTITY_MAIL_SMTP_EGRESS_HEALTH_PORT: '4465' },
      'IDENTITY_MAIL_SMTP_EGRESS_PORT_COLLISION',
    ],
    [
      'local target name',
      { IDENTITY_MAIL_SMTP_EGRESS_TARGET_HOST: 'smtp.localhost' },
      'IDENTITY_MAIL_SMTP_EGRESS_TARGET_HOST_INVALID',
    ],
  ])('rejects %s', (_case, override, reasonCode) => {
    expect(() =>
      loadIdentityMailSmtpEgressBrokerConfig({
        ...enabledEnvironment(),
        ...override,
      }),
    ).toThrow(new IdentityMailSmtpEgressBrokerConfigurationError(reasonCode));
  });
});
