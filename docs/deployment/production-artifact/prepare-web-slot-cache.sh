#!/usr/bin/bash -p
#
# Prepare a blue/green Web cache for exactly one release while its unit is
# stopped. An old cache is moved to a root-only quarantine, never reused across
# release SHAs and never deleted by this script.

[[ $- == *p* ]] || {
  printf 'prepare-web-slot-cache: privileged Bash mode (-p) is required\n' >&2
  exit 1
}
LEETPLUS_BOOTSTRAP_TEST_PATH=''
LEETPLUS_BOOTSTRAP_IS_TEST=false
declare -a LEETPLUS_BOOTSTRAP_TEST_ENVIRONMENT=()
for LEETPLUS_BOOTSTRAP_ARGUMENT in "$@"; do
  if [[ "$LEETPLUS_BOOTSTRAP_ARGUMENT" == '--unprivileged-test-mode' && EUID -ne 0 ]]; then
    LEETPLUS_BOOTSTRAP_IS_TEST=true
    LEETPLUS_BOOTSTRAP_TEST_PATH="${PATH:-}"
    break
  fi
done
unset LEETPLUS_BOOTSTRAP_ARGUMENT
if [[ "$LEETPLUS_BOOTSTRAP_IS_TEST" == true ]]; then
  while IFS= read -r LEETPLUS_INHERITED_ENVIRONMENT_NAME; do
    [[ "$LEETPLUS_INHERITED_ENVIRONMENT_NAME" == TEST_* || "$LEETPLUS_INHERITED_ENVIRONMENT_NAME" == LEETPLUS_TEST_* ]] \
      && LEETPLUS_BOOTSTRAP_TEST_ENVIRONMENT+=("${LEETPLUS_INHERITED_ENVIRONMENT_NAME}=${!LEETPLUS_INHERITED_ENVIRONMENT_NAME}")
  done < <(compgen -e)
fi
while IFS= read -r LEETPLUS_INHERITED_ENVIRONMENT_NAME; do
  unset "$LEETPLUS_INHERITED_ENVIRONMENT_NAME" 2>/dev/null || true
done < <(compgen -e)
unset LEETPLUS_INHERITED_ENVIRONMENT_NAME
PATH='/usr/sbin:/usr/bin:/sbin:/bin'
LANG='C.UTF-8'
LC_ALL='C.UTF-8'
TZ='UTC'
export PATH LANG LC_ALL TZ
if [[ "$LEETPLUS_BOOTSTRAP_IS_TEST" == true ]]; then
  for LEETPLUS_BOOTSTRAP_TEST_ASSIGNMENT in "${LEETPLUS_BOOTSTRAP_TEST_ENVIRONMENT[@]}"; do export "$LEETPLUS_BOOTSTRAP_TEST_ASSIGNMENT"; done
fi
unset LEETPLUS_BOOTSTRAP_IS_TEST LEETPLUS_BOOTSTRAP_TEST_ENVIRONMENT LEETPLUS_BOOTSTRAP_TEST_ASSIGNMENT

set -euo pipefail
IFS=$'\n\t'
umask 0077

readonly RELEASE_SHA_PATTERN='^[0-9a-f]{40}$'
readonly SLOT_PATTERN='^(blue|green)$'

die() {
  printf 'prepare-web-slot-cache: %s\n' "$*" >&2
  exit 1
}

