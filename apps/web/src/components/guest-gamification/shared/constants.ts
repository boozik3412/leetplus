import type {
  LootBoxWeekdayMode,
  LootBoxCaseRarity,
  LootBoxPrizeForm,
  MissionQuestStepForm,
  GuestLogBusinessPreset,
  GuestLogEventOption,
  StatusPillTone,
} from "./types";
import type {
  GuestGameStatus,
  GuestGameReward,
  GuestGameLootBoxUsageKind,
  GuestGameRewardStatus,
} from "@/lib/guest-gamification";

export const PROMO_BANNER_DISPLAY_LIMIT = 4;

export const PROMO_BANNER_IMAGE_WIDTH = 720;

export const PROMO_BANNER_IMAGE_HEIGHT = 1280;

export const PROMO_BANNER_MAX_DATA_URL_LENGTH = 2_400_000;

export const promoBannerJpegQualities = [0.78, 0.68, 0.58] as const;

export const dryRunEventOptions = [
  { value: "SESSION_START", label: "Старт сессии" },
  { value: "APP_OPEN", label: "Открытие приложения" },
  { value: "VISIT", label: "Визит" },
  { value: "CHECK_IN", label: "Чекин в клубе" },
  { value: "PLAY_HOUR", label: "Час игры" },
  { value: "BAR_PURCHASE", label: "Покупка бара" },
  { value: "PRODUCT_PURCHASE", label: "Товарная покупка" },
  { value: "BALANCE_TOPUP", label: "Пополнение баланса" },
  { value: "GUEST_LOG", label: "Лог гостя" },
  { value: "REFERRAL_ACCEPTED", label: "Реферал принят" },
  { value: "REPEAT_VISIT", label: "Повторный визит" },
  { value: "MISSION_COMPLETED", label: "Задание выполнено" },
];

export const manualXpEventOptions = [
  {
    value: "MANUAL_XP",
    label: "Ручная корректировка XP",
    description:
      "Используйте для разового начисления или списания опыта по решению команды.",
    defaultXpDelta: "50",
    payloadReason: "manual_adjustment",
  },
  {
    value: "CHECK_IN",
    label: "Чекин в клубе",
    description:
      "Фиксирует ручной чекин, если гостя нужно отметить без гостевого экрана.",
    defaultXpDelta: "10",
    payloadReason: "manual_check_in",
  },
  {
    value: "VISIT",
    label: "Визит в клуб",
    description:
      "Отмечает посещение гостя, когда автоматический факт пока не подтянулся.",
    defaultXpDelta: "20",
    payloadReason: "manual_visit",
  },
  {
    value: "PLAY_HOUR",
    label: "Час игры",
    description:
      "Подходит для ручного зачета игрового времени или компенсации за сессию.",
    defaultXpDelta: "25",
    payloadReason: "manual_play_hour",
  },
  {
    value: "MISSION_COMPLETED",
    label: "Задание выполнено",
    description:
      "Используйте, когда сотрудник вручную подтверждает выполнение задания.",
    defaultXpDelta: "50",
    payloadReason: "manual_mission_completed",
  },
  {
    value: "REFERRAL_ACCEPTED",
    label: "Приглашенный гость зарегистрировался",
    description:
      "Ручной зачет реферального события, если автоматическая атрибуция не сработала.",
    defaultXpDelta: "50",
    payloadReason: "manual_referral",
  },
  {
    value: "APP_OPEN",
    label: "Открытие приложения",
    description:
      "Ручной зачет активности для сценариев возврата гостя в приложение.",
    defaultXpDelta: "5",
    payloadReason: "manual_app_open",
  },
] as const;

export const weekdayOptions = [
  { value: 1, label: "Пн" },
  { value: 2, label: "Вт" },
  { value: 3, label: "Ср" },
  { value: 4, label: "Чт" },
  { value: 5, label: "Пт" },
  { value: 6, label: "Сб" },
  { value: 0, label: "Вс" },
];

export const weekdayPresets: Record<LootBoxWeekdayMode, number[]> = {
  ANY: [0, 1, 2, 3, 4, 5, 6],
  WEEKDAYS: [1, 2, 3, 4, 5],
  WEEKENDS: [0, 6],
  CUSTOM: [1, 2, 3, 4, 5],
};

