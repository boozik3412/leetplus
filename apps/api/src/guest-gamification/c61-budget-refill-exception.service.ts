import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, verify } from 'node:crypto';
import signedArtifact from './c61-budget-refill-attestation.signed.json';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

export const C61_BUDGET_REFILL_ATTESTATION_AUTHORITY = Symbol(
  'C61_BUDGET_REFILL_ATTESTATION_AUTHORITY',
);
export type C61BudgetRefillAttestation = Readonly<{
  status: 'APPROVED' | 'REVOKED';
  ownerEvidenceDigest: string;
  ownerEvidenceAt: string;
  ticketId: string;
  ticketNumber: string;
  frontEndExcludedTicketId: string;
  profileId: string;
  guestId: string;
  storeId: string;
  factId: string;
  eventId: string;
  ruleId: string;
  sourceLocalDate: string;
  sessionExternalId: string;
  rewardLabel: string;
  reason: string;
  blockedDecisionIds: readonly string[];
  approval: 'BUDGET_REFILL_ONLY_NO_XP_NO_BONUS';
}>;
export interface C61BudgetRefillAttestationAuthority {
  get(): C61BudgetRefillAttestation;
}
const APPROVAL_DIGEST =
  'ed4e7a056288a5695ec725061e274200dbbe5ff8b0418e160ddce45b12d58f08';
const PUBLIC_KEY_FINGERPRINT =
  'a49227c157fdb02193a6c97bbd5666969432b221b393bee7e7b09bd4c8255f5e';
