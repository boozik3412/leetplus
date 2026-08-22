import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  EMPLOYEE_INVITE_CURRENT189_BFF_CANDIDATE_ACTIVE,
  EmployeeInviteCurrent189BffCandidateError,
  prepareEmployeeInviteCurrent189BffRequest,
  projectEmployeeInviteCurrent189UpstreamResponse,
} from "./employee-invite-current189-bff-candidate.ts";

const TOKEN = `header.${"a".repeat(48)}.signature`;
const INVITE_ID = "11111111-1111-4111-8111-111111111111";
const REPLACEMENT_ID = "22222222-2222-4222-8222-222222222222";
const STORE_ID = "33333333-3333-4333-8333-333333333333";
const REQUEST_ID = "44444444-4444-4444-8444-444444444444";
const EXPIRES_AT = "2026-08-20T12:00:00.000Z";
const EMAIL_CANARY = "candidate-address@identity.invalid";
const WEB_APP_ROOT = fileURLToPath(new URL("../app", import.meta.url));

const issueBody = {
  requestId: REQUEST_ID,
  email: EMAIL_CANARY,
  fullName: null,
  role: "CLUB_ADMINISTRATOR",
  customRoleId: null,
  scope: "STORES",
  storeIds: [STORE_ID],
  expiresAt: EXPIRES_AT,
};

