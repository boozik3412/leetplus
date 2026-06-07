import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GuestCommunicationConsentStatus,
  IntegrationProvider,
  Prisma,
  StockMovementType,
} from '@prisma/client';
import ExcelJS from 'exceljs';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

const marketingCampaignInclude = {
  audience: {
    select: {
      id: true,
      name: true,
      description: true,
      filters: true,
      guestsCount: true,
    },
  },
  crmTask: { select: { id: true, title: true, status: true, dueAt: true } },
  promoBundle: {
    select: { id: true, name: true, status: true, bundleType: true },
  },
  createdByUser: { select: { id: true, fullName: true, email: true } },
  ownerUser: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.MarketingCampaignInclude;

type MarketingCampaignRow = Prisma.MarketingCampaignGetPayload<{
  include: typeof marketingCampaignInclude;
}>;

const marketingPromoBundleInclude = {
  createdByUser: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.MarketingPromoBundleInclude;

type MarketingPromoBundleRow = Prisma.MarketingPromoBundleGetPayload<{
  include: typeof marketingPromoBundleInclude;
}>;

const marketingPromoBundleLaunchInclude = {
  promoBundle: {
    select: {
      id: true,
      name: true,
      status: true,
      bundleType: true,
      mechanicConfig: true,
      note: true,
    },
  },
  audience: {
    select: { id: true, name: true, description: true, guestsCount: true },
  },
  createdByUser: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.MarketingPromoBundleLaunchInclude;

type MarketingPromoBundleLaunchRow =
  Prisma.MarketingPromoBundleLaunchGetPayload<{
    include: typeof marketingPromoBundleLaunchInclude;
  }>;

const marketingPromoBundleUsageInclude = {
  promoBundle: {
    select: {
      id: true,
      name: true,
      status: true,
      bundleType: true,
    },
  },
  launch: {
    select: {
      id: true,
      status: true,
      storeIds: true,
      periodFrom: true,
      periodTo: true,
      maxUses: true,
      audience: { select: { id: true, name: true, guestsCount: true } },
    },
  },
  store: { select: { id: true, name: true } },
  createdByUser: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.MarketingPromoBundleUsageInclude;

type MarketingPromoBundleUsageRow = Prisma.MarketingPromoBundleUsageGetPayload<{
  include: typeof marketingPromoBundleUsageInclude;
}>;

const marketingTariffConditionEndpointKeys = [
  'tariffsGroups',
  'tariffsTimePeriod',
  'tariffsTypesGroups',
] as const;

type MarketingTariffConditionEndpointKey =
  (typeof marketingTariffConditionEndpointKeys)[number];

type MarketingTariffSnapshotRow = {
  id: string;
  endpointKey: string;
  domain: string;
  externalId: string | null;
  name: string | null;
  label: string | null;
  kind: string | null;
  fieldKeys: Prisma.JsonValue | null;
  startedAt: Date;
};

const marketingMissionInclude = {
  audience: {
    select: { id: true, name: true, description: true, guestsCount: true },
  },
  createdByUser: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.MarketingMissionInclude;

type MarketingMissionRow = Prisma.MarketingMissionGetPayload<{
  include: typeof marketingMissionInclude;
}>;

const marketingMissionRewardInclude = {
  mission: {
    select: {
      id: true,
      name: true,
      status: true,
      missionType: true,
      rewardType: true,
      rewardLabel: true,
    },
  },
  guest: {
    select: {
      id: true,
      externalDomain: true,
      externalGuestId: true,
      fullNameMasked: true,
      phoneMasked: true,
      emailMasked: true,
    },
  },
  store: { select: { id: true, name: true } },
  createdByUser: { select: { id: true, fullName: true, email: true } },
  approvedByUser: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.MarketingMissionRewardInclude;

type MarketingMissionRewardRow = Prisma.MarketingMissionRewardGetPayload<{
  include: typeof marketingMissionRewardInclude;
}>;

type MarketingPromoBundleUsageLaunchMatch = {
  id: string;
  storeIds: string[];
};

type MarketingPromoBundleUsageWriteData = Omit<
  Prisma.MarketingPromoBundleUsageUncheckedCreateInput,
  'id' | 'tenantId' | 'createdByUserId' | 'createdAt' | 'updatedAt'
>;

const marketingPromoBundleReconciliationInclude = {
  launches: {
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    take: 20,
    select: {
      id: true,
      status: true,
      storeIds: true,
      periodFrom: true,
      periodTo: true,
      maxUses: true,
      audience: { select: { id: true, name: true, guestsCount: true } },
      createdAt: true,
      updatedAt: true,
    },
  },
} satisfies Prisma.MarketingPromoBundleInclude;

type MarketingPromoBundleReconciliationRow =
  Prisma.MarketingPromoBundleGetPayload<{
    include: typeof marketingPromoBundleReconciliationInclude;
  }>;

type MarketingPromoBundleReconciliationLaunchRow =
  MarketingPromoBundleReconciliationRow['launches'][number];

const campaignGoals = [
  'RETURN_GUESTS',
  'REPEAT_VISIT',
  'WEAK_HOURS',
  'BAR_GROWTH',
  'EVENT_PROMO',
  'PROMO_BUNDLE',
] as const;

const campaignStatuses = [
  'DRAFT',
  'PLANNED',
  'RUNNING',
  'FINISHED',
  'CANCELED',
] as const;

const promoBundleStatuses = ['ACTIVE', 'ARCHIVED'] as const;

const promoBundleLaunchStatuses = [
  'ACTIVE',
  'PAUSED',
  'FINISHED',
  'CANCELED',
] as const;

const promoBundleUsageStatuses = ['CONFIRMED', 'CANCELED'] as const;

const promoBundleUsageSources = [
  'MANUAL',
  'LANGAME',
  'API_IMPORT',
  'CASHIER',
] as const;

const missionStatuses = [
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'FINISHED',
  'ARCHIVED',
] as const;

const missionTypes = [
  'QUIET_HOURS',
  'SECOND_VISIT',
  'BAR_PURCHASE',
  'BIRTHDAY_EVENT',
  'REFERRAL',
  'TOURNAMENT',
  'CUSTOM',
] as const;

const missionTriggerKinds = [
  'VISIT',
  'REPEAT_VISIT',
  'PLAY_HOURS',
  'BAR_PURCHASE',
  'BALANCE_TOPUP',
  'EVENT_PARTICIPATION',
  'REFERRAL',
  'MANUAL',
] as const;

const missionRewardTypes = [
  'BONUS',
  'BALANCE',
  'PLAY_TIME',
  'PROMO_BUNDLE',
  'MANUAL',
] as const;

const missionRewardStatuses = [
  'PENDING',
  'APPROVED',
  'PAID',
  'CANCELED',
] as const;

const missionRewardSources = ['MANUAL', 'LANGAME', 'API_IMPORT'] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export type MarketingCampaignGoal = (typeof campaignGoals)[number];
export type MarketingCampaignStatus = (typeof campaignStatuses)[number];
export type MarketingPromoBundleStatus = (typeof promoBundleStatuses)[number];
export type MarketingPromoBundleLaunchStatus =
  (typeof promoBundleLaunchStatuses)[number];
export type MarketingPromoBundleUsageStatus =
  (typeof promoBundleUsageStatuses)[number];
export type MarketingPromoBundleUsageSource =
  (typeof promoBundleUsageSources)[number];
export type MarketingMissionStatus = (typeof missionStatuses)[number];
export type MarketingMissionType = (typeof missionTypes)[number];
export type MarketingMissionTriggerKind = (typeof missionTriggerKinds)[number];
export type MarketingMissionRewardType = (typeof missionRewardTypes)[number];
export type MarketingMissionRewardStatus =
  (typeof missionRewardStatuses)[number];
export type MarketingMissionRewardSource =
  (typeof missionRewardSources)[number];

export type MarketingCampaignDto = {
  goal?: string | null;
  name?: string | null;
  audienceId?: string | null;
  promoBundleId?: string | null;
  storeIds?: string[] | null;
  ownerUserId?: string | null;
  status?: string | null;
  channel?: string | null;
  mechanic?: string | null;
  mechanicConfig?: unknown;
  periodFrom?: string | null;
  periodTo?: string | null;
  dueAt?: string | null;
  budget?: string | number | null;
  note?: string | null;
};

export type MarketingCampaignUpdateDto = Partial<MarketingCampaignDto>;

export type MarketingPromoBundleDto = {
  name?: string | null;
  status?: string | null;
  bundleType?: string | null;
  mechanicConfig?: unknown;
  note?: string | null;
};

export type MarketingPromoBundleUpdateDto = Partial<MarketingPromoBundleDto>;

export type MarketingPromoBundleLaunchDto = {
  promoBundleId?: string | null;
  audienceId?: string | null;
  status?: string | null;
  storeIds?: string[] | null;
  periodFrom?: string | null;
  periodTo?: string | null;
  maxUses?: string | number | null;
  note?: string | null;
};

export type MarketingPromoBundleLaunchUpdateDto =
  Partial<MarketingPromoBundleLaunchDto>;

export type MarketingPromoBundleUsageDto = {
  promoBundleId?: string | null;
  launchId?: string | null;
  storeId?: string | null;
  status?: string | null;
  source?: string | null;
  externalProvider?: string | null;
  externalDomain?: string | null;
  externalId?: string | null;
  guestExternalId?: string | null;
  receiptExternalId?: string | null;
  usedAt?: string | null;
  quantity?: string | number | null;
  amount?: string | number | null;
  costAmount?: string | number | null;
  note?: string | null;
  sourcePayload?: unknown;
};

export type MarketingPromoBundleUsageUpdateDto =
  Partial<MarketingPromoBundleUsageDto>;

export type MarketingPromoBundleUsageImportDto = {
  source?: string | null;
  externalProvider?: string | null;
  externalDomain?: string | null;
  items?: MarketingPromoBundleUsageDto[] | null;
};

export type MarketingPromoBundleUsageImportResult = {
  imported: number;
  updated: number;
  skipped: number;
  errors: Array<{ index: number; message: string }>;
  usages: MarketingPromoBundleUsage[];
};

export type MarketingMissionDto = {
  name?: string | null;
  status?: string | null;
  missionType?: string | null;
  triggerKind?: string | null;
  rewardType?: string | null;
  rewardAmount?: string | number | null;
  rewardLabel?: string | null;
  conditions?: unknown;
  audienceId?: string | null;
  storeIds?: string[] | null;
  periodFrom?: string | null;
  periodTo?: string | null;
  budgetAmount?: string | number | null;
  perGuestLimit?: string | number | null;
  totalRewardLimit?: string | number | null;
  antiFraudRules?: unknown;
  manualApprovalRequired?: boolean | null;
  note?: string | null;
};

export type MarketingMissionUpdateDto = Partial<MarketingMissionDto>;

export type MarketingMissionRewardDto = {
  missionId?: string | null;
  guestId?: string | null;
  storeId?: string | null;
  status?: string | null;
  source?: string | null;
  externalProvider?: string | null;
  externalDomain?: string | null;
  externalId?: string | null;
  guestExternalId?: string | null;
  qualifiedAt?: string | null;
  rewardAmount?: string | number | null;
  rewardLabel?: string | null;
  note?: string | null;
  evidence?: unknown;
};

export type MarketingMissionRewardUpdateDto =
  Partial<MarketingMissionRewardDto>;

export type MarketingPromoScenarioDto = MarketingMissionDto;
export type MarketingPromoScenarioUpdateDto = MarketingMissionUpdateDto;
export type MarketingPromoScenarioRewardDto = MarketingMissionRewardDto;
export type MarketingPromoScenarioRewardUpdateDto =
  MarketingMissionRewardUpdateDto;

export type MarketingCampaignExportFormat = 'csv' | 'xlsx';

export type MarketingCampaignExportQuery = {
  format?: string | null;
};

export type MarketingCampaignExportFile = {
  fileName: string;
  contentType: string;
  buffer: Buffer;
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
  channelKind: 'PHONE' | 'MESSAGE' | 'CRM' | 'IN_CLUB' | 'PUBLIC' | 'UNKNOWN';
  channelLabel: string;
  requiredConsent: string;
  contactRule: string;
  exclusionReason: string | null;
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
      | 'READY'
      | 'NEEDS_COMPOSITION'
      | 'NEEDS_ECONOMICS'
      | 'NEEDS_ACCOUNTING';
    label: string;
    missingFields: string[];
    nextFields: string[];
    firstRef: {
      kind: 'PRODUCT' | 'SERVICE' | 'BONUS' | 'MANUAL';
      productId: string | null;
      reference: string | null;
      label: string;
    };
    secondRef: {
      kind: 'PRODUCT' | 'SERVICE' | 'BONUS' | 'MANUAL';
      productId: string | null;
      reference: string | null;
      label: string;
    };
    writeOffRule: 'ON_REDEEM' | 'ON_SALE' | 'MANUAL';
    writeOffLabel: string;
    note: string | null;
  };
};

export type MarketingCampaign = {
  id: string;
  goal: MarketingCampaignGoal;
  name: string;
  status: MarketingCampaignStatus;
  channel: string | null;
  mechanic: string | null;
  mechanicConfig: Prisma.JsonValue | null;
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
  structure: MarketingPromoBundleStructure;
  mechanicConfig: Prisma.JsonValue;
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
    structure: MarketingPromoBundleStructure;
    mechanicConfig: Prisma.JsonValue;
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
  conditions: Prisma.JsonValue;
  storeIds: string[];
  periodFrom: string | null;
  periodTo: string | null;
  budgetAmount: number | null;
  perGuestLimit: number | null;
  totalRewardLimit: number | null;
  antiFraudRules: Prisma.JsonValue | null;
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
  evidence: Prisma.JsonValue | null;
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

export type MarketingPromoScenarioStatus = MarketingMissionStatus;
export type MarketingPromoScenarioType = MarketingMissionType;
export type MarketingPromoScenarioTriggerKind = MarketingMissionTriggerKind;
export type MarketingPromoScenarioRewardType = MarketingMissionRewardType;
export type MarketingPromoScenarioRewardStatus = MarketingMissionRewardStatus;
export type MarketingPromoScenarioRewardSource = MarketingMissionRewardSource;
export type MarketingPromoScenarioRewardSummary = MarketingMissionRewardSummary;
export type MarketingPromoScenario = MarketingMission;
export type MarketingPromoScenarioReward = MarketingMissionReward;

export type MarketingPromoBundleReconciliationStatus =
  | 'NO_LAUNCH'
  | 'NO_PRODUCT_LINK'
  | 'NO_SALES'
  | 'HAS_FACTS'
  | 'MANUAL_REVIEW';

export type MarketingPromoBundleReconciliationProductRef = {
  part: 'first' | 'second';
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
  | 'NO_BUDGET'
  | 'NO_REVENUE'
  | 'LOSS'
  | 'PARTIAL'
  | 'PAID_OFF';

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

export type MarketingCampaignAudienceSourceType =
  | 'SAVED_GROUP'
  | 'CAMPAIGN_SCOPE';

export type MarketingCampaignAudienceBreakdownRow = {
  key: string;
  sourceType: MarketingCampaignAudienceSourceType;
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
  attributionMode: 'CAMPAIGN_OR_GROUP';
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
  delta: Omit<MarketingCampaignEffectPeriod, 'from' | 'to' | 'days'>;
  funnel: MarketingCampaignFunnel;
  revenueAttribution: MarketingCampaignRevenueAttribution;
  economics: MarketingCampaignEconomics;
  audienceBreakdown: MarketingCampaignAudienceBreakdownRow[];
  storeBreakdown: MarketingCampaignStoreEffect[];
  executionBreakdown: MarketingCampaignExecutionBreakdown;
  dataQuality: {
    directContactAttribution: boolean;
    revenueScope: string;
    limitations: string[];
  };
};

type MarketingCampaignExecutionBucket = {
  key: string;
  label: string;
  hint: string | null;
  contacts: number;
  directContacts: number;
  respondedContacts: number;
  linkedGuestIds: Set<string>;
};

type CsvCell = string | number | boolean | null;

type MarketingCampaignExportContactEvent = {
  id: string;
  channel: string;
  result: string | null;
  note: string | null;
  contactedAt: Date;
  marketingCampaignId: string | null;
  audience: { name: string } | null;
  guest: {
    externalDomain: string | null;
    externalGuestId: string;
    fullNameMasked: string | null;
    phoneMasked: string | null;
    emailMasked: string | null;
  } | null;
  lead: {
    fullNameMasked: string | null;
    phoneMasked: string | null;
    emailMasked: string | null;
    matchedGuestId: string | null;
  } | null;
  createdByUser: { fullName: string | null; email: string } | null;
};

@Injectable()
export class MarketingService {
  constructor(private readonly prisma: PrismaService) {}

  async getTariffConditions(
    user: AuthenticatedUser,
  ): Promise<MarketingTariffConditions> {
    const rows = await this.prisma.langameTariffSnapshotItem.findMany({
      where: {
        tenantId: user.tenantId,
        provider: IntegrationProvider.LANGAME,
        endpointKey: { in: [...marketingTariffConditionEndpointKeys] },
      },
      select: {
        id: true,
        endpointKey: true,
        domain: true,
        externalId: true,
        name: true,
        label: true,
        kind: true,
        fieldKeys: true,
        startedAt: true,
      },
      orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
      take: 600,
    });
    const groups = marketingTariffConditionItems(rows, 'tariffsGroups');
    const periods = marketingTariffConditionItems(rows, 'tariffsTimePeriod');
    const types = marketingTariffConditionItems(rows, 'tariffsTypesGroups');
    const latestAt =
      rows
        .map((row) => row.startedAt)
        .sort((a, b) => b.getTime() - a.getTime())[0]
        ?.toISOString() ?? null;

    return {
      groups,
      periods,
      types,
      summary: {
        groups: groups.length,
        periods: periods.length,
        types: types.length,
        latestAt,
      },
    };
  }

  async getCampaigns(user: AuthenticatedUser): Promise<MarketingCampaign[]> {
    const rows = await this.prisma.marketingCampaign.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 100,
      include: marketingCampaignInclude,
    });

    const coverageByCampaign = await this.getConsentCoverageByCampaign(
      user.tenantId,
      rows,
    );

    return rows.map((row) =>
      this.toMarketingCampaign(row, coverageByCampaign.get(row.id)),
    );
  }

  async getPromoBundles(
    user: AuthenticatedUser,
  ): Promise<MarketingPromoBundle[]> {
    const rows = await this.prisma.marketingPromoBundle.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 100,
      include: marketingPromoBundleInclude,
    });

    return rows.map((row) => this.toMarketingPromoBundle(row));
  }

  async getPromoBundleLaunches(
    user: AuthenticatedUser,
  ): Promise<MarketingPromoBundleLaunch[]> {
    const rows = await this.prisma.marketingPromoBundleLaunch.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 100,
      include: marketingPromoBundleLaunchInclude,
    });

    return rows.map((row) => this.toMarketingPromoBundleLaunch(row));
  }

  async getPromoBundleUsages(
    user: AuthenticatedUser,
  ): Promise<MarketingPromoBundleUsage[]> {
    const rows = await this.prisma.marketingPromoBundleUsage.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ usedAt: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      include: marketingPromoBundleUsageInclude,
    });

    return rows.map((row) => this.toMarketingPromoBundleUsage(row));
  }

  async getPromoBundleReconciliation(
    user: AuthenticatedUser,
  ): Promise<MarketingPromoBundleReconciliation[]> {
    const rows = await this.prisma.marketingPromoBundle.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 100,
      include: marketingPromoBundleReconciliationInclude,
    });
    const structuresByBundleId = new Map(
      rows.map((row) => [
        row.id,
        buildPromoBundleStructure(row.bundleType, row.mechanicConfig),
      ]),
    );
    const productIds = [
      ...new Set(
        rows.flatMap((row) =>
          this.promoBundleProductRefs(
            structuresByBundleId.get(row.id) ??
              buildPromoBundleStructure(row.bundleType, row.mechanicConfig),
          ).map((ref) => ref.productId),
        ),
      ),
    ];
    const products =
      productIds.length > 0
        ? await this.prisma.product.findMany({
            where: { tenantId: user.tenantId, id: { in: productIds } },
            select: { id: true, name: true, article: true },
          })
        : [];
    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );

    return Promise.all(
      rows.map((row) =>
        this.buildPromoBundleReconciliationRow({
          tenantId: user.tenantId,
          row,
          structure:
            structuresByBundleId.get(row.id) ??
            buildPromoBundleStructure(row.bundleType, row.mechanicConfig),
          productsById,
        }),
      ),
    );
  }

  async getMissions(user: AuthenticatedUser): Promise<MarketingMission[]> {
    const rows = await this.prisma.marketingMission.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 100,
      include: marketingMissionInclude,
    });
    const summaries = await this.getMissionRewardSummaries(
      user.tenantId,
      rows.map((row) => row.id),
    );

    return rows.map((row) =>
      this.toMarketingMission(row, summaries.get(row.id)),
    );
  }

  async getMissionRewards(
    user: AuthenticatedUser,
  ): Promise<MarketingMissionReward[]> {
    const rows = await this.prisma.marketingMissionReward.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ qualifiedAt: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      include: marketingMissionRewardInclude,
    });

    return rows.map((row) => this.toMarketingMissionReward(row));
  }

  async getCampaign(
    user: AuthenticatedUser,
    id: string,
  ): Promise<MarketingCampaign> {
    const row = await this.prisma.marketingCampaign.findFirst({
      where: { id, tenantId: user.tenantId },
      include: marketingCampaignInclude,
    });

    if (!row) {
      throw new NotFoundException('Marketing campaign not found');
    }

    const coverage = await this.getCampaignConsentCoverage(
      user.tenantId,
      row.audienceId,
      row.channel,
    );

    return this.toMarketingCampaign(row, coverage);
  }

  async getCampaignEffect(
    user: AuthenticatedUser,
    id: string,
  ): Promise<MarketingCampaignEffect> {
    const campaign = await this.prisma.marketingCampaign.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        audience: {
          select: {
            id: true,
            name: true,
            description: true,
            filters: true,
            guestsCount: true,
          },
        },
        crmTask: { select: { id: true, status: true, dueAt: true } },
        ownerUser: { select: { id: true, fullName: true, email: true } },
      },
    });

    if (!campaign) {
      throw new NotFoundException('Marketing campaign not found');
    }

    const storeIds = parseStringArray(campaign.storeIds);
    const { afterFrom, afterTo, beforeFrom, beforeTo } =
      this.resolveEffectWindow(campaign);
    const members = campaign.audienceId
      ? await this.prisma.guestAudienceMember.findMany({
          where: { tenantId: user.tenantId, audienceId: campaign.audienceId },
          select: { guestId: true },
        })
      : [];
    const guestIds = [
      ...new Set(
        members
          .map((member) => member.guestId)
          .filter((guestId): guestId is string => Boolean(guestId)),
      ),
    ];

    const [
      before,
      after,
      storeBreakdown,
      executionBreakdown,
      beforeExcludedOnlineTopupRevenue,
      afterExcludedOnlineTopupRevenue,
    ] = await Promise.all([
      this.buildCampaignEffectPeriod({
        tenantId: user.tenantId,
        campaignId: campaign.id,
        audienceId: campaign.audienceId,
        guestIds,
        storeIds,
        from: beforeFrom,
        to: beforeTo,
      }),
      this.buildCampaignEffectPeriod({
        tenantId: user.tenantId,
        campaignId: campaign.id,
        audienceId: campaign.audienceId,
        guestIds,
        storeIds,
        from: afterFrom,
        to: afterTo,
      }),
      this.buildCampaignStoreBreakdown({
        tenantId: user.tenantId,
        guestIds,
        storeIds,
        beforeFrom,
        beforeTo,
        afterFrom,
        afterTo,
      }),
      this.buildCampaignExecutionBreakdown({
        tenantId: user.tenantId,
        campaignId: campaign.id,
        audienceId: campaign.audienceId,
        guestIds,
        storeIds,
        from: afterFrom,
        to: afterTo,
      }),
      this.buildUnallocatedOnlineTopupRevenue({
        tenantId: user.tenantId,
        from: beforeFrom,
        to: beforeTo,
      }),
      this.buildUnallocatedOnlineTopupRevenue({
        tenantId: user.tenantId,
        from: afterFrom,
        to: afterTo,
      }),
    ]);

    const linkedTargetGuests = guestIds.length;
    const targetTotal = campaign.audience?.guestsCount ?? members.length;
    const directContactAttribution = after.directContacts > 0;
    const coverage = await this.getCampaignConsentCoverage(
      user.tenantId,
      campaign.audienceId,
      campaign.channel,
    );
    const completedContacts = after.contacts;
    const respondedContacts = after.respondedContacts;
    const visitedGuests = after.activeGuests;
    const revenueAttribution = this.buildCampaignRevenueAttribution({
      before,
      after,
      storeBreakdown,
      beforeExcludedOnlineTopupRevenue,
      afterExcludedOnlineTopupRevenue,
    });
    const audienceBreakdown = this.buildCampaignAudienceBreakdown({
      campaign,
      targetTotal,
      guestIds,
      after,
    });
    const delta = {
      contacts: this.round(after.contacts - before.contacts, 2),
      directContacts: this.round(
        after.directContacts - before.directContacts,
        2,
      ),
      respondedContacts: this.round(
        after.respondedContacts - before.respondedContacts,
        2,
      ),
      activeGuests: this.round(after.activeGuests - before.activeGuests, 2),
      repeatGuests: this.round(after.repeatGuests - before.repeatGuests, 2),
      sessionsCount: this.round(after.sessionsCount - before.sessionsCount, 2),
      playHours: this.round(after.playHours - before.playHours, 2),
      balanceRevenue: this.round(
        after.balanceRevenue - before.balanceRevenue,
        2,
      ),
      barRevenue: this.round(after.barRevenue - before.barRevenue, 2),
      totalRevenue: this.round(after.totalRevenue - before.totalRevenue, 2),
      barSalesCount: this.round(after.barSalesCount - before.barSalesCount, 2),
    };
    const economics = this.buildCampaignEconomics({
      budget: campaign.budget ? Number(campaign.budget) : null,
      targetTotal,
      completedContacts,
      respondedContacts,
      visitedGuests,
      revenueAttribution,
      delta,
    });

    return {
      campaignId: campaign.id,
      attributionMode: 'CAMPAIGN_OR_GROUP',
      targetTotal,
      linkedTargetGuests,
      unlinkedTargetMembers: Math.max(0, targetTotal - linkedTargetGuests),
      window: {
        beforeFrom: beforeFrom.toISOString(),
        beforeTo: beforeTo.toISOString(),
        afterFrom: afterFrom.toISOString(),
        afterTo: afterTo.toISOString(),
      },
      before,
      after,
      delta,
      funnel: {
        targetTotal,
        linkedTargetGuests,
        contactableGuests: coverage.contactable,
        excludedGuests: coverage.excluded,
        completedContacts,
        directCompletedContacts: after.directContacts,
        respondedContacts,
        visitedGuests,
        repeatGuests: after.repeatGuests,
        revenue: after.totalRevenue,
        barRevenue: after.barRevenue,
        contactCompletionRate: this.ratio(
          completedContacts,
          coverage.contactable,
        ),
        responseRate: this.ratio(respondedContacts, completedContacts),
        visitRate: this.ratio(
          visitedGuests,
          respondedContacts || completedContacts,
        ),
        repeatRate: this.ratio(after.repeatGuests, visitedGuests),
        barShare: this.ratio(after.barRevenue, after.totalRevenue),
        crmTask: campaign.crmTask
          ? {
              id: campaign.crmTask.id,
              status: campaign.crmTask.status,
              dueAt: campaign.crmTask.dueAt?.toISOString() ?? null,
            }
          : null,
        responsibleUser: campaign.ownerUser
          ? {
              id: campaign.ownerUser.id,
              displayName:
                campaign.ownerUser.fullName || campaign.ownerUser.email,
              email: campaign.ownerUser.email,
            }
          : null,
      },
      revenueAttribution,
      economics,
      audienceBreakdown,
      storeBreakdown,
      executionBreakdown,
      dataQuality: {
        directContactAttribution,
        revenueScope:
          'Target guest facts only: store-scoped balance spend and linked product/bar sales are separated from unallocated facts and online top-ups.',
        limitations: [
          directContactAttribution
            ? 'Contacts with campaign id are counted directly; older contacts may still be matched by group.'
            : 'No direct campaign contact events yet, so contacts are matched by campaign group.',
          `Unallocated online balance top-ups are excluded from campaign revenue: before ${beforeExcludedOnlineTopupRevenue} руб, after ${afterExcludedOnlineTopupRevenue} руб.`,
          'Guests without linked guestId in the saved group are visible in coverage but excluded from behavioral effect calculations.',
        ],
      },
    };
  }

  async exportCampaignResults(
    user: AuthenticatedUser,
    id: string,
    query: MarketingCampaignExportQuery = {},
  ): Promise<MarketingCampaignExportFile> {
    const format = this.resolveExportFormat(query.format);
    const [campaign, effect] = await Promise.all([
      this.getCampaign(user, id),
      this.getCampaignEffect(user, id),
    ]);
    const events = await this.getCampaignContactEventsForExport(
      user.tenantId,
      campaign.id,
      campaign.audience?.id ?? null,
    );
    const rows = this.buildCampaignExportRows(campaign, effect, events);
    const fileName = `leetplus-campaign-${campaign.id}.${format}`;

    if (format === 'xlsx') {
      return {
        fileName,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: await this.buildCampaignExportXlsx(rows),
      };
    }

    return {
      fileName,
      contentType: 'text/csv; charset=utf-8',
      buffer: Buffer.from(this.toCsv(rows), 'utf8'),
    };
  }

  private buildCampaignExportRows(
    campaign: MarketingCampaign,
    effect: MarketingCampaignEffect,
    events: MarketingCampaignExportContactEvent[],
  ): CsvCell[][] {
    return [
      ['Раздел', 'Показатель', 'Значение', 'Комментарий'],
      ['Кампания', 'Название', campaign.name, null],
      ['Кампания', 'Цель', campaign.goal, null],
      ['Кампания', 'Статус', campaign.status, null],
      ['Кампания', 'Группа', campaign.audience?.name ?? null, null],
      ['Кампания', 'Канал', campaign.channel, null],
      ['Кампания', 'Механика', campaign.mechanic, null],
      ['Кампания', 'Ответственный', campaign.owner?.displayName ?? null, null],
      [
        'Кампания',
        'Период с',
        this.formatExportDate(campaign.periodFrom),
        null,
      ],
      ['Кампания', 'Период по', this.formatExportDate(campaign.periodTo), null],
      ['Кампания', 'Бюджет, руб', campaign.budget, null],
      [],
      ['Воронка', 'Шаг', 'Значение', 'Конверсия'],
      [
        'Воронка',
        'Группа',
        effect.funnel.targetTotal,
        this.formatExportPercent(100),
      ],
      [
        'Воронка',
        'Доступно для контакта',
        effect.funnel.contactableGuests,
        this.formatExportPercent(
          this.ratio(
            effect.funnel.contactableGuests,
            effect.funnel.targetTotal,
          ),
        ),
      ],
      [
        'Воронка',
        'Контакты выполнены',
        effect.funnel.completedContacts,
        this.formatExportPercent(effect.funnel.contactCompletionRate),
      ],
      [
        'Воронка',
        'Есть результат',
        effect.funnel.respondedContacts,
        this.formatExportPercent(effect.funnel.responseRate),
      ],
      [
        'Воронка',
        'Посетили',
        effect.funnel.visitedGuests,
        this.formatExportPercent(effect.funnel.visitRate),
      ],
      [
        'Воронка',
        'Повторные',
        effect.funnel.repeatGuests,
        this.formatExportPercent(effect.funnel.repeatRate),
      ],
      ['Воронка', 'Выручка, руб', effect.funnel.revenue, null],
      ['Воронка', 'Бар, руб', effect.funnel.barRevenue, null],
      [],
      ['Атрибуция выручки', 'Показатель', 'До', 'После', 'Дельта'],
      [
        'Атрибуция выручки',
        'В эффекте кампании, руб',
        effect.revenueAttribution.before.attributedRevenue,
        effect.revenueAttribution.after.attributedRevenue,
        effect.revenueAttribution.delta.attributedRevenue,
      ],
      [
        'Атрибуция выручки',
        'По клубам, руб',
        effect.revenueAttribution.before.storeScopedRevenue,
        effect.revenueAttribution.after.storeScopedRevenue,
        effect.revenueAttribution.delta.storeScopedRevenue,
      ],
      [
        'Атрибуция выручки',
        'Факты без клуба, руб',
        effect.revenueAttribution.before.unallocatedFactRevenue,
        effect.revenueAttribution.after.unallocatedFactRevenue,
        effect.revenueAttribution.delta.unallocatedFactRevenue,
      ],
      [
        'Атрибуция выручки',
        'Исключенные онлайн-пополнения, руб',
        effect.revenueAttribution.before.excludedOnlineTopupRevenue,
        effect.revenueAttribution.after.excludedOnlineTopupRevenue,
        effect.revenueAttribution.delta.excludedOnlineTopupRevenue,
      ],
      [],
      ['Экономика кампании', 'Показатель', 'Значение', 'Комментарий'],
      [
        'Экономика кампании',
        'Бюджет, руб',
        effect.economics.budget,
        'Из карточки кампании',
      ],
      [
        'Экономика кампании',
        'Прирост атрибутированной выручки, руб',
        effect.economics.attributedRevenueDelta,
        'После минус до, только факты целевой группы',
      ],
      [
        'Экономика кампании',
        'ROI, %',
        effect.economics.roiPercent,
        effect.economics.paybackLabel,
      ],
      [
        'Экономика кампании',
        'Выручка на 1 руб бюджета',
        effect.economics.revenuePerBudgetRub,
        null,
      ],
      [
        'Экономика кампании',
        'Стоимость контакта, руб',
        effect.economics.costPerContact,
        null,
      ],
      [
        'Экономика кампании',
        'Стоимость визита, руб',
        effect.economics.costPerVisit,
        null,
      ],
      [
        'Экономика кампании',
        'Прирост визитов',
        effect.economics.incrementalActiveGuests,
        'Активные гости после минус до',
      ],
      [
        'Экономика кампании',
        'Рекомендация',
        effect.economics.recommendation,
        null,
      ],
      [],
      [
        'Источники группы',
        'Источник',
        'Правило',
        'Гостей в группе',
        'Связано',
        'Без связки',
        'Контакты',
        'Посетили',
        'Повторные',
        'Выручка, руб',
        'Бар, руб',
      ],
      ...effect.audienceBreakdown.map((row) => [
        'Источники группы',
        row.label,
        row.ruleLabel ?? row.hint,
        row.targetTotal,
        row.linkedTargetGuests,
        row.unlinkedTargetMembers,
        row.metrics.contacts,
        row.metrics.activeGuests,
        row.metrics.repeatGuests,
        row.metrics.totalRevenue,
        row.metrics.barRevenue,
      ]),
      [],
      [
        'Периоды',
        'Период',
        'Контакты',
        'Гости',
        'Повторные',
        'Сессии',
        'Часы',
        'Выручка, руб',
        'Бар, руб',
      ],
      this.effectPeriodCsvRow('До кампании', effect.before),
      this.effectPeriodCsvRow('После кампании', effect.after),
      [
        'Периоды',
        'Дельта',
        effect.delta.contacts,
        effect.delta.activeGuests,
        effect.delta.repeatGuests,
        effect.delta.sessionsCount,
        effect.delta.playHours,
        effect.delta.totalRevenue,
        effect.delta.barRevenue,
      ],
      [],
      [
        'Клубы',
        'Клуб',
        'Выручка после, руб',
        'Бар после, руб',
        'Гости после',
        'Повторные после',
        'Часы после',
        'Дельта выручки, руб',
      ],
      ...effect.storeBreakdown.map((row) => [
        'Клубы',
        row.storeName,
        row.after.totalRevenue,
        row.after.barRevenue,
        row.after.activeGuests,
        row.after.repeatGuests,
        row.after.playHours,
        row.delta.totalRevenue,
      ]),
      [],
      [
        'Ответственные',
        'Ответственный',
        'Контакты',
        'С результатом',
        'Связанные гости',
        'Посетили',
        'Повторные',
        'Выручка, руб',
        'Бар, руб',
      ],
      ...effect.executionBreakdown.byResponsible.map((row) =>
        this.executionCsvRow('Ответственные', row),
      ),
      [],
      [
        'Каналы',
        'Канал',
        'Контакты',
        'С результатом',
        'Связанные гости',
        'Посетили',
        'Повторные',
        'Выручка, руб',
        'Бар, руб',
      ],
      ...effect.executionBreakdown.byChannel.map((row) =>
        this.executionCsvRow('Каналы', row),
      ),
      [],
      [
        'Контакты',
        'Дата контакта',
        'Канал',
        'Результат',
        'Ответственный',
        'Гость',
        'CRM-лид',
        'Группа',
        'Прямо в кампанию',
        'В окне эффекта',
        'Заметка',
      ],
      ...events.map((event) => [
        'Контакты',
        this.formatExportDateTime(event.contactedAt),
        event.channel,
        event.result,
        event.createdByUser?.fullName ?? event.createdByUser?.email ?? null,
        this.guestExportLabel(event.guest),
        this.leadExportLabel(event.lead),
        event.audience?.name ?? null,
        event.marketingCampaignId === campaign.id ? 'да' : 'нет',
        this.isWithinEffectWindow(
          event.contactedAt,
          effect.window.afterFrom,
          effect.window.afterTo,
        )
          ? 'да'
          : 'нет',
        event.note,
      ]),
    ];
  }

  async createCampaign(
    user: AuthenticatedUser,
    dto: MarketingCampaignDto = {},
  ): Promise<MarketingCampaign> {
    const goal = resolveGoal(dto.goal);
    const audienceId = await this.resolveAudienceId(user, dto.audienceId);
    const promoBundleId = await this.resolvePromoBundleId(
      user,
      dto.promoBundleId,
    );
    const storeIds = await this.resolveStoreIds(user, dto.storeIds);
    const ownerUserId = await this.resolveOwnerUserId(user, dto.ownerUserId);
    const status = resolveStatus(dto.status ?? 'DRAFT');
    const name =
      normalizeText(dto.name, 140) ??
      this.defaultCampaignName(goal, audienceId ? 'группы' : null);

    const row = await this.prisma.marketingCampaign.create({
      data: {
        tenantId: user.tenantId,
        createdByUserId: user.id,
        audienceId,
        promoBundleId,
        storeIds: storeIds.length > 0 ? storeIds : Prisma.JsonNull,
        ownerUserId,
        goal,
        name,
        status,
        channel: normalizeText(dto.channel, 80),
        mechanic: normalizeText(dto.mechanic, 80),
        mechanicConfig: normalizeMechanicConfig(dto.mechanicConfig),
        periodFrom: parseOptionalDate(dto.periodFrom),
        periodTo: parseOptionalDate(dto.periodTo),
        dueAt: parseOptionalDate(dto.dueAt),
        budget: parseOptionalBudget(dto.budget),
        note: normalizeText(dto.note, 2000),
      },
      include: marketingCampaignInclude,
    });

    const coverage = await this.getCampaignConsentCoverage(
      user.tenantId,
      row.audienceId,
      row.channel,
    );

    return this.toMarketingCampaign(row, coverage);
  }

  async createPromoBundle(
    user: AuthenticatedUser,
    dto: MarketingPromoBundleDto = {},
  ): Promise<MarketingPromoBundle> {
    const mechanicConfig = normalizePromoBundleConfig(dto.mechanicConfig);
    const bundleType =
      normalizeText(dto.bundleType, 80) ??
      getStringField(mechanicConfig, 'bundleType') ??
      'custom';
    const name =
      normalizeText(dto.name, 140) ??
      `Комбо-набор: ${promoBundleTypeLabel(bundleType)}`;

    const row = await this.prisma.marketingPromoBundle.create({
      data: {
        tenantId: user.tenantId,
        createdByUserId: user.id,
        name,
        status: resolvePromoBundleStatus(dto.status ?? 'ACTIVE'),
        bundleType,
        mechanicConfig,
        note: normalizeText(dto.note, 2000),
      },
      include: marketingPromoBundleInclude,
    });

    return this.toMarketingPromoBundle(row);
  }

  async updatePromoBundle(
    user: AuthenticatedUser,
    id: string,
    dto: MarketingPromoBundleUpdateDto = {},
  ): Promise<MarketingPromoBundle> {
    const existing = await this.prisma.marketingPromoBundle.findFirst({
      where: { id, tenantId: user.tenantId },
      select: {
        id: true,
        name: true,
        bundleType: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Promo bundle not found');
    }

    const data: Prisma.MarketingPromoBundleUpdateInput = {};
    const mechanicConfig = hasOwn(dto, 'mechanicConfig')
      ? normalizePromoBundleConfig(dto.mechanicConfig)
      : null;

    if (hasOwn(dto, 'name')) {
      data.name = normalizeText(dto.name, 140) ?? existing.name;
    }

    if (hasOwn(dto, 'status')) {
      data.status = resolvePromoBundleStatus(dto.status);
    }

    if (hasOwn(dto, 'bundleType')) {
      data.bundleType =
        normalizeText(dto.bundleType, 80) ??
        (mechanicConfig
          ? getStringField(mechanicConfig, 'bundleType')
          : null) ??
        existing.bundleType;
    } else if (mechanicConfig) {
      data.bundleType =
        getStringField(mechanicConfig, 'bundleType') ?? existing.bundleType;
    }

    if (mechanicConfig) {
      data.mechanicConfig = mechanicConfig;
    }

    if (hasOwn(dto, 'note')) {
      data.note = normalizeText(dto.note, 2000);
    }

    const row = await this.prisma.marketingPromoBundle.update({
      where: { id },
      data,
      include: marketingPromoBundleInclude,
    });

    return this.toMarketingPromoBundle(row);
  }

  async createPromoBundleLaunch(
    user: AuthenticatedUser,
    dto: MarketingPromoBundleLaunchDto = {},
  ): Promise<MarketingPromoBundleLaunch> {
    const promoBundleId = await this.resolvePromoBundleId(
      user,
      dto.promoBundleId,
    );

    if (!promoBundleId) {
      throw new BadRequestException('Promo bundle is required');
    }

    const storeIds = await this.resolveStoreIds(user, dto.storeIds);
    const audienceId = await this.resolveAudienceId(user, dto.audienceId);
    const periodFrom = parseOptionalDate(dto.periodFrom);
    const periodTo = parseOptionalDate(dto.periodTo);
    validateDateRange(periodFrom, periodTo);

    const row = await this.prisma.marketingPromoBundleLaunch.create({
      data: {
        tenantId: user.tenantId,
        createdByUserId: user.id,
        promoBundleId,
        audienceId,
        status: resolvePromoBundleLaunchStatus(dto.status ?? 'ACTIVE'),
        storeIds: storeIds.length > 0 ? storeIds : Prisma.JsonNull,
        periodFrom,
        periodTo,
        maxUses: parseOptionalPositiveInt(dto.maxUses, 'Max uses'),
        note: normalizeText(dto.note, 2000),
      },
      include: marketingPromoBundleLaunchInclude,
    });

    return this.toMarketingPromoBundleLaunch(row);
  }

  async updatePromoBundleLaunch(
    user: AuthenticatedUser,
    id: string,
    dto: MarketingPromoBundleLaunchUpdateDto = {},
  ): Promise<MarketingPromoBundleLaunch> {
    const existing = await this.prisma.marketingPromoBundleLaunch.findFirst({
      where: { id, tenantId: user.tenantId },
      select: {
        id: true,
        periodFrom: true,
        periodTo: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Promo bundle launch not found');
    }

    const data: Prisma.MarketingPromoBundleLaunchUpdateInput = {};
    let periodFrom = existing.periodFrom;
    let periodTo = existing.periodTo;

    if (hasOwn(dto, 'promoBundleId')) {
      const promoBundleId = await this.resolvePromoBundleId(
        user,
        dto.promoBundleId,
      );

      if (!promoBundleId) {
        throw new BadRequestException('Promo bundle is required');
      }

      data.promoBundle = { connect: { id: promoBundleId } };
    }

    if (hasOwn(dto, 'status')) {
      data.status = resolvePromoBundleLaunchStatus(dto.status);
    }

    if (hasOwn(dto, 'storeIds')) {
      const storeIds = await this.resolveStoreIds(user, dto.storeIds);
      data.storeIds = storeIds.length > 0 ? storeIds : Prisma.JsonNull;
    }

    if (hasOwn(dto, 'audienceId')) {
      data.audience = await this.resolvePromoBundleLaunchAudienceRelation(
        user,
        dto.audienceId,
      );
    }

    if (hasOwn(dto, 'periodFrom')) {
      periodFrom = parseOptionalDate(dto.periodFrom);
      data.periodFrom = periodFrom;
    }

    if (hasOwn(dto, 'periodTo')) {
      periodTo = parseOptionalDate(dto.periodTo);
      data.periodTo = periodTo;
    }

    validateDateRange(periodFrom, periodTo);

    if (hasOwn(dto, 'maxUses')) {
      data.maxUses = parseOptionalPositiveInt(dto.maxUses, 'Max uses');
    }

    if (hasOwn(dto, 'note')) {
      data.note = normalizeText(dto.note, 2000);
    }

    const row = await this.prisma.marketingPromoBundleLaunch.update({
      where: { id },
      data,
      include: marketingPromoBundleLaunchInclude,
    });

    return this.toMarketingPromoBundleLaunch(row);
  }

  async createPromoBundleUsage(
    user: AuthenticatedUser,
    dto: MarketingPromoBundleUsageDto = {},
  ): Promise<MarketingPromoBundleUsage> {
    const row = await this.createPromoBundleUsageRow(user, dto);

    return this.toMarketingPromoBundleUsage(row);
  }

  async importPromoBundleUsages(
    user: AuthenticatedUser,
    dto: MarketingPromoBundleUsageImportDto = {},
  ): Promise<MarketingPromoBundleUsageImportResult> {
    const items = Array.isArray(dto.items) ? dto.items : [];

    if (items.length === 0) {
      throw new BadRequestException('Usage import items are required');
    }

    if (items.length > 500) {
      throw new BadRequestException('Usage import accepts up to 500 items');
    }

    const usages: MarketingPromoBundleUsage[] = [];
    const errors: Array<{ index: number; message: string }> = [];
    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const [index, item] of items.entries()) {
      const source = resolvePromoBundleUsageSource(
        item.source ?? dto.source ?? 'API_IMPORT',
        'API_IMPORT',
      );
      const externalProvider = resolveIntegrationProvider(
        item.externalProvider ?? dto.externalProvider,
      );
      const externalDomain = normalizeText(
        item.externalDomain ?? dto.externalDomain,
        160,
      );
      const externalId = normalizeText(item.externalId, 160);

      if (!externalId) {
        skipped += 1;
        errors.push({ index, message: 'externalId is required' });
        continue;
      }

      const usageDto: MarketingPromoBundleUsageDto = {
        ...item,
        source,
        externalProvider,
        externalDomain,
        externalId,
      };

      try {
        const existing = await this.prisma.marketingPromoBundleUsage.findFirst({
          where: {
            tenantId: user.tenantId,
            source,
            externalProvider,
            externalDomain,
            externalId,
          },
          select: { id: true },
        });

        const row = existing
          ? await this.updatePromoBundleUsageRow(user, existing.id, usageDto)
          : await this.createPromoBundleUsageRow(user, usageDto);

        usages.push(this.toMarketingPromoBundleUsage(row));

        if (existing) {
          updated += 1;
        } else {
          imported += 1;
        }
      } catch (error) {
        skipped += 1;
        errors.push({
          index,
          message: error instanceof Error ? error.message : 'Import failed',
        });
      }
    }

    return { imported, updated, skipped, errors, usages };
  }

  async updatePromoBundleUsage(
    user: AuthenticatedUser,
    id: string,
    dto: MarketingPromoBundleUsageUpdateDto = {},
  ): Promise<MarketingPromoBundleUsage> {
    const existing = await this.prisma.marketingPromoBundleUsage.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Promo bundle usage not found');
    }

    const data: Prisma.MarketingPromoBundleUsageUpdateInput = {};

    if (hasOwn(dto, 'status')) {
      data.status = resolvePromoBundleUsageStatus(dto.status);
    }

    if (hasOwn(dto, 'note')) {
      data.note = normalizeText(dto.note, 2000);
    }

    const row = await this.prisma.marketingPromoBundleUsage.update({
      where: { id },
      data,
      include: marketingPromoBundleUsageInclude,
    });

    return this.toMarketingPromoBundleUsage(row);
  }

  async createMission(
    user: AuthenticatedUser,
    dto: MarketingMissionDto = {},
  ): Promise<MarketingMission> {
    const missionType = resolveMissionType(dto.missionType);
    const triggerKind = resolveMissionTriggerKind(
      dto.triggerKind ?? defaultMissionTriggerKind(missionType),
    );
    const rewardType = resolveMissionRewardType(dto.rewardType);
    const rewardAmount = parseOptionalBudget(dto.rewardAmount);
    const storeIds = await this.resolveStoreIds(user, dto.storeIds);
    const audienceId = await this.resolveAudienceId(user, dto.audienceId);
    const periodFrom = parseOptionalDate(dto.periodFrom);
    const periodTo = parseOptionalDate(dto.periodTo);
    validateDateRange(periodFrom, periodTo);

    const row = await this.prisma.marketingMission.create({
      data: {
        tenantId: user.tenantId,
        createdByUserId: user.id,
        audienceId,
        name:
          normalizeText(dto.name, 140) ??
          defaultMissionName(missionType, rewardType),
        status: resolveMissionStatus(dto.status ?? 'DRAFT'),
        missionType,
        triggerKind,
        rewardType,
        rewardAmount,
        rewardLabel:
          normalizeText(dto.rewardLabel, 160) ??
          defaultMissionRewardLabel(rewardType, rewardAmount),
        conditions: normalizeMissionConfig(
          dto.conditions,
          defaultMissionConditions(missionType, triggerKind),
          'Mission conditions',
        ),
        storeIds: storeIds.length > 0 ? storeIds : Prisma.JsonNull,
        periodFrom,
        periodTo,
        budgetAmount: parseOptionalBudget(dto.budgetAmount),
        perGuestLimit: parseOptionalPositiveInt(
          dto.perGuestLimit,
          'Per guest limit',
        ),
        totalRewardLimit: parseOptionalPositiveInt(
          dto.totalRewardLimit,
          'Total reward limit',
        ),
        antiFraudRules: normalizeMissionConfig(
          dto.antiFraudRules,
          defaultMissionAntiFraudRules(),
          'Anti-fraud rules',
        ),
        manualApprovalRequired:
          typeof dto.manualApprovalRequired === 'boolean'
            ? dto.manualApprovalRequired
            : true,
        note: normalizeText(dto.note, 2000),
      },
      include: marketingMissionInclude,
    });

    return this.toMarketingMission(row);
  }

  async updateMission(
    user: AuthenticatedUser,
    id: string,
    dto: MarketingMissionUpdateDto = {},
  ): Promise<MarketingMission> {
    const existing = await this.prisma.marketingMission.findFirst({
      where: { id, tenantId: user.tenantId },
      select: {
        id: true,
        name: true,
        missionType: true,
        triggerKind: true,
        rewardType: true,
        rewardAmount: true,
        periodFrom: true,
        periodTo: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Marketing mission not found');
    }

    const data: Prisma.MarketingMissionUpdateInput = {};
    const missionType = hasOwn(dto, 'missionType')
      ? resolveMissionType(dto.missionType)
      : resolveMissionType(existing.missionType);
    const triggerKind = hasOwn(dto, 'triggerKind')
      ? resolveMissionTriggerKind(dto.triggerKind)
      : resolveMissionTriggerKind(existing.triggerKind);
    const rewardType = hasOwn(dto, 'rewardType')
      ? resolveMissionRewardType(dto.rewardType)
      : resolveMissionRewardType(existing.rewardType);
    const rewardAmount = hasOwn(dto, 'rewardAmount')
      ? parseOptionalBudget(dto.rewardAmount)
      : existing.rewardAmount
        ? Number(existing.rewardAmount)
        : null;
    let periodFrom = existing.periodFrom;
    let periodTo = existing.periodTo;

    if (hasOwn(dto, 'name')) {
      data.name = normalizeText(dto.name, 140) ?? existing.name;
    }

    if (hasOwn(dto, 'status')) {
      data.status = resolveMissionStatus(dto.status);
    }

    if (hasOwn(dto, 'missionType')) {
      data.missionType = missionType;
    }

    if (hasOwn(dto, 'triggerKind')) {
      data.triggerKind = triggerKind;
    }

    if (hasOwn(dto, 'rewardType')) {
      data.rewardType = rewardType;
    }

    if (hasOwn(dto, 'rewardAmount')) {
      data.rewardAmount = rewardAmount;
    }

    if (hasOwn(dto, 'rewardLabel')) {
      data.rewardLabel =
        normalizeText(dto.rewardLabel, 160) ??
        defaultMissionRewardLabel(rewardType, rewardAmount);
    }

    if (hasOwn(dto, 'conditions')) {
      data.conditions = normalizeMissionConfig(
        dto.conditions,
        defaultMissionConditions(missionType, triggerKind),
        'Mission conditions',
      );
    }

    if (hasOwn(dto, 'audienceId')) {
      data.audience = await this.resolveMissionAudienceRelation(
        user,
        dto.audienceId,
      );
    }

    if (hasOwn(dto, 'storeIds')) {
      const storeIds = await this.resolveStoreIds(user, dto.storeIds);
      data.storeIds = storeIds.length > 0 ? storeIds : Prisma.JsonNull;
    }

    if (hasOwn(dto, 'periodFrom')) {
      periodFrom = parseOptionalDate(dto.periodFrom);
      data.periodFrom = periodFrom;
    }

    if (hasOwn(dto, 'periodTo')) {
      periodTo = parseOptionalDate(dto.periodTo);
      data.periodTo = periodTo;
    }

    validateDateRange(periodFrom, periodTo);

    if (hasOwn(dto, 'budgetAmount')) {
      data.budgetAmount = parseOptionalBudget(dto.budgetAmount);
    }

    if (hasOwn(dto, 'perGuestLimit')) {
      data.perGuestLimit = parseOptionalPositiveInt(
        dto.perGuestLimit,
        'Per guest limit',
      );
    }

    if (hasOwn(dto, 'totalRewardLimit')) {
      data.totalRewardLimit = parseOptionalPositiveInt(
        dto.totalRewardLimit,
        'Total reward limit',
      );
    }

    if (hasOwn(dto, 'antiFraudRules')) {
      data.antiFraudRules = normalizeMissionConfig(
        dto.antiFraudRules,
        defaultMissionAntiFraudRules(),
        'Anti-fraud rules',
      );
    }

    if (hasOwn(dto, 'manualApprovalRequired')) {
      data.manualApprovalRequired = Boolean(dto.manualApprovalRequired);
    }

    if (hasOwn(dto, 'note')) {
      data.note = normalizeText(dto.note, 2000);
    }

    const row = await this.prisma.marketingMission.update({
      where: { id },
      data,
      include: marketingMissionInclude,
    });
    const summaries = await this.getMissionRewardSummaries(user.tenantId, [
      row.id,
    ]);

    return this.toMarketingMission(row, summaries.get(row.id));
  }

  async createMissionReward(
    user: AuthenticatedUser,
    dto: MarketingMissionRewardDto = {},
  ): Promise<MarketingMissionReward> {
    const mission = await this.resolveMissionForReward(user, dto.missionId);
    const status = resolveMissionRewardStatus(dto.status ?? 'PENDING');
    const guestId = await this.resolveGuestId(
      user,
      dto.guestId,
      dto.guestExternalId,
      dto.externalDomain,
    );
    const row = await this.prisma.marketingMissionReward.create({
      data: {
        tenantId: user.tenantId,
        missionId: mission.id,
        guestId,
        storeId: await this.resolveStoreId(user, dto.storeId),
        createdByUserId: user.id,
        approvedByUserId:
          status === 'APPROVED' || status === 'PAID' ? user.id : null,
        status,
        source: resolveMissionRewardSource(dto.source ?? 'MANUAL'),
        externalProvider: resolveIntegrationProvider(dto.externalProvider),
        externalDomain: normalizeText(dto.externalDomain, 160),
        externalId: normalizeText(dto.externalId, 160),
        guestExternalId: normalizeText(dto.guestExternalId, 160),
        qualifiedAt: parseOptionalDate(dto.qualifiedAt) ?? new Date(),
        rewardAmount:
          parseOptionalBudget(dto.rewardAmount) ??
          (mission.rewardAmount ? Number(mission.rewardAmount) : 0),
        rewardLabel:
          normalizeText(dto.rewardLabel, 160) ??
          mission.rewardLabel ??
          defaultMissionRewardLabel(
            resolveMissionRewardType(mission.rewardType),
            mission.rewardAmount ? Number(mission.rewardAmount) : null,
          ),
        note: normalizeText(dto.note, 2000),
        evidence: normalizeOptionalJsonValue(dto.evidence),
      },
      include: marketingMissionRewardInclude,
    });

    return this.toMarketingMissionReward(row);
  }

  async updateMissionReward(
    user: AuthenticatedUser,
    id: string,
    dto: MarketingMissionRewardUpdateDto = {},
  ): Promise<MarketingMissionReward> {
    const existing = await this.prisma.marketingMissionReward.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true, status: true },
    });

    if (!existing) {
      throw new NotFoundException('Marketing mission reward not found');
    }

    const data: Prisma.MarketingMissionRewardUpdateInput = {};

    if (hasOwn(dto, 'status')) {
      const status = resolveMissionRewardStatus(dto.status);
      data.status = status;

      if (
        (status === 'APPROVED' || status === 'PAID') &&
        existing.status !== status
      ) {
        data.approvedByUser = { connect: { id: user.id } };
      }
    }

    if (hasOwn(dto, 'storeId')) {
      const storeId = await this.resolveStoreId(user, dto.storeId);
      data.store = storeId
        ? { connect: { id: storeId } }
        : { disconnect: true };
    }

    if (hasOwn(dto, 'qualifiedAt')) {
      data.qualifiedAt = parseOptionalDate(dto.qualifiedAt) ?? new Date();
    }

    if (hasOwn(dto, 'rewardAmount')) {
      data.rewardAmount = parseOptionalBudget(dto.rewardAmount) ?? 0;
    }

    if (hasOwn(dto, 'rewardLabel')) {
      data.rewardLabel = requireText(dto.rewardLabel, 'Reward label', 160);
    }

    if (hasOwn(dto, 'note')) {
      data.note = normalizeText(dto.note, 2000);
    }

    if (hasOwn(dto, 'evidence')) {
      data.evidence = normalizeOptionalJsonValue(dto.evidence);
    }

    const row = await this.prisma.marketingMissionReward.update({
      where: { id },
      data,
      include: marketingMissionRewardInclude,
    });

    return this.toMarketingMissionReward(row);
  }

  private async createPromoBundleUsageRow(
    user: AuthenticatedUser,
    dto: MarketingPromoBundleUsageDto,
  ) {
    const data = await this.buildPromoBundleUsageData(user, dto);

    return this.prisma.marketingPromoBundleUsage.create({
      data: {
        tenantId: user.tenantId,
        createdByUserId: user.id,
        ...data,
      },
      include: marketingPromoBundleUsageInclude,
    });
  }

  private async updatePromoBundleUsageRow(
    user: AuthenticatedUser,
    id: string,
    dto: MarketingPromoBundleUsageDto,
  ) {
    const data = await this.buildPromoBundleUsageData(user, dto);

    return this.prisma.marketingPromoBundleUsage.update({
      where: { id },
      data,
      include: marketingPromoBundleUsageInclude,
    });
  }

  private async buildPromoBundleUsageData(
    user: AuthenticatedUser,
    dto: MarketingPromoBundleUsageDto,
  ): Promise<MarketingPromoBundleUsageWriteData> {
    const promoBundleId = await this.resolvePromoBundleId(
      user,
      dto.promoBundleId,
    );

    if (!promoBundleId) {
      throw new BadRequestException('Promo bundle is required');
    }

    const storeId = await this.resolveStoreId(user, dto.storeId);
    const usedAt = parseOptionalDate(dto.usedAt) ?? new Date();
    const launch = await this.resolvePromoBundleUsageLaunch(
      user,
      promoBundleId,
      dto.launchId,
      storeId,
      usedAt,
    );

    this.validatePromoBundleUsageStoreScope(launch?.storeIds, storeId);

    return {
      promoBundleId,
      launchId: launch?.id ?? null,
      storeId,
      status: resolvePromoBundleUsageStatus(dto.status ?? 'CONFIRMED'),
      source: resolvePromoBundleUsageSource(dto.source ?? 'MANUAL'),
      externalProvider: resolveIntegrationProvider(dto.externalProvider),
      externalDomain: normalizeText(dto.externalDomain, 160),
      externalId: normalizeText(dto.externalId, 160),
      guestExternalId: normalizeText(dto.guestExternalId, 160),
      receiptExternalId: normalizeText(dto.receiptExternalId, 160),
      usedAt,
      quantity: parseOptionalPositiveInt(dto.quantity, 'Quantity') ?? 1,
      amount: parseOptionalBudget(dto.amount) ?? 0,
      costAmount: parseOptionalBudget(dto.costAmount),
      note: normalizeText(dto.note, 2000),
      sourcePayload: normalizeOptionalJsonValue(dto.sourcePayload),
    };
  }

  async updateCampaign(
    user: AuthenticatedUser,
    id: string,
    dto: MarketingCampaignUpdateDto = {},
  ): Promise<MarketingCampaign> {
    const existing = await this.prisma.marketingCampaign.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Marketing campaign not found');
    }

    const data: Prisma.MarketingCampaignUpdateInput = {};

    if (hasOwn(dto, 'goal')) {
      data.goal = resolveGoal(dto.goal);
    }

    if (hasOwn(dto, 'name')) {
      data.name = requireText(dto.name, 'Campaign name', 140);
    }

    if (hasOwn(dto, 'status')) {
      data.status = resolveStatus(dto.status);
    }

    if (hasOwn(dto, 'audienceId')) {
      data.audience = await this.resolveAudienceRelation(user, dto.audienceId);
    }

    if (hasOwn(dto, 'promoBundleId')) {
      data.promoBundle = await this.resolvePromoBundleRelation(
        user,
        dto.promoBundleId,
      );
    }

    if (hasOwn(dto, 'storeIds')) {
      const storeIds = await this.resolveStoreIds(user, dto.storeIds);
      data.storeIds = storeIds.length > 0 ? storeIds : Prisma.JsonNull;
    }

    if (hasOwn(dto, 'ownerUserId')) {
      data.ownerUser = await this.resolveOwnerUserRelation(
        user,
        dto.ownerUserId,
      );
    }

    if (hasOwn(dto, 'channel')) {
      data.channel = normalizeText(dto.channel, 80);
    }

    if (hasOwn(dto, 'mechanic')) {
      data.mechanic = normalizeText(dto.mechanic, 80);
    }

    if (hasOwn(dto, 'mechanicConfig')) {
      data.mechanicConfig = normalizeMechanicConfig(dto.mechanicConfig);
    }

    if (hasOwn(dto, 'periodFrom')) {
      data.periodFrom = parseOptionalDate(dto.periodFrom);
    }

    if (hasOwn(dto, 'periodTo')) {
      data.periodTo = parseOptionalDate(dto.periodTo);
    }

    if (hasOwn(dto, 'dueAt')) {
      data.dueAt = parseOptionalDate(dto.dueAt);
    }

    if (hasOwn(dto, 'budget')) {
      data.budget = parseOptionalBudget(dto.budget);
    }

    if (hasOwn(dto, 'note')) {
      data.note = normalizeText(dto.note, 2000);
    }

    const row = await this.prisma.marketingCampaign.update({
      where: { id },
      data,
      include: marketingCampaignInclude,
    });

    const coverage = await this.getCampaignConsentCoverage(
      user.tenantId,
      row.audienceId,
      row.channel,
    );

    return this.toMarketingCampaign(row, coverage);
  }

  async createCampaignCrmTask(
    user: AuthenticatedUser,
    id: string,
  ): Promise<MarketingCampaign> {
    const campaign = await this.prisma.marketingCampaign.findFirst({
      where: { id, tenantId: user.tenantId },
      include: marketingCampaignInclude,
    });

    if (!campaign) {
      throw new NotFoundException('Marketing campaign not found');
    }

    const coverage = await this.getCampaignConsentCoverage(
      user.tenantId,
      campaign.audienceId,
      campaign.channel,
    );

    if (campaign.crmTask) {
      return this.toMarketingCampaign(campaign, coverage);
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const task = await tx.guestCrmTask.create({
        data: {
          tenantId: user.tenantId,
          audienceId: campaign.audienceId,
          createdByUserId: user.id,
          assignedToUserId: campaign.ownerUserId,
          title: `Маркетинг: ${campaign.name}`,
          description: campaignTaskDescription(campaign, coverage),
          dueAt: campaign.dueAt,
        },
        select: { id: true },
      });

      return tx.marketingCampaign.update({
        where: { id: campaign.id },
        data: {
          crmTaskId: task.id,
          status: campaign.status === 'DRAFT' ? 'PLANNED' : campaign.status,
        },
        include: marketingCampaignInclude,
      });
    });

    return this.toMarketingCampaign(row, coverage);
  }

  private async buildCampaignEffectPeriod({
    tenantId,
    campaignId,
    audienceId,
    guestIds,
    storeIds,
    from,
    to,
  }: {
    tenantId: string;
    campaignId: string;
    audienceId: string | null;
    guestIds: string[];
    storeIds: string[];
    from: Date;
    to: Date;
  }): Promise<MarketingCampaignEffectPeriod> {
    const storeWhere = storeIds.length > 0 ? { storeId: { in: storeIds } } : {};
    const guestWhere =
      guestIds.length > 0 ? { guestId: { in: guestIds } } : null;
    const empty = this.emptyEffectPeriod(from, to);

    if (!guestWhere && !audienceId) {
      return empty;
    }

    type EffectSessionRow = {
      guestId: string | null;
      durationMinutes: number | null;
    };
    type EffectTransactionRow = {
      type: string | null;
      amount: Prisma.Decimal | null;
    };
    type EffectSaleRow = {
      guestId: string | null;
      revenue: Prisma.Decimal;
    };
    type EffectContactEventRow = {
      id: string;
      result: string | null;
      marketingCampaignId: string | null;
    };

    const sessionsPromise: Promise<EffectSessionRow[]> = guestWhere
      ? this.prisma.guestSession.findMany({
          where: {
            tenantId,
            ...guestWhere,
            startedAt: { gte: from, lt: to },
            ...storeWhere,
          },
          select: { guestId: true, durationMinutes: true },
        })
      : Promise.resolve([]);
    const transactionsPromise: Promise<EffectTransactionRow[]> = guestWhere
      ? this.prisma.guestTransaction.findMany({
          where: {
            tenantId,
            ...guestWhere,
            happenedAt: { gte: from, lt: to },
            ...storeWhere,
          },
          select: { type: true, amount: true },
        })
      : Promise.resolve([]);
    const salesPromise: Promise<EffectSaleRow[]> = guestWhere
      ? this.prisma.salesFact.findMany({
          where: {
            tenantId,
            ...guestWhere,
            saleDate: { gte: from, lt: to },
            isCanceled: false,
            ...storeWhere,
          },
          select: { guestId: true, revenue: true },
        })
      : Promise.resolve([]);
    const contactEventsPromise: Promise<EffectContactEventRow[]> =
      this.prisma.guestCrmContactEvent.findMany({
        where: {
          tenantId,
          contactedAt: { gte: from, lt: to },
          OR: [
            { marketingCampaignId: campaignId },
            ...(audienceId ? [{ audienceId }] : []),
            ...(guestWhere ? [guestWhere] : []),
          ],
        },
        select: { id: true, result: true, marketingCampaignId: true },
      });

    const [sessions, transactions, sales, contactEvents] = await Promise.all([
      sessionsPromise,
      transactionsPromise,
      salesPromise,
      contactEventsPromise,
    ]);

    const activeGuestIds = new Set<string>();
    const sessionsByGuestId = new Map<string, number>();
    let playMinutes = 0;
    let transactionRevenue = 0;
    let barRevenue = 0;

    sessions.forEach((session) => {
      if (session.guestId) {
        activeGuestIds.add(session.guestId);
        sessionsByGuestId.set(
          session.guestId,
          (sessionsByGuestId.get(session.guestId) ?? 0) + 1,
        );
      }
      playMinutes += session.durationMinutes ?? 0;
    });

    transactions.forEach((transaction) => {
      transactionRevenue += confirmedTransactionSpendAmount(
        transaction.type,
        transaction.amount?.toNumber() ?? 0,
      );
    });

    sales.forEach((sale) => {
      if (sale.guestId) {
        activeGuestIds.add(sale.guestId);
      }
      barRevenue += sale.revenue.toNumber();
    });

    const balanceRevenue = transactionRevenue;
    const directContacts = contactEvents.filter(
      (event) => event.marketingCampaignId === campaignId,
    ).length;
    const respondedContacts = contactEvents.filter((event) =>
      Boolean(event.result?.trim()),
    ).length;

    return {
      ...empty,
      contacts: contactEvents.length,
      directContacts,
      respondedContacts,
      activeGuests: activeGuestIds.size,
      repeatGuests: [...sessionsByGuestId.values()].filter((count) => count > 1)
        .length,
      sessionsCount: sessions.length,
      playHours: this.round(playMinutes / 60, 2),
      balanceRevenue: this.round(balanceRevenue, 2),
      barRevenue: this.round(barRevenue, 2),
      totalRevenue: this.round(balanceRevenue + barRevenue, 2),
      barSalesCount: sales.length,
    };
  }

  private async buildCampaignStoreBreakdown({
    tenantId,
    guestIds,
    storeIds,
    beforeFrom,
    beforeTo,
    afterFrom,
    afterTo,
  }: {
    tenantId: string;
    guestIds: string[];
    storeIds: string[];
    beforeFrom: Date;
    beforeTo: Date;
    afterFrom: Date;
    afterTo: Date;
  }): Promise<MarketingCampaignStoreEffect[]> {
    const [before, after] = await Promise.all([
      this.buildStoreEffectMetrics({
        tenantId,
        guestIds,
        storeIds,
        from: beforeFrom,
        to: beforeTo,
      }),
      this.buildStoreEffectMetrics({
        tenantId,
        guestIds,
        storeIds,
        from: afterFrom,
        to: afterTo,
      }),
    ]);
    const keys = new Set<string>([
      ...storeIds,
      ...before.keys(),
      ...after.keys(),
    ]);

    if (keys.size === 0) {
      return [];
    }

    const storeIdList = [...keys].filter((key) => key !== 'unallocated');
    const stores = storeIdList.length
      ? await this.prisma.store.findMany({
          where: { tenantId, id: { in: storeIdList } },
          select: { id: true, name: true },
        })
      : [];
    const storeNames = new Map(stores.map((store) => [store.id, store.name]));

    return [...keys]
      .map((key) => {
        const beforeMetrics = before.get(key) ?? this.emptyStoreEffectMetrics();
        const afterMetrics = after.get(key) ?? this.emptyStoreEffectMetrics();

        return {
          storeId: key === 'unallocated' ? null : key,
          storeName:
            key === 'unallocated'
              ? 'Нераспределено'
              : (storeNames.get(key) ?? 'Клуб без названия'),
          before: beforeMetrics,
          after: afterMetrics,
          delta: this.diffStoreEffectMetrics(afterMetrics, beforeMetrics),
        };
      })
      .sort((left, right) => {
        const revenueDiff = right.after.totalRevenue - left.after.totalRevenue;

        if (revenueDiff !== 0) {
          return revenueDiff;
        }

        const guestsDiff = right.after.activeGuests - left.after.activeGuests;

        if (guestsDiff !== 0) {
          return guestsDiff;
        }

        return left.storeName.localeCompare(right.storeName, 'ru');
      });
  }

  private buildCampaignAudienceBreakdown({
    campaign,
    targetTotal,
    guestIds,
    after,
  }: {
    campaign: {
      audience: {
        id: string;
        name: string;
        description: string | null;
        filters: Prisma.JsonValue;
      } | null;
    };
    targetTotal: number;
    guestIds: string[];
    after: MarketingCampaignEffectPeriod;
  }): MarketingCampaignAudienceBreakdownRow[] {
    if (!campaign.audience && targetTotal === 0) {
      return [];
    }

    const linkedTargetGuests = guestIds.length;

    return [
      {
        key: campaign.audience?.id ?? 'campaign-scope',
        sourceType: campaign.audience ? 'SAVED_GROUP' : 'CAMPAIGN_SCOPE',
        audienceId: campaign.audience?.id ?? null,
        label: campaign.audience?.name ?? 'Без сохраненной группы',
        hint:
          campaign.audience?.description ??
          'Кампания пока не привязана к сохраненной группе гостей.',
        ruleLabel: campaignAudienceRuleLabel(
          campaign.audience?.filters ?? null,
        ),
        targetTotal,
        linkedTargetGuests,
        unlinkedTargetMembers: Math.max(0, targetTotal - linkedTargetGuests),
        metrics: {
          contacts: after.contacts,
          directContacts: after.directContacts,
          respondedContacts: after.respondedContacts,
          linkedGuests: linkedTargetGuests,
          activeGuests: after.activeGuests,
          repeatGuests: after.repeatGuests,
          sessionsCount: after.sessionsCount,
          playHours: after.playHours,
          balanceRevenue: after.balanceRevenue,
          barRevenue: after.barRevenue,
          totalRevenue: after.totalRevenue,
          barSalesCount: after.barSalesCount,
        },
      },
    ];
  }

  private async buildCampaignExecutionBreakdown({
    tenantId,
    campaignId,
    audienceId,
    guestIds,
    storeIds,
    from,
    to,
  }: {
    tenantId: string;
    campaignId: string;
    audienceId: string | null;
    guestIds: string[];
    storeIds: string[];
    from: Date;
    to: Date;
  }): Promise<MarketingCampaignExecutionBreakdown> {
    const guestWhere =
      guestIds.length > 0 ? { guestId: { in: guestIds } } : null;
    const events = await this.prisma.guestCrmContactEvent.findMany({
      where: {
        tenantId,
        contactedAt: { gte: from, lt: to },
        OR: [
          { marketingCampaignId: campaignId },
          ...(audienceId ? [{ audienceId }] : []),
          ...(guestWhere ? [guestWhere] : []),
        ],
      },
      select: {
        id: true,
        channel: true,
        result: true,
        marketingCampaignId: true,
        guestId: true,
        createdByUserId: true,
        createdByUser: { select: { fullName: true, email: true } },
        lead: { select: { matchedGuestId: true } },
      },
    });

    const responsibleBuckets = new Map<
      string,
      MarketingCampaignExecutionBucket
    >();
    const channelBuckets = new Map<string, MarketingCampaignExecutionBucket>();
    const getBucket = (
      buckets: Map<string, MarketingCampaignExecutionBucket>,
      key: string,
      label: string,
      hint: string | null,
    ) => {
      const existing = buckets.get(key);

      if (existing) {
        return existing;
      }

      const bucket: MarketingCampaignExecutionBucket = {
        key,
        label,
        hint,
        contacts: 0,
        directContacts: 0,
        respondedContacts: 0,
        linkedGuestIds: new Set<string>(),
      };
      buckets.set(key, bucket);

      return bucket;
    };
    const addEventToBucket = (
      bucket: MarketingCampaignExecutionBucket,
      event: (typeof events)[number],
    ) => {
      const linkedGuestId = event.guestId ?? event.lead?.matchedGuestId ?? null;
      bucket.contacts += 1;

      if (event.marketingCampaignId === campaignId) {
        bucket.directContacts += 1;
      }

      if (event.result?.trim()) {
        bucket.respondedContacts += 1;
      }

      if (linkedGuestId) {
        bucket.linkedGuestIds.add(linkedGuestId);
      }
    };

    events.forEach((event) => {
      const responsibleLabel = event.createdByUser
        ? event.createdByUser.fullName || event.createdByUser.email
        : 'Без ответственного';
      const responsibleHint = event.createdByUser?.email ?? null;
      const responsibleKey = event.createdByUserId ?? 'unassigned';
      const responsibleBucket = getBucket(
        responsibleBuckets,
        responsibleKey,
        responsibleLabel,
        responsibleHint,
      );
      const channelLabel = event.channel.trim() || 'Канал не указан';
      const channelBucket = getBucket(
        channelBuckets,
        channelLabel.toLocaleLowerCase('ru-RU'),
        channelLabel,
        null,
      );

      addEventToBucket(responsibleBucket, event);
      addEventToBucket(channelBucket, event);
    });

    const toRows = async (
      buckets: Map<string, MarketingCampaignExecutionBucket>,
    ): Promise<MarketingCampaignExecutionBreakdownRow[]> => {
      const rows = await Promise.all(
        [...buckets.values()].map(async (bucket) => {
          const behavior = await this.buildExecutionBehaviorMetrics({
            tenantId,
            guestIds: [...bucket.linkedGuestIds],
            storeIds,
            from,
            to,
          });

          return {
            key: bucket.key,
            label: bucket.label,
            hint: bucket.hint,
            metrics: {
              ...behavior,
              contacts: bucket.contacts,
              directContacts: bucket.directContacts,
              respondedContacts: bucket.respondedContacts,
              linkedGuests: bucket.linkedGuestIds.size,
            },
          };
        }),
      );

      return rows.sort((left, right) => {
        const contactDiff = right.metrics.contacts - left.metrics.contacts;

        if (contactDiff !== 0) {
          return contactDiff;
        }

        const revenueDiff =
          right.metrics.totalRevenue - left.metrics.totalRevenue;

        if (revenueDiff !== 0) {
          return revenueDiff;
        }

        return left.label.localeCompare(right.label, 'ru');
      });
    };

    return {
      byResponsible: await toRows(responsibleBuckets),
      byChannel: await toRows(channelBuckets),
    };
  }

  private async buildExecutionBehaviorMetrics({
    tenantId,
    guestIds,
    storeIds,
    from,
    to,
  }: {
    tenantId: string;
    guestIds: string[];
    storeIds: string[];
    from: Date;
    to: Date;
  }): Promise<MarketingCampaignExecutionMetrics> {
    const empty = this.emptyExecutionMetrics();

    if (guestIds.length === 0) {
      return empty;
    }

    const guestWhere = { guestId: { in: guestIds } };
    const storeWhere = storeIds.length > 0 ? { storeId: { in: storeIds } } : {};
    const [sessions, transactions, sales] = await Promise.all([
      this.prisma.guestSession.findMany({
        where: {
          tenantId,
          ...guestWhere,
          startedAt: { gte: from, lt: to },
          ...storeWhere,
        },
        select: { guestId: true, durationMinutes: true },
      }),
      this.prisma.guestTransaction.findMany({
        where: {
          tenantId,
          ...guestWhere,
          happenedAt: { gte: from, lt: to },
          ...storeWhere,
        },
        select: { type: true, amount: true },
      }),
      this.prisma.salesFact.findMany({
        where: {
          tenantId,
          ...guestWhere,
          saleDate: { gte: from, lt: to },
          isCanceled: false,
          ...storeWhere,
        },
        select: { guestId: true, revenue: true },
      }),
    ]);
    const activeGuestIds = new Set<string>();
    const sessionsByGuestId = new Map<string, number>();
    let playMinutes = 0;
    let balanceRevenue = 0;
    let barRevenue = 0;

    sessions.forEach((session) => {
      if (session.guestId) {
        activeGuestIds.add(session.guestId);
        sessionsByGuestId.set(
          session.guestId,
          (sessionsByGuestId.get(session.guestId) ?? 0) + 1,
        );
      }

      playMinutes += session.durationMinutes ?? 0;
    });

    transactions.forEach((transaction) => {
      balanceRevenue += confirmedTransactionSpendAmount(
        transaction.type,
        transaction.amount?.toNumber() ?? 0,
      );
    });

    sales.forEach((sale) => {
      if (sale.guestId) {
        activeGuestIds.add(sale.guestId);
      }

      barRevenue += sale.revenue.toNumber();
    });

    return {
      ...empty,
      linkedGuests: guestIds.length,
      activeGuests: activeGuestIds.size,
      repeatGuests: [...sessionsByGuestId.values()].filter((count) => count > 1)
        .length,
      sessionsCount: sessions.length,
      playHours: this.round(playMinutes / 60, 2),
      balanceRevenue: this.round(balanceRevenue, 2),
      barRevenue: this.round(barRevenue, 2),
      totalRevenue: this.round(balanceRevenue + barRevenue, 2),
      barSalesCount: sales.length,
    };
  }

  private async buildStoreEffectMetrics({
    tenantId,
    guestIds,
    storeIds,
    from,
    to,
  }: {
    tenantId: string;
    guestIds: string[];
    storeIds: string[];
    from: Date;
    to: Date;
  }): Promise<Map<string, MarketingCampaignStoreEffectMetrics>> {
    if (guestIds.length === 0) {
      return new Map();
    }

    const guestWhere = { guestId: { in: guestIds } };
    const storeWhere = storeIds.length > 0 ? { storeId: { in: storeIds } } : {};
    const buckets = new Map<
      string,
      MarketingCampaignStoreEffectMetrics & {
        activeGuestIds: Set<string>;
        sessionsByGuestId: Map<string, number>;
      }
    >();
    const getBucket = (storeId: string | null) => {
      const key = storeId ?? 'unallocated';
      const existing = buckets.get(key);

      if (existing) {
        return existing;
      }

      const bucket = {
        ...this.emptyStoreEffectMetrics(),
        activeGuestIds: new Set<string>(),
        sessionsByGuestId: new Map<string, number>(),
      };
      buckets.set(key, bucket);

      return bucket;
    };

    const [sessions, transactions, sales] = await Promise.all([
      this.prisma.guestSession.findMany({
        where: {
          tenantId,
          ...guestWhere,
          startedAt: { gte: from, lt: to },
          ...storeWhere,
        },
        select: { storeId: true, guestId: true, durationMinutes: true },
      }),
      this.prisma.guestTransaction.findMany({
        where: {
          tenantId,
          ...guestWhere,
          happenedAt: { gte: from, lt: to },
          ...storeWhere,
        },
        select: { storeId: true, type: true, amount: true },
      }),
      this.prisma.salesFact.findMany({
        where: {
          tenantId,
          ...guestWhere,
          saleDate: { gte: from, lt: to },
          isCanceled: false,
          ...storeWhere,
        },
        select: { storeId: true, guestId: true, revenue: true },
      }),
    ]);

    sessions.forEach((session) => {
      const bucket = getBucket(session.storeId);
      bucket.sessionsCount += 1;
      bucket.playHours += (session.durationMinutes ?? 0) / 60;

      if (session.guestId) {
        bucket.activeGuestIds.add(session.guestId);
        bucket.sessionsByGuestId.set(
          session.guestId,
          (bucket.sessionsByGuestId.get(session.guestId) ?? 0) + 1,
        );
      }
    });

    transactions.forEach((transaction) => {
      const bucket = getBucket(transaction.storeId);
      bucket.balanceRevenue += confirmedTransactionSpendAmount(
        transaction.type,
        transaction.amount?.toNumber() ?? 0,
      );
    });

    sales.forEach((sale) => {
      const bucket = getBucket(sale.storeId);
      bucket.barRevenue += sale.revenue.toNumber();
      bucket.barSalesCount += 1;

      if (sale.guestId) {
        bucket.activeGuestIds.add(sale.guestId);
      }
    });

    return new Map(
      [...buckets.entries()].map(([key, bucket]) => {
        const activeGuests = bucket.activeGuestIds.size;
        const repeatGuests = [...bucket.sessionsByGuestId.values()].filter(
          (count) => count > 1,
        ).length;

        return [
          key,
          {
            activeGuests,
            repeatGuests,
            sessionsCount: bucket.sessionsCount,
            playHours: this.round(bucket.playHours, 2),
            balanceRevenue: this.round(bucket.balanceRevenue, 2),
            barRevenue: this.round(bucket.barRevenue, 2),
            totalRevenue: this.round(
              bucket.balanceRevenue + bucket.barRevenue,
              2,
            ),
            barSalesCount: bucket.barSalesCount,
          },
        ];
      }),
    );
  }

  private buildCampaignRevenueAttribution({
    before,
    after,
    storeBreakdown,
    beforeExcludedOnlineTopupRevenue,
    afterExcludedOnlineTopupRevenue,
  }: {
    before: MarketingCampaignEffectPeriod;
    after: MarketingCampaignEffectPeriod;
    storeBreakdown: MarketingCampaignStoreEffect[];
    beforeExcludedOnlineTopupRevenue: number;
    afterExcludedOnlineTopupRevenue: number;
  }): MarketingCampaignRevenueAttribution {
    const beforePeriod = this.buildCampaignRevenueAttributionPeriod({
      period: before,
      storeBreakdown,
      key: 'before',
      excludedOnlineTopupRevenue: beforeExcludedOnlineTopupRevenue,
    });
    const afterPeriod = this.buildCampaignRevenueAttributionPeriod({
      period: after,
      storeBreakdown,
      key: 'after',
      excludedOnlineTopupRevenue: afterExcludedOnlineTopupRevenue,
    });

    return {
      before: beforePeriod,
      after: afterPeriod,
      delta: {
        attributedRevenue: this.round(
          afterPeriod.attributedRevenue - beforePeriod.attributedRevenue,
          2,
        ),
        storeScopedRevenue: this.round(
          afterPeriod.storeScopedRevenue - beforePeriod.storeScopedRevenue,
          2,
        ),
        unallocatedFactRevenue: this.round(
          afterPeriod.unallocatedFactRevenue -
            beforePeriod.unallocatedFactRevenue,
          2,
        ),
        excludedOnlineTopupRevenue: this.round(
          afterPeriod.excludedOnlineTopupRevenue -
            beforePeriod.excludedOnlineTopupRevenue,
          2,
        ),
      },
    };
  }

  private buildCampaignRevenueAttributionPeriod({
    period,
    storeBreakdown,
    key,
    excludedOnlineTopupRevenue,
  }: {
    period: MarketingCampaignEffectPeriod;
    storeBreakdown: MarketingCampaignStoreEffect[];
    key: 'before' | 'after';
    excludedOnlineTopupRevenue: number;
  }): MarketingCampaignRevenueAttributionPeriod {
    const storeScopedRevenue = storeBreakdown.reduce((sum, row) => {
      if (!row.storeId) {
        return sum;
      }

      return sum + row[key].totalRevenue;
    }, 0);

    return {
      attributedRevenue: period.totalRevenue,
      storeScopedRevenue: this.round(storeScopedRevenue, 2),
      unallocatedFactRevenue: this.round(
        Math.max(0, period.totalRevenue - storeScopedRevenue),
        2,
      ),
      excludedOnlineTopupRevenue: this.round(excludedOnlineTopupRevenue, 2),
    };
  }

  private buildCampaignEconomics({
    budget,
    targetTotal,
    completedContacts,
    respondedContacts,
    visitedGuests,
    revenueAttribution,
    delta,
  }: {
    budget: number | null;
    targetTotal: number;
    completedContacts: number;
    respondedContacts: number;
    visitedGuests: number;
    revenueAttribution: MarketingCampaignRevenueAttribution;
    delta: Omit<MarketingCampaignEffectPeriod, 'from' | 'to' | 'days'>;
  }): MarketingCampaignEconomics {
    const positiveBudget = budget !== null && budget > 0 ? budget : null;
    const attributedRevenueDelta = this.round(
      revenueAttribution.delta.attributedRevenue,
      2,
    );
    const costPerResult = (denominator: number) =>
      positiveBudget !== null && denominator > 0
        ? this.round(positiveBudget / denominator, 2)
        : null;
    const revenuePerBudgetRub =
      positiveBudget !== null
        ? this.round(attributedRevenueDelta / positiveBudget, 2)
        : null;
    const roiPercent =
      positiveBudget !== null
        ? this.round(
            ((attributedRevenueDelta - positiveBudget) / positiveBudget) * 100,
            1,
          )
        : null;
    const { paybackStatus, paybackLabel } = this.resolveCampaignPayback({
      budget: positiveBudget,
      attributedRevenueDelta,
    });

    return {
      budget: positiveBudget,
      attributedRevenueAfter: this.round(
        revenueAttribution.after.attributedRevenue,
        2,
      ),
      attributedRevenueDelta,
      incrementalRevenue: this.round(delta.totalRevenue, 2),
      incrementalBarRevenue: this.round(delta.barRevenue, 2),
      incrementalActiveGuests: this.round(delta.activeGuests, 2),
      incrementalRepeatGuests: this.round(delta.repeatGuests, 2),
      costPerTargetGuest: costPerResult(targetTotal),
      costPerContact: costPerResult(completedContacts),
      costPerRespondedContact: costPerResult(respondedContacts),
      costPerVisit: costPerResult(visitedGuests),
      revenuePerBudgetRub,
      roiPercent,
      paybackStatus,
      paybackLabel,
      recommendation: this.campaignEconomicsRecommendation({
        budget: positiveBudget,
        attributedRevenueDelta,
        completedContacts,
        visitedGuests,
        roiPercent,
        paybackStatus,
      }),
    };
  }

  private resolveCampaignPayback({
    budget,
    attributedRevenueDelta,
  }: {
    budget: number | null;
    attributedRevenueDelta: number;
  }): {
    paybackStatus: MarketingCampaignEconomicsPaybackStatus;
    paybackLabel: string;
  } {
    if (budget === null) {
      return {
        paybackStatus: 'NO_BUDGET',
        paybackLabel: 'бюджет не задан',
      };
    }

    if (attributedRevenueDelta < 0) {
      return {
        paybackStatus: 'LOSS',
        paybackLabel: 'отрицательная дельта',
      };
    }

    if (attributedRevenueDelta === 0) {
      return {
        paybackStatus: 'NO_REVENUE',
        paybackLabel: 'нет денежного эффекта',
      };
    }

    if (attributedRevenueDelta >= budget) {
      return {
        paybackStatus: 'PAID_OFF',
        paybackLabel: 'окупилась',
      };
    }

    return {
      paybackStatus: 'PARTIAL',
      paybackLabel: 'частичная окупаемость',
    };
  }

  private campaignEconomicsRecommendation({
    budget,
    attributedRevenueDelta,
    completedContacts,
    visitedGuests,
    roiPercent,
    paybackStatus,
  }: {
    budget: number | null;
    attributedRevenueDelta: number;
    completedContacts: number;
    visitedGuests: number;
    roiPercent: number | null;
    paybackStatus: MarketingCampaignEconomicsPaybackStatus;
  }) {
    if (budget === null) {
      return 'Укажите бюджет кампании, чтобы LeetPlus посчитал стоимость контакта, визита и ROI.';
    }

    if (completedContacts === 0) {
      return 'Сначала доведите кампанию до контактов: без исполнения стоимость результата не считается.';
    }

    if (visitedGuests === 0) {
      return 'Контакты уже есть, но визитов нет: проверьте оффер, скрипт и качество выбранной группы.';
    }

    if (paybackStatus === 'PAID_OFF') {
      return `Кампания окупилась: зафиксируйте механику и повторите ее на похожей группе. ROI ${roiPercent ?? 0}%.`;
    }

    if (paybackStatus === 'PARTIAL') {
      return `Денежный эффект есть, но бюджет еще не окупился: дожмите контакты или сузьте группу. Учтено ${attributedRevenueDelta} руб прироста.`;
    }

    return 'Окупаемость не подтверждена: разберите атрибуцию, сегмент и механику до повторного запуска.';
  }

  private async buildUnallocatedOnlineTopupRevenue({
    tenantId,
    from,
    to,
  }: {
    tenantId: string;
    from: Date;
    to: Date;
  }): Promise<number> {
    const operationLogs = await this.prisma.guestOperationLog.findMany({
      where: {
        tenantId,
        happenedAt: { gte: from, lt: to },
        OR: [
          { storeId: null },
          { externalClubId: null },
          { externalClubId: '0' },
        ],
      },
      select: {
        storeId: true,
        externalClubId: true,
        type: true,
        operationSource: true,
        operationForm: true,
        amount: true,
      },
    });

    return this.round(
      operationLogs.reduce(
        (sum, operationLog) =>
          sum + unallocatedNetworkTopupAmount(operationLog),
        0,
      ),
      2,
    );
  }

  private emptyStoreEffectMetrics(): MarketingCampaignStoreEffectMetrics {
    return {
      activeGuests: 0,
      repeatGuests: 0,
      sessionsCount: 0,
      playHours: 0,
      balanceRevenue: 0,
      barRevenue: 0,
      totalRevenue: 0,
      barSalesCount: 0,
    };
  }

  private emptyExecutionMetrics(): MarketingCampaignExecutionMetrics {
    return {
      contacts: 0,
      directContacts: 0,
      respondedContacts: 0,
      linkedGuests: 0,
      activeGuests: 0,
      repeatGuests: 0,
      sessionsCount: 0,
      playHours: 0,
      balanceRevenue: 0,
      barRevenue: 0,
      totalRevenue: 0,
      barSalesCount: 0,
    };
  }

  private diffStoreEffectMetrics(
    after: MarketingCampaignStoreEffectMetrics,
    before: MarketingCampaignStoreEffectMetrics,
  ): MarketingCampaignStoreEffectMetrics {
    return {
      activeGuests: this.round(after.activeGuests - before.activeGuests, 2),
      repeatGuests: this.round(after.repeatGuests - before.repeatGuests, 2),
      sessionsCount: this.round(after.sessionsCount - before.sessionsCount, 2),
      playHours: this.round(after.playHours - before.playHours, 2),
      balanceRevenue: this.round(
        after.balanceRevenue - before.balanceRevenue,
        2,
      ),
      barRevenue: this.round(after.barRevenue - before.barRevenue, 2),
      totalRevenue: this.round(after.totalRevenue - before.totalRevenue, 2),
      barSalesCount: this.round(after.barSalesCount - before.barSalesCount, 2),
    };
  }

  private resolveEffectWindow(campaign: {
    periodFrom: Date | null;
    periodTo: Date | null;
    dueAt: Date | null;
    createdAt: Date;
  }) {
    const afterFrom = new Date(
      campaign.periodFrom ?? campaign.dueAt ?? campaign.createdAt,
    );
    const now = new Date();
    let afterTo = campaign.periodTo
      ? this.toExclusiveEffectEnd(campaign.periodTo)
      : now;

    if (afterTo <= afterFrom) {
      afterTo = new Date(afterFrom.getTime() + DAY_MS);
    }

    const durationMs = Math.max(
      DAY_MS,
      afterTo.getTime() - afterFrom.getTime(),
    );
    const beforeTo = new Date(afterFrom);
    const beforeFrom = new Date(afterFrom.getTime() - durationMs);

    return { afterFrom, afterTo, beforeFrom, beforeTo };
  }

  private toExclusiveEffectEnd(value: Date) {
    const result = new Date(value);

    if (
      result.getUTCHours() === 0 &&
      result.getUTCMinutes() === 0 &&
      result.getUTCSeconds() === 0 &&
      result.getUTCMilliseconds() === 0
    ) {
      result.setUTCDate(result.getUTCDate() + 1);
    }

    return result;
  }

  private emptyEffectPeriod(
    from: Date,
    to: Date,
  ): MarketingCampaignEffectPeriod {
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      days: Math.max(1, Math.ceil((to.getTime() - from.getTime()) / DAY_MS)),
      contacts: 0,
      directContacts: 0,
      respondedContacts: 0,
      activeGuests: 0,
      repeatGuests: 0,
      sessionsCount: 0,
      playHours: 0,
      balanceRevenue: 0,
      barRevenue: 0,
      totalRevenue: 0,
      barSalesCount: 0,
    };
  }

  private round(value: number, digits = 2) {
    const multiplier = 10 ** digits;
    return Math.round(value * multiplier) / multiplier;
  }

  private promoBundleProductRefs(
    structure: MarketingPromoBundleStructure,
  ): Array<{ part: 'first' | 'second'; label: string; productId: string }> {
    return [
      {
        part: 'first' as const,
        label: structure.composition.firstLabel,
        ref: structure.accounting.firstRef,
      },
      {
        part: 'second' as const,
        label: structure.composition.secondLabel,
        ref: structure.accounting.secondRef,
      },
    ].flatMap((item) => {
      if (item.ref.kind !== 'PRODUCT' || !item.ref.productId) {
        return [];
      }

      return [
        {
          part: item.part,
          label: item.label,
          productId: item.ref.productId,
        },
      ];
    });
  }

  private async buildPromoBundleReconciliationRow({
    tenantId,
    row,
    structure,
    productsById,
  }: {
    tenantId: string;
    row: MarketingPromoBundleReconciliationRow;
    structure: MarketingPromoBundleStructure;
    productsById: Map<string, { id: string; name: string; article: string }>;
  }): Promise<MarketingPromoBundleReconciliation> {
    const productRefs = this.promoBundleProductRefs(structure).map((ref) => {
      const product = productsById.get(ref.productId);

      return {
        ...ref,
        productName: product?.name ?? null,
        productArticle: product?.article ?? null,
      };
    });
    const launches = row.launches.filter(
      (launch) => launch.status !== 'CANCELED',
    );
    const launchFacts =
      productRefs.length > 0
        ? await Promise.all(
            launches.map((launch) =>
              this.buildPromoBundleLaunchReconciliation({
                tenantId,
                launch,
                productIds: productRefs.map((ref) => ref.productId),
                expectedUses: structure.limits.expectedUses,
              }),
            ),
          )
        : [];
    const totals = this.totalPromoBundleLaunchFacts(
      launchFacts,
      structure.limits.expectedUses,
    );
    const warnings = this.promoBundleReconciliationWarnings({
      structure,
      productRefs,
      launches,
      totals,
    });
    const status = this.resolvePromoBundleReconciliationStatus({
      structure,
      productRefs,
      launches,
      totals,
    });

    return {
      promoBundleId: row.id,
      status,
      label: promoBundleReconciliationLabel(status),
      activeLaunches: row.launches.filter(
        (launch) => launch.status === 'ACTIVE',
      ).length,
      productRefs,
      launches: launchFacts,
      totals,
      warnings,
      dataQuality: {
        factSource:
          'SalesFact и StockMovement по привязанным товарам в периоде и клубах запуска.',
        limitation:
          'Это прокси-факт продаж и складских списаний, а не точное погашение промо-набора; точный учет использований появится после подтверждения операционного источника.',
      },
    };
  }

  private async buildPromoBundleLaunchReconciliation({
    tenantId,
    launch,
    productIds,
    expectedUses,
  }: {
    tenantId: string;
    launch: MarketingPromoBundleReconciliationLaunchRow;
    productIds: string[];
    expectedUses: number;
  }): Promise<MarketingPromoBundleReconciliationLaunch> {
    const storeIds = parseStringArray(launch.storeIds);
    const { from, to } = promoBundleLaunchFactWindow(launch);
    const [facts, writeOffMovements] = await Promise.all([
      this.prisma.salesFact.findMany({
        where: {
          tenantId,
          productId: { in: productIds },
          saleDate: { gte: from, lt: to },
          isCanceled: false,
          ...(storeIds.length > 0 ? { storeId: { in: storeIds } } : {}),
        },
        select: {
          storeId: true,
          saleDate: true,
          quantity: true,
          revenue: true,
          cost: true,
        },
      }),
      this.prisma.stockMovement.findMany({
        where: {
          tenantId,
          productId: { in: productIds },
          movementDate: { gte: from, lt: to },
          type: StockMovementType.WRITEOFF,
          ...(storeIds.length > 0 ? { storeId: { in: storeIds } } : {}),
        },
        select: {
          storeId: true,
          movementDate: true,
          quantity: true,
          amount: true,
        },
      }),
    ]);
    const storeSet = new Set<string>();
    const writeOffStoreSet = new Set<string>();
    let salesQuantity = 0;
    let salesRevenue = 0;
    let salesCost = 0;
    let writeOffQuantity = 0;
    let writeOffAmount = 0;
    let lastSaleAtMs = 0;
    let lastWriteOffAtMs = 0;
    let lastSaleDateIso: string | null = null;
    let lastWriteOffDateIso: string | null = null;

    facts.forEach((fact) => {
      storeSet.add(fact.storeId);
      salesQuantity += fact.quantity.toNumber();
      salesRevenue += fact.revenue.toNumber();
      salesCost += fact.cost.toNumber();

      if (fact.saleDate.getTime() > lastSaleAtMs) {
        lastSaleAtMs = fact.saleDate.getTime();
        lastSaleDateIso = fact.saleDate.toISOString();
      }
    });

    writeOffMovements.forEach((movement) => {
      writeOffStoreSet.add(movement.storeId);
      writeOffQuantity += movement.quantity.toNumber();
      writeOffAmount += movement.amount.toNumber();

      if (movement.movementDate.getTime() > lastWriteOffAtMs) {
        lastWriteOffAtMs = movement.movementDate.getTime();
        lastWriteOffDateIso = movement.movementDate.toISOString();
      }
    });

    const progressLimit = launch.maxUses ?? expectedUses;

    return {
      launchId: launch.id,
      status: resolvePromoBundleLaunchStatus(launch.status),
      audience: launch.audience
        ? {
            id: launch.audience.id,
            name: launch.audience.name,
            guestsCount: launch.audience.guestsCount,
          }
        : null,
      storeIds,
      periodFrom: launch.periodFrom?.toISOString() ?? null,
      periodTo: launch.periodTo?.toISOString() ?? null,
      maxUses: launch.maxUses,
      salesQuantity: this.round(salesQuantity, 2),
      salesCount: facts.length,
      salesRevenue: this.round(salesRevenue, 2),
      salesCost: this.round(salesCost, 2),
      grossProfit: this.round(salesRevenue - salesCost, 2),
      writeOffQuantity: this.round(writeOffQuantity, 2),
      writeOffAmount: this.round(writeOffAmount, 2),
      writeOffCount: writeOffMovements.length,
      writeOffStoreCount: writeOffStoreSet.size,
      lastWriteOffDate: lastWriteOffDateIso,
      storeCount: storeSet.size,
      lastSaleDate: lastSaleDateIso,
      usageProgressPercent:
        progressLimit > 0 ? this.ratio(salesQuantity, progressLimit) : null,
    };
  }

  private totalPromoBundleLaunchFacts(
    launches: MarketingPromoBundleReconciliationLaunch[],
    expectedUses: number,
  ): MarketingPromoBundleReconciliationTotals {
    let storeCount = 0;
    let writeOffStoreCount = 0;
    let lastSaleDate: string | null = null;
    let lastWriteOffDate: string | null = null;
    let maxUses = 0;
    const totals = launches.reduce(
      (sum, launch) => {
        storeCount = Math.max(storeCount, launch.storeCount);
        writeOffStoreCount = Math.max(
          writeOffStoreCount,
          launch.writeOffStoreCount,
        );

        if (
          launch.lastSaleDate &&
          (!lastSaleDate ||
            new Date(launch.lastSaleDate).getTime() >
              new Date(lastSaleDate).getTime())
        ) {
          lastSaleDate = launch.lastSaleDate;
        }

        if (
          launch.lastWriteOffDate &&
          (!lastWriteOffDate ||
            new Date(launch.lastWriteOffDate).getTime() >
              new Date(lastWriteOffDate).getTime())
        ) {
          lastWriteOffDate = launch.lastWriteOffDate;
        }

        maxUses += launch.maxUses ?? 0;

        return {
          salesQuantity: sum.salesQuantity + launch.salesQuantity,
          salesCount: sum.salesCount + launch.salesCount,
          salesRevenue: sum.salesRevenue + launch.salesRevenue,
          salesCost: sum.salesCost + launch.salesCost,
          grossProfit: sum.grossProfit + launch.grossProfit,
          writeOffQuantity: sum.writeOffQuantity + launch.writeOffQuantity,
          writeOffAmount: sum.writeOffAmount + launch.writeOffAmount,
          writeOffCount: sum.writeOffCount + launch.writeOffCount,
        };
      },
      {
        salesQuantity: 0,
        salesCount: 0,
        salesRevenue: 0,
        salesCost: 0,
        grossProfit: 0,
        writeOffQuantity: 0,
        writeOffAmount: 0,
        writeOffCount: 0,
      },
    );
    const progressLimit = maxUses > 0 ? maxUses : expectedUses;

    return {
      salesQuantity: this.round(totals.salesQuantity, 2),
      salesCount: totals.salesCount,
      salesRevenue: this.round(totals.salesRevenue, 2),
      salesCost: this.round(totals.salesCost, 2),
      grossProfit: this.round(totals.grossProfit, 2),
      writeOffQuantity: this.round(totals.writeOffQuantity, 2),
      writeOffAmount: this.round(totals.writeOffAmount, 2),
      writeOffCount: totals.writeOffCount,
      writeOffStoreCount,
      lastWriteOffDate,
      storeCount,
      lastSaleDate,
      expectedUses,
      maxUses: maxUses > 0 ? maxUses : null,
      usageProgressPercent:
        progressLimit > 0
          ? this.ratio(totals.salesQuantity, progressLimit)
          : null,
    };
  }

  private resolvePromoBundleReconciliationStatus({
    structure,
    productRefs,
    launches,
    totals,
  }: {
    structure: MarketingPromoBundleStructure;
    productRefs: MarketingPromoBundleReconciliationProductRef[];
    launches: MarketingPromoBundleReconciliationLaunchRow[];
    totals: MarketingPromoBundleReconciliationTotals;
  }): MarketingPromoBundleReconciliationStatus {
    if (productRefs.length === 0) {
      return 'NO_PRODUCT_LINK';
    }

    if (launches.length === 0) {
      return 'NO_LAUNCH';
    }

    if (totals.salesCount === 0 && totals.writeOffCount === 0) {
      return 'NO_SALES';
    }

    if (structure.accounting.writeOffRule === 'MANUAL') {
      return 'MANUAL_REVIEW';
    }

    return 'HAS_FACTS';
  }

  private promoBundleReconciliationWarnings({
    structure,
    productRefs,
    launches,
    totals,
  }: {
    structure: MarketingPromoBundleStructure;
    productRefs: MarketingPromoBundleReconciliationProductRef[];
    launches: MarketingPromoBundleReconciliationLaunchRow[];
    totals: MarketingPromoBundleReconciliationTotals;
  }) {
    const warnings: string[] = [];

    if (productRefs.length === 0) {
      warnings.push('Нет товарной привязки для автоматической сверки продаж.');
    }

    if (launches.length === 0) {
      warnings.push(
        'Нет активного или завершенного запуска для сверки периода.',
      );
    }

    if (productRefs.some((ref) => !ref.productName) && productRefs.length > 0) {
      warnings.push('Часть товарных ID не найдена в текущем ассортименте.');
    }

    if (
      totals.salesCount === 0 &&
      productRefs.length > 0 &&
      launches.length > 0
    ) {
      warnings.push('За период запуска продаж привязанных товаров не найдено.');
    }

    if (
      totals.salesCount > 0 &&
      totals.writeOffCount === 0 &&
      structure.accounting.writeOffRule !== 'MANUAL'
    ) {
      warnings.push(
        'Есть продажи привязанных товаров, но складских списаний за период запуска не найдено.',
      );
    }

    if (totals.writeOffCount > 0 && totals.salesCount === 0) {
      warnings.push(
        'Есть складские списания без продаж привязанных товаров, проверьте период запуска и привязки.',
      );
    }

    if (
      totals.usageProgressPercent !== null &&
      totals.usageProgressPercent > 100
    ) {
      warnings.push(
        'Факт продаж выше лимита использований, нужна ручная проверка.',
      );
    }

    if (structure.accounting.writeOffRule === 'MANUAL') {
      warnings.push('Для набора выбран ручной режим списания.');
    }

    return warnings;
  }

  private ratio(numerator: number, denominator: number) {
    if (denominator <= 0) {
      return null;
    }

    return this.round((numerator / denominator) * 100, 1);
  }

  private async resolveAudienceId(
    user: AuthenticatedUser,
    value?: string | null,
  ) {
    const audienceId = normalizeText(value, 80);

    if (!audienceId) {
      return null;
    }

    const audience = await this.prisma.guestAudience.findFirst({
      where: { id: audienceId, tenantId: user.tenantId },
      select: { id: true },
    });

    if (!audience) {
      throw new BadRequestException('Guest group not found');
    }

    return audience.id;
  }

  private async resolveAudienceRelation(
    user: AuthenticatedUser,
    value?: string | null,
  ): Promise<Prisma.GuestAudienceUpdateOneWithoutMarketingCampaignsNestedInput> {
    const audienceId = await this.resolveAudienceId(user, value);
    return audienceId ? { connect: { id: audienceId } } : { disconnect: true };
  }

  private async resolvePromoBundleLaunchAudienceRelation(
    user: AuthenticatedUser,
    value?: string | null,
  ): Promise<Prisma.GuestAudienceUpdateOneWithoutPromoBundleLaunchesNestedInput> {
    const audienceId = await this.resolveAudienceId(user, value);
    return audienceId ? { connect: { id: audienceId } } : { disconnect: true };
  }

  private async resolveMissionAudienceRelation(
    user: AuthenticatedUser,
    value?: string | null,
  ): Promise<Prisma.GuestAudienceUpdateOneWithoutMarketingMissionsNestedInput> {
    const audienceId = await this.resolveAudienceId(user, value);
    return audienceId ? { connect: { id: audienceId } } : { disconnect: true };
  }

  private async resolveMissionForReward(
    user: AuthenticatedUser,
    value?: string | null,
  ) {
    const missionId = normalizeText(value, 80);

    if (!missionId) {
      throw new BadRequestException('Marketing mission is required');
    }

    const mission = await this.prisma.marketingMission.findFirst({
      where: { id: missionId, tenantId: user.tenantId },
      select: {
        id: true,
        rewardType: true,
        rewardAmount: true,
        rewardLabel: true,
      },
    });

    if (!mission) {
      throw new BadRequestException('Marketing mission not found');
    }

    return mission;
  }

  private async resolveGuestId(
    user: AuthenticatedUser,
    value?: string | null,
    guestExternalIdValue?: string | null,
    externalDomainValue?: string | null,
  ) {
    const guestId = normalizeText(value, 80);

    if (guestId) {
      const guest = await this.prisma.guest.findFirst({
        where: { id: guestId, tenantId: user.tenantId },
        select: { id: true },
      });

      if (!guest) {
        throw new BadRequestException('Guest not found');
      }

      return guest.id;
    }

    const guestExternalId = normalizeText(guestExternalIdValue, 160);

    if (!guestExternalId) {
      return null;
    }

    const externalDomain = normalizeText(externalDomainValue, 160);
    const guest = await this.prisma.guest.findFirst({
      where: {
        tenantId: user.tenantId,
        externalGuestId: guestExternalId,
        ...(externalDomain ? { externalDomain } : {}),
      },
      select: { id: true },
    });

    return guest?.id ?? null;
  }

  private async resolvePromoBundleId(
    user: AuthenticatedUser,
    value?: string | null,
  ) {
    const promoBundleId = normalizeText(value, 80);

    if (!promoBundleId) {
      return null;
    }

    const bundle = await this.prisma.marketingPromoBundle.findFirst({
      where: { id: promoBundleId, tenantId: user.tenantId },
      select: { id: true },
    });

    if (!bundle) {
      throw new BadRequestException('Promo bundle not found');
    }

    return bundle.id;
  }

  private async resolvePromoBundleRelation(
    user: AuthenticatedUser,
    value?: string | null,
  ): Promise<Prisma.MarketingPromoBundleUpdateOneWithoutCampaignsNestedInput> {
    const promoBundleId = await this.resolvePromoBundleId(user, value);
    return promoBundleId
      ? { connect: { id: promoBundleId } }
      : { disconnect: true };
  }

  private async resolveOwnerUserId(
    user: AuthenticatedUser,
    value?: string | null,
  ) {
    const ownerUserId = normalizeText(value, 80);

    if (!ownerUserId) {
      return null;
    }

    const owner = await this.prisma.user.findFirst({
      where: {
        id: ownerUserId,
        tenantId: user.tenantId,
      },
      select: { id: true },
    });

    if (!owner) {
      throw new BadRequestException('Responsible user not found');
    }

    return owner.id;
  }

  private async resolveStoreIds(
    user: AuthenticatedUser,
    value?: string[] | null,
  ) {
    if (!Array.isArray(value)) {
      return [];
    }

    const storeIds = [
      ...new Set(value.map((item) => normalizeText(item, 80))),
    ].filter((item): item is string => Boolean(item));

    if (storeIds.length === 0) {
      return [];
    }

    const stores = await this.prisma.store.findMany({
      where: { tenantId: user.tenantId, id: { in: storeIds }, isActive: true },
      select: { id: true },
    });

    if (stores.length !== storeIds.length) {
      throw new BadRequestException('Store not found');
    }

    return storeIds;
  }

  private async resolveStoreId(user: AuthenticatedUser, value?: string | null) {
    const storeId = normalizeText(value, 80);

    if (!storeId) {
      return null;
    }

    const store = await this.prisma.store.findFirst({
      where: { id: storeId, tenantId: user.tenantId, isActive: true },
      select: { id: true },
    });

    if (!store) {
      throw new BadRequestException('Store not found');
    }

    return store.id;
  }

  private async resolvePromoBundleUsageLaunch(
    user: AuthenticatedUser,
    promoBundleId: string,
    value?: string | null,
    storeId?: string | null,
    usedAt: Date = new Date(),
  ): Promise<MarketingPromoBundleUsageLaunchMatch | null> {
    const launchId = normalizeText(value, 80);

    if (!launchId) {
      return this.findPromoBundleUsageLaunch(
        user,
        promoBundleId,
        storeId,
        usedAt,
      );
    }

    const launch = await this.prisma.marketingPromoBundleLaunch.findFirst({
      where: { id: launchId, tenantId: user.tenantId },
      select: { id: true, promoBundleId: true, storeIds: true },
    });

    if (!launch) {
      throw new BadRequestException('Promo bundle launch not found');
    }

    if (launch.promoBundleId !== promoBundleId) {
      throw new BadRequestException(
        'Promo bundle launch belongs to another bundle',
      );
    }

    return {
      id: launch.id,
      storeIds: parseStringArray(launch.storeIds),
    };
  }

  private async findPromoBundleUsageLaunch(
    user: AuthenticatedUser,
    promoBundleId: string,
    storeId: string | null | undefined,
    usedAt: Date,
  ): Promise<MarketingPromoBundleUsageLaunchMatch | null> {
    const candidates = await this.prisma.marketingPromoBundleLaunch.findMany({
      where: {
        tenantId: user.tenantId,
        promoBundleId,
        status: 'ACTIVE',
        OR: [{ periodFrom: null }, { periodFrom: { lte: usedAt } }],
        AND: [
          {
            OR: [{ periodTo: null }, { periodTo: { gte: startOfDay(usedAt) } }],
          },
        ],
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 20,
      select: { id: true, storeIds: true },
    });

    const scopedCandidates = candidates
      .map((launch) => ({
        id: launch.id,
        storeIds: parseStringArray(launch.storeIds),
      }))
      .filter(
        (launch) =>
          !storeId ||
          launch.storeIds.length === 0 ||
          launch.storeIds.includes(storeId),
      );

    if (storeId) {
      return scopedCandidates[0] ?? null;
    }

    return (
      scopedCandidates.find((launch) => launch.storeIds.length === 0) ??
      (scopedCandidates.length === 1 ? scopedCandidates[0] : null)
    );
  }

  private validatePromoBundleUsageStoreScope(
    launchStoreIds: string[] | undefined,
    storeId: string | null,
  ) {
    if (
      storeId &&
      launchStoreIds &&
      launchStoreIds.length > 0 &&
      !launchStoreIds.includes(storeId)
    ) {
      throw new BadRequestException(
        'Store is outside selected promo bundle launch scope',
      );
    }
  }

  private async resolveOwnerUserRelation(
    user: AuthenticatedUser,
    value?: string | null,
  ): Promise<Prisma.UserUpdateOneWithoutOwnedMarketingCampaignsNestedInput> {
    const ownerUserId = await this.resolveOwnerUserId(user, value);
    return ownerUserId
      ? { connect: { id: ownerUserId } }
      : { disconnect: true };
  }

  private defaultCampaignName(
    goal: MarketingCampaignGoal,
    scope: string | null,
  ) {
    const labels: Record<MarketingCampaignGoal, string> = {
      RETURN_GUESTS: 'Вернуть гостей',
      REPEAT_VISIT: 'Повторный визит',
      WEAK_HOURS: 'Тихие часы',
      BAR_GROWTH: 'Рост бара',
      EVENT_PROMO: 'Событие или бронь',
      PROMO_BUNDLE: 'Промо-набор',
    };

    return scope ? `${labels[goal]} для ${scope}` : labels[goal];
  }

  private async getConsentCoverageByCampaign(
    tenantId: string,
    rows: MarketingCampaignRow[],
  ) {
    const result = new Map<string, MarketingCampaignConsentCoverage>();

    await Promise.all(
      rows.map(async (row) => {
        result.set(
          row.id,
          await this.getCampaignConsentCoverage(
            tenantId,
            row.audienceId,
            row.channel,
          ),
        );
      }),
    );

    return result;
  }

  private async getCampaignConsentCoverage(
    tenantId: string,
    audienceId: string | null,
    channel: string | null,
  ): Promise<MarketingCampaignConsentCoverage> {
    const channelPolicy = campaignChannelPolicy(channel);
    const requiresPhoneConsent = channelPolicy.requiresPhoneConsent;

    if (!audienceId) {
      return {
        targetTotal: 0,
        phoneGranted: 0,
        phoneDenied: 0,
        phoneUnsubscribed: 0,
        phoneUnknown: 0,
        contactable: 0,
        excluded: 0,
        requiresPhoneConsent,
        channelKind: channelPolicy.kind,
        channelLabel: channelPolicy.label,
        requiredConsent: channelPolicy.requiredConsent,
        contactRule: channelPolicy.contactRule,
        exclusionReason: channelPolicy.exclusionReason,
      };
    }

    const [targetTotal, groupedGuests] = await Promise.all([
      this.prisma.guestAudienceMember.count({
        where: { tenantId, audienceId },
      }),
      this.prisma.guest.groupBy({
        by: ['phoneConsentStatus'],
        where: {
          tenantId,
          audienceMembers: { some: { audienceId } },
        },
        _count: { _all: true },
      }),
    ]);

    const counts = new Map(
      groupedGuests.map((group) => [
        group.phoneConsentStatus,
        group._count._all,
      ]),
    );
    const linkedGuests = [...counts.values()].reduce(
      (sum, count) => sum + count,
      0,
    );
    const unknown =
      (counts.get(GuestCommunicationConsentStatus.UNKNOWN) ?? 0) +
      Math.max(0, targetTotal - linkedGuests);
    const granted = counts.get(GuestCommunicationConsentStatus.GRANTED) ?? 0;
    const denied = counts.get(GuestCommunicationConsentStatus.DENIED) ?? 0;
    const unsubscribed =
      counts.get(GuestCommunicationConsentStatus.UNSUBSCRIBED) ?? 0;

    return {
      targetTotal,
      phoneGranted: granted,
      phoneDenied: denied,
      phoneUnsubscribed: unsubscribed,
      phoneUnknown: unknown,
      contactable: requiresPhoneConsent ? granted : targetTotal,
      excluded: requiresPhoneConsent ? targetTotal - granted : 0,
      requiresPhoneConsent,
      channelKind: channelPolicy.kind,
      channelLabel: channelPolicy.label,
      requiredConsent: channelPolicy.requiredConsent,
      contactRule: channelPolicy.contactRule,
      exclusionReason:
        requiresPhoneConsent && targetTotal - granted > 0
          ? channelPolicy.exclusionReason
          : null,
    };
  }

  private async getCampaignContactEventsForExport(
    tenantId: string,
    campaignId: string,
    audienceId: string | null,
  ): Promise<MarketingCampaignExportContactEvent[]> {
    return this.prisma.guestCrmContactEvent.findMany({
      where: {
        tenantId,
        OR: [
          { marketingCampaignId: campaignId },
          ...(audienceId ? [{ audienceId }] : []),
        ],
      },
      orderBy: [{ contactedAt: 'desc' }, { createdAt: 'desc' }],
      take: 5000,
      select: {
        id: true,
        channel: true,
        result: true,
        note: true,
        contactedAt: true,
        marketingCampaignId: true,
        audience: { select: { name: true } },
        guest: {
          select: {
            externalDomain: true,
            externalGuestId: true,
            fullNameMasked: true,
            phoneMasked: true,
            emailMasked: true,
          },
        },
        lead: {
          select: {
            fullNameMasked: true,
            phoneMasked: true,
            emailMasked: true,
            matchedGuestId: true,
          },
        },
        createdByUser: { select: { fullName: true, email: true } },
      },
    });
  }

  private effectPeriodCsvRow(
    title: string,
    period: MarketingCampaignEffectPeriod,
  ): CsvCell[] {
    return [
      'Периоды',
      `${title}: ${this.formatExportDate(period.from)} - ${this.formatExportDate(
        period.to,
      )}`,
      period.contacts,
      period.activeGuests,
      period.repeatGuests,
      period.sessionsCount,
      period.playHours,
      period.totalRevenue,
      period.barRevenue,
    ];
  }

  private executionCsvRow(
    section: string,
    row: MarketingCampaignExecutionBreakdownRow,
  ): CsvCell[] {
    return [
      section,
      row.label,
      row.metrics.contacts,
      row.metrics.respondedContacts,
      row.metrics.linkedGuests,
      row.metrics.activeGuests,
      row.metrics.repeatGuests,
      row.metrics.totalRevenue,
      row.metrics.barRevenue,
    ];
  }

  private guestExportLabel(
    guest: MarketingCampaignExportContactEvent['guest'],
  ) {
    if (!guest) {
      return null;
    }

    return (
      guest.fullNameMasked ??
      guest.phoneMasked ??
      guest.emailMasked ??
      [guest.externalDomain, guest.externalGuestId].filter(Boolean).join(' / ')
    );
  }

  private leadExportLabel(lead: MarketingCampaignExportContactEvent['lead']) {
    if (!lead) {
      return null;
    }

    return (
      lead.fullNameMasked ??
      lead.phoneMasked ??
      lead.emailMasked ??
      lead.matchedGuestId ??
      'CRM-лид'
    );
  }

  private isWithinEffectWindow(value: Date, from: string, to: string) {
    const timestamp = value.getTime();

    return (
      timestamp >= new Date(from).getTime() &&
      timestamp < new Date(to).getTime()
    );
  }

  private formatExportDate(value: string | null) {
    if (!value) {
      return null;
    }

    return new Intl.DateTimeFormat('ru-RU').format(new Date(value));
  }

  private formatExportDateTime(value: Date | string | null) {
    if (!value) {
      return null;
    }

    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }

  private formatExportPercent(value: number | null) {
    if (value === null) {
      return null;
    }

    return `${this.round(value, 1)}%`;
  }

  private async buildCampaignExportXlsx(rows: CsvCell[][]) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'LeetPlus';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Campaign');
    worksheet.columns = [
      { key: 'section', width: 20 },
      { key: 'metric', width: 34 },
      { key: 'value', width: 24 },
      { key: 'comment', width: 42 },
      { key: 'extra1', width: 20 },
      { key: 'extra2', width: 20 },
      { key: 'extra3', width: 18 },
      { key: 'extra4', width: 20 },
      { key: 'extra5', width: 20 },
      { key: 'extra6', width: 22 },
      { key: 'extra7', width: 38 },
    ];

    rows.forEach((row, index) => {
      const excelRow = worksheet.addRow(row.map((cell) => cell ?? ''));
      const previousRow = rows[index - 1];
      const isHeader =
        row.length > 0 &&
        (index === 0 || Boolean(previousRow && previousRow.length === 0));

      if (isHeader && typeof row[0] === 'string') {
        excelRow.font = { bold: true };
        excelRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE5E7EB' },
        };
      }
    });

    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.eachRow((row) => {
      row.alignment = { vertical: 'top', wrapText: true };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private toCsv(rows: CsvCell[][]) {
    return `\uFEFF${rows.map((row) => this.csvRow(row)).join('\n')}`;
  }

  private csvRow(row: CsvCell[]) {
    return row.map((cell) => this.csvCell(cell)).join(';');
  }

  private csvCell(cell: CsvCell) {
    const value = cell === null ? '' : String(cell);

    return `"${value.replaceAll('"', '""')}"`;
  }

  private async getMissionRewardSummaries(
    tenantId: string,
    missionIds: string[],
  ) {
    const summaries = new Map<string, MarketingMissionRewardSummary>();

    missionIds.forEach((missionId) => {
      summaries.set(missionId, emptyMissionRewardSummary());
    });

    if (missionIds.length === 0) {
      return summaries;
    }

    const groups = await this.prisma.marketingMissionReward.groupBy({
      by: ['missionId', 'status'],
      where: { tenantId, missionId: { in: missionIds } },
      _count: { _all: true },
      _sum: { rewardAmount: true },
    });

    groups.forEach((group) => {
      const status = resolveMissionRewardStatus(group.status);
      const summary =
        summaries.get(group.missionId) ?? emptyMissionRewardSummary();
      const count = group._count._all;
      const amount = group._sum.rewardAmount?.toNumber() ?? 0;

      summary.total += count;

      if (status === 'PENDING') {
        summary.pending += count;
      } else if (status === 'APPROVED') {
        summary.approved += count;
        summary.approvedAmount += amount;
      } else if (status === 'PAID') {
        summary.paid += count;
        summary.paidAmount += amount;
      } else if (status === 'CANCELED') {
        summary.canceled += count;
      }

      summaries.set(group.missionId, summary);
    });

    return summaries;
  }

  private resolveExportFormat(
    format: string | null | undefined,
  ): MarketingCampaignExportFormat {
    if (!format || format === 'csv') {
      return 'csv';
    }

    if (format === 'xlsx') {
      return 'xlsx';
    }

    throw new BadRequestException('format must be csv or xlsx');
  }

  private toMarketingCampaign(
    row: MarketingCampaignRow,
    coverage?: MarketingCampaignConsentCoverage,
  ): MarketingCampaign {
    return {
      id: row.id,
      goal: resolveGoal(row.goal),
      name: row.name,
      status: resolveStatus(row.status),
      channel: row.channel,
      mechanic: row.mechanic,
      mechanicConfig: row.mechanicConfig ?? null,
      periodFrom: row.periodFrom?.toISOString() ?? null,
      periodTo: row.periodTo?.toISOString() ?? null,
      dueAt: row.dueAt?.toISOString() ?? null,
      budget: row.budget ? Number(row.budget) : null,
      note: row.note,
      storeIds: parseStringArray(row.storeIds),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      promoBundleId: row.promoBundleId,
      audience: row.audience
        ? {
            id: row.audience.id,
            name: row.audience.name,
            guestsCount: row.audience.guestsCount,
          }
        : null,
      promoBundle: row.promoBundle
        ? {
            id: row.promoBundle.id,
            name: row.promoBundle.name,
            status: row.promoBundle.status,
            bundleType: row.promoBundle.bundleType,
          }
        : null,
      crmTask: row.crmTask
        ? {
            id: row.crmTask.id,
            title: row.crmTask.title,
            status: row.crmTask.status,
            dueAt: row.crmTask.dueAt?.toISOString() ?? null,
          }
        : null,
      consentCoverage: coverage ?? emptyConsentCoverage(row.channel),
      createdBy: row.createdByUser ? toUserSummary(row.createdByUser) : null,
      owner: row.ownerUser ? toUserSummary(row.ownerUser) : null,
    };
  }

  private toMarketingPromoBundle(
    row: MarketingPromoBundleRow,
  ): MarketingPromoBundle {
    return {
      id: row.id,
      name: row.name,
      status: resolvePromoBundleStatus(row.status),
      bundleType: row.bundleType,
      structure: buildPromoBundleStructure(row.bundleType, row.mechanicConfig),
      mechanicConfig: row.mechanicConfig,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdByUser ? toUserSummary(row.createdByUser) : null,
    };
  }

  private toMarketingPromoBundleLaunch(
    row: MarketingPromoBundleLaunchRow,
  ): MarketingPromoBundleLaunch {
    return {
      id: row.id,
      status: resolvePromoBundleLaunchStatus(row.status),
      audience: row.audience
        ? {
            id: row.audience.id,
            name: row.audience.name,
            description: row.audience.description,
            guestsCount: row.audience.guestsCount,
          }
        : null,
      storeIds: parseStringArray(row.storeIds),
      periodFrom: row.periodFrom?.toISOString() ?? null,
      periodTo: row.periodTo?.toISOString() ?? null,
      maxUses: row.maxUses,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      promoBundle: {
        id: row.promoBundle.id,
        name: row.promoBundle.name,
        status: resolvePromoBundleStatus(row.promoBundle.status),
        bundleType: row.promoBundle.bundleType,
        structure: buildPromoBundleStructure(
          row.promoBundle.bundleType,
          row.promoBundle.mechanicConfig,
        ),
        mechanicConfig: row.promoBundle.mechanicConfig,
        note: row.promoBundle.note,
      },
      createdBy: row.createdByUser ? toUserSummary(row.createdByUser) : null,
    };
  }

  private toMarketingPromoBundleUsage(
    row: MarketingPromoBundleUsageRow,
  ): MarketingPromoBundleUsage {
    const amount = row.amount.toNumber();
    const costAmount = row.costAmount?.toNumber() ?? null;

    return {
      id: row.id,
      status: resolvePromoBundleUsageStatus(row.status),
      source: resolvePromoBundleUsageSource(row.source),
      externalProvider: row.externalProvider ?? null,
      externalDomain: row.externalDomain,
      externalId: row.externalId,
      guestExternalId: row.guestExternalId,
      receiptExternalId: row.receiptExternalId,
      usedAt: row.usedAt.toISOString(),
      quantity: row.quantity,
      amount,
      costAmount,
      grossProfit:
        costAmount === null ? null : this.round(amount - costAmount, 2),
      note: row.note,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      promoBundle: {
        id: row.promoBundle.id,
        name: row.promoBundle.name,
        status: resolvePromoBundleStatus(row.promoBundle.status),
        bundleType: row.promoBundle.bundleType,
      },
      launch: row.launch
        ? {
            id: row.launch.id,
            status: resolvePromoBundleLaunchStatus(row.launch.status),
            audience: row.launch.audience
              ? {
                  id: row.launch.audience.id,
                  name: row.launch.audience.name,
                  guestsCount: row.launch.audience.guestsCount,
                }
              : null,
            storeIds: parseStringArray(row.launch.storeIds),
            periodFrom: row.launch.periodFrom?.toISOString() ?? null,
            periodTo: row.launch.periodTo?.toISOString() ?? null,
            maxUses: row.launch.maxUses,
          }
        : null,
      store: row.store ? { id: row.store.id, name: row.store.name } : null,
      createdBy: row.createdByUser ? toUserSummary(row.createdByUser) : null,
    };
  }

  private toMarketingMission(
    row: MarketingMissionRow,
    summary: MarketingMissionRewardSummary = emptyMissionRewardSummary(),
  ): MarketingMission {
    return {
      id: row.id,
      name: row.name,
      status: resolveMissionStatus(row.status),
      missionType: resolveMissionType(row.missionType),
      triggerKind: resolveMissionTriggerKind(row.triggerKind),
      rewardType: resolveMissionRewardType(row.rewardType),
      rewardAmount: row.rewardAmount ? row.rewardAmount.toNumber() : null,
      rewardLabel: row.rewardLabel,
      conditions: row.conditions,
      storeIds: parseStringArray(row.storeIds),
      periodFrom: row.periodFrom?.toISOString() ?? null,
      periodTo: row.periodTo?.toISOString() ?? null,
      budgetAmount: row.budgetAmount ? row.budgetAmount.toNumber() : null,
      perGuestLimit: row.perGuestLimit,
      totalRewardLimit: row.totalRewardLimit,
      antiFraudRules: row.antiFraudRules ?? null,
      manualApprovalRequired: row.manualApprovalRequired,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      audience: row.audience
        ? {
            id: row.audience.id,
            name: row.audience.name,
            description: row.audience.description,
            guestsCount: row.audience.guestsCount,
          }
        : null,
      rewardSummary: summary,
      createdBy: row.createdByUser ? toUserSummary(row.createdByUser) : null,
    };
  }

  private toMarketingMissionReward(
    row: MarketingMissionRewardRow,
  ): MarketingMissionReward {
    return {
      id: row.id,
      status: resolveMissionRewardStatus(row.status),
      source: resolveMissionRewardSource(row.source),
      externalProvider: row.externalProvider ?? null,
      externalDomain: row.externalDomain,
      externalId: row.externalId,
      guestExternalId: row.guestExternalId,
      qualifiedAt: row.qualifiedAt.toISOString(),
      rewardAmount: row.rewardAmount.toNumber(),
      rewardLabel: row.rewardLabel,
      note: row.note,
      evidence: row.evidence ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      mission: {
        id: row.mission.id,
        name: row.mission.name,
        status: resolveMissionStatus(row.mission.status),
        missionType: resolveMissionType(row.mission.missionType),
        rewardType: resolveMissionRewardType(row.mission.rewardType),
        rewardLabel: row.mission.rewardLabel,
      },
      guest: row.guest
        ? {
            id: row.guest.id,
            externalDomain: row.guest.externalDomain,
            externalGuestId: row.guest.externalGuestId,
            displayName:
              row.guest.fullNameMasked ??
              row.guest.phoneMasked ??
              row.guest.emailMasked ??
              row.guest.externalGuestId,
            phoneMasked: row.guest.phoneMasked,
            emailMasked: row.guest.emailMasked,
          }
        : null,
      store: row.store ? { id: row.store.id, name: row.store.name } : null,
      createdBy: row.createdByUser ? toUserSummary(row.createdByUser) : null,
      approvedBy: row.approvedByUser ? toUserSummary(row.approvedByUser) : null,
    };
  }
}

function normalizeText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function requireText(value: unknown, label: string, maxLength: number) {
  const text = normalizeText(value, maxLength);

  if (!text) {
    throw new BadRequestException(`${label} is required`);
  }

  return text;
}

function normalizeMechanicConfig(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) {
    return Prisma.JsonNull;
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('Mechanic config must be an object');
  }

  try {
    const json = JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
    const serialized = JSON.stringify(json);

    if (serialized.length > 8000) {
      throw new BadRequestException('Mechanic config is too large');
    }

    return json;
  } catch (error) {
    if (error instanceof BadRequestException) {
      throw error;
    }

    throw new BadRequestException('Mechanic config must be valid JSON');
  }
}

