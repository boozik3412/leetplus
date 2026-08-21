#!/usr/bin/bash -p
# Crash-resumable first-cutover preparation:
#   exact scheduler-free N-1 -> atomic nginx route -> public smoke -> stop and
#   disable every reviewed legacy unit -> bounded cgroup/database drain.
# After the public route is accepted this script never restarts or routes back
# to scheduler-capable legacy processes.

[[ $- == *p* ]] || { printf 'activate-legacy-rollback-contour: privileged Bash mode is required\n' >&2; exit 1; }
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

readonly LEGACY_SHA='7de04ff4ccc814494810730be3fa6bf661097b07'
readonly LEGACY_SAFE_NGINX_SHA256='ebd449a4221dcb0c1d5449b4f87893bcad58b1f16319551730ca5aefde571b25'
readonly NGINX_RECOVERY_DROPIN_SHA256='65d7aae54bdded580a491713185229d81bec9f560249f5f4cb82e279900358f8'
readonly API_UNIT="leetplus-api-rollback@${LEGACY_SHA}.service"
readonly WEB_UNIT="leetplus-web-rollback@${LEGACY_SHA}.service"

die() {
  printf 'activate-legacy-rollback-contour: %s\n' "$*" >&2
  exit 1
}

config_root='/etc/nginx/leetplus'
state_root='/var/lib/leetplus/legacy-drain'
deployment_state_root='/var/lib/leetplus/deploy-receipts'
systemd_root='/etc/systemd/system'
unit_manifest='/etc/leetplus/legacy-drain-units.conf'
cgroup_root='/sys/fs/cgroup'
proc_root='/proc'
rollback_probe='/usr/local/libexec/leetplus/verify-legacy-rollback-readiness.sh'
drain_verifier='/usr/local/libexec/leetplus/verify-legacy-runtime-drain.sh'
database_fence='/usr/local/libexec/leetplus/apply-legacy-database-login-fence.sh'
public_api_url='https://api.leetplus.ru'
public_web_url='https://leetplus.ru'
watchdog_seconds=30
connection_drain_seconds=120
connection_clean_samples=3
fault_after=''
unprivileged_test_mode=false
declare -a rollback_probe_arguments=()
declare -a drain_verifier_arguments=()
declare -a database_fence_arguments=()

while (($# > 0)); do
  case "$1" in
    --config-root) config_root="${2:-}"; shift 2 ;;
    --state-root) state_root="${2:-}"; shift 2 ;;
    --deployment-state-root) deployment_state_root="${2:-}"; shift 2 ;;
    --systemd-root) systemd_root="${2:-}"; shift 2 ;;
    --unit-manifest) unit_manifest="${2:-}"; shift 2 ;;
    --cgroup-root) cgroup_root="${2:-}"; shift 2 ;;
    --proc-root) proc_root="${2:-}"; shift 2 ;;
    --rollback-probe) rollback_probe="${2:-}"; shift 2 ;;
    --drain-verifier) drain_verifier="${2:-}"; shift 2 ;;
    --database-fence) database_fence="${2:-}"; shift 2 ;;
    --rollback-probe-argument) rollback_probe_arguments+=("${2:-}"); shift 2 ;;
    --drain-verifier-argument) drain_verifier_arguments+=("${2:-}"); shift 2 ;;
    --database-fence-argument) database_fence_arguments+=("${2:-}"); shift 2 ;;
    --public-api-url) public_api_url="${2:-}"; shift 2 ;;
    --public-web-url) public_web_url="${2:-}"; shift 2 ;;
    --watchdog-seconds) watchdog_seconds="${2:-}"; shift 2 ;;
    --connection-drain-seconds) connection_drain_seconds="${2:-}"; shift 2 ;;
    --connection-clean-samples) connection_clean_samples="${2:-}"; shift 2 ;;
    --fault-after) fault_after="${2:-}"; shift 2 ;;
    --unprivileged-test-mode) unprivileged_test_mode=true; shift ;;
    *) die "unknown argument: $1" ;;
  esac
done

[[ "$watchdog_seconds" =~ ^[0-9]+$ ]] || die 'watchdog seconds must be an integer'
((watchdog_seconds >= 5 && watchdog_seconds <= 60)) || die 'watchdog seconds must be between 5 and 60'
[[ "$connection_drain_seconds" =~ ^[1-9][0-9]*$ && "$connection_clean_samples" =~ ^[1-9][0-9]*$ ]] \
  || die 'connection drain bounds must be positive integers'
((connection_drain_seconds <= 300 && connection_clean_samples <= 10)) \
  || die 'connection drain bounds exceed reviewed maxima'
if [[ "$unprivileged_test_mode" == true ]]; then
  ((EUID != 0)) || die 'unprivileged test mode is forbidden for root'
  PATH="$LEETPLUS_BOOTSTRAP_TEST_PATH"
  export PATH
  [[ -z "$fault_after" || "$fault_after" =~ ^(intent|link|reload|routed|connections|dropins|database-fence|fence|stop|drain|receipt)$ ]] \
    || die 'unknown test fault phase'
