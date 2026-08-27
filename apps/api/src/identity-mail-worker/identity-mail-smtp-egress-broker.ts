import { lookup } from 'node:dns/promises';
import {
  createServer as createHttpServer,
  type Server as HttpServer,
} from 'node:http';
import {
  createConnection,
  createServer,
  isIP,
  type Server as NetServer,
  type Socket,
  type TcpNetConnectOpts,
} from 'node:net';
import type { EnabledIdentityMailSmtpEgressBrokerConfig } from './identity-mail-smtp-egress-broker.config';

const MAX_RESOLVED_ADDRESSES = 8;

type ResolvedAddress = {
  address: string;
  family: 4;
};

type SocketPair = {
  readonly client: Socket;
  upstream: Socket | null;
  closed: boolean;
};

export type IdentityMailSmtpEgressBrokerLogEvent = {
  event:
    | 'IDENTITY_MAIL_SMTP_EGRESS_READY'
    | 'IDENTITY_MAIL_SMTP_EGRESS_CONNECTION_REJECTED'
    | 'IDENTITY_MAIL_SMTP_EGRESS_STOPPED';
  reasonCode?: string;
};

export interface IdentityMailSmtpEgressBrokerLogger {
  log(event: IdentityMailSmtpEgressBrokerLogEvent): void;
  warn(event: IdentityMailSmtpEgressBrokerLogEvent): void;
  error(event: IdentityMailSmtpEgressBrokerLogEvent): void;
}

export type IdentityMailSmtpEgressBrokerDependencies = {
  lookupAllIpv4(host: string): Promise<readonly ResolvedAddress[]>;
  connect(options: TcpNetConnectOpts): Socket;
};

export class IdentityMailSmtpEgressBrokerError extends Error {
  constructor(readonly reasonCode: string) {
    super(reasonCode);
    this.name = 'IdentityMailSmtpEgressBrokerError';
  }
}

export class IdentityMailSmtpEgressBroker {
  private relayServer: NetServer | null = null;
  private healthServer: HttpServer | null = null;
  private readonly pairs = new Set<SocketPair>();
  private nextAddressIndex = 0;
  private ready = false;
  private reasonCode: string | null = 'IDENTITY_MAIL_SMTP_EGRESS_STARTING';

  constructor(
    private readonly config: EnabledIdentityMailSmtpEgressBrokerConfig,
    private readonly logger: IdentityMailSmtpEgressBrokerLogger,
    private readonly dependencies: IdentityMailSmtpEgressBrokerDependencies = defaultDependencies,
  ) {}

  async start(): Promise<void> {
    if (this.relayServer || this.healthServer) {
      throw new IdentityMailSmtpEgressBrokerError(
        'IDENTITY_MAIL_SMTP_EGRESS_ALREADY_STARTED',
      );
    }

    await this.resolveAdmittedAddresses();
    const relayServer = createServer({ allowHalfOpen: false }, (client) => {
      this.accept(client);
    });
    const healthServer = createHttpServer((request, response) => {
      if (request.method !== 'GET' || request.url !== '/health') {
        response.writeHead(404, {
          'cache-control': 'no-store',
          'content-type': 'application/json; charset=utf-8',
        });
        response.end('{"ok":false}');
        return;
      }
      response.writeHead(this.ready ? 200 : 503, {
        'cache-control': 'no-store',
        'content-type': 'application/json; charset=utf-8',
      });
      response.end(
        JSON.stringify({
          service: 'identity-mail-smtp-egress',
          release: this.config.releaseSha,
          ok: this.ready,
          reasonCode: this.reasonCode,
        }),
      );
    });
    this.relayServer = relayServer;
    this.healthServer = healthServer;

    try {
      await Promise.all([
        listen(relayServer, this.config.listenPort, this.config.listenHost),
        listen(healthServer, this.config.healthPort, this.config.healthHost),
      ]);
    } catch {
      await this.stop().catch(() => undefined);
      throw new IdentityMailSmtpEgressBrokerError(
        'IDENTITY_MAIL_SMTP_EGRESS_LISTEN_FAILED',
      );
    }
    this.ready = true;
    this.reasonCode = null;
    this.logger.log({ event: 'IDENTITY_MAIL_SMTP_EGRESS_READY' });
  }

  async stop(reasonCode = 'IDENTITY_MAIL_SMTP_EGRESS_STOPPING'): Promise<void> {
    this.ready = false;
    this.reasonCode = reasonCode;
    for (const pair of [...this.pairs]) {
      this.closePair(pair);
    }
    const relayServer = this.relayServer;
    const healthServer = this.healthServer;
    this.relayServer = null;
    this.healthServer = null;
    await Promise.all([closeServer(relayServer), closeServer(healthServer)]);
  }

