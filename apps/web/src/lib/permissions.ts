import type { AuthUser } from "./auth";

export type Capability =
  | "view_dashboard"
  | "view_reports"
  | "view_guests"
  | "view_marketing"
  | "view_staff"
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
    key: "view_marketing",
    label: "Маркетинг",
    description: "Кампании, промо-механики, промо-наборы и оценка эффекта.",
  },
  {
    key: "view_staff",
    label: "Персонал",
    description: "Задачи, регламенты, чек-листы и контроль администраторов.",
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
    "view_marketing",
    "view_staff",
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
    "view_marketing",
    "view_staff",
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
    "view_marketing",
    "view_staff",
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
    "view_marketing",
  ],
  CLUB_MANAGER: [
    "view_dashboard",
    "view_reports",
    "view_guests",
    "view_marketing",
    "view_staff",
  ],
  STANDARDS_MANAGER: ["view_dashboard", "view_staff"],
  SENIOR_ADMINISTRATOR: ["view_dashboard", "view_staff"],
  CLUB_ADMINISTRATOR: ["view_dashboard", "view_staff"],
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
  if (href === "/admin") {
    return Boolean(user?.isPlatformAdmin);
  }

  if (href === "/users") {
    return can(user, "manage_users");
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
