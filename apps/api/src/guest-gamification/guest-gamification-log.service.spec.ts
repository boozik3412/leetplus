import { UserRole } from '@prisma/client';
import { evaluateGuestGameLedgerRule } from './guest-game-rule-evaluator';
import {
  GuestGamificationLogService,
  includesCorrelation,
} from './guest-gamification-log.service';

describe('includesCorrelation', () => {
  it('finds explicit and nested correlation identifiers case-insensitively', () => {
    expect(
      includesCorrelation(
        {
          evaluationRunId: 'RUN-ABC-123',
          payload: { sessionExternalId: 'session-42' },
        },
        'run-abc',
      ),
    ).toBe(true);
    expect(
      includesCorrelation(
        { payload: { sessionExternalId: 'session-42' } },
        'session-42',
      ),
    ).toBe(true);
    expect(includesCorrelation({ traceId: 'trace-1' }, 'missing')).toBe(false);
  });
});

describe('evaluateLedgerRule', () => {
  const rule = {
    type: 'LOOT_BOX',
    id: 'weekend-box',
    title: 'КЕЙС «WEEKEND»',
    triggerKind: 'SESSION_START',
    sessionType: 'packet_hours',
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    activatedAt: new Date('2026-07-01T00:00:00.000Z'),
    periodFrom: null,
    periodTo: null,
    periodRules: {
      weekdayMode: 'WEEKENDS',
      weekdays: [0, 6],
      hours: [],
    },
    storeIds: ['store-1'],
    progressTarget: null,
    progressUnit: null,
  };

  const fact = (happenedAt: string) => ({
    id: `fact-${happenedAt}`,
    factType: 'PACKAGE_OR_SUBSCRIPTION_USED',
    confidence: 'EXACT',
    happenedAt: new Date(happenedAt),
    createdAt: new Date(happenedAt),
    storeId: 'store-1',
    tariffName: null,
    tariffType: 'package_or_subscription',
    amount: null,
    durationMinutes: null,
    evidence: null,
    store: { timeZone: 'Asia/Yekaterinburg' },
  });

  it('blocks a weekend rule when the matching package fact happened on Friday', () => {
    const result = evaluateGuestGameLedgerRule(
      rule,
      [fact('2026-07-10T12:00:00.000Z')],
      'store-1',
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.reason).toContain('день недели');
  });

  it('matches a weekend rule when the package fact happened on Saturday', () => {
    const result = evaluateGuestGameLedgerRule(
      rule,
      [fact('2026-07-11T12:00:00.000Z')],
      'store-1',
    );

    expect(result.status).toBe('MATCHED');
    expect(result.facts).toHaveLength(1);
  });

  it('does not reuse a fact created before rule activation', () => {
    const result = evaluateGuestGameLedgerRule(
      rule,
      [fact('2026-06-27T12:00:00.000Z')],
      'store-1',
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.reason).toContain('до активации');
  });
});

describe('GuestGamificationLogService binding recovery', () => {
  const user = {
    id: 'user-1',
    email: 'owner@example.com',
    fullName: 'Owner',
    role: UserRole.OWNER,
    isPlatformAdmin: false,
    tenantId: 'tenant-1',
    tenantSlug: 'tenant',
  };

  function createService(linkedProfileId: string | null = null) {
    const profileUpdate = jest.fn().mockResolvedValue({});
    const auditCreate = jest.fn().mockResolvedValue({});
    const prisma = {
      guestGameProfile: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'profile-1',
          guestId: 'guest-stale',
          phoneHash: 'phone-hash',
          contactMasked: '***6330',
        }),
        update: profileUpdate,
      },
      guestActivitySyncState: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'state-1',
          status: 'STALE_BINDING',
          storeId: 'store-1',
          externalDomain: 'old.langame',
          externalGuestId: 'old-guest',
        }),
      },
      guest: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'guest-current',
          externalDomain: 'current.langame',
          externalGuestId: 'current-guest',
          phoneMasked: '***6330',
          gameProfiles: linkedProfileId ? [{ id: linkedProfileId }] : [],
        }),
      },
      guestGameAuditEvent: { create: auditCreate },
      $transaction: jest
        .fn()
        .mockImplementation((operations: Array<Promise<unknown>>) =>
          Promise.all(operations),
        ),
    };
    const ledger = { scheduleProfileSync: jest.fn() };
    return {
      service: new GuestGamificationLogService(
        prisma as never,
        ledger as never,
      ),
      prisma,
      ledger,
      profileUpdate,
      auditCreate,
    };
  }

  it('relinks an explicitly selected same-phone Langame guest and audits it', async () => {
    const { service, ledger, profileUpdate, auditCreate } = createService();

    const result = await service.relinkProfile(
      user,
      'profile-1',
      'guest-current',
    );

    expect(result).toMatchObject({ relinked: true, syncQueued: true });
    expect(profileUpdate).toHaveBeenCalledWith({
      where: { id: 'profile-1' },
      data: { guestId: 'guest-current', contactMasked: '***6330' },
    });
    expect(auditCreate).toHaveBeenCalledWith({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: expect.objectContaining({
        action: 'LANGAME_BINDING_RELINKED',
        status: 'SUCCESS',
      }),
    });
    expect(ledger.scheduleProfileSync).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: 'profile-1',
        guestId: 'guest-current',
        reason: 'STALE_BINDING_RELINKED',
      }),
    );
  });

  it('rejects a candidate already linked to another game profile', async () => {
    const { service } = createService('profile-2');

    await expect(
      service.relinkProfile(user, 'profile-1', 'guest-current'),
    ).rejects.toThrow('уже связан с другим игровым профилем');
  });
});
