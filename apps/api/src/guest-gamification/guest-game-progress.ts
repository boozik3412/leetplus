import { buildGuestGamePhysicalProgressIdentity } from './guest-game-origin-key';

export type GuestGameProgressAggregation =
  | 'count'
  | 'sum'
  | 'duration'
  | 'distinctDays'
  | 'exists'
  | 'streak';

export type GuestGameProgressEvent = {
  eventType: string;
  occurredAt: Date;
  sourceFactId?: string | null;
  externalProvider?: string | null;
  sourceKind?: string | null;
  sessionExternalId?: string | null;
  storeId?: string | null;
  externalDomain?: string | null;
  sessionType?: string | null;
  sessionPacket?: boolean | null;
  sessionMinutes?: number | null;
  spendAmount?: number | null;
  tariffGroupId?: string | null;
  tariffPeriodId?: string | null;
  tariffTypeId?: string | null;
  guestLogType?: string | null;
  productId?: string | null;
  externalProductId?: string | null;
  externalCategoryKey?: string | null;
  externalCategoryId?: string | null;
  categoryId?: string | null;
  productName?: string | null;
  categoryName?: string | null;
  supplierName?: string | null;
  quantity?: number | null;
};

export type GuestGameProgressRule = {
  triggerKind: string;
  progressTarget?: number | null;
  progressUnit?: string | null;
  conditions?: unknown;
  storeIds?: string[];
  externalDomains?: string[];
  periodFrom?: Date | string | null;
  periodTo?: Date | string | null;
  timeZone?: string | null;
};

export type GuestGameProgressResult = {
  applicable: boolean;
  aggregation: GuestGameProgressAggregation;
  current: number;
  target: number;
  percent: number;
  completed: boolean;
  matchedEvents: number;
  unit: string | null;
  windowDays: number | null;
};

const DEFAULT_WINDOW_DAYS = 365;

export function evaluateGuestGameProgress(
  rule: GuestGameProgressRule,
  currentEvent: GuestGameProgressEvent | null,
  historyEvents: GuestGameProgressEvent[],
): GuestGameProgressResult {
  const conditions = progressRecord(rule.conditions);
  const metric = progressRecord(conditions.metric ?? conditions.progressMetric);
  const target =
    progressNumber(metric.target) ??
    progressNumber(conditions.progressTarget) ??
    rule.progressTarget ??
    null;
  const hasMetric = Object.keys(metric).length > 0;

  if (!hasMetric && (!target || target <= 1)) {
    return {
      applicable: false,
      aggregation: 'count',
      current: 0,
      target: target ?? 1,
      percent: 0,
      completed: true,
      matchedEvents: 0,
      unit: rule.progressUnit ?? null,
      windowDays: null,
    };
  }

  const aggregation = progressAggregation(
    progressString(metric.aggregation) ??
      progressString(metric.type) ??
      progressString(conditions.aggregation),
    progressString(metric.checkInMode ?? conditions.checkInMode),
  );
  const resolvedTarget = Math.max(1, target ?? 1);
  const windowDays =
    progressNumber(metric.windowDays) ??
    progressNumber(conditions.windowDays) ??
    DEFAULT_WINDOW_DAYS;
  const eventTypes = progressStringValues(
    metric.eventTypes,
    metric.eventType,
    conditions.eventTypes,
    conditions.eventType,
  );
  const referenceEvent =
    currentEvent ??
    ({
      eventType: '__REFERENCE__',
      occurredAt: new Date(),
    } satisfies GuestGameProgressEvent);
  const allEvents = dedupeProgressEvents(currentEvent, historyEvents).filter(
    (event) =>
      matchesProgressEvent(rule, conditions, metric, event, referenceEvent, {
        eventTypes,
        windowDays,
      }),
  );
  const current = progressValue(
    aggregation,
    allEvents,
    rule.timeZone,
    resolvedTarget,
    localDateKey(referenceEvent.occurredAt, rule.timeZone),
  );
  const productCoverageComplete = productCoverageMatches(
    conditions,
    metric,
    allEvents,
  );

  return {
    applicable: true,
    aggregation,
    current,
    target: resolvedTarget,
    percent: progressPercent(current, resolvedTarget),
    completed: current >= resolvedTarget && productCoverageComplete,
    matchedEvents: allEvents.length,
    unit: rule.progressUnit ?? progressString(metric.unit) ?? null,
    windowDays,
  };
}

