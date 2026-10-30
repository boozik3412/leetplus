import { countDaysInStock, observedDays } from '../common/stock-days';

/**
 * Order planning ("Заказ товаров"): one row per club × SKU that was on stock
 * in the window, with daily sales, current stock and the quantity to order.
 *
 * Demand is averaged over the days the SKU was actually available (see
 * common/stock-days), so a week out of stock does not hide real demand.
 */

export const ORDER_PLANNING_WINDOW_DAYS = [21, 28, 30, 45, 60] as const;
export const ORDER_PLANNING_COVER_DAYS = [7, 10, 14, 21, 30] as const;
export const ORDER_PLANNING_DEFAULT_WINDOW_DAYS = 21;
export const ORDER_PLANNING_DEFAULT_COVER_DAYS = 7;
/** Fewer available days than this make the average a rough estimate. */
export const ORDER_PLANNING_LOW_DATA_DAYS = 7;
export const ORDER_PLANNING_CRITICAL_DAYS = 3;
/** Stock lasting longer than cover × this is reported as excess. */
export const ORDER_PLANNING_EXCESS_FACTOR = 3;
const INVENTORY_STALE_AFTER_MS = 36 * 60 * 60 * 1000;

export type OrderPlanningStatus =
  | 'OUT_OF_STOCK'
  | 'CRITICAL'
  | 'ORDER'
  | 'OK'
  | 'EXCESS'
  | 'NO_STOCK_DATA'
  | 'NO_SALES';

export type OrderPlanningRow = {
  storeId: string;
  storeName: string;
  productId: string;
  article: string;
  name: string;
  /** Network grouping key: canonical product when merged, else the SKU. */
  groupKey: string;
  groupName: string;
  categoryName: string | null;
  supplierName: string | null;
  orderMultiplicity: number | null;
  unitCost: number | null;
  dailySales: number[];
  soldQuantity: number;
  soldLast7Days: number;
  revenue: number;
  daysInStock: number;
  daysOutOfStock: number;
  averageDailySales: number;
  stockQuantity: number | null;
  stockObservedAt: string | null;
  stockStale: boolean;
  stockDaysLeft: number | null;
  need: number;
  recommendedOrder: number;
  orderAmount: number | null;
  lowData: boolean;
  status: OrderPlanningStatus;
};

export type OrderPlanningProduct = {
  id: string;
  article: string;
  name: string;
  canonicalProductId: string | null;
  canonicalName: string | null;
  categoryName: string | null;
  supplierName: string | null;
  orderMultiplicity: number | null;
  purchasePrice: number | null;
};

export type OrderPlanningInput = {
  now: Date;
  /** Calendar days of the window, ascending, YYYY-MM-DD. */
  days: string[];
  coverDays: number;
  stores: Array<{ id: string; name: string }>;
  products: OrderPlanningProduct[];
  /** Sales already bucketed by club-local day. */
  sales: Array<{
    storeId: string;
    productId: string;
    day: string;
    quantity: number;
    revenue: number;
  }>;
  /** Inventory snapshots from before the window up to now. */
  snapshots: Array<{
    storeId: string;
    productId: string;
    day: string;
    quantity: number;
    observedAt: Date;
  }>;
  /** Club purchase price by `storeId:productId`, when Langame has one. */
  clubPurchasePrices?: ReadonlyMap<string, number>;
  excludedProductIds?: ReadonlySet<string>;
};