const RECORD: C61BudgetRefillAttestation = Object.freeze(
  signedArtifact.approval as C61BudgetRefillAttestation,
);
@Injectable()
export class ServerC61BudgetRefillAttestationAuthority implements C61BudgetRefillAttestationAuthority {
  get() {
    const publicKey = process.env.C61_OWNER_APPROVAL_PUBLIC_KEY_PEM;
    const payload = Buffer.from(
      JSON.stringify(signedArtifact.approval, null, 2) + '\n',
      'utf8',
    );
    if (
      !publicKey ||
      createHash('sha256').update(publicKey).digest('hex') !==
        PUBLIC_KEY_FINGERPRINT ||
      createHash('sha256').update(payload).digest('hex') !== APPROVAL_DIGEST ||
      !verify(
        null,
        payload,
        publicKey,
        Buffer.from(signedArtifact.signature, 'base64'),
      )
    ) {
      throw new ForbiddenException(
        'C61 signed owner approval artifact is absent or invalid.',
      );
    }
    return RECORD;
  }
}
export type C61BudgetRefillPreview = {
  mode: 'PREVIEW' | 'APPLY';
  digest: string;
  originKey: string;
  entitlementId: string | null;
  outcome: 'READY' | 'APPLIED' | 'IDEMPOTENT';
};
type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class C61BudgetRefillExceptionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(C61_BUDGET_REFILL_ATTESTATION_AUTHORITY)
    private readonly authority: C61BudgetRefillAttestationAuthority,
  ) {}
  async preview(user: AuthenticatedUser): Promise<C61BudgetRefillPreview> {
    this.platform(user);
    const a = this.attestation();
    const s = await this.state(this.prisma, user.tenantId, a);
    return this.result(
      'PREVIEW',
      a,
      s.entitlementId,
      s.entitlementId ? 'IDEMPOTENT' : 'READY',
    );
  }
  async apply(
    user: AuthenticatedUser,
    input: { expectedDigest?: string; confirmation?: string },
  ): Promise<C61BudgetRefillPreview> {
    this.platform(user);
    const a = this.attestation();
    const digest = this.digest(a);
    if (
      input.expectedDigest !== digest ||
      input.confirmation !== 'APPLY_C61_BUDGET_REFILL_EXCEPTION'
    )
      throw new ConflictException(
        'Exact C61 exception preview digest or confirmation is required.',
      );
    return this.prisma.$transaction(
      async (tx) => {
        const originKey = this.origin(a);
        const lockedTickets = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT "id" FROM "GuestSupportTicket" WHERE "tenantId"=${user.tenantId} AND "id"=${a.ticketId} FOR UPDATE`,
        );
        const lockedDecisions = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT "id" FROM "GuestGameRuleDecision" WHERE "tenantId"=${user.tenantId} AND "id" IN (${Prisma.join(a.blockedDecisionIds)}) FOR UPDATE`,
        );
        const eventClock = await tx.$queryRaw<
          Array<{ occurredAt: Date; timeZone: string | null }>
        >(
          Prisma.sql`SELECT e."occurredAt", s."timeZone" FROM "GuestGameEvent" e JOIN "Store" s ON s."tenantId"=e."tenantId" AND s."id"=${a.storeId} WHERE e."tenantId"=${user.tenantId} AND e."id"=${a.eventId} FOR UPDATE OF e, s`,
        );
        if (
          lockedTickets.length !== 1 ||
          lockedDecisions.length !== a.blockedDecisionIds.length ||
          eventClock.length !== 1 ||
          !eventClock[0].timeZone ||
          localDate(eventClock[0].occurredAt, eventClock[0].timeZone) !==
            a.sourceLocalDate
        )
          throw new ConflictException(
            'C61 ticket, blocked decisions, or local incident date changed.',
          );
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`guest-lootbox-day:${user.tenantId}:${a.profileId}:${a.ruleId}:${a.sourceLocalDate}`}))`,
        );
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${originKey}))`,
        );
        const s = await this.state(tx, user.tenantId, a);
        if (s.entitlementId)
          return this.result('APPLY', a, s.entitlementId, 'IDEMPOTENT');
        const [start, end] = localDayBounds(
          a.sourceLocalDate,
          eventClock[0].timeZone,
        );
        if (
          await tx.guestGameEntitlement.count({
            where: {
              tenantId: user.tenantId,
              profileId: a.profileId,
              ruleId: a.ruleId,
              status: { in: ['AVAILABLE', 'OPENING', 'CONSUMED'] },
              qualifiedAt: { gte: start, lt: end },
            },
          })
        )
          throw new ConflictException(
            'C61 daily Weekend limit is already occupied.',
          );
        const pendingCount = await tx.guestGameEntitlement.count({
          where: {
            tenantId: user.tenantId,
            profileId: a.profileId,
            ruleId: a.ruleId,
            status: { in: ['AVAILABLE', 'OPENING'] },
          },
        });
        if (pendingCount >= 1)
          throw new ConflictException(
            'C61 pending Weekend entitlement limit is already occupied.',
          );
        const priorReceipt = await tx.guestGameOriginReceipt.findUnique({
          where: { tenantId_originKey: { tenantId: user.tenantId, originKey } },
          select: {
            factId: true,
            eventId: true,
            eventType: true,
            externalDomain: true,
            policy: true,
            status: true,
            claimedSource: true,
          },
        });
        if (
          priorReceipt &&
          (priorReceipt.factId !== a.factId ||
            priorReceipt.eventId !== a.eventId ||
            priorReceipt.eventType !== 'SESSION_START' ||
            priorReceipt.externalDomain !== '46.langamepro.ru' ||
            priorReceipt.policy !== 'SUPPORT_BUDGET_REFILL_EXCEPTION_V1' ||
            priorReceipt.status !== 'PROCESSED' ||
            priorReceipt.claimedSource !== 'SERVER_APPROVED_C61_EXCEPTION')
        )
          throw new ConflictException(
            'C61 origin receipt conflicts with the admitted attestation.',
          );
        const receipt = await tx.guestGameOriginReceipt.upsert({
          where: { tenantId_originKey: { tenantId: user.tenantId, originKey } },
          create: {
            tenantId: user.tenantId,
            originKey,
            factId: a.factId,
            eventId: a.eventId,
            eventType: 'SESSION_START',
            externalDomain: '46.langamepro.ru',
            policy: 'SUPPORT_BUDGET_REFILL_EXCEPTION_V1',
            status: 'PROCESSED',
            claimedSource: 'SERVER_APPROVED_C61_EXCEPTION',
            graceUntil: new Date('2100-01-01T00:00:00.000Z'),
            processedAt: new Date(),
            attempts: 1,
          },
          update: {},
        });
        const qualifiedAt = new Date('2026-09-20T13:20:00.000Z');
        const entitlement = await tx.guestGameEntitlement.create({
          data: {
            tenantId: user.tenantId,
            profileId: a.profileId,
            guestId: a.guestId,
            storeId: a.storeId,
            eventId: a.eventId,
            evaluationRunId: receipt.id,
            ruleType: 'LOOT_BOX',
            ruleId: a.ruleId,
            ruleName: a.rewardLabel,
            sourceEventType: 'SESSION_START',
            sourceFactId: a.factId,
            sourceFactKind: 'GUEST_SESSION',
            status: 'AVAILABLE',
            idempotencyKey: originKey,
            originKey,
            qualifiedAt,
            evidence: {
              attestation: a,
              digest,
              exceptionKey: originKey,
              noBonusOrXp: true,
            },
          },
        });
        await tx.guestGameRewardWalletItem.create({
          data: {
            tenantId: user.tenantId,
            profileId: a.profileId,
            storeId: a.storeId,
            entitlementId: entitlement.id,
            kind: 'LOOT_BOX_ENTITLEMENT',
            sourceKind: 'SUPPORT_BUDGET_REFILL_EXCEPTION',
            sourceId: a.ruleId,
            title: a.rewardLabel,
            rewardLabel: '1 попытка открытия',
            status: 'PENDING',
            availableAt: qualifiedAt,
            expiresAt: new Date('2026-12-19T13:20:00.000Z'),
          },
        });
        await tx.guestGameAuditEvent.create({
          data: {
            tenantId: user.tenantId,
            profileId: a.profileId,
            guestId: a.guestId,
            storeId: a.storeId,
            entityType: 'GUEST_GAME_ENTITLEMENT',
            entityId: entitlement.id,
            action: 'SUPPORT_C61_BUDGET_REFILL_EXCEPTION_APPLIED',
            status: 'PROCESSED',
            reasonCode: a.reason,
            payload: {
              attestation: a,
              digest,
              exceptionKey: originKey,
              actorUserId: user.id,
              noBonusOrXp: true,
            },
          },
        });
        return this.result('APPLY', a, entitlement.id, 'APPLIED');
      },
      { isolationLevel: 'Serializable' },
    );
  }
  private attestation() {
    const a = this.authority.get();
    if (a.status !== 'APPROVED')
      throw new ForbiddenException('C61 exception authority is not approved.');
    return a;
  }
  private platform(u: AuthenticatedUser) {
    if (!u.isPlatformAdmin || u.platformTenantContext !== true)
      throw new ForbiddenException(
        'C61 exception requires platform admin with selected tenant context.',
      );
  }
  private origin(a: C61BudgetRefillAttestation) {
    return `support-budget-refill-exception:v2:${a.ticketId}:${a.factId}:${a.ruleId}`;
  }
  private digest(a: C61BudgetRefillAttestation) {
    return createHash('sha256').update(JSON.stringify(a)).digest('hex');
  }
  private result(
    mode: 'PREVIEW' | 'APPLY',
    a: C61BudgetRefillAttestation,
    entitlementId: string | null,
    outcome: C61BudgetRefillPreview['outcome'],
  ): C61BudgetRefillPreview {
    return {
      mode,
      digest: this.digest(a),
      originKey: this.origin(a),
      entitlementId,
      outcome,
    };
  }
  private async state(db: Db, tenantId: string, a: C61BudgetRefillAttestation) {
    const [ticket, fact, event, rule, fe, existing, decisions] =
      await Promise.all([
        db.guestSupportTicket.findUnique({
          where: { ticketNumber: a.ticketNumber },
          select: {
            id: true,
            tenantId: true,
            profileId: true,
            guestId: true,
            storeId: true,
            status: true,
          },
        }),
        db.guestActivityFact.findUnique({
          where: { id: a.factId },
          select: {
            tenantId: true,
            profileId: true,
            guestId: true,
            storeId: true,
            factType: true,
            lifecycleStatus: true,
            confidence: true,
            sessionExternalId: true,
          },
        }),
        db.guestGameEvent.findUnique({
          where: { id: a.eventId },
          select: {
            tenantId: true,
            profileId: true,
            guestId: true,
            externalId: true,
            eventType: true,
          },
        }),
        db.guestGameLootBox.findUnique({
          where: { id: a.ruleId },
          select: {
            tenantId: true,
            status: true,
            triggerKind: true,
            sessionType: true,
          },
        }),
        db.guestSupportTicket.findUnique({
          where: { id: a.frontEndExcludedTicketId },
          select: { tenantId: true, profileId: true },
        }),
        db.guestGameEntitlement.findUnique({
          where: {
            tenantId_idempotencyKey: {
              tenantId,
              idempotencyKey: this.origin(a),
            },
          },
          select: { id: true },
        }),
        db.guestGameRuleDecision.findMany({
          where: {
            id: { in: [...a.blockedDecisionIds] },
            tenantId,
            profileId: a.profileId,
            ruleId: a.ruleId,
            sourceFactId: a.sessionExternalId,
            status: 'BLOCKED',
          },
          select: { id: true },
        }),
      ]);
    if (
      !ticket ||
      ticket.id !== a.ticketId ||
      ticket.tenantId !== tenantId ||
      ticket.profileId !== a.profileId ||
      ticket.guestId !== a.guestId ||
      ticket.storeId !== a.storeId ||
      !['NEW', 'IN_PROGRESS'].includes(ticket.status) ||
      !fact ||
      fact.tenantId !== tenantId ||
      fact.profileId !== a.profileId ||
      fact.guestId !== a.guestId ||
      fact.storeId !== a.storeId ||
      fact.factType !== 'PACKAGE_OR_SUBSCRIPTION_USED' ||
      fact.lifecycleStatus !== 'ACTIVE' ||
      fact.confidence !== 'EXACT' ||
      fact.sessionExternalId !== a.sessionExternalId ||
      !event ||
      event.tenantId !== tenantId ||
      event.profileId !== a.profileId ||
      event.guestId !== a.guestId ||
      event.eventType !== 'SESSION_START' ||
      event.externalId !==
        `guest-game:GUEST_SESSION:SESSION_START:${a.sessionExternalId}` ||
      !rule ||
      rule.tenantId !== tenantId ||
      rule.status !== 'ACTIVE' ||
      rule.triggerKind !== 'SESSION_START' ||
      rule.sessionType !== 'packet_hours' ||
      !fe ||
      fe.tenantId !== tenantId ||
      fe.profileId !== a.profileId ||
      decisions.length !== a.blockedDecisionIds.length
    )
      throw new ConflictException(
        'C61 exact attestation no longer matches server state.',
      );
    return { entitlementId: existing?.id ?? null };
  }
}

function localDate(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  const year = get('year'),
    month = get('month'),
    day = get('day');
  if (!year || !month || !day)
    throw new ConflictException(
      'C61 Store timezone cannot derive local incident date.',
    );
  return `${year}-${month}-${day}`;
}

function localDayBounds(day: string, timeZone: string): [Date, Date] {
  const midnight = (value: string) => {
    const guess = new Date(`${value}T00:00:00.000Z`);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(guess);
    const get = (type: string) =>
      parts.find((part) => part.type === type)?.value ?? '0';
    const rendered = Date.UTC(
      +get('year'),
      +get('month') - 1,
      +get('day'),
      +get('hour'),
      +get('minute'),
      +get('second'),
    );
    return new Date(guess.getTime() - (rendered - guess.getTime()));
  };
  const start = midnight(day);
  const next = new Date(`${day}T12:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return [start, midnight(next.toISOString().slice(0, 10))];
}
