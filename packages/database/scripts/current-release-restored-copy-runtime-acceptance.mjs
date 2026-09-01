import { createHash, createHmac, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import {
  lstat,
  mkdtemp,
  open,
  readdir,
  readFile,
  readlink,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import pg from "pg";

export const CURRENT_RELEASE_RUNTIME_ACCEPTANCE_CONTRACT =
  "LEETPLUS_CURRENT_RELEASE_RESTORED_COPY_RUNTIME_ACCEPTANCE_V2";
export const CURRENT_RELEASE_RUNTIME_ACCEPTANCE_PASS = "PASS";
export const CURRENT_RELEASE_RUNTIME_ACCEPTANCE_FAIL = "FAIL";

const LOOPBACK = "127.0.0.1";
const SHA40 = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_DATABASE = /^leetplus_restored_[a-z0-9_]{3,48}$/u;
const SAFE_MIGRATION = /^\d{14}_[a-z0-9_]{3,100}$/u;
const SAFE_TENANT_SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/u;
const SAFE_KEY_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/u;
const SAFE_ROLE = /^[a-z_][a-z0-9_]{2,62}$/u;
const SYSTEM_IDENTIFIER = /^\d{10,24}$/u;
const MAX_MANIFEST_BYTES = 16 * 1024 * 1024;
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const MAX_LOG_BYTES = 32 * 1024 * 1024;
const DEFAULT_HTTP_TIMEOUT_MS = 15_000;
export const CURRENT_RELEASE_STARTUP_TIMEOUT_DEFAULT_MS = 90_000;
export const CURRENT_RELEASE_STARTUP_TIMEOUT_MIN_MS = 10_000;
export const CURRENT_RELEASE_STARTUP_TIMEOUT_MAX_MS = 300_000;

export const CURRENT_RELEASE_CAPABILITY_KEYS = Object.freeze([
  "view_dashboard",
  "view_reports",
  "view_assortment_reports",
  "export_reports",
  "manage_assortment_reports",
  "view_assortment_products",
  "view_assortment_catalog",
  "view_assortment_stores",
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
  "view_support_tickets",
  "manage_support_tickets",
  "view_staff",
  "view_staff_shift_workspace",
  "view_staff_tasks",
  "manage_staff_tasks",
  "view_staff_standards",
  "manage_staff_standards",
  "view_staff_training",
  "manage_staff_training",
  "view_staff_knowledge",
  "view_staff_control",
  "manage_staff_control",
  "view_staff_directory",
  "manage_staff_directory",
  "view_staff_salary",
  "manage_staff_salary",
  "edit_staff_knowledge",
  "review_staff_knowledge",
  "publish_staff_knowledge",
  "manage_users",
  "manage_integrations",
  "run_sync",
  "import_guest_foundation",
  "import_data",
  "use_utilities",
  "edit_products",
  "edit_catalog",
  "edit_stores",
]);
const CURRENT_RELEASE_CAPABILITY_SET = new Set(CURRENT_RELEASE_CAPABILITY_KEYS);
const CURRENT_RELEASE_USER_ROLES = Object.freeze([
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
]);
const CURRENT_RELEASE_ROLE_OPTION_ROLES = Object.freeze(
  CURRENT_RELEASE_USER_ROLES.filter((role) => role !== "OWNER"),
);
const CURRENT_RELEASE_MINIMUM_ROLE_CAPABILITIES = Object.freeze({
  ADMIN: Object.freeze([
    "view_communications",
    "view_support_tickets",
    "manage_support_tickets",
    "view_staff",
    "view_staff_tasks",
    "view_staff_standards",
    "view_staff_knowledge",
    "edit_staff_knowledge",
    "review_staff_knowledge",
    "publish_staff_knowledge",
  ]),
  BUYER: Object.freeze(["view_communications"]),
  CLUB_ADMINISTRATOR: Object.freeze([
    "view_communications",
    "view_staff",
    "view_staff_tasks",
    "view_staff_standards",
    "view_staff_knowledge",
  ]),
  CLUB_MANAGER: Object.freeze(["view_communications"]),
  MANAGER: Object.freeze([
    "view_communications",
    "view_staff_knowledge",
    "edit_staff_knowledge",
    "review_staff_knowledge",
    "publish_staff_knowledge",
  ]),
  MARKETER: Object.freeze(["view_communications"]),
  OWNER: Object.freeze([
    "view_communications",
    "view_support_tickets",
    "manage_support_tickets",
    "view_staff_knowledge",
    "edit_staff_knowledge",
    "review_staff_knowledge",
    "publish_staff_knowledge",
  ]),
  SENIOR_ADMINISTRATOR: Object.freeze([
    "view_communications",
    "view_staff",
    "view_staff_tasks",
    "view_staff_standards",
    "view_staff_knowledge",
  ]),
  STANDARDS_MANAGER: Object.freeze([
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
  ]),
  TRAINEE: Object.freeze(["view_communications"]),
});
const CURRENT_RELEASE_BASE_ROLE_PERMISSION_DIGESTS = Object.freeze({
  ADMIN: "d6a1685414b2e729ba32bcb8668cc313ee39e658a2cfda85b13060e0b282d565",
  BUYER: "e82d7dfd2d5fa52e005a31f2177c773fa1745ff30878f036dc3ca3c0edc8bdd5",
  CLUB_ADMINISTRATOR:
    "448e5c0bca56d6d1c0bb5134ddb4e3a51d79408f69a5e23e596655a607866a43",
  CLUB_MANAGER:
    "008ca8e2b8573b67c9a4c5ba2cf3a2b0b1c0f944efb0c063ad2c6f13f8a3d692",
  MANAGER: "052d3607edfa801fdbd03614ea531edfbf05669b6928d23f4499876ba5a052e0",
  MARKETER: "89397e45815587e098c5ebaf0ca8de92c4df61cb1632b7ccc04af9a76a70a515",
  OWNER: "d6a1685414b2e729ba32bcb8668cc313ee39e658a2cfda85b13060e0b282d565",
  SENIOR_ADMINISTRATOR:
    "448e5c0bca56d6d1c0bb5134ddb4e3a51d79408f69a5e23e596655a607866a43",
  STANDARDS_MANAGER:
    "3f61974e218eb8f868fc4fb2c8d89995e2987c3b663325c23f154d8c553e2bf7",
  TRAINEE: "7017343a8320a2cb524ea3d9ee7548bb3869dc61fdfe480c16f5b5b261682a78",
});

const CURRENT_RELEASE_ENTITY_SET_NAMES = Object.freeze([
  "assessmentIds",
  "assessmentResultIds",
  "chatChannelIds",
  "chatMessageIds",
  "checklistRunIds",
  "checklistTemplateIds",
  "disciplinePolicyIds",
  "disciplineRecordIds",
  "disciplineRuleIds",
  "knowledgeArticleIds",
  "notificationIds",
  "onboardingPlanIds",
  "salaryPeriodIds",
  "salarySchemeIds",
  "shiftRegulationIds",
  "staffMemberIds",
  "staffTaskIds",
  "taskRuleIds",
  "taskRuleRunIds",
  "taskTemplateIds",
  "trainingCourseIds",
]);

const SAFE_INHERITED_ENVIRONMENT_KEYS = Object.freeze([
  "COMSPEC",
  "HOME",
  "LANG",
  "LC_ALL",
  "PATH",
  "Path",
  "PATHEXT",
  "SYSTEMROOT",
  "SystemRoot",
  "TEMP",
  "TMP",
  "TMPDIR",
  "TZ",
  "USERPROFILE",
  "WINDIR",
]);

export const CURRENT_RELEASE_CRITICAL_READS = Object.freeze([
  Object.freeze({
    module: "assortment",
    name: "product-catalog",
    target: "WEB",
    path: "/api/products/catalog?page=1&pageSize=1",
  }),
  Object.freeze({
    module: "assortment",
    name: "stores-network-scope",
    target: "API",
    path: "/stores",
  }),
  Object.freeze({
    module: "gamification",
    name: "workspace",
    target: "WEB",
    path: "/api/guests/gamification/workspace",
  }),
  Object.freeze({
    module: "gamification",
    name: "missions",
    target: "WEB",
    path: "/api/guests/gamification/missions",
  }),
  Object.freeze({
    module: "gamification",
    name: "loot-boxes",
    target: "WEB",
    path: "/api/guests/gamification/loot-boxes",
  }),
  Object.freeze({
    module: "gamification",
    name: "seasons",
    target: "WEB",
    path: "/api/guests/gamification/seasons",
  }),
  Object.freeze({
    module: "gamification",
    name: "rewards",
    target: "WEB",
    path: "/api/guests/gamification/rewards",
  }),
  Object.freeze({
    module: "staff-control",
    name: "directory",
    target: "WEB",
    path: "/api/staff/directory?status=all",
  }),
  Object.freeze({
    module: "staff-control",
    name: "tasks",
    target: "WEB",
    path: "/api/staff/tasks?pageSize=500",
  }),
  Object.freeze({
    module: "staff-control",
    name: "checklists",
    target: "WEB",
    path: "/api/staff/checklists",
  }),
  Object.freeze({
    module: "staff-control",
    name: "checklist-templates",
    target: "WEB",
    path: "/api/staff/checklist-templates?status=all",
  }),
  Object.freeze({
    module: "staff-control",
    name: "task-templates",
    target: "WEB",
    path: "/api/staff/task-templates",
  }),
  Object.freeze({
    module: "staff-control",
    name: "task-rules",
    target: "WEB",
    path: "/api/staff/task-rules",
  }),
  Object.freeze({
    module: "staff-motivation",
    name: "discipline",
    target: "WEB",
    path: "/api/staff/discipline",
  }),
  Object.freeze({
    module: "staff-motivation",
    name: "salary",
    target: "WEB",
    path: "/api/staff/salary",
  }),
  Object.freeze({
    module: "staff-regulations",
    name: "shift-regulations",
    target: "WEB",
    path: "/api/staff/shift-regulations",
  }),
  Object.freeze({
    module: "staff-knowledge",
    name: "knowledge-base",
    target: "WEB",
    path: "/api/staff/knowledge-base",
  }),
  Object.freeze({
    module: "staff-knowledge",
    name: "training-courses",
    target: "WEB",
    path: "/api/staff/training-courses",
  }),
  Object.freeze({
    module: "staff-knowledge",
    name: "training-profiles",
    target: "WEB",
    path: "/api/staff/training-profiles",
  }),
  Object.freeze({
    module: "staff-knowledge",
    name: "assessments",
    target: "WEB",
    path: "/api/staff/assessments",
  }),
  Object.freeze({
    module: "staff-onboarding",
    name: "onboarding",
    target: "WEB",
    path: "/api/staff/onboarding",
  }),
  Object.freeze({
    module: "communications",
    name: "notifications",
    target: "WEB",
    path: "/api/staff/notifications",
  }),
  Object.freeze({
    module: "communications",
    name: "team-chat",
    target: "WEB",
    path: "/api/staff/team-chat",
  }),
  Object.freeze({
    module: "users-roles",
    name: "network-users-and-roles",
    target: "WEB",
    path: "/api/users",
    validator: "USERS_NETWORK_PROJECTION",
  }),
]);

const CURRENT_RELEASE_RESPONSE_SCHEMAS = Object.freeze({
  "assortment/product-catalog": Object.freeze({
    kind: "PAGED_PRODUCTS",
    requiredArrays: Object.freeze(["items"]),
    requiredNumbers: Object.freeze(["page", "pageSize", "total", "totalPages"]),
  }),
  "assortment/stores-network-scope": Object.freeze({ kind: "EXACT_STORES" }),
  "gamification/workspace": Object.freeze({
    boundArrays: Object.freeze([
      Object.freeze({ key: "profiles", oracle: "profileIds", exact: true }),
      Object.freeze({ key: "lootBoxes", oracle: "lootBoxIds", exact: true }),
      Object.freeze({ key: "missions", oracle: "missionIds", exact: true }),
      Object.freeze({ key: "seasons", oracle: "seasonIds", exact: true }),
      Object.freeze({
        key: "promoCards",
        oracle: "promoCardIds",
        exact: true,
      }),
      Object.freeze({ key: "rewards", oracle: "rewardIds", exact: true }),
      Object.freeze({ key: "events", oracle: "eventIds", exact: true }),
    ]),
    kind: "GAMIFICATION_WORKSPACE",
    requiredArrays: Object.freeze([
      "profiles",
      "lootBoxes",
      "missions",
      "seasons",
      "promoCards",
      "rewards",
      "events",
      "tariffSnapshots",
    ]),
    requiredObjects: Object.freeze([
      "summary",
      "economy",
      "effect",
      "integrationReadiness",
      "pilotReadiness",
      "bonusLedgerAudit",
      "bonusBalanceCurrentReconciliation",
      "communicationQueue",
      "deliveryOutbox",
      "guestLogCatalog",
    ]),
  }),
  "gamification/missions": Object.freeze({
    entitySet: "missionIds",
    kind: "EXACT_ENTITY_ARRAY",
  }),
  "gamification/loot-boxes": Object.freeze({
    entitySet: "lootBoxIds",
    kind: "EXACT_ENTITY_ARRAY",
  }),
  "gamification/seasons": Object.freeze({
    entitySet: "seasonIds",
    kind: "EXACT_ENTITY_ARRAY",
  }),
  "gamification/rewards": Object.freeze({
    entitySet: "rewardIds",
    kind: "EXACT_ENTITY_ARRAY",
  }),
  "staff-control/directory": Object.freeze({
    boundArrays: Object.freeze([
      Object.freeze({ key: "rows", oracle: "staffMemberIds" }),
      Object.freeze({ key: "stores", oracle: "storeIds", exact: true }),
      Object.freeze({ key: "users", oracle: "userIds", exact: true }),
    ]),
    kind: "REPORT",
    requiredArrays: Object.freeze([
      "rows",
      "stores",
      "users",
      "legacyMappings",
      "langameUsers",
    ]),
    requiredObjects: Object.freeze(["filters", "summary"]),
  }),
  "staff-control/tasks": Object.freeze({
    boundArrays: Object.freeze([
      Object.freeze({ key: "rows", oracle: "staffTaskIds" }),
      Object.freeze({ key: "stores", oracle: "storeIds", exact: true }),
      Object.freeze({ key: "users", oracle: "activeUserIds", exact: true }),
    ]),
    kind: "REPORT",
    requiredArrays: Object.freeze(["quickViews", "rows", "users", "stores"]),
    requiredObjects: Object.freeze(["filters", "summary", "groups"]),
  }),
  "staff-control/checklists": Object.freeze({
    boundArrays: Object.freeze([
      Object.freeze({ key: "rows", oracle: "checklistRunIds" }),
      Object.freeze({ key: "stores", oracle: "storeIds", exact: true }),
      Object.freeze({ key: "users", oracle: "activeUserIds", exact: true }),
    ]),
    kind: "REPORT",
    requiredArrays: Object.freeze([
      "rows",
      "publishedRegulations",
      "checklistTemplates",
      "stores",
      "users",
    ]),
    requiredObjects: Object.freeze(["filters", "summary"]),
  }),
  "staff-control/checklist-templates": Object.freeze({
    boundArrays: Object.freeze([
      Object.freeze({ key: "rows", oracle: "checklistTemplateIds" }),
      Object.freeze({ key: "stores", oracle: "storeIds", exact: true }),
    ]),
    kind: "REPORT",
    requiredArrays: Object.freeze(["rows", "stores", "publishedRegulations"]),
    requiredObjects: Object.freeze(["filters", "summary"]),
  }),
  "staff-control/task-templates": Object.freeze({
    boundArrays: Object.freeze([
      Object.freeze({ key: "rows", oracle: "taskTemplateIds" }),
      Object.freeze({ key: "stores", oracle: "storeIds", exact: true }),
      Object.freeze({ key: "users", oracle: "activeUserIds", exact: true }),
    ]),
    kind: "REPORT",
    requiredArrays: Object.freeze(["rows", "stores", "users"]),
    requiredObjects: Object.freeze(["filters", "summary"]),
  }),
  "staff-control/task-rules": Object.freeze({
    boundArrays: Object.freeze([
      Object.freeze({ key: "rows", oracle: "taskRuleIds" }),
      Object.freeze({ key: "runs", oracle: "taskRuleRunIds" }),
      Object.freeze({ key: "stores", oracle: "storeIds", exact: true }),
      Object.freeze({
        key: "templates",
        oracle: "taskTemplateIds",
        exact: true,
      }),
      Object.freeze({ key: "users", oracle: "activeUserIds", exact: true }),
    ]),
    kind: "REPORT",
    requiredArrays: Object.freeze([
      "rows",
      "runs",
      "stores",
      "users",
      "templates",
    ]),
    requiredObjects: Object.freeze(["filters", "summary"]),
  }),
  "staff-motivation/discipline": Object.freeze({
    boundArrays: Object.freeze([
      Object.freeze({
        key: "records",
        oracle: "disciplineRecordIds",
        exact: true,
      }),
      Object.freeze({ key: "rules", oracle: "disciplineRuleIds", exact: true }),
      Object.freeze({ key: "stores", oracle: "storeIds", exact: true }),
      Object.freeze({ key: "users", oracle: "disciplineUserIds", exact: true }),
    ]),
    kind: "REPORT",
    requiredArrays: Object.freeze([
      "policies",
      "rules",
      "records",
      "stores",
      "users",
    ]),
    requiredObjects: Object.freeze(["access", "filters", "summary"]),
  }),
  "staff-motivation/salary": Object.freeze({
    boundArrays: Object.freeze([
      Object.freeze({ key: "periods", oracle: "salaryPeriodIds" }),
      Object.freeze({ key: "schemes", oracle: "salarySchemeIds", exact: true }),
      Object.freeze({ key: "stores", oracle: "storeIds", exact: true }),
      Object.freeze({
        key: "products",
        oracle: "productIds",
        allowEmpty: true,
      }),
      Object.freeze({ key: "users", oracle: "userIds" }),
    ]),
    kind: "REPORT",
    requiredArrays: Object.freeze([
      "schemes",
      "rows",
      "periods",
      "stores",
      "products",
      "users",
    ]),
    requiredObjects: Object.freeze(["filters", "summary"]),
  }),
  "staff-regulations/shift-regulations": Object.freeze({
    boundArrays: Object.freeze([
      Object.freeze({ key: "rows", oracle: "shiftRegulationIds" }),
      Object.freeze({ key: "stores", oracle: "storeIds", exact: true }),
      Object.freeze({
        key: "assessments",
        oracle: "assessmentIds",
        allowEmpty: true,
      }),
    ]),
    kind: "REPORT",
    requiredArrays: Object.freeze(["rows", "stores", "assessments"]),
    requiredObjects: Object.freeze(["filters", "summary"]),
  }),
  "staff-knowledge/knowledge-base": Object.freeze({
    boundArrays: Object.freeze([
      Object.freeze({ key: "rows", oracle: "knowledgeArticleIds" }),
      Object.freeze({ key: "stores", oracle: "storeIds", exact: true }),
    ]),
    kind: "REPORT",
    requiredArrays: Object.freeze([
      "folders",
      "categories",
      "rows",
      "articleSuggestions",
      "stores",
    ]),
    requiredObjects: Object.freeze(["filters", "summary", "settings"]),
  }),
  "staff-knowledge/training-courses": Object.freeze({
    boundArrays: Object.freeze([
      Object.freeze({ key: "rows", oracle: "trainingCourseIds" }),
      Object.freeze({ key: "stores", oracle: "storeIds", exact: true }),
      Object.freeze({
        key: "knowledgeArticles",
        oracle: "knowledgeArticleIds",
        allowEmpty: true,
      }),
    ]),
    kind: "REPORT",
    requiredArrays: Object.freeze(["rows", "stores", "knowledgeArticles"]),
    requiredObjects: Object.freeze(["filters", "summary"]),
  }),
  "staff-knowledge/training-profiles": Object.freeze({
    boundArrays: Object.freeze([
      Object.freeze({ key: "stores", oracle: "storeIds", exact: true }),
      Object.freeze({ key: "users", oracle: "userIds" }),
    ]),
    kind: "REPORT",
    requiredArrays: Object.freeze(["rows", "users", "stores"]),
    requiredObjects: Object.freeze(["filters", "summary"]),
  }),
  "staff-knowledge/assessments": Object.freeze({
    boundArrays: Object.freeze([
      Object.freeze({ key: "rows", oracle: "assessmentIds" }),
      Object.freeze({
        key: "results",
        oracle: "assessmentResultIds",
        allowEmpty: true,
      }),
      Object.freeze({ key: "stores", oracle: "storeIds", exact: true }),
      Object.freeze({ key: "users", oracle: "userIds" }),
    ]),
    kind: "REPORT",
    requiredArrays: Object.freeze(["rows", "results", "stores", "users"]),
    requiredObjects: Object.freeze(["filters", "summary"]),
  }),
  "staff-onboarding/onboarding": Object.freeze({
    boundArrays: Object.freeze([
      Object.freeze({ key: "rows", oracle: "onboardingPlanIds" }),
      Object.freeze({ key: "stores", oracle: "storeIds", exact: true }),
      Object.freeze({ key: "courses", oracle: "trainingCourseIds" }),
      Object.freeze({ key: "taskTemplates", oracle: "taskTemplateIds" }),
      Object.freeze({
        key: "checklistTemplates",
        oracle: "checklistTemplateIds",
      }),
      Object.freeze({ key: "regulations", oracle: "shiftRegulationIds" }),
    ]),
    kind: "REPORT",
    requiredArrays: Object.freeze([
      "rows",
      "stores",
      "courses",
      "taskTemplates",
      "checklistTemplates",
      "regulations",
    ]),
    requiredObjects: Object.freeze(["filters", "summary"]),
  }),
  "communications/notifications": Object.freeze({
    boundArrays: Object.freeze([
      Object.freeze({ key: "rows", oracle: "notificationIds" }),
      Object.freeze({ key: "stores", oracle: "storeIds", exact: true }),
    ]),
    kind: "REPORT",
    requiredArrays: Object.freeze([
      "rows",
      "stores",
      "sourceTypes",
      "severities",
      "statuses",
    ]),
    requiredObjects: Object.freeze(["filters", "summary"]),
  }),
  "communications/team-chat": Object.freeze({
    boundArrays: Object.freeze([
      Object.freeze({ key: "channels", oracle: "chatChannelIds" }),
      Object.freeze({
        key: "messages",
        oracle: "chatMessageIds",
        allowEmpty: true,
      }),
      Object.freeze({ key: "stores", oracle: "storeIds", exact: true }),
      Object.freeze({ key: "users", oracle: "activeUserIds", exact: true }),
    ]),
    kind: "REPORT",
    requiredArrays: Object.freeze([
      "channels",
      "messages",
      "stores",
      "users",
      "roleScopes",
    ]),
    requiredObjects: Object.freeze(["filters", "summary"]),
  }),
  "users-roles/network-users-and-roles": Object.freeze({ kind: "EXACT_USERS" }),
});

const CURRENT_RELEASE_INTEGRATION_READINESS_KEYS = Object.freeze([
  "BONUS_LEDGER_SCHEDULER",
  "INCOMING_CALL_LAST4_AUTH",
  "LANGAME_WRITE_API",
  "MAX_DELIVERY",
  "OTP",
  "OTP_MAX",
  "OTP_SMS",
  "OTP_TELEGRAM",
  "PUBLIC_PORTAL",
  "TELEGRAM_AUTH_REPLY_SENDER",
  "TELEGRAM_BOT_MENU",
  "TELEGRAM_DELIVERY",
  "TELEGRAM_LINK",
  "TELEGRAM_MINI_APP",
  "TELEGRAM_WEBHOOK",
  "USER_CALL_AUTH",
]);
const CURRENT_RELEASE_PILOT_READINESS_KEYS = Object.freeze([
  "ACTIVE_RULES",
  "BALANCE_RECONCILIATION",
  "BONUS_LEDGER",
  "CLUB",
  "GAME_PROFILE",
  "GEOSEARCH",
  "GUEST_LOGS",
  "LANGAME_MATCH",
  "OTP",
  "PUBLIC_GAME_QA",
  "PUBLIC_REGISTRATION",
  "REWARD_QUEUE",
  "TEST_EVENT",
]);
const CURRENT_RELEASE_READINESS_STATUSES = Object.freeze([
  "BLOCKED",
  "MANUAL_ONLY",
  "PARTIAL",
  "READY",
]);

export const CURRENT_RELEASE_EFFECT_POLICY = Object.freeze({
  ACCESS_SCOPE_ENFORCEMENT_MODE: "ENFORCED",
  DESIGN_PARTNER_ISOLATED_MODE: "false",
  FOUNDER_OPERATOR_BETA_MODE: "DISABLED",
  GUEST_ACTIVITY_LEDGER_SCHEDULER_ENABLED: "false",
  GUEST_GAME_BONUS_LEDGER_SCHEDULER_DRY_RUN: "true",
  GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED: "false",
  GUEST_GAME_BOT_CONSUMER_DRY_RUN: "true",
  GUEST_GAME_BOT_CONSUMER_ENABLED: "false",
  GUEST_GAME_DELIVERY_REAL_SEND_ENABLED: "false",
  GUEST_GAME_DELIVERY_TELEGRAM_ENABLED: "false",
  GUEST_GAME_LEDGER_FALLBACK_KILL_SWITCH: "true",
  GUEST_GAME_LEDGER_FALLBACK_MODE: "OFF",
  GUEST_GAME_LOOT_BOX_RECOVERY_KILL_SWITCH: "true",
  GUEST_GAME_LOOT_BOX_RECOVERY_MODE: "OFF",
  GUEST_GAME_MAX_DELIVERY_ENABLED: "false",
  GUEST_GAME_MAX_DELIVERY_LIVE_CANARY_ENABLED: "false",
  GUEST_GAME_MONITORING_ENABLED: "false",
  GUEST_GAME_PIPELINE_BACKFILL_KILL_SWITCH: "true",
  GUEST_GAME_PIPELINE_BACKFILL_MODE: "OFF",
  GUEST_GAME_PIPELINE_SCHEDULER_ENABLED: "false",
  GUEST_GAME_RETENTION_LIVE_ENABLED: "false",
  GUEST_GAME_RETENTION_SCHEDULER_ENABLED: "false",
  GUEST_GAME_REWARD_MATERIALIZER_ENABLED: "false",
  GUEST_GAME_REWARD_MATERIALIZER_KILL_SWITCH: "false",
  GUEST_GAME_SCHEDULED_HTTP_ENABLED: "false",
  GUEST_GAME_STAFF_TEST_REWARD_ACCRUAL_ENABLED: "false",
  GUEST_GAME_SUPPLEMENTAL_PIPELINE_KILL_SWITCH: "true",
  GUEST_GAME_SUPPLEMENTAL_PIPELINE_MODE: "OFF",
  GUEST_GAME_TELEGRAM_DELIVERY_ENABLED: "false",
  GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_ENABLED: "false",
  GUEST_GAME_TG_EDGE_ADAPTER_ENABLED: "false",
  GUEST_GAME_TG_EDGE_DRY_RUN: "true",
  GUEST_GAME_TG_EDGE_POLLER_ENABLED: "false",
  GUEST_GAME_TG_EDGE_POLLING_DELETE_WEBHOOK_ON_START: "false",
  GUEST_PORTAL_DEV_OTP_ENABLED: "false",
  GUEST_PORTAL_INCOMING_CALL_LAST4_ENABLED: "false",
  GUEST_PORTAL_OTP_MAX_ENABLED: "false",
  GUEST_PORTAL_OTP_REAL_SEND_ENABLED: "false",
  GUEST_PORTAL_OTP_SMS_ENABLED: "false",
  GUEST_PORTAL_OTP_SMS_RU_LIVE_CANARY_ENABLED: "false",
  GUEST_PORTAL_OTP_SMS_RU_TEST_MODE: "true",
  GUEST_PORTAL_OTP_TELEGRAM_ENABLED: "false",
  GUEST_PORTAL_USER_CALL_ENABLED: "false",
  IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_ENABLED: "false",
  IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_REAL_PROVIDER_ENABLED:
    "false",
  IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_REHEARSAL_ENABLED: "false",
  IDENTITY_MAIL_WORKER_ENABLED: "false",
  IDENTITY_MAIL_WORKER_LIVE_CANARY_ENABLED: "false",
  IDENTITY_MAIL_WORKER_REAL_SEND_ENABLED: "false",
  LANGAME_BONUS_ACCRUAL_ENABLED: "false",
  LANGAME_DAILY_SYNC_SCHEDULER_ENABLED: "false",
  LANGAME_INITIAL_SYNC_EXECUTION_CURRENT192_ENABLED: "false",
  LANGAME_INITIAL_SYNC_PREFLIGHT_CURRENT188_ENABLED: "false",
  LANGAME_SCHEDULED_HTTP_ENABLED: "false",
  LANGAME_STAGED_ONBOARDING_ACTIVATION_CURRENT188_ENABLED: "false",
  LANGAME_STAGED_ONBOARDING_FOUNDATION_ENABLED: "false",
  LANGAME_STAGED_ONBOARDING_RECONCILE_CURRENT188_ENABLED: "false",
  LANGAME_STAGED_ONBOARDING_STATUS_CURRENT188_ENABLED: "false",
  REPORT_DIGEST_SCHEDULED_HTTP_ENABLED: "false",
  REPORT_DIGEST_SCHEDULER_ENABLED: "false",
  STAFF_ATTACHMENT_ACL_MODE: "ENFORCED",
  STAFF_TASK_RULES_SCHEDULED_HTTP_ENABLED: "false",
  STAFF_TASK_RULES_SCHEDULER_ENABLED: "false",
  TENANT_ACTIVATION_OUTBOUND_ENABLED: "false",
});

export class CurrentReleaseRuntimeAcceptanceError extends Error {
  constructor(reasonCode, safeMetadata = undefined) {
    super(reasonCode);
    this.name = "CurrentReleaseRuntimeAcceptanceError";
    this.reasonCode = reasonCode;
    this.safeContractError = true;
    if (safeMetadata !== undefined) {
      this.safeMetadata = Object.freeze({ ...safeMetadata });
    }
  }
}

function fail(reasonCode, safeMetadata = undefined) {
  throw new CurrentReleaseRuntimeAcceptanceError(reasonCode, safeMetadata);
}

function exactString(value, pattern, reasonCode) {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    !pattern.test(value)
  ) {
    fail(reasonCode);
  }
  return value;
}

function exactInteger(value, minimum, maximum, reasonCode) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(reasonCode);
  }
  return value;
}

