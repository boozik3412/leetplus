import assert from "node:assert/strict";
import test from "node:test";
import {
  guestSyncCompletionMessage,
  guestSyncDisplayStatus,
  observeGuestSync,
} from "./guest-sync-observation.ts";

const running = {
  status: "RUNNING",
  running: true,
  latestRun: { status: "RUNNING", diagnostics: { endpointErrors: {} } },
};
const success = {
  status: "SUCCESS",
  running: false,
  latestRun: { status: "SUCCESS", diagnostics: { endpointErrors: {} } },
};

test("a long background import remains running after the foreground wait", async () => {
  const observed: string[] = [];
  const status = await observeGuestSync({
    fetchStatus: async () => running,
    wait: async () => {},
    attempts: 75,
    onStatus: (value) => observed.push(value.status),
  });
  assert.equal(status, running);
  assert.equal(observed.length, 75);
  assert.equal(guestSyncDisplayStatus(status), "RUNNING");
  assert.match(guestSyncCompletionMessage(status) ?? "", /ещё загружаются/u);
});

test("a terminal status ends observation and keeps the actual run", async () => {
  let reads = 0;
  const status = await observeGuestSync({
    fetchStatus: async () => (++reads === 2 ? success : running),
    wait: async () => {},
    attempts: 75,
  });
  assert.equal(reads, 2);
  assert.equal(status, success);
});

test("an unavailable status is an error and does not become an empty history", async () => {
  let reads = 0;
  const observed: unknown[] = [];
  await assert.rejects(
    observeGuestSync({
      fetchStatus: async () => {
        if (++reads === 2) throw new Error("Status unavailable");
        return running;
      },
      wait: async () => {},
      attempts: 75,
      onStatus: (value) => observed.push(value),
    }),
    /Status unavailable/u,
  );
  assert.deepEqual(observed, [running]);
  assert.equal(guestSyncDisplayStatus(null), "UNKNOWN");
});

test("provider access limits produce a partial result with available data", () => {
  const partial = {
    ...success,
    latestRun: {
      ...success.latestRun,
      diagnostics: {
        endpointErrors: { "guests/bonus_balance": "No permissions" },
      },
    },
  };
  assert.equal(guestSyncDisplayStatus(partial), "PARTIAL");
  assert.match(
    guestSyncCompletionMessage(partial) ?? "",
    /Доступные разделы сохранены/u,
  );
  assert.equal(guestSyncDisplayStatus(success), "SUCCESS");
});

test("a historical guest run with endpoint errors is also shown as partial", () => {
  const historical = {
    status: "SUCCESS",
    running: false,
    latestRun: {
      status: "SUCCESS",
      diagnostics: { endpointErrors: { "guests/logs": "No permissions" } },
    },
  };
  assert.equal(guestSyncDisplayStatus(historical), "PARTIAL");
});