function dedupeProgressEvents(
  currentEvent: GuestGameProgressEvent | null,
  historyEvents: GuestGameProgressEvent[],
): GuestGameProgressEvent[] {
  type ProgressEventCandidate = {
    event: GuestGameProgressEvent;
    current: boolean;
  };
  type StrongProgressGroup = {
    selected: ProgressEventCandidate;
    sourceFactIds: Set<string>;
  };
  const selectedByPhysicalIdentity = new Map<string, StrongProgressGroup>();
  const candidatesWithoutStrongIdentity: ProgressEventCandidate[] = [];
  const eventsWithoutPhysicalIdentity: GuestGameProgressEvent[] = [];
  const candidates: ProgressEventCandidate[] = [
    ...historyEvents.map((event) => ({ event, current: false })),
    ...(currentEvent ? [{ event: currentEvent, current: true }] : []),
  ];

  for (const candidate of candidates) {
    const physicalIdentity = strongPhysicalProgressEventIdentity(
      candidate.event,
    );
    if (!physicalIdentity) {
      candidatesWithoutStrongIdentity.push(candidate);
      continue;
    }

    const sourceFactId = physicalProgressSourceFactId(
      candidate.event.sourceFactId,
    );
    const group = selectedByPhysicalIdentity.get(physicalIdentity);
    if (!group) {
      selectedByPhysicalIdentity.set(physicalIdentity, {
        selected: candidate,
        sourceFactIds: new Set(sourceFactId ? [sourceFactId] : []),
      });
      continue;
    }

    if (sourceFactId) {
      group.sourceFactIds.add(sourceFactId);
    }
    if (progressEventPreferred(candidate, group.selected)) {
      group.selected = candidate;
    }
  }

  const unmergedLegacyCandidates: ProgressEventCandidate[] = [];
  for (const candidate of candidatesWithoutStrongIdentity) {
    const sourceFactId = physicalProgressSourceFactId(
      candidate.event.sourceFactId,
    );
    if (!sourceFactId) {
      eventsWithoutPhysicalIdentity.push(candidate.event);
      continue;
    }

    const matchingStrongGroups = Array.from(
      selectedByPhysicalIdentity.values(),
    ).filter((group) => group.sourceFactIds.has(sourceFactId));
    if (matchingStrongGroups.length !== 1) {
      unmergedLegacyCandidates.push(candidate);
      continue;
    }

    const group = matchingStrongGroups[0];
    if (progressEventPreferred(candidate, group.selected)) {
      group.selected = candidate;
    }
  }

  const selectedLegacyCandidates = new Map<string, ProgressEventCandidate>();
  for (const candidate of unmergedLegacyCandidates) {
    const sourceFactId = physicalProgressSourceFactId(
      candidate.event.sourceFactId,
    );
    if (!sourceFactId) {
      eventsWithoutPhysicalIdentity.push(candidate.event);
      continue;
    }
    const selected = selectedLegacyCandidates.get(sourceFactId);
    if (!selected || progressEventPreferred(candidate, selected)) {
      selectedLegacyCandidates.set(sourceFactId, candidate);
    }
  }

  return [
    ...Array.from(
      selectedByPhysicalIdentity.values(),
      ({ selected }) => selected.event,
    ),
    ...Array.from(selectedLegacyCandidates.values(), ({ event }) => event),
    ...eventsWithoutPhysicalIdentity,
  ];
}

function progressEventPreferred(
  candidate: { event: GuestGameProgressEvent; current: boolean },
  selected: { event: GuestGameProgressEvent; current: boolean },
) {
  if (candidate.current !== selected.current) {
    return candidate.current;
  }

  const candidateIsPackage = isPackageProgressClassification(candidate.event);
  const selectedIsPackage = isPackageProgressClassification(selected.event);
  if (candidateIsPackage !== selectedIsPackage) {
    return candidateIsPackage;
  }

  return candidate.event.occurredAt > selected.event.occurredAt;
}

function strongPhysicalProgressEventIdentity(event: GuestGameProgressEvent) {
  const strongIdentity = buildGuestGamePhysicalProgressIdentity({
    externalProvider: event.externalProvider,
    externalDomain: event.externalDomain,
    sourceKind: event.sourceKind,
    sessionExternalId: event.sessionExternalId,
    eventType: event.eventType,
  });
  return strongIdentity?.key ?? null;
}

