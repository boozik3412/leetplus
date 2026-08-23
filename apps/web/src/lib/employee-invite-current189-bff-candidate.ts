const MAXIMUM_COMMAND_BYTES = 8 * 1024;
const MAXIMUM_RECEIPT_BYTES = 4 * 1024;
const B2B_TOKEN_PATTERN = /^[A-Za-z0-9._~-]{32,8192}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const CANONICAL_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const ISSUE_FIELDS = new Set([
  "requestId",
  "email",
  "fullName",
  "role",
  "customRoleId",
  "scope",
  "storeIds",
  "expiresAt",
]);
const REVOKE_FIELDS = new Set(["requestId", "reason"]);

export const EMPLOYEE_INVITE_CURRENT189_BFF_CANDIDATE_ACTIVE = false as const;

export type EmployeeInviteCurrent189BffOperation =
  | "ISSUE"
  | "REISSUE"
  | "REVOKE";

export type EmployeeInviteCurrent189PreparedRequest = Readonly<{
  operation: EmployeeInviteCurrent189BffOperation;
  routeInviteId: string | null;
  upstreamPath: string;
  init: Readonly<{
    method: "POST" | "PATCH" | "DELETE";
    headers: Readonly<Record<string, string>>;
    body: string;
    cache: "no-store";
    redirect: "error";
    credentials: "omit";
  }>;
}>;

export class EmployeeInviteCurrent189BffCandidateError extends Error {
  readonly status: number;
  readonly reasonCode: string;

  constructor(status: number, reasonCode: string) {
    super(reasonCode);
    this.name = "EmployeeInviteCurrent189BffCandidateError";
    this.status = status;
    this.reasonCode = reasonCode;
  }
}

/**
 * Dormant, unimported BFF transport for CURRENT189 employee invite commands.
 *
 * A future Route Handler may obtain b2bCookieToken with the async cookies()
 * API, but this helper never reads or writes cookies itself. It forwards only
 * a bearer header derived from that server-side value and canonical JSON.
 */
export async function prepareEmployeeInviteCurrent189BffRequest(input: {
  request: Request;
  operation: EmployeeInviteCurrent189BffOperation;
  routeInviteId?: string | null;
  b2bCookieToken: string | null | undefined;
}): Promise<EmployeeInviteCurrent189PreparedRequest> {
  const contract = routeContract(input.operation, input.routeInviteId ?? null);
  const token = input.b2bCookieToken ?? "";
  if (!B2B_TOKEN_PATTERN.test(token)) {
    fail(401, "EMPLOYEE_INVITE_CURRENT189_BFF_COOKIE_INVALID");
  }
  assertExactRequestRoute(input.request, contract.method, contract.browserPath);
  assertSameOrigin(input.request);
  if (
    input.request.headers.get("content-type")?.trim().toLowerCase() !==
    "application/json"
  ) {
    fail(415, "EMPLOYEE_INVITE_CURRENT189_BFF_MEDIA_TYPE_INVALID");
  }

  const bytes = await readBoundedBody(
    input.request,
    MAXIMUM_COMMAND_BYTES,
    413,
    400,
  );
  const declaredLength = exactContentLength(
    input.request.headers.get("content-length"),
  );
  if (declaredLength !== null && declaredLength !== bytes.length) {
    fail(400, "EMPLOYEE_INVITE_CURRENT189_BFF_CONTENT_LENGTH_MISMATCH");
  }
  const payload = parseJsonRecord(bytes);
  const fields = input.operation === "REVOKE" ? REVOKE_FIELDS : ISSUE_FIELDS;
  if (!payload || !exactKeys(payload, fields)) {
    fail(400, "EMPLOYEE_INVITE_CURRENT189_BFF_BODY_SHAPE_INVALID");
  }
  const requestId = payload.requestId;
  if (typeof requestId !== "string" || !UUID_PATTERN.test(requestId)) {
    fail(400, "EMPLOYEE_INVITE_CURRENT189_BFF_REQUEST_ID_INVALID");
  }
  const canonicalPayload = Object.fromEntries(
    [...fields].map((field) => [field, payload[field]]),
  );
  const body = JSON.stringify(canonicalPayload);
  if (Buffer.byteLength(body, "utf8") > MAXIMUM_COMMAND_BYTES) {
    fail(413, "EMPLOYEE_INVITE_CURRENT189_BFF_BODY_TOO_LARGE");
  }

  return Object.freeze({
    operation: input.operation,
    routeInviteId: contract.routeInviteId,
    upstreamPath: contract.upstreamPath,
    init: Object.freeze({
      method: contract.method,
      headers: Object.freeze({
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": requestId,
      }),
      body,
      cache: "no-store" as const,
      redirect: "error" as const,
      credentials: "omit" as const,
    }),
  });
}