function normalizePromoBundleConfig(value: unknown): Prisma.InputJsonValue {
  const config = normalizeMechanicConfig(value);

  if (config === Prisma.JsonNull) {
    throw new BadRequestException('Promo bundle config is required');
  }

  const normalizedConfig = config as Prisma.InputJsonValue;

  if (getStringField(normalizedConfig, 'kind') !== 'promo_bundle') {
    throw new BadRequestException('Promo bundle config must be a promo bundle');
  }

  return normalizedConfig;
}

function normalizeOptionalJsonValue(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) {
    return Prisma.JsonNull;
  }

  try {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  } catch {
    throw new BadRequestException('Source payload must be JSON serializable');
  }
}

function normalizeMissionConfig(
  value: unknown,
  fallback: Prisma.InputJsonValue,
  label: string,
): Prisma.InputJsonValue {
  const source = value === null || value === undefined ? fallback : value;

  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new BadRequestException(`${label} must be an object`);
  }

  try {
    const json = JSON.parse(JSON.stringify(source)) as Prisma.InputJsonValue;
    const serialized = JSON.stringify(json);

    if (serialized.length > 8000) {
      throw new BadRequestException(`${label} is too large`);
    }

    return json;
  } catch (error) {
    if (error instanceof BadRequestException) {
      throw error;
    }

    throw new BadRequestException(`${label} must be valid JSON`);
  }
}

