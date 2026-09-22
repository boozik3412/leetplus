/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { ForbiddenException, ConflictException } from '@nestjs/common';
import {
  C61BudgetRefillExceptionService,
  ServerC61BudgetRefillAttestationAuthority,
  type C61BudgetRefillAttestation,
} from './c61-budget-refill-exception.service';

const attestation = (
  status: 'APPROVED' | 'REVOKED' = 'APPROVED',
): C61BudgetRefillAttestation => ({
  status,
  ownerEvidenceDigest: 'sha256:test',
  ownerEvidenceAt: '2026-09-21T00:00:00.000Z',
  ticketId: 'ticket',
  ticketNumber: 'LP-BUG-C61',
  frontEndExcludedTicketId: 'fe',
  profileId: 'profile',
  guestId: 'guest',
  storeId: 'store',
  factId: 'fact',
  eventId: 'event',
  ruleId: 'rule',
  sourceLocalDate: '2026-09-20',
  sessionExternalId: '553209',
  rewardLabel: 'WEEKEND',
  reason: 'C61',
  blockedDecisionIds: ['decision'],
  approval: 'BUDGET_REFILL_ONLY_NO_XP_NO_BONUS',
});
const user = {
  id: 'operator',
  tenantId: 'tenant',
  isPlatformAdmin: true,
  platformTenantContext: true,
} as any;
function client(
  existing: string | null = null,
  daily = 0,
  mismatch = false,
  pending = 0,
) {
  const findUnique = jest.fn(({ where }: any) => {
    if (where.ticketNumber)
      return Promise.resolve(
        mismatch
          ? null
          : {
              id: 'ticket',
              tenantId: 'tenant',
              profileId: 'profile',
              guestId: 'guest',
              storeId: 'store',
              status: 'NEW',
            },
      );
    if (where.id === 'fact')
      return Promise.resolve({
        tenantId: 'tenant',
        profileId: 'profile',
        guestId: 'guest',
        storeId: 'store',
        factType: 'PACKAGE_OR_SUBSCRIPTION_USED',
        lifecycleStatus: 'ACTIVE',
        confidence: 'EXACT',
        sessionExternalId: '553209',
      });
    if (where.id === 'event')
      return Promise.resolve({
        tenantId: 'tenant',
        profileId: 'profile',
        guestId: 'guest',
        externalId: 'guest-game:GUEST_SESSION:SESSION_START:553209',
        eventType: 'SESSION_START',
      });
    if (where.id === 'rule')
      return Promise.resolve({
        tenantId: 'tenant',
        status: 'ACTIVE',
        triggerKind: 'SESSION_START',
        sessionType: 'packet_hours',
      });
    if (where.id === 'fe')
      return Promise.resolve({ tenantId: 'tenant', profileId: 'profile' });
    return Promise.resolve(existing ? { id: existing } : null);
  });
  return {
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn((query: any) => {
      const sql = query.strings?.join(' ') ?? '';
      if (sql.includes('GuestSupportTicket'))
        return Promise.resolve([{ id: 'ticket' }]);
      if (sql.includes('GuestGameRuleDecision'))
        return Promise.resolve([{ id: 'decision' }]);
      if (sql.includes('GuestGameEvent'))
        return Promise.resolve([
          { occurredAt: new Date('2026-09-20T13:20:00.000Z'), timeZone: 'UTC' },
        ]);
      return Promise.resolve([]);
    }),
    guestSupportTicket: { findUnique },
    guestActivityFact: { findUnique },
    guestGameEvent: { findUnique },
    guestGameLootBox: { findUnique },
    guestGameEntitlement: {
      findUnique,
      count: jest.fn().mockResolvedValueOnce(daily).mockResolvedValue(pending),
      create: jest.fn().mockResolvedValue({ id: 'entitlement' }),
    },
    guestGameOriginReceipt: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ id: 'receipt' }),
    },
    guestGameRewardWalletItem: { create: jest.fn() },
    guestGameAuditEvent: { create: jest.fn() },
    guestGameRuleDecision: {
      findMany: jest.fn().mockResolvedValue([{ id: 'decision' }]),
    },
  } as any;
}
describe('C61BudgetRefillExceptionService', () => {
  it('fails closed without a valid offline signed approval envelope', () => {
    const old = process.env.C61_OWNER_APPROVAL_PUBLIC_KEY_PEM;
    delete process.env.C61_OWNER_APPROVAL_PUBLIC_KEY_PEM;
    expect(() => new ServerC61BudgetRefillAttestationAuthority().get()).toThrow(
      ForbiddenException,
    );
    if (old) process.env.C61_OWNER_APPROVAL_PUBLIC_KEY_PEM = old;
  });
  it('is read-only in preview and rejects revoked or mismatched authority', async () => {
    const db = client();
    const service = new C61BudgetRefillExceptionService(
      { ...db, $transaction: jest.fn() } as any,
      { get: () => attestation() },
    );
    await expect(service.preview(user)).resolves.toMatchObject({
      mode: 'PREVIEW',
      outcome: 'READY',
    });
    expect(db.guestGameRuleDecision.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['decision'] },
        tenantId: 'tenant',
        profileId: 'profile',
        ruleId: 'rule',
        sourceFactId: '553209',
        status: 'BLOCKED',
      },
      select: { id: true },
    });
    expect(db.guestGameEntitlement.create).not.toHaveBeenCalled();
    await expect(
      new C61BudgetRefillExceptionService(
        { ...db, $transaction: jest.fn() } as any,
        { get: () => attestation('REVOKED') },
      ).preview(user),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      new C61BudgetRefillExceptionService(
        { ...client(null, 0, true), $transaction: jest.fn() } as any,
        { get: () => attestation() },
      ).preview(user),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('creates exactly one entitlement, wallet and audit, never a reward, XP or decision', async () => {
    const tx = client();
    const prisma = { ...tx, $transaction: jest.fn((fn: any) => fn(tx)) } as any;
    const service = new C61BudgetRefillExceptionService(prisma, {
      get: () => attestation(),
    });
    const preview = await service.preview(user);
    await expect(
      service.apply(user, {
        expectedDigest: preview.digest,
        confirmation: 'APPLY_C61_BUDGET_REFILL_EXCEPTION',
      }),
    ).resolves.toMatchObject({
      outcome: 'APPLIED',
      entitlementId: 'entitlement',
    });
    expect(tx.guestGameEntitlement.create).toHaveBeenCalledTimes(1);
    expect(tx.guestGameRewardWalletItem.create).toHaveBeenCalledTimes(1);
    const walletCreate = tx.guestGameRewardWalletItem.create.mock.calls[0][0];
    expect(walletCreate.data).toMatchObject({
      entitlementId: 'entitlement',
      kind: 'LOOT_BOX_ENTITLEMENT',
    });
    expect(walletCreate.data).not.toHaveProperty('eventId');
    expect(tx.guestGameAuditEvent.create).toHaveBeenCalledTimes(1);
    expect((tx as any).guestGameReward).toBeUndefined();
    expect((tx as any).guestGameXpPosting).toBeUndefined();
    expect(tx.guestGameRuleDecision.findMany).toHaveBeenCalledTimes(2);
  });
  it('fails closed for daily occupancy and is idempotent for repeat/concurrent reconciliation', async () => {
    const occupied = client(null, 1);
    const occupiedService = new C61BudgetRefillExceptionService(
      { ...occupied, $transaction: jest.fn((fn: any) => fn(occupied)) } as any,
      { get: () => attestation() },
    );
    const preview = await occupiedService.preview(user);
    await expect(
      occupiedService.apply(user, {
        expectedDigest: preview.digest,
        confirmation: 'APPLY_C61_BUDGET_REFILL_EXCEPTION',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    const prior = client('already');
    const repeat = new C61BudgetRefillExceptionService(
      { ...prior, $transaction: jest.fn((fn: any) => fn(prior)) } as any,
      { get: () => attestation() },
    );
    const p = await repeat.preview(user);
    await expect(
      repeat.apply(user, {
        expectedDigest: p.digest,
        confirmation: 'APPLY_C61_BUDGET_REFILL_EXCEPTION',
      }),
    ).resolves.toMatchObject({
      outcome: 'IDEMPOTENT',
      entitlementId: 'already',
    });
    expect(prior.guestGameEntitlement.create).not.toHaveBeenCalled();
  });
  it('distinguishes current-day daily occupancy from an earlier pending entitlement', async () => {
    const tx = client(null, 0, false, 1);
    const service = new C61BudgetRefillExceptionService(
      { ...tx, $transaction: jest.fn((fn: any) => fn(tx)) } as any,
      { get: () => attestation() },
    );
    const preview = await service.preview(user);
    await expect(
      service.apply(user, {
        expectedDigest: preview.digest,
        confirmation: 'APPLY_C61_BUDGET_REFILL_EXCEPTION',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.guestGameEntitlement.create).not.toHaveBeenCalled();
  });

  it('aborts before entitlement creation on a conflicting origin receipt', async () => {
    const tx = client();
    tx.guestGameOriginReceipt.findUnique.mockResolvedValue({
      factId: 'other',
      eventId: 'event',
      eventType: 'SESSION_START',
      externalDomain: '46.langamepro.ru',
      policy: 'SUPPORT_BUDGET_REFILL_EXCEPTION_V1',
      status: 'PROCESSED',
      claimedSource: 'SERVER_APPROVED_C61_EXCEPTION',
    });
    const service = new C61BudgetRefillExceptionService(
      { ...tx, $transaction: jest.fn((fn: any) => fn(tx)) } as any,
      { get: () => attestation() },
    );
    const preview = await service.preview(user);
    await expect(
      service.apply(user, {
        expectedDigest: preview.digest,
        confirmation: 'APPLY_C61_BUDGET_REFILL_EXCEPTION',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.guestGameEntitlement.create).not.toHaveBeenCalled();
    expect(tx.guestGameRewardWalletItem.create).not.toHaveBeenCalled();
  });
  it('aborts if the Store-local incident date differs after preview', async () => {
    const tx = client();
    tx.$queryRaw.mockImplementation((query: any) => {
      const sql = query.strings?.join(' ') ?? '';
      if (sql.includes('GuestSupportTicket'))
        return Promise.resolve([{ id: 'ticket' }]);
      if (sql.includes('GuestGameRuleDecision'))
        return Promise.resolve([{ id: 'decision' }]);
      return Promise.resolve([
        { occurredAt: new Date('2026-09-21T13:20:00.000Z'), timeZone: 'UTC' },
      ]);
    });
    const service = new C61BudgetRefillExceptionService(
      { ...tx, $transaction: jest.fn((fn: any) => fn(tx)) } as any,
      { get: () => attestation() },
    );
    const preview = await service.preview(user);
    await expect(
      service.apply(user, {
        expectedDigest: preview.digest,
        confirmation: 'APPLY_C61_BUDGET_REFILL_EXCEPTION',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.guestGameEntitlement.create).not.toHaveBeenCalled();
  });
});
