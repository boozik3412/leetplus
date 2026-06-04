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
  crmLead: {
    found: boolean;
    displayName: string | null;
    contactMasked: string | null;
    source: string | null;
    eventName: string | null;
    crmStatus:
      | "NONE"
      | "CONTACT"
      | "IN_PROGRESS"
      | "DONE"
      | "DO_NOT_CONTACT"
      | null;
    nextContactAt: string | null;
    matchedGuestFound: boolean;
    matchedAt: string | null;
  };
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
  guestSnapshot: {
    source: {
      provider: string;
      domain: string | null;
      lastSyncedAt: string | null;
    };
    identity: {
      phoneMasked: string | null;
      emailMasked: string | null;
      fullNameMasked: string | null;
      birthdayProvided: boolean;
      documentPresent: boolean;
      bonusProgramNumberMasked: string | null;
    };
    registration: {
      registeredAt: string | null;
      lastActivityAt: string | null;
      confirmed: boolean;
      mobileRegistration: boolean;
      simpleRegistration: boolean;
      temporary: boolean;
      virtual: boolean;
      disabled: boolean;
    };
    profileCompleteness: {
      percent: number;
      completed: string[];
      missing: string[];
    };
    participation: {
      accountState:
        | "LANGAME_SYNCED"
        | "CRM_LEAD"
        | "GAME_PROFILE"
        | "DISABLED"
        | "TEMPORARY"
        | "VIRTUAL"
        | "NOT_MATCHED";
      accountStateLabel: string;
      guestTypeId: string | null;
      genderLabel: string | null;
      registrationChannel: string;
      verificationLabel: string;
      loyaltyCardStatus: "LINKED" | "MISSING" | "UNKNOWN";
      readinessPercent: number;
      readiness: Array<{
        id: string;
        label: string;
        status: "READY" | "ATTENTION" | "MISSING";
        note: string;
      }>;
    };
    statusLabels: string[];
  };
  gamification: {
    nextActions: Array<{
      id: string;
      kind:
        | "CLAIM_REWARD"
        | "OPEN_LOOT_BOX"
        | "FINISH_MISSION"
        | "BATTLE_PASS"
        | "MATCH_LANGAME";
      title: string;
      description: string;
      priority: "HIGH" | "MEDIUM" | "LOW";
      statusLabel: string;
      progressPercent: number | null;
      anchor: "rewards" | "lootBoxes" | "missions" | "battlePass" | "profile";
    }>;
    lootBoxes: Array<{
      id: string;
      name: string;
      triggerKind: string;
      rewardLabel: string | null;
      rewardType: string;
      manualApprovalRequired: boolean;
      note: string | null;
      openedCount: number;
      readyRewards: number;
      waitingApprovalRewards: number;
      redeemedRewards: number;
      latestReward: {
        id: string;
        walletState:
          | "WAITING_APPROVAL"
          | "READY"
          | "REDEEMED"
          | "CANCELED"
          | "EXPIRED";
        rewardLabel: string;
        rewardCode: string | null;
        claimPayload: string | null;
        qualifiedAt: string;
        expiresAt: string | null;
      } | null;
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
      questSteps: Array<{
        id: string;
        title: string;
        target: number;
        progressCurrent: number;
        completed: boolean;
        current: boolean;
      }>;
      periodTo: string | null;
      manualApprovalRequired: boolean;
    }>;
    seasons: Array<{
      id: string;
      name: string;
      seasonType: string;
      premiumEnabled: boolean;
      periodTo: string | null;
      currentLevel: number;
      nextLevel: number | null;
      currentLevelXp: number;
      nextLevelXp: number | null;
      xpToNextLevel: number | null;
      progressPercent: number;
      reachedLevels: number;
      totalLevels: number;
      readyRewards: number;
      waitingApprovalRewards: number;
      redeemedRewards: number;
      nextRewardLabel: string | null;
      nextPremiumRewardLabel: string | null;
      levels: Array<{
        level: number;
        xp: number;
        freeReward: string | null;
        premiumReward: string | null;
        reached: boolean;
        current: boolean;
        next: boolean;
      }>;
    }>;
    rewardSummary: {
      total: number;
      ready: number;
      waitingApproval: number;
      redeemed: number;
      expired: number;
      nextExpiresAt: string | null;
    };
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
      sourceKind: "LOOT_BOX" | "MISSION" | "BATTLE_PASS" | "MANUAL";
      sourceLabel: string | null;
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
    xpHistory: Array<{
      id: string;
      eventType: string;
      title: string;
      description: string | null;
      xpDelta: number;
      occurredAt: string;
      sourceLabel: string | null;
    }>;
  };
  communications: {
    phone: {
      masked: string | null;
      consentStatus: "UNKNOWN" | "GRANTED" | "DENIED" | "UNSUBSCRIBED";
      consentSource: string | null;
      consentAt: string | null;
      unsubscribedAt: string | null;
      otpVerified: boolean;
      otpDeliveryReady: boolean;
    };
    telegram: {
      connected: boolean;
      identityMasked: string | null;
      readyForRewards: boolean;
      status:
        | "READY"
        | "CONNECTED_NO_CONSENT"
        | "NOT_CONNECTED"
        | "UNSUBSCRIBED";
    };
    max: {
      connected: boolean;
      identityMasked: string | null;
      readyForRewards: boolean;
      status:
        | "READY"
        | "CONNECTED_NO_CONSENT"
        | "NOT_CONNECTED"
        | "UNSUBSCRIBED";
    };
    history: Array<{
      id: string;
      action: GuestPortalCommunicationPreferenceAction;
      label: string;
      note: string;
      createdAt: string;
    }>;
  };
};