slot=''
release_sha=''
cache_parent='/var/cache'
marker_root='/var/lib/leetplus/web-cache-releases'
cutover_state_root='/var/lib/leetplus/deploy-receipts'
cgroup_root='/sys/fs/cgroup'
service_user=''
unprivileged_test_mode=false
while (($# > 0)); do
  case "$1" in
    --slot) slot="${2:-}"; shift 2 ;;
    --release-sha) release_sha="${2:-}"; shift 2 ;;
    --cache-root) cache_parent="${2:-}"; shift 2 ;;
    --marker-root) marker_root="${2:-}"; shift 2 ;;
    --cutover-state-root) cutover_state_root="${2:-}"; shift 2 ;;
    --cgroup-root) cgroup_root="${2:-}"; shift 2 ;;
    --service-user) service_user="${2:-}"; shift 2 ;;
    --unprivileged-test-mode) unprivileged_test_mode=true; shift ;;
    --help|-h)
      printf 'Usage: prepare-web-slot-cache.sh --slot blue|green --release-sha <40-lowercase-hex>\n'
      exit 0
      ;;
    *) die "unknown argument: $1" ;;
  esac
done

if [[ "$unprivileged_test_mode" == true ]]; then
  ((EUID != 0)) || die 'unprivileged test mode is forbidden for root'
  PATH="$LEETPLUS_BOOTSTRAP_TEST_PATH"
  export PATH
else
  ((EUID == 0)) || die 'cache preparation must run as root'
  [[ "$cache_parent" == '/var/cache' ]] || die 'production cache root cannot be overridden'
  [[ "$marker_root" == '/var/lib/leetplus/web-cache-releases' ]] || die 'production marker root cannot be overridden'
  [[ "$cutover_state_root" == '/var/lib/leetplus/deploy-receipts' \
    && "$cgroup_root" == '/sys/fs/cgroup' ]] \
    || die 'production cutover/cgroup roots cannot be overridden'
  PATH='/usr/sbin:/usr/bin:/sbin:/bin'
  export PATH
fi
unset LEETPLUS_BOOTSTRAP_TEST_PATH
[[ "$slot" =~ $SLOT_PATTERN ]] || die 'slot must be blue or green'
[[ "$release_sha" =~ $RELEASE_SHA_PATTERN ]] || die 'release SHA must be 40 lowercase hexadecimal characters'
if [[ -z "$service_user" ]]; then
  service_user="leetplus-web-${slot}"
fi
if [[ "$unprivileged_test_mode" == false ]]; then
  [[ "$service_user" == "leetplus-web-${slot}" ]] \
    || die 'production cache owner must be the exact slot Web identity'
fi
for command_name in awk chmod chown date dd dirname find findmnt flock getent id install mv realpath sort stat sync systemctl timeout tr; do
  command -v "$command_name" >/dev/null 2>&1 || die "required command is unavailable: $command_name"
