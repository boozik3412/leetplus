#!/usr/bin/bash -p
#
# Atomic nginx blue/green switch with exact rollback and bounded watchdog.
# The script never stops the old runtime, migrates a database, edits an artifact
# or enables an outbound path.

[[ $- == *p* ]] || { printf 'blue-green-cutover: privileged Bash mode is required\n' >&2; exit 1; }
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
readonly MIGRATION_PATTERN='^[0-9]{14}_[a-z0-9_]+$'
readonly SLOT_PATTERN='^(blue|green)$'
readonly CUTOVER_RECORD_NAMESPACE_GLOB='[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T*-g*-*-*'
readonly FIRST_CUTOVER_ROLLBACK_SHA='7de04ff4ccc814494810730be3fa6bf661097b07'
readonly SLOT_API_UNIT_SHA256='d712c7635fd49efa76885624330815965a92dbfadeb3dba2891eaf45d4b66669'
readonly SLOT_WEB_UNIT_SHA256='8c47b412ed3b42bcbbb421a78939c232d82919ca0995d28c1c4140c8775ae81e'
readonly CANARY_SAFE_ENV_SHA256='dd87543ca654cf9ca1a94fae06d4f3e2f04c88e8ba0be84f45df2a7e03075d48'
readonly GUEST_USER_CALL_LIVE_ENV_SHA256='4254a9a8956b95dd937a2d35ec63cfe6cf278cfabef56b557401207677762685'
readonly SLOT_PREFLIGHT_SHA256='2b53884adef77a4e07e0e33ece78a70978dcea340f57692f0fc6198590fa5dd2'
readonly BLUE_NGINX_SHA256='3553e31012e1c00d695381c76ad4df184113c71c5a8b018bf5d934c2cea3fd8e'
readonly GREEN_NGINX_SHA256='a9e449bcd5f7d56be97f347455f7d0629f393d471cdf2b87029b4bede2d58462'
readonly LEGACY_SAFE_NGINX_SHA256='ebd449a4221dcb0c1d5449b4f87893bcad58b1f16319551730ca5aefde571b25'
readonly RELEASE_READINESS_SHA256='8955940a12dbbee7158315edf481902b60dce4e44b89e3f6f375aa2ff0bf928f'
readonly LEGACY_READINESS_SHA256='9ba94b6f162e3df1f002b0da316b0bf797e94704bbf73f3fdf119ed47bcebb42'
readonly AUTHENTICATED_READS_SHA256='da53c65c0dec67895c688d7a847e76a574025eff2e344d60cb206123cb492de2'

die() {
  printf 'blue-green-cutover: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage:
  blue-green-cutover.sh switch \
    --slot blue|green \
    --release-sha <40-lowercase-hex> \
    --expected-migration <migration-name> \
    --expected-migration-count <positive-integer> \
    --expected-web-build-id <same-40-lowercase-hex> \
    --loopback-api-url <url> --loopback-web-url <url> \
    --public-api-url <url> --public-web-url <url> \
    [--previous-release-sha <sha> --previous-migration <migration> \
     --previous-migration-count <count> --previous-web-build-id <sha>] \
    [--watchdog-seconds 30]

  blue-green-cutover.sh rollback --receipt <absolute-receipt-path>
  blue-green-cutover.sh recover-pending
  blue-green-cutover.sh recover-before-nginx

Production defaults:
  config root: /etc/nginx/leetplus
  state root:  /var/lib/leetplus/deploy-receipts
  probe:       /usr/local/libexec/leetplus/verify-release-readiness.sh
  auth probe:  /usr/local/libexec/leetplus/verify-legacy-rollback-authenticated-reads.mjs
  N-1 probe:   /usr/local/libexec/leetplus/verify-legacy-rollback-readiness.sh

Tests may override those paths plus --systemd-root, --environment-root and
--libexec-root, but only together with --unprivileged-test-mode while not root.
USAGE
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command is unavailable: $1"
}

atomic_link() {
  local target="$1"
  local active_link="$2"
  local temporary_link="${active_link}.next.$$"
  attest_durable_mount_boundaries || return 1
  rm -f -- "$temporary_link" || return 1
  ln -s -- "$target" "$temporary_link" || return 1
  mv -Tf -- "$temporary_link" "$active_link" || return 1
  if [[ "${unprivileged_test_mode:-false}" == true \
    && "${LEETPLUS_TEST_FAIL_PHASE:-}" == 'after-link-mv' \
    && ! -e "${state_root}/.fixture-after-link-mv-fired" ]]; then
    : > "${state_root}/.fixture-after-link-mv-fired" || return 1
    return 1
  fi
  sync -d "$(dirname -- "$active_link")" || return 1
  attest_durable_mount_boundaries || return 1
  [[ -L "$active_link" && "$(realpath -e -- "$active_link")" == "$target" ]] || return 1
}

nginx_test() {
  timeout 15 nginx -t
}

nginx_reload() {
  timeout 15 systemctl reload nginx.service
}

nginx_start() {
  timeout --foreground --kill-after=5s 30s systemctl start nginx.service
}

candidate_full_config_test() {
  if [[ "$unprivileged_test_mode" == true ]]; then
    # Behavioral fixtures use a command stub. Production below validates the
    # exact host nginx.conf in a private mount namespace with the candidate
    # include visible, before the boot-visible active link changes.
    nginx_test
    return
  fi

  local validation_root
  validation_root="$(mktemp -d /tmp/leetplus-nginx-validation.XXXXXX)"
  case "$validation_root" in /tmp/leetplus-nginx-validation.*) ;; *) die 'unsafe nginx validation directory' ;; esac
  cp -a -- "$config_root/." "$validation_root/"
  rm -f -- "$validation_root/active-upstreams.conf"
  ln -s -- "upstreams/$(basename -- "$slot_target")" "$validation_root/active-upstreams.conf"
  if ! timeout --foreground --kill-after=5s 20s \
    unshare --mount --propagation private /bin/sh -eu -c '
      mount --bind -- "$1" "$2"
      exec nginx -t
    ' leetplus-nginx-validation "$validation_root" "$config_root"; then
    rm -rf -- "$validation_root"
    die 'candidate full nginx configuration failed private-namespace validation'
  fi
  rm -rf -- "$validation_root"
}

unit_is_active() {
  timeout 10 systemctl is-active --quiet "$1"
}

unit_is_enabled() {
  timeout 10 systemctl is-enabled --quiet "$1"
}

run_probe_bounded() {
  local duration_seconds="$1" script="$2" environment_key
  local -a clean_environment
  shift 2
  [[ "$duration_seconds" =~ ^[1-9][0-9]*$ ]] || return 1
  if [[ "$unprivileged_test_mode" == true ]]; then
    clean_environment=("PATH=$PATH" 'LC_ALL=C' 'LANG=C' 'TZ=UTC')
    for environment_key in \
      TEST_COMMAND_LOG TEST_FAIL_PREVIOUS TEST_FAIL_PUBLIC TEST_FAIL_ROLLBACK_SMOKE \
      TEST_FAIL_PUBLIC_API TEST_FAIL_PUBLIC_WEB TEST_PROBE_DELAY_SECONDS; do
      if [[ -v "$environment_key" ]]; then
        clean_environment+=("${environment_key}=${!environment_key}")
      fi
    done
  else
    clean_environment=('PATH=/usr/sbin:/usr/bin:/sbin:/bin' 'LC_ALL=C' 'LANG=C' 'TZ=UTC')
  fi
  timeout --foreground --kill-after=5s "${duration_seconds}s" \
    /usr/bin/env -i "${clean_environment[@]}" /usr/bin/bash -p "$script" "$@"
}

run_authenticated_smoke_bounded() {
  local duration_seconds="$1" target_api_url="$2" environment_key
  local -a clean_environment arguments
  [[ "$duration_seconds" =~ ^[1-9][0-9]*$ ]] || return 1
  if [[ "$unprivileged_test_mode" == true ]]; then
    clean_environment=("PATH=$PATH" 'LC_ALL=C' 'LANG=C' 'TZ=UTC')
    for environment_key in TEST_COMMAND_LOG TEST_AUTH_SMOKE_FAIL TEST_AUTH_SMOKE_FAIL_PUBLIC \
      TEST_AUTH_DELAY_SECONDS; do
      if [[ -v "$environment_key" ]]; then clean_environment+=("${environment_key}=${!environment_key}"); fi
    done
    arguments=(--unprivileged-test-mode --base-url "$target_api_url")
  else
    clean_environment=('PATH=/usr/sbin:/usr/bin:/sbin:/bin' 'LC_ALL=C' 'LANG=C' 'TZ=UTC')
    arguments=(--base-url "$target_api_url")
  fi
  timeout --foreground --kill-after=5s "${duration_seconds}s" \
    /usr/bin/env -i "${clean_environment[@]}" /usr/bin/node "$authenticated_smoke" "${arguments[@]}"
}

unit_property() {
  local unit="$1" property="$2"
  [[ "${unit_property_snapshot_unit:-}" == "$unit" ]] || return 1
  awk -F= -v property="$property" '
    $1 == property {
      count += 1
      candidate = substr($0, length(property) + 2)
      value = (count == 1 ? candidate : value "\n" candidate)
    }
    END {
      if (property == "EnvironmentFiles" || property == "SocketBindAllow") {
        if (count < 1) exit 1
      } else if (count != 1) {
        exit 1
      }
      printf "%s", value
    }
  ' <<< "$unit_property_snapshot"
}

