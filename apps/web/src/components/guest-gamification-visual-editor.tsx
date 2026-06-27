"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  GuestGameLootBox,
  GuestGameMission,
  GuestGamePromoCard,
  GuestGameSeason,
  GuestGameStatus,
  GuestGameVisualDraft,
  GuestGameVisualEditorCheckIn,
  GuestGameVisualEditorLootBox,
  GuestGameVisualEditorLootBoxPrize,
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
  onRestartLootBox?: (lootBoxId: string) => Promise<void>;
  restartingLootBoxId?: string | null;
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

const visualMissionTypeOptions = [
  { value: "REPEAT_VISIT", label: "Повторный визит" },
  { value: "CHECK_IN", label: "Чекин в клубе" },
  { value: "VISIT", label: "Посещение клуба" },
  { value: "PLAY_HOUR", label: "Игровое время" },
  { value: "BAR_PURCHASE", label: "Покупка в баре" },
  { value: "PRODUCT_PURCHASE", label: "Покупка товара" },
  { value: "BALANCE_TOPUP", label: "Пополнение баланса" },
  { value: "REFERRAL_ACCEPTED", label: "Приглашение друга" },
  { value: "APP_OPEN", label: "Возврат в приложение" },
  { value: "GUEST_LOG", label: "Событие Langame" },
  { value: "CUSTOM", label: "Своя миссия" },
];

const visualMissionTypeHelpText: Record<string, string> = {
  REPEAT_VISIT: "Квест засчитывает повторное посещение в заданном окне.",
  CHECK_IN: "Квест засчитывает чекин гостя в выбранном клубе.",
  VISIT: "Квест засчитывает посещение клуба.",
  PLAY_HOUR: "Квест считает накопленное игровое время.",
  BAR_PURCHASE: "Квест считает покупки бара.",
  PRODUCT_PURCHASE: "Квест считает покупку выбранных товаров.",
  BALANCE_TOPUP: "Квест считает пополнение баланса.",
  REFERRAL_ACCEPTED: "Квест засчитывает приглашенного друга.",
  APP_OPEN: "Квест срабатывает при открытии сайта или Mini App.",
  GUEST_LOG: "Квест работает от событий Langame.",
  CUSTOM: "Свободный сценарий с условиями из расширенных настроек.",
};

const visualProgressUnitOptions = [
  { value: "visit", label: "визиты" },
  { value: "check_in", label: "чекины" },
  { value: "minute", label: "минуты игры" },
  { value: "purchase", label: "покупки" },
  { value: "rub", label: "рубли" },
  { value: "day", label: "уникальные дни" },
  { value: "friend", label: "друзья" },
  { value: "event", label: "события" },
  { value: "step", label: "шаги" },
];

const visualProgressUnitHelpText: Record<string, string> = {
  visit: "Гость видит прогресс как количество визитов.",
  check_in: "Гость видит прогресс как количество чекинов.",
  minute: "Гость видит прогресс как накопленное игровое время.",
  purchase: "Гость видит прогресс как количество покупок.",
  rub: "Гость видит прогресс как сумму покупок или пополнений в рублях.",
  day: "Гость видит прогресс как количество уникальных дней активности.",
  friend: "Гость видит прогресс как количество приглашенных друзей.",
  event: "Гость видит прогресс как количество подходящих событий.",
  step: "Гость видит прогресс как шаги квестовой цепочки.",
};

const visualPromoTargetOptions = [
  { value: "home", label: "Главная игрового модуля" },
  { value: "missions", label: "Квесты" },
  { value: "lootBoxes", label: "Лутбоксы" },
  { value: "battlePass", label: "Battle Pass" },
  { value: "rewards", label: "Награды" },
  { value: "profile", label: "Профиль гостя" },
  { value: "checkIn", label: "Чекин в клубе" },
];

const visualPromoTargetHelpText: Record<string, string> = {
  home: "Баннер ведет на главную страницу игрового модуля.",
  missions: "Баннер ведет к списку квестов.",
  lootBoxes: "Баннер ведет к лутбоксам и доступным открытиям.",
  battlePass: "Баннер ведет к сезонному Battle Pass.",
  rewards: "Баннер ведет к наградам и промокодам.",
  profile: "Баннер ведет к профилю гостя.",
  checkIn: "Баннер ведет к действию чекина в выбранном клубе.",
};

const visualTimeWindowOptions = [
  { value: "ANY", label: "Любое время" },
  { value: "QUIET_HOURS", label: "Тихие часы" },
  { value: "CUSTOM", label: "Свое окно" },
];

const visualWeekdayOptions = [
  { value: "ANY", label: "Любой день" },
  { value: "WEEKDAYS", label: "Будни" },
  { value: "WEEKENDS", label: "Выходные" },
  { value: "CUSTOM", label: "Выбрать дни" },
];

const visualWeekdayItems = [
  { value: 1, label: "Пн" },
  { value: 2, label: "Вт" },
  { value: 3, label: "Ср" },
  { value: 4, label: "Чт" },
  { value: 5, label: "Пт" },
  { value: 6, label: "Сб" },
  { value: 0, label: "Вс" },
];

const visualWeekdayPresets: Record<string, number[]> = {
  ANY: [0, 1, 2, 3, 4, 5, 6],
  WEEKDAYS: [1, 2, 3, 4, 5],
  WEEKENDS: [0, 6],
  CUSTOM: [1, 2, 3, 4, 5],
};

