#!/usr/bin/bash -p
# Non-root fixture for the privileged current-release restored-copy wrapper.
# It stubs only systemd orchestration; signed receipt creation/verification uses
# the repository module and the real CLI --verify-evidence path.

privileged_ci_marker=''
privileged_github_actions_marker=''
privileged_confirmation=''
if ((EUID == 0)); then
  case "$-" in
    *p*) ;;
    *) builtin printf 'current-release wrapper fixture: privileged Bash mode is required\n' >&2; builtin exit 1 ;;
  esac
  privileged_ci_marker="${CI:-}"
  privileged_github_actions_marker="${GITHUB_ACTIONS:-}"
  privileged_confirmation="${CURRENT_WRAPPER_EVIDENCE_ISOLATION_FIXTURE_CONFIRM:-}"
  while IFS= read -r inherited_environment_name; do
    if ! builtin unset "$inherited_environment_name" 2>/dev/null; then
      builtin export -n "$inherited_environment_name" 2>/dev/null \
        || { builtin printf 'current-release wrapper fixture: inherited environment could not be scrubbed\n' >&2; builtin exit 1; }
    fi
  done < <(compgen -e)
  [[ -z "$(compgen -e)" ]] \
    || { builtin printf 'current-release wrapper fixture: inherited environment scrub was incomplete\n' >&2; builtin exit 1; }
  PATH='/usr/sbin:/usr/bin:/sbin:/bin'
  LANG='C'
  LC_ALL='C'
  TZ='UTC'
  export PATH LANG LC_ALL TZ
  privileged_environment_count=0
  while IFS= read -r privileged_environment_name; do
    case "$privileged_environment_name" in
      PATH|LANG|LC_ALL|TZ) ;;
      *) builtin printf 'current-release wrapper fixture: unexpected privileged environment variable: %s\n' \
        "$privileged_environment_name" >&2; builtin exit 1 ;;
    esac
    ((privileged_environment_count += 1))
  done < <(compgen -e)
  ((privileged_environment_count == 4)) \
    || { builtin printf 'current-release wrapper fixture: privileged environment allowlist is incomplete\n' >&2; builtin exit 1; }
fi
readonly privileged_ci_marker privileged_github_actions_marker privileged_confirmation

set -euo pipefail
IFS=$'\n\t'
umask 0077
if ((EUID != 0)); then
  export LANG=C LC_ALL=C
fi

