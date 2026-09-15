import type { ExecutiveMetric } from './executive-contract';
import { receiptIdentityFromSourceHash } from './receipt-source-identity';

export type ReceiptFact = {
  storeId: string;
  externalProvider?: string | null;
  externalDomain?: string | null;
  sourcePayloadHash?: string | null;
  saleDate?: Date;
  isCanceled?: boolean;
  revenue: number;
  quantity?: number;
  productName?: string;
};

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function day(value: Date) {
  return value.toISOString().slice(0, 10);
}

function identityKey(fact: ReceiptFact) {
  const identity = receiptIdentityFromSourceHash(fact.sourcePayloadHash);
  return identity
    ? JSON.stringify([
        fact.externalProvider ?? 'manual',
        fact.externalDomain ?? 'local',
        fact.storeId,
        identity,
      ])
    : null;
}

export function ambiguousReceiptKeys(facts: readonly ReceiptFact[]) {
  const dates = new Map<string, Set<string>>();
  for (const fact of facts) {
    const key = identityKey(fact);
    if (!key || !fact.saleDate || fact.isCanceled) continue;
    const values = dates.get(key) ?? new Set<string>();
    values.add(day(fact.saleDate));
    dates.set(key, values);
  }
  return new Set(
    [...dates].filter(([, values]) => values.size > 1).map(([key]) => key),
  );
}

/** Canonical receipt identity and grouping shared by legacy and executive reads. */
export function groupReceiptFacts<T extends ReceiptFact>(
  facts: readonly T[],
  ambiguous: ReadonlySet<string> = ambiguousReceiptKeys(facts),
) {
  const receipts = new Map<
    string,
    { revenue: number; quantity: number; products: Set<string> }
  >();
  const coveredFacts: T[] = [];
  const excludedAmbiguous = new Set<string>();
  let totalRevenue = 0;
  let coveredRevenue = 0;
  for (const fact of facts) {
    if (fact.isCanceled || !Number.isFinite(fact.revenue)) continue;
    totalRevenue += fact.revenue;
    const key = identityKey(fact);
    if (!key) continue;
    if (ambiguous.has(key)) {
      excludedAmbiguous.add(key);
      continue;
    }
    const receipt = receipts.get(key) ?? {
      revenue: 0,
      quantity: 0,
      products: new Set<string>(),
    };
    receipt.revenue += fact.revenue;
    receipt.quantity += fact.quantity ?? 0;
    if (fact.productName) receipt.products.add(fact.productName);
    receipts.set(key, receipt);
    coveredFacts.push(fact);
    coveredRevenue += fact.revenue;
  }
  return {
    receipts,
    coveredFacts,
    totalRevenue: round(totalRevenue),
    coveredRevenue: round(coveredRevenue),
    averageCheck:
      receipts.size > 0 ? round(coveredRevenue / receipts.size) : null,
    ambiguousIdentityCount: excludedAmbiguous.size,
  };
}

