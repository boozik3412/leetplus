import { staffTaskCandidateUserIds } from "./staff-task-moves";
import type {
  StaffTask,
  StaffTaskPriority,
  StaffTaskStatus,
  StaffTaskType,
  StaffTaskUser,
} from "./staff-tasks";

/** Words and formatting shared by the staff task board, list and panel. */

export const staffTaskStatusLabels: Record<StaffTaskStatus, string> = {
  OPEN: "Новая",
  IN_PROGRESS: "В работе",
  ON_REVIEW: "На проверке",
  DONE: "Готово",
  CANCELED: "Отменена",
};

export const staffTaskTypeLabels: Record<StaffTaskType, string> = {
  ONE_TIME: "Разовая",
  SHIFT: "На смену",
  RECURRING: "Повторяемая",
  LONG_TERM: "Долгосрочная",
  PERSONAL: "Личная",
  CLUB: "Для клуба",
  ROLE: "Для роли",
};

export const staffTaskPriorityLabels: Record<StaffTaskPriority, string> = {
  LOW: "Низкая",
  NORMAL: "Обычная",
  HIGH: "Высокая",
  URGENT: "Срочно",
};

/**
 * `timeZone` is for client components: they render UTC on the server and the
 * viewer's own zone after hydration (see LocalDateTime), so both renders match.
 */
export function formatStaffTaskDate(value: string | null, timeZone?: string) {
  if (!value) {
    return "без срока";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

/** «12 нояб., 18:00» for cards, where the year is noise. */
export function formatStaffTaskDue(value: string | null, timeZone?: string) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

export function staffUserLabel(
  user: Pick<StaffTaskUser, "fullName" | "email"> | null | undefined,
) {
  return user?.fullName ?? user?.email ?? null;
}

export function staffTaskObserverLabels(task: StaffTask) {
  return task.observers
    .map((observer) => staffUserLabel(observer.user))
    .filter(Boolean)
    .join(", ");
}

function labelsRecord(task: StaffTask) {
  return task.labels &&
    typeof task.labels === "object" &&
    !Array.isArray(task.labels)
    ? (task.labels as Record<string, unknown>)
    : null;
}

/** The assignee, or «Любой из: …» for a task shared by several people. */
export function staffTaskAssigneeLabel(
  task: StaffTask,
  users: readonly StaffTaskUser[],
) {
  const assigned = staffUserLabel(task.assignedToUser);

  if (assigned) {
    return assigned;
  }

  if (labelsRecord(task)?.assignmentMode !== "ANY_OF") {
    return null;
  }

  const candidates = new Set(staffTaskCandidateUserIds(task.labels));
  const names = users
    .filter((user) => candidates.has(user.id))
    .map((user) => staffUserLabel(user))
    .filter(Boolean);

  if (names.length === 0) {
    return candidates.size > 0 ? `Любой из ${candidates.size}` : null;
  }

  return `Любой из: ${names.join(", ")}`;
}

export function isKnowledgeBaseApprovalTask(task: StaffTask) {
  const labels = labelsRecord(task);

  return (
    labels?.workflow === "KNOWLEDGE_BASE_APPROVAL" ||
    labels?.workflowStep === "RETURNED_ARTICLE_REVISION" ||
    task.title
      .toLocaleLowerCase("ru-RU")
      .startsWith("доработать материал базы знаний:") ||
    Boolean(
      task.description?.includes(
        "Материал возвращен на доработку из базы знаний.",
      ),
    )
  );
}
