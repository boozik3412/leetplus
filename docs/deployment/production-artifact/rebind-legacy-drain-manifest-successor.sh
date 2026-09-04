#!/usr/bin/bash -p
# Enroll a reviewed, additive legacy-drain manifest successor without reopening
# the historical N-1 activation boundary.  This controller deliberately has no
# authority to route traffic, alter PostgreSQL, or start/stop/enable units.

[[ $- == *p* ]] || { printf 'legacy drain manifest successor: privileged Bash mode is required\n' >&2; exit 1; }
while IFS= read -r inherited_name; do unset "$inherited_name" 2>/dev/null || true; done < <(compgen -e)
unset inherited_name
PATH='/usr/sbin:/usr/bin:/sbin:/bin'
LANG='C.UTF-8'
LC_ALL='C.UTF-8'
TZ='UTC'
export PATH LANG LC_ALL TZ
set -euo pipefail
IFS=$'\n\t'
umask 0077

readonly CONTROLLER='LEGACY_DRAIN_MANIFEST_SUCCESSOR_V1'
readonly AUTHORITY_PATH='/usr/local/sbin/leetplus-rebind-legacy-drain-manifest-successor'
readonly STATE_ROOT='/var/lib/leetplus/legacy-drain'
readonly UNIT_MANIFEST='/etc/leetplus/legacy-drain-units.conf'
readonly ACTIVATION_RECEIPT="${STATE_ROOT}/activation.receipt"
readonly SUCCESSOR_RECEIPT="${STATE_ROOT}/manifest-successor.receipt"
readonly CONTROL_VERIFIER_EVIDENCE="${STATE_ROOT}/manifest-successor-control-verification.v1"
readonly FENCE_MARKER="${STATE_ROOT}/legacy-start-fence"
readonly DRAIN_VERIFIER='/usr/local/libexec/leetplus/verify-legacy-runtime-drain.sh'
readonly CONTROL_VERIFIER='/usr/local/libexec/leetplus/verify-installed-production-control-generation.mjs'
readonly SYSTEMD_ROOT='/etc/systemd/system'
readonly INSTALL_LOCK='/run/leetplus-production-control/install.lock'
readonly CUTOVER_LOCK='/var/lib/leetplus/deploy-receipts/cutover.lock'
readonly EXPECTED_PREDECESSOR_MANIFEST_SHA256='89930527907a1bf993c9b4db9165c8f8ba305d81be985264ecd3b5fa4ff86b13'
readonly EXPECTED_SUCCESSOR_MANIFEST_SHA256='d6e7b4fe8e0aeb9a77caae62d2fb4ed9322e6383148934c5e26ff3f9126120dd'
readonly APPLY_CONFIRMATION='I_ACCEPT_EXACT_LEGACY_DRAIN_MANIFEST_SUCCESSOR_APPLY'
readonly FENCE_BASENAME='90-leetplus-nminus1-start-fence.conf'
readonly -a ADDED_DRAIN_UNITS=(
  'leetplus-langame-daily-worker.timer'
  'leetplus-langame-daily-worker.service'
)

die() { printf 'legacy drain manifest successor: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'USAGE'
Usage:
  rebind-legacy-drain-manifest-successor.sh plan --control-release-sha <sha>
  rebind-legacy-drain-manifest-successor.sh apply --control-release-sha <sha> --plan-sha256 <sha256> --action-count 2 --confirmation I_ACCEPT_EXACT_LEGACY_DRAIN_MANIFEST_SUCCESSOR_APPLY
  rebind-legacy-drain-manifest-successor.sh check --control-release-sha <sha>

The only accepted transition is the immutable additive manifest successor
89930527907a... -> d6e7b4fe8e... . It creates/re-attests two durable start
fences and writes a predecessor-linked receipt. It never changes routing,
database state, or unit enable/start/stop state.
USAGE
}

mode=''
plan_sha256=''
action_count=''
confirmation=''
control_release_sha=''
while (($#)); do
  case "$1" in
    plan|apply|check) [[ -z "$mode" ]] || die 'exactly one operation is required'; mode="$1"; shift ;;
    --plan-sha256) plan_sha256="${2:-}"; shift 2 ;;
    --action-count) action_count="${2:-}"; shift 2 ;;
    --confirmation) confirmation="${2:-}"; shift 2 ;;
    --control-release-sha) control_release_sha="${2:-}"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done
