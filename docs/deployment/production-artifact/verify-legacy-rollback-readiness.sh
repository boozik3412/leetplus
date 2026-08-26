#!/usr/bin/bash -p
# Read-only identity/health gate for the scheduler-free exact N-1 pair.

[[ $- == *p* ]] || { printf 'verify-legacy-rollback-readiness: privileged Bash mode is required\n' >&2; exit 1; }
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

readonly LEGACY_SHA='7de04ff4ccc814494810730be3fa6bf661097b07'
readonly API_UNIT="leetplus-api-rollback@${LEGACY_SHA}.service"
readonly WEB_UNIT="leetplus-web-rollback@${LEGACY_SHA}.service"
readonly EGRESS_UNIT='leetplus-rollback-egress.service'
readonly API_UNIT_SHA256='c059cada5649c258f9e0a7336cbb8cb8dd41fb898e45c9a18be8f466caa2df57'
readonly WEB_UNIT_SHA256='87455fc089e78ac5afcdc615189d2dd75f8352107778a6c19eb32be536502254'
readonly EGRESS_UNIT_SHA256='c9d90ee74181cd0c705eb717478f39533613070bbed258bfe9c48545f9067ce2'
readonly AUTH_EDGE_SHA256='e533a946eb7d4393b7f1f692da2f57f4d8bf86180658ff82d677084fc683b50a'
readonly CHILD_PRELOAD_SHA256='ea25c3cf121ff21f21c02b5bf017ac6b20e943918b6624210d593e800493127c'
readonly DATABASE_AUTHORITY_SQL_SHA256='76f16367ab7ba14d3bc4aacffcc080425b12464f276cc4b1c3a09bd5046dd5e7'

die() {
  printf 'verify-legacy-rollback-readiness: %s\n' "$*" >&2
  exit 1
}

release_sha=''
api_base_url='http://127.0.0.1:4300'
web_url='http://127.0.0.1:3300'
release_root='/srv/leetplus/rollback-releases'
drain_verifier='/usr/local/libexec/leetplus/verify-legacy-runtime-drain.sh'
authenticated_smoke='/usr/local/libexec/leetplus/verify-legacy-rollback-authenticated-reads.mjs'
egress_verifier='/usr/local/libexec/leetplus/apply-legacy-rollback-egress.sh'
drain_receipt='/var/lib/leetplus/legacy-drain/activation.receipt'
require_drain=false
unprivileged_test_mode=false
declare -a drain_verifier_arguments=()
declare -a authenticated_smoke_arguments=()

while (($# > 0)); do
  case "$1" in
    --release-sha) release_sha="${2:-}"; shift 2 ;;
    --api-base-url) api_base_url="${2:-}"; shift 2 ;;
    --web-url) web_url="${2:-}"; shift 2 ;;
    --release-root) release_root="${2:-}"; shift 2 ;;
    --drain-verifier) drain_verifier="${2:-}"; shift 2 ;;
    --authenticated-smoke) authenticated_smoke="${2:-}"; shift 2 ;;
    --egress-verifier) egress_verifier="${2:-}"; shift 2 ;;
    --drain-receipt) drain_receipt="${2:-}"; shift 2 ;;
    --drain-verifier-argument) drain_verifier_arguments+=("${2:-}"); shift 2 ;;
    --authenticated-smoke-argument) authenticated_smoke_arguments+=("${2:-}"); shift 2 ;;
    --require-drain) require_drain=true; shift ;;
    --unprivileged-test-mode) unprivileged_test_mode=true; shift ;;
    *) die "unknown argument: $1" ;;
  esac
done

[[ "$release_sha" == "$LEGACY_SHA" ]] || die 'only exact 7de04ff4 rollback release is admitted'
if [[ "$unprivileged_test_mode" == true ]]; then
  ((EUID != 0)) || die 'unprivileged test mode is forbidden for root'
  PATH="$LEETPLUS_BOOTSTRAP_TEST_PATH"
  export PATH
