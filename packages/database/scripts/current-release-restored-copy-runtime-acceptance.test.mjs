import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CURRENT_RELEASE_CRITICAL_READS,
  CURRENT_RELEASE_CAPABILITY_KEYS,
  CURRENT_RELEASE_EFFECT_POLICY,
  CURRENT_RELEASE_RUNTIME_ACCEPTANCE_CONTRACT,
  CURRENT_RELEASE_STARTUP_TIMEOUT_DEFAULT_MS,
  CURRENT_RELEASE_STARTUP_TIMEOUT_MAX_MS,
  CURRENT_RELEASE_STARTUP_TIMEOUT_MIN_MS,
  attestCurrentReleaseKernelSandbox,
  assertCurrentReleaseArtifactMountBoundary,
  assertCurrentReleaseCriticalReadForTestOnly,
  assertCurrentReleaseUsersNetworkProjectionForTestOnly,
  assertCurrentReleaseDatabaseUrl,
  assertCurrentReleasePorts,
  buildCurrentReleaseApiEnvironment,
  buildCurrentReleaseNetworkGuardSource,
  cleanupCurrentReleaseFixture,
  createSignedCurrentReleaseReceipt,
  executeCurrentReleaseHttpAcceptance,
  finalizeCurrentReleaseRuntime,
  inspectCurrentReleaseDatabase,
  normalizeCurrentReleaseStartupTimeoutMs,
  writeCurrentReleaseEvidenceReceipt,
  verifyCurrentReleaseArtifact,
  verifySignedCurrentReleaseReceipt,
} from "./current-release-restored-copy-runtime-acceptance.mjs";
import {
  loadCurrentReleaseSecrets,
  main as cliMain,
  parseArgs,
  verifyCurrentReleaseEvidence,
} from "./current-release-restored-copy-runtime-acceptance.cli.mjs";

const RELEASE_SHA = "f".repeat(40);
const MIGRATION = "20260828190000_guest_support_bug_reports";
const MIGRATION_COUNT = 188;
const SYSTEM_IDENTIFIER = "7676240383393093856";
const FIXTURE_OWNER_UID = process.getuid?.() ?? 0;
const DATABASE_URL =
  "postgresql://runtime:fixture-secret-123456@127.0.0.1:55449/leetplus_restored_fixture?schema=public&sslmode=disable";
const KNOWLEDGE_MINIMUM_PERMISSIONS = Object.freeze([
  "view_staff_knowledge",
  "edit_staff_knowledge",
  "review_staff_knowledge",
  "publish_staff_knowledge",
]);
const STANDARDS_MANAGER_MINIMUM_PERMISSIONS = Object.freeze([
  "view_dashboard",
  "view_communications",
  "manage_communications",
  "manage_users",
  "view_staff",
  "view_staff_tasks",
  "view_staff_standards",
  "view_staff_training",
  "view_staff_knowledge",
  "view_staff_control",
  "view_staff_directory",
  "view_staff_salary",
  "manage_staff_salary",
  "manage_staff_tasks",
  "manage_staff_standards",
  "manage_staff_training",
  "manage_staff_control",
  "manage_staff_directory",
  "edit_staff_knowledge",
  "review_staff_knowledge",
  "publish_staff_knowledge",
]);
const ROLE_OPTION_ROLES = Object.freeze([
  "ADMIN",
  "MANAGER",
  "CLUB_MANAGER",
  "MARKETER",
  "STANDARDS_MANAGER",
  "BUYER",
  "SENIOR_ADMINISTRATOR",
  "CLUB_ADMINISTRATOR",
  "TRAINEE",
]);
const ROLE_OVERRIDE_SEMANTICS = Object.freeze(
  ["OWNER", ...ROLE_OPTION_ROLES].map((role) =>
    Object.freeze({ permissions: Object.freeze(["view_dashboard"]), role }),
  ),
);
const INTEGRATION_READINESS_KEYS = Object.freeze([
  "PUBLIC_PORTAL",
  "OTP",
  "OTP_SMS",
  "OTP_TELEGRAM",
  "OTP_MAX",
  "USER_CALL_AUTH",
  "INCOMING_CALL_LAST4_AUTH",
  "TELEGRAM_LINK",
  "TELEGRAM_WEBHOOK",
  "TELEGRAM_BOT_MENU",
  "TELEGRAM_AUTH_REPLY_SENDER",
  "TELEGRAM_MINI_APP",
  "TELEGRAM_DELIVERY",
  "MAX_DELIVERY",
  "BONUS_LEDGER_SCHEDULER",
  "LANGAME_WRITE_API",
]);
const PILOT_READINESS_KEYS = Object.freeze([
  "CLUB",
  "GEOSEARCH",
  "PUBLIC_REGISTRATION",
  "PUBLIC_GAME_QA",
  "OTP",
  "GAME_PROFILE",
  "LANGAME_MATCH",
  "ACTIVE_RULES",
  "GUEST_LOGS",
  "TEST_EVENT",
  "REWARD_QUEUE",
  "BONUS_LEDGER",
  "BALANCE_RECONCILIATION",
]);
function fixtureRolePermissions(role) {
  const minimum =
    role === "STANDARDS_MANAGER"
      ? STANDARDS_MANAGER_MINIMUM_PERMISSIONS
      : ["OWNER", "ADMIN", "MANAGER"].includes(role)
        ? KNOWLEDGE_MINIMUM_PERMISSIONS
        : [];
  return [...new Set([...minimum, "view_dashboard"])];
}
const BASE_ROLE_PERMISSIONS = Object.freeze({
  ADMIN: CURRENT_RELEASE_CAPABILITY_KEYS,
  BUYER: Object.freeze([
    "view_dashboard",
    "view_reports",
    "view_assortment_reports",
    "export_reports",
    "view_assortment_products",
    "view_assortment_catalog",
    "use_utilities",
    "edit_products",
  ]),
  CLUB_ADMINISTRATOR: Object.freeze([
    "view_communications",
    "manage_communications",
    "approve_guest_game_rewards",
    "view_staff",
    "view_staff_shift_workspace",
    "view_staff_tasks",
    "view_staff_standards",
    "view_staff_training",
    "view_staff_knowledge",
    "manage_staff_tasks",
    "manage_staff_training",
  ]),
  CLUB_MANAGER: Object.freeze([
    "view_dashboard",
    "view_reports",
    "view_assortment_reports",
    "view_assortment_products",
    "view_assortment_catalog",
    "view_assortment_stores",
    "export_reports",
    "manage_assortment_reports",
    "view_guests",
    "export_guests",
    "manage_guest_crm",
    "view_guest_gamification",
    "manage_guest_game_rules",
    "approve_guest_game_rewards",
    "view_guest_game_pii",
    "view_marketing",
    "manage_marketing",
    "view_communications",
    "manage_communications",
    "view_staff",
    "view_staff_shift_workspace",
    "view_staff_tasks",
    "view_staff_standards",
    "view_staff_training",
    "view_staff_knowledge",
    "view_staff_control",
    "view_staff_directory",
    "view_staff_salary",
    "manage_staff_tasks",
    "manage_staff_standards",
    "manage_staff_training",
    "manage_staff_control",
    "manage_staff_directory",
    "manage_staff_salary",
    "edit_staff_knowledge",
    "review_staff_knowledge",
    "publish_staff_knowledge",
  ]),
  MANAGER: Object.freeze([
    "view_dashboard",
    "view_reports",
    "view_assortment_reports",
    "view_assortment_products",
    "view_assortment_catalog",
    "view_assortment_stores",
    "export_reports",
    "manage_assortment_reports",
    "view_guests",
    "export_guests",
    "manage_guest_crm",
    "view_guest_gamification",
    "manage_guest_game_rules",
    "approve_guest_game_rewards",
    "operate_guest_game_ledger",
    "view_guest_game_pii",
    "view_marketing",
    "manage_marketing",
    "view_communications",
    "manage_communications",
    "view_staff",
    "view_staff_shift_workspace",
    "view_staff_tasks",
    "view_staff_standards",
    "view_staff_training",
    "view_staff_knowledge",
    "view_staff_control",
    "view_staff_directory",
    "view_staff_salary",
    "manage_staff_tasks",
    "manage_staff_standards",
    "manage_staff_training",
    "manage_staff_control",
    "manage_staff_directory",
    "manage_staff_salary",
    "edit_staff_knowledge",
    "review_staff_knowledge",
    "publish_staff_knowledge",
    "manage_users",
    "import_data",
    "use_utilities",
    "edit_products",
    "edit_catalog",
    "edit_stores",
  ]),
  MARKETER: Object.freeze([
    "view_dashboard",
    "view_reports",
    "view_assortment_reports",
    "view_guests",
    "manage_guest_crm",
    "view_guest_gamification",
    "manage_guest_game_rules",
    "approve_guest_game_rewards",
    "view_marketing",
    "manage_marketing",
  ]),
  OWNER: CURRENT_RELEASE_CAPABILITY_KEYS,
  SENIOR_ADMINISTRATOR: Object.freeze([
    "view_communications",
    "manage_communications",
    "approve_guest_game_rewards",
    "view_staff",
    "view_staff_shift_workspace",
    "view_staff_tasks",
    "view_staff_standards",
    "view_staff_training",
    "view_staff_knowledge",
    "manage_staff_tasks",
    "manage_staff_training",
  ]),
  STANDARDS_MANAGER: STANDARDS_MANAGER_MINIMUM_PERMISSIONS,
  TRAINEE: Object.freeze([
    "view_communications",
    "manage_communications",
    "view_staff_shift_workspace",
    "view_staff_tasks",
    "view_staff_standards",
    "view_staff_training",
    "view_staff_knowledge",
    "manage_staff_training",
  ]),
});
const SCOPE_ORACLE = Object.freeze({
  assessmentIds: Object.freeze(["assessment-1"]),
  assessmentResultIds: Object.freeze(["assessment-result-1"]),
  chatChannelIds: Object.freeze(["chat-channel-1"]),
  chatMessageIds: Object.freeze(["chat-message-1"]),
  checklistRunIds: Object.freeze(["checklist-run-1"]),
  checklistTemplateIds: Object.freeze(["checklist-template-1"]),
  customRoleIds: Object.freeze([]),
  customRoleSemantics: Object.freeze([]),
  eventIds: Object.freeze(["event-1"]),
  disciplinePolicyIds: Object.freeze(["discipline-policy-1"]),
  disciplineRecordIds: Object.freeze(["discipline-record-1"]),
  disciplineRuleIds: Object.freeze(["discipline-rule-1"]),
  inviteIds: Object.freeze(["invite-1"]),
  inviteSemantics: Object.freeze([
    Object.freeze({
      customRoleId: null,
      id: "invite-1",
      role: "TRAINEE",
      scope: "STORES",
      storeIds: Object.freeze(["store-1"]),
    }),
  ]),
  gamificationWorkspaceSummary: Object.freeze({
    activeLootBoxes: 1,
    activeMissions: 1,
    activeSeasons: 1,
    approvedRewards: 0,
    eventCount: 1,
    expiredRewards: 0,
    paidRewards: 0,
    pendingRewards: 1,
    profilesCount: 1,
    rewardCount: 1,
  }),
  knowledgeArticleIds: Object.freeze(["knowledge-article-1"]),
  loginUserId: "user-owner",
  lootBoxIds: Object.freeze(["loot-box-1"]),
  missionIds: Object.freeze(["mission-1"]),
  pilotStoreId: "store-1",
  productIds: Object.freeze(["product-1"]),
  profileIds: Object.freeze(["profile-1"]),
  promoCardIds: Object.freeze(["promo-card-1"]),
  notificationIds: Object.freeze(["notification-1"]),
  onboardingPlanIds: Object.freeze(["onboarding-plan-1"]),
  rewardIds: Object.freeze(["reward-1"]),
  roleOverrideSemantics: ROLE_OVERRIDE_SEMANTICS,
  salaryPeriodIds: Object.freeze(["salary-period-1"]),
  salarySchemeIds: Object.freeze(["salary-scheme-1"]),
  seasonIds: Object.freeze(["season-1"]),
  shiftRegulationIds: Object.freeze(["shift-regulation-1"]),
  staffMemberIds: Object.freeze(["staff-member-1"]),
  staffTaskIds: Object.freeze(["staff-task-1"]),
  storeIds: Object.freeze(["store-1"]),
  taskRuleIds: Object.freeze(["task-rule-1"]),
  taskRuleRunIds: Object.freeze(["task-rule-run-1"]),
  taskTemplateIds: Object.freeze(["task-template-1"]),
  tenantId: "tenant-fixture",
  trainingCourseIds: Object.freeze(["training-course-1"]),
  userIds: Object.freeze(["user-owner"]),
  userSemantics: Object.freeze([
    Object.freeze({
      customRoleId: null,
      id: "user-owner",
      isActive: true,
      isPlatformAdmin: false,
      role: "OWNER",
      scope: "NETWORK",
      storeIds: Object.freeze([]),
    }),
  ]),
});
const CRITICAL_PATHNAMES = new Set(
  CURRENT_RELEASE_CRITICAL_READS.map(
    (probe) => new URL(probe.path, "http://127.0.0.1").pathname,
  ),
);

