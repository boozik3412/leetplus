import { UserRole } from '@prisma/client';

export const accessCapabilityCatalog = [
  {
    key: 'view_dashboard',
    label: 'Дашборд',
    description: 'Сводный дашборд сети и управленческие сигналы.',
  },
  {
    key: 'view_reports',
    label: 'Отчеты и ассортимент: весь блок',
    description:
      'Широкий доступ ко всем отчетам, ассортиментным сценариям и товарным таблицам.',
  },
  {
    key: 'view_assortment_reports',
    label: 'Коммерческие отчеты',
    description:
      'OOS, деньги в риске, рекомендации, матрица, план-факт и другие отчеты.',
  },
  {
    key: 'view_assortment_products',
    label: 'Товары и SKU',
    description:
      'Просмотр товарных карточек, остатков, продаж и ассортиментных связей.',
  },
  {
    key: 'view_assortment_catalog',
    label: 'Каталог и справочники',
    description: 'Просмотр категорий, поставщиков и справочников ассортимента.',
  },
  {
    key: 'view_assortment_stores',
    label: 'Клубы сети',
    description: 'Просмотр клубов, привязок и сетевого контура.',
  },
  {
    key: 'view_guests',
    label: 'Гости и CRM',
    description:
      'Гостевая аналитика, CRM, группы, задачи контакта и карточки гостей.',
  },
  {
    key: 'view_guest_gamification',
    label: 'Геймификация: просмотр',
    description:
      'Просмотр Guest Game Hub, профилей, правил, событий и очереди наград.',
  },
  {
    key: 'manage_guest_game_rules',
    label: 'Геймификация: правила',
    description:
      'Создание и изменение лутбоксов, миссий, Battle Pass и запуск внутренних событий.',
  },
  {
    key: 'approve_guest_game_rewards',
    label: 'Геймификация: награды',
    description:
      'Создание, подтверждение, экспорт и кассирское погашение наград гостей.',
  },
  {
    key: 'view_guest_game_pii',
    label: 'Геймификация: ПДн',
    description:
      'Доступ к чувствительным данным гостя в игровых сценариях, когда они появятся в интерфейсе.',
  },
  {
    key: 'view_marketing',
    label: 'Маркетинг',
    description: 'Кампании, промо-механики, промо-наборы и оценка эффекта.',
  },
  {
    key: 'view_communications',
    label: 'Коммуникации',
    description:
      'Обзор коммуникаций, командный чат и внутренние уведомления без общего доступа к персоналу.',
  },
  {
    key: 'view_staff',
    label: 'Персонал: весь блок',
    description:
      'Широкий доступ к задачам, стандартам, обучению, контролю и справочникам персонала.',
  },
  {
    key: 'view_staff_shift_workspace',
    label: 'Персонал: рабочее место смены',
    description:
      'Тайминг смены, сменные регламенты, личные задачи и рабочий экран администратора.',
  },
  {
    key: 'view_staff_tasks',
    label: 'Персонал: задачи и правила',
    description: 'Задачи персонала, правила повторения и шаблоны задач.',
  },
  {
    key: 'view_staff_standards',
    label: 'Персонал: регламенты и чек-листы',
    description:
      'Регламенты смен, чек-листы, шаблоны чек-листов и вложения стандартов.',
  },
  {
    key: 'view_staff_training',
    label: 'Персонал: обучение и аттестация',
    description:
      'Курсы, адаптация, аттестации, профили обучения и отчеты готовности.',
  },
  {
    key: 'view_staff_knowledge',
    label: 'Персонал: база знаний',
    description: 'Просмотр разрешенных материалов базы знаний.',
  },
  {
    key: 'view_staff_control',
    label: 'Персонал: контроль администраторов',
    description:
      'Операционный дашборд, рейтинги, предупреждения, штрафы и контроль выполнения.',
  },
  {
    key: 'view_staff_directory',
    label: 'Персонал: сотрудники',
    description: 'Справочник сотрудников и карточки администраторов.',
  },
  {
    key: 'view_staff_salary',
    label: 'Персонал: зарплата',
    description: 'Оклады, премии, штрафы и расчет выплат администраторам.',
  },
  {
    key: 'edit_staff_knowledge',
    label: 'База знаний: черновики',
    description:
      'Создание и редактирование черновиков базы знаний, материалов и связей.',
  },
  {
    key: 'review_staff_knowledge',
    label: 'База знаний: согласование',
    description:
      'Проверка материалов базы знаний и возврат на доработку до публикации.',
  },
  {
    key: 'publish_staff_knowledge',
    label: 'База знаний: публикация',
    description:
      'Публикация и архивирование материалов базы знаний с созданием версии.',
  },
  {
    key: 'manage_users',
    label: 'Пользователи и роли',
    description:
      'Создание учетных записей, назначение ролей и настройка доступов.',
  },
  {
    key: 'manage_integrations',
    label: 'Настройки Langame',
    description: 'Настройка API-ключей, доменов и источников Langame.',
  },
  {
    key: 'run_sync',
    label: 'Синхронизация',
    description:
      'Запуск ручной синхронизации данных и просмотр статусов загрузки.',
  },
  {
    key: 'import_data',
    label: 'Импорт данных',
    description: 'Ручной импорт товаров, остатков, продаж и движений.',
  },
  {
    key: 'use_utilities',
    label: 'Утилиты',
    description: 'Парсинг, нормализация и служебные инструменты ассортимента.',
  },
  {
    key: 'edit_products',
    label: 'Редактирование товаров',
    description: 'Создание и изменение товарных карточек.',
  },
  {
    key: 'edit_catalog',
    label: 'Редактирование справочников',
    description: 'Создание и изменение категорий, поставщиков и справочников.',
  },
  {
    key: 'edit_stores',
    label: 'Редактирование клубов',
    description: 'Создание и изменение клубов сети.',
  },
] as const;

