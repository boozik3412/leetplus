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

export type MarketingMechanicConfig = Record<string, unknown>;

export type MarketingPromoBundleStatus = "ACTIVE" | "ARCHIVED";

export type MarketingPromoBundleLaunchStatus =
  | "ACTIVE"
  | "PAUSED"
  | "FINISHED"
  | "CANCELED";

export type MarketingPromoBundleUsageStatus = "CONFIRMED" | "CANCELED";

export type MarketingPromoBundleUsageSource =
  | "MANUAL"
  | "LANGAME"
  | "API_IMPORT"
  | "CASHIER";

export type MarketingMissionStatus =
  | "DRAFT"
  | "ACTIVE"
  | "PAUSED"
  | "FINISHED"
  | "ARCHIVED";

export type MarketingMissionType =
  | "QUIET_HOURS"
  | "SECOND_VISIT"
  | "BAR_PURCHASE"
  | "BIRTHDAY_EVENT"
  | "REFERRAL"
  | "TOURNAMENT"
  | "CUSTOM";

export type MarketingMissionTriggerKind =
  | "VISIT"
  | "REPEAT_VISIT"
  | "PLAY_HOURS"
  | "BAR_PURCHASE"
  | "BALANCE_TOPUP"
  | "EVENT_PARTICIPATION"
  | "REFERRAL"
  | "MANUAL";

export type MarketingMissionRewardType =
  | "BONUS"
  | "BALANCE"
  | "PLAY_TIME"
  | "PROMO_BUNDLE"
  | "MANUAL";

export type MarketingMissionRewardStatus =
  | "PENDING"
  | "APPROVED"
  | "PAID"
  | "CANCELED";

export type MarketingMissionRewardSource =
  | "MANUAL"
  | "LANGAME"
  | "API_IMPORT";

export type MarketingPromoBundleStructure = {
  composition: {
    typeLabel: string;
    firstLabel: string;
    firstItem: string | null;
    secondLabel: string;
    secondItem: string | null;
    extraCondition: string | null;
    summary: string;
  };
  pricing: {
    basePrice: number;
    promoPrice: number;
    discount: number;
    costPerUse: number;
    expectedRevenue: number;
    expectedCost: number;
    margin: number;
    marginPercent: number | null;
  };
  limits: {
    expectedUses: number;
    minSpend: number;
    validityDays: number;
    onePerGuest: boolean;
    requiresApproval: boolean;
    noStacking: boolean;
  };
  conditions: {
    tariffGroupId: string | null;
    tariffPeriodId: string | null;
    tariffTypeId: string | null;
    tariffSummary: string;
  };
  accounting: {
    readiness:
      | "READY"
      | "NEEDS_COMPOSITION"
      | "NEEDS_ECONOMICS"
      | "NEEDS_ACCOUNTING";
    label: string;
    missingFields: string[];
    nextFields: string[];
    firstRef: {
      kind: "PRODUCT" | "SERVICE" | "BONUS" | "MANUAL";
      productId: string | null;
      reference: string | null;
      label: string;
    };
    secondRef: {
      kind: "PRODUCT" | "SERVICE" | "BONUS" | "MANUAL";
      productId: string | null;
      reference: string | null;
      label: string;
    };
    writeOffRule: "ON_REDEEM" | "ON_SALE" | "MANUAL";
    writeOffLabel: string;
    note: string | null;
  };
};

export type MarketingTariffConditionItem = {
  id: string;
  value: string;
  domain: string;
  externalId: string | null;
  name: string | null;
  label: string | null;
  kind: string | null;
  fieldKeys: string[];
  startedAt: string;
  displayName: string;
};

export type MarketingTariffConditions = {
  groups: MarketingTariffConditionItem[];
  periods: MarketingTariffConditionItem[];
  types: MarketingTariffConditionItem[];
  summary: {
    groups: number;
    periods: number;
    types: number;
    latestAt: string | null;
  };
};

export type MarketingCampaignConsentCoverage = {
  targetTotal: number;
  phoneGranted: number;
  phoneDenied: number;
  phoneUnsubscribed: number;
  phoneUnknown: number;
  contactable: number;
  excluded: number;
  requiresPhoneConsent: boolean;
  channelKind: "PHONE" | "MESSAGE" | "CRM" | "IN_CLUB" | "PUBLIC" | "UNKNOWN";
  channelLabel: string;
  requiredConsent: string;
  contactRule: string;
  exclusionReason: string | null;
};

export type MarketingCampaign = {
  id: string;
  goal: MarketingCampaignGoal;
  name: string;
  status: MarketingCampaignStatus;
  channel: string | null;
  mechanic: string | null;
  mechanicConfig: MarketingMechanicConfig | null;
  periodFrom: string | null;
  periodTo: string | null;
  dueAt: string | null;
  budget: number | null;
  note: string | null;
  storeIds: string[];
  createdAt: string;
  updatedAt: string;
  promoBundleId: string | null;
  audience: { id: string; name: string; guestsCount: number } | null;
  promoBundle: {
    id: string;
    name: string;
    status: string;
    bundleType: string;
  } | null;
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

export type MarketingPromoBundle = {
  id: string;
  name: string;
  status: MarketingPromoBundleStatus;
  bundleType: string;
  structure?: MarketingPromoBundleStructure;
  mechanicConfig: MarketingMechanicConfig;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; displayName: string; email: string } | null;
};