fixture_script_path="${BASH_SOURCE[0]}"
case "$fixture_script_path" in
  */*) fixture_script_directory="${fixture_script_path%/*}" ;;
  *) fixture_script_directory='.' ;;
esac
readonly REPOSITORY_ROOT="$(cd -- "${fixture_script_directory}/../.." && pwd -P)"
unset fixture_script_path fixture_script_directory
readonly WRAPPER="${REPOSITORY_ROOT}/docs/deployment/production-artifact/run-current-release-restored-copy-acceptance.sh"
readonly CLI="${REPOSITORY_ROOT}/packages/database/scripts/current-release-restored-copy-runtime-acceptance.cli.mjs"
readonly MODULE="${REPOSITORY_ROOT}/packages/database/scripts/current-release-restored-copy-runtime-acceptance.mjs"
readonly RELEASE_SHA='0123456789abcdef0123456789abcdef01234567'
readonly MIGRATION_HEAD='20260821010101_wrapper_fixture'
readonly SYSTEM_IDENTIFIER='7345521890044432101'
readonly HMAC_SECRET='wrapper-fixture-hmac-secret-0123456789abcdef'
readonly LOGIN_PASSWORD='wrapper-fixture-password-never-log'
readonly DATABASE_URL='postgresql://fixture:wrapper-db-secret@127.0.0.1:55432/leetplus_restored_wrapper'
readonly LOGIN_EMAIL='wrapper-owner-secret@example.invalid'

die() {
  printf 'current-release wrapper fixture: %s\n' "$*" >&2
  exit 1
}

if ((EUID != 0)); then
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*)
      printf 'CURRENT_RELEASE_WRAPPER_FIXTURE_SKIPPED_NON_POSIX_MODES=true\n'
      exit 0
      ;;
  esac
fi

run_privileged_evidence_isolation_fixture() {
  fixture_user='leetplus-evidence-fixture'
  fixture_group='leetplus-evidence-fixture'
  fixture_runtime_group='leetplus-evidence-runtime'
  duplicate_uid_user='leetplus-ev-dupuid'
  duplicate_uid_group='leetplus-ev-dupuid'
  duplicate_gid_group='leetplus-ev-dupgid'
  duplicate_runtime_gid_group='leetplus-ev-duprun'
  foreign_primary_user='leetplus-ev-primary'
  privileged_root=''
  fixture_gid=''
  fixture_uid=''
  fixture_runtime_gid=''
  node_executable=''
  local evidence_parent sibling_directory sibling_receipt current_directory current_receipt
  local unit_evidence_parent unit_current_directory unit_current_receipt
  local main_properties verify_properties main_exec_start verify_exec_start
  local fixture_artifact_root fixture_working_directory fixture_credential_file attempt
  local fixture_cli child_policy_source_file child_policy_eval child_policy_systemd_eval
  local child_policy_sha256
  local foreign_control_group
  # systemctl deliberately redacts credential sources; the command and child
  # independently attest the source path and delivered credential bytes.
  local -r effective_load_credential='[unprintable]'
  local operation_id='evidence01'
  local main_unit="leetplus-current-release-acceptance-evidence01.service"
  local verify_unit="leetplus-current-release-verify-evidence01.service"
  local drain_unit="leetplus-current-release-drain-evidence01.service"
  local replay_unit="leetplus-current-release-replay-evidence01fixture.service"
  local foreign_process_unit="leetplus-evidence-foreign-process-$$.service"
  created_group=false
  created_runtime_group=false
  created_user=false
  created_duplicate_uid_user=false
  created_duplicate_uid_group=false
  created_duplicate_gid_group=false
  created_duplicate_runtime_gid_group=false
  created_foreign_primary_user=false
  live_units=("$main_unit" "$verify_unit" "$drain_unit" "$replay_unit" "$foreign_process_unit")
  local privileged_unset_environment='CURRENT_RELEASE_RESTORED_DATABASE_URL CURRENT_RELEASE_EVIDENCE_HMAC_KEY CURRENT_RELEASE_LOGIN_EMAIL CURRENT_RELEASE_LOGIN_PASSWORD BASH_ENV ENV SGX_AESM_ADDR NODE_OPTIONS NODE_PATH NODE_EXTRA_CA_CERTS NODE_DEBUG NODE_V8_COVERAGE NODE_COMPILE_CACHE SSLKEYLOGFILE LD_PRELOAD LD_LIBRARY_PATH LD_AUDIT GCONV_PATH LOCPATH OPENSSL_CONF OPENSSL_MODULES GLIBC_TUNABLES MALLOC_CHECK_ MALLOC_PERTURB_ HTTP_PROXY HTTPS_PROXY FTP_PROXY ALL_PROXY NO_PROXY http_proxy https_proxy ftp_proxy all_proxy no_proxy NODE_USE_ENV_PROXY CURL_HOME CURL_CA_BUNDLE SSL_CERT_FILE SSL_CERT_DIR TMP TMPDIR TEMP XDG_CONFIG_HOME XDG_CACHE_HOME NPM_CONFIG_USERCONFIG npm_config_userconfig NPM_CONFIG_GLOBALCONFIG npm_config_globalconfig NPM_CONFIG_NODE_OPTIONS npm_config_node_options NPM_CONFIG_SCRIPT_SHELL npm_config_script_shell PNPM_HOME COREPACK_HOME GIT_CONFIG_GLOBAL GIT_CONFIG_SYSTEM'

  [[ "$#" == 0 ]] || die 'privileged evidence-isolation fixture accepts no extra arguments'
  readonly privileged_awk='/usr/bin/mawk'
  readonly privileged_chmod='/usr/bin/chmod'
  readonly privileged_chown='/usr/bin/chown'
  readonly privileged_find='/usr/bin/find'
  readonly privileged_getent='/usr/bin/getent'
  readonly privileged_groupadd='/usr/sbin/groupadd'
  readonly privileged_groupdel='/usr/sbin/groupdel'
  readonly privileged_id='/usr/bin/id'
  readonly privileged_mkdir='/usr/bin/mkdir'
  readonly privileged_mktemp='/usr/bin/mktemp'
  readonly privileged_node='/usr/local/libexec/leetplus/current-wrapper-fixture-node22'
  readonly privileged_ps='/usr/bin/ps'
  readonly privileged_realpath='/usr/bin/realpath'
  readonly privileged_rmdir='/usr/bin/rmdir'
  readonly privileged_sleep='/usr/bin/sleep'
  readonly privileged_stat='/usr/bin/stat'
  readonly privileged_systemctl='/usr/bin/systemctl'
  readonly privileged_systemd_run='/usr/bin/systemd-run'
  readonly privileged_timeout='/usr/bin/timeout'
  readonly privileged_tr='/usr/bin/tr'
  readonly privileged_useradd='/usr/sbin/useradd'
  readonly privileged_userdel='/usr/sbin/userdel'
  readonly privileged_usermod='/usr/sbin/usermod'

  [[ "$privileged_ci_marker" == true && "$privileged_github_actions_marker" == true ]] \
    || die 'privileged evidence-isolation fixture is restricted to GitHub Actions CI'
  [[ "$privileged_confirmation" == \
    'run-root-current-wrapper-evidence-isolation-fixture' ]] \
    || die 'privileged evidence-isolation fixture confirmation is absent'
  ((EUID == 0)) || die 'privileged evidence-isolation fixture must run as root'

  assert_trusted_privileged_tool() {
    local tool="$1" ancestor resolved mode
    [[ "$tool" == /* && -f "$tool" && ! -L "$tool" && -x "$tool" ]] \
      || die "privileged evidence-isolation tool is absent, symlinked or non-executable: ${tool}"
    resolved="$($privileged_realpath -e -- "$tool")"
    [[ "$resolved" == "$tool" ]] \
      || die "privileged evidence-isolation tool is non-canonical: ${tool}"
    mode="$($privileged_stat -c '%u:%a' -- "$tool")"
    [[ "${mode%%:*}" == 0 ]] \
      || die "privileged evidence-isolation tool is not root-owned: ${tool}"
    (( (8#${mode#*:} & 8#022) == 0 )) \
      || die "privileged evidence-isolation tool is group/other-writable: ${tool}"
    ancestor="${tool%/*}"
    while :; do
      [[ -d "$ancestor" && ! -L "$ancestor" \
        && "$($privileged_realpath -e -- "$ancestor")" == "$ancestor" \
        && "$($privileged_stat -c '%u' -- "$ancestor")" == 0 \
        && -z "$($privileged_find -P "$ancestor" -maxdepth 0 -perm /022 -print -quit)" ]] \
        || die "privileged evidence-isolation tool ancestor is untrusted: ${ancestor}"
      [[ "$ancestor" == / ]] && break
      ancestor="${ancestor%/*}"
      [[ -n "$ancestor" ]] || ancestor='/'
    done
  }

  for privileged_tool in \
    "$privileged_awk" "$privileged_chmod" "$privileged_chown" "$privileged_find" "$privileged_getent" \
    "$privileged_groupadd" "$privileged_groupdel" "$privileged_id" "$privileged_mkdir" \
    "$privileged_mktemp" "$privileged_node" "$privileged_ps" "$privileged_realpath" \
    "$privileged_rmdir" "$privileged_sleep" "$privileged_stat" "$privileged_systemctl" \
    "$privileged_systemd_run" "$privileged_timeout" "$privileged_tr" \
    "$privileged_useradd" "$privileged_userdel" "$privileged_usermod"; do
    assert_trusted_privileged_tool "$privileged_tool"
  done
  [[ "$($privileged_ps -p 1 -o comm= | $privileged_tr -d ' ')" == systemd ]] \
    || die 'privileged evidence-isolation fixture requires a real systemd manager'
  "$privileged_getent" passwd "$fixture_user" >/dev/null 2>&1 \
    && die 'privileged evidence-isolation fixture user already exists'
  "$privileged_getent" group "$fixture_group" >/dev/null 2>&1 \
    && die 'privileged evidence-isolation fixture group already exists'
  "$privileged_getent" group "$fixture_runtime_group" >/dev/null 2>&1 \
    && die 'privileged evidence-isolation fixture runtime group already exists'
  node_executable="$privileged_node"
  [[ "$($node_executable -p 'process.versions.node.split(".")[0]')" == 22 ]] \
    || die 'privileged evidence-isolation fixture requires Node major 22'

  fixture_space_set_equal() {
    local left="$1" right="$2" token
    local -a left_tokens=() right_tokens=()
    local -A left_set=() right_set=()
    if [[ -n "$left" ]]; then IFS=' ' read -r -a left_tokens <<< "$left"; IFS=$'\n\t'; fi
    if [[ -n "$right" ]]; then IFS=' ' read -r -a right_tokens <<< "$right"; IFS=$'\n\t'; fi
    for token in "${left_tokens[@]}"; do
      [[ -n "$token" && -z "${left_set[$token]+present}" ]] || return 1
      left_set[$token]=1
    done
    for token in "${right_tokens[@]}"; do
      [[ -n "$token" && -z "${right_set[$token]+present}" ]] || return 1
      right_set[$token]=1
    done
    [[ "${#left_set[@]}" == "${#right_set[@]}" ]] || return 1
    for token in "${!left_set[@]}"; do
      [[ "${right_set[$token]+present}" == present ]] || return 1
    done
  }

  assert_exact_effective_properties() {
    local output="$1" expected_pair key value count=0
    shift
    local -A expected=() actual=()
    if [[ "$output" != EnvironmentFiles=* \
      && "$output" != *$'\nEnvironmentFiles='* ]]; then
      # systemctl omits an empty EnvironmentFiles a(sb) property even with --all.
      output+=$'\nEnvironmentFiles='
    fi
    [[ "${#output}" -le 8192 && ! "$output" =~ $'\r' ]] \
      || die 'privileged evidence-isolation effective property output is unbounded'
    for expected_pair in "$@"; do
      key="${expected_pair%%=*}"
      value="${expected_pair#*=}"
      [[ "$key" =~ ^(InaccessiblePaths|BindPaths|BindReadOnlyPaths|ReadWritePaths|ReadOnlyPaths|User|Group|SupplementaryGroups|DynamicUser|Id|ControlGroup|MainPID|ActiveState|SubState|Result|ExecMainStatus|LoadCredential|WorkingDirectory|Environment|EnvironmentFiles|PassEnvironment|SetLoginEnvironment|UnsetEnvironment|NoNewPrivileges|CapabilityBoundingSet|AmbientCapabilities|IPAddressDeny|IPAddressAllow|Delegate|MemoryPressureWatch|PrivateTmp|PrivateDevices|ProtectSystem|ProtectHome|ProtectProc|ProcSubset|ProtectKernelTunables|ProtectKernelModules|ProtectKernelLogs|ProtectControlGroups|ProtectClock|ProtectHostname|LockPersonality|RestrictRealtime|RestrictSUIDSGID|SystemCallArchitectures|RestrictAddressFamilies|RootDirectory|RootImage|KillMode|TimeoutStopUSec|UMask|StandardOutput|StandardError|RuntimeMaxUSec|RemainAfterExit)$ \
        && -z "${expected[$key]+present}" ]] \
        || die 'privileged evidence-isolation expected property set is malformed'
      expected[$key]="$value"
    done
    while IFS='=' read -r key value; do
      [[ -n "$key" && -n "${expected[$key]+present}" \
        && -z "${actual[$key]+present}" && ! "$value" =~ [[:cntrl:]] ]] \
        || die 'privileged evidence-isolation effective property set is malformed'
      actual[$key]="$value"
      ((count += 1))
    done <<< "$output"
    [[ "$count" == "${#expected[@]}" ]] \
      || die 'privileged evidence-isolation effective property count is not exact'
    for key in "${!expected[@]}"; do
      [[ "${actual[$key]+present}" == present ]] \
        || die "privileged evidence-isolation effective property is missing: ${key}"
      case "$key" in
        Environment|UnsetEnvironment|SupplementaryGroups|IPAddressDeny|IPAddressAllow|RestrictAddressFamilies|ReadOnlyPaths)
          fixture_space_set_equal "${actual[$key]}" "${expected[$key]}" \
            || die "privileged evidence-isolation effective property differs: ${key}"
          ;;
        *)
          [[ "${actual[$key]}" == "${expected[$key]}" ]] \
            || die "privileged evidence-isolation effective property differs: ${key}"
          ;;
      esac
    done
  }

  wait_for_fixture_unit_success() {
    local unit="$1" attempt active_state sub_state result status exec_code exec_start_tail
    local policy_diagnostic='absent'
    for attempt in {1..100}; do
      active_state="$("$privileged_systemctl" show "$unit" --value --property=ActiveState 2>/dev/null || true)"
      sub_state="$("$privileged_systemctl" show "$unit" --value --property=SubState 2>/dev/null || true)"
      result="$("$privileged_systemctl" show "$unit" --value --property=Result 2>/dev/null || true)"
      status="$("$privileged_systemctl" show "$unit" --value --property=ExecMainStatus 2>/dev/null || true)"
      exec_code="$("$privileged_systemctl" show "$unit" --value --property=ExecMainCode 2>/dev/null || true)"
      if [[ "$active_state" == active && "$sub_state" == exited \
        && "$result" == success && "$status" == 0 ]]; then
        return 0
      fi
      if [[ "$active_state" == failed || "$result" =~ ^(exit-code|signal|timeout|core-dump)$ ]]; then
        break
      fi
      "$privileged_sleep" 0.05
    done
    exec_start_tail="$("$privileged_systemctl" show "$unit" --value \
      --property=ExecStart 2>/dev/null || true)"
    exec_start_tail="${exec_start_tail##*--leetplus-child-policy-v1}"
    exec_start_tail="${exec_start_tail:0:2048}"
    if [[ -f "${current_directory}/child-policy-diagnostic.json" \
      && ! -L "${current_directory}/child-policy-diagnostic.json" ]]; then
      policy_diagnostic="$(< "${current_directory}/child-policy-diagnostic.json")"
      policy_diagnostic="${policy_diagnostic:0:4096}"
    fi
    die "privileged evidence-isolation unit did not finish successfully: ${unit}; ActiveState=${active_state}; SubState=${sub_state}; Result=${result}; ExecMainCode=${exec_code}; ExecMainStatus=${status}; ChildPolicy=${policy_diagnostic}; ChildArgTail=${exec_start_tail}"
  }

  assert_empty_fixture_unit_cgroup() {
    local unit="$1"
    "$privileged_node" --input-type=module - "/sys/fs/cgroup/system.slice/${unit}/cgroup.procs" <<'NODE'
import fs from "node:fs";
const file = process.argv[2];
let descriptor;
try {
  descriptor = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
} catch (error) {
  // Once a successful oneshot has no processes, systemd may prune its empty
  // cgroup. Absence at this point is equivalent to an empty cgroup.
  if (error?.code === "ENOENT") process.exit(0);
  throw error;
}
try {
  const chunks = [];
  let total = 0;
  for (;;) {
    const chunk = Buffer.alloc(256);
    const count = fs.readSync(descriptor, chunk, 0, chunk.length, null);
    if (count === 0) break;
    total += count;
    if (total > 4096) process.exit(74);
    chunks.push(chunk.subarray(0, count));
  }
  if (Buffer.concat(chunks, total).length !== 0) process.exit(75);
} finally {
  fs.closeSync(descriptor);
}
NODE
  }

  assert_privileged_phase_effective_policy() {
    local phase="$1" unit="$2" expected_bind='' expected_bind_read_only=''
    local expected_read_only="$fixture_artifact_root" expected_read_write=''
    local expected_runtime='30s' output exec_start
    case "$phase" in
      main)
        expected_bind="${current_directory}:${unit_current_directory}"
        expected_read_write="$unit_current_directory"
        expected_runtime='14min'
        ;;
      verify|replay)
        expected_bind_read_only="${current_directory}:${unit_current_directory}"
        expected_read_only+=" ${unit_current_directory}"
        ;;
      drain) ;;
      *) die "privileged fixture phase is invalid: ${phase}" ;;
    esac
    output="$("$privileged_systemctl" show "$unit" --all --no-pager \
      --property=InaccessiblePaths --property=BindPaths --property=BindReadOnlyPaths \
      --property=ReadWritePaths --property=ReadOnlyPaths --property=User --property=Group \
      --property=SupplementaryGroups --property=DynamicUser --property=Id --property=ControlGroup \
      --property=MainPID --property=ActiveState --property=SubState \
      --property=Result --property=ExecMainStatus --property=LoadCredential \
      --property=WorkingDirectory --property=Environment --property=EnvironmentFiles \
      --property=PassEnvironment --property=SetLoginEnvironment \
      --property=UnsetEnvironment --property=NoNewPrivileges \
      --property=CapabilityBoundingSet --property=AmbientCapabilities \
      --property=IPAddressDeny --property=IPAddressAllow --property=Delegate \
      --property=MemoryPressureWatch \
      --property=PrivateTmp --property=PrivateDevices --property=ProtectSystem --property=ProtectHome \
      --property=ProtectProc --property=ProcSubset --property=ProtectKernelTunables \
      --property=ProtectKernelModules --property=ProtectKernelLogs \
      --property=ProtectControlGroups --property=ProtectClock --property=ProtectHostname \
      --property=LockPersonality --property=RestrictRealtime --property=RestrictSUIDSGID \
      --property=SystemCallArchitectures --property=RestrictAddressFamilies \
      --property=RootDirectory --property=RootImage \
      --property=KillMode --property=TimeoutStopUSec --property=UMask \
      --property=StandardOutput --property=StandardError --property=RuntimeMaxUSec \
      --property=RemainAfterExit)"
    assert_exact_effective_properties "$output" \
      "InaccessiblePaths=${evidence_parent}" \
      "BindPaths=${expected_bind}" \
      "BindReadOnlyPaths=${expected_bind_read_only}" \
      "ReadWritePaths=${expected_read_write}" \
      "ReadOnlyPaths=${expected_read_only}" \
      "User=${fixture_user}" \
      "Group=${fixture_group}" \
      "SupplementaryGroups=${fixture_runtime_group}" \
      'DynamicUser=no' \
      "LoadCredential=${effective_load_credential}" \
      "WorkingDirectory=${fixture_working_directory}" \
      "Environment=PATH=/usr/sbin:/usr/bin:/sbin:/bin LANG=C LC_ALL=C TZ=UTC SHELL=/usr/sbin/nologin LEETPLUS_CHILD_POLICY_SHA256=${child_policy_sha256}" \
      'EnvironmentFiles=' \
      'PassEnvironment=' \
      'SetLoginEnvironment=yes' \
      "UnsetEnvironment=${privileged_unset_environment}" \
      'NoNewPrivileges=yes' \
      'CapabilityBoundingSet=' \
      'AmbientCapabilities=' \
      'IPAddressDeny=0.0.0.0/0 ::/0' \
      'IPAddressAllow=127.0.0.0/8 ::1/128' \
      'Delegate=no' \
      'MemoryPressureWatch=skip' \
      'PrivateTmp=yes' \
      'PrivateDevices=yes' \
      'ProtectSystem=strict' \
      'ProtectHome=yes' \
      'ProtectProc=invisible' \
      'ProcSubset=pid' \
      'ProtectKernelTunables=yes' \
      'ProtectKernelModules=yes' \
      'ProtectKernelLogs=yes' \
      'ProtectControlGroups=yes' \
      'ProtectClock=yes' \
      'ProtectHostname=yes' \
      'LockPersonality=yes' \
      'RestrictRealtime=yes' \
      'RestrictSUIDSGID=yes' \
      'SystemCallArchitectures=native' \
      'RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6' \
      'RootDirectory=' \
      'RootImage=' \
      'KillMode=control-group' \
      'TimeoutStopUSec=20s' \
      'UMask=0077' \
      'StandardOutput=null' \
      'StandardError=null' \
      "RuntimeMaxUSec=${expected_runtime}" \
      'RemainAfterExit=yes' \
      "Id=${unit}" \
      'ControlGroup=' \
      'MainPID=0' \
      'ActiveState=active' \
      'SubState=exited' \
      'Result=success' \
      'ExecMainStatus=0'
    exec_start="$("$privileged_systemctl" show "$unit" --value --property=ExecStart)"
    [[ "${exec_start#*'{ path='}" != "$exec_start" \
      && "$exec_start" == *"path=${node_executable}"* \
      && "$exec_start" == *'--leetplus-child-policy-v1'* \
      && "$exec_start" == *" ${phase} fixture "* ]] \
      || die "privileged ${phase} effective ExecStart is not the exact child contract"
  }

  fixture_nss_identity_is_exact() {
    local passwd_record group_record runtime_group_record uid_record gid_record runtime_gid_record
    local uid_records gid_records
    local runtime_gid_records primary_gid_users group_output group_id
    local -a group_ids=()
    local -A group_set=()
    passwd_record="$($privileged_getent passwd "$fixture_user")" || return 1
    group_record="$($privileged_getent group "$fixture_group")" || return 1
    runtime_group_record="$($privileged_getent group "$fixture_runtime_group")" || return 1
    uid_record="$($privileged_getent passwd "$fixture_uid")" || return 1
    gid_record="$($privileged_getent group "$fixture_gid")" || return 1
    runtime_gid_record="$($privileged_getent group "$fixture_runtime_gid")" || return 1
    [[ "$passwd_record" == "${fixture_user}:x:${fixture_uid}:${fixture_gid}::/nonexistent:/usr/sbin/nologin" \
      && "$group_record" == "${fixture_group}:x:${fixture_gid}:" \
      && "$runtime_group_record" == "${fixture_runtime_group}:x:${fixture_runtime_gid}:${fixture_user}" ]] \
      || return 1
    uid_records="$($privileged_getent passwd | "$privileged_awk" -F: -v expected="$fixture_uid" \
      'NR > 1000000 { exit 91 } NF != 7 { exit 92 } $3 == expected { print $0 }')" \
      || return 1
    gid_records="$($privileged_getent group | "$privileged_awk" -F: -v expected="$fixture_gid" \
      'NR > 1000000 { exit 91 } NF != 4 { exit 92 } $3 == expected { print $0 }')" \
      || return 1
    runtime_gid_records="$($privileged_getent group | "$privileged_awk" -F: -v expected="$fixture_runtime_gid" \
      'NR > 1000000 { exit 91 } NF != 4 { exit 92 } $3 == expected { print $0 }')" \
      || return 1
    primary_gid_users="$($privileged_getent passwd | "$privileged_awk" -F: -v expected="$fixture_gid" \
      'NR > 1000000 { exit 91 } NF != 7 { exit 92 } $4 == expected { print $1 }')" \
      || return 1
    group_output="$($privileged_id -G "$fixture_user")" || return 1
    IFS=' ' read -r -a group_ids <<< "$group_output"
    IFS=$'\n\t'
    for group_id in "${group_ids[@]}"; do
      [[ "$group_id" =~ ^[1-9][0-9]*$ ]] || return 1
      group_set[$group_id]=1
    done
    [[ "$uid_record" == "$passwd_record" && "$gid_record" == "$group_record" \
      && "$runtime_gid_record" == "$runtime_group_record" \
      && "$uid_records" == "$passwd_record" && "$gid_records" == "$group_record" \
      && "$runtime_gid_records" == "$runtime_group_record" \
      && "$primary_gid_users" == "$fixture_user" \
      && "${#group_set[@]}" == 2 \
      && "${group_set[$fixture_gid]+present}" == present \
      && "${group_set[$fixture_runtime_gid]+present}" == present \
      && ! -e /nonexistent && ! -L /nonexistent ]] || return 1
  }

  fixture_uid_processes_are_absent() {
    "$privileged_node" --input-type=module - "$fixture_uid" <<'NODE'
import fs from "node:fs";
const uid = process.argv[2];
if (!/^[1-9][0-9]*$/u.test(uid)) process.exit(64);
let count = 0;
for (const entry of fs.readdirSync("/proc")) {
  if (!/^[1-9][0-9]*$/u.test(entry)) continue;
  if (++count > 4194304) process.exit(65);
  let status;
  try { status = fs.readFileSync(`/proc/${entry}/status`, "utf8"); }
  catch (error) { if (error?.code === "ENOENT") continue; throw error; }
  if (status.length > 262144) process.exit(66);
  const match = status.match(/^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/mu);
  if (!match) process.exit(67);
  if (match.slice(1).includes(uid)) process.exit(68);
}
NODE
  }

  cleanup_privileged_evidence_isolation() {
    local unit
    set +e
    for unit in "${live_units[@]}"; do
      "$privileged_timeout" --foreground --kill-after=2s 8s \
        "$privileged_systemctl" stop "$unit" >/dev/null 2>&1
      "$privileged_systemctl" reset-failed "$unit" >/dev/null 2>&1
    done
    if [[ "$created_foreign_primary_user" == true ]]; then
      "$privileged_userdel" "$foreign_primary_user"
    fi
    if [[ "$created_duplicate_uid_user" == true ]]; then
      "$privileged_userdel" "$duplicate_uid_user"
    fi
    if [[ "$created_duplicate_gid_group" == true ]]; then
      if "$privileged_getent" group "$duplicate_gid_group" >/dev/null 2>&1; then
        "$privileged_groupdel" --force "$duplicate_gid_group"
      fi
    fi
    if [[ "$created_duplicate_runtime_gid_group" == true ]]; then
      if "$privileged_getent" group "$duplicate_runtime_gid_group" >/dev/null 2>&1; then
        "$privileged_groupdel" --force "$duplicate_runtime_gid_group"
      fi
    fi
    if [[ "$created_duplicate_uid_group" == true ]]; then
      "$privileged_groupdel" "$duplicate_uid_group"
    fi
    if [[ "$created_user" == true ]]; then "$privileged_userdel" "$fixture_user"; fi
    if [[ "$created_runtime_group" == true ]]; then
      "$privileged_groupdel" "$fixture_runtime_group"
    fi
    if [[ "$created_group" == true ]] \
      && "$privileged_getent" group "$fixture_group" >/dev/null 2>&1; then
      "$privileged_groupdel" "$fixture_group"
    fi
    if [[ "$privileged_root" == /run/leetplus-current-evidence-isolation.* \
      && -d "$privileged_root" && ! -L "$privileged_root" ]]; then
      "$privileged_find" -P "$privileged_root" -xdev -depth -mindepth 1 -delete
      "$privileged_rmdir" -- "$privileged_root"
    fi
  }
  trap cleanup_privileged_evidence_isolation EXIT

  "$privileged_groupadd" --system "$fixture_group"
  created_group=true
  "$privileged_groupadd" --system "$fixture_runtime_group"
  created_runtime_group=true
  "$privileged_useradd" --system --gid "$fixture_group" --home-dir /nonexistent \
    --shell /usr/sbin/nologin --no-create-home --groups "$fixture_runtime_group" "$fixture_user"
  created_user=true
  fixture_uid="$("$privileged_id" -u "$fixture_user")"
  fixture_gid="$("$privileged_id" -g "$fixture_user")"
  fixture_runtime_gid="$("$privileged_getent" group "$fixture_runtime_group" \
    | "$privileged_awk" -F: '{print $3}')"
  [[ "$fixture_uid" =~ ^[1-9][0-9]*$ && "$fixture_gid" =~ ^[1-9][0-9]*$ \
    && "$fixture_runtime_gid" =~ ^[1-9][0-9]*$ && "$fixture_gid" != "$fixture_runtime_gid" ]] \
    || die 'privileged fixture service IDs are invalid'
  fixture_nss_identity_is_exact \
    || die 'privileged fixture service identity is not exact after creation'

  "$privileged_groupadd" --system "$duplicate_uid_group"
  created_duplicate_uid_group=true
  "$privileged_useradd" --system --non-unique --uid "$fixture_uid" \
    --gid "$duplicate_uid_group" --home-dir /nonexistent --shell /usr/sbin/nologin \
    --no-create-home "$duplicate_uid_user"
  created_duplicate_uid_user=true
  if fixture_nss_identity_is_exact; then
    die 'privileged fixture accepted a duplicate service UID alias'
  fi
  "$privileged_userdel" "$duplicate_uid_user"
  created_duplicate_uid_user=false
  if "$privileged_getent" group "$duplicate_uid_group" >/dev/null 2>&1; then
    "$privileged_groupdel" "$duplicate_uid_group"
  fi
  created_duplicate_uid_group=false
  fixture_nss_identity_is_exact || die 'privileged fixture UID cleanup was incomplete'

  "$privileged_groupadd" --system --non-unique --gid "$fixture_gid" "$duplicate_gid_group"
  created_duplicate_gid_group=true
  if fixture_nss_identity_is_exact; then
    die 'privileged fixture accepted a duplicate service GID alias'
  fi
  "$privileged_groupdel" --force "$duplicate_gid_group"
  created_duplicate_gid_group=false
  fixture_nss_identity_is_exact || die 'privileged fixture GID cleanup was incomplete'

  "$privileged_groupadd" --system --non-unique --gid "$fixture_runtime_gid" \
    "$duplicate_runtime_gid_group"
  created_duplicate_runtime_gid_group=true
  if fixture_nss_identity_is_exact; then
    die 'privileged fixture accepted a duplicate runtime GID alias'
  fi
  "$privileged_groupdel" --force "$duplicate_runtime_gid_group"
  created_duplicate_runtime_gid_group=false
  fixture_nss_identity_is_exact || die 'privileged fixture runtime-GID cleanup was incomplete'

  "$privileged_useradd" --system --gid "$fixture_group" --home-dir /nonexistent \
    --shell /usr/sbin/nologin --no-create-home "$foreign_primary_user"
  created_foreign_primary_user=true
  if fixture_nss_identity_is_exact; then
    die 'privileged fixture accepted a foreign primary-GID user'
  fi
  "$privileged_userdel" "$foreign_primary_user"
  created_foreign_primary_user=false
  fixture_nss_identity_is_exact || die 'privileged fixture primary-GID cleanup was incomplete'

  "$privileged_usermod" --home /run "$fixture_user"
  if fixture_nss_identity_is_exact; then
    die 'privileged fixture accepted a service home other than /nonexistent'
  fi
  "$privileged_usermod" --home /nonexistent "$fixture_user"
  "$privileged_usermod" --shell /bin/sh "$fixture_user"
  if fixture_nss_identity_is_exact; then
    die 'privileged fixture accepted an interactive service shell'
  fi
  "$privileged_usermod" --shell /usr/sbin/nologin "$fixture_user"
  fixture_nss_identity_is_exact || die 'privileged fixture home/shell restoration was incomplete'

  fixture_uid_processes_are_absent \
    || die 'privileged fixture service UID was already executing before the process negative'
  "$privileged_systemd_run" --quiet "--unit=${foreign_process_unit}" \
    "--property=User=${fixture_user}" "--property=Group=${fixture_group}" \
    --property=SupplementaryGroups= --property=NoNewPrivileges=yes \
    --property=StandardOutput=null --property=StandardError=null \
    -- "$privileged_sleep" 60
  for attempt in {1..100}; do
    if "$privileged_systemctl" is-active --quiet "$foreign_process_unit"; then break; fi
    "$privileged_sleep" 0.05
  done
  "$privileged_systemctl" is-active --quiet "$foreign_process_unit" \
    || die 'privileged foreign same-UID process fixture did not start'
  foreign_control_group="$("$privileged_systemctl" show "$foreign_process_unit" \
    --value --property=ControlGroup)"
  [[ "$foreign_control_group" == "/system.slice/${foreign_process_unit}" ]] \
    || die 'privileged foreign same-UID process entered an unexpected cgroup'
  if fixture_uid_processes_are_absent; then
    die 'privileged fixture accepted a foreign same-UID process'
  fi
  "$privileged_timeout" --foreground --kill-after=2s 8s \
    "$privileged_systemctl" stop "$foreign_process_unit"
  "$privileged_timeout" --foreground --kill-after=2s 8s \
    "$privileged_systemctl" reset-failed "$foreign_process_unit" >/dev/null 2>&1 || true
  for attempt in {1..100}; do
    if fixture_uid_processes_are_absent; then break; fi
    "$privileged_sleep" 0.05
  done
  fixture_uid_processes_are_absent \
    || die 'privileged foreign same-UID process did not drain'
  fixture_nss_identity_is_exact \
    || die 'privileged fixture identity changed during hostile negatives'
  privileged_root="$("$privileged_mktemp" -d /run/leetplus-current-evidence-isolation.XXXXXXXX)"
  case "$privileged_root" in /run/leetplus-current-evidence-isolation.*) ;; *) die 'unsafe privileged fixture root' ;; esac
  "$privileged_chmod" 0711 "$privileged_root"
  fixture_artifact_root="${privileged_root}/artifact"
  fixture_working_directory="${fixture_artifact_root}/packages/database"
  fixture_cli="${fixture_working_directory}/scripts/current-release-restored-copy-runtime-acceptance.cli.mjs"
  fixture_credential_file="${privileged_root}/credential.json"
  "$privileged_mkdir" -p -- "${fixture_working_directory}/scripts" \
    "${fixture_working_directory}/node_modules/pg"
  cat > "$fixture_cli" <<'NODE'
import fs from "node:fs";

export async function main(arguments_) {
  const values = new Map();
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    const value = arguments_[index + 1];
    if (!key?.startsWith("--fixture-") || value === undefined || values.has(key)) return 81;
    values.set(key, value);
  }
  const phase = values.get("--fixture-phase");
  const receipt = values.get("--fixture-receipt");
  const hostCurrent = values.get("--fixture-host-current");
  const hostSibling = values.get("--fixture-host-sibling");
  if (!/^(main|verify|replay)$/u.test(phase ?? "") ||
      ![receipt, hostCurrent, hostSibling].every((value) => value?.startsWith("/"))) return 82;
  try { fs.readdirSync(hostCurrent); return 83; }
  catch (error) { if (!["EACCES", "ENOENT"].includes(error?.code)) return 84; }
  try { fs.readFileSync(hostSibling); return 83; }
  catch (error) { if (!["EACCES", "ENOENT"].includes(error?.code)) return 84; }
  if (phase === "main") {
    const descriptor = fs.openSync(receipt,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
    fs.writeFileSync(descriptor, "CURRENT_EVIDENCE_BOUND_ONLY\n", "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    const directory = fs.openSync(new URL(".", new URL(`file://${receipt}`)), fs.constants.O_RDONLY);
    fs.fsyncSync(directory);
    fs.closeSync(directory);
  } else if (fs.readFileSync(receipt, "utf8") !== "CURRENT_EVIDENCE_BOUND_ONLY\n") return 85;
  return 0;
}
NODE
  cat > "${fixture_working_directory}/node_modules/pg/package.json" <<'JSON'
{"exports":"./index.js","type":"module"}
JSON
  cat > "${fixture_working_directory}/node_modules/pg/index.js" <<'NODE'
export class Client {
  constructor(options) { this.target = new URL(options.connectionString); }
  async connect() {}
  async query() {
    return { rows: [{
      address: "127.0.0.1",
      database: decodeURIComponent(this.target.pathname.slice(1)),
      port: Number(this.target.port),
      sessions: 0,
    }] };
  }
  async end() {}
}
export default { Client };
NODE
  "$privileged_find" -P "$fixture_artifact_root" -xdev -type d \
    -exec "$privileged_chown" "0:${fixture_runtime_gid}" {} +
  "$privileged_find" -P "$fixture_artifact_root" -xdev -type f \
    -exec "$privileged_chown" "0:${fixture_runtime_gid}" {} +
  "$privileged_find" -P "$fixture_artifact_root" -type d -exec "$privileged_chmod" 0550 {} +
  "$privileged_find" -P "$fixture_artifact_root" -type f -exec "$privileged_chmod" 0440 {} +
  printf '%s\n' \
    '{"databaseUrl":"postgresql://fixture:fixture@127.0.0.1:55432/leetplus_restored_fixture","evidenceHmacKey":"fixture-evidence-key-0123456789abcdef","loginEmail":"fixture@example.invalid","loginPassword":"fixture-password"}' \
    > "$fixture_credential_file"
  "$privileged_chown" 0:0 "$fixture_credential_file"
  "$privileged_chmod" 0400 "$fixture_credential_file"
  child_policy_source_file="${privileged_root}/child-policy-eval.mjs"
  "$privileged_node" --input-type=module - "$WRAPPER" "$child_policy_source_file" <<'NODE'
import fs from "node:fs";
const [wrapper, destination] = process.argv.slice(2);
const raw = fs.readFileSync(wrapper, "utf8");
const startMarker = "IFS= read -r -d '' child_policy_eval <<'NODE' || true\n";
const endMarker = "NODE\n\nchild_policy_sha256=";
const start = raw.indexOf(startMarker);
const end = raw.indexOf(endMarker, start + startMarker.length);
if (start < 0 || end < 0 || raw.indexOf(startMarker, start + 1) >= 0 ||
    raw.indexOf(endMarker, end + 1) >= 0) process.exit(71);
fs.writeFileSync(destination, raw.slice(start + startMarker.length, end),
  { encoding: "utf8", flag: "wx", mode: 0o400 });
NODE
  IFS= read -r -d '' child_policy_eval < "$child_policy_source_file" || true
  [[ "$child_policy_eval" == *'const markerIndex = process.argv.indexOf("--leetplus-child-policy-v1");'* \
    && "$child_policy_eval" == *'const [phase, contractMode, unit, systemctlPath'* \
    && "$child_policy_eval" == *'process.getuid?.() !== expectedUid'* ]] \
    || die 'exact embedded child-policy evaluator extraction failed'
  child_policy_sha256="$(printf '%s' "$child_policy_eval" \
    | "$privileged_node" --input-type=module --eval \
      'import crypto from "node:crypto"; const chunks=[]; for await (const chunk of process.stdin) chunks.push(chunk); process.stdout.write(crypto.createHash("sha256").update(Buffer.concat(chunks)).digest("hex"));')"
  [[ "$child_policy_sha256" =~ ^[0-9a-f]{64}$ ]] \
    || die 'exact embedded child-policy evaluator digest is malformed'
  child_policy_systemd_eval="${child_policy_eval//\$/\$\$}"
  [[ "${child_policy_systemd_eval//\$\$/\$}" == "$child_policy_eval" ]] \
    || die 'exact embedded child-policy evaluator systemd escaping is not reversible'
  evidence_parent="${privileged_root}/evidence"
  sibling_directory="${evidence_parent}/sibling01"
  sibling_receipt="${sibling_directory}/receipt.json"
  current_directory="${evidence_parent}/${operation_id}"
  current_receipt="${current_directory}/receipt.json"
  unit_evidence_parent="${privileged_root}/unit-evidence"
  unit_current_directory="${unit_evidence_parent}/${operation_id}"
  unit_current_receipt="${unit_current_directory}/receipt.json"
  "$privileged_mkdir" -- "$evidence_parent" "$sibling_directory" "$current_directory" \
    "$unit_evidence_parent" "$unit_current_directory"
  printf 'SIBLING_EVIDENCE_MUST_REMAIN_PRIVATE\n' > "$sibling_receipt"
  "$privileged_chown" "0:${fixture_gid}" "$evidence_parent"
  "$privileged_chmod" 0710 "$evidence_parent"
  "$privileged_chown" "0:${fixture_gid}" "$sibling_directory" "$sibling_receipt"
  "$privileged_chmod" 0750 "$sibling_directory"
  "$privileged_chmod" 0440 "$sibling_receipt"
  "$privileged_chown" "${fixture_uid}:${fixture_gid}" "$current_directory"
  "$privileged_chmod" 0700 "$current_directory"
  "$privileged_chown" "0:${fixture_gid}" "$unit_evidence_parent"
  "$privileged_chmod" 0710 "$unit_evidence_parent"
  "$privileged_chown" 0:0 "$unit_current_directory"
  "$privileged_chmod" 0700 "$unit_current_directory"

  "$privileged_timeout" --foreground --kill-after=5s 30s \
    "$privileged_systemd_run" --quiet \
    --service-type=exec "--unit=${main_unit}" \
    "--property=User=${fixture_user}" "--property=Group=${fixture_group}" \
    "--property=SupplementaryGroups=${fixture_runtime_group}" \
    "--property=LoadCredential=current-release-runtime.json:${fixture_credential_file}" \
    "--property=WorkingDirectory=${fixture_working_directory}" \
    '--property=Environment=PATH=/usr/sbin:/usr/bin:/sbin:/bin LANG=C LC_ALL=C TZ=UTC SHELL=/usr/sbin/nologin' \
    --property=SetLoginEnvironment=yes \
    --property=NoNewPrivileges=yes --property=CapabilityBoundingSet= \
    --property=AmbientCapabilities= --property=IPAddressDeny=any \
    --property=IPAddressAllow=localhost --property=Delegate=no \
    --property=MemoryPressureWatch=skip \
    --property=ProtectSystem=strict --property=ProtectHome=yes --property=PrivateTmp=yes \
    --property=PrivateDevices=yes --property=ProtectProc=invisible --property=ProcSubset=pid \
    --property=ProtectKernelTunables=yes --property=ProtectKernelModules=yes \
    --property=ProtectKernelLogs=yes --property=ProtectControlGroups=yes \
    --property=ProtectClock=yes --property=ProtectHostname=yes --property=LockPersonality=yes \
    --property=RestrictRealtime=yes --property=RestrictSUIDSGID=yes \
    --property=SystemCallArchitectures=native \
    '--property=RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6' \
    --property=KillMode=control-group --property=TimeoutStopSec=20s --property=UMask=0077 \
    "--property=UnsetEnvironment=${privileged_unset_environment}" \
    --property=RuntimeMaxSec=14min \
    --property=RemainAfterExit=yes \
    --property=StandardOutput=null --property=StandardError=null \
    "--property=InaccessiblePaths=${evidence_parent}" \
    "--property=ReadOnlyPaths=${fixture_artifact_root}" \
    "--property=BindPaths=${current_directory}:${unit_current_directory}:norbind" \
    "--property=ReadWritePaths=${unit_current_directory}" \
    "--property=Environment=LEETPLUS_CHILD_POLICY_SHA256=${child_policy_sha256}" \
    -- "$node_executable" --input-type=module --eval "$child_policy_systemd_eval" -- \
    --leetplus-child-policy-v1 main fixture "$main_unit" "$privileged_systemctl" "$node_executable" \
    "$fixture_uid" "$fixture_gid" "$fixture_runtime_gid" "$fixture_user" "$fixture_group" \
    "$fixture_runtime_group" "$fixture_artifact_root" "$fixture_credential_file" \
    "$evidence_parent" "$operation_id" "$unit_current_directory" cli --child-payload \
    "$fixture_cli" --fixture-phase main --fixture-receipt "$unit_current_receipt" \
    --fixture-host-current "$current_directory" --fixture-host-sibling "$sibling_receipt"
  wait_for_fixture_unit_success "$main_unit"
  assert_empty_fixture_unit_cgroup "$main_unit"
  main_properties="$("$privileged_systemctl" show "$main_unit" --all --no-pager \
    --property=InaccessiblePaths --property=BindPaths --property=BindReadOnlyPaths \
    --property=ReadWritePaths --property=ReadOnlyPaths --property=User --property=Group \
    --property=SupplementaryGroups --property=DynamicUser --property=Id --property=ControlGroup \
    --property=MainPID --property=ActiveState --property=SubState \
    --property=Result --property=ExecMainStatus --property=LoadCredential \
    --property=WorkingDirectory --property=Environment --property=EnvironmentFiles \
    --property=PassEnvironment --property=SetLoginEnvironment \
    --property=UnsetEnvironment --property=NoNewPrivileges \
    --property=CapabilityBoundingSet --property=AmbientCapabilities \
    --property=IPAddressDeny --property=IPAddressAllow --property=Delegate \
    --property=MemoryPressureWatch \
    --property=PrivateTmp --property=PrivateDevices --property=ProtectSystem --property=ProtectHome \
    --property=ProtectProc --property=ProcSubset --property=ProtectKernelTunables \
    --property=ProtectKernelModules --property=ProtectKernelLogs \
    --property=ProtectControlGroups --property=ProtectClock --property=ProtectHostname \
    --property=LockPersonality --property=RestrictRealtime --property=RestrictSUIDSGID \
    --property=SystemCallArchitectures --property=RestrictAddressFamilies \
    --property=RootDirectory --property=RootImage \
    --property=KillMode --property=TimeoutStopUSec --property=UMask \
    --property=StandardOutput --property=StandardError --property=RuntimeMaxUSec \
    --property=RemainAfterExit)"
  assert_exact_effective_properties "$main_properties" \
    "InaccessiblePaths=${evidence_parent}" \
    "BindPaths=${current_directory}:${unit_current_directory}" \
    'BindReadOnlyPaths=' \
    "ReadWritePaths=${unit_current_directory}" \
    "ReadOnlyPaths=${fixture_artifact_root}" \
    "User=${fixture_user}" \
    "Group=${fixture_group}" \
    "SupplementaryGroups=${fixture_runtime_group}" \
    'DynamicUser=no' \
    "LoadCredential=${effective_load_credential}" \
    "WorkingDirectory=${fixture_working_directory}" \
    "Environment=PATH=/usr/sbin:/usr/bin:/sbin:/bin LANG=C LC_ALL=C TZ=UTC SHELL=/usr/sbin/nologin LEETPLUS_CHILD_POLICY_SHA256=${child_policy_sha256}" \
    'EnvironmentFiles=' \
    'PassEnvironment=' \
    'SetLoginEnvironment=yes' \
    "UnsetEnvironment=${privileged_unset_environment}" \
    'NoNewPrivileges=yes' \
    'CapabilityBoundingSet=' \
    'AmbientCapabilities=' \
    'IPAddressDeny=0.0.0.0/0 ::/0' \
    'IPAddressAllow=127.0.0.0/8 ::1/128' \
    'Delegate=no' \
    'MemoryPressureWatch=skip' \
    'PrivateTmp=yes' \
    'PrivateDevices=yes' \
    'ProtectSystem=strict' \
    'ProtectHome=yes' \
    'ProtectProc=invisible' \
    'ProcSubset=pid' \
    'ProtectKernelTunables=yes' \
    'ProtectKernelModules=yes' \
    'ProtectKernelLogs=yes' \
    'ProtectControlGroups=yes' \
    'ProtectClock=yes' \
    'ProtectHostname=yes' \
    'LockPersonality=yes' \
    'RestrictRealtime=yes' \
    'RestrictSUIDSGID=yes' \
    'SystemCallArchitectures=native' \
    'RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6' \
    'RootDirectory=' \
    'RootImage=' \
    'KillMode=control-group' \
    'TimeoutStopUSec=20s' \
    'UMask=0077' \
    'StandardOutput=null' \
    'StandardError=null' \
    'RuntimeMaxUSec=14min' \
    'RemainAfterExit=yes' \
    "Id=${main_unit}" \
    'ControlGroup=' \
    'MainPID=0' \
    'ActiveState=active' \
    'SubState=exited' \
    'Result=success' \
    'ExecMainStatus=0'
  main_exec_start="$("$privileged_systemctl" show "$main_unit" --value --property=ExecStart)"
  [[ "${main_exec_start#*'{ path='}" != "$main_exec_start" \
    && "$main_exec_start" == *"path=${node_executable}"* \
    && "$main_exec_start" == *'--leetplus-child-policy-v1'* \
    && "$main_exec_start" == *' main fixture '* ]] \
    || die 'privileged main effective ExecStart is not the exact child contract'
  [[ -f "$current_receipt" && ! -L "$current_receipt" \
    && "$("$privileged_stat" -c '%u:%g:%a:%h' -- "$current_receipt")" == \
      "${fixture_uid}:${fixture_gid}:600:1" ]] \
    || die 'privileged main did not retain exact current-child write access'
  [[ ! -e "$unit_current_receipt" && ! -L "$unit_current_receipt" \
    && "$("$privileged_stat" -c '%u:%g:%a' -- "$unit_current_directory")" == '0:0:700' ]] \
    || die 'privileged main changed the host-side unit bind target'
  [[ "$(< "$sibling_receipt")" == SIBLING_EVIDENCE_MUST_REMAIN_PRIVATE ]] \
    || die 'privileged main changed the frozen sibling sentinel'

  "$privileged_chown" "0:${fixture_gid}" "$current_receipt" "$current_directory"
  "$privileged_chmod" 0440 "$current_receipt"
  "$privileged_chmod" 0750 "$current_directory"
  "$privileged_timeout" --foreground --kill-after=5s 30s \
    "$privileged_systemd_run" --quiet \
    --service-type=exec "--unit=${verify_unit}" \
    "--property=User=${fixture_user}" "--property=Group=${fixture_group}" \
    "--property=SupplementaryGroups=${fixture_runtime_group}" \
    "--property=LoadCredential=current-release-runtime.json:${fixture_credential_file}" \
    "--property=WorkingDirectory=${fixture_working_directory}" \
    '--property=Environment=PATH=/usr/sbin:/usr/bin:/sbin:/bin LANG=C LC_ALL=C TZ=UTC SHELL=/usr/sbin/nologin' \
    --property=SetLoginEnvironment=yes \
    --property=NoNewPrivileges=yes --property=CapabilityBoundingSet= \
    --property=AmbientCapabilities= --property=IPAddressDeny=any \
    --property=IPAddressAllow=localhost --property=Delegate=no \
    --property=MemoryPressureWatch=skip \
    --property=ProtectSystem=strict --property=ProtectHome=yes --property=PrivateTmp=yes \
    --property=PrivateDevices=yes --property=ProtectProc=invisible --property=ProcSubset=pid \
    --property=ProtectKernelTunables=yes --property=ProtectKernelModules=yes \
    --property=ProtectKernelLogs=yes --property=ProtectControlGroups=yes \
    --property=ProtectClock=yes --property=ProtectHostname=yes --property=LockPersonality=yes \
    --property=RestrictRealtime=yes --property=RestrictSUIDSGID=yes \
    --property=SystemCallArchitectures=native \
    '--property=RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6' \
    --property=KillMode=control-group --property=TimeoutStopSec=20s --property=UMask=0077 \
    "--property=UnsetEnvironment=${privileged_unset_environment}" \
    --property=RuntimeMaxSec=30s \
    --property=RemainAfterExit=yes \
    --property=StandardOutput=null --property=StandardError=null \
    "--property=InaccessiblePaths=${evidence_parent}" \
    "--property=ReadOnlyPaths=${fixture_artifact_root}" \
    "--property=BindReadOnlyPaths=${current_directory}:${unit_current_directory}:norbind" \
    "--property=ReadOnlyPaths=${unit_current_directory}" \
    "--property=Environment=LEETPLUS_CHILD_POLICY_SHA256=${child_policy_sha256}" \
    -- "$node_executable" --input-type=module --eval "$child_policy_systemd_eval" -- \
    --leetplus-child-policy-v1 verify fixture "$verify_unit" "$privileged_systemctl" "$node_executable" \
    "$fixture_uid" "$fixture_gid" "$fixture_runtime_gid" "$fixture_user" "$fixture_group" \
    "$fixture_runtime_group" "$fixture_artifact_root" "$fixture_credential_file" \
    "$evidence_parent" "$operation_id" "$unit_current_directory" cli --child-payload \
    "$fixture_cli" --fixture-phase verify --fixture-receipt "$unit_current_receipt" \
    --fixture-host-current "$current_directory" --fixture-host-sibling "$sibling_receipt"
  wait_for_fixture_unit_success "$verify_unit"
  assert_empty_fixture_unit_cgroup "$verify_unit"
  verify_properties="$("$privileged_systemctl" show "$verify_unit" --all --no-pager \
    --property=InaccessiblePaths --property=BindPaths --property=BindReadOnlyPaths \
    --property=ReadOnlyPaths --property=ReadWritePaths --property=User --property=Group \
    --property=SupplementaryGroups --property=DynamicUser --property=Id --property=ControlGroup \
    --property=MainPID --property=ActiveState --property=SubState \
    --property=Result --property=ExecMainStatus --property=LoadCredential \
    --property=WorkingDirectory --property=Environment --property=EnvironmentFiles \
    --property=PassEnvironment --property=SetLoginEnvironment \
    --property=UnsetEnvironment --property=NoNewPrivileges \
    --property=CapabilityBoundingSet --property=AmbientCapabilities \
    --property=IPAddressDeny --property=IPAddressAllow --property=Delegate \
    --property=MemoryPressureWatch \
    --property=PrivateTmp --property=PrivateDevices --property=ProtectSystem --property=ProtectHome \
    --property=ProtectProc --property=ProcSubset --property=ProtectKernelTunables \
    --property=ProtectKernelModules --property=ProtectKernelLogs \
    --property=ProtectControlGroups --property=ProtectClock --property=ProtectHostname \
    --property=LockPersonality --property=RestrictRealtime --property=RestrictSUIDSGID \
    --property=SystemCallArchitectures --property=RestrictAddressFamilies \
    --property=RootDirectory --property=RootImage \
    --property=KillMode --property=TimeoutStopUSec --property=UMask \
    --property=StandardOutput --property=StandardError --property=RuntimeMaxUSec \
    --property=RemainAfterExit)"
  assert_exact_effective_properties "$verify_properties" \
    "InaccessiblePaths=${evidence_parent}" \
    'BindPaths=' \
    "BindReadOnlyPaths=${current_directory}:${unit_current_directory}" \
    "ReadOnlyPaths=${fixture_artifact_root} ${unit_current_directory}" \
    'ReadWritePaths=' \
    "User=${fixture_user}" \
    "Group=${fixture_group}" \
    "SupplementaryGroups=${fixture_runtime_group}" \
    'DynamicUser=no' \
    "LoadCredential=${effective_load_credential}" \
    "WorkingDirectory=${fixture_working_directory}" \
    "Environment=PATH=/usr/sbin:/usr/bin:/sbin:/bin LANG=C LC_ALL=C TZ=UTC SHELL=/usr/sbin/nologin LEETPLUS_CHILD_POLICY_SHA256=${child_policy_sha256}" \
    'EnvironmentFiles=' \
    'PassEnvironment=' \
    'SetLoginEnvironment=yes' \
    "UnsetEnvironment=${privileged_unset_environment}" \
    'NoNewPrivileges=yes' \
    'CapabilityBoundingSet=' \
    'AmbientCapabilities=' \
    'IPAddressDeny=0.0.0.0/0 ::/0' \
    'IPAddressAllow=127.0.0.0/8 ::1/128' \
    'Delegate=no' \
    'MemoryPressureWatch=skip' \
    'PrivateTmp=yes' \
    'PrivateDevices=yes' \
    'ProtectSystem=strict' \
    'ProtectHome=yes' \
    'ProtectProc=invisible' \
    'ProcSubset=pid' \
    'ProtectKernelTunables=yes' \
    'ProtectKernelModules=yes' \
    'ProtectKernelLogs=yes' \
    'ProtectControlGroups=yes' \
    'ProtectClock=yes' \
    'ProtectHostname=yes' \
    'LockPersonality=yes' \
    'RestrictRealtime=yes' \
    'RestrictSUIDSGID=yes' \
    'SystemCallArchitectures=native' \
    'RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6' \
    'RootDirectory=' \
    'RootImage=' \
    'KillMode=control-group' \
    'TimeoutStopUSec=20s' \
    'UMask=0077' \
    'StandardOutput=null' \
    'StandardError=null' \
    'RuntimeMaxUSec=30s' \
    'RemainAfterExit=yes' \
    "Id=${verify_unit}" \
    'ControlGroup=' \
    'MainPID=0' \
    'ActiveState=active' \
    'SubState=exited' \
    'Result=success' \
    'ExecMainStatus=0'
  verify_exec_start="$("$privileged_systemctl" show "$verify_unit" --value --property=ExecStart)"
  [[ "${verify_exec_start#*'{ path='}" != "$verify_exec_start" \
    && "$verify_exec_start" == *"path=${node_executable}"* \
    && "$verify_exec_start" == *'--leetplus-child-policy-v1'* \
    && "$verify_exec_start" == *' verify fixture '* ]] \
    || die 'privileged verifier effective ExecStart is not the exact child contract'
  [[ ! -e "$unit_current_receipt" && ! -L "$unit_current_receipt" \
    && "$(< "$current_receipt")" == CURRENT_EVIDENCE_BOUND_ONLY \
    && "$(< "$sibling_receipt")" == SIBLING_EVIDENCE_MUST_REMAIN_PRIVATE ]] \
    || die 'privileged verifier changed host bind targets or evidence bytes'

  "$privileged_timeout" --foreground --kill-after=5s 30s \
    "$privileged_systemd_run" --quiet \
    --service-type=exec "--unit=${drain_unit}" \
    "--property=User=${fixture_user}" "--property=Group=${fixture_group}" \
    "--property=SupplementaryGroups=${fixture_runtime_group}" \
    "--property=LoadCredential=current-release-runtime.json:${fixture_credential_file}" \
    "--property=WorkingDirectory=${fixture_working_directory}" \
    '--property=Environment=PATH=/usr/sbin:/usr/bin:/sbin:/bin LANG=C LC_ALL=C TZ=UTC SHELL=/usr/sbin/nologin' \
    "--property=Environment=LEETPLUS_CHILD_POLICY_SHA256=${child_policy_sha256}" \
    --property=SetLoginEnvironment=yes --property=NoNewPrivileges=yes \
    --property=CapabilityBoundingSet= --property=AmbientCapabilities= \
    --property=IPAddressDeny=any --property=IPAddressAllow=localhost --property=Delegate=no \
    --property=MemoryPressureWatch=skip \
    --property=ProtectSystem=strict --property=ProtectHome=yes --property=PrivateTmp=yes \
    --property=PrivateDevices=yes --property=ProtectProc=invisible --property=ProcSubset=pid \
    --property=ProtectKernelTunables=yes --property=ProtectKernelModules=yes \
    --property=ProtectKernelLogs=yes --property=ProtectControlGroups=yes \
    --property=ProtectClock=yes --property=ProtectHostname=yes --property=LockPersonality=yes \
    --property=RestrictRealtime=yes --property=RestrictSUIDSGID=yes \
    --property=SystemCallArchitectures=native \
    '--property=RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6' \
    --property=KillMode=control-group --property=TimeoutStopSec=20s --property=UMask=0077 \
    "--property=UnsetEnvironment=${privileged_unset_environment}" \
    --property=RuntimeMaxSec=30s --property=RemainAfterExit=yes \
    --property=StandardOutput=null --property=StandardError=null \
    "--property=InaccessiblePaths=${evidence_parent}" \
    "--property=ReadOnlyPaths=${fixture_artifact_root}" \
    -- "$node_executable" --input-type=module --eval "$child_policy_systemd_eval" -- \
    --leetplus-child-policy-v1 drain fixture "$drain_unit" "$privileged_systemctl" "$node_executable" \
    "$fixture_uid" "$fixture_gid" "$fixture_runtime_gid" "$fixture_user" "$fixture_group" \
    "$fixture_runtime_group" "$fixture_artifact_root" "$fixture_credential_file" \
    "$evidence_parent" "$operation_id" - drain --child-payload --drain-check
  wait_for_fixture_unit_success "$drain_unit"
  assert_empty_fixture_unit_cgroup "$drain_unit"
  assert_privileged_phase_effective_policy drain "$drain_unit"

  "$privileged_timeout" --foreground --kill-after=5s 30s \
    "$privileged_systemd_run" --quiet \
    --service-type=exec "--unit=${replay_unit}" \
    "--property=User=${fixture_user}" "--property=Group=${fixture_group}" \
    "--property=SupplementaryGroups=${fixture_runtime_group}" \
    "--property=LoadCredential=current-release-runtime.json:${fixture_credential_file}" \
    "--property=WorkingDirectory=${fixture_working_directory}" \
    '--property=Environment=PATH=/usr/sbin:/usr/bin:/sbin:/bin LANG=C LC_ALL=C TZ=UTC SHELL=/usr/sbin/nologin' \
    "--property=Environment=LEETPLUS_CHILD_POLICY_SHA256=${child_policy_sha256}" \
    --property=SetLoginEnvironment=yes --property=NoNewPrivileges=yes \
    --property=CapabilityBoundingSet= --property=AmbientCapabilities= \
    --property=IPAddressDeny=any --property=IPAddressAllow=localhost --property=Delegate=no \
    --property=MemoryPressureWatch=skip \
    --property=ProtectSystem=strict --property=ProtectHome=yes --property=PrivateTmp=yes \
    --property=PrivateDevices=yes --property=ProtectProc=invisible --property=ProcSubset=pid \
    --property=ProtectKernelTunables=yes --property=ProtectKernelModules=yes \
    --property=ProtectKernelLogs=yes --property=ProtectControlGroups=yes \
    --property=ProtectClock=yes --property=ProtectHostname=yes --property=LockPersonality=yes \
    --property=RestrictRealtime=yes --property=RestrictSUIDSGID=yes \
    --property=SystemCallArchitectures=native \
    '--property=RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6' \
    --property=KillMode=control-group --property=TimeoutStopSec=20s --property=UMask=0077 \
    "--property=UnsetEnvironment=${privileged_unset_environment}" \
    --property=RuntimeMaxSec=30s --property=RemainAfterExit=yes \
    --property=StandardOutput=null --property=StandardError=null \
    "--property=InaccessiblePaths=${evidence_parent}" \
    "--property=ReadOnlyPaths=${fixture_artifact_root}" \
    "--property=BindReadOnlyPaths=${current_directory}:${unit_current_directory}:norbind" \
    "--property=ReadOnlyPaths=${unit_current_directory}" \
    -- "$node_executable" --input-type=module --eval "$child_policy_systemd_eval" -- \
    --leetplus-child-policy-v1 replay fixture "$replay_unit" "$privileged_systemctl" "$node_executable" \
    "$fixture_uid" "$fixture_gid" "$fixture_runtime_gid" "$fixture_user" "$fixture_group" \
    "$fixture_runtime_group" "$fixture_artifact_root" "$fixture_credential_file" \
    "$evidence_parent" "$operation_id" "$unit_current_directory" cli --child-payload \
    "$fixture_cli" --fixture-phase replay --fixture-receipt "$unit_current_receipt" \
    --fixture-host-current "$current_directory" --fixture-host-sibling "$sibling_receipt"
  wait_for_fixture_unit_success "$replay_unit"
  assert_empty_fixture_unit_cgroup "$replay_unit"
  assert_privileged_phase_effective_policy replay "$replay_unit"
  [[ "$(< "$current_receipt")" == CURRENT_EVIDENCE_BOUND_ONLY \
    && "$(< "$sibling_receipt")" == SIBLING_EVIDENCE_MUST_REMAIN_PRIVATE ]] \
    || die 'privileged drain/replay changed frozen evidence bytes'

  cleanup_privileged_evidence_isolation
  set -e
  trap - EXIT
  printf 'current-release wrapper privileged evidence isolation fixture: PASS\n'
}

if [[ "${1:-}" == --privileged-evidence-isolation-fixture ]]; then
  shift
  run_privileged_evidence_isolation_fixture "$@"
  exit 0
fi
[[ "$#" == 0 ]] || die 'fixture accepts only the privileged evidence-isolation mode'

((EUID != 0)) || die 'fixture must run as a non-root user'
for command_name in awk bash chmod cmp command cp dirname find grep id mktemp node realpath sha256sum sleep sort stat sync timeout; do
  command -v "$command_name" >/dev/null 2>&1 || die "required command is unavailable: ${command_name}"
done
[[ -f "$WRAPPER" && ! -L "$WRAPPER" ]] || die 'wrapper source is absent'
[[ -f "$CLI" && ! -L "$CLI" && -f "$MODULE" && ! -L "$MODULE" ]] \
  || die 'current-release CLI/module source is absent'
grep -F -x '#!/usr/bin/bash -p' "${BASH_SOURCE[0]}" >/dev/null \
  || die 'privileged fixture does not use the fixed privileged Bash interpreter'
grep -F 'while IFS= read -r inherited_environment_name; do' "${BASH_SOURCE[0]}" >/dev/null \
  || die 'privileged fixture does not scrub every inherited exported name'
grep -F "readonly privileged_node='/usr/local/libexec/leetplus/current-wrapper-fixture-node22'" \
  "${BASH_SOURCE[0]}" >/dev/null \
  || die 'privileged fixture Node authority is not fixed'
grep -F 'fixture_nss_identity_is_exact()' "${BASH_SOURCE[0]}" >/dev/null \
  || die 'privileged fixture does not exercise full NSS reverse identity'
grep -F 'fixture_uid_processes_are_absent()' "${BASH_SOURCE[0]}" >/dev/null \
  || die 'privileged fixture does not exercise the same-UID process fence'
grep -F -x '#!/usr/bin/bash -p' "$WRAPPER" >/dev/null \
  || die 'production wrapper does not use the fixed privileged Bash interpreter'
grep -F 'while IFS= read -r inherited_environment_name; do' "$WRAPPER" >/dev/null \
  || die 'production wrapper does not scrub every inherited exported name before commands'
grep -F 'expected_wrapper_path="${artifact_root}/packages/database/scripts/run-current-release-restored-copy-acceptance.sh"' \
  "$WRAPPER" >/dev/null \
  || die 'production wrapper does not self-attest its exact in-artifact path'
grep -F "wrapper_relative='./packages/database/scripts/run-current-release-restored-copy-acceptance.sh'" \
  "$WRAPPER" >/dev/null \
  || die 'production wrapper byte is not required in both artifact manifests'
grep -F 'production wrapper must be the exact single-link byte inside the release artifact' \
  "$WRAPPER" >/dev/null \
  || die 'production wrapper root ownership/link admission is absent'
grep -F 'durable control removal fsync failed; marker retained' "$WRAPPER" >/dev/null \
  || die 'active-marker partial-removal recovery is absent'
grep -F 'const count = fs.readSync(descriptor, chunk, 0, chunk.length, null);' "$WRAPPER" >/dev/null \
  || die 'cgroup emptiness is not established by bounded content reads'
grep -F 'uid_passwd_records="$(getent passwd | awk -F: -v expected_uid="$service_uid"' \
  "$WRAPPER" >/dev/null \
  || die 'production wrapper does not fully enumerate the fixed service UID'
grep -F 'gid_group_records="$(getent group | awk -F: -v expected_gid="$service_gid"' \
  "$WRAPPER" >/dev/null \
  || die 'production wrapper does not fully enumerate the fixed service GID'
grep -F 'artifact_gid_group_records="$(getent group | awk -F: -v expected_gid="$artifact_read_gid"' \
  "$WRAPPER" >/dev/null \
  || die 'production wrapper does not fully enumerate the runtime read GID'
grep -F -x "readonly ACCEPTANCE_CONTRACT='LEETPLUS_CURRENT_RELEASE_RESTORED_COPY_RUNTIME_ACCEPTANCE_V2'" \
  "$WRAPPER" >/dev/null \
  || die 'production wrapper is not bound to the V2 signed receipt contract'
grep -F 'assert_unit_effective_policy "$unit"' "$WRAPPER" >/dev/null \
  || die 'production wrapper does not bind acceptance to exact effective unit policy'
grep -F -- '--leetplus-child-policy-v1' "$WRAPPER" >/dev/null \
  || die 'production wrapper does not gate runtime children before CLI/drain execution'
grep -F 'const uidSet = readStatusIds("Uid");' "$WRAPPER" >/dev/null \
  || die 'production child gate does not attest real/effective/saved/fs identity'
grep -F 'unexpectedEnvironmentNames.length !== 0 || missingEnvironmentNames.length !== 0 ||' \
  "$WRAPPER" >/dev/null \
  && grep -F 'mismatchedEnvironmentNames.length !== 0 || !invocationIdValid) {' \
    "$WRAPPER" >/dev/null \
  || die 'production child gate does not enforce an exact environment allowlist'
grep -F 'sourceDigest !== process.env.LEETPLUS_CHILD_POLICY_SHA256' "$WRAPPER" >/dev/null \
  || die 'production child gate does not bind its actual eval source digest'
grep -F 'const [phase, contractMode, unit, systemctlPath' "$WRAPPER" >/dev/null \
  || die 'production child gate has no explicit production/fixture contract boundary'
if grep -F '! -s "$cgroup_path/cgroup.procs"' "$WRAPPER" >/dev/null \
  || grep -F "stat -c '%s' -- \"\$cgroup_path/cgroup.procs\"" "$WRAPPER" >/dev/null; then
  die 'cgroup admission still trusts pseudo-file stat size'
fi

fixture_root="$(mktemp -d /tmp/leetplus-current-wrapper.XXXXXXXX)"
case "$fixture_root" in /tmp/leetplus-current-wrapper.*) ;; *) die 'unsafe fixture root' ;; esac
background_pid=''
cleanup() {
  cleanup_status=$?
  trap - EXIT
  set +e
  if ((cleanup_status != 0)) && [[ -f "${fixture_root}/systemd-argv.log" ]]; then
    printf '%s\n' '--- CURRENT WRAPPER FIXTURE DIAGNOSTIC ---' >&2
    grep -E '^(---TIMEOUT---|---TIMEOUT-STATUS=|---SYSTEMD-RUN---|---SYSTEMCTL---|INACCESSIBLE_PATH_|show$|--unit=)' \
      "${fixture_root}/systemd-argv.log" | tail -n 160 >&2
    find -P "${fixture_root}/control" -maxdepth 1 -type f -name 'unit-policy-*' \
      -printf 'UNIT_POLICY=%f\n' >&2
  fi
  if [[ "$background_pid" =~ ^[1-9][0-9]*$ ]]; then
    if [[ -d "${fixture_root}/control/fixture-flock-sentinel" ]]; then
      : > "${fixture_root}/control/fixture-flock-sentinel/release"
    fi
    kill "$background_pid" 2>/dev/null
    wait "$background_pid" 2>/dev/null
  fi
  if [[ -d "$fixture_root" && ! -L "$fixture_root" ]]; then
    find -P "$fixture_root" -depth -mindepth 1 -delete
    rmdir "$fixture_root"
  fi
  exit "$cleanup_status"
}
trap cleanup EXIT

release_root="${fixture_root}/releases"
artifact_root="${release_root}/${RELEASE_SHA}"
credential_root="${fixture_root}/credentials"
evidence_root="${fixture_root}/evidence"
control_root="${fixture_root}/control"
cgroup_root="${control_root}/test-cgroup"
proc_root="${fixture_root}/proc"
bin_root="${fixture_root}/bin"
log_path="${fixture_root}/systemd-argv.log"
wrapper_output="${fixture_root}/wrapper.out"
mkdir -p "$artifact_root/packages/database" "$credential_root" "$evidence_root" \
  "$control_root" "$cgroup_root" "$proc_root" "$bin_root"
mkdir -p "$artifact_root/apps/web/.next/build/chunks"
printf 'standard-next-build-chunk\n' \
  > "$artifact_root/apps/web/.next/build/chunks/[root-of-the-server]__fixture._.js"
chmod 0700 "$fixture_root" "$release_root" "$artifact_root" \
  "$artifact_root/packages" "$artifact_root/packages/database" \
  "$credential_root" "$control_root" "$cgroup_root" "$proc_root" "$bin_root"
chmod 0710 "$evidence_root"

printf '{"databaseMigration":"%s","databaseMigrationCount":1,"releaseSha":"%s"}\n' \
  "$MIGRATION_HEAD" "$RELEASE_SHA" > "$artifact_root/release-provenance.json"
printf 'RECORD_VERSION=1\nRELEASE_SHA=%s\nSANDBOX=SYSTEMD_IP_DENY_ANY_V1\nINVOCATION_ID=0123456789abcdef0123456789abcdef\nPNPM_STORE_LOCKFILE_SHA256=%064d\n' \
  "$RELEASE_SHA" 0 > "$artifact_root/HYDRATION_SANDBOX_RECEIPT"
printf '{"links":[],"version":1}\n' > "$artifact_root/HYDRATED_SYMLINKS.json"
(
  cd -- "$artifact_root"
  find . -xdev -type f ! -path './SHA256SUMS' ! -path './HYDRATED_SHA256SUMS' -print \
    | LC_ALL=C sort | xargs sha256sum --text > SHA256SUMS
  find . -xdev -type f ! -path './HYDRATED_SHA256SUMS' -print \
    | LC_ALL=C sort | xargs sha256sum --text > HYDRATED_SHA256SUMS
)
find -P "$artifact_root" -type d -exec chmod 0700 {} +
find -P "$artifact_root" -type f -exec chmod 0600 {} +

credential_file="${credential_root}/fixture-credential.json"
printf '{"databaseUrl":"%s","evidenceHmacKey":"%s","loginEmail":"%s","loginPassword":"%s"}\n' \
  "$DATABASE_URL" "$HMAC_SECRET" "$LOGIN_EMAIL" "$LOGIN_PASSWORD" > "$credential_file"
chmod 0400 "$credential_file"

real_node="$(realpath -e -- "$(command -v node)")"
real_timeout="$(realpath -e -- "$(command -v timeout)")"
printf '%s\n' "$real_node" > "$bin_root/real-node.path"
printf '%s\n' "$real_timeout" > "$bin_root/real-timeout.path"
printf '%s\n' "$MODULE" > "$bin_root/module.path"
chmod 0400 "$bin_root/real-node.path" "$bin_root/real-timeout.path" "$bin_root/module.path"

cat > "$bin_root/node" <<'NODE_WRAPPER'
#!/bin/bash
set -euo pipefail
bin_root="${BASH_SOURCE[0]%/*}"
fixture_root="${bin_root%/*}"
real_node="$(< "${bin_root}/real-node.path")"
if [[ -f "${fixture_root}/control/test-cgroup-content-nonempty" \
  && "${*: -1}" == */cgroup.procs ]]; then
  [[ "$(stat -c '%s' -- "${*: -1}")" == 0 ]] || exit 90
  : > "${fixture_root}/control/test-cgroup-reader-invoked"
  exit 67
