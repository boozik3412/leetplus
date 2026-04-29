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
  price_purchase: string | null;
  price_sale: number;
  count: number;
  cancel: number;
};

export type LangameSyncQuery = {
  dateFrom?: string;
  dateTo?: string;
};

export type LangameSyncResult = {
  tenantId: string;
  sources: number;
  stores: number;
  products: number;
  inventorySnapshots: number;
  salesFacts: number;
};
