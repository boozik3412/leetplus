import { EmployeeInviteMailProviderCurrent189Error } from './employee-invite-mail-provider-current189';
import {
  EMPLOYEE_INVITE_MAIL_RUNTIME_CURRENT189_CANDIDATE,
  EMPLOYEE_INVITE_MAIL_RUNTIME_CURRENT189_STATUS,
  EmployeeInviteMailRuntimeCurrent189ConfigurationError,
  type EnabledEmployeeInviteMailRuntimeCurrent189Config,
} from './employee-invite-mail-runtime-current189.config';
import type { EmployeeInviteMailRuntimeCurrent189HealthBoundary } from './employee-invite-mail-runtime-current189.health';
import { EmployeeInviteMailWorkerCurrent189RepositoryError } from './employee-invite-mail-worker-current189.repository';
import {
  DormantEmployeeInviteMailWorkerCurrent189Control,
  EmployeeInviteMailWorkerCurrent189Error,
} from './employee-invite-mail-worker-current189';
import type {
  EmployeeInviteMailWorkerControl,
  EmployeeInviteMailWorkerRunResult,
} from './employee-invite-mail-worker-current189.types';

type RuntimeSignal = 'SIGINT' | 'SIGTERM';
type RuntimeSignalListener = () => void;

export interface EmployeeInviteMailRuntimeCurrent189SignalSource {
  once(signal: RuntimeSignal, listener: RuntimeSignalListener): void;
  off(signal: RuntimeSignal, listener: RuntimeSignalListener): void;
}

export interface EmployeeInviteMailRuntimeCurrent189WorkerBoundary {
  assertRehearsalReady(): Promise<void>;
  runOnce(
    control: EmployeeInviteMailWorkerControl,
  ): Promise<EmployeeInviteMailWorkerRunResult>;
  close(): void;
}

export class EmployeeInviteMailRuntimeCurrent189Error extends Error {
  constructor(readonly reasonCode: string) {
    super(reasonCode);
    this.name = 'EmployeeInviteMailRuntimeCurrent189Error';
  }
}

const processSignalSource: EmployeeInviteMailRuntimeCurrent189SignalSource = {
  once: (signal, listener) => process.once(signal, listener),
  off: (signal, listener) => process.off(signal, listener),
};

/**
 * Dormant bounded process seam. Merely importing this file registers no
 * signal, timer, module provider or startup hook.
 */
export class DormantEmployeeInviteMailRuntimeCurrent189 {
  private readonly control =
    new DormantEmployeeInviteMailWorkerCurrent189Control();
  private started = false;
  private closed = false;
  private wakeDelay: (() => void) | null = null;

  constructor(
    private readonly config: EnabledEmployeeInviteMailRuntimeCurrent189Config,
    private readonly worker: EmployeeInviteMailRuntimeCurrent189WorkerBoundary,
    private readonly health: EmployeeInviteMailRuntimeCurrent189HealthBoundary,
  ) {
    this.assertDormantConfig();
  }

