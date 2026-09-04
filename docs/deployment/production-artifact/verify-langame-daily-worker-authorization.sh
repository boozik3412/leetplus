#!/usr/bin/bash -p

# Root-only verifier used by the legacy-drain verifier after the successor
# receipt has fenced the optional Langame units.  It admits no general
# OPTIONAL_DRAIN exception: only the exact dedicated timer can be live, and
# only while its immutable permit and authorization drop-ins still match.
[[ $- == *p* ]] || { printf 'Langame worker authorization verifier: privileged Bash mode is required\n' >&2; exit 1; }
while IFS= read -r inherited_name; do unset "$inherited_name" 2>/dev/null || true; done < <(compgen -e)
unset inherited_name
PATH='/usr/sbin:/usr/bin:/sbin:/bin'; LANG='C.UTF-8'; LC_ALL='C.UTF-8'; TZ='UTC'; export PATH LANG LC_ALL TZ
set -Eeuo pipefail; IFS=$'\n\t'; umask 0077; cd /

die() { printf 'Langame worker authorization verifier: %s\n' "$*" >&2; exit 1; }
[[ ${EUID:-99999} -eq 0 && "$(/usr/bin/id -g)" == 0 ]] || die 'root authority is required'
readonly ROOT='/var/lib/leetplus/langame-worker-authorizations'
readonly ENV_FILE='/etc/leetplus/langame-daily-worker.env'
readonly AUTH_ENV='/etc/leetplus/langame-daily-worker-authorization.env'
readonly SAFE_ENV='/etc/leetplus/canary-safe.env'
readonly SUCCESSOR='/var/lib/leetplus/legacy-drain/manifest-successor.receipt'
readonly CONTROL_VERIFIER='/usr/local/libexec/leetplus/verify-installed-production-control-generation.mjs'
readonly SERVICE='leetplus-langame-daily-worker.service'
readonly TIMER='leetplus-langame-daily-worker.timer'
readonly FENCE='/var/lib/leetplus/legacy-drain/legacy-start-fence'
readonly SERVICE_FILE='/etc/systemd/system/leetplus-langame-daily-worker.service'
readonly TIMER_FILE='/etc/systemd/system/leetplus-langame-daily-worker.timer'
readonly RUNNER='/usr/local/libexec/leetplus/run-authorized-langame-daily-worker.sh'
sha() { sha256sum -- "$1" | awk '{print $1}'; }
regular() { [[ -f "$1" && ! -L "$1" && "$(readlink -e -- "$1")" == "$1" ]] || die "unsafe file: $1"; [[ "$(stat -c '%U:%G:%a:%h' -- "$1")" == "$2:1" ]] || die "file authority drifted: $1"; }
env_value() { local key="$1" n; n="$(grep -Ec "^${key}=" "$ENV_FILE" || true)"; [[ "$n" == 1 ]] || die "environment key absent or duplicate: ${key}"; sed -n "s/^${key}=//p" "$ENV_FILE"; }
systemctl_bounded() { timeout --kill-after=2s 10s systemctl "$@"; }
dropin() { printf '/etc/systemd/system/%s.d/91-leetplus-langame-worker-authorization.conf' "$1"; }
legacy_fence() { printf '/etc/systemd/system/%s.d/90-leetplus-nminus1-start-fence.conf' "$1"; }
assert_zero_unit_processes() {
  local unit="$1" property value exec_main_pid control_group cgroup_path events
  # ExecMainPID may remain as historical terminal metadata after a completed
  # oneshot. It is accepted only when that PID has no live /proc identity;
  # MainPID/ControlPID and the actual cgroup prove live quiescence.
  for property in MainPID ControlPID; do
    value="$(systemctl_bounded show --property="$property" --value "$unit")"
    if [[ "$unit" == "$TIMER" ]]; then
      [[ -z "$value" || "$value" == 0 ]] || die "timer retains ${property}: ${unit}"
    else
      [[ "$value" == 0 ]] || die "unit retains ${property}: ${unit}"
    fi
  done
  exec_main_pid="$(systemctl_bounded show --property=ExecMainPID --value "$unit")"
  if [[ "$unit" == "$TIMER" ]]; then
    [[ -z "$exec_main_pid" || "$exec_main_pid" == 0 ]] || die "timer retains ExecMainPID: ${unit}"
  elif [[ -n "$exec_main_pid" && "$exec_main_pid" != 0 ]]; then
    [[ "$exec_main_pid" =~ ^[1-9][0-9]*$ ]] || die "unit exposes invalid historical ExecMainPID: ${unit}"
    [[ ! -e "/proc/${exec_main_pid}" ]] || die "unit historical ExecMainPID is still live or reused: ${unit}"
  fi
  control_group="$(systemctl_bounded show --property=ControlGroup --value "$unit")"
  [[ -z "$control_group" ]] && return 0
  [[ "$control_group" == /* && "$control_group" != *'//'*
    && "$control_group" != */../* && "$control_group" != */.. && "$control_group" != *'/./'*
    && "$control_group" != *$'\r'* && "$control_group" != *$'\n'* ]] || die "unit has unsafe cgroup: ${unit}"
  cgroup_path="/sys/fs/cgroup${control_group}"
  [[ -d "$cgroup_path" ]] || return 0
  [[ -f "${cgroup_path}/cgroup.events" && ! -L "${cgroup_path}/cgroup.events" ]] || die "unit cgroup events are absent or linked: ${unit}"
  events="$(timeout --kill-after=1s 2s head -c 4097 -- "${cgroup_path}/cgroup.events")" || die "unit cgroup events cannot be read: ${unit}"
  [[ "${#events}" -le 4096
    && "$(grep -Ec '^populated [01]$' <<< "$events" || true)" == 1
    && "$(grep -Ec '^populated 0$' <<< "$events" || true)" == 1 ]] || die "unit cgroup retains a process: ${unit}"
}
regular "$SUCCESSOR" 'root:root:400'; grep -F -x 'LEGACY_DRAIN_MANIFEST_SUCCESSOR_ACCEPTED=true' "$SUCCESSOR" >/dev/null || die 'successor receipt is not accepted'
regular "$ENV_FILE" 'root:leetplus-api-runtime:640'; regular "$AUTH_ENV" 'root:root:400'; regular "$SAFE_ENV" 'root:leetplus-runtime:440'; regular "$SERVICE_FILE" 'root:root:444'; regular "$TIMER_FILE" 'root:root:444'; regular "$RUNNER" 'root:root:555'; regular "$CONTROL_VERIFIER" 'root:root:555'
[[ -d "$ROOT" && ! -L "$ROOT" && "$(stat -c '%U:%G:%a' -- "$ROOT")" == 'root:leetplus-api-runtime:710' ]] || die 'authorization root authority drifted'
[[ "$(env_value LANGAME_DAILY_WORKER_CANARY)" == false ]] || die 'only a non-canary timer profile may bypass optional drain'
! grep -q '^LANGAME_DAILY_WORKER_DATE=' "$ENV_FILE" || die 'timer profile retains canary date'
[[ "$(env_value LANGAME_DAILY_SYNC_SCHEDULER_ENABLED)" == false && "$(env_value LANGAME_SCHEDULED_HTTP_ENABLED)" == false ]] || die 'worker/API scheduler denial drifted'
tenant="$(env_value LANGAME_DAILY_WORKER_TENANT_SLUG)"; [[ "$tenant" =~ ^[a-z0-9][a-z0-9-]{0,62}$ ]] || die 'tenant slug is unsafe'
[[ -L /etc/nginx/leetplus/active-upstreams.conf ]] || die 'active upstream is absent'
case "$(readlink -e -- /etc/nginx/leetplus/active-upstreams.conf)" in /etc/nginx/leetplus/upstreams/blue.conf) slot=blue ;; /etc/nginx/leetplus/upstreams/green.conf) slot=green ;; *) die 'active upstream is not a modern slot' ;; esac
release="$(readlink -e -- "/srv/leetplus/slots/${slot}")"; [[ "$release" =~ ^/srv/leetplus/releases/([0-9a-f]{40})$ ]] || die 'active slot release is unsafe'; release_sha="${BASH_REMATCH[1]}"
env_sha="$(sha "$ENV_FILE")"; stable_env_sha="$(sed -E '/^LANGAME_DAILY_WORKER_CANARY=|^LANGAME_DAILY_WORKER_DATE=/d' "$ENV_FILE" | sha256sum | awk '{print $1}')"; auth_sha="$(sha "$AUTH_ENV")"; safe_sha="$(sha "$SAFE_ENV")"; service_sha="$(sha "$SERVICE_FILE")"; timer_sha="$(sha "$TIMER_FILE")"; successor_sha="$(sha "$SUCCESSOR")"
control_output="$(mktemp /tmp/leetplus-langame-worker-verifier-control.XXXXXX)"; trap 'rm -f -- "$control_output"' EXIT
/usr/bin/node "$CONTROL_VERIFIER" --release-sha "$release_sha" --require-root-authority >"$control_output" || die 'current installed control verifier rejected active release'
grep -F -x 'PRODUCTION_CONTROL_INSTALLED_GENERATION=PASS' "$control_output" >/dev/null && grep -F -x "PRODUCTION_CONTROL_RELEASE_SHA=${release_sha}" "$control_output" >/dev/null || die 'current installed control identity drifted'
control_sha="$(sha "$control_output")"
pointer="${ROOT}/active-timer.permit"; regular "$pointer" 'root:leetplus-api-runtime:440'; [[ "$(wc -l < "$pointer" | tr -d '[:space:]')" == 3 && -z "$(awk -F= 'NF < 2 || seen[$1]++ {print; exit}' "$pointer")" ]] || die 'timer authorization pointer schema is invalid'; [[ "$(awk -F= '{print $1}' "$pointer" | sort)" == "$(printf '%s\n' RECORD_VERSION PERMIT_PATH PERMIT_SHA256 | sort)" ]] || die 'timer authorization pointer key set drifted'; grep -F -x 'RECORD_VERSION=1' "$pointer" >/dev/null || die 'timer authorization pointer version is invalid'; permit="$(sed -n 's/^PERMIT_PATH=//p' "$pointer")"; permit_sha="$(sed -n 's/^PERMIT_SHA256=//p' "$pointer")"
[[ "$permit" =~ ^${ROOT}/authorization-timer-[1-9][0-9]*-[0-9a-f]{64}\.receipt$ && "$permit_sha" =~ ^[0-9a-f]{64}$ ]] || die 'timer authorization pointer is invalid'
regular "$permit" 'root:leetplus-api-runtime:440'
[[ "$(sha "$permit")" == "$permit_sha" ]] || die 'timer authorization pointer digest drifted'
[[ "$(wc -l < "$permit" | tr -d '[:space:]')" == 19 && -z "$(awk -F= 'NF < 2 || seen[$1]++ {print; exit}' "$permit")" ]] || die 'timer authorization receipt schema is invalid'
[[ "$(awk -F= '{print $1}' "$permit" | sort)" == "$(printf '%s\n' RECORD_VERSION KIND AUTHORIZATION_PERMITTED PHASE ATTEMPT PLAN_SHA256 RELEASE_SHA TENANT_SLUG WORKER_ENV_SHA256 WORKER_STABLE_ENV_SHA256 AUTH_ENV_SHA256 SAFE_ENV_SHA256 SERVICE_SHA256 TIMER_SHA256 SUCCESSOR_RECEIPT_SHA256 CONTROL_VERIFIER_OUTPUT_SHA256 CANARY_DATE NOT_AFTER_EPOCH PLAN_JSON_SHA256 | sort)" ]] || die 'timer authorization receipt key set drifted'
for line in 'RECORD_VERSION=1' 'KIND=LEETPLUS_LANGAME_DAILY_WORKER_AUTHORIZATION_V1' 'AUTHORIZATION_PERMITTED=true' 'PHASE=timer' "RELEASE_SHA=${release_sha}" "TENANT_SLUG=${tenant}" "WORKER_ENV_SHA256=${env_sha}" "WORKER_STABLE_ENV_SHA256=${stable_env_sha}" "AUTH_ENV_SHA256=${auth_sha}" "SAFE_ENV_SHA256=${safe_sha}" "SERVICE_SHA256=${service_sha}" "TIMER_SHA256=${timer_sha}" "SUCCESSOR_RECEIPT_SHA256=${successor_sha}" "CONTROL_VERIFIER_OUTPUT_SHA256=${control_sha}" 'CANARY_DATE=' 'NOT_AFTER_EPOCH=0'; do grep -F -x "$line" "$permit" >/dev/null || die 'timer authorization receipt drifted'; done
attempt="$(sed -n 's/^ATTEMPT=//p' "$permit")"; [[ "$attempt" =~ ^[1-9][0-9]*$ ]] || die 'timer authorization attempt is invalid'
grep -Eq '^PLAN_SHA256=[0-9a-f]{64}$' "$permit" && grep -Eq '^PLAN_JSON_SHA256=[0-9a-f]{64}$' "$permit" || die 'timer authorization plan digest is invalid'
permit_identity="$(printf 'timer:%s:%s:%s' "$attempt" "$release_sha" "$env_sha" | sha256sum | awk '{print $1}')"
[[ "$(basename -- "$permit")" == "authorization-timer-${attempt}-${permit_identity}.receipt" ]] || die 'timer authorization permit filename identity drifted'
for unit in "$SERVICE" "$TIMER"; do
  path="$(dropin "$unit")"; regular "$path" 'root:root:644'
  [[ "$(tr -d '\r' < "$path")" == $'[Unit]\nConditionPathExists=\n'"ConditionPathExists=${permit}" ]] || die "authorization drop-in content drifted: ${unit}"
  legacy_path="$(legacy_fence "$unit")"; regular "$legacy_path" 'root:root:644'
  [[ "$(tr -d '\r' < "$legacy_path")" == $'[Unit]\n'"ConditionPathExists=!${FENCE}" ]] || die "legacy fence drop-in drifted: ${unit}"
  loaded_dropins="$(systemctl_bounded show --property=DropInPaths --value "$unit")"
  case " $loaded_dropins " in *" $legacy_path "*" $path "*|*" $path "*" $legacy_path "*) ;; *) die "worker drop-ins are not loaded: ${unit}" ;; esac
  exact_dropins="$(tr ' ' '\n' <<< "$loaded_dropins" | sed '/^$/d' | sort)"
  expected_dropins="$(printf '%s\n%s\n' "$legacy_path" "$path" | sort)"
  [[ "$exact_dropins" == "$expected_dropins" ]] || die "worker has an unexpected effective drop-in: ${unit}"
