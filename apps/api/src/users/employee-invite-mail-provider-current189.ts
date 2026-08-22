import { createHash } from 'node:crypto';
import nodemailer from 'nodemailer';
import { isCanonicalIdentityMailRecipient } from '../identity-mail-worker/identity-mail-recipient';
import type { IdentityMailMessage } from '../identity-mail-worker/identity-mail-worker.types';
import type {
  EmployeeInviteMailProviderCurrent189,
  EmployeeInviteMailProviderReceipt,
} from './employee-invite-mail-worker-current189.types';

const DNS_NAME_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const EMPLOYEE_MESSAGE_ID_PATTERN =
  /^<employee-invite-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}@[a-z0-9.-]+>$/u;
const MESSAGE_KEYS = Object.freeze([
  'to',
  'from',
  'messageId',
  'subject',
  'text',
  'html',
]);

export type EmployeeInviteMailProviderCurrent189Config = Readonly<{
  host: string;
  port: number;
  tlsMode: 'IMPLICIT_TLS' | 'STARTTLS';
  servername: string;
  username: string;
  password: string;
  from: string;
  messageIdDomain: string;
  connectionTimeoutMs: number;
  greetingTimeoutMs: number;
  socketTimeoutMs: number;
}>;

export type EmployeeInviteMailTransportOptions = {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  auth: { user: string; pass: string };
  tls: {
    rejectUnauthorized: true;
    minVersion: 'TLSv1.2';
    servername: string;
  };
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
};

export type EmployeeInviteMailTransportMessage = IdentityMailMessage & {
  disableFileAccess: true;
  disableUrlAccess: true;
};

export interface EmployeeInviteMailTransport {
  verify(): Promise<unknown>;
  sendMail(message: EmployeeInviteMailTransportMessage): Promise<unknown>;
  close?(): void;
}

export type EmployeeInviteMailTransportFactory = (
  options: EmployeeInviteMailTransportOptions,
) => EmployeeInviteMailTransport;

export class EmployeeInviteMailProviderCurrent189Error extends Error {
  constructor(readonly reasonCode: string) {
    super(reasonCode);
    this.name = 'EmployeeInviteMailProviderCurrent189Error';
  }
}

/**
 * Dormant employee-invite-only SMTP boundary. It is intentionally not a Nest
 * provider and accepts only the employee message-id namespace.
 */
export class StrictEmployeeInviteMailProviderCurrent189 implements EmployeeInviteMailProviderCurrent189 {
  private readonly config: EmployeeInviteMailProviderCurrent189Config;
  private readonly transport: EmployeeInviteMailTransport;

  constructor(
    config: EmployeeInviteMailProviderCurrent189Config,
    transportFactory: EmployeeInviteMailTransportFactory = defaultTransportFactory,
  ) {
    this.config = snapshotConfig(config);
    this.transport = transportFactory({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.tlsMode === 'IMPLICIT_TLS',
      requireTLS: this.config.tlsMode === 'STARTTLS',
      auth: { user: this.config.username, pass: this.config.password },
      tls: {
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        servername: this.config.servername,
      },
      connectionTimeout: this.config.connectionTimeoutMs,
      greetingTimeout: this.config.greetingTimeoutMs,
      socketTimeout: this.config.socketTimeoutMs,
    });
  }

  async verify(): Promise<void> {
    try {
      await this.transport.verify();
    } catch {
      fail('EMPLOYEE_INVITE_SMTP_VERIFICATION_FAILED');
    }
  }

  async send(
    message: IdentityMailMessage,
  ): Promise<EmployeeInviteMailProviderReceipt> {
    this.assertMessage(message);
    let untrusted: unknown;
    try {
      untrusted = await this.transport.sendMail({
        ...message,
        disableFileAccess: true,
        disableUrlAccess: true,
      });
    } catch {
      // The provider may have accepted the message before the connection was
      // lost. The worker must quarantine this attempt and must never resend.
      return fail('EMPLOYEE_INVITE_SMTP_RESULT_AMBIGUOUS');
    }

    const receipt = record(untrusted);
    const accepted = Array.isArray(receipt?.accepted) ? receipt.accepted : null;
    const rejected = Array.isArray(receipt?.rejected) ? receipt.rejected : null;
    if (
      accepted?.length !== 1 ||
      accepted[0] !== message.to ||
      rejected?.length !== 0 ||
      receipt?.messageId !== message.messageId
    ) {
      return fail('EMPLOYEE_INVITE_SMTP_ACCEPTANCE_INVALID');
    }

    return Object.freeze({
      outcomeCode: 'EMPLOYEE_SMTP_ACCEPTED' as const,
      receiptDigest: createHash('sha256')
        .update(
          JSON.stringify({
            domain: 'leetplus:employee-invite-mail-provider-receipt:v1',
            messageId: message.messageId,
            acceptedCount: 1,
            rejectedCount: 0,
          }),
        )
        .digest('hex'),
    });
  }

  close(): void {
    this.transport.close?.();
  }

  private assertMessage(message: IdentityMailMessage): void {
    if (
      !exactKeys(message, MESSAGE_KEYS) ||
      message.from !== this.config.from ||
      !isCanonicalIdentityMailRecipient(message.from) ||
      !isCanonicalIdentityMailRecipient(message.to) ||
      typeof message.messageId !== 'string' ||
      !EMPLOYEE_MESSAGE_ID_PATTERN.test(message.messageId) ||
      !message.messageId.endsWith(`@${this.config.messageIdDomain}>`) ||
      !validBody(message.subject, 200, false) ||
      !validBody(message.text, 100_000, true) ||
      !validBody(message.html, 100_000, true)
    ) {
      fail('EMPLOYEE_INVITE_SMTP_MESSAGE_INVALID');
    }
  }
}

const defaultTransportFactory: EmployeeInviteMailTransportFactory = (options) =>
  nodemailer.createTransport(options);

function snapshotConfig(
  input: EmployeeInviteMailProviderCurrent189Config,
): EmployeeInviteMailProviderCurrent189Config {
  if (
    !validDnsName(input.host) ||
    !Number.isSafeInteger(input.port) ||
    input.port < 1 ||
    input.port > 65_535 ||
    (input.tlsMode !== 'IMPLICIT_TLS' && input.tlsMode !== 'STARTTLS') ||
    !validDnsName(input.servername) ||
    !validDnsName(input.messageIdDomain) ||
    !isCanonicalIdentityMailRecipient(input.from) ||
    !validCredential(input.username) ||
    !validCredential(input.password) ||
    !validTimeout(input.connectionTimeoutMs) ||
    !validTimeout(input.greetingTimeoutMs) ||
    !validTimeout(input.socketTimeoutMs)
  ) {
    fail('EMPLOYEE_INVITE_SMTP_CONFIGURATION_INVALID');
  }
  return Object.freeze({ ...input });
}

function validDnsName(value: unknown): value is string {
  return typeof value === 'string' && DNS_NAME_PATTERN.test(value);
}

function validCredential(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 512 &&
    value === value.trim()
  );
}

function validTimeout(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    Number(value) >= 100 &&
    Number(value) <= 120_000
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(value: unknown, keys: readonly string[]): boolean {
  const candidate = record(value);
  return (
    candidate !== null &&
    Object.keys(candidate).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(candidate, key))
  );
}

function validBody(
  value: unknown,
  maximum: number,
  allowNewlines: boolean,
): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= maximum &&
    (allowNewlines || (!value.includes('\r') && !value.includes('\n')))
  );
}

function fail(reasonCode: string): never {
  throw new EmployeeInviteMailProviderCurrent189Error(reasonCode);
}