function resolveGoal(value: unknown): MarketingCampaignGoal {
  if (campaignGoals.includes(value as MarketingCampaignGoal)) {
    return value as MarketingCampaignGoal;
  }

  return 'RETURN_GUESTS';
}

function resolveStatus(value: unknown): MarketingCampaignStatus {
  if (campaignStatuses.includes(value as MarketingCampaignStatus)) {
    return value as MarketingCampaignStatus;
  }

  return 'DRAFT';
}

function resolvePromoBundleStatus(value: unknown): MarketingPromoBundleStatus {
  if (promoBundleStatuses.includes(value as MarketingPromoBundleStatus)) {
    return value as MarketingPromoBundleStatus;
  }

  return 'ACTIVE';
}

function resolvePromoBundleLaunchStatus(
  value: unknown,
): MarketingPromoBundleLaunchStatus {
  if (
    promoBundleLaunchStatuses.includes(
      value as MarketingPromoBundleLaunchStatus,
    )
  ) {
    return value as MarketingPromoBundleLaunchStatus;
  }

  return 'ACTIVE';
}

function resolvePromoBundleUsageStatus(
  value: unknown,
): MarketingPromoBundleUsageStatus {
  if (
    promoBundleUsageStatuses.includes(value as MarketingPromoBundleUsageStatus)
  ) {
    return value as MarketingPromoBundleUsageStatus;
  }

  return 'CONFIRMED';
}

