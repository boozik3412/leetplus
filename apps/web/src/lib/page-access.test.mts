import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getDefaultLandingPath } from "./landing.ts";
import { canAccessPath } from "./permissions.ts";

type PageUser = NonNullable<Parameters<typeof canAccessPath>[0]>;

const roles = [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "BUYER",
  "MARKETER",
  "CLUB_MANAGER",
  "STANDARDS_MANAGER",
  "SENIOR_ADMINISTRATOR",
  "CLUB_ADMINISTRATOR",
  "TRAINEE",
] as const satisfies readonly PageUser["role"][];

function user(overrides: Partial<PageUser> = {}): PageUser {
  return {
    id: "user-1",
    email: "user@example.test",
    fullName: null,
    role: "OWNER",
    isPlatformAdmin: false,
    tenantId: "tenant-1",
    tenantSlug: "tenant",
    accessScope: "NETWORK",
    allowedStoreIds: [],
    ...overrides,
  };
}

// Pages that previously checked only the session. Each must run the page
// access guard for its own section before it loads restricted data.
const guardedPages = [
  ["(app)/assortment/dashboard/page.tsx", "/assortment/dashboard"],
  ["(app)/categories/page.tsx", "/categories"],
  ["(app)/commercial/demo/page.tsx", "/commercial/demo"],
  ["(app)/commercial/tariffs/page.tsx", "/commercial/tariffs"],
  ["(app)/connections/page.tsx", "/connections"],
  ["(app)/dashboard/revenue-by-club/page.tsx", "/dashboard/revenue-by-club"],
  [
    "(app)/dashboard/revenue-diagnostics/page.tsx",
    "/dashboard/revenue-diagnostics",
  ],
  ["(app)/guests/crm/page.tsx", "/guests/crm"],
  ["(app)/guests/crm/tasks/page.tsx", "/guests/crm/tasks"],
  ["(app)/marketing/campaigns/[id]/page.tsx", "/marketing/campaigns"],
  ["(app)/marketing/missions/page.tsx", "/marketing/missions"],
  ["(app)/marketing/page.tsx", "/marketing"],
  ["(app)/marketing/new/page.tsx", "/marketing/new"],
  ["(app)/marketing/promo-bundles/page.tsx", "/marketing/promo-bundles"],
  ["(app)/products/page.tsx", "/products"],
  ["(app)/reports/daily/page.tsx", "/reports/daily"],
  ["(app)/reports/oos-exclusions/page.tsx", "/reports/oos-exclusions"],
  ["(app)/reports/page.tsx", "/reports"],
  [
    "(app)/staff/administrator-ratings/page.tsx",
    "/staff/administrator-ratings",
  ],
  ["(app)/staff/ai-assistant/page.tsx", "/staff/ai-assistant"],
  ["(app)/staff/assessments/page.tsx", "/staff/assessments"],
  ["(app)/staff/checklist-templates/page.tsx", "/staff/checklist-templates"],
  ["(app)/staff/checklists/page.tsx", "/staff/checklists"],
  ["(app)/staff/checklists/report/page.tsx", "/staff/checklists/report"],
  ["(app)/staff/directory/page.tsx", "/staff/directory"],
  ["(app)/staff/knowledge-base/page.tsx", "/staff/knowledge-base"],
  ["(app)/staff/onboarding/page.tsx", "/staff/onboarding"],
  ["(app)/staff/operations-dashboard/page.tsx", "/staff/operations-dashboard"],
  ["(app)/staff/readiness-report/page.tsx", "/staff/readiness-report"],
  ["(app)/staff/salary/page.tsx", "/staff/salary"],
  ["(app)/staff/shift-regulations/page.tsx", "/staff/shift-regulations"],
  ["(app)/staff/staff-control/admins/page.tsx", "/staff/staff-control/admins"],
  [
    "(app)/staff/staff-control/diagnostics/page.tsx",
    "/staff/staff-control/diagnostics",
  ],
  [
    "(app)/staff/staff-control/operations/page.tsx",
    "/staff/staff-control/operations",
  ],
  [
    "(app)/staff/staff-control/operators/page.tsx",
    "/staff/staff-control/operators",
  ],
  ["(app)/staff/staff-control/page.tsx", "/staff/staff-control"],
  ["(app)/staff/task-rules/page.tsx", "/staff/task-rules"],
  ["(app)/staff/task-templates/page.tsx", "/staff/task-templates"],
  ["(app)/staff/tasks/page.tsx", "/staff/tasks"],
  ["(app)/staff/training-courses/page.tsx", "/staff/training-courses"],
  ["(app)/staff/training-profiles/page.tsx", "/staff/training-profiles"],
  ["(app)/stores/page.tsx", "/stores"],
  ["(app)/suppliers/page.tsx", "/suppliers"],
  ["(app)/utilities/page.tsx", "/utilities"],
  ["(app)/visualization/page.tsx", "/visualization"],
  [
    "(app)/utilities/product-parsing/manual/page.tsx",
    "/utilities/product-parsing/manual",
  ],
  ["guests/report/page.tsx", "/guests/report"],
  ["products/order/page.tsx", "/products/order"],
  ["products/stock-value/page.tsx", "/products/stock-value"],
  ["reports/abc/table/page.tsx", "/reports/abc/table"],
  [
    "reports/assortment-matrix/table/page.tsx",
    "/reports/assortment-matrix/table",
  ],
  ["reports/lfl/table/page.tsx", "/reports/lfl/table"],
  ["reports/new-products/table/page.tsx", "/reports/new-products/table"],
  ["reports/plan-fact/table/page.tsx", "/reports/plan-fact/table"],
  ["reports/recommendations/table/page.tsx", "/reports/recommendations/table"],
  ["reports/sales-detail/table/page.tsx", "/reports/sales-detail/table"],
  [
    "reports/supplier-scorecard/table/page.tsx",
    "/reports/supplier-scorecard/table",
  ],
] as const;