export type GuestPortalOtpVerifyResponse = {
  token: string;
  portal: GuestPortalPayload;
};

export type GuestPortalCommunicationPreferenceAction =
  | "GRANT"
  | "DENY"
  | "UNSUBSCRIBE";

export type GuestPortalCommunicationPreferenceResponse = {
  portal: GuestPortalPayload;
  message: string;
};

export type GuestPortalMessengerChannel = "TELEGRAM" | "MAX";

export type GuestPortalMessengerUpdateResponse = {
  portal: GuestPortalPayload;
  message: string;
};

export type GuestPortalTelegramLinkStartResponse = {
  code: string;
  codeMasked: string;
  expiresAt: string;
  botUsername: string | null;
  botDeepLink: string | null;
  status: "READY" | "BOT_NOT_CONFIGURED";
  message: string;
};

export type GuestPortalLangameMatchResponse = {
  checkedAt: string;
  queryField: "phone";
  phoneMasked: string;
  status: "MATCHED_LOCAL" | "FOUND_IN_LANGAME" | "NOT_FOUND" | "FAILED";
  localGuestFound: boolean;
  localGuestId: string | null;
  profileId: string | null;
  nextAction: string;
  sources: Array<{
    id: string;
    name: string;
    domain: string;
    status: "SUCCESS" | "FAILED";
    resultsCount: number;
    errorMessage: string | null;
    results: Array<{
      externalGuestId: string | null;
      guestTypeId: string | null;
      phoneMasked: string | null;
      emailMasked: string | null;
      fullNameMasked: string | null;
      bonusProgramNumberMasked: string | null;
      dateLastActivity: string | null;
      rawKeys: string[];
      localGuestKnown: boolean;
      localGuestId: string | null;
    }>;
  }>;
};

export type GuestPortalLangameDetailsResponse = {
  checkedAt: string;
  status: "SUCCESS" | "FAILED" | "NOT_LINKED";
  nextAction: string;
  localSnapshot: {
    sourceDomain: string | null;
    externalGuestId: string | null;
    lastSyncedAt: string | null;
  };
  langame: {
    checkedAt: string;
    externalGuestId: string;
    source: {
      id: string;
      name: string;
      domain: string;
      status: "SUCCESS" | "FAILED";
      path: string;
      payloadKind: "array" | "object" | "scalar" | "empty";
      fieldKeys: string[];
      summary: string | null;
      payloadPreview: unknown;
      errorMessage: string | null;
    };
    details: {
      externalGuestId: string | null;
      guestTypeId: string | null;
      phoneMasked: string | null;
      emailMasked: string | null;
      fullNameMasked: string | null;
      bonusProgramNumberMasked: string | null;
      registeredAt: string | null;
      dateLastActivity: string | null;
      currentCountHours: string | null;
      statusLabels: string[];
      rawKeys: string[];
    } | null;
  } | null;
};
