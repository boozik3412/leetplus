import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolveTeamChatEventUpstreamQuery } from "./team-chat-events.ts";

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
      prefix.endsWith("route.ts") ? file === prefix : file.startsWith(prefix),
    ),
  );
  const handlerCount = inventory.reduce(
    (total, route) => total + route.methods.length,
    0,
  );

  assert.equal(inventory.length, EXPECTED_PROTECTED_ROUTE_FILES);
  assert.equal(handlerCount, EXPECTED_PROTECTED_HANDLERS);
  assert.equal(inventoryDigest(inventory), EXPECTED_PROTECTED_INVENTORY_SHA256);

  for (const route of inventory) {
    const delegatesToProtectedProxy = /proxy(?:Json|File)Request/.test(
      route.source,
    );
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
  assert.match(
    route,
    /secure:\s*process\.env\.NODE_ENV\s*===\s*["']production["']/,
  );
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

test("keeps STORES assortment pages read-only without network-only catalogs", async () => {
  const pages = await Promise.all(
    [
      new URL("../app/(app)/products/page.tsx", import.meta.url),
      new URL("../app/products/table/page.tsx", import.meta.url),
    ].map((page) => readFile(fileURLToPath(page), "utf8")),
  );

  for (const source of pages) {
    assert.match(source, /const user = await requireCurrentUser\(\)/);
    assert.match(
      source,
      /user\.accessScope === ["']NETWORK["'] && can\(user, ["']edit_products["']\)/,
    );
    assert.match(
      source,
      /canEditProducts \? getCategories\(\) : Promise\.resolve\(\[\]\)/,
    );
    assert.match(
      source,
      /canEditProducts \? getSuppliers\(\) : Promise\.resolve\(\[\]\)/,
    );
  }
});

test("rejects an unavailable product store filter before the catalog request", async () => {
  const source = await readFile(
    fileURLToPath(new URL("../app/products/table/page.tsx", import.meta.url)),
    "utf8",
  );
  const scopeAssertion = source.indexOf("assertRequestedStores(query, stores)");
  const filteredCatalogRequest = source.indexOf(
    "unfilteredCatalogPromise ?? getProductCatalog(query)",
  );

  assert.ok(scopeAssertion >= 0, "missing requested-store assertion");
  assert.ok(
    filteredCatalogRequest > scopeAssertion,
    "filtered catalog request must follow the requested-store assertion",
  );
  assert.match(source, /new Set\(stores\.map\(\(store\) => store\.id\)\)/);
  assert.match(
    source,
    /query\.storeIds\.some\(\(storeId\) => !allowedStoreIds\.has\(storeId\)\)/,
  );
  assert.match(source, /notFound\(\)/);
});

test("keeps report exports and mutations inside hardened cookie-backed proxies", async () => {
  const [exportRoute, oosRoute, oosDeleteRoute, recommendationRoute] =
    await Promise.all(
      [
        "reports/export/route.ts",
        "reports/oos-exclusions/route.ts",
        "reports/oos-exclusions/[id]/route.ts",
        "reports/recommendations/[key]/state/route.ts",
      ].map((route) => readFile(path.join(API_ROUTE_ROOT, route), "utf8")),
    );

  assert.match(
    exportRoute,
    /proxyFileRequest\(request, ["']\/reports\/export["'], ["']leetplus-reports\.csv["']\)/,
  );
  assert.doesNotMatch(exportRoute, /getApiUrl|getAuthHeaders|\bfetch\s*\(/);

  assert.match(
    oosRoute,
    /proxyJsonRequest\(request, ["']\/reports\/oos-exclusions["'], ["']GET["'],\s*\{\s*privateNoStore:\s*true,?\s*\}\)/,
  );
  assert.match(
    oosRoute,
    /proxyJsonRequest\(request, ["']\/reports\/oos-exclusions["'], ["']POST["'],\s*\{\s*privateNoStore:\s*true,?\s*\}\)/,
  );
  assert.match(oosDeleteRoute, /encodeURIComponent\(id\)/);
  assert.match(oosDeleteRoute, /privateNoStore:\s*true/);
  assert.match(recommendationRoute, /encodeURIComponent\(key\)/);
  assert.match(recommendationRoute, /privateNoStore:\s*true/);
});

test("returns a canonical same-origin locator for uploaded staff attachments", async () => {
  const source = await readFile(
    path.join(API_ROUTE_ROOT, "staff/attachments/route.ts"),
    "utf8",
  );

  assert.match(
    source,
    /const url = `\/api\/staff\/attachments\/\$\{encodeURIComponent\(data\.id\)\}`/,
  );
  assert.doesNotMatch(source, /new URL\([\s\S]*request\.url/);
  assert.doesNotMatch(source, /\.toString\(\)/);
});

test("bounds the reports SSR fan-out to two upstream loaders at a time", async () => {
  const source = await readFile(
    fileURLToPath(new URL("../app/(app)/reports/page.tsx", import.meta.url)),
    "utf8",
  );
  const loaderPattern =
    /\b(?:getAssortmentReport|getOperationalReport|getSkuPerformanceReport|getReplenishmentReport|getSuppliersPerformanceReport|getNewProductsReport|getLflReport|getStores|safeGetBusinessSnapshot)\s*\(/g;
  const boundedBlocks = [
    ...source.matchAll(/await Promise\.all\(\[([\s\S]*?)\]\);/g),
  ]
    .map((match) => [...match[1].matchAll(loaderPattern)].length)
    .filter((count) => count > 0);

  assert.deepEqual(boundedBlocks, [2, 2, 2, 2, 2, 2]);
  assert.equal(
    boundedBlocks.reduce((total, count) => total + count, 0),
    12,
  );
});

test("keeps team-chat SSE cookie-bound and rejects client-controlled selectors", async () => {
  const source = await readFile(
    path.join(API_ROUTE_ROOT, "staff/team-chat/events/route.ts"),
    "utf8",
  );

  assert.match(source, /await getAuthHeaders\(\)/);
  assert.match(source, /if \(!headers\.Authorization\)/);
  assert.match(source, /resolveTeamChatEventUpstreamQuery\(request\.url\)/);
  assert.doesNotMatch(source, /events\$\{url\.search\}/);
  assert.match(source, /Accept:\s*["']text\/event-stream["']/);
  assert.match(source, /signal:\s*request\.signal/);
  for (const headerValue of [
    "private, no-store, no-transform, max-age=0",
    "Cookie, Authorization",
    "no-referrer",
    "nosniff",
    "same-origin",
  ]) {
    assert.ok(
      source.includes(`\"${headerValue}\"`),
      `missing SSE response header value: ${headerValue}`,
    );
  }
  assert.doesNotMatch(source, /Connection:\s*["']keep-alive["']/);

  const channelId = "123e4567-e89b-42d3-a456-426614174000";
  assert.equal(
    resolveTeamChatEventUpstreamQuery("https://leetplus.invalid/events"),
    "",
  );
  assert.equal(
    resolveTeamChatEventUpstreamQuery(
      `https://leetplus.invalid/events?channelId=${channelId}`,
    ),
    `?channelId=${channelId}`,
  );
  for (const invalidUrl of [
    "https://leetplus.invalid/events?storeId=hidden",
    `https://leetplus.invalid/events?channelId=${channelId}&channelId=${channelId}`,
    "https://leetplus.invalid/events?channelId=not-a-uuid",
  ]) {
    assert.equal(resolveTeamChatEventUpstreamQuery(invalidUrl), null);
  }
});

test("keeps transitional tenant-wide staff workspaces out of STORES scope", async () => {
  const networkOnlyPages = [
    "ai-assistant/page.tsx",
    "assessments/page.tsx",
    "discipline/page.tsx",
    "operations-dashboard/page.tsx",
    "readiness-report/page.tsx",
    "salary/page.tsx",
    "shift-workspace/page.tsx",
  ] as const;
  const [authSource, permissionsSource, ...pageSources] = await Promise.all([
    readFile(fileURLToPath(new URL("auth.ts", import.meta.url)), "utf8"),
    readFile(fileURLToPath(new URL("permissions.ts", import.meta.url)), "utf8"),
    ...networkOnlyPages.map((page) =>
      readFile(
        fileURLToPath(new URL(`../app/(app)/staff/${page}`, import.meta.url)),
        "utf8",
      ),
    ),
  ]);

  assert.match(
    authSource,
    /export async function requireNetworkScopedUser\(\)[\s\S]*await requireCurrentUser\(\)[\s\S]*user\.accessScope !== ["']NETWORK["'][\s\S]*notFound\(\)/,
  );
  assert.match(
    permissionsSource,
    /user\?\.accessScope === ["']STORES["'] && isNetworkOnlyStaffPath\(href\)/,
  );

  for (const [index, source] of pageSources.entries()) {
    assert.match(
      source,
      /import \{ requireNetworkScopedUser \} from ["']@\/lib\/auth["']/,
      `${networkOnlyPages[index]} must import the scope gate`,
    );
    assert.match(
      source,
      /await requireNetworkScopedUser\(\)/,
      `${networkOnlyPages[index]} must apply the scope gate before data access`,
    );
  }
});

test("keeps store-aware checklist workspaces behind authenticated API authority", async () => {
  const pages = [
    "checklist-templates/page.tsx",
    "checklists/page.tsx",
    "checklists/report/page.tsx",
  ] as const;
  const pageSources = await Promise.all(
    pages.map((page) =>
      readFile(
        fileURLToPath(new URL(`../app/(app)/staff/${page}`, import.meta.url)),
        "utf8",
      ),
    ),
  );

  for (const [index, source] of pageSources.entries()) {
    assert.match(
      source,
      /import \{ requireCurrentUser \} from ["']@\/lib\/auth["']/,
      `${pages[index]} must require an authenticated user`,
    );
    assert.match(source, /await requireCurrentUser\(\)/);
    assert.doesNotMatch(source, /requireNetworkScopedUser/);
    assert.match(source, /report\.accessScope/);
  }
});

test("keeps the store-aware knowledge workspace behind authenticated API authority", async () => {
  const pageSource = await readFile(
    fileURLToPath(
      new URL("../app/(app)/staff/knowledge-base/page.tsx", import.meta.url),
    ),
    "utf8",
  );

  assert.match(
    pageSource,
    /import \{ requireCurrentUser \} from ["']@\/lib\/auth["']/,
  );
  assert.match(pageSource, /await requireCurrentUser\(\)/);
  assert.doesNotMatch(pageSource, /requireNetworkScopedUser/);
});

test("keeps store-aware shift regulations behind authenticated API authority", async () => {
  const pageSource = await readFile(
    fileURLToPath(
      new URL("../app/(app)/staff/shift-regulations/page.tsx", import.meta.url),
    ),
    "utf8",
  );

  assert.match(
    pageSource,
    /import \{ requireCurrentUser \} from ["']@\/lib\/auth["']/,
  );
  assert.match(pageSource, /await requireCurrentUser\(\)/);
  assert.match(pageSource, /report\.rows\.filter\(\(row\) => row\.canManage\)/);
  assert.doesNotMatch(pageSource, /requireNetworkScopedUser/);
});

test("keeps store-aware training courses and profiles behind authenticated API authority", async () => {
  const pageSources = await Promise.all(
    ["training-courses/page.tsx", "training-profiles/page.tsx"].map((page) =>
      readFile(
        fileURLToPath(new URL(`../app/(app)/staff/${page}`, import.meta.url)),
        "utf8",
      ),
    ),
  );

  for (const source of pageSources) {
    assert.match(
      source,
      /import \{ requireCurrentUser \} from ["']@\/lib\/auth["']/,
    );
    assert.match(source, /await requireCurrentUser\(\)/);
    assert.doesNotMatch(source, /requireNetworkScopedUser/);
  }
});

test("keeps store-aware onboarding behind authenticated API authority", async () => {
  const pageSource = await readFile(
    fileURLToPath(
      new URL("../app/(app)/staff/onboarding/page.tsx", import.meta.url),
    ),
    "utf8",
  );

  assert.match(
    pageSource,
    /import \{ requireCurrentUser \} from ["']@\/lib\/auth["']/,
  );
  assert.match(pageSource, /await requireCurrentUser\(\)/);
  assert.match(pageSource, /report\.accessScope === ["']NETWORK["']/);
  assert.doesNotMatch(pageSource, /requireNetworkScopedUser/);
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
