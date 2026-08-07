import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const API_ROUTE_ROOT = fileURLToPath(new URL("../app/api", import.meta.url));

const PROTECTED_PILOT_PREFIXES = [
  "categories/",
  "guest-game/media/route.ts",
  "guests/gamification/",
  "guests/staff-control/",
  "imports/",
  "integrations/",
  "products/",
  "reports/",
  "settings/",
  "staff/",
  "stores/",
  "suppliers/",
  "users/",
  "utilities/product-parsing/",
] as const;

const EXPECTED_PROTECTED_ROUTE_FILES = 130;
const EXPECTED_PROTECTED_HANDLERS = 158;
const EXPECTED_PROTECTED_INVENTORY_SHA256 =
  "ec4c892f14bb5db02ac1f35691723cbd002f7a4f6b7a4985b3cb8060bda580d1";

const KNOWN_PUBLIC_GAME_BOUNDARIES = new Map([
  ["guest-game/media/[id]/route.ts", ["GET"]],
  ["guest-portal/[...path]/route.ts", ["GET", "POST"]],
]);

type RouteInventoryRow = Readonly<{
  file: string;
  methods: readonly string[];
  source: string;
}>;

test("pins every protected pilot BFF handler and requires cookie-backed auth", async () => {
  const inventory = (await routeInventory()).filter(({ file }) =>
    PROTECTED_PILOT_PREFIXES.some((prefix) =>
      prefix.endsWith("route.ts")
        ? file === prefix
        : file.startsWith(prefix),
    ),
  );
  const handlerCount = inventory.reduce(
    (total, route) => total + route.methods.length,
    0,
  );

  assert.equal(inventory.length, EXPECTED_PROTECTED_ROUTE_FILES);
  assert.equal(handlerCount, EXPECTED_PROTECTED_HANDLERS);
  assert.equal(
    inventoryDigest(inventory),
    EXPECTED_PROTECTED_INVENTORY_SHA256,
  );

  for (const route of inventory) {
    const delegatesToProtectedProxy =
      /proxy(?:Json|File)Request/.test(route.source);
    const performsDirectCookieAdmission =
      /getAuthHeaders/.test(route.source) &&
      /if\s*\(\s*!headers\.Authorization\s*\)/m.test(route.source) &&
      /status:\s*401/.test(route.source);

    assert.ok(
      delegatesToProtectedProxy || performsDirectCookieAdmission,
      `${route.file} does not prove BFF authentication`,
    );
    assert.doesNotMatch(
      route.source,
      /cache\s*:\s*["']force-cache["']/,
      `${route.file} must not cache authenticated upstream data`,
    );
    assert.doesNotMatch(
      route.source,
      /["']Cache-Control["']\s*:\s*["']public/i,
      `${route.file} must not publish an authenticated response`,
    );
  }
});

test("keeps the public game BFF surface exact while CURRENT190 is dormant", async () => {
  const publicGameRoutes = (await routeInventory()).filter(
    ({ file }) =>
      file.startsWith("guest-portal/") ||
      file === "guest-game/media/[id]/route.ts",
  );

  assert.deepEqual(
    publicGameRoutes.map(({ file, methods }) => [file, methods]),
    [...KNOWN_PUBLIC_GAME_BOUNDARIES.entries()],
  );
});

test("keeps guest JWT inside the short-lived HttpOnly cookie boundary", async () => {
  const route = await readFile(
    path.join(API_ROUTE_ROOT, "guest-portal", "[...path]", "route.ts"),
    "utf8",
  );
  const clubSelect = await readFile(
    fileURLToPath(
      new URL("../app/game/clubs/game-club-select-client.tsx", import.meta.url),
    ),
    "utf8",
  );

  assert.match(route, /sanitizeGuestSessionResponse\(data\)/);
  assert.match(route, /httpOnly:\s*true/);
  assert.match(route, /sameSite:\s*["']lax["']/);
  assert.match(route, /secure:\s*process\.env\.NODE_ENV\s*===\s*["']production["']/);
  assert.match(route, /maxAge:\s*60\s*\*\s*60/);
  assert.match(route, /priority:\s*["']high["']/);
  assert.doesNotMatch(route, /NextResponse\.json\(data\)/);
  assert.doesNotMatch(clubSelect, /handoff\.token/);
});

test("sets a defensive private/no-store response policy on every BFF API path", async () => {
  const config = await readFile(
    fileURLToPath(new URL("../../next.config.ts", import.meta.url)),
    "utf8",
  );

  assert.match(config, /source:\s*["']\/api\/:path\*["']/);
  for (const requiredValue of [
    "private, no-store, max-age=0",
    "no-cache",
    "Cookie, Authorization",
    "no-referrer",
    "nosniff",
    "same-origin",
  ]) {
    assert.ok(
      config.includes(`value: \"${requiredValue}\"`),
      `missing BFF response header value: ${requiredValue}`,
    );
  }
});

async function routeInventory(): Promise<readonly RouteInventoryRow[]> {
  const files = await routeFiles(API_ROUTE_ROOT);
  const inventory = await Promise.all(
    files.map(async (absoluteFile) => {
      const source = await readFile(absoluteFile, "utf8");
      const methods = [
        ...source.matchAll(
          /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)/g,
        ),
      ]
        .map((match) => match[1])
        .sort();

      return {
        file: path
          .relative(API_ROUTE_ROOT, absoluteFile)
          .split(path.sep)
          .join("/"),
        methods,
        source,
      };
    }),
  );

  return inventory.sort((left, right) => left.file.localeCompare(right.file));
}

async function routeFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return routeFiles(absolutePath);
      }

      return entry.isFile() && entry.name === "route.ts" ? [absolutePath] : [];
    }),
  );

  return nested.flat();
}

function inventoryDigest(inventory: readonly RouteInventoryRow[]) {
  const canonical = inventory
    .map(({ file, methods }) => `${file}:${methods.join(",")}`)
    .join("\n");

  return createHash("sha256").update(canonical).digest("hex");
}
