import type { PrismaService } from '../prisma/prisma.service';
import {
  externalWorkerTerminal,
  loadLangameExternalWorkerConfig,
} from './langame-external-daily-worker';
import { LangameExternalRunLeaseService } from './langame-external-run-lease.service';

const env = () => ({
  LANGAME_EXTERNAL_WORKER_ENABLED: 'true',
  LANGAME_EXTERNAL_WORKER_LIVE: 'true',
  LANGAME_EXTERNAL_WORKER_MODE: 'TIMER',
  LANGAME_EXTERNAL_WORKER_TENANT_ID: '8cc79086-ed43-44fa-83d3-20207ec48758',
  LANGAME_EXTERNAL_WORKER_TENANT_SLUG: 'set-1',
  LANGAME_EXTERNAL_WORKER_SOURCE_ID: '94a3842b-847e-4c4d-89b0-7cb8976a9f17',
  LANGAME_EXTERNAL_WORKER_STORE_ID: 'ecee16ef-f0cb-4307-b079-e2f0303c3a16',
  LANGAME_EXTERNAL_WORKER_DOMAIN: '1171.langame.ru',
  LANGAME_EXTERNAL_WORKER_CLUB_ID: '1',
  LANGAME_EXTERNAL_WORKER_EXECUTION_REVISION: '3',
  LANGAME_EXTERNAL_WORKER_PROFILE_REVISION: '2',
  LANGAME_EXTERNAL_WORKER_STORE_REVISION: '0',
  LANGAME_EXTERNAL_WORKER_RUN_ID: '528948b2-6840-4ad0-9854-7993fedbe8df',
  LANGAME_EXTERNAL_WORKER_BUSINESS_DATE: '2026-09-26',
  LANGAME_EXTERNAL_WORKER_CUSTOMER_STAGE: 'LIVE',
  LANGAME_DAILY_SYNC_SCHEDULER_ENABLED: 'false',
  LANGAME_SCHEDULED_HTTP_ENABLED: 'false',
  GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED: 'false',
});

type CreateData = {
  tenantId: string;
  action: string;
  requestId: string;
  after: unknown;
};

function fixture() {
  const rows = new Map<string, { after: unknown }>();
  const prisma = {
    platformAdminAuditEvent: {
      findUnique: jest.fn(
        ({
          where,
        }: {
          where: { tenantId_action_requestId: Omit<CreateData, 'after'> };
        }) => {
          const { tenantId, action, requestId } =
            where.tenantId_action_requestId;
          return Promise.resolve(
            rows.get(`${tenantId}:${action}:${requestId}`) ?? null,
          );
        },
      ),
      create: jest.fn(({ data }: { data: CreateData }) => {
        const key = `${data.tenantId}:${data.action}:${data.requestId}`;
        if (rows.has(key)) return Promise.reject(new Error('unique violation'));
        rows.set(key, { after: data.after });
        return Promise.resolve({ id: key });
      }),
    },
    $transaction: jest.fn(),
  };
  const service = new LangameExternalRunLeaseService(
    prisma as unknown as PrismaService,
  );
  const config = loadLangameExternalWorkerConfig(env());
  return { service, prisma, rows, config };
}

describe('external daily durable once-only lease', () => {
  it('lets only one concurrent tenant/source/Store/day contender acquire', async () => {
    const subject = fixture();
    const results = await Promise.allSettled([
      subject.service.acquire(subject.config, '2026-09-26'),
      subject.service.acquire(subject.config, '2026-09-26'),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(subject.rows.size).toBe(1);
    expect(subject.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('holds an intent-only run instead of retrying after a lost process', async () => {
    const subject = fixture();
    await subject.service.acquire(subject.config, '2026-09-26');
    await expect(
      subject.service.acquire(subject.config, '2026-09-26'),
    ).rejects.toThrow('reconcile');
    expect(subject.rows.size).toBe(1);
    await expect(
      subject.service.acquire(subject.config, '2026-09-27'),
    ).resolves.toMatchObject({ status: 'ACQUIRED' });
    expect(subject.rows.size).toBe(2);
  });

  it('replays the original terminal identity without claiming another effect', async () => {
    const subject = fixture();
    await subject.service.acquire(subject.config, '2026-09-26');
    const terminal = externalWorkerTerminal(subject.config, '2026-09-26');
    await subject.service.complete(subject.config, '2026-09-26', terminal);
    const next = loadLangameExternalWorkerConfig({
      ...env(),
      LANGAME_EXTERNAL_WORKER_RUN_ID: '8889ce82-594f-47c0-acbb-a10b52c867dd',
    });
    await expect(
      subject.service.acquire(next, '2026-09-26'),
    ).resolves.toMatchObject({
      status: 'REPLAY',
      terminal: {
        runId: subject.config.runId,
        originalRunId: subject.config.runId,
        replayed: true,
      },
    });
    expect(subject.rows.size).toBe(2);
    expect(subject.prisma.platformAdminAuditEvent.create).toHaveBeenCalledTimes(
      2,
    );
  });

  it('rejects revision drift and terminal payload from a foreign Store', async () => {
    const subject = fixture();
    await subject.service.acquire(subject.config, '2026-09-26');
    const terminal = externalWorkerTerminal(subject.config, '2026-09-26');
    await expect(
      subject.service.complete(subject.config, '2026-09-26', {
        ...terminal,
        storeId: 'foreign-store',
      }),
    ).rejects.toThrow('does not bind');
    const revised = loadLangameExternalWorkerConfig({
      ...env(),
      LANGAME_EXTERNAL_WORKER_EXECUTION_REVISION: '4',
    });
    await expect(
      subject.service.acquire(revised, '2026-09-26'),
    ).rejects.toThrow('identity drift');
    expect(subject.rows.size).toBe(1);
  });
});
