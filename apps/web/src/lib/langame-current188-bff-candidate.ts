const CURRENT188_CONTRACT = "LANGAME_ONBOARDING_STAGED_RECEIPT_CURRENT188_V1";
const MAX_REQUEST_BYTES = 8 * 1024;
const MAX_RESPONSE_BYTES = 8 * 1024;
const EXACT_NEST_POST_STATUS = 201;
const PREVIEW_BROWSER_PATH =
  "/api/integrations/langame/onboarding/preview" as const;
const ACTIVATE_BROWSER_PATH =
  "/api/integrations/langame/onboarding/activate" as const;
const STATUS_BROWSER_PATH =
  "/api/integrations/langame/onboarding/status" as const;
const RECONCILE_BROWSER_PATH =
  "/api/integrations/langame/onboarding/reconcile" as const;
const INITIAL_SYNC_PREFLIGHT_BROWSER_PATH =
  "/api/integrations/langame/onboarding/initial-sync/preflight" as const;
const B2B_TOKEN_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const STORE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const EXTERNAL_CLUB_ID_PATTERN = /^[1-9][0-9]{0,18}$/;
const RECEIPT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const JSON_CONTENT_TYPE_PATTERN =
  /^application\/json(?:\s*;\s*charset=utf-8)?$/i;
const LANGAME_DOMAIN_PATTERN = /^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i;
const API_KEY_CONTROL_PATTERN = /[\u0000-\u001f\u007f]/;

const PREVIEW_INPUT_KEYS = [
  "apiKey",
  "domain",
  "externalClubId",
  "requestId",
  "storeId",
] as const;
const ACTIVATE_INPUT_KEYS = [
  "configDigest",
  "domain",
  "externalClubId",
  "receiptId",
  "requestId",
  "storeId",
] as const;
const STATUS_INPUT_KEYS = ["storeId"] as const;
const RECONCILE_INPUT_KEYS = ACTIVATE_INPUT_KEYS;
const INITIAL_SYNC_PREFLIGHT_INPUT_KEYS = [
  "activationRequestId",
  "configDigest",
  "domain",
  "externalClubId",
  "receiptId",
  "storeId",
  "syncRequestId",
] as const;
const PREVIEW_RESPONSE_KEYS = [
  "activationAvailable",
  "bindingDigest",
  "configDigest",
  "contractVersion",
  "expiresAt",
  "externalSyncStarted",
  "receiptId",
  "replayed",
  "status",
] as const;
const ACTIVATE_RESPONSE_KEYS = [
  "claimDigest",
  "consumedAt",
  "contractVersion",
  "externalSyncStarted",
  "initialReadOnlySyncAvailable",
  "productionActivationAllowed",
  "receiptId",
  "replayed",
  "status",
] as const;
const STATUS_RESPONSE_KEYS = [
  "activatedAt",
  "activationAvailable",
  "bindingDigest",
  "claimDigest",
  "configDigest",
  "consumedAt",
  "contractVersion",
  "expiresAt",
  "externalClubId",
  "externalDomain",
  "initialReadOnlySyncAvailable",
  "productionStatusAllowed",
  "receiptId",
  "reconciliationAvailable",
  "status",
  "storeId",
] as const;
const RECONCILE_RESPONSE_KEYS = [
  "claimDigest",
  "consumedAt",
  "contractVersion",
  "externalSyncStarted",
  "initialReadOnlySyncAvailable",
  "outcome",
  "productionReconciliationAllowed",
  "receiptId",
  "retryActivationAllowed",
  "storeId",
] as const;
const INITIAL_SYNC_PREFLIGHT_RESPONSE_KEYS = [
  "approvalDigest",
  "contractVersion",
  "initialReadOnlySyncAvailable",
  "platformImportStarted",
  "productionPreflightAllowed",
  "providerReadsPerformed",
  "providerWritesStarted",
  "readSet",
  "readSetDigest",
  "receiptId",
  "status",
  "storeId",
  "syncRequestId",
] as const;
const INITIAL_SYNC_PREFLIGHT_READ_SET_KEYS = [
  "inventoryItems",
  "products",
  "selectedClubs",
] as const;

export const LANGAME_CURRENT188_BFF_CANDIDATE_ACTIVE = false as const;

/**
 * The bounded receipt-bound provider-read preflight is mapped below. The
 * actual database import is still absent; generic legacy sync endpoints are
 * not a safe substitute.
 */
