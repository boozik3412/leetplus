import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { isProductionConfig } from '../config/environment-validation';
import { FreshStoreScopeService } from '../tenancy/fresh-store-scope.service';
import {
  serializeLangameInitialSyncPlanCurrent191,
  type LangameInitialSyncPlanCurrent191,
} from './langame-initial-sync-plan-current191';

const CURRENT192_ENABLED_ENV =
  'LANGAME_INITIAL_SYNC_EXECUTION_CURRENT192_ENABLED';
const ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;

export const LANGAME_INITIAL_SYNC_CURRENT192_DATABASE = Symbol(
  'LANGAME_INITIAL_SYNC_CURRENT192_DATABASE',
);

export interface LangameInitialSyncCurrent192Database {
  queryCurrent192(query: Prisma.Sql): Promise<unknown>;
}

export type LangameInitialSyncExecutionCurrent192Dto = Readonly<{
  executionId?: string;
  approvalId?: string;
  claimRequestId?: string;
  claimRequestDigest?: string;
  claimToken?: string;
  executionRequestId?: string;
  executionRequestDigest?: string;
  plan?: LangameInitialSyncPlanCurrent191;
}>;

type ClaimReceipt = Readonly<{
  executionId: string;
  status: 'CLAIMED' | 'COMPLETED' | 'EXPIRED';
  leaseExpiresAt: Date;
  planDigest: string;
  replayed: boolean;
}>;

type ExecutionReceipt = Readonly<{
  executionId: string;
  status: 'COMPLETED';
  snapshotDate: Date;
  productsCount: number;
  inventoryCount: number;
  resultDigest: string;
  replayed: boolean;
}>;

type ReconciliationReceipt = Readonly<{
  executionId: string;
  status: 'CLAIMED' | 'COMPLETED' | 'EXPIRED';
  productsCount: number;
  inventoryCount: number;
  resultDigest: string | null;
  businessWritesCommitted: boolean;
}>;

@Injectable()
export class LangameInitialSyncExecutionCurrent192Coordinator {
  constructor(
    @Inject(LANGAME_INITIAL_SYNC_CURRENT192_DATABASE)
    private readonly database: LangameInitialSyncCurrent192Database,
    private readonly freshStoreScopeService: FreshStoreScopeService,
    private readonly configService: ConfigService,
  ) {}

  async execute(
    user: AuthenticatedUser,
    dto: LangameInitialSyncExecutionCurrent192Dto,
  ) {
    const scope = await this.freshStoreScopeService.assertNetwork(user);
    this.requireConfiguration();
    const executionId = this.requiredId(dto.executionId, 'execution id');
    const approvalId = this.requiredId(dto.approvalId, 'approval id');
    const claimRequestId = this.requiredId(
      dto.claimRequestId,
      'claim request id',
    );
    const claimRequestDigest = this.requiredDigest(
      dto.claimRequestDigest,
      'claim request digest',
    );
    const claimToken = this.requiredToken(dto.claimToken);
    const executionRequestId = this.requiredId(
      dto.executionRequestId,
      'execution request id',
    );
    const executionRequestDigest = this.requiredDigest(
      dto.executionRequestDigest,
      'execution request digest',
    );
    if (claimRequestId === executionRequestId) {
      throw new BadRequestException(
        'CURRENT192 claim and execution requests must be independent',
      );
    }
    if (!dto.plan) {
      throw new BadRequestException('CURRENT192 initial sync plan is required');
    }
    const canonicalPlan = serializeLangameInitialSyncPlanCurrent191(dto.plan);
    if (dto.plan.target.tenantId !== scope.tenantId) {
      throw new BadRequestException('CURRENT192 initial sync target mismatch');
    }

    const claim = await this.claimWithExactReplay({
      executionId,
      tenantId: scope.tenantId,
      actorUserId: scope.userId,
      approvalId,
      claimRequestId,
      claimRequestDigest,
      claimToken,
      planDigest: dto.plan.planDigest,
    });
    if (claim.status === 'EXPIRED') {
      throw new ServiceUnavailableException(
        'CURRENT192 initial sync execution claim expired',
      );
    }

    const freshScope = await this.freshStoreScopeService.assertNetwork(user);
    if (
      freshScope.tenantId !== scope.tenantId ||
      freshScope.userId !== scope.userId
    ) {
      throw new ServiceUnavailableException(
        'CURRENT192 initial sync authority changed before execution',
      );
    }

    const request = {
      tenantId: scope.tenantId,
      actorUserId: scope.userId,
      executionId,
      claimToken,
      executionRequestId,
      executionRequestDigest,
      canonicalPlan,
    } as const;
    try {
      return this.safeResult(await this.executeOnce(request), false);
    } catch {
      const firstReconciliation = await this.reconcileOnce({
        tenantId: scope.tenantId,
        executionId,
        claimToken,
        planDigest: dto.plan.planDigest,
      });
      if (firstReconciliation.businessWritesCommitted) {
        return this.safeReconciledResult(firstReconciliation);
      }
      if (firstReconciliation.status !== 'CLAIMED') {
        throw new ServiceUnavailableException(
          'CURRENT192 initial sync execution is unavailable',
        );
      }

      // A CLAIMED receipt proves the first transaction did not commit its
      // business writes. One exact retry is therefore safe.
      try {
        return this.safeResult(await this.executeOnce(request), true);
      } catch {
        const finalReconciliation = await this.reconcileOnce({
          tenantId: scope.tenantId,
          executionId,
          claimToken,
          planDigest: dto.plan.planDigest,
        });
        if (finalReconciliation.businessWritesCommitted) {
          return this.safeReconciledResult(finalReconciliation);
        }
        throw new ServiceUnavailableException(
          'CURRENT192 initial sync execution requires operator review',
        );
      }
    }
  }