function physicalProgressSourceFactId(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) return null;

  // Older package-correction events briefly used a version suffix in the
  // source-fact id. It still represents the same physical Langame session.
  return normalized.replace(/:classification:package(?:[-_]?v)?\d+$/i, '');
}

function isPackageProgressClassification(event: GuestGameProgressEvent) {
  return (
    event.sessionPacket === true ||
    normalizeProgressSessionType(event.sessionType) === 'packet_hours'
  );
}

export function guestGameTriggerMatches(
  expectedValue: string | null | undefined,
  actualValue: string | null | undefined,
) {
  const expected = normalizeProgressToken(expectedValue);
  const actual = normalizeProgressToken(actualValue);

  if (!expected || !actual || expected === actual) {
    return true;
  }

  const aliases: Record<string, string[]> = {
    VISIT: ['SESSION_START', 'CHECK_IN', 'GUEST_LOG'],
    REPEAT_VISIT: ['SESSION_START', 'CHECK_IN', 'VISIT'],
    CHECK_IN: ['CHECK_IN'],
    APP_OPEN: ['APP_OPEN'],
    PLAY_HOUR: ['PLAY_HOUR', 'SESSION_STOP'],
    SESSION: ['SESSION_START', 'PLAY_HOUR', 'SESSION_STOP'],
    BAR_PURCHASE: ['PRODUCT_PURCHASE', 'BAR_PURCHASE'],
    PRODUCT_PURCHASE: ['PRODUCT_PURCHASE', 'BAR_PURCHASE'],
    BALANCE_TOPUP: ['BALANCE_TOPUP', 'BALANCE_TOP_UP'],
    BALANCE_TOP_UP: ['BALANCE_TOPUP', 'BALANCE_TOP_UP'],
    REFERRAL: ['REFERRAL_ACCEPTED', 'GAME_REFERRAL_ACCEPTED'],
    REFERRAL_ACCEPTED: ['REFERRAL_ACCEPTED', 'GAME_REFERRAL_ACCEPTED'],
    PACKET_SESSION: ['SESSION_START', 'PLAY_HOUR'],
  };

  return (aliases[expected] ?? []).includes(actual);
}

function matchesProgressEvent(
  rule: GuestGameProgressRule,
  conditions: Record<string, unknown>,
  metric: Record<string, unknown>,
  event: GuestGameProgressEvent,
  reference: GuestGameProgressEvent,
  options: { eventTypes: string[]; windowDays: number },
) {
  if (options.eventTypes.length) {
    const actual = normalizeProgressToken(event.eventType);
    const accepted = options.eventTypes.map(normalizeProgressToken);

    if (
      !accepted.some((expected) => guestGameTriggerMatches(expected, actual))
    ) {
      return false;
    }
  } else if (!guestGameTriggerMatches(rule.triggerKind, event.eventType)) {
    return false;
  }

  if (!dateWithinBounds(event.occurredAt, rule.periodFrom, rule.periodTo)) {
    return false;
  }

  if (
    !dateWithinLastDays(
      event.occurredAt,
      reference.occurredAt,
      options.windowDays,
    )
  ) {
    return false;
  }

  if (rule.storeIds?.length) {
    const matchesStore = Boolean(
      event.storeId && rule.storeIds.includes(event.storeId),
    );
    const matchesDomain = Boolean(
      !event.storeId &&
      event.externalDomain &&
      rule.externalDomains?.includes(event.externalDomain),
    );

    if (!matchesStore && !matchesDomain) {
      return false;
    }
  }

  const minSessionMinutes = progressNumber(
    metric.minSessionMinutes ?? conditions.minSessionMinutes,
  );
  if (
    minSessionMinutes !== null &&
    Math.max(0, event.sessionMinutes ?? 0) < minSessionMinutes
  ) {
    return false;
  }

  const minSpendAmount = progressNumber(
    metric.minSpendAmount ?? conditions.minSpendAmount,
  );
  if (
    minSpendAmount !== null &&
    Math.max(0, event.spendAmount ?? 0) < minSpendAmount
  ) {
    return false;
  }

  if (!matchesWeekdays(conditions, metric, event.occurredAt, rule.timeZone)) {
    return false;
  }

  const exactSpendAmount = progressNumber(
    metric.exactSpendAmount ?? conditions.exactSpendAmount,
  );
  if (
    exactSpendAmount !== null &&
    Math.abs(Math.max(0, event.spendAmount ?? 0) - exactSpendAmount) > 0.005
  ) {
    return false;
  }

  if (!matchesHours(conditions, metric, event.occurredAt, rule.timeZone)) {
    return false;
  }

  if (!matchesSessionType(conditions, event)) {
    return false;
  }

  if (!matchesTariff(conditions, event)) {
    return false;
  }

  if (!matchesGuestLogType(conditions, event)) {
    return false;
  }

  if (!matchesProductFilters(conditions, metric, event)) {
    return false;
  }

  return true;
}