export function createReceiptMetricProjection(input: {
  facts: readonly (ReceiptFact & { saleDate: Date })[];
  storeIds: readonly string[];
  calculatedAt: string;
  salesDayEvidence: readonly {
    storeId: string;
    date: Date;
    status: 'CONFIRMED' | 'MISSING' | 'FAILED';
  }[];
}) {
  const allowed = new Set(input.storeIds);
  const facts = input.facts.filter(
    (fact) => allowed.has(fact.storeId) && !fact.isCanceled,
  );
  const ambiguous = ambiguousReceiptKeys(facts);
  const evidence = new Map(
    input.salesDayEvidence.map((item) => [
      `${item.storeId}:${day(item.date)}`,
      item.status,
    ]),
  );

  function getMetric(
    period: { from: string; to: string },
    requestedStores: readonly string[] = input.storeIds,
  ): ExecutiveMetric {
    const stores = new Set(requestedStores.filter((id) => allowed.has(id)));
    const statuses: Array<'CONFIRMED' | 'MISSING' | 'FAILED'> = [];
    const confirmedDays = new Set<string>();
    for (
      const date = new Date(`${period.from}T00:00:00.000Z`);
      day(date) <= period.to;
      date.setUTCDate(date.getUTCDate() + 1)
    ) {
      for (const store of stores) {
        const key = `${store}:${day(date)}`;
        const status = evidence.get(key) ?? 'MISSING';
        statuses.push(status);
        if (status === 'CONFIRMED') confirmedDays.add(key);
      }
    }
    const confirmed = facts.filter(
      (fact) =>
        stores.has(fact.storeId) &&
        confirmedDays.has(`${fact.storeId}:${day(fact.saleDate)}`),
    );
    const grouped = groupReceiptFacts(confirmed, ambiguous);
    const covered = confirmedDays.size;
    const completeDays = statuses.length > 0 && covered === statuses.length;
    const completeReceipts = grouped.coveredFacts.length === confirmed.length;
    const count = grouped.receipts.size;
    const reasons: string[] = [];
    if (!completeDays)
      reasons.push(
        `Продажи подтверждены за ${covered} из ${statuses.length} клубо-дней.`,
      );
    if (confirmed.some((fact) => !identityKey(fact)))
      reasons.push(
        'Не у всех товарных операций передан идентификатор чека или заказа.',
      );
    if (grouped.ambiguousIdentityCount > 0)
      reasons.push(
        'Идентификатор чека повторяется в разные даты; неоднозначные записи исключены.',
      );
    if (confirmed.some((fact) => !Number.isFinite(fact.revenue)))
      reasons.push('Есть операции с некорректной суммой.');
    const state: ExecutiveMetric['state'] =
      count > 0
        ? completeDays && completeReceipts
          ? 'AVAILABLE'
          : 'PARTIAL'
        : covered === 0 && statuses.includes('FAILED')
          ? 'FAILED'
          : 'MISSING';
    if (count === 0)
      reasons.push(
        completeDays && confirmed.length === 0
          ? 'За выбранный период не было товарных покупок; средний чек не определён.'
          : 'Нет однозначных подтверждённых чеков для расчёта.',
      );
    const receiptCount =
      count > 0 ? count : completeDays && confirmed.length === 0 ? 0 : null;
    const nonnegativeRevenue = confirmed.every(
      (fact) => fact.revenue >= 0 && Number.isFinite(fact.revenue),
    );
    return {
      key: 'averageProductCheck',
      unit: 'RUB',
      grain: 'PRODUCT_RECEIPT',
      definition:
        'Средний товарный чек: выручка подтверждённых чеков / количество этих чеков.',
      value: grouped.averageCheck,
      state,
      reason: reasons.length ? reasons.join(' ') : null,
      coverage: {
        covered,
        total: statuses.length,
        percent: statuses.length
          ? round((covered / statuses.length) * 100)
          : null,
        basis: 'STORE_DAYS',
      },
      receiptEvidence: {
        receiptCount,
        operations: {
          covered: grouped.coveredFacts.length,
          total: confirmed.length,
          percent: confirmed.length
            ? round((grouped.coveredFacts.length / confirmed.length) * 100)
            : null,
        },
        revenue: {
          covered: grouped.coveredRevenue,
          total: grouped.totalRevenue,
          percent:
            nonnegativeRevenue && grouped.totalRevenue > 0
              ? round((grouped.coveredRevenue / grouped.totalRevenue) * 100)
              : null,
        },
        ambiguousIdentityCount: grouped.ambiguousIdentityCount,
      },
      factAsOf:
        grouped.coveredFacts
          .reduce<Date | null>(
            (latest, fact) =>
              !latest || fact.saleDate > latest ? fact.saleDate : latest,
            null,
          )
          ?.toISOString() ?? null,
      lastCalculatedAt: input.calculatedAt,
      comparison: null,
      ratio: {
        numeratorValue: receiptCount === null ? null : grouped.coveredRevenue,
        denominatorValue: receiptCount,
        numeratorLabel: 'Выручка подтверждённых чеков',
        denominatorLabel: 'Подтверждённые чеки',
        compatible: count > 0,
      },
      destination: 'CLUBS',
    };
  }
  return { getMetric };
}
