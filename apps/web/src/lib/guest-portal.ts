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

export type GuestPortalGamificationClubDirectory = {
  updatedAt: string;
  total: number;
  cities: string[];
  verification: GuestPortalVerificationPlan;
  search: {
    locationReady: boolean;
    radiusKm: number | null;
    radiusApplied: boolean;
    totalBeforeRadius: number;
    hiddenWithoutCoordinates: number;
    coordinates: {
      total: number;
      ready: number;
      missing: number;
      readyPercent: number;
    };
  };
  clubs: GuestPortalGamificationClub[];
};

export type GuestPortalLootBoxRarity =
  | "common"
  | "rare"
  | "epic"
  | "legendary";

export type GuestPortalVerificationChannel =
  | "TELEGRAM_BOT"
  | "USER_CALL"
  | "SMS_CODE"
  | "INCOMING_CALL_LAST4";

export type GuestPortalVerificationOption = {
  rank: number;
  channel: GuestPortalVerificationChannel;
  role: "PRIMARY" | "FALLBACK" | "RESERVE";
  status: "READY" | "READY_AFTER_OTP" | "NOT_CONFIGURED" | "PLANNED";
  label: string;
  statusLabel: string;
  message: string;
  nextAction: string;
  botUsername: string | null;
  requiredEnv: string[];
  freeCall?: boolean;
};

export type GuestPortalVerificationPlan = {
  recommendedChannel: GuestPortalVerificationChannel;
  phoneRequired: boolean;
  options: GuestPortalVerificationOption[];
};

export type GuestPortalGamificationClub = {
  id: string;
  tenant: {
    name: string;
    slug: string;
  };
  store: {
    id: string;
    publicSlug: string | null;
    name: string;
    city: string | null;
    address: string | null;
  };
  location: {
    city: string | null;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    coordinatesReady: boolean;
    distanceKm: number | null;
  };
  links: {
    guestPortalPath: string;
  };
  gamification: {
    activeMissions: number;
    activeLootBoxes: number;
    activeSeasons: number;
    activeRules: number;
    gamificationEnabled: boolean;
    configuredByStore: boolean;
    bonusWriteReady: boolean;
  };
};

export type GuestPortalOtpStartResponse = {
  challengeId: string;
  phoneMasked: string;
  expiresAt: string;
  resendAfterSeconds: number;
  delivery: {
    channel: "DEV" | "SMS" | "TELEGRAM" | "MAX";
    status: "DEV_CODE" | "SENT" | "NOT_CONFIGURED" | "BLOCKED" | "FAILED";
    devCode?: string;
    message: string;
    note?: string;
    identityMasked?: string | null;
    requiredEnv?: string[];
  };
};

export type GuestPortalMissionRewardStatus = {
  state:
    | "IN_PROGRESS"
    | "COMPLETED"
    | "WAITING_APPROVAL"
    | "READY"
    | "QUEUED"
    | "SENDING"
    | "CONFIRMED"
    | "FAILED"
    | "CANCELED"
    | "REDEEMED"
    | "EXPIRED";
  label: string;
  hint: string;
  rewardLabel: string | null;
  rewardAmount: number | null;
  rewardWalletState:
    | "WAITING_APPROVAL"
    | "READY"
    | "REDEEMED"
    | "CANCELED"
    | "EXPIRED"
    | null;
  ledgerStatus:
    | "PENDING"
    | "PROCESSING"
    | "CONFIRMED"
    | "FAILED"
    | "CANCELED"
    | "UNKNOWN"
    | null;
  balanceAfter: number | null;
  occurredAt: string | null;
};

