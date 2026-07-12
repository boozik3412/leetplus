import { Prisma } from '@prisma/client';

export type GuestGameLedgerRule = {
  type: string;
  id: string;
  title: string;
  triggerKind: string | null;
  sessionType: string | null;
  createdAt: Date;
  activatedAt: Date;
  periodFrom: Date | null;
  periodTo: Date | null;
  periodRules: Prisma.JsonValue | null;
  storeIds: string[];
};

export type GuestGameLedgerFact = {
  id: string;
  factType: string;
  confidence: string;
  happenedAt: Date | null;
  createdAt: Date;
  storeId: string | null;
  tariffName: string | null;
  tariffType: string | null;
  store: { timeZone: string | null } | null;
};

export type GuestGameLedgerEvaluation = {
  status: 'MATCHED' | 'BLOCKED' | 'NO_MATCH' | 'INSUFFICIENT_DATA';
  reason: string;
  reasons: string[];
  blockers: string[];
  facts: GuestGameLedgerFact[];
};

export function evaluateGuestGameLedgerRule(
  rule: GuestGameLedgerRule,
  facts: GuestGameLedgerFact[],
  selectedStoreId: string | null,
): GuestGameLedgerEvaluation {
  const relevantFactTypes = relevantGuestGameFacts(
    rule.triggerKind,
    rule.sessionType,
  );
  const candidates = facts.filter((fact) =>
    relevantFactTypes.includes(fact.factType),
  );

  if (candidates.length === 0) {
    return {
      status: 'NO_MATCH',
      reason: `Не найдены факты: ${relevantFactTypes.join(', ')}`,
      reasons: [],
      blockers: [`Не найдены факты: ${relevantFactTypes.join(', ')}`],
      facts: [],
    };
  }

  const matched: GuestGameLedgerFact[] = [];
  const blockers = new Set<string>();
  const insufficient = new Set<string>();

  for (const fact of candidates) {
    const happenedAt = fact.happenedAt ?? fact.createdAt;
    const factBlockers: string[] = [];
    const factInsufficient: string[] = [];

    if (happenedAt < rule.activatedAt) {
      factBlockers.push('факт произошел до активации правила');
    }
    if (rule.periodFrom && happenedAt < rule.periodFrom) {
      factBlockers.push('факт произошел до начала периода правила');
    }
    if (rule.periodTo && happenedAt > rule.periodTo) {
      factBlockers.push('факт произошел после окончания периода правила');
    }
    if (selectedStoreId && fact.storeId && fact.storeId !== selectedStoreId) {
      factBlockers.push('факт относится к другому выбранному клубу');
    }
    if (rule.storeIds.length > 0) {
      if (!fact.storeId) {
        factInsufficient.push('у факта не определен клуб');
      } else if (!rule.storeIds.includes(fact.storeId)) {
        factBlockers.push('клуб факта не входит в область правила');
      }
    }

    const periodResult = evaluateGuestGamePeriod(
      rule.periodRules,
      happenedAt,
      fact.store?.timeZone ?? null,
    );
    factBlockers.push(...periodResult.blockers);
    factInsufficient.push(...periodResult.insufficient);

    if (!factBlockers.length && !factInsufficient.length) {
      matched.push(fact);
      continue;
    }
    factBlockers.forEach((reason) => blockers.add(reason));
    factInsufficient.forEach((reason) => insufficient.add(reason));
  }

  if (matched.length > 0) {
    const factTypes = [...new Set(matched.map((fact) => fact.factType))];
    return {
      status: 'MATCHED',
      reason: `Условия подтверждены фактами: ${factTypes.join(', ')}`,
      reasons: factTypes.map((factType) => `Подтвержден факт ${factType}`),
      blockers: [],
      facts: matched,
    };
  }

  if (insufficient.size > 0 && blockers.size === 0) {
    const values = [...insufficient];
    return {
      status: 'INSUFFICIENT_DATA',
      reason: `Недостаточно данных: ${values.join('; ')}`,
      reasons: [],
      blockers: values,
      facts: candidates,
    };
  }

  const values = [...blockers, ...insufficient];
  return {
    status: 'BLOCKED',
    reason: `Факты найдены, но условия не выполнены: ${values.join('; ')}`,
    reasons: [],
    blockers: values,
    facts: candidates,
  };
}

export function guestGameRuleActivationAt(
  createdAt: Date,
  metadata: Prisma.JsonValue | null,
) {
  const record = jsonObject(metadata);
  const candidates = [record?.activatedAt, record?.restartedAt]
    .map((value) => (typeof value === 'string' ? new Date(value) : null))
    .filter((value): value is Date =>
      Boolean(value && !Number.isNaN(value.getTime())),
    );

  return candidates.reduce(
    (latest, candidate) =>
      candidate.getTime() > latest.getTime() ? candidate : latest,
    createdAt,
  );
}

