import assert from "node:assert/strict";
import test from "node:test";
import {
  langameClubConnections,
  langameConnectionVerdict,
} from "./langame-connections.ts";

const source = (
  id: string,
  domain: string,
  lastSyncedAt: string | null,
  isActive = true,
) => ({
  id,
  name: domain,
  domain,
  baseUrl: `https://${domain}`,
  isActive,
  lastSyncedAt,
  lastSyncedDate: null,
});

const job = (
  domain: string,
  status: "SUCCESS" | "PARTIAL" | "FAILED",
  startedAt: string,
) => ({
  id: `${domain}-${startedAt}`,
  domain,
  status,
  startedAt,
  finishedAt: startedAt,
  storesCount: 1,
  productsCount: 0,
  inventoryCount: 0,
  salesCount: 0,
  discrepancyCount: 0,
  hasDiscrepancyLog: false,
  discrepancyLogStatus: "NOT_REQUIRED" as const,
  discrepancyLogError: null,
  errorMessage: null,
});

const store = (
  id: string,
  name: string,
  integrationSourceId: string | null,
  externalDomain: string | null = null,
) => ({ id, name, integrationSourceId, externalDomain, externalClubId: null });

test("each club shows the latest import of its Langame address", () => {
  const clubs = langameClubConnections({
    stores: [
      store("b", "Север", "src-b"),
      store("a", "Центр", "src-a"),
      store("c", "Юг", null, "south.langame.ru"),
      store("d", "Новый", null),
    ],
    sources: [
      source("src-a", "center.langame.ru", "2026-11-11T05:00:00.000Z"),
      source("src-b", "north.langame.ru", "2026-11-10T05:00:00.000Z"),
      source("src-c", "south.langame.ru", null),
    ],
    syncJobs: [
      job("center.langame.ru", "FAILED", "2026-11-10T01:00:00.000Z"),
      job("center.langame.ru", "SUCCESS", "2026-11-11T01:00:00.000Z"),
      job("north.langame.ru", "PARTIAL", "2026-11-11T01:00:00.000Z"),
    ],
  });

  assert.deepEqual(
    clubs.map((club) => [club.storeName, club.state, club.lastLoadedAt]),
    [
      ["Новый", "NOT_CONNECTED", null],
      ["Север", "PARTIAL", "2026-11-10T05:00:00.000Z"],
      ["Центр", "OK", "2026-11-11T05:00:00.000Z"],
      ["Юг", "WAITING", null],
    ],
  );
  assert.equal(clubs[0].note, "Адрес клуба в Langame не задан.");

  const [unlisted] = langameClubConnections({
    stores: [store("e", "Восток", null, "east.langame.ru")],
    sources: [],
    syncJobs: [],
  });
  assert.equal(unlisted.state, "NOT_CONNECTED");
  assert.equal(
    unlisted.note,
    "Адрес клуба не добавлен в настройки подключения.",
  );
});

test("a switched-off address is not connected", () => {
  const [club] = langameClubConnections({
    stores: [store("a", "Центр", "src-a")],
    sources: [source("src-a", "center.langame.ru", null, false)],
    syncJobs: [],
  });

  assert.equal(club.state, "NOT_CONNECTED");
  assert.equal(club.note, "Адрес клуба в Langame выключен в настройках.");
});

test("the verdict names the missing key first, then the clubs to check", () => {
  assert.equal(langameConnectionVerdict(false, []).tone, "danger");
  assert.equal(
    langameConnectionVerdict(true, []).text,
    "В сети пока нет клубов, подключённых к Langame.",
  );
  const ok = langameClubConnections({
    stores: [store("a", "Центр", "src-a")],
    sources: [source("src-a", "center.langame.ru", "2026-11-11T05:00:00.000Z")],
    syncJobs: [],
  });
  assert.deepEqual(langameConnectionVerdict(true, ok), {
    tone: "good",
    text: "Все клубы подключены, данные приходят.",
  });
  assert.equal(
    langameConnectionVerdict(true, [
      ...ok,
      { ...ok[0], storeId: "b", state: "FAILED" },
    ]).text,
    "Нужна проверка: 1 из 2 клубов.",
  );
});
