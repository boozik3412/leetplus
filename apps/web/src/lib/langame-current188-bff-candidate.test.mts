import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  LANGAME_CURRENT188_BFF_BLOCKERS,
  LANGAME_CURRENT188_BFF_CANDIDATE_ACTIVE,
  LangameCurrent188BffCandidateError,
  prepareLangameCurrent188BffRequest,
  projectLangameCurrent188UpstreamResponse,
} from "./langame-current188-bff-candidate.ts";

const CONTRACT = "LANGAME_ONBOARDING_STAGED_RECEIPT_CURRENT188_V1";
const TOKEN = `header.${"a".repeat(40)}.signature`;
const API_KEY = "synthetic-current188-api-key";
const RECEIPT_ID = "01890f34-2abc-4def-8abc-0123456789ab";
const REQUEST_ID = "langame-request-0001";
const CONFIG_DIGEST = "a".repeat(64);
const BINDING_DIGEST = "b".repeat(64);
const STORE_ID = "store_current188_b1";
const DOMAIN = "b1.langamepro.ru";
const EXTERNAL_CLUB_ID = "42";
const PREVIEW_PATH = "/api/integrations/langame/onboarding/preview";
const ACTIVATE_PATH = "/api/integrations/langame/onboarding/activate";
const STATUS_PATH = "/api/integrations/langame/onboarding/status";

const WEB_APP_ROOT = fileURLToPath(new URL("../app", import.meta.url));
const API_CONTROLLER = fileURLToPath(
  new URL(
    "../../../api/src/integrations/langame.controller.ts",
    import.meta.url,
  ),
);
const API_STAGED_SERVICE = fileURLToPath(
  new URL(
    "../../../api/src/integrations/langame-onboarding-staged.service.ts",
    import.meta.url,
  ),
);

const previewBody = {
  requestId: REQUEST_ID,
  apiKey: API_KEY,
  domain: DOMAIN,
  storeId: STORE_ID,
  externalClubId: EXTERNAL_CLUB_ID,
};

const activationBody = {
  receiptId: RECEIPT_ID,
  requestId: REQUEST_ID,
  configDigest: CONFIG_DIGEST,
  storeId: STORE_ID,
  domain: DOMAIN,
  externalClubId: EXTERNAL_CLUB_ID,
};

const statusBody = { storeId: STORE_ID };

function commandRequest(
  pathname: string,
  body: unknown,
  options: Readonly<{
    method?: string;
    headers?: Readonly<Record<string, string>>;
  }> = {},
): Request {
  const method = options.method ?? "POST";
  return new Request(`https://leetplus.test${pathname}`, {
    method,
    headers: {
      Host: "leetplus.test",
      Origin: "https://leetplus.test",
      "Sec-Fetch-Site": "same-origin",
      "Content-Type": "application/json",
      ...options.headers,
    },
    body:
      method === "GET" || method === "HEAD" ? undefined : JSON.stringify(body),
  });
}

function preparePreview() {
  return prepareLangameCurrent188BffRequest({
    request: commandRequest(PREVIEW_PATH, previewBody),
    cookieAccessToken: TOKEN,
  });
}

function prepareActivation() {
  return prepareLangameCurrent188BffRequest({
    request: commandRequest(ACTIVATE_PATH, activationBody),
    cookieAccessToken: TOKEN,
  });
}

function prepareStatus() {
  return prepareLangameCurrent188BffRequest({
    request: commandRequest(STATUS_PATH, statusBody),
    cookieAccessToken: TOKEN,
  });
}

test("keeps CURRENT188 BFF dormant and declares only reconcile and initial sync missing", () => {
  assert.equal(LANGAME_CURRENT188_BFF_CANDIDATE_ACTIVE, false);
  assert.deepEqual(LANGAME_CURRENT188_BFF_BLOCKERS, {
    RECONCILE: {
      operation: "RECONCILE",
      available: false,
      reasonCode: "LANGAME_CURRENT188_RECONCILE_API_MISSING",
    },
    INITIAL_READ_ONLY_SYNC: {
      operation: "INITIAL_READ_ONLY_SYNC",
      available: false,
      reasonCode: "LANGAME_CURRENT188_INITIAL_READ_ONLY_SYNC_API_MISSING",
    },
  });

  for (const blocker of Object.values(LANGAME_CURRENT188_BFF_BLOCKERS)) {
    assert.deepEqual(Object.keys(blocker).sort(), [
      "available",
      "operation",
      "reasonCode",
    ]);
    assert.equal("method" in blocker, false);
    assert.equal("upstreamPath" in blocker, false);
  }
});

