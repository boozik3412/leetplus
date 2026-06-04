"use client";

import Link from "next/link";
import {
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { GuestAudience, GuestCrmLead, GuestDashboardRow } from "@/lib/guests";
import type {
  GuestGameEvent,
  GuestGameDryRunResult,
  GuestGameGuestLogMappingIntent,
  GuestGameGuestLogMappingPreset,
  GuestGameGuestLogCatalog,
  GuestGameGuestLogTypeMapping,
  GuestGameLootBox,
  GuestGameMission,
  GuestGameProfile,
  GuestGameProfileStatus,
  GuestGamePipelineRunResult,
  GuestGameReward,
  GuestGameRewardStatus,
  GuestGameSeason,
  GuestGameProcessEventResult,
  GuestGameSnapshotFact,
  GuestGameSnapshotFactsResult,
  GuestGameStatus,
  GuestGameTariffSnapshotEndpoint,
  GuestGameTariffSnapshotStatus,
  GuestGamificationWorkspace,
} from "@/lib/guest-gamification";
import type { Store } from "@/lib/stores";

type Props = {
  initialWorkspace: GuestGamificationWorkspace;
  audiences: GuestAudience[];
  stores: Store[];
  guests: GuestDashboardRow[];
  leads: GuestCrmLead[];
  tenantSlug: string;
  access: {
    canManageRules: boolean;
    canApproveRewards: boolean;
    canViewGuestPii: boolean;
  };
};

type TabId =
  | "overview"
  | "profiles"
  | "lootBoxes"
  | "missions"
  | "seasons"
  | "rewards"
  | "testRun";

type GuestLogMappingPayload = {
  rawType: string;
  label: string;
  preset: GuestGameGuestLogMappingPreset;
  intent: GuestGameGuestLogMappingIntent;
  note: string;
};

type ProfileForm = {
  guestId: string;
  leadId: string;
  displayName: string;
  contactMasked: string;
  telegramIdentity: string;
  maxIdentity: string;
  xp: string;
  level: string;
  status: GuestGameProfileStatus;
};

type LootBoxForm = {
  name: string;
  status: GuestGameStatus;
  triggerKind: string;
  rewardType: string;
  rewardAmount: string;
  rewardLabel: string;
  audienceId: string;
  segment: string;
  sessionType: string;
  packetMode: string;
  tariffGroupId: string;
  tariffPeriodId: string;
  tariffTypeId: string;
  guestLogTypes: string;
  blockedGuestLogTypes: string;
  storeIds: string[];
  quietHoursEnabled: boolean;
  weekdaysOnly: boolean;
  hourFrom: string;
  hourTo: string;
  perGuestPerWeek: string;
  totalPerDay: string;
  probabilityXpWeight: string;
  probabilityPromoWeight: string;
  probabilityMissionWeight: string;
  requireCashierConfirmation: boolean;
  oneDevicePerGuest: boolean;
  periodRulesText: string;
  limitsText: string;
  probabilityRulesText: string;
  budgetAmount: string;
  antiFraudText: string;
  manualApprovalRequired: boolean;
  note: string;
};

type MissionForm = {
  name: string;
  status: GuestGameStatus;
  missionType: string;
  triggerKind: string;
  rewardType: string;
  rewardAmount: string;
  rewardLabel: string;
  xpReward: string;
  progressTarget: string;
  progressUnit: string;
  audienceId: string;
  storeIds: string[];
  periodFrom: string;
  periodTo: string;
  budgetAmount: string;
  perGuestLimit: string;
  totalRewardLimit: string;
  sessionType: string;
  packetMode: string;
  tariffGroupId: string;
  tariffPeriodId: string;
  tariffTypeId: string;
  guestLogTypes: string;
  blockedGuestLogTypes: string;
  windowDays: string;
  weekdaysOnly: boolean;
  minSessionMinutes: string;
  minSpendAmount: string;
  questEnabled: boolean;
  questStepOne: string;
  questStepTwo: string;
  questStepThree: string;
  requireLangameFact: boolean;
  denySameDayRepeat: boolean;
  requireCashierConfirmation: boolean;
  conditionsText: string;
  antiFraudText: string;
  manualApprovalRequired: boolean;
  note: string;
};

type SeasonForm = {
  name: string;
  status: GuestGameStatus;
  seasonType: string;
  audienceId: string;
  periodFrom: string;
  periodTo: string;
  xpVisit: string;
  xpPlayHour: string;
  xpBarPurchase: string;
  xpMissionCompletion: string;
  xpPacketSessionBonus: string;
  xpGuestLog: string;
  sessionType: string;
  packetMode: string;
  tariffGroupId: string;
  tariffPeriodId: string;
  tariffTypeId: string;
  guestLogTypes: string;
  blockedGuestLogTypes: string;
  levelCount: string;
  xpPerLevel: string;
  freeRewardEvery: string;
  premiumRewardEvery: string;
  freeRewardLabel: string;
  premiumRewardLabel: string;
  xpRulesText: string;
  levelsText: string;
  freeRewardsText: string;
  premiumRewardsText: string;
  premiumEnabled: boolean;
  premiumUpgradeMode: string;
  budgetAmount: string;
  manualApprovalRequired: boolean;
  note: string;
};

type RewardForm = {
  profileId: string;
  guestId: string;
  lootBoxId: string;
  missionId: string;
  seasonId: string;
  storeId: string;
  status: GuestGameRewardStatus;
  source: string;
  rewardType: string;
  rewardAmount: string;
  rewardLabel: string;
  rewardCode: string;
  expiresAt: string;
  note: string;
  evidenceText: string;
};

type RewardRedeemForm = {
  claim: string;
  storeId: string;
  note: string;
};

type EventForm = {
  profileId: string;
  eventType: string;
  source: string;
  xpDelta: string;
  note: string;
  payloadText: string;
};

type DryRunForm = {
  profileId: string;
  guestId: string;
  storeId: string;
  eventType: string;
  occurredAt: string;
  sessionType: string;
  sessionPacket: string;
  tariffGroupId: string;
  tariffPeriodId: string;
  tariffTypeId: string;
  guestLogType: string;
  sessionMinutes: string;
  spendAmount: string;
  sourceFactId: string;
  sourceFactKind: string;
  externalProvider: string;
  externalDomain: string;
  externalId: string;
};

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Обзор" },
  { id: "profiles", label: "Профили" },
  { id: "lootBoxes", label: "Лутбоксы" },
  { id: "missions", label: "Миссии" },
  { id: "seasons", label: "Battle Pass" },
  { id: "testRun", label: "Тест запуска" },
  { id: "rewards", label: "Кошелек" },
];

const dryRunEventOptions = [
  { value: "SESSION_START", label: "Старт сессии" },
  { value: "VISIT", label: "Визит" },
  { value: "PLAY_HOUR", label: "Час игры" },
  { value: "BAR_PURCHASE", label: "Покупка бара" },
  { value: "PRODUCT_PURCHASE", label: "Товарная покупка" },
  { value: "BALANCE_TOPUP", label: "Пополнение баланса" },
  { value: "GUEST_LOG", label: "Лог гостя" },
  { value: "REPEAT_VISIT", label: "Повторный визит" },
  { value: "MISSION_COMPLETED", label: "Миссия выполнена" },
];

const sessionTypeOptions = [
  { value: "", label: "любой тип" },
  { value: "regular_session", label: "обычная сессия" },
  { value: "packet_hours", label: "пакет часов" },
];

const packetModeOptions = [
  { value: "ANY", label: "любой формат" },
  { value: "PACKET_ONLY", label: "только пакет часов" },
  { value: "NON_PACKET_ONLY", label: "только обычная сессия" },
];

const dryRunPacketOptions = [
  { value: "", label: "не указано" },
  { value: "true", label: "пакет часов" },
  { value: "false", label: "обычная сессия" },
];

const statusLabels: Record<GuestGameStatus, string> = {
  DRAFT: "черновик",
  ACTIVE: "активно",
  PAUSED: "пауза",
  FINISHED: "завершено",
  ARCHIVED: "архив",
};

const profileStatusLabels: Record<GuestGameProfileStatus, string> = {
  ACTIVE: "активен",
  PAUSED: "пауза",
  ARCHIVED: "архив",
};

const rewardStatusLabels: Record<GuestGameRewardStatus, string> = {
  PENDING: "к выдаче",
  APPROVED: "согласовано",
  PAID: "выдано",
  CANCELED: "отменено",
  EXPIRED: "сгорело",
};

const rewardWalletStateLabels: Record<GuestGameReward["walletState"], string> = {
  WAITING_APPROVAL: "ожидает подтверждения",
  READY: "можно выдать",
  REDEEMED: "погашено",
  CANCELED: "отменено",
  EXPIRED: "срок истек",
};

const fieldClass =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white";

const smallButtonClass =
  "rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 dark:text-zinc-200 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-100";

const primaryButtonClass =
  "rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300";

const statusOptions: GuestGameStatus[] = [
  "DRAFT",
  "ACTIVE",
  "PAUSED",
  "FINISHED",
  "ARCHIVED",
];

const profileStatusOptions: GuestGameProfileStatus[] = [
  "ACTIVE",
  "PAUSED",
  "ARCHIVED",
];

const rewardStatusOptions: GuestGameRewardStatus[] = [
  "PENDING",
  "APPROVED",
  "PAID",
  "CANCELED",
  "EXPIRED",
];

const defaultProfileForm: ProfileForm = {
  guestId: "",
  leadId: "",
  displayName: "",
  contactMasked: "",
  telegramIdentity: "",
  maxIdentity: "",
  xp: "0",
  level: "1",
  status: "ACTIVE",
};

const defaultLootBoxForm: LootBoxForm = {
  name: "Лутбокс тихих часов",
  status: "DRAFT",
  triggerKind: "SESSION_START",
  rewardType: "PROMOCODE",
  rewardAmount: "0",
  rewardLabel: "Промокод бара",
  audienceId: "",
  segment: "quiet_hours",
  sessionType: "",
  packetMode: "ANY",
  tariffGroupId: "",
  tariffPeriodId: "",
  tariffTypeId: "",
  guestLogTypes: "",
  blockedGuestLogTypes: "",
  storeIds: [],
  quietHoursEnabled: true,
  weekdaysOnly: true,
  hourFrom: "10:00",
  hourTo: "16:00",
  perGuestPerWeek: "1",
  totalPerDay: "30",
  probabilityXpWeight: "50",
  probabilityPromoWeight: "30",
  probabilityMissionWeight: "20",
  requireCashierConfirmation: true,
  oneDevicePerGuest: true,
  periodRulesText: jsonText({
    weekdays: [1, 2, 3, 4, 5],
    hours: ["10:00-16:00"],
    packetMode: "ANY",
  }),
  limitsText: jsonText({
    perGuestPerWeek: 1,
    totalPerDay: 30,
  }),
  probabilityRulesText: jsonText({
    type: "weighted",
    items: [
      { label: "XP Battle Pass", weight: 50 },
      { label: "Промокод бара", weight: 30 },
      { label: "Миссия на повторный визит", weight: 20 },
    ],
  }),
  budgetAmount: "5000",
  antiFraudText: jsonText({
    requiresCashierConfirmation: true,
    oneDevicePerGuest: true,
  }),
  manualApprovalRequired: true,
  note: "Выдача только после проверки администратором.",
};

const defaultMissionForm: MissionForm = {
  name: "Вернись в будний день",
  status: "DRAFT",
  missionType: "REPEAT_VISIT",
  triggerKind: "REPEAT_VISIT",
  rewardType: "PROMOCODE",
  rewardAmount: "0",
  rewardLabel: "Промокод на бар",
  xpReward: "80",
  progressTarget: "1",
  progressUnit: "visit",
  audienceId: "",
  storeIds: [],
  periodFrom: "",
  periodTo: "",
  budgetAmount: "7000",
  perGuestLimit: "1",
  totalRewardLimit: "100",
  sessionType: "",
  packetMode: "ANY",
  tariffGroupId: "",
  tariffPeriodId: "",
  tariffTypeId: "",
  guestLogTypes: "",
  blockedGuestLogTypes: "",
  windowDays: "7",
  weekdaysOnly: true,
  minSessionMinutes: "90",
  minSpendAmount: "0",
  questEnabled: false,
  questStepOne: "Сыграть сессию от 90 минут",
  questStepTwo: "Купить напиток или снек",
  questStepThree: "Вернуться в будний день",
  requireLangameFact: true,
  denySameDayRepeat: true,
  requireCashierConfirmation: true,
  conditionsText: jsonText({
    windowDays: 7,
    weekdaysOnly: true,
    packetMode: "ANY",
    requiresLangameFact: true,
  }),
  antiFraudText: jsonText({
    denySameDayRepeat: true,
    requiresCashierConfirmation: true,
  }),
  manualApprovalRequired: true,
  note: "Факт визита берем из Langame, выдачу подтверждает кассир.",
};

const defaultSeasonForm: SeasonForm = {
  name: "Клубный сезон",
  status: "DRAFT",
  seasonType: "CLUB_SEASON",
  audienceId: "",
  periodFrom: "",
  periodTo: "",
  xpVisit: "20",
  xpPlayHour: "10",
  xpBarPurchase: "25",
  xpMissionCompletion: "50",
  xpPacketSessionBonus: "15",
  xpGuestLog: "5",
  sessionType: "",
  packetMode: "ANY",
  tariffGroupId: "",
  tariffPeriodId: "",
  tariffTypeId: "",
  guestLogTypes: "",
  blockedGuestLogTypes: "",
  levelCount: "4",
  xpPerLevel: "250",
  freeRewardEvery: "2",
  premiumRewardEvery: "2",
  freeRewardLabel: "Промокод бара",
  premiumRewardLabel: "Усиленный промокод",
  xpRulesText: jsonText({
    visit: 20,
    playHour: 10,
    barPurchase: 25,
    missionCompletion: 50,
    packetSessionBonus: 15,
    packetMode: "ANY",
  }),
  levelsText: jsonText([
    { level: 1, xp: 0, freeReward: "Старт сезона" },
    { level: 2, xp: 250, freeReward: "Промокод бара" },
    { level: 3, xp: 500, freeReward: "Бонус на следующий визит" },
    { level: 4, xp: 900, freeReward: "Игровое время с подтверждением" },
  ]),
  freeRewardsText: jsonText([
    { level: 2, reward: "Промокод бара" },
    { level: 4, reward: "Бонус на следующий визит" },
  ]),
  premiumRewardsText: jsonText([
    { level: 2, reward: "Усиленный промокод" },
    { level: 4, reward: "Турнирный билет" },
  ]),
  premiumEnabled: false,
  premiumUpgradeMode: "manual",
  budgetAmount: "15000",
  manualApprovalRequired: true,
  note: "Premium включается вручную после оплаты или решения управляющего.",
};

const defaultRewardForm: RewardForm = {
  profileId: "",
  guestId: "",
  lootBoxId: "",
  missionId: "",
  seasonId: "",
  storeId: "",
  status: "PENDING",
  source: "MANUAL",
  rewardType: "PROMOCODE",
  rewardAmount: "0",
  rewardLabel: "Ручная награда",
  rewardCode: "",
  expiresAt: "",
  note: "",
  evidenceText: jsonText({
    cashierReview: true,
  }),
};

const defaultRewardRedeemForm: RewardRedeemForm = {
  claim: "",
  storeId: "",
  note: "",
};

const defaultEventForm: EventForm = {
  profileId: "",
  eventType: "MANUAL_XP",
  source: "MANUAL",
  xpDelta: "50",
  note: "",
  payloadText: jsonText({
    reason: "manual_adjustment",
  }),
};

const emptyDryRunSource = {
  sourceFactId: "",
  sourceFactKind: "",
  externalProvider: "",
  externalDomain: "",
  externalId: "",
};

const defaultDryRunForm: DryRunForm = {
  profileId: "",
  guestId: "",
  storeId: "",
  eventType: "SESSION_START",
  occurredAt: "",
  sessionType: "",
  sessionPacket: "",
  tariffGroupId: "",
  tariffPeriodId: "",
  tariffTypeId: "",
  guestLogType: "",
  sessionMinutes: "120",
  spendAmount: "0",
  ...emptyDryRunSource,
};