function commandRequest(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(`https://leetplus.test${path}`, {
    method,
    headers: {
      Host: "leetplus.test",
      Origin: "https://leetplus.test",
      "Sec-Fetch-Site": "same-origin",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test("prepares only exact cookie-backed CURRENT189 issue, reissue, and revoke commands", async () => {
  assert.equal(EMPLOYEE_INVITE_CURRENT189_BFF_CANDIDATE_ACTIVE, false);

  const issue = await prepareEmployeeInviteCurrent189BffRequest({
    request: commandRequest("/api/users/invites", "POST", issueBody),
    operation: "ISSUE",
    b2bCookieToken: TOKEN,
  });
  assert.equal(issue.upstreamPath, "/users/invites");
  assert.equal(issue.routeInviteId, null);
  assert.deepEqual(issue.init.headers, {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
    "Idempotency-Key": REQUEST_ID,
  });
  assert.equal(issue.init.cache, "no-store");
  assert.equal(issue.init.redirect, "error");
  assert.equal(issue.init.credentials, "omit");
  assert.deepEqual(JSON.parse(issue.init.body), issueBody);

  const shuffled = await prepareEmployeeInviteCurrent189BffRequest({
    request: commandRequest("/api/users/invites", "POST", {
      expiresAt: EXPIRES_AT,
      storeIds: [STORE_ID],
      scope: "STORES",
      customRoleId: null,
      role: "CLUB_ADMINISTRATOR",
      fullName: null,
      email: EMAIL_CANARY,
      requestId: REQUEST_ID,
    }),
    operation: "ISSUE",
    b2bCookieToken: TOKEN,
  });
  assert.equal(shuffled.init.body, issue.init.body);

  const reissue = await prepareEmployeeInviteCurrent189BffRequest({
    request: commandRequest(
      `/api/users/invites/${INVITE_ID}`,
      "PATCH",
      issueBody,
    ),
    operation: "REISSUE",
    routeInviteId: INVITE_ID,
    b2bCookieToken: TOKEN,
  });
  assert.equal(reissue.upstreamPath, `/users/invites/${INVITE_ID}`);
  assert.equal(reissue.init.method, "PATCH");

  const revokeBody = { requestId: REQUEST_ID, reason: "owner-requested" };
  const revoke = await prepareEmployeeInviteCurrent189BffRequest({
    request: commandRequest(
      `/api/users/invites/${INVITE_ID}`,
      "DELETE",
      revokeBody,
    ),
    operation: "REVOKE",
    routeInviteId: INVITE_ID,
    b2bCookieToken: TOKEN,
  });
  assert.equal(revoke.init.method, "DELETE");
  assert.deepEqual(JSON.parse(revoke.init.body), revokeBody);
});

test("fails closed for inexact route, origin, token, media type, idempotency, or body", async () => {
  const cases = [
    () =>
      prepareEmployeeInviteCurrent189BffRequest({
        request: commandRequest("/api/users/invites", "POST", issueBody),
        operation: "ISSUE",
        b2bCookieToken: null,
      }),
    () =>
      prepareEmployeeInviteCurrent189BffRequest({
        request: commandRequest(
          "/api/users/invites?tenant=other",
          "POST",
          issueBody,
        ),
        operation: "ISSUE",
        b2bCookieToken: TOKEN,
      }),
    () =>
      prepareEmployeeInviteCurrent189BffRequest({
        request: commandRequest("/api/users/invites", "PATCH", issueBody),
        operation: "ISSUE",
        b2bCookieToken: TOKEN,
      }),
    () =>
      prepareEmployeeInviteCurrent189BffRequest({
        request: commandRequest("/api/users/invites", "POST", issueBody, {
          Origin: "https://other.test",
        }),
        operation: "ISSUE",
        b2bCookieToken: TOKEN,
      }),
    () =>
      prepareEmployeeInviteCurrent189BffRequest({
        request: commandRequest("/api/users/invites", "POST", issueBody, {
          "Content-Type": "application/json; charset=utf-8",
        }),
        operation: "ISSUE",
        b2bCookieToken: TOKEN,
      }),
    () =>
      prepareEmployeeInviteCurrent189BffRequest({
        request: commandRequest("/api/users/invites", "POST", {
          ...issueBody,
          requestId: "not-an-id",
        }),
        operation: "ISSUE",
        b2bCookieToken: TOKEN,
      }),
    () =>
      prepareEmployeeInviteCurrent189BffRequest({
        request: commandRequest("/api/users/invites", "POST", {
          ...issueBody,
          rawToken: "must-not-cross-boundary",
        }),
        operation: "ISSUE",
        b2bCookieToken: TOKEN,
      }),
  ];

  for (const invoke of cases) {
    await assert.rejects(invoke, (error: unknown) => {
      assert.ok(error instanceof EmployeeInviteCurrent189BffCandidateError);
      assert.doesNotMatch(
        error.message,
        /identity\.invalid|must-not-cross-boundary|other\.test|header\./iu,
      );
      return true;
    });
  }
});

test("stops a chunked command at the independent byte limit", async () => {
  let pulls = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new Uint8Array(5_000));
      if (pulls === 3) controller.close();
    },
  });
  const request = new Request("https://leetplus.test/api/users/invites", {
    method: "POST",
    headers: {
      Host: "leetplus.test",
      Origin: "https://leetplus.test",
      "Sec-Fetch-Site": "same-origin",
      "Content-Type": "application/json",
    },
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  await assert.rejects(
    prepareEmployeeInviteCurrent189BffRequest({
      request,
      operation: "ISSUE",
      b2bCookieToken: TOKEN,
    }),
    /EMPLOYEE_INVITE_CURRENT189_BFF_BODY_TOO_LARGE/,
  );
  assert.ok(pulls < 3);
});

test("classifies an unreadable browser command as 400 without reflecting the stream error", async () => {
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.error(new Error(`${EMAIL_CANARY} rawToken=must-not-escape`));
    },
  });
  const request = new Request("https://leetplus.test/api/users/invites", {
    method: "POST",
    headers: {
      Host: "leetplus.test",
      Origin: "https://leetplus.test",
      "Sec-Fetch-Site": "same-origin",
      "Content-Type": "application/json",
    },
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  await assert.rejects(
    prepareEmployeeInviteCurrent189BffRequest({
      request,
      operation: "ISSUE",
      b2bCookieToken: TOKEN,
    }),
    (error: unknown) => {
      assert.ok(error instanceof EmployeeInviteCurrent189BffCandidateError);
      assert.equal(error.status, 400);
      assert.equal(
        error.reasonCode,
        "EMPLOYEE_INVITE_CURRENT189_BFF_BODY_INVALID",
      );
      assert.doesNotMatch(error.message, /identity\.invalid|must-not-escape/iu);
      return true;
    },
  );
});

test("projects only exact safe receipts and never reflects email or secret material", async () => {
  const prepared = await prepareEmployeeInviteCurrent189BffRequest({
    request: commandRequest("/api/users/invites", "POST", issueBody),
    operation: "ISSUE",
    b2bCookieToken: TOKEN,
  });
  const receipt = {
    ok: true,
    routeContract: "EMPLOYEE_INVITE_CURRENT189_ROUTE_V1",
    operation: "ISSUE_EMPLOYEE_INVITE",
    decision: "CREATED",
    replayed: false,
    invite: {
      id: INVITE_ID,
      deliveryStatus: "PENDING",
      expiresAt: EXPIRES_AT,
    },
    replacedInviteId: null,
  };
  const response = await projectEmployeeInviteCurrent189UpstreamResponse(
    prepared,
    Response.json(receipt, { status: 201 }),
  );
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), receipt);
  assertPrivate(response);

  await assert.rejects(
    projectEmployeeInviteCurrent189UpstreamResponse(
      prepared,
      Response.json(
        {
          ...receipt,
          email: EMAIL_CANARY,
          registrationUrl: "https://identity.invalid/#secret",
          secretCiphertext: "secret",
        },
        { status: 201 },
      ),
    ),
    (error: unknown) => {
      assert.ok(error instanceof EmployeeInviteCurrent189BffCandidateError);
      assert.doesNotMatch(error.message, /identity\.invalid|secret|email/iu);
      return true;
    },
  );
});