export const LANGAME_CURRENT188_BFF_BLOCKERS = Object.freeze({
  INITIAL_READ_ONLY_SYNC_IMPORT: Object.freeze({
    operation: "INITIAL_READ_ONLY_SYNC_IMPORT" as const,
    available: false as const,
    reasonCode: "LANGAME_CURRENT188_INITIAL_READ_ONLY_SYNC_IMPORT_MISSING",
  }),
});

export type LangameCurrent188BffRoute =
  | "PREVIEW"
  | "ACTIVATE"
  | "STATUS"
  | "RECONCILE"
  | "INITIAL_SYNC_PREFLIGHT";

export type LangameCurrent188PreparedRequest = Readonly<{
  route: LangameCurrent188BffRoute;
  requestBinding: Readonly<{
    requestId: string | null;
    activationReceiptId: string | null;
    storeId: string;
  }>;
  upstreamPath:
    | "/integrations/langame/onboarding/preview"
    | "/integrations/langame/onboarding/activate"
    | "/integrations/langame/onboarding/status"
    | "/integrations/langame/onboarding/reconcile"
    | "/integrations/langame/onboarding/initial-sync/preflight";
  init: Readonly<{
    method: "POST";
    headers: Readonly<Record<string, string>>;
    body: string;
    cache: "no-store";
    redirect: "error";
    credentials: "omit";
  }>;
}>;

export class LangameCurrent188BffCandidateError extends Error {
  readonly status: number;
  readonly reasonCode: string;

  constructor(status: number, reasonCode: string) {
    super(reasonCode);
    this.name = "LangameCurrent188BffCandidateError";
    this.status = status;
    this.reasonCode = reasonCode;
  }
}

/**
 * Dormant, server-only transport builder for an eventual CURRENT188 cutover.
 *
 * A Route Handler must supply only the HttpOnly B2B cookie value. Browser
 * Authorization/Cookie headers are intentionally not accepted by this API.
 * This file is not imported by any active route or form.
 */
export async function prepareLangameCurrent188BffRequest(input: {
  request: Request;
  cookieAccessToken: string | null | undefined;
}): Promise<LangameCurrent188PreparedRequest> {
  const token = input.cookieAccessToken ?? "";
  if (
    token.length < 32 ||
    token.length > 8_192 ||
    !B2B_TOKEN_PATTERN.test(token)
  ) {
    fail(401, "LANGAME_CURRENT188_B2B_COOKIE_INVALID");
  }

  const route = resolveRoute(input.request);
  assertSameOrigin(input.request);
  if (
    !JSON_CONTENT_TYPE_PATTERN.test(
      input.request.headers.get("content-type")?.trim() ?? "",
    )
  ) {
    fail(415, "LANGAME_CURRENT188_CONTENT_TYPE_INVALID");
  }

  const body = parseRequestJsonBytes(
    await readBoundedRequest(input.request, MAX_REQUEST_BYTES),
  );
  const normalized = normalizePreparedInput(route, body);
  const upstreamPath = resolveUpstreamPath(route);

  return Object.freeze({
    route,
    requestBinding: Object.freeze({
      requestId: normalized.requestId,
      activationReceiptId: normalized.activationReceiptId,
      storeId: normalized.storeId,
    }),
    upstreamPath,
    init: Object.freeze({
      method: "POST" as const,
      headers: Object.freeze({
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      }),
      body: JSON.stringify(normalized.body),
      cache: "no-store" as const,
      redirect: "error" as const,
      credentials: "omit" as const,
    }),
  });
}

