import { createServer, type Server } from 'node:http';

const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const REASON_CODE_PATTERN = /^EMPLOYEE_INVITE_MAIL_[A-Z0-9_]{1,72}$/u;

export type EmployeeInviteMailRuntimeCurrent189HealthState = Readonly<{
  service: 'employee-invite-mail-worker-current189';
  contract: 'IDENTITY_EMPLOYEE_INVITE_CURRENT189_V1';
  candidateStatus: 'NOT_DEPLOYABLE';
  release: string;
  live: boolean;
  ready: boolean;
  mode: 'ACTIVE' | 'DRAINING' | 'KILLED';
  inflight: 0 | 1;
  completedCycles: number;
  reasonCode: string;
}>;

export interface EmployeeInviteMailRuntimeCurrent189HealthBoundary {
  start(): Promise<void>;
  ready(): void;
  cycleStarted(): void;
  cycleFinished(): void;
  beginDrain(): void;
  killed(): void;
  failed(reasonCode: string): void;
  stopped(): void;
  snapshot(): EmployeeInviteMailRuntimeCurrent189HealthState;
  stop(): Promise<void>;
}

/** Dormant loopback-only health/readiness surface; it contains no tenant or PII. */
export class EmployeeInviteMailRuntimeCurrent189HealthServer implements EmployeeInviteMailRuntimeCurrent189HealthBoundary {
  private server: Server | null = null;
  private state: EmployeeInviteMailRuntimeCurrent189HealthState;

  constructor(
    private readonly host: '127.0.0.1',
    private readonly port: number,
    releaseSha: string,
  ) {
    if (
      host !== '127.0.0.1' ||
      !Number.isSafeInteger(port) ||
      port < 0 ||
      port > 65_535 ||
      !RELEASE_SHA_PATTERN.test(releaseSha)
    ) {
      throw new Error('EMPLOYEE_INVITE_MAIL_HEALTH_CONFIGURATION_INVALID');
    }
    this.state = Object.freeze({
      service: 'employee-invite-mail-worker-current189',
      contract: 'IDENTITY_EMPLOYEE_INVITE_CURRENT189_V1',
      candidateStatus: 'NOT_DEPLOYABLE',
      release: releaseSha,
      live: false,
      ready: false,
      mode: 'ACTIVE',
      inflight: 0,
      completedCycles: 0,
      reasonCode: 'EMPLOYEE_INVITE_MAIL_STARTING',
    });
  }

  async start(): Promise<void> {
    if (this.server) {
      throw new Error('EMPLOYEE_INVITE_MAIL_HEALTH_ALREADY_STARTED');
    }
    const server = createServer((request, response) => {
      const knownPath = request.url === '/health' || request.url === '/ready';
      if (request.method !== 'GET' || !knownPath) {
        response.writeHead(404, headers());
        response.end('{"ok":false}');
        return;
      }
      const ok = request.url === '/ready' ? this.state.ready : this.state.live;
      response.writeHead(ok ? 200 : 503, headers());
      response.end(JSON.stringify(this.state));
    });
    this.server = server;
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off('listening', onListening);
        this.server = null;
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
    if (this.state.mode !== 'KILLED') {
      this.patch({ live: true });
    }
  }

  ready(): void {
    if (
      !this.state.live ||
      this.state.mode !== 'ACTIVE' ||
      this.state.inflight !== 0
    ) {
      throw new Error('EMPLOYEE_INVITE_MAIL_HEALTH_READY_TRANSITION_INVALID');
    }
    this.patch({ ready: true, reasonCode: 'EMPLOYEE_INVITE_MAIL_READY' });
  }

  cycleStarted(): void {
    if (
      !this.state.ready ||
      this.state.mode !== 'ACTIVE' ||
      this.state.inflight !== 0
    ) {
      throw new Error(
        'EMPLOYEE_INVITE_MAIL_HEALTH_INFLIGHT_TRANSITION_INVALID',
      );
    }
    this.patch({ inflight: 1 });
  }

  cycleFinished(): void {
    if (this.state.inflight !== 1) {
      throw new Error(
        'EMPLOYEE_INVITE_MAIL_HEALTH_INFLIGHT_TRANSITION_INVALID',
      );
    }
    this.patch({
      inflight: 0,
      completedCycles: this.state.completedCycles + 1,
    });
  }

  beginDrain(): void {
    if (this.state.mode === 'KILLED') return;
    this.patch({
      ready: false,
      mode: 'DRAINING',
      reasonCode: 'EMPLOYEE_INVITE_MAIL_DRAINING',
    });
  }

  killed(): void {
    this.patch({
      live: false,
      ready: false,
      mode: 'KILLED',
      reasonCode: 'EMPLOYEE_INVITE_MAIL_KILLED',
    });
  }

  failed(reasonCode: string): void {
    this.patch({
      live: false,
      ready: false,
      mode: 'KILLED',
      reasonCode: safeReasonCode(reasonCode),
    });
  }

  stopped(): void {
    if (this.state.inflight !== 0) {
      throw new Error('EMPLOYEE_INVITE_MAIL_HEALTH_STOP_WITH_INFLIGHT');
    }
    this.patch({
      live: false,
      ready: false,
      mode: this.state.mode === 'KILLED' ? 'KILLED' : 'DRAINING',
      reasonCode: 'EMPLOYEE_INVITE_MAIL_STOPPED',
    });
  }

  snapshot(): EmployeeInviteMailRuntimeCurrent189HealthState {
    return this.state;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  private patch(
    value: Partial<EmployeeInviteMailRuntimeCurrent189HealthState>,
  ): void {
    this.state = Object.freeze({ ...this.state, ...value });
  }
}

function safeReasonCode(value: string): string {
  return REASON_CODE_PATTERN.test(value)
    ? value
    : 'EMPLOYEE_INVITE_MAIL_RUNTIME_FAILED';
}

function headers() {
  return {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  };
}
