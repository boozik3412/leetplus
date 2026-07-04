import type { AuthUser } from "./auth";
import { isCommunicationChatOnlyRole } from "./landing";
import { canManageUserAccess } from "./roles";

export type Capability =
  | "view_dashboard"
  | "view_reports"
  | "view_assortment_reports"
  | "export_reports"
  | "manage_assortment_reports"
  | "view_assortment_products"
  | "view_assortment_catalog"
  | "view_assortment_stores"
  | "view_guests"
  | "export_guests"
  | "manage_guest_crm"
  | "view_guest_gamification"
  | "manage_guest_game_rules"
  | "approve_guest_game_rewards"
  | "view_guest_game_pii"
  | "view_marketing"
  | "manage_marketing"
  | "view_communications"
  | "manage_communications"
  | "view_staff"
  | "view_staff_shift_workspace"
  | "view_staff_tasks"
  | "manage_staff_tasks"
  | "view_staff_standards"
  | "manage_staff_standards"
  | "view_staff_training"
  | "manage_staff_training"
  | "view_staff_knowledge"
  | "view_staff_control"
  | "manage_staff_control"
  | "view_staff_directory"
  | "manage_staff_directory"
  | "view_staff_salary"
  | "manage_staff_salary"
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

export const staffSectionCapabilities: Capability[] = [
  "view_staff_shift_workspace",
  "view_staff_tasks",
  "view_staff_standards",
  "view_staff_training",
  "view_staff_knowledge",
  "view_staff_control",
  "view_staff_directory",
  "view_staff_salary",
];

export const assortmentSectionCapabilities: Capability[] = [
  "view_assortment_reports",
  "view_assortment_products",
  "view_assortment_catalog",
  "view_assortment_stores",
];

const reportActionCapabilities: Capability[] = [
  "export_reports",
  "manage_assortment_reports",
];

const guestActionCapabilities: Capability[] = [
  "export_guests",
  "manage_guest_crm",
];

const staffKnowledgeWriteCapabilities: Capability[] = [
  "edit_staff_knowledge",
  "review_staff_knowledge",
  "publish_staff_knowledge",
];

const staffActionCapabilities: Capability[] = [
  "manage_staff_tasks",
  "manage_staff_standards",
  "manage_staff_training",
  "manage_staff_control",
  "manage_staff_directory",
  "manage_staff_salary",
];

const productEditCapabilities: Capability[] = [
  "edit_products",
  "edit_catalog",
  "edit_stores",
];

const parentCapabilityChildren: Partial<Record<Capability, Capability[]>> = {
  view_reports: assortmentSectionCapabilities,
  view_staff: staffSectionCapabilities,
  view_staff_knowledge: [],
  view_assortment_products: [],
  view_assortment_catalog: [],
  view_assortment_stores: [],
};

const requestedCapabilityAlternatives: Partial<
  Record<Capability, Capability[]>
> = {
  view_reports: [...assortmentSectionCapabilities, ...reportActionCapabilities],
  view_assortment_reports: reportActionCapabilities,
  view_assortment_products: ["edit_products"],
  view_assortment_catalog: ["edit_catalog"],
  view_assortment_stores: ["edit_stores"],
  view_guests: guestActionCapabilities,
  view_marketing: ["manage_marketing"],
  view_communications: ["manage_communications"],
  view_staff: [...staffSectionCapabilities, ...staffActionCapabilities],
  view_staff_tasks: ["manage_staff_tasks"],
  view_staff_standards: ["manage_staff_standards"],
  view_staff_training: ["manage_staff_training"],
  view_staff_knowledge: staffKnowledgeWriteCapabilities,
  view_staff_control: ["manage_staff_control"],
  view_staff_directory: ["manage_staff_directory"],
  view_staff_salary: ["manage_staff_salary"],
};

