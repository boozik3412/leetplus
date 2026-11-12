import type { BoardColumn } from "./board";
import type { GuestCrmLead, GuestCrmLeadStage } from "./guests";

/** Columns of the «Заявки» board, in the order a lead moves through them. */
export const LEAD_STAGE_COLUMNS: BoardColumn<GuestCrmLeadStage>[] = [
  { key: "NEW", label: "Новая", tone: "neutral" },
  { key: "IN_PROGRESS", label: "В работе", tone: "progress" },
  { key: "AGREED", label: "Договорились", tone: "progress" },
  { key: "CAME", label: "Пришёл", tone: "success" },
  { key: "DECLINED", label: "Отказ", tone: "muted" },
];

export const LEAD_STAGE_LABELS: Record<GuestCrmLeadStage, string> =
  Object.fromEntries(
    LEAD_STAGE_COLUMNS.map((column) => [column.key, column.label]),
  ) as Record<GuestCrmLeadStage, string>;

/** Ways staff talked to a guest; same words as the old contact form. */
export const CONTACT_CHANNELS = [
  "Звонок",
  "Мессенджер",
  "Встреча",
  "Email",
  "Другое",
] as const;

export type NewLeadForm = {
  fullName: string;
  phone: string;
  eventName: string;
  /** yyyy-mm-dd from <input type="date">, or empty. */
  visitDate: string;
  assignedToUserId: string;
};

export type NewLeadErrors = Partial<Record<keyof NewLeadForm, string>>;

/** Digits of a Russian phone in the 7XXXXXXXXXX form, or null. */
export function normalizeRuPhone(value: string): string | null {
  const digits = value.replace(/\D/gu, "");

  if (digits.length === 11 && (digits[0] === "7" || digits[0] === "8")) {
    return `7${digits.slice(1)}`;
  }

  if (digits.length === 10 && digits[0] === "9") return `7${digits}`;

  return null;
}

/** «+7 916 555-12-34» for a full Russian number; anything else as is. */
export function formatRuPhone(value: string) {
  const digits = normalizeRuPhone(value);
  if (!digits) return value;

  return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9)}`;
}

export function validateNewLead(form: NewLeadForm): NewLeadErrors {
  const errors: NewLeadErrors = {};

  if (!form.fullName.trim()) errors.fullName = "Введите имя гостя.";

  if (!normalizeRuPhone(form.phone)) {
    errors.phone = "Введите телефон в формате +7 900 000-00-00.";
  }

  if (!form.eventName.trim()) {
    errors.eventName =
      "Напишите, что хочет гость: бронь, день рождения, турнир.";
  }

  return errors;
}

/** Body for POST /api/guests/crm/leads. The API takes the date as YYYY-MM-DD. */
export function newLeadPayload(form: NewLeadForm) {
  return {
    fullName: form.fullName.trim(),
    phone: `+${normalizeRuPhone(form.phone)}`,
    eventName: form.eventName.trim(),
    visitAt: form.visitDate || null,
    assignedToUserId: form.assignedToUserId || null,
    stage: "NEW" as const,
  };
}

/** Leads with a visit date come first (soonest on top), then the newest. */
export function sortLeadsForBoard(leads: readonly GuestCrmLead[]) {
  return leads.slice().sort((left, right) => {
    if (left.visitAt && right.visitAt) {
      return left.visitAt.localeCompare(right.visitAt);
    }
    if (left.visitAt) return -1;
    if (right.visitAt) return 1;
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}
