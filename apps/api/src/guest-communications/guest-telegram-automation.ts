import { Prisma, TenantModule } from '@prisma/client';
import { networkTimeZone } from '../guest-leaderboard/guest-leaderboard-core';
import type { PrismaService } from '../prisma/prisma.service';
import type {
  TenantExecutionAdmissionService,
  TenantExecutionRequirement,
} from '../tenancy/tenant-execution-admission.service';

// Automatic Telegram messages of a marketing campaign («Автосценарий»): while
// the campaign is running, the bonus-ledger worker queues its saved message to
// every guest who newly matches the rule. The rule replaces the campaign's
// guest group; the cabinet only stores the settings, the worker only queues
// GuestTelegramOutboxMessage rows, and the bot poller sends them.

export const TELEGRAM_AUTOMATION_TRIGGERS = [
  // No visit for N days (lost guests).
  'LAPSED',
  // Came once, no second visit day within N days.
  'NO_SECOND_VISIT',
  // A game reward in the guest's wallet expires within N days.
  'REWARD_EXPIRING',
] as const;
export type TelegramAutomationTrigger =
  (typeof TELEGRAM_AUTOMATION_TRIGGERS)[number];

export const TELEGRAM_AUTOMATION_DAYS: Record<
  TelegramAutomationTrigger,
  { default: number; min: number; max: number }
> = {
  LAPSED: { default: 21, min: 7, max: 180 },
  NO_SECOND_VISIT: { default: 7, min: 2, max: 60 },
  REWARD_EXPIRING: { default: 3, min: 1, max: 14 },
};

// Only fresh episodes: a guest who lapsed months before the rule was switched
// on is not messaged out of the blue.
export const TELEGRAM_AUTOMATION_CATCH_UP_DAYS = 14;
export const TELEGRAM_AUTOMATION_RUN_INTERVAL_MS = 30 * 60 * 1000;
export const TELEGRAM_AUTOMATION_MAX_PER_RUN = 300;
// Messages are queued only in the club's daytime (network time zone).
export const TELEGRAM_AUTOMATION_SEND_HOURS = { from: 12, to: 21 } as const;
// Same frequency cap as manual campaign sends: one marketing message per guest
// in three days. A reward reminder is about the guest's own reward and is not
// held back by it.
export const TELEGRAM_AUTOMATION_FREQUENCY_MS = 3 * 24 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
const UNREACHABLE_PROFILE_STATUSES = [
  'ARCHIVED',
  'SUPERSEDED',
  'MERGED_TELEGRAM_AUTH',
  'PENDING_TELEGRAM_AUTH',
];
const OPTED_OUT = new Set(['UNSUBSCRIBED', 'DENIED']);
const LIVE_OUTBOX_STATUSES = ['QUEUED', 'SENDING', 'SENT'];
const MARKETING_KINDS = ['CAMPAIGN_NEWS', 'CAMPAIGN_PROMO'];
const IN_CHUNK = 1000;
const RUNNING_STATUS = 'RUNNING';

const SEND_REQUIREMENTS = [
  { module: TenantModule.COMMUNICATIONS, action: 'OUTBOUND' },
] as const satisfies readonly TenantExecutionRequirement[];

export type TelegramAutomationSettings = {
  trigger: TelegramAutomationTrigger;
  days: number;
  enabled: boolean;
  enabledAt: string | null;
  enabledByUserId: string | null;
  lastRunAt: string | null;
  lastQueued: number | null;
};

export type TelegramAutomationCandidate = {
  profileId: string;
  guestId: string;
  telegramIdentity: string;
  phoneConsentStatus: string;
  promoConsentStatus: string;
  episodeKey: string;
  // Extra line under the staff text (the expiring reward and its date).
  note: string | null;
};

export type TelegramAutomationReach = {
  matching: number;
  unsubscribed: number;
  noPromoConsent: number;
  recentlyMessaged: number;
  alreadySent: number;
  willReceive: number;
};

export type TelegramAutomationSelection = {
  recipients: TelegramAutomationCandidate[];
  reach: TelegramAutomationReach;
};

type CandidateRow = {
  profileId: string;
  guestId: string;
  telegramIdentity: string;
  phoneConsentStatus: string;
  promoConsentStatus: string;
  episodeAt: Date | null;
  walletItemId: string | null;
  rewardTitle: string | null;
  expiresAt: Date | null;
};