function progressValue(
  aggregation: GuestGameProgressAggregation,
  events: GuestGameProgressEvent[],
  timeZone?: string | null,
  target?: number,
  referenceDateKey?: string,
) {
  if (aggregation === 'exists') {
    return events.length > 0 ? 1 : 0;
  }

  if (aggregation === 'sum') {
    return roundProgress(
      events.reduce(
        (sum, event) => sum + Math.max(0, event.spendAmount ?? 0),
        0,
      ),
    );
  }

  if (aggregation === 'duration') {
    return roundProgress(
      events.reduce(
        (sum, event) => sum + Math.max(0, event.sessionMinutes ?? 0),
        0,
      ),
    );
  }

  if (aggregation === 'distinctDays') {
    return new Set(
      events.map((event) => localDateKey(event.occurredAt, timeZone)),
    ).size;
  }

  if (aggregation === 'streak') {
    return activeDayStreak(
      events.map((event) => localDateKey(event.occurredAt, timeZone)),
      target ?? 1,
      referenceDateKey,
    );
  }

  return events.length;
}

function matchesWeekdays(
  conditions: Record<string, unknown>,
  metric: Record<string, unknown>,
  occurredAt: Date,
  timeZone?: string | null,
) {
  const weekdays = progressNumberArray(metric.weekdays ?? conditions.weekdays);
  const weekdayMode = normalizeProgressToken(
    progressString(metric.weekdayMode ?? conditions.weekdayMode),
  );
  const weekdaysOnly =
    metric.weekdaysOnly === true || conditions.weekdaysOnly === true;
  const expectedWeekdays =
    weekdayMode === 'WEEKDAYS' || weekdaysOnly
      ? [1, 2, 3, 4, 5]
      : weekdayMode === 'WEEKENDS'
        ? [0, 6]
        : weekdays;
  const weekday = localWeekday(occurredAt, timeZone);

  return !expectedWeekdays.length || expectedWeekdays.includes(weekday);
}

function matchesHours(
  conditions: Record<string, unknown>,
  metric: Record<string, unknown>,
  occurredAt: Date,
  timeZone?: string | null,
) {
  const hours = progressStringValues(metric.hours, conditions.hours);

  return (
    !hours.length ||
    hours.some((window) => isWithinTimeWindow(occurredAt, window, timeZone))
  );
}

function matchesSessionType(
  conditions: Record<string, unknown>,
  event: GuestGameProgressEvent,
) {
  const expectedType = progressString(conditions.sessionType);

  if (expectedType && isActionableProgressSessionType(expectedType)) {
    const expectedSessionType = normalizeProgressSessionType(expectedType);
    const actualSessionType = normalizeProgressSessionType(event.sessionType);

    if (!actualSessionType || actualSessionType !== expectedSessionType) {
      return false;
    }
  }

  return true;
}

function normalizeProgressSessionType(value: string | null | undefined) {
  const normalized = (value ?? '').trim().toLowerCase().replace(/\s+/g, '_');

  if (
    [
      'packet_hours',
      'packet',
      'package',
      'package_hours',
      'package_or_subscription',
      'package_or_subscription_session',
      'subscription',
      'membership',
      'abonement',
      'abonnement',
      'абонемент',
    ].includes(normalized)
  ) {
    return 'packet_hours';
  }

  if (
    [
      'regular_session',
      'regular',
      'common',
      'default',
      'hourly',
      'hourly_session',
    ].includes(normalized)
  ) {
    return 'regular_session';
  }

  return normalized || null;
}

function isActionableProgressSessionType(value: string | null | undefined) {
  return ['regular_session', 'packet_hours'].includes(
    normalizeProgressSessionType(value) ?? '',
  );
}