function validCriticalBody(pathname) {
  const store = { id: "store-1", isActive: true, name: "Fixture store" };
  const user = {
    customRole: null,
    customRoleId: null,
    id: "user-owner",
    email: "owner@example.test",
    isActive: true,
    isPlatformAdmin: false,
    permissions: fixtureRolePermissions("OWNER"),
    role: "OWNER",
    scope: "NETWORK",
    stores: [],
  };
  if (pathname === "/stores") return [store];
  if (pathname === "/api/products/catalog") {
    return {
      items: [
        { id: "product-1", storeIds: [store.id], tenantId: "tenant-fixture" },
      ],
      page: 1,
      pageSize: 1,
      total: 1,
      totalPages: 1,
    };
  }
  if (pathname.endsWith("/workspace")) {
    const blockedReadinessItem = (key) => ({
      configured: false,
      enabled: false,
      key,
      ready: false,
      status: "BLOCKED",
    });
    return {
      summary: {
        activeLootBoxes: 1,
        activeMissions: 1,
        activeSeasons: 1,
        approvedRewards: 0,
        averageLevel: 2,
        expiredRewards: 0,
        paidRewardAmount: 0,
        paidRewards: 0,
        pendingRewardAmount: 10,
        pendingRewards: 1,
        plannedBudget: 300,
        profilesCount: 1,
        registeredProfilesCount: 1,
        totalXp: 10,
      },
      economy: {
        scenarios: [{ id: "mission-1", kind: "MISSION" }],
        summary: {
          approvedCost: 0,
          averageRewardCost: 10,
          budgetUsagePercent: 3,
          budgetUsedCost: 10,
          canceledCost: 0,
          eventsCount: 1,
          expiredCost: 0,
          paidCost: 0,
          paidRewards: 0,
          pendingCost: 10,
          plannedBudget: 300,
          rewardBacklog: 1,
          rewardCount: 1,
          rulesWithoutBudget: 0,
          uniqueGuests: 1,
          xpIssued: 0,
        },
      },
      effect: { scenarios: [], summary: {}, windowDays: 14 },
      integrationReadiness: {
        items: INTEGRATION_READINESS_KEYS.map(blockedReadinessItem),
        summary: {
          blocked: INTEGRATION_READINESS_KEYS.length,
          manualOnly: 0,
          partial: 0,
          ready: 0,
          total: INTEGRATION_READINESS_KEYS.length,
        },
      },
      pilotReadiness: {
        items: PILOT_READINESS_KEYS.map(blockedReadinessItem),
        summary: {
          blocked: PILOT_READINESS_KEYS.length,
          manualOnly: 0,
          partial: 0,
          readinessPercent: 0,
          ready: 0,
          total: PILOT_READINESS_KEYS.length,
        },
        targetStore: {
          gamificationEnabled: true,
          guestPortalPath: "/guest/fixture-network/store-1",
          id: store.id,
          playPath: "/play/game",
        },
      },
      bonusLedgerAudit: {},
      bonusBalanceCurrentReconciliation: {},
      communicationQueue: {},
      deliveryOutbox: {},
      guestLogCatalog: {},
      profiles: [
        { id: "profile-1", level: 2, status: "ACTIVE", xp: 10 },
      ],
      lootBoxes: [
        { id: "loot-box-1", status: "ACTIVE", storeIds: [store.id] },
      ],
      missions: [
        { id: "mission-1", status: "ACTIVE", storeIds: [store.id] },
      ],
      seasons: [{ id: "season-1", status: "ACTIVE" }],
      promoCards: [{ id: "promo-card-1" }],
      rewards: [
        {
          id: "reward-1",
          rewardAmount: 10,
          status: "PENDING",
          storeId: store.id,
        },
      ],
      events: [{ id: "event-1", xpDelta: 0 }],
      tariffSnapshots: [],
    };
  }
  if (pathname.endsWith("/missions"))
    return [{ id: "mission-1", storeIds: [store.id] }];
  if (pathname.endsWith("/loot-boxes"))
    return [{ id: "loot-box-1", storeIds: [store.id] }];
  if (pathname.endsWith("/seasons")) return [{ id: "season-1" }];
  if (pathname.endsWith("/rewards"))
    return [{ id: "reward-1", storeId: store.id }];
  if (pathname === "/api/users") {
    return {
      capabilityOptions: CURRENT_RELEASE_CAPABILITY_KEYS.map((key) => ({
        description: `Description for ${key}`,
        key,
        label: `Label for ${key}`,
      })),
      customRoles: [],
      invites: [
        {
          acceptedAt: null,
          createdAt: "2026-08-20T00:00:00.000Z",
          customRole: null,
          customRoleId: null,
          expiresAt: "2026-08-30T00:00:00.000Z",
          id: "invite-1",
          role: "TRAINEE",
          scope: "STORES",
          stores: [store],
        },
      ],
      roleOptions: ROLE_OPTION_ROLES.map((role) => ({
        description: `Description for ${role}`,
        isOverridden: true,
        label: `Label for ${role}`,
        permissions: fixtureRolePermissions(role),
        role,
        updatedAt: "2026-08-20T00:00:00.000Z",
      })),
      stores: [store],
      users: [user],
    };
  }
  const report = {
    accessScope: "NETWORK",
    filters: {},
    summary: { total: 1 },
    rows: [],
    stores: [store],
  };
  const additions = {
    "/api/staff/directory": {
      rows: [
        { id: "staff-member-1", storeId: store.id, tenantId: "tenant-fixture" },
      ],
      users: [user],
      legacyMappings: [],
      langameUsers: [],
    },
    "/api/staff/tasks": {
      rows: [
        { id: "staff-task-1", storeId: store.id, tenantId: "tenant-fixture" },
      ],
      quickViews: [],
      groups: {},
      users: [user],
    },
    "/api/staff/checklists": {
      rows: [
        {
          id: "checklist-run-1",
          storeId: store.id,
          tenantId: "tenant-fixture",
        },
      ],
      publishedRegulations: [],
      checklistTemplates: [{ id: "checklist-template-1" }],
      users: [user],
    },
    "/api/staff/checklist-templates": {
      rows: [{ id: "checklist-template-1", tenantId: "tenant-fixture" }],
      publishedRegulations: [],
    },
    "/api/staff/task-templates": {
      rows: [{ id: "task-template-1", tenantId: "tenant-fixture" }],
      users: [user],
    },
    "/api/staff/task-rules": {
      rows: [{ id: "task-rule-1", tenantId: "tenant-fixture" }],
      runs: [{ id: "task-rule-run-1", tenantId: "tenant-fixture" }],
      users: [user],
      templates: [{ id: "task-template-1" }],
    },
    "/api/staff/discipline": {
      access: {},
      policies: [{ id: "discipline-policy-1", tenantId: "tenant-fixture" }],
      rules: [{ id: "discipline-rule-1", tenantId: "tenant-fixture" }],
      records: [{ id: "discipline-record-1", tenantId: "tenant-fixture" }],
      users: [user],
    },
    "/api/staff/salary": {
      schemes: [{ id: "salary-scheme-1", tenantId: "tenant-fixture" }],
      periods: [{ id: "salary-period-1", tenantId: "tenant-fixture" }],
      products: [{ id: "product-1", tenantId: "tenant-fixture" }],
      users: [user],
    },
    "/api/staff/shift-regulations": {
      rows: [{ id: "shift-regulation-1", tenantId: "tenant-fixture" }],
      assessments: [{ id: "assessment-1", tenantId: "tenant-fixture" }],
    },
    "/api/staff/knowledge-base": {
      rows: [{ id: "knowledge-article-1", tenantId: "tenant-fixture" }],
      folders: [],
      categories: [],
      articleSuggestions: [],
      settings: {},
    },
    "/api/staff/training-courses": {
      rows: [{ id: "training-course-1", tenantId: "tenant-fixture" }],
      knowledgeArticles: [{ id: "knowledge-article-1" }],
    },
    "/api/staff/training-profiles": {
      rows: [{ user }],
      users: [user],
    },
    "/api/staff/assessments": {
      rows: [{ id: "assessment-1", tenantId: "tenant-fixture" }],
      results: [{ id: "assessment-result-1", tenantId: "tenant-fixture" }],
      users: [user],
    },
    "/api/staff/onboarding": {
      rows: [{ id: "onboarding-plan-1", tenantId: "tenant-fixture" }],
      courses: [{ id: "training-course-1" }],
      taskTemplates: [{ id: "task-template-1" }],
      checklistTemplates: [{ id: "checklist-template-1" }],
      regulations: [{ id: "shift-regulation-1" }],
    },
    "/api/staff/notifications": {
      rows: [{ id: "notification-1", tenantId: "tenant-fixture" }],
      sourceTypes: [],
      severities: [],
      statuses: [],
    },
    "/api/staff/team-chat": {
      channels: [{ id: "chat-channel-1", tenantId: "tenant-fixture" }],
      messages: [{ id: "chat-message-1", tenantId: "tenant-fixture" }],
      users: [user],
      roleScopes: [],
    },
  };
  return { ...report, ...(additions[pathname] ?? {}) };
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function artifactFixture() {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "current-release-artifact-test-"),
  );
  const files = new Map([
    [
      "release-provenance.json",
      `${JSON.stringify({
        databaseMigration: MIGRATION,
        databaseMigrationCount: MIGRATION_COUNT,
        releaseSha: RELEASE_SHA,
      })}\n`,
    ],
    ["apps/api/dist/main.js", "process.exitCode = 0;\n"],
    ["apps/web/.next/BUILD_ID", `${RELEASE_SHA}\n`],
    ["apps/web/package.json", '{"name":"web"}\n'],
    ["packages/database/prisma/schema.prisma", "generator client {}\n"],
  ]);
  for (const [relative, value] of files) {
    const absolute = path.join(root, ...relative.split("/"));
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, value);
  }
  const nextEntry = path.join(
    root,
    "apps",
    "web",
    "node_modules",
    "next",
    "dist",
    "bin",
    "next",
  );
  await mkdir(path.dirname(nextEntry), { recursive: true });
  await writeFile(nextEntry, "process.exitCode = 0;\n");
  files.set(
    "apps/web/node_modules/next/dist/bin/next",
    "process.exitCode = 0;\n",
  );
  const manifest = [...files]
    .sort(([left], [right]) =>
      Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")),
    )
    .map(([relative, value]) => `${digest(value)}  ./${relative}`)
    .join("\n");
  const sourceManifest = `${manifest}\n`;
  const hydrationReceipt = [
    "RECORD_VERSION=1",
    `RELEASE_SHA=${RELEASE_SHA}`,
    "SANDBOX=SYSTEMD_IP_DENY_ANY_V1",
    "INVOCATION_ID=0123456789abcdef0123456789abcdef",
    `PNPM_STORE_LOCKFILE_SHA256=${"a".repeat(64)}`,
    "",
  ].join("\n");
  await writeFile(path.join(root, "SHA256SUMS"), sourceManifest);
  await writeFile(
    path.join(root, "HYDRATION_SANDBOX_RECEIPT"),
    hydrationReceipt,
  );
  const symlinkManifest = '{"links":[],"version":1}\n';
  await writeFile(path.join(root, "HYDRATED_SYMLINKS.json"), symlinkManifest);
  const hydratedFiles = new Map(files);
  hydratedFiles.set("SHA256SUMS", sourceManifest);
  hydratedFiles.set("HYDRATION_SANDBOX_RECEIPT", hydrationReceipt);
  hydratedFiles.set("HYDRATED_SYMLINKS.json", symlinkManifest);
  const hydratedManifest = [...hydratedFiles]
    .sort(([left], [right]) =>
      Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")),
    )
    .map(([relative, value]) => `${digest(value)}  ./${relative}`)
    .join("\n");
  await writeFile(
    path.join(root, "HYDRATED_SHA256SUMS"),
    `${hydratedManifest}\n`,
  );
  return { files, root };
}

