import { Prisma } from '@prisma/client';

import { guestGameTriggerMatches } from './guest-game-progress';

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
  domainTimeZones?: Record<string, string>;
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
  sourceExternalId?: string | null;
  sourceHash?: string | null;
  sessionExternalId?: string | null;
};

export type GuestGameLedgerEvaluationMode =
  | 'EVENT_PARITY'
  | 'HISTORICAL_RECOVERY';

export type GuestGameLedgerEvaluationContext = {
  mode: GuestGameLedgerEvaluationMode;
  sourceEventType?: string | null;
  sourceFactId?: string | null;
  sourceExternalId?: string | null;
  sourceOriginKey?: string | null;
  sourceSessionExternalId?: string | null;
  occurredAt?: Date | null;
  correlationWindowMs?: number;
};

export type GuestGameLedgerProgress = {
  aggregation:
    | 'count'
    | 'sum'
    | 'duration'
    | 'distinctDays'
    | 'exists'
    | 'streak';
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
  context: GuestGameLedgerEvaluationContext = {
    mode: 'HISTORICAL_RECOVERY',
  },
): GuestGameLedgerEvaluation {
  const relevantFactTypes = relevantGuestGameFacts(
    rule.triggerKind,
    rule.sessionType,
  );
  const relevantCandidates = facts.filter((fact) =>
    relevantFactTypes.includes(fact.factType),
  );
  const eventParity = prepareEventParityCandidates(
    rule,
    relevantCandidates,
    selectedStoreId,
    evaluatedAt,
    context,
  );
  if ('evaluation' in eventParity) {
    return eventParity.evaluation;
  }
  const candidates = eventParity.candidates;

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
    const scope = evaluateLedgerFactScope(rule, fact, selectedStoreId);
    const factBlockers = scope.blockers;
    const factInsufficient = scope.insufficient;

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

function prepareEventParityCandidates(
  rule: GuestGameLedgerRule,
  candidates: GuestGameLedgerFact[],
  selectedStoreId: string | null,
  evaluatedAt: Date,
  context: GuestGameLedgerEvaluationContext,
):
  | { candidates: GuestGameLedgerFact[] }
  | { evaluation: GuestGameLedgerEvaluation } {
  if (context.mode !== 'EVENT_PARITY') {
    return { candidates };
  }

  const sourceEventType = nullableString(context.sourceEventType);
  if (!sourceEventType) {
    return {
      evaluation: ledgerEventParityBlocked('EVENT_PARITY_SOURCE_EVENT_MISSING'),
    };
  }

  if (!ledgerTriggerMatchesSourceEvent(rule.triggerKind, sourceEventType)) {
    return {
      evaluation: ledgerEventParityBlocked(
        `EVENT_TRIGGER_MISMATCH: ${sourceEventType} does not satisfy ${rule.triggerKind ?? 'UNKNOWN'}`,
      ),
    };
  }

  if (candidates.length === 0) {
    return { candidates };
  }

  const anchors = candidates.filter((fact) =>
    ledgerFactCorrelatesWithCurrentEvent(fact, context),
  );
  if (anchors.length === 0) {
    return {
      evaluation: {
        status: 'NO_MATCH',
        reason: 'EVENT_PARITY_CURRENT_FACT_NOT_FOUND',
        reasons: [],
        blockers: ['EVENT_PARITY_CURRENT_FACT_NOT_FOUND'],
        facts: [],
        progress: null,
      },
    };
  }

  const scopedAnchors: GuestGameLedgerFact[] = [];
  const anchorBlockers = new Set<string>();
  const anchorInsufficient = new Set<string>();
  for (const anchor of anchors) {
    const scope = evaluateLedgerFactScope(rule, anchor, selectedStoreId);
    const constraints = evaluateEventParityAnchorConstraints(
      rule,
      anchor,
      evaluatedAt,
    );
    const blockers = [...scope.blockers, ...constraints.blockers];
    const insufficient = [...scope.insufficient, ...constraints.insufficient];
    if (blockers.length === 0 && insufficient.length === 0) {
      scopedAnchors.push(anchor);
      continue;
    }
    blockers.forEach((reason) => anchorBlockers.add(reason));
    insufficient.forEach((reason) => anchorInsufficient.add(reason));
  }

  if (scopedAnchors.length === 0) {
    const blockers = [...anchorBlockers, ...anchorInsufficient];
    return {
      evaluation: {
        status:
          anchorBlockers.size === 0 && anchorInsufficient.size > 0
            ? 'INSUFFICIENT_DATA'
            : 'BLOCKED',
        reason: `EVENT_PARITY_CURRENT_FACT_OUT_OF_SCOPE: ${blockers.join('; ')}`,
        reasons: [],
        blockers: ['EVENT_PARITY_CURRENT_FACT_OUT_OF_SCOPE', ...blockers],
        facts: anchors,
        progress: null,
      },
    };
  }

  // A cumulative condition may use earlier facts, but only after the current
  // event has been independently observed in the ledger and passed the rule
  // scope itself. One-shot rules must never be unlocked by an unrelated
  // historical fact.
  return {
    candidates: guestGameLedgerRuleIsCumulative(rule)
      ? candidates
      : scopedAnchors,
  };
}

function evaluateLedgerFactScope(
  rule: GuestGameLedgerRule,
  fact: GuestGameLedgerFact,
  selectedStoreId: string | null,
) {
  const happenedAt = fact.happenedAt ?? fact.createdAt;
  const blockers: string[] = [];
  const insufficient: string[] = [];
  const domainScopedFact =
    fact.factType === 'BALANCE_TOPUP' && fact.storeId === null;
  const ruleExternalDomains = rule.externalDomains ?? [];

  if (happenedAt < rule.activatedAt) {
    blockers.push('факт произошел до активации правила');
  }
  if (rule.periodFrom && happenedAt < rule.periodFrom) {
    blockers.push('факт произошел до начала периода правила');
  }
  if (rule.periodTo && happenedAt > rule.periodTo) {
    blockers.push('факт произошел после окончания периода правила');
  }
  if (selectedStoreId && fact.storeId && fact.storeId !== selectedStoreId) {
    blockers.push('факт относится к другому выбранному клубу');
  }
  if (rule.storeIds.length > 0 && !domainScopedFact) {
    if (!fact.storeId) {
      insufficient.push('у факта не определен клуб');
    } else if (!rule.storeIds.includes(fact.storeId)) {
      blockers.push('клуб факта не входит в область правила');
    }
  }
  if (domainScopedFact && rule.storeIds.length > 0) {
    if (ruleExternalDomains.length === 0) {
      insufficient.push('у выбранных клубов не определён домен Langame');
    } else if (!fact.externalDomain) {
      insufficient.push('у доменного факта не определён домен Langame');
    } else if (!ruleExternalDomains.includes(fact.externalDomain)) {
      blockers.push('домен факта не входит в область выбранных клубов правила');
    }
  }

  const periodResult = evaluateGuestGamePeriod(
    rule.periodRules,
    happenedAt,
    ledgerFactTimeZone(rule, fact),
  );
  blockers.push(...periodResult.blockers);
  insufficient.push(...periodResult.insufficient);

  return { blockers, insufficient };
}

function evaluateEventParityAnchorConstraints(
  rule: GuestGameLedgerRule,
  anchor: GuestGameLedgerFact,
  evaluatedAt: Date,
) {
  const conditions = jsonObject(rule.periodRules) ?? {};
  const metric = jsonObject(conditions.metric) ?? {};
  const blockers: string[] = [];
  const insufficient: string[] = [];
  const happenedAt = anchor.happenedAt ?? anchor.createdAt;
  const windowDays = numericValue(metric.windowDays ?? conditions.windowDays);
  if (
    windowDays !== null &&
    windowDays > 0 &&
    happenedAt.getTime() < evaluatedAt.getTime() - windowDays * 86_400_000
  ) {
    blockers.push(`current fact is outside the last ${windowDays} days`);
  }

  const productFilter = filterLedgerProductFacts([anchor], conditions, metric);
  if (productFilter.status === 'INSUFFICIENT_DATA') {
    insufficient.push(productFilter.reason);
  } else if (productFilter.status === 'BLOCKED') {
    blockers.push(productFilter.reason);
  }

  const minSessionMinutes = numericValue(
    metric.minSessionMinutes ?? conditions.minSessionMinutes,
  );
  if (
    minSessionMinutes !== null &&
    Math.max(0, anchor.durationMinutes ?? 0) < minSessionMinutes
  ) {
    blockers.push(
      `current session is shorter than ${minSessionMinutes} minutes`,
    );
  }

  const amountComparison = normalizeLedgerToken(
    nullableString(metric.amountComparison ?? conditions.amountComparison),
  );
  const configuredAmount = numericValue(
    metric.topupAmount ??
      conditions.topupAmount ??
      metric.amount ??
      conditions.amount,
  );
  const exactRequiredAmount =
    numericValue(metric.exactSpendAmount ?? conditions.exactSpendAmount) ??
    (anchor.factType === 'BALANCE_TOPUP' &&
    ['exact', 'equal', 'equals'].includes(amountComparison)
      ? configuredAmount
      : null);
  if (
    exactRequiredAmount !== null &&
    Math.abs(decimalNumber(anchor.amount) - exactRequiredAmount) >= 0.005
  ) {
    blockers.push(`current fact amount is not exactly ${exactRequiredAmount}`);
  }

  const minSpendAmount =
    numericValue(metric.minSpendAmount ?? conditions.minSpendAmount) ??
    (['at_least', 'minimum', 'min'].includes(amountComparison)
      ? configuredAmount
      : null);
  if (
    minSpendAmount !== null &&
    decimalNumber(anchor.amount) < minSpendAmount
  ) {
    blockers.push(`current fact amount is below ${minSpendAmount}`);
  }

  return { blockers, insufficient };
}

function ledgerTriggerMatchesSourceEvent(
  triggerKind: string | null,
  sourceEventType: string,
) {
  if (guestGameTriggerMatches(triggerKind, sourceEventType)) {
    return true;
  }

  const trigger = normalizeLedgerToken(triggerKind).toUpperCase();
  const sourceEvent = normalizeLedgerToken(sourceEventType).toUpperCase();
  return (
    (trigger.includes('PLAY_TIME') || trigger.includes('TIME_PLAYED')) &&
    ['PLAY_HOUR', 'SESSION_STOP'].includes(sourceEvent)
  );
}

function ledgerFactCorrelatesWithCurrentEvent(
  fact: GuestGameLedgerFact,
  context: GuestGameLedgerEvaluationContext,
) {
  const sourceIdentifiers = new Set(
    [
      context.sourceFactId,
      context.sourceExternalId,
      context.sourceSessionExternalId,
    ]
      .map(nullableString)
      .filter((value): value is string => Boolean(value)),
  );
  const evidence = jsonObject(fact.evidence) ?? {};
  const strongFactIdentifiers = [
    fact.sourceExternalId,
    fact.sessionExternalId,
    evidence.sourceFactId,
    evidence.sourceExternalId,
    evidence.sessionExternalId,
    evidence.externalId,
    evidence.sessionId,
  ]
    .map(nullableString)
    .filter((value): value is string => Boolean(value));

  if (
    sourceIdentifiers.has(fact.id) ||
    strongFactIdentifiers.some((value) => sourceIdentifiers.has(value))
  ) {
    return true;
  }

  const sourceOriginKey = nullableString(context.sourceOriginKey);
  if (
    sourceOriginKey &&
    sourceOriginKey === nullableString(evidence.originKey)
  ) {
    return true;
  }

  // Do not override a conflicting stable identity with a timestamp guess.
  if (strongFactIdentifiers.length > 0) {
    return false;
  }

  const occurredAt = context.occurredAt;
  const factAt = fact.happenedAt ?? fact.createdAt;
  if (!occurredAt || Number.isNaN(occurredAt.getTime())) {
    return false;
  }
  const correlationWindowMs = Math.max(
    0,
    context.correlationWindowMs ?? 90_000,
  );
  return (
    Math.abs(factAt.getTime() - occurredAt.getTime()) <= correlationWindowMs
  );
}

function guestGameLedgerRuleIsCumulative(rule: GuestGameLedgerRule) {
  const conditions = jsonObject(rule.periodRules) ?? {};
  const metric = jsonObject(conditions.metric) ?? {};
  const aggregation = normalizeLedgerToken(
    nullableString(metric.aggregation) ??
      nullableString(conditions.aggregation),
  );
  const target =
    numericValue(metric.target ?? conditions.progressTarget) ??
    rule.progressTarget ??
    null;

  return (
    ['sum', 'duration', 'distinctdays', 'streak'].includes(aggregation) ||
    (target !== null && target > 1)
  );
}

function ledgerEventParityBlocked(reason: string): GuestGameLedgerEvaluation {
  return {
    status: 'BLOCKED',
    reason,
    reasons: [],
    blockers: [reason],
    facts: [],
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
  const aggregation = ledgerAggregation(
    nullableString(metric.aggregation) ??
      nullableString(conditions.aggregation),
    rule.progressUnit,
  );
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

  qualifiedFacts = dedupeLedgerSessionFacts(qualifiedFacts, aggregation);

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
  const productCoverageBlocker = productFilter.coverageBlocker ?? null;

  const minSessionMinutes = numericValue(
    metric.minSessionMinutes ?? conditions.minSessionMinutes,
  );
  if (minSessionMinutes !== null) {
    qualifiedFacts = qualifiedFacts.filter(
      (fact) => Math.max(0, fact.durationMinutes ?? 0) >= minSessionMinutes,
    );
    if (qualifiedFacts.length === 0) {
      return ledgerBlockedEvaluation(
        `Нет сессии длительностью не менее ${minSessionMinutes} мин.`,
        facts,
        null,
      );
    }
  }

  const amountComparison = normalizeLedgerToken(
    nullableString(metric.amountComparison ?? conditions.amountComparison),
  );
  const configuredTopupAmount = numericValue(
    metric.topupAmount ??
      conditions.topupAmount ??
      metric.amount ??
      conditions.amount,
  );
  const exactSpendAmount = numericValue(
    metric.exactSpendAmount ?? conditions.exactSpendAmount,
  );
  const exactRequiredAmount =
    exactSpendAmount ??
    (qualifiedFacts.some((fact) => fact.factType === 'BALANCE_TOPUP') &&
    ['exact', 'equal', 'equals'].includes(amountComparison)
      ? configuredTopupAmount
      : null);

  if (exactRequiredAmount !== null) {
    qualifiedFacts = qualifiedFacts.filter(
      (fact) =>
        Math.abs(decimalNumber(fact.amount) - exactRequiredAmount) < 0.005,
    );
    if (qualifiedFacts.length === 0) {
      return ledgerBlockedEvaluation(
        `Нет подходящего факта с суммой ровно ${exactRequiredAmount} руб.`,
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
  const hasProgressDefinition =
    Object.keys(metric).length > 0 ||
    (explicitTarget !== null && explicitTarget > 1) ||
    ['minute', 'minutes', 'hour', 'hours', 'purchase', 'rub', 'day'].includes(
      normalizeLedgerToken(rule.progressUnit),
    );

  if (
    ['distinctDays', 'streak'].includes(aggregation) &&
    qualifiedFacts.some((fact) => !localFactDateKey(rule, fact))
  ) {
    return {
      status: 'INSUFFICIENT_DATA',
      reason:
        'Недостаточно данных: у факта не определён корректный часовой пояс клуба',
      reasons: [],
      blockers: ['LEDGER_LOCAL_DAY_TIMEZONE_MISSING'],
      facts: qualifiedFacts,
      progress: null,
    };
  }

  if (!hasProgressDefinition) {
    if (productCoverageBlocker) {
      return ledgerBlockedEvaluation(
        productCoverageBlocker,
        qualifiedFacts,
        null,
      );
    }
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
  const current = ledgerProgressValue(
    aggregation,
    qualifiedFacts,
    rule,
    target,
    evaluatedAt,
  );
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

  if (productCoverageBlocker) {
    return ledgerBlockedEvaluation(
      productCoverageBlocker,
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
  | {
      status: 'MATCHED';
      facts: GuestGameLedgerFact[];
      coverageBlocker?: string;
    }
  | { status: 'BLOCKED' | 'INSUFFICIENT_DATA'; reason: string } {
  const categorySource =
    nullableString(
      metric.purchaseSource ?? conditions.purchaseSource,
    )?.toUpperCase() === 'CATEGORY';
  const categoryCatalogSource =
    nullableString(
      metric.categoryCatalogSource ?? conditions.categoryCatalogSource,
    )?.toUpperCase() === 'LEETPLUS'
      ? 'LEETPLUS'
      : 'LANGAME';
  const productRefs = Array.isArray(metric.productRefs)
    ? metric.productRefs
        .filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === 'object' && !Array.isArray(item),
        )
        .map((item) => stringValues(item.productId, item.externalProductId))
        .filter((identifiers) => identifiers.length > 0)
    : [];
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
    categoryIds:
      categorySource && categoryCatalogSource !== 'LEETPLUS'
        ? []
        : stringValues(
            metric.categoryIds,
            metric.categoryId,
            conditions.categoryIds,
            conditions.categoryId,
          ),
    externalCategoryKeys:
      categorySource && categoryCatalogSource === 'LEETPLUS'
        ? []
        : stringValues(
            metric.externalCategoryKeys,
            metric.externalCategoryKey,
            conditions.externalCategoryKeys,
            conditions.externalCategoryKey,
          ),
    categoryNames: categorySource
      ? []
      : lowerStringValues(
          metric.categoryNames,
          metric.categoryName,
          conditions.categoryNames,
          conditions.categoryName,
        ),
  };
  const hasSelectors = Object.values(selectors).some((values) => values.length);
  const selectedProductIdentifiers = [
    ...new Set([
      ...selectors.productIds,
      ...selectors.externalProductIds,
      ...productRefs.flat(),
    ]),
  ];

  if (!hasSelectors && productRefs.length === 0) {
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
    const externalCategoryKey = nullableString(evidence.externalCategoryKey);
    const categoryName =
      nullableString(evidence.categoryName)?.toLowerCase() ?? null;
    if (productId) fieldsPresent.add('productIds');
    if (externalProductId || productId) fieldsPresent.add('externalProductIds');
    if (productName) fieldsPresent.add('productNames');
    if (categoryId) fieldsPresent.add('categoryIds');
    if (externalCategoryKey) fieldsPresent.add('externalCategoryKeys');
    if (categoryName) fieldsPresent.add('categoryNames');

    return (
      matchesLedgerSelector(selectedProductIdentifiers, [
        productId,
        externalProductId,
      ]) &&
      matchesLedgerSelector(selectors.productNames, [productName]) &&
      matchesLedgerSelector(selectors.categoryIds, [categoryId]) &&
      matchesLedgerSelector(selectors.externalCategoryKeys, [
        externalCategoryKey,
      ]) &&
      matchesLedgerSelector(selectors.categoryNames, [categoryName])
    );
  });

  if (matched.length > 0) {
    const productMatch = nullableString(
      metric.productMatch ?? conditions.productMatch,
    )?.toUpperCase();
    if (
      categorySource &&
      productMatch === 'ALL' &&
      Array.isArray(metric.categorySelections)
    ) {
      const selectionField =
        categoryCatalogSource === 'LEETPLUS'
          ? 'categoryIds'
          : 'externalCategoryKeys';
      const categorySelections = metric.categorySelections
        .filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === 'object' && !Array.isArray(item),
        )
        .map((item) => stringValues(item[selectionField]))
        .filter((keys) => keys.length > 0);
      const coverageFacts = categorySelections
        .map((keys) =>
          matched.find((fact) => {
            const evidence = jsonObject(fact.evidence) ?? {};
            const key = nullableString(
              categoryCatalogSource === 'LEETPLUS'
                ? evidence.categoryId
                : evidence.externalCategoryKey,
            );
            return Boolean(key && keys.includes(key));
          }),
        )
        .filter((fact): fact is GuestGameLedgerFact => Boolean(fact));
      const missingCategoryCount =
        categorySelections.length - coverageFacts.length;
      return {
        status: 'MATCHED',
        facts: matched,
        ...(missingCategoryCount > 0
          ? {
              coverageBlocker: `Куплены не все выбранные категории: отсутствует ${missingCategoryCount}`,
            }
          : {}),
      };
    }
    if (productMatch === 'ALL') {
      const requiredProducts = productRefs.length
        ? productRefs
        : (selectors.externalProductIds.length
            ? selectors.externalProductIds
            : selectors.productIds
          ).map((id) => [id]);
      const missingProductCount = requiredProducts.filter(
        (identifiers) =>
          !matched.some((fact) => {
            const evidence = jsonObject(fact.evidence) ?? {};
            return identifiers.some((id) =>
              [
                nullableString(evidence.productId),
                nullableString(evidence.externalProductId),
              ].includes(id),
            );
          }),
      );
      if (missingProductCount.length > 0) {
        return {
          status: 'MATCHED',
          facts: matched,
          coverageBlocker: `Куплены не все выбранные товары: отсутствует ${missingProductCount.length}`,
        };
      }
    }
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
    [
      'sum',
      'duration',
      'distinctdays',
      'distinct_days',
      'exists',
      'streak',
    ].includes(value)
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

function dedupeLedgerSessionFacts(
  facts: GuestGameLedgerFact[],
  aggregation: GuestGameLedgerProgress['aggregation'],
) {
  if (!['count', 'duration', 'distinctDays', 'streak'].includes(aggregation)) {
    return facts;
  }

  const selected = new Map<string, GuestGameLedgerFact>();
  const unkeyed: GuestGameLedgerFact[] = [];
  for (const fact of facts) {
    if (!ledgerSessionFact(fact)) {
      unkeyed.push(fact);
      continue;
    }
    const identity =
      nullableString(fact.sessionExternalId) ??
      nullableString(fact.sourceExternalId);
    if (!identity) {
      unkeyed.push(fact);
      continue;
    }
    const scope =
      nullableString(fact.externalDomain) ?? nullableString(fact.storeId) ?? '';
    const key = `${scope}\u0000${identity}`;
    const current = selected.get(key);
    if (!current || compareLedgerSessionFacts(fact, current, aggregation) > 0) {
      selected.set(key, fact);
    }
  }

  const retained = new Set([...selected.values(), ...unkeyed]);
  return facts.filter((fact) => retained.has(fact));
}

function ledgerSessionFact(fact: GuestGameLedgerFact) {
  return (
    fact.factType.includes('SESSION') ||
    fact.factType.includes('PLAY_TIME') ||
    fact.factType === 'PACKAGE_OR_SUBSCRIPTION_USED'
  );
}

function compareLedgerSessionFacts(
  left: GuestGameLedgerFact,
  right: GuestGameLedgerFact,
  aggregation: GuestGameLedgerProgress['aggregation'],
) {
  const score = (fact: GuestGameLedgerFact) => [
    fact.confidence === 'EXACT' ? 1 : 0,
    fact.factType === 'SESSION_STARTED' ? 1 : 0,
    aggregation === 'duration' ? Math.max(0, fact.durationMinutes ?? 0) : 0,
    (fact.happenedAt ?? fact.createdAt).getTime(),
    fact.createdAt.getTime(),
  ];
  const leftScore = score(left);
  const rightScore = score(right);
  for (let index = 0; index < leftScore.length; index += 1) {
    const difference = leftScore[index] - rightScore[index];
    if (difference !== 0) return difference;
  }
  return left.id.localeCompare(right.id);
}

function ledgerProgressValue(
  aggregation: GuestGameLedgerProgress['aggregation'],
  facts: GuestGameLedgerFact[],
  rule: GuestGameLedgerRule,
  target: number,
  evaluatedAt: Date,
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
    return new Set(facts.map((fact) => localFactDateKey(rule, fact)!)).size;
  }
  if (aggregation === 'streak') {
    return activeLedgerDayStreak(
      facts.map((fact) => localFactDateKey(rule, fact)!),
      target,
      ledgerReferenceDateKey(rule, facts, evaluatedAt),
    );
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

export function guestGameRuleDomainTimeZones(
  storeIds: string[],
  stores: Array<{
    id: string;
    externalDomain: string | null;
    timeZone: string | null;
  }>,
) {
  if (storeIds.length === 0) return {};
  const selectedStoreIds = new Set(storeIds);
  const candidates = new Map<
    string,
    { timeZones: Set<string>; incomplete: boolean }
  >();
  for (const store of stores) {
    if (!selectedStoreIds.has(store.id)) continue;
    const domain = nullableString(store.externalDomain);
    if (!domain) continue;
    const candidate = candidates.get(domain) ?? {
      timeZones: new Set<string>(),
      incomplete: false,
    };
    const timeZone = nullableString(store.timeZone);
    if (timeZone && validLedgerTimeZone(timeZone)) {
      candidate.timeZones.add(timeZone);
    } else {
      candidate.incomplete = true;
    }
    candidates.set(domain, candidate);
  }

  return Object.fromEntries(
    [...candidates.entries()]
      .filter(
        ([, candidate]) =>
          !candidate.incomplete && candidate.timeZones.size === 1,
      )
      .map(([domain, candidate]) => [domain, [...candidate.timeZones][0]]),
  );
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
      'SESSION_PLAY_TIME_ACCUMULATED',
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
    // The normalizer emits SESSION_STARTED plus a package marker for the same
    // physical package session. ANY-session rules count the canonical anchor
    // only, otherwise one session can advance an N-session goal twice.
    return ['SESSION_STARTED'];
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
    // A club visit or session start is not proof that the guest explicitly
    // checked in. Keep the shadow evaluator conservative until the ledger
    // receives the canonical check-in event from the guest portal.
    return ['CHECK_IN_PERFORMED'];
  }
  if (trigger.includes('APP_OPEN')) {
    // Opening the game module is a first-party portal event. Langame VISIT
    // rows describe a different action and must not create a false match.
    return ['APP_OPENED'];
  }
  return ['SESSION_STARTED', 'VISIT', 'REWARD_TRACE'];
}

function evaluateGuestGamePeriod(
  value: Prisma.JsonValue | null,
  happenedAt: Date,
  timeZone: string | null,
) {
  const rules = jsonObject(value) ?? {};
  const metric = jsonObject(rules.metric) ?? {};
  const weekdayMode = nullableString(
    metric.weekdayMode ?? rules.weekdayMode,
  )?.toUpperCase();
  const weekdays = numberValues(metric.weekdays ?? rules.weekdays);
  const hours = guestGameStringArray(metric.hours ?? rules.hours);
  const weekdaysOnly =
    metric.weekdaysOnly === true || rules.weekdaysOnly === true;
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

function validLedgerTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function ledgerFactTimeZone(
  rule: GuestGameLedgerRule,
  fact: GuestGameLedgerFact,
) {
  const storeTimeZone = nullableString(fact.store?.timeZone);
  if (storeTimeZone) return storeTimeZone;
  if (fact.factType !== 'BALANCE_TOPUP' || fact.storeId !== null) return null;
  const domain = nullableString(fact.externalDomain);
  return domain ? nullableString(rule.domainTimeZones?.[domain]) : null;
}

function localFactDateKey(
  rule: GuestGameLedgerRule,
  fact: GuestGameLedgerFact,
) {
  const timeZone = ledgerFactTimeZone(rule, fact);
  if (!timeZone) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(fact.happenedAt ?? fact.createdAt);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((item) => item.type === type)?.value ?? '';
    const year = part('year');
    const month = part('month');
    const day = part('day');
    return year && month && day ? `${year}-${month}-${day}` : null;
  } catch {
    return null;
  }
}

function ledgerReferenceDateKey(
  rule: GuestGameLedgerRule,
  facts: GuestGameLedgerFact[],
  evaluatedAt: Date,
) {
  const latestFact = facts.reduce<GuestGameLedgerFact | null>(
    (latest, fact) => {
      if (!latest) return fact;
      return (fact.happenedAt ?? fact.createdAt) >
        (latest.happenedAt ?? latest.createdAt)
        ? fact
        : latest;
    },
    null,
  );
  const timeZone = latestFact ? ledgerFactTimeZone(rule, latestFact) : null;
  return timeZone ? localDateKey(evaluatedAt, timeZone) : null;
}

function localDateKey(value: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((item) => item.type === type)?.value ?? '';
    const year = part('year');
    const month = part('month');
    const day = part('day');
    return year && month && day ? `${year}-${month}-${day}` : null;
  } catch {
    return null;
  }
}

function activeLedgerDayStreak(
  keys: string[],
  target: number,
  referenceDateKey: string | null,
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
    : Number.NaN;
  if (
    latest === undefined ||
    !Number.isFinite(reference) ||
    reference - latest > 86_400_000
  ) {
    return 0;
  }

  return current;
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
