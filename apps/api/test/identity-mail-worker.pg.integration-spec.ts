import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';
import {
  createHash,
  createPrivateKey,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  createServer as createNetServer,
  type Server,
  type Socket,
} from 'node:net';
import { join } from 'node:path';
import { createServer as createTlsServer } from 'node:tls';
import { IdentityMailSecretEnvelopeService } from '../src/auth/identity-mail-secret-envelope.service';
import {
  StrictIdentityMailSmtpProvider,
  type IdentityMailSmtpTransportFactory,
} from '../src/identity-mail-worker/identity-mail-smtp-provider';
import { PrismaIdentityMailWorkerRepository } from '../src/identity-mail-worker/identity-mail-worker.repository';
import { IdentityMailWorkerService } from '../src/identity-mail-worker/identity-mail-worker.service';
import type {
  EnabledIdentityMailWorkerConfig,
  IdentityMailWorkerRepository,
  IdentityMailWorkerSmtpConfig,
} from '../src/identity-mail-worker/identity-mail-worker.types';
import { deployCanonicalPrismaMigrations } from './canonical-prisma-migration-deploy';

const REQUIRED_CONFIRMATION = 'run-identity-mail-worker-postgres-smtp-e2e';
const integrationEnabled =
  process.env.IDENTITY_MAIL_WORKER_PG_E2E_CONFIRM === REQUIRED_CONFIRMATION;