export type GuestPortalGameProgressTimelineItem = {
  id: string;
  kind: "ACTIVITY" | "REWARD" | "BONUS_LEDGER";
  status: "DONE" | "READY" | "WAITING" | "ATTENTION";
  title: string;
  description: string | null;
  occurredAt: string;
  storeName: string | null;
  xpDelta: number | null;
  amount: number | null;
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
    isStaffTest: boolean;
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
    bonusBalanceSource: string | null;
    bonusBalanceSyncedAt: string | null;
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
        | "CHECK_IN"
        | "MATCH_LANGAME";
      title: string;
      description: string;
      priority: "HIGH" | "MEDIUM" | "LOW";
      statusLabel: string;
      progressPercent: number | null;
      anchor:
        | "rewards"
        | "lootBoxes"
        | "missions"
        | "battlePass"
        | "profile"
        | "progress";
    }>;
    lootBoxes: Array<{
      id: string;
      name: string;
      triggerKind: string;
      rewardLabel: string | null;
      rewardType: string;
      caseRarity: GuestPortalLootBoxRarity;
      caseRarityLabel: string;
      manualApprovalRequired: boolean;
      note: string | null;
      openState: "OPENABLE" | "WAITING_EVENT" | "LIMIT_REACHED";
      openable: boolean;
      openBlocker: string | null;
      weeklyOpenedCount: number;
      weeklyLimit: number | null;
      dailyOpenedCount: number;
      dailyLimit: number | null;
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
        rewardRarity: GuestPortalLootBoxRarity | null;
        rewardRarityLabel: string | null;
        rewardDropChance: number | null;
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
      rewardStatus: GuestPortalMissionRewardStatus;
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
    promoCards: Array<{
      id: string;
      label: string | null;
      title: string;
      description: string | null;
      tag: string | null;
      targetAnchor: string | null;
      imageUrl: string | null;
      actionLabel: string | null;
      actionUrl: string | null;
      periodTo: string | null;
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
      rewardRarity: GuestPortalLootBoxRarity | null;
      rewardRarityLabel: string | null;
      rewardDropChance: number | null;
      sourceId: string | null;
      sourceKind: "LOOT_BOX" | "MISSION" | "BATTLE_PASS" | "MANUAL";
      sourceLabel: string | null;
      rewardCode: string | null;
      claimPayload: string | null;
      qualifiedAt: string;
      expiresAt: string | null;
    }>;
    bonusHistory: {
      summary: {
        total: number;
        confirmedAmount: number;
        pendingAmount: number;
        failed: number;
        latestAt: string | null;
      };
      items: Array<{
        id: string;
        status:
          | "PENDING"
          | "PROCESSING"
          | "CONFIRMED"
          | "FAILED"
          | "CANCELED"
          | "UNKNOWN";
        statusLabel: string;
        amount: number;
        balanceAfter: number | null;
        title: string;
        sourceKind: "LOOT_BOX" | "MISSION" | "BATTLE_PASS" | "MANUAL";
        sourceLabel: string | null;
        storeName: string | null;
        occurredAt: string;
        confirmedAt: string | null;
        processedAt: string | null;
      }>;
    };
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

export type GuestPortalGameJourneyStepId =
  | "PROFILE"
  | "LANGAME"
  | "CHECK_IN"
  | "MISSION"
  | "REWARD"
  | "BONUS";

export type GuestPortalGameJourneyStepStatus =
  | "DONE"
  | "CURRENT"
  | "WAITING"
  | "ATTENTION";

export type GuestPortalGameJourney = {
  summary: {
    completed: number;
    total: number;
    readyPercent: number;
    nextStepId: GuestPortalGameJourneyStepId | null;
    nextStepLabel: string | null;
  };
  steps: Array<{
    id: GuestPortalGameJourneyStepId;
    label: string;
    status: GuestPortalGameJourneyStepStatus;
    hint: string;
    anchor:
      | "profile"
      | "langame-match"
      | "progress"
      | "missions"
      | "rewards";
  }>;
};

export type GuestPortalGameSummary = {
  generatedAt: string;
  tenant: GuestPortalPayload["tenant"];
  store: GuestPortalPayload["store"];
  profile: GuestPortalPayload["profile"];
  referral: {
    status: "READY";
    code: string;
    link: string;
    shareText: string;
    channelHint: string;
    stats: {
      acceptedCount: number;
      eligibleCount: number;
      latestAcceptedAt: string | null;
    };
  };
  account: {
    guestFound: boolean;
    state: GuestPortalPayload["guestSnapshot"]["participation"]["accountState"];
    stateLabel: string;
    readinessPercent: number;
    langameLinked: boolean;
  };
  loyalty: Pick<
    GuestPortalPayload["loyalty"],
    | "groupName"
    | "discountPercent"
    | "bonusBalance"
    | "bonusBalanceSource"
    | "bonusBalanceSyncedAt"
  >;
  rewards: {
    summary: GuestPortalPayload["gamification"]["rewardSummary"];
    ready: GuestPortalPayload["gamification"]["rewards"];
    recent: Array<
      Pick<
        GuestPortalPayload["gamification"]["rewards"][number],
        | "id"
        | "walletState"
        | "rewardType"
        | "rewardAmount"
        | "rewardLabel"
        | "rewardRarity"
        | "rewardRarityLabel"
        | "rewardDropChance"
        | "sourceId"
        | "sourceKind"
        | "sourceLabel"
        | "rewardCode"
        | "claimPayload"
        | "qualifiedAt"
        | "expiresAt"
      >
    >;
    latestBonus:
      | GuestPortalPayload["gamification"]["bonusHistory"]["items"][number]
      | null;
    bonusHistory: {
      summary: GuestPortalPayload["gamification"]["bonusHistory"]["summary"];
      items: GuestPortalPayload["gamification"]["bonusHistory"]["items"];
    };
  };
  lootBoxes: {
    total: number;
    featured: Array<
      Pick<
        GuestPortalPayload["gamification"]["lootBoxes"][number],
        | "id"
        | "name"
        | "triggerKind"
        | "rewardLabel"
        | "rewardType"
        | "caseRarity"
        | "caseRarityLabel"
        | "openState"
        | "openable"
        | "openBlocker"
        | "weeklyOpenedCount"
        | "weeklyLimit"
        | "dailyOpenedCount"
        | "dailyLimit"
        | "openedCount"
        | "readyRewards"
        | "waitingApprovalRewards"
        | "redeemedRewards"
        | "latestReward"
      >
    >;
  };
  promoCards: {
    total: number;
    featured: GuestPortalPayload["gamification"]["promoCards"];
  };
  missions: {
    total: number;
    featured: Array<
      Pick<
        GuestPortalPayload["gamification"]["missions"][number],
        | "id"
        | "name"
        | "rewardLabel"
        | "xpReward"
        | "progressCurrent"
        | "progressTarget"
        | "progressUnit"
        | "progressPercent"
        | "questSteps"
        | "periodTo"
        | "manualApprovalRequired"
        | "rewardStatus"
      >
    >;
    history: Array<
      Pick<
        GuestPortalPayload["gamification"]["missions"][number],
        | "id"
        | "name"
        | "rewardLabel"
        | "xpReward"
        | "progressCurrent"
        | "progressTarget"
        | "progressUnit"
        | "progressPercent"
        | "questSteps"
        | "periodTo"
        | "manualApprovalRequired"
        | "rewardStatus"
      >
    >;
  };
  battlePass: {
    active: (Pick<
      GuestPortalPayload["gamification"]["seasons"][number],
      | "id"
      | "name"
      | "currentLevel"
      | "nextLevel"
      | "progressPercent"
      | "xpToNextLevel"
      | "nextRewardLabel"
      | "readyRewards"
      | "waitingApprovalRewards"
    > & {
      levels: Array<
        Pick<
          GuestPortalPayload["gamification"]["seasons"][number]["levels"][number],
          | "level"
          | "xp"
          | "freeReward"
          | "premiumReward"
          | "reached"
          | "current"
          | "next"
        >
      >;
    }) | null;
  };
  progress: {
    summary: {
      xp: number;
      level: number;
      levelProgressPercent: number;
      xpToNextLevel: number;
      missionsTotal: number;
      missionsCompleted: number;
      missionsAlmostDone: number;
      rewardsReady: number;
      rewardsWaitingApproval: number;
      confirmedBonusAmount: number;
      pendingBonusAmount: number;
      lastActivityAt: string | null;
    };
    timeline: GuestPortalGameProgressTimelineItem[];
  };
  journey: GuestPortalGameJourney;
  nextActions: GuestPortalPayload["gamification"]["nextActions"];
  activity: Pick<
    GuestPortalPayload["activity"]["summary"],
    "sessionsCount" | "playMinutes" | "gameEventsCount" | "lastActivityAt"
  > & {
    recent: Array<
      Pick<
        GuestPortalPayload["activity"]["timeline"][number],
        | "id"
        | "kind"
        | "title"
        | "description"
        | "occurredAt"
        | "storeName"
        | "xpDelta"
      >
    >;
  };
  communications: {
    phoneConsentStatus: GuestPortalPayload["communications"]["phone"]["consentStatus"];
    telegram: Pick<
      GuestPortalPayload["communications"]["telegram"],
      "connected" | "readyForRewards" | "status"
    >;
    max: Pick<
      GuestPortalPayload["communications"]["max"],
      "connected" | "readyForRewards" | "status"
    >;
  };
};

export type GuestPortalClubSelectResponse = {
  token: string;
  portal: GuestPortalPayload;
  summary: GuestPortalGameSummary;
  clubId: string;
  message: string;
};

export type GuestPortalOtpVerifyResponse = {
  token: string;
  portal: GuestPortalPayload;
  match: GuestPortalLocalGameProfileMatch;
};

export type GuestPortalLocalGameProfileMatch = {
  checkedAt: string;
  status:
    | "MATCHED_LOCAL"
    | "FOUND_IN_LANGAME"
    | "WAITING_FOR_SYNC"
    | "CONFLICT"
    | "NOT_FOUND"
    | "FAILED"
    | "NOT_LINKED";
  localGuestFound: boolean;
  localGuestId: string | null;
  profileId: string | null;
  linkStatus:
    | "LINKED"
    | "ALREADY_LINKED"
    | "WAITING_FOR_SYNC"
    | "CONFLICT"
    | "NOT_LINKED";
  linkedGuestId: string | null;
  linkedProfileId: string | null;
  backfilled: {
    rewards: number;
    events: number;
    deliveries: number;
    bonusLedgerEntries: number;
  };
  nextAction: string;
};

export type GuestPortalCheckInResponse = {
  checkIn: {
    checkedIn: true;
    checkedAt: string;
    liveSession: {
      externalDomain: string;
      externalSessionId: string;
      externalUuid: string | null;
      startedAt: string | null;
      durationMinutes: number | null;
      sessionType: string;
      sessionPacket: boolean | null;
      store: { id: string; name: string } | null;
    };
    processResult: {
      summary: {
        appliedXpDelta: number;
        createdRewards: number;
        queuedRewardAmount: number;
      };
    };
    note: string;
  };
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

export type GuestPortalTelegramAuthStartResponse = {
  challengeId: string;
  codeMasked: string;
  expiresAt: string;
  botUsername: string | null;
  botDeepLink: string | null;
  status: "READY" | "BOT_NOT_CONFIGURED";
  message: string;
};

export type GuestPortalTelegramAuthStatusResponse = {
  status: "PENDING" | "AWAITING_CONTACT" | "CONFIRMED" | "EXPIRED" | "FAILED";
  token?: string;
  portal?: GuestPortalPayload;
  match?: GuestPortalLocalGameProfileMatch;
  profileId: string | null;
  phoneMasked?: string | null;
  telegramIdentityMasked?: string | null;
  message: string;
};

export type GuestPortalTelegramMiniAppClub = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  storeId: string;
  storePublicSlug: string | null;
  storeName: string;
  storeAddress: string | null;
  clubId: string;
  profileId: string;
};

export type GuestPortalTelegramMiniAppSessionResponse = {
  status:
    | "CONFIRMED"
    | "AUTH_REQUIRED"
    | "CLUB_SELECTION_REQUIRED"
    | "EXPIRED"
    | "FAILED";
  token?: string;
  portal?: GuestPortalPayload;
  summary?: GuestPortalGameSummary;
  profileId: string | null;
  phoneMasked?: string | null;
  telegramIdentityMasked: string | null;
  clubs?: GuestPortalTelegramMiniAppClub[];
  message: string;
};

export type GuestPortalUserCallAuthStartResponse = {
  challengeId: string;
  phoneMasked: string;
  callNumber: string;
  callHref: string;
  freeCall: boolean;
  expiresAt: string;
  status: "PENDING";
  message: string;
};

export type GuestPortalUserCallAuthStatusResponse = {
  status: "PENDING" | "CONFIRMED" | "EXPIRED" | "FAILED";
  token?: string;
  portal?: GuestPortalPayload;
  match?: GuestPortalLocalGameProfileMatch;
  profileId: string | null;
  phoneMasked: string | null;
  message: string;
};

export type GuestPortalIncomingCallLast4StartResponse = {
  challengeId: string;
  phoneMasked: string;
  expiresAt: string;
  status: "PENDING" | "NOT_CONFIGURED" | "BLOCKED" | "FAILED";
  delivery: {
    status: "DEV_CODE" | "SENT" | "NOT_CONFIGURED" | "BLOCKED" | "FAILED";
    devCode?: string;
    message: string;
    note?: string;
    requiredEnv?: string[];
  };
  message: string;
};

export type GuestPortalIncomingCallLast4VerifyResponse =
  GuestPortalOtpVerifyResponse;

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
  linkStatus:
    | "LINKED"
    | "ALREADY_LINKED"
    | "WAITING_FOR_SYNC"
    | "CONFLICT"
    | "NOT_LINKED";
  linkedGuestId: string | null;
  linkedProfileId: string | null;
  backfilled: {
    rewards: number;
    events: number;
    deliveries: number;
    bonusLedgerEntries: number;
  };
  nextAction: string;
  portal: GuestPortalPayload | null;
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
