import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

type CanonicalMigrationDeployOptions = {
  failureMessage: string;
  timeoutMs: number;
};

const TEMPORARY_ARTIFACT_PREFIX = 'leetplus-canonical-prisma-';
const IDENTITY_MAIL_CURRENT183_CANDIDATES = [
  {
    name: '20260801010000_identity_mail_tenant_enrollment_control_plane',
    confirmationGuc:
      'leetplus.identity_mail_tenant_enrollment_current180_confirmation',
    confirmation: 'rehearse-dormant-identity-mail-tenant-enrollment-current180',
    shaGuc: 'leetplus.identity_mail_tenant_enrollment_current180_sha256',
  },
  {
    name: '20260801020000_identity_mail_tenant_lock_drain_worker_v2',
    confirmationGuc:
      'leetplus.identity_mail_tenant_lock_drain_current181_confirmation',
    confirmation:
      'rehearse-noncanonical-identity-mail-tenant-lock-drain-current181',
    shaGuc: 'leetplus.identity_mail_tenant_lock_drain_current181_sha256',
  },
  {
    name: '20260801030000_identity_mail_tenant_first_claim_protocol',
    confirmationGuc:
      'leetplus.identity_mail_tenant_first_claim_current182_confirmation',
    confirmation:
      'rehearse-noncanonical-identity-mail-tenant-first-claim-current182',
    shaGuc: 'leetplus.identity_mail_tenant_first_claim_current182_sha256',
  },
  {
    name: '20260802010000_identity_mail_worker_v2_freshness_protocol',
    confirmationGuc:
      'leetplus.identity_mail_worker_v2_freshness_current183_confirmation',
    confirmation:
      'rehearse-noncanonical-identity-mail-worker-v2-freshness-current183',
    shaGuc: 'leetplus.identity_mail_worker_v2_freshness_current183_sha256',
  },
] as const;

const IDENTITY_MAIL_CURRENT184_CANDIDATES = [
  ...IDENTITY_MAIL_CURRENT183_CANDIDATES,
  {
    name: '20260802020000_identity_mail_worker_v2_lost_response_replay',
    confirmationGuc:
      'leetplus.identity_mail_worker_v2_replay_current184_confirmation',
    confirmation:
      'rehearse-noncanonical-identity-mail-worker-v2-replay-current184',
    shaGuc: 'leetplus.identity_mail_worker_v2_replay_current184_sha256',
  },
] as const;

const IDENTITY_MAIL_CURRENT185_CANDIDATES = [
  ...IDENTITY_MAIL_CURRENT184_CANDIDATES,
  {
    name: '20260802030000_identity_mail_enrollment_evidence_ledger_v2',
    confirmationGuc:
      'leetplus.identity_mail_enrollment_evidence_ledger_current185_confirmation',
    confirmation:
      'rehearse-noncanonical-identity-mail-enrollment-evidence-ledger-current185',
    shaGuc:
      'leetplus.identity_mail_enrollment_evidence_ledger_current185_sha256',
  },
] as const;

const IDENTITY_MAIL_CURRENT186_CANDIDATES = [
  ...IDENTITY_MAIL_CURRENT185_CANDIDATES,
  {
    name: '20260803010000_identity_mail_duty_role_runtime_boundary_v2',
    confirmationGuc:
      'leetplus.identity_mail_duty_role_runtime_current186_confirmation',
    confirmation:
      'rehearse-noncanonical-identity-mail-duty-role-runtime-current186',
    shaGuc: 'leetplus.identity_mail_duty_role_runtime_current186_sha256',
  },
] as const;

export function deployCanonicalPrismaMigrations(
  databaseUrl: string,
  options: CanonicalMigrationDeployOptions,
): void {
  const repositoryRoot = resolve(__dirname, '../../..');
  const databasePackage = join(repositoryRoot, 'packages', 'database');
  const sourcePrismaDirectory = join(databasePackage, 'prisma');
  const temporaryRoot = mkdtempSync(join(tmpdir(), TEMPORARY_ARTIFACT_PREFIX));
  const artifactPrismaDirectory = join(temporaryRoot, 'prisma');

  try {
    cpSync(sourcePrismaDirectory, artifactPrismaDirectory, {
      recursive: true,
    });
    normalizeMigrationLineEndings(join(artifactPrismaDirectory, 'migrations'));
    execFileSync(
      process.execPath,
      [
        join(databasePackage, 'node_modules', 'prisma', 'build', 'index.js'),
        'migrate',
        'deploy',
        '--schema',
        join(artifactPrismaDirectory, 'schema.prisma'),
      ],
      {
        cwd: databasePackage,
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: options.timeoutMs,
      },
    );
  } catch (error) {
    const detail =
      error instanceof Error && error.message.trim().length > 0
        ? error.message.trim()
        : String(error);
    throw new Error(`${options.failureMessage}: ${detail}`, { cause: error });
  } finally {
    removeTemporaryArtifact(temporaryRoot);
  }
}

export function deployIdentityMailCurrent183CandidateStack(
  databaseUrl: string,
  options: CanonicalMigrationDeployOptions,
): void {
  deployIdentityMailCandidateStack(
    databaseUrl,
    options,
    IDENTITY_MAIL_CURRENT183_CANDIDATES,
    'CURRENT183',
  );
}