fi
exec "$real_node" "$@"
NODE_WRAPPER
cat > "$bin_root/node20" <<'NODE20_WRAPPER'
#!/bin/bash
set -euo pipefail
bin_root="${BASH_SOURCE[0]%/*}"
if [[ "${1:-}" == --no-warnings && "${2:-}" == --eval ]]; then
  printf '20.19.0'
  exit 0
fi
exec "$(< "${bin_root}/real-node.path")" "$@"
NODE20_WRAPPER
cat > "$bin_root/timeout" <<'TIMEOUT_WRAPPER'
#!/bin/bash
set -euo pipefail
bin_root="${BASH_SOURCE[0]%/*}"
fixture_root="${bin_root%/*}"
printf '%s\n' '---TIMEOUT---' >> "${fixture_root}/systemd-argv.log"
for timeout_argument in "$@"; do
  printf '%s\n' "$timeout_argument" >> "${fixture_root}/systemd-argv.log"
  [[ "$timeout_argument" =~ ^[1-9][0-9]*s$ ]] && break
done
set +e
"$(< "${bin_root}/real-timeout.path")" "$@"
status=$?
set -e
printf '%s\n' "---TIMEOUT-STATUS=${status}---" >> "${fixture_root}/systemd-argv.log"
exit "$status"
TIMEOUT_WRAPPER
cat > "$bin_root/flock" <<'FLOCK_STUB'
#!/bin/bash
set -euo pipefail
bin_root="${BASH_SOURCE[0]%/*}"
fixture_root="${bin_root%/*}"
control_root="${fixture_root}/control"
printf '%s\n' '---FLOCK---' "$@" >> "${fixture_root}/systemd-argv.log"
[[ "${1:-}" == --nonblock && "${2:-}" =~ ^[0-9]+$ && "$#" == 2 ]] || exit 64
sentinel="${control_root}/fixture-flock-sentinel"
if ! mkdir -- "$sentinel" 2>/dev/null; then
  exit 1