  private async claimWithExactReplay(input: {
    executionId: string;
    tenantId: string;
    actorUserId: string;
    approvalId: string;
    claimRequestId: string;
    claimRequestDigest: string;
    claimToken: string;
    planDigest: string;
  }) {
    try {
      return await this.claimOnce(input);
    } catch {
      try {
        return await this.claimOnce(input);
      } catch {
        throw new ServiceUnavailableException(
          'CURRENT192 initial sync execution claim is unavailable',
        );
      }
    }
  }

  private async claimOnce(input: {
    executionId: string;
    tenantId: string;
    actorUserId: string;
    approvalId: string;
    claimRequestId: string;
    claimRequestDigest: string;
    claimToken: string;
    planDigest: string;
  }) {
    const rows = await this.database.queryCurrent192(
      Prisma.sql`
        SELECT * FROM public.langame_initial_sync_claim_current192_v1(
          ${input.executionId}, ${input.tenantId}, ${input.actorUserId},
          ${input.approvalId}, ${input.claimRequestId},
          ${input.claimRequestDigest}, ${input.claimToken}, ${input.planDigest}
        )
      `,
    );
    return this.parseClaim(rows);
  }

  private async executeOnce(input: {
    tenantId: string;
    actorUserId: string;
    executionId: string;
    claimToken: string;
    executionRequestId: string;
    executionRequestDigest: string;
    canonicalPlan: string;
  }) {
    const rows = await this.database.queryCurrent192(
      Prisma.sql`
        SELECT * FROM public.langame_initial_sync_execute_current192_v1(
          ${input.tenantId}, ${input.actorUserId}, ${input.executionId},
          ${input.claimToken}, ${input.executionRequestId},
          ${input.executionRequestDigest}, ${input.canonicalPlan}
        )
      `,
    );
    return this.parseExecution(rows);
  }

  private async reconcileOnce(input: {
    tenantId: string;
    executionId: string;
    claimToken: string;
    planDigest: string;
  }) {
    let rows: unknown;
    try {
      rows = await this.database.queryCurrent192(
        Prisma.sql`
          SELECT * FROM public.langame_initial_sync_reconcile_current192_v1(
            ${input.tenantId}, ${input.executionId}, ${input.claimToken},
            ${input.planDigest}
          )
        `,
      );
    } catch {
      throw new ServiceUnavailableException(
        'CURRENT192 initial sync reconciliation is unavailable',
      );
    }
    return this.parseReconciliation(rows);
  }

  private parseClaim(value: unknown): ClaimReceipt {
    const row = this.singlePlainRow(value, [
      'executionId',
      'leaseExpiresAt',
      'planDigest',
      'replayed',
      'status',
    ]);
    if (
      !this.isId(row.executionId) ||
      !this.isDate(row.leaseExpiresAt) ||
      typeof row.planDigest !== 'string' ||
      !DIGEST_PATTERN.test(row.planDigest) ||
      typeof row.replayed !== 'boolean' ||
      !['CLAIMED', 'COMPLETED', 'EXPIRED'].includes(String(row.status))
    ) {
      throw new ServiceUnavailableException('Invalid CURRENT192 claim receipt');
    }
    return row as ClaimReceipt;
  }

  private parseExecution(value: unknown): ExecutionReceipt {
    const row = this.singlePlainRow(value, [
      'executionId',
      'inventoryCount',
      'productsCount',
      'replayed',
      'resultDigest',
      'snapshotDate',
      'status',
    ]);
    if (
      !this.isId(row.executionId) ||
      row.status !== 'COMPLETED' ||
      !this.isDate(row.snapshotDate) ||
      !this.isCount(row.productsCount) ||
      !this.isCount(row.inventoryCount) ||
      typeof row.resultDigest !== 'string' ||
      !DIGEST_PATTERN.test(row.resultDigest) ||
      typeof row.replayed !== 'boolean'
    ) {
      throw new ServiceUnavailableException(
        'Invalid CURRENT192 execution receipt',
      );
    }
    return row as ExecutionReceipt;
  }

