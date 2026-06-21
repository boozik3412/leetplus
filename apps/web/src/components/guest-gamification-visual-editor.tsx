"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  GuestGameStatus,
  GuestGameVisualDraft,
  GuestGameVisualEditorCheckIn,
  GuestGameVisualEditorLootBox,
  GuestGameVisualEditorMission,
  GuestGameVisualEditorPayload,
  GuestGameVisualEditorPromoCard,
  GuestGameVisualEditorRewardMode,
  GuestGameVisualEditorPreview,
  GuestGamificationWorkspace,
} from "@/lib/guest-gamification";
import type { Store } from "@/lib/stores";

type Props = {
  workspace: GuestGamificationWorkspace;
  stores: Store[];
  canManage: boolean;
  onPublished: () => Promise<void>;
};

type EditorSection =
  | "battlePass"
  | "lootBoxes"
  | "missions"
  | "promoCards"
  | "checkIn";

type LoadState = "idle" | "loading" | "ready" | "error";

const statusOptions: GuestGameStatus[] = [
  "DRAFT",
  "ACTIVE",
  "PAUSED",
  "FINISHED",
  "ARCHIVED",
];

const sectionLabels: Record<EditorSection, string> = {
  battlePass: "Battle Pass",
  lootBoxes: "Лутбоксы",
  missions: "Квесты",
  promoCards: "События и акции",
  checkIn: "Чекин",
};

const visualTriggerOptions = [
  { value: "SESSION_START", label: "Старт сессии" },
  { value: "APP_OPEN", label: "Открытие приложения" },
  { value: "CHECK_IN", label: "Чекин в клубе" },
  { value: "VISIT", label: "Визит в клуб" },
  { value: "PLAY_HOUR", label: "Час игры" },
  { value: "BAR_PURCHASE", label: "Покупка в баре" },
  { value: "PRODUCT_PURCHASE", label: "Товарная покупка" },
  { value: "BALANCE_TOPUP", label: "Пополнение баланса" },
  { value: "GUEST_LOG", label: "Событие Langame" },
  { value: "REFERRAL_ACCEPTED", label: "Реферал принят" },
  { value: "REPEAT_VISIT", label: "Повторный визит" },
  { value: "MISSION_COMPLETED", label: "Квест выполнен" },
];

const visualTriggerHelpText: Record<string, string> = {
  SESSION_START: "Правило проверится, когда у гостя начнется игровая сессия в клубе.",
  APP_OPEN:
    "Правило проверится, когда гость откроет сайт игрового модуля или Telegram Mini App. Подходит для возврата потерявшихся гостей.",
  CHECK_IN: "Правило проверится после чекина гостя в игровом модуле выбранного клуба.",
  VISIT:
    "Общий визит в клуб: подходит для сценариев, где сессия, чекин или лог Langame считаются посещением.",
  PLAY_HOUR:
    "Правило проверится по накопленному игровому времени, например за час игры или завершение сессии.",
  BAR_PURCHASE: "Правило проверится после покупки или списания в баре, если факт есть в сохраненных данных.",
  PRODUCT_PURCHASE: "Правило проверится после товарной покупки из сохраненных продаж или списаний.",
  BALANCE_TOPUP: "Правило проверится после пополнения баланса гостя в сохраненных фактах Langame.",
  GUEST_LOG:
    "Правило проверится по событию из guests/logs. Детальные типы событий можно ограничить в расширенных настройках.",
  REFERRAL_ACCEPTED: "Правило проверится, когда приглашенный гость успешно зарегистрируется по реферальной ссылке.",
  REPEAT_VISIT: "Правило проверит повторное посещение гостя в заданном окне времени.",
  MISSION_COMPLETED: "Правило проверится после выполнения другой миссии или квеста.",
};