export type AccessCapability = (typeof accessCapabilityCatalog)[number]['key'];

const validCapabilities = new Set<string>(
  accessCapabilityCatalog.map((capability) => capability.key),
);

const staffSectionCapabilities: AccessCapability[] = [
  'view_staff_shift_workspace',
  'view_staff_tasks',
  'view_staff_standards',
  'view_staff_training',
  'view_staff_knowledge',
  'view_staff_control',
  'view_staff_directory',
  'view_staff_salary',
];

const assortmentSectionCapabilities: AccessCapability[] = [
  'view_assortment_reports',
  'view_assortment_products',
  'view_assortment_catalog',
  'view_assortment_stores',
];

const staffKnowledgeWriteCapabilities: AccessCapability[] = [
  'edit_staff_knowledge',
  'review_staff_knowledge',
  'publish_staff_knowledge',
];

const productEditCapabilities: AccessCapability[] = [
  'edit_products',
  'edit_catalog',
  'edit_stores',
];

const parentCapabilityChildren: Partial<
  Record<AccessCapability, AccessCapability[]>
> = {
  view_reports: assortmentSectionCapabilities,
  view_staff: staffSectionCapabilities,
  view_staff_knowledge: staffKnowledgeWriteCapabilities,
  view_assortment_products: ['edit_products'],
  view_assortment_catalog: ['edit_catalog'],
  view_assortment_stores: ['edit_stores'],
};

const ownerStaffCapabilities: AccessCapability[] = [
  'view_staff',
  ...staffSectionCapabilities,
  ...staffKnowledgeWriteCapabilities,
];

const shiftStaffCapabilities: AccessCapability[] = [
  'view_staff',
  'view_staff_shift_workspace',
  'view_staff_tasks',
  'view_staff_standards',
  'view_staff_training',
  'view_staff_knowledge',
];

const standardsManagerStaffCapabilities: AccessCapability[] = [
  'view_staff',
  'view_staff_tasks',
  'view_staff_standards',
  'view_staff_training',
  'view_staff_knowledge',
  'view_staff_control',
  'view_staff_directory',
  ...staffKnowledgeWriteCapabilities,
];