load_unit_property_snapshot() {
  local unit="$1" snapshot
  # Preserve empty properties in the atomic snapshot. Without --all, systemd
  # omits values such as an exact empty DropInPaths and makes them look absent.
  snapshot="$(timeout --foreground --kill-after=2s 5s \
    systemctl show --all --no-pager "$unit")" || return 1
  [[ -n "$snapshot" && ${#snapshot} -le 262144 && "$snapshot" != *$'\r'* ]] || return 1
  unit_property_snapshot_unit="$unit"
  unit_property_snapshot="$snapshot"
}

normalized_word_set() {
  tr ' ' '\n' | awk 'NF == 1 { print }' | LC_ALL=C sort | tr '\n' ' ' | awk '{$1=$1; print}'
}

systemd_localhost_ip_boundary_is_exact() {
  local ip_deny="$1" ip_allow="$2"
  # systemd 255 expands the admitted source aliases `any` and `localhost` in
  # effective properties. Accept only their complete IPv4/IPv6 CIDR sets.
  [[ "$(printf '%s' "$ip_deny" | normalized_word_set)" == '0.0.0.0/0 ::/0' \
    && "$(printf '%s' "$ip_allow" | normalized_word_set)" == '127.0.0.0/8 ::1/128' ]]
}

systemd_unrestricted_network_interfaces_is_exact() {
  local normalized
  normalized="$(printf '%s' "$1" | normalized_word_set)" || return 1
  # systemd 255 serializes an unrestricted RestrictNetworkInterfaces= reset as
  # a bare complement marker (`~`). Older releases returned an empty value.
  # Both are the same unrestricted policy; any named interface remains drift.
  [[ -z "$normalized" || "$normalized" == '~' ]]
}

runtime_secret_group_reverse_sets_are_exact() {
  local passwd_inventory="$1" group_inventory="$2"
  local shared_line api_line web_line shared_gid api_gid web_gid
  local shared_primary api_primary web_primary
  shared_line="$(awk -F: '$1 == "leetplus-runtime" { print }' <<< "$group_inventory")"
  api_line="$(awk -F: '$1 == "leetplus-api-runtime" { print }' <<< "$group_inventory")"
  web_line="$(awk -F: '$1 == "leetplus-web-runtime" { print }' <<< "$group_inventory")"
  [[ -n "$shared_line" && "$shared_line" != *$'\n'* \
    && -n "$api_line" && "$api_line" != *$'\n'* \
    && -n "$web_line" && "$web_line" != *$'\n'* ]] || return 1
  shared_gid="$(awk -F: '{ print $3 }' <<< "$shared_line")"
  api_gid="$(awk -F: '{ print $3 }' <<< "$api_line")"
  web_gid="$(awk -F: '{ print $3 }' <<< "$web_line")"
  [[ "$shared_gid" =~ ^[1-9][0-9]{1,8}$ && "$api_gid" =~ ^[1-9][0-9]{1,8}$ \
    && "$web_gid" =~ ^[1-9][0-9]{1,8}$ \
    && "$shared_gid" != "$api_gid" && "$shared_gid" != "$web_gid" && "$api_gid" != "$web_gid" ]] \
    || return 1
  shared_primary="$(awk -F: -v gid="$shared_gid" '$4 == gid { print $1 }' <<< "$passwd_inventory" \
    | LC_ALL=C sort | awk 'BEGIN { out="" } { out=(out == "" ? $0 : out "," $0) } END { print out }')" || return 1
  api_primary="$(awk -F: -v gid="$api_gid" '$4 == gid { print $1 }' <<< "$passwd_inventory" \
    | LC_ALL=C sort | awk 'BEGIN { out="" } { out=(out == "" ? $0 : out "," $0) } END { print out }')" || return 1
  web_primary="$(awk -F: -v gid="$web_gid" '$4 == gid { print $1 }' <<< "$passwd_inventory" \
    | LC_ALL=C sort | awk 'BEGIN { out="" } { out=(out == "" ? $0 : out "," $0) } END { print out }')" || return 1
  [[ "$shared_primary" == 'leetplus-api-blue,leetplus-api-green,leetplus-api-nminus1,leetplus-web-blue,leetplus-web-green,leetplus-web-nminus1' \
    && -z "$api_primary" && -z "$web_primary" ]]
}

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
  [[ "$before_identity" == "$after_identity" ]] || {
    [[ ! -d "$process_directory" ]] && return 1
    return 2
  }
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

environment_file_paths() {
  tr ' ' '\n' | awk '
    {
      sub(/^\{/, "")
      sub(/^path=/, "")
      gsub(/[;}]+$/, "")
      if ($0 ~ /^\//) print
    }
  '
}

trusted_installed_file() {
  local path="$1" digest="$2" production_group="$3" mode="$4" expected_identity
  [[ -f "$path" && ! -L "$path" && "$(realpath -e -- "$path")" == "$path" ]] || return 1
  if [[ "$unprivileged_test_mode" == true ]]; then
    expected_identity="$(id -un):$(id -gn):${mode}:1"
  else
    expected_identity="root:${production_group}:${mode}:1"
  fi
  [[ "$(stat -c '%U:%G:%a:%h' -- "$path")" == "$expected_identity" \
    && "$(sha256sum "$path" | awk '{ print $1 }')" == "$digest" ]]
}

candidate_unit_failure() {
  printf 'blue-green-cutover: candidate unit attestation failed: %s\n' "$*" >&2
  return 1
}

attest_candidate_unit() {
  local runtime_kind="$1" phase="$2" unit fragment fragment_digest expected_user working_directory
  local expected_exec_path expected_exec_argv expected_environment_paths expected_read_write_paths
  local active_state sub_state unit_file_state need_daemon_reload user group fragment_path drop_in_paths working_directory_value
  local exec_start environment_files environment unset_environment no_new_privileges private_tmp private_devices protect_system protect_home
  local protect_proc proc_subset protect_kernel_tunables protect_kernel_modules protect_kernel_logs
  local protect_control_groups protect_clock protect_hostname lock_personality restrict_suid_sgid remove_ipc
  local syscall_architectures address_families network_interfaces ip_deny ip_allow read_only_paths read_write_paths
  local capability_bounding ambient_capabilities main_pid invocation_id control_group process_cgroup
  local unit_umask
  local runtime_environment slot_environment safe_environment user_call_live_environment runtime_group runtime_mode expected_listener_port
  local listener_snapshot listener_count listener_address expected_nss_groups actual_nss_groups passwd_entry
  local passwd_inventory group_inventory runtime_group_line runtime_group_name runtime_group_password runtime_gid runtime_group_members
  local supplementary_line supplementary_name supplementary_password supplementary_gid supplementary_members expected_supplementary_members
  local name password uid gid gecos home shell cgroup_path cgroup_pid_inventory cgroup_pid allowed_pids=' ' status_file foreign_pid status_result

  case "$runtime_kind" in
    api)
      unit="leetplus-api@${slot}.service"
      fragment="${systemd_root}/leetplus-api@.service"
      fragment_digest="$SLOT_API_UNIT_SHA256"
      expected_user="leetplus-api-${slot}"
      working_directory="/srv/leetplus/slots/${slot}"
      expected_exec_path='/usr/bin/node'
      expected_exec_argv="/usr/bin/node /srv/leetplus/slots/${slot}/apps/api/dist/main.js"
      runtime_environment="${environment_root}/runtime.env"
      runtime_group='leetplus-api-runtime'
      runtime_mode='640'
      expected_read_write_paths='/var/lib/leetplus/langame-sync'
      expected_nss_groups='leetplus-api-runtime leetplus-runtime'
      if [[ "$slot" == blue ]]; then expected_listener_port=4100; else expected_listener_port=4200; fi
      ;;
    web)
      unit="leetplus-web@${slot}.service"
      fragment="${systemd_root}/leetplus-web@.service"
      fragment_digest="$SLOT_WEB_UNIT_SHA256"
      expected_user="leetplus-web-${slot}"
      working_directory="/srv/leetplus/slots/${slot}/apps/web"
      expected_exec_path='/usr/bin/node'
      if [[ "$slot" == blue ]]; then expected_listener_port=3100; else expected_listener_port=3200; fi
      expected_exec_argv="/usr/bin/node /srv/leetplus/slots/${slot}/apps/web/node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port \${WEB_PORT}"
      runtime_environment="${environment_root}/web-runtime.env"
      runtime_group='leetplus-web-runtime'
      runtime_mode='640'
      expected_read_write_paths="/var/cache/leetplus-web-${slot}"
      expected_nss_groups='leetplus-runtime leetplus-web-runtime'
      ;;
    *) candidate_unit_failure 'unknown runtime kind'; return ;;
  esac
  slot_environment="${environment_root}/slots/${slot}.env"
  safe_environment="${environment_root}/canary-safe.env"
  expected_environment_paths="${runtime_environment}"$'\n'"${slot_environment}"$'\n'"${safe_environment}"
  if [[ "$runtime_kind" == api ]]; then
    user_call_live_environment="${environment_root}/guest-user-call-live.env"
    expected_environment_paths+=$'\n'"${user_call_live_environment}"
  fi

  load_unit_property_snapshot "$unit" \
    || { candidate_unit_failure "${unit} effective property snapshot"; return; }

  trusted_installed_file "$fragment" "$fragment_digest" root 444 \
    || { candidate_unit_failure "${unit} fragment byte/identity"; return; }
  trusted_installed_file "$safe_environment" "$CANARY_SAFE_ENV_SHA256" leetplus-runtime 440 \
    || { candidate_unit_failure "${unit} final safety overlay byte/identity"; return; }
  if [[ "$runtime_kind" == api ]]; then
    trusted_installed_file "$user_call_live_environment" "$GUEST_USER_CALL_LIVE_ENV_SHA256" root 400 \
      || { candidate_unit_failure "${unit} USER_CALL activation profile byte/identity"; return; }
  fi
  trusted_installed_file "${libexec_root}/preflight-release-slot.sh" "$SLOT_PREFLIGHT_SHA256" root 555 \
    || { candidate_unit_failure "${unit} slot preflight byte/identity"; return; }
  [[ -f "$runtime_environment" && ! -L "$runtime_environment" \
    && "$(realpath -e -- "$runtime_environment")" == "$runtime_environment" ]] \
    || { candidate_unit_failure "${unit} runtime environment path"; return; }
  [[ -f "$slot_environment" && ! -L "$slot_environment" \
    && "$(realpath -e -- "$slot_environment")" == "$slot_environment" ]] \
    || { candidate_unit_failure "${unit} slot environment path"; return; }
  if [[ "$unprivileged_test_mode" == false ]]; then
    [[ "$(stat -c '%U:%G:%a:%h' -- "$runtime_environment")" == "root:${runtime_group}:${runtime_mode}:1" \
      && "$(stat -c '%U:%G:%a:%h' -- "$slot_environment")" == 'root:leetplus-runtime:440:1' ]] \
      || { candidate_unit_failure "${unit} environment identity"; return; }
  fi

  active_state="$(unit_property "$unit" ActiveState)" || { candidate_unit_failure "${unit} ActiveState read"; return; }
  sub_state="$(unit_property "$unit" SubState)" || { candidate_unit_failure "${unit} SubState read"; return; }
  unit_file_state="$(unit_property "$unit" UnitFileState)" || { candidate_unit_failure "${unit} UnitFileState read"; return; }
  need_daemon_reload="$(unit_property "$unit" NeedDaemonReload)" || { candidate_unit_failure "${unit} NeedDaemonReload read"; return; }
  user="$(unit_property "$unit" User)" || { candidate_unit_failure "${unit} User read"; return; }
  group="$(unit_property "$unit" Group)" || { candidate_unit_failure "${unit} Group read"; return; }
  fragment_path="$(unit_property "$unit" FragmentPath)" || { candidate_unit_failure "${unit} FragmentPath read"; return; }
  drop_in_paths="$(unit_property "$unit" DropInPaths)" || { candidate_unit_failure "${unit} DropInPaths read"; return; }
  working_directory_value="$(unit_property "$unit" WorkingDirectory)" || { candidate_unit_failure "${unit} WorkingDirectory read"; return; }
  exec_start="$(unit_property "$unit" ExecStart)" || { candidate_unit_failure "${unit} ExecStart read"; return; }
  environment_files="$(unit_property "$unit" EnvironmentFiles)" || { candidate_unit_failure "${unit} EnvironmentFiles read"; return; }
  environment="$(unit_property "$unit" Environment)" || { candidate_unit_failure "${unit} Environment read"; return; }
  unset_environment="$(unit_property "$unit" UnsetEnvironment)" || { candidate_unit_failure "${unit} UnsetEnvironment read"; return; }
  no_new_privileges="$(unit_property "$unit" NoNewPrivileges)" || { candidate_unit_failure "${unit} NoNewPrivileges read"; return; }
  private_tmp="$(unit_property "$unit" PrivateTmp)" || { candidate_unit_failure "${unit} PrivateTmp read"; return; }
  private_devices="$(unit_property "$unit" PrivateDevices)" || { candidate_unit_failure "${unit} PrivateDevices read"; return; }
  protect_system="$(unit_property "$unit" ProtectSystem)" || { candidate_unit_failure "${unit} ProtectSystem read"; return; }
  protect_home="$(unit_property "$unit" ProtectHome)" || { candidate_unit_failure "${unit} ProtectHome read"; return; }
  protect_proc="$(unit_property "$unit" ProtectProc)" || { candidate_unit_failure "${unit} ProtectProc read"; return; }
  proc_subset="$(unit_property "$unit" ProcSubset)" || { candidate_unit_failure "${unit} ProcSubset read"; return; }
  protect_kernel_tunables="$(unit_property "$unit" ProtectKernelTunables)" || { candidate_unit_failure "${unit} ProtectKernelTunables read"; return; }
  protect_kernel_modules="$(unit_property "$unit" ProtectKernelModules)" || { candidate_unit_failure "${unit} ProtectKernelModules read"; return; }
  protect_kernel_logs="$(unit_property "$unit" ProtectKernelLogs)" || { candidate_unit_failure "${unit} ProtectKernelLogs read"; return; }
  protect_control_groups="$(unit_property "$unit" ProtectControlGroups)" || { candidate_unit_failure "${unit} ProtectControlGroups read"; return; }
  protect_clock="$(unit_property "$unit" ProtectClock)" || { candidate_unit_failure "${unit} ProtectClock read"; return; }
  protect_hostname="$(unit_property "$unit" ProtectHostname)" || { candidate_unit_failure "${unit} ProtectHostname read"; return; }
  lock_personality="$(unit_property "$unit" LockPersonality)" || { candidate_unit_failure "${unit} LockPersonality read"; return; }
  restrict_suid_sgid="$(unit_property "$unit" RestrictSUIDSGID)" || { candidate_unit_failure "${unit} RestrictSUIDSGID read"; return; }
  remove_ipc="$(unit_property "$unit" RemoveIPC)" || { candidate_unit_failure "${unit} RemoveIPC read"; return; }
  syscall_architectures="$(unit_property "$unit" SystemCallArchitectures)" || { candidate_unit_failure "${unit} SystemCallArchitectures read"; return; }
  address_families="$(unit_property "$unit" RestrictAddressFamilies)" || { candidate_unit_failure "${unit} RestrictAddressFamilies read"; return; }
  network_interfaces="$(unit_property "$unit" RestrictNetworkInterfaces)" || { candidate_unit_failure "${unit} RestrictNetworkInterfaces read"; return; }
  ip_deny="$(unit_property "$unit" IPAddressDeny)" || { candidate_unit_failure "${unit} IPAddressDeny read"; return; }
  ip_allow="$(unit_property "$unit" IPAddressAllow)" || { candidate_unit_failure "${unit} IPAddressAllow read"; return; }
  read_only_paths="$(unit_property "$unit" ReadOnlyPaths)" || { candidate_unit_failure "${unit} ReadOnlyPaths read"; return; }
  read_write_paths="$(unit_property "$unit" ReadWritePaths)" || { candidate_unit_failure "${unit} ReadWritePaths read"; return; }
  capability_bounding="$(unit_property "$unit" CapabilityBoundingSet)" || { candidate_unit_failure "${unit} CapabilityBoundingSet read"; return; }
  ambient_capabilities="$(unit_property "$unit" AmbientCapabilities)" || { candidate_unit_failure "${unit} AmbientCapabilities read"; return; }
  unit_umask="$(unit_property "$unit" UMask)" || { candidate_unit_failure "${unit} UMask read"; return; }
  main_pid="$(unit_property "$unit" MainPID)" || { candidate_unit_failure "${unit} MainPID read"; return; }
  invocation_id="$(unit_property "$unit" InvocationID)" || { candidate_unit_failure "${unit} InvocationID read"; return; }
  control_group="$(unit_property "$unit" ControlGroup)" || { candidate_unit_failure "${unit} ControlGroup read"; return; }

  [[ "$active_state" == active && "$sub_state" == running && "$unit_file_state" == enabled \
    && "$need_daemon_reload" == no \
    && "$user" == "$expected_user" && "$group" == leetplus-runtime \
    && "$fragment_path" == "$fragment" && -z "$drop_in_paths" \
    && "$working_directory_value" == "$working_directory" ]] \
    || { candidate_unit_failure "${unit} identity/state/fragment"; return; }
  [[ "$exec_start" == *"path=${expected_exec_path} ; argv[]=${expected_exec_argv} ;"* \
    && "$exec_start" != *'} {'* ]] \
    || { candidate_unit_failure "${unit} effective ExecStart"; return; }
  [[ "$environment_files" != *'ignore_errors=yes'* \
    && "$(printf '%s' "$environment_files" | environment_file_paths)" == "$expected_environment_paths" ]] \
    || { candidate_unit_failure "${unit} effective EnvironmentFiles"; return; }
  [[ "$environment" == 'PATH=/usr/sbin:/usr/bin:/sbin:/bin' ]] \
    || { candidate_unit_failure "${unit} effective safe PATH"; return; }
  [[ "$(printf '%s' "$unset_environment" | normalized_word_set)" \
      == 'ALL_PROXY BASH_ENV COREPACK_HOME COREPACK_INTEGRITY_KEYS COREPACK_NPM_REGISTRY CURL_CA_BUNDLE CURL_HOME ENV GCONV_PATH GIT_CONFIG_GLOBAL GIT_CONFIG_NOSYSTEM GIT_CONFIG_SYSTEM GLIBC_TUNABLES HTTPS_PROXY HTTP_PROXY LD_AUDIT LD_LIBRARY_PATH LD_PRELOAD LOCPATH MALLOC_CHECK_ MALLOC_PERTURB_ NODE_COMPILE_CACHE NODE_DEBUG NODE_EXTRA_CA_CERTS NODE_OPTIONS NODE_PATH NODE_USE_ENV_PROXY NODE_V8_COVERAGE NO_PROXY NPM_CONFIG_USERCONFIG OPENSSL_CONF OPENSSL_MODULES PNPM_HOME PRISMA_FMT_BINARY PRISMA_QUERY_ENGINE_BINARY PRISMA_QUERY_ENGINE_LIBRARY PRISMA_SCHEMA_ENGINE_BINARY SSLKEYLOGFILE SSL_CERT_DIR SSL_CERT_FILE TEMP TMP TMPDIR XDG_CACHE_HOME XDG_CONFIG_HOME XDG_DATA_HOME all_proxy http_proxy https_proxy no_proxy npm_config_userconfig' ]] \
    || { candidate_unit_failure "${unit} effective proxy/Node environment removal"; return; }
  [[ "$no_new_privileges" == yes && "$private_tmp" == yes && "$private_devices" == yes \
    && "$protect_system" == strict && "$protect_home" == yes && "$protect_proc" == invisible \
    && "$proc_subset" == pid && "$protect_kernel_tunables" == yes && "$protect_kernel_modules" == yes \
    && "$protect_kernel_logs" == yes && "$protect_control_groups" == yes && "$protect_clock" == yes \
    && "$protect_hostname" == yes && "$lock_personality" == yes && "$restrict_suid_sgid" == yes \
    && "$remove_ipc" == yes && "$syscall_architectures" == native && "$unit_umask" == 0027 \
    && -z "$capability_bounding" && -z "$ambient_capabilities" ]] \
    || { candidate_unit_failure "${unit} effective sandbox/capability boundary"; return; }
  if ! [[ "$(printf '%s' "$address_families" | normalized_word_set)" == 'AF_INET AF_INET6 AF_NETLINK' \
      && "$(printf '%s' "$read_only_paths" | normalized_word_set)" == '/srv/leetplus/releases /srv/leetplus/slots' \
      && "$(printf '%s' "$read_write_paths" | normalized_word_set)" == "$(printf '%s' "$expected_read_write_paths" | normalized_word_set)" ]]; then
    candidate_unit_failure "${unit} effective network/path sandbox"
    return
  fi
  if [[ "$runtime_kind" == api ]]; then
    systemd_unrestricted_network_interfaces_is_exact "$network_interfaces" \
      && [[ -z "$(printf '%s' "$ip_deny" | normalized_word_set)" \
        && -z "$(printf '%s' "$ip_allow" | normalized_word_set)" ]] \
      || { candidate_unit_failure "${unit} reviewed integration egress profile"; return; }
  else
    [[ "$(printf '%s' "$network_interfaces" | normalized_word_set)" == lo ]] \
      && systemd_localhost_ip_boundary_is_exact "$ip_deny" "$ip_allow" \
      || { candidate_unit_failure "${unit} localhost-only egress profile"; return; }
  fi
  [[ "$main_pid" =~ ^[1-9][0-9]*$ && "$invocation_id" =~ ^[0-9a-f]{32}$ \
    && "$invocation_id" != 00000000000000000000000000000000 && "$control_group" == /* \
    && -r "/proc/${main_pid}/cgroup" ]] \
    || { candidate_unit_failure "${unit} live process identity"; return; }
  process_cgroup="$(awk -F: -v expected="$control_group" '$3 == expected { print $3; exit }' "/proc/${main_pid}/cgroup")"
  [[ "$process_cgroup" == "$control_group" ]] \
    || { candidate_unit_failure "${unit} MainPID cgroup binding"; return; }
  listener_snapshot="$(timeout --foreground --kill-after=2s 5s \
    ss -H -ltnp "sport = :${expected_listener_port}")" \
    || { candidate_unit_failure "${unit} listener inventory"; return; }
  listener_count="$(awk 'END { print NR + 0 }' <<< "$listener_snapshot")"
  listener_address="$(awk 'NR == 1 { print $4 }' <<< "$listener_snapshot")"
  [[ "$listener_count" == 1 && "$listener_address" == "127.0.0.1:${expected_listener_port}" \
    && "$listener_snapshot" == *"pid=${main_pid},"* ]] \
    || { candidate_unit_failure "${unit} MainPID/listener binding"; return; }

  if [[ "$unprivileged_test_mode" == true ]]; then
    [[ "${TEST_CANDIDATE_NSS_DUPLICATE_UID:-false}" != true ]] \
      || { candidate_unit_failure "${unit} duplicate NSS UID alias"; return; }
    [[ "${TEST_CANDIDATE_NSS_DUPLICATE_GID:-false}" != true ]] \
      || { candidate_unit_failure "${unit} duplicate NSS GID alias"; return; }
    [[ "${TEST_CANDIDATE_FOREIGN_UID_PROCESS:-false}" != true ]] \
      || { candidate_unit_failure "${unit} foreign same-UID process"; return; }
    [[ "${TEST_CANDIDATE_FOREIGN_PRIMARY_GID:-false}" != true ]] \
      || { candidate_unit_failure "${unit} foreign runtime secret-group primary GID"; return; }
    actual_nss_groups="${TEST_CANDIDATE_NSS_GROUPS:-$expected_nss_groups}"
  else
    passwd_inventory="$(timeout --foreground --kill-after=2s 10s getent passwd)" \
      || { candidate_unit_failure "${unit} complete passwd inventory"; return; }
    group_inventory="$(timeout --foreground --kill-after=2s 10s getent group)" \
      || { candidate_unit_failure "${unit} complete group inventory"; return; }
    [[ -n "$passwd_inventory" && -n "$group_inventory" \
      && ${#passwd_inventory} -le 1048576 && ${#group_inventory} -le 1048576 \
      && "$passwd_inventory" != *$'\r'* && "$group_inventory" != *$'\r'* ]] \
      || { candidate_unit_failure "${unit} canonical bounded NSS inventory"; return; }
    runtime_secret_group_reverse_sets_are_exact "$passwd_inventory" "$group_inventory" \
      || { candidate_unit_failure "${unit} runtime secret-group reverse primary-GID set"; return; }
    runtime_group_line="$(awk -F: '$1 == "leetplus-runtime" { print }' <<< "$group_inventory")"
    [[ -n "$runtime_group_line" && "$runtime_group_line" != *$'\n'* ]] \
      || { candidate_unit_failure "${unit} runtime group name uniqueness"; return; }
    IFS=: read -r runtime_group_name runtime_group_password runtime_gid runtime_group_members <<< "$runtime_group_line"
    [[ "$runtime_group_name" == leetplus-runtime && "$runtime_group_password" == x \
      && "$runtime_gid" =~ ^[1-9][0-9]{1,8}$ && -z "$runtime_group_members" \
      && "$(awk -F: -v gid="$runtime_gid" '$3 == gid { count += 1 } END { print count + 0 }' <<< "$group_inventory")" == 1 ]] \
      || { candidate_unit_failure "${unit} runtime group GID/member uniqueness"; return; }
    passwd_entry="$(awk -F: -v identity="$expected_user" '$1 == identity { print }' <<< "$passwd_inventory")"
    [[ -n "$passwd_entry" && "$passwd_entry" != *$'\n'* ]] \
      || { candidate_unit_failure "${unit} NSS user name uniqueness"; return; }
    IFS=: read -r name password uid gid gecos home shell <<< "$passwd_entry"
    [[ "$name" == "$expected_user" && "$password" == x && "$uid" =~ ^[1-9][0-9]{1,8}$ \
      && "$gid" == "$runtime_gid" && -z "$gecos" && "$home" == /nonexistent \
      && "$shell" == /usr/sbin/nologin && ! -e "$home" && ! -L "$home" \
      && "$(awk -F: -v uid="$uid" '$3 == uid { print }' <<< "$passwd_inventory")" == "$passwd_entry" ]] \
      || { candidate_unit_failure "${unit} NSS passwd/UID/no-home identity"; return; }
    supplementary_line="$(awk -F: -v group="$runtime_group" '$1 == group { print }' <<< "$group_inventory")"
    [[ -n "$supplementary_line" && "$supplementary_line" != *$'\n'* ]] \
      || { candidate_unit_failure "${unit} supplementary group name uniqueness"; return; }
    IFS=: read -r supplementary_name supplementary_password supplementary_gid supplementary_members <<< "$supplementary_line"
    if [[ "$runtime_kind" == api ]]; then
      expected_supplementary_members='leetplus-api-blue,leetplus-api-green,leetplus-api-nminus1'
    else
      expected_supplementary_members='leetplus-web-blue,leetplus-web-green,leetplus-web-nminus1'
    fi
    [[ "$supplementary_name" == "$runtime_group" && "$supplementary_password" == x \
      && "$supplementary_gid" =~ ^[1-9][0-9]{1,8}$ \
      && "$(tr ',' '\n' <<< "$supplementary_members" | LC_ALL=C sort | tr '\n' ',' | sed 's/,$//')" == "$expected_supplementary_members" \
      && "$(awk -F: -v gid="$supplementary_gid" '$3 == gid { count += 1 } END { print count + 0 }' <<< "$group_inventory")" == 1 ]] \
      || { candidate_unit_failure "${unit} supplementary group GID/member identity"; return; }
    actual_nss_groups="$(id -nG "$expected_user" | tr ' ' '\n' | LC_ALL=C sort | tr '\n' ' ' | awk '{$1=$1; print}')" \
      || { candidate_unit_failure "${unit} NSS group inventory"; return; }

    [[ "$control_group" == "/system.slice/${unit}" \
      && "$(realpath -e -- "/proc/${main_pid}/cwd")" == "$(realpath -e -- "$working_directory")" ]] \
      || { candidate_unit_failure "${unit} exact cgroup/cwd identity"; return; }
    cgroup_path="/sys/fs/cgroup${control_group}"
    [[ -d "$cgroup_path" && ! -L "$cgroup_path" ]] \
      || { candidate_unit_failure "${unit} cgroup path"; return; }
    cgroup_pid_inventory="$(timeout --foreground --kill-after=2s 10s \
      find "$cgroup_path" -type f -name cgroup.procs -exec awk 'NF { print }' {} \;)" \
      || { candidate_unit_failure "${unit} complete cgroup PID inventory"; return; }
    while IFS= read -r cgroup_pid; do
      [[ -z "$cgroup_pid" ]] && continue
      [[ "$cgroup_pid" =~ ^[1-9][0-9]*$ ]] \
        || { candidate_unit_failure "${unit} malformed cgroup PID"; return; }
      allowed_pids+="${cgroup_pid} "
    done <<< "$cgroup_pid_inventory"
    [[ "$allowed_pids" == *" ${main_pid} "* ]] \
      || { candidate_unit_failure "${unit} MainPID absent from cgroup inventory"; return; }
    for status_file in /proc/[0-9]*/status; do
      if stable_process_status_has_uid "$status_file" "$uid"; then
        foreign_pid="${status_file#/proc/}"; foreign_pid="${foreign_pid%/status}"
        [[ "$allowed_pids" == *" ${foreign_pid} "* ]] \
          || { candidate_unit_failure "${unit} foreign same-UID process ${foreign_pid}"; return; }
      else
        status_result=$?
        [[ "$status_result" == 1 ]] \
          || { candidate_unit_failure "${unit} stable complete UID process inventory"; return; }
      fi
    done
  fi
  [[ "$actual_nss_groups" == "$expected_nss_groups" ]] \
    || { candidate_unit_failure "${unit} exact NSS groups"; return; }

  if [[ "$phase" == previous ]]; then
    :
  elif [[ "$phase" == pre ]]; then
    if [[ "$runtime_kind" == api ]]; then
      candidate_api_main_pid="$main_pid"
      candidate_api_invocation_id="$invocation_id"
    else
      candidate_web_main_pid="$main_pid"
      candidate_web_invocation_id="$invocation_id"
    fi
  elif [[ "$runtime_kind" == api ]]; then
    [[ "$main_pid" == "$candidate_api_main_pid" && "$invocation_id" == "$candidate_api_invocation_id" ]] \
      || { candidate_unit_failure "${unit} restarted during watchdog"; return; }
  else
    [[ "$main_pid" == "$candidate_web_main_pid" && "$invocation_id" == "$candidate_web_invocation_id" ]] \
      || { candidate_unit_failure "${unit} restarted during watchdog"; return; }
  fi
}

attest_candidate_units() {
  local phase="$1"
  attest_candidate_unit api "$phase" && attest_candidate_unit web "$phase"
}

http_exact_2xx() {
  local url="$1"
  local status

  status="$(timeout 20 curl --disable --noproxy '*' --proto '=http,https' --proto-redir '=http,https' \
    --silent --show-error --connect-timeout 3 --max-time 10 --max-redirs 0 --max-filesize 1048576 \
    --output /dev/null --write-out '%{http_code}' "$url")" || return 1
  [[ "$status" =~ ^2[0-9][0-9]$ ]]
}

rollback_public_smoke() {
  if http_exact_2xx 'https://api.leetplus.ru/health' \
    && http_exact_2xx 'https://leetplus.ru/'; then
    printf 'BLUE_GREEN_ROLLBACK_SERVING_CONFIRMED=true\n'
    return 0
  fi
  printf 'BLUE_GREEN_ROLLBACK_SERVING_CONFIRMED=false\n' >&2
  return 1
}

set_previous_runtime_contract() {
  local target_basename
  target_basename="$(basename -- "$previous_target")"

  case "$target_basename" in
    legacy-safe.conf)
      previous_runtime_kind='LEGACY_SAFE'
      previous_slot='legacy-safe'
      previous_api_unit="leetplus-api-rollback@${FIRST_CUTOVER_ROLLBACK_SHA}.service"
      previous_web_unit="leetplus-web-rollback@${FIRST_CUTOVER_ROLLBACK_SHA}.service"
      previous_api_url='http://127.0.0.1:4300'
      previous_web_url='http://127.0.0.1:3300'
      previous_release_sha="$FIRST_CUTOVER_ROLLBACK_SHA"
      previous_migration='SCHEMA_COMPATIBILITY_REHEARSED'
      previous_migration_count='0'
      previous_web_build_id="$FIRST_CUTOVER_ROLLBACK_SHA"
      ;;
    legacy.conf)
      die 'scheduler-capable legacy.conf is forbidden as a blue/green rollback target; activate legacy-safe.conf first'
      ;;
    blue.conf|green.conf)
      previous_runtime_kind='SLOT'
      previous_slot="${target_basename%.conf}"
      previous_api_unit="leetplus-api@${previous_slot}.service"
      previous_web_unit="leetplus-web@${previous_slot}.service"
      if [[ "$previous_slot" == 'blue' ]]; then
        previous_api_url='http://127.0.0.1:4100'
        previous_web_url='http://127.0.0.1:3100'
      else
        previous_api_url='http://127.0.0.1:4200'
        previous_web_url='http://127.0.0.1:3200'
      fi
      [[ "$previous_release_sha" =~ $RELEASE_SHA_PATTERN ]] || die 'previous slot release SHA is required and invalid'
      [[ "$previous_migration" =~ $MIGRATION_PATTERN ]] || die 'previous slot migration is required and invalid'
      [[ "$previous_migration_count" =~ ^[1-9][0-9]*$ ]] || die 'previous slot migration count is required and invalid'
      [[ "$previous_web_build_id" == "$previous_release_sha" ]] || die 'previous slot Web BUILD_ID must equal its exact release SHA'
      ;;
    *)
      die 'previous upstream target is not a reviewed scheduler-free/blue/green target'
      ;;
  esac
}