else
  ((EUID == 0)) || die 'production rollback readiness must run as root'
  [[ "$api_base_url" == 'http://127.0.0.1:4300' && "$web_url" == 'http://127.0.0.1:3300' ]] \
    || die 'production rollback URLs cannot be overridden'
  [[ "$release_root" == '/srv/leetplus/rollback-releases' ]] || die 'production rollback release root cannot be overridden'
  [[ "$drain_verifier" == '/usr/local/libexec/leetplus/verify-legacy-runtime-drain.sh' ]] || die 'production drain verifier cannot be overridden'
  [[ "$authenticated_smoke" == '/usr/local/libexec/leetplus/verify-legacy-rollback-authenticated-reads.mjs' ]] \
    || die 'production authenticated smoke cannot be overridden'
  [[ "$egress_verifier" == '/usr/local/libexec/leetplus/apply-legacy-rollback-egress.sh' ]] \
    || die 'production egress verifier cannot be overridden'
  [[ "$drain_receipt" == '/var/lib/leetplus/legacy-drain/activation.receipt' ]] || die 'production drain receipt cannot be overridden'
  ((${#drain_verifier_arguments[@]} == 0 && ${#authenticated_smoke_arguments[@]} == 0)) \
    || die 'production verifier arguments cannot be extended'
fi
unset LEETPLUS_BOOTSTRAP_TEST_PATH

for command_name in awk curl dd dirname env find findmnt getent grep id realpath sed sha256sum sort ss stat systemctl timeout tr wc; do
  command -v "$command_name" >/dev/null 2>&1 || die "required command is unavailable: $command_name"
done

systemctl_bounded() {
  timeout --foreground --kill-after=2s 10s systemctl "$@"
}

unit_property() {
  local unit="$1" property="$2"
  [[ "${unit_property_snapshot_unit:-}" == "$unit" ]] || return 1
  awk -F= -v property="$property" '
    $1 == property { count += 1; value = substr($0, length(property) + 2) }
    END { if (count != 1) exit 1; printf "%s", value }
  ' <<< "$unit_property_snapshot"
}

load_unit_property_snapshot() {
  local unit="$1" snapshot
  # systemctl suppresses empty properties unless --all is requested. Empty
  # security properties (notably DropInPaths) are still part of the exact
  # attestation contract and must remain distinguishable from missing output.
  snapshot="$(systemctl_bounded show --all --no-pager "$unit")" || return 1
  [[ -n "$snapshot" && ${#snapshot} -le 262144 && "$snapshot" != *$'\r'* ]] || return 1
  unit_property_snapshot_unit="$unit"
  unit_property_snapshot="$snapshot"
}

normalized_word_set() {
  tr ' ' '\n' | awk 'NF == 1 { print }' | LC_ALL=C sort | tr '\n' ' ' | awk '{$1=$1; print}'
}

attest_runtime_secret_group_reverse_sets() {
  local shared_line api_line web_line shared_gid api_gid web_gid shared_primary api_primary web_primary
  shared_line="$(awk -F: '$1 == "leetplus-runtime" { print }' <<< "$group_inventory")"
  api_line="$(awk -F: '$1 == "leetplus-api-runtime" { print }' <<< "$group_inventory")"
  web_line="$(awk -F: '$1 == "leetplus-web-runtime" { print }' <<< "$group_inventory")"
  [[ -n "$shared_line" && "$shared_line" != *$'\n'* \
    && -n "$api_line" && "$api_line" != *$'\n'* \
    && -n "$web_line" && "$web_line" != *$'\n'* ]] \
    || die 'runtime secret group name inventory is absent or ambiguous'
  shared_gid="$(awk -F: '{ print $3 }' <<< "$shared_line")"
  api_gid="$(awk -F: '{ print $3 }' <<< "$api_line")"
  web_gid="$(awk -F: '{ print $3 }' <<< "$web_line")"
  [[ "$shared_gid" =~ ^[1-9][0-9]{1,8}$ && "$api_gid" =~ ^[1-9][0-9]{1,8}$ \
    && "$web_gid" =~ ^[1-9][0-9]{1,8}$ \
    && "$shared_gid" != "$api_gid" && "$shared_gid" != "$web_gid" && "$api_gid" != "$web_gid" ]] \
    || die 'runtime secret group GIDs are invalid or aliased'
  shared_primary="$(awk -F: -v gid="$shared_gid" '$4 == gid { print $1 }' <<< "$passwd_inventory" \
    | LC_ALL=C sort | awk 'BEGIN { out="" } { out=(out == "" ? $0 : out "," $0) } END { print out }')"
  api_primary="$(awk -F: -v gid="$api_gid" '$4 == gid { print $1 }' <<< "$passwd_inventory" \
    | LC_ALL=C sort | awk 'BEGIN { out="" } { out=(out == "" ? $0 : out "," $0) } END { print out }')"
  web_primary="$(awk -F: -v gid="$web_gid" '$4 == gid { print $1 }' <<< "$passwd_inventory" \
    | LC_ALL=C sort | awk 'BEGIN { out="" } { out=(out == "" ? $0 : out "," $0) } END { print out }')"
  [[ "$shared_primary" == 'leetplus-api-blue,leetplus-api-green,leetplus-api-nminus1,leetplus-web-blue,leetplus-web-green,leetplus-web-nminus1' \
    && -z "$api_primary" && -z "$web_primary" ]] \
    || die 'runtime secret-group reverse primary-GID sets are not exact'
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

attest_rollback_identity_and_process_boundary() {
  local runtime_kind="$1" unit expected_user expected_supplementary expected_working_directory
  local expected_exec expected_preflight expected_environment_paths expected_read_only expected_read_write expected_port
  local fragment expected_digest runtime_environment runtime_group active_state sub_state unit_file_state need_daemon_reload
  local user group fragment_path drop_in_paths working_directory_value exec_start exec_start_pre environment_files environment
  local unset_environment no_new_privileges private_tmp private_devices protect_system protect_home protect_proc proc_subset
  local protect_kernel_tunables protect_kernel_modules protect_kernel_logs protect_control_groups protect_clock protect_hostname
  local lock_personality restrict_suid_sgid remove_ipc syscall_architectures address_families network_interfaces ip_deny ip_allow
  local socket_bind_deny socket_bind_allow read_only_paths read_write_paths inaccessible_paths capability_bounding ambient_capabilities
  local unit_umask kill_mode memory_max tasks_max main_pid invocation_id control_group process_cgroup listener_snapshot listener_count listener_address
  local passwd_entry name password uid gid gecos home shell runtime_gid actual_groups expected_groups status_file foreign_pid status_result
  local runtime_group_line runtime_group_name runtime_group_password runtime_group_members supplementary_line
  local supplementary_name supplementary_password supplementary_gid supplementary_members expected_supplementary_members expected_socket_bind_allow
  local cgroup_path cgroup_pid cgroup_pid_inventory allowed_pids=' ' child_pid='' child_count=0 child_cmdline child_parent

  case "$runtime_kind" in
    api)
      unit="$API_UNIT"
      expected_user='leetplus-api-nminus1'
      expected_supplementary='leetplus-api-runtime'
      expected_working_directory="$release_directory"
      expected_exec="/usr/bin/node /usr/local/libexec/leetplus/legacy-rollback-auth-edge.mjs --release-sha ${LEGACY_SHA}"
      expected_preflight="/usr/bin/bash -p /usr/local/libexec/leetplus/preflight-legacy-rollback.sh --release-sha ${LEGACY_SHA} --api-runtime"
      runtime_environment='/etc/leetplus/rollback-runtime.env'
      runtime_group='leetplus-api-runtime'
      expected_read_write=''
      inaccessible_paths=''
      expected_port=4300
      fragment='/etc/systemd/system/leetplus-api-rollback@.service'
      expected_digest="$API_UNIT_SHA256"
      ;;
    web)
      unit="$WEB_UNIT"
      expected_user='leetplus-web-nminus1'
      expected_supplementary='leetplus-web-runtime'
      expected_working_directory="${release_directory}/apps/web"
      expected_exec="/usr/bin/node ${release_directory}/apps/web/node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3300"
      expected_preflight="/usr/bin/bash -p /usr/local/libexec/leetplus/preflight-legacy-rollback.sh --release-sha ${LEGACY_SHA} --web-runtime"
      runtime_environment='/etc/leetplus/rollback-web-runtime.env'
      runtime_group='leetplus-web-runtime'
      expected_read_write='/var/cache/leetplus-web-nminus1'
      inaccessible_paths='/etc/leetplus/rollback-runtime.env'
      expected_port=3300
      fragment='/etc/systemd/system/leetplus-web-rollback@.service'
      expected_digest="$WEB_UNIT_SHA256"
      ;;
    *) die 'unknown rollback runtime kind' ;;
  esac
  expected_environment_paths="${runtime_environment}"$'\n'"/etc/leetplus/rollback-releases/${LEGACY_SHA}.env"$'\n''/etc/leetplus/rollback-safe.env'
  expected_read_only='/etc/leetplus/rollback-releases /etc/leetplus/rollback-safe.env /srv/leetplus/rollback-releases'

  [[ -f "$fragment" && ! -L "$fragment" && "$(stat -c '%U:%G:%a:%h' -- "$fragment")" == 'root:root:644:1' \
    && "$(sha256sum "$fragment" | awk '{ print $1 }')" == "$expected_digest" ]] \
    || die "rollback unit fragment byte/identity is not exact: ${unit}"
  [[ -f "$runtime_environment" && ! -L "$runtime_environment" \
    && "$(stat -c '%U:%G:%a:%h' -- "$runtime_environment")" == "root:${runtime_group}:640:1" ]] \
    || die "rollback runtime environment identity is not exact: ${unit}"
  load_unit_property_snapshot "$unit" || die "rollback unit property snapshot failed: ${unit}"
  active_state="$(unit_property "$unit" ActiveState)" || die "missing ActiveState: ${unit}"
  sub_state="$(unit_property "$unit" SubState)" || die "missing SubState: ${unit}"
  unit_file_state="$(unit_property "$unit" UnitFileState)" || die "missing UnitFileState: ${unit}"
  need_daemon_reload="$(unit_property "$unit" NeedDaemonReload)" || die "missing NeedDaemonReload: ${unit}"
  user="$(unit_property "$unit" User)" || die "missing User: ${unit}"
  group="$(unit_property "$unit" Group)" || die "missing Group: ${unit}"
  fragment_path="$(unit_property "$unit" FragmentPath)" || die "missing FragmentPath: ${unit}"
  drop_in_paths="$(unit_property "$unit" DropInPaths)" || die "missing DropInPaths: ${unit}"
  working_directory_value="$(unit_property "$unit" WorkingDirectory)" || die "missing WorkingDirectory: ${unit}"
  exec_start="$(unit_property "$unit" ExecStart)" || die "missing ExecStart: ${unit}"
  exec_start_pre="$(unit_property "$unit" ExecStartPre)" || die "missing ExecStartPre: ${unit}"
  environment_files="$(unit_property "$unit" EnvironmentFiles)" || die "missing EnvironmentFiles: ${unit}"
  environment="$(unit_property "$unit" Environment)" || die "missing Environment: ${unit}"
  unset_environment="$(unit_property "$unit" UnsetEnvironment)" || die "missing UnsetEnvironment: ${unit}"
  no_new_privileges="$(unit_property "$unit" NoNewPrivileges)"
  private_tmp="$(unit_property "$unit" PrivateTmp)"
  private_devices="$(unit_property "$unit" PrivateDevices)"
  protect_system="$(unit_property "$unit" ProtectSystem)"
  protect_home="$(unit_property "$unit" ProtectHome)"
  protect_proc="$(unit_property "$unit" ProtectProc)"
  proc_subset="$(unit_property "$unit" ProcSubset)"
  protect_kernel_tunables="$(unit_property "$unit" ProtectKernelTunables)"
  protect_kernel_modules="$(unit_property "$unit" ProtectKernelModules)"
  protect_kernel_logs="$(unit_property "$unit" ProtectKernelLogs)"
  protect_control_groups="$(unit_property "$unit" ProtectControlGroups)"
  protect_clock="$(unit_property "$unit" ProtectClock)"
  protect_hostname="$(unit_property "$unit" ProtectHostname)"
  lock_personality="$(unit_property "$unit" LockPersonality)"
  restrict_suid_sgid="$(unit_property "$unit" RestrictSUIDSGID)"
  remove_ipc="$(unit_property "$unit" RemoveIPC)"
  syscall_architectures="$(unit_property "$unit" SystemCallArchitectures)"
  address_families="$(unit_property "$unit" RestrictAddressFamilies)"
  network_interfaces="$(unit_property "$unit" RestrictNetworkInterfaces)"
  ip_deny="$(unit_property "$unit" IPAddressDeny)"
  ip_allow="$(unit_property "$unit" IPAddressAllow)"
  socket_bind_deny="$(unit_property "$unit" SocketBindDeny)"
  socket_bind_allow="$(unit_property "$unit" SocketBindAllow)"
  read_only_paths="$(unit_property "$unit" ReadOnlyPaths)"
  read_write_paths="$(unit_property "$unit" ReadWritePaths)"
  if [[ "$runtime_kind" == web ]]; then
    inaccessible_paths="$(unit_property "$unit" InaccessiblePaths)"
  fi
  capability_bounding="$(unit_property "$unit" CapabilityBoundingSet)"
  ambient_capabilities="$(unit_property "$unit" AmbientCapabilities)"
  unit_umask="$(unit_property "$unit" UMask)"
  kill_mode="$(unit_property "$unit" KillMode)"
  if [[ "$runtime_kind" == api ]]; then
    memory_max="$(unit_property "$unit" MemoryMax)"
    tasks_max="$(unit_property "$unit" TasksMax)"
  fi
  main_pid="$(unit_property "$unit" MainPID)"
  invocation_id="$(unit_property "$unit" InvocationID)"
  control_group="$(unit_property "$unit" ControlGroup)"

  [[ "$active_state" == active && "$sub_state" == running && "$unit_file_state" == enabled \
    && "$need_daemon_reload" == no \
    && "$user" == "$expected_user" && "$group" == leetplus-runtime && "$fragment_path" == "$fragment" \
    && -z "$drop_in_paths" && "$working_directory_value" == "$expected_working_directory" ]] \
    || die "rollback unit effective state/identity/fragment mismatch: ${unit}"
  [[ "$exec_start" == *"path=/usr/bin/node ; argv[]=${expected_exec} ;"* && "$exec_start" != *'} {'* \
    && "$exec_start_pre" == *"path=/usr/bin/bash ; argv[]=${expected_preflight} ;"* && "$exec_start_pre" != *'} {'* ]] \
    || die "rollback unit effective command contract mismatch: ${unit}"
  [[ "$environment_files" != *'ignore_errors=yes'* \
    && "$(printf '%s' "$environment_files" | environment_file_paths)" == "$expected_environment_paths" \
    && "$environment" == 'PATH=/usr/sbin:/usr/bin:/sbin:/bin' ]] \
    || die "rollback unit effective environment layering mismatch: ${unit}"
  [[ "$(printf '%s' "$unset_environment" | normalized_word_set)" \
      == 'ALL_PROXY BASH_ENV COREPACK_HOME COREPACK_INTEGRITY_KEYS COREPACK_NPM_REGISTRY CURL_CA_BUNDLE CURL_HOME ENV GCONV_PATH GIT_CONFIG_GLOBAL GIT_CONFIG_NOSYSTEM GIT_CONFIG_SYSTEM GLIBC_TUNABLES HTTPS_PROXY HTTP_PROXY LD_AUDIT LD_LIBRARY_PATH LD_PRELOAD LOCPATH MALLOC_CHECK_ MALLOC_PERTURB_ NODE_COMPILE_CACHE NODE_DEBUG NODE_EXTRA_CA_CERTS NODE_OPTIONS NODE_PATH NODE_USE_ENV_PROXY NODE_V8_COVERAGE NO_PROXY NPM_CONFIG_USERCONFIG OPENSSL_CONF OPENSSL_MODULES PNPM_HOME PRISMA_FMT_BINARY PRISMA_QUERY_ENGINE_BINARY PRISMA_QUERY_ENGINE_LIBRARY PRISMA_SCHEMA_ENGINE_BINARY SSLKEYLOGFILE SSL_CERT_DIR SSL_CERT_FILE TEMP TMP TMPDIR XDG_CACHE_HOME XDG_CONFIG_HOME XDG_DATA_HOME all_proxy http_proxy https_proxy no_proxy npm_config_userconfig' ]] \
    || die "rollback unit effective environment scrub mismatch: ${unit}"
  [[ "$no_new_privileges" == yes && "$private_tmp" == yes && "$private_devices" == yes \
    && "$protect_system" == strict && "$protect_home" == yes && "$protect_proc" == invisible \
    && "$proc_subset" == pid && "$protect_kernel_tunables" == yes && "$protect_kernel_modules" == yes \
    && "$protect_kernel_logs" == yes && "$protect_control_groups" == yes && "$protect_clock" == yes \
    && "$protect_hostname" == yes && "$lock_personality" == yes && "$restrict_suid_sgid" == yes \
    && "$remove_ipc" == yes && "$syscall_architectures" == native && "$unit_umask" == 0027 \
    && "$kill_mode" == control-group && -z "$capability_bounding" && -z "$ambient_capabilities" ]] \
    || die "rollback unit effective sandbox mismatch: ${unit}"
  expected_socket_bind_allow="ipv4:tcp:${expected_port}"
  [[ "$runtime_kind" == api ]] && expected_socket_bind_allow='ipv4:tcp:4300 ipv4:tcp:4301'
  [[ "$(printf '%s' "$address_families" | normalized_word_set)" == 'AF_INET AF_INET6' \
    && "$(printf '%s' "$network_interfaces" | normalized_word_set)" == lo \
    && "$ip_deny" == any && "$ip_allow" == localhost && "$socket_bind_deny" == any \
    && "$(printf '%s' "$socket_bind_allow" | normalized_word_set)" == "$expected_socket_bind_allow" \
    && "$(printf '%s' "$read_only_paths" | normalized_word_set)" == "$expected_read_only" \
    && "$(printf '%s' "$read_write_paths" | normalized_word_set)" == "$expected_read_write" ]] \
    || die "rollback unit effective network/path sandbox mismatch: ${unit}"
  [[ "$runtime_kind" != web || "$inaccessible_paths" == '/etc/leetplus/rollback-runtime.env' ]] \
    || die 'rollback Web effective secret-inaccessible path is missing'
  [[ "$runtime_kind" != api || ( "$memory_max" == 805306368 && "$tasks_max" == 128 ) ]] \
    || die 'rollback auth-edge resource limits are not exact'

  runtime_group_line="$(awk -F: '$1 == "leetplus-runtime" { print }' <<< "$group_inventory")"
  [[ -n "$runtime_group_line" && "$runtime_group_line" != *$'\n'* ]] \
    || die 'rollback runtime group is absent or name-ambiguous'
  IFS=: read -r runtime_group_name runtime_group_password runtime_gid runtime_group_members <<< "$runtime_group_line"
  [[ "$runtime_group_name" == leetplus-runtime && "$runtime_group_password" == x \
    && "$runtime_gid" =~ ^[1-9][0-9]{1,8}$ && -z "$runtime_group_members" \
    && "$(awk -F: -v gid="$runtime_gid" '$3 == gid { count += 1 } END { print count + 0 }' <<< "$group_inventory")" == 1 ]] \
    || die 'rollback runtime group GID/member contract is not exact'
  passwd_entry="$(awk -F: -v identity="$expected_user" '$1 == identity { print }' <<< "$passwd_inventory")"
  [[ -n "$passwd_entry" && "$passwd_entry" != *$'\n'* ]] \
    || die "rollback NSS identity is absent or ambiguous: ${expected_user}"
  IFS=: read -r name password uid gid gecos home shell <<< "$passwd_entry"
  [[ "$name" == "$expected_user" && "$password" == x && "$uid" =~ ^[1-9][0-9]{1,8}$ \
    && "$gid" == "$runtime_gid" && -z "$gecos" && "$home" == /nonexistent \
    && "$shell" == /usr/sbin/nologin && ! -e "$home" && ! -L "$home" \
    && "$(awk -F: -v uid="$uid" '$3 == uid { print }' <<< "$passwd_inventory")" == "$passwd_entry" ]] \
    || die "rollback NSS passwd/no-home/unique-UID contract mismatch: ${expected_user}"
  supplementary_line="$(awk -F: -v group="$expected_supplementary" '$1 == group { print }' <<< "$group_inventory")"
  [[ -n "$supplementary_line" && "$supplementary_line" != *$'\n'* ]] \
    || die "rollback supplementary group is absent or name-ambiguous: ${expected_supplementary}"
  IFS=: read -r supplementary_name supplementary_password supplementary_gid supplementary_members <<< "$supplementary_line"
  if [[ "$expected_supplementary" == leetplus-api-runtime ]]; then
    expected_supplementary_members='leetplus-api-blue,leetplus-api-green,leetplus-api-nminus1'
  else
    expected_supplementary_members='leetplus-web-blue,leetplus-web-green,leetplus-web-nminus1'
  fi
  [[ "$supplementary_name" == "$expected_supplementary" && "$supplementary_password" == x \
    && "$supplementary_gid" =~ ^[1-9][0-9]{1,8}$ \
    && "$(tr ',' '\n' <<< "$supplementary_members" | LC_ALL=C sort | tr '\n' ',' | sed 's/,$//')" == "$expected_supplementary_members" \
    && "$(awk -F: -v gid="$supplementary_gid" '$3 == gid { count += 1 } END { print count + 0 }' <<< "$group_inventory")" == 1 ]] \
    || die "rollback supplementary group GID/member contract is not exact: ${expected_supplementary}"
  expected_groups="$(printf '%s\n' leetplus-runtime "$expected_supplementary" | LC_ALL=C sort)"
  actual_groups="$(id -nG "$expected_user" | tr ' ' '\n' | awk 'NF' | LC_ALL=C sort -u)"
  [[ "$actual_groups" == "$expected_groups" ]] || die "rollback NSS groups mismatch: ${expected_user}"

  [[ "$main_pid" =~ ^[1-9][0-9]*$ && "$invocation_id" =~ ^[0-9a-f]{32}$ \
    && "$invocation_id" != 00000000000000000000000000000000 \
    && "$control_group" == "/system.slice/${unit}" && -r "/proc/${main_pid}/cgroup" ]] \
    || die "rollback unit live process identity mismatch: ${unit}"
  process_cgroup="$(awk -F: -v expected="$control_group" '$3 == expected { print $3; exit }' "/proc/${main_pid}/cgroup")"
  [[ "$process_cgroup" == "$control_group" \
    && "$(realpath -e -- "/proc/${main_pid}/cwd")" == "$expected_working_directory" ]] \
    || die "rollback MainPID cgroup/cwd mismatch: ${unit}"
  cgroup_path="/sys/fs/cgroup${control_group}"
  [[ -d "$cgroup_path" ]] || die "rollback unit cgroup is absent: ${unit}"
  cgroup_pid_inventory="$(timeout --foreground --kill-after=2s 10s \
    find "$cgroup_path" -type f -name cgroup.procs -exec awk 'NF { print }' {} \;)" \
    || die "rollback cgroup PID inventory failed or returned partial output: ${unit}"
  while IFS= read -r cgroup_pid; do
    [[ -z "$cgroup_pid" ]] && continue
    [[ "$cgroup_pid" =~ ^[1-9][0-9]*$ ]] \
      || die "rollback cgroup PID inventory is malformed: ${unit}"
    allowed_pids+="${cgroup_pid} "
  done <<< "$cgroup_pid_inventory"
  [[ "$allowed_pids" == *" ${main_pid} "* ]] || die "rollback MainPID is absent from exact cgroup: ${unit}"
  if [[ "$runtime_kind" == api ]]; then
    while IFS= read -r cgroup_pid; do
      [[ -z "$cgroup_pid" || "$cgroup_pid" == "$main_pid" ]] && continue
      child_count=$((child_count + 1))
      child_pid="$cgroup_pid"
    done <<< "$(LC_ALL=C sort -u <<< "$cgroup_pid_inventory")"
    ((child_count == 1)) || die 'rollback API cgroup must contain exactly the auth edge and one legacy child'
    [[ -r "/proc/${main_pid}/cmdline" && -r "/proc/${child_pid}/cmdline" && -r "/proc/${child_pid}/status" ]] \
      || die 'rollback auth-edge process evidence is unreadable'
    [[ "$(tr '\0' '\n' < "/proc/${main_pid}/cmdline")" == $'/usr/bin/node\n/usr/local/libexec/leetplus/legacy-rollback-auth-edge.mjs\n--release-sha\n'"$LEGACY_SHA" ]] \
      || die 'rollback API MainPID is not the exact auth edge command'
    child_cmdline="$(tr '\0' '\n' < "/proc/${child_pid}/cmdline")"
    [[ "$child_cmdline" == $'/usr/bin/node\n--require\n/usr/local/libexec/leetplus/legacy-rollback-child-loopback.cjs\n'"${release_directory}/apps/api/dist/main.js" ]] \
      || die 'rollback auth edge child command is not exact legacy 7de'
    child_parent="$(awk '$1 == "PPid:" { print $2 }' "/proc/${child_pid}/status")"
    [[ "$child_parent" == "$main_pid" \
      && "$(realpath -e -- "/proc/${child_pid}/cwd")" == "$release_directory" ]] \
      || die 'rollback legacy child is not directly supervised inside the exact release'
  else
    [[ "$(LC_ALL=C sort -u <<< "$cgroup_pid_inventory" | awk 'NF { count += 1 } END { print count + 0 }')" == 1 ]] \
      || die 'rollback Web cgroup contains an unreviewed process'
  fi
  for status_file in /proc/[0-9]*/status; do
    if stable_process_status_has_uid "$status_file" "$uid"; then
      foreign_pid="${status_file#/proc/}"; foreign_pid="${foreign_pid%/status}"
      [[ "$allowed_pids" == *" ${foreign_pid} "* ]] \
        || die "rollback UID owns a process outside its exact unit cgroup: ${expected_user}:${foreign_pid}"
    else
      status_result=$?
      [[ "$status_result" == 1 ]] \
        || die "cannot prove stable complete rollback UID process inventory: ${status_file}"
    fi
  done
  listener_snapshot="$(timeout --foreground --kill-after=2s 5s ss -H -ltnp "sport = :${expected_port}")" \
    || die "rollback listener inventory failed: ${unit}"
  listener_count="$(awk 'END { print NR + 0 }' <<< "$listener_snapshot")"
  listener_address="$(awk 'NR == 1 { print $4 }' <<< "$listener_snapshot")"
  [[ "$listener_count" == 1 && "$listener_address" == "127.0.0.1:${expected_port}" \
    && "$listener_snapshot" == *"pid=${main_pid},"* ]] \
    || die "rollback listener is not exclusively owned by MainPID: ${unit}"
  if [[ "$runtime_kind" == api ]]; then
    listener_snapshot="$(timeout --foreground --kill-after=2s 5s ss -H -ltnp 'sport = :4301')" \
      || die 'rollback legacy-child listener inventory failed'
    listener_count="$(awk 'END { print NR + 0 }' <<< "$listener_snapshot")"
    listener_address="$(awk 'NR == 1 { print $4 }' <<< "$listener_snapshot")"
    [[ "$listener_count" == 1 && "$listener_address" == '127.0.0.1:4301' \
      && "$listener_snapshot" == *"pid=${child_pid},"* ]] \
      || die 'rollback legacy child listener is not exclusively owned on 4301'
  fi
}

release_directory="${release_root}/${LEGACY_SHA}"
[[ -d "$release_directory" && ! -L "$release_directory" ]] || die 'exact rollback release directory is absent or symlinked'
release_directory="$(realpath -e -- "$release_directory")"
[[ "$release_directory" == "$(realpath -e -- "$release_root")/${LEGACY_SHA}" ]] || die 'rollback release path is not exact'
source_marker="${release_directory}/.leetplus-source-sha"
integrity_manifest="${release_directory}/N_MINUS_ONE_SHA256SUMS"
symlink_manifest="${release_directory}/N_MINUS_ONE_SYMLINKS"
runtime_cache="${release_directory}/apps/web/.next/cache"
[[ -f "$source_marker" && ! -L "$source_marker" && -f "$integrity_manifest" && ! -L "$integrity_manifest" \
  && -f "$symlink_manifest" && ! -L "$symlink_manifest" ]] \
  || die 'rollback source/integrity evidence is absent'
[[ "$(tr -d '\r\n' < "$source_marker")" == "$LEGACY_SHA" ]] || die 'rollback source marker is not exact'
[[ -d "$runtime_cache" && ! -L "$runtime_cache" ]] || die 'immutable Web cache target is absent or symlinked'
[[ -z "$(find -P "$release_directory" -xdev -path "$runtime_cache" -prune -o ! -type d ! -type f ! -type l -print -quit)" ]] \
  || die 'rollback release contains a special filesystem entry'
[[ -z "$(find -P "$release_directory" -xdev -path "$runtime_cache" -prune -o -type f -links +1 -print -quit)" ]] \
  || die 'rollback release contains a multiply-linked regular file'
actual_symlinks_unsorted="$(cd -- "$release_directory" \
  && find -P . -xdev -path './apps/web/.next/cache' -prune -o -type l -printf '%P|%l\n')" \
  || die 'rollback symlink inventory failed or returned partial output'
if ! awk -F'|' 'NF == 0 { next } NF != 2 || $1 !~ /^[A-Za-z0-9_.@+\/-]+$/ || $1 ~ /^\// || $2 !~ /^[^|[:space:]]+$/ { exit 1 }' \
  <<< "$actual_symlinks_unsorted"; then
  die 'rollback release contains an unsafe symlink path or target'
fi
while IFS='|' read -r relative_link _; do
  [[ -n "$relative_link" ]] || continue
  link_path="${release_directory}/${relative_link}"
  link_target="$(realpath -e -- "$link_path")" || die 'rollback release contains a dangling symlink'
  case "$link_target" in
    "$release_directory"/*) ;;
    *) die 'rollback release contains a symlink escaping the exact release' ;;
  esac
done <<< "$actual_symlinks_unsorted"
expected_symlinks="$(LC_ALL=C sort "$symlink_manifest")"
actual_symlinks="$(LC_ALL=C sort <<< "$actual_symlinks_unsorted")" \
  || die 'rollback symlink inventory sort failed'
[[ "$expected_symlinks" == "$actual_symlinks" ]] || die 'rollback symlink topology does not match the exact artifact'
(
  cd -- "$release_directory"
  sha256sum --check --strict --quiet N_MINUS_ONE_SHA256SUMS
) || die 'rollback artifact integrity verification failed'

if [[ "$unprivileged_test_mode" == false ]]; then
  [[ -z "$(find -P "$release_directory" -xdev -path "$runtime_cache" -prune -o \
    \( ! -user root -o ! -group leetplus-runtime \) -print -quit)" ]] \
    || die 'rollback release contains non-root/non-runtime-owned content'
  [[ -z "$(find -P "$release_directory" -xdev -path "$runtime_cache" -prune -o \( ! -type l -perm /022 \) -print -quit)" ]] \
    || die 'rollback release is writable by its service identities'
  [[ "$(stat -c '%U:%G:%a' -- "$runtime_cache")" == 'root:leetplus-runtime:550' ]] \
    || die 'host-visible Web cache target is not immutable'
  [[ -z "$(find -P "$runtime_cache" -mindepth 1 -print -quit)" ]] \
    || die 'host-visible Web cache target is not empty'
  findmnt_output="$(findmnt --raw --noheadings --output TARGET)" \
    || die 'host mount inventory failed or returned partial output'
  while IFS= read -r mount_target; do
    case "$mount_target" in
      "$release_directory"|"$release_directory"/*) die "rollback release contains an unreviewed host mount: ${mount_target}" ;;
    esac
  done <<< "$findmnt_output"
fi

if [[ "$unprivileged_test_mode" == false ]]; then
  auth_edge='/usr/local/libexec/leetplus/legacy-rollback-auth-edge.mjs'
  child_preload='/usr/local/libexec/leetplus/legacy-rollback-child-loopback.cjs'
  database_authority_sql='/usr/local/libexec/leetplus/legacy-database-login-fence-authority.sql'
  [[ -f "$auth_edge" && ! -L "$auth_edge" \
    && "$(stat -c '%U:%G:%a:%h' -- "$auth_edge")" == 'root:root:755:1' \
    && "$(sha256sum "$auth_edge" | awk '{ print $1 }')" == "$AUTH_EDGE_SHA256" ]] \
    || die 'installed rollback auth edge byte/identity is not exact'
  [[ -f "$child_preload" && ! -L "$child_preload" \
    && "$(stat -c '%U:%G:%a:%h' -- "$child_preload")" == 'root:root:444:1' \
    && "$(sha256sum "$child_preload" | awk '{ print $1 }')" == "$CHILD_PRELOAD_SHA256" ]] \
    || die 'installed rollback child loopback preload byte/identity is not exact'
  [[ -f "$database_authority_sql" && ! -L "$database_authority_sql" \
    && "$(stat -c '%U:%G:%a:%h' -- "$database_authority_sql")" == 'root:root:444:1' \
    && "$(sha256sum "$database_authority_sql" | awk '{ print $1 }')" == "$DATABASE_AUTHORITY_SQL_SHA256" ]] \
    || die 'installed rollback database authority SQL byte/identity is not exact'
  declare -A exact_unit_files=(
    ["$API_UNIT"]='/etc/systemd/system/leetplus-api-rollback@.service'
    ["$WEB_UNIT"]='/etc/systemd/system/leetplus-web-rollback@.service'
    ["$EGRESS_UNIT"]='/etc/systemd/system/leetplus-rollback-egress.service'
  )
  declare -A exact_unit_digests=(
    ["$API_UNIT"]="$API_UNIT_SHA256"
    ["$WEB_UNIT"]="$WEB_UNIT_SHA256"
    ["$EGRESS_UNIT"]="$EGRESS_UNIT_SHA256"
  )
  for unit in "$API_UNIT" "$WEB_UNIT" "$EGRESS_UNIT"; do
    unit_file="${exact_unit_files[$unit]}"
    [[ -f "$unit_file" && ! -L "$unit_file" \
      && "$(stat -c '%U:%G:%a' -- "$unit_file")" == 'root:root:644' ]] \
      || die "effective rollback unit file is absent, symlinked or unsafe: ${unit}"
    [[ "$(sha256sum "$unit_file" | awk '{ print $1 }')" == "${exact_unit_digests[$unit]}" ]] \
      || die "effective rollback unit bytes are not reviewed: ${unit}"
    [[ "$(systemctl_bounded show --property=FragmentPath --value "$unit")" == "$unit_file" ]] \
      || die "rollback unit fragment path is not exact: ${unit}"
    [[ -z "$(systemctl_bounded show --property=DropInPaths --value "$unit")" ]] \
      || die "rollback unit has an unreviewed effective drop-in: ${unit}"
  done
fi

for unit in "$EGRESS_UNIT" "$API_UNIT" "$WEB_UNIT"; do
  systemctl_bounded is-active --quiet "$unit" || die "rollback unit is not active: ${unit}"
  systemctl_bounded is-enabled --quiet "$unit" || die "rollback unit is not boot-enabled: ${unit}"
done
[[ -x "$egress_verifier" && ! -L "$egress_verifier" ]] || die 'egress verifier is absent or symlinked'
if [[ "$unprivileged_test_mode" == false ]]; then
  timeout --foreground --kill-after=3s 30s "$egress_verifier" --verify \
    || die 'UID-scoped rollback egress fence does not verify'
fi
if [[ "$unprivileged_test_mode" == false ]]; then
  passwd_inventory="$(timeout --foreground --kill-after=2s 10s getent passwd)" \
    || die 'complete passwd inventory failed or timed out'
  group_inventory="$(timeout --foreground --kill-after=2s 10s getent group)" \
    || die 'complete group inventory failed or timed out'
  [[ -n "$passwd_inventory" && -n "$group_inventory" \
    && ${#passwd_inventory} -le 1048576 && ${#group_inventory} -le 1048576 \
    && "$passwd_inventory" != *$'\r'* && "$group_inventory" != *$'\r'* ]] \
    || die 'complete NSS inventory is empty, oversized or noncanonical'
  attest_runtime_secret_group_reverse_sets
  attest_rollback_identity_and_process_boundary api
  attest_rollback_identity_and_process_boundary web
fi

http_2xx() {
  local status
  status="$(timeout 15 curl --disable --noproxy '*' --proto '=http,https' --proto-redir '=http,https' --silent --show-error --max-time 10 --output /dev/null --write-out '%{http_code}' "$1")" || return 1
  [[ "$status" =~ ^2[0-9][0-9]$ ]]
}
http_2xx "${api_base_url}/health" || die 'rollback API loopback health failed'
http_2xx "${web_url}/" || die 'rollback Web loopback health failed'
[[ -f "$authenticated_smoke" && ! -L "$authenticated_smoke" && -x "$authenticated_smoke" ]] \
  || die 'authenticated read-only smoke is absent, symlinked or not executable'
if [[ "$unprivileged_test_mode" == false ]]; then
  timeout --foreground --kill-after=5s 120s env -i \
    PATH=/usr/sbin:/usr/bin:/sbin:/bin HOME=/root \
    /usr/bin/node "$authenticated_smoke" \
    || die 'authenticated read-only rollback smoke failed'
else
  timeout --foreground --kill-after=5s 120s "$authenticated_smoke" "${authenticated_smoke_arguments[@]}" \
    || die 'authenticated read-only rollback smoke failed'
fi

if [[ "$require_drain" == true ]]; then
  [[ -f "$drain_receipt" && ! -L "$drain_receipt" ]] || die 'accepted scheduler drain receipt is absent'
  receipt_root="$(dirname -- "$drain_receipt")"
  if [[ "$unprivileged_test_mode" == false ]]; then
    [[ "$(stat -c '%U:%G:%a' -- "$drain_receipt")" == 'root:root:600' ]] \
      || die 'scheduler drain receipt must be root:root mode 0600'
  fi
  [[ "$(wc -l < "$drain_receipt" | tr -d '[:space:]')" == 15 ]] \
    || die 'scheduler drain receipt schema is not exact'
  [[ -z "$(awk -F= 'NF < 2 || seen[$1]++ { print; exit }' "$drain_receipt")" ]] \
    || die 'scheduler drain receipt contains a malformed or duplicate key'
  grep -F -x 'RECORD_VERSION=2' "$drain_receipt" >/dev/null || die 'scheduler drain receipt version is invalid'
  grep -F -x 'LEGACY_RUNTIME_DRAIN_ACCEPTED=true' "$drain_receipt" >/dev/null \
    || die 'scheduler drain receipt is not accepted'
  grep -F -x "LEGACY_ROLLBACK_SHA=${LEGACY_SHA}" "$drain_receipt" >/dev/null \
    || die 'scheduler drain receipt is bound to another release'
  declare -A receipt_evidence=(
    [ACTIVATION_INTENT_SHA256]="${receipt_root}/activation.intent"
    [UNIT_MANIFEST_SHA256]='/etc/leetplus/legacy-drain-units.conf'
    [PUBLIC_ROUTE_MARKER_SHA256]="${receipt_root}/routed-publicly.marker"
    [CONNECTION_DRAIN_MARKER_SHA256]="${receipt_root}/legacy-connections-drained.marker"
    [NGINX_WORKER_SNAPSHOT_SHA256]="${receipt_root}/legacy-nginx-workers.snapshot"
    [START_FENCE_MARKER_SHA256]="${receipt_root}/legacy-start-fence"
    [DATABASE_LOGIN_FENCE_MARKER_SHA256]="${receipt_root}/legacy-database-login-fence.marker"
    [DRAIN_VERIFIER_OUTPUT_SHA256]="${receipt_root}/drain-verification.new"
  )
  for digest_key in "${!receipt_evidence[@]}"; do
    evidence_path="${receipt_evidence[$digest_key]}"
    [[ -f "$evidence_path" && ! -L "$evidence_path" ]] || die "receipt evidence is absent: ${digest_key}"
    grep -F -x "${digest_key}=$(sha256sum "$evidence_path" | awk '{ print $1 }')" "$drain_receipt" >/dev/null \
      || die "receipt evidence digest mismatch: ${digest_key}"
  done
  grep -F -x "LEGACY_RUNTIME_DRAIN_PROCESS_SNAPSHOT_SHA256=$(sha256sum "${receipt_root}/legacy-processes.snapshot" | awk '{ print $1 }')" \
    "$drain_receipt" >/dev/null || die 'receipt process snapshot digest mismatch'
  [[ -x "$drain_verifier" && ! -L "$drain_verifier" ]] || die 'drain verifier is absent or symlinked'
  timeout 90 "$drain_verifier" "${drain_verifier_arguments[@]}" \
    || die 'live scheduler/session drain re-verification failed'
fi

printf 'LEGACY_ROLLBACK_READY=true\n'
printf 'LEGACY_ROLLBACK_READY_SHA=%s\n' "$LEGACY_SHA"
printf 'LEGACY_ROLLBACK_READY_DRAIN_REQUIRED=%s\n' "$require_drain"
