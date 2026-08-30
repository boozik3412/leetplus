import type {
  StaffChecklistAnswer,
  StaffChecklistStatus,
} from "./staff-checklists";

const statusOnlyChecklistActions = new Set<StaffChecklistStatus>([
  "ACCEPTED",
  "RETURNED",
  "ESCALATED",
  "CANCELED",
]);

export function buildStaffChecklistUpdatePayload(input: {
  status?: StaffChecklistStatus;
  answers: StaffChecklistAnswer[];
  reviewComment: string;
}) {
  const payload: {
    status?: StaffChecklistStatus;
    answers?: StaffChecklistAnswer[];
    reviewComment: string;
  } = {
    status: input.status,
    reviewComment: input.reviewComment,
  };

  if (!input.status || !statusOnlyChecklistActions.has(input.status)) {
    payload.answers = input.answers;
  }

  return payload;
}
