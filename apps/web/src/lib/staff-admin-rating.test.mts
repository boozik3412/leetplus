import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_ADMIN_RATING_COUNTS,
  adminRatingCancelUrl,
  adminRatingChips,
  canForgiveAdminRatingItem,
  type AdminRatingItem,
  type AdminRatingView,
} from "./staff-admin-rating.ts";

function item(overrides: Partial<AdminRatingItem> = {}): AdminRatingItem {
  return {
    kind: "TASK_OVERDUE",
    points: -3,
    basePoints: -3,
    title: "Задача «Касса» не сделана в срок",
    detail: null,
    date: null,
    href: null,
    targetId: "task-1",
    forgiven: null,
    decision: null,
    ...overrides,
  };
}

function view(counts: Partial<AdminRatingView["counts"]>): AdminRatingView {
  const check = {
    shifts: 0,
    average: null,
    clubAverage: null,
    deltaPercent: null,
    points: 0,
  };
  return {
    id: "u1",
    user: {
      id: "u1",
      email: "u1@example.test",
      fullName: null,
      role: "CLUB_ADMINISTRATOR",
      stores: [],
    },
    score: 100,
    riskLevel: "LOW",
    items: [],
    counts: { ...EMPTY_ADMIN_RATING_COUNTS, ...counts },
    averageCheck: {
      day: { shiftKind: "DAY", ...check },
      night: { shiftKind: "NIGHT", ...check },
    },
    linkedToLangame: true,
    shiftsTotal: 0,
  };
}

test("only a penalty item that is not forgiven yet can be forgiven", () => {
  assert.equal(canForgiveAdminRatingItem(item()), true);
  assert.equal(
    canForgiveAdminRatingItem(
      item({
        points: 0,
        forgiven: {
          adjustmentId: "a1",
          reason: "Ждали поставку",
          authorName: null,
          at: "2026-11-13T10:00:00.000Z",
        },
      }),
    ),
    false,
  );
  assert.equal(
    canForgiveAdminRatingItem(
      item({ kind: "AVERAGE_CHECK", points: -2, targetId: null }),
    ),
    false,
  );
  assert.equal(
    canForgiveAdminRatingItem(item({ kind: "MANUAL_PENALTY", targetId: null })),
    false,
  );
});

test("chips show reviewer bonuses, penalties and forgiven items", () => {
  assert.deepEqual(
    adminRatingChips(
      view({
        overdueTasks: 1,
        forgiven: 1,
        forgivenPoints: 3,
        bonusPoints: 5,
        penaltyPoints: 2,
      }),
    ),
    [
      { label: "просрочка −3", tone: "minus" },
      { label: "снижение −2", tone: "minus" },
      { label: "поощрение +5", tone: "plus" },
      { label: "прощено 1 · +3", tone: "neutral" },
    ],
  );
  assert.deepEqual(adminRatingChips(view({})), [
    { label: "без замечаний", tone: "neutral" },
  ]);
});

test("cancel URL escapes the decision id", () => {
  assert.equal(
    adminRatingCancelUrl("a/1"),
    "/api/staff/administrator-ratings/adjustments/a%2F1/cancel",
  );
});
