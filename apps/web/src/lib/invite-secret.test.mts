import assert from "node:assert/strict";
import test from "node:test";
import {
  isCanonicalInviteToken,
  readInviteTokenFromFragment,
} from "./invite-secret.mts";

const TOKEN = "A".repeat(43);

test("accepts one canonical base64url invite fragment", () => {
  assert.equal(isCanonicalInviteToken(TOKEN), true);
  assert.equal(readInviteTokenFromFragment(`#invite=${TOKEN}`), TOKEN);
});

test("rejects query strings, duplicate fields and non-canonical encodings", () => {
  const rejected = [
    "",
    `invite=${TOKEN}`,
    `?invite=${TOKEN}`,
    `#invite=${TOKEN}&invite=${TOKEN}`,
    `#source=email&invite=${TOKEN}`,
    `#invite=${"A".repeat(42)}`,
    `#invite=${"A".repeat(44)}`,
    `#invite=${"A".repeat(42)}+`,
    `#invite=${"A".repeat(42)}/`,
    `#invite=${"A".repeat(42)}=`,
    `#invite=%${TOKEN.slice(1)}`,
  ];

  for (const fragment of rejected) {
    assert.equal(readInviteTokenFromFragment(fragment), null, fragment);
  }
});

test("rejects non-string token candidates", () => {
  for (const value of [undefined, null, 1, {}, [], true]) {
    assert.equal(isCanonicalInviteToken(value), false);
  }
});