validate_recorded_previous_runtime_contract() {
  local expected_kind expected_slot expected_api_unit expected_web_unit expected_api_url expected_web_url
  case "$(basename -- "$previous_target")" in
    legacy-safe.conf)
      expected_kind='LEGACY_SAFE'
      expected_slot='legacy-safe'
      expected_api_unit="leetplus-api-rollback@${FIRST_CUTOVER_ROLLBACK_SHA}.service"
      expected_web_unit="leetplus-web-rollback@${FIRST_CUTOVER_ROLLBACK_SHA}.service"
      expected_api_url='http://127.0.0.1:4300'
      expected_web_url='http://127.0.0.1:3300'
      [[ "$previous_release_sha" == "$FIRST_CUTOVER_ROLLBACK_SHA" \
        && "$previous_migration" == 'SCHEMA_COMPATIBILITY_REHEARSED' \
        && "$previous_migration_count" == '0' \
        && "$previous_web_build_id" == "$FIRST_CUTOVER_ROLLBACK_SHA" ]] \
        || die 'scheduler-free rollback receipt contains forged release identity'
      ;;
    legacy.conf)
      die 'scheduler-capable legacy rollback receipts are no longer admitted'
      ;;
    blue.conf|green.conf)
      expected_kind='SLOT'
      expected_slot="$(basename -- "$previous_target" .conf)"
      expected_api_unit="leetplus-api@${expected_slot}.service"
      expected_web_unit="leetplus-web@${expected_slot}.service"
      if [[ "$expected_slot" == 'blue' ]]; then
        expected_api_url='http://127.0.0.1:4100'
        expected_web_url='http://127.0.0.1:3100'
      else
        expected_api_url='http://127.0.0.1:4200'
        expected_web_url='http://127.0.0.1:3200'
      fi
      [[ "$previous_release_sha" =~ $RELEASE_SHA_PATTERN ]] || die 'rollback receipt previous release SHA is invalid'
      [[ "$previous_migration" =~ $MIGRATION_PATTERN ]] || die 'rollback receipt previous migration is invalid'
      [[ "$previous_migration_count" =~ ^[1-9][0-9]*$ ]] || die 'rollback receipt previous migration count is invalid'
      [[ "$previous_web_build_id" == "$previous_release_sha" ]] || die 'rollback receipt previous Web identity is invalid'
      ;;
    *) die 'rollback receipt previous target is not a reviewed runtime' ;;
  esac

  [[ "$previous_runtime_kind" == "$expected_kind" \
    && "$previous_slot" == "$expected_slot" \
    && "$previous_api_unit" == "$expected_api_unit" \
    && "$previous_web_unit" == "$expected_web_unit" \
    && "$previous_api_url" == "$expected_api_url" \
    && "$previous_web_url" == "$expected_web_url" ]] \
    || die 'rollback receipt previous runtime routing contract is forged'
}

