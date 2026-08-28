import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  API_RUNTIME_ROLE_KEY,
  apiRuntimeServiceName,
  resolveApiRuntimeRole,
} from './config/api-runtime-role';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  getLiveness() {
    return {
      ok: true,
      service: this.serviceName(),
      checkedAt: new Date().toISOString(),
      release: this.releaseIdentity(),
    };
  }

  async getReadiness() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const migrations = await this.prisma.$queryRaw<
        Array<{
          migration_name: string | null;
          completed_count: number;
          unfinished_count: number;
        }>
      >`
        SELECT
          (
            SELECT migration_name
            FROM "_prisma_migrations"
            WHERE finished_at IS NOT NULL
              AND rolled_back_at IS NULL
            ORDER BY migration_name DESC
            LIMIT 1
          ) AS migration_name,
          COUNT(*) FILTER (
            WHERE finished_at IS NOT NULL
              AND rolled_back_at IS NULL
          )::int AS completed_count,
          COUNT(*) FILTER (
            WHERE finished_at IS NULL
              AND rolled_back_at IS NULL
          )::int AS unfinished_count
        FROM "_prisma_migrations"
      `;
      const databaseMigration = migrations[0]?.migration_name ?? null;
      const completedMigrations = migrations[0]?.completed_count ?? 0;
      const unfinishedMigrations = migrations[0]?.unfinished_count ?? 0;
      const expectedMigration = this.optionalConfig(
        'EXPECTED_DATABASE_MIGRATION',
      );
      const expectedMigrationCount = this.optionalPositiveInt(
        'EXPECTED_DATABASE_MIGRATION_COUNT',
      );

      if (!databaseMigration) {
        throw new ReadinessFailure('NO_COMPLETED_MIGRATIONS');
      }

      if (unfinishedMigrations > 0) {
        throw new ReadinessFailure('UNFINISHED_MIGRATIONS');
      }

      if (expectedMigration && databaseMigration !== expectedMigration) {
        throw new ReadinessFailure('MIGRATION_REVISION_MISMATCH');
      }

      if (
        expectedMigrationCount &&
        completedMigrations !== expectedMigrationCount
      ) {
        throw new ReadinessFailure('MIGRATION_COUNT_MISMATCH');
      }

      return {
        ok: true,
        service: this.serviceName(),
        checkedAt: new Date().toISOString(),
        release: this.releaseIdentity(),
        dependencies: {
          database: {
            ok: true,
            migration: databaseMigration,
            migrationCount: completedMigrations,
          },
        },
      };
    } catch (error) {
      const reason =
        error instanceof ReadinessFailure ? error.code : 'DATABASE_UNAVAILABLE';
      this.logger.error(`Readiness check failed: ${reason}`);

      throw new ServiceUnavailableException({
        ok: false,
        service: this.serviceName(),
        checkedAt: new Date().toISOString(),
        release: this.releaseIdentity(),
        dependencies: {
          database: {
            ok: false,
            reason,
          },
        },
      });
    }
  }

  getVersion() {
    return {
      service: this.serviceName(),
      release: this.releaseIdentity(),
    };
  }

  private releaseIdentity() {
    return {
      sha:
        this.optionalConfig('RELEASE_SHA') ??
        this.optionalConfig('GIT_SHA') ??
        'unknown',
      builtAt: this.optionalConfig('BUILD_TIME'),
    };
  }

  private serviceName() {
    return apiRuntimeServiceName(
      resolveApiRuntimeRole(this.configService.get(API_RUNTIME_ROLE_KEY)),
    );
  }

  private optionalConfig(key: string) {
    return this.configService.get<string>(key)?.trim() || null;
  }

  private optionalPositiveInt(key: string) {
    const raw = this.optionalConfig(key);
    if (!raw || !/^[1-9]\d*$/.test(raw)) {
      return null;
    }

    return Number(raw);
  }
}

type ReadinessFailureCode =
  | 'NO_COMPLETED_MIGRATIONS'
  | 'UNFINISHED_MIGRATIONS'
  | 'MIGRATION_REVISION_MISMATCH'
  | 'MIGRATION_COUNT_MISMATCH';

class ReadinessFailure extends Error {
  constructor(readonly code: ReadinessFailureCode) {
    super(code);
  }
}
