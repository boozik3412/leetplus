import {
  IdentityMailSmtpProviderError,
  StrictIdentityMailSmtpProvider,
  type IdentityMailSmtpTransport,
  type IdentityMailSmtpTransportOptions,
} from './identity-mail-smtp-provider';
import type {
  IdentityMailMessage,
  IdentityMailWorkerSmtpConfig,
} from './identity-mail-worker.types';

const MESSAGE_ID =
  '<initial-owner-22222222-2222-4222-8222-222222222222@mail.leetplus.ru>';

function smtpConfig(): IdentityMailWorkerSmtpConfig {
  return {
    host: 'smtp.example.test',
    port: 587,
    tlsMode: 'STARTTLS',
    servername: 'smtp.example.test',
    username: 'smtp-user',
    password: 'smtp-password',
    from: 'no-reply@leetplus.ru',
    messageIdDomain: 'mail.leetplus.ru',
    connectionTimeoutMs: 10_000,
    greetingTimeoutMs: 10_000,
    socketTimeoutMs: 30_000,
  };
}

function message(): IdentityMailMessage {
  return {
    to: 'owner@example.test',
    from: 'no-reply@leetplus.ru',
    messageId: MESSAGE_ID,
    subject: 'Invite',
    text: 'Text',
    html: '<p>Text</p>',
  };
}

describe('StrictIdentityMailSmtpProvider', () => {
  it('forces verified TLS and disables file and URL body access', async () => {
    let options: IdentityMailSmtpTransportOptions | undefined;
    const sendMail = jest.fn().mockResolvedValue({
      accepted: ['owner@example.test'],
      rejected: [],
      messageId: MESSAGE_ID,
    });
    const transport: IdentityMailSmtpTransport = {
      verify: jest.fn().mockResolvedValue(true),
      sendMail,
      close: jest.fn(),
    };
    const provider = new StrictIdentityMailSmtpProvider(
      smtpConfig(),
      (candidate) => {
        options = candidate;
        return transport;
      },
    );

    await provider.verify();
    const receipt = await provider.send(message());
    expect(receipt.outcomeCode).toBe('SMTP_ACCEPTED');
    expect(receipt.receiptDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(options).toMatchObject({
      secure: false,
      requireTLS: true,
      tls: {
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        servername: 'smtp.example.test',
      },
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        disableFileAccess: true,
        disableUrlAccess: true,
        messageId: MESSAGE_ID,
      }),
    );
  });

  it('uses implicit TLS without disabling certificate verification', () => {
    let options: IdentityMailSmtpTransportOptions | undefined;
    new StrictIdentityMailSmtpProvider(
      { ...smtpConfig(), tlsMode: 'IMPLICIT_TLS', port: 465 },
      (candidate) => {
        options = candidate;
        return {
          verify: jest.fn(),
          sendMail: jest.fn(),
        };
      },
    );
    expect(options).toMatchObject({
      secure: true,
      requireTLS: false,
      tls: { rejectUnauthorized: true },
    });
  });

  it('maps provider errors to a safe fixed reason without leaking response data', async () => {
    const secretProviderResponse = '550 owner@example.test token=A'.concat(
      'A'.repeat(42),
    );
    const provider = new StrictIdentityMailSmtpProvider(smtpConfig(), () => ({
      verify: jest.fn(),
      sendMail: jest.fn().mockRejectedValue(new Error(secretProviderResponse)),
    }));

    await expect(provider.send(message())).rejects.toEqual(
      new IdentityMailSmtpProviderError('IDENTITY_MAIL_SMTP_RESULT_AMBIGUOUS'),
    );
    try {
      await provider.send(message());
    } catch (error) {
      expect(String(error)).not.toContain(secretProviderResponse);
    }
  });

  it('rejects a malformed SMTP acceptance receipt', async () => {
    const provider = new StrictIdentityMailSmtpProvider(smtpConfig(), () => ({
      verify: jest.fn(),
      sendMail: jest.fn().mockResolvedValue({
        accepted: [],
        rejected: ['owner@example.test'],
        messageId: MESSAGE_ID,
      }),
    }));
    await expect(provider.send(message())).rejects.toMatchObject({
      reasonCode: 'IDENTITY_MAIL_SMTP_ACCEPTANCE_INVALID',
    });
  });

  it('requires the sole accepted SMTP recipient to match the intended mailbox', async () => {
    const provider = new StrictIdentityMailSmtpProvider(smtpConfig(), () => ({
      verify: jest.fn(),
      sendMail: jest.fn().mockResolvedValue({
        accepted: ['attacker@example.test'],
        rejected: [],
        messageId: MESSAGE_ID,
      }),
    }));
    await expect(provider.send(message())).rejects.toMatchObject({
      reasonCode: 'IDENTITY_MAIL_SMTP_ACCEPTANCE_INVALID',
    });
  });

  it.each([
    'owner@example.test,attacker@example.test',
    'Owner <owner@example.test>',
  ])('rejects %s before entering the SMTP transport', async (recipient) => {
    const sendMail = jest.fn();
    const provider = new StrictIdentityMailSmtpProvider(smtpConfig(), () => ({
      verify: jest.fn(),
      sendMail,
    }));

    await expect(
      provider.send({ ...message(), to: recipient }),
    ).rejects.toMatchObject({
      reasonCode: 'IDENTITY_MAIL_SMTP_MESSAGE_INVALID',
    });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it.each([
    'No-Reply@leetplus.ru',
    '.no-reply@leetplus.ru',
    'no..reply@leetplus.ru',
  ])('rejects non-canonical SMTP FROM %s before transport', async (from) => {
    const sendMail = jest.fn();
    const provider = new StrictIdentityMailSmtpProvider(
      { ...smtpConfig(), from },
      () => ({
        verify: jest.fn(),
        sendMail,
      }),
    );

    await expect(provider.send({ ...message(), from })).rejects.toMatchObject({
      reasonCode: 'IDENTITY_MAIL_SMTP_MESSAGE_INVALID',
    });
    expect(sendMail).not.toHaveBeenCalled();
  });
});