export function deployIdentityMailCurrent184CandidateStack(
  databaseUrl: string,
  options: CanonicalMigrationDeployOptions,
): void {
  deployIdentityMailCandidateStack(
    databaseUrl,
    options,
    IDENTITY_MAIL_CURRENT184_CANDIDATES,
    'CURRENT184',
  );
}

export function deployIdentityMailCurrent185CandidateStack(
  databaseUrl: string,
  options: CanonicalMigrationDeployOptions,
): void {
  deployIdentityMailCandidateStack(
    databaseUrl,
    options,
    IDENTITY_MAIL_CURRENT185_CANDIDATES,
    'CURRENT185',
  );
}

export function deployIdentityMailCurrent186CandidateStack(
  databaseUrl: string,
  options: CanonicalMigrationDeployOptions,
): void {
  deployIdentityMailCandidateStack(
    databaseUrl,
    options,
    IDENTITY_MAIL_CURRENT186_CANDIDATES,
    'CURRENT186',
  );
}

function deployIdentityMailCandidateStack(
  databaseUrl: string,
  options: CanonicalMigrationDeployOptions,
  candidates: ReadonlyArray<{
    name: string;
    confirmationGuc: string;
    confirmation: string;
    shaGuc: string;
  }>,
  candidateLabel: 'CURRENT183' | 'CURRENT184' | 'CURRENT185' | 'CURRENT186',
): void {
  const target = new URL(databaseUrl);
  const targetHost = target.hostname.replace(/^\[([^\]]+)\]$/u, '$1');
  const databaseName = decodeURIComponent(
    target.pathname.replace(/^\/+|\/+$/gu, ''),
  );
  if (
    process.env.NODE_ENV === 'production' ||
    !new Set(['127.0.0.1', 'localhost', '::1']).has(targetHost) ||
    !/^lp_imtec_[0-9a-f]{32}_ci$/u.test(databaseName)
  ) {
    throw new Error(
      `${candidateLabel} candidate stack requires a local exact disposable test database`,
    );
  }

  const repositoryRoot = resolve(__dirname, '../../..');
  const databasePackage = join(repositoryRoot, 'packages', 'database');
  const sourcePrismaDirectory = join(databasePackage, 'prisma');
  const candidateRoot = join(databasePackage, 'migration-candidates');
  const temporaryRoot = mkdtempSync(join(tmpdir(), TEMPORARY_ARTIFACT_PREFIX));
  const artifactPrismaDirectory = join(temporaryRoot, 'prisma');

  try {
    cpSync(sourcePrismaDirectory, artifactPrismaDirectory, {
      recursive: true,
    });
    const migrationsDirectory = join(artifactPrismaDirectory, 'migrations');
    const sessionOptions: string[] = [];
    for (const candidate of candidates) {
      const sourceMigration = join(
        candidateRoot,
        candidate.name,
        'migration.sql',
      );
      const targetDirectory = join(migrationsDirectory, candidate.name);
      const targetMigration = join(targetDirectory, 'migration.sql');
      mkdirSync(targetDirectory);
      copyFileSync(sourceMigration, targetMigration);
      const normalized = readFileSync(targetMigration, 'utf8').replace(
        /\r\n?/gu,
        '\n',
      );
      writeFileSync(targetMigration, normalized, 'utf8');
      const sha256 = createHash('sha256').update(normalized).digest('hex');
      sessionOptions.push(
        `-c ${candidate.confirmationGuc}=${candidate.confirmation}`,
        `-c ${candidate.shaGuc}=${sha256}`,
      );
    }
    normalizeMigrationLineEndings(migrationsDirectory);
    const pgOptions = sessionOptions.join(' ');
    target.searchParams.set('options', pgOptions);
    execFileSync(
      process.execPath,
      [
        join(databasePackage, 'node_modules', 'prisma', 'build', 'index.js'),
        'migrate',
        'deploy',
        '--schema',
        join(artifactPrismaDirectory, 'schema.prisma'),
      ],
      {
        cwd: databasePackage,
        env: {
          ...process.env,
          DATABASE_URL: target.toString(),
          NODE_ENV: 'test',
          PGOPTIONS: pgOptions,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: options.timeoutMs,
      },
    );
  } catch (error) {
    const detail =
      error instanceof Error && error.message.trim().length > 0
        ? error.message.trim()
        : String(error);
    throw new Error(`${options.failureMessage}: ${detail}`, { cause: error });
  } finally {
    removeTemporaryArtifact(temporaryRoot);
  }
}

function normalizeMigrationLineEndings(migrationsDirectory: string): void {
  for (const entry of readdirSync(migrationsDirectory, {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const migrationPath = join(
      migrationsDirectory,
      entry.name,
      'migration.sql',
    );
    if (!existsSync(migrationPath)) {
      continue;
    }
    const source = readFileSync(migrationPath, 'utf8');
    writeFileSync(migrationPath, source.replace(/\r\n?/gu, '\n'), 'utf8');
  }
}

function removeTemporaryArtifact(temporaryRoot: string): void {
  const resolvedRoot = resolve(temporaryRoot);
  const resolvedTemporaryDirectory = resolve(tmpdir());
  if (
    !resolvedRoot.startsWith(`${resolvedTemporaryDirectory}${sep}`) ||
    !resolvedRoot
      .slice(resolvedTemporaryDirectory.length + 1)
      .startsWith(TEMPORARY_ARTIFACT_PREFIX)
  ) {
    throw new Error('Unsafe canonical Prisma artifact cleanup target');
  }
  rmSync(resolvedRoot, { recursive: true, force: true });
}