done
if [[ "$unprivileged_test_mode" == false ]]; then
  passwd_inventory="$(timeout --foreground --kill-after=2s 10s getent passwd)" \
    || die 'complete cache-owner passwd inventory failed'
  group_inventory="$(timeout --foreground --kill-after=2s 10s getent group)" \
    || die 'complete cache-owner group inventory failed'
  [[ -n "$passwd_inventory" && -n "$group_inventory" \
    && ${#passwd_inventory} -le 1048576 && ${#group_inventory} -le 1048576 \
    && "$passwd_inventory" != *$'\r'* && "$group_inventory" != *$'\r'* ]] \
    || die 'complete cache-owner NSS inventory is empty, oversized or noncanonical'
  shared_group_line="$(awk -F: '$1 == "leetplus-runtime" { print }' <<< "$group_inventory")"
  web_group_line="$(awk -F: '$1 == "leetplus-web-runtime" { print }' <<< "$group_inventory")"
  api_group_line="$(awk -F: '$1 == "leetplus-api-runtime" { print }' <<< "$group_inventory")"
  [[ -n "$shared_group_line" && "$shared_group_line" != *$'\n'* \
    && -n "$web_group_line" && "$web_group_line" != *$'\n'* \
    && -n "$api_group_line" && "$api_group_line" != *$'\n'* ]] \
    || die 'cache-owner runtime group inventory is absent or ambiguous'
  service_gid="$(awk -F: '{ print $3 }' <<< "$shared_group_line")"
  web_runtime_gid="$(awk -F: '{ print $3 }' <<< "$web_group_line")"
  api_runtime_gid="$(awk -F: '{ print $3 }' <<< "$api_group_line")"
  shared_group_password="$(awk -F: '{ print $2 }' <<< "$shared_group_line")"
  shared_group_members="$(awk -F: '{ print $4 }' <<< "$shared_group_line")"
  web_group_password="$(awk -F: '{ print $2 }' <<< "$web_group_line")"
  web_group_members="$(awk -F: '{ print $4 }' <<< "$web_group_line" | tr ',' '\n' | LC_ALL=C sort | tr '\n' ',' | sed 's/,$//')"
  api_group_password="$(awk -F: '{ print $2 }' <<< "$api_group_line")"
  api_group_members="$(awk -F: '{ print $4 }' <<< "$api_group_line" | tr ',' '\n' | LC_ALL=C sort | tr '\n' ',' | sed 's/,$//')"
  [[ "$service_gid" =~ ^[1-9][0-9]{1,8}$ && "$web_runtime_gid" =~ ^[1-9][0-9]{1,8}$ \
    && "$api_runtime_gid" =~ ^[1-9][0-9]{1,8}$ && "$service_gid" != "$web_runtime_gid" \
    && "$service_gid" != "$api_runtime_gid" && "$web_runtime_gid" != "$api_runtime_gid" \
    && "$shared_group_password" == x && -z "$shared_group_members" \
    && "$web_group_password" == x \
    && "$web_group_members" == 'leetplus-web-blue,leetplus-web-green,leetplus-web-nminus1' \
    && "$api_group_password" == x \
    && "$api_group_members" == 'leetplus-api-blue,leetplus-api-green,leetplus-api-nminus1' ]] \
    || die 'cache-owner runtime group GIDs are invalid or aliased'
  shared_primary_identities="$(awk -F: -v gid="$service_gid" '$4 == gid { print $1 }' <<< "$passwd_inventory" \
    | LC_ALL=C sort | awk 'BEGIN { out="" } { out=(out == "" ? $0 : out "," $0) } END { print out }')"
  web_primary_identities="$(awk -F: -v gid="$web_runtime_gid" '$4 == gid { print $1 }' <<< "$passwd_inventory" \
    | LC_ALL=C sort | awk 'BEGIN { out="" } { out=(out == "" ? $0 : out "," $0) } END { print out }')"
  api_primary_identities="$(awk -F: -v gid="$api_runtime_gid" '$4 == gid { print $1 }' <<< "$passwd_inventory" \
    | LC_ALL=C sort | awk 'BEGIN { out="" } { out=(out == "" ? $0 : out "," $0) } END { print out }')"
  [[ "$shared_primary_identities" == 'leetplus-api-blue,leetplus-api-green,leetplus-api-nminus1,leetplus-web-blue,leetplus-web-green,leetplus-web-nminus1' \
    && -z "$web_primary_identities" && -z "$api_primary_identities" ]] \
    || die 'cache-owner runtime secret-group reverse primary-GID sets are not exact'
  passwd_entry="$(awk -F: -v identity="$service_user" '$1 == identity { print }' <<< "$passwd_inventory")"
  [[ -n "$passwd_entry" && "$passwd_entry" != *$'\n'* ]] \
    || die 'production slot Web identity is absent or name-ambiguous'
  IFS=: read -r passwd_name passwd_password service_uid passwd_gid passwd_gecos passwd_home passwd_shell <<< "$passwd_entry"
  [[ "$passwd_name" == "$service_user" && "$passwd_password" == x \
    && "$service_uid" =~ ^[1-9][0-9]{1,8}$ && "$passwd_gid" == "$service_gid" \
    && -z "$passwd_gecos" && "$passwd_home" == /nonexistent && "$passwd_shell" == /usr/sbin/nologin \
    && ! -e "$passwd_home" && ! -L "$passwd_home" \
    && "$(awk -F: -v uid="$service_uid" '$3 == uid { print }' <<< "$passwd_inventory")" == "$passwd_entry" ]] \
    || die 'production slot Web identity passwd/UID/no-home contract is not exact'
  actual_service_groups="$(id -nG "$service_user" | tr ' ' '\n' | awk 'NF' | LC_ALL=C sort -u)" \
    || die 'production slot Web identity group inventory failed'
  [[ "$actual_service_groups" == $'leetplus-runtime\nleetplus-web-runtime' ]] \
    || die 'production slot Web identity group set is not exact'
fi

stable_process_status_has_uid() {
  local status_file="$1" expected_uid="$2" process_directory before_identity after_identity status_content status_result
  process_directory="$(dirname -- "$status_file")"
  [[ -d "$process_directory" ]] || return 1
  before_identity="$(stat -Lc '%d:%i:%f' -- "$status_file" 2>/dev/null)" || {
    [[ ! -d "$process_directory" ]] && return 1
    return 2
  }
  [[ "$before_identity" =~ :8[0-9a-f][0-9a-f][0-9a-f]$ ]] || return 2
  status_content="$(timeout --foreground --kill-after=1s 3s \
    dd if="$status_file" iflag=nofollow status=none 2>/dev/null)" || {
    [[ ! -d "$process_directory" ]] && return 1
    return 2
  }
  after_identity="$(stat -Lc '%d:%i:%f' -- "$status_file" 2>/dev/null)" || {
    [[ ! -d "$process_directory" ]] && return 1
    return 2
  }
  [[ "$before_identity" == "$after_identity" ]] || return 2
  if awk -v expected_uid="$expected_uid" '
    $1 == "Uid:" { seen += 1; match_uid=($2 == expected_uid || $3 == expected_uid || $4 == expected_uid || $5 == expected_uid) }
    END { if (seen != 1) exit 2; exit !match_uid }
  ' <<< "$status_content"; then
    return 0
  else
    status_result=$?
  fi
  [[ "$status_result" == 1 ]] && return 1
  return 2
}

unit="leetplus-web@${slot}.service"
if [[ "$unprivileged_test_mode" == true ]]; then
  install -d -m 0700 -- "$cutover_state_root"
else
  [[ -d "$cutover_state_root" && ! -L "$cutover_state_root" \
    && "$(stat -c '%U:%G:%a' -- "$cutover_state_root")" == 'root:root:700' ]] \
    || die 'shared cutover state root is absent or unsafe'
fi
cutover_state_root="$(realpath -e -- "$cutover_state_root")"
if [[ "$unprivileged_test_mode" == false ]]; then
  [[ "$cutover_state_root" == '/var/lib/leetplus/deploy-receipts' \
    && "$(stat -c '%U:%G:%a' -- "$cutover_state_root")" == 'root:root:700' ]] \
    || die 'shared cutover state root contains a symlinked/noncanonical ancestor'
fi

attest_cache_mount_boundaries() {
  local inventory mount_target protected_root
  local -a protected_roots=("$cutover_state_root" "$marker_root" "$cache_parent")
  [[ -z "${cache_directory:-}" ]] || protected_roots+=("$cache_directory")
  [[ -z "${quarantine_root:-}" ]] || protected_roots+=("$quarantine_root")
  if [[ "$unprivileged_test_mode" == true ]]; then
    [[ -n "${TEST_CACHE_MOUNT_INVENTORY_FILE:-}" ]] || return 0
    [[ -f "$TEST_CACHE_MOUNT_INVENTORY_FILE" && ! -L "$TEST_CACHE_MOUNT_INVENTORY_FILE" ]] \
      || die 'fixture cache mount inventory is absent or symlinked'
    inventory="$(<"$TEST_CACHE_MOUNT_INVENTORY_FILE")" \
      || die 'fixture cache mount inventory could not be read completely'
  else
    inventory="$(findmnt --raw --noheadings --output TARGET)" \
      || die 'cache authority mount inventory failed or returned partial output'
  fi
  [[ ${#inventory} -le 4194304 && "$inventory" != *$'\r'* ]] \
    || die 'cache authority mount inventory is oversized or noncanonical'
  while IFS= read -r mount_target; do
    [[ -n "$mount_target" ]] || continue
    for protected_root in "${protected_roots[@]}"; do
      case "$mount_target" in
        "$protected_root"|"$protected_root"/*)
          die "cache authority contains an exact/nested mount: ${mount_target}"
          ;;
      esac
    done
  done <<< "$inventory"
}

attest_cache_mount_boundaries
cutover_lock="${cutover_state_root}/cutover.lock"
if [[ ! -e "$cutover_lock" && ! -L "$cutover_lock" ]]; then
  (set -o noclobber; : > "$cutover_lock") 2>/dev/null \
    || die 'shared cutover lock could not be created exclusively'
  chmod 0600 -- "$cutover_lock"
  sync -f "$cutover_lock"
  sync -d "$cutover_state_root"
fi
if [[ "$unprivileged_test_mode" == false ]]; then
  lock_expected_identity='root:root:600:1'
else
  lock_expected_identity="$(id -un):$(id -gn):600:1"
fi
[[ -f "$cutover_lock" && ! -L "$cutover_lock" \
  && "$(realpath -e -- "$cutover_lock")" == "$cutover_lock" \
  && "$(stat -c '%U:%G:%a:%h' -- "$cutover_lock")" == "$lock_expected_identity" ]] \
  || die 'shared cutover lock identity is unsafe before open'
exec 8>> "$cutover_lock"
[[ -f "/proc/$$/fd/8" && "$(realpath -e -- "/proc/$$/fd/8")" == "$cutover_lock" \
  && "$(stat -Lc '%U:%G:%a:%h' -- "/proc/$$/fd/8")" == "$lock_expected_identity" ]] \
  || die 'shared cutover lock descriptor/path identity is unsafe before flock'
flock -n 8 || die 'another blue/green/cache operation holds the deployment lock'
[[ -f "$cutover_lock" && ! -L "$cutover_lock" \
  && -d "$cutover_state_root" && ! -L "$cutover_state_root" \
  && "$(realpath -e -- "$cutover_state_root")" == "$cutover_state_root" \
  && "$(realpath -e -- "/proc/$$/fd/8")" == "$cutover_lock" \
  && "$(stat -c '%U:%G:%a:%h' -- "$cutover_lock")" == "$lock_expected_identity" \
  && "$(stat -Lc '%U:%G:%a:%h' -- "/proc/$$/fd/8")" == "$lock_expected_identity" ]] \
  || die 'shared cutover lock changed while held'
if [[ "$unprivileged_test_mode" == false ]]; then
  [[ "$(stat -c '%U:%G:%a' -- "$cutover_state_root")" == 'root:root:700' ]] \
    || die 'shared cutover lock parent changed while held'
fi
attest_cache_mount_boundaries

unit_property() {
  local snapshot="$1" property="$2"
  awk -F= -v property="$property" '
    $1 == property { count += 1; value = substr($0, length(property) + 2) }
    END { if (count != 1) exit 1; printf "%s", value }
  ' <<< "$snapshot"
}

attest_slot_stopped() {
  local phase="$1" snapshot active_state sub_state main_pid control_group unit_file_state need_reload
  local expected_control_group cgroup_path pid_inventory status_file status_result
  snapshot="$(timeout --foreground --kill-after=2s 10s systemctl show --no-pager \
    --property=ActiveState --property=SubState --property=MainPID \
    --property=ControlGroup --property=UnitFileState --property=NeedDaemonReload \
    "$unit")" \
    || die "cannot prove Web slot unit state (${phase})"
  [[ -n "$snapshot" && ${#snapshot} -le 262144 && "$snapshot" != *$'\r'* ]] \
    || die "Web slot unit snapshot is noncanonical (${phase})"
  active_state="$(unit_property "$snapshot" ActiveState)" || die "Web slot ActiveState missing (${phase})"
  sub_state="$(unit_property "$snapshot" SubState)" || die "Web slot SubState missing (${phase})"
  main_pid="$(unit_property "$snapshot" MainPID)" || die "Web slot MainPID missing (${phase})"
  control_group="$(unit_property "$snapshot" ControlGroup)" || die "Web slot ControlGroup missing (${phase})"
  unit_file_state="$(unit_property "$snapshot" UnitFileState)" || die "Web slot UnitFileState missing (${phase})"
  need_reload="$(unit_property "$snapshot" NeedDaemonReload)" || die "Web slot NeedDaemonReload missing (${phase})"
  expected_control_group="/system.slice/${unit}"
  [[ ( "$active_state" == inactive && "$sub_state" == dead \
      || "$active_state" == failed && "$sub_state" == failed ) \
    && "$main_pid" == 0 \
    && ( -z "$control_group" || "$control_group" == "$expected_control_group" ) \
    && "$unit_file_state" == enabled && "$need_reload" == no ]] \
    || die "Web slot must be stopped with no MainPID before cache preparation (${phase})"
  # systemd 255 can omit/prune ControlGroup for a loaded, inactive instance
  # that has never owned a process. Inspect the canonical unit path anyway so
  # a stale cgroup cannot hide behind the empty property.
  cgroup_path="${cgroup_root}${expected_control_group}"
  if [[ -e "$cgroup_path" || -L "$cgroup_path" ]]; then
    [[ -d "$cgroup_path" && ! -L "$cgroup_path" ]] \
      || die "Web slot cgroup boundary is unsafe (${phase})"
    pid_inventory="$(timeout --foreground --kill-after=2s 10s \
      find "$cgroup_path" -type f -name cgroup.procs -exec awk 'NF { print }' {} \;)" \
      || die "Web slot cgroup PID inventory failed (${phase})"
    [[ -z "$pid_inventory" ]] || die "Web slot cgroup is not empty (${phase})"
  fi
  if [[ "$unprivileged_test_mode" == true ]]; then
    [[ "${TEST_CACHE_FOREIGN_UID_PROCESS:-false}" != true ]] \
      || die "Web slot identity owns a foreign process (${phase})"
    [[ "${TEST_CACHE_NSS_DRIFT:-false}" != true ]] \
      || die "Web slot NSS identity is not exact (${phase})"
  else
    for status_file in /proc/[0-9]*/status; do
      if stable_process_status_has_uid "$status_file" "$service_uid"; then
        die "Web slot identity owns a process while cache preparation requires global UID quiescence (${phase}:${status_file})"
      else
        status_result=$?
        [[ "$status_result" == 1 ]] \
          || die "cannot prove stable complete Web slot UID process inventory (${phase}:${status_file})"
      fi
    done
  fi
}

attest_slot_stopped pre

cache_directory="${cache_parent}/leetplus-web-${slot}"
quarantine_root="${cache_parent}/leetplus-web-retired"
if [[ "$unprivileged_test_mode" == false ]]; then
  marker_parent="$(dirname -- "$marker_root")"
  [[ "$marker_parent" == '/var/lib/leetplus' && -d "$marker_parent" && ! -L "$marker_parent" \
    && "$(realpath -e -- "$marker_parent")" == "$marker_parent" \
    && "$(stat -c '%U:%G' -- "$marker_parent")" == 'root:root' \
    && -z "$(find -P "$marker_parent" -maxdepth 0 -perm /022 -print -quit)" ]] \
    || die 'cache marker parent is not canonical root-controlled'
fi
if [[ -e "$marker_root" || -L "$marker_root" ]]; then
  [[ -d "$marker_root" && ! -L "$marker_root" ]] || die 'cache marker root is not a real directory'
fi
if [[ "$unprivileged_test_mode" == true ]]; then
  install -d -m 0700 -- "$marker_root"
else
  install -d -o root -g leetplus-runtime -m 0750 -- "$marker_root"
fi
attest_slot_stopped before-cache-effect
marker_root="$(realpath -e -- "$marker_root")"
authoritative_marker="${marker_root}/${slot}.sha"
if [[ "$unprivileged_test_mode" == false ]]; then
  [[ "$marker_root" == '/var/lib/leetplus/web-cache-releases' \
    && "$(stat -c '%U:%G:%a' -- "$marker_root")" == 'root:leetplus-runtime:750' \
    && -z "$(find -P "$marker_root" -maxdepth 0 -perm /022 -print -quit)" ]] \
    || die 'cache marker root must be canonical root:leetplus-runtime mode 0750'
fi
[[ -d "$cache_parent" && ! -L "$cache_parent" ]] || die 'cache root is absent or unsafe'
cache_parent="$(realpath -e -- "$cache_parent")"
if [[ "$unprivileged_test_mode" == false ]]; then
  [[ "$cache_parent" == '/var/cache' ]] || die 'cache parent is not canonical /var/cache'
fi
cache_directory="${cache_parent}/leetplus-web-${slot}"
quarantine_root="${cache_parent}/leetplus-web-retired"

[[ -d "$cache_parent" && ! -L "$cache_parent" ]] || die 'cache parent changed before quarantine preparation'
if [[ "$unprivileged_test_mode" == false ]]; then
  [[ "$(stat -c '%U:%G' -- "$cache_parent")" == 'root:root' \
    && -z "$(find -P "$cache_parent" -maxdepth 0 -perm /022 -print -quit)" ]] \
    || die 'cache parent authority is not root-owned/non-writable'
fi
if [[ -e "$quarantine_root" || -L "$quarantine_root" ]]; then
  [[ -d "$quarantine_root" && ! -L "$quarantine_root" \
    && "$(realpath -e -- "$quarantine_root")" == "$quarantine_root" ]] \
    || die 'cache quarantine root is not a canonical real directory'
else
  if [[ "$unprivileged_test_mode" == true ]]; then
    install -d -m 0700 -- "$quarantine_root"
  else
    install -d -o root -g root -m 0700 -- "$quarantine_root"
  fi
fi
quarantine_root="$(realpath -e -- "$quarantine_root")"
attest_quarantine_authority() {
  [[ -d "$cache_parent" && ! -L "$cache_parent" \
    && "$(realpath -e -- "$cache_parent")" == "$cache_parent" \
    && -d "$quarantine_root" && ! -L "$quarantine_root" \
    && "$(realpath -e -- "$quarantine_root")" == "$quarantine_root" \
    && "$(stat -c '%d' -- "$quarantine_root")" == "$(stat -c '%d' -- "$cache_parent")" ]] \
    || die 'cache quarantine/cache-parent authority or same-filesystem boundary is unsafe'
  if [[ "$unprivileged_test_mode" == false ]]; then
    [[ "$cache_parent" == '/var/cache' \
      && "$(stat -c '%U:%G' -- "$cache_parent")" == 'root:root' \
      && -z "$(find -P "$cache_parent" -maxdepth 0 -perm /022 -print -quit)" \
      && "$(stat -c '%U:%G:%a' -- "$quarantine_root")" == 'root:root:700' \
      && -z "$(find -P "$quarantine_root" -maxdepth 0 -perm /077 -print -quit)" ]] \
      || die 'cache quarantine/cache-parent identity is not exact'
  fi
  attest_cache_mount_boundaries
}
attest_quarantine_authority
if [[ -e "$cache_directory" || -L "$cache_directory" ]]; then
  [[ -d "$cache_directory" && ! -L "$cache_directory" ]] || die 'slot cache path is not a real directory'
  marker_is_trusted=false
  if [[ -f "$authoritative_marker" && ! -L "$authoritative_marker" ]]; then
    if [[ "$unprivileged_test_mode" == true ]]; then
      marker_is_trusted=true
    elif [[ "$(stat -c '%U' -- "$authoritative_marker")" == 'root' \
      && "$(stat -c '%a' -- "$authoritative_marker")" == '440' \
      && "$(stat -c '%h' -- "$authoritative_marker")" == '1' \
      && "$(stat -c '%U' -- "$cache_directory")" == "$service_user" \
      && "$(stat -c '%G' -- "$cache_directory")" == 'leetplus-runtime' \
      && "$(stat -c '%a' -- "$cache_directory")" == '750' ]]; then
      marker_is_trusted=true
    fi
  fi
  if [[ "$marker_is_trusted" == true \
    && "$(tr -d '\r\n' < "$authoritative_marker")" == "$release_sha" ]]; then
    attest_slot_stopped already-prepared
    printf 'WEB_CACHE_ALREADY_PREPARED_SLOT=%s\n' "$slot"
    printf 'WEB_CACHE_ALREADY_PREPARED_SHA=%s\n' "$release_sha"
    exit 0
  fi
  quarantine_path="${quarantine_root}/$(date -u +%Y%m%dT%H%M%S%NZ)-${slot}"
  [[ ! -e "$quarantine_path" && ! -L "$quarantine_path" ]] || die 'cache quarantine collision'
  attest_quarantine_authority
  attest_slot_stopped before-quarantine-effect
  mv -T -- "$cache_directory" "$quarantine_path"
  sync -d "$cache_parent"
  sync -d "$quarantine_root"
  attest_quarantine_authority
  attest_slot_stopped after-quarantine
fi

if [[ "$unprivileged_test_mode" == true ]]; then
  install -d -m 0750 -- "$cache_directory"
else
  install -d -o "$service_user" -g leetplus-runtime -m 0750 -- "$cache_directory"
fi
attest_slot_stopped after-cache-create
if [[ "$unprivileged_test_mode" == false ]]; then
  [[ -d "$marker_root" && ! -L "$marker_root" \
    && "$(realpath -e -- "$marker_root")" == '/var/lib/leetplus/web-cache-releases' \
    && "$(stat -c '%U:%G:%a' -- "$marker_root")" == 'root:leetplus-runtime:750' ]] \
    || die 'cache marker root changed before marker commit'
fi
marker_temporary="$(mktemp "${marker_root}/.${slot}.sha.new.XXXXXX")"
[[ -f "$marker_temporary" && ! -L "$marker_temporary" \
  && "$(dirname -- "$(realpath -e -- "$marker_temporary")")" == "$marker_root" \
  && "$(stat -c '%h' -- "$marker_temporary")" == 1 ]] \
  || die 'cache marker temporary is unsafe'
printf '%s\n' "$release_sha" > "$marker_temporary"
if [[ "$unprivileged_test_mode" == false ]]; then
  chown root:leetplus-runtime -- "$marker_temporary"
fi
chmod 0440 -- "$marker_temporary"
attest_slot_stopped before-marker-commit
mv -T -- "$marker_temporary" "$authoritative_marker"
sync -f "$authoritative_marker"
sync -d "$marker_root"
if [[ "$unprivileged_test_mode" == false ]]; then
  [[ -f "$authoritative_marker" && ! -L "$authoritative_marker" \
    && "$(stat -c '%U:%G:%a:%h' -- "$authoritative_marker")" == 'root:leetplus-runtime:440:1' ]] \
    || die 'cache marker commit identity is unsafe'
fi
attest_slot_stopped post
attest_quarantine_authority

printf 'WEB_CACHE_PREPARED_SLOT=%s\n' "$slot"
printf 'WEB_CACHE_PREPARED_SHA=%s\n' "$release_sha"
printf 'WEB_CACHE_OLD_DATA_DELETED=false\n'
