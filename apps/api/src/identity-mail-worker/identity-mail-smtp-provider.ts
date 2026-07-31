import nodemailer from 'nodemailer';
import { createHash } from 'node:crypto';
import type {
  IdentityMailMessage,
  IdentityMailSmtpProvider,
  IdentityMailSmtpReceipt,
  IdentityMailWorkerSmtpConfig,
} from './identity-mail-worker.types';
import { isCanonicalIdentityMailRecipient } from './identity-mail-recipient';
import { snapshotIdentityMailWorkerSmtpConfig } from './identity-mail-worker-config-binding';

export type IdentityMailSmtpTransportOptions = {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  auth: {
    user: string;
    pass: string;
  };
  tls: {
    rejectUnauthorized: true;
    minVersion: 'TLSv1.2';
    servername: string;
  };
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
};

export type IdentityMailSmtpTransportMessage = IdentityMailMessage & {
  disableFileAccess: true;
  disableUrlAccess: true;
};

export interface IdentityMailSmtpTransport {
  verify(): Promise<unknown>;
  sendMail(message: IdentityMailSmtpTransportMessage): Promise<unknown>;
  close?(): void;
}

export type IdentityMailSmtpTransportFactory = (
  options: IdentityMailSmtpTransportOptions,
) => IdentityMailSmtpTransport;

export class IdentityMailSmtpProviderError extends Error {
  constructor(readonly reasonCode: string) {
    super(reasonCode);
    this.name = 'IdentityMailSmtpProviderError';
  }
}

export class StrictIdentityMailSmtpProvider implements IdentityMailSmtpProvider {
  private readonly config: IdentityMailWorkerSmtpConfig;
  private readonly transport: IdentityMailSmtpTransport;

  constructor(
    config: IdentityMailWorkerSmtpConfig,
    transportFactory: IdentityMailSmtpTransportFactory = defaultTransportFactory,
  ) {
    this.config = snapshotIdentityMailWorkerSmtpConfig(config);
    this.transport = transportFactory({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.tlsMode === 'IMPLICIT_TLS',
      requireTLS: this.config.tlsMode === 'STARTTLS',
      auth: {
        user: this.config.username,
        pass: this.config.password,
      },
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
      throw new IdentityMailSmtpProviderError(
        'IDENTITY_MAIL_SMTP_VERIFICATION_FAILED',
      );
    }
  }

  async send(message: IdentityMailMessage): Promise<IdentityMailSmtpReceipt> {
    this.assertMessage(message);
    let result: unknown;
    try {
      result = await this.transport.sendMail({
        ...message,
        disableFileAccess: true,
        disableUrlAccess: true,
      });
    } catch {
      throw new IdentityMailSmtpProviderError(
        'IDENTITY_MAIL_SMTP_RESULT_AMBIGUOUS',
      );
    }

    const receipt = record(result);
    const accepted = Array.isArray(receipt?.accepted) ? receipt.accepted : null;
    const acceptedCount = accepted?.length ?? -1;
    const rejectedCount = Array.isArray(receipt?.rejected)
      ? receipt.rejected.length
      : -1;
    if (
      acceptedCount !== 1 ||
      accepted?.[0] !== message.to ||
      rejectedCount !== 0 ||
      receipt?.messageId !== message.messageId
    ) {
      throw new IdentityMailSmtpProviderError(
        'IDENTITY_MAIL_SMTP_ACCEPTANCE_INVALID',
      );
    }

    return {
      outcomeCode: 'SMTP_ACCEPTED',
      receiptDigest: createHash('sha256')
        .update(
          JSON.stringify({
            schemaVersion: 1,
            messageId: message.messageId,
            acceptedCount,
            rejectedCount,
          }),
        )
        .digest('hex'),
    };
  }

  close(): void {
    this.transport.close?.();
  }

  private assertMessage(message: IdentityMailMessage): void {
    if (
      message.from !== this.config.from ||
      !isCanonicalIdentityMailRecipient(message.from) ||
      !isCanonicalIdentityMailRecipient(message.to) ||
      !/^<initial-owner-[0-9a-f-]{36}@[a-z0-9.-]+>$/u.test(message.messageId) ||
      !message.messageId.endsWith(`@${this.config.messageIdDomain}>`) ||
      !message.subject ||
      !message.text ||
      !message.html
    ) {
      throw new IdentityMailSmtpProviderError(
        'IDENTITY_MAIL_SMTP_MESSAGE_INVALID',
      );
    }
  }
}

const defaultTransportFactory: IdentityMailSmtpTransportFactory = (options) =>
  nodemailer.createTransport(options);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
