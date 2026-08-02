import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_INVITE_REQUEST_BYTES,
  parseInviteRequest,
  projectInvitePreview,
  safeInviteError,
} from "./invite-transport-core.mts";

const TOKEN = "A".repeat(43);
const PREVIEW_FIELDS = new Set(["token"]);

function inviteRequest(
  body: BodyInit,
  headers: Record<string, string> = {},
  init: RequestInit = {},
) {
  return new Request("http://next-internal/api/auth/invites/preview", {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/json",
      Host: "leetplus.test",
      Origin: "https://leetplus.test",
      "Sec-Fetch-Site": "same-origin",
      "X-Forwarded-Host": "attacker.test",
      "X-Forwarded-Proto": "https",
      ...headers,
    },
    ...init,
  });
}

test("accepts a bounded same-origin JSON body and prefers Host authority", async () => {
  const result = await parseInviteRequest(
    inviteRequest(JSON.stringify({ token: TOKEN })),
    PREVIEW_FIELDS,
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.payload.token, TOKEN);
  }
});

test("rejects origin, fetch-site, media type, malformed JSON and extra fields", async () => {
  const requests = [
    inviteRequest(JSON.stringify({ token: TOKEN }), { Origin: "" }),
    inviteRequest(JSON.stringify({ token: TOKEN }), {
      Origin: "https://attacker.test",
    }),
    inviteRequest(JSON.stringify({ token: TOKEN }), {
      "Sec-Fetch-Site": "cross-site",
    }),
    inviteRequest(JSON.stringify({ token: TOKEN }), {
      "Content-Type": "text/plain",
    }),
    inviteRequest("{"),
    inviteRequest(JSON.stringify({ token: TOKEN, extra: true })),
    inviteRequest(JSON.stringify({ token: TOKEN.slice(1) })),
  ];

  for (const request of requests) {
    const result = await parseInviteRequest(request, PREVIEW_FIELDS);
    assert.equal(result.ok, false);
  }
});

test("stops a chunked body without Content-Length at the byte limit", async () => {
  let pullCount = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pullCount += 1;
      controller.enqueue(new Uint8Array(3_000));
      if (pullCount >= 4) {
        controller.close();
      }
    },
  });
  const request = inviteRequest(
    body,
    {},
    { duplex: "half" } as RequestInit & { duplex: "half" },
  );

  const result = await parseInviteRequest(request, PREVIEW_FIELDS);

  assert.deepEqual(result, { ok: false, status: 413 });
  assert.ok(pullCount < 4);
  assert.equal(request.headers.has("content-length"), false);
  assert.ok(MAX_INVITE_REQUEST_BYTES < 6_000);
});

test("projects only the preview DTO and rejects a reflected token", () => {
  const upstream = {
    email: "owner@example.test",
    fullName: "Owner",
    role: "OWNER",
    customRole: null,
    tenant: { name: "Club", slug: "club", secret: "not-forwarded" },
    scope: "NETWORK",
    stores: [{ id: "s1", name: "Club 1", isActive: true, extra: "removed" }],
    expiresAt: "2026-08-01T00:00:00.000Z",
    accessToken: "not-forwarded",
  };

  assert.deepEqual(projectInvitePreview(upstream, TOKEN), {
    email: "owner@example.test",
    fullName: "Owner",
    role: "OWNER",
    customRole: null,
    tenant: { name: "Club", slug: "club" },
    scope: "NETWORK",
    stores: [{ id: "s1", name: "Club 1", isActive: true }],
    expiresAt: "2026-08-01T00:00:00.000Z",
  });
  assert.equal(
    projectInvitePreview({ ...upstream, fullName: `Owner ${TOKEN}` }, TOKEN),
    null,
  );
  assert.equal(
    safeInviteError(`Upstream reflected ${TOKEN}`, TOKEN).includes(TOKEN),
    false,
  );
});