verify_previous_runtime() {
  local candidate_slot
  unit_is_enabled "$previous_api_unit" || {
    printf 'blue-green-cutover: previous API unit is not boot-enabled: %s\n' "$previous_api_unit" >&2
    return 1
  }
  unit_is_enabled "$previous_web_unit" || {
    printf 'blue-green-cutover: previous Web unit is not boot-enabled: %s\n' "$previous_web_unit" >&2
    return 1
  }
  unit_is_active "$previous_api_unit" || {
    printf 'blue-green-cutover: previous API unit is not active: %s\n' "$previous_api_unit" >&2
    return 1
  }
  unit_is_active "$previous_web_unit" || {
    printf 'blue-green-cutover: previous Web unit is not active: %s\n' "$previous_web_unit" >&2
    return 1
  }

  if [[ "$previous_runtime_kind" == 'LEGACY_SAFE' ]]; then
    run_probe_bounded 330 "$legacy_rollback_probe" \
      --release-sha "$FIRST_CUTOVER_ROLLBACK_SHA" \
      --api-base-url "$previous_api_url" \
      --web-url "$previous_web_url" \
      --require-drain || return 1
    return 0
  fi

  candidate_slot="$slot"
  slot="$previous_slot"
  if ! attest_candidate_units previous; then
    slot="$candidate_slot"
    return 1
  fi
  slot="$candidate_slot"

  run_probe_bounded 20 "$probe" \
    --release-sha "$previous_release_sha" \
    --expected-migration "$previous_migration" \
    --expected-migration-count "$previous_migration_count" \
    --expected-web-build-id "$previous_web_build_id" \
    --api-base-url "$previous_api_url" \
    --web-url "$previous_web_url"
}

verify_previous_runtime_bounded() {
  if [[ "$previous_runtime_kind" == 'LEGACY_SAFE' ]]; then
    verify_previous_runtime
    return 0
  fi
  local deadline=$((SECONDS + 75))
  while ((SECONDS < deadline)); do
    if verify_previous_runtime; then
      return 0
    fi
    ((SECONDS < deadline)) && sleep 1
  done
  return 1
}

restore_and_reload() {
  local previous_target="$1"
  local active_link="$2"
  local recovery_mode="${3:-normal}"
  local previous_verifier
  recovery_serving_deferred=false
  if [[ "$recovery_mode" == 'pre-nginx' ]]; then
    previous_verifier=verify_previous_runtime_bounded
  else
    previous_verifier=verify_previous_runtime
  fi
  if ! "$previous_verifier"; then
    printf 'blue-green-cutover: STOP: exact previous runtime is not directly live; routing was not changed to a dead N-1\n' >&2
    return 1
  fi
  atomic_link "$previous_target" "$active_link" || {
    printf 'blue-green-cutover: STOP: cannot atomically restore exact previous nginx target\n' >&2
    return 1
  }
  [[ "$(realpath -e -- "$active_link")" == "$previous_target" ]] || {
    printf 'blue-green-cutover: STOP: active link does not resolve to exact previous target after restore\n' >&2
    return 1
  }
  if ! nginx_test; then
    printf 'blue-green-cutover: STOP: previous nginx target no longer validates; loaded nginx workers were not stopped\n' >&2
    return 1
  fi
  if [[ "$recovery_mode" == 'pre-nginx' ]]; then
    recovery_serving_deferred=true
    printf 'BLUE_GREEN_RECOVERY_NGINX_START_DEFERRED=true\n'
    return 0
  fi
  if [[ "$recovery_mode" == 'allow-inactive' ]] && ! unit_is_active nginx.service; then
    nginx_start || {
      printf 'blue-green-cutover: STOP: recovered previous config validates but nginx could not be started\n' >&2
      return 1
    }
    rollback_public_smoke || {
      printf 'blue-green-cutover: STOP: nginx started with recovered config but public serving is unconfirmed\n' >&2
      return 1
    }
    printf 'BLUE_GREEN_RECOVERY_NGINX_STARTED=true\n'
    return 0
  fi
  if ! nginx_reload; then
    printf 'blue-green-cutover: STOP: graceful reload of previous nginx target failed; loaded workers were not stopped\n' >&2
    return 1
  fi
  if ! rollback_public_smoke; then
    printf 'blue-green-cutover: STOP: previous link/processes were restored, but public serving could not be confirmed\n' >&2
    return 1
  fi
}

validate_phase_record_content() {
  local record="$1" record_state="$2" marker_key marker_value
  case "$record_state" in
    ACCEPTED_INTENT) marker_key='ACCEPTED_AT' ;;
    RECOVERED_INTENT) marker_key='RECOVERED_AT' ;;
    *) return 1 ;;
  esac
  awk -F= -v marker_key="$marker_key" '
    BEGIN {
      split("RECORD_VERSION GENERATION RELEASE_SHA SLOT PREVIOUS_TARGET PREVIOUS_SHA256 PREVIOUS_RUNTIME_KIND PREVIOUS_SLOT PREVIOUS_API_UNIT PREVIOUS_WEB_UNIT PREVIOUS_API_URL PREVIOUS_WEB_URL PREVIOUS_RELEASE_SHA PREVIOUS_MIGRATION PREVIOUS_MIGRATION_COUNT PREVIOUS_WEB_BUILD_ID ACTIVATED_TARGET ACTIVATED_SHA256 INTENT_RECORDED_AT", expected, " ")
      expected[20] = marker_key
    }
    NR > 20 || $1 != expected[NR] { exit 1 }
    END { if (NR != 20) exit 1 }
  ' "$record" || return 1
  marker_value="$(awk -F= -v marker_key="$marker_key" '
    $1 == marker_key { count += 1; value = substr($0, length(marker_key) + 2) }
    END { if (count != 1) exit 1; print value }
  ' "$record")" || return 1
  [[ "$marker_value" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{9}Z$ ]]
}

replace_intent_with_phase_record() {
  local intent="$1" record_state="$2" marker_key temporary
  phase_record_replaced=false
  attest_durable_mount_boundaries || return 1
  case "$record_state" in
    ACCEPTED_INTENT)
      marker_key='ACCEPTED_AT'
      temporary="${intent}.accepting.new"
      ;;
    RECOVERED_INTENT)
      marker_key='RECOVERED_AT'
      temporary="${intent}.recovering.new"
      ;;
    *) return 1 ;;
  esac
  validate_cutover_record_schema "$intent" INTENT || return 1
  [[ ! -e "$temporary" && ! -L "$temporary" ]] || return 1
  if ! {
    cat -- "$intent"
    printf '%s=%s\n' "$marker_key" "$(date -u +%Y-%m-%dT%H:%M:%S.%NZ)"
  } > "$temporary"; then
    rm -f -- "$temporary"
    return 1
  fi
  if ! chmod 0600 -- "$temporary" \
    || ! validate_phase_record_content "$temporary" "$record_state" \
    || ! sync -f "$temporary"; then
    rm -f -- "$temporary"
    sync -d "$state_root" 2>/dev/null || true
    return 1
  fi
  if ! mv -T -- "$temporary" "$intent"; then
    rm -f -- "$temporary"
    sync -d "$state_root" 2>/dev/null || true
    return 1
  fi
  phase_record_replaced=true
  sync -f "$intent" || return 1
  sync -d "$state_root" || return 1
  attest_durable_mount_boundaries || return 1
  validate_cutover_record_schema "$intent" "$record_state"
}

archive_recovered_intent() {
  local intent="$1"
  local recovered="${intent%.intent}.recovered"
  [[ "$intent" == *.intent && ! -e "$recovered" && ! -L "$recovered" ]] \
    || die 'cannot archive recovered intent safely'
  replace_intent_with_phase_record "$intent" RECOVERED_INTENT || return 1
  if [[ "${unprivileged_test_mode:-false}" == true \
    && "${LEETPLUS_TEST_FAIL_PHASE:-}" == 'before-archive-mv' \
    && ! -e "${state_root}/.fixture-before-archive-mv-fired" ]]; then
    : > "${state_root}/.fixture-before-archive-mv-fired" || return 1
    return 1
  fi
  mv -T -- "$intent" "$recovered" || return 1
  sync -f "$recovered" || return 1
  sync -d "$state_root" || return 1
  [[ ! -e "$intent" && ! -L "$intent" && -f "$recovered" && ! -L "$recovered" ]] \
    || return 1
  validate_cutover_record_schema "$recovered" RECOVERED || return 1
  printf 'BLUE_GREEN_RECOVERED_RECORD=%s\n' "$recovered"
}

cutover_exit_guard() {
  local status=$?
  trap - EXIT HUP INT TERM
  if [[ "${cutover_guard_armed:-false}" == true ]]; then
    set +e
    printf 'blue-green-cutover: interrupted with an unaccepted routing effect; restoring exact N-1\n' >&2
    if restore_and_reload "$previous_target" "$active_link"; then
      if ! archive_recovered_intent "$intent_path"; then
        printf 'blue-green-cutover: exact N-1 was restored but durable intent archival failed\n' >&2
      fi
    else
      printf 'blue-green-cutover: automatic exit rollback failed; durable intent retained for recovery service\n' >&2
    fi
  fi
  exit "$status"
}

restore_unaccepted_candidate() {
  restore_and_reload "$previous_target" "$active_link" || return 1
  archive_recovered_intent "$intent_path" || return 1
  cutover_guard_armed=false
}

read_receipt_value() {
  local receipt="$1"
  local key="$2"
  awk -F= -v key="$key" '
    $1 == key { count += 1; value = substr($0, length(key) + 2) }
    END { if (count != 1) exit 1; print value }
  ' "$receipt"
}

generation_is_valid() {
  local value="$1"
  [[ "$value" =~ ^[1-9][0-9]*$ && ${#value} -le 9 ]]
}

validate_cutover_record_schema() {
  local record="$1" record_state="$2"
  local record_name timestamp_name filename_generation filename_sha filename_slot filename_suffix
  local record_version generation_value release_value slot_value intent_recorded phase_at=''

  [[ -f "$record" && ! -L "$record" && "$(realpath -e -- "$record")" == "$record" ]] || return 1
  record_name="$(basename -- "$record")"
  case "$record_state" in
    INTENT) filename_suffix='intent' ;;
    ACCEPTED) filename_suffix='receipt' ;;
    ACCEPTED_INTENT) filename_suffix='intent' ;;
    RECOVERED) filename_suffix='recovered' ;;
    RECOVERED_INTENT) filename_suffix='intent' ;;
    *) return 1 ;;
  esac
  [[ "$record_name" =~ ^([0-9]{8}T[0-9]{15}Z)-g([1-9][0-9]{0,8})-([0-9a-f]{40})-(blue|green)\.${filename_suffix}$ ]] \
    || return 1
  timestamp_name="${BASH_REMATCH[1]}"
  filename_generation="${BASH_REMATCH[2]}"
  filename_sha="${BASH_REMATCH[3]}"
  filename_slot="${BASH_REMATCH[4]}"

  if [[ "$record_state" == INTENT ]]; then
    awk -F= '
      BEGIN {
        split("RECORD_VERSION GENERATION RELEASE_SHA SLOT PREVIOUS_TARGET PREVIOUS_SHA256 PREVIOUS_RUNTIME_KIND PREVIOUS_SLOT PREVIOUS_API_UNIT PREVIOUS_WEB_UNIT PREVIOUS_API_URL PREVIOUS_WEB_URL PREVIOUS_RELEASE_SHA PREVIOUS_MIGRATION PREVIOUS_MIGRATION_COUNT PREVIOUS_WEB_BUILD_ID ACTIVATED_TARGET ACTIVATED_SHA256 INTENT_RECORDED_AT", expected, " ")
      }
      NR > 19 || $1 != expected[NR] { exit 1 }
      END { if (NR != 19) exit 1 }
    ' "$record" || return 1
  elif [[ "$record_state" == ACCEPTED || "$record_state" == ACCEPTED_INTENT ]]; then
    validate_phase_record_content "$record" ACCEPTED_INTENT || return 1
    phase_at="$(read_receipt_value "$record" ACCEPTED_AT)" || return 1
  else
    validate_phase_record_content "$record" RECOVERED_INTENT || return 1
    phase_at="$(read_receipt_value "$record" RECOVERED_AT)" || return 1
  fi

  record_version="$(read_receipt_value "$record" RECORD_VERSION)" || return 1
  generation_value="$(read_receipt_value "$record" GENERATION)" || return 1
  release_value="$(read_receipt_value "$record" RELEASE_SHA)" || return 1
  slot_value="$(read_receipt_value "$record" SLOT)" || return 1
  intent_recorded="$(read_receipt_value "$record" INTENT_RECORDED_AT)" || return 1
  [[ "$record_version" == 3 ]] || return 1
  generation_is_valid "$generation_value" || return 1
  [[ "$generation_value" == "$filename_generation" && "$release_value" == "$filename_sha" \
    && "$slot_value" == "$filename_slot" && "$intent_recorded" == "$timestamp_name" ]] || return 1
}