[[ -n "$mode" ]] || { usage >&2; exit 1; }
((EUID == 0)) || die 'controller must run as root'
unset BASH_ENV ENV CDPATH GLOBIGNORE
for command_name in awk basename cat chmod chown cmp date dirname env find findmnt flock grep install mktemp mv realpath rm sha256sum sort stat sync systemctl timeout tr wc; do
  command -v "$command_name" >/dev/null 2>&1 || die "required command is unavailable: ${command_name}"
done

assert_root_file() {
  local path="$1" mode="$2"
  [[ -f "$path" && ! -L "$path" && "$(realpath -e -- "$path")" == "$path" \
    && "$(stat -c '%U:%G:%a:%h' -- "$path")" == "root:root:${mode}:1" ]] \
    || die "root authority file is unsafe: ${path}"
}
assert_root_directory() {
  local path="$1" mode="$2"
  [[ -d "$path" && ! -L "$path" && "$(realpath -e -- "$path")" == "$path" \
    && "$(stat -c '%U:%G:%a' -- "$path")" == "root:root:${mode}" \
    && -z "$(find -P "$path" -maxdepth 0 -perm /022 -print -quit)" ]] \
    || die "root authority directory is unsafe: ${path}"
}
sha256() { sha256sum "$1" | awk '{ print $1 }'; }
assert_no_nested_mount() {
  local path="$1" mounts mount_target
  mounts="$(findmnt --raw --noheadings --output TARGET)" || die 'mount inventory failed or returned partial output'
  [[ ${#mounts} -le 4194304 && "$mounts" != *$'\r'* ]] || die 'mount inventory is oversized or noncanonical'
  while IFS= read -r mount_target; do
    case "$mount_target" in "$path"|"$path"/*) die "authority path contains an exact/nested mount: ${mount_target}" ;; esac
  done <<< "$mounts"
}
assert_fixed_paths() {
  authority_source="$(realpath -e -- "${BASH_SOURCE[0]}")"
  [[ "$authority_source" == "$AUTHORITY_PATH" ]] || die 'controller must execute from the exact installed root authority path'
  assert_root_file "$AUTHORITY_PATH" 500
  for ancestor in /var /var/lib /var/lib/leetplus "$STATE_ROOT" /etc /etc/leetplus /etc/systemd "$SYSTEMD_ROOT" /run /run/leetplus-production-control /var/lib/leetplus/deploy-receipts; do
    assert_root_directory "$ancestor" "$(case "$ancestor" in "$STATE_ROOT"|/run/leetplus-production-control|/var/lib/leetplus/deploy-receipts) printf 700;; *) printf 755;; esac)"
  done
  assert_root_file "$UNIT_MANIFEST" 600
  assert_root_file "$ACTIVATION_RECEIPT" 600
  assert_root_file "$FENCE_MARKER" 600
  assert_root_file "$DRAIN_VERIFIER" 755
  assert_root_file "$CONTROL_VERIFIER" 555
  assert_no_nested_mount "$STATE_ROOT"
  assert_no_nested_mount "$SYSTEMD_ROOT"
}

validate_manifest() {
  local expected_lines actual_lines classified_lines
  [[ "$(sha256 "$UNIT_MANIFEST")" == "$EXPECTED_SUCCESSOR_MANIFEST_SHA256" ]] \
    || die 'installed unit manifest is not the exact admitted successor bytes'
  [[ "$(wc -l < "$UNIT_MANIFEST" | tr -d '[:space:]')" == 31 ]] || die 'successor manifest line count is invalid'
  classified_lines="$(awk 'NF != 0 && $1 !~ /^#/ { count++ } END { print count + 0 }' "$UNIT_MANIFEST")"
  [[ "$classified_lines" == 27 ]] || die 'successor manifest classified entry count is invalid'
  [[ -z "$(awk 'NF == 0 || $1 ~ /^#/ { next } NF != 2 || ($1 != "REQUIRED_DRAIN" && $1 != "OPTIONAL_DRAIN" && $1 != "SAFE") || $2 !~ /^leetplus-[A-Za-z0-9@_.-]+\.(service|timer)$/ || seen[$2]++ { print; exit }' "$UNIT_MANIFEST")" ]] \
    || die 'successor manifest schema is malformed'
  for expected_lines in \
    'OPTIONAL_DRAIN leetplus-langame-daily-worker.timer' \
    'OPTIONAL_DRAIN leetplus-langame-daily-worker.service' \
    'SAFE leetplus-bonus-ledger-worker.service' \
    'SAFE leetplus-bonus-ledger-worker.timer' \
    'SAFE leetplus-langame-discrepancy-audit-preflight.service'; do
    grep -F -x "$expected_lines" "$UNIT_MANIFEST" >/dev/null || die "successor manifest misses pinned additive entry: ${expected_lines}"
  done
  # The exact target digest already fixes every preserved predecessor line; do
  # not accept a broad "same classifications" reconstruction.
}

validate_predecessor_receipt() {
  local key evidence_path
  [[ "$(wc -l < "$ACTIVATION_RECEIPT" | tr -d '[:space:]')" == 15 ]] || die 'predecessor activation receipt schema is not exact'
  [[ -z "$(awk -F= 'NF < 2 || seen[$1]++ { print; exit }' "$ACTIVATION_RECEIPT")" ]] || die 'predecessor activation receipt has malformed keys'
  expected_keys="$(printf '%s\n' RECORD_VERSION LEGACY_ROLLBACK_SHA DRAIN_ACCEPTED_AT ACTIVATION_INTENT_SHA256 UNIT_MANIFEST_SHA256 PUBLIC_ROUTE_MARKER_SHA256 CONNECTION_DRAIN_MARKER_SHA256 NGINX_WORKER_SNAPSHOT_SHA256 START_FENCE_MARKER_SHA256 DATABASE_LOGIN_FENCE_MARKER_SHA256 DRAIN_VERIFIER_OUTPUT_SHA256 LEGACY_RUNTIME_DRAIN_ACCEPTED LEGACY_RUNTIME_DRAIN_CLEAN_SAMPLES LEGACY_RUNTIME_DRAIN_PROCESS_SNAPSHOT_SHA256 LEGACY_RUNTIME_DRAIN_DATABASE_ROLE | sort)"
  actual_keys="$(awk -F= '{ print $1 }' "$ACTIVATION_RECEIPT" | sort)"
  [[ "$actual_keys" == "$expected_keys" ]] || die 'predecessor activation receipt key set is not exact'
  grep -F -x 'RECORD_VERSION=2' "$ACTIVATION_RECEIPT" >/dev/null || die 'predecessor receipt version is invalid'
  grep -F -x 'LEGACY_RUNTIME_DRAIN_ACCEPTED=true' "$ACTIVATION_RECEIPT" >/dev/null || die 'predecessor receipt is not accepted'
  grep -F -x "UNIT_MANIFEST_SHA256=${EXPECTED_PREDECESSOR_MANIFEST_SHA256}" "$ACTIVATION_RECEIPT" >/dev/null \
    || die 'predecessor receipt is not bound to the only admitted predecessor manifest'
  for key in ACTIVATION_INTENT_SHA256 PUBLIC_ROUTE_MARKER_SHA256 CONNECTION_DRAIN_MARKER_SHA256 NGINX_WORKER_SNAPSHOT_SHA256 START_FENCE_MARKER_SHA256 DATABASE_LOGIN_FENCE_MARKER_SHA256 DRAIN_VERIFIER_OUTPUT_SHA256 LEGACY_RUNTIME_DRAIN_PROCESS_SNAPSHOT_SHA256; do
    grep -E -x "${key}=[0-9a-f]{64}" "$ACTIVATION_RECEIPT" >/dev/null || die "predecessor receipt digest is invalid: ${key}"
  done
  declare -A predecessor_evidence=(
    [ACTIVATION_INTENT_SHA256]="${STATE_ROOT}/activation.intent"
    [PUBLIC_ROUTE_MARKER_SHA256]="${STATE_ROOT}/routed-publicly.marker"
    [CONNECTION_DRAIN_MARKER_SHA256]="${STATE_ROOT}/legacy-connections-drained.marker"
    [NGINX_WORKER_SNAPSHOT_SHA256]="${STATE_ROOT}/legacy-nginx-workers.snapshot"
    [START_FENCE_MARKER_SHA256]="${STATE_ROOT}/legacy-start-fence"
    [DATABASE_LOGIN_FENCE_MARKER_SHA256]="${STATE_ROOT}/legacy-database-login-fence.marker"
    [DRAIN_VERIFIER_OUTPUT_SHA256]="${STATE_ROOT}/drain-verification.new"
    [LEGACY_RUNTIME_DRAIN_PROCESS_SNAPSHOT_SHA256]="${STATE_ROOT}/legacy-processes.snapshot"
  )
  for key in "${!predecessor_evidence[@]}"; do
    evidence_path="${predecessor_evidence[$key]}"
    assert_root_file "$evidence_path" 600
    grep -F -x "${key}=$(sha256 "$evidence_path")" "$ACTIVATION_RECEIPT" >/dev/null \
      || die "predecessor receipt evidence digest drifted: ${key}"
  done
}

fence_path() { printf '%s/%s.d/%s\n' "$SYSTEMD_ROOT" "$1" "$FENCE_BASENAME"; }
fence_directory() { dirname -- "$(fence_path "$1")"; }
fence_condition() { printf 'ConditionPathExists=!%s' "$FENCE_MARKER"; }
assert_fence() {
  local unit="$1" directory path expected
  directory="$(fence_directory "$unit")"; path="$(fence_path "$unit")"; expected=$'[Unit]\n'"$(fence_condition)"
  assert_root_directory "$directory" 755
  assert_root_file "$path" 644
  [[ "$(cat "$path")" == "$expected" ]] || die "start fence content is not exact: ${unit}"
  loaded_dropins="$(timeout --kill-after=2s 10s systemctl show --property=DropInPaths --value "$unit" 2>/dev/null || true)"
  case " $loaded_dropins " in *" $path "*) ;; *) die "start fence is not loaded: ${unit}" ;; esac
}

unit_state() {
  local unit="$1" load active enabled main control exec cgroup
  load="$(timeout --kill-after=2s 10s systemctl show --property=LoadState --value "$unit" 2>/dev/null || true)"
  if [[ "$load" == 'not-found' || -z "$load" ]]; then printf '%s|not-found\n' "$unit"; return; fi
  active="$(timeout --kill-after=2s 10s systemctl show --property=ActiveState --value "$unit")"
  enabled="$(timeout --kill-after=2s 10s systemctl show --property=UnitFileState --value "$unit")"
  main="$(timeout --kill-after=2s 10s systemctl show --property=MainPID --value "$unit")"
  control="$(timeout --kill-after=2s 10s systemctl show --property=ControlPID --value "$unit")"
  exec="$(timeout --kill-after=2s 10s systemctl show --property=ExecMainPID --value "$unit")"
  cgroup="$(timeout --kill-after=2s 10s systemctl show --property=ControlGroup --value "$unit")"
  printf '%s|%s|%s|%s|%s|%s|%s\n' "$unit" "$load" "$active" "$enabled" "$main" "$control" "$exec:$cgroup"
}
snapshot_unit_states() { for unit in "${ADDED_DRAIN_UNITS[@]}"; do unit_state "$unit"; done; }
assert_units_quiescent() {
  local unit state active enabled main control exec cgroup cgroup_path cgroup_pids expected_fragment
  for unit in "${ADDED_DRAIN_UNITS[@]}"; do
    state="$(unit_state "$unit")"
    IFS='|' read -r _ load active enabled main control trailing <<< "$state"
    [[ "$load" == 'not-found' ]] && continue
    IFS=':' read -r exec cgroup <<< "$trailing"
    expected_fragment="${SYSTEMD_ROOT}/${unit}"
    [[ "$(timeout --kill-after=2s 10s systemctl show --property=FragmentPath --value "$unit")" == "$expected_fragment" ]] \
      || die "newly admitted drain unit fragment is not the installed admitted file: ${unit}"
    if [[ "$unit" == *.service ]]; then
      [[ "$load" == loaded && "$active" == inactive && "$enabled" == static && "$main" == 0 && "$control" == 0 ]] \
        || die "newly admitted drain service is not exact loaded/inactive/static/PID-zero: ${unit}"
    else
      [[ "$load" == loaded && "$active" == inactive && "$enabled" == disabled && "$main" == 0 && "$control" == 0 ]] \
        || die "newly admitted drain timer is not exact loaded/inactive/disabled/PID-zero: ${unit}"
    fi
    [[ "$exec" == 0 || ! -e "/proc/${exec}" ]] || die "newly admitted drain unit retains a live ExecMainPID: ${unit}"
    [[ -z "$cgroup" || ( "$cgroup" == /* && "$cgroup" != *'..'* ) ]] || die "newly admitted drain unit has unsafe cgroup path: ${unit}"
    if [[ -n "$cgroup" && -d "/sys/fs/cgroup${cgroup}" ]]; then
      cgroup_pids="$(timeout --kill-after=2s 10s find "/sys/fs/cgroup${cgroup}" -type f -name cgroup.procs -exec awk 'NF { print; exit }' {} \; 2>/dev/null)" \
        || die "newly admitted drain unit cgroup inventory failed: ${unit}"
      [[ -z "$cgroup_pids" ]] || die "newly admitted drain unit cgroup retains a process: ${unit}"
    fi
  done
}

control_verifier_output() {
  local output
  [[ "$control_release_sha" =~ ^[0-9a-f]{40}$ ]] || die 'control release SHA is invalid'
  output="$(env -i PATH="$PATH" LANG="$LANG" LC_ALL="$LC_ALL" TZ="$TZ" \
    /usr/bin/node "$CONTROL_VERIFIER" --release-sha "$control_release_sha" --require-root-authority)" \
    || die 'installed production-control verifier rejected the requested generation'
  [[ ${#output} -le 1048576 && "$output" != *$'\r'* ]] \
    || die 'installed production-control verifier output is oversized or noncanonical'
  [[ "$(grep -F -c -x 'PRODUCTION_CONTROL_INSTALLED_GENERATION=PASS' <<< "$output")" == 1 \
    && "$(grep -F -c -x "PRODUCTION_CONTROL_RELEASE_SHA=${control_release_sha}" <<< "$output")" == 1 ]] \
    || die 'installed production-control verifier output identity is invalid'
  printf '%s\n' "$output"
}

create_fence() {
  local unit="$1" directory path temporary
  directory="$(fence_directory "$unit")"; path="$(fence_path "$unit")"
  [[ ! -L "$directory" && ! -L "$path" ]] || die "refusing symlinked start-fence path: ${unit}"
  if [[ ! -e "$directory" ]]; then install -d -o root -g root -m 0755 -- "$directory"; fi
  assert_root_directory "$directory" 755
  if [[ -e "$path" ]]; then assert_fence "$unit"; return; fi
  temporary="$(mktemp "${directory}/.leetplus-manifest-successor.XXXXXX")"
  [[ -f "$temporary" && ! -L "$temporary" && "$(stat -c '%h' -- "$temporary")" == 1 ]] || die "unsafe temporary start-fence path: ${unit}"
  printf '[Unit]\n%s\n' "$(fence_condition)" > "$temporary"
  chown root:root "$temporary"; chmod 0644 "$temporary"
  assert_root_directory "$directory" 755
  [[ "$(stat -c '%U:%G:%a:%h' -- "$temporary")" == 'root:root:644:1' ]] || die "temporary start fence identity drifted: ${unit}"
  mv -T -- "$temporary" "$path"; sync -f "$path"; sync -d "$directory"
}

write_atomic_root_file() {
  local destination="$1" mode="$2" temporary
  [[ ! -e "$destination" && ! -L "$destination" ]] || die "refusing to replace immutable state: ${destination}"
  temporary="${destination}.new.$$"
  umask 0077; cat > "$temporary"; chown root:root "$temporary"; chmod "$mode" "$temporary"
  [[ -f "$temporary" && ! -L "$temporary" && "$(stat -c '%U:%G:%a:%h' -- "$temporary")" == "root:root:${mode}:1" ]] || die 'atomic state temporary is unsafe'
  mv -T -- "$temporary" "$destination"; sync -f "$destination"; sync -d "$(dirname -- "$destination")"
}

assert_lock_descriptor() {
  local fd="$1" path="$2" descriptor_identity path_identity
  [[ -e "/proc/self/fd/${fd}" && ! -L "$path" ]] || die "lock descriptor/path is unsafe: ${path}"
  descriptor_identity="$(stat -Lc '%d:%i' -- "/proc/self/fd/${fd}")"
  path_identity="$(stat -Lc '%d:%i' -- "$path")"
  [[ "$descriptor_identity" == "$path_identity" ]] || die "lock descriptor/path inode changed: ${path}"
}

plan_body() {
  printf 'RECORD_VERSION=1\n'
  printf 'CONTROLLER=%s\n' "$CONTROLLER"
  printf 'PREDECESSOR_ACTIVATION_RECEIPT_SHA256=%s\n' "$(sha256 "$ACTIVATION_RECEIPT")"
  printf 'PREDECESSOR_UNIT_MANIFEST_SHA256=%s\n' "$EXPECTED_PREDECESSOR_MANIFEST_SHA256"
  printf 'UNIT_MANIFEST_SHA256=%s\n' "$EXPECTED_SUCCESSOR_MANIFEST_SHA256"
  printf 'CONTROL_RELEASE_SHA=%s\n' "$control_release_sha"
  printf 'CONTROL_VERIFIER_OUTPUT_SHA256=%s\n' "$(control_verifier_output | sha256sum | awk '{ print $1 }')"
  printf 'ACTION_COUNT=2\n'
  for unit in "${ADDED_DRAIN_UNITS[@]}"; do printf 'ACTION=ENSURE_START_FENCE|%s|%s\n' "$unit" "$(fence_path "$unit")"; done
  printf 'NO_ROUTE_DATABASE_OR_UNIT_STATE_EFFECTS=true\n'
}

write_plan() {
  plan_content="$(plan_body)"
  printf 'LEGACY_DRAIN_MANIFEST_SUCCESSOR_PLAN=READY\n'
  printf 'PLAN_SHA256=%s\n' "$(printf '%s\n' "$plan_content" | sha256sum | awk '{ print $1}')"
  printf 'ACTION_COUNT=2\n'
  printf '%s\n' "$plan_content"
}
validate_plan() {
  [[ "$plan_sha256" =~ ^[0-9a-f]{64}$ && "$action_count" == 2 && "$confirmation" == "$APPLY_CONFIRMATION" ]] || die 'apply confirmation, plan digest or action count is invalid'
  [[ "$(plan_body | sha256sum | awk '{ print $1}')" == "$plan_sha256" ]] || die 'provided plan digest does not match the current exact successor state'
}

assert_successor_receipt() {
  local verifier_output="${STATE_ROOT}/manifest-successor-drain-verification.v1"
  assert_root_file "$SUCCESSOR_RECEIPT" 400
  [[ "$(wc -l < "$SUCCESSOR_RECEIPT" | tr -d '[:space:]')" == 12 ]] || die 'successor receipt schema is not exact'
  [[ -z "$(awk -F= 'NF < 2 || seen[$1]++ { print; exit }' "$SUCCESSOR_RECEIPT")" ]] || die 'successor receipt contains malformed keys'
  expected_successor_keys="$(printf '%s\n' RECORD_VERSION LEGACY_DRAIN_MANIFEST_SUCCESSOR_ACCEPTED PREVIOUS_ACTIVATION_RECEIPT_SHA256 PREVIOUS_UNIT_MANIFEST_SHA256 UNIT_MANIFEST_SHA256 CONTROL_RELEASE_SHA CONTROL_VERIFIER_OUTPUT_SHA256 PLAN_SHA256 SUCCESSOR_VERIFIER_OUTPUT_SHA256 NO_ROUTE_DATABASE_OR_UNIT_STATE_EFFECTS ACCEPTED_AT CONTROLLER | sort)"
  actual_successor_keys="$(awk -F= '{ print $1 }' "$SUCCESSOR_RECEIPT" | sort)"
  [[ "$actual_successor_keys" == "$expected_successor_keys" ]] || die 'successor receipt key set is not exact'
  grep -F -x 'RECORD_VERSION=1' "$SUCCESSOR_RECEIPT" >/dev/null || die 'successor receipt version is invalid'
  grep -F -x 'LEGACY_DRAIN_MANIFEST_SUCCESSOR_ACCEPTED=true' "$SUCCESSOR_RECEIPT" >/dev/null || die 'successor receipt is not accepted'
  grep -F -x "PREVIOUS_ACTIVATION_RECEIPT_SHA256=$(sha256 "$ACTIVATION_RECEIPT")" "$SUCCESSOR_RECEIPT" >/dev/null || die 'successor receipt predecessor link drifted'
  grep -F -x "PREVIOUS_UNIT_MANIFEST_SHA256=${EXPECTED_PREDECESSOR_MANIFEST_SHA256}" "$SUCCESSOR_RECEIPT" >/dev/null || die 'successor receipt predecessor manifest drifted'
  grep -F -x "UNIT_MANIFEST_SHA256=${EXPECTED_SUCCESSOR_MANIFEST_SHA256}" "$SUCCESSOR_RECEIPT" >/dev/null || die 'successor receipt successor manifest drifted'
  grep -F -x "CONTROL_RELEASE_SHA=${control_release_sha}" "$SUCCESSOR_RECEIPT" >/dev/null || die 'successor receipt control generation drifted'
  assert_root_file "$CONTROL_VERIFIER_EVIDENCE" 600
  grep -F -x "CONTROL_VERIFIER_OUTPUT_SHA256=$(sha256 "$CONTROL_VERIFIER_EVIDENCE")" "$SUCCESSOR_RECEIPT" >/dev/null || die 'successor receipt installed-control verifier evidence drifted'
  [[ "$(sha256 "$CONTROL_VERIFIER_EVIDENCE")" == "$(control_verifier_output | sha256sum | awk '{ print $1 }')" ]] \
    || die 'successor receipt installed-control verifier output is not reproducible'
  [[ -f "$verifier_output" && ! -L "$verifier_output" ]] || die 'successor verifier evidence is absent'
  grep -F -x "SUCCESSOR_VERIFIER_OUTPUT_SHA256=$(sha256 "$verifier_output")" "$SUCCESSOR_RECEIPT" >/dev/null || die 'successor verifier evidence digest drifted'
  grep -F -x 'NO_ROUTE_DATABASE_OR_UNIT_STATE_EFFECTS=true' "$SUCCESSOR_RECEIPT" >/dev/null || die 'successor receipt effect boundary is invalid'
  grep -F -x "PLAN_SHA256=$(plan_body | sha256sum | awk '{ print $1 }')" "$SUCCESSOR_RECEIPT" >/dev/null \
    || die 'successor receipt plan digest is not reproducible from the exact admitted state'
  grep -E -x 'ACCEPTED_AT=[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z' "$SUCCESSOR_RECEIPT" >/dev/null || die 'successor receipt timestamp is invalid'
  grep -F -x "CONTROLLER=${CONTROLLER}" "$SUCCESSOR_RECEIPT" >/dev/null || die 'successor receipt controller identity is invalid'
}

[[ "$control_release_sha" =~ ^[0-9a-f]{40}$ ]] || die 'all operations require the exact installed production-control release SHA'
assert_root_directory '/run/leetplus-production-control' 700
assert_root_directory '/var/lib/leetplus/deploy-receipts' 700
assert_root_file "$INSTALL_LOCK" 600
assert_root_file "$CUTOVER_LOCK" 600
if [[ "$mode" == apply ]]; then lock_operation=exclusive; else lock_operation=shared; fi
exec 9<>"$INSTALL_LOCK"
assert_lock_descriptor 9 "$INSTALL_LOCK"
if [[ "$lock_operation" == exclusive ]]; then flock -xn 9 || die 'a production-control install or rollout operation is active'; else flock -sn 9 || die 'a production-control install or rollout operation is active'; fi
assert_lock_descriptor 9 "$INSTALL_LOCK"
exec 8<>"$CUTOVER_LOCK"
assert_lock_descriptor 8 "$CUTOVER_LOCK"
if [[ "$lock_operation" == exclusive ]]; then flock -xn 8 || die 'a blue/green operation is active'; else flock -sn 8 || die 'a blue/green operation is active'; fi
assert_lock_descriptor 8 "$CUTOVER_LOCK"
# Re-attest both lock inodes after flock before reading mutable state.
assert_root_file "$INSTALL_LOCK" 600
assert_root_file "$CUTOVER_LOCK" 600
assert_lock_descriptor 9 "$INSTALL_LOCK"
assert_lock_descriptor 8 "$CUTOVER_LOCK"
assert_fixed_paths
validate_manifest
validate_predecessor_receipt

if [[ "$mode" == check ]]; then
  assert_successor_receipt
  for unit in "${ADDED_DRAIN_UNITS[@]}"; do assert_fence "$unit"; done
  assert_units_quiescent
  timeout --kill-after=5s 90s "$DRAIN_VERIFIER" || die 'live drain verifier did not accept successor state'
  printf 'LEGACY_DRAIN_MANIFEST_SUCCESSOR_CHECK=PASS\n'
  exit 0
fi

if [[ "$mode" == plan ]]; then
  [[ -z "$plan_sha256$action_count$confirmation" ]] || die 'plan arguments are invalid'
  write_plan
  exit 0
fi
[[ "$mode" == apply ]] || die 'invalid operation'
[[ -n "$plan_sha256$action_count$confirmation" ]] || die 'apply arguments are invalid'
validate_plan
if [[ -e "$SUCCESSOR_RECEIPT" || -L "$SUCCESSOR_RECEIPT" ]]; then
  assert_successor_receipt
  grep -F -x "PLAN_SHA256=${plan_sha256}" "$SUCCESSOR_RECEIPT" >/dev/null \
    || die 'idempotent apply does not match the immutable accepted plan'
  printf 'LEGACY_DRAIN_MANIFEST_SUCCESSOR_ALREADY_ACCEPTED=true\n'
  exit 0
fi
assert_units_quiescent
if [[ -e "$CONTROL_VERIFIER_EVIDENCE" || -L "$CONTROL_VERIFIER_EVIDENCE" ]]; then
  assert_root_file "$CONTROL_VERIFIER_EVIDENCE" 600
else
  temporary_control_verifier_evidence="${CONTROL_VERIFIER_EVIDENCE}.new.$$"
  [[ ! -e "$temporary_control_verifier_evidence" && ! -L "$temporary_control_verifier_evidence" ]] || die 'control verifier temporary already exists'
  control_verifier_output > "$temporary_control_verifier_evidence" || { rm -f -- "$temporary_control_verifier_evidence"; die 'installed production-control verifier rejected the successor operation'; }
  chown root:root "$temporary_control_verifier_evidence"; chmod 0600 "$temporary_control_verifier_evidence"
  mv -T -- "$temporary_control_verifier_evidence" "$CONTROL_VERIFIER_EVIDENCE"; sync -f "$CONTROL_VERIFIER_EVIDENCE"; sync -d "$STATE_ROOT"
fi
[[ "$(sha256 "$CONTROL_VERIFIER_EVIDENCE")" == "$(control_verifier_output | sha256sum | awk '{ print $1 }')" ]] \
  || die 'installed production-control verifier evidence drifted before any filesystem effect'
before_states="$(snapshot_unit_states)"
for unit in "${ADDED_DRAIN_UNITS[@]}"; do create_fence "$unit"; done
timeout --kill-after=2s 15s systemctl daemon-reload || die 'systemd did not load successor start fences'
for unit in "${ADDED_DRAIN_UNITS[@]}"; do assert_fence "$unit"; done
after_states="$(snapshot_unit_states)"
[[ "$before_states" == "$after_states" ]] || die 'successor controller observed prohibited unit state change'
verifier_output="${STATE_ROOT}/manifest-successor-drain-verification.v1"
if [[ -e "$verifier_output" || -L "$verifier_output" ]]; then
  assert_root_file "$verifier_output" 600
  recovery_verifier_output="${verifier_output}.reverify.$$"
  [[ ! -e "$recovery_verifier_output" && ! -L "$recovery_verifier_output" ]] || die 'successor verifier reverify temporary already exists'
  timeout --kill-after=5s 90s "$DRAIN_VERIFIER" > "$recovery_verifier_output" || { rm -f -- "$recovery_verifier_output"; die 'live drain verifier rejected successor recovery state'; }
  cmp -s -- "$verifier_output" "$recovery_verifier_output" || { rm -f -- "$recovery_verifier_output"; die 'successor verifier evidence is not reproducible during recovery'; }
  rm -f -- "$recovery_verifier_output"
else
  temporary_verifier_output="${verifier_output}.new.$$"
  [[ ! -e "$temporary_verifier_output" && ! -L "$temporary_verifier_output" ]] || die 'successor verifier temporary already exists'
  timeout --kill-after=5s 90s "$DRAIN_VERIFIER" > "$temporary_verifier_output" || { rm -f -- "$temporary_verifier_output"; die 'live drain verifier rejected successor state'; }
  chmod 0600 "$temporary_verifier_output"; chown root:root "$temporary_verifier_output"; mv -T -- "$temporary_verifier_output" "$verifier_output"; sync -f "$verifier_output"; sync -d "$STATE_ROOT"
fi
grep -F -x 'LEGACY_RUNTIME_DRAIN_ACCEPTED=true' "$verifier_output" >/dev/null || die 'successor drain verifier output is not accepted'
{
  printf 'RECORD_VERSION=1\n'
  printf 'LEGACY_DRAIN_MANIFEST_SUCCESSOR_ACCEPTED=true\n'
  printf 'PREVIOUS_ACTIVATION_RECEIPT_SHA256=%s\n' "$(sha256 "$ACTIVATION_RECEIPT")"
  printf 'PREVIOUS_UNIT_MANIFEST_SHA256=%s\n' "$EXPECTED_PREDECESSOR_MANIFEST_SHA256"
  printf 'UNIT_MANIFEST_SHA256=%s\n' "$EXPECTED_SUCCESSOR_MANIFEST_SHA256"
  printf 'CONTROL_RELEASE_SHA=%s\n' "$control_release_sha"
  printf 'CONTROL_VERIFIER_OUTPUT_SHA256=%s\n' "$(sha256 "$CONTROL_VERIFIER_EVIDENCE")"
  printf 'PLAN_SHA256=%s\n' "$plan_sha256"
  printf 'SUCCESSOR_VERIFIER_OUTPUT_SHA256=%s\n' "$(sha256 "$verifier_output")"
  printf 'NO_ROUTE_DATABASE_OR_UNIT_STATE_EFFECTS=true\n'
  printf 'ACCEPTED_AT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%S.%NZ)"
  printf 'CONTROLLER=%s\n' "$CONTROLLER"
} | write_atomic_root_file "$SUCCESSOR_RECEIPT" 400
assert_successor_receipt
printf 'LEGACY_DRAIN_MANIFEST_SUCCESSOR_APPLY=PASS\n'
printf 'SUCCESSOR_RECEIPT=%s\n' "$SUCCESSOR_RECEIPT"
