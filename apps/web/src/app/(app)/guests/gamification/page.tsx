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
      total: 11,
      ready: 1,
      partial: 0,
      blocked: 7,
      manualOnly: 3,
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
        key: "USER_CALL_AUTH",
        title: "Звонок пользователя для входа",
        status: "BLOCKED",
        statusLabel: "не настроен",
        ready: false,
        configured: false,
        enabled: false,
        requiredEnv: [
          "GUEST_PORTAL_USER_CALL_ENABLED",
          "GUEST_PORTAL_USER_CALL_SMS_RU_API_ID or GUEST_PORTAL_USER_CALL_PHONE_NUMBER/GUEST_PORTAL_USER_CALL_SECRET",
        ],
        details: [
          { label: "Флаг", value: "выключен" },
          { label: "Provider", value: "SMS.ru Callcheck или ручной callback" },
          { label: "SMS.ru api_id", value: "нужен для Callcheck" },
        ],
        note: "Звонок пользователя остается вторым каналом после Telegram-бота; поддержаны SMS.ru Callcheck и ручной provider callback.",
        nextAction: "Задать env GUEST_PORTAL_USER_CALL_ENABLED и либо SMS.ru api_id, либо номер/secret ручного provider.",
      },
      {
        key: "INCOMING_CALL_LAST4_AUTH",
        title: "Входящий звонок с 4 цифрами",
        status: "BLOCKED",
        statusLabel: "не настроен",
        ready: false,
        configured: false,
        enabled: false,
        requiredEnv: [
          "GUEST_PORTAL_INCOMING_CALL_LAST4_ENABLED",
          "GUEST_PORTAL_INCOMING_CALL_LAST4_ENDPOINT",
          "GUEST_PORTAL_INCOMING_CALL_LAST4_TOKEN",
        ],
        details: [
          { label: "Флаг", value: "выключен" },
          { label: "Provider endpoint", value: "нужен" },
          { label: "Provider token", value: "нужен" },
        ],
        note: "Четвертый канал оставлен резервом после Telegram-бота, звонка пользователя на номер и SMS-кода; для запуска нужен отдельный provider исходящих звонков.",
        nextAction: "Подключать только после стабилизации первых трех каналов: задать GUEST_PORTAL_INCOMING_CALL_LAST4_ENABLED, endpoint и token.",
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
        title: "Telegram update consumer (polling edge)",
        status: "BLOCKED",
        statusLabel: "секрет нужен",
        ready: false,
        configured: false,
        enabled: false,
        requiredEnv: ["GUEST_GAME_TELEGRAM_WEBHOOK_SECRET"],
        note: "Основной API принимает link-code и отписки только от 1337 polling edge с секретом.",
        nextAction: "Задать update secret и проверить telegram-poller на 1337.",
      },
      {
        key: "TELEGRAM_AUTH_REPLY_SENDER",
        title: "Telegram reply sender для входа",
        status: "MANUAL_ONLY",
        statusLabel: "adapter-only",
        ready: false,
        configured: false,
        enabled: false,
        requiredEnv: [
          "GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_ENABLED",
          "GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_BOT_TOKEN",
        ],
        note: "API-side отправка request_contact в Telegram выключена; reply payload может отправлять внешний adapter.",
        nextAction: "Включить sender и bot token или оставить внешний adapter.",
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
        key: "BONUS_LEDGER_SCHEDULER",
        title: "Автозапуск bonus ledger",
        status: "MANUAL_ONLY",
        statusLabel: "выключен",
        ready: false,
        configured: false,
        enabled: false,
        requiredEnv: [
          "SYNC_SERVICE_TOKEN",
          "GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED",
          "LANGAME_BONUS_ACCRUAL_ENABLED",
        ],
        note: "Автономный scheduler bonus ledger появится после ответа API workspace.",
        nextAction: "Включать сначала в dry-run/canary для 1337.",
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
    runbook: {
      stage: "BLOCKED",
      stageLabel: "Стоп",
      canRunDryRun: false,
      canRunCanary: false,
      canRunLive: false,
      canReconcile: false,
      ledgerPreflight: {
        status: "NO_STORE",
        statusLabel: "нет клуба",
        ready: false,
        scopedStoreId: null,
        scopedStoreName: null,
        readyCount: 0,
        pendingCount: 0,
        retryReadyCount: 0,
        staleProcessingCount: 0,
        processingCount: 0,
        failedWaitingRetryCount: 0,
        previewItems: [],
        metric: "0 ready / 0 pending / 0 retry",
        note: "Preflight появится после ответа API workspace.",
        nextAction: "Дождаться ответа API workspace.",
      },
      firstBonusReconciliation: {
        status: "NO_STORE",
        statusLabel: "нет клуба",
        ready: false,
        scopedStoreId: null,
        scopedStoreName: null,
        ledgerEntry: null,
        metric: "клуб не выбран",
        note: "Первая сверка bonus_balance появится после ответа API workspace.",
        nextAction: "Дождаться ответа API workspace.",
      },
      actions: [
        {
          key: "OPEN_DRY_RUN",
          label: "Открыть dry-run",
          enabled: false,
          tone: "SECONDARY",
          disabledReason: "Дождаться ответа API workspace.",
        },
        {
          key: "QUEUE_BONUS_LEDGER",
          label: "Поставить в ledger",
          enabled: false,
          tone: "SECONDARY",
          disabledReason: "Дождаться ответа API workspace.",
        },
        {
          key: "DRY_RUN_BONUS_LEDGER",
          label: "Dry-run ledger",
          enabled: false,
          tone: "SECONDARY",
          disabledReason: "Дождаться ответа API workspace.",
        },
        {
          key: "DISPATCH_BONUS_LEDGER",
          label: "Canary live dispatch",
          enabled: false,
          tone: "PRIMARY",
          disabledReason: "Дождаться ответа API workspace.",
        },
        {
          key: "RECONCILE_BALANCE",
          label: "Открыть сверку",
          enabled: false,
          tone: "SECONDARY",
          disabledReason: "Дождаться ответа API workspace.",
        },
      ],
      blockers: [],
      safeguards: [
        "Пилотные гейты появятся после ответа API workspace.",
      ],
      nextAction: "Дождаться ответа API workspace.",
      note: "Пилотный режим безопасно заблокирован до загрузки данных.",
    },
    note: "Пилотный чек-лист появится после ответа API workspace.",
  },
  bonusLedgerAudit: {
    summary: {
      total: 0,
      pending: 0,
      processing: 0,
      confirmed: 0,
      failed: 0,
      canceled: 0,
      retryReady: 0,
      reconciliationPending: 0,
      reconciliationMismatch: 0,
      amountPending: 0,
      amountConfirmed: 0,
      amountFailed: 0,
      latestConfirmedAt: null,
    },
    items: [],
    note: "Журнал bonus ledger появится после ответа API workspace.",
  },
  bonusBalanceCurrentReconciliation: {
    summary: {
      totalCurrent: 0,
      matched: 0,
      mismatched: 0,
      waitingSync: 0,
      noSnapshot: 0,
      ledgerBacked: 0,
      snapshotBacked: 0,
      amountCurrent: 0,
      amountSnapshot: 0,
      diffTotal: 0,
      latestCurrentAt: null,
      latestSnapshotAt: null,
    },
    items: [],
    note: "Сверка текущего бонусного баланса появится после ответа API workspace.",
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
    botConsumer: {
      mode: "BLOCKED",
      modeLabel: "нужна настройка",
      dryRun: true,
      configured: false,
      limit: 10,
      canaryLimit: false,
      canaryRequired: false,
      channels: ["TELEGRAM"],
      requiredEnv: [
        "GUEST_GAME_BOT_CONSUMER_SYNC_TOKEN or SYNC_SERVICE_TOKEN",
        "GUEST_GAME_BOT_CONSUMER_TENANT_ID or GUEST_GAME_BOT_CONSUMER_TENANT_SLUG",
      ],
      runbook: {
        label: "Runbook VDS",
        path: "docs/deployment/systemd/README.md",
        href: "https://github.com/boozik3412/leetplus/tree/main/docs/deployment/systemd",
      },
      pendingReady: 0,
      pendingTelegram: 0,
      pendingMax: 0,
      sentAck: 0,
      failedAck: 0,
      blockedAck: 0,
      lastAckAt: null,
      preview: [],
      nextAction: "Настроить env внешнего bot-consumer и запустить dry-run.",
      note: "Статус bot-consumer появится после ответа API workspace.",
    },
    items: [],
    note: "Outbox появится после подготовки выдачи из очереди наград.",
  },
  profiles: [],
  lootBoxes: [],
  missions: [],
  seasons: [],
  promoCards: [],
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
      lastSuccessfulSync: null,
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
            isPlatformAdmin: user.isPlatformAdmin,
          }}
        />
      </div>
    </main>
  );
}