fi
if [[ -f "${control_root}/test-flock-block" ]]; then
  : > "${sentinel}/ready"
  while [[ ! -e "${sentinel}/release" ]]; do
    sleep 0.05
  done
fi
find -P "$sentinel" -depth -mindepth 1 -delete
rmdir -- "$sentinel"
FLOCK_STUB
cat > "$bin_root/systemctl" <<'SYSTEMCTL_STUB'
#!/bin/bash
set -euo pipefail
bin_root="${BASH_SOURCE[0]%/*}"
fixture_root="${bin_root%/*}"
control_root="${fixture_root}/control"
log_path="${fixture_root}/systemd-argv.log"
cgroup_root="${control_root}/test-cgroup"
printf '%s\n' '---SYSTEMCTL---' "$@" >> "$log_path"
if [[ "${1:-}" == show ]]; then
  [[ ! -f "${control_root}/test-systemctl-transport-error" ]] || exit 1
  unit="${2:-}"
  [[ "$unit" =~ ^leetplus-current-release-[a-z-]+[a-z0-9]+\.service$ ]] || exit 65
  policy_requested=false
  exec_start_requested=false
  for argument in "$@"; do
    [[ "$argument" != --property=User ]] || policy_requested=true
    [[ "$argument" != --property=ExecStart ]] || exec_start_requested=true
  done
  if [[ "$policy_requested" == true ]]; then
    policy_path="${control_root}/unit-policy-${unit%.service}"
    [[ -f "$policy_path" && ! -L "$policy_path" ]] || exit 66
    if [[ -f "${control_root}/test-unit-policy-drift" ]]; then
      sed 's/^User=leetplus-rehearsal$/User=foreign-user/' "$policy_path" \
        | grep -v '^ExecStart='
    else
      grep -v '^ExecStart=' "$policy_path"
    fi
    exit 0
  fi
  if [[ "$exec_start_requested" == true ]]; then
    policy_path="${control_root}/unit-policy-${unit%.service}"
    [[ -f "$policy_path" && ! -L "$policy_path" ]] || exit 66
    [[ "$(grep -c '^ExecStart=' "$policy_path")" == 1 ]] || exit 67
    sed -n 's/^ExecStart=//p' "$policy_path"
    exit 0
  fi
  if [[ -f "${control_root}/test-force-active" ]]; then
    state=active
  elif [[ -f "${control_root}/test-main-unit-gc-notfound" \
    && "$unit" == leetplus-current-release-acceptance-*.service ]]; then
    state=not-found
  elif [[ -f "${control_root}/test-drain-unit-gc-notfound" \
    && "$unit" == leetplus-current-release-drain-*.service ]]; then
    state=not-found
  elif [[ -f "${control_root}/test-verify-unit-gc-notfound" \
    && "$unit" == leetplus-current-release-verify-*.service ]]; then
    state=not-found
  elif [[ -f "${control_root}/test-unit-state" ]]; then
    state="$(< "${control_root}/test-unit-state")"
  elif grep -F -x -- "--unit=${unit}" "$log_path" >/dev/null; then
    state=inactive
  else
    state=not-found
  fi
  load_state=loaded
  active_state=inactive
  sub_state=dead
  main_pid=0
  control_group="/system.slice/${unit}"
  case "$state" in
    inactive) ;;
    not-found) load_state=not-found; control_group='' ;;
    failed) active_state=failed; sub_state=failed ;;
    active) active_state=active; sub_state=running; main_pid=123 ;;
    activating) active_state=activating; sub_state=start; main_pid=123 ;;
    deactivating) active_state=deactivating; sub_state=stop; main_pid=123 ;;
    reloading) active_state=reloading; sub_state=reload; main_pid=123 ;;
    *) exit 64 ;;
  esac
  if [[ -n "$control_group" ]]; then
    cgroup_directory="${cgroup_root}${control_group}"
    mkdir -p -- "$cgroup_directory"
    if [[ -f "${control_root}/test-cgroup-unreadable" ]]; then
      find -P "$cgroup_directory" -depth -mindepth 1 -delete
      rmdir -- "$cgroup_directory"
    else
      : > "${cgroup_directory}/cgroup.procs"
    fi
  fi
  printf 'Id=%s\nLoadState=%s\nActiveState=%s\nSubState=%s\nMainPID=%s\nControlGroup=%s\n' \
    "$unit" "$load_state" "$active_state" "$sub_state" "$main_pid" "$control_group"
  exit 0