test("enforces immutable reissue and terminal revoke receipt bindings", async () => {
  const reissue = await prepareEmployeeInviteCurrent189BffRequest({
    request: commandRequest(
      `/api/users/invites/${INVITE_ID}`,
      "PATCH",
      issueBody,
    ),
    operation: "REISSUE",
    routeInviteId: INVITE_ID,
    b2bCookieToken: TOKEN,
  });
  const reissueReceipt = {
    ok: true,
    routeContract: "EMPLOYEE_INVITE_CURRENT189_ROUTE_V1",
    operation: "REISSUE_EMPLOYEE_INVITE",
    decision: "REISSUED",
    replayed: false,
    invite: {
      id: REPLACEMENT_ID,
      deliveryStatus: "PENDING",
      expiresAt: EXPIRES_AT,
    },
    replacedInviteId: INVITE_ID,
  };
  await assert.doesNotReject(
    projectEmployeeInviteCurrent189UpstreamResponse(
      reissue,
      Response.json(reissueReceipt),
    ),
  );
  await assert.rejects(
    projectEmployeeInviteCurrent189UpstreamResponse(
      reissue,
      Response.json({
        ...reissueReceipt,
        invite: { ...reissueReceipt.invite, id: INVITE_ID },
      }),
    ),
    /EMPLOYEE_INVITE_CURRENT189_BFF_RECEIPT_INVALID/,
  );

  const revokeBody = { requestId: REQUEST_ID, reason: "owner-requested" };
  const revoke = await prepareEmployeeInviteCurrent189BffRequest({
    request: commandRequest(
      `/api/users/invites/${INVITE_ID}`,
      "DELETE",
      revokeBody,
    ),
    operation: "REVOKE",
    routeInviteId: INVITE_ID,
    b2bCookieToken: TOKEN,
  });
  await assert.doesNotReject(
    projectEmployeeInviteCurrent189UpstreamResponse(
      revoke,
      Response.json({
        ...reissueReceipt,
        operation: "REVOKE_EMPLOYEE_INVITE",
        decision: "REVOKED",
        invite: {
          id: INVITE_ID,
          deliveryStatus: "CANCELED",
          expiresAt: null,
        },
        replacedInviteId: null,
      }),
    ),
  );
});

test("contains upstream failures and remains unimported by every active Route Handler", async () => {
  const prepared = await prepareEmployeeInviteCurrent189BffRequest({
    request: commandRequest("/api/users/invites", "POST", issueBody),
    operation: "ISSUE",
    b2bCookieToken: TOKEN,
  });
  const response = await projectEmployeeInviteCurrent189UpstreamResponse(
    prepared,
    new Response(
      `${EMAIL_CANARY} rawToken=secret registrationUrl=https://identity.invalid`,
      { status: 500 },
    ),
  );
  assert.equal(response.status, 502);
  const text = await response.text();
  assert.equal(text, '{"message":"Employee invite request failed"}');
  assert.doesNotMatch(
    text,
    /identity\.invalid|secret|rawToken|registrationUrl/iu,
  );
  assertPrivate(response);

  const activeRouteFiles = await findFiles(WEB_APP_ROOT, "route.ts");
  for (const file of activeRouteFiles) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(
      source,
      /employee-invite-current189-bff-candidate/,
      `${file} unexpectedly activates CURRENT189`,
    );
  }

  const inviteRoutes = activeRouteFiles.filter((file) =>
    file.includes(join("api", "users", "invites")),
  );
  assert.equal(inviteRoutes.length, 2);
  for (const file of inviteRoutes) {
    assert.match(await readFile(file, "utf8"), /proxyJsonRequest/);
  }
});

test("classifies missing or unreadable successful upstream receipts as 502", async () => {
  const prepared = await prepareEmployeeInviteCurrent189BffRequest({
    request: commandRequest("/api/users/invites", "POST", issueBody),
    operation: "ISSUE",
    b2bCookieToken: TOKEN,
  });
  const missingBody = new Response(null, {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
  await assert.rejects(
    projectEmployeeInviteCurrent189UpstreamResponse(prepared, missingBody),
    (error: unknown) => {
      assert.ok(error instanceof EmployeeInviteCurrent189BffCandidateError);
      assert.equal(error.status, 502);
      assert.equal(
        error.reasonCode,
        "EMPLOYEE_INVITE_CURRENT189_BFF_BODY_REQUIRED",
      );
      return true;
    },
  );

  const unreadableBody = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.error(new Error(`${EMAIL_CANARY} ciphertext=must-not-escape`));
    },
  });
  const unreadable = new Response(unreadableBody, {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
  await assert.rejects(
    projectEmployeeInviteCurrent189UpstreamResponse(prepared, unreadable),
    (error: unknown) => {
      assert.ok(error instanceof EmployeeInviteCurrent189BffCandidateError);
      assert.equal(error.status, 502);
      assert.equal(
        error.reasonCode,
        "EMPLOYEE_INVITE_CURRENT189_BFF_BODY_INVALID",
      );
      assert.doesNotMatch(error.message, /identity\.invalid|must-not-escape/iu);
      return true;
    },
  );
});

function assertPrivate(response: Response): void {
  assert.equal(
    response.headers.get("cache-control"),
    "private, no-store, max-age=0",
  );
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(
    response.headers.get("cross-origin-resource-policy"),
    "same-origin",
  );
}

async function findFiles(
  directory: string,
  fileName: string,
): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) return findFiles(absolutePath, fileName);
      return entry.isFile() && entry.name === fileName ? [absolutePath] : [];
    }),
  );
  return nested.flat();
}
