#!/usr/bin/bash -p

# Root-only authority for the small persistent Langame discrepancy-audit
# namespace. It deliberately has no network, database, release, nginx or
# systemd mutation capability. The only mutable targets are the root's direct
# UUID tenant directories, whose owner is preserved while group/mode are
# normalized for both admitted API slot identities.

[[ $- == *p* ]] || {
  printf 'langame discrepancy audit authority: privileged Bash mode is required\n' >&2
  exit 1
}

while IFS= read -r inherited_name; do
  unset "$inherited_name" 2>/dev/null || true
done < <(compgen -e)
unset inherited_name
PATH='/usr/sbin:/usr/bin:/sbin:/bin'
LANG='C.UTF-8'
LC_ALL='C.UTF-8'
TZ='UTC'
export PATH LANG LC_ALL TZ

set -Eeuo pipefail
IFS=$'\n\t'
umask 0077

readonly ROOT='/var/lib/leetplus/langame-sync'
readonly ROOT_GROUP='leetplus-api-runtime'
readonly PRIMARY_GROUP='leetplus-runtime'
readonly LOCK='/run/leetplus-production-control/install.lock'
readonly AUDIT_LOCK_ROOT='/run/leetplus-langame-discrepancy-audit'
readonly AUDIT_LOCK="${AUDIT_LOCK_ROOT}/audit.lock"
readonly CONFIRMATION='I_ACCEPT_EXACT_LANGAME_DISCREPANCY_AUDIT_REPAIR'
readonly UUID_PATTERN='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
readonly MAX_TENANT_DIRECTORIES=256
readonly -a SLOT_USERS=(leetplus-api-blue leetplus-api-green)

die() {
  printf 'langame discrepancy audit authority: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage:
  leetplus-langame-discrepancy-audit-authority plan
  leetplus-langame-discrepancy-audit-authority check
  leetplus-langame-discrepancy-audit-authority apply \
    --plan-sha256 <64-lowercase-hex> \
    --action-count <non-negative-integer> \
    --confirm I_ACCEPT_EXACT_LANGAME_DISCREPANCY_AUDIT_REPAIR

plan is read-only and emits a canonical plan digest. check mutates only
bounded per-directory temporary probe files, which are created/read/deleted by
both API identities. apply takes the production-control install lock, rechecks
the exact plan, changes only direct tenant-directory group/mode, then runs
check before returning terminal evidence (it does not claim a durable receipt).
USAGE
}

[[ ${EUID:-99999} -eq 0 && ${EGID:-99999} -eq 0 ]] || die 'root authority is required'
for required in awk find findmnt flock getent id install mktemp readlink rm runuser sha256sum sort stat; do
  command -v "$required" >/dev/null 2>&1 || die "required command is unavailable: ${required}"
done

