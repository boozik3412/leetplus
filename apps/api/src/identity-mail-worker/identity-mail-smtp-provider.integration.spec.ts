import nodemailer from 'nodemailer';
import { createPrivateKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  createServer as createNetServer,
  type Server,
  type Socket,
} from 'node:net';
import { join } from 'node:path';
import { createServer as createTlsServer } from 'node:tls';
import {
  IdentityMailSmtpProviderError,
  StrictIdentityMailSmtpProvider,
  type IdentityMailSmtpTransportFactory,
} from './identity-mail-smtp-provider';
import { buildInitialOwnerInviteMessage } from './identity-mail-worker-template';
import type { IdentityMailWorkerSmtpConfig } from './identity-mail-worker.types';

const TEST_FIXTURE_DIRECTORY = join(
  __dirname,
  '..',
  '..',
  'test',
  'fixtures',
  'identity-mail-worker',
);
const TEST_CERTIFICATE = readFileSync(
  join(TEST_FIXTURE_DIRECTORY, 'identity-mail-smtp-test-only.cert.pem'),
  'utf8',
);
const TEST_PRIVATE_KEY = createPrivateKey({
  key: Buffer.from(
    readFileSync(
      join(
        TEST_FIXTURE_DIRECTORY,
        'identity-mail-smtp-test-only.pkcs8.der.base64.txt',
      ),
      'utf8',
    ).trim(),
    'base64',
  ),
  format: 'der',
  type: 'pkcs8',
}).export({ format: 'pem', type: 'pkcs8' });
const TEST_TLS_SERVERNAME = 'smtp.test.local';
const MESSAGE_KEY = '22222222-2222-4222-8222-222222222222';
const RAW_TOKEN = 'T'.repeat(43);
const RECIPIENT = 'owner@example.test';
const MESSAGE_ID = `<initial-owner-${MESSAGE_KEY}@mail.leetplus.ru>`;

type FakeSmtpOptions = {
  mode: 'IMPLICIT_TLS' | 'PLAINTEXT';
  rejectDataWith?: string;
};

class LoopbackFakeSmtpServer {
  readonly commands: string[] = [];
  readonly messages: string[] = [];
  private readonly sockets = new Set<Socket>();
  private server: Server | null = null;

  constructor(private readonly options: FakeSmtpOptions) {}

  async start(): Promise<number> {
    if (this.server) {
      throw new Error('Fake SMTP server already started');
    }
    const server =
      this.options.mode === 'IMPLICIT_TLS'
        ? createTlsServer(
            {
              cert: TEST_CERTIFICATE,
              key: TEST_PRIVATE_KEY,
              minVersion: 'TLSv1.2',
            },
            (socket) => this.handle(socket),
          )
        : createNetServer((socket) => this.handle(socket));
    server.on('connection', (socket) => this.track(socket));
    if (this.options.mode === 'IMPLICIT_TLS') {
      server.on('tlsClientError', () => undefined);
    }
    this.server = server;
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        server.off('error', onError);
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(0, '127.0.0.1');
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Fake SMTP server did not bind loopback');
    }
    expect(address.address).toBe('127.0.0.1');
    return address.port;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    for (const socket of this.sockets) {
      socket.destroy();
    }
    this.sockets.clear();
    if (!server) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  private track(socket: Socket): void {
    this.sockets.add(socket);
    socket.once('close', () => this.sockets.delete(socket));
    socket.on('error', () => undefined);
  }