test("verifies the exact hydrated artifact and rejects post-build tampering", async () => {
  const fixture = await artifactFixture();
  try {
    const evidence = await verifyCurrentReleaseArtifact({
      artifactRoot: fixture.root,
      expectedOwnerUid: FIXTURE_OWNER_UID,
      expected: {
        expectedMigrationCount: MIGRATION_COUNT,
        expectedMigrationHead: MIGRATION,
        expectedSystemIdentifier: SYSTEM_IDENTIFIER,
        releaseSha: RELEASE_SHA,
        tenantSlug: "fixture-network",
      },
    });
    assert.equal(evidence.buildId, RELEASE_SHA);
    assert.equal(evidence.manifestEntryCount, fixture.files.size);
    assert.equal(evidence.hydratedManifestEntryCount, fixture.files.size + 3);
    assert.match(evidence.manifestDigest, /^[0-9a-f]{64}$/u);

    await writeFile(
      path.join(fixture.root, "apps", "api", "dist", "main.js"),
      "tampered\n",
    );
    await assert.rejects(
      verifyCurrentReleaseArtifact({
        artifactRoot: fixture.root,
        expectedOwnerUid: FIXTURE_OWNER_UID,
        expected: {
          expectedMigrationCount: MIGRATION_COUNT,
          expectedMigrationHead: MIGRATION,
          expectedSystemIdentifier: SYSTEM_IDENTIFIER,
          releaseSha: RELEASE_SHA,
          tenantSlug: "fixture-network",
        },
      }),
      { reasonCode: "CURRENT_RELEASE_ARTIFACT_FILE_DIGEST_MISMATCH" },
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("rejects same-device nested mountpoints from synthetic Linux mountinfo", async () => {
  const safe = await assertCurrentReleaseArtifactMountBoundary(
    "/srv/leetplus/releases/f".concat("f".repeat(39)),
    "36 25 0:32 / / rw,relatime - ext4 /dev/root rw\n",
  );
  assert.equal(safe.attested, true);
  await assert.rejects(
    assertCurrentReleaseArtifactMountBoundary(
      "/srv/leetplus/releases/f".concat("f".repeat(39)),
      [
        "36 25 0:32 / / rw,relatime - ext4 /dev/root rw",
        `37 36 0:32 /nested /srv/leetplus/releases/${"f".repeat(40)}/node_modules rw - none none rw`,
        "",
      ].join("\n"),
    ),
    { reasonCode: "CURRENT_RELEASE_ARTIFACT_NESTED_MOUNT_REJECTED" },
  );
});

test("rejects a regular runtime file omitted from the hydrated manifest", async () => {
  const fixture = await artifactFixture();
  try {
    await writeFile(path.join(fixture.root, "unlisted-runtime.js"), "unsafe\n");
    await assert.rejects(
      verifyCurrentReleaseArtifact({
        artifactRoot: fixture.root,
        expectedOwnerUid: FIXTURE_OWNER_UID,
        expected: {
          expectedMigrationCount: MIGRATION_COUNT,
          expectedMigrationHead: MIGRATION,
          expectedSystemIdentifier: SYSTEM_IDENTIFIER,
          releaseSha: RELEASE_SHA,
          tenantSlug: "fixture-network",
        },
      }),
      { reasonCode: "CURRENT_RELEASE_ARTIFACT_HYDRATED_COVERAGE_INVALID" },
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("rejects hardlinks, unbound symlink topology and writable artifact entries", async (context) => {
  const hardlinkFixture = await artifactFixture();
  try {
    await link(
      path.join(hardlinkFixture.root, "apps", "api", "dist", "main.js"),
      path.join(hardlinkFixture.root, "hardlink-main.js"),
    );
    await assert.rejects(
      verifyCurrentReleaseArtifact({
        artifactRoot: hardlinkFixture.root,
        expectedOwnerUid: FIXTURE_OWNER_UID,
        expected: {
          expectedMigrationCount: MIGRATION_COUNT,
          expectedMigrationHead: MIGRATION,
          expectedSystemIdentifier: SYSTEM_IDENTIFIER,
          releaseSha: RELEASE_SHA,
          tenantSlug: "fixture-network",
        },
      }),
      { reasonCode: "CURRENT_RELEASE_ARTIFACT_HARDLINK_REJECTED" },
    );
  } finally {
    await rm(hardlinkFixture.root, { recursive: true, force: true });
  }

  const symlinkFixture = await artifactFixture();
  try {
    try {
      await symlink(
        path.join("apps", "api", "dist", "main.js"),
        path.join(symlinkFixture.root, "runtime-link"),
        "file",
      );
    } catch (error) {
      if (process.platform === "win32" && error?.code === "EPERM") {
        context.diagnostic("Windows symlink privilege is unavailable");
      } else {
        throw error;
      }
    }
    if (
      await lstat(path.join(symlinkFixture.root, "runtime-link")).catch(
        () => null,
      )
    ) {
      await assert.rejects(
        verifyCurrentReleaseArtifact({
          artifactRoot: symlinkFixture.root,
          expectedOwnerUid: FIXTURE_OWNER_UID,
          expected: {
            expectedMigrationCount: MIGRATION_COUNT,
            expectedMigrationHead: MIGRATION,
            expectedSystemIdentifier: SYSTEM_IDENTIFIER,
            releaseSha: RELEASE_SHA,
            tenantSlug: "fixture-network",
          },
        }),
        { reasonCode: "CURRENT_RELEASE_ARTIFACT_SYMLINK_TOPOLOGY_MISMATCH" },
      );
    }
  } finally {
    await rm(symlinkFixture.root, { recursive: true, force: true });
  }

  if (process.platform !== "win32") {
    const writableFixture = await artifactFixture();
    try {
      await chmod(
        path.join(writableFixture.root, "apps", "api", "dist", "main.js"),
        0o660,
      );
      await assert.rejects(
        verifyCurrentReleaseArtifact({
          artifactRoot: writableFixture.root,
          expectedOwnerUid: FIXTURE_OWNER_UID,
          expected: {
            expectedMigrationCount: MIGRATION_COUNT,
            expectedMigrationHead: MIGRATION,
            expectedSystemIdentifier: SYSTEM_IDENTIFIER,
            releaseSha: RELEASE_SHA,
            tenantSlug: "fixture-network",
          },
        }),
        { reasonCode: "CURRENT_RELEASE_ARTIFACT_ENTRY_NOT_IMMUTABLE" },
      );
    } finally {
      await rm(writableFixture.root, { recursive: true, force: true });
    }
  }
});

test("refuses production-shaped database targets and default runtime ports", () => {
  assert.deepEqual(assertCurrentReleaseDatabaseUrl(DATABASE_URL), {
    databaseName: "leetplus_restored_fixture",
    host: "127.0.0.1",
    port: 55449,
    roleName: "runtime",
  });
  assert.throws(
    () =>
      assertCurrentReleaseDatabaseUrl(
        "postgresql://runtime:fixture-secret-123456@192.0.2.1:5432/leetplus",
      ),
    { reasonCode: "CURRENT_RELEASE_DATABASE_HOST_NOT_LOOPBACK" },
  );
  assert.throws(
    () =>
      assertCurrentReleaseDatabaseUrl(
        "postgresql://runtime:fixture-secret-123456@127.0.0.1:55449/leetplus",
      ),
    { reasonCode: "CURRENT_RELEASE_DATABASE_NAME_NOT_ALLOWLISTED" },
  );
  assert.throws(
    () =>
      assertCurrentReleasePorts({
        apiPort: 4000,
        databasePort: 55449,
        webPort: 3317,
      }),
    { reasonCode: "CURRENT_RELEASE_PORT_NOT_ISOLATED" },
  );
});

test("forces production validation with independent ephemeral secrets and all effects off", () => {
  const built = buildCurrentReleaseApiEnvironment({
    apiPort: 4317,
    buildTime: "2026-08-21T00:00:00.000Z",
    databaseUrl: DATABASE_URL,
    expectedMigrationCount: MIGRATION_COUNT,
    expectedMigrationHead: MIGRATION,
    hostEnvironment: { PATH: "fixture-path", UNSAFE_SECRET: "must-not-pass" },
    releaseSha: RELEASE_SHA,
  });
  assert.equal(built.environment.NODE_ENV, "production");
  assert.equal(built.environment.API_BIND_HOST, "127.0.0.1");
  assert.equal(built.environment.UNSAFE_SECRET, undefined);
  for (const [key, value] of Object.entries(CURRENT_RELEASE_EFFECT_POLICY)) {
    assert.equal(built.environment[key], value, key);
  }
  assert.equal(
    new Set(built.sensitiveValues).size,
    built.sensitiveValues.length,
  );
  assert.ok(built.sensitiveValues.every((value) => value.length >= 43));
});

test("network guards have one exact listen port and one exact loopback connect port", () => {
  const source = buildCurrentReleaseNetworkGuardSource({
    allowedConnectPort: 55449,
    allowedListenPort: 4317,
  });
  assert.match(source, /allowedConnectPort = 55449/u);
  assert.match(source, /allowedListenPort = 4317/u);
  assert.match(source, /Array\.isArray\(args\[0\]\)/u);
  assert.match(source, /host !== loopback/u);
  assert.match(source, /CURRENT_RELEASE_NETWORK_CONNECT_PORT_BLOCKED/u);
  assert.match(source, /CURRENT_RELEASE_NETWORK_CONNECT_HOST_BLOCKED/u);
  assert.match(source, /CURRENT_RELEASE_DATAGRAM_BLOCKED/u);
  assert.doesNotThrow(() => new Function(source));
});

function currentReleaseDatabaseClient(identityOverrides = {}) {
  return {
    async query(sql) {
      if (sql.includes("pg_control_system()")) {
        return {
          rowCount: 1,
          rows: [
            {
              databaseName: "leetplus_restored_fixture",
              serverAddress: "127.0.0.1",
              serverPort: 55449,
              systemIdentifier: SYSTEM_IDENTIFIER,
              transactionReadOnly: "off",
              sessionUser: "runtime",
              currentUser: "runtime",
              runtimeRoleOid: "1001",
              databaseOwnerOid: "1001",
              runtimeCanLogin: true,
              runtimeInherit: false,
              runtimeSuperuser: false,
              runtimeBypassRls: false,
              runtimeCreateDatabase: false,
              runtimeCreateRole: false,
              runtimeReplication: false,
              runtimeRoleConfigCount: 0,
              publicSchemaOwnerOid: "1001",
              runtimeMembershipCount: 0,
              runtimeGrantedMembershipCount: 0,
              foreignPublicSchemaCreateGrantCount: 0,
              publicRelationGrantCount: 0,
              publicDefaultDataGrantCount: 0,
              classOwnerMismatchCount: 0,
              functionOwnerMismatchCount: 0,
              typeOwnerMismatchCount: 0,
              ...identityOverrides,
            },
          ],
        };
      }
      if (
        sql.includes('FROM "_prisma_migrations"') &&
        sql.includes("migration_name")
      ) {
        return { rowCount: 1, rows: [{ migrationName: MIGRATION }] };
      }
      if (sql.includes('FROM "_prisma_migrations"')) {
        return { rowCount: 1, rows: [{ count: 0 }] };
      }
      if (sql.includes("FROM pg_stat_activity")) {
        return { rowCount: 1, rows: [{ count: 0 }] };
      }
      if (sql.includes("lower(u.email)")) {
        return {
          rowCount: 1,
          rows: [{ tenantId: "tenant-fixture", userId: "user-owner" }],
        };
      }
      if (sql.includes('FROM "Tenant" t WHERE t.slug')) {
        return {
          rowCount: 1,
          rows: [
            {
              activeNetworkScopeCount: 1,
              activeStoresScopeCount: 0,
              activeUnresolvedScopeCount: 0,
              customRoleCount: 0,
              storeCount: 1,
              userCount: 1,
            },
          ],
        };
      }
      if (sql.includes("GROUP BY u.role")) {
        return {
          rowCount: 1,
          rows: [
            {
              accessScope: "NETWORK",
              isActive: true,
              isPlatformAdmin: false,
              role: "OWNER",
              storeAccessRows: 0,
              userCount: 1,
              usersWithStoreAccess: 0,
            },
          ],
        };
      }
      if (sql.includes('ARRAY(SELECT s.id::text FROM "Store"')) {
        return {
          rowCount: 1,
          rows: [{ ...SCOPE_ORACLE }],
        };
      }
      throw new Error(`unexpected query: ${digest(sql)}`);
    },
  };
}

test("attests a NOINHERIT membership-free owner role and produces a private scope oracle", async () => {
  const expected = {
    expectedMigrationCount: 1,
    expectedMigrationHead: MIGRATION,
    expectedSystemIdentifier: SYSTEM_IDENTIFIER,
    tenantSlug: "fixture-network",
  };
  const accepted = await inspectCurrentReleaseDatabase(
    currentReleaseDatabaseClient(),
    expected,
    assertCurrentReleaseDatabaseUrl(DATABASE_URL),
    "owner@example.test",
  );
  assert.equal(accepted.evidence.runtimeRoleBoundary.membershipCount, 0);
  assert.equal(accepted.evidence.runtimeRoleBoundary.reverseMembershipCount, 0);
  assert.deepEqual(accepted.scopeOracle.storeIds, ["store-1"]);
  assert.equal(
    JSON.stringify(accepted.evidence).includes("tenant-fixture"),
    false,
  );
  await assert.rejects(
    inspectCurrentReleaseDatabase(
      currentReleaseDatabaseClient({ runtimeMembershipCount: 1 }),
      expected,
      assertCurrentReleaseDatabaseUrl(DATABASE_URL),
      "owner@example.test",
    ),
    { reasonCode: "CURRENT_RELEASE_DATABASE_RUNTIME_ROLE_ATTESTATION_FAILED" },
  );
  await assert.rejects(
    inspectCurrentReleaseDatabase(
      currentReleaseDatabaseClient({ runtimeGrantedMembershipCount: 1 }),
      expected,
      assertCurrentReleaseDatabaseUrl(DATABASE_URL),
      "owner@example.test",
    ),
    { reasonCode: "CURRENT_RELEASE_DATABASE_RUNTIME_ROLE_ATTESTATION_FAILED" },
  );
});

test("attempts exact fixture cleanup even when runtime drain attestation fails", async () => {
  let cleanupCalls = 0;
  const finalized = await finalizeCurrentReleaseRuntime(
    {},
    {
      apiPort: 4317,
      cgroupPath: "/fixture",
      fixture: { id: "fixture-id", title: "fixture-title" },
      tenantSlug: "fixture-network",
      webPort: 3317,
    },
    {
      async waitForRuntimeResidueAbsence() {
        const error = new Error("secret-free drain failure");
        error.reasonCode = "CURRENT_RELEASE_RUNTIME_RESIDUE_PRESENT";
        error.safeContractError = true;
        throw error;
      },
      async cleanupCurrentReleaseFixture() {
        cleanupCalls += 1;
        return Object.freeze({ directCleanupRequired: false, residue: 0 });
      },
    },
  );
  assert.equal(cleanupCalls, 1);
  assert.deepEqual(finalized.failureReasonCodes, [
    "CURRENT_RELEASE_RUNTIME_RESIDUE_PRESENT",
  ]);
  assert.deepEqual(finalized.cleanupEvidence, {
    directCleanupRequired: false,
    residue: 0,
  });
  assert.equal(finalized.runtimeDrainEvidence, null);
});

test("requires a real non-root Linux kernel sandbox before runtime effects", async () => {
  await assert.rejects(attestCurrentReleaseKernelSandbox(), (error) =>
    /^CURRENT_RELEASE_KERNEL_SANDBOX_/u.test(error?.reasonCode ?? ""),
  );
});

test("accepts exact API/Web identity, BFF auth and the complete beta read matrix", async () => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input);
    calls.push({
      authorization: init.headers?.Authorization ?? null,
      cookie: init.headers?.Cookie ?? null,
      method: init.method ?? "GET",
      path: `${url.pathname}${url.search}`,
      port: Number(url.port),
    });
    const headers = { "content-type": "application/json" };
    const authenticated = Boolean(
      init.headers?.Authorization ?? init.headers?.Cookie,
    );
    let status = 200;
    let body = validCriticalBody(url.pathname);
    if (!authenticated && CRITICAL_PATHNAMES.has(url.pathname)) {
      status = 401;
      body = { message: "Unauthorized" };
    }
    if (url.pathname === "/version") {
      body = { release: { sha: RELEASE_SHA } };
    } else if (url.pathname === "/health/ready") {
      body = {
        dependencies: {
          database: { migration: MIGRATION, migrationCount: MIGRATION_COUNT },
        },
        ok: true,
        release: { sha: RELEASE_SHA },
      };
    } else if (url.pathname === "/api/release-identity") {
      headers["cache-control"] = "no-store, max-age=0";
      body = {
        ok: true,
        release: { sha: RELEASE_SHA, webBuildId: RELEASE_SHA },
      };
    } else if (url.pathname === "/api/auth/login") {
      headers["set-cookie"] =
        "leetplus_access_token=fixture-access-token-that-is-long-enough; Path=/; HttpOnly; Secure; SameSite=Lax";
      body = {
        user: {
          id: "user-owner",
          isPlatformAdmin: false,
          tenantSlug: "fixture-network",
        },
      };
    } else if (url.pathname === "/api/auth/me") {
      body = {
        user: {
          accessScope: "NETWORK",
          id: "user-owner",
          isPlatformAdmin: false,
          role: "OWNER",
          tenantSlug: "fixture-network",
        },
      };
    }
    return new Response(JSON.stringify(body), { headers, status });
  };

  const accepted = await executeCurrentReleaseHttpAcceptance({
    apiPort: 4317,
    expectedMigrationCount: MIGRATION_COUNT,
    expectedMigrationHead: MIGRATION,
    fetchImpl,
    loginEmail: "owner@example.test",
    loginPassword: "fixture-password",
    releaseSha: RELEASE_SHA,
    scopeOracle: SCOPE_ORACLE,
    tenantSlug: "fixture-network",
    webPort: 3317,
  });
  assert.equal(
    accepted.probes.length,
    5 + CURRENT_RELEASE_CRITICAL_READS.length * 2,
  );
  assert.equal(
    accepted.probes.filter((probe) => probe.name.startsWith("unauthenticated-"))
      .length,
    CURRENT_RELEASE_CRITICAL_READS.length,
  );
  assert.equal(
    accepted.usersProjection.capabilityCount,
    CURRENT_RELEASE_CAPABILITY_KEYS.length,
  );
  assert.equal(accepted.usersProjection.customRoleCount, 0);
  assert.equal(accepted.usersProjection.inviteCount, 1);
  assert.equal(
    accepted.usersProjection.roleOptionCount,
    ROLE_OPTION_ROLES.length,
  );
  assert.equal(accepted.usersProjection.storeCount, 1);
  assert.equal(
    accepted.usersProjection.storeIdSetDigest,
    digest(JSON.stringify(["store-1"])),
  );
  assert.equal(accepted.usersProjection.userCount, 1);
  assert.equal(
    accepted.usersProjection.userIdSetDigest,
    digest(JSON.stringify(["user-owner"])),
  );
  for (const key of [
    "capabilityKeySetDigest",
    "inviteSemanticSetDigest",
    "rolePermissionSetDigest",
    "userSemanticSetDigest",
  ]) {
    assert.match(accepted.usersProjection[key], /^[0-9a-f]{64}$/u, key);
  }
  assert.equal(accepted.moduleCounts.gamification, 5);
  assert.equal(accepted.moduleCounts["users-roles"], 1);
  const directStoreCall = calls.find(
    (call) => call.path === "/stores" && call.authorization,
  );
  assert.equal(directStoreCall.port, 4317);
  assert.match(directStoreCall.authorization, /^Bearer /u);
  const staffCalls = calls.filter((call) =>
    call.path.startsWith("/api/staff/"),
  );
  const expectedStaffReads = CURRENT_RELEASE_CRITICAL_READS.filter((probe) =>
    probe.path.startsWith("/api/staff/"),
  ).length;
  assert.equal(
    staffCalls.filter((call) =>
      call.cookie?.startsWith("leetplus_access_token="),
    ).length,
    expectedStaffReads,
  );
  assert.equal(
    staffCalls.filter((call) => call.cookie === null).length,
    expectedStaffReads,
  );
});

test("binds users, invites, roles and capabilities to the database authority oracle", () => {
  const valid = validCriticalBody("/api/users");
  const accepted = assertCurrentReleaseUsersNetworkProjectionForTestOnly({
    body: valid,
    scopeOracle: SCOPE_ORACLE,
  });
  assert.equal(accepted.userCount, 1);
  assert.equal(accepted.inviteCount, 1);

  const missingInvite = structuredClone(valid);
  missingInvite.invites = [];
  assert.throws(
    () =>
      assertCurrentReleaseUsersNetworkProjectionForTestOnly({
        body: missingInvite,
        scopeOracle: SCOPE_ORACLE,
      }),
    { reasonCode: "CURRENT_RELEASE_USERS_INVITE_SET_MISMATCH" },
  );

  const wrongUserAuthority = structuredClone(valid);
  wrongUserAuthority.users[0].role = "ADMIN";
  assert.throws(
    () =>
      assertCurrentReleaseUsersNetworkProjectionForTestOnly({
        body: wrongUserAuthority,
        scopeOracle: SCOPE_ORACLE,
      }),
    { reasonCode: "CURRENT_RELEASE_USERS_SEMANTICS_MISMATCH" },
  );

  const skeletalCapabilities = structuredClone(valid);
  skeletalCapabilities.capabilityOptions = [{}];
  assert.throws(
    () =>
      assertCurrentReleaseUsersNetworkProjectionForTestOnly({
        body: skeletalCapabilities,
        scopeOracle: SCOPE_ORACLE,
      }),
    { reasonCode: "CURRENT_RELEASE_USERS_CAPABILITIES_INVALID" },
  );

  const wrongRolePermissions = structuredClone(valid);
  wrongRolePermissions.roleOptions[0].permissions = [];
  assert.throws(
    () =>
      assertCurrentReleaseUsersNetworkProjectionForTestOnly({
        body: wrongRolePermissions,
        scopeOracle: SCOPE_ORACLE,
      }),
    { reasonCode: "CURRENT_RELEASE_USERS_ROLE_OPTIONS_INVALID" },
  );
});

test("pins every no-override base role permission set", () => {
  const valid = validCriticalBody("/api/users");
  for (const [role, permissions] of Object.entries(BASE_ROLE_PERMISSIONS)) {
    const body = structuredClone(valid);
    const scopeOracle = structuredClone(SCOPE_ORACLE);
    scopeOracle.roleOverrideSemantics =
      scopeOracle.roleOverrideSemantics.filter(
        (override) => override.role !== role,
      );
    if (role === "OWNER") {
      body.users[0].permissions = [...permissions];
    } else {
      const option = body.roleOptions.find(
        (candidate) => candidate.role === role,
      );
      assert.ok(option, role);
      option.isOverridden = false;
      option.permissions = [...permissions];
      option.updatedAt = null;
    }
    assert.doesNotThrow(
      () =>
        assertCurrentReleaseUsersNetworkProjectionForTestOnly({
          body,
          scopeOracle,
        }),
      role,
    );
  }
});

test("rejects a cross-tenant store leaked by an authenticated API response", async () => {
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input);
    const headers = { "content-type": "application/json" };
    const authenticated = Boolean(
      init.headers?.Authorization ?? init.headers?.Cookie,
    );
    let status = 200;
    let body = validCriticalBody(url.pathname);
    if (!authenticated && CRITICAL_PATHNAMES.has(url.pathname)) {
      status = 401;
      body = { message: "Unauthorized" };
    } else if (url.pathname === "/version") {
      body = { release: { sha: RELEASE_SHA } };
    } else if (url.pathname === "/health/ready") {
      body = {
        dependencies: {
          database: { migration: MIGRATION, migrationCount: MIGRATION_COUNT },
        },
        ok: true,
        release: { sha: RELEASE_SHA },
      };
    } else if (url.pathname === "/api/release-identity") {
      headers["cache-control"] = "no-store";
      body = {
        ok: true,
        release: { sha: RELEASE_SHA, webBuildId: RELEASE_SHA },
      };
    } else if (url.pathname === "/api/auth/login") {
      headers["set-cookie"] =
        "leetplus_access_token=fixture-access-token-that-is-long-enough; HttpOnly; Secure";
      body = {
        user: {
          id: "user-owner",
          isPlatformAdmin: false,
          tenantSlug: "fixture-network",
        },
      };
    } else if (url.pathname === "/api/auth/me") {
      body = {
        user: {
          accessScope: "NETWORK",
          id: "user-owner",
          isPlatformAdmin: false,
          role: "OWNER",
          tenantSlug: "fixture-network",
        },
      };
    } else if (url.pathname === "/stores" && authenticated) {
      body = [{ id: "foreign-store", name: "Foreign" }];
    }
    return new Response(JSON.stringify(body), { headers, status });
  };
  await assert.rejects(
    executeCurrentReleaseHttpAcceptance({
      apiPort: 4317,
      expectedMigrationCount: MIGRATION_COUNT,
      expectedMigrationHead: MIGRATION,
      fetchImpl,
      loginEmail: "owner@example.test",
      loginPassword: "fixture-password",
      releaseSha: RELEASE_SHA,
      scopeOracle: SCOPE_ORACLE,
      tenantSlug: "fixture-network",
      webPort: 3317,
    }),
    { reasonCode: "CURRENT_RELEASE_STORES_ID_SET_MISMATCH" },
  );
});

test("binds report rows to the tenant database oracle and rejects silent empty data", () => {
  const valid = validCriticalBody("/api/staff/directory");
  const projection = assertCurrentReleaseCriticalReadForTestOnly({
    body: valid,
    module: "staff-control",
    name: "directory",
    scopeOracle: SCOPE_ORACLE,
  });
  assert.match(projection.boundEntitySetDigest, /^[0-9a-f]{64}$/u);

  assert.throws(
    () =>
      assertCurrentReleaseCriticalReadForTestOnly({
        body: { ...valid, rows: [], summary: { total: 1 } },
        module: "staff-control",
        name: "directory",
        scopeOracle: SCOPE_ORACLE,
      }),
    { reasonCode: "CURRENT_RELEASE_CRITICAL_READ_ENTITY_SET_EMPTY" },
  );
  assert.throws(
    () =>
      assertCurrentReleaseCriticalReadForTestOnly({
        body: {
          ...valid,
          rows: [{ id: "foreign-row-without-tenant-marker" }],
          summary: { total: 1 },
        },
        module: "staff-control",
        name: "directory",
        scopeOracle: SCOPE_ORACLE,
      }),
    { reasonCode: "CURRENT_RELEASE_CRITICAL_READ_ENTITY_SET_MISMATCH" },
  );
});

test("binds gamification workspace aggregates to DB entity sets and pilot markers", () => {
  const valid = validCriticalBody("/api/guests/gamification/workspace");
  const projection = assertCurrentReleaseCriticalReadForTestOnly({
    body: valid,
    module: "gamification",
    name: "workspace",
    scopeOracle: SCOPE_ORACLE,
  });
  assert.match(projection.boundEntitySetDigest, /^[0-9a-f]{64}$/u);
  assert.match(projection.semanticMarkerDigest, /^[0-9a-f]{64}$/u);

  const emptyStaticShell = structuredClone(valid);
  for (const key of [
    "profiles",
    "lootBoxes",
    "missions",
    "seasons",
    "promoCards",
    "rewards",
    "events",
    "tariffSnapshots",
  ]) {
    emptyStaticShell[key] = [];
  }
  assert.throws(
    () =>
      assertCurrentReleaseCriticalReadForTestOnly({
        body: emptyStaticShell,
        module: "gamification",
        name: "workspace",
        scopeOracle: SCOPE_ORACLE,
      }),
    { reasonCode: "CURRENT_RELEASE_CRITICAL_READ_ENTITY_SET_MISMATCH" },
  );

  const wrongSummary = structuredClone(valid);
  wrongSummary.summary.activeMissions = 0;
  assert.throws(
    () =>
      assertCurrentReleaseCriticalReadForTestOnly({
        body: wrongSummary,
        module: "gamification",
        name: "workspace",
        scopeOracle: SCOPE_ORACLE,
      }),
    { reasonCode: "CURRENT_RELEASE_GAMIFICATION_WORKSPACE_SEMANTICS_INVALID" },
  );

  const foreignPilot = structuredClone(valid);
  foreignPilot.pilotReadiness.targetStore.id = "foreign-store";
  assert.throws(
    () =>
      assertCurrentReleaseCriticalReadForTestOnly({
        body: foreignPilot,
        module: "gamification",
        name: "workspace",
        scopeOracle: SCOPE_ORACLE,
      }),
    { reasonCode: "CURRENT_RELEASE_GAMIFICATION_WORKSPACE_SEMANTICS_INVALID" },
  );

  const inconsistentReadiness = structuredClone(valid);
  inconsistentReadiness.integrationReadiness.items[0].ready = true;
  assert.throws(
    () =>
      assertCurrentReleaseCriticalReadForTestOnly({
        body: inconsistentReadiness,
        module: "gamification",
        name: "workspace",
        scopeOracle: SCOPE_ORACLE,
      }),
    { reasonCode: "CURRENT_RELEASE_GAMIFICATION_WORKSPACE_SEMANTICS_INVALID" },
  );

  const wrongReadinessPercent = structuredClone(valid);
  wrongReadinessPercent.pilotReadiness.summary.readinessPercent = 1;
  assert.throws(
    () =>
      assertCurrentReleaseCriticalReadForTestOnly({
        body: wrongReadinessPercent,
        module: "gamification",
        name: "workspace",
        scopeOracle: SCOPE_ORACLE,
      }),
    { reasonCode: "CURRENT_RELEASE_GAMIFICATION_WORKSPACE_SEMANTICS_INVALID" },
  );
});

test("fails closed when auth/me is not an OWNER with fresh NETWORK scope", async () => {
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input);
    const headers = { "content-type": "application/json" };
    let body = {};
    let status = 200;
    if (
      !(init.headers?.Authorization ?? init.headers?.Cookie) &&
      CRITICAL_PATHNAMES.has(url.pathname)
    ) {
      body = { message: "Unauthorized" };
      status = 401;
    }
    if (url.pathname === "/version") body = { release: { sha: RELEASE_SHA } };
    if (url.pathname === "/health/ready") {
      body = {
        dependencies: {
          database: { migration: MIGRATION, migrationCount: MIGRATION_COUNT },
        },
        ok: true,
        release: { sha: RELEASE_SHA },
      };
    }
    if (url.pathname === "/api/release-identity") {
      headers["cache-control"] = "no-store";
      body = {
        ok: true,
        release: { sha: RELEASE_SHA, webBuildId: RELEASE_SHA },
      };
    }
    if (url.pathname === "/api/auth/login") {
      headers["set-cookie"] =
        "leetplus_access_token=fixture-access-token-that-is-long-enough; HttpOnly; Secure";
      body = {
        user: {
          id: "user-owner",
          isPlatformAdmin: false,
          tenantSlug: "fixture-network",
        },
      };
    }
    if (url.pathname === "/api/auth/me") {
      body = {
        user: {
          accessScope: "STORES",
          id: "user-owner",
          isPlatformAdmin: false,
          role: "OWNER",
          tenantSlug: "fixture-network",
        },
      };
    }
    return new Response(JSON.stringify(body), { headers, status });
  };
  await assert.rejects(
    executeCurrentReleaseHttpAcceptance({
      apiPort: 4317,
      expectedMigrationCount: MIGRATION_COUNT,
      expectedMigrationHead: MIGRATION,
      fetchImpl,
      loginEmail: "owner@example.test",
      loginPassword: "fixture-password",
      releaseSha: RELEASE_SHA,
      scopeOracle: SCOPE_ORACLE,
      tenantSlug: "fixture-network",
      webPort: 3317,
    }),
    { reasonCode: "CURRENT_RELEASE_AUTH_ME_SCOPE_MISMATCH" },
  );
});

test("rejects status-only empty critical module projections", async () => {
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input);
    const headers = { "content-type": "application/json" };
    let status = 200;
    let body = validCriticalBody(url.pathname);
    if (
      !(init.headers?.Authorization ?? init.headers?.Cookie) &&
      CRITICAL_PATHNAMES.has(url.pathname)
    ) {
      body = { message: "Unauthorized" };
      status = 401;
    }
    if (url.pathname === "/version") body = { release: { sha: RELEASE_SHA } };
    if (url.pathname === "/health/ready") {
      body = {
        dependencies: {
          database: { migration: MIGRATION, migrationCount: MIGRATION_COUNT },
        },
        ok: true,
        release: { sha: RELEASE_SHA },
      };
    }
    if (url.pathname === "/api/release-identity") {
      headers["cache-control"] = "no-store";
      body = {
        ok: true,
        release: { sha: RELEASE_SHA, webBuildId: RELEASE_SHA },
      };
    }
    if (url.pathname === "/api/auth/login") {
      headers["set-cookie"] =
        "leetplus_access_token=fixture-access-token-that-is-long-enough; HttpOnly; Secure";
      body = {
        user: {
          id: "user-owner",
          isPlatformAdmin: false,
          tenantSlug: "fixture-network",
        },
      };
    }
    if (url.pathname === "/api/auth/me") {
      body = {
        user: {
          accessScope: "NETWORK",
          id: "user-owner",
          isPlatformAdmin: false,
          role: "OWNER",
          tenantSlug: "fixture-network",
        },
      };
    }
    if (url.pathname === "/api/products/catalog") body = {};
    return new Response(JSON.stringify(body), { headers, status });
  };
  await assert.rejects(
    executeCurrentReleaseHttpAcceptance({
      apiPort: 4317,
      expectedMigrationCount: MIGRATION_COUNT,
      expectedMigrationHead: MIGRATION,
      fetchImpl,
      loginEmail: "owner@example.test",
      loginPassword: "fixture-password",
      releaseSha: RELEASE_SHA,
      scopeOracle: SCOPE_ORACLE,
      tenantSlug: "fixture-network",
      webPort: 3317,
    }),
    { reasonCode: "CURRENT_RELEASE_CRITICAL_READ_SCHEMA_INVALID" },
  );
});

