import { isCanonicalInviteToken } from "./invite-secret.mts";

export const MAX_INVITE_REQUEST_BYTES = 4_096;
export const INVITE_ERROR_MESSAGE = "Некорректный запрос приглашения";

export type ParsedInviteRequest =
  | {
      ok: true;
      payload: Record<string, unknown> & { token: string };
    }
  | {
      ok: false;
      status: number;
    };

export type InvitePreviewProjection = {
  email: string | null;
  fullName: string | null;
  role: string;
  customRole: {
    id: string;
    name: string;
    description: string | null;
    permissions: string[];
  } | null;
  tenant: {
    name: string;
    slug: string;
  };
  scope: "NETWORK" | "STORES";
  stores: Array<{
    id: string;
    name: string;
    isActive: boolean;
  }>;
  expiresAt: string;
};

const USER_ROLES = new Set([
  "OWNER",
  "MANAGER",
  "BUYER",
  "ADMIN",
  "MARKETER",
  "CLUB_MANAGER",
  "STANDARDS_MANAGER",
  "SENIOR_ADMINISTRATOR",
  "CLUB_ADMINISTRATOR",
  "TRAINEE",
]);

export async function parseInviteRequest(
  request: Request,
  allowedFields: ReadonlySet<string>,
): Promise<ParsedInviteRequest> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0];
  if (contentType?.trim().toLowerCase() !== "application/json") {
    return { ok: false, status: 415 };
  }

  const origin = request.headers.get("origin");
  if (!origin || !sameRequestOrigin(request, origin)) {
    return { ok: false, status: 403 };
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") {
    return { ok: false, status: 403 };
  }

  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength &&
    (!/^\d+$/u.test(declaredLength) ||
      Number(declaredLength) > MAX_INVITE_REQUEST_BYTES)
  ) {
    return { ok: false, status: 413 };
  }

  const body = await readBoundedUtf8Body(request);
  if (!body.ok) {
    return body;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body.value) as unknown;
  } catch {
    return { ok: false, status: 400 };
  }
  if (!isRecord(payload)) {
    return { ok: false, status: 400 };
  }

  const fields = Object.keys(payload);
  if (
    fields.some((field) => !allowedFields.has(field)) ||
    !isCanonicalInviteToken(payload.token)
  ) {
    return { ok: false, status: 400 };
  }

  return {
    ok: true,
    payload: payload as Record<string, unknown> & { token: string },
  };
}

export function projectInvitePreview(
  value: unknown,
  token: string,
): InvitePreviewProjection | null {
  if (!isRecord(value)) {
    return null;
  }

  const customRole = projectCustomRole(value.customRole);
  const tenant = value.tenant;
  const stores = value.stores;
  if (
    !nullableString(value.email) ||
    !nullableString(value.fullName) ||
    typeof value.role !== "string" ||
    !USER_ROLES.has(value.role) ||
    customRole === undefined ||
    !isRecord(tenant) ||
    typeof tenant.name !== "string" ||
    typeof tenant.slug !== "string" ||
    (value.scope !== "NETWORK" && value.scope !== "STORES") ||
    !Array.isArray(stores) ||
    typeof value.expiresAt !== "string"
  ) {
    return null;
  }

  const projectedStores = stores.map(projectStore);
  if (projectedStores.some((store) => store === null)) {
    return null;
  }

  const projection: InvitePreviewProjection = {
    email: value.email,
    fullName: value.fullName,
    role: value.role,
    customRole,
    tenant: {
      name: tenant.name,
      slug: tenant.slug,
    },
    scope: value.scope,
    stores: projectedStores as InvitePreviewProjection["stores"],
    expiresAt: value.expiresAt,
  };

  return JSON.stringify(projection).includes(token) ? null : projection;
}

export function safeInviteError(
  message: string | null,
  token: string,
): string {
  if (!message || message.includes(token)) {
    return INVITE_ERROR_MESSAGE;
  }
  return message;
}

async function readBoundedUtf8Body(
  request: Request,
): Promise<
  { ok: true; value: string } | { ok: false; status: number }
> {
  if (!request.body) {
    return { ok: false, status: 400 };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > MAX_INVITE_REQUEST_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // The request is already rejected; cancellation errors are not exposed.
        }
        return { ok: false, status: 413 };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400 };
  } finally {
    reader.releaseLock();
  }

  if (totalBytes === 0) {
    return { ok: false, status: 400 };
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return {
      ok: true,
      value: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    };
  } catch {
    return { ok: false, status: 400 };
  }
}

function sameRequestOrigin(request: Request, origin: string): boolean {
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }
  if (
    originUrl.username ||
    originUrl.password ||
    originUrl.pathname !== "/" ||
    originUrl.search ||
    originUrl.hash
  ) {
    return false;
  }

  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",", 1)[0]
    ?.trim();
  const requestHost =
    request.headers.get("host")?.split(",", 1)[0]?.trim() || forwardedHost;
  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",", 1)[0]
    ?.trim()
    .toLowerCase();
  const requestProtocol =
    forwardedProtocol || new URL(request.url).protocol.replace(/:$/u, "");
  if (
    !requestHost ||
    /[\s/?#@]/u.test(requestHost) ||
    (requestProtocol !== "http" && requestProtocol !== "https")
  ) {
    return false;
  }

  return (
    originUrl.host.toLowerCase() === requestHost.toLowerCase() &&
    originUrl.protocol === `${requestProtocol}:`
  );
}

function projectCustomRole(
  value: unknown,
): InvitePreviewProjection["customRole"] | undefined {
  if (value === null) {
    return null;
  }
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    !nullableString(value.description) ||
    !Array.isArray(value.permissions) ||
    !value.permissions.every((permission) => typeof permission === "string")
  ) {
    return undefined;
  }
  return {
    id: value.id,
    name: value.name,
    description: value.description,
    permissions: value.permissions,
  };
}

function projectStore(
  value: unknown,
): InvitePreviewProjection["stores"][number] | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.isActive !== "boolean"
  ) {
    return null;
  }
  return {
    id: value.id,
    name: value.name,
    isActive: value.isActive,
  };
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