fi
if [[ "${1:-}" == reset-failed ]]; then
  [[ ! -f "${control_root}/test-reset-fail" ]] || exit 1
  exit 0
fi
exit 1
SYSTEMCTL_STUB
cat > "$bin_root/systemd-run" <<'SYSTEMD_RUN_STUB'
#!/bin/bash
set -euo pipefail
IFS=$'\n\t'
umask 0077
bin_root="${BASH_SOURCE[0]%/*}"
fixture_root="${bin_root%/*}"
control_root="${fixture_root}/control"
log_path="${fixture_root}/systemd-argv.log"
real_node="$(< "${bin_root}/real-node.path")"
module_path="$(< "${bin_root}/module.path")"
[[ "$PATH" == '/usr/sbin:/usr/bin:/sbin:/bin' && "$LANG" == C \
  && "$LC_ALL" == C && "$TZ" == UTC \
  && -z "${UNEXPECTED_EXPORTED_SENTINEL+x}" ]] || exit 91
printf '%s\n' '---SYSTEMD-RUN---' "$@" >> "$log_path"
arguments=("$@")
command_index=-1
child_payload_index=-1
credential_file=''
verify=false
drain=false
evidence=''
inaccessible_path=''
bind_path=''
bind_read_only_path=''
read_write_path=''
release_sha=''
key_id=''
unit=''
reversible_write=false
child_phase=''
child_contract_mode=''
child_marker_seen=false
property_user=''
property_group=''
property_supplementary_groups=''
property_set_login_environment=''
property_working_directory=''
property_environment=''
property_unset_environment=''
property_no_new_privileges=''
property_capability_bounding_set='__absent__'
property_ambient_capabilities='__absent__'
property_ip_address_deny=''
property_ip_address_allow=''
property_delegate=''
property_memory_pressure_watch=''
property_private_tmp=''
property_private_devices=''
property_protect_system=''
property_protect_home=''
property_protect_proc=''
property_proc_subset=''
property_protect_kernel_tunables=''
property_protect_kernel_modules=''
property_protect_kernel_logs=''
property_protect_control_groups=''
property_protect_clock=''
property_protect_hostname=''
property_lock_personality=''
property_restrict_realtime=''
property_restrict_suidsgid=''
property_system_call_architectures=''
property_restrict_address_families=''
property_kill_mode=''
property_timeout_stop=''
property_umask=''
property_standard_output=''
property_standard_error=''
property_runtime_max=''
read_only_paths=''
for ((index = 0; index < ${#arguments[@]}; index += 1)); do
  argument="${arguments[$index]}"
  if [[ "$argument" == -- && "$command_index" -lt 0 ]]; then
    command_index=$((index + 1))
  fi
  case "$argument" in
    --unit=*) unit="${argument#--unit=}" ;;
    --leetplus-child-policy-v1)
      child_marker_seen=true
      child_phase="${arguments[$((index + 1))]:-}"
      child_contract_mode="${arguments[$((index + 2))]:-}"
      ;;
    --child-payload) child_payload_index=$((index + 1)) ;;
    --property=LoadCredential=current-release-runtime.json:*) credential_file="${argument#*:}" ;;
    --property=User=*) property_user="${argument#--property=*=}" ;;
    --property=Group=*) property_group="${argument#--property=*=}" ;;
    --property=SupplementaryGroups=*) property_supplementary_groups="${argument#--property=*=}" ;;
    --property=SetLoginEnvironment=*) property_set_login_environment="${argument#--property=*=}" ;;
    --property=WorkingDirectory=*) property_working_directory="${argument#--property=*=}" ;;
    --property=Environment=*)
      if [[ -n "$property_environment" ]]; then property_environment+=' '; fi
      property_environment+="${argument#--property=*=}"
      ;;
    --property=UnsetEnvironment=*) property_unset_environment="${argument#--property=*=}" ;;
    --property=NoNewPrivileges=*) property_no_new_privileges="${argument#--property=*=}" ;;
    --property=CapabilityBoundingSet=*) property_capability_bounding_set="${argument#--property=*=}" ;;
    --property=AmbientCapabilities=*) property_ambient_capabilities="${argument#--property=*=}" ;;
    --property=IPAddressDeny=*) property_ip_address_deny="${argument#--property=*=}" ;;
    --property=IPAddressAllow=*) property_ip_address_allow="${argument#--property=*=}" ;;
    --property=Delegate=*) property_delegate="${argument#--property=*=}" ;;
    --property=MemoryPressureWatch=*) property_memory_pressure_watch="${argument#--property=*=}" ;;
    --property=PrivateTmp=*) property_private_tmp="${argument#--property=*=}" ;;
    --property=PrivateDevices=*) property_private_devices="${argument#--property=*=}" ;;
    --property=ProtectSystem=*) property_protect_system="${argument#--property=*=}" ;;
    --property=ProtectHome=*) property_protect_home="${argument#--property=*=}" ;;
    --property=ProtectProc=*) property_protect_proc="${argument#--property=*=}" ;;
    --property=ProcSubset=*) property_proc_subset="${argument#--property=*=}" ;;
    --property=ProtectKernelTunables=*) property_protect_kernel_tunables="${argument#--property=*=}" ;;
    --property=ProtectKernelModules=*) property_protect_kernel_modules="${argument#--property=*=}" ;;
    --property=ProtectKernelLogs=*) property_protect_kernel_logs="${argument#--property=*=}" ;;
    --property=ProtectControlGroups=*) property_protect_control_groups="${argument#--property=*=}" ;;
    --property=ProtectClock=*) property_protect_clock="${argument#--property=*=}" ;;
    --property=ProtectHostname=*) property_protect_hostname="${argument#--property=*=}" ;;
    --property=LockPersonality=*) property_lock_personality="${argument#--property=*=}" ;;
    --property=RestrictRealtime=*) property_restrict_realtime="${argument#--property=*=}" ;;
    --property=RestrictSUIDSGID=*) property_restrict_suidsgid="${argument#--property=*=}" ;;
    --property=SystemCallArchitectures=*) property_system_call_architectures="${argument#--property=*=}" ;;
    --property=RestrictAddressFamilies=*) property_restrict_address_families="${argument#--property=*=}" ;;
    --property=InaccessiblePaths=*) inaccessible_path="${argument#--property=*=}" ;;
    --property=BindPaths=*) bind_path="${argument#--property=*=}" ;;
    --property=BindReadOnlyPaths=*) bind_read_only_path="${argument#--property=*=}" ;;
    --property=ReadOnlyPaths=*)
      if [[ -n "$read_only_paths" ]]; then read_only_paths+=' '; fi
      read_only_paths+="${argument#--property=*=}"
      ;;
    --property=ReadWritePaths=*) read_write_path="${argument#--property=*=}" ;;
    --property=KillMode=*) property_kill_mode="${argument#--property=*=}" ;;
    --property=TimeoutStopSec=*) property_timeout_stop="${argument#--property=*=}" ;;
    --property=UMask=*) property_umask="${argument#--property=*=}" ;;
    --property=StandardOutput=*) property_standard_output="${argument#--property=*=}" ;;
    --property=StandardError=*) property_standard_error="${argument#--property=*=}" ;;
    --property=RuntimeMaxSec=*) property_runtime_max="${argument#--property=*=}" ;;
    --verify-evidence) verify=true ;;
    --drain-check) drain=true ;;
    --evidence) evidence="${arguments[$((index + 1))]:-}" ;;
    --release-sha) release_sha="${arguments[$((index + 1))]:-}" ;;
    --evidence-key-id) key_id="${arguments[$((index + 1))]:-}" ;;
    --with-reversible-write) reversible_write=true ;;
  esac
done
((command_index >= 0)) || exit 70
[[ "$child_marker_seen" == true && "$child_phase" =~ ^(main|verify|replay|drain)$ \
  && "$child_contract_mode" == production \
  && "$child_payload_index" -gt "$command_index" ]] || exit 69
[[ -f "$credential_file" ]] || exit 71
if [[ "$inaccessible_path" != "${fixture_root}/evidence" ]]; then
  printf 'INACCESSIBLE_PATH_ACTUAL=%q\nINACCESSIBLE_PATH_EXPECTED=%q\n' \
    "$inaccessible_path" "${fixture_root}/evidence" >> "$log_path"
  exit 78
fi
policy_path="${control_root}/unit-policy-${unit%.service}"
normalized_bind_path="${bind_path%:norbind}"
normalized_bind_read_only_path="${bind_read_only_path%:norbind}"
command_path="${arguments[$command_index]}"
if [[ "$property_ip_address_deny" == any ]]; then
  property_ip_address_deny='0.0.0.0/0 ::/0'
fi
if [[ "$property_ip_address_allow" == localhost ]]; then
  property_ip_address_allow='127.0.0.0/8 ::1/128'
fi
{
  printf 'User=%s\n' "$property_user"
  printf 'Group=%s\n' "$property_group"
  printf 'SupplementaryGroups=%s\n' "$property_supplementary_groups"
  printf 'DynamicUser=no\n'
  printf 'LoadCredential=current-release-runtime.json:%s\n' "$credential_file"
  printf 'WorkingDirectory=%s\n' "$property_working_directory"
  printf 'Environment=%s\n' "$property_environment"
  printf 'EnvironmentFiles=\n'
  printf 'PassEnvironment=\n'
  printf 'SetLoginEnvironment=%s\n' "$property_set_login_environment"
  printf 'UnsetEnvironment=%s\n' "$property_unset_environment"
  printf 'NoNewPrivileges=%s\n' "$property_no_new_privileges"
  printf 'CapabilityBoundingSet=%s\n' "${property_capability_bounding_set/__absent__/}"
  printf 'AmbientCapabilities=%s\n' "${property_ambient_capabilities/__absent__/}"
  printf 'IPAddressDeny=%s\n' "$property_ip_address_deny"
  printf 'IPAddressAllow=%s\n' "$property_ip_address_allow"
  printf 'Delegate=%s\n' "$property_delegate"
  printf 'MemoryPressureWatch=%s\n' "$property_memory_pressure_watch"
  printf 'PrivateTmp=%s\n' "$property_private_tmp"
  printf 'PrivateDevices=%s\n' "$property_private_devices"
  printf 'ProtectSystem=%s\n' "$property_protect_system"
  printf 'ProtectHome=%s\n' "$property_protect_home"
  printf 'ProtectProc=%s\n' "$property_protect_proc"
  printf 'ProcSubset=%s\n' "$property_proc_subset"
  printf 'ProtectKernelTunables=%s\n' "$property_protect_kernel_tunables"
  printf 'ProtectKernelModules=%s\n' "$property_protect_kernel_modules"
  printf 'ProtectKernelLogs=%s\n' "$property_protect_kernel_logs"
  printf 'ProtectControlGroups=%s\n' "$property_protect_control_groups"
  printf 'ProtectClock=%s\n' "$property_protect_clock"
  printf 'ProtectHostname=%s\n' "$property_protect_hostname"
  printf 'LockPersonality=%s\n' "$property_lock_personality"
  printf 'RestrictRealtime=%s\n' "$property_restrict_realtime"
  printf 'RestrictSUIDSGID=%s\n' "$property_restrict_suidsgid"
  printf 'SystemCallArchitectures=%s\n' "$property_system_call_architectures"
  printf 'RestrictAddressFamilies=%s\n' "$property_restrict_address_families"
  printf 'RootDirectory=\nRootImage=\n'
  printf 'InaccessiblePaths=%s\n' "$inaccessible_path"
  printf 'BindPaths=%s\n' "$normalized_bind_path"
  printf 'BindReadOnlyPaths=%s\n' "$normalized_bind_read_only_path"
  printf 'ReadOnlyPaths=%s\n' "$read_only_paths"
  printf 'ReadWritePaths=%s\n' "$read_write_path"
  printf 'KillMode=%s\n' "$property_kill_mode"
  printf 'TimeoutStopUSec=%s\n' "$property_timeout_stop"
  printf 'UMask=%s\n' "$property_umask"
  printf 'StandardOutput=%s\n' "$property_standard_output"
  printf 'StandardError=%s\n' "$property_standard_error"
  if [[ "$property_runtime_max" == 840s ]]; then
    printf 'RuntimeMaxUSec=14min\n'
  else
    printf 'RuntimeMaxUSec=%s\n' "$property_runtime_max"
  fi
  printf 'ExecStart={ path=%s ; argv[]=%s --leetplus-child-policy-v1 %s %s %s ; ignore_errors=no ; pid=0 ; code=exited ; status=0/0 }\n' \
    "$command_path" "$command_path" "$child_phase" "$child_contract_mode" "$unit"
} > "$policy_path"
chmod 0600 "$policy_path"
if [[ "$drain" == true ]]; then
  [[ -z "$bind_path" && -z "$bind_read_only_path" && -z "$read_write_path" \
    && -z "$evidence" ]] || exit 79
  if [[ -f "${control_root}/test-drain-exit" ]]; then
    exit "$(< "${control_root}/test-drain-exit")"
  fi
  exit 0
fi
if [[ "$verify" == false ]]; then
  [[ "$unit" == leetplus-current-release-acceptance-*.service \
    && -n "$evidence" && -n "$release_sha" && -n "$key_id" ]] || exit 72
  operation_name="${unit#leetplus-current-release-acceptance-}"
  operation_name="${operation_name%.service}"
  host_directory="${fixture_root}/evidence/${operation_name}"
  unit_directory="${control_root}/unit-evidence/${operation_name}"
  [[ "$bind_path" == "${host_directory}:${unit_directory}:norbind" \
    && -z "$bind_read_only_path" && "$read_write_path" == "$unit_directory" \
    && "$evidence" == "${unit_directory}/receipt.json" ]] || exit 80
  host_evidence="${host_directory}/receipt.json"
  [[ ! -f "${control_root}/test-drop-before-main" ]] || exit 75
  if [[ -f "${control_root}/test-sibling-tamper" ]]; then
    sibling_receipt="${fixture_root}/evidence/response01/receipt.json"
    if printf 'forbidden-sibling-tamper\n' 2>/dev/null >> "$sibling_receipt"; then
      exit 76
    fi
  fi
  cleanup_projection="$reversible_write"
  if [[ -f "${control_root}/test-omit-write-cleanup-projection" ]]; then
    cleanup_projection=false
  fi
  "$real_node" --input-type=module - \
    "$module_path" "$credential_file" "$host_evidence" "$release_sha" "$key_id" \
    "$reversible_write" "$cleanup_projection" <<'NODE'
import fs from "node:fs";
import { pathToFileURL } from "node:url";
const [modulePath, credentialPath, evidencePath, releaseSha, keyId,
  reversibleWrite, cleanupProjection] = process.argv.slice(2);
const implementation = await import(pathToFileURL(modulePath).href);
const credential = JSON.parse(fs.readFileSync(credentialPath, "utf8"));
const receipt = implementation.createSignedCurrentReleaseReceipt({
  contractVersion: implementation.CURRENT_RELEASE_RUNTIME_ACCEPTANCE_CONTRACT,
  decision: implementation.CURRENT_RELEASE_RUNTIME_ACCEPTANCE_PASS,
  evidence: {
    runtime: { startupTimeoutMs: 90000 },
    ...(reversibleWrite === "true" && cleanupProjection === "true" ? {
      cleanup: { directCleanupRequired: false, residue: 0 },
      http: { reversibleWriteExercised: true },
    } : {}),
  },
  reasonCode: null,
  releaseSha,
}, { hmacKey: credential.evidenceHmacKey, keyId });
const descriptor = fs.openSync(evidencePath,
  fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
fs.writeFileSync(descriptor, `${JSON.stringify(receipt)}\n`, "utf8");
fs.fsyncSync(descriptor);
fs.closeSync(descriptor);
const directory = fs.openSync(new URL(".", pathToFileURL(evidencePath)), fs.constants.O_RDONLY);
try {
  fs.fsyncSync(directory);
} catch (error) {
  if (process.platform !== "win32" || error?.code !== "EPERM") throw error;
}
  fs.closeSync(directory);
NODE
  if [[ -f "${control_root}/test-oversize" ]]; then
    "$real_node" --input-type=module --eval \
      'import fs from "node:fs"; fs.truncateSync(process.argv[1], 8 * 1024 * 1024 + 1);' \
      "$host_evidence"
  fi
  if [[ -f "${control_root}/test-extra-newline-entry" ]]; then
    printf 'unexpected-extra-evidence\n' > "${host_evidence%/*}/"$'\n'
  fi
  if [[ -f "${control_root}/test-main-exit" ]]; then
    exit "$(< "${control_root}/test-main-exit")"
  fi
  exit 124
fi
[[ "$unit" == leetplus-current-release-verify-*.service \
  || "$unit" == leetplus-current-release-replay-*.service ]] || exit 72
[[ -z "$bind_path" && -z "$read_write_path" && -n "$bind_read_only_path" \
  && -n "$evidence" ]] || exit 73
bind_source="${bind_read_only_path%%:*}"
bind_remainder="${bind_read_only_path#*:}"
bind_destination="${bind_remainder%:norbind}"
[[ "$bind_remainder" == "${bind_destination}:norbind" \
  && "$bind_source" == "${fixture_root}/evidence/"* \
  && "$bind_destination" == "${control_root}/unit-evidence/"* \
  && "${bind_source##*/}" == "${bind_destination##*/}" \
  && "$evidence" == "${bind_destination}/receipt.json" ]] || exit 81
host_evidence="${bind_source}/receipt.json"
[[ -f "$host_evidence" ]] || exit 82
credential_directory="$(mktemp -d /tmp/leetplus-current-credential.XXXXXXXX)"
case "$credential_directory" in /tmp/leetplus-current-credential.*) ;; *) exit 72 ;; esac
cp -- "$credential_file" "$credential_directory/current-release-runtime.json"
chmod 0400 "$credential_directory/current-release-runtime.json"
  verify_arguments=("$real_node" "${arguments[@]:child_payload_index}")