export const capabilityOptions: CapabilityOption[] = [
  {
    key: "view_dashboard",
    label: "Дашборд",
    description: "Сводный дашборд сети и управленческие сигналы.",
  },
  {
    key: "view_reports",
    label: "Отчеты и ассортимент: весь блок",
    description:
      "Широкий доступ ко всем отчетам, ассортиментным сценариям и товарным таблицам.",
  },
  {
    key: "view_assortment_reports",
    label: "Коммерческие отчеты",
    description:
      "OOS, деньги в риске, рекомендации, матрица, план-факт и другие отчеты.",
  },
  {
    key: "export_reports",
    label: "Отчеты: экспорт",
    description:
      "Выгрузка коммерческих отчетов, экспорт сводок и отправка отчетов по email.",
  },
  {
    key: "manage_assortment_reports",
    label: "Отчеты: действия",
    description:
      "Изменение статусов рекомендаций, исключений и других управленческих действий в отчетах.",
  },
  {
    key: "view_assortment_products",
    label: "Товары и SKU",
    description:
      "Просмотр товарных карточек, остатков, продаж и ассортиментных связей.",
  },
  {
    key: "view_assortment_catalog",
    label: "Каталог и справочники",
    description: "Просмотр категорий, поставщиков и справочников ассортимента.",
  },
  {
    key: "view_assortment_stores",
    label: "Клубы сети",
    description: "Просмотр клубов, привязок и сетевого контура.",
  },
  {
    key: "view_guests",
    label: "Гости и CRM",
    description:
      "Гостевая аналитика, CRM, группы, задачи контакта и карточки гостей.",
  },
  {
    key: "export_guests",
    label: "Гости и CRM: экспорт",
    description:
      "Выгрузка гостевых отчетов и чувствительных клиентских списков внутри своей сети.",
  },
  {
    key: "manage_guest_crm",
    label: "Гости и CRM: действия",
    description:
      "Создание и изменение CRM-задач, групп, сегментов, статусов и рабочих заметок гостей.",
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
    key: "manage_marketing",
    label: "Маркетинг: действия",
    description:
      "Создание, запуск и изменение кампаний, промо-наборов, миссий и маркетинговых правил.",
  },
  {
    key: "view_communications",
    label: "Коммуникации",
    description:
      "Обзор коммуникаций, командный чат и внутренние уведомления без общего доступа к персоналу.",
  },
  {
    key: "manage_communications",
    label: "Коммуникации: действия",
    description:
      "Отправка сообщений, создание каналов, закрепление, отметки прочтения и задачи из чата.",
  },
  {
    key: "view_staff",
    label: "Персонал: весь блок",
    description:
      "Широкий доступ к задачам, стандартам, обучению, контролю и справочникам персонала.",
  },
  {
    key: "view_staff_shift_workspace",
    label: "Персонал: рабочее место смены",
    description:
      "Тайминг смены, сменные регламенты, личные задачи и рабочий экран администратора.",
  },
  {
    key: "view_staff_tasks",
    label: "Персонал: задачи и правила",
    description: "Задачи персонала, правила повторения и шаблоны задач.",
  },
  {
    key: "manage_staff_tasks",
    label: "Персонал: действия с задачами",
    description:
      "Создание, изменение, запуск правил и закрытие задач персонала.",
  },
  {
    key: "view_staff_standards",
    label: "Персонал: регламенты и чек-листы",
    description:
      "Регламенты смен, чек-листы, шаблоны чек-листов и вложения стандартов.",
  },
  {
    key: "manage_staff_standards",
    label: "Персонал: действия со стандартами",
    description:
      "Создание, публикация и корректировка регламентов, чек-листов, шаблонов и вложений.",
  },
  {
    key: "view_staff_training",
    label: "Персонал: обучение и аттестация",
    description:
      "Курсы, адаптация, аттестации, профили обучения и отчеты готовности.",
  },
  {
    key: "manage_staff_training",
    label: "Персонал: действия с обучением",
    description:
      "Создание и изменение курсов, маршрутов адаптации, аттестаций и результатов обучения.",
  },
  {
    key: "view_staff_knowledge",
    label: "Персонал: база знаний",
    description: "Просмотр разрешенных материалов базы знаний.",
  },
  {
    key: "view_staff_control",
    label: "Персонал: контроль администраторов",
    description:
      "Операционный дашборд, рейтинги, предупреждения, штрафы и контроль выполнения.",
  },
  {
    key: "manage_staff_control",
    label: "Персонал: действия контроля",
    description:
      "Создание предупреждений, штрафов, задач контроля и служебных корректировок по администраторам.",
  },
  {
    key: "view_staff_directory",
    label: "Персонал: сотрудники",
    description: "Справочник сотрудников и карточки администраторов.",
  },
  {
    key: "manage_staff_directory",
    label: "Персонал: изменение сотрудников",
    description:
      "Создание и изменение карточек сотрудников, привязок к клубам и учетным записям.",
  },
  {
    key: "view_staff_salary",
    label: "Персонал: расчет зарплаты",
    description: "Оклады, премии, штрафы и расчет выплат администраторам.",
  },
  {
    key: "manage_staff_salary",
    label: "Персонал: изменение расчета зарплаты",
    description:
      "Создание схем оплаты, премий, штрафов и расчетов выплат администраторам.",
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
    label: "Редактирование справочников",
    description: "Создание и изменение категорий, поставщиков и справочников.",
  },
  {
    key: "edit_stores",
    label: "Редактирование клубов",
    description: "Создание и изменение клубов сети.",
  },
];

