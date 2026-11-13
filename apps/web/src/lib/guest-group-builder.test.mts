import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultGuestGroupChoice,
  guestGroupFilters,
  guestGroupFiltersSummary,
  guestGroupName,
  guestGroupSentence,
  guestGroupTemplates,
} from "./guest-group-builder.ts";

const today = new Date("2026-11-13T09:30:00Z");

test("turns a choice into the last three months of the guest list", () => {
  assert.deepEqual(
    guestGroupFilters(
      { template: "lost", storeId: "", onlyConsented: false },
      today,
    ),
    { dateFrom: "2026-08-13", dateTo: "2026-11-13", segment: "lost" },
  );
});

test("adds the club and the consent only when chosen", () => {
  assert.deepEqual(
    guestGroupFilters(
      { template: "one_visit", storeId: "store-1", onlyConsented: true },
      today,
    ),
    {
      dateFrom: "2026-08-13",
      dateTo: "2026-11-13",
      signal: "NEW_WITHOUT_SECOND_VISIT",
      storeId: "store-1",
      consent: "GRANTED",
    },
  );
});

test("«Все гости» adds no segment", () => {
  const filters = guestGroupFilters(
    { ...defaultGuestGroupChoice, template: "all" },
    today,
  );
  assert.equal(filters.segment, undefined);
  assert.equal(filters.signal, undefined);
  assert.equal(filters.rfm, undefined);
});

test("every template has a distinct key and plain texts", () => {
  const keys = new Set(guestGroupTemplates.map((template) => template.key));
  assert.equal(keys.size, guestGroupTemplates.length);
  for (const template of guestGroupTemplates) {
    assert.ok(template.title && template.hint && template.idea, template.key);
  }
});

test("suggests a readable name with the day the list was taken", () => {
  const choice = {
    template: "risk" as const,
    storeId: "s",
    onlyConsented: true,
  };
  assert.equal(
    guestGroupName(choice, "Пушкинская", today),
    "Начали пропадать · Пушкинская · 13.11",
  );
  assert.equal(
    guestGroupName({ ...choice, storeId: "" }, null, today),
    "Начали пропадать · вся сеть · 13.11",
  );
  assert.match(
    guestGroupSentence(choice, "Пушкинская"),
    /в клубе «Пушкинская»/,
  );
  assert.match(guestGroupSentence(choice, null), /согласился получать/);
});

test("describes saved filters in plain words", () => {
  assert.equal(
    guestGroupFiltersSummary(
      {
        segment: "lost",
        storeId: "s1",
        dateFrom: "2026-08-16",
        dateTo: "2026-11-13",
        consent: "GRANTED",
      },
      new Map([["s1", "Пушкинская"]]),
    ),
    "давно не приходили · Пушкинская · 16.08.26–13.11.26 · с согласием",
  );
  assert.equal(guestGroupFiltersSummary({}), "все гости");
  assert.equal(
    guestGroupFiltersSummary({
      signal: "REWARDS_WAITING_CLAIM",
      segment: "top",
    }),
    "ждут награду",
  );
});
