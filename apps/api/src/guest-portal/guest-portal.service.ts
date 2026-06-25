import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import {
  GuestCommunicationConsentStatus,
  GuestCrmStatus,
  type GuestPortalOtpChallenge,
  IntegrationProvider,
  Prisma,
  TenantLifecycleStatus,
  UserRole,
} from '@prisma/client';
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  GuestGamificationService,
  type GuestGameCheckInResult,
  type GuestGameProcessEventResult,
} from '../guest-gamification/guest-gamification.service';
import { SecretEncryptionService } from '../integrations/secret-encryption.service';
import {
  evaluateGuestGameProgress,
  type GuestGameProgressEvent,
} from '../guest-gamification/guest-game-progress';
import { LangameSettingsService } from '../integrations/langame-settings.service';
import type {
  LangameGuestBalancesPortalResult,
  LangameGuestDetailsPortalResult,
  LangameGuestSearchResultItem,
} from '../integrations/langame.types';
import { PrismaService } from '../prisma/prisma.service';

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_SECONDS = 60;
const OTP_SMS_RATE_LIMIT_PHONE_WINDOW_MINUTES = 60;
const OTP_SMS_RATE_LIMIT_PHONE_MAX = 3;
const OTP_SMS_RATE_LIMIT_STORE_WINDOW_MINUTES = 10;
const OTP_SMS_RATE_LIMIT_STORE_MAX = 30;
const OTP_SMS_RATE_LIMIT_TENANT_WINDOW_MINUTES = 24 * 60;
const OTP_SMS_RATE_LIMIT_TENANT_MAX = 300;
const GUEST_TOKEN_EXPIRES_IN = '7d';
const GUEST_PORTAL_PURPOSE = 'guest_portal';
const TELEGRAM_LINK_TTL_MINUTES = 15;
const TELEGRAM_MINI_APP_INIT_DATA_TTL_SECONDS = 60 * 60 * 24;
const TELEGRAM_AUTH_PROFILE_STATUS = 'PENDING_TELEGRAM_AUTH';
const TELEGRAM_AUTH_MERGED_PROFILE_STATUS = 'MERGED_TELEGRAM_AUTH';
const TELEGRAM_AUTH_PENDING_STATUS = 'AUTH_PENDING';
const TELEGRAM_AUTH_AWAITING_CONTACT_STATUS = 'AUTH_AWAITING_CONTACT';
const TELEGRAM_AUTH_VERIFIED_STATUS = 'AUTH_VERIFIED';
const TELEGRAM_AUTH_SESSION_ISSUED_STATUS = 'AUTH_SESSION_ISSUED';
const USER_CALL_AUTH_CHANNEL = 'USER_CALL';
const USER_CALL_AUTH_CONFIRMED_STATUS = 'CALL_CONFIRMED';
const USER_CALL_AUTH_SESSION_ISSUED_STATUS = 'CALL_SESSION_ISSUED';
const USER_CALL_PROVIDER_MANUAL = 'MANUAL';
const USER_CALL_PROVIDER_SMS_RU_CALLCHECK = 'SMS_RU_CALLCHECK';
const SMS_RU_CALLCHECK_BASE_URL = 'https://sms.ru';
const SMS_RU_CALLCHECK_TTL_MINUTES = 5;
const SMS_RU_OTP_BASE_URL = 'https://sms.ru';
const INCOMING_CALL_LAST4_CHANNEL = 'INCOMING_CALL_LAST4';
const COMMUNICATION_PREFERENCE_EVENT_PREFIX =
  'guest_portal:communication_preference:';
const TELEGRAM_LINK_EVENT_PREFIX = 'guest_portal:telegram_bot_link:';
const TELEGRAM_AUTH_EVENT_PREFIX = 'guest_portal:telegram_auth:';
const GAME_CONSENT_EVENT_TYPE = 'GAME_CONSENT_GRANTED';
const GAME_COMMUNICATION_CONSENT_EVENT_TYPE =
  'GAME_COMMUNICATION_CONSENT_UPDATED';
const GAME_CONSENT_VERSION = 'guest-game-v1-2026-06-15';
const GAME_PROFILE_CONSENT_SOURCE = 'guest_portal_game_consent';
const TELEGRAM_AUTH_CONSENT_SOURCE = 'telegram_auth_contact_share';
const GAME_PROFILE_LINKED_EVENT_TYPE = 'GAME_PROFILE_LINKED';
const GAME_PROFILE_LINK_SOURCE = 'GUEST_PORTAL_PROFILE_LINK';
const GAME_PROFILE_LANGAME_AUTO_MATCH_EVENT_TYPE =
  'GAME_PROFILE_LANGAME_AUTO_MATCH';
const GAME_PROFILE_LANGAME_AUTO_MATCH_SOURCE =
  'GUEST_PORTAL_LANGAME_AUTO_MATCH';
const GAME_SUMMARY_MISSION_LIMIT = 10;
const GAME_SUMMARY_MISSION_HISTORY_LIMIT = 12;
const GUEST_GAME_REFERRAL_CODE_PREFIX = 'lp_ref_';
const GAME_REFERRAL_ACCEPTED_EVENT_TYPE = 'GAME_REFERRAL_ACCEPTED';
const GAME_REFERRAL_EVENT_SOURCE = 'GUEST_PORTAL_REFERRAL';
const GUEST_GAME_REFERRAL_LOOKUP_LIMIT = 5000;
const GUEST_GAME_REFERRAL_CODE_PATTERN = /^lp_ref_[A-Za-z0-9_-]{16,64}$/;
const GAME_APP_OPEN_EVENT_TYPE = 'APP_OPEN';
const GAME_APP_OPEN_SOURCE_KIND = 'GUEST_APP_OPEN';
const GAME_APP_OPEN_EXTERNAL_DOMAIN = 'leetplus-guest-portal';
const GAME_LOOT_BOX_OPEN_SOURCE_KIND = 'GUEST_LOOT_BOX_OPEN';
const GAME_PROFILE_STAFF_TEST_REASON_STAFF_PHONE = 'STAFF_PHONE_MATCH';
const GAME_PROFILE_STAFF_TEST_REASON_LANGAME_STAFF_PHONE =
  'LANGAME_STAFF_PHONE_MATCH';
type JwtExpiresIn = NonNullable<JwtSignOptions['expiresIn']>;
type GuestPortalAppOpenSurface = 'WEB' | 'SITE' | 'TG_MINI_APP';
type GuestPortalOtpDeliveryChannel = 'DEV' | 'SMS' | 'TELEGRAM' | 'MAX';
type GuestPortalOtpDeliveryStatus =
  | 'DEV_CODE'
  | 'SENT'
  | 'NOT_CONFIGURED'
  | 'BLOCKED'
  | 'FAILED';
type GuestPortalOtpDeliveryResult = {
  channel: GuestPortalOtpDeliveryChannel;
  status: GuestPortalOtpDeliveryStatus;
  deliveredAt: Date | null;
  devCode?: string;
  message: string;
  note?: string;
  identityMasked?: string | null;
  requiredEnv?: string[];
};
type GuestPortalIncomingCallLast4DeliveryResult = Omit<
  GuestPortalOtpDeliveryResult,
  'channel' | 'identityMasked'
>;
type GuestPortalVerificationChannel =
  | 'TELEGRAM_BOT'
  | 'USER_CALL'
  | 'SMS_CODE'
  | 'INCOMING_CALL_LAST4';
type GuestPortalVerificationRole = 'PRIMARY' | 'FALLBACK' | 'RESERVE';
type GuestPortalVerificationStatus =
  | 'READY'
  | 'READY_AFTER_OTP'
  | 'NOT_CONFIGURED'
  | 'PLANNED';
type TelegramBotCommand =
  | 'MENU'
  | 'PROFILE'
  | 'QUESTS'
  | 'REWARDS'
  | 'CLUBS'
  | 'CHECK_IN'
  | 'HELP';
type TelegramMiniAppTab = 'quests' | 'rewards' | 'profile';
type GuestPortalPhoneIdentity = {
  normalized: string;
  hash: string;
  masked: string;
};
type GuestPortalStaffTestMatch = {
  reason: string;
  matchedAt: Date;
};
type GuestPortalUserCallProvider =
  | typeof USER_CALL_PROVIDER_MANUAL
  | typeof USER_CALL_PROVIDER_SMS_RU_CALLCHECK;
type GuestPortalUserCallConfig = ReturnType<typeof guestPortalUserCallConfig>;
type GuestPortalUserCallProviderStart = {
  providerName: GuestPortalUserCallProvider;
  providerChallengeId: string | null;
  callNumber: string;
  callHref: string;
  freeCall: boolean;
  message: string;
};
type SmsRuCallcheckAddResponse = {
  status?: string;
  status_code?: string | number;
  check_id?: string | number;
  call_phone?: string | number;
  call_phone_pretty?: string;
  status_text?: string;
};
type SmsRuCallcheckStatusResponse = {
  status?: string;
  status_code?: string | number;
  check_status?: string | number;
  status_text?: string;
};

type GuestPortalTokenPayload = {
  sub: string;
  purpose: typeof GUEST_PORTAL_PURPOSE;
  tenantId: string;
  storeId: string;
  guestId: string | null;
  profileId: string | null;
  phoneHash: string;
};

type GuestPortalOtpChallengeRegistration = {
  id: string;
  tenantId: string;
  storeId: string;
  guestId: string | null;
  profileId: string | null;
  phoneHash: string;
  phoneMasked: string | null;
  phoneEncrypted: string | null;
  gameConsentAcceptedAt: Date | null;
  gameConsentVersion: string | null;
};

type GuestGameReferralRegistrationChannel =
  | 'OTP'
  | 'TELEGRAM_BOT'
  | 'USER_CALL'
  | 'INCOMING_CALL_LAST4';

type GuestGameReferralRegistrationOptions = {
  code: string | null;
  channel: GuestGameReferralRegistrationChannel;
  externalId: string;
};

type TelegramMiniAppValidationResult =
  | {
      ok: true;
      userId: string;
      username: string | null;
      authDate: Date;
    }
  | {
      ok: false;
      status: 'AUTH_REQUIRED' | 'EXPIRED' | 'FAILED';
      telegramIdentityMasked: string | null;
      message: string;
    };

type TelegramMiniAppClubSelection = {
  clubId: string | null;
  tenantSlug: string | null;
  storeId: string | null;
};

type TelegramMiniAppClubCandidate = {
  profile: {
    id: string;
    guestId: string | null;
    phoneHash: string;
    contactMasked: string | null;
    unsubscribedAt: Date | null;
  };
  tenant: {
    id: string;
    slug: string;
    name: string;
  };
  store: {
    id: string;
    publicSlug: string | null;
    name: string;
    city: string | null;
    address: string | null;
  };
  telegramLinkChallengeId: string | null;
};

type TelegramBotCityGroup = {
  city: string;
  candidates: TelegramMiniAppClubCandidate[];
};

type GuestPortalGameProfileLinkStatus =
  | 'LINKED'
  | 'ALREADY_LINKED'
  | 'WAITING_FOR_SYNC'
  | 'CONFLICT'
  | 'NOT_LINKED';

type GuestPortalGameProfileBackfillSummary = {
  rewards: number;
  events: number;
  deliveries: number;
  bonusLedgerEntries: number;
};

type GuestPortalGameProfileLinkResult = {
  status: GuestPortalGameProfileLinkStatus;
  guestId: string | null;
  profileId: string | null;
  linkedNow: boolean;
  backfilled: GuestPortalGameProfileBackfillSummary;
};

type GuestPortalLocalGameProfileMatchStatus =
  | 'MATCHED_LOCAL'
  | 'FOUND_IN_LANGAME'
  | 'WAITING_FOR_SYNC'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'FAILED'
  | 'NOT_LINKED';

export type GuestPortalLocalGameProfileMatch = {
  checkedAt: string;
  status: GuestPortalLocalGameProfileMatchStatus;
  localGuestFound: boolean;
  localGuestId: string | null;
  profileId: string | null;
  linkStatus: GuestPortalGameProfileLinkStatus;
  linkedGuestId: string | null;
  linkedProfileId: string | null;
  backfilled: GuestPortalGameProfileBackfillSummary;
  nextAction: string;
};

type TenantStoreContext = {
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  store: {
    id: string;
    publicSlug: string | null;
    name: string;
    address: string | null;
    externalDomain: string | null;
    externalClubId: string | null;
    integrationSourceId: string | null;
  };
};

type GuestPortalBuildOptions = {
  refreshLiveBalances?: boolean;
};

type GuestPortalBalanceScope = {
  sourceDomain: string;
  externalClubId: string | null;
  externalGuestId: string;
};

type GuestPortalBalanceSnapshotRow = {
  balance: Prisma.Decimal;
  snapshotDate: Date;
};

type GuestPortalBonusBalanceCurrentRow = {
  bonusBalance: Prisma.Decimal;
  snapshotDate: Date;
  source: string;
  lastSyncedAt: Date | null;
  updatedAt: Date;
};

type GuestPortalBonusBalanceSnapshotRow = {
  bonusBalance: Prisma.Decimal;
  snapshotDate: Date;
};

type GuestPortalLiveBalanceRefresh = {
  balanceSnapshot: GuestPortalBalanceSnapshotRow | null;
  bonusBalanceCurrent: GuestPortalBonusBalanceCurrentRow | null;
  bonusBalanceSnapshot: GuestPortalBonusBalanceSnapshotRow | null;
};

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
  verification: {
    recommendedChannel: GuestPortalVerificationChannel;
    phoneRequired: boolean;
    options: Array<{
      rank: number;
      channel: GuestPortalVerificationChannel;
      role: GuestPortalVerificationRole;
      status: GuestPortalVerificationStatus;
      label: string;
      statusLabel: string;
      message: string;
      nextAction: string;
      botUsername: string | null;
      requiredEnv: string[];
      freeCall?: boolean;
    }>;
  };
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
  clubs: Array<{
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
  }>;
};

export type GuestPortalOtpStartResponse = {
  challengeId: string;
  phoneMasked: string;
  expiresAt: string;
  resendAfterSeconds: number;
  delivery: {
    channel: GuestPortalOtpDeliveryChannel;
    status: GuestPortalOtpDeliveryStatus;
    devCode?: string;
    message: string;
    note?: string;
    identityMasked?: string | null;
    requiredEnv?: string[];
  };
};

export type GuestPortalOtpVerifyResponse = {
  token: string;
  portal: GuestPortalPayload;
  match: GuestPortalLocalGameProfileMatch;
};

export type GuestPortalCommunicationPreferenceAction =
  | 'GRANT'
  | 'DENY'
  | 'UNSUBSCRIBE';

export type GuestPortalCommunicationHistoryItem = {
  id: string;
  action: GuestPortalCommunicationPreferenceAction;
  label: string;
  note: string;
  createdAt: string;
};

export type GuestPortalCommunicationPreferenceResponse = {
  portal: GuestPortalPayload;
  message: string;
};

export type GuestPortalMessengerChannel = 'TELEGRAM' | 'MAX';

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
  status: 'READY' | 'BOT_NOT_CONFIGURED';
  message: string;
};

export type GuestPortalTelegramAuthStatusResponse = {
  status: 'PENDING' | 'AWAITING_CONTACT' | 'CONFIRMED' | 'EXPIRED' | 'FAILED';
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
    | 'CONFIRMED'
    | 'AUTH_REQUIRED'
    | 'CLUB_SELECTION_REQUIRED'
    | 'EXPIRED'
    | 'FAILED';
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
  status: 'PENDING';
  message: string;
};

export type GuestPortalUserCallAuthStatusResponse = {
  status: 'PENDING' | 'CONFIRMED' | 'EXPIRED' | 'FAILED';
  token?: string;
  portal?: GuestPortalPayload;
  match?: GuestPortalLocalGameProfileMatch;
  profileId: string | null;
  phoneMasked: string | null;
  message: string;
};

export type GuestPortalUserCallConfirmResponse = {
  status: 'CONFIRMED' | 'EXPIRED' | 'FAILED';
  challengeId: string;
  phoneMasked: string | null;
  message: string;
};

export type GuestPortalIncomingCallLast4StartResponse = {
  challengeId: string;
  phoneMasked: string;
  expiresAt: string;
  status: 'PENDING' | 'NOT_CONFIGURED' | 'BLOCKED' | 'FAILED';
  delivery: {
    status: GuestPortalOtpDeliveryStatus;
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
  status: 'READY' | 'BOT_NOT_CONFIGURED';
  message: string;
};

export type GuestPortalTelegramLinkConfirmResponse = {
  status: 'CONFIRMED';
  tenantId: string;
  profileId: string;
  telegramIdentityMasked: string | null;
  message: string;
};

export type GuestPortalTelegramWebhookResponse = {
  status:
    | 'CONFIRMED'
    | 'AWAITING_CONTACT'
    | 'UNSUBSCRIBED'
    | 'IGNORED'
    | 'FAILED';
  action:
    | 'LINK_CODE'
    | 'TELEGRAM_AUTH_START'
    | 'TELEGRAM_AUTH_CONTACT'
    | 'TELEGRAM_BOT_STATUS'
    | 'TELEGRAM_BOT_MENU'
    | 'TELEGRAM_BOT_PROFILE'
    | 'TELEGRAM_BOT_QUESTS'
    | 'TELEGRAM_BOT_REWARDS'
    | 'TELEGRAM_BOT_CHECK_IN'
    | 'TELEGRAM_BOT_CITIES'
    | 'TELEGRAM_BOT_CITY_CLUBS'
    | 'TELEGRAM_BOT_CLUBS'
    | 'TELEGRAM_BOT_CLUB_SELECTED'
    | 'TELEGRAM_BOT_HELP'
    | 'UNSUBSCRIBE'
    | 'UNKNOWN';
  profileId: string | null;
  profilesAffected?: number;
  deliveriesBlocked?: number;
  telegramIdentityMasked: string | null;
  message: string;
  reply?: {
    provider: 'TELEGRAM';
    method: 'sendMessage';
    chatIdMasked: string | null;
    text: string;
    replyMarkup?:
      | {
          keyboard: Array<
            Array<{
              text: string;
              request_contact?: boolean;
              web_app?: {
                url: string;
              };
            }>
          >;
          resize_keyboard: boolean;
          one_time_keyboard: boolean;
        }
      | {
          inline_keyboard: Array<
            Array<{
              text: string;
              url?: string;
              callback_data?: string;
              web_app?: {
                url: string;
              };
            }>
          >;
        }
      | {
          remove_keyboard: boolean;
        };
  };
  replyDispatch?: {
    provider: 'TELEGRAM';
    status: 'DISABLED' | 'SKIPPED' | 'SENT' | 'FAILED';
    chatIdMasked: string | null;
    message: string;
    requiredEnv?: string[];
    error?: string;
  };
};

export type GuestPortalPayload = {
  tenant: GuestPortalPublicConfig['tenant'];
  store: GuestPortalPublicConfig['store'];
  guestFound: boolean;
  crmLead: GuestPortalCrmLead;
  profile: {
    id: string | null;
    displayName: string;
    contactMasked: string | null;
    isStaffTest: boolean;
    xp: number;
    level: number;
    nextLevelXp: number;
    levelProgressPercent: number;
    frame: 'starter' | 'bronze' | 'silver' | 'gold' | 'diamond';
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
  guestSnapshot: GuestPortalGuestSnapshot;
  gamification: {
    nextActions: GuestPortalNextAction[];
    lootBoxes: GuestPortalLootBox[];
    missions: GuestPortalMission[];
    seasons: GuestPortalSeason[];
    promoCards: GuestPortalPromoCard[];
    rewardSummary: GuestPortalRewardSummary;
    rewards: GuestPortalReward[];
    bonusHistory: GuestPortalBonusHistory;
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
    timeline: GuestPortalActivityItem[];
    xpHistory: GuestPortalXpHistoryItem[];
  };
  communications: GuestPortalCommunications;
};

export type GuestPortalGameJourneyStepId =
  | 'PROFILE'
  | 'LANGAME'
  | 'CHECK_IN'
  | 'MISSION'
  | 'REWARD'
  | 'BONUS';

export type GuestPortalGameJourneyStepStatus =
  | 'DONE'
  | 'CURRENT'
  | 'WAITING'
  | 'ATTENTION';

export type GuestPortalGameJourneyStep = {
  id: GuestPortalGameJourneyStepId;
  label: string;
  status: GuestPortalGameJourneyStepStatus;
  hint: string;
  anchor: 'profile' | 'langame-match' | 'progress' | 'missions' | 'rewards';
};

export type GuestPortalGameJourney = {
  summary: {
    completed: number;
    total: number;
    readyPercent: number;
    nextStepId: GuestPortalGameJourneyStepId | null;
    nextStepLabel: string | null;
  };
  steps: GuestPortalGameJourneyStep[];
};

export type GuestPortalReferralStats = {
  acceptedCount: number;
  eligibleCount: number;
  latestAcceptedAt: string | null;
};

export type GuestPortalPromoCard = {
  id: string;
  label: string | null;
  title: string;
  description: string | null;
  tag: string | null;
  targetAnchor: string | null;
  periodTo: string | null;
};

export type GuestPortalGameSummary = {
  generatedAt: string;
  tenant: GuestPortalPayload['tenant'];
  store: GuestPortalPayload['store'];
  profile: GuestPortalPayload['profile'];
  referral: {
    status: 'READY';
    code: string;
    link: string;
    shareText: string;
    channelHint: string;
    stats: GuestPortalReferralStats;
  };
  account: {
    guestFound: boolean;
    state: GuestPortalGuestSnapshot['participation']['accountState'];
    stateLabel: string;
    readinessPercent: number;
    langameLinked: boolean;
  };
  loyalty: Pick<
    GuestPortalPayload['loyalty'],
    | 'groupName'
    | 'discountPercent'
    | 'bonusBalance'
    | 'bonusBalanceSource'
    | 'bonusBalanceSyncedAt'
  >;
  rewards: {
    summary: GuestPortalRewardSummary;
    ready: GuestPortalReward[];
    recent: Array<
      Pick<
        GuestPortalReward,
        | 'id'
        | 'walletState'
        | 'rewardType'
        | 'rewardAmount'
        | 'rewardLabel'
        | 'rewardRarity'
        | 'rewardRarityLabel'
        | 'rewardDropChance'
        | 'sourceId'
        | 'sourceKind'
        | 'sourceLabel'
        | 'rewardCode'
        | 'claimPayload'
        | 'qualifiedAt'
        | 'expiresAt'
      >
    >;
    latestBonus: GuestPortalBonusHistoryItem | null;
    bonusHistory: {
      summary: GuestPortalBonusHistory['summary'];
      items: GuestPortalBonusHistoryItem[];
    };
  };
  lootBoxes: {
    total: number;
    featured: Array<
      Pick<
        GuestPortalLootBox,
        | 'id'
        | 'name'
        | 'triggerKind'
        | 'rewardLabel'
        | 'rewardType'
        | 'openState'
        | 'openable'
        | 'openBlocker'
        | 'weeklyOpenedCount'
        | 'weeklyLimit'
        | 'dailyOpenedCount'
        | 'dailyLimit'
        | 'openedCount'
        | 'readyRewards'
        | 'waitingApprovalRewards'
        | 'redeemedRewards'
        | 'latestReward'
      >
    >;
  };
  promoCards: {
    total: number;
    featured: GuestPortalPromoCard[];
  };
  missions: {
    total: number;
    featured: Array<
      Pick<
        GuestPortalMission,
        | 'id'
        | 'name'
        | 'rewardLabel'
        | 'xpReward'
        | 'progressCurrent'
        | 'progressTarget'
        | 'progressUnit'
        | 'progressPercent'
        | 'questSteps'
        | 'periodTo'
        | 'manualApprovalRequired'
        | 'rewardStatus'
      >
    >;
    history: Array<
      Pick<
        GuestPortalMission,
        | 'id'
        | 'name'
        | 'rewardLabel'
        | 'xpReward'
        | 'progressCurrent'
        | 'progressTarget'
        | 'progressUnit'
        | 'progressPercent'
        | 'questSteps'
        | 'periodTo'
        | 'manualApprovalRequired'
        | 'rewardStatus'
      >
    >;
  };
  battlePass: {
    active:
      | (Pick<
          GuestPortalSeason,
          | 'id'
          | 'name'
          | 'currentLevel'
          | 'nextLevel'
          | 'progressPercent'
          | 'xpToNextLevel'
          | 'nextRewardLabel'
          | 'readyRewards'
          | 'waitingApprovalRewards'
        > & {
          levels: Array<
            Pick<
              GuestPortalSeason['levels'][number],
              | 'level'
              | 'xp'
              | 'freeReward'
              | 'premiumReward'
              | 'reached'
              | 'current'
              | 'next'
            >
          >;
        })
      | null;
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
  nextActions: GuestPortalNextAction[];
  activity: Pick<
    GuestPortalPayload['activity']['summary'],
    'sessionsCount' | 'playMinutes' | 'gameEventsCount' | 'lastActivityAt'
  > & {
    recent: Array<
      Pick<
        GuestPortalActivityItem,
        | 'id'
        | 'kind'
        | 'title'
        | 'description'
        | 'occurredAt'
        | 'storeName'
        | 'xpDelta'
      >
    >;
  };
  communications: {
    phoneConsentStatus: GuestPortalCommunications['phone']['consentStatus'];
    telegram: Pick<
      GuestPortalCommunicationChannel,
      'connected' | 'readyForRewards' | 'status'
    >;
    max: Pick<
      GuestPortalCommunicationChannel,
      'connected' | 'readyForRewards' | 'status'
    >;
  };
};

export type GuestPortalGameProgressTimelineItem = {
  id: string;
  kind: 'ACTIVITY' | 'REWARD' | 'BONUS_LEDGER';
  status: 'DONE' | 'READY' | 'WAITING' | 'ATTENTION';
  title: string;
  description: string | null;
  occurredAt: string;
  storeName: string | null;
  xpDelta: number | null;
  amount: number | null;
};

export type GuestPortalBonusHistory = {
  summary: {
    total: number;
    confirmedAmount: number;
    pendingAmount: number;
    failed: number;
    latestAt: string | null;
  };
  items: GuestPortalBonusHistoryItem[];
};

export type GuestPortalBonusHistoryItem = {
  id: string;
  status:
    | 'PENDING'
    | 'PROCESSING'
    | 'CONFIRMED'
    | 'FAILED'
    | 'CANCELED'
    | 'UNKNOWN';
  statusLabel: string;
  amount: number;
  balanceAfter: number | null;
  title: string;
  sourceKind: GuestPortalReward['sourceKind'];
  sourceLabel: string | null;
  storeName: string | null;
  occurredAt: string;
  confirmedAt: string | null;
  processedAt: string | null;
};

export type GuestPortalCrmLead = {
  found: boolean;
  displayName: string | null;
  contactMasked: string | null;
  source: string | null;
  eventName: string | null;
  crmStatus: GuestCrmStatus | null;
  nextContactAt: string | null;
  matchedGuestFound: boolean;
  matchedAt: string | null;
};

export type GuestPortalGuestSnapshot = {
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
      | 'LANGAME_SYNCED'
      | 'CRM_LEAD'
      | 'GAME_PROFILE'
      | 'DISABLED'
      | 'TEMPORARY'
      | 'VIRTUAL'
      | 'NOT_MATCHED';
    accountStateLabel: string;
    guestTypeId: string | null;
    genderLabel: string | null;
    registrationChannel: string;
    verificationLabel: string;
    loyaltyCardStatus: 'LINKED' | 'MISSING' | 'UNKNOWN';
    readinessPercent: number;
    readiness: GuestPortalProfileReadinessItem[];
  };
  statusLabels: string[];
};

export type GuestPortalProfileReadinessItem = {
  id: string;
  label: string;
  status: 'READY' | 'ATTENTION' | 'MISSING';
  note: string;
};

export type GuestPortalCommunications = {
  phone: {
    masked: string | null;
    consentStatus: 'UNKNOWN' | 'GRANTED' | 'DENIED' | 'UNSUBSCRIBED';
    consentSource: string | null;
    consentAt: string | null;
    unsubscribedAt: string | null;
    otpVerified: boolean;
    otpDeliveryReady: boolean;
  };
  telegram: GuestPortalCommunicationChannel;
  max: GuestPortalCommunicationChannel;
  history: GuestPortalCommunicationHistoryItem[];
};

export type GuestPortalCommunicationChannel = {
  connected: boolean;
  identityMasked: string | null;
  readyForRewards: boolean;
  status: 'READY' | 'CONNECTED_NO_CONSENT' | 'NOT_CONNECTED' | 'UNSUBSCRIBED';
};

export type GuestPortalNextAction = {
  id: string;
  kind:
    | 'CLAIM_REWARD'
    | 'OPEN_LOOT_BOX'
    | 'FINISH_MISSION'
    | 'BATTLE_PASS'
    | 'CHECK_IN'
    | 'MATCH_LANGAME';
  title: string;
  description: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  statusLabel: string;
  progressPercent: number | null;
  anchor:
    | 'rewards'
    | 'lootBoxes'
    | 'missions'
    | 'battlePass'
    | 'profile'
    | 'progress';
};

export type GuestPortalLootBox = {
  id: string;
  name: string;
  triggerKind: string;
  rewardLabel: string | null;
  rewardType: string;
  manualApprovalRequired: boolean;
  note: string | null;
  openState: 'OPENABLE' | 'WAITING_EVENT' | 'LIMIT_REACHED';
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
  latestReward: GuestPortalLootBoxReward | null;
};

export type GuestPortalLootBoxReward = {
  id: string;
  walletState:
    | 'WAITING_APPROVAL'
    | 'READY'
    | 'REDEEMED'
    | 'CANCELED'
    | 'EXPIRED';
  rewardLabel: string;
  rewardRarity: string | null;
  rewardRarityLabel: string | null;
  rewardDropChance: number | null;
  rewardCode: string | null;
  claimPayload: string | null;
  qualifiedAt: string;
  expiresAt: string | null;
};

export type GuestPortalMission = {
  id: string;
  name: string;
  missionType: string;
  rewardLabel: string | null;
  xpReward: number;
  progressCurrent: number;
  progressTarget: number | null;
  progressUnit: string | null;
  progressPercent: number;
  questSteps: GuestPortalMissionStep[];
  periodTo: string | null;
  manualApprovalRequired: boolean;
  rewardStatus: GuestPortalMissionRewardStatus;
};

export type GuestPortalMissionRewardStatus = {
  state:
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'WAITING_APPROVAL'
    | 'READY'
    | 'QUEUED'
    | 'SENDING'
    | 'CONFIRMED'
    | 'FAILED'
    | 'CANCELED'
    | 'REDEEMED'
    | 'EXPIRED';
  label: string;
  hint: string;
  rewardLabel: string | null;
  rewardAmount: number | null;
  rewardWalletState: GuestPortalReward['walletState'] | null;
  ledgerStatus: GuestPortalBonusHistoryItem['status'] | null;
  balanceAfter: number | null;
  occurredAt: string | null;
};

export type GuestPortalMissionStep = {
  id: string;
  title: string;
  target: number;
  progressCurrent: number;
  completed: boolean;
  current: boolean;
};

export type GuestPortalSeason = {
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
};

export type GuestPortalReward = {
  id: string;
  status: string;
  walletState:
    | 'WAITING_APPROVAL'
    | 'READY'
    | 'REDEEMED'
    | 'CANCELED'
    | 'EXPIRED';
  rewardType: string;
  rewardAmount: number;
  rewardLabel: string;
  rewardRarity: string | null;
  rewardRarityLabel: string | null;
  rewardDropChance: number | null;
  sourceId: string | null;
  sourceKind: 'LOOT_BOX' | 'MISSION' | 'BATTLE_PASS' | 'MANUAL';
  sourceLabel: string | null;
  rewardCode: string | null;
  claimPayload: string | null;
  qualifiedAt: string;
  expiresAt: string | null;
};

export type GuestPortalRewardSummary = {
  total: number;
  ready: number;
  waitingApproval: number;
  redeemed: number;
  expired: number;
  nextExpiresAt: string | null;
};

export type GuestPortalActivityItem = {
  id: string;
  kind: 'SESSION' | 'LOG' | 'TRANSACTION' | 'GAME_EVENT';
  title: string;
  description: string | null;
  occurredAt: string;
  storeName: string | null;
  amount: number | null;
  xpDelta: number | null;
};

export type GuestPortalXpHistoryItem = {
  id: string;
  eventType: string;
  title: string;
  description: string | null;
  xpDelta: number;
  occurredAt: string;
  sourceLabel: string | null;
};

export type GuestPortalLangameMatchResponse = {
  checkedAt: string;
  queryField: 'phone';
  phoneMasked: string;
  status: 'MATCHED_LOCAL' | 'FOUND_IN_LANGAME' | 'NOT_FOUND' | 'FAILED';
  localGuestFound: boolean;
  localGuestId: string | null;
  profileId: string | null;
  linkStatus: GuestPortalGameProfileLinkStatus;
  linkedGuestId: string | null;
  linkedProfileId: string | null;
  backfilled: GuestPortalGameProfileBackfillSummary;
  nextAction: string;
  portal: GuestPortalPayload | null;
  sources: Array<{
    id: string;
    name: string;
    domain: string;
    status: 'SUCCESS' | 'FAILED';
    resultsCount: number;
    errorMessage: string | null;
    results: Array<
      LangameGuestSearchResultItem & {
        localGuestKnown: boolean;
        localGuestId: string | null;
      }
    >;
  }>;
};

export type GuestPortalLangameDetailsResponse = {
  checkedAt: string;
  status: 'SUCCESS' | 'FAILED' | 'NOT_LINKED';
  nextAction: string;
  localSnapshot: {
    sourceDomain: string | null;
    externalGuestId: string | null;
    lastSyncedAt: string | null;
  };
  langame: LangameGuestDetailsPortalResult | null;
};

export type GuestPortalCheckInResponse = {
  checkIn: GuestGameCheckInResult;
  portal: GuestPortalPayload;
};

export type GuestPortalAppOpenResponse = {
  processed: true;
  idempotent: boolean;
  appliedXpDelta: number;
  createdRewards: number;
  queuedRewardAmount: number;
  portal: GuestPortalPayload;
  summary: GuestPortalGameSummary;
  message: string;
};

export type GuestPortalLootBoxOpenResponse = {
  processed: true;
  idempotent: boolean;
  createdRewards: number;
  queuedRewardAmount: number;
  rewards: GuestGameProcessEventResult['rewards'];
  portal: GuestPortalPayload;
  summary: GuestPortalGameSummary;
  message: string;
};

export type GuestPortalClubSelectResponse = {
  token: string;
  portal: GuestPortalPayload;
  summary: GuestPortalGameSummary;
  clubId: string;
  message: string;
};

type GuestPortalMissionProgress = {
  current: number;
  percent: number;
};

type GuestPortalBonusLedgerRow = {
  id: string;
  status: string;
  entryType: string;
  amount: Prisma.Decimal;
  balanceAfter: Prisma.Decimal | null;
  processedAt: Date | null;
  confirmedAt: Date | null;
  failedAt: Date | null;
  canceledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  reward: {
    rewardLabel: string;
    rewardType: string;
    lootBoxId: string | null;
    missionId: string | null;
    seasonId: string | null;
    lootBox?: { name: string } | null;
    mission?: { name: string } | null;
    season?: { name: string } | null;
  } | null;
  store: { name: string } | null;
};

type GuestPortalRewardRow = {
  id: string;
  status: string;
  lootBoxId: string | null;
  missionId: string | null;
  seasonId: string | null;
  rewardType: string;
  rewardAmount: Prisma.Decimal;
  rewardLabel: string;
  rewardRarity: string | null;
  rewardRarityLabel: string | null;
  rewardDropChance: Prisma.Decimal | null;
  rewardCode: string | null;
  qualifiedAt: Date;
  expiresAt: Date | null;
  lootBox?: { name: string } | null;
  mission?: { name: string } | null;
  season?: { name: string } | null;
};

type GuestPortalVisualLootBoxRef = {
  id: string | null;
  title: string | null;
};

@Injectable()
export class GuestPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly langameSettingsService: LangameSettingsService,
    private readonly guestGamificationService: GuestGamificationService,
    private readonly secretEncryptionService: SecretEncryptionService,
  ) {}

  async getPublicConfig(
    tenantSlug: string,
    storeId: string,
  ): Promise<GuestPortalPublicConfig> {
    const context = await this.getTenantStore(tenantSlug, storeId);

    return {
      tenant: {
        name: context.tenant.name,
        slug: context.tenant.slug,
      },
      store: context.store,
      otp: {
        ttlMinutes: OTP_TTL_MINUTES,
        resendSeconds: OTP_RESEND_SECONDS,
        devCodeEnabled: this.isDevOtpEnabled(),
      },
    };
  }

  async getGamificationClubDirectory(
    query: { lat?: string; lng?: string; radiusKm?: string } = {},
  ): Promise<GuestPortalGamificationClubDirectory> {
    const [stores, missions, lootBoxes, seasons] = await Promise.all([
      this.prisma.store.findMany({
        where: {
          isActive: true,
          tenant: { is: { status: TenantLifecycleStatus.ACTIVE } },
        },
        select: {
          id: true,
          publicSlug: true,
          name: true,
          city: true,
          address: true,
          latitude: true,
          longitude: true,
          externalProvider: true,
          externalDomain: true,
          gamificationEnabled: true,
          tenant: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
        orderBy: [{ city: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.guestGameMission.findMany({
        where: { status: 'ACTIVE' },
        select: {
          tenantId: true,
          storeIds: true,
          periodFrom: true,
          periodTo: true,
        },
      }),
      this.prisma.guestGameLootBox.findMany({
        where: { status: 'ACTIVE' },
        select: {
          tenantId: true,
          storeIds: true,
        },
      }),
      this.prisma.guestGameSeason.findMany({
        where: { status: 'ACTIVE' },
        select: {
          tenantId: true,
          periodFrom: true,
          periodTo: true,
        },
      }),
    ]);
    const guestLocation = geoPoint(query.lat, query.lng);
    const radiusKm = radiusNumber(query.radiusKm);
    const bonusWriteEnabled = booleanEnv(
      this.configService.get<string>('LANGAME_BONUS_ACCRUAL_ENABLED'),
    );
    const allClubs = stores
      .map((store) => {
        const activeMissions = missions.filter(
          (mission) =>
            mission.tenantId === store.tenant.id &&
            matchesStore(mission.storeIds, store.id) &&
            activePeriod(mission.periodFrom, mission.periodTo),
        ).length;
        const activeLootBoxes = lootBoxes.filter(
          (lootBox) =>
            lootBox.tenantId === store.tenant.id &&
            matchesStore(lootBox.storeIds, store.id),
        ).length;
        const activeSeasons = seasons.filter(
          (season) =>
            season.tenantId === store.tenant.id &&
            activePeriod(season.periodFrom, season.periodTo),
        ).length;
        const activeRules = activeMissions + activeLootBoxes + activeSeasons;
        const storeSlug = store.publicSlug ?? store.id;
        const latitude = decimalNumber(store.latitude);
        const longitude = decimalNumber(store.longitude);
        const city = publicStoreCity(store.city, store.address);
        const distanceKm =
          guestLocation && latitude !== null && longitude !== null
            ? haversineDistanceKm(guestLocation, { latitude, longitude })
            : null;

        return {
          id: `${store.tenant.slug}:${storeSlug}`,
          tenant: {
            name: store.tenant.name,
            slug: store.tenant.slug,
          },
          store: {
            id: store.id,
            publicSlug: store.publicSlug,
            name: store.name,
            city,
            address: store.address,
          },
          location: {
            city,
            address: store.address,
            latitude,
            longitude,
            coordinatesReady: latitude !== null && longitude !== null,
            distanceKm,
          },
          links: {
            guestPortalPath: `/guest/${encodeURIComponent(
              store.tenant.slug,
            )}/${encodeURIComponent(storeSlug)}`,
          },
          gamification: {
            activeMissions,
            activeLootBoxes,
            activeSeasons,
            activeRules,
            gamificationEnabled: store.gamificationEnabled || activeRules > 0,
            configuredByStore: store.gamificationEnabled,
            bonusWriteReady:
              bonusWriteEnabled &&
              store.externalProvider === IntegrationProvider.LANGAME &&
              Boolean(store.externalDomain),
          },
        };
      })
      .filter((club) => club.gamification.gamificationEnabled);
    const radiusApplied = Boolean(guestLocation && radiusKm !== null);
    let radiusFilteredClubs = allClubs;

    if (guestLocation && radiusKm !== null) {
      const radiusLimitKm = radiusKm;

      radiusFilteredClubs = allClubs.filter((club) => {
        const distanceKm = club.location.distanceKm;

        return distanceKm !== null && distanceKm <= radiusLimitKm;
      });
    }

    const clubs = radiusFilteredClubs.sort((left, right) =>
      compareDirectoryClubs(left, right),
    );
    const cities = uniqueStrings(clubs.map((club) => club.store.city)).sort(
      (left, right) => left.localeCompare(right, 'ru'),
    );
    const hiddenWithoutCoordinates = radiusApplied
      ? allClubs.filter((club) => club.location.distanceKm === null).length
      : 0;
    const coordinatesReady = allClubs.filter(
      (club) => club.location.coordinatesReady,
    ).length;
    const coordinatesTotal = allClubs.length;
    const coordinatesMissing = Math.max(coordinatesTotal - coordinatesReady, 0);
    const coordinatesReadyPercent =
      coordinatesTotal > 0
        ? Math.round((coordinatesReady / coordinatesTotal) * 100)
        : 0;

    return {
      updatedAt: new Date().toISOString(),
      total: clubs.length,
      cities,
      verification: this.buildGamificationVerificationPlan(),
      search: {
        locationReady: Boolean(guestLocation),
        radiusKm,
        radiusApplied,
        totalBeforeRadius: allClubs.length,
        hiddenWithoutCoordinates,
        coordinates: {
          total: coordinatesTotal,
          ready: coordinatesReady,
          missing: coordinatesMissing,
          readyPercent: coordinatesReadyPercent,
        },
      },
      clubs,
    };
  }

  private async ensureGamificationClubAvailable(
    tenantSlug: string,
    storeId: string,
  ) {
    const directory = await this.getGamificationClubDirectory();
    const club = directory.clubs.find(
      (item) => item.tenant.slug === tenantSlug && item.store.id === storeId,
    );

    if (!club) {
      throw new BadRequestException(
        'Этот клуб пока не подключен к игровому модулю LeetPlus.',
      );
    }
  }

  private buildGamificationVerificationPlan(): GuestPortalGamificationClubDirectory['verification'] {
    const otpConfig = guestPortalOtpDeliveryConfig(this.configService);
    const userCallConfig = guestPortalUserCallConfig(this.configService);
    const incomingCallLast4Config = guestPortalIncomingCallLast4Config(
      this.configService,
    );
    const devOtpEnabled = this.isDevOtpEnabled();
    const telegramBotUsername = this.telegramBotUsername();
    const telegramWebhookSecret = configString(
      this.configService,
      'GUEST_GAME_TELEGRAM_LINK_SECRET',
      'GUEST_GAME_TELEGRAM_WEBHOOK_SECRET',
    );
    const telegramReplySenderEnabled = configFlag(
      this.configService,
      'GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_ENABLED',
    );
    const telegramReplySenderToken = configString(
      this.configService,
      'GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_BOT_TOKEN',
      'GUEST_GAME_TELEGRAM_BOT_TOKEN',
      'TELEGRAM_BOT_TOKEN',
    );
    const telegramMiniAppUrl = configString(
      this.configService,
      'GUEST_GAME_TELEGRAM_MINI_APP_URL',
    );
    const telegramEdgeSharedSecret = configString(
      this.configService,
      'GUEST_GAME_TG_EDGE_SHARED_SECRET',
    );
    const telegramReplySenderReady =
      telegramReplySenderEnabled && Boolean(telegramReplySenderToken);
    const telegramPollingEdgeReady = Boolean(
      telegramMiniAppUrl && telegramEdgeSharedSecret,
    );
    const telegramTransportReady =
      telegramReplySenderReady || telegramPollingEdgeReady;
    const telegramAuthRequiredEnv = [
      ...(telegramBotUsername ? [] : ['GUEST_GAME_TELEGRAM_BOT_USERNAME']),
      ...(telegramWebhookSecret
        ? []
        : [
            'GUEST_GAME_TELEGRAM_LINK_SECRET or GUEST_GAME_TELEGRAM_WEBHOOK_SECRET',
          ]),
      ...(telegramTransportReady
        ? []
        : [
            'GUEST_GAME_TG_EDGE_SHARED_SECRET and GUEST_GAME_TELEGRAM_MINI_APP_URL (polling edge) or GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_ENABLED',
          ]),
      ...(telegramTransportReady
        ? []
        : [
            'GUEST_GAME_TG_EDGE_BOT_TOKEN on edge or GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_BOT_TOKEN on API',
          ]),
    ];
    const telegramAuthReady = telegramAuthRequiredEnv.length === 0;
    const telegramAuthMode = telegramPollingEdgeReady
      ? 'polling edge'
      : telegramReplySenderReady
        ? 'API-side sender'
        : 'not configured';
    const smsReady = devOtpEnabled || otpSmsReady(otpConfig);
    const userCallRequiredEnv = userCallConfig.requiredEnv;
    const userCallReady = userCallConfig.enabled && userCallConfig.configured;
    const incomingCallLast4RequiredEnv = [
      ...(incomingCallLast4Config.enabled
        ? []
        : ['GUEST_PORTAL_INCOMING_CALL_LAST4_ENABLED']),
      ...(incomingCallLast4Config.endpoint
        ? []
        : ['GUEST_PORTAL_INCOMING_CALL_LAST4_ENDPOINT']),
      ...(incomingCallLast4Config.token
        ? []
        : ['GUEST_PORTAL_INCOMING_CALL_LAST4_TOKEN']),
    ];
    const incomingCallLast4Ready =
      devOtpEnabled || incomingCallLast4RequiredEnv.length === 0;

    return {
      recommendedChannel: 'TELEGRAM_BOT',
      phoneRequired: true,
      options: [
        {
          rank: 1,
          channel: 'TELEGRAM_BOT',
          role: 'PRIMARY',
          status: telegramAuthReady ? 'READY' : 'PLANNED',
          label: 'Telegram-бот',
          statusLabel: telegramAuthReady ? 'готов' : 'целевой канал',
          message:
            'Основной канал для регистрации, игровых уведомлений, рефералок и возврата гостей.',
          nextAction: telegramAuthReady
            ? telegramAuthMode === 'polling edge'
              ? 'Провести QA /game/auth -> Telegram contact-share -> /game/clubs -> /play/game; API-side sender не требуется.'
              : 'Использовать Telegram contact-share как основной вход на /play; SMS оставить резервом.'
            : 'Настроить Telegram bot username/link secret и добавить первичный Telegram-login с передачей телефона.',
          botUsername: telegramBotUsername,
          requiredEnv: telegramAuthRequiredEnv,
        },
        {
          rank: 2,
          channel: 'USER_CALL',
          role: 'FALLBACK',
          status: userCallReady ? 'READY' : 'PLANNED',
          label: 'Звонок на номер',
          statusLabel: userCallReady ? 'готов' : 'fallback',
          message:
            userCallConfig.provider === USER_CALL_PROVIDER_SMS_RU_CALLCHECK
              ? 'Бесплатный звонок: провайдер выдает временный номер, а LeetPlus подтверждает телефон после вызова.'
              : 'Дешевый резерв: гость звонит на номер, а LeetPlus подтверждает телефон по входящему вызову.',
          nextAction: userCallReady
            ? 'Использовать звонок пользователя как дешевый fallback после Telegram-бота.'
            : 'Подключить провайдера подтверждения звонка или ручной call-provider и связать caller id с OTP challenge.',
          botUsername: null,
          requiredEnv: userCallRequiredEnv,
          freeCall:
            userCallConfig.provider === USER_CALL_PROVIDER_SMS_RU_CALLCHECK,
        },
        {
          rank: 3,
          channel: 'SMS_CODE',
          role: 'RESERVE',
          status: smsReady ? 'READY' : 'NOT_CONFIGURED',
          label: 'SMS-код',
          statusLabel: smsReady ? 'готов' : 'нужен provider',
          message:
            'Обязательный резервный способ входа по телефону; не основной из-за цены и риска накрутки.',
          nextAction: smsReady
            ? 'Держать SMS как резерв и лимитировать частоту отправки.'
            : 'Включить real-send и SMS.ru api_id или резервный SMS provider endpoint/token для production.',
          botUsername: null,
          requiredEnv: smsReady ? [] : otpSmsRequiredEnv(otpConfig),
        },
        {
          rank: 4,
          channel: 'INCOMING_CALL_LAST4',
          role: 'RESERVE',
          status: incomingCallLast4Ready ? 'READY' : 'PLANNED',
          label: 'Входящий звонок с 4 цифрами',
          statusLabel: incomingCallLast4Ready ? 'готов' : 'позже',
          message:
            'Возможный резервный UX, но не стартовый канал: пользователю сложнее понять механику.',
          nextAction: incomingCallLast4Ready
            ? 'Держать как резерв после Telegram-бота, звонка пользователя и SMS-кода.'
            : 'Подключать только после Telegram-бота, звонка пользователя на номер и SMS-резерва.',
          botUsername: null,
          requiredEnv: incomingCallLast4Ready
            ? []
            : incomingCallLast4RequiredEnv,
        },
      ],
    };
  }

  async startOtp(
    tenantSlug: string,
    storeId: string,
    dto: { phone?: unknown; gameConsentAccepted?: unknown },
  ): Promise<GuestPortalOtpStartResponse> {
    const context = await this.getTenantStore(tenantSlug, storeId);
    const phone = this.phoneIdentity(dto.phone);
    const now = new Date();
    const resendAfter = new Date(now.getTime() - OTP_RESEND_SECONDS * 1000);
    const gameConsentAcceptedAt = dto.gameConsentAccepted === true ? now : null;

    await this.prisma.guestPortalOtpChallenge.updateMany({
      where: {
        status: 'PENDING',
        expiresAt: { lt: now },
      },
      data: { status: 'EXPIRED' },
    });

    const recentChallenge = await this.prisma.guestPortalOtpChallenge.findFirst(
      {
        where: {
          tenantId: context.tenant.id,
          storeId: context.store.id,
          phoneHash: phone.hash,
          status: 'PENDING',
          createdAt: { gt: resendAfter },
        },
        orderBy: { createdAt: 'desc' },
      },
    );

    if (recentChallenge) {
      throw new BadRequestException(
        'Код уже отправлен. Попробуйте повторить чуть позже.',
      );
    }

    const otpConfig = guestPortalOtpDeliveryConfig(this.configService);
    if (!this.isDevOtpEnabled() && otpSmsReady(otpConfig)) {
      await this.assertSmsOtpRateLimit({
        tenantId: context.tenant.id,
        storeId: context.store.id,
        phoneHash: phone.hash,
        now,
      });
    }

    const [guest, profileByPhone] = await Promise.all([
      this.prisma.guest.findFirst({
        where: {
          tenantId: context.tenant.id,
          phoneHash: phone.hash,
          isDisabled: false,
        },
        orderBy: [{ lastActivityAt: 'desc' }, { updatedAt: 'desc' }],
        select: {
          id: true,
          phoneConsentStatus: true,
          unsubscribedAt: true,
        },
      }),
      this.prisma.guestGameProfile.findFirst({
        where: {
          tenantId: context.tenant.id,
          phoneHash: phone.hash,
          status: 'ACTIVE',
        },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          telegramIdentity: true,
          maxIdentity: true,
          phoneConsentStatus: true,
          unsubscribedAt: true,
        },
      }),
    ]);

    const profile = guest
      ? await this.prisma.guestGameProfile.findFirst({
          where: {
            tenantId: context.tenant.id,
            guestId: guest.id,
            status: 'ACTIVE',
          },
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            telegramIdentity: true,
            maxIdentity: true,
            phoneConsentStatus: true,
            unsubscribedAt: true,
          },
        })
      : profileByPhone;

    const id = randomUUID();
    const code = this.generateOtp();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000);
    const delivery = await this.deliverOtpCode({
      code,
      context,
      phone,
      profile,
      guest,
    });

    await this.prisma.guestPortalOtpChallenge.create({
      data: {
        id,
        tenantId: context.tenant.id,
        storeId: context.store.id,
        phoneHash: phone.hash,
        phoneMasked: phone.masked,
        phoneEncrypted: this.encryptPhone(phone),
        guestId: guest?.id ?? null,
        profileId: profile?.id ?? null,
        codeHash: this.hashOtpCode(id, code),
        status: otpChallengeStatus(delivery.status),
        deliveryChannel: delivery.channel,
        expiresAt,
        deliveredAt: delivery.deliveredAt,
        gameConsentAcceptedAt,
        gameConsentVersion: gameConsentAcceptedAt ? GAME_CONSENT_VERSION : null,
      },
    });

    return {
      challengeId: id,
      phoneMasked: phone.masked,
      expiresAt: expiresAt.toISOString(),
      resendAfterSeconds: OTP_RESEND_SECONDS,
      delivery: {
        channel: delivery.channel,
        status: delivery.status,
        ...(delivery.devCode ? { devCode: delivery.devCode } : {}),
        message: delivery.message,
        ...(delivery.note ? { note: delivery.note } : {}),
        ...(delivery.identityMasked
          ? { identityMasked: delivery.identityMasked }
          : {}),
        ...(delivery.requiredEnv?.length
          ? { requiredEnv: delivery.requiredEnv }
          : {}),
      },
    };
  }

  async startUserCallAuth(
    tenantSlug: string,
    storeId: string,
    dto: { phone?: unknown; gameConsentAccepted?: unknown },
  ): Promise<GuestPortalUserCallAuthStartResponse> {
    const context = await this.getTenantStore(tenantSlug, storeId);
    const phone = this.phoneIdentity(dto.phone);
    const callConfig = guestPortalUserCallConfig(this.configService);

    if (dto.gameConsentAccepted !== true) {
      throw new BadRequestException(
        'Подтвердите участие в квестах и обработку телефона для игрового профиля.',
      );
    }

    if (!callConfig.enabled || !callConfig.configured) {
      throw new BadRequestException(
        'Звонок на номер пока не настроен. Используйте Telegram-бот или SMS-код.',
      );
    }

    const now = new Date();
    const resendAfter = new Date(now.getTime() - OTP_RESEND_SECONDS * 1000);
    const ttlMinutes =
      callConfig.provider === USER_CALL_PROVIDER_SMS_RU_CALLCHECK
        ? SMS_RU_CALLCHECK_TTL_MINUTES
        : OTP_TTL_MINUTES;
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);

    await this.prisma.guestPortalOtpChallenge.updateMany({
      where: {
        deliveryChannel: USER_CALL_AUTH_CHANNEL,
        status: 'PENDING',
        expiresAt: { lt: now },
      },
      data: { status: 'EXPIRED' },
    });

    const recentChallenge = await this.prisma.guestPortalOtpChallenge.findFirst(
      {
        where: {
          tenantId: context.tenant.id,
          storeId: context.store.id,
          phoneHash: phone.hash,
          deliveryChannel: USER_CALL_AUTH_CHANNEL,
          status: 'PENDING',
          createdAt: { gt: resendAfter },
        },
        orderBy: { createdAt: 'desc' },
      },
    );

    if (recentChallenge) {
      throw new BadRequestException(
        'Звонок уже ожидается. Попробуйте повторить чуть позже.',
      );
    }

    const [guest, profileByPhone] = await Promise.all([
      this.prisma.guest.findFirst({
        where: {
          tenantId: context.tenant.id,
          phoneHash: phone.hash,
          isDisabled: false,
        },
        orderBy: [{ lastActivityAt: 'desc' }, { updatedAt: 'desc' }],
        select: {
          id: true,
          phoneConsentStatus: true,
          unsubscribedAt: true,
        },
      }),
      this.prisma.guestGameProfile.findFirst({
        where: {
          tenantId: context.tenant.id,
          phoneHash: phone.hash,
          status: 'ACTIVE',
        },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          telegramIdentity: true,
          maxIdentity: true,
          phoneConsentStatus: true,
          unsubscribedAt: true,
        },
      }),
    ]);

    const profile = guest
      ? await this.prisma.guestGameProfile.findFirst({
          where: {
            tenantId: context.tenant.id,
            guestId: guest.id,
            status: 'ACTIVE',
          },
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            telegramIdentity: true,
            maxIdentity: true,
            phoneConsentStatus: true,
            unsubscribedAt: true,
          },
        })
      : profileByPhone;
    const id = randomUUID();
    const opaqueCode = randomBytes(18).toString('hex');
    const providerStart = await this.startUserCallProvider({
      config: callConfig,
      phone,
    });

    await this.prisma.guestPortalOtpChallenge.create({
      data: {
        id,
        tenantId: context.tenant.id,
        storeId: context.store.id,
        phoneHash: phone.hash,
        phoneMasked: phone.masked,
        phoneEncrypted: this.encryptPhone(phone),
        guestId: guest?.id ?? null,
        profileId: profile?.id ?? null,
        codeHash: this.hashOtpCode(id, opaqueCode),
        status: 'PENDING',
        deliveryChannel: USER_CALL_AUTH_CHANNEL,
        providerName: providerStart.providerName,
        providerChallengeId: providerStart.providerChallengeId,
        expiresAt,
        gameConsentAcceptedAt: now,
        gameConsentVersion: GAME_CONSENT_VERSION,
      },
    });

    return {
      challengeId: id,
      phoneMasked: phone.masked,
      callNumber: providerStart.callNumber,
      callHref: providerStart.callHref,
      freeCall: providerStart.freeCall,
      expiresAt: expiresAt.toISOString(),
      status: 'PENDING',
      message: providerStart.message,
    };
  }

  async getUserCallAuthStatus(
    tenantSlug: string,
    storeId: string,
    dto: { challengeId?: unknown; referralCode?: unknown },
  ): Promise<GuestPortalUserCallAuthStatusResponse> {
    const context = await this.getTenantStore(tenantSlug, storeId);
    const challengeId = this.requiredString(dto.challengeId, 'challengeId');
    const referralCode = normalizeGameReferralCode(dto.referralCode);
    let challenge = await this.prisma.guestPortalOtpChallenge.findFirst({
      where: {
        id: challengeId,
        tenantId: context.tenant.id,
        storeId: context.store.id,
        deliveryChannel: USER_CALL_AUTH_CHANNEL,
      },
    });

    if (!challenge) {
      throw new BadRequestException('Call auth challenge не найден.');
    }

    if (
      challenge.status === 'PENDING' &&
      challenge.expiresAt.getTime() <= Date.now()
    ) {
      await this.prisma.guestPortalOtpChallenge.update({
        where: { id: challenge.id },
        data: { status: 'EXPIRED' },
      });

      return {
        status: 'EXPIRED',
        profileId: challenge.profileId,
        phoneMasked: challenge.phoneMasked,
        message: 'Срок ожидания звонка истек. Создайте новый вход.',
      };
    }

    if (challenge.status === 'PENDING') {
      const syncResult = await this.syncUserCallProviderStatus(challenge);
      challenge = syncResult.challenge;

      if (challenge.status === USER_CALL_AUTH_CONFIRMED_STATUS) {
        // Continue below and issue the guest session in the same polling request.
      } else if (challenge.status === 'EXPIRED') {
        return {
          status: 'EXPIRED',
          profileId: challenge.profileId,
          phoneMasked: challenge.phoneMasked,
          message: 'Срок ожидания звонка истек. Создайте новый вход.',
        };
      } else if (challenge.status !== 'PENDING') {
        return {
          status: 'FAILED',
          profileId: challenge.profileId,
          phoneMasked: challenge.phoneMasked,
          message:
            syncResult.message ??
            'Звонок не может быть завершен в текущем статусе.',
        };
      } else {
        return {
          status: 'PENDING',
          profileId: challenge.profileId,
          phoneMasked: challenge.phoneMasked,
          message:
            syncResult.message ??
            'Ожидаем входящий звонок с подтвержденного телефона. Страница проверяет статус автоматически.',
        };
      }
    }

    if (challenge.status === USER_CALL_AUTH_CONFIRMED_STATUS) {
      const profile = await this.completeOtpRegistration(challenge, context, {
        code: referralCode,
        channel: 'USER_CALL',
        externalId: `user-call:${challenge.id}:referral`,
      });
      const basePayload: GuestPortalTokenPayload = {
        sub: `user-call:${challenge.id}`,
        purpose: GUEST_PORTAL_PURPOSE,
        tenantId: context.tenant.id,
        storeId: context.store.id,
        guestId: profile.guestId,
        profileId: profile.id,
        phoneHash: challenge.phoneHash,
      };
      const match = await this.buildLocalGameProfileMatch(basePayload, {
        phoneMasked: challenge.phoneMasked,
        source: 'guest_portal_user_call',
      });
      const payload = guestPortalPayloadWithLocalMatch(basePayload, match);
      const token = await this.signGuestPortalToken(payload);

      await this.prisma.guestPortalOtpChallenge.update({
        where: { id: challenge.id },
        data: {
          status: USER_CALL_AUTH_SESSION_ISSUED_STATUS,
          guestId: payload.guestId,
          profileId: payload.profileId,
        },
      });

      return {
        status: 'CONFIRMED',
        token,
        portal: await this.buildPortalPayload(payload),
        match,
        profileId: payload.profileId ?? profile.id,
        phoneMasked: challenge.phoneMasked,
        message: 'Телефон подтвержден входящим звонком. Игровой профиль готов.',
      };
    }

    if (challenge.status === USER_CALL_AUTH_SESSION_ISSUED_STATUS) {
      if (!challenge.profileId) {
        return {
          status: 'FAILED',
          profileId: null,
          phoneMasked: challenge.phoneMasked,
          message:
            'Звонок был подтвержден, но игровой профиль не был безопасно создан.',
        };
      }

      await this.recordGameReferralEvent(context, {
        code: referralCode,
        channel: 'USER_CALL',
        externalId: `user-call:${challenge.id}:referral`,
        profile: {
          id: challenge.profileId,
          guestId: challenge.guestId,
        },
      });

      const basePayload: GuestPortalTokenPayload = {
        sub: `user-call:${challenge.id}`,
        purpose: GUEST_PORTAL_PURPOSE,
        tenantId: context.tenant.id,
        storeId: context.store.id,
        guestId: challenge.guestId,
        profileId: challenge.profileId,
        phoneHash: challenge.phoneHash,
      };
      const match = await this.buildLocalGameProfileMatch(basePayload, {
        phoneMasked: challenge.phoneMasked,
        source: 'guest_portal_user_call',
      });
      const payload = guestPortalPayloadWithLocalMatch(basePayload, match);
      const token = await this.signGuestPortalToken(payload);

      return {
        status: 'CONFIRMED',
        token,
        portal: await this.buildPortalPayload(payload),
        match,
        profileId: payload.profileId ?? challenge.profileId,
        phoneMasked: challenge.phoneMasked,
        message: 'Телефон уже подтвержден входящим звонком.',
      };
    }

    return {
      status: challenge.status === 'EXPIRED' ? 'EXPIRED' : 'FAILED',
      profileId: challenge.profileId,
      phoneMasked: challenge.phoneMasked,
      message:
        challenge.status === 'EXPIRED'
          ? 'Срок ожидания звонка истек.'
          : 'Звонок не может быть завершен в текущем статусе.',
    };
  }

  async startIncomingCallLast4Auth(
    tenantSlug: string,
    storeId: string,
    dto: { phone?: unknown; gameConsentAccepted?: unknown },
  ): Promise<GuestPortalIncomingCallLast4StartResponse> {
    const context = await this.getTenantStore(tenantSlug, storeId);
    const phone = this.phoneIdentity(dto.phone);

    if (dto.gameConsentAccepted !== true) {
      throw new BadRequestException(
        'Подтвердите участие в квестах и обработку телефона для игрового профиля.',
      );
    }

    const now = new Date();
    const resendAfter = new Date(now.getTime() - OTP_RESEND_SECONDS * 1000);
    const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000);

    await this.prisma.guestPortalOtpChallenge.updateMany({
      where: {
        deliveryChannel: INCOMING_CALL_LAST4_CHANNEL,
        status: 'PENDING',
        expiresAt: { lt: now },
      },
      data: { status: 'EXPIRED' },
    });

    const recentChallenge = await this.prisma.guestPortalOtpChallenge.findFirst(
      {
        where: {
          tenantId: context.tenant.id,
          storeId: context.store.id,
          phoneHash: phone.hash,
          deliveryChannel: INCOMING_CALL_LAST4_CHANNEL,
          status: 'PENDING',
          createdAt: { gt: resendAfter },
        },
        orderBy: { createdAt: 'desc' },
      },
    );

    if (recentChallenge) {
      throw new BadRequestException(
        'Входящий звонок уже ожидается. Попробуйте повторить чуть позже.',
      );
    }

    const [guest, profileByPhone] = await Promise.all([
      this.prisma.guest.findFirst({
        where: {
          tenantId: context.tenant.id,
          phoneHash: phone.hash,
          isDisabled: false,
        },
        orderBy: [{ lastActivityAt: 'desc' }, { updatedAt: 'desc' }],
        select: {
          id: true,
          phoneConsentStatus: true,
          unsubscribedAt: true,
        },
      }),
      this.prisma.guestGameProfile.findFirst({
        where: {
          tenantId: context.tenant.id,
          phoneHash: phone.hash,
          status: 'ACTIVE',
        },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          telegramIdentity: true,
          maxIdentity: true,
          phoneConsentStatus: true,
          unsubscribedAt: true,
        },
      }),
    ]);

    const profile = guest
      ? await this.prisma.guestGameProfile.findFirst({
          where: {
            tenantId: context.tenant.id,
            guestId: guest.id,
            status: 'ACTIVE',
          },
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            telegramIdentity: true,
            maxIdentity: true,
            phoneConsentStatus: true,
            unsubscribedAt: true,
          },
        })
      : profileByPhone;
    const id = randomUUID();
    const code = this.generateIncomingCallLast4Code();
    const delivery = await this.deliverIncomingCallLast4({
      code,
      context,
      phone,
      profile,
      guest,
    });
    const status = otpChallengeStatus(delivery.status);

    await this.prisma.guestPortalOtpChallenge.create({
      data: {
        id,
        tenantId: context.tenant.id,
        storeId: context.store.id,
        phoneHash: phone.hash,
        phoneMasked: phone.masked,
        phoneEncrypted: this.encryptPhone(phone),
        guestId: guest?.id ?? null,
        profileId: profile?.id ?? null,
        codeHash: this.hashOtpCode(id, code),
        status,
        deliveryChannel: INCOMING_CALL_LAST4_CHANNEL,
        expiresAt,
        deliveredAt: delivery.deliveredAt,
        gameConsentAcceptedAt: now,
        gameConsentVersion: GAME_CONSENT_VERSION,
      },
    });

    return {
      challengeId: id,
      phoneMasked: phone.masked,
      expiresAt: expiresAt.toISOString(),
      status:
        status === 'PENDING'
          ? 'PENDING'
          : delivery.status === 'FAILED'
            ? 'FAILED'
            : delivery.status === 'BLOCKED'
              ? 'BLOCKED'
              : 'NOT_CONFIGURED',
      delivery: {
        status: delivery.status,
        ...(delivery.devCode ? { devCode: delivery.devCode } : {}),
        message: delivery.message,
        ...(delivery.note ? { note: delivery.note } : {}),
        ...(delivery.requiredEnv?.length
          ? { requiredEnv: delivery.requiredEnv }
          : {}),
      },
      message: delivery.message,
    };
  }

  async confirmUserCallAuth(
    secret: string | undefined,
    dto: { challengeId?: unknown; callerPhone?: unknown },
  ): Promise<GuestPortalUserCallConfirmResponse> {
    this.assertUserCallSecret(secret);
    const challengeId = this.requiredString(dto.challengeId, 'challengeId');
    const callerPhone = this.phoneIdentity(dto.callerPhone);
    const challenge = await this.prisma.guestPortalOtpChallenge.findFirst({
      where: {
        id: challengeId,
        deliveryChannel: USER_CALL_AUTH_CHANNEL,
      },
    });

    if (!challenge) {
      throw new BadRequestException('Call auth challenge не найден.');
    }

    if (challenge.expiresAt.getTime() <= Date.now()) {
      await this.prisma.guestPortalOtpChallenge.update({
        where: { id: challenge.id },
        data: { status: 'EXPIRED' },
      });

      return {
        status: 'EXPIRED',
        challengeId: challenge.id,
        phoneMasked: challenge.phoneMasked,
        message: 'Срок ожидания звонка истек.',
      };
    }

    if (challenge.status === USER_CALL_AUTH_CONFIRMED_STATUS) {
      return {
        status: 'CONFIRMED',
        challengeId: challenge.id,
        phoneMasked: challenge.phoneMasked,
        message: 'Звонок уже подтвержден.',
      };
    }

    if (challenge.status !== 'PENDING') {
      return {
        status: 'FAILED',
        challengeId: challenge.id,
        phoneMasked: challenge.phoneMasked,
        message: 'Call auth challenge не находится в ожидании звонка.',
      };
    }

    if (callerPhone.hash !== challenge.phoneHash) {
      const attempts = challenge.attempts + 1;
      await this.prisma.guestPortalOtpChallenge.update({
        where: { id: challenge.id },
        data: {
          attempts,
          status: attempts >= OTP_MAX_ATTEMPTS ? 'BLOCKED' : 'PENDING',
        },
      });

      return {
        status: 'FAILED',
        challengeId: challenge.id,
        phoneMasked: challenge.phoneMasked,
        message: 'Caller id не совпал с телефоном challenge.',
      };
    }

    await this.prisma.guestPortalOtpChallenge.update({
      where: { id: challenge.id },
      data: {
        status: USER_CALL_AUTH_CONFIRMED_STATUS,
        deliveredAt: new Date(),
        verifiedAt: new Date(),
      },
    });

    return {
      status: 'CONFIRMED',
      challengeId: challenge.id,
      phoneMasked: challenge.phoneMasked,
      message:
        'Звонок подтвержден. Browser status endpoint выдаст гостевую сессию.',
    };
  }

  async verifyIncomingCallLast4Auth(
    tenantSlug: string,
    storeId: string,
    dto: { challengeId?: unknown; code?: unknown; referralCode?: unknown },
  ): Promise<GuestPortalIncomingCallLast4VerifyResponse> {
    const context = await this.getTenantStore(tenantSlug, storeId);
    const challengeId = this.requiredString(dto.challengeId, 'challengeId');
    const referralCode = normalizeGameReferralCode(dto.referralCode);
    const code = this.requiredString(dto.code, 'Код').replace(/\D/g, '');

    if (code.length !== 4) {
      throw new BadRequestException(
        'Введите последние 4 цифры номера входящего звонка.',
      );
    }

    const challenge = await this.prisma.guestPortalOtpChallenge.findFirst({
      where: {
        id: challengeId,
        tenantId: context.tenant.id,
        storeId: context.store.id,
        deliveryChannel: INCOMING_CALL_LAST4_CHANNEL,
      },
    });

    if (!challenge || challenge.status !== 'PENDING') {
      throw new BadRequestException(
        'Входящий звонок не найден или уже использован.',
      );
    }

    if (challenge.expiresAt.getTime() <= Date.now()) {
      await this.prisma.guestPortalOtpChallenge.update({
        where: { id: challenge.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('Срок действия звонка истек.');
    }

    const isValid = challenge.codeHash === this.hashOtpCode(challenge.id, code);

    if (!isValid) {
      const attempts = challenge.attempts + 1;
      await this.prisma.guestPortalOtpChallenge.update({
        where: { id: challenge.id },
        data: {
          attempts,
          status: attempts >= OTP_MAX_ATTEMPTS ? 'BLOCKED' : 'PENDING',
        },
      });
      throw new BadRequestException('Последние 4 цифры введены неверно.');
    }

    const profile = await this.completeOtpRegistration(challenge, context, {
      code: referralCode,
      channel: 'INCOMING_CALL_LAST4',
      externalId: `incoming-call-last4:${challenge.id}:referral`,
    });

    const basePayload: GuestPortalTokenPayload = {
      sub: `incoming-call-last4:${challenge.id}`,
      purpose: GUEST_PORTAL_PURPOSE,
      tenantId: context.tenant.id,
      storeId: context.store.id,
      guestId: profile.guestId,
      profileId: profile.id,
      phoneHash: challenge.phoneHash,
    };
    const match = await this.buildLocalGameProfileMatch(basePayload, {
      phoneMasked: challenge.phoneMasked,
      source: 'guest_portal_incoming_call_last4',
    });
    const payload = guestPortalPayloadWithLocalMatch(basePayload, match);
    const token = await this.signGuestPortalToken(payload);

    return {
      token,
      portal: await this.buildPortalPayload(payload),
      match,
    };
  }

  async verifyOtp(
    tenantSlug: string,
    storeId: string,
    dto: { challengeId?: unknown; code?: unknown; referralCode?: unknown },
  ): Promise<GuestPortalOtpVerifyResponse> {
    const context = await this.getTenantStore(tenantSlug, storeId);
    const challengeId = this.requiredString(dto.challengeId, 'challengeId');
    const referralCode = normalizeGameReferralCode(dto.referralCode);
    const code = this.requiredString(dto.code, 'Код').replace(/\D/g, '');

    if (code.length !== 6) {
      throw new BadRequestException('Введите шестизначный код.');
    }

    const challenge = await this.prisma.guestPortalOtpChallenge.findFirst({
      where: {
        id: challengeId,
        tenantId: context.tenant.id,
        storeId: context.store.id,
      },
    });

    if (!challenge || challenge.status !== 'PENDING') {
      throw new BadRequestException('Код не найден или уже использован.');
    }

    if (challenge.expiresAt.getTime() <= Date.now()) {
      await this.prisma.guestPortalOtpChallenge.update({
        where: { id: challenge.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('Срок действия кода истек.');
    }

    const isValid = challenge.codeHash === this.hashOtpCode(challenge.id, code);

    if (!isValid) {
      const attempts = challenge.attempts + 1;
      await this.prisma.guestPortalOtpChallenge.update({
        where: { id: challenge.id },
        data: {
          attempts,
          status: attempts >= OTP_MAX_ATTEMPTS ? 'BLOCKED' : 'PENDING',
        },
      });
      throw new BadRequestException('Код введен неверно.');
    }

    const profile = await this.completeOtpRegistration(challenge, context, {
      code: referralCode,
      channel: 'OTP',
      externalId: `otp:${challenge.id}:referral`,
    });

    const basePayload: GuestPortalTokenPayload = {
      sub: challenge.id,
      purpose: GUEST_PORTAL_PURPOSE,
      tenantId: context.tenant.id,
      storeId: context.store.id,
      guestId: profile.guestId,
      profileId: profile.id,
      phoneHash: challenge.phoneHash,
    };
    const match = await this.buildLocalGameProfileMatch(basePayload, {
      phoneMasked: challenge.phoneMasked,
      source: 'guest_portal_otp',
    });
    const payload = guestPortalPayloadWithLocalMatch(basePayload, match);
    const token = await this.signGuestPortalToken(payload);

    return {
      token,
      portal: await this.buildPortalPayload(payload),
      match,
    };
  }

  private async signGuestPortalToken(payload: GuestPortalTokenPayload) {
    const { exp, iat, nbf, ...signablePayload } =
      payload as GuestPortalTokenPayload & {
        exp?: unknown;
        iat?: unknown;
        nbf?: unknown;
      };

    void exp;
    void iat;
    void nbf;

    return this.jwtService.signAsync(signablePayload, {
      expiresIn: (this.configService.get<string>(
        'GUEST_PORTAL_JWT_EXPIRES_IN',
      ) ?? GUEST_TOKEN_EXPIRES_IN) as JwtExpiresIn,
    });
  }

  async startTelegramAuth(
    tenantSlug: string,
    storeId: string,
    dto: { gameConsentAccepted?: unknown },
  ): Promise<GuestPortalTelegramAuthStartResponse> {
    const context = await this.getTenantStore(tenantSlug, storeId);

    if (dto.gameConsentAccepted !== true) {
      throw new BadRequestException(
        'Подтвердите участие в квестах и обработку телефона для игрового профиля.',
      );
    }

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + TELEGRAM_LINK_TTL_MINUTES * 60 * 1000,
    );
    const code = this.generateTelegramLinkCode();
    const botUsername = this.telegramBotUsername();

    if (!botUsername) {
      throw new BadRequestException(
        'Telegram-бот еще не настроен. Используйте вход по коду телефона.',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.guestGameTelegramLinkChallenge.updateMany({
        where: {
          tenantId: context.tenant.id,
          storeId: context.store.id,
          status: {
            in: [
              TELEGRAM_AUTH_PENDING_STATUS,
              TELEGRAM_AUTH_AWAITING_CONTACT_STATUS,
            ],
          },
          expiresAt: { lt: now },
        },
        data: { status: 'EXPIRED' },
      });

      const profile = await tx.guestGameProfile.create({
        data: {
          tenantId: context.tenant.id,
          displayName: 'Гость клуба',
          status: TELEGRAM_AUTH_PROFILE_STATUS,
          lastActivityAt: now,
        },
        select: { id: true },
      });
      const challenge = await tx.guestGameTelegramLinkChallenge.create({
        data: {
          tenantId: context.tenant.id,
          storeId: context.store.id,
          profileId: profile.id,
          codeHash: this.hashTelegramLinkCode(code),
          status: TELEGRAM_AUTH_PENDING_STATUS,
          expiresAt,
        },
        select: { id: true },
      });

      return { challengeId: challenge.id };
    });

    return {
      challengeId: result.challengeId,
      codeMasked: maskTelegramLinkCode(code),
      expiresAt: expiresAt.toISOString(),
      botUsername,
      botDeepLink: `https://t.me/${botUsername}?start=${encodeURIComponent(
        telegramStartPayload(code),
      )}`,
      status: 'READY',
      message:
        'Откройте Telegram-бота, нажмите Start и поделитесь телефоном кнопкой бота.',
    };
  }

  async getTelegramAuthStatus(
    tenantSlug: string,
    storeId: string,
    dto: { challengeId?: unknown; referralCode?: unknown },
  ): Promise<GuestPortalTelegramAuthStatusResponse> {
    const context = await this.getTenantStore(tenantSlug, storeId);
    const challengeId = this.requiredString(dto.challengeId, 'challengeId');
    const referralCode = normalizeGameReferralCode(dto.referralCode);
    const challenge =
      await this.prisma.guestGameTelegramLinkChallenge.findFirst({
        where: {
          id: challengeId,
          tenantId: context.tenant.id,
          storeId: context.store.id,
        },
        include: {
          profile: {
            select: {
              id: true,
              guestId: true,
              phoneHash: true,
              telegramIdentity: true,
              contactMasked: true,
            },
          },
        },
      });

    if (!challenge) {
      throw new BadRequestException('Telegram auth challenge не найден.');
    }

    if (
      [
        TELEGRAM_AUTH_PENDING_STATUS,
        TELEGRAM_AUTH_AWAITING_CONTACT_STATUS,
      ].includes(challenge.status) &&
      challenge.expiresAt.getTime() <= Date.now()
    ) {
      await this.prisma.guestGameTelegramLinkChallenge.update({
        where: { id: challenge.id },
        data: { status: 'EXPIRED' },
      });

      return {
        status: 'EXPIRED',
        profileId: challenge.profileId,
        telegramIdentityMasked: maskExternalIdentity(
          challenge.profile.telegramIdentity,
        ),
        message: 'Срок действия Telegram-входа истек. Создайте новую ссылку.',
      };
    }

    if (challenge.status === TELEGRAM_AUTH_PENDING_STATUS) {
      return {
        status: 'PENDING',
        profileId: challenge.profileId,
        telegramIdentityMasked: null,
        message:
          'Откройте Telegram-бота по ссылке и нажмите Start для продолжения.',
      };
    }

    if (challenge.status === TELEGRAM_AUTH_AWAITING_CONTACT_STATUS) {
      return {
        status: 'AWAITING_CONTACT',
        profileId: challenge.profileId,
        telegramIdentityMasked: maskExternalIdentity(
          challenge.profile.telegramIdentity,
        ),
        message:
          'Telegram-бот открыт. Поделитесь телефоном кнопкой бота для завершения входа.',
      };
    }

    if (
      challenge.status === TELEGRAM_AUTH_VERIFIED_STATUS ||
      challenge.status === TELEGRAM_AUTH_SESSION_ISSUED_STATUS
    ) {
      const phoneHash = challenge.phoneHash ?? challenge.profile.phoneHash;

      if (!phoneHash) {
        return {
          status: 'FAILED',
          profileId: challenge.profileId,
          telegramIdentityMasked: maskExternalIdentity(
            challenge.profile.telegramIdentity,
          ),
          message:
            'Telegram подтвердил чат, но телефон не был безопасно подтвержден.',
        };
      }

      const basePayload: GuestPortalTokenPayload = {
        sub: `telegram-auth:${challenge.id}`,
        purpose: GUEST_PORTAL_PURPOSE,
        tenantId: context.tenant.id,
        storeId: context.store.id,
        guestId: challenge.guestId ?? challenge.profile.guestId,
        profileId: challenge.profileId,
        phoneHash,
      };
      const match = await this.buildLocalGameProfileMatch(basePayload, {
        phoneMasked: challenge.profile.contactMasked,
        source: 'guest_portal_telegram_auth',
      });
      const payload = guestPortalPayloadWithLocalMatch(basePayload, match);
      const token = await this.signGuestPortalToken(payload);

      if (challenge.status === TELEGRAM_AUTH_VERIFIED_STATUS || referralCode) {
        const now = new Date();
        await this.prisma.$transaction(async (tx) => {
          if (challenge.status === TELEGRAM_AUTH_VERIFIED_STATUS) {
            await tx.guestGameTelegramLinkChallenge.update({
              where: { id: challenge.id },
              data: {
                status: TELEGRAM_AUTH_SESSION_ISSUED_STATUS,
                guestId: payload.guestId,
                profileId: payload.profileId ?? challenge.profileId,
              },
            });
          }

          await this.createGameReferralEvent(tx, context, {
            code: referralCode,
            channel: 'TELEGRAM_BOT',
            externalId: `telegram-auth:${challenge.id}:referral`,
            profile: {
              id: payload.profileId ?? challenge.profileId,
              guestId: payload.guestId,
            },
            now,
          });
        });
      }

      return {
        status: 'CONFIRMED',
        token,
        portal: await this.buildPortalPayload(payload),
        match,
        profileId: payload.profileId ?? challenge.profileId,
        phoneMasked: challenge.profile.contactMasked,
        telegramIdentityMasked: maskExternalIdentity(
          challenge.profile.telegramIdentity,
        ),
        message:
          'Телефон подтвержден через Telegram. Гостевой игровой профиль готов.',
      };
    }

    return {
      status: challenge.status === 'EXPIRED' ? 'EXPIRED' : 'FAILED',
      profileId: challenge.profileId,
      telegramIdentityMasked: maskExternalIdentity(
        challenge.profile.telegramIdentity,
      ),
      message:
        challenge.status === 'EXPIRED'
          ? 'Срок действия Telegram-входа истек.'
          : 'Telegram-вход не может быть завершен в текущем статусе.',
    };
  }

  private async completeOtpRegistration(
    challenge: GuestPortalOtpChallengeRegistration,
    context: TenantStoreContext,
    referral?: GuestGameReferralRegistrationOptions,
  ) {
    const now = new Date();
    const profileConsentData = gameProfileConsentGrantData(
      GAME_PROFILE_CONSENT_SOURCE,
      challenge.gameConsentAcceptedAt,
    );
    const staffTestMatch = await this.resolveStaffTestMatch(
      challenge.tenantId,
      this.phoneIdentityFromEncrypted(challenge.phoneEncrypted),
    );
    const staffTestData = this.staffTestProfilePatch(staffTestMatch);

    return this.prisma.$transaction(async (tx) => {
      const guest = challenge.guestId
        ? await tx.guest.findFirst({
            where: {
              id: challenge.guestId,
              tenantId: challenge.tenantId,
              isDisabled: false,
            },
            select: {
              id: true,
              externalGuestId: true,
              fullNameMasked: true,
              phoneMasked: true,
              emailMasked: true,
            },
          })
        : null;
      const existingProfile = await this.findRegistrationProfile(tx, challenge);
      const profile = existingProfile
        ? await tx.guestGameProfile.update({
            where: { id: existingProfile.id },
            data: {
              ...(guest && !existingProfile.guestId
                ? { guestId: guest.id }
                : {}),
              phoneHash: existingProfile.phoneHash ?? challenge.phoneHash,
              phoneEncrypted:
                challenge.phoneEncrypted ?? existingProfile.phoneEncrypted,
              contactMasked:
                existingProfile.contactMasked ??
                guest?.phoneMasked ??
                guest?.emailMasked ??
                challenge.phoneMasked,
              displayName:
                existingProfile.displayName ??
                guest?.fullNameMasked ??
                guest?.externalGuestId ??
                'Гость клуба',
              ...profileConsentData,
              ...staffTestData,
              status: 'ACTIVE',
              lastActivityAt: now,
            },
            select: { id: true, guestId: true },
          })
        : await tx.guestGameProfile.create({
            data: {
              tenantId: challenge.tenantId,
              ...(guest ? { guestId: guest.id } : {}),
              displayName:
                guest?.fullNameMasked ??
                guest?.externalGuestId ??
                'Гость клуба',
              contactMasked:
                guest?.phoneMasked ??
                guest?.emailMasked ??
                challenge.phoneMasked,
              phoneHash: challenge.phoneHash,
              phoneEncrypted: challenge.phoneEncrypted,
              ...profileConsentData,
              ...staffTestData,
              status: 'ACTIVE',
              lastActivityAt: now,
            },
            select: { id: true, guestId: true },
          });

      await tx.guestPortalOtpChallenge.update({
        where: { id: challenge.id },
        data: {
          status: 'VERIFIED',
          verifiedAt: now,
          guestId: profile.guestId ?? challenge.guestId,
          profileId: profile.id,
        },
      });
      await this.createGameConsentEvent(tx, challenge, profile.id, now);
      await this.createGameReferralEvent(tx, context, {
        ...(referral ?? {
          code: null,
          channel: 'OTP',
          externalId: `otp:${challenge.id}:referral`,
        }),
        profile: {
          id: profile.id,
          guestId: profile.guestId ?? challenge.guestId,
        },
        now,
      });

      return {
        id: profile.id,
        guestId: profile.guestId ?? challenge.guestId,
      };
    });
  }

  private async createGameConsentEvent(
    tx: Prisma.TransactionClient,
    challenge: GuestPortalOtpChallengeRegistration,
    profileId: string,
    now: Date,
  ) {
    if (!challenge.gameConsentAcceptedAt) {
      return;
    }

    await tx.guestGameEvent.create({
      data: {
        tenantId: challenge.tenantId,
        profileId,
        guestId: challenge.guestId,
        eventType: GAME_CONSENT_EVENT_TYPE,
        source: 'GUEST_PORTAL',
        externalId: `otp:${challenge.id}:game-consent`,
        occurredAt: challenge.gameConsentAcceptedAt,
        payload: {
          consentVersion: challenge.gameConsentVersion ?? GAME_CONSENT_VERSION,
          storeId: challenge.storeId,
          phoneMasked: challenge.phoneMasked,
          acceptedAt: challenge.gameConsentAcceptedAt.toISOString(),
        },
        note: 'Гость подтвердил участие в геймификации LeetPlus при OTP-регистрации.',
        createdAt: now,
      },
    });
  }

  private async recordGameReferralEvent(
    context: TenantStoreContext,
    options: GuestGameReferralRegistrationOptions & {
      profile: { id: string; guestId: string | null };
    },
  ) {
    if (!options.code) {
      return;
    }

    const now = new Date();
    await this.prisma.$transaction((tx) =>
      this.createGameReferralEvent(tx, context, {
        ...options,
        now,
      }),
    );
  }

  private async createGameReferralEvent(
    tx: Prisma.TransactionClient,
    context: TenantStoreContext,
    options: GuestGameReferralRegistrationOptions & {
      profile: { id: string; guestId: string | null };
      now: Date;
    },
  ) {
    const code = normalizeGameReferralCode(options.code);

    if (!code) {
      return;
    }

    const existingEvent = await tx.guestGameEvent.findFirst({
      where: {
        tenantId: context.tenant.id,
        source: GAME_REFERRAL_EVENT_SOURCE,
        externalId: options.externalId,
      },
      select: { id: true },
    });

    if (existingEvent) {
      return;
    }

    const attribution = await this.resolveGameReferralAttribution(
      tx,
      context,
      options.profile,
      code,
    );
    const clubId = `${context.tenant.slug}:${
      context.store.publicSlug ?? context.store.id
    }`;

    await tx.guestGameEvent.create({
      data: {
        tenantId: context.tenant.id,
        profileId: options.profile.id,
        guestId: options.profile.guestId,
        eventType: GAME_REFERRAL_ACCEPTED_EVENT_TYPE,
        source: GAME_REFERRAL_EVENT_SOURCE,
        externalId: options.externalId,
        occurredAt: options.now,
        payload: {
          channel: options.channel,
          storeId: context.store.id,
          storePublicSlug: context.store.publicSlug,
          clubId,
          referralCodeMasked: maskGameReferralCode(code),
          inviterProfileId: attribution.inviterProfileId,
          inviterGuestId: attribution.inviterGuestId,
          valid: attribution.valid,
          selfReferral: attribution.selfReferral,
          eligibleForReward: attribution.eligibleForReward,
          acceptedAt: options.now.toISOString(),
        },
        note: 'Guest registered through a LeetPlus Play referral link.',
        createdAt: options.now,
      },
    });
  }

  private async resolveGameReferralAttribution(
    tx: Prisma.TransactionClient,
    context: TenantStoreContext,
    profile: { id: string; guestId: string | null },
    code: string,
  ) {
    const candidates = await tx.guestGameProfile.findMany({
      where: {
        tenantId: context.tenant.id,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        guestId: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: GUEST_GAME_REFERRAL_LOOKUP_LIMIT,
    });
    const secret = this.referralSecret();
    const inviter =
      candidates.find(
        (candidate) =>
          buildGameReferralCodeFromParts(
            context.tenant.slug,
            context.store.id,
            context.store.publicSlug,
            candidate.id,
            secret,
          ) === code,
      ) ?? null;
    const selfReferral =
      Boolean(inviter) &&
      (inviter?.id === profile.id ||
        (Boolean(inviter?.guestId && profile.guestId) &&
          inviter?.guestId === profile.guestId));

    return {
      inviterProfileId: inviter?.id ?? null,
      inviterGuestId: inviter?.guestId ?? null,
      valid: Boolean(inviter),
      selfReferral,
      eligibleForReward: Boolean(inviter) && !selfReferral,
    };
  }

  private async findRegistrationProfile(
    tx: Prisma.TransactionClient,
    challenge: GuestPortalOtpChallengeRegistration,
  ) {
    if (challenge.profileId) {
      const profile = await tx.guestGameProfile.findFirst({
        where: {
          id: challenge.profileId,
          tenantId: challenge.tenantId,
          status: 'ACTIVE',
        },
      });

      if (profile) {
        return profile;
      }
    }

    if (challenge.guestId) {
      const profile = await tx.guestGameProfile.findFirst({
        where: {
          tenantId: challenge.tenantId,
          guestId: challenge.guestId,
          status: 'ACTIVE',
        },
      });

      if (profile) {
        return profile;
      }
    }

    return tx.guestGameProfile.findFirst({
      where: {
        tenantId: challenge.tenantId,
        phoneHash: challenge.phoneHash,
        status: 'ACTIVE',
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getSession(authorization: string | undefined) {
    const payload = await this.verifyGuestToken(authorization);
    return this.buildPortalPayload(payload);
  }

  async getGameSummary(
    authorization: string | undefined,
  ): Promise<GuestPortalGameSummary> {
    const payload = await this.verifyGuestToken(authorization);
    const portal = await this.buildPortalPayload(payload);
    const referralStats = await this.getGameReferralStats(
      payload.tenantId,
      portal.profile.id,
    );

    return buildGameSummaryFromPortal(portal, {
      referralSecret: this.referralSecret(),
      webUrl: this.publicWebUrl(),
      referralStats,
    });
  }

  async recordAppOpen(
    authorization: string | undefined,
    dto: { surface?: unknown },
  ): Promise<GuestPortalAppOpenResponse> {
    const payload = await this.verifyGuestToken(authorization);
    const context = await this.getTenantStoreByIds(
      payload.tenantId,
      payload.storeId,
    );
    const guest = await this.findGuest(payload);
    const profile = await this.findProfile(payload, guest?.id ?? null);

    if (!profile) {
      throw new BadRequestException(
        'Игровой профиль гостя не найден. Сначала подтвердите телефон и выберите клуб.',
      );
    }

    const openedAt = new Date();
    const openedDate = openedAt.toISOString().slice(0, 10);
    const surface = guestPortalAppOpenSurface(dto.surface);
    const sourceFactId = [profile.id, context.store.id, openedDate].join(':');
    const actor: AuthenticatedUser = {
      id: `guest-portal:${payload.sub}`,
      email: 'guest-portal@leetplus.local',
      fullName: 'Гостевой портал',
      role: UserRole.CLUB_MANAGER,
      isPlatformAdmin: false,
      tenantId: context.tenant.id,
      tenantSlug: context.tenant.slug,
      tenantStatus: TenantLifecycleStatus.ACTIVE,
    };
    const eventExternalId = buildGuestPortalGameExternalId(
      GAME_APP_OPEN_SOURCE_KIND,
      GAME_APP_OPEN_EVENT_TYPE,
      sourceFactId,
    );
    let idempotent = false;

    try {
      await this.guestGamificationService.createEvent(actor, {
        profileId: profile.id,
        guestId: guest?.id ?? profile.guestId ?? null,
        eventType: GAME_APP_OPEN_EVENT_TYPE,
        source: 'API_IMPORT',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: GAME_APP_OPEN_EXTERNAL_DOMAIN,
        externalId: eventExternalId,
        xpDelta: 0,
        occurredAt: openedAt.toISOString(),
        payload: {
          source: 'guest_portal_app_open',
          sourceFactId,
          sourceFactKind: GAME_APP_OPEN_SOURCE_KIND,
          storeId: context.store.id,
          surface,
        },
        note:
          surface === 'TG_MINI_APP'
            ? 'Гость открыл Telegram Mini App LeetPlus Game.'
            : 'Гость открыл игровой модуль LeetPlus.',
      });
    } catch (error) {
      if (!isPrismaUniqueConstraintError(error)) {
        throw error;
      }

      idempotent = true;
    }
    const nextPayload: GuestPortalTokenPayload = {
      ...payload,
      guestId: guest?.id ?? profile.guestId ?? null,
      profileId: profile.id,
    };
    const portal = await this.buildPortalPayload(nextPayload);
    const referralStats = await this.getGameReferralStats(
      nextPayload.tenantId,
      portal.profile.id,
    );
    const summary = buildGameSummaryFromPortal(portal, {
      referralSecret: this.referralSecret(),
      webUrl: this.publicWebUrl(),
      referralStats,
    });

    return {
      processed: true,
      idempotent,
      appliedXpDelta: 0,
      createdRewards: 0,
      queuedRewardAmount: 0,
      portal,
      summary,
      message: idempotent
        ? 'Открытие уже засчитано сегодня.'
        : 'Открытие игрового модуля засчитано.',
    };
  }

  async openLootBox(
    authorization: string | undefined,
    lootBoxId: string,
  ): Promise<GuestPortalLootBoxOpenResponse> {
    const id = typeof lootBoxId === 'string' ? lootBoxId.trim() : '';

    if (!id) {
      throw new BadRequestException('Выберите лутбокс.');
    }

    const payload = await this.verifyGuestToken(authorization);
    return this.openLootBoxForPayload(payload, id);
  }

  private async openLootBoxForPayload(
    payload: GuestPortalTokenPayload,
    id: string,
  ): Promise<GuestPortalLootBoxOpenResponse> {
    const context = await this.getTenantStoreByIds(
      payload.tenantId,
      payload.storeId,
    );
    const guest = await this.findGuest(payload);
    const profile = await this.findProfile(payload, guest?.id ?? null);

    if (!profile) {
      throw new BadRequestException(
        'Игровой профиль гостя не найден. Сначала подтвердите телефон и выберите клуб.',
      );
    }

    const lootBox = await this.prisma.guestGameLootBox.findFirst({
      where: {
        id,
        tenantId: context.tenant.id,
        status: 'ACTIVE',
      },
    });

    if (!lootBox) {
      throw new NotFoundException('Лутбокс не найден.');
    }

    if (!matchesStore(lootBox.storeIds, context.store.id)) {
      throw new BadRequestException('Лутбокс недоступен в выбранном клубе.');
    }

    const visualLootBoxRefs = await this.getPublishedVisualLootBoxRefs(
      context.tenant.id,
      context.store.id,
    );

    if (
      visualLootBoxRefs &&
      !visualLootBoxRefsContain(visualLootBoxRefs, lootBox)
    ) {
      throw new BadRequestException(
        'Лутбокс не опубликован для этого клуба в визуальном редакторе.',
      );
    }

    if (lootBox.triggerKind !== GAME_APP_OPEN_EVENT_TYPE) {
      throw new BadRequestException(
        lootBoxWaitingEventMessage(lootBox.triggerKind),
      );
    }

    const openedAt = new Date();
    const currentRewards = await this.findPortalRewards(
      context.tenant.id,
      context.store.id,
      guest?.id ?? profile.guestId ?? null,
      profile.id,
    );
    const openState = buildLootBoxOpenState(lootBox, currentRewards);

    if (!openState.openable) {
      throw new BadRequestException(
        openState.openBlocker ?? 'Лутбокс сейчас недоступен.',
      );
    }

    const sourceFactId = await this.buildLootBoxOpenSourceFactId(
      context.tenant.id,
      profile.id,
      guest?.id ?? profile.guestId ?? null,
      context.store.id,
      lootBox.id,
      lootBox.limits,
      openedAt,
    );
    const actor: AuthenticatedUser = {
      id: `guest-portal:${payload.sub}`,
      email: 'guest-portal@leetplus.local',
      fullName: 'Гостевой портал',
      role: UserRole.CLUB_MANAGER,
      isPlatformAdmin: false,
      tenantId: context.tenant.id,
      tenantSlug: context.tenant.slug,
      tenantStatus: TenantLifecycleStatus.ACTIVE,
    };
    const processDto = {
      profileId: profile.id,
      guestId: guest?.id ?? profile.guestId ?? null,
      lootBoxId: lootBox.id,
      storeId: context.store.id,
      eventType: GAME_APP_OPEN_EVENT_TYPE,
      occurredAt: openedAt.toISOString(),
      sourceFactId,
      sourceFactKind: GAME_LOOT_BOX_OPEN_SOURCE_KIND,
      externalDomain: GAME_APP_OPEN_EXTERNAL_DOMAIN,
      note: `Гость открыл лутбокс "${lootBox.name}" в игровом модуле LeetPlus.`,
    };
    const dryRun = await this.guestGamificationService.dryRun(
      actor,
      processDto,
    );
    const rule = dryRun.rules.find(
      (item) => item.kind === 'LOOT_BOX' && item.id === lootBox.id,
    );

    if (!rule?.eligible) {
      throw new BadRequestException(
        rule?.blockers[0] ?? 'Лутбокс сейчас недоступен.',
      );
    }

    const processResult = await this.guestGamificationService.processEvent(
      actor,
      processDto,
    );
    const nextPayload: GuestPortalTokenPayload = {
      ...payload,
      guestId: guest?.id ?? profile.guestId ?? null,
      profileId: profile.id,
    };
    const portal = await this.buildPortalPayload(nextPayload);
    const referralStats = await this.getGameReferralStats(
      nextPayload.tenantId,
      portal.profile.id,
    );
    const summary = buildGameSummaryFromPortal(portal, {
      referralSecret: this.referralSecret(),
      webUrl: this.publicWebUrl(),
      referralStats,
    });

    return {
      processed: true,
      idempotent: processResult.summary.idempotent,
      createdRewards: processResult.summary.createdRewards,
      queuedRewardAmount: processResult.summary.queuedRewardAmount,
      rewards: processResult.rewards,
      portal,
      summary,
      message: processResult.summary.idempotent
        ? 'Лутбокс уже был открыт.'
        : 'Лутбокс открыт, награда сохранена.',
    };
  }

  async selectGameClub(
    authorization: string | undefined,
    dto: { clubId?: unknown; tenantSlug?: unknown; storeId?: unknown },
  ): Promise<GuestPortalClubSelectResponse> {
    const payload = await this.verifyGuestToken(authorization);
    const selectedClub = normalizeMiniAppClubSelection(dto);

    if (!selectedClub?.tenantSlug || !selectedClub.storeId) {
      throw new BadRequestException('Выберите клуб игрового модуля.');
    }

    const context = await this.getTenantStore(
      selectedClub.tenantSlug,
      selectedClub.storeId,
    );

    await this.ensureGamificationClubAvailable(
      context.tenant.slug,
      context.store.id,
    );

    const sourceGuest = await this.findGuest(payload);
    const sourceProfile = await this.findProfile(
      payload,
      sourceGuest?.id ?? null,
    );
    const targetPayloadBase: GuestPortalTokenPayload = {
      ...payload,
      tenantId: context.tenant.id,
      storeId: context.store.id,
      guestId: null,
      profileId:
        context.tenant.id === payload.tenantId ? payload.profileId : null,
    };
    const targetGuest = await this.findGuest(targetPayloadBase);
    const targetGuestProfile = targetGuest
      ? await this.prisma.guestGameProfile.findFirst({
          where: {
            tenantId: context.tenant.id,
            guestId: targetGuest.id,
          },
          orderBy: { updatedAt: 'desc' },
        })
      : null;
    let targetProfile =
      targetGuestProfile ??
      (await this.findProfile(targetPayloadBase, targetGuest?.id ?? null));
    const now = new Date();

    if (!targetProfile) {
      targetProfile = await this.prisma.guestGameProfile.create({
        data: {
          tenantId: context.tenant.id,
          guestId: targetGuest?.id,
          displayName:
            sourceProfile?.displayName ??
            sourceGuest?.fullNameMasked ??
            sourceGuest?.externalGuestId ??
            'Гость клуба',
          contactMasked:
            sourceProfile?.contactMasked ??
            sourceGuest?.phoneMasked ??
            sourceGuest?.emailMasked ??
            null,
          phoneHash: payload.phoneHash,
          ...(sourceProfile?.phoneEncrypted
            ? { phoneEncrypted: sourceProfile.phoneEncrypted }
            : {}),
          ...(sourceProfile?.isStaffTest
            ? this.copyStaffTestProfileData(sourceProfile)
            : {}),
          phoneConsentStatus:
            sourceProfile?.phoneConsentStatus ??
            GuestCommunicationConsentStatus.UNKNOWN,
          phoneConsentSource:
            sourceProfile?.phoneConsentSource ?? 'guest_portal_club_selection',
          phoneConsentAt: sourceProfile?.phoneConsentAt ?? null,
          unsubscribedAt: sourceProfile?.unsubscribedAt ?? null,
          status: 'ACTIVE',
          lastActivityAt: now,
        },
      });
    } else {
      targetProfile = await this.prisma.guestGameProfile.update({
        where: { id: targetProfile.id },
        data: {
          guestId: targetProfile.guestId ?? targetGuest?.id ?? undefined,
          phoneHash: targetProfile.phoneHash ?? payload.phoneHash,
          ...(sourceProfile?.phoneEncrypted && !targetProfile.phoneEncrypted
            ? { phoneEncrypted: sourceProfile.phoneEncrypted }
            : {}),
          ...(sourceProfile?.isStaffTest
            ? this.copyStaffTestProfileData(sourceProfile)
            : {}),
          status: 'ACTIVE',
          lastActivityAt: now,
        },
      });
    }

    const nextPayload: GuestPortalTokenPayload = {
      ...targetPayloadBase,
      sub: `game-club:${targetProfile.id}:${context.store.id}`,
      guestId: targetGuest?.id ?? targetProfile.guestId ?? null,
      profileId: targetProfile.id,
    };
    const token = await this.signGuestPortalToken(nextPayload);
    const portal = await this.buildPortalPayload(nextPayload);
    const referralStats = await this.getGameReferralStats(
      nextPayload.tenantId,
      portal.profile.id,
    );
    const summary = buildGameSummaryFromPortal(portal, {
      referralSecret: this.referralSecret(),
      webUrl: this.publicWebUrl(),
      referralStats,
    });
    const clubId = `${context.tenant.slug}:${
      context.store.publicSlug ?? context.store.id
    }`;

    return {
      token,
      portal,
      summary,
      clubId,
      message: `Выбран клуб ${context.store.name}. Игровая сессия обновлена.`,
    };
  }

  async exchangeTelegramMiniAppSession(dto: {
    initData?: unknown;
    telegramUserId?: unknown;
    authDate?: unknown;
    clubId?: unknown;
    tenantSlug?: unknown;
    storeId?: unknown;
    edgeSecret?: unknown;
  }): Promise<GuestPortalTelegramMiniAppSessionResponse> {
    const validation =
      typeof dto.initData === 'string' && dto.initData.trim()
        ? this.validateTelegramMiniAppInitData(dto.initData)
        : this.validateTelegramMiniAppEdgeAssertion(dto);

    if (!validation.ok) {
      return {
        status: validation.status,
        profileId: null,
        telegramIdentityMasked: validation.telegramIdentityMasked,
        message: validation.message,
      };
    }

    const telegramIdentity = `chat:${validation.userId}`;
    const telegramIdentityMasked = maskExternalIdentity(telegramIdentity);
    const selectedClub = normalizeMiniAppClubSelection(dto);
    const candidates = await this.findTelegramMiniAppClubs(telegramIdentity);

    if (candidates.length === 0) {
      return {
        status: 'AUTH_REQUIRED',
        profileId: null,
        telegramIdentityMasked,
        message:
          'Telegram Mini App открыт, но подтвержденный игровой профиль LeetPlus для этого Telegram еще не найден. Начните вход через /game/auth или /play и поделитесь телефоном в боте.',
      };
    }

    const selectedCandidate = selectedClub
      ? candidates.find((candidate) =>
          miniAppClubMatchesSelection(candidate, selectedClub),
        )
      : candidates.length === 1
        ? candidates[0]
        : null;

    if (!selectedCandidate) {
      return {
        status: 'CLUB_SELECTION_REQUIRED',
        profileId: null,
        telegramIdentityMasked,
        clubs: candidates.map(mapTelegramMiniAppClub),
        message:
          'Telegram связан с несколькими игровыми клубами. Выберите клуб, чтобы открыть Mini App в нужном tenant/store scope.',
      };
    }

    const payload: GuestPortalTokenPayload = {
      sub: `telegram-mini-app:${selectedCandidate.profile.id}`,
      purpose: GUEST_PORTAL_PURPOSE,
      tenantId: selectedCandidate.tenant.id,
      storeId: selectedCandidate.store.id,
      guestId: selectedCandidate.profile.guestId,
      profileId: selectedCandidate.profile.id,
      phoneHash: selectedCandidate.profile.phoneHash,
    };
    const token = await this.signGuestPortalToken(payload);
    const portal = await this.buildPortalPayload(payload);

    return {
      status: 'CONFIRMED',
      token,
      portal,
      profileId: selectedCandidate.profile.id,
      phoneMasked: selectedCandidate.profile.contactMasked,
      telegramIdentityMasked,
      message:
        'Telegram Mini App подтвержден. Гостевая игровая сессия открыта безопасно через GuestGameProfile.',
    };
  }

  private async getGameReferralStats(
    tenantId: string,
    profileId: string | null,
  ): Promise<GuestPortalReferralStats> {
    if (!profileId) {
      return emptyGameReferralStats();
    }

    const inviterFilter = {
      payload: {
        path: ['inviterProfileId'],
        equals: profileId,
      },
    } satisfies Prisma.GuestGameEventWhereInput;
    const baseWhere: Prisma.GuestGameEventWhereInput = {
      tenantId,
      eventType: GAME_REFERRAL_ACCEPTED_EVENT_TYPE,
      source: GAME_REFERRAL_EVENT_SOURCE,
      AND: [inviterFilter],
    };
    const eligibleWhere: Prisma.GuestGameEventWhereInput = {
      tenantId,
      eventType: GAME_REFERRAL_ACCEPTED_EVENT_TYPE,
      source: GAME_REFERRAL_EVENT_SOURCE,
      AND: [
        inviterFilter,
        {
          payload: {
            path: ['eligibleForReward'],
            equals: true,
          },
        },
      ],
    };
    const [acceptedCount, eligibleCount, latestAccepted] = await Promise.all([
      this.prisma.guestGameEvent.count({ where: baseWhere }),
      this.prisma.guestGameEvent.count({ where: eligibleWhere }),
      this.prisma.guestGameEvent.findFirst({
        where: baseWhere,
        select: { occurredAt: true },
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);

    return {
      acceptedCount,
      eligibleCount,
      latestAcceptedAt: latestAccepted?.occurredAt.toISOString() ?? null,
    };
  }

  async checkIn(
    authorization: string | undefined,
    dto: { note?: unknown },
  ): Promise<GuestPortalCheckInResponse> {
    const payload = await this.verifyGuestToken(authorization);
    const context = await this.getTenantStoreByIds(
      payload.tenantId,
      payload.storeId,
    );
    const guest = await this.findGuest(payload);

    if (!guest) {
      throw new BadRequestException(
        'Гость еще не сопоставлен с Langame. Сначала подтвердите профиль гостя.',
      );
    }

    const actor: AuthenticatedUser = {
      id: `guest-portal:${payload.sub}`,
      email: 'guest-portal@leetplus.local',
      fullName: 'Гостевой портал',
      role: UserRole.CLUB_MANAGER,
      isPlatformAdmin: false,
      tenantId: context.tenant.id,
      tenantSlug: context.tenant.slug,
      tenantStatus: TenantLifecycleStatus.ACTIVE,
    };
    const checkIn = await this.guestGamificationService.checkIn(actor, {
      guestId: guest.id,
      storeId: context.store.id,
      note: stringField(dto.note) ?? 'Чекин гостя из публичного кабинета.',
    });

    return {
      checkIn,
      portal: await this.buildPortalPayload({
        ...payload,
        guestId: guest.id,
        profileId: checkIn.processResult.event.profile?.id ?? payload.profileId,
      }),
    };
  }

  async updateCommunicationPreferences(
    authorization: string | undefined,
    dto: { action?: unknown },
  ): Promise<GuestPortalCommunicationPreferenceResponse> {
    const payload = await this.verifyGuestToken(authorization);
    const action = communicationPreferenceAction(dto.action);
    const guest = await this.findGuest(payload);
    const existingProfile = await this.findProfile(payload, guest?.id ?? null);
    const crmLead = await this.findCrmLead(
      payload,
      existingProfile?.leadId ?? null,
      guest?.id ?? null,
    );

    if (!guest && !crmLead && !existingProfile) {
      throw new BadRequestException(
        'Профиль гостя, игровой профиль или CRM-заявка еще не найдены. Согласие можно сохранить после регистрации в геймификации, сопоставления с Langame или CRM-лидом.',
      );
    }

    const now = new Date();
    const consentData =
      action === 'GRANT'
        ? {
            phoneConsentStatus: GuestCommunicationConsentStatus.GRANTED,
            phoneConsentSource: 'guest_portal',
            phoneConsentAt: now,
            unsubscribedAt: null,
          }
        : action === 'DENY'
          ? {
              phoneConsentStatus: GuestCommunicationConsentStatus.DENIED,
              phoneConsentSource: 'guest_portal',
              phoneConsentAt: null,
              unsubscribedAt: null,
            }
          : {
              phoneConsentStatus: GuestCommunicationConsentStatus.UNSUBSCRIBED,
              phoneConsentSource: 'guest_portal',
              phoneConsentAt: null,
              unsubscribedAt: now,
            };
    const guestData =
      action === 'UNSUBSCRIBE'
        ? {
            ...consentData,
            crmStatus: GuestCrmStatus.DO_NOT_CONTACT,
            crmUpdatedAt: now,
          }
        : consentData;
    const leadData =
      action === 'UNSUBSCRIBE'
        ? {
            ...consentData,
            crmStatus: GuestCrmStatus.DO_NOT_CONTACT,
          }
        : consentData;

    await this.prisma.$transaction([
      ...(guest
        ? [
            this.prisma.guest.update({
              where: { id: guest.id },
              data: guestData,
            }),
            this.prisma.guestCrmEvent.create({
              data: {
                tenantId: payload.tenantId,
                guestId: guest.id,
                status: communicationPreferenceCrmStatus(action),
                note: communicationPreferenceEventNote(action),
              },
            }),
          ]
        : []),
      ...(crmLead
        ? [
            this.prisma.guestCrmLead.update({
              where: { id: crmLead.id },
              data: leadData,
            }),
          ]
        : []),
      ...(existingProfile
        ? [
            this.prisma.guestGameProfile.update({
              where: { id: existingProfile.id },
              data: consentData,
            }),
            this.prisma.guestGameEvent.create({
              data: {
                tenantId: payload.tenantId,
                profileId: existingProfile.id,
                guestId: guest?.id ?? payload.guestId ?? null,
                eventType: GAME_COMMUNICATION_CONSENT_EVENT_TYPE,
                source: 'GUEST_PORTAL',
                externalId: `communication:${existingProfile.id}:${now.getTime()}:${action.toLowerCase()}`,
                occurredAt: now,
                payload: {
                  action,
                  consentStatus: consentData.phoneConsentStatus,
                  consentSource: consentData.phoneConsentSource,
                  consentAt: consentData.phoneConsentAt?.toISOString() ?? null,
                  unsubscribedAt:
                    consentData.unsubscribedAt?.toISOString() ?? null,
                },
                note: communicationPreferenceEventNote(action),
                createdAt: now,
              },
            }),
          ]
        : []),
    ]);

    return {
      portal: await this.buildPortalPayload({
        ...payload,
        guestId: guest?.id ?? payload.guestId,
      }),
      message: communicationPreferenceMessage(action),
    };
  }

  async updateMessengerChannel(
    authorization: string | undefined,
    dto: { channel?: unknown; identity?: unknown },
  ): Promise<GuestPortalMessengerUpdateResponse> {
    const payload = await this.verifyGuestToken(authorization);
    const channel = messengerChannel(dto.channel);
    const identity = messengerIdentity(channel, dto.identity);
    const guest = await this.findGuest(payload);
    let existingProfile = await this.findProfile(payload, guest?.id ?? null);
    const crmLead = await this.findCrmLead(
      payload,
      existingProfile?.leadId ?? null,
      guest?.id ?? null,
    );
    if (!existingProfile && crmLead) {
      existingProfile = await this.findProfileByLead(
        payload.tenantId,
        crmLead.id,
      );
    }

    if (!guest && !existingProfile && !crmLead) {
      throw new BadRequestException(
        'Профиль гостя или CRM-заявка еще не найдены. Привязка Telegram/MAX станет доступна после сопоставления с Langame или CRM-лидом.',
      );
    }

    const field =
      channel === 'TELEGRAM'
        ? ({ telegramIdentity: identity } as const)
        : ({ maxIdentity: identity } as const);

    const profile = existingProfile
      ? await this.prisma.guestGameProfile.update({
          where: { id: existingProfile.id },
          data: {
            ...field,
            phoneHash: existingProfile.phoneHash ?? payload.phoneHash,
            status: 'ACTIVE',
          },
        })
      : await this.prisma.guestGameProfile.create({
          data: {
            tenantId: payload.tenantId,
            guestId: guest?.id,
            leadId: crmLead?.id,
            displayName:
              guest?.fullNameMasked ??
              guest?.externalGuestId ??
              crmLead?.fullNameMasked ??
              crmLead?.phoneMasked ??
              'Гость клуба',
            contactMasked:
              guest?.phoneMasked ??
              guest?.emailMasked ??
              crmLead?.phoneMasked ??
              crmLead?.emailMasked ??
              null,
            phoneHash: payload.phoneHash,
            ...field,
          },
        });

    if (guest) {
      await this.prisma.guestCrmEvent.create({
        data: {
          tenantId: payload.tenantId,
          guestId: guest.id,
          status: guest.crmStatus,
          note: messengerEventNote(channel),
        },
      });
    }

    return {
      portal: await this.buildPortalPayload({
        ...payload,
        guestId: guest?.id ?? payload.guestId,
        profileId: profile.id,
      }),
      message: messengerMessage(channel),
    };
  }

  async startTelegramLink(
    authorization: string | undefined,
  ): Promise<GuestPortalTelegramLinkStartResponse> {
    const payload = await this.verifyGuestToken(authorization);
    const guest = await this.findGuest(payload);
    let existingProfile = await this.findProfile(payload, guest?.id ?? null);
    const crmLead = await this.findCrmLead(
      payload,
      existingProfile?.leadId ?? null,
      guest?.id ?? null,
    );
    if (!existingProfile && crmLead) {
      existingProfile = await this.findProfileByLead(
        payload.tenantId,
        crmLead.id,
      );
    }

    if (!guest && !existingProfile && !crmLead) {
      throw new BadRequestException(
        'Профиль гостя или CRM-заявка еще не найдены. Telegram-бот можно привязать после сопоставления с Langame или CRM-лидом.',
      );
    }

    const profile = existingProfile
      ? await this.prisma.guestGameProfile.update({
          where: { id: existingProfile.id },
          data: {
            phoneHash: existingProfile.phoneHash ?? payload.phoneHash,
            status: 'ACTIVE',
          },
        })
      : await this.prisma.guestGameProfile.create({
          data: {
            tenantId: payload.tenantId,
            guestId: guest?.id,
            leadId: crmLead?.id,
            displayName:
              guest?.fullNameMasked ??
              guest?.externalGuestId ??
              crmLead?.fullNameMasked ??
              crmLead?.phoneMasked ??
              'Гость клуба',
            contactMasked:
              guest?.phoneMasked ??
              guest?.emailMasked ??
              crmLead?.phoneMasked ??
              crmLead?.emailMasked ??
              null,
            phoneHash: payload.phoneHash,
          },
        });

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + TELEGRAM_LINK_TTL_MINUTES * 60 * 1000,
    );
    const code = this.generateTelegramLinkCode();
    const botUsername = this.telegramBotUsername();

    await this.prisma.$transaction([
      this.prisma.guestGameTelegramLinkChallenge.updateMany({
        where: {
          tenantId: payload.tenantId,
          profileId: profile.id,
          status: 'PENDING',
        },
        data: { status: 'EXPIRED' },
      }),
      this.prisma.guestGameTelegramLinkChallenge.create({
        data: {
          tenantId: payload.tenantId,
          storeId: payload.storeId,
          profileId: profile.id,
          guestId: guest?.id ?? null,
          phoneHash: payload.phoneHash,
          codeHash: this.hashTelegramLinkCode(code),
          status: 'PENDING',
          expiresAt,
        },
      }),
    ]);

    return {
      code,
      codeMasked: maskTelegramLinkCode(code),
      expiresAt: expiresAt.toISOString(),
      botUsername,
      botDeepLink: botUsername
        ? `https://t.me/${botUsername}?start=${encodeURIComponent(
            telegramStartPayload(code),
          )}`
        : null,
      status: botUsername ? 'READY' : 'BOT_NOT_CONFIGURED',
      message: botUsername
        ? 'Код создан. Откройте Telegram-бота по ссылке и подтвердите привязку.'
        : 'Код создан. Username Telegram-бота еще не настроен, поэтому код можно использовать после подключения бота.',
    };
  }

  async confirmTelegramLink(
    secret: string | undefined,
    dto: {
      code?: unknown;
      telegramChatId?: unknown;
      telegramUsername?: unknown;
    },
  ): Promise<GuestPortalTelegramLinkConfirmResponse> {
    this.assertTelegramLinkSecret(secret);
    const code = telegramLinkCode(dto.code);
    const chatId = telegramChatId(dto.telegramChatId);
    const username = telegramUsername(dto.telegramUsername);
    const now = new Date();

    const challenge =
      await this.prisma.guestGameTelegramLinkChallenge.findFirst({
        where: {
          codeHash: this.hashTelegramLinkCode(code),
          status: 'PENDING',
        },
        orderBy: { createdAt: 'desc' },
        include: {
          profile: true,
          guest: {
            select: {
              id: true,
              crmStatus: true,
            },
          },
        },
      });

    if (!challenge) {
      throw new BadRequestException('Telegram link code is not active.');
    }

    if (challenge.expiresAt.getTime() <= now.getTime()) {
      await this.prisma.guestGameTelegramLinkChallenge.update({
        where: { id: challenge.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('Telegram link code has expired.');
    }

    const telegramIdentity = `chat:${chatId}`;
    const telegramChatIdMasked = maskTelegramChatId(chatId);

    await this.prisma.$transaction([
      this.prisma.guestGameProfile.update({
        where: { id: challenge.profileId },
        data: {
          telegramIdentity,
          phoneHash: challenge.profile.phoneHash ?? challenge.phoneHash,
          status: 'ACTIVE',
        },
      }),
      this.prisma.guestGameTelegramLinkChallenge.update({
        where: { id: challenge.id },
        data: {
          status: 'CONSUMED',
          consumedAt: now,
          telegramChatIdMasked,
          telegramUsername: username,
        },
      }),
      ...(challenge.guest
        ? [
            this.prisma.guestCrmEvent.create({
              data: {
                tenantId: challenge.tenantId,
                guestId: challenge.guest.id,
                status: challenge.guest.crmStatus,
                note: `${TELEGRAM_LINK_EVENT_PREFIX}confirmed`,
              },
            }),
          ]
        : []),
    ]);

    return {
      status: 'CONFIRMED',
      tenantId: challenge.tenantId,
      profileId: challenge.profileId,
      telegramIdentityMasked: maskExternalIdentity(telegramIdentity),
      message:
        'Telegram chat_id подтвержден и сохранен в гостевом игровом профиле. Внешние отправки включаются отдельно через dispatcher-настройки.',
    };
  }

  async handleTelegramWebhook(
    secret: string | undefined,
    dto: unknown,
  ): Promise<GuestPortalTelegramWebhookResponse> {
    this.assertTelegramLinkSecret(secret);
    const update = telegramWebhookUpdate(dto);
    const telegramIdentityMasked = maskExternalIdentity(
      `chat:${update.telegramChatId}`,
    );

    if (telegramWebhookUnsubscribeCommand(update.text)) {
      return this.unsubscribeTelegramWebhookProfile(
        update.telegramChatId,
        telegramIdentityMasked,
      );
    }

    const code = telegramWebhookLinkCode(update.text);

    if (code) {
      const authStart = await this.acceptTelegramAuthStart(
        code,
        update.telegramChatId,
        update.telegramUsername,
        telegramIdentityMasked,
      );

      if (authStart) {
        return this.dispatchTelegramWebhookReply(
          authStart,
          update.telegramChatId,
        );
      }

      try {
        const result = await this.confirmTelegramLink(secret, {
          code,
          telegramChatId: update.telegramChatId,
          telegramUsername: update.telegramUsername,
        });

        return {
          status: 'CONFIRMED',
          action: 'LINK_CODE',
          profileId: result.profileId,
          telegramIdentityMasked: result.telegramIdentityMasked,
          message:
            'Telegram webhook подтвердил код и сохранил chat_id гостя. Внешняя отправка наград остается под управлением delivery dispatcher.',
        };
      } catch (error) {
        return {
          status: 'FAILED',
          action: 'LINK_CODE',
          profileId: null,
          telegramIdentityMasked,
          message:
            error instanceof Error
              ? error.message
              : 'Telegram webhook не смог подтвердить код.',
        };
      }
    }

    if (update.contactPhone) {
      const response = await this.completeTelegramAuthContact(
        update,
        telegramIdentityMasked,
      );

      return this.dispatchTelegramWebhookReply(response, update.telegramChatId);
    }

    if (update.callbackData) {
      const cityCallbackToken = telegramBotCityCallbackToken(
        update.callbackData,
      );
      const clubCallbackToken = telegramBotClubCallbackToken(
        update.callbackData,
      );
      const callbackCommand = telegramWebhookBotCommand(update.callbackData);
      let response: GuestPortalTelegramWebhookResponse;

      if (cityCallbackToken) {
        response = await this.buildTelegramBotCityClubListResponse(
          cityCallbackToken,
          update.telegramChatId,
          telegramIdentityMasked,
        );
      } else if (clubCallbackToken) {
        response = await this.buildTelegramBotClubSelectResponse(
          clubCallbackToken,
          update.telegramChatId,
          telegramIdentityMasked,
        );
      } else if (callbackCommand) {
        response = await this.buildTelegramBotCommandResponse(
          callbackCommand,
          update.telegramChatId,
          telegramIdentityMasked,
        );
      } else {
        response = await this.buildTelegramBotCommandResponse(
          'MENU',
          update.telegramChatId,
          telegramIdentityMasked,
        );
      }

      return this.dispatchTelegramWebhookReply(response, update.telegramChatId);
    }

    const botCommand = telegramWebhookBotCommand(update.text);
    if (botCommand) {
      const response = await this.buildTelegramBotCommandResponse(
        botCommand,
        update.telegramChatId,
        telegramIdentityMasked,
      );

      return this.dispatchTelegramWebhookReply(response, update.telegramChatId);
    }

    return {
      status: 'IGNORED',
      action: 'UNKNOWN',
      profileId: null,
      telegramIdentityMasked,
      message:
        'Telegram webhook получен, но команда привязки или контакт телефона не найдены. Ожидается /start lp_CODE, /link CODE или Telegram contact-share.',
    };
  }

  private async acceptTelegramAuthStart(
    code: string,
    telegramChatIdValue: string,
    telegramUsernameValue: string | null,
    telegramIdentityMasked: string | null,
  ): Promise<GuestPortalTelegramWebhookResponse | null> {
    const now = new Date();
    const challenge =
      await this.prisma.guestGameTelegramLinkChallenge.findFirst({
        where: {
          codeHash: this.hashTelegramLinkCode(code),
          status: TELEGRAM_AUTH_PENDING_STATUS,
        },
        orderBy: { createdAt: 'desc' },
        include: { profile: true },
      });

    if (!challenge) {
      return null;
    }

    if (challenge.expiresAt.getTime() <= now.getTime()) {
      await this.prisma.guestGameTelegramLinkChallenge.update({
        where: { id: challenge.id },
        data: { status: 'EXPIRED' },
      });

      return {
        status: 'FAILED',
        action: 'TELEGRAM_AUTH_START',
        profileId: challenge.profileId,
        telegramIdentityMasked,
        message: 'Срок действия Telegram-входа истек. Создайте новую ссылку.',
        reply: this.telegramWebhookRemoveKeyboardReply(
          telegramIdentityMasked,
          'Ссылка для входа в LeetPlus устарела. Вернитесь на страницу регистрации и создайте новую.',
        ),
      };
    }

    const telegramIdentity = `chat:${telegramChatIdValue}`;
    const telegramChatIdMasked = maskTelegramChatId(telegramChatIdValue);
    const username = telegramUsername(telegramUsernameValue);

    await this.prisma.$transaction([
      this.prisma.guestGameProfile.update({
        where: { id: challenge.profileId },
        data: {
          telegramIdentity,
          status:
            challenge.profile.status === TELEGRAM_AUTH_PROFILE_STATUS
              ? TELEGRAM_AUTH_PROFILE_STATUS
              : challenge.profile.status,
          lastActivityAt: now,
        },
      }),
      this.prisma.guestGameTelegramLinkChallenge.update({
        where: { id: challenge.id },
        data: {
          status: TELEGRAM_AUTH_AWAITING_CONTACT_STATUS,
          telegramChatIdMasked,
          telegramUsername: username,
        },
      }),
    ]);

    return {
      status: 'AWAITING_CONTACT',
      action: 'TELEGRAM_AUTH_START',
      profileId: challenge.profileId,
      telegramIdentityMasked,
      message:
        'Telegram-бот связан с браузерным входом. Теперь гость должен поделиться телефоном кнопкой бота.',
      reply: this.telegramWebhookContactRequestReply(telegramIdentityMasked),
    };
  }

  private async completeTelegramAuthContact(
    update: ReturnType<typeof telegramWebhookUpdate>,
    telegramIdentityMasked: string | null,
  ): Promise<GuestPortalTelegramWebhookResponse> {
    if (
      update.contactUserId &&
      update.contactUserId !== update.telegramChatId
    ) {
      return {
        status: 'FAILED',
        action: 'TELEGRAM_AUTH_CONTACT',
        profileId: null,
        telegramIdentityMasked,
        message:
          'Telegram contact принадлежит другому пользователю. Для входа нужен собственный номер.',
        reply: this.telegramWebhookContactRequestReply(
          telegramIdentityMasked,
          'Для входа в LeetPlus нужен ваш собственный номер Telegram. Нажмите кнопку ниже и поделитесь телефоном этого аккаунта.',
        ),
      };
    }

    const telegramIdentity = `chat:${update.telegramChatId}`;
    const phone = this.phoneIdentity(update.contactPhone);
    const now = new Date();
    const challenge =
      await this.prisma.guestGameTelegramLinkChallenge.findFirst({
        where: {
          status: TELEGRAM_AUTH_AWAITING_CONTACT_STATUS,
          profile: {
            telegramIdentity,
            status: TELEGRAM_AUTH_PROFILE_STATUS,
          },
        },
        orderBy: { createdAt: 'desc' },
        include: { profile: true },
      });

    if (!challenge) {
      return {
        status: 'IGNORED',
        action: 'TELEGRAM_AUTH_CONTACT',
        profileId: null,
        telegramIdentityMasked,
        message:
          'Telegram contact получен, но активный вход LeetPlus для этого чата не найден.',
        reply: this.telegramWebhookRemoveKeyboardReply(
          telegramIdentityMasked,
          'Активный вход LeetPlus не найден. Откройте регистрацию на leetplus.ru/play и начните вход через Telegram заново.',
        ),
      };
    }

    if (challenge.expiresAt.getTime() <= now.getTime()) {
      await this.prisma.guestGameTelegramLinkChallenge.update({
        where: { id: challenge.id },
        data: { status: 'EXPIRED' },
      });

      return {
        status: 'FAILED',
        action: 'TELEGRAM_AUTH_CONTACT',
        profileId: challenge.profileId,
        telegramIdentityMasked,
        message: 'Срок действия Telegram-входа истек. Создайте новую ссылку.',
        reply: this.telegramWebhookRemoveKeyboardReply(
          telegramIdentityMasked,
          'Ссылка для входа в LeetPlus устарела. Вернитесь на страницу регистрации и создайте новую.',
        ),
      };
    }

    const staffTestMatch = await this.resolveStaffTestMatch(
      challenge.tenantId,
      phone,
    );
    const staffTestData = this.staffTestProfilePatch(staffTestMatch);

    const result = await this.prisma.$transaction(async (tx) => {
      const guest = await tx.guest.findFirst({
        where: {
          tenantId: challenge.tenantId,
          phoneHash: phone.hash,
          isDisabled: false,
        },
        orderBy: [{ lastActivityAt: 'desc' }, { updatedAt: 'desc' }],
        select: {
          id: true,
          externalGuestId: true,
          fullNameMasked: true,
          phoneMasked: true,
          emailMasked: true,
        },
      });
      const existingByGuest = guest
        ? await tx.guestGameProfile.findFirst({
            where: {
              tenantId: challenge.tenantId,
              guestId: guest.id,
              status: 'ACTIVE',
            },
            orderBy: { updatedAt: 'desc' },
          })
        : null;
      const existingByPhone = existingByGuest
        ? null
        : await tx.guestGameProfile.findFirst({
            where: {
              tenantId: challenge.tenantId,
              phoneHash: phone.hash,
              status: 'ACTIVE',
            },
            orderBy: { updatedAt: 'desc' },
          });
      const existingProfile = existingByGuest ?? existingByPhone;
      const commonData = {
        telegramIdentity,
        phoneHash: existingProfile?.phoneHash ?? phone.hash,
        phoneEncrypted:
          existingProfile?.phoneEncrypted ?? this.encryptPhone(phone),
        contactMasked:
          existingProfile?.contactMasked ??
          guest?.phoneMasked ??
          guest?.emailMasked ??
          phone.masked,
        displayName:
          existingProfile?.displayName ??
          guest?.fullNameMasked ??
          guest?.externalGuestId ??
          'Гость клуба',
        ...gameProfileConsentGrantData(TELEGRAM_AUTH_CONSENT_SOURCE, now),
        ...staffTestData,
        status: 'ACTIVE',
        lastActivityAt: now,
      };
      const profile =
        existingProfile && existingProfile.id !== challenge.profileId
          ? await tx.guestGameProfile.update({
              where: { id: existingProfile.id },
              data: {
                ...commonData,
                ...(guest && !existingProfile.guestId
                  ? { guestId: guest.id }
                  : {}),
              },
              select: { id: true, guestId: true },
            })
          : await tx.guestGameProfile.update({
              where: { id: challenge.profileId },
              data: {
                ...commonData,
                ...(guest ? { guestId: guest.id } : {}),
              },
              select: { id: true, guestId: true },
            });

      if (existingProfile && existingProfile.id !== challenge.profileId) {
        await tx.guestGameProfile.update({
          where: { id: challenge.profileId },
          data: {
            status: TELEGRAM_AUTH_MERGED_PROFILE_STATUS,
            phoneHash: phone.hash,
            phoneEncrypted: this.encryptPhone(phone),
            contactMasked: phone.masked,
            ...staffTestData,
            lastActivityAt: now,
          },
        });
      }

      await tx.guestGameTelegramLinkChallenge.update({
        where: { id: challenge.id },
        data: {
          status: TELEGRAM_AUTH_VERIFIED_STATUS,
          consumedAt: now,
          guestId: profile.guestId ?? guest?.id ?? null,
          profileId: profile.id,
          phoneHash: phone.hash,
          telegramChatIdMasked: maskTelegramChatId(update.telegramChatId),
          telegramUsername: telegramUsername(update.telegramUsername),
        },
      });
      await tx.guestGameEvent.create({
        data: {
          tenantId: challenge.tenantId,
          profileId: profile.id,
          guestId: profile.guestId ?? guest?.id ?? null,
          eventType: GAME_CONSENT_EVENT_TYPE,
          source: 'GUEST_PORTAL',
          externalId: `telegram-auth:${challenge.id}:game-consent`,
          occurredAt: now,
          payload: {
            consentVersion: GAME_CONSENT_VERSION,
            storeId: challenge.storeId,
            phoneMasked: phone.masked,
            telegramIdentityMasked,
            acceptedAt: now.toISOString(),
          },
          note: `${TELEGRAM_AUTH_EVENT_PREFIX}contact_share_confirmed`,
          createdAt: now,
        },
      });

      return {
        profileId: profile.id,
        guestId: profile.guestId ?? guest?.id ?? null,
      };
    });

    try {
      const context = await this.getTenantStoreByIds(
        challenge.tenantId,
        challenge.storeId,
      );
      await this.matchLangamePhoneForPortal(
        {
          sub: `telegram-auth:${challenge.id}`,
          purpose: GUEST_PORTAL_PURPOSE,
          tenantId: challenge.tenantId,
          storeId: challenge.storeId,
          guestId: result.guestId,
          profileId: result.profileId,
          phoneHash: phone.hash,
        },
        context,
        phone,
        'guest_portal_telegram_auth',
      );
    } catch {
      // Langame auto-match should not block a verified Telegram login.
    }

    return {
      status: 'CONFIRMED',
      action: 'TELEGRAM_AUTH_CONTACT',
      profileId: result.profileId,
      telegramIdentityMasked,
      message:
        'Telegram contact подтвердил телефон. Гостевой игровой профиль готов к выдаче browser session.',
      reply: this.telegramWebhookPostAuthChoiceReply(
        telegramIdentityMasked,
        'Готово: телефон подтвержден. Вернитесь на сайт LeetPlus, чтобы продолжить там, или выберите Mini App/бот как отдельный игровой интерфейс.',
      ),
    };
  }

  private telegramWebhookContactRequestReply(
    chatIdMasked: string | null,
    text = 'Нажмите кнопку ниже и поделитесь телефоном Telegram. LeetPlus примет только номер этого аккаунта.',
  ): GuestPortalTelegramWebhookResponse['reply'] {
    return {
      provider: 'TELEGRAM',
      method: 'sendMessage',
      chatIdMasked,
      text,
      replyMarkup: {
        keyboard: [
          [
            {
              text: 'Поделиться телефоном',
              request_contact: true,
            },
          ],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    };
  }

  private telegramWebhookRemoveKeyboardReply(
    chatIdMasked: string | null,
    text: string,
  ): GuestPortalTelegramWebhookResponse['reply'] {
    return {
      provider: 'TELEGRAM',
      method: 'sendMessage',
      chatIdMasked,
      text,
      replyMarkup: {
        remove_keyboard: true,
      },
    };
  }

  private telegramWebhookPostAuthChoiceReply(
    chatIdMasked: string | null,
    text: string,
  ): GuestPortalTelegramWebhookResponse['reply'] {
    const miniAppUrl = this.telegramMiniAppUrl();
    const webReturnUrl = `${this.publicWebUrl().replace(/\/$/, '')}/game/clubs`;
    const botUsername = this.telegramBotUsername();
    const botUrl = botUsername ? `https://t.me/${botUsername}` : undefined;
    const inlineKeyboard: NonNullable<
      GuestPortalTelegramWebhookResponse['reply']
    >['replyMarkup'] = {
      inline_keyboard: [
        [
          {
            text: 'Вернуться на сайт LeetPlus',
            url: webReturnUrl,
          },
        ],
        [
          {
            text: 'Открыть Mini App',
            web_app: {
              url: miniAppUrl,
            },
          },
        ],
        ...(botUrl
          ? [
              [
                {
                  text: 'Продолжить в боте',
                  callback_data: 'bot:menu',
                },
              ],
            ]
          : []),
      ],
    };

    return {
      provider: 'TELEGRAM',
      method: 'sendMessage',
      chatIdMasked,
      text,
      replyMarkup: inlineKeyboard,
    };
  }

  private async buildTelegramBotCommandResponse(
    command: TelegramBotCommand,
    telegramChatIdValue: string,
    telegramIdentityMasked: string | null,
  ): Promise<GuestPortalTelegramWebhookResponse> {
    const action = telegramBotAction(command);

    if (command === 'HELP') {
      return {
        status: 'IGNORED',
        action: 'TELEGRAM_BOT_HELP',
        profileId: null,
        telegramIdentityMasked,
        message:
          'Telegram bot help command processed without exposing guest identifiers.',
        reply: this.telegramWebhookBotMenuReply(
          telegramIdentityMasked,
          [
            'LeetPlus bot: здесь можно продолжить игру после Telegram-входа.',
            'Доступные действия: профиль, квесты, награды, выбор клуба, Mini App, сайт и отписка от уведомлений.',
            'Для входа заново выберите клуб на сайте и нажмите "Войти через Telegram".',
          ].join('\n'),
        ),
      };
    }

    if (command === 'CLUBS') {
      return this.buildTelegramBotClubListResponse(
        telegramChatIdValue,
        telegramIdentityMasked,
      );
    }

    const telegramIdentity = `chat:${telegramChatIdValue}`;
    const profile = await this.prisma.guestGameProfile.findFirst({
      where: {
        telegramIdentity,
        status: { not: 'ARCHIVED' },
      },
      orderBy: [{ lastActivityAt: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        tenantId: true,
        guestId: true,
        phoneHash: true,
        contactMasked: true,
        phoneConsentStatus: true,
        phoneConsentAt: true,
        xp: true,
        level: true,
        status: true,
        unsubscribedAt: true,
      },
    });

    if (!profile) {
      return {
        status: 'IGNORED',
        action,
        profileId: null,
        telegramIdentityMasked,
        message:
          'Telegram bot menu command received for an unlinked Telegram chat.',
        reply: this.telegramWebhookBotMenuReply(
          telegramIdentityMasked,
          [
            'LeetPlus bot подключен.',
            'Клуб: выберите клуб на сайте LeetPlus.',
            'Профиль: этот Telegram еще не связан с игровым профилем.',
            'Откройте сайт, выберите клуб и нажмите "Войти через Telegram".',
          ].join('\n'),
        ),
      };
    }

    if (profile.status === TELEGRAM_AUTH_PROFILE_STATUS) {
      return {
        status: 'AWAITING_CONTACT',
        action,
        profileId: profile.id,
        telegramIdentityMasked,
        message:
          'Telegram bot menu command received while auth is waiting for contact-share.',
        reply: this.telegramWebhookContactRequestReply(
          telegramIdentityMasked,
          'Вход почти готов. Поделитесь телефоном кнопкой Telegram, чтобы LeetPlus подтвердил профиль.',
        ),
      };
    }

    const club = await this.findTelegramBotLatestClub(profile.id);
    const xp = Math.max(0, profile.xp ?? 0);
    const level = Math.max(1, profile.level ?? levelFromXp(xp));
    let portal: GuestPortalPayload | null = null;

    if (club && profile.phoneHash) {
      try {
        portal = await this.buildPortalPayload(
          {
            sub: `telegram-bot:${profile.id}:${club.storeId}`,
            purpose: GUEST_PORTAL_PURPOSE,
            tenantId: profile.tenantId,
            storeId: club.storeId,
            guestId: profile.guestId,
            profileId: profile.id,
            phoneHash: profile.phoneHash,
          },
          { refreshLiveBalances: true },
        );
      } catch {
        portal = null;
      }
    }

    const mission =
      portal || !club
        ? null
        : await this.findTelegramBotNearestMission(
            profile.tenantId,
            club.storeId,
          );
    const replyText = portal
      ? telegramBotReplyText(command, portal, profile.unsubscribedAt)
      : telegramBotFallbackReplyText(command, {
          clubName: club?.name ?? null,
          contactMasked: profile.contactMasked,
          level,
          mission,
          phoneConsentAt: profile.phoneConsentAt,
          phoneConsentStatus: profile.phoneConsentStatus,
          unsubscribedAt: profile.unsubscribedAt,
          xp,
        });
    const showCheckIn = portal ? telegramBotCheckInAvailable(portal) : false;

    return {
      status: 'CONFIRMED',
      action,
      profileId: profile.id,
      telegramIdentityMasked,
      message: 'Telegram bot menu command processed.',
      reply: this.telegramWebhookBotMenuReply(
        telegramIdentityMasked,
        replyText,
        telegramBotMiniAppTab(command),
        { showCheckIn },
      ),
    };
  }

  private async buildTelegramBotClubListResponse(
    telegramChatIdValue: string,
    telegramIdentityMasked: string | null,
  ): Promise<GuestPortalTelegramWebhookResponse> {
    const telegramIdentity = `chat:${telegramChatIdValue}`;
    const candidates = await this.findTelegramMiniAppClubs(telegramIdentity);
    const cityGroups = telegramBotCityGroups(candidates);

    return {
      status: candidates.length ? 'CONFIRMED' : 'IGNORED',
      action: 'TELEGRAM_BOT_CITIES',
      profileId: candidates[0]?.profile.id ?? null,
      telegramIdentityMasked,
      message: candidates.length
        ? 'Telegram bot city selection returned safe choices.'
        : 'Telegram bot club selection has no linked game clubs.',
      reply: this.telegramWebhookBotCitySelectionReply(
        telegramIdentityMasked,
        telegramBotCitySelectionText(cityGroups),
        cityGroups,
      ),
    };
  }

  private async buildTelegramBotCityClubListResponse(
    cityCallbackToken: string,
    telegramChatIdValue: string,
    telegramIdentityMasked: string | null,
  ): Promise<GuestPortalTelegramWebhookResponse> {
    const telegramIdentity = `chat:${telegramChatIdValue}`;
    const candidates = await this.findTelegramMiniAppClubs(telegramIdentity);
    const cityGroups = telegramBotCityGroups(candidates);
    const selectedGroup =
      cityGroups.find(
        (group) =>
          this.telegramBotCityCallbackTokenForGroup(group) ===
          cityCallbackToken,
      ) ?? null;

    if (!selectedGroup) {
      return {
        status: candidates.length ? 'CONFIRMED' : 'IGNORED',
        action: 'TELEGRAM_BOT_CITIES',
        profileId: candidates[0]?.profile.id ?? null,
        telegramIdentityMasked,
        message:
          'Telegram bot city callback was not found in safe linked choices.',
        reply: this.telegramWebhookBotCitySelectionReply(
          telegramIdentityMasked,
          [
            'Список городов обновился.',
            'Выберите город заново кнопками ниже.',
          ].join('\n'),
          cityGroups,
        ),
      };
    }

    return {
      status: 'CONFIRMED',
      action: 'TELEGRAM_BOT_CITY_CLUBS',
      profileId: selectedGroup.candidates[0]?.profile.id ?? null,
      telegramIdentityMasked,
      message: 'Telegram bot city selected without exposing raw identifiers.',
      reply: this.telegramWebhookBotClubSelectionReply(
        telegramIdentityMasked,
        telegramBotClubSelectionText(
          selectedGroup.candidates,
          selectedGroup.city,
        ),
        selectedGroup.candidates,
        { showBackToCities: cityGroups.length > 1 },
      ),
    };
  }

  private async buildTelegramBotClubSelectResponse(
    clubCallbackToken: string,
    telegramChatIdValue: string,
    telegramIdentityMasked: string | null,
  ): Promise<GuestPortalTelegramWebhookResponse> {
    const telegramIdentity = `chat:${telegramChatIdValue}`;
    const candidates = await this.findTelegramMiniAppClubs(telegramIdentity);
    const cityGroups = telegramBotCityGroups(candidates);
    const selectedCandidate =
      candidates.find(
        (candidate) =>
          this.telegramBotClubCallbackTokenForCandidate(candidate) ===
          clubCallbackToken,
      ) ?? null;

    if (!selectedCandidate) {
      return {
        status: candidates.length ? 'CONFIRMED' : 'IGNORED',
        action: 'TELEGRAM_BOT_CITIES',
        profileId: candidates[0]?.profile.id ?? null,
        telegramIdentityMasked,
        message:
          'Telegram bot club callback was not found in safe linked choices.',
        reply: this.telegramWebhookBotCitySelectionReply(
          telegramIdentityMasked,
          [
            'Список клубов обновился.',
            'Выберите город заново кнопками ниже.',
          ].join('\n'),
          cityGroups,
        ),
      };
    }

    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.guestGameProfile.update({
        where: { id: selectedCandidate.profile.id },
        data: { lastActivityAt: now },
      }),
      ...(selectedCandidate.telegramLinkChallengeId
        ? [
            this.prisma.guestGameTelegramLinkChallenge.update({
              where: { id: selectedCandidate.telegramLinkChallengeId },
              data: { updatedAt: now },
            }),
          ]
        : []),
    ]);

    const portal = await this.buildPortalPayload(
      {
        sub: `telegram-bot:${selectedCandidate.profile.id}:${selectedCandidate.store.id}`,
        purpose: GUEST_PORTAL_PURPOSE,
        tenantId: selectedCandidate.tenant.id,
        storeId: selectedCandidate.store.id,
        guestId: selectedCandidate.profile.guestId,
        profileId: selectedCandidate.profile.id,
        phoneHash: selectedCandidate.profile.phoneHash,
      },
      { refreshLiveBalances: true },
    );
    const replyText = [
      `Клуб выбран: ${selectedCandidate.store.name}.`,
      telegramBotReplyText(
        'MENU',
        portal,
        selectedCandidate.profile.unsubscribedAt,
      ),
    ].join('\n');

    return {
      status: 'CONFIRMED',
      action: 'TELEGRAM_BOT_CLUB_SELECTED',
      profileId: selectedCandidate.profile.id,
      telegramIdentityMasked,
      message: 'Telegram bot club selected without exposing raw identifiers.',
      reply: this.telegramWebhookBotMenuReply(
        telegramIdentityMasked,
        replyText,
        undefined,
        { showCheckIn: telegramBotCheckInAvailable(portal) },
      ),
    };
  }

  private async findTelegramBotLatestClub(profileId: string): Promise<{
    storeId: string;
    name: string;
  } | null> {
    const link = await this.prisma.guestGameTelegramLinkChallenge.findFirst({
      where: {
        profileId,
        status: {
          in: [
            TELEGRAM_AUTH_VERIFIED_STATUS,
            TELEGRAM_AUTH_SESSION_ISSUED_STATUS,
            'CONSUMED',
          ],
        },
      },
      orderBy: [
        { consumedAt: 'desc' },
        { updatedAt: 'desc' },
        { createdAt: 'desc' },
      ],
      select: {
        storeId: true,
        store: {
          select: {
            name: true,
          },
        },
      },
    });
    const storeName = link?.store?.name?.trim();

    return link && storeName
      ? {
          storeId: link.storeId,
          name: storeName,
        }
      : null;
  }

  private async findTelegramBotNearestMission(
    tenantId: string,
    storeId: string,
  ): Promise<{
    name: string;
    xpReward: number;
    progressTarget: number | null;
    progressUnit: string | null;
  } | null> {
    const missions = await this.prisma.guestGameMission.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
      },
      orderBy: [{ periodTo: 'asc' }, { updatedAt: 'desc' }],
      select: {
        name: true,
        xpReward: true,
        progressTarget: true,
        progressUnit: true,
        storeIds: true,
        periodFrom: true,
        periodTo: true,
      },
      take: 12,
    });
    const activeMissions = missions
      .filter((mission) => matchesStore(mission.storeIds, storeId))
      .filter((mission) => activePeriod(mission.periodFrom, mission.periodTo))
      .sort((left, right) => {
        const leftTime = left.periodTo?.getTime() ?? Number.POSITIVE_INFINITY;
        const rightTime = right.periodTo?.getTime() ?? Number.POSITIVE_INFINITY;

        return leftTime - rightTime || right.xpReward - left.xpReward;
      });
    const mission = activeMissions[0] ?? null;

    return mission
      ? {
          name: mission.name,
          xpReward: mission.xpReward,
          progressTarget: mission.progressTarget,
          progressUnit: mission.progressUnit,
        }
      : null;
  }

  private telegramWebhookBotMenuReply(
    chatIdMasked: string | null,
    text: string,
    miniAppTab?: TelegramMiniAppTab,
    options: { showCheckIn?: boolean } = {},
  ): GuestPortalTelegramWebhookResponse['reply'] {
    const checkInRow = options.showCheckIn
      ? [
          [
            {
              text: 'Чекин',
              callback_data: 'bot:checkin',
            },
          ],
        ]
      : [];

    return {
      provider: 'TELEGRAM',
      method: 'sendMessage',
      chatIdMasked,
      text,
      replyMarkup: {
        inline_keyboard: [
          [
            {
              text: 'Профиль',
              callback_data: 'bot:profile',
            },
            {
              text: 'Квесты',
              callback_data: 'bot:quests',
            },
          ],
          [
            {
              text: 'Награды',
              callback_data: 'bot:rewards',
            },
            {
              text: 'Меню',
              callback_data: 'bot:menu',
            },
          ],
          ...checkInRow,
          [
            {
              text: 'Выбрать клуб',
              callback_data: 'bot:clubs',
            },
          ],
          [
            {
              text: 'Открыть Mini App',
              web_app: {
                url: this.telegramMiniAppUrl(miniAppTab),
              },
            },
          ],
          [
            {
              text: 'Вернуться на сайт LeetPlus',
              url: `${this.publicWebUrl().replace(/\/$/, '')}/game/clubs`,
            },
          ],
          [
            {
              text: 'Помощь',
              callback_data: '/help',
            },
            {
              text: 'Отписаться',
              callback_data: '/stop',
            },
          ],
        ],
      },
    };
  }

  private telegramWebhookBotCitySelectionReply(
    chatIdMasked: string | null,
    text: string,
    cityGroups: TelegramBotCityGroup[],
  ): GuestPortalTelegramWebhookResponse['reply'] {
    const visibleGroups = cityGroups.slice(0, 8);

    return {
      provider: 'TELEGRAM',
      method: 'sendMessage',
      chatIdMasked,
      text,
      replyMarkup: {
        inline_keyboard: [
          ...visibleGroups.map((group) => [
            {
              text: telegramBotCityChoiceLabel(group),
              callback_data: `bot:city:${this.telegramBotCityCallbackTokenForGroup(
                group,
              )}`,
            },
          ]),
          [
            {
              text: 'Меню',
              callback_data: 'bot:menu',
            },
          ],
          [
            {
              text: 'Открыть Mini App',
              web_app: {
                url: this.telegramMiniAppUrl(),
              },
            },
          ],
          [
            {
              text: 'Вернуться на сайт LeetPlus',
              url: `${this.publicWebUrl().replace(/\/$/, '')}/game/clubs`,
            },
          ],
        ],
      },
    };
  }

  private telegramWebhookBotClubSelectionReply(
    chatIdMasked: string | null,
    text: string,
    candidates: TelegramMiniAppClubCandidate[],
    options: { showBackToCities?: boolean } = {},
  ): GuestPortalTelegramWebhookResponse['reply'] {
    const visibleCandidates = candidates.slice(0, 8);
    const backRows = options.showBackToCities
      ? [
          [
            {
              text: 'Назад к городам',
              callback_data: 'bot:clubs',
            },
          ],
        ]
      : [];

    return {
      provider: 'TELEGRAM',
      method: 'sendMessage',
      chatIdMasked,
      text,
      replyMarkup: {
        inline_keyboard: [
          ...visibleCandidates.map((candidate) => [
            {
              text: telegramBotClubChoiceLabel(candidate),
              callback_data: `bot:club:${this.telegramBotClubCallbackTokenForCandidate(
                candidate,
              )}`,
            },
          ]),
          ...backRows,
          [
            {
              text: 'Меню',
              callback_data: 'bot:menu',
            },
          ],
          [
            {
              text: 'Открыть Mini App',
              web_app: {
                url: this.telegramMiniAppUrl(),
              },
            },
          ],
          [
            {
              text: 'Вернуться на сайт LeetPlus',
              url: `${this.publicWebUrl().replace(/\/$/, '')}/game/clubs`,
            },
          ],
        ],
      },
    };
  }

  private telegramBotClubCallbackTokenForCandidate(
    candidate: TelegramMiniAppClubCandidate,
  ) {
    return createHmac('sha256', this.referralSecret())
      .update(
        [
          'telegram-bot-club',
          candidate.profile.id,
          candidate.tenant.id,
          candidate.store.id,
        ].join(':'),
      )
      .digest('base64url')
      .slice(0, 18);
  }

  private telegramBotCityCallbackTokenForGroup(group: TelegramBotCityGroup) {
    return createHmac('sha256', this.referralSecret())
      .update(
        [
          'telegram-bot-city',
          group.city,
          ...group.candidates
            .map(
              (candidate) =>
                `${candidate.profile.id}:${candidate.tenant.id}:${candidate.store.id}`,
            )
            .sort(),
        ].join(':'),
      )
      .digest('base64url')
      .slice(0, 18);
  }

  private async dispatchTelegramWebhookReply(
    response: GuestPortalTelegramWebhookResponse,
    telegramChatId: string,
  ): Promise<GuestPortalTelegramWebhookResponse> {
    if (!response.reply) {
      return response;
    }

    const chatIdMasked = response.reply.chatIdMasked;

    if (
      !configFlag(
        this.configService,
        'GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_ENABLED',
      )
    ) {
      return {
        ...response,
        replyDispatch: {
          provider: 'TELEGRAM',
          status: 'DISABLED',
          chatIdMasked,
          message:
            'Telegram webhook reply sender is disabled. An external adapter can still use the reply payload.',
          requiredEnv: ['GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_ENABLED'],
        },
      };
    }

    const token = configString(
      this.configService,
      'GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_BOT_TOKEN',
      'GUEST_GAME_TELEGRAM_BOT_TOKEN',
      'TELEGRAM_BOT_TOKEN',
    );

    if (!token) {
      return {
        ...response,
        replyDispatch: {
          provider: 'TELEGRAM',
          status: 'SKIPPED',
          chatIdMasked,
          message:
            'Telegram webhook reply sender is enabled, but bot token is not configured.',
          requiredEnv: [
            'GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_BOT_TOKEN or GUEST_GAME_TELEGRAM_BOT_TOKEN',
          ],
        },
      };
    }

    try {
      await sendTelegramWebhookReply({
        token,
        chatId: telegramChatId,
        text: response.reply.text,
        replyMarkup: response.reply.replyMarkup,
      });

      const responseWithoutReply = { ...response };
      delete responseWithoutReply.reply;

      return {
        ...responseWithoutReply,
        replyDispatch: {
          provider: 'TELEGRAM',
          status: 'SENT',
          chatIdMasked,
          message: 'Telegram webhook reply was sent by LeetPlus API.',
        },
      };
    } catch (error) {
      return {
        ...response,
        replyDispatch: {
          provider: 'TELEGRAM',
          status: 'FAILED',
          chatIdMasked,
          message:
            'Telegram webhook reply sender failed after processing the auth state.',
          error: safeDeliveryErrorMessage(error),
        },
      };
    }
  }

  private async unsubscribeTelegramWebhookProfile(
    telegramChatIdValue: string,
    telegramIdentityMasked: string | null,
  ): Promise<GuestPortalTelegramWebhookResponse> {
    const telegramIdentity = `chat:${telegramChatIdValue}`;
    const profiles = await this.prisma.guestGameProfile.findMany({
      where: {
        telegramIdentity,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        tenantId: true,
        guestId: true,
        leadId: true,
      },
    });

    if (profiles.length === 0) {
      return {
        status: 'IGNORED',
        action: 'UNSUBSCRIBE',
        profileId: null,
        profilesAffected: 0,
        deliveriesBlocked: 0,
        telegramIdentityMasked,
        message:
          'Telegram unsubscribe command received, but no active LeetPlus guest profile is linked to this chat_id.',
      };
    }

    const now = new Date();
    const profileIds = uniqueStrings(profiles.map((profile) => profile.id));
    const guestIds = uniqueStrings(profiles.map((profile) => profile.guestId));
    const leadIds = uniqueStrings(profiles.map((profile) => profile.leadId));
    const preferenceNote = `${COMMUNICATION_PREFERENCE_EVENT_PREFIX}UNSUBSCRIBE: Telegram bot stop command.`;
    const deliveryNote =
      'Guest unsubscribed from Telegram bot through webhook stop command.';

    const result = await this.prisma.$transaction(async (tx) => {
      if (guestIds.length > 0) {
        await tx.guest.updateMany({
          where: { id: { in: guestIds } },
          data: {
            phoneConsentStatus: GuestCommunicationConsentStatus.UNSUBSCRIBED,
            phoneConsentSource: 'telegram_bot',
            phoneConsentAt: null,
            unsubscribedAt: now,
            crmStatus: GuestCrmStatus.DO_NOT_CONTACT,
            crmUpdatedAt: now,
          },
        });
        await tx.guestCrmEvent.createMany({
          data: guestIds.map((guestId) => ({
            tenantId:
              profiles.find((profile) => profile.guestId === guestId)
                ?.tenantId ?? profiles[0].tenantId,
            guestId,
            status: GuestCrmStatus.DO_NOT_CONTACT,
            note: preferenceNote,
            createdAt: now,
          })),
        });
      }

      if (leadIds.length > 0) {
        await tx.guestCrmLead.updateMany({
          where: { id: { in: leadIds } },
          data: {
            phoneConsentStatus: GuestCommunicationConsentStatus.UNSUBSCRIBED,
            phoneConsentSource: 'telegram_bot',
            phoneConsentAt: null,
            unsubscribedAt: now,
            crmStatus: GuestCrmStatus.DO_NOT_CONTACT,
          },
        });
      }

      const pendingDeliveries = await tx.guestGameDelivery.findMany({
        where: {
          profileId: { in: profileIds },
          channel: 'TELEGRAM',
          status: 'READY',
          readinessStatus: 'READY_FOR_BOT',
        },
        select: {
          id: true,
          tenantId: true,
          rewardId: true,
          status: true,
        },
      });

      if (pendingDeliveries.length > 0) {
        await tx.guestGameDelivery.updateMany({
          where: {
            id: { in: pendingDeliveries.map((delivery) => delivery.id) },
          },
          data: {
            status: 'BLOCKED',
            readinessStatus: 'UNSUBSCRIBED',
            blockers: [
              'Guest unsubscribed from Telegram bot.',
            ] satisfies Prisma.InputJsonValue,
            note: deliveryNote,
          },
        });
        await tx.guestGameDeliveryEvent.createMany({
          data: pendingDeliveries.map((delivery) => ({
            tenantId: delivery.tenantId,
            deliveryId: delivery.id,
            rewardId: delivery.rewardId,
            eventType: 'DELIVERY_UNSUBSCRIBED',
            fromStatus: delivery.status,
            toStatus: 'BLOCKED',
            channel: 'TELEGRAM',
            note: deliveryNote,
            payload: {
              source: 'telegram_webhook',
              readinessStatus: 'UNSUBSCRIBED',
            } satisfies Prisma.InputJsonValue,
            createdAt: now,
          })),
        });
      }

      return { deliveriesBlocked: pendingDeliveries.length };
    });

    return {
      status: 'UNSUBSCRIBED',
      action: 'UNSUBSCRIBE',
      profileId: profiles.length === 1 ? profiles[0].id : null,
      profilesAffected: profiles.length,
      deliveriesBlocked: result.deliveriesBlocked,
      telegramIdentityMasked,
      message:
        'Telegram unsubscribe command processed. Guest communication consent is now UNSUBSCRIBED and pending Telegram deliveries are blocked.',
    };
  }

  async matchLangameGuest(
    authorization: string | undefined,
    dto: { phone?: unknown },
  ): Promise<GuestPortalLangameMatchResponse> {
    const payload = await this.verifyGuestToken(authorization);
    const context = await this.getTenantStoreByIds(
      payload.tenantId,
      payload.storeId,
    );
    const phone = this.phoneIdentity(dto.phone);

    if (phone.hash !== payload.phoneHash) {
      throw new BadRequestException(
        'Телефон не совпадает с подтвержденной гостевой сессией.',
      );
    }

    return this.matchLangamePhoneForPortal(
      payload,
      context,
      phone,
      'guest_portal_langame_match',
    );
  }

  private async matchLangamePhoneForPortal(
    payload: GuestPortalTokenPayload,
    context: TenantStoreContext,
    phone: GuestPortalPhoneIdentity,
    source: string,
  ): Promise<GuestPortalLangameMatchResponse> {
    const [localGuest, localProfile] = await Promise.all([
      this.findGuest(payload),
      this.findProfile(payload, payload.guestId),
    ]);

    if (localGuest) {
      const checkedAt = new Date().toISOString();
      const linkResult = await this.linkGameProfileToLocalGuest(
        payload,
        localProfile?.id ?? payload.profileId,
        localGuest.id,
        phone.masked,
        source,
      );
      const localGuestFound = true;
      const status: GuestPortalLangameMatchResponse['status'] = 'MATCHED_LOCAL';
      const portal =
        (linkResult.linkedNow || linkResult.status === 'ALREADY_LINKED') &&
        linkResult.guestId
          ? await this.buildPortalPayload({
              ...payload,
              guestId: linkResult.guestId,
              profileId: linkResult.profileId ?? payload.profileId,
            })
          : null;

      await this.recordLangameAutoMatchEvent({
        payload,
        context,
        phoneMasked: phone.masked,
        status,
        linkResult,
        sources: [],
        source,
        checkedAt,
      });

      return {
        checkedAt,
        queryField: 'phone',
        phoneMasked: phone.masked,
        status,
        localGuestFound,
        localGuestId: linkResult.guestId ?? localGuest.id,
        profileId:
          linkResult.profileId ?? localProfile?.id ?? payload.profileId,
        linkStatus: linkResult.status,
        linkedGuestId: linkResult.guestId,
        linkedProfileId: linkResult.profileId,
        backfilled: linkResult.backfilled,
        nextAction: guestPortalLangameMatchNextAction(
          status,
          linkResult.status,
        ),
        portal,
        sources: [],
      };
    }

    const cachedEvent = await this.findLangameAutoMatchEvent(payload);
    const cachedResponse = cachedEvent
      ? await this.buildLangameMatchResponseFromAutoMatchEvent(
          cachedEvent,
          payload,
          phone.masked,
        )
      : null;

    if (cachedResponse) {
      return cachedResponse;
    }

    const diagnostics =
      await this.langameSettingsService.searchGuestByPhoneForPortal(
        payload.tenantId,
        phone.normalized,
        this.langamePortalSearchScope(context),
      );
    const externalPairs = diagnostics.sources.flatMap((source) =>
      source.results
        .filter((result) => result.externalGuestId)
        .map((result) => ({
          domain: source.domain,
          externalGuestId: result.externalGuestId as string,
        })),
    );
    const localGuestsByExternalId =
      externalPairs.length > 0
        ? await this.prisma.guest.findMany({
            where: {
              tenantId: payload.tenantId,
              externalProvider: IntegrationProvider.LANGAME,
              OR: externalPairs.map((pair) => ({
                externalDomain: pair.domain,
                externalGuestId: pair.externalGuestId,
              })),
            },
            select: {
              id: true,
              externalDomain: true,
              externalGuestId: true,
            },
          })
        : [];
    const localGuestMap = new Map(
      localGuestsByExternalId.map((guest) => [
        externalGuestKey(guest.externalDomain, guest.externalGuestId),
        guest.id,
      ]),
    );
    const sources = diagnostics.sources.map((source) => ({
      id: source.id,
      name: source.name,
      domain: source.domain,
      status: source.status,
      resultsCount: source.resultsCount,
      errorMessage: source.errorMessage,
      results: source.results.map((result) => {
        const mappedGuestId = result.externalGuestId
          ? (localGuestMap.get(
              externalGuestKey(source.domain, result.externalGuestId),
            ) ?? null)
          : null;

        return {
          ...result,
          localGuestKnown: Boolean(mappedGuestId),
          localGuestId: mappedGuestId,
        };
      }),
    }));
    const firstMappedGuestId =
      sources
        .flatMap((source) => source.results)
        .find((result) => result.localGuestId)?.localGuestId ?? null;
    const localGuestId = firstMappedGuestId;
    const localGuestFound = Boolean(localGuestId);
    const foundInLangame = sources.some((source) => source.resultsCount > 0);
    const anySuccess = sources.some((source) => source.status === 'SUCCESS');
    const status: GuestPortalLangameMatchResponse['status'] = localGuestFound
      ? 'MATCHED_LOCAL'
      : foundInLangame
        ? 'FOUND_IN_LANGAME'
        : anySuccess
          ? 'NOT_FOUND'
          : 'FAILED';
    const linkResult = localGuestId
      ? await this.linkGameProfileToLocalGuest(
          payload,
          localProfile?.id ?? payload.profileId,
          localGuestId,
          phone.masked,
          source,
        )
      : ({
          status: foundInLangame ? 'WAITING_FOR_SYNC' : 'NOT_LINKED',
          guestId: null,
          profileId: localProfile?.id ?? payload.profileId,
          linkedNow: false,
          backfilled: emptyGameProfileBackfillSummary(),
        } satisfies GuestPortalGameProfileLinkResult);
    const refreshedPayload =
      linkResult.linkedNow || linkResult.status === 'ALREADY_LINKED'
        ? await this.buildPortalPayload({
            ...payload,
            guestId: linkResult.guestId,
            profileId: linkResult.profileId ?? payload.profileId,
          })
        : null;

    await this.recordLangameAutoMatchEvent({
      payload,
      context,
      phoneMasked: phone.masked,
      status,
      linkResult,
      sources,
      source,
      checkedAt: diagnostics.checkedAt,
    });

    return {
      checkedAt: diagnostics.checkedAt,
      queryField: 'phone',
      phoneMasked: phone.masked,
      status,
      localGuestFound,
      localGuestId,
      profileId: linkResult.profileId ?? localProfile?.id ?? payload.profileId,
      linkStatus: linkResult.status,
      linkedGuestId: linkResult.guestId,
      linkedProfileId: linkResult.profileId,
      backfilled: linkResult.backfilled,
      nextAction: guestPortalLangameMatchNextAction(status, linkResult.status),
      portal: refreshedPayload,
      sources,
    };
  }

  private langamePortalSearchScope(context: TenantStoreContext) {
    return {
      sourceId: context.store.integrationSourceId,
      sourceDomain: context.store.externalDomain,
    };
  }

  private langameAutoMatchExternalId(payload: GuestPortalTokenPayload) {
    if (!payload.profileId) {
      return null;
    }

    return `game-profile-langame-auto-match:${payload.profileId}:${payload.storeId}`;
  }

  private langameAutoMatchExternalDomain(context: TenantStoreContext) {
    return (
      context.store.externalDomain ??
      context.store.integrationSourceId ??
      `store:${context.store.id}`
    );
  }

  private async findLangameAutoMatchEvent(payload: GuestPortalTokenPayload) {
    const externalId = this.langameAutoMatchExternalId(payload);

    if (!payload.profileId || !externalId) {
      return null;
    }

    return this.prisma.guestGameEvent.findFirst({
      where: {
        tenantId: payload.tenantId,
        profileId: payload.profileId,
        eventType: GAME_PROFILE_LANGAME_AUTO_MATCH_EVENT_TYPE,
        source: GAME_PROFILE_LANGAME_AUTO_MATCH_SOURCE,
        externalId,
      },
      orderBy: { occurredAt: 'desc' },
      select: {
        id: true,
        profileId: true,
        guestId: true,
        occurredAt: true,
        payload: true,
      },
    });
  }

  private async recordLangameAutoMatchEvent(input: {
    payload: GuestPortalTokenPayload;
    context: TenantStoreContext;
    phoneMasked: string | null;
    status: GuestPortalLangameMatchResponse['status'];
    linkResult: GuestPortalGameProfileLinkResult;
    sources: GuestPortalLangameMatchResponse['sources'];
    source: string;
    checkedAt: string;
  }) {
    const profileId = input.linkResult.profileId ?? input.payload.profileId;
    const externalId = this.langameAutoMatchExternalId({
      ...input.payload,
      profileId,
    });

    if (!profileId || !externalId) {
      return;
    }

    const occurredAt = new Date(input.checkedAt);
    const eventPayload = {
      checkedAt: input.checkedAt,
      source: input.source,
      storeId: input.context.store.id,
      storePublicSlug: input.context.store.publicSlug,
      sourceId: input.context.store.integrationSourceId,
      sourceDomain: input.context.store.externalDomain,
      phoneMasked: input.phoneMasked,
      matchStatus: input.status,
      localStatus: langameMatchStatusToLocalStatus(input.status),
      localGuestFound: Boolean(input.linkResult.guestId),
      localGuestId: input.linkResult.guestId,
      profileId,
      linkStatus: input.linkResult.status,
      linkedGuestId: input.linkResult.guestId,
      linkedProfileId: input.linkResult.profileId,
      backfilled: input.linkResult.backfilled,
      sources: input.sources,
    } satisfies Prisma.InputJsonObject;

    await this.prisma.guestGameEvent.createMany({
      data: [
        {
          tenantId: input.payload.tenantId,
          profileId,
          guestId: input.linkResult.guestId,
          eventType: GAME_PROFILE_LANGAME_AUTO_MATCH_EVENT_TYPE,
          source: GAME_PROFILE_LANGAME_AUTO_MATCH_SOURCE,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: this.langameAutoMatchExternalDomain(input.context),
          externalId,
          occurredAt,
          payload: eventPayload,
          note: 'Одноразовая клубная автосверка игрового профиля с Langame по подтвержденному телефону.',
          createdAt: occurredAt,
        },
      ],
      skipDuplicates: true,
    });
  }

  private buildLocalMatchFromAutoMatchEvent(
    event: {
      profileId: string | null;
      guestId: string | null;
      occurredAt: Date;
      payload: Prisma.JsonValue | null;
    },
    payload: GuestPortalTokenPayload,
  ): GuestPortalLocalGameProfileMatch | null {
    const cached = guestPortalLangameAutoMatchPayload(event.payload);

    if (!cached) {
      return null;
    }

    const status =
      cached.localStatus ?? langameMatchStatusToLocalStatus(cached.matchStatus);
    const linkStatus = cached.linkStatus;
    const linkedGuestId = cached.linkedGuestId ?? event.guestId ?? null;
    const linkedProfileId =
      cached.linkedProfileId ?? event.profileId ?? payload.profileId;

    return {
      checkedAt: cached.checkedAt ?? event.occurredAt.toISOString(),
      status,
      localGuestFound: Boolean(cached.localGuestId ?? linkedGuestId),
      localGuestId: cached.localGuestId ?? linkedGuestId,
      profileId: linkedProfileId,
      linkStatus,
      linkedGuestId,
      linkedProfileId,
      backfilled: cached.backfilled,
      nextAction: guestPortalLocalGameProfileMatchNextAction(
        status,
        linkStatus,
      ),
    };
  }

  private async buildLangameMatchResponseFromAutoMatchEvent(
    event: {
      profileId: string | null;
      guestId: string | null;
      occurredAt: Date;
      payload: Prisma.JsonValue | null;
    },
    payload: GuestPortalTokenPayload,
    phoneMasked: string,
  ): Promise<GuestPortalLangameMatchResponse | null> {
    const cached = guestPortalLangameAutoMatchPayload(event.payload);

    if (!cached) {
      return null;
    }

    const linkedGuestId = cached.linkedGuestId ?? event.guestId ?? null;
    const linkedProfileId =
      cached.linkedProfileId ?? event.profileId ?? payload.profileId;
    const portal =
      linkedGuestId &&
      (cached.linkStatus === 'LINKED' || cached.linkStatus === 'ALREADY_LINKED')
        ? await this.buildPortalPayload({
            ...payload,
            guestId: linkedGuestId,
            profileId: linkedProfileId,
          })
        : null;

    return {
      checkedAt: cached.checkedAt ?? event.occurredAt.toISOString(),
      queryField: 'phone',
      phoneMasked: cached.phoneMasked ?? phoneMasked,
      status: cached.matchStatus,
      localGuestFound: Boolean(cached.localGuestId ?? linkedGuestId),
      localGuestId: cached.localGuestId ?? linkedGuestId,
      profileId: linkedProfileId,
      linkStatus: cached.linkStatus,
      linkedGuestId,
      linkedProfileId,
      backfilled: cached.backfilled,
      nextAction: guestPortalLangameMatchNextAction(
        cached.matchStatus,
        cached.linkStatus,
      ),
      portal,
      sources: cached.sources,
    };
  }

  private async buildLocalGameProfileMatch(
    payload: GuestPortalTokenPayload,
    options: {
      phoneMasked?: string | null;
      source: string;
    },
  ): Promise<GuestPortalLocalGameProfileMatch> {
    const checkedAt = new Date().toISOString();
    const localGuest = await this.prisma.guest.findFirst({
      where: {
        tenantId: payload.tenantId,
        phoneHash: payload.phoneHash,
        isDisabled: false,
        ...(payload.guestId ? { id: payload.guestId } : {}),
      },
      orderBy: [{ lastActivityAt: 'desc' }, { updatedAt: 'desc' }],
      select: { id: true },
    });

    const linkResult = localGuest
      ? await this.linkGameProfileToLocalGuest(
          payload,
          payload.profileId,
          localGuest.id,
          options.phoneMasked ?? null,
          options.source,
        )
      : ({
          status: payload.profileId ? 'WAITING_FOR_SYNC' : 'NOT_LINKED',
          guestId: null,
          profileId: payload.profileId,
          linkedNow: false,
          backfilled: emptyGameProfileBackfillSummary(),
        } satisfies GuestPortalGameProfileLinkResult);

    if (!localGuest) {
      const cachedEvent = await this.findLangameAutoMatchEvent(payload);
      const cachedMatch = cachedEvent
        ? this.buildLocalMatchFromAutoMatchEvent(cachedEvent, payload)
        : null;

      if (cachedMatch) {
        return cachedMatch;
      }
    }

    const status: GuestPortalLocalGameProfileMatchStatus = localGuest
      ? linkResult.status === 'CONFLICT' || linkResult.status === 'NOT_LINKED'
        ? linkResult.status
        : 'MATCHED_LOCAL'
      : payload.profileId
        ? 'WAITING_FOR_SYNC'
        : 'NOT_LINKED';

    return {
      checkedAt,
      status,
      localGuestFound: Boolean(localGuest),
      localGuestId: localGuest?.id ?? null,
      profileId: linkResult.profileId ?? payload.profileId,
      linkStatus: linkResult.status,
      linkedGuestId: linkResult.guestId,
      linkedProfileId: linkResult.profileId,
      backfilled: linkResult.backfilled,
      nextAction: guestPortalLocalGameProfileMatchNextAction(
        status,
        linkResult.status,
      ),
    };
  }

  private async linkGameProfileToLocalGuest(
    payload: GuestPortalTokenPayload,
    profileId: string | null,
    guestId: string,
    phoneMasked: string | null,
    source = 'guest_portal_langame_match',
  ): Promise<GuestPortalGameProfileLinkResult> {
    if (!profileId) {
      return {
        status: 'NOT_LINKED',
        guestId,
        profileId: null,
        linkedNow: false,
        backfilled: emptyGameProfileBackfillSummary(),
      };
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const [profile, guest, existingLinkedProfile] = await Promise.all([
        tx.guestGameProfile.findFirst({
          where: {
            id: profileId,
            tenantId: payload.tenantId,
            status: 'ACTIVE',
          },
          select: {
            id: true,
            guestId: true,
            phoneHash: true,
            contactMasked: true,
            displayName: true,
          },
        }),
        tx.guest.findFirst({
          where: {
            id: guestId,
            tenantId: payload.tenantId,
            isDisabled: false,
            phoneHash: payload.phoneHash,
          },
          select: {
            id: true,
            externalProvider: true,
            externalDomain: true,
            externalGuestId: true,
            phoneMasked: true,
            emailMasked: true,
            fullNameMasked: true,
          },
        }),
        tx.guestGameProfile.findFirst({
          where: {
            tenantId: payload.tenantId,
            guestId,
            status: 'ACTIVE',
          },
          select: { id: true },
        }),
      ]);

      if (!profile || !guest) {
        return {
          status: 'NOT_LINKED',
          guestId,
          profileId: profile?.id ?? profileId,
          linkedNow: false,
          backfilled: emptyGameProfileBackfillSummary(),
        };
      }

      if (profile.guestId === guest.id) {
        const backfilled = await this.backfillGameProfileGuestLinks(
          tx,
          payload.tenantId,
          profile.id,
          guest.id,
        );
        await this.createGameProfileLinkedEvent(tx, {
          tenantId: payload.tenantId,
          profileId: profile.id,
          guestId: guest.id,
          externalProvider: guest.externalProvider,
          externalDomain: guest.externalDomain,
          externalGuestId: guest.externalGuestId,
          phoneMasked: phoneMasked ?? guest.phoneMasked,
          source,
          backfilled,
          occurredAt: now,
        });

        return {
          status: 'ALREADY_LINKED',
          guestId: guest.id,
          profileId: profile.id,
          linkedNow: false,
          backfilled,
        };
      }

      if (
        (profile.guestId && profile.guestId !== guest.id) ||
        (existingLinkedProfile && existingLinkedProfile.id !== profile.id)
      ) {
        return {
          status: 'CONFLICT',
          guestId: guest.id,
          profileId: profile.id,
          linkedNow: false,
          backfilled: emptyGameProfileBackfillSummary(),
        };
      }

      await tx.guestGameProfile.update({
        where: { id: profile.id },
        data: {
          guestId: guest.id,
          phoneHash: profile.phoneHash ?? payload.phoneHash,
          contactMasked:
            profile.contactMasked ??
            guest.phoneMasked ??
            guest.emailMasked ??
            phoneMasked,
          displayName:
            profile.displayName ??
            guest.fullNameMasked ??
            guest.externalGuestId ??
            'Гость клуба',
          lastActivityAt: now,
        },
      });
      const backfilled = await this.backfillGameProfileGuestLinks(
        tx,
        payload.tenantId,
        profile.id,
        guest.id,
      );
      await this.createGameProfileLinkedEvent(tx, {
        tenantId: payload.tenantId,
        profileId: profile.id,
        guestId: guest.id,
        externalProvider: guest.externalProvider,
        externalDomain: guest.externalDomain,
        externalGuestId: guest.externalGuestId,
        phoneMasked: phoneMasked ?? guest.phoneMasked,
        source,
        backfilled,
        occurredAt: now,
      });

      return {
        status: 'LINKED',
        guestId: guest.id,
        profileId: profile.id,
        linkedNow: true,
        backfilled,
      };
    });
  }

  private async backfillGameProfileGuestLinks(
    tx: Prisma.TransactionClient,
    tenantId: string,
    profileId: string,
    guestId: string,
  ) {
    const [rewards, events, deliveries, bonusLedgerEntries] = await Promise.all(
      [
        tx.guestGameReward.updateMany({
          where: { tenantId, profileId, guestId: null },
          data: { guestId },
        }),
        tx.guestGameEvent.updateMany({
          where: { tenantId, profileId, guestId: null },
          data: { guestId },
        }),
        tx.guestGameDelivery.updateMany({
          where: { tenantId, profileId, guestId: null },
          data: { guestId },
        }),
        tx.guestBonusLedgerEntry.updateMany({
          where: { tenantId, profileId, guestId: null },
          data: { guestId },
        }),
      ],
    );

    return {
      rewards: rewards.count,
      events: events.count,
      deliveries: deliveries.count,
      bonusLedgerEntries: bonusLedgerEntries.count,
    };
  }

  private async createGameProfileLinkedEvent(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      profileId: string;
      guestId: string;
      externalProvider: IntegrationProvider | null;
      externalDomain: string | null;
      externalGuestId: string;
      phoneMasked: string | null;
      source: string;
      backfilled: GuestPortalGameProfileBackfillSummary;
      occurredAt: Date;
    },
  ) {
    await tx.guestGameEvent.createMany({
      data: [
        {
          tenantId: input.tenantId,
          profileId: input.profileId,
          guestId: input.guestId,
          eventType: GAME_PROFILE_LINKED_EVENT_TYPE,
          source: GAME_PROFILE_LINK_SOURCE,
          externalProvider: input.externalProvider,
          externalDomain: input.externalDomain,
          externalId: `game-profile-link:${input.profileId}:${input.guestId}`,
          occurredAt: input.occurredAt,
          payload: {
            source: input.source,
            phoneMasked: input.phoneMasked,
            externalGuestId: input.externalGuestId,
            backfilled: input.backfilled,
          },
          note: 'Игровой профиль участника геймификации безопасно связан с синхронизированным гостем Langame.',
          createdAt: input.occurredAt,
        },
      ],
      skipDuplicates: true,
    });
  }

  async getLangameGuestDetails(
    authorization: string | undefined,
  ): Promise<GuestPortalLangameDetailsResponse> {
    const payload = await this.verifyGuestToken(authorization);
    const guest = await this.findGuest(payload);
    const checkedAt = new Date().toISOString();
    const localSnapshot = {
      sourceDomain: guest?.externalDomain ?? null,
      externalGuestId: guest?.externalGuestId ?? null,
      lastSyncedAt: iso(guest?.lastSyncedAt ?? null),
    };

    if (!guest?.externalDomain || !guest.externalGuestId) {
      return {
        checkedAt,
        status: 'NOT_LINKED',
        nextAction:
          'Сначала сопоставьте гостя с Langame через проверку профиля или дождитесь синхронизации клуба.',
        localSnapshot,
        langame: null,
      };
    }

    const langame = await this.langameSettingsService.getGuestDetailsForPortal(
      payload.tenantId,
      guest.externalDomain,
      guest.externalGuestId,
    );
    const status = langame.source.status;

    return {
      checkedAt: langame.checkedAt,
      status,
      nextAction:
        status === 'SUCCESS'
          ? 'Карточка Langame проверена вручную. Данные показаны в безопасном виде и не сохранены как raw payload.'
          : 'Langame сейчас не вернул карточку гостя. Используйте сохраненный snapshot и повторите проверку позже.',
      localSnapshot,
      langame,
    };
  }

  private async getPublishedVisualLootBoxRefs(
    tenantId: string,
    storeId: string,
  ): Promise<GuestPortalVisualLootBoxRef[] | null> {
    const storeDraft = await this.prisma.guestGameVisualDraft.findFirst({
      where: { tenantId, storeId, status: 'PUBLISHED' },
      select: { payload: true },
      orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
    });
    const draft =
      storeDraft ??
      (await this.prisma.guestGameVisualDraft.findFirst({
        where: { tenantId, storeId: null, status: 'PUBLISHED' },
        select: { payload: true },
        orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
      }));

    if (!draft) {
      return null;
    }

    return visualLootBoxRefsFromPayload(draft.payload);
  }

  private async buildLootBoxOpenSourceFactId(
    tenantId: string,
    profileId: string,
    guestId: string | null,
    storeId: string,
    lootBoxId: string,
    lootBoxLimits: Prisma.JsonValue | null,
    openedAt: Date,
  ) {
    const limits = jsonRecord(lootBoxLimits);
    const restartedAt = lootBoxRestartedAt(limits);
    const weekStart = maxDate(startOfRollingWeek(openedAt), restartedAt);
    const resetToken = lootBoxResetToken(limits);
    const sourceFactPrefix = [
      'guest-game',
      GAME_LOOT_BOX_OPEN_SOURCE_KIND,
      GAME_APP_OPEN_EVENT_TYPE,
      profileId,
      storeId,
      lootBoxId,
      ...(resetToken ? [resetToken] : []),
    ].join(':');
    const [openedRewardCount, openedEventCount] = await Promise.all([
      this.prisma.guestGameReward.count({
        where: {
          tenantId,
          lootBoxId,
          storeId,
          qualifiedAt: { gte: weekStart },
          status: { in: ['PENDING', 'APPROVED', 'PAID', 'EXPIRED'] },
          OR: [{ profileId }, ...(guestId ? [{ guestId }] : [])],
        },
      }),
      this.prisma.guestGameEvent.count({
        where: {
          tenantId,
          profileId,
          lootBoxId,
          eventType: GAME_APP_OPEN_EVENT_TYPE,
          occurredAt: { gte: weekStart },
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: GAME_APP_OPEN_EXTERNAL_DOMAIN,
          externalId: { startsWith: `${sourceFactPrefix}:` },
        },
      }),
    ]);
    const openedCount = Math.max(openedRewardCount, openedEventCount);

    return [
      profileId,
      storeId,
      lootBoxId,
      ...(resetToken ? [resetToken] : []),
      openedAt.toISOString().slice(0, 10),
      openedCount + 1,
    ].join(':');
  }

  private async findPortalRewards(
    tenantId: string,
    storeId: string,
    guestId: string | null,
    profileId: string | null,
  ): Promise<GuestPortalRewardRow[]> {
    const ownerFilters: Prisma.GuestGameRewardWhereInput[] = [
      ...(guestId ? [{ guestId }] : []),
      ...(profileId ? [{ profileId }] : []),
    ];

    if (!ownerFilters.length) {
      return [];
    }

    return this.prisma.guestGameReward.findMany({
      where: {
        tenantId,
        AND: [
          { OR: ownerFilters },
          {
            OR: [{ storeId: null }, { storeId }],
          },
        ],
      },
      include: {
        lootBox: { select: { name: true } },
        mission: { select: { name: true } },
        season: { select: { name: true } },
      },
      orderBy: [{ qualifiedAt: 'desc' }, { createdAt: 'desc' }],
      take: 1000,
    });
  }

  private portalBalanceScope(
    store: Pick<
      TenantStoreContext['store'],
      'externalDomain' | 'externalClubId'
    >,
    guest: {
      externalProvider: IntegrationProvider | null;
      externalGuestId: string | null;
    } | null,
  ): GuestPortalBalanceScope | null {
    const sourceDomain = store.externalDomain?.trim() ?? '';
    const externalGuestId = guest?.externalGuestId?.trim() ?? '';

    if (
      !sourceDomain ||
      !externalGuestId ||
      guest?.externalProvider !== IntegrationProvider.LANGAME
    ) {
      return null;
    }

    return {
      sourceDomain,
      externalClubId: store.externalClubId?.trim() || null,
      externalGuestId,
    };
  }

  private portalBalanceSnapshotWhere(
    tenantId: string,
    guestId: string,
    scope: GuestPortalBalanceScope | null,
  ): Prisma.GuestBalanceSnapshotWhereInput {
    if (!scope) {
      return { tenantId, guestId };
    }

    return {
      tenantId,
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain: scope.sourceDomain,
      externalGuestId: scope.externalGuestId,
    };
  }

  private portalBonusBalanceSnapshotWhere(
    tenantId: string,
    guestId: string,
    scope: GuestPortalBalanceScope | null,
  ): Prisma.GuestBonusBalanceSnapshotWhereInput {
    if (!scope) {
      return { tenantId, guestId };
    }

    return {
      tenantId,
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain: scope.sourceDomain,
      externalGuestId: scope.externalGuestId,
    };
  }

  private portalBonusBalanceCurrentWhere(
    tenantId: string,
    guest: {
      id: string;
      externalProvider: IntegrationProvider | null;
      externalDomain: string | null;
      externalGuestId: string | null;
    },
    scope: GuestPortalBalanceScope | null,
  ): Prisma.GuestBonusBalanceCurrentWhereInput {
    if (scope) {
      return {
        tenantId,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: scope.sourceDomain,
        externalGuestId: scope.externalGuestId,
      };
    }

    return {
      tenantId,
      OR: [
        { guestId: guest.id },
        ...(guest.externalProvider &&
        guest.externalDomain &&
        guest.externalGuestId
          ? [
              {
                externalProvider: guest.externalProvider,
                externalDomain: guest.externalDomain,
                externalGuestId: guest.externalGuestId,
              },
            ]
          : []),
      ],
    };
  }

  private async refreshPortalLiveBalances(input: {
    tenantId: string;
    guestId: string;
    sourceDomain: string;
    externalClubId: string | null;
    externalGuestId: string;
  }): Promise<GuestPortalLiveBalanceRefresh | null> {
    let live: LangameGuestBalancesPortalResult;

    try {
      live = await this.langameSettingsService.getGuestBalancesForPortal(
        input.tenantId,
        input.sourceDomain,
        input.externalGuestId,
      );
    } catch {
      return null;
    }

    const checkedAt = validDateOrNow(live.checkedAt);
    const snapshotDate = minutePrecisionDate(checkedAt);
    let balanceSnapshot: GuestPortalBalanceSnapshotRow | null = null;
    let bonusBalanceCurrent: GuestPortalBonusBalanceCurrentRow | null = null;
    let bonusBalanceSnapshot: GuestPortalBonusBalanceSnapshotRow | null = null;

    if (live.balanceFound && live.balance !== null) {
      const balance = new Prisma.Decimal(live.balance);
      balanceSnapshot = await this.prisma.guestBalanceSnapshot.upsert({
        where: {
          tenantId_externalProvider_externalDomain_externalGuestId_snapshotDate:
            {
              tenantId: input.tenantId,
              externalProvider: IntegrationProvider.LANGAME,
              externalDomain: input.sourceDomain,
              externalGuestId: input.externalGuestId,
              snapshotDate,
            },
        },
        create: {
          tenantId: input.tenantId,
          guestId: input.guestId,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: input.sourceDomain,
          externalGuestId: input.externalGuestId,
          snapshotDate,
          balance,
          sourcePayloadHash: portalLiveBalancePayloadHash({
            kind: 'balance',
            sourceDomain: input.sourceDomain,
            externalClubId: input.externalClubId,
            externalGuestId: input.externalGuestId,
            value: live.balance,
          }),
        },
        update: {
          guestId: input.guestId,
          balance,
          sourcePayloadHash: portalLiveBalancePayloadHash({
            kind: 'balance',
            sourceDomain: input.sourceDomain,
            externalClubId: input.externalClubId,
            externalGuestId: input.externalGuestId,
            value: live.balance,
          }),
        },
      });
    }

    if (live.bonusBalanceFound && live.bonusBalance !== null) {
      const bonusBalance = new Prisma.Decimal(live.bonusBalance);
      const sourcePayloadHash = portalLiveBalancePayloadHash({
        kind: 'bonus_balance',
        sourceDomain: input.sourceDomain,
        externalClubId: input.externalClubId,
        externalGuestId: input.externalGuestId,
        value: live.bonusBalance,
      });

      [bonusBalanceCurrent, bonusBalanceSnapshot] = await Promise.all([
        this.prisma.guestBonusBalanceCurrent.upsert({
          where: {
            tenantId_externalProvider_externalDomain_externalGuestId: {
              tenantId: input.tenantId,
              externalProvider: IntegrationProvider.LANGAME,
              externalDomain: input.sourceDomain,
              externalGuestId: input.externalGuestId,
            },
          },
          create: {
            tenantId: input.tenantId,
            guestId: null,
            externalProvider: IntegrationProvider.LANGAME,
            externalDomain: input.sourceDomain,
            externalGuestId: input.externalGuestId,
            bonusBalance,
            snapshotDate,
            source: 'LANGAME_LIVE',
            sourcePayloadHash,
            lastSyncedAt: checkedAt,
          },
          update: {
            guestId: null,
            bonusBalance,
            snapshotDate,
            source: 'LANGAME_LIVE',
            sourcePayloadHash,
            lastSyncedAt: checkedAt,
          },
        }),
        this.prisma.guestBonusBalanceSnapshot.upsert({
          where: {
            tenantId_externalProvider_externalDomain_externalGuestId_snapshotDate:
              {
                tenantId: input.tenantId,
                externalProvider: IntegrationProvider.LANGAME,
                externalDomain: input.sourceDomain,
                externalGuestId: input.externalGuestId,
                snapshotDate,
              },
          },
          create: {
            tenantId: input.tenantId,
            guestId: input.guestId,
            externalProvider: IntegrationProvider.LANGAME,
            externalDomain: input.sourceDomain,
            externalGuestId: input.externalGuestId,
            snapshotDate,
            bonusBalance,
            sourcePayloadHash,
          },
          update: {
            guestId: input.guestId,
            bonusBalance,
            sourcePayloadHash,
          },
        }),
      ]);
    }

    return {
      balanceSnapshot,
      bonusBalanceCurrent,
      bonusBalanceSnapshot,
    };
  }

  private async buildPortalPayload(
    tokenPayload: GuestPortalTokenPayload,
    options: GuestPortalBuildOptions = {},
  ): Promise<GuestPortalPayload> {
    const context = await this.getTenantStoreByIds(
      tokenPayload.tenantId,
      tokenPayload.storeId,
    );
    const guest = await this.findGuest(tokenPayload);
    let profile = await this.findProfile(tokenPayload, guest?.id ?? null);
    const crmLead = await this.findCrmLead(
      tokenPayload,
      profile?.leadId ?? null,
      guest?.id ?? null,
    );
    if (!profile && crmLead) {
      profile = await this.findProfileByLead(context.tenant.id, crmLead.id);
    }
    const balanceScope = this.portalBalanceScope(context.store, guest);
    const [
      groups,
      balanceSnapshot,
      bonusBalanceCurrent,
      bonusBalanceSnapshot,
      lootBoxes,
      missions,
      seasons,
      promoCards,
      rewards,
      bonusLedgerRows,
      communicationEvents,
      publishedVisualLootBoxRefs,
      activity,
    ] = await Promise.all([
      this.prisma.guestGroup.findMany({
        where: { tenantId: context.tenant.id },
        orderBy: [{ countHoursFrom: 'asc' }, { name: 'asc' }],
      }),
      guest
        ? this.prisma.guestBalanceSnapshot.findFirst({
            where: {
              ...this.portalBalanceSnapshotWhere(
                context.tenant.id,
                guest.id,
                balanceScope,
              ),
            },
            orderBy: { snapshotDate: 'desc' },
          })
        : null,
      guest
        ? this.prisma.guestBonusBalanceCurrent.findFirst({
            where: this.portalBonusBalanceCurrentWhere(
              context.tenant.id,
              guest,
              balanceScope,
            ),
            orderBy: [
              { snapshotDate: 'desc' },
              { lastSyncedAt: 'desc' },
              { updatedAt: 'desc' },
            ],
          })
        : null,
      guest
        ? this.prisma.guestBonusBalanceSnapshot.findFirst({
            where: {
              ...this.portalBonusBalanceSnapshotWhere(
                context.tenant.id,
                guest.id,
                balanceScope,
              ),
            },
            orderBy: { snapshotDate: 'desc' },
          })
        : null,
      this.prisma.guestGameLootBox.findMany({
        where: {
          tenantId: context.tenant.id,
          status: 'ACTIVE',
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.guestGameMission.findMany({
        where: {
          tenantId: context.tenant.id,
          status: 'ACTIVE',
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.guestGameSeason.findMany({
        where: {
          tenantId: context.tenant.id,
          status: 'ACTIVE',
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.guestGamePromoCard.findMany({
        where: {
          tenantId: context.tenant.id,
          status: 'ACTIVE',
        },
        orderBy: [
          { priority: 'desc' },
          { updatedAt: 'desc' },
          { createdAt: 'desc' },
        ],
      }),
      this.findPortalRewards(
        context.tenant.id,
        context.store.id,
        guest?.id ?? null,
        profile?.id ?? null,
      ),
      guest || profile
        ? this.prisma.guestBonusLedgerEntry.findMany({
            where: {
              tenantId: context.tenant.id,
              AND: [
                {
                  OR: [
                    ...(guest ? [{ guestId: guest.id }] : []),
                    ...(profile ? [{ profileId: profile.id }] : []),
                  ],
                },
                {
                  OR: [{ storeId: null }, { storeId: context.store.id }],
                },
              ],
            },
            select: {
              id: true,
              status: true,
              entryType: true,
              amount: true,
              balanceAfter: true,
              processedAt: true,
              confirmedAt: true,
              failedAt: true,
              canceledAt: true,
              createdAt: true,
              updatedAt: true,
              reward: {
                select: {
                  rewardLabel: true,
                  rewardType: true,
                  lootBoxId: true,
                  missionId: true,
                  seasonId: true,
                  lootBox: { select: { name: true } },
                  mission: { select: { name: true } },
                  season: { select: { name: true } },
                },
              },
              store: { select: { name: true } },
            },
            orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
            take: 10,
          })
        : [],
      guest
        ? this.prisma.guestCrmEvent.findMany({
            where: {
              tenantId: context.tenant.id,
              guestId: guest.id,
              note: {
                startsWith: COMMUNICATION_PREFERENCE_EVENT_PREFIX,
              },
            },
            select: {
              id: true,
              note: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 5,
          })
        : [],
      this.getPublishedVisualLootBoxRefs(context.tenant.id, context.store.id),
      this.buildActivity(context.tenant.id, context.store.id, guest, profile),
    ]);

    const xp = profile?.xp ?? 0;
    const level = Math.max(1, profile?.level ?? levelFromXp(xp));
    const currentLevelXp = (level - 1) * 500;
    const nextLevelXp = level * 500;
    const levelProgressPercent = percent(xp - currentLevelXp, 500);
    const currentHours = decimalNumber(guest?.currentCountHours ?? null);
    const liveBalanceRefresh =
      options.refreshLiveBalances && guest && balanceScope
        ? await this.refreshPortalLiveBalances({
            tenantId: context.tenant.id,
            guestId: guest.id,
            sourceDomain: balanceScope.sourceDomain,
            externalClubId: balanceScope.externalClubId,
            externalGuestId: balanceScope.externalGuestId,
          })
        : null;
    const loyalty = this.buildLoyalty(
      guest,
      groups,
      liveBalanceRefresh?.balanceSnapshot ?? balanceSnapshot,
      liveBalanceRefresh?.bonusBalanceCurrent ?? bonusBalanceCurrent,
      liveBalanceRefresh?.bonusBalanceSnapshot ?? bonusBalanceSnapshot,
      currentHours,
    );
    const visibleMissions = missions
      .filter((item) => matchesStore(item.storeIds, context.store.id))
      .filter((item) => activePeriod(item.periodFrom, item.periodTo))
      .slice(0, 6);
    const missionProgress = await this.buildMissionProgress(
      context.tenant.id,
      guest,
      profile,
      visibleMissions,
    );
    const portalRewards = rewards.map(mapReward).sort(comparePortalRewards);
    const bonusHistory = this.buildBonusHistory(bonusLedgerRows);
    const portalLootBoxes = filterLootBoxesByVisualRefs(
      lootBoxes.filter((item) => matchesStore(item.storeIds, context.store.id)),
      publishedVisualLootBoxRefs,
    )
      .slice(0, 6)
      .map((item) => mapLootBox(item, rewards));
    const portalMissions = visibleMissions.map((item) =>
      mapMission(item, missionProgress.get(item.id), rewards, bonusLedgerRows),
    );
    const portalSeasons = seasons
      .filter((item) => matchesStore(item.storeIds, context.store.id))
      .filter((item) => activePeriod(item.periodFrom, item.periodTo))
      .slice(0, 2)
      .map((item) => mapSeason(item, xp, rewards));
    const portalPromoCards = promoCards
      .filter((item) => matchesStore(item.storeIds, context.store.id))
      .filter((item) => activePeriod(item.periodFrom, item.periodTo))
      .slice(0, 6)
      .map(mapPromoCard);
    const nextActions = buildNextActions({
      guestFound: Boolean(guest || profile),
      lootBoxes: portalLootBoxes,
      missions: portalMissions,
      seasons: portalSeasons,
      rewards: portalRewards,
    });

    return {
      tenant: {
        name: context.tenant.name,
        slug: context.tenant.slug,
      },
      store: context.store,
      guestFound: Boolean(guest || profile || crmLead),
      crmLead: buildCrmLead(crmLead),
      profile: {
        id: profile?.id ?? null,
        displayName:
          profile?.displayName ??
          guest?.fullNameMasked ??
          guest?.externalGuestId ??
          crmLead?.fullNameMasked ??
          crmLead?.phoneMasked ??
          'Гость клуба',
        contactMasked:
          profile?.contactMasked ??
          guest?.phoneMasked ??
          guest?.emailMasked ??
          crmLead?.phoneMasked ??
          crmLead?.emailMasked ??
          null,
        isStaffTest: profile?.isStaffTest ?? false,
        xp,
        level,
        nextLevelXp,
        levelProgressPercent,
        frame: frameForLevel(level),
      },
      loyalty,
      guestSnapshot: buildGuestSnapshot(guest, crmLead, profile),
      gamification: {
        nextActions,
        lootBoxes: portalLootBoxes,
        missions: portalMissions,
        seasons: portalSeasons,
        promoCards: portalPromoCards,
        rewardSummary: buildRewardSummary(portalRewards),
        rewards: portalRewards,
        bonusHistory,
      },
      activity,
      communications: buildCommunications(
        guest,
        profile,
        communicationEvents,
        crmLead,
      ),
    };
  }

  private async buildMissionProgress(
    tenantId: string,
    guest: { id: string } | null,
    profile: { id: string } | null,
    missions: Array<{
      id: string;
      triggerKind: string;
      conditions: Prisma.JsonValue;
      storeIds: Prisma.JsonValue | null;
      periodFrom: Date | null;
      periodTo: Date | null;
      progressTarget: number | null;
      progressUnit: string | null;
    }>,
  ): Promise<Map<string, GuestPortalMissionProgress>> {
    if ((!guest && !profile) || missions.length === 0) {
      return new Map();
    }

    const missionById = new Map(
      missions.map((mission) => [mission.id, mission]),
    );
    const missionIds = [...missionById.keys()];
    const eventScope: Prisma.GuestGameEventWhereInput[] = [
      ...(guest ? [{ guestId: guest.id }] : []),
      ...(profile ? [{ profileId: profile.id }] : []),
    ];
    const rewardScope: Prisma.GuestGameRewardWhereInput[] = [
      ...(guest ? [{ guestId: guest.id }] : []),
      ...(profile ? [{ profileId: profile.id }] : []),
    ];

    const [eventRows, rewardRows] = await Promise.all([
      this.prisma.guestGameEvent.findMany({
        where: {
          tenantId,
          OR: eventScope,
        },
        select: {
          eventType: true,
          occurredAt: true,
          payload: true,
        },
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        take: 1000,
      }),
      this.prisma.guestGameReward.findMany({
        where: {
          tenantId,
          missionId: { in: missionIds },
          OR: rewardScope,
          status: { not: 'CANCELED' },
        },
        select: {
          missionId: true,
          qualifiedAt: true,
        },
      }),
    ]);

    const progressEvents = eventRows.map(portalEventToProgressEvent);
    const rewardCounts = new Map<string, number>();

    rewardRows.forEach((row) => {
      if (!row.missionId) {
        return;
      }

      const mission = missionById.get(row.missionId);
      if (!mission || !dateWithinMission(row.qualifiedAt, mission)) {
        return;
      }

      rewardCounts.set(
        row.missionId,
        (rewardCounts.get(row.missionId) ?? 0) + 1,
      );
    });

    const progress = new Map<string, GuestPortalMissionProgress>();

    missions.forEach((mission) => {
      const target =
        typeof mission.progressTarget === 'number' && mission.progressTarget > 0
          ? mission.progressTarget
          : 1;
      const metricProgress = evaluateGuestGameProgress(
        {
          triggerKind: mission.triggerKind,
          progressTarget: mission.progressTarget,
          progressUnit: mission.progressUnit,
          conditions: mission.conditions,
          storeIds: stringArray(mission.storeIds),
          periodFrom: mission.periodFrom,
          periodTo: mission.periodTo,
        },
        null,
        progressEvents,
      );
      const current = Math.max(
        metricProgress.applicable ? metricProgress.current : 0,
        rewardCounts.get(mission.id) ?? 0,
      );

      progress.set(mission.id, {
        current,
        percent: percent(current, target),
      });
    });

    return progress;
  }

  private async buildActivity(
    tenantId: string,
    storeId: string,
    guest: { id: string } | null,
    profile: { id: string } | null,
  ): Promise<GuestPortalPayload['activity']> {
    const empty = emptyActivity();

    if (!guest && !profile) {
      return empty;
    }

    const gameEventScope = [
      ...(guest ? [{ guestId: guest.id }] : []),
      ...(profile ? [{ profileId: profile.id }] : []),
    ];

    const [
      sessionStats,
      sessions,
      logsCount,
      logs,
      transactionStats,
      transactions,
      gameEventStats,
      gameEvents,
    ] = await Promise.all([
      guest
        ? this.prisma.guestSession.aggregate({
            where: { tenantId, guestId: guest.id, storeId },
            _count: { id: true },
            _sum: { durationMinutes: true },
            _max: { startedAt: true },
          })
        : null,
      guest
        ? this.prisma.guestSession.findMany({
            where: { tenantId, guestId: guest.id, storeId },
            include: { store: { select: { name: true } } },
            orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
            take: 8,
          })
        : [],
      guest
        ? this.prisma.guestLog.count({
            where: { tenantId, guestId: guest.id },
          })
        : 0,
      guest
        ? this.prisma.guestLog.findMany({
            where: { tenantId, guestId: guest.id },
            orderBy: [{ happenedAt: 'desc' }, { createdAt: 'desc' }],
            take: 8,
          })
        : [],
      guest
        ? this.prisma.guestTransaction.aggregate({
            where: { tenantId, guestId: guest.id, storeId },
            _count: { id: true },
            _max: { happenedAt: true },
          })
        : null,
      guest
        ? this.prisma.guestTransaction.findMany({
            where: { tenantId, guestId: guest.id, storeId },
            include: { store: { select: { name: true } } },
            orderBy: [{ happenedAt: 'desc' }, { createdAt: 'desc' }],
            take: 8,
          })
        : [],
      gameEventScope.length
        ? this.prisma.guestGameEvent.aggregate({
            where: { tenantId, OR: gameEventScope },
            _count: { id: true },
            _max: { occurredAt: true },
          })
        : null,
      gameEventScope.length
        ? this.prisma.guestGameEvent.findMany({
            where: { tenantId, OR: gameEventScope },
            include: {
              lootBox: { select: { name: true } },
              mission: { select: { name: true } },
              season: { select: { name: true } },
            },
            orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
            take: 8,
          })
        : [],
    ]);

    const sessionRows = sessions as Array<
      Parameters<typeof mapSessionActivity>[0]
    >;
    const logRows = logs as Array<Parameters<typeof mapLogActivity>[0]>;
    const transactionRows = transactions as Array<
      Parameters<typeof mapTransactionActivity>[0]
    >;
    const gameEventRows = gameEvents as Array<
      Parameters<typeof mapGameEventActivity>[0]
    >;

    const timeline: GuestPortalActivityItem[] = [
      ...sessionRows.map((row) => mapSessionActivity(row)),
      ...logRows.map((row) => mapLogActivity(row)),
      ...transactionRows.map((row) => mapTransactionActivity(row)),
      ...gameEventRows.map((row) => mapGameEventActivity(row)),
    ]
      .sort(
        (left, right) =>
          new Date(right.occurredAt).getTime() -
          new Date(left.occurredAt).getTime(),
      )
      .slice(0, 12);
    const xpHistory = gameEventRows
      .filter((row) => row.xpDelta !== 0)
      .map((row) => mapXpHistory(row))
      .slice(0, 6);

    const lastActivityAt =
      newestDate([
        sessionStats?._max.startedAt ?? null,
        transactionStats?._max.happenedAt ?? null,
        gameEventStats?._max.occurredAt ?? null,
        timeline[0] ? new Date(timeline[0].occurredAt) : null,
      ]) ?? null;

    return {
      summary: {
        sessionsCount: sessionStats?._count.id ?? 0,
        playMinutes: sessionStats?._sum.durationMinutes ?? 0,
        logsCount,
        transactionsCount: transactionStats?._count.id ?? 0,
        gameEventsCount: gameEventStats?._count.id ?? 0,
        lastActivityAt: iso(lastActivityAt),
      },
      timeline,
      xpHistory,
    };
  }

  private buildLoyalty(
    guest: {
      externalProvider: IntegrationProvider | null;
      externalDomain: string | null;
      externalGuestTypeId: string | null;
      currentCountHours: Prisma.Decimal | null;
      lastSyncedAt: Date | null;
    } | null,
    groups: Array<{
      externalProvider: IntegrationProvider | null;
      externalDomain: string | null;
      externalGroupId: string;
      name: string;
      percent: Prisma.Decimal | null;
      countHoursFrom: Prisma.Decimal | null;
      countHoursTo: Prisma.Decimal | null;
    }>,
    balanceSnapshot: { balance: Prisma.Decimal; snapshotDate: Date } | null,
    bonusBalanceCurrent: {
      bonusBalance: Prisma.Decimal;
      snapshotDate: Date;
      source: string;
      lastSyncedAt: Date | null;
      updatedAt: Date;
    } | null,
    bonusBalanceSnapshot: {
      bonusBalance: Prisma.Decimal;
      snapshotDate: Date;
    } | null,
    currentHours: number | null,
  ): GuestPortalPayload['loyalty'] {
    const groupByExternalId = guest?.externalGuestTypeId
      ? groups.find(
          (group) =>
            group.externalProvider === guest.externalProvider &&
            group.externalDomain === guest.externalDomain &&
            group.externalGroupId === guest.externalGuestTypeId,
        )
      : null;
    const groupByHours =
      currentHours == null
        ? null
        : groups.find((group) => {
            const from = decimalNumber(group.countHoursFrom);
            const to = decimalNumber(group.countHoursTo);
            return (
              (from == null || currentHours >= from) &&
              (to == null || currentHours <= to)
            );
          });
    const currentGroup = groupByExternalId ?? groupByHours ?? null;
    const nextGroup =
      currentHours == null
        ? null
        : (groups
            .filter((group) => {
              const from = decimalNumber(group.countHoursFrom);
              return from != null && from > currentHours;
            })
            .sort(
              (left, right) =>
                (decimalNumber(left.countHoursFrom) ?? 0) -
                (decimalNumber(right.countHoursFrom) ?? 0),
            )[0] ?? null);
    const currentFrom =
      decimalNumber(currentGroup?.countHoursFrom ?? null) ?? 0;
    const nextFrom = decimalNumber(nextGroup?.countHoursFrom ?? null);
    const progressPercent =
      currentHours == null || nextFrom == null
        ? currentGroup
          ? 100
          : 0
        : percent(currentHours - currentFrom, nextFrom - currentFrom);
    const lastSyncedAt =
      newestDate([
        guest?.lastSyncedAt ?? null,
        balanceSnapshot?.snapshotDate ?? null,
        bonusBalanceCurrent?.lastSyncedAt ?? null,
        bonusBalanceCurrent?.snapshotDate ?? null,
        bonusBalanceSnapshot?.snapshotDate ?? null,
      ])?.toISOString() ?? null;
    const bonusBalanceSyncedAt =
      newestDate([
        bonusBalanceCurrent?.lastSyncedAt ?? null,
        bonusBalanceCurrent?.snapshotDate ?? null,
        bonusBalanceSnapshot?.snapshotDate ?? null,
      ])?.toISOString() ?? null;

    return {
      groupName: currentGroup?.name ?? null,
      discountPercent: decimalNumber(currentGroup?.percent ?? null),
      currentHours,
      nextGroupName: nextGroup?.name ?? null,
      nextGroupHours: nextFrom,
      progressPercent,
      balance: decimalNumber(balanceSnapshot?.balance ?? null),
      bonusBalance: decimalNumber(
        bonusBalanceCurrent?.bonusBalance ??
          bonusBalanceSnapshot?.bonusBalance ??
          null,
      ),
      bonusBalanceSource:
        bonusBalanceCurrent?.source ??
        (bonusBalanceSnapshot ? 'LANGAME_SNAPSHOT' : null),
      bonusBalanceSyncedAt,
      lastSyncedAt,
    };
  }

  private buildBonusHistory(
    rows: GuestPortalBonusLedgerRow[],
  ): GuestPortalBonusHistory {
    return buildBonusLedgerHistory(rows);
  }

  private async findGuest(payload: GuestPortalTokenPayload) {
    if (payload.guestId) {
      const guest = await this.prisma.guest.findFirst({
        where: {
          id: payload.guestId,
          tenantId: payload.tenantId,
        },
      });

      if (guest) {
        return guest;
      }
    }

    return this.prisma.guest.findFirst({
      where: {
        tenantId: payload.tenantId,
        phoneHash: payload.phoneHash,
        isDisabled: false,
      },
      orderBy: [{ lastActivityAt: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  private async findProfile(
    payload: GuestPortalTokenPayload,
    guestId: string | null,
  ) {
    if (payload.profileId) {
      const profile = await this.prisma.guestGameProfile.findFirst({
        where: {
          id: payload.profileId,
          tenantId: payload.tenantId,
        },
      });

      if (profile) {
        return profile;
      }
    }

    return this.prisma.guestGameProfile.findFirst({
      where: {
        tenantId: payload.tenantId,
        status: 'ACTIVE',
        OR: [
          ...(guestId ? [{ guestId }] : []),
          { phoneHash: payload.phoneHash },
        ],
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async findProfileByLead(tenantId: string, leadId: string) {
    return this.prisma.guestGameProfile.findFirst({
      where: {
        tenantId,
        leadId,
        status: 'ACTIVE',
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async findCrmLead(
    payload: GuestPortalTokenPayload,
    leadId: string | null,
    guestId: string | null,
  ) {
    return this.prisma.guestCrmLead.findFirst({
      where: {
        tenantId: payload.tenantId,
        OR: [
          ...(leadId ? [{ id: leadId }] : []),
          ...(guestId ? [{ matchedGuestId: guestId }] : []),
          { phoneHash: payload.phoneHash },
        ],
      },
      orderBy: [{ matchedAt: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  private async verifyGuestToken(
    authorization: string | undefined,
  ): Promise<GuestPortalTokenPayload> {
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : null;

    if (!token) {
      throw new UnauthorizedException('Guest token is required');
    }

    try {
      const payload =
        await this.jwtService.verifyAsync<GuestPortalTokenPayload>(token);

      if (payload.purpose !== GUEST_PORTAL_PURPOSE) {
        throw new UnauthorizedException('Invalid guest token');
      }

      await this.getTenantStoreByIds(payload.tenantId, payload.storeId);

      return payload;
    } catch {
      throw new UnauthorizedException('Invalid guest token');
    }
  }

  private async getTenantStore(
    tenantSlug: string,
    storeId: string,
  ): Promise<TenantStoreContext> {
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        slug: tenantSlug,
        status: TenantLifecycleStatus.ACTIVE,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        stores: {
          where: {
            OR: [{ id: storeId }, { publicSlug: storeId }],
            isActive: true,
          },
          select: {
            id: true,
            publicSlug: true,
            name: true,
            address: true,
            externalDomain: true,
            externalClubId: true,
            integrationSourceId: true,
          },
          take: 1,
        },
      },
    });

    const store = tenant?.stores[0] ?? null;

    if (!tenant || !store) {
      throw new NotFoundException('Гостевая ссылка не найдена.');
    }

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
      store,
    };
  }

  private async getTenantStoreByIds(
    tenantId: string,
    storeId: string,
  ): Promise<TenantStoreContext> {
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        id: tenantId,
        status: TenantLifecycleStatus.ACTIVE,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        stores: {
          where: {
            id: storeId,
            isActive: true,
          },
          select: {
            id: true,
            publicSlug: true,
            name: true,
            address: true,
            externalDomain: true,
            externalClubId: true,
            integrationSourceId: true,
          },
          take: 1,
        },
      },
    });

    const store = tenant?.stores[0] ?? null;

    if (!tenant || !store) {
      throw new UnauthorizedException('Guest portal scope is inactive');
    }

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
      store,
    };
  }

  private phoneIdentity(value: unknown): GuestPortalPhoneIdentity {
    const raw = this.requiredString(value, 'Телефон');
    const normalized = raw.replace(/\D/g, '');

    if (normalized.length < 6) {
      throw new BadRequestException('Введите корректный номер телефона.');
    }

    return {
      normalized,
      hash: createHmac('sha256', this.piiSecret())
        .update(normalized)
        .digest('hex'),
      masked: normalized.length <= 4 ? '****' : `***${normalized.slice(-4)}`,
    };
  }

  private encryptPhone(phone: GuestPortalPhoneIdentity) {
    return this.secretEncryptionService.encrypt(phone.normalized);
  }

  private phoneIdentityFromEncrypted(
    value: string | null,
  ): GuestPortalPhoneIdentity | null {
    if (!value) {
      return null;
    }

    try {
      return this.phoneIdentity(this.secretEncryptionService.decrypt(value));
    } catch {
      return null;
    }
  }

  private async resolveStaffTestMatch(
    tenantId: string,
    phone: GuestPortalPhoneIdentity | null,
  ): Promise<GuestPortalStaffTestMatch | null> {
    if (!phone) {
      return null;
    }

    const [staffMembers, langameStaffUsers] = await Promise.all([
      this.prisma.staffMember.findMany({
        where: {
          tenantId,
          status: { notIn: ['DISMISSED', 'ARCHIVED'] },
          phone: { not: null },
        },
        select: { phone: true },
        take: 1000,
      }),
      this.prisma.langameStaffUser.findMany({
        where: {
          tenantId,
          phone: { not: null },
        },
        select: { phone: true },
        take: 1000,
      }),
    ]);

    if (
      staffMembers.some((member) =>
        phonesMatch(phone.normalized, normalizePhoneDigits(member.phone)),
      )
    ) {
      return {
        reason: GAME_PROFILE_STAFF_TEST_REASON_STAFF_PHONE,
        matchedAt: new Date(),
      };
    }

    if (
      langameStaffUsers.some((staffUser) =>
        phonesMatch(phone.normalized, normalizePhoneDigits(staffUser.phone)),
      )
    ) {
      return {
        reason: GAME_PROFILE_STAFF_TEST_REASON_LANGAME_STAFF_PHONE,
        matchedAt: new Date(),
      };
    }

    return null;
  }

  private staffTestProfilePatch(match: GuestPortalStaffTestMatch | null) {
    return match
      ? {
          isStaffTest: true,
          staffTestReason: match.reason,
          staffTestMatchedAt: match.matchedAt,
        }
      : {};
  }

  private copyStaffTestProfileData(profile: {
    isStaffTest: boolean;
    staffTestReason: string | null;
    staffTestMatchedAt: Date | null;
  }) {
    return {
      isStaffTest: profile.isStaffTest,
      staffTestReason: profile.staffTestReason,
      staffTestMatchedAt: profile.staffTestMatchedAt,
    };
  }

  private validateTelegramMiniAppInitData(
    value: unknown,
  ): TelegramMiniAppValidationResult {
    if (typeof value !== 'string' || !value.trim()) {
      return {
        ok: false,
        status: 'AUTH_REQUIRED',
        telegramIdentityMasked: null,
        message:
          'Telegram Mini App initData не найден. Откройте экран из Telegram или начните вход через /game/auth.',
      };
    }

    const token = this.telegramMiniAppBotToken();

    if (!token) {
      return {
        ok: false,
        status: 'FAILED',
        telegramIdentityMasked: null,
        message:
          'Telegram Mini App пока не настроен: на сервере нет bot token для проверки initData.',
      };
    }

    const params = new URLSearchParams(value);
    const hash = params.get('hash')?.trim() ?? '';

    if (!hash) {
      return {
        ok: false,
        status: 'FAILED',
        telegramIdentityMasked: null,
        message:
          'Telegram Mini App initData отклонен: подпись Telegram не найдена.',
      };
    }

    const dataCheckString = [...params.entries()]
      .filter(([key]) => key !== 'hash')
      .map(([key, paramValue]) => `${key}=${paramValue}`)
      .sort()
      .join('\n');
    const secret = createHmac('sha256', 'WebAppData').update(token).digest();
    const expectedHash = createHmac('sha256', secret)
      .update(dataCheckString)
      .digest('hex');

    if (!safeCompareHex(hash, expectedHash)) {
      return {
        ok: false,
        status: 'FAILED',
        telegramIdentityMasked: null,
        message:
          'Telegram Mini App initData отклонен: подпись Telegram не прошла проверку.',
      };
    }

    const authDateValue = Number(params.get('auth_date') ?? NaN);

    if (!Number.isFinite(authDateValue) || authDateValue <= 0) {
      return {
        ok: false,
        status: 'FAILED',
        telegramIdentityMasked: null,
        message:
          'Telegram Mini App initData отклонен: дата авторизации не найдена.',
      };
    }

    const ageSeconds = Math.floor(Date.now() / 1000) - authDateValue;

    if (ageSeconds > this.telegramMiniAppInitDataTtlSeconds()) {
      return {
        ok: false,
        status: 'EXPIRED',
        telegramIdentityMasked: null,
        message:
          'Сессия Telegram Mini App устарела. Закройте Mini App и откройте его из Telegram заново.',
      };
    }

    const user = parseTelegramMiniAppUser(params.get('user'));

    if (!user) {
      return {
        ok: false,
        status: 'AUTH_REQUIRED',
        telegramIdentityMasked: null,
        message:
          'Telegram Mini App не передал пользователя. Откройте экран из личного чата с ботом LeetPlus.',
      };
    }

    return {
      ok: true,
      userId: user.id,
      username: user.username,
      authDate: new Date(authDateValue * 1000),
    };
  }

  private validateTelegramMiniAppEdgeAssertion(dto: {
    telegramUserId?: unknown;
    authDate?: unknown;
    edgeSecret?: unknown;
  }): TelegramMiniAppValidationResult {
    const configuredSecret = this.telegramMiniAppEdgeSharedSecret();
    const providedSecret = stringOrNull(dto.edgeSecret);

    if (!configuredSecret || !providedSecret) {
      return {
        ok: false,
        status: 'AUTH_REQUIRED',
        telegramIdentityMasked: null,
        message:
          'Telegram Mini App initData не найден. Откройте экран из Telegram или начните вход через /game/auth.',
      };
    }

    if (!safeCompareText(configuredSecret, providedSecret)) {
      return {
        ok: false,
        status: 'FAILED',
        telegramIdentityMasked: null,
        message:
          'Telegram Mini App edge assertion отклонен: подпись edge VDS не прошла проверку.',
      };
    }

    const userId = telegramUserIdString(dto.telegramUserId);

    if (!userId) {
      return {
        ok: false,
        status: 'FAILED',
        telegramIdentityMasked: null,
        message:
          'Telegram Mini App edge assertion отклонен: Telegram user id не найден.',
      };
    }

    const authDateValue = Number(dto.authDate ?? NaN);

    if (!Number.isFinite(authDateValue) || authDateValue <= 0) {
      return {
        ok: false,
        status: 'FAILED',
        telegramIdentityMasked: maskExternalIdentity(`chat:${userId}`),
        message:
          'Telegram Mini App edge assertion отклонен: дата авторизации не найдена.',
      };
    }

    const ageSeconds = Math.floor(Date.now() / 1000) - authDateValue;

    if (ageSeconds > this.telegramMiniAppInitDataTtlSeconds()) {
      return {
        ok: false,
        status: 'EXPIRED',
        telegramIdentityMasked: maskExternalIdentity(`chat:${userId}`),
        message:
          'Сессия Telegram Mini App устарела. Закройте Mini App и откройте его из Telegram заново.',
      };
    }

    return {
      ok: true,
      userId,
      username: null,
      authDate: new Date(authDateValue * 1000),
    };
  }

  private async findTelegramMiniAppClubs(
    telegramIdentity: string,
  ): Promise<TelegramMiniAppClubCandidate[]> {
    const profiles = await this.prisma.guestGameProfile.findMany({
      where: {
        telegramIdentity,
        status: 'ACTIVE',
        phoneHash: { not: null },
        tenant: { status: TenantLifecycleStatus.ACTIVE },
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        telegramLinkChallenges: {
          where: {
            status: {
              in: [
                'CONSUMED',
                TELEGRAM_AUTH_VERIFIED_STATUS,
                TELEGRAM_AUTH_SESSION_ISSUED_STATUS,
              ],
            },
            store: { isActive: true },
          },
          orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
          take: 5,
          include: {
            store: {
              select: {
                id: true,
                publicSlug: true,
                name: true,
                city: true,
                address: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    const profileByTenantId = new Map<
      (typeof profiles)[number]['tenant']['id'],
      (typeof profiles)[number]
    >();

    for (const profile of profiles) {
      if (!profile.phoneHash || profileByTenantId.has(profile.tenant.id)) {
        continue;
      }

      profileByTenantId.set(profile.tenant.id, profile);
    }

    if (!profileByTenantId.size) {
      return [];
    }

    const stores = await this.prisma.store.findMany({
      where: {
        tenantId: { in: [...profileByTenantId.keys()] },
        isActive: true,
      },
      select: {
        id: true,
        tenantId: true,
        publicSlug: true,
        name: true,
        city: true,
        address: true,
      },
      orderBy: [{ city: 'asc' }, { name: 'asc' }, { address: 'asc' }],
    });
    const directoryStores = stores.length
      ? stores
      : profiles.flatMap((profile) =>
          profile.telegramLinkChallenges.map((challenge) => ({
            ...challenge.store,
            tenantId: profile.tenant.id,
          })),
        );
    const candidates = new Map<string, TelegramMiniAppClubCandidate>();

    for (const store of directoryStores) {
      const profile = profileByTenantId.get(store.tenantId);

      if (!profile?.phoneHash) {
        continue;
      }

      const challenge =
        profile.telegramLinkChallenges.find(
          (item) => item.store.id === store.id,
        ) ?? null;
      const key = `${profile.id}:${store.id}`;

      if (candidates.has(key)) {
        continue;
      }

      candidates.set(key, {
        profile: {
          id: profile.id,
          guestId: profile.guestId,
          phoneHash: profile.phoneHash,
          contactMasked: profile.contactMasked,
          unsubscribedAt: profile.unsubscribedAt,
        },
        tenant: profile.tenant,
        store,
        telegramLinkChallengeId: challenge?.id ?? null,
      });
    }

    return [...candidates.values()];
  }

  private telegramMiniAppBotToken() {
    return configString(
      this.configService,
      'GUEST_GAME_TELEGRAM_MINI_APP_BOT_TOKEN',
      'GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_BOT_TOKEN',
      'GUEST_GAME_TELEGRAM_BOT_TOKEN',
      'TELEGRAM_BOT_TOKEN',
    );
  }

  private telegramMiniAppEdgeSharedSecret() {
    return configString(
      this.configService,
      'GUEST_GAME_TG_EDGE_SHARED_SECRET',
      'GUEST_GAME_TELEGRAM_MINI_APP_EDGE_SECRET',
    );
  }

  private telegramMiniAppInitDataTtlSeconds() {
    const raw = this.configService
      .get<string>('GUEST_GAME_TELEGRAM_MINI_APP_INIT_DATA_TTL_SECONDS')
      ?.trim();
    const parsed = raw ? Number(raw) : NaN;

    return Number.isFinite(parsed) && parsed > 0
      ? Math.floor(parsed)
      : TELEGRAM_MINI_APP_INIT_DATA_TTL_SECONDS;
  }

  private requiredString(value: unknown, label: string) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${label} обязателен.`);
    }

    return value.trim();
  }

  private generateOtp() {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private generateIncomingCallLast4Code() {
    return randomInt(0, 10_000).toString().padStart(4, '0');
  }

  private generateTelegramLinkCode() {
    const raw = randomBytes(5).toString('hex').toUpperCase();
    return `LP-${raw.slice(0, 4)}-${raw.slice(4)}`;
  }

  private hashOtpCode(challengeId: string, code: string) {
    return createHash('sha256')
      .update(`${this.piiSecret()}:${challengeId}:${code}`)
      .digest('hex');
  }

  private hashTelegramLinkCode(code: string) {
    return createHmac('sha256', this.piiSecret())
      .update(`telegram-link:${normalizeTelegramLinkCode(code)}`)
      .digest('hex');
  }

  private telegramBotUsername() {
    return normalizeTelegramBotUsername(
      this.configService.get<string>('GUEST_GAME_TELEGRAM_BOT_USERNAME') ??
        this.configService.get<string>('TELEGRAM_BOT_USERNAME') ??
        null,
    );
  }

  private assertTelegramLinkSecret(secret: string | undefined) {
    const expected = [
      this.configService.get<string>('GUEST_GAME_TELEGRAM_LINK_SECRET'),
      this.configService.get<string>('GUEST_GAME_TELEGRAM_WEBHOOK_SECRET'),
    ]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value));

    if (expected.length === 0) {
      throw new UnauthorizedException(
        'GUEST_GAME_TELEGRAM_LINK_SECRET or GUEST_GAME_TELEGRAM_WEBHOOK_SECRET is not configured',
      );
    }

    if (!secret || !expected.includes(secret.trim())) {
      throw new UnauthorizedException('Invalid Telegram link secret');
    }
  }

  private assertUserCallSecret(secret: string | undefined) {
    const expected = configString(
      this.configService,
      'GUEST_PORTAL_USER_CALL_SECRET',
    );

    if (!expected) {
      throw new UnauthorizedException(
        'GUEST_PORTAL_USER_CALL_SECRET is not configured',
      );
    }

    if (!secret || secret.trim() !== expected) {
      throw new UnauthorizedException('Invalid user call secret');
    }
  }

  private async startUserCallProvider({
    config,
    phone,
  }: {
    config: GuestPortalUserCallConfig;
    phone: GuestPortalPhoneIdentity;
  }): Promise<GuestPortalUserCallProviderStart> {
    if (config.provider === USER_CALL_PROVIDER_SMS_RU_CALLCHECK) {
      return this.startSmsRuCallcheck(config, phone);
    }

    return {
      providerName: USER_CALL_PROVIDER_MANUAL,
      providerChallengeId: null,
      callNumber: config.phoneNumber,
      callHref: config.callHref,
      freeCall: false,
      message:
        'Позвоните на указанный номер с этого телефона. LeetPlus завершит вход после подтверждения входящего вызова провайдером.',
    };
  }

  private async startSmsRuCallcheck(
    config: GuestPortalUserCallConfig,
    phone: GuestPortalPhoneIdentity,
  ): Promise<GuestPortalUserCallProviderStart> {
    if (!config.smsRu.apiId) {
      throw new BadRequestException('Провайдер звонка не настроен.');
    }

    const url = smsRuCallcheckUrl(config.smsRu.baseUrl, 'add', {
      api_id: config.smsRu.apiId,
      phone: phone.normalized,
      json: '1',
    });
    const response = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    const payload = (await safeJson(
      response,
    )) as SmsRuCallcheckAddResponse | null;
    const statusCode = smsRuResponseString(payload?.status_code);
    const checkId = smsRuResponseString(payload?.check_id);
    const callPhone = smsRuResponseString(payload?.call_phone);
    const prettyPhone =
      smsRuResponseString(payload?.call_phone_pretty) || callPhone;

    if (
      !response.ok ||
      payload?.status !== 'OK' ||
      statusCode !== '100' ||
      !checkId ||
      !callPhone
    ) {
      throw new ServiceUnavailableException(
        `Провайдер звонка не выдал номер для звонка: ${
          providerErrorText(payload) || statusCode || response.status
        }`,
      );
    }

    return {
      providerName: USER_CALL_PROVIDER_SMS_RU_CALLCHECK,
      providerChallengeId: checkId,
      callNumber: prettyPhone,
      callHref: phoneTelHref(callPhone),
      freeCall: true,
      message: `Позвоните на номер ${prettyPhone} с этого телефона. Звонок будет сброшен сразу после проверки; номер действует ${SMS_RU_CALLCHECK_TTL_MINUTES} минут.`,
    };
  }

  private async syncUserCallProviderStatus(
    challenge: GuestPortalOtpChallenge,
  ): Promise<{ challenge: GuestPortalOtpChallenge; message?: string }> {
    if (challenge.providerName !== USER_CALL_PROVIDER_SMS_RU_CALLCHECK) {
      return { challenge };
    }

    if (!challenge.providerChallengeId) {
      const failedChallenge = await this.prisma.guestPortalOtpChallenge.update({
        where: { id: challenge.id },
        data: { status: 'FAILED' },
      });

      return {
        challenge: failedChallenge,
        message: 'Идентификатор проверки звонка не найден у call challenge.',
      };
    }

    const config = guestPortalUserCallConfig(this.configService);

    if (
      config.provider !== USER_CALL_PROVIDER_SMS_RU_CALLCHECK ||
      !config.smsRu.apiId
    ) {
      return {
        challenge,
        message:
          'Звонок сейчас не настроен на сервере. Попробуйте другой способ входа.',
      };
    }

    try {
      const providerStatus = await this.readSmsRuCallcheckStatus(
        config,
        challenge.providerChallengeId,
      );

      if (providerStatus === 'CONFIRMED') {
        const confirmedAt = new Date();
        const confirmedChallenge =
          await this.prisma.guestPortalOtpChallenge.update({
            where: { id: challenge.id },
            data: {
              status: USER_CALL_AUTH_CONFIRMED_STATUS,
              deliveredAt: confirmedAt,
              verifiedAt: confirmedAt,
            },
          });

        return { challenge: confirmedChallenge };
      }

      if (providerStatus === 'EXPIRED') {
        const expiredChallenge =
          await this.prisma.guestPortalOtpChallenge.update({
            where: { id: challenge.id },
            data: { status: 'EXPIRED' },
          });

        return {
          challenge: expiredChallenge,
          message: 'Срок ожидания звонка истек.',
        };
      }

      if (providerStatus === 'FAILED') {
        const failedChallenge =
          await this.prisma.guestPortalOtpChallenge.update({
            where: { id: challenge.id },
            data: { status: 'FAILED' },
          });

        return {
          challenge: failedChallenge,
          message: 'Не удалось подтвердить звонок для этого номера.',
        };
      }

      return {
        challenge,
        message:
          'Ожидаем звонок на выданный номер. Страница проверяет статус автоматически.',
      };
    } catch {
      return {
        challenge,
        message:
          'Проверка звонка временно недоступна. Страница повторит запрос автоматически.',
      };
    }
  }

  private async readSmsRuCallcheckStatus(
    config: GuestPortalUserCallConfig,
    checkId: string,
  ): Promise<'PENDING' | 'CONFIRMED' | 'EXPIRED' | 'FAILED'> {
    if (!config.smsRu.apiId) {
      throw new ServiceUnavailableException('Провайдер звонка не настроен.');
    }

    const url = smsRuCallcheckUrl(config.smsRu.baseUrl, 'status', {
      api_id: config.smsRu.apiId,
      check_id: checkId,
      json: '1',
    });
    const response = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    const payload = (await safeJson(
      response,
    )) as SmsRuCallcheckStatusResponse | null;
    const statusCode = smsRuResponseString(payload?.status_code);
    const checkStatus = smsRuResponseString(payload?.check_status);

    if (!response.ok || payload?.status !== 'OK') {
      throw new ServiceUnavailableException(
        `Проверка звонка у провайдера не удалась: ${
          providerErrorText(payload) || statusCode || response.status
        }`,
      );
    }

    switch (checkStatus || statusCode) {
      case '401':
        return 'CONFIRMED';
      case '400':
        return 'PENDING';
      case '402':
        return 'EXPIRED';
      case '202':
        return 'FAILED';
      default:
        return 'FAILED';
    }
  }

  private isDevOtpEnabled() {
    return (
      this.configService.get<string>('GUEST_PORTAL_DEV_OTP_ENABLED') ===
        'true' || this.configService.get<string>('NODE_ENV') !== 'production'
    );
  }

  private async deliverOtpCode(input: {
    code: string;
    context: TenantStoreContext;
    phone: GuestPortalPhoneIdentity;
    profile: {
      id: string;
      telegramIdentity: string | null;
      maxIdentity: string | null;
      phoneConsentStatus: GuestCommunicationConsentStatus;
      unsubscribedAt: Date | null;
    } | null;
    guest: {
      id: string;
      phoneConsentStatus: GuestCommunicationConsentStatus;
      unsubscribedAt: Date | null;
    } | null;
  }): Promise<GuestPortalOtpDeliveryResult> {
    if (this.isDevOtpEnabled()) {
      return {
        channel: 'DEV',
        status: 'DEV_CODE',
        deliveredAt: new Date(),
        devCode: input.code,
        message:
          'Demo-код показан на странице, потому что включен dev/demo OTP-режим.',
      };
    }

    const config = guestPortalOtpDeliveryConfig(this.configService);

    if (!config.realSendEnabled) {
      return {
        channel: 'DEV',
        status: 'NOT_CONFIGURED',
        deliveredAt: null,
        message:
          'OTP-доставка в production не включена. Нужен SMS/Telegram/MAX provider.',
        requiredEnv: ['GUEST_PORTAL_OTP_REAL_SEND_ENABLED'],
      };
    }

    if (config.sms.enabled) {
      if (config.sms.smsRu.apiId) {
        if (otpSmsRuLiveCanaryRequired(config)) {
          return {
            channel: 'SMS',
            status: 'BLOCKED',
            deliveredAt: null,
            message:
              'SMS-код в live-режиме ожидает controlled canary. Включите test-mode или отдельный canary-флаг перед реальной отправкой.',
            requiredEnv: otpSmsRequiredEnv(config),
          };
        }

        try {
          const payload = await sendSmsRuOtpDelivery({
            apiId: config.sms.smsRu.apiId,
            baseUrl: config.sms.smsRu.baseUrl,
            phone: input.phone.normalized,
            text: otpMessage(input.code, input.context),
            ttlMinutes: OTP_TTL_MINUTES,
            testMode: config.sms.smsRu.testMode,
          });

          return {
            channel: 'SMS',
            status: 'SENT',
            deliveredAt: new Date(),
            message: `Код отправлен по SMS на ${input.phone.masked}.`,
            note: deliveryProviderNote(payload),
          };
        } catch (error) {
          return failedOtpDelivery('SMS', error);
        }
      }

      if (config.sms.endpoint && config.sms.token) {
        try {
          const payload = await sendHttpOtpDelivery({
            endpoint: config.sms.endpoint,
            token: config.sms.token,
            body: {
              channel: 'SMS',
              phone: input.phone.normalized,
              phoneMasked: input.phone.masked,
              text: otpMessage(input.code, input.context),
              purpose: 'guest_portal_otp',
            },
          });

          return {
            channel: 'SMS',
            status: 'SENT',
            deliveredAt: new Date(),
            message: `Код отправлен по SMS на ${input.phone.masked}.`,
            note: deliveryProviderNote(payload),
          };
        } catch (error) {
          return failedOtpDelivery('SMS', error);
        }
      }

      return {
        channel: 'SMS',
        status: 'NOT_CONFIGURED',
        deliveredAt: null,
        message:
          'SMS OTP включен, но SMS.ru api_id или endpoint/token не настроены.',
        requiredEnv: otpSmsRequiredEnv(config),
      };
    }

    const telegramChatId = telegramChatIdFromIdentity(
      input.profile?.telegramIdentity ?? null,
    );

    if (config.telegram.enabled) {
      if (input.guest?.unsubscribedAt || input.profile?.unsubscribedAt) {
        return {
          channel: 'TELEGRAM',
          status: 'BLOCKED',
          deliveredAt: null,
          message:
            'Гость отписан от коммуникаций; OTP через Telegram заблокирован.',
          note: 'Для входа нужен SMS-provider или ручная проверка в клубе.',
        };
      }

      if (config.telegram.token && telegramChatId) {
        try {
          const payload = await sendTelegramOtpDelivery({
            token: config.telegram.token,
            chatId: telegramChatId,
            text: otpMessage(input.code, input.context),
          });

          return {
            channel: 'TELEGRAM',
            status: 'SENT',
            deliveredAt: new Date(),
            message: 'Код отправлен в подтвержденный Telegram-чат гостя.',
            identityMasked: maskExternalIdentity(
              input.profile?.telegramIdentity ?? null,
            ),
            note: deliveryProviderNote(payload),
          };
        } catch (error) {
          return failedOtpDelivery('TELEGRAM', error);
        }
      }

      return {
        channel: 'TELEGRAM',
        status: 'BLOCKED',
        deliveredAt: null,
        message:
          'Telegram OTP включен, но у гостя нет подтвержденного numeric chat_id.',
        note: 'Гость должен один раз привязать Telegram-бота через гостевой кабинет.',
        requiredEnv: ['GUEST_GAME_TELEGRAM_BOT_TOKEN'],
      };
    }

    if (config.max.enabled) {
      if (input.guest?.unsubscribedAt || input.profile?.unsubscribedAt) {
        return {
          channel: 'MAX',
          status: 'BLOCKED',
          deliveredAt: null,
          message: 'Гость отписан от коммуникаций; OTP через MAX заблокирован.',
          note: 'Для входа нужен SMS-provider или ручная проверка в клубе.',
        };
      }

      if (
        config.max.endpoint &&
        config.max.token &&
        input.profile?.maxIdentity
      ) {
        try {
          const payload = await sendHttpOtpDelivery({
            endpoint: config.max.endpoint,
            token: config.max.token,
            body: {
              channel: 'MAX',
              identity: input.profile.maxIdentity,
              identityMasked: maskExternalIdentity(input.profile.maxIdentity),
              text: otpMessage(input.code, input.context),
              purpose: 'guest_portal_otp',
            },
          });

          return {
            channel: 'MAX',
            status: 'SENT',
            deliveredAt: new Date(),
            message: 'Код отправлен в подтвержденный MAX-канал гостя.',
            identityMasked: maskExternalIdentity(input.profile.maxIdentity),
            note: deliveryProviderNote(payload),
          };
        } catch (error) {
          return failedOtpDelivery('MAX', error);
        }
      }

      return {
        channel: 'MAX',
        status: 'NOT_CONFIGURED',
        deliveredAt: null,
        message:
          'MAX OTP включен, но нет подтвержденного identity или provider-настроек.',
        requiredEnv: [
          'GUEST_PORTAL_OTP_MAX_ENDPOINT',
          'GUEST_PORTAL_OTP_MAX_TOKEN',
        ],
      };
    }

    return {
      channel: 'DEV',
      status: 'NOT_CONFIGURED',
      deliveredAt: null,
      message:
        'OTP-доставка не настроена: включите SMS, Telegram или MAX provider.',
      requiredEnv: [
        'GUEST_PORTAL_OTP_SMS_ENABLED',
        'GUEST_PORTAL_OTP_TELEGRAM_ENABLED',
        'GUEST_PORTAL_OTP_MAX_ENABLED',
      ],
    };
  }

  private async assertSmsOtpRateLimit(input: {
    tenantId: string;
    storeId: string;
    phoneHash: string;
    now: Date;
  }) {
    const config = guestPortalOtpSmsRateLimitConfig(this.configService);

    if (config.phoneMax > 0 && config.phoneWindowMinutes > 0) {
      const phoneWindowStart = new Date(
        input.now.getTime() - config.phoneWindowMinutes * 60 * 1000,
      );
      const phoneCount = await this.prisma.guestPortalOtpChallenge.count({
        where: {
          tenantId: input.tenantId,
          phoneHash: input.phoneHash,
          deliveryChannel: 'SMS',
          createdAt: { gte: phoneWindowStart },
        },
      });

      if (phoneCount >= config.phoneMax) {
        throw new HttpException(
          'Слишком много попыток. Попробуйте позже.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    if (config.storeMax > 0 && config.storeWindowMinutes > 0) {
      const storeWindowStart = new Date(
        input.now.getTime() - config.storeWindowMinutes * 60 * 1000,
      );
      const storeCount = await this.prisma.guestPortalOtpChallenge.count({
        where: {
          tenantId: input.tenantId,
          storeId: input.storeId,
          deliveryChannel: 'SMS',
          createdAt: { gte: storeWindowStart },
        },
      });

      if (storeCount >= config.storeMax) {
        throw new HttpException(
          'Слишком много попыток. Попробуйте позже.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    if (config.tenantMax > 0 && config.tenantWindowMinutes > 0) {
      const tenantWindowStart = new Date(
        input.now.getTime() - config.tenantWindowMinutes * 60 * 1000,
      );
      const tenantCount = await this.prisma.guestPortalOtpChallenge.count({
        where: {
          tenantId: input.tenantId,
          deliveryChannel: 'SMS',
          createdAt: { gte: tenantWindowStart },
        },
      });

      if (tenantCount >= config.tenantMax) {
        throw new HttpException(
          'Слишком много попыток. Попробуйте позже.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  private async deliverIncomingCallLast4(input: {
    code: string;
    context: TenantStoreContext;
    phone: GuestPortalPhoneIdentity;
    profile: {
      id: string;
      telegramIdentity: string | null;
      maxIdentity: string | null;
      phoneConsentStatus: GuestCommunicationConsentStatus;
      unsubscribedAt: Date | null;
    } | null;
    guest: {
      id: string;
      phoneConsentStatus: GuestCommunicationConsentStatus;
      unsubscribedAt: Date | null;
    } | null;
  }): Promise<GuestPortalIncomingCallLast4DeliveryResult> {
    if (this.isDevOtpEnabled()) {
      return {
        status: 'DEV_CODE',
        deliveredAt: new Date(),
        devCode: input.code,
        message:
          'Demo-код входящего звонка показан на странице: введите последние 4 цифры.',
      };
    }

    if (input.guest?.unsubscribedAt || input.profile?.unsubscribedAt) {
      return {
        status: 'BLOCKED',
        deliveredAt: null,
        message:
          'Гость отписан от коммуникаций; входящий звонок с кодом заблокирован.',
        note: 'Используйте Telegram contact-share или звонок пользователя на номер.',
      };
    }

    const config = guestPortalIncomingCallLast4Config(this.configService);

    if (!config.enabled) {
      return {
        status: 'NOT_CONFIGURED',
        deliveredAt: null,
        message: 'Входящий звонок с последними 4 цифрами пока не включен.',
        requiredEnv: ['GUEST_PORTAL_INCOMING_CALL_LAST4_ENABLED'],
      };
    }

    if (!config.endpoint || !config.token) {
      return {
        status: 'NOT_CONFIGURED',
        deliveredAt: null,
        message:
          'Канал входящего звонка включен, но provider endpoint или token не настроены.',
        requiredEnv: [
          'GUEST_PORTAL_INCOMING_CALL_LAST4_ENDPOINT',
          'GUEST_PORTAL_INCOMING_CALL_LAST4_TOKEN',
        ],
      };
    }

    try {
      const payload = await sendHttpOtpDelivery({
        endpoint: config.endpoint,
        token: config.token,
        body: {
          channel: INCOMING_CALL_LAST4_CHANNEL,
          phone: input.phone.normalized,
          phoneMasked: input.phone.masked,
          codeLast4: input.code,
          purpose: 'guest_portal_incoming_call_last4',
          ttlMinutes: OTP_TTL_MINUTES,
          tenantSlug: input.context.tenant.slug,
          storeId: input.context.store.id,
          storeName: input.context.store.name,
        },
      });

      return {
        status: 'SENT',
        deliveredAt: new Date(),
        message:
          'Сейчас поступит входящий звонок. Введите последние 4 цифры номера, с которого звонят.',
        note: deliveryProviderNote(payload),
      };
    } catch (error) {
      return {
        status: 'FAILED',
        deliveredAt: null,
        message: 'Provider входящего звонка не смог создать звонок с кодом.',
        note: safeDeliveryErrorMessage(error),
      };
    }
  }

  private piiSecret() {
    const secret =
      this.configService.get<string>('APP_ENCRYPTION_KEY')?.trim() ||
      this.configService.get<string>('JWT_SECRET')?.trim();

    if (!secret) {
      throw new BadRequestException('APP_ENCRYPTION_KEY is not configured');
    }

    return secret;
  }

  private referralSecret() {
    return (
      this.configService.get<string>('GUEST_GAME_REFERRAL_SECRET')?.trim() ||
      this.configService.get<string>('JWT_SECRET')?.trim() ||
      this.configService.get<string>('APP_ENCRYPTION_KEY')?.trim() ||
      'guest-game-referral-local-secret'
    );
  }

  private publicWebUrl() {
    return (
      this.configService.get<string>('WEB_URL')?.trim() ||
      this.configService.get<string>('FRONTEND_URL')?.trim() ||
      this.configService.get<string>('NEXT_PUBLIC_WEB_URL')?.trim() ||
      'http://localhost:3000'
    );
  }

  private telegramMiniAppUrl(tab?: TelegramMiniAppTab) {
    const configured = this.configService
      .get<string>('GUEST_GAME_TELEGRAM_MINI_APP_URL')
      ?.trim();
    const baseUrl =
      configured || `${this.publicWebUrl().replace(/\/$/, '')}/game/app`;

    if (!tab) {
      return baseUrl;
    }

    const separator = baseUrl.includes('?') ? '&' : '?';

    return `${baseUrl}${separator}tab=${encodeURIComponent(tab)}`;
  }
}

function telegramBotReplyText(
  command: TelegramBotCommand,
  portal: GuestPortalPayload,
  unsubscribedAt: Date | null,
) {
  switch (command) {
    case 'PROFILE':
      return telegramBotProfileText(portal, unsubscribedAt);
    case 'QUESTS':
      return telegramBotQuestsText(portal);
    case 'REWARDS':
      return telegramBotRewardsText(portal);
    case 'CHECK_IN':
      return telegramBotCheckInText(portal);
    default:
      return telegramBotMenuText(portal, unsubscribedAt);
  }
}

function telegramBotMenuText(
  portal: GuestPortalPayload,
  unsubscribedAt: Date | null,
) {
  const nextAction = portal.gamification.nextActions[0] ?? null;
  const mission = telegramBotFeaturedMissions(portal.gamification.missions)[0];
  const summary = portal.gamification.rewardSummary;
  const lines = [
    'LeetPlus bot: игровое меню.',
    `Клуб: ${portal.store.name}.`,
    `Прогресс: ${formatTelegramBotInteger(portal.profile.xp)} XP, уровень ${formatTelegramBotInteger(portal.profile.level)}.`,
    `Баланс: ${formatTelegramBotMoney(portal.loyalty.balance)}; бонусы: ${formatTelegramBotBalance(portal.loyalty.bonusBalance)}.`,
    telegramBotBalanceSyncedLine(portal),
    nextAction
      ? `Ближайшее действие: ${nextAction.title} (${nextAction.statusLabel}).`
      : mission
        ? telegramBotMissionLine(mission)
        : 'Ближайшее действие: откройте Mini App и проверьте клубную карту.',
    `Награды: готово ${formatTelegramBotInteger(summary.ready)}, на проверке ${formatTelegramBotInteger(summary.waitingApproval)}, получено ${formatTelegramBotInteger(summary.redeemed)}.`,
    unsubscribedAt || portal.communications.phone.unsubscribedAt
      ? 'Уведомления: отключены. Игровой статус доступен, новые Telegram-доставки заблокированы.'
      : 'Уведомления: включены для подтвержденных игровых доставок.',
    'Выберите раздел кнопками ниже.',
  ];

  return lines.join('\n');
}

function telegramBotProfileText(
  portal: GuestPortalPayload,
  unsubscribedAt: Date | null,
) {
  const phone =
    portal.communications.phone.masked ?? portal.profile.contactMasked;
  const lines = [
    'Профиль LeetPlus',
    `Клуб: ${portal.store.name}.`,
    `Уровень: ${formatTelegramBotInteger(portal.profile.level)}.`,
    `XP: ${formatTelegramBotInteger(portal.profile.xp)} из ${formatTelegramBotInteger(portal.profile.nextLevelXp)}.`,
    `Баланс: ${formatTelegramBotMoney(portal.loyalty.balance)}.`,
    `Бонусные баллы: ${formatTelegramBotBalance(portal.loyalty.bonusBalance)}.`,
    telegramBotBalanceSyncedLine(portal),
    `Телефон: ${phone ?? 'скрыт'}.`,
    `Согласие: ${telegramBotConsentLabel(portal.communications.phone.consentStatus)}.`,
    `Telegram: ${telegramBotCommunicationLabel(portal.communications.telegram.status)}.`,
    unsubscribedAt || portal.communications.phone.unsubscribedAt
      ? 'Уведомления: отключены.'
      : 'Уведомления: активны.',
  ];

  return lines.join('\n');
}

function telegramBotQuestsText(portal: GuestPortalPayload) {
  const missions = telegramBotFeaturedMissions(portal.gamification.missions);

  if (!missions.length) {
    return [
      'Квесты LeetPlus',
      `Клуб: ${portal.store.name}.`,
      'Активных квестов сейчас нет. Новые задания появятся в Mini App после публикации клубом.',
    ].join('\n');
  }

  return [
    'Квесты LeetPlus',
    `Клуб: ${portal.store.name}.`,
    ...missions
      .slice(0, 4)
      .map((mission) => telegramBotMissionDetailLine(mission)),
    'Полные условия и шаги открываются в Mini App.',
  ].join('\n');
}

function telegramBotRewardsText(portal: GuestPortalPayload) {
  const summary = portal.gamification.rewardSummary;
  const rewards = telegramBotFeaturedRewards(portal.gamification.rewards);
  const bonus = portal.gamification.bonusHistory.items[0] ?? null;
  const lines = [
    'Награды LeetPlus',
    `Готово: ${formatTelegramBotInteger(summary.ready)}. На проверке: ${formatTelegramBotInteger(summary.waitingApproval)}. Получено: ${formatTelegramBotInteger(summary.redeemed)}. Истекло: ${formatTelegramBotInteger(summary.expired)}.`,
    rewards.length
      ? 'Последние награды:'
      : 'Наград пока нет. Выполняйте квесты, и они появятся здесь.',
    ...rewards.slice(0, 4).map((reward) => telegramBotRewardLine(reward)),
    bonus
      ? `Последнее начисление: ${formatTelegramBotInteger(bonus.amount)} бонусов, ${bonus.statusLabel.toLowerCase()}.`
      : null,
    'Коды, claim payload и история выдачи доступны только в защищенном Mini App.',
  ].filter((line): line is string => Boolean(line));

  return lines.join('\n');
}

function telegramBotCheckInText(portal: GuestPortalPayload) {
  const action =
    portal.gamification.nextActions.find((item) => item.kind === 'CHECK_IN') ??
    null;
  const mission = portal.gamification.missions.find(
    (item) =>
      item.missionType === 'CHECK_IN' &&
      item.rewardStatus.state === 'IN_PROGRESS',
  );

  if (!action && !mission) {
    return [
      'Чекин LeetPlus',
      `Клуб: ${portal.store.name}.`,
      'Сейчас чекин для этого клуба недоступен.',
      'Проверьте активные квесты или откройте Mini App позже.',
    ].join('\n');
  }

  const reward = mission?.rewardLabel ?? action?.description ?? null;
  const progress =
    mission && mission.progressTarget
      ? `${formatTelegramBotInteger(mission.progressCurrent)}/${formatTelegramBotInteger(mission.progressTarget)}${mission.progressUnit ? ` ${mission.progressUnit}` : ''}`
      : action?.statusLabel;

  return [
    'Чекин LeetPlus',
    `Клуб: ${portal.store.name}.`,
    action?.title ?? mission?.name ?? 'Чекин доступен.',
    reward ? `Награда/условие: ${reward}` : null,
    progress ? `Прогресс: ${progress}.` : null,
    'Откройте Mini App или игровой экран, чтобы выполнить чекин в подтвержденном клубном контексте.',
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');
}

function telegramBotFallbackReplyText(
  command: TelegramBotCommand,
  input: {
    clubName: string | null;
    contactMasked: string | null;
    level: number;
    mission: {
      name: string;
      xpReward: number;
      progressTarget: number | null;
      progressUnit: string | null;
    } | null;
    phoneConsentAt: Date | null;
    phoneConsentStatus: string | null;
    unsubscribedAt: Date | null;
    xp: number;
  },
) {
  const lines = [
    telegramBotTitle(command),
    input.clubName
      ? `Клуб: ${input.clubName}.`
      : 'Клуб: выберите клуб на сайте или в Mini App.',
    `Прогресс: ${formatTelegramBotInteger(input.xp)} XP, уровень ${formatTelegramBotInteger(input.level)}.`,
  ];

  if (command === 'PROFILE') {
    lines.push(`Телефон: ${input.contactMasked ?? 'скрыт'}.`);
    lines.push(
      `Согласие: ${telegramBotConsentLabel(input.phoneConsentStatus)}${
        input.phoneConsentAt ? '' : ' (дата не найдена)'
      }.`,
    );
  }

  if (command === 'QUESTS' || command === 'MENU') {
    lines.push(
      input.clubName
        ? input.mission
          ? telegramBotMissionLine(input.mission)
          : 'Квесты: активных заданий сейчас нет.'
        : 'Квесты появятся после выбора клуба.',
    );
  }

  if (command === 'REWARDS') {
    lines.push(
      'Награды: откройте Mini App, чтобы увидеть готовые, ожидающие проверки и полученные награды.',
    );
  }

  if (command === 'CHECK_IN') {
    lines.push(
      'Чекин появится после выбора клуба с доступным check-in квестом.',
    );
  }

  if (input.unsubscribedAt) {
    lines.push(
      'Уведомления: отключены. Игровой статус доступен, новые Telegram-доставки заблокированы.',
    );
  }

  lines.push('Действия доступны кнопками ниже.');

  return lines.join('\n');
}

function telegramBotAction(
  command: TelegramBotCommand,
): GuestPortalTelegramWebhookResponse['action'] {
  switch (command) {
    case 'PROFILE':
      return 'TELEGRAM_BOT_PROFILE';
    case 'QUESTS':
      return 'TELEGRAM_BOT_QUESTS';
    case 'REWARDS':
      return 'TELEGRAM_BOT_REWARDS';
    case 'CHECK_IN':
      return 'TELEGRAM_BOT_CHECK_IN';
    case 'CLUBS':
      return 'TELEGRAM_BOT_CITIES';
    case 'HELP':
      return 'TELEGRAM_BOT_HELP';
    default:
      return 'TELEGRAM_BOT_MENU';
  }
}

function telegramBotMiniAppTab(
  command: TelegramBotCommand,
): TelegramMiniAppTab | undefined {
  switch (command) {
    case 'PROFILE':
      return 'profile';
    case 'QUESTS':
      return 'quests';
    case 'REWARDS':
      return 'rewards';
    default:
      return undefined;
  }
}

function telegramBotTitle(command: TelegramBotCommand) {
  switch (command) {
    case 'PROFILE':
      return 'Профиль LeetPlus';
    case 'QUESTS':
      return 'Квесты LeetPlus';
    case 'REWARDS':
      return 'Награды LeetPlus';
    case 'CHECK_IN':
      return 'Чекин LeetPlus';
    case 'CLUBS':
      return 'Клубы LeetPlus';
    default:
      return 'LeetPlus bot: игровое меню.';
  }
}

function telegramBotCitySelectionText(cityGroups: TelegramBotCityGroup[]) {
  if (!cityGroups.length) {
    return [
      'Клубы LeetPlus',
      'Для этого Telegram пока нет подтвержденных игровых клубов.',
      'Откройте сайт LeetPlus, выберите клуб и нажмите "Войти через Telegram".',
    ].join('\n');
  }

  const visibleGroups = cityGroups.slice(0, 8);
  const lines = [
    'Клубы LeetPlus',
    'Выберите город, в котором есть подключенные клубы.',
    ...visibleGroups.map(
      (group, index) => `${index + 1}. ${telegramBotCityChoiceLabel(group)}`,
    ),
  ];

  if (cityGroups.length > visibleGroups.length) {
    lines.push(
      `Показаны первые ${formatTelegramBotInteger(
        visibleGroups.length,
      )} городов. Остальные доступны на сайте или в Mini App.`,
    );
  }

  return lines.join('\n');
}

function telegramBotClubSelectionText(
  candidates: TelegramMiniAppClubCandidate[],
  city: string,
) {
  if (!candidates.length) {
    return [
      'Клубы LeetPlus',
      `Город: ${city}.`,
      'В этом городе нет доступных клубов для вашего Telegram-профиля.',
      'Вернитесь к выбору города или откройте Mini App.',
    ].join('\n');
  }

  const visibleCandidates = candidates.slice(0, 8);
  const lines = [
    'Клубы LeetPlus',
    `Город: ${city}.`,
    'Выберите клуб кнопкой ниже.',
    ...visibleCandidates.map(
      (candidate, index) =>
        `${index + 1}. ${telegramBotClubChoiceLabel(candidate)}`,
    ),
  ];

  if (candidates.length > visibleCandidates.length) {
    lines.push(
      `Показаны первые ${formatTelegramBotInteger(
        visibleCandidates.length,
      )} клубов. Остальные доступны на сайте или в Mini App.`,
    );
  }

  return lines.join('\n');
}

function telegramBotCityChoiceLabel(group: TelegramBotCityGroup) {
  return `${group.city} (${formatTelegramBotInteger(group.candidates.length)} ${telegramBotClubCountLabel(group.candidates.length)})`;
}

function telegramBotCityGroups(
  candidates: TelegramMiniAppClubCandidate[],
): TelegramBotCityGroup[] {
  const groups = new Map<string, TelegramMiniAppClubCandidate[]>();

  for (const candidate of candidates) {
    const city =
      publicStoreCity(candidate.store.city, candidate.store.address) ??
      'Город не указан';
    const items = groups.get(city) ?? [];
    items.push(candidate);
    groups.set(city, items);
  }

  return [...groups.entries()]
    .map(([city, groupCandidates]) => ({
      city,
      candidates: groupCandidates.sort(telegramBotCandidateSort),
    }))
    .sort((left, right) => left.city.localeCompare(right.city, 'ru'));
}

function telegramBotCandidateSort(
  left: TelegramMiniAppClubCandidate,
  right: TelegramMiniAppClubCandidate,
) {
  return (
    left.store.name.localeCompare(right.store.name, 'ru') ||
    (left.store.address ?? '').localeCompare(right.store.address ?? '', 'ru')
  );
}

function telegramBotClubCountLabel(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return 'клуб';
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return 'клуба';
  }

  return 'клубов';
}

function telegramBotClubChoiceLabel(candidate: TelegramMiniAppClubCandidate) {
  const address = candidate.store.address?.trim();
  const tenant =
    candidate.tenant.name.trim() &&
    candidate.tenant.name.trim() !== candidate.store.name.trim()
      ? ` · ${candidate.tenant.name.trim()}`
      : '';

  return `${candidate.store.name}${address ? `, ${address}` : tenant}`;
}

function telegramBotFeaturedMissions(missions: GuestPortalMission[]) {
  return missions.slice().sort((left, right) => {
    const leftDone = left.progressPercent >= 100 ? 1 : 0;
    const rightDone = right.progressPercent >= 100 ? 1 : 0;

    if (leftDone !== rightDone) {
      return leftDone - rightDone;
    }

    return (
      right.progressPercent - left.progressPercent ||
      telegramBotDateMs(left.periodTo) - telegramBotDateMs(right.periodTo)
    );
  });
}

function telegramBotFeaturedRewards(rewards: GuestPortalReward[]) {
  const rank: Record<GuestPortalReward['walletState'], number> = {
    READY: 0,
    WAITING_APPROVAL: 1,
    REDEEMED: 2,
    EXPIRED: 3,
    CANCELED: 4,
  };

  return rewards.slice().sort((left, right) => {
    const stateRank = rank[left.walletState] - rank[right.walletState];

    if (stateRank !== 0) {
      return stateRank;
    }

    return Date.parse(right.qualifiedAt) - Date.parse(left.qualifiedAt);
  });
}

function telegramBotMissionDetailLine(mission: GuestPortalMission) {
  const target = mission.progressTarget ?? 1;
  const unit = mission.progressUnit ? ` ${mission.progressUnit}` : '';
  const progress = `${formatTelegramBotInteger(mission.progressCurrent)}/${formatTelegramBotInteger(target)}${unit}`;
  const xp =
    mission.xpReward > 0
      ? `, +${formatTelegramBotInteger(mission.xpReward)} XP`
      : '';
  const deadline = mission.periodTo
    ? `, до ${formatTelegramBotDate(mission.periodTo)}`
    : '';
  const reward = mission.rewardLabel ? `, награда: ${mission.rewardLabel}` : '';

  return `- ${mission.name}: ${progress}, ${formatTelegramBotInteger(mission.progressPercent)}%${xp}${reward}${deadline}. ${mission.rewardStatus.label}.`;
}

function telegramBotRewardLine(reward: GuestPortalReward) {
  const source = reward.sourceLabel ? `, источник: ${reward.sourceLabel}` : '';
  const expires = reward.expiresAt
    ? `, до ${formatTelegramBotDate(reward.expiresAt)}`
    : '';

  return `- ${reward.rewardLabel}: ${telegramBotRewardStateLabel(reward.walletState)}${source}${expires}.`;
}

function telegramBotConsentLabel(status: string | null) {
  switch (status) {
    case 'GRANTED':
      return 'подтверждено';
    case 'DENIED':
      return 'отклонено';
    case 'UNSUBSCRIBED':
      return 'отписка';
    default:
      return 'не подтверждено';
  }
}

function telegramBotCommunicationLabel(
  status: GuestPortalCommunicationChannel['status'],
) {
  switch (status) {
    case 'READY':
      return 'готов к наградам';
    case 'CONNECTED_NO_CONSENT':
      return 'подключен, нужно согласие';
    case 'UNSUBSCRIBED':
      return 'отписка';
    default:
      return 'не подключен';
  }
}

function telegramBotRewardStateLabel(state: GuestPortalReward['walletState']) {
  switch (state) {
    case 'READY':
      return 'готово';
    case 'WAITING_APPROVAL':
      return 'на проверке';
    case 'REDEEMED':
      return 'получено';
    case 'EXPIRED':
      return 'истекло';
    default:
      return 'отменено';
  }
}

function telegramBotDateMs(value: string | null) {
  return value
    ? Date.parse(value) || Number.POSITIVE_INFINITY
    : Number.POSITIVE_INFINITY;
}

function formatTelegramBotDate(value: string) {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: 'short',
    }).format(new Date(value));
  } catch {
    return 'без срока';
  }
}

function buildGameSummaryFromPortal(
  portal: GuestPortalPayload,
  options: {
    referralSecret: string;
    webUrl: string;
    referralStats: GuestPortalReferralStats;
  },
): GuestPortalGameSummary {
  const recentRewards = [...portal.gamification.rewards]
    .sort(
      (left, right) =>
        Date.parse(right.qualifiedAt) - Date.parse(left.qualifiedAt),
    )
    .slice(0, 50)
    .map((reward) => ({
      id: reward.id,
      walletState: reward.walletState,
      rewardType: reward.rewardType,
      rewardAmount: reward.rewardAmount,
      rewardLabel: reward.rewardLabel,
      rewardRarity: reward.rewardRarity,
      rewardRarityLabel: reward.rewardRarityLabel,
      rewardDropChance: reward.rewardDropChance,
      sourceId: reward.sourceId,
      sourceKind: reward.sourceKind,
      sourceLabel: reward.sourceLabel,
      rewardCode: reward.rewardCode,
      claimPayload: reward.claimPayload,
      qualifiedAt: reward.qualifiedAt,
      expiresAt: reward.expiresAt,
    }));
  const featuredLootBoxes = [...portal.gamification.lootBoxes]
    .sort((left, right) => {
      if (left.latestReward && !right.latestReward) {
        return -1;
      }
      if (!left.latestReward && right.latestReward) {
        return 1;
      }

      return right.readyRewards - left.readyRewards;
    })
    .slice(0, 3)
    .map((lootBox) => ({
      id: lootBox.id,
      name: lootBox.name,
      triggerKind: lootBox.triggerKind,
      rewardLabel: lootBox.rewardLabel,
      rewardType: lootBox.rewardType,
      openState: lootBox.openState,
      openable: lootBox.openable,
      openBlocker: lootBox.openBlocker,
      weeklyOpenedCount: lootBox.weeklyOpenedCount,
      weeklyLimit: lootBox.weeklyLimit,
      dailyOpenedCount: lootBox.dailyOpenedCount,
      dailyLimit: lootBox.dailyLimit,
      openedCount: lootBox.openedCount,
      readyRewards: lootBox.readyRewards,
      waitingApprovalRewards: lootBox.waitingApprovalRewards,
      redeemedRewards: lootBox.redeemedRewards,
      latestReward: lootBox.latestReward,
    }));
  const featuredMissions = [...portal.gamification.missions]
    .sort((left, right) => right.progressPercent - left.progressPercent)
    .slice(0, GAME_SUMMARY_MISSION_LIMIT)
    .map(mapGameSummaryMission);
  const missionHistory = [...portal.gamification.missions]
    .sort(missionHistorySort)
    .slice(0, GAME_SUMMARY_MISSION_HISTORY_LIMIT)
    .map(mapGameSummaryMission);
  const activeSeason = portal.gamification.seasons[0] ?? null;
  const progress = buildGameProgressSummary(portal, recentRewards);
  const journey = buildGameJourney(portal, progress);

  return {
    generatedAt: new Date().toISOString(),
    tenant: portal.tenant,
    store: portal.store,
    profile: portal.profile,
    referral: buildGameReferral(portal, options),
    account: {
      guestFound: portal.guestFound,
      state: portal.guestSnapshot.participation.accountState,
      stateLabel: portal.guestSnapshot.participation.accountStateLabel,
      readinessPercent: portal.guestSnapshot.participation.readinessPercent,
      langameLinked:
        portal.guestSnapshot.participation.accountState === 'LANGAME_SYNCED',
    },
    loyalty: {
      groupName: portal.loyalty.groupName,
      discountPercent: portal.loyalty.discountPercent,
      bonusBalance: portal.loyalty.bonusBalance,
      bonusBalanceSource: portal.loyalty.bonusBalanceSource,
      bonusBalanceSyncedAt: portal.loyalty.bonusBalanceSyncedAt,
    },
    rewards: {
      summary: portal.gamification.rewardSummary,
      ready: portal.gamification.rewards
        .filter((reward) => reward.walletState === 'READY')
        .slice(0, 5),
      recent: recentRewards,
      latestBonus: portal.gamification.bonusHistory.items[0] ?? null,
      bonusHistory: {
        summary: portal.gamification.bonusHistory.summary,
        items: portal.gamification.bonusHistory.items.slice(0, 5),
      },
    },
    lootBoxes: {
      total: portal.gamification.lootBoxes.length,
      featured: featuredLootBoxes,
    },
    promoCards: {
      total: portal.gamification.promoCards.length,
      featured: portal.gamification.promoCards.slice(0, 3),
    },
    missions: {
      total: portal.gamification.missions.length,
      featured: featuredMissions,
      history: missionHistory,
    },
    battlePass: {
      active: activeSeason
        ? {
            id: activeSeason.id,
            name: activeSeason.name,
            currentLevel: activeSeason.currentLevel,
            nextLevel: activeSeason.nextLevel,
            progressPercent: activeSeason.progressPercent,
            xpToNextLevel: activeSeason.xpToNextLevel,
            nextRewardLabel: activeSeason.nextRewardLabel,
            readyRewards: activeSeason.readyRewards,
            waitingApprovalRewards: activeSeason.waitingApprovalRewards,
            levels: featuredSeasonLevels(activeSeason.levels),
          }
        : null,
    },
    progress,
    journey,
    nextActions: portal.gamification.nextActions.slice(0, 5),
    activity: {
      sessionsCount: portal.activity.summary.sessionsCount,
      playMinutes: portal.activity.summary.playMinutes,
      gameEventsCount: portal.activity.summary.gameEventsCount,
      lastActivityAt: portal.activity.summary.lastActivityAt,
      recent: portal.activity.timeline.slice(0, 5).map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        description: item.description,
        occurredAt: item.occurredAt,
        storeName: item.storeName,
        xpDelta: item.xpDelta,
      })),
    },
    communications: {
      phoneConsentStatus: portal.communications.phone.consentStatus,
      telegram: {
        connected: portal.communications.telegram.connected,
        readyForRewards: portal.communications.telegram.readyForRewards,
        status: portal.communications.telegram.status,
      },
      max: {
        connected: portal.communications.max.connected,
        readyForRewards: portal.communications.max.readyForRewards,
        status: portal.communications.max.status,
      },
    },
  };
}

function buildGameReferral(
  portal: GuestPortalPayload,
  options: {
    referralSecret: string;
    webUrl: string;
    referralStats: GuestPortalReferralStats;
  },
): GuestPortalGameSummary['referral'] {
  const code = buildGameReferralCode(portal, options.referralSecret);
  const clubId = `${portal.tenant.slug}:${portal.store.publicSlug ?? portal.store.id}`;
  const link = buildPlayReferralLink(options.webUrl, clubId, code);

  return {
    status: 'READY',
    code,
    link,
    shareText: `Я участвую в квестах ${portal.store.name}. Заходи в LeetPlus, выбирай клуб и забирай бонусы: ${link}`,
    channelHint:
      'Ссылку можно отправить в Telegram, MAX или личным сообщением; raw phone и внутренние id гостя в нее не попадают.',
    stats: options.referralStats,
  };
}

function emptyGameReferralStats(): GuestPortalReferralStats {
  return {
    acceptedCount: 0,
    eligibleCount: 0,
    latestAcceptedAt: null,
  };
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function telegramUserIdString(value: unknown) {
  const raw =
    typeof value === 'number' && Number.isFinite(value)
      ? String(Math.trunc(value))
      : stringOrNull(value);

  return raw && /^[0-9]+$/.test(raw) ? raw : null;
}

function normalizeMiniAppClubSelection(dto: {
  clubId?: unknown;
  tenantSlug?: unknown;
  storeId?: unknown;
}): TelegramMiniAppClubSelection | null {
  const clubId = stringOrNull(dto.clubId);
  const [clubTenantSlug, clubStoreId] = clubId?.includes(':')
    ? clubId.split(':', 2)
    : [null, null];
  const tenantSlug = stringOrNull(dto.tenantSlug) ?? clubTenantSlug;
  const storeId = stringOrNull(dto.storeId) ?? clubStoreId;

  if (!clubId && !tenantSlug && !storeId) {
    return null;
  }

  return {
    clubId,
    tenantSlug,
    storeId,
  };
}

function guestPortalAppOpenSurface(value: unknown): GuestPortalAppOpenSurface {
  const normalized =
    typeof value === 'string'
      ? value
          .trim()
          .toUpperCase()
          .replace(/[-\s]+/g, '_')
      : '';

  if (
    normalized === 'TG_MINI_APP' ||
    normalized === 'MINI_APP' ||
    normalized === 'TELEGRAM_MINI_APP'
  ) {
    return 'TG_MINI_APP';
  }

  if (normalized === 'SITE') {
    return 'SITE';
  }

  return 'WEB';
}

function miniAppClubMatchesSelection(
  candidate: TelegramMiniAppClubCandidate,
  selection: TelegramMiniAppClubSelection,
) {
  const clubId = `${candidate.tenant.slug}:${
    candidate.store.publicSlug ?? candidate.store.id
  }`;

  if (selection.clubId && selection.clubId !== clubId) {
    return false;
  }

  if (selection.tenantSlug && selection.tenantSlug !== candidate.tenant.slug) {
    return false;
  }

  if (
    selection.storeId &&
    selection.storeId !== candidate.store.id &&
    selection.storeId !== candidate.store.publicSlug
  ) {
    return false;
  }

  return true;
}

function mapTelegramMiniAppClub(
  candidate: TelegramMiniAppClubCandidate,
): GuestPortalTelegramMiniAppClub {
  const publicStoreId = candidate.store.publicSlug ?? candidate.store.id;

  return {
    tenantId: candidate.tenant.id,
    tenantSlug: candidate.tenant.slug,
    tenantName: candidate.tenant.name,
    storeId: candidate.store.id,
    storePublicSlug: candidate.store.publicSlug,
    storeName: candidate.store.name,
    storeAddress: candidate.store.address,
    clubId: `${candidate.tenant.slug}:${publicStoreId}`,
    profileId: candidate.profile.id,
  };
}

function normalizePhoneDigits(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, '') ?? '';
  return digits.length >= 6 ? digits : null;
}

function phonesMatch(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  const normalizedLeft = normalizePhoneDigits(left);
  const normalizedRight = normalizePhoneDigits(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  return (
    normalizedLeft.length >= 10 &&
    normalizedRight.length >= 10 &&
    normalizedLeft.slice(-10) === normalizedRight.slice(-10)
  );
}

function parseTelegramMiniAppUser(
  value: string | null,
): { id: string; username: string | null } | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as { id?: unknown; username?: unknown };
    const id =
      typeof parsed.id === 'number' || typeof parsed.id === 'string'
        ? String(parsed.id)
        : null;

    if (!id || !/^\d+$/.test(id)) {
      return null;
    }

    return {
      id,
      username:
        typeof parsed.username === 'string' && parsed.username.trim()
          ? parsed.username.trim()
          : null,
    };
  } catch {
    return null;
  }
}

function safeCompareHex(left: string, right: string) {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right)) {
    return false;
  }

  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function safeCompareText(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function normalizeGameReferralCode(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const code = value.trim().slice(0, 80);

  if (!GUEST_GAME_REFERRAL_CODE_PATTERN.test(code)) {
    return null;
  }

  return code;
}

function maskGameReferralCode(code: string) {
  return `${code.slice(0, 10)}...${code.slice(-4)}`;
}

function buildGameReferralCode(portal: GuestPortalPayload, secret: string) {
  return buildGameReferralCodeFromParts(
    portal.tenant.slug,
    portal.store.id,
    portal.store.publicSlug,
    portal.profile.id,
    secret,
  );
}

function buildGameReferralCodeFromParts(
  tenantSlug: string,
  storeId: string,
  storePublicSlug: string | null,
  profileId: string | null,
  secret: string,
) {
  const source = [
    'guest-game-referral-v1',
    tenantSlug,
    storeId,
    storePublicSlug ?? '',
    profileId ?? '',
  ].join(':');
  const digest = toBase64Url(
    createHmac('sha256', secret).update(source).digest(),
  );

  return `${GUEST_GAME_REFERRAL_CODE_PREFIX}${digest.slice(0, 22)}`;
}

function buildPlayReferralLink(webUrl: string, clubId: string, code: string) {
  const baseUrl = safeWebUrl(webUrl);
  const url = new URL('/play', baseUrl);
  url.searchParams.set('clubId', clubId);
  url.searchParams.set('ref', code);
  return url.toString();
}

function safeWebUrl(webUrl: string) {
  try {
    return new URL(webUrl).toString();
  } catch {
    return 'http://localhost:3000/';
  }
}

function toBase64Url(value: Buffer) {
  return value
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function mapGameSummaryMission(
  mission: GuestPortalMission,
): GuestPortalGameSummary['missions']['featured'][number] {
  return {
    id: mission.id,
    name: mission.name,
    rewardLabel: mission.rewardLabel,
    xpReward: mission.xpReward,
    progressCurrent: mission.progressCurrent,
    progressTarget: mission.progressTarget,
    progressUnit: mission.progressUnit,
    progressPercent: mission.progressPercent,
    questSteps: mission.questSteps,
    periodTo: mission.periodTo,
    manualApprovalRequired: mission.manualApprovalRequired,
    rewardStatus: mission.rewardStatus,
  };
}

function missionHistorySort(
  left: GuestPortalMission,
  right: GuestPortalMission,
) {
  const timeDiff =
    missionHistoryEventTime(right) - missionHistoryEventTime(left);

  if (timeDiff !== 0) {
    return timeDiff;
  }

  const stateDiff =
    missionHistoryStateScore(right.rewardStatus.state) -
    missionHistoryStateScore(left.rewardStatus.state);

  if (stateDiff !== 0) {
    return stateDiff;
  }

  return right.progressPercent - left.progressPercent;
}

function missionHistoryEventTime(mission: GuestPortalMission) {
  if (!mission.rewardStatus.occurredAt) {
    return 0;
  }

  const timestamp = Date.parse(mission.rewardStatus.occurredAt);

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function missionHistoryStateScore(
  state: GuestPortalMissionRewardStatus['state'],
) {
  switch (state) {
    case 'CONFIRMED':
    case 'REDEEMED':
      return 100;
    case 'FAILED':
    case 'CANCELED':
    case 'EXPIRED':
      return 90;
    case 'READY':
    case 'QUEUED':
    case 'SENDING':
      return 80;
    case 'WAITING_APPROVAL':
    case 'COMPLETED':
      return 70;
    default:
      return 0;
  }
}

function buildGameProgressSummary(
  portal: GuestPortalPayload,
  recentRewards: GuestPortalGameSummary['rewards']['recent'],
): GuestPortalGameSummary['progress'] {
  const missionsCompleted = portal.gamification.missions.filter(
    (mission) => mission.progressPercent >= 100,
  ).length;
  const missionsAlmostDone = portal.gamification.missions.filter(
    (mission) => mission.progressPercent >= 70 && mission.progressPercent < 100,
  ).length;
  const timeline = [
    ...portal.activity.timeline.slice(0, 5).map((item) => ({
      id: `activity:${item.id}`,
      kind: 'ACTIVITY' as const,
      status: 'DONE' as const,
      title: item.title,
      description: item.description,
      occurredAt: item.occurredAt,
      storeName: item.storeName,
      xpDelta: item.xpDelta,
      amount: null,
    })),
    ...recentRewards.map((reward) => ({
      id: `reward:${reward.id}`,
      kind: 'REWARD' as const,
      status: progressRewardStatus(reward.walletState),
      title: reward.rewardLabel,
      description:
        reward.sourceLabel ?? progressRewardSourceLabel(reward.sourceKind),
      occurredAt: reward.qualifiedAt,
      storeName: null,
      xpDelta: null,
      amount: reward.rewardAmount,
    })),
    ...portal.gamification.bonusHistory.items.slice(0, 5).map((item) => ({
      id: `bonus:${item.id}`,
      kind: 'BONUS_LEDGER' as const,
      status: progressBonusStatus(item.status),
      title: item.title,
      description: item.sourceLabel ?? bonusLedgerStatusLabel(item.status),
      occurredAt: item.confirmedAt ?? item.processedAt ?? item.occurredAt,
      storeName: item.storeName,
      xpDelta: null,
      amount: item.amount,
    })),
  ]
    .sort(
      (left, right) =>
        Date.parse(right.occurredAt) - Date.parse(left.occurredAt),
    )
    .slice(0, 8);

  return {
    summary: {
      xp: portal.profile.xp,
      level: portal.profile.level,
      levelProgressPercent: portal.profile.levelProgressPercent,
      xpToNextLevel: Math.max(
        0,
        portal.profile.nextLevelXp - portal.profile.xp,
      ),
      missionsTotal: portal.gamification.missions.length,
      missionsCompleted,
      missionsAlmostDone,
      rewardsReady: portal.gamification.rewardSummary.ready,
      rewardsWaitingApproval: portal.gamification.rewardSummary.waitingApproval,
      confirmedBonusAmount:
        portal.gamification.bonusHistory.summary.confirmedAmount,
      pendingBonusAmount:
        portal.gamification.bonusHistory.summary.pendingAmount,
      lastActivityAt: portal.activity.summary.lastActivityAt,
    },
    timeline,
  };
}

function buildGameJourney(
  portal: GuestPortalPayload,
  progress: GuestPortalGameSummary['progress'],
): GuestPortalGameSummary['journey'] {
  const hasGameProfile = Boolean(portal.profile.id);
  const langameLinked =
    portal.guestSnapshot.participation.accountState === 'LANGAME_SYNCED';
  const hasActivity =
    portal.activity.summary.gameEventsCount > 0 ||
    portal.activity.summary.sessionsCount > 0;
  const missionsTotal = portal.gamification.missions.length;
  const missionsCompleted = progress.summary.missionsCompleted;
  const rewardSummary = portal.gamification.rewardSummary;
  const bonusHistory = portal.gamification.bonusHistory;
  const rewardCreated = rewardSummary.total > 0;
  const bonusConfirmed =
    bonusHistory.summary.confirmedAmount !== 0 ||
    bonusHistory.items.some((item) => item.status === 'CONFIRMED');
  const bonusPending =
    bonusHistory.summary.pendingAmount !== 0 ||
    bonusHistory.items.some(
      (item) => item.status === 'PENDING' || item.status === 'PROCESSING',
    );
  const bonusAttention =
    bonusHistory.summary.failed > 0 ||
    bonusHistory.items.some((item) => item.status === 'FAILED');
  const steps: GuestPortalGameJourneyStep[] = [
    {
      id: 'PROFILE',
      label: 'Регистрация',
      status: hasGameProfile ? 'DONE' : 'ATTENTION',
      hint: hasGameProfile
        ? 'Телефон подтвержден, отдельный игровой профиль LeetPlus создан.'
        : 'Нужно пройти вход по телефону на /play.',
      anchor: 'profile',
    },
    {
      id: 'LANGAME',
      label: 'Связь с Langame',
      status: langameLinked ? 'DONE' : 'ATTENTION',
      hint: langameLinked
        ? 'Профиль безопасно связан с сохраненным Langame-гостем.'
        : 'Подтвердите совпадение с Langame, чтобы бонус ушел в клубный баланс.',
      anchor: 'langame-match',
    },
    {
      id: 'CHECK_IN',
      label: 'Активность в клубе',
      status: hasActivity ? 'DONE' : langameLinked ? 'CURRENT' : 'WAITING',
      hint: hasActivity
        ? 'LeetPlus уже видит игровую активность или чек-ин.'
        : langameLinked
          ? 'Сделайте чек-ин или начните сессию в клубе.'
          : 'Сначала нужна связь с Langame.',
      anchor: 'progress',
    },
    {
      id: 'MISSION',
      label: 'Квест',
      status:
        missionsCompleted > 0
          ? 'DONE'
          : missionsTotal > 0 && langameLinked
            ? 'CURRENT'
            : 'WAITING',
      hint:
        missionsCompleted > 0
          ? 'Хотя бы один квест уже выполнен.'
          : missionsTotal > 0
            ? 'Выберите ближайший квест и доберите прогресс.'
            : 'Для клуба еще не опубликованы активные квесты.',
      anchor: 'missions',
    },
    {
      id: 'REWARD',
      label: 'Награда',
      status:
        rewardCreated || rewardSummary.ready > 0 || rewardSummary.redeemed > 0
          ? 'DONE'
          : missionsCompleted > 0
            ? 'CURRENT'
            : 'WAITING',
      hint: rewardCreated
        ? 'Награда уже создана в кошельке LeetPlus.'
        : missionsCompleted > 0
          ? 'Квест выполнен, награда готовится к выдаче.'
          : 'Награда появится после выполнения квеста.',
      anchor: 'rewards',
    },
    {
      id: 'BONUS',
      label: 'Бонус в Langame',
      status: bonusConfirmed
        ? 'DONE'
        : bonusAttention
          ? 'ATTENTION'
          : bonusPending
            ? 'CURRENT'
            : rewardCreated
              ? 'CURRENT'
              : 'WAITING',
      hint: bonusConfirmed
        ? 'Langame подтвердил начисление, баланс обновлен в LeetPlus.'
        : bonusAttention
          ? 'Начисление требует проверки команды клуба.'
          : bonusPending
            ? 'Бонус стоит в очереди или отправляется в Langame.'
            : rewardCreated
              ? 'Награда есть, следующий шаг - постановка в bonus ledger.'
              : 'Сначала нужна готовая награда за квест.',
      anchor: 'rewards',
    },
  ];
  const total = steps.length;
  const completed = steps.filter((step) => step.status === 'DONE').length;
  const nextStep = steps.find((step) => step.status !== 'DONE') ?? null;

  return {
    summary: {
      completed,
      total,
      readyPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
      nextStepId: nextStep?.id ?? null,
      nextStepLabel: nextStep?.label ?? null,
    },
    steps,
  };
}

function progressRewardStatus(
  state: GuestPortalReward['walletState'],
): GuestPortalGameProgressTimelineItem['status'] {
  switch (state) {
    case 'READY':
      return 'READY';
    case 'WAITING_APPROVAL':
      return 'WAITING';
    case 'REDEEMED':
      return 'DONE';
    default:
      return 'ATTENTION';
  }
}

function progressBonusStatus(
  status: GuestPortalBonusHistoryItem['status'],
): GuestPortalGameProgressTimelineItem['status'] {
  switch (status) {
    case 'CONFIRMED':
      return 'DONE';
    case 'PENDING':
    case 'PROCESSING':
      return 'WAITING';
    default:
      return 'ATTENTION';
  }
}

function progressRewardSourceLabel(
  sourceKind: GuestPortalReward['sourceKind'],
) {
  switch (sourceKind) {
    case 'MISSION':
      return 'Квест';
    case 'LOOT_BOX':
      return 'Лутбокс';
    case 'BATTLE_PASS':
      return 'Battle Pass';
    default:
      return 'Ручная награда';
  }
}

function featuredSeasonLevels(levels: GuestPortalSeason['levels']) {
  if (levels.length <= 5) {
    return levels;
  }

  const activeIndex = levels.findIndex((level) => level.current || level.next);
  const centerIndex = activeIndex >= 0 ? activeIndex : 0;
  const start = Math.max(0, Math.min(centerIndex - 1, levels.length - 5));

  return levels.slice(start, start + 5);
}

function otpChallengeStatus(status: GuestPortalOtpDeliveryStatus) {
  if (status === 'DEV_CODE' || status === 'SENT') {
    return 'PENDING';
  }

  return `DELIVERY_${status}`;
}

function guestPortalOtpDeliveryConfig(configService: ConfigService) {
  return {
    realSendEnabled: configFlag(
      configService,
      'GUEST_PORTAL_OTP_REAL_SEND_ENABLED',
    ),
    sms: {
      enabled: configFlag(configService, 'GUEST_PORTAL_OTP_SMS_ENABLED'),
      endpoint: configString(configService, 'GUEST_PORTAL_OTP_SMS_ENDPOINT'),
      token: configString(configService, 'GUEST_PORTAL_OTP_SMS_TOKEN'),
      smsRu: {
        apiId: configString(
          configService,
          'GUEST_PORTAL_OTP_SMS_RU_API_ID',
          'GUEST_PORTAL_USER_CALL_SMS_RU_API_ID',
        ),
        baseUrl:
          configString(configService, 'GUEST_PORTAL_OTP_SMS_RU_BASE_URL') ||
          SMS_RU_OTP_BASE_URL,
        testMode: configFlag(
          configService,
          'GUEST_PORTAL_OTP_SMS_RU_TEST_MODE',
        ),
        liveCanaryEnabled: configFlag(
          configService,
          'GUEST_PORTAL_OTP_SMS_RU_LIVE_CANARY_ENABLED',
        ),
      },
    },
    telegram: {
      enabled: configFlag(configService, 'GUEST_PORTAL_OTP_TELEGRAM_ENABLED'),
      token: configString(
        configService,
        'GUEST_PORTAL_TELEGRAM_BOT_TOKEN',
        'GUEST_GAME_TELEGRAM_BOT_TOKEN',
        'TELEGRAM_BOT_TOKEN',
      ),
    },
    max: {
      enabled: configFlag(configService, 'GUEST_PORTAL_OTP_MAX_ENABLED'),
      endpoint: configString(configService, 'GUEST_PORTAL_OTP_MAX_ENDPOINT'),
      token: configString(configService, 'GUEST_PORTAL_OTP_MAX_TOKEN'),
    },
  };
}

type GuestPortalOtpDeliveryConfig = ReturnType<
  typeof guestPortalOtpDeliveryConfig
>;

function otpSmsReady(config: GuestPortalOtpDeliveryConfig) {
  const smsRuReady =
    Boolean(config.sms.smsRu.apiId) && !otpSmsRuLiveCanaryRequired(config);
  const genericSmsReady = Boolean(config.sms.endpoint && config.sms.token);

  return (
    config.realSendEnabled &&
    config.sms.enabled &&
    (smsRuReady || genericSmsReady)
  );
}

function otpSmsRuLiveCanaryRequired(config: GuestPortalOtpDeliveryConfig) {
  return Boolean(
    config.sms.smsRu.apiId &&
    !config.sms.smsRu.testMode &&
    !config.sms.smsRu.liveCanaryEnabled,
  );
}

function otpSmsRequiredEnv(config: GuestPortalOtpDeliveryConfig) {
  const required = [
    ...(config.realSendEnabled ? [] : ['GUEST_PORTAL_OTP_REAL_SEND_ENABLED']),
    ...(config.sms.enabled ? [] : ['GUEST_PORTAL_OTP_SMS_ENABLED']),
  ];

  if (!config.sms.smsRu.apiId && !(config.sms.endpoint && config.sms.token)) {
    required.push(
      'GUEST_PORTAL_OTP_SMS_RU_API_ID or GUEST_PORTAL_USER_CALL_SMS_RU_API_ID',
      'or GUEST_PORTAL_OTP_SMS_ENDPOINT + GUEST_PORTAL_OTP_SMS_TOKEN',
    );
  }

  if (otpSmsRuLiveCanaryRequired(config)) {
    required.push(
      'GUEST_PORTAL_OTP_SMS_RU_TEST_MODE or GUEST_PORTAL_OTP_SMS_RU_LIVE_CANARY_ENABLED',
    );
  }

  return required;
}

function guestPortalOtpSmsRateLimitConfig(configService: ConfigService) {
  return {
    phoneWindowMinutes: configPositiveInteger(
      configService,
      'GUEST_PORTAL_OTP_SMS_RATE_LIMIT_PHONE_WINDOW_MINUTES',
      OTP_SMS_RATE_LIMIT_PHONE_WINDOW_MINUTES,
    ),
    phoneMax: configPositiveInteger(
      configService,
      'GUEST_PORTAL_OTP_SMS_RATE_LIMIT_PHONE_MAX',
      OTP_SMS_RATE_LIMIT_PHONE_MAX,
    ),
    storeWindowMinutes: configPositiveInteger(
      configService,
      'GUEST_PORTAL_OTP_SMS_RATE_LIMIT_STORE_WINDOW_MINUTES',
      OTP_SMS_RATE_LIMIT_STORE_WINDOW_MINUTES,
    ),
    storeMax: configPositiveInteger(
      configService,
      'GUEST_PORTAL_OTP_SMS_RATE_LIMIT_STORE_MAX',
      OTP_SMS_RATE_LIMIT_STORE_MAX,
    ),
    tenantWindowMinutes: configPositiveInteger(
      configService,
      'GUEST_PORTAL_OTP_SMS_RATE_LIMIT_TENANT_WINDOW_MINUTES',
      OTP_SMS_RATE_LIMIT_TENANT_WINDOW_MINUTES,
    ),
    tenantMax: configPositiveInteger(
      configService,
      'GUEST_PORTAL_OTP_SMS_RATE_LIMIT_TENANT_MAX',
      OTP_SMS_RATE_LIMIT_TENANT_MAX,
    ),
  };
}

function guestPortalUserCallConfig(configService: ConfigService) {
  const rawPhoneNumber = configString(
    configService,
    'GUEST_PORTAL_USER_CALL_PHONE_NUMBER',
  );
  const secret = configString(configService, 'GUEST_PORTAL_USER_CALL_SECRET');
  const smsRuApiId = configString(
    configService,
    'GUEST_PORTAL_USER_CALL_SMS_RU_API_ID',
  );
  const rawProvider = configString(
    configService,
    'GUEST_PORTAL_USER_CALL_PROVIDER',
  );
  const provider = normalizeUserCallProvider(
    rawProvider ||
      (smsRuApiId
        ? USER_CALL_PROVIDER_SMS_RU_CALLCHECK
        : USER_CALL_PROVIDER_MANUAL),
  );
  const enabled = configFlag(configService, 'GUEST_PORTAL_USER_CALL_ENABLED');
  const configured =
    provider === USER_CALL_PROVIDER_SMS_RU_CALLCHECK
      ? Boolean(smsRuApiId)
      : Boolean(rawPhoneNumber && secret);
  const requiredEnv = [
    ...(enabled ? [] : ['GUEST_PORTAL_USER_CALL_ENABLED']),
    ...(provider === USER_CALL_PROVIDER_SMS_RU_CALLCHECK
      ? smsRuApiId
        ? []
        : ['GUEST_PORTAL_USER_CALL_SMS_RU_API_ID']
      : [
          ...(rawPhoneNumber ? [] : ['GUEST_PORTAL_USER_CALL_PHONE_NUMBER']),
          ...(secret ? [] : ['GUEST_PORTAL_USER_CALL_SECRET']),
        ]),
  ];

  return {
    enabled,
    provider,
    configured,
    requiredEnv,
    phoneNumber: rawPhoneNumber,
    callHref: phoneTelHref(rawPhoneNumber),
    secret,
    smsRu: {
      apiId: smsRuApiId,
      baseUrl:
        configString(configService, 'GUEST_PORTAL_USER_CALL_SMS_RU_BASE_URL') ||
        SMS_RU_CALLCHECK_BASE_URL,
    },
  };
}

function guestPortalIncomingCallLast4Config(configService: ConfigService) {
  return {
    enabled: configFlag(
      configService,
      'GUEST_PORTAL_INCOMING_CALL_LAST4_ENABLED',
    ),
    endpoint: configString(
      configService,
      'GUEST_PORTAL_INCOMING_CALL_LAST4_ENDPOINT',
    ),
    token: configString(
      configService,
      'GUEST_PORTAL_INCOMING_CALL_LAST4_TOKEN',
    ),
  };
}

function normalizeUserCallProvider(value: string): GuestPortalUserCallProvider {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

  if (
    normalized === USER_CALL_PROVIDER_SMS_RU_CALLCHECK ||
    normalized === 'SMS_RU' ||
    normalized === 'SMSRU' ||
    normalized === 'SMSRU_CALLCHECK'
  ) {
    return USER_CALL_PROVIDER_SMS_RU_CALLCHECK;
  }

  return USER_CALL_PROVIDER_MANUAL;
}

function phoneTelHref(value: string) {
  const phoneNumber = value.replace(/[^\d+]/g, '');

  return phoneNumber ? `tel:${phoneNumber}` : '';
}

function smsRuCallcheckUrl(
  baseUrl: string,
  action: 'add' | 'status',
  params: Record<string, string>,
) {
  const url = new URL(
    `/callcheck/${action}`,
    baseUrl || SMS_RU_CALLCHECK_BASE_URL,
  );

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return url.toString();
}

function smsRuResponseString(value: unknown) {
  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  return '';
}

function configFlag(configService: ConfigService, key: string) {
  return configService.get<string>(key)?.trim().toLowerCase() === 'true';
}

function configString(configService: ConfigService, ...keys: string[]) {
  for (const key of keys) {
    const value = configService.get<string>(key)?.trim();

    if (value) {
      return value;
    }
  }

  return '';
}

function configPositiveInteger(
  configService: ConfigService,
  key: string,
  fallback: number,
) {
  const raw = configService.get<string>(key)?.trim();
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.floor(parsed));
}

function otpMessage(code: string, context: TenantStoreContext) {
  return [
    `Код LeetPlus: ${code}`,
    `Клуб: ${context.store.name}`,
    `Действует ${OTP_TTL_MINUTES} минут. Если вы не запрашивали вход, просто проигнорируйте сообщение.`,
  ].join('\n');
}

function failedOtpDelivery(
  channel: GuestPortalOtpDeliveryChannel,
  error: unknown,
): GuestPortalOtpDeliveryResult {
  return {
    channel,
    status: 'FAILED',
    deliveredAt: null,
    message: `${channel} provider не смог отправить OTP-код.`,
    note: safeDeliveryErrorMessage(error),
  };
}

async function sendHttpOtpDelivery({
  endpoint,
  token,
  body,
}: {
  endpoint: string;
  token: string;
  body: Record<string, unknown>;
}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const payload = await safeJson(response);

  if (!response.ok) {
    throw new Error(
      `OTP provider failed: ${response.status} ${providerErrorText(payload)}`,
    );
  }

  return payload;
}

async function sendSmsRuOtpDelivery({
  apiId,
  baseUrl,
  phone,
  text,
  ttlMinutes,
  testMode,
}: {
  apiId: string;
  baseUrl: string;
  phone: string;
  text: string;
  ttlMinutes: number;
  testMode: boolean;
}) {
  const url = new URL('/sms/send', baseUrl || SMS_RU_OTP_BASE_URL);
  url.searchParams.set('api_id', apiId);
  url.searchParams.set('to', phone);
  url.searchParams.set('msg', text);
  url.searchParams.set('json', '1');
  url.searchParams.set('ttl', String(ttlMinutes));

  if (testMode) {
    url.searchParams.set('test', '1');
  }

  const response = await fetch(url.toString(), { method: 'POST' });
  const payload = await safeJson(response);
  const record =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : null;
  const statusCode = smsRuResponseString(record?.status_code);
  const smsMap =
    record?.sms && typeof record.sms === 'object'
      ? (record.sms as Record<string, unknown>)
      : null;
  const smsResult = smsMap?.[phone] ?? null;
  const smsStatusCode =
    smsResult && typeof smsResult === 'object'
      ? smsRuResponseString(
          (smsResult as { status_code?: unknown }).status_code,
        )
      : '';

  if (!response.ok || statusCode !== '100' || smsStatusCode !== '100') {
    throw new Error(
      `SMS.ru OTP failed: ${smsRuSafeError(payload, phone) || response.status}`,
    );
  }

  return payload;
}

function smsRuSafeError(payload: unknown, phone: string) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const record = payload as Record<string, unknown>;
  const smsMap =
    record.sms && typeof record.sms === 'object'
      ? (record.sms as Record<string, unknown>)
      : null;
  const smsResult = smsMap?.[phone];
  const smsText =
    smsResult && typeof smsResult === 'object'
      ? stringFromUnknown((smsResult as Record<string, unknown>).status_text)
      : null;

  return (
    smsText ??
    stringFromUnknown(record.status_text) ??
    stringFromUnknown(record.status) ??
    ''
  ).slice(0, 160);
}

async function sendTelegramOtpDelivery({
  token,
  chatId,
  text,
}: {
  token: string;
  chatId: string;
  text: string;
}) {
  const response = await fetch(
    `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    },
  );
  const payload = await safeJson(response);
  const ok =
    payload && typeof payload === 'object' && 'ok' in payload
      ? Boolean((payload as { ok?: unknown }).ok)
      : response.ok;

  if (!response.ok || !ok) {
    throw new Error(
      `Telegram OTP failed: ${providerErrorText(payload) || response.status}`,
    );
  }

  return payload;
}

async function sendTelegramWebhookReply({
  token,
  chatId,
  text,
  replyMarkup,
}: {
  token: string;
  chatId: string;
  text: string;
  replyMarkup?: NonNullable<
    GuestPortalTelegramWebhookResponse['reply']
  >['replyMarkup'];
}) {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  };

  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }

  const response = await fetch(
    `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  const payload = await safeJson(response);
  const ok =
    payload && typeof payload === 'object' && 'ok' in payload
      ? Boolean((payload as { ok?: unknown }).ok)
      : response.ok;

  if (!response.ok || !ok) {
    throw new Error(
      `Telegram webhook reply failed: ${
        providerErrorText(payload) || response.status
      }`,
    );
  }

  return payload;
}

async function safeJson(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function providerErrorText(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const record = payload as Record<string, unknown>;
  const text =
    typeof record.description === 'string'
      ? record.description
      : typeof record.error === 'string'
        ? record.error
        : typeof record.status_text === 'string'
          ? record.status_text
          : typeof record.message === 'string'
            ? record.message
            : '';

  return text.slice(0, 160);
}

function deliveryProviderNote(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return 'Provider принял запрос без подробного ответа.';
  }

  const record = payload as Record<string, unknown>;
  const result =
    record.result && typeof record.result === 'object'
      ? (record.result as Record<string, unknown>)
      : null;
  const id =
    stringFromUnknown(record.id) ??
    stringFromUnknown(record.message_id) ??
    stringFromUnknown(record.messageId) ??
    stringFromUnknown(result?.message_id) ??
    stringFromUnknown(result?.messageId);

  return id
    ? `Provider принял запрос, message id: ${maskIdentifier(id)}.`
    : 'Provider принял запрос.';
}

function safeDeliveryErrorMessage(error: unknown) {
  const message =
    error instanceof Error ? error.message : 'OTP delivery provider error';

  return message.slice(0, 300);
}

function telegramChatIdFromIdentity(value: string | null) {
  const identity = value?.trim() ?? '';

  if (!identity.toLowerCase().startsWith('chat:')) {
    return null;
  }

  const normalized = identity.slice('chat:'.length).trim();

  return /^-?\d{5,32}$/.test(normalized) ? normalized : null;
}

function stringFromUnknown(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function externalGuestKey(domain: string | null, externalGuestId: string) {
  return `${domain ?? ''}:${externalGuestId}`;
}

function telegramWebhookUpdate(value: unknown) {
  const update = objectRecord(value);
  if (!update) {
    throw new BadRequestException('Telegram webhook payload is invalid.');
  }

  const callbackQuery = objectRecord(update.callback_query);
  const message =
    objectRecord(update.message) ??
    objectRecord(update.edited_message) ??
    objectRecord(update.channel_post) ??
    objectRecord(callbackQuery?.message);
  if (!message) {
    throw new BadRequestException('Telegram webhook message is missing.');
  }

  const chat = objectRecord(message.chat);
  const from = objectRecord(message.from) ?? objectRecord(callbackQuery?.from);
  const contact = objectRecord(message.contact);
  const chatId = chat?.id ?? from?.id;
  const callbackData = stringField(callbackQuery?.data);
  const text =
    stringField(message.text) ?? stringField(message.caption) ?? callbackData;
  const username =
    typeof from?.username === 'string'
      ? from.username
      : typeof chat?.username === 'string'
        ? chat.username
        : null;
  let contactUserId: string | null = null;

  if (contact?.user_id !== undefined && contact.user_id !== null) {
    try {
      contactUserId = telegramChatId(contact.user_id);
    } catch {
      contactUserId = null;
    }
  }

  return {
    text,
    telegramChatId: telegramChatId(chatId),
    telegramUsername: username,
    contactPhone: stringField(contact?.phone_number),
    contactUserId,
    callbackData,
  };
}

function telegramWebhookLinkCode(text: string | null) {
  if (!text) {
    return null;
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const [command, ...payloadParts] = trimmed.split(/\s+/);
  const commandIsLink =
    /^\/start(@[A-Za-z0-9_]{3,64})?$/i.test(command) ||
    /^\/link(@[A-Za-z0-9_]{3,64})?$/i.test(command);
  const candidate = commandIsLink ? payloadParts.join(' ') : trimmed;

  try {
    return telegramLinkCode(candidate);
  } catch {
    return null;
  }
}

function telegramWebhookUnsubscribeCommand(text: string | null) {
  if (!text) {
    return false;
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  const [command] = trimmed.split(/\s+/);
  return (
    /^\/(stop|unsubscribe|cancel|отписаться|стоп)(@[A-Za-z0-9_]{3,64})?$/i.test(
      command,
    ) || /^(stop|unsubscribe|cancel|отписаться|стоп|отписка)$/i.test(trimmed)
  );
}

function telegramWebhookBotCommand(
  text: string | null,
): TelegramBotCommand | null {
  if (!text) {
    return null;
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const [command, ...payloadParts] = trimmed.split(/\s+/);
  const normalized = trimmed.toLowerCase();

  if (
    /^\/help(@[A-Za-z0-9_]{3,64})?$/i.test(command) ||
    /^(help|помощь|что умеешь)$/i.test(trimmed)
  ) {
    return 'HELP';
  }

  if (
    /^\/start(@[A-Za-z0-9_]{3,64})?$/i.test(command) &&
    payloadParts.length === 0
  ) {
    return 'MENU';
  }

  if (/^(bot:)?profile$/i.test(trimmed)) {
    return 'PROFILE';
  }

  if (/^(bot:)?quests$/i.test(trimmed)) {
    return 'QUESTS';
  }

  if (/^(bot:)?rewards$/i.test(trimmed)) {
    return 'REWARDS';
  }

  if (/^(bot:)?check-?in$/i.test(trimmed)) {
    return 'CHECK_IN';
  }

  if (/^(bot:)?clubs?$/i.test(trimmed)) {
    return 'CLUBS';
  }

  if (
    /^(bot:)?menu$/i.test(trimmed) ||
    /^\/status(@[A-Za-z0-9_]{3,64})?$/i.test(command)
  ) {
    return 'MENU';
  }

  if (/^\/profile(@[A-Za-z0-9_]{3,64})?$/i.test(command)) {
    return 'PROFILE';
  }

  if (/^\/quests(@[A-Za-z0-9_]{3,64})?$/i.test(command)) {
    return 'QUESTS';
  }

  if (/^\/rewards(@[A-Za-z0-9_]{3,64})?$/i.test(command)) {
    return 'REWARDS';
  }

  if (/^\/check-?in(@[A-Za-z0-9_]{3,64})?$/i.test(command)) {
    return 'CHECK_IN';
  }

  if (/^\/clubs?(@[A-Za-z0-9_]{3,64})?$/i.test(command)) {
    return 'CLUBS';
  }

  if (/^\/menu(@[A-Za-z0-9_]{3,64})?$/i.test(command)) {
    return 'MENU';
  }

  if (/^(профиль)$/i.test(normalized)) {
    return 'PROFILE';
  }

  if (/^(квесты|задания)$/i.test(normalized)) {
    return 'QUESTS';
  }

  if (/^(награды|бонусы)$/i.test(normalized)) {
    return 'REWARDS';
  }

  if (/^(чекин|чек-ин|checkin|check-in)$/i.test(normalized)) {
    return 'CHECK_IN';
  }

  if (/^(клубы|клуб|выбрать клуб|сменить клуб)$/i.test(normalized)) {
    return 'CLUBS';
  }

  return /^(продолжить в боте|статус|меню)$/i.test(normalized) ? 'MENU' : null;
}

function telegramBotClubCallbackToken(callbackData: string | null) {
  const match = /^bot:club:([A-Za-z0-9_-]{12,32})$/.exec(
    callbackData?.trim() ?? '',
  );

  return match?.[1] ?? null;
}

function telegramBotCityCallbackToken(callbackData: string | null) {
  const match = /^bot:city:([A-Za-z0-9_-]{12,32})$/.exec(
    callbackData?.trim() ?? '',
  );

  return match?.[1] ?? null;
}

function telegramBotMissionLine(mission: {
  name: string;
  xpReward: number;
  progressTarget: number | null;
  progressUnit: string | null;
}) {
  const target =
    mission.progressTarget && mission.progressTarget > 0
      ? ` (${formatTelegramBotInteger(mission.progressTarget)}${
          mission.progressUnit ? ` ${mission.progressUnit}` : ''
        })`
      : '';
  const xp =
    mission.xpReward > 0
      ? `, +${formatTelegramBotInteger(mission.xpReward)} XP`
      : '';

  return `Ближайший квест: ${mission.name}${target}${xp}.`;
}

function formatTelegramBotInteger(value: number) {
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.floor(value)));
}

function formatTelegramBotMoney(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return 'нет данных';
  }

  return `${new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 0,
  }).format(value)} ₽`;
}

function telegramBotBalanceSyncedLine(portal: GuestPortalPayload) {
  const syncedAt = formatTelegramBotDateTime(portal.loyalty.lastSyncedAt);

  return syncedAt
    ? `Баланс обновлен: ${syncedAt}.`
    : 'Баланс обновлен: нет данных.';
}

function formatTelegramBotDateTime(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function formatTelegramBotBalance(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return 'нет данных';
  }

  return `${new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 0,
  }).format(value)}`;
}

function telegramBotCheckInAvailable(portal: GuestPortalPayload) {
  return (
    portal.gamification.nextActions.some((item) => item.kind === 'CHECK_IN') ||
    portal.gamification.missions.some(
      (item) =>
        item.missionType === 'CHECK_IN' &&
        item.rewardStatus.state === 'IN_PROGRESS',
    )
  );
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}

function publicStoreCity(city: string | null, address: string | null) {
  const explicitCity = city?.trim();

  if (explicitCity) {
    return explicitCity;
  }

  return cityFromAddress(address);
}

function cityFromAddress(address: string | null) {
  const normalized = address?.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return null;
  }

  const prefixedCity = normalized.match(
    /(?:^|[,\s])(?:г\.?|город)\s*([А-ЯЁA-Z][А-ЯЁA-Zа-яёa-z -]{1,60})/u,
  );

  if (prefixedCity?.[1]) {
    return cleanupCityName(prefixedCity[1]);
  }

  const firstPart = normalized.split(',')[0]?.trim() ?? '';

  if (/^[А-ЯЁA-Z][А-ЯЁA-Zа-яёa-z -]{1,60}$/u.test(firstPart)) {
    return cleanupCityName(firstPart);
  }

  return null;
}

function cleanupCityName(value: string) {
  const cleaned = value
    .replace(/\b(?:ул|улица|пр|проспект|пер|переулок|ш|шоссе)\.?$/iu, '')
    .trim()
    .replace(/\s+$/, '');

  return cleaned || null;
}

function booleanEnv(value: string | undefined) {
  return ['1', 'true', 'yes', 'on'].includes(value?.trim().toLowerCase() ?? '');
}

function geoPoint(lat: string | undefined, lng: string | undefined) {
  const latitude = coordinateNumber(lat, -90, 90);
  const longitude = coordinateNumber(lng, -180, 180);

  return latitude === null || longitude === null
    ? null
    : { latitude, longitude };
}

function radiusNumber(value: string | undefined) {
  if (!value) {
    return null;
  }

  const numeric = Number(value.replace(',', '.'));

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return Math.min(Math.round(numeric * 10) / 10, 500);
}

function coordinateNumber(value: string | undefined, min: number, max: number) {
  if (!value) {
    return null;
  }

  const numeric = Number(value.replace(',', '.'));
  return Number.isFinite(numeric) && numeric >= min && numeric <= max
    ? numeric
    : null;
}

function haversineDistanceKm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const earthRadiusKm = 6371;
  const deltaLatitude = degreesToRadians(to.latitude - from.latitude);
  const deltaLongitude = degreesToRadians(to.longitude - from.longitude);
  const fromLatitude = degreesToRadians(from.latitude);
  const toLatitude = degreesToRadians(to.latitude);
  const angle =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(deltaLongitude / 2) ** 2;
  const distance =
    2 * earthRadiusKm * Math.atan2(Math.sqrt(angle), Math.sqrt(1 - angle));

  return Math.round(distance * 10) / 10;
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

function compareDirectoryClubs(
  left: GuestPortalGamificationClubDirectory['clubs'][number],
  right: GuestPortalGamificationClubDirectory['clubs'][number],
) {
  if (left.location.distanceKm !== null || right.location.distanceKm !== null) {
    if (left.location.distanceKm === null) {
      return 1;
    }

    if (right.location.distanceKm === null) {
      return -1;
    }

    return left.location.distanceKm - right.location.distanceKm;
  }

  return (
    (left.store.city ?? '').localeCompare(right.store.city ?? '', 'ru') ||
    left.store.name.localeCompare(right.store.name, 'ru')
  );
}

function normalizeTelegramLinkCode(value: string) {
  return value
    .trim()
    .replace(/^\/start\s+/i, '')
    .replace(/^lp[_-]?/i, '')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase();
}

function telegramLinkCode(value: unknown) {
  if (typeof value !== 'string') {
    throw new BadRequestException('Telegram link code is required.');
  }

  const normalized = normalizeTelegramLinkCode(value);
  if (!/^[A-F0-9]{10}$/.test(normalized)) {
    throw new BadRequestException('Telegram link code is invalid.');
  }

  return `LP-${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

function telegramStartPayload(code: string) {
  return `lp_${normalizeTelegramLinkCode(code)}`;
}

function maskTelegramLinkCode(code: string) {
  const normalized = normalizeTelegramLinkCode(code);
  return `LP-${normalized.slice(0, 2)}**-**${normalized.slice(-2)}`;
}

function telegramChatId(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new BadRequestException('Telegram chat_id is required.');
  }

  const normalized = String(value).trim();
  if (!/^-?\d{5,32}$/.test(normalized)) {
    throw new BadRequestException(
      'Telegram chat_id must be a numeric Telegram chat identifier.',
    );
  }

  return normalized;
}

function maskTelegramChatId(value: string) {
  const sign = value.startsWith('-') ? '-' : '';
  const raw = sign ? value.slice(1) : value;

  if (raw.length <= 4) {
    return `${sign}****`;
  }

  return `${sign}${raw.slice(0, 2)}***${raw.slice(-2)}`;
}

function telegramUsername(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw new BadRequestException('Telegram username must be a string.');
  }

  const normalized = value.trim().replace(/^@/, '');
  if (!normalized) {
    return null;
  }

  if (!/^[A-Za-z0-9_]{3,64}$/.test(normalized)) {
    throw new BadRequestException('Telegram username is invalid.');
  }

  return `@${normalized}`;
}

function normalizeTelegramBotUsername(value: string | null) {
  const normalized = value?.trim().replace(/^@/, '') ?? '';

  if (!normalized || !/^[A-Za-z0-9_]{3,64}$/.test(normalized)) {
    return null;
  }

  return normalized;
}

type GuestPortalLangameAutoMatchCachedPayload = {
  checkedAt: string | null;
  phoneMasked: string | null;
  matchStatus: GuestPortalLangameMatchResponse['status'];
  localStatus: GuestPortalLocalGameProfileMatchStatus | null;
  localGuestId: string | null;
  linkStatus: GuestPortalGameProfileLinkStatus;
  linkedGuestId: string | null;
  linkedProfileId: string | null;
  backfilled: GuestPortalGameProfileBackfillSummary;
  sources: GuestPortalLangameMatchResponse['sources'];
};

function guestPortalLangameAutoMatchPayload(
  value: Prisma.JsonValue | null,
): GuestPortalLangameAutoMatchCachedPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const matchStatus = guestPortalLangameMatchStatus(payload.matchStatus);
  const linkStatus = guestPortalGameProfileLinkStatus(payload.linkStatus);

  if (!matchStatus || !linkStatus) {
    return null;
  }

  return {
    checkedAt: stringOrNull(payload.checkedAt),
    phoneMasked: stringOrNull(payload.phoneMasked),
    matchStatus,
    localStatus: guestPortalLocalMatchStatus(payload.localStatus),
    localGuestId: stringOrNull(payload.localGuestId),
    linkStatus,
    linkedGuestId: stringOrNull(payload.linkedGuestId),
    linkedProfileId: stringOrNull(payload.linkedProfileId),
    backfilled: guestPortalBackfillSummary(payload.backfilled),
    sources: Array.isArray(payload.sources)
      ? (payload.sources as GuestPortalLangameMatchResponse['sources'])
      : [],
  };
}

function guestPortalLangameMatchStatus(value: unknown) {
  const statuses: GuestPortalLangameMatchResponse['status'][] = [
    'MATCHED_LOCAL',
    'FOUND_IN_LANGAME',
    'NOT_FOUND',
    'FAILED',
  ];

  return statuses.find((status) => status === value) ?? null;
}

function guestPortalLocalMatchStatus(value: unknown) {
  const statuses: GuestPortalLocalGameProfileMatchStatus[] = [
    'MATCHED_LOCAL',
    'FOUND_IN_LANGAME',
    'WAITING_FOR_SYNC',
    'CONFLICT',
    'NOT_FOUND',
    'FAILED',
    'NOT_LINKED',
  ];

  return statuses.find((status) => status === value) ?? null;
}

function guestPortalGameProfileLinkStatus(value: unknown) {
  const statuses: GuestPortalGameProfileLinkStatus[] = [
    'LINKED',
    'ALREADY_LINKED',
    'WAITING_FOR_SYNC',
    'CONFLICT',
    'NOT_LINKED',
  ];

  return statuses.find((status) => status === value) ?? null;
}

function guestPortalBackfillSummary(
  value: unknown,
): GuestPortalGameProfileBackfillSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return emptyGameProfileBackfillSummary();
  }

  const payload = value as Record<string, unknown>;

  return {
    rewards: nonNegativeInteger(payload.rewards),
    events: nonNegativeInteger(payload.events),
    deliveries: nonNegativeInteger(payload.deliveries),
    bonusLedgerEntries: nonNegativeInteger(payload.bonusLedgerEntries),
  };
}

function nonNegativeInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : 0;
}

function langameMatchStatusToLocalStatus(
  status: GuestPortalLangameMatchResponse['status'],
): GuestPortalLocalGameProfileMatchStatus {
  if (status === 'MATCHED_LOCAL') {
    return 'MATCHED_LOCAL';
  }

  if (status === 'FOUND_IN_LANGAME') {
    return 'FOUND_IN_LANGAME';
  }

  if (status === 'NOT_FOUND') {
    return 'NOT_FOUND';
  }

  return 'FAILED';
}

function guestPortalLangameMatchNextAction(
  status: GuestPortalLangameMatchResponse['status'],
  linkStatus: GuestPortalGameProfileLinkStatus,
) {
  if (linkStatus === 'LINKED') {
    return 'Профиль Langame найден в сохраненных данных и сразу связан с игровым профилем. Бонусы, миссии и история будут считаться по общей связке.';
  }

  if (linkStatus === 'ALREADY_LINKED') {
    return 'Игровой профиль уже связан с гостем Langame. Данные лояльности и геймификации обновляются в контуре выбранного клуба.';
  }

  if (linkStatus === 'CONFLICT') {
    return 'Langame-гость найден, но уже есть другая активная игровая связка. Попросите администратора проверить профиль перед объединением.';
  }

  if (status === 'MATCHED_LOCAL') {
    return 'Профиль найден в LeetPlus и проверен для выбранного клуба. Повторная ручная проверка Langame не требуется.';
  }

  if (status === 'FOUND_IN_LANGAME') {
    return 'Langame нашел гостя по подтвержденному телефону в выбранном клубе. Проверка сохранена и не будет запускаться повторно для этого клуба.';
  }

  if (status === 'NOT_FOUND') {
    return 'Langame не вернул гостя по этому телефону. Проверьте номер у администратора клуба или попробуйте другой номер.';
  }

  return 'Не удалось проверить Langame по активным источникам. Попробуйте позже или обратитесь к администратору клуба.';
}

function guestPortalLocalGameProfileMatchNextAction(
  status: GuestPortalLocalGameProfileMatchStatus,
  linkStatus: GuestPortalGameProfileLinkStatus,
) {
  if (linkStatus === 'LINKED') {
    return 'Телефон совпал с сохраненным snapshot LeetPlus, игровой профиль связан с гостем Langame, старые игровые записи довязаны автоматически.';
  }

  if (linkStatus === 'ALREADY_LINKED') {
    return 'Игровой профиль уже связан с сохраненным гостем Langame; LeetPlus дополнительно проверил старые игровые записи и довязал их при необходимости.';
  }

  if (linkStatus === 'CONFLICT' || status === 'CONFLICT') {
    return 'По этому телефону найден локальный Langame-гость, но активная игровая связка конфликтует с другим профилем. Нужна ручная проверка администратора.';
  }

  if (status === 'WAITING_FOR_SYNC') {
    return 'Вход завершен. Клубная сверка Langame будет выполнена автоматически по подтвержденному телефону.';
  }

  if (status === 'FOUND_IN_LANGAME') {
    return 'Langame уже подтвердил гостя по телефону для выбранного клуба. Ручная проверка и повторная синхронизация не нужны.';
  }

  if (status === 'NOT_FOUND') {
    return 'Клубная сверка выполнена один раз: Langame не нашел гостя по этому телефону в выбранном клубе.';
  }

  if (status === 'FAILED') {
    return 'Клубная сверка Langame не завершилась. Вход уже работает, а повторную проверку можно будет запустить после настройки интеграции.';
  }

  return 'Вход завершен, игровой профиль создан отдельно от общей базы гостей. Клубная связка с Langame выполняется автоматически по подтвержденному телефону.';
}

function guestPortalPayloadWithLocalMatch(
  payload: GuestPortalTokenPayload,
  match: GuestPortalLocalGameProfileMatch,
): GuestPortalTokenPayload {
  if (
    (match.linkStatus === 'LINKED' || match.linkStatus === 'ALREADY_LINKED') &&
    match.linkedGuestId
  ) {
    return {
      ...payload,
      guestId: match.linkedGuestId,
      profileId: match.linkedProfileId ?? payload.profileId,
    };
  }

  return payload;
}

function filterLootBoxesByVisualRefs<T extends { id: string; name: string }>(
  rows: T[],
  refs: GuestPortalVisualLootBoxRef[] | null,
) {
  if (refs === null) {
    return rows;
  }

  if (!refs.length) {
    return [];
  }

  return rows.filter((row) => visualLootBoxRefsContain(refs, row));
}

function visualLootBoxRefsContain(
  refs: GuestPortalVisualLootBoxRef[],
  row: { id: string; name: string },
) {
  return refs.some(
    (ref) =>
      (ref.id && ref.id === row.id) ||
      (!ref.id && ref.title && ref.title === row.name),
  );
}

function mapLootBox(
  row: {
    id: string;
    name: string;
    triggerKind: string;
    rewardLabel: string | null;
    rewardType: string;
    manualApprovalRequired: boolean;
    note: string | null;
    limits: Prisma.JsonValue | null;
  },
  rewards: GuestPortalRewardRow[],
): GuestPortalLootBox {
  const rewardState = buildLootBoxRewardState(row.id, rewards);
  const openState = buildLootBoxOpenState(row, rewards);

  return {
    id: row.id,
    name: row.name,
    triggerKind: row.triggerKind,
    rewardLabel: row.rewardLabel,
    rewardType: row.rewardType,
    manualApprovalRequired: row.manualApprovalRequired,
    note: row.note,
    ...openState,
    ...rewardState,
  };
}

function buildLootBoxOpenState(
  row: {
    id: string;
    triggerKind: string;
    limits: Prisma.JsonValue | null;
  },
  rewards: GuestPortalRewardRow[],
): Pick<
  GuestPortalLootBox,
  | 'openState'
  | 'openable'
  | 'openBlocker'
  | 'weeklyOpenedCount'
  | 'weeklyLimit'
  | 'dailyOpenedCount'
  | 'dailyLimit'
> {
  const limits = jsonRecord(row.limits);
  const weeklyLimit = positiveIntOrNull(limits.perGuestPerWeek);
  const dailyLimit = positiveIntOrNull(limits.totalPerDay);
  const now = new Date();
  const restartedAt = lootBoxRestartedAt(limits);
  const weekStart = maxDate(startOfRollingWeek(now), restartedAt);
  const dayStart = maxDate(startOfDay(now), restartedAt);
  const lootBoxRewards = rewards.filter(
    (reward) =>
      reward.lootBoxId === row.id &&
      !['CANCELED', 'VOID', 'REJECTED'].includes(reward.status),
  );
  const weeklyOpenedCount = lootBoxRewards.filter(
    (reward) => reward.qualifiedAt.getTime() >= weekStart.getTime(),
  ).length;
  const dailyOpenedCount = lootBoxRewards.filter(
    (reward) => reward.qualifiedAt.getTime() >= dayStart.getTime(),
  ).length;

  if (weeklyLimit !== null && weeklyOpenedCount >= weeklyLimit) {
    return {
      openState: 'LIMIT_REACHED',
      openable: false,
      openBlocker: `Лимит на гостя за неделю исчерпан: ${weeklyOpenedCount}/${weeklyLimit}.`,
      weeklyOpenedCount,
      weeklyLimit,
      dailyOpenedCount,
      dailyLimit,
    };
  }

  if (dailyLimit !== null && dailyOpenedCount >= dailyLimit) {
    return {
      openState: 'LIMIT_REACHED',
      openable: false,
      openBlocker: `Дневной лимит открытий исчерпан: ${dailyOpenedCount}/${dailyLimit}.`,
      weeklyOpenedCount,
      weeklyLimit,
      dailyOpenedCount,
      dailyLimit,
    };
  }

  if (row.triggerKind !== GAME_APP_OPEN_EVENT_TYPE) {
    return {
      openState: 'WAITING_EVENT',
      openable: false,
      openBlocker: lootBoxWaitingEventMessage(row.triggerKind),
      weeklyOpenedCount,
      weeklyLimit,
      dailyOpenedCount,
      dailyLimit,
    };
  }

  return {
    openState: 'OPENABLE',
    openable: true,
    openBlocker: null,
    weeklyOpenedCount,
    weeklyLimit,
    dailyOpenedCount,
    dailyLimit,
  };
}

function lootBoxWaitingEventMessage(triggerKind: string) {
  return `Чтобы открыть этот лутбокс, выполните задание: ${guestGameTriggerLabel(
    triggerKind,
  )}.`;
}

function buildLootBoxRewardState(
  lootBoxId: string,
  rewards: GuestPortalRewardRow[],
): Pick<
  GuestPortalLootBox,
  | 'openedCount'
  | 'readyRewards'
  | 'waitingApprovalRewards'
  | 'redeemedRewards'
  | 'latestReward'
> {
  const lootBoxRewards = rewards
    .filter((reward) => reward.lootBoxId === lootBoxId)
    .sort(
      (left, right) => right.qualifiedAt.getTime() - left.qualifiedAt.getTime(),
    );
  const mappedStates = lootBoxRewards.map((reward) =>
    rewardWalletState(reward.status, reward.expiresAt),
  );
  const latest = lootBoxRewards[0] ?? null;
  const latestState = latest
    ? rewardWalletState(latest.status, latest.expiresAt)
    : null;

  return {
    openedCount: lootBoxRewards.length,
    readyRewards: mappedStates.filter((state) => state === 'READY').length,
    waitingApprovalRewards: mappedStates.filter(
      (state) => state === 'WAITING_APPROVAL',
    ).length,
    redeemedRewards: mappedStates.filter((state) => state === 'REDEEMED')
      .length,
    latestReward:
      latest && latestState
        ? {
            id: latest.id,
            walletState: latestState,
            rewardLabel: latest.rewardLabel,
            rewardRarity: latest.rewardRarity,
            rewardRarityLabel: latest.rewardRarityLabel,
            rewardDropChance: decimalNumber(latest.rewardDropChance),
            rewardCode: latest.rewardCode,
            claimPayload:
              latest.rewardCode && latestState === 'READY'
                ? buildRewardClaimPayload(latest.id, latest.rewardCode)
                : null,
            qualifiedAt: latest.qualifiedAt.toISOString(),
            expiresAt: iso(latest.expiresAt),
          }
        : null,
  };
}

function mapMission(
  row: {
    id: string;
    name: string;
    missionType: string;
    rewardLabel: string | null;
    xpReward: number;
    progressTarget: number | null;
    progressUnit: string | null;
    conditions: Prisma.JsonValue;
    periodTo: Date | null;
    manualApprovalRequired: boolean;
  },
  progress?: GuestPortalMissionProgress,
  rewards: GuestPortalRewardRow[] = [],
  bonusLedgerRows: GuestPortalBonusLedgerRow[] = [],
): GuestPortalMission {
  const progressCurrent = progress?.current ?? 0;
  const questSteps = missionQuestSteps(row.conditions, progressCurrent);
  const progressTarget = questSteps.length
    ? (questSteps[questSteps.length - 1]?.target ?? questSteps.length)
    : row.progressTarget;
  const progressPercent = questSteps.length
    ? percent(progressCurrent, progressTarget ?? questSteps.length)
    : (progress?.percent ?? 0);

  return {
    id: row.id,
    name: row.name,
    missionType: row.missionType,
    rewardLabel: row.rewardLabel,
    xpReward: row.xpReward,
    progressCurrent,
    progressTarget,
    progressUnit: row.progressUnit,
    progressPercent,
    questSteps,
    periodTo: iso(row.periodTo),
    manualApprovalRequired: row.manualApprovalRequired,
    rewardStatus: buildMissionRewardStatus({
      missionId: row.id,
      manualApprovalRequired: row.manualApprovalRequired,
      progressPercent,
      rewards,
      bonusLedgerRows,
    }),
  };
}

function buildMissionRewardStatus({
  missionId,
  manualApprovalRequired,
  progressPercent,
  rewards,
  bonusLedgerRows,
}: {
  missionId: string;
  manualApprovalRequired: boolean;
  progressPercent: number;
  rewards: GuestPortalRewardRow[];
  bonusLedgerRows: GuestPortalBonusLedgerRow[];
}): GuestPortalMissionRewardStatus {
  const latestLedger = bonusLedgerRows
    .filter((row) => row.reward?.missionId === missionId)
    .sort(
      (left, right) =>
        missionLedgerEventDate(right).getTime() -
        missionLedgerEventDate(left).getTime(),
    )[0];

  if (latestLedger) {
    return missionLedgerRewardStatus(latestLedger);
  }

  const latestReward = rewards
    .filter((reward) => reward.missionId === missionId)
    .sort(
      (left, right) => right.qualifiedAt.getTime() - left.qualifiedAt.getTime(),
    )[0];

  if (latestReward) {
    return missionWalletRewardStatus(latestReward);
  }

  if (progressPercent >= 100) {
    return {
      state: 'COMPLETED',
      label: 'Квест выполнен',
      hint: manualApprovalRequired
        ? 'Команда клуба проверит выполнение и подтвердит награду.'
        : 'Событие принято, награда появится после обработки правила.',
      rewardLabel: null,
      rewardAmount: null,
      rewardWalletState: null,
      ledgerStatus: null,
      balanceAfter: null,
      occurredAt: null,
    };
  }

  return {
    state: 'IN_PROGRESS',
    label: 'Награда впереди',
    hint: 'Закройте шаги квеста, чтобы получить бонус.',
    rewardLabel: null,
    rewardAmount: null,
    rewardWalletState: null,
    ledgerStatus: null,
    balanceAfter: null,
    occurredAt: null,
  };
}

function missionLedgerRewardStatus(
  row: GuestPortalBonusLedgerRow,
): GuestPortalMissionRewardStatus {
  const ledgerStatus = bonusLedgerPortalStatus(row.status);
  const amount = moneyNumber(decimalNumber(row.amount) ?? 0);
  const balanceAfter = decimalNumber(row.balanceAfter);
  const occurredAt = missionLedgerEventDate(row).toISOString();
  const base = {
    rewardLabel: row.reward?.rewardLabel ?? null,
    rewardAmount: amount,
    rewardWalletState: null,
    ledgerStatus,
    balanceAfter,
    occurredAt,
  } satisfies Omit<GuestPortalMissionRewardStatus, 'state' | 'label' | 'hint'>;

  switch (ledgerStatus) {
    case 'PENDING':
      return {
        ...base,
        state: 'QUEUED',
        label: 'Бонус в очереди',
        hint: 'Начисление уже подготовлено и будет отправлено в Langame.',
      };
    case 'PROCESSING':
      return {
        ...base,
        state: 'SENDING',
        label: 'Отправляется',
        hint: 'LeetPlus отправляет бонус в Langame.',
      };
    case 'CONFIRMED':
      return {
        ...base,
        state: 'CONFIRMED',
        label: 'Бонус начислен',
        hint:
          balanceAfter === null
            ? 'Langame подтвердил начисление бонуса.'
            : `Langame подтвердил начисление. Баланс после: ${formatSafeAmount(
                balanceAfter,
              )}.`,
      };
    case 'FAILED':
    case 'UNKNOWN':
      return {
        ...base,
        state: 'FAILED',
        label: 'Нужна проверка',
        hint: 'Начисление не подтвердилось автоматически, команда клуба проверит его.',
      };
    case 'CANCELED':
      return {
        ...base,
        state: 'CANCELED',
        label: 'Начисление отменено',
        hint: 'Эта бонусная операция остановлена до подтверждения в Langame.',
      };
    default:
      return {
        ...base,
        state: 'FAILED',
        label: 'Нужна проверка',
        hint: 'Статус начисления требует проверки команды клуба.',
      };
  }
}

function missionWalletRewardStatus(
  reward: GuestPortalRewardRow,
): GuestPortalMissionRewardStatus {
  const rewardWalletStateValue = rewardWalletState(
    reward.status,
    reward.expiresAt,
  );
  const base = {
    rewardLabel: reward.rewardLabel,
    rewardAmount: moneyNumber(decimalNumber(reward.rewardAmount) ?? 0),
    rewardWalletState: rewardWalletStateValue,
    ledgerStatus: null,
    balanceAfter: null,
    occurredAt: reward.qualifiedAt.toISOString(),
  } satisfies Omit<GuestPortalMissionRewardStatus, 'state' | 'label' | 'hint'>;

  switch (rewardWalletStateValue) {
    case 'WAITING_APPROVAL':
      return {
        ...base,
        state: 'WAITING_APPROVAL',
        label: 'Ждет подтверждения',
        hint: 'Награда создана и ожидает проверки команды клуба.',
      };
    case 'READY':
      return {
        ...base,
        state: 'READY',
        label: 'Награда готова',
        hint: reward.rewardCode
          ? 'Покажите код кассиру или дождитесь автоматического начисления.'
          : 'Награда готова к выдаче или постановке в bonus ledger.',
      };
    case 'REDEEMED':
      return {
        ...base,
        state: 'REDEEMED',
        label: 'Награда выдана',
        hint: 'Награда по этому квесту уже использована.',
      };
    case 'EXPIRED':
      return {
        ...base,
        state: 'EXPIRED',
        label: 'Срок истек',
        hint: 'Срок действия награды по этому квесту истек.',
      };
    case 'CANCELED':
      return {
        ...base,
        state: 'CANCELED',
        label: 'Награда отменена',
        hint: 'Награда по этому квесту отменена.',
      };
    default:
      return {
        ...base,
        state: 'WAITING_APPROVAL',
        label: 'Проверяется',
        hint: 'Награда по этому квесту требует проверки.',
      };
  }
}

function missionLedgerEventDate(row: GuestPortalBonusLedgerRow) {
  return (
    row.confirmedAt ??
    row.processedAt ??
    row.failedAt ??
    row.canceledAt ??
    row.updatedAt ??
    row.createdAt
  );
}

function formatSafeAmount(value: number) {
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 2,
  }).format(value);
}

function missionQuestSteps(
  value: Prisma.JsonValue,
  progressCurrent: number,
): GuestPortalMissionStep[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }

  const steps = (value as Record<string, unknown>).questSteps;
  if (!Array.isArray(steps)) {
    return [];
  }

  let lastTarget = 0;
  let openStepMarked = false;

  return steps
    .map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }

      const row = item as Record<string, unknown>;
      const title = stringField(row.title);
      if (!title) {
        return null;
      }

      const rawTarget = numberField(row.target);
      const target = Math.max(lastTarget + 1, rawTarget ?? index + 1);
      lastTarget = target;

      const completed = progressCurrent >= target;
      const current = !completed && !openStepMarked;
      if (current) {
        openStepMarked = true;
      }

      return {
        id: stringField(row.id) ?? `step-${index + 1}`,
        title,
        target,
        progressCurrent: Math.min(progressCurrent, target),
        completed,
        current,
      };
    })
    .filter((item): item is GuestPortalMissionStep => Boolean(item))
    .slice(0, 5);
}

function mapSeason(
  row: {
    id: string;
    name: string;
    seasonType: string;
    periodTo: Date | null;
    premiumEnabled: boolean;
    levels: Prisma.JsonValue;
  },
  xp: number,
  rewards: Array<{
    seasonId: string | null;
    status: string;
    expiresAt: Date | null;
  }>,
): GuestPortalSeason {
  const levels = seasonLevels(row.levels, xp);
  const progress = buildSeasonProgress(levels, xp, rewards, row.id);

  return {
    id: row.id,
    name: row.name,
    seasonType: row.seasonType,
    periodTo: iso(row.periodTo),
    premiumEnabled: row.premiumEnabled,
    ...progress,
    levels,
  };
}

function mapPromoCard(row: {
  id: string;
  label: string | null;
  title: string;
  description: string | null;
  tag: string | null;
  targetAnchor: string | null;
  periodTo: Date | null;
}): GuestPortalPromoCard {
  return {
    id: row.id,
    label: row.label,
    title: row.title,
    description: row.description,
    tag: row.tag,
    targetAnchor: row.targetAnchor,
    periodTo: iso(row.periodTo),
  };
}

function mapReward(row: {
  id: string;
  status: string;
  lootBoxId: string | null;
  missionId: string | null;
  seasonId: string | null;
  rewardType: string;
  rewardAmount: Prisma.Decimal;
  rewardLabel: string;
  rewardRarity: string | null;
  rewardRarityLabel: string | null;
  rewardDropChance: Prisma.Decimal | null;
  rewardCode: string | null;
  qualifiedAt: Date;
  expiresAt: Date | null;
  lootBox?: { name: string } | null;
  mission?: { name: string } | null;
  season?: { name: string } | null;
}): GuestPortalReward {
  const walletState = rewardWalletState(row.status, row.expiresAt);
  const source = rewardSource(row);

  return {
    id: row.id,
    status: row.status,
    walletState,
    rewardType: row.rewardType,
    rewardAmount: Number(row.rewardAmount),
    rewardLabel: row.rewardLabel,
    rewardRarity: row.rewardRarity,
    rewardRarityLabel: row.rewardRarityLabel,
    rewardDropChance: decimalNumber(row.rewardDropChance),
    sourceId: row.lootBoxId ?? row.missionId ?? row.seasonId ?? null,
    sourceKind: source.sourceKind,
    sourceLabel: source.sourceLabel,
    rewardCode: row.rewardCode,
    claimPayload:
      row.rewardCode && walletState === 'READY'
        ? buildRewardClaimPayload(row.id, row.rewardCode)
        : null,
    qualifiedAt: row.qualifiedAt.toISOString(),
    expiresAt: iso(row.expiresAt),
  };
}

function buildRewardSummary(
  rewards: GuestPortalReward[],
): GuestPortalRewardSummary {
  const nextExpiresAt = rewards
    .filter((reward) => reward.walletState === 'READY' && reward.expiresAt)
    .map((reward) => reward.expiresAt as string)
    .sort()[0];

  return {
    total: rewards.length,
    ready: rewards.filter((reward) => reward.walletState === 'READY').length,
    waitingApproval: rewards.filter(
      (reward) => reward.walletState === 'WAITING_APPROVAL',
    ).length,
    redeemed: rewards.filter((reward) => reward.walletState === 'REDEEMED')
      .length,
    expired: rewards.filter((reward) => reward.walletState === 'EXPIRED')
      .length,
    nextExpiresAt: nextExpiresAt ?? null,
  };
}

function buildBonusLedgerHistory(
  rows: GuestPortalBonusLedgerRow[],
): GuestPortalBonusHistory {
  const items = rows
    .map((row) => mapBonusLedgerHistoryItem(row))
    .sort(
      (left, right) =>
        Date.parse(right.occurredAt) - Date.parse(left.occurredAt),
    );

  return {
    summary: {
      total: items.length,
      confirmedAmount: moneyNumber(
        items
          .filter((item) => item.status === 'CONFIRMED')
          .reduce((sum, item) => sum + item.amount, 0),
      ),
      pendingAmount: moneyNumber(
        items
          .filter(
            (item) => item.status === 'PENDING' || item.status === 'PROCESSING',
          )
          .reduce((sum, item) => sum + item.amount, 0),
      ),
      failed: items.filter((item) => item.status === 'FAILED').length,
      latestAt: items[0]?.occurredAt ?? null,
    },
    items,
  };
}

function mapBonusLedgerHistoryItem(
  row: GuestPortalBonusLedgerRow,
): GuestPortalBonusHistoryItem {
  const status = bonusLedgerPortalStatus(row.status);
  const source = row.reward
    ? rewardSource(row.reward)
    : ({ sourceKind: 'MANUAL', sourceLabel: null } satisfies Pick<
        GuestPortalReward,
        'sourceKind' | 'sourceLabel'
      >);
  const occurredAt =
    row.confirmedAt ??
    row.processedAt ??
    row.failedAt ??
    row.canceledAt ??
    row.updatedAt ??
    row.createdAt;

  return {
    id: row.id,
    status,
    statusLabel: bonusLedgerStatusLabel(status),
    amount: moneyNumber(decimalNumber(row.amount) ?? 0),
    balanceAfter: decimalNumber(row.balanceAfter),
    title: row.reward?.rewardLabel ?? bonusLedgerEntryTypeLabel(row.entryType),
    sourceKind: source.sourceKind,
    sourceLabel: source.sourceLabel,
    storeName: row.store?.name ?? null,
    occurredAt: occurredAt.toISOString(),
    confirmedAt: iso(row.confirmedAt),
    processedAt: iso(row.processedAt),
  };
}

function bonusLedgerPortalStatus(
  status: string,
): GuestPortalBonusHistoryItem['status'] {
  switch (status) {
    case 'PENDING':
    case 'PROCESSING':
    case 'CONFIRMED':
    case 'FAILED':
    case 'CANCELED':
      return status;
    default:
      return 'UNKNOWN';
  }
}

function bonusLedgerStatusLabel(status: GuestPortalBonusHistoryItem['status']) {
  const labels = {
    PENDING: 'В очереди',
    PROCESSING: 'Отправляется',
    CONFIRMED: 'Начислено',
    FAILED: 'Проверяется',
    CANCELED: 'Отменено',
    UNKNOWN: 'Проверяется',
  } satisfies Record<GuestPortalBonusHistoryItem['status'], string>;

  return labels[status];
}

function bonusLedgerEntryTypeLabel(entryType: string) {
  switch (entryType) {
    case 'SPEND':
    case 'WRITE_OFF':
      return 'Списание бонусов';
    case 'ADJUST':
    case 'ADJUSTMENT':
      return 'Корректировка бонусов';
    default:
      return 'Начисление бонусов';
  }
}

function buildNextActions(input: {
  guestFound: boolean;
  lootBoxes: GuestPortalLootBox[];
  missions: GuestPortalMission[];
  seasons: GuestPortalSeason[];
  rewards: GuestPortalReward[];
}): GuestPortalNextAction[] {
  const actions: GuestPortalNextAction[] = [];
  const readyReward = input.rewards.find(
    (reward) => reward.walletState === 'READY',
  );
  const latestLootBox = input.lootBoxes.find((lootBox) => lootBox.latestReward);
  const closestMission = input.missions
    .filter((mission) => mission.progressPercent < 100)
    .sort((left, right) => right.progressPercent - left.progressPercent)[0];
  const waitingMission = input.missions.find(
    (mission) =>
      mission.progressPercent >= 100 && mission.manualApprovalRequired,
  );
  const checkInMission = input.missions.find(
    (mission) =>
      mission.missionType === 'CHECK_IN' &&
      mission.rewardStatus.state === 'IN_PROGRESS',
  );
  const season = input.seasons[0] ?? null;

  if (readyReward) {
    actions.push({
      id: `claim:${readyReward.id}`,
      kind: 'CLAIM_REWARD',
      title: 'Заберите готовую награду',
      description: readyReward.sourceLabel
        ? `${readyReward.rewardLabel} из сценария "${readyReward.sourceLabel}".`
        : readyReward.rewardLabel,
      priority: 'HIGH',
      statusLabel: readyReward.expiresAt ? 'есть срок действия' : 'готово',
      progressPercent: 100,
      anchor: 'rewards',
    });
  }

  if (latestLootBox?.latestReward) {
    actions.push({
      id: `loot-box:${latestLootBox.id}`,
      kind: 'OPEN_LOOT_BOX',
      title: 'Откройте последний лутбокс',
      description:
        latestLootBox.latestReward.walletState === 'READY'
          ? 'Внутри уже есть награда, которую можно показать администратору.'
          : 'Результат уже сохранен в LeetPlus и ожидает проверки клуба.',
      priority: readyReward ? 'MEDIUM' : 'HIGH',
      statusLabel:
        latestLootBox.latestReward.walletState === 'READY'
          ? 'можно забрать'
          : 'на проверке',
      progressPercent: 100,
      anchor: 'lootBoxes',
    });
  }

  if (checkInMission) {
    actions.push({
      id: `check-in:${checkInMission.id}`,
      kind: 'CHECK_IN',
      title: 'Сделайте чекин в клубе',
      description:
        checkInMission.rewardLabel ??
        (checkInMission.xpReward > 0
          ? `${checkInMission.xpReward} XP за чекин.`
          : 'Чекин доступен для выбранного клуба.'),
      priority: actions.length ? 'MEDIUM' : 'HIGH',
      statusLabel: 'доступно',
      progressPercent: checkInMission.progressPercent,
      anchor: 'progress',
    });
  }

  if (closestMission) {
    const target = closestMission.progressTarget ?? 1;
    const unit = closestMission.progressUnit
      ? ` ${closestMission.progressUnit}`
      : '';
    actions.push({
      id: `mission:${closestMission.id}`,
      kind: 'FINISH_MISSION',
      title: 'Добейте ближайшую миссию',
      description: `${closestMission.name}: ${closestMission.progressCurrent}/${target}${unit}.`,
      priority: actions.length ? 'MEDIUM' : 'HIGH',
      statusLabel: `${Math.round(closestMission.progressPercent)}%`,
      progressPercent: closestMission.progressPercent,
      anchor: 'missions',
    });
  } else if (waitingMission) {
    actions.push({
      id: `mission-waiting:${waitingMission.id}`,
      kind: 'FINISH_MISSION',
      title: 'Миссия выполнена',
      description:
        'Клуб проверяет результат и подготовит награду в кошельке гостя.',
      priority: 'MEDIUM',
      statusLabel: 'ожидает проверки',
      progressPercent: 100,
      anchor: 'missions',
    });
  }

  if (season?.nextLevel) {
    actions.push({
      id: `battle-pass:${season.id}`,
      kind: 'BATTLE_PASS',
      title: `Дойдите до уровня ${season.nextLevel}`,
      description:
        season.nextRewardLabel ??
        'Следующая награда появится после набора XP в текущем сезоне.',
      priority: actions.length ? 'LOW' : 'MEDIUM',
      statusLabel:
        season.xpToNextLevel == null
          ? 'сезон завершен'
          : `${season.xpToNextLevel} XP`,
      progressPercent: season.progressPercent,
      anchor: 'battlePass',
    });
  }

  if (!input.guestFound) {
    actions.push({
      id: 'match-langame',
      kind: 'MATCH_LANGAME',
      title: 'Проверьте профиль Langame',
      description:
        'Если телефон есть в Langame, кабинет сможет связать гостя с локальными snapshot-данными.',
      priority: 'HIGH',
      statusLabel: 'нужна проверка',
      progressPercent: null,
      anchor: 'profile',
    });
  }

  return actions.slice(0, 4);
}

function buildCrmLead(
  lead: {
    fullNameMasked: string | null;
    phoneMasked: string | null;
    emailMasked: string | null;
    source: string | null;
    eventName: string | null;
    crmStatus: GuestCrmStatus;
    nextContactAt: Date | null;
    matchedGuestId: string | null;
    matchedAt: Date | null;
  } | null,
): GuestPortalCrmLead {
  if (!lead) {
    return {
      found: false,
      displayName: null,
      contactMasked: null,
      source: null,
      eventName: null,
      crmStatus: null,
      nextContactAt: null,
      matchedGuestFound: false,
      matchedAt: null,
    };
  }

  return {
    found: true,
    displayName: lead.fullNameMasked ?? lead.phoneMasked ?? 'CRM-гость',
    contactMasked: lead.phoneMasked ?? lead.emailMasked ?? null,
    source: lead.source,
    eventName: lead.eventName,
    crmStatus: lead.crmStatus,
    nextContactAt: iso(lead.nextContactAt),
    matchedGuestFound: Boolean(lead.matchedGuestId),
    matchedAt: iso(lead.matchedAt),
  };
}

function buildGuestSnapshot(
  guest: {
    externalProvider: IntegrationProvider | null;
    externalDomain: string | null;
    externalGuestTypeId: string | null;
    phoneHash: string | null;
    phoneMasked: string | null;
    emailHash: string | null;
    emailMasked: string | null;
    fullNameHash: string | null;
    fullNameMasked: string | null;
    birthYear: number | null;
    birthMonth: number | null;
    birthDay: number | null;
    gender: string | null;
    insertedAt: Date | null;
    lastActivityAt: Date | null;
    isVirtual: boolean;
    isTemporary: boolean;
    isDisabled: boolean;
    isSimpleRegistration: boolean;
    isConfirmed: boolean;
    isMobileRegistration: boolean;
    identityDocumentPresent: boolean;
    bonusProgramNumber: string | null;
    currentCountHours: Prisma.Decimal | null;
    lastSyncedAt: Date | null;
  } | null,
  lead: {
    phoneMasked: string | null;
    emailMasked: string | null;
    fullNameMasked: string | null;
    matchedGuestId: string | null;
    matchedAt: Date | null;
  } | null,
  profile: {
    id: string;
    phoneHash: string | null;
    contactMasked: string | null;
    telegramIdentity: string | null;
    maxIdentity: string | null;
  } | null,
): GuestPortalGuestSnapshot {
  if (!guest) {
    const participation = buildGuestParticipation(null, lead, profile, 0);

    return {
      source: {
        provider: lead ? 'LeetPlus CRM' : 'LeetPlus',
        domain: null,
        lastSyncedAt: null,
      },
      identity: {
        phoneMasked: lead?.phoneMasked ?? profile?.contactMasked ?? null,
        emailMasked: lead?.emailMasked ?? null,
        fullNameMasked: lead?.fullNameMasked ?? null,
        birthdayProvided: false,
        documentPresent: false,
        bonusProgramNumberMasked: null,
      },
      registration: {
        registeredAt: null,
        lastActivityAt: null,
        confirmed: false,
        mobileRegistration: false,
        simpleRegistration: false,
        temporary: false,
        virtual: false,
        disabled: false,
      },
      profileCompleteness: {
        percent: 0,
        completed: [],
        missing: [
          lead || profile
            ? 'Синхронизированный профиль Langame'
            : 'Подтвержденный профиль гостя',
        ],
      },
      participation,
      statusLabels: lead
        ? ['Найдена CRM-заявка', 'Langame-профиль нужно сопоставить']
        : profile
          ? ['Есть игровой профиль LeetPlus', 'Langame-профиль нужно найти']
          : ['Профиль появится после синхронизации клуба'],
    };
  }

  const birthdayProvided = Boolean(
    guest.birthYear || guest.birthMonth || guest.birthDay,
  );
  const completenessItems = [
    {
      label: 'Телефон',
      done: Boolean(guest.phoneHash || guest.phoneMasked),
    },
    {
      label: 'Email',
      done: Boolean(guest.emailHash || guest.emailMasked),
    },
    {
      label: 'Имя',
      done: Boolean(guest.fullNameHash || guest.fullNameMasked),
    },
    {
      label: 'Дата рождения',
      done: birthdayProvided,
    },
    {
      label: 'Подтверждение профиля',
      done: guest.isConfirmed,
    },
    {
      label: 'Карта/номер бонусной программы',
      done: Boolean(guest.bonusProgramNumber),
    },
  ];
  const completed = completenessItems
    .filter((item) => item.done)
    .map((item) => item.label);
  const missing = completenessItems
    .filter((item) => !item.done)
    .map((item) => item.label);

  return {
    source: {
      provider:
        guest.externalProvider === IntegrationProvider.LANGAME
          ? 'Langame'
          : (guest.externalProvider ?? 'LeetPlus'),
      domain: guest.externalDomain ?? null,
      lastSyncedAt: iso(guest.lastSyncedAt),
    },
    identity: {
      phoneMasked: guest.phoneMasked,
      emailMasked: guest.emailMasked,
      fullNameMasked: guest.fullNameMasked,
      birthdayProvided,
      documentPresent: guest.identityDocumentPresent,
      bonusProgramNumberMasked: maskIdentifier(guest.bonusProgramNumber),
    },
    registration: {
      registeredAt: iso(guest.insertedAt),
      lastActivityAt: iso(guest.lastActivityAt),
      confirmed: guest.isConfirmed,
      mobileRegistration: guest.isMobileRegistration,
      simpleRegistration: guest.isSimpleRegistration,
      temporary: guest.isTemporary,
      virtual: guest.isVirtual,
      disabled: guest.isDisabled,
    },
    profileCompleteness: {
      percent: percent(completed.length, completenessItems.length),
      completed,
      missing,
    },
    participation: buildGuestParticipation(
      guest,
      lead,
      profile,
      percent(completed.length, completenessItems.length),
    ),
    statusLabels: buildGuestStatusLabels(guest),
  };
}

function buildGuestParticipation(
  guest: {
    externalGuestTypeId: string | null;
    phoneHash: string | null;
    phoneMasked: string | null;
    gender: string | null;
    isVirtual: boolean;
    isTemporary: boolean;
    isDisabled: boolean;
    isSimpleRegistration: boolean;
    isConfirmed: boolean;
    isMobileRegistration: boolean;
    identityDocumentPresent: boolean;
    bonusProgramNumber: string | null;
    currentCountHours: Prisma.Decimal | null;
  } | null,
  lead: {
    phoneMasked: string | null;
    emailMasked: string | null;
    fullNameMasked: string | null;
    matchedGuestId: string | null;
    matchedAt: Date | null;
  } | null,
  profile: {
    id: string;
    phoneHash: string | null;
    contactMasked: string | null;
    telegramIdentity: string | null;
    maxIdentity: string | null;
  } | null,
  completenessPercent: number,
): GuestPortalGuestSnapshot['participation'] {
  const accountState = guest?.isDisabled
    ? 'DISABLED'
    : guest?.isTemporary
      ? 'TEMPORARY'
      : guest?.isVirtual
        ? 'VIRTUAL'
        : guest
          ? 'LANGAME_SYNCED'
          : lead
            ? 'CRM_LEAD'
            : profile
              ? 'GAME_PROFILE'
              : 'NOT_MATCHED';
  const readiness = buildGuestReadiness(guest, lead, profile);

  return {
    accountState,
    accountStateLabel: guestAccountStateLabel(accountState),
    guestTypeId: guest?.externalGuestTypeId ?? null,
    genderLabel: guestGenderLabel(guest?.gender ?? null),
    registrationChannel: guestRegistrationChannel(guest, lead, profile),
    verificationLabel: guestVerificationLabel(guest, lead, profile),
    loyaltyCardStatus: guest
      ? guest.bonusProgramNumber
        ? 'LINKED'
        : 'MISSING'
      : 'UNKNOWN',
    readinessPercent: Math.max(
      completenessPercent,
      percent(
        readiness.filter((item) => item.status === 'READY').length,
        readiness.length,
      ),
    ),
    readiness,
  };
}

function buildGuestReadiness(
  guest: {
    externalGuestTypeId: string | null;
    phoneHash: string | null;
    phoneMasked: string | null;
    isConfirmed: boolean;
    identityDocumentPresent: boolean;
    bonusProgramNumber: string | null;
    currentCountHours: Prisma.Decimal | null;
  } | null,
  lead: { phoneMasked: string | null; matchedGuestId: string | null } | null,
  profile: {
    id: string;
    phoneHash: string | null;
    contactMasked: string | null;
    telegramIdentity: string | null;
    maxIdentity: string | null;
  } | null,
): GuestPortalProfileReadinessItem[] {
  const hasPhone = Boolean(
    guest?.phoneHash ||
    guest?.phoneMasked ||
    lead?.phoneMasked ||
    profile?.phoneHash ||
    profile?.contactMasked,
  );
  const hasMessenger = Boolean(
    profile?.telegramIdentity || profile?.maxIdentity,
  );
  const hasLoyalty = Boolean(
    guest?.externalGuestTypeId ||
    guest?.bonusProgramNumber ||
    guest?.currentCountHours,
  );

  return [
    {
      id: 'phone',
      label: 'Телефон',
      status: hasPhone ? 'READY' : 'MISSING',
      note: hasPhone
        ? 'Контакт подтвержден OTP и подходит для гостевого кабинета.'
        : 'Нужен подтвержденный телефон для личного кабинета.',
    },
    {
      id: 'langame',
      label: 'Профиль Langame',
      status: guest ? 'READY' : lead || profile ? 'ATTENTION' : 'MISSING',
      note: guest
        ? 'Профиль найден в сохраненном snapshot Langame.'
        : 'Профиль нужно сопоставить через синхронизацию или точечную проверку.',
    },
    {
      id: 'loyalty',
      label: 'Лояльность клуба',
      status: hasLoyalty ? 'READY' : guest ? 'ATTENTION' : 'MISSING',
      note: hasLoyalty
        ? 'Есть база для группы, часов или бонусной карты.'
        : 'Группа и часы появятся после данных Langame.',
    },
    {
      id: 'game_profile',
      label: 'Игровой профиль',
      status: profile ? 'READY' : guest || lead ? 'ATTENTION' : 'MISSING',
      note: profile
        ? 'XP, уровни и игровые награды связаны с профилем LeetPlus.'
        : 'Игровой профиль будет создан при первом игровом событии или привязке канала.',
    },
    {
      id: 'messenger',
      label: 'Telegram/MAX',
      status: hasMessenger ? 'READY' : 'ATTENTION',
      note: hasMessenger
        ? 'Канал сохранен, отправка включается только после настройки бота.'
        : 'Можно привязать Telegram-бота или alias для будущих игровых уведомлений.',
    },
  ];
}

function guestAccountStateLabel(
  state: GuestPortalGuestSnapshot['participation']['accountState'],
) {
  const labels = {
    LANGAME_SYNCED: 'Синхронизирован с Langame',
    CRM_LEAD: 'CRM-заявка без Langame-профиля',
    GAME_PROFILE: 'Игровой профиль LeetPlus',
    DISABLED: 'Отключен в Langame',
    TEMPORARY: 'Временный гость',
    VIRTUAL: 'Виртуальный профиль',
    NOT_MATCHED: 'Профиль не найден',
  } satisfies Record<
    GuestPortalGuestSnapshot['participation']['accountState'],
    string
  >;

  return labels[state];
}

function guestRegistrationChannel(
  guest: {
    isMobileRegistration: boolean;
    isSimpleRegistration: boolean;
  } | null,
  lead: unknown,
  profile: unknown,
) {
  if (guest?.isMobileRegistration) {
    return 'Мобильная регистрация Langame';
  }

  if (guest?.isSimpleRegistration) {
    return 'Упрощенная регистрация Langame';
  }

  if (guest) {
    return 'Стандартная регистрация Langame';
  }

  if (lead) {
    return 'CRM-заявка LeetPlus';
  }

  if (profile) {
    return 'Игровой профиль LeetPlus';
  }

  return 'Не определен';
}

function guestVerificationLabel(
  guest: {
    isConfirmed: boolean;
    identityDocumentPresent: boolean;
  } | null,
  lead: unknown,
  profile: unknown,
) {
  if (guest?.identityDocumentPresent) {
    return 'Документ указан в Langame';
  }

  if (guest?.isConfirmed) {
    return 'Профиль подтвержден в Langame';
  }

  if (guest) {
    return 'Есть Langame-профиль, подтверждение не отмечено';
  }

  if (lead || profile) {
    return 'Телефон подтвержден в гостевом портале';
  }

  return 'Ожидает подтверждения телефона';
}

function guestGenderLabel(value: string | null) {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (['m', 'male', 'man', 'м', 'муж', 'мужской'].includes(normalized)) {
    return 'мужской';
  }

  if (['f', 'female', 'woman', 'ж', 'жен', 'женский'].includes(normalized)) {
    return 'женский';
  }

  return value;
}

function buildGuestStatusLabels(guest: {
  isConfirmed: boolean;
  isMobileRegistration: boolean;
  isSimpleRegistration: boolean;
  isTemporary: boolean;
  isVirtual: boolean;
  isDisabled: boolean;
  identityDocumentPresent: boolean;
}) {
  const labels = [
    guest.isConfirmed ? 'Профиль подтвержден' : 'Профиль не подтвержден',
    guest.isMobileRegistration ? 'Мобильная регистрация' : null,
    guest.isSimpleRegistration ? 'Упрощенная регистрация' : null,
    guest.isTemporary ? 'Временный гость' : null,
    guest.isVirtual ? 'Виртуальный профиль' : null,
    guest.isDisabled ? 'Профиль отключен' : null,
    guest.identityDocumentPresent ? 'Документ указан в Langame' : null,
  ].filter((item): item is string => Boolean(item));

  return labels.length ? labels : ['Обычный профиль гостя'];
}

function comparePortalRewards(
  left: GuestPortalReward,
  right: GuestPortalReward,
) {
  const leftRank = walletStateRank(left.walletState);
  const rightRank = walletStateRank(right.walletState);

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  return Date.parse(right.qualifiedAt) - Date.parse(left.qualifiedAt);
}

function walletStateRank(state: GuestPortalReward['walletState']) {
  switch (state) {
    case 'READY':
      return 0;
    case 'WAITING_APPROVAL':
      return 1;
    case 'REDEEMED':
      return 2;
    case 'EXPIRED':
      return 3;
    case 'CANCELED':
      return 4;
  }
}

function rewardSource(row: {
  lootBoxId: string | null;
  missionId: string | null;
  seasonId: string | null;
  lootBox?: { name: string } | null;
  mission?: { name: string } | null;
  season?: { name: string } | null;
}): Pick<GuestPortalReward, 'sourceKind' | 'sourceLabel'> {
  if (row.lootBoxId) {
    return {
      sourceKind: 'LOOT_BOX',
      sourceLabel: row.lootBox?.name ?? null,
    };
  }

  if (row.missionId) {
    return {
      sourceKind: 'MISSION',
      sourceLabel: row.mission?.name ?? null,
    };
  }

  if (row.seasonId) {
    return {
      sourceKind: 'BATTLE_PASS',
      sourceLabel: row.season?.name ?? null,
    };
  }

  return {
    sourceKind: 'MANUAL',
    sourceLabel: null,
  };
}

function communicationPreferenceAction(
  value: unknown,
): GuestPortalCommunicationPreferenceAction {
  const action = communicationPreferenceActionOrNull(value);
  if (action) {
    return action;
  }

  throw new BadRequestException(
    'Неизвестное действие для настройки коммуникаций.',
  );
}

function communicationPreferenceActionOrNull(
  value: unknown,
): GuestPortalCommunicationPreferenceAction | null {
  if (value === 'GRANT' || value === 'DENY' || value === 'UNSUBSCRIBE') {
    return value;
  }

  return null;
}

function communicationPreferenceMessage(
  action: GuestPortalCommunicationPreferenceAction,
) {
  const messages = {
    GRANT:
      'Согласие сохранено. Игровые уведомления можно будет включить после подключения Telegram/MAX или SMS.',
    DENY: 'Отказ сохранен. Игровые сообщения не будут отправляться без нового согласия.',
    UNSUBSCRIBE:
      'Отписка сохранена. Каналы нельзя использовать для игровых сообщений без нового согласия.',
  } satisfies Record<GuestPortalCommunicationPreferenceAction, string>;

  return messages[action];
}

function communicationPreferenceCrmStatus(
  action: GuestPortalCommunicationPreferenceAction,
) {
  if (action === 'GRANT') {
    return GuestCrmStatus.CONTACT;
  }

  if (action === 'UNSUBSCRIBE') {
    return GuestCrmStatus.DO_NOT_CONTACT;
  }

  return GuestCrmStatus.NONE;
}

function communicationPreferenceEventNote(
  action: GuestPortalCommunicationPreferenceAction,
) {
  const notes = {
    GRANT: 'Гость разрешил игровые коммуникации через гостевой портал.',
    DENY: 'Гость отказался от игровых коммуникаций через гостевой портал.',
    UNSUBSCRIBE:
      'Гость отписался от игровых коммуникаций через гостевой портал.',
  } satisfies Record<GuestPortalCommunicationPreferenceAction, string>;

  return `${COMMUNICATION_PREFERENCE_EVENT_PREFIX}${action}: ${notes[action]}`;
}

function messengerChannel(value: unknown): GuestPortalMessengerChannel {
  if (value === 'TELEGRAM' || value === 'MAX') {
    return value;
  }

  throw new BadRequestException('Выберите Telegram или MAX.');
}

function messengerIdentity(
  channel: GuestPortalMessengerChannel,
  value: unknown,
) {
  if (typeof value !== 'string') {
    throw new BadRequestException('Укажите публичный alias мессенджера.');
  }

  const trimmed = value.trim();
  const withoutUrl = trimmed
    .replace(/^https?:\/\/(www\.)?t\.me\//i, '')
    .replace(/^https?:\/\/(www\.)?telegram\.me\//i, '')
    .replace(/^https?:\/\/(www\.)?max\.ru\//i, '')
    .replace(/^max:\/\//i, '')
    .trim();
  const normalized = withoutUrl.startsWith('@') ? withoutUrl : `@${withoutUrl}`;

  if (!/^@[A-Za-z0-9_.-]{3,64}$/.test(normalized)) {
    throw new BadRequestException(
      `${channel === 'TELEGRAM' ? 'Telegram' : 'MAX'} alias должен содержать 3-64 символа: латиница, цифры, _, . или -.`,
    );
  }

  return normalized;
}

function messengerMessage(channel: GuestPortalMessengerChannel) {
  return `${
    channel === 'TELEGRAM' ? 'Telegram' : 'MAX'
  } сохранен в гостевом профиле. Реальная отправка сообщений включается отдельно после подключения бота.`;
}

function messengerEventNote(channel: GuestPortalMessengerChannel) {
  return `guest_portal:messenger_link:${channel.toLowerCase()}`;
}

function communicationPreferenceHistoryLabel(
  action: GuestPortalCommunicationPreferenceAction,
) {
  const labels = {
    GRANT: 'Согласие',
    DENY: 'Отказ',
    UNSUBSCRIBE: 'Отписка',
  } satisfies Record<GuestPortalCommunicationPreferenceAction, string>;

  return labels[action];
}

function mapCommunicationPreferenceHistory(
  rows: Array<{
    id: string;
    note: string | null;
    createdAt: Date;
  }>,
): GuestPortalCommunicationHistoryItem[] {
  return rows.flatMap((row) => {
    const note = row.note ?? '';
    const [, rest] = note.split(COMMUNICATION_PREFERENCE_EVENT_PREFIX);
    if (!rest) {
      return [];
    }

    const [rawAction, ...messageParts] = rest.split(': ');
    const action = communicationPreferenceActionOrNull(rawAction);
    if (!action) {
      return [];
    }
    const cleanNote = messageParts.join(': ').trim();

    return [
      {
        id: row.id,
        action,
        label: communicationPreferenceHistoryLabel(action),
        note: cleanNote || communicationPreferenceMessage(action),
        createdAt: row.createdAt.toISOString(),
      },
    ];
  });
}

function buildCommunications(
  guest: {
    phoneMasked: string | null;
    phoneConsentStatus: 'UNKNOWN' | 'GRANTED' | 'DENIED' | 'UNSUBSCRIBED';
    phoneConsentSource: string | null;
    phoneConsentAt: Date | null;
    unsubscribedAt: Date | null;
  } | null,
  profile: {
    contactMasked: string | null;
    telegramIdentity: string | null;
    maxIdentity: string | null;
    phoneConsentStatus: 'UNKNOWN' | 'GRANTED' | 'DENIED' | 'UNSUBSCRIBED';
    phoneConsentSource: string | null;
    phoneConsentAt: Date | null;
    unsubscribedAt: Date | null;
  } | null,
  communicationEvents: Array<{
    id: string;
    note: string | null;
    createdAt: Date;
  }>,
  lead?: {
    phoneMasked: string | null;
    phoneConsentStatus: 'UNKNOWN' | 'GRANTED' | 'DENIED' | 'UNSUBSCRIBED';
    phoneConsentSource: string | null;
    phoneConsentAt: Date | null;
    unsubscribedAt: Date | null;
  } | null,
): GuestPortalCommunications {
  const consentSource = resolvePortalCommunicationConsent(
    guest,
    lead ?? null,
    profile,
  );
  const consentStatus = consentSource?.unsubscribedAt
    ? 'UNSUBSCRIBED'
    : (consentSource?.phoneConsentStatus ?? 'UNKNOWN');
  const consentGranted = consentStatus === 'GRANTED';

  return {
    phone: {
      masked:
        guest?.phoneMasked ??
        lead?.phoneMasked ??
        profile?.contactMasked ??
        null,
      consentStatus,
      consentSource: consentSource?.phoneConsentSource ?? null,
      consentAt: iso(consentSource?.phoneConsentAt ?? null),
      unsubscribedAt: iso(consentSource?.unsubscribedAt ?? null),
      otpVerified: true,
      otpDeliveryReady: false,
    },
    telegram: communicationChannel(
      profile?.telegramIdentity ?? null,
      consentGranted,
      consentStatus,
    ),
    max: communicationChannel(
      profile?.maxIdentity ?? null,
      consentGranted,
      consentStatus,
    ),
    history: mapCommunicationPreferenceHistory(communicationEvents),
  };
}

function gameProfileConsentGrantData(source: string, consentAt?: Date | null) {
  if (!consentAt) {
    return {};
  }

  return {
    phoneConsentStatus: GuestCommunicationConsentStatus.GRANTED,
    phoneConsentSource: source,
    phoneConsentAt: consentAt,
    unsubscribedAt: null,
  };
}

function resolvePortalCommunicationConsent(
  guest: {
    phoneConsentStatus: 'UNKNOWN' | 'GRANTED' | 'DENIED' | 'UNSUBSCRIBED';
    phoneConsentSource: string | null;
    phoneConsentAt: Date | null;
    unsubscribedAt: Date | null;
  } | null,
  lead: {
    phoneConsentStatus: 'UNKNOWN' | 'GRANTED' | 'DENIED' | 'UNSUBSCRIBED';
    phoneConsentSource: string | null;
    phoneConsentAt: Date | null;
    unsubscribedAt: Date | null;
  } | null,
  profile: {
    phoneConsentStatus: 'UNKNOWN' | 'GRANTED' | 'DENIED' | 'UNSUBSCRIBED';
    phoneConsentSource: string | null;
    phoneConsentAt: Date | null;
    unsubscribedAt: Date | null;
  } | null,
) {
  return [guest, lead, profile]
    .filter((source): source is NonNullable<typeof source> => Boolean(source))
    .filter(
      (source) =>
        source.phoneConsentStatus !== 'UNKNOWN' ||
        Boolean(source.phoneConsentAt || source.unsubscribedAt),
    )
    .sort(
      (left, right) =>
        consentSourceTimestamp(right) - consentSourceTimestamp(left),
    )[0];
}

function consentSourceTimestamp(source: {
  phoneConsentStatus: 'UNKNOWN' | 'GRANTED' | 'DENIED' | 'UNSUBSCRIBED';
  phoneConsentAt: Date | null;
  unsubscribedAt: Date | null;
}) {
  const datedAt = source.unsubscribedAt ?? source.phoneConsentAt;

  if (datedAt) {
    return datedAt.getTime();
  }

  return source.phoneConsentStatus === 'UNKNOWN' ? 0 : 1;
}

function communicationChannel(
  identity: string | null,
  consentGranted: boolean,
  consentStatus: GuestPortalCommunications['phone']['consentStatus'],
): GuestPortalCommunicationChannel {
  const normalized = identity?.trim() || null;

  if (consentStatus === 'UNSUBSCRIBED') {
    return {
      connected: Boolean(normalized),
      identityMasked: maskExternalIdentity(normalized),
      readyForRewards: false,
      status: 'UNSUBSCRIBED',
    };
  }

  if (!normalized) {
    return {
      connected: false,
      identityMasked: null,
      readyForRewards: false,
      status: 'NOT_CONNECTED',
    };
  }

  return {
    connected: true,
    identityMasked: maskExternalIdentity(normalized),
    readyForRewards: consentGranted,
    status: consentGranted ? 'READY' : 'CONNECTED_NO_CONSENT',
  };
}

function maskExternalIdentity(value: string | null) {
  if (!value) {
    return null;
  }

  if (value.length <= 4) {
    return '****';
  }

  if (value.startsWith('@')) {
    return `${value.slice(0, 3)}...${value.slice(-2)}`;
  }

  return `${value.slice(0, 2)}...${value.slice(-2)}`;
}

function maskIdentifier(value: string | null) {
  const normalized = value?.trim() ?? '';

  if (!normalized) {
    return null;
  }

  if (normalized.length <= 4) {
    return '****';
  }

  return `${normalized.slice(0, 2)}...${normalized.slice(-2)}`;
}

function emptyActivity(): GuestPortalPayload['activity'] {
  return {
    summary: {
      sessionsCount: 0,
      playMinutes: 0,
      logsCount: 0,
      transactionsCount: 0,
      gameEventsCount: 0,
      lastActivityAt: null,
    },
    timeline: [],
    xpHistory: [],
  };
}

function mapSessionActivity(row: {
  id: string;
  startedAt: Date | null;
  stoppedAt: Date | null;
  durationMinutes: number | null;
  normalStop: boolean | null;
  packet: boolean | null;
  createdAt: Date;
  store: { name: string } | null;
}): GuestPortalActivityItem {
  const description = [
    row.durationMinutes == null ? null : `${row.durationMinutes} мин`,
    row.packet ? 'пакет часов' : 'обычная сессия',
    row.normalStop === false ? 'завершена нестандартно' : null,
  ]
    .filter((item): item is string => Boolean(item))
    .join(' · ');

  return {
    id: `session:${row.id}`,
    kind: 'SESSION',
    title: 'Игровая сессия',
    description: description || null,
    occurredAt: (row.startedAt ?? row.stoppedAt ?? row.createdAt).toISOString(),
    storeName: row.store?.name ?? null,
    amount: null,
    xpDelta: null,
  };
}

function mapLogActivity(row: {
  id: string;
  type: string | null;
  happenedAt: Date | null;
  createdAt: Date;
}): GuestPortalActivityItem {
  return {
    id: `log:${row.id}`,
    kind: 'LOG',
    title: row.type ? `Событие: ${row.type}` : 'Событие профиля',
    description: 'Сохранено из истории Langame',
    occurredAt: (row.happenedAt ?? row.createdAt).toISOString(),
    storeName: null,
    amount: null,
    xpDelta: null,
  };
}

function mapTransactionActivity(row: {
  id: string;
  type: string | null;
  happenedAt: Date | null;
  amount: Prisma.Decimal | null;
  createdAt: Date;
  store: { name: string } | null;
}): GuestPortalActivityItem {
  const amount = decimalNumber(row.amount);

  return {
    id: `transaction:${row.id}`,
    kind: 'TRANSACTION',
    title: row.type ? `Операция: ${row.type}` : 'Операция баланса',
    description:
      amount == null
        ? 'Обновление баланса гостя'
        : `${amount >= 0 ? 'Пополнение' : 'Списание'} ${Math.abs(amount)} руб`,
    occurredAt: (row.happenedAt ?? row.createdAt).toISOString(),
    storeName: row.store?.name ?? null,
    amount,
    xpDelta: null,
  };
}

function mapGameEventActivity(row: {
  id: string;
  eventType: string;
  xpDelta: number;
  occurredAt: Date;
  lootBox: { name: string } | null;
  mission: { name: string } | null;
  season: { name: string } | null;
}): GuestPortalActivityItem {
  const sourceName = row.mission?.name ?? row.lootBox?.name ?? row.season?.name;
  const xpLabel =
    row.xpDelta === 0 ? null : `${row.xpDelta > 0 ? '+' : ''}${row.xpDelta} XP`;
  const description = [sourceName, xpLabel]
    .filter((item): item is string => Boolean(item))
    .join(' · ');

  return {
    id: `game-event:${row.id}`,
    kind: 'GAME_EVENT',
    title: `Игровое событие: ${row.eventType}`,
    description: description || null,
    occurredAt: row.occurredAt.toISOString(),
    storeName: null,
    amount: null,
    xpDelta: row.xpDelta,
  };
}

function mapXpHistory(row: {
  id: string;
  eventType: string;
  xpDelta: number;
  occurredAt: Date;
  lootBox: { name: string } | null;
  mission: { name: string } | null;
  season: { name: string } | null;
}): GuestPortalXpHistoryItem {
  const sourceLabel =
    row.mission?.name ?? row.lootBox?.name ?? row.season?.name;

  return {
    id: `xp:${row.id}`,
    eventType: row.eventType,
    title: row.xpDelta > 0 ? 'XP начислен' : 'XP скорректирован',
    description: sourceLabel
      ? `${sourceLabel}: ${row.eventType}`
      : row.eventType,
    xpDelta: row.xpDelta,
    occurredAt: row.occurredAt.toISOString(),
    sourceLabel: sourceLabel ?? null,
  };
}

function rewardWalletState(
  status: string,
  expiresAt: Date | null,
): GuestPortalReward['walletState'] {
  if (status === 'PAID') {
    return 'REDEEMED';
  }

  if (status === 'CANCELED') {
    return 'CANCELED';
  }

  if (
    status === 'EXPIRED' ||
    (expiresAt !== null && expiresAt.getTime() < Date.now())
  ) {
    return 'EXPIRED';
  }

  if (status === 'APPROVED') {
    return 'READY';
  }

  return 'WAITING_APPROVAL';
}

function buildRewardClaimPayload(rewardId: string, rewardCode: string) {
  return `LEETPLUS_REWARD:${rewardId}:${rewardCode}`;
}

type GuestPortalSeasonLevel = GuestPortalSeason['levels'][number];

function seasonLevels(value: Prisma.JsonValue, xp: number) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }

      const row = item as Record<string, unknown>;
      const level = numberField(row.level);
      const requiredXp = numberField(row.xp);

      if (level == null || requiredXp == null) {
        return null;
      }

      return {
        level,
        xp: requiredXp,
        freeReward: stringField(row.freeReward),
        premiumReward: stringField(row.premiumReward),
        reached: xp >= requiredXp,
        current: false,
        next: false,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((left, right) => left.xp - right.xp || left.level - right.level)
    .slice(0, 12);
}

function buildSeasonProgress(
  levels: GuestPortalSeasonLevel[],
  xp: number,
  rewards: Array<{
    seasonId: string | null;
    status: string;
    expiresAt: Date | null;
  }>,
  seasonId: string,
): Omit<
  GuestPortalSeason,
  'id' | 'name' | 'seasonType' | 'premiumEnabled' | 'periodTo' | 'levels'
> {
  const reached = levels.filter((level) => level.reached);
  const current = reached[reached.length - 1] ?? levels[0] ?? null;
  const next = levels.find((level) => !level.reached) ?? null;
  const currentLevelXp = current?.xp ?? 0;
  const nextLevelXp = next?.xp ?? null;
  const xpToNextLevel =
    typeof nextLevelXp === 'number' ? Math.max(0, nextLevelXp - xp) : null;
  const progressPercent =
    typeof nextLevelXp === 'number'
      ? percent(xp - currentLevelXp, Math.max(1, nextLevelXp - currentLevelXp))
      : 100;
  const seasonRewards = rewards.filter(
    (reward) => reward.seasonId === seasonId,
  );
  const mappedRewards = seasonRewards.map((reward) =>
    rewardWalletState(reward.status, reward.expiresAt),
  );

  levels.forEach((level) => {
    level.current = current ? level.level === current.level : false;
    level.next = next ? level.level === next.level : false;
  });

  return {
    currentLevel: current?.level ?? 1,
    nextLevel: next?.level ?? null,
    currentLevelXp,
    nextLevelXp,
    xpToNextLevel,
    progressPercent,
    reachedLevels: reached.length,
    totalLevels: levels.length,
    readyRewards: mappedRewards.filter((state) => state === 'READY').length,
    waitingApprovalRewards: mappedRewards.filter(
      (state) => state === 'WAITING_APPROVAL',
    ).length,
    redeemedRewards: mappedRewards.filter((state) => state === 'REDEEMED')
      .length,
    nextRewardLabel: next?.freeReward ?? null,
    nextPremiumRewardLabel: next?.premiumReward ?? null,
  };
}

function matchesStore(value: Prisma.JsonValue | null, storeId: string) {
  const storeIds = stringArray(value);
  return storeIds.length === 0 || storeIds.includes(storeId);
}

function activePeriod(from: Date | null, to: Date | null) {
  const now = Date.now();
  return (!from || from.getTime() <= now) && (!to || to.getTime() >= now);
}

function dateWithinMission(
  value: Date,
  mission: { periodFrom: Date | null; periodTo: Date | null },
) {
  return (
    (!mission.periodFrom || value.getTime() >= mission.periodFrom.getTime()) &&
    (!mission.periodTo || value.getTime() <= mission.periodTo.getTime())
  );
}

function stringArray(value: Prisma.JsonValue | null) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function visualLootBoxRefsFromPayload(
  value: Prisma.JsonValue | null,
): GuestPortalVisualLootBoxRef[] {
  const payload = jsonRecord(value);
  const items = Array.isArray(payload.lootBoxes) ? payload.lootBoxes : [];

  return items
    .map((item) => {
      const record = jsonRecord(item);

      return {
        id: stringField(record.id),
        title: stringField(record.title),
      };
    })
    .filter((item) => item.id || item.title);
}

function positiveIntOrNull(value: unknown) {
  const number = numberField(value);

  if (number === null || number <= 0) {
    return null;
  }

  return Math.floor(number);
}

function startOfRollingWeek(value: Date) {
  return new Date(value.getTime() - 7 * 24 * 60 * 60 * 1000);
}

function startOfDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function maxDate(left: Date, right: Date | null) {
  return right && right.getTime() > left.getTime() ? right : left;
}

function lootBoxRestartedAt(limits: Record<string, unknown>) {
  const value = limits.restartedAt;

  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function lootBoxResetToken(limits: Record<string, unknown>) {
  const restartedAt = lootBoxRestartedAt(limits);

  if (!restartedAt) {
    return null;
  }

  return restartedAt.toISOString().replace(/\D/g, '').slice(0, 14);
}

function buildGuestPortalGameExternalId(
  sourceKind: string,
  eventType: string,
  sourceFactId: string,
) {
  return ['guest-game', sourceKind, eventType, sourceFactId].join(':');
}

function isPrismaUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function guestGameTriggerLabel(value: string) {
  switch (value) {
    case 'APP_OPEN':
      return 'открытие приложения или сайта';
    case 'SESSION_START':
      return 'старт игровой сессии';
    case 'CHECK_IN':
      return 'чекин в клубе';
    case 'VISIT':
      return 'визит в клуб';
    case 'PLAY_HOUR':
      return 'час игры';
    case 'BAR_PURCHASE':
      return 'покупка в баре';
    case 'PRODUCT_PURCHASE':
      return 'покупка товара';
    case 'BALANCE_TOPUP':
      return 'пополнение баланса';
    case 'GUEST_LOG':
      return 'событие Langame';
    case 'REFERRAL_ACCEPTED':
      return 'приглашенный друг';
    case 'REPEAT_VISIT':
      return 'повторный визит';
    case 'MISSION_COMPLETED':
      return 'выполненный квест';
    default:
      return value;
  }
}

function portalEventToProgressEvent(row: {
  eventType: string;
  occurredAt: Date;
  payload: Prisma.JsonValue | null;
}): GuestGameProgressEvent {
  const payload = jsonRecord(row.payload);
  const input = jsonRecord(payload.input);
  const store = jsonRecord(payload.store);

  return {
    eventType: row.eventType,
    occurredAt: row.occurredAt,
    storeId: stringField(store.id),
    sessionType: stringField(input.sessionType),
    sessionPacket: booleanField(input.sessionPacket),
    sessionMinutes: numberField(input.sessionMinutes),
    spendAmount: numberField(input.spendAmount),
    tariffGroupId: stringField(input.tariffGroupId),
    tariffPeriodId: stringField(input.tariffPeriodId),
    tariffTypeId: stringField(input.tariffTypeId),
    guestLogType: stringField(input.guestLogType),
    productId: stringField(input.productId),
    externalProductId: stringField(input.externalProductId),
    categoryId: stringField(input.categoryId),
    productName: stringField(input.productName),
    categoryName: stringField(input.categoryName),
    supplierName: stringField(input.supplierName),
    quantity: numberField(input.quantity),
  };
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringField(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberField(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  return null;
}

function booleanField(value: unknown) {
  if (value === true || value === 'true' || value === '1') {
    return true;
  }

  if (value === false || value === 'false' || value === '0') {
    return false;
  }

  return null;
}

function decimalNumber(value: Prisma.Decimal | null | undefined) {
  return value == null ? null : Number(value);
}

function validDateOrNow(value: string) {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function minutePrecisionDate(value: Date) {
  const date = new Date(value);
  date.setSeconds(0, 0);

  return date;
}

function portalLiveBalancePayloadHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function moneyNumber(value: number) {
  return Math.round(value * 100) / 100;
}

function emptyGameProfileBackfillSummary(): GuestPortalGameProfileBackfillSummary {
  return {
    rewards: 0,
    events: 0,
    deliveries: 0,
    bonusLedgerEntries: 0,
  };
}

function percent(value: number, total: number) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

function newestDate(values: Array<Date | null>) {
  return values
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => right.getTime() - left.getTime())[0];
}

function levelFromXp(xp: number) {
  return Math.max(1, Math.floor(xp / 500) + 1);
}

function frameForLevel(level: number): GuestPortalPayload['profile']['frame'] {
  if (level >= 20) {
    return 'diamond';
  }
  if (level >= 12) {
    return 'gold';
  }
  if (level >= 6) {
    return 'silver';
  }
  if (level >= 2) {
    return 'bronze';
  }
  return 'starter';
}

function iso(value: Date | null) {
  return value ? value.toISOString() : null;
}