type Prisma$ = Pick<
  PrismaService,
  | '$queryRaw'
  | '$executeRaw'
  | 'guestTelegramOutboxMessage'
  | 'marketingCampaign'
  | 'store'
>;

export function automationSourceKey(
  campaignId: string,
  episodeKey: string,
  profileId: string,
) {
  return `campaign:${campaignId}:auto:${episodeKey}:profile:${profileId}`;
}

export function isTelegramAutomationTrigger(
  value: unknown,
): value is TelegramAutomationTrigger {
  return TELEGRAM_AUTOMATION_TRIGGERS.includes(
    value as TelegramAutomationTrigger,
  );
}

export function storedAutomation(
  telegram: Record<string, Prisma.JsonValue>,
): TelegramAutomationSettings | null {
  const auto = telegram.automation;
  if (!auto || typeof auto !== 'object' || Array.isArray(auto)) return null;
  const record = auto as Record<string, Prisma.JsonValue>;
  if (!isTelegramAutomationTrigger(record.trigger)) return null;
  const range = TELEGRAM_AUTOMATION_DAYS[record.trigger];
  const days =
    typeof record.days === 'number' &&
    Number.isInteger(record.days) &&
    record.days >= range.min &&
    record.days <= range.max
      ? record.days
      : range.default;
  const text = (key: string) =>
    typeof record[key] === 'string' ? record[key] : null;
  return {
    trigger: record.trigger,
    days,
    enabled: record.enabled === true,
    enabledAt: text('enabledAt'),
    enabledByUserId: text('enabledByUserId'),
    lastRunAt: text('lastRunAt'),
    lastQueued:
      typeof record.lastQueued === 'number' ? record.lastQueued : null,
  };
}

/** Local hour (0–23) of `now` in the IANA zone. */
export function localHour(now: Date, timeZone: string) {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  return Number(hour);
}

export function withinSendHours(now: Date, timeZone: string) {
  const hour = localHour(now, timeZone);
  return (
    hour >= TELEGRAM_AUTOMATION_SEND_HOURS.from &&
    hour < TELEGRAM_AUTOMATION_SEND_HOURS.to
  );
}

export async function automationTimeZone(prisma: Prisma$, tenantId: string) {
  const stores = await prisma.store.findMany({
    where: { tenantId },
    select: { name: true, timeZone: true },
  });
  return networkTimeZone(stores);
}

/**
 * Guests who match the rule right now, one row per guest (one game profile
 * per guest), with the reachable Telegram chat. Staff, disabled guests and
 * «не связываться» are never candidates.
 */