test("performs exact adversarial cleanup and reports that API deletion left residue", async () => {
  let deleted = false;
  const client = {
    async query(sql) {
      if (sql.startsWith('SELECT id FROM "Tenant"')) {
        return { rowCount: 1, rows: [{ id: "tenant-id" }] };
      }
      if (sql.startsWith("DELETE")) {
        deleted = true;
        return { rowCount: 1, rows: [] };
      }
      return {
        rowCount: 1,
        rows: [{ count: deleted ? 0 : 1 }],
      };
    },
  };
  const cleanup = await cleanupCurrentReleaseFixture(
    client,
    "fixture-network",
    { id: "fixture-id", title: "__current_release_acceptance_fixture" },
  );
  assert.deepEqual(cleanup, { directCleanupRequired: true, residue: 0 });
  assert.equal(deleted, true);
});

test("signs aggregate-only evidence and detects receipt tampering", () => {
  const hmacKey = "independent-fixture-hmac-key-0123456789abcdef";
  const receipt = createSignedCurrentReleaseReceipt(
    {
      contractVersion: "fixture",
      decision: "PASS",
      evidence: { probes: [{ bytes: 12, bodySha256: "a".repeat(64) }] },
      releaseSha: RELEASE_SHA,
    },
    { hmacKey, keyId: "fixture-key-v1" },
  );
  assert.equal(verifySignedCurrentReleaseReceipt(receipt, hmacKey), true);
  assert.equal(
    verifySignedCurrentReleaseReceipt(
      { ...receipt, decision: "FAIL" },
      hmacKey,
    ),
    false,
  );
  assert.doesNotMatch(JSON.stringify(receipt), /owner@example\.test/u);
});