export const triggerHelpText: Record<string, string> = {
  SESSION_START:
    "Правило проверится, когда у гостя начнется игровая сессия в клубе.",
  APP_OPEN:
    "Правило проверится, когда гость откроет сайт игрового модуля или Telegram Mini App. Подходит для возврата потерявшихся гостей.",
  CHECK_IN:
    "Правило проверится после чекина гостя в игровом модуле выбранного клуба.",
  VISIT:
    "Общий визит в клуб: подходит для сценариев, где сессия, чекин или лог Langame считаются посещением.",
  PLAY_HOUR:
    "Правило проверится по накопленному игровому времени, например за час игры или завершение сессии.",
  BAR_PURCHASE:
    "Правило проверится после покупки или списания в баре, если факт есть в сохраненных данных.",
  PRODUCT_PURCHASE:
    "Правило проверится после товарной покупки из сохраненных продаж или списаний.",
  BALANCE_TOPUP:
    "Правило проверится после пополнения баланса гостя в сохраненных фактах Langame.",
  GUEST_LOG:
    "Правило проверится по событию из guests/logs. Ниже можно ограничить разрешенные и запрещенные типы логов.",
  REFERRAL_ACCEPTED:
    "Правило проверится, когда приглашенный гость успешно зарегистрируется по реферальной ссылке.",
  REPEAT_VISIT:
    "Правило проверит повторное посещение гостя в заданном окне времени.",
  MISSION_COMPLETED: "Правило проверится после выполнения другого задания.",
};

export const rewardTypeOptions = [
  { value: "PROMOCODE", label: "Промокод" },
  { value: "BONUS_BALANCE", label: "Бонусы Langame" },
  { value: "BALANCE", label: "Денежный баланс Langame" },
  { value: "XP", label: "Опыт XP" },
  { value: "FREE_HOURS", label: "Бесплатные часы" },
  { value: "CASHIER_CODE", label: "Код кассиру" },
  { value: "MERCH", label: "Физический приз" },
  { value: "BATTLE_PASS_REWARD", label: "Награда Battle Pass" },
];

export const legacyRewardTypeLabelOptions = [
  { value: "BONUS", label: "Бонусы Langame (старый тип)" },
  { value: "BONUS_POINTS", label: "Бонусы Langame (старый тип)" },
  { value: "LOYALTY_BONUS", label: "Бонусы Langame (старый тип)" },
  { value: "CASHBACK", label: "Бонусы Langame (старый тип)" },
  { value: "CASH_BALANCE", label: "Бонусы Langame (старый тип)" },
  { value: "LANGAME_BALANCE", label: "Бонусы Langame (старый тип)" },
  { value: "MONEY_BALANCE", label: "Денежный баланс Langame (старый тип)" },
  { value: "WALLET_BALANCE", label: "Денежный баланс Langame (старый тип)" },
];

export const rewardTypeLabelOptions = [
  ...rewardTypeOptions,
  ...legacyRewardTypeLabelOptions,
];

export const sessionTypeOptions = [
  { value: "regular_session", label: "почасовая сессия" },
  { value: "packet_hours", label: "пакет или абонемент" },
];

export const statusLabels: Record<GuestGameStatus, string> = {
  DRAFT: "черновик",
  ACTIVE: "активно",
  PAUSED: "пауза",
  FINISHED: "завершено",
  ARCHIVED: "архив",
};

export const rewardRarityLabels: Record<
  NonNullable<GuestGameReward["rewardRarity"]>,
  string
> = {
  common: "Обычная",
  rare: "Редкая",
  epic: "Эпическая",
  legendary: "Легендарная",
};

export const lootBoxCaseRarityLabels: Record<LootBoxCaseRarity, string> = {
  common: "Обычный",
  rare: "Редкий",
  epic: "Эпический",
  legendary: "Легендарный",
};

export const lootBoxCaseRarityOptions = (
  Object.keys(lootBoxCaseRarityLabels) as LootBoxCaseRarity[]
).map((value) => ({ value, label: lootBoxCaseRarityLabels[value] }));

export const lootBoxUsageKindOptions: Array<{
  value: GuestGameLootBoxUsageKind;
  label: string;
  description: string;
}> = [
  {
    value: "STANDALONE",
    label: "Витрина",
    description: "Показывается отдельной карточкой в игровом модуле.",
  },
  {
    value: "REWARD_TEMPLATE",
    label: "Подарочный",
    description: "Не отображается в витрине и используется только как награда.",
  },
  {
    value: "BOTH",
    label: "Витрина + подарок",
    description: "Можно открыть в витрине и выдать как награду.",
  },
];

export const lootBoxUsageKindLabels: Record<GuestGameLootBoxUsageKind, string> = {
  STANDALONE: "витрина",
  REWARD_TEMPLATE: "подарочный",
  BOTH: "витрина + подарок",
};

export const rewardStatusActionLabels: Record<GuestGameRewardStatus, string> = {
  PENDING: "Вернуть к выдаче",
  APPROVED: "Согласовать",
  PAID: "Отметить выдано",
  CANCELED: "Отменить",
  EXPIRED: "Списать как сгоревшую",
};

export const fieldClass =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white";

export const smallButtonClass =
  "rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 dark:text-zinc-200 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-100";

export const dangerButtonClass =
  "rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/60 dark:text-red-200 dark:hover:border-red-700 dark:hover:bg-red-950/30";

export const primaryButtonClass =
  "rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300";

