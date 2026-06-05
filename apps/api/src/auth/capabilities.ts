import { UserRole } from '@prisma/client';

export const accessCapabilityCatalog = [
  {
    key: 'view_dashboard',
    label: 'Дашборд',
    description: 'Сводный дашборд сети и управленческие сигналы.',
  },
  {
    key: 'view_reports',
    label: 'Отчеты и ассортимент',
    description:
      'Отчеты, ассортиментный блок, матрица, рекомендации и товарные таблицы.',
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
    label: 'Персонал',
    description: 'Задачи, регламенты, чек-листы и контроль администраторов.',
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
    label: 'Справочники',
    description: 'Категории, поставщики и ассортиментные справочники.',
  },
  {
    key: 'edit_stores',
    label: 'Клубы',
    description: 'Создание и изменение клубов сети.',
  },
] as const;

export type AccessCapability = (typeof accessCapabilityCatalog)[number]['key'];

const validCapabilities = new Set<string>(
  accessCapabilityCatalog.map((capability) => capability.key),
);

export const roleCapabilities: Record<UserRole, AccessCapability[]> = {
  [UserRole.OWNER]: [
    'view_dashboard',
    'view_reports',
    'view_guests',
    'view_guest_gamification',
    'manage_guest_game_rules',
    'approve_guest_game_rewards',
    'view_guest_game_pii',
    'view_marketing',
    'view_communications',
    'view_staff',
    'edit_staff_knowledge',
    'review_staff_knowledge',
    'publish_staff_knowledge',
    'manage_users',
    'manage_integrations',
    'run_sync',
    'import_data',
    'use_utilities',
    'edit_products',
    'edit_catalog',
    'edit_stores',
  ],
  [UserRole.ADMIN]: [
    'view_dashboard',
    'view_reports',
    'view_guests',
    'view_guest_gamification',
    'manage_guest_game_rules',
    'approve_guest_game_rewards',
    'view_guest_game_pii',
    'view_marketing',
    'view_communications',
    'view_staff',
    'edit_staff_knowledge',
    'review_staff_knowledge',
    'publish_staff_knowledge',
    'manage_users',
    'manage_integrations',
    'run_sync',
    'import_data',
    'use_utilities',
    'edit_products',
    'edit_catalog',
    'edit_stores',
  ],
  [UserRole.MANAGER]: [
    'view_dashboard',
    'view_reports',
    'view_guests',
    'view_guest_gamification',
    'manage_guest_game_rules',
    'approve_guest_game_rewards',
    'view_guest_game_pii',
    'view_marketing',
    'view_communications',
    'view_staff',
    'edit_staff_knowledge',
    'review_staff_knowledge',
    'publish_staff_knowledge',
    'import_data',
    'use_utilities',
    'edit_products',
    'edit_catalog',
    'edit_stores',
  ],
  [UserRole.BUYER]: [
    'view_dashboard',
    'view_reports',
    'use_utilities',
    'edit_products',
  ],
  [UserRole.MARKETER]: [
    'view_dashboard',
    'view_reports',
    'view_guests',
    'view_guest_gamification',
    'manage_guest_game_rules',
    'approve_guest_game_rewards',
    'view_marketing',
  ],
  [UserRole.CLUB_MANAGER]: [
    'view_dashboard',
    'view_reports',
    'view_guests',
    'view_guest_gamification',
    'manage_guest_game_rules',
    'approve_guest_game_rewards',
    'view_guest_game_pii',
    'view_marketing',
    'view_communications',
    'view_staff',
    'edit_staff_knowledge',
    'review_staff_knowledge',
    'publish_staff_knowledge',
  ],
  [UserRole.STANDARDS_MANAGER]: [
    'view_dashboard',
    'view_communications',
    'view_staff',
    'edit_staff_knowledge',
    'review_staff_knowledge',
    'publish_staff_knowledge',
  ],
  [UserRole.SENIOR_ADMINISTRATOR]: ['view_communications', 'view_staff'],
  [UserRole.CLUB_ADMINISTRATOR]: ['view_communications', 'view_staff'],
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

export function hasCapability(
  user: { permissions?: AccessCapability[] } | null | undefined,
  capability: AccessCapability,
) {
  return Boolean(user?.permissions?.includes(capability));
}

export function hasAnyCapability(
  user: { permissions?: AccessCapability[] } | null | undefined,
  capabilities: AccessCapability[],
) {
  return capabilities.some((capability) => hasCapability(user, capability));
}