const validCapabilities = new Set<Capability>(
  capabilityOptions.map((capability) => capability.key),
);

const staffSalaryRoles = new Set<AuthUser["role"]>([
  "OWNER",
  "ADMIN",
  "MANAGER",
  "STANDARDS_MANAGER",
]);

const ownerStaffCapabilities: Capability[] = [
  "view_staff",
  ...staffSectionCapabilities,
  ...staffActionCapabilities,
  ...staffKnowledgeWriteCapabilities,
];

const shiftStaffCapabilities: Capability[] = [
  "view_staff",
  "view_staff_shift_workspace",
  "view_staff_tasks",
  "view_staff_standards",
  "view_staff_training",
  "view_staff_knowledge",
  "manage_staff_tasks",
  "manage_staff_training",
];

const traineeStaffCapabilities: Capability[] = [
  "view_staff_shift_workspace",
  "view_staff_tasks",
  "view_staff_standards",
  "view_staff_training",
  "view_staff_knowledge",
  "manage_staff_training",
];

const standardsManagerStaffCapabilities: Capability[] = [
  "view_staff",
  "view_staff_tasks",
  "view_staff_standards",
  "view_staff_training",
  "view_staff_knowledge",
  "view_staff_control",
  "view_staff_directory",
  "view_staff_salary",
  "manage_staff_salary",
  "manage_staff_tasks",
  "manage_staff_standards",
  "manage_staff_training",
  "manage_staff_control",
  "manage_staff_directory",
  ...staffKnowledgeWriteCapabilities,
];

const roleCapabilities: Record<AuthUser["role"], Capability[]> = {
  OWNER: [
    "view_dashboard",
    "view_reports",
    ...assortmentSectionCapabilities,
    ...reportActionCapabilities,
    "view_guests",
    ...guestActionCapabilities,
    "view_guest_gamification",
    "manage_guest_game_rules",
    "approve_guest_game_rewards",
    "view_guest_game_pii",
    "view_marketing",
    "manage_marketing",
    "view_communications",
    "manage_communications",
    ...ownerStaffCapabilities,
    "manage_users",
    "manage_integrations",
    "run_sync",
    "import_data",
    "use_utilities",
    ...productEditCapabilities,
  ],
  ADMIN: [
    "view_dashboard",
    "view_reports",
    ...assortmentSectionCapabilities,
    ...reportActionCapabilities,
    "view_guests",
    ...guestActionCapabilities,
    "view_guest_gamification",
    "manage_guest_game_rules",
    "approve_guest_game_rewards",
    "view_guest_game_pii",
    "view_marketing",
    "manage_marketing",
    "view_communications",
    "manage_communications",
    ...ownerStaffCapabilities,
    "manage_users",
    "manage_integrations",
    "run_sync",
    "import_data",
    "use_utilities",
    ...productEditCapabilities,
  ],
  MANAGER: [
    "view_dashboard",
    "view_reports",
    ...assortmentSectionCapabilities,
    ...reportActionCapabilities,
    "view_guests",
    ...guestActionCapabilities,
    "view_guest_gamification",
    "manage_guest_game_rules",
    "approve_guest_game_rewards",
    "view_guest_game_pii",
    "view_marketing",
    "manage_marketing",
    "view_communications",
    "manage_communications",
    ...ownerStaffCapabilities,
    "manage_users",
    "import_data",
    "use_utilities",
    ...productEditCapabilities,
  ],
  BUYER: [
    "view_dashboard",
    "view_reports",
    "view_assortment_reports",
    "export_reports",
    "view_assortment_products",
    "view_assortment_catalog",
    "use_utilities",
    "edit_products",
  ],
  MARKETER: [
    "view_dashboard",
    "view_reports",
    "view_assortment_reports",
    "view_guests",
    "manage_guest_crm",
    "view_guest_gamification",
    "manage_guest_game_rules",
    "approve_guest_game_rewards",
    "view_marketing",
    "manage_marketing",
  ],
  CLUB_MANAGER: [
    "view_dashboard",
    "view_reports",
    ...assortmentSectionCapabilities,
    ...reportActionCapabilities,
    "view_guests",
    ...guestActionCapabilities,
    "view_guest_gamification",
    "manage_guest_game_rules",
    "approve_guest_game_rewards",
    "view_guest_game_pii",
    "view_marketing",
    "manage_marketing",
    "view_communications",
    "manage_communications",
    ...ownerStaffCapabilities,
  ],
  STANDARDS_MANAGER: [
    "view_dashboard",
    "view_communications",
    "manage_communications",
    "manage_users",
    ...standardsManagerStaffCapabilities,
  ],
  SENIOR_ADMINISTRATOR: [
    "view_communications",
    "manage_communications",
    "approve_guest_game_rewards",
    ...shiftStaffCapabilities,
  ],
  CLUB_ADMINISTRATOR: [
    "view_communications",
    "manage_communications",
    "approve_guest_game_rewards",
    ...shiftStaffCapabilities,
  ],
  TRAINEE: [
    "view_communications",
    "manage_communications",
    ...traineeStaffCapabilities,
  ],
};