export async function projectLangameCurrent188UpstreamResponse(
  prepared: LangameCurrent188PreparedRequest,
  upstream: Response,
): Promise<Response> {
  if (!upstream.ok) {
    await discardBounded(upstream, MAX_RESPONSE_BYTES);
    const status = new Set([400, 401, 403, 404, 409, 423, 503]).has(
      upstream.status,
    )
      ? upstream.status
      : 502;
    return safeJsonResponse(
      { message: "Langame onboarding request failed" },
      status,
    );
  }

  if (
    upstream.status !== EXACT_NEST_POST_STATUS ||
    normalizedContentType(upstream.headers.get("content-type")) !==
      "application/json"
  ) {
    fail(502, "LANGAME_CURRENT188_RESPONSE_TRANSPORT_INVALID");
  }

  const value = parseJsonBytes(await readBounded(upstream, MAX_RESPONSE_BYTES));
  if (prepared.route === "PREVIEW") {
    return safeJsonResponse(
      parsePreviewResponse(value),
      EXACT_NEST_POST_STATUS,
    );
  }
  if (prepared.route === "ACTIVATE") {
    const expectedReceiptId = prepared.requestBinding.activationReceiptId;
    if (!expectedReceiptId) {
      fail(502, "LANGAME_CURRENT188_PREPARED_BINDING_INVALID");
    }
    return safeJsonResponse(
      parseActivationResponse(value, expectedReceiptId),
      EXACT_NEST_POST_STATUS,
    );
  }
  if (prepared.route === "STATUS") {
    return safeJsonResponse(
      parseStatusResponse(value, prepared.requestBinding.storeId),
      EXACT_NEST_POST_STATUS,
    );
  }
  if (prepared.route === "RECONCILE") {
    const expectedReceiptId = prepared.requestBinding.activationReceiptId;
    if (!expectedReceiptId) {
      fail(502, "LANGAME_CURRENT188_PREPARED_BINDING_INVALID");
    }
    return safeJsonResponse(
      parseReconciliationResponse(
        value,
        expectedReceiptId,
        prepared.requestBinding.storeId,
      ),
      EXACT_NEST_POST_STATUS,
    );
  }
  if (prepared.route === "INITIAL_SYNC_PREFLIGHT") {
    const expectedReceiptId = prepared.requestBinding.activationReceiptId;
    const expectedSyncRequestId = prepared.requestBinding.requestId;
    if (!expectedReceiptId || !expectedSyncRequestId) {
      fail(502, "LANGAME_CURRENT188_PREPARED_BINDING_INVALID");
    }
    return safeJsonResponse(
      parseInitialSyncPreflightResponse(
        value,
        expectedReceiptId,
        expectedSyncRequestId,
        prepared.requestBinding.storeId,
      ),
      EXACT_NEST_POST_STATUS,
    );
  }
  fail(502, "LANGAME_CURRENT188_RESPONSE_ROUTE_INVALID");
}

function resolveRoute(request: Request): LangameCurrent188BffRoute {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    fail(404, "LANGAME_CURRENT188_ROUTE_DENIED");
  }
  if (
    request.method === "POST" &&
    url.pathname === PREVIEW_BROWSER_PATH &&
    url.search === "" &&
    url.hash === ""
  ) {
    return "PREVIEW";
  }
  if (
    request.method === "POST" &&
    url.pathname === ACTIVATE_BROWSER_PATH &&
    url.search === "" &&
    url.hash === ""
  ) {
    return "ACTIVATE";
  }
  if (
    request.method === "POST" &&
    url.pathname === STATUS_BROWSER_PATH &&
    url.search === "" &&
    url.hash === ""
  ) {
    return "STATUS";
  }
  if (
    request.method === "POST" &&
    url.pathname === RECONCILE_BROWSER_PATH &&
    url.search === "" &&
    url.hash === ""
  ) {
    return "RECONCILE";
  }
  if (
    request.method === "POST" &&
    url.pathname === INITIAL_SYNC_PREFLIGHT_BROWSER_PATH &&
    url.search === "" &&
    url.hash === ""
  ) {
    return "INITIAL_SYNC_PREFLIGHT";
  }
  fail(404, "LANGAME_CURRENT188_ROUTE_DENIED");
}

function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin || (fetchSite !== null && fetchSite !== "same-origin")) {
    fail(403, "LANGAME_CURRENT188_ORIGIN_DENIED");
  }

  let originUrl: URL;
  let requestUrl: URL;
  try {
    originUrl = new URL(origin);
    requestUrl = new URL(request.url);
  } catch {
    fail(403, "LANGAME_CURRENT188_ORIGIN_DENIED");
  }
  const host = request.headers.get("host")?.trim() || requestUrl.host;
  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",", 1)[0]
    ?.trim()
    .toLowerCase();
  const protocol = forwardedProtocol || requestUrl.protocol.replace(/:$/u, "");
  if (
    originUrl.username ||
    originUrl.password ||
    originUrl.pathname !== "/" ||
    originUrl.search ||
    originUrl.hash ||
    !host ||
    /[\s/?#@]/u.test(host) ||
    (protocol !== "http" && protocol !== "https") ||
    originUrl.host.toLowerCase() !== host.toLowerCase() ||
    originUrl.protocol !== `${protocol}:`
  ) {
    fail(403, "LANGAME_CURRENT188_ORIGIN_DENIED");
  }
}