export type MarketingPromoBundleLaunch = {
  id: string;
  status: MarketingPromoBundleLaunchStatus;
  audience: {
    id: string;
    name: string;
    description: string | null;
    guestsCount: number;
  } | null;
  storeIds: string[];
  periodFrom: string | null;
  periodTo: string | null;
  maxUses: number | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  promoBundle: {
    id: string;
    name: string;
    status: MarketingPromoBundleStatus;
    bundleType: string;
    structure?: MarketingPromoBundleStructure;
    mechanicConfig: MarketingMechanicConfig;
    note: string | null;
  };
  createdBy: { id: string; displayName: string; email: string } | null;
};

export type MarketingPromoBundleUsage = {
  id: string;
  status: MarketingPromoBundleUsageStatus;
  source: MarketingPromoBundleUsageSource;
  externalProvider: string | null;
  externalDomain: string | null;
  externalId: string | null;
  guestExternalId: string | null;
  receiptExternalId: string | null;
  usedAt: string;
  quantity: number;
  amount: number;
  costAmount: number | null;
  grossProfit: number | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  promoBundle: {
    id: string;
    name: string;
    status: MarketingPromoBundleStatus;
    bundleType: string;
  };
  launch: {
    id: string;
    status: MarketingPromoBundleLaunchStatus;
    audience: { id: string; name: string; guestsCount: number } | null;
    storeIds: string[];
    periodFrom: string | null;
    periodTo: string | null;
    maxUses: number | null;
  } | null;
  store: { id: string; name: string } | null;
  createdBy: { id: string; displayName: string; email: string } | null;
};

export type MarketingPromoBundleUsageImportResult = {
  imported: number;
  updated: number;
  skipped: number;
  errors: Array<{ index: number; message: string }>;
  usages: MarketingPromoBundleUsage[];
};

export type MarketingMissionRewardSummary = {
  total: number;
  pending: number;
  approved: number;
  paid: number;
  canceled: number;
  approvedAmount: number;
  paidAmount: number;
};

export type MarketingMission = {
  id: string;
  name: string;
  status: MarketingMissionStatus;
  missionType: MarketingMissionType;
  triggerKind: MarketingMissionTriggerKind;
  rewardType: MarketingMissionRewardType;
  rewardAmount: number | null;
  rewardLabel: string | null;
  conditions: MarketingMechanicConfig;
  storeIds: string[];
  periodFrom: string | null;
  periodTo: string | null;
  budgetAmount: number | null;
  perGuestLimit: number | null;
  totalRewardLimit: number | null;
  antiFraudRules: MarketingMechanicConfig | null;
  manualApprovalRequired: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  audience: {
    id: string;
    name: string;
    description: string | null;
    guestsCount: number;
  } | null;
  rewardSummary: MarketingMissionRewardSummary;
  createdBy: { id: string; displayName: string; email: string } | null;
};

export type MarketingMissionReward = {
  id: string;
  status: MarketingMissionRewardStatus;
  source: MarketingMissionRewardSource;
  externalProvider: string | null;
  externalDomain: string | null;
  externalId: string | null;
  guestExternalId: string | null;
  qualifiedAt: string;
  rewardAmount: number;
  rewardLabel: string;
  note: string | null;
  evidence: MarketingMechanicConfig | null;
  createdAt: string;
  updatedAt: string;
  mission: {
    id: string;
    name: string;
    status: MarketingMissionStatus;
    missionType: MarketingMissionType;
    rewardType: MarketingMissionRewardType;
    rewardLabel: string | null;
  };
  guest: {
    id: string;
    externalDomain: string | null;
    externalGuestId: string;
    displayName: string;
    phoneMasked: string | null;
    emailMasked: string | null;
  } | null;
  store: { id: string; name: string } | null;
  createdBy: { id: string; displayName: string; email: string } | null;
  approvedBy: { id: string; displayName: string; email: string } | null;
};

export type MarketingPromoBundleReconciliationStatus =
  | "NO_LAUNCH"
  | "NO_PRODUCT_LINK"
  | "NO_SALES"
  | "HAS_FACTS"
  | "MANUAL_REVIEW";

export type MarketingPromoBundleReconciliationProductRef = {
  part: "first" | "second";
  label: string;
  productId: string;
  productName: string | null;
  productArticle: string | null;
};

export type MarketingPromoBundleReconciliationTotals = {
  salesQuantity: number;
  salesCount: number;
  salesRevenue: number;
  salesCost: number;
  grossProfit: number;
  writeOffQuantity: number;
  writeOffAmount: number;
  writeOffCount: number;
  writeOffStoreCount: number;
  lastWriteOffDate: string | null;
  storeCount: number;
  lastSaleDate: string | null;
  expectedUses: number;
  maxUses: number | null;
  usageProgressPercent: number | null;
};

