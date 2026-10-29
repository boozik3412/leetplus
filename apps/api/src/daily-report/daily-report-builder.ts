import type { ClubDayWindow } from './daily-report-window';
import { localTime } from './daily-report-window';
import {
  formatArrow,
  formatRub,
  pluralRu,
  round2,
  shortPersonName,
} from './daily-report-format';
import type {
  DailyReport,
  DailyReportAdmin,
  DailyReportClub,
  DailyReportInput,
  DailyReportMetric,
  DailyReportOnline,
  DailyReportSaleRow,
  DailyReportGuestSummary,
  DailyReportSessionRow,
  DailyReportShift,
  DailyReportShiftRow,
  DailyReportStockRow,
  DailyReportStockSignal,
} from './daily-report.types';

const HOUR_MS = 60 * 60 * 1000;
/**
 * A shift belongs to the club day in which it started, with two hours of
 * tolerance: an admin who opens the morning shift at 08:40 already works the
 * next day, one who opens it at 10:30 still works this one.
 */
const SHIFT_START_TOLERANCE_MS = 2 * HOUR_MS;
const MIN_UNCOVERED_MS = 30 * 60 * 1000;
const MIN_COMPARABLE_SHIFT_HOURS = 1;
const TOP_PRODUCTS = 5;
const STOCK_SIGNAL_LIMIT = 8;
const OUT_OF_STOCK_MIN_DAILY_SALES = 0.3;
const RUNNING_OUT_MIN_DAILY_SALES = 0.5;
const RUNNING_OUT_DAYS = 2;
const STALE_STOCK_MS = 48 * HOUR_MS;
const REVENUE_DROP_ALERT = -0.25;
const BAR_DROP_ALERT = -0.3;
const ADMIN_DROP_ALERT = -0.3;
const REFUND_SHARE_ALERT = 0.05;
const REFUND_MIN_ALERT = 1000;

type MetricKey = keyof DailyReportClub['metrics'];

type DayAggregate = {
  shiftRevenue: number;
  barRevenue: number;
  barMargin: number;
  barItems: number;
  visits: number;
  guests: number;
  playHours: number;
  hasData: boolean;
};

export function shiftRevenue(shift: DailyReportShiftRow) {
  return (
    shift.cash +
    shift.cashless +
    shift.mobilePay +
    shift.yandexPay -
    shift.refunds
  );
}

function shiftHours(shift: DailyReportShiftRow, until: Date) {
  if (!shift.startedAt) return 0;
  const end = shift.stoppedAt ?? until;
  return Math.max(0, end.getTime() - shift.startedAt.getTime()) / HOUR_MS;
}

function inWindow(value: Date, window: ClubDayWindow) {
  const time = value.getTime();
  return time >= window.from.getTime() && time < window.to.getTime();
}

export function shiftBelongsToDay(
  shift: DailyReportShiftRow,
  window: ClubDayWindow,
) {
  if (!shift.startedAt) return false;
  const start = shift.startedAt.getTime();
  return (
    start >= window.from.getTime() - SHIFT_START_TOLERANCE_MS &&
    start < window.to.getTime() - SHIFT_START_TOLERANCE_MS
  );
}

function metric(value: number, baseline: number[]): DailyReportMetric {
  const usual = baseline.length
    ? baseline.reduce((sum, item) => sum + item, 0) / baseline.length
    : null;
  return {
    value: round2(value),
    usual: usual === null ? null : round2(usual),
    change: usual && usual > 0 ? round2(value / usual - 1) : null,
  };
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  rows.forEach((row) => {
    const value = key(row);
    const group = groups.get(value);
    if (group) group.push(row);
    else groups.set(value, [row]);
  });
  return groups;
}

