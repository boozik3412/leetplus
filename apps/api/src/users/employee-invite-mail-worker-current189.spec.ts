import { EmployeeInviteMailProviderCurrent189Error } from './employee-invite-mail-provider-current189';
import type { IdentityMailMessage } from '../identity-mail-worker/identity-mail-worker.types';
import {
  DormantEmployeeInviteMailWorkerCurrent189Control,
  EmployeeInviteMailWorkerCurrent189,
} from './employee-invite-mail-worker-current189';
import type {
  EmployeeInviteMailClaimCurrent189,
  EmployeeInviteMailProviderCurrent189,
  EmployeeInviteMailTokenOpener,
  EmployeeInviteMailWorkerControl,
  EmployeeInviteMailWorkerCurrent189Config,
  EmployeeInviteMailWorkerCurrent189Repository,
  EmployeeInviteMailWorkerLogEvent,
} from './employee-invite-mail-worker-current189.types';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const TOKEN = 'a'.repeat(43);
const TESTER_EMAIL = 'employee@example.com';

describe('EmployeeInviteMailWorkerCurrent189', () => {
  it('completes one happy-path employee invitation and zeroizes ciphertext', async () => {
    const claim = claimedDelivery();
    const harness = workerHarness(claim);

    await expect(harness.worker.runOnce()).resolves.toEqual({
      claimed: 1,
      sent: 1,
      retry: 0,
      dead: 0,
      canceled: 0,
      reconciliationRequired: 0,
    });

    expect(harness.repository.assertRehearsalReady).toHaveBeenCalledTimes(1);
    expect(harness.provider.verify).toHaveBeenCalledTimes(1);
    expect(harness.repository.reapExpired).toHaveBeenCalledTimes(1);
    expect(harness.repository.markProviderAttempt).toHaveBeenCalledTimes(1);
    expect(harness.provider.send).toHaveBeenCalledTimes(1);
    expect(harness.repository.markSent).toHaveBeenCalledTimes(1);
    expect(
      harness.repository.markReconciliationRequired,
    ).not.toHaveBeenCalled();
    const sentMessage = harness.provider.send.mock.calls[0]?.[0];
    expect(sentMessage?.to).toBe(TESTER_EMAIL);
    expect(sentMessage?.messageId).toBe(
      '<employee-invite-66666666-6666-4666-8666-666666666666@mail.leetplus.ru>',
    );
    expect(sentMessage?.text).toContain(`/register#invite=${TOKEN}`);
    expect(sentMessage?.html).toContain(`/register#invite=${TOKEN}`);
    expect([...claim.secretCiphertext]).toEqual(new Array(71).fill(0));
    expect(JSON.stringify(harness.events)).not.toContain(TESTER_EMAIL);
    expect(JSON.stringify(harness.events)).not.toContain(TOKEN);
    expect(JSON.stringify(harness.events)).not.toContain('smtp-secret');
  });

  it('quarantines an ambiguous SMTP result exactly once and never blind-resends', async () => {
    const claim = claimedDelivery();
    const harness = workerHarness(claim);
    harness.provider.send.mockRejectedValueOnce(
      new EmployeeInviteMailProviderCurrent189Error(
        'EMPLOYEE_INVITE_SMTP_RESULT_AMBIGUOUS',
      ),
    );

    await expect(harness.worker.runOnce()).resolves.toEqual({
      claimed: 1,
      sent: 0,
      retry: 0,
      dead: 0,
      canceled: 0,
      reconciliationRequired: 1,
    });

    expect(harness.provider.send).toHaveBeenCalledTimes(1);
    expect(harness.repository.markSent).not.toHaveBeenCalled();
    expect(harness.repository.markReconciliationRequired).toHaveBeenCalledTimes(
      1,
    );
    expect(harness.repository.claimOne).toHaveBeenCalledTimes(1);
    expect([...claim.secretCiphertext]).toEqual(new Array(71).fill(0));
    expect(harness.events).toContainEqual({
      event: 'EMPLOYEE_INVITE_MAIL_RECONCILIATION_REQUIRED',
      reasonCode: 'EMPLOYEE_INVITE_SMTP_RESULT_AMBIGUOUS',
    });
  });

  it('does DB-only reaping in DRAINING and does not admit provider work', async () => {
    const harness = workerHarness(claimedDelivery());
    const control = new DormantEmployeeInviteMailWorkerCurrent189Control();
    control.beginGlobalDrain();

    await expect(harness.worker.runOnce(control)).resolves.toEqual(
      emptyResult(),
    );

    expect(harness.repository.reapExpired).toHaveBeenCalledTimes(1);
    expect(harness.repository.assertRehearsalReady).not.toHaveBeenCalled();
    expect(harness.provider.verify).not.toHaveBeenCalled();
    expect(harness.repository.claimOne).not.toHaveBeenCalled();
    expect(harness.provider.send).not.toHaveBeenCalled();
  });

  it('performs no DB or provider operation when globally KILLED', async () => {
    const harness = workerHarness(claimedDelivery());
    const control = new DormantEmployeeInviteMailWorkerCurrent189Control();
    control.killGlobal();

    await expect(harness.worker.runOnce(control)).resolves.toEqual(
      emptyResult(),
    );

    expect(harness.repository.assertRehearsalReady).not.toHaveBeenCalled();
    expect(harness.repository.reapExpired).not.toHaveBeenCalled();
    expect(harness.repository.claimOne).not.toHaveBeenCalled();
    expect(harness.provider.verify).not.toHaveBeenCalled();
    expect(harness.provider.send).not.toHaveBeenCalled();
  });

  it('settles a kill observed after claim as a pre-provider retry', async () => {
    const claim = claimedDelivery();
    const harness = workerHarness(claim);
    const control = boundaryControl('AFTER_CLAIM');

    await expect(harness.worker.runOnce(control)).resolves.toEqual({
      ...emptyResult(),
      claimed: 1,
      retry: 1,
    });

    expect(harness.repository.markPreProviderFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        reasonCode: 'EMPLOYEE_INVITE_MAIL_EMERGENCY_STOP_PRE_PROVIDER',
      }),
    );
    expect(harness.repository.markProviderAttempt).not.toHaveBeenCalled();
    expect(harness.provider.send).not.toHaveBeenCalled();
    expect([...claim.secretCiphertext]).toEqual(new Array(71).fill(0));
  });

  it('quarantines a kill after provider marker without entering SMTP', async () => {
    const harness = workerHarness(claimedDelivery());
    const control = boundaryControl('AFTER_PROVIDER_MARK');

    await expect(harness.worker.runOnce(control)).resolves.toEqual({
      ...emptyResult(),
      claimed: 1,
      reconciliationRequired: 1,
    });

    expect(harness.repository.markProviderAttempt).toHaveBeenCalledTimes(1);
    expect(harness.provider.send).not.toHaveBeenCalled();
    expect(harness.repository.markReconciliationRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        reasonCode: 'EMPLOYEE_INVITE_MAIL_EMERGENCY_STOP_AFTER_PROVIDER_MARK',
      }),
    );
  });

  it('completes a confirmed provider acceptance even when kill arrives afterward', async () => {
    const harness = workerHarness(claimedDelivery());
    const control = boundaryControl('AFTER_PROVIDER_ACCEPTED');

    await expect(harness.worker.runOnce(control)).resolves.toEqual({
      ...emptyResult(),
      claimed: 1,
      sent: 1,
    });

    expect(harness.provider.send).toHaveBeenCalledTimes(1);
    expect(harness.repository.markSent).toHaveBeenCalledTimes(1);
    expect(
      harness.repository.markReconciliationRequired,
    ).not.toHaveBeenCalled();
  });

  it('honors a DB handoff without provider send or a second settlement', async () => {
    const harness = workerHarness(claimedDelivery());
    harness.repository.markProviderAttempt.mockResolvedValueOnce('HANDOFF');

    await expect(harness.worker.runOnce()).resolves.toEqual({
      ...emptyResult(),
      claimed: 1,
      reconciliationRequired: 1,
    });

    expect(harness.provider.send).not.toHaveBeenCalled();
    expect(harness.repository.markSent).not.toHaveBeenCalled();
    expect(
      harness.repository.markReconciliationRequired,
    ).not.toHaveBeenCalled();
    expect(harness.events).toContainEqual({
      event: 'EMPLOYEE_INVITE_MAIL_HANDOFF',
    });
  });

  it('counts a canceled scan against the bounded tenant batch', async () => {
    const harness = workerHarness(claimedDelivery());
    harness.repository.claimOne.mockResolvedValue({
      decision: 'CANCELED',
      outboxId: '44444444-4444-4444-8444-444444444444',
    });

    await expect(harness.worker.runOnce()).resolves.toEqual({
      ...emptyResult(),
      canceled: 1,
    });

    expect(harness.repository.claimOne).toHaveBeenCalledTimes(1);
    expect(harness.repository.markProviderAttempt).not.toHaveBeenCalled();
    expect(harness.provider.send).not.toHaveBeenCalled();
  });

  it('fails closed in production before readiness, DB, or provider activity', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const harness = () => workerHarness(claimedDelivery());
      expect(harness).toThrow(
        'EMPLOYEE_INVITE_MAIL_CURRENT189_PRODUCTION_FORBIDDEN',
      );
    } finally {
      if (previous === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previous;
      }
    }
  });

  it('keeps tenant drain isolated and control transitions monotonic', () => {
    const control = new DormantEmployeeInviteMailWorkerCurrent189Control();
    control.beginTenantDrain(TENANT_A);
    expect(
      control.modeAt({ boundary: 'BEFORE_CLAIM', tenantId: TENANT_A }),
    ).toBe('DRAINING');
    expect(
      control.modeAt({ boundary: 'BEFORE_CLAIM', tenantId: TENANT_B }),
    ).toBe('ACTIVE');
    control.killTenant(TENANT_A);
    control.beginTenantDrain(TENANT_A);
    expect(control.snapshot()).toEqual({
      globalMode: 'ACTIVE',
      tenants: [{ tenantId: TENANT_A, mode: 'KILLED' }],
    });
  });

  it('rejects malformed control tenant IDs without persisting them', () => {
    const control = new DormantEmployeeInviteMailWorkerCurrent189Control();
    expect(() => control.killTenant('demo')).toThrow(
      'EMPLOYEE_INVITE_MAIL_CONTROL_TENANT_INVALID',
    );
    expect(control.snapshot()).toEqual({ globalMode: 'ACTIVE', tenants: [] });
  });
});

