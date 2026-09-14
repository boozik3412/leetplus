export const ASSORTMENT_NO_SALES_WINDOWS = [7, 14, 21, 30] as const;

export type AssortmentNoSalesWindow =
  (typeof ASSORTMENT_NO_SALES_WINDOWS)[number];
export type AssortmentMetricState =
  | 'AVAILABLE'
  | 'PARTIAL'
  | 'STALE'
  | 'MISSING'
  | 'FAILED'
  | 'UNKNOWN';
export type AssortmentPriceSource =
  | 'CLUB_CONFIGURATION'
  | 'PERIOD_SALES'
  | 'HISTORICAL_SALES'
  | 'UNKNOWN';
export type AssortmentRisk =
  | 'OUT_OF_STOCK'
  | 'LOW_STOCK'
  | 'OK'
  | 'NO_DEMAND'
  | 'STALE_INVENTORY'
  | 'MISSING_INVENTORY'
  | 'INSUFFICIENT_SALES_COVERAGE'
  | 'EXCLUDED';

export type AssortmentCoverage = {
  covered: number;
  total: number;
  percent: number | null;
};

export type AssortmentMetric<T> = {
  value: T | null;
  state: AssortmentMetricState;
  reason: string | null;
  coverage: AssortmentCoverage;
  asOf: string | null;
};

export type AssortmentPriceMetric = AssortmentMetric<number> & {
  source: AssortmentPriceSource;
};

export type AssortmentValuationBasis =
  | 'CLUB_PURCHASE_PRICE'
  | 'SALES_UNIT_COST'
  | 'PRODUCT_PURCHASE_PRICE'
  | 'SALE_PRICE_ESTIMATE'
  | 'UNKNOWN';

export type AssortmentValuationMetric = AssortmentMetric<number> & {
  basis: AssortmentValuationBasis;
};

export type AssortmentSummaryValuationBasis =
  | AssortmentValuationBasis
  | 'MIXED';

export type AssortmentValuationSummaryMetric = AssortmentMetric<number> & {
  basis: AssortmentSummaryValuationBasis;
};

export type AssortmentGrossProfitAtRisk = {
  perDay: AssortmentMetric<number>;
  forPeriod: AssortmentMetric<number>;
  costBasis: AssortmentValuationBasis;
};

export type AssortmentHealthStore = {
  id: string;
  tenantId: string;
  externalDomain: string | null;
  externalClubId: string | null;
  isActive: boolean;
};

export type AssortmentHealthProduct = {
  id: string;
  isActive: boolean;
  orderMultiplicity?: number | null;
  purchasePrice?: number | null;
};

export type AssortmentStoreProductId = {
  storeId: string;
  productId: string;
};

export type AssortmentInventorySnapshot = {
  storeId: string;
  productId: string;
  snapshotDate: Date;
  observedAt?: Date;
  quantity: number;
};

export type AssortmentSale = {
  storeId: string;
  productId: string;
  saleDate: Date;
  quantity: number;
  revenue: number;
  cost?: number | null;
};

export type AssortmentSalesCoverage = {
  storeId: string;
  from: Date;
  to: Date;
  status: 'CONFIRMED' | 'MISSING' | 'FAILED';
};

export type AssortmentPriceConfiguration = {
  tenantId: string;
  productId: string;
  externalDomain: string;
  externalClubId: string;
  price: number | null;
  purchasePrice?: number | null;
  updatedAt: Date;
};

export type AssortmentIncomingStock = {
  storeId: string;
  productId: string;
};

export type AssortmentWriteOff = {
  storeId: string;
  productId: string;
  movementDate: Date;
  quantity: number;
  amount: number;
};

export type AssortmentSourceCoverage = {
  status: 'CONFIRMED' | 'PARTIAL' | 'MISSING' | 'FAILED';
};

export type AssortmentHealthInput = {
  asOf: Date;
  demandTo?: Date;
  period: { from: Date; to: Date };
  stores: AssortmentHealthStore[];
  products: AssortmentHealthProduct[];
  storeProductIds?: Iterable<AssortmentStoreProductId>;
  inventorySnapshots: AssortmentInventorySnapshot[];
  sales: AssortmentSale[];
  salesCoverage: AssortmentSalesCoverage[];
  priceConfigurations?: AssortmentPriceConfiguration[];
  excludedProductIds?: Iterable<string>;
  incomingStock?: AssortmentIncomingStock[];
  writeOffs?: AssortmentWriteOff[];
  writeOffCoverage?: AssortmentSourceCoverage;
  inventoryStaleAfterHours?: number;
  priceConfigurationStaleAfterHours?: number;
  excessStockDays?: number;
};

export type AssortmentHealthRow = {
  storeId: string;
  productId: string;
  excluded: boolean;
  inventory: AssortmentMetric<number>;
  demand21d: AssortmentMetric<number>;
  price: AssortmentPriceMetric;
  grossProfitAtRisk?: AssortmentGrossProfitAtRisk;
  noSales: Record<AssortmentNoSalesWindow, boolean | null>;
  frozenValue: AssortmentValuationMetric;
  turnoverDays: AssortmentMetric<number>;
  turnoverRate: AssortmentMetric<number>;
  excessQuantity: AssortmentMetric<number>;
  excessValue: AssortmentValuationMetric;
  writeOffQuantity: AssortmentMetric<number>;
  writeOffAmount: AssortmentMetric<number>;
  risk: AssortmentRisk;
  lastKnownRisk: Exclude<
    AssortmentRisk,
    | 'STALE_INVENTORY'
    | 'MISSING_INVENTORY'
    | 'INSUFFICIENT_SALES_COVERAGE'
    | 'EXCLUDED'
  > | null;
  actionable: boolean;
  recommendedOrderQuantity: number | null;
  lastKnownRecommendedOrderQuantity: number | null;
};