function resolvePromoBundleUsageSource(
  value: unknown,
  fallback: MarketingPromoBundleUsageSource = 'MANUAL',
): MarketingPromoBundleUsageSource {
  if (
    promoBundleUsageSources.includes(value as MarketingPromoBundleUsageSource)
  ) {
    return value as MarketingPromoBundleUsageSource;
  }

  return fallback;
}

function resolveMissionStatus(value: unknown): MarketingMissionStatus {
  if (missionStatuses.includes(value as MarketingMissionStatus)) {
    return value as MarketingMissionStatus;
  }

  return 'DRAFT';
}

function resolveMissionType(value: unknown): MarketingMissionType {
  if (missionTypes.includes(value as MarketingMissionType)) {
    return value as MarketingMissionType;
  }

  return 'CUSTOM';
}

function resolveMissionTriggerKind(
  value: unknown,
): MarketingMissionTriggerKind {
  if (missionTriggerKinds.includes(value as MarketingMissionTriggerKind)) {
    return value as MarketingMissionTriggerKind;
  }

  return 'MANUAL';
}

function resolveMissionRewardType(value: unknown): MarketingMissionRewardType {
  if (missionRewardTypes.includes(value as MarketingMissionRewardType)) {
    return value as MarketingMissionRewardType;
  }

  return 'BONUS';
}