const elevatedKnowledgeCapabilities: Capability[] = [
  "view_staff_knowledge",
  ...staffKnowledgeWriteCapabilities,
];

const minimumRoleCapabilities: Partial<Record<AuthUser["role"], Capability[]>> =
  {
    OWNER: elevatedKnowledgeCapabilities,
    ADMIN: elevatedKnowledgeCapabilities,
    MANAGER: elevatedKnowledgeCapabilities,
    STANDARDS_MANAGER: roleCapabilities.STANDARDS_MANAGER,
  };

function mergeCapabilities(
  ...capabilitySets: Array<readonly Capability[] | null | undefined>
) {
  return Array.from(
    new Set(capabilitySets.flatMap((capabilities) => capabilities ?? [])),
  );
}

const shiftWorkspaceRoles = new Set<AuthUser["role"]>([
  "SENIOR_ADMINISTRATOR",
  "CLUB_ADMINISTRATOR",
  "TRAINEE",
]);

const shiftStaffAllowedPrefixes = [
  "/staff/tasks",
  "/staff/task-rules",
  "/staff/shift-regulations",
  "/staff/checklists",
  "/staff/training-courses",
  "/staff/assessments",
  "/staff/knowledge-base",
  "/staff/shift-workspace",
  "/staff/team-chat",
  "/staff/notifications",
];

const shiftStaffDeniedPrefixes = [
  "/staff/checklists/report",
  "/staff/checklist-templates",
  "/staff/task-templates",
  "/staff/training-profiles",
  "/staff/readiness-report",
  "/staff/operations-dashboard",
  "/staff/administrator-ratings",
  "/staff/discipline",
  "/staff/salary",
  "/staff/directory",
  "/staff/onboarding",
  "/staff/ai-assistant",
];

function capabilityMatches(owned: Capability, requested: Capability) {
  if (owned === requested) {
    return true;
  }

  if (parentCapabilityChildren[owned]?.includes(requested)) {
    return true;
  }

  if (requestedCapabilityAlternatives[requested]?.includes(owned)) {
    return true;
  }

  return false;
}

function getUserPermissions(user: AuthUser) {
  const minimumPermissions = minimumRoleCapabilities[user.role] ?? [];

  if (user.permissions) {
    const userPermissions = user.permissions.filter(
      (permission): permission is Capability =>
        validCapabilities.has(permission as Capability),
    );

    return mergeCapabilities(minimumPermissions, userPermissions);
  }

  return mergeCapabilities(roleCapabilities[user.role] ?? []);
}

export function can(user: AuthUser | null, capability: Capability) {
  if (!user) {
    return false;
  }

  return getUserPermissions(user).some((permission) =>
    capabilityMatches(permission, capability),
  );
}

function isShiftWorkspaceRole(user: AuthUser | null) {
  return Boolean(user && shiftWorkspaceRoles.has(user.role));
}

function isCommunicationChatOnlyUser(user: AuthUser | null) {
  return Boolean(user && isCommunicationChatOnlyRole(user.role));
}

function canAccessStaffSalary(user: AuthUser | null) {
  return Boolean(
    user && staffSalaryRoles.has(user.role) && can(user, "view_staff_salary"),
  );
}

function canAccessOwnDisciplinePath(user: AuthUser | null, href: string) {
  const path = href.split("?")[0]?.split("#")[0] ?? href;

  return Boolean(
    user &&
      path === "/staff/discipline" &&
      (user.role === "SENIOR_ADMINISTRATOR" ||
        user.role === "CLUB_ADMINISTRATOR"),
  );
}

function canAccessShiftStaffPath(href: string) {
  const path = href.split("?")[0]?.split("#")[0] ?? href;

  if (path === "/staff") {
    return true;
  }

  if (shiftStaffDeniedPrefixes.some((prefix) => path.startsWith(prefix))) {
    return false;
  }

  return shiftStaffAllowedPrefixes.some((prefix) => path.startsWith(prefix));
}