mode=''
if (($# > 0)); then
  mode="$1"
  shift
fi
[[ "$mode" == 'switch' || "$mode" == 'rollback' || "$mode" == 'recover-pending' || "$mode" == 'recover-before-nginx' ]] || {
  usage >&2
  exit 1
}

slot=''
release_sha=''
expected_migration=''
expected_migration_count=''
expected_web_build_id=''
loopback_api_url=''
loopback_web_url=''
public_api_url=''
public_web_url=''
previous_release_sha=''
previous_migration=''
previous_migration_count=''
previous_web_build_id=''
previous_runtime_kind=''
previous_slot=''
previous_api_unit=''
previous_web_unit=''
previous_api_url=''
previous_web_url=''
receipt=''
watchdog_seconds=30
config_root='/etc/nginx/leetplus'
state_root='/var/lib/leetplus/deploy-receipts'
systemd_root='/etc/systemd/system'
environment_root='/etc/leetplus'
libexec_root='/usr/local/libexec/leetplus'
probe='/usr/local/libexec/leetplus/verify-release-readiness.sh'
legacy_rollback_probe='/usr/local/libexec/leetplus/verify-legacy-rollback-readiness.sh'
authenticated_smoke='/usr/local/libexec/leetplus/verify-legacy-rollback-authenticated-reads.mjs'
unprivileged_test_mode=false

while (($# > 0)); do
  case "$1" in
    --slot) slot="${2:-}"; shift 2 ;;
    --release-sha) release_sha="${2:-}"; shift 2 ;;
    --expected-migration) expected_migration="${2:-}"; shift 2 ;;
    --expected-migration-count) expected_migration_count="${2:-}"; shift 2 ;;
    --expected-web-build-id) expected_web_build_id="${2:-}"; shift 2 ;;
    --loopback-api-url) loopback_api_url="${2:-}"; shift 2 ;;
    --loopback-web-url) loopback_web_url="${2:-}"; shift 2 ;;
    --public-api-url) public_api_url="${2:-}"; shift 2 ;;
    --public-web-url) public_web_url="${2:-}"; shift 2 ;;
    --previous-release-sha) previous_release_sha="${2:-}"; shift 2 ;;
    --previous-migration) previous_migration="${2:-}"; shift 2 ;;
    --previous-migration-count) previous_migration_count="${2:-}"; shift 2 ;;
    --previous-web-build-id) previous_web_build_id="${2:-}"; shift 2 ;;
    --receipt) receipt="${2:-}"; shift 2 ;;
    --watchdog-seconds) watchdog_seconds="${2:-}"; shift 2 ;;
    --config-root) config_root="${2:-}"; shift 2 ;;
    --state-root) state_root="${2:-}"; shift 2 ;;
    --systemd-root) systemd_root="${2:-}"; shift 2 ;;
    --environment-root) environment_root="${2:-}"; shift 2 ;;
    --libexec-root) libexec_root="${2:-}"; shift 2 ;;
    --probe) probe="${2:-}"; shift 2 ;;
    --legacy-rollback-probe) legacy_rollback_probe="${2:-}"; shift 2 ;;
    --authenticated-smoke) authenticated_smoke="${2:-}"; shift 2 ;;
    --unprivileged-test-mode) unprivileged_test_mode=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

if [[ "$unprivileged_test_mode" == true ]]; then
  ((EUID != 0)) || die 'unprivileged test mode is forbidden for root'
  PATH="$LEETPLUS_BOOTSTRAP_TEST_PATH"
  export PATH
else
  ((EUID == 0)) || die 'production cutover must run as root'
  [[ "$config_root" == '/etc/nginx/leetplus' ]] || die 'production config root cannot be overridden'
  [[ "$state_root" == '/var/lib/leetplus/deploy-receipts' ]] || die 'production state root cannot be overridden'
  [[ "$systemd_root" == '/etc/systemd/system' ]] || die 'production systemd root cannot be overridden'
  [[ "$environment_root" == '/etc/leetplus' ]] || die 'production environment root cannot be overridden'
  [[ "$libexec_root" == '/usr/local/libexec/leetplus' ]] || die 'production libexec root cannot be overridden'
  [[ "$probe" == '/usr/local/libexec/leetplus/verify-release-readiness.sh' ]] || die 'production readiness probe cannot be overridden'
  [[ "$legacy_rollback_probe" == '/usr/local/libexec/leetplus/verify-legacy-rollback-readiness.sh' ]] || die 'production N-1 readiness probe cannot be overridden'
  [[ "$authenticated_smoke" == '/usr/local/libexec/leetplus/verify-legacy-rollback-authenticated-reads.mjs' ]] || die 'production authenticated smoke cannot be overridden'
fi
unset LEETPLUS_BOOTSTRAP_TEST_PATH

for command_name in awk basename cat chmod cp curl date dd dirname find findmnt flock getent id ln mktemp mount mv nginx realpath rm sed sha256sum sleep sort ss stat sync systemctl timeout tr unshare; do
  require_command "$command_name"
done

[[ -d "$config_root" && ! -L "$config_root" ]] || die 'config root must be a real directory'
[[ -d "$state_root" && ! -L "$state_root" ]] || die 'state root must be a real directory'
[[ -d "$systemd_root" && ! -L "$systemd_root" ]] || die 'systemd root must be a real directory'
[[ -d "$environment_root" && ! -L "$environment_root" ]] || die 'environment root must be a real directory'
[[ -d "$libexec_root" && ! -L "$libexec_root" ]] || die 'libexec root must be a real directory'
[[ -f "$probe" && ! -L "$probe" && -x "$probe" ]] || die 'readiness probe must be an executable regular file'
[[ -f "$legacy_rollback_probe" && ! -L "$legacy_rollback_probe" && -x "$legacy_rollback_probe" ]] || die 'N-1 readiness probe must be an executable regular file'
[[ -f "$authenticated_smoke" && ! -L "$authenticated_smoke" && -x "$authenticated_smoke" ]] || die 'authenticated read-only smoke must be an executable regular file'
config_root="$(realpath -e -- "$config_root")"
state_root="$(realpath -e -- "$state_root")"
systemd_root="$(realpath -e -- "$systemd_root")"
environment_root="$(realpath -e -- "$environment_root")"
libexec_root="$(realpath -e -- "$libexec_root")"
probe="$(realpath -e -- "$probe")"
legacy_rollback_probe="$(realpath -e -- "$legacy_rollback_probe")"
authenticated_smoke="$(realpath -e -- "$authenticated_smoke")"
if [[ "$unprivileged_test_mode" == false ]]; then
  [[ "$config_root" == '/etc/nginx/leetplus' \
    && "$state_root" == '/var/lib/leetplus/deploy-receipts' \
    && "$systemd_root" == '/etc/systemd/system' \
    && "$environment_root" == '/etc/leetplus' \
    && "$libexec_root" == '/usr/local/libexec/leetplus' \
    && "$probe" == '/usr/local/libexec/leetplus/verify-release-readiness.sh' \
    && "$legacy_rollback_probe" == '/usr/local/libexec/leetplus/verify-legacy-rollback-readiness.sh' \
    && "$authenticated_smoke" == '/usr/local/libexec/leetplus/verify-legacy-rollback-authenticated-reads.mjs' ]] \
    || die 'production operational roots contain a symlinked/noncanonical ancestor'
fi