mode=''
plan_sha256=''
action_count=''
confirmation=''
while (($# > 0)); do
  case "$1" in
    plan|check|apply)
      [[ -z "$mode" ]] || die 'exactly one mode is required'
      mode="$1"
      shift
      ;;
    --plan-sha256)
      [[ $# -ge 2 && -z "$plan_sha256" ]] || die '--plan-sha256 requires one value'
      plan_sha256="$2"
      shift 2
      ;;
    --action-count)
      [[ $# -ge 2 && -z "$action_count" ]] || die '--action-count requires one value'
      action_count="$2"
      shift 2
      ;;
    --confirm)
      [[ $# -ge 2 && -z "$confirmation" ]] || die '--confirm requires one value'
      confirmation="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *) die "unknown argument: $1" ;;
  esac
done

[[ -n "$mode" ]] || die 'a mode is required'
if [[ "$mode" == apply ]]; then
  [[ "$plan_sha256" =~ ^[0-9a-f]{64}$ ]] || die 'apply requires a 64 lowercase hexadecimal plan digest'
  [[ "$action_count" =~ ^[0-9]+$ ]] || die 'apply requires a non-negative action count'
  [[ "$confirmation" == "$CONFIRMATION" ]] || die 'apply requires the exact explicit confirmation'
else
  [[ -z "$plan_sha256$action_count$confirmation" ]] || die 'plan/check do not accept apply arguments'
fi

assert_real_directory() {
  local path="$1" label="$2"
  [[ -d "$path" && ! -L "$path" && "$(readlink -e -- "$path")" == "$path" ]] \
    || die "${label} must be a canonical real directory"
}

assert_root_shape() {
  local ancestor
  for ancestor in /var /var/lib /var/lib/leetplus; do
    assert_real_directory "$ancestor" "audit root ancestor"
    [[ "$(stat -c '%U' -- "$ancestor")" == 'root' ]] \
      || die "audit root ancestor is not root-owned: ${ancestor}"
    [[ -z "$(find -P "$ancestor" -maxdepth 0 -perm /022 -print -quit)" ]] \
      || die "audit root ancestor is group/other writable: ${ancestor}"
  done
  assert_real_directory "$ROOT" 'Langame audit root'
  [[ "$(stat -c '%U:%G' -- "$ROOT")" == "root:${ROOT_GROUP}" ]] \
    || die 'Langame audit root must be root:leetplus-api-runtime'
  case "$(stat -c '%a' -- "$ROOT")" in 770|2770) ;; *) die 'Langame audit root mode is unexpected' ;; esac
  [[ -z "$(find -P "$ROOT" -maxdepth 0 -xdev -type l -print -quit)" ]] \
    || die 'Langame audit root must not be a symlink'
}

assert_no_nested_mounts() {
  local target
  while IFS= read -r target; do
    [[ -n "$target" ]] || continue
    [[ "$target" != "$ROOT" && "$target" != "$ROOT"/* ]] \
      || die "Langame audit root contains an exact or nested mount: ${target}"
  done < <(findmnt --task 1 --raw --noheadings --output TARGET)
}

declare -a tenant_dirs=()
declare -a action_records=()

collect_tenant_directories() {
  local candidate name owner group mode_value device root_device
  tenant_dirs=()
  action_records=()
  if [[ "$(stat -c '%a' -- "$ROOT")" != 2770 ]]; then
    action_records+=(".|root|${ROOT_GROUP}|$(stat -c '%a' -- "$ROOT")")
  fi
  root_device="$(stat -c '%d' -- "$ROOT")"
  while IFS= read -r -d '' candidate; do
    (( ${#tenant_dirs[@]} < MAX_TENANT_DIRECTORIES )) \
      || die 'Langame audit tenant-directory inventory exceeds the bounded maximum'
    name="${candidate##*/}"
    [[ "$name" =~ $UUID_PATTERN ]] || die "Langame audit root contains an unexpected direct entry: ${name}"
    [[ -d "$candidate" && ! -L "$candidate" && "$(readlink -e -- "$candidate")" == "$candidate" ]] \
      || die "Langame audit tenant entry is not a canonical directory: ${name}"
    [[ "$(stat -c '%d' -- "$candidate")" == "$root_device" ]] \
      || die "Langame audit tenant directory is on another device: ${name}"
    owner="$(stat -c '%U' -- "$candidate")"
    group="$(stat -c '%G' -- "$candidate")"
    mode_value="$(stat -c '%a' -- "$candidate")"
    case "$owner" in leetplus-api-blue|leetplus-api-green) ;; *) die "Langame audit tenant owner is not an API slot identity: ${name}" ;; esac
    case "$group" in "$PRIMARY_GROUP"|"$ROOT_GROUP") ;; *) die "Langame audit tenant group is unexpected: ${name}" ;; esac
    case "$mode_value" in 750|770|2750|2770) ;; *) die "Langame audit tenant mode is unexpected: ${name}" ;; esac
    tenant_dirs+=("$candidate")
    if [[ "$group" != "$ROOT_GROUP" || "$mode_value" != 2770 ]]; then
      action_records+=("${name}|${owner}|${group}|${mode_value}")
    fi
  done < <(find -P "$ROOT" -xdev -mindepth 1 -maxdepth 1 -print0 | sort -z)
}

canonical_plan() {
  local record first=true name owner group mode_value
  printf '{"actionCount":%s,"actions":[' "${#action_records[@]}"
  for record in "${action_records[@]}"; do
    IFS='|' read -r name owner group mode_value <<< "$record"
    if [[ "$first" == true ]]; then first=false; else printf ','; fi
    printf '{"currentGroup":"%s","currentMode":"%s","name":"%s","owner":"%s","targetGroup":"%s","targetMode":"2770"}' \
      "$group" "$mode_value" "$name" "$owner" "$ROOT_GROUP"
  done
  printf '],"kind":"LEETPLUS_LANGAME_DISCREPANCY_AUDIT_REPAIR_V1","root":"%s","schemaVersion":1}' "$ROOT"
}

plan_digest() {
  canonical_plan | sha256sum | awk '{print $1}'
}

