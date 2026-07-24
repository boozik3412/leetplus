import { createHash } from 'node:crypto';

export type GuestGameOriginInput = {
  externalProvider?: string | null;
  externalDomain?: string | null;
  eventType?: string | null;
  stableExternalId?: string | null;
};

export type GuestGamePhysicalProgressIdentityInput = {
  externalProvider?: string | null;
  externalDomain?: string | null;
  sourceKind?: string | null;
  sessionExternalId?: string | null;
  eventType?: string | null;
};

export type GuestGamePhysicalProgressIdentity = {
  externalProvider: string;
  externalDomain: string;
  sourceKind: string;
  sessionExternalId: string;
  family: 'PLAY_TIME';
  key: string;
};

const canonicalEventAliases: Record<string, string> = {
  SESSION_STARTED: 'SESSION_START',
  SESSION_START: 'SESSION_START',
  SESSION_ENDED: 'SESSION_STOP',
  SESSION_STOP: 'SESSION_STOP',
  SESSION_PLAY_TIME_ACCUMULATED: 'PLAY_HOUR',
  HOURLY_PLAY_TIME_ACCUMULATED: 'PLAY_HOUR',
  PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED: 'PLAY_HOUR',
  PLAY_HOUR: 'PLAY_HOUR',
  PRODUCT_PURCHASED: 'PRODUCT_PURCHASE',
  PRODUCT_PURCHASE: 'PRODUCT_PURCHASE',
  BAR_PURCHASE: 'PRODUCT_PURCHASE',
  BALANCE_TOP_UP: 'BALANCE_TOPUP',
  BALANCE_TOPUP: 'BALANCE_TOPUP',
};

export function canonicalGuestGameEventType(value: unknown): string | null {
  const normalized = normalizedString(value)?.toUpperCase() ?? null;
  if (!normalized) return null;
  return canonicalEventAliases[normalized] ?? normalized;
}

export function canonicalGuestGameProgressFamily(
  value: unknown,
): 'PLAY_TIME' | null {
  const eventType = canonicalGuestGameEventType(value);
  return eventType === 'PLAY_HOUR' ||
    eventType === 'SESSION_STOP' ||
    eventType === 'PLAY_TIME'
    ? 'PLAY_TIME'
    : null;
}

export function normalizeGuestGameSourceKind(value: unknown): string | null {
  const normalized = normalizedString(value)?.toUpperCase() ?? null;
  if (!normalized) return null;

  if (normalized === 'GUEST_SESSION') {
    return 'LANGAME_GUEST_SESSION';
  }

  return normalized;
}

export function normalizeGuestGameExternalDomain(
  value: unknown,
): string | null {
  const normalized = normalizedString(value)?.toLowerCase() ?? null;
  if (!normalized) return null;

  try {
    const url = new URL(
      normalized.includes('://') ? normalized : `https://${normalized}`,
    );
    return url.hostname.replace(/\.$/, '') || null;
  } catch {
    return (
      normalized
        .replace(/^https?:\/\//, '')
        .split(/[/?#]/, 1)[0]
        .replace(/\.$/, '') || null
    );
  }
}

/**
 * Source-neutral identity of one physical Langame action.
 *
 * The tenant is deliberately kept in the database composite unique key rather
 * than the hash so the value can be compared across LIVE and Ledger adapters.
 */
export function buildGuestGameOriginKey(
  input: GuestGameOriginInput,
): string | null {
  const provider = normalizedString(input.externalProvider)?.toUpperCase();
  const domain = normalizeGuestGameExternalDomain(input.externalDomain);
  const eventType = canonicalGuestGameEventType(input.eventType);
  const stableExternalId = normalizedString(input.stableExternalId);

  if (!provider || !domain || !eventType || !stableExternalId) {
    return null;
  }

  const digest = createHash('sha256')
    .update(JSON.stringify([provider, domain, eventType, stableExternalId]))
    .digest('hex');
  return `ggo:v1:${digest}`;
}

/**
 * Tenant-neutral identity of one physical play-time session.
 *
 * The tenant stays in the database/query scope. Unlike source fact ids, this
 * tuple survives parser reruns and play-time classification changes without
 * merging sessions from different providers, domains or physical sources.
 */
export function buildGuestGamePhysicalProgressIdentity(
  input: GuestGamePhysicalProgressIdentityInput,
): GuestGamePhysicalProgressIdentity | null {
  const externalProvider = normalizedString(
    input.externalProvider,
  )?.toUpperCase();
  const externalDomain = normalizeGuestGameExternalDomain(input.externalDomain);
  const sourceKind = normalizeGuestGameSourceKind(input.sourceKind);
  const sessionExternalId = normalizedString(input.sessionExternalId);
  const family = canonicalGuestGameProgressFamily(input.eventType);

  if (
    !externalProvider ||
    !externalDomain ||
    !sourceKind ||
    !sessionExternalId ||
    !family
  ) {
    return null;
  }

  const digest = physicalProgressDigest({
    externalProvider,
    externalDomain,
    sourceKind,
    sessionExternalId,
    family,
  });

  return {
    externalProvider,
    externalDomain,
    sourceKind,
    sessionExternalId,
    family,
    key: `ggp:v1:${digest}`,
  };
}

/**
 * Canonical v2 origin for PLAY_TIME only.
 *
 * The v1 builder remains unchanged for legacy lookup and every non-play-time
 * action. Callers rolling this out must probe the v2 key first and the v1 key
 * second before creating an event or receipt.
 */
export function buildGuestGamePlayTimeOriginKey(
  input: GuestGamePhysicalProgressIdentityInput,
): string | null {
  const identity = buildGuestGamePhysicalProgressIdentity(input);
  if (!identity) return null;

  const digest = physicalProgressDigest(identity);
  return `ggo:v2:${digest}`;
}

export function buildGuestGameRewardIdempotencyKey(input: {
  originKey?: string | null;
  ruleKind?: string | null;
  ruleId?: string | null;
  slot?: string | number | null;
}): string | null {
  const originKey = normalizedString(input.originKey);
  const ruleKind = normalizedString(input.ruleKind)?.toUpperCase();
  const ruleId = normalizedString(input.ruleId);
  if (!originKey || !ruleKind || !ruleId) return null;

  const digest = createHash('sha256')
    .update(
      JSON.stringify([
        originKey,
        ruleKind,
        ruleId,
        normalizedString(input.slot) ?? 'default',
      ]),
    )
    .digest('hex');
  return `ggr:v1:${digest}`;
}

function physicalProgressDigest(input: {
  externalProvider: string;
  externalDomain: string;
  sourceKind: string;
  sessionExternalId: string;
  family: 'PLAY_TIME';
}) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        input.externalProvider,
        input.externalDomain,
        input.sourceKind,
        input.sessionExternalId,
        input.family,
      ]),
    )
    .digest('hex');
}

function normalizedString(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value).trim();
  return normalized || null;
}
