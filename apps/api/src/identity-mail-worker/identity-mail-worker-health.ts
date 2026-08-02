import { createServer, type Server } from 'node:http';

type IdentityMailWorkerHealthState = {
  service: 'identity-mail-worker';
  release: string;
  ok: boolean;
  reasonCode: string | null;
};

export class IdentityMailWorkerHealthServer {
  private server: Server | null = null;
  private state: IdentityMailWorkerHealthState;

  constructor(
    private readonly host: '127.0.0.1',
    private readonly port: number,
    releaseSha: string,
  ) {
    this.state = {
      service: 'identity-mail-worker',
      release: releaseSha,
      ok: false,
      reasonCode: 'IDENTITY_MAIL_WORKER_STARTING',
    };
  }

  async start(): Promise<void> {
    if (this.server) {
      throw new Error('IDENTITY_MAIL_WORKER_HEALTH_ALREADY_STARTED');
    }
    const server = createServer((request, response) => {
      if (request.method !== 'GET' || request.url !== '/health') {
        response.writeHead(404, {
          'cache-control': 'no-store',
          'content-type': 'application/json; charset=utf-8',
        });
        response.end('{"ok":false}');
        return;
      }
      const status = this.state.ok ? 200 : 503;
      response.writeHead(status, {
        'cache-control': 'no-store',
        'content-type': 'application/json; charset=utf-8',
      });
      response.end(JSON.stringify(this.state));
    });
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
      server.listen(this.port, this.host);
    });
  }

  ready(): void {
    this.state = {
      ...this.state,
      ok: true,
      reasonCode: null,
    };
  }

  failed(reasonCode: string): void {
    this.state = {
      ...this.state,
      ok: false,
      reasonCode,
    };
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (!server) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}
