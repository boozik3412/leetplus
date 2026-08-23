import assert from "node:assert/strict";
import test from "node:test";
import {
  getAuthenticatedDestination,
  getDefaultLandingPath,
  platformAdministrationHref,
  staffShiftWorkspaceHref,
  staffTasksWorkspaceHref,
} from "./landing.ts";

type LandingUser = Parameters<typeof getDefaultLandingPath>[0];

function user(overrides: Partial<NonNullable<LandingUser>> = {}) {
  return {
    role: "OWNER" as const,
    isPlatformAdmin: false,
    accessScope: "NETWORK" as const,
    ...overrides,
  } satisfies NonNullable<LandingUser>;
}

test("routes platform administrators to the supported administration workspace", () => {
  assert.equal(
    getDefaultLandingPath(user({ isPlatformAdmin: true })),
    platformAdministrationHref,
  );
});

test("ignores a stale tenant return path for a platform administrator session", () => {
  assert.equal(
    getAuthenticatedDestination(
      user({ isPlatformAdmin: true }),
      "/dashboard?period=full-day",
    ),
    platformAdministrationHref,
  );
});

test("platform administration takes precedence over a tenant shift role", () => {
  assert.equal(
    getDefaultLandingPath(
      user({ role: "SENIOR_ADMINISTRATOR", isPlatformAdmin: true }),
    ),
    platformAdministrationHref,
  );
});

test("keeps tenant shift roles in the shift workspace", () => {
  assert.equal(
    getDefaultLandingPath(user({ role: "CLUB_ADMINISTRATOR" })),
    staffShiftWorkspaceHref,
  );
});

test("routes store-scoped shift roles to their scoped task workspace", () => {
  for (const role of [
    "SENIOR_ADMINISTRATOR",
    "CLUB_ADMINISTRATOR",
    "TRAINEE",
  ] as const) {
    assert.equal(
      getDefaultLandingPath(user({ role, accessScope: "STORES" })),
      staffTasksWorkspaceHref,
    );
  }
});

test("replaces a stale shift-workspace return path for STORES users", () => {
  assert.equal(
    getAuthenticatedDestination(
      user({ role: "TRAINEE", accessScope: "STORES" }),
      "/staff/shift-workspace?checklistRunId=old",
    ),
    staffTasksWorkspaceHref,
  );
});

test("keeps regular tenant users on the dashboard", () => {
  assert.equal(getDefaultLandingPath(user()), "/dashboard");
});

test("preserves a sanitized return path for a regular tenant user", () => {
  assert.equal(
    getAuthenticatedDestination(user(), "/reports"),
    "/reports",
  );
});
