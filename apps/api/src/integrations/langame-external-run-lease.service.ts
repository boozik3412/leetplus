import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type {
  LangameExternalWorkerConfig,
  LangameExternalWorkerTerminal,
} from './langame-external-daily-worker';

const INTENT_ACTION = 'LANGAME_EXTERNAL_DAILY_RUN_INTENT_V1';
const RESULT_ACTION = 'LANGAME_EXTERNAL_DAILY_RUN_RESULT_V1';
const INTENT_CONTRACT = 'LEETPLUS_LANGAME_EXTERNAL_RUN_INTENT_V1';

type Intent = {
  contract: typeof INTENT_CONTRACT;
  worker: 'langame-external-daily-worker';
  runId: string;
  mode: 'CANARY' | 'TIMER';
  businessDate: string;
  tenantId: string;
  tenantSlug: string;
  sourceId: string;
  storeId: string;
  profileRevision: number;
  executionRevision: number;
  storeRevision: number;
};

export type ExternalRunLeaseAcquisition =
  | { status: 'ACQUIRED'; intent: Intent }
  | { status: 'REPLAY'; terminal: LangameExternalWorkerTerminal };

/** Unique tenant/source/Store/day intent survives process loss and forbids blind reruns. */
@Injectable()
export class LangameExternalRunLeaseService {
  constructor(private readonly prisma: PrismaService) {}

  async acquire(
    config: LangameExternalWorkerConfig,
    businessDate: string,
  ): Promise<ExternalRunLeaseAcquisition> {
    const requestId = this.requestId(config, businessDate);
    const [intentEvent, resultEvent] = await Promise.all([
      this.find(INTENT_ACTION, config.authority.tenantId, requestId),
      this.find(RESULT_ACTION, config.authority.tenantId, requestId),
    ]);
    if (resultEvent && !intentEvent) {
      throw new ConflictException(
        'External worker result has no durable intent',
      );
    }
    if (intentEvent) {
      const prior = this.validateIntent(
        intentEvent.after,
        config,
        businessDate,
      );
      if (!resultEvent) {
        throw new ConflictException(
          'External worker intent has no terminal result; reconcile the original run before retry',
        );
      }
      const terminal = this.validateTerminal(resultEvent.after, prior);
      return {
        status: 'REPLAY',
        terminal: {
          ...terminal,
          runId: prior.runId,
          originalRunId: prior.runId,
          replayed: true,
        },
      };
    }

    const intent: Intent = {
      contract: INTENT_CONTRACT,
      worker: 'langame-external-daily-worker',
      runId: config.runId,
      mode: config.mode,
      businessDate,
      tenantId: config.authority.tenantId,
      tenantSlug: config.authority.tenantSlug,
      sourceId: config.authority.sourceId,
      storeId: config.authority.storeId,
      profileRevision: config.authority.profileRevision,
      executionRevision: config.authority.executionRevision,
      storeRevision: config.authority.storeRevision,
    };
    try {
      await this.prisma.platformAdminAuditEvent.create({
        data: {
          tenantId: intent.tenantId,
          actorUserId: null,
          requestId,
          action: INTENT_ACTION,
          targetType: 'TENANT_EXTERNAL_LANGAME_WORKER_DAY',
          targetId: intent.storeId,
          reason: 'Unique exact external Langame daily worker intent',
          after: intent,
          metadata: {
            sourceId: intent.sourceId,
            storeId: intent.storeId,
            businessDate,
            runId: intent.runId,
          },
        },
      });
    } catch {
      // A concurrent contender or database failure is not a retry permit.
      throw new ConflictException(
        'External worker intent could not be acquired; reconcile before retry',
      );
    }
    return { status: 'ACQUIRED', intent };
  }