export function normalizeCurrentReleaseStartupTimeoutMs(
  value = CURRENT_RELEASE_STARTUP_TIMEOUT_DEFAULT_MS,
) {
  return exactInteger(
    value,
    CURRENT_RELEASE_STARTUP_TIMEOUT_MIN_MS,
    CURRENT_RELEASE_STARTUP_TIMEOUT_MAX_MS,
    "CURRENT_RELEASE_STARTUP_TIMEOUT_INVALID",
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function safeReason(error) {
  return error?.safeContractError === true
    ? error.reasonCode
    : "CURRENT_RELEASE_RUNTIME_UNEXPECTED_FAILURE";
}

function inheritSafeEnvironment(hostEnvironment = process.env) {
  const environment = {};
  for (const key of SAFE_INHERITED_ENVIRONMENT_KEYS) {
    if (typeof hostEnvironment[key] === "string") {
      environment[key] = hostEnvironment[key];
    }
  }
  return environment;
}

function randomSecret(bytes = 48) {
  return randomBytes(bytes).toString("base64url");
}

export function assertCurrentReleaseDatabaseUrl(databaseUrl) {
  if (
    typeof databaseUrl !== "string" ||
    databaseUrl.length < 20 ||
    databaseUrl.length > 4096 ||
    databaseUrl.trim() !== databaseUrl ||
    /[\r\n\0]/u.test(databaseUrl)
  ) {
    fail("CURRENT_RELEASE_DATABASE_URL_INVALID");
  }
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    fail("CURRENT_RELEASE_DATABASE_URL_INVALID");
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    fail("CURRENT_RELEASE_DATABASE_PROTOCOL_INVALID");
  }
  if (parsed.hostname !== LOOPBACK) {
    fail("CURRENT_RELEASE_DATABASE_HOST_NOT_LOOPBACK");
  }
  const port = Number(parsed.port);
  exactInteger(port, 1024, 65535, "CURRENT_RELEASE_DATABASE_PORT_INVALID");
  if (port === 5432) fail("CURRENT_RELEASE_DATABASE_PORT_NOT_ISOLATED");
  let roleName;
  let password;
  try {
    roleName = decodeURIComponent(parsed.username);
    password = decodeURIComponent(parsed.password);
  } catch {
    fail("CURRENT_RELEASE_DATABASE_CREDENTIALS_REQUIRED");
  }
  if (!SAFE_ROLE.test(roleName) || password.length < 16) {
    fail("CURRENT_RELEASE_DATABASE_CREDENTIALS_REQUIRED");
  }
  let databaseName;
  try {
    databaseName = decodeURIComponent(parsed.pathname.slice(1));
  } catch {
    fail("CURRENT_RELEASE_DATABASE_NAME_INVALID");
  }
  exactString(
    databaseName,
    SAFE_DATABASE,
    "CURRENT_RELEASE_DATABASE_NAME_NOT_ALLOWLISTED",
  );
  if (parsed.hash || parsed.pathname.slice(1).includes("/")) {
    fail("CURRENT_RELEASE_DATABASE_URL_INVALID");
  }
  for (const [key, value] of parsed.searchParams) {
    const accepted =
      (key === "schema" && value === "public") ||
      (key === "sslmode" && value === "disable");
    if (!accepted) fail("CURRENT_RELEASE_DATABASE_OPTION_NOT_ALLOWLISTED");
  }
  return Object.freeze({ databaseName, host: LOOPBACK, port, roleName });
}

export function normalizeCurrentReleaseTarget(value) {
  return Object.freeze({
    expectedMigrationCount: exactInteger(
      value?.expectedMigrationCount,
      1,
      10_000,
      "CURRENT_RELEASE_MIGRATION_COUNT_INVALID",
    ),
    expectedMigrationHead: exactString(
      value?.expectedMigrationHead,
      SAFE_MIGRATION,
      "CURRENT_RELEASE_MIGRATION_HEAD_INVALID",
    ),
    expectedSystemIdentifier: exactString(
      value?.expectedSystemIdentifier,
      SYSTEM_IDENTIFIER,
      "CURRENT_RELEASE_SYSTEM_IDENTIFIER_INVALID",
    ),
    releaseSha: exactString(
      value?.releaseSha,
      SHA40,
      "CURRENT_RELEASE_SHA_INVALID",
    ),
    tenantSlug: exactString(
      value?.tenantSlug,
      SAFE_TENANT_SLUG,
      "CURRENT_RELEASE_TENANT_SLUG_INVALID",
    ),
  });
}

export function assertCurrentReleasePorts({ apiPort, databasePort, webPort }) {
  exactInteger(apiPort, 1024, 65535, "CURRENT_RELEASE_API_PORT_INVALID");
  exactInteger(webPort, 1024, 65535, "CURRENT_RELEASE_WEB_PORT_INVALID");
  const reserved = new Set([3000, 3001, 4000, 5432, databasePort]);
  if (apiPort === webPort || reserved.has(apiPort) || reserved.has(webPort)) {
    fail("CURRENT_RELEASE_PORT_NOT_ISOLATED");
  }
  return Object.freeze({ apiPort, webPort });
}

function safeManifestRelativePath(value) {
  if (
    typeof value !== "string" ||
    !value.startsWith("./") ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.split("/").some((segment) => segment === "..") ||
    value === "./"
  ) {
    fail("CURRENT_RELEASE_ARTIFACT_MANIFEST_PATH_INVALID");
  }
  return value.slice(2);
}

const compareUtf8Bytes = (left, right) =>
  Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));

function assertCanonicalArtifactComponents(relativePath) {
  const components = relativePath.split("/");
  if (
    components.length === 0 ||
    components.some(
      (component) =>
        component.length === 0 ||
        component === "." ||
        component === ".." ||
        component !== component.normalize("NFC") ||
        /[\\\u0000-\u001f\u007f]/u.test(component),
    )
  ) {
    fail("CURRENT_RELEASE_ARTIFACT_PATH_NOT_CANONICAL");
  }
}

async function parseArtifactManifest(root, manifestName) {
  const manifestPath = path.join(root, manifestName);
  await assertRegularFile(
    manifestPath,
    "CURRENT_RELEASE_ARTIFACT_MANIFEST_MISSING",
  );
  const raw = await readFile(manifestPath, "utf8");
  if (
    Buffer.byteLength(raw, "utf8") > MAX_MANIFEST_BYTES ||
    !raw.endsWith("\n") ||
    raw.includes("\r") ||
    raw.slice(0, -1).includes("\n\n")
  ) {
    fail("CURRENT_RELEASE_ARTIFACT_MANIFEST_INVALID");
  }
  const records = [];
  const seen = new Set();
  for (const line of raw.slice(0, -1).split("\n")) {
    const match = /^([0-9a-f]{64})  (\.\/.+)$/u.exec(line);
    if (!match) fail("CURRENT_RELEASE_ARTIFACT_MANIFEST_INVALID");
    const relativePath = safeManifestRelativePath(match[2]);
    assertCanonicalArtifactComponents(relativePath);
    if (seen.has(relativePath)) {
      fail("CURRENT_RELEASE_ARTIFACT_MANIFEST_DUPLICATE");
    }
    seen.add(relativePath);
    records.push(Object.freeze({ digest: match[1], relativePath }));
  }
  const sorted = [...records].sort((left, right) =>
    compareUtf8Bytes(left.relativePath, right.relativePath),
  );
  if (
    records.length === 0 ||
    records.some(
      (record, index) => record.relativePath !== sorted[index].relativePath,
    )
  ) {
    fail("CURRENT_RELEASE_ARTIFACT_MANIFEST_NOT_SORTED");
  }
  return Object.freeze({ digest: sha256(raw), raw, records, seen });
}

function decodeMountInfoPath(value) {
  if (!value.startsWith("/") || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail("CURRENT_RELEASE_ARTIFACT_MOUNTINFO_INVALID");
  }
  const decoded = value.replace(/\\([0-7]{3})/gu, (match, octal) => {
    if (!["011", "012", "040", "134"].includes(octal)) {
      fail("CURRENT_RELEASE_ARTIFACT_MOUNTINFO_INVALID");
    }
    return String.fromCodePoint(Number.parseInt(octal, 8));
  });
  if (decoded.includes("\\") || path.posix.normalize(decoded) !== decoded) {
    fail("CURRENT_RELEASE_ARTIFACT_MOUNTINFO_INVALID");
  }
  return decoded;
}

export async function assertCurrentReleaseArtifactMountBoundary(
  root,
  mountInfoRaw = null,
) {
  if (mountInfoRaw === null && process.platform !== "linux") {
    return Object.freeze({ attested: false, nestedMountCount: null });
  }
  const raw = mountInfoRaw ?? (await readFile("/proc/self/mountinfo", "utf8"));
  if (
    typeof raw !== "string" ||
    Buffer.byteLength(raw, "utf8") > 8 * 1024 * 1024 ||
    raw.includes("\0") ||
    raw.includes("\r")
  ) {
    fail("CURRENT_RELEASE_ARTIFACT_MOUNTINFO_INVALID");
  }
  const canonicalRoot = path.posix.normalize(root.split(path.sep).join("/"));
  if (!canonicalRoot.startsWith("/") || canonicalRoot === "/") {
    fail("CURRENT_RELEASE_ARTIFACT_MOUNTINFO_INVALID");
  }
  let inspectedMountCount = 0;
  for (const line of raw.split("\n")) {
    if (!line) continue;
    const separator = line.indexOf(" - ");
    const fields = separator < 0 ? [] : line.slice(0, separator).split(" ");
    if (fields.length < 6) {
      fail("CURRENT_RELEASE_ARTIFACT_MOUNTINFO_INVALID");
    }
    const mountPoint = decodeMountInfoPath(fields[4]);
    inspectedMountCount += 1;
    if (
      mountPoint === canonicalRoot ||
      mountPoint.startsWith(`${canonicalRoot}/`)
    ) {
      fail("CURRENT_RELEASE_ARTIFACT_NESTED_MOUNT_REJECTED", {
        mountPointDigest: sha256(mountPoint),
      });
    }
  }
  if (inspectedMountCount < 1) {
    fail("CURRENT_RELEASE_ARTIFACT_MOUNTINFO_INVALID");
  }
  return Object.freeze({
    attested: true,
    inspectedMountCount,
    nestedMountCount: 0,
  });
}

async function inspectHydratedArtifactTree(root, expectedOwnerUid) {
  const rootMetadata = await lstat(root, { bigint: true });
  const rootDevice = rootMetadata.dev;
  const regularPaths = new Set();
  const symlinkTopology = [];
  const mutableCache = "apps/web/.next/cache";

  function assertImmutableMetadata(metadata, relativePath, expectedOwnerUid) {
    if (
      process.platform !== "win32" &&
      (metadata.uid !== BigInt(expectedOwnerUid) ||
        (!metadata.isSymbolicLink() && (metadata.mode & 0o7022n) !== 0n))
    ) {
      fail("CURRENT_RELEASE_ARTIFACT_ENTRY_NOT_IMMUTABLE", {
        pathDigest: sha256(relativePath || "."),
      });
    }
  }

  async function walk(directory, relativeDirectory = "") {
    const entries = (await readdir(directory, { withFileTypes: true })).sort(
      (left, right) => compareUtf8Bytes(left.name, right.name),
    );
    for (const entry of entries) {
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      assertCanonicalArtifactComponents(relativePath);
      const absolutePath = path.join(root, ...relativePath.split("/"));
      const metadata = await lstat(absolutePath, { bigint: true });
      if (metadata.dev !== rootDevice) {
        fail("CURRENT_RELEASE_ARTIFACT_FILESYSTEM_BOUNDARY_CROSSED");
      }
      assertImmutableMetadata(metadata, relativePath, expectedOwnerUid);
      if (metadata.isDirectory()) {
        if (relativePath === mutableCache) {
          if ((await readdir(absolutePath)).length !== 0) {
            fail("CURRENT_RELEASE_ARTIFACT_MUTABLE_CACHE_NOT_EMPTY");
          }
          continue;
        }
        await walk(absolutePath, relativePath);
        continue;
      }
      if (metadata.isFile()) {
        if (metadata.nlink !== 1n) {
          fail("CURRENT_RELEASE_ARTIFACT_HARDLINK_REJECTED");
        }
        if (relativePath !== "HYDRATED_SHA256SUMS") {
          regularPaths.add(relativePath);
        }
        continue;
      }
      if (metadata.isSymbolicLink()) {
        const rawTarget = await readlink(absolutePath, { encoding: "utf8" });
        if (
          rawTarget.length === 0 ||
          rawTarget.includes("\0") ||
          path.isAbsolute(rawTarget) ||
          rawTarget !== rawTarget.normalize("NFC") ||
          path.posix.normalize(rawTarget) !== rawTarget ||
          /[\\\u0001-\u001f\u007f]/u.test(rawTarget)
        ) {
          fail("CURRENT_RELEASE_ARTIFACT_SYMLINK_TARGET_INVALID");
        }
        const target = await realpath(absolutePath).catch(() => null);
        if (
          !target ||
          (target !== root && !target.startsWith(`${root}${path.sep}`))
        ) {
          fail("CURRENT_RELEASE_ARTIFACT_SYMLINK_ESCAPES_ROOT");
        }
        symlinkTopology.push(
          Object.freeze({
            path: relativePath,
            target: rawTarget.split(path.sep).join("/"),
          }),
        );
        continue;
      }
      fail("CURRENT_RELEASE_ARTIFACT_SPECIAL_ENTRY_REJECTED");
    }
  }

  await walk(root);
  return Object.freeze({
    regularPaths,
    symlinkTopology: Object.freeze(symlinkTopology),
  });
}

async function hashFile(filePath) {
  return sha256(await readFile(filePath));
}

async function assertRegularFile(filePath, reasonCode) {
  const metadata = await lstat(filePath).catch(() => null);
  if (!metadata?.isFile() || metadata.isSymbolicLink()) fail(reasonCode);
  return metadata;
}

