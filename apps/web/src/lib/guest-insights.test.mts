import assert from "node:assert/strict";
import test from "node:test";
import {
  activeFilterChips,
  deltaLabel,
  deltaTone,
  formatPercent,
  formatRubles,
  guestsExportHref,
  guestsHref,
  hourRangeLabel,
  pluralize,
  signalListFilters,
  guestsWord,
} from "./guest-insights.ts";

test("hrefs keep only known list filters and drop paging from export", () => {
  assert.equal(
    guestsHref({
      dateFrom: "2026-07-01",
      storeId: "s1",
      signal: "VIP_AT_RISK",
      sort: "ltv",
      page: "2",
    }),
    "/guests?dateFrom=2026-07-01&storeId=s1&signal=VIP_AT_RISK&page=2&sort=ltv",
  );
  assert.equal(guestsHref({}), "/guests");
  assert.equal(
    guestsExportHref({ segment: "risk", page: "3", pageSize: "50" }),
    "/api/guests/export?segment=risk",
  );
});

test("signal filters inherit the dashboard scope and reset paging", () => {
  const filters = signalListFilters(
    { dateFrom: "2026-07-01", dateTo: "2026-09-30", storeId: "s1" },
    { signal: "NEW_WITHOUT_SECOND_VISIT", sort: "registered", direction: "asc" },
  );

  assert.deepEqual(filters, {
    dateFrom: "2026-07-01",
    dateTo: "2026-09-30",
    storeId: "s1",
    guestGroupId: undefined,
    signal: "NEW_WITHOUT_SECOND_VISIT",
    sort: "registered",
    direction: "asc",
    page: "1",
    pageSize: "50",
  });
});

test("delta labels and tones follow the metric direction", () => {
  assert.equal(
    deltaLabel({ current: 120, previous: 100, delta: 20, deltaPercent: 20 }),
    "+20 %",
  );
  assert.equal(
    deltaLabel({ current: 5, previous: 0, delta: 5, deltaPercent: null }),
    "+5",
  );
  assert.equal(
    deltaLabel({ current: 0, previous: 0, delta: 0, deltaPercent: null }),
    "без изменений",
  );
  assert.equal(
    deltaTone({ current: 8, previous: 10, delta: -2, deltaPercent: -20 }),
    "danger",
  );
  assert.equal(
    deltaTone(
      { current: 8, previous: 10, delta: -2, deltaPercent: -20 },
      "down-is-good",
    ),
    "good",
  );
});

test("formatters and chips are stable for the dashboard", () => {
  const plainSpaces = (value: string) => value.replace(/[  ]/g, " ");
  assert.equal(plainSpaces(formatRubles(12500.4)), "12 500 ₽");
  assert.equal(formatPercent(null), "—");
  assert.equal(plainSpaces(formatPercent(12.345)), "12,3 %");
  assert.equal(hourRangeLabel(23), "23:00–00:00");
  assert.equal(pluralize(21, guestsWord), "21 гость");
  assert.equal(pluralize(3, guestsWord), "3 гостя");
  assert.equal(pluralize(11, guestsWord), "11 гостей");
  assert.deepEqual(
    activeFilterChips({
      segment: "risk",
      gameStatus: "pending_rewards",
      rfm: "CHAMPION",
    }).map((chip) => chip.key),
    ["segment", "gameStatus", "rfm"],
  );
  assert.deepEqual(activeFilterChips({ segment: "top", gameStatus: "any" }), []);
});