attest_durable_mount_boundaries() {
  local inventory mount_target protected_root
  local -a protected_roots=(
    "$config_root"
    "${config_root}/upstreams"
    "$state_root"
    "$systemd_root"
    "$environment_root"
    "$libexec_root"
  )
  if [[ "$unprivileged_test_mode" == true ]]; then
    [[ -n "${TEST_CUTOVER_MOUNT_INVENTORY_FILE:-}" ]] || return 0
    [[ -f "$TEST_CUTOVER_MOUNT_INVENTORY_FILE" && ! -L "$TEST_CUTOVER_MOUNT_INVENTORY_FILE" ]] \
      || die 'fixture mount inventory is absent or symlinked'
    inventory="$(cat -- "$TEST_CUTOVER_MOUNT_INVENTORY_FILE")" \
      || die 'fixture mount inventory could not be read completely'
  else
    # Recovery units run in a private mount namespace because
    # ProtectSystem=strict plus ReadWritePaths creates sandbox bind mounts on
    # the two durable roots. Attest PID 1's host namespace so those expected
    # sandbox mounts cannot mask (or be confused with) a durable host mount.
    inventory="$(findmnt --task 1 --raw --noheadings --output TARGET)" \
      || die 'durable deployment mount inventory failed or returned partial output'
  fi
  [[ ${#inventory} -le 4194304 && "$inventory" != *$'\r'* ]] \
    || die 'durable deployment mount inventory is oversized or noncanonical'
  while IFS= read -r mount_target; do
    [[ -n "$mount_target" ]] || continue
    for protected_root in "${protected_roots[@]}"; do
      case "$mount_target" in
        "$protected_root"|"$protected_root"/*)
          die "durable deployment boundary contains an exact/nested mount: ${mount_target}"
          ;;
      esac
    done
  done <<< "$inventory"
}

attest_durable_mount_boundaries

if [[ "$unprivileged_test_mode" == false ]]; then
  probe_root="$(dirname -- "$probe")"
  [[ "$(stat -c '%U' -- /var/lib)" == 'root' \
    && -z "$(find -P /var/lib -maxdepth 0 -perm /022 -print -quit)" ]] \
    || die '/var/lib deployment ancestor is not trusted'
  [[ -d /var/lib/leetplus && ! -L /var/lib/leetplus ]] || die 'deployment state parent is absent or is a symlink'
  [[ "$(stat -c '%U' -- /var/lib/leetplus)" == 'root' ]] || die 'deployment state parent must be root-owned'
  [[ -z "$(find -P /var/lib/leetplus -maxdepth 0 -perm /022 -print -quit)" ]] || die 'deployment state parent is group/other-writable'
  [[ "$(stat -c '%U' -- "$config_root")" == 'root' ]] || die 'config root must be root-owned'
  [[ "$(stat -c '%U' -- "$state_root")" == 'root' ]] || die 'state root must be root-owned'
  [[ "$(stat -c '%U' -- "$systemd_root")" == 'root' ]] || die 'systemd root must be root-owned'
  [[ "$(stat -c '%U' -- "$environment_root")" == 'root' ]] || die 'environment root must be root-owned'
  [[ "$(stat -c '%U' -- "$libexec_root")" == 'root' ]] || die 'libexec root must be root-owned'
  [[ "$(stat -c '%U' -- "$probe")" == 'root' ]] || die 'readiness probe must be root-owned'
  [[ "$(stat -c '%U' -- "$legacy_rollback_probe")" == 'root' ]] || die 'N-1 readiness probe must be root-owned'
  [[ "$(stat -c '%U' -- "$authenticated_smoke")" == 'root' ]] || die 'authenticated smoke must be root-owned'
  [[ "$(stat -c '%U' -- "$probe_root")" == 'root' ]] || die 'readiness probe directory must be root-owned'
  [[ "$(stat -c '%a' -- "$state_root")" == '700' ]] || die 'state root mode must be 0700'
  [[ -z "$(find -P "$probe" -maxdepth 0 -perm /022 -print -quit)" ]] || die 'readiness probe is group/other-writable'
  [[ -z "$(find -P "$legacy_rollback_probe" -maxdepth 0 -perm /022 -print -quit)" ]] || die 'N-1 readiness probe is group/other-writable'
  [[ -z "$(find -P "$authenticated_smoke" -maxdepth 0 -perm /022 -print -quit)" ]] || die 'authenticated smoke is group/other-writable'
  [[ -z "$(find -P "$probe_root" -maxdepth 0 -perm /022 -print -quit)" ]] || die 'readiness probe directory is group/other-writable'
  [[ -z "$(find -P "$config_root" -maxdepth 2 \( -type d -o -type f \) -perm /022 -print -quit)" ]] || die 'nginx deployment config is group/other-writable'
  [[ -z "$(find -P "$systemd_root" -maxdepth 0 -perm /022 -print -quit)" ]] || die 'systemd root is group/other-writable'
  [[ -z "$(find -P "$environment_root" -maxdepth 0 -perm /022 -print -quit)" ]] || die 'environment root is group/other-writable'
  [[ -z "$(find -P "$libexec_root" -maxdepth 0 -perm /022 -print -quit)" ]] || die 'libexec root is group/other-writable'
  trusted_installed_file "$probe" "$RELEASE_READINESS_SHA256" root 555 \
    || die 'release readiness probe byte/identity differs from the pinned verifier'
  trusted_installed_file "$legacy_rollback_probe" "$LEGACY_READINESS_SHA256" root 755 \
    || die 'N-1 readiness probe byte/identity differs from the pinned verifier'
  trusted_installed_file "$authenticated_smoke" "$AUTHENTICATED_READS_SHA256" root 755 \
    || die 'authenticated read-only smoke byte/identity differs from the pinned verifier'
fi

active_link="${config_root}/active-upstreams.conf"
[[ -d "${config_root}/upstreams" && ! -L "${config_root}/upstreams" ]] || die 'upstream root must be a real directory'
upstream_root="$(realpath -e -- "${config_root}/upstreams")"
if [[ "$unprivileged_test_mode" == false ]]; then
  [[ "$(stat -c '%U' -- "$upstream_root")" == 'root' ]] || die 'upstream root must be root-owned'
  unexpected_config_owner="$(find -P "$config_root" -maxdepth 2 \
    \( -type d -o -type f -o -type l \) ! -user root -print -quit)"
  [[ -z "$unexpected_config_owner" ]] || die 'nginx deployment config contains a non-root-owned entry'
fi
lock_file="${state_root}/cutover.lock"
acquire_hardened_cutover_lock() {
  local parent expected_identity fd_path
  parent="$(dirname -- "$lock_file")"
  [[ -d "$parent" && ! -L "$parent" && "$(realpath -e -- "$parent")" == "$parent" ]] \
    || die 'shared cutover lock parent is noncanonical'
  if [[ ! -e "$lock_file" && ! -L "$lock_file" ]]; then
    (umask 0077; set -o noclobber; : > "$lock_file") \
      || die 'failed to create the shared cutover lock without following links'
    chmod 0600 "$lock_file"
    sync -f "$lock_file"
    sync -d "$parent"
  fi
  if [[ "$unprivileged_test_mode" == false ]]; then
    expected_identity='root:root:600:1'
  else
    expected_identity="$(stat -c '%U:%G' -- "$parent"):600:1"
  fi
  [[ -f "$lock_file" && ! -L "$lock_file" \
    && "$(stat -c '%U:%G:%a:%h' -- "$lock_file")" == "$expected_identity" ]] \
    || die 'shared cutover lock path identity is unsafe'
  exec 9>> "$lock_file"
  fd_path="/proc/$$/fd/9"
  [[ "$(realpath -e -- "$fd_path")" == "$lock_file" \
    && "$(stat -Lc '%U:%G:%a:%h' -- "$fd_path")" == "$expected_identity" ]] \
    || die 'shared cutover lock descriptor/path identity is unsafe before flock'
  flock -n 9 || die 'another blue/green operation holds the deployment lock'
  [[ -f "$lock_file" && ! -L "$lock_file" \
    && "$(realpath -e -- "$fd_path")" == "$lock_file" \
    && "$(stat -c '%U:%G:%a:%h' -- "$lock_file")" == "$expected_identity" \
    && "$(stat -Lc '%U:%G:%a:%h' -- "$fd_path")" == "$expected_identity" ]] \
    || die 'shared cutover lock changed while held'
}
acquire_hardened_cutover_lock
attest_durable_mount_boundaries
latest_index="${state_root}/latest-accepted.index"

write_latest_index() {
  local receipt_path="$1" consumed="$2" temporary="${latest_index}.new.$$" receipt_generation
  validate_cutover_record_schema "$receipt_path" ACCEPTED \
    || die 'accepted receipt cannot be indexed because its schema or filename is not canonical'
  attest_durable_mount_boundaries
  receipt_generation="$(read_receipt_value "$receipt_path" GENERATION)" \
    || die 'accepted receipt generation is absent'
  {
    printf 'RECORD_VERSION=2\n'
    printf 'GENERATION=%s\n' "$receipt_generation"
    printf 'RECEIPT_PATH=%s\n' "$receipt_path"
    printf 'RECEIPT_SHA256=%s\n' "$(sha256sum "$receipt_path" | awk '{ print $1 }')"
    printf 'CONSUMED=%s\n' "$consumed"
  } > "$temporary"
  chmod 0600 "$temporary"
  sync -f "$temporary"
  if [[ "$unprivileged_test_mode" == true \
    && "${LEETPLUS_TEST_FAIL_PHASE:-}" == 'before-latest-index-mv' ]]; then
    return 93
  fi
  mv -T "$temporary" "$latest_index"
  if [[ "$unprivileged_test_mode" == true \
    && "${LEETPLUS_TEST_FAIL_PHASE:-}" == 'after-latest-index-mv' ]]; then
    return 94
  fi
  sync -f "$latest_index"
  sync -d "$state_root"
  attest_durable_mount_boundaries
}

load_latest_index() {
  [[ -f "$latest_index" && ! -L "$latest_index" ]] || return 1
  if [[ "$unprivileged_test_mode" == false ]]; then
    [[ "$(stat -c '%U:%G:%a:%h' -- "$latest_index")" == 'root:root:600:1' ]] \
      || die 'latest accepted-generation index ownership/mode/link count is unsafe'
  fi
  awk -F= '
    BEGIN { split("RECORD_VERSION GENERATION RECEIPT_PATH RECEIPT_SHA256 CONSUMED", expected, " ") }
    NR > 5 || $1 != expected[NR] { exit 1 }
    END { if (NR != 5) exit 1 }
  ' "$latest_index" || die 'latest accepted-generation index schema is not exact'
  latest_record_version="$(read_receipt_value "$latest_index" RECORD_VERSION)" \
    || die 'latest accepted-generation index version is absent'
  latest_generation="$(read_receipt_value "$latest_index" GENERATION)" \
    || die 'latest accepted-generation number is absent'
  latest_receipt="$(read_receipt_value "$latest_index" RECEIPT_PATH)" \
    || die 'latest accepted-generation receipt path is absent'
  latest_digest="$(read_receipt_value "$latest_index" RECEIPT_SHA256)" \
    || die 'latest accepted-generation digest is absent'
  latest_consumed="$(read_receipt_value "$latest_index" CONSUMED)" \
    || die 'latest accepted-generation consumption state is absent'
  [[ "$latest_record_version" == 2 && "$latest_digest" =~ ^[0-9a-f]{64}$ \
    && ( "$latest_consumed" == true || "$latest_consumed" == false ) ]] \
    || die 'latest accepted-generation index values are invalid'
  generation_is_valid "$latest_generation" \
    || die 'latest accepted-generation number is invalid'
  [[ "$latest_receipt" == "$state_root"/*.receipt && -f "$latest_receipt" && ! -L "$latest_receipt" ]] \
    || die 'latest accepted-generation receipt is outside state root, absent or unsafe'
  [[ "$(realpath -e -- "$latest_receipt")" == "$latest_receipt" ]] \
    || die 'latest accepted-generation receipt path is not canonical'
  [[ "$(sha256sum "$latest_receipt" | awk '{ print $1 }')" == "$latest_digest" ]] \
    || die 'latest accepted-generation receipt digest changed'
  validate_cutover_record_schema "$latest_receipt" ACCEPTED \
    || die 'latest accepted-generation receipt schema or filename is not canonical'
  [[ "$(read_receipt_value "$latest_receipt" GENERATION)" == "$latest_generation" ]] \
    || die 'latest accepted-generation index and receipt generation differ'
}

validate_accepted_receipt_for_index() {
  local candidate="$1" record_state="${2:-ACCEPTED}" candidate_name filename_sha filename_slot filename_suffix
  local candidate_record release_value slot_value previous_value previous_hash previous_kind
  local previous_slot_value previous_api_unit_value previous_web_unit_value
  local previous_api_url_value previous_web_url_value previous_release_value
  local previous_migration_value previous_migration_count_value previous_web_build_value
  local activated_value activated_hash current_target

  [[ -f "$candidate" && ! -L "$candidate" && "$(realpath -e -- "$candidate")" == "$candidate" ]] || return 1
  if [[ "$unprivileged_test_mode" == false ]]; then
    [[ "$(stat -c '%U:%G:%a:%h' -- "$candidate")" == 'root:root:600:1' ]] || return 1
  fi
  validate_cutover_record_schema "$candidate" "$record_state" || return 1
  case "$record_state" in
    ACCEPTED) filename_suffix='receipt' ;;
    ACCEPTED_INTENT) filename_suffix='intent' ;;
    *) return 1 ;;
  esac
  candidate_name="$(basename -- "$candidate")"
  [[ "$candidate_name" =~ ^[0-9]{8}T[0-9]{15}Z-g[1-9][0-9]{0,8}-([0-9a-f]{40})-(blue|green)\.${filename_suffix}$ ]] || return 1
  filename_sha="${BASH_REMATCH[1]}"
  filename_slot="${BASH_REMATCH[2]}"

  candidate_record="$(read_receipt_value "$candidate" RECORD_VERSION)" || return 1
  release_value="$(read_receipt_value "$candidate" RELEASE_SHA)" || return 1
  slot_value="$(read_receipt_value "$candidate" SLOT)" || return 1
  previous_value="$(read_receipt_value "$candidate" PREVIOUS_TARGET)" || return 1
  previous_hash="$(read_receipt_value "$candidate" PREVIOUS_SHA256)" || return 1
  previous_kind="$(read_receipt_value "$candidate" PREVIOUS_RUNTIME_KIND)" || return 1
  previous_slot_value="$(read_receipt_value "$candidate" PREVIOUS_SLOT)" || return 1
  previous_api_unit_value="$(read_receipt_value "$candidate" PREVIOUS_API_UNIT)" || return 1
  previous_web_unit_value="$(read_receipt_value "$candidate" PREVIOUS_WEB_UNIT)" || return 1
  previous_api_url_value="$(read_receipt_value "$candidate" PREVIOUS_API_URL)" || return 1
  previous_web_url_value="$(read_receipt_value "$candidate" PREVIOUS_WEB_URL)" || return 1
  previous_release_value="$(read_receipt_value "$candidate" PREVIOUS_RELEASE_SHA)" || return 1
  previous_migration_value="$(read_receipt_value "$candidate" PREVIOUS_MIGRATION)" || return 1
  previous_migration_count_value="$(read_receipt_value "$candidate" PREVIOUS_MIGRATION_COUNT)" || return 1
  previous_web_build_value="$(read_receipt_value "$candidate" PREVIOUS_WEB_BUILD_ID)" || return 1
  activated_value="$(read_receipt_value "$candidate" ACTIVATED_TARGET)" || return 1
  activated_hash="$(read_receipt_value "$candidate" ACTIVATED_SHA256)" || return 1
  [[ "$candidate_record" == 3 && "$release_value" == "$filename_sha" \
    && "$slot_value" == "$filename_slot" ]] || return 1
  [[ "$previous_hash" =~ ^[0-9a-f]{64}$ && "$activated_hash" =~ ^[0-9a-f]{64}$ ]] || return 1
  [[ "$previous_value" == "$upstream_root"/*.conf && "$activated_value" == "$upstream_root/${filename_slot}.conf" ]] || return 1
  [[ -f "$previous_value" && ! -L "$previous_value" && "$(realpath -e -- "$previous_value")" == "$previous_value" ]] || return 1
  [[ -f "$activated_value" && ! -L "$activated_value" && "$(realpath -e -- "$activated_value")" == "$activated_value" ]] || return 1
  [[ "$(sha256sum "$previous_value" | awk '{ print $1 }')" == "$previous_hash" \
    && "$(sha256sum "$activated_value" | awk '{ print $1 }')" == "$activated_hash" ]] || return 1
  [[ -L "$active_link" ]] || return 1
  current_target="$(realpath -e -- "$active_link")" || return 1
  [[ "$current_target" == "$activated_value" ]] || return 1

  case "$(basename -- "$previous_value")" in
    legacy-safe.conf)
      [[ "$previous_kind" == LEGACY_SAFE && "$previous_slot_value" == legacy-safe \
        && "$previous_api_unit_value" == "leetplus-api-rollback@${FIRST_CUTOVER_ROLLBACK_SHA}.service" \
        && "$previous_web_unit_value" == "leetplus-web-rollback@${FIRST_CUTOVER_ROLLBACK_SHA}.service" \
        && "$previous_api_url_value" == 'http://127.0.0.1:4300' \
        && "$previous_web_url_value" == 'http://127.0.0.1:3300' \
        && "$previous_release_value" == "$FIRST_CUTOVER_ROLLBACK_SHA" \
        && "$previous_migration_value" == SCHEMA_COMPATIBILITY_REHEARSED \
        && "$previous_migration_count_value" == 0 \
        && "$previous_web_build_value" == "$FIRST_CUTOVER_ROLLBACK_SHA" ]] || return 1
      ;;
    blue.conf|green.conf)
      local expected_previous_slot expected_previous_api expected_previous_web
      expected_previous_slot="$(basename -- "$previous_value" .conf)"
      if [[ "$expected_previous_slot" == blue ]]; then
        expected_previous_api='http://127.0.0.1:4100'
        expected_previous_web='http://127.0.0.1:3100'
      else
        expected_previous_api='http://127.0.0.1:4200'
        expected_previous_web='http://127.0.0.1:3200'
      fi
      [[ "$previous_kind" == SLOT && "$previous_slot_value" == "$expected_previous_slot" \
        && "$previous_api_unit_value" == "leetplus-api@${expected_previous_slot}.service" \
        && "$previous_web_unit_value" == "leetplus-web@${expected_previous_slot}.service" \
        && "$previous_api_url_value" == "$expected_previous_api" \
        && "$previous_web_url_value" == "$expected_previous_web" \
        && "$previous_release_value" =~ $RELEASE_SHA_PATTERN \
        && "$previous_migration_value" =~ $MIGRATION_PATTERN \
        && "$previous_migration_count_value" =~ ^[1-9][0-9]*$ \
        && "$previous_web_build_value" == "$previous_release_value" ]] || return 1
      ;;
    *) return 1 ;;
  esac
}

collect_state_records() {
  local output_name="$1" record_kind="$2" temporary read_fd write_fd
  local -n output_ref="$output_name"
  output_ref=()
  if [[ "$unprivileged_test_mode" == true ]]; then
    temporary="$(mktemp "${state_root}/.runtime-record-inventory.XXXXXX")"
  else
    temporary="$(mktemp /tmp/leetplus-cutover-record-inventory.XXXXXX)"
  fi
  [[ -f "$temporary" && ! -L "$temporary" && "$(stat -c '%h' -- "$temporary")" == 1 ]] \
    || die 'cutover record inventory temporary is unsafe'
  if [[ "$unprivileged_test_mode" == false ]]; then
    [[ "$(stat -c '%U:%G:%a' -- "$temporary")" == 'root:root:600' ]] \
      || die 'cutover record inventory temporary identity is unsafe'
  fi
  exec {read_fd}< "$temporary"
  exec {write_fd}> "$temporary"
  rm -- "$temporary"
  case "$record_kind" in
    phase)
      timeout --foreground --kill-after=2s 10s find -P "$state_root" -maxdepth 1 -type f \
        \( -name "${CUTOVER_RECORD_NAMESPACE_GLOB}.intent.accepting.new" \
          -o -name "${CUTOVER_RECORD_NAMESPACE_GLOB}.intent.recovering.new" \) \
        -print0 >&"$write_fd" \
        || die 'complete cutover phase-record inventory failed or timed out'
      ;;
    intent)
      timeout --foreground --kill-after=2s 10s find -P "$state_root" -maxdepth 1 -type f \
        -name "${CUTOVER_RECORD_NAMESPACE_GLOB}.intent" -print0 >&"$write_fd" \
        || die 'complete cutover intent inventory failed or timed out'
      ;;
    receipt)
      timeout --foreground --kill-after=2s 10s find -P "$state_root" -maxdepth 1 -type f \
        -name "${CUTOVER_RECORD_NAMESPACE_GLOB}.receipt" -print0 >&"$write_fd" \
        || die 'complete cutover accepted-receipt inventory failed or timed out'
      ;;
    *) die 'internal cutover record inventory kind is not reviewed' ;;
  esac
  exec {write_fd}>&-
  mapfile -d '' -t output_ref <&"$read_fd" \
    || die 'complete cutover record inventory could not be parsed'
  exec {read_fd}>&-
  ((${#output_ref[@]} <= 1024)) \
    || die 'cutover record inventory is unexpectedly large'
}

cleanup_incomplete_phase_records() {
  local -a phase_records=()
  local candidate original expected_identity
  collect_state_records phase_records phase
  for candidate in "${phase_records[@]}"; do
    [[ "$(basename -- "$candidate")" =~ ^[0-9]{8}T[0-9]{15}Z-g[1-9][0-9]{0,8}-[0-9a-f]{40}-(blue|green)\.intent\.(accepting|recovering)\.new$ ]] \
      || die 'incomplete phase record has a noncanonical filename'
    original="${candidate%.accepting.new}"
    original="${original%.recovering.new}"
    validate_cutover_record_schema "$original" INTENT \
      || die 'incomplete phase record is not paired with an exact durable intent'
    if [[ "$unprivileged_test_mode" == true ]]; then
      expected_identity="$(id -un):$(id -gn):600:1"
    else
      expected_identity='root:root:600:1'
    fi
    [[ -f "$candidate" && ! -L "$candidate" \
      && "$(realpath -e -- "$candidate")" == "$candidate" \
      && "$(stat -c '%U:%G:%a:%h' -- "$candidate")" == "$expected_identity" ]] \
      || die 'incomplete phase record identity is unsafe'
    rm -- "$candidate" || die 'failed to remove an uncommitted phase record'
    sync -d "$state_root" || die 'failed to fsync phase-record cleanup'
    printf 'BLUE_GREEN_UNCOMMITTED_PHASE_RECORD_DISCARDED=%s\n' "$candidate"
  done
}

reconcile_committed_recovered_intent() {
  local -a intent_records=()
  local candidate recovered_path recovered_markers
  collect_state_records intent_records intent
  ((${#intent_records[@]} <= 1)) \
    || die 'multiple outstanding cutover intents require manual incident handling'
  ((${#intent_records[@]} == 1)) || return 0
  candidate="${intent_records[0]}"
  recovered_markers="$(awk -F= '$1 == "RECOVERED_AT" { count += 1 } END { print count + 0 }' "$candidate")"
  if [[ "$recovered_markers" == 0 ]]; then
    return 0
  fi
  [[ "$recovered_markers" == 1 ]] \
    || die 'committed recovered intent contains a noncanonical recovery marker'
  validate_cutover_record_schema "$candidate" RECOVERED_INTENT \
    || die 'committed recovered intent schema is invalid'
  recovered_path="${candidate%.intent}.recovered"
  [[ ! -e "$recovered_path" && ! -L "$recovered_path" ]] \
    || die 'committed recovered intent collides with an existing record'
  mv -T -- "$candidate" "$recovered_path" \
    || die 'failed to finalize the committed recovered intent'
  sync -f "$recovered_path" \
    || die 'failed to fsync the finalized recovered record'
  sync -d "$state_root" \
    || die 'failed to fsync the recovered-record directory'
  validate_cutover_record_schema "$recovered_path" RECOVERED \
    || die 'finalized recovered record schema is invalid'
  printf 'BLUE_GREEN_RECOVERED_INTENT_RECONCILED=%s\n' "$recovered_path"
}

reconcile_committed_accepted_intent() {
  local -a intent_records=()
  local candidate accepted_path has_accepted_marker
  collect_state_records intent_records intent
  ((${#intent_records[@]} <= 1)) \
    || die 'multiple outstanding cutover intents require manual incident handling'
  ((${#intent_records[@]} == 1)) || return 0

  candidate="${intent_records[0]}"
  has_accepted_marker="$(awk -F= '$1 == "ACCEPTED_AT" { count += 1 } END { print count + 0 }' "$candidate")"
  if [[ "$has_accepted_marker" == 0 ]]; then
    return 0
  fi
  [[ "$has_accepted_marker" == 1 ]] \
    || die 'committed accepted intent contains a noncanonical acceptance marker'
  validate_accepted_receipt_for_index "$candidate" ACCEPTED_INTENT \
    || die 'committed accepted intent does not exactly describe the live runtime'
  accepted_path="${candidate%.intent}.receipt"
  [[ ! -e "$accepted_path" && ! -L "$accepted_path" ]] \
    || die 'committed accepted intent collides with an existing receipt'
  mv -T -- "$candidate" "$accepted_path" \
    || die 'failed to finalize the committed accepted intent'
  sync -f "$accepted_path" \
    || die 'failed to fsync the finalized accepted receipt'
  sync -d "$state_root" \
    || die 'failed to fsync the accepted receipt directory'
  printf 'BLUE_GREEN_ACCEPTED_INTENT_RECONCILED=%s\n' "$accepted_path"
}

reconcile_unindexed_accepted_generation() {
  local indexed_generation_value=0 candidate_generation candidate_generation_value
  local seen_generations=' ' indexed_generation_receipt=''
  local -a accepted_receipts=() newer_receipts=()
  collect_state_records accepted_receipts receipt
  ((${#accepted_receipts[@]} > 0)) || return 0

  if [[ -e "$latest_index" || -L "$latest_index" ]]; then
    load_latest_index
    indexed_generation_value=$((10#$latest_generation))
  fi
  for candidate in "${accepted_receipts[@]}"; do
    validate_cutover_record_schema "$candidate" ACCEPTED \
      || die 'accepted receipt filename or schema is not canonical'
    candidate_generation="$(read_receipt_value "$candidate" GENERATION)" \
      || die 'accepted receipt generation is absent'
    case "$seen_generations" in
      *" $candidate_generation "*) die 'accepted receipt generation is duplicated' ;;
    esac
    seen_generations+="$candidate_generation "
    candidate_generation_value=$((10#$candidate_generation))
    if ((candidate_generation_value == indexed_generation_value)); then
      [[ -n "${latest_receipt:-}" && "$candidate" == "$latest_receipt" ]] \
        || die 'indexed accepted generation maps to a different receipt'
      indexed_generation_receipt="$candidate"
    elif ((candidate_generation_value > indexed_generation_value)); then
      newer_receipts+=("$candidate")
    fi
  done
  if ((indexed_generation_value > 0)); then
    [[ "$indexed_generation_receipt" == "$latest_receipt" ]] \
      || die 'indexed accepted generation is absent from the receipt journal'
  fi
  ((${#newer_receipts[@]} <= 1)) \
    || die 'multiple unindexed accepted generations require manual incident handling'
  ((${#newer_receipts[@]} == 1)) || return 0
  candidate_generation="$(read_receipt_value "${newer_receipts[0]}" GENERATION)" \
    || die 'unindexed accepted generation is absent'
  candidate_generation_value=$((10#$candidate_generation))
  ((candidate_generation_value == indexed_generation_value + 1)) \
    || die 'unindexed accepted generation is not the exact monotonic successor'
  validate_accepted_receipt_for_index "${newer_receipts[0]}" \
    || die 'unindexed accepted generation does not exactly describe the live runtime'
  write_latest_index "${newer_receipts[0]}" false \
    || die 'failed to reconcile the accepted-generation index'
  printf 'BLUE_GREEN_ACCEPTED_INDEX_RECONCILED=%s\n' "${newer_receipts[0]}"
}

cleanup_incomplete_phase_records
reconcile_committed_recovered_intent
reconcile_committed_accepted_intent
reconcile_unindexed_accepted_generation

if [[ "$mode" == 'recover-pending' || "$mode" == 'recover-before-nginx' ]]; then
  pending_intents=()
  collect_state_records pending_intents intent
  if ((${#pending_intents[@]} == 0)); then
    printf 'BLUE_GREEN_PENDING_RECOVERY=false\n'
    exit 0
  fi
  ((${#pending_intents[@]} == 1)) \
    || die 'multiple outstanding cutover intents require manual incident handling'
  receipt="${pending_intents[0]}"
fi

if [[ "$mode" == 'rollback' || "$mode" == 'recover-pending' || "$mode" == 'recover-before-nginx' ]]; then
  [[ "$receipt" == /* ]] || die 'rollback receipt path must be absolute'
  [[ -f "$receipt" && ! -L "$receipt" ]] || die 'receipt must be a regular non-symlink file'
  receipt="$(realpath -e -- "$receipt")"
  case "$receipt" in "$state_root"/*) ;; *) die 'receipt is outside the protected state root' ;; esac
  if [[ "$unprivileged_test_mode" == false ]]; then
    [[ "$(stat -c '%U' -- "$receipt")" == 'root' ]] || die 'receipt must be root-owned'
    [[ "$(stat -c '%a' -- "$receipt")" == '600' ]] || die 'receipt mode must be 0600'
  fi

  receipt_name="$(basename -- "$receipt")"
  case "$receipt_name" in
    *.intent) receipt_state='INTENT' ;;
    *.receipt) receipt_state='ACCEPTED' ;;
    *) die 'rollback file must be an intent or accepted receipt' ;;
  esac
  if [[ ( "$mode" == 'recover-pending' || "$mode" == 'recover-before-nginx' ) && "$receipt_state" != 'INTENT' ]]; then
    die 'automatic recovery accepts only an outstanding intent'
  fi
  validate_cutover_record_schema "$receipt" "$receipt_state" \
    || die 'rollback record filename or schema is not exact and canonical'
  record_version="$(read_receipt_value "$receipt" RECORD_VERSION)" || die 'receipt has no unique record version'
  [[ "$record_version" == '3' ]] || die 'receipt record version is unsupported'
  record_generation="$(read_receipt_value "$receipt" GENERATION)" || die 'receipt has no unique generation'
  if [[ "$receipt_state" == INTENT ]]; then
    expected_intent_generation=1
    if [[ -e "$latest_index" || -L "$latest_index" ]]; then
      load_latest_index
      expected_intent_generation=$((10#$latest_generation + 1))
    fi
    [[ "$record_generation" == "$expected_intent_generation" ]] \
      || die 'outstanding intent is not the exact successor of the accepted-generation index'
  fi
  previous_target="$(read_receipt_value "$receipt" PREVIOUS_TARGET)" || die 'receipt has no unique previous target'
  previous_digest="$(read_receipt_value "$receipt" PREVIOUS_SHA256)" || die 'receipt has no unique previous digest'
  previous_runtime_kind="$(read_receipt_value "$receipt" PREVIOUS_RUNTIME_KIND)" || die 'receipt has no unique previous runtime kind'
  previous_slot="$(read_receipt_value "$receipt" PREVIOUS_SLOT)" || die 'receipt has no unique previous slot'
  previous_api_unit="$(read_receipt_value "$receipt" PREVIOUS_API_UNIT)" || die 'receipt has no unique previous API unit'
  previous_web_unit="$(read_receipt_value "$receipt" PREVIOUS_WEB_UNIT)" || die 'receipt has no unique previous Web unit'
  previous_api_url="$(read_receipt_value "$receipt" PREVIOUS_API_URL)" || die 'receipt has no unique previous API URL'
  previous_web_url="$(read_receipt_value "$receipt" PREVIOUS_WEB_URL)" || die 'receipt has no unique previous Web URL'
  previous_release_sha="$(read_receipt_value "$receipt" PREVIOUS_RELEASE_SHA)" || die 'receipt has no unique previous release SHA'
  previous_migration="$(read_receipt_value "$receipt" PREVIOUS_MIGRATION)" || die 'receipt has no unique previous migration'
  previous_migration_count="$(read_receipt_value "$receipt" PREVIOUS_MIGRATION_COUNT)" || die 'receipt has no unique previous migration count'
  previous_web_build_id="$(read_receipt_value "$receipt" PREVIOUS_WEB_BUILD_ID)" || die 'receipt has no unique previous Web identity'
  activated_target="$(read_receipt_value "$receipt" ACTIVATED_TARGET)" || die 'receipt has no unique activated target'
  activated_digest="$(read_receipt_value "$receipt" ACTIVATED_SHA256)" || die 'receipt has no unique activated digest'
  if [[ "$mode" == 'rollback' && "$receipt_state" == 'ACCEPTED' ]]; then
    load_latest_index || die 'latest accepted-generation index is absent'
    [[ "$latest_record_version" == 2 && "$latest_generation" == "$record_generation" \
      && "$latest_receipt" == "$receipt" \
      && "$latest_digest" == "$(sha256sum "$receipt" | awk '{ print $1 }')" \
      && "$latest_consumed" == false ]] \
      || die 'rollback receipt is stale, superseded, drifted or already consumed'
  fi
  [[ "$previous_target" =~ ^/[A-Za-z0-9_./-]+$ && "$activated_target" =~ ^/[A-Za-z0-9_./-]+$ ]] || die 'receipt contains an unsafe target path'
  [[ "$(dirname -- "$previous_target")" == "$upstream_root" && "$(basename -- "$previous_target")" == *.conf ]] || die 'previous receipt target is outside the reviewed upstream root'
  [[ "$(dirname -- "$activated_target")" == "$upstream_root" && "$(basename -- "$activated_target")" == *.conf ]] || die 'activated receipt target is outside the reviewed upstream root'
  [[ "$previous_digest" =~ ^[0-9a-f]{64}$ ]] || die 'receipt contains an invalid previous digest'
  [[ "$activated_digest" =~ ^[0-9a-f]{64}$ ]] || die 'receipt contains an invalid activated digest'
  validate_recorded_previous_runtime_contract
  [[ -L "$active_link" ]] || die 'active upstream link is absent'
  current_target="$(realpath -e -- "$active_link")"
  [[ -f "$previous_target" && ! -L "$previous_target" ]] || die 'previous upstream target is absent or not regular'
  [[ "$(realpath -e -- "$previous_target")" == "$previous_target" ]] || die 'previous upstream target is not canonical'
  [[ -f "$activated_target" && ! -L "$activated_target" ]] || die 'activated upstream target is absent or not regular'
  [[ "$(realpath -e -- "$activated_target")" == "$activated_target" ]] || die 'activated upstream target is not canonical'
  [[ "$(sha256sum -- "$previous_target" | awk '{ print $1 }')" == "$previous_digest" ]] || die 'previous upstream target digest changed'
  if [[ "$(sha256sum -- "$activated_target" | awk '{ print $1 }')" != "$activated_digest" ]]; then
    printf 'blue-green-cutover: warning: activated target digest changed; restoring the still-exact previous target\n' >&2
  fi
  if [[ "$current_target" == "$activated_target" || "$current_target" == "$previous_target" ]]; then
    # Always perform a bounded validation + graceful reload, including when the
    # link is already restored. A prior rollback may have crashed after the
    # link effect but before nginx reload; the receipt is deliberately
    # idempotent across that phase boundary.
    if [[ "$mode" == 'recover-before-nginx' ]]; then
      restore_and_reload "$previous_target" "$active_link" pre-nginx \
        || die 'automatic pre-nginx exact link recovery failed'
    elif [[ "$mode" == 'recover-pending' ]]; then
      restore_and_reload "$previous_target" "$active_link" allow-inactive \
        || die 'automatic exact nginx recovery failed'
    else
      restore_and_reload "$previous_target" "$active_link" \
        || die 'exact nginx rollback failed'
    fi
  else
    die 'stale rollback record does not describe the active target'
  fi
  printf 'BLUE_GREEN_ROLLBACK_RECEIPT=%s\n' "$receipt"
  printf 'BLUE_GREEN_ROLLBACK_RECORD_STATE=%s\n' "$receipt_state"
  printf 'BLUE_GREEN_ROLLBACK_TARGET=%s\n' "$previous_target"
  printf 'BLUE_GREEN_OLD_PROCESSES_STOPPED=false\n'
  if [[ "$receipt_state" == 'INTENT' \
    && !( ( "$mode" == 'recover-pending' || "$mode" == 'recover-before-nginx' ) \
      && "${recovery_serving_deferred:-false}" == true ) ]]; then
    archive_recovered_intent "$receipt"
  fi
  if [[ "$mode" == 'rollback' && "$receipt_state" == 'ACCEPTED' ]]; then
    if [[ "$unprivileged_test_mode" == true \
      && "${LEETPLUS_TEST_ABORT_AFTER_ROLLBACK_ROUTE:-false}" == true ]]; then
      die 'fixture-requested interruption after exact rollback route recovery'
    fi
    write_latest_index "$receipt" true
  fi
  exit 0
fi

outstanding_intent="$(find -P "$state_root" -maxdepth 1 -type f \
  -name "${CUTOVER_RECORD_NAMESPACE_GLOB}.intent" -print -quit)"
[[ -z "$outstanding_intent" ]] \
  || die 'an outstanding cutover intent must be recovered before a new switch'

next_generation=1
if [[ -e "$latest_index" || -L "$latest_index" ]]; then
  load_latest_index
  latest_generation_value=$((10#$latest_generation))
  ((latest_generation_value < 999999999)) \
    || die 'accepted-generation counter is exhausted'
  next_generation=$((latest_generation_value + 1))
fi

[[ "$slot" =~ $SLOT_PATTERN ]] || die 'slot must be blue or green'
[[ "$release_sha" =~ $RELEASE_SHA_PATTERN ]] || die 'release SHA must be 40 lowercase hexadecimal characters'
[[ "$expected_migration" =~ $MIGRATION_PATTERN ]] || die 'expected migration name is invalid'
[[ "$expected_migration_count" =~ ^[1-9][0-9]*$ ]] || die 'expected migration count must be positive'
[[ "$expected_web_build_id" == "$release_sha" ]] || die 'expected Web BUILD_ID must equal exact release SHA'
[[ "$watchdog_seconds" =~ ^[0-9]+$ ]] || die 'watchdog seconds must be an integer'
((watchdog_seconds >= 5 && watchdog_seconds <= 60)) || die 'watchdog seconds must be between 5 and 60'
if [[ "$unprivileged_test_mode" == false ]]; then
  if [[ "$slot" == 'blue' ]]; then
    [[ "$loopback_api_url" == 'http://127.0.0.1:4100' ]] || die 'blue API loopback URL must be pinned to 127.0.0.1:4100'
    [[ "$loopback_web_url" == 'http://127.0.0.1:3100' ]] || die 'blue Web loopback URL must be pinned to 127.0.0.1:3100'
  else
    [[ "$loopback_api_url" == 'http://127.0.0.1:4200' ]] || die 'green API loopback URL must be pinned to 127.0.0.1:4200'
    [[ "$loopback_web_url" == 'http://127.0.0.1:3200' ]] || die 'green Web loopback URL must be pinned to 127.0.0.1:3200'
  fi
  [[ "$public_api_url" == 'https://api.leetplus.ru' ]] || die 'public API URL must be pinned to https://api.leetplus.ru'
  [[ "$public_web_url" == 'https://leetplus.ru' ]] || die 'public Web URL must be pinned to https://leetplus.ru'
else
  for required_url in "$loopback_api_url" "$loopback_web_url" "$public_api_url" "$public_web_url"; do
    [[ "$required_url" =~ ^https?://[^[:space:]]+$ ]] || die 'all readiness URLs must be absolute HTTP(S) URLs'
  done
fi

slot_target="${config_root}/upstreams/${slot}.conf"
[[ -f "$slot_target" && ! -L "$slot_target" ]] || die 'slot upstream target must be a regular non-symlink file'
[[ -L "$active_link" ]] || die 'active upstream link must already point to the concrete N-1 target'
previous_target="$(realpath -e -- "$active_link")"
[[ -f "$previous_target" && ! -L "$previous_target" ]] || die 'previous upstream target must be a regular non-symlink file'
[[ "$(dirname -- "$previous_target")" == "$upstream_root" ]] || die 'previous upstream target is outside the reviewed upstream root'
[[ "$(realpath -e -- "$slot_target")" == "$slot_target" ]] || die 'slot upstream target is not canonical'
[[ "$slot_target" != "$previous_target" ]] || die 'requested slot is already active'
if [[ "$unprivileged_test_mode" == false ]]; then
  [[ "$(stat -c '%U' -- "$slot_target")" == 'root' ]] || die 'slot upstream target must be root-owned'
  [[ "$(stat -c '%U' -- "$previous_target")" == 'root' ]] || die 'previous upstream target must be root-owned'
fi
set_previous_runtime_contract

if [[ "$slot" == blue ]]; then
  expected_slot_nginx_digest="$BLUE_NGINX_SHA256"
else
  expected_slot_nginx_digest="$GREEN_NGINX_SHA256"
fi
case "$(basename -- "$previous_target")" in
  legacy-safe.conf) expected_previous_nginx_digest="$LEGACY_SAFE_NGINX_SHA256" ;;
  blue.conf) expected_previous_nginx_digest="$BLUE_NGINX_SHA256" ;;
  green.conf) expected_previous_nginx_digest="$GREEN_NGINX_SHA256" ;;
  *) die 'previous nginx target is not a pinned reviewed byte' ;;
esac
trusted_installed_file "$slot_target" "$expected_slot_nginx_digest" root 644 \
  || die 'candidate nginx target byte/identity differs from the pinned template'
trusted_installed_file "$previous_target" "$expected_previous_nginx_digest" root 644 \
  || die 'previous nginx target byte/identity differs from the pinned template'

unit_is_active "leetplus-api@${slot}.service" || die 'candidate API unit is not active'
unit_is_active "leetplus-web@${slot}.service" || die 'candidate Web unit is not active'
unit_is_enabled "leetplus-api@${slot}.service" || die 'candidate API unit is not boot-enabled'
unit_is_enabled "leetplus-web@${slot}.service" || die 'candidate Web unit is not boot-enabled'
attest_candidate_units pre \
  || die 'candidate effective installed-unit contract failed before nginx switch'

probe_arguments=(
  --release-sha "$release_sha"
  --expected-migration "$expected_migration"
  --expected-migration-count "$expected_migration_count"
  --expected-web-build-id "$expected_web_build_id"
)
run_probe_bounded 20 "$probe" "${probe_arguments[@]}" \
  --api-base-url "$loopback_api_url" --web-url "$loopback_web_url" || die 'candidate loopback readiness failed before nginx switch'
run_authenticated_smoke_bounded 120 "$loopback_api_url" \
  || die 'candidate authenticated DB-bound read-only smoke failed before durable intent'

verify_previous_runtime || die 'exact N-1 runtime is not directly live before nginx switch'
candidate_full_config_test
attest_durable_mount_boundaries

previous_digest="$(sha256sum -- "$previous_target" | awk '{ print $1 }')"
slot_digest="$(sha256sum -- "$slot_target" | awk '{ print $1 }')"
timestamp="$(date -u +%Y%m%dT%H%M%S%NZ)"
if [[ -n "${LEETPLUS_TEST_TIMESTAMP_OVERRIDE:-}" ]]; then
  [[ "$unprivileged_test_mode" == true ]] \
    || die 'test timestamp override is forbidden in production mode'
  timestamp="$LEETPLUS_TEST_TIMESTAMP_OVERRIDE"
fi
[[ "$timestamp" =~ ^[0-9]{8}T[0-9]{15}Z$ ]] \
  || die 'cutover journal timestamp is not canonical'
intent_path="${state_root}/${timestamp}-g${next_generation}-${release_sha}-${slot}.intent"
accepted_receipt_path="${state_root}/${timestamp}-g${next_generation}-${release_sha}-${slot}.receipt"
[[ ! -e "$intent_path" && ! -L "$intent_path" && ! -e "$accepted_receipt_path" && ! -L "$accepted_receipt_path" ]] || die 'cutover intent/receipt already exists'
intent_temporary="${intent_path}.new.$$"
{
  printf 'RECORD_VERSION=3\n'
  printf 'GENERATION=%s\n' "$next_generation"
  printf 'RELEASE_SHA=%s\n' "$release_sha"
  printf 'SLOT=%s\n' "$slot"
  printf 'PREVIOUS_TARGET=%s\n' "$previous_target"
  printf 'PREVIOUS_SHA256=%s\n' "$previous_digest"
  printf 'PREVIOUS_RUNTIME_KIND=%s\n' "$previous_runtime_kind"
  printf 'PREVIOUS_SLOT=%s\n' "$previous_slot"
  printf 'PREVIOUS_API_UNIT=%s\n' "$previous_api_unit"
  printf 'PREVIOUS_WEB_UNIT=%s\n' "$previous_web_unit"
  printf 'PREVIOUS_API_URL=%s\n' "$previous_api_url"
  printf 'PREVIOUS_WEB_URL=%s\n' "$previous_web_url"
  printf 'PREVIOUS_RELEASE_SHA=%s\n' "$previous_release_sha"
  printf 'PREVIOUS_MIGRATION=%s\n' "$previous_migration"
  printf 'PREVIOUS_MIGRATION_COUNT=%s\n' "$previous_migration_count"
  printf 'PREVIOUS_WEB_BUILD_ID=%s\n' "$previous_web_build_id"
  printf 'ACTIVATED_TARGET=%s\n' "$slot_target"
  printf 'ACTIVATED_SHA256=%s\n' "$slot_digest"
  printf 'INTENT_RECORDED_AT=%s\n' "$timestamp"
} > "$intent_temporary"
chmod 0600 -- "$intent_temporary"
mv -T -- "$intent_temporary" "$intent_path"
sync -f "$intent_path"
sync -d "$state_root"
attest_durable_mount_boundaries
validate_cutover_record_schema "$intent_path" INTENT \
  || die 'durable cutover intent failed its exact schema/filename self-check'

cutover_guard_armed=true
trap cutover_exit_guard EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
atomic_link "$slot_target" "$active_link"
[[ "$(realpath -e -- "$active_link")" == "$slot_target" ]] \
  || die 'candidate routing link did not resolve to the exact target after atomic switch'
if [[ "$unprivileged_test_mode" == true && "${LEETPLUS_TEST_ABORT_AFTER_LINK:-false}" == true ]]; then
  die 'fixture-requested interruption after routing link effect'
fi

if ! nginx_test; then
  restore_unaccepted_candidate || die 'candidate nginx test failed and exact rollback failed'
  die 'candidate nginx test failed; exact previous target was restored and reloaded'
fi
if ! nginx_reload; then
  restore_unaccepted_candidate || die 'candidate reload and exact rollback both failed'
  die 'candidate nginx reload failed; exact previous target was restored'
fi

watchdog_deadline=$((SECONDS + watchdog_seconds))
watchdog_accepted=false
watchdog_consecutive_successes=0
while ((SECONDS < watchdog_deadline)); do
  if attest_candidate_units watchdog \
    && unit_is_active "leetplus-api@${slot}.service" \
    && unit_is_active "leetplus-web@${slot}.service"; then
    watchdog_remaining=$((watchdog_deadline - SECONDS))
    watchdog_sample_accepted=false
    if ((watchdog_remaining > 0)) \
      && run_probe_bounded "$watchdog_remaining" "$probe" "${probe_arguments[@]}" \
        --api-base-url "$public_api_url" --web-url "$public_web_url"; then
      watchdog_remaining=$((watchdog_deadline - SECONDS))
      if ((watchdog_remaining > 0)) \
        && run_authenticated_smoke_bounded "$watchdog_remaining" "$public_api_url"; then
        watchdog_sample_accepted=true
      fi
    fi
    if [[ "$watchdog_sample_accepted" == true ]]; then
      watchdog_consecutive_successes=$((watchdog_consecutive_successes + 1))
      if ((watchdog_consecutive_successes >= 3)); then
        watchdog_accepted=true
        break
      fi
    else
      watchdog_consecutive_successes=0
    fi
  else
    watchdog_consecutive_successes=0
  fi
  if ((SECONDS < watchdog_deadline)); then
    sleep 1
  fi
done

if [[ "$watchdog_accepted" != true ]]; then
  restore_unaccepted_candidate || die 'public watchdog failed and exact nginx rollback failed'
  die 'public watchdog failed; exact previous nginx target restored and old processes remain hot'
fi

trap '' HUP INT TERM
if ! replace_intent_with_phase_record "$intent_path" ACCEPTED_INTENT; then
  if [[ "${phase_record_replaced:-false}" == true ]]; then
    cutover_guard_armed=false
    trap - EXIT HUP INT TERM
    die 'accepted intent was atomically replaced but its durability confirmation failed; next locked invocation must reconcile'
  fi
  die 'atomic accepted-intent phase replacement failed before the acceptance commit point'
fi
# The fsynced accepted marker is the routing acceptance commit point. From
# here the candidate stays live and every rename/index failure is reconciled
# by the next shared-lock invocation; the pre-accept EXIT guard must not route
# back and archive a committed acceptance record.
cutover_guard_armed=false
trap - EXIT HUP INT TERM
if [[ "$unprivileged_test_mode" == true \
  && "${LEETPLUS_TEST_FAIL_PHASE:-}" == 'after-accepted-intent-fsync' ]]; then
  die 'fixture-requested interruption after accepted intent durability'
fi
mv -T -- "$intent_path" "$accepted_receipt_path"
sync -f "$accepted_receipt_path"
sync -d "$state_root"
attest_durable_mount_boundaries
validate_cutover_record_schema "$accepted_receipt_path" ACCEPTED \
  || die 'durable accepted receipt failed its exact schema/filename self-check'
if [[ "$unprivileged_test_mode" == true \
  && "${LEETPLUS_TEST_ABORT_AFTER_ACCEPTED_RECEIPT:-false}" == true ]]; then
  die 'fixture-requested interruption after accepted receipt durability'
fi
write_latest_index "$accepted_receipt_path" false

printf 'BLUE_GREEN_ACCEPTED_SHA=%s\n' "$release_sha"
printf 'BLUE_GREEN_ACCEPTED_SLOT=%s\n' "$slot"
printf 'BLUE_GREEN_ACCEPTED_RECEIPT=%s\n' "$accepted_receipt_path"
printf 'BLUE_GREEN_OLD_PROCESSES_STOPPED=false\n'