export async function projectEmployeeInviteCurrent189UpstreamResponse(
  prepared: EmployeeInviteCurrent189PreparedRequest,
  upstream: Response,
): Promise<Response> {
  if (!upstream.ok) {
    await discardBounded(upstream, MAXIMUM_RECEIPT_BYTES);
    const status = new Set([400, 401, 403, 404, 409, 423, 503]).has(
      upstream.status,
    )
      ? upstream.status
      : 502;
    return safeJsonResponse(
      { message: "Employee invite request failed" },
      status,
    );
  }

  const expectedStatus = prepared.operation === "ISSUE" ? 201 : 200;
  if (
    upstream.status !== expectedStatus ||
    normalizedContentType(upstream.headers.get("content-type")) !==
      "application/json"
  ) {
    fail(502, "EMPLOYEE_INVITE_CURRENT189_BFF_RECEIPT_TRANSPORT_INVALID");
  }
  const bytes = await readBoundedBody(
    upstream,
    MAXIMUM_RECEIPT_BYTES,
    502,
    502,
  );
  const receipt = parseJsonRecord(bytes);
  if (!validReceipt(prepared, receipt)) {
    fail(502, "EMPLOYEE_INVITE_CURRENT189_BFF_RECEIPT_INVALID");
  }

  return safeJsonResponse(
    {
      ok: true,
      routeContract: receipt.routeContract,
      operation: receipt.operation,
      decision: receipt.decision,
      replayed: receipt.replayed,
      invite: {
        id: receipt.invite.id,
        deliveryStatus: receipt.invite.deliveryStatus,
        expiresAt: receipt.invite.expiresAt,
      },
      replacedInviteId: receipt.replacedInviteId,
    },
    expectedStatus,
  );
}

function routeContract(
  operation: EmployeeInviteCurrent189BffOperation,
  routeInviteId: string | null,
): Readonly<{
  method: "POST" | "PATCH" | "DELETE";
  browserPath: string;
  upstreamPath: string;
  routeInviteId: string | null;
}> {
  if (operation === "ISSUE") {
    if (routeInviteId !== null) {
      fail(404, "EMPLOYEE_INVITE_CURRENT189_BFF_ROUTE_DENIED");
    }
    return {
      method: "POST",
      browserPath: "/api/users/invites",
      upstreamPath: "/users/invites",
      routeInviteId: null,
    };
  }
  if (!routeInviteId || !UUID_PATTERN.test(routeInviteId)) {
    fail(404, "EMPLOYEE_INVITE_CURRENT189_BFF_ROUTE_DENIED");
  }
  return {
    method: operation === "REISSUE" ? "PATCH" : "DELETE",
    browserPath: `/api/users/invites/${routeInviteId}`,
    upstreamPath: `/users/invites/${routeInviteId}`,
    routeInviteId,
  };
}

function assertExactRequestRoute(
  request: Request,
  method: string,
  pathname: string,
): void {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    fail(404, "EMPLOYEE_INVITE_CURRENT189_BFF_ROUTE_DENIED");
  }
  if (
    request.method !== method ||
    url.pathname !== pathname ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    fail(404, "EMPLOYEE_INVITE_CURRENT189_BFF_ROUTE_DENIED");
  }
}

function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin || (fetchSite !== null && fetchSite !== "same-origin")) {
    fail(403, "EMPLOYEE_INVITE_CURRENT189_BFF_ORIGIN_DENIED");
  }
  let originUrl: URL;
  let requestUrl: URL;
  try {
    originUrl = new URL(origin);
    requestUrl = new URL(request.url);
  } catch {
    fail(403, "EMPLOYEE_INVITE_CURRENT189_BFF_ORIGIN_DENIED");
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
    fail(403, "EMPLOYEE_INVITE_CURRENT189_BFF_ORIGIN_DENIED");
  }
}

