import type { AuthUser } from "./auth";
import { canManageUserAccess } from "./roles";

export type Capability =
  | "view_dashboard"
  | "view_reports"
  | "view_guests"
  | "view_guest_gamification"
  | "manage_guest_game_rules"
  | "approve_guest_game_rewards"
  | "view_guest_game_pii"
  | "view_marketing"
  | "view_communications"
  | "view_staff"
  | "edit_staff_knowledge"
  | "review_staff_knowledge"
  | "publish_staff_knowledge"
  | "manage_users"
  | "manage_integrations"
  | "run_sync"
  | "import_data"
  | "use_utilities"
  | "edit_products"
  | "edit_catalog"
  | "edit_stores";

export type CapabilityOption = {
  key: Capability;
  label: string;
  description: string;
};

export const capabilityOptions: CapabilityOption[] = [
  {
    key: "view_dashboard",
    label: "Дашборд",
    description: "Сводный дашборд сети и управленческие сигналы.",
  },
  {
    key: "view_reports",
    label: "Отчеты и ассортимент",
    description:
      "Отчеты, ассортиментный блок, матрица, рекомендации и товарные таблицы.",
  },
  {
    key: "view_guests",
    label: "Гости и CRM",
    description:
      "Гостевая аналитика, CRM, группы, задачи контакта и карточки гостей.",
  },
  {
    key: "view_guest_gamification",
    label: "Геймификация: просмотр",
    description:
      "Просмотр Guest Game Hub, профилей, правил, событий и очереди наград.",
  },
  {
    key: "manage_guest_game_rules",
    label: "Геймификация: правила",
    description:
      "Создание и изменение лутбоксов, миссий, Battle Pass и запуск внутренних событий.",
  },
  {
    key: "approve_guest_game_rewards",
    label: "Геймификация: награды",
    description:
      "Создание, подтверждение, экспорт и кассирское погашение наград гостей.",
  },
  {
    key: "view_guest_game_pii",
    label: "Геймификация: ПДн",
    description:
      "Доступ к чувствительным данным гостя в игровых сценариях, когда они появятся в интерфейсе.",
  },
  {
    key: "view_marketing",
    label: "Маркетинг",
    description: "Кампании, промо-механики, промо-наборы и оценка эффекта.",
  },
  {
    key: "view_communications",
    label: "Коммуникации",
    description:
      "Обзор коммуникаций, командный чат и внутренние уведомления без общего доступа к персоналу.",
  },
  {
    key: "view_staff",
    label: "Персонал",
    description: "Задачи, регламенты, чек-листы и контроль администраторов.",
  },
  {
    key: "edit_staff_knowledge",
    label: "База знаний: черновики",
    description:
      "Создание и редактирование черновиков базы знаний, материалов и связей.",
  },
  {
    key: "review_staff_knowledge",
    label: "База знаний: согласование",
    description:
      "Проверка материалов базы знаний и возврат на доработку до публикации.",
  },
  {
    key: "publish_staff_knowledge",
    label: "База знаний: публикация",
    description:
      "Публикация и архивирование материалов базы знаний с созданием версии.",
  },
  {
    key: "manage_users",
    label: "Пользователи и роли",
    description:
      "Создание учетных записей, назначение ролей и настройка доступов.",
  },
  {
    key: "manage_integrations",
    label: "Настройки Langame",
    description: "Настройка API-ключей, доменов и источников Langame.",
  },
  {
    key: "run_sync",
    label: "Синхронизация",
    description:
      "Запуск ручной синхронизации данных и просмотр статусов загрузки.",
  },
  {
    key: "import_data",
    label: "Импорт данных",
    description: "Ручной импорт товаров, остатков, продаж и движений.",
  },
  {
    key: "use_utilities",
    label: "Утилиты",
    description: "Парсинг, нормализация и служебные инструменты ассортимента.",
  },
  {
    key: "edit_products",
    label: "Редактирование товаров",
    description: "Создание и изменение товарных карточек.",
  },
  {
    key: "edit_catalog",
    label: "Справочники",
    description: "Категории, поставщики и ассортиментные справочники.",
  },
  {
    key: "edit_stores",
    label: "Клубы",
    description: "Создание и изменение клубов сети.",
  },
];