export const roleCapabilities: Record<UserRole, AccessCapability[]> = {
  [UserRole.OWNER]: [
    'view_dashboard',
    'view_reports',
    ...assortmentSectionCapabilities,
    'view_guests',
    'view_guest_gamification',
    'manage_guest_game_rules',
    'approve_guest_game_rewards',
    'view_guest_game_pii',
    'view_marketing',
    'view_communications',
    ...ownerStaffCapabilities,
    'manage_users',
    'manage_integrations',
    'run_sync',
    'import_data',
    'use_utilities',
    ...productEditCapabilities,
  ],
  [UserRole.ADMIN]: [
    'view_dashboard',
    'view_reports',
    ...assortmentSectionCapabilities,
    'view_guests',
    'view_guest_gamification',
    'manage_guest_game_rules',
    'approve_guest_game_rewards',
    'view_guest_game_pii',
    'view_marketing',
    'view_communications',
    ...ownerStaffCapabilities,
    'manage_users',
    'manage_integrations',
    'run_sync',
    'import_data',
    'use_utilities',
    ...productEditCapabilities,
  ],
  [UserRole.MANAGER]: [
    'view_dashboard',
    'view_reports',
    ...assortmentSectionCapabilities,
    'view_guests',
    'view_guest_gamification',
    'manage_guest_game_rules',
    'approve_guest_game_rewards',
    'view_guest_game_pii',
    'view_marketing',
    'view_communications',
    ...ownerStaffCapabilities,
    'import_data',
    'use_utilities',
    ...productEditCapabilities,
  ],
  [UserRole.BUYER]: [
    'view_dashboard',
    'view_reports',
    'view_assortment_reports',
    'view_assortment_products',
    'view_assortment_catalog',
    'use_utilities',
    'edit_products',
  ],
  [UserRole.MARKETER]: [
    'view_dashboard',
    'view_reports',
    'view_assortment_reports',
    'view_guests',
    'view_guest_gamification',
    'manage_guest_game_rules',
    'approve_guest_game_rewards',
    'view_marketing',
  ],
  [UserRole.CLUB_MANAGER]: [
    'view_dashboard',
    'view_reports',
    ...assortmentSectionCapabilities,
    'view_guests',
    'view_guest_gamification',
    'manage_guest_game_rules',
    'approve_guest_game_rewards',
    'view_guest_game_pii',
    'view_marketing',
    'view_communications',
    ...ownerStaffCapabilities,
  ],
  [UserRole.STANDARDS_MANAGER]: [
    'view_dashboard',
    'view_communications',
    ...standardsManagerStaffCapabilities,
  ],
  [UserRole.SENIOR_ADMINISTRATOR]: [
    'view_communications',
    ...shiftStaffCapabilities,
  ],
  [UserRole.CLUB_ADMINISTRATOR]: [
    'view_communications',
    ...shiftStaffCapabilities,
  ],
};

export function normalizeCapabilities(
  permissions: readonly string[] | null | undefined,
): AccessCapability[] {
  if (!permissions) {
    return [];
  }

  return Array.from(
    new Set(
      permissions.filter((permission): permission is AccessCapability =>
        validCapabilities.has(permission),
      ),
    ),
  );
}

export function resolveUserCapabilities(input: {
  role: UserRole;
  customRole?: { permissions: string[] } | null;
}): AccessCapability[] {
  const customPermissions = normalizeCapabilities(
    input.customRole?.permissions,
  );

  if (input.customRole) {
    return customPermissions;
  }

  return roleCapabilities[input.role] ?? [];
}

function capabilityMatches(
  owned: AccessCapability,
  requested: AccessCapability,
) {
  if (owned === requested) {
    return true;
  }

  if (parentCapabilityChildren[owned]?.includes(requested)) {
    return true;
  }

  if (parentCapabilityChildren[requested]?.includes(owned)) {
    return true;
  }

  return false;
}

export function hasCapability(
  user: { permissions?: AccessCapability[] } | null | undefined,
  capability: AccessCapability,
) {
  return Boolean(
    user?.permissions?.some((permission) =>
      capabilityMatches(permission, capability),
    ),
  );
}

export function hasAnyCapability(
  user: { permissions?: AccessCapability[] } | null | undefined,
  capabilities: AccessCapability[],
) {
  return capabilities.some((capability) => hasCapability(user, capability));
}