  private accept(client: Socket): void {
    if (!this.ready || this.pairs.size >= this.config.maxConnections) {
      client.destroy();
      this.logger.warn({
        event: 'IDENTITY_MAIL_SMTP_EGRESS_CONNECTION_REJECTED',
        reasonCode: this.ready
          ? 'IDENTITY_MAIL_SMTP_EGRESS_CAPACITY_EXCEEDED'
          : 'IDENTITY_MAIL_SMTP_EGRESS_NOT_READY',
      });
      return;
    }

    client.pause();
    client.setTimeout(this.config.idleTimeoutMs, () => client.destroy());
    const pair: SocketPair = { client, upstream: null, closed: false };
    this.pairs.add(pair);
    client.once('error', () => this.closePair(pair));
    client.once('close', () => this.closePair(pair));
    void this.connectPair(pair);
  }

  private async connectPair(pair: SocketPair): Promise<void> {
    let addresses: readonly string[];
    try {
      addresses = await this.resolveAdmittedAddresses();
    } catch {
      this.rejectPair(pair, 'IDENTITY_MAIL_SMTP_EGRESS_DNS_POLICY_REJECTED');
      return;
    }
    if (pair.closed) {
      return;
    }

    const address = addresses[this.nextAddressIndex % addresses.length];
    this.nextAddressIndex = (this.nextAddressIndex + 1) % addresses.length;
    let upstream: Socket;
    try {
      upstream = this.dependencies.connect({
        host: address,
        port: this.config.targetPort,
        family: 4,
        allowHalfOpen: false,
      });
    } catch {
      this.rejectPair(pair, 'IDENTITY_MAIL_SMTP_EGRESS_CONNECT_FAILED');
      return;
    }
    pair.upstream = upstream;
    upstream.setTimeout(this.config.idleTimeoutMs, () => upstream.destroy());
    const connectTimer = setTimeout(() => {
      upstream.destroy();
    }, this.config.connectTimeoutMs);
    upstream.once('connect', () => {
      clearTimeout(connectTimer);
      if (pair.closed) {
        upstream.destroy();
        return;
      }
      pair.client.pipe(upstream);
      upstream.pipe(pair.client);
      pair.client.resume();
    });
    upstream.once('error', () => {
      clearTimeout(connectTimer);
      this.closePair(pair);
    });
    upstream.once('close', () => {
      clearTimeout(connectTimer);
      this.closePair(pair);
    });
  }

  private rejectPair(pair: SocketPair, reasonCode: string): void {
    this.logger.warn({
      event: 'IDENTITY_MAIL_SMTP_EGRESS_CONNECTION_REJECTED',
      reasonCode,
    });
    this.closePair(pair);
  }

  private closePair(pair: SocketPair): void {
    if (pair.closed) {
      return;
    }
    pair.closed = true;
    this.pairs.delete(pair);
    pair.client.destroy();
    pair.upstream?.destroy();
  }

  private async resolveAdmittedAddresses(): Promise<readonly string[]> {
    let resolved: readonly ResolvedAddress[];
    try {
      resolved = await this.dependencies.lookupAllIpv4(this.config.targetHost);
    } catch {
      throw new IdentityMailSmtpEgressBrokerError(
        'IDENTITY_MAIL_SMTP_EGRESS_DNS_LOOKUP_FAILED',
      );
    }
    const addresses = [
      ...new Set(resolved.map((entry) => entry.address)),
    ].sort();
    if (
      addresses.length === 0 ||
      addresses.length > MAX_RESOLVED_ADDRESSES ||
      resolved.some((entry) => entry.family !== 4) ||
      addresses.some((address) => !isPublicIpv4Address(address))
    ) {
      throw new IdentityMailSmtpEgressBrokerError(
        'IDENTITY_MAIL_SMTP_EGRESS_DNS_POLICY_REJECTED',
      );
    }
    return addresses;
  }
}

export function isPublicIpv4Address(address: string): boolean {
  if (isIP(address) !== 4) {
    return false;
  }
  const [first, second, third] = address
    .split('.')
    .map((component) => Number(component));
  if (first === 0 || first === 10 || first === 127 || first >= 224) {
    return false;
  }
  if (first === 100 && second >= 64 && second <= 127) {
    return false;
  }
  if (first === 169 && second === 254) {
    return false;
  }
  if (first === 172 && second >= 16 && second <= 31) {
    return false;
  }
  if (
    first === 192 &&
    (second === 0 || (second === 88 && third === 99) || second === 168)
  ) {
    return false;
  }
  if (
    first === 198 &&
    (second === 18 || second === 19 || (second === 51 && third === 100))
  ) {
    return false;
  }
  if (first === 203 && second === 0 && third === 113) {
    return false;
  }
  return true;
}

const defaultDependencies: IdentityMailSmtpEgressBrokerDependencies = {
  lookupAllIpv4: (host) =>
    lookup(host, { all: true, family: 4, verbatim: true }) as Promise<
      readonly ResolvedAddress[]
    >,
  connect: (options) => createConnection(options),
};

function listen(
  server: NetServer | HttpServer,
  port: number,
  host: '127.0.0.1',
): Promise<void> {
  return new Promise((resolve, reject) => {
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
    server.listen(port, host);
  });
}

function closeServer(server: NetServer | HttpServer | null): Promise<void> {
  if (!server?.listening) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}
