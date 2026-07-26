import { PrismaClient } from '@prisma/client';
import { readdir } from 'node:fs/promises';

const prisma = new PrismaClient();

try {
  const migrationEntries = await readdir(
    new URL('../prisma/migrations/', import.meta.url),
    { withFileTypes: true },
  );
  const expectedMigrations = migrationEntries
    .filter(
      (entry) =>
        entry.isDirectory() && /^\d{14}_[a-z0-9_]+$/.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort();
  const expectedLatestMigration = expectedMigrations.at(-1);

  if (!expectedLatestMigration) {
    throw new Error('No release migrations were found in the artifact.');
  }

  const [connectivity] = await prisma.$queryRaw`
    SELECT current_database() AS database_name, 1::int AS ok
  `;
  const [migrationSummary] = await prisma.$queryRaw`
    SELECT
      MAX(migration_name) FILTER (
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      ) AS latest_migration,
      COUNT(*) FILTER (
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      )::int AS applied_count,
      COUNT(*) FILTER (
        WHERE finished_at IS NULL AND rolled_back_at IS NULL
      )::int AS failed_count
    FROM "_prisma_migrations"
  `;

  if (connectivity?.ok !== 1) {
    throw new Error('PostgreSQL connectivity check returned an unexpected result.');
  }

  if (!migrationSummary) {
    throw new Error('Prisma migration summary was not returned.');
  }

  if (migrationSummary.failed_count !== 0) {
    throw new Error(
      `Found ${migrationSummary.failed_count} unfinished Prisma migration(s).`,
    );
  }

  if (migrationSummary.applied_count !== expectedMigrations.length) {
    throw new Error(
      `Expected ${expectedMigrations.length} completed migration(s), found ${migrationSummary.applied_count}.`,
    );
  }

  if (migrationSummary.latest_migration !== expectedLatestMigration) {
    throw new Error(
      `Expected latest migration ${expectedLatestMigration}, found ${migrationSummary.latest_migration ?? 'none'}.`,
    );
  }

  console.log(
    `Database smoke passed for ${connectivity.database_name}: ${migrationSummary.applied_count} migrations applied through ${migrationSummary.latest_migration}.`,
  );
} finally {
  await prisma.$disconnect();
}
