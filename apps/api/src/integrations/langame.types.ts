export type LangameClub = {
  id: number;
  name: string;
  address: string | null;
  active: number;
};

export type LangameProduct = {
  id: number;
  name: string;
  active: number;
};

export type LangameGood = {
  id: number;
  name: string;
  count: number;
};

export type LangameProductExpense = {
  id: number;
  date: string;
  list_goods_id: number;
  list_clubs_id: number | null;
  real_guest_id?: number | string | null;
  guest_id?: number | string | null;
  price_purchase: string | null;
  price_sale: number;
  count: number;
  cancel: number;
} & Record<string, unknown>;

export type LangameGuest = {
  guest_id: number | string;
  guest_type_id?: number | string | null;
  phone?: string | null;
  email?: string | null;
  fio?: string | null;
  birthday?: string | null;
  gender?: string | null;
  date_insert?: string | null;
  date_last_activity?: string | null;
  virtual?: number | boolean | null;
  temp_guest?: number | boolean | null;
  disabled?: number | boolean | null;
  simple_reg?: number | boolean | null;
  confirm?: number | boolean | null;
  current_count_hours?: number | string | null;
  mobile_reg?: number | boolean | null;
  identity_document?: string | number | boolean | null;
  identity_document_data?: unknown;
  bonus_program_number?: string | null;
};

export type LangameGuestGroup = {
  id: number | string;
  name: string;
  percent?: number | string | null;
  count_hours_from?: number | string | null;
  count_hours_to?: number | string | null;
  bonus_birthday?: number | string | null;
};

export type LangameGuestBalance = {
  guest_id: number | string;
  balance: number | string | null;
};

export type LangameGuestBonusBalance = {
  guest_id: number | string;
  bonus_balance: number | string | null;
};

export type LangameGuestSession = {
  id: number | string;
  guest_id?: number | string | null;
  real_guest_id?: number | string | null;
  date_start?: string | null;
  date_stop?: string | null;
  UUID?: string | null;
  normal_stop?: number | boolean | null;
  expand?: number | boolean | null;
  create_by_rezerv?: number | boolean | null;
  packet?: number | string | boolean | null;
  club_id?: number | string | null;
  list_clubs_id?: number | string | null;
} & Record<string, unknown>;

export type LangameTariffTypeGroup = {
  id: number | string;
  type?: string | null;
  name?: string | null;
  comment?: string | null;
  duration?: number | string | null;
  subs_duration?: number | string | null;
} & Record<string, unknown>;

export type LangameGuestLog = {
  guest_id?: number | string | null;
  real_guest_id?: number | string | null;
  club_id?: number | string | null;
  list_clubs_id?: number | string | null;
  session_id?: number | string | null;
  UUID?: string | null;
  type?: string | number | null;
  date?: string | null;
  date_normal?: string | null;
  date_insert?: string | null;
  date_update?: string | null;
  created_at?: string | null;
  created?: string | null;
  time?: string | null;
  datetime?: string | null;
  comment?: string | null;
  name?: string | null;
  title?: string | null;
  description?: string | null;
  message?: string | null;
  text?: string | null;
  tariff?: string | null;
  tarif?: string | null;
  tariff_name?: string | null;
  tarif_name?: string | null;
  sum?: number | string | null;
  amount?: number | string | null;
  balance?: number | string | null;
  bonus?: number | string | null;
  bonuses?: number | string | null;
  bonus_balance?: number | string | null;
} & Record<string, unknown>;

export type LangameTransaction = {
  id: number | string;
  guest_id?: number | string | null;
  real_guest_id?: number | string | null;
  club_id?: number | string | null;
  list_clubs_id?: number | string | null;
  working_shift_id?: number | string | null;
  session_id?: number | string | null;
  UUID?: string | null;
  type?: string | number | null;
  date?: string | null;
  date_normal?: string | null;
  date_insert?: string | null;
  date_update?: string | null;
  created_at?: string | null;
  created?: string | null;
  time?: string | null;
  datetime?: string | null;
  sum?: number | string | null;
  amount?: number | string | null;
  balance?: number | string | null;
  bonus_balance?: number | string | null;
  payment_1C?: number | boolean | null;
  admin?: number | boolean | null;
  cancel?: number | boolean | null;
  Beznal?: number | boolean | null;
  mobile?: number | boolean | null;
  soft?: number | boolean | null;
  comment?: string | null;
} & Record<string, unknown>;

export type LangameOperationLog = {
  date_normal: string;
  date?: string | null;
  time?: string | null;
  club_id: string | number | null;
  club_name?: string | null;
  type: string;
  name?: string | null;
  source?: string | null;
  form?: string | null;
  sum: number | string | null;
};

export type LangameCashTransaction = Record<string, unknown>;