export async function findAutomationCandidates(
  prisma: Prisma$,
  input: {
    tenantId: string;
    trigger: TelegramAutomationTrigger;
    days: number;
    storeIds: string[];
    now: Date;
    timeZone: string;
  },
): Promise<TelegramAutomationCandidate[]> {
  const { tenantId, trigger, days, storeIds, now, timeZone } = input;
  const utc = (date: Date) =>
    Prisma.sql`(${date.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
  const reachable = Prisma.sql`
    SELECT
      p."id" AS "profileId",
      p."guestId" AS "guestId",
      p."telegramIdentity" AS "telegramIdentity",
      p."phoneConsentStatus"::text AS "phoneConsentStatus",
      p."promoConsentStatus" AS "promoConsentStatus"
    FROM public."GuestGameProfile" p
    JOIN public."Guest" g
      ON g."id" = p."guestId" AND g."tenantId" = p."tenantId"
    WHERE p."tenantId" = ${tenantId}
      AND p."telegramIdentity" LIKE 'chat:%'
      AND p."status" NOT IN (${Prisma.join(UNREACHABLE_PROFILE_STATUSES)})
      AND g."isStaff" = false
      AND g."isDisabled" = false
      AND g."crmStatus" <> 'DO_NOT_CONTACT'
  `;

  let rows: CandidateRow[];
  if (trigger === 'REWARD_EXPIRING') {
    const storeFilter = storeIds.length
      ? Prisma.sql`AND (w."storeId" IS NULL OR w."storeId" IN (${Prisma.join(storeIds)}))`
      : Prisma.empty;
    rows = await prisma.$queryRaw<CandidateRow[]>`
      WITH reachable AS (${reachable})
      SELECT r.*, NULL::timestamp AS "episodeAt",
        w."id" AS "walletItemId", w."title" AS "rewardTitle",
        w."expiresAt" AS "expiresAt"
      FROM reachable r
      JOIN LATERAL (
        SELECT w."id", w."title", w."expiresAt"
        FROM public."GuestGameRewardWalletItem" w
        WHERE w."tenantId" = ${tenantId}
          AND w."profileId" = r."profileId"
          AND w."status" IN ('PENDING', 'FAILED')
          AND w."availableAt" <= ${utc(now)}
          AND w."expiresAt" > ${utc(now)}
          AND w."expiresAt" <= ${utc(new Date(now.getTime() + days * DAY_MS))}
          ${storeFilter}
        ORDER BY w."expiresAt", w."id"
        LIMIT 1
      ) w ON true
      ORDER BY w."expiresAt", r."profileId"
    `;
  } else {
    const windowFrom = new Date(
      now.getTime() - (days + TELEGRAM_AUTOMATION_CATCH_UP_DAYS) * DAY_MS,
    );
    const windowTo = new Date(now.getTime() - days * DAY_MS);
    const storeFilter = storeIds.length
      ? Prisma.sql`AND ls."storeId" IN (${Prisma.join(storeIds)})`
      : Prisma.empty;
    const condition =
      trigger === 'LAPSED'
        ? Prisma.sql`v."lastVisitAt" > ${utc(windowFrom)}
            AND v."lastVisitAt" <= ${utc(windowTo)}`
        : Prisma.sql`v."visitDays" = 1
            AND v."firstVisitAt" > ${utc(windowFrom)}
            AND v."firstVisitAt" <= ${utc(windowTo)}`;
    const episode =
      trigger === 'LAPSED'
        ? Prisma.sql`v."lastVisitAt"`
        : Prisma.sql`v."firstVisitAt"`;
    rows = await prisma.$queryRaw<CandidateRow[]>`
      WITH reachable AS (${reachable})
      SELECT r.*, ${episode} AS "episodeAt",
        NULL::text AS "walletItemId", NULL::text AS "rewardTitle",
        NULL::timestamp AS "expiresAt"
      FROM reachable r
      CROSS JOIN LATERAL (
        SELECT
          max(s."startedAt") AS "lastVisitAt",
          min(s."startedAt") AS "firstVisitAt",
          count(DISTINCT (((s."startedAt") AT TIME ZONE 'UTC')
            AT TIME ZONE ${timeZone})::date)::int AS "visitDays"
        FROM public."GuestSession" s
        WHERE s."tenantId" = ${tenantId}
          AND s."guestId" = r."guestId"
          AND s."startedAt" IS NOT NULL
          AND s."startedAt" <= ${utc(now)}
      ) v
      LEFT JOIN LATERAL (
        SELECT s."storeId"
        FROM public."GuestSession" s
        WHERE s."tenantId" = ${tenantId}
          AND s."guestId" = r."guestId"
          AND s."startedAt" IS NOT NULL
          AND s."startedAt" <= ${utc(now)}
        ORDER BY s."startedAt" DESC
        LIMIT 1
      ) ls ON true
      WHERE ${condition}
        ${storeFilter}
      ORDER BY ${episode} DESC, r."profileId"
    `;
  }

  // One message per Telegram chat even if two guests share it.
  const seenChats = new Set<string>();
  const candidates: TelegramAutomationCandidate[] = [];
  for (const row of rows) {
    if (seenChats.has(row.telegramIdentity)) continue;
    seenChats.add(row.telegramIdentity);
    candidates.push({
      profileId: row.profileId,
      guestId: row.guestId,
      telegramIdentity: row.telegramIdentity,
      phoneConsentStatus: row.phoneConsentStatus,
      promoConsentStatus: row.promoConsentStatus,
      episodeKey:
        trigger === 'REWARD_EXPIRING'
          ? `reward-${row.walletItemId}`
          : trigger === 'NO_SECOND_VISIT'
            ? 'second-visit'
            : `visit-${(row.episodeAt as Date).toISOString().slice(0, 10)}`,
      note:
        trigger === 'REWARD_EXPIRING' && row.expiresAt
          ? rewardNote(row.rewardTitle, row.expiresAt, timeZone)
          : null,
    });
  }
  return candidates;
}

export function rewardNote(
  title: string | null,
  expiresAt: Date,
  timeZone: string,
) {
  const date = new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
  }).format(expiresAt);
  const name = title?.trim();
  return name
    ? `Ваша награда «${name}» доступна до ${date}.`
    : `Ваша награда доступна до ${date}.`;
}

/**
 * Applies consent, the frequency cap and «already sent for this episode» to
 * the rule's candidates. The same reasons are shown in the cabinet.
 */
export async function selectAutomationRecipients(
  prisma: Prisma$,
  input: {
    tenantId: string;
    campaignId: string;
    trigger: TelegramAutomationTrigger;
    promo: boolean;
    candidates: TelegramAutomationCandidate[];
    now: Date;
  },
): Promise<TelegramAutomationSelection> {
  const { tenantId, campaignId, trigger, promo, candidates, now } = input;
  const reach: TelegramAutomationReach = {
    matching: candidates.length,
    unsubscribed: 0,
    noPromoConsent: 0,
    recentlyMessaged: 0,
    alreadySent: 0,
    willReceive: 0,
  };
  const sourceKeys = new Map(
    candidates.map((candidate) => [
      automationSourceKey(
        campaignId,
        candidate.episodeKey,
        candidate.profileId,
      ),
      candidate.profileId,
    ]),
  );
  const alreadySent = new Set<string>();
  const recent = new Set<string>();
  const keys = [...sourceKeys.keys()];
  for (let index = 0; index < keys.length; index += IN_CHUNK) {
    const rows = await prisma.guestTelegramOutboxMessage.findMany({
      where: {
        tenantId,
        sourceKey: { in: keys.slice(index, index + IN_CHUNK) },
      },
      select: { sourceKey: true },
    });
    for (const row of rows) {
      const profileId = sourceKeys.get(row.sourceKey);
      if (profileId) alreadySent.add(profileId);
    }
  }
  if (trigger !== 'REWARD_EXPIRING') {
    const profileIds = candidates.map((candidate) => candidate.profileId);
    for (let index = 0; index < profileIds.length; index += IN_CHUNK) {
      const rows = await prisma.guestTelegramOutboxMessage.findMany({
        where: {
          tenantId,
          profileId: { in: profileIds.slice(index, index + IN_CHUNK) },
          kind: { in: MARKETING_KINDS },
          status: { in: LIVE_OUTBOX_STATUSES },
          createdAt: {
            gte: new Date(now.getTime() - TELEGRAM_AUTOMATION_FREQUENCY_MS),
          },
        },
        select: { profileId: true },
      });
      for (const row of rows) recent.add(row.profileId);
    }
  }

  const recipients: TelegramAutomationCandidate[] = [];
  for (const candidate of candidates) {
    if (alreadySent.has(candidate.profileId)) {
      reach.alreadySent += 1;
    } else if (OPTED_OUT.has(candidate.phoneConsentStatus)) {
      reach.unsubscribed += 1;
    } else if (promo && candidate.promoConsentStatus !== 'GRANTED') {
      reach.noPromoConsent += 1;
    } else if (recent.has(candidate.profileId)) {
      reach.recentlyMessaged += 1;
    } else {
      recipients.push(candidate);
    }
  }
  reach.willReceive = recipients.length;
  return { recipients, reach };
}

export type AutomationMessage = {
  text: string;
  replyMarkup: Prisma.InputJsonValue;
  kind: 'CAMPAIGN_NEWS' | 'CAMPAIGN_PROMO';
};

export type AutomationCampaign = {
  id: string;
  tenantId: string;
  storeIds: Prisma.JsonValue;
  createdByUserId: string | null;
  automation: TelegramAutomationSettings;
  // Builds the message for one recipient (staff text + optional note).
  message: (note: string | null) => AutomationMessage;
  promo: boolean;
};

export type AutomationRunLogger = {
  log: (message: string) => void;
  warn: (message: string) => void;
};

export type AutomationRunResult = {
  campaigns: number;
  queued: number;
  failed: string[];
};

/**
 * One worker pass over every running campaign with an enabled automation.
 * Each campaign runs at most every 30 minutes and only in the network's
 * daytime; a failure of one campaign does not stop the others.
 */
export async function runTelegramAutomationsOnce(
  services: {
    prisma: Prisma$;
    admission: Pick<TenantExecutionAdmissionService, 'evaluate'>;
    loadCampaigns: (now: Date) => Promise<AutomationCampaign[]>;
  },
  now: Date,
  logger: AutomationRunLogger,
): Promise<AutomationRunResult> {
  const { prisma, admission } = services;
  const result: AutomationRunResult = { campaigns: 0, queued: 0, failed: [] };
  const campaigns = await services.loadCampaigns(now);
  const zones = new Map<string, string>();
  const allowed = new Map<string, boolean>();

  for (const campaign of campaigns) {
    const lastRun = campaign.automation.lastRunAt
      ? Date.parse(campaign.automation.lastRunAt)
      : NaN;
    if (
      Number.isFinite(lastRun) &&
      now.getTime() - lastRun < TELEGRAM_AUTOMATION_RUN_INTERVAL_MS
    ) {
      continue;
    }
    try {
      if (!zones.has(campaign.tenantId)) {
        zones.set(
          campaign.tenantId,
          await automationTimeZone(prisma, campaign.tenantId),
        );
      }
      const timeZone = zones.get(campaign.tenantId)!;
      if (!withinSendHours(now, timeZone)) continue;
      if (!allowed.has(campaign.tenantId)) {
        const decision = await admission.evaluate(
          campaign.tenantId,
          SEND_REQUIREMENTS,
          now,
        );
        allowed.set(campaign.tenantId, decision.allowed);
      }
      if (!allowed.get(campaign.tenantId)) continue;

      result.campaigns += 1;
      const candidates = await findAutomationCandidates(prisma, {
        tenantId: campaign.tenantId,
        trigger: campaign.automation.trigger,
        days: campaign.automation.days,
        storeIds: stringArray(campaign.storeIds),
        now,
        timeZone,
      });
      const { recipients } = await selectAutomationRecipients(prisma, {
        tenantId: campaign.tenantId,
        campaignId: campaign.id,
        trigger: campaign.automation.trigger,
        promo: campaign.promo,
        candidates,
        now,
      });
      const batch = recipients.slice(0, TELEGRAM_AUTOMATION_MAX_PER_RUN);
      let queued = 0;
      if (batch.length) {
        const created = await prisma.guestTelegramOutboxMessage.createMany({
          data: batch.map((recipient) => {
            const message = campaign.message(recipient.note);
            return {
              tenantId: campaign.tenantId,
              storeId: singleStoreId(campaign.storeIds),
              profileId: recipient.profileId,
              kind: message.kind,
              sourceKey: automationSourceKey(
                campaign.id,
                recipient.episodeKey,
                recipient.profileId,
              ),
              text: message.text,
              replyMarkup: message.replyMarkup,
              marketingCampaignId: campaign.id,
              createdByUserId:
                campaign.automation.enabledByUserId ?? campaign.createdByUserId,
              nextAttemptAt: now,
            };
          }),
          skipDuplicates: true,
        });
        queued = created.count;
      }
      result.queued += queued;
      await markAutomationRun(prisma, campaign, now, queued);
      if (queued > 0) {
        logger.log(
          `Telegram automation ${campaign.id}: queued ${queued} of ${recipients.length}`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Telegram automation ${campaign.id} failed: ${message}`);
      result.failed.push(campaign.id);
    }
  }
  return result;
}

