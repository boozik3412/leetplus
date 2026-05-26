import { getApiUrl, getAuthHeaders } from "./api";

export type MarketingCampaignGoal =
  | "RETURN_GUESTS"
  | "REPEAT_VISIT"
  | "WEAK_HOURS"
  | "BAR_GROWTH"
  | "EVENT_PROMO"
  | "PROMO_BUNDLE";

export type MarketingCampaignStatus =
  | "DRAFT"
  | "PLANNED"
  | "RUNNING"
  | "FINISHED"
  | "CANCELED";

export type MarketingCampaignConsentCoverage = {
  targetTotal: number;
  phoneGranted: number;
  phoneDenied: number;
  phoneUnsubscribed: number;
  phoneUnknown: number;
  contactable: number;
  excluded: number;
  requiresPhoneConsent: boolean;
};

export type MarketingCampaign = {
  id: string;
  goal: MarketingCampaignGoal;
  name: string;
  status: MarketingCampaignStatus;
  channel: string | null;
  mechanic: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  dueAt: string | null;
  budget: number | null;
  note: string | null;
  storeIds: string[];
  createdAt: string;
  updatedAt: string;
  audience: { id: string; name: string; guestsCount: number } | null;
  crmTask: {
    id: string;
    title: string;
    status: string;
    dueAt: string | null;
  } | null;
  consentCoverage: MarketingCampaignConsentCoverage;
  createdBy: { id: string; displayName: string; email: string } | null;
  owner: { id: string; displayName: string; email: string } | null;
};

export type MarketingCampaignEffectPeriod = {
  from: string;
  to: string;
  days: number;
  contacts: number;
  directContacts: number;
  respondedContacts: number;
  activeGuests: number;
  repeatGuests: number;
  sessionsCount: number;
  playHours: number;
  balanceRevenue: number;
  barRevenue: number;
  totalRevenue: number;
  barSalesCount: number;
};

export type MarketingCampaignFunnel = {
  targetTotal: number;
  linkedTargetGuests: number;
  contactableGuests: number;
  excludedGuests: number;
  completedContacts: number;
  directCompletedContacts: number;
  respondedContacts: number;
  visitedGuests: number;
  repeatGuests: number;
  revenue: number;
  barRevenue: number;
  contactCompletionRate: number | null;
  responseRate: number | null;
  visitRate: number | null;
  repeatRate: number | null;
  barShare: number | null;
  crmTask: {
    id: string;
    status: string;
    dueAt: string | null;
  } | null;
  responsibleUser: {
    id: string;
    displayName: string;
    email: string;
  } | null;
};

export type MarketingCampaignStoreEffectMetrics = {
  activeGuests: number;
  repeatGuests: number;
  sessionsCount: number;
  playHours: number;
  balanceRevenue: number;
  barRevenue: number;
  totalRevenue: number;
  barSalesCount: number;
};

export type MarketingCampaignStoreEffect = {
  storeId: string | null;
  storeName: string;
  before: MarketingCampaignStoreEffectMetrics;
  after: MarketingCampaignStoreEffectMetrics;
  delta: MarketingCampaignStoreEffectMetrics;
};

export type MarketingCampaignExecutionMetrics = {
  contacts: number;
  directContacts: number;
  respondedContacts: number;
  linkedGuests: number;
  activeGuests: number;
  repeatGuests: number;
  sessionsCount: number;
  playHours: number;
  balanceRevenue: number;
  barRevenue: number;
  totalRevenue: number;
  barSalesCount: number;
};

export type MarketingCampaignExecutionBreakdownRow = {
  key: string;
  label: string;
  hint: string | null;
  metrics: MarketingCampaignExecutionMetrics;
};

export type MarketingCampaignExecutionBreakdown = {
  byResponsible: MarketingCampaignExecutionBreakdownRow[];
  byChannel: MarketingCampaignExecutionBreakdownRow[];
};

export type MarketingCampaignEffect = {
  campaignId: string;
  attributionMode: "CAMPAIGN_OR_GROUP";
  targetTotal: number;
  linkedTargetGuests: number;
  unlinkedTargetMembers: number;
  window: {
    beforeFrom: string;
    beforeTo: string;
    afterFrom: string;
    afterTo: string;
  };
  before: MarketingCampaignEffectPeriod;
  after: MarketingCampaignEffectPeriod;
  delta: Omit<MarketingCampaignEffectPeriod, "from" | "to" | "days">;
  funnel: MarketingCampaignFunnel;
  storeBreakdown: MarketingCampaignStoreEffect[];
  executionBreakdown: MarketingCampaignExecutionBreakdown;
  dataQuality: {
    directContactAttribution: boolean;
    revenueScope: string;
    limitations: string[];
  };
};

export async function getMarketingCampaigns(): Promise<MarketingCampaign[]> {
  const response = await fetch(`${getApiUrl()}/marketing/campaigns`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch marketing campaigns");
  }

  return response.json() as Promise<MarketingCampaign[]>;
}

export async function getMarketingCampaign(
  id: string,
): Promise<MarketingCampaign> {
  const response = await fetch(
    `${getApiUrl()}/marketing/campaigns/${encodeURIComponent(id)}`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch marketing campaign");
  }

  return response.json() as Promise<MarketingCampaign>;
}

export async function getMarketingCampaignEffect(
  id: string,
): Promise<MarketingCampaignEffect> {
  const response = await fetch(
    `${getApiUrl()}/marketing/campaigns/${encodeURIComponent(id)}/effect`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch marketing campaign effect");
  }

  return response.json() as Promise<MarketingCampaignEffect>;
}
