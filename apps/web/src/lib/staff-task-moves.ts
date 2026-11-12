import type { AuthUser } from "./auth";
import type { StaffTaskStatus } from "./staff-tasks";

/**
 * Who may move a staff task to which status. One source for the status
 * buttons, the board drag and drop and the side panel, so a card can never be
 * dropped where its buttons would not let it go. The API checks the same rules.
 */

export type StaffTaskActor = Pick<AuthUser, "id" | "role" | "isPlatformAdmin">;

export type StaffTaskMoveSubject = {
  status: StaffTaskStatus;
  assignedToUserId: string | null;
  /** «Одна общая» tasks: anyone of these people can take it. */
  candidateUserIds: readonly string[];
};

export type StaffTaskMove = {
  status: StaffTaskStatus;
  label: string;
  variant: "primary" | "secondary";
};

const reviewerRoles = new Set<AuthUser["role"]>([
  "OWNER",
  "ADMIN",
  "MANAGER",
  "CLUB_MANAGER",
  "STANDARDS_MANAGER",
]);
const statusManagerRoles = new Set<AuthUser["role"]>([
  ...reviewerRoles,
  "SENIOR_ADMINISTRATOR",
  "CLUB_ADMINISTRATOR",
]);

function isOwnTask(task: StaffTaskMoveSubject, actor: StaffTaskActor) {
  return (
    task.assignedToUserId === actor.id ||
    task.candidateUserIds.includes(actor.id)
  );
}

function isReviewer(actor: StaffTaskActor) {
  return actor.isPlatformAdmin || reviewerRoles.has(actor.role);
}

export function canMoveStaffTask(
  task: StaffTaskMoveSubject,
  actor: StaffTaskActor,
) {
  return isOwnTask(task, actor) || isReviewer(actor);
}

/** The person who did the task cannot accept it. */
export function canApproveStaffTask(
  task: StaffTaskMoveSubject,
  actor: StaffTaskActor,
) {
  return !isOwnTask(task, actor) && isReviewer(actor);
}

export function canCancelStaffTask(actor: StaffTaskActor) {
  return actor.isPlatformAdmin || statusManagerRoles.has(actor.role);
}

/** Forward moves shown as buttons (without «Отменить»). */
export function staffTaskMoves(
  task: StaffTaskMoveSubject,
  actor: StaffTaskActor,
): StaffTaskMove[] {
  const canMove = canMoveStaffTask(task, actor);

  if (task.status === "OPEN" && canMove) {
    return [{ status: "IN_PROGRESS", label: "В работу", variant: "primary" }];
  }

  if (task.status === "IN_PROGRESS" && canMove) {
    return [{ status: "ON_REVIEW", label: "На проверку", variant: "primary" }];
  }

  if (task.status === "ON_REVIEW") {
    const moves: StaffTaskMove[] = [];

    if (canMove) {
      moves.push({
        status: "IN_PROGRESS",
        label: "Вернуть в работу",
        variant: "secondary",
      });
    }

    if (canApproveStaffTask(task, actor)) {
      moves.push({ status: "DONE", label: "Принять", variant: "primary" });
    }

    return moves;
  }

  return [];
}

/** Every status the task may go to now, «Отменена» included. */
export function allowedStaffTaskTargets(
  task: StaffTaskMoveSubject,
  actor: StaffTaskActor,
): StaffTaskStatus[] {
  const targets = staffTaskMoves(task, actor).map((move) => move.status);
  const isClosed = task.status === "DONE" || task.status === "CANCELED";

  if (!isClosed && canCancelStaffTask(actor)) targets.push("CANCELED");

  return targets;
}

/** Why a card cannot be dropped into a column, in words for the board. */
export function staffTaskMoveRefusal(
  task: StaffTaskMoveSubject,
  to: StaffTaskStatus,
  actor: StaffTaskActor,
): string | null {
  if (allowedStaffTaskTargets(task, actor).includes(to)) return null;

  if (task.status === "DONE" || task.status === "CANCELED") {
    return "Закрытую задачу уже не перенести.";
  }

  if (to === "DONE") {
    if (task.status !== "ON_REVIEW") {
      return "Сначала отправьте задачу на проверку: готовой её отмечает проверяющий.";
    }

    return isOwnTask(task, actor)
      ? "Свою задачу принимает другой сотрудник: руководитель или менеджер."
      : "Принять задачу может руководитель или менеджер по стандартам.";
  }

  if (to === "CANCELED") return "Отменять задачи может только руководитель.";

  if (!canMoveStaffTask(task, actor)) {
    return "Двигать задачу может её ответственный или руководитель.";
  }

  if (to === "OPEN") return "Задачу нельзя вернуть в «Новые».";

  return "Задачи идут по порядку: Новые → В работе → На проверке → Готово.";
}

/** Status changes go through a comment (history) except cancelling. */
export function staffTaskStatusRequest(taskId: string, to: StaffTaskStatus) {
  const id = encodeURIComponent(taskId);

  return to === "CANCELED"
    ? { url: `/api/staff/tasks/${id}`, method: "PATCH" as const }
    : { url: `/api/staff/tasks/${id}/comments`, method: "POST" as const };
}

/** `labels.candidateUserIds` of an «Одна общая» task. */
export function staffTaskCandidateUserIds(labels: unknown): string[] {
  if (!labels || typeof labels !== "object" || Array.isArray(labels)) {
    return [];
  }

  const value = (labels as Record<string, unknown>).candidateUserIds;

  return Array.isArray(value)
    ? value.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      )
    : [];
}
