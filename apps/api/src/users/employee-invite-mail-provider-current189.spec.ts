import type { IdentityMailMessage } from '../identity-mail-worker/identity-mail-worker.types';
import {
  EmployeeInviteMailProviderCurrent189Error,
  StrictEmployeeInviteMailProviderCurrent189,
  type EmployeeInviteMailProviderCurrent189Config,
  type EmployeeInviteMailTransportOptions,
} from './employee-invite-mail-provider-current189';

const MESSAGE_ID =
  '<employee-invite-11111111-1111-4111-8111-111111111111@mail.leetplus.ru>';

describe('StrictEmployeeInviteMailProviderCurrent189', () => {
  it('uses a separate strict TLS transport and returns only a digest receipt', async () => {
    const transport = fakeTransport({
      accepted: ['employee@example.com'],
      rejected: [],
      messageId: MESSAGE_ID,
    });
    let options: EmployeeInviteMailTransportOptions | undefined;
    const provider = new StrictEmployeeInviteMailProviderCurrent189(
      config(),
      (value) => {
        options = value;
        return transport;
      },
    );

    await provider.verify();
    const receipt = await provider.send(message());

    expect(options).toEqual({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: 'employee-worker', pass: 'smtp-secret-value' },
      tls: {
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        servername: 'smtp.example.com',
      },
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
    });
    expect(transport.verify).toHaveBeenCalledTimes(1);
    expect(transport.sendMail).toHaveBeenCalledWith({
      ...message(),
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    expect(receipt.outcomeCode).toBe('EMPLOYEE_SMTP_ACCEPTED');
    expect(receipt.receiptDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(JSON.stringify(receipt)).not.toContain('employee@example.com');
    expect(JSON.stringify(receipt)).not.toContain('smtp-secret-value');
  });

  it('rejects the initial-owner message-id namespace', async () => {
    const provider = providerWithResult({
      accepted: ['employee@example.com'],
      rejected: [],
      messageId: MESSAGE_ID,
    });
    await expect(
      provider.send({
        ...message(),
        messageId:
          '<initial-owner-11111111-1111-4111-8111-111111111111@mail.leetplus.ru>',
      }),
    ).rejects.toMatchObject({
      reasonCode: 'EMPLOYEE_INVITE_SMTP_MESSAGE_INVALID',
    });
    await expect(
      provider.send(Object.assign(message(), { attachments: [] })),
    ).rejects.toMatchObject({
      reasonCode: 'EMPLOYEE_INVITE_SMTP_MESSAGE_INVALID',
    });
  });

  it('maps a transport exception to an ambiguity without exposing secrets', async () => {
    const transport = fakeTransport(null);
    transport.sendMail.mockRejectedValueOnce(
      new Error('smtp-secret-value employee@example.com'),
    );
    const provider = new StrictEmployeeInviteMailProviderCurrent189(
      config(),
      () => transport,
    );

    let failure: unknown;
    try {
      await provider.send(message());
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(EmployeeInviteMailProviderCurrent189Error);
    expect(failure).toMatchObject({
      reasonCode: 'EMPLOYEE_INVITE_SMTP_RESULT_AMBIGUOUS',
    });
    expect(String(failure)).not.toContain('employee@example.com');
    expect(String(failure)).not.toContain('smtp-secret-value');
  });

  it.each([
    {
      accepted: [],
      rejected: ['employee@example.com'],
      messageId: MESSAGE_ID,
    },
    {
      accepted: ['other@example.com'],
      rejected: [],
      messageId: MESSAGE_ID,
    },
    {
      accepted: ['employee@example.com'],
      rejected: [],
      messageId: '<employee-invite-other@mail.leetplus.ru>',
    },
  ])('rejects a non-exact provider acceptance %#', async (result) => {
    await expect(
      providerWithResult(result).send(message()),
    ).rejects.toMatchObject({
      reasonCode: 'EMPLOYEE_INVITE_SMTP_ACCEPTANCE_INVALID',
    });
  });

  it('fails closed when provider verification is unavailable', async () => {
    const transport = fakeTransport(null);
    transport.verify.mockRejectedValueOnce(new Error('provider unavailable'));
    const provider = new StrictEmployeeInviteMailProviderCurrent189(
      config(),
      () => transport,
    );
    await expect(provider.verify()).rejects.toMatchObject({
      reasonCode: 'EMPLOYEE_INVITE_SMTP_VERIFICATION_FAILED',
    });
  });

  it('rejects malformed or shared-looking transport configuration', () => {
    expect(
      () =>
        new StrictEmployeeInviteMailProviderCurrent189(
          { ...config(), messageIdDomain: 'localhost' },
          () => fakeTransport(null),
        ),
    ).toThrow('EMPLOYEE_INVITE_SMTP_CONFIGURATION_INVALID');
  });

  it('closes only its own employee transport', () => {
    const transport = fakeTransport(null);
    const provider = new StrictEmployeeInviteMailProviderCurrent189(
      config(),
      () => transport,
    );
    provider.close();
    expect(transport.close).toHaveBeenCalledTimes(1);
  });
});

function config(): EmployeeInviteMailProviderCurrent189Config {
  return {
    host: 'smtp.example.com',
    port: 587,
    tlsMode: 'STARTTLS',
    servername: 'smtp.example.com',
    username: 'employee-worker',
    password: 'smtp-secret-value',
    from: 'noreply@example.com',
    messageIdDomain: 'mail.leetplus.ru',
    connectionTimeoutMs: 5_000,
    greetingTimeoutMs: 5_000,
    socketTimeoutMs: 10_000,
  };
}

function message(): IdentityMailMessage {
  return {
    to: 'employee@example.com',
    from: 'noreply@example.com',
    messageId: MESSAGE_ID,
    subject: 'Employee invitation',
    text: 'Open the invitation',
    html: '<p>Open the invitation</p>',
  };
}

function fakeTransport(result: unknown) {
  return {
    verify: jest.fn(() => Promise.resolve<unknown>(true)),
    sendMail: jest.fn((messageValue: unknown) => {
      void messageValue;
      return Promise.resolve(result);
    }),
    close: jest.fn(),
  };
}

function providerWithResult(result: unknown) {
  return new StrictEmployeeInviteMailProviderCurrent189(config(), () =>
    fakeTransport(result),
  );
}