function resolveStaffPathCapability(href: string): Capability {
  const path = href.split("?")[0]?.split("#")[0] ?? href;

  if (
    path.startsWith("/staff/staff-control") ||
    path.startsWith("/guests/staff-control")
  ) {
    return "view_staff_control";
  }

  if (
    path.startsWith("/staff/team-chat") ||
    path.startsWith("/staff/notifications")
  ) {
    return "view_communications";
  }

  if (path.startsWith("/staff/shift-workspace")) {
    return "view_staff_shift_workspace";
  }

  if (
    path.startsWith("/staff/tasks") ||
    path.startsWith("/staff/task-rules") ||
    path.startsWith("/staff/task-templates")
  ) {
    return "view_staff_tasks";
  }

  if (
    path.startsWith("/staff/shift-regulations") ||
    path.startsWith("/staff/checklists") ||
    path.startsWith("/staff/checklist-templates") ||
    path.startsWith("/staff/attachments")
  ) {
    return "view_staff_standards";
  }

  if (
    path.startsWith("/staff/training-courses") ||
    path.startsWith("/staff/training-profiles") ||
    path.startsWith("/staff/readiness-report") ||
    path.startsWith("/staff/onboarding") ||
    path.startsWith("/staff/assessments")
  ) {
    return "view_staff_training";
  }

  if (path.startsWith("/staff/knowledge-base")) {
    return "view_staff_knowledge";
  }

  if (
    path.startsWith("/staff/operations-dashboard") ||
    path.startsWith("/staff/administrator-ratings") ||
    path.startsWith("/staff/discipline") ||
    path.startsWith("/staff/ai-assistant")
  ) {
    return "view_staff_control";
  }

  if (path.startsWith("/staff/directory")) {
    return "view_staff_directory";
  }

  if (path.startsWith("/staff/salary")) {
    return "view_staff_salary";
  }

  return "view_staff";
}

export function canAccessPath(user: AuthUser | null, href: string) {
  if (href === "/dashboard" || href.startsWith("/dashboard/")) {
    return can(user, "view_dashboard");
  }

  if (href === "/admin" || href.startsWith("/administration")) {
    return Boolean(user?.isPlatformAdmin);
  }

  if (href === "/users") {
    return Boolean(
      user && canManageUserAccess(user.role) && can(user, "manage_users"),
    );
  }

  if (href === "/communications" || href.startsWith("/communications/")) {
    if (isCommunicationChatOnlyUser(user)) {
      return false;
    }

    return can(user, "view_communications") || can(user, "view_guests");
  }

  if (href.startsWith("/guests/gamification")) {
    return can(user, "view_guest_gamification");
  }

  if (href.startsWith("/staff/team-chat")) {
    return can(user, "view_communications");
  }

  if (href.startsWith("/staff/notifications")) {
    if (isCommunicationChatOnlyUser(user)) {
      return false;
    }

    return can(user, "view_communications");
  }

  if (href.startsWith("/staff/salary")) {
    return canAccessStaffSalary(user);
  }

  if (href.startsWith("/staff") || href.startsWith("/guests/staff-control")) {
    if (canAccessOwnDisciplinePath(user, href)) {
      return true;
    }

    if (isShiftWorkspaceRole(user) && href.startsWith("/staff")) {
      return (
        can(user, resolveStaffPathCapability(href)) &&
        canAccessShiftStaffPath(href)
      );
    }

    return can(user, resolveStaffPathCapability(href));
  }

  if (href.startsWith("/commercial")) {
    return can(user, "view_reports");
  }

  if (href.startsWith("/marketing")) {
    return can(user, "view_marketing");
  }

  if (href.startsWith("/guests")) {
    return can(user, "view_guests");
  }

  if (href.startsWith("/categories") || href.startsWith("/suppliers")) {
    return can(user, "view_assortment_catalog") || can(user, "edit_catalog");
  }

  if (href.startsWith("/stores")) {
    return can(user, "view_assortment_stores") || can(user, "edit_stores");
  }

  if (href.startsWith("/products")) {
    return can(user, "view_assortment_products") || can(user, "edit_products");
  }

  if (href.startsWith("/assortment") || href.startsWith("/reports")) {
    return (
      can(user, "view_assortment_reports") ||
      can(user, "view_assortment_products") ||
      can(user, "view_assortment_catalog") ||
      can(user, "view_assortment_stores") ||
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
