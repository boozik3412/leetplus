import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const USERS_ROUTE_ROOT = fileURLToPath(
  new URL("../app/api/users", import.meta.url),
);

const EXPECTED_ROUTES = new Map<string, readonly string[]>([
  ["[id]/route.ts", ["PATCH"]],
  ["invites/[id]/route.ts", ["DELETE", "PATCH"]],
  ["invites/route.ts", ["POST"]],
  ["roles/[id]/route.ts", ["PATCH"]],
  ["roles/route.ts", ["POST"]],
  ["route.ts", ["GET", "POST"]],
  ["system-roles/[role]/route.ts", ["PATCH"]],
]);

test("pins the complete users/roles BFF surface at nine protected handlers", async () => {
  const inventory = await routeInventory();

  assert.deepEqual(
    inventory.map(({ file, methods }) => [file, methods]),
    [...EXPECTED_ROUTES.entries()],
  );
  assert.equal(
    inventory.reduce((total, route) => total + route.methods.length, 0),
    9,
  );
});

test("requires server-side cookie admission and never accepts client authorization or tenant selectors", async () => {
  const inventory = await routeInventory();

  for (const route of inventory) {
    const protectedByServerCookie =
      route.source.includes("proxyJsonRequest") ||
      (route.source.includes("getAuthHeaders") &&
        route.source.includes("!headers.Authorization") &&
        route.source.includes("status: 401"));

    assert.ok(
      protectedByServerCookie,
      `${route.file} lacks protected admission`,
    );
    assert.doesNotMatch(
      route.source,
      /request\.headers\.get\(["']authorization/i,
    );
    assert.doesNotMatch(route.source, /searchParams\.get\(["']tenant/i);
    assert.doesNotMatch(route.source, /[?&](?:tenantId|tenant|storeId)=/i);
    assert.doesNotMatch(route.source, /cache\s*:\s*["']force-cache["']/);
  }
});

test("binds dynamic identifiers through encodeURIComponent and exact upstream paths", async () => {
  const byFile = new Map(
    (await routeInventory()).map((route) => [route.file, route.source]),
  );

  assert.match(
    byFile.get("[id]/route.ts") ?? "",
    /`\/users\/\$\{encodeURIComponent\(id\)\}`/,
  );
  assert.match(
    byFile.get("invites/[id]/route.ts") ?? "",
    /`\/users\/invites\/\$\{encodeURIComponent\(id\)\}`/,
  );
  assert.match(
    byFile.get("roles/[id]/route.ts") ?? "",
    /`\/users\/roles\/\$\{encodeURIComponent\(id\)\}`/,
  );
  assert.match(
    byFile.get("system-roles/[role]/route.ts") ?? "",
    /`\/users\/system-roles\/\$\{encodeURIComponent\(role\)\}`/,
  );
  assert.match(byFile.get("invites/route.ts") ?? "", /"\/users\/invites"/);
  assert.match(byFile.get("roles/route.ts") ?? "", /"\/users\/roles"/);
  assert.match(byFile.get("route.ts") ?? "", /`\$\{getApiUrl\(\)\}\/users`/);
});

test("keeps invite responses private and CURRENT189 candidate imports dormant", async () => {
  const inventory = await routeInventory();

  for (const route of inventory.filter(({ file }) =>
    file.startsWith("invites/"),
  )) {
    assert.match(route.source, /privateNoStore:\s*true/);
  }
  for (const route of inventory) {
    assert.doesNotMatch(
      route.source,
      /employee-invite-current189|EmployeeInviteCurrent189/,
      `${route.file} partially activates dormant CURRENT189`,
    );
  }
});

type RouteInventoryRow = Readonly<{
  file: string;
  methods: readonly string[];
  source: string;
}>;

async function routeInventory(): Promise<readonly RouteInventoryRow[]> {
  const files = await routeFiles(USERS_ROUTE_ROOT);
  const rows = await Promise.all(
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
          .relative(USERS_ROUTE_ROOT, absoluteFile)
          .split(path.sep)
          .join("/"),
        methods,
        source,
      };
    }),
  );

  return rows.sort((left, right) => left.file.localeCompare(right.file));
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
