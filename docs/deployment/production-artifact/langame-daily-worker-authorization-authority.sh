#!/usr/bin/bash -p

# Root-only, release-bound authority for the dedicated Langame daily worker.
# It is intentionally the *only* path which may lift the inherited legacy
# start fence for this one worker: it issues an immutable permit before a
# bounded canary or timer enablement, and never alters nginx, API/Web slots,
# database state, USER_CALL, or the legacy fence marker itself.

[[ $- == *p* ]] || { printf 'Langame worker authority: privileged Bash mode is required\n' >&2; exit 1; }
while IFS= read -r inherited_name; do unset "$inherited_name" 2>/dev/null || true; done < <(compgen -e)
unset inherited_name
PATH='/usr/sbin:/usr/bin:/sbin:/bin'; LANG='C.UTF-8'; LC_ALL='C.UTF-8'; TZ='UTC'
export PATH LANG LC_ALL TZ
set -Eeuo pipefail
IFS=$'\n\t'
umask 0077
cd /

readonly CONFIRMATION='I_ACCEPT_EXACT_LANGAME_DAILY_WORKER_AUTHORIZATION'
readonly REVOCATION_CONFIRMATION='I_ACCEPT_EXACT_LANGAME_DAILY_WORKER_REVOCATION'
readonly INSTALL_LOCK='/run/leetplus-production-control/install.lock'
readonly CUTOVER_LOCK='/var/lib/leetplus/deploy-receipts/cutover.lock'
readonly STATE_ROOT='/var/lib/leetplus/langame-worker-authorizations'
readonly SUCCESSOR_RECEIPT='/var/lib/leetplus/legacy-drain/manifest-successor.receipt'
readonly ACTIVATION_RECEIPT='/var/lib/leetplus/legacy-drain/activation.receipt'
readonly ACTIVE_UPSTREAM='/etc/nginx/leetplus/active-upstreams.conf'
readonly WORKER_ENV='/etc/leetplus/langame-daily-worker.env'
readonly AUTH_ENV='/etc/leetplus/langame-daily-worker-authorization.env'
readonly SAFE_ENV='/etc/leetplus/canary-safe.env'
readonly WORKER_SERVICE='leetplus-langame-daily-worker.service'
readonly WORKER_TIMER='leetplus-langame-daily-worker.timer'
readonly SERVICE_FILE='/etc/systemd/system/leetplus-langame-daily-worker.service'
readonly TIMER_FILE='/etc/systemd/system/leetplus-langame-daily-worker.timer'
readonly RUNNER='/usr/local/libexec/leetplus/run-authorized-langame-daily-worker.sh'
readonly CONTROL_VERIFIER='/usr/local/libexec/leetplus/verify-installed-production-control-generation.mjs'
readonly WORKER_VERIFIER='/usr/local/libexec/leetplus/verify-langame-daily-worker-authorization.sh'
readonly DRAIN_VERIFIER='/usr/local/libexec/leetplus/verify-legacy-runtime-drain.sh'
readonly FENCE_MARKER='/var/lib/leetplus/legacy-drain/legacy-start-fence'
readonly FENCE_LINE="ConditionPathExists=!${FENCE_MARKER}"
readonly SHA_RE='^[0-9a-f]{64}$'
readonly RELEASE_RE='^[0-9a-f]{40}$'
readonly SLUG_RE='^[a-z0-9][a-z0-9-]{0,62}$'

die() { printf 'Langame worker authority: %s\n' "$*" >&2; exit 1; }
usage() {
  cat <<'USAGE'
Usage:
  leetplus-langame-daily-worker-authorization-authority plan --phase canary|timer
  leetplus-langame-daily-worker-authorization-authority check --phase canary|timer
  leetplus-langame-daily-worker-authorization-authority recover --phase canary|timer
  leetplus-langame-daily-worker-authorization-authority apply --phase canary|timer \
    --plan-sha256 <64-lowercase-hex> --action-count 1 \
    --confirm I_ACCEPT_EXACT_LANGAME_DAILY_WORKER_AUTHORIZATION
  leetplus-langame-daily-worker-authorization-authority revoke-plan
  leetplus-langame-daily-worker-authorization-authority revoke-check
  leetplus-langame-daily-worker-authorization-authority revoke-recover
  leetplus-langame-daily-worker-authorization-authority revoke-apply \
    --plan-sha256 <64-lowercase-hex> --action-count 1 \
    --confirm I_ACCEPT_EXACT_LANGAME_DAILY_WORKER_REVOCATION

The controller is root-only.  It requires an accepted legacy-drain manifest
successor receipt, an exact admitted active release/control generation, the
dedicated worker identity, and API scheduler/scheduled-HTTP denial.  `canary`
starts one bounded explicit-date service while the timer is disabled; `timer`
requires a successful matching canary evidence record and only then enables the
timer.  Neither command removes the global legacy fence marker or changes
nginx, API/Web units, database state, or USER_CALL.
USAGE
}

[[ ${EUID:-99999} -eq 0 && "$(/usr/bin/id -g)" == 0 ]] || die 'root authority is required'
for required in awk basename cat chmod chown cmp cut date dirname env find findmnt flock getent grep head install mktemp mv node readlink rm sed sha256sum sleep sort stat sync systemctl timeout tr wc; do
  command -v "$required" >/dev/null 2>&1 || die "required command is unavailable: ${required}"
done