  private handle(socket: Socket): void {
    this.track(socket);
    socket.setEncoding('utf8');
    socket.write(`220 ${TEST_TLS_SERVERNAME} ESMTP test\r\n`);
    let buffered = '';
    let dataMode = false;
    let authStep: 'USERNAME' | 'PASSWORD' | null = null;
    let messageLines: string[] = [];

    socket.on('data', (chunk) => {
      buffered += String(chunk);
      while (true) {
        const lineEnd = buffered.indexOf('\r\n');
        if (lineEnd < 0) {
          break;
        }
        const line = buffered.slice(0, lineEnd);
        buffered = buffered.slice(lineEnd + 2);

        if (dataMode) {
          if (line !== '.') {
            messageLines.push(line.startsWith('..') ? line.slice(1) : line);
            continue;
          }
          dataMode = false;
          this.messages.push(messageLines.join('\r\n'));
          messageLines = [];
          if (this.options.rejectDataWith) {
            socket.write(`550 5.7.1 ${this.options.rejectDataWith}\r\n`);
          } else {
            socket.write('250 2.0.0 queued\r\n');
          }
          continue;
        }

        this.commands.push(line);
        if (authStep === 'USERNAME') {
          authStep = 'PASSWORD';
          socket.write('334 UGFzc3dvcmQ6\r\n');
          continue;
        }
        if (authStep === 'PASSWORD') {
          authStep = null;
          socket.write('235 2.7.0 authenticated\r\n');
          continue;
        }

        const command = line.toUpperCase();
        if (command.startsWith('EHLO ')) {
          if (this.options.mode === 'IMPLICIT_TLS') {
            socket.write(
              `250-${TEST_TLS_SERVERNAME}\r\n` +
                '250-AUTH PLAIN LOGIN\r\n' +
                '250 SIZE 1048576\r\n',
            );
          } else {
            socket.write(`250 ${TEST_TLS_SERVERNAME}\r\n`);
          }
        } else if (command === 'AUTH LOGIN') {
          authStep = 'USERNAME';
          socket.write('334 VXNlcm5hbWU6\r\n');
        } else if (command.startsWith('AUTH PLAIN ')) {
          socket.write('235 2.7.0 authenticated\r\n');
        } else if (command.startsWith('MAIL FROM:')) {
          socket.write('250 2.1.0 sender accepted\r\n');
        } else if (command.startsWith('RCPT TO:')) {
          socket.write('250 2.1.5 recipient accepted\r\n');
        } else if (command === 'DATA') {
          dataMode = true;
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
        } else if (command === 'RSET' || command === 'NOOP') {
          socket.write('250 2.0.0 ok\r\n');
        } else if (command === 'QUIT') {
          socket.end('221 2.0.0 bye\r\n');
        } else if (command === 'STARTTLS') {
          socket.write('454 4.7.0 TLS not available\r\n');
        } else {
          socket.write('500 5.5.1 unsupported command\r\n');
        }
      }
    });
  }
}

function smtpConfig(
  port: number,
  overrides: Partial<IdentityMailWorkerSmtpConfig> = {},
): IdentityMailWorkerSmtpConfig {
  return {
    host: '127.0.0.1',
    port,
    tlsMode: 'IMPLICIT_TLS',
    servername: TEST_TLS_SERVERNAME,
    username: 'smtp-test-user',
    password: 'smtp-test-password',
    from: 'no-reply@leetplus.ru',
    messageIdDomain: 'mail.leetplus.ru',
    connectionTimeoutMs: 2_000,
    greetingTimeoutMs: 2_000,
    socketTimeoutMs: 3_000,
    ...overrides,
  };
}

function inviteMessage() {
  return buildInitialOwnerInviteMessage({
    recipientEmail: RECIPIENT,
    token: RAW_TOKEN,
    messageKey: MESSAGE_KEY,
    publicWebOrigin: 'https://leetplus.ru',
    smtp: {
      from: 'no-reply@leetplus.ru',
      messageIdDomain: 'mail.leetplus.ru',
    },
  });
}

function decodedMimeBodies(message: string): string[] {
  return Array.from(
    message.matchAll(
      /Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+)\r\n--/gu,
    ),
    (match) =>
      Buffer.from((match[1] ?? '').replace(/\s/gu, ''), 'base64').toString(
        'utf8',
      ),
  );
}

const trustedTestTransportFactory: IdentityMailSmtpTransportFactory = (
  options,
) =>
  nodemailer.createTransport({
    ...options,
    tls: {
      ...options.tls,
      ca: TEST_CERTIFICATE,
    },
  });

const defaultTestTransportFactory: IdentityMailSmtpTransportFactory = (
  options,
) => nodemailer.createTransport(options);

