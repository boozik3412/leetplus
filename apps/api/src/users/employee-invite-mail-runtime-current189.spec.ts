import type {
  EmployeeInviteMailProviderCurrent189,
  EmployeeInviteMailTokenOpener,
  EmployeeInviteMailWorkerCurrent189Repository,
} from './employee-invite-mail-worker-current189.types';
import type { EnabledEmployeeInviteMailRuntimeCurrent189Config } from './employee-invite-mail-runtime-current189.config';
import { EmployeeInviteMailRuntimeCurrent189HealthServer } from './employee-invite-mail-runtime-current189.health';
import {
  DormantEmployeeInviteMailRuntimeCurrent189,
  type EmployeeInviteMailRuntimeCurrent189SignalSource,
  type EmployeeInviteMailRuntimeCurrent189WorkerBoundary,
} from './employee-invite-mail-runtime-current189';
import { EmployeeInviteMailWorkerCurrent189 } from './employee-invite-mail-worker-current189';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'a'.repeat(43);

describe('DormantEmployeeInviteMailRuntimeCurrent189', () => {
  it('drains on SIGTERM before the first claim and closes at zero inflight exactly once', async () => {
    const signalSource = new FakeSignalSource();
    const harness = workerHarness();
    const health = healthBoundary();
    const runtime = runtimeBoundary(harness.worker, health);
    harness.repository.reapExpired.mockImplementationOnce(() => {
      signalSource.emit('SIGTERM');
      return Promise.resolve(0);
    });
    observeCloseInflight(harness.provider.close, health);

    await expect(runtime.run(signalSource)).resolves.toBeUndefined();

    expect(harness.repository.claimOne).not.toHaveBeenCalled();
    expect(harness.provider.send).not.toHaveBeenCalled();
    expect(harness.provider.close).toHaveBeenCalledTimes(1);
    expect(signalSource.listenerCount()).toBe(0);
    expect(health.snapshot()).toMatchObject({
      live: false,
      ready: false,
      mode: 'DRAINING',
      inflight: 0,
      completedCycles: 1,
      reasonCode: 'EMPLOYEE_INVITE_MAIL_STOPPED',
    });
  });

  it('finishes the accepted delivery after SIGTERM immediately after the durable provider mark', async () => {
    const signalSource = new FakeSignalSource();
    const harness = workerHarness();
    const health = healthBoundary();
    const runtime = runtimeBoundary(harness.worker, health);
    harness.repository.markProviderAttempt.mockImplementationOnce(() => {
      signalSource.emit('SIGTERM');
      return Promise.resolve('MARKED');
    });
    observeCloseInflight(harness.provider.close, health);

    await expect(runtime.run(signalSource)).resolves.toBeUndefined();

    expect(harness.repository.claimOne).toHaveBeenCalledTimes(1);
    expect(harness.repository.markProviderAttempt).toHaveBeenCalledTimes(1);
    expect(harness.provider.send).toHaveBeenCalledTimes(1);
    expect(harness.repository.markSent).toHaveBeenCalledTimes(1);
    expect(
      harness.repository.markReconciliationRequired,
    ).not.toHaveBeenCalled();
    expect(harness.provider.close).toHaveBeenCalledTimes(1);
    expect(health.snapshot()).toMatchObject({
      mode: 'DRAINING',
      inflight: 0,
      completedCycles: 1,
    });
  });

  it('settles provider acceptance after SIGTERM and closes only after terminal DB completion', async () => {
    const signalSource = new FakeSignalSource();
    const harness = workerHarness();
    const health = healthBoundary();
    const runtime = runtimeBoundary(harness.worker, health);
    harness.provider.send.mockImplementationOnce(() => {
      signalSource.emit('SIGTERM');
      return Promise.resolve({
        outcomeCode: 'EMPLOYEE_SMTP_ACCEPTED',
        receiptDigest: 'd'.repeat(64),
      });
    });
    observeCloseInflight(harness.provider.close, health);

    await expect(runtime.run(signalSource)).resolves.toBeUndefined();

    expect(harness.provider.send).toHaveBeenCalledTimes(1);
    expect(harness.repository.markSent).toHaveBeenCalledTimes(1);
    expect(harness.provider.close).toHaveBeenCalledTimes(1);
    expect(health.snapshot()).toMatchObject({
      mode: 'DRAINING',
      inflight: 0,
      completedCycles: 1,
    });
  });

  it('uses the emergency KILLED seam after provider mark without entering SMTP', async () => {
    const signalSource = new FakeSignalSource();
    const harness = workerHarness();
    const health = healthBoundary();
    const runtime = runtimeBoundary(harness.worker, health);
    harness.repository.markProviderAttempt.mockImplementationOnce(() => {
      runtime.emergencyKill();
      return Promise.resolve('MARKED');
    });
    observeCloseInflight(harness.provider.close, health);

    await expect(runtime.run(signalSource)).resolves.toBeUndefined();

    expect(harness.provider.send).not.toHaveBeenCalled();
    expect(harness.repository.markSent).not.toHaveBeenCalled();
    expect(harness.repository.markReconciliationRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        reasonCode: 'EMPLOYEE_INVITE_MAIL_EMERGENCY_STOP_AFTER_PROVIDER_MARK',
      }),
    );
    expect(harness.provider.close).toHaveBeenCalledTimes(1);
    expect(health.snapshot()).toMatchObject({
      mode: 'KILLED',
      inflight: 0,
      completedCycles: 1,
    });
  });

  it('bounds the run loop and provider close even when every cycle is empty', async () => {
    const signalSource = new FakeSignalSource();
    const health = healthBoundary();
    const worker = fakeWorker();
    const runtime = new DormantEmployeeInviteMailRuntimeCurrent189(
      runtimeConfig(2),
      worker,
      health,
    );
    worker.close.mockImplementation(() => {
      expect(health.snapshot().inflight).toBe(0);
    });

    await expect(runtime.run(signalSource)).resolves.toBeUndefined();

    expect(worker.assertRehearsalReady).toHaveBeenCalledTimes(1);
    expect(worker.runOnce).toHaveBeenCalledTimes(2);
    expect(worker.close).toHaveBeenCalledTimes(1);
    expect(health.snapshot()).toMatchObject({
      mode: 'DRAINING',
      inflight: 0,
      completedCycles: 2,
    });
  });

  it('fails closed, clears inflight, removes listeners and closes once on an unknown worker failure', async () => {
    const signalSource = new FakeSignalSource();
    const health = healthBoundary();
    const worker = fakeWorker();
    worker.runOnce.mockRejectedValueOnce(
      new Error('recipient@example.com secret-token'),
    );
    const runtime = runtimeBoundary(worker, health);
    worker.close.mockImplementation(() => {
      expect(health.snapshot().inflight).toBe(0);
    });

    await expect(runtime.run(signalSource)).rejects.toThrow(
      'EMPLOYEE_INVITE_MAIL_RUNTIME_FAILED',
    );

    expect(worker.close).toHaveBeenCalledTimes(1);
    expect(signalSource.listenerCount()).toBe(0);
    expect(JSON.stringify(health.snapshot())).not.toContain(
      'recipient@example.com',
    );
    expect(health.snapshot()).toMatchObject({
      live: false,
      ready: false,
      mode: 'KILLED',
      inflight: 0,
      completedCycles: 1,
    });
  });

  it('rejects production and a non-exact candidate status before any process activity', () => {
    const previousNodeEnvironment = process.env.NODE_ENV;
    const health = healthBoundary();
    const worker = fakeWorker();
    process.env.NODE_ENV = 'production';
    try {
      expect(
        () =>
          new DormantEmployeeInviteMailRuntimeCurrent189(
            runtimeConfig(),
            worker,
            health,
          ),
      ).toThrow('EMPLOYEE_INVITE_MAIL_RUNTIME_PRODUCTION_FORBIDDEN');
    } finally {
      if (previousNodeEnvironment === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnvironment;
      }
    }

    expect(
      () =>
        new DormantEmployeeInviteMailRuntimeCurrent189(
          {
            ...runtimeConfig(),
            candidateStatus: 'DEPLOYABLE',
          } as unknown as EnabledEmployeeInviteMailRuntimeCurrent189Config,
          worker,
          health,
        ),
    ).toThrow('EMPLOYEE_INVITE_MAIL_RUNTIME_PRODUCTION_FORBIDDEN');
    expect(worker.assertRehearsalReady).not.toHaveBeenCalled();
    expect(worker.close).not.toHaveBeenCalled();
  });
});