function aggregateDay(
  window: ClubDayWindow,
  shifts: readonly DailyReportShiftRow[],
  sales: readonly DailyReportSaleRow[],
  sessions: readonly DailyReportSessionRow[],
): DayAggregate {
  const dayShifts = shifts.filter((shift) => shiftBelongsToDay(shift, window));
  const daySales = sales.filter((sale) => inWindow(sale.saleDate, window));
  const daySessions = sessions.filter((session) =>
    inWindow(session.startedAt, window),
  );
  const guestKeys = new Set(
    daySessions
      .map((session) => session.guestKey)
      .filter((key): key is string => Boolean(key)),
  );
  return {
    shiftRevenue: dayShifts.reduce(
      (sum, shift) => sum + shiftRevenue(shift),
      0,
    ),
    barRevenue: daySales.reduce((sum, sale) => sum + sale.revenue, 0),
    barMargin: daySales.reduce(
      (sum, sale) => sum + (sale.cost > 0 ? sale.revenue - sale.cost : 0),
      0,
    ),
    barItems: daySales.reduce((sum, sale) => sum + sale.quantity, 0),
    visits: daySessions.length,
    guests: guestKeys.size,
    playHours:
      daySessions.reduce(
        (sum, session) => sum + (session.durationMinutes ?? 0),
        0,
      ) / 60,
    hasData: dayShifts.length > 0 || daySales.length > 0,
  };
}

function uncoveredPeriods(
  window: ClubDayWindow,
  shifts: readonly DailyReportShiftRow[],
  now: Date,
) {
  const until = Math.min(window.to.getTime(), now.getTime());
  const intervals = shifts
    .filter((shift) => shift.startedAt)
    .map((shift) => [
      Math.max(shift.startedAt!.getTime(), window.from.getTime()),
      Math.min((shift.stoppedAt ?? now).getTime(), until),
    ])
    .filter(([start, end]) => end > start)
    .sort((left, right) => left[0] - right[0]);
  const gaps: string[] = [];
  let cursor = window.from.getTime();
  intervals.forEach(([start, end]) => {
    if (start - cursor >= MIN_UNCOVERED_MS) {
      gaps.push(
        `${localTime(new Date(cursor), window.timeZone)}–${localTime(new Date(start), window.timeZone)}`,
      );
    }
    cursor = Math.max(cursor, end);
  });
  if (until - cursor >= MIN_UNCOVERED_MS) {
    gaps.push(
      `${localTime(new Date(cursor), window.timeZone)}–${localTime(new Date(until), window.timeZone)}`,
    );
  }
  return gaps;
}

function adminUsualPerHour(history: readonly DailyReportShiftRow[]) {
  const byAdmin = new Map<string, number>();
  groupBy(
    history.filter((shift) => shift.adminKey && shift.stoppedAt),
    (shift) => shift.adminKey!,
  ).forEach((rows, adminKey) => {
    const comparable = rows.filter(
      (shift) =>
        shiftHours(shift, shift.stoppedAt!) >= MIN_COMPARABLE_SHIFT_HOURS,
    );
    const hours = comparable.reduce(
      (sum, shift) => sum + shiftHours(shift, shift.stoppedAt!),
      0,
    );
    const revenue = comparable.reduce(
      (sum, shift) => sum + shiftRevenue(shift),
      0,
    );
    if (hours > 0) byAdmin.set(adminKey, revenue / hours);
  });
  return byAdmin;
}

