import assert from "node:assert/strict";
import test from "node:test";
import {
  clubToday,
  closureHeadline,
  closurePeriodText,
  closureStatus,
  closuresOfStore,
  validDay,
  type StoreClosure,
} from "./store-closure-state.ts";

const closure = (
  id: string,
  closedFrom: string,
  reopenedOn: string | null,
  storeId = "kh",
): StoreClosure => ({
  id,
  storeId,
  closedFrom,
  reopenedOn,
  reason: null,
  createdAt: "2026-09-30T05:00:00.000Z",
  updatedAt: "2026-09-30T05:00:00.000Z",
});

test("only real calendar days are accepted from the address bar", () => {
  assert.equal(validDay("2026-09-29"), "2026-09-29");
  assert.equal(validDay("2026-02-30"), null);
  assert.equal(validDay("29.09.2026"), null);
  assert.equal(validDay(""), null);
  assert.equal(validDay(undefined), null);
});

test("today is the calendar day in the club's time zone", () => {
  const now = new Date("2026-09-29T21:30:00.000Z");
  assert.equal(clubToday("UTC", now), "2026-09-29");
  assert.equal(clubToday("Europe/Samara", now), "2026-09-30");
  assert.equal(clubToday(null, now), "2026-09-29");
  assert.equal(clubToday("Not/AZone", now), "2026-09-29");
});

test("a club is closed today, has a closure ahead or is open", () => {
  const list = [
    closure("a", "2026-09-01", "2026-09-03"),
    closure("b", "2026-09-29", null),
    closure("c", "2026-10-20", "2026-10-25"),
  ];
  const closed = closureStatus(list, "2026-10-04");
  assert.equal(closed.kind, "CLOSED");
  assert.equal(closed.kind === "CLOSED" && closed.closure.id, "b");
  // The reopening day itself is open.
  assert.equal(
    closureStatus([closure("a", "2026-09-29", "2026-10-04")], "2026-10-04")
      .kind,
    "OPEN",
  );
  assert.equal(closureStatus([list[0], list[2]], "2026-10-04").kind, "PLANNED");
  assert.equal(closureStatus([list[0]], "2026-10-04").kind, "OPEN");
});

test("closures of one club are listed newest first and described by their last closed day", () => {
  const list = [
    closure("a", "2026-09-01", "2026-09-03"),
    closure("b", "2026-09-29", null),
    closure("x", "2026-09-30", null, "ra"),
  ];
  assert.deepEqual(
    closuresOfStore(list, "kh").map((item) => item.id),
    ["b", "a"],
  );
  assert.equal(closurePeriodText(list[0]), "01.09 – 02.09");
  assert.equal(closurePeriodText(list[1]), "29.09 – по сей день");
  assert.equal(closureHeadline({ kind: "OPEN" }), "Клуб работает");
  assert.equal(
    closureHeadline({ kind: "CLOSED", closure: list[1] }),
    "Закрыт с 29.09",
  );
  assert.equal(
    closureHeadline({
      kind: "PLANNED",
      closure: closure("p", "2026-10-20", "2026-10-25"),
    }),
    "Закрытие запланировано с 20.10, откроется 25.10",
  );
});