function matchesTariff(
  conditions: Record<string, unknown>,
  event: GuestGameProgressEvent,
) {
  return (
    matchesOneOf(
      progressStringValues(conditions.tariffGroupIds, conditions.tariffGroupId),
      event.tariffGroupId,
    ) &&
    matchesOneOf(
      progressStringValues(
        conditions.tariffPeriodIds,
        conditions.tariffPeriodId,
      ),
      event.tariffPeriodId,
    ) &&
    matchesOneOf(
      progressStringValues(conditions.tariffTypeIds, conditions.tariffTypeId),
      event.tariffTypeId,
    )
  );
}

function matchesGuestLogType(
  conditions: Record<string, unknown>,
  event: GuestGameProgressEvent,
) {
  const allowedTypes = progressStringValues(
    conditions.guestLogTypes,
    conditions.guestLogType,
    conditions.logTypes,
    conditions.logType,
  ).map((value) => value.toLowerCase());
  const blockedTypes = progressStringValues(
    conditions.blockedGuestLogTypes,
    conditions.deniedGuestLogTypes,
    conditions.blockedLogTypes,
    conditions.deniedLogTypes,
  ).map((value) => value.toLowerCase());
  const actual = event.guestLogType?.trim().toLowerCase() ?? '';

  if (blockedTypes.length && actual && blockedTypes.includes(actual)) {
    return false;
  }

  return !allowedTypes.length || (!!actual && allowedTypes.includes(actual));
}

function matchesProductFilters(
  conditions: Record<string, unknown>,
  metric: Record<string, unknown>,
  event: GuestGameProgressEvent,
) {
  const purchaseSource = normalizeProgressToken(
    progressString(metric.purchaseSource ?? conditions.purchaseSource),
  );
  const categoryCatalogSource = normalizeProgressToken(
    progressString(
      metric.categoryCatalogSource ?? conditions.categoryCatalogSource,
    ),
  );
  const categoryMode = purchaseSource === 'CATEGORY';
  return (
    matchesOneOf(
      progressStringValues(
        metric.productIds,
        metric.productId,
        conditions.productIds,
        conditions.productId,
      ),
      event.productId,
    ) &&
    matchesOneOf(
      progressStringValues(
        metric.externalProductIds,
        metric.externalProductId,
        conditions.externalProductIds,
        conditions.externalProductId,
      ),
      event.externalProductId,
    ) &&
    matchesOneOf(
      categoryMode && categoryCatalogSource === 'LEETPLUS'
        ? []
        : progressStringValues(
            metric.externalCategoryKeys,
            metric.externalCategoryKey,
            conditions.externalCategoryKeys,
            conditions.externalCategoryKey,
          ),
      event.externalCategoryKey,
    ) &&
    matchesOneOf(
      categoryMode && categoryCatalogSource !== 'LEETPLUS'
        ? []
        : progressStringValues(
            metric.categoryIds,
            metric.categoryId,
            conditions.categoryIds,
            conditions.categoryId,
          ),
      event.categoryId,
    ) &&
    matchesOneOf(
      categoryMode
        ? []
        : progressStringValues(
            metric.categoryNames,
            metric.categoryName,
            conditions.categoryNames,
            conditions.categoryName,
          ).map((value) => value.toLowerCase()),
      event.categoryName?.toLowerCase() ?? null,
    )
  );
}

function productCoverageMatches(
  conditions: Record<string, unknown>,
  metric: Record<string, unknown>,
  events: GuestGameProgressEvent[],
) {
  const productMatch = normalizeProgressToken(
    progressString(metric.productMatch ?? conditions.productMatch),
  );
  if (productMatch !== 'ALL') return true;

  const purchaseSource = normalizeProgressToken(
    progressString(metric.purchaseSource ?? conditions.purchaseSource),
  );
  if (purchaseSource === 'CATEGORY') {
    const categoryCatalogSource = normalizeProgressToken(
      progressString(
        metric.categoryCatalogSource ?? conditions.categoryCatalogSource,
      ),
    );
    const selectionField =
      categoryCatalogSource === 'LEETPLUS'
        ? 'categoryIds'
        : 'externalCategoryKeys';
    const selections = Array.isArray(metric.categorySelections)
      ? metric.categorySelections
          .filter(
            (item): item is Record<string, unknown> =>
              Boolean(item) && typeof item === 'object' && !Array.isArray(item),
          )
          .map((item) => progressStringValues(item[selectionField]))
          .filter((keys) => keys.length > 0)
      : [];
    if (!selections.length) return true;
    const purchasedCategoryKeys = new Set(
      events
        .map((event) =>
          categoryCatalogSource === 'LEETPLUS'
            ? event.categoryId
            : event.externalCategoryKey,
        )
        .filter((key): key is string => Boolean(key)),
    );
    return selections.every((keys) =>
      keys.some((key) => purchasedCategoryKeys.has(key)),
    );
  }

  const expected = new Set(
    progressStringValues(
      metric.productIds,
      metric.externalProductIds,
      conditions.productIds,
      conditions.externalProductIds,
    ),
  );
  if (!expected.size) return true;

  const purchased = new Set<string>();
  events.forEach((event) => {
    if (event.productId) purchased.add(event.productId);
    if (event.externalProductId) purchased.add(event.externalProductId);
  });
  return [...expected].every((id) => purchased.has(id));
}

