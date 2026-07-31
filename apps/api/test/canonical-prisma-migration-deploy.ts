import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
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
  } catch {
    throw new Error(options.failureMessage);
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