export type MarketingPromoBundleReconciliationLaunch = {
  launchId: string;
  status: MarketingPromoBundleLaunchStatus;
  audience: { id: string; name: string; guestsCount: number } | null;
  storeIds: string[];
  periodFrom: string | null;
  periodTo: string | null;
  maxUses: number | null;
  salesQuantity: number;
  salesCount: number;
  salesRevenue: number;
  salesCost: number;
  grossProfit: number;
  writeOffQuantity: number;
  writeOffAmount: number;
  writeOffCount: number;
  writeOffStoreCount: number;
  lastWriteOffDate: string | null;
  storeCount: number;
  lastSaleDate: string | null;
  usageProgressPercent: number | null;
};

export type MarketingPromoBundleReconciliation = {
  promoBundleId: string;
  status: MarketingPromoBundleReconciliationStatus;
  label: string;
  activeLaunches: number;
  productRefs: MarketingPromoBundleReconciliationProductRef[];
  launches: MarketingPromoBundleReconciliationLaunch[];
  totals: MarketingPromoBundleReconciliationTotals;
  warnings: string[];
  dataQuality: {
    factSource: string;
    limitation: string;
  };
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

export type MarketingCampaignRevenueAttributionPeriod = {
  attributedRevenue: number;
  storeScopedRevenue: number;
  unallocatedFactRevenue: number;
  excludedOnlineTopupRevenue: number;
};

export type MarketingCampaignRevenueAttribution = {
  before: MarketingCampaignRevenueAttributionPeriod;
  after: MarketingCampaignRevenueAttributionPeriod;
  delta: MarketingCampaignRevenueAttributionPeriod;
};

export type MarketingCampaignEconomicsPaybackStatus =
  | "NO_BUDGET"
  | "NO_REVENUE"
  | "LOSS"
  | "PARTIAL"
  | "PAID_OFF";

export type MarketingCampaignEconomics = {
  budget: number | null;
  attributedRevenueAfter: number;
  attributedRevenueDelta: number;
  incrementalRevenue: number;
  incrementalBarRevenue: number;
  incrementalActiveGuests: number;
  incrementalRepeatGuests: number;
  costPerTargetGuest: number | null;
  costPerContact: number | null;
  costPerRespondedContact: number | null;
  costPerVisit: number | null;
  revenuePerBudgetRub: number | null;
  roiPercent: number | null;
  paybackStatus: MarketingCampaignEconomicsPaybackStatus;
  paybackLabel: string;
  recommendation: string;
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

export type MarketingCampaignAudienceBreakdownRow = {
  key: string;
  sourceType: "SAVED_GROUP" | "CAMPAIGN_SCOPE";
  audienceId: string | null;
  label: string;
  hint: string | null;
  ruleLabel: string | null;
  targetTotal: number;
  linkedTargetGuests: number;
  unlinkedTargetMembers: number;
  metrics: MarketingCampaignExecutionMetrics;
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
  revenueAttribution?: MarketingCampaignRevenueAttribution;
  economics?: MarketingCampaignEconomics;
  audienceBreakdown?: MarketingCampaignAudienceBreakdownRow[];
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

export async function getMarketingPromoBundles(): Promise<
  MarketingPromoBundle[]
> {
  const response = await fetch(`${getApiUrl()}/marketing/promo-bundles`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch marketing promo bundles");
  }

  return response.json() as Promise<MarketingPromoBundle[]>;
}

export async function getMarketingTariffConditions(): Promise<MarketingTariffConditions> {
  const response = await fetch(`${getApiUrl()}/marketing/tariff-conditions`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch marketing tariff conditions");
  }

  return response.json() as Promise<MarketingTariffConditions>;
}

export async function getMarketingPromoBundleLaunches(): Promise<
  MarketingPromoBundleLaunch[]
> {
  const response = await fetch(`${getApiUrl()}/marketing/promo-bundle-launches`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch marketing promo bundle launches");
  }

  return response.json() as Promise<MarketingPromoBundleLaunch[]>;
}

export async function getMarketingPromoBundleUsages(): Promise<
  MarketingPromoBundleUsage[]
> {
  const response = await fetch(`${getApiUrl()}/marketing/promo-bundle-usages`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch marketing promo bundle usages");
  }

  return response.json() as Promise<MarketingPromoBundleUsage[]>;
}

export async function getMarketingPromoBundleReconciliation(): Promise<
  MarketingPromoBundleReconciliation[]
> {
  const response = await fetch(
    `${getApiUrl()}/marketing/promo-bundle-reconciliation`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch marketing promo bundle reconciliation");
  }

  return response.json() as Promise<MarketingPromoBundleReconciliation[]>;
}

export async function getMarketingMissions(): Promise<MarketingMission[]> {
  const response = await fetch(`${getApiUrl()}/marketing/missions`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch marketing missions");
  }

  return response.json() as Promise<MarketingMission[]>;
}

export async function getMarketingMissionRewards(): Promise<
  MarketingMissionReward[]
> {
  const response = await fetch(`${getApiUrl()}/marketing/mission-rewards`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch marketing mission rewards");
  }

  return response.json() as Promise<MarketingMissionReward[]>;
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