function normalizePreviewInput(value: unknown) {
  if (!hasExactKeys(value, PREVIEW_INPUT_KEYS)) {
    fail(400, "LANGAME_CURRENT188_PREVIEW_BODY_INVALID");
  }
  const apiKey = requiredApiKey(value.apiKey);
  return {
    requestId: requiredRequestId(value.requestId),
    apiKey,
    domain: requiredDomain(value.domain),
    storeId: requiredStoreId(value.storeId),
    externalClubId: requiredExternalClubId(value.externalClubId),
  };
}

function normalizeActivationInput(value: unknown) {
  if (!hasExactKeys(value, ACTIVATE_INPUT_KEYS)) {
    fail(400, "LANGAME_CURRENT188_ACTIVATION_BODY_INVALID");
  }
  return {
    receiptId: requiredReceiptId(value.receiptId),
    requestId: requiredRequestId(value.requestId),
    configDigest: requiredDigest(value.configDigest),
    storeId: requiredStoreId(value.storeId),
    domain: requiredDomain(value.domain),
    externalClubId: requiredExternalClubId(value.externalClubId),
  };
}

function normalizeStatusInput(value: unknown) {
  if (!hasExactKeys(value, STATUS_INPUT_KEYS)) {
    fail(400, "LANGAME_CURRENT188_STATUS_BODY_INVALID");
  }
  return { storeId: requiredStoreId(value.storeId) };
}

function normalizeReconciliationInput(value: unknown) {
  if (!hasExactKeys(value, RECONCILE_INPUT_KEYS)) {
    fail(400, "LANGAME_CURRENT188_RECONCILIATION_BODY_INVALID");
  }
  return normalizeActivationInput(value);
}

function normalizeInitialSyncPreflightInput(value: unknown) {
  if (!hasExactKeys(value, INITIAL_SYNC_PREFLIGHT_INPUT_KEYS)) {
    fail(400, "LANGAME_CURRENT188_INITIAL_SYNC_PREFLIGHT_BODY_INVALID");
  }
  const activationRequestId = requiredRequestId(value.activationRequestId);
  const syncRequestId = requiredRequestId(value.syncRequestId);
  if (activationRequestId === syncRequestId) {
    fail(400, "LANGAME_CURRENT188_INITIAL_SYNC_PREFLIGHT_BODY_INVALID");
  }
  return {
    receiptId: requiredReceiptId(value.receiptId),
    activationRequestId,
    syncRequestId,
    configDigest: requiredDigest(value.configDigest),
    storeId: requiredStoreId(value.storeId),
    domain: requiredDomain(value.domain),
    externalClubId: requiredExternalClubId(value.externalClubId),
  };
}

function normalizePreparedInput(
  route: LangameCurrent188BffRoute,
  value: unknown,
) {
  if (route === "PREVIEW") {
    const body = normalizePreviewInput(value);
    return {
      body,
      requestId: body.requestId,
      activationReceiptId: null,
      storeId: body.storeId,
    };
  }
  if (route === "ACTIVATE") {
    const body = normalizeActivationInput(value);
    return {
      body,
      requestId: body.requestId,
      activationReceiptId: body.receiptId,
      storeId: body.storeId,
    };
  }
  if (route === "STATUS") {
    const body = normalizeStatusInput(value);
    return {
      body,
      requestId: null,
      activationReceiptId: null,
      storeId: body.storeId,
    };
  }
  if (route === "RECONCILE") {
    const body = normalizeReconciliationInput(value);
    return {
      body,
      requestId: body.requestId,
      activationReceiptId: body.receiptId,
      storeId: body.storeId,
    };
  }
  if (route === "INITIAL_SYNC_PREFLIGHT") {
    const body = normalizeInitialSyncPreflightInput(value);
    return {
      body,
      requestId: body.syncRequestId,
      activationReceiptId: body.receiptId,
      storeId: body.storeId,
    };
  }
  fail(404, "LANGAME_CURRENT188_ROUTE_DENIED");
}

function resolveUpstreamPath(route: LangameCurrent188BffRoute) {
  if (route === "PREVIEW") {
    return "/integrations/langame/onboarding/preview" as const;
  }
  if (route === "ACTIVATE") {
    return "/integrations/langame/onboarding/activate" as const;
  }
  if (route === "STATUS") {
    return "/integrations/langame/onboarding/status" as const;
  }
  if (route === "RECONCILE") {
    return "/integrations/langame/onboarding/reconcile" as const;
  }
  if (route === "INITIAL_SYNC_PREFLIGHT") {
    return "/integrations/langame/onboarding/initial-sync/preflight" as const;
  }
  fail(404, "LANGAME_CURRENT188_ROUTE_DENIED");
}