lock_install_shared() {
  [[ -f "$LOCK" && ! -L "$LOCK" && "$(readlink -e -- "$LOCK")" == "$LOCK" ]] \
    || die 'production-control install lock is absent or unsafe'
  [[ "$(stat -c '%U:%G:%a:%h' -- "$LOCK")" == 'root:root:600:1' ]] \
    || die 'production-control install lock authority is invalid'
  exec 9<>"$LOCK"
  flock -sn 9 || die 'a production-control install or rollout operation is active'
}

lock_install_exclusive() {
  [[ -f "$LOCK" && ! -L "$LOCK" && "$(readlink -e -- "$LOCK")" == "$LOCK" ]] \
    || die 'production-control install lock is absent or unsafe'
  [[ "$(stat -c '%U:%G:%a:%h' -- "$LOCK")" == 'root:root:600:1' ]] \
    || die 'production-control install lock authority is invalid'
  exec 9<>"$LOCK"
  flock -xn 9 || die 'another production-control install or rollout operation is active'
}

lock_audit() {
  local lock_mode="$1"
  [[ -d /run && ! -L /run && "$(readlink -e -- /run)" == /run \
    && "$(stat -c '%U:%G' -- /run)" == 'root:root' \
    && -z "$(find -P /run -maxdepth 0 -perm /022 -print -quit)" ]] \
    || die 'runtime lock parent authority is invalid'
  if [[ ! -e "$AUDIT_LOCK_ROOT" && ! -L "$AUDIT_LOCK_ROOT" ]]; then
    /usr/bin/install -d -o root -g root -m 0700 -- "$AUDIT_LOCK_ROOT" \
      || die 'cannot create Langame audit lock root beneath /run'
  fi
  [[ -d "$AUDIT_LOCK_ROOT" && ! -L "$AUDIT_LOCK_ROOT" \
    && "$(readlink -e -- "$AUDIT_LOCK_ROOT")" == "$AUDIT_LOCK_ROOT" \
    && "$(stat -c '%U:%G:%a' -- "$AUDIT_LOCK_ROOT")" == 'root:root:700' ]] \
    || die 'Langame audit lock root authority is invalid'
  # RuntimeDirectory creates only the root-owned directory.  Bootstrap the
  # lock file beneath it while no unprivileged identity can name an entry in
  # that directory; afterwards the exact inode metadata is still required.
  # This avoids coupling an ordinary API restart to the deployment install
  # lock, while plan/apply retain that stronger rollout serialization.
  if [[ ! -e "$AUDIT_LOCK" && ! -L "$AUDIT_LOCK" ]]; then
    ( umask 0077; : > "$AUDIT_LOCK" ) \
      || die 'cannot create Langame audit lock under its root-only directory'
  fi
  [[ -f "$AUDIT_LOCK" && ! -L "$AUDIT_LOCK" \
    && "$(readlink -e -- "$AUDIT_LOCK")" == "$AUDIT_LOCK" \
    && "$(stat -c '%U:%G:%a:%h' -- "$AUDIT_LOCK")" == 'root:root:600:1' ]] \
    || die 'Langame audit lock authority is invalid'
  exec 8<>"$AUDIT_LOCK"
  if [[ "$lock_mode" == shared ]]; then
    flock -sn 8 || die 'another Langame audit verification or repair is active'
  else
    flock -xn 8 || die 'another Langame audit verification or repair is active'
  fi
}

probe_create_as_slot() {
  local user="$1" directory="$2" path
  path="$(/usr/sbin/runuser -u "$user" -- /usr/bin/bash -p -s -- "$directory" "$user" <<'PROBE'
set -Eeuo pipefail
IFS=$'\n\t'
umask 0027
directory="$1"
user="$2"
[[ -d "$directory" && ! -L "$directory" && -w "$directory" && -x "$directory" ]]
probe="$(/usr/bin/mktemp --tmpdir="$directory" ".leetplus-langame-audit-probe-${user}.XXXXXX")"
cleanup() { /usr/bin/rm -f -- "$probe"; }
trap cleanup EXIT HUP INT TERM
printf '%s\n' "${user}" > "$probe"
 /usr/bin/chmod 0640 -- "$probe"
printf '%s\n' "$probe"
trap - EXIT HUP INT TERM
PROBE
 )" || die "Langame audit probe create failed for ${user}"
  [[ "$path" == "$directory"/.leetplus-langame-audit-probe-"$user".* \
    && -f "$path" && ! -L "$path" ]] \
    || die "Langame audit probe path is unsafe for ${user}"
  printf '%s\n' "$path"
}