test("publishes evidence once in an existing protected directory", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "current-release-evidence-test-"),
  );
  const evidencePath = path.join(directory, "receipt.json");
  try {
    await writeCurrentReleaseEvidenceReceipt(evidencePath, {
      decision: "PASS",
    });
    await assert.rejects(
      writeCurrentReleaseEvidenceReceipt(evidencePath, { decision: "FAIL" }),
      { reasonCode: "CURRENT_RELEASE_EVIDENCE_ALREADY_EXISTS" },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI requires explicit confirmation and forwards secrets without printing them", async () => {
  const argv = [
    "--confirm",
    "run-current-release-restored-copy-runtime-acceptance",
    "--artifact-root",
    path.resolve("artifact"),
    "--release-sha",
    RELEASE_SHA,
    "--tenant-slug",
    "fixture-network",
    "--expected-system-identifier",
    SYSTEM_IDENTIFIER,
    "--expected-migration-count",
    String(MIGRATION_COUNT),
    "--expected-migration-head",
    MIGRATION,
    "--api-port",
    "4317",
    "--web-port",
    "3317",
    "--startup-timeout-ms",
    "120000",
    "--evidence-key-id",
    "fixture-key-v1",
    "--evidence",
    path.resolve("receipt.json"),
  ];
  assert.equal(parseArgs(argv).withReversibleWrite, false);
  assert.equal(parseArgs(argv).startupTimeoutMs, 120_000);
  let received;
  let output = "";
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk) => {
    output += String(chunk);
    return true;
  };
  try {
    const exitCode = await cliMain(
      argv,
      {
        CURRENT_RELEASE_EVIDENCE_HMAC_KEY:
          "fixture-secret-hmac-value-that-must-not-print",
        CURRENT_RELEASE_LOGIN_EMAIL: "owner@example.test",
        CURRENT_RELEASE_LOGIN_PASSWORD: "fixture-password",
        CURRENT_RELEASE_RESTORED_DATABASE_URL: DATABASE_URL,
      },
      async (options) => {
        received = options;
        return {
          contractVersion: "fixture",
          decision: "PASS",
          evidence: { runtime: { startupTimeoutMs: 120_000 } },
          evidenceDigest: "a".repeat(64),
          reasonCode: null,
          releaseSha: RELEASE_SHA,
          signature: { keyId: "fixture-key-v1" },
        };
      },
    );
    assert.equal(exitCode, 0);
  } finally {
    process.stdout.write = originalWrite;
  }
  assert.equal(received.loginPassword, "fixture-password");
  assert.equal(received.startupTimeoutMs, 120_000);
  assert.doesNotMatch(
    output,
    /fixture-password|owner@example\.test|secret-hmac/u,
  );
  assert.match(output, /"decision":"PASS"/u);
});

