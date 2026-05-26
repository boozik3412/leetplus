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