export async function verifyCurrentReleaseArtifact({
  artifactRoot,
  expected,
  expectedOwnerUid = 0,
}) {
  if (!path.isAbsolute(artifactRoot)) {
    fail("CURRENT_RELEASE_ARTIFACT_ROOT_NOT_ABSOLUTE");
  }
  const rootMetadata = await lstat(artifactRoot, { bigint: true }).catch(
    () => null,
  );
  if (!rootMetadata?.isDirectory() || rootMetadata.isSymbolicLink()) {
    fail("CURRENT_RELEASE_ARTIFACT_ROOT_UNSAFE");
  }
  const root = await realpath(artifactRoot);
  const resolvedRootMetadata = await lstat(root, { bigint: true });
  if (
    (process.platform !== "win32" && path.resolve(artifactRoot) !== root) ||
    rootMetadata.dev !== resolvedRootMetadata.dev ||
    rootMetadata.ino !== resolvedRootMetadata.ino
  ) {
    fail("CURRENT_RELEASE_ARTIFACT_ROOT_TRAVERSES_SYMLINK");
  }
  if (
    !Number.isSafeInteger(expectedOwnerUid) ||
    expectedOwnerUid < 0 ||
    (process.platform !== "win32" &&
      (resolvedRootMetadata.uid !== BigInt(expectedOwnerUid) ||
        (resolvedRootMetadata.mode & 0o7022n) !== 0n))
  ) {
    fail("CURRENT_RELEASE_ARTIFACT_ROOT_NOT_IMMUTABLE");
  }
  const normalized = normalizeCurrentReleaseTarget(expected);
  const provenancePath = path.join(root, "release-provenance.json");
  const manifestPath = path.join(root, "SHA256SUMS");
  const hydratedManifestPath = path.join(root, "HYDRATED_SHA256SUMS");
  const hydratedSymlinksPath = path.join(root, "HYDRATED_SYMLINKS.json");
  const hydrationReceiptPath = path.join(root, "HYDRATION_SANDBOX_RECEIPT");
  const buildIdPath = path.join(root, "apps", "web", ".next", "BUILD_ID");
  const apiEntry = path.join(root, "apps", "api", "dist", "main.js");
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
  await Promise.all([
    assertRegularFile(
      provenancePath,
      "CURRENT_RELEASE_ARTIFACT_PROVENANCE_MISSING",
    ),
    assertRegularFile(
      manifestPath,
      "CURRENT_RELEASE_ARTIFACT_MANIFEST_MISSING",
    ),
    assertRegularFile(
      hydratedManifestPath,
      "CURRENT_RELEASE_ARTIFACT_HYDRATED_MANIFEST_MISSING",
    ),
    assertRegularFile(
      hydratedSymlinksPath,
      "CURRENT_RELEASE_ARTIFACT_SYMLINK_MANIFEST_MISSING",
    ),
    assertRegularFile(
      hydrationReceiptPath,
      "CURRENT_RELEASE_ARTIFACT_HYDRATION_RECEIPT_MISSING",
    ),
    assertRegularFile(buildIdPath, "CURRENT_RELEASE_WEB_BUILD_ID_MISSING"),
    assertRegularFile(apiEntry, "CURRENT_RELEASE_API_ENTRY_MISSING"),
    assertRegularFile(nextEntry, "CURRENT_RELEASE_WEB_RUNTIME_NOT_HYDRATED"),
  ]);
  const [
    provenanceRaw,
    buildId,
    hydrationReceipt,
    hydratedSymlinksRaw,
    sourceManifest,
    hydratedManifest,
    tree,
  ] = await Promise.all([
    readFile(provenancePath, "utf8"),
    readFile(buildIdPath, "utf8"),
    readFile(hydrationReceiptPath, "utf8"),
    readFile(hydratedSymlinksPath, "utf8"),
    parseArtifactManifest(root, "SHA256SUMS"),
    parseArtifactManifest(root, "HYDRATED_SHA256SUMS"),
    inspectHydratedArtifactTree(root, expectedOwnerUid),
  ]);
  const mountBoundary = await assertCurrentReleaseArtifactMountBoundary(root);
  if (Buffer.byteLength(hydratedSymlinksRaw, "utf8") > MAX_MANIFEST_BYTES) {
    fail("CURRENT_RELEASE_ARTIFACT_SYMLINK_MANIFEST_INVALID");
  }
  let provenance;
  try {
    provenance = JSON.parse(provenanceRaw);
  } catch {
    fail("CURRENT_RELEASE_ARTIFACT_PROVENANCE_INVALID");
  }
  if (
    provenance?.releaseSha !== normalized.releaseSha ||
    provenance?.databaseMigration !== normalized.expectedMigrationHead ||
    provenance?.databaseMigrationCount !== normalized.expectedMigrationCount ||
    buildId.trim() !== normalized.releaseSha
  ) {
    fail("CURRENT_RELEASE_ARTIFACT_IDENTITY_MISMATCH");
  }
  const expectedHydrationReceipt = [
    "RECORD_VERSION=1",
    `RELEASE_SHA=${normalized.releaseSha}`,
    "SANDBOX=SYSTEMD_IP_DENY_ANY_V1",
  ];
  const hydrationLines = hydrationReceipt.split("\n");
  if (
    !hydrationReceipt.endsWith("\n") ||
    hydrationReceipt.includes("\r") ||
    hydrationLines.length !== 8 ||
    expectedHydrationReceipt.some(
      (line, index) => hydrationLines[index] !== line,
    ) ||
    !/^INVOCATION_ID=[0-9a-f]{32}$/u.test(hydrationLines[3]) ||
    !/^PNPM_STORE_LOCKFILE_SHA256=[0-9a-f]{64}$/u.test(hydrationLines[4]) ||
    !/^PNPM_STORE_MANIFEST_SHA256=[0-9a-f]{64}$/u.test(hydrationLines[5]) ||
    !/^PNPM_STORE_RECEIPT_SHA256=[0-9a-f]{64}$/u.test(hydrationLines[6]) ||
    hydrationLines[7] !== ""
  ) {
    fail("CURRENT_RELEASE_ARTIFACT_HYDRATION_RECEIPT_INVALID");
  }
  let hydratedSymlinks;
  try {
    hydratedSymlinks = JSON.parse(hydratedSymlinksRaw);
  } catch {
    fail("CURRENT_RELEASE_ARTIFACT_SYMLINK_MANIFEST_INVALID");
  }
  const canonicalSymlinkTopology = Object.freeze(
    [...tree.symlinkTopology].sort((left, right) =>
      compareUtf8Bytes(left.path, right.path),
    ),
  );
  const expectedSymlinkManifest = `${stableJson({
    links: canonicalSymlinkTopology,
    version: 1,
  })}\n`;
  if (
    hydratedSymlinksRaw !== expectedSymlinkManifest ||
    stableJson(hydratedSymlinks) !== expectedSymlinkManifest.trimEnd()
  ) {
    fail("CURRENT_RELEASE_ARTIFACT_SYMLINK_TOPOLOGY_MISMATCH");
  }

  for (const required of [
    "release-provenance.json",
    "apps/api/dist/main.js",
    "apps/web/.next/BUILD_ID",
    "apps/web/package.json",
    "packages/database/prisma/schema.prisma",
  ]) {
    if (!sourceManifest.seen.has(required)) {
      fail("CURRENT_RELEASE_ARTIFACT_MANIFEST_INCOMPLETE");
    }
  }
  if (
    sourceManifest.seen.has("SHA256SUMS") ||
    sourceManifest.seen.has("HYDRATED_SHA256SUMS") ||
    hydratedManifest.seen.has("HYDRATED_SHA256SUMS") ||
    sourceManifest.seen.has("HYDRATED_SYMLINKS.json") ||
    !hydratedManifest.seen.has("HYDRATED_SYMLINKS.json") ||
    hydratedManifest.records.length !== tree.regularPaths.size
  ) {
    fail("CURRENT_RELEASE_ARTIFACT_HYDRATED_COVERAGE_INVALID");
  }
  for (const record of sourceManifest.records) {
    if (!hydratedManifest.seen.has(record.relativePath)) {
      fail("CURRENT_RELEASE_ARTIFACT_SOURCE_NOT_IN_HYDRATED_MANIFEST");
    }
  }
  for (const relativePath of tree.regularPaths) {
    if (!hydratedManifest.seen.has(relativePath)) {
      fail("CURRENT_RELEASE_ARTIFACT_HYDRATED_MANIFEST_INCOMPLETE");
    }
  }
  for (const record of hydratedManifest.records) {
    if (!tree.regularPaths.has(record.relativePath)) {
      fail("CURRENT_RELEASE_ARTIFACT_HYDRATED_MANIFEST_HAS_EXTRA_PATH");
    }
  }
  for (let offset = 0; offset < hydratedManifest.records.length; offset += 32) {
    await Promise.all(
      hydratedManifest.records.slice(offset, offset + 32).map(async (entry) => {
        const absolute = path.join(root, ...entry.relativePath.split("/"));
        await assertRegularFile(
          absolute,
          "CURRENT_RELEASE_ARTIFACT_MANIFEST_FILE_UNSAFE",
        );
        if ((await hashFile(absolute)) !== entry.digest) {
          fail("CURRENT_RELEASE_ARTIFACT_FILE_DIGEST_MISMATCH");
        }
      }),
    );
  }
  const nextRealPath = await realpath(nextEntry);
  if (!nextRealPath.startsWith(`${root}${path.sep}`)) {
    fail("CURRENT_RELEASE_WEB_RUNTIME_ESCAPES_ARTIFACT");
  }
  const nextRelativePath = path
    .relative(root, nextRealPath)
    .split(path.sep)
    .join("/");
  if (!hydratedManifest.seen.has(nextRelativePath)) {
    fail("CURRENT_RELEASE_WEB_RUNTIME_NOT_COVERED");
  }
  const apiManifestEntry = hydratedManifest.records.find(
    (entry) => entry.relativePath === "apps/api/dist/main.js",
  );
  const nextManifestEntry = hydratedManifest.records.find(
    (entry) => entry.relativePath === nextRelativePath,
  );
  if (!apiManifestEntry || !nextManifestEntry) {
    fail("CURRENT_RELEASE_ARTIFACT_RUNTIME_ENTRY_NOT_COVERED");
  }
  const [apiMetadata, nextMetadata] = await Promise.all([
    lstat(apiEntry, { bigint: true }),
    lstat(nextRealPath, { bigint: true }),
  ]);
  const runtimeEntries = Object.freeze({
    api: Object.freeze({
      dev: apiMetadata.dev.toString(),
      digest: apiManifestEntry.digest,
      ino: apiMetadata.ino.toString(),
      path: apiEntry,
      size: apiMetadata.size.toString(),
    }),
    web: Object.freeze({
      dev: nextMetadata.dev.toString(),
      digest: nextManifestEntry.digest,
      ino: nextMetadata.ino.toString(),
      path: nextRealPath,
      size: nextMetadata.size.toString(),
    }),
  });
  return Object.freeze({
    apiEntry,
    artifactRoot: root,
    buildId: buildId.trim(),
    hydratedManifestDigest: hydratedManifest.digest,
    hydratedManifestEntryCount: hydratedManifest.records.length,
    hydrationReceiptDigest: sha256(hydrationReceipt),
    manifestDigest: sourceManifest.digest,
    manifestEntryCount: sourceManifest.records.length,
    mountBoundary,
    nextEntry,
    provenanceDigest: sha256(stableJson(provenance)),
    runtimeEntries,
    symlinkTopologyCount: canonicalSymlinkTopology.length,
    symlinkTopologyDigest: sha256(hydratedSymlinksRaw),
  });
}

async function assertRuntimeEntryStillExact(entry) {
  const metadata = await lstat(entry.path, { bigint: true }).catch(() => null);
  if (
    !metadata?.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.dev.toString() !== entry.dev ||
    metadata.ino.toString() !== entry.ino ||
    metadata.size.toString() !== entry.size ||
    (await hashFile(entry.path)) !== entry.digest
  ) {
    fail("CURRENT_RELEASE_ARTIFACT_RUNTIME_ENTRY_CHANGED");
  }
}

export function buildCurrentReleaseApiEnvironment({
  apiPort,
  buildTime,
  databaseUrl,
  expectedMigrationCount,
  expectedMigrationHead,
  hostEnvironment = process.env,
  releaseSha,
}) {
  assertCurrentReleaseDatabaseUrl(databaseUrl);
  const environment = inheritSafeEnvironment(hostEnvironment);
  const productionSecrets = {
    APP_ENCRYPTION_KEY: randomSecret(),
    GUEST_GAME_REFERRAL_SECRET: randomSecret(),
    GUEST_PORTAL_JWT_SECRET: randomSecret(),
    IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY: randomSecret(),
    IDENTITY_MAIL_ENCRYPTION_KEY: randomSecret(32),
    INTEGRATION_ENCRYPTION_KEY: randomSecret(),
    JWT_SECRET: randomSecret(),
    SYNC_SERVICE_TOKEN: randomSecret(),
  };
  Object.assign(environment, CURRENT_RELEASE_EFFECT_POLICY, productionSecrets, {
    API_BIND_HOST: LOOPBACK,
    API_URL: `http://${LOOPBACK}:${apiPort}`,
    APP_DOMAIN: "current-release-acceptance.invalid",
    BUILD_TIME: buildTime,
    DATABASE_URL: databaseUrl,
    DADATA_API_KEY: "",
    EXPECTED_DATABASE_MIGRATION: expectedMigrationHead,
    EXPECTED_DATABASE_MIGRATION_COUNT: String(expectedMigrationCount),
    GUEST_GAME_MAX_BOT_TOKEN: "",
    GUEST_GAME_MAX_DELIVERY_ENDPOINT: "",
    GUEST_GAME_TELEGRAM_BOT_TOKEN: "",
    GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_BOT_TOKEN: "",
    GUEST_GAME_TG_EDGE_BOT_TOKEN: "",
    GUEST_PORTAL_OTP_MAX_ENDPOINT: "",
    GUEST_PORTAL_OTP_MAX_TOKEN: "",
    GUEST_PORTAL_OTP_SMS_RU_API_ID: "",
    GUEST_PORTAL_TELEGRAM_BOT_TOKEN: "",
    GUEST_PORTAL_USER_CALL_SECRET: "",
    GUEST_PORTAL_USER_CALL_SMS_RU_API_ID: "",
    IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY_VERSION: "v1",
    IDENTITY_MAIL_AAD_ENVIRONMENT: "runtime-acceptance",
    IDENTITY_MAIL_ENCRYPTION_KEY_VERSION: "v1",
    LANGAME_API_KEY: "",
    LANGAME_DISCREPANCY_LOG_ROOT: "/leetplus/runtime-acceptance",
    LANGAME_DOMAINS: "invalid.local",
    MAIL_FROM: "runtime-acceptance@invalid.local",
    MAIL_HOST: LOOPBACK,
    MAIL_PASS: "",
    MAIL_PORT: "1",
    MAIL_SECURE: "false",
    MAIL_USER: "",
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_ENV: "production",
    NO_COLOR: "1",
    PORT: String(apiPort),
    RELEASE_SHA: releaseSha,
    WEB_URL: `http://${LOOPBACK}:${apiPort}`,
  });
  return Object.freeze({
    environment,
    sensitiveValues: Object.freeze(Object.values(productionSecrets)),
  });
}

export function buildCurrentReleaseWebEnvironment({
  apiPort,
  hostEnvironment = process.env,
  releaseSha,
}) {
  return Object.freeze({
    ...inheritSafeEnvironment(hostEnvironment),
    API_URL: `http://${LOOPBACK}:${apiPort}`,
    NEXT_PUBLIC_API_URL: `http://${LOOPBACK}:9`,
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_ENV: "production",
    NO_COLOR: "1",
    RELEASE_SHA: releaseSha,
    WEB_BUILD_ID: releaseSha,
  });
}

export function buildCurrentReleaseNetworkGuardSource({
  allowedConnectPort,
  allowedListenPort,
}) {
  exactInteger(
    allowedConnectPort,
    1024,
    65535,
    "CURRENT_RELEASE_GUARD_CONNECT_PORT_INVALID",
  );
  exactInteger(
    allowedListenPort,
    1024,
    65535,
    "CURRENT_RELEASE_GUARD_LISTEN_PORT_INVALID",
  );
  return `"use strict";
const dgram = require("node:dgram");
const dns = require("node:dns");
const net = require("node:net");
const loopback = "127.0.0.1";
const allowedConnectPort = ${allowedConnectPort};
const allowedListenPort = ${allowedListenPort};
function blocked(code) {
  process.stderr.write(code + "\\n");
  throw new Error(code);
}
const originalListen = net.Server.prototype.listen;
net.Server.prototype.listen = function guardedListen(...args) {
  if (typeof args[0] === "object" && args[0] !== null) {
    const options = { ...args[0] };
    if (Number(options.port) !== allowedListenPort) blocked("CURRENT_RELEASE_NETWORK_LISTEN_BLOCKED");
    options.host = loopback;
    args[0] = options;
  } else {
    if (Number(args[0]) !== allowedListenPort) blocked("CURRENT_RELEASE_NETWORK_LISTEN_BLOCKED");
    const callback = typeof args[1] === "function" ? args[1] : args[2];
    args = callback ? [allowedListenPort, loopback, callback] : [allowedListenPort, loopback];
  }
  return originalListen.apply(this, args);
};
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function guardedConnect(...args) {
  let port;
  let host;
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (typeof first === "object" && first !== null) {
    port = Number(first.port);
    host = first.host || first.hostname;
  } else {
    port = Number(first);
    host = typeof args[1] === "string" ? args[1] : undefined;
  }
  if (port !== allowedConnectPort) blocked("CURRENT_RELEASE_NETWORK_CONNECT_PORT_BLOCKED");
  // Node's port-only overload has no host and is documented to default to
  // localhost. The exact allowlisted port still prevents an external target.
  if (host !== undefined && host !== loopback) blocked("CURRENT_RELEASE_NETWORK_CONNECT_HOST_BLOCKED");
  return originalConnect.apply(this, args);
};
const originalLookup = dns.lookup;
dns.lookup = function guardedLookup(hostname, ...args) {
  if (hostname !== loopback) blocked("CURRENT_RELEASE_DNS_LOOKUP_BLOCKED");
  return originalLookup.call(this, hostname, ...args);
};
if (dns.promises && typeof dns.promises.lookup === "function") {
  const originalPromisesLookup = dns.promises.lookup.bind(dns.promises);
  dns.promises.lookup = function guardedPromisesLookup(hostname, ...args) {
    if (hostname !== loopback) blocked("CURRENT_RELEASE_DNS_LOOKUP_BLOCKED");
    return originalPromisesLookup(hostname, ...args);
  };
}
for (const method of ["resolve", "resolve4", "resolve6", "resolveAny", "resolveCaa", "resolveCname", "resolveMx", "resolveNaptr", "resolveNs", "resolvePtr", "resolveSoa", "resolveSrv", "resolveTxt", "reverse"]) {
  if (typeof dns[method] === "function") dns[method] = function blockedDnsResolve() { blocked("CURRENT_RELEASE_DNS_RESOLVE_BLOCKED"); };
  if (dns.promises && typeof dns.promises[method] === "function") dns.promises[method] = function blockedPromisesDnsResolve() { blocked("CURRENT_RELEASE_DNS_RESOLVE_BLOCKED"); };
}
for (const method of ["connect", "send"]) {
  if (typeof dgram.Socket.prototype[method] === "function") dgram.Socket.prototype[method] = function blockedDatagram() { blocked("CURRENT_RELEASE_DATAGRAM_BLOCKED"); };
}
`;
}

export function createAggregateLogCollector({ sensitiveValues = [] } = {}) {
  const digest = createHash("sha256");
  let bytes = 0;
  let outputLimitExceeded = false;
  let secretLeakDetected = false;
  let networkBlockDetected = false;
  const networkBlocks = {
    connectHost: 0,
    connectPort: 0,
    datagram: 0,
    dnsLookup: 0,
    dnsResolve: 0,
    listen: 0,
  };
  const tails = { stderr: "", stdout: "" };
  const forbidden = sensitiveValues.filter(
    (value) => typeof value === "string" && value.length >= 8,
  );
  return Object.freeze({
    append(stream, chunk) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > MAX_LOG_BYTES) outputLimitExceeded = true;
      digest.update(stream === "stderr" ? "E\0" : "O\0");
      digest.update(buffer);
      const key = stream === "stderr" ? "stderr" : "stdout";
      const text = `${tails[key]}${buffer.toString("utf8")}`;
      if (forbidden.some((secret) => text.includes(secret))) {
        secretLeakDetected = true;
      }
      if (/CURRENT_RELEASE_(?:NETWORK|DNS|DATAGRAM)_/u.test(text)) {
        networkBlockDetected = true;
      }
      for (const [marker, counter] of [
        ["CURRENT_RELEASE_NETWORK_CONNECT_HOST_BLOCKED", "connectHost"],
        ["CURRENT_RELEASE_NETWORK_CONNECT_PORT_BLOCKED", "connectPort"],
        ["CURRENT_RELEASE_NETWORK_LISTEN_BLOCKED", "listen"],
        ["CURRENT_RELEASE_DNS_LOOKUP_BLOCKED", "dnsLookup"],
        ["CURRENT_RELEASE_DNS_RESOLVE_BLOCKED", "dnsResolve"],
        ["CURRENT_RELEASE_DATAGRAM_BLOCKED", "datagram"],
      ]) {
        if (text.includes(marker)) networkBlocks[counter] = 1;
      }
      tails[key] = text.slice(-8192);
    },
    evidence() {
      return Object.freeze({
        bytes,
        digest: digest.copy().digest("hex"),
        networkBlockDetected,
        networkBlocks: Object.freeze({ ...networkBlocks }),
        outputLimitExceeded,
        secretLeakDetected,
      });
    },
  });
}

async function assertPortAvailable(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () =>
      reject(
        new CurrentReleaseRuntimeAcceptanceError("CURRENT_RELEASE_PORT_IN_USE"),
      ),
    );
    server.listen(port, LOOPBACK, () => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });
}

export async function connectExpectingKernelDenial() {
  return new Promise((resolve, reject) => {
    // systemd may enforce IPAddressDeny with either a connect-hook BPF program
    // (which returns EACCES/EPERM immediately) or a cgroup_skb program (which
    // silently drops the packet).  A remote TEST-NET target cannot distinguish
    // the latter from an ordinary routing timeout.  Instead, create a known
    // reachable listener on another loopback address.  The acceptance unit
    // allowlists only 127.0.0.1/32, so a timeout here proves the packet was
    // dropped; without the kernel fence this same connection succeeds.
    const deniedHost = "127.0.0.2";
    const server = net.createServer((peer) => peer.end());
    let socket = null;
    let timer = null;
    let settled = false;
    const finish = (error, denialCode = null) => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      socket?.destroy();
      if (server.listening) server.close(() => {});
      if (error) reject(error);
      else resolve(denialCode);
    };
    const notProven = () =>
      new CurrentReleaseRuntimeAcceptanceError(
        "CURRENT_RELEASE_KERNEL_SANDBOX_NOT_PROVEN",
      );
    server.once("error", () => finish(notProven()));
    server.listen(0, deniedHost, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        finish(notProven());
        return;
      }
      socket = net.createConnection({ host: deniedHost, port: address.port });
      timer = setTimeout(() => finish(null, "ETIMEDOUT"), 2_000);
      socket.once("connect", () => {
        finish(
          new CurrentReleaseRuntimeAcceptanceError(
            "CURRENT_RELEASE_KERNEL_SANDBOX_BYPASSED",
          ),
        );
      });
      socket.once("error", (error) => {
        if (error?.code === "EACCES" || error?.code === "EPERM") {
          finish(null, error.code);
          return;
        }
        finish(notProven());
      });
    });
  });
}

async function connectThroughLoopback() {
  const server = net.createServer((socket) => socket.end());
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, LOOPBACK, resolve);
  });
  const address = server.address();
  try {
    await new Promise((resolve, reject) => {
      const socket = net.createConnection({
        host: LOOPBACK,
        port: address.port,
      });
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", reject);
    });
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }
}

