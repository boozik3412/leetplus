import assert from "node:assert/strict";
import test from "node:test";
import {
  faceitStatusText,
  readSteamOpenIdReturn,
  type GuestGameAccounts,
} from "./guest-game-accounts.ts";

test("forwards only the Steam OpenID answer and our state", () => {
  const search =
    "?lpState=v1.abc.def&openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0" +
    "&openid.mode=id_res&openid.claimed_id=https%3A%2F%2Fsteamcommunity.com%2Fopenid%2Fid%2F76561198000000001" +
    "&utm_source=x";

  assert.deepEqual(readSteamOpenIdReturn(search), {
    state: "v1.abc.def",
    openid: {
      "openid.ns": "http://specs.openid.net/auth/2.0",
      "openid.mode": "id_res",
      "openid.claimed_id":
        "https://steamcommunity.com/openid/id/76561198000000001",
    },
  });
});

test("treats a normal visit, a cancel and malformed keys safely", () => {
  assert.equal(readSteamOpenIdReturn(""), null);
  assert.deepEqual(
    readSteamOpenIdReturn("?lpState=v1.a.b&openid.mode=cancel"),
    { state: "v1.a.b", openid: {} },
  );
  assert.equal(
    readSteamOpenIdReturn("?lpState=v1.a.b&openid.mode=id_res&openid.Bad=1"),
    null,
  );
  assert.equal(
    readSteamOpenIdReturn(
      "?lpState=v1.a.b&openid.mode=id_res&openid.mode=id_res",
    ),
    null,
  );
});

test("explains the FACEIT lookup state", () => {
  const base: GuestGameAccounts = {
    enabled: true,
    steam: null,
    faceit: null,
    relinkAvailableAt: null,
  };
  assert.match(faceitStatusText(base), /Привяжите Steam/);
  const linked: GuestGameAccounts = {
    ...base,
    steam: {
      steamId: "76561198000000001",
      nickname: "p",
      avatarUrl: null,
      profileUrl: "https://steamcommunity.com/profiles/76561198000000001",
      linkedAt: "2026-11-09T10:00:00.000Z",
    },
    faceit: {
      status: "FOUND",
      nickname: "Nick",
      level: 7,
      elo: 1450,
      profileUrl: null,
      checkedAt: null,
    },
  };
  assert.equal(faceitStatusText(linked), "Найден: Nick");
  assert.match(
    faceitStatusText({ ...linked, faceit: { ...linked.faceit!, status: "NOT_FOUND" } }),
    /не привязан аккаунт FACEIT/,
  );
});
