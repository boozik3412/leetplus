import { ConfigService } from '@nestjs/config';
import { IdentityMailSecretEnvelopeService } from '../auth/identity-mail-secret-envelope.service';
import type {
  ClaimedIdentityMailDelivery,
  EnabledIdentityMailWorkerConfig,
  IdentityMailSecretOpener,
  IdentityMailSmtpProvider,
  IdentityMailWorkerLogger,
  IdentityMailWorkerRepository,
} from './identity-mail-worker.types';
import { IdentityMailWorkerService } from './identity-mail-worker.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_TENANT_ID = '77777777-7777-4777-8777-777777777777';
const INVITE_ID = '22222222-2222-4222-8222-222222222222';
const OUTBOX_ID = '33333333-3333-4333-8333-333333333333';
const WORKFLOW_LOCATOR = '44444444-4444-4444-8444-444444444444';
const MESSAGE_KEY = '55555555-5555-4555-8555-555555555555';
const PROVIDER_ATTEMPT_KEY = '66666666-6666-4666-8666-666666666666';
const RAW_TOKEN = 'T'.repeat(43);
const LOCAL_64 = 'l'.repeat(64);
const LOCAL_65 = 'l'.repeat(65);
const LABEL_64 = 'd'.repeat(64);
const DOMAIN_254 = [63, 63, 63, 62]
  .map((length) => 'd'.repeat(length))
  .join('.');
const DOMAIN_256 = [63, 63, 63, 61, 2]
  .map((length) => 'd'.repeat(length))
  .join('.');

function config(): EnabledIdentityMailWorkerConfig {
  return {
    enabled: true,
    realSendEnabled: true,
    liveCanaryEnabled: true,
    databaseUrl:
      'postgresql://leetplus_identity_mail_worker:password@db.example.test:5432/leetplus_beta?schema=public&sslmode=require&sslaccept=strict&connect_timeout=5&socket_timeout=30',
    databaseTlsRequired: true,
    databaseConnectTimeoutSeconds: 5,
    databaseSocketTimeoutSeconds: 30,
    expectedDatabase: 'leetplus_beta',
    expectedRole: 'leetplus_identity_mail_worker',
    expectedMigration: '20260804120000_guest_game_max_pending_rewards',
    expectedMigrationCount: 180,
    releaseSha: 'a'.repeat(40),
    canaryTenantIds: [TENANT_ID],
    publicWebOrigin: 'https://leetplus.ru',
    encryptionKey: Buffer.from(
      Array.from({ length: 32 }, (_, index) => index + 1),
    ).toString('base64url'),
    encryptionKeyVersion: 'v1',
    aadEnvironment: 'production',
    pollIntervalMs: 5000,
    leaseMs: 120_000,
    batchSize: 1,
    maxAttempts: 5,
    baseRetryMs: 60_000,
    maxRetryMs: 3_600_000,
    healthHost: '127.0.0.1',
    healthPort: 4301,
    smtp: {
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
    },
  };
}

function claim(): ClaimedIdentityMailDelivery {
  return {
    tenantId: TENANT_ID,
    inviteId: INVITE_ID,
    outboxId: OUTBOX_ID,
    workflowLocator: WORKFLOW_LOCATOR,
    aadEnvironment: 'production',
    template: 'INITIAL_OWNER_INVITE',
    messageKey: MESSAGE_KEY,
    requestDigest: 'b'.repeat(64),
    tokenHash: 'c'.repeat(64),
    digestVersion: 'sha256-v1',
    secretCiphertext: Buffer.from([1, 2, 3, 4]),
    envelopeVersion: 1,
    keyVersion: 'v1',
    expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    recipientEmail: 'owner@example.test',
    leaseVersion: 1n,
    transitionRevision: 1,
    attemptNumber: 1,
  };
}

