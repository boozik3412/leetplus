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
  externalDomains?: string[];
  progressTarget: number | null;
  progressUnit: string | null;
};

export type GuestGameLedgerFact = {
  id: string;
  factType: string;
  confidence: string;
  happenedAt: Date | null;
  createdAt: Date;
  storeId: string | null;
  externalDomain?: string | null;
  tariffName: string | null;
  tariffType: string | null;
  amount: Prisma.Decimal | number | null;
  durationMinutes: number | null;
  evidence: Prisma.JsonValue | null;
  store: { timeZone: string | null } | null;
};

export type GuestGameLedgerProgress = {
  aggregation: 'count' | 'sum' | 'duration' | 'distinctDays' | 'exists';
  current: number;
  target: number;
  unit: string | null;
  matchedFacts: number;
};

export type GuestGameLedgerEvaluation = {
  status: 'MATCHED' | 'BLOCKED' | 'NO_MATCH' | 'INSUFFICIENT_DATA';
  reason: string;
  reasons: string[];
  blockers: string[];
  facts: GuestGameLedgerFact[];
  progress: GuestGameLedgerProgress | null;
};

export function evaluateGuestGameLedgerRule(
  rule: GuestGameLedgerRule,
  facts: GuestGameLedgerFact[],
  selectedStoreId: string | null,
  evaluatedAt = new Date(),
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
      progress: null,
    };
  }

  const matched: GuestGameLedgerFact[] = [];
  const blockers = new Set<string>();
  const insufficient = new Set<string>();

  for (const fact of candidates) {
    const happenedAt = fact.happenedAt ?? fact.createdAt;
    const factBlockers: string[] = [];
    const factInsufficient: string[] = [];
    const domainScopedFact =
      fact.factType === 'BALANCE_TOPUP' && fact.storeId === null;
    const ruleExternalDomains = rule.externalDomains ?? [];

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
    if (rule.storeIds.length > 0 && !domainScopedFact) {
      if (!fact.storeId) {
        factInsufficient.push('у факта не определен клуб');
      } else if (!rule.storeIds.includes(fact.storeId)) {
        factBlockers.push('клуб факта не входит в область правила');
      }
    }
    if (domainScopedFact && rule.storeIds.length > 0) {
      if (ruleExternalDomains.length === 0) {
        factInsufficient.push('у выбранных клубов не определён домен Langame');
      } else if (!fact.externalDomain) {
        factInsufficient.push('у доменного факта не определён домен Langame');
      } else if (!ruleExternalDomains.includes(fact.externalDomain)) {
        factBlockers.push(
          'домен факта не входит в область выбранных клубов правила',
        );
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
    const progressEvaluation = evaluateLedgerProgress(
      rule,
      matched,
      evaluatedAt,
    );

    if (progressEvaluation.status !== 'MATCHED') {
      return progressEvaluation;
    }

    const factTypes = [
      ...new Set(progressEvaluation.facts.map((fact) => fact.factType)),
    ];
    return {
      status: 'MATCHED',
      reason: progressEvaluation.progress
        ? `Условия подтверждены: ${progressEvaluation.progress.current}/${progressEvaluation.progress.target}${progressUnitSuffix(progressEvaluation.progress.unit)}`
        : `Условия подтверждены фактами: ${factTypes.join(', ')}`,
      reasons: [
        ...factTypes.map((factType) => `Подтвержден факт ${factType}`),
        ...(progressEvaluation.progress
          ? [
              `Прогресс: ${progressEvaluation.progress.current}/${progressEvaluation.progress.target}${progressUnitSuffix(progressEvaluation.progress.unit)}`,
            ]
          : []),
      ],
      blockers: [],
      facts: progressEvaluation.facts,
      progress: progressEvaluation.progress,
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
      progress: null,
    };
  }

  const values = [...blockers, ...insufficient];
  return {
    status: 'BLOCKED',
    reason: `Факты найдены, но условия не выполнены: ${values.join('; ')}`,
    reasons: [],
    blockers: values,
    facts: candidates,
    progress: null,
  };
}

function evaluateLedgerProgress(
  rule: GuestGameLedgerRule,
  facts: GuestGameLedgerFact[],
  evaluatedAt: Date,
): GuestGameLedgerEvaluation {
  const conditions = jsonObject(rule.periodRules) ?? {};
  const metric = jsonObject(conditions.metric) ?? {};
  const windowDays = numericValue(metric.windowDays ?? conditions.windowDays);
  const windowStart =
    windowDays && windowDays > 0
      ? new Date(evaluatedAt.getTime() - windowDays * 24 * 60 * 60 * 1000)
      : null;
  let qualifiedFacts = windowStart
    ? facts.filter(
        (fact) =>
          (fact.happenedAt ?? fact.createdAt).getTime() >=
          windowStart.getTime(),
      )
    : facts;

  if (windowStart && qualifiedFacts.length === 0) {
    const blocker = `Нет подходящих фактов за последние ${windowDays} дн.`;
    return ledgerBlockedEvaluation(blocker, facts, null);
  }

  const productFilter = filterLedgerProductFacts(
    qualifiedFacts,
    conditions,
    metric,
  );
  if (productFilter.status !== 'MATCHED') {
    if (productFilter.status === 'INSUFFICIENT_DATA') {
      return {
        status: 'INSUFFICIENT_DATA',
        reason: `Недостаточно данных: ${productFilter.reason}`,
        reasons: [],
        blockers: [productFilter.reason],
        facts: qualifiedFacts,
        progress: null,
      };
    }
    return ledgerBlockedEvaluation(productFilter.reason, qualifiedFacts, null);
  }
  qualifiedFacts = productFilter.facts;

  const amountComparison = normalizeLedgerToken(
    nullableString(metric.amountComparison ?? conditions.amountComparison),
  );
  const configuredTopupAmount = numericValue(
    metric.topupAmount ??
      conditions.topupAmount ??
      metric.amount ??
      conditions.amount,
  );
  const exactTopupAmount =
    qualifiedFacts.some((fact) => fact.factType === 'BALANCE_TOPUP') &&
    ['exact', 'equal', 'equals'].includes(amountComparison)
      ? configuredTopupAmount
      : null;

  if (exactTopupAmount !== null) {
    qualifiedFacts = qualifiedFacts.filter(
      (fact) =>
        fact.factType === 'BALANCE_TOPUP' &&
        Math.abs(decimalNumber(fact.amount) - exactTopupAmount) < 0.005,
    );
    if (qualifiedFacts.length === 0) {
      return ledgerBlockedEvaluation(
        `Нет пополнения ровно на ${exactTopupAmount} руб.`,
        facts,
        null,
      );
    }
  }

  const minSpendAmount =
    numericValue(metric.minSpendAmount ?? conditions.minSpendAmount) ??
    (['at_least', 'minimum', 'min'].includes(amountComparison)
      ? configuredTopupAmount
      : null);
  if (minSpendAmount !== null) {
    qualifiedFacts = qualifiedFacts.filter(
      (fact) => decimalNumber(fact.amount) >= minSpendAmount,
    );
    if (qualifiedFacts.length === 0) {
      return ledgerBlockedEvaluation(
        `Нет покупки на сумму не менее ${minSpendAmount} руб.`,
        facts,
        null,
      );
    }
  }

  const explicitTarget =
    numericValue(metric.target) ??
    numericValue(conditions.progressTarget) ??
    rule.progressTarget;
  const aggregation = ledgerAggregation(
    nullableString(metric.aggregation) ??
      nullableString(conditions.aggregation),
    rule.progressUnit,
  );
  const hasProgressDefinition =
    Object.keys(metric).length > 0 ||
    (explicitTarget !== null && explicitTarget > 1) ||
    ['minute', 'minutes', 'hour', 'hours', 'purchase', 'rub', 'day'].includes(
      normalizeLedgerToken(rule.progressUnit),
    );

  if (!hasProgressDefinition) {
    return {
      status: 'MATCHED',
      reason: 'Подходящий факт найден',
      reasons: [],
      blockers: [],
      facts: qualifiedFacts,
      progress: null,
    };
  }

  const target = ledgerTarget(explicitTarget ?? 1, rule.progressUnit);
  const current = ledgerProgressValue(aggregation, qualifiedFacts);
  const unit = ledgerProgressUnit(aggregation, rule.progressUnit);
  const progress: GuestGameLedgerProgress = {
    aggregation,
    current,
    target,
    unit,
    matchedFacts: qualifiedFacts.length,
  };

  if (current < target) {
    return ledgerBlockedEvaluation(
      `Цель еще не выполнена: ${current}/${target}${progressUnitSuffix(unit)}`,
      qualifiedFacts,
      progress,
    );
  }

  return {
    status: 'MATCHED',
    reason: `Цель выполнена: ${current}/${target}${progressUnitSuffix(unit)}`,
    reasons: [],
    blockers: [],
    facts: qualifiedFacts,
    progress,
  };
}

function filterLedgerProductFacts(
  facts: GuestGameLedgerFact[],
  conditions: Record<string, unknown>,
  metric: Record<string, unknown>,
):
  | { status: 'MATCHED'; facts: GuestGameLedgerFact[] }
  | { status: 'BLOCKED' | 'INSUFFICIENT_DATA'; reason: string } {
  const selectors = {
    productIds: stringValues(
      metric.productIds,
      metric.productId,
      conditions.productIds,
      conditions.productId,
    ),
    externalProductIds: stringValues(
      metric.externalProductIds,
      metric.externalProductId,
      conditions.externalProductIds,
      conditions.externalProductId,
    ),
    productNames: lowerStringValues(
      metric.productNames,
      metric.productName,
      conditions.productNames,
      conditions.productName,
    ),
    categoryIds: stringValues(
      metric.categoryIds,
      metric.categoryId,
      conditions.categoryIds,
      conditions.categoryId,
    ),
    categoryNames: lowerStringValues(
      metric.categoryNames,
      metric.categoryName,
      conditions.categoryNames,
      conditions.categoryName,
    ),
  };
  const hasSelectors = Object.values(selectors).some((values) => values.length);

  if (!hasSelectors) {
    return { status: 'MATCHED', facts };
  }

  const productFacts = facts.filter(
    (fact) => fact.factType === 'PRODUCT_PURCHASED',
  );
  const fieldsPresent = new Set<string>();
  const matched = productFacts.filter((fact) => {
    const evidence = jsonObject(fact.evidence) ?? {};
    const productId = nullableString(evidence.productId);
    const externalProductId = nullableString(evidence.externalProductId);
    const productName =
      nullableString(evidence.productName)?.toLowerCase() ?? null;
    const categoryId = nullableString(evidence.categoryId);
    const categoryName =
      nullableString(evidence.categoryName)?.toLowerCase() ?? null;
    if (productId) fieldsPresent.add('productIds');
    if (externalProductId || productId) fieldsPresent.add('externalProductIds');
    if (productName) fieldsPresent.add('productNames');
    if (categoryId) fieldsPresent.add('categoryIds');
    if (categoryName) fieldsPresent.add('categoryNames');

    return (
      matchesLedgerSelector(selectors.productIds, [
        productId,
        externalProductId,
      ]) &&
      matchesLedgerSelector(selectors.externalProductIds, [
        externalProductId,
        productId,
      ]) &&
      matchesLedgerSelector(selectors.productNames, [productName]) &&
      matchesLedgerSelector(selectors.categoryIds, [categoryId]) &&
      matchesLedgerSelector(selectors.categoryNames, [categoryName])
    );
  });

  if (matched.length > 0) {
    return { status: 'MATCHED', facts: matched };
  }

  const missingFields = Object.entries(selectors)
    .filter(([, values]) => values.length > 0)
    .map(([field]) => field)
    .filter((field) => !fieldsPresent.has(field));
  if (missingFields.length > 0) {
    return {
      status: 'INSUFFICIENT_DATA',
      reason: `в фактах покупки отсутствуют поля для проверки: ${missingFields.join(', ')}`,
    };
  }

  return {
    status: 'BLOCKED',
    reason: 'Покупки не соответствуют выбранным товарам или категориям',
  };
}

function ledgerBlockedEvaluation(
  blocker: string,
  facts: GuestGameLedgerFact[],
  progress: GuestGameLedgerProgress | null,
): GuestGameLedgerEvaluation {
  return {
    status: 'BLOCKED',
    reason: `Факты найдены, но условия не выполнены: ${blocker}`,
    reasons: [],
    blockers: [blocker],
    facts,
    progress,
  };
}

function ledgerAggregation(
  configured: string | null,
  progressUnit: string | null,
): GuestGameLedgerProgress['aggregation'] {
  const value = normalizeLedgerToken(configured);
  if (
    ['sum', 'duration', 'distinctdays', 'distinct_days', 'exists'].includes(
      value,
    )
  ) {
    return value === 'distinctdays' || value === 'distinct_days'
      ? 'distinctDays'
      : (value as GuestGameLedgerProgress['aggregation']);
  }
  const unit = normalizeLedgerToken(progressUnit);
  if (['minute', 'minutes', 'hour', 'hours'].includes(unit)) return 'duration';
  if (['rub', 'ruble', 'rubles'].includes(unit)) return 'sum';
  if (['day', 'days'].includes(unit)) return 'distinctDays';
  return 'count';
}

function ledgerProgressValue(
  aggregation: GuestGameLedgerProgress['aggregation'],
  facts: GuestGameLedgerFact[],
) {
  if (aggregation === 'exists') return facts.length > 0 ? 1 : 0;
  if (aggregation === 'sum') {
    return roundLedgerValue(
      facts.reduce(
        (sum, fact) => sum + Math.max(0, decimalNumber(fact.amount)),
        0,
      ),
    );
  }
  if (aggregation === 'duration') {
    return facts.reduce(
      (sum, fact) => sum + Math.max(0, fact.durationMinutes ?? 0),
      0,
    );
  }
  if (aggregation === 'distinctDays') {
    return new Set(
      facts.map((fact) =>
        (fact.happenedAt ?? fact.createdAt).toISOString().slice(0, 10),
      ),
    ).size;
  }
  return facts.length;
}

function ledgerTarget(value: number, unit: string | null) {
  return ['hour', 'hours'].includes(normalizeLedgerToken(unit))
    ? value * 60
    : value;
}

function ledgerProgressUnit(
  aggregation: GuestGameLedgerProgress['aggregation'],
  configured: string | null,
) {
  if (aggregation === 'duration') return 'minute';
  if (aggregation === 'sum') return 'rub';
  return configured;
}

function progressUnitSuffix(unit: string | null) {
  if (!unit) return '';
  const labels: Record<string, string> = {
    minute: ' мин.',
    minutes: ' мин.',
    rub: ' руб.',
    purchase: ' покупок',
    day: ' дн.',
  };
  return labels[normalizeLedgerToken(unit)] ?? ` ${unit}`;
}

function matchesLedgerSelector(
  expected: string[],
  actual: Array<string | null | undefined>,
) {
  if (!expected.length) return true;
  return actual.some((value) => !!value && expected.includes(value));
}

function stringValues(...values: unknown[]) {
  return values.flatMap((value) => {
    if (Array.isArray(value)) {
      return value.map(nullableString).filter((item): item is string => !!item);
    }
    const item = nullableString(value);
    return item ? [item] : [];
  });
}

function lowerStringValues(...values: unknown[]) {
  return stringValues(...values).map((value) => value.toLowerCase());
}

function numericValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function decimalNumber(value: Prisma.Decimal | number | null) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === null) return 0;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeLedgerToken(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
}

function roundLedgerValue(value: number) {
  return Math.round(value * 100) / 100;
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

export function guestGameRuleExternalDomains(
  storeIds: string[],
  stores: Array<{ id: string; externalDomain: string | null }>,
) {
  if (storeIds.length === 0) {
    return [];
  }

  const selectedStoreIds = new Set(storeIds);
  return [
    ...new Set(
      stores
        .filter((store) => selectedStoreIds.has(store.id))
        .map((store) => nullableString(store.externalDomain))
        .filter((domain): domain is string => Boolean(domain)),
    ),
  ];
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
    if (
      session.includes('PACKET') ||
      session.includes('PACKAGE') ||
      session.includes('SUBSCRIPTION')
    ) {
      return ['PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED'];
    }
    if (session.includes('HOURLY') || session.includes('REGULAR')) {
      return ['HOURLY_PLAY_TIME_ACCUMULATED'];
    }
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
    trigger.includes('BALANCE_TOPUP') ||
    trigger.includes('BALANCE_TOP_UP') ||
    trigger.includes('ACCOUNT_TOPUP') ||
    trigger.includes('TOPUP') ||
    trigger.includes('DEPOSIT')
  ) {
    return ['BALANCE_TOPUP'];
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