function stockSignals(
  storeId: string,
  stock: readonly DailyReportStockRow[],
  stockSales: readonly DailyReportSaleRow[],
  stockDays: number,
  excluded: ReadonlySet<string>,
) {
  const soldByProduct = new Map<string, number>();
  stockSales
    .filter((sale) => sale.storeId === storeId)
    .forEach((sale) =>
      soldByProduct.set(
        sale.productKey,
        (soldByProduct.get(sale.productKey) ?? 0) + sale.quantity,
      ),
    );
  const outOfStock: DailyReportStockSignal[] = [];
  const runningOut: DailyReportStockSignal[] = [];
  stock
    .filter((row) => row.storeId === storeId && !excluded.has(row.productKey))
    .forEach((row) => {
      const dailySales = (soldByProduct.get(row.productKey) ?? 0) / stockDays;
      if (row.quantity <= 0 && dailySales >= OUT_OF_STOCK_MIN_DAILY_SALES) {
        outOfStock.push({
          name: row.productName,
          quantity: row.quantity,
          dailySales: round2(dailySales),
          daysLeft: 0,
        });
        return;
      }
      if (row.quantity > 0 && dailySales >= RUNNING_OUT_MIN_DAILY_SALES) {
        const daysLeft = row.quantity / dailySales;
        if (daysLeft < RUNNING_OUT_DAYS) {
          runningOut.push({
            name: row.productName,
            quantity: row.quantity,
            dailySales: round2(dailySales),
            daysLeft: round2(daysLeft),
          });
        }
      }
    });
  const byDemand = (
    left: DailyReportStockSignal,
    right: DailyReportStockSignal,
  ) => right.dailySales - left.dailySales;
  const stockAsOf = stock
    .filter((row) => row.storeId === storeId)
    .reduce<Date | null>(
      (latest, row) =>
        !latest || row.snapshotDate > latest ? row.snapshotDate : latest,
      null,
    );
  return {
    outOfStock: outOfStock.sort(byDemand).slice(0, STOCK_SIGNAL_LIMIT),
    runningOut: runningOut.sort(byDemand).slice(0, STOCK_SIGNAL_LIMIT),
    stockAsOf,
  };
}

/** New and returning guests, visit length and the busiest hour of the day. */
export function guestSummary(
  window: ClubDayWindow,
  sessions: readonly DailyReportSessionRow[],
): DailyReportGuestSummary {
  const daySessions = sessions.filter((session) =>
    inWindow(session.startedAt, window),
  );
  const earlierFrom = window.from.getTime() - 7 * 24 * HOUR_MS;
  const seenBefore = new Set(
    sessions
      .filter(
        (session) =>
          session.guestKey &&
          session.startedAt.getTime() >= earlierFrom &&
          session.startedAt < window.from,
      )
      .map((session) => session.guestKey as string),
  );
  const firstByGuest = new Map<string, DailyReportSessionRow>();
  daySessions.forEach((session) => {
    if (session.guestKey && !firstByGuest.has(session.guestKey)) {
      firstByGuest.set(session.guestKey, session);
    }
  });
  let newGuests = 0;
  let regulars = 0;
  firstByGuest.forEach((session, key) => {
    if (seenBefore.has(key)) regulars += 1;
    const registered = session.guestRegisteredAt;
    if (registered && inWindow(registered, window)) newGuests += 1;
  });

  const durations = daySessions
    .map((session) => session.durationMinutes)
    .filter((value): value is number => value !== null && value > 0);
  const averageVisitHours = durations.length
    ? round2(
        durations.reduce((sum, value) => sum + value, 0) /
          durations.length /
          60,
      )
    : null;

  // Guests playing at each whole hour of the club day.
  let peakHour: string | null = null;
  let peakGuests = 0;
  for (
    let at = window.from.getTime() + HOUR_MS;
    at < window.to.getTime();
    at += HOUR_MS
  ) {
    const playing = new Set<string>();
    sessions.forEach((session, index) => {
      const start = session.startedAt.getTime();
      const end = start + (session.durationMinutes ?? 0) * 60_000;
      if (start <= at && at < end) {
        playing.add(session.guestKey ?? `session:${index}`);
      }
    });
    if (playing.size > peakGuests) {
      peakGuests = playing.size;
      peakHour = localTime(new Date(at), window.timeZone);
    }
  }
  return { newGuests, regulars, averageVisitHours, peakHour, peakGuests };
}

type ClubOnline = {
  online: DailyReportOnline;
  /** The club's part on each baseline window, by index. */
  baseline: number[];
};

/**
 * A club's weight in the split of its address's online top-ups: guests ×
 * average check, the check being the day's cash per visit.
 */
function onlineWeight(day: DayAggregate) {
  const averageCheck = day.visits > 0 ? day.shiftRevenue / day.visits : 0;
  return Math.max(0, day.guests * averageCheck);
}