export function guestGameStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export function guestGameSessionTypeFromConditions(
  conditions: Prisma.JsonValue | null,
) {
  const record = jsonObject(conditions);
  return nullableString(record?.sessionType);
}

export function relevantGuestGameFacts(
  triggerKind: string | null,
  sessionType: string | null,
) {
  const trigger = (triggerKind ?? '').toUpperCase();
  const session = (sessionType ?? '').toUpperCase();

  if (
    trigger.includes('PLAY_TIME') ||
    trigger.includes('TIME_PLAYED') ||
    trigger.includes('MINUTE') ||
    trigger.includes('HOUR')
  ) {
    return [
      'HOURLY_PLAY_TIME_ACCUMULATED',
      'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
    ];
  }

  if (trigger.includes('SESSION')) {
    if (
      session.includes('PACKET') ||
      session.includes('PACKAGE') ||
      session.includes('SUBSCRIPTION')
    ) {
      return ['PACKAGE_OR_SUBSCRIPTION_USED'];
    }
    if (session.includes('HOURLY') || session.includes('REGULAR')) {
      return ['HOURLY_SESSION_STARTED'];
    }
    return ['SESSION_STARTED', 'PACKAGE_OR_SUBSCRIPTION_USED'];
  }

  if (
    trigger.includes('PRODUCT') ||
    trigger.includes('GOODS') ||
    trigger.includes('PURCHASE') ||
    trigger.includes('BAR') ||
    trigger.includes('ASSORTMENT')
  ) {
    return ['PRODUCT_PURCHASED'];
  }
  if (trigger.includes('CHECK_IN')) {
    return ['VISIT', 'SESSION_STARTED'];
  }
  if (trigger.includes('APP_OPEN')) {
    return ['VISIT'];
  }
  return ['SESSION_STARTED', 'VISIT', 'REWARD_TRACE'];
}

function evaluateGuestGamePeriod(
  value: Prisma.JsonValue | null,
  happenedAt: Date,
  timeZone: string | null,
) {
  const rules = jsonObject(value) ?? {};
  const weekdayMode = nullableString(rules.weekdayMode)?.toUpperCase();
  const weekdays = numberValues(rules.weekdays);
  const hours = guestGameStringArray(rules.hours);
  const weekdaysOnly = rules.weekdaysOnly === true;
  const hasWeekdayRestriction =
    weekdays.length > 0 ||
    weekdaysOnly ||
    weekdayMode === 'WEEKDAYS' ||
    weekdayMode === 'WEEKENDS' ||
    weekdayMode === 'CUSTOM';

  if (!hasWeekdayRestriction && hours.length === 0) {
    return { blockers: [] as string[], insufficient: [] as string[] };
  }
  if (!timeZone) {
    return {
      blockers: [] as string[],
      insufficient: ['не указан часовой пояс клуба для проверки периода'],
    };
  }

  const local = localDateParts(happenedAt, timeZone);
  const blockers: string[] = [];
  const expectedWeekdays =
    weekdayMode === 'WEEKDAYS' || weekdaysOnly
      ? [1, 2, 3, 4, 5]
      : weekdayMode === 'WEEKENDS'
        ? [0, 6]
        : weekdays;

  if (
    expectedWeekdays.length > 0 &&
    !expectedWeekdays.includes(local.weekday)
  ) {
    blockers.push('день недели не входит в период правила');
  }
  if (
    hours.length > 0 &&
    !hours.some((window) => isWithinTimeWindow(local.minutesOfDay, window))
  ) {
    blockers.push(`время не входит в окно ${hours.join(', ')}`);
  }

  return { blockers, insufficient: [] as string[] };
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function nullableString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberValues(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6)
    : [];
}

function localDateParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  const weekday =
    (
      { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<
        string,
        number
      >
    )[part('weekday')] ?? -1;

  return {
    weekday,
    minutesOfDay: Number(part('hour')) * 60 + Number(part('minute')),
  };
}

function isWithinTimeWindow(minutesOfDay: number, window: string) {
  const [fromRaw, toRaw] = window.split('-').map((item) => item.trim());
  const toMinutes = (value: string) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value);
    if (!match) {
      return null;
    }
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
  };
  const from = toMinutes(fromRaw ?? '');
  const to = toMinutes(toRaw ?? '');
  if (from === null || to === null) {
    return false;
  }
  return from <= to
    ? minutesOfDay >= from && minutesOfDay <= to
    : minutesOfDay >= from || minutesOfDay <= to;
}