export function GuestGamificationVisualEditor({
  workspace,
  stores,
  canManage,
  onPublished,
}: Props) {
  const selectableStores = useMemo(
    () =>
      stores
        .filter((store) => store.isActive)
        .sort((left, right) => {
          if (left.gamificationEnabled !== right.gamificationEnabled) {
            return left.gamificationEnabled ? -1 : 1;
          }

          return left.name.localeCompare(right.name, "ru");
        }),
    [stores],
  );
  const [storeId, setStoreId] = useState(selectableStores[0]?.id ?? "");
  const [draft, setDraft] = useState<GuestGameVisualDraft | null>(null);
  const [activeSection, setActiveSection] =
    useState<EditorSection>("battlePass");
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedStore = useMemo(
    () => selectableStores.find((store) => store.id === storeId) ?? null,
    [selectableStores, storeId],
  );
  const payload = draft?.payload ?? null;
  const publishBlocked =
    Boolean(payload?.checkIn.enabled) && !payload?.checkIn.rewardMode;

  useEffect(() => {
    if (!storeId) {
      return;
    }

    let isActive = true;

    async function loadDraft() {
      setLoadState("loading");
      setMessage(null);

      try {
        const nextDraft = await requestJson<GuestGameVisualDraft>(
          `/api/guests/gamification/visual-editor/draft?storeId=${encodeURIComponent(storeId)}`,
        );

        if (!isActive) {
          return;
        }

        setDraft(nextDraft);
        setDirty(false);
        setLoadState("ready");
      } catch (error) {
        if (!isActive) {
          return;
        }

        setMessage(errorMessage(error, "Не удалось загрузить черновик."));
        setLoadState("error");
      }
    }

    void loadDraft();

    return () => {
      isActive = false;
    };
  }, [storeId]);

  function updatePayload(
    updater: (payload: GuestGameVisualEditorPayload) => GuestGameVisualEditorPayload,
  ) {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        payload: updater(current.payload),
      };
    });
    setDirty(true);
    setMessage(null);
  }

  async function saveDraft() {
    if (!draft || !payload || !storeId) {
      return;
    }

    setSaving("draft");
    setMessage(null);

    try {
      const nextDraft = await requestJson<GuestGameVisualDraft>(
        "/api/guests/gamification/visual-editor/draft",
        {
          method: "PATCH",
          body: JSON.stringify({
            id: draft.id,
            storeId,
            payload,
          }),
        },
      );
      setDraft(nextDraft);
      setDirty(false);
      setMessage("Черновик сохранен.");
    } catch (error) {
      setMessage(errorMessage(error, "Не удалось сохранить черновик."));
    } finally {
      setSaving(null);
    }
  }

  async function publishDraft() {
    if (!draft || !payload || !storeId || publishBlocked) {
      return;
    }

    setSaving("publish");
    setMessage(null);

    try {
      const result = await requestJson<GuestGameVisualEditorPreview>(
        "/api/guests/gamification/visual-editor/draft/publish",
        {
          method: "POST",
          body: JSON.stringify({
            id: draft.id,
            storeId,
            payload,
          }),
        },
      );
      setDraft(result.draft);
      setDirty(false);
      setMessage("Изменения опубликованы для гостевой страницы клуба.");
      await onPublished();
    } catch (error) {
      setMessage(errorMessage(error, "Не удалось опубликовать черновик."));
    } finally {
      setSaving(null);
    }
  }

  if (!selectableStores.length) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-5 text-sm text-zinc-600 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
        Визуальный редактор станет доступен после добавления активного клуба.
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-cyan-600 dark:text-cyan-300">
            Визуальный редактор
          </p>
          <h2 className="mt-1 text-xl font-bold text-zinc-950 dark:text-white">
            Гостевая главная как рабочий макет
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
            Настраивайте Battle Pass, лутбоксы, квесты, события и чек-ин через
            черновик. Публикация применит правила к выбранному клубу.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(220px,320px)_auto_auto] sm:items-end">
          <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Клуб
            <select
              className="mt-2 min-h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
              value={storeId}
              onChange={(event) => setStoreId(event.target.value)}
            >
              {selectableStores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="min-h-10 rounded-lg border border-zinc-300 px-4 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            disabled={!draft || saving !== null || !dirty}
            onClick={saveDraft}
          >
            {saving === "draft" ? "Сохраняем..." : "Сохранить черновик"}
          </button>
          <button
            type="button"
            className="min-h-10 rounded-lg bg-zinc-950 px-4 text-sm font-bold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-cyan-300 dark:text-zinc-950 dark:hover:bg-cyan-200"
            disabled={
              !canManage ||
              !draft ||
              saving !== null ||
              publishBlocked ||
              loadState !== "ready"
            }
            onClick={publishDraft}
          >
            {saving === "publish" ? "Публикуем..." : "Опубликовать"}
          </button>
        </div>
      </div>

      {message || publishBlocked ? (
        <div
          className={[
            "rounded-lg border px-4 py-3 text-sm",
            publishBlocked
              ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100"
              : "border-cyan-200 bg-cyan-50 text-cyan-900 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-100",
          ].join(" ")}
        >
          {publishBlocked
            ? "Для включенного чек-ина нужно выбрать награду: XP или бонусы."
            : message}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-lg border border-zinc-200 bg-zinc-950 p-3 text-white shadow-sm dark:border-zinc-800">
          {loadState === "loading" || !payload ? (
            <div className="grid min-h-[520px] place-items-center rounded-lg border border-cyan-200/15 bg-black text-sm text-cyan-100/70">
              Загружаем черновик...
            </div>
          ) : (
            <VisualPreview
              payload={payload}
              store={selectedStore}
              workspace={workspace}
              activeSection={activeSection}
              onSelect={setActiveSection}
            />
          )}
        </div>

        <aside className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          {payload ? (
            <Inspector
              payload={payload}
              activeSection={activeSection}
              onSelect={setActiveSection}
              onChange={updatePayload}
              canManage={canManage}
            />
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Выберите клуб и дождитесь загрузки черновика.
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}

function VisualPreview({
  payload,
  store,
  workspace,
  activeSection,
  onSelect,
}: {
  payload: GuestGameVisualEditorPayload;
  store: Store | null;
  workspace: GuestGamificationWorkspace;
  activeSection: EditorSection;
  onSelect: (section: EditorSection) => void;
}) {
  const activePromos = payload.promoCards
    .filter((item) => item.status === "ACTIVE")
    .slice(0, 3);
  const levels = Array.from(
    { length: payload.battlePass.levelCount },
    (_, index) => {
      const level = index + 1;
      const reward = payload.battlePass.levelRewards.find(
        (item) => item.level === level,
      );

      return {
        level,
        reward:
          reward?.reward ||
          (level === payload.battlePass.levelCount
            ? (payload.battlePass.mainPrize ?? "")
            : ""),
      };
    },
  );

  return (
    <div className="min-h-[720px] rounded-lg bg-black p-5 text-[#edf7f8]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#c4e0e524] pb-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#83e4ec]">
            LeetPlus Play
          </p>
          <h3 className="mt-2 text-3xl font-black leading-none">
            {store?.name ?? "Клуб"}
          </h3>
          <p className="mt-2 text-sm text-[#a8b9ba]">
            {store?.city ? `${store.city} · ` : ""}
            {store?.address ?? "Адрес клуба"}
          </p>
        </div>
        <div className="rounded-lg border border-[#83e4ec42] px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-[#83e4ec]">
          Preview
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <button
            type="button"
            className={previewZoneClass(activeSection === "promoCards")}
            onClick={() => onSelect("promoCards")}
          >
            <div className="grid gap-3 md:grid-cols-3">
              {(activePromos.length ? activePromos : fallbackPromos()).map(
                (promo, index) => (
                  <article
                    key={`${promo.title}-${index}`}
                    className={[
                      "min-h-36 rounded-lg border p-4 text-left",
                      index === 0
                        ? "border-[#83e4ec80] bg-[#83e4ec1c]"
                        : "border-[#c4e0e524] bg-[#061014]",
                    ].join(" ")}
                  >
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#83e4ec]">
                      {promo.label || "Событие"}
                    </p>
                    <h4 className="mt-4 text-xl font-black leading-tight">
                      {promo.title}
                    </h4>
                    <p className="mt-2 line-clamp-3 text-sm text-[#a8b9ba]">
                      {promo.description || "Клубная акция для гостей."}
                    </p>
                    <span className="mt-4 inline-flex rounded-full border border-[#d0aa6c66] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#d0aa6c]">
                      {promo.tag || "активно"}
                    </span>
                  </article>
                ),
              )}
            </div>
          </button>

          <button
            type="button"
            className={previewZoneClass(activeSection === "lootBoxes")}
            onClick={() => onSelect("lootBoxes")}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#83e4ec]">
                  Лутбоксы
                </p>
                <h4 className="mt-1 text-2xl font-black">
                  {payload.lootBoxes.filter((item) => item.status === "ACTIVE").length || 0} активных
                </h4>
              </div>
              <span className="rounded-full border border-[#c4e0e524] px-3 py-1 text-xs text-[#a8b9ba]">
                {workspace.rewards.filter((reward) => reward.walletState === "READY").length} готовы
              </span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {(payload.lootBoxes.length ? payload.lootBoxes : fallbackLootBoxes()).slice(0, 3).map((lootBox) => (
                <div
                  key={lootBox.id ?? lootBox.title}
                  className="rounded-lg border border-[#c4e0e524] bg-[#02080b] p-4"
                >
                  <div className="mb-4 grid size-12 place-items-center rounded-lg border border-[#83e4ec42] text-[#83e4ec]">
                    +
                  </div>
                  <h5 className="font-black">{lootBox.title}</h5>
                  <p className="mt-2 text-sm text-[#a8b9ba]">
                    {lootBox.rewardLabel || lootBox.condition || "Награда за активность"}
                  </p>
                </div>
              ))}
            </div>
          </button>

          <button
            type="button"
            className={previewZoneClass(activeSection === "battlePass")}
            onClick={() => onSelect("battlePass")}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#83e4ec]">
                  Battle Pass
                </p>
                <h4 className="mt-1 text-2xl font-black">
                  {payload.battlePass.title || "Сезон клуба"}
                </h4>
              </div>
              <span className="rounded-full border border-[#d0aa6c66] px-3 py-1 text-xs font-black text-[#d0aa6c]">
                Главный приз: {payload.battlePass.mainPrize || "не задан"}
              </span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {levels.slice(0, 12).map((level) => (
                <div
                  key={level.level}
                  className="rounded-lg border border-[#c4e0e524] bg-[#061014] p-3"
                >
                  <span className="grid size-8 place-items-center rounded-full bg-[#83e4ec] text-sm font-black text-black">
                    {level.level}
                  </span>
                  <p className="mt-3 text-xs text-[#a8b9ba]">
                    {level.reward || `${payload.battlePass.xpPerLevel * level.level} XP`}
                  </p>
                </div>
              ))}
            </div>
          </button>

          <button
            type="button"
            className={previewZoneClass(activeSection === "missions")}
            onClick={() => onSelect("missions")}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-2xl font-black">Квесты</h4>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-[#83e4ec]">
                {payload.missions.length} шт.
              </span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {(payload.missions.length ? payload.missions : fallbackMissions()).slice(0, 4).map((mission) => (
                <div
                  key={mission.id ?? mission.title}
                  className="rounded-lg border border-[#c4e0e524] bg-[#02080b] p-4"
                >
                  <h5 className="font-black">{mission.title}</h5>
                  <p className="mt-2 text-sm text-[#a8b9ba]">
                    {mission.rewardLabel || `${mission.xpReward} XP`}
                  </p>
                </div>
              ))}
            </div>
          </button>
        </div>

        <button
          type="button"
          className={previewZoneClass(activeSection === "checkIn")}
          onClick={() => onSelect("checkIn")}
        >
          <div className="flex h-full flex-col rounded-lg border border-[#c4e0e524] bg-[#061014] p-4 text-left">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#83e4ec]">
              Профиль
            </p>
            <h4 className="mt-2 text-3xl font-black">Гость клуба</h4>
            <div className="mt-5 grid gap-3">
              <PreviewMetric label="Уровень" value="1" />
              <PreviewMetric label="XP" value={String(workspace.summary.totalXp)} />
              <PreviewMetric
                label="Чекин"
                value={payload.checkIn.enabled ? "включен" : "выключен"}
              />
            </div>
            <div className="mt-auto pt-5">
              <div
                className={[
                  "rounded-lg border px-4 py-3 text-center text-sm font-black",
                  payload.checkIn.enabled
                    ? "border-[#83e4ec80] bg-[#83e4ec] text-black"
                    : "border-[#c4e0e524] text-[#a8b9ba]",
                ].join(" ")}
              >
                Чекин в клубе
              </div>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}

function Inspector({
  payload,
  activeSection,
  onSelect,
  onChange,
  canManage,
}: {
  payload: GuestGameVisualEditorPayload;
  activeSection: EditorSection;
  onSelect: (section: EditorSection) => void;
  onChange: (
    updater: (payload: GuestGameVisualEditorPayload) => GuestGameVisualEditorPayload,
  ) => void;
  canManage: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(sectionLabels).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={[
              "rounded-lg border px-3 py-2 text-left text-xs font-bold transition",
              activeSection === id
                ? "border-cyan-400 bg-cyan-50 text-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-100"
                : "border-zinc-200 text-zinc-600 hover:border-cyan-300 dark:border-zinc-800 dark:text-zinc-300",
            ].join(" ")}
            onClick={() => onSelect(id as EditorSection)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
        {activeSection === "battlePass" ? (
          <BattlePassInspector
            payload={payload}
            onChange={onChange}
            disabled={!canManage}
          />
        ) : null}
        {activeSection === "lootBoxes" ? (
          <LootBoxInspector
            payload={payload}
            onChange={onChange}
            disabled={!canManage}
          />
        ) : null}
        {activeSection === "missions" ? (
          <MissionInspector
            payload={payload}
            onChange={onChange}
            disabled={!canManage}
          />
        ) : null}
        {activeSection === "promoCards" ? (
          <PromoInspector
            payload={payload}
            onChange={onChange}
            disabled={!canManage}
          />
        ) : null}
        {activeSection === "checkIn" ? (
          <CheckInInspector
            payload={payload}
            onChange={onChange}
            disabled={!canManage}
          />
        ) : null}
      </div>
    </div>
  );
}

function BattlePassInspector({
  payload,
  onChange,
  disabled,
}: InspectorProps) {
  const battlePass = payload.battlePass;

  return (
    <div className="space-y-3">
      <InspectorTitle title="Battle Pass" />
      <TextField
        label="Название сезона"
        value={battlePass.title}
        disabled={disabled}
        onChange={(title) =>
          onChange((current) => ({
            ...current,
            battlePass: { ...current.battlePass, title },
          }))
        }
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <NumberField
          label="Уровней"
          value={battlePass.levelCount}
          min={1}
          max={50}
          disabled={disabled}
          onChange={(levelCount) =>
            onChange((current) => ({
              ...current,
              battlePass: {
                ...current.battlePass,
                levelCount,
                levelRewards: current.battlePass.levelRewards.filter(
                  (item) => item.level <= levelCount,
                ),
              },
            }))
          }
        />
        <NumberField
          label="XP на уровень"
          value={battlePass.xpPerLevel}
          min={1}
          disabled={disabled}
          onChange={(xpPerLevel) =>
            onChange((current) => ({
              ...current,
              battlePass: { ...current.battlePass, xpPerLevel },
            }))
          }
        />
      </div>
      <TextField
        label="Главный приз"
        value={battlePass.mainPrize ?? ""}
        disabled={disabled}
        onChange={(mainPrize) =>
          onChange((current) => ({
            ...current,
            battlePass: { ...current.battlePass, mainPrize },
          }))
        }
      />
      <StatusField
        value={battlePass.status}
        disabled={disabled}
        onChange={(status) =>
          onChange((current) => ({
            ...current,
            battlePass: { ...current.battlePass, status },
          }))
        }
      />
      <RewardRows
        rewards={battlePass.levelRewards}
        levelCount={battlePass.levelCount}
        disabled={disabled}
        onChange={(levelRewards) =>
          onChange((current) => ({
            ...current,
            battlePass: { ...current.battlePass, levelRewards },
          }))
        }
      />
    </div>
  );
}

function LootBoxInspector({ payload, onChange, disabled }: InspectorProps) {
  return (
    <CollectionInspector
      title="Лутбоксы"
      items={payload.lootBoxes}
      emptyLabel="Добавить лутбокс"
      createItem={(): GuestGameVisualEditorLootBox => ({
        id: null,
        title: "Новый лутбокс",
        status: "DRAFT",
        triggerKind: "SESSION_START",
        rewardType: "BONUS",
        rewardAmount: 100,
        rewardLabel: "Бонус клуба",
        condition: "Активность в клубе",
        limitPerGuest: 1,
      })}
      renderItem={(item, index, update, remove) => (
        <div className="space-y-3">
          <TextField
            label="Название"
            value={item.title}
            disabled={disabled}
            onChange={(title) => update({ ...item, title })}
          />
          <TriggerField
            value={item.triggerKind}
            disabled={disabled}
            onChange={(triggerKind) => update({ ...item, triggerKind })}
          />
          <AudienceScopeHint />
          <TextField
            label="Приз"
            value={item.rewardLabel}
            disabled={disabled}
            onChange={(rewardLabel) => update({ ...item, rewardLabel })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField
              label="Сумма"
              value={item.rewardAmount ?? 0}
              min={0}
              disabled={disabled}
              onChange={(rewardAmount) => update({ ...item, rewardAmount })}
            />
            <LootBoxLimitField
              value={item.limitPerGuest}
              disabled={disabled}
              onChange={(limitPerGuest) =>
                update({ ...item, limitPerGuest })
              }
            />
          </div>
          <TextField
            label="Условие получения"
            value={item.condition}
            disabled={disabled}
            onChange={(condition) => update({ ...item, condition })}
          />
          <StatusField
            value={item.status}
            disabled={disabled}
            onChange={(status) => update({ ...item, status })}
          />
          <RemoveButton
            disabled={disabled}
            label="Удалить лутбокс"
            onClick={remove}
          />
        </div>
      )}
      onChange={(lootBoxes) =>
        onChange((current) => ({ ...current, lootBoxes }))
      }
      disabled={disabled}
    />
  );
}

function MissionInspector({ payload, onChange, disabled }: InspectorProps) {
  return (
    <CollectionInspector
      title="Квесты"
      items={payload.missions}
      emptyLabel="Добавить квест"
      createItem={(): GuestGameVisualEditorMission => ({
        id: null,
        title: "Новый квест",
        status: "DRAFT",
        missionType: "CUSTOM",
        triggerKind: "SESSION_START",
        xpReward: 100,
        rewardType: "PROMOCODE",
        rewardAmount: null,
        rewardLabel: "Промокод бара",
        progressTarget: 1,
        progressUnit: null,
        questSteps: [{ id: "step-1", title: "Выполнить шаг", target: 1 }],
      })}
      renderItem={(item, index, update, remove) => (
        <div className="space-y-3">
          <TextField
            label="Название"
            value={item.title}
            disabled={disabled}
            onChange={(title) => update({ ...item, title })}
          />
          <TriggerField
            value={item.triggerKind}
            disabled={disabled}
            onChange={(triggerKind) => update({ ...item, triggerKind })}
          />
          <AudienceScopeHint />
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField
              label="XP"
              value={item.xpReward}
              min={0}
              disabled={disabled}
              onChange={(xpReward) => update({ ...item, xpReward })}
            />
            <NumberField
              label="Цель"
              value={item.progressTarget ?? 1}
              min={1}
              disabled={disabled}
              onChange={(progressTarget) => update({ ...item, progressTarget })}
            />
          </div>
          <TextField
            label="Награда"
            value={item.rewardLabel}
            disabled={disabled}
            onChange={(rewardLabel) => update({ ...item, rewardLabel })}
          />
          <TextAreaField
            label="Шаги квеста"
            value={item.questSteps.map((step) => step.title).join("\n")}
            disabled={disabled}
            onChange={(value) =>
              update({
                ...item,
                questSteps: value
                  .split("\n")
                  .map((title) => title.trim())
                  .filter(Boolean)
                  .map((title, stepIndex) => ({
                    id: `step-${stepIndex + 1}`,
                    title,
                    target: stepIndex + 1,
                  })),
              })
            }
          />
          <StatusField
            value={item.status}
            disabled={disabled}
            onChange={(status) => update({ ...item, status })}
          />
          <RemoveButton
            disabled={disabled}
            label="Удалить квест"
            onClick={remove}
          />
        </div>
      )}
      onChange={(missions) =>
        onChange((current) => ({ ...current, missions }))
      }
      disabled={disabled}
    />
  );
}

function PromoInspector({ payload, onChange, disabled }: InspectorProps) {
  return (
    <CollectionInspector
      title="События и акции"
      items={payload.promoCards}
      emptyLabel="Добавить баннер"
      createItem={(): GuestGameVisualEditorPromoCard => ({
        id: null,
        label: "Акция",
        title: "Новое событие",
        description: "Короткое описание для гостевой главной.",
        tag: "активно",
        status: "DRAFT",
        targetAnchor: "missions",
        periodFrom: null,
        periodTo: null,
      })}
      renderItem={(item, index, update, remove) => (
        <div className="space-y-3">
          <TextField
            label="Лейбл"
            value={item.label ?? ""}
            disabled={disabled}
            onChange={(label) => update({ ...item, label })}
          />
          <TextField
            label="Заголовок"
            value={item.title}
            disabled={disabled}
            onChange={(title) => update({ ...item, title })}
          />
          <TextAreaField
            label="Описание"
            value={item.description ?? ""}
            disabled={disabled}
            onChange={(description) => update({ ...item, description })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Тег"
              value={item.tag ?? ""}
              disabled={disabled}
              onChange={(tag) => update({ ...item, tag })}
            />
            <TextField
              label="Anchor"
              value={item.targetAnchor ?? ""}
              disabled={disabled}
              onChange={(targetAnchor) => update({ ...item, targetAnchor })}
            />
          </div>
          <StatusField
            value={item.status}
            disabled={disabled}
            onChange={(status) => update({ ...item, status })}
          />
          <RemoveButton
            disabled={disabled}
            label="Удалить баннер"
            onClick={remove}
          />
        </div>
      )}
      onChange={(promoCards) =>
        onChange((current) => ({ ...current, promoCards }))
      }
      disabled={disabled}
    />
  );
}

function CheckInInspector({ payload, onChange, disabled }: InspectorProps) {
  const checkIn = payload.checkIn;

  function patch(next: Partial<GuestGameVisualEditorCheckIn>) {
    onChange((current) => ({
      ...current,
      checkIn: { ...current.checkIn, ...next },
    }));
  }

  return (
    <div className="space-y-3">
      <InspectorTitle title="Чекин в клубе" />
      <label className="flex min-h-11 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-700 dark:border-zinc-800 dark:text-zinc-200">
        <input
          type="checkbox"
          checked={checkIn.enabled}
          disabled={disabled}
          onChange={(event) => patch({ enabled: event.target.checked })}
        />
        Показывать кнопку чек-ина
      </label>
      <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Тип награды
        <select
          className={fieldClass}
          value={checkIn.rewardMode}
          disabled={disabled || !checkIn.enabled}
          onChange={(event) =>
            patch({
              rewardMode: event.target.value as GuestGameVisualEditorRewardMode,
            })
          }
        >
          <option value="">Выберите награду</option>
          <option value="XP">XP</option>
          <option value="BONUS">Бонусы</option>
        </select>
      </label>
      {checkIn.rewardMode === "XP" ? (
        <NumberField
          label="XP за чекин"
          value={checkIn.xp ?? 1}
          min={1}
          disabled={disabled || !checkIn.enabled}
          onChange={(xp) => patch({ xp })}
        />
      ) : null}
      {checkIn.rewardMode === "BONUS" ? (
        <NumberField
          label="Бонусы за чекин"
          value={checkIn.bonusAmount ?? 1}
          min={1}
          disabled={disabled || !checkIn.enabled}
          onChange={(bonusAmount) => patch({ bonusAmount })}
        />
      ) : null}
      <TextField
        label="Текст награды"
        value={checkIn.rewardLabel ?? ""}
        disabled={disabled || !checkIn.enabled}
        onChange={(rewardLabel) => patch({ rewardLabel })}
      />
      <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
        Publish заблокирован, если чек-ин включен без XP или бонусной награды.
      </p>
    </div>
  );
}

type InspectorProps = {
  payload: GuestGameVisualEditorPayload;
  onChange: (
    updater: (payload: GuestGameVisualEditorPayload) => GuestGameVisualEditorPayload,
  ) => void;
  disabled: boolean;
};

function CollectionInspector<T>({
  title,
  items,
  emptyLabel,
  createItem,
  renderItem,
  onChange,
  disabled,
}: {
  title: string;
  items: T[];
  emptyLabel: string;
  createItem: () => T;
  renderItem: (
    item: T,
    index: number,
    update: (item: T) => void,
    remove: () => void,
  ) => ReactNode;
  onChange: (items: T[]) => void;
  disabled: boolean;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = items[selectedIndex] ?? null;

  function updateAt(index: number, item: T) {
    onChange(items.map((current, currentIndex) => (currentIndex === index ? item : current)));
  }

  function removeAt(index: number) {
    const next = items.filter((_, currentIndex) => currentIndex !== index);
    onChange(next);
    setSelectedIndex(Math.max(0, Math.min(selectedIndex, next.length - 1)));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <InspectorTitle title={title} />
        <button
          type="button"
          className="rounded-lg border border-cyan-300 px-3 py-2 text-xs font-bold text-cyan-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-cyan-800 dark:text-cyan-200"
          disabled={disabled}
          onClick={() => {
            onChange([...items, createItem()]);
            setSelectedIndex(items.length);
          }}
        >
          {emptyLabel}
        </button>
      </div>
      {items.length ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {items.map((item, index) => (
            <button
              key={index}
              type="button"
              className={[
                "whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-bold",
                selectedIndex === index
                  ? "border-zinc-950 bg-zinc-950 text-white dark:border-cyan-300 dark:bg-cyan-300 dark:text-zinc-950"
                  : "border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-300",
              ].join(" ")}
              onClick={() => setSelectedIndex(index)}
            >
              #{index + 1}
            </button>
          ))}
        </div>
      ) : null}
      {selected ? (
        renderItem(
          selected,
          selectedIndex,
          (item) => updateAt(selectedIndex, item),
          () => removeAt(selectedIndex),
        )
      ) : (
        <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          Элементов пока нет. Добавьте первый через кнопку выше.
        </p>
      )}
    </div>
  );
}

function RewardRows({
  rewards,
  levelCount,
  disabled,
  onChange,
}: {
  rewards: Array<{ level: number; reward: string }>;
  levelCount: number;
  disabled: boolean;
  onChange: (rewards: Array<{ level: number; reward: string }>) => void;
}) {
  const shownLevels = Array.from(
    { length: Math.min(levelCount, 8) },
    (_, index) => index + 1,
  );

  function rewardFor(level: number) {
    return (
      rewards.find((reward) => reward.level === level) ?? {
        level,
        reward: "",
      }
    );
  }

  function patch(level: number, value: string) {
    const next = rewardFor(level);
    const merged = { ...next, reward: value };
    const without = rewards.filter((reward) => reward.level !== level);
    onChange([...without, merged].sort((left, right) => left.level - right.level));
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Награды уровней
      </p>
      {shownLevels.map((level) => (
        <TextField
          key={level}
          label={`Уровень ${level}`}
          value={rewardFor(level).reward}
          disabled={disabled}
          onChange={(value) => patch(level, value)}
        />
      ))}
      {levelCount > shownLevels.length ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          В v1 показываем первые 8 уровней. Остальные будут построены по XP.
        </p>
      ) : null}
    </div>
  );
}

function InspectorTitle({ title }: { title: string }) {
  return (
    <h3 className="text-base font-bold text-zinc-950 dark:text-white">
      {title}
    </h3>
  );
}

function TextField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
      {label}
      <input
        className={fieldClass}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
      {label}
      <textarea
        className={`${fieldClass} min-h-24`}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
      {label}
      <input
        className={fieldClass}
        type="number"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          onChange(Number.isFinite(parsed) ? parsed : min ?? 0);
        }}
      />
    </label>
  );
}

function LootBoxLimitField({
  value,
  disabled,
  onChange,
}: {
  value: number | null;
  disabled: boolean;
  onChange: (value: number | null) => void;
}) {
  const hasLimit = value != null;

  return (
    <div className="block text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
      Лутбоксов на гостя
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="flex min-h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium normal-case tracking-normal text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
          <input
            type="radio"
            checked={!hasLimit}
            disabled={disabled}
            onChange={() => onChange(null)}
          />
          <span>Сколько угодно</span>
        </label>
        <label className="flex min-h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium normal-case tracking-normal text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
          <input
            type="radio"
            checked={hasLimit}
            disabled={disabled}
            onChange={() => onChange(value ?? 1)}
          />
          <span>Задать количество</span>
        </label>
      </div>
      {hasLimit ? (
        <input
          className={fieldClass}
          type="number"
          min={1}
          value={value}
          disabled={disabled}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            onChange(Number.isFinite(parsed) ? Math.max(1, parsed) : 1);
          }}
        />
      ) : (
        <EditorHint>
          Лутбокс не будет ограничен количеством открытий на гостя.
        </EditorHint>
      )}
    </div>
  );
}

function StatusField({
  value,
  disabled,
  onChange,
}: {
  value: GuestGameStatus;
  disabled: boolean;
  onChange: (value: GuestGameStatus) => void;
}) {
  return (
    <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
      Статус
      <select
        className={fieldClass}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as GuestGameStatus)}
      >
        {statusOptions.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
    </label>
  );
}