/** Shares by weight, else by guests, else equal parts. */
function onlineShares(days: readonly DayAggregate[]) {
  const byWeight = (weight: (day: DayAggregate) => number) => {
    const weights = days.map(weight);
    const total = weights.reduce((sum, value) => sum + value, 0);
    return total > 0 ? weights.map((value) => value / total) : null;
  };
  return (
    byWeight(onlineWeight) ??
    byWeight((day) => day.guests) ??
    days.map(() => 1 / days.length)
  );
}

/** Parts of `total` by `shares`, in kopecks that add up to the total. */
function splitAmount(total: number, shares: readonly number[]) {
  const parts = shares.map((share) => round2(total * share));
  if (parts.length) {
    const others = parts.slice(0, -1).reduce((sum, value) => sum + value, 0);
    parts[parts.length - 1] = round2(total - others);
  }
  return parts;
}

/**
 * Each reported club's part of the online top-ups of its Langame address,
 * over the day and the usual day. Clubs on one address keep one clock, so
 * the first club's days are the address's days; peers outside the report's
 * scope weigh the split too. An address without any top-ups is left out.
 */
function onlineByClub(
  input: DailyReportInput,
  aggregate: (storeId: string, window: ClubDayWindow) => DayAggregate,
) {
  const topups = groupBy(input.onlineTopups ?? [], (row) => row.domain);
  const reported = new Set(input.stores.map((store) => store.id));
  const result = new Map<string, ClubOnline>();
  groupBy(
    [...input.stores, ...(input.addressPeers ?? [])].filter(
      (store) => store.domain,
    ),
    (store) => store.domain!,
  ).forEach((stores, domain) => {
    if (!reported.has(stores[0].id)) return;
    const rows = topups.get(domain) ?? [];
    const inDay = (window: ClubDayWindow) =>
      rows.filter((row) => inWindow(row.paidAt, window));
    const parts = (window: ClubDayWindow) => {
      const total = inDay(window).reduce((sum, row) => sum + row.amount, 0);
      const shares = onlineShares(
        stores.map((store) => aggregate(store.id, window)),
      );
      return { total, shares, parts: splitAmount(total, shares) };
    };
    const window = stores[0].window;
    const day = parts(window);
    const past = (input.baselineWindows[stores[0].id] ?? []).map(parts);
    const address = metric(
      day.total,
      past.map((item) => item.total),
    );
    if (!address.value && !address.usual) return;
    stores.forEach((store, index) => {
      if (!reported.has(store.id)) return;
      const baseline = past.map((item) => item.parts[index]);
      result.set(store.id, {
        online: {
          amount: metric(day.parts[index], baseline),
          payments: inDay(window).length,
          sharedWith: stores
            .filter((other) => other.id !== store.id)
            .map((other) => other.name),
          share: round2(day.shares[index]),
          addressAmount: round2(day.total),
        },
        baseline,
      });
    });
  });
  return result;
}

function sumMetrics(metrics: readonly DailyReportMetric[]): DailyReportMetric {
  const value = metrics.reduce((sum, item) => sum + item.value, 0);
  // The usual network day is the sum of each part's usual day, so a club
  // with a short history does not drag the network baseline down.
  const usual = metrics.every((item) => item.usual !== null)
    ? metrics.reduce((sum, item) => sum + (item.usual ?? 0), 0)
    : null;
  return {
    value: round2(value),
    usual: usual === null ? null : round2(usual),
    change: usual && usual > 0 ? round2(value / usual - 1) : null,
  };
}

function topProducts(sales: readonly DailyReportSaleRow[]) {
  return [...groupBy(sales, (sale) => sale.productKey).values()]
    .map((rows) => ({
      name: rows[0].productName,
      quantity: round2(rows.reduce((sum, row) => sum + row.quantity, 0)),
      revenue: round2(rows.reduce((sum, row) => sum + row.revenue, 0)),
    }))
    .sort((left, right) => right.revenue - left.revenue)
    .slice(0, TOP_PRODUCTS);
}