function resolveMissionRewardStatus(
  value: unknown,
): MarketingMissionRewardStatus {
  if (missionRewardStatuses.includes(value as MarketingMissionRewardStatus)) {
    return value as MarketingMissionRewardStatus;
  }

  return 'PENDING';
}

function resolveMissionRewardSource(
  value: unknown,
  fallback: MarketingMissionRewardSource = 'MANUAL',
): MarketingMissionRewardSource {
  if (missionRewardSources.includes(value as MarketingMissionRewardSource)) {
    return value as MarketingMissionRewardSource;
  }

  return fallback;
}

function resolveIntegrationProvider(value: unknown) {
  if (value === IntegrationProvider.LANGAME) {
    return IntegrationProvider.LANGAME;
  }

  return null;
}

function promoBundleReconciliationLabel(
  status: MarketingPromoBundleReconciliationStatus,
) {
  const labels: Record<MarketingPromoBundleReconciliationStatus, string> = {
    NO_LAUNCH: 'нет запуска',
    NO_PRODUCT_LINK: 'нет товарной привязки',
    NO_SALES: 'фактов нет',
    HAS_FACTS: 'есть факты',
    MANUAL_REVIEW: 'ручная сверка',
  };

  return labels[status];
}

function promoBundleLaunchFactWindow(
  launch: Pick<
    MarketingPromoBundleReconciliationLaunchRow,
    'createdAt' | 'periodFrom' | 'periodTo'
  >,
) {
  const from = launch.periodFrom ?? launch.createdAt;
  const to = launch.periodTo
    ? endOfDay(launch.periodTo)
    : new Date(Math.max(Date.now(), from.getTime() + DAY_MS));

  return {
    from,
    to: to.getTime() > from.getTime() ? to : new Date(from.getTime() + DAY_MS),
  };
}

function endOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getStringField(value: unknown, field: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const fieldValue = (value as Record<string, unknown>)[field];
  return typeof fieldValue === 'string' ? fieldValue : null;
}

function getRecordField(value: unknown, field: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const fieldValue = (value as Record<string, unknown>)[field];

  if (
    !fieldValue ||
    typeof fieldValue !== 'object' ||
    Array.isArray(fieldValue)
  ) {
    return null;
  }

  return fieldValue as Record<string, unknown>;
}

function getNumberField(value: unknown, field: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const fieldValue = (value as Record<string, unknown>)[field];
  const number =
    typeof fieldValue === 'number'
      ? fieldValue
      : typeof fieldValue === 'string'
        ? Number(fieldValue.replace(',', '.').trim())
        : Number.NaN;

  return Number.isFinite(number) ? number : null;
}

function getBooleanField(value: unknown, field: string, fallback: boolean) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fallback;
  }

  const fieldValue = (value as Record<string, unknown>)[field];
  return typeof fieldValue === 'boolean' ? fieldValue : fallback;
}

type PromoBundleAccountingKind = 'PRODUCT' | 'SERVICE' | 'BONUS' | 'MANUAL';
type PromoBundleWriteOffRule = 'ON_REDEEM' | 'ON_SALE' | 'MANUAL';