test("normalizes startup timeout and rejects ambiguous or unsafe CLI values", () => {
  assert.equal(
    normalizeCurrentReleaseStartupTimeoutMs(),
    CURRENT_RELEASE_STARTUP_TIMEOUT_DEFAULT_MS,
  );
  assert.equal(
    normalizeCurrentReleaseStartupTimeoutMs(
      CURRENT_RELEASE_STARTUP_TIMEOUT_MIN_MS,
    ),
    CURRENT_RELEASE_STARTUP_TIMEOUT_MIN_MS,
  );
  assert.equal(
    normalizeCurrentReleaseStartupTimeoutMs(
      CURRENT_RELEASE_STARTUP_TIMEOUT_MAX_MS,
    ),
    CURRENT_RELEASE_STARTUP_TIMEOUT_MAX_MS,
  );
  for (const invalid of [
    CURRENT_RELEASE_STARTUP_TIMEOUT_MIN_MS - 1,
    CURRENT_RELEASE_STARTUP_TIMEOUT_MAX_MS + 1,
    90_000.5,
    Number.NaN,
  ]) {
    assert.throws(
      () => normalizeCurrentReleaseStartupTimeoutMs(invalid),
      { reasonCode: "CURRENT_RELEASE_STARTUP_TIMEOUT_INVALID" },
    );
  }

  const base = [
    "--confirm",
    "run-current-release-restored-copy-runtime-acceptance",
    "--artifact-root",
    path.resolve("artifact"),
    "--release-sha",
    RELEASE_SHA,
    "--tenant-slug",
    "fixture-network",
    "--expected-system-identifier",
    SYSTEM_IDENTIFIER,
    "--expected-migration-count",
    String(MIGRATION_COUNT),
    "--expected-migration-head",
    MIGRATION,
    "--api-port",
    "4317",
    "--web-port",
    "3317",
    "--evidence-key-id",
    "fixture-key-v1",
    "--evidence",
    path.resolve("receipt.json"),
  ];
  assert.equal(
    parseArgs(base).startupTimeoutMs,
    CURRENT_RELEASE_STARTUP_TIMEOUT_DEFAULT_MS,
  );
  for (const invalid of ["090000", "90000.0", "1e5", "9999", "300001", "-1"]) {
    assert.throws(
      () => parseArgs([...base, "--startup-timeout-ms", invalid]),
      /ARGUMENTS_INVALID/u,
    );
  }
});