test("prepares only exact same-origin cookie-backed staged preview", async () => {
  const prepared = await prepareLangameCurrent188BffRequest({
    request: commandRequest(
      PREVIEW_PATH,
      {
        ...previewBody,
        requestId: `  ${REQUEST_ID}  `,
        apiKey: `  ${API_KEY}  `,
        domain: DOMAIN.toUpperCase(),
      },
      {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    ),
    cookieAccessToken: TOKEN,
  });

  assert.deepEqual(prepared, {
    route: "PREVIEW",
    requestBinding: {
      requestId: REQUEST_ID,
      activationReceiptId: null,
      storeId: STORE_ID,
    },
    upstreamPath: "/integrations/langame/onboarding/preview",
    init: {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requestId: REQUEST_ID,
        apiKey: API_KEY,
        domain: DOMAIN,
        storeId: STORE_ID,
        externalClubId: EXTERNAL_CLUB_ID,
      }),
      cache: "no-store",
      redirect: "error",
      credentials: "omit",
    },
  });
  assert.equal("Cookie" in prepared.init.headers, false);
});

test("prepares only exact same-origin cookie-backed staged activation", async () => {
  const prepared = await prepareLangameCurrent188BffRequest({
    request: commandRequest(ACTIVATE_PATH, {
      ...activationBody,
      receiptId: RECEIPT_ID.toUpperCase(),
    }),
    cookieAccessToken: TOKEN,
  });

  assert.equal(prepared.route, "ACTIVATE");
  assert.equal(
    prepared.upstreamPath,
    "/integrations/langame/onboarding/activate",
  );
  assert.deepEqual(prepared.requestBinding, {
    requestId: REQUEST_ID,
    activationReceiptId: RECEIPT_ID,
    storeId: STORE_ID,
  });
  assert.deepEqual(JSON.parse(prepared.init.body), {
    receiptId: RECEIPT_ID,
    requestId: REQUEST_ID,
    configDigest: CONFIG_DIGEST,
    storeId: STORE_ID,
    domain: DOMAIN,
    externalClubId: EXTERNAL_CLUB_ID,
  });
  assert.equal(prepared.init.cache, "no-store");
  assert.equal(prepared.init.redirect, "error");
  assert.equal(prepared.init.credentials, "omit");
});

test("prepares only exact same-origin cookie-backed staged status", async () => {
  const prepared = await prepareStatus();

  assert.deepEqual(prepared, {
    route: "STATUS",
    requestBinding: {
      requestId: null,
      activationReceiptId: null,
      storeId: STORE_ID,
    },
    upstreamPath: "/integrations/langame/onboarding/status",
    init: {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(statusBody),
      cache: "no-store",
      redirect: "error",
      credentials: "omit",
    },
  });
});

test("fails closed before forwarding inexact route, origin, auth, media type, or body", async () => {
  const cases: ReadonlyArray<{
    expectedStatus: number;
    request: Request;
    token: string | null;
  }> = [
    {
      expectedStatus: 401,
      request: commandRequest(PREVIEW_PATH, previewBody),
      token: null,
    },
    {
      expectedStatus: 404,
      request: commandRequest(PREVIEW_PATH, previewBody, { method: "GET" }),
      token: TOKEN,
    },
    {
      expectedStatus: 404,
      request: commandRequest(`${PREVIEW_PATH}?tenant=other`, previewBody),
      token: TOKEN,
    },
    {
      expectedStatus: 404,
      request: commandRequest("/api/integrations/langame/sync", previewBody),
      token: TOKEN,
    },
    {
      expectedStatus: 403,
      request: commandRequest(PREVIEW_PATH, previewBody, {
        headers: { Origin: "https://other.test" },
      }),
      token: TOKEN,
    },
    {
      expectedStatus: 403,
      request: commandRequest(PREVIEW_PATH, previewBody, {
        headers: { Origin: "" },
      }),
      token: TOKEN,
    },
    {
      expectedStatus: 403,
      request: commandRequest(PREVIEW_PATH, previewBody, {
        headers: { "Sec-Fetch-Site": "cross-site" },
      }),
      token: TOKEN,
    },
    {
      expectedStatus: 415,
      request: commandRequest(PREVIEW_PATH, previewBody, {
        headers: { "Content-Type": "text/plain" },
      }),
      token: TOKEN,
    },
    {
      expectedStatus: 400,
      request: commandRequest(PREVIEW_PATH, {
        ...previewBody,
        tenantId: "must-not-be-accepted",
      }),
      token: TOKEN,
    },
    {
      expectedStatus: 400,
      request: commandRequest(PREVIEW_PATH, previewBody, {
        headers: { "Content-Length": "1" },
      }),
      token: TOKEN,
    },
    {
      expectedStatus: 413,
      request: commandRequest(PREVIEW_PATH, previewBody, {
        headers: { "Content-Length": String(8 * 1024 + 1) },
      }),
      token: TOKEN,
    },
  ];

  for (const { request, token, expectedStatus } of cases) {
    await assert.rejects(
      prepareLangameCurrent188BffRequest({
        request,
        cookieAccessToken: token,
      }),
      (error: unknown) => {
        assert.ok(error instanceof LangameCurrent188BffCandidateError);
        assert.equal(error.status, expectedStatus);
        assert.doesNotMatch(
          error.message,
          /synthetic|must-not|Bearer|tenantId|other\.test/,
        );
        return true;
      },
    );
  }
});