function normalizeAccountingKind(
  value: unknown,
  fallback: PromoBundleAccountingKind,
): PromoBundleAccountingKind {
  return value === 'PRODUCT' ||
    value === 'SERVICE' ||
    value === 'BONUS' ||
    value === 'MANUAL'
    ? value
    : fallback;
}

function normalizeAccountingRef(
  value: Record<string, unknown> | null,
  fallbackKind: PromoBundleAccountingKind,
) {
  const kind = normalizeAccountingKind(value?.kind, fallbackKind);
  const productId = normalizeText(value?.productId, 80);
  const reference = normalizeText(value?.reference, 160);
  const label = normalizeText(value?.label, 220);

  return {
    kind,
    productId,
    reference,
    label:
      label ??
      (kind === 'PRODUCT'
        ? productId
          ? `товар ${productId}`
          : 'товар не выбран'
        : (reference ?? accountingKindLabel(kind))),
  };
}

function normalizeWriteOffRule(value: unknown): PromoBundleWriteOffRule {
  return value === 'ON_SALE' || value === 'MANUAL' || value === 'ON_REDEEM'
    ? value
    : 'ON_REDEEM';
}

function accountingRefReady(ref: {
  kind: PromoBundleAccountingKind;
  productId: string | null;
  reference: string | null;
}) {
  return ref.kind === 'PRODUCT'
    ? Boolean(ref.productId)
    : Boolean(ref.reference);
}

function accountingKindLabel(kind: PromoBundleAccountingKind) {
  const labels: Record<PromoBundleAccountingKind, string> = {
    PRODUCT: 'товар из ассортимента',
    SERVICE: 'услуга / игровое время',
    BONUS: 'бонусная операция',
    MANUAL: 'ручной учет',
  };

  return labels[kind];
}

function writeOffRuleLabel(rule: PromoBundleWriteOffRule) {
  const labels: Record<PromoBundleWriteOffRule, string> = {
    ON_REDEEM: 'списать при использовании',
    ON_SALE: 'списать при продаже',
    MANUAL: 'ручная сверка',
  };

  return labels[rule];
}

function promoBundleTypeLabel(type: string) {
  const labels: Record<string, string> = {
    game_product: 'игра + товар',
    game_bonus: 'игра + бонусы',
    product_product: 'товар + товар',
    balance_bonus: 'пополнение + бонусы',
  };

  return labels[type] ?? type;
}

function promoBundlePartLabels(type: string) {
  const labels: Record<
    string,
    { firstLabel: string; secondLabel: string; typeLabel: string }
  > = {
    game_product: {
      typeLabel: 'Игровое время + товар',
      firstLabel: 'Игровое время',
      secondLabel: 'Товар',
    },
    game_bonus: {
      typeLabel: 'Игровое время + бонусы',
      firstLabel: 'Игровое время',
      secondLabel: 'Бонусы',
    },
    product_product: {
      typeLabel: 'Товар + товар',
      firstLabel: 'Первый товар',
      secondLabel: 'Второй товар',
    },
    balance_bonus: {
      typeLabel: 'Пополнение баланса + бонусы',
      firstLabel: 'Пополнение',
      secondLabel: 'Бонусы',
    },
  };

  return (
    labels[type] ?? {
      typeLabel: promoBundleTypeLabel(type),
      firstLabel: 'Первая часть',
      secondLabel: 'Вторая часть',
    }
  );
}

function buildPromoBundleStructure(
  bundleTypeValue: string,
  mechanicConfig: Prisma.JsonValue,
): MarketingPromoBundleStructure {
  const config =
    mechanicConfig &&
    typeof mechanicConfig === 'object' &&
    !Array.isArray(mechanicConfig)
      ? (mechanicConfig as Record<string, unknown>)
      : {};
  const bundleType = getStringField(config, 'bundleType') ?? bundleTypeValue;
  const labels = promoBundlePartLabels(bundleType);
  const composition = getRecordField(config, 'composition');
  const bundle = getRecordField(config, 'bundle');
  const economics = getRecordField(config, 'economics');
  const accounting = getRecordField(config, 'accounting');
  const conditions = getRecordField(config, 'conditions');
  const firstRef = normalizeAccountingRef(
    getRecordField(accounting, 'first'),
    bundleType === 'product_product' ? 'PRODUCT' : 'SERVICE',
  );
  const secondRef = normalizeAccountingRef(
    getRecordField(accounting, 'second'),
    bundleType === 'game_product' || bundleType === 'product_product'
      ? 'PRODUCT'
      : 'BONUS',
  );
  const writeOffRule = normalizeWriteOffRule(
    getStringField(accounting, 'writeOffRule'),
  );
  const accountingNote = normalizeText(accounting?.note, 300);
  const tariffGroupId = normalizeText(
    conditions?.tariffGroupId ?? config.tariffGroupId,
    160,
  );
  const tariffPeriodId = normalizeText(
    conditions?.tariffPeriodId ?? config.tariffPeriodId,
    160,
  );
  const tariffTypeId = normalizeText(
    conditions?.tariffTypeId ?? config.tariffTypeId,
    160,
  );
  const tariffSummary =
    normalizeText(conditions?.tariffSummary, 300) ??
    promoBundleTariffSummaryFromIds({
      tariffGroupId,
      tariffPeriodId,
      tariffTypeId,
    });
  const firstItem = normalizeText(composition?.first, 160);
  const secondItem = normalizeText(composition?.second, 160);
  const extraCondition = normalizeText(composition?.extraCondition, 180);
  const gamePrice = Math.max(0, getNumberField(bundle, 'gamePrice') ?? 0);
  const barPrice = Math.max(0, getNumberField(bundle, 'barPrice') ?? 0);
  const servicePrice = Math.max(0, getNumberField(bundle, 'servicePrice') ?? 0);
  const discount = Math.max(0, getNumberField(bundle, 'discount') ?? 0);
  const costPerUse = Math.max(0, getNumberField(bundle, 'cost') ?? 0);
  const expectedUses = Math.max(
    0,
    Math.round(getNumberField(bundle, 'expectedUses') ?? 0),
  );
  const minSpend = Math.max(0, getNumberField(bundle, 'minSpend') ?? 0);
  const validityDays = Math.max(
    0,
    Math.round(getNumberField(bundle, 'validityDays') ?? 0),
  );
  const basePrice =
    getNumberField(economics, 'basePrice') ??
    gamePrice + barPrice + servicePrice;
  const promoPrice =
    getNumberField(economics, 'promoPrice') ??
    Math.max(0, basePrice - discount);
  const expectedRevenue =
    getNumberField(economics, 'revenue') ?? promoPrice * expectedUses;
  const expectedCost =
    getNumberField(economics, 'cost') ?? costPerUse * expectedUses;
  const margin =
    getNumberField(economics, 'margin') ?? expectedRevenue - expectedCost;
  const marginPercent =
    getNumberField(economics, 'marginPercent') ??
    (expectedRevenue > 0 ? (margin / expectedRevenue) * 100 : null);
  const missingFields = [
    firstItem ? null : labels.firstLabel,
    secondItem ? null : labels.secondLabel,
    basePrice > 0 && promoPrice > 0 ? null : 'цена набора',
    expectedUses > 0 ? null : 'лимит использований',
    costPerUse > 0 ? null : 'себестоимость',
    accountingRefReady(firstRef) ? null : `${labels.firstLabel} в учете`,
    accountingRefReady(secondRef) ? null : `${labels.secondLabel} в учете`,
  ].filter((item): item is string => Boolean(item));
  const readiness =
    !firstItem || !secondItem
      ? 'NEEDS_COMPOSITION'
      : basePrice <= 0 ||
          promoPrice <= 0 ||
          expectedUses <= 0 ||
          costPerUse <= 0
        ? 'NEEDS_ECONOMICS'
        : !accountingRefReady(firstRef) || !accountingRefReady(secondRef)
          ? 'NEEDS_ACCOUNTING'
          : 'READY';
  const readinessLabel =
    readiness === 'READY'
      ? 'готов к ручному учету'
      : readiness === 'NEEDS_COMPOSITION'
        ? 'нужно уточнить состав'
        : readiness === 'NEEDS_ECONOMICS'
          ? 'нужно уточнить экономику'
          : 'нужно уточнить учет';

  return {
    composition: {
      typeLabel: labels.typeLabel,
      firstLabel: labels.firstLabel,
      firstItem,
      secondLabel: labels.secondLabel,
      secondItem,
      extraCondition,
      summary:
        [firstItem, secondItem].filter(Boolean).join(' + ') ||
        'состав не задан',
    },
    pricing: {
      basePrice,
      promoPrice,
      discount,
      costPerUse,
      expectedRevenue,
      expectedCost,
      margin,
      marginPercent,
    },
    limits: {
      expectedUses,
      minSpend,
      validityDays,
      onePerGuest: getBooleanField(bundle, 'onePerGuest', true),
      requiresApproval: getBooleanField(bundle, 'requiresApproval', true),
      noStacking: getBooleanField(bundle, 'noStacking', true),
    },
    conditions: {
      tariffGroupId,
      tariffPeriodId,
      tariffTypeId,
      tariffSummary,
    },
    accounting: {
      readiness,
      label: readinessLabel,
      missingFields,
      nextFields: [
        'ID товара или услуги для первой части',
        'ID товара, услуги или бонусной операции для второй части',
        'правило списания себестоимости при использовании набора',
      ],
      firstRef,
      secondRef,
      writeOffRule,
      writeOffLabel: writeOffRuleLabel(writeOffRule),
      note: accountingNote,
    },
  };
}

