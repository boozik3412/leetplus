#!/usr/bin/bash -p
# Prove that the scheduler-capable production runtime has no surviving unit,
# process/cgroup or database session before schema migration is admitted.

[[ $- == *p* ]] || { printf 'verify-legacy-runtime-drain: privileged Bash mode is required\n' >&2; exit 1; }
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

readonly LEGACY_DATABASE_ROLE='leetplus'
readonly ROLLBACK_DATABASE_ROLE='leetplus_legacy_rollback'
readonly ROLLBACK_APPLICATION_NAME='leetplus-nminus1-http-7de04ff4'
readonly LANGAME_WORKER_AUTHORIZER='/usr/local/libexec/leetplus/verify-langame-daily-worker-authorization.sh'

die() {
  printf 'verify-legacy-runtime-drain: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage: verify-legacy-runtime-drain.sh

Production inputs are pinned to:
  /etc/leetplus/legacy-drain-units.conf
  /var/lib/leetplus/legacy-drain/legacy-processes.snapshot
  PGSERVICE=leetplus-drain-audit

Tests may override paths, settle bounds and command PATH only together with
--unprivileged-test-mode.
USAGE
}

unit_manifest='/etc/leetplus/legacy-drain-units.conf'
process_snapshot='/var/lib/leetplus/legacy-drain/legacy-processes.snapshot'
pg_service_file='/etc/leetplus/pg_service.conf'
pg_service='leetplus-drain-audit'
database_target='/etc/leetplus/legacy-drain-database-target.conf'
fence_marker='/var/lib/leetplus/legacy-drain/legacy-start-fence'
systemd_root='/etc/systemd/system'
cgroup_root='/sys/fs/cgroup'
proc_root='/proc'
settle_seconds=75
clean_samples=3
command_timeout_seconds=10
psql_timeout_seconds=15
unprivileged_test_mode=false

while (($# > 0)); do
  case "$1" in
    --unit-manifest) unit_manifest="${2:-}"; shift 2 ;;
    --process-snapshot) process_snapshot="${2:-}"; shift 2 ;;
    --pg-service-file) pg_service_file="${2:-}"; shift 2 ;;
    --pg-service) pg_service="${2:-}"; shift 2 ;;
    --database-target) database_target="${2:-}"; shift 2 ;;
    --fence-marker) fence_marker="${2:-}"; shift 2 ;;
    --systemd-root) systemd_root="${2:-}"; shift 2 ;;
    --cgroup-root) cgroup_root="${2:-}"; shift 2 ;;
    --proc-root) proc_root="${2:-}"; shift 2 ;;
    --settle-seconds) settle_seconds="${2:-}"; shift 2 ;;
    --clean-samples) clean_samples="${2:-}"; shift 2 ;;
    --command-timeout-seconds) command_timeout_seconds="${2:-}"; shift 2 ;;
    --psql-timeout-seconds) psql_timeout_seconds="${2:-}"; shift 2 ;;
    --unprivileged-test-mode) unprivileged_test_mode=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

[[ "$settle_seconds" =~ ^[1-9][0-9]*$ && "$clean_samples" =~ ^[1-9][0-9]*$ ]] \
  || die 'settle seconds and clean samples must be positive integers'
[[ "$command_timeout_seconds" =~ ^[1-9][0-9]*$ && "$psql_timeout_seconds" =~ ^[1-9][0-9]*$ ]] \
  || die 'command timeouts must be positive integers'
((settle_seconds <= 300 && clean_samples <= 10)) || die 'settle bounds exceed reviewed maxima'
((command_timeout_seconds <= 15 && psql_timeout_seconds <= 20)) || die 'command timeouts exceed reviewed maxima'

if [[ "$unprivileged_test_mode" == true ]]; then
  ((EUID != 0)) || die 'unprivileged test mode is forbidden for root'
  PATH="$LEETPLUS_BOOTSTRAP_TEST_PATH"
  export PATH
else
  ((EUID == 0)) || die 'production drain verification must run as root'
  [[ "$unit_manifest" == '/etc/leetplus/legacy-drain-units.conf' ]] || die 'production unit manifest cannot be overridden'
  [[ "$process_snapshot" == '/var/lib/leetplus/legacy-drain/legacy-processes.snapshot' ]] || die 'production process snapshot cannot be overridden'
  [[ "$pg_service_file" == '/etc/leetplus/pg_service.conf' && "$pg_service" == 'leetplus-drain-audit' ]] \
    || die 'production PostgreSQL audit service cannot be overridden'
  [[ "$database_target" == '/etc/leetplus/legacy-drain-database-target.conf' ]] \
    || die 'production PostgreSQL target identity cannot be overridden'
  [[ "$cgroup_root" == '/sys/fs/cgroup' ]] || die 'production cgroup root cannot be overridden'
  [[ "$proc_root" == '/proc' ]] || die 'production proc root cannot be overridden'
  [[ "$fence_marker" == '/var/lib/leetplus/legacy-drain/legacy-start-fence' ]] \
    || die 'production start fence cannot be overridden'
  [[ "$systemd_root" == '/etc/systemd/system' ]] || die 'production systemd root cannot be overridden'
  [[ "$command_timeout_seconds" == 10 && "$psql_timeout_seconds" == 15 ]] \
    || die 'production command timeouts cannot be overridden'
fi
unset LEETPLUS_BOOTSTRAP_TEST_PATH

for command_name in awk dirname env find findmnt psql realpath sed sha256sum sleep sort stat systemctl timeout tr; do
  command -v "$command_name" >/dev/null 2>&1 || die "required command is unavailable: $command_name"
done

for protected_file in "$unit_manifest" "$process_snapshot" "$pg_service_file" "$database_target" "$fence_marker"; do
  [[ -f "$protected_file" && ! -L "$protected_file" ]] || die "required protected file is absent or symlinked: ${protected_file}"
done
[[ -d "$cgroup_root" && ! -L "$cgroup_root" ]] || die 'cgroup root must be a real directory'
[[ -d "$proc_root" && ! -L "$proc_root" ]] || die 'proc root must be a real directory'
[[ -d "$systemd_root" && ! -L "$systemd_root" ]] || die 'systemd root must be a real directory'

