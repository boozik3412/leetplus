import { getApiUrl, getAuthHeaders } from "./api";

export type StaffChatChannelScope = "NETWORK" | "STORE" | "ROLE" | "CUSTOM";
export type StaffChatMessageKind = "MESSAGE" | "ANNOUNCEMENT" | "INCIDENT";
export type StaffChatMessagePriority = "NORMAL" | "HIGH" | "URGENT";

export type StaffChatUser = {
  id: string;
  email: string;
  fullName: string | null;
  role?: string;
};

export type StaffChatStore = {
  id: string;
  name: string;
  isActive: boolean;
};

export type StaffChatChannel = {
  id: string;
  name: string;
  description: string | null;
  scope: StaffChatChannelScope;
  roleScope: string | null;
  isDefault: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  store: StaffChatStore | null;
  createdByUser: StaffChatUser | null;
  members: StaffChatUser[];
  messagesCount: number;
  unreadCount: number;
  pinnedCount: number;
  lastMessageAt: string | null;
};

export type StaffChatMessage = {
  id: string;
  channelId: string;
  body: string;
  kind: StaffChatMessageKind;
  priority: StaffChatMessagePriority;
  isPinned: boolean;
  isReadByMe: boolean;
  createdAt: string;
  updatedAt: string;
  authorUser: StaffChatUser | null;
  store: StaffChatStore | null;
};

export type StaffTeamChatFilters = {
  channelId?: string;
  search?: string;
  pinned?: string;
  pageSize?: string;
};

export type StaffTeamChatReport = {
  filters: {
    channelId: string | null;
    search: string | null;
    pinned: boolean;
    pageSize: number;
  };
  summary: {
    channels: number;
    messages: number;
    pinned: number;
    unread: number;
  };
  activeChannelId: string | null;
  channels: StaffChatChannel[];
  messages: StaffChatMessage[];
  stores: StaffChatStore[];
  users: StaffChatUser[];
  roleScopes: Array<{ value: string; label: string }>;
  canManageChannels: boolean;
};

export async function getStaffTeamChatReport(
  filters: StaffTeamChatFilters = {},
): Promise<StaffTeamChatReport> {
  const response = await fetch(
    `${getApiUrl()}/staff/team-chat${query(filters)}`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch staff team chat");
  }

  return response.json() as Promise<StaffTeamChatReport>;
}

function query(filters: StaffTeamChatFilters) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  const value = params.toString();
  return value ? `?${value}` : "";
}