function TriggerField({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const hasCurrentOption = visualTriggerOptions.some((option) => option.value === value);

  return (
    <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
      Событие для появления
      <select
        className={fieldClass}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {!hasCurrentOption && value ? <option value={value}>Сохраненное событие: {value}</option> : null}
        {visualTriggerOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <EditorHint>{visualTriggerHelpText[value] ?? "LeetPlus проверит правило, когда получит событие этого типа."}</EditorHint>
    </label>
  );
}

function AudienceScopeHint() {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
      <span className="block font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">Аудитория</span>
      В визуальном редакторе правило применяется к гостям выбранного клуба. Детальные сегменты настраиваются в
      расширенных настройках.
    </div>
  );
}

function EditorHint({ children }: { children: ReactNode }) {
  return <span className="mt-2 block text-xs normal-case leading-relaxed tracking-normal text-zinc-500">{children}</span>;
}

function RemoveButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/60 dark:text-red-200"
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#c4e0e524] bg-[#02080b] p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#a8b9ba]">
        {label}
      </p>
      <p className="mt-1 text-lg font-black">{value}</p>
    </div>
  );
}

function previewZoneClass(active: boolean) {
  return [
    "block w-full rounded-lg border p-4 text-left transition",
    active
      ? "border-[#83e4ec] bg-[#83e4ec14] shadow-[0_0_0_1px_rgba(131,228,236,0.32)]"
      : "border-[#c4e0e524] bg-[#02080b] hover:border-[#83e4ec80]",
  ].join(" ");
}