done
timer_receipt="${ROOT}/timer-enabled-$(basename "$permit" .receipt | sed 's/^authorization-timer-//').receipt"; regular "$timer_receipt" 'root:leetplus-api-runtime:440'
[[ "$(wc -l < "$timer_receipt" | tr -d '[:space:]')" == 8 && -z "$(awk -F= 'NF < 2 || seen[$1]++ { print; exit }' "$timer_receipt")" ]] || die 'timer enablement receipt schema is invalid'
[[ "$(awk -F= '{print $1}' "$timer_receipt" | sort)" == "$(printf '%s\n' RECORD_VERSION KIND LANGAME_DAILY_WORKER_TIMER_ENABLED AUTHORIZATION_RECEIPT_SHA256 RELEASE_SHA TENANT_SLUG WORKER_ENV_SHA256 WORKER_STABLE_ENV_SHA256 | sort)" ]] || die 'timer enablement receipt key set drifted'
for line in 'RECORD_VERSION=1' 'KIND=LEETPLUS_LANGAME_DAILY_WORKER_TIMER_ENABLEMENT_V1' 'LANGAME_DAILY_WORKER_TIMER_ENABLED=true' "AUTHORIZATION_RECEIPT_SHA256=$(sha "$permit")" "RELEASE_SHA=${release_sha}" "TENANT_SLUG=${tenant}" "WORKER_ENV_SHA256=${env_sha}" "WORKER_STABLE_ENV_SHA256=${stable_env_sha}"; do grep -F -x "$line" "$timer_receipt" >/dev/null || die 'timer enablement receipt drifted'; done
validation_receipt="${ROOT}/validation-timer-$(basename "$permit" .receipt | sed 's/^authorization-timer-//').receipt"; regular "$validation_receipt" 'root:leetplus-api-runtime:440'
[[ "$(wc -l < "$validation_receipt" | tr -d '[:space:]')" == 14 && -z "$(awk -F= 'NF < 2 || seen[$1]++ { print; exit }' "$validation_receipt")" ]] || die 'timer-profile validation receipt schema is invalid'
[[ "$(awk -F= '{print $1}' "$validation_receipt" | sort)" == "$(printf '%s\n' RECORD_VERSION KIND LANGAME_DAILY_WORKER_TIMER_PROFILE_VALIDATED AUTHORIZATION_RECEIPT_SHA256 RELEASE_SHA TENANT_SLUG WORKER_ENV_SHA256 WORKER_STABLE_ENV_SHA256 AUTH_ENV_SHA256 SAFE_ENV_SHA256 SERVICE_SHA256 TIMER_SHA256 SUCCESSOR_RECEIPT_SHA256 CONTROL_VERIFIER_OUTPUT_SHA256 | sort)" ]] || die 'timer-profile validation receipt key set drifted'
for line in 'RECORD_VERSION=1' 'KIND=LEETPLUS_LANGAME_DAILY_WORKER_TIMER_PROFILE_VALIDATION_V1' 'LANGAME_DAILY_WORKER_TIMER_PROFILE_VALIDATED=true' "AUTHORIZATION_RECEIPT_SHA256=$(sha "$permit")" "RELEASE_SHA=${release_sha}" "TENANT_SLUG=${tenant}" "WORKER_ENV_SHA256=${env_sha}" "WORKER_STABLE_ENV_SHA256=${stable_env_sha}" "AUTH_ENV_SHA256=${auth_sha}" "SAFE_ENV_SHA256=${safe_sha}" "SERVICE_SHA256=${service_sha}" "TIMER_SHA256=${timer_sha}" "SUCCESSOR_RECEIPT_SHA256=${successor_sha}" "CONTROL_VERIFIER_OUTPUT_SHA256=${control_sha}"; do grep -F -x "$line" "$validation_receipt" >/dev/null || die 'timer-profile validation evidence drifted'; done
[[ "$(systemctl_bounded show --property=FragmentPath --value "$SERVICE")" == "$SERVICE_FILE" && "$(systemctl_bounded show --property=FragmentPath --value "$TIMER")" == "$TIMER_FILE" ]] || die 'loaded worker unit fragment drifted'
[[ "$(systemctl_bounded show --property=ActiveState --value "$SERVICE")" == inactive && "$(systemctl_bounded show --property=SubState --value "$SERVICE")" == dead ]] || die 'worker service is in flight or not dead'
assert_zero_unit_processes "$SERVICE"
# `static` is normal for a oneshot service with no [Install]; it is not an
# enabled boot owner.  The timer itself must be the only enabled owner.
[[ "$(systemctl_bounded show --property=UnitFileState --value "$SERVICE")" == static ]] || die 'worker service UnitFileState is not exact static'
[[ "$(systemctl_bounded show --property=ActiveState --value "$TIMER")" == active && "$(systemctl_bounded show --property=SubState --value "$TIMER")" == waiting && "$(systemctl_bounded show --property=UnitFileState --value "$TIMER")" == enabled ]] || die 'worker timer is not enabled active(waiting)'
assert_zero_unit_processes "$TIMER"
for pending_intent in /var/lib/leetplus/langame-worker-authorizations/authorization.timer.intent /var/lib/leetplus/langame-worker-authorizations/authorization.revoke.intent; do
  [[ ! -e "$pending_intent" && ! -L "$pending_intent" ]] || die 'worker timer authorization or revocation intent remains pending'
done
printf 'LANGAME_DAILY_WORKER_AUTHORIZATION=PASS releaseSha=%s tenantSlug=%s\n' "$release_sha" "$tenant"
