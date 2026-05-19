import { getApiUrl, getAuthHeaders } from "./api";

export type GuestDashboardRow = {
  id: string;
  externalDomain: string | null;
  externalGuestId: string;
  displayName: string;
  contact: string;
  insertedAt: string | null;
  lastActivityAt: string | null;
  sessionsCount: number;
  visitsDays: number;
  playHours: number;
  transactionAmount: number;
  barRevenue: number;
  segment: "active" | "new" | "repeat" | "risk" | "lost" | "quiet";
};

export type GuestsSummary = {
  tenantId: string;
  tenantSlug: string;
  periodFrom: string;
  periodTo: string;
  totalGuests: number;
  activeGuests: number;
  newGuests: number;
  repeatGuests: number;
  riskGuests: number;
  lostGuests: number;
  sessionsCount: number;
  playHours: number;
  averageSessionMinutes: number;
  transactionsCount: number;
  transactionAmount: number;
  barRevenue: number;
  barSalesCount: number;
  dataQuality: {
    latestProfileRuns: Array<{
      domain: string;
      startedAt: string;
      status: string;
      guestsCount: number;
      sessionsCount: number;
      transactionsCount: number;
      productSalesLinked: number;
      endpointErrors: Record<string, string>;
    }>;
    unavailableEndpoints: string[];
    sessionsWithoutGuestId: number;
    transactionsWithoutGuestId: number;
    salesMissingGuestLink: number;
  };
  visitTrend: Array<{
    date: string;
    sessionsCount: number;
    activeGuests: number;
    barRevenue: number;
  }>;
  topGuests: GuestDashboardRow[];
  riskGuestsRows: GuestDashboardRow[];
};

export type GuestsSummaryFilters = {
  dateFrom?: string;
  dateTo?: string;
};

export async function getGuestsSummary(
  filters: GuestsSummaryFilters = {},
): Promise<GuestsSummary> {
  const params = new URLSearchParams();

  if (filters.dateFrom) {
    params.set("dateFrom", filters.dateFrom);
  }

  if (filters.dateTo) {
    params.set("dateTo", filters.dateTo);
  }

  const query = params.toString();
  const response = await fetch(
    `${getApiUrl()}/guests/summary${query ? `?${query}` : ""}`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch guests summary");
  }

  return response.json() as Promise<GuestsSummary>;
}