if [[ "$unprivileged_test_mode" == false ]]; then
  for protected_file in "$unit_manifest" "$process_snapshot" "$pg_service_file" "$database_target" "$fence_marker"; do
    [[ "$(realpath -e -- "$protected_file")" == "$protected_file" \
      && "$(stat -c '%U:%G:%h' -- "$protected_file")" == 'root:root:1' ]] \
      || die "protected file is not canonical root-owned/single-linked: ${protected_file}"
    [[ -z "$(find -P "$protected_file" -maxdepth 0 -perm /077 -print -quit)" ]] \
      || die "protected file is group/other-accessible: ${protected_file}"
  done
  [[ "$(realpath -e -- "$systemd_root")" == '/etc/systemd/system' \
    && "$(realpath -e -- "$cgroup_root")" == '/sys/fs/cgroup' \
    && "$(realpath -e -- "$proc_root")" == '/proc' ]] \
    || die 'drain verifier contains a symlinked/noncanonical production ancestor'
  systemd_mount_inventory="$(findmnt --raw --noheadings --output TARGET)" \
    || die 'systemd start-fence mount inventory failed or returned partial output'
  [[ ${#systemd_mount_inventory} -le 4194304 && "$systemd_mount_inventory" != *$'\r'* ]] \
    || die 'systemd start-fence mount inventory is oversized or noncanonical'
  while IFS= read -r mount_target; do
    case "$mount_target" in
      "$systemd_root"|"$systemd_root"/*)
        die "systemd start-fence boundary contains an exact/nested mount: ${mount_target}"
        ;;
    esac
  done <<< "$systemd_mount_inventory"
fi

declare -A database_target_values=()
while IFS='=' read -r target_key target_value; do
  [[ -z "$target_key" || "$target_key" == \#* ]] && continue
  [[ "$target_key" =~ ^[A-Z][A-Z0-9_]*$ && "$target_value" =~ ^[A-Za-z0-9_.:-]+$ ]] \
    || die 'database target file contains an unsafe assignment'
  [[ -z "${database_target_values[$target_key]:-}" ]] || die "duplicate database target key: ${target_key}"
  database_target_values[$target_key]="$target_value"
done < "$database_target"
for target_key in DATABASE_NAME DATABASE_SERVER_ADDRESS DATABASE_SERVER_PORT DATABASE_SYSTEM_IDENTIFIER \
  AUDIT_SESSION_USER FENCE_SESSION_USER FENCE_AUTHORITY_ROLE FENCE_FUNCTION_SCHEMA FENCE_FUNCTION_NAME; do
  [[ -n "${database_target_values[$target_key]:-}" ]] || die "database target key is absent: ${target_key}"
done
[[ "${database_target_values[DATABASE_NAME]}" == 'leetplus' ]] || die 'database target name must be exact production database'
[[ "${database_target_values[DATABASE_SERVER_ADDRESS]}" == '127.0.0.1' ]] || die 'database target server must be loopback TCP'
[[ "${database_target_values[DATABASE_SERVER_PORT]}" == '5432' ]] || die 'database target port must be exact 5432'
[[ "${database_target_values[DATABASE_SYSTEM_IDENTIFIER]}" =~ ^[1-9][0-9]{15,24}$ ]] || die 'database target system identifier is invalid'
[[ "${database_target_values[AUDIT_SESSION_USER]}" =~ ^[a-z_][a-z0-9_]{2,62}$ ]] || die 'database audit session user is invalid'
[[ "${database_target_values[AUDIT_SESSION_USER]}" == leetplus_drain_audit \
  && "${database_target_values[FENCE_SESSION_USER]}" == leetplus_role_fencer \
  && "${database_target_values[FENCE_AUTHORITY_ROLE]}" == leetplus_fence_authority \
  && "${database_target_values[FENCE_FUNCTION_SCHEMA]}" == leetplus_ops \
  && "${database_target_values[FENCE_FUNCTION_NAME]}" == apply_nminus1_legacy_login_fence \
  && ${#database_target_values[@]} == 9 ]] \
  || die 'database audit/fence authority target is not exact'

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
      leetplus-blue-green-recovery.timer|\
      leetplus-bonus-ledger-worker.service|leetplus-bonus-ledger-worker.timer|\
      leetplus-langame-discrepancy-audit-preflight.service) ;;
      *) die "unit is not on the closed SAFE allowlist: ${unit}" ;;
    esac
  fi
  if [[ "$classification" == *_DRAIN ]]; then
    drain_units+=("$unit")
  fi
done < "$unit_manifest"
for canonical_drain in leetplus-api.service leetplus-web.service leetplus-deploy.timer; do
  [[ "${unit_class[$canonical_drain]:-}" == 'REQUIRED_DRAIN' ]] \
    || die "canonical scheduler-capable unit must be REQUIRED_DRAIN: ${canonical_drain}"
done
((${#drain_units[@]} > 0)) || die 'unit manifest contains no drain targets'

systemctl_bounded() {
  timeout --kill-after=2s "${command_timeout_seconds}s" systemctl "$@"
}

unit_files_output="$(systemctl_bounded list-unit-files 'leetplus-*' --type=service --type=timer --no-legend --no-pager)" \
  || die 'installed unit inventory failed or timed out'
loaded_units_output="$(systemctl_bounded list-units 'leetplus-*' --all --type=service --type=timer --plain --no-legend --no-pager)" \
  || die 'loaded/transient unit inventory failed or timed out'
while IFS=$' \t' read -r discovered_unit _; do
  [[ -z "${discovered_unit:-}" ]] && continue
  [[ "$discovered_unit" =~ ^leetplus-[A-Za-z0-9@_.-]+\.(service|timer)$ ]] || continue
  discovered_units[$discovered_unit]=1
  [[ -n "${unit_class[$discovered_unit]:-}" ]] \
    || die "installed/loaded leetplus unit is unclassified: ${discovered_unit}"
done <<< "${unit_files_output}"$'\n'"${loaded_units_output}"

for unit in "${!unit_class[@]}"; do
  if [[ "${unit_class[$unit]}" == 'REQUIRED_DRAIN' && -z "${discovered_units[$unit]:-}" ]]; then
    die "required legacy unit is not installed: ${unit}"
  fi
done

declare -A snapshot_start_ticks=()
while IFS='|' read -r unit pid start_ticks extra; do
  [[ -z "${unit:-}" || "$unit" == \#* ]] && continue
  [[ -z "${extra:-}" ]] || die 'process snapshot line contains extra fields'
  [[ "${unit_class[$unit]:-}" == *_DRAIN ]] || die "snapshot references a non-drain unit: ${unit}"
  [[ "$pid" =~ ^[1-9][0-9]*$ && "$start_ticks" =~ ^[1-9][0-9]*$ ]] || die 'process snapshot contains an invalid PID identity'
  snapshot_key="${pid}:${start_ticks}"
  [[ -z "${snapshot_start_ticks[$snapshot_key]:-}" ]] || die 'process snapshot contains a duplicate PID identity'
  snapshot_start_ticks[$snapshot_key]="$unit"
done < "$process_snapshot"

legacy_process_survives() {
  local snapshot_key pid expected_ticks current_ticks stat_tail
  for snapshot_key in "${!snapshot_start_ticks[@]}"; do
    pid="${snapshot_key%%:*}"
    expected_ticks="${snapshot_key#*:}"
    [[ -r "${proc_root}/${pid}/stat" ]] || continue
    stat_tail="$(sed 's/^.*) //' "${proc_root}/${pid}/stat" 2>/dev/null)" || continue
    current_ticks="$(awk '{ print $20 }' <<< "$stat_tail")"
    if [[ "$current_ticks" == "$expected_ticks" ]]; then
      printf 'legacy process survives: unit=%s pid=%s\n' "${snapshot_start_ticks[$snapshot_key]}" "$pid" >&2
      return 0
    fi
  done
  return 1
}

unit_not_drained() {
  local unit load_state unit_file_state main_pid control_pid exec_main_pid control_group cgroup_path cgroup_pid cgroup_pids
  local fence_dropin fence_directory loaded_dropins expected_fence_line authorized_dropin
  expected_fence_line="ConditionPathExists=!${fence_marker}"
  # This is the sole successor exception. The dedicated authorizer proves the
  # exact two-unit TIMER worker contract (including the successor receipt and
  # modern-slot identity); no other OPTIONAL_DRAIN unit can bypass the durable
  # generic start fence or inactive/disabled process checks below.
  declare -A langame_authorized_units=()
  local langame_service_authorization="${systemd_root}/leetplus-langame-daily-worker.service.d/91-leetplus-langame-worker-authorization.conf"
  local langame_timer_authorization="${systemd_root}/leetplus-langame-daily-worker.timer.d/91-leetplus-langame-worker-authorization.conf"
  if [[ -e "$langame_service_authorization" || -L "$langame_service_authorization" \
    || -e "$langame_timer_authorization" || -L "$langame_timer_authorization" ]]; then
    [[ -f "$langame_service_authorization" && ! -L "$langame_service_authorization" \
      && -f "$langame_timer_authorization" && ! -L "$langame_timer_authorization" ]] \
      || { printf 'Langame worker authorization drop-ins are incomplete or symlinked\n' >&2; return 0; }
    if [[ "$unprivileged_test_mode" == false ]]; then
      [[ "$(stat -c '%U:%G:%a:%h' -- "$langame_service_authorization" "$langame_timer_authorization" | sort -u)" == 'root:root:644:1' ]] \
        || { printf 'Langame worker authorization drop-in authority is unsafe\n' >&2; return 0; }
      [[ -x "$LANGAME_WORKER_AUTHORIZER" && ! -L "$LANGAME_WORKER_AUTHORIZER" \
        && "$(stat -c '%U:%G:%a:%h' -- "$LANGAME_WORKER_AUTHORIZER")" == 'root:root:555:1' ]] \
        || { printf 'Langame worker authorization verifier is absent or unsafe\n' >&2; return 0; }
      langame_authorizer_output="$(timeout --kill-after=5s 90s "$LANGAME_WORKER_AUTHORIZER" 2>&1)" || {
        printf 'Langame worker authorization verifier rejected the worker pair\n' >&2; return 0;
      }
      [[ "$langame_authorizer_output" == LANGAME_DAILY_WORKER_AUTHORIZATION=PASS\ * && "$langame_authorizer_output" != *$'\n'* ]] \
        || { printf 'Langame worker authorization verifier output is not exact\n' >&2; return 0; }
    else
      # Test fixtures must exercise the normal fenced path; they cannot forge
      # a production worker authorization receipt.
      printf 'Langame worker authorization drop-ins are forbidden in unprivileged drain tests\n' >&2
      return 0
    fi
    langame_authorized_units[leetplus-langame-daily-worker.service]=1
    langame_authorized_units[leetplus-langame-daily-worker.timer]=1
  fi
  for unit in "${drain_units[@]}"; do
    load_state="$(systemctl_bounded show --property=LoadState --value "$unit" 2>/dev/null || true)"
    fence_dropin="${systemd_root}/${unit}.d/90-leetplus-nminus1-start-fence.conf"
    fence_directory="$(dirname -- "$fence_dropin")"
    [[ -d "$fence_directory" && ! -L "$fence_directory" \
      && "$(realpath -e -- "$fence_directory")" == "$fence_directory" ]] || {
      printf 'legacy unit start-fence directory is noncanonical: %s\n' "$unit" >&2
      return 0
    }
    if [[ "$unprivileged_test_mode" == false \
      && ( "$(stat -c '%U:%G:%a' -- "$fence_directory")" != 'root:root:755' \
        || -n "$(find -P "$fence_directory" -maxdepth 0 -perm /022 -print -quit)" ) ]]; then
      printf 'legacy unit start-fence directory authority is unsafe: %s\n' "$unit" >&2
      return 0
    fi
    [[ -f "$fence_dropin" && ! -L "$fence_dropin" ]] || {
      printf 'legacy unit lacks its durable start-fence drop-in: %s\n' "$unit" >&2
      return 0
    }
    if [[ "$unprivileged_test_mode" == false \
      && "$(stat -c '%U:%G:%a:%h' -- "$fence_dropin")" != 'root:root:644:1' ]]; then
      printf 'legacy unit start-fence drop-in has unsafe ownership/mode/link count: %s\n' "$unit" >&2
      return 0
    fi
    [[ "$(tr -d '\r' < "$fence_dropin")" == $'[Unit]\n'"${expected_fence_line}" ]] || {
      printf 'legacy unit start-fence drop-in is not exact: %s\n' "$unit" >&2
      return 0
    }
    if [[ "$load_state" == 'not-found' || -z "$load_state" ]]; then
      # OPTIONAL_DRAIN units may be absent today, but their durable drop-in is
      # still mandatory so a later package/install cannot resurrect them
      # without the explicit fence marker being removed by a reviewed flow.
      [[ "${unit_class[$unit]}" == 'OPTIONAL_DRAIN' ]] && continue
      printf 'required drain unit disappeared: %s\n' "$unit" >&2
      return 0
    fi
    loaded_dropins="$(systemctl_bounded show --property=DropInPaths --value "$unit" 2>/dev/null || true)"
    case " $loaded_dropins " in
      *" $fence_dropin "*) ;;
      *)
        printf 'legacy unit start-fence drop-in is not loaded: %s\n' "$unit" >&2
        return 0
        ;;
    esac
    if [[ -n "${langame_authorized_units[$unit]:-}" ]]; then
      continue
    fi
    if systemctl_bounded is-active --quiet "$unit"; then
      printf 'legacy unit is still active: %s\n' "$unit" >&2
      return 0
    fi
    unit_file_state="$(systemctl_bounded show --property=UnitFileState --value "$unit" 2>/dev/null || true)"
    case "$unit_file_state" in
      disabled|masked|not-found) ;;
      static)
        # systemd reports a unit without an [Install] section as static and
        # `is-enabled` may return success for it.  A fenced inactive optional
        # service is not boot-enabled, whereas accepting static timers or a
        # REQUIRED service would widen the legacy drain boundary.
        if [[ "$unit" != 'leetplus-langame-daily-worker.service' ]]; then
          printf 'legacy unit has an unacceptable static boot state: %s\n' "$unit" >&2
          return 0
        fi
        ;;
      *)
        printf 'legacy unit is still boot-enabled: unit=%s state=%s\n' "$unit" "$unit_file_state" >&2
        return 0
        ;;
    esac
    main_pid="$(systemctl_bounded show --property=MainPID --value "$unit" 2>/dev/null || true)"
    control_pid="$(systemctl_bounded show --property=ControlPID --value "$unit" 2>/dev/null || true)"
    exec_main_pid="$(systemctl_bounded show --property=ExecMainPID --value "$unit" 2>/dev/null || true)"
    for cgroup_pid in "$main_pid" "$control_pid" "$exec_main_pid"; do
      [[ -z "$cgroup_pid" || "$cgroup_pid" == 0 ]] && continue
      [[ "$cgroup_pid" =~ ^[1-9][0-9]*$ ]] || {
        printf 'legacy unit exposes an invalid systemd PID: unit=%s pid=%s\n' "$unit" "$cgroup_pid" >&2
        return 0
      }
      # ExecMainPID is historical for a completed oneshot on systemd 255.
      # A nonzero property blocks drain only while that PID still has a live
      # /proc identity; PID reuse is deliberately conservative and blocks too.
      [[ ! -e "${proc_root}/${cgroup_pid}" ]] && continue
      printf 'legacy unit retains a systemd PID: unit=%s pid=%s\n' "$unit" "$cgroup_pid" >&2
      return 0
    done
    control_group="$(systemctl_bounded show --property=ControlGroup --value "$unit" 2>/dev/null || true)"
    if [[ -n "$control_group" ]]; then
      [[ "$control_group" == /* && "$control_group" != *'..'* ]] || {
        printf 'legacy unit has an unsafe cgroup path: %s\n' "$unit" >&2
        return 0
      }
      cgroup_path="${cgroup_root}${control_group}"
      if [[ -d "$cgroup_path" ]]; then
        cgroup_pids="$(timeout --kill-after=2s "${command_timeout_seconds}s" \
          find "$cgroup_path" -type f -name cgroup.procs \
            -exec awk 'NF { print; exit }' {} \; 2>/dev/null)" || {
          printf 'legacy unit cgroup inventory failed or returned partial output: %s\n' "$unit" >&2
          return 0
        }
        while IFS= read -r cgroup_pid; do
          [[ -z "$cgroup_pid" ]] && continue
          printf 'legacy unit cgroup retains a process: unit=%s pid=%s\n' "$unit" "$cgroup_pid" >&2
          return 0
        done <<< "$cgroup_pids"
      fi
    fi
  done
  return 1
}

database_not_drained() {
  local counts legacy_sessions legacy_transactions legacy_workers rollback_wrong_identity
  local rollback_role_contract rollback_membership_contract rollback_direct_memberships
  local legacy_reverse_memberships rollback_reverse_memberships unauthorized_legacy_member_sessions
  local legacy_login_fence audit_role_contract audit_membership_contract audit_direct_memberships audit_reverse_memberships audit_database_ownership
  local fence_authority_contract
  local observed_database observed_address observed_port observed_system_identifier observed_session_user
  counts="$(
    timeout --kill-after=3s "${psql_timeout_seconds}s" env \
      PGCONNECT_TIMEOUT=5 \
      PGOPTIONS='-c statement_timeout=10000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=10000' \
      PGSERVICEFILE="$pg_service_file" PGSERVICE="$pg_service" \
      psql --no-psqlrc --set=ON_ERROR_STOP=1 --set=legacy_role="$LEGACY_DATABASE_ROLE" \
        --set=rollback_role="$ROLLBACK_DATABASE_ROLE" --set=rollback_app="$ROLLBACK_APPLICATION_NAME" \
        --set=audit_role="${database_target_values[AUDIT_SESSION_USER]}" \
        --tuples-only --no-align <<'SQL'
BEGIN READ ONLY;
SELECT
  count(*) FILTER (
    WHERE usename = :'legacy_role' AND pid <> pg_backend_pid()
  ),
  count(*) FILTER (
    WHERE usename = :'legacy_role' AND pid <> pg_backend_pid()
      AND (state <> 'idle' OR backend_xid IS NOT NULL OR backend_xmin IS NOT NULL)
  ),
  count(*) FILTER (
    WHERE usename = :'legacy_role' AND pid <> pg_backend_pid()
      AND backend_type <> 'client backend'
  ),
  count(*) FILTER (
    WHERE usename = :'rollback_role' AND application_name <> :'rollback_app'
  ),
  (
    SELECT count(*) FROM pg_catalog.pg_roles role
    WHERE role.rolname = :'rollback_role'
      AND role.rolcanlogin
      AND NOT role.rolinherit
      AND NOT role.rolsuper
      AND NOT role.rolcreatedb
      AND NOT role.rolcreaterole
      AND NOT role.rolreplication
      AND NOT role.rolbypassrls
      AND role.rolconnlimit = 20
      AND role.rolvaliduntil IS NULL
      AND role.rolconfig IS NULL
  ),
  (
    SELECT count(*)
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles parent_role ON parent_role.oid = membership.roleid
    JOIN pg_catalog.pg_roles member_role ON member_role.oid = membership.member
    WHERE parent_role.rolname = :'legacy_role'
      AND member_role.rolname = :'rollback_role'
      AND NOT membership.admin_option
      AND NOT membership.inherit_option
      AND membership.set_option
  ),
  (
    SELECT count(*)
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles member_role ON member_role.oid = membership.member
    WHERE member_role.rolname = :'rollback_role'
  ),
  (
    SELECT count(*)
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles parent_role ON parent_role.oid = membership.roleid
    WHERE parent_role.rolname = :'legacy_role'
  ),
  (
    SELECT count(*)
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles parent_role ON parent_role.oid = membership.roleid
    WHERE parent_role.rolname = :'rollback_role'
  ),
  (
    WITH RECURSIVE legacy_member(member_oid) AS (
      SELECT membership.member
      FROM pg_catalog.pg_auth_members membership
      JOIN pg_catalog.pg_roles parent_role ON parent_role.oid = membership.roleid
      WHERE parent_role.rolname = :'legacy_role'
      UNION
      SELECT membership.member
      FROM pg_catalog.pg_auth_members membership
      JOIN legacy_member parent_member ON parent_member.member_oid = membership.roleid
    )
    SELECT count(*)
    FROM pg_catalog.pg_stat_activity activity
    JOIN pg_catalog.pg_roles session_role ON session_role.rolname = activity.usename
    WHERE session_role.oid IN (SELECT member_oid FROM legacy_member)
      AND session_role.rolname <> :'rollback_role'
      AND activity.pid <> pg_backend_pid()
  ),
  (
    SELECT count(*) FROM pg_catalog.pg_roles role
    WHERE role.rolname = :'legacy_role' AND NOT role.rolcanlogin
      AND role.rolinherit AND NOT role.rolsuper AND NOT role.rolcreatedb
      AND NOT role.rolcreaterole AND NOT role.rolreplication AND NOT role.rolbypassrls
      AND role.rolconnlimit = -1 AND role.rolvaliduntil IS NULL AND role.rolconfig IS NULL
      AND (SELECT count(*) FROM pg_catalog.pg_auth_members membership
        JOIN pg_catalog.pg_roles member_role ON member_role.oid = membership.member
        WHERE member_role.rolname = :'legacy_role') = 0
  ),
  (
    SELECT count(*) FROM pg_catalog.pg_roles role
    WHERE role.rolname = :'audit_role'
      AND role.rolcanlogin
      AND role.rolinherit
      AND NOT role.rolsuper
      AND NOT role.rolcreatedb
      AND NOT role.rolcreaterole
      AND NOT role.rolreplication
      AND NOT role.rolbypassrls
      AND role.rolconnlimit = 2
      AND role.rolvaliduntil IS NULL
      AND role.rolconfig IS NULL
      AND pg_catalog.has_database_privilege(:'audit_role', current_database(), 'CONNECT')
      AND NOT pg_catalog.has_database_privilege(:'audit_role', current_database(), 'TEMPORARY')
      AND pg_catalog.has_schema_privilege(:'audit_role', 'public', 'USAGE')
      AND NOT pg_catalog.has_schema_privilege(:'audit_role', 'public', 'CREATE')
      AND (SELECT count(*)
        FROM pg_catalog.pg_class relation
        JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))) acl
        JOIN pg_catalog.pg_roles grantee ON grantee.oid = acl.grantee
        WHERE grantee.rolname = :'audit_role'
          AND namespace.nspname = 'public'
          AND relation.relname IN (
            'Tenant', 'Store', 'Product', 'User', 'UserStoreAccess', 'UserAccessRole', 'UserRoleOverride', 'UserInvite',
            'StaffChecklistTemplate', 'StaffKnowledgeArticle', 'GuestGameLootBox', 'GuestGameMission',
            'GuestGameSeason', 'StaffChatChannel', 'StaffChatChannelMember'
          ) AND acl.privilege_type = 'SELECT' AND NOT acl.is_grantable) = 15
      AND (SELECT count(*)
        FROM pg_catalog.pg_class relation
        JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))) acl
        JOIN pg_catalog.pg_roles grantee ON grantee.oid = acl.grantee
        WHERE grantee.rolname = :'audit_role' AND namespace.nspname NOT LIKE 'pg_%'
          AND namespace.nspname <> 'information_schema') = 15
  ),
  (
    SELECT count(*)
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles parent_role ON parent_role.oid = membership.roleid
    JOIN pg_catalog.pg_roles member_role ON member_role.oid = membership.member
    WHERE parent_role.rolname = 'pg_monitor'
      AND member_role.rolname = :'audit_role'
      AND NOT membership.admin_option
      AND membership.inherit_option
      AND membership.set_option
  ),
  (
    SELECT count(*)
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles member_role ON member_role.oid = membership.member
    WHERE member_role.rolname = :'audit_role'
  ),
  (
    SELECT count(*)
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles parent_role ON parent_role.oid = membership.roleid
    WHERE parent_role.rolname = :'audit_role'
  ),
  (
    SELECT count(*)
    FROM pg_catalog.pg_database database
    JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = database.datdba
    WHERE database.datname = current_database() AND owner_role.rolname = :'audit_role'
  ),
  (
    SELECT (
      (SELECT count(*) FROM pg_catalog.pg_roles
        WHERE rolname = 'leetplus_fence_authority'
          AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper
          AND NOT rolcreatedb AND rolcreaterole AND NOT rolreplication AND NOT rolbypassrls
          AND rolconnlimit = 0 AND rolvaliduntil IS NULL AND rolconfig IS NULL) = 1
      AND (SELECT count(*) FROM pg_catalog.pg_roles
        WHERE rolname = 'leetplus_role_fencer'
          AND rolcanlogin AND NOT rolinherit AND NOT rolsuper
          AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls
          AND rolconnlimit = 1 AND rolvaliduntil IS NULL AND rolconfig IS NULL) = 1
      AND (SELECT count(*)
        FROM pg_catalog.pg_auth_members membership
        JOIN pg_catalog.pg_roles parent_role ON parent_role.oid = membership.roleid
        JOIN pg_catalog.pg_roles member_role ON member_role.oid = membership.member
        WHERE parent_role.rolname = 'leetplus'
          AND member_role.rolname = 'leetplus_fence_authority'
          AND membership.admin_option AND NOT membership.inherit_option AND NOT membership.set_option) = 1
      AND (SELECT count(*)
        FROM pg_catalog.pg_auth_members membership
        JOIN pg_catalog.pg_roles member_role ON member_role.oid = membership.member
        WHERE member_role.rolname = 'leetplus_fence_authority') = 1
      AND (SELECT count(*)
        FROM pg_catalog.pg_auth_members membership
        JOIN pg_catalog.pg_roles member_role ON member_role.oid = membership.member
        WHERE member_role.rolname = 'leetplus_role_fencer') = 0
      AND (SELECT count(*)
        FROM pg_catalog.pg_auth_members membership
        JOIN pg_catalog.pg_roles parent_role ON parent_role.oid = membership.roleid
        WHERE parent_role.rolname IN ('leetplus_fence_authority', 'leetplus_role_fencer')) = 0
      AND NOT pg_catalog.has_database_privilege('leetplus_role_fencer', current_database(), 'TEMPORARY')
      AND NOT pg_catalog.has_database_privilege('leetplus_role_fencer', current_database(), 'CREATE')
      AND pg_catalog.has_database_privilege('leetplus_role_fencer', current_database(), 'CONNECT')
      AND NOT pg_catalog.has_database_privilege('leetplus_fence_authority', current_database(), 'CONNECT')
      AND NOT pg_catalog.has_database_privilege('leetplus_fence_authority', current_database(), 'TEMPORARY')
      AND NOT pg_catalog.has_database_privilege('leetplus_fence_authority', current_database(), 'CREATE')
      AND NOT pg_catalog.has_schema_privilege('leetplus_role_fencer', 'public', 'USAGE')
      AND pg_catalog.has_schema_privilege('leetplus_role_fencer', 'leetplus_ops', 'USAGE')
      AND NOT pg_catalog.has_schema_privilege('leetplus_role_fencer', 'leetplus_ops', 'CREATE')
      AND pg_catalog.has_schema_privilege('leetplus_fence_authority', 'leetplus_ops', 'USAGE')
      AND pg_catalog.has_schema_privilege('leetplus_fence_authority', 'leetplus_ops', 'CREATE')
      AND (SELECT count(*) FROM pg_catalog.pg_namespace namespace
        WHERE namespace.nspname NOT LIKE 'pg_%' AND namespace.nspname <> 'information_schema'
          AND namespace.nspname <> 'leetplus_ops'
          AND ((pg_catalog.has_schema_privilege('leetplus_role_fencer', namespace.oid, 'USAGE')
              OR pg_catalog.has_schema_privilege('leetplus_role_fencer', namespace.oid, 'CREATE'))
            OR (pg_catalog.has_schema_privilege('leetplus_fence_authority', namespace.oid, 'USAGE')
              OR pg_catalog.has_schema_privilege('leetplus_fence_authority', namespace.oid, 'CREATE')))) = 0
      AND (SELECT count(*) FROM pg_catalog.pg_database database
        JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = database.datdba
        WHERE owner_role.rolname IN ('leetplus_fence_authority', 'leetplus_role_fencer')) = 0
      AND (SELECT count(*) FROM pg_catalog.pg_namespace namespace
        JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = namespace.nspowner
        WHERE owner_role.rolname = 'leetplus_role_fencer'
          OR (owner_role.rolname = 'leetplus_fence_authority' AND namespace.nspname <> 'leetplus_ops')) = 0
      AND (SELECT count(*) FROM pg_catalog.pg_class relation
        JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = relation.relowner
        WHERE owner_role.rolname IN ('leetplus_fence_authority', 'leetplus_role_fencer')) = 0
      AND (SELECT count(*) FROM pg_catalog.pg_type type
        JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = type.typowner
        WHERE owner_role.rolname IN ('leetplus_fence_authority', 'leetplus_role_fencer')) = 0
      AND (SELECT count(*) FROM pg_catalog.pg_default_acl default_acl
        JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = default_acl.defaclrole
        WHERE owner_role.rolname IN ('leetplus_fence_authority', 'leetplus_role_fencer')) = 0
      AND (SELECT count(*) FROM pg_catalog.pg_class relation
        JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
        CROSS JOIN (VALUES ('leetplus_fence_authority'), ('leetplus_role_fencer')) AS inspected_role(role_name)
        WHERE namespace.nspname NOT LIKE 'pg_%' AND namespace.nspname <> 'information_schema'
          AND relation.relkind IN ('r', 'v', 'm', 'f', 'p')
          AND pg_catalog.has_table_privilege(inspected_role.role_name, relation.oid,
            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) = 0
      AND (SELECT count(*) FROM pg_catalog.pg_class sequence_relation
        JOIN pg_catalog.pg_namespace namespace ON namespace.oid = sequence_relation.relnamespace
        CROSS JOIN (VALUES ('leetplus_fence_authority'), ('leetplus_role_fencer')) AS inspected_role(role_name)
        WHERE namespace.nspname NOT LIKE 'pg_%' AND namespace.nspname <> 'information_schema'
          AND sequence_relation.relkind = 'S'
          AND (pg_catalog.has_sequence_privilege(inspected_role.role_name, sequence_relation.oid, 'USAGE')
            OR pg_catalog.has_sequence_privilege(inspected_role.role_name, sequence_relation.oid, 'SELECT')
            OR pg_catalog.has_sequence_privilege(inspected_role.role_name, sequence_relation.oid, 'UPDATE'))) = 0
      AND (SELECT count(*) FROM pg_catalog.pg_type type
        JOIN pg_catalog.pg_namespace namespace ON namespace.oid = type.typnamespace
        CROSS JOIN (VALUES ('leetplus_fence_authority'), ('leetplus_role_fencer')) AS inspected_role(role_name)
        WHERE namespace.nspname NOT LIKE 'pg_%' AND namespace.nspname <> 'information_schema'
          AND pg_catalog.has_schema_privilege(inspected_role.role_name, namespace.oid, 'USAGE')
          AND pg_catalog.has_type_privilege(inspected_role.role_name, type.oid, 'USAGE')) = 0
      AND (SELECT count(*) FROM pg_catalog.pg_proc function
        JOIN pg_catalog.pg_namespace namespace ON namespace.oid = function.pronamespace
        CROSS JOIN (VALUES ('leetplus_fence_authority'), ('leetplus_role_fencer')) AS inspected_role(role_name)
        WHERE namespace.nspname NOT LIKE 'pg_%' AND namespace.nspname <> 'information_schema'
          AND NOT (namespace.nspname = 'leetplus_ops' AND function.proname = 'apply_nminus1_legacy_login_fence'
            AND pg_catalog.pg_get_function_identity_arguments(function.oid) =
              'expected_database text, expected_address text, expected_port integer, expected_system_identifier text, expected_session_user text')
          AND pg_catalog.has_schema_privilege(inspected_role.role_name, namespace.oid, 'USAGE')
          AND pg_catalog.has_function_privilege(inspected_role.role_name, function.oid, 'EXECUTE')) = 0
      AND (SELECT count(*)
        FROM pg_catalog.pg_proc fn
        JOIN pg_catalog.pg_namespace namespace ON namespace.oid = fn.pronamespace
        JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = fn.proowner
        JOIN pg_catalog.pg_language language ON language.oid = fn.prolang
        WHERE namespace.nspname = 'leetplus_ops'
          AND namespace.nspowner = owner_role.oid
          AND owner_role.rolname = 'leetplus_fence_authority'
          AND fn.proname = 'apply_nminus1_legacy_login_fence'
          AND pg_catalog.pg_get_function_identity_arguments(fn.oid) =
            'expected_database text, expected_address text, expected_port integer, expected_system_identifier text, expected_session_user text'
          AND pg_catalog.format_type(fn.prorettype, NULL) = 'text'
          AND fn.prosecdef AND fn.provolatile = 'v' AND fn.proparallel = 'u'
          AND fn.prokind = 'f' AND language.lanname = 'plpgsql'
          AND fn.proconfig = ARRAY['search_path=pg_catalog']::text[]
          AND pg_catalog.md5(fn.prosrc) = '51957bdd1436c5072787194eda27c431') = 1
      AND (SELECT count(*)
        FROM pg_catalog.pg_proc fn
        JOIN pg_catalog.pg_namespace namespace ON namespace.oid = fn.pronamespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(fn.proacl, pg_catalog.acldefault('f', fn.proowner))) acl
        JOIN pg_catalog.pg_roles grantee ON grantee.oid = acl.grantee
        JOIN pg_catalog.pg_roles grantor ON grantor.oid = acl.grantor
        WHERE namespace.nspname = 'leetplus_ops'
          AND fn.proname = 'apply_nminus1_legacy_login_fence'
          AND pg_catalog.pg_get_function_identity_arguments(fn.oid) =
            'expected_database text, expected_address text, expected_port integer, expected_system_identifier text, expected_session_user text'
          AND acl.privilege_type = 'EXECUTE' AND NOT acl.is_grantable
          AND grantor.rolname = 'leetplus_fence_authority'
          AND grantee.rolname IN ('leetplus_fence_authority', 'leetplus_role_fencer')) = 2
      AND (SELECT count(*)
        FROM pg_catalog.pg_proc fn
        JOIN pg_catalog.pg_namespace namespace ON namespace.oid = fn.pronamespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(fn.proacl, pg_catalog.acldefault('f', fn.proowner))) acl
        WHERE namespace.nspname = 'leetplus_ops'
          AND fn.proname = 'apply_nminus1_legacy_login_fence'
          AND pg_catalog.pg_get_function_identity_arguments(fn.oid) =
            'expected_database text, expected_address text, expected_port integer, expected_system_identifier text, expected_session_user text') = 2
      AND (SELECT count(*)
        FROM pg_catalog.pg_namespace namespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(namespace.nspacl, pg_catalog.acldefault('n', namespace.nspowner))) acl
        LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid = acl.grantee
        JOIN pg_catalog.pg_roles grantor ON grantor.oid = acl.grantor
        WHERE namespace.nspname = 'leetplus_ops'
          AND grantor.rolname = 'leetplus_fence_authority'
          AND ((grantee.rolname = 'leetplus_fence_authority' AND acl.privilege_type IN ('USAGE', 'CREATE'))
            OR (grantee.rolname = 'leetplus_role_fencer' AND acl.privilege_type = 'USAGE'))) = 3
      AND (SELECT count(*)
        FROM pg_catalog.pg_namespace namespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(namespace.nspacl, pg_catalog.acldefault('n', namespace.nspowner))) acl
        WHERE namespace.nspname = 'leetplus_ops') = 3
      AND (SELECT count(*)
        FROM pg_catalog.pg_proc fn
        CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(fn.proacl, pg_catalog.acldefault('f', fn.proowner))) acl
        JOIN pg_catalog.pg_roles grantee ON grantee.oid = acl.grantee
        WHERE fn.oid = 'pg_catalog.pg_control_system()'::regprocedure
          AND grantee.rolname = 'leetplus_fence_authority'
          AND acl.privilege_type = 'EXECUTE' AND NOT acl.is_grantable) = 1
    )::int
  ),
  (SELECT current_database()),
  (SELECT pg_catalog.host(pg_catalog.inet_server_addr())),
  (SELECT pg_catalog.inet_server_port()::text),
  (SELECT system_identifier::text FROM pg_catalog.pg_control_system()),
  (SELECT session_user::text)
FROM pg_catalog.pg_stat_activity
WHERE datname = current_database();
COMMIT;
SQL
  )" || return 0
  counts="$(awk -F'|' 'NF == 22 { last = $0 } END { print last }' <<< "$counts")"
  IFS='|' read -r legacy_sessions legacy_transactions legacy_workers rollback_wrong_identity \
    rollback_role_contract rollback_membership_contract rollback_direct_memberships \
    legacy_reverse_memberships rollback_reverse_memberships unauthorized_legacy_member_sessions \
    legacy_login_fence audit_role_contract audit_membership_contract audit_direct_memberships audit_reverse_memberships audit_database_ownership \
    fence_authority_contract \
    observed_database observed_address observed_port observed_system_identifier observed_session_user <<< "$counts"
  [[ "$legacy_sessions" =~ ^[0-9]+$ && "$legacy_transactions" =~ ^[0-9]+$ \
    && "$legacy_workers" =~ ^[0-9]+$ && "$rollback_wrong_identity" =~ ^[0-9]+$ \
    && "$rollback_role_contract" =~ ^[0-9]+$ && "$rollback_membership_contract" =~ ^[0-9]+$ \
    && "$rollback_direct_memberships" =~ ^[0-9]+$ && "$legacy_reverse_memberships" =~ ^[0-9]+$ \
    && "$rollback_reverse_memberships" =~ ^[0-9]+$ && "$unauthorized_legacy_member_sessions" =~ ^[0-9]+$ \
    && "$legacy_login_fence" =~ ^[0-9]+$ \
    && "$audit_role_contract" =~ ^[0-9]+$ && "$audit_membership_contract" =~ ^[0-9]+$ \
    && "$audit_direct_memberships" =~ ^[0-9]+$ && "$audit_reverse_memberships" =~ ^[0-9]+$ \
    && "$audit_database_ownership" =~ ^[0-9]+$ \
    && "$fence_authority_contract" =~ ^[0-9]+$ ]] || return 0
  if ((legacy_sessions != 0 || legacy_transactions != 0 || legacy_workers != 0 || rollback_wrong_identity != 0 \
    || rollback_role_contract != 1 || rollback_membership_contract != 1 || rollback_direct_memberships != 1 \
    || legacy_reverse_memberships != 2 || rollback_reverse_memberships != 0 || unauthorized_legacy_member_sessions != 0 \
    || legacy_login_fence != 1 || audit_role_contract != 1 || audit_membership_contract != 1 \
    || audit_direct_memberships != 1 || audit_reverse_memberships != 0 \
    || audit_database_ownership != 0 || fence_authority_contract != 1)); then
    printf 'legacy database drain pending: sessions=%s transactions=%s workers=%s rollbackWrongIdentity=%s roleContract=%s membershipContract=%s directMemberships=%s legacyReverseMemberships=%s rollbackReverseMemberships=%s unauthorizedMemberSessions=%s legacyLoginFence=%s auditRole=%s auditMembership=%s auditDirectMemberships=%s auditReverseMemberships=%s auditDbOwner=%s fenceAuthority=%s\n' \
      "$legacy_sessions" "$legacy_transactions" "$legacy_workers" "$rollback_wrong_identity" \
      "$rollback_role_contract" "$rollback_membership_contract" "$rollback_direct_memberships" \
      "$legacy_reverse_memberships" "$rollback_reverse_memberships" "$unauthorized_legacy_member_sessions" \
      "$legacy_login_fence" "$audit_role_contract" "$audit_membership_contract" "$audit_direct_memberships" \
      "$audit_reverse_memberships" "$audit_database_ownership" "$fence_authority_contract" >&2
    return 0
  fi
  if [[ "$observed_database" != "${database_target_values[DATABASE_NAME]}" \
    || "$observed_address" != "${database_target_values[DATABASE_SERVER_ADDRESS]}" \
    || "$observed_port" != "${database_target_values[DATABASE_SERVER_PORT]}" \
    || "$observed_system_identifier" != "${database_target_values[DATABASE_SYSTEM_IDENTIFIER]}" \
    || "$observed_session_user" != "${database_target_values[AUDIT_SESSION_USER]}" ]]; then
    printf 'PostgreSQL drain audit target identity does not match the root-pinned production target\n' >&2
    return 0
  fi
  return 1
}

deadline=$((SECONDS + settle_seconds))
consecutive_clean=0
while ((SECONDS < deadline)); do
  if ! unit_not_drained && ! legacy_process_survives && ! database_not_drained; then
    consecutive_clean=$((consecutive_clean + 1))
    if ((consecutive_clean >= clean_samples)); then
      snapshot_digest="$(sha256sum -- "$process_snapshot" | awk '{ print $1 }')"
      printf 'LEGACY_RUNTIME_DRAIN_ACCEPTED=true\n'
      printf 'LEGACY_RUNTIME_DRAIN_CLEAN_SAMPLES=%s\n' "$consecutive_clean"
      printf 'LEGACY_RUNTIME_DRAIN_PROCESS_SNAPSHOT_SHA256=%s\n' "$snapshot_digest"
      printf 'LEGACY_RUNTIME_DRAIN_DATABASE_ROLE=%s\n' "$LEGACY_DATABASE_ROLE"
      exit 0
    fi
  else
    consecutive_clean=0
  fi
  ((SECONDS < deadline)) && sleep 1
done

die 'bounded settling expired before units/processes/database sessions were all clean'
