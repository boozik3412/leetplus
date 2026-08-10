// The StaffTask evidence remains bound to the reviewed EXPAND_162 prefix.
// Later migrations are accepted only as an explicit additive tail for the
// current release; adding another migration requires updating and reviewing
// this allowlist rather than silently moving the frozen evidence boundary.
export const STAFF_TASK_FROZEN_PREFIX_COUNT = 162;
export const STAFF_TASK_FROZEN_PREFIX_LATEST =
  "20260727131000_staff_task_integrity_expand";

export const STAFF_TASK_ALLOWED_ADDITIVE_TAIL = Object.freeze([
  "20260728120000_tenant_execution_control_plane_expand",
  "20260728150000_tenant_execution_revision_fence",
  "20260729120000_store_background_execution_fence",
  "20260729160000_guest_game_delivery_claim_fence",
  "20260729190000_identity_email_claim_foundation",
  "20260729210000_identity_email_claim_write_boundary",
  "20260729230000_identity_invite_writer_boundary",
  "20260729233000_identity_activation_locator",
  "20260730010000_identity_owner_invite_hold_outbox",
  "20260730020000_shared_beta_admission_provenance",
  "20260730030000_identity_mail_outbox_pending_enum_expand",
  "20260730040000_shared_beta_runtime_release_activation",
  "20260731010000_identity_mail_delivery_status_expand",
  "20260731020000_initial_owner_mail_delivery_boundary",
  "20260731090000_guest_game_case_reward_lifecycle",
  "20260731110000_guest_game_case_reward_contract",
  "20260731120000_identity_mail_delivery_release_head",
  "20260804120000_guest_game_max_pending_rewards",
]);

export const CURRENT_EXPECTED_MIGRATION_COUNT =
  STAFF_TASK_FROZEN_PREFIX_COUNT + STAFF_TASK_ALLOWED_ADDITIVE_TAIL.length;

export const CURRENT_EXPECTED_LATEST_MIGRATION =
  STAFF_TASK_ALLOWED_ADDITIVE_TAIL.at(-1) ?? STAFF_TASK_FROZEN_PREFIX_LATEST;

// Keep the reader-facing admission state explicit. A later release migration
// must update this value together with the additive-tail allowlist.
export const STAFF_TASK_CURRENT_RELEASE_STATE = "CURRENT_180";
