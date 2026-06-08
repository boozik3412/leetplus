import type { AuthUser } from "./auth";

export type UserRole = AuthUser["role"];

export const roleLabels: Record<UserRole, string> = {
  OWNER: "Владелец",
  ADMIN: "Администратор системы",
  MANAGER: "Управляющий сетью",
  BUYER: "Закупщик",
  MARKETER: "Маркетолог",
  CLUB_MANAGER: "Управляющий клубом",
  STANDARDS_MANAGER: "Менеджер по стандартам",
  SENIOR_ADMINISTRATOR: "Старший администратор",
  CLUB_ADMINISTRATOR: "Администратор клуба",
  TRAINEE: "Стажер",
};

export const roleDescriptions: Record<UserRole, string> = {
  OWNER: "Полный доступ к сети, настройкам, ролям и финансам.",
  ADMIN: "Операционное администрирование LeetPlus без смены владельца.",
  MANAGER: "Дашборды, гости, маркетинг, персонал и ассортиментные отчеты.",
  BUYER: "Ассортимент, товары, поставщики и коммерческие отчеты.",
  MARKETER: "Маркетинг, CRM-группы, кампании и промо-наборы.",
  CLUB_MANAGER: "Операционная работа по выбранным клубам и персоналу.",
  STANDARDS_MANAGER:
    "Обучение, подбор администраторов, регламенты, чек-листы, стандарты работы, контроль администраторов и аттестации.",
  SENIOR_ADMINISTRATOR:
    "Задачи персонала, чеклисты смены и контроль выполнения.",
  CLUB_ADMINISTRATOR:
    "Сменные задачи и чеклисты без лишних управленческих данных.",
  TRAINEE:
    "Рабочее место смены, обучение, база знаний и просмотр сменных материалов без управленческих действий с задачами и стандартами.",
};

export const roleOrder: UserRole[] = [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "CLUB_MANAGER",
  "STANDARDS_MANAGER",
  "MARKETER",
  "BUYER",
  "SENIOR_ADMINISTRATOR",
  "CLUB_ADMINISTRATOR",
  "TRAINEE",
];

const userAccessManagerRoles: UserRole[] = [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "STANDARDS_MANAGER",
];

export function getRoleLabel(role: UserRole) {
  return roleLabels[role] ?? role;
}

export function canManageUserAccess(role: UserRole) {
  return userAccessManagerRoles.includes(role);
}

export function getAssignableRoles(actorRole: UserRole) {
  if (actorRole === "OWNER" || actorRole === "ADMIN") {
    return roleOrder;
  }

  if (actorRole === "MANAGER") {
    return [
      "CLUB_MANAGER",
      "STANDARDS_MANAGER",
      "MARKETER",
      "BUYER",
      "SENIOR_ADMINISTRATOR",
      "CLUB_ADMINISTRATOR",
      "TRAINEE",
    ] satisfies UserRole[];
  }

  if (actorRole === "STANDARDS_MANAGER") {
    return [
      "CLUB_MANAGER",
      "SENIOR_ADMINISTRATOR",
      "CLUB_ADMINISTRATOR",
      "TRAINEE",
    ] satisfies UserRole[];
  }

  return [];
}
