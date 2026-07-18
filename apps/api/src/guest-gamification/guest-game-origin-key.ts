import { createHash } from 'node:crypto';

export type GuestGameOriginInput = {
  externalProvider?: string | null;
  externalDomain?: string | null;
  eventType?: string | null;
  stableExternalId?: string | null;
};

const canonicalEventAliases: Record<string, string> = {
  SESSION_STARTED: 'SESSION_START',
  SESSION_START: 'SESSION_START',
  SESSION_ENDED: 'SESSION_STOP',
  SESSION_STOP: 'SESSION_STOP',
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

function normalizedString(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value).trim();
  return normalized || null;
}