test("stops a chunked browser command at the independent 8 KiB ingress limit", async () => {
  let pulls = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new Uint8Array(5_000));
      if (pulls === 3) controller.close();
    },
  });
  const request = new Request(`https://leetplus.test${PREVIEW_PATH}`, {
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
    prepareLangameCurrent188BffRequest({
      request,
      cookieAccessToken: TOKEN,
    }),
    (error: unknown) => {
      assert.ok(error instanceof LangameCurrent188BffCandidateError);
      assert.equal(error.status, 413);
      assert.equal(error.reasonCode, "LANGAME_CURRENT188_REQUEST_TOO_LARGE");
      return true;
    },
  );
  assert.ok(pulls < 3);
});

test("projects only the exact staged preview receipt and never reflects a credential", async () => {
  const prepared = await preparePreview();
  const upstreamReceipt = {
    contractVersion: CONTRACT,
    receiptId: RECEIPT_ID,
    status: "PENDING",
    expiresAt: "2026-08-05T12:00:00.000Z",
    configDigest: CONFIG_DIGEST,
    bindingDigest: BINDING_DIGEST,
    replayed: false,
    activationAvailable: false,
    externalSyncStarted: false,
  };
  const projected = await projectLangameCurrent188UpstreamResponse(
    prepared,
    Response.json(upstreamReceipt, { status: 201 }),
  );

  assert.equal(projected.status, 201);
  assert.deepEqual(await projected.json(), upstreamReceipt);
  assertPrivate(projected);

  await assert.rejects(
    projectLangameCurrent188UpstreamResponse(
      prepared,
      Response.json({ ...upstreamReceipt, apiKey: API_KEY }, { status: 201 }),
    ),
    (error: unknown) => {
      assert.ok(error instanceof LangameCurrent188BffCandidateError);
      assert.equal(error.status, 502);
      assert.doesNotMatch(error.message, /synthetic-current188/);
      return true;
    },
  );
});

test("pins the exact Nest POST success transport to 201 application/json", async () => {
  const prepared = await preparePreview();
  const receipt = {
    contractVersion: CONTRACT,
    receiptId: RECEIPT_ID,
    status: "PENDING",
    expiresAt: "2026-08-05T12:00:00.000Z",
    configDigest: CONFIG_DIGEST,
    bindingDigest: BINDING_DIGEST,
    replayed: false,
    activationAvailable: false,
    externalSyncStarted: false,
  };

  for (const status of [200, 202]) {
    await assert.rejects(
      projectLangameCurrent188UpstreamResponse(
        prepared,
        Response.json(receipt, { status }),
      ),
      /LANGAME_CURRENT188_RESPONSE_TRANSPORT_INVALID/,
    );
  }
  await assert.rejects(
    projectLangameCurrent188UpstreamResponse(
      prepared,
      new Response(JSON.stringify(receipt), {
        status: 201,
        headers: { "Content-Type": "text/plain" },
      }),
    ),
    /LANGAME_CURRENT188_RESPONSE_TRANSPORT_INVALID/,
  );
});