const roleCapabilities: Record<AuthUser["role"], Capability[]> = {
  OWNER: [
    "view_dashboard",
    "view_reports",
    "view_guests",
    "view_guest_gamification",
    "manage_guest_game_rules",
    "approve_guest_game_rewards",
    "view_guest_game_pii",
    "view_marketing",
    "view_communications",
    "view_staff",
    "edit_staff_knowledge",
    "review_staff_knowledge",
    "publish_staff_knowledge",
    "manage_users",
    "manage_integrations",
    "run_sync",
    "import_data",
    "use_utilities",
    "edit_products",
    "edit_catalog",
    "edit_stores",
  ],
  ADMIN: [
    "view_dashboard",
    "view_reports",
    "view_guests",
    "view_guest_gamification",
    "manage_guest_game_rules",
    "approve_guest_game_rewards",
    "view_guest_game_pii",
    "view_marketing",
    "view_communications",
    "view_staff",
    "edit_staff_knowledge",
    "review_staff_knowledge",
    "publish_staff_knowledge",
    "manage_users",
    "manage_integrations",
    "run_sync",
    "import_data",
    "use_utilities",
    "edit_products",
    "edit_catalog",
    "edit_stores",
  ],
  MANAGER: [
    "view_dashboard",
    "view_reports",
    "view_guests",
    "view_guest_gamification",
    "manage_guest_game_rules",
    "approve_guest_game_rewards",
    "view_guest_game_pii",
    "view_marketing",
    "view_communications",
    "view_staff",
    "edit_staff_knowledge",
    "review_staff_knowledge",
    "publish_staff_knowledge",
    "import_data",
    "use_utilities",
    "edit_products",
    "edit_catalog",
    "edit_stores",
  ],
  BUYER: ["view_dashboard", "view_reports", "use_utilities", "edit_products"],
  MARKETER: [
    "view_dashboard",
    "view_reports",
    "view_guests",
    "view_guest_gamification",
    "manage_guest_game_rules",
    "approve_guest_game_rewards",
    "view_marketing",
  ],
  CLUB_MANAGER: [
    "view_dashboard",
    "view_reports",
    "view_guests",
    "view_guest_gamification",
    "manage_guest_game_rules",
    "approve_guest_game_rewards",
    "view_guest_game_pii",
    "view_marketing",
    "view_communications",
    "view_staff",
    "edit_staff_knowledge",
    "review_staff_knowledge",
    "publish_staff_knowledge",
  ],
  STANDARDS_MANAGER: [
    "view_dashboard",
    "view_communications",
    "view_staff",
    "edit_staff_knowledge",
    "review_staff_knowledge",
    "publish_staff_knowledge",
  ],
  SENIOR_ADMINISTRATOR: [
    "view_communications",
    "view_staff",
  ],
  CLUB_ADMINISTRATOR: [
    "view_communications",
    "view_staff",
  ],
};

export function can(user: AuthUser | null, capability: Capability) {
  if (!user) {
    return false;
  }

  if (user.permissions?.includes(capability)) {
    return true;
  }

  if (user.customRoleId) {
    return false;
  }

  return roleCapabilities[user.role].includes(capability);
}

export function canAccessPath(user: AuthUser | null, href: string) {
  if (href === "/dashboard" || href.startsWith("/dashboard/")) {
    return can(user, "view_dashboard");
  }

  if (href === "/admin" || href.startsWith("/administration")) {
    return Boolean(user?.isPlatformAdmin);
  }

  if (href === "/users") {
    return Boolean(user && canManageUserAccess(user.role));
  }

  if (href === "/communications" || href.startsWith("/communications/")) {
    return can(user, "view_communications") || can(user, "view_guests");
  }

  if (href.startsWith("/guests/gamification")) {
    return can(user, "view_guest_gamification");
  }

  if (
    href.startsWith("/staff/team-chat") ||
    href.startsWith("/staff/notifications")
  ) {
    return can(user, "view_communications");
  }

  if (href.startsWith("/staff") || href.startsWith("/guests/staff-control")) {
    return can(user, "view_staff");
  }

  if (href.startsWith("/marketing")) {
    return can(user, "view_marketing");
  }

  if (href.startsWith("/guests")) {
    return can(user, "view_guests");
  }

  if (href.startsWith("/categories") || href.startsWith("/suppliers")) {
    return can(user, "view_reports") || can(user, "edit_catalog");
  }

  if (href.startsWith("/stores")) {
    return can(user, "view_reports") || can(user, "edit_stores");
  }

  if (href.startsWith("/products")) {
    return can(user, "view_reports") || can(user, "edit_products");
  }

  if (href.startsWith("/assortment") || href.startsWith("/reports")) {
    return (
      can(user, "view_reports") ||
      can(user, "edit_products") ||
      can(user, "edit_catalog") ||
      can(user, "edit_stores")
    );
  }

  if (href === "/settings") {
    return can(user, "manage_integrations");
  }

  if (href === "/sync") {
    return can(user, "run_sync");
  }

  if (href === "/import") {
    return can(user, "import_data");
  }

  if (href === "/utilities") {
    return can(user, "use_utilities");
  }

  return true;
}