  private parseReconciliation(value: unknown): ReconciliationReceipt {
    const row = this.singlePlainRow(value, [
      'businessWritesCommitted',
      'executionId',
      'inventoryCount',
      'productsCount',
      'resultDigest',
      'status',
    ]);
    const status = String(row.status);
    if (
      !this.isId(row.executionId) ||
      !['CLAIMED', 'COMPLETED', 'EXPIRED'].includes(status) ||
      !this.isCount(row.productsCount) ||
      !this.isCount(row.inventoryCount) ||
      typeof row.businessWritesCommitted !== 'boolean' ||
      (status === 'COMPLETED') !== row.businessWritesCommitted ||
      (status === 'COMPLETED'
        ? typeof row.resultDigest !== 'string' ||
          !DIGEST_PATTERN.test(row.resultDigest)
        : row.resultDigest !== null)
    ) {
      throw new ServiceUnavailableException(
        'Invalid CURRENT192 reconciliation receipt',
      );
    }
    return row as ReconciliationReceipt;
  }

  private safeResult(receipt: ExecutionReceipt, retried: boolean) {
    return Object.freeze({
      contractVersion: 'LANGAME_INITIAL_SYNC_EXECUTION_CURRENT192_V1' as const,
      status: 'COMPLETED' as const,
      executionId: receipt.executionId,
      snapshotDate: receipt.snapshotDate.toISOString(),
      productsCount: receipt.productsCount,
      inventoryCount: receipt.inventoryCount,
      resultDigest: receipt.resultDigest,
      replayed: receipt.replayed,
      reconciled: false as const,
      retried,
      providerWritesStarted: false as const,
      productionExecutionAllowed: false as const,
    });
  }

  private safeReconciledResult(receipt: ReconciliationReceipt) {
    if (receipt.status !== 'COMPLETED' || receipt.resultDigest === null) {
      throw new ServiceUnavailableException(
        'Invalid CURRENT192 terminal reconciliation',
      );
    }
    return Object.freeze({
      contractVersion: 'LANGAME_INITIAL_SYNC_EXECUTION_CURRENT192_V1' as const,
      status: 'COMPLETED' as const,
      executionId: receipt.executionId,
      snapshotDate: null,
      productsCount: receipt.productsCount,
      inventoryCount: receipt.inventoryCount,
      resultDigest: receipt.resultDigest,
      replayed: true as const,
      reconciled: true as const,
      retried: false as const,
      providerWritesStarted: false as const,
      productionExecutionAllowed: false as const,
    });
  }

  private singlePlainRow(value: unknown, expectedKeys: readonly string[]) {
    if (!Array.isArray(value) || value.length !== 1) {
      throw new ServiceUnavailableException(
        'Invalid CURRENT192 database receipt',
      );
    }
    const row: unknown = value[0];
    if (
      typeof row !== 'object' ||
      row === null ||
      Array.isArray(row) ||
      Object.getPrototypeOf(row) !== Object.prototype ||
      Reflect.ownKeys(row).some((key) => typeof key !== 'string') ||
      Object.values(Object.getOwnPropertyDescriptors(row)).some(
        (descriptor) => !('value' in descriptor),
      ) ||
      Object.keys(row).sort().join('|') !== [...expectedKeys].sort().join('|')
    ) {
      throw new ServiceUnavailableException(
        'Invalid CURRENT192 database receipt',
      );
    }
    return row as Record<string, unknown>;
  }

  private requireConfiguration() {
    if (isProductionConfig(this.configService)) {
      throw new ServiceUnavailableException(
        'CURRENT192 initial sync execution is not production-authorized',
      );
    }
    if (this.configService.get<string>(CURRENT192_ENABLED_ENV) !== 'true') {
      throw new ServiceUnavailableException(
        'CURRENT192 initial sync execution is disabled',
      );
    }
  }

  private requiredId(value: unknown, label: string) {
    if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
      throw new BadRequestException(`Invalid CURRENT192 ${label}`);
    }
    return value;
  }

  private requiredDigest(value: unknown, label: string) {
    if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) {
      throw new BadRequestException(`Invalid CURRENT192 ${label}`);
    }
    return value;
  }

  private requiredToken(value: unknown) {
    if (typeof value !== 'string' || !TOKEN_PATTERN.test(value)) {
      throw new BadRequestException('Invalid CURRENT192 claim token');
    }
    return value;
  }

  private isId(value: unknown) {
    return typeof value === 'string' && ID_PATTERN.test(value);
  }

  private isDate(value: unknown): value is Date {
    return value instanceof Date && Number.isFinite(value.getTime());
  }

  private isCount(value: unknown): value is number {
    return (
      Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 50000
    );
  }
}