export function GuestGamificationPanel({
  initialWorkspace,
  audiences,
  stores,
  guests,
  leads,
  tenantSlug,
  access,
}: Props) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [profileForm, setProfileForm] =
    useState<ProfileForm>(defaultProfileForm);
  const [lootBoxForm, setLootBoxForm] =
    useState<LootBoxForm>(defaultLootBoxForm);
  const [missionForm, setMissionForm] =
    useState<MissionForm>(defaultMissionForm);
  const [seasonForm, setSeasonForm] = useState<SeasonForm>(defaultSeasonForm);
  const [rewardForm, setRewardForm] = useState<RewardForm>(defaultRewardForm);
  const [rewardRedeemForm, setRewardRedeemForm] =
    useState<RewardRedeemForm>(defaultRewardRedeemForm);
  const [eventForm, setEventForm] = useState<EventForm>(defaultEventForm);
  const [dryRunForm, setDryRunForm] =
    useState<DryRunForm>(defaultDryRunForm);
  const [dryRunResult, setDryRunResult] =
    useState<GuestGameDryRunResult | null>(null);
  const [processEventResult, setProcessEventResult] =
    useState<GuestGameProcessEventResult | null>(null);
  const [snapshotFacts, setSnapshotFacts] =
    useState<GuestGameSnapshotFactsResult | null>(null);
  const [pipelineResult, setPipelineResult] =
    useState<GuestGamePipelineRunResult | null>(null);
  const [redeemedReward, setRedeemedReward] =
    useState<GuestGameReward | null>(null);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editingLootBoxId, setEditingLootBoxId] = useState<string | null>(null);
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null);
  const [editingSeasonId, setEditingSeasonId] = useState<string | null>(null);
  const [editingRewardId, setEditingRewardId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredProfiles = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return workspace.profiles;
    }

    return workspace.profiles.filter((profile) =>
      [
        profile.displayName,
        profile.contactMasked,
        profile.telegramIdentity,
        profile.maxIdentity,
        profile.guest?.externalGuestId,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized)),
    );
  }, [workspace.profiles, query]);

  const pendingRewards = useMemo(
    () =>
      workspace.rewards.filter((reward) =>
        ["PENDING", "APPROVED"].includes(reward.status),
      ),
    [workspace.rewards],
  );

  function editProfile(profile: GuestGameProfile) {
    setProfileForm(profileToForm(profile));
    setEditingProfileId(profile.id);
    setActiveTab("profiles");
  }

  function resetProfileForm() {
    setProfileForm(defaultProfileForm);
    setEditingProfileId(null);
  }

  function editLootBox(lootBox: GuestGameLootBox) {
    setLootBoxForm(lootBoxToForm(lootBox));
    setEditingLootBoxId(lootBox.id);
    setActiveTab("lootBoxes");
  }

  function resetLootBoxForm() {
    setLootBoxForm(defaultLootBoxForm);
    setEditingLootBoxId(null);
  }

  function editMission(mission: GuestGameMission) {
    setMissionForm(missionToForm(mission));
    setEditingMissionId(mission.id);
    setActiveTab("missions");
  }

  function resetMissionForm() {
    setMissionForm(defaultMissionForm);
    setEditingMissionId(null);
  }

  function editSeason(season: GuestGameSeason) {
    setSeasonForm(seasonToForm(season));
    setEditingSeasonId(season.id);
    setActiveTab("seasons");
  }

  function resetSeasonForm() {
    setSeasonForm(defaultSeasonForm);
    setEditingSeasonId(null);
  }

  function editReward(reward: GuestGameReward) {
    setRewardForm(rewardToForm(reward));
    setEditingRewardId(reward.id);
    setActiveTab("rewards");
  }

  function resetRewardForm() {
    setRewardForm(defaultRewardForm);
    setEditingRewardId(null);
  }

  async function reloadWorkspace() {
    const next = await fetchJson<GuestGamificationWorkspace>(
      "/api/guests/gamification/workspace",
    );
    setWorkspace(next);
  }

  async function saveProfile() {
    await saveAction("profile", async () => {
      assertCan(
        access.canManageRules,
        "Для изменения игровых профилей нужно право `Геймификация: правила`.",
      );

      const payload = {
        guestId: nullable(profileForm.guestId),
        leadId: nullable(profileForm.leadId),
        displayName: nullable(profileForm.displayName),
        contactMasked: nullable(profileForm.contactMasked),
        telegramIdentity: nullable(profileForm.telegramIdentity),
        maxIdentity: nullable(profileForm.maxIdentity),
        xp: profileForm.xp,
        level: profileForm.level,
        status: profileForm.status,
      };

      if (editingProfileId) {
        await patchJson(
          `/api/guests/gamification/profiles/${editingProfileId}`,
          payload,
        );
      } else {
        await postJson("/api/guests/gamification/profiles", payload);
      }

      resetProfileForm();
      await reloadWorkspace();
    });
  }

  async function updateProfileStatus(
    profile: GuestGameProfile,
    status: GuestGameProfileStatus,
  ) {
    await saveAction(`profile-${profile.id}`, async () => {
      assertCan(
        access.canManageRules,
        "Для изменения статуса профиля нужно право `Геймификация: правила`.",
      );

      await patchJson(`/api/guests/gamification/profiles/${profile.id}`, {
        status,
      });
      await reloadWorkspace();
    });
  }

  async function saveLootBox() {
    await saveAction("lootBox", async () => {
      assertCan(
        access.canManageRules,
        "Для изменения лутбоксов нужно право `Геймификация: правила`.",
      );

      const payload = {
        name: lootBoxForm.name,
        status: lootBoxForm.status,
        triggerKind: lootBoxForm.triggerKind,
        rewardType: lootBoxForm.rewardType,
        rewardAmount: lootBoxForm.rewardAmount,
        rewardLabel: nullable(lootBoxForm.rewardLabel),
        audienceId: nullable(lootBoxForm.audienceId),
        segment: nullable(lootBoxForm.segment),
        sessionType: nullable(lootBoxForm.sessionType),
        storeIds: lootBoxForm.storeIds,
        periodRules: buildLootBoxPeriodRules(lootBoxForm),
        limits: buildLootBoxLimits(lootBoxForm),
        probabilityRules: buildLootBoxProbabilityRules(lootBoxForm),
        budgetAmount: lootBoxForm.budgetAmount,
        antiFraudRules: buildLootBoxAntiFraudRules(lootBoxForm),
        manualApprovalRequired: lootBoxForm.manualApprovalRequired,
        note: nullable(lootBoxForm.note),
      };

      if (editingLootBoxId) {
        await patchJson(
          `/api/guests/gamification/loot-boxes/${editingLootBoxId}`,
          payload,
        );
      } else {
        await postJson("/api/guests/gamification/loot-boxes", payload);
      }

      resetLootBoxForm();
      await reloadWorkspace();
    });
  }

  async function saveMission() {
    await saveAction("mission", async () => {
      assertCan(
        access.canManageRules,
        "Для изменения миссий нужно право `Геймификация: правила`.",
      );

      const payload = {
        name: missionForm.name,
        status: missionForm.status,
        missionType: missionForm.missionType,
        triggerKind: missionForm.triggerKind,
        rewardType: missionForm.rewardType,
        rewardAmount: missionForm.rewardAmount,
        rewardLabel: nullable(missionForm.rewardLabel),
        xpReward: missionForm.xpReward,
        progressTarget: missionForm.progressTarget,
        progressUnit: nullable(missionForm.progressUnit),
        audienceId: nullable(missionForm.audienceId),
        storeIds: missionForm.storeIds,
        periodFrom: nullable(missionForm.periodFrom),
        periodTo: nullable(missionForm.periodTo),
        budgetAmount: missionForm.budgetAmount,
        perGuestLimit: missionForm.perGuestLimit,
        totalRewardLimit: missionForm.totalRewardLimit,
        conditions: buildMissionConditions(missionForm),
        antiFraudRules: buildMissionAntiFraudRules(missionForm),
        manualApprovalRequired: missionForm.manualApprovalRequired,
        note: nullable(missionForm.note),
      };

      if (editingMissionId) {
        await patchJson(
          `/api/guests/gamification/missions/${editingMissionId}`,
          payload,
        );
      } else {
        await postJson("/api/guests/gamification/missions", payload);
      }

      resetMissionForm();
      await reloadWorkspace();
    });
  }

  async function saveSeason() {
    await saveAction("season", async () => {
      assertCan(
        access.canManageRules,
        "Для изменения Battle Pass нужно право `Геймификация: правила`.",
      );

      const payload = {
        name: seasonForm.name,
        status: seasonForm.status,
        seasonType: seasonForm.seasonType,
        audienceId: nullable(seasonForm.audienceId),
        periodFrom: nullable(seasonForm.periodFrom),
        periodTo: nullable(seasonForm.periodTo),
        xpRules: buildSeasonXpRules(seasonForm),
        levels: buildSeasonLevels(seasonForm),
        freeRewards: buildSeasonRewards(seasonForm, "free"),
        premiumRewards: buildSeasonRewards(seasonForm, "premium"),
        premiumEnabled: seasonForm.premiumEnabled,
        premiumUpgradeMode: nullable(seasonForm.premiumUpgradeMode),
        budgetAmount: seasonForm.budgetAmount,
        manualApprovalRequired: seasonForm.manualApprovalRequired,
        note: nullable(seasonForm.note),
      };

      if (editingSeasonId) {
        await patchJson(
          `/api/guests/gamification/seasons/${editingSeasonId}`,
          payload,
        );
      } else {
        await postJson("/api/guests/gamification/seasons", payload);
      }

      resetSeasonForm();
      await reloadWorkspace();
    });
  }

  async function saveReward() {
    await saveAction("reward", async () => {
      assertCan(
        access.canApproveRewards,
        "Для изменения наград нужно право `Геймификация: награды`.",
      );

      const payload = {
        profileId: nullable(rewardForm.profileId),
        guestId: nullable(rewardForm.guestId),
        lootBoxId: nullable(rewardForm.lootBoxId),
        missionId: nullable(rewardForm.missionId),
        seasonId: nullable(rewardForm.seasonId),
        storeId: nullable(rewardForm.storeId),
        status: rewardForm.status,
        source: rewardForm.source,
        rewardType: rewardForm.rewardType,
        rewardAmount: rewardForm.rewardAmount,
        rewardLabel: rewardForm.rewardLabel,
        rewardCode: nullable(rewardForm.rewardCode),
        expiresAt: nullable(rewardForm.expiresAt),
        note: nullable(rewardForm.note),
        evidence: parseJson(rewardForm.evidenceText, "доказательства"),
      };

      if (editingRewardId) {
        await patchJson(
          `/api/guests/gamification/rewards/${editingRewardId}`,
          payload,
        );
      } else {
        await postJson("/api/guests/gamification/rewards", payload);
      }

      resetRewardForm();
      await reloadWorkspace();
    });
  }

  async function saveEvent() {
    await saveAction("event", async () => {
      assertCan(
        access.canManageRules,
        "Для ручного создания игровых событий нужно право `Геймификация: правила`.",
      );

      await postJson("/api/guests/gamification/events", {
        profileId: nullable(eventForm.profileId),
        eventType: eventForm.eventType,
        source: eventForm.source,
        xpDelta: eventForm.xpDelta,
        note: nullable(eventForm.note),
        payload: parseJson(eventForm.payloadText, "payload события"),
      });
      setEventForm(defaultEventForm);
      await reloadWorkspace();
    });
  }

  async function runDryRun() {
    await saveAction("dryRun", async () => {
      const result = await postJson<GuestGameDryRunResult>(
        "/api/guests/gamification/dry-run",
        {
          profileId: nullable(dryRunForm.profileId),
          guestId: nullable(dryRunForm.guestId),
          storeId: nullable(dryRunForm.storeId),
          eventType: dryRunForm.eventType,
          occurredAt: nullable(dryRunForm.occurredAt),
          sessionType: nullable(dryRunForm.sessionType),
          sessionPacket: nullable(dryRunForm.sessionPacket),
          tariffGroupId: nullable(dryRunForm.tariffGroupId),
          tariffPeriodId: nullable(dryRunForm.tariffPeriodId),
          tariffTypeId: nullable(dryRunForm.tariffTypeId),
          guestLogType: nullable(dryRunForm.guestLogType),
          sessionMinutes: dryRunForm.sessionMinutes,
          spendAmount: dryRunForm.spendAmount,
        },
      );

      setDryRunResult(result);
      setProcessEventResult(null);
    });
  }

  async function processDryRunEvent() {
    await saveAction("processEvent", async () => {
      assertCan(
        access.canManageRules,
        "Для подтвержденного запуска события нужно право `Геймификация: правила`.",
      );

      const result = await postJson<GuestGameProcessEventResult>(
        "/api/guests/gamification/process-event",
        {
          profileId: nullable(dryRunForm.profileId),
          guestId: nullable(dryRunForm.guestId),
          storeId: nullable(dryRunForm.storeId),
          eventType: dryRunForm.eventType,
          occurredAt: nullable(dryRunForm.occurredAt),
          sessionType: nullable(dryRunForm.sessionType),
          sessionPacket: nullable(dryRunForm.sessionPacket),
          tariffGroupId: nullable(dryRunForm.tariffGroupId),
          tariffPeriodId: nullable(dryRunForm.tariffPeriodId),
          tariffTypeId: nullable(dryRunForm.tariffTypeId),
          guestLogType: nullable(dryRunForm.guestLogType),
          sessionMinutes: dryRunForm.sessionMinutes,
          spendAmount: dryRunForm.spendAmount,
          sourceFactId: nullable(dryRunForm.sourceFactId),
          sourceFactKind: nullable(dryRunForm.sourceFactKind),
          externalProvider: nullable(dryRunForm.externalProvider),
          externalDomain: nullable(dryRunForm.externalDomain),
          externalId: nullable(dryRunForm.externalId),
        },
      );

      setDryRunResult(result.dryRun);
      setProcessEventResult(result);
      await reloadWorkspace();
    });
  }

  async function loadSnapshotFacts() {
    await saveAction("facts", async () => {
      const result = await fetchJson<GuestGameSnapshotFactsResult>(
        "/api/guests/gamification/facts",
      );
      setSnapshotFacts(result);
    });
  }

  async function runSnapshotPipeline(dryRunOnly: boolean) {
    await saveAction(dryRunOnly ? "pipelinePreview" : "pipelineRun", async () => {
      if (!dryRunOnly) {
        assertCan(
          access.canManageRules,
          "Для batch-обработки snapshot-фактов нужно право `Геймификация: правила`.",
        );
      }

      const result = await postJson<GuestGamePipelineRunResult>(
        "/api/guests/gamification/pipeline/run",
        {
          limit: 20,
          dryRunOnly,
        },
      );

      setPipelineResult(result);
      setProcessEventResult(null);

      if (!dryRunOnly) {
        await reloadWorkspace();
      }
    });
  }

  async function saveGuestLogTypeMapping(payload: GuestLogMappingPayload) {
    await saveAction("guestLogMapping", async () => {
      assertCan(
        access.canManageRules,
        "Для настройки типов guests/logs нужно право `Геймификация: правила`.",
      );

      await postJson("/api/guests/gamification/guest-log-mappings", payload);
      await reloadWorkspace();
    });
  }

  async function deleteGuestLogTypeMapping(
    mapping: GuestGameGuestLogTypeMapping,
  ) {
    await saveAction("guestLogMapping", async () => {
      assertCan(
        access.canManageRules,
        "Для настройки типов guests/logs нужно право `Геймификация: правила`.",
      );

      await deleteJson(`/api/guests/gamification/guest-log-mappings/${mapping.id}`);
      await reloadWorkspace();
    });
  }

  function applySnapshotFact(fact: GuestGameSnapshotFact) {
    setDryRunForm((current) => ({
      ...current,
      profileId: "",
      guestId: fact.guest?.id ?? current.guestId,
      storeId: fact.store?.id ?? current.storeId,
      eventType: fact.eventType,
      occurredAt: dateInputValue(fact.occurredAt),
      sessionType: fact.sessionType ?? current.sessionType,
      sessionPacket:
        fact.sessionPacket == null ? current.sessionPacket : String(fact.sessionPacket),
      tariffGroupId: fact.tariffGroupId ?? current.tariffGroupId,
      tariffPeriodId: fact.tariffPeriodId ?? current.tariffPeriodId,
      tariffTypeId: fact.tariffTypeId ?? current.tariffTypeId,
      guestLogType: fact.guestLogType ?? current.guestLogType,
      sessionMinutes:
        fact.sessionMinutes == null
          ? current.sessionMinutes
          : String(fact.sessionMinutes),
      spendAmount:
        fact.spendAmount == null ? current.spendAmount : String(fact.spendAmount),
      sourceFactId: fact.id,
      sourceFactKind: fact.source,
      externalProvider: fact.externalProvider ?? "",
      externalDomain: fact.externalDomain ?? "",
      externalId: fact.externalId ?? "",
    }));
    setDryRunResult(null);
    setProcessEventResult(null);
    setPipelineResult(null);
  }

  async function updateRewardStatus(
    reward: GuestGameReward,
    status: GuestGameRewardStatus,
  ) {
    await saveAction(`reward-${reward.id}`, async () => {
      assertCan(
        access.canApproveRewards,
        "Для изменения статуса награды нужно право `Геймификация: награды`.",
      );

      await patchJson(`/api/guests/gamification/rewards/${reward.id}`, {
        status,
      });
      await reloadWorkspace();
    });
  }

  async function redeemReward() {
    await saveAction("rewardRedeem", async () => {
      assertCan(
        access.canApproveRewards,
        "Для кассирского погашения награды нужно право `Геймификация: награды`.",
      );

      const reward = await postJson<GuestGameReward>(
        "/api/guests/gamification/rewards/redeem",
        {
          claim: nullable(rewardRedeemForm.claim),
          storeId: nullable(rewardRedeemForm.storeId),
          note: nullable(rewardRedeemForm.note),
        },
      );

      setRedeemedReward(reward);
      setRewardRedeemForm((current) => ({
        ...defaultRewardRedeemForm,
        storeId: current.storeId,
      }));
      await reloadWorkspace();
    });
  }

  async function updateRuleStatus(
    type: "loot-boxes" | "missions" | "seasons",
    id: string,
    status: GuestGameStatus,
  ) {
    await saveAction(`${type}-${id}`, async () => {
      assertCan(
        access.canManageRules,
        "Для изменения статуса правила нужно право `Геймификация: правила`.",
      );

      await patchJson(`/api/guests/gamification/${type}/${id}`, { status });
      await reloadWorkspace();
    });
  }

  async function saveAction(key: string, action: () => Promise<void>) {
    setSaving(key);
    setError(null);

    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
              Геймификация гостей
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-950 dark:text-white">
              Guest Game Hub: XP, миссии, лутбоксы и кошелек
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              Здесь живет постоянная игровая экономика гостя: профиль, уровень,
              прогресс, правила, Battle Pass и награды. Разовые маркетинговые
              офферы и промо-эффект кампаний настраиваются отдельно.
            </p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            Автоматическая запись наград в Langame выключена: выдача идет через
            ручное подтверждение, код или кассира.
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
            <p className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Здесь: игровая экономика
            </p>
            <h2 className="mt-1 font-semibold text-zinc-950 dark:text-white">
              Долгий прогресс гостя
            </h2>
            <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              XP, уровни, лутбоксы, игровые миссии, Battle Pass, кошелек
              наград, safe dry-run и batch по подготовленным snapshot-фактам.
            </p>
          </div>
          <Link
            href="/marketing/missions"
            className="rounded-lg border border-zinc-200 p-4 transition hover:border-emerald-500/70 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            <p className="text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">
              Маркетинг
            </p>
            <h2 className="mt-1 font-semibold text-zinc-950 dark:text-white">
              Промо-сценарии кампаний
            </h2>
            <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              Тихие часы, повторный визит, бар, события, аудитории, бюджеты
              и ручная очередь выдачи для измеримого промо-эффекта.
            </p>
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Игровые профили" value={workspace.summary.profilesCount} />
          <StatCard label="XP в системе" value={workspace.summary.totalXp} />
          <StatCard label="Награды к выдаче" value={workspace.summary.pendingRewards} />
          <StatCard
            label="Плановый бюджет"
            value={formatMoney(workspace.summary.plannedBudget)}
          />
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </div>
        ) : null}

        {!access.canManageRules || !access.canApproveRewards ? (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-300">
            Ваш доступ ограничен:{" "}
            {!access.canManageRules
              ? "редактирование правил и подтвержденные запуски недоступны"
              : "правила доступны"}
            ,{" "}
            {!access.canApproveRewards
              ? "выдача и погашение наград недоступны"
              : "награды доступны"}
            . Просмотр и безопасный dry-run остаются доступными.
          </div>
        ) : null}
      </section>

      <div className="flex gap-2 overflow-x-auto border-b border-zinc-200 pb-2 dark:border-zinc-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={[
              "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition",
              activeTab === tab.id
                ? "bg-zinc-950 text-white dark:bg-emerald-400 dark:text-zinc-950"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" ? (
        <OverviewTab
          workspace={workspace}
          pendingRewards={pendingRewards}
          onRewardStatus={updateRewardStatus}
          onEditReward={editReward}
          onOpenTab={setActiveTab}
          saving={saving}
          tenantSlug={tenantSlug}
          stores={stores}
          canApproveRewards={access.canApproveRewards}
          canManageRules={access.canManageRules}
          onSaveGuestLogMapping={saveGuestLogTypeMapping}
          onDeleteGuestLogMapping={deleteGuestLogTypeMapping}
        />
      ) : null}

      {activeTab === "profiles" ? (
        <ProfilesTab
          form={profileForm}
          setForm={setProfileForm}
          guests={guests}
          leads={leads}
          profiles={filteredProfiles}
          query={query}
          setQuery={setQuery}
          eventForm={eventForm}
          setEventForm={setEventForm}
          editingProfileId={editingProfileId}
          onSaveProfile={saveProfile}
          onEditProfile={editProfile}
          onResetProfile={resetProfileForm}
          onSaveEvent={saveEvent}
          onProfileStatus={updateProfileStatus}
          saving={saving}
          canManage={access.canManageRules}
        />
      ) : null}

      {activeTab === "lootBoxes" ? (
        <LootBoxesTab
          form={lootBoxForm}
          setForm={setLootBoxForm}
          lootBoxes={workspace.lootBoxes}
          audiences={audiences}
          stores={stores}
          tariffSnapshots={workspace.tariffSnapshots}
          guestLogCatalog={workspace.guestLogCatalog}
          editingId={editingLootBoxId}
          onSave={saveLootBox}
          onEdit={editLootBox}
          onReset={resetLootBoxForm}
          onStatus={updateRuleStatus}
          saving={saving}
          canManage={access.canManageRules}
        />
      ) : null}

      {activeTab === "missions" ? (
        <MissionsTab
          form={missionForm}
          setForm={setMissionForm}
          missions={workspace.missions}
          audiences={audiences}
          stores={stores}
          tariffSnapshots={workspace.tariffSnapshots}
          guestLogCatalog={workspace.guestLogCatalog}
          editingId={editingMissionId}
          onSave={saveMission}
          onEdit={editMission}
          onReset={resetMissionForm}
          onStatus={updateRuleStatus}
          saving={saving}
          canManage={access.canManageRules}
        />
      ) : null}

      {activeTab === "seasons" ? (
        <SeasonsTab
          form={seasonForm}
          setForm={setSeasonForm}
          seasons={workspace.seasons}
          audiences={audiences}
          tariffSnapshots={workspace.tariffSnapshots}
          guestLogCatalog={workspace.guestLogCatalog}
          editingId={editingSeasonId}
          onSave={saveSeason}
          onEdit={editSeason}
          onReset={resetSeasonForm}
          onStatus={updateRuleStatus}
          saving={saving}
          canManage={access.canManageRules}
        />
      ) : null}

      {activeTab === "rewards" ? (
        <RewardsTab
          form={rewardForm}
          setForm={setRewardForm}
          redeemForm={rewardRedeemForm}
          setRedeemForm={setRewardRedeemForm}
          redeemedReward={redeemedReward}
          rewards={workspace.rewards}
          profiles={workspace.profiles}
          guests={guests}
          stores={stores}
          lootBoxes={workspace.lootBoxes}
          missions={workspace.missions}
          seasons={workspace.seasons}
          editingId={editingRewardId}
          onSave={saveReward}
          onEdit={editReward}
          onReset={resetRewardForm}
          onStatus={updateRewardStatus}
          onRedeem={redeemReward}
          saving={saving}
          canApprove={access.canApproveRewards}
        />
      ) : null}

      {activeTab === "testRun" ? (
        <DryRunTab
          form={dryRunForm}
          setForm={setDryRunForm}
          result={dryRunResult}
          processResult={processEventResult}
          profiles={workspace.profiles}
          guests={guests}
          stores={stores}
          tariffSnapshots={workspace.tariffSnapshots}
          guestLogCatalog={workspace.guestLogCatalog}
          snapshotFacts={snapshotFacts}
          pipelineResult={pipelineResult}
          onRun={runDryRun}
          onProcess={processDryRunEvent}
          onLoadFacts={loadSnapshotFacts}
          onApplyFact={applySnapshotFact}
          onPipelineRun={runSnapshotPipeline}
          saving={saving}
          canManage={access.canManageRules}
        />
      ) : null}
    </div>
  );
}

function assertCan(allowed: boolean, message: string) {
  if (!allowed) {
    throw new Error(message);
  }
}

