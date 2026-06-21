export type GuestGameProgressAggregation =
  | 'count'
  | 'sum'
  | 'duration'
  | 'distinctDays'
  | 'exists';

export type GuestGameProgressEvent = {
  eventType: string;
  occurredAt: Date;
  storeId?: string | null;
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
  periodFrom?: Date | string | null;
  periodTo?: Date | string | null;
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
  const allEvents = [
    ...historyEvents,
    ...(currentEvent ? [currentEvent] : []),
  ].filter((event) =>
    matchesProgressEvent(rule, conditions, metric, event, referenceEvent, {
      eventTypes,
      windowDays,
    }),
  );
  const current = progressValue(aggregation, allEvents);

  return {
    applicable: true,
    aggregation,
    current,
    target: resolvedTarget,
    percent: progressPercent(current, resolvedTarget),
    completed: current >= resolvedTarget,
    matchedEvents: allEvents.length,
    unit: rule.progressUnit ?? progressString(metric.unit) ?? null,
    windowDays,
  };
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
    BALANCE_TOPUP: ['BALANCE_TOPUP'],
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

    if (!accepted.includes(actual)) {
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
    if (!event.storeId || !rule.storeIds.includes(event.storeId)) {
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

  if (!matchesWeekdays(conditions, metric, event.occurredAt)) {
    return false;
  }

  if (!matchesHours(conditions, metric, event.occurredAt)) {
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
      events.map((event) => event.occurredAt.toISOString().slice(0, 10)),
    ).size;
  }

  return events.length;
}

function matchesWeekdays(
  conditions: Record<string, unknown>,
  metric: Record<string, unknown>,
  occurredAt: Date,
) {
  const weekdays = progressNumberArray(metric.weekdays ?? conditions.weekdays);
  const weekday = occurredAt.getDay();

  if (weekdays.length && !weekdays.includes(weekday)) {
    return false;
  }

  if (
    (metric.weekdaysOnly === true || conditions.weekdaysOnly === true) &&
    [0, 6].includes(weekday)
  ) {
    return false;
  }

  return true;
}

function matchesHours(
  conditions: Record<string, unknown>,
  metric: Record<string, unknown>,
  occurredAt: Date,
) {
  const hours = progressStringValues(metric.hours, conditions.hours);

  return (
    !hours.length ||
    hours.some((window) => isWithinTimeWindow(occurredAt, window))
  );
}

function matchesSessionType(
  conditions: Record<string, unknown>,
  event: GuestGameProgressEvent,
) {
  const expectedType = progressString(conditions.sessionType);

  if (expectedType && expectedType !== event.sessionType) {
    return false;
  }

  const packetMode =
    progressString(conditions.packetMode)?.toUpperCase() ?? 'ANY';

  if (packetMode === 'PACKET_ONLY') {
    return event.sessionPacket === true;
  }

  if (packetMode === 'NON_PACKET_ONLY') {
    return event.sessionPacket === false;
  }

  return true;
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
      progressStringValues(
        metric.categoryIds,
        metric.categoryId,
        conditions.categoryIds,
        conditions.categoryId,
      ),
      event.categoryId,
    ) &&
    matchesOneOf(
      progressStringValues(
        metric.categoryNames,
        metric.categoryName,
        conditions.categoryNames,
        conditions.categoryName,
      ).map((value) => value.toLowerCase()),
      event.categoryName?.toLowerCase() ?? null,
    )
  );
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
): GuestGameProgressAggregation {
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

function isWithinTimeWindow(date: Date, window: string) {
  const [from, to] = window.split('-').map((value) => timeToMinutes(value));

  if (from === null || to === null) {
    return false;
  }

  const current = date.getHours() * 60 + date.getMinutes();

  return from <= to
    ? current >= from && current <= to
    : current >= from || current <= to;
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