export const formSectionClass =
  "rounded-lg border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/35";

export const statusOptions: GuestGameStatus[] = [
  "DRAFT",
  "ACTIVE",
  "PAUSED",
  "FINISHED",
  "ARCHIVED",
];

export const rewardStatusOptions: GuestGameRewardStatus[] = [
  "PENDING",
  "APPROVED",
  "PAID",
  "CANCELED",
  "EXPIRED",
];

export const defaultLootBoxPrizes: LootBoxPrizeForm[] = [
  {
    id: "default-bonus-50",
    rewardType: "BONUS_BALANCE",
    rewardAmount: "50",
    rewardLabel: "50 бонусов",
    chancePercent: "85",
    noBonus: false,
    visualMode: "AUTO",
    iconKey: "coins",
    imageUrl: "",
    borderColor: "",
    textColor: "",
    backgroundColor: "",
  },
  {
    id: "default-bonus-100",
    rewardType: "BONUS_BALANCE",
    rewardAmount: "100",
    rewardLabel: "100 бонусов",
    chancePercent: "5",
    noBonus: false,
    visualMode: "AUTO",
    iconKey: "coins",
    imageUrl: "",
    borderColor: "",
    textColor: "",
    backgroundColor: "",
  },
  {
    id: "default-bonus-200",
    rewardType: "BONUS_BALANCE",
    rewardAmount: "200",
    rewardLabel: "200 бонусов",
    chancePercent: "2",
    noBonus: false,
    visualMode: "AUTO",
    iconKey: "coins",
    imageUrl: "",
    borderColor: "",
    textColor: "",
    backgroundColor: "",
  },
  {
    id: "default-promo-1000",
    rewardType: "PROMOCODE",
    rewardAmount: "1000",
    rewardLabel: "Промокод на 1000 рублей",
    chancePercent: "1",
    noBonus: false,
    visualMode: "AUTO",
    iconKey: "ticket",
    imageUrl: "",
    borderColor: "",
    textColor: "",
    backgroundColor: "",
  },
];

export const defaultMissionQuestSteps: MissionQuestStepForm[] = [
  {
    id: "step-1",
    title: "Сыграть сессию от 90 минут",
    missionId: "",
  },
  {
    id: "step-2",
    title: "Купить напиток или снек",
    missionId: "",
  },
  {
    id: "step-3",
    title: "Вернуться в будний день",
    missionId: "",
  },
];

export const emptyDryRunSource = {
  sourceFactId: "",
  sourceFactKind: "",
  externalProvider: "",
  externalDomain: "",
  externalId: "",
};

export const guestLogBusinessPresetDefinitions: Array<
  Omit<GuestLogBusinessPreset, "types">
> = [
  {
    id: "visit_or_session_start",
    label: "Старт визита или сессии",
    description: "Подходит для лутбокса при начале игры или задания на визит.",
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
    description: "Полезно для заданий на отыгранную сессию или итоговый XP.",
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
    description:
      "Подходит для заданий за участие в турнирах и клубных событиях.",
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
    description:
      "Подходит для заданий или XP за пополнение, оплату или бонусы.",
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
    description:
      "Лучше добавлять в запрет anti-fraud, чтобы исключить тесты и корректировки.",
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

export const fallbackGuestLogEventOptions: GuestLogEventOption[] = [
  {
    value: "visit",
    label: "Визит гостя",
    description: "Гость появился в клубе или был отмечен как посетитель.",
  },
  {
    value: "login",
    label: "Вход гостя",
    description: "Гость вошел в систему или был найден в логах авторизации.",
  },
  {
    value: "session_start",
    label: "Старт игровой сессии",
    description:
      "Начало игровой активности, если такой тип есть в guests/logs.",
  },
  {
    value: "tournament",
    label: "Турнир или событие",
    description: "Участие в турнире, ивенте или похожей клубной активности.",
  },
  {
    value: "manual_cancel",
    label: "Ручная отмена",
    description: "Служебное действие, обычно его добавляют в исключения.",
  },
  {
    value: "test",
    label: "Тестовое событие",
    description: "Тестовые логи, которые не должны выдавать реальные награды.",
  },
];

export const statusPillToneClasses: Record<StatusPillTone, string> = {
  neutral:
    "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-700",
  success:
    "bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800",
  info: "bg-sky-100 text-sky-800 ring-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-800",
  warning:
    "bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800",
  danger:
    "bg-red-100 text-red-800 ring-red-200 dark:bg-red-950 dark:text-red-200 dark:ring-red-800",
  purple:
    "bg-violet-100 text-violet-800 ring-violet-200 dark:bg-violet-950 dark:text-violet-200 dark:ring-violet-800",
  cyan: "bg-cyan-100 text-cyan-800 ring-cyan-200 dark:bg-cyan-950 dark:text-cyan-200 dark:ring-cyan-800",
};