function DryRunTab({
  form,
  setForm,
  result,
  processResult,
  profiles,
  guests,
  stores,
  tariffSnapshots,
  guestLogCatalog,
  snapshotFacts,
  pipelineResult,
  onRun,
  onProcess,
  onLoadFacts,
  onApplyFact,
  onPipelineRun,
  saving,
  canManage,
}: {
  form: DryRunForm;
  setForm: Dispatch<SetStateAction<DryRunForm>>;
  result: GuestGameDryRunResult | null;
  processResult: GuestGameProcessEventResult | null;
  profiles: GuestGameProfile[];
  guests: GuestDashboardRow[];
  stores: Store[];
  tariffSnapshots: GuestGameTariffSnapshotEndpoint[];
  guestLogCatalog: GuestGameGuestLogCatalog;
  snapshotFacts: GuestGameSnapshotFactsResult | null;
  pipelineResult: GuestGamePipelineRunResult | null;
  onRun: () => Promise<void>;
  onProcess: () => Promise<void>;
  onLoadFacts: () => Promise<void>;
  onApplyFact: (fact: GuestGameSnapshotFact) => void;
  onPipelineRun: (dryRunOnly: boolean) => Promise<void>;
  saving: string | null;
  canManage: boolean;
}) {
  const isRunning = saving === "dryRun";
  const isLoadingFacts = saving === "facts";
  const isProcessing = saving === "processEvent";
  const isPipelinePreview = saving === "pipelinePreview";
  const isPipelineRunning = saving === "pipelineRun";
  const canProcess =
    Boolean(result) &&
    Boolean(form.profileId || form.guestId || result?.profile || result?.guest) &&
    ((result?.summary.eligibleRules ?? 0) > 0 ||
      (result?.summary.projectedXpDelta ?? 0) > 0);

  function update<K extends keyof DryRunForm>(key: K, value: DryRunForm[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...emptyDryRunSource,
    }));
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <SectionTitle title="Тест запуска" />
            <p className="mt-2 max-w-3xl text-sm text-zinc-500 dark:text-zinc-400">
              Проверьте, что произойдет при событии гостя: какие лутбоксы,
              миссии и Battle Pass сработают, где есть блокировки, сколько XP и
              рублей попадет в очередь выдачи.
            </p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
            Награды, события и записи в Langame не создаются
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                Факты Langame snapshot
              </p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Загрузите последние сохраненные сессии, покупки, товарные продажи, логи, балансы и группы лояльности, затем выберите факт как основу проверки правил.
              </p>
            </div>
            <button
              className={smallButtonClass}
              type="button"
              disabled={isLoadingFacts}
              onClick={onLoadFacts}
            >
              {isLoadingFacts ? "Загружаем..." : "Загрузить факты"}
            </button>
          </div>

          <div className="mt-3 flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-bold text-zinc-950 dark:text-white">
                Batch pipeline snapshot-фактов
              </p>
              <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                Обрабатывает до 20 последних сохраненных фактов: сначала проверяет правила,
                пропускает дубли и факты без гостя, затем пишет только события, XP и очередь
                наград внутри LeetPlus.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className={smallButtonClass}
                type="button"
                disabled={isPipelinePreview || isPipelineRunning}
                onClick={() => onPipelineRun(true)}
              >
                {isPipelinePreview ? "Смотрим..." : "Предпросмотр batch"}
              </button>
              {canManage ? (
                <button
                  className={primaryButtonClass}
                  type="button"
                  disabled={isPipelinePreview || isPipelineRunning}
                  onClick={() => onPipelineRun(false)}
                >
                  {isPipelineRunning ? "Обрабатываем..." : "Обработать batch"}
                </button>
              ) : null}
            </div>
          </div>

          {pipelineResult ? <PipelineResultPanel result={pipelineResult} /> : null}

          {snapshotFacts ? (
            <div className="mt-3 space-y-3">
              <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-5 2xl:grid-cols-9">
                <MiniMetric
                  label="сессии"
                  value={snapshotFacts.summary.sessions}
                />
                <MiniMetric label="логи" value={snapshotFacts.summary.logs} />
                <MiniMetric
                  label="транзакции"
                  value={snapshotFacts.summary.transactions}
                />
                <MiniMetric
                  label="операции"
                  value={snapshotFacts.summary.operationLogs}
                />
                <MiniMetric
                  label="баланс"
                  value={snapshotFacts.summary.balances}
                />
                <MiniMetric
                  label="бонусы"
                  value={snapshotFacts.summary.bonusBalances}
                />
                <MiniMetric
                  label="группы"
                  value={snapshotFacts.summary.loyaltyGroups}
                />
                <MiniMetric
                  label="товары"
                  value={snapshotFacts.summary.productExpenses}
                />
                <MiniMetric
                  label="последний факт"
                  value={formatDate(snapshotFacts.summary.latestAt)}
                />
              </div>
              {snapshotFacts.facts.length ? (
                <div className="max-h-72 divide-y divide-zinc-200 overflow-auto rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
                  {snapshotFacts.facts.map((fact) => (
                    <SnapshotFactRow
                      key={fact.id}
                      fact={fact}
                      onApply={onApplyFact}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState text="Snapshot-фактов пока нет. Запустите синхронизацию гостевых данных на странице синхронизации." />
              )}
            </div>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            Профиль гостя
            <select
              className={fieldClass}
              value={form.profileId}
              onChange={(event) => {
                update("profileId", event.target.value);
                update("guestId", "");
              }}
            >
              <option value="">Не выбран</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.displayName} · ур. {profile.level}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            Гость Langame
            <select
              className={fieldClass}
              value={form.guestId}
              onChange={(event) => {
                update("guestId", event.target.value);
                update("profileId", "");
              }}
            >
              <option value="">Не выбран</option>
              {guests.slice(0, 150).map((guest) => (
                <option key={guest.id} value={guest.id}>
                  {guest.displayName} · {guest.contact}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            Клуб
            <select
              className={fieldClass}
              value={form.storeId}
              onChange={(event) => update("storeId", event.target.value)}
            >
              <option value="">Вся сеть / не выбран</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            Событие
            <select
              className={fieldClass}
              value={form.eventType}
              onChange={(event) => update("eventType", event.target.value)}
            >
              {dryRunEventOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            Дата и время
            <input
              className={fieldClass}
              type="datetime-local"
              value={form.occurredAt}
              onChange={(event) => update("occurredAt", event.target.value)}
            />
          </label>

          <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            Тип guests/logs
            <input
              className={fieldClass}
              list="guest-log-type-options"
              placeholder="visit, login, tournament"
              value={form.guestLogType}
              onChange={(event) => update("guestLogType", event.target.value)}
            />
            <datalist id="guest-log-type-options">
              {guestLogCatalog.items.map((item) => (
                <option key={item.normalizedType} value={item.type} />
              ))}
            </datalist>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Тип сессии
              <select
                className={fieldClass}
                value={form.sessionType}
                onChange={(event) => update("sessionType", event.target.value)}
              >
                {sessionTypeOptions.map((option) => (
                  <option key={option.value || "any"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Пакет часов
              <select
                className={fieldClass}
                value={form.sessionPacket}
                onChange={(event) => update("sessionPacket", event.target.value)}
              >
                {dryRunPacketOptions.map((option) => (
                  <option key={option.value || "unknown"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="lg:col-span-3">
            <TariffConditionFields
              snapshots={tariffSnapshots}
              tariffGroupId={form.tariffGroupId}
              tariffPeriodId={form.tariffPeriodId}
              tariffTypeId={form.tariffTypeId}
              onChange={(patch) =>
                setForm((current) => ({
                  ...current,
                  ...patch,
                  ...emptyDryRunSource,
                }))
              }
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Минуты сессии
              <input
                className={fieldClass}
                type="number"
                min="0"
                value={form.sessionMinutes}
                onChange={(event) => update("sessionMinutes", event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Покупка, руб
              <input
                className={fieldClass}
                type="number"
                min="0"
                value={form.spendAmount}
                onChange={(event) => update("spendAmount", event.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className={primaryButtonClass}
            type="button"
            disabled={isRunning}
            onClick={onRun}
          >
            {isRunning ? "Проверяем..." : "Проверить сценарий"}
          </button>
          {canManage ? (
            <button
              className={smallButtonClass}
              type="button"
              disabled={!canProcess || isProcessing}
              onClick={onProcess}
            >
              {isProcessing
                ? "Записываем..."
                : "Создать событие и награды"}
            </button>
          ) : null}
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Если дата не задана, API проверит сценарий на текущий момент.
          </p>
        </div>

        {form.sourceFactId ? (
          <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            Выбран snapshot-факт: {form.sourceFactKind} ·{" "}
            {form.externalDomain || "без домена"} ·{" "}
            {form.externalId || form.sourceFactId}
          </p>
        ) : null}
      </section>

      {result ? (
        <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <SectionTitle title="Результат проверки" />
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                {result.profile?.displayName ??
                  result.guest?.displayName ??
                  "Гость не выбран"}{" "}
                · {result.store?.name ?? "вся сеть"} · {result.eventType}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              {new Date(result.occurredAt).toLocaleString("ru-RU")}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-6">
            <StatusMetric
              label="Проверено"
              value={result.summary.checkedRules}
              hint="правил"
            />
            <StatusMetric
              label="Сработает"
              value={result.summary.eligibleRules}
              hint="без блокировок"
            />
            <StatusMetric
              label="Блок"
              value={result.summary.blockedRules}
              hint="нужны правки"
            />
            <StatusMetric
              label="XP"
              value={`+${result.summary.projectedXpDelta}`}
              hint={`${result.input.sessionMinutes} мин`}
            />
            <StatusMetric
              label="Сессия"
              value={sessionTypeLabel(result.input.sessionType)}
              hint={packetStateLabel(result.input.sessionPacket)}
            />
            <StatusMetric
              label="Награды"
              value={formatMoney(result.summary.estimatedRewardAmount)}
              hint={`${result.input.spendAmount} руб чек`}
            />
          </div>

          {canManage ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
                  Подтвержденный запуск в LeetPlus
                </p>
                <p className="mt-1 text-sm text-emerald-800/80 dark:text-emerald-100/80">
                  API заново пересчитает сценарий, создаст событие, начислит XP
                  и положит награды в очередь. Записи в Langame нет.
                </p>
              </div>
              <button
                className={primaryButtonClass}
                type="button"
                disabled={!canProcess || isProcessing}
                onClick={onProcess}
              >
                {isProcessing ? "Запускаем..." : "Записать в LeetPlus"}
              </button>
            </div>
            {!canProcess ? (
              <p className="mt-3 text-xs font-semibold text-amber-700 dark:text-amber-200">
                Для записи нужен гость и хотя бы одно сработавшее правило или
                XP.
              </p>
            ) : null}
          </div>
          ) : (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300">
              У вас read-only доступ: сценарий можно проверять и разбирать, но
              запись события, начисление XP и постановка наград в очередь
              недоступны.
            </div>
          )}

          {processResult ? (
            <div className="rounded-lg border border-cyan-200 bg-cyan-50/70 p-4 dark:border-cyan-900/60 dark:bg-cyan-950/20">
              <div className="grid gap-3 md:grid-cols-4">
                <StatusMetric
                  label="событие"
                  value={processResult.event.eventType}
                  hint={formatDate(processResult.event.occurredAt)}
                />
                <StatusMetric
                  label="XP применено"
                  value={`+${processResult.summary.appliedXpDelta}`}
                  hint={
                    processResult.summary.profileCreated
                      ? "профиль создан"
                      : "профиль обновлен"
                  }
                />
                <StatusMetric
                  label="наград в очереди"
                  value={processResult.summary.createdRewards}
                  hint={formatMoney(processResult.summary.queuedRewardAmount)}
                />
                <StatusMetric
                  label="Langame"
                  value="нет"
                  hint="write API не использовался"
                />
              </div>
              {processResult.summary.idempotencyKey ? (
                <p className="mt-3 break-all text-xs text-cyan-800 dark:text-cyan-100">
                  Idempotency: {processResult.summary.idempotencyKey}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-3 xl:grid-cols-2">
            {result.rules.length ? (
              result.rules.map((rule) => (
                <DryRunRuleCard key={`${rule.kind}-${rule.id}`} rule={rule} />
              ))
            ) : (
              <EmptyState text="Правил для проверки пока нет" />
            )}
          </div>
        </section>
      ) : (
        <EmptyState text="Запустите проверку, чтобы увидеть допуск, награды, XP и причины блокировки." />
      )}
    </div>
  );
}

function PipelineResultPanel({ result }: { result: GuestGamePipelineRunResult }) {
  const modeLabel = result.dryRunOnly ? "предпросмотр" : "запуск";
  const statusLabel: Record<string, string> = {
    DRY_RUN: "проверено",
    PROCESSED: "обработано",
    SKIPPED: "пропуск",
    DUPLICATE: "дубль",
    ERROR: "ошибка",
  };
  const statusClass: Record<string, string> = {
    DRY_RUN:
      "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200",
    PROCESSED:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    SKIPPED:
      "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
    DUPLICATE:
      "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    ERROR: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  };

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-cyan-200 bg-cyan-50/60 p-3 dark:border-cyan-900/60 dark:bg-cyan-950/20">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-bold text-cyan-950 dark:text-cyan-100">
            Batch pipeline: {modeLabel}
          </p>
          <p className="mt-1 text-xs leading-5 text-cyan-900/75 dark:text-cyan-100/75">
            {result.note}
          </p>
        </div>
        <span className="rounded-full border border-cyan-300 px-3 py-1 text-xs font-bold text-cyan-800 dark:border-cyan-800 dark:text-cyan-200">
          Langame write: нет
        </span>
      </div>

      <div className="grid gap-2 text-xs sm:grid-cols-4 lg:grid-cols-8">
        <MiniMetric label="доступно" value={result.availableFacts} />
        <MiniMetric label="проверено" value={result.checkedFacts} />
        <MiniMetric label="обработано" value={result.processedFacts} />
        <MiniMetric label="пропуск" value={result.skippedFacts} />
        <MiniMetric label="дубли" value={result.duplicateFacts} />
        <MiniMetric label="ошибки" value={result.erroredFacts} />
        <MiniMetric label="XP" value={`+${result.appliedXpDelta}`} />
        <MiniMetric label="награды" value={result.queuedRewards} />
      </div>

      {result.facts.length ? (
        <div className="divide-y divide-cyan-200/70 overflow-hidden rounded-lg border border-cyan-200/70 bg-white dark:divide-cyan-900/60 dark:border-cyan-900/60 dark:bg-zinc-950">
          {result.facts.slice(0, 8).map((fact) => (
            <div
              key={`${fact.factId}-${fact.status}`}
              className="grid gap-2 px-3 py-2 text-xs md:grid-cols-[1fr_auto]"
            >
              <div className="min-w-0">
                <p className="truncate font-bold text-zinc-950 dark:text-white">
                  {fact.label}
                </p>
                <p className="mt-1 text-zinc-500 dark:text-zinc-400">
                  {formatDate(fact.occurredAt)} ·{" "}
                  {fact.store?.name ?? "вся сеть"} · {fact.eventType}
                </p>
                {fact.reason ? (
                  <p className="mt-1 text-zinc-500 dark:text-zinc-400">
                    {fact.reason}
                  </p>
                ) : null}
              </div>
              <span
                className={[
                  "self-start rounded-full px-2 py-1 text-[11px] font-bold uppercase tracking-wide",
                  statusClass[fact.status],
                ].join(" ")}
              >
                {statusLabel[fact.status] ?? fact.status}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState text="Подходящих snapshot-фактов для batch пока нет." />
      )}
    </div>
  );
}

function SnapshotFactRow({
  fact,
  onApply,
}: {
  fact: GuestGameSnapshotFact;
  onApply: (fact: GuestGameSnapshotFact) => void;
}) {
  const sourceLabel: Record<GuestGameSnapshotFact["source"], string> = {
    GUEST_SESSION: "сессия",
    GUEST_LOG: "лог",
    GUEST_TRANSACTION: "транзакция",
    GUEST_OPERATION_LOG: "операция",
    GUEST_BALANCE: "баланс",
    GUEST_BONUS_BALANCE: "бонусы",
    GUEST_LOYALTY_GROUP: "группа",
    PRODUCT_EXPENSE: "товары",
  };
  const eventLabel =
    dryRunEventOptions.find((option) => option.value === fact.eventType)
      ?.label ?? fact.eventType;

  return (
    <button
      className="grid w-full gap-2 px-3 py-3 text-left transition hover:bg-emerald-50/70 focus:bg-emerald-50/70 focus:outline-none dark:hover:bg-emerald-950/20 dark:focus:bg-emerald-950/20 md:grid-cols-[1fr_auto]"
      type="button"
      onClick={() => onApply(fact)}
    >
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-bold text-zinc-950 dark:text-white">
            {fact.label}
          </span>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            {sourceLabel[fact.source]}
          </span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            {eventLabel}
          </span>
        </span>
        <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
          {formatDate(fact.occurredAt)} · {fact.store?.name ?? "вся сеть"} ·{" "}
          {fact.guest?.contact ?? "гость не привязан"}
        </span>
        {fact.details ? (
          <span className="mt-1 block truncate text-xs text-zinc-400">
            {fact.details}
          </span>
        ) : null}
      </span>
      <span className="flex flex-wrap items-center gap-2 md:justify-end">
        {fact.sessionMinutes != null ? (
          <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-bold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
            {fact.sessionMinutes} мин
          </span>
        ) : null}
        {fact.sessionPacket != null || fact.sessionType ? (
          <span className="rounded-full bg-cyan-100 px-2 py-1 text-xs font-bold text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200">
            {fact.sessionPacket == null
              ? sessionTypeLabel(fact.sessionType)
              : packetStateLabel(fact.sessionPacket)}
          </span>
        ) : null}
        {fact.guestLogType ? (
          <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            logs: {fact.guestLogType}
          </span>
        ) : null}
        {fact.spendAmount != null && fact.spendAmount > 0 ? (
          <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-bold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
            {formatMoney(fact.spendAmount)}
          </span>
        ) : null}
        <span className="rounded-lg border border-zinc-200 px-2 py-1 text-xs font-bold text-zinc-700 dark:border-zinc-800 dark:text-zinc-200">
          Взять в тест
        </span>
      </span>
    </button>
  );
}

function DryRunRuleCard({ rule }: { rule: GuestGameDryRunResult["rules"][number] }) {
  const kindLabel =
    rule.kind === "LOOT_BOX"
      ? "Лутбокс"
      : rule.kind === "MISSION"
        ? "Миссия"
        : "Battle Pass";

  return (
    <article
      className={[
        "rounded-lg border p-4 transition",
        rule.eligible
          ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/20"
          : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {kindLabel}
          </p>
          <h3 className="mt-1 text-base font-bold text-zinc-950 dark:text-white">
            {rule.name}
          </h3>
        </div>
        <span
          className={[
            "rounded-full px-2 py-1 text-xs font-bold",
            rule.eligible
              ? "bg-emerald-500 text-white"
              : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
          ].join(" ")}
        >
          {rule.eligible ? "сработает" : "блок"}
        </span>
      </div>

      <div className="mt-3 grid gap-2 text-sm text-zinc-600 sm:grid-cols-3 dark:text-zinc-300">
        <div>
          <span className="block text-xs font-semibold uppercase text-zinc-400">
            Награда
          </span>
          {rule.selectedRewardLabel ?? rule.rewardLabel ?? "не задана"}
        </div>
        <div>
          <span className="block text-xs font-semibold uppercase text-zinc-400">
            Сумма
          </span>
          {formatMoney(rule.rewardAmount ?? 0)}
        </div>
        <div>
          <span className="block text-xs font-semibold uppercase text-zinc-400">
            XP
          </span>
          +{rule.xpDelta}
        </div>
      </div>

      {rule.blockers.length ? (
        <div className="mt-3 space-y-1">
          {rule.blockers.map((blocker) => (
            <p
              key={blocker}
              className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
            >
              {blocker}
            </p>
          ))}
        </div>
      ) : null}

      {rule.reasons.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {rule.reasons.slice(0, 6).map((reason) => (
            <span
              key={reason}
              className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-zinc-500 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-400 dark:ring-zinc-800"
            >
              {reason}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function OverviewTab({
  workspace,
  pendingRewards,
  onRewardStatus,
  onEditReward,
  onOpenTab,
  saving,
  tenantSlug,
  stores,
  canApproveRewards,
  canManageRules,
  onSaveGuestLogMapping,
  onDeleteGuestLogMapping,
}: {
  workspace: GuestGamificationWorkspace;
  pendingRewards: GuestGameReward[];
  onRewardStatus: (
    reward: GuestGameReward,
    status: GuestGameRewardStatus,
  ) => Promise<void>;
  onEditReward: (reward: GuestGameReward) => void;
  onOpenTab: (tab: TabId) => void;
  saving: string | null;
  tenantSlug: string;
  stores: Store[];
  canApproveRewards: boolean;
  canManageRules: boolean;
  onSaveGuestLogMapping: (payload: GuestLogMappingPayload) => Promise<void>;
  onDeleteGuestLogMapping: (
    mapping: GuestGameGuestLogTypeMapping,
  ) => Promise<void>;
}) {
  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <SectionTitle title="Старт игрового контура" />
            <p className="mt-2 max-w-3xl text-sm text-zinc-500 dark:text-zinc-400">
              Соберите экономику от профиля гостя до ручной выдачи награды. Каждый
              блок можно настроить отдельно, а затем связать в единый сценарий.
            </p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
            Safe-mode: без автоматической записи в Langame
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <ScenarioStepCard
            step="1"
            title="Игровые профили"
            text="Связать гостя, контакт и будущие каналы Telegram/MAX."
            metric={`${workspace.summary.profilesCount} профилей`}
            action="Открыть профили"
            onClick={() => onOpenTab("profiles")}
          />
          <ScenarioStepCard
            step="2"
            title="Лутбокс"
            text="Настроить открытие при старте сессии, клубы, лимиты и призы."
            metric={`${workspace.summary.activeLootBoxes} активных`}
            action="Настроить"
            onClick={() => onOpenTab("lootBoxes")}
          />
          <ScenarioStepCard
            step="3"
            title="Миссии"
            text="Задать квесты по визитам, часам, бару или реактивации."
            metric={`${workspace.summary.activeMissions} активных`}
            action="Собрать"
            onClick={() => onOpenTab("missions")}
          />
          <ScenarioStepCard
            step="4"
            title="Battle Pass"
            text="Создать сезон, уровни, free/premium дорожки и XP-правила."
            metric={`${workspace.summary.activeSeasons} сезонов`}
            action="Открыть"
            onClick={() => onOpenTab("seasons")}
          />
          <ScenarioStepCard
            step="5"
            title="Выдача"
            text="Проверить очередь, согласовать награду и закрыть статус."
            metric={`${workspace.summary.pendingRewards} к выдаче`}
            action="К кошельку"
            onClick={() => onOpenTab("rewards")}
          />
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        <SafetyNoteCard
          title="Langame"
          value="только факты"
          text="Правила используют подготовленные события и не пишут бонусы обратно без отдельного write-сценария."
        />
        <SafetyNoteCard
          title="Экономика"
          value={formatMoney(workspace.summary.plannedBudget)}
          text="Бюджеты и лимиты держат стоимость призов под контролем до запуска автоматизации."
        />
        <SafetyNoteCard
          title="Выдача"
          value={formatMoney(workspace.summary.pendingRewardAmount)}
          text="Награды проходят через очередь, код или кассира, чтобы исключить двойную выдачу."
        />
      </div>

      <EconomyControlCard economy={workspace.economy} />
      <EffectControlCard effect={workspace.effect} />

      <TariffSnapshotReadinessCard snapshots={workspace.tariffSnapshots} />

      <GuestLogCatalogCard
        catalog={workspace.guestLogCatalog}
        saving={saving}
        canManage={canManageRules}
        onSaveMapping={onSaveGuestLogMapping}
        onDeleteMapping={onDeleteGuestLogMapping}
      />

      <PortalLinksCard tenantSlug={tenantSlug} stores={stores} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <section className="space-y-3">
          <SectionTitle title="Активные контуры" />
          <div className="grid gap-3 md:grid-cols-3">
            <StatusMetric
              label="Лутбоксы"
              value={workspace.summary.activeLootBoxes}
              hint={`${workspace.lootBoxes.length} всего`}
            />
            <StatusMetric
              label="Миссии"
              value={workspace.summary.activeMissions}
              hint={`${workspace.missions.length} всего`}
            />
            <StatusMetric
              label="Сезоны"
              value={workspace.summary.activeSeasons}
              hint={`${workspace.seasons.length} всего`}
            />
          </div>

          <SectionTitle title="Последние события" />
          <div className="space-y-2">
            {workspace.events.length ? (
              workspace.events.slice(0, 8).map((event) => (
                <EventRow key={event.id} event={event} />
              ))
            ) : (
              <EmptyState text="Событий пока нет" />
            )}
          </div>
        </section>

        <section className="space-y-3">
          <SectionTitle title="Очередь выдач" />
          <div className="space-y-2">
            {pendingRewards.length ? (
              pendingRewards.slice(0, 8).map((reward) => (
                <RewardRow
                  key={reward.id}
                  reward={reward}
                  onStatus={onRewardStatus}
                  onEdit={onEditReward}
                  saving={saving}
                  canApprove={canApproveRewards}
                />
              ))
            ) : (
              <EmptyState text="Нет наград к выдаче" />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function EconomyControlCard({
  economy,
}: {
  economy: GuestGamificationWorkspace["economy"];
}) {
  const usage = economy.summary.budgetUsagePercent ?? 0;
  const usageWidth = Math.max(0, Math.min(100, usage));
  const visibleScenarios = economy.scenarios.slice(0, 6);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
            Коммерческая экономика
          </p>
          <h2 className="mt-1 text-lg font-bold text-zinc-950 dark:text-white">
            Бюджет, очередь и фактическая выдача
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            Слой считает стоимость наград и XP по уже сохраненным правилам,
            событиям и кошельку LeetPlus. Live-запросы и запись в Langame здесь
            не выполняются.
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
          {economy.summary.rulesWithoutBudget
            ? `${economy.summary.rulesWithoutBudget} активн. сценариев без бюджета`
            : "Активные сценарии с бюджетом под контролем"}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MiniMetric
          label="использовано бюджета"
          value={formatMoney(economy.summary.budgetUsedCost)}
        />
        <MiniMetric
          label="очередь выдачи"
          value={formatMoney(
            economy.summary.pendingCost + economy.summary.approvedCost,
          )}
        />
        <MiniMetric
          label="погашено"
          value={formatMoney(economy.summary.paidCost)}
        />
        <MiniMetric
          label="гости / XP"
          value={`${economy.summary.uniqueGuests} / +${economy.summary.xpIssued}`}
        />
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <span>Плановый бюджет</span>
          <span>
            {economy.summary.budgetUsagePercent === null
              ? "лимит не задан"
              : `${formatPercent(economy.summary.budgetUsagePercent)} · ${formatMoney(
                  economy.summary.plannedBudget,
                )}`}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
          <div
            className={[
              "h-full rounded-full transition-all",
              economyUsageClass(economy.summary.budgetUsagePercent),
            ].join(" ")}
            style={{ width: `${usageWidth}%` }}
          />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {visibleScenarios.length ? (
          visibleScenarios.map((scenario) => (
            <div
              key={`${scenario.kind}:${scenario.id}`}
              className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50"
            >
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-bold uppercase text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                      {economyKindLabel(scenario.kind)}
                    </span>
                    <span className="rounded-full bg-zinc-200 px-2 py-1 text-[11px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                      {economyStatusLabel(scenario.status)}
                    </span>
                  </div>
                  <h3 className="mt-2 truncate text-sm font-bold text-zinc-950 dark:text-white">
                    {scenario.name}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                    {scenario.recommendation}
                  </p>
                </div>
                <div className="grid min-w-0 gap-2 text-xs sm:grid-cols-4 lg:min-w-[520px]">
                  <MiniMetric
                    label="стоимость"
                    value={formatMoney(scenario.budgetUsedCost)}
                  />
                  <MiniMetric
                    label="очередь"
                    value={`${scenario.pendingRewards + scenario.approvedRewards} · ${formatMoney(
                      scenario.pendingCost + scenario.approvedCost,
                    )}`}
                  />
                  <MiniMetric
                    label="выдано"
                    value={`${scenario.paidRewards} · ${formatMoney(
                      scenario.paidCost,
                    )}`}
                  />
                  <MiniMetric
                    label="события"
                    value={`${scenario.eventsCount} · +${scenario.xpIssued} XP`}
                  />
                </div>
              </div>
            </div>
          ))
        ) : (
          <EmptyState text="Экономика появится после создания лутбокса, миссии, Battle Pass или награды." />
        )}
      </div>
    </section>
  );
}

function EffectControlCard({
  effect,
}: {
  effect: GuestGamificationWorkspace["effect"];
}) {
  const visibleScenarios = effect.scenarios.slice(0, 6);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-600 dark:text-cyan-300">
            Эффект сценариев
          </p>
          <h2 className="mt-1 text-lg font-bold text-zinc-950 dark:text-white">
            Что произошло после игровых событий
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            LeetPlus смотрит {effect.windowDays} дней после XP, лутбокса,
            миссии или Battle Pass: вернулся ли гость, были ли сессии,
            продажи бара/товаров и пополнения баланса. Расчет идет только по
            сохраненным snapshot-фактам.
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
          {effect.summary.measuredEvents
            ? `${effect.summary.measuredEvents} событий измеряется`
            : "Пока нет событий с сопоставленным гостем"}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MiniMetric
          label="возврат гостей"
          value={
            effect.summary.returnRatePercent === null
              ? "нет данных"
              : formatPercent(effect.summary.returnRatePercent)
          }
        />
        <MiniMetric
          label="сессии после события"
          value={`${effect.summary.postSessions} · ${formatMinutes(
            effect.summary.postPlayMinutes,
          )}`}
        />
        <MiniMetric
          label="бар/товары"
          value={formatMoney(effect.summary.productRevenue)}
        />
        <MiniMetric
          label="пополнения"
          value={formatMoney(effect.summary.balanceTopUps)}
        />
      </div>

      <div className="mt-4 space-y-2">
        {visibleScenarios.length ? (
          visibleScenarios.map((scenario) => (
            <div
              key={`${scenario.kind}:${scenario.id}`}
              className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50"
            >
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-cyan-100 px-2 py-1 text-[11px] font-bold uppercase text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200">
                      {economyKindLabel(scenario.kind)}
                    </span>
                    <span className="rounded-full bg-zinc-200 px-2 py-1 text-[11px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                      {economyStatusLabel(scenario.status)}
                    </span>
                  </div>
                  <h3 className="mt-2 truncate text-sm font-bold text-zinc-950 dark:text-white">
                    {scenario.name}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                    {scenario.recommendation}
                  </p>
                </div>
                <div className="grid min-w-0 gap-2 text-xs sm:grid-cols-4 lg:min-w-[560px]">
                  <MiniMetric
                    label="возврат"
                    value={
                      scenario.returnRatePercent === null
                        ? "нет"
                        : formatPercent(scenario.returnRatePercent)
                    }
                  />
                  <MiniMetric
                    label="гости"
                    value={`${scenario.returnedGuests}/${scenario.reachedGuests}`}
                  />
                  <MiniMetric
                    label="сессии"
                    value={`${scenario.postSessions} · ${formatMinutes(
                      scenario.postPlayMinutes,
                    )}`}
                  />
                  <MiniMetric
                    label="эффект"
                    value={formatMoney(scenario.totalRevenue)}
                  />
                </div>
              </div>
            </div>
          ))
        ) : (
          <EmptyState text="Эффект появится после игровых событий с сопоставленными гостями и последующих сессий, продаж или пополнений." />
        )}
      </div>
    </section>
  );
}

function ScenarioStepCard({
  step,
  title,
  text,
  metric,
  action,
  onClick,
}: {
  step: string;
  title: string;
  text: string;
  metric: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="flex min-h-56 flex-col rounded-lg border border-zinc-200 bg-zinc-50 p-4 transition hover:border-emerald-300 hover:bg-white hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-emerald-800 dark:hover:bg-zinc-950">
      <div className="flex items-center justify-between gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          {step}
        </span>
        <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
          {metric}
        </span>
      </div>
      <h3 className="mt-4 text-base font-bold text-zinc-950 dark:text-white">
        {title}
      </h3>
      <p className="mt-2 flex-1 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
        {text}
      </p>
      <button type="button" className={`${smallButtonClass} mt-4`} onClick={onClick}>
        {action}
      </button>
    </div>
  );
}

function SafetyNoteCard({
  title,
  value,
  text,
}: {
  title: string;
  value: ReactNode;
  text: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
        {title}
      </p>
      <p className="mt-2 text-lg font-bold text-zinc-950 dark:text-white">
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
        {text}
      </p>
    </div>
  );
}

function TariffSnapshotReadinessCard({
  snapshots,
}: {
  snapshots: GuestGameTariffSnapshotEndpoint[];
}) {
  const readyCount = snapshots.filter((snapshot) => snapshot.status === "READY")
    .length;
  const latestAt = snapshots.reduce<string | null>((latest, snapshot) => {
    if (!snapshot.latestAt) {
      return latest;
    }

    if (!latest) {
      return snapshot.latestAt;
    }

    return new Date(snapshot.latestAt).getTime() > new Date(latest).getTime()
      ? snapshot.latestAt
      : latest;
  }, null);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <SectionTitle title="Тарифные snapshot-источники" />
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
            Конструктор условий использует только подготовленные данные Langame.
            Здесь видно, какие тарифные справочники уже сохранены в LeetPlus и
            готовы для правил лутбоксов, миссий и battle pass.
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
          {readyCount}/{snapshots.length} готовы
          <span className="ml-2 text-zinc-400">
            {latestAt ? formatDate(latestAt) : "snapshot не создан"}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {snapshots.map((snapshot) => (
          <article
            key={snapshot.endpointKey}
            className="min-h-52 rounded-lg border border-zinc-200 bg-zinc-50 p-3 transition hover:border-emerald-300 hover:bg-white hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-emerald-800 dark:hover:bg-zinc-950"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-zinc-950 dark:text-white">
                  {snapshot.title}
                </h3>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {snapshot.endpointPath}
                </p>
              </div>
              <span
                className={[
                  "rounded-full px-2 py-1 text-[11px] font-bold uppercase",
                  tariffSnapshotStatusClass(snapshot.status),
                ].join(" ")}
              >
                {tariffSnapshotStatusLabel(snapshot.status)}
              </span>
            </div>

            <p className="mt-3 text-sm leading-5 text-zinc-500 dark:text-zinc-400">
              {snapshot.description}
            </p>

            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-md bg-white px-2 py-1.5 dark:bg-zinc-950">
                <span className="block text-zinc-400">Источники</span>
                <span className="font-semibold text-zinc-900 dark:text-white">
                  {snapshot.readySources}/{snapshot.totalSources || snapshot.sources.length}
                </span>
              </div>
              <div className="rounded-md bg-white px-2 py-1.5 dark:bg-zinc-950">
                <span className="block text-zinc-400">Строки</span>
                <span className="font-semibold text-zinc-900 dark:text-white">
                  {snapshot.rowCount}
                </span>
              </div>
              <div className="rounded-md bg-white px-2 py-1.5 dark:bg-zinc-950">
                <span className="block text-zinc-400">Typed</span>
                <span className="font-semibold text-zinc-900 dark:text-white">
                  {snapshot.typedItemsCount}
                </span>
              </div>
            </div>

            {snapshot.fieldKeys.length ? (
              <div className="mt-3 flex flex-wrap gap-1">
                {snapshot.fieldKeys.slice(0, 4).map((field) => (
                  <span
                    key={field}
                    className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-zinc-500 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-400 dark:ring-zinc-800"
                  >
                    {field}
                  </span>
                ))}
              </div>
            ) : null}

            {snapshot.typedItems.length ? (
              <div className="mt-3 rounded-md border border-emerald-100 bg-emerald-50/60 p-2 dark:border-emerald-950 dark:bg-emerald-950/20">
                <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                  Подготовленные строки
                </p>
                <div className="mt-2 space-y-1">
                  {snapshot.typedItems.slice(0, 3).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="truncate font-semibold text-zinc-800 dark:text-zinc-100">
                        {item.label ?? item.name ?? item.externalId ?? "Строка тарифа"}
                      </span>
                      <span className="shrink-0 text-[11px] text-zinc-400">
                        {item.domain}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <p className="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              {snapshot.nextAction}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function GuestLogCatalogCard({
  catalog,
  saving,
  canManage,
  onSaveMapping,
  onDeleteMapping,
}: {
  catalog: GuestGameGuestLogCatalog;
  saving: string | null;
  canManage: boolean;
  onSaveMapping: (payload: GuestLogMappingPayload) => Promise<void>;
  onDeleteMapping: (mapping: GuestGameGuestLogTypeMapping) => Promise<void>;
}) {
  const topItems = catalog.items.slice(0, 8);
  const initialItem = topItems[0] ?? catalog.items[0] ?? null;
  const [selectedType, setSelectedType] = useState(
    initialItem?.normalizedType ?? "",
  );
  const [draft, setDraft] = useState<GuestLogMappingPayload>(() =>
    guestLogMappingDraftFromItem(initialItem),
  );
  const selectedItem =
    catalog.items.find((item) => item.normalizedType === selectedType) ??
    initialItem;
  const selectedMapping = selectedItem?.mapping ?? null;
  const businessPresets = guestLogBusinessPresets(catalog.items).slice(0, 5);
  const isSaving = saving === "guestLogMapping";
  const selectItem = (item: GuestGameGuestLogCatalog["items"][number]) => {
    setSelectedType(item.normalizedType);
    setDraft(guestLogMappingDraftFromItem(item));
  };
  const saveMapping = async () => {
    if (!selectedItem) {
      return;
    }

    await onSaveMapping({
      ...draft,
      rawType: selectedItem.type,
      label: draft.label.trim() || selectedItem.type,
      note: draft.note.trim(),
    });
  };
  const resetMapping = async () => {
    if (!selectedItem?.mapping) {
      return;
    }

    await onDeleteMapping(selectedItem.mapping);
    setDraft({
      rawType: selectedItem.type,
      label: selectedItem.type,
      preset: "custom",
      intent: "allow",
      note: "",
    });
  };

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <SectionTitle title="Каталог событий guests/logs" />
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
            Эти типы собраны из сохраненных фактов Langame и используются как
            подсказки в правилах лутбоксов, миссий и Battle Pass. Открытие
            страницы не делает live-запросов в Langame.
          </p>
        </div>
        <div className="grid grid-cols-4 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 text-center text-xs dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="px-3 py-2">
            <span className="block text-zinc-400">Типы</span>
            <span className="font-bold text-zinc-900 dark:text-white">
              {catalog.summary.types}
            </span>
          </div>
          <div className="border-x border-zinc-200 px-3 py-2 dark:border-zinc-800">
            <span className="block text-zinc-400">Логи</span>
            <span className="font-bold text-zinc-900 dark:text-white">
              {catalog.summary.logs}
            </span>
          </div>
          <div className="px-3 py-2">
            <span className="block text-zinc-400">Источники</span>
            <span className="font-bold text-zinc-900 dark:text-white">
              {catalog.summary.domains}
            </span>
          </div>
          <div className="border-l border-zinc-200 px-3 py-2 dark:border-zinc-800">
            <span className="block text-zinc-400">Словарь</span>
            <span className="font-bold text-zinc-900 dark:text-white">
              {catalog.mappings.length}
            </span>
          </div>
        </div>
      </div>

      {topItems.length ? (
        <>
          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
            <div className="grid gap-2 sm:grid-cols-2">
              {topItems.map((item) => {
                const isSelected =
                  selectedItem?.normalizedType === item.normalizedType;

                return (
                  <button
                    key={item.normalizedType}
                    type="button"
                    onClick={() => selectItem(item)}
                    className={[
                      "rounded-lg border p-3 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-sm dark:hover:border-emerald-800",
                      isSelected
                        ? "border-emerald-500 bg-emerald-50/70 dark:border-emerald-700 dark:bg-emerald-950/30"
                        : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50",
                    ].join(" ")}
                    title={item.domains
                      .map((domain) => `${domain.domain}: ${domain.count}`)
                      .join(", ")}
                  >
                    <span className="block truncate text-sm font-bold text-zinc-900 dark:text-white">
                      {item.mapping?.label ?? item.type}
                    </span>
                    <span className="mt-1 block truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {item.type}
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                      <span className="rounded-full bg-white px-2 py-1 text-zinc-500 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
                        {item.count} логов
                      </span>
                      {item.mapping ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-100">
                          настроено
                        </span>
                      ) : (
                        <span className="rounded-full bg-zinc-100 px-2 py-1 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300">
                          авто
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
              <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Сопоставление типа
              </p>
              <h3 className="mt-1 truncate text-base font-bold text-zinc-950 dark:text-white">
                {selectedItem?.type ?? "Тип не выбран"}
              </h3>
              <div className="mt-3 grid gap-3">
                <Field label="Название для менеджера">
                  <input
                    className={fieldClass}
                    value={draft.label}
                    disabled={!canManage || !selectedItem}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        label: event.target.value,
                      }))
                    }
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Бизнес-пресет">
                    <select
                      className={fieldClass}
                      value={draft.preset}
                      disabled={!canManage || !selectedItem}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          preset: event.target
                            .value as GuestGameGuestLogMappingPreset,
                        }))
                      }
                    >
                      {guestLogMappingPresetOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Применение">
                    <select
                      className={fieldClass}
                      value={draft.intent}
                      disabled={!canManage || !selectedItem}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          intent: event.target
                            .value as GuestGameGuestLogMappingIntent,
                        }))
                      }
                    >
                      <option value="allow">Разрешенное условие</option>
                      <option value="block">Anti-fraud запрет</option>
                    </select>
                  </Field>
                </div>
                <Field label="Заметка">
                  <textarea
                    className={`${fieldClass} min-h-20 resize-y`}
                    value={draft.note}
                    disabled={!canManage || !selectedItem}
                    placeholder="Например: срабатывает при старте оплаченной игровой сессии"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        note: event.target.value,
                      }))
                    }
                  />
                </Field>
              </div>

              {selectedMapping ? (
                <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                  Сохранено: {formatDate(selectedMapping.updatedAt)}
                  {selectedMapping.updatedBy
                    ? ` · ${selectedMapping.updatedBy.displayName}`
                    : ""}
                </p>
              ) : (
                <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                  Пока используется автоподбор по словам. Сохраните смысл, если
                  raw-тип нужно трактовать стабильнее.
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={saveMapping}
                  disabled={!canManage || !selectedItem || isSaving}
                  className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-bold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? "Сохраняем..." : "Сохранить смысл"}
                </button>
                {selectedMapping ? (
                  <button
                    type="button"
                    onClick={resetMapping}
                    disabled={!canManage || isSaving}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-bold text-zinc-700 transition hover:border-zinc-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:border-zinc-700 dark:hover:bg-zinc-950"
                  >
                    Сбросить
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {catalog.summary.latestAt ? (
            <p className="mt-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              Последний лог: {formatDate(catalog.summary.latestAt)}
            </p>
          ) : null}

          {businessPresets.length ? (
            <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
              <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Бизнес-пресеты из найденных типов
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {businessPresets.map((preset) => (
                  <span
                    key={preset.id}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-200 dark:ring-zinc-800"
                    title={preset.description}
                  >
                    {preset.label} · {preset.types.length}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
          Типы появятся после расширенной синхронизации `guests/logs` на
          странице `/sync`.
        </p>
      )}
    </section>
  );
}

function PortalLinksCard({
  tenantSlug,
  stores,
}: {
  tenantSlug: string;
  stores: Store[];
}) {
  const activeStores = stores.filter((store) => store.isActive);

  return (
    <section className="rounded-lg border border-cyan-200 bg-cyan-50/70 p-4 shadow-sm dark:border-cyan-900/60 dark:bg-cyan-950/20">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
            Гостевой кабинет
          </p>
          <h2 className="mt-2 text-lg font-bold text-zinc-950 dark:text-white">
            Публичные ссылки для клубов
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            По этим ссылкам гости проходят OTP-вход и видят свой уровень
            лояльности Langame, XP, миссии, лутбоксы, battle pass и кошелек
            наград без доступа к внутренним разделам LeetPlus. Ссылки
            используют публичный slug клуба, старые URL с внутренним ID
            продолжают работать.
          </p>
        </div>
        <span className="rounded-full border border-cyan-300 px-3 py-1 text-xs font-bold text-cyan-800 dark:border-cyan-800 dark:text-cyan-200">
          {activeStores.length} клубов
        </span>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {activeStores.length ? (
          activeStores.map((store) => {
            const publicKey = store.publicSlug ?? store.id;
            const href = `/guest/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(
              publicKey,
            )}`;

            return (
              <a
                key={store.id}
                href={href}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-cyan-200 bg-white px-3 py-3 text-sm transition hover:border-cyan-400 hover:bg-cyan-50 dark:border-cyan-900/70 dark:bg-zinc-950 dark:hover:border-cyan-600 dark:hover:bg-cyan-950/30"
              >
                <span className="block font-bold text-zinc-950 dark:text-white">
                  {store.name}
                </span>
                <span className="mt-1 block truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {href}
                </span>
                {store.publicSlug ? null : (
                  <span className="mt-2 block text-[11px] text-amber-700 dark:text-amber-300">
                    Slug еще не задан, используется технический ID.
                  </span>
                )}
              </a>
            );
          })
        ) : (
          <EmptyState text="Активных клубов пока нет" />
        )}
      </div>
    </section>
  );
}

function ProfilesTab({
  form,
  setForm,
  guests,
  leads,
  profiles,
  query,
  setQuery,
  eventForm,
  setEventForm,
  editingProfileId,
  onSaveProfile,
  onEditProfile,
  onResetProfile,
  onSaveEvent,
  onProfileStatus,
  saving,
  canManage,
}: {
  form: ProfileForm;
  setForm: (form: ProfileForm) => void;
  guests: GuestDashboardRow[];
  leads: GuestCrmLead[];
  profiles: GuestGameProfile[];
  query: string;
  setQuery: (value: string) => void;
  eventForm: EventForm;
  setEventForm: (form: EventForm) => void;
  editingProfileId: string | null;
  onSaveProfile: () => Promise<void>;
  onEditProfile: (profile: GuestGameProfile) => void;
  onResetProfile: () => void;
  onSaveEvent: () => Promise<void>;
  onProfileStatus: (
    profile: GuestGameProfile,
    status: GuestGameProfileStatus,
  ) => Promise<void>;
  saving: string | null;
  canManage: boolean;
}) {
  return (
    <div
      className={
        canManage
          ? "grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]"
          : "grid gap-5"
      }
    >
      {canManage ? (
      <section className="space-y-4">
        <Panel
          title={
            editingProfileId
              ? "Редактирование игрового профиля"
              : "Новый игровой профиль"
          }
        >
          <div className="space-y-3">
            <Field label="Гость из Langame">
              <select
                className={fieldClass}
                value={form.guestId}
                onChange={(event) =>
                  setForm({ ...form, guestId: event.target.value })
                }
              >
                <option value="">Не выбран</option>
                {guests.map((guest) => (
                  <option key={guest.id} value={guest.id}>
                    {guest.displayName} · {guest.contact}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="CRM-лид">
              <select
                className={fieldClass}
                value={form.leadId}
                onChange={(event) =>
                  setForm({ ...form, leadId: event.target.value })
                }
              >
                <option value="">Не выбран</option>
                {leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.displayName} · {lead.phone}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Имя на витрине">
                <input
                  className={fieldClass}
                  value={form.displayName}
                  onChange={(event) =>
                    setForm({ ...form, displayName: event.target.value })
                  }
                />
              </Field>
              <Field label="Контакт">
                <input
                  className={fieldClass}
                  value={form.contactMasked}
                  onChange={(event) =>
                    setForm({ ...form, contactMasked: event.target.value })
                  }
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Telegram ID">
                <input
                  className={fieldClass}
                  value={form.telegramIdentity}
                  onChange={(event) =>
                    setForm({ ...form, telegramIdentity: event.target.value })
                  }
                />
              </Field>
              <Field label="MAX ID">
                <input
                  className={fieldClass}
                  value={form.maxIdentity}
                  onChange={(event) =>
                    setForm({ ...form, maxIdentity: event.target.value })
                  }
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="XP">
                <input
                  className={fieldClass}
                  type="number"
                  value={form.xp}
                  onChange={(event) =>
                    setForm({ ...form, xp: event.target.value })
                  }
                />
              </Field>
              <Field label="Уровень">
                <input
                  className={fieldClass}
                  type="number"
                  value={form.level}
                  onChange={(event) =>
                    setForm({ ...form, level: event.target.value })
                  }
                />
              </Field>
              <Field label="Статус">
                <select
                  className={fieldClass}
                  value={form.status}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      status: event.target.value as GuestGameProfileStatus,
                    })
                  }
                >
                  {profileStatusOptions.map((status) => (
                    <option key={status} value={status}>
                      {profileStatusLabels[status]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <button
              type="button"
              className={primaryButtonClass}
              disabled={saving === "profile"}
              onClick={onSaveProfile}
            >
              {editingProfileId ? "Изменить профиль" : "Создать профиль"}
            </button>
            {editingProfileId ? (
              <button
                type="button"
                className={smallButtonClass}
                onClick={onResetProfile}
              >
                Сбросить выбор
              </button>
            ) : null}
          </div>
        </Panel>

        <Panel title="Ручное XP-событие">
          <div className="space-y-3">
            <Field label="Профиль">
              <select
                className={fieldClass}
                value={eventForm.profileId}
                onChange={(event) =>
                  setEventForm({ ...eventForm, profileId: event.target.value })
                }
              >
                <option value="">Не выбран</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.displayName} · L{profile.level} · {profile.xp} XP
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Событие">
                <input
                  className={fieldClass}
                  value={eventForm.eventType}
                  onChange={(event) =>
                    setEventForm({ ...eventForm, eventType: event.target.value })
                  }
                />
              </Field>
              <Field label="XP delta">
                <input
                  className={fieldClass}
                  type="number"
                  value={eventForm.xpDelta}
                  onChange={(event) =>
                    setEventForm({ ...eventForm, xpDelta: event.target.value })
                  }
                />
              </Field>
            </div>
            <Field label="Комментарий">
              <input
                className={fieldClass}
                value={eventForm.note}
                onChange={(event) =>
                  setEventForm({ ...eventForm, note: event.target.value })
                }
              />
            </Field>
            <Field label="Payload JSON">
              <textarea
                className={`${fieldClass} min-h-28 font-mono text-xs`}
                value={eventForm.payloadText}
                onChange={(event) =>
                  setEventForm({ ...eventForm, payloadText: event.target.value })
                }
              />
            </Field>
            <button
              type="button"
              className={primaryButtonClass}
              disabled={saving === "event"}
              onClick={onSaveEvent}
            >
              Записать событие
            </button>
          </div>
        </Panel>
      </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SectionTitle title="Игровые профили" />
          <input
            className={`${fieldClass} sm:max-w-xs`}
            placeholder="Поиск"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {profiles.length ? (
            profiles.map((profile) => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                onEdit={onEditProfile}
                onStatus={onProfileStatus}
                saving={saving}
                canManage={canManage}
              />
            ))
          ) : (
            <EmptyState text="Профили не найдены" />
          )}
        </div>
      </section>
    </div>
  );
}

function LootBoxesTab({
  form,
  setForm,
  lootBoxes,
  audiences,
  stores,
  tariffSnapshots,
  guestLogCatalog,
  editingId,
  onSave,
  onEdit,
  onReset,
  onStatus,
  saving,
  canManage,
}: {
  form: LootBoxForm;
  setForm: (form: LootBoxForm) => void;
  lootBoxes: GuestGameLootBox[];
  audiences: GuestAudience[];
  stores: Store[];
  tariffSnapshots: GuestGameTariffSnapshotEndpoint[];
  guestLogCatalog: GuestGameGuestLogCatalog;
  editingId: string | null;
  onSave: () => Promise<void>;
  onEdit: (lootBox: GuestGameLootBox) => void;
  onReset: () => void;
  onStatus: (
    type: "loot-boxes" | "missions" | "seasons",
    id: string,
    status: GuestGameStatus,
  ) => Promise<void>;
  saving: string | null;
  canManage: boolean;
}) {
  return (
    <RulesLayout
      canManage={canManage}
      formTitle={
        editingId ? "Редактирование лутбокса" : "Настройка лутбокса"
      }
      form={
        <div className="space-y-3">
          <RuleCommonFields
            status={form.status}
            name={form.name}
            rewardType={form.rewardType}
            rewardAmount={form.rewardAmount}
            rewardLabel={form.rewardLabel}
            audienceId={form.audienceId}
            budgetAmount={form.budgetAmount}
            manualApprovalRequired={form.manualApprovalRequired}
            note={form.note}
            audiences={audiences}
            onChange={(patch) => setForm({ ...form, ...patch })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Триггер">
              <input
                className={fieldClass}
                value={form.triggerKind}
                onChange={(event) =>
                  setForm({ ...form, triggerKind: event.target.value })
                }
              />
            </Field>
            <Field label="Сегмент">
              <input
                className={fieldClass}
                value={form.segment}
                onChange={(event) =>
                  setForm({ ...form, segment: event.target.value })
                }
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Тип сессии">
              <select
                className={fieldClass}
                value={form.sessionType}
                onChange={(event) =>
                  setForm({ ...form, sessionType: event.target.value })
                }
              >
                {sessionTypeOptions.map((option) => (
                  <option key={option.value || "any"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Пакет часов">
              <select
                className={fieldClass}
                value={form.packetMode}
                onChange={(event) =>
                  setForm({ ...form, packetMode: event.target.value })
                }
              >
                {packetModeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <StoreSelect
            stores={stores}
            value={form.storeIds}
            onChange={(storeIds) => setForm({ ...form, storeIds })}
          />
          <LootBoxBusinessRules
            form={form}
            tariffSnapshots={tariffSnapshots}
            guestLogCatalog={guestLogCatalog}
            onChange={(patch) => setForm({ ...form, ...patch })}
          />
          <button
            type="button"
            className={primaryButtonClass}
            disabled={saving === "lootBox"}
            onClick={onSave}
          >
            {editingId ? "Изменить лутбокс" : "Создать лутбокс"}
          </button>
          {editingId ? (
            <button type="button" className={smallButtonClass} onClick={onReset}>
              Сбросить выбор
            </button>
          ) : null}
        </div>
      }
      listTitle="Лутбоксы"
      items={lootBoxes}
      renderItem={(item) => (
        <RuleCard
          key={item.id}
          title={item.name}
          status={item.status}
          subtitle={`${item.triggerKind} · ${item.rewardLabel ?? item.rewardType}`}
          meta={[
            item.audience?.name ?? "все гости",
            item.segment ?? "без сегмента",
            packetModeLabel(stringRule(item.periodRules, "packetMode", "ANY")),
            tariffRuleSummary(item.periodRules),
            guestLogRuleSummary(item.periodRules),
            formatMoney(item.budgetAmount ?? 0),
          ]}
          onEdit={() => onEdit(item)}
          onStatus={(status) => onStatus("loot-boxes", item.id, status)}
          saving={saving === `loot-boxes-${item.id}`}
          canManage={canManage}
        />
      )}
    />
  );
}

function MissionsTab({
  form,
  setForm,
  missions,
  audiences,
  stores,
  tariffSnapshots,
  guestLogCatalog,
  editingId,
  onSave,
  onEdit,
  onReset,
  onStatus,
  saving,
  canManage,
}: {
  form: MissionForm;
  setForm: (form: MissionForm) => void;
  missions: GuestGameMission[];
  audiences: GuestAudience[];
  stores: Store[];
  tariffSnapshots: GuestGameTariffSnapshotEndpoint[];
  guestLogCatalog: GuestGameGuestLogCatalog;
  editingId: string | null;
  onSave: () => Promise<void>;
  onEdit: (mission: GuestGameMission) => void;
  onReset: () => void;
  onStatus: (
    type: "loot-boxes" | "missions" | "seasons",
    id: string,
    status: GuestGameStatus,
  ) => Promise<void>;
  saving: string | null;
  canManage: boolean;
}) {
  return (
    <RulesLayout
      canManage={canManage}
      formTitle={editingId ? "Редактирование миссии" : "Конструктор миссии"}
      form={
        <div className="space-y-3">
          <RuleCommonFields
            status={form.status}
            name={form.name}
            rewardType={form.rewardType}
            rewardAmount={form.rewardAmount}
            rewardLabel={form.rewardLabel}
            audienceId={form.audienceId}
            budgetAmount={form.budgetAmount}
            manualApprovalRequired={form.manualApprovalRequired}
            note={form.note}
            audiences={audiences}
            onChange={(patch) => setForm({ ...form, ...patch })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Тип миссии">
              <input
                className={fieldClass}
                value={form.missionType}
                onChange={(event) =>
                  setForm({ ...form, missionType: event.target.value })
                }
              />
            </Field>
            <Field label="Триггер">
              <input
                className={fieldClass}
                value={form.triggerKind}
                onChange={(event) =>
                  setForm({ ...form, triggerKind: event.target.value })
                }
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="XP">
              <input
                className={fieldClass}
                type="number"
                value={form.xpReward}
                onChange={(event) =>
                  setForm({ ...form, xpReward: event.target.value })
                }
              />
            </Field>
            <Field label="Цель">
              <input
                className={fieldClass}
                type="number"
                value={form.progressTarget}
                onChange={(event) =>
                  setForm({ ...form, progressTarget: event.target.value })
                }
              />
            </Field>
            <Field label="Единица">
              <input
                className={fieldClass}
                value={form.progressUnit}
                onChange={(event) =>
                  setForm({ ...form, progressUnit: event.target.value })
                }
              />
            </Field>
          </div>
          <StoreSelect
            stores={stores}
            value={form.storeIds}
            onChange={(storeIds) => setForm({ ...form, storeIds })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Начало">
              <input
                className={fieldClass}
                type="datetime-local"
                value={form.periodFrom}
                onChange={(event) =>
                  setForm({ ...form, periodFrom: event.target.value })
                }
              />
            </Field>
            <Field label="Окончание">
              <input
                className={fieldClass}
                type="datetime-local"
                value={form.periodTo}
                onChange={(event) =>
                  setForm({ ...form, periodTo: event.target.value })
                }
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Лимит на гостя">
              <input
                className={fieldClass}
                type="number"
                value={form.perGuestLimit}
                onChange={(event) =>
                  setForm({ ...form, perGuestLimit: event.target.value })
                }
              />
            </Field>
            <Field label="Общий лимит">
              <input
                className={fieldClass}
                type="number"
                value={form.totalRewardLimit}
                onChange={(event) =>
                  setForm({ ...form, totalRewardLimit: event.target.value })
                }
              />
            </Field>
          </div>
          <MissionBusinessRules
            form={form}
            tariffSnapshots={tariffSnapshots}
            guestLogCatalog={guestLogCatalog}
            onChange={(patch) => setForm({ ...form, ...patch })}
          />
          <button
            type="button"
            className={primaryButtonClass}
            disabled={saving === "mission"}
            onClick={onSave}
          >
            {editingId ? "Изменить миссию" : "Создать миссию"}
          </button>
          {editingId ? (
            <button type="button" className={smallButtonClass} onClick={onReset}>
              Сбросить выбор
            </button>
          ) : null}
        </div>
      }
      listTitle="Миссии"
      items={missions}
      renderItem={(item) => (
        <RuleCard
          key={item.id}
          title={item.name}
          status={item.status}
          subtitle={`${item.missionType} · ${item.xpReward} XP`}
          meta={[
            item.audience?.name ?? "все гости",
            packetModeLabel(stringRule(item.conditions, "packetMode", "ANY")),
            tariffRuleSummary(item.conditions),
            guestLogRuleSummary(item.conditions, item.antiFraudRules),
            questRuleSummary(item.conditions),
            `${item.progressTarget ?? 1} ${item.progressUnit ?? "шаг"}`,
            formatMoney(item.budgetAmount ?? 0),
          ]}
          onEdit={() => onEdit(item)}
          onStatus={(status) => onStatus("missions", item.id, status)}
          saving={saving === `missions-${item.id}`}
          canManage={canManage}
        />
      )}
    />
  );
}

function SeasonsTab({
  form,
  setForm,
  seasons,
  audiences,
  tariffSnapshots,
  guestLogCatalog,
  editingId,
  onSave,
  onEdit,
  onReset,
  onStatus,
  saving,
  canManage,
}: {
  form: SeasonForm;
  setForm: (form: SeasonForm) => void;
  seasons: GuestGameSeason[];
  audiences: GuestAudience[];
  tariffSnapshots: GuestGameTariffSnapshotEndpoint[];
  guestLogCatalog: GuestGameGuestLogCatalog;
  editingId: string | null;
  onSave: () => Promise<void>;
  onEdit: (season: GuestGameSeason) => void;
  onReset: () => void;
  onStatus: (
    type: "loot-boxes" | "missions" | "seasons",
    id: string,
    status: GuestGameStatus,
  ) => Promise<void>;
  saving: string | null;
  canManage: boolean;
}) {
  return (
    <RulesLayout
      canManage={canManage}
      formTitle={editingId ? "Редактирование Battle Pass" : "Сезон и Battle Pass"}
      form={
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Название">
              <input
                className={fieldClass}
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </Field>
            <Field label="Статус">
              <StatusSelect
                value={form.status}
                onChange={(status) => setForm({ ...form, status })}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Тип сезона">
              <input
                className={fieldClass}
                value={form.seasonType}
                onChange={(event) =>
                  setForm({ ...form, seasonType: event.target.value })
                }
              />
            </Field>
            <AudienceSelect
              audiences={audiences}
              value={form.audienceId}
              onChange={(audienceId) => setForm({ ...form, audienceId })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Начало">
              <input
                className={fieldClass}
                type="datetime-local"
                value={form.periodFrom}
                onChange={(event) =>
                  setForm({ ...form, periodFrom: event.target.value })
                }
              />
            </Field>
            <Field label="Окончание">
              <input
                className={fieldClass}
                type="datetime-local"
                value={form.periodTo}
                onChange={(event) =>
                  setForm({ ...form, periodTo: event.target.value })
                }
              />
            </Field>
          </div>
          <SeasonBusinessRules
            form={form}
            tariffSnapshots={tariffSnapshots}
            guestLogCatalog={guestLogCatalog}
            onChange={(patch) => setForm({ ...form, ...patch })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Premium">
              <label className="flex min-h-10 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm dark:border-zinc-800">
                <input
                  type="checkbox"
                  checked={form.premiumEnabled}
                  onChange={(event) =>
                    setForm({ ...form, premiumEnabled: event.target.checked })
                  }
                />
                Включен
              </label>
            </Field>
            <Field label="Upgrade mode">
              <input
                className={fieldClass}
                value={form.premiumUpgradeMode}
                onChange={(event) =>
                  setForm({ ...form, premiumUpgradeMode: event.target.value })
                }
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Бюджет">
              <input
                className={fieldClass}
                type="number"
                value={form.budgetAmount}
                onChange={(event) =>
                  setForm({ ...form, budgetAmount: event.target.value })
                }
              />
            </Field>
            <Field label="Подтверждение">
              <label className="flex min-h-10 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm dark:border-zinc-800">
                <input
                  type="checkbox"
                  checked={form.manualApprovalRequired}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      manualApprovalRequired: event.target.checked,
                    })
                  }
                />
                Вручную
              </label>
            </Field>
          </div>
          <Field label="Заметка">
            <textarea
              className={`${fieldClass} min-h-20`}
              value={form.note}
              onChange={(event) =>
                setForm({ ...form, note: event.target.value })
              }
            />
          </Field>
          <button
            type="button"
            className={primaryButtonClass}
            disabled={saving === "season"}
            onClick={onSave}
          >
            {editingId ? "Изменить сезон" : "Создать сезон"}
          </button>
          {editingId ? (
            <button type="button" className={smallButtonClass} onClick={onReset}>
              Сбросить выбор
            </button>
          ) : null}
        </div>
      }
      listTitle="Сезоны"
      items={seasons}
      renderItem={(item) => (
        <RuleCard
          key={item.id}
          title={item.name}
          status={item.status}
          subtitle={`${item.seasonType} · ${item.premiumEnabled ? "premium" : "free"}`}
          meta={[
            item.audience?.name ?? "все гости",
            packetModeLabel(stringRule(item.xpRules, "packetMode", "ANY")),
            tariffRuleSummary(item.xpRules),
            guestLogRuleSummary(item.xpRules),
            formatDate(item.periodFrom),
            formatMoney(item.budgetAmount ?? 0),
          ]}
          onEdit={() => onEdit(item)}
          onStatus={(status) => onStatus("seasons", item.id, status)}
          saving={saving === `seasons-${item.id}`}
          canManage={canManage}
        />
      )}
    />
  );
}

function RewardsTab({
  form,
  setForm,
  redeemForm,
  setRedeemForm,
  redeemedReward,
  rewards,
  profiles,
  guests,
  stores,
  lootBoxes,
  missions,
  seasons,
  editingId,
  onSave,
  onEdit,
  onReset,
  onStatus,
  onRedeem,
  saving,
  canApprove,
}: {
  form: RewardForm;
  setForm: (form: RewardForm) => void;
  redeemForm: RewardRedeemForm;
  setRedeemForm: Dispatch<SetStateAction<RewardRedeemForm>>;
  redeemedReward: GuestGameReward | null;
  rewards: GuestGameReward[];
  profiles: GuestGameProfile[];
  guests: GuestDashboardRow[];
  stores: Store[];
  lootBoxes: GuestGameLootBox[];
  missions: GuestGameMission[];
  seasons: GuestGameSeason[];
  editingId: string | null;
  onSave: () => Promise<void>;
  onEdit: (reward: GuestGameReward) => void;
  onReset: () => void;
  onStatus: (
    reward: GuestGameReward,
    status: GuestGameRewardStatus,
  ) => Promise<void>;
  onRedeem: () => Promise<void>;
  saving: string | null;
  canApprove: boolean;
}) {
  return (
    <div
      className={
        canApprove
          ? "grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]"
          : "grid gap-5"
      }
    >
      {canApprove ? (
      <Panel title={editingId ? "Редактирование награды" : "Ручная награда"}>
        <div className="space-y-3">
          <Field label="Профиль">
            <select
              className={fieldClass}
              value={form.profileId}
              onChange={(event) =>
                setForm({ ...form, profileId: event.target.value })
              }
            >
              <option value="">Не выбран</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.displayName} · L{profile.level}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Гость без профиля">
            <select
              className={fieldClass}
              value={form.guestId}
              onChange={(event) =>
                setForm({ ...form, guestId: event.target.value })
              }
            >
              <option value="">Не выбран</option>
              {guests.map((guest) => (
                <option key={guest.id} value={guest.id}>
                  {guest.displayName} · {guest.contact}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Источник">
              <select
                className={fieldClass}
                value={form.source}
                onChange={(event) =>
                  setForm({ ...form, source: event.target.value })
                }
              >
                <option value="MANUAL">ручной</option>
                <option value="CASHIER">кассир</option>
                <option value="API_IMPORT">импорт</option>
                <option value="LANGAME">Langame</option>
              </select>
            </Field>
            <Field label="Статус">
              <select
                className={fieldClass}
                value={form.status}
                onChange={(event) =>
                  setForm({
                    ...form,
                    status: event.target.value as GuestGameRewardStatus,
                  })
                }
              >
                {rewardStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {rewardStatusLabels[status]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Тип">
              <input
                className={fieldClass}
                value={form.rewardType}
                onChange={(event) =>
                  setForm({ ...form, rewardType: event.target.value })
                }
              />
            </Field>
            <Field label="Сумма">
              <input
                className={fieldClass}
                type="number"
                value={form.rewardAmount}
                onChange={(event) =>
                  setForm({ ...form, rewardAmount: event.target.value })
                }
              />
            </Field>
          </div>
          <Field label="Название">
            <input
              className={fieldClass}
              value={form.rewardLabel}
              onChange={(event) =>
                setForm({ ...form, rewardLabel: event.target.value })
              }
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Код">
              <input
                className={fieldClass}
                value={form.rewardCode}
                onChange={(event) =>
                  setForm({ ...form, rewardCode: event.target.value })
                }
              />
            </Field>
            <Field label="Сгорает">
              <input
                className={fieldClass}
                type="datetime-local"
                value={form.expiresAt}
                onChange={(event) =>
                  setForm({ ...form, expiresAt: event.target.value })
                }
              />
            </Field>
          </div>
          <Field label="Клуб">
            <select
              className={fieldClass}
              value={form.storeId}
              onChange={(event) =>
                setForm({ ...form, storeId: event.target.value })
              }
            >
              <option value="">Любой</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </Field>
          <LinkSelect
            label="Лутбокс"
            value={form.lootBoxId}
            items={lootBoxes}
            onChange={(lootBoxId) => setForm({ ...form, lootBoxId })}
          />
          <LinkSelect
            label="Миссия"
            value={form.missionId}
            items={missions}
            onChange={(missionId) => setForm({ ...form, missionId })}
          />
          <LinkSelect
            label="Сезон"
            value={form.seasonId}
            items={seasons}
            onChange={(seasonId) => setForm({ ...form, seasonId })}
          />
          <Field label="Заметка">
            <textarea
              className={`${fieldClass} min-h-20`}
              value={form.note}
              onChange={(event) =>
                setForm({ ...form, note: event.target.value })
              }
            />
          </Field>
          <JsonField
            label="Evidence"
            value={form.evidenceText}
            onChange={(evidenceText) => setForm({ ...form, evidenceText })}
          />
          <button
            type="button"
            className={primaryButtonClass}
            disabled={saving === "reward"}
            onClick={onSave}
          >
            {editingId ? "Изменить награду" : "Поставить в кошелек"}
          </button>
          {editingId ? (
            <button type="button" className={smallButtonClass} onClick={onReset}>
              Сбросить выбор
            </button>
          ) : null}
        </div>
      </Panel>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionTitle title="Кошелек наград" />
          {canApprove ? (
          <a
            className={smallButtonClass}
            href="/api/guests/gamification/rewards/export"
            download
          >
            Экспорт CSV
          </a>
          ) : null}
        </div>
        {canApprove ? (
        <div className="rounded-lg border border-cyan-200 bg-cyan-50/70 p-4 dark:border-cyan-900/60 dark:bg-cyan-950/20">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-zinc-950 dark:text-white">
                Погашение кода
              </p>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                Вставьте код с гостевой страницы или весь QR payload. Награда
                перейдет в статус “выдано”.
              </p>
            </div>
            <div className="grid flex-1 gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <input
                className={fieldClass}
                value={redeemForm.claim}
                placeholder="LP-... или LEETPLUS_REWARD:..."
                onChange={(event) =>
                  setRedeemForm((current) => ({
                    ...current,
                    claim: event.target.value,
                  }))
                }
              />
              <select
                className={fieldClass}
                value={redeemForm.storeId}
                onChange={(event) =>
                  setRedeemForm((current) => ({
                    ...current,
                    storeId: event.target.value,
                  }))
                }
              >
                <option value="">Клуб не проверять</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className={primaryButtonClass}
              disabled={saving === "rewardRedeem"}
              onClick={onRedeem}
            >
              Погасить
            </button>
          </div>
          <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <input
              className={fieldClass}
              value={redeemForm.note}
              placeholder="Заметка кассира, если нужна"
              onChange={(event) =>
                setRedeemForm((current) => ({
                  ...current,
                  note: event.target.value,
                }))
              }
            />
            {redeemedReward ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
                Погашено:{" "}
                <span className="font-bold">{redeemedReward.rewardLabel}</span>
                {" · "}
                {redeemedReward.profile?.displayName ??
                  redeemedReward.guest?.displayName ??
                  redeemedReward.guestExternalId ??
                  "гость"}
                {" · "}
                <span className="font-mono">
                  {redeemedReward.rewardCode ?? "без кода"}
                </span>
              </div>
            ) : (
              <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                Кассирский сценарий работает внутри LeetPlus: проверка кода,
                защита от повторной выдачи и системное событие в истории.
              </div>
            )}
          </div>
        </div>
        ) : (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300">
            У вас read-only доступ к кошельку наград: можно смотреть очередь,
            статусы, коды и историю, но ручная выдача, экспорт, изменение
            статусов и кассирское погашение недоступны.
          </div>
        )}
        <div className="space-y-2">
          {rewards.length ? (
            rewards.map((reward) => (
              <RewardRow
                key={reward.id}
                reward={reward}
                onStatus={onStatus}
                onEdit={onEdit}
                saving={saving}
                canApprove={canApprove}
              />
            ))
          ) : (
            <EmptyState text="Наград пока нет" />
          )}
        </div>
      </section>
    </div>
  );
}

function LootBoxBusinessRules({
  form,
  tariffSnapshots,
  guestLogCatalog,
  onChange,
}: {
  form: LootBoxForm;
  tariffSnapshots: GuestGameTariffSnapshotEndpoint[];
  guestLogCatalog: GuestGameGuestLogCatalog;
  onChange: (patch: Partial<LootBoxForm>) => void;
}) {
  return (
    <BusinessRuleSection
      title="Правила запуска"
      description="Настройте, когда лутбокс открывается, сколько раз его можно получить и как распределяются награды."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <ToggleField
          label="Только тихие часы"
          checked={form.quietHoursEnabled}
          onChange={(quietHoursEnabled) => onChange({ quietHoursEnabled })}
        />
        <ToggleField
          label="Только будни"
          checked={form.weekdaysOnly}
          onChange={(weekdaysOnly) => onChange({ weekdaysOnly })}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Начало окна">
          <input
            className={fieldClass}
            type="time"
            value={form.hourFrom}
            onChange={(event) => onChange({ hourFrom: event.target.value })}
          />
        </Field>
        <Field label="Конец окна">
          <input
            className={fieldClass}
            type="time"
            value={form.hourTo}
            onChange={(event) => onChange({ hourTo: event.target.value })}
          />
        </Field>
      </div>
      <TariffConditionFields
        snapshots={tariffSnapshots}
        tariffGroupId={form.tariffGroupId}
        tariffPeriodId={form.tariffPeriodId}
        tariffTypeId={form.tariffTypeId}
        onChange={onChange}
      />
      <GuestLogConditionFields
        guestLogTypes={form.guestLogTypes}
        blockedGuestLogTypes={form.blockedGuestLogTypes}
        catalog={guestLogCatalog}
        onChange={onChange}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Раз в неделю на гостя">
          <input
            className={fieldClass}
            type="number"
            min="0"
            value={form.perGuestPerWeek}
            onChange={(event) =>
              onChange({ perGuestPerWeek: event.target.value })
            }
          />
        </Field>
        <Field label="Открытий в день">
          <input
            className={fieldClass}
            type="number"
            min="0"
            value={form.totalPerDay}
            onChange={(event) => onChange({ totalPerDay: event.target.value })}
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Вес XP">
          <input
            className={fieldClass}
            type="number"
            min="0"
            value={form.probabilityXpWeight}
            onChange={(event) =>
              onChange({ probabilityXpWeight: event.target.value })
            }
          />
        </Field>
        <Field label="Вес промокода">
          <input
            className={fieldClass}
            type="number"
            min="0"
            value={form.probabilityPromoWeight}
            onChange={(event) =>
              onChange({ probabilityPromoWeight: event.target.value })
            }
          />
        </Field>
        <Field label="Вес миссии">
          <input
            className={fieldClass}
            type="number"
            min="0"
            value={form.probabilityMissionWeight}
            onChange={(event) =>
              onChange({ probabilityMissionWeight: event.target.value })
            }
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <ToggleField
          label="Подтверждает кассир"
          checked={form.requireCashierConfirmation}
          onChange={(requireCashierConfirmation) =>
            onChange({ requireCashierConfirmation })
          }
        />
        <ToggleField
          label="Один девайс на гостя"
          checked={form.oneDevicePerGuest}
          onChange={(oneDevicePerGuest) => onChange({ oneDevicePerGuest })}
        />
      </div>
    </BusinessRuleSection>
  );
}

function MissionBusinessRules({
  form,
  tariffSnapshots,
  guestLogCatalog,
  onChange,
}: {
  form: MissionForm;
  tariffSnapshots: GuestGameTariffSnapshotEndpoint[];
  guestLogCatalog: GuestGameGuestLogCatalog;
  onChange: (patch: Partial<MissionForm>) => void;
}) {
  return (
    <BusinessRuleSection
      title="Условия выполнения"
      description="Опишите проверяемое поведение гостя простыми правилами. Факты берутся из подготовленных данных Langame."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Тип сессии">
          <select
            className={fieldClass}
            value={form.sessionType}
            onChange={(event) => onChange({ sessionType: event.target.value })}
          >
            {sessionTypeOptions.map((option) => (
              <option key={option.value || "any"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Пакет часов">
          <select
            className={fieldClass}
            value={form.packetMode}
            onChange={(event) => onChange({ packetMode: event.target.value })}
          >
            {packetModeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <TariffConditionFields
        snapshots={tariffSnapshots}
        tariffGroupId={form.tariffGroupId}
        tariffPeriodId={form.tariffPeriodId}
        tariffTypeId={form.tariffTypeId}
        onChange={onChange}
      />
      <GuestLogConditionFields
        guestLogTypes={form.guestLogTypes}
        blockedGuestLogTypes={form.blockedGuestLogTypes}
        catalog={guestLogCatalog}
        onChange={onChange}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Окно выполнения, дней">
          <input
            className={fieldClass}
            type="number"
            min="1"
            value={form.windowDays}
            onChange={(event) => onChange({ windowDays: event.target.value })}
          />
        </Field>
        <Field label="Минут в сессии">
          <input
            className={fieldClass}
            type="number"
            min="0"
            value={form.minSessionMinutes}
            onChange={(event) =>
              onChange({ minSessionMinutes: event.target.value })
            }
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Минимальная покупка, руб">
          <input
            className={fieldClass}
            type="number"
            min="0"
            value={form.minSpendAmount}
            onChange={(event) =>
              onChange({ minSpendAmount: event.target.value })
            }
          />
        </Field>
        <ToggleField
          label="Только будни"
          checked={form.weekdaysOnly}
          onChange={(weekdaysOnly) => onChange({ weekdaysOnly })}
        />
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white/70 p-3 dark:border-zinc-800 dark:bg-zinc-950/60">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-950 dark:text-white">
              Квестовая цепочка
            </p>
            <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              Разбейте миссию на понятные гостю шаги. В публичном кабинете они
              будут показаны от первого шага к награде.
            </p>
          </div>
          <ToggleField
            label="Включить цепочку"
            checked={form.questEnabled}
            onChange={(questEnabled) => onChange({ questEnabled })}
          />
        </div>
        {form.questEnabled ? (
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <Field label="Шаг 1">
              <input
                className={fieldClass}
                value={form.questStepOne}
                onChange={(event) =>
                  onChange({ questStepOne: event.target.value })
                }
              />
            </Field>
            <Field label="Шаг 2">
              <input
                className={fieldClass}
                value={form.questStepTwo}
                onChange={(event) =>
                  onChange({ questStepTwo: event.target.value })
                }
              />
            </Field>
            <Field label="Шаг 3">
              <input
                className={fieldClass}
                value={form.questStepThree}
                onChange={(event) =>
                  onChange({ questStepThree: event.target.value })
                }
              />
            </Field>
          </div>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <ToggleField
          label="Нужен факт Langame"
          checked={form.requireLangameFact}
          onChange={(requireLangameFact) => onChange({ requireLangameFact })}
        />
        <ToggleField
          label="Без повтора в тот же день"
          checked={form.denySameDayRepeat}
          onChange={(denySameDayRepeat) => onChange({ denySameDayRepeat })}
        />
        <ToggleField
          label="Подтверждает кассир"
          checked={form.requireCashierConfirmation}
          onChange={(requireCashierConfirmation) =>
            onChange({ requireCashierConfirmation })
          }
        />
      </div>
    </BusinessRuleSection>
  );
}

function SeasonBusinessRules({
  form,
  tariffSnapshots,
  guestLogCatalog,
  onChange,
}: {
  form: SeasonForm;
  tariffSnapshots: GuestGameTariffSnapshotEndpoint[];
  guestLogCatalog: GuestGameGuestLogCatalog;
  onChange: (patch: Partial<SeasonForm>) => void;
}) {
  return (
    <BusinessRuleSection
      title="Лестница Battle Pass"
      description="Задайте XP за действия, количество уровней и частоту наград. Система соберет free и premium дорожки сама."
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Field label="XP за визит">
          <input
            className={fieldClass}
            type="number"
            min="0"
            value={form.xpVisit}
            onChange={(event) => onChange({ xpVisit: event.target.value })}
          />
        </Field>
        <Field label="XP за час">
          <input
            className={fieldClass}
            type="number"
            min="0"
            value={form.xpPlayHour}
            onChange={(event) => onChange({ xpPlayHour: event.target.value })}
          />
        </Field>
        <Field label="XP за бар">
          <input
            className={fieldClass}
            type="number"
            min="0"
            value={form.xpBarPurchase}
            onChange={(event) =>
              onChange({ xpBarPurchase: event.target.value })
            }
          />
        </Field>
        <Field label="XP за миссию">
          <input
            className={fieldClass}
            type="number"
            min="0"
            value={form.xpMissionCompletion}
            onChange={(event) =>
              onChange({ xpMissionCompletion: event.target.value })
            }
          />
        </Field>
        <Field label="XP за guests/logs">
          <input
            className={fieldClass}
            type="number"
            min="0"
            value={form.xpGuestLog}
            onChange={(event) => onChange({ xpGuestLog: event.target.value })}
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Тип сессии">
          <select
            className={fieldClass}
            value={form.sessionType}
            onChange={(event) => onChange({ sessionType: event.target.value })}
          >
            {sessionTypeOptions.map((option) => (
              <option key={option.value || "any"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Пакет часов">
          <select
            className={fieldClass}
            value={form.packetMode}
            onChange={(event) => onChange({ packetMode: event.target.value })}
          >
            {packetModeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Бонус XP за пакет">
          <input
            className={fieldClass}
            type="number"
            min="0"
            value={form.xpPacketSessionBonus}
            onChange={(event) =>
              onChange({ xpPacketSessionBonus: event.target.value })
            }
          />
        </Field>
      </div>
      <TariffConditionFields
        snapshots={tariffSnapshots}
        tariffGroupId={form.tariffGroupId}
        tariffPeriodId={form.tariffPeriodId}
        tariffTypeId={form.tariffTypeId}
        onChange={onChange}
      />
      <GuestLogConditionFields
        guestLogTypes={form.guestLogTypes}
        blockedGuestLogTypes={form.blockedGuestLogTypes}
        catalog={guestLogCatalog}
        onChange={onChange}
      />
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Уровней">
          <input
            className={fieldClass}
            type="number"
            min="1"
            value={form.levelCount}
            onChange={(event) => onChange({ levelCount: event.target.value })}
          />
        </Field>
        <Field label="XP на уровень">
          <input
            className={fieldClass}
            type="number"
            min="1"
            value={form.xpPerLevel}
            onChange={(event) => onChange({ xpPerLevel: event.target.value })}
          />
        </Field>
        <Field label="Free каждые N уровней">
          <input
            className={fieldClass}
            type="number"
            min="0"
            value={form.freeRewardEvery}
            onChange={(event) =>
              onChange({ freeRewardEvery: event.target.value })
            }
          />
        </Field>
        <Field label="Premium каждые N уровней">
          <input
            className={fieldClass}
            type="number"
            min="0"
            value={form.premiumRewardEvery}
            onChange={(event) =>
              onChange({ premiumRewardEvery: event.target.value })
            }
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Free награда">
          <input
            className={fieldClass}
            value={form.freeRewardLabel}
            onChange={(event) =>
              onChange({ freeRewardLabel: event.target.value })
            }
          />
        </Field>
        <Field label="Premium награда">
          <input
            className={fieldClass}
            value={form.premiumRewardLabel}
            onChange={(event) =>
              onChange({ premiumRewardLabel: event.target.value })
            }
          />
        </Field>
      </div>
    </BusinessRuleSection>
  );
}

function BusinessRuleSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="space-y-3 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.04] p-3">
      <legend className="px-1 text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
        {title}
      </legend>
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        {description}
      </p>
      {children}
    </fieldset>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function RuleCommonFields({
  status,
  name,
  rewardType,
  rewardAmount,
  rewardLabel,
  audienceId,
  budgetAmount,
  manualApprovalRequired,
  note,
  audiences,
  onChange,
}: {
  status: GuestGameStatus;
  name: string;
  rewardType: string;
  rewardAmount: string;
  rewardLabel: string;
  audienceId: string;
  budgetAmount: string;
  manualApprovalRequired: boolean;
  note: string;
  audiences: GuestAudience[];
  onChange: (patch: Partial<LootBoxForm & MissionForm>) => void;
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Название">
          <input
            className={fieldClass}
            value={name}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </Field>
        <Field label="Статус">
          <StatusSelect value={status} onChange={(next) => onChange({ status: next })} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Тип награды">
          <input
            className={fieldClass}
            value={rewardType}
            onChange={(event) => onChange({ rewardType: event.target.value })}
          />
        </Field>
        <Field label="Сумма">
          <input
            className={fieldClass}
            type="number"
            value={rewardAmount}
            onChange={(event) => onChange({ rewardAmount: event.target.value })}
          />
        </Field>
        <Field label="Бюджет">
          <input
            className={fieldClass}
            type="number"
            value={budgetAmount}
            onChange={(event) => onChange({ budgetAmount: event.target.value })}
          />
        </Field>
      </div>
      <Field label="Название награды">
        <input
          className={fieldClass}
          value={rewardLabel}
          onChange={(event) => onChange({ rewardLabel: event.target.value })}
        />
      </Field>
      <AudienceSelect
        audiences={audiences}
        value={audienceId}
        onChange={(next) => onChange({ audienceId: next })}
      />
      <Field label="Подтверждение">
        <label className="flex min-h-10 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm dark:border-zinc-800">
          <input
            type="checkbox"
            checked={manualApprovalRequired}
            onChange={(event) =>
              onChange({ manualApprovalRequired: event.target.checked })
            }
          />
          Вручную
        </label>
      </Field>
      <Field label="Заметка">
        <textarea
          className={`${fieldClass} min-h-20`}
          value={note}
          onChange={(event) => onChange({ note: event.target.value })}
        />
      </Field>
    </>
  );
}

function RulesLayout<T>({
  canManage,
  formTitle,
  form,
  listTitle,
  items,
  renderItem,
}: {
  canManage: boolean;
  formTitle: string;
  form: ReactNode;
  listTitle: string;
  items: T[];
  renderItem: (item: T) => ReactNode;
}) {
  return (
    <div
      className={
        canManage
          ? "grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]"
          : "grid gap-5"
      }
    >
      {canManage ? <Panel title={formTitle}>{form}</Panel> : null}
      <section className="space-y-3">
        <SectionTitle title={listTitle} />
        <div className="grid gap-3 lg:grid-cols-2">
          {items.length ? (
            items.map(renderItem)
          ) : (
            <EmptyState text="Правил пока нет" />
          )}
        </div>
      </section>
    </div>
  );
}

function ProfileCard({
  profile,
  onEdit,
  onStatus,
  saving,
  canManage,
}: {
  profile: GuestGameProfile;
  onEdit: (profile: GuestGameProfile) => void;
  onStatus: (
    profile: GuestGameProfile,
    status: GuestGameProfileStatus,
  ) => Promise<void>;
  saving: string | null;
  canManage: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-zinc-950 dark:text-white">
            {profile.displayName}
          </h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {profile.contactMasked ?? profile.guest?.externalGuestId ?? "контакт не задан"}
          </p>
        </div>
        <StatusPill label={profileStatusLabels[profile.status]} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
        <MiniMetric label="XP" value={profile.xp} />
        <MiniMetric label="Уровень" value={profile.level} />
        <MiniMetric label="Канал" value={profile.telegramIdentity ? "TG" : profile.maxIdentity ? "MAX" : "-"} />
      </div>
      {canManage ? (
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={smallButtonClass}
          onClick={() => onEdit(profile)}
        >
          Редактировать
        </button>
        {profileStatusOptions.map((status) => (
          <button
            key={status}
            type="button"
            className={smallButtonClass}
            disabled={saving === `profile-${profile.id}` || profile.status === status}
            onClick={() => onStatus(profile, status)}
          >
            {profileStatusLabels[status]}
          </button>
        ))}
      </div>
      ) : (
        <p className="mt-4 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Только просмотр профиля: изменение XP и статуса недоступно.
        </p>
      )}
    </div>
  );
}

function RuleCard({
  title,
  status,
  subtitle,
  meta,
  onEdit,
  onStatus,
  saving,
  canManage,
}: {
  title: string;
  status: GuestGameStatus;
  subtitle: string;
  meta: string[];
  onEdit: () => void;
  onStatus: (status: GuestGameStatus) => Promise<void>;
  saving: boolean;
  canManage: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-zinc-950 dark:text-white">
            {title}
          </h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {subtitle}
          </p>
        </div>
        <StatusPill label={statusLabels[status]} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {meta.map((item) => (
          <span
            key={item}
            className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
          >
            {item}
          </span>
        ))}
      </div>
      {canManage ? (
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={smallButtonClass} onClick={onEdit}>
          Редактировать
        </button>
        {statusOptions.map((nextStatus) => (
          <button
            key={nextStatus}
            type="button"
            className={smallButtonClass}
            disabled={saving || status === nextStatus}
            onClick={() => onStatus(nextStatus)}
          >
            {statusLabels[nextStatus]}
          </button>
        ))}
      </div>
      ) : (
        <p className="mt-4 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Только просмотр правила: редактирование и смена статуса недоступны.
        </p>
      )}
    </div>
  );
}

function RewardRow({
  reward,
  onStatus,
  onEdit,
  saving,
  canApprove,
}: {
  reward: GuestGameReward;
  onStatus: (
    reward: GuestGameReward,
    status: GuestGameRewardStatus,
  ) => Promise<void>;
  onEdit: (reward: GuestGameReward) => void;
  saving: string | null;
  canApprove: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-zinc-950 dark:text-white">
              {reward.rewardLabel}
            </h3>
            <StatusPill label={rewardStatusLabels[reward.status]} />
            <StatusPill label={rewardWalletStateLabels[reward.walletState]} />
          </div>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {reward.profile?.displayName ??
              reward.guest?.displayName ??
              reward.guestExternalId ??
              "без гостя"}{" "}
            · {reward.rewardType} · {formatMoney(reward.rewardAmount)}
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            {reward.store?.name ?? "любой клуб"} · {formatDate(reward.qualifiedAt)}
          </p>
          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
              <span className="block font-semibold uppercase text-zinc-400">
                Код кассиру
              </span>
              <span className="mt-1 block font-mono text-sm font-bold text-zinc-900 dark:text-white">
                {reward.rewardCode ?? "будет создан при согласовании"}
              </span>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
              <span className="block font-semibold uppercase text-zinc-400">
                Срок
              </span>
              <span className="mt-1 block text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                {reward.expiresAt ? formatDate(reward.expiresAt) : "без срока"}
              </span>
            </div>
          </div>
          {reward.claimPayload ? (
            <p className="mt-2 break-all rounded-lg border border-dashed border-cyan-300/40 px-3 py-2 font-mono text-xs text-cyan-700 dark:text-cyan-200">
              QR payload: {reward.claimPayload}
            </p>
          ) : null}
        </div>
        {canApprove ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={smallButtonClass}
            onClick={() => onEdit(reward)}
          >
            Редактировать
          </button>
          {rewardStatusOptions.map((status) => (
            <button
              key={status}
              type="button"
              className={smallButtonClass}
              disabled={saving === `reward-${reward.id}` || reward.status === status}
              onClick={() => onStatus(reward, status)}
            >
              {rewardStatusLabels[status]}
            </button>
          ))}
        </div>
        ) : (
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 sm:text-right">
            Только просмотр награды
          </p>
        )}
      </div>
    </div>
  );
}

function EventRow({ event }: { event: GuestGameEvent }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-bold text-zinc-950 dark:text-white">
            {event.eventType}
          </h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {event.profile?.displayName ?? event.guest?.displayName ?? "без профиля"}
            {event.xpDelta ? ` · ${event.xpDelta > 0 ? "+" : ""}${event.xpDelta} XP` : ""}
          </p>
        </div>
        <p className="text-xs font-medium text-zinc-400">
          {formatDate(event.occurredAt)}
        </p>
      </div>
      {event.note ? (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          {event.note}
        </p>
      ) : null}
    </div>
  );
}

function StatusSelect({
  value,
  onChange,
}: {
  value: GuestGameStatus;
  onChange: (value: GuestGameStatus) => void;
}) {
  return (
    <select
      className={fieldClass}
      value={value}
      onChange={(event) => onChange(event.target.value as GuestGameStatus)}
    >
      {statusOptions.map((status) => (
        <option key={status} value={status}>
          {statusLabels[status]}
        </option>
      ))}
    </select>
  );
}

function AudienceSelect({
  audiences,
  value,
  onChange,
}: {
  audiences: GuestAudience[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label="Группа гостей">
      <select
        className={fieldClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Все гости</option>
        {audiences.map((audience) => (
          <option key={audience.id} value={audience.id}>
            {audience.name} · {audience.guestsCount}
          </option>
        ))}
      </select>
    </Field>
  );
}

function StoreSelect({
  stores,
  value,
  onChange,
}: {
  stores: Store[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <Field label="Клубы">
      <select
        className={`${fieldClass} min-h-28`}
        multiple
        value={value}
        onChange={(event) =>
          onChange(
            Array.from(event.target.selectedOptions).map((option) => option.value),
          )
        }
      >
        {stores.map((store) => (
          <option key={store.id} value={store.id}>
            {store.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

type TariffConditionPatch = {
  tariffGroupId?: string;
  tariffPeriodId?: string;
  tariffTypeId?: string;
};

function TariffConditionFields({
  snapshots,
  tariffGroupId,
  tariffPeriodId,
  tariffTypeId,
  onChange,
}: {
  snapshots: GuestGameTariffSnapshotEndpoint[];
  tariffGroupId: string;
  tariffPeriodId: string;
  tariffTypeId: string;
  onChange: (patch: TariffConditionPatch) => void;
}) {
  const groupItems = tariffItemsByEndpoint(snapshots, "tariffsGroups");
  const periodItems = tariffItemsByEndpoint(snapshots, "tariffsTimePeriod");
  const typeItems = tariffItemsByEndpoint(snapshots, "tariffsTypesGroups");
  const hasItems = groupItems.length || periodItems.length || typeItems.length;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
          Тарифные условия Langame
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {hasItems
            ? "Выберите только те условия, которые должны ограничивать правило."
            : "Справочники тарифов пока не заполнены snapshot-синхронизацией."}
        </p>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <TariffConditionSelect
          label="Группа тарифа"
          emptyLabel="Любая группа"
          items={groupItems}
          value={tariffGroupId}
          onChange={(value) => onChange({ tariffGroupId: value })}
        />
        <TariffConditionSelect
          label="Период тарифа"
          emptyLabel="Любой период"
          items={periodItems}
          value={tariffPeriodId}
          onChange={(value) => onChange({ tariffPeriodId: value })}
        />
        <TariffConditionSelect
          label="Тип тарифа"
          emptyLabel="Любой тип"
          items={typeItems}
          value={tariffTypeId}
          onChange={(value) => onChange({ tariffTypeId: value })}
        />
      </div>
    </div>
  );
}

type GuestLogBusinessPreset = {
  id: string;
  label: string;
  description: string;
  intent: "allow" | "block";
  tokens: string[];
  types: string[];
};

const guestLogBusinessPresetDefinitions: Array<
  Omit<GuestLogBusinessPreset, "types">
> = [
  {
    id: "visit_or_session_start",
    label: "Старт визита или сессии",
    description: "Подходит для лутбокса при начале игры или миссии на визит.",
    intent: "allow",
    tokens: [
      "start",
      "visit",
      "login",
      "session",
      "play",
      "старт",
      "визит",
      "вход",
      "начал",
      "начало",
      "сесс",
      "сеанс",
      "игр",
    ],
  },
  {
    id: "session_finish",
    label: "Завершение сессии",
    description: "Полезно для миссий на отыгранную сессию или итоговый XP.",
    intent: "allow",
    tokens: [
      "finish",
      "finished",
      "end",
      "stop",
      "logout",
      "close",
      "заверш",
      "оконч",
      "выход",
      "стоп",
    ],
  },
  {
    id: "events_and_tournaments",
    label: "Турниры и события",
    description: "Подходит для квестов за участие в турнирах и клубных событиях.",
    intent: "allow",
    tokens: [
      "tournament",
      "event",
      "quest",
      "mission",
      "challenge",
      "турнир",
      "событ",
      "ивент",
      "квест",
      "мисси",
      "челлендж",
    ],
  },
  {
    id: "balance_and_payment",
    label: "Баланс и оплата",
    description: "Подходит для миссий или XP за пополнение, оплату или бонусы.",
    intent: "allow",
    tokens: [
      "balance",
      "payment",
      "pay",
      "deposit",
      "bonus",
      "topup",
      "transaction",
      "cash",
      "плат",
      "баланс",
      "пополн",
      "бонус",
      "депозит",
      "касс",
    ],
  },
  {
    id: "manual_or_risk",
    label: "Ручные и рискованные события",
    description: "Лучше добавлять в запрет anti-fraud, чтобы исключить тесты и корректировки.",
    intent: "block",
    tokens: [
      "manual",
      "cancel",
      "rollback",
      "refund",
      "delete",
      "edit",
      "test",
      "debug",
      "admin",
      "коррект",
      "отмен",
      "возврат",
      "тест",
      "удал",
      "ручн",
      "админ",
      "ошиб",
    ],
  },
];

const guestLogMappingPresetOptions: Array<{
  id: GuestGameGuestLogMappingPreset;
  label: string;
}> = [
  ...guestLogBusinessPresetDefinitions.map((definition) => ({
    id: definition.id as GuestGameGuestLogMappingPreset,
    label: definition.label,
  })),
  { id: "custom", label: "Свой смысл" },
];

function guestLogMappingDraftFromItem(
  item: GuestGameGuestLogCatalog["items"][number] | null,
): GuestLogMappingPayload {
  return {
    rawType: item?.type ?? "",
    label: item?.mapping?.label ?? item?.type ?? "",
    preset: item?.mapping?.preset ?? "custom",
    intent: item?.mapping?.intent ?? "allow",
    note: item?.mapping?.note ?? "",
  };
}

function guestLogBusinessPresets(
  items: GuestGameGuestLogCatalog["items"],
): GuestLogBusinessPreset[] {
  if (!items.length) {
    return [];
  }

  const mappedPresets = new Map<string, GuestLogBusinessPreset>();

  for (const item of items) {
    if (!item.mapping) {
      continue;
    }

    const definition = guestLogBusinessPresetDefinitions.find(
      (preset) => preset.id === item.mapping?.preset,
    );
    const id = `mapped:${item.mapping.preset}:${item.mapping.intent}`;
    const existing = mappedPresets.get(id) ?? {
      id,
      label:
        item.mapping.preset === "custom"
          ? item.mapping.label
          : definition?.label ?? item.mapping.label,
      description:
        item.mapping.note ??
        definition?.description ??
        "Сохраненное сопоставление raw-типа guests/logs.",
      intent: item.mapping.intent,
      tokens: [],
      types: [],
    };

    if (!existing.types.includes(item.type)) {
      existing.types.push(item.type);
    }

    mappedPresets.set(id, existing);
  }

  const autoPresets = guestLogBusinessPresetDefinitions
    .map((definition) => ({
      ...definition,
      types: Array.from(
        new Set(
          items
            .filter(
              (item) =>
                !item.mapping && guestLogTypeMatchesPreset(item, definition.tokens),
            )
            .map((item) => item.type),
        ),
      ),
    }))
    .filter((preset) => preset.types.length);

  return [...mappedPresets.values(), ...autoPresets];
}

function guestLogTypeMatchesPreset(
  item: GuestGameGuestLogCatalog["items"][number],
  tokens: string[],
) {
  const searchable = `${item.type} ${item.normalizedType}`.toLowerCase();

  return tokens.some((token) => searchable.includes(token.toLowerCase()));
}

type GuestLogConditionPatch = {
  guestLogTypes?: string;
  blockedGuestLogTypes?: string;
};

function GuestLogConditionFields({
  guestLogTypes,
  blockedGuestLogTypes,
  catalog,
  onChange,
}: {
  guestLogTypes: string;
  blockedGuestLogTypes: string;
  catalog: GuestGameGuestLogCatalog;
  onChange: (patch: GuestLogConditionPatch) => void;
}) {
  const suggestedTypes = catalog.items.slice(0, 14);
  const businessPresets = guestLogBusinessPresets(catalog.items);
  const addAllowedType = (type: string) =>
    onChange({ guestLogTypes: appendCsvToken(guestLogTypes, type) });
  const addBlockedType = (type: string) =>
    onChange({
      blockedGuestLogTypes: appendCsvToken(blockedGuestLogTypes, type),
    });
  const applyPreset = (preset: GuestLogBusinessPreset) => {
    if (preset.intent === "block") {
      onChange({
        blockedGuestLogTypes: appendCsvTokens(
          blockedGuestLogTypes,
          preset.types,
        ),
      });
      return;
    }

    onChange({ guestLogTypes: appendCsvTokens(guestLogTypes, preset.types) });
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
          Типы событий guests/logs
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {catalog.summary.types
            ? `${catalog.summary.types} типов · ${catalog.summary.logs} логов · ${catalog.summary.domains} источников`
            : "Каталог пока пуст: включите расширенную синхронизацию guests/logs."}
        </p>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Разрешенные типы">
          <input
            className={fieldClass}
            placeholder="visit, login, tournament"
            value={guestLogTypes}
            onChange={(event) => onChange({ guestLogTypes: event.target.value })}
          />
        </Field>
        <Field label="Запрещенные типы">
          <input
            className={fieldClass}
            placeholder="manual_cancel, test"
            value={blockedGuestLogTypes}
            onChange={(event) =>
              onChange({ blockedGuestLogTypes: event.target.value })
            }
          />
        </Field>
      </div>
      {businessPresets.length ? (
        <div className="mt-3 rounded-lg border border-cyan-100 bg-cyan-50/70 p-3 dark:border-cyan-950 dark:bg-cyan-950/20">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
              Бизнес-пресеты
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Система группирует raw-типы по смыслу, сами значения сохраняются
              в правило.
            </p>
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {businessPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="rounded-lg border border-cyan-200 bg-white p-3 text-left transition hover:border-cyan-400 hover:bg-cyan-50 dark:border-cyan-900/70 dark:bg-zinc-950 dark:hover:border-cyan-600 dark:hover:bg-cyan-950/30"
                onClick={() => applyPreset(preset)}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-zinc-950 dark:text-white">
                    {preset.label}
                  </span>
                  <span
                    className={[
                      "shrink-0 rounded-full px-2 py-1 text-[11px] font-bold uppercase",
                      preset.intent === "block"
                        ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-200"
                        : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100",
                    ].join(" ")}
                  >
                    {preset.intent === "block" ? "запрет" : "допуск"}
                  </span>
                </span>
                <span className="mt-1 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                  {preset.description}
                </span>
                <span className="mt-2 block truncate text-[11px] font-semibold text-cyan-700 dark:text-cyan-300">
                  {preset.types.slice(0, 4).join(", ")}
                  {preset.types.length > 4 ? ` +${preset.types.length - 4}` : ""}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {suggestedTypes.length ? (
        <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 dark:border-emerald-950 dark:bg-emerald-950/20">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
              Найденные типы Langame
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {catalog.summary.latestAt
                ? `последний лог ${formatDate(catalog.summary.latestAt)}`
                : "по сохраненным snapshot-фактам"}
            </p>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestedTypes.map((item) => {
              const domainLabel = item.domains
                .slice(0, 2)
                .map((domain) => domain.domain)
                .join(", ");

              return (
                <span
                  key={item.normalizedType}
                  className="inline-flex max-w-full items-center overflow-hidden rounded-full border border-emerald-200 bg-white text-xs shadow-sm dark:border-emerald-900/70 dark:bg-zinc-950"
                  title={`${item.count} логов${domainLabel ? ` · ${domainLabel}` : ""}`}
                >
                  <button
                    type="button"
                    className="max-w-48 truncate px-2.5 py-1.5 font-semibold text-zinc-800 transition hover:bg-emerald-100 hover:text-emerald-900 dark:text-zinc-100 dark:hover:bg-emerald-950"
                    onClick={() => addAllowedType(item.type)}
                  >
                    {item.type}
                  </button>
                  <span className="border-l border-emerald-100 px-2 py-1.5 font-semibold text-zinc-400 dark:border-emerald-900/70">
                    {item.count}
                  </span>
                  <button
                    type="button"
                    className="border-l border-emerald-100 px-2 py-1.5 font-semibold text-zinc-500 transition hover:bg-red-50 hover:text-red-700 dark:border-emerald-900/70 dark:hover:bg-red-950/30 dark:hover:text-red-200"
                    onClick={() => addBlockedType(item.type)}
                  >
                    запретить
                  </button>
                </span>
              );
            })}
          </div>
          <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            Нажатие на название добавляет тип в разрешенные. Кнопка
            `запретить` добавляет тип в anti-fraud список.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function TariffConditionSelect({
  label,
  emptyLabel,
  items,
  value,
  onChange,
}: {
  label: string;
  emptyLabel: string;
  items: GuestGameTariffSnapshotEndpoint["typedItems"];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select
        className={fieldClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{emptyLabel}</option>
        {items.map((item) => (
          <option key={`${item.domain}-${tariffItemValue(item)}`} value={tariffItemValue(item)}>
            {tariffItemLabel(item)}
          </option>
        ))}
      </select>
    </Field>
  );
}

function LinkSelect<T extends { id: string; name: string }>({
  label,
  value,
  items,
  onChange,
}: {
  label: string;
  value: string;
  items: T[];
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select
        className={fieldClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Не связан</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

function JsonField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={`${label} JSON`}>
      <textarea
        className={`${fieldClass} min-h-32 font-mono text-xs leading-relaxed`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-base font-bold text-zinc-950 dark:text-white">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-200">
      <span>{label}</span>
      {children}
    </label>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <h2 className="text-lg font-bold text-zinc-950 dark:text-white">{title}</h2>
  );
}

function StatCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-zinc-950 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function StatusMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-2 text-3xl font-bold text-zinc-950 dark:text-white">
        {value}
      </p>
      <p className="mt-1 text-xs text-zinc-400">{hint}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md bg-zinc-100 p-2 dark:bg-zinc-900">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-bold text-zinc-950 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function StatusPill({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
      {label}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
      {text}
    </div>
  );
}

function profileToForm(profile: GuestGameProfile): ProfileForm {
  return {
    guestId: profile.guest?.id ?? "",
    leadId: profile.lead?.id ?? "",
    displayName: profile.displayName,
    contactMasked: profile.contactMasked ?? "",
    telegramIdentity: profile.telegramIdentity ?? "",
    maxIdentity: profile.maxIdentity ?? "",
    xp: String(profile.xp),
    level: String(profile.level),
    status: profile.status,
  };
}

function lootBoxToForm(lootBox: GuestGameLootBox): LootBoxForm {
  return {
    name: lootBox.name,
    status: lootBox.status,
    triggerKind: lootBox.triggerKind,
    rewardType: lootBox.rewardType,
    rewardAmount: moneyFormValue(lootBox.rewardAmount),
    rewardLabel: lootBox.rewardLabel ?? "",
    audienceId: lootBox.audience?.id ?? "",
    segment: lootBox.segment ?? "",
    sessionType: lootBox.sessionType ?? "",
    packetMode: stringRule(lootBox.periodRules, "packetMode", "ANY"),
    tariffGroupId: stringRule(lootBox.periodRules, "tariffGroupId", ""),
    tariffPeriodId: stringRule(lootBox.periodRules, "tariffPeriodId", ""),
    tariffTypeId: stringRule(lootBox.periodRules, "tariffTypeId", ""),
    guestLogTypes: stringListRule(lootBox.periodRules, "guestLogTypes"),
    blockedGuestLogTypes: stringListRule(
      lootBox.periodRules,
      "blockedGuestLogTypes",
    ),
    storeIds: lootBox.storeIds,
    quietHoursEnabled: booleanRule(lootBox.periodRules, "quietHoursEnabled", true),
    weekdaysOnly: booleanRule(lootBox.periodRules, "weekdaysOnly", true),
    hourFrom: timeWindowPart(lootBox.periodRules, 0, "10:00"),
    hourTo: timeWindowPart(lootBox.periodRules, 1, "16:00"),
    perGuestPerWeek: numberRule(lootBox.limits, "perGuestPerWeek", "1"),
    totalPerDay: numberRule(lootBox.limits, "totalPerDay", "30"),
    probabilityXpWeight: probabilityWeight(
      lootBox.probabilityRules,
      "XP Battle Pass",
      "50",
    ),
    probabilityPromoWeight: probabilityWeight(
      lootBox.probabilityRules,
      "Промокод бара",
      "30",
    ),
    probabilityMissionWeight: probabilityWeight(
      lootBox.probabilityRules,
      "Миссия на повторный визит",
      "20",
    ),
    requireCashierConfirmation: booleanRule(
      lootBox.antiFraudRules,
      "requiresCashierConfirmation",
      true,
    ),
    oneDevicePerGuest: booleanRule(
      lootBox.antiFraudRules,
      "oneDevicePerGuest",
      true,
    ),
    periodRulesText: jsonFormValue(lootBox.periodRules),
    limitsText: jsonFormValue(lootBox.limits),
    probabilityRulesText: jsonFormValue(
      lootBox.probabilityRules,
      defaultLootBoxForm.probabilityRulesText,
    ),
    budgetAmount: moneyFormValue(lootBox.budgetAmount),
    antiFraudText: jsonFormValue(lootBox.antiFraudRules),
    manualApprovalRequired: lootBox.manualApprovalRequired,
    note: lootBox.note ?? "",
  };
}

function missionToForm(mission: GuestGameMission): MissionForm {
  return {
    name: mission.name,
    status: mission.status,
    missionType: mission.missionType,
    triggerKind: mission.triggerKind,
    rewardType: mission.rewardType,
    rewardAmount: moneyFormValue(mission.rewardAmount),
    rewardLabel: mission.rewardLabel ?? "",
    xpReward: String(mission.xpReward),
    progressTarget: mission.progressTarget ? String(mission.progressTarget) : "",
    progressUnit: mission.progressUnit ?? "",
    audienceId: mission.audience?.id ?? "",
    storeIds: mission.storeIds,
    periodFrom: dateInputValue(mission.periodFrom),
    periodTo: dateInputValue(mission.periodTo),
    budgetAmount: moneyFormValue(mission.budgetAmount),
    perGuestLimit: mission.perGuestLimit ? String(mission.perGuestLimit) : "",
    totalRewardLimit: mission.totalRewardLimit
      ? String(mission.totalRewardLimit)
      : "",
    sessionType: stringRule(mission.conditions, "sessionType", ""),
    packetMode: stringRule(mission.conditions, "packetMode", "ANY"),
    tariffGroupId: stringRule(mission.conditions, "tariffGroupId", ""),
    tariffPeriodId: stringRule(mission.conditions, "tariffPeriodId", ""),
    tariffTypeId: stringRule(mission.conditions, "tariffTypeId", ""),
    guestLogTypes: stringListRule(mission.conditions, "guestLogTypes"),
    blockedGuestLogTypes: stringListRule(
      mission.antiFraudRules,
      "blockedGuestLogTypes",
    ),
    windowDays: numberRule(mission.conditions, "windowDays", "7"),
    weekdaysOnly: booleanRule(mission.conditions, "weekdaysOnly", true),
    minSessionMinutes: numberRule(mission.conditions, "minSessionMinutes", "90"),
    minSpendAmount: numberRule(mission.conditions, "minSpendAmount", "0"),
    questEnabled: missionQuestEnabled(mission.conditions),
    questStepOne: missionQuestStepTitle(
      mission.conditions,
      0,
      defaultMissionForm.questStepOne,
    ),
    questStepTwo: missionQuestStepTitle(
      mission.conditions,
      1,
      defaultMissionForm.questStepTwo,
    ),
    questStepThree: missionQuestStepTitle(
      mission.conditions,
      2,
      defaultMissionForm.questStepThree,
    ),
    requireLangameFact: booleanRule(
      mission.conditions,
      "requiresLangameFact",
      true,
    ),
    denySameDayRepeat: booleanRule(
      mission.antiFraudRules,
      "denySameDayRepeat",
      true,
    ),
    requireCashierConfirmation: booleanRule(
      mission.antiFraudRules,
      "requiresCashierConfirmation",
      true,
    ),
    conditionsText: jsonFormValue(
      mission.conditions,
      defaultMissionForm.conditionsText,
    ),
    antiFraudText: jsonFormValue(mission.antiFraudRules),
    manualApprovalRequired: mission.manualApprovalRequired,
    note: mission.note ?? "",
  };
}

function seasonToForm(season: GuestGameSeason): SeasonForm {
  return {
    name: season.name,
    status: season.status,
    seasonType: season.seasonType,
    audienceId: season.audience?.id ?? "",
    periodFrom: dateInputValue(season.periodFrom),
    periodTo: dateInputValue(season.periodTo),
    xpVisit: numberRule(season.xpRules, "visit", "20"),
    xpPlayHour: numberRule(season.xpRules, "playHour", "10"),
    xpBarPurchase: numberRule(season.xpRules, "barPurchase", "25"),
    xpMissionCompletion: numberRule(
      season.xpRules,
      "missionCompletion",
      "50",
    ),
    xpPacketSessionBonus: numberRule(
      season.xpRules,
      "packetSessionBonus",
      "15",
    ),
    xpGuestLog: numberRule(season.xpRules, "guestLog", "5"),
    sessionType: stringRule(season.xpRules, "sessionType", ""),
    packetMode: stringRule(season.xpRules, "packetMode", "ANY"),
    tariffGroupId: stringRule(season.xpRules, "tariffGroupId", ""),
    tariffPeriodId: stringRule(season.xpRules, "tariffPeriodId", ""),
    tariffTypeId: stringRule(season.xpRules, "tariffTypeId", ""),
    guestLogTypes: stringListRule(season.xpRules, "guestLogTypes"),
    blockedGuestLogTypes: stringListRule(
      season.xpRules,
      "blockedGuestLogTypes",
    ),
    levelCount: String(arrayRule(season.levels).length || 4),
    xpPerLevel: seasonLevelStep(season.levels, "250"),
    freeRewardEvery: rewardFrequency(season.freeRewards, "2"),
    premiumRewardEvery: rewardFrequency(season.premiumRewards, "2"),
    freeRewardLabel: rewardLabel(season.freeRewards, "Промокод бара"),
    premiumRewardLabel: rewardLabel(season.premiumRewards, "Усиленный промокод"),
    xpRulesText: jsonFormValue(season.xpRules, defaultSeasonForm.xpRulesText),
    levelsText: jsonFormValue(season.levels, defaultSeasonForm.levelsText),
    freeRewardsText: jsonFormValue(season.freeRewards),
    premiumRewardsText: jsonFormValue(season.premiumRewards),
    premiumEnabled: season.premiumEnabled,
    premiumUpgradeMode: season.premiumUpgradeMode ?? "",
    budgetAmount: moneyFormValue(season.budgetAmount),
    manualApprovalRequired: season.manualApprovalRequired,
    note: season.note ?? "",
  };
}

function rewardToForm(reward: GuestGameReward): RewardForm {
  return {
    profileId: reward.profile?.id ?? "",
    guestId: reward.guest?.id ?? "",
    lootBoxId: reward.lootBox?.id ?? "",
    missionId: reward.mission?.id ?? "",
    seasonId: reward.season?.id ?? "",
    storeId: reward.store?.id ?? "",
    status: reward.status,
    source: reward.source,
    rewardType: reward.rewardType,
    rewardAmount: String(reward.rewardAmount),
    rewardLabel: reward.rewardLabel,
    rewardCode: reward.rewardCode ?? "",
    expiresAt: dateInputValue(reward.expiresAt),
    note: reward.note ?? "",
    evidenceText: jsonFormValue(reward.evidence),
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "Ошибка запроса");
  }

  return response.json() as Promise<T>;
}

function postJson<T = unknown>(url: string, body: unknown) {
  return fetchJson<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patchJson<T = unknown>(url: string, body: unknown) {
  return fetchJson<T>(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteJson<T = unknown>(url: string) {
  return fetchJson<T>(url, {
    method: "DELETE",
  });
}

function nullable(value: string) {
  return value.trim() ? value.trim() : null;
}

function csvList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,;\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function appendCsvToken(current: string, token: string) {
  return appendCsvTokens(current, [token]);
}

function appendCsvTokens(current: string, tokens: string[]) {
  const values = csvList(current);
  const existing = new Set(values.map((value) => value.toLowerCase()));
  const nextValues = [...values];

  for (const token of tokens) {
    const normalizedToken = token.trim();

    if (!normalizedToken) {
      continue;
    }

    const key = normalizedToken.toLowerCase();

    if (existing.has(key)) {
      continue;
    }

    existing.add(key);
    nextValues.push(normalizedToken);
  }

  return nextValues.join(", ");
}

function buildLootBoxPeriodRules(form: LootBoxForm) {
  const start = form.hourFrom || "00:00";
  const end = form.hourTo || "23:59";

  return {
    source: "business_controls",
    quietHoursEnabled: form.quietHoursEnabled,
    weekdaysOnly: form.weekdaysOnly,
    weekdays: form.weekdaysOnly ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6],
    hours: form.quietHoursEnabled ? [`${start}-${end}`] : [],
    packetMode: form.packetMode,
    tariffGroupId: nullable(form.tariffGroupId),
    tariffPeriodId: nullable(form.tariffPeriodId),
    tariffTypeId: nullable(form.tariffTypeId),
    guestLogTypes: csvList(form.guestLogTypes),
    blockedGuestLogTypes: csvList(form.blockedGuestLogTypes),
  };
}

function buildLootBoxLimits(form: LootBoxForm) {
  return {
    source: "business_controls",
    perGuestPerWeek: optionalNumber(form.perGuestPerWeek),
    totalPerDay: optionalNumber(form.totalPerDay),
  };
}

function buildLootBoxProbabilityRules(form: LootBoxForm) {
  return {
    type: "weighted",
    source: "business_controls",
    items: [
      {
        label: "XP Battle Pass",
        weight: numeric(form.probabilityXpWeight, 0),
      },
      {
        label: form.rewardLabel || "Промокод бара",
        weight: numeric(form.probabilityPromoWeight, 0),
      },
      {
        label: "Миссия на повторный визит",
        weight: numeric(form.probabilityMissionWeight, 0),
      },
    ],
  };
}

function buildLootBoxAntiFraudRules(form: LootBoxForm) {
  return {
    source: "business_controls",
    requiresCashierConfirmation: form.requireCashierConfirmation,
    oneDevicePerGuest: form.oneDevicePerGuest,
  };
}

function buildMissionConditions(form: MissionForm) {
  const questSteps = buildMissionQuestSteps(form);

  return {
    source: "business_controls",
    windowDays: optionalNumber(form.windowDays),
    weekdaysOnly: form.weekdaysOnly,
    sessionType: nullable(form.sessionType),
    packetMode: form.packetMode,
    tariffGroupId: nullable(form.tariffGroupId),
    tariffPeriodId: nullable(form.tariffPeriodId),
    tariffTypeId: nullable(form.tariffTypeId),
    guestLogTypes: csvList(form.guestLogTypes),
    minSessionMinutes: optionalNumber(form.minSessionMinutes),
    minSpendAmount: optionalNumber(form.minSpendAmount),
    requiresLangameFact: form.requireLangameFact,
    progressTarget: optionalNumber(form.progressTarget),
    progressUnit: nullable(form.progressUnit),
    questEnabled: form.questEnabled && questSteps.length > 0,
    questMode: form.questEnabled && questSteps.length > 0 ? "CHAIN" : "SINGLE",
    questSteps,
  };
}

function buildMissionQuestSteps(form: MissionForm) {
  if (!form.questEnabled) {
    return [];
  }

  const unit = nullable(form.progressUnit) ?? "шаг";

  return [form.questStepOne, form.questStepTwo, form.questStepThree]
    .map((title, index) => ({
      id: `step-${index + 1}`,
      title: title.trim(),
      target: index + 1,
      unit,
    }))
    .filter((step) => step.title.length > 0);
}

function buildMissionAntiFraudRules(form: MissionForm) {
  return {
    source: "business_controls",
    denySameDayRepeat: form.denySameDayRepeat,
    requiresCashierConfirmation: form.requireCashierConfirmation,
    blockedGuestLogTypes: csvList(form.blockedGuestLogTypes),
    perGuestLimit: optionalNumber(form.perGuestLimit),
    totalRewardLimit: optionalNumber(form.totalRewardLimit),
  };
}

function buildSeasonXpRules(form: SeasonForm) {
  return {
    source: "business_controls",
    visit: numeric(form.xpVisit, 0),
    playHour: numeric(form.xpPlayHour, 0),
    barPurchase: numeric(form.xpBarPurchase, 0),
    missionCompletion: numeric(form.xpMissionCompletion, 0),
    packetSessionBonus: numeric(form.xpPacketSessionBonus, 0),
    guestLog: numeric(form.xpGuestLog, 0),
    sessionType: nullable(form.sessionType),
    packetMode: form.packetMode,
    tariffGroupId: nullable(form.tariffGroupId),
    tariffPeriodId: nullable(form.tariffPeriodId),
    tariffTypeId: nullable(form.tariffTypeId),
    guestLogTypes: csvList(form.guestLogTypes),
    blockedGuestLogTypes: csvList(form.blockedGuestLogTypes),
  };
}

function buildSeasonLevels(form: SeasonForm) {
  const levelCount = Math.max(1, numeric(form.levelCount, 1));
  const xpPerLevel = Math.max(1, numeric(form.xpPerLevel, 1));

  return Array.from({ length: levelCount }, (_, index) => {
    const level = index + 1;
    return {
      level,
      xp: index * xpPerLevel,
      freeReward: levelRewardLabel(level, form.freeRewardEvery, form.freeRewardLabel),
      premiumReward: levelRewardLabel(
        level,
        form.premiumRewardEvery,
        form.premiumRewardLabel,
      ),
    };
  });
}

function buildSeasonRewards(form: SeasonForm, track: "free" | "premium") {
  const levelCount = Math.max(1, numeric(form.levelCount, 1));
  const every = numeric(
    track === "free" ? form.freeRewardEvery : form.premiumRewardEvery,
    0,
  );
  const label =
    track === "free" ? form.freeRewardLabel : form.premiumRewardLabel;

  if (!every || !label.trim()) {
    return [];
  }

  return Array.from({ length: levelCount }, (_, index) => index + 1)
    .filter((level) => level % every === 0)
    .map((level) => ({ level, reward: label.trim(), track }));
}

function levelRewardLabel(level: number, everyValue: string, label: string) {
  const every = numeric(everyValue, 0);
  return every && label.trim() && level % every === 0 ? label.trim() : null;
}

function numeric(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function arrayRule(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberRule(value: unknown, key: string, fallback: string) {
  const raw = asRecord(value)[key];
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return String(raw);
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw;
  }
  return fallback;
}

function stringRule(value: unknown, key: string, fallback: string) {
  const raw = asRecord(value)[key];
  return typeof raw === "string" && raw.trim() ? raw : fallback;
}

function stringListRule(value: unknown, key: string, fallback = "") {
  const raw = asRecord(value)[key];
  if (Array.isArray(raw)) {
    return raw
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .join(", ");
  }

  return typeof raw === "string" && raw.trim() ? raw : fallback;
}

function tariffItemsByEndpoint(
  snapshots: GuestGameTariffSnapshotEndpoint[],
  endpointKey: string,
) {
  return (
    snapshots.find((snapshot) => snapshot.endpointKey === endpointKey)
      ?.typedItems ?? []
  );
}

function tariffItemValue(
  item: GuestGameTariffSnapshotEndpoint["typedItems"][number],
) {
  return item.externalId ?? item.id;
}

function tariffItemLabel(
  item: GuestGameTariffSnapshotEndpoint["typedItems"][number],
) {
  const label = item.label ?? item.name ?? item.externalId ?? item.id;
  return item.domain ? `${label} · ${item.domain}` : label;
}

function tariffRuleSummary(value: unknown) {
  const record = asRecord(value);
  const count = [
    record.tariffGroupId,
    record.tariffPeriodId,
    record.tariffTypeId,
  ].filter((item) => typeof item === "string" && item.trim()).length;

  return count ? `тарифы: ${count}` : "любой тариф";
}

function guestLogRuleSummary(conditions: unknown, antiFraud?: unknown) {
  const conditionRecord = asRecord(conditions);
  const antiFraudRecord = asRecord(antiFraud);
  const allowedCount = arrayRule(conditionRecord.guestLogTypes).filter(
    (item) => typeof item === "string" && item.trim(),
  ).length;
  const blockedCount = [
    ...arrayRule(conditionRecord.blockedGuestLogTypes),
    ...arrayRule(antiFraudRecord.blockedGuestLogTypes),
  ].filter((item) => typeof item === "string" && item.trim()).length;

  if (allowedCount && blockedCount) {
    return `logs: ${allowedCount} / anti-fraud ${blockedCount}`;
  }
  if (allowedCount) {
    return `logs: ${allowedCount}`;
  }
  if (blockedCount) {
    return `anti-fraud logs: ${blockedCount}`;
  }
  return "любой log";
}

function missionQuestSteps(value: unknown) {
  const steps = asRecord(value).questSteps;
  if (!Array.isArray(steps)) {
    return [];
  }

  return steps
    .map((item) => {
      const record = asRecord(item);
      const title = typeof record.title === "string" ? record.title.trim() : "";
      const id =
        typeof record.id === "string" && record.id.trim()
          ? record.id
          : title;

      return title ? { id, title } : null;
    })
    .filter((item): item is { id: string; title: string } => Boolean(item))
    .slice(0, 3);
}

function missionQuestEnabled(value: unknown) {
  return booleanRule(value, "questEnabled", missionQuestSteps(value).length > 0);
}

function missionQuestStepTitle(value: unknown, index: number, fallback: string) {
  return missionQuestSteps(value)[index]?.title ?? fallback;
}

function questRuleSummary(value: unknown) {
  const steps = missionQuestSteps(value);
  return steps.length ? `квест: ${steps.length} шага` : "один шаг";
}

function booleanRule(value: unknown, key: string, fallback: boolean) {
  const raw = asRecord(value)[key];
  return typeof raw === "boolean" ? raw : fallback;
}

function timeWindowPart(value: unknown, part: 0 | 1, fallback: string) {
  const hours = asRecord(value).hours;
  if (Array.isArray(hours) && typeof hours[0] === "string") {
    return hours[0].split("-")[part]?.trim() || fallback;
  }

  return fallback;
}

function probabilityWeight(
  value: unknown,
  label: string,
  fallback: string,
) {
  const items = asRecord(value).items;
  if (!Array.isArray(items)) {
    return fallback;
  }

  const matched = items.find((item) => {
    const record = asRecord(item);
    return String(record.label ?? "")
      .toLowerCase()
      .includes(label.toLowerCase());
  });
  const weight = asRecord(matched).weight;

  return typeof weight === "number" && Number.isFinite(weight)
    ? String(weight)
    : fallback;
}

function seasonLevelStep(value: unknown, fallback: string) {
  const levels = arrayRule(value)
    .map((item) => asRecord(item))
    .filter((item) => typeof item.xp === "number") as Array<{
    xp: number;
  }>;

  if (levels.length < 2) {
    return fallback;
  }

  const step = levels[1].xp - levels[0].xp;
  return step > 0 ? String(step) : fallback;
}

function rewardFrequency(value: unknown, fallback: string) {
  const first = arrayRule(value)
    .map((item) => asRecord(item))
    .find((item) => typeof item.level === "number");

  return typeof first?.level === "number" ? String(first.level) : fallback;
}

function rewardLabel(value: unknown, fallback: string) {
  const first = arrayRule(value)
    .map((item) => asRecord(item))
    .find((item) => typeof item.reward === "string");

  return typeof first?.reward === "string" && first.reward.trim()
    ? first.reward
    : fallback;
}

function parseJson(text: string, label: string, allowEmpty = true) {
  const trimmed = text.trim();

  if (!trimmed) {
    if (allowEmpty) {
      return null;
    }

    throw new Error(`Заполните JSON: ${label}`);
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error(`Проверьте JSON: ${label}`);
  }
}

function jsonText(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function jsonFormValue(value: unknown, fallback = "") {
  if (value == null) {
    return fallback;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return fallback;
  }
}

function moneyFormValue(value: number | null) {
  return value == null ? "" : String(value);
}

function dateInputValue(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);

  return local.toISOString().slice(0, 16);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 1,
  }).format(value)}%`;
}

function formatMinutes(value: number) {
  if (value < 60) {
    return `${value} мин`;
  }

  return `${new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 1,
  }).format(value / 60)} ч`;
}

function economyKindLabel(
  kind: GuestGamificationWorkspace["economy"]["scenarios"][number]["kind"],
) {
  switch (kind) {
    case "LOOT_BOX":
      return "Лутбокс";
    case "MISSION":
      return "Миссия";
    case "SEASON":
      return "Battle Pass";
    case "MANUAL":
    default:
      return "Ручное";
  }
}

function economyStatusLabel(
  status: GuestGamificationWorkspace["economy"]["scenarios"][number]["status"],
) {
  return statusLabels[status as GuestGameStatus] ?? status;
}

function economyUsageClass(value: number | null) {
  if (value === null) {
    return "bg-zinc-300 dark:bg-zinc-700";
  }

  if (value >= 90) {
    return "bg-red-500";
  }

  if (value >= 70) {
    return "bg-amber-400";
  }

  return "bg-emerald-500";
}

function sessionTypeLabel(value: string | null) {
  return (
    sessionTypeOptions.find((option) => option.value === (value ?? ""))?.label ??
    value ??
    "любой тип"
  );
}

function packetModeLabel(value: string | null) {
  return (
    packetModeOptions.find((option) => option.value === (value ?? "ANY"))
      ?.label ??
    value ??
    "любой формат"
  );
}

function packetStateLabel(value: boolean | null) {
  if (value === true) {
    return "пакет часов";
  }
  if (value === false) {
    return "обычная";
  }
  return "не указано";
}

function tariffSnapshotStatusLabel(status: GuestGameTariffSnapshotStatus) {
  switch (status) {
    case "READY":
      return "готов";
    case "PARTIAL":
      return "частично";
    case "STALE":
      return "устарел";
    case "FAILED":
      return "ошибка";
    case "UNPROFILED":
    default:
      return "нет snapshot";
  }
}

function tariffSnapshotStatusClass(status: GuestGameTariffSnapshotStatus) {
  switch (status) {
    case "READY":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
    case "PARTIAL":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200";
    case "STALE":
      return "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200";
    case "FAILED":
      return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200";
    case "UNPROFILED":
    default:
      return "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
  }
}

function formatDate(value: string | null) {
  if (!value) {
    return "без даты";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