function matchesOneOf(
  values: string[],
  actualValue: string | null | undefined,
) {
  if (!values.length) {
    return true;
  }

  return !!actualValue && values.includes(actualValue);
}

function dateWithinBounds(
  value: Date,
  fromValue: Date | string | null | undefined,
  toValue: Date | string | null | undefined,
) {
  const from = dateValue(fromValue);
  const to = dateValue(toValue);

  return (!from || value >= from) && (!to || value <= to);
}

function dateWithinLastDays(value: Date, reference: Date, days: number) {
  if (!Number.isFinite(days) || days <= 0) {
    return true;
  }

  const diffMs = reference.getTime() - value.getTime();

  return diffMs >= 0 && diffMs <= days * 24 * 60 * 60 * 1000;
}

function progressAggregation(
  value: string | null,
  checkInMode: string | null,
): GuestGameProgressAggregation {
  if (normalizeProgressToken(checkInMode) === 'STREAK') return 'streak';
  switch (value) {
    case 'sum':
      return 'sum';
    case 'duration':
      return 'duration';
    case 'distinctDays':
    case 'distinct_days':
      return 'distinctDays';
    case 'exists':
      return 'exists';
    case 'streak':
      return 'streak';
    default:
      return 'count';
  }
}

function progressPercent(current: number, target: number) {
  if (target <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
}

function roundProgress(value: number) {
  return Math.round(value * 100) / 100;
}

function progressRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function progressString(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length ? trimmed : null;
}

function progressStringValues(...values: unknown[]) {
  return values.flatMap((value) => {
    if (Array.isArray(value)) {
      return value.map(progressString).filter((item): item is string => !!item);
    }

    const stringValue = progressString(value);

    return stringValue ? [stringValue] : [];
  });
}

function progressNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function progressNumberArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(progressNumber).filter((item): item is number => item !== null)
    : [];
}

function normalizeProgressToken(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? '';
}

function dateValue(value: Date | string | null | undefined) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function isWithinTimeWindow(
  date: Date,
  window: string,
  timeZone?: string | null,
) {
  const [from, to] = window.split('-').map((value) => timeToMinutes(value));

  if (from === null || to === null) {
    return false;
  }

  const current = localTimeMinutes(date, timeZone);

  return from <= to
    ? current >= from && current <= to
    : current >= from || current <= to;
}

function localDateKey(value: Date, timeZone?: string | null) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

function localWeekday(value: Date, timeZone?: string | null) {
  const token = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || 'UTC',
    weekday: 'short',
  }).format(value);
  return (
    { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<
      string,
      number
    >
  )[token];
}

function localTimeMinutes(value: Date, timeZone?: string | null) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value ?? 0);
  return part('hour') * 60 + part('minute');
}

function activeDayStreak(
  keys: string[],
  target: number,
  referenceDateKey?: string,
) {
  const days = [...new Set(keys)]
    .map((key) => Date.parse(`${key}T00:00:00Z`))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  let longest = 0;
  let current = 0;
  let previous: number | null = null;
  for (const day of days) {
    current =
      previous !== null && day - previous === 86_400_000 ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = day;
  }

  if (longest >= target) {
    return longest;
  }

  const latest = days.at(-1);
  const reference = referenceDateKey
    ? Date.parse(`${referenceDateKey}T00:00:00Z`)
    : (latest ?? Number.NaN);
  if (
    latest === undefined ||
    !Number.isFinite(reference) ||
    reference - latest > 86_400_000
  ) {
    return 0;
  }

  return current;
}

function timeToMinutes(value: string | undefined) {
  const match = value?.trim().match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}