describe('StrictIdentityMailSmtpProvider fake SMTP/TLS integration', () => {
  const servers: LoopbackFakeSmtpServer[] = [];
  const providers: StrictIdentityMailSmtpProvider[] = [];

  jest.setTimeout(15_000);

  afterEach(async () => {
    for (const provider of providers.splice(0)) {
      provider.close();
    }
    for (const server of servers.splice(0).reverse()) {
      await server.stop();
    }
  });

  async function startServer(options: FakeSmtpOptions): Promise<{
    server: LoopbackFakeSmtpServer;
    port: number;
  }> {
    const server = new LoopbackFakeSmtpServer(options);
    servers.push(server);
    return { server, port: await server.start() };
  }

  function provider(
    config: IdentityMailWorkerSmtpConfig,
    factory: IdentityMailSmtpTransportFactory,
  ): StrictIdentityMailSmtpProvider {
    const result = new StrictIdentityMailSmtpProvider(config, factory);
    providers.push(result);
    return result;
  }

  it('sends through trusted TLS with stable Message-ID and fragment-only invite URL', async () => {
    const { server, port } = await startServer({ mode: 'IMPLICIT_TLS' });
    const smtp = provider(smtpConfig(port), trustedTestTransportFactory);
    const message = inviteMessage();

    await expect(smtp.verify()).resolves.toBeUndefined();
    const firstReceipt = await smtp.send(message);
    const secondMessage = inviteMessage();

    expect(secondMessage.messageId).toBe(MESSAGE_ID);
    expect(firstReceipt.outcomeCode).toBe('SMTP_ACCEPTED');
    expect(firstReceipt.receiptDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(
      server.commands.filter((command) =>
        command.toUpperCase().startsWith('RCPT TO:'),
      ),
    ).toEqual([`RCPT TO:<${RECIPIENT}>`]);
    expect(server.messages).toHaveLength(1);
    const delivered = server.messages[0] ?? '';
    const unfolded = delivered.replace(/\r\n[ \t]+/gu, ' ');
    const decodedBodies = decodedMimeBodies(delivered);
    expect(unfolded).toContain(`Message-ID: ${MESSAGE_ID}`);
    expect(decodedBodies).toHaveLength(2);
    for (const body of decodedBodies) {
      expect(body).toContain(
        `https://leetplus.ru/register#invite=${RAW_TOKEN}`,
      );
      expect(body).not.toContain('/register?invite');
      expect(body).not.toContain(`?invite=${RAW_TOKEN}`);
      expect(body).not.toContain('https://attacker.example');
    }
  });

  it('rejects an untrusted certificate with a PII-free fixed error', async () => {
    const { port } = await startServer({ mode: 'IMPLICIT_TLS' });
    const smtp = provider(smtpConfig(port), defaultTestTransportFactory);

    const rejection = await smtp.verify().catch((error: unknown) => error);
    expect(rejection).toEqual(
      new IdentityMailSmtpProviderError(
        'IDENTITY_MAIL_SMTP_VERIFICATION_FAILED',
      ),
    );
    expect(String(rejection)).not.toContain(RECIPIENT);
    expect(String(rejection)).not.toContain(RAW_TOKEN);
  });

  it('rejects a trusted certificate for the wrong hostname', async () => {
    const { port } = await startServer({ mode: 'IMPLICIT_TLS' });
    const smtp = provider(
      smtpConfig(port, { servername: 'wrong.test.local' }),
      trustedTestTransportFactory,
    );

    await expect(smtp.verify()).rejects.toMatchObject({
      reasonCode: 'IDENTITY_MAIL_SMTP_VERIFICATION_FAILED',
    });
  });

  it('cannot downgrade STARTTLS credentials or mail to plaintext', async () => {
    const { server, port } = await startServer({ mode: 'PLAINTEXT' });
    const smtp = provider(
      smtpConfig(port, {
        tlsMode: 'STARTTLS',
        servername: TEST_TLS_SERVERNAME,
      }),
      trustedTestTransportFactory,
    );

    await expect(smtp.verify()).rejects.toMatchObject({
      reasonCode: 'IDENTITY_MAIL_SMTP_VERIFICATION_FAILED',
    });
    expect(server.commands).toContain('STARTTLS');
    expect(server.commands.some((line) => line.startsWith('AUTH '))).toBe(
      false,
    );
    expect(server.commands.some((line) => line.startsWith('MAIL FROM:'))).toBe(
      false,
    );
    expect(server.messages).toHaveLength(0);
  });

  it('does not expose a provider rejection containing recipient and token', async () => {
    const rawProviderFailure = `rejected ${RECIPIENT} invite=${RAW_TOKEN}`;
    const { port } = await startServer({
      mode: 'IMPLICIT_TLS',
      rejectDataWith: rawProviderFailure,
    });
    const smtp = provider(smtpConfig(port), trustedTestTransportFactory);

    const rejection = await smtp
      .send(inviteMessage())
      .catch((error: unknown) => error);
    expect(rejection).toEqual(
      new IdentityMailSmtpProviderError('IDENTITY_MAIL_SMTP_RESULT_AMBIGUOUS'),
    );
    const serialized = JSON.stringify(rejection);
    expect(serialized).not.toContain(RECIPIENT);
    expect(serialized).not.toContain(RAW_TOKEN);
    expect(serialized).not.toContain(rawProviderFailure);
  });
});