test("CLI consumes one exact bounded systemd credential and rejects mixed sources", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "current-release-credential-"),
  );
  try {
    const credentialPath = path.join(root, "current-release-runtime.json");
    const credential = {
      databaseUrl: DATABASE_URL,
      evidenceHmacKey: "fixture-hmac-key-that-is-at-least-32-bytes",
      loginEmail: "owner@example.test",
      loginPassword: "fixture-password",
    };
    await writeFile(credentialPath, `${JSON.stringify(credential)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    assert.deepEqual(
      await loadCurrentReleaseSecrets({ CREDENTIALS_DIRECTORY: root }),
      credential,
    );
    await assert.rejects(
      loadCurrentReleaseSecrets({
        CREDENTIALS_DIRECTORY: root,
        CURRENT_RELEASE_LOGIN_EMAIL: "mixed@example.test",
      }),
      /CREDENTIAL_SOURCE_INVALID/u,
    );
    await writeFile(credentialPath, '{"databaseUrl":"only-one-key"}\n');
    await assert.rejects(
      loadCurrentReleaseSecrets({ CREDENTIALS_DIRECTORY: root }),
      /CREDENTIAL_FILE_INVALID/u,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("CLI re-verifies one exact signed receipt after a lost systemd response", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "current-release-verify-"));
  const evidencePath = path.join(root, "receipt.json");
  const hmacKey = "fixture-hmac-key-that-is-at-least-32-bytes";
  const receipt = createSignedCurrentReleaseReceipt(
    {
      contractVersion: CURRENT_RELEASE_RUNTIME_ACCEPTANCE_CONTRACT,
      decision: "PASS",
      evidence: {
        runtime: {
          startupTimeoutMs: CURRENT_RELEASE_STARTUP_TIMEOUT_DEFAULT_MS,
        },
      },
      reasonCode: null,
      releaseSha: RELEASE_SHA,
    },
    { hmacKey, keyId: "fixture-key-v1" },
  );
  try {
    await writeFile(evidencePath, `${JSON.stringify(receipt)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    assert.deepEqual(
      await verifyCurrentReleaseEvidence(
        {
          evidenceKeyId: "fixture-key-v1",
          evidencePath,
          releaseSha: RELEASE_SHA,
        },
        hmacKey,
      ),
      {
        contractVersion: receipt.contractVersion,
        decision: "PASS",
        evidenceDigest: receipt.evidenceDigest,
        reasonCode: null,
        releaseSha: RELEASE_SHA,
        signatureKeyId: "fixture-key-v1",
        signatureValid: true,
        startupTimeoutMs: CURRENT_RELEASE_STARTUP_TIMEOUT_DEFAULT_MS,
      },
    );
    let output = "";
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
      output += String(chunk);
      return true;
    };
    try {
      assert.equal(
        await cliMain(
          [
            "--verify-evidence",
            "--release-sha",
            RELEASE_SHA,
            "--evidence-key-id",
            "fixture-key-v1",
            "--evidence",
            evidencePath,
          ],
          {
            CURRENT_RELEASE_EVIDENCE_HMAC_KEY: hmacKey,
            CURRENT_RELEASE_LOGIN_EMAIL: "owner@example.test",
            CURRENT_RELEASE_LOGIN_PASSWORD: "fixture-password",
            CURRENT_RELEASE_RESTORED_DATABASE_URL: DATABASE_URL,
          },
          async () => {
            throw new Error("VERIFY_MODE_MUST_NOT_RUN_RUNTIME");
          },
        ),
        0,
      );
    } finally {
      process.stdout.write = originalWrite;
    }
    assert.match(output, /"signatureValid":true/u);
    assert.match(output, /"startupTimeoutMs":90000/u);
    assert.doesNotMatch(
      output,
      /fixture-password|owner@example\.test|postgresql:/u,
    );
    const tampered = { ...receipt, releaseSha: "e".repeat(40) };
    await writeFile(evidencePath, `${JSON.stringify(tampered)}\n`);
    await assert.rejects(
      verifyCurrentReleaseEvidence(
        {
          evidenceKeyId: "fixture-key-v1",
          evidencePath,
          releaseSha: RELEASE_SHA,
        },
        hmacKey,
      ),
      /EVIDENCE_VERIFICATION_FAILED/u,
    );

    const missingTelemetry = createSignedCurrentReleaseReceipt(
      {
        contractVersion: CURRENT_RELEASE_RUNTIME_ACCEPTANCE_CONTRACT,
        decision: "PASS",
        reasonCode: null,
        releaseSha: RELEASE_SHA,
      },
      { hmacKey, keyId: "fixture-key-v1" },
    );
    await writeFile(evidencePath, `${JSON.stringify(missingTelemetry)}\n`);
    await assert.rejects(
      verifyCurrentReleaseEvidence(
        {
          evidenceKeyId: "fixture-key-v1",
          evidencePath,
          releaseSha: RELEASE_SHA,
        },
        hmacKey,
      ),
      /EVIDENCE_VERIFICATION_FAILED/u,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