async function readCurrentReleaseSystemdSandbox(unit) {
  const executable = "/usr/bin/systemctl";
  const executableMetadata = await lstat(executable).catch(() => null);
  if (
    !executableMetadata?.isFile() ||
    executableMetadata.isSymbolicLink() ||
    executableMetadata.uid !== 0 ||
    (executableMetadata.mode & 0o022) !== 0
  ) {
    fail("CURRENT_RELEASE_KERNEL_SANDBOX_SYSTEMCTL_UNTRUSTED");
  }
  const properties = [
    "AmbientCapabilities",
    "CapabilityBoundingSet",
    "ControlGroup",
    "Delegate",
    "IPAddressAllow",
    "IPAddressDeny",
    "Id",
    "NoNewPrivileges",
    "PrivateTmp",
    "ProtectHome",
    "ProtectSystem",
  ];
  const output = await new Promise((resolve, reject) => {
    const child = spawn(
      executable,
      [
        "show",
        unit,
        "--no-pager",
        ...properties.flatMap((property) => ["--property", property]),
      ],
      {
        env: { LANG: "C", LC_ALL: "C", PATH: "/usr/sbin:/usr/bin" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const chunks = [];
    let bytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, 5_000);
    child.stdout.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes <= 64 * 1024) chunks.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (
        timedOut ||
        code !== 0 ||
        signal !== null ||
        bytes > 64 * 1024 ||
        stderrBytes > 64 * 1024
      ) {
        reject(
          new CurrentReleaseRuntimeAcceptanceError(
            "CURRENT_RELEASE_KERNEL_SANDBOX_SYSTEMD_QUERY_FAILED",
          ),
        );
        return;
      }
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
  });
  const parsed = new Map();
  for (const line of output.split("\n")) {
    if (!line) continue;
    const separator = line.indexOf("=");
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (
      separator < 1 ||
      !properties.includes(key) ||
      parsed.has(key) ||
      /[\r\0]/u.test(value)
    ) {
      fail("CURRENT_RELEASE_KERNEL_SANDBOX_SYSTEMD_EVIDENCE_INVALID");
    }
    parsed.set(key, value);
  }
  if (properties.some((property) => !parsed.has(property))) {
    fail("CURRENT_RELEASE_KERNEL_SANDBOX_SYSTEMD_EVIDENCE_INVALID");
  }
  return parsed;
}

export async function attestCurrentReleaseKernelSandbox() {
  if (process.platform !== "linux" || typeof process.getuid !== "function") {
    fail("CURRENT_RELEASE_KERNEL_SANDBOX_REQUIRED");
  }
  if (process.getuid() === 0) {
    fail("CURRENT_RELEASE_KERNEL_SANDBOX_ROOT_FORBIDDEN");
  }
  const [cgroupRaw, statusRaw] = await Promise.all([
    readFile("/proc/self/cgroup", "utf8"),
    readFile("/proc/self/status", "utf8"),
  ]);
  if (cgroupRaw.length > 64 * 1024 || statusRaw.length > 256 * 1024) {
    fail("CURRENT_RELEASE_KERNEL_SANDBOX_EVIDENCE_INVALID");
  }
  const unified = cgroupRaw
    .split("\n")
    .map((line) => /^0::(\/.+)$/u.exec(line)?.[1] ?? null)
    .filter(Boolean);
  if (unified.length !== 1) {
    fail("CURRENT_RELEASE_KERNEL_SANDBOX_CGROUP_INVALID");
  }
  const unit = path.posix.basename(unified[0]);
  if (
    !/^leetplus-current-release-acceptance-[a-z0-9]{8,32}\.(?:service|scope)$/u.test(
      unit,
    ) ||
    !/^NoNewPrivs:\s+1$/mu.test(statusRaw) ||
    !/^CapEff:\s+0+$/mu.test(statusRaw)
  ) {
    fail("CURRENT_RELEASE_KERNEL_SANDBOX_IDENTITY_INVALID");
  }
  const systemd = await readCurrentReleaseSystemdSandbox(unit);
  const deny = systemd.get("IPAddressDeny");
  const allow = systemd.get("IPAddressAllow");
  if (
    systemd.get("Id") !== unit ||
    systemd.get("ControlGroup") !== unified[0] ||
    systemd.get("Delegate") !== "no" ||
    systemd.get("NoNewPrivileges") !== "yes" ||
    systemd.get("CapabilityBoundingSet") !== "" ||
    systemd.get("AmbientCapabilities") !== "" ||
    systemd.get("PrivateTmp") !== "yes" ||
    systemd.get("ProtectSystem") !== "strict" ||
    !["yes", "read-only"].includes(systemd.get("ProtectHome")) ||
    !(
      deny === "any" ||
      (deny.includes("0.0.0.0/0") && deny.includes("::/0"))
    ) ||
    new Set(allow.split(" ")).size !== 2 ||
    !allow.includes("127.0.0.1/32") ||
    !allow.includes("::1/128")
  ) {
    fail("CURRENT_RELEASE_KERNEL_SANDBOX_SYSTEMD_POLICY_MISMATCH");
  }
  await connectThroughLoopback();
  const denialCode = await connectExpectingKernelDenial();
  return Object.freeze({
    cgroupPath: unified[0],
    evidence: Object.freeze({
      cgroupDigest: sha256(unified[0]),
      denialCode,
      delegationDisabled: true,
      loopbackAllowed: true,
      nonLoopbackDeniedByKernel: true,
      unitDigest: sha256(unit),
    }),
  });
}

function startRuntime({ args, cwd, environment, sensitiveValues = [] }) {
  const collector = createAggregateLogCollector({ sensitiveValues });
  const child = spawn(process.execPath, args, {
    cwd,
    detached: process.platform !== "win32",
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.on("data", (chunk) => collector.append("stdout", chunk));
  child.stderr.on("data", (chunk) => collector.append("stderr", chunk));
  return Object.freeze({ child, evidence: () => collector.evidence() });
}

async function terminateChild(child, graceMs = 8_000) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn(
        "taskkill.exe",
        ["/PID", String(child.pid), "/T", "/F"],
        { stdio: "ignore", windowsHide: true },
      );
      killer.once("exit", resolve);
      killer.once("error", resolve);
    });
    return;
  }
  const groupAlive = () => {
    try {
      process.kill(-child.pid, 0);
      return true;
    } catch (error) {
      if (error?.code === "ESRCH") return false;
      throw error;
    }
  };
  if (!groupAlive()) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
  const deadline = Date.now() + graceMs;
  while (groupAlive() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (groupAlive()) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  }
  const killDeadline = Date.now() + 2_000;
  while (groupAlive() && Date.now() < killDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (groupAlive()) {
    fail("CURRENT_RELEASE_RUNTIME_PROCESS_GROUP_NOT_DRAINED");
  }
}

async function currentCgroupProcessIds(cgroupPath) {
  if (
    process.platform !== "linux" ||
    typeof cgroupPath !== "string" ||
    !cgroupPath.startsWith("/") ||
    cgroupPath.includes("..")
  ) {
    fail("CURRENT_RELEASE_RUNTIME_CGROUP_IDENTITY_INVALID");
  }
  const raw = await readFile(
    path.posix.join("/sys/fs/cgroup", cgroupPath, "cgroup.procs"),
    "utf8",
  );
  if (raw.length > 1024 * 1024) {
    fail("CURRENT_RELEASE_RUNTIME_CGROUP_EVIDENCE_TOO_LARGE");
  }
  return raw
    .split("\n")
    .filter(Boolean)
    .map((value) =>
      exactInteger(
        Number(value),
        1,
        2 ** 31 - 1,
        "CURRENT_RELEASE_RUNTIME_CGROUP_PID_INVALID",
      ),
    )
    .sort((left, right) => left - right);
}

async function waitForRuntimeResidueAbsence(
  client,
  ports,
  cgroupPath,
  timeoutMs = 10_000,
) {
  const deadline = Date.now() + timeoutMs;
  let remainingSessions = null;
  let portsAvailable = false;
  let cgroupProcessCount = null;
  while (Date.now() < deadline) {
    const sessions = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> pg_backend_pid()
    `);
    remainingSessions = Number(sessions.rows[0]?.count);
    const cgroupProcessIds = await currentCgroupProcessIds(cgroupPath);
    cgroupProcessCount = cgroupProcessIds.length;
    const cgroupOnlyController =
      cgroupProcessCount === 1 && cgroupProcessIds[0] === process.pid;
    try {
      await Promise.all(ports.map((port) => assertPortAvailable(port)));
      portsAvailable = true;
    } catch {
      portsAvailable = false;
    }
    if (remainingSessions === 0 && portsAvailable && cgroupOnlyController) {
      return Object.freeze({
        cgroupProcessCount: 1,
        cgroupOnlyController: true,
        portsAvailable: true,
        remainingSessions: 0,
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  fail("CURRENT_RELEASE_RUNTIME_RESIDUE_NOT_DRAINED", {
    portsAvailable,
    cgroupProcessCount,
    remainingSessions,
  });
}

async function boundedResponse(response, reasonCode) {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_JSON_BYTES) fail(`${reasonCode}_BODY_TOO_LARGE`);
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > MAX_JSON_BYTES) fail(`${reasonCode}_BODY_TOO_LARGE`);
  return Object.freeze({
    body,
    bodySha256: sha256(body),
    bytes: body.length,
    contentType: response.headers.get("content-type") ?? "",
    status: response.status,
  });
}

async function request({
  baseUrl,
  body,
  cookie,
  fetchImpl = fetch,
  method = "GET",
  path: requestPath,
  timeoutMs = DEFAULT_HTTP_TIMEOUT_MS,
  token,
}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  if (token) headers.Authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetchImpl(`${baseUrl}${requestPath}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    fail("CURRENT_RELEASE_HTTP_REQUEST_FAILED");
  }
  return {
    response,
    result: await boundedResponse(response, "CURRENT_RELEASE_HTTP"),
  };
}

function parseJson(result, reasonCode) {
  if (!/^application\/json(?:;|$)/iu.test(result.contentType)) fail(reasonCode);
  try {
    return JSON.parse(result.body.toString("utf8"));
  } catch {
    fail(reasonCode);
  }
}

function aggregateProbe(name, result, accepted = [200]) {
  if (!accepted.includes(result.status)) {
    fail(
      `CURRENT_RELEASE_PROBE_${name.replaceAll("-", "_").toUpperCase()}_FAILED`,
      {
        bodySha256: result.bodySha256,
        bytes: result.bytes,
        probeName: name,
        status: result.status,
      },
    );
  }
  return Object.freeze({
    bodySha256: result.bodySha256,
    bytes: result.bytes,
    name,
    status: result.status,
  });
}

function tokenFromCookie(cookie) {
  const match = /(?:^|;\s*)leetplus_access_token=([^;]+)/u.exec(cookie);
  if (!match || match[1].length < 20)
    fail("CURRENT_RELEASE_LOGIN_COOKIE_INVALID");
  return match[1];
}

function normalizeScopeOracle(scopeOracle) {
  const setNames = [
    "activeUserIds",
    "customRoleIds",
    "disciplineUserIds",
    "eventIds",
    "inviteIds",
    "lootBoxIds",
    "missionIds",
    "productIds",
    "profileIds",
    "promoCardIds",
    "rewardIds",
    "seasonIds",
    "storeIds",
    "tenantReferenceUserIds",
    "userIds",
    ...CURRENT_RELEASE_ENTITY_SET_NAMES,
  ];
  if (
    !scopeOracle ||
    typeof scopeOracle !== "object" ||
    typeof scopeOracle.tenantId !== "string" ||
    scopeOracle.tenantId.length < 1 ||
    typeof scopeOracle.loginUserId !== "string" ||
    scopeOracle.loginUserId.length < 1
  ) {
    fail("CURRENT_RELEASE_SCOPE_ORACLE_INVALID");
  }
  const normalized = {
    loginUserId: scopeOracle.loginUserId,
    tenantId: scopeOracle.tenantId,
  };
  for (const name of setNames) {
    const values = scopeOracle[name];
    if (
      !Array.isArray(values) ||
      values.some((value) => typeof value !== "string" || value.length < 1) ||
      new Set(values).size !== values.length
    ) {
      fail("CURRENT_RELEASE_SCOPE_ORACLE_INVALID", { setName: name });
    }
    normalized[name] = Object.freeze([...values].sort(compareUtf8Bytes));
  }
  if (
    typeof scopeOracle.pilotStoreId !== "string" ||
    scopeOracle.pilotStoreId.length < 1 ||
    !normalized.storeIds.includes(scopeOracle.pilotStoreId)
  ) {
    fail("CURRENT_RELEASE_SCOPE_ORACLE_INVALID", {
      semanticName: "pilotStoreId",
    });
  }
  normalized.pilotStoreId = scopeOracle.pilotStoreId;
  const workspaceSummaryKeys = [
    "profilesCount",
    "activeLootBoxes",
    "activeMissions",
    "activeSeasons",
    "pendingRewards",
    "approvedRewards",
    "paidRewards",
    "expiredRewards",
    "rewardCount",
    "eventCount",
  ];
  if (
    !scopeOracle.gamificationWorkspaceSummary ||
    typeof scopeOracle.gamificationWorkspaceSummary !== "object" ||
    Array.isArray(scopeOracle.gamificationWorkspaceSummary) ||
    workspaceSummaryKeys.some(
      (key) =>
        !Number.isSafeInteger(scopeOracle.gamificationWorkspaceSummary[key]) ||
        scopeOracle.gamificationWorkspaceSummary[key] < 0,
    )
  ) {
    fail("CURRENT_RELEASE_SCOPE_ORACLE_INVALID", {
      semanticName: "gamificationWorkspaceSummary",
    });
  }
  normalized.gamificationWorkspaceSummary = Object.freeze(
    Object.fromEntries(
      workspaceSummaryKeys.map((key) => [
        key,
        scopeOracle.gamificationWorkspaceSummary[key],
      ]),
    ),
  );
  if (
    normalized.gamificationWorkspaceSummary.profilesCount !==
      normalized.profileIds.length ||
    normalized.gamificationWorkspaceSummary.rewardCount !==
      normalized.rewardIds.length ||
    normalized.gamificationWorkspaceSummary.eventCount !==
      normalized.eventIds.length ||
    normalized.gamificationWorkspaceSummary.activeLootBoxes >
      normalized.lootBoxIds.length ||
    normalized.gamificationWorkspaceSummary.activeMissions >
      normalized.missionIds.length ||
    normalized.gamificationWorkspaceSummary.activeSeasons >
      normalized.seasonIds.length ||
    normalized.gamificationWorkspaceSummary.pendingRewards +
      normalized.gamificationWorkspaceSummary.approvedRewards +
      normalized.gamificationWorkspaceSummary.paidRewards +
      normalized.gamificationWorkspaceSummary.expiredRewards >
      normalized.rewardIds.length
  ) {
    fail("CURRENT_RELEASE_SCOPE_ORACLE_INVALID", {
      semanticName: "gamificationWorkspaceSummaryConsistency",
    });
  }
  normalized.storeIdSet = new Set(normalized.storeIds);
  normalized.userIdSet = new Set(normalized.userIds);
  normalized.tenantReferenceUserIdSet = new Set(
    normalized.tenantReferenceUserIds,
  );
  if (
    !normalized.tenantReferenceUserIdSet.has(normalized.loginUserId) ||
    normalized.userIds.some(
      (userId) => !normalized.tenantReferenceUserIdSet.has(userId),
    ) ||
    normalized.activeUserIds.some(
      (userId) => !normalized.userIdSet.has(userId),
    ) ||
    normalized.disciplineUserIds.some(
      (userId) => !normalized.activeUserIds.includes(userId),
    ) ||
    !normalized.activeUserIds.includes(normalized.loginUserId)
  ) {
    fail("CURRENT_RELEASE_SCOPE_ORACLE_INVALID", {
      semanticName: "userVisibilitySets",
    });
  }
  const normalizeCapabilityList = (values, semanticName) => {
    if (
      !Array.isArray(values) ||
      values.some(
        (value) =>
          typeof value !== "string" ||
          !CURRENT_RELEASE_CAPABILITY_SET.has(value),
      ) ||
      new Set(values).size !== values.length
    ) {
      fail("CURRENT_RELEASE_SCOPE_ORACLE_INVALID", {
        semanticName,
      });
    }
    return Object.freeze([...values].sort(compareUtf8Bytes));
  };
  const normalizeAccessSemantic = (row, semanticName) => {
    if (
      !row ||
      typeof row !== "object" ||
      typeof row.id !== "string" ||
      row.id.length < 1 ||
      !CURRENT_RELEASE_USER_ROLES.includes(row.role) ||
      !["NETWORK", "STORES"].includes(row.scope) ||
      (row.customRoleId !== null &&
        (typeof row.customRoleId !== "string" ||
          row.customRoleId.length < 1)) ||
      !Array.isArray(row.storeIds) ||
      row.storeIds.some(
        (storeId) =>
          typeof storeId !== "string" || !normalized.storeIdSet.has(storeId),
      ) ||
      new Set(row.storeIds).size !== row.storeIds.length ||
      (row.scope === "NETWORK" && row.storeIds.length !== 0) ||
      (row.scope === "STORES" && row.storeIds.length === 0)
    ) {
      fail("CURRENT_RELEASE_SCOPE_ORACLE_INVALID", { semanticName });
    }
    return Object.freeze({
      customRoleId: row.customRoleId,
      id: row.id,
      role: row.role,
      scope: row.scope,
      storeIds: Object.freeze([...row.storeIds].sort(compareUtf8Bytes)),
    });
  };
  if (
    !Array.isArray(scopeOracle.customRoleSemantics) ||
    !Array.isArray(scopeOracle.inviteSemantics) ||
    !Array.isArray(scopeOracle.roleOverrideSemantics) ||
    !Array.isArray(scopeOracle.userSemantics)
  ) {
    fail("CURRENT_RELEASE_SCOPE_ORACLE_INVALID");
  }
  normalized.customRoleSemantics = Object.freeze(
    scopeOracle.customRoleSemantics.map((row) => {
      if (!row || typeof row !== "object" || typeof row.id !== "string") {
        fail("CURRENT_RELEASE_SCOPE_ORACLE_INVALID", {
          semanticName: "customRoleSemantics",
        });
      }
      return Object.freeze({
        id: row.id,
        permissions: normalizeCapabilityList(
          row.permissions,
          "customRoleSemantics",
        ),
      });
    }),
  );
  normalized.inviteSemantics = Object.freeze(
    scopeOracle.inviteSemantics.map((row) =>
      normalizeAccessSemantic(row, "inviteSemantics"),
    ),
  );
  normalized.roleOverrideSemantics = Object.freeze(
    scopeOracle.roleOverrideSemantics.map((row) => {
      if (
        !row ||
        typeof row !== "object" ||
        !CURRENT_RELEASE_USER_ROLES.includes(row.role)
      ) {
        fail("CURRENT_RELEASE_SCOPE_ORACLE_INVALID", {
          semanticName: "roleOverrideSemantics",
        });
      }
      return Object.freeze({
        permissions: normalizeCapabilityList(
          row.permissions,
          "roleOverrideSemantics",
        ),
        role: row.role,
      });
    }),
  );
  normalized.userSemantics = Object.freeze(
    scopeOracle.userSemantics.map((row) => {
      const access = normalizeAccessSemantic(row, "userSemantics");
      if (typeof row.isActive !== "boolean" || row.isPlatformAdmin !== false) {
        fail("CURRENT_RELEASE_SCOPE_ORACLE_INVALID", {
          semanticName: "userSemantics",
        });
      }
      return Object.freeze({
        ...access,
        isActive: row.isActive,
        isPlatformAdmin: false,
      });
    }),
  );
  const bindUniqueBy = (rows, key, semanticName) => {
    const pairs = rows.map((row) => [row[key], row]);
    if (new Set(pairs.map(([value]) => value)).size !== pairs.length) {
      fail("CURRENT_RELEASE_SCOPE_ORACLE_INVALID", { semanticName });
    }
    return Object.freeze(Object.fromEntries(pairs));
  };
  normalized.customRoleSemanticsById = bindUniqueBy(
    normalized.customRoleSemantics,
    "id",
    "customRoleSemantics",
  );
  normalized.inviteSemanticsById = bindUniqueBy(
    normalized.inviteSemantics,
    "id",
    "inviteSemantics",
  );
  normalized.roleOverrideSemanticsByRole = bindUniqueBy(
    normalized.roleOverrideSemantics,
    "role",
    "roleOverrideSemantics",
  );
  normalized.userSemanticsById = bindUniqueBy(
    normalized.userSemantics,
    "id",
    "userSemantics",
  );
  const assertSemanticIds = (rows, expectedIds, semanticName) => {
    const ids = rows.map((row) => row.id).sort(compareUtf8Bytes);
    if (stableJson(ids) !== stableJson(expectedIds)) {
      fail("CURRENT_RELEASE_SCOPE_ORACLE_INVALID", { semanticName });
    }
  };
  assertSemanticIds(
    normalized.customRoleSemantics,
    normalized.customRoleIds,
    "customRoleSemantics",
  );
  assertSemanticIds(
    normalized.inviteSemantics,
    normalized.inviteIds,
    "inviteSemantics",
  );
  assertSemanticIds(
    normalized.userSemantics,
    normalized.userIds,
    "userSemantics",
  );
  if (!normalized.userSemanticsById[normalized.loginUserId]) {
    fail("CURRENT_RELEASE_SCOPE_ORACLE_INVALID", {
      semanticName: "loginUserId",
    });
  }
  if (
    normalized.activeUserIds.some(
      (userId) => normalized.userSemanticsById[userId]?.isActive !== true,
    ) ||
    normalized.userSemantics.some(
      (row) =>
        row.isActive === true && !normalized.activeUserIds.includes(row.id),
    )
  ) {
    fail("CURRENT_RELEASE_SCOPE_ORACLE_INVALID", {
      semanticName: "activeUserIds",
    });
  }
  const expectedDisciplineUserIds = normalized.userSemantics
    .filter(
      (row) =>
        row.isActive === true &&
        ["CLUB_ADMINISTRATOR", "SENIOR_ADMINISTRATOR", "CLUB_MANAGER"].includes(
          row.role,
        ),
    )
    .map((row) => row.id)
    .sort(compareUtf8Bytes);
  if (
    stableJson(expectedDisciplineUserIds) !==
    stableJson(normalized.disciplineUserIds)
  ) {
    fail("CURRENT_RELEASE_SCOPE_ORACLE_INVALID", {
      semanticName: "disciplineUserIds",
    });
  }
  for (const row of [
    ...normalized.inviteSemantics,
    ...normalized.userSemantics,
  ]) {
    if (
      row.customRoleId !== null &&
      !normalized.customRoleSemanticsById[row.customRoleId]
    ) {
      fail("CURRENT_RELEASE_SCOPE_ORACLE_INVALID", {
        semanticName: "customRoleReference",
      });
    }
  }
  normalized.entityIdSets = Object.freeze(
    Object.fromEntries(
      CURRENT_RELEASE_ENTITY_SET_NAMES.map((name) => [
        name,
        new Set(normalized[name]),
      ]),
    ),
  );
  return Object.freeze(normalized);
}

