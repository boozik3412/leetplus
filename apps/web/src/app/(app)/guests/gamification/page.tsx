import { GuestGamificationPanel } from "@/components/guest-gamification-panel";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import {
  getGuestAudiences,
  getGuestCrmLeads,
  getGuests,
  type GuestCrmLead,
  type GuestDashboardRow,
} from "@/lib/guests";
import {
  getGuestGamificationWorkspace,
  type GuestGamificationWorkspace,
} from "@/lib/guest-gamification";
import { can } from "@/lib/permissions";
import { getStores, type Store } from "@/lib/stores";

async function safeValue<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

async function safeNullable<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

const emptyWorkspace: GuestGamificationWorkspace = {
  summary: {
    profilesCount: 0,
    totalXp: 0,
    averageLevel: 0,
    activeLootBoxes: 0,
    activeMissions: 0,
    activeSeasons: 0,
    pendingRewards: 0,
    approvedRewards: 0,
    paidRewards: 0,
    expiredRewards: 0,
    plannedBudget: 0,
    pendingRewardAmount: 0,
    paidRewardAmount: 0,
  },
  economy: {
    summary: {
      plannedBudget: 0,
      budgetUsedCost: 0,
      pendingCost: 0,
      approvedCost: 0,
      paidCost: 0,
      expiredCost: 0,
      canceledCost: 0,
      rewardCount: 0,
      rewardBacklog: 0,
      paidRewards: 0,
      eventsCount: 0,
      uniqueGuests: 0,
      xpIssued: 0,
      rulesWithoutBudget: 0,
      budgetUsagePercent: null,
      averageRewardCost: 0,
    },
    scenarios: [],
  },
  effect: {
    windowDays: 14,
    summary: {
      eventsCount: 0,
      measuredEvents: 0,
      reachedGuests: 0,
      returnedGuests: 0,
      returnRatePercent: null,
      postSessions: 0,
      postPlayMinutes: 0,
      productRevenue: 0,
      balanceTopUps: 0,
      totalRevenue: 0,
      averageRevenuePerReturnedGuest: 0,
    },
    scenarios: [],
  },
  integrationReadiness: {
    summary: {
      total: 7,
      ready: 1,
      partial: 0,
      blocked: 4,
      manualOnly: 2,
    },
    items: [
      {
        key: "PUBLIC_PORTAL",
        title: "Публичный гостевой кабинет",
        status: "READY",
        statusLabel: "готов",
        ready: true,
        configured: true,
        enabled: true,
        requiredEnv: [],
        note: "Публичный маршрут гостя работает отдельно от внутреннего кабинета.",
        nextAction: "Проверить ссылку конкретного клуба в блоке публичных ссылок.",
      },
      {
        key: "OTP",
        title: "OTP-вход гостя",
        status: "BLOCKED",
        statusLabel: "нужен provider",
        ready: false,
        configured: false,
        enabled: false,
        requiredEnv: ["GUEST_PORTAL_DEV_OTP_ENABLED"],
        note: "Реальная OTP-доставка не настроена.",
        nextAction: "Подключить SMS/Telegram/MAX provider после согласования.",
      },
      {
        key: "TELEGRAM_LINK",
        title: "Привязка Telegram-бота",
        status: "BLOCKED",
        statusLabel: "не настроено",
        ready: false,
        configured: false,
        enabled: false,
        requiredEnv: [
          "GUEST_GAME_TELEGRAM_BOT_USERNAME",
          "GUEST_GAME_TELEGRAM_LINK_SECRET",
        ],
        note: "Deep link бота требует username и link secret.",
        nextAction: "Настроить Telegram bot username и link secret.",
      },
      {
        key: "TELEGRAM_WEBHOOK",
        title: "Telegram webhook consumer",
        status: "BLOCKED",
        statusLabel: "секрет нужен",
        ready: false,
        configured: false,
        enabled: false,
        requiredEnv: ["GUEST_GAME_TELEGRAM_WEBHOOK_SECRET"],
        note: "Webhook принимает link-code и отписки только с секретом.",
        nextAction: "Задать webhook secret и URL в Telegram.",
      },
      {
        key: "TELEGRAM_DELIVERY",
        title: "Отправка наград в Telegram",
        status: "BLOCKED",
        statusLabel: "dry-run",
        ready: false,
        configured: false,
        enabled: false,
        requiredEnv: [
          "GUEST_GAME_DELIVERY_REAL_SEND_ENABLED",
          "GUEST_GAME_TELEGRAM_DELIVERY_ENABLED",
          "GUEST_GAME_TELEGRAM_BOT_TOKEN",
        ],
        note: "Dispatcher по умолчанию работает без внешней отправки.",
        nextAction: "Включать только после consent/audit-настроек.",
      },
      {
        key: "MAX_DELIVERY",
        title: "MAX bot / Mini App",
        status: "BLOCKED",
        statusLabel: "не настроено",
        ready: false,
        configured: false,
        enabled: false,
        requiredEnv: [
          "GUEST_GAME_DELIVERY_REAL_SEND_ENABLED",
          "GUEST_GAME_MAX_DELIVERY_ENABLED",
          "GUEST_GAME_MAX_BOT_TOKEN",
          "GUEST_GAME_MAX_DELIVERY_ENDPOINT",
        ],
        note: "MAX требует подтвержденный API-контракт.",
        nextAction: "Не включать до юридической и технической подготовки.",
      },
      {
        key: "LANGAME_WRITE_API",
        title: "Запись наград в Langame",
        status: "MANUAL_ONLY",
        statusLabel: "выключено",
        ready: false,
        configured: false,
        enabled: false,
        requiredEnv: [],
        note: "Автоматическая запись наград в Langame отключена.",
        nextAction: "Работать через очередь, кассира и claim-коды.",
      },
    ],
    note: "Готовность интеграций появится после ответа API workspace.",
  },
  pilotReadiness: {
    targetStore: null,
    summary: {
      total: 0,
      ready: 0,
      partial: 0,
      blocked: 0,
      manualOnly: 0,
      readinessPercent: 0,
    },
    items: [],
    note: "Пилотный чек-лист появится после ответа API workspace.",
  },
  communicationQueue: {
    summary: {
      total: 0,
      readyForBot: 0,
      readyForCashier: 0,
      needsApproval: 0,
      needsConsent: 0,
      needsChannel: 0,
      blockedByUnsubscribe: 0,
      expired: 0,
      redeemed: 0,
      canceled: 0,
    },
    items: [],
    note: "Очередь коммуникаций появится после создания наград.",
  },
  deliveryOutbox: {
    summary: {
      total: 0,
      ready: 0,
      blocked: 0,
      sent: 0,
      failed: 0,
      canceled: 0,
      telegram: 0,
      max: 0,
      cashier: 0,
      manual: 0,
    },
    dispatcher: {
      mode: "DRY_RUN",
      modeLabel: "dry-run",
      realSendEnabled: false,
      providers: [
        {
          channel: "TELEGRAM",
          channelLabel: "Telegram",
          pendingReady: 0,
          enabledByEnv: false,
          configured: false,
          canAttemptSend: false,
          dryRunOnly: true,
          requiredEnv: [
            "GUEST_GAME_DELIVERY_REAL_SEND_ENABLED",
            "GUEST_GAME_TELEGRAM_DELIVERY_ENABLED",
            "GUEST_GAME_TELEGRAM_BOT_TOKEN",
          ],
          note: "Telegram provider еще не настроен.",
        },
        {
          channel: "MAX",
          channelLabel: "MAX",
          pendingReady: 0,
          enabledByEnv: false,
          configured: false,
          canAttemptSend: false,
          dryRunOnly: true,
          requiredEnv: [
            "GUEST_GAME_DELIVERY_REAL_SEND_ENABLED",
            "GUEST_GAME_MAX_DELIVERY_ENABLED",
            "GUEST_GAME_MAX_BOT_TOKEN",
            "GUEST_GAME_MAX_DELIVERY_ENDPOINT",
          ],
          note: "MAX provider еще не настроен.",
        },
      ],
      note: "Dispatcher по умолчанию работает в dry-run.",
    },
    items: [],
    note: "Outbox появится после подготовки выдачи из очереди наград.",
  },
  profiles: [],
  lootBoxes: [],
  missions: [],
  seasons: [],
  rewards: [],
  events: [],
  tariffSnapshots: [],
  guestLogCatalog: {
    items: [],
    mappings: [],
    summary: {
      types: 0,
      logs: 0,
      domains: 0,
      latestAt: null,
    },
  },
};