function validReceipt(
  prepared: EmployeeInviteCurrent189PreparedRequest,
  value: Record<string, unknown> | null,
): value is Record<string, unknown> & {
  routeContract: "EMPLOYEE_INVITE_CURRENT189_ROUTE_V1";
  operation:
    | "ISSUE_EMPLOYEE_INVITE"
    | "REISSUE_EMPLOYEE_INVITE"
    | "REVOKE_EMPLOYEE_INVITE";
  decision: "CREATED" | "REISSUED" | "REVOKED" | "REPLAYED";
  replayed: boolean;
  invite: {
    id: string;
    deliveryStatus: "PENDING" | "CANCELED";
    expiresAt: string | null;
  };
  replacedInviteId: string | null;
} {
  if (
    !value ||
    !exactKeys(
      value,
      new Set([
        "ok",
        "routeContract",
        "operation",
        "decision",
        "replayed",
        "invite",
        "replacedInviteId",
      ]),
    ) ||
    value.ok !== true ||
    value.routeContract !== "EMPLOYEE_INVITE_CURRENT189_ROUTE_V1" ||
    typeof value.replayed !== "boolean" ||
    value.replayed !== (value.decision === "REPLAYED") ||
    !record(value.invite) ||
    !exactKeys(value.invite, new Set(["id", "deliveryStatus", "expiresAt"])) ||
    typeof value.invite.id !== "string" ||
    !UUID_PATTERN.test(value.invite.id)
  ) {
    return false;
  }

  const expectedOperation = `${prepared.operation}_EMPLOYEE_INVITE`;
  const expectedStatus =
    prepared.operation === "REVOKE" ? "CANCELED" : "PENDING";
  const decisionAllowed =
    value.decision === "REPLAYED" ||
    (prepared.operation === "ISSUE" && value.decision === "CREATED") ||
    (prepared.operation === "REISSUE" && value.decision === "REISSUED") ||
    (prepared.operation === "REVOKE" && value.decision === "REVOKED");
  const expirationAllowed =
    expectedStatus === "CANCELED"
      ? value.invite.expiresAt === null
      : canonicalTimestamp(value.invite.expiresAt);
  const routeBindingAllowed =
    prepared.operation === "ISSUE"
      ? value.replacedInviteId === null
      : prepared.operation === "REISSUE"
        ? value.replacedInviteId === prepared.routeInviteId &&
          value.invite.id !== prepared.routeInviteId
        : value.replacedInviteId === null &&
          value.invite.id === prepared.routeInviteId;

  return (
    value.operation === expectedOperation &&
    decisionAllowed &&
    value.invite.deliveryStatus === expectedStatus &&
    expirationAllowed &&
    routeBindingAllowed
  );
}

async function discardBounded(
  response: Response,
  limit: number,
): Promise<void> {
  try {
    await readBoundedBody(response, limit, 502, 502);
  } catch {
    await response.body?.cancel().catch(() => undefined);
  }
}

async function readBoundedBody(
  message: Request | Response,
  limit: number,
  oversizedStatus: number,
  invalidStatus: number,
): Promise<Buffer> {
  const declaredLength = exactContentLength(
    message.headers.get("content-length"),
    oversizedStatus,
  );
  if (declaredLength !== null && declaredLength > limit) {
    fail(oversizedStatus, "EMPLOYEE_INVITE_CURRENT189_BFF_BODY_TOO_LARGE");
  }
  if (!message.body) {
    fail(invalidStatus, "EMPLOYEE_INVITE_CURRENT189_BFF_BODY_REQUIRED");
  }
  const reader = message.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        fail(oversizedStatus, "EMPLOYEE_INVITE_CURRENT189_BFF_BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof EmployeeInviteCurrent189BffCandidateError) {
      throw error;
    }
    fail(invalidStatus, "EMPLOYEE_INVITE_CURRENT189_BFF_BODY_INVALID");
  } finally {
    reader.releaseLock();
  }
  if (total < 2) {
    fail(invalidStatus, "EMPLOYEE_INVITE_CURRENT189_BFF_BODY_REQUIRED");
  }
  return Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk)),
    total,
  );
}

function parseJsonRecord(bytes: Buffer): Record<string, unknown> | null {
  try {
    const value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
    return record(value) ? value : null;
  } catch {
    return null;
  }
}

function exactContentLength(
  value: string | null,
  invalidStatus = 400,
): number | null {
  if (value === null) return null;
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    fail(
      invalidStatus,
      "EMPLOYEE_INVITE_CURRENT189_BFF_CONTENT_LENGTH_INVALID",
    );
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed)
    ? parsed
    : fail(
        invalidStatus,
        "EMPLOYEE_INVITE_CURRENT189_BFF_CONTENT_LENGTH_INVALID",
      );
}

function exactKeys(
  value: Record<string, unknown>,
  fields: ReadonlySet<string>,
): boolean {
  const keys = Object.keys(value);
  return keys.length === fields.size && keys.every((key) => fields.has(key));
}

function normalizedContentType(value: string | null): string | null {
  const contentType = value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return contentType || null;
}

function canonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !CANONICAL_TIMESTAMP_PATTERN.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function safeJsonResponse(value: unknown, status: number): Response {
  const headers = new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
    Vary: "Cookie, Authorization, Idempotency-Key",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Content-Type": "application/json; charset=utf-8",
  });
  return new Response(JSON.stringify(value), { status, headers });
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(status: number, reasonCode: string): never {
  throw new EmployeeInviteCurrent189BffCandidateError(status, reasonCode);
}