export async function refreshCurrentReleaseNotificationOracle(
  client,
  scopeOracle,
) {
  const oracle = normalizeScopeOracle(scopeOracle);
  let result;
  try {
    result = await client.query(
      `SELECT ARRAY(
         SELECT entity.id::text
         FROM "StaffNotification" entity
         WHERE entity."tenantId" = $1
           AND (entity."targetUserId" IS NULL OR entity."targetUserId" = $2)
         ORDER BY entity.id COLLATE "C"
         LIMIT 5000
       ) AS "notificationIds"`,
      [oracle.tenantId, oracle.loginUserId],
    );
  } catch {
    fail("CURRENT_RELEASE_NOTIFICATION_ORACLE_REFRESH_FAILED");
  }
  const notificationIds = result?.rows?.[0]?.notificationIds;
  if (
    result?.rowCount !== 1 ||
    !Array.isArray(notificationIds) ||
    notificationIds.some(
      (value) => typeof value !== "string" || value.length < 1,
    ) ||
    new Set(notificationIds).size !== notificationIds.length
  ) {
    fail("CURRENT_RELEASE_NOTIFICATION_ORACLE_REFRESH_FAILED");
  }
  return normalizeScopeOracle({
    ...oracle,
    notificationIds,
  });
}

function assertExactIdSet(rows, expectedIds, reasonCode, context = {}) {
  if (!Array.isArray(rows)) fail(reasonCode, context);
  const ids = rows.map((row) =>
    row && typeof row === "object" && typeof row.id === "string"
      ? row.id
      : null,
  );
  const sortableIds = ids.filter((id) => typeof id === "string");
  if (
    ids.some((id) => id === null) ||
    new Set(ids).size !== ids.length ||
    stableJson([...sortableIds].sort(compareUtf8Bytes)) !==
      stableJson(expectedIds)
  ) {
    fail(reasonCode, {
      ...context,
      actualCount: ids.length,
      actualInvalidIdCount: ids.length - sortableIds.length,
      actualSetDigest: sha256(
        stableJson([...sortableIds].sort(compareUtf8Bytes)),
      ),
      expectedCount: expectedIds.length,
      expectedSetDigest: sha256(stableJson(expectedIds)),
    });
  }
  return Object.freeze({
    count: ids.length,
    idSetDigest: sha256(stableJson(expectedIds)),
  });
}

function assertDisciplinePolicyProjection(body, oracle) {
  if (!Array.isArray(body.policies)) {
    fail("CURRENT_RELEASE_DISCIPLINE_POLICY_PROJECTION_INVALID");
  }
  const expectedPolicyIds = new Set(oracle.disciplinePolicyIds);
  const expectedStoreIds = new Set(oracle.storeIds);
  const observedPolicyIds = [];
  const observedStoreIds = [];
  let networkCount = 0;
  for (const policy of body.policies) {
    if (
      !policy ||
      typeof policy !== "object" ||
      typeof policy.enabled !== "boolean" ||
      typeof policy.label !== "string" ||
      !["NETWORK", "STORE"].includes(policy.scope) ||
      typeof policy.inheritedFromNetwork !== "boolean"
    ) {
      fail("CURRENT_RELEASE_DISCIPLINE_POLICY_PROJECTION_INVALID");
    }
    if (policy.scope === "NETWORK") {
      networkCount += 1;
      if (
        typeof policy.id !== "string" ||
        policy.storeId !== null ||
        policy.inheritedFromNetwork !== false ||
        !expectedPolicyIds.has(policy.id)
      ) {
        fail("CURRENT_RELEASE_DISCIPLINE_POLICY_PROJECTION_INVALID");
      }
      observedPolicyIds.push(policy.id);
      continue;
    }
    if (
      typeof policy.storeId !== "string" ||
      !expectedStoreIds.has(policy.storeId) ||
      (policy.inheritedFromNetwork === true && policy.id !== null) ||
      (policy.inheritedFromNetwork === false &&
        (typeof policy.id !== "string" || !expectedPolicyIds.has(policy.id)))
    ) {
      fail("CURRENT_RELEASE_DISCIPLINE_POLICY_PROJECTION_INVALID");
    }
    observedStoreIds.push(policy.storeId);
    if (typeof policy.id === "string") observedPolicyIds.push(policy.id);
  }
  const sortedPolicyIds = [...observedPolicyIds].sort(compareUtf8Bytes);
  const sortedStoreIds = [...observedStoreIds].sort(compareUtf8Bytes);
  if (
    networkCount !== 1 ||
    new Set(observedPolicyIds).size !== observedPolicyIds.length ||
    new Set(observedStoreIds).size !== observedStoreIds.length ||
    stableJson(sortedPolicyIds) !== stableJson(oracle.disciplinePolicyIds) ||
    stableJson(sortedStoreIds) !== stableJson(oracle.storeIds) ||
    body.policies.length !== oracle.storeIds.length + 1
  ) {
    fail("CURRENT_RELEASE_DISCIPLINE_POLICY_SET_MISMATCH", {
      actualPolicyCount: observedPolicyIds.length,
      actualPolicySetDigest: sha256(stableJson(sortedPolicyIds)),
      actualStoreCount: observedStoreIds.length,
      actualStoreSetDigest: sha256(stableJson(sortedStoreIds)),
      expectedPolicyCount: oracle.disciplinePolicyIds.length,
      expectedPolicySetDigest: sha256(stableJson(oracle.disciplinePolicyIds)),
      expectedStoreCount: oracle.storeIds.length,
      expectedStoreSetDigest: sha256(stableJson(oracle.storeIds)),
    });
  }
  return sha256(
    stableJson({
      policyIds: sortedPolicyIds,
      storeIds: sortedStoreIds,
    }),
  );
}

function assertIdSubset(rows, expectedIds, reasonCode, context = {}) {
  if (!Array.isArray(rows)) fail(reasonCode, context);
  const allowed = new Set(expectedIds);
  const ids = [];
  for (const row of rows) {
    if (!row || typeof row !== "object" || typeof row.id !== "string") {
      fail(reasonCode, context);
    }
    if (!allowed.has(row.id)) fail(reasonCode, context);
    ids.push(row.id);
  }
  if (new Set(ids).size !== ids.length) fail(reasonCode, context);
  return Object.freeze({
    count: ids.length,
    idSetDigest: sha256(stableJson([...ids].sort(compareUtf8Bytes))),
  });
}

function assertBoundEntityArray(body, binding, oracle, probe) {
  const expectedIds = oracle[binding.oracle];
  if (!Array.isArray(expectedIds)) {
    fail("CURRENT_RELEASE_CRITICAL_READ_ORACLE_MISSING", {
      module: probe.module,
      probeName: probe.name,
      oracleDigest: sha256(binding.oracle),
    });
  }
  const reasonCode = "CURRENT_RELEASE_CRITICAL_READ_ENTITY_SET_MISMATCH";
  const context = Object.freeze({
    module: probe.module,
    oracle: binding.oracle,
    probeName: probe.name,
    responseKey: binding.key,
  });
  const evidence = binding.exact
    ? assertExactIdSet(body[binding.key], expectedIds, reasonCode, context)
    : assertIdSubset(body[binding.key], expectedIds, reasonCode, context);
  if (
    binding.allowEmpty !== true &&
    expectedIds.length > 0 &&
    evidence.count === 0
  ) {
    fail("CURRENT_RELEASE_CRITICAL_READ_ENTITY_SET_EMPTY", {
      module: probe.module,
      probeName: probe.name,
      responseKeyDigest: sha256(binding.key),
    });
  }
  if (
    binding.key === "rows" &&
    (!body.summary ||
      !Number.isSafeInteger(body.summary.total) ||
      body.summary.total !== expectedIds.length)
  ) {
    fail("CURRENT_RELEASE_CRITICAL_READ_SUMMARY_TOTAL_MISMATCH", {
      actualCount: body.summary?.total ?? null,
      expectedCount: expectedIds.length,
      module: probe.module,
      probeName: probe.name,
    });
  }
  return Object.freeze({
    count: evidence.count,
    idSetDigest: evidence.idSetDigest,
    keyDigest: sha256(binding.key),
  });
}

function assertNonnegativeFiniteNumber(value, reasonCode) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail(reasonCode);
  }
  return value;
}

function assertFiniteNumber(value, reasonCode) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(reasonCode);
  }
  return value;
}

function assertReadinessProjection(
  value,
  expectedKeys,
  reasonCode,
  { requirePercentage = false } = {},
) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !value.summary ||
    typeof value.summary !== "object" ||
    Array.isArray(value.summary) ||
    !Array.isArray(value.items)
  ) {
    fail(reasonCode);
  }
  const keys = [];
  const counts = { BLOCKED: 0, MANUAL_ONLY: 0, PARTIAL: 0, READY: 0 };
  for (const item of value.items) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.key !== "string" ||
      !CURRENT_RELEASE_READINESS_STATUSES.includes(item.status) ||
      typeof item.ready !== "boolean" ||
      item.ready !== (item.status === "READY")
    ) {
      fail(reasonCode);
    }
    keys.push(item.key);
    counts[item.status] += 1;
  }
  const sortedKeys = [...keys].sort(compareUtf8Bytes);
  if (
    new Set(keys).size !== keys.length ||
    stableJson(sortedKeys) !== stableJson(expectedKeys) ||
    value.summary.total !== value.items.length ||
    value.summary.ready !== counts.READY ||
    value.summary.partial !== counts.PARTIAL ||
    value.summary.blocked !== counts.BLOCKED ||
    value.summary.manualOnly !== counts.MANUAL_ONLY
  ) {
    fail(reasonCode);
  }
  if (
    requirePercentage &&
    (!Number.isSafeInteger(value.summary.readinessPercent) ||
      value.summary.readinessPercent !==
        Math.round(
          ((counts.READY + counts.PARTIAL * 0.5 + counts.MANUAL_ONLY * 0.5) /
            value.items.length) *
            100,
        ))
  ) {
    fail(reasonCode);
  }
  return Object.freeze({
    itemCount: value.items.length,
    keySetDigest: sha256(stableJson(sortedKeys)),
    statusCounts: Object.freeze(counts),
  });
}

function assertGamificationWorkspaceProjection(body, oracle) {
  const reasonCode = "CURRENT_RELEASE_GAMIFICATION_WORKSPACE_SEMANTICS_INVALID";
  const expected = oracle.gamificationWorkspaceSummary;
  const pilotEntityCount =
    oracle.lootBoxIds.length +
    oracle.missionIds.length +
    oracle.seasonIds.length +
    oracle.rewardIds.length +
    oracle.eventIds.length;
  if (pilotEntityCount === 0) {
    fail("CURRENT_RELEASE_GAMIFICATION_WORKSPACE_ORACLE_EMPTY");
  }
  if (
    !body.summary ||
    typeof body.summary !== "object" ||
    Array.isArray(body.summary) ||
    body.summary.profilesCount !== expected.profilesCount ||
    body.summary.activeLootBoxes !== expected.activeLootBoxes ||
    body.summary.activeMissions !== expected.activeMissions ||
    body.summary.activeSeasons !== expected.activeSeasons ||
    body.summary.pendingRewards !== expected.pendingRewards ||
    body.summary.approvedRewards !== expected.approvedRewards ||
    body.summary.paidRewards !== expected.paidRewards ||
    body.summary.expiredRewards !== expected.expiredRewards ||
    !Number.isSafeInteger(body.summary.registeredProfilesCount) ||
    body.summary.registeredProfilesCount < 0 ||
    body.summary.registeredProfilesCount > expected.profilesCount
  ) {
    fail(reasonCode);
  }
  for (const key of [
    "averageLevel",
    "plannedBudget",
    "pendingRewardAmount",
    "paidRewardAmount",
  ]) {
    assertNonnegativeFiniteNumber(body.summary[key], reasonCode);
  }
  assertFiniteNumber(body.summary.totalXp, reasonCode);
  const economySummary = body.economy?.summary;
  if (
    !economySummary ||
    typeof economySummary !== "object" ||
    Array.isArray(economySummary) ||
    !Array.isArray(body.economy.scenarios) ||
    economySummary.rewardCount !== expected.rewardCount ||
    economySummary.eventsCount !== expected.eventCount
  ) {
    fail(reasonCode);
  }
  for (const key of [
    "plannedBudget",
    "budgetUsedCost",
    "pendingCost",
    "approvedCost",
    "paidCost",
    "expiredCost",
    "canceledCost",
    "rewardCount",
    "rewardBacklog",
    "paidRewards",
    "eventsCount",
    "uniqueGuests",
    "rulesWithoutBudget",
    "averageRewardCost",
  ]) {
    assertNonnegativeFiniteNumber(economySummary[key], reasonCode);
  }
  assertFiniteNumber(economySummary.xpIssued, reasonCode);
  if (
    economySummary.budgetUsagePercent !== null &&
    (typeof economySummary.budgetUsagePercent !== "number" ||
      !Number.isFinite(economySummary.budgetUsagePercent) ||
      economySummary.budgetUsagePercent < 0)
  ) {
    fail(reasonCode);
  }
  if (
    !body.effect ||
    typeof body.effect !== "object" ||
    Array.isArray(body.effect) ||
    !Number.isSafeInteger(body.effect.windowDays) ||
    body.effect.windowDays < 1 ||
    body.effect.windowDays > 365 ||
    !body.effect.summary ||
    typeof body.effect.summary !== "object" ||
    Array.isArray(body.effect.summary) ||
    !Array.isArray(body.effect.scenarios)
  ) {
    fail(reasonCode);
  }
  const integration = assertReadinessProjection(
    body.integrationReadiness,
    CURRENT_RELEASE_INTEGRATION_READINESS_KEYS,
    reasonCode,
  );
  const pilot = assertReadinessProjection(
    body.pilotReadiness,
    CURRENT_RELEASE_PILOT_READINESS_KEYS,
    reasonCode,
    { requirePercentage: true },
  );
  if (
    !body.pilotReadiness.targetStore ||
    typeof body.pilotReadiness.targetStore !== "object" ||
    Array.isArray(body.pilotReadiness.targetStore) ||
    body.pilotReadiness.targetStore.id !== oracle.pilotStoreId ||
    typeof body.pilotReadiness.targetStore.guestPortalPath !== "string" ||
    !body.pilotReadiness.targetStore.guestPortalPath.startsWith("/guest/") ||
    body.pilotReadiness.targetStore.playPath !== "/play/game"
  ) {
    fail(reasonCode);
  }
  return sha256(
    stableJson({
      integration,
      pilot,
      pilotEntityCount,
      pilotStore: sha256(oracle.pilotStoreId),
      summary: expected,
    }),
  );
}

const USER_ID_KEYS = new Set([
  "actorUserId",
  "assignedToUserId",
  "confirmedByUserId",
  "createdByUserId",
  "observerUserId",
  "resultUserId",
  "targetUserId",
  "userId",
]);
const USER_IDS_KEYS = new Set(["memberUserIds", "mentionedUserIds", "userIds"]);
const USER_OBJECT_KEYS = new Set([
  "actorUser",
  "assignedToUser",
  "confirmedByUser",
  "createdByUser",
  "observerUser",
  "targetUser",
  "user",
]);

function assertTenantBoundReferences(value, oracle, options = {}, key = null) {
  if (value == null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) {
      assertTenantBoundReferences(item, oracle, options, key);
    }
    return;
  }
  if (
    key === "store" &&
    typeof value.id === "string" &&
    !oracle.storeIdSet.has(value.id)
  ) {
    fail("CURRENT_RELEASE_CROSS_TENANT_STORE_REFERENCE");
  }
  if (
    options.validateUsers &&
    USER_OBJECT_KEYS.has(key) &&
    typeof value.id === "string" &&
    !oracle.tenantReferenceUserIdSet.has(value.id)
  ) {
    fail("CURRENT_RELEASE_CROSS_TENANT_USER_REFERENCE");
  }
  for (const [childKey, childValue] of Object.entries(value)) {
    if (childKey === "tenantId" && childValue !== oracle.tenantId) {
      fail("CURRENT_RELEASE_CROSS_TENANT_REFERENCE");
    }
    if (
      childKey === "storeId" &&
      childValue != null &&
      (typeof childValue !== "string" || !oracle.storeIdSet.has(childValue))
    ) {
      fail("CURRENT_RELEASE_CROSS_TENANT_STORE_REFERENCE");
    }
    if (childKey === "storeIds") {
      if (
        !Array.isArray(childValue) ||
        childValue.some(
          (id) => typeof id !== "string" || !oracle.storeIdSet.has(id),
        )
      ) {
        fail("CURRENT_RELEASE_CROSS_TENANT_STORE_REFERENCE");
      }
    }
    if (
      options.validateUsers &&
      USER_ID_KEYS.has(childKey) &&
      childValue != null &&
      (typeof childValue !== "string" ||
        !oracle.tenantReferenceUserIdSet.has(childValue))
    ) {
      fail("CURRENT_RELEASE_CROSS_TENANT_USER_REFERENCE");
    }
    if (options.validateUsers && USER_IDS_KEYS.has(childKey)) {
      if (
        !Array.isArray(childValue) ||
        childValue.some(
          (id) =>
            typeof id !== "string" || !oracle.tenantReferenceUserIdSet.has(id),
        )
      ) {
        fail("CURRENT_RELEASE_CROSS_TENANT_USER_REFERENCE");
      }
    }
    if (childKey === "stores" && Array.isArray(childValue)) {
      assertIdSubset(
        childValue,
        [...oracle.storeIdSet],
        "CURRENT_RELEASE_CROSS_TENANT_STORE_REFERENCE",
      );
    }
    if (
      options.validateUsers &&
      childKey === "users" &&
      Array.isArray(childValue)
    ) {
      assertIdSubset(
        childValue,
        [...oracle.userIdSet],
        "CURRENT_RELEASE_CROSS_TENANT_USER_REFERENCE",
      );
    }
    assertTenantBoundReferences(childValue, oracle, options, childKey);
  }
}

function normalizedCapabilityDigest(values, reasonCode) {
  if (
    !Array.isArray(values) ||
    values.some(
      (value) =>
        typeof value !== "string" || !CURRENT_RELEASE_CAPABILITY_SET.has(value),
    ) ||
    new Set(values).size !== values.length
  ) {
    fail(reasonCode);
  }
  return sha256(stableJson([...values].sort(compareUtf8Bytes)));
}

function expectedRolePermissionDigest(role, customRoleId, oracle) {
  const source = customRoleId
    ? oracle.customRoleSemanticsById[customRoleId]
    : oracle.roleOverrideSemanticsByRole[role];
  if (!source) {
    const digest = CURRENT_RELEASE_BASE_ROLE_PERMISSION_DIGESTS[role];
    if (!digest) fail("CURRENT_RELEASE_USERS_ROLE_INVALID");
    return digest;
  }
  const permissions = [
    ...(CURRENT_RELEASE_MINIMUM_ROLE_CAPABILITIES[role] ?? []),
    ...source.permissions,
  ];
  return sha256(stableJson([...new Set(permissions)].sort(compareUtf8Bytes)));
}

function assertStoreProjection(rows, expectedIds, reasonCode) {
  const evidence = assertExactIdSet(rows, expectedIds, reasonCode);
  if (
    rows.some(
      (row) =>
        typeof row.name !== "string" ||
        row.name.trim().length < 1 ||
        typeof row.isActive !== "boolean",
    )
  ) {
    fail(reasonCode);
  }
  return evidence;
}

function assertCustomRoleProjections(rows, oracle) {
  const evidence = assertExactIdSet(
    rows,
    oracle.customRoleIds,
    "CURRENT_RELEASE_USERS_CUSTOM_ROLE_SET_MISMATCH",
  );
  for (const row of rows) {
    const expected = oracle.customRoleSemanticsById[row.id];
    if (
      !expected ||
      typeof row.name !== "string" ||
      row.name.trim().length < 1 ||
      (row.description !== null && typeof row.description !== "string") ||
      typeof row.createdAt !== "string" ||
      typeof row.updatedAt !== "string" ||
      normalizedCapabilityDigest(
        row.permissions,
        "CURRENT_RELEASE_USERS_CUSTOM_ROLE_SEMANTICS_MISMATCH",
      ) !== sha256(stableJson(expected.permissions))
    ) {
      fail("CURRENT_RELEASE_USERS_CUSTOM_ROLE_SEMANTICS_MISMATCH");
    }
  }
  return evidence;
}

function assertRoleOptionProjections(rows, oracle) {
  if (!Array.isArray(rows)) fail("CURRENT_RELEASE_USERS_ROLE_OPTIONS_INVALID");
  const roles = rows.map((row) => row?.role);
  if (
    roles.some((role) => !CURRENT_RELEASE_ROLE_OPTION_ROLES.includes(role)) ||
    new Set(roles).size !== roles.length ||
    stableJson([...roles].sort(compareUtf8Bytes)) !==
      stableJson([...CURRENT_RELEASE_ROLE_OPTION_ROLES].sort(compareUtf8Bytes))
  ) {
    fail("CURRENT_RELEASE_USERS_ROLE_OPTIONS_INVALID");
  }
  const permissionDigests = [];
  for (const row of rows) {
    const override = oracle.roleOverrideSemanticsByRole[row.role];
    const permissionDigest = normalizedCapabilityDigest(
      row.permissions,
      "CURRENT_RELEASE_USERS_ROLE_OPTIONS_INVALID",
    );
    if (
      typeof row.label !== "string" ||
      row.label.trim().length < 1 ||
      typeof row.description !== "string" ||
      row.description.trim().length < 1 ||
      row.isOverridden !== Boolean(override) ||
      (override
        ? typeof row.updatedAt !== "string" || row.updatedAt.length < 20
        : row.updatedAt !== null) ||
      permissionDigest !== expectedRolePermissionDigest(row.role, null, oracle)
    ) {
      fail("CURRENT_RELEASE_USERS_ROLE_OPTIONS_INVALID");
    }
    permissionDigests.push(`${row.role}:${permissionDigest}`);
  }
  return Object.freeze({
    count: rows.length,
    permissionSetDigest: sha256(
      stableJson(permissionDigests.sort(compareUtf8Bytes)),
    ),
  });
}

function assertCapabilityOptionProjections(rows) {
  if (!Array.isArray(rows)) fail("CURRENT_RELEASE_USERS_CAPABILITIES_INVALID");
  const keys = rows.map((row) => row?.key);
  if (
    keys.some((key) => !CURRENT_RELEASE_CAPABILITY_SET.has(key)) ||
    new Set(keys).size !== keys.length ||
    stableJson([...keys].sort(compareUtf8Bytes)) !==
      stableJson([...CURRENT_RELEASE_CAPABILITY_KEYS].sort(compareUtf8Bytes)) ||
    rows.some(
      (row) =>
        typeof row.label !== "string" ||
        row.label.trim().length < 1 ||
        typeof row.description !== "string" ||
        row.description.trim().length < 1,
    )
  ) {
    fail("CURRENT_RELEASE_USERS_CAPABILITIES_INVALID");
  }
  return Object.freeze({
    count: rows.length,
    keySetDigest: sha256(stableJson([...keys].sort(compareUtf8Bytes))),
  });
}