export type LangameUser = {
  id: number | string;
  email?: string | null;
  username?: string | null;
  admin_status?: string | number | boolean | null;
  verified?: string | number | boolean | null;
  comment?: string | null;
  registered?: string | null;
  last_login?: string | null;
  phone?: string | null;
  birthday?: string | null;
  work_schedule?: unknown;
  identity_document?: string | number | boolean | null;
  identity_document_data?: unknown;
  guest_id?: number | string | null;
  work_point?: unknown;
};

export type LangameWorkingShift = Record<string, unknown>;

export type LangamePcTypeInClub = Record<string, unknown>;

export type LangamePcTypeLink = Record<string, unknown>;

export type LangameRouteSummary = {
  method: string | null;
  path: string | null;
  name: string | null;
  params: unknown;
  raw: unknown;
};

export type LangameRoutesDiagnosticsSource = {
  id: string;
  name: string;
  domain: string;
  baseUrl: string;
  status: 'SUCCESS' | 'FAILED';
  routesCount: number;
  routes: LangameRouteSummary[];
  payload: unknown;
  errorMessage: string | null;
};

export type LangameRoutesDiagnosticsResult = {
  checkedAt: string;
  sources: LangameRoutesDiagnosticsSource[];
};

export type LangameServiceEndpointKey =
  | 'config'
  | 'pufProfiles'
  | 'adminConsoleVersion'
  | 'softwareVersion'
  | 'terminalVersion';

export type LangameServiceEndpointDefinition = {
  key: LangameServiceEndpointKey;
  title: string;
  path: string;
};

export type LangameServiceEndpointDiagnostics =
  LangameServiceEndpointDefinition & {
    status: 'SUCCESS' | 'FAILED';
    rowCount: number;
    payloadKind: 'array' | 'object' | 'scalar' | 'empty';
    fieldKeys: string[];
    summary: string | null;
    payloadPreview: unknown;
    errorMessage: string | null;
  };

export type LangameServiceDiagnosticsSource = {
  id: string;
  name: string;
  domain: string;
  baseUrl: string;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  endpoints: LangameServiceEndpointDiagnostics[];
};

export type LangameServiceDiagnosticsResult = {
  checkedAt: string;
  endpoints: LangameServiceEndpointDefinition[];
  sources: LangameServiceDiagnosticsSource[];
};

export type LangameGuestSearchField =
  | 'auto'
  | 'phone'
  | 'email'
  | 'guest_id'
  | 'fio'
  | 'bonus_program_number';

export type LangameGuestSearchQuery = {
  query?: string;
  field?: LangameGuestSearchField;
  sourceId?: string;
  sourceDomain?: string;
};

export type LangameGuestSearchResultItem = {
  externalGuestId: string | null;
  guestTypeId: string | null;
  phoneMasked: string | null;
  emailMasked: string | null;
  fullNameMasked: string | null;
  bonusProgramNumberMasked: string | null;
  dateLastActivity: string | null;
  rawKeys: string[];
};

export type LangameGuestSearchDiagnosticsSource = {
  id: string;
  name: string;
  domain: string;
  baseUrl: string;
  status: 'SUCCESS' | 'FAILED';
  requestKeys: string[];
  resultsCount: number;
  results: LangameGuestSearchResultItem[];
  payloadPreview: unknown;
  errorMessage: string | null;
};

export type LangameGuestSearchDiagnosticsResult = {
  checkedAt: string;
  queryField: LangameGuestSearchField;
  sources: LangameGuestSearchDiagnosticsSource[];
};

export type LangameGuestDetailsPortalResult = {
  checkedAt: string;
  externalGuestId: string;
  source: {
    id: string;
    name: string;
    domain: string;
    status: 'SUCCESS' | 'FAILED';
    path: string;
    payloadKind: 'array' | 'object' | 'scalar' | 'empty';
    fieldKeys: string[];
    summary: string | null;
    payloadPreview: unknown;
    errorMessage: string | null;
  };
  details: {
    externalGuestId: string | null;
    guestTypeId: string | null;
    phoneMasked: string | null;
    emailMasked: string | null;
    fullNameMasked: string | null;
    bonusProgramNumberMasked: string | null;
    registeredAt: string | null;
    dateLastActivity: string | null;
    currentCountHours: string | null;
    statusLabels: string[];
    rawKeys: string[];
  } | null;
};

export type LangameGuestBalancesPortalResult = {
  checkedAt: string;
  externalGuestId: string;
  source: {
    id: string;
    name: string;
    domain: string;
    status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
    errorMessage: string | null;
  };
  balance: number | null;
  bonusBalance: number | null;
  balanceFound: boolean;
  bonusBalanceFound: boolean;
};

export type LangameEndpointProfileKey =
  | 'allOperationsLog'
  | 'transactions'
  | 'balances'
  | 'cashTransactions'
  | 'workingShifts'
  | 'productExpenses'
  | 'productArrivals'
  | 'clubs'
  | 'products'
  | 'goods'
  | 'pcTypesInClubs'
  | 'pcTypeLinks'
  | 'guests'
  | 'guestDetails'
  | 'guestGroups'
  | 'guestBalances'
  | 'guestBonusBalances'
  | 'guestSessions'
  | 'guestLogs'
  | 'tariffsByDays'
  | 'tariffsGroups'
  | 'tariffsTimePeriod'
  | 'tariffsTypesGroups'
  | 'users';