function harness(workerConfig: EnabledIdentityMailWorkerConfig = config()) {
  const repository: jest.Mocked<IdentityMailWorkerRepository> = {
    assertReady: jest.fn().mockResolvedValue(undefined),
    claimOne: jest.fn(),
    reapExpired: jest.fn().mockResolvedValue(0),
    markProviderAttempt: jest.fn().mockResolvedValue('MARKED'),
    markSent: jest.fn().mockResolvedValue(undefined),
    markPreProviderFailure: jest.fn().mockResolvedValue('RETRY'),
    markReconciliationRequired: jest.fn().mockResolvedValue(undefined),
  };
  const secretOpener: jest.Mocked<IdentityMailSecretOpener> = {
    openInitialOwnerInviteToken: jest.fn().mockReturnValue(RAW_TOKEN),
  };
  const smtpProvider: jest.Mocked<IdentityMailSmtpProvider> = {
    verify: jest.fn().mockResolvedValue(undefined),
    send: jest.fn().mockResolvedValue({
      outcomeCode: 'SMTP_ACCEPTED',
      receiptDigest: 'd'.repeat(64),
    }),
    close: jest.fn(),
  };
  const logger: jest.Mocked<IdentityMailWorkerLogger> = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const service = new IdentityMailWorkerService(
    workerConfig,
    repository,
    secretOpener,
    smtpProvider,
    logger,
    {
      randomBytes: () => Buffer.from(Array.from({ length: 32 }, () => 7)),
      randomUuid: () => PROVIDER_ATTEMPT_KEY,
    },
  );
  return { service, repository, secretOpener, smtpProvider, logger };
}

