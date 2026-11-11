import { Prisma } from '@prisma/client';
import { remediateLegacyGenericSessionClassifications } from './guest-game-generic-session-remediation';

function captureCandidateSql() {
  const queries: Prisma.Sql[] = [];
  const prisma = {
    $queryRaw: jest.fn((query: Prisma.Sql) => {
      queries.push(query);
      return Promise.resolve([]);
    }),
  };
  return { prisma, queries };
}

describe('legacy generic session remediation candidates', () => {
  it('probes every proof by an exact key instead of scanning per event', async () => {
    const { prisma, queries } = captureCandidateSql();

    const result = await remediateLegacyGenericSessionClassifications(
      prisma as never,
      {
        tenantId: 'tenant-1',
        limit: 100,
        includeSessionStart: true,
        includePlayTime: true,
      },
    );

    expect(result).toMatchObject({ scanned: 0, complete: true });
    expect(queries).toHaveLength(1);
    const sql = queries[0].sql;
    expect(queries[0].values).toEqual([
      'tenant-1',
      'SESSION_START',
      'PLAY_HOUR',
      101,
    ]);
    // GuestSession by primary key for "session:<id>:start|:play" proofs.
    expect(sql).toContain('WHERE session."id" = SUBSTRING(');
    // GuestSession by its unique key, NULL provider/domain spelled out.
    expect(sql).toContain('AND session."externalProvider" IS NULL');
    expect(sql).toContain('AND session."externalDomain" IS NULL');
    // GuestActivityFact by primary key, superseded facts by primary key too.
    expect(sql).toContain('WHERE fact."id" = event."sourceFactId"');
    expect(sql).toContain('WHERE candidate."id" = event."sourceFactId"');
    // The old shape correlated GuestSession on COALESCE(payload) per event.
    expect(sql).not.toContain(`session."externalSessionId" = COALESCE(`);
    expect(sql).not.toContain(`fact."sessionExternalId" = COALESCE(`);
  });

  it('skips the query when no event type is requested', async () => {
    const { prisma, queries } = captureCandidateSql();

    const result = await remediateLegacyGenericSessionClassifications(
      prisma as never,
      {
        tenantId: 'tenant-1',
        limit: 100,
        includeSessionStart: false,
        includePlayTime: false,
      },
    );

    expect(result.complete).toBe(true);
    expect(queries).toHaveLength(0);
  });
});