export type AssortmentHealth = {
  rows: AssortmentHealthRow[];
  summary: {
    inventory: AssortmentMetric<number>;
    outOfStock: AssortmentMetric<number>;
    lowStock: AssortmentMetric<number>;
    noSales: Record<AssortmentNoSalesWindow, AssortmentMetric<number>>;
    frozenValue: AssortmentValuationSummaryMetric;
    turnoverDays: AssortmentMetric<number>;
    excessQuantity: AssortmentMetric<number>;
    excessValue: AssortmentValuationSummaryMetric;
    writeOffQuantity: AssortmentMetric<number>;
    writeOffAmount: AssortmentMetric<number>;
  };
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_INVENTORY_STALE_AFTER_HOURS = 36;
const DEFAULT_PRICE_CONFIGURATION_STALE_AFTER_HOURS = 36;
const DEFAULT_EXCESS_STOCK_DAYS = 30;

export function buildAssortmentHealth(
  input: AssortmentHealthInput,
): AssortmentHealth {
  const excludedProductIds = new Set(input.excludedProductIds ?? []);
  const incomingKeys = new Set(
    (input.incomingStock ?? []).map((item) =>
      grainKey(item.storeId, item.productId),
    ),
  );
  const staleAfterMs =
    (input.inventoryStaleAfterHours ?? DEFAULT_INVENTORY_STALE_AFTER_HOURS) *
    60 *
    60 *
    1000;
  const activeStores = input.stores.filter((store) => store.isActive);
  const activeProducts = input.products.filter((product) => product.isActive);
  const snapshotsByGrain = latestSnapshotsAt(
    input.inventorySnapshots,
    input.asOf,
  );
  const storesById = new Map(activeStores.map((store) => [store.id, store]));
  const productsById = new Map(
    activeProducts.map((product) => [product.id, product]),
  );
  const memberships = input.storeProductIds
    ? provenMemberships(input.storeProductIds, storesById, productsById)
    : activeStores.flatMap((store) =>
        activeProducts.map((product) => ({ store, product })),
      );
  const rows = memberships.map(({ store, product }) =>
    buildRow({
      input,
      store,
      product,
      excludedProductIds,
      incomingKeys,
      snapshotsByGrain,
      staleAfterMs,
    }),
  );

  return { rows, summary: buildSummary(rows) };
}

function buildRow(context: {
  input: AssortmentHealthInput;
  store: AssortmentHealthStore;
  product: AssortmentHealthProduct;
  excludedProductIds: Set<string>;
  incomingKeys: Set<string>;
  snapshotsByGrain: Map<string, AssortmentInventorySnapshot>;
  staleAfterMs: number;
}): AssortmentHealthRow {
  const { input, store, product } = context;
  const key = grainKey(store.id, product.id);
  const demandTo = boundedTo(input.demandTo ?? input.period.to, input.asOf);
  const excluded = context.excludedProductIds.has(product.id);
  const snapshot = context.snapshotsByGrain.get(key);
  const inventory = inventoryMetric(snapshot, input.asOf, context.staleAfterMs);
  const demandWindow = windowFrom(demandTo, 21);
  const demandCoverage = salesCoverageMetric(
    input.salesCoverage,
    store.id,
    demandWindow,
    demandTo,
  );
  const demandSales = salesInWindow(
    input.sales,
    store.id,
    product.id,
    demandWindow,
    demandTo,
  );
  const demandQuantity = sum(demandSales.map((sale) => sale.quantity));
  const demand21d = demandMetric(demandQuantity, demandCoverage, demandTo);
  const price = priceMetric(input, store, product.id);
  const grossProfitAtRisk = grossProfitAtRiskMetrics(
    input,
    store,
    product,
    demand21d,
    demandQuantity / 21,
    price,
    demandWindow,
    demandTo,
  );
  const noSales = ASSORTMENT_NO_SALES_WINDOWS.reduce(
    (result, days) => {
      const coverage = salesCoverageMetric(
        input.salesCoverage,
        store.id,
        windowFrom(demandTo, days),
        demandTo,
      );
      result[days] =
        inventory.state === 'AVAILABLE' &&
        coverage.state === 'AVAILABLE' &&
        !excluded &&
        !context.incomingKeys.has(key) &&
        (inventory.value ?? 0) > 0 &&
        salesInWindow(
          input.sales,
          store.id,
          product.id,
          windowFrom(demandTo, days),
          demandTo,
        ).length === 0;
      if (inventory.state !== 'AVAILABLE' || coverage.state !== 'AVAILABLE') {
        result[days] = null;
      }
      return result;
    },
    {} as Record<AssortmentNoSalesWindow, boolean | null>,
  );
  const frozenValue = valuationMetric(
    input,
    store,
    product,
    noSales[21] === true ? inventory.value : null,
    noSales[21] === null
      ? 'Для окна без продаж нет полного покрытия продаж или актуального остатка.'
      : null,
  );
  const turnover = turnoverMetrics(inventory, input, store.id, product.id);
  const excess = excessMetrics(
    inventory,
    demand21d,
    input,
    store,
    product,
    input.excessStockDays ?? DEFAULT_EXCESS_STOCK_DAYS,
  );
  const writeOffs = writeOffMetrics(input, store.id, product.id);
  const latestRecommendation = recommendation(
    inventory.value,
    demand21d.value,
    product.orderMultiplicity ?? null,
  );
  const actionInputsAvailable =
    !excluded &&
    inventory.state === 'AVAILABLE' &&
    demand21d.state === 'AVAILABLE';
  const lastKnownRisk = excluded
    ? null
    : riskFor(inventory.value, demand21d.value);
  const risk = excluded
    ? 'EXCLUDED'
    : inventory.state === 'MISSING'
      ? 'MISSING_INVENTORY'
      : inventory.state === 'STALE'
        ? 'STALE_INVENTORY'
        : demand21d.state !== 'AVAILABLE'
          ? 'INSUFFICIENT_SALES_COVERAGE'
          : (lastKnownRisk ?? 'NO_DEMAND');

  return {
    storeId: store.id,
    productId: product.id,
    excluded,
    inventory,
    demand21d,
    price,
    grossProfitAtRisk,
    noSales,
    frozenValue,
    turnoverDays: turnover.days,
    turnoverRate: turnover.rate,
    excessQuantity: excess.quantity,
    excessValue: excess.value,
    writeOffQuantity: writeOffs.quantity,
    writeOffAmount: writeOffs.amount,
    risk,
    lastKnownRisk,
    actionable: actionInputsAvailable && risk !== 'NO_DEMAND' && risk !== 'OK',
    recommendedOrderQuantity:
      actionInputsAvailable && latestRecommendation > 0
        ? latestRecommendation
        : null,
    lastKnownRecommendedOrderQuantity:
      latestRecommendation > 0 ? latestRecommendation : null,
  };
}

function provenMemberships(
  storeProductIds: Iterable<AssortmentStoreProductId>,
  storesById: Map<string, AssortmentHealthStore>,
  productsById: Map<string, AssortmentHealthProduct>,
) {
  const seen = new Set<string>();
  const memberships: Array<{
    store: AssortmentHealthStore;
    product: AssortmentHealthProduct;
  }> = [];

  for (const item of storeProductIds) {
    const store = storesById.get(item.storeId);
    const product = productsById.get(item.productId);
    const key = grainKey(item.storeId, item.productId);

    if (!store || !product || seen.has(key)) continue;

    seen.add(key);
    memberships.push({ store, product });
  }

  return memberships;
}

function buildSummary(
  rows: AssortmentHealthRow[],
): AssortmentHealth['summary'] {
  const policyRows = rows.filter((row) => !row.excluded);
  const inventory = aggregateRows(
    policyRows,
    (row) => row.inventory,
    (row) => row.inventory.value ?? 0,
  );
  const riskMetric = (risk: AssortmentRisk) =>
    aggregateEligibleCount(
      policyRows,
      (row) => row.risk === risk,
      (row) =>
        row.inventory.state === 'AVAILABLE' &&
        row.demand21d.state === 'AVAILABLE',
    );
  const noSales = ASSORTMENT_NO_SALES_WINDOWS.reduce(
    (result, days) => {
      const knownRows = policyRows.filter((row) => row.noSales[days] !== null);
      const covered = knownRows.length;
      const value =
        covered === 0
          ? null
          : knownRows.filter((row) => row.noSales[days]).length;
      result[days] = metric(
        value,
        stateForCoverage(covered, policyRows.length),
        coverage(covered, policyRows.length),
        covered === policyRows.length
          ? null
          : 'Не для всех товарных остатков подтверждено окно продаж.',
        oldestKnownAsOf(policyRows.map((row) => row.inventory.asOf)),
      );
      return result;
    },
    {} as Record<AssortmentNoSalesWindow, AssortmentMetric<number>>,
  );
  const frozenValue = aggregateValuationRows(
    policyRows.filter((row) => row.noSales[21] !== false),
    (row) => row.frozenValue,
    (row) => row.frozenValue.value ?? 0,
  );
  const turnoverDays = averageRows(policyRows, (row) => row.turnoverDays);
  const excessQuantity = aggregateRows(
    policyRows,
    (row) => row.excessQuantity,
    (row) => row.excessQuantity.value ?? 0,
  );
  const excessValue = aggregateValuationRows(
    policyRows,
    (row) => row.excessValue,
    (row) => row.excessValue.value ?? 0,
  );
  const writeOffQuantity = aggregateRows(
    policyRows,
    (row) => row.writeOffQuantity,
    (row) => row.writeOffQuantity.value ?? 0,
  );
  const writeOffAmount = aggregateRows(
    policyRows,
    (row) => row.writeOffAmount,
    (row) => row.writeOffAmount.value ?? 0,
  );

  return {
    inventory,
    outOfStock: riskMetric('OUT_OF_STOCK'),
    lowStock: riskMetric('LOW_STOCK'),
    noSales,
    frozenValue,
    turnoverDays,
    excessQuantity,
    excessValue,
    writeOffQuantity,
    writeOffAmount,
  };
}

function latestSnapshotsAt(
  snapshots: AssortmentInventorySnapshot[],
  asOf: Date,
) {
  const result = new Map<string, AssortmentInventorySnapshot>();
  snapshots.forEach((snapshot) => {
    if (
      snapshot.snapshotDate > asOf ||
      (snapshot.observedAt && snapshot.observedAt > asOf)
    )
      return;
    const key = grainKey(snapshot.storeId, snapshot.productId);
    const current = result.get(key);
    if (!current || current.snapshotDate < snapshot.snapshotDate)
      result.set(key, snapshot);
  });
  return result;
}

function inventoryMetric(
  snapshot: AssortmentInventorySnapshot | undefined,
  asOf: Date,
  staleAfterMs: number,
): AssortmentMetric<number> {
  if (!snapshot) {
    return metric<number>(
      null,
      'MISSING',
      coverage(0, 1),
      'Нет подтвержденного снимка остатка.',
      null,
    );
  }
  const observedAt = snapshot.observedAt ?? snapshot.snapshotDate;
  const state =
    asOf.getTime() - observedAt.getTime() > staleAfterMs
      ? 'STALE'
      : 'AVAILABLE';
  return metric(
    snapshot.quantity,
    state,
    coverage(1, 1),
    state === 'STALE' ? 'Снимок остатка устарел.' : null,
    dateValue(observedAt),
  );
}

function salesCoverageMetric(
  records: AssortmentSalesCoverage[],
  storeId: string,
  from: Date,
  to: Date,
): AssortmentMetric<number> {
  const rows = records.filter((record) => record.storeId === storeId);
  const confirmed = rows.some(
    (record) =>
      record.status === 'CONFIRMED' && record.from <= from && record.to >= to,
  );
  if (confirmed)
    return metric(1, 'AVAILABLE', coverage(1, 1), null, dateValue(to));
  if (rows.some((record) => record.status === 'FAILED')) {
    return metric<number>(
      null,
      'FAILED',
      coverage(0, 1),
      'Загрузка продаж завершилась ошибкой.',
      null,
    );
  }
  if (rows.some((record) => record.status === 'CONFIRMED')) {
    return metric<number>(
      null,
      'PARTIAL',
      coverage(0, 1),
      'Окно продаж покрыто не полностью.',
      null,
    );
  }
  return metric<number>(
    null,
    'MISSING',
    coverage(0, 1),
    'Нет подтверждения загрузки продаж.',
    null,
  );
}

function demandMetric(
  quantity: number,
  coverageMetric: AssortmentMetric<number>,
  asOf: Date,
): AssortmentMetric<number> {
  if (coverageMetric.state !== 'AVAILABLE') {
    return metric<number>(
      null,
      coverageMetric.state,
      coverageMetric.coverage,
      coverageMetric.reason,
      coverageMetric.asOf,
    );
  }
  return metric(
    quantity / 21,
    'AVAILABLE',
    coverage(1, 1),
    null,
    dateValue(asOf),
  );
}

function priceMetric(
  input: AssortmentHealthInput,
  store: AssortmentHealthStore,
  productId: string,
): AssortmentPriceMetric {
  const config = latestConfiguration(input, store, productId);
  const isFreshConfig = isFreshConfiguration(config, input);
  if (
    config &&
    isFreshConfig &&
    config.price !== null &&
    Number.isFinite(config.price) &&
    config.price >= 0
  ) {
    return {
      ...metric(
        config.price,
        'AVAILABLE',
        coverage(1, 1),
        null,
        dateValue(input.asOf),
      ),
      source: 'CLUB_CONFIGURATION',
    };
  }
  const periodTo = boundedTo(input.period.to, input.asOf);
  const periodSalesCoverage = salesCoverageMetric(
    input.salesCoverage,
    store.id,
    input.period.from,
    periodTo,
  );
  const periodSales = salesInWindow(
    input.sales,
    store.id,
    productId,
    input.period.from,
    periodTo,
  );
  const periodPrice = unitPrice(periodSales);
  if (periodPrice !== null && periodSalesCoverage.state === 'AVAILABLE') {
    return {
      ...metric(
        periodPrice,
        'AVAILABLE',
        periodSalesCoverage.coverage,
        null,
        dateValue(periodTo),
      ),
      source: 'PERIOD_SALES',
    };
  }
  const historicalSales = input.sales.filter(
    (sale) =>
      sale.storeId === store.id &&
      sale.productId === productId &&
      sale.saleDate <= input.asOf,
  );
  const historyPrice = unitPrice(historicalSales);
  const historyHasConfirmedCoverage = historicalSales.every((sale) =>
    input.salesCoverage.some(
      (record) =>
        record.storeId === store.id &&
        record.status === 'CONFIRMED' &&
        record.from <= sale.saleDate &&
        record.to >= sale.saleDate,
    ),
  );
  if (historyPrice !== null && historyHasConfirmedCoverage) {
    return {
      ...metric(
        historyPrice,
        'AVAILABLE',
        coverage(1, 1),
        null,
        dateValue(input.asOf),
      ),
      source: 'HISTORICAL_SALES',
    };
  }
  if (
    config &&
    config.price !== null &&
    Number.isFinite(config.price) &&
    config.price >= 0
  ) {
    return {
      ...metric(
        config.price,
        'STALE',
        coverage(1, 1),
        'Точная клубная цена устарела, а свежей цены продажи нет.',
        dateValue(config.updatedAt),
      ),
      source: 'CLUB_CONFIGURATION',
    };
  }
  return {
    ...metric<number>(
      null,
      'UNKNOWN',
      coverage(0, 1),
      'Нет точной клубной цены и подтвержденной цены продажи.',
      null,
    ),
    source: 'UNKNOWN',
  };
}

function latestConfiguration(
  input: AssortmentHealthInput,
  store: AssortmentHealthStore,
  productId: string,
) {
  return (input.priceConfigurations ?? [])
    .filter(
      (item) =>
        item.tenantId === store.tenantId &&
        item.productId === productId &&
        item.externalDomain === store.externalDomain &&
        item.externalClubId === store.externalClubId &&
        item.updatedAt <= input.asOf,
    )
    .sort(
      (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
    )[0];
}

function isFreshConfiguration(
  configuration: AssortmentPriceConfiguration | undefined,
  input: AssortmentHealthInput,
) {
  if (!configuration) return false;

  const staleAfterMs =
    (input.priceConfigurationStaleAfterHours ??
      DEFAULT_PRICE_CONFIGURATION_STALE_AFTER_HOURS) *
    60 *
    60 *
    1000;

  return (
    input.asOf.getTime() - configuration.updatedAt.getTime() <= staleAfterMs
  );
}

function turnoverMetrics(
  inventory: AssortmentMetric<number>,
  input: AssortmentHealthInput,
  storeId: string,
  productId: string,
) {
  if (inventory.state !== 'AVAILABLE') {
    const unavailable = metric<number>(
      null,
      inventory.state,
      inventory.coverage,
      inventory.reason,
      inventory.asOf,
    );
    return { days: unavailable, rate: unavailable };
  }
  const periodTo = boundedTo(input.period.to, input.asOf);
  const periodDays = Math.max(1, daysInclusive(input.period.from, periodTo));
  const salesCoverage = salesCoverageMetric(
    input.salesCoverage,
    storeId,
    input.period.from,
    periodTo,
  );
  if (salesCoverage.state !== 'AVAILABLE') {
    const unavailable = metric<number>(
      null,
      salesCoverage.state,
      salesCoverage.coverage,
      salesCoverage.reason,
      salesCoverage.asOf,
    );
    return { days: unavailable, rate: unavailable };
  }
  const sold = sum(
    salesInWindow(
      input.sales,
      storeId,
      productId,
      input.period.from,
      periodTo,
    ).map((sale) => sale.quantity),
  );
  if (sold <= 0) {
    return {
      days: metric<number>(
        null,
        'AVAILABLE',
        coverage(1, 1),
        'Нет продаж за выбранный период.',
        inventory.asOf,
      ),
      rate: metric(
        0,
        'AVAILABLE',
        coverage(1, 1),
        'Нет продаж за выбранный период.',
        inventory.asOf,
      ),
    };
  }
  const stock = inventory.value ?? 0;
  const dailySales = sold / periodDays;
  return {
    days: metric(
      stock / dailySales,
      'AVAILABLE',
      coverage(1, 1),
      null,
      inventory.asOf,
    ),
    rate: metric(
      stock > 0 ? sold / stock : 0,
      'AVAILABLE',
      coverage(1, 1),
      null,
      inventory.asOf,
    ),
  };
}

function excessMetrics(
  inventory: AssortmentMetric<number>,
  demand: AssortmentMetric<number>,
  input: AssortmentHealthInput,
  store: AssortmentHealthStore,
  product: AssortmentHealthProduct,
  excessStockDays: number,
) {
  if (inventory.state !== 'AVAILABLE' || demand.state !== 'AVAILABLE') {
    const source = inventory.state !== 'AVAILABLE' ? inventory : demand;
    const unavailable = metric<number>(
      null,
      source.state,
      source.coverage,
      source.reason,
      source.asOf,
    );
    const valuationState =
      source.state === 'AVAILABLE' || source.state === 'PARTIAL'
        ? 'UNKNOWN'
        : source.state;
    return {
      quantity: unavailable,
      value: valuationUnavailable(
        valuationState,
        source.coverage,
        source.reason,
        source.asOf,
      ),
    };
  }
  const quantity = Math.max(
    0,
    (inventory.value ?? 0) - (demand.value ?? 0) * excessStockDays,
  );
  const quantityMetric = metric(
    quantity,
    'AVAILABLE',
    coverage(1, 1),
    null,
    inventory.asOf,
  );
  return {
    quantity: quantityMetric,
    value: valuationMetric(input, store, product, quantity, null),
  };
}

function writeOffMetrics(
  input: AssortmentHealthInput,
  storeId: string,
  productId: string,
) {
  const source = input.writeOffCoverage ?? { status: 'MISSING' as const };
  if (source.status !== 'CONFIRMED' && source.status !== 'PARTIAL') {
    const state = source.status === 'FAILED' ? 'FAILED' : 'MISSING';
    const reason =
      source.status === 'FAILED'
        ? 'Загрузка списаний завершилась ошибкой.'
        : 'Нет подтверждения источника списаний.';
    const unavailable = metric<number>(
      null,
      state,
      coverage(0, 1),
      reason,
      null,
    );
    return { quantity: unavailable, amount: unavailable };
  }
  const rows = (input.writeOffs ?? []).filter(
    (item) =>
      item.storeId === storeId &&
      item.productId === productId &&
      item.movementDate >= input.period.from &&
      item.movementDate <= boundedTo(input.period.to, input.asOf),
  );
  if (source.status === 'PARTIAL' && rows.length === 0) {
    const unavailable = metric<number>(
      null,
      'PARTIAL',
      coverage(0, 1),
      'Источник списаний неполный; для товара нет подтвержденных списаний.',
      null,
    );
    return { quantity: unavailable, amount: unavailable };
  }
  const state = source.status === 'PARTIAL' ? 'PARTIAL' : 'AVAILABLE';
  const reason =
    state === 'PARTIAL'
      ? 'Есть подтвержденные списания, но покрытие источника неполное.'
      : null;
  return {
    quantity: metric(
      sum(rows.map((row) => row.quantity)),
      state,
      coverage(1, 1),
      reason,
      dateValue(boundedTo(input.period.to, input.asOf)),
    ),
    amount: metric(
      sum(rows.map((row) => row.amount)),
      state,
      coverage(1, 1),
      reason,
      dateValue(boundedTo(input.period.to, input.asOf)),
    ),
  };
}

function valuationMetric(
  input: AssortmentHealthInput,
  store: AssortmentHealthStore,
  product: AssortmentHealthProduct,
  quantity: number | null,
  unavailableReason: string | null,
): AssortmentValuationMetric {
  if (quantity === null) {
    return valuationUnavailable(
      'UNKNOWN',
      coverage(0, 1),
      unavailableReason ?? 'Стоимость не применима к этому товару.',
      null,
    );
  }
  const cost = unitCostMetric(
    input,
    store,
    product,
    input.period.from,
    boundedTo(input.period.to, input.asOf),
  );
  if (cost.value !== null && cost.basis !== 'UNKNOWN') {
    const state = cost.state === 'AVAILABLE' ? 'AVAILABLE' : 'PARTIAL';
    return valuationFromUnitPrice(
      quantity,
      cost.value,
      state,
      cost.basis,
      cost.coverage,
      cost.reason,
      cost.asOf,
    );
  }
  const salePrice = priceMetric(input, store, product.id);
  if (salePrice.value !== null) {
    return valuationFromUnitPrice(
      quantity,
      salePrice.value,
      'PARTIAL',
      'SALE_PRICE_ESTIMATE',
      salePrice.coverage,
      'Оценка по цене продажи; это не себестоимость и не вложенные деньги.',
      salePrice.asOf,
    );
  }
  return valuationUnavailable(
    'UNKNOWN',
    coverage(0, 1),
    'Нет подтвержденной цены для оценки остатка.',
    null,
  );
}

function grossProfitAtRiskMetrics(
  input: AssortmentHealthInput,
  store: AssortmentHealthStore,
  product: AssortmentHealthProduct,
  demand: AssortmentMetric<number>,
  rawDailyDemand: number,
  price: AssortmentPriceMetric,
  demandFrom: Date,
  demandTo: Date,
): AssortmentGrossProfitAtRisk {
  if (demand.state !== 'AVAILABLE' || demand.value === null) {
    return grossProfitAtRiskUnavailable(demand);
  }
  if (price.state !== 'AVAILABLE' || price.value === null) {
    return grossProfitAtRiskUnavailable(price);
  }

  const unitCost = unitCostMetric(input, store, product, demandFrom, demandTo);
  if (unitCost.value === null || unitCost.basis === 'UNKNOWN') {
    return grossProfitAtRiskUnavailable(unitCost);
  }

  const state = unitCost.state === 'AVAILABLE' ? 'AVAILABLE' : 'PARTIAL';
  const metricCoverage = combinedCoverage([demand, price, unitCost]);
  const asOf = oldestKnownAsOf([demand.asOf, price.asOf, unitCost.asOf]);
  const rawPerDay = rawDailyDemand * (price.value - unitCost.value);
  const periodTo = boundedTo(input.period.to, input.asOf);
  const selectedPeriodDays = Math.max(
    1,
    daysInclusive(input.period.from, periodTo),
  );

  return {
    perDay: metric(rawPerDay, state, metricCoverage, unitCost.reason, asOf),
    forPeriod: metric(
      rawPerDay * selectedPeriodDays,
      state,
      metricCoverage,
      unitCost.reason,
      asOf,
    ),
    costBasis: unitCost.basis,
  };
}

function grossProfitAtRiskUnavailable(
  source: AssortmentMetric<number>,
): AssortmentGrossProfitAtRisk {
  const state =
    source.state === 'AVAILABLE' || source.state === 'PARTIAL'
      ? 'UNKNOWN'
      : source.state;
  const unavailable = metric<number>(
    null,
    state,
    source.coverage,
    source.reason,
    source.asOf,
  );
  return {
    perDay: unavailable,
    forPeriod: unavailable,
    costBasis: 'UNKNOWN',
  };
}

function unitCostMetric(
  input: AssortmentHealthInput,
  store: AssortmentHealthStore,
  product: AssortmentHealthProduct,
  from: Date,
  to: Date,
): AssortmentValuationMetric {
  const config = latestConfiguration(input, store, product.id);
  if (config && isConfirmedCost(config.purchasePrice)) {
    const fresh = isFreshConfiguration(config, input);
    return unitCostFromValue(
      config.purchasePrice,
      fresh ? 'AVAILABLE' : 'PARTIAL',
      'CLUB_PURCHASE_PRICE',
      coverage(1, 1),
      fresh ? null : 'Оценка по устаревшей закупочной цене конфигурации клуба.',
      dateValue(config.updatedAt),
    );
  }
  const salesCoverage = salesCoverageMetric(
    input.salesCoverage,
    store.id,
    from,
    to,
  );
  const costSales = salesInWindow(input.sales, store.id, product.id, from, to);
  const costQuantity = sum(costSales.map((sale) => sale.quantity));
  const cost = sum(
    costSales.map((sale) =>
      isConfirmedCost(sale.cost) ? sale.cost : Number.NaN,
    ),
  );
  if (
    salesCoverage.state === 'AVAILABLE' &&
    costQuantity > 0 &&
    Number.isFinite(cost)
  ) {
    return unitCostFromValue(
      cost / costQuantity,
      'PARTIAL',
      'SALES_UNIT_COST',
      salesCoverage.coverage,
      'Оценка по подтвержденной себестоимости продаж.',
      dateValue(to),
    );
  }
  if (isConfirmedCost(product.purchasePrice)) {
    return unitCostFromValue(
      product.purchasePrice,
      'PARTIAL',
      'PRODUCT_PURCHASE_PRICE',
      coverage(1, 1),
      'Оценка по закупочной цене каталога товара.',
      dateValue(input.asOf),
    );
  }
  return valuationUnavailable(
    'UNKNOWN',
    salesCoverage.coverage,
    'Нет подтвержденной себестоимости для оценки риска.',
    salesCoverage.asOf,
  );
}

function unitCostFromValue(
  value: number,
  state: Extract<AssortmentMetricState, 'AVAILABLE' | 'PARTIAL'>,
  basis: Exclude<AssortmentValuationBasis, 'SALE_PRICE_ESTIMATE' | 'UNKNOWN'>,
  metricCoverage: AssortmentCoverage,
  reason: string | null,
  asOf: string | null,
): AssortmentValuationMetric {
  return {
    ...metric(value, state, metricCoverage, reason, asOf),
    basis,
  };
}

function valuationFromUnitPrice(
  quantity: number,
  unitPrice: number,
  state: Extract<AssortmentMetricState, 'AVAILABLE' | 'PARTIAL'>,
  basis: Exclude<AssortmentValuationBasis, 'UNKNOWN'>,
  metricCoverage: AssortmentCoverage,
  reason: string | null,
  asOf: string | null,
): AssortmentValuationMetric {
  return {
    ...metric(quantity * unitPrice, state, metricCoverage, reason, asOf),
    basis,
  };
}

function valuationUnavailable(
  state: Exclude<AssortmentMetricState, 'AVAILABLE' | 'PARTIAL'>,
  metricCoverage: AssortmentCoverage,
  reason: string | null,
  asOf: string | null,
): AssortmentValuationMetric {
  return {
    ...metric<number>(null, state, metricCoverage, reason, asOf),
    basis: 'UNKNOWN',
  };
}

function isConfirmedCost(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function recommendation(
  stock: number | null,
  dailyDemand: number | null,
  multiplicity: number | null,
) {
  if (stock === null || dailyDemand === null || dailyDemand <= 0) return 0;
  const weeklyNeed = Math.max(0, Math.ceil(dailyDemand * 7 - stock));
  if (weeklyNeed === 0) return 0;
  if (!multiplicity || multiplicity <= 1) return weeklyNeed;
  return Math.ceil(weeklyNeed / multiplicity) * multiplicity;
}

function riskFor(
  stock: number | null,
  demand: number | null,
): AssortmentHealthRow['lastKnownRisk'] {
  if (stock === null || demand === null) return null;
  if (demand <= 0) return 'NO_DEMAND';
  if (stock <= 0) return 'OUT_OF_STOCK';
  return stock / demand <= 3 ? 'LOW_STOCK' : 'OK';
}

function aggregateRows(
  rows: AssortmentHealthRow[],
  selectMetric: (row: AssortmentHealthRow) => AssortmentMetric<number>,
  selectValue: (row: AssortmentHealthRow) => number,
): AssortmentMetric<number> {
  const metrics = rows.map(selectMetric);
  const available = rows.filter((row) => selectMetric(row).value !== null);
  const fresh = rows.filter((row) => {
    const selected = selectMetric(row);
    return selected.state === 'AVAILABLE' && selected.value !== null;
  });
  const state = aggregateState(metrics);
  return metric(
    available.length === 0 ? null : sum(available.map(selectValue)),
    state,
    coverage(fresh.length, rows.length),
    aggregateReason(state),
    oldestKnownAsOf(rows.map((row) => selectMetric(row).asOf)),
  );
}

function aggregateValuationRows(
  rows: AssortmentHealthRow[],
  selectMetric: (row: AssortmentHealthRow) => AssortmentValuationMetric,
  selectValue: (row: AssortmentHealthRow) => number,
): AssortmentValuationSummaryMetric {
  const aggregate = aggregateRows(rows, selectMetric, selectValue);
  const bases = new Set(
    rows
      .map(selectMetric)
      .filter((item) => item.value !== null)
      .map((item) => item.basis),
  );
  const basis =
    bases.size === 0 ? 'UNKNOWN' : bases.size === 1 ? [...bases][0] : 'MIXED';

  return { ...aggregate, basis };
}

function averageRows(
  rows: AssortmentHealthRow[],
  selectMetric: (row: AssortmentHealthRow) => AssortmentMetric<number>,
) {
  const metrics = rows.map(selectMetric);
  const available = metrics.filter((item) => item.value !== null);
  const fresh = metrics.filter(
    (item) => item.state === 'AVAILABLE' && item.value !== null,
  );
  const state = aggregateState(metrics);
  return metric(
    available.length === 0
      ? null
      : sum(available.map((item) => item.value ?? 0)) / available.length,
    state,
    coverage(fresh.length, rows.length),
    aggregateReason(state),
    oldestKnownAsOf(rows.map((row) => selectMetric(row).asOf)),
  );
}

function aggregateEligibleCount(
  rows: AssortmentHealthRow[],
  matches: (row: AssortmentHealthRow) => boolean,
  eligible: (row: AssortmentHealthRow) => boolean,
) {
  const scoped = rows.filter(eligible);
  const state = stateForCoverage(scoped.length, rows.length);
  return metric(
    scoped.length === 0 ? null : scoped.filter(matches).length,
    state,
    coverage(scoped.length, rows.length),
    scoped.length === rows.length
      ? null
      : 'Не все остатки и продажи достаточно свежи для текущего действия.',
    oldestKnownAsOf(rows.map((row) => row.inventory.asOf)),
  );
}

function aggregateState(
  metrics: AssortmentMetric<number>[],
): AssortmentMetricState {
  if (metrics.length === 0) return 'MISSING';
  if (metrics.some((item) => item.state === 'FAILED')) return 'FAILED';
  if (metrics.some((item) => item.state === 'STALE')) return 'STALE';
  if (metrics.every((item) => item.state === 'AVAILABLE')) return 'AVAILABLE';
  if (metrics.some((item) => item.value !== null)) return 'PARTIAL';
  if (metrics.some((item) => item.state === 'MISSING')) return 'MISSING';
  return 'UNKNOWN';
}

function stateForCoverage(
  covered: number,
  total: number,
): AssortmentMetricState {
  if (total === 0 || covered === 0) return 'MISSING';
  return covered === total ? 'AVAILABLE' : 'PARTIAL';
}

function aggregateReason(state: AssortmentMetricState) {
  if (state === 'PARTIAL')
    return 'Показатель рассчитан только по покрытой части данных.';
  if (state === 'STALE') return 'Снимки остатка устарели.';
  if (state === 'MISSING') return 'Нет достаточных исходных данных.';
  if (state === 'FAILED') return 'Источник данных завершился ошибкой.';
  if (state === 'UNKNOWN') return 'Значение невозможно подтвердить.';
  return null;
}

function metric<T>(
  value: T | null,
  state: AssortmentMetricState,
  metricCoverage: AssortmentCoverage,
  reason: string | null,
  asOf: string | null,
): AssortmentMetric<T> {
  return {
    value: typeof value === 'number' ? (round(value) as T) : value,
    state,
    reason,
    coverage: metricCoverage,
    asOf,
  };
}

function coverage(covered: number, total: number): AssortmentCoverage {
  return {
    covered,
    total,
    percent: total === 0 ? null : round((covered / total) * 100),
  };
}

function combinedCoverage(metrics: AssortmentMetric<number>[]) {
  return coverage(
    sum(metrics.map((item) => item.coverage.covered)),
    sum(metrics.map((item) => item.coverage.total)),
  );
}

function salesInWindow(
  sales: AssortmentSale[],
  storeId: string,
  productId: string,
  from: Date,
  to: Date,
) {
  return sales.filter(
    (sale) =>
      sale.storeId === storeId &&
      sale.productId === productId &&
      sale.saleDate >= from &&
      sale.saleDate <= to,
  );
}

function unitPrice(sales: AssortmentSale[]) {
  const quantity = sum(sales.map((sale) => sale.quantity));
  return quantity > 0
    ? sum(sales.map((sale) => sale.revenue)) / quantity
    : null;
}

function windowFrom(asOf: Date, days: number) {
  return new Date(asOf.getTime() - (days - 1) * DAY_MS);
}

function boundedTo(candidate: Date, asOf: Date) {
  return candidate <= asOf ? candidate : asOf;
}

function daysInclusive(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS) + 1;
}

function dateValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function oldestKnownAsOf(values: Array<string | null>) {
  const known = values.filter((value): value is string => value !== null);
  return known.length > 0 ? known.sort()[0] : null;
}

function grainKey(storeId: string, productId: string) {
  return `${storeId}:${productId}`;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