for ((index = 0; index < ${#verify_arguments[@]}; index += 1)); do
  if [[ "${verify_arguments[$index]}" == --evidence ]]; then
    verify_arguments[$((index + 1))]="$host_evidence"
  fi
done
set +e
CREDENTIALS_DIRECTORY="$credential_directory" \
  "${verify_arguments[@]}" >/dev/null 2>&1
status=$?
set -e
find -P "$credential_directory" -depth -mindepth 1 -delete
rmdir "$credential_directory"
exit "$status"
SYSTEMD_RUN_STUB
chmod 0500 "$bin_root/node" "$bin_root/node20" "$bin_root/timeout" "$bin_root/flock" \
  "$bin_root/systemctl" "$bin_root/systemd-run"

base_arguments=(
  --operation-id response01
  --release-sha "$RELEASE_SHA"
  --tenant-slug wrapper-club
  --expected-system-identifier "$SYSTEM_IDENTIFIER"
  --expected-migration-count 1
  --expected-migration-head "$MIGRATION_HEAD"
  --api-port 4311
  --web-port 4312
  --credential-id fixture-credential
  --evidence-key-id fixture-key-v1
  --unprivileged-test-mode
  --test-release-root "$release_root"
  --test-credential-root "$credential_root"
  --test-evidence-root "$evidence_root"
  --test-control-root "$control_root"
  --test-systemd-run-bin "$bin_root/systemd-run"
  --test-systemctl-bin "$bin_root/systemctl"
  --test-timeout-bin "$bin_root/timeout"
  --test-flock-bin "$bin_root/flock"
  --test-node-bin "$bin_root/node"
  --test-proc-root "$proc_root"
  --test-cli-path "$CLI"
)

enable_fault() {
  local name="$1"
  : > "${control_root}/test-${name}"
}

set_fault_value() {
  local name="$1" value="$2"
  printf '%s\n' "$value" > "${control_root}/test-${name}"
}

disable_fault() {
  local name="$1"
  unlink -- "${control_root}/test-${name}"
}

# The common identity validator is exercised in test mode with the same exact
# passwd/group records used by production admission.
for identity_fault in \
  bad-service-shell \
  explicit-service-group-member \
  foreign-primary-gid \
  duplicate-service-uid \
  duplicate-service-gid; do
  identity_arguments=("${base_arguments[@]}")
  identity_arguments[1]="${identity_fault//-/}01"
  identity_arguments[1]="${identity_arguments[1]:0:16}"
  enable_fault "$identity_fault"
  if /usr/bin/bash -p "$WRAPPER" "${identity_arguments[@]}" \
    > "${fixture_root}/${identity_fault}.out" 2>&1; then
    die "wrapper accepted hostile service identity: ${identity_fault}"
  fi
  disable_fault "$identity_fault"
  grep -E 'fixed rehearsal (passwd identity/home/shell|primary group or reverse membership)|duplicate or foreign reverse identity' \
    "${fixture_root}/${identity_fault}.out" >/dev/null \
    || die "service identity negative failed for another invariant: ${identity_fault}"
done

# A same-UID process in any cgroup blocks admission before credential staging or
# durable operation state. The fake proc root keeps this deterministic/non-root.
foreign_pid_root="${proc_root}/4242"
mkdir -- "$foreign_pid_root"
printf 'Name:\tforeign\nUid:\t%s\t%s\t%s\t%s\n' \
  "$(id -u)" "$(id -u)" "$(id -u)" "$(id -u)" > "${foreign_pid_root}/status"
printf '0::/foreign-rehearsal-process\n' > "${foreign_pid_root}/cgroup"
foreign_process_arguments=("${base_arguments[@]}")
foreign_process_arguments[1]=foreignuid01
if /usr/bin/bash -p "$WRAPPER" "${foreign_process_arguments[@]}" \
  > "${fixture_root}/foreign-process.out" 2>&1; then
  die 'wrapper admitted a foreign same-UID process/cgroup'
fi
grep -F 'a foreign rehearsal service-UID process/cgroup exists or cannot be excluded' \
  "${fixture_root}/foreign-process.out" >/dev/null \
  || die 'foreign same-UID process negative failed for another invariant'
unlink -- "${foreign_pid_root}/status"
unlink -- "${foreign_pid_root}/cgroup"
rmdir -- "$foreign_pid_root"

poison_bash_env="${fixture_root}/poison-bash-env.sh"
printf ': > %q\n' "${control_root}/inherited-bash-env-executed" > "$poison_bash_env"
chmod 0400 "$poison_bash_env"
BASH_ENV="$poison_bash_env" ENV="$poison_bash_env" \
  NODE_OPTIONS='--definitely-invalid-wrapper-fixture-option' \
  UNEXPECTED_EXPORTED_SENTINEL='must-be-scrubbed' \
  /usr/bin/bash -p "$WRAPPER" "${base_arguments[@]}" > "$wrapper_output"
[[ ! -e "${control_root}/inherited-bash-env-executed" ]] \
  || die 'privileged bootstrap sourced an inherited Bash environment file'
grep -F -x 'CURRENT_RELEASE_RESTORED_COPY_RUNTIME_ACCEPTANCE=PASS' "$wrapper_output" >/dev/null
grep -F -x 'RESPONSE_RECONCILED=true' "$wrapper_output" >/dev/null
operation_directory="${evidence_root}/response01"
receipt_path="${operation_directory}/receipt.json"
intent_path="${control_root}/response01.intent.json"
completion_path="${control_root}/response01.completion.json"
[[ -f "$receipt_path" && ! -L "$receipt_path" && -f "$intent_path" && ! -L "$intent_path" ]] \
  || die 'lost-response run did not preserve receipt and intent'
[[ -f "$completion_path" && ! -L "$completion_path" \
  && ! -e "${control_root}/active-operation.json" ]] \
  || die 'completed run did not durably replace its active-operation marker'
[[ "$(stat -c '%a' -- "$evidence_root")" == 710 \
  && "$(stat -c '%a' -- "$operation_directory")" == 750 \
  && "$(stat -c '%a:%h' -- "$receipt_path")" == '440:1' ]] \
  || die 'per-operation evidence was not frozen behind the exact parent boundary'
unit_evidence_root="${control_root}/unit-evidence"
unit_operation_directory="${unit_evidence_root}/response01"
[[ "$(stat -c '%a' -- "$unit_evidence_root")" == 710 \
  && ! -e "$unit_operation_directory" && ! -L "$unit_operation_directory" ]] \
  || die 'operation-scoped unit evidence target was not cleaned after completion'

expected_unset_argument='--property=UnsetEnvironment=CURRENT_RELEASE_RESTORED_DATABASE_URL CURRENT_RELEASE_EVIDENCE_HMAC_KEY CURRENT_RELEASE_LOGIN_EMAIL CURRENT_RELEASE_LOGIN_PASSWORD BASH_ENV ENV SGX_AESM_ADDR NODE_OPTIONS NODE_PATH NODE_EXTRA_CA_CERTS NODE_DEBUG NODE_V8_COVERAGE NODE_COMPILE_CACHE SSLKEYLOGFILE LD_PRELOAD LD_LIBRARY_PATH LD_AUDIT GCONV_PATH LOCPATH OPENSSL_CONF OPENSSL_MODULES GLIBC_TUNABLES MALLOC_CHECK_ MALLOC_PERTURB_ HTTP_PROXY HTTPS_PROXY FTP_PROXY ALL_PROXY NO_PROXY http_proxy https_proxy ftp_proxy all_proxy no_proxy NODE_USE_ENV_PROXY CURL_HOME CURL_CA_BUNDLE SSL_CERT_FILE SSL_CERT_DIR TMP TMPDIR TEMP XDG_CONFIG_HOME XDG_CACHE_HOME NPM_CONFIG_USERCONFIG npm_config_userconfig NPM_CONFIG_GLOBALCONFIG npm_config_globalconfig NPM_CONFIG_NODE_OPTIONS npm_config_node_options NPM_CONFIG_SCRIPT_SHELL npm_config_script_shell PNPM_HOME COREPACK_HOME GIT_CONFIG_GLOBAL GIT_CONFIG_SYSTEM'
for exact_argument in \
  '--property=User=leetplus-rehearsal' \
  '--property=Group=leetplus-rehearsal' \
  '--property=SupplementaryGroups=leetplus-runtime' \
  '--property=NoNewPrivileges=yes' \
  '--property=CapabilityBoundingSet=' \
  '--property=AmbientCapabilities=' \
  '--property=IPAddressDeny=any' \
  '--property=IPAddressAllow=localhost' \
  '--property=Delegate=no' \
  '--property=MemoryPressureWatch=skip' \
  '--property=PrivateTmp=yes' \
  '--property=ProtectSystem=strict' \
  '--property=ProtectHome=yes' \
  "--property=InaccessiblePaths=${evidence_root}" \
  '--property=KillMode=control-group' \
  '--property=TimeoutStopSec=20s' \
  '--property=UMask=0077' \
  '--property=StandardOutput=null' \
  '--property=StandardError=null' \
  "$expected_unset_argument" \
  "--property=ReadOnlyPaths=${artifact_root}" \
  "--property=LoadCredential=current-release-runtime.json:${credential_file}"; do
  grep -F -x -- "$exact_argument" "$log_path" >/dev/null \
    || die "systemd property is absent: ${exact_argument}"
done
if grep -E '^--property=SupplementaryGroups=' "$log_path" \
  | grep -F -v -x -- '--property=SupplementaryGroups=leetplus-runtime' >/dev/null; then
  die 'a transient unit received an undocumented supplementary group'
fi
grep -F -x "readonly ARTIFACT_READ_GROUP='leetplus-runtime'" "$WRAPPER" >/dev/null \
  || die 'production artifact-read group is not fixed in the wrapper'
grep -F 'rehearsal service must belong only to its primary group and leetplus-runtime' \
  "$WRAPPER" >/dev/null \
  || die 'production service group-set admission is not exact'
if grep -E '^--property=UnsetEnvironment=' "$log_path" \
  | grep -F -v -x -- "$expected_unset_argument" >/dev/null; then
  die 'a transient unit received a weaker environment scrub set'
fi
grep -F -x -- "--property=BindPaths=${operation_directory}:${unit_operation_directory}:norbind" \
  "$log_path" >/dev/null || die 'main service lacks the exact private evidence bind'
grep -F -x -- "--property=ReadWritePaths=${unit_operation_directory}" "$log_path" >/dev/null \
  || die 'main service lacks the exact unit-private evidence write boundary'
if grep -F -x -- "--property=ReadWritePaths=${evidence_root}" "$log_path" >/dev/null; then
  die 'main service can write the shared evidence parent'
fi
grep -F -x -- '--property=RuntimeMaxSec=840s' "$log_path" >/dev/null \
  || die 'main service lacks the bounded runtime maximum'
grep -F -x -- "--property=BindReadOnlyPaths=${operation_directory}:${unit_operation_directory}:norbind" \
  "$log_path" >/dev/null || die 'verifier lacks the exact private read-only evidence bind'
grep -F -x -- "--property=ReadOnlyPaths=${unit_operation_directory}" "$log_path" >/dev/null \
  || die 'verifier lacks the exact unit-private read-only evidence boundary'
grep -F -x -- '--property=RuntimeMaxSec=30s' "$log_path" >/dev/null \
  || die 'verifier lacks the bounded runtime maximum'
grep -F -x -- '--verify-evidence' "$log_path" >/dev/null \
  || die 'lost-response recovery did not invoke the signed CLI verifier'
grep -F -x -- '--drain-check' "$log_path" >/dev/null \
  || die 'independent restored-copy database-session drain was not invoked'
grep -F -x -- "--unit=leetplus-current-release-acceptance-response01.service" "$log_path" >/dev/null \
  || die 'main unit name is not exact'
grep -F -x -- "--unit=leetplus-current-release-verify-response01.service" "$log_path" >/dev/null \
  || die 'verifier unit name is not exact'
grep -F -x -- "--unit=leetplus-current-release-drain-response01.service" "$log_path" >/dev/null \
  || die 'database-drain unit name is not exact'
for state_argument in show '--property=Id' '--property=LoadState' '--property=ActiveState' \
  '--property=SubState' '--property=MainPID' '--property=ControlGroup'; do
  grep -F -x -- "$state_argument" "$log_path" >/dev/null \
    || die "bounded systemd state query is absent: ${state_argument}"
done

for secret in "$HMAC_SECRET" "$LOGIN_PASSWORD" "$DATABASE_URL" "$LOGIN_EMAIL"; do
  if grep -F -- "$secret" "$log_path" "$wrapper_output" "$intent_path" \
    "$completion_path" "$receipt_path" >/dev/null; then
    die 'a credential value escaped into argv/output/intent/evidence'
  fi
done

# Explicit replay performs verification only and never starts the runtime again.
/usr/bin/bash -p "$WRAPPER" "${base_arguments[@]}" --reconcile > "${fixture_root}/reconcile.out"
grep -F -x 'CURRENT_RELEASE_RESTORED_COPY_RUNTIME_ACCEPTANCE=PASS' \
  "${fixture_root}/reconcile.out" >/dev/null
[[ "$(grep -F -x -- '--confirm' "$log_path" | wc -l | tr -d ' ')" == 1 ]] \
  || die 'explicit reconciliation restarted the runtime'
[[ "$(grep -F -x -- '--verify-evidence' "$log_path" | wc -l | tr -d ' ')" == 2 ]] \
  || die 'explicit reconciliation did not repeat only signed verification'
grep -F '"credentialId":"fixture-credential"' "$intent_path" >/dev/null \
  || die 'durable intent does not bind the credential ID'
grep -E '"credentialStatIdentity":"[0-9]+(:[0-9]+){4}"' "$intent_path" >/dev/null \
  || die 'durable intent does not bind a stable credential stat identity'
grep -F "\"unitEvidenceDirectory\":\"${unit_operation_directory}\"" "$intent_path" >/dev/null \
  || die 'durable intent does not bind the operation-scoped unit evidence directory'
grep -F "\"unitEvidencePath\":\"${unit_operation_directory}/receipt.json\"" "$intent_path" >/dev/null \
  || die 'durable intent does not bind the unit-private CLI evidence path'

# The transient bind-target root is exact and raw-byte parsed. Even an extra
# newline-only directory is rejected before a new operation publishes intent.
unit_root_newline_path="${unit_evidence_root}/"$'\n'
mkdir -- "$unit_root_newline_path"
unit_root_arguments=("${base_arguments[@]}")
unit_root_arguments[1]=unitroot01
if /usr/bin/bash -p "$WRAPPER" "${unit_root_arguments[@]}" \
  > "${fixture_root}/unit-root-extra.out" 2>&1; then
  die 'wrapper accepted an extra unit evidence target name'
fi
grep -F 'operation-scoped unit evidence root contains an unexpected or unsafe entry' \
  "${fixture_root}/unit-root-extra.out" >/dev/null \
  || die 'unit evidence root negative failed for another invariant'
[[ ! -e "${control_root}/unitroot01.intent.json" ]] \
  || die 'unit evidence root negative mutated durable operation state'
rmdir -- "$unit_root_newline_path"

# A later service receives write access only to its own child. The prior frozen
# receipt remains byte-identical even when the stub explicitly tries to append.
prior_receipt_digest="$(sha256sum "$receipt_path" | awk '{ print $1 }')"
sibling_arguments=("${base_arguments[@]}")
sibling_arguments[1]=siblingop01
enable_fault sibling-tamper
/usr/bin/bash -p "$WRAPPER" "${sibling_arguments[@]}" > "${fixture_root}/sibling.out"
disable_fault sibling-tamper
[[ "$(sha256sum "$receipt_path" | awk '{ print $1 }')" == "$prior_receipt_digest" ]] \
  || die 'a later operation modified a frozen sibling receipt'
[[ "$(stat -c '%a' -- "${evidence_root}/siblingop01")" == 750 \
  && "$(stat -c '%a' -- "${evidence_root}/siblingop01/receipt.json")" == 440 ]] \
  || die 'later operation evidence was not independently frozen'

# The nonblocking authority lock rejects concurrent same- and different-operation
# controllers before either can mutate durable operation state.
concurrent_arguments=("${base_arguments[@]}")
concurrent_arguments[1]=concurrent01
enable_fault flock-block
/usr/bin/bash -p "$WRAPPER" "${concurrent_arguments[@]}" \
  > "${fixture_root}/concurrent-first.out" 2>&1 &
background_pid=$!
flock_ready=false
for _attempt in {1..100}; do
  if [[ -f "${control_root}/fixture-flock-sentinel/ready" ]]; then
    flock_ready=true
    break
  fi
  sleep 0.05
done
[[ "$flock_ready" == true ]] || die 'blocking flock fixture did not become ready'

different_concurrent_arguments=("${base_arguments[@]}")
different_concurrent_arguments[1]=concurrent02
if /usr/bin/bash -p "$WRAPPER" "${different_concurrent_arguments[@]}" \
  > "${fixture_root}/concurrent-different.out" 2>&1; then
  die 'global flock admitted a concurrent different operation'
fi
grep -F 'another current-release acceptance wrapper holds the global operation lock' \
  "${fixture_root}/concurrent-different.out" >/dev/null \
  || die 'different-operation concurrency negative failed for another invariant'
if /usr/bin/bash -p "$WRAPPER" "${concurrent_arguments[@]}" \
  > "${fixture_root}/concurrent-same.out" 2>&1; then
  die 'global flock admitted a concurrent identical operation'
fi
grep -F 'another current-release acceptance wrapper holds the global operation lock' \
  "${fixture_root}/concurrent-same.out" >/dev/null \
  || die 'same-operation concurrency negative failed for another invariant'
disable_fault flock-block
: > "${control_root}/fixture-flock-sentinel/release"
wait "$background_pid" || die 'first concurrent controller did not complete after lock release'
background_pid=''

# A crash after active-marker fsync but before any launch is recoverable only by
# the exact request, and reconciliation proves the exact unit was never created.
crash_arguments=("${base_arguments[@]}")
crash_arguments[1]=crashmark01
enable_fault crash-after-marker
if /usr/bin/bash -p "$WRAPPER" "${crash_arguments[@]}" > "${fixture_root}/crash-marker.out" 2>&1; then
  die 'post-marker crash hook unexpectedly completed'
fi
disable_fault crash-after-marker
active_marker_path="${control_root}/active-operation.json"
crash_directory="${evidence_root}/crashmark01"
crash_unit_directory="${unit_evidence_root}/crashmark01"
[[ -f "$active_marker_path" && ! -L "$active_marker_path" \
  && -d "$crash_directory" && "$(stat -c '%a' -- "$crash_directory")" == 700 \
  && -d "$crash_unit_directory" && "$(stat -c '%a' -- "$crash_unit_directory")" == 700 \
  && ! -e "${control_root}/crashmark01.main.launch.json" ]] \
  || die 'post-marker crash did not preserve the exact pre-launch state'
grep -F '"credentialId":"fixture-credential"' "$active_marker_path" >/dev/null \
  || die 'active marker does not bind the credential ID'
grep -E '"credentialStatIdentity":"[0-9]+(:[0-9]+){4}"' "$active_marker_path" >/dev/null \
  || die 'active marker does not bind nanosecond credential identity'
grep -F "\"unitEvidenceDirectory\":\"${crash_unit_directory}\"" "$active_marker_path" >/dev/null \
  || die 'active marker does not bind the operation-scoped unit evidence directory'

blocked_arguments=("${base_arguments[@]}")
blocked_arguments[1]=blockedop01
if /usr/bin/bash -p "$WRAPPER" "${blocked_arguments[@]}" > "${fixture_root}/blocked-active.out" 2>&1; then
  die 'a different operation replaced the durable active operation'
fi
grep -F 'durable control file content is invalid' "${fixture_root}/blocked-active.out" >/dev/null \
  || die 'different-operation active-marker negative failed for another invariant'
if /usr/bin/bash -p "$WRAPPER" "${crash_arguments[@]}" > "${fixture_root}/same-active.out" 2>&1; then
  die 'an identical fresh operation bypassed explicit reconciliation'
fi
grep -F 'only --reconcile may resume it' "${fixture_root}/same-active.out" >/dev/null \
  || die 'same-operation active-marker negative failed for another invariant'
set_fault_value unit-state not-found
if /usr/bin/bash -p "$WRAPPER" "${crash_arguments[@]}" --reconcile \
  > "${fixture_root}/crash-reconcile.out" 2>&1; then
  die 'never-launched reconciliation incorrectly reported acceptance'
fi
disable_fault unit-state
grep -F 'active marker reconciled as never launched' \
  "${fixture_root}/crash-reconcile.out" >/dev/null \
  || die 'never-launched reconciliation failed for another invariant'
[[ ! -e "$active_marker_path" && ! -e "$crash_directory" \
  && ! -e "$crash_unit_directory" ]] \
  || die 'conclusively never-launched operation retained mutable state'

# The main phase record is only a durable submission intent. A crash after its
# fsync but before systemd-run is reconciled as exact not-found/no-evidence,
# independently drained and durably closed as FAIL without launching main.
presubmit_arguments=("${base_arguments[@]}")
presubmit_arguments[1]=presubmit01
enable_fault crash-after-main-submission-intent
if /usr/bin/bash -p "$WRAPPER" "${presubmit_arguments[@]}" \
  > "${fixture_root}/presubmit-crash.out" 2>&1; then
  die 'pre-submit crash hook unexpectedly completed'
fi
disable_fault crash-after-main-submission-intent
presubmit_directory="${evidence_root}/presubmit01"
[[ -f "$active_marker_path" \
  && -f "${control_root}/presubmit01.main.launch.json" \
  && -d "$presubmit_directory" \
  && -z "$(find -P "$presubmit_directory" -mindepth 1 -maxdepth 1 -print -quit)" \
  && ! -f "${control_root}/presubmit01.completion.json" ]] \
  || die 'pre-submit crash did not preserve exact empty submission-intent state'
confirm_count_before_presubmit_reconcile="$(grep -F -x -- '--confirm' "$log_path" | wc -l | tr -d ' ')"
drain_count_before_presubmit_reconcile="$(grep -F -x -- '--drain-check' "$log_path" | wc -l | tr -d ' ')"
if /usr/bin/bash -p "$WRAPPER" "${presubmit_arguments[@]}" --reconcile \
  > "${fixture_root}/presubmit-reconcile.out" 2>&1; then
  die 'pre-submit no-effect reconciliation incorrectly reported acceptance'
fi
confirm_count_after_presubmit_reconcile="$(grep -F -x -- '--confirm' "$log_path" | wc -l | tr -d ' ')"
drain_count_after_presubmit_reconcile="$(grep -F -x -- '--drain-check' "$log_path" | wc -l | tr -d ' ')"
grep -F 'current-release acceptance evidence failed closed' \
  "${fixture_root}/presubmit-reconcile.out" >/dev/null \
  || die 'pre-submit no-effect reconciliation failed for another invariant'
[[ "$confirm_count_after_presubmit_reconcile" == "$confirm_count_before_presubmit_reconcile" \
  && "$drain_count_after_presubmit_reconcile" == $((drain_count_before_presubmit_reconcile + 1)) \
  && ! -e "$active_marker_path" \
  && ! -e "$presubmit_directory" \
  && -f "${control_root}/presubmit01.completion.json" ]] \
  || die 'pre-submit reconciliation launched main or retained mutable state'

# The same exact absent/empty state is not automatically releasable for a
# reversible-write request: a create could have committed before the crash and
# left no receipt. Even after independent drain, the active marker remains for
# manual residue review. This fixture then removes only its own test state.
write_unknown_arguments=("${base_arguments[@]}")
write_unknown_arguments[1]=writeunknown01
write_unknown_arguments+=(--with-reversible-write)
enable_fault crash-after-main-submission-intent
if /usr/bin/bash -p "$WRAPPER" "${write_unknown_arguments[@]}" \
  > "${fixture_root}/write-unknown-crash.out" 2>&1; then
  die 'write-enabled pre-submit crash hook unexpectedly completed'
fi
disable_fault crash-after-main-submission-intent
write_unknown_directory="${evidence_root}/writeunknown01"
write_unknown_unit_directory="${unit_evidence_root}/writeunknown01"
confirm_count_before_write_unknown="$(grep -F -x -- '--confirm' "$log_path" | wc -l | tr -d ' ')"
drain_count_before_write_unknown="$(grep -F -x -- '--drain-check' "$log_path" | wc -l | tr -d ' ')"
verify_count_before_write_unknown="$(grep -F -x -- '--verify-evidence' "$log_path" | wc -l | tr -d ' ')"
if /usr/bin/bash -p "$WRAPPER" "${write_unknown_arguments[@]}" --reconcile \
  > "${fixture_root}/write-unknown-reconcile.out" 2>&1; then
  die 'write-enabled empty-evidence reconciliation released unknown residue state'
fi
confirm_count_after_write_unknown="$(grep -F -x -- '--confirm' "$log_path" | wc -l | tr -d ' ')"
drain_count_after_write_unknown="$(grep -F -x -- '--drain-check' "$log_path" | wc -l | tr -d ' ')"
verify_count_after_write_unknown="$(grep -F -x -- '--verify-evidence' "$log_path" | wc -l | tr -d ' ')"
grep -F 'reversible-write operation lacks independently verified zero-residue PASS evidence' \
  "${fixture_root}/write-unknown-reconcile.out" >/dev/null \
  || die 'write-enabled unknown-residue negative failed for another invariant'
[[ "$confirm_count_after_write_unknown" == "$confirm_count_before_write_unknown" \
  && "$drain_count_after_write_unknown" == $((drain_count_before_write_unknown + 1)) \
  && "$verify_count_after_write_unknown" == "$verify_count_before_write_unknown" \
  && -f "$active_marker_path" \
  && -d "$write_unknown_directory" \
  && -d "$write_unknown_unit_directory" \
  && -z "$(find -P "$write_unknown_directory" -mindepth 1 -maxdepth 1 -print -quit)" \
  && ! -f "${control_root}/writeunknown01.completion.json" ]] \
  || die 'write-enabled unknown-residue state did not remain fail-closed after drain'
for write_unknown_state in \
  "$active_marker_path" \
  "${control_root}/writeunknown01.intent.json" \
  "${control_root}/writeunknown01.main.launch.json" \
  "${control_root}/writeunknown01.drain.launch.json"; do
  [[ -f "$write_unknown_state" && ! -L "$write_unknown_state" ]] \
    || die 'write-enabled fixture cleanup target is absent or unsafe'
  unlink -- "$write_unknown_state"
done
rmdir -- "$write_unknown_directory"
rmdir -- "$write_unknown_unit_directory"

# A valid HMAC/decision alone does not release a write operation when the
# cleanup projection is absent. The exact frozen signed receipt and active
# marker remain for manual review.
write_projection_arguments=("${base_arguments[@]}")
write_projection_arguments[1]=writeprojection01
write_projection_arguments+=(--with-reversible-write)
enable_fault omit-write-cleanup-projection
if /usr/bin/bash -p "$WRAPPER" "${write_projection_arguments[@]}" \
  > "${fixture_root}/write-projection.out" 2>&1; then
  die 'write-enabled receipt without cleanup projection was accepted'
fi
disable_fault omit-write-cleanup-projection
write_projection_directory="${evidence_root}/writeprojection01"
write_projection_unit_directory="${unit_evidence_root}/writeprojection01"
grep -F 'reversible-write operation lacks independently verified zero-residue PASS evidence' \
  "${fixture_root}/write-projection.out" >/dev/null \
  || die 'write cleanup-projection negative failed for another invariant'
[[ -f "$active_marker_path" \
  && -f "${write_projection_directory}/receipt.json" \
  && -d "$write_projection_unit_directory" \
  && "$(stat -c '%a' -- "$write_projection_directory")" == 750 \
  && "$(stat -c '%a' -- "${write_projection_directory}/receipt.json")" == 440 \
  && ! -f "${control_root}/writeprojection01.completion.json" ]] \
  || die 'unproven write cleanup did not preserve frozen manual recovery state'
for write_projection_state in \
  "$active_marker_path" \
  "${control_root}/writeprojection01.intent.json" \
  "${control_root}/writeprojection01.main.launch.json" \
  "${control_root}/writeprojection01.drain.launch.json" \
  "${control_root}/writeprojection01.verify.launch.json"; do
  [[ -f "$write_projection_state" && ! -L "$write_projection_state" ]] \
    || die 'write cleanup-projection fixture target is absent or unsafe'
  unlink -- "$write_projection_state"
done
unlink -- "${write_projection_directory}/receipt.json"
rmdir -- "$write_projection_directory"
rmdir -- "$write_projection_unit_directory"

# The matching positive path releases only a signed PASS that contains the
# exact reversible-write flag and zero-residue cleanup projection.
write_pass_arguments=("${base_arguments[@]}")
write_pass_arguments[1]=writepass01
write_pass_arguments+=(--with-reversible-write)
/usr/bin/bash -p "$WRAPPER" "${write_pass_arguments[@]}" \
  > "${fixture_root}/write-pass.out"
grep -F -x 'CURRENT_RELEASE_RESTORED_COPY_RUNTIME_ACCEPTANCE=PASS' \
  "${fixture_root}/write-pass.out" >/dev/null \
  || die 'verified reversible-write cleanup projection did not return PASS'
[[ ! -e "$active_marker_path" \
  && -f "${control_root}/writepass01.completion.json" \
  && "$(stat -c '%a' -- "${evidence_root}/writepass01/receipt.json")" == 440 ]] \
  || die 'verified reversible-write operation did not complete durably'

# A launch-attempt marker makes not-found ambiguous. It is retained until an
# operator can prove the exact unit stopped and independently drain ports/DB.
dropped_arguments=("${base_arguments[@]}")
dropped_arguments[1]=droplaunch01
enable_fault drop-before-main
set_fault_value unit-state not-found
if /usr/bin/bash -p "$WRAPPER" "${dropped_arguments[@]}" > "${fixture_root}/drop-main.out" 2>&1; then
  die 'not-found after a durable launch attempt was accepted'
fi
disable_fault drop-before-main
disable_fault unit-state
grep -F 'not-found-after-launch' "${fixture_root}/drop-main.out" >/dev/null \
  || die 'post-launch not-found ambiguity failed for another invariant'
[[ -f "$active_marker_path" \
  && -f "${control_root}/droplaunch01.main.launch.json" ]] \
  || die 'ambiguous post-launch state discarded durable recovery markers'
if /usr/bin/bash -p "$WRAPPER" "${dropped_arguments[@]}" --reconcile \
  > "${fixture_root}/drop-main-reconcile.out" 2>&1; then
  die 'evidence-free launch reconciliation incorrectly reported PASS'
fi
grep -F 'current-release acceptance evidence failed closed' \
  "${fixture_root}/drop-main-reconcile.out" >/dev/null \
  || die 'conclusive post-launch cleanup failed for another invariant'
[[ ! -e "$active_marker_path" \
  && -f "${control_root}/droplaunch01.completion.json" ]] \
  || die 'conclusive failed launch did not replace its active marker'

# A successfully invoked transient main may be garbage-collected before the
# wrapper observes its terminal state. The first process fails closed. Exact
# reconciliation may accept only the already signed receipt after independent
# port/DB/service-UID drain and signed verifier; it never relaunches main.
gc_arguments=("${base_arguments[@]}")
gc_arguments[1]=mainunitgc01
enable_fault main-unit-gc-notfound
set_fault_value main-exit 0
if /usr/bin/bash -p "$WRAPPER" "${gc_arguments[@]}" > "${fixture_root}/main-gc.out" 2>&1; then
  die 'garbage-collected main unit was accepted without reconciliation'
fi
disable_fault main-exit
grep -F 'not-found-after-launch' "${fixture_root}/main-gc.out" >/dev/null \
  || die 'garbage-collected main negative failed for another invariant'
gc_receipt="${evidence_root}/mainunitgc01/receipt.json"
[[ -f "$active_marker_path" && -f "$gc_receipt" \
  && "$(stat -c '%a' -- "$gc_receipt")" == 600 \
  && ! -f "${control_root}/mainunitgc01.completion.json" ]] \
  || die 'garbage-collected main failure discarded its signed recovery state'
confirm_count_before_gc_reconcile="$(grep -F -x -- '--confirm' "$log_path" | wc -l | tr -d ' ')"
drain_count_before_gc_reconcile="$(grep -F -x -- '--drain-check' "$log_path" | wc -l | tr -d ' ')"
verify_count_before_gc_reconcile="$(grep -F -x -- '--verify-evidence' "$log_path" | wc -l | tr -d ' ')"
/usr/bin/bash -p "$WRAPPER" "${gc_arguments[@]}" --reconcile \
  > "${fixture_root}/main-gc-reconcile.out"
confirm_count_after_gc_reconcile="$(grep -F -x -- '--confirm' "$log_path" | wc -l | tr -d ' ')"
drain_count_after_gc_reconcile="$(grep -F -x -- '--drain-check' "$log_path" | wc -l | tr -d ' ')"
verify_count_after_gc_reconcile="$(grep -F -x -- '--verify-evidence' "$log_path" | wc -l | tr -d ' ')"
disable_fault main-unit-gc-notfound
grep -F -x 'CURRENT_RELEASE_RESTORED_COPY_RUNTIME_ACCEPTANCE=PASS' \
  "${fixture_root}/main-gc-reconcile.out" >/dev/null \
  || die 'signed garbage-collected main reconciliation did not return PASS'
[[ "$confirm_count_after_gc_reconcile" == "$confirm_count_before_gc_reconcile" \
  && "$drain_count_after_gc_reconcile" == $((drain_count_before_gc_reconcile + 1)) \
  && "$verify_count_after_gc_reconcile" == $((verify_count_before_gc_reconcile + 1)) \
  && ! -e "$active_marker_path" \
  && -f "${control_root}/mainunitgc01.completion.json" \
  && "$(stat -c '%a' -- "$gc_receipt")" == 440 ]] \
  || die 'garbage-collected main reconciliation relaunched main or skipped durable completion'

# A synchronous successful response from the two read-only phases remains
# usable when systemd has already collected their transient unit metadata.
readonly_gc_arguments=("${base_arguments[@]}")
readonly_gc_arguments[1]=readonlygc01
enable_fault drain-unit-gc-notfound
enable_fault verify-unit-gc-notfound
/usr/bin/bash -p "$WRAPPER" "${readonly_gc_arguments[@]}" \
  > "${fixture_root}/readonly-gc.out"
disable_fault drain-unit-gc-notfound
disable_fault verify-unit-gc-notfound
grep -F -x 'CURRENT_RELEASE_RESTORED_COPY_RUNTIME_ACCEPTANCE=PASS' \
  "${fixture_root}/readonly-gc.out" >/dev/null \
  || die 'synchronous collected read-only phases did not return PASS'
[[ ! -e "$active_marker_path" \
  && -f "${control_root}/readonlygc01.completion.json" ]] \
  || die 'synchronous collected read-only phases did not complete durably'

# Lost response after the read-only DB drain may coincide with collection of
# its transient unit. Exact reconciliation reruns that bounded oracle, never
# main, and may accept only after the remaining signed verification succeeds.
drain_gc_arguments=("${base_arguments[@]}")
drain_gc_arguments[1]=draingc01
enable_fault drain-unit-gc-notfound
enable_fault crash-after-drain-response
if /usr/bin/bash -p "$WRAPPER" "${drain_gc_arguments[@]}" \
  > "${fixture_root}/drain-gc.out" 2>&1; then
  die 'post-drain lost-response hook unexpectedly completed'
fi
disable_fault crash-after-drain-response
[[ -f "$active_marker_path" \
  && -f "${control_root}/draingc01.drain.launch.json" \
  && ! -f "${control_root}/draingc01.completion.json" ]] \
  || die 'post-drain lost response discarded its durable phase state'
confirm_count_before_drain_gc="$(grep -F -x -- '--confirm' "$log_path" | wc -l | tr -d ' ')"
drain_count_before_drain_gc="$(grep -F -x -- '--drain-check' "$log_path" | wc -l | tr -d ' ')"
verify_count_before_drain_gc="$(grep -F -x -- '--verify-evidence' "$log_path" | wc -l | tr -d ' ')"
/usr/bin/bash -p "$WRAPPER" "${drain_gc_arguments[@]}" --reconcile \
  > "${fixture_root}/drain-gc-reconcile.out"
confirm_count_after_drain_gc="$(grep -F -x -- '--confirm' "$log_path" | wc -l | tr -d ' ')"
drain_count_after_drain_gc="$(grep -F -x -- '--drain-check' "$log_path" | wc -l | tr -d ' ')"
verify_count_after_drain_gc="$(grep -F -x -- '--verify-evidence' "$log_path" | wc -l | tr -d ' ')"
disable_fault drain-unit-gc-notfound
[[ "$confirm_count_after_drain_gc" == "$confirm_count_before_drain_gc" \
  && "$drain_count_after_drain_gc" == $((drain_count_before_drain_gc + 1)) \
  && "$verify_count_after_drain_gc" == $((verify_count_before_drain_gc + 1)) \
  && ! -e "$active_marker_path" \
  && -f "${control_root}/draingc01.completion.json" ]] \
  || die 'garbage-collected drain reconciliation wedged or relaunched main'

# The signed verifier is also read-only. A lost response plus collected unit is
# resolved by rerunning the exact artifact verifier against the frozen receipt.
verify_gc_arguments=("${base_arguments[@]}")
verify_gc_arguments[1]=verifygc01
enable_fault verify-unit-gc-notfound
enable_fault crash-after-verify-response
if /usr/bin/bash -p "$WRAPPER" "${verify_gc_arguments[@]}" \
  > "${fixture_root}/verify-gc.out" 2>&1; then
  die 'post-verifier lost-response hook unexpectedly completed'
fi
disable_fault crash-after-verify-response
[[ -f "$active_marker_path" \
  && -f "${control_root}/verifygc01.verify.launch.json" \
  && ! -f "${control_root}/verifygc01.completion.json" ]] \
  || die 'post-verifier lost response discarded its durable phase state'
confirm_count_before_verify_gc="$(grep -F -x -- '--confirm' "$log_path" | wc -l | tr -d ' ')"
drain_count_before_verify_gc="$(grep -F -x -- '--drain-check' "$log_path" | wc -l | tr -d ' ')"
verify_count_before_verify_gc="$(grep -F -x -- '--verify-evidence' "$log_path" | wc -l | tr -d ' ')"
/usr/bin/bash -p "$WRAPPER" "${verify_gc_arguments[@]}" --reconcile \
  > "${fixture_root}/verify-gc-reconcile.out"
confirm_count_after_verify_gc="$(grep -F -x -- '--confirm' "$log_path" | wc -l | tr -d ' ')"
drain_count_after_verify_gc="$(grep -F -x -- '--drain-check' "$log_path" | wc -l | tr -d ' ')"
verify_count_after_verify_gc="$(grep -F -x -- '--verify-evidence' "$log_path" | wc -l | tr -d ' ')"
disable_fault verify-unit-gc-notfound
[[ "$confirm_count_after_verify_gc" == "$confirm_count_before_verify_gc" \
  && "$drain_count_after_verify_gc" == $((drain_count_before_verify_gc + 1)) \
  && "$verify_count_after_verify_gc" == $((verify_count_before_verify_gc + 1)) \
  && ! -e "$active_marker_path" \
  && -f "${control_root}/verifygc01.completion.json" ]] \
  || die 'garbage-collected verifier reconciliation wedged or relaunched main'

# A nested file with the manifest basename is still part of exact coverage.
printf 'nested-manifest-name-must-not-be-excluded\n' \
  > "$artifact_root/packages/database/HYDRATED_SHA256SUMS"
chmod 0600 "$artifact_root/packages/database/HYDRATED_SHA256SUMS"
nested_arguments=("${base_arguments[@]}")
nested_arguments[1]=nestedfile01
if /usr/bin/bash -p "$WRAPPER" "${nested_arguments[@]}" > "${fixture_root}/nested.out" 2>&1; then
  die 'wrapper excluded a nested HYDRATED_SHA256SUMS basename from full coverage'
fi
grep -F 'hydrated manifest does not exactly cover every regular artifact file' \
  "${fixture_root}/nested.out" >/dev/null \
  || die 'nested manifest-basename negative failed for another invariant'
unlink "$artifact_root/packages/database/HYDRATED_SHA256SUMS"

# The authority runtime is pinned to Node major 22.
node20_arguments=("${base_arguments[@]}")
node20_arguments[1]=nodebad001
for ((index = 0; index < ${#node20_arguments[@]}; index += 1)); do
  if [[ "${node20_arguments[$index]}" == --test-node-bin ]]; then
    node20_arguments[$((index + 1))]="$bin_root/node20"
    break
  fi
done
if /usr/bin/bash -p "$WRAPPER" "${node20_arguments[@]}" > "${fixture_root}/node20.out" 2>&1; then
  die 'wrapper accepted a non-22 Node runtime'
fi
grep -F 'current-release acceptance requires exact Node major 22' \
  "${fixture_root}/node20.out" >/dev/null \
  || die 'Node-major negative failed for another invariant'

# Preexisting evidence is rejected before a new intent is admitted.
mkdir -- "${evidence_root}/preexist01"
chmod 0700 "${evidence_root}/preexist01"
printf '{}\n' > "${evidence_root}/preexist01/receipt.json"
chmod 0600 "${evidence_root}/preexist01/receipt.json"
preexisting_arguments=("${base_arguments[@]}")
preexisting_arguments[1]=preexist01
if /usr/bin/bash -p "$WRAPPER" "${preexisting_arguments[@]}" > "${fixture_root}/preexisting.out" 2>&1; then
  die 'wrapper accepted a preexisting evidence path'
fi
grep -F 'per-operation evidence directory already exists before the operation intent' \
  "${fixture_root}/preexisting.out" >/dev/null \
  || die 'preexisting evidence negative failed for another invariant'

# A symlinked credential is never followed, even in explicit test mode.
ln -s -- "$credential_file" "${credential_root}/linked-credential.json"
if [[ -L "${credential_root}/linked-credential.json" ]]; then
  linked_arguments=("${base_arguments[@]}")
  linked_arguments[1]=linkedcred01
  for ((index = 0; index < ${#linked_arguments[@]}; index += 1)); do
    if [[ "${linked_arguments[$index]}" == --credential-id ]]; then
      linked_arguments[$((index + 1))]=linked-credential
    fi
  done
  if /usr/bin/bash -p "$WRAPPER" "${linked_arguments[@]}" > "${fixture_root}/linked.out" 2>&1; then
    die 'wrapper accepted a symlinked credential'
  fi
  grep -F 'credential file is absent, symlinked or non-canonical' \
    "${fixture_root}/linked.out" >/dev/null \
    || die 'symlinked credential negative failed for another invariant'
fi

# A writable artifact boundary is rejected before systemd is called.
chmod 0770 "$artifact_root"
if (( (8#$(stat -c '%a' -- "$artifact_root") & 8#022) != 0 )); then
  writable_arguments=("${base_arguments[@]}")
  writable_arguments[1]=writable01
  if /usr/bin/bash -p "$WRAPPER" "${writable_arguments[@]}" > "${fixture_root}/writable.out" 2>&1; then
    die 'wrapper accepted a writable artifact boundary'
  fi
  grep -F 'directory is group/other-writable' "${fixture_root}/writable.out" >/dev/null \
    || die 'writable artifact negative failed for another invariant'
fi
chmod 0700 "$artifact_root"

# Any effective transient-policy drift is rejected before its receipt can be
# admitted. Exact reconcile may continue only after the property oracle is clean.
policy_arguments=("${base_arguments[@]}")
policy_arguments[1]=policybad01
enable_fault unit-policy-drift
if /usr/bin/bash -p "$WRAPPER" "${policy_arguments[@]}" \
  > "${fixture_root}/policy.out" 2>&1; then
  die 'wrapper accepted a drifted effective transient-unit policy'
fi
disable_fault unit-policy-drift
grep -F 'systemd unit effective policy differs for User' \
  "${fixture_root}/policy.out" >/dev/null \
  || die 'effective-policy negative failed for another invariant'
[[ -f "$active_marker_path" ]] \
  || die 'effective-policy failure discarded the active operation marker'
/usr/bin/bash -p "$WRAPPER" "${policy_arguments[@]}" --reconcile \
  > "${fixture_root}/policy-reconcile.out"
[[ ! -e "$active_marker_path" ]] \
  || die 'effective-policy reconciliation retained active state'

# An active unit is fail-closed and its signed evidence remains available.
active_arguments=("${base_arguments[@]}")
active_arguments[1]=activeunit01
enable_fault force-active
if /usr/bin/bash -p "$WRAPPER" "${active_arguments[@]}" > "${fixture_root}/active.out" 2>&1; then
  die 'wrapper accepted an active runtime unit'
fi
disable_fault force-active
grep -E 'systemd unit (state is incomplete|is active, transitional)' \
  "${fixture_root}/active.out" >/dev/null \
  || die 'active-unit negative failed for another invariant'
[[ -f "${evidence_root}/activeunit01/receipt.json" \
  && "$(stat -c '%a' -- "${evidence_root}/activeunit01/receipt.json")" == 600 \
  && -f "$active_marker_path" ]] \
  || die 'active-unit failure discarded signed evidence'
/usr/bin/bash -p "$WRAPPER" "${active_arguments[@]}" --reconcile \
  > "${fixture_root}/active-reconcile.out"
[[ ! -e "$active_marker_path" ]] \
  || die 'conclusive active-unit reconciliation retained the global marker'

# Transitional unit states are not equivalent to stopped, even with evidence.
transition_arguments=("${base_arguments[@]}")
transition_arguments[1]=transition01
set_fault_value unit-state deactivating
if /usr/bin/bash -p "$WRAPPER" "${transition_arguments[@]}" > "${fixture_root}/transition.out" 2>&1; then
  die 'wrapper accepted a transitional runtime unit'
fi
disable_fault unit-state
grep -E 'systemd unit (state is incomplete|is active, transitional)' \
  "${fixture_root}/transition.out" >/dev/null \
  || die 'transitional-unit negative failed for another invariant'
[[ -f "${evidence_root}/transition01/receipt.json" \
  && "$(stat -c '%a' -- "${evidence_root}/transition01/receipt.json")" == 600 \
  && -f "$active_marker_path" ]] \
  || die 'transitional-unit failure discarded signed evidence'
/usr/bin/bash -p "$WRAPPER" "${transition_arguments[@]}" --reconcile \
  > "${fixture_root}/transition-reconcile.out"
[[ ! -e "$active_marker_path" ]] \
  || die 'conclusive transitional-unit reconciliation retained the global marker'

# An unreadable or nonempty exact cgroup is ambiguous and retains the marker.
cgroup_arguments=("${base_arguments[@]}")
cgroup_arguments[1]=cgroupbad01
enable_fault cgroup-content-nonempty
if /usr/bin/bash -p "$WRAPPER" "${cgroup_arguments[@]}" > "${fixture_root}/cgroup.out" 2>&1; then
  die 'wrapper accepted a nonempty unit cgroup'
fi
disable_fault cgroup-content-nonempty
[[ -f "${control_root}/test-cgroup-reader-invoked" ]] \
  || die 'nonempty cgroup negative did not exercise the bounded content reader'
unlink -- "${control_root}/test-cgroup-reader-invoked"
grep -F 'unit cgroup is unreadable, nonempty or unbounded' \
  "${fixture_root}/cgroup.out" >/dev/null \
  || die 'nonempty-cgroup negative failed for another invariant'
[[ -f "$active_marker_path" ]] || die 'nonempty cgroup discarded the active marker'
/usr/bin/bash -p "$WRAPPER" "${cgroup_arguments[@]}" --reconcile \
  > "${fixture_root}/cgroup-reconcile.out"

unreadable_cgroup_arguments=("${base_arguments[@]}")
unreadable_cgroup_arguments[1]=cgroupgone01
enable_fault cgroup-unreadable
if /usr/bin/bash -p "$WRAPPER" "${unreadable_cgroup_arguments[@]}" \
  > "${fixture_root}/cgroup-unreadable.out" 2>&1; then
  die 'wrapper accepted an unreadable unit cgroup'
fi
disable_fault cgroup-unreadable
grep -F 'unit cgroup is unreadable, nonempty or unbounded' \
  "${fixture_root}/cgroup-unreadable.out" >/dev/null \
  || die 'unreadable-cgroup negative failed for another invariant'
[[ -f "$active_marker_path" ]] || die 'unreadable cgroup discarded the active marker'
/usr/bin/bash -p "$WRAPPER" "${unreadable_cgroup_arguments[@]}" --reconcile \
  > "${fixture_root}/cgroup-unreadable-reconcile.out"

transport_arguments=("${base_arguments[@]}")
transport_arguments[1]=transport01
enable_fault systemctl-transport-error
if /usr/bin/bash -p "$WRAPPER" "${transport_arguments[@]}" > "${fixture_root}/transport.out" 2>&1; then
  die 'wrapper accepted a systemctl transport error'
fi
disable_fault systemctl-transport-error
grep -F 'systemd unit state is unavailable or unbounded' \
  "${fixture_root}/transport.out" >/dev/null \
  || die 'systemctl-transport negative failed for another invariant'
[[ -f "$active_marker_path" ]] || die 'systemctl transport error discarded the active marker'
/usr/bin/bash -p "$WRAPPER" "${transport_arguments[@]}" --reconcile \
  > "${fixture_root}/transport-reconcile.out"

# A bounded reset-failed error happens only after the exact completion record is
# durable. Exact reconciliation consumes that record and never relaunches main.
reset_arguments=("${base_arguments[@]}")
reset_arguments[1]=resetfail01
enable_fault reset-fail
if /usr/bin/bash -p "$WRAPPER" "${reset_arguments[@]}" > "${fixture_root}/reset.out" 2>&1; then
  die 'wrapper accepted an incomplete reset-failed cleanup'
fi
disable_fault reset-fail
grep -F 'bounded systemd reset-failed cleanup did not complete' \
  "${fixture_root}/reset.out" >/dev/null \
  || die 'bounded-reset negative failed for another invariant'
[[ -f "$active_marker_path" \
  && -f "${control_root}/resetfail01.completion.json" ]] \
  || die 'bounded-reset failure was not preceded by durable completion'
confirm_count_before_reset_reconcile="$(grep -F -x -- '--confirm' "$log_path" | wc -l | tr -d ' ')"
/usr/bin/bash -p "$WRAPPER" "${reset_arguments[@]}" --reconcile \
  > "${fixture_root}/reset-reconcile.out"
confirm_count_after_reset_reconcile="$(grep -F -x -- '--confirm' "$log_path" | wc -l | tr -d ' ')"
[[ "$confirm_count_after_reset_reconcile" == "$confirm_count_before_reset_reconcile" \
  && ! -e "$active_marker_path" \
  && -f "${control_root}/resetfail01.completion.json" ]] \
  || die 'lost-response reconciliation relaunched main or failed to complete'
grep -F -x -- '10s' "$log_path" >/dev/null \
  || die 'reset-failed cleanup is not protected by the exact outer timeout'

# A process crash after reset-failed cannot erase the already-fsynced result.
# Reconciliation uses completion even when reset has unloaded the exact units.
reset_crash_arguments=("${base_arguments[@]}")
reset_crash_arguments[1]=resetcrash01
enable_fault crash-after-reset
if /usr/bin/bash -p "$WRAPPER" "${reset_crash_arguments[@]}" \
  > "${fixture_root}/reset-crash.out" 2>&1; then
  die 'post-reset crash hook unexpectedly completed'
fi
disable_fault crash-after-reset
[[ -f "$active_marker_path" \
  && -f "${control_root}/resetcrash01.completion.json" ]] \
  || die 'post-reset crash lost its durable completion or active marker'
confirm_count_before_reset_crash_reconcile="$(grep -F -x -- '--confirm' "$log_path" | wc -l | tr -d ' ')"
/usr/bin/bash -p "$WRAPPER" "${reset_crash_arguments[@]}" --reconcile \
  > "${fixture_root}/reset-crash-reconcile.out"
confirm_count_after_reset_crash_reconcile="$(grep -F -x -- '--confirm' "$log_path" | wc -l | tr -d ' ')"
[[ "$confirm_count_after_reset_crash_reconcile" == "$confirm_count_before_reset_crash_reconcile" \
  && ! -e "$active_marker_path" ]] \
  || die 'post-reset reconciliation relaunched main or retained active state'

# Raw entry parsing rejects an extra filename made only of LF bytes; a
# newline-delimited command substitution would silently strip this name.
newline_arguments=("${base_arguments[@]}")
newline_arguments[1]=newline01
enable_fault extra-newline-entry
if /usr/bin/bash -p "$WRAPPER" "${newline_arguments[@]}" \
  > "${fixture_root}/newline-entry.out" 2>&1; then
  die 'wrapper accepted an extra newline-only evidence filename'
fi
disable_fault extra-newline-entry
grep -F 'evidence child contains an unexpected or unsafe entry' \
  "${fixture_root}/newline-entry.out" >/dev/null \
  || die 'newline-only evidence negative failed for another invariant'
newline_extra_path="${evidence_root}/newline01/"$'\n'
[[ -f "$newline_extra_path" && -f "$active_marker_path" ]] \
  || die 'newline-only evidence negative did not preserve its exact recovery state'
unlink -- "$newline_extra_path"
/usr/bin/bash -p "$WRAPPER" "${newline_arguments[@]}" --reconcile \
  > "${fixture_root}/newline-entry-reconcile.out"
[[ ! -e "$active_marker_path" ]] \
  || die 'newline-only evidence reconciliation retained active state'

# Oversized evidence is rejected before root-side content inspection.
oversize_arguments=("${base_arguments[@]}")
oversize_arguments[1]=oversize01
enable_fault oversize
if /usr/bin/bash -p "$WRAPPER" "${oversize_arguments[@]}" > "${fixture_root}/oversize.out" 2>&1; then
  die 'wrapper accepted oversized evidence'
fi
disable_fault oversize
grep -F 'current-release acceptance evidence failed closed' \
  "${fixture_root}/oversize.out" >/dev/null \
  || die 'oversized-evidence negative failed for another invariant'
[[ -f "${evidence_root}/oversize01/receipt.json" \
  && "$(stat -c '%a' -- "${evidence_root}/oversize01")" == 750 \
  && "$(stat -c '%a' -- "${evidence_root}/oversize01/receipt.json")" == 440 \
  && ! -e "$active_marker_path" ]] \
  || die 'oversized evidence was read before bounding or was not frozen durably'

# Parse every transient invocation, not just a shared grep: main may write only
# its own child; drain/verifier/replay may read only that operation's child.
"$real_node" --input-type=module - "$log_path" "$evidence_root" "$unit_evidence_root" \
  "$artifact_root" <<'NODE'
import fs from "node:fs";
import path from "node:path";
const [logPath, evidenceRoot, unitEvidenceRoot, artifactRoot] = process.argv.slice(2);
const raw = fs.readFileSync(logPath, "utf8");
const invocations = raw.split("---SYSTEMD-RUN---\n").slice(1).map((chunk) => {
  const lines = chunk.split("\n");
  const boundary = lines.findIndex((line) => line.startsWith("---"));
  return (boundary < 0 ? lines : lines.slice(0, boundary)).filter(Boolean);
});
if (invocations.length < 3) process.exit(1);
for (const args of invocations) {
  const unit = args.find((value) => value.startsWith("--unit="))?.slice(7);
  const inaccessible = args.filter((value) => value.startsWith("--property=InaccessiblePaths="))
    .map((value) => value.slice("--property=InaccessiblePaths=".length));
  const readOnly = args.filter((value) => value.startsWith("--property=ReadOnlyPaths="))
    .map((value) => value.slice("--property=ReadOnlyPaths=".length));
  const readWrite = args.filter((value) => value.startsWith("--property=ReadWritePaths="))
    .map((value) => value.slice("--property=ReadWritePaths=".length));
  const bind = args.filter((value) => value.startsWith("--property=BindPaths="))
    .map((value) => value.slice("--property=BindPaths=".length));
  const bindReadOnly = args.filter((value) => value.startsWith("--property=BindReadOnlyPaths="))
    .map((value) => value.slice("--property=BindReadOnlyPaths=".length));
  const runtimeCredentials = args.filter((value) =>
    value.startsWith("--property=LoadCredential=current-release-runtime.json:"));
  const evidenceCredentials = args.filter((value) =>
    value.startsWith("--property=LoadCredential=") &&
    !value.startsWith("--property=LoadCredential=current-release-runtime.json:"));
  const childPolicyDigests = args.filter((value) =>
    /^--property=Environment=LEETPLUS_CHILD_POLICY_SHA256=[0-9a-f]{64}$/u.test(value));
  const requiredExactProperties = [
    "--property=User=leetplus-rehearsal", "--property=Group=leetplus-rehearsal",
    "--property=SupplementaryGroups=leetplus-runtime",
    "--property=Environment=PATH=/usr/sbin:/usr/bin:/sbin:/bin LANG=C LC_ALL=C TZ=UTC SHELL=/usr/sbin/nologin",
    "--property=SetLoginEnvironment=yes", "--property=NoNewPrivileges=yes",
    "--property=CapabilityBoundingSet=", "--property=AmbientCapabilities=",
    "--property=IPAddressDeny=any", "--property=IPAddressAllow=localhost",
    "--property=Delegate=no", "--property=MemoryPressureWatch=skip",
    "--property=PrivateTmp=yes", "--property=PrivateDevices=yes",
    "--property=ProtectSystem=strict", "--property=ProtectHome=yes",
    "--property=ProtectProc=invisible", "--property=ProcSubset=pid",
    "--property=ProtectKernelTunables=yes", "--property=ProtectKernelModules=yes",
    "--property=ProtectKernelLogs=yes", "--property=ProtectControlGroups=yes",
    "--property=ProtectClock=yes", "--property=ProtectHostname=yes",
    "--property=LockPersonality=yes", "--property=RestrictRealtime=yes",
    "--property=RestrictSUIDSGID=yes", "--property=SystemCallArchitectures=native",
    "--property=RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6",
    "--property=KillMode=control-group", "--property=TimeoutStopSec=20s",
    "--property=UMask=0077", "--property=StandardOutput=null", "--property=StandardError=null",
  ];
  if (!unit || requiredExactProperties.some((property) =>
      args.filter((value) => value === property).length !== 1) ||
      childPolicyDigests.length !== 1 ||
      args.filter((value) => value === "--leetplus-child-policy-v1").length !== 1 ||
      args.filter((value) => value === "--child-payload").length !== 1 ||
      inaccessible.length !== 1 || inaccessible[0] !== evidenceRoot ||
      readOnly.filter((value) => value === artifactRoot).length !== 1 ||
      runtimeCredentials.length !== 1 || evidenceCredentials.length !== 0) process.exit(2);
  const commandBoundary = args.indexOf("--");
  const childPayloadBoundary = args.indexOf("--child-payload");
  if (commandBoundary < 0 || childPayloadBoundary <= commandBoundary ||
      args.slice(childPayloadBoundary + 1).some((value) =>
      value === evidenceRoot || value.startsWith(`${evidenceRoot}/`))) process.exit(8);
  const evidenceIndexes = args.flatMap((value, index) => value === "--evidence" ? [index] : []);
  const parseBinding = (value) => {
    const suffix = ":norbind";
    if (!value.endsWith(suffix)) return null;
    const pair = value.slice(0, -suffix.length);
    const separator = pair.indexOf(":");
    if (separator < 1 || pair.indexOf(":", separator + 1) >= 0) return null;
    const source = pair.slice(0, separator);
    const destination = pair.slice(separator + 1);
    const operation = path.posix.basename(source);
    if (source !== `${evidenceRoot}/${operation}` ||
        destination !== `${unitEvidenceRoot}/${operation}` ||
        !/^[a-z0-9]{8,32}$/u.test(operation)) return null;
    return { destination, operation, source };
  };
  if (unit.startsWith("leetplus-current-release-acceptance-")) {
    const operation = unit.match(/^leetplus-current-release-acceptance-([a-z0-9]{8,32})\.service$/u)?.[1];
    const binding = bind.length === 1 ? parseBinding(bind[0]) : null;
    if (!operation || !binding || binding.operation !== operation || bindReadOnly.length !== 0 ||
        evidenceIndexes.length !== 1 ||
        args[evidenceIndexes[0] + 1] !== `${binding.destination}/receipt.json` ||
        readWrite.length !== 1 || readWrite[0] !== binding.destination ||
        readOnly.length !== 1 || readOnly[0] !== artifactRoot) process.exit(4);
  } else {
    const drain = unit.match(/^leetplus-current-release-drain-([a-z0-9]{8,32})\.service$/u);
    const verifier = unit.match(/^leetplus-current-release-verify-([a-z0-9]{8,32})\.service$/u);
    const replay = unit.startsWith("leetplus-current-release-replay-");
    if (drain) {
      if (evidenceIndexes.length !== 0 || bind.length !== 0 || bindReadOnly.length !== 0 ||
          readWrite.length !== 0 || readOnly.length !== 1 || readOnly[0] !== artifactRoot)
        process.exit(5);
      continue;
    }
    const binding = bindReadOnly.length === 1 ? parseBinding(bindReadOnly[0]) : null;
    if ((!verifier && !replay) || !binding || bind.length !== 0 || readWrite.length !== 0 ||
        evidenceIndexes.length !== 1 ||
        args[evidenceIndexes[0] + 1] !== `${binding.destination}/receipt.json` ||
        readOnly.length !== 2 || !readOnly.includes(artifactRoot) ||
        !readOnly.includes(binding.destination)) process.exit(6);
    if (verifier && binding.operation !== verifier[1]) process.exit(7);
  }
}
NODE

# Overrides without the explicit non-root test switch cannot reach test paths.
no_test_arguments=("${base_arguments[@]}")
for ((index = 0; index < ${#no_test_arguments[@]}; index += 1)); do
  if [[ "${no_test_arguments[$index]}" == --unprivileged-test-mode ]]; then
    unset 'no_test_arguments[index]'
    no_test_arguments=("${no_test_arguments[@]}")
    break
  fi
done
if /usr/bin/bash -p "$WRAPPER" "${no_test_arguments[@]}" > "${fixture_root}/no-test.out" 2>&1; then
  die 'test overrides were accepted without explicit test mode'
fi
grep -F 'production acceptance wrapper must run as root' "${fixture_root}/no-test.out" >/dev/null \
  || die 'test-override authority negative failed for another invariant'

for secret in "$HMAC_SECRET" "$LOGIN_PASSWORD" "$DATABASE_URL" "$LOGIN_EMAIL"; do
  if grep -F -R -- "$secret" "$log_path" "$control_root" "$evidence_root" \
    "${fixture_root}"/*.out >/dev/null; then
    die 'a credential value escaped during an adversarial wrapper scenario'
  fi
done

printf 'current-release restored-copy acceptance wrapper fixture: PASS\n'