function assertUserProjections(rows, oracle) {
  const evidence = assertExactIdSet(
    rows,
    oracle.userIds,
    "CURRENT_RELEASE_USERS_ID_SET_MISMATCH",
  );
  const semanticDigests = [];
  for (const row of rows) {
    const expected = oracle.userSemanticsById[row.id];
    if (!expected) fail("CURRENT_RELEASE_USERS_SEMANTICS_MISMATCH");
    const stores = assertExactIdSet(
      row.stores,
      expected.storeIds,
      "CURRENT_RELEASE_USERS_SEMANTICS_MISMATCH",
    );
    const permissionDigest = normalizedCapabilityDigest(
      row.permissions,
      "CURRENT_RELEASE_USERS_SEMANTICS_MISMATCH",
    );
    if (
      row.role !== expected.role ||
      row.isActive !== expected.isActive ||
      row.isPlatformAdmin !== expected.isPlatformAdmin ||
      row.scope !== expected.scope ||
      row.customRoleId !== expected.customRoleId ||
      (expected.customRoleId === null
        ? row.customRole !== null
        : row.customRole?.id !== expected.customRoleId) ||
      permissionDigest !==
        expectedRolePermissionDigest(
          expected.role,
          expected.customRoleId,
          oracle,
        )
    ) {
      fail("CURRENT_RELEASE_USERS_SEMANTICS_MISMATCH");
    }
    semanticDigests.push(
      sha256(
        stableJson({
          customRoleId: expected.customRoleId,
          idDigest: sha256(expected.id),
          isActive: expected.isActive,
          permissionDigest,
          role: expected.role,
          scope: expected.scope,
          storeSetDigest: stores.idSetDigest,
        }),
      ),
    );
  }
  return Object.freeze({
    ...evidence,
    semanticSetDigest: sha256(
      stableJson(semanticDigests.sort(compareUtf8Bytes)),
    ),
  });
}

function assertInviteProjections(rows, oracle) {
  const evidence = assertExactIdSet(
    rows,
    oracle.inviteIds,
    "CURRENT_RELEASE_USERS_INVITE_SET_MISMATCH",
  );
  const semanticDigests = [];
  for (const row of rows) {
    const expected = oracle.inviteSemanticsById[row.id];
    if (!expected) fail("CURRENT_RELEASE_USERS_INVITE_SEMANTICS_MISMATCH");
    const stores = assertExactIdSet(
      row.stores,
      expected.storeIds,
      "CURRENT_RELEASE_USERS_INVITE_SEMANTICS_MISMATCH",
    );
    if (
      row.role !== expected.role ||
      row.scope !== expected.scope ||
      row.customRoleId !== expected.customRoleId ||
      row.acceptedAt !== null ||
      typeof row.createdAt !== "string" ||
      typeof row.expiresAt !== "string" ||
      (expected.customRoleId === null
        ? row.customRole !== null
        : row.customRole?.id !== expected.customRoleId)
    ) {
      fail("CURRENT_RELEASE_USERS_INVITE_SEMANTICS_MISMATCH");
    }
    semanticDigests.push(
      sha256(
        stableJson({
          customRoleId: expected.customRoleId,
          idDigest: sha256(expected.id),
          role: expected.role,
          scope: expected.scope,
          storeSetDigest: stores.idSetDigest,
        }),
      ),
    );
  }
  return Object.freeze({
    ...evidence,
    semanticSetDigest: sha256(
      stableJson(semanticDigests.sort(compareUtf8Bytes)),
    ),
  });
}

function assertUsersNetworkProjection(body, oracle) {
  if (
    !body ||
    !Array.isArray(body.users) ||
    !Array.isArray(body.stores) ||
    !Array.isArray(body.roleOptions) ||
    !Array.isArray(body.customRoles) ||
    !Array.isArray(body.invites) ||
    !Array.isArray(body.capabilityOptions) ||
    body.roleOptions.length < 1 ||
    body.capabilityOptions.length < 1
  ) {
    fail("CURRENT_RELEASE_USERS_NETWORK_PROJECTION_INVALID");
  }
  const users = assertUserProjections(body.users, oracle);
  const stores = assertStoreProjection(
    body.stores,
    oracle.storeIds,
    "CURRENT_RELEASE_USERS_STORE_SET_MISMATCH",
  );
  const customRoles = assertCustomRoleProjections(body.customRoles, oracle);
  const invites = assertInviteProjections(body.invites, oracle);
  const roleOptions = assertRoleOptionProjections(body.roleOptions, oracle);
  const capabilities = assertCapabilityOptionProjections(
    body.capabilityOptions,
  );
  assertTenantBoundReferences(body, oracle, { validateUsers: true });
  return Object.freeze({
    capabilityCount: capabilities.count,
    capabilityKeySetDigest: capabilities.keySetDigest,
    customRoleCount: customRoles.count,
    inviteCount: invites.count,
    inviteSemanticSetDigest: invites.semanticSetDigest,
    roleOptionCount: roleOptions.count,
    rolePermissionSetDigest: roleOptions.permissionSetDigest,
    storeCount: stores.count,
    storeIdSetDigest: stores.idSetDigest,
    userCount: users.count,
    userIdSetDigest: users.idSetDigest,
    userSemanticSetDigest: users.semanticSetDigest,
  });
}

export function assertCurrentReleaseUsersNetworkProjectionForTestOnly({
  body,
  scopeOracle,
}) {
  return assertUsersNetworkProjection(body, normalizeScopeOracle(scopeOracle));
}

function assertCriticalReadProjection(result, probe, oracle) {
  const body = parseJson(
    result,
    `CURRENT_RELEASE_${probe.module.replaceAll("-", "_").toUpperCase()}_${probe.name.replaceAll("-", "_").toUpperCase()}_RESPONSE_INVALID`,
  );
  const schema =
    CURRENT_RELEASE_RESPONSE_SCHEMAS[`${probe.module}/${probe.name}`];
  if (!schema) fail("CURRENT_RELEASE_CRITICAL_READ_SCHEMA_MISSING");
  if (schema.kind === "EXACT_STORES") {
    const storeSet = assertExactIdSet(
      body,
      oracle.storeIds,
      "CURRENT_RELEASE_STORES_ID_SET_MISMATCH",
    );
    return Object.freeze({
      itemCount: storeSet.count,
      keySetDigest: sha256("[]"),
      scopeSetDigest: storeSet.idSetDigest,
      topLevelKind: "ARRAY",
    });
  }
  if (schema.kind === "EXACT_ENTITY_ARRAY") {
    const entitySet = assertExactIdSet(
      body,
      oracle[schema.entitySet],
      "CURRENT_RELEASE_GAMIFICATION_ENTITY_SET_MISMATCH",
    );
    assertTenantBoundReferences(body, oracle, { validateUsers: false });
    return Object.freeze({
      itemCount: entitySet.count,
      keySetDigest: sha256("[]"),
      scopeSetDigest: entitySet.idSetDigest,
      topLevelKind: "ARRAY",
    });
  }
  if (!body || typeof body !== "object") {
    fail("CURRENT_RELEASE_CRITICAL_READ_PROJECTION_INVALID", {
      module: probe.module,
      probeName: probe.name,
    });
  }
  if (Array.isArray(body)) {
    fail("CURRENT_RELEASE_CRITICAL_READ_PROJECTION_INVALID", {
      module: probe.module,
      probeName: probe.name,
    });
  }
  for (const required of schema.requiredArrays ?? []) {
    if (!Array.isArray(body[required])) {
      fail("CURRENT_RELEASE_CRITICAL_READ_SCHEMA_INVALID", {
        module: probe.module,
        probeName: probe.name,
        requiredKeyDigest: sha256(required),
      });
    }
  }
  for (const required of schema.requiredObjects ?? []) {
    if (
      !body[required] ||
      typeof body[required] !== "object" ||
      Array.isArray(body[required])
    ) {
      fail("CURRENT_RELEASE_CRITICAL_READ_SCHEMA_INVALID", {
        module: probe.module,
        probeName: probe.name,
        requiredKeyDigest: sha256(required),
      });
    }
  }
  for (const required of schema.requiredNumbers ?? []) {
    if (!Number.isSafeInteger(body[required]) || body[required] < 0) {
      fail("CURRENT_RELEASE_CRITICAL_READ_SCHEMA_INVALID", {
        module: probe.module,
        probeName: probe.name,
        requiredKeyDigest: sha256(required),
      });
    }
  }
  const boundEntitySets = (schema.boundArrays ?? []).map((binding) =>
    assertBoundEntityArray(body, binding, oracle, probe),
  );
  const semanticMarkerDigest =
    schema.kind === "GAMIFICATION_WORKSPACE"
      ? assertGamificationWorkspaceProjection(body, oracle)
      : probe.module === "staff-motivation" && probe.name === "discipline"
        ? assertDisciplinePolicyProjection(body, oracle)
        : sha256("NOT_APPLICABLE");
  if (schema.kind === "PAGED_PRODUCTS") {
    const products = assertIdSubset(
      body.items,
      oracle.productIds,
      "CURRENT_RELEASE_PRODUCTS_ID_SET_MISMATCH",
    );
    if (
      body.total !== oracle.productIds.length ||
      (oracle.productIds.length > 0 && products.count === 0)
    ) {
      fail("CURRENT_RELEASE_PRODUCTS_TOTAL_MISMATCH", {
        actualCount: body.total,
        expectedCount: oracle.productIds.length,
      });
    }
  }
  if (Array.isArray(body.stores)) {
    assertExactIdSet(
      body.stores,
      oracle.storeIds,
      "CURRENT_RELEASE_REPORT_STORE_SET_MISMATCH",
    );
  }
  if (body.accessScope !== undefined && body.accessScope !== "NETWORK") {
    fail("CURRENT_RELEASE_REPORT_SCOPE_MISMATCH");
  }
  assertTenantBoundReferences(body, oracle, {
    validateUsers: probe.module !== "gamification",
  });
  const keys = Object.keys(body).sort(compareUtf8Bytes);
  const semanticKeys = keys.filter(
    (key) => !["message", "ok", "status"].includes(key),
  );
  if (semanticKeys.length === 0) {
    fail("CURRENT_RELEASE_CRITICAL_READ_PROJECTION_INVALID", {
      module: probe.module,
      probeName: probe.name,
    });
  }
  return Object.freeze({
    boundEntitySetDigest: sha256(stableJson(boundEntitySets)),
    itemCount: Array.isArray(body.rows)
      ? body.rows.length
      : Array.isArray(body.items)
        ? body.items.length
        : null,
    keySetDigest: sha256(stableJson(keys)),
    semanticMarkerDigest,
    scopeSetDigest: sha256(
      stableJson({ stores: oracle.storeIds, users: oracle.userIds }),
    ),
    topLevelKind: "OBJECT",
  });
}

export function assertCurrentReleaseCriticalReadForTestOnly({
  body,
  module,
  name,
  scopeOracle,
}) {
  const probe = CURRENT_RELEASE_CRITICAL_READS.find(
    (candidate) => candidate.module === module && candidate.name === name,
  );
  if (!probe) fail("CURRENT_RELEASE_CRITICAL_READ_SCHEMA_MISSING");
  const encoded = Buffer.from(JSON.stringify(body));
  return assertCriticalReadProjection(
    Object.freeze({
      body: encoded,
      bodySha256: sha256(encoded),
      bytes: encoded.length,
      contentType: "application/json",
      status: 200,
    }),
    probe,
    normalizeScopeOracle(scopeOracle),
  );
}

export async function executeCurrentReleaseHttpAcceptance({
  apiPort,
  expectedMigrationCount,
  expectedMigrationHead,
  fetchImpl = fetch,
  loginEmail,
  loginPassword,
  onFixtureCreated = () => {},
  refreshNotificationOracle,
  releaseSha,
  scopeOracle,
  tenantSlug,
  webPort,
  withReversibleWrite = false,
}) {
  if (typeof loginEmail !== "string" || !loginEmail.includes("@")) {
    fail("CURRENT_RELEASE_LOGIN_EMAIL_REQUIRED");
  }
  if (typeof loginPassword !== "string" || loginPassword.length < 8) {
    fail("CURRENT_RELEASE_LOGIN_PASSWORD_REQUIRED");
  }
  const apiBase = `http://${LOOPBACK}:${apiPort}`;
  const webBase = `http://${LOOPBACK}:${webPort}`;
  let oracle = normalizeScopeOracle(scopeOracle);
  if (
    refreshNotificationOracle !== undefined &&
    typeof refreshNotificationOracle !== "function"
  ) {
    fail("CURRENT_RELEASE_NOTIFICATION_ORACLE_REFRESH_INVALID");
  }
  const probes = [];

  const version = await request({
    baseUrl: apiBase,
    fetchImpl,
    path: "/version",
  });
  probes.push(aggregateProbe("api-version", version.result));
  const versionBody = parseJson(
    version.result,
    "CURRENT_RELEASE_VERSION_INVALID",
  );
  if (versionBody?.release?.sha !== releaseSha) {
    fail("CURRENT_RELEASE_VERSION_IDENTITY_MISMATCH");
  }

  const ready = await request({
    baseUrl: apiBase,
    fetchImpl,
    path: "/health/ready",
  });
  probes.push(aggregateProbe("api-readiness", ready.result));
  const readyBody = parseJson(
    ready.result,
    "CURRENT_RELEASE_READINESS_INVALID",
  );
  if (
    readyBody?.ok !== true ||
    readyBody?.release?.sha !== releaseSha ||
    readyBody?.dependencies?.database?.migration !== expectedMigrationHead ||
    readyBody?.dependencies?.database?.migrationCount !== expectedMigrationCount
  ) {
    fail("CURRENT_RELEASE_READINESS_IDENTITY_MISMATCH");
  }

  const webIdentity = await request({
    baseUrl: webBase,
    fetchImpl,
    path: "/api/release-identity",
  });
  probes.push(aggregateProbe("web-release-identity", webIdentity.result));
  const webIdentityBody = parseJson(
    webIdentity.result,
    "CURRENT_RELEASE_WEB_IDENTITY_INVALID",
  );
  const cacheControl = webIdentity.response.headers.get("cache-control") ?? "";
  if (
    webIdentityBody?.ok !== true ||
    webIdentityBody?.release?.sha !== releaseSha ||
    webIdentityBody?.release?.webBuildId !== releaseSha ||
    !cacheControl.toLowerCase().includes("no-store")
  ) {
    fail("CURRENT_RELEASE_WEB_IDENTITY_MISMATCH");
  }

  const unauthenticatedSurface = [
    ...CURRENT_RELEASE_CRITICAL_READS.map((probe) =>
      Object.freeze({
        baseUrl: probe.target === "API" ? apiBase : webBase,
        name: `unauthenticated-${probe.module}-${probe.name}`,
        path: probe.path,
      }),
    ),
  ];
  for (const unauthenticatedProbe of unauthenticatedSurface) {
    const unauthorized = await request({
      baseUrl: unauthenticatedProbe.baseUrl,
      fetchImpl,
      path: unauthenticatedProbe.path,
    });
    probes.push(
      aggregateProbe(unauthenticatedProbe.name, unauthorized.result, [401]),
    );
  }

  const login = await request({
    baseUrl: webBase,
    body: { email: loginEmail, password: loginPassword, rememberMe: false },
    fetchImpl,
    method: "POST",
    path: "/api/auth/login",
  });
  probes.push(aggregateProbe("web-login", login.result, [200, 201]));
  const loginBody = parseJson(login.result, "CURRENT_RELEASE_LOGIN_INVALID");
  if (
    loginBody?.user?.tenantSlug !== tenantSlug ||
    loginBody?.user?.id !== oracle.loginUserId ||
    loginBody?.user?.isPlatformAdmin === true
  ) {
    fail("CURRENT_RELEASE_LOGIN_TENANT_MISMATCH");
  }
  const setCookie = login.response.headers.get("set-cookie") ?? "";
  if (!/HttpOnly/iu.test(setCookie) || !/Secure/iu.test(setCookie)) {
    fail("CURRENT_RELEASE_LOGIN_COOKIE_INVALID");
  }
  const cookie = setCookie.split(";", 1)[0];
  const token = tokenFromCookie(cookie);

  const me = await request({
    baseUrl: webBase,
    cookie,
    fetchImpl,
    path: "/api/auth/me",
  });
  probes.push(aggregateProbe("web-auth-me", me.result));
  const meBody = parseJson(me.result, "CURRENT_RELEASE_AUTH_ME_INVALID")?.user;
  if (
    meBody?.tenantSlug !== tenantSlug ||
    meBody?.id !== oracle.loginUserId ||
    meBody?.role !== "OWNER" ||
    meBody?.accessScope !== "NETWORK" ||
    meBody?.isPlatformAdmin === true
  ) {
    fail("CURRENT_RELEASE_AUTH_ME_SCOPE_MISMATCH");
  }

  let usersProjection = null;
  const moduleCounts = {};
  const readProjections = [];
  for (const probe of CURRENT_RELEASE_CRITICAL_READS) {
    const response = await request({
      baseUrl: probe.target === "API" ? apiBase : webBase,
      cookie: probe.target === "WEB" ? cookie : undefined,
      fetchImpl,
      path: probe.path,
      token: probe.target === "API" ? token : undefined,
    });
    probes.push(
      aggregateProbe(`${probe.module}-${probe.name}`, response.result),
    );
    if (
      probe.module === "communications" &&
      probe.name === "notifications" &&
      refreshNotificationOracle
    ) {
      oracle = normalizeScopeOracle(await refreshNotificationOracle(oracle));
    }
    moduleCounts[probe.module] = (moduleCounts[probe.module] ?? 0) + 1;
    readProjections.push(
      Object.freeze({
        module: probe.module,
        name: probe.name,
        ...assertCriticalReadProjection(response.result, probe, oracle),
      }),
    );
    if (probe.validator === "USERS_NETWORK_PROJECTION") {
      usersProjection = assertUsersNetworkProjection(
        parseJson(response.result, "CURRENT_RELEASE_USERS_RESPONSE_INVALID"),
        oracle,
      );
    }
  }

  let fixture = null;
  if (withReversibleWrite) {
    const marker = randomBytes(16).toString("hex");
    const title = `__current_release_acceptance_${marker}`;
    await onFixtureCreated({ id: null, title });
    const create = await request({
      baseUrl: webBase,
      body: {
        description: "disposable current-release runtime acceptance",
        roleScope: "ALL_STAFF",
        sections: [
          {
            description: null,
            id: "current-release-section",
            items: [
              {
                evidenceRequired: false,
                id: "current-release-item",
                instruction: null,
                required: true,
                score: 1,
                timing: {
                  affectsDiscipline: false,
                  mode: "NONE",
                  offsetMinutes: null,
                  timeOfDay: null,
                  toleranceMinutes: 0,
                },
                title: "disposable acceptance item",
                valueType: "CHECKBOX",
              },
            ],
            title: "Current release acceptance",
          },
        ],
        shiftKind: "CUSTOM",
        status: "DRAFT",
        storeId: null,
        title,
      },
      cookie,
      fetchImpl,
      method: "POST",
      path: "/api/staff/checklist-templates",
    });
    probes.push(aggregateProbe("fixture-create", create.result, [200, 201]));
    const created = parseJson(
      create.result,
      "CURRENT_RELEASE_FIXTURE_CREATE_INVALID",
    );
    if (typeof created?.id !== "string" || created.title !== title) {
      fail("CURRENT_RELEASE_FIXTURE_CREATE_INVALID");
    }
    fixture = Object.freeze({ id: created.id, title });
    await onFixtureCreated(fixture);
    const remove = await request({
      baseUrl: webBase,
      cookie,
      fetchImpl,
      method: "DELETE",
      path: `/api/staff/checklist-templates/${encodeURIComponent(created.id)}`,
    });
    probes.push(aggregateProbe("fixture-delete", remove.result));
    const removed = parseJson(
      remove.result,
      "CURRENT_RELEASE_FIXTURE_DELETE_INVALID",
    );
    if (removed?.id !== created.id || removed?.deleted !== true) {
      fail("CURRENT_RELEASE_FIXTURE_DELETE_INVALID");
    }
  }

  return Object.freeze({
    fixture,
    moduleCounts: Object.freeze(moduleCounts),
    probes: Object.freeze(probes),
    readProjections: Object.freeze(readProjections),
    usersProjection,
  });
}