function marketingTariffConditionItems(
  rows: MarketingTariffSnapshotRow[],
  endpointKey: MarketingTariffConditionEndpointKey,
) {
  const seen = new Set<string>();
  const items: MarketingTariffConditionItem[] = [];

  for (const row of rows) {
    if (row.endpointKey !== endpointKey) {
      continue;
    }

    const value = row.externalId ?? row.id;
    const key = `${endpointKey}:${value}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    items.push(toMarketingTariffConditionItem(row, value));

    if (items.length >= 80) {
      break;
    }
  }

  return items;
}

function toMarketingTariffConditionItem(
  row: MarketingTariffSnapshotRow,
  value: string,
): MarketingTariffConditionItem {
  const displayName = marketingTariffDisplayName(row);

  return {
    id: row.id,
    value,
    domain: row.domain,
    externalId: row.externalId,
    name: row.name,
    label: row.label,
    kind: row.kind,
    fieldKeys: parseTariffFieldKeys(row.fieldKeys),
    startedAt: row.startedAt.toISOString(),
    displayName,
  };
}

function marketingTariffDisplayName(row: MarketingTariffSnapshotRow) {
  const label = row.label ?? row.name ?? row.externalId ?? row.id;

  return row.domain ? `${label} · ${row.domain}` : label;
}

function parseTariffFieldKeys(value: Prisma.JsonValue | null) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .slice(0, 20);
}

function promoBundleTariffSummaryFromIds({
  tariffGroupId,
  tariffPeriodId,
  tariffTypeId,
}: {
  tariffGroupId: string | null;
  tariffPeriodId: string | null;
  tariffTypeId: string | null;
}) {
  const parts = [
    tariffGroupId ? `группа ${tariffGroupId}` : null,
    tariffPeriodId ? `период ${tariffPeriodId}` : null,
    tariffTypeId ? `тип ${tariffTypeId}` : null,
  ].filter((item): item is string => Boolean(item));

  return parts.length > 0 ? parts.join(' · ') : 'любой тариф';
}

function parseOptionalDate(value: unknown) {
  const text = normalizeText(value, 40);

  if (!text) {
    return null;
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Invalid date');
  }

  return date;
}

function parseOptionalBudget(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const amount =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.replace(',', '.').trim())
        : Number.NaN;

  if (!Number.isFinite(amount) || amount < 0) {
    throw new BadRequestException('Invalid budget');
  }

  return amount;
}

function parseOptionalPositiveInt(value: unknown, label: string) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.replace(',', '.').trim())
        : Number.NaN;

  if (!Number.isFinite(number) || number < 1) {
    throw new BadRequestException(`${label} must be a positive number`);
  }

  return Math.round(number);
}

function validateDateRange(from: Date | null, to: Date | null) {
  if (from && to && from.getTime() > to.getTime()) {
    throw new BadRequestException('Period start must be before period end');
  }
}

function toUserSummary(user: {
  id: string;
  fullName: string | null;
  email: string;
}) {
  return {
    id: user.id,
    displayName: user.fullName ?? user.email,
    email: user.email,
  };
}

function parseStringArray(value: Prisma.JsonValue | null) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function emptyMissionRewardSummary(): MarketingMissionRewardSummary {
  return {
    total: 0,
    pending: 0,
    approved: 0,
    paid: 0,
    canceled: 0,
    approvedAmount: 0,
    paidAmount: 0,
  };
}

function defaultMissionTriggerKind(
  missionType: MarketingMissionType,
): MarketingMissionTriggerKind {
  const mapping: Record<MarketingMissionType, MarketingMissionTriggerKind> = {
    QUIET_HOURS: 'VISIT',
    SECOND_VISIT: 'REPEAT_VISIT',
    BAR_PURCHASE: 'BAR_PURCHASE',
    BIRTHDAY_EVENT: 'EVENT_PARTICIPATION',
    REFERRAL: 'REFERRAL',
    TOURNAMENT: 'EVENT_PARTICIPATION',
    CUSTOM: 'MANUAL',
  };

  return mapping[missionType];
}

function defaultMissionName(
  missionType: MarketingMissionType,
  rewardType: MarketingMissionRewardType,
) {
  const labels: Record<MarketingMissionType, string> = {
    QUIET_HOURS: 'Миссия на тихие часы',
    SECOND_VISIT: 'Миссия на повторный визит',
    BAR_PURCHASE: 'Миссия на покупку в баре',
    BIRTHDAY_EVENT: 'Миссия на событие или день рождения',
    REFERRAL: 'Миссия за приглашение друга',
    TOURNAMENT: 'Миссия на турнир',
    CUSTOM: 'Пользовательская миссия',
  };

  return `${labels[missionType]}: ${missionRewardTypeLabel(rewardType)}`;
}

function missionRewardTypeLabel(rewardType: MarketingMissionRewardType) {
  const labels: Record<MarketingMissionRewardType, string> = {
    BONUS: 'бонусы',
    BALANCE: 'пополнение баланса',
    PLAY_TIME: 'игровое время',
    PROMO_BUNDLE: 'промо-набор',
    MANUAL: 'ручная награда',
  };

  return labels[rewardType];
}

function defaultMissionRewardLabel(
  rewardType: MarketingMissionRewardType,
  amount: number | null,
) {
  const amountLabel = amount && amount > 0 ? `${amount} руб` : null;
  const labels: Record<MarketingMissionRewardType, string> = {
    BONUS: amountLabel ? `${amountLabel} бонусами` : 'Бонусы вручную',
    BALANCE: amountLabel
      ? `${amountLabel} на баланс`
      : 'Пополнение баланса вручную',
    PLAY_TIME: amountLabel
      ? `${amountLabel} игровым временем`
      : 'Игровое время',
    PROMO_BUNDLE: 'Промо-набор вручную',
    MANUAL: amountLabel ? `${amountLabel} вручную` : 'Ручная награда',
  };

  return labels[rewardType];
}

function defaultMissionConditions(
  missionType: MarketingMissionType,
  triggerKind: MarketingMissionTriggerKind,
): Prisma.InputJsonValue {
  const common = {
    triggerKind,
    dataSource: 'Langame facts',
    calculationMode: 'manual_review',
  };
  const mapping: Record<MarketingMissionType, Prisma.InputJsonValue> = {
    QUIET_HOURS: {
      ...common,
      quietHours: ['10:00-16:00'],
      minVisits: 1,
      requiredClubScope: 'selected_or_network',
    },
    SECOND_VISIT: {
      ...common,
      minVisits: 2,
      windowDays: 14,
      firstVisitSource: 'GuestSession',
    },
    BAR_PURCHASE: {
      ...common,
      minBarSpend: 300,
      factSource: 'SalesFact.guestId',
    },
    BIRTHDAY_EVENT: {
      ...common,
      eventWindowDays: 7,
      requiresCrmConfirmation: true,
    },
    REFERRAL: {
      ...common,
      referralEvidence: 'manual_or_external_id',
      requiresAntiSelfReferralCheck: true,
    },
    TOURNAMENT: {
      ...common,
      eventName: 'Турнир',
      participationSource: 'manual_or_event_list',
    },
    CUSTOM: {
      ...common,
      description: 'Опишите условия выполнения миссии.',
    },
  };

  return mapping[missionType];
}

function defaultMissionAntiFraudRules(): Prisma.InputJsonValue {
  return {
    oneRewardPerGuestByDefault: true,
    requireManualApprovalBeforeLangameWrite: true,
    checkDuplicateExternalId: true,
    checkSelfReferral: true,
  };
}

function campaignAudienceRuleLabel(filters: Prisma.JsonValue | null) {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) {
    return null;
  }

  const dateFrom = getStringField(filters, 'dateFrom');
  const dateTo = getStringField(filters, 'dateTo');
  const parts = [
    dateFrom && dateTo ? `${dateFrom} - ${dateTo}` : null,
    getStringField(filters, 'segment')
      ? `сегмент: ${campaignAudienceSegmentLabel(
          getStringField(filters, 'segment'),
        )}`
      : null,
    getStringField(filters, 'crmStatus')
      ? `CRM: ${getStringField(filters, 'crmStatus')}`
      : null,
    getStringField(filters, 'storeId') ? 'клуб выбран' : null,
    getStringField(filters, 'guestGroupId') ? 'группа Langame выбрана' : null,
    getStringField(filters, 'search')
      ? `поиск: ${getStringField(filters, 'search')}`
      : null,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(' · ') : 'Базовая выборка';
}

function campaignAudienceSegmentLabel(segment: string | null) {
  const labels: Record<string, string> = {
    top: 'TOP',
    active: 'активные',
    new: 'новые',
    repeat: 'повторные',
    risk: 'в риске',
    lost: 'потерянные',
    quiet: 'тихие часы',
  };

  return segment ? (labels[segment] ?? segment) : 'не указан';
}

function campaignTaskDescription(
  campaign: {
    id: string;
    goal: string;
    audience: { name: string; guestsCount: number } | null;
    storeIds: Prisma.JsonValue | null;
    channel: string | null;
    mechanic: string | null;
    periodFrom: Date | null;
    periodTo: Date | null;
    budget: Prisma.Decimal | null;
    note: string | null;
  },
  coverage: MarketingCampaignConsentCoverage,
) {
  const storeIds = parseStringArray(campaign.storeIds);
  const lines = [
    `Карточка кампании: /marketing/campaigns/${campaign.id}`,
    `Цель: ${campaignGoalForTask(campaign.goal)}`,
    campaign.audience
      ? `Группа: ${campaign.audience.name} (${campaign.audience.guestsCount} гостей)`
      : 'Группа: не выбрана',
    storeIds.length > 0 ? `Клубов: ${storeIds.length}` : 'Клубы: вся сеть',
    campaign.channel ? `Канал: ${campaign.channel}` : null,
    campaign.mechanic ? `Механика: ${campaign.mechanic}` : null,
    campaign.periodFrom || campaign.periodTo
      ? `Период: ${formatDateForTask(campaign.periodFrom)} - ${formatDateForTask(
          campaign.periodTo,
        )}`
      : null,
    campaign.budget ? `Бюджет: ${Number(campaign.budget)} руб` : null,
    coverage.targetTotal > 0
      ? `Согласия: доступно ${coverage.contactable} из ${coverage.targetTotal}, исключено ${coverage.excluded}; отказов ${coverage.phoneDenied}, отписок ${coverage.phoneUnsubscribed}, неизвестных ${coverage.phoneUnknown}`
      : 'Согласия: группа не выбрана или пуста',
    `Правило канала: ${coverage.contactRule}`,
    coverage.exclusionReason
      ? `Причина исключения: ${coverage.exclusionReason}`
      : null,
    '',
    'Инструкция:',
    campaignChannelInstruction(campaign.channel),
    '',
    'Зафиксировать в CRM:',
    '- кому сделали контакт и по какому каналу;',
    '- результат: дозвон, ответ, отказ, бронь, интерес, неактуально;',
    '- следующий шаг, дату следующего контакта и ответственного;',
    '- факт визита или использования промо, если он появился.',
    campaign.note ? `Заметка: ${campaign.note}` : null,
  ];

  return lines.filter((line): line is string => Boolean(line)).join('\n');
}

function campaignGoalForTask(goal: string) {
  const labels: Record<string, string> = {
    RETURN_GUESTS: 'Вернуть гостей',
    REPEAT_VISIT: 'Повторный визит',
    WEAK_HOURS: 'Заполнить тихие часы',
    BAR_GROWTH: 'Вырастить бар',
    EVENT_PROMO: 'Событие или бронь',
    PROMO_BUNDLE: 'Промо-набор',
  };

  return labels[goal] ?? goal;
}

function campaignChannelInstruction(channel: string | null) {
  const normalized = (channel ?? '').toLocaleLowerCase('ru-RU');

  if (normalized.includes('звон')) {
    return 'Позвонить гостям из группы, начать с самых ценных или срочных. Не обещать автоматические бонусы без ручного подтверждения. После звонка сразу записать результат контакта.';
  }

  if (
    normalized.includes('месс') ||
    normalized.includes('sms') ||
    normalized.includes('telegram') ||
    normalized.includes('max') ||
    normalized.includes('рассыл')
  ) {
    return 'Перед отправкой проверить согласие на контакт и исключить отписки. Текст должен содержать оффер, срок действия, клубы и понятный следующий шаг для гостя.';
  }

  if (normalized.includes('объяв')) {
    return 'Передать администраторам короткий текст объявления, период действия, клубы, лимиты и правила применения. Отдельно объяснить, какие факты нужно отметить в CRM.';
  }

  if (normalized.includes('соц')) {
    return 'Опубликовать оффер с датой, клубом, лимитами и ссылкой/контактом для заявки. Входящие обращения заводить как CRM-лиды или контактные события кампании.';
  }

  if (normalized.includes('crm')) {
    return 'Идти по CRM-списку, не выгружая персональные данные в сторонние файлы. Работать только с доступными контактами и фиксировать результат по каждому гостю.';
  }

  return 'Проверить канал, согласия, лимиты и ответственного. Выполнять контакт вручную и фиксировать все факты в CRM, чтобы затем измерить эффект кампании.';
}

function formatDateForTask(value: Date | null) {
  if (!value) {
    return 'не задано';
  }

  return new Intl.DateTimeFormat('ru-RU').format(value);
}

function campaignChannelPolicy(channel: string | null) {
  const value = (channel ?? '').trim();

  if (!value) {
    return {
      kind: 'UNKNOWN' as const,
      label: 'канал не выбран',
      requiresPhoneConsent: true,
      requiredConsent: 'нужно выбрать канал и проверить согласие',
      contactRule:
        'До выбора канала нельзя запускать контакт: сначала задайте способ связи и ответственного.',
      exclusionReason: 'канал не выбран',
    };
  }

  const normalized = value.toLocaleLowerCase('ru-RU');

  if (
    normalized.includes('месс') ||
    normalized.includes('sms') ||
    normalized.includes('смс') ||
    normalized.includes('рассыл') ||
    normalized.includes('telegram') ||
    normalized.includes('max')
  ) {
    return {
      kind: 'MESSAGE' as const,
      label: value,
      requiresPhoneConsent: true,
      requiredConsent: 'разрешение на сообщение или рассылку',
      contactRule:
        'Писать можно только гостям с разрешенным контактом; отписки, отказы и неизвестные согласия исключаются.',
      exclusionReason:
        'для сообщения или рассылки нет подтвержденного разрешения на контакт',
    };
  }

  if (
    normalized.includes('звон') ||
    normalized.includes('call') ||
    normalized.includes('phone') ||
    normalized.includes('телефон')
  ) {
    return {
      kind: 'PHONE' as const,
      label: value,
      requiresPhoneConsent: true,
      requiredConsent: 'разрешение на телефонный контакт',
      contactRule:
        'Звонить можно только гостям со статусом согласия “разрешено”; отказы, отписки и неизвестные контакты исключаются.',
      exclusionReason:
        'для звонка нет подтвержденного разрешения на телефонный контакт',
    };
  }

  if (normalized.includes('crm')) {
    return {
      kind: 'CRM' as const,
      label: value,
      requiresPhoneConsent: true,
      requiredConsent: 'разрешенный контакт в CRM',
      contactRule:
        'CRM-задача может содержать персональный контакт, поэтому работать нужно только с гостями с разрешенным контактом.',
      exclusionReason: 'для CRM-контакта нет разрешенного статуса связи',
    };
  }

  if (
    normalized.includes('клуб') ||
    normalized.includes('админ') ||
    normalized.includes('смен') ||
    normalized.includes('объяв')
  ) {
    return {
      kind: 'IN_CLUB' as const,
      label: value,
      requiresPhoneConsent: false,
      requiredConsent: 'не требуется для объявления внутри клуба',
      contactRule:
        'Канал не рассылает персональные сообщения: можно передать механику администраторам и фиксировать ответы гостей при визите.',
      exclusionReason: null,
    };
  }

  if (normalized.includes('соц')) {
    return {
      kind: 'PUBLIC' as const,
      label: value,
      requiresPhoneConsent: false,
      requiredConsent: 'не требуется для публичной публикации',
      contactRule:
        'Публичный пост не использует персональные контакты; входящие обращения нужно заводить как CRM-лиды или контактные события.',
      exclusionReason: null,
    };
  }

  return {
    kind: 'UNKNOWN' as const,
    label: value,
    requiresPhoneConsent: true,
    requiredConsent: 'ручная проверка согласия',
    contactRule:
      'Канал не распознан как публичный или клубный, поэтому перед контактом нужен разрешенный статус связи.',
    exclusionReason: 'канал требует ручной проверки согласия',
  };
}

function emptyConsentCoverage(
  channel: string | null,
): MarketingCampaignConsentCoverage {
  const channelPolicy = campaignChannelPolicy(channel);

  return {
    targetTotal: 0,
    phoneGranted: 0,
    phoneDenied: 0,
    phoneUnsubscribed: 0,
    phoneUnknown: 0,
    contactable: 0,
    excluded: 0,
    requiresPhoneConsent: channelPolicy.requiresPhoneConsent,
    channelKind: channelPolicy.kind,
    channelLabel: channelPolicy.label,
    requiredConsent: channelPolicy.requiredConsent,
    contactRule: channelPolicy.contactRule,
    exclusionReason: channelPolicy.exclusionReason,
  };
}

function confirmedTransactionSpendAmount(type: string | null, amount: number) {
  if (!Number.isFinite(amount) || amount === 0) {
    return 0;
  }

  if (isBalanceTopUpOperationType(type)) {
    return 0;
  }

  return Math.abs(amount);
}

function unallocatedNetworkTopupAmount(operationLog: {
  storeId?: string | null;
  externalClubId?: string | null;
  type: string | null;
  operationSource?: string | null;
  operationForm?: string | null;
  amount: { toNumber: () => number } | null;
}) {
  const amount = operationLog.amount?.toNumber() ?? 0;

  if (
    !Number.isFinite(amount) ||
    amount === 0 ||
    !isUnallocatedNetworkTopupOperation(operationLog)
  ) {
    return 0;
  }

  return Math.abs(amount);
}

function isUnallocatedNetworkTopupOperation(operationLog: {
  storeId?: string | null;
  externalClubId?: string | null;
  type: string | null;
  operationSource?: string | null;
  operationForm?: string | null;
}) {
  if (!isBalanceTopUpOperationType(operationLog.type)) {
    return false;
  }

  const externalClubId = operationLog.externalClubId?.trim();

  if (operationLog.storeId || (externalClubId && externalClubId !== '0')) {
    return false;
  }

  const source = normalizeExternalType(operationLog.operationSource ?? null);
  const form = normalizeExternalType(operationLog.operationForm ?? null);

  if (!source && !form) {
    return true;
  }

  return (
    source.includes('прилож') ||
    source.includes('app') ||
    source.includes('mobile') ||
    source.includes('лк_гост') ||
    source.includes('lk_guest') ||
    source.includes('web_интерфейс') ||
    form === 'qr'
  );
}

function isBalanceTopUpOperationType(type: string | null) {
  const normalizedType = normalizeExternalType(type);

  return (
    normalizedType === 'plus' ||
    normalizedType === 'popolnenie' ||
    normalizedType.includes('deposit') ||
    normalizedType.includes('top_up') ||
    normalizedType.includes('recharge') ||
    normalizedType.includes('пополн')
  );
}

function normalizeExternalType(type: string | null) {
  return String(type ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function hasOwn<T extends object>(obj: T, key: PropertyKey): boolean {
  return key in obj;
}