class FakeSignalSource implements EmployeeInviteMailRuntimeCurrent189SignalSource {
  private readonly listeners = new Map<'SIGINT' | 'SIGTERM', Set<() => void>>();

  once(signal: 'SIGINT' | 'SIGTERM', listener: () => void): void {
    const listeners = this.listeners.get(signal) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(signal, listeners);
  }

  off(signal: 'SIGINT' | 'SIGTERM', listener: () => void): void {
    this.listeners.get(signal)?.delete(listener);
  }

  emit(signal: 'SIGINT' | 'SIGTERM'): void {
    const listeners = [...(this.listeners.get(signal) ?? [])];
    this.listeners.get(signal)?.clear();
    for (const listener of listeners) listener();
  }

  listenerCount(): number {
    return [...this.listeners.values()].reduce(
      (count, listeners) => count + listeners.size,
      0,
    );
  }
}

function workerHarness() {
  const repository = {
    assertRehearsalReady: jest.fn(() => Promise.resolve(undefined)),
    reapExpired: jest.fn(() => Promise.resolve(0)),
    claimOne: jest.fn(() =>
      Promise.resolve({ decision: 'CLAIMED' as const, claim: claim() }),
    ),
    markProviderAttempt: jest.fn(() => Promise.resolve('MARKED' as const)),
    markSent: jest.fn(() => Promise.resolve(undefined)),
    markPreProviderFailure: jest.fn(() => Promise.resolve('RETRY' as const)),
    markReconciliationRequired: jest.fn(() => Promise.resolve(undefined)),
  } satisfies EmployeeInviteMailWorkerCurrent189Repository;
  const tokenOpener = {
    open: jest.fn(() => TOKEN),
  } satisfies EmployeeInviteMailTokenOpener;
  const provider = {
    verify: jest.fn(() => Promise.resolve(undefined)),
    send: jest.fn(() =>
      Promise.resolve({
        outcomeCode: 'EMPLOYEE_SMTP_ACCEPTED' as const,
        receiptDigest: 'd'.repeat(64),
      }),
    ),
    close: jest.fn(),
  } satisfies EmployeeInviteMailProviderCurrent189;
  const worker = new EmployeeInviteMailWorkerCurrent189(
    runtimeConfig().worker,
    repository,
    tokenOpener,
    provider,
    undefined,
    {
      randomBytes: (size) => Buffer.alloc(size, 8),
      randomUuid: () => '77777777-7777-4777-8777-777777777777',
    },
  );
  return { worker, repository, tokenOpener, provider };
}