function parsePreviewResponse(value: unknown) {
  if (
    !hasExactKeys(value, PREVIEW_RESPONSE_KEYS) ||
    value.contractVersion !== CURRENT188_CONTRACT ||
    value.status !== "PENDING" ||
    typeof value.replayed !== "boolean" ||
    value.activationAvailable !== false ||
    value.externalSyncStarted !== false
  ) {
    fail(502, "LANGAME_CURRENT188_PREVIEW_RESPONSE_INVALID");
  }
  return {
    contractVersion: CURRENT188_CONTRACT,
    receiptId: requiredResponseReceiptId(value.receiptId),
    status: "PENDING" as const,
    expiresAt: requiredIsoDate(value.expiresAt),
    configDigest: requiredResponseDigest(value.configDigest),
    bindingDigest: requiredResponseDigest(value.bindingDigest),
    replayed: value.replayed,
    activationAvailable: false as const,
    externalSyncStarted: false as const,
  };
}

function parseActivationResponse(value: unknown, expectedReceiptId: string) {
  if (
    !hasExactKeys(value, ACTIVATE_RESPONSE_KEYS) ||
    value.contractVersion !== CURRENT188_CONTRACT ||
    (value.status !== "ACTIVATED" && value.status !== "REPLAYED") ||
    typeof value.replayed !== "boolean" ||
    value.replayed !== (value.status === "REPLAYED") ||
    value.externalSyncStarted !== false ||
    value.initialReadOnlySyncAvailable !== false ||
    value.productionActivationAllowed !== false
  ) {
    fail(502, "LANGAME_CURRENT188_ACTIVATION_RESPONSE_INVALID");
  }
  const receiptId = requiredResponseReceiptId(value.receiptId);
  if (receiptId !== expectedReceiptId) {
    fail(502, "LANGAME_CURRENT188_ACTIVATION_RECEIPT_BINDING_INVALID");
  }
  return {
    contractVersion: CURRENT188_CONTRACT,
    receiptId,
    status: value.status,
    consumedAt: requiredIsoDate(value.consumedAt),
    claimDigest: requiredResponseDigest(value.claimDigest),
    replayed: value.replayed,
    externalSyncStarted: false as const,
    initialReadOnlySyncAvailable: false as const,
    productionActivationAllowed: false as const,
  };
}

function parseStatusResponse(value: unknown, expectedStoreId: string) {
  if (
    !hasExactKeys(value, STATUS_RESPONSE_KEYS) ||
    value.contractVersion !== CURRENT188_CONTRACT ||
    value.storeId !== expectedStoreId ||
    !["NOT_CONFIGURED", "PENDING", "EXPIRED", "ACTIVATED"].includes(
      typeof value.status === "string" ? value.status : "",
    ) ||
    typeof value.activationAvailable !== "boolean" ||
    value.reconciliationAvailable !== false ||
    value.initialReadOnlySyncAvailable !== false ||
    value.productionStatusAllowed !== false
  ) {
    fail(502, "LANGAME_CURRENT188_STATUS_RESPONSE_INVALID");
  }

  if (value.status === "NOT_CONFIGURED") {
    for (const key of [
      "activatedAt",
      "bindingDigest",
      "claimDigest",
      "configDigest",
      "consumedAt",
      "expiresAt",
      "externalClubId",
      "externalDomain",
      "receiptId",
    ] as const) {
      if (value[key] !== null) {
        fail(502, "LANGAME_CURRENT188_STATUS_RESPONSE_INVALID");
      }
    }
    if (value.activationAvailable) {
      fail(502, "LANGAME_CURRENT188_STATUS_RESPONSE_INVALID");
    }
    return {
      contractVersion: CURRENT188_CONTRACT,
      storeId: expectedStoreId,
      status: "NOT_CONFIGURED" as const,
      receiptId: null,
      expiresAt: null,
      consumedAt: null,
      configDigest: null,
      bindingDigest: null,
      externalDomain: null,
      externalClubId: null,
      claimDigest: null,
      activatedAt: null,
      activationAvailable: false as const,
      reconciliationAvailable: false as const,
      initialReadOnlySyncAvailable: false as const,
      productionStatusAllowed: false as const,
    };
  }

  const receiptId = requiredResponseReceiptId(value.receiptId);
  const expiresAt = requiredIsoDate(value.expiresAt);
  const configDigest = requiredResponseDigest(value.configDigest);
  const bindingDigest = requiredResponseDigest(value.bindingDigest);
  if (value.status === "PENDING" || value.status === "EXPIRED") {
    if (
      value.consumedAt !== null ||
      value.externalDomain !== null ||
      value.externalClubId !== null ||
      value.claimDigest !== null ||
      value.activatedAt !== null ||
      (value.status === "EXPIRED" && value.activationAvailable)
    ) {
      fail(502, "LANGAME_CURRENT188_STATUS_RESPONSE_INVALID");
    }
    return {
      contractVersion: CURRENT188_CONTRACT,
      storeId: expectedStoreId,
      status: value.status,
      receiptId,
      expiresAt,
      consumedAt: null,
      configDigest,
      bindingDigest,
      externalDomain: null,
      externalClubId: null,
      claimDigest: null,
      activatedAt: null,
      activationAvailable: value.activationAvailable,
      reconciliationAvailable: false as const,
      initialReadOnlySyncAvailable: false as const,
      productionStatusAllowed: false as const,
    };
  }

  if (
    value.status !== "ACTIVATED" ||
    value.activationAvailable ||
    requiredResponseDigest(value.claimDigest) !== bindingDigest
  ) {
    fail(502, "LANGAME_CURRENT188_STATUS_RESPONSE_INVALID");
  }
  return {
    contractVersion: CURRENT188_CONTRACT,
    storeId: expectedStoreId,
    status: "ACTIVATED" as const,
    receiptId,
    expiresAt,
    consumedAt: requiredIsoDate(value.consumedAt),
    configDigest,
    bindingDigest,
    externalDomain: requiredResponseDomain(value.externalDomain),
    externalClubId: requiredResponseExternalClubId(value.externalClubId),
    claimDigest: bindingDigest,
    activatedAt: requiredIsoDate(value.activatedAt),
    activationAvailable: false as const,
    reconciliationAvailable: false as const,
    initialReadOnlySyncAvailable: false as const,
    productionStatusAllowed: false as const,
  };
}

