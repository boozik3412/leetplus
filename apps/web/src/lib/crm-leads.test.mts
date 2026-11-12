import assert from "node:assert/strict";
import test from "node:test";
import {
  formatRuPhone,
  LEAD_STAGE_COLUMNS,
  newLeadPayload,
  normalizeRuPhone,
  sortLeadsForBoard,
  validateNewLead,
} from "./crm-leads.ts";

test("the board has five stages in deal order", () => {
  assert.deepEqual(
    LEAD_STAGE_COLUMNS.map((column) => column.label),
    ["Новая", "В работе", "Договорились", "Пришёл", "Отказ"],
  );
});

test("Russian phones are accepted with 8, +7 or without the code", () => {
  assert.equal(normalizeRuPhone("8 (900) 123-45-67"), "79001234567");
  assert.equal(normalizeRuPhone("+7 900 123 45 67"), "79001234567");
  assert.equal(normalizeRuPhone("9001234567"), "79001234567");
  assert.equal(normalizeRuPhone("123"), null);
  assert.equal(formatRuPhone("+79165551234"), "+7 916 555-12-34");
  assert.equal(formatRuPhone("телефон скрыт"), "телефон скрыт");
});

test("a new lead needs a name, a phone and what the guest wants", () => {
  const errors = validateNewLead({
    fullName: " ",
    phone: "12",
    eventName: "",
    visitDate: "",
    assignedToUserId: "",
  });

  assert.deepEqual(Object.keys(errors).sort(), [
    "eventName",
    "fullName",
    "phone",
  ]);
  assert.match(errors.phone ?? "", /\+7/u);
});

test("the payload normalizes the phone and keeps the visit day", () => {
  assert.deepEqual(
    newLeadPayload({
      fullName: " Иван ",
      phone: "8 900 123-45-67",
      eventName: "Бронь на 5 мест",
      visitDate: "2026-11-14",
      assignedToUserId: "",
    }),
    {
      fullName: "Иван",
      phone: "+79001234567",
      eventName: "Бронь на 5 мест",
      visitAt: "2026-11-14",
      assignedToUserId: null,
      stage: "NEW",
    },
  );
});

test("leads with a visit date come first, soonest on top", () => {
  const lead = (id: string, visitAt: string | null, updatedAt: string) =>
    ({ id, visitAt, updatedAt }) as never;
  const sorted = sortLeadsForBoard([
    lead("old", null, "2026-11-01"),
    lead("later", "2026-11-20", "2026-11-01"),
    lead("new", null, "2026-11-10"),
    lead("soon", "2026-11-13", "2026-11-01"),
  ]);

  assert.deepEqual(
    sorted.map((item: { id: string }) => item.id),
    ["soon", "later", "new", "old"],
  );
});