function fakeWorker() {
  return {
    assertRehearsalReady: jest.fn(() => Promise.resolve(undefined)),
    runOnce: jest.fn(() =>
      Promise.resolve({
        claimed: 0,
        sent: 0,
        retry: 0,
        dead: 0,
        canceled: 0,
        reconciliationRequired: 0,
      }),
    ),
    close: jest.fn(),
  } satisfies EmployeeInviteMailRuntimeCurrent189WorkerBoundary;
}

function runtimeBoundary(
  worker: EmployeeInviteMailRuntimeCurrent189WorkerBoundary,
  health: EmployeeInviteMailRuntimeCurrent189HealthServer,
): DormantEmployeeInviteMailRuntimeCurrent189 {
  return new DormantEmployeeInviteMailRuntimeCurrent189(
    runtimeConfig(),
    worker,
    health,
  );
}

function healthBoundary(): EmployeeInviteMailRuntimeCurrent189HealthServer {
  return new EmployeeInviteMailRuntimeCurrent189HealthServer(
    '127.0.0.1',
    0,
    'a'.repeat(40),
  );
}

function runtimeConfig(
  maxCycles = 1,
): EnabledEmployeeInviteMailRuntimeCurrent189Config {
  const smtp = {
    host: 'smtp.example.com',
    port: 587,
    tlsMode: 'STARTTLS' as const,
    servername: 'smtp.example.com',
    username: 'employee-smtp-user',
    password: 'synthetic-employee-smtp-secret',
    from: 'employee-noreply@example.com',
    messageIdDomain: 'mail.leetplus.ru',
    connectionTimeoutMs: 1_000,
    greetingTimeoutMs: 1_000,
    socketTimeoutMs: 5_000,
  };
  const worker = {
    enabled: true as const,
    realProviderEnabled: true as const,
    production: false as const,
    candidateStatus: 'NOT_DEPLOYABLE' as const,
    publicWebOrigin: 'https://leetplus.ru' as const,
    aadEnvironment: 'isolated_test',
    keyVersion: 'v1' as const,
    tenantIds: [TENANT_ID],
    batchSize: 1,
    providerAuthorityDigest: 'a'.repeat(64),
    from: smtp.from,
    messageIdDomain: smtp.messageIdDomain,
    expectedPolicy: {
      maxAttempts: 3,
      leaseSeconds: 60,
      acknowledgeSeconds: 30,
      baseRetrySeconds: 15,
      maxRetrySeconds: 300,
    },
  };
  return {
    enabled: true,
    rehearsalEnabled: true,
    realProviderEnabled: true,
    production: false,
    candidateStatus: 'NOT_DEPLOYABLE',
    expectedCandidate:
      '20260805030000_identity_employee_invite_mail_boundary_current189',
    releaseSha: 'a'.repeat(40),
    databaseUrl:
      'postgresql://employee:synthetic-db-secret@127.0.0.1:5432/leetplus_beta?schema=public&connect_timeout=5&socket_timeout=30',
    expectedDatabase: 'leetplus_beta',
    expectedRole: 'leetplus_employee_mail_worker_current189',
    databaseTlsRequired: false,
    envelopeKeyBase64url: Buffer.from(
      Array.from({ length: 32 }, (_, index) => index + 1),
    ).toString('base64url'),
    envelopeKeyVersion: 'v1',
    aadEnvironment: 'isolated_test',
    providerAuthorityDigest: 'a'.repeat(64),
    smtp,
    worker,
    pollIntervalMs: 10,
    maxCycles,
    healthHost: '127.0.0.1',
    healthPort: 4_201,
  };
}