function fallbackPromos(): GuestGameVisualEditorPromoCard[] {
  return [
    {
      id: null,
      label: "Акция",
      title: "Ночной рейд",
      description: "Бонусные часы и XP за вечернюю активность.",
      tag: "до 30 июня",
      status: "ACTIVE",
      targetAnchor: "missions",
      periodFrom: null,
      periodTo: null,
    },
    {
      id: null,
      label: "Событие",
      title: "Клубный турнир",
      description: "Соберите стак и получите очки ранга.",
      tag: "регистрация",
      status: "ACTIVE",
      targetAnchor: "missions",
      periodFrom: null,
      periodTo: null,
    },
    {
      id: null,
      label: "Награды",
      title: "Призовой дроп",
      description: "Лимитированные предметы и бонусы для гостей клуба.",
      tag: "получить",
      status: "ACTIVE",
      targetAnchor: "rewards",
      periodFrom: null,
      periodTo: null,
    },
  ];
}

function fallbackLootBoxes(): GuestGameVisualEditorLootBox[] {
  return [
    {
      id: null,
      title: "Ежедневный контейнер",
      status: "ACTIVE",
      triggerKind: "SESSION_START",
      rewardType: "BONUS",
      rewardAmount: 100,
      rewardLabel: "Бонус за визит",
      condition: "Визит в клуб",
      limitPerGuest: 1,
    },
  ];
}

function fallbackMissions(): GuestGameVisualEditorMission[] {
  return [
    {
      id: null,
      title: "Сыграть 2 часа",
      status: "ACTIVE",
      missionType: "CUSTOM",
      triggerKind: "SESSION_START",
      xpReward: 120,
      rewardType: "PROMOCODE",
      rewardAmount: null,
      rewardLabel: "XP",
      progressTarget: 1,
      progressUnit: null,
      questSteps: [{ id: "step-1", title: "Сыграть 2 часа", target: 1 }],
    },
  ];
}

async function requestJson<T>(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(await readResponseMessage(response));
  }

  return (await response.json()) as T;
}

async function readResponseMessage(response: Response) {
  try {
    const data = (await response.json()) as { message?: unknown };
    return typeof data.message === "string" && data.message.trim()
      ? data.message
      : "Запрос не выполнен.";
  } catch {
    return "Запрос не выполнен.";
  }
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

const fieldClass =
  "mt-2 min-h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-cyan-400 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white dark:disabled:bg-zinc-950";
