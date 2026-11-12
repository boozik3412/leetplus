import assert from "node:assert/strict";
import test from "node:test";
import {
  clubLiveState,
  clubLiveTotals,
  guestsLabel,
} from "./club-live-summary.ts";

test("counts busy computers and guests of a live club", () => {
  assert.deepEqual(
    clubLiveState({
      status: "LIVE",
      guests: 3,
      pcs: [{ busy: true }, { busy: false }, { busy: true }, null],
    }),
    { status: "LIVE", busy: 2, total: 4, guests: 3 },
  );
});

test("treats a club without Langame or computers as off", () => {
  assert.equal(
    clubLiveState({ status: "NOT_CONNECTED", pcs: [] }).status,
    "OFF",
  );
  assert.equal(clubLiveState({ status: "LIVE", pcs: [] }).status, "OFF");
  assert.equal(clubLiveState(null).status, "OFF");
  assert.equal(clubLiveState({ status: "LIVE", pcs: [{}] }).guests, null);
});

test("sums only live clubs and hides a partial guest count", () => {
  const live = { status: "LIVE" as const, busy: 5, total: 10, guests: 6 };
  const off = { status: "OFF" as const, busy: 0, total: 0, guests: null };
  assert.deepEqual(clubLiveTotals([live, off, { ...live, guests: 2 }]), {
    clubs: 2,
    busy: 10,
    total: 20,
    guests: 8,
  });
  assert.equal(clubLiveTotals([live, { ...live, guests: null }]).guests, null);
  assert.equal(clubLiveTotals([off]).guests, null);
});

test("declines «гость» by number", () => {
  assert.equal(guestsLabel(1), "1 гость");
  assert.equal(guestsLabel(3), "3 гостя");
  assert.equal(guestsLabel(11), "11 гостей");
  assert.equal(guestsLabel(12), "12 гостей");
  assert.equal(guestsLabel(21), "21 гость");
  assert.equal(guestsLabel(58), "58 гостей");
  assert.equal(guestsLabel(0), "0 гостей");
});
