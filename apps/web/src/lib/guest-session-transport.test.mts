import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeGuestSessionResponse } from "./guest-session-transport.ts";

test("guest session token stays in the HttpOnly cookie boundary", () => {
  const source = {
    status: "CONFIRMED",
    token: "signed-guest-session",
    portal: { profileId: "profile-a" },
  };

  assert.deepEqual(sanitizeGuestSessionResponse(source), {
    status: "CONFIRMED",
    portal: { profileId: "profile-a" },
  });
  assert.equal(source.token, "signed-guest-session");
});

test("non-object responses keep their original shape", () => {
  assert.equal(sanitizeGuestSessionResponse(null), null);
  assert.equal(sanitizeGuestSessionResponse("ok"), "ok");
  assert.deepEqual(sanitizeGuestSessionResponse(["ok"]), ["ok"]);
});