describe('IdentityMailWorkerService', () => {
  it('checks the DB boundary and SMTP before readiness', async () => {
    const { service, repository, smtpProvider, logger } = harness();
    await service.assertReady();
    expect(repository.assertReady.mock.calls).toHaveLength(1);
    const readyInput = repository.assertReady.mock.calls[0]?.[0];
    expect(readyInput).toBeDefined();
    expect(readyInput?.expectedRole).toBe('leetplus_identity_mail_worker');
    expect(readyInput?.databaseTlsRequired).toBe(true);
    expect(readyInput?.canaryTenantIds).toEqual([TENANT_ID]);
    expect(readyInput?.expectedPolicy.minimumAcknowledgeSeconds).toBe(50);
    expect(readyInput?.providerAuthorityDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(smtpProvider.verify.mock.calls).toHaveLength(1);
    expect(logger.log.mock.calls[0]?.[0]).toEqual({
      event: 'IDENTITY_MAIL_WORKER_READY',
    });
  });

  it('marks provider intent before SMTP and reaches SENT through CAS', async () => {
    const { service, repository, smtpProvider } = harness();
    const delivery = claim();
    repository.claimOne.mockResolvedValueOnce(delivery);

    await expect(service.runOnce()).resolves.toEqual({
      claimed: 1,
      sent: 1,
      retry: 0,
      dead: 0,
      canceled: 0,
      reconciliationRequired: 0,
    });
    expect(repository.markProviderAttempt.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        tenantId: TENANT_ID,
        outboxId: OUTBOX_ID,
        leaseVersion: 1n,
        inviteId: INVITE_ID,
        expectedTransitionRevision: 1,
        providerAttemptKey: PROVIDER_ATTEMPT_KEY,
        messageId: `<initial-owner-${MESSAGE_KEY}@mail.leetplus.ru>`,
      }),
    );
    expect(repository.markSent.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        expectedTransitionRevision: 2,
        providerReceiptDigest: 'd'.repeat(64),
        providerOutcomeCode: 'SMTP_ACCEPTED',
      }),
    );
    for (const input of [
      repository.assertReady.mock.calls[0]?.[0],
      repository.reapExpired.mock.calls[0]?.[0],
      repository.claimOne.mock.calls[0]?.[0],
      repository.markProviderAttempt.mock.calls[0]?.[0],
    ]) {
      expect(input).toEqual(
        expect.objectContaining({
          providerAuthorityDigest: service.providerAuthorityDigest,
        }),
      );
      expect(input).not.toHaveProperty('runtimeConfigDigest');
      expect(input).not.toHaveProperty('workerConfigDigest');
    }
    expect(repository.markSent.mock.calls[0]?.[0]).not.toHaveProperty(
      'providerAuthorityDigest',
    );
    expect(repository.markSent.mock.calls[0]?.[0]).not.toHaveProperty(
      'runtimeConfigDigest',
    );
    expect(
      repository.markProviderAttempt.mock.invocationCallOrder[0],
    ).toBeLessThan(smtpProvider.send.mock.invocationCallOrder[0]);
    expect(smtpProvider.send.mock.invocationCallOrder[0]).toBeLessThan(
      repository.markSent.mock.invocationCallOrder[0],
    );
    expect([...delivery.secretCiphertext]).toEqual([0, 0, 0, 0]);
  });

  it('applies the batch independently to every canary tenant without starvation', async () => {
    const workerConfig = {
      ...config(),
      canaryTenantIds: [TENANT_ID, SECOND_TENANT_ID],
    };
    const { service, repository } = harness(workerConfig);
    repository.claimOne.mockResolvedValueOnce(claim()).mockResolvedValueOnce({
      ...claim(),
      tenantId: SECOND_TENANT_ID,
    });

    await expect(service.runOnce()).resolves.toMatchObject({
      claimed: 2,
      sent: 2,
    });

    expect(
      repository.reapExpired.mock.calls.map(([input]) => input.tenantId),
    ).toEqual([TENANT_ID, SECOND_TENANT_ID]);
    expect(
      repository.claimOne.mock.calls.map(([input]) => input.tenantId),
    ).toEqual([TENANT_ID, SECOND_TENANT_ID]);
  });

  it('checks repository readiness before any reaping or claim in every cycle', async () => {
    const { service, repository } = harness();
    repository.assertReady.mockRejectedValueOnce(
      new Error('sealed readiness changed'),
    );

    await expect(service.runOnce()).rejects.toThrow('sealed readiness changed');
    expect(repository.reapExpired.mock.calls).toHaveLength(0);
    expect(repository.claimOne.mock.calls).toHaveLength(0);
  });

  it('checks SMTP/TLS readiness before every cycle side effect', async () => {
    const { service, repository, smtpProvider } = harness();
    smtpProvider.verify.mockRejectedValueOnce(
      new Error('SMTP authentication degraded'),
    );

    await expect(service.runOnce()).rejects.toThrow(
      'SMTP authentication degraded',
    );
    expect(repository.assertReady.mock.calls).toHaveLength(1);
    expect(repository.reapExpired.mock.calls).toHaveLength(0);
    expect(repository.claimOne.mock.calls).toHaveLength(0);
  });

  it('does not start readiness or work when stop is already requested', async () => {
    const { service, repository, smtpProvider } = harness();

    await expect(service.runOnce(() => true)).resolves.toEqual({
      claimed: 0,
      sent: 0,
      retry: 0,
      dead: 0,
      canceled: 0,
      reconciliationRequired: 0,
    });
    expect(repository.assertReady.mock.calls).toHaveLength(0);
    expect(smtpProvider.verify.mock.calls).toHaveLength(0);
    expect(repository.reapExpired.mock.calls).toHaveLength(0);
    expect(repository.claimOne.mock.calls).toHaveLength(0);
  });

  it('checks the stop predicate before every tenant reap', async () => {
    const workerConfig = {
      ...config(),
      canaryTenantIds: [TENANT_ID, SECOND_TENANT_ID],
    };
    const { service, repository } = harness(workerConfig);
    let stopRequested = false;
    repository.reapExpired.mockImplementationOnce(() => {
      stopRequested = true;
      return Promise.resolve(0);
    });

    await expect(service.runOnce(() => stopRequested)).resolves.toMatchObject({
      claimed: 0,
      sent: 0,
    });
    expect(repository.reapExpired.mock.calls).toHaveLength(1);
    expect(repository.reapExpired.mock.calls[0]?.[0].tenantId).toBe(TENANT_ID);
    expect(repository.claimOne.mock.calls).toHaveLength(0);
  });

  it('finishes a leased in-flight claim after stop, then starts no new batch or tenant claim', async () => {
    const workerConfig = {
      ...config(),
      batchSize: 2,
      canaryTenantIds: [TENANT_ID, SECOND_TENANT_ID],
    };
    const { service, repository, smtpProvider } = harness(workerConfig);
    let stopRequested = false;
    repository.claimOne
      .mockImplementationOnce(() => {
        stopRequested = true;
        return Promise.resolve(claim());
      })
      .mockResolvedValueOnce(claim())
      .mockResolvedValueOnce({
        ...claim(),
        tenantId: SECOND_TENANT_ID,
      });

    await expect(service.runOnce(() => stopRequested)).resolves.toMatchObject({
      claimed: 1,
      sent: 1,
      reconciliationRequired: 0,
    });
    expect(repository.reapExpired.mock.calls).toHaveLength(2);
    expect(repository.claimOne.mock.calls).toHaveLength(1);
    expect(repository.markProviderAttempt.mock.calls).toHaveLength(1);
    expect(smtpProvider.send.mock.calls).toHaveLength(1);
    expect(repository.markSent.mock.calls).toHaveLength(1);
  });

  it('separates provider authority from tenant and runtime policy without disclosure', async () => {
    const first = harness(config());
    const secondConfig = {
      ...config(),
      encryptionKey: Buffer.alloc(32, 99).toString('base64url'),
    };
    const second = harness(secondConfig);
    const secondTenant = harness({
      ...config(),
      canaryTenantIds: [TENANT_ID, SECOND_TENANT_ID],
    });
    const secondTenantReordered = harness({
      ...config(),
      canaryTenantIds: [SECOND_TENANT_ID, TENANT_ID],
    });
    const largerBatch = harness({ ...config(), batchSize: 2 });
    const fasterPoll = harness({ ...config(), pollIntervalMs: 4000 });
    const changedPolicy = harness({
      ...config(),
      leaseMs: 180_000,
      maxAttempts: 6,
      baseRetryMs: 90_000,
      maxRetryMs: 4_000_000,
    });
    const loopbackTransport = harness({
      ...config(),
      databaseUrl:
        'postgresql://leetplus_identity_mail_worker:password@127.0.0.1:5432/leetplus_beta?schema=public&connect_timeout=5&socket_timeout=30',
      databaseTlsRequired: false,
    });
    const longerSocketTimeout = harness({
      ...config(),
      databaseSocketTimeoutSeconds: 31,
    });
    const shorterConnectTimeout = harness({
      ...config(),
      databaseConnectTimeoutSeconds: 4,
    });
    const rotatedSmtpPassword = 'rotated-smtp-password';
    const changedPassword = harness({
      ...config(),
      smtp: {
        ...config().smtp,
        password: rotatedSmtpPassword,
      },
    });
    const changedSmtpEndpoint = harness({
      ...config(),
      smtp: {
        ...config().smtp,
        host: 'smtp-b.example.test',
        servername: 'smtp-b.example.test',
      },
    });
    const changedSmtpTls = harness({
      ...config(),
      smtp: {
        ...config().smtp,
        port: 465,
        tlsMode: 'IMPLICIT_TLS',
      },
    });
    const changedSmtpTimeout = harness({
      ...config(),
      smtp: {
        ...config().smtp,
        socketTimeoutMs: 31_000,
      },
    });
    const changedRelease = harness({
      ...config(),
      releaseSha: 'b'.repeat(40),
    });
    const changedDatabase = harness({
      ...config(),
      expectedDatabase: 'leetplus_beta_b',
    });
    const changedRole = harness({
      ...config(),
      expectedRole: 'leetplus_identity_mail_worker_b',
    });

    expect(first.service.providerAuthorityDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(first.service.runtimeConfigDigest).toMatch(/^[0-9a-f]{64}$/u);
    for (const authorityChange of [
      second,
      loopbackTransport,
      longerSocketTimeout,
      shorterConnectTimeout,
      changedPassword,
      changedSmtpEndpoint,
      changedSmtpTls,
      changedSmtpTimeout,
      changedRelease,
      changedDatabase,
      changedRole,
    ]) {
      expect(authorityChange.service.providerAuthorityDigest).not.toBe(
        first.service.providerAuthorityDigest,
      );
      expect(authorityChange.service.runtimeConfigDigest).not.toBe(
        first.service.runtimeConfigDigest,
      );
    }

    for (const runtimeOnly of [
      secondTenant,
      largerBatch,
      fasterPoll,
      changedPolicy,
    ]) {
      expect(runtimeOnly.service.providerAuthorityDigest).toBe(
        first.service.providerAuthorityDigest,
      );
      expect(runtimeOnly.service.runtimeConfigDigest).not.toBe(
        first.service.runtimeConfigDigest,
      );
    }
    expect(secondTenantReordered.service.providerAuthorityDigest).toBe(
      secondTenant.service.providerAuthorityDigest,
    );
    expect(secondTenantReordered.service.runtimeConfigDigest).toBe(
      secondTenant.service.runtimeConfigDigest,
    );

    await first.service.assertReady();
    await second.service.assertReady();
    await changedPassword.service.assertReady();
    expect(
      first.repository.assertReady.mock.calls[0]?.[0].providerAuthorityDigest,
    ).toBe(first.service.providerAuthorityDigest);
    expect(
      second.repository.assertReady.mock.calls[0]?.[0].providerAuthorityDigest,
    ).toBe(second.service.providerAuthorityDigest);
    const serialized = JSON.stringify({
      providerAuthorityDigest: changedPassword.service.providerAuthorityDigest,
      runtimeConfigDigest: changedPassword.service.runtimeConfigDigest,
      log: changedPassword.logger.log.mock.calls,
      warn: changedPassword.logger.warn.mock.calls,
      error: changedPassword.logger.error.mock.calls,
    });
    expect(serialized).not.toContain(config().smtp.password);
    expect(serialized).not.toContain(rotatedSmtpPassword);
    expect(serialized).not.toContain(config().encryptionKey);
    expect(serialized).not.toContain(config().databaseUrl);
    expect(serialized).not.toContain('password@db.example.test');
    expect(serialized).not.toContain('owner@example.test');
    expect(serialized).not.toContain(RAW_TOKEN);
  });

  it('owns one canonical immutable config snapshot after construction', async () => {
    const mutableConfig = {
      ...config(),
      canaryTenantIds: [SECOND_TENANT_ID, TENANT_ID],
      smtp: { ...config().smtp },
    };
    const canonical = harness({
      ...config(),
      canaryTenantIds: [TENANT_ID, SECOND_TENANT_ID],
    });
    const { service, repository } = harness(mutableConfig);
    const providerAuthorityDigest = service.providerAuthorityDigest;
    const runtimeConfigDigest = service.runtimeConfigDigest;

    mutableConfig.canaryTenantIds.splice(
      0,
      mutableConfig.canaryTenantIds.length,
      '99999999-9999-4999-8999-999999999999',
    );
    mutableConfig.batchSize = 4;
    mutableConfig.publicWebOrigin = 'https://mutated.example.test';
    mutableConfig.smtp.from = 'mutated@example.test';
    mutableConfig.smtp.messageIdDomain = 'mutated.example.test';

    await expect(service.runOnce()).resolves.toMatchObject({
      claimed: 0,
      sent: 0,
    });

    expect(service.providerAuthorityDigest).toBe(providerAuthorityDigest);
    expect(service.runtimeConfigDigest).toBe(runtimeConfigDigest);
    expect(providerAuthorityDigest).toBe(
      canonical.service.providerAuthorityDigest,
    );
    expect(runtimeConfigDigest).toBe(canonical.service.runtimeConfigDigest);
    expect(repository.assertReady.mock.calls[0]?.[0].canaryTenantIds).toEqual([
      TENANT_ID,
      SECOND_TENANT_ID,
    ]);
    expect(
      repository.reapExpired.mock.calls.map(([input]) => ({
        tenantId: input.tenantId,
        batchLimit: input.batchLimit,
      })),
    ).toEqual([
      { tenantId: TENANT_ID, batchLimit: 1 },
      { tenantId: SECOND_TENANT_ID, batchLimit: 1 },
    ]);
    expect(
      repository.claimOne.mock.calls.map(([input]) => input.tenantId),
    ).toEqual([TENANT_ID, SECOND_TENANT_ID]);
  });

  it('uses safe retry only when failure is proven before provider marker', async () => {
    const { service, repository, secretOpener, smtpProvider } = harness();
    repository.claimOne.mockResolvedValueOnce(claim());
    secretOpener.openInitialOwnerInviteToken.mockImplementation(() => {
      throw new Error(
        `raw secret must not escape ${RAW_TOKEN} owner@example.test`,
      );
    });

    await expect(service.runOnce()).resolves.toMatchObject({
      retry: 1,
      reconciliationRequired: 0,
    });
    expect(repository.markPreProviderFailure.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        reasonCode: 'IDENTITY_MAIL_DELIVERY_FAILED',
      }),
    );
    expect(repository.markProviderAttempt.mock.calls).toHaveLength(0);
    expect(smtpProvider.send.mock.calls).toHaveLength(0);
    expect(repository.markReconciliationRequired.mock.calls).toHaveLength(0);
  });

  it('rejects recipient substitution at authenticated decryption before provider intent', async () => {
    const workerConfig = config();
    const envelopeService = new IdentityMailSecretEnvelopeService(
      new ConfigService({
        IDENTITY_MAIL_ENCRYPTION_KEY: workerConfig.encryptionKey,
        IDENTITY_MAIL_ENCRYPTION_KEY_VERSION: workerConfig.encryptionKeyVersion,
        IDENTITY_MAIL_AAD_ENVIRONMENT: workerConfig.aadEnvironment,
      }),
    );
    const originalClaim = claim();
    const sealed = envelopeService.sealInitialOwnerInviteToken({
      tenantId: originalClaim.tenantId,
      workflowLocator: originalClaim.workflowLocator,
      inviteId: originalClaim.inviteId,
      outboxId: originalClaim.outboxId,
      template: originalClaim.template,
      messageKey: originalClaim.messageKey,
      requestDigest: originalClaim.requestDigest,
      recipientEmail: originalClaim.recipientEmail,
      expiresAt: originalClaim.expiresAt,
    });
    const substitutedClaim: ClaimedIdentityMailDelivery = {
      ...originalClaim,
      ...sealed,
      recipientEmail: 'attacker@example.test',
      secretCiphertext: Buffer.from(sealed.secretCiphertext),
    };
    const { service, repository, secretOpener, smtpProvider } =
      harness(workerConfig);
    secretOpener.openInitialOwnerInviteToken.mockImplementation((input) =>
      envelopeService.openInitialOwnerInviteToken(input),
    );
    repository.claimOne.mockResolvedValueOnce(substitutedClaim);

    await expect(service.runOnce()).resolves.toMatchObject({
      claimed: 1,
      retry: 1,
      sent: 0,
      reconciliationRequired: 0,
    });
    expect(repository.markPreProviderFailure.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        reasonCode: 'IDENTITY_MAIL_DELIVERY_FAILED',
      }),
    );
    expect(repository.markProviderAttempt.mock.calls).toHaveLength(0);
    expect(smtpProvider.send.mock.calls).toHaveLength(0);
    expect([...substitutedClaim.secretCiphertext]).toEqual(
      new Array(sealed.secretCiphertext.length).fill(0),
    );
  });

  it('counts a pre-provider lifecycle cancellation without reporting DEAD', async () => {
    const { service, repository, secretOpener, smtpProvider, logger } =
      harness();
    repository.claimOne.mockResolvedValueOnce(claim());
    repository.markPreProviderFailure.mockResolvedValueOnce('CANCELED');
    secretOpener.openInitialOwnerInviteToken.mockImplementation(() => {
      throw new Error('invite was revoked concurrently');
    });

    await expect(service.runOnce()).resolves.toMatchObject({
      claimed: 1,
      canceled: 1,
      dead: 0,
      reconciliationRequired: 0,
    });
    expect(repository.markProviderAttempt.mock.calls).toHaveLength(0);
    expect(smtpProvider.send.mock.calls).toHaveLength(0);
    expect(logger.warn.mock.calls).toContainEqual([
      expect.objectContaining({
        event: 'IDENTITY_MAIL_DELIVERY_CANCELED',
      }),
    ]);
    expect(
      logger.error.mock.calls.some(
        ([event]) => event.event === 'IDENTITY_MAIL_DELIVERY_DEAD',
      ),
    ).toBe(false);
  });

  it.each([
    ['address list', 'owner@example.test,attacker@example.test'],
    ['display name', 'Owner <owner@example.test>'],
    ['quoted local part', '"owner"@example.test'],
    [
      'CRLF header injection',
      'owner@example.test\r\nBcc:attacker@example.test',
    ],
    ['tab', 'owner\t@example.test'],
    ['non-breaking space', 'owner\u00a0@example.test'],
    ['Unicode', 'владелец@example.test'],
    ['uppercase', 'Owner@example.test'],
    ['leading ASCII space', ' owner@example.test'],
    ['trailing ASCII space', 'owner@example.test '],
    ['leading local dot', '.owner@example.test'],
    ['trailing local dot', 'owner.@example.test'],
    ['consecutive local dots', 'owner..beta@example.test'],
    ['leading domain hyphen', 'owner@-example.test'],
    ['trailing domain hyphen', 'owner@example-.test'],
    ['empty domain label', 'owner@example..test'],
    ['65-byte local part', `${LOCAL_65}@example.test`],
    ['64-byte domain label', `owner@${LABEL_64}.test`],
    ['254-byte domain', `owner@${DOMAIN_254}`],
    ['321-byte mailbox', `${LOCAL_64}@${DOMAIN_256}`],
  ])(
    'terminally handles poison recipient %s before the provider marker',
    async (_label, recipientEmail) => {
      const { service, repository, smtpProvider } = harness();
      const delivery = { ...claim(), recipientEmail };
      repository.claimOne.mockResolvedValueOnce(delivery);
      repository.markPreProviderFailure.mockResolvedValueOnce('DEAD');

      await expect(service.runOnce()).resolves.toMatchObject({
        claimed: 1,
        dead: 1,
        reconciliationRequired: 0,
      });
      expect(repository.markPreProviderFailure.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          reasonCode: 'IDENTITY_MAIL_CLAIM_INVALID',
        }),
      );
      expect(repository.markProviderAttempt.mock.calls).toHaveLength(0);
      expect(smtpProvider.send.mock.calls).toHaveLength(0);
      expect([...delivery.secretCiphertext]).toEqual([0, 0, 0, 0]);
    },
  );

  it('does not call SMTP when the provider marker returns NOT_DELIVERABLE cancellation', async () => {
    const { service, repository, smtpProvider, logger } = harness();
    repository.claimOne.mockResolvedValueOnce(claim());
    repository.markProviderAttempt.mockResolvedValueOnce('CANCELED');

    await expect(service.runOnce()).resolves.toMatchObject({
      claimed: 1,
      canceled: 1,
      sent: 0,
      reconciliationRequired: 0,
    });
    expect(smtpProvider.send.mock.calls).toHaveLength(0);
    expect(repository.markSent.mock.calls).toHaveLength(0);
    expect(repository.markPreProviderFailure.mock.calls).toHaveLength(0);
    expect(repository.markReconciliationRequired.mock.calls).toHaveLength(0);
    expect(logger.warn.mock.calls[0]?.[0]).toEqual({
      event: 'IDENTITY_MAIL_DELIVERY_CANCELED',
    });
  });

  it('does not call SMTP or fallback mutation for a durable HANDOFF', async () => {
    const { service, repository, smtpProvider, logger } = harness();
    repository.claimOne.mockResolvedValueOnce(claim());
    repository.markProviderAttempt.mockResolvedValueOnce('HANDOFF');

    await expect(service.runOnce()).resolves.toMatchObject({
      claimed: 1,
      sent: 0,
      retry: 0,
      reconciliationRequired: 1,
    });
    expect(smtpProvider.send.mock.calls).toHaveLength(0);
    expect(repository.markSent.mock.calls).toHaveLength(0);
    expect(repository.markPreProviderFailure.mock.calls).toHaveLength(0);
    expect(repository.markReconciliationRequired.mock.calls).toHaveLength(0);
    expect(logger.warn.mock.calls).toEqual([
      [{ event: 'IDENTITY_MAIL_DELIVERY_HANDOFF' }],
    ]);
  });

  it('quarantines an ambiguous provider-marker response without SMTP retry', async () => {
    const { service, repository, smtpProvider } = harness();
    repository.claimOne.mockResolvedValueOnce(claim());
    repository.markProviderAttempt.mockRejectedValueOnce(
      new Error('connection lost after commit'),
    );

    await expect(service.runOnce()).resolves.toMatchObject({
      retry: 0,
      reconciliationRequired: 1,
    });
    expect(repository.markReconciliationRequired.mock.calls).toHaveLength(1);
    expect(repository.markReconciliationRequired.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ expectedTransitionRevision: 2 }),
    );
    expect(repository.markPreProviderFailure.mock.calls).toHaveLength(0);
    expect(smtpProvider.send.mock.calls).toHaveLength(0);
  });

  it.each([
    ['SMTP result', 'smtp'],
    ['SENT acknowledgement', 'sent'],
  ])(
    'quarantines an ambiguous %s without blind retry',
    async (_case, failure) => {
      const { service, repository, smtpProvider } = harness();
      repository.claimOne.mockResolvedValueOnce(claim());
      if (failure === 'smtp') {
        smtpProvider.send.mockRejectedValueOnce(
          new Error('provider response contained recipient'),
        );
      } else {
        repository.markSent.mockRejectedValueOnce(
          new Error('ack response lost'),
        );
      }

      await expect(service.runOnce()).resolves.toMatchObject({
        retry: 0,
        reconciliationRequired: 1,
      });
      expect(repository.markReconciliationRequired.mock.calls).toHaveLength(1);
      expect(repository.markPreProviderFailure.mock.calls).toHaveLength(0);
    },
  );

  it('stops the whole multi-row, multi-tenant cycle after the first ambiguous provider outcome', async () => {
    const workerConfig = {
      ...config(),
      batchSize: 2,
      canaryTenantIds: [TENANT_ID, SECOND_TENANT_ID],
    };
    const { service, repository, smtpProvider } = harness(workerConfig);
    repository.claimOne
      .mockResolvedValueOnce(claim())
      .mockResolvedValueOnce(claim())
      .mockResolvedValueOnce({
        ...claim(),
        tenantId: SECOND_TENANT_ID,
      });
    smtpProvider.send.mockRejectedValueOnce(
      new Error('SMTP provider degraded after readiness'),
    );

    await expect(service.runOnce()).resolves.toMatchObject({
      claimed: 1,
      sent: 0,
      retry: 0,
      reconciliationRequired: 1,
    });
    expect(repository.claimOne.mock.calls).toHaveLength(1);
    expect(smtpProvider.send.mock.calls).toHaveLength(1);
    expect(repository.markReconciliationRequired.mock.calls).toHaveLength(1);
    expect(repository.markProviderAttempt.mock.calls).toHaveLength(1);
    expect(repository.markSent.mock.calls).toHaveLength(0);
  });

  it('does not expose recipient or token through result or logger events', async () => {
    const { service, repository, logger } = harness();
    repository.claimOne.mockResolvedValueOnce(claim());
    const result = await service.runOnce();
    const serialized = JSON.stringify({
      result,
      log: logger.log.mock.calls,
      warn: logger.warn.mock.calls,
      error: logger.error.mock.calls,
    });
    expect(serialized).not.toContain('owner@example.test');
    expect(serialized).not.toContain(RAW_TOKEN);
    expect(serialized).not.toContain(config().smtp.password);
  });
});