export function buildDailyReport(input: DailyReportInput): DailyReport {
  const now = input.generatedAt;
  const usualPerHour = adminUsualPerHour(input.historyShifts);
  const shiftsByStore = groupBy(input.shifts, (shift) => shift.storeId);
  const salesByStore = groupBy(input.sales, (sale) => sale.storeId);
  const sessionsByStore = groupBy(input.sessions, (session) => session.storeId);
  const alerts: Array<{ weight: number; text: string }> = [];
  const aggregateOf = (storeId: string, window: ClubDayWindow) =>
    aggregateDay(
      window,
      shiftsByStore.get(storeId) ?? [],
      salesByStore.get(storeId) ?? [],
      sessionsByStore.get(storeId) ?? [],
    );
  const online = onlineByClub(input, aggregateOf);

  const clubs: DailyReportClub[] = input.stores.map((store) => {
    const window = store.window;
    const storeShifts = shiftsByStore.get(store.id) ?? [];
    const storeSales = salesByStore.get(store.id) ?? [];
    const storeSessions = sessionsByStore.get(store.id) ?? [];
    const day = aggregateDay(window, storeShifts, storeSales, storeSessions);
    const pastDays = (input.baselineWindows[store.id] ?? [])
      .map((past, index) => ({
        index,
        day: aggregateDay(past, storeShifts, storeSales, storeSessions),
      }))
      .filter((past) => past.day.hasData);
    const baseline = pastDays.map((past) => past.day);
    const pick = (key: MetricKey) =>
      metric(
        day[key],
        baseline.map((past) => past[key]),
      );

    const dayShiftRows = storeShifts
      .filter((shift) => shiftBelongsToDay(shift, window))
      .sort(
        (left, right) =>
          (left.startedAt?.getTime() ?? 0) - (right.startedAt?.getTime() ?? 0),
      );
    const shifts: DailyReportShift[] = dayShiftRows.map((shift) => {
      const hours = shiftHours(shift, now);
      const revenue = shiftRevenue(shift);
      return {
        id: shift.id,
        adminName: shift.adminName ?? 'Администратор не определён',
        startedAt: shift.startedAt
          ? localTime(shift.startedAt, window.timeZone)
          : null,
        stoppedAt: shift.stoppedAt
          ? localTime(shift.stoppedAt, window.timeZone)
          : null,
        closed: Boolean(shift.stoppedAt),
        hours: round2(hours),
        revenue: round2(revenue),
        cash: round2(shift.cash),
        cashless: round2(shift.cashless + shift.mobilePay + shift.yandexPay),
        refunds: round2(shift.refunds),
        revenuePerHour:
          shift.stoppedAt && hours >= MIN_COMPARABLE_SHIFT_HOURS
            ? round2(revenue / hours)
            : null,
        adminUsualPerHour: shift.adminKey
          ? round2(usualPerHour.get(shift.adminKey) ?? 0) || null
          : null,
      };
    });
    const openShifts = shifts.filter((shift) => !shift.closed);
    const gaps = uncoveredPeriods(window, dayShiftRows, now);
    const daySales = storeSales.filter((sale) =>
      inWindow(sale.saleDate, window),
    );
    const stock = stockSignals(
      store.id,
      input.stock,
      input.stockSales,
      input.stockDays,
      input.oosExcludedProductKeys,
    );
    const refunds = dayShiftRows.reduce((sum, shift) => sum + shift.refunds, 0);
    const clubOnline = online.get(store.id);
    const club: DailyReportClub = {
      storeId: store.id,
      name: store.name,
      timeZone: window.timeZone,
      reportDate: window.reportDate,
      from: window.from.toISOString(),
      to: window.to.toISOString(),
      shifts,
      openShifts: openShifts.length,
      uncoveredPeriods: gaps,
      metrics: {
        shiftRevenue: pick('shiftRevenue'),
        barRevenue: pick('barRevenue'),
        barMargin: pick('barMargin'),
        barItems: pick('barItems'),
        visits: pick('visits'),
        guests: pick('guests'),
        playHours: pick('playHours'),
      },
      load:
        store.computerCount && store.computerCount > 0
          ? round2(day.playHours / (store.computerCount * 24))
          : null,
      computerCount: store.computerCount ?? null,
      guestSummary: guestSummary(window, storeSessions),
      online: clubOnline?.online ?? null,
      revenue: metric(
        day.shiftRevenue + (clubOnline?.online.amount.value ?? 0),
        pastDays.map(
          (past) =>
            past.day.shiftRevenue + (clubOnline?.baseline[past.index] ?? 0),
        ),
      ),
      refunds: round2(refunds),
      topProducts: topProducts(daySales),
      outOfStock: stock.outOfStock,
      runningOut: stock.runningOut,
      stockAsOf: stock.stockAsOf ? stock.stockAsOf.toISOString() : null,
      baselineDays: baseline.length,
    };

    openShifts.forEach((shift) =>
      alerts.push({
        weight: 100,
        text: `${store.name}: смена ${shortPersonName(shift.adminName)} не закрыта${shift.startedAt ? ` (открыта в ${shift.startedAt})` : ''}`,
      }),
    );
    if (gaps.length) {
      alerts.push({
        weight: 90,
        text: `${store.name}: не было открытой смены ${gaps.join(', ')}`,
      });
    }
    if (dayShiftRows.length === 0) {
      alerts.push({
        weight: 95,
        text: `${store.name}: за сутки нет ни одной смены в данных`,
      });
    }
    const revenueChange = club.metrics.shiftRevenue.change;
    if (revenueChange !== null && revenueChange <= REVENUE_DROP_ALERT) {
      alerts.push({
        weight: 80,
        text: `${store.name}: касса ${formatRub(club.metrics.shiftRevenue.value)}, ${formatArrow(revenueChange)} к обычному`,
      });
    }
    const barChange = club.metrics.barRevenue.change;
    if (
      club.metrics.barRevenue.value === 0 &&
      (club.metrics.barRevenue.usual ?? 0) > 0
    ) {
      alerts.push({
        weight: 85,
        text: `${store.name}: нет продаж бара в данных, проверьте выгрузку из Langame`,
      });
    } else if (barChange !== null && barChange <= BAR_DROP_ALERT) {
      alerts.push({
        weight: 70,
        text: `${store.name}: бар ${formatRub(club.metrics.barRevenue.value)}, ${formatArrow(barChange)} к обычному`,
      });
    }
    if (
      refunds >= REFUND_MIN_ALERT &&
      day.shiftRevenue > 0 &&
      refunds / (day.shiftRevenue + refunds) >= REFUND_SHARE_ALERT
    ) {
      alerts.push({
        weight: 60,
        text: `${store.name}: возвраты ${formatRub(refunds)}`,
      });
    }
    if (stock.outOfStock.length) {
      // The names are in the club's own message; here only how many.
      const count = stock.outOfStock.length;
      alerts.push({
        weight: 75,
        text: `${store.name}: закончились ${count} ${pluralRu(count, ['ходовой товар', 'ходовых товара', 'ходовых товаров'])}`,
      });
    }
    if (day.shiftRevenue > 0 && club.metrics.visits.value === 0) {
      alerts.push({
        weight: 65,
        text: `${store.name}: нет данных о гостях при кассе ${formatRub(day.shiftRevenue)}, проверьте сессии в Langame`,
      });
    }
    if (
      stock.stockAsOf &&
      now.getTime() - stock.stockAsOf.getTime() > STALE_STOCK_MS
    ) {
      alerts.push({
        weight: 40,
        text: `${store.name}: остатки устарели, последние данные за ${stock.stockAsOf.toISOString().slice(0, 10)}`,
      });
    }
    return club;
  });

  // Admins of the day across the network: closed shifts long enough to compare.
  const dayShiftRows = input.stores.flatMap((store) =>
    (shiftsByStore.get(store.id) ?? [])
      .filter((shift) => shiftBelongsToDay(shift, store.window))
      .map((shift) => ({ shift, store })),
  );
  const comparable = dayShiftRows.filter(
    ({ shift }) =>
      shift.stoppedAt &&
      shiftHours(shift, shift.stoppedAt) >= MIN_COMPARABLE_SHIFT_HOURS,
  );
  const networkHours = comparable.reduce(
    (sum, { shift }) => sum + shiftHours(shift, shift.stoppedAt!),
    0,
  );
  const networkRevenue = comparable.reduce(
    (sum, { shift }) => sum + shiftRevenue(shift),
    0,
  );
  const networkRevenuePerHour =
    networkHours > 0 ? networkRevenue / networkHours : null;
  const admins: DailyReportAdmin[] = [
    ...groupBy(
      comparable,
      ({ shift }) => shift.adminKey ?? `unknown:${shift.id}`,
    ).values(),
  ]
    .map((rows) => {
      const hours = rows.reduce(
        (sum, { shift }) => sum + shiftHours(shift, shift.stoppedAt!),
        0,
      );
      const revenue = rows.reduce(
        (sum, { shift }) => sum + shiftRevenue(shift),
        0,
      );
      const perHour = hours > 0 ? revenue / hours : null;
      const adminKey = rows[0].shift.adminKey;
      const usual = adminKey ? usualPerHour.get(adminKey) : undefined;
      return {
        name: rows[0].shift.adminName ?? 'Администратор не определён',
        clubs: [...new Set(rows.map(({ store }) => store.name))],
        shifts: rows.length,
        hours: round2(hours),
        revenue: round2(revenue),
        revenuePerHour: perHour === null ? null : round2(perHour),
        vsNetwork:
          perHour !== null && networkRevenuePerHour
            ? round2(perHour / networkRevenuePerHour - 1)
            : null,
        vsUsual:
          perHour !== null && usual && usual > 0
            ? round2(perHour / usual - 1)
            : null,
      };
    })
    .sort(
      (left, right) => (right.revenuePerHour ?? 0) - (left.revenuePerHour ?? 0),
    );
  admins
    .filter(
      (admin) => admin.vsUsual !== null && admin.vsUsual <= ADMIN_DROP_ALERT,
    )
    .forEach((admin) =>
      alerts.push({
        weight: 50,
        text: `${shortPersonName(admin.name)}: ${formatRub(admin.revenuePerHour ?? 0)} в час, ${formatArrow(admin.vsUsual)} к своему обычному`,
      }),
    );

  const sumMetric = (key: MetricKey) =>
    sumMetrics(clubs.map((club) => club.metrics[key]));
  const shiftTotal = sumMetric('shiftRevenue');
  const clubsOnline = clubs.flatMap((club) =>
    club.online ? [club.online] : [],
  );
  const onlineTotal = sumMetrics(clubsOnline.map((item) => item.amount));
  // Clubs of one address count its payments once.
  const addressPayments = new Map<string, number>();
  input.stores.forEach((store, index) => {
    const payments = clubs[index].online?.payments;
    if (store.domain && payments !== undefined) {
      addressPayments.set(store.domain, payments);
    }
  });

  return {
    generatedAt: now.toISOString(),
    clubs,
    totals: {
      revenue: clubsOnline.length
        ? sumMetrics([shiftTotal, onlineTotal])
        : shiftTotal,
      shiftRevenue: shiftTotal,
      onlineTopups: onlineTotal,
      onlinePayments: [...addressPayments.values()].reduce(
        (sum, payments) => sum + payments,
        0,
      ),
      barRevenue: sumMetric('barRevenue'),
      barMargin: sumMetric('barMargin'),
      visits: sumMetric('visits'),
      guests: sumMetric('guests'),
      playHours: sumMetric('playHours'),
      openShifts: clubs.reduce((sum, club) => sum + club.openShifts, 0),
    },
    admins,
    networkRevenuePerHour:
      networkRevenuePerHour === null ? null : round2(networkRevenuePerHour),
    alerts: alerts
      .sort((left, right) => right.weight - left.weight)
      .map((alert) => alert.text),
  };
}