export async function inspectCurrentReleaseDatabase(
  client,
  expected,
  urlIdentity,
  loginEmail,
) {
  const identity = await client.query(`
    SELECT current_database() AS "databaseName",
           COALESCE(host(inet_server_addr()), '') AS "serverAddress",
           inet_server_port() AS "serverPort",
           (SELECT system_identifier FROM pg_control_system())::text AS "systemIdentifier",
           current_setting('transaction_read_only') AS "transactionReadOnly",
           session_user AS "sessionUser",
           current_user AS "currentUser",
           runtime.oid::text AS "runtimeRoleOid",
           target_database.datdba::text AS "databaseOwnerOid",
           runtime.rolcanlogin AS "runtimeCanLogin",
           runtime.rolinherit AS "runtimeInherit",
           runtime.rolsuper AS "runtimeSuperuser",
           runtime.rolbypassrls AS "runtimeBypassRls",
           runtime.rolcreatedb AS "runtimeCreateDatabase",
           runtime.rolcreaterole AS "runtimeCreateRole",
           runtime.rolreplication AS "runtimeReplication",
           COALESCE(cardinality(runtime.rolconfig), 0)::int
             AS "runtimeRoleConfigCount",
           public_schema.nspowner::text AS "publicSchemaOwnerOid",
           (SELECT COUNT(*)::int FROM pg_auth_members membership
            WHERE membership.member = runtime.oid)
              AS "runtimeMembershipCount",
           (SELECT COUNT(*)::int FROM pg_auth_members membership
            WHERE membership.roleid = runtime.oid)
              AS "runtimeGrantedMembershipCount",
           (SELECT COUNT(*)::int
            FROM aclexplode(COALESCE(
              public_schema.nspacl,
              acldefault('n', public_schema.nspowner)
            )) grant_row
            WHERE grant_row.privilege_type = 'CREATE'
              AND grant_row.grantee <> runtime.oid)
             AS "foreignPublicSchemaCreateGrantCount",
           (SELECT COUNT(*)::int
            FROM pg_class relation
            JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
            CROSS JOIN LATERAL aclexplode(relation.relacl) grant_row
            WHERE namespace.nspname = 'public'
              AND relation.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
              AND grant_row.grantee = 0)
             AS "publicRelationGrantCount",
           (SELECT COUNT(*)::int
            FROM pg_default_acl defaults
            CROSS JOIN LATERAL aclexplode(defaults.defaclacl) grant_row
            WHERE defaults.defaclrole = runtime.oid
              AND defaults.defaclnamespace = public_schema.oid
              AND defaults.defaclobjtype IN ('r', 'S')
              AND grant_row.grantee = 0)
             AS "publicDefaultDataGrantCount",
           (SELECT COUNT(*)::int FROM pg_class object
            JOIN pg_namespace namespace ON namespace.oid = object.relnamespace
            WHERE namespace.nspname = 'public' AND object.relowner <> runtime.oid)
             AS "classOwnerMismatchCount",
           (SELECT COUNT(*)::int FROM pg_proc object
            JOIN pg_namespace namespace ON namespace.oid = object.pronamespace
            WHERE namespace.nspname = 'public' AND object.proowner <> runtime.oid)
             AS "functionOwnerMismatchCount",
           (SELECT COUNT(*)::int FROM pg_type object
            JOIN pg_namespace namespace ON namespace.oid = object.typnamespace
            WHERE namespace.nspname = 'public' AND object.typowner <> runtime.oid)
             AS "typeOwnerMismatchCount"
    FROM pg_database target_database
    JOIN pg_roles runtime ON runtime.rolname = session_user
    JOIN pg_namespace public_schema ON public_schema.nspname = 'public'
    WHERE target_database.datname = current_database()
  `);
  const migrations = await client.query(`
    SELECT migration_name AS "migrationName"
    FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    ORDER BY finished_at ASC, migration_name ASC
  `);
  const unfinished = await client.query(`
    SELECT COUNT(*)::int AS count
    FROM "_prisma_migrations"
    WHERE finished_at IS NULL AND rolled_back_at IS NULL
  `);
  const sessions = await client.query(`
    SELECT COUNT(*)::int AS count
    FROM pg_stat_activity
    WHERE datname = current_database() AND pid <> pg_backend_pid()
  `);
  const subject = await client.query(
    `SELECT u.id AS "userId", t.id AS "tenantId"
     FROM "User" u
     JOIN "Tenant" t ON t.id = u."tenantId"
     WHERE lower(u.email) = lower($1)
       AND u."isActive" = true
       AND u.role = 'OWNER'
       AND u."isPlatformAdmin" = false
       AND u."accessScope" = 'NETWORK'
       AND t.slug = $2
       AND t.status = 'ACTIVE'
     LIMIT 2`,
    [loginEmail, expected.tenantSlug],
  );
  const aggregates = await client.query(
    `SELECT
       (SELECT COUNT(*)::int FROM "Store" s WHERE s."tenantId" = t.id) AS "storeCount",
       (SELECT COUNT(*)::int FROM "User" u WHERE u."tenantId" = t.id) AS "userCount",
       (SELECT COUNT(*)::int FROM "UserAccessRole" r WHERE r."tenantId" = t.id) AS "customRoleCount",
       (SELECT COUNT(*)::int FROM "User" u
        WHERE u."tenantId" = t.id AND u."isActive" = true
          AND u."accessScope" IS NULL) AS "activeUnresolvedScopeCount",
       (SELECT COUNT(*)::int FROM "User" u
        WHERE u."tenantId" = t.id AND u."isActive" = true
          AND u."accessScope" = 'NETWORK') AS "activeNetworkScopeCount",
       (SELECT COUNT(*)::int FROM "User" u
        WHERE u."tenantId" = t.id AND u."isActive" = true
          AND u."accessScope" = 'STORES') AS "activeStoresScopeCount"
     FROM "Tenant" t WHERE t.slug = $1`,
    [expected.tenantSlug],
  );
  const classification = await client.query(
    `SELECT u.role::text AS role,
            u."isPlatformAdmin" AS "isPlatformAdmin",
            u."isActive" AS "isActive",
            COALESCE(u."accessScope"::text, 'NULL') AS "accessScope",
            COUNT(*)::int AS "userCount",
            COUNT(*) FILTER (WHERE COALESCE(accesses.count, 0) > 0)::int
              AS "usersWithStoreAccess",
            COALESCE(SUM(accesses.count), 0)::int AS "storeAccessRows"
     FROM "User" u
     JOIN "Tenant" t ON t.id = u."tenantId"
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS count
       FROM "UserStoreAccess" access
       WHERE access."userId" = u.id
     ) accesses ON true
     WHERE t.slug = $1
     GROUP BY u.role, u."isPlatformAdmin", u."isActive", u."accessScope"
     ORDER BY u.role, u."isPlatformAdmin", u."isActive", u."accessScope"`,
    [expected.tenantSlug],
  );
  const scopeCatalog = await client.query(
    `SELECT
       ARRAY(SELECT s.id::text FROM "Store" s
             WHERE s."tenantId" = $1 ORDER BY s.id COLLATE "C") AS "storeIds",
       ARRAY(SELECT u.id::text FROM "User" u
             WHERE u."tenantId" = $1 AND u."isActive" = true
               AND u."isPlatformAdmin" = false
             ORDER BY u.id COLLATE "C") AS "activeUserIds",
       ARRAY(SELECT u.id::text FROM "User" u
             WHERE u."tenantId" = $1 AND u."isActive" = true
               AND u."isPlatformAdmin" = false
               AND u.role IN (
                 'CLUB_ADMINISTRATOR',
                 'SENIOR_ADMINISTRATOR',
                 'CLUB_MANAGER'
               )
             ORDER BY u.id COLLATE "C") AS "disciplineUserIds",
       ARRAY(SELECT u.id::text FROM "User" u
             WHERE u."tenantId" = $1 AND u."isPlatformAdmin" = false
             ORDER BY u.id COLLATE "C") AS "userIds",
       ARRAY(SELECT u.id::text FROM "User" u
             WHERE u."tenantId" = $1
             ORDER BY u.id COLLATE "C") AS "tenantReferenceUserIds",
       ARRAY(SELECT r.id::text FROM "UserAccessRole" r
             WHERE r."tenantId" = $1 ORDER BY r.id COLLATE "C") AS "customRoleIds",
       ARRAY(SELECT i.id::text FROM "UserInvite" i
             WHERE i."tenantId" = $1 AND i."acceptedAt" IS NULL
               AND i."revokedAt" IS NULL AND i."expiresAt" > clock_timestamp()
             ORDER BY i."createdAt" DESC, i.id COLLATE "C"
             LIMIT 20) AS "inviteIds",
       COALESCE((
         SELECT jsonb_agg(
           jsonb_build_object(
             'id', u.id::text,
             'role', u.role::text,
             'isActive', u."isActive",
             'isPlatformAdmin', u."isPlatformAdmin",
             'scope', u."accessScope"::text,
             'customRoleId', u."customRoleId"::text,
             'storeIds', (
               SELECT COALESCE(
                 jsonb_agg(store_access."storeId"::text ORDER BY store_access."storeId" COLLATE "C"),
                 '[]'::jsonb
               )
               FROM "UserStoreAccess" store_access
               WHERE store_access."userId" = u.id
             )
           ) ORDER BY u.id COLLATE "C"
         )
         FROM "User" u
         WHERE u."tenantId" = $1 AND u."isPlatformAdmin" = false
       ), '[]'::jsonb) AS "userSemantics",
       COALESCE((
         SELECT jsonb_agg(
           jsonb_build_object(
             'id', custom_role.id::text,
             'permissions', to_jsonb(custom_role.permissions)
           ) ORDER BY custom_role.id COLLATE "C"
         )
         FROM "UserAccessRole" custom_role
         WHERE custom_role."tenantId" = $1
       ), '[]'::jsonb) AS "customRoleSemantics",
       COALESCE((
         SELECT jsonb_agg(
           jsonb_build_object(
             'role', role_override.role::text,
             'permissions', to_jsonb(role_override.permissions)
           ) ORDER BY role_override.role::text COLLATE "C"
         )
         FROM "UserRoleOverride" role_override
         WHERE role_override."tenantId" = $1
       ), '[]'::jsonb) AS "roleOverrideSemantics",
       COALESCE((
         SELECT jsonb_agg(
           invite.semantic
           ORDER BY invite.created_at DESC, invite.id COLLATE "C"
         )
         FROM (
           SELECT i.id::text AS id,
                  i."createdAt" AS created_at,
                  jsonb_build_object(
                    'id', i.id::text,
                    'role', i.role::text,
                    'scope', i."accessScope"::text,
                    'customRoleId', i."customRoleId"::text,
                    'storeIds', to_jsonb(i."storeIds")
                  ) AS semantic
           FROM "UserInvite" i
           WHERE i."tenantId" = $1 AND i."acceptedAt" IS NULL
             AND i."revokedAt" IS NULL AND i."expiresAt" > clock_timestamp()
           ORDER BY i."createdAt" DESC, i.id COLLATE "C"
           LIMIT 20
         ) invite
       ), '[]'::jsonb) AS "inviteSemantics",
       ARRAY(SELECT profile.id::text
             FROM "GuestGameProfile" profile
             WHERE profile."tenantId" = $1
             ORDER BY profile."updatedAt" DESC, profile."createdAt" DESC,
                      profile.id DESC
             LIMIT 50) AS "profileIds",
       ARRAY(SELECT card.id::text
             FROM "GuestGamePromoCard" card
             WHERE card."tenantId" = $1
             ORDER BY card."createdAt" DESC, card.id DESC) AS "promoCardIds",
       ARRAY(SELECT event.id::text
             FROM "GuestGameEvent" event
             WHERE event."tenantId" = $1
             ORDER BY event."occurredAt" DESC, event."createdAt" DESC,
                      event.id DESC
             LIMIT 100) AS "eventIds",
       (SELECT store.id::text
        FROM "Store" store
        WHERE store."tenantId" = $1 AND store."isActive" = true
        ORDER BY
          CASE
            WHEN lower(concat_ws(' ', store.name, store."publicSlug",
              store."externalDomain", store."externalClubId", store.address,
              store.city)) LIKE '%1337%' THEN 0
            WHEN store."gamificationEnabled" = true THEN 1
            ELSE 2
          END,
          store."gamificationEnabled" DESC,
          store.name COLLATE "C" ASC,
          store."createdAt" ASC,
          store.id COLLATE "C" ASC
        LIMIT 1) AS "pilotStoreId",
       jsonb_build_object(
         'profilesCount', (SELECT COUNT(*)::int FROM (
           SELECT profile.id
           FROM "GuestGameProfile" profile
           WHERE profile."tenantId" = $1
           ORDER BY profile."updatedAt" DESC, profile."createdAt" DESC,
                    profile.id DESC
           LIMIT 50
         ) profiles),
         'activeLootBoxes', (SELECT COUNT(*)::int FROM "GuestGameLootBox" box
           WHERE box."tenantId" = $1 AND box.status = 'ACTIVE'),
         'activeMissions', (SELECT COUNT(*)::int FROM "GuestGameMission" mission
           WHERE mission."tenantId" = $1 AND mission.status = 'ACTIVE'),
         'activeSeasons', (SELECT COUNT(*)::int FROM "GuestGameSeason" season
           WHERE season."tenantId" = $1 AND season.status = 'ACTIVE'),
         'pendingRewards', (SELECT COUNT(*)::int FROM (
           SELECT reward.status
           FROM "GuestGameReward" reward
           WHERE reward."tenantId" = $1
           ORDER BY reward."qualifiedAt" DESC, reward."createdAt" DESC,
                    reward.id DESC
           LIMIT 100
         ) rewards WHERE rewards.status = 'PENDING'),
         'approvedRewards', (SELECT COUNT(*)::int FROM (
           SELECT reward.status
           FROM "GuestGameReward" reward
           WHERE reward."tenantId" = $1
           ORDER BY reward."qualifiedAt" DESC, reward."createdAt" DESC,
                    reward.id DESC
           LIMIT 100
         ) rewards WHERE rewards.status = 'APPROVED'),
         'paidRewards', (SELECT COUNT(*)::int FROM (
           SELECT reward.status
           FROM "GuestGameReward" reward
           WHERE reward."tenantId" = $1
           ORDER BY reward."qualifiedAt" DESC, reward."createdAt" DESC,
                    reward.id DESC
           LIMIT 100
         ) rewards WHERE rewards.status = 'PAID'),
         'expiredRewards', (SELECT COUNT(*)::int FROM (
           SELECT reward.status
           FROM "GuestGameReward" reward
           WHERE reward."tenantId" = $1
           ORDER BY reward."qualifiedAt" DESC, reward."createdAt" DESC,
                    reward.id DESC
           LIMIT 100
         ) rewards WHERE rewards.status = 'EXPIRED'),
         'rewardCount', (SELECT COUNT(*)::int FROM (
           SELECT reward.id
           FROM "GuestGameReward" reward
           WHERE reward."tenantId" = $1
           ORDER BY reward."qualifiedAt" DESC, reward."createdAt" DESC,
                    reward.id DESC
           LIMIT 100
         ) rewards),
         'eventCount', (SELECT COUNT(*)::int FROM (
           SELECT event.id
           FROM "GuestGameEvent" event
           WHERE event."tenantId" = $1
           ORDER BY event."occurredAt" DESC, event."createdAt" DESC,
                    event.id DESC
           LIMIT 100
         ) events)
       ) AS "gamificationWorkspaceSummary",
       ARRAY(SELECT p.id::text FROM "Product" p
             WHERE p."tenantId" = $1 AND p."isActive" = true
             ORDER BY p.id COLLATE "C") AS "productIds",
       ARRAY(SELECT m.id::text FROM "GuestGameMission" m
             WHERE m."tenantId" = $1 ORDER BY m.id COLLATE "C") AS "missionIds",
       ARRAY(SELECT box.id::text FROM "GuestGameLootBox" box
             WHERE box."tenantId" = $1 ORDER BY box.id COLLATE "C") AS "lootBoxIds",
       ARRAY(SELECT season.id::text FROM "GuestGameSeason" season
             WHERE season."tenantId" = $1 ORDER BY season.id COLLATE "C") AS "seasonIds",
       ARRAY(SELECT reward.id::text FROM "GuestGameReward" reward
             WHERE reward."tenantId" = $1
             ORDER BY reward."qualifiedAt" DESC, reward."createdAt" DESC,
                      reward.id DESC
             LIMIT 100) AS "rewardIds",
       ARRAY(SELECT entity.id::text FROM "StaffMember" entity
             WHERE entity."tenantId" = $1 ORDER BY entity.id COLLATE "C") AS "staffMemberIds",
       ARRAY(SELECT entity.id::text FROM "StaffTask" entity
             WHERE entity."tenantId" = $1 ORDER BY entity.id COLLATE "C") AS "staffTaskIds",
       ARRAY(SELECT entity.id::text FROM "StaffChecklistRun" entity
             WHERE entity."tenantId" = $1 ORDER BY entity.id COLLATE "C") AS "checklistRunIds",
       ARRAY(SELECT entity.id::text FROM "StaffChecklistTemplate" entity
             WHERE entity."tenantId" = $1 ORDER BY entity.id COLLATE "C") AS "checklistTemplateIds",
       ARRAY(SELECT entity.id::text FROM "StaffTaskTemplate" entity
             WHERE entity."tenantId" = $1 ORDER BY entity.id COLLATE "C") AS "taskTemplateIds",
       ARRAY(SELECT entity.id::text FROM "StaffTaskRecurringRule" entity
             WHERE entity."tenantId" = $1 ORDER BY entity.id COLLATE "C") AS "taskRuleIds",
       ARRAY(SELECT entity.id::text FROM "StaffTaskRecurringRuleRun" entity
             WHERE entity."tenantId" = $1 ORDER BY entity.id COLLATE "C") AS "taskRuleRunIds",
       ARRAY(SELECT entity.id::text FROM "StaffDisciplinePolicy" entity
             WHERE entity."tenantId" = $1 ORDER BY entity.id COLLATE "C") AS "disciplinePolicyIds",
       ARRAY(SELECT entity.id::text FROM "StaffDisciplineRule" entity
             WHERE entity."tenantId" = $1 ORDER BY entity.id COLLATE "C") AS "disciplineRuleIds",
       ARRAY(SELECT entity.id::text FROM "StaffDisciplineRecord" entity
             WHERE entity."tenantId" = $1 AND entity.status = 'ACTIVE'
             ORDER BY entity.id COLLATE "C") AS "disciplineRecordIds",
       ARRAY(SELECT entity.id::text FROM "StaffSalaryScheme" entity
             WHERE entity."tenantId" = $1 ORDER BY entity.id COLLATE "C") AS "salarySchemeIds",
       ARRAY(SELECT entity.id::text FROM "StaffSalaryPeriod" entity
             WHERE entity."tenantId" = $1 ORDER BY entity.id COLLATE "C") AS "salaryPeriodIds",
       ARRAY(SELECT entity.id::text FROM "StaffShiftRegulation" entity
             WHERE entity."tenantId" = $1 ORDER BY entity.id COLLATE "C") AS "shiftRegulationIds",
       ARRAY(SELECT entity.id::text FROM "StaffKnowledgeArticle" entity
             WHERE entity."tenantId" = $1 ORDER BY entity.id COLLATE "C") AS "knowledgeArticleIds",
       ARRAY(SELECT entity.id::text FROM "StaffTrainingCourse" entity
             WHERE entity."tenantId" = $1 ORDER BY entity.id COLLATE "C") AS "trainingCourseIds",
       ARRAY(SELECT entity.id::text FROM "StaffAssessment" entity
             WHERE entity."tenantId" = $1 ORDER BY entity.id COLLATE "C") AS "assessmentIds",
       ARRAY(SELECT entity.id::text FROM "StaffAssessmentResult" entity
             WHERE entity."tenantId" = $1 ORDER BY entity.id COLLATE "C") AS "assessmentResultIds",
       ARRAY(SELECT entity.id::text FROM "StaffOnboardingPlan" entity
             WHERE entity."tenantId" = $1 ORDER BY entity.id COLLATE "C") AS "onboardingPlanIds",
       ARRAY(SELECT entity.id::text FROM "StaffNotification" entity
             WHERE entity."tenantId" = $1
               AND (entity."targetUserId" IS NULL OR entity."targetUserId" = $2)
             ORDER BY entity.id COLLATE "C"
             LIMIT 5000) AS "notificationIds",
       ARRAY(SELECT entity.id::text FROM "StaffChatChannel" entity
             WHERE entity."tenantId" = $1 ORDER BY entity.id COLLATE "C") AS "chatChannelIds",
       ARRAY(SELECT entity.id::text FROM "StaffChatMessage" entity
             WHERE entity."tenantId" = $1 ORDER BY entity.id COLLATE "C") AS "chatMessageIds"`,
    [subject.rows[0]?.tenantId ?? "", subject.rows[0]?.userId ?? ""],
  );
  const row = identity.rows[0];
  const head = migrations.rows.at(-1)?.migrationName ?? null;
  if (
    row?.databaseName !== urlIdentity.databaseName ||
    row?.serverAddress !== LOOPBACK ||
    Number(row?.serverPort) !== urlIdentity.port ||
    row?.systemIdentifier !== expected.expectedSystemIdentifier ||
    row?.sessionUser !== urlIdentity.roleName ||
    row?.currentUser !== urlIdentity.roleName ||
    row?.runtimeRoleOid !== row?.databaseOwnerOid ||
    row?.runtimeCanLogin !== true ||
    row?.runtimeInherit !== false ||
    row?.runtimeSuperuser !== false ||
    row?.runtimeBypassRls !== false ||
    row?.runtimeCreateDatabase !== false ||
    row?.runtimeCreateRole !== false ||
    row?.runtimeReplication !== false ||
    Number(row?.runtimeRoleConfigCount) !== 0 ||
    Number(row?.runtimeMembershipCount) !== 0 ||
    Number(row?.runtimeGrantedMembershipCount) !== 0 ||
    row?.publicSchemaOwnerOid !== row?.runtimeRoleOid ||
    Number(row?.foreignPublicSchemaCreateGrantCount) !== 0 ||
    Number(row?.publicRelationGrantCount) !== 0 ||
    Number(row?.publicDefaultDataGrantCount) !== 0 ||
    Number(row?.classOwnerMismatchCount) !== 0 ||
    Number(row?.functionOwnerMismatchCount) !== 0 ||
    Number(row?.typeOwnerMismatchCount) !== 0
  ) {
    fail("CURRENT_RELEASE_DATABASE_RUNTIME_ROLE_ATTESTATION_FAILED");
  }
  if (row?.transactionReadOnly !== "off") {
    fail("CURRENT_RELEASE_DATABASE_READ_ONLY");
  }
  if (
    migrations.rowCount !== expected.expectedMigrationCount ||
    head !== expected.expectedMigrationHead ||
    Number(unfinished.rows[0]?.count) !== 0
  ) {
    fail("CURRENT_RELEASE_DATABASE_MIGRATION_STATE_MISMATCH");
  }
  if (Number(sessions.rows[0]?.count) !== 0) {
    fail("CURRENT_RELEASE_DATABASE_NOT_EXCLUSIVE");
  }
  if (aggregates.rowCount !== 1) {
    fail("CURRENT_RELEASE_TENANT_AGGREGATES_INVALID");
  }
  const aggregate = aggregates.rows[0];
  const classificationGroups = Object.freeze(
    classification.rows.map((group) =>
      Object.freeze({
        accessScope: group.accessScope,
        isActive: group.isActive === true,
        isPlatformAdmin: group.isPlatformAdmin === true,
        role: group.role,
        storeAccessRows: Number(group.storeAccessRows),
        userCount: Number(group.userCount),
        usersWithStoreAccess: Number(group.usersWithStoreAccess),
      }),
    ),
  );
  if (Number(aggregate.activeUnresolvedScopeCount) !== 0) {
    fail("CURRENT_RELEASE_ACTIVE_SCOPE_UNRESOLVED", {
      activeUnresolvedScopeCount: Number(aggregate.activeUnresolvedScopeCount),
      classificationGroups,
    });
  }
  if (subject.rowCount !== 1) {
    fail("CURRENT_RELEASE_LOGIN_SUBJECT_INVALID");
  }
  if (scopeCatalog.rowCount !== 1) {
    fail("CURRENT_RELEASE_SCOPE_ORACLE_INVALID");
  }
  const scopeRow = scopeCatalog.rows[0];
  const scopeOracle = normalizeScopeOracle({
    ...Object.fromEntries(
      CURRENT_RELEASE_ENTITY_SET_NAMES.map((name) => [name, scopeRow[name]]),
    ),
    activeUserIds: scopeRow.activeUserIds,
    customRoleIds: scopeRow.customRoleIds,
    customRoleSemantics: scopeRow.customRoleSemantics,
    disciplineUserIds: scopeRow.disciplineUserIds,
    eventIds: scopeRow.eventIds,
    gamificationWorkspaceSummary: scopeRow.gamificationWorkspaceSummary,
    inviteIds: scopeRow.inviteIds,
    inviteSemantics: scopeRow.inviteSemantics,
    loginUserId: subject.rows[0].userId,
    lootBoxIds: scopeRow.lootBoxIds,
    missionIds: scopeRow.missionIds,
    pilotStoreId: scopeRow.pilotStoreId,
    productIds: scopeRow.productIds,
    profileIds: scopeRow.profileIds,
    promoCardIds: scopeRow.promoCardIds,
    rewardIds: scopeRow.rewardIds,
    seasonIds: scopeRow.seasonIds,
    storeIds: scopeRow.storeIds,
    tenantId: subject.rows[0].tenantId,
    tenantReferenceUserIds: scopeRow.tenantReferenceUserIds,
    userIds: scopeRow.userIds,
    userSemantics: scopeRow.userSemantics,
    roleOverrideSemantics: scopeRow.roleOverrideSemantics,
  });
  const evidence = Object.freeze({
    activeNetworkScopeCount: Number(aggregate.activeNetworkScopeCount),
    activeStoresScopeCount: Number(aggregate.activeStoresScopeCount),
    activeUnresolvedScopeCount: Number(aggregate.activeUnresolvedScopeCount),
    classificationGroups,
    customRoleCount: Number(aggregate.customRoleCount),
    databaseIdentityDigest: sha256(
      `${row.databaseName}:${row.serverAddress}:${row.serverPort}`,
    ),
    migrationCount: migrations.rowCount,
    migrationHead: head,
    objectOwnerMismatchCounts: Object.freeze({
      classes: Number(row.classOwnerMismatchCount),
      functions: Number(row.functionOwnerMismatchCount),
      types: Number(row.typeOwnerMismatchCount),
    }),
    runtimeRoleOidDigest: sha256(row.runtimeRoleOid),
    runtimeRoleBoundary: Object.freeze({
      foreignPublicSchemaCreateGrantCount: Number(
        row.foreignPublicSchemaCreateGrantCount,
      ),
      membershipCount: Number(row.runtimeMembershipCount),
      reverseMembershipCount: Number(row.runtimeGrantedMembershipCount),
      publicDefaultDataGrantCount: Number(row.publicDefaultDataGrantCount),
      publicRelationGrantCount: Number(row.publicRelationGrantCount),
      roleConfigCount: Number(row.runtimeRoleConfigCount),
    }),
    scopeSetDigests: Object.freeze({
      activeUsers: sha256(stableJson(scopeOracle.activeUserIds)),
      customRoles: sha256(stableJson(scopeOracle.customRoleIds)),
      disciplineUsers: sha256(stableJson(scopeOracle.disciplineUserIds)),
      events: sha256(stableJson(scopeOracle.eventIds)),
      invites: sha256(stableJson(scopeOracle.inviteIds)),
      lootBoxes: sha256(stableJson(scopeOracle.lootBoxIds)),
      missions: sha256(stableJson(scopeOracle.missionIds)),
      products: sha256(stableJson(scopeOracle.productIds)),
      profiles: sha256(stableJson(scopeOracle.profileIds)),
      promoCards: sha256(stableJson(scopeOracle.promoCardIds)),
      rewards: sha256(stableJson(scopeOracle.rewardIds)),
      seasons: sha256(stableJson(scopeOracle.seasonIds)),
      stores: sha256(stableJson(scopeOracle.storeIds)),
      tenantReferenceUsers: sha256(
        stableJson(scopeOracle.tenantReferenceUserIds),
      ),
      users: sha256(stableJson(scopeOracle.userIds)),
    }),
    gamificationWorkspaceOracleDigest: sha256(
      stableJson({
        pilotStoreId: sha256(scopeOracle.pilotStoreId),
        summary: scopeOracle.gamificationWorkspaceSummary,
      }),
    ),
    userAuthoritySemanticDigests: Object.freeze({
      customRoles: sha256(stableJson(scopeOracle.customRoleSemantics)),
      invites: sha256(stableJson(scopeOracle.inviteSemantics)),
      roleOverrides: sha256(stableJson(scopeOracle.roleOverrideSemantics)),
      users: sha256(stableJson(scopeOracle.userSemantics)),
    }),
    tenantEntitySetDigests: Object.freeze(
      Object.fromEntries(
        CURRENT_RELEASE_ENTITY_SET_NAMES.map((name) => [
          name,
          sha256(stableJson(scopeOracle[name])),
        ]),
      ),
    ),
    storeCount: Number(aggregate.storeCount),
    systemIdentifierDigest: sha256(row.systemIdentifier),
    tenantSubjectDigest: sha256(
      `${subject.rows[0].tenantId}:${subject.rows[0].userId}:${expected.tenantSlug}`,
    ),
    userCount: Number(aggregate.userCount),
  });
  return Object.freeze({ evidence, scopeOracle });
}