export function buildOrderPlanningRows(
  input: OrderPlanningInput,
): OrderPlanningRow[] {
  const days = input.days;
  const dayIndex = new Map(days.map((day, index) => [day, index]));
  const firstDay = days[0];
  const storesById = new Map(input.stores.map((store) => [store.id, store]));
  const productsById = new Map(
    input.products.map((product) => [product.id, product]),
  );
  const excluded = input.excludedProductIds ?? new Set<string>();
  const grains = new Map<
    string,
    {
      storeId: string;
      productId: string;
      sales: number[];
      revenue: number;
      snapshots: Map<string, number>;
      before: { day: string; quantity: number } | null;
      latest: { day: string; quantity: number; observedAt: Date } | null;
    }
  >();
  const storeDayCounts = new Map<string, Map<string, number>>();

  function grain(storeId: string, productId: string) {
    const key = grainKey(storeId, productId);
    let value = grains.get(key);
    if (!value) {
      value = {
        storeId,
        productId,
        sales: days.map(() => 0),
        revenue: 0,
        snapshots: new Map(),
        before: null,
        latest: null,
      };
      grains.set(key, value);
    }
    return value;
  }

  function tracked(storeId: string, productId: string) {
    return (
      storesById.has(storeId) &&
      productsById.has(productId) &&
      !excluded.has(productId)
    );
  }

  input.sales.forEach((sale) => {
    const index = dayIndex.get(sale.day);
    if (index === undefined || !tracked(sale.storeId, sale.productId)) return;
    const value = grain(sale.storeId, sale.productId);
    value.sales[index] += sale.quantity;
    value.revenue += sale.revenue;
  });

  input.snapshots.forEach((snapshot) => {
    if (!tracked(snapshot.storeId, snapshot.productId)) return;
    const storeDays =
      storeDayCounts.get(snapshot.storeId) ?? new Map<string, number>();
    storeDays.set(snapshot.day, (storeDays.get(snapshot.day) ?? 0) + 1);
    storeDayCounts.set(snapshot.storeId, storeDays);
    const value = grain(snapshot.storeId, snapshot.productId);
    if (snapshot.day < firstDay) {
      if (!value.before || value.before.day < snapshot.day) {
        value.before = { day: snapshot.day, quantity: snapshot.quantity };
      }
    } else if (dayIndex.has(snapshot.day)) {
      value.snapshots.set(snapshot.day, snapshot.quantity);
    }
    if (!value.latest || value.latest.day < snapshot.day) {
      value.latest = {
        day: snapshot.day,
        quantity: snapshot.quantity,
        observedAt: snapshot.observedAt,
      };
    }
  });

  const observedDaysByStore = new Map(
    [...storeDayCounts].map(([storeId, counts]) => [
      storeId,
      observedDays(counts),
    ]),
  );
  const rows: OrderPlanningRow[] = [];

  grains.forEach((value) => {
    const store = storesById.get(value.storeId)!;
    const product = productsById.get(value.productId)!;
    const storeDays =
      observedDaysByStore.get(value.storeId) ?? new Set<string>();
    // A SKU whose snapshots all predate the club's latest full snapshot day
    // has dropped out of the club's stock list: its stock is zero now.
    const latestStoreDay = [...storeDays].sort().at(-1) ?? null;
    const daysInStock = countDaysInStock({
      days,
      storeDays,
      before: value.before?.quantity ?? null,
      snapshots: value.snapshots,
      sales: value.sales,
    });

    const latest = value.latest;
    const stockQuantity = latest
      ? latestStoreDay && latest.day < latestStoreDay
        ? 0
        : latest.quantity
      : null;
    const inStockNow = (stockQuantity ?? 0) > 0;
    if (daysInStock === 0 && !inStockNow) return;

    const soldQuantity = sum(value.sales);
    const soldLast7Days = sum(value.sales.slice(-7));
    const averageDailySales = daysInStock > 0 ? soldQuantity / daysInStock : 0;
    const availableStock = Math.max(0, stockQuantity ?? 0);
    const stockDaysLeft =
      averageDailySales > 0 && stockQuantity !== null
        ? availableStock / averageDailySales
        : null;
    const need =
      stockQuantity === null
        ? 0
        : Math.max(0, averageDailySales * input.coverDays - availableStock);
    const recommendedOrder = roundToMultiplicity(
      need,
      product.orderMultiplicity,
    );
    const unitCost =
      input.clubPurchasePrices?.get(grainKey(store.id, product.id)) ??
      (product.purchasePrice && product.purchasePrice > 0
        ? product.purchasePrice
        : null);

    rows.push({
      storeId: store.id,
      storeName: store.name,
      productId: product.id,
      article: product.article,
      name: product.name,
      groupKey: product.canonicalProductId ?? product.id,
      groupName: product.canonicalName ?? product.name,
      categoryName: product.categoryName,
      supplierName: product.supplierName,
      orderMultiplicity: product.orderMultiplicity,
      unitCost: unitCost === null ? null : round(unitCost, 2),
      dailySales: value.sales.map((quantity) => round(quantity, 2)),
      soldQuantity: round(soldQuantity, 2),
      soldLast7Days: round(soldLast7Days, 2),
      revenue: round(value.revenue, 2),
      daysInStock,
      daysOutOfStock: days.length - daysInStock,
      averageDailySales: round(averageDailySales, 2),
      stockQuantity: stockQuantity === null ? null : round(stockQuantity, 2),
      stockObservedAt: latest ? latest.observedAt.toISOString() : null,
      stockStale:
        !latest ||
        input.now.getTime() - latest.observedAt.getTime() >
          INVENTORY_STALE_AFTER_MS,
      stockDaysLeft: stockDaysLeft === null ? null : round(stockDaysLeft, 1),
      need: round(need, 1),
      recommendedOrder,
      orderAmount:
        unitCost === null ? null : round(recommendedOrder * unitCost, 2),
      lowData: daysInStock < ORDER_PLANNING_LOW_DATA_DAYS,
      status: orderStatus({
        averageDailySales,
        stockQuantity,
        stockDaysLeft,
        recommendedOrder,
        coverDays: input.coverDays,
      }),
    });
  });

  return rows.sort(
    (a, b) =>
      statusRank(a.status) - statusRank(b.status) ||
      b.recommendedOrder - a.recommendedOrder ||
      a.name.localeCompare(b.name, 'ru') ||
      a.storeName.localeCompare(b.storeName, 'ru'),
  );
}

