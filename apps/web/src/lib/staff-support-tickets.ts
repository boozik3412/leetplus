import { getApiUrl, getAuthHeaders } from "./api";

export type SupportTicketStatus = "NEW" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
export type SupportTicketTopic =
  | "GAME_MODULE"
  | "MISSIONS_AND_BATTLE_PASS"
  | "LOOT_BOXES_AND_REWARDS"
  | "BALANCE_AND_PAYMENTS"
  | "AUTH_AND_PROFILE"
  | "INTERFACE_AND_DISPLAY"
  | "OTHER";

export type TicketUser = {
  id: string;
  tenantId?: string;
  fullName: string | null;
  email: string;
  isPlatformAdmin?: boolean;
};

export type StaffSupportTicket = {
  id: string;
  ticketNumber: string;
  topic: SupportTicketTopic;
  description: string;
  status: SupportTicketStatus;
  route: string | null;
  releaseSha: string | null;
  browser: string | null;
  device: string | null;
  viewport: string | null;
  timeZone: string | null;
  assignedToUserId: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
  tenant: { id: string; name: string; slug: string };
  store: { id: string; name: string };
  profile: {
    id: string;
    displayName: string | null;
    contactMasked: string | null;
  };
  assignedTo: TicketUser | null;
  comments: Array<{
    id: string;
    body: string;
    createdAt: string;
    authorUser: TicketUser | null;
  }>;
  auditEvents: Array<{
    id: string;
    action: string;
    metadata: unknown;
    createdAt: string;
    actorUser: TicketUser | null;
  }>;
  attachments: Array<{
    id: string;
    fileName: string;
    contentType: string;
    byteSize: number;
  }>;
};

export type StaffSupportTicketsReport = {
  scope: "TENANT" | "PLATFORM";
  filters: {
    status: SupportTicketStatus | "all";
    topic: SupportTicketTopic | "all";
    tenantId: string | null;
    assignedToUserId: string | null;
    search: string | null;
    pageSize: number;
  };
  statuses: SupportTicketStatus[];
  topics: SupportTicketTopic[];
  summary: Record<SupportTicketStatus, number> & {
    active: number;
    total: number;
  };
  tenants: Array<{ id: string; name: string; slug: string }>;
  users: TicketUser[];
  rows: StaffSupportTicket[];
};

export async function getStaffSupportTickets(
  filters: Record<string, string | undefined>,
  options: { platform?: boolean } = {},
) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.size ? `?${params.toString()}` : "";
  const endpoint = options.platform
    ? "/admin/support-tickets"
    : "/support/bug-reports";
  const response = await fetch(`${getApiUrl()}${endpoint}${query}`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Failed to fetch support tickets");
  }
  return response.json() as Promise<StaffSupportTicketsReport>;
}