export async function cleanupCurrentReleaseFixture(
  client,
  tenantSlug,
  fixture,
) {
  if (!fixture) {
    return Object.freeze({ directCleanupRequired: false, residue: 0 });
  }
  const tenant = await client.query(`SELECT id FROM "Tenant" WHERE slug = $1`, [
    tenantSlug,
  ]);
  if (tenant.rowCount !== 1) fail("CURRENT_RELEASE_CLEANUP_TENANT_MISMATCH");
  const tenantId = tenant.rows[0].id;
  const exactPredicate = fixture.id
    ? `id = $1 AND "tenantId" = $2 AND title = $3`
    : `"tenantId" = $1 AND title = $2`;
  const parameters = fixture.id
    ? [fixture.id, tenantId, fixture.title]
    : [tenantId, fixture.title];
  const before = await client.query(
    `SELECT COUNT(*)::int AS count FROM "StaffChecklistTemplate" WHERE ${exactPredicate}`,
    parameters,
  );
  const directCleanupRequired = Number(before.rows[0]?.count) !== 0;
  if (directCleanupRequired) {
    await client.query(
      `DELETE FROM "StaffChecklistTemplate" WHERE ${exactPredicate}`,
      parameters,
    );
  }
  const after = await client.query(
    `SELECT COUNT(*)::int AS count FROM "StaffChecklistTemplate"
     WHERE "tenantId" = $1 AND title = $2`,
    [tenantId, fixture.title],
  );
  const residue = Number(after.rows[0]?.count);
  if (residue !== 0) fail("CURRENT_RELEASE_FIXTURE_CLEANUP_FAILED");
  return Object.freeze({ directCleanupRequired, residue });
}

export async function finalizeCurrentReleaseRuntime(
  client,
  { apiPort, cgroupPath, fixture, tenantSlug, webPort },
  dependencies = {},
) {
  const waitForResidue =
    dependencies.waitForRuntimeResidueAbsence ?? waitForRuntimeResidueAbsence;
  const cleanupFixture =
    dependencies.cleanupCurrentReleaseFixture ?? cleanupCurrentReleaseFixture;
  const [drainResult, cleanupResult] = await Promise.allSettled([
    waitForResidue(client, [apiPort, webPort], cgroupPath),
    cleanupFixture(client, tenantSlug, fixture),
  ]);
  const failureReasonCodes = [];
  if (drainResult.status === "rejected") {
    failureReasonCodes.push(safeReason(drainResult.reason));
  }
  if (cleanupResult.status === "rejected") {
    failureReasonCodes.push(safeReason(cleanupResult.reason));
  }
  return Object.freeze({
    cleanupEvidence:
      cleanupResult.status === "fulfilled" ? cleanupResult.value : null,
    failureReasonCodes: Object.freeze(failureReasonCodes),
    runtimeDrainEvidence:
      drainResult.status === "fulfilled" ? drainResult.value : null,
  });
}

async function waitForProbe({
  child,
  fetchImpl = fetch,
  path: probePath,
  port,
  timeoutMs,
}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      fail("CURRENT_RELEASE_RUNTIME_EXITED_BEFORE_READY");
    }
    try {
      const response = await fetchImpl(
        `http://${LOOPBACK}:${port}${probePath}`,
        {
          cache: "no-store",
          redirect: "manual",
          signal: AbortSignal.timeout(2_000),
        },
      );
      if (response.status === 200) return;
    } catch {
      // Bounded retry while the exact runtime starts.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  fail("CURRENT_RELEASE_RUNTIME_STARTUP_TIMEOUT");
}

function assertRuntimeEvidence(runtimeEvidence) {
  if (
    !runtimeEvidence ||
    runtimeEvidence.outputLimitExceeded ||
    runtimeEvidence.secretLeakDetected ||
    runtimeEvidence.networkBlockDetected ||
    !SHA256.test(runtimeEvidence.digest)
  ) {
    fail("CURRENT_RELEASE_RUNTIME_EVIDENCE_REJECTED");
  }
}

export function createSignedCurrentReleaseReceipt(
  receiptBase,
  { hmacKey, keyId },
) {
  exactString(keyId, SAFE_KEY_ID, "CURRENT_RELEASE_EVIDENCE_KEY_ID_INVALID");
  if (
    typeof hmacKey !== "string" ||
    hmacKey.length < 32 ||
    hmacKey.length > 4096 ||
    hmacKey.trim() !== hmacKey
  ) {
    fail("CURRENT_RELEASE_EVIDENCE_HMAC_KEY_INVALID");
  }
  const canonical = stableJson(receiptBase);
  const evidenceDigest = sha256(canonical);
  const signature = createHmac("sha256", hmacKey)
    .update(evidenceDigest)
    .digest("hex");
  return Object.freeze({
    ...receiptBase,
    evidenceDigest,
    signature: Object.freeze({
      algorithm: "HMAC-SHA256",
      keyId,
      value: signature,
    }),
  });
}

export function verifySignedCurrentReleaseReceipt(receipt, hmacKey) {
  const { evidenceDigest, signature, ...receiptBase } = receipt ?? {};
  if (!SHA256.test(evidenceDigest) || !SHA256.test(signature?.value)) {
    return false;
  }
  const expected = createSignedCurrentReleaseReceipt(receiptBase, {
    hmacKey,
    keyId: signature.keyId,
  });
  return (
    expected.evidenceDigest === evidenceDigest &&
    expected.signature.value === signature.value
  );
}

export async function writeCurrentReleaseEvidenceReceipt(
  evidencePath,
  receipt,
) {
  if (!path.isAbsolute(evidencePath)) {
    fail("CURRENT_RELEASE_EVIDENCE_PATH_INVALID");
  }
  const evidenceDirectory = path.dirname(evidencePath);
  const directoryMetadata = await lstat(evidenceDirectory, {
    bigint: true,
  }).catch(() => null);
  const realDirectory = await realpath(evidenceDirectory).catch(() => null);
  const realDirectoryMetadata = realDirectory
    ? await lstat(realDirectory, { bigint: true }).catch(() => null)
    : null;
  if (
    !directoryMetadata?.isDirectory() ||
    directoryMetadata.isSymbolicLink() ||
    !realDirectoryMetadata?.isDirectory() ||
    directoryMetadata.dev !== realDirectoryMetadata.dev ||
    directoryMetadata.ino !== realDirectoryMetadata.ino ||
    (process.platform !== "win32" &&
      realDirectory !== path.resolve(evidenceDirectory)) ||
    (process.platform !== "win32" &&
      (directoryMetadata.uid !== BigInt(process.getuid()) ||
        (directoryMetadata.mode & 0o022n) !== 0n))
  ) {
    fail("CURRENT_RELEASE_EVIDENCE_DIRECTORY_UNSAFE");
  }
  const existing = await lstat(evidencePath).catch(() => null);
  if (existing) fail("CURRENT_RELEASE_EVIDENCE_ALREADY_EXISTS");
  const handle = await open(evidencePath, "wx", 0o600).catch(() => null);
  if (!handle) fail("CURRENT_RELEASE_EVIDENCE_CREATE_FAILED");
  try {
    await handle.writeFile(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.chmod(0o600);
  } finally {
    await handle.close();
  }
  if (process.platform !== "win32") {
    const directoryHandle = await open(evidenceDirectory, "r");
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  }
}

export async function runCurrentReleaseRestoredCopyRuntimeAcceptance(options) {
  const startedAt = new Date();
  const startupTimeoutMs = normalizeCurrentReleaseStartupTimeoutMs(
    options.startupTimeoutMs,
  );
  const expected = normalizeCurrentReleaseTarget(options.expected);
  const urlIdentity = assertCurrentReleaseDatabaseUrl(options.databaseUrl);
  const ports = assertCurrentReleasePorts({
    apiPort: options.apiPort,
    databasePort: urlIdentity.port,
    webPort: options.webPort,
  });
  let artifactEvidence = null;
  let databaseEvidence = null;
  let scopeOracle = null;
  let httpEvidence = null;
  let cleanupEvidence = null;
  let runtimeDrainEvidence = null;
  let apiRuntime = null;
  let webRuntime = null;
  let client = null;
  let fixture = null;
  let kernelSandboxEvidence = null;
  let kernelSandboxCgroupPath = null;
  let temporaryRoot = null;
  let decision = CURRENT_RELEASE_RUNTIME_ACCEPTANCE_FAIL;
  let reasonCode = null;
  let failureMetadata = null;
  const allSensitiveValues = [
    options.loginEmail,
    options.loginPassword,
    options.evidenceHmacKey,
  ];

  try {
    const kernelSandbox = await attestCurrentReleaseKernelSandbox();
    kernelSandboxEvidence = kernelSandbox.evidence;
    kernelSandboxCgroupPath = kernelSandbox.cgroupPath;
    artifactEvidence = await verifyCurrentReleaseArtifact({
      artifactRoot: options.artifactRoot,
      expected,
    });
    await Promise.all([
      assertPortAvailable(ports.apiPort),
      assertPortAvailable(ports.webPort),
    ]);
    client = new pg.Client({
      application_name: "leetplus_current_release_runtime_acceptance",
      connectionString: options.databaseUrl,
      connectionTimeoutMillis: 10_000,
      query_timeout: 20_000,
      statement_timeout: 20_000,
    });
    await client.connect();
    const databaseInspection = await inspectCurrentReleaseDatabase(
      client,
      expected,
      urlIdentity,
      options.loginEmail,
    );
    databaseEvidence = databaseInspection.evidence;
    scopeOracle = databaseInspection.scopeOracle;

    temporaryRoot = await mkdtemp(
      path.join(os.tmpdir(), "leetplus-current-release-acceptance-"),
    );
    const apiGuard = path.join(temporaryRoot, "api-loopback-guard.cjs");
    const webGuard = path.join(temporaryRoot, "web-loopback-guard.cjs");
    await Promise.all([
      writeFile(
        apiGuard,
        buildCurrentReleaseNetworkGuardSource({
          allowedConnectPort: urlIdentity.port,
          allowedListenPort: ports.apiPort,
        }),
        { encoding: "utf8", flag: "wx", mode: 0o600 },
      ),
      writeFile(
        webGuard,
        buildCurrentReleaseNetworkGuardSource({
          allowedConnectPort: ports.apiPort,
          allowedListenPort: ports.webPort,
        }),
        { encoding: "utf8", flag: "wx", mode: 0o600 },
      ),
    ]);
    const apiConfiguration = buildCurrentReleaseApiEnvironment({
      apiPort: ports.apiPort,
      buildTime: startedAt.toISOString(),
      databaseUrl: options.databaseUrl,
      expectedMigrationCount: expected.expectedMigrationCount,
      expectedMigrationHead: expected.expectedMigrationHead,
      releaseSha: expected.releaseSha,
    });
    allSensitiveValues.push(...apiConfiguration.sensitiveValues);
    await assertRuntimeEntryStillExact(artifactEvidence.runtimeEntries.api);
    apiRuntime = startRuntime({
      args: ["--require", apiGuard, artifactEvidence.apiEntry],
      cwd: artifactEvidence.artifactRoot,
      environment: {
        ...apiConfiguration.environment,
        NODE_OPTIONS: `--require=${apiGuard}`,
      },
      sensitiveValues: allSensitiveValues,
    });
    await waitForProbe({
      child: apiRuntime.child,
      path: "/health/ready",
      port: ports.apiPort,
      timeoutMs: startupTimeoutMs,
    });

    const webEnvironment = {
      ...buildCurrentReleaseWebEnvironment({
        apiPort: ports.apiPort,
        releaseSha: expected.releaseSha,
      }),
      NODE_OPTIONS: `--require=${webGuard}`,
    };
    await assertRuntimeEntryStillExact(artifactEvidence.runtimeEntries.web);
    webRuntime = startRuntime({
      args: [
        "--require",
        webGuard,
        artifactEvidence.nextEntry,
        "start",
        "--hostname",
        LOOPBACK,
        "--port",
        String(ports.webPort),
      ],
      cwd: path.join(artifactEvidence.artifactRoot, "apps", "web"),
      environment: webEnvironment,
      sensitiveValues: allSensitiveValues,
    });
    await waitForProbe({
      child: webRuntime.child,
      path: "/api/release-identity",
      port: ports.webPort,
      timeoutMs: startupTimeoutMs,
    });

    httpEvidence = await executeCurrentReleaseHttpAcceptance({
      apiPort: ports.apiPort,
      expectedMigrationCount: expected.expectedMigrationCount,
      expectedMigrationHead: expected.expectedMigrationHead,
      loginEmail: options.loginEmail,
      loginPassword: options.loginPassword,
      onFixtureCreated(value) {
        fixture = value;
      },
      refreshNotificationOracle: (currentOracle) =>
        refreshCurrentReleaseNotificationOracle(client, currentOracle),
      releaseSha: expected.releaseSha,
      scopeOracle,
      tenantSlug: expected.tenantSlug,
      webPort: ports.webPort,
      withReversibleWrite: options.withReversibleWrite === true,
    });
    decision = CURRENT_RELEASE_RUNTIME_ACCEPTANCE_PASS;
  } catch (error) {
    reasonCode = safeReason(error);
    failureMetadata = Object.freeze({
      ...(error?.safeMetadata ?? {}),
      apiExitCode: apiRuntime?.child.exitCode ?? null,
      apiSignal: apiRuntime?.child.signalCode ?? null,
      webExitCode: webRuntime?.child.exitCode ?? null,
      webSignal: webRuntime?.child.signalCode ?? null,
    });
  } finally {
    const terminationResults = await Promise.allSettled([
      terminateChild(webRuntime?.child),
      terminateChild(apiRuntime?.child),
    ]);
    const terminationFailure = terminationResults.find(
      (result) => result.status === "rejected",
    );
    if (terminationFailure) {
      decision = CURRENT_RELEASE_RUNTIME_ACCEPTANCE_FAIL;
      reasonCode = safeReason(terminationFailure.reason);
    }
    if (client) {
      const finalized = await finalizeCurrentReleaseRuntime(client, {
        apiPort: ports.apiPort,
        cgroupPath: kernelSandboxCgroupPath,
        fixture,
        tenantSlug: expected.tenantSlug,
        webPort: ports.webPort,
      });
      runtimeDrainEvidence = finalized.runtimeDrainEvidence;
      cleanupEvidence = finalized.cleanupEvidence;
      if (finalized.failureReasonCodes.length > 0) {
        decision = CURRENT_RELEASE_RUNTIME_ACCEPTANCE_FAIL;
        reasonCode ??= finalized.failureReasonCodes[0];
        failureMetadata = Object.freeze({
          ...(failureMetadata ?? {}),
          finalizationFailureReasonCodes: finalized.failureReasonCodes,
        });
      }
      if (cleanupEvidence) {
        if (
          cleanupEvidence.directCleanupRequired &&
          decision === CURRENT_RELEASE_RUNTIME_ACCEPTANCE_PASS
        ) {
          decision = CURRENT_RELEASE_RUNTIME_ACCEPTANCE_FAIL;
          reasonCode = "CURRENT_RELEASE_API_DELETE_LEFT_RESIDUE";
        }
      }
      await client.end().catch(() => {});
    }
    if (temporaryRoot) {
      await rm(temporaryRoot, { recursive: true, force: true }).catch(() => {});
    }
  }

  const apiRuntimeEvidence = apiRuntime?.evidence() ?? null;
  const webRuntimeEvidence = webRuntime?.evidence() ?? null;
  try {
    if (apiRuntimeEvidence) assertRuntimeEvidence(apiRuntimeEvidence);
    if (webRuntimeEvidence) assertRuntimeEvidence(webRuntimeEvidence);
  } catch (error) {
    decision = CURRENT_RELEASE_RUNTIME_ACCEPTANCE_FAIL;
    reasonCode = safeReason(error);
  }

  const finishedAt = new Date();
  const receiptBase = {
    contractVersion: CURRENT_RELEASE_RUNTIME_ACCEPTANCE_CONTRACT,
    decision,
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    evidence: {
      artifact: artifactEvidence
        ? {
            buildId: artifactEvidence.buildId,
            hydratedManifestDigest: artifactEvidence.hydratedManifestDigest,
            hydratedManifestEntryCount:
              artifactEvidence.hydratedManifestEntryCount,
            hydrationReceiptDigest: artifactEvidence.hydrationReceiptDigest,
            manifestDigest: artifactEvidence.manifestDigest,
            manifestEntryCount: artifactEvidence.manifestEntryCount,
            provenanceDigest: artifactEvidence.provenanceDigest,
            symlinkTopologyCount: artifactEvidence.symlinkTopologyCount,
            symlinkTopologyDigest: artifactEvidence.symlinkTopologyDigest,
          }
        : null,
      cleanup: cleanupEvidence,
      database: databaseEvidence,
      http: httpEvidence
        ? {
            moduleCounts: httpEvidence.moduleCounts,
            probes: httpEvidence.probes,
            readProjections: httpEvidence.readProjections,
            usersProjection: httpEvidence.usersProjection,
            reversibleWriteExercised: options.withReversibleWrite === true,
          }
        : null,
      runtime: {
        api: apiRuntimeEvidence,
        effectsPolicyDigest: sha256(stableJson(CURRENT_RELEASE_EFFECT_POLICY)),
        kernelSandbox: kernelSandboxEvidence,
        drain: runtimeDrainEvidence,
        startupTimeoutMs,
        web: webRuntimeEvidence,
      },
      failure: failureMetadata,
    },
    finishedAt: finishedAt.toISOString(),
    mode: "CURRENT_RELEASE_API_WEB_RUNTIME",
    reasonCode:
      decision === CURRENT_RELEASE_RUNTIME_ACCEPTANCE_PASS ? null : reasonCode,
    releaseSha: expected.releaseSha,
    startedAt: startedAt.toISOString(),
  };
  const receipt = createSignedCurrentReleaseReceipt(receiptBase, {
    hmacKey: options.evidenceHmacKey,
    keyId: options.evidenceKeyId,
  });
  const serialized = JSON.stringify(receipt);
  if (
    allSensitiveValues
      .filter((value) => typeof value === "string" && value.length >= 8)
      .some((value) => serialized.includes(value))
  ) {
    fail("CURRENT_RELEASE_RECEIPT_EXPOSED_SENSITIVE_VALUE");
  }
  await writeCurrentReleaseEvidenceReceipt(options.evidencePath, receipt);
  return receipt;
}