  async complete(
    config: LangameExternalWorkerConfig,
    businessDate: string,
    terminal: LangameExternalWorkerTerminal,
  ): Promise<void> {
    const requestId = this.requestId(config, businessDate);
    const intentEvent = await this.find(
      INTENT_ACTION,
      config.authority.tenantId,
      requestId,
    );
    if (!intentEvent) {
      throw new ConflictException('External worker intent disappeared');
    }
    const intent = this.validateIntent(intentEvent.after, config, businessDate);
    if (
      terminal.runId !== intent.runId ||
      terminal.businessDate !== businessDate ||
      terminal.tenantId !== intent.tenantId ||
      terminal.tenantSlug !== intent.tenantSlug ||
      terminal.sourceId !== intent.sourceId ||
      terminal.storeId !== intent.storeId ||
      terminal.profileRevision !== intent.profileRevision ||
      terminal.executionRevision !== intent.executionRevision ||
      terminal.storeRevision !== intent.storeRevision ||
      terminal.replayed ||
      terminal.originalRunId !== null
    ) {
      throw new ConflictException(
        'External worker terminal does not bind its intent',
      );
    }
    try {
      await this.prisma.platformAdminAuditEvent.create({
        data: {
          tenantId: intent.tenantId,
          actorUserId: null,
          requestId,
          action: RESULT_ACTION,
          targetType: 'TENANT_EXTERNAL_LANGAME_WORKER_DAY',
          targetId: intent.storeId,
          reason: `External Langame daily worker ${terminal.decision}`,
          after: terminal,
          metadata: {
            intentSha256: this.digest(intent),
            runId: intent.runId,
            decision: terminal.decision,
          },
        },
      });
    } catch {
      throw new ConflictException(
        'External worker terminal is ambiguous; reconcile before retry',
      );
    }
  }

  private find(action: string, tenantId: string, requestId: string) {
    return this.prisma.platformAdminAuditEvent.findUnique({
      where: {
        tenantId_action_requestId: { tenantId, action, requestId },
      },
      select: { after: true },
    });
  }

  private requestId(config: LangameExternalWorkerConfig, businessDate: string) {
    return `external-langame-v1:${this.digest({
      tenantId: config.authority.tenantId,
      sourceId: config.authority.sourceId,
      storeId: config.authority.storeId,
      businessDate,
    })}`;
  }

  private validateIntent(
    value: Prisma.JsonValue | null,
    config: LangameExternalWorkerConfig,
    businessDate: string,
  ): Intent {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      value.contract !== INTENT_CONTRACT ||
      value.worker !== 'langame-external-daily-worker' ||
      typeof value.runId !== 'string' ||
      value.mode !== config.mode ||
      value.businessDate !== businessDate ||
      value.tenantId !== config.authority.tenantId ||
      value.tenantSlug !== config.authority.tenantSlug ||
      value.sourceId !== config.authority.sourceId ||
      value.storeId !== config.authority.storeId ||
      value.profileRevision !== config.authority.profileRevision ||
      value.executionRevision !== config.authority.executionRevision ||
      value.storeRevision !== config.authority.storeRevision
    ) {
      throw new ConflictException(
        'External worker prior intent identity drift',
      );
    }
    return value as Intent;
  }

  private validateTerminal(
    value: Prisma.JsonValue | null,
    intent: Intent,
  ): LangameExternalWorkerTerminal {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      value.contract !== 'LEETPLUS_LANGAME_EXTERNAL_WORKER_RESULT_V1' ||
      value.worker !== intent.worker ||
      value.runId !== intent.runId ||
      value.mode !== intent.mode ||
      value.businessDate !== intent.businessDate ||
      value.tenantId !== intent.tenantId ||
      value.tenantSlug !== intent.tenantSlug ||
      value.sourceId !== intent.sourceId ||
      value.storeId !== intent.storeId ||
      value.profileRevision !== intent.profileRevision ||
      value.executionRevision !== intent.executionRevision ||
      value.storeRevision !== intent.storeRevision ||
      value.replayed !== false ||
      value.originalRunId !== null ||
      (value.decision !== 'SUCCESS' &&
        value.decision !== 'PARTIAL' &&
        value.decision !== 'FAILED') ||
      !Array.isArray(value.partialScopes) ||
      !Array.isArray(value.failedScopes) ||
      !value.partialScopes.every((scope) => typeof scope === 'string') ||
      !value.failedScopes.every((scope) => typeof scope === 'string') ||
      (value.decision === 'SUCCESS' &&
        (value.partialScopes.length > 0 || value.failedScopes.length > 0)) ||
      (value.decision === 'PARTIAL' &&
        (value.partialScopes.length === 0 || value.failedScopes.length > 0)) ||
      (value.decision === 'FAILED' && value.failedScopes.length === 0)
    ) {
      throw new ConflictException(
        'External worker prior terminal identity drift',
      );
    }
    return value as LangameExternalWorkerTerminal;
  }

  private digest(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
}