function claim() {
  return {
    tenantId: TENANT_ID,
    deliveryLocator: '55555555-5555-4555-8555-555555555555',
    inviteId: '33333333-3333-4333-8333-333333333333',
    outboxId: '44444444-4444-4444-8444-444444444444',
    template: 'EMPLOYEE_USER_INVITE' as const,
    messageKey: '66666666-6666-4666-8666-666666666666',
    requestDigest: 'e'.repeat(64),
    recipientEmail: 'employee@example.com',
    expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    tokenHash: 'f'.repeat(64),
    digestVersion: 'sha256-v1' as const,
    secretCiphertext: Buffer.alloc(71, 9),
    envelopeVersion: 1 as const,
    keyVersion: 'v1' as const,
    aadEnvironment: 'isolated_test',
    leaseVersion: 1n,
    transitionRevision: 4,
    attemptNumber: 1,
    claimEnrollmentStateRevision: 3n,
    claimPolicyRevision: 2,
    claimProviderAuthorityDigest: 'a'.repeat(64),
  };
}

function observeCloseInflight(
  close: {
    mockImplementation(implementation: () => void): unknown;
  },
  health: EmployeeInviteMailRuntimeCurrent189HealthServer,
): void {
  close.mockImplementation(() => {
    expect(health.snapshot().inflight).toBe(0);
  });
}
