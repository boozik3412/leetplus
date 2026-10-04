import { getApiUrl, getAuthHeaders } from "./api";

export type SupportTicketStatus = "NEW" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
export type SupportTicketStatusFilter =
  | SupportTicketStatus
  | "active"
  | "awaiting"
  | "all";
// INTERNAL notes stay with staff; PUBLIC replies are shown to the guest as
// "Поддержка LeetPlus"; GUEST rows are the guest's own messages.
export type SupportTicketCommentVisibility = "INTERNAL" | "PUBLIC" | "GUEST";
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
  // Club selected in the game module when the guest reported about another one.
  reportedFromStore: { id: string; name: string } | null;
  profile: {
    id: string;
    displayName: string | null;
    contactMasked: string | null;
    fullName: string | null;
    phone: string | null;
  };
  assignedTo: TicketUser | null;
  comments: Array<{
    id: string;
    body: string;
    createdAt: string;
    authorUser: TicketUser | null;
    visibility: SupportTicketCommentVisibility;
  }>;
  guestThread: {
    awaitingStaff: boolean;
    unreadByGuest: boolean;
    lastPublicReplyAt: string | null;
    lastGuestReadAt: string | null;
    feedback: {
      value: "HELPED" | "NOT_HELPED";
      comment: string | null;
      at: string;
    } | null;
  };
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
    status: SupportTicketStatusFilter;
    topic: SupportTicketTopic | "all";
    tenantId: string | null;
    storeId: string | null;
    assignedToUserId: string | null;
    search: string | null;
    pageSize: number;
  };
  statuses: SupportTicketStatus[];
  topics: SupportTicketTopic[];
  summary: Record<SupportTicketStatus, number> & {
    active: number;
    total: number;
    unassigned: number;
    mine: number;
    awaitingStaff: number;
    oldestActiveCreatedAt: string | null;
  };
  tenants: Array<{ id: string; name: string; slug: string }>;
  stores: Array<{
    id: string;
    name: string;
    tenantName: string;
    tickets: number;
  }>;
  users: TicketUser[];
  rows: StaffSupportTicket[];
  // Set by the Web loader: the moment waiting times on the page refer to.
  generatedAt: string;
};

// What the guest received in the ticket's club (loaded on demand).
export type SupportTicketGuestRewards = {
  ticketId: string;
  store: { id: string; name: string };
  since: string;
  items: Array<{
    id: string;
    createdAt: string;
    title: string;
    rewardLabel: string;
    sourceLabel: string;
    state: "DONE" | "WAITING" | "PROBLEM";
    stateLabel: string;
    claimedAt: string | null;
    expiresAt: string;
    payout: {
      amount: number;
      statusLabel: string;
      paidAt: string | null;
    } | null;
  }>;
  truncated: boolean;
  otherClubs: Array<{ storeId: string; name: string; items: number }>;
  withoutClub: number;
};

export type SupportQueueSummary = {
  scope: "TENANT" | "PLATFORM";
  NEW: number;
  IN_PROGRESS: number;
  active: number;
  unassigned: number;
  mine: number;
  awaitingStaff: number;
  oldestActiveCreatedAt: string | null;
  latestNew: {
    id: string;
    ticketNumber: string;
    topic: SupportTicketTopic;
    createdAt: string;
    storeName: string;
    tenantName: string;
  } | null;
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
  const report = (await response.json()) as Omit<
    StaffSupportTicketsReport,
    "generatedAt"
  >;
  return { ...report, generatedAt: new Date().toISOString() };
}
