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
};

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
  date_start?: string | null;
  date_stop?: string | null;
  UUID?: string | null;
  normal_stop?: number | boolean | null;
  expand?: number | boolean | null;
  create_by_rezerv?: number | boolean | null;
  packet?: number | boolean | null;
  club_id?: number | string | null;
  list_clubs_id?: number | string | null;
};

export type LangameGuestLog = {
  guest_id?: number | string | null;
  type?: string | number | null;
  date?: string | null;
};

export type LangameTransaction = {
  id: number | string;
  guest_id?: number | string | null;
  real_guest_id?: number | string | null;
  club_id?: number | string | null;
  list_clubs_id?: number | string | null;
  type?: string | number | null;
  date?: string | null;
  date_insert?: string | null;
  date_update?: string | null;
  sum?: number | string | null;
  amount?: number | string | null;
  balance?: number | string | null;
  bonus_balance?: number | string | null;
};

export type LangameOperationLog = {
  date_normal: string;
  club_id: string | number | null;
  type: string;
  sum: number | string | null;
};

export type LangameCashTransaction = Record<string, unknown>;

export type LangameWorkingShift = Record<string, unknown>;

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
