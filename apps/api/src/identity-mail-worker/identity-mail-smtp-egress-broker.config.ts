import type { IdentityMailWorkerEnvironment } from './identity-mail-worker.types';

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const DNS_NAME_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

export type DisabledIdentityMailSmtpEgressBrokerConfig = {
  readonly enabled: false;
};

export type EnabledIdentityMailSmtpEgressBrokerConfig = {
  readonly enabled: true;
  readonly releaseSha: string;
  readonly listenHost: '127.0.0.1';
  readonly listenPort: number;
  readonly healthHost: '127.0.0.1';
  readonly healthPort: number;
  readonly targetHost: string;
  readonly targetPort: 465 | 587;
  readonly connectTimeoutMs: number;
  readonly idleTimeoutMs: number;
  readonly maxConnections: number;
};

export type IdentityMailSmtpEgressBrokerConfig =
  | DisabledIdentityMailSmtpEgressBrokerConfig
  | EnabledIdentityMailSmtpEgressBrokerConfig;

export class IdentityMailSmtpEgressBrokerConfigurationError extends Error {
  constructor(readonly reasonCode: string) {
    super(reasonCode);
    this.name = 'IdentityMailSmtpEgressBrokerConfigurationError';
  }
}

export function loadIdentityMailSmtpEgressBrokerConfig(
  environment: IdentityMailWorkerEnvironment = process.env,
): IdentityMailSmtpEgressBrokerConfig {
  const enabled = exactBoolean(
    environment.IDENTITY_MAIL_SMTP_EGRESS_ENABLED,
    'IDENTITY_MAIL_SMTP_EGRESS_ENABLED_INVALID',
  );
  if (!enabled) {
    return Object.freeze({ enabled: false });
  }

  const releaseSha = pattern(
    environment.IDENTITY_MAIL_SMTP_EGRESS_RELEASE_SHA,
    SHA_PATTERN,
    'IDENTITY_MAIL_SMTP_EGRESS_RELEASE_SHA_INVALID',
  );
  if (
    environment.RELEASE_SHA !== undefined &&
    environment.RELEASE_SHA !== releaseSha
  ) {
    fail('IDENTITY_MAIL_SMTP_EGRESS_RELEASE_SHA_MISMATCH');
  }
  const listenPort = integer(
    environment.IDENTITY_MAIL_SMTP_EGRESS_LISTEN_PORT,
    1_024,
    65_535,
    'IDENTITY_MAIL_SMTP_EGRESS_LISTEN_PORT_INVALID',
  );
  const healthPort = integer(
    environment.IDENTITY_MAIL_SMTP_EGRESS_HEALTH_PORT,
    1_024,
    65_535,
    'IDENTITY_MAIL_SMTP_EGRESS_HEALTH_PORT_INVALID',
  );
  if (listenPort === healthPort) {
    fail('IDENTITY_MAIL_SMTP_EGRESS_PORT_COLLISION');
  }
  const targetPort = integer(
    environment.IDENTITY_MAIL_SMTP_EGRESS_TARGET_PORT,
    465,
    587,
    'IDENTITY_MAIL_SMTP_EGRESS_TARGET_PORT_INVALID',
  );
  if (targetPort !== 465 && targetPort !== 587) {
    fail('IDENTITY_MAIL_SMTP_EGRESS_TARGET_PORT_INVALID');
  }

  return Object.freeze({
    enabled: true,
    releaseSha,
    listenHost: exact(
      environment.IDENTITY_MAIL_SMTP_EGRESS_LISTEN_HOST,
      '127.0.0.1',
      'IDENTITY_MAIL_SMTP_EGRESS_LISTEN_HOST_INVALID',
    ),
    listenPort,
    healthHost: exact(
      environment.IDENTITY_MAIL_SMTP_EGRESS_HEALTH_HOST,
      '127.0.0.1',
      'IDENTITY_MAIL_SMTP_EGRESS_HEALTH_HOST_INVALID',
    ),
    healthPort,
    targetHost: dnsName(
      environment.IDENTITY_MAIL_SMTP_EGRESS_TARGET_HOST,
      'IDENTITY_MAIL_SMTP_EGRESS_TARGET_HOST_INVALID',
    ),
    targetPort,
    connectTimeoutMs: integer(
      environment.IDENTITY_MAIL_SMTP_EGRESS_CONNECT_TIMEOUT_MS,
      1_000,
      30_000,
      'IDENTITY_MAIL_SMTP_EGRESS_CONNECT_TIMEOUT_MS_INVALID',
    ),
    idleTimeoutMs: integer(
      environment.IDENTITY_MAIL_SMTP_EGRESS_IDLE_TIMEOUT_MS,
      10_000,
      900_000,
      'IDENTITY_MAIL_SMTP_EGRESS_IDLE_TIMEOUT_MS_INVALID',
    ),
    maxConnections: integer(
      environment.IDENTITY_MAIL_SMTP_EGRESS_MAX_CONNECTIONS,
      1,
      20,
      'IDENTITY_MAIL_SMTP_EGRESS_MAX_CONNECTIONS_INVALID',
    ),
  });
}

function exactBoolean(value: string | undefined, reasonCode: string): boolean {
  if (value === undefined || value === '') {
    return false;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return fail(reasonCode);
}

function required(value: string | undefined, reasonCode: string): string {
  if (!value || value !== value.trim()) {
    return fail(reasonCode);
  }
  return value;
}

function pattern(
  value: string | undefined,
  expected: RegExp,
  reasonCode: string,
): string {
  const candidate = required(value, reasonCode);
  return expected.test(candidate) ? candidate : fail(reasonCode);
}

function dnsName(value: string | undefined, reasonCode: string): string {
  const candidate = pattern(value, DNS_NAME_PATTERN, reasonCode);
  if (
    candidate === 'localhost' ||
    candidate.endsWith('.localhost') ||
    candidate.endsWith('.local')
  ) {
    fail(reasonCode);
  }
  return candidate;
}

function integer(
  value: string | undefined,
  minimum: number,
  maximum: number,
  reasonCode: string,
): number {
  if (!value || !/^(?:0|[1-9]\d*)$/u.test(value)) {
    return fail(reasonCode);
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fail(reasonCode);
}

function exact<T extends string>(
  value: string | undefined,
  expected: T,
  reasonCode: string,
): T {
  return value === expected ? expected : fail(reasonCode);
}

function fail(reasonCode: string): never {
  throw new IdentityMailSmtpEgressBrokerConfigurationError(reasonCode);
}