  async run(
    signalSource: EmployeeInviteMailRuntimeCurrent189SignalSource = processSignalSource,
  ): Promise<void> {
    if (this.started) {
      fail('EMPLOYEE_INVITE_MAIL_RUNTIME_ALREADY_STARTED');
    }
    this.started = true;
    this.assertDormantConfig();
    const drain = () => this.requestDrain();
    signalSource.once('SIGINT', drain);
    signalSource.once('SIGTERM', drain);
    let failure: unknown;

    try {
      await this.health.start();
      if (this.mode() === 'ACTIVE') {
        await this.worker.assertRehearsalReady();
        if (this.mode() === 'ACTIVE') {
          this.health.ready();

          let completedCycles = 0;
          while (
            this.mode() === 'ACTIVE' &&
            completedCycles < this.config.maxCycles
          ) {
            this.health.cycleStarted();
            try {
              await this.worker.runOnce(this.control);
            } finally {
              this.health.cycleFinished();
            }
            completedCycles += 1;
            if (
              this.mode() === 'ACTIVE' &&
              completedCycles < this.config.maxCycles
            ) {
              await this.interruptibleDelay(this.config.pollIntervalMs);
            }
          }
          if (this.mode() === 'ACTIVE') {
            this.requestDrain();
          }
        }
      }
    } catch (error) {
      failure = error;
      this.health.failed(safeReasonCode(error));
    } finally {
      signalSource.off('SIGINT', drain);
      signalSource.off('SIGTERM', drain);
      this.wakeDelay?.();
      try {
        this.closeWorkerOnce();
      } catch (error) {
        failure ??= error;
        this.health.failed(safeReasonCode(error));
      }
      try {
        this.health.stopped();
      } catch (error) {
        failure ??= error;
      }
      try {
        await this.health.stop();
      } catch (error) {
        failure ??= error;
      }
    }

    if (failure !== undefined) {
      throw new EmployeeInviteMailRuntimeCurrent189Error(
        safeReasonCode(failure),
      );
    }
  }

  requestDrain(): void {
    if (this.closed) return;
    this.control.beginGlobalDrain();
    this.health.beginDrain();
    this.wakeDelay?.();
  }

  emergencyKill(): void {
    if (this.closed) return;
    this.control.killGlobal();
    this.health.killed();
    this.wakeDelay?.();
  }

  private mode() {
    return this.control.modeAt({ boundary: 'BEFORE_CYCLE', tenantId: null });
  }

  private closeWorkerOnce(): void {
    if (this.closed) return;
    if (this.health.snapshot().inflight !== 0) {
      fail('EMPLOYEE_INVITE_MAIL_RUNTIME_CLOSE_WITH_INFLIGHT');
    }
    this.closed = true;
    this.worker.close();
  }

  private interruptibleDelay(durationMs: number): Promise<void> {
    if (this.mode() !== 'ACTIVE') return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.wakeDelay = null;
        resolve();
      }, durationMs);
      this.wakeDelay = () => {
        clearTimeout(timer);
        this.wakeDelay = null;
        resolve();
      };
    });
  }

  private assertDormantConfig(): void {
    if (
      process.env.NODE_ENV === 'production' ||
      this.config.enabled !== true ||
      this.config.rehearsalEnabled !== true ||
      this.config.realProviderEnabled !== true ||
      this.config.production !== false ||
      this.config.candidateStatus !==
        EMPLOYEE_INVITE_MAIL_RUNTIME_CURRENT189_STATUS ||
      this.config.expectedCandidate !==
        EMPLOYEE_INVITE_MAIL_RUNTIME_CURRENT189_CANDIDATE ||
      !Number.isSafeInteger(this.config.maxCycles) ||
      this.config.maxCycles < 1 ||
      this.config.maxCycles > 100 ||
      !Number.isSafeInteger(this.config.pollIntervalMs) ||
      this.config.pollIntervalMs < 10 ||
      this.config.pollIntervalMs > 300_000
    ) {
      fail('EMPLOYEE_INVITE_MAIL_RUNTIME_PRODUCTION_FORBIDDEN');
    }
  }
}

function safeReasonCode(error: unknown): string {
  if (
    error instanceof EmployeeInviteMailRuntimeCurrent189Error ||
    error instanceof EmployeeInviteMailRuntimeCurrent189ConfigurationError ||
    error instanceof EmployeeInviteMailWorkerCurrent189Error ||
    error instanceof EmployeeInviteMailWorkerCurrent189RepositoryError ||
    error instanceof EmployeeInviteMailProviderCurrent189Error
  ) {
    return error.reasonCode;
  }
  return 'EMPLOYEE_INVITE_MAIL_RUNTIME_FAILED';
}

function fail(reasonCode: string): never {
  throw new EmployeeInviteMailRuntimeCurrent189Error(reasonCode);
}