export type LangameEndpointProfileParamMode =
  | 'none'
  | 'page'
  | 'date_page'
  | 'date'
  | 'club'
  | 'club_page'
  | 'club_date'
  | 'guest_id';

export type LangameEndpointProfileGroup =
  | 'dashboard'
  | 'guests'
  | 'assortment'
  | 'marketing'
  | 'staff';

export type LangameEndpointProfileDefinition = {
  key: LangameEndpointProfileKey;
  title: string;
  path: string;
  group: LangameEndpointProfileGroup;
  paramMode: LangameEndpointProfileParamMode;
  requiredParams: string[];
};

export type LangameEndpointProfileQuery = {
  endpointKey?: LangameEndpointProfileKey;
  sourceId?: string;
  sourceDomain?: string;
  dateFrom?: string;
  dateTo?: string;
  clubId?: string;
  guestId?: string;
  page?: number | string;
  pageLimit?: number | string;
};

export type LangameEndpointProfileDiagnosticsSource = {
  id: string;
  name: string;
  domain: string;
  baseUrl: string;
  status: 'SUCCESS' | 'FAILED';
  path: string;
  requestParams: Record<string, string>;
  rowCount: number;
  payloadKind: 'array' | 'object' | 'scalar' | 'empty';
  fieldKeys: string[];
  summary: string | null;
  payloadPreview: unknown;
  errorMessage: string | null;
};

export type LangameEndpointProfileDiagnosticsResult = {
  checkedAt: string;
  endpoint: LangameEndpointProfileDefinition;
  sources: LangameEndpointProfileDiagnosticsSource[];
};

export type LangameEndpointSnapshotSource = {
  id: string;
  name: string;
  domain: string;
  baseUrl: string;
  status: 'SUCCESS' | 'FAILED';
  path: string;
  requestParams: Record<string, string>;
  rowCount: number;
  payloadKind: 'array' | 'object' | 'scalar' | 'empty';
  fieldKeys: string[];
  summary: string | null;
  errorMessage: string | null;
  snapshotRunId: string | null;
};

export type LangameEndpointSnapshotResult = {
  startedAt: string;
  finishedAt: string;
  endpoint: LangameEndpointProfileDefinition;
  sources: LangameEndpointSnapshotSource[];
};

export type LangameEndpointProfileRunSummary = {
  id: string;
  domain: string;
  endpointKey: string;
  endpointPath: string;
  group: string;
  status: string;
  checkedAt: string;
  dateFrom: string | null;
  dateTo: string | null;
  requestParams: unknown;
  rowCount: number;
  payloadKind: string | null;
  fieldKeys: string[];
  summary: string | null;
  errorMessage: string | null;
};

export type LangameEndpointSnapshotRunSummary = {
  id: string;
  domain: string;
  endpointKey: string;
  endpointPath: string;
  group: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  requestParams: unknown;
  rowCount: number;
  payloadKind: string | null;
  fieldKeys: string[];
  summary: string | null;
  errorMessage: string | null;
};

export type LangameEndpointSnapshotCandidateStatus =
  | 'READY'
  | 'PARTIAL'
  | 'STALE'
  | 'FAILED'
  | 'UNPROFILED';

export type LangameEndpointSnapshotCandidate = {
  endpointKey: string;
  endpointPath: string;
  title: string;
  group: string;
  status: LangameEndpointSnapshotCandidateStatus;
  activeSourcesCount: number;
  checkedSourcesCount: number;
  successfulSourcesCount: number;
  failedSourcesCount: number;
  latestCheckedAt: string | null;
  rowCount: number;
  nextAction: string;
};

export type LangameSyncQuery = {
  dateFrom?: string;
  dateTo?: string;
  mode?: 'QUICK' | 'INVENTORY' | 'CATALOG' | 'BACKFILL' | 'FULL';
  trigger?: 'MANUAL' | 'AUTO';
  tenantSlug?: string;
  catchUp?: boolean;
};

export type LangameSyncResult = {
  tenantId: string;
  sources: number;
  failedSources: number;
  stores: number;
  products: number;
  inventorySnapshots: number;
  salesFacts: number;
  clubRevenueFacts: number;
  discrepancies: number;
  sourceResults: LangameSyncSourceResult[];
};

export type LangameSyncSourceResult = {
  domain: string;
  status: 'SUCCESS' | 'FAILED';
  stores: number;
  products: number;
  inventorySnapshots: number;
  salesFacts: number;
  clubRevenueFacts: number;
  discrepancies: number;
  discrepancyLogPath: string | null;
  errorMessage: string | null;
};

export type LangameScheduledSyncResult = {
  mode: NonNullable<LangameSyncQuery['mode']>;
  tenants: number;
  results: LangameSyncResult[];
};