export function GuestGamificationVisualEditor({
  workspace,
  stores,
  canManage,
  onPublished,
  onRestartLootBox,
  restartingLootBoxId = null,
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
      await onPublished();
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
            ? "Для включенного чек-ина нужно выбрать награду: XP или бонусы Langame."
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
              workspace={workspace}
              storeId={storeId}
              canManage={canManage}
              onRestartLootBox={onRestartLootBox}
              restartingLootBoxId={restartingLootBoxId}
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
                  <LootBoxPrizePreview prizes={lootBox.prizes} />
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
  workspace,
  storeId,
  canManage,
  onRestartLootBox,
  restartingLootBoxId,
}: {
  payload: GuestGameVisualEditorPayload;
  activeSection: EditorSection;
  onSelect: (section: EditorSection) => void;
  onChange: (
    updater: (payload: GuestGameVisualEditorPayload) => GuestGameVisualEditorPayload,
  ) => void;
  workspace: GuestGamificationWorkspace;
  storeId: string;
  canManage: boolean;
  onRestartLootBox?: (lootBoxId: string) => Promise<void>;
  restartingLootBoxId?: string | null;
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
            workspace={workspace}
            storeId={storeId}
            disabled={!canManage}
          />
        ) : null}
        {activeSection === "lootBoxes" ? (
          <LootBoxInspector
            payload={payload}
            onChange={onChange}
            workspace={workspace}
            storeId={storeId}
            disabled={!canManage}
            onRestartLootBox={onRestartLootBox}
            restartingLootBoxId={restartingLootBoxId}
          />
        ) : null}
        {activeSection === "missions" ? (
          <MissionInspector
            payload={payload}
            onChange={onChange}
            workspace={workspace}
            storeId={storeId}
            disabled={!canManage}
          />
        ) : null}
        {activeSection === "promoCards" ? (
          <PromoInspector
            payload={payload}
            onChange={onChange}
            workspace={workspace}
            storeId={storeId}
            disabled={!canManage}
          />
        ) : null}
        {activeSection === "checkIn" ? (
          <CheckInInspector
            payload={payload}
            onChange={onChange}
            workspace={workspace}
            storeId={storeId}
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
  workspace,
  storeId,
  disabled,
}: InspectorProps) {
  const battlePass = payload.battlePass;
  const seasonTemplates = templatesForStore(workspace.seasons, storeId);

  return (
    <div className="space-y-3">
      <InspectorTitle title="Battle Pass" />
      <TemplatePicker
        title="Шаблон Battle Pass"
        description="Выберите сезон из расширенных настроек, чтобы применить уровни, XP и награды."
        items={seasonTemplates}
        emptyLabel="Готовых сезонов для выбранного клуба пока нет."
        getLabel={(season) => `${season.name} · ${statusLabel(season.status)}`}
        disabled={disabled}
        actionLabel="Применить сезон"
        onApply={(season) =>
          onChange((current) => ({
            ...current,
            battlePass: visualBattlePassFromSeasonTemplate(season),
          }))
        }
      />
      <TemplatePicker
        title="Шаги Battle Pass"
        description="Можно подтянуть только награды уровней, не меняя название и статус текущего сезона."
        items={seasonTemplates}
        emptyLabel="Нет сезонов с готовыми шагами."
        getLabel={(season) => `${season.name} · уровни`}
        disabled={disabled}
        actionLabel="Подтянуть шаги"
        onApply={(season) => {
          const template = visualBattlePassFromSeasonTemplate(season);

          onChange((current) => ({
            ...current,
            battlePass: {
              ...current.battlePass,
              levelCount: template.levelCount,
              xpPerLevel: template.xpPerLevel,
              mainPrize: template.mainPrize,
              levelRewards: template.levelRewards,
            },
          }));
        }}
      />
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

function LootBoxInspector({
  payload,
  onChange,
  workspace,
  storeId,
  disabled,
  onRestartLootBox,
  restartingLootBoxId,
}: InspectorProps) {
  const lootBoxTemplates = templatesForStore(workspace.lootBoxes, storeId);

  return (
    <CollectionInspector
      title="Лутбоксы"
      items={payload.lootBoxes}
      emptyLabel="Добавить лутбокс"
      templateSlot={
        <TemplatePicker
          title="Шаблон лутбокса"
          description="Добавьте копию правила, созданного в расширенных настройках."
          items={lootBoxTemplates}
          emptyLabel="Готовых лутбоксов для выбранного клуба пока нет."
          getLabel={(lootBox) => `${lootBox.name} · ${statusLabel(lootBox.status)}`}
          renderDetails={(lootBox) => (
            <LootBoxPrizeDistribution
              prizes={visualLootBoxPrizesFromRules({
                rewardType: lootBox.rewardType,
                rewardAmount: lootBox.rewardAmount,
                rewardLabel: lootBox.rewardLabel ?? lootBox.name,
                prizes: templateRecord(lootBox.probabilityRules).prizes,
                items: templateRecord(lootBox.probabilityRules).items,
              })}
              compact
            />
          )}
          disabled={disabled}
          actionLabel="Добавить шаблон"
          onApply={(lootBox) =>
            onChange((current) => ({
              ...current,
              lootBoxes: [
                ...current.lootBoxes,
                visualLootBoxFromTemplate(lootBox),
              ],
            }))
          }
        />
      }
      createItem={createVisualLootBox}
      renderItem={(item, _index, update, remove) => {
        const isRestarting = Boolean(
          item.id && restartingLootBoxId === item.id,
        );

        return (
          <div className="space-y-4">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Основное
              </p>
              <div className="grid gap-3">
                <TextField
                  label="Название"
                  value={item.title}
                  disabled={disabled}
                  onChange={(title) => update({ ...item, title })}
                />
                <StatusField
                  value={item.status}
                  disabled={disabled}
                  onChange={(status) => update({ ...item, status })}
                />
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Условие появления
              </p>
              <TriggerField
                value={item.triggerKind}
                disabled={disabled}
                onChange={(triggerKind) =>
                  update({
                    ...item,
                    triggerKind,
                    condition: visualTriggerLabel(triggerKind),
                  })
                }
              />
              <div className="mt-3">
                <LootBoxScheduleField
                  item={item}
                  disabled={disabled}
                  onChange={(patch) => update({ ...item, ...patch })}
                />
              </div>
            </div>

            <AudienceScopeHint />

            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Приз и лимит
              </p>
              <TextField
                label="Приз"
                value={item.rewardLabel}
                disabled={disabled}
                onChange={(rewardLabel) =>
                  update({
                    ...item,
                    rewardLabel,
                    prizes: syncSingleVisualLootBoxPrize(item.prizes, {
                      rewardLabel,
                    }),
                  })
                }
              />
              <div className="mt-3 grid gap-3">
                <NumberField
                  label="Сумма"
                  value={item.rewardAmount ?? 0}
                  min={0}
                  disabled={disabled}
                  onChange={(rewardAmount) =>
                    update({
                      ...item,
                      rewardAmount,
                      prizes: syncSingleVisualLootBoxPrize(item.prizes, {
                        rewardAmount,
                      }),
                    })
                  }
                />
                <LootBoxLimitField
                  value={item.limitPerGuest}
                  disabled={disabled}
                  onChange={(limitPerGuest) =>
                    update({ ...item, limitPerGuest })
                  }
                />
              </div>
              <div className="mt-3">
                <LootBoxPrizeDistribution prizes={item.prizes} />
              </div>
              <p className="mt-3 text-xs font-medium leading-relaxed text-zinc-500 dark:text-zinc-400">
                Настроить награды и другие фишки можно в расширенном редакторе.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {item.id && onRestartLootBox ? (
                <button
                  type="button"
                  className="rounded-lg border border-amber-300 px-3 py-2 text-sm font-bold text-amber-700 transition hover:border-amber-400 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-950/30"
                  disabled={disabled || isRestarting}
                  onClick={() => {
                    if (item.id) {
                      void onRestartLootBox(item.id);
                    }
                  }}
                >
                  {isRestarting ? "Перезапуск..." : "Перезапустить"}
                </button>
              ) : null}
              <RemoveButton
                disabled={disabled}
                label="Удалить лутбокс"
                onClick={remove}
              />
            </div>
          </div>
        );
      }}
      onChange={(lootBoxes) =>
        onChange((current) => ({ ...current, lootBoxes }))
      }
      disabled={disabled}
    />
  );
}

function MissionInspector({
  payload,
  onChange,
  workspace,
  storeId,
  disabled,
}: InspectorProps) {
  const missionTemplates = templatesForStore(workspace.missions, storeId);

  return (
    <CollectionInspector
      title="Квесты"
      items={payload.missions}
      emptyLabel="Добавить квест"
      templateSlot={
        <TemplatePicker
          title="Шаблон квеста"
          description="Добавьте квест из расширенных настроек вместе с XP, наградой и шагами."
          items={missionTemplates}
          emptyLabel="Готовых квестов для выбранного клуба пока нет."
          getLabel={(mission) => `${mission.name} · ${statusLabel(mission.status)}`}
          disabled={disabled}
          actionLabel="Добавить шаблон"
          onApply={(mission) =>
            onChange((current) => ({
              ...current,
              missions: [
                ...current.missions,
                visualMissionFromTemplate(mission),
              ],
            }))
          }
        />
      }
      createItem={createVisualMission}
      renderItem={(item, index, update, remove) => (
        <div className="space-y-3">
          <TextField
            label="Название"
            value={item.title}
            disabled={disabled}
            onChange={(title) => update({ ...item, title })}
          />
          <MissionTypeField
            value={item.missionType}
            disabled={disabled}
            onChange={(missionType) => update({ ...item, missionType })}
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
          <MissionProgressUnitField
            value={item.progressUnit ?? "step"}
            disabled={disabled}
            onChange={(progressUnit) => update({ ...item, progressUnit })}
          />
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

function PromoInspector({
  payload,
  onChange,
  workspace,
  storeId,
  disabled,
}: InspectorProps) {
  const promoTemplates = templatesForStore(workspace.promoCards, storeId);

  return (
    <CollectionInspector
      title="События и акции"
      items={payload.promoCards}
      emptyLabel="Добавить баннер"
      templateSlot={
        <TemplatePicker
          title="Шаблон акции"
          description="Добавьте баннер события или акции, созданный в расширенных настройках."
          items={promoTemplates}
          emptyLabel="Готовых акций для выбранного клуба пока нет."
          getLabel={(promo) => `${promo.title} · ${statusLabel(promo.status)}`}
          disabled={disabled}
          actionLabel="Добавить шаблон"
          onApply={(promo) =>
            onChange((current) => ({
              ...current,
              promoCards: [
                ...current.promoCards,
                visualPromoFromTemplate(promo),
              ],
            }))
          }
        />
      }
      createItem={createVisualPromo}
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
            <PromoTargetField
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

function CheckInInspector({
  payload,
  onChange,
  workspace,
  storeId,
  disabled,
}: InspectorProps) {
  const checkIn = payload.checkIn;
  const checkInTemplates = templatesForStore(workspace.missions, storeId).filter(
    (mission) =>
      mission.triggerKind === "CHECK_IN" || mission.missionType === "CHECK_IN",
  );

  function patch(next: Partial<GuestGameVisualEditorCheckIn>) {
    onChange((current) => ({
      ...current,
      checkIn: { ...current.checkIn, ...next },
    }));
  }

  return (
    <div className="space-y-3">
      <InspectorTitle title="Чекин в клубе" />
      <TemplatePicker
        title="Шаблон чек-ина"
        description="Примените CHECK_IN-правило из расширенных настроек."
        items={checkInTemplates}
        emptyLabel="Готовых CHECK_IN-правил для выбранного клуба пока нет."
        getLabel={(mission) => `${mission.name} · ${statusLabel(mission.status)}`}
        disabled={disabled}
        actionLabel="Применить"
        onApply={(mission) => patch(visualCheckInFromMissionTemplate(mission))}
      />
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
          <option value="BONUS">Бонусы Langame</option>
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
          label="Бонусы Langame за чекин"
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
  workspace: GuestGamificationWorkspace;
  storeId: string;
  disabled: boolean;
  onRestartLootBox?: (lootBoxId: string) => Promise<void>;
  restartingLootBoxId?: string | null;
};

function CollectionInspector<T>({
  title,
  items,
  emptyLabel,
  templateSlot,
  createItem,
  renderItem,
  onChange,
  disabled,
}: {
  title: string;
  items: T[];
  emptyLabel: string;
  templateSlot?: ReactNode;
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
      {templateSlot}
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

function LootBoxPrizePreview({
  prizes,
}: {
  prizes: GuestGameVisualEditorLootBoxPrize[];
}) {
  const summary = lootBoxPrizeSummary(prizes);
  const shownPrizes = summary.sortedPrizes.slice(0, 2);

  return (
    <div className="mt-3 rounded-lg border border-[#c4e0e51c] bg-[#071215] p-2">
      <div className="flex items-center justify-between gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-[#83e4ec]">
        <span>{summary.countLabel}</span>
        <span>{summary.statusLabel}</span>
      </div>
      <div className="mt-2 space-y-1">
        {shownPrizes.map((prize) => (
          <div
            key={prize.id}
            className="flex items-center justify-between gap-2 text-xs text-[#d8f8f9]"
          >
            <span className="truncate">{prize.rewardLabel}</span>
            <span className="shrink-0 text-[#83e4ec]">
              {formatVisualChance(prize.chancePercent)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LootBoxPrizeDistribution({
  prizes,
  compact = false,
}: {
  prizes: GuestGameVisualEditorLootBoxPrize[];
  compact?: boolean;
}) {
  const summary = lootBoxPrizeSummary(prizes);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Распределение наград
          </p>
          <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {summary.countLabel}
            {summary.topPrize
              ? ` · чаще всего: ${summary.topPrize.rewardLabel}`
              : ""}
          </p>
        </div>
        <span
          className={[
            "rounded-full px-2 py-1 text-[11px] font-bold uppercase",
            summary.isBalanced
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
              : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
          ].join(" ")}
        >
          {summary.statusLabel}
        </span>
      </div>
      <div className={compact ? "mt-3 space-y-2" : "mt-4 space-y-3"}>
        {summary.sortedPrizes.map((prize) => (
          <div key={prize.id}>
            <div className="mb-1 flex items-center justify-between gap-3 text-xs">
              <span className="truncate font-semibold text-zinc-700 dark:text-zinc-200">
                {prize.rewardLabel}
              </span>
              <span className="shrink-0 font-bold text-zinc-900 dark:text-white">
                {formatVisualChance(prize.chancePercent)}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
              <div
                className="h-full rounded-full bg-cyan-500"
                style={{ width: `${Math.max(2, prize.chancePercent)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      {!summary.isBalanced ? (
        <p className="mt-3 text-xs leading-relaxed text-amber-700 dark:text-amber-200">
          Сумма шансов отличается от 100%. Такой шаблон сохранится как веса, но
          оператору лучше выровнять проценты перед публикацией.
        </p>
      ) : null}
    </div>
  );
}

function TemplatePicker<T extends { id: string }>({
  title,
  description,
  items,
  emptyLabel,
  getLabel,
  renderDetails,
  disabled,
  actionLabel,
  onApply,
}: {
  title: string;
  description: string;
  items: T[];
  emptyLabel: string;
  getLabel: (item: T) => string;
  renderDetails?: (item: T) => ReactNode;
  disabled: boolean;
  actionLabel: string;
  onApply: (item: T) => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const selected =
    items.find((item) => item.id === selectedId) ?? items[0] ?? null;

  if (!items.length) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
        <span className="block font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
          {title}
        </span>
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-cyan-200 bg-cyan-50/50 p-3 dark:border-cyan-900/60 dark:bg-cyan-950/20">
      <div className="mb-2">
        <p className="text-xs font-bold uppercase tracking-wide text-cyan-800 dark:text-cyan-200">
          {title}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          {description}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <select
          className={fieldClass}
          value={selected?.id ?? ""}
          disabled={disabled}
          onChange={(event) => setSelectedId(event.target.value)}
        >
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {getLabel(item)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="rounded-lg border border-cyan-300 px-3 py-2 text-xs font-bold text-cyan-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-cyan-800 dark:text-cyan-100"
          disabled={disabled || !selected}
          onClick={() => {
            if (selected) {
              onApply(selected);
            }
          }}
        >
          {actionLabel}
        </button>
      </div>
      {selected && renderDetails ? (
        <div className="mt-3">{renderDetails(selected)}</div>
      ) : null}
    </div>
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

function LootBoxScheduleField({
  item,
  disabled,
  onChange,
}: {
  item: GuestGameVisualEditorLootBox;
  disabled: boolean;
  onChange: (patch: Partial<GuestGameVisualEditorLootBox>) => void;
}) {
  const weekdays = item.weekdays.length
    ? item.weekdays
    : visualWeekdayPresets.CUSTOM;
  const hasTimeWindow = item.timeWindowMode !== "ANY";
  const hasCustomWeekdays = item.weekdayMode === "CUSTOM";
  const setWeekdayMode = (weekdayMode: string) => {
    onChange({
      weekdayMode,
      weekdays:
        weekdayMode === "CUSTOM"
          ? weekdays
          : visualWeekdayPresets[weekdayMode] ?? visualWeekdayPresets.ANY,
    });
  };
  const toggleWeekday = (weekday: number) => {
    const next = weekdays.includes(weekday)
      ? weekdays.filter((item) => item !== weekday)
      : [...weekdays, weekday];

    onChange({
      weekdayMode: "CUSTOM",
      weekdays: sortVisualWeekdays(next),
    });
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="grid gap-3">
        <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Когда показывать
          <select
            className={fieldClass}
            value={item.timeWindowMode}
            disabled={disabled}
            onChange={(event) =>
              onChange({ timeWindowMode: event.target.value })
            }
          >
            {visualTimeWindowOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <EditorHint>
            {item.timeWindowMode === "ANY"
              ? "Время не ограничивает появление лутбокса."
              : "Лутбокс появится только внутри выбранного временного окна."}
          </EditorHint>
        </label>
        <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          По каким дням
          <select
            className={fieldClass}
            value={item.weekdayMode}
            disabled={disabled}
            onChange={(event) => setWeekdayMode(event.target.value)}
          >
            {visualWeekdayOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <EditorHint>
            {item.weekdayMode === "CUSTOM"
              ? "Отметьте конкретные дни для появления лутбокса."
              : "Дни можно ограничить буднями, выходными или оставить без ограничения."}
          </EditorHint>
        </label>
      </div>
      {hasTimeWindow ? (
        <div className="mt-3 grid gap-3">
          <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Начало окна
            <input
              className={fieldClass}
              type="time"
              value={item.hourFrom}
              disabled={disabled}
              onChange={(event) => onChange({ hourFrom: event.target.value })}
            />
          </label>
          <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Конец окна
            <input
              className={fieldClass}
              type="time"
              value={item.hourTo}
              disabled={disabled}
              onChange={(event) => onChange({ hourTo: event.target.value })}
            />
          </label>
        </div>
      ) : null}
      {hasCustomWeekdays ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {visualWeekdayItems.map((weekday) => {
            const active = weekdays.includes(weekday.value);

            return (
              <button
                key={weekday.value}
                type="button"
                disabled={disabled}
                className={[
                  "rounded-lg border px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50",
                  active
                    ? "border-cyan-300 bg-cyan-100 text-cyan-950 dark:border-cyan-700 dark:bg-cyan-950 dark:text-cyan-100"
                    : "border-zinc-200 bg-white text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300",
                ].join(" ")}
                onClick={() => toggleWeekday(weekday.value)}
              >
                {weekday.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
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
      Лутбоксов на одного гостя в неделю
      <div className="mt-2 grid gap-2">
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
        <label className="mt-2 block text-sm font-medium normal-case tracking-normal text-zinc-700 dark:text-zinc-200">
          Открытий на гостя в неделю
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
        </label>
      ) : (
        <EditorHint>
          Лутбокс не будет ограничен количеством открытий на одного гостя.
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
            {statusLabel(status)}
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
        {!hasCurrentOption && value ? (
          <option value={value}>Сохраненное событие</option>
        ) : null}
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

function MissionTypeField({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const hasCurrentOption = visualMissionTypeOptions.some(
    (option) => option.value === value,
  );

  return (
    <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
      Тип квеста
      <select
        className={fieldClass}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {!hasCurrentOption && value ? (
          <option value={value}>Сохраненный тип квеста</option>
        ) : null}
        {visualMissionTypeOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <EditorHint>
        {visualMissionTypeHelpText[value] ??
          "Тип помогает понять сценарий квеста; подробные условия можно уточнить в расширенных настройках."}
      </EditorHint>
    </label>
  );
}

function MissionProgressUnitField({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const hasCurrentOption = visualProgressUnitOptions.some(
    (option) => option.value === value,
  );

  return (
    <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
      Что считаем
      <select
        className={fieldClass}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {!hasCurrentOption && value ? (
          <option value={value}>Сохраненный способ расчета</option>
        ) : null}
        {visualProgressUnitOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <EditorHint>
        {visualProgressUnitHelpText[value] ??
          "Выберите, в каких понятных единицах гость будет видеть прогресс квеста."}
      </EditorHint>
    </label>
  );
}

function PromoTargetField({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const normalizedValue = value || "home";
  const hasCurrentOption = visualPromoTargetOptions.some(
    (option) => option.value === normalizedValue,
  );

  return (
    <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
      Куда вести гостя
      <select
        className={fieldClass}
        value={normalizedValue}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {!hasCurrentOption && normalizedValue ? (
          <option value={normalizedValue}>Сохраненный раздел</option>
        ) : null}
        {visualPromoTargetOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <EditorHint>
        {visualPromoTargetHelpText[normalizedValue] ??
          "Выберите раздел гостевой страницы, куда должен вести баннер."}
      </EditorHint>
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

function sortVisualWeekdays(value: number[]) {
  const order = new Map(
    visualWeekdayItems.map((item, index) => [item.value, index]),
  );

  return Array.from(new Set(value))
    .filter((item) => order.has(item))
    .sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0));
}

function visualTriggerLabel(value: string) {
  return (
    visualTriggerOptions.find((option) => option.value === value)?.label ??
    value
  );
}

function visualLootBoxConditionLabel(
  value: string | null | undefined,
  triggerKind: string,
) {
  const normalized = value?.trim();

  if (
    !normalized ||
    normalized === triggerKind ||
    visualTriggerOptions.some((option) => option.value === normalized)
  ) {
    return visualTriggerLabel(triggerKind);
  }

  return normalized;
}

function createVisualLootBox(): GuestGameVisualEditorLootBox {
  return {
    id: null,
    title: "Новый лутбокс",
    status: "DRAFT",
    triggerKind: "SESSION_START",
    rewardType: "BONUS_BALANCE",
    rewardAmount: 100,
    rewardLabel: "Бонусы Langame",
    prizes: [
      {
        id: "prize-1",
        rewardType: "BONUS_BALANCE",
        rewardAmount: 100,
        rewardLabel: "Бонусы Langame",
        chancePercent: 100,
      },
    ],
    condition: visualTriggerLabel("SESSION_START"),
    limitPerGuest: 1,
    timeWindowMode: "ANY",
    weekdayMode: "ANY",
    weekdays: visualWeekdayPresets.ANY,
    hourFrom: "10:00",
    hourTo: "16:00",
  };
}

function createVisualMission(): GuestGameVisualEditorMission {
  return {
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
    progressUnit: "step",
    questSteps: [{ id: "step-1", title: "Выполнить шаг", target: 1 }],
  };
}

function createVisualPromo(): GuestGameVisualEditorPromoCard {
  return {
    id: null,
    label: "Акция",
    title: "Новое событие",
    description: "Короткое описание для гостевой главной.",
    tag: "активно",
    status: "DRAFT",
    targetAnchor: "missions",
    periodFrom: null,
    periodTo: null,
  };
}

function templatesForStore<T extends { storeIds: string[]; status: GuestGameStatus }>(
  items: T[],
  storeId: string,
) {
  return items
    .filter(
      (item) =>
        item.status !== "ARCHIVED" &&
        (!item.storeIds.length || !storeId || item.storeIds.includes(storeId)),
    )
    .sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === "ACTIVE" ? -1 : 1;
      }

      return templateName(left).localeCompare(templateName(right), "ru");
    });
}

function templateName(value: unknown) {
  const record = templateRecord(value);
  return templateString(record.name ?? record.title, "");
}

function statusLabel(status: GuestGameStatus) {
  const labels: Record<GuestGameStatus, string> = {
    DRAFT: "черновик",
    ACTIVE: "активно",
    PAUSED: "пауза",
    FINISHED: "завершено",
    ARCHIVED: "архив",
  };

  return labels[status] ?? status;
}

function visualBattlePassFromSeasonTemplate(
  season: GuestGameSeason,
): GuestGameVisualEditorPayload["battlePass"] {
  const levels = templateArray(season.levels).map((item) =>
    templateRecord(item),
  );
  const levelRewards = levels
    .map((item, index) => ({
      level: templateInt(item.level, index + 1, 1, 60),
      reward: templateString(item.freeReward ?? item.premiumReward, ""),
    }))
    .filter((item) => item.reward.trim());
  const firstXp = templateNumber(levels[0]?.xp, 0);
  const secondXp = templateNumber(levels[1]?.xp, firstXp + 250);
  const xpPerLevel = Math.max(1, secondXp - firstXp);

  return {
    id: null,
    enabled: true,
    title: season.name,
    status: season.status,
    levelCount: Math.max(levels.length, levelRewards.length, 1),
    xpPerLevel,
    mainPrize: levelRewards.at(-1)?.reward ?? null,
    levelRewards,
  };
}

function visualLootBoxFromTemplate(
  lootBox: GuestGameLootBox,
): GuestGameVisualEditorLootBox {
  const periodRules = templateRecord(lootBox.periodRules);
  const limits = templateRecord(lootBox.limits);
  const probabilityRules = templateRecord(lootBox.probabilityRules);

  return {
    ...createVisualLootBox(),
    id: null,
    title: lootBox.name,
    status: lootBox.status,
    triggerKind: lootBox.triggerKind,
    rewardType: canonicalVisualLootBoxRewardType(lootBox.rewardType),
    rewardAmount: lootBox.rewardAmount,
    rewardLabel: lootBox.rewardLabel ?? lootBox.name,
    prizes: visualLootBoxPrizesFromRules({
      rewardType: lootBox.rewardType,
      rewardAmount: lootBox.rewardAmount,
      rewardLabel: lootBox.rewardLabel ?? lootBox.name,
      prizes: probabilityRules.prizes,
      items: probabilityRules.items,
    }),
    condition: visualLootBoxConditionLabel(
      templateString(periodRules.condition, lootBox.triggerKind),
      lootBox.triggerKind,
    ),
    limitPerGuest: templateNumberOrNull(
      limits.perGuest ?? limits.perGuestPerWeek,
    ),
    timeWindowMode: templateTimeWindowMode(
      periodRules.timeWindowMode ?? inferTemplateTimeWindowMode(periodRules),
    ),
    weekdayMode: templateWeekdayMode(
      periodRules.weekdayMode ?? inferTemplateWeekdayMode(periodRules),
    ),
    weekdays: templateWeekdays(periodRules.weekdays),
    hourFrom: templatePeriodHour(periodRules, 0, "10:00"),
    hourTo: templatePeriodHour(periodRules, 1, "16:00"),
  };
}

function visualMissionFromTemplate(
  mission: GuestGameMission,
): GuestGameVisualEditorMission {
  const conditions = templateRecord(mission.conditions);
  const questSteps = templateArray(conditions.questSteps)
    .map((item, index) => {
      const record = templateRecord(item);

      return {
        id: templateString(record.id, `step-${index + 1}`),
        title: templateString(record.title, ""),
        target: templateInt(record.target, index + 1, 1, 100000),
      };
    })
    .filter((step) => step.title.trim());

  return {
    ...createVisualMission(),
    id: null,
    title: mission.name,
    status: mission.status,
    missionType: mission.missionType,
    triggerKind: mission.triggerKind,
    xpReward: mission.xpReward,
    rewardType: mission.rewardType,
    rewardAmount: mission.rewardAmount,
    rewardLabel: mission.rewardLabel ?? mission.name,
    progressTarget: mission.progressTarget,
    progressUnit: mission.progressUnit,
    questSteps: questSteps.length
      ? questSteps
      : [{ id: "step-1", title: mission.name, target: 1 }],
  };
}

function visualPromoFromTemplate(
  promo: GuestGamePromoCard,
): GuestGameVisualEditorPromoCard {
  return {
    ...createVisualPromo(),
    id: null,
    label: promo.label,
    title: promo.title,
    description: promo.description,
    tag: promo.tag,
    status: promo.status,
    targetAnchor: promo.targetAnchor,
    periodFrom: promo.periodFrom,
    periodTo: promo.periodTo,
  };
}

function visualCheckInFromMissionTemplate(
  mission: GuestGameMission,
): Partial<GuestGameVisualEditorCheckIn> {
  const isBonus = isBonusRewardType(mission.rewardType);

  return {
    enabled: mission.status === "ACTIVE",
    rewardMode: isBonus ? "BONUS" : mission.xpReward > 0 ? "XP" : "",
    xp: mission.xpReward || null,
    bonusAmount: isBonus ? mission.rewardAmount : null,
    rewardLabel: mission.rewardLabel ?? mission.name,
  };
}

function isBonusRewardType(rewardType: string) {
  return [
    "BONUS",
    "BONUS_POINTS",
    "BONUS_BALANCE",
    "LOYALTY_BONUS",
    "CASHBACK",
  ].includes(rewardType);
}

function canonicalVisualLootBoxRewardType(rewardType: string) {
  return isBonusRewardType(rewardType) ? "BONUS_BALANCE" : rewardType;
}

function syncSingleVisualLootBoxPrize(
  prizes: GuestGameVisualEditorLootBoxPrize[],
  patch: Partial<Pick<GuestGameVisualEditorLootBoxPrize, "rewardAmount" | "rewardLabel">>,
) {
  if (prizes.length !== 1) {
    return prizes;
  }

  return [{ ...prizes[0], ...patch }];
}

function lootBoxPrizeSummary(prizes: GuestGameVisualEditorLootBoxPrize[]) {
  const safePrizes = prizes.length
    ? prizes
    : [
        {
          id: "empty-prize",
          rewardType: "PROMOCODE",
          rewardAmount: null,
          rewardLabel: "Награда не задана",
          chancePercent: 100,
        },
      ];
  const sortedPrizes = [...safePrizes].sort(
    (left, right) => right.chancePercent - left.chancePercent,
  );
  const totalChance = safePrizes.reduce(
    (total, prize) => total + prize.chancePercent,
    0,
  );
  const chanceDiff = Math.round((100 - totalChance) * 100) / 100;
  const isBalanced = Math.abs(chanceDiff) < 0.01;
  const statusLabel = isBalanced
    ? "100%"
    : chanceDiff > 0
      ? `еще ${formatVisualChance(chanceDiff)}%`
      : `+${formatVisualChance(Math.abs(chanceDiff))}%`;

  return {
    sortedPrizes,
    topPrize: sortedPrizes[0] ?? null,
    totalChance,
    isBalanced,
    statusLabel,
    countLabel:
      safePrizes.length === 1 ? "1 приз" : `${safePrizes.length} призов`,
  };
}

function formatVisualChance(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace(/\.?0+$/, "");
}

function templateRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function templateArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function visualLootBoxPrizesFromRules(
  value: Record<string, unknown>,
): GuestGameVisualEditorLootBoxPrize[] {
  const fallbackType = canonicalVisualLootBoxRewardType(
    templateString(value.rewardType, "PROMOCODE"),
  );
  const fallbackAmount = templateNumberOrNull(value.rewardAmount);
  const fallbackLabel = templateString(value.rewardLabel, "Награда клуба");
  const source = templateArray(value.prizes).length
    ? templateArray(value.prizes)
    : templateArray(value.items);
  const prizes = source
    .map((item, index) => {
      const record = templateRecord(item);
      const rewardLabel = templateString(
        record.rewardLabel ?? record.label,
        fallbackLabel,
      );

      return {
        id: templateString(record.id, `prize-${index + 1}`),
        rewardType: canonicalVisualLootBoxRewardType(
          templateString(record.rewardType ?? record.type, fallbackType),
        ),
        rewardAmount: templateNumberOrNull(
          record.rewardAmount ?? record.amount ?? fallbackAmount,
        ),
        rewardLabel,
        chancePercent: templateChancePercent(
          record.chancePercent ?? record.weight ?? record.probability,
          source.length > 1 ? 0 : 100,
        ),
      };
    })
    .filter(
      (prize) =>
        prize.rewardLabel.trim() ||
        prize.rewardAmount != null ||
        prize.rewardType,
    )
    .slice(0, 20);

  if (prizes.length) {
    return prizes;
  }

  return [
    {
      id: "prize-1",
      rewardType: fallbackType,
      rewardAmount: fallbackAmount,
      rewardLabel: fallbackLabel,
      chancePercent: 100,
    },
  ];
}

function templateString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function templateNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function templateNumberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function templateChancePercent(value: unknown, fallback: number) {
  const parsed = templateNumberOrNull(value);
  const safe = parsed == null ? fallback : parsed;

  return Math.round(Math.min(100, Math.max(0, safe)) * 100) / 100;
}

function templateInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = templateNumber(value, fallback);
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function templateTimeWindowMode(value: unknown) {
  const mode = templateString(value, "ANY").toUpperCase();

  return ["ANY", "QUIET_HOURS", "CUSTOM"].includes(mode) ? mode : "ANY";
}

function templateWeekdayMode(value: unknown) {
  const mode = templateString(value, "ANY").toUpperCase();

  return ["ANY", "WEEKDAYS", "WEEKENDS", "CUSTOM"].includes(mode)
    ? mode
    : "ANY";
}

function templateWeekdays(value: unknown) {
  return sortVisualWeekdays(
    templateArray(value)
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6),
  );
}

function templateSameWeekdays(left: number[], right: number[]) {
  const leftSorted = sortVisualWeekdays(left);
  const rightSorted = sortVisualWeekdays(right);

  return (
    leftSorted.length === rightSorted.length &&
    leftSorted.every((item, index) => item === rightSorted[index])
  );
}

function inferTemplateTimeWindowMode(periodRules: Record<string, unknown>) {
  const hours = templateArray(periodRules.hours);

  if (!hours.length && periodRules.quietHoursEnabled !== true) {
    return "ANY";
  }

  return periodRules.quietHoursEnabled === true ? "QUIET_HOURS" : "CUSTOM";
}

function inferTemplateWeekdayMode(periodRules: Record<string, unknown>) {
  const weekdays = templateWeekdays(periodRules.weekdays);

  if (templateSameWeekdays(weekdays, visualWeekdayPresets.WEEKDAYS)) {
    return "WEEKDAYS";
  }

  if (templateSameWeekdays(weekdays, visualWeekdayPresets.WEEKENDS)) {
    return "WEEKENDS";
  }

  if (
    !weekdays.length ||
    templateSameWeekdays(weekdays, visualWeekdayPresets.ANY)
  ) {
    return periodRules.weekdaysOnly === true ? "WEEKDAYS" : "ANY";
  }

  return "CUSTOM";
}

function templateTimeValue(value: unknown, fallback: string) {
  const raw = templateString(value, fallback);
  return /^\d{2}:\d{2}$/.test(raw) ? raw : fallback;
}

function templatePeriodHour(
  periodRules: Record<string, unknown>,
  part: 0 | 1,
  fallback: string,
) {
  const hours = templateArray(periodRules.hours).filter(
    (item): item is string => typeof item === "string" && item.includes("-"),
  );
  const raw = hours[0]?.split("-")[part]?.trim();

  return templateTimeValue(raw, fallback);
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
      rewardType: "BONUS_BALANCE",
      rewardAmount: 100,
      rewardLabel: "Бонус за визит",
      prizes: [
        {
          id: "fallback-prize-1",
          rewardType: "BONUS_BALANCE",
          rewardAmount: 100,
          rewardLabel: "Бонус за визит",
          chancePercent: 100,
        },
      ],
      condition: "Визит в клуб",
      limitPerGuest: 1,
      timeWindowMode: "ANY",
      weekdayMode: "ANY",
      weekdays: visualWeekdayPresets.ANY,
      hourFrom: "10:00",
      hourTo: "16:00",
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