const describePostgres = integrationEnabled ? describe : describe.skip;
const CURRENT_MIGRATION = '20260731120000_identity_mail_delivery_release_head';
const CURRENT_MIGRATION_COUNT = 179;
const RELEASE_SHA = 'a'.repeat(40);
const AAD_ENVIRONMENT = 'pg-worker-e2e';
const TRIAL_DURATION_SECONDS = 7 * 24 * 60 * 60;
const SMTP_SERVERNAME = 'smtp.test.local';
const DISPOSABLE_DATABASE_PATTERN = /^lp_iw_e2e_[0-9a-f]{32}$/u;
const DISPOSABLE_ROLE_PATTERN = /^lp_iw_pg_[0-9a-f]{24}$/u;
const TEST_FIXTURE_DIRECTORY = join(
  __dirname,
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
const WORKER_RPC_SIGNATURES = [
  'public."identity_mail_delivery_worker_assert_v1"(TEXT)',
  'public."identity_initial_owner_mail_claim_v1"(TEXT, TEXT, TEXT, TEXT)',
  'public."identity_initial_owner_mail_provider_mark_v1"(TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT)',
  'public."identity_initial_owner_mail_complete_v1"(TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT)',
  'public."identity_initial_owner_mail_reap_v1"(TEXT, TEXT, TEXT, INTEGER)',
] as const;

type ScenarioFixture = {
  tenantId: string;
  email: string;
  inviteId: string;
  outboxId: string;
  ciphertext: Buffer;
};

type FixtureReleaseSupport = {
  buildProvenanceId: string;
  markerId: string;
  markerPayloadDigest: string;
  markerGeneration: bigint;
  actualContextDigest: string;
  artifactDigest: string;
  policyManifestDigest: string;
  databaseIdentityDigest: string;
};

type ScenarioWorker = {
  config: EnabledIdentityMailWorkerConfig;
  service: IdentityMailWorkerService;
};

type FakeSmtpMode = 'IMPLICIT_TLS' | 'PLAINTEXT';

class LoopbackFakeSmtpServer {
  readonly commands: string[] = [];
  readonly messages: string[] = [];
  readonly recipients: string[] = [];
  private readonly sockets = new Set<Socket>();
  private server: Server | null = null;

  constructor(private readonly mode: FakeSmtpMode = 'IMPLICIT_TLS') {}

  async start(): Promise<number> {
    if (this.server) {
      throw new Error('Fake SMTP server already started');
    }
    const server =
      this.mode === 'IMPLICIT_TLS'
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
    if (this.mode === 'IMPLICIT_TLS') {
      server.on('tlsClientError', () => undefined);
    }
    this.server = server;
    await new Promise<void>((resolvePromise, rejectPromise) => {
      const onError = (error: Error) => {
        server.off('listening', onListening);
        rejectPromise(error);
      };
      const onListening = () => {
        server.off('error', onError);
        resolvePromise();
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
    await new Promise<void>((resolvePromise, rejectPromise) => {
      server.close((error) =>
        error ? rejectPromise(error) : resolvePromise(),
      );
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
    socket.write(`220 ${SMTP_SERVERNAME} ESMTP test\r\n`);
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
          socket.write('250 2.0.0 queued\r\n');
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
          if (this.mode === 'IMPLICIT_TLS') {
            socket.write(
              `250-${SMTP_SERVERNAME}\r\n` +
                '250-AUTH PLAIN LOGIN\r\n' +
                '250 SIZE 1048576\r\n',
            );
          } else {
            socket.write(`250 ${SMTP_SERVERNAME}\r\n`);
          }
        } else if (command === 'AUTH LOGIN') {
          authStep = 'USERNAME';
          socket.write('334 VXNlcm5hbWU6\r\n');
        } else if (command.startsWith('AUTH PLAIN ')) {
          socket.write('235 2.7.0 authenticated\r\n');
        } else if (command.startsWith('MAIL FROM:')) {
          socket.write('250 2.1.0 sender accepted\r\n');
        } else if (command.startsWith('RCPT TO:')) {
          this.recipients.push(
            line.slice('RCPT TO:'.length).trim().replace(/^<|>$/gu, ''),
          );
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

jest.setTimeout(240_000);

describePostgres(
  'identity-mail worker PostgreSQL + trusted TLS SMTP acceptance seam',
  () => {
    let maintenance: PrismaClient;
    let admin: PrismaClient;
    let workerPrisma: PrismaClient;
    let repository: PrismaIdentityMailWorkerRepository;
    let envelopeService: IdentityMailSecretEnvelopeService;
    let smtpProvider: StrictIdentityMailSmtpProvider;
    let smtpServer: LoopbackFakeSmtpServer;
    let smtp: IdentityMailWorkerSmtpConfig;
    let workerDatabaseUrl = '';
    let workerRoleOid = 0n;
    let releaseSupport: FixtureReleaseSupport;
    let disposableDatabase = '';
    let disposableDatabaseUrl = '';
    let workerRoleName = '';
    let workerPassword = '';
    let encryptionKey = '';

    beforeAll(async () => {
      const databaseUrl = assertSafeIntegrationDatabase();
      disposableDatabase = `lp_iw_e2e_${randomUUID().replaceAll('-', '')}`;
      workerRoleName = `lp_iw_pg_${randomBytes(12).toString('hex')}`;
      workerPassword = randomBytes(24).toString('base64url');
      assertDisposableDatabaseName(disposableDatabase);
      assertDisposableRoleName(workerRoleName);

      const maintenanceUrl = databaseUrlFor(databaseUrl, 'postgres');
      disposableDatabaseUrl = databaseUrlFor(databaseUrl, disposableDatabase);
      maintenance = prismaFor(maintenanceUrl);
      await maintenance.$connect();
      const [server] = await maintenance.$queryRaw<
        Array<{ postgres_major: number; can_create_database: boolean }>
      >(Prisma.sql`
        SELECT
          current_setting('server_version_num')::int / 10000
            AS postgres_major,
          role.rolcreatedb OR role.rolsuper AS can_create_database
        FROM pg_catalog.pg_roles AS role
        WHERE role.rolname = current_user
      `);
      expect(server).toEqual({
        postgres_major: 16,
        can_create_database: true,
      });

      await maintenance.$executeRawUnsafe(
        `CREATE ROLE "${workerRoleName}" LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${workerPassword}'`,
      );
      await maintenance.$executeRawUnsafe(
        `CREATE DATABASE "${disposableDatabase}" TEMPLATE template0`,
      );
      deployMigrations(disposableDatabaseUrl);

      admin = prismaFor(disposableDatabaseUrl);
      await admin.$connect();
      const [migrationState] = await admin.$queryRaw<
        Array<{ migration_count: number; latest_migration: string }>
      >(Prisma.sql`
        SELECT
          count(*)::int AS migration_count,
          max(migration_name) AS latest_migration
        FROM public._prisma_migrations
        WHERE finished_at IS NOT NULL
          AND rolled_back_at IS NULL
      `);
      expect(migrationState).toEqual({
        migration_count: CURRENT_MIGRATION_COUNT,
        latest_migration: CURRENT_MIGRATION,
      });

      await installLeastPrivilegeWorkerRole(
        admin,
        disposableDatabase,
        workerRoleName,
      );

      const [workerRole] = await admin.$queryRaw<
        Array<{ role_oid: bigint }>
      >(Prisma.sql`
        SELECT role.oid::BIGINT AS role_oid
        FROM pg_catalog.pg_roles AS role
        WHERE role.rolname = ${workerRoleName}
      `);
      if (!workerRole) {
        throw new Error('Disposable identity-mail worker role was not found');
      }
      workerRoleOid = workerRole.role_oid;
      releaseSupport = await createFixtureReleaseSupport(
        admin,
        workerRoleName,
        workerRoleOid,
      );

      smtpServer = new LoopbackFakeSmtpServer();
      const smtpPort = await smtpServer.start();
      encryptionKey = randomBytes(32).toString('base64url');
      smtp = smtpConfig(smtpPort);
      workerDatabaseUrl = databaseUrlForRole(
        databaseUrl,
        disposableDatabase,
        workerRoleName,
        workerPassword,
      );
      envelopeService = createEnvelopeService(encryptionKey);
      workerPrisma = prismaFor(workerDatabaseUrl);
      repository = new PrismaIdentityMailWorkerRepository(workerPrisma);
      smtpProvider = new StrictIdentityMailSmtpProvider(
        smtp,
        trustedTestTransportFactory,
      );
      await workerPrisma.$connect();
    });

    afterAll(async () => {
      const cleanupErrors: unknown[] = [];
      try {
        smtpProvider?.close();
      } catch (error) {
        cleanupErrors.push(error);
      }
      try {
        await smtpServer?.stop();
      } catch (error) {
        cleanupErrors.push(error);
      }
      for (const disconnect of await Promise.allSettled([
        workerPrisma?.$disconnect(),
        admin?.$disconnect(),
      ])) {
        if (disconnect.status === 'rejected') {
          cleanupErrors.push(disconnect.reason);
        }
      }

      try {
        if (maintenance && disposableDatabase) {
          assertDisposableDatabaseName(disposableDatabase);
          await maintenance.$executeRawUnsafe(
            `DROP DATABASE IF EXISTS "${disposableDatabase}" WITH (FORCE)`,
          );
        }
        if (maintenance && workerRoleName) {
          assertDisposableRoleName(workerRoleName);
          await maintenance.$executeRawUnsafe(
            `DROP ROLE IF EXISTS "${workerRoleName}"`,
          );
        }
        if (maintenance) {
          const [residue] = await maintenance.$queryRaw<
            Array<{ database_count: number; role_count: number }>
          >(Prisma.sql`
            SELECT
              (
                SELECT count(*)::int
                FROM pg_catalog.pg_database
                WHERE datname = ${disposableDatabase}
              ) AS database_count,
              (
                SELECT count(*)::int
                FROM pg_catalog.pg_roles
                WHERE rolname = ${workerRoleName}
              ) AS role_count
          `);
          if (residue?.database_count !== 0 || residue?.role_count !== 0) {
            throw new Error(
              'Identity-mail worker E2E cleanup left database or role residue',
            );
          }
        }
      } catch (error) {
        cleanupErrors.push(error);
      } finally {
        try {
          await maintenance?.$disconnect();
        } catch (error) {
          cleanupErrors.push(error);
        }
        encryptionKey = '';
        workerPassword = '';
        workerDatabaseUrl = '';
        workerRoleOid = 0n;
        workerRoleName = '';
        disposableDatabaseUrl = '';
        disposableDatabase = '';
      }

      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          cleanupErrors,
          'Identity-mail worker PostgreSQL E2E cleanup failed',
        );
      }
    });

    it('persists SENT, retries before provider, and quarantines an ambiguous post-marker send', async () => {
      await expect(
        workerPrisma.$queryRawUnsafe(
          'SELECT * FROM public."IdentityMailOutbox" LIMIT 1',
        ),
      ).rejects.toThrow();

      const sentFixture = await createPendingFixture(
        admin,
        envelopeService,
        'sent',
        releaseSupport,
      );
      const sentWorker = await createScenarioWorker({
        admin,
        repository,
        envelopeService,
        smtpProvider,
        smtp,
        workerDatabaseUrl,
        expectedDatabase: disposableDatabase,
        workerRoleName,
        workerRoleOid,
        encryptionKey,
        tenantId: sentFixture.tenantId,
      });
      assertWorkerReleaseContract(sentWorker, sentFixture.tenantId);
      await expect(sentWorker.service.assertReady()).resolves.toBeUndefined();
      await expect(sentWorker.service.runOnce()).resolves.toEqual({
        claimed: 1,
        sent: 1,
        retry: 0,
        dead: 0,
        canceled: 0,
        reconciliationRequired: 0,
      });
      expect(smtpServer.recipients).toEqual([sentFixture.email]);
      expect(smtpServer.messages).toHaveLength(1);
      await assertPersistedScenario(admin, sentFixture, {
        status: 'SENT',
        transitionRevision: 4n,
        eventTypes: [
          'RELEASED',
          'CLAIMED',
          'PROVIDER_MARKED',
          'PROVIDER_ACCEPTED',
        ],
        ciphertextPresent: false,
      });

      const retryFixture = await createPendingFixture(
        admin,
        envelopeService,
        'retry',
        releaseSupport,
        (ciphertext) => {
          const corrupted = Buffer.from(ciphertext);
          corrupted[corrupted.length - 1] =
            (corrupted[corrupted.length - 1] ?? 0) ^ 0x01;
          return corrupted;
        },
      );
      const retryWorker = await createScenarioWorker({
        admin,
        repository,
        envelopeService,
        smtpProvider,
        smtp,
        workerDatabaseUrl,
        expectedDatabase: disposableDatabase,
        workerRoleName,
        workerRoleOid,
        encryptionKey,
        tenantId: retryFixture.tenantId,
      });
      await expect(retryWorker.service.runOnce()).resolves.toEqual({
        claimed: 1,
        sent: 0,
        retry: 1,
        dead: 0,
        canceled: 0,
        reconciliationRequired: 0,
      });
      expect(smtpServer.recipients).toEqual([sentFixture.email]);
      expect(smtpServer.messages).toHaveLength(1);
      await assertPersistedScenario(admin, retryFixture, {
        status: 'RETRY',
        transitionRevision: 3n,
        eventTypes: ['RELEASED', 'CLAIMED', 'PRE_PROVIDER_RETRY'],
        ciphertextPresent: true,
      });

      const ambiguousFixture = await createPendingFixture(
        admin,
        envelopeService,
        'ambiguous',
        releaseSupport,
      );
      const ambiguousWorkerBase = await createScenarioWorker({
        admin,
        repository,
        envelopeService,
        smtpProvider,
        smtp,
        workerDatabaseUrl,
        expectedDatabase: disposableDatabase,
        workerRoleName,
        workerRoleOid,
        encryptionKey,
        tenantId: ambiguousFixture.tenantId,
      });
      const postProviderAckLossRepository =
        repositoryWithPostProviderAckLoss(repository);
      const ambiguousWorker = new IdentityMailWorkerService(
        ambiguousWorkerBase.config,
        postProviderAckLossRepository,
        envelopeService,
        smtpProvider,
      );
      expect(ambiguousWorker.workerConfigDigest).toBe(
        ambiguousWorkerBase.service.workerConfigDigest,
      );
      await expect(ambiguousWorker.runOnce()).resolves.toEqual({
        claimed: 1,
        sent: 0,
        retry: 0,
        dead: 0,
        canceled: 0,
        reconciliationRequired: 1,
      });
      expect(smtpServer.recipients).toEqual([
        sentFixture.email,
        ambiguousFixture.email,
      ]);
      expect(smtpServer.messages).toHaveLength(2);
      await assertPersistedScenario(admin, ambiguousFixture, {
        status: 'RECONCILIATION_REQUIRED',
        transitionRevision: 4n,
        eventTypes: [
          'RELEASED',
          'CLAIMED',
          'PROVIDER_MARKED',
          'PROVIDER_AMBIGUOUS',
        ],
        ciphertextPresent: false,
      });
    });
  },
);

function enabledWorkerConfig(
  databaseUrl: string,
  expectedDatabase: string,
  expectedRole: string,
  tenantId: string,
  encryptionKey: string,
  smtp: IdentityMailWorkerSmtpConfig,
): EnabledIdentityMailWorkerConfig {
  return {
    enabled: true,
    realSendEnabled: true,
    liveCanaryEnabled: true,
    databaseUrl,
    databaseTlsRequired: false,
    databaseConnectTimeoutSeconds: 5,
    databaseSocketTimeoutSeconds: 30,
    expectedDatabase,
    expectedRole,
    expectedMigration: CURRENT_MIGRATION,
    expectedMigrationCount: CURRENT_MIGRATION_COUNT,
    releaseSha: RELEASE_SHA,
    canaryTenantIds: [tenantId],
    publicWebOrigin: 'https://leetplus.ru',
    encryptionKey,
    encryptionKeyVersion: 'v1',
    aadEnvironment: AAD_ENVIRONMENT,
    pollIntervalMs: 1_000,
    leaseMs: 30_000,
    batchSize: 1,
    maxAttempts: 3,
    baseRetryMs: 1_000,
    maxRetryMs: 8_000,
    healthHost: '127.0.0.1',
    healthPort: 19_731,
    smtp,
  };
}

function smtpConfig(port: number): IdentityMailWorkerSmtpConfig {
  return {
    host: '127.0.0.1',
    port,
    tlsMode: 'IMPLICIT_TLS',
    servername: SMTP_SERVERNAME,
    username: 'smtp-e2e-user',
    password: 'smtp-e2e-password',
    from: 'no-reply@leetplus.ru',
    messageIdDomain: 'mail.leetplus.ru',
    connectionTimeoutMs: 3_000,
    greetingTimeoutMs: 3_000,
    socketTimeoutMs: 4_000,
  };
}

function createEnvelopeService(
  encryptionKey: string,
): IdentityMailSecretEnvelopeService {
  return new IdentityMailSecretEnvelopeService(
    new ConfigService({
      IDENTITY_MAIL_ENCRYPTION_KEY: encryptionKey,
      IDENTITY_MAIL_ENCRYPTION_KEY_VERSION: 'v1',
      IDENTITY_MAIL_AAD_ENVIRONMENT: AAD_ENVIRONMENT,
    }),
  );
}

/**
 * Owner-only structural provenance used only to satisfy the immutable foreign
 * keys of the release command. Runtime provenance and signature verification
 * are covered by shared-beta-runtime-release-activation.pg.integration-spec.
 */
async function createFixtureReleaseSupport(
  admin: PrismaClient,
  workerRoleName: string,
  workerRoleOid: bigint,
): Promise<FixtureReleaseSupport> {
  const [installer] = await admin.$queryRaw<
    Array<{ role_name: string; role_oid: bigint }>
  >(Prisma.sql`
    SELECT
      current_user::TEXT AS role_name,
      role.oid::BIGINT AS role_oid
    FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = current_user
  `);
  if (!installer) {
    throw new Error('Fixture installer role identity was not available');
  }
  expect(workerRoleOid).not.toBe(installer.role_oid);
  expect(workerRoleOid).toBeGreaterThan(0n);
  expect(workerRoleOid).toBeLessThanOrEqual(4_294_967_295n);

  const buildProvenanceId = randomUUID();
  const challengeId = randomUUID();
  const markerId = randomUUID();
  const markerGeneration = 1n;
  const builtAt = new Date(Date.now() - 1_000);
  const buildValidUntil = new Date(builtAt.valueOf() + 6 * 60 * 60 * 1_000);
  const deployedAt = new Date();
  const markerValidUntil = new Date(deployedAt.valueOf() + 2 * 60 * 60 * 1_000);
  const challengeCreatedAt = deployedAt;
  const challengeValidUntil = new Date(
    challengeCreatedAt.valueOf() + 10 * 60 * 1_000,
  );
  const artifactDigest = fixtureDigest('release-artifact');
  const releaseManifestDigest = fixtureDigest('release-manifest');
  const migrationManifestDigest = fixtureDigest('migration-manifest');
  const policyManifestDigest = fixtureDigest('policy-manifest');
  const buildReferenceDigest = fixtureDigest('build-reference');
  const buildSigningKeyId = 'identity-mail-worker-build-fixture-v1';
  const buildPublicKeyFingerprint = fixtureDigest('build-public-key');
  const buildPayload = {
    schemaVersion: 1,
    kind: 'LEETPLUS_SHARED_BETA_BUILD_PROVENANCE',
    purpose: 'SHARED_BETA_BUILD_PROVENANCE',
    profile: 'SHARED_BETA_RUNTIME_RELEASE_PROVENANCE_V1',
    contract: 'SHARED_BETA_BUILD_PROVENANCE_V1',
    releaseSha: RELEASE_SHA,
    buildTime: builtAt.toISOString(),
    builtAtEpochMs: builtAt.valueOf(),
    artifactContentDigest: artifactDigest,
    releaseManifestDigest,
    schemaHead: CURRENT_MIGRATION,
    migrationCount: CURRENT_MIGRATION_COUNT,
    migrationManifestDigest,
    policyManifestDigest,
    trialPolicyVersion: 'SHARED_BETA_TRIAL_V1',
    trialDurationSeconds: TRIAL_DURATION_SECONDS,
    buildReferenceDigest,
    signingKeyId: buildSigningKeyId,
    publicKeyFingerprint: buildPublicKeyFingerprint,
    validUntilEpochMs: buildValidUntil.valueOf(),
  };
  const buildPayloadDigest = fixtureDigest('build-payload');

  const creationNonce = fixtureDigest('challenge-creation-nonce');
  const databaseIdentityDigest = fixtureDigest('database-identity');
  const predecessorMarkerDigest = fixtureDigest('predecessor-marker');
  const challengeDigest = fixtureDigest('database-challenge');
  const actualContextDigest = fixtureDigest('actual-context');
  const markerPayloadDigest = fixtureDigest('marker-payload');
  const deploymentInstanceDigest = fixtureDigest('deployment-instance');
  const deploymentSigningKeyId = 'identity-mail-worker-deploy-fixture-v1';
  const deploymentPublicKeyFingerprint = fixtureDigest('deployment-public-key');
  const markerPayload = {
    schemaVersion: 1,
    kind: 'LEETPLUS_SHARED_BETA_DEPLOYMENT_PROVENANCE',
    purpose: 'SHARED_BETA_DEPLOYMENT_PROVENANCE',
    profile: 'SHARED_BETA_RUNTIME_RELEASE_PROVENANCE_V1',
    contract: 'SHARED_BETA_DEPLOYMENT_PROVENANCE_V1',
    deploymentMarkerId: markerId,
    buildProvenanceId,
    buildPayloadDigest,
    generation: Number(markerGeneration),
    environment: AAD_ENVIRONMENT,
    deploymentInstanceDigest,
    databaseIdentityDigest,
    databaseChallengeDigest: challengeDigest,
    actualContextDigest,
    activationDatabaseRole: workerRoleName,
    coordinatorRoleName: workerRoleName,
    coordinatorRoleOid: Number(workerRoleOid),
    predecessorMarkerDigest,
    signingKeyId: deploymentSigningKeyId,
    publicKeyFingerprint: deploymentPublicKeyFingerprint,
    deployedAtEpochMs: deployedAt.valueOf(),
    validUntilEpochMs: markerValidUntil.valueOf(),
  };

  await admin.$transaction(async (tx) => {
    await tx.sharedBetaBuildProvenance.create({
      data: {
        id: buildProvenanceId,
        releaseSha: RELEASE_SHA,
        buildTime: builtAt.toISOString(),
        builtAt,
        artifactContentDigest: artifactDigest,
        releaseManifestDigest,
        schemaHead: CURRENT_MIGRATION,
        migrationCount: CURRENT_MIGRATION_COUNT,
        migrationManifestDigest,
        policyManifestDigest,
        trialPolicyVersion: 'SHARED_BETA_TRIAL_V1',
        trialDurationSeconds: TRIAL_DURATION_SECONDS,
        buildReferenceDigest,
        payload: buildPayload,
        payloadDigest: buildPayloadDigest,
        signingKeyId: buildSigningKeyId,
        publicKeyFingerprint: buildPublicKeyFingerprint,
        signatureBase64url: 'A'.repeat(86),
        validUntil: buildValidUntil,
        createdAt: builtAt,
      },
    });
    await tx.sharedBetaRuntimeReleaseChallenge.create({
      data: {
        id: challengeId,
        buildProvenanceId,
        environment: AAD_ENVIRONMENT,
        activationRoleName: workerRoleName,
        activationRoleOid: workerRoleOid,
        installerRoleName: installer.role_name,
        installerRoleOid: installer.role_oid,
        creationNonce,
        databaseIdentityDigest,
        schemaHead: CURRENT_MIGRATION,
        migrationCount: CURRENT_MIGRATION_COUNT,
        migrationManifestDigest,
        expectedStateRevision: 0,
        candidateGeneration: markerGeneration,
        predecessorMarkerDigest,
        challengeDigest,
        actualContextDigest,
        createdAt: challengeCreatedAt,
        validUntil: challengeValidUntil,
      },
    });
    await tx.sharedBetaRuntimeReleaseMarker.create({
      data: {
        id: markerId,
        buildProvenanceId,
        challengeId,
        generation: markerGeneration,
        environment: AAD_ENVIRONMENT,
        buildPayloadDigest,
        deploymentInstanceDigest,
        databaseIdentityDigest,
        databaseChallengeDigest: challengeDigest,
        actualContextDigest,
        schemaHead: CURRENT_MIGRATION,
        migrationCount: CURRENT_MIGRATION_COUNT,
        migrationManifestDigest,
        activationDatabaseRole: workerRoleName,
        coordinatorRoleName: workerRoleName,
        coordinatorRoleOid: workerRoleOid,
        predecessorMarkerDigest,
        payload: markerPayload,
        payloadDigest: markerPayloadDigest,
        signingKeyId: deploymentSigningKeyId,
        publicKeyFingerprint: deploymentPublicKeyFingerprint,
        signatureBase64url: 'A'.repeat(86),
        deployedAt,
        validUntil: markerValidUntil,
        createdAt: deployedAt,
      },
    });
  });

  return {
    buildProvenanceId,
    markerId,
    markerPayloadDigest,
    markerGeneration,
    actualContextDigest,
    artifactDigest,
    policyManifestDigest,
    databaseIdentityDigest,
  };
}

async function createPendingFixture(
  admin: PrismaClient,
  envelopeService: IdentityMailSecretEnvelopeService,
  scenario: string,
  releaseSupport: FixtureReleaseSupport,
  mutateCiphertext: (ciphertext: Buffer) => Buffer = (ciphertext) =>
    Buffer.from(ciphertext),
): Promise<ScenarioFixture> {
  const suffix = randomUUID();
  const tenantId = randomUUID();
  const email = `${scenario}-${suffix}@example.test`;
  const actorUserId = randomUUID();
  const reservationSubjectId = randomUUID();
  const workflowLocator = reservationSubjectId;
  const inviteId = randomUUID();
  const issueCommandId = randomUUID();
  const outboxId = randomUUID();
  const messageKey = randomUUID();
  const issueRequestId = randomUUID();
  const issueRequestDigest = fixtureDigest(`issue:${suffix}`);
  const trialStartsAt = new Date();
  const trialEndsAt = new Date(
    trialStartsAt.valueOf() + TRIAL_DURATION_SECONDS * 1_000,
  );
  const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  await admin.tenant.create({
    data: {
      id: tenantId,
      name: `Identity mail worker ${scenario}`,
      slug: `identity-mail-worker-${suffix}`,
      status: 'ACTIVE',
      customerStage: 'PILOT',
      onboardingStatus: 'OWNER_INVITED',
      trialStartsAt,
      trialEndsAt,
      entitlementProfileRevision: 1,
      executionRevision: 1,
      statusChangedAt: trialStartsAt,
      statusReason: 'Identity mail worker acceptance fixture',
    },
  });
  await admin.user.create({
    data: {
      id: actorUserId,
      tenantId,
      email: `platform-authority-${suffix}@example.test`,
      passwordHash: `fixture-only:${fixtureDigest(`actor:${suffix}`)}`,
      role: 'ADMIN',
      accessScope: 'NETWORK',
      isActive: true,
      isPlatformAdmin: true,
      emailVerifiedAt: trialStartsAt,
    },
  });

  const [reservation] = await admin.$queryRaw<
    Array<{ receipt: Prisma.JsonValue }>
  >(Prisma.sql`
    SELECT public."identity_email_claim_reserve_invite_v2"(
      CAST(${email} AS TEXT),
      CAST(${tenantId} AS TEXT),
      CAST(${reservationSubjectId} AS TEXT)
    ) AS receipt
  `);
  expect(reservation?.receipt).toEqual({
    schemaVersion: 2,
    operation: 'RESERVE_INVITE',
    decision: 'CREATED',
    tenantId,
    subjectId: reservationSubjectId,
    claimType: 'INVITE',
    revision: 1,
  });

  const sealed = envelopeService.sealInitialOwnerInviteToken({
    tenantId,
    workflowLocator,
    inviteId,
    outboxId,
    template: 'INITIAL_OWNER_INVITE',
    messageKey,
    requestDigest: issueRequestDigest,
    recipientEmail: email,
    expiresAt,
  });
  const ciphertext = mutateCiphertext(sealed.secretCiphertext);
  expect(ciphertext).toHaveLength(71);

  const [issue] = await admin.$queryRaw<
    Array<{ receipt: Prisma.JsonValue }>
  >(Prisma.sql`
    SELECT public."identity_owner_invite_issue_hold_v1"(
      CAST(${workflowLocator} AS TEXT),
      CAST(${tenantId} AS TEXT),
      CAST(${reservationSubjectId} AS TEXT),
      1::INTEGER,
      CAST(${issueRequestId} AS TEXT),
      CAST(${issueRequestDigest} AS TEXT),
      CAST(${AAD_ENVIRONMENT} AS TEXT),
      CAST(${issueCommandId} AS TEXT),
      CAST(${inviteId} AS TEXT),
      CAST(${outboxId} AS TEXT),
      CAST(${messageKey} AS TEXT),
      CAST(${sealed.tokenHash} AS TEXT),
      CAST(${ciphertext} AS BYTEA),
      CAST(${expiresAt} AS TIMESTAMPTZ)
    ) AS receipt
  `);
  expect(issue?.receipt).toEqual({
    schemaVersion: 1,
    operation: 'ISSUE_DORMANT_OWNER_INVITE',
    decision: 'CREATED',
    tenantId,
    commandId: issueCommandId,
    inviteId,
    outboxId,
    outboxStatus: 'HOLD',
    claimType: 'INVITE',
    claimRevision: 2,
    role: 'OWNER',
    accessScope: 'NETWORK',
  });

  const heldOutbox = await admin.identityMailOutbox.findUniqueOrThrow({
    where: { id: outboxId },
  });
  expect(heldOutbox).toMatchObject({
    tenantId,
    issueCommandId,
    inviteId,
    status: 'HOLD',
    releasedAt: null,
    availableAt: null,
    attempts: 0,
    leaseVersion: 0,
    transitionRevision: 0n,
  });
  expect(heldOutbox.updatedAt.valueOf()).toBe(heldOutbox.createdAt.valueOf());
  expect(Buffer.from(heldOutbox.secretCiphertext ?? [])).toEqual(ciphertext);
  await expect(
    admin.identityMailDeliveryEvent.count({ where: { outboxId } }),
  ).resolves.toBe(0);

  const shellEvidenceDigest = fixtureDigest(`shell:${suffix}`);
  const decisionId = randomUUID();
  const decisionRequestId = randomUUID();
  const decisionRequestDigest = fixtureDigest(`admission-request:${suffix}`);
  const profileDigest = fixtureDigest(`profile:${suffix}`);
  const gateSetDigest = fixtureDigest(`gate-set:${suffix}`);
  const approvalReferenceDigest = fixtureDigest(`approval:${suffix}`);
  const admissionSigningKeyId = 'identity-mail-worker-admission-fixture-v1';
  const admissionPublicKeyFingerprint = fixtureDigest(
    `admission-public-key:${suffix}`,
  );
  const admissionApprovedAt = new Date();
  const admissionValidUntil = new Date(
    admissionApprovedAt.valueOf() + 60 * 60 * 1_000,
  );
  const decisionPayload = {
    schemaVersion: 1,
    kind: 'LEETPLUS_SHARED_BETA_TENANT_ADMISSION_DECISION',
    purpose: 'SHARED_BETA_TENANT_ADMISSION',
    profile: 'SHARED_BETA_ADMISSION_V1',
    contractVersion: 'TENANT_ADMISSION_DECISION_V1',
    decisionId,
    tenantId,
    decision: 'GO',
    requestId: decisionRequestId,
    requestDigest: decisionRequestDigest,
    workflowLocator,
    reservationSubjectId,
    expectedClaimRevision: 1,
    shellEvidenceDigest,
    releaseSha: RELEASE_SHA,
    environment: AAD_ENVIRONMENT,
    artifactDigest: releaseSupport.artifactDigest,
    schemaHead: CURRENT_MIGRATION,
    migrationCount: CURRENT_MIGRATION_COUNT,
    policyManifestDigest: releaseSupport.policyManifestDigest,
    databaseIdentityDigest: releaseSupport.databaseIdentityDigest,
    expectedEntitlementProfileRevision: 1,
    expectedExecutionRevision: 0,
    profileDigest,
    gateSetVersion: 'SHARED_BETA_GATE_SET_V1',
    gateSetDigest,
    approvedByUserId: actorUserId,
    approvalReferenceDigest,
    signingKeyId: admissionSigningKeyId,
    publicKeyFingerprint: admissionPublicKeyFingerprint,
    approvedAtEpochMs: admissionApprovedAt.valueOf(),
    validUntilEpochMs: admissionValidUntil.valueOf(),
  };
  await admin.tenantAdmissionDecision.create({
    data: {
      id: decisionId,
      tenantId,
      requestId: decisionRequestId,
      requestDigest: decisionRequestDigest,
      workflowLocator,
      reservationSubjectId,
      expectedClaimRevision: 1,
      shellEvidenceDigest,
      releaseSha: RELEASE_SHA,
      environment: AAD_ENVIRONMENT,
      artifactDigest: releaseSupport.artifactDigest,
      schemaHead: CURRENT_MIGRATION,
      migrationCount: CURRENT_MIGRATION_COUNT,
      policyManifestDigest: releaseSupport.policyManifestDigest,
      databaseIdentityDigest: releaseSupport.databaseIdentityDigest,
      expectedEntitlementProfileRevision: 1,
      expectedExecutionRevision: 0,
      profileDigest,
      gateSetDigest,
      approvedByUserId: actorUserId,
      approvalReferenceDigest,
      payload: decisionPayload,
      payloadDigest: fixtureDigest(`admission-payload:${suffix}`),
      signingKeyId: admissionSigningKeyId,
      publicKeyFingerprint: admissionPublicKeyFingerprint,
      signature: randomBytes(64),
      approvedAt: admissionApprovedAt,
      validUntil: admissionValidUntil,
      createdAt: admissionApprovedAt,
    },
  });

  const releasedAt = new Date();
  const activationCommandId = randomUUID();
  const activationRequestId = randomUUID();
  const activationRequestDigest = fixtureDigest(`activation-request:${suffix}`);
  await admin.$transaction(
    async (tx) => {
      const [transaction] = await tx.$queryRaw<
        Array<{ transaction_id: string }>
      >(Prisma.sql`
        SELECT pg_catalog.pg_current_xact_id()::TEXT AS transaction_id
      `);
      if (!transaction) {
        throw new Error('Fixture transaction identity was not available');
      }
      const activationTrialEndsAt = new Date(
        releasedAt.valueOf() + TRIAL_DURATION_SECONDS * 1_000,
      );
      await tx.sharedBetaTenantActivationCommand.create({
        data: {
          id: activationCommandId,
          tenantId,
          requestId: activationRequestId,
          requestDigest: activationRequestDigest,
          decisionId,
          markerId: releaseSupport.markerId,
          markerPayloadDigest: releaseSupport.markerPayloadDigest,
          markerGeneration: releaseSupport.markerGeneration,
          buildProvenanceId: releaseSupport.buildProvenanceId,
          actualContextDigest: releaseSupport.actualContextDigest,
          actualShellDigest: shellEvidenceDigest,
          reservationSubjectId,
          reservationClaimRevision: 1,
          issueRequestId,
          issueRequestDigest,
          issueCommandId,
          inviteId,
          outboxId,
          messageKey,
          tokenHash: sealed.tokenHash,
          secretCiphertextDigest: createHash('sha256')
            .update(ciphertext)
            .digest('hex'),
          workflowLocator,
          activatedByUserId: actorUserId,
          entitlementProfileRevision: 1,
          executionRevisionBefore: 0,
          executionRevisionAfter: 1,
          trialPolicyVersion: 'SHARED_BETA_TRIAL_V1',
          trialDurationSeconds: TRIAL_DURATION_SECONDS,
          trialStartsAt: releasedAt,
          trialEndsAt: activationTrialEndsAt,
          receipt: {
            schemaVersion: 1,
            operation: 'ACTIVATE_AND_RELEASE_OWNER_INVITE',
            decision: 'ACTIVATED',
            tenantId,
            activationCommandId,
            admissionDecisionId: decisionId,
            markerId: releaseSupport.markerId,
            markerGeneration: Number(releaseSupport.markerGeneration),
            tenantStatus: 'ACTIVE',
            onboardingStatus: 'OWNER_INVITED',
            executionRevision: 1,
            trialStartsAtEpochMs: releasedAt.valueOf(),
            trialEndsAtEpochMs: activationTrialEndsAt.valueOf(),
            inviteId,
            outboxId,
            outboxStatus: 'PENDING',
            createdTransactionId: transaction.transaction_id,
          },
          createdTransactionId: transaction.transaction_id,
          activatedAt: releasedAt,
        },
      });
      await tx.identityMailOutbox.update({
        where: { id: outboxId },
        data: {
          status: 'PENDING',
          releasedAt,
        },
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 10_000,
    },
  );

  const [releasedOutbox, releaseEvents] = await Promise.all([
    admin.identityMailOutbox.findUniqueOrThrow({ where: { id: outboxId } }),
    admin.identityMailDeliveryEvent.findMany({ where: { outboxId } }),
  ]);
  expect(releasedOutbox).toMatchObject({
    tenantId,
    issueCommandId,
    inviteId,
    status: 'PENDING',
    releasedAt,
    availableAt: releasedAt,
    attempts: 0,
    leaseVersion: 0,
    transitionRevision: 1n,
  });
  expect(releasedOutbox.updatedAt.valueOf()).toBe(releasedAt.valueOf());
  expect(Buffer.from(releasedOutbox.secretCiphertext ?? [])).toEqual(
    ciphertext,
  );
  expect(releaseEvents).toHaveLength(1);
  expect(releaseEvents[0]).toMatchObject({
    tenantId,
    outboxId,
    inviteId,
    transitionRevision: 1n,
    leaseVersion: 0,
    attemptNumber: 0,
    eventType: 'RELEASED',
    fromStatus: 'HOLD',
    toStatus: 'PENDING',
    eventAt: releasedAt,
  });
  expect(
    JSON.stringify(releaseEvents, (_key, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value,
    ),
  ).not.toContain(email);

  sealed.secretCiphertext.fill(0);
  return {
    tenantId,
    email,
    inviteId,
    outboxId,
    ciphertext: Buffer.from(ciphertext),
  };
}

async function createScenarioWorker(input: {
  admin: PrismaClient;
  repository: PrismaIdentityMailWorkerRepository;
  envelopeService: IdentityMailSecretEnvelopeService;
  smtpProvider: StrictIdentityMailSmtpProvider;
  smtp: IdentityMailWorkerSmtpConfig;
  workerDatabaseUrl: string;
  expectedDatabase: string;
  workerRoleName: string;
  workerRoleOid: bigint;
  encryptionKey: string;
  tenantId: string;
}): Promise<ScenarioWorker> {
  const config = enabledWorkerConfig(
    input.workerDatabaseUrl,
    input.expectedDatabase,
    input.workerRoleName,
    input.tenantId,
    input.encryptionKey,
    input.smtp,
  );
  const service = new IdentityMailWorkerService(
    config,
    input.repository,
    input.envelopeService,
    input.smtpProvider,
  );
  const enabledAt = new Date();
  await input.admin.identityMailDeliveryTenantEnrollment.create({
    data: {
      tenantId: input.tenantId,
      workerRoleName: input.workerRoleName,
      workerRoleOid: input.workerRoleOid,
      enabled: true,
      maxAttempts: config.maxAttempts,
      leaseSeconds: config.leaseMs / 1_000,
      acknowledgeSeconds: Math.ceil(
        (config.smtp.connectionTimeoutMs +
          config.smtp.greetingTimeoutMs +
          config.smtp.socketTimeoutMs) /
          1_000,
      ),
      baseRetrySeconds: config.baseRetryMs / 1_000,
      maxRetrySeconds: config.maxRetryMs / 1_000,
      providerAuthorityDigest: service.workerConfigDigest,
      enabledAt,
      createdAt: enabledAt,
      updatedAt: enabledAt,
    },
  });
  return { config, service };
}

function assertWorkerReleaseContract(
  worker: ScenarioWorker,
  tenantId: string,
): void {
  expect(worker.config).toMatchObject({
    enabled: true,
    realSendEnabled: true,
    liveCanaryEnabled: true,
    expectedMigration: CURRENT_MIGRATION,
    expectedMigrationCount: CURRENT_MIGRATION_COUNT,
    releaseSha: RELEASE_SHA,
    canaryTenantIds: [tenantId],
  });
  expect(worker.config.expectedRole).toMatch(DISPOSABLE_ROLE_PATTERN);
  expect(worker.service.workerConfigDigest).toMatch(/^[0-9a-f]{64}$/u);
}

function fixtureDigest(value: string): string {
  return createHash('sha256')
    .update(`identity-mail-worker-pg-fixture:v1:${value}`)
    .digest('hex');
}

async function assertPersistedScenario(
  admin: PrismaClient,
  fixture: ScenarioFixture,
  expected: {
    status: 'SENT' | 'RETRY' | 'RECONCILIATION_REQUIRED';
    transitionRevision: bigint;
    eventTypes: string[];
    ciphertextPresent: boolean;
  },
) {
  const [outbox, events] = await Promise.all([
    admin.identityMailOutbox.findUniqueOrThrow({
      where: { id: fixture.outboxId },
    }),
    admin.identityMailDeliveryEvent.findMany({
      where: { outboxId: fixture.outboxId },
      orderBy: { transitionRevision: 'asc' },
    }),
  ]);

  expect(outbox).toMatchObject({
    id: fixture.outboxId,
    inviteId: fixture.inviteId,
    status: expected.status,
    attempts: 1,
    leaseVersion: 1,
    transitionRevision: expected.transitionRevision,
    leaseOwnerDigest: null,
    leaseTokenDigest: null,
    claimedAt: null,
    leaseExpiresAt: null,
  });
  if (expected.ciphertextPresent) {
    expect(Buffer.from(outbox.secretCiphertext ?? [])).toEqual(
      fixture.ciphertext,
    );
    expect(outbox.providerAttemptKey).toBeNull();
    expect(outbox.ciphertextClearedAt).toBeNull();
  } else {
    expect(outbox.secretCiphertext).toBeNull();
    expect(outbox.providerAttemptKey).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/u);
    expect(outbox.ciphertextClearedAt).not.toBeNull();
  }
  if (expected.status === 'SENT') {
    expect(outbox.providerOutcomeClass).toBe('ACCEPTED');
    expect(outbox.providerReceiptDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(outbox.terminalAckDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(outbox.sentAt).not.toBeNull();
    expect(outbox.terminalAt?.valueOf()).toBe(outbox.sentAt?.valueOf());
    expect(outbox.stateReasonCode).toBeNull();
  } else if (expected.status === 'RETRY') {
    expect(outbox.providerOutcomeClass).toBeNull();
    expect(outbox.providerReceiptDigest).toBeNull();
    expect(outbox.terminalAckDigest).toBeNull();
    expect(outbox.sentAt).toBeNull();
    expect(outbox.terminalAt).toBeNull();
    expect(outbox.stateReasonCode).toBe('PRE_PROVIDER_TRANSIENT');
  } else {
    expect(outbox.providerOutcomeClass).toBe('AMBIGUOUS');
    expect(outbox.providerReceiptDigest).toBeNull();
    expect(outbox.terminalAckDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(outbox.sentAt).toBeNull();
    expect(outbox.terminalAt).not.toBeNull();
    expect(outbox.stateReasonCode).toBe('PROVIDER_OUTCOME_AMBIGUOUS');
  }

  expect(events.map((event) => event.eventType)).toEqual(expected.eventTypes);
  expect(events.map((event) => event.transitionRevision)).toEqual(
    expected.eventTypes.map((_, index) => BigInt(index + 1)),
  );
  expect(
    JSON.stringify(events, (_key, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value,
    ),
  ).not.toContain(fixture.email);
}

function repositoryWithPostProviderAckLoss(
  repository: PrismaIdentityMailWorkerRepository,
): IdentityMailWorkerRepository {
  return {
    assertReady: (input) => repository.assertReady(input),
    claimOne: (input) => repository.claimOne(input),
    reapExpired: (input) => repository.reapExpired(input),
    markProviderAttempt: (input) => repository.markProviderAttempt(input),
    markSent: () =>
      Promise.reject(new Error('INJECTED_POST_PROVIDER_ACK_LOSS')),
    markPreProviderFailure: (input) => repository.markPreProviderFailure(input),
    markReconciliationRequired: (input) =>
      repository.markReconciliationRequired(input),
  };
}

async function installLeastPrivilegeWorkerRole(
  admin: PrismaClient,
  databaseName: string,
  roleName: string,
) {
  assertDisposableDatabaseName(databaseName);
  assertDisposableRoleName(roleName);
  const database = `"${databaseName}"`;
  const role = `"${roleName}"`;
  const statements = [
    `REVOKE CONNECT, CREATE, TEMPORARY ON DATABASE ${database} FROM PUBLIC`,
    `REVOKE ALL PRIVILEGES ON DATABASE ${database} FROM ${role}`,
    `GRANT CONNECT ON DATABASE ${database} TO ${role}`,
    'REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC',
    `REVOKE ALL PRIVILEGES ON SCHEMA public FROM ${role}`,
    `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${role}`,
    `REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${role}`,
    `REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public FROM ${role}`,
    'REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM PUBLIC',
    `GRANT USAGE ON SCHEMA public TO ${role}`,
    ...WORKER_RPC_SIGNATURES.map(
      (signature) => `GRANT EXECUTE ON FUNCTION ${signature} TO ${role}`,
    ),
  ];
  for (const statement of statements) {
    await admin.$executeRawUnsafe(statement);
  }
}

function prismaFor(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
}

function deployMigrations(databaseUrl: string) {
  deployCanonicalPrismaMigrations(databaseUrl, {
    failureMessage:
      'Failed to deploy migrations into the disposable identity-mail worker database',
    timeoutMs: 120_000,
  });
}

function databaseUrlFor(databaseUrl: URL, databaseName: string): string {
  const target = new URL(databaseUrl);
  target.pathname = `/${databaseName}`;
  target.searchParams.delete('schema');
  target.searchParams.delete('pgbouncer');
  return target.toString();
}

function databaseUrlForRole(
  databaseUrl: URL,
  databaseName: string,
  roleName: string,
  password: string,
): string {
  assertDisposableDatabaseName(databaseName);
  assertDisposableRoleName(roleName);
  const target = new URL(databaseUrlFor(databaseUrl, databaseName));
  target.username = roleName;
  target.password = password;
  target.searchParams.set('schema', 'public');
  target.searchParams.set('connect_timeout', '5');
  target.searchParams.set('socket_timeout', '30');
  return target.toString();
}

function assertSafeIntegrationDatabase(): URL {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing identity-mail worker E2E when NODE_ENV is production',
    );
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required for identity-mail worker PostgreSQL E2E',
    );
  }
  const parsed = new URL(databaseUrl);
  const normalizedHostname = parsed.hostname.replace(/^\[([^\]]+)\]$/u, '$1');
  const databaseName = parsed.pathname.replace(/^\/+|\/+$/gu, '').toLowerCase();
  if (
    !new Set(['127.0.0.1', 'localhost', '::1']).has(normalizedHostname) ||
    !/(?:^|[_-])(ci|test)(?:$|[_-])/u.test(databaseName)
  ) {
    throw new Error(
      'Refusing identity-mail worker E2E outside a local CI/test database',
    );
  }
  return parsed;
}

function assertDisposableDatabaseName(databaseName: string) {
  if (!DISPOSABLE_DATABASE_PATTERN.test(databaseName)) {
    throw new Error('Refusing an unsafe disposable database name');
  }
}

function assertDisposableRoleName(roleName: string) {
  if (!DISPOSABLE_ROLE_PATTERN.test(roleName)) {
    throw new Error('Refusing an unsafe disposable worker role name');
  }
}
