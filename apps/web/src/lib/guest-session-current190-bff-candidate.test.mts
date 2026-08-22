import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  GUEST_SESSION_CURRENT190_BFF_CANDIDATE_ACTIVE,
  GuestSessionCurrent190BffCandidateError,
  prepareGuestSessionCurrent190BffRequest,
  projectGuestSessionCurrent190UpstreamResponse,
} from "./guest-session-current190-bff-candidate.ts";

const TOKEN = `header.${"a".repeat(32)}.signature`;
const REQUEST_ID = "logout-request-0001";
const ASSET_ID = "asset_current190_0001";
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

test("prepares only exact cookie-backed CURRENT190 logout and media requests", () => {
  assert.equal(GUEST_SESSION_CURRENT190_BFF_CANDIDATE_ACTIVE, false);
  assert.deepEqual(
    prepareGuestSessionCurrent190BffRequest({
      method: "POST",
      path: ["session", "logout"],
      guestToken: TOKEN,
      idempotencyKey: REQUEST_ID,
    }),
    {
      route: "LOGOUT",
      upstreamPath: "/guest-portal/session/logout",
      init: {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Idempotency-Key": REQUEST_ID,
        },
        cache: "no-store",
        redirect: "error",
        credentials: "omit",
      },
    },
  );
  assert.deepEqual(
    prepareGuestSessionCurrent190BffRequest({
      method: "GET",
      path: ["session", "media", ASSET_ID],
      guestToken: TOKEN,
    }),
    {
      route: "MEDIA",
      upstreamPath: `/guest-portal/session/media/${ASSET_ID}`,
      init: {
        method: "GET",
        headers: { Authorization: `Bearer ${TOKEN}` },
        cache: "no-store",
        redirect: "error",
        credentials: "omit",
      },
    },
  );
});

test("fails closed for missing admission, changed routes, or unsafe headers", () => {
  const cases = [
    {
      method: "POST",
      path: ["session", "logout"],
      guestToken: null,
      idempotencyKey: REQUEST_ID,
    },
    {
      method: "POST",
      path: ["session", "logout"],
      guestToken: TOKEN,
      idempotencyKey: "bad\r\nheader",
    },
    {
      method: "DELETE",
      path: ["session", "logout"],
      guestToken: TOKEN,
      idempotencyKey: REQUEST_ID,
    },
    {
      method: "GET",
      path: ["session", "media", "../tenant-b"],
      guestToken: TOKEN,
    },
  ];
  for (const input of cases) {
    assert.throws(
      () => prepareGuestSessionCurrent190BffRequest(input),
      (error: unknown) => {
        assert.ok(error instanceof GuestSessionCurrent190BffCandidateError);
        assert.doesNotMatch(error.message, /header\.|tenant-b/);
        return true;
      },
    );
  }
});

test("clears the browser cookie only after an exact persisted revoke receipt", async () => {
  const receipt = {
    ok: true,
    status: "REVOKED",
    replayed: false,
    revokedAt: "2026-08-05T12:00:00.000Z",
  };
  const projected = await projectGuestSessionCurrent190UpstreamResponse(
    "LOGOUT",
    Response.json(receipt),
  );
  assert.equal(projected.clearGuestCookie, true);
  assert.deepEqual(await projected.response.json(), receipt);
  assertPrivate(projected.response);

  await assert.rejects(
    projectGuestSessionCurrent190UpstreamResponse(
      "LOGOUT",
      Response.json({ ...receipt, sessionId: "must-not-cross-bff" }),
    ),
    /GUEST_SESSION_CURRENT190_LOGOUT_RECEIPT_INVALID/,
  );
});

test("does not reflect an upstream failure or clear the cookie", async () => {
  const projected = await projectGuestSessionCurrent190UpstreamResponse(
    "LOGOUT",
    new Response("upstream token=secret tenant=private", { status: 500 }),
  );
  assert.equal(projected.clearGuestCookie, false);
  assert.equal(projected.response.status, 502);
  const body = await projected.response.text();
  assert.equal(body, '{"message":"Guest session request failed"}');
  assert.doesNotMatch(body, /secret|private/);
  assertPrivate(projected.response);
});

test("copies only bounded media whose signature matches its private type", async () => {
  const projected = await projectGuestSessionCurrent190UpstreamResponse(
    "MEDIA",
    new Response(PNG, {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(PNG.length),
      },
    }),
  );
  assert.equal(projected.clearGuestCookie, false);
  assert.equal(projected.response.headers.get("content-type"), "image/png");
  assert.equal(
    projected.response.headers.get("content-length"),
    String(PNG.length),
  );
  assert.deepEqual(Buffer.from(await projected.response.arrayBuffer()), PNG);
  assertPrivate(projected.response);

  await assert.rejects(
    projectGuestSessionCurrent190UpstreamResponse(
      "MEDIA",
      new Response(Buffer.from("not-a-png"), {
        headers: { "Content-Type": "image/png" },
      }),
    ),
    /GUEST_SESSION_CURRENT190_MEDIA_BODY_INVALID/,
  );
});

test("remains unreferenced by the active catch-all Route Handler", async () => {
  const route = await readFile(
    fileURLToPath(
      new URL("../app/api/guest-portal/[...path]/route.ts", import.meta.url),
    ),
    "utf8",
  );
  assert.doesNotMatch(route, /guest-session-current190-bff-candidate/);
  assert.match(
    route,
    /path\.length === 2[\s\S]*path\[1\] === ["']logout["'][\s\S]*response\.cookies\.set/,
  );
});

function assertPrivate(response: Response): void {
  assert.equal(
    response.headers.get("cache-control"),
    "private, no-store, max-age=0",
  );
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(
    response.headers.get("cross-origin-resource-policy"),
    "same-origin",
  );
}
