export const DESIGN_PARTNER_PROFILE_VERSION = "SINGLE_DESIGN_PARTNER_V1";

/**
 * This is the target product scope agreed for the first design partner. It is
 * an inventory, not a day-zero role override: high-impact capabilities are
 * admitted only by future persisted surface revisions.
 */
export const DESIGN_PARTNER_TARGET_CAPABILITIES = Object.freeze([
  "view_dashboard",
  "view_reports",
  "view_assortment_reports",
  "export_reports",
  "manage_assortment_reports",
  "view_assortment_products",
  "view_assortment_catalog",
  "view_assortment_stores",
  "edit_products",
  "edit_catalog",
  "import_data",
  "use_utilities",
  "manage_integrations",
  "run_sync",
  "view_guest_gamification",
  "manage_guest_game_rules",
  "approve_guest_game_rewards",
  "operate_guest_game_ledger",
  "view_guest_game_pii",
  "view_communications",
  "manage_communications",
  "view_staff",
  "view_staff_shift_workspace",
  "view_staff_tasks",
  "manage_staff_tasks",
  "view_staff_standards",
  "manage_staff_standards",
  "view_staff_training",
  "manage_staff_training",
  "view_staff_knowledge",
  "edit_staff_knowledge",
  "review_staff_knowledge",
  "publish_staff_knowledge",
  "view_staff_control",
  "manage_staff_control",
  "view_staff_directory",
  "manage_staff_directory",
  "view_staff_salary",
  "manage_staff_salary",
  "manage_users",
]);

/**
 * Provisioning deliberately stages a least-privilege bootstrap override. Even
 * if lifecycle admission is bypassed elsewhere, it does not pre-authorize
 * product writes, exports, PII, integrations, broad staff operations,
 * communications or gamification. The explicit knowledge entries mirror the
 * current mandatory OWNER minimum and remain an admission item.
 */
export const DESIGN_PARTNER_OWNER_CAPABILITIES = Object.freeze([
  "view_dashboard",
  "view_reports",
  "view_assortment_reports",
  "view_assortment_products",
  "view_assortment_catalog",
  "view_assortment_stores",
  "view_staff_knowledge",
  "edit_staff_knowledge",
  "review_staff_knowledge",
  "publish_staff_knowledge",
  "manage_users",
]);

export const DESIGN_PARTNER_FORBIDDEN_CAPABILITIES = Object.freeze([
  "view_guests",
  "export_guests",
  "manage_guest_crm",
  "view_marketing",
  "manage_marketing",
  "edit_stores",
]);

export const DESIGN_PARTNER_REQUIRED_ENV = Object.freeze({
  DESIGN_PARTNER_ISOLATED_MODE: "true",
  ACCESS_SCOPE_ENFORCEMENT_MODE: "ENFORCED",
  STAFF_ATTACHMENT_ACL_MODE: "ENFORCED",
  GUEST_GAME_PIPELINE_SCHEDULER_ENABLED: "false",
  GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED: "false",
  GUEST_GAME_RETENTION_SCHEDULER_ENABLED: "false",
  LANGAME_DAILY_SYNC_SCHEDULER_ENABLED: "false",
  GUEST_ACTIVITY_LEDGER_SCHEDULER_ENABLED: "false",
  REPORT_DIGEST_SCHEDULER_ENABLED: "false",
  STAFF_TASK_RULES_SCHEDULER_ENABLED: "false",
  STAFF_TASK_RULES_SCHEDULED_HTTP_ENABLED: "false",
  LANGAME_SCHEDULED_HTTP_ENABLED: "false",
  GUEST_GAME_SCHEDULED_HTTP_ENABLED: "false",
  REPORT_DIGEST_SCHEDULED_HTTP_ENABLED: "false",
  GUEST_GAME_LEDGER_FALLBACK_MODE: "OFF",
  GUEST_GAME_LOOT_BOX_RECOVERY_MODE: "OFF",
  GUEST_GAME_PIPELINE_BACKFILL_MODE: "OFF",
  GUEST_GAME_SUPPLEMENTAL_PIPELINE_MODE: "OFF",
  GUEST_GAME_LEDGER_FALLBACK_KILL_SWITCH: "true",
  GUEST_GAME_LOOT_BOX_RECOVERY_KILL_SWITCH: "true",
  GUEST_GAME_PIPELINE_BACKFILL_KILL_SWITCH: "true",
  GUEST_GAME_SUPPLEMENTAL_PIPELINE_KILL_SWITCH: "true",
  GUEST_GAME_REWARD_MATERIALIZER_KILL_SWITCH: "true",
  GUEST_GAME_BONUS_LEDGER_SCHEDULER_DRY_RUN: "true",
  GUEST_GAME_BOT_CONSUMER_DRY_RUN: "true",
  GUEST_GAME_TG_EDGE_DRY_RUN: "true",
  GUEST_GAME_BOT_CONSUMER_ENABLED: "false",
  GUEST_GAME_TG_EDGE_ADAPTER_ENABLED: "false",
  GUEST_GAME_TG_EDGE_POLLER_ENABLED: "false",
  GUEST_GAME_TG_EDGE_POLLING_DELETE_WEBHOOK_ON_START: "false",
  LANGAME_BONUS_ACCRUAL_ENABLED: "false",
  GUEST_GAME_STAFF_TEST_REWARD_ACCRUAL_ENABLED: "false",
  GUEST_GAME_DELIVERY_REAL_SEND_ENABLED: "false",
  GUEST_GAME_TELEGRAM_DELIVERY_ENABLED: "false",
  GUEST_GAME_MAX_DELIVERY_ENABLED: "false",
  GUEST_GAME_MAX_DELIVERY_LIVE_CANARY_ENABLED: "false",
  GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_ENABLED: "false",
  GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_TIMEOUT_MS: "15000",
  GUEST_PORTAL_USER_CALL_ENABLED: "false",
  GUEST_PORTAL_INCOMING_CALL_LAST4_ENABLED: "false",
  GUEST_PORTAL_DEV_OTP_ENABLED: "false",
  GUEST_PORTAL_OTP_REAL_SEND_ENABLED: "false",
  GUEST_PORTAL_OTP_SMS_ENABLED: "false",
  GUEST_PORTAL_OTP_SMS_RU_TEST_MODE: "true",
  GUEST_PORTAL_OTP_SMS_RU_LIVE_CANARY_ENABLED: "false",
  GUEST_PORTAL_OTP_TELEGRAM_ENABLED: "false",
  GUEST_PORTAL_OTP_MAX_ENABLED: "false",
  GUEST_GAME_RETENTION_LIVE_ENABLED: "false",
  GUEST_GAME_MONITORING_ENABLED: "false",
});

export const DESIGN_PARTNER_PROVISION_ACTION =
  "SINGLE_DESIGN_PARTNER_PROVISIONED";
export const DESIGN_PARTNER_INVITE_ROTATE_ACTION =
  "SINGLE_DESIGN_PARTNER_INVITE_ROTATED";
export const DESIGN_PARTNER_SUSPEND_ACTION = "SINGLE_DESIGN_PARTNER_SUSPENDED";
