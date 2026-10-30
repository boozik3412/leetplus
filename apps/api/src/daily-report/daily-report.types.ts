import type { ClubDayWindow } from './daily-report-window';

export type DailyReportStore = {
  id: string;
  name: string;
  timeZone: string;
  computerCount: number | null;
  /** Langame address of the club (`46.langamepro.ru`); several clubs may share one. */
  domain?: string | null;
};

export type DailyReportShiftRow = {
  id: string;
  storeId: string;
  adminKey: string | null;
  adminName: string | null;
  startedAt: Date | null;
  stoppedAt: Date | null;
  cash: number;
  cashless: number;
  mobilePay: number;
  yandexPay: number;
  refunds: number;
  incass: number;
};

/**
 * A balance top-up the guest paid online in the Langame app. Langame records
 * it without a club, so it never reaches a shift's cash; only the Langame
 * address tells which clubs it belongs to.
 */
export type DailyReportOnlineTopupRow = {
  domain: string;
  paidAt: Date;
  amount: number;
};

export type DailyReportSaleRow = {
  storeId: string;
  productKey: string;
  productName: string;
  saleDate: Date;
  quantity: number;
  revenue: number;
  cost: number;
};

export type DailyReportSessionRow = {
  storeId: string;
  guestKey: string | null;
  startedAt: Date;
  durationMinutes: number | null;
  /** When the guest registered in the club system, if known. */
  guestRegisteredAt?: Date | null;
};

/** Short guest summary of one club day. */
export type DailyReportGuestSummary = {
  /** Guests registered during the club day. */
  newGuests: number;
  /** Guests who also came during the previous 7 club days. */
  regulars: number;
  /** Average visit length, hours; null without durations. */
  averageVisitHours: number | null;
  /** Local hour (`HH:00`) with the most guests playing at once. */
  peakHour: string | null;
  peakGuests: number;
};

export type DailyReportStockRow = {
  storeId: string;
  productKey: string;
  productName: string;
  quantity: number;
  snapshotDate: Date;
};

export type DailyReportInput = {
  generatedAt: Date;
  stores: Array<DailyReportStore & { window: ClubDayWindow }>;
  /** Past club days of each store, newest first, for the usual-day baseline. */
  baselineWindows: Record<string, ClubDayWindow[]>;
  /** Shifts that overlap the report or baseline windows. */
  shifts: DailyReportShiftRow[];
  /** Closed shifts of the admin comparison period. */
  historyShifts: DailyReportShiftRow[];
  sales: DailyReportSaleRow[];
  sessions: DailyReportSessionRow[];
  /** Latest stock snapshot of each store and product. */
  stock: DailyReportStockRow[];
  /** Sales of the stock period (`stockDays`) for days of cover. */
  stockSales: DailyReportSaleRow[];
  stockDays: number;
  /** Products the owner excluded from out-of-stock signals. */
  oosExcludedProductKeys: ReadonlySet<string>;
  /** Online top-ups of the report and baseline windows. */
  onlineTopups?: DailyReportOnlineTopupRow[];
  /**
   * Clubs outside the report's scope on the Langame address of a reported
   * club. They are not reported; their shifts and sessions in `shifts` and
   * `sessions` only weigh the split of the address's online top-ups.
   */
  addressPeers?: Array<DailyReportStore & { window: ClubDayWindow }>;
};

export type DailyReportShift = {
  id: string;
  adminName: string;
  startedAt: string | null;
  stoppedAt: string | null;
  closed: boolean;
  hours: number;
  revenue: number;
  cash: number;
  cashless: number;
  refunds: number;
  revenuePerHour: number | null;
  /** The admin's own usual revenue per hour over the comparison period. */
  adminUsualPerHour: number | null;
};

export type DailyReportProductLine = {
  name: string;
  quantity: number;
  revenue: number;
};

export type DailyReportStockSignal = {
  name: string;
  quantity: number;
  /** Average sold per day over the stock period. */
  dailySales: number;
  daysLeft: number | null;
};

export type DailyReportMetric = {
  value: number;
  /** Average of the same metric over the baseline days, if any. */
  usual: number | null;
  /** Relative change to `usual`, e.g. -0.18 for −18 %. */
  change: number | null;
};

/** The club's part of the online top-ups of its Langame address. */
export type DailyReportOnline = {
  /** All of the address's top-ups, or the club's share of a common address. */
  amount: DailyReportMetric;
  /** Payments on the address over the club day. */
  payments: number;
  /**
   * Other clubs on the same Langame address. An online payment names no
   * club, so the address's top-ups are split between its clubs in proportion
   * to guests × average check (cash per visit) of the day.
   */
  sharedWith: string[];
  /** The club's share of the address's top-ups of the day, 1 when alone. */
  share: number;
  /** All top-ups of the address over the club day. */
  addressAmount: number;
};

export type DailyReportClub = {
  storeId: string;
  name: string;
  timeZone: string;
  reportDate: string;
  from: string;
  to: string;
  shifts: DailyReportShift[];
  openShifts: number;
  /** Parts of the club day that no shift covered, local `HH:MM–HH:MM`. */
  uncoveredPeriods: string[];
  metrics: {
    shiftRevenue: DailyReportMetric;
    barRevenue: DailyReportMetric;
    barMargin: DailyReportMetric;
    barItems: DailyReportMetric;
    visits: DailyReportMetric;
    guests: DailyReportMetric;
    playHours: DailyReportMetric;
  };
  /** Share of PC hours used, if the club's computer count is known. */
  load: number | null;
  computerCount: number | null;
  guestSummary: DailyReportGuestSummary;
  online: DailyReportOnline | null;
  /** Cash plus the club's part of online top-ups. */
  revenue: DailyReportMetric;
  refunds: number;
  topProducts: DailyReportProductLine[];
  outOfStock: DailyReportStockSignal[];
  runningOut: DailyReportStockSignal[];
  stockAsOf: string | null;
  baselineDays: number;
};

export type DailyReportAdmin = {
  name: string;
  clubs: string[];
  shifts: number;
  hours: number;
  revenue: number;
  revenuePerHour: number | null;
  /** Relative to the network revenue per hour of the same club day. */
  vsNetwork: number | null;
  /** Relative to the admin's own usual revenue per hour. */
  vsUsual: number | null;
};

export type DailyReport = {
  generatedAt: string;
  clubs: DailyReportClub[];
  totals: {
    /** Clubs' cash plus online top-ups: all money the network took in. */
    revenue: DailyReportMetric;
    shiftRevenue: DailyReportMetric;
    onlineTopups: DailyReportMetric;
    onlinePayments: number;
    barRevenue: DailyReportMetric;
    barMargin: DailyReportMetric;
    visits: DailyReportMetric;
    guests: DailyReportMetric;
    playHours: DailyReportMetric;
    openShifts: number;
  };
  admins: DailyReportAdmin[];
  networkRevenuePerHour: number | null;
  /** Short facts that need the owner's attention, most important first. */
  alerts: string[];
};
