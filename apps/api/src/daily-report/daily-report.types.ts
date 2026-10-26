import type { ClubDayWindow } from './daily-report-window';

export type DailyReportStore = {
  id: string;
  name: string;
  timeZone: string;
  computerCount: number | null;
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
  refunds: number;
  incass: number;
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
    shiftRevenue: DailyReportMetric;
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