function parseReconciliationResponse(
  value: unknown,
  expectedReceiptId: string,
  expectedStoreId: string,
) {
  if (
    !hasExactKeys(value, RECONCILE_RESPONSE_KEYS) ||
    value.contractVersion !== CURRENT188_CONTRACT ||
    value.receiptId !== expectedReceiptId ||
    value.storeId !== expectedStoreId ||
    !["ACTIVATED", "NOT_APPLIED", "EXPIRED"].includes(
      typeof value.outcome === "string" ? value.outcome : "",
    ) ||
    typeof value.retryActivationAllowed !== "boolean" ||
    value.externalSyncStarted !== false ||
    value.initialReadOnlySyncAvailable !== false ||
    value.productionReconciliationAllowed !== false
  ) {
    fail(502, "LANGAME_CURRENT188_RECONCILIATION_RESPONSE_INVALID");
  }

  if (value.outcome === "ACTIVATED") {
    if (value.retryActivationAllowed) {
      fail(502, "LANGAME_CURRENT188_RECONCILIATION_RESPONSE_INVALID");
    }
    return {
      contractVersion: CURRENT188_CONTRACT,
      receiptId: expectedReceiptId,
      storeId: expectedStoreId,
      outcome: "ACTIVATED" as const,
      consumedAt: requiredIsoDate(value.consumedAt),
      claimDigest: requiredResponseDigest(value.claimDigest),
      retryActivationAllowed: false as const,
      externalSyncStarted: false as const,
      initialReadOnlySyncAvailable: false as const,
      productionReconciliationAllowed: false as const,
    };
  }

  if (
    value.consumedAt !== null ||
    value.claimDigest !== null ||
    value.retryActivationAllowed !== (value.outcome === "NOT_APPLIED")
  ) {
    fail(502, "LANGAME_CURRENT188_RECONCILIATION_RESPONSE_INVALID");
  }
  return {
    contractVersion: CURRENT188_CONTRACT,
    receiptId: expectedReceiptId,
    storeId: expectedStoreId,
    outcome: value.outcome as "NOT_APPLIED" | "EXPIRED",
    consumedAt: null,
    claimDigest: null,
    retryActivationAllowed: value.outcome === "NOT_APPLIED",
    externalSyncStarted: false as const,
    initialReadOnlySyncAvailable: false as const,
    productionReconciliationAllowed: false as const,
  };
}