else
  ((EUID == 0)) || die 'production rollback activation must run as root'
  [[ "$config_root" == '/etc/nginx/leetplus' ]] || die 'production nginx root cannot be overridden'
  [[ "$state_root" == '/var/lib/leetplus/legacy-drain' ]] || die 'production state root cannot be overridden'
  [[ "$deployment_state_root" == '/var/lib/leetplus/deploy-receipts' ]] \
    || die 'production deployment lock root cannot be overridden'
  [[ "$systemd_root" == '/etc/systemd/system' ]] || die 'production systemd root cannot be overridden'
  [[ "$unit_manifest" == '/etc/leetplus/legacy-drain-units.conf' ]] || die 'production unit manifest cannot be overridden'
  [[ "$cgroup_root" == '/sys/fs/cgroup' ]] || die 'production cgroup root cannot be overridden'
  [[ "$proc_root" == '/proc' ]] || die 'production proc root cannot be overridden'
  [[ "$rollback_probe" == '/usr/local/libexec/leetplus/verify-legacy-rollback-readiness.sh' ]] || die 'production rollback probe cannot be overridden'
  [[ "$drain_verifier" == '/usr/local/libexec/leetplus/verify-legacy-runtime-drain.sh' ]] || die 'production drain verifier cannot be overridden'
  [[ "$database_fence" == '/usr/local/libexec/leetplus/apply-legacy-database-login-fence.sh' ]] \
    || die 'production database fence cannot be overridden'
  [[ "$public_api_url" == 'https://api.leetplus.ru' && "$public_web_url" == 'https://leetplus.ru' ]] \
    || die 'production public URLs cannot be overridden'
  [[ "$watchdog_seconds" == 30 && "$connection_drain_seconds" == 120 \
    && "$connection_clean_samples" == 3 ]] \
    || die 'production watchdog/drain bounds cannot be overridden'
  ((${#rollback_probe_arguments[@]} == 0 && ${#drain_verifier_arguments[@]} == 0 \
    && ${#database_fence_arguments[@]} == 0)) \
    || die 'production verifier arguments cannot be extended'
  [[ -z "$fault_after" ]] || die 'fault injection is forbidden in production'
fi
unset LEETPLUS_BOOTSTRAP_TEST_PATH

for command_name in awk basename cat chmod cp curl date dirname find findmnt flock grep install ln mkdir mktemp mount mv nginx pgrep realpath rm sed sha256sum sort ss stat sync systemctl timeout tr unshare wc; do
  command -v "$command_name" >/dev/null 2>&1 || die "required command is unavailable: $command_name"
done

for required_path in "$config_root" "$state_root" "$deployment_state_root" "$systemd_root" "$cgroup_root" "$proc_root"; do
  [[ -d "$required_path" && ! -L "$required_path" ]] || die "required directory is absent or symlinked: ${required_path}"
done
for required_file in "$unit_manifest" "$rollback_probe" "$drain_verifier" "$database_fence"; do
  [[ -f "$required_file" && ! -L "$required_file" ]] || die "required file is absent or symlinked: ${required_file}"
done
[[ -x "$rollback_probe" && -x "$drain_verifier" && -x "$database_fence" ]] \
  || die 'rollback/drain/database-fence helpers must be executable'

config_root="$(realpath -e -- "$config_root")"
state_root="$(realpath -e -- "$state_root")"
deployment_state_root="$(realpath -e -- "$deployment_state_root")"
systemd_root="$(realpath -e -- "$systemd_root")"
cgroup_root="$(realpath -e -- "$cgroup_root")"
proc_root="$(realpath -e -- "$proc_root")"
unit_manifest="$(realpath -e -- "$unit_manifest")"
rollback_probe="$(realpath -e -- "$rollback_probe")"
drain_verifier="$(realpath -e -- "$drain_verifier")"
database_fence="$(realpath -e -- "$database_fence")"

if [[ "$unprivileged_test_mode" == false ]]; then
  [[ "$config_root" == '/etc/nginx/leetplus' \
    && "$state_root" == '/var/lib/leetplus/legacy-drain' \
    && "$deployment_state_root" == '/var/lib/leetplus/deploy-receipts' \
    && "$systemd_root" == '/etc/systemd/system' \
    && "$cgroup_root" == '/sys/fs/cgroup' \
    && "$proc_root" == '/proc' \
    && "$unit_manifest" == '/etc/leetplus/legacy-drain-units.conf' \
    && "$rollback_probe" == '/usr/local/libexec/leetplus/verify-legacy-rollback-readiness.sh' \
    && "$drain_verifier" == '/usr/local/libexec/leetplus/verify-legacy-runtime-drain.sh' \
    && "$database_fence" == '/usr/local/libexec/leetplus/apply-legacy-database-login-fence.sh' ]] \
    || die 'production rollback authority contains a symlinked/noncanonical ancestor'
  [[ "$(stat -c '%U:%a' -- "$state_root")" == 'root:700' ]] || die 'production drain state root must be root-owned mode 0700'
  [[ "$(stat -c '%U:%a' -- "$deployment_state_root")" == 'root:700' ]] \
    || die 'production deployment lock root must be root-owned mode 0700'
fi

active_link="${config_root}/active-upstreams.conf"
upstream_root="${config_root}/upstreams"
safe_target="${upstream_root}/legacy-safe.conf"
legacy_target="${upstream_root}/legacy.conf"
[[ -d "$upstream_root" && ! -L "$upstream_root" ]] || die 'nginx upstream root must be a real directory'
upstream_root="$(realpath -e -- "$upstream_root")"
for target in "$safe_target" "$legacy_target"; do
  [[ -f "$target" && ! -L "$target" && "$(realpath -e -- "$target")" == "$target" ]] \
    || die "reviewed nginx target is absent or not canonical: ${target}"
done
[[ -L "$active_link" ]] || die 'active nginx upstream link is absent'
recovery_dropin="${systemd_root}/nginx.service.d/leetplus-blue-green-recovery.conf"
declare -A operational_file_sha256=()

attest_operational_authority() {
  local trusted_directory trusted_file file_digest mount_inventory mount_target
  local -a direct_directories=(
    "$config_root" "$upstream_root" "$state_root" "$deployment_state_root" "$systemd_root"
    "$(dirname -- "$unit_manifest")" "$(dirname -- "$rollback_probe")"
    "$(dirname -- "$drain_verifier")" "$(dirname -- "$database_fence")"
  )
  local -a direct_files=(
    "$safe_target" "$legacy_target" "$unit_manifest" "$rollback_probe"
    "$drain_verifier" "$database_fence" "$recovery_dropin"
  )

  for trusted_directory in "${direct_directories[@]}"; do
    [[ -d "$trusted_directory" && ! -L "$trusted_directory" \
      && "$(realpath -e -- "$trusted_directory")" == "$trusted_directory" \
      && -z "$(find -P "$trusted_directory" -maxdepth 0 -perm /022 -print -quit)" ]] \
      || die "operational directory is symlinked or group/other-writable: ${trusted_directory}"
  done
  for trusted_file in "${direct_files[@]}"; do
    [[ -f "$trusted_file" && ! -L "$trusted_file" \
      && "$(realpath -e -- "$trusted_file")" == "$trusted_file" \
      && "$(stat -c '%h' -- "$trusted_file")" == 1 \
      && -z "$(find -P "$trusted_file" -maxdepth 0 -perm /022 -print -quit)" ]] \
      || die "operational file is not canonical/nonwritable/single-linked: ${trusted_file}"
    file_digest="$(sha256sum "$trusted_file" | awk '{ print $1 }')" \
      || die "cannot digest operational file: ${trusted_file}"
    if [[ -n "${operational_file_sha256[$trusted_file]+present}" ]]; then
      [[ "${operational_file_sha256[$trusted_file]}" == "$file_digest" ]] \
        || die "operational file changed during activation: ${trusted_file}"
    else
      operational_file_sha256[$trusted_file]="$file_digest"
    fi
  done
  [[ -L "$active_link" && "$(stat -c '%h' -- "$active_link")" == 1 ]] \
    || die 'active nginx link is absent or multiply linked'

  if [[ "$unprivileged_test_mode" == false ]]; then
    for trusted_directory in /etc /etc/nginx /etc/leetplus /etc/systemd \
      /usr /usr/local /usr/local/libexec /var /var/lib /var/lib/leetplus \
      "${direct_directories[@]}"; do
      [[ "$(stat -c '%U:%G' -- "$trusted_directory")" == root:root ]] \
        || die "operational ancestor is not root-owned: ${trusted_directory}"
    done
    for trusted_file in "${direct_files[@]}"; do
      [[ "$(stat -c '%U:%G' -- "$trusted_file")" == root:root ]] \
        || die "operational file is not root-owned: ${trusted_file}"
    done
    [[ "$(stat -c '%U:%G' -- "$active_link")" == root:root ]] \
      || die 'active nginx link is not root-owned'
    mount_inventory="$(findmnt --raw --noheadings --output TARGET)" \
      || die 'operational mount inventory failed or returned partial output'
    while IFS= read -r mount_target; do
      for trusted_directory in "${direct_directories[@]}"; do
        case "$mount_target" in
          "$trusted_directory"|"$trusted_directory"/*)
            die "operational boundary contains an exact/nested mount: ${mount_target}"
            ;;
        esac
      done
    done <<< "$mount_inventory"
  fi
}

attest_operational_authority
[[ "${operational_file_sha256[$safe_target]}" == "$LEGACY_SAFE_NGINX_SHA256" ]] \
  || die 'scheduler-free nginx target differs from the pinned reviewed byte'
[[ "${operational_file_sha256[$recovery_dropin]}" == "$NGINX_RECOVERY_DROPIN_SHA256" ]] \
  || die 'nginx recovery ordering differs from the pinned reviewed byte'

acquire_hardened_lock() {
  local lock_path="$1" lock_fd="$2" label="$3" parent expected_identity fd_path
  parent="$(dirname -- "$lock_path")"
  [[ -d "$parent" && ! -L "$parent" && "$(realpath -e -- "$parent")" == "$parent" ]] \
    || die "${label} lock parent is noncanonical"
  if [[ ! -e "$lock_path" && ! -L "$lock_path" ]]; then
    (umask 0077; set -o noclobber; : > "$lock_path") \
      || die "failed to create ${label} lock without following links"
    chmod 0600 "$lock_path"
    sync -f "$lock_path"
    sync -d "$parent"
  fi
  if [[ "$unprivileged_test_mode" == false ]]; then
    expected_identity='root:root:600:1'
  else
    expected_identity="$(stat -c '%U:%G' -- "$parent"):600:1"
  fi
  [[ -f "$lock_path" && ! -L "$lock_path" \
    && "$(stat -c '%U:%G:%a:%h' -- "$lock_path")" == "$expected_identity" ]] \
    || die "${label} lock path identity is unsafe"
  case "$lock_fd" in
    8) exec 8>> "$lock_path" ;;
    9) exec 9>> "$lock_path" ;;
    *) die 'internal lock descriptor is not reviewed' ;;
  esac
  fd_path="/proc/$$/fd/${lock_fd}"
  [[ "$(realpath -e -- "$fd_path")" == "$lock_path" \
    && "$(stat -Lc '%U:%G:%a:%h' -- "$fd_path")" == "$expected_identity" ]] \
    || die "${label} lock descriptor/path identity is unsafe before flock"
  if ! flock -n "$lock_fd"; then
    if [[ "$label" == 'shared cutover' ]]; then
      die 'another blue/green or scheduler-free activation holds the deployment lock'
    fi
    die "another operation holds the ${label} lock"
  fi
  [[ -f "$lock_path" && ! -L "$lock_path" \
    && "$(realpath -e -- "$fd_path")" == "$lock_path" \
    && "$(stat -c '%U:%G:%a:%h' -- "$lock_path")" == "$expected_identity" \
    && "$(stat -Lc '%U:%G:%a:%h' -- "$fd_path")" == "$expected_identity" ]] \
    || die "${label} lock changed while held"
}

acquire_hardened_lock "${deployment_state_root}/cutover.lock" 8 'shared cutover'
acquire_hardened_lock "${state_root}/activation.lock" 9 'scheduler-free activation'
attest_operational_authority

declare -A unit_class=()
declare -A discovered_units=()
declare -a drain_units=()
while IFS=$' \t' read -r classification unit extra; do
  [[ -z "${classification:-}" || "$classification" == \#* ]] && continue
  [[ -z "${extra:-}" ]] || die 'unit manifest line contains extra fields'
  [[ "$classification" == 'REQUIRED_DRAIN' || "$classification" == 'OPTIONAL_DRAIN' || "$classification" == 'SAFE' ]] \
    || die "unknown unit classification: ${classification}"
  [[ "$unit" =~ ^leetplus-[A-Za-z0-9@_.-]+\.(service|timer)$ ]] || die "unsafe unit name: ${unit}"
  [[ -z "${unit_class[$unit]:-}" ]] || die "duplicate unit manifest entry: ${unit}"
  unit_class[$unit]="$classification"
  if [[ "$classification" == 'SAFE' ]]; then
    case "$unit" in
      leetplus-api-rollback@.service|leetplus-web-rollback@.service|\
      leetplus-api-rollback@7de04ff4ccc814494810730be3fa6bf661097b07.service|\
      leetplus-web-rollback@7de04ff4ccc814494810730be3fa6bf661097b07.service|\
      leetplus-rollback-egress.service|leetplus-api@.service|leetplus-web@.service|\
      leetplus-api@blue.service|leetplus-web@blue.service|\
      leetplus-api@green.service|leetplus-web@green.service|\
      leetplus-release-hydrate@.service|\
      leetplus-release-hydrate@7de04ff4ccc814494810730be3fa6bf661097b07.service|\
      leetplus-blue-green-recovery.service|leetplus-blue-green-recovery-watchdog.service|\
      leetplus-blue-green-recovery.timer) ;;
      *) die "unit is not on the closed SAFE allowlist: ${unit}" ;;
    esac
  fi
  [[ "$classification" == *_DRAIN ]] && drain_units+=("$unit")
done < "$unit_manifest"
for canonical_drain in leetplus-api.service leetplus-web.service leetplus-deploy.timer; do
  [[ "${unit_class[$canonical_drain]:-}" == 'REQUIRED_DRAIN' ]] \
    || die "canonical scheduler-capable unit must be REQUIRED_DRAIN: ${canonical_drain}"
done

systemctl_bounded() {
  timeout --foreground --kill-after=2s 10s systemctl "$@"
}

unit_files_output="$(systemctl_bounded list-unit-files 'leetplus-*' --type=service --type=timer --no-legend --no-pager)" \
  || die 'installed unit inventory failed or timed out'
loaded_units_output="$(systemctl_bounded list-units 'leetplus-*' --all --type=service --type=timer --plain --no-legend --no-pager)" \
  || die 'loaded/transient unit inventory failed or timed out'
while IFS=$' \t' read -r discovered_unit _; do
  [[ -z "${discovered_unit:-}" ]] && continue
  [[ "$discovered_unit" =~ ^leetplus-[A-Za-z0-9@_.-]+\.(service|timer)$ ]] || continue
  discovered_units[$discovered_unit]=1
  [[ -n "${unit_class[$discovered_unit]:-}" ]] || die "installed/loaded leetplus unit is unclassified: ${discovered_unit}"
done <<< "${unit_files_output}"$'\n'"${loaded_units_output}"
for unit in "${!unit_class[@]}"; do
  [[ "${unit_class[$unit]}" != 'REQUIRED_DRAIN' || -n "${discovered_units[$unit]:-}" ]] \
    || die "required legacy unit is not installed: ${unit}"
done

[[ -f "$recovery_dropin" && ! -L "$recovery_dropin" \
  && "$(tr -d '\r' < "$recovery_dropin")" == $'[Unit]\nRequires=leetplus-blue-green-recovery.service\nAfter=leetplus-blue-green-recovery.service\n\n# nginx may not start/reload a boot-persistent candidate link until outstanding\n# pre-effect intent recovery has restored and syntax-checked the exact N-1 link.' ]] \
  || die 'nginx recovery ordering drop-in is absent or not exact'
if [[ "$unprivileged_test_mode" == false ]]; then
  [[ "$(stat -c '%U:%G:%a' -- "$recovery_dropin")" == 'root:root:644' ]] \
    || die 'nginx recovery ordering drop-in ownership/mode is unsafe'
fi
attest_operational_authority
systemctl_bounded is-enabled --quiet leetplus-blue-green-recovery.service \
  || die 'pre-nginx recovery service is not boot-enabled'
systemctl_bounded is-enabled --quiet leetplus-blue-green-recovery.timer \
  || die 'recovery watchdog timer is not boot-enabled'
systemctl_bounded is-active --quiet leetplus-blue-green-recovery.timer \
  || die 'recovery watchdog timer is not active'
nginx_dropins="$(systemctl_bounded show --property=DropInPaths --value nginx.service)" \
  || die 'cannot attest loaded nginx recovery ordering'
case " $nginx_dropins " in
  *" $recovery_dropin "*) ;;
  *) die 'nginx has not loaded the exact recovery ordering drop-in' ;;
esac
[[ "$(systemctl_bounded show --property=NeedDaemonReload --value nginx.service)" == no ]] \
  || die 'nginx effective configuration is stale after contour installation'

timeout --foreground --kill-after=5s 120s \
  "$rollback_probe" --release-sha "$LEGACY_SHA" "${rollback_probe_arguments[@]}" \
  || die 'scheduler-free rollback pair is not ready before routing'

intent_path="${state_root}/activation.intent"
receipt_path="${state_root}/activation.receipt"
snapshot_path="${state_root}/legacy-processes.snapshot"
drain_output_path="${state_root}/drain-verification.new"
route_marker="${state_root}/routed-publicly.marker"
connection_marker="${state_root}/legacy-connections-drained.marker"
nginx_worker_snapshot="${state_root}/legacy-nginx-workers.snapshot"
nginx_reload_marker="${state_root}/scheduler-free-nginx-reloaded.marker"
dropins_marker="${state_root}/start-fence-dropins-loaded.marker"
fence_marker="${state_root}/legacy-start-fence"
database_fence_marker="${state_root}/legacy-database-login-fence.marker"
restore_failure_marker="${state_root}/preboundary-restore-failed.marker"
past_drain_boundary=false

atomic_from_stdin() {
  local destination="$1" temporary
  temporary="${destination}.new.$$"
  [[ ! -L "$destination" ]] || die "refusing to replace symlinked state: ${destination}"
  cat > "$temporary"
  chmod 0600 "$temporary"
  mv -T "$temporary" "$destination"
  sync -f "$destination"
  sync -d "$state_root"
}

fault_checkpoint() {
  local phase="$1"
  if [[ "$fault_after" == "$phase" ]]; then
    printf 'activate-legacy-rollback-contour: injected crash after %s\n' "$phase" >&2
    exit 97
  fi
}

verify_intent() {
  [[ -f "$intent_path" && ! -L "$intent_path" ]] || die 'activation intent is absent or symlinked'
  [[ "$(wc -l < "$intent_path" | tr -d '[:space:]')" == 9 ]] || die 'activation intent schema is not exact'
  [[ -z "$(awk -F= 'NF < 2 || seen[$1]++ { print; exit }' "$intent_path")" ]] \
    || die 'activation intent contains a malformed or duplicate key'
  grep -F -x 'RECORD_VERSION=1' "$intent_path" >/dev/null || die 'activation intent version is invalid'
  grep -F -x "LEGACY_ROLLBACK_SHA=${LEGACY_SHA}" "$intent_path" >/dev/null || die 'activation intent is bound to another release'
  grep -F -x "PREVIOUS_TARGET=${legacy_target}" "$intent_path" >/dev/null || die 'activation intent previous target is invalid'
  grep -F -x "PREVIOUS_TARGET_SHA256=$(sha256sum "$legacy_target" | awk '{ print $1 }')" "$intent_path" >/dev/null \
    || die 'scheduler-capable bootstrap nginx target changed after intent creation'
  grep -F -x "SAFE_TARGET=${safe_target}" "$intent_path" >/dev/null || die 'activation intent safe target is invalid'
  grep -F -x "SAFE_TARGET_SHA256=$(sha256sum "$safe_target" | awk '{ print $1 }')" "$intent_path" >/dev/null \
    || die 'scheduler-free nginx target changed after intent creation'
  grep -F -x "PROCESS_SNAPSHOT_SHA256=$(sha256sum "$snapshot_path" | awk '{ print $1 }')" "$intent_path" >/dev/null \
    || die 'activation process snapshot changed after intent creation'
  grep -F -x "UNIT_MANIFEST_SHA256=$(sha256sum "$unit_manifest" | awk '{ print $1 }')" "$intent_path" >/dev/null \
    || die 'reviewed unit manifest changed after intent creation'
  grep -E '^INTENT_RECORDED_AT=[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z$' "$intent_path" >/dev/null \
    || die 'activation intent timestamp is invalid'
}

if [[ -f "$receipt_path" && ! -L "$receipt_path" ]]; then
  [[ "$(realpath -e -- "$active_link")" == "$safe_target" ]] || die 'accepted scheduler-free route is no longer active'
  timeout --foreground --kill-after=5s 330s \
    "$rollback_probe" --release-sha "$LEGACY_SHA" --require-drain "${rollback_probe_arguments[@]}" \
    || die 'accepted scheduler-free contour no longer verifies'
  # Receipt rename is the commit point. The immutable intent/phase evidence is
  # intentionally retained so every receipt digest remains independently
  # recomputable after a lost response or later recovery.
  printf 'LEGACY_ROLLBACK_ACTIVATION_ALREADY_ACCEPTED=true\n'
  printf 'LEGACY_ROLLBACK_ACTIVATION_RECEIPT=%s\n' "$receipt_path"
  exit 0
fi

process_start_ticks() {
  local pid="$1" stat_tail
  [[ -r "${proc_root}/${pid}/stat" ]] || return 1
  stat_tail="$(sed 's/^.*) //' "${proc_root}/${pid}/stat")" || return 1
  awk '{ print $20 }' <<< "$stat_tail"
}

capture_unit_processes() {
  local output="$1" unit load_state control_group cgroup_path pid start_ticks cgroup_pid_inventory
  local temporary="${output}.new.$$"
  : > "$temporary"
  for unit in "${drain_units[@]}"; do
    load_state="$(systemctl_bounded show --property=LoadState --value "$unit" 2>/dev/null || true)"
    [[ "$load_state" == 'not-found' || -z "$load_state" ]] && continue
    for property in MainPID ControlPID ExecMainPID; do
      pid="$(systemctl_bounded show --property="$property" --value "$unit" 2>/dev/null || true)"
      [[ "$pid" =~ ^[1-9][0-9]*$ ]] || continue
      start_ticks="$(process_start_ticks "$pid")" || die "cannot capture stable PID identity for ${unit}"
      printf '%s|%s|%s\n' "$unit" "$pid" "$start_ticks" >> "$temporary"
    done
    control_group="$(systemctl_bounded show --property=ControlGroup --value "$unit" 2>/dev/null || true)"
    if [[ -n "$control_group" ]]; then
      [[ "$control_group" == /* && "$control_group" != *'..'* ]] || die "unsafe cgroup path for ${unit}"
      cgroup_path="${cgroup_root}${control_group}"
      if [[ -d "$cgroup_path" ]]; then
        cgroup_pid_inventory="$(timeout --foreground --kill-after=2s 10s \
          find "$cgroup_path" -type f -name cgroup.procs -exec awk 'NF { print }' {} \; 2>/dev/null)" \
          || die "cgroup PID inventory failed or returned partial output for ${unit}"
        while IFS= read -r pid; do
          [[ -z "$pid" ]] && continue
          [[ "$pid" =~ ^[1-9][0-9]*$ ]] || die "invalid cgroup PID for ${unit}"
          start_ticks="$(process_start_ticks "$pid")" || die "cannot capture cgroup PID identity for ${unit}"
          printf '%s|%s|%s\n' "$unit" "$pid" "$start_ticks" >> "$temporary"
        done <<< "$cgroup_pid_inventory"
      fi
    fi
  done
  LC_ALL=C sort -u "$temporary" -o "$temporary"
  chmod 0600 "$temporary"
  mv -T "$temporary" "$output"
  sync -f "$output"
  sync -d "$state_root"
}

atomic_link() {
  local target="$1" temporary="${active_link}.next.$$"
  rm -f -- "$temporary"
  ln -s -- "$target" "$temporary"
  mv -Tf -- "$temporary" "$active_link"
  sync -d "$config_root"
  [[ "$(realpath -e -- "$active_link")" == "$target" ]]
}

nginx_test() { timeout 15 nginx -t; }
nginx_reload() { systemctl_bounded reload nginx.service; }

capture_nginx_workers() {
  local master_pid worker_pid worker_ticks temporary workers_output
  master_pid="$(systemctl_bounded show --property=MainPID --value nginx.service)" \
    || die 'cannot inventory nginx master PID'
  [[ "$master_pid" =~ ^[1-9][0-9]*$ ]] || die 'nginx master PID is absent'
  workers_output="$(timeout --foreground --kill-after=2s 10s pgrep -P "$master_pid" nginx)" \
    || die 'cannot capture the pre-reload nginx worker generation'
  temporary="${nginx_worker_snapshot}.new.$$"
  : > "$temporary"
  while IFS= read -r worker_pid; do
    [[ "$worker_pid" =~ ^[1-9][0-9]*$ ]] || die 'nginx worker inventory contains an invalid PID'
    worker_ticks="$(process_start_ticks "$worker_pid")" || die 'cannot capture stable nginx worker identity'
    printf '%s|%s\n' "$worker_pid" "$worker_ticks" >> "$temporary"
  done <<< "$workers_output"
  LC_ALL=C sort -u "$temporary" -o "$temporary"
  [[ -s "$temporary" ]] || die 'no nginx worker generation was captured before reload'
  chmod 0600 "$temporary"
  mv -T "$temporary" "$nginx_worker_snapshot"
  sync -f "$nginx_worker_snapshot"
  sync -d "$state_root"
}

public_smoke() {
  local status
  status="$(timeout 15 curl --disable --noproxy '*' --proto '=http,https' --proto-redir '=http,https' --silent --show-error --max-time 10 --output /dev/null --write-out '%{http_code}' "${public_api_url}/health")" || return 1
  [[ "$status" =~ ^2[0-9][0-9]$ ]] || return 1
  status="$(timeout 15 curl --disable --noproxy '*' --proto '=http,https' --proto-redir '=http,https' --silent --show-error --max-time 10 --output /dev/null --write-out '%{http_code}' "${public_web_url}/")" || return 1
  [[ "$status" =~ ^2[0-9][0-9]$ ]]
}

restore_legacy_route() {
  local restore_deadline restore_successes=0
  rm -f -- "$nginx_reload_marker" "$nginx_worker_snapshot"
  sync -d "$state_root"
  if ! atomic_link "$legacy_target" || ! nginx_test || ! nginx_reload \
    || [[ "$(realpath -e -- "$active_link" 2>/dev/null || true)" != "$legacy_target" ]]; then
    {
      printf 'LEGACY_PREBOUNDARY_RESTORE_FAILED=true\n'
      printf 'FAILED_AT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%S.%NZ)"
    } | atomic_from_stdin "$restore_failure_marker"
    return 1
  fi
  restore_deadline=$((SECONDS + watchdog_seconds))
  while ((SECONDS < restore_deadline)); do
    if public_smoke; then
      restore_successes=$((restore_successes + 1))
      ((restore_successes >= 3)) && break
    else
      restore_successes=0
    fi
    ((SECONDS < restore_deadline)) && sleep 1
  done
  if ((restore_successes < 3)); then
    {
      printf 'LEGACY_PREBOUNDARY_RESTORE_FAILED=true\n'
      printf 'FAILED_AT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%S.%NZ)"
    } | atomic_from_stdin "$restore_failure_marker"
    return 1
  fi
  rm -f -- "$restore_failure_marker"
  sync -d "$state_root"
}

candidate_full_config_test() {
  if [[ "$unprivileged_test_mode" == true ]]; then
    nginx_test
    return
  fi
  local validation_root
  validation_root="$(mktemp -d /run/leetplus-legacy-safe-nginx.XXXXXX)"
  case "$validation_root" in /run/leetplus-legacy-safe-nginx.*) ;; *) die 'unsafe nginx validation directory' ;; esac
  cp -a -- "$config_root/." "$validation_root/"
  rm -f -- "$validation_root/active-upstreams.conf"
  ln -s -- "upstreams/$(basename -- "$safe_target")" "$validation_root/active-upstreams.conf"
  if ! timeout --foreground --kill-after=5s 20s \
    unshare --mount --propagation private /bin/sh -eu -c '
      mount --bind -- "$1" "$2"
      exec nginx -t
    ' leetplus-legacy-safe-nginx "$validation_root" "$config_root"; then
    rm -rf -- "$validation_root"
    die 'scheduler-free nginx target failed private-namespace validation'
  fi
  rm -rf -- "$validation_root"
}

if [[ -f "$intent_path" && ! -L "$intent_path" ]]; then
  [[ -f "$snapshot_path" && ! -L "$snapshot_path" ]] || die 'activation intent has no process snapshot'
  verify_intent
  current_target="$(realpath -e -- "$active_link")"
  [[ "$current_target" == "$legacy_target" || "$current_target" == "$safe_target" ]] \
    || die 'activation intent does not describe the current nginx route'
  if [[ -f "$route_marker" && ! -L "$route_marker" ]]; then
    grep -F -x 'ROUTED_PUBLICLY=true' "$route_marker" >/dev/null \
      || die 'public-route marker is malformed'
    grep -F -x "LEGACY_ROLLBACK_SHA=${LEGACY_SHA}" "$route_marker" >/dev/null \
      || die 'public-route marker is bound to another release'
    [[ "$(wc -l < "$route_marker" | tr -d '[:space:]')" == 3 ]] \
      || die 'public-route marker schema is not exact'
    grep -E '^ROUTED_AT=[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z$' "$route_marker" >/dev/null \
      || die 'public-route marker timestamp is invalid'
    past_drain_boundary=true
    [[ "$current_target" == "$safe_target" ]] \
      || die 'post-boundary activation intent cannot route to scheduler-capable legacy'
  fi
  if [[ "$past_drain_boundary" == false \
    && ( -e "$connection_marker" || -e "$dropins_marker" || -e "$database_fence_marker" \
      || -e "$fence_marker" || -e "$drain_output_path" ) ]]; then
    die 'post-route activation residue exists without a durable public-route marker'
  fi
else
  [[ ! -e "$intent_path" && ! -L "$intent_path" && ! -e "$snapshot_path" && ! -L "$snapshot_path" \
    && ! -e "$route_marker" && ! -e "$connection_marker" && ! -e "$dropins_marker" \
    && ! -e "$fence_marker" && ! -e "$database_fence_marker" && ! -e "$drain_output_path" && ! -e "$restore_failure_marker" \
    && ! -e "$nginx_worker_snapshot" && ! -e "$nginx_reload_marker" ]] \
    || die 'unexpected activation state residue requires incident review'
  [[ "$(realpath -e -- "$active_link")" == "$legacy_target" ]] \
    || die 'first activation must begin from the reviewed scheduler-capable legacy target'
  capture_unit_processes "$snapshot_path"
  {
    printf 'RECORD_VERSION=1\n'
    printf 'LEGACY_ROLLBACK_SHA=%s\n' "$LEGACY_SHA"
    printf 'PREVIOUS_TARGET=%s\n' "$legacy_target"
    printf 'PREVIOUS_TARGET_SHA256=%s\n' "$(sha256sum "$legacy_target" | awk '{ print $1 }')"
    printf 'SAFE_TARGET=%s\n' "$safe_target"
    printf 'SAFE_TARGET_SHA256=%s\n' "$(sha256sum "$safe_target" | awk '{ print $1 }')"
    printf 'PROCESS_SNAPSHOT_SHA256=%s\n' "$(sha256sum "$snapshot_path" | awk '{ print $1 }')"
    printf 'UNIT_MANIFEST_SHA256=%s\n' "$(sha256sum "$unit_manifest" | awk '{ print $1 }')"
    printf 'INTENT_RECORDED_AT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%S.%NZ)"
  } | atomic_from_stdin "$intent_path"
  verify_intent
  fault_checkpoint intent
fi

attest_operational_authority
candidate_full_config_test
current_target="$(realpath -e -- "$active_link")"
if [[ "$current_target" == "$legacy_target" ]]; then
  attest_operational_authority
  atomic_link "$safe_target" || die 'atomic scheduler-free nginx link switch failed'
  fault_checkpoint link
fi
reload_failed=false
if [[ ! -f "$nginx_reload_marker" ]]; then
  capture_nginx_workers
  if nginx_test && nginx_reload; then
    {
      printf 'SCHEDULER_FREE_NGINX_RELOADED=true\n'
      printf 'LEGACY_NGINX_WORKER_SNAPSHOT_SHA256=%s\n' "$(sha256sum "$nginx_worker_snapshot" | awk '{ print $1 }')"
    } | atomic_from_stdin "$nginx_reload_marker"
  else
    reload_failed=true
  fi
else
  [[ -f "$nginx_worker_snapshot" && ! -L "$nginx_worker_snapshot" ]] \
    || die 'nginx reload marker has no worker snapshot'
  grep -F -x 'SCHEDULER_FREE_NGINX_RELOADED=true' "$nginx_reload_marker" >/dev/null \
    || die 'nginx reload marker is malformed'
  grep -F -x "LEGACY_NGINX_WORKER_SNAPSHOT_SHA256=$(sha256sum "$nginx_worker_snapshot" | awk '{ print $1 }')" \
    "$nginx_reload_marker" >/dev/null || die 'nginx worker snapshot changed after reload'
fi
if [[ "$reload_failed" == true ]]; then
  if [[ "$past_drain_boundary" == false ]]; then
    restore_legacy_route \
      || die 'CRITICAL: scheduler-free activation failed and legacy route restoration did not verify; inspect preboundary-restore-failed.marker'
    die 'scheduler-free nginx activation failed before drain; verified legacy route restored'
  fi
  die 'scheduler-free nginx revalidation failed after drain began; safe route retained and migration remains blocked'
fi
fault_checkpoint reload

deadline=$((SECONDS + watchdog_seconds))
public_successes=0
while ((SECONDS < deadline)); do
  if systemctl_bounded is-active --quiet "$API_UNIT" \
    && systemctl_bounded is-active --quiet "$WEB_UNIT" \
    && public_smoke; then
    public_successes=$((public_successes + 1))
    ((public_successes >= 3)) && break
  else
    public_successes=0
  fi
  ((SECONDS < deadline)) && sleep 1
done
if ((public_successes < 3)); then
  if [[ "$past_drain_boundary" == false ]]; then
    restore_legacy_route \
      || die 'CRITICAL: scheduler-free watchdog and legacy route restoration both failed; inspect preboundary-restore-failed.marker'
    die 'scheduler-free public watchdog failed before drain; verified legacy route restored'
  fi
  die 'scheduler-free public watchdog failed after drain began; safe route retained and migration remains blocked'
fi

if ! timeout --foreground --kill-after=5s 120s \
  "$rollback_probe" --release-sha "$LEGACY_SHA" "${rollback_probe_arguments[@]}"; then
  if [[ "$past_drain_boundary" == false ]]; then
    restore_legacy_route \
      || die 'CRITICAL: authenticated N-1 smoke and legacy route restoration both failed; inspect preboundary-restore-failed.marker'
    die 'authenticated N-1 smoke failed after route test; verified legacy route restored before drain'
  fi
  die 'authenticated N-1 smoke failed after public boundary; safe route retained and migration remains blocked'
fi

if [[ ! -f "$route_marker" ]]; then
  {
    printf 'ROUTED_PUBLICLY=true\n'
    printf 'LEGACY_ROLLBACK_SHA=%s\n' "$LEGACY_SHA"
    printf 'ROUTED_AT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%S.%NZ)"
  } | atomic_from_stdin "$route_marker"
fi
rm -f -- "$restore_failure_marker"
sync -d "$state_root"
fault_checkpoint routed
past_drain_boundary=true

legacy_connection_count() {
  local sockets
  sockets="$(timeout --foreground --kill-after=2s 10s ss -Htan state established)" || return 2
  awk '
    {
      for (field = 1; field <= NF; field += 1) {
        if ($field ~ /:(3000|4000)$/) { count += 1; break }
      }
    }
    END { print count + 0 }
  ' <<< "$sockets"
}

legacy_nginx_worker_count() {
  local worker_pid expected_ticks extra stat_tail current_ticks count=0
  [[ -f "$nginx_worker_snapshot" && ! -L "$nginx_worker_snapshot" ]] || return 2
  while IFS='|' read -r worker_pid expected_ticks extra; do
    [[ -z "${extra:-}" && "$worker_pid" =~ ^[1-9][0-9]*$ && "$expected_ticks" =~ ^[1-9][0-9]*$ ]] \
      || return 2
    [[ -r "${proc_root}/${worker_pid}/stat" ]] || continue
    stat_tail="$(sed 's/^.*) //' "${proc_root}/${worker_pid}/stat" 2>/dev/null)" || continue
    current_ticks="$(awk '{ print $20 }' <<< "$stat_tail")"
    [[ "$current_ticks" != "$expected_ticks" ]] || count=$((count + 1))
  done < "$nginx_worker_snapshot"
  printf '%s\n' "$count"
}

if [[ -f "$connection_marker" && ! -L "$connection_marker" ]]; then
  grep -F -x 'LEGACY_BACKEND_CONNECTIONS_DRAINED=true' "$connection_marker" >/dev/null \
    || die 'legacy connection-drain marker is malformed'
  grep -F -x 'LEGACY_BACKEND_PORTS=3000,4000' "$connection_marker" >/dev/null \
    || die 'legacy connection-drain marker ports are invalid'
  grep -F -x 'LEGACY_NGINX_WORKERS_DRAINED=true' "$connection_marker" >/dev/null \
    || die 'legacy nginx worker-drain marker is invalid'
  grep -F -x "LEGACY_NGINX_WORKER_SNAPSHOT_SHA256=$(sha256sum "$nginx_worker_snapshot" | awk '{ print $1 }')" \
    "$connection_marker" >/dev/null || die 'legacy nginx worker snapshot changed after drain'
  [[ "$(wc -l < "$connection_marker" | tr -d '[:space:]')" == 6 ]] \
    || die 'legacy connection-drain marker schema is not exact'
  grep -E '^LEGACY_BACKEND_CONNECTION_CLEAN_SAMPLES=[1-9][0-9]*$' "$connection_marker" >/dev/null \
    || die 'legacy connection-drain sample count is invalid'
  grep -E '^LEGACY_BACKEND_CONNECTIONS_DRAINED_AT=[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z$' "$connection_marker" >/dev/null \
    || die 'legacy connection-drain timestamp is invalid'
  [[ "$(legacy_connection_count)" == 0 && "$(legacy_nginx_worker_count)" == 0 ]] \
    || die 'legacy connection/worker generation reappeared after accepted drain'
else
  connection_deadline=$((SECONDS + connection_drain_seconds))
  connection_clean=0
  while ((SECONDS < connection_deadline)); do
    connection_count="$(legacy_connection_count)" \
      || die 'bounded socket inventory failed; safe route retained and legacy units remain running'
    nginx_worker_count="$(legacy_nginx_worker_count)" \
      || die 'legacy nginx worker inventory failed; safe route retained and legacy units remain running'
    if [[ "$connection_count" == 0 && "$nginx_worker_count" == 0 ]]; then
      connection_clean=$((connection_clean + 1))
      ((connection_clean >= connection_clean_samples)) && break
    else
      connection_clean=0
    fi
    ((SECONDS < connection_deadline)) && sleep 1
  done
  ((connection_clean >= connection_clean_samples)) \
    || die 'legacy nginx/backend connections did not drain; safe route retained and legacy units remain running'
  {
    printf 'LEGACY_BACKEND_CONNECTIONS_DRAINED=true\n'
    printf 'LEGACY_BACKEND_PORTS=3000,4000\n'
    printf 'LEGACY_NGINX_WORKERS_DRAINED=true\n'
    printf 'LEGACY_NGINX_WORKER_SNAPSHOT_SHA256=%s\n' "$(sha256sum "$nginx_worker_snapshot" | awk '{ print $1 }')"
    printf 'LEGACY_BACKEND_CONNECTION_CLEAN_SAMPLES=%s\n' "$connection_clean"
    printf 'LEGACY_BACKEND_CONNECTIONS_DRAINED_AT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%S.%NZ)"
  } | atomic_from_stdin "$connection_marker"
fi
fault_checkpoint connections

fence_condition="ConditionPathExists=!${fence_marker}"
attest_start_fence_directory() {
  local directory="$1" expected_owner='root' expected_group='root' mount_inventory mount_target
  if [[ "$unprivileged_test_mode" == true ]]; then
    expected_owner="$(id -un)"
    expected_group="$(id -gn)"
  fi
  [[ -d "$directory" && ! -L "$directory" \
    && "$(realpath -e -- "$directory")" == "$directory" \
    && "$(stat -c '%U:%G:%a' -- "$directory")" == "${expected_owner}:${expected_group}:755" \
    && -z "$(find -P "$directory" -maxdepth 0 -perm /022 -print -quit)" ]] \
    || die "legacy start-fence drop-in directory authority is unsafe: ${directory}"
  if [[ "$unprivileged_test_mode" == true && -n "${TEST_ACTIVATION_MOUNT_INVENTORY_FILE:-}" ]]; then
    [[ -f "$TEST_ACTIVATION_MOUNT_INVENTORY_FILE" && ! -L "$TEST_ACTIVATION_MOUNT_INVENTORY_FILE" ]] \
      || die 'fixture legacy start-fence mount inventory is absent or symlinked'
    mount_inventory="$(<"$TEST_ACTIVATION_MOUNT_INVENTORY_FILE")" \
      || die 'fixture legacy start-fence mount inventory could not be read completely'
  elif [[ "$unprivileged_test_mode" == false ]]; then
    mount_inventory="$(findmnt --raw --noheadings --output TARGET)" \
      || die 'legacy start-fence mount inventory failed or returned partial output'
  else
    mount_inventory=''
  fi
  if [[ -n "$mount_inventory" ]]; then
    [[ ${#mount_inventory} -le 4194304 && "$mount_inventory" != *$'\r'* ]] \
      || die 'legacy start-fence mount inventory is oversized or noncanonical'
    while IFS= read -r mount_target; do
      [[ -n "$mount_target" ]] || continue
      case "$mount_target" in
        "$directory"|"$directory"/*)
          die "legacy start-fence directory contains an exact/nested mount: ${mount_target}"
          ;;
      esac
    done <<< "$mount_inventory"
  fi
}
if [[ ! -f "$dropins_marker" ]]; then
  for unit in "${drain_units[@]}"; do
    dropin_directory="${systemd_root}/${unit}.d"
    [[ ! -L "$dropin_directory" ]] || die "legacy unit drop-in directory is symlinked: ${unit}"
    if [[ ! -e "$dropin_directory" ]]; then
      mkdir -m 0755 -- "$dropin_directory" \
        || die "failed to create legacy unit drop-in directory: ${unit}"
    fi
    attest_start_fence_directory "$dropin_directory"
    dropin_path="${dropin_directory}/90-leetplus-nminus1-start-fence.conf"
    [[ ! -L "$dropin_path" ]] || die "legacy unit start-fence drop-in is symlinked: ${unit}"
    if [[ -e "$dropin_path" ]]; then
      [[ -f "$dropin_path" && ! -L "$dropin_path" \
        && "$(wc -l < "$dropin_path" | tr -d '[:space:]')" == 2 \
        && "$(sed -n '1p' "$dropin_path")" == '[Unit]' \
        && "$(sed -n '2p' "$dropin_path")" == "$fence_condition" ]] \
        || die "legacy unit start-fence drop-in residue is noncanonical: ${unit}"
      if [[ "$unprivileged_test_mode" == false ]]; then
        [[ "$(stat -c '%U:%G:%a:%h' -- "$dropin_path")" == 'root:root:644:1' ]] \
          || die "legacy unit start-fence drop-in residue identity is unsafe: ${unit}"
      fi
      sync -f "$dropin_path"
      sync -d "$dropin_directory"
      continue
    fi
    dropin_temporary="$(mktemp "${dropin_directory}/.leetplus-nminus1-start-fence.XXXXXX")"
    [[ -f "$dropin_temporary" && ! -L "$dropin_temporary" \
      && "$(dirname -- "$(realpath -e -- "$dropin_temporary")")" == "$dropin_directory" \
      && "$(stat -c '%h' -- "$dropin_temporary")" == 1 ]] \
      || die "legacy unit start-fence temporary is unsafe: ${unit}"
    printf '[Unit]\n%s\n' "$fence_condition" > "$dropin_temporary"
    chmod 0644 "$dropin_temporary"
    attest_start_fence_directory "$dropin_directory"
    if [[ "$unprivileged_test_mode" == false ]]; then
      [[ "$(stat -c '%U:%G:%a:%h' -- "$dropin_temporary")" == 'root:root:644:1' ]] \
        || die "legacy unit start-fence temporary identity drifted: ${unit}"
    fi
    mv -T "$dropin_temporary" "$dropin_path"
    sync -f "$dropin_path"
    sync -d "$dropin_directory"
    attest_start_fence_directory "$dropin_directory"
  done
  systemctl_bounded daemon-reload || die 'failed to load durable legacy start-fence drop-ins'
  {
    printf 'LEGACY_START_FENCE_DROPINS_LOADED=true\n'
    printf 'LEGACY_START_FENCE_CONDITION=%s\n' "$fence_condition"
  } | atomic_from_stdin "$dropins_marker"
fi
grep -F -x 'LEGACY_START_FENCE_DROPINS_LOADED=true' "$dropins_marker" >/dev/null \
  || die 'start-fence drop-in marker is malformed'
grep -F -x "LEGACY_START_FENCE_CONDITION=${fence_condition}" "$dropins_marker" >/dev/null \
  || die 'start-fence drop-in marker has a different condition'
[[ "$(wc -l < "$dropins_marker" | tr -d '[:space:]')" == 2 ]] || die 'start-fence drop-in marker schema is not exact'
for unit in "${drain_units[@]}"; do
  dropin_directory="${systemd_root}/${unit}.d"
  attest_start_fence_directory "$dropin_directory"
  dropin_path="${dropin_directory}/90-leetplus-nminus1-start-fence.conf"
  [[ -f "$dropin_path" && ! -L "$dropin_path" \
    && "$(stat -c '%U:%G:%a:%h' -- "$dropin_path")" == 'root:root:644:1' ]] \
    || { [[ "$unprivileged_test_mode" == true && -f "$dropin_path" && ! -L "$dropin_path" ]] \
      || die "legacy start-fence drop-in is absent or unsafe: ${unit}"; }
  [[ "$(wc -l < "$dropin_path" | tr -d '[:space:]')" == 2 \
    && "$(sed -n '1p' "$dropin_path")" == '[Unit]' \
    && "$(sed -n '2p' "$dropin_path")" == "$fence_condition" ]] \
    || die "legacy start-fence drop-in content is not exact: ${unit}"
done
fault_checkpoint dropins

database_fence_running="${database_fence_marker}.running.$$"
attest_operational_authority
if ! timeout --foreground --kill-after=5s 45s \
  "$database_fence" "${database_fence_arguments[@]}" > "$database_fence_running"; then
  rm -f -- "$database_fence_running"
  die 'legacy database login fence failed; safe route retained and legacy units remain running'
fi
mapfile -t database_fence_output < "$database_fence_running"
[[ ${#database_fence_output[@]} == 3 \
  && "${database_fence_output[0]}" == 'LEGACY_DATABASE_LOGIN_FENCE_ACCEPTED=true' \
  && "${database_fence_output[1]}" == 'LEGACY_DATABASE_LOGIN_ROLE=leetplus' \
  && "${database_fence_output[2]}" == 'LEGACY_DATABASE_LOGIN_FENCE_AUTHORITY=leetplus_fence_authority' \
  && "$(wc -l < "$database_fence_running" | tr -d '[:space:]')" == 3 ]] \
  || die 'database fence helper output schema is not exact'
chmod 0600 "$database_fence_running"
mv -T "$database_fence_running" "$database_fence_marker"
sync -f "$database_fence_marker"
sync -d "$state_root"
fault_checkpoint database-fence

if [[ ! -f "$fence_marker" ]]; then
  {
    printf 'LEGACY_START_FENCE_ACTIVE=true\n'
    printf 'LEGACY_ROLLBACK_SHA=%s\n' "$LEGACY_SHA"
  } | atomic_from_stdin "$fence_marker"
fi
grep -F -x 'LEGACY_START_FENCE_ACTIVE=true' "$fence_marker" >/dev/null \
  || die 'durable legacy start-fence marker is malformed'
grep -F -x "LEGACY_ROLLBACK_SHA=${LEGACY_SHA}" "$fence_marker" >/dev/null \
  || die 'durable legacy start-fence marker is bound to another release'
[[ "$(wc -l < "$fence_marker" | tr -d '[:space:]')" == 2 ]] || die 'durable legacy start-fence marker schema is not exact'
fault_checkpoint fence

# Irreversible start fence is durable now. Existing legacy processes are
# stopped only after all pre-route connections have cleanly drained.
stopped_units=0
for unit in "${drain_units[@]}"; do
  load_state="$(systemctl_bounded show --property=LoadState --value "$unit" 2>/dev/null || true)"
  [[ "$load_state" == 'not-found' || -z "$load_state" ]] && continue
  systemctl_bounded disable --now "$unit" || die "failed to stop/disable fenced legacy unit: ${unit}"
  stopped_units=$((stopped_units + 1))
  if ((stopped_units == 1)); then
    fault_checkpoint stop
  fi
done

if [[ ! -f "$drain_output_path" ]]; then
  attest_operational_authority
  drain_running="${drain_output_path}.running.$$"
  if ! timeout --foreground --kill-after=5s 330s \
    "$drain_verifier" "${drain_verifier_arguments[@]}" > "$drain_running"; then
    rm -f -- "$drain_running"
    die 'legacy runtime did not drain; scheduler-free pair remains publicly routed and migration is blocked'
  fi
  chmod 0600 "$drain_running"
  mv -T "$drain_running" "$drain_output_path"
  sync -f "$drain_output_path"
  sync -d "$state_root"
fi
grep -F -x 'LEGACY_RUNTIME_DRAIN_ACCEPTED=true' "$drain_output_path" >/dev/null \
  || die 'drain verifier returned without an accepted marker'
fault_checkpoint drain

{
  printf 'RECORD_VERSION=2\n'
  printf 'LEGACY_ROLLBACK_SHA=%s\n' "$LEGACY_SHA"
  printf 'DRAIN_ACCEPTED_AT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%S.%NZ)"
  printf 'ACTIVATION_INTENT_SHA256=%s\n' "$(sha256sum "$intent_path" | awk '{ print $1 }')"
  printf 'UNIT_MANIFEST_SHA256=%s\n' "$(sha256sum "$unit_manifest" | awk '{ print $1 }')"
  printf 'PUBLIC_ROUTE_MARKER_SHA256=%s\n' "$(sha256sum "$route_marker" | awk '{ print $1 }')"
  printf 'CONNECTION_DRAIN_MARKER_SHA256=%s\n' "$(sha256sum "$connection_marker" | awk '{ print $1 }')"
  printf 'NGINX_WORKER_SNAPSHOT_SHA256=%s\n' "$(sha256sum "$nginx_worker_snapshot" | awk '{ print $1 }')"
  printf 'START_FENCE_MARKER_SHA256=%s\n' "$(sha256sum "$fence_marker" | awk '{ print $1 }')"
  printf 'DATABASE_LOGIN_FENCE_MARKER_SHA256=%s\n' "$(sha256sum "$database_fence_marker" | awk '{ print $1 }')"
  printf 'DRAIN_VERIFIER_OUTPUT_SHA256=%s\n' "$(sha256sum "$drain_output_path" | awk '{ print $1 }')"
  cat "$drain_output_path"
} | atomic_from_stdin "$receipt_path"
fault_checkpoint receipt

timeout --foreground --kill-after=5s 330s \
  "$rollback_probe" --release-sha "$LEGACY_SHA" --require-drain "${rollback_probe_arguments[@]}" \
  || die 'post-receipt scheduler-free readiness re-verification failed'

rm -f -- "$restore_failure_marker"
sync -d "$state_root"

printf 'LEGACY_ROLLBACK_ACTIVATION_ACCEPTED=true\n'
printf 'LEGACY_ROLLBACK_ACTIVATION_SHA=%s\n' "$LEGACY_SHA"
printf 'LEGACY_ROLLBACK_ACTIVATION_RECEIPT=%s\n' "$receipt_path"
printf 'LEGACY_ROLLBACK_SAFE_API_URL=http://127.0.0.1:4300\n'
printf 'LEGACY_ROLLBACK_SAFE_WEB_URL=http://127.0.0.1:3300\n'
