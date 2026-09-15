export type ExecutiveMetricUnit = 'RUB' | 'COUNT' | 'PERCENT' | 'RUB_PER_VISIT';

export type ExecutiveMetricState =
  | 'AVAILABLE'
  | 'PARTIAL'
  | 'MISSING'
  | 'STALE'
  | 'FAILED';

export type ExecutiveCoverage = {
  covered: number;
  total: number | null;
  percent: number | null;
  basis:
    | 'STORE_DAYS'
    | 'STORE_OPERATIONS'
    | 'STORE_SESSIONS'
    | 'CAPACITY_HOURS';
};

export type ExecutiveAppliedScope = {
  period: { from: string; to: string; timezone: string };
  storeIds: string[];
  storeTimeZones: Record<string, string>;
  comparison: { from: string; to: string } | null;
  asOf: string;
};

export type ExecutiveMetric<T = number> = {
  key: string;
  unit: ExecutiveMetricUnit;
  definition: string;
  grain: string;
  value: T | null;
  state: ExecutiveMetricState;
  reason: string | null;
  coverage: ExecutiveCoverage | null;
  factAsOf: string | null;
  lastCalculatedAt: string;
  comparison: {
    previousValue: number | null;
    absoluteDelta: number | null;
    percentDelta: number | null;
    pointsDelta: number | null;
  } | null;
  ratio: {
    numeratorValue: number | null;
    denominatorValue: number | null;
    numeratorLabel: string;
    denominatorLabel: string;
    compatible: boolean;
  } | null;
  destination?: 'CLUBS' | 'ASSORTMENT';
  receiptEvidence?: {
    receiptCount: number | null;
    operations: { covered: number; total: number; percent: number | null };
    revenue: { covered: number; total: number; percent: number | null };
    ambiguousIdentityCount: number;
  };
};

export type ExecutiveMetricKey =
  | 'revenue'
  | 'serviceRevenue'
  | 'topups'
  | 'visits'
  | 'revenuePerVisit'
  | 'load'
  | 'productRevenue'
  | 'productRevenueShare'
  | 'averageProductCheck';

export type ExecutiveMetrics = Record<ExecutiveMetricKey, ExecutiveMetric>;