function parseInitialSyncPreflightResponse(
  value: unknown,
  expectedReceiptId: string,
  expectedSyncRequestId: string,
  expectedStoreId: string,
) {
  if (
    !hasExactKeys(value, INITIAL_SYNC_PREFLIGHT_RESPONSE_KEYS) ||
    value.contractVersion !== CURRENT188_CONTRACT ||
    value.receiptId !== expectedReceiptId ||
    value.syncRequestId !== expectedSyncRequestId ||
    value.storeId !== expectedStoreId ||
    value.status !== "READY" ||
    value.providerReadsPerformed !== 3 ||
    value.providerWritesStarted !== false ||
    value.platformImportStarted !== false ||
    value.initialReadOnlySyncAvailable !== false ||
    value.productionPreflightAllowed !== false ||
    !hasExactKeys(value.readSet, INITIAL_SYNC_PREFLIGHT_READ_SET_KEYS) ||
    value.readSet.selectedClubs !== 1 ||
    !boundedNonNegativeInteger(value.readSet.products, 50_000) ||
    !boundedNonNegativeInteger(value.readSet.inventoryItems, 50_000)
  ) {
    fail(502, "LANGAME_CURRENT188_INITIAL_SYNC_PREFLIGHT_RESPONSE_INVALID");
  }
  return {
    contractVersion: CURRENT188_CONTRACT,
    receiptId: expectedReceiptId,
    storeId: expectedStoreId,
    syncRequestId: expectedSyncRequestId,
    status: "READY" as const,
    approvalDigest: requiredResponseDigest(value.approvalDigest),
    readSetDigest: requiredResponseDigest(value.readSetDigest),
    readSet: {
      selectedClubs: 1 as const,
      products: value.readSet.products,
      inventoryItems: value.readSet.inventoryItems,
    },
    providerReadsPerformed: 3 as const,
    providerWritesStarted: false as const,
    platformImportStarted: false as const,
    initialReadOnlySyncAvailable: false as const,
    productionPreflightAllowed: false as const,
  };
}

function boundedNonNegativeInteger(value: unknown, maximum: number) {
  return (
    Number.isSafeInteger(value) &&
    Number(value) >= 0 &&
    Number(value) <= maximum
  );
}

function requiredApiKey(value: unknown): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (
    normalized.length < 1 ||
    normalized.length > 4_096 ||
    API_KEY_CONTROL_PATTERN.test(normalized)
  ) {
    fail(400, "LANGAME_CURRENT188_API_KEY_INVALID");
  }
  return normalized;
}

function requiredRequestId(value: unknown): string {
  const normalized = normalizedString(value);
  if (!REQUEST_ID_PATTERN.test(normalized)) {
    fail(400, "LANGAME_CURRENT188_REQUEST_ID_INVALID");
  }
  return normalized;
}

function requiredStoreId(value: unknown): string {
  const normalized = normalizedString(value);
  if (!STORE_ID_PATTERN.test(normalized)) {
    fail(400, "LANGAME_CURRENT188_STORE_ID_INVALID");
  }
  return normalized;
}

function requiredExternalClubId(value: unknown): string {
  const normalized = normalizedString(value);
  if (!EXTERNAL_CLUB_ID_PATTERN.test(normalized)) {
    fail(400, "LANGAME_CURRENT188_EXTERNAL_CLUB_ID_INVALID");
  }
  return normalized;
}

function requiredReceiptId(value: unknown): string {
  const normalized = normalizedString(value);
  if (!RECEIPT_ID_PATTERN.test(normalized)) {
    fail(400, "LANGAME_CURRENT188_RECEIPT_ID_INVALID");
  }
  return normalized.toLowerCase();
}

function requiredDigest(value: unknown): string {
  const normalized = normalizedString(value);
  if (!DIGEST_PATTERN.test(normalized)) {
    fail(400, "LANGAME_CURRENT188_CONFIG_DIGEST_INVALID");
  }
  return normalized;
}