test("every default role can open its own landing page", () => {
  for (const role of roles) {
    for (const accessScope of ["NETWORK", "STORES"] as const) {
      const subject = user({ role, accessScope, allowedStoreIds: ["store-1"] });
      const landing = getDefaultLandingPath(subject).split("?")[0];

      assert.equal(
        canAccessPath(subject, landing),
        true,
        `${role}/${accessScope} must be able to open ${landing}`,
      );
    }
  }
});

test("nested section pages follow their section rule", () => {
  const manualParsing = "/utilities/product-parsing/manual";

  assert.equal(canAccessPath(user({ role: "TRAINEE" }), manualParsing), false);
  assert.equal(canAccessPath(user({ role: "MARKETER" }), manualParsing), false);
  assert.equal(canAccessPath(user({ role: "BUYER" }), manualParsing), true);
  assert.equal(
    canAccessPath(user({ role: "BUYER" }), "/utilities?tab=x"),
    true,
  );
  assert.equal(
    canAccessPath(user({ role: "TRAINEE" }), "/settings/langame"),
    false,
  );
  assert.equal(
    canAccessPath(user({ role: "OWNER" }), "/settings/langame"),
    true,
  );
});

test("a platform admin without tenant context is sent away from tenant pages", () => {
  const admin = user({ isPlatformAdmin: true, platformTenantContext: false });

  assert.equal(canAccessPath(admin, "/marketing"), false);
  assert.equal(getDefaultLandingPath(admin), "/administration");
});

test("session-only pages run the page access guard before loading data", () => {
  for (const [file, route] of guardedPages) {
    const source = readFileSync(
      new URL(`../app/${file}`, import.meta.url),
      "utf8",
    );
    const guardIndex = Math.max(
      source.indexOf(`requirePageAccess("${route}")`),
      source.indexOf(`, "${route}");`),
    );

    assert.ok(guardIndex > 0, `${file} must guard ${route}`);
    assert.match(source, /from "@\/lib\/auth"/u);

    const exportIndex = source.indexOf("export default");
    const body = source.slice(exportIndex);
    const firstLoad = body.search(
      /await (?:Promise\.all|get[A-Z]|safeGet[A-Z])/u,
    );

    if (firstLoad >= 0) {
      assert.ok(
        exportIndex + firstLoad > guardIndex,
        `${file} loads data before the page access guard`,
      );
    }
  }
});

test("the club scheme opens wherever the clubs section does, and for standards managers", () => {
  for (const role of roles) {
    const subject = user({ role });
    if (canAccessPath(subject, "/stores")) {
      assert.equal(canAccessPath(subject, "/visualization"), true, role);
    }
  }
  const standards = user({ role: "STANDARDS_MANAGER" });
  assert.equal(canAccessPath(standards, "/visualization"), true);
  assert.equal(canAccessPath(standards, "/stores"), false);
  assert.equal(
    canAccessPath(user({ role: "TRAINEE" }), "/visualization"),
    false,
  );
});