// Only the run markers change, inside the stored JSON, so a draft saved in the
// cabinet at the same moment is not overwritten by the worker.
async function markAutomationRun(
  prisma: Prisma$,
  campaign: AutomationCampaign,
  now: Date,
  queued: number,
) {
  await prisma.$executeRaw`
    UPDATE public."MarketingCampaign"
    SET "mechanicConfig" = jsonb_set(
          jsonb_set(
            "mechanicConfig"::jsonb,
            '{telegram,automation,lastRunAt}',
            to_jsonb(${now.toISOString()}::text)
          ),
          '{telegram,automation,lastQueued}',
          to_jsonb(${queued}::int)
        ),
        "updatedAt" = "updatedAt"
    WHERE "id" = ${campaign.id}
      AND "tenantId" = ${campaign.tenantId}
      AND jsonb_typeof("mechanicConfig"::jsonb #> '{telegram,automation}') = 'object'
  `;
}

export function runningAutomationWhere(now: Date) {
  return {
    status: RUNNING_STATUS,
    // periodTo is the last day of the campaign.
    OR: [
      { periodTo: null },
      { periodTo: { gte: new Date(now.getTime() - DAY_MS) } },
    ],
    AND: [{ OR: [{ periodFrom: null }, { periodFrom: { lte: now } }] }],
  } satisfies Prisma.MarketingCampaignWhereInput;
}

export function stringArray(value: Prisma.JsonValue) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function singleStoreId(value: Prisma.JsonValue) {
  const ids = stringArray(value);
  return ids.length === 1 ? ids[0] : null;
}

export { RUNNING_STATUS as TELEGRAM_AUTOMATION_CAMPAIGN_STATUS };
