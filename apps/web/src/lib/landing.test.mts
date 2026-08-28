import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assortmentWorkspaceHref,
  getAuthenticatedDestination,
  getDefaultLandingPath,
  marketingWorkspaceHref,
  platformAdministrationHref,
  shouldShowTenantOnboardingNotice,
  staffStandardsWorkspaceHref,
  staffShiftWorkspaceHref,
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

test("routes a platform administrator with a signed tenant context to that workspace", () => {
  const platformTenantUser = user({
    isPlatformAdmin: true,
    platformTenantContext: true,
  });

  assert.equal(getDefaultLandingPath(platformTenantUser), "/dashboard");
  assert.equal(
    getAuthenticatedDestination(platformTenantUser, "/reports"),
    "/reports",
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

test("routes store-scoped shift roles to their shift workspace", () => {
  for (const role of [
    "SENIOR_ADMINISTRATOR",
    "CLUB_ADMINISTRATOR",
    "TRAINEE",
  ] as const) {
    assert.equal(
      getDefaultLandingPath(user({ role, accessScope: "STORES" })),
      staffShiftWorkspaceHref,
    );
  }
});

test("routes specialist tenant roles to their supported workspaces", () => {
  const expectedLandings = new Map<
    NonNullable<LandingUser>["role"],
    string
  >([
    ["OWNER", "/dashboard"],
    ["ADMIN", "/dashboard"],
    ["MANAGER", "/dashboard"],
    ["CLUB_MANAGER", "/dashboard"],
    ["BUYER", assortmentWorkspaceHref],
    ["MARKETER", marketingWorkspaceHref],
    ["STANDARDS_MANAGER", staffStandardsWorkspaceHref],
    ["SENIOR_ADMINISTRATOR", staffShiftWorkspaceHref],
    ["CLUB_ADMINISTRATOR", staffShiftWorkspaceHref],
    ["TRAINEE", staffShiftWorkspaceHref],
  ]);

  for (const [role, expectedLanding] of expectedLandings) {
    assert.equal(
      getDefaultLandingPath(user({ role })),
      expectedLanding,
      role,
    );
  }
});

test("ignores a stale dashboard return path for specialist roles", () => {
  for (const role of [
    "BUYER",
    "MARKETER",
    "STANDARDS_MANAGER",
    "SENIOR_ADMINISTRATOR",
    "CLUB_ADMINISTRATOR",
    "TRAINEE",
  ] as const) {
    assert.equal(
      getAuthenticatedDestination(user({ role }), "/dashboard?period=full-day"),
      getDefaultLandingPath(user({ role })),
      role,
    );
  }
});

test("preserves a specialist deep link outside the incompatible dashboard", () => {
  assert.equal(
    getAuthenticatedDestination(
      user({ role: "STANDARDS_MANAGER" }),
      "/staff/training-courses",
    ),
    "/staff/training-courses",
  );
});

test("redirects an incompatible direct dashboard visit before dashboard data loads", () => {
  const dashboardSource = readFileSync(
    new URL("../app/(app)/dashboard/page.tsx", import.meta.url),
    "utf8",
  );
  const landingGuardIndex = dashboardSource.indexOf(
    "const landingPath = getDefaultLandingPath(user)",
  );
  const dashboardFetchIndex = dashboardSource.indexOf(
    "const [summary, stores] = await Promise.all",
  );

  assert.notEqual(landingGuardIndex, -1);
  assert.notEqual(dashboardFetchIndex, -1);
  assert.ok(landingGuardIndex < dashboardFetchIndex);
  assert.match(
    dashboardSource.slice(landingGuardIndex, dashboardFetchIndex),
    /if \(landingPath !== dashboardWorkspaceHref\) \{\s*redirect\(landingPath\);\s*\}/u,
  );
});

test("preserves a shift-workspace return path for STORES users", () => {
  assert.equal(
    getAuthenticatedDestination(
      user({ role: "TRAINEE", accessScope: "STORES" }),
      "/staff/shift-workspace?checklistRunId=old",
    ),
    "/staff/shift-workspace?checklistRunId=old",
  );
});

test("keeps regular tenant users on the dashboard", () => {
  assert.equal(getDefaultLandingPath(user()), "/dashboard");
});

test("preserves a sanitized return path for a regular tenant user", () => {
  assert.equal(getAuthenticatedDestination(user(), "/reports"), "/reports");
});

test("shows guided setup only to a newly registered tenant owner", () => {
  assert.equal(
    shouldShowTenantOnboardingNotice({
      role: "OWNER",
      isPlatformAdmin: false,
      tenantOnboardingStatus: "ONBOARDING",
    }),
    true,
  );

  for (const candidate of [
    {
      role: "OWNER" as const,
      isPlatformAdmin: false,
      tenantOnboardingStatus: "ACTIVE" as const,
    },
    {
      role: "MANAGER" as const,
      isPlatformAdmin: false,
      tenantOnboardingStatus: "ONBOARDING" as const,
    },
    {
      role: "OWNER" as const,
      isPlatformAdmin: true,
      tenantOnboardingStatus: "ONBOARDING" as const,
    },
  ]) {
    assert.equal(shouldShowTenantOnboardingNotice(candidate), false);
  }
});