probe_read_as_slot() {
  local user="$1" path="$2" expected="$3"
  /usr/sbin/runuser -u "$user" -- /usr/bin/bash -p -s -- "$path" "$expected" <<'PROBE'
set -Eeuo pipefail
IFS=$'\n\t'
[[ -f "$1" && ! -L "$1" ]]
[[ "$(/usr/bin/cat -- "$1")" == "$2" ]]
PROBE
}

probe_remove_as_slot() {
  local user="$1" path="$2"
  /usr/sbin/runuser -u "$user" -- /usr/bin/bash -p -s -- "$path" <<'PROBE'
set -Eeuo pipefail
IFS=$'\n\t'
[[ -f "$1" && ! -L "$1" ]]
/usr/bin/rm -f -- "$1"
PROBE
}

probe_assert_no_residue_as_slot() {
  local user="$1" directory="$2" residue
  residue="$(/usr/sbin/runuser -u "$user" -- /usr/bin/bash -p -s -- "$directory" <<'PROBE'
set -Eeuo pipefail
IFS=$'\n\t'
/usr/bin/find -P "$1" -xdev -mindepth 1 -maxdepth 1 \
  -name '.leetplus-langame-audit-probe-*' -print -quit
PROBE
 )" || die "Langame audit residue probe failed for ${user}"
  [[ -z "$residue" ]] || die "Langame audit probe left residue in ${directory##*/}"
}

probe_cross_slot() {
  local writer="$1" reader="$2" directory="$3" path
  path="$(probe_create_as_slot "$writer" "$directory")"
  if ! probe_read_as_slot "$reader" "$path" "$writer"; then
    probe_remove_as_slot "$writer" "$path" || true
    die "Langame audit cross-slot read probe failed for ${writer}->${reader} in ${directory##*/}"
  fi
  probe_remove_as_slot "$writer" "$path" \
    || die "Langame audit probe cleanup failed for ${writer} in ${directory##*/}"
}

probe_all_tenants() {
  local directory owner
  for directory in "${tenant_dirs[@]}"; do
    probe_cross_slot "${SLOT_USERS[0]}" "${SLOT_USERS[1]}" "$directory"
    probe_cross_slot "${SLOT_USERS[1]}" "${SLOT_USERS[0]}" "$directory"
    owner="$(stat -c '%U' -- "$directory")"
    probe_assert_no_residue_as_slot "$owner" "$directory"
  done
}

prepare_inventory() {
  assert_root_shape
  assert_no_nested_mounts
  collect_tenant_directories
}

case "$mode" in
  plan)
    lock_install_shared
    lock_audit shared
    prepare_inventory
    plan_json="$(canonical_plan)"
    digest="$(printf '%s' "$plan_json" | sha256sum | awk '{print $1}')"
    printf '{"actionCount":%s,"decision":"LANGAME_DISCREPANCY_AUDIT_PLAN","plan":%s,"planSha256":"%s"}\n' \
      "${#action_records[@]}" "$plan_json" "$digest"
    ;;
  check)
    lock_audit shared
    prepare_inventory
    [[ ${#action_records[@]} -eq 0 ]] || die 'Langame audit state differs from the exact repaired contract'
    probe_all_tenants
    printf 'LANGAME_DISCREPANCY_AUDIT_CHECK=PASS tenantDirectoryCount=%s\n' "${#tenant_dirs[@]}"
    ;;
  apply)
    lock_install_exclusive
    lock_audit exclusive
    prepare_inventory
    actual_digest="$(plan_digest)"
    [[ "$actual_digest" == "$plan_sha256" ]] || die 'Langame audit repair plan digest changed before effect'
    [[ "${#action_records[@]}" == "$action_count" ]] || die 'Langame audit repair action count changed before effect'
    for record in "${action_records[@]}"; do
      IFS='|' read -r name _owner _group _mode_value <<< "$record"
      if [[ "$name" == '.' ]]; then directory="$ROOT"; else directory="${ROOT}/${name}"; fi
      /usr/bin/chgrp "$ROOT_GROUP" -- "$directory"
      /usr/bin/chmod 2770 -- "$directory"
    done
    prepare_inventory
    [[ ${#action_records[@]} -eq 0 ]] || die 'Langame audit repair postcondition is not exact'
    probe_all_tenants
    printf 'LANGAME_DISCREPANCY_AUDIT_APPLY_EVIDENCE=PASS planSha256=%s actionCount=%s tenantDirectoryCount=%s\n' \
      "$actual_digest" "$action_count" "${#tenant_dirs[@]}"
    ;;
esac