mode=''; phase=''; expected_plan=''; expected_count=''; confirmation=''
while (($#)); do
  case "$1" in
    plan|check|apply|recover|revoke-plan|revoke-check|revoke-apply|revoke-recover) [[ -z "$mode" ]] || die 'exactly one mode is required'; mode="$1"; shift ;;
    --phase) [[ $# -ge 2 && -z "$phase" ]] || die '--phase requires one value'; phase="$2"; shift 2 ;;
    --plan-sha256) [[ $# -ge 2 && -z "$expected_plan" ]] || die '--plan-sha256 requires one value'; expected_plan="$2"; shift 2 ;;
    --action-count) [[ $# -ge 2 && -z "$expected_count" ]] || die '--action-count requires one value'; expected_count="$2"; shift 2 ;;
    --confirm) [[ $# -ge 2 && -z "$confirmation" ]] || die '--confirm requires one value'; confirmation="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done
[[ -n "$mode" ]] || die 'one exact mode is required'
if [[ "$mode" == revoke-* ]]; then
  [[ -z "$phase" ]] || die 'revocation modes do not accept --phase'
  phase=timer
else
  [[ "$phase" == canary || "$phase" == timer ]] || die 'exact phase canary|timer is required'
fi
if [[ "$mode" == apply ]]; then
  [[ "$expected_plan" =~ $SHA_RE && "$expected_count" == 1 && "$confirmation" == "$CONFIRMATION" ]] \
    || die 'apply requires exact plan digest, action-count=1 and explicit confirmation'
elif [[ "$mode" == revoke-apply ]]; then
  [[ "$expected_plan" =~ $SHA_RE && "$expected_count" == 1 && "$confirmation" == "$REVOCATION_CONFIRMATION" ]] \
    || die 'revoke-apply requires exact plan digest, action-count=1 and explicit revocation confirmation'
else
  [[ -z "$expected_plan$expected_count$confirmation" ]] || die 'non-apply modes do not accept apply arguments'
fi

assert_regular() {
  local path="$1" owner_group_mode="$2"
  [[ -f "$path" && ! -L "$path" && "$(readlink -e -- "$path")" == "$path" ]] || die "regular file is absent or linked: ${path}"
  [[ "$(stat -c '%U:%G:%a:%h' -- "$path")" == "$owner_group_mode:1" ]] || die "file authority is invalid: ${path}"
}
assert_directory() {
  local path="$1" owner_group_mode="$2"
  [[ -d "$path" && ! -L "$path" && "$(readlink -e -- "$path")" == "$path" ]] || die "directory is absent or linked: ${path}"
  [[ "$(stat -c '%U:%G:%a' -- "$path")" == "$owner_group_mode" ]] || die "directory authority is invalid: ${path}"
  [[ -z "$(find -P "$path" -maxdepth 0 -perm /022 -print -quit)" ]] || die "directory is writable by group/other: ${path}"
}
sha() { sha256sum -- "$1" | awk '{print $1}'; }

read_env_value() {
  local file="$1" key="$2" line value count
  count="$(grep -Ec "^${key}=" "$file" || true)"
  [[ "$count" == 1 ]] || die "environment key is absent or duplicated: ${key}"
  line="$(grep -E "^${key}=" "$file")"
  value="${line#*=}"
  [[ "$value" != *$'\r'* && "$value" != *$'\n'* ]] || die "environment value is noncanonical: ${key}"
  printf '%s' "$value"
}
assert_no_unexpected_env_keys() {
  local file="$1" key
  while IFS= read -r key; do
    [[ "$key" =~ ^[A-Z][A-Z0-9_]*$ ]] || die "environment file contains unsafe key: ${file}"
  done < <(sed -n '/^[^#[:space:]]/s/=.*$//p' "$file")
}
systemctl_bounded() { timeout --kill-after=2s 10s systemctl "$@"; }
unit_has_no_processes() {
  local unit="$1" property value control_group cgroup_path events
  for property in MainPID ControlPID ExecMainPID; do
    value="$(systemctl_bounded show --property="$property" --value "$unit")" || return 1
    [[ "$value" == 0 ]] || return 1
  done
  control_group="$(systemctl_bounded show --property=ControlGroup --value "$unit")" || return 1
  [[ "$control_group" != *$'\r'* && "$control_group" != *$'\n'* ]] || return 1
  [[ -n "$control_group" ]] || return 0
  [[ "$control_group" == /* && "$control_group" != *'//'*
    && "$control_group" != */../* && "$control_group" != */.. && "$control_group" != *'/./'* ]] || return 1
  cgroup_path="/sys/fs/cgroup${control_group}"
  [[ -d "$cgroup_path" ]] || return 0
  [[ -f "${cgroup_path}/cgroup.events" && ! -L "${cgroup_path}/cgroup.events" ]] || return 1
  events="$(timeout --kill-after=1s 2s head -c 4097 -- "${cgroup_path}/cgroup.events")" || return 1
  [[ "${#events}" -le 4096
    && "$(grep -Ec '^populated [01]$' <<< "$events" || true)" == 1
    && "$(grep -Ec '^populated 0$' <<< "$events" || true)" == 1 ]] || return 1
}
service_is_quiescent() {
  [[ "$(systemctl_bounded show --property=ActiveState --value "$WORKER_SERVICE")" == inactive
    && "$(systemctl_bounded show --property=SubState --value "$WORKER_SERVICE")" == dead ]] \
    && unit_has_no_processes "$WORKER_SERVICE"
}
timer_is_disabled_quiescent() {
  [[ "$(systemctl_bounded show --property=UnitFileState --value "$WORKER_TIMER")" == disabled
    && "$(systemctl_bounded show --property=ActiveState --value "$WORKER_TIMER")" == inactive
    && "$(systemctl_bounded show --property=SubState --value "$WORKER_TIMER")" == dead ]] \
    && unit_has_no_processes "$WORKER_TIMER"
}
timer_is_waiting_quiescent() {
  [[ "$(systemctl_bounded show --property=UnitFileState --value "$WORKER_TIMER")" == enabled
    && "$(systemctl_bounded show --property=ActiveState --value "$WORKER_TIMER")" == active
    && "$(systemctl_bounded show --property=SubState --value "$WORKER_TIMER")" == waiting ]] \
    && unit_has_no_processes "$WORKER_TIMER"
}
worker_jobs_are_absent() {
  local jobs
  jobs="$(systemctl_bounded list-jobs --no-legend --plain)" || return 1
  [[ "${#jobs}" -le 65536 ]] || return 1
  ! grep -Eq "(^|[[:space:]])(${WORKER_SERVICE}|${WORKER_TIMER})([[:space:]]|$)" <<< "$jobs"
}
wait_for_service_quiescent() {
  local _
  for _ in {1..30}; do
    service_is_quiescent && worker_jobs_are_absent && return 0
    /usr/bin/sleep 2
  done
  return 1
}
stop_service_and_assert_quiescent() {
  systemctl_bounded stop "$WORKER_SERVICE" || die 'cannot stop the dedicated worker service'
  systemctl_bounded reset-failed "$WORKER_SERVICE" || die 'cannot clear the dedicated worker terminal state'
  wait_for_service_quiescent || die 'dedicated worker service did not reach strict PID/cgroup quiescence'
}
lock_file() {
  local fd="$1" path="$2" descriptor_identity path_identity
  assert_regular "$path" 'root:root:600'
  eval "exec ${fd}<>\"${path}\""
  [[ -f "/proc/$$/fd/${fd}" && "$(readlink -e -- "/proc/$$/fd/${fd}")" == "$path" ]] || die "lock descriptor drifted: ${path}"
  descriptor_identity="$(stat -Lc '%d:%i:%u:%g:%a:%h' -- "/proc/$$/fd/${fd}")"
  path_identity="$(stat -Lc '%d:%i:%u:%g:%a:%h' -- "$path")"
  [[ "$descriptor_identity" == "$path_identity" ]] || die "lock descriptor inode differs from path: ${path}"
  flock -xn "$fd" || die "another production operation holds ${path}"
  assert_regular "$path" 'root:root:600'
  [[ "$(stat -Lc '%d:%i:%u:%g:%a:%h' -- "/proc/$$/fd/${fd}")" == "$(stat -Lc '%d:%i:%u:%g:%a:%h' -- "$path")" ]] \
    || die "lock path was replaced after acquisition: ${path}"
}
atomic_write() {
  local destination="$1" temporary
  temporary="$(mktemp "${STATE_ROOT}/.pending.XXXXXX")"
  chmod 0440 "$temporary"
  cat > "$temporary"
  chown root:leetplus-api-runtime "$temporary"
  chmod 0440 "$temporary"
  [[ "$(stat -c '%U:%G:%a:%h' -- "$temporary")" == 'root:leetplus-api-runtime:440:1' ]] || die 'authorization receipt temporary authority drifted'
  sync -f "$temporary"; mv -T "$temporary" "$destination"; sync -f "$destination"; sync -d "$STATE_ROOT"
}
atomic_write_root() {
  local destination="$1" temporary
  temporary="$(mktemp "${STATE_ROOT}/.pending-root.XXXXXX")"
  chmod 0400 "$temporary"; cat > "$temporary"; chown root:root "$temporary"; chmod 0400 "$temporary"
  [[ "$(stat -c '%U:%G:%a:%h' -- "$temporary")" == 'root:root:400:1' ]] || die 'authorization intent temporary authority drifted'
  sync -f "$temporary"; mv -T "$temporary" "$destination"; sync -f "$destination"; sync -d "$STATE_ROOT"
}

assert_state_root() {
  assert_directory /var 'root:root:755'
  assert_directory /var/lib 'root:root:755'
  assert_directory /var/lib/leetplus 'root:root:755'
  # This controller never creates authority state while calculating a plan.
  # The sealed installer owns provisioning of the exact root; absence is a
  # fail-closed installation defect rather than an implicit production write.
  assert_directory "$STATE_ROOT" 'root:leetplus-api-runtime:710'
}
assert_no_nested_mounts() {
  local target
  while IFS= read -r target; do
    case "$target" in "$STATE_ROOT"|"$STATE_ROOT"/*) die 'authorization receipt root contains a mount' ;; esac
  done < <(findmnt --task 1 --raw --noheadings --output TARGET)
}

active_slot=''; release_sha=''; worker_env_sha=''; worker_stable_env_sha=''; auth_env_sha=''; service_sha=''; timer_sha=''; safe_env_sha=''; successor_sha=''; control_output_sha=''; tenant_slug=''; worker_mode=''; canary_date=''
plan_attempt=''
assert_active_identity() {
  local target slot_env configured_sha
  [[ -L "$ACTIVE_UPSTREAM" ]] || die 'active nginx upstream must be a symlink'
  target="$(readlink -e -- "$ACTIVE_UPSTREAM")"
  case "$target" in /etc/nginx/leetplus/upstreams/blue.conf) active_slot=blue ;; /etc/nginx/leetplus/upstreams/green.conf) active_slot=green ;; *) die 'active nginx upstream is not blue or green' ;; esac
  [[ -L "/srv/leetplus/slots/${active_slot}" ]] || die 'active slot link is absent'
  target="$(readlink -e -- "/srv/leetplus/slots/${active_slot}")"
  [[ "$target" =~ ^/srv/leetplus/releases/([0-9a-f]{40})$ ]] || die 'active slot is not bound to an immutable release'
  release_sha="${BASH_REMATCH[1]}"
  slot_env="/etc/leetplus/slots/${active_slot}.env"
  assert_regular "$slot_env" 'root:leetplus-runtime:440'
  configured_sha="$(read_env_value "$slot_env" RELEASE_SHA)"
  [[ "$configured_sha" == "$release_sha" ]] || die 'active slot environment release SHA drifted'
  systemctl_bounded is-active --quiet "leetplus-api@${active_slot}.service" || die 'active API slot is not active'
  systemctl_bounded is-active --quiet "leetplus-web@${active_slot}.service" || die 'active Web slot is not active'
}
assert_worker_envelope() {
  local allowed_slug class actual_scheduler actual_scheduled api_unit service_fragment timer_fragment
  assert_regular "$WORKER_ENV" 'root:leetplus-api-runtime:640'
  assert_regular "$AUTH_ENV" 'root:root:400'
  assert_regular "$SAFE_ENV" 'root:leetplus-runtime:440'
  assert_regular "$SERVICE_FILE" 'root:root:444'
  assert_regular "$TIMER_FILE" 'root:root:444'
  assert_regular "$RUNNER" 'root:root:555'
  assert_no_unexpected_env_keys "$WORKER_ENV"; assert_no_unexpected_env_keys "$AUTH_ENV"; assert_no_unexpected_env_keys "$SAFE_ENV"
  while IFS= read -r worker_key; do
    case "$worker_key" in DATABASE_URL|APP_ENCRYPTION_KEY|INTEGRATION_ENCRYPTION_KEY|LANGAME_DISCREPANCY_LOG_ROOT|LANGAME_DAILY_WORKER_ENABLED|LANGAME_DAILY_WORKER_LIVE|LANGAME_DAILY_WORKER_TENANT_SLUG|LANGAME_DAILY_WORKER_CANARY|LANGAME_DAILY_SYNC_SCHEDULER_ENABLED|LANGAME_SCHEDULED_HTTP_ENABLED|LANGAME_DAILY_WORKER_DATE) ;; *) die "worker environment contains an unauthorized key: ${worker_key}" ;; esac
  done < <(sed -n '/^[^#[:space:]]/s/=.*$//p' "$WORKER_ENV")
  tenant_slug="$(read_env_value "$WORKER_ENV" LANGAME_DAILY_WORKER_TENANT_SLUG)"
  [[ "$tenant_slug" =~ $SLUG_RE ]] || die 'worker tenant slug is not canonical lowercase'
  allowed_slug="$(read_env_value "$AUTH_ENV" LANGAME_DAILY_WORKER_AUTHORIZED_TENANT_SLUG)"
  class="$(read_env_value "$AUTH_ENV" LANGAME_DAILY_WORKER_AUTHORIZED_TENANT_CLASS)"
  [[ "$allowed_slug" == "$tenant_slug" && "$class" == INTERNAL ]] || die 'worker tenant is not exactly authorized as INTERNAL'
  [[ "$(read_env_value "$WORKER_ENV" LANGAME_DAILY_WORKER_ENABLED)" == true && "$(read_env_value "$WORKER_ENV" LANGAME_DAILY_WORKER_LIVE)" == true ]] || die 'dedicated worker is not explicitly enabled/live'
  actual_scheduler="$(read_env_value "$WORKER_ENV" LANGAME_DAILY_SYNC_SCHEDULER_ENABLED)"; actual_scheduled="$(read_env_value "$WORKER_ENV" LANGAME_SCHEDULED_HTTP_ENABLED)"
  [[ "$actual_scheduler" == false && "$actual_scheduled" == false ]] || die 'worker profile enables an API scheduler or scheduled HTTP'
  [[ "$(read_env_value "$SAFE_ENV" LANGAME_DAILY_SYNC_SCHEDULER_ENABLED)" == false && "$(read_env_value "$SAFE_ENV" LANGAME_SCHEDULED_HTTP_ENABLED)" == false ]] || die 'API safety overlay enables Langame scheduler ownership'
  if grep -Eq '^(GUEST_PORTAL_USER_CALL|SMS_RU|GUEST_PORTAL_).*=' "$WORKER_ENV"; then die 'worker environment imports USER_CALL/provider request-path settings'; fi
  grep -F -x 'EnvironmentFile=/etc/leetplus/langame-daily-worker.env' "$SERVICE_FILE" >/dev/null || die 'worker service env identity drifted'
  grep -F -x "ExecStart=${RUNNER}" "$SERVICE_FILE" >/dev/null || die 'worker service does not use the authorization wrapper'
  grep -F -x 'DynamicUser=yes' "$SERVICE_FILE" >/dev/null || die 'worker service identity is not dynamic'
  grep -F -x 'SupplementaryGroups=leetplus-runtime leetplus-api-runtime' "$SERVICE_FILE" >/dev/null || die 'worker service group identity drifted'
  grep -F -x 'Unit=leetplus-langame-daily-worker.service' "$TIMER_FILE" >/dev/null || die 'worker timer target drifted'
  grep -F -x 'OnCalendar=*-*-* 04:30:00 Asia/Yekaterinburg' "$TIMER_FILE" >/dev/null || die 'worker timer schedule drifted'
  service_fragment="$(systemctl_bounded show --property=FragmentPath --value "$WORKER_SERVICE")"; timer_fragment="$(systemctl_bounded show --property=FragmentPath --value "$WORKER_TIMER")"
  [[ "$service_fragment" == "$SERVICE_FILE" && "$timer_fragment" == "$TIMER_FILE" ]] || die 'loaded worker unit fragment drifted'
  assert_worker_fence "$WORKER_SERVICE"; assert_worker_fence "$WORKER_TIMER"
  worker_env_sha="$(sha "$WORKER_ENV")"; worker_stable_env_sha="$(sed -E '/^LANGAME_DAILY_WORKER_CANARY=|^LANGAME_DAILY_WORKER_DATE=/d' "$WORKER_ENV" | sha256sum | awk '{print $1}')"; auth_env_sha="$(sha "$AUTH_ENV")"; service_sha="$(sha "$SERVICE_FILE")"; timer_sha="$(sha "$TIMER_FILE")"; safe_env_sha="$(sha "$SAFE_ENV")"
  case "$phase" in
    canary)
      worker_mode="CANARY"; canary_date="$(read_env_value "$WORKER_ENV" LANGAME_DAILY_WORKER_DATE)"
      [[ "$(read_env_value "$WORKER_ENV" LANGAME_DAILY_WORKER_CANARY)" == true && "$canary_date" =~ ^20[0-9]{2}-[0-9]{2}-[0-9]{2}$ ]] || die 'canary requires true and one explicit ISO date'
      timer_is_disabled_quiescent || die 'timer must be exact disabled/inactive/PID-zero before canary authorization'
      ;;
    timer)
      worker_mode="TIMER"; [[ "$(read_env_value "$WORKER_ENV" LANGAME_DAILY_WORKER_CANARY)" == false ]] || die 'timer requires canary=false'
      ! grep -q '^LANGAME_DAILY_WORKER_DATE=' "$WORKER_ENV" || die 'timer profile must not retain an explicit canary date'
      if [[ "$mode" == plan || "$mode" == apply ]]; then
        timer_is_disabled_quiescent || die 'timer must be exact disabled/inactive/PID-zero before timer authorization'
      fi
      ;;
  esac
}
assert_successor_receipt() {
  local activation_sha target_manifest predecessor_manifest
  assert_regular "$ACTIVATION_RECEIPT" 'root:root:600'; assert_regular "$SUCCESSOR_RECEIPT" 'root:root:400'
  [[ "$(wc -l < "$SUCCESSOR_RECEIPT" | tr -d '[:space:]')" == 12 && -z "$(awk -F= 'NF < 2 || seen[$1]++ { print; exit }' "$SUCCESSOR_RECEIPT")" ]] || die 'successor receipt schema is invalid'
  [[ "$(grep -Ec '^RECORD_VERSION=1$' "$SUCCESSOR_RECEIPT")" == 1 ]] || die 'successor receipt version is invalid'
  grep -F -x 'LEGACY_DRAIN_MANIFEST_SUCCESSOR_ACCEPTED=true' "$SUCCESSOR_RECEIPT" >/dev/null || die 'legacy drain successor is not accepted'
  activation_sha="$(sha "$ACTIVATION_RECEIPT")"; predecessor_manifest='89930527907a1bf993c9b4db9165c8f8ba305d81be985264ecd3b5fa4ff86b13'; target_manifest='d6e7b4fe8e0aeb9a77caae62d2fb4ed9322e6383148934c5e26ff3f9126120dd'
  grep -F -x "PREVIOUS_ACTIVATION_RECEIPT_SHA256=${activation_sha}" "$SUCCESSOR_RECEIPT" >/dev/null || die 'successor receipt is not bound to activation evidence'
  grep -F -x "PREVIOUS_UNIT_MANIFEST_SHA256=${predecessor_manifest}" "$SUCCESSOR_RECEIPT" >/dev/null || die 'successor receipt predecessor manifest digest drifted'
  grep -F -x "UNIT_MANIFEST_SHA256=${target_manifest}" "$SUCCESSOR_RECEIPT" >/dev/null || die 'successor receipt target manifest digest drifted'
  # The successor is a historical root-evidence chain.  It must remain valid
  # after a later admitted runtime/control release; the *current* release is
  # attested independently below by the installed-control verifier and then
  # bound into this authorization permit.
  grep -Eq '^CONTROL_RELEASE_SHA=[0-9a-f]{40}$' "$SUCCESSOR_RECEIPT" || die 'successor receipt creation control release is invalid'
  grep -F -x 'NO_ROUTE_DATABASE_OR_UNIT_STATE_EFFECTS=true' "$SUCCESSOR_RECEIPT" >/dev/null || die 'successor receipt effect boundary drifted'
  grep -F -x 'CONTROLLER=LEGACY_DRAIN_MANIFEST_SUCCESSOR_V1' "$SUCCESSOR_RECEIPT" >/dev/null || die 'successor receipt controller identity drifted'
  grep -Eq '^PLAN_SHA256=[0-9a-f]{64}$' "$SUCCESSOR_RECEIPT" && grep -Eq '^ACCEPTED_AT=[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z$' "$SUCCESSOR_RECEIPT" || die 'successor receipt plan/timestamp drifted'
  evidence='/var/lib/leetplus/legacy-drain/manifest-successor-drain-verification.v1'; assert_regular "$evidence" 'root:root:600'; grep -F -x "SUCCESSOR_VERIFIER_OUTPUT_SHA256=$(sha "$evidence")" "$SUCCESSOR_RECEIPT" >/dev/null || die 'successor receipt verifier evidence drifted'
  control_evidence='/var/lib/leetplus/legacy-drain/manifest-successor-control-verification.v1'; assert_regular "$control_evidence" 'root:root:600'; grep -F -x "CONTROL_VERIFIER_OUTPUT_SHA256=$(sha "$control_evidence")" "$SUCCESSOR_RECEIPT" >/dev/null || die 'successor receipt control evidence drifted'
  successor_sha="$(sha "$SUCCESSOR_RECEIPT")"
}
assert_control() {
  local output
  assert_regular "$CONTROL_VERIFIER" 'root:root:555'
  output="$(mktemp /tmp/leetplus-langame-worker-control.XXXXXX)"; trap 'rm -f -- "$output"' RETURN
  /usr/bin/node "$CONTROL_VERIFIER" --release-sha "$release_sha" --require-root-authority > "$output" || die 'installed production-control verifier rejected active release'
  grep -F -x 'PRODUCTION_CONTROL_INSTALLED_GENERATION=PASS' "$output" >/dev/null || die 'control verifier did not accept generation'
  grep -F -x "PRODUCTION_CONTROL_RELEASE_SHA=${release_sha}" "$output" >/dev/null || die 'control verifier release identity drifted'
  control_output_sha="$(sha "$output")"; rm -f -- "$output"; trap - RETURN
}
intent_path() { printf '%s/authorization.%s.intent' "$STATE_ROOT" "$phase"; }
pointer_path() { printf '%s/active-%s.permit' "$STATE_ROOT" "$phase"; }
attempt_counter_path() { printf '%s/attempt-%s.counter' "$STATE_ROOT" "$phase"; }
assert_no_pending_operations() { local candidate; for candidate in "$STATE_ROOT"/authorization.canary.intent "$STATE_ROOT"/authorization.timer.intent "$STATE_ROOT"/authorization.revoke.intent; do [[ ! -e "$candidate" && ! -L "$candidate" ]] || die 'an authorization intent is already outstanding'; done; }
attempt=''
next_attempt() {
  local counter current=0 temporary
  counter="$(attempt_counter_path)"
  if [[ -e "$counter" || -L "$counter" ]]; then
    assert_regular "$counter" 'root:root:400'
    current="$(cat -- "$counter")"
    [[ "$current" =~ ^[0-9]+$ && "$current" -lt 2147483647 ]] || die 'authorization attempt counter is invalid'
  fi
  attempt="$((current + 1))"
  temporary="$(mktemp "${STATE_ROOT}/.attempt.XXXXXX")"
  printf '%s\n' "$attempt" > "$temporary"; chown root:root "$temporary"; chmod 0400 "$temporary"
  [[ "$(stat -c '%U:%G:%a:%h' -- "$temporary")" == 'root:root:400:1' ]] || die 'authorization attempt counter authority drifted'
  sync -f "$temporary"; mv -T "$temporary" "$counter"; sync -f "$counter"; sync -d "$STATE_ROOT"
}
planned_attempt() {
  local counter current=0
  counter="$(attempt_counter_path)"
  if [[ -e "$counter" || -L "$counter" ]]; then assert_regular "$counter" 'root:root:400'; current="$(cat -- "$counter")"; fi
  [[ "$current" =~ ^[0-9]+$ && "$current" -lt 2147483647 ]] || die 'authorization attempt counter is invalid'
  printf '%s' "$((current + 1))"
}
load_current_attempt() {
  local pointer permit current expected_keys actual_keys permit_digest
  pointer="$(pointer_path)"; assert_regular "$pointer" 'root:leetplus-api-runtime:440'
  [[ "$(wc -l < "$pointer" | tr -d '[:space:]')" == 3
    && -z "$(awk -F= 'NF < 2 || seen[$1]++ { print; exit }' "$pointer")" ]] \
    || die 'authorization pointer schema is invalid'
  expected_keys="$(printf '%s\n' RECORD_VERSION PERMIT_PATH PERMIT_SHA256 | sort)"
  actual_keys="$(awk -F= '{print $1}' "$pointer" | sort)"
  [[ "$actual_keys" == "$expected_keys" ]] || die 'authorization pointer key set drifted'
  grep -F -x 'RECORD_VERSION=1' "$pointer" >/dev/null || die 'authorization pointer version drifted'
  permit="$(awk -F= '$1 == "PERMIT_PATH" { print $2 }' "$pointer")"
  permit_digest="$(awk -F= '$1 == "PERMIT_SHA256" { print $2 }' "$pointer")"
  [[ "$permit" =~ ^${STATE_ROOT}/authorization-${phase}-[1-9][0-9]*-[0-9a-f]{64}\.receipt$ ]] || die 'authorization pointer permit path is invalid'
  [[ "$permit_digest" =~ $SHA_RE ]] || die 'authorization pointer permit digest is invalid'
  assert_regular "$permit" 'root:leetplus-api-runtime:440'
  [[ "$(sha "$permit")" == "$permit_digest" ]] || die 'authorization pointer permit digest drifted'
  current="$(awk -F= '$1 == "ATTEMPT" { print $2 }' "$permit")"
  [[ "$current" =~ ^[1-9][0-9]*$ ]] || die 'authorization pointer attempt is invalid'
  attempt="$current"
}
permit_identity() { [[ "$attempt" =~ ^[1-9][0-9]*$ ]] || die 'authorization attempt identity is absent'; printf '%s:%s:%s:%s' "$phase" "$attempt" "$release_sha" "$worker_env_sha" | sha256sum | awk '{print $1}'; }
receipt_path() { printf '%s/authorization-%s-%s-%s.receipt' "$STATE_ROOT" "$phase" "$attempt" "$(permit_identity)"; }
assert_no_authorization_dropins() {
  local unit path
  for unit in "$WORKER_SERVICE" "$WORKER_TIMER"; do
    path="$(dirname -- "$(fence_path "$unit")")/91-leetplus-langame-worker-authorization.conf"
    [[ ! -e "$path" && ! -L "$path" ]] || die 'a stale worker authorization drop-in remains'
  done
}
assert_permit() {
  local permit="$1" expected_keys actual_keys not_after
  assert_regular "$permit" 'root:leetplus-api-runtime:440'
  [[ "$(wc -l < "$permit" | tr -d '[:space:]')" == 19 && -z "$(awk -F= 'NF < 2 || seen[$1]++ { print; exit }' "$permit")" ]] || die 'authorization permit schema is invalid'
  expected_keys="$(printf '%s\n' RECORD_VERSION KIND AUTHORIZATION_PERMITTED PHASE ATTEMPT PLAN_SHA256 RELEASE_SHA TENANT_SLUG WORKER_ENV_SHA256 WORKER_STABLE_ENV_SHA256 AUTH_ENV_SHA256 SAFE_ENV_SHA256 SERVICE_SHA256 TIMER_SHA256 SUCCESSOR_RECEIPT_SHA256 CONTROL_VERIFIER_OUTPUT_SHA256 CANARY_DATE NOT_AFTER_EPOCH PLAN_JSON_SHA256 | sort)"
  actual_keys="$(awk -F= '{print $1}' "$permit" | sort)"; [[ "$actual_keys" == "$expected_keys" ]] || die 'authorization permit key set drifted'
  grep -F -x 'RECORD_VERSION=1' "$permit" >/dev/null; grep -F -x 'KIND=LEETPLUS_LANGAME_DAILY_WORKER_AUTHORIZATION_V1' "$permit" >/dev/null; grep -F -x 'AUTHORIZATION_PERMITTED=true' "$permit" >/dev/null
  grep -F -x "PHASE=${phase}" "$permit" >/dev/null; grep -F -x "ATTEMPT=${attempt}" "$permit" >/dev/null; grep -F -x "RELEASE_SHA=${release_sha}" "$permit" >/dev/null; grep -F -x "TENANT_SLUG=${tenant_slug}" "$permit" >/dev/null
  grep -F -x "WORKER_ENV_SHA256=${worker_env_sha}" "$permit" >/dev/null; grep -F -x "WORKER_STABLE_ENV_SHA256=${worker_stable_env_sha}" "$permit" >/dev/null; grep -F -x "AUTH_ENV_SHA256=${auth_env_sha}" "$permit" >/dev/null; grep -F -x "SAFE_ENV_SHA256=${safe_env_sha}" "$permit" >/dev/null
  grep -F -x "SERVICE_SHA256=${service_sha}" "$permit" >/dev/null; grep -F -x "TIMER_SHA256=${timer_sha}" "$permit" >/dev/null; grep -F -x "SUCCESSOR_RECEIPT_SHA256=${successor_sha}" "$permit" >/dev/null; grep -F -x "CONTROL_VERIFIER_OUTPUT_SHA256=${control_output_sha}" "$permit" >/dev/null
  grep -F -x "CANARY_DATE=${canary_date}" "$permit" >/dev/null; grep -F -x "PLAN_SHA256=${plan_sha}" "$permit" >/dev/null; grep -F -x "PLAN_JSON_SHA256=$(printf '%s' "$plan_json" | sha256sum | awk '{print $1}')" "$permit" >/dev/null; not_after="$(awk -F= '$1 == "NOT_AFTER_EPOCH" {print $2}' "$permit")"; [[ "$not_after" =~ ^[0-9]+$ ]] || die 'authorization permit expiry is invalid'
  if [[ "$phase" == canary ]]; then [[ "$mode" == check || "$mode" == recover || "$not_after" -gt $(date +%s) ]] || die 'authorization canary permit expired'; else [[ "$not_after" == 0 ]] || die 'timer permit must have no canary expiry'; fi
}
canonical_plan() {
  local next="${plan_attempt:-}"; [[ -n "$next" ]] || next="$(planned_attempt)"
  printf '{"actionCount":1,"activeSlot":"%s","attempt":%s,"authEnvSha256":"%s","canaryDate":"%s","controlVerifierOutputSha256":"%s","kind":"LEETPLUS_LANGAME_DAILY_WORKER_AUTHORIZATION_V1","phase":"%s","releaseSha":"%s","safeEnvSha256":"%s","serviceSha256":"%s","successorReceiptSha256":"%s","tenantSlug":"%s","timerSha256":"%s","workerEnvSha256":"%s","workerStableEnvSha256":"%s"}' \
    "$active_slot" "$next" "$auth_env_sha" "$canary_date" "$control_output_sha" "$phase" "$release_sha" "$safe_env_sha" "$service_sha" "$successor_sha" "$tenant_slug" "$timer_sha" "$worker_env_sha" "$worker_stable_env_sha"
}
prepare() { assert_state_root; assert_no_nested_mounts; assert_active_identity; assert_worker_envelope; assert_successor_receipt; assert_control; }
assert_canary_evidence() {
  local path found
  found="$(find -P "$STATE_ROOT" -maxdepth 1 -type f -name 'execution-canary-*.receipt' -print | sort)"
  [[ -n "$found" && "${#found}" -le 65536 && "$(printf '%s\n' "$found" | wc -l | tr -d '[:space:]')" -le 256 ]] || die 'bounded successful canary evidence is absent'
  while IFS= read -r path; do
    assert_regular "$path" 'root:leetplus-api-runtime:440'
    assert_canary_execution_schema "$path" || continue
    return 0
  done <<< "$found"
  die 'no successful canary evidence matches active release and tenant'
}
assert_canary_execution_schema() {
  local execution="$1" permit_path permit_digest expected_keys actual_keys permit_keys permit_actual_keys permit_inventory candidate matches=''
  local permit_attempt permit_worker_env permit_date permit_expiry expected_identity permit_name
  [[ "$(wc -l < "$execution" | tr -d '[:space:]')" == 14 && -z "$(awk -F= 'NF < 2 || seen[$1]++ { print; exit }' "$execution")" ]] || return 1
  expected_keys="$(printf '%s\n' RECORD_VERSION KIND LANGAME_DAILY_WORKER_CANARY_SUCCEEDED AUTHORIZATION_RECEIPT_SHA256 RELEASE_SHA TENANT_SLUG WORKER_ENV_SHA256 WORKER_STABLE_ENV_SHA256 AUTH_ENV_SHA256 SAFE_ENV_SHA256 SERVICE_SHA256 TIMER_SHA256 SUCCESSOR_RECEIPT_SHA256 CONTROL_VERIFIER_OUTPUT_SHA256 | sort)"
  actual_keys="$(awk -F= '{print $1}' "$execution" | sort)"; [[ "$actual_keys" == "$expected_keys" ]] || return 1
  grep -F -x 'RECORD_VERSION=1' "$execution" >/dev/null && grep -F -x 'KIND=LEETPLUS_LANGAME_DAILY_WORKER_CANARY_EXECUTION_V1' "$execution" >/dev/null && grep -F -x 'LANGAME_DAILY_WORKER_CANARY_SUCCEEDED=true' "$execution" >/dev/null || return 1
  for line in "RELEASE_SHA=${release_sha}" "TENANT_SLUG=${tenant_slug}" "WORKER_STABLE_ENV_SHA256=${worker_stable_env_sha}" "AUTH_ENV_SHA256=${auth_env_sha}" "SAFE_ENV_SHA256=${safe_env_sha}" "SERVICE_SHA256=${service_sha}" "TIMER_SHA256=${timer_sha}" "SUCCESSOR_RECEIPT_SHA256=${successor_sha}" "CONTROL_VERIFIER_OUTPUT_SHA256=${control_output_sha}"; do grep -F -x "$line" "$execution" >/dev/null || return 1; done
  permit_digest="$(awk -F= '$1 == "AUTHORIZATION_RECEIPT_SHA256" { print $2 }' "$execution")"; [[ "$permit_digest" =~ $SHA_RE ]] || return 1
  permit_inventory="$(find -P "$STATE_ROOT" -maxdepth 1 -type f -name 'authorization-canary-*.receipt' -print | sort)"
  [[ -n "$permit_inventory" && "${#permit_inventory}" -le 131072
    && "$(printf '%s\n' "$permit_inventory" | wc -l | tr -d '[:space:]')" -le 512 ]] || return 1
  while IFS= read -r candidate; do
    [[ -f "$candidate" && ! -L "$candidate" ]] || return 1
    if [[ "$(sha "$candidate")" == "$permit_digest" ]]; then matches+="${candidate}"$'\n'; fi
  done <<< "$permit_inventory"
  permit_path="${matches%$'\n'}"
  [[ -n "$permit_path" && "$permit_path" != *$'\n'* ]] || return 1
  assert_regular "$permit_path" 'root:leetplus-api-runtime:440'
  [[ "$(wc -l < "$permit_path" | tr -d '[:space:]')" == 19
    && -z "$(awk -F= 'NF < 2 || seen[$1]++ { print; exit }' "$permit_path")" ]] || return 1
  permit_keys="$(printf '%s\n' RECORD_VERSION KIND AUTHORIZATION_PERMITTED PHASE ATTEMPT PLAN_SHA256 RELEASE_SHA TENANT_SLUG WORKER_ENV_SHA256 WORKER_STABLE_ENV_SHA256 AUTH_ENV_SHA256 SAFE_ENV_SHA256 SERVICE_SHA256 TIMER_SHA256 SUCCESSOR_RECEIPT_SHA256 CONTROL_VERIFIER_OUTPUT_SHA256 CANARY_DATE NOT_AFTER_EPOCH PLAN_JSON_SHA256 | sort)"
  permit_actual_keys="$(awk -F= '{print $1}' "$permit_path" | sort)"
  [[ "$permit_actual_keys" == "$permit_keys" ]] || return 1
  for line in 'RECORD_VERSION=1' 'KIND=LEETPLUS_LANGAME_DAILY_WORKER_AUTHORIZATION_V1' 'AUTHORIZATION_PERMITTED=true' 'PHASE=canary' \
    "RELEASE_SHA=${release_sha}" "TENANT_SLUG=${tenant_slug}" "WORKER_STABLE_ENV_SHA256=${worker_stable_env_sha}" \
    "AUTH_ENV_SHA256=${auth_env_sha}" "SAFE_ENV_SHA256=${safe_env_sha}" "SERVICE_SHA256=${service_sha}" \
    "TIMER_SHA256=${timer_sha}" "SUCCESSOR_RECEIPT_SHA256=${successor_sha}" "CONTROL_VERIFIER_OUTPUT_SHA256=${control_output_sha}"; do
    grep -F -x "$line" "$permit_path" >/dev/null || return 1
  done
  permit_attempt="$(awk -F= '$1 == "ATTEMPT" { print $2 }' "$permit_path")"
  permit_worker_env="$(awk -F= '$1 == "WORKER_ENV_SHA256" { print $2 }' "$permit_path")"
  permit_date="$(awk -F= '$1 == "CANARY_DATE" { print $2 }' "$permit_path")"
  permit_expiry="$(awk -F= '$1 == "NOT_AFTER_EPOCH" { print $2 }' "$permit_path")"
  [[ "$permit_attempt" =~ ^[1-9][0-9]*$ && "$permit_worker_env" =~ $SHA_RE
    && "$permit_date" =~ ^20[0-9]{2}-[0-9]{2}-[0-9]{2}$ && "$permit_expiry" =~ ^[1-9][0-9]*$ ]] || return 1
  grep -Eq '^PLAN_SHA256=[0-9a-f]{64}$' "$permit_path" && grep -Eq '^PLAN_JSON_SHA256=[0-9a-f]{64}$' "$permit_path" || return 1
  expected_identity="$(printf 'canary:%s:%s:%s' "$permit_attempt" "$release_sha" "$permit_worker_env" | sha256sum | awk '{print $1}')"
  permit_name="$(basename -- "$permit_path")"
  [[ "$permit_name" == "authorization-canary-${permit_attempt}-${expected_identity}.receipt" ]] || return 1
  grep -F -x "WORKER_ENV_SHA256=${permit_worker_env}" "$execution" >/dev/null || return 1
  return 0
}
assert_matching_canary_execution() {
  local permit="$1" execution="${STATE_ROOT}/execution-canary-$(basename "$permit" .receipt | sed 's/^authorization-canary-//').receipt"
  assert_regular "$execution" 'root:leetplus-api-runtime:440'
  assert_canary_execution_schema "$execution" || die 'matching canary execution schema is invalid'
  grep -F -x "AUTHORIZATION_RECEIPT_SHA256=$(sha "$permit")" "$execution" >/dev/null || die 'matching canary execution is not bound to permit'
}
write_pointer() {
  local permit="$1" pointer
  pointer="$(pointer_path)"
  {
    printf 'RECORD_VERSION=1\nPERMIT_PATH=%s\nPERMIT_SHA256=%s\n' "$permit" "$(sha "$permit")"
  } | atomic_write "$pointer"
}
clear_pointer() {
  local pointer="$(pointer_path)"
  [[ -f "$pointer" && ! -L "$pointer" ]] || return 0
  assert_regular "$pointer" 'root:leetplus-api-runtime:440'; rm -f -- "$pointer"; sync -d "$STATE_ROOT"
}
write_permit() {
  local plan="$1" digest="$2" path
  path="$(receipt_path)"; [[ ! -e "$path" && ! -L "$path" ]] || die 'authorization receipt replay already exists'
  {
    printf 'RECORD_VERSION=1\nKIND=LEETPLUS_LANGAME_DAILY_WORKER_AUTHORIZATION_V1\nAUTHORIZATION_PERMITTED=true\n'
    printf 'PHASE=%s\nATTEMPT=%s\nPLAN_SHA256=%s\nRELEASE_SHA=%s\nTENANT_SLUG=%s\n' "$phase" "$attempt" "$digest" "$release_sha" "$tenant_slug"
    printf 'WORKER_ENV_SHA256=%s\nWORKER_STABLE_ENV_SHA256=%s\nAUTH_ENV_SHA256=%s\nSAFE_ENV_SHA256=%s\n' "$worker_env_sha" "$worker_stable_env_sha" "$auth_env_sha" "$safe_env_sha"
    printf 'SERVICE_SHA256=%s\nTIMER_SHA256=%s\nSUCCESSOR_RECEIPT_SHA256=%s\nCONTROL_VERIFIER_OUTPUT_SHA256=%s\n' "$service_sha" "$timer_sha" "$successor_sha" "$control_output_sha"
    if [[ "$phase" == canary ]]; then expires="$(( $(date +%s) + 2700 ))"; else expires=0; fi
    printf 'CANARY_DATE=%s\nNOT_AFTER_EPOCH=%s\nPLAN_JSON_SHA256=%s\n' "$canary_date" "$expires" "$(printf '%s' "$plan" | sha256sum | awk '{print $1}')"
  } | atomic_write "$path"
  write_pointer "$path"
  printf '%s' "$path"
}
wait_for_canary_terminal() {
  local before_invocation="$1" invocation active result status deadline
  deadline="$(( $(date +%s) + 2700 ))"
  while (( $(date +%s) < deadline )); do
    invocation="$(systemctl_bounded show --property=InvocationID --value "$WORKER_SERVICE")"
    active="$(systemctl_bounded show --property=ActiveState --value "$WORKER_SERVICE")"
    result="$(systemctl_bounded show --property=Result --value "$WORKER_SERVICE")"
    status="$(systemctl_bounded show --property=ExecMainStatus --value "$WORKER_SERVICE")"
    [[ -n "$invocation" && "$invocation" != "$before_invocation" ]] || { /usr/bin/sleep 2; continue; }
    if [[ "$active" == inactive ]]; then
      [[ "$result" == success && "$status" == 0 ]] || return 1
      service_is_quiescent && worker_jobs_are_absent && return 0
    fi
    /usr/bin/sleep 2
  done
  return 2
}
write_execution() {
  local permit="$1" path="${STATE_ROOT}/execution-canary-$(basename "$permit" .receipt | sed 's/^authorization-canary-//').receipt"
  [[ ! -e "$path" && ! -L "$path" ]] || die 'canary execution receipt replay already exists'
  {
    printf 'RECORD_VERSION=1\nKIND=LEETPLUS_LANGAME_DAILY_WORKER_CANARY_EXECUTION_V1\nLANGAME_DAILY_WORKER_CANARY_SUCCEEDED=true\n'
    printf 'AUTHORIZATION_RECEIPT_SHA256=%s\nRELEASE_SHA=%s\nTENANT_SLUG=%s\nWORKER_ENV_SHA256=%s\nWORKER_STABLE_ENV_SHA256=%s\nAUTH_ENV_SHA256=%s\nSAFE_ENV_SHA256=%s\nSERVICE_SHA256=%s\nTIMER_SHA256=%s\nSUCCESSOR_RECEIPT_SHA256=%s\nCONTROL_VERIFIER_OUTPUT_SHA256=%s\n' "$(sha "$permit")" "$release_sha" "$tenant_slug" "$worker_env_sha" "$worker_stable_env_sha" "$auth_env_sha" "$safe_env_sha" "$service_sha" "$timer_sha" "$successor_sha" "$control_output_sha"
  } | atomic_write "$path"
}
write_canary_failure() {
  local permit="$1" path="${STATE_ROOT}/failed-canary-$(basename "$permit" .receipt | sed 's/^authorization-canary-//')-$(date +%s).receipt"
  [[ ! -e "$path" && ! -L "$path" ]] || die 'canary failure evidence path replayed unexpectedly'
  {
    printf 'RECORD_VERSION=1\nKIND=LEETPLUS_LANGAME_DAILY_WORKER_CANARY_FAILURE_V1\nLANGAME_DAILY_WORKER_CANARY_SUCCEEDED=false\n'
    printf 'AUTHORIZATION_RECEIPT_SHA256=%s\nRELEASE_SHA=%s\nTENANT_SLUG=%s\nWORKER_ENV_SHA256=%s\n' "$(sha "$permit")" "$release_sha" "$tenant_slug" "$worker_env_sha"
  } | atomic_write "$path"
}
write_timer_validation() {
  local permit="$1" path="${STATE_ROOT}/validation-timer-$(basename "$permit" .receipt | sed 's/^authorization-timer-//').receipt"
  [[ ! -e "$path" && ! -L "$path" ]] || die 'timer-profile validation receipt replay already exists'
  {
    printf 'RECORD_VERSION=1\nKIND=LEETPLUS_LANGAME_DAILY_WORKER_TIMER_PROFILE_VALIDATION_V1\nLANGAME_DAILY_WORKER_TIMER_PROFILE_VALIDATED=true\n'
    printf 'AUTHORIZATION_RECEIPT_SHA256=%s\nRELEASE_SHA=%s\nTENANT_SLUG=%s\nWORKER_ENV_SHA256=%s\nWORKER_STABLE_ENV_SHA256=%s\nAUTH_ENV_SHA256=%s\nSAFE_ENV_SHA256=%s\nSERVICE_SHA256=%s\nTIMER_SHA256=%s\nSUCCESSOR_RECEIPT_SHA256=%s\nCONTROL_VERIFIER_OUTPUT_SHA256=%s\n' "$(sha "$permit")" "$release_sha" "$tenant_slug" "$worker_env_sha" "$worker_stable_env_sha" "$auth_env_sha" "$safe_env_sha" "$service_sha" "$timer_sha" "$successor_sha" "$control_output_sha"
  } | atomic_write "$path"
}
assert_timer_validation() {
  local permit="$1" validation="${STATE_ROOT}/validation-timer-$(basename "$permit" .receipt | sed 's/^authorization-timer-//').receipt" expected_keys actual_keys
  assert_regular "$validation" 'root:leetplus-api-runtime:440'
  [[ "$(wc -l < "$validation" | tr -d '[:space:]')" == 14
    && -z "$(awk -F= 'NF < 2 || seen[$1]++ { print; exit }' "$validation")" ]] || die 'timer-profile validation schema is invalid'
  expected_keys="$(printf '%s\n' RECORD_VERSION KIND LANGAME_DAILY_WORKER_TIMER_PROFILE_VALIDATED AUTHORIZATION_RECEIPT_SHA256 RELEASE_SHA TENANT_SLUG WORKER_ENV_SHA256 WORKER_STABLE_ENV_SHA256 AUTH_ENV_SHA256 SAFE_ENV_SHA256 SERVICE_SHA256 TIMER_SHA256 SUCCESSOR_RECEIPT_SHA256 CONTROL_VERIFIER_OUTPUT_SHA256 | sort)"
  actual_keys="$(awk -F= '{print $1}' "$validation" | sort)"
  [[ "$actual_keys" == "$expected_keys" ]] || die 'timer-profile validation key set drifted'
  grep -F -x 'RECORD_VERSION=1' "$validation" >/dev/null && grep -F -x 'KIND=LEETPLUS_LANGAME_DAILY_WORKER_TIMER_PROFILE_VALIDATION_V1' "$validation" >/dev/null && grep -F -x 'LANGAME_DAILY_WORKER_TIMER_PROFILE_VALIDATED=true' "$validation" >/dev/null || die 'timer-profile validation evidence is invalid'
  for line in "AUTHORIZATION_RECEIPT_SHA256=$(sha "$permit")" "RELEASE_SHA=${release_sha}" "TENANT_SLUG=${tenant_slug}" "WORKER_ENV_SHA256=${worker_env_sha}" "WORKER_STABLE_ENV_SHA256=${worker_stable_env_sha}" "AUTH_ENV_SHA256=${auth_env_sha}" "SAFE_ENV_SHA256=${safe_env_sha}" "SERVICE_SHA256=${service_sha}" "TIMER_SHA256=${timer_sha}" "SUCCESSOR_RECEIPT_SHA256=${successor_sha}" "CONTROL_VERIFIER_OUTPUT_SHA256=${control_output_sha}"; do grep -F -x "$line" "$validation" >/dev/null || die 'timer-profile validation evidence drifted'; done
}
write_timer_enabled() {
  local permit="$1" path="${STATE_ROOT}/timer-enabled-$(basename "$permit" .receipt | sed 's/^authorization-timer-//').receipt"
  [[ ! -e "$path" && ! -L "$path" ]] || return 0
  {
    printf 'RECORD_VERSION=1\nKIND=LEETPLUS_LANGAME_DAILY_WORKER_TIMER_ENABLEMENT_V1\nLANGAME_DAILY_WORKER_TIMER_ENABLED=true\n'
    printf 'AUTHORIZATION_RECEIPT_SHA256=%s\nRELEASE_SHA=%s\nTENANT_SLUG=%s\nWORKER_ENV_SHA256=%s\nWORKER_STABLE_ENV_SHA256=%s\n' "$(sha "$permit")" "$release_sha" "$tenant_slug" "$worker_env_sha" "$worker_stable_env_sha"
  } | atomic_write "$path"
}
assert_timer_enabled() {
  local permit="$1" path="${STATE_ROOT}/timer-enabled-$(basename "$permit" .receipt | sed 's/^authorization-timer-//').receipt" expected_keys actual_keys
  assert_regular "$path" 'root:leetplus-api-runtime:440'
  [[ "$(wc -l < "$path" | tr -d '[:space:]')" == 8
    && -z "$(awk -F= 'NF < 2 || seen[$1]++ { print; exit }' "$path")" ]] || die 'timer enablement receipt schema is invalid'
  expected_keys="$(printf '%s\n' RECORD_VERSION KIND LANGAME_DAILY_WORKER_TIMER_ENABLED AUTHORIZATION_RECEIPT_SHA256 RELEASE_SHA TENANT_SLUG WORKER_ENV_SHA256 WORKER_STABLE_ENV_SHA256 | sort)"
  actual_keys="$(awk -F= '{print $1}' "$path" | sort)"
  [[ "$actual_keys" == "$expected_keys" ]] || die 'timer enablement receipt key set drifted'
  for line in 'RECORD_VERSION=1' 'KIND=LEETPLUS_LANGAME_DAILY_WORKER_TIMER_ENABLEMENT_V1' 'LANGAME_DAILY_WORKER_TIMER_ENABLED=true' \
    "AUTHORIZATION_RECEIPT_SHA256=$(sha "$permit")" "RELEASE_SHA=${release_sha}" "TENANT_SLUG=${tenant_slug}" \
    "WORKER_ENV_SHA256=${worker_env_sha}" "WORKER_STABLE_ENV_SHA256=${worker_stable_env_sha}"; do
    grep -F -x "$line" "$path" >/dev/null || die 'timer enablement receipt drifted'
  done
}
write_intent() {
  local plan_digest="$1" permit="$2" intent
  intent="$(intent_path)"; [[ ! -e "$intent" && ! -L "$intent" ]] || die 'authorization intent replay already exists'
  {
    printf 'RECORD_VERSION=1\nKIND=LEETPLUS_LANGAME_DAILY_WORKER_AUTHORIZATION_INTENT_V1\nPHASE=%s\nPLAN_SHA256=%s\nRELEASE_SHA=%s\nPERMIT_PATH=%s\n' \
      "$phase" "$plan_digest" "$release_sha" "$permit"
  } | atomic_write_root "$intent"
}
clear_intent() { local intent; intent="$(intent_path)"; [[ -f "$intent" && ! -L "$intent" ]] || die 'authorization intent disappeared unexpectedly'; rm -f -- "$intent"; sync -d "$STATE_ROOT"; }
recover_intent() {
  local intent permit recorded_phase recorded_release current_permit before_invocation validation_path service_authorization timer_authorization
  intent="$(intent_path)"; [[ -e "$intent" || -L "$intent" ]] || die 'no authorization intent exists for this phase'
  assert_regular "$intent" 'root:root:400'
  recorded_phase="$(awk -F= '$1 == "PHASE" { print $2 }' "$intent")"; recorded_release="$(awk -F= '$1 == "RELEASE_SHA" { print $2 }' "$intent")"; permit="$(awk -F= '$1 == "PERMIT_PATH" { print $2 }' "$intent")"
  [[ "$recorded_phase" == "$phase" && "$recorded_release" == "$release_sha" && "$permit" =~ ^${STATE_ROOT}/authorization-${phase}-[1-9][0-9]*-[0-9a-f]{64}\.receipt$ ]] || die 'authorization intent does not match the exact current phase/release'
  if [[ ! -e "$permit" && ! -L "$permit" ]]; then
    restore_worker_fences; clear_intent
    die 'interrupted authorization did not publish a permit; fences are intact and a new plan is required'
  fi
  assert_regular "$permit" 'root:leetplus-api-runtime:440'
  if [[ "$phase" == canary ]]; then
    stop_service_and_assert_quiescent
    timer_is_disabled_quiescent || die 'canary recovery found a non-quiescent timer'
    restore_worker_fences; clear_pointer; clear_intent
    die 'canary intent was recovered into a fenced terminal state without accepting a possibly stale service result; re-plan before another execution'
  fi
  if [[ ! -e "$(pointer_path)" && ! -L "$(pointer_path)" ]]; then
    disable_timer_and_assert_quiescent; restore_worker_fences; clear_intent
    die 'timer recovery found no published permit pointer; timer was fenced and disabled'
  fi
  load_current_attempt
  current_permit="$(receipt_path)"
  [[ "$current_permit" == "$permit" ]] || die 'timer recovery pointer does not select the intent permit'
  plan_attempt="$attempt"; plan_json="$(canonical_plan)"; plan_sha="$(printf '%s' "$plan_json" | sha256sum | awk '{print $1}')"
  assert_permit "$permit"
  service_authorization="$(dirname -- "$(fence_path "$WORKER_SERVICE")")/91-leetplus-langame-worker-authorization.conf"
  timer_authorization="$(dirname -- "$(fence_path "$WORKER_TIMER")")/91-leetplus-langame-worker-authorization.conf"
  if [[ ! -f "$service_authorization" || -L "$service_authorization" || ! -f "$timer_authorization" || -L "$timer_authorization" ]]; then
    disable_timer_and_assert_quiescent; restore_worker_fences; clear_pointer; clear_intent
    die 'timer recovery found incomplete authorization drop-ins; timer was fenced and disabled'
  fi
  assert_authorization_dropins "$permit"
  validation_path="${STATE_ROOT}/validation-timer-$(basename "$permit" .receipt | sed 's/^authorization-timer-//').receipt"
  if [[ ! -f "$validation_path" || -L "$validation_path" ]]; then
    disable_timer_and_assert_quiescent; restore_worker_fences; clear_pointer; clear_intent
    die 'timer recovery found no exact timer-profile validation evidence; timer was fenced and disabled'
  fi
  assert_timer_validation "$permit"
  if systemctl_bounded is-enabled --quiet "$WORKER_TIMER" && systemctl_bounded is-active --quiet "$WORKER_TIMER"; then
    before_invocation="$(systemctl_bounded show --property=InvocationID --value "$WORKER_SERVICE")"
    if settle_enabled_timer "$before_invocation"; then
      write_timer_enabled "$permit"; assert_timer_enabled "$permit"; clear_intent
      if "$WORKER_VERIFIER" >/dev/null && "$DRAIN_VERIFIER" >/dev/null; then
        printf 'LANGAME_DAILY_WORKER_AUTHORIZATION_RECOVERED=PASS phase=timer\n'
        return 0
      fi
      disable_timer_and_assert_quiescent; restore_worker_fences; clear_pointer
      die 'timer recovery final verification failed; authorization was revoked'
    fi
  fi
  disable_timer_and_assert_quiescent
  restore_worker_fences; clear_pointer; clear_intent
  die 'timer intent was recovered into a fenced terminal state; re-plan before another execution'
}
fence_path() { printf '/etc/systemd/system/%s.d/90-leetplus-nminus1-start-fence.conf' "$1"; }
assert_worker_fence() {
  local unit="$1" directory path
  path="$(fence_path "$unit")"; directory="$(dirname -- "$path")"
  assert_directory "$directory" 'root:root:755'
  assert_regular "$path" 'root:root:644'
  [[ "$(tr -d '\r' < "$path")" == $'[Unit]\n'"${FENCE_LINE}" ]] || die "worker fence content drifted: ${unit}"
}
assert_exact_loaded_fences_only() {
  local unit expected actual
  for unit in "$WORKER_SERVICE" "$WORKER_TIMER"; do
    expected="$(fence_path "$unit")"
    actual="$(systemctl_bounded show --property=DropInPaths --value "$unit" | tr ' ' '\n' | sed '/^$/d' | sort)"
    [[ "$actual" == "$expected" ]] || die "loaded worker drop-ins are not exactly the legacy fence: ${unit}"
  done
}
restore_worker_fences() {
  local unit path directory
  service_is_quiescent || die 'worker service is not strictly quiescent before fence restoration'
  timer_is_disabled_quiescent || die 'worker timer is not strictly disabled/quiescent before fence restoration'
  for unit in "$WORKER_SERVICE" "$WORKER_TIMER"; do
    path="$(dirname -- "$(fence_path "$unit")")/91-leetplus-langame-worker-authorization.conf"; directory="$(dirname -- "$path")"
    assert_directory "$directory" 'root:root:755'
    [[ ! -L "$path" ]] || die 'worker authorization drop-in is linked'
    if [[ -e "$path" ]]; then assert_regular "$path" 'root:root:644'; rm -f -- "$path"; sync -d "$directory"; fi
    assert_worker_fence "$unit"
  done
  systemctl_bounded daemon-reload || die 'cannot reload restored worker fence conditions'
}
disable_timer_and_assert_quiescent() {
  systemctl_bounded disable --now "$WORKER_TIMER" || die 'cannot disable failed worker timer'
  stop_service_and_assert_quiescent
  timer_is_disabled_quiescent || die 'failed worker timer did not reach exact disabled/PID/cgroup quiescence'
}
assert_authorization_dropins() {
  local permit="$1" unit legacy_path authorization_path expected actual
  for unit in "$WORKER_SERVICE" "$WORKER_TIMER"; do
    legacy_path="$(fence_path "$unit")"
    authorization_path="$(dirname -- "$legacy_path")/91-leetplus-langame-worker-authorization.conf"
    assert_worker_fence "$unit"; assert_regular "$authorization_path" 'root:root:644'
    [[ "$(tr -d '\r' < "$authorization_path")" == $'[Unit]\nConditionPathExists=\n'"ConditionPathExists=${permit}" ]] \
      || die "worker authorization drop-in content drifted: ${unit}"
    expected="$(printf '%s\n%s\n' "$legacy_path" "$authorization_path" | sort)"
    actual="$(systemctl_bounded show --property=DropInPaths --value "$unit" | tr ' ' '\n' | sed '/^$/d' | sort)"
    [[ "$actual" == "$expected" ]] || die "loaded worker authorization drop-ins drifted: ${unit}"
  done
}
settle_enabled_timer() {
  local before_invocation="$1" current_invocation result status stable=0 previous_sample='' _
  [[ -z "$before_invocation" || "$before_invocation" =~ ^[0-9a-f]{32}$ || "$before_invocation" =~ ^[A-Za-z0-9_-]{1,128}$ ]] || return 1
  for _ in {1..30}; do
    if timer_is_waiting_quiescent && service_is_quiescent && worker_jobs_are_absent; then
      current_invocation="$(systemctl_bounded show --property=InvocationID --value "$WORKER_SERVICE")" || return 1
      [[ -z "$current_invocation" || "$current_invocation" =~ ^[0-9a-f]{32}$ || "$current_invocation" =~ ^[A-Za-z0-9_-]{1,128}$ ]] || return 1
      if [[ -n "$current_invocation" ]]; then
        result="$(systemctl_bounded show --property=Result --value "$WORKER_SERVICE")" || return 1
        status="$(systemctl_bounded show --property=ExecMainStatus --value "$WORKER_SERVICE")" || return 1
        [[ "$result" == success && "$status" == 0 ]] || return 1
      fi
      if [[ "$current_invocation" == "$previous_sample" ]]; then stable="$((stable + 1))"; else stable=1; previous_sample="$current_invocation"; fi
      ((stable >= 3)) && return 0
    else
      stable=0; previous_sample=''
    fi
    /usr/bin/sleep 2
  done
  return 1
}
release_worker_fences() {
  local permit="$1" unit path directory temporary expected
  for unit in "$WORKER_SERVICE" "$WORKER_TIMER"; do assert_worker_fence "$unit"; done
  service_is_quiescent || die 'worker service is not strictly quiescent before fence release'
  timer_is_disabled_quiescent || die 'worker timer is not strictly disabled/quiescent before fence release'
  for unit in "$WORKER_SERVICE" "$WORKER_TIMER"; do
    directory="$(dirname -- "$(fence_path "$unit")")"; path="${directory}/91-leetplus-langame-worker-authorization.conf"
    [[ ! -e "$path" && ! -L "$path" ]] || die 'worker authorization drop-in already exists'
    temporary="$(mktemp "${directory}/.leetplus-langame-worker-authorization.XXXXXX")"
    expected=$'[Unit]\nConditionPathExists=\n'"ConditionPathExists=${permit}"
    printf '%s\n' "$expected" > "$temporary"; chown root:root "$temporary"; chmod 0644 "$temporary"
    [[ "$(stat -c '%U:%G:%a:%h' -- "$temporary")" == 'root:root:644:1' ]] || die 'worker authorization temporary authority drifted'
    mv -T "$temporary" "$path"; sync -f "$path"; sync -d "$directory"
  done
  systemctl_bounded daemon-reload || die 'cannot load worker authorization conditions'
  assert_authorization_dropins "$permit"
}

timer_validation_path() { printf '%s/validation-timer-%s.receipt' "$STATE_ROOT" "$(basename "$1" .receipt | sed 's/^authorization-timer-//')"; }
timer_enabled_path() { printf '%s/timer-enabled-%s.receipt' "$STATE_ROOT" "$(basename "$1" .receipt | sed 's/^authorization-timer-//')"; }
revoke_intent_path() { printf '%s/authorization.revoke.intent' "$STATE_ROOT"; }
clear_revoke_intent() { local path; path="$(revoke_intent_path)"; assert_regular "$path" 'root:root:400'; rm -f -- "$path"; sync -d "$STATE_ROOT"; }
revocation_pointer_path() { printf '%s/latest-revocation.receipt' "$STATE_ROOT"; }
revocation_receipt_path() { printf '%s/revocation-timer-%s.receipt' "$STATE_ROOT" "$(sha "$1")"; }
timer_validation=''; timer_enabled=''; revoke_plan_json=''; revoke_plan_sha=''; revoke_timestamp=''
load_current_timer_authorization() {
  load_current_attempt
  plan_attempt="$attempt"; plan_json="$(canonical_plan)"; plan_sha="$(printf '%s' "$plan_json" | sha256sum | awk '{print $1}')"
  permit="$(receipt_path)"; assert_permit "$permit"
  timer_validation="$(timer_validation_path "$permit")"; timer_enabled="$(timer_enabled_path "$permit")"
  assert_timer_validation "$permit"; assert_timer_enabled "$permit"; assert_authorization_dropins "$permit"
}
canonical_revoke_plan() {
  printf '{"actionCount":1,"activeSlot":"%s","authorizationReceiptSha256":"%s","controlVerifierOutputSha256":"%s","kind":"LEETPLUS_LANGAME_DAILY_WORKER_REVOCATION_V1","releaseSha":"%s","successorReceiptSha256":"%s","tenantSlug":"%s","timerEnablementReceiptSha256":"%s","timerValidationReceiptSha256":"%s","workerEnvSha256":"%s"}' \
    "$active_slot" "$(sha "$permit")" "$control_output_sha" "$release_sha" "$successor_sha" "$tenant_slug" "$(sha "$timer_enabled")" "$(sha "$timer_validation")" "$worker_env_sha"
}
write_revoke_intent() {
  local path; path="$(revoke_intent_path)"; [[ ! -e "$path" && ! -L "$path" ]] || die 'worker revocation intent already exists'
  revoke_timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  {
    printf 'RECORD_VERSION=1\nKIND=LEETPLUS_LANGAME_DAILY_WORKER_REVOCATION_INTENT_V1\nPHASE=timer\n'
    printf 'PLAN_SHA256=%s\nRELEASE_SHA=%s\nPERMIT_PATH=%s\nAUTHORIZATION_RECEIPT_SHA256=%s\n' "$revoke_plan_sha" "$release_sha" "$permit" "$(sha "$permit")"
    printf 'TIMER_VALIDATION_RECEIPT_SHA256=%s\nTIMER_ENABLEMENT_RECEIPT_SHA256=%s\nWORKER_ENV_SHA256=%s\nSUCCESSOR_RECEIPT_SHA256=%s\nCONTROL_VERIFIER_OUTPUT_SHA256=%s\nSTARTED_AT=%s\n' "$(sha "$timer_validation")" "$(sha "$timer_enabled")" "$worker_env_sha" "$successor_sha" "$control_output_sha" "$revoke_timestamp"
  } | atomic_write_root "$path"
}
load_revoke_intent() {
  local path expected_keys actual_keys recorded_permit_sha recorded_validation_sha recorded_enabled_sha
  path="$(revoke_intent_path)"; assert_regular "$path" 'root:root:400'
  [[ "$(wc -l < "$path" | tr -d '[:space:]')" == 13 && -z "$(awk -F= 'NF < 2 || seen[$1]++ { print; exit }' "$path")" ]] || die 'worker revocation intent schema is invalid'
  expected_keys="$(printf '%s\n' RECORD_VERSION KIND PHASE PLAN_SHA256 RELEASE_SHA PERMIT_PATH AUTHORIZATION_RECEIPT_SHA256 TIMER_VALIDATION_RECEIPT_SHA256 TIMER_ENABLEMENT_RECEIPT_SHA256 WORKER_ENV_SHA256 SUCCESSOR_RECEIPT_SHA256 CONTROL_VERIFIER_OUTPUT_SHA256 STARTED_AT | sort)"
  actual_keys="$(awk -F= '{print $1}' "$path" | sort)"; [[ "$actual_keys" == "$expected_keys" ]] || die 'worker revocation intent key set drifted'
  grep -F -x 'RECORD_VERSION=1' "$path" >/dev/null; grep -F -x 'KIND=LEETPLUS_LANGAME_DAILY_WORKER_REVOCATION_INTENT_V1' "$path" >/dev/null; grep -F -x 'PHASE=timer' "$path" >/dev/null
  grep -F -x "RELEASE_SHA=${release_sha}" "$path" >/dev/null; grep -F -x "WORKER_ENV_SHA256=${worker_env_sha}" "$path" >/dev/null; grep -F -x "SUCCESSOR_RECEIPT_SHA256=${successor_sha}" "$path" >/dev/null; grep -F -x "CONTROL_VERIFIER_OUTPUT_SHA256=${control_output_sha}" "$path" >/dev/null
  revoke_plan_sha="$(awk -F= '$1 == "PLAN_SHA256" { print $2 }' "$path")"; [[ "$revoke_plan_sha" =~ $SHA_RE ]] || die 'worker revocation intent plan digest is invalid'
  permit="$(awk -F= '$1 == "PERMIT_PATH" { print $2 }' "$path")"; [[ "$permit" =~ ^${STATE_ROOT}/authorization-timer-[1-9][0-9]*-[0-9a-f]{64}\.receipt$ ]] || die 'worker revocation intent permit path is invalid'
  recorded_permit_sha="$(awk -F= '$1 == "AUTHORIZATION_RECEIPT_SHA256" { print $2 }' "$path")"; recorded_validation_sha="$(awk -F= '$1 == "TIMER_VALIDATION_RECEIPT_SHA256" { print $2 }' "$path")"; recorded_enabled_sha="$(awk -F= '$1 == "TIMER_ENABLEMENT_RECEIPT_SHA256" { print $2 }' "$path")"
  [[ "$recorded_permit_sha" =~ $SHA_RE && "$recorded_validation_sha" =~ $SHA_RE && "$recorded_enabled_sha" =~ $SHA_RE ]] || die 'worker revocation intent evidence digest is invalid'
  revoke_timestamp="$(awk -F= '$1 == "STARTED_AT" { print $2 }' "$path")"; [[ "$revoke_timestamp" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] || die 'worker revocation intent timestamp is invalid'
  assert_regular "$permit" 'root:leetplus-api-runtime:440'; [[ "$(sha "$permit")" == "$recorded_permit_sha" ]] || die 'worker revocation permit digest drifted'
  attempt="$(awk -F= '$1 == "ATTEMPT" { print $2 }' "$permit")"; [[ "$attempt" =~ ^[1-9][0-9]*$ ]] || die 'worker revocation permit attempt is invalid'
  plan_attempt="$attempt"; plan_json="$(canonical_plan)"; plan_sha="$(printf '%s' "$plan_json" | sha256sum | awk '{print $1}')"; assert_permit "$permit"
  timer_validation="$(timer_validation_path "$permit")"; timer_enabled="$(timer_enabled_path "$permit")"
  assert_timer_validation "$permit"; assert_timer_enabled "$permit"
  [[ "$(sha "$timer_validation")" == "$recorded_validation_sha" && "$(sha "$timer_enabled")" == "$recorded_enabled_sha" ]] || die 'worker revocation source evidence digest drifted'
  revoke_plan_json="$(canonical_revoke_plan)"; [[ "$(printf '%s' "$revoke_plan_json" | sha256sum | awk '{print $1}')" == "$revoke_plan_sha" ]] || die 'worker revocation plan no longer reproduces intent'
}
revocation_receipt_content() {
  printf 'RECORD_VERSION=1\nKIND=LEETPLUS_LANGAME_DAILY_WORKER_REVOCATION_V1\nAUTHORIZATION_REVOKED=true\n'
  printf 'PLAN_SHA256=%s\nAUTHORIZATION_RECEIPT_PATH=%s\nAUTHORIZATION_RECEIPT_SHA256=%s\nTIMER_VALIDATION_RECEIPT_SHA256=%s\nTIMER_ENABLEMENT_RECEIPT_SHA256=%s\n' "$revoke_plan_sha" "$permit" "$(sha "$permit")" "$(sha "$timer_validation")" "$(sha "$timer_enabled")"
  printf 'RELEASE_SHA=%s\nTENANT_SLUG=%s\nWORKER_ENV_SHA256=%s\nSUCCESSOR_RECEIPT_SHA256=%s\nCONTROL_VERIFIER_OUTPUT_SHA256=%s\nREVOKED_AT=%s\n' "$release_sha" "$tenant_slug" "$worker_env_sha" "$successor_sha" "$control_output_sha" "$revoke_timestamp"
}
write_revocation_receipt() {
  local path pointer; path="$(revocation_receipt_path "$permit")"; pointer="$(revocation_pointer_path)"
  if [[ -e "$path" || -L "$path" ]]; then assert_regular "$path" 'root:root:400'; cmp -s -- "$path" <(revocation_receipt_content) || die 'existing worker revocation receipt conflicts with recovery'; else revocation_receipt_content | atomic_write_root "$path"; fi
  if [[ -e "$pointer" || -L "$pointer" ]]; then assert_regular "$pointer" 'root:root:400'; fi
  { printf 'RECORD_VERSION=1\nRECEIPT_PATH=%s\nRECEIPT_SHA256=%s\n' "$path" "$(sha "$path")"; } | atomic_write_root "$pointer"
}
assert_revocation_receipt() {
  local pointer path expected_keys actual_keys
  pointer="$(revocation_pointer_path)"; assert_regular "$pointer" 'root:root:400'
  [[ "$(wc -l < "$pointer" | tr -d '[:space:]')" == 3 && -z "$(awk -F= 'NF < 2 || seen[$1]++ { print; exit }' "$pointer")" && "$(awk -F= '{print $1}' "$pointer" | sort)" == "$(printf '%s\n' RECORD_VERSION RECEIPT_PATH RECEIPT_SHA256 | sort)" ]] || die 'worker revocation pointer schema drifted'
  grep -F -x 'RECORD_VERSION=1' "$pointer" >/dev/null || die 'worker revocation pointer version drifted'
  path="$(awk -F= '$1 == "RECEIPT_PATH" { print $2 }' "$pointer")"; [[ "$path" == "$(revocation_receipt_path "$permit")" ]] || die 'worker revocation pointer path drifted'; assert_regular "$path" 'root:root:400'; grep -F -x "RECEIPT_SHA256=$(sha "$path")" "$pointer" >/dev/null || die 'worker revocation pointer digest drifted'
  [[ "$(wc -l < "$path" | tr -d '[:space:]')" == 14 && -z "$(awk -F= 'NF < 2 || seen[$1]++ { print; exit }' "$path")" ]] || die 'worker revocation receipt schema drifted'
  expected_keys="$(printf '%s\n' RECORD_VERSION KIND AUTHORIZATION_REVOKED PLAN_SHA256 AUTHORIZATION_RECEIPT_PATH AUTHORIZATION_RECEIPT_SHA256 TIMER_VALIDATION_RECEIPT_SHA256 TIMER_ENABLEMENT_RECEIPT_SHA256 RELEASE_SHA TENANT_SLUG WORKER_ENV_SHA256 SUCCESSOR_RECEIPT_SHA256 CONTROL_VERIFIER_OUTPUT_SHA256 REVOKED_AT | sort)"; actual_keys="$(awk -F= '{print $1}' "$path" | sort)"; [[ "$actual_keys" == "$expected_keys" ]] || die 'worker revocation receipt key set drifted'
  revoke_timestamp="$(awk -F= '$1 == "REVOKED_AT" { print $2 }' "$path")"; [[ "$revoke_timestamp" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] || die 'worker revocation receipt timestamp drifted'
  revoke_plan_sha="$(awk -F= '$1 == "PLAN_SHA256" { print $2 }' "$path")"
  cmp -s -- "$path" <(revocation_receipt_content) || die 'worker revocation receipt content drifted'
}
assert_revoked_runtime() {
  service_is_quiescent || die 'revoked worker service is not strictly quiescent'
  timer_is_disabled_quiescent || die 'revoked worker timer is not strictly disabled/quiescent'
  assert_no_authorization_dropins; assert_exact_loaded_fences_only
  [[ ! -e "$(pointer_path)" && ! -L "$(pointer_path)" ]] || die 'revoked timer authorization pointer remains active'
  "$DRAIN_VERIFIER" >/dev/null || die 'generic legacy drain verifier rejected revoked worker state'
}
clear_timer_pointer_for_permit() {
  local expected="$permit" selected
  if [[ ! -e "$(pointer_path)" && ! -L "$(pointer_path)" ]]; then return 0; fi
  load_current_attempt; selected="$(receipt_path)"
  [[ "$selected" == "$expected" ]] || die 'active timer pointer changed during revocation'
  permit="$expected"; clear_pointer
}
prequiesce_revoke_recovery() {
  local path recorded_release recorded_permit
  path="$(revoke_intent_path)"; assert_regular "$path" 'root:root:400'
  recorded_release="$(awk -F= '$1 == "RELEASE_SHA" { print $2 }' "$path")"; recorded_permit="$(awk -F= '$1 == "PERMIT_PATH" { print $2 }' "$path")"
  [[ "$recorded_release" == "$release_sha" && "$recorded_permit" =~ ^${STATE_ROOT}/authorization-timer-[1-9][0-9]*-[0-9a-f]{64}\.receipt$ ]] || die 'worker revocation recovery intent identity is unsafe'
  disable_timer_and_assert_quiescent; restore_worker_fences
}
load_latest_revocation() {
  local pointer receipt_path_value receipt_digest
  pointer="$(revocation_pointer_path)"; assert_regular "$pointer" 'root:root:400'
  [[ "$(wc -l < "$pointer" | tr -d '[:space:]')" == 3 && -z "$(awk -F= 'NF < 2 || seen[$1]++ { print; exit }' "$pointer")" && "$(awk -F= '{print $1}' "$pointer" | sort)" == "$(printf '%s\n' RECORD_VERSION RECEIPT_PATH RECEIPT_SHA256 | sort)" ]] || die 'latest worker revocation pointer schema drifted'
  grep -F -x 'RECORD_VERSION=1' "$pointer" >/dev/null || die 'latest worker revocation pointer version drifted'
  receipt_path_value="$(awk -F= '$1 == "RECEIPT_PATH" { print $2 }' "$pointer")"; receipt_digest="$(awk -F= '$1 == "RECEIPT_SHA256" { print $2 }' "$pointer")"
  [[ "$receipt_path_value" =~ ^${STATE_ROOT}/revocation-timer-[0-9a-f]{64}\.receipt$ && "$receipt_digest" =~ $SHA_RE ]] || die 'latest worker revocation pointer values are invalid'
  assert_regular "$receipt_path_value" 'root:root:400'; [[ "$(sha "$receipt_path_value")" == "$receipt_digest" ]] || die 'latest worker revocation receipt digest drifted'
  permit="$(awk -F= '$1 == "AUTHORIZATION_RECEIPT_PATH" { print $2 }' "$receipt_path_value")"; [[ "$permit" =~ ^${STATE_ROOT}/authorization-timer-[1-9][0-9]*-[0-9a-f]{64}\.receipt$ ]] || die 'latest worker revocation source permit path is invalid'
  assert_regular "$permit" 'root:leetplus-api-runtime:440'; attempt="$(awk -F= '$1 == "ATTEMPT" { print $2 }' "$permit")"; [[ "$attempt" =~ ^[1-9][0-9]*$ ]] || die 'latest revoked worker permit attempt is invalid'
  plan_attempt="$attempt"; plan_json="$(canonical_plan)"; plan_sha="$(printf '%s' "$plan_json" | sha256sum | awk '{print $1}')"; assert_permit "$permit"
  timer_validation="$(timer_validation_path "$permit")"; timer_enabled="$(timer_enabled_path "$permit")"; assert_timer_validation "$permit"; assert_timer_enabled "$permit"
  revoke_plan_sha="$(awk -F= '$1 == "PLAN_SHA256" { print $2 }' "$receipt_path_value")"; revoke_plan_json="$(canonical_revoke_plan)"; [[ "$revoke_plan_sha" =~ $SHA_RE && "$(printf '%s' "$revoke_plan_json" | sha256sum | awk '{print $1}')" == "$revoke_plan_sha" ]] || die 'latest worker revocation plan drifted'
  assert_revocation_receipt
}

case "$mode" in
  revoke-plan)
    lock_file 9 "$INSTALL_LOCK"; lock_file 8 "$CUTOVER_LOCK"; prepare; assert_no_pending_operations
    load_current_timer_authorization
    "$WORKER_VERIFIER" >/dev/null || die 'worker authorization verifier rejected revocation source state'
    "$DRAIN_VERIFIER" >/dev/null || die 'generic drain verifier rejected revocation source state'
    revoke_plan_json="$(canonical_revoke_plan)"; revoke_plan_sha="$(printf '%s' "$revoke_plan_json" | sha256sum | awk '{print $1}')"
    printf '{"actionCount":1,"decision":"LANGAME_DAILY_WORKER_REVOCATION_PLAN","plan":%s,"planSha256":"%s"}\n' "$revoke_plan_json" "$revoke_plan_sha"
    ;;
  revoke-apply)
    lock_file 9 "$INSTALL_LOCK"; lock_file 8 "$CUTOVER_LOCK"; prepare; assert_no_pending_operations
    load_current_timer_authorization
    "$WORKER_VERIFIER" >/dev/null || die 'worker authorization verifier rejected revocation source state'
    "$DRAIN_VERIFIER" >/dev/null || die 'generic drain verifier rejected revocation source state'
    revoke_plan_json="$(canonical_revoke_plan)"; revoke_plan_sha="$(printf '%s' "$revoke_plan_json" | sha256sum | awk '{print $1}')"
    [[ "$revoke_plan_sha" == "$expected_plan" ]] || die 'worker revocation plan digest changed before effect'
    write_revoke_intent
    disable_timer_and_assert_quiescent; restore_worker_fences; clear_timer_pointer_for_permit; assert_revoked_runtime
    write_revocation_receipt; assert_revocation_receipt; clear_revoke_intent
    printf 'LANGAME_DAILY_WORKER_REVOCATION_APPLY=PASS planSha256=%s authorizationReceiptSha256=%s\n' "$revoke_plan_sha" "$(sha "$permit")"
    ;;
  revoke-recover)
    lock_file 9 "$INSTALL_LOCK"; lock_file 8 "$CUTOVER_LOCK"; prepare
    prequiesce_revoke_recovery; load_revoke_intent; clear_timer_pointer_for_permit; assert_revoked_runtime
    write_revocation_receipt; assert_revocation_receipt; clear_revoke_intent
    printf 'LANGAME_DAILY_WORKER_REVOCATION_RECOVERED=PASS planSha256=%s\n' "$revoke_plan_sha"
    ;;
  revoke-check)
    lock_file 9 "$INSTALL_LOCK"; lock_file 8 "$CUTOVER_LOCK"; prepare; assert_no_pending_operations
    assert_revoked_runtime; load_latest_revocation
    printf 'LANGAME_DAILY_WORKER_REVOCATION_CHECK=PASS releaseSha=%s tenantSlug=%s\n' "$release_sha" "$tenant_slug"
    ;;
  plan)
    lock_file 9 "$INSTALL_LOCK"; lock_file 8 "$CUTOVER_LOCK"; prepare; assert_no_pending_operations; assert_no_authorization_dropins; assert_exact_loaded_fences_only
    plan_attempt="$(planned_attempt)"
    plan_json="$(canonical_plan)"; plan_sha="$(printf '%s' "$plan_json" | sha256sum | awk '{print $1}')"
    printf '{"actionCount":1,"decision":"LANGAME_DAILY_WORKER_AUTHORIZATION_PLAN","plan":%s,"planSha256":"%s"}\n' "$plan_json" "$plan_sha"
    ;;
  check)
    lock_file 9 "$INSTALL_LOCK"; lock_file 8 "$CUTOVER_LOCK"; prepare
    assert_no_pending_operations
    if [[ "$phase" == timer ]]; then assert_canary_evidence; fi
    if [[ "$phase" == canary ]]; then assert_no_authorization_dropins; fi
    load_current_attempt; plan_attempt="$attempt"; plan_json="$(canonical_plan)"; plan_sha="$(printf '%s' "$plan_json" | sha256sum | awk '{print $1}')"; permit="$(receipt_path)"
    assert_permit "$permit"
    if [[ "$phase" == canary ]]; then
      assert_matching_canary_execution "$permit"; service_is_quiescent || die 'successful canary service is not strictly quiescent'; timer_is_disabled_quiescent || die 'successful canary timer is not strictly disabled/quiescent'; assert_exact_loaded_fences_only
    else
      assert_timer_validation "$permit"; assert_timer_enabled "$permit"
      "$WORKER_VERIFIER" >/dev/null || die 'worker timer authorization verifier failed'
      "$DRAIN_VERIFIER" >/dev/null || die 'generic legacy drain verifier failed after timer authorization'
    fi
    printf 'LANGAME_DAILY_WORKER_AUTHORIZATION_CHECK=PASS phase=%s releaseSha=%s tenantSlug=%s\n' "$phase" "$release_sha" "$tenant_slug"
    ;;
  recover)
    lock_file 9 "$INSTALL_LOCK"; lock_file 8 "$CUTOVER_LOCK"; prepare; recover_intent
    ;;
  apply)
    lock_file 9 "$INSTALL_LOCK"; lock_file 8 "$CUTOVER_LOCK"; prepare
    if [[ -e "$(intent_path)" || -L "$(intent_path)" ]]; then recover_intent; fi
    assert_no_pending_operations; assert_no_authorization_dropins; assert_exact_loaded_fences_only
    if [[ "$phase" == timer ]]; then assert_canary_evidence; fi
    plan_attempt="$(planned_attempt)"; plan_json="$(canonical_plan)"; actual_plan="$(printf '%s' "$plan_json" | sha256sum | awk '{print $1}')"; plan_sha="$actual_plan"
    [[ "$actual_plan" == "$expected_plan" ]] || die 'authorization plan digest changed before effect'
    expected_attempt="$(sed -n 's/.*"attempt":\([1-9][0-9]*\),.*/\1/p' <<< "$plan_json")"; [[ "$expected_attempt" =~ ^[1-9][0-9]*$ ]] || die 'authorization plan attempt is invalid'
    next_attempt; [[ "$attempt" == "$expected_attempt" ]] || die 'authorization attempt changed after plan confirmation'
    permit="$(receipt_path)"; write_intent "$actual_plan" "$permit"; permit="$(write_permit "$plan_json" "$actual_plan")"; assert_permit "$permit"
    if [[ "$phase" == canary ]]; then
      before_invocation="$(systemctl_bounded show --property=InvocationID --value "$WORKER_SERVICE")"; release_worker_fences "$permit"
      if ! systemctl_bounded start --no-block "$WORKER_SERVICE"; then stop_service_and_assert_quiescent; write_canary_failure "$permit"; restore_worker_fences; clear_pointer; clear_intent; die 'canary service start was not accepted; fences restored'; fi
      if ! wait_for_canary_terminal "$before_invocation"; then stop_service_and_assert_quiescent; write_canary_failure "$permit"; restore_worker_fences; clear_pointer; clear_intent; die 'canary did not reach a fresh successful terminal result'; fi
      service_is_quiescent && worker_jobs_are_absent || die 'successful canary retained a process, cgroup member, or systemd job'
      write_execution "$permit"
      restore_worker_fences
      clear_intent
    else
      release_worker_fences "$permit"
      # The matching canary already executed this exact release/tenant/service
      # under the same stable environment. Do not run the timer profile here:
      # Persistent=true may legitimately fire one missed schedule when the
      # timer is enabled, and a manual preflight would duplicate that daily
      # sync. This receipt records validation, not a second execution.
      write_timer_validation "$permit"
      before_enable_invocation="$(systemctl_bounded show --property=InvocationID --value "$WORKER_SERVICE")"
      if ! systemctl_bounded enable --now "$WORKER_TIMER"; then disable_timer_and_assert_quiescent; restore_worker_fences; clear_pointer; clear_intent; die 'timer enable failed after permit; timer disabled and fences restored'; fi
      if ! settle_enabled_timer "$before_enable_invocation"; then disable_timer_and_assert_quiescent; restore_worker_fences; clear_pointer; clear_intent; die 'timer did not settle as enabled/waiting with a successful or absent immediate invocation'; fi
      write_timer_enabled "$permit"; assert_timer_enabled "$permit"; clear_intent
      if ! "$WORKER_VERIFIER" >/dev/null || ! "$DRAIN_VERIFIER" >/dev/null; then
        disable_timer_and_assert_quiescent; restore_worker_fences; clear_pointer
        die 'timer final authorization verification failed; timer was disabled and fences restored'
      fi
    fi
    printf 'LANGAME_DAILY_WORKER_AUTHORIZATION_APPLY=PASS phase=%s planSha256=%s receiptSha256=%s\n' "$phase" "$actual_plan" "$(sha "$permit")"
    ;;
esac
