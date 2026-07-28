// The StaffTask evidence remains bound to the reviewed EXPAND_162 prefix.
// Later migrations are accepted only as an explicit additive tail for the
// current release; adding another migration requires updating and reviewing
// this allowlist rather than silently moving the frozen evidence boundary.
export const STAFF_TASK_FROZEN_PREFIX_COUNT = 162;
export const STAFF_TASK_FROZEN_PREFIX_LATEST =
  "20260727131000_staff_task_integrity_expand";

export const STAFF_TASK_ALLOWED_ADDITIVE_TAIL = Object.freeze([
  "20260728120000_tenant_execution_control_plane_expand",
]);

export const CURRENT_EXPECTED_MIGRATION_COUNT =
  STAFF_TASK_FROZEN_PREFIX_COUNT + STAFF_TASK_ALLOWED_ADDITIVE_TAIL.length;

export const CURRENT_EXPECTED_LATEST_MIGRATION =
  STAFF_TASK_ALLOWED_ADDITIVE_TAIL.at(-1) ?? STAFF_TASK_FROZEN_PREFIX_LATEST;

// Keep the reader-facing admission state explicit. A later release migration
// must update this value together with the additive-tail allowlist.
export const STAFF_TASK_CURRENT_RELEASE_STATE = "CURRENT_163";
