export const GUEST_AUTH_COOKIE_NAME = "leetplus_guest_token";

export type GuestPortalPublicConfig = {
  tenant: {
    name: string;
    slug: string;
  };
  store: {
    id: string;
    publicSlug: string | null;
    name: string;
    address: string | null;
  };
  otp: {
    ttlMinutes: number;
    resendSeconds: number;
    devCodeEnabled: boolean;
  };
};

export type GuestPortalOtpStartResponse = {
  challengeId: string;
  phoneMasked: string;
  expiresAt: string;
  resendAfterSeconds: number;
  delivery: {
    channel: "DEV";
    status: "DEV_CODE" | "NOT_CONFIGURED";
    devCode?: string;
  };
};

export type GuestPortalPayload = {
  tenant: GuestPortalPublicConfig["tenant"];
  store: GuestPortalPublicConfig["store"];
  guestFound: boolean;
  profile: {
    id: string | null;
    displayName: string;
    contactMasked: string | null;
    xp: number;
    level: number;
    nextLevelXp: number;
    levelProgressPercent: number;
    frame: "starter" | "bronze" | "silver" | "gold" | "diamond";
  };
  loyalty: {
    groupName: string | null;
    discountPercent: number | null;
    currentHours: number | null;
    nextGroupName: string | null;
    nextGroupHours: number | null;
    progressPercent: number;
    balance: number | null;
    bonusBalance: number | null;
    lastSyncedAt: string | null;
  };
  gamification: {
    lootBoxes: Array<{
      id: string;
      name: string;
      triggerKind: string;
      rewardLabel: string | null;
      rewardType: string;
      manualApprovalRequired: boolean;
      note: string | null;
    }>;
    missions: Array<{
      id: string;
      name: string;
      missionType: string;
      rewardLabel: string | null;
      xpReward: number;
      progressCurrent: number;
      progressTarget: number | null;
      progressUnit: string | null;
      progressPercent: number;
      periodTo: string | null;
      manualApprovalRequired: boolean;
    }>;
    seasons: Array<{
      id: string;
      name: string;
      seasonType: string;
      premiumEnabled: boolean;
      periodTo: string | null;
      levels: Array<{
        level: number;
        xp: number;
        freeReward: string | null;
        premiumReward: string | null;
        reached: boolean;
      }>;
    }>;
    rewards: Array<{
      id: string;
      status: string;
      walletState:
        | "WAITING_APPROVAL"
        | "READY"
        | "REDEEMED"
        | "CANCELED"
        | "EXPIRED";
      rewardType: string;
      rewardAmount: number;
      rewardLabel: string;
      rewardCode: string | null;
      claimPayload: string | null;
      qualifiedAt: string;
      expiresAt: string | null;
    }>;
  };
  activity: {
    summary: {
      sessionsCount: number;
      playMinutes: number;
      logsCount: number;
      transactionsCount: number;
      gameEventsCount: number;
      lastActivityAt: string | null;
    };
    timeline: Array<{
      id: string;
      kind: "SESSION" | "LOG" | "TRANSACTION" | "GAME_EVENT";
      title: string;
      description: string | null;
      occurredAt: string;
      storeName: string | null;
      amount: number | null;
      xpDelta: number | null;
    }>;
  };
};

export type GuestPortalOtpVerifyResponse = {
  token: string;
  portal: GuestPortalPayload;
};
