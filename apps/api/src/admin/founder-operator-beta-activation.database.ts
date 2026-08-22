import {
  Injectable,
  OnModuleDestroy,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_ROLE,
  resolveFounderOperatorBetaActivationDatabaseUrl,
} from '../config/environment-validation';

export type FounderOperatorBetaActivationTransactionClient = Readonly<{
  $transaction<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
    options?: {
      maxWait?: number;
      timeout?: number;
      isolationLevel?: Prisma.TransactionIsolationLevel;
    },
  ): Promise<T>;
}>;

type ActivationPrismaClient = FounderOperatorBetaActivationTransactionClient &
  Readonly<{
    $disconnect(): Promise<void>;
  }>;

type ActivationDatabaseBinding = Readonly<{
  databaseName: string;
  requireTls: boolean;
}>;

type ActivationSessionRow = Readonly<{
  currentUser: string;
  databaseName: string;
  sessionUser: string;
  tlsActive: boolean;
  tlsVersion: string | null;
}>;

type ActivationPrismaClientFactory = (
  databaseUrl: string,
) => ActivationPrismaClient;

@Injectable()
export class FounderOperatorBetaActivationDatabaseService
  implements FounderOperatorBetaActivationTransactionClient, OnModuleDestroy
{
  private client: ActivationPrismaClient | undefined;
  private binding: ActivationDatabaseBinding | undefined;

  constructor(
    private readonly config: ConfigService,
    @Optional()
    private readonly clientFactory: ActivationPrismaClientFactory = defaultClientFactory,
  ) {}

  async $transaction<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
    options?: {
      maxWait?: number;
      timeout?: number;
      isolationLevel?: Prisma.TransactionIsolationLevel;
    },
  ): Promise<T> {
    const { binding, client } = this.databaseClient();
    return await client.$transaction(async (transaction) => {
      await this.assertSession(transaction, binding);
      return await operation(transaction);
    }, options);
  }

  async onModuleDestroy(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    this.binding = undefined;
    await client?.$disconnect();
  }

  private databaseClient(): Readonly<{
    binding: ActivationDatabaseBinding;
    client: ActivationPrismaClient;
  }> {
    if (this.client && this.binding) {
      return { binding: this.binding, client: this.client };
    }
    const databaseUrl = resolveFounderOperatorBetaActivationDatabaseUrl(
      this.config.get<unknown>('FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_URL'),
    );
    if (!databaseUrl) {
      throw activationDatabaseUnavailable(
        'FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_URL_INVALID',
      );
    }
    const primaryDatabaseUrl = this.config.get<unknown>('DATABASE_URL');
    if (
      typeof primaryDatabaseUrl === 'string' &&
      primaryDatabaseUrl.trim().length > 0
    ) {
      try {
        if (
          new URL(primaryDatabaseUrl).username ===
          FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_ROLE
        ) {
          throw activationDatabaseUnavailable(
            'FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_ROLE_REUSED',
          );
        }
      } catch (error) {
        if (error instanceof ServiceUnavailableException) throw error;
        throw activationDatabaseUnavailable(
          'FOUNDER_OPERATOR_BETA_PRIMARY_DATABASE_URL_INVALID',
        );
      }
    }
    const parsed = new URL(databaseUrl);
    let databaseName: string;
    try {
      databaseName = decodeURIComponent(parsed.pathname.slice(1));
    } catch {
      throw activationDatabaseUnavailable(
        'FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_URL_INVALID',
      );
    }
    if (!databaseName || databaseName.includes('/')) {
      throw activationDatabaseUnavailable(
        'FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_URL_INVALID',
      );
    }
    this.binding = Object.freeze({
      databaseName,
      requireTls: ['require', 'verify-full'].includes(
        parsed.searchParams.get('sslmode') ?? '',
      ),
    });
    this.client = this.clientFactory(databaseUrl);
    return { binding: this.binding, client: this.client };
  }

  private async assertSession(
    transaction: Prisma.TransactionClient,
    binding: ActivationDatabaseBinding,
  ): Promise<void> {
    let rows: ActivationSessionRow[];
    try {
      rows = await transaction.$queryRaw<ActivationSessionRow[]>(Prisma.sql`
        SELECT
          current_user::TEXT AS "currentUser",
          current_database()::TEXT AS "databaseName",
          session_user::TEXT AS "sessionUser",
          COALESCE(ssl.ssl, FALSE) AS "tlsActive",
          ssl.version::TEXT AS "tlsVersion"
        FROM (SELECT 1) AS singleton
        LEFT JOIN pg_catalog.pg_stat_ssl AS ssl
          ON ssl.pid = pg_backend_pid()
      `);
    } catch {
      throw activationDatabaseUnavailable(
        'FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_SESSION_INVALID',
      );
    }
    const row = Array.isArray(rows) ? rows[0] : undefined;
    if (
      !Array.isArray(rows) ||
      rows.length !== 1 ||
      row?.sessionUser !== FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_ROLE ||
      row.currentUser !== FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_ROLE ||
      row.databaseName !== binding.databaseName ||
      typeof row.tlsActive !== 'boolean' ||
      (binding.requireTls &&
        (row.tlsActive !== true ||
          typeof row.tlsVersion !== 'string' ||
          !['TLSv1.2', 'TLSv1.3'].includes(row.tlsVersion))) ||
      (!row.tlsActive && row.tlsVersion !== null)
    ) {
      throw activationDatabaseUnavailable(
        'FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_SESSION_INVALID',
      );
    }
  }
}

function defaultClientFactory(databaseUrl: string): ActivationPrismaClient {
  return new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: [],
  });
}

function activationDatabaseUnavailable(
  reasonCode: string,
): ServiceUnavailableException {
  return new ServiceUnavailableException({
    message: 'Founder beta activation database is unavailable',
    reasonCode,
  });
}
