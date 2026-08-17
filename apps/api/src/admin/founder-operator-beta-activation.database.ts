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

type ActivationPrismaClientFactory = (
  databaseUrl: string,
) => ActivationPrismaClient;

@Injectable()
export class FounderOperatorBetaActivationDatabaseService
  implements FounderOperatorBetaActivationTransactionClient, OnModuleDestroy
{
  private client: ActivationPrismaClient | undefined;

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
    return await this.databaseClient().$transaction(operation, options);
  }

  async onModuleDestroy(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    await client?.$disconnect();
  }

  private databaseClient(): ActivationPrismaClient {
    if (this.client) return this.client;
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
    this.client = this.clientFactory(databaseUrl);
    return this.client;
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
