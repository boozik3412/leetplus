import assert from "node:assert/strict";
import test from "node:test";
import {
  getAuthenticatedDestination,
  getDefaultLandingPath,
  platformAdministrationHref,
  staffShiftWorkspaceHref,
} from "./landing.ts";

type LandingUser = Parameters<typeof getDefaultLandingPath>[0];

function user(overrides: Partial<NonNullable<LandingUser>> = {}) {
  return {
    role: "OWNER" as const,
    isPlatformAdmin: false,
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

test("keeps regular tenant users on the dashboard", () => {
  assert.equal(getDefaultLandingPath(user()), "/dashboard");
});

test("preserves a sanitized return path for a regular tenant user", () => {
  assert.equal(
    getAuthenticatedDestination(user(), "/reports"),
    "/reports",
  );
});
