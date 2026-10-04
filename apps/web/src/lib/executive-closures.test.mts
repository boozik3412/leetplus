import assert from "node:assert/strict";
import test from "node:test";
import {
  addDays,
  clubClosure,
  closeClubHref,
  closedClubIds,
  closedDaysIn,
  closedThroughout,
  closureCoversDay,
  closureOnDay,
  dayCount,
  reopenClubHref,
} from "./executive-closures.ts";
import { formatClosure } from "./executive-format.ts";

const closure = (
  storeId: string,
  closedFrom: string,
  reopenedOn: string | null,
  closedDays = 1,
  reason: string | null = null,
) => ({
  storeId,
  storeName: storeId,
  closedFrom,
  reopenedOn,
  reason,
  closedDays,
  previousClosedDays: 0,
  periodDays: 7,
});
const summary = (...closures: Array<ReturnType<typeof closure>>) =>
  ({ closures }) as never;

test("closure days are the half-open interval [closedFrom, reopenedOn)", () => {
  const ended = closure("kh", "2026-09-25", "2026-09-28");
  assert.equal(closureCoversDay(ended, "2026-09-25"), true);
  assert.equal(closureCoversDay(ended, "2026-09-27"), true);
  assert.equal(closureCoversDay(ended, "2026-09-28"), false);
  assert.equal(closureCoversDay(ended, "2026-09-24"), false);
  assert.equal(
    closureCoversDay(closure("kh", "2026-09-29", null), "2030-01-01"),
    true,
  );
});

test("closed days are counted per club inside a range", () => {
  const data = summary(
    closure("kh", "2026-09-29", null),
    closure("ra", "2026-09-10", "2026-09-12"),
    closure("ra", "2026-09-27", "2026-09-29"),
  );
  assert.equal(closedDaysIn(data, "kh", "2026-09-23", "2026-09-29"), 1);
  assert.equal(closedDaysIn(data, "kh", "2026-09-30", "2026-10-06"), 7);
  assert.equal(closedDaysIn(data, "ra", "2026-09-01", "2026-09-30"), 4);
  assert.equal(closedDaysIn(data, "pu", "2026-09-01", "2026-09-30"), 0);
  assert.equal(closedDaysIn({} as never, "kh", "2026-09-23", "2026-09-29"), 0);
});

test("a club is closed throughout only when every day of the range is covered", () => {
  const data = summary(closure("kh", "2026-09-29", null));
  assert.equal(closedThroughout(data, "kh", "2026-09-29", "2026-09-29"), true);
  assert.equal(closedThroughout(data, "kh", "2026-09-29", "2026-10-03"), true);
  assert.equal(closedThroughout(data, "kh", "2026-09-28", "2026-09-29"), false);
  assert.equal(closedThroughout(data, "kh", "2026-09-30", "2026-09-29"), false);
  assert.equal(closureOnDay(data, "kh", "2026-09-30")?.storeId, "kh");
  assert.equal(closureOnDay(data, "kh", "2026-09-28"), null);
});

test("closed clubs and the latest closure of a club", () => {
  const data = summary(
    closure("kh", "2026-09-01", "2026-09-03"),
    closure("kh", "2026-09-29", null),
    closure("ra", "2026-09-20", "2026-09-22", 0),
  );
  assert.deepEqual([...closedClubIds(data)], ["kh"]);
  assert.equal(clubClosure(data, "kh")?.closedFrom, "2026-09-29");
  assert.equal(clubClosure(data, "ra"), null);
});

test("day helpers and the links that prefill the closure form", () => {
  assert.equal(dayCount("2026-09-23", "2026-09-29"), 7);
  assert.equal(dayCount("2026-09-29", "2026-09-23"), 0);
  assert.equal(addDays("2026-09-30", 1), "2026-10-01");
  assert.equal(
    closeClubHref("kh-1", "2026-09-29"),
    "/stores?closeClub=kh-1&closedFrom=2026-09-29#club-kh-1",
  );
  assert.equal(
    reopenClubHref("kh-1", "2026-10-03"),
    "/stores?reopenClub=kh-1&reopenedOn=2026-10-03#club-kh-1",
  );
});

test("closure text names the first closed day, the reopening and the reason", () => {
  assert.equal(
    formatClosure(closure("kh", "2026-09-29", null)),
    "Клуб закрыт с 29.09",
  );
  assert.equal(
    formatClosure(closure("kh", "2026-09-25", "2026-09-28", 3, "ремонт")),
    "Клуб закрыт с 25.09, открыт 28.09 · ремонт",
  );
});