export function orderStatus(input: {
  averageDailySales: number;
  stockQuantity: number | null;
  stockDaysLeft: number | null;
  recommendedOrder: number;
  coverDays: number;
}): OrderPlanningStatus {
  if (input.averageDailySales <= 0) return 'NO_SALES';
  if (input.stockQuantity === null) return 'NO_STOCK_DATA';
  if (input.stockQuantity <= 0) return 'OUT_OF_STOCK';
  if (
    input.stockDaysLeft !== null &&
    input.stockDaysLeft <= ORDER_PLANNING_CRITICAL_DAYS
  ) {
    return 'CRITICAL';
  }
  if (input.recommendedOrder > 0) return 'ORDER';
  if (
    input.stockDaysLeft !== null &&
    input.stockDaysLeft > input.coverDays * ORDER_PLANNING_EXCESS_FACTOR
  ) {
    return 'EXCESS';
  }
  return 'OK';
}

export function roundToMultiplicity(need: number, multiplicity: number | null) {
  // Tolerate float noise such as 3.0000000004 before rounding up.
  const units = Math.ceil(Math.round(need * 1000) / 1000);
  if (units <= 0) return 0;
  if (!multiplicity || multiplicity <= 1) return units;
  return Math.ceil(units / multiplicity) * multiplicity;
}

function statusRank(status: OrderPlanningStatus) {
  const ranks: Record<OrderPlanningStatus, number> = {
    OUT_OF_STOCK: 0,
    CRITICAL: 1,
    ORDER: 2,
    OK: 3,
    EXCESS: 4,
    NO_STOCK_DATA: 5,
    NO_SALES: 6,
  };
  return ranks[status];
}

function grainKey(storeId: string, productId: string) {
  return `${storeId}:${productId}`;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