test("projects activation only while provider work and initial sync remain false", async () => {
  const prepared = await prepareActivation();
  const activated = {
    contractVersion: CONTRACT,
    receiptId: RECEIPT_ID,
    status: "ACTIVATED",
    consumedAt: "2026-08-05T12:01:00.000Z",
    claimDigest: BINDING_DIGEST,
    replayed: false,
    externalSyncStarted: false,
    initialReadOnlySyncAvailable: false,
    productionActivationAllowed: false,
  };
  const projected = await projectLangameCurrent188UpstreamResponse(
    prepared,
    Response.json(activated, { status: 201 }),
  );

  assert.equal(projected.status, 201);
  assert.deepEqual(await projected.json(), activated);
  assertPrivate(projected);

  for (const unsafeReceipt of [
    { ...activated, externalSyncStarted: true },
    { ...activated, initialReadOnlySyncAvailable: true },
    { ...activated, productionActivationAllowed: true },
    { ...activated, status: "REPLAYED", replayed: false },
  ]) {
    await assert.rejects(
      projectLangameCurrent188UpstreamResponse(
        prepared,
        Response.json(unsafeReceipt, { status: 201 }),
      ),
      /LANGAME_CURRENT188_ACTIVATION_RESPONSE_INVALID/,
    );
  }

  await assert.rejects(
    projectLangameCurrent188UpstreamResponse(
      prepared,
      Response.json(
        {
          ...activated,
          receiptId: "99999999-9999-4999-8999-999999999999",
        },
        { status: 201 },
      ),
    ),
    /LANGAME_CURRENT188_ACTIVATION_RECEIPT_BINDING_INVALID/,
  );
});

test("projects only receipt-bound staged status and keeps later stages false", async () => {
  const prepared = await prepareStatus();
  const activated = {
    contractVersion: CONTRACT,
    storeId: STORE_ID,
    status: "ACTIVATED",
    receiptId: RECEIPT_ID,
    expiresAt: "2026-08-05T12:15:00.000Z",
    consumedAt: "2026-08-05T12:10:00.000Z",
    configDigest: CONFIG_DIGEST,
    bindingDigest: BINDING_DIGEST,
    externalDomain: DOMAIN,
    externalClubId: EXTERNAL_CLUB_ID,
    claimDigest: BINDING_DIGEST,
    activatedAt: "2026-08-05T12:10:00.000Z",
    activationAvailable: false,
    reconciliationAvailable: false,
    initialReadOnlySyncAvailable: false,
    productionStatusAllowed: false,
  };
  const projected = await projectLangameCurrent188UpstreamResponse(
    prepared,
    Response.json(activated, { status: 201 }),
  );

  assert.equal(projected.status, 201);
  assert.deepEqual(await projected.json(), activated);
  assertPrivate(projected);

  for (const invalid of [
    { ...activated, storeId: "other-store" },
    { ...activated, claimDigest: "c".repeat(64) },
    { ...activated, reconciliationAvailable: true },
    { ...activated, initialReadOnlySyncAvailable: true },
    { ...activated, apiKey: API_KEY },
  ]) {
    await assert.rejects(
      projectLangameCurrent188UpstreamResponse(
        prepared,
        Response.json(invalid, { status: 201 }),
      ),
      /LANGAME_CURRENT188_STATUS_RESPONSE_INVALID/,
    );
  }
});

test("projects exact not-configured and pending staged status variants", async () => {
  const prepared = await prepareStatus();
  const empty = {
    contractVersion: CONTRACT,
    storeId: STORE_ID,
    status: "NOT_CONFIGURED",
    receiptId: null,
    expiresAt: null,
    consumedAt: null,
    configDigest: null,
    bindingDigest: null,
    externalDomain: null,
    externalClubId: null,
    claimDigest: null,
    activatedAt: null,
    activationAvailable: false,
    reconciliationAvailable: false,
    initialReadOnlySyncAvailable: false,
    productionStatusAllowed: false,
  };
  const pending = {
    ...empty,
    status: "PENDING",
    receiptId: RECEIPT_ID,
    expiresAt: "2026-08-05T12:15:00.000Z",
    configDigest: CONFIG_DIGEST,
    bindingDigest: BINDING_DIGEST,
    activationAvailable: true,
  };

  for (const receipt of [empty, pending]) {
    const projected = await projectLangameCurrent188UpstreamResponse(
      prepared,
      Response.json(receipt, { status: 201 }),
    );
    assert.deepEqual(await projected.json(), receipt);
    assertPrivate(projected);
  }
});