function workerHarness(claim: EmployeeInviteMailClaimCurrent189) {
  const events: EmployeeInviteMailWorkerLogEvent[] = [];
  const repository = {
    assertRehearsalReady: jest.fn(() => Promise.resolve(undefined)),
    reapExpired: jest.fn(() => Promise.resolve(0)),
    claimOne: jest.fn(() =>
      Promise.resolve({ decision: 'CLAIMED' as const, claim }),
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
    send: jest.fn((messageValue: IdentityMailMessage) => {
      void messageValue;
      return Promise.resolve({
        outcomeCode: 'EMPLOYEE_SMTP_ACCEPTED' as const,
        receiptDigest: 'd'.repeat(64),
      });
    }),
    close: jest.fn(),
  } satisfies EmployeeInviteMailProviderCurrent189;
  const logger = {
    log: jest.fn((event: EmployeeInviteMailWorkerLogEvent) =>
      events.push(event),
    ),
    warn: jest.fn((event: EmployeeInviteMailWorkerLogEvent) =>
      events.push(event),
    ),
    error: jest.fn((event: EmployeeInviteMailWorkerLogEvent) =>
      events.push(event),
    ),
  };
  const entropy = {
    randomBytes: jest.fn((size: number) => Buffer.alloc(size, 8)),
    randomUuid: jest.fn(() => '77777777-7777-4777-8777-777777777777'),
  };
  return {
    worker: new EmployeeInviteMailWorkerCurrent189(
      config(),
      repository,
      tokenOpener,
      provider,
      logger,
      entropy,
    ),
    repository,
    tokenOpener,
    provider,
    logger,
    entropy,
    events,
  };
}

function config(): EmployeeInviteMailWorkerCurrent189Config {
  return {
    enabled: true,
    realProviderEnabled: true,
    production: false,
    candidateStatus: 'NOT_DEPLOYABLE',
    publicWebOrigin: 'https://leetplus.ru',
    aadEnvironment: 'test',
    keyVersion: 'v1',
    tenantIds: [TENANT_A],
    batchSize: 1,
    providerAuthorityDigest: 'a'.repeat(64),
    from: 'noreply@example.com',
    messageIdDomain: 'mail.leetplus.ru',
    expectedPolicy: {
      maxAttempts: 3,
      leaseSeconds: 60,
      acknowledgeSeconds: 30,
      baseRetrySeconds: 15,
      maxRetrySeconds: 300,
    },
  };
}

function claimedDelivery(): EmployeeInviteMailClaimCurrent189 {
  return {
    tenantId: TENANT_A,
    deliveryLocator: '55555555-5555-4555-8555-555555555555',
    inviteId: '33333333-3333-4333-8333-333333333333',
    outboxId: '44444444-4444-4444-8444-444444444444',
    template: 'EMPLOYEE_USER_INVITE',
    messageKey: '66666666-6666-4666-8666-666666666666',
    requestDigest: 'e'.repeat(64),
    recipientEmail: TESTER_EMAIL,
    expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    tokenHash: 'f'.repeat(64),
    digestVersion: 'sha256-v1',
    secretCiphertext: Buffer.alloc(71, 9),
    envelopeVersion: 1,
    keyVersion: 'v1',
    aadEnvironment: 'test',
    leaseVersion: 1n,
    transitionRevision: 4,
    attemptNumber: 1,
    claimEnrollmentStateRevision: 3n,
    claimPolicyRevision: 2,
    claimProviderAuthorityDigest: 'a'.repeat(64),
  };
}

function boundaryControl(
  killedBoundary:
    | 'AFTER_CLAIM'
    | 'AFTER_PROVIDER_MARK'
    | 'AFTER_PROVIDER_ACCEPTED',
): EmployeeInviteMailWorkerControl {
  return {
    modeAt: (context) =>
      context.boundary === killedBoundary ? 'KILLED' : 'ACTIVE',
  };
}

function emptyResult() {
  return {
    claimed: 0,
    sent: 0,
    retry: 0,
    dead: 0,
    canceled: 0,
    reconciliationRequired: 0,
  };
}