function requiredDomain(value: unknown): string {
  const normalized = normalizedString(value).toLowerCase();
  if (
    normalized.length > 253 ||
    !LANGAME_DOMAIN_PATTERN.test(normalized) ||
    normalized.includes("..") ||
    !["langame.ru", "langamepro.ru"].some(
      (suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`),
    )
  ) {
    fail(400, "LANGAME_CURRENT188_DOMAIN_INVALID");
  }
  return normalized;
}

function requiredResponseReceiptId(value: unknown): string {
  if (typeof value !== "string" || !RECEIPT_ID_PATTERN.test(value)) {
    fail(502, "LANGAME_CURRENT188_RESPONSE_RECEIPT_ID_INVALID");
  }
  return value.toLowerCase();
}

function requiredResponseDigest(value: unknown): string {
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) {
    fail(502, "LANGAME_CURRENT188_RESPONSE_DIGEST_INVALID");
  }
  return value;
}

function requiredResponseDomain(value: unknown): string {
  if (typeof value !== "string") {
    fail(502, "LANGAME_CURRENT188_STATUS_RESPONSE_INVALID");
  }
  const normalized = value.toLowerCase();
  if (normalized !== value) {
    fail(502, "LANGAME_CURRENT188_STATUS_RESPONSE_INVALID");
  }
  try {
    return requiredDomain(value);
  } catch {
    fail(502, "LANGAME_CURRENT188_STATUS_RESPONSE_INVALID");
  }
}

function requiredResponseExternalClubId(value: unknown): string {
  if (typeof value !== "string" || !EXTERNAL_CLUB_ID_PATTERN.test(value)) {
    fail(502, "LANGAME_CURRENT188_STATUS_RESPONSE_INVALID");
  }
  return value;
}

function requiredIsoDate(value: unknown): string {
  if (typeof value !== "string") {
    fail(502, "LANGAME_CURRENT188_RESPONSE_DATE_INVALID");
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    fail(502, "LANGAME_CURRENT188_RESPONSE_DATE_INVALID");
  }
  return value;
}

function normalizedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseRequestJsonBytes(value: Uint8Array): unknown {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(value);
    return JSON.parse(text) as unknown;
  } catch {
    fail(400, "LANGAME_CURRENT188_REQUEST_JSON_INVALID");
  }
}

function parseJsonBytes(value: Uint8Array): unknown {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(value);
    return JSON.parse(text) as unknown;
  } catch {
    fail(502, "LANGAME_CURRENT188_RESPONSE_JSON_INVALID");
  }
}

function hasExactKeys<const TKeys extends readonly string[]>(
  value: unknown,
  expected: TKeys,
): value is Record<TKeys[number], unknown> {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    expected.every((key, index) => actual[index] === key)
  );
}

async function discardBounded(
  response: Response,
  limit: number,
): Promise<void> {
  try {
    await readBounded(response, limit);
  } catch {
    await response.body?.cancel().catch(() => undefined);
  }
}

async function readBoundedRequest(
  request: Request,
  limit: number,
): Promise<Uint8Array> {
  const declaredLength = exactRequestContentLength(
    request.headers.get("content-length"),
  );
  if (declaredLength !== null && declaredLength > limit) {
    fail(413, "LANGAME_CURRENT188_REQUEST_TOO_LARGE");
  }
  if (!request.body) {
    fail(400, "LANGAME_CURRENT188_REQUEST_BODY_REQUIRED");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        fail(413, "LANGAME_CURRENT188_REQUEST_TOO_LARGE");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof LangameCurrent188BffCandidateError) {
      throw error;
    }
    fail(400, "LANGAME_CURRENT188_REQUEST_BODY_INVALID");
  } finally {
    reader.releaseLock();
  }

  if (total < 2) {
    fail(400, "LANGAME_CURRENT188_REQUEST_BODY_REQUIRED");
  }
  if (declaredLength !== null && declaredLength !== total) {
    fail(400, "LANGAME_CURRENT188_REQUEST_LENGTH_MISMATCH");
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

async function readBounded(
  response: Response,
  limit: number,
): Promise<Uint8Array> {
  const declaredLength = exactContentLength(
    response.headers.get("content-length"),
  );
  if (declaredLength !== null && declaredLength > limit) {
    fail(502, "LANGAME_CURRENT188_RESPONSE_TOO_LARGE");
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        fail(502, "LANGAME_CURRENT188_RESPONSE_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

function exactContentLength(value: string | null): number | null {
  if (value === null) return null;
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) {
    fail(502, "LANGAME_CURRENT188_RESPONSE_LENGTH_INVALID");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    fail(502, "LANGAME_CURRENT188_RESPONSE_LENGTH_INVALID");
  }
  return parsed;
}

function exactRequestContentLength(value: string | null): number | null {
  if (value === null) return null;
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) {
    fail(400, "LANGAME_CURRENT188_REQUEST_LENGTH_INVALID");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    fail(400, "LANGAME_CURRENT188_REQUEST_LENGTH_INVALID");
  }
  return parsed;
}

function normalizedContentType(value: string | null): string | null {
  const contentType = value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return contentType || null;
}

function safeJsonResponse(value: unknown, status: number): Response {
  const headers = new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
    Vary: "Cookie, Authorization",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Content-Type": "application/json; charset=utf-8",
  });
  return new Response(JSON.stringify(value), { status, headers });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(status: number, reasonCode: string): never {
  throw new LangameCurrent188BffCandidateError(status, reasonCode);
}