export default async function GuestGamificationPage() {
  const user = await requireCurrentUser();

  if (!can(user, "view_guest_gamification")) {
    return (
      <main className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <ReportBreadcrumbs
            current="Геймификация"
            items={[
              { href: "/dashboard", label: "Дашборд" },
              { href: "/guests", label: "Гости" },
            ]}
          />
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            Геймификация гостей
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-white">
            Нет доступа
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Для открытия Guest Game Hub нужна роль с доступом
            `Геймификация: просмотр`. Управление правилами и выдача наград
            настраиваются отдельными правами.
          </p>
        </div>
      </main>
    );
  }

  const [workspace, audiences, stores, guestsResponse, leads] =
    await Promise.all([
      safeValue(getGuestGamificationWorkspace(), emptyWorkspace),
      safeValue(getGuestAudiences(), []),
      safeValue<Store[]>(getStores(), []),
      safeNullable(getGuests({ pageSize: "80", sort: "lastActivity" })),
      safeValue<GuestCrmLead[]>(getGuestCrmLeads(), []),
    ]);

  const guests: GuestDashboardRow[] = guestsResponse?.rows ?? [];

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Геймификация"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/guests", label: "Гости" },
          ]}
        />

        <GuestGamificationPanel
          initialWorkspace={workspace}
          audiences={audiences}
          stores={stores}
          guests={guests}
          leads={leads}
          tenantSlug={user.tenantSlug}
          access={{
            canManageRules: can(user, "manage_guest_game_rules"),
            canApproveRewards: can(user, "approve_guest_game_rewards"),
            canViewGuestPii: can(user, "view_guest_game_pii"),
          }}
        />
      </div>
    </main>
  );
}