test("sanitizes and bounds upstream failures", async () => {
  const prepared = await preparePreview();
  const projected = await projectLangameCurrent188UpstreamResponse(
    prepared,
    new Response(
      `credential=${API_KEY} authorization=Bearer.${"z".repeat(100)}`,
      { status: 500 },
    ),
  );

  assert.equal(projected.status, 502);
  assert.equal(
    await projected.text(),
    '{"message":"Langame onboarding request failed"}',
  );
  assertPrivate(projected);

  await assert.rejects(
    projectLangameCurrent188UpstreamResponse(
      prepared,
      new Response("x".repeat(8 * 1024 + 1), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    ),
    /LANGAME_CURRENT188_RESPONSE_TOO_LARGE/,
  );
});

test("pins preview, activate and status while reconcile and initial sync stay absent", async () => {
  const [controller, service] = await Promise.all([
    readFile(API_CONTROLLER, "utf8"),
    readFile(API_STAGED_SERVICE, "utf8"),
  ]);
  const onboardingRoutes = [
    ...controller.matchAll(
      /@(Get|Post|Put|Patch|Delete)\('onboarding\/([^']+)'\)/g,
    ),
  ].map((match) => [match[1], match[2]]);

  assert.deepEqual(onboardingRoutes, [
    ["Post", "preview"],
    ["Post", "activate"],
    ["Post", "status"],
  ]);
  for (const methodName of [
    "previewOnboarding",
    "activateOnboarding",
    "getOnboardingStatus",
  ]) {
    const methodStart = controller.indexOf(`${methodName}(`);
    assert.notEqual(methodStart, -1);
    const decoratorStart = controller.lastIndexOf("@Post(", methodStart);
    const metadata = controller.slice(decoratorStart, methodStart);
    assert.match(
      metadata,
      /@Post\('onboarding\/(?:preview|activate|status)'\)/,
    );
    assert.doesNotMatch(metadata, /@HttpCode\(/);
  }
  assert.doesNotMatch(
    controller,
    /['"]onboarding\/(?:reconcile|initial-read-only-sync)['"]/,
  );
  assert.match(service, /activationAvailable:\s*false/);
  assert.match(service, /externalSyncStarted:\s*false/g);
  assert.match(service, /initialReadOnlySyncAvailable:\s*false/);
  assert.match(service, /productionActivationAllowed:\s*false/);
  assert.match(service, /productionStatusAllowed:\s*false/);
  assert.match(service, /CURRENT188 status is not production-authorized/);
  assert.match(service, /CURRENT188 activation is not production-authorized/);
  assert.match(service, /FreshStoreScopeService/);
  assert.equal(
    (service.match(/freshStoreScopeService\.assertNetwork\(user\)/g) ?? [])
      .length,
    3,
  );
});

test("remains unimported while the active settings form and BFF stay legacy", async () => {
  const routeFiles = await findFiles(WEB_APP_ROOT, "route.ts");
  const routeSources = await Promise.all(
    routeFiles.map(async (file) => ({
      file,
      source: await readFile(file, "utf8"),
    })),
  );
  for (const { file, source } of routeSources) {
    assert.doesNotMatch(
      source,
      /langame-current188-bff-candidate/,
      `${file} unexpectedly activates CURRENT188`,
    );
  }

  const [settingsRoute, settingsForm] = await Promise.all([
    readFile(
      path.join(
        WEB_APP_ROOT,
        "api",
        "integrations",
        "langame",
        "settings",
        "route.ts",
      ),
      "utf8",
    ),
    readFile(
      fileURLToPath(
        new URL("../components/langame-settings-form.tsx", import.meta.url),
      ),
      "utf8",
    ),
  ]);
  assert.match(settingsRoute, /export async function GET/);
  assert.match(settingsRoute, /export async function PUT/);
  assert.doesNotMatch(settingsRoute, /onboarding\/(?:preview|activate|status)/);
  assert.match(settingsForm, /\/api\/integrations\/langame\/settings/);
  assert.match(settingsForm, /method:\s*["']PUT["']/);
  assert.doesNotMatch(settingsForm, /onboarding\/(?:preview|activate|status)/);
});

test("does not map provider writes, generic sync, or unattended jobs", async () => {
  const source = await readFile(
    fileURLToPath(
      new URL("./langame-current188-bff-candidate.ts", import.meta.url),
    ),
    "utf8",
  );
  for (const deniedPath of [
    '"/integrations/langame/settings"',
    '"/integrations/langame/sync"',
    '"/integrations/langame/guests/foundation/sync"',
    '"/integrations/langame/guests/foundation/sync/start"',
    '"/integrations/langame/business-snapshots/run"',
  ]) {
    assert.equal(source.includes(deniedPath), false, deniedPath);
  }
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
  assert.equal(response.headers.get("vary"), "Cookie, Authorization");
}

async function findFiles(
  directory: string,
  fileName: string,
): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findFiles(absolutePath, fileName);
      return entry.isFile() && entry.name === fileName ? [absolutePath] : [];
    }),
  );
  return nested.flat();
}
