import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import type { AuthUser } from "./auth";
import {
  can,
  canUseGuestGameTestRun,
  capabilityOptions,
  type Capability,
} from "./permissions.ts";
import { roleOrder } from "./roles.ts";

// The role/capability matrix is written twice: the API enforces it
// (apps/api/src/auth/capabilities.ts), the web shows menus and pages from its
// own copy (permissions.ts). This test fails as soon as the two disagree, so a
// change to one side has to be made on the other in the same PR.

type ApiCapabilities = {
  accessCapabilityCatalog: readonly { key: string; label: string }[];
  resolveUserCapabilities: (input: {
    role: string;
    customRole?: { permissions: string[] } | null;
  }) => string[];
  hasCapability: (
    user: { permissions?: string[] } | null,
    capability: string,
  ) => boolean;
};

async function loadApiCapabilities(): Promise<ApiCapabilities> {
  const sourcePath = new URL(
    "../../../api/src/auth/capabilities.ts",
    import.meta.url,
  );
  const prismaImport = "import { UserRole } from '@prisma/client';";
  const source = readFileSync(sourcePath, "utf8");
  assert.ok(
    source.includes(prismaImport),
    "API capabilities.ts no longer imports UserRole the way this test expects",
  );
  // Only the UserRole enum comes from Prisma; replace it with the same values
  // so the file runs under plain Node type stripping.
  const roles = roleOrder.map((role) => `${role}: "${role}"`).join(", ");
  const runnable = source.replace(
    prismaImport,
    `const UserRole = { ${roles} } as const;\ntype UserRole = (typeof UserRole)[keyof typeof UserRole];`,
  );
  const dir = mkdtempSync(join(tmpdir(), "capability-parity-"));
  const file = join(dir, "capabilities.mts");
  writeFileSync(file, runnable);
  return (await import(pathToFileURL(file).href)) as ApiCapabilities;
}

const api = await loadApiCapabilities();
const webKeys = capabilityOptions.map((option) => option.key);

function webUser(role: string, permissions?: string[]) {
  return { role, permissions } as unknown as AuthUser;
}

test("web and API list the same capabilities with the same labels", () => {
  assert.deepEqual(
    [...webKeys].sort(),
    api.accessCapabilityCatalog.map((entry) => entry.key).sort(),
  );
  const apiLabels = new Map(
    api.accessCapabilityCatalog.map((entry) => [entry.key, entry.label]),
  );
  for (const option of capabilityOptions) {
    assert.equal(option.label, apiLabels.get(option.key), option.key);
  }
});

test("every role has the same default capabilities on web and API", () => {
  for (const role of roleOrder) {
    const apiUser = { permissions: api.resolveUserCapabilities({ role }) };
    for (const capability of webKeys) {
      assert.equal(
        can(webUser(role), capability),
        api.hasCapability(apiUser, capability),
        `${role} → ${capability}`,
      );
    }
  }
});

test("custom permissions expand the same way on web and API", () => {
  // The web receives the permissions the API resolved (/auth/me) and applies
  // its own minimum-role and parent/child rules on top; both must agree.
  const grants: Capability[][] = [[], ...webKeys.map((key) => [key])];
  for (const role of roleOrder) {
    for (const grant of grants) {
      const resolved = api.resolveUserCapabilities({
        role,
        customRole: { permissions: grant },
      });
      for (const capability of webKeys) {
        assert.equal(
          can(webUser(role, resolved), capability),
          api.hasCapability({ permissions: resolved }, capability),
          `${role} + [${grant.join(", ")}] → ${capability}`,
        );
      }
    }
  }
});

test("«Тест запуска» is open on web exactly where the API allows its routes", () => {
  const controller = readFileSync(
    new URL(
      "../../../api/src/guest-gamification/guest-gamification.controller.ts",
      import.meta.url,
    ),
    "utf8",
  );
  for (const route of [
    "@Post('dry-run')",
    "@Get('facts')",
    "@Post('process-event')",
    "@Post('pipeline/run')",
  ]) {
    const start = controller.indexOf(route);
    assert.notEqual(start, -1, `${route} not found in the API controller`);
    // Decorators of this handler end where its parameters start.
    const decorators = controller.slice(
      start,
      controller.indexOf("@CurrentUser()", start),
    );
    assert.match(
      decorators,
      /@StrictRoles\(UserRole\.OWNER, UserRole\.ADMIN\)\s+@UseGuards\(StrictRolesGuard\)/,
      `${route} must keep the OWNER/ADMIN ceiling`,
    );
  }

  const allowed = roleOrder.filter((role) =>
    canUseGuestGameTestRun(webUser(role)),
  );
  assert.deepEqual(allowed, ["OWNER", "ADMIN"]);
  assert.equal(
    canUseGuestGameTestRun(
      webUser("MANAGER", [
        "view_guest_gamification",
        "manage_guest_game_rules",
      ]),
    ),
    false,
  );
});
