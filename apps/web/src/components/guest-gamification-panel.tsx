"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { GuestAudience, GuestCrmLead, GuestDashboardRow } from "@/lib/guests";
import type {
  GuestGameEvent,
  GuestGameLootBox,
  GuestGameMission,
  GuestGameProfile,
  GuestGameProfileStatus,
  GuestGameReward,
  GuestGameRewardStatus,
  GuestGameSeason,
  GuestGameStatus,
  GuestGamificationWorkspace,
} from "@/lib/guest-gamification";
import type { Store } from "@/lib/stores";

type Props = {
  initialWorkspace: GuestGamificationWorkspace;
  audiences: GuestAudience[];
  stores: Store[];
  guests: GuestDashboardRow[];
  leads: GuestCrmLead[];
};

type TabId =
  | "overview"
  | "profiles"
  | "lootBoxes"
  | "missions"
  | "seasons"
  | "rewards";

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
  storeIds: string[];
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

type EventForm = {
  profileId: string;
  eventType: string;
  source: string;
  xpDelta: string;
  note: string;
  payloadText: string;
};

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Обзор" },
  { id: "profiles", label: "Профили" },
  { id: "lootBoxes", label: "Лутбоксы" },
  { id: "missions", label: "Миссии" },
  { id: "seasons", label: "Battle Pass" },
  { id: "rewards", label: "Кошелек" },
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
  sessionType: "weekday_day",
  storeIds: [],
  periodRulesText: jsonText({
    weekdays: [1, 2, 3, 4, 5],
    hours: ["10:00-16:00"],
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
  conditionsText: jsonText({
    windowDays: 7,
    weekdaysOnly: true,
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
  xpRulesText: jsonText({
    visit: 20,
    playHour: 10,
    barPurchase: 25,
    missionCompletion: 50,
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

export function GuestGamificationPanel({
  initialWorkspace,
  audiences,
  stores,
  guests,
  leads,
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
  const [eventForm, setEventForm] = useState<EventForm>(defaultEventForm);
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

  async function reloadWorkspace() {
    const next = await fetchJson<GuestGamificationWorkspace>(
      "/api/guests/gamification/workspace",
    );
    setWorkspace(next);
  }

  async function saveProfile() {
    await saveAction("profile", async () => {
      await postJson("/api/guests/gamification/profiles", {
        guestId: nullable(profileForm.guestId),
        leadId: nullable(profileForm.leadId),
        displayName: nullable(profileForm.displayName),
        contactMasked: nullable(profileForm.contactMasked),
        telegramIdentity: nullable(profileForm.telegramIdentity),
        maxIdentity: nullable(profileForm.maxIdentity),
        xp: profileForm.xp,
        level: profileForm.level,
        status: profileForm.status,
      });
      setProfileForm(defaultProfileForm);
      await reloadWorkspace();
    });
  }

  async function updateProfileStatus(
    profile: GuestGameProfile,
    status: GuestGameProfileStatus,
  ) {
    await saveAction(`profile-${profile.id}`, async () => {
      await patchJson(`/api/guests/gamification/profiles/${profile.id}`, {
        status,
      });
      await reloadWorkspace();
    });
  }

  async function saveLootBox() {
    await saveAction("lootBox", async () => {
      await postJson("/api/guests/gamification/loot-boxes", {
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
        periodRules: parseJson(lootBoxForm.periodRulesText, "период лутбокса"),
        limits: parseJson(lootBoxForm.limitsText, "лимиты лутбокса"),
        probabilityRules: parseJson(
          lootBoxForm.probabilityRulesText,
          "вероятности лутбокса",
          false,
        ),
        budgetAmount: lootBoxForm.budgetAmount,
        antiFraudRules: parseJson(lootBoxForm.antiFraudText, "антифрод"),
        manualApprovalRequired: lootBoxForm.manualApprovalRequired,
        note: nullable(lootBoxForm.note),
      });
      await reloadWorkspace();
    });
  }

  async function saveMission() {
    await saveAction("mission", async () => {
      await postJson("/api/guests/gamification/missions", {
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
        conditions: parseJson(missionForm.conditionsText, "условия миссии", false),
        antiFraudRules: parseJson(missionForm.antiFraudText, "антифрод"),
        manualApprovalRequired: missionForm.manualApprovalRequired,
        note: nullable(missionForm.note),
      });
      await reloadWorkspace();
    });
  }

  async function saveSeason() {
    await saveAction("season", async () => {
      await postJson("/api/guests/gamification/seasons", {
        name: seasonForm.name,
        status: seasonForm.status,
        seasonType: seasonForm.seasonType,
        audienceId: nullable(seasonForm.audienceId),
        periodFrom: nullable(seasonForm.periodFrom),
        periodTo: nullable(seasonForm.periodTo),
        xpRules: parseJson(seasonForm.xpRulesText, "правила XP", false),
        levels: parseJson(seasonForm.levelsText, "уровни сезона", false),
        freeRewards: parseJson(seasonForm.freeRewardsText, "free rewards"),
        premiumRewards: parseJson(
          seasonForm.premiumRewardsText,
          "premium rewards",
        ),
        premiumEnabled: seasonForm.premiumEnabled,
        premiumUpgradeMode: nullable(seasonForm.premiumUpgradeMode),
        budgetAmount: seasonForm.budgetAmount,
        manualApprovalRequired: seasonForm.manualApprovalRequired,
        note: nullable(seasonForm.note),
      });
      await reloadWorkspace();
    });
  }

  async function saveReward() {
    await saveAction("reward", async () => {
      await postJson("/api/guests/gamification/rewards", {
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
      });
      setRewardForm(defaultRewardForm);
      await reloadWorkspace();
    });
  }

  async function saveEvent() {
    await saveAction("event", async () => {
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

  async function updateRewardStatus(
    reward: GuestGameReward,
    status: GuestGameRewardStatus,
  ) {
    await saveAction(`reward-${reward.id}`, async () => {
      await patchJson(`/api/guests/gamification/rewards/${reward.id}`, {
        status,
      });
      await reloadWorkspace();
    });
  }

  async function updateRuleStatus(
    type: "loot-boxes" | "missions" | "seasons",
    id: string,
    status: GuestGameStatus,
  ) {
    await saveAction(`${type}-${id}`, async () => {
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
              Профили, миссии, лутбоксы и кошелек наград
            </h1>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            Автоматическая запись наград в Langame выключена: выдача идет через
            ручное подтверждение, код или кассира.
          </div>
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
          onOpenTab={setActiveTab}
          saving={saving}
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
          onSaveProfile={saveProfile}
          onSaveEvent={saveEvent}
          onProfileStatus={updateProfileStatus}
          saving={saving}
        />
      ) : null}

      {activeTab === "lootBoxes" ? (
        <LootBoxesTab
          form={lootBoxForm}
          setForm={setLootBoxForm}
          lootBoxes={workspace.lootBoxes}
          audiences={audiences}
          stores={stores}
          onSave={saveLootBox}
          onStatus={updateRuleStatus}
          saving={saving}
        />
      ) : null}

      {activeTab === "missions" ? (
        <MissionsTab
          form={missionForm}
          setForm={setMissionForm}
          missions={workspace.missions}
          audiences={audiences}
          stores={stores}
          onSave={saveMission}
          onStatus={updateRuleStatus}
          saving={saving}
        />
      ) : null}

      {activeTab === "seasons" ? (
        <SeasonsTab
          form={seasonForm}
          setForm={setSeasonForm}
          seasons={workspace.seasons}
          audiences={audiences}
          onSave={saveSeason}
          onStatus={updateRuleStatus}
          saving={saving}
        />
      ) : null}

      {activeTab === "rewards" ? (
        <RewardsTab
          form={rewardForm}
          setForm={setRewardForm}
          rewards={workspace.rewards}
          profiles={workspace.profiles}
          guests={guests}
          stores={stores}
          lootBoxes={workspace.lootBoxes}
          missions={workspace.missions}
          seasons={workspace.seasons}
          onSave={saveReward}
          onStatus={updateRewardStatus}
          saving={saving}
        />
      ) : null}
    </div>
  );
}

function OverviewTab({
  workspace,
  pendingRewards,
  onRewardStatus,
  onOpenTab,
  saving,
}: {
  workspace: GuestGamificationWorkspace;
  pendingRewards: GuestGameReward[];
  onRewardStatus: (
    reward: GuestGameReward,
    status: GuestGameRewardStatus,
  ) => Promise<void>;
  onOpenTab: (tab: TabId) => void;
  saving: string | null;
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
                  saving={saving}
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
  onSaveProfile,
  onSaveEvent,
  onProfileStatus,
  saving,
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
  onSaveProfile: () => Promise<void>;
  onSaveEvent: () => Promise<void>;
  onProfileStatus: (
    profile: GuestGameProfile,
    status: GuestGameProfileStatus,
  ) => Promise<void>;
  saving: string | null;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
      <section className="space-y-4">
        <Panel title="Новый игровой профиль">
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
              Создать профиль
            </button>
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
                onStatus={onProfileStatus}
                saving={saving}
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
  onSave,
  onStatus,
  saving,
}: {
  form: LootBoxForm;
  setForm: (form: LootBoxForm) => void;
  lootBoxes: GuestGameLootBox[];
  audiences: GuestAudience[];
  stores: Store[];
  onSave: () => Promise<void>;
  onStatus: (
    type: "loot-boxes" | "missions" | "seasons",
    id: string,
    status: GuestGameStatus,
  ) => Promise<void>;
  saving: string | null;
}) {
  return (
    <RulesLayout
      formTitle="Настройка лутбокса"
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
          <Field label="Тип сессии">
            <input
              className={fieldClass}
              value={form.sessionType}
              onChange={(event) =>
                setForm({ ...form, sessionType: event.target.value })
              }
            />
          </Field>
          <StoreSelect
            stores={stores}
            value={form.storeIds}
            onChange={(storeIds) => setForm({ ...form, storeIds })}
          />
          <JsonField
            label="Период"
            value={form.periodRulesText}
            onChange={(periodRulesText) =>
              setForm({ ...form, periodRulesText })
            }
          />
          <JsonField
            label="Лимиты"
            value={form.limitsText}
            onChange={(limitsText) => setForm({ ...form, limitsText })}
          />
          <JsonField
            label="Вероятности"
            value={form.probabilityRulesText}
            onChange={(probabilityRulesText) =>
              setForm({ ...form, probabilityRulesText })
            }
          />
          <JsonField
            label="Антифрод"
            value={form.antiFraudText}
            onChange={(antiFraudText) => setForm({ ...form, antiFraudText })}
          />
          <button
            type="button"
            className={primaryButtonClass}
            disabled={saving === "lootBox"}
            onClick={onSave}
          >
            Сохранить лутбокс
          </button>
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
            formatMoney(item.budgetAmount ?? 0),
          ]}
          onStatus={(status) => onStatus("loot-boxes", item.id, status)}
          saving={saving === `loot-boxes-${item.id}`}
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
  onSave,
  onStatus,
  saving,
}: {
  form: MissionForm;
  setForm: (form: MissionForm) => void;
  missions: GuestGameMission[];
  audiences: GuestAudience[];
  stores: Store[];
  onSave: () => Promise<void>;
  onStatus: (
    type: "loot-boxes" | "missions" | "seasons",
    id: string,
    status: GuestGameStatus,
  ) => Promise<void>;
  saving: string | null;
}) {
  return (
    <RulesLayout
      formTitle="Конструктор миссии"
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
          <JsonField
            label="Условия"
            value={form.conditionsText}
            onChange={(conditionsText) => setForm({ ...form, conditionsText })}
          />
          <JsonField
            label="Антифрод"
            value={form.antiFraudText}
            onChange={(antiFraudText) => setForm({ ...form, antiFraudText })}
          />
          <button
            type="button"
            className={primaryButtonClass}
            disabled={saving === "mission"}
            onClick={onSave}
          >
            Сохранить миссию
          </button>
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
            `${item.progressTarget ?? 1} ${item.progressUnit ?? "шаг"}`,
            formatMoney(item.budgetAmount ?? 0),
          ]}
          onStatus={(status) => onStatus("missions", item.id, status)}
          saving={saving === `missions-${item.id}`}
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
  onSave,
  onStatus,
  saving,
}: {
  form: SeasonForm;
  setForm: (form: SeasonForm) => void;
  seasons: GuestGameSeason[];
  audiences: GuestAudience[];
  onSave: () => Promise<void>;
  onStatus: (
    type: "loot-boxes" | "missions" | "seasons",
    id: string,
    status: GuestGameStatus,
  ) => Promise<void>;
  saving: string | null;
}) {
  return (
    <RulesLayout
      formTitle="Сезон и Battle Pass"
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
          <JsonField
            label="Правила XP"
            value={form.xpRulesText}
            onChange={(xpRulesText) => setForm({ ...form, xpRulesText })}
          />
          <JsonField
            label="Уровни"
            value={form.levelsText}
            onChange={(levelsText) => setForm({ ...form, levelsText })}
          />
          <JsonField
            label="Free rewards"
            value={form.freeRewardsText}
            onChange={(freeRewardsText) =>
              setForm({ ...form, freeRewardsText })
            }
          />
          <JsonField
            label="Premium rewards"
            value={form.premiumRewardsText}
            onChange={(premiumRewardsText) =>
              setForm({ ...form, premiumRewardsText })
            }
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
            Сохранить сезон
          </button>
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
            formatDate(item.periodFrom),
            formatMoney(item.budgetAmount ?? 0),
          ]}
          onStatus={(status) => onStatus("seasons", item.id, status)}
          saving={saving === `seasons-${item.id}`}
        />
      )}
    />
  );
}

function RewardsTab({
  form,
  setForm,
  rewards,
  profiles,
  guests,
  stores,
  lootBoxes,
  missions,
  seasons,
  onSave,
  onStatus,
  saving,
}: {
  form: RewardForm;
  setForm: (form: RewardForm) => void;
  rewards: GuestGameReward[];
  profiles: GuestGameProfile[];
  guests: GuestDashboardRow[];
  stores: Store[];
  lootBoxes: GuestGameLootBox[];
  missions: GuestGameMission[];
  seasons: GuestGameSeason[];
  onSave: () => Promise<void>;
  onStatus: (
    reward: GuestGameReward,
    status: GuestGameRewardStatus,
  ) => Promise<void>;
  saving: string | null;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
      <Panel title="Ручная награда">
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
            Поставить в кошелек
          </button>
        </div>
      </Panel>

      <section className="space-y-3">
        <SectionTitle title="Кошелек наград" />
        <div className="space-y-2">
          {rewards.length ? (
            rewards.map((reward) => (
              <RewardRow
                key={reward.id}
                reward={reward}
                onStatus={onStatus}
                saving={saving}
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
  formTitle,
  form,
  listTitle,
  items,
  renderItem,
}: {
  formTitle: string;
  form: ReactNode;
  listTitle: string;
  items: T[];
  renderItem: (item: T) => ReactNode;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <Panel title={formTitle}>{form}</Panel>
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
  onStatus,
  saving,
}: {
  profile: GuestGameProfile;
  onStatus: (
    profile: GuestGameProfile,
    status: GuestGameProfileStatus,
  ) => Promise<void>;
  saving: string | null;
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
      <div className="mt-4 flex flex-wrap gap-2">
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
    </div>
  );
}

function RuleCard({
  title,
  status,
  subtitle,
  meta,
  onStatus,
  saving,
}: {
  title: string;
  status: GuestGameStatus;
  subtitle: string;
  meta: string[];
  onStatus: (status: GuestGameStatus) => Promise<void>;
  saving: boolean;
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
      <div className="mt-4 flex flex-wrap gap-2">
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
    </div>
  );
}

function RewardRow({
  reward,
  onStatus,
  saving,
}: {
  reward: GuestGameReward;
  onStatus: (
    reward: GuestGameReward,
    status: GuestGameRewardStatus,
  ) => Promise<void>;
  saving: string | null;
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
        </div>
        <div className="flex flex-wrap gap-2">
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
  value: number;
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

function postJson(url: string, body: unknown) {
  return fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patchJson(url: string, body: unknown) {
  return fetchJson(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function nullable(value: string) {
  return value.trim() ? value.trim() : null;
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

function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
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
