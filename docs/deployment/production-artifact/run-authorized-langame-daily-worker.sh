#!/usr/bin/bash -p

# Unprivileged gate immediately before the existing active-release runner.  A
# root-only authority writes the immutable receipt; this wrapper only consumes
# it and cannot create, alter or discover arbitrary permits.
[[ $- == *p* ]] || { printf 'Langame authorized worker: privileged Bash mode is required\n' >&2; exit 1; }
readonly SYSTEMD_INVOCATION_ID_SNAPSHOT="${INVOCATION_ID-}"
while IFS= read -r inherited_name; do unset "$inherited_name" 2>/dev/null || true; done < <(compgen -e)
unset inherited_name
PATH='/usr/sbin:/usr/bin:/sbin:/bin'; LANG='C.UTF-8'; LC_ALL='C.UTF-8'; TZ='UTC'; export PATH LANG LC_ALL TZ
set -Eeuo pipefail; IFS=$'\n\t'; umask 0077; cd /

die() { printf 'Langame authorized worker: %s\n' "$*" >&2; exit 1; }
readonly ROOT='/var/lib/leetplus/langame-worker-authorizations'
readonly ENV_FILE='/etc/leetplus/langame-daily-worker.env'
readonly UPSTREAM='/etc/nginx/leetplus/active-upstreams.conf'
readonly RUNNER='/usr/local/libexec/leetplus/run-active-langame-daily-worker.sh'
sha() { sha256sum -- "$1" | awk '{print $1}'; }
value() { local key="$1" count; count="$(grep -Ec "^${key}=" "$ENV_FILE" || true)"; [[ "$count" == 1 ]] || die "worker env key absent or duplicate: ${key}"; sed -n "s/^${key}=//p" "$ENV_FILE"; }
assert_regular() { [[ -f "$1" && ! -L "$1" && "$(readlink -e -- "$1")" == "$1" ]] || die "unsafe file: $1"; }
assert_regular "$ENV_FILE"; [[ "$(stat -c '%U:%G:%a:%h' -- "$ENV_FILE")" == 'root:leetplus-api-runtime:640:1' ]] || die 'worker env authority drifted'
[[ "$SYSTEMD_INVOCATION_ID_SNAPSHOT" =~ ^[0-9a-f]{32}$ ]] || die 'systemd InvocationID is absent or invalid'
INVOCATION_ID="$SYSTEMD_INVOCATION_ID_SNAPSHOT"
export INVOCATION_ID
systemctl_bounded() { timeout --kill-after=2s 10s systemctl "$@"; }
[[ "$(systemctl_bounded show --property=MainPID --value leetplus-langame-daily-worker.service)" == "$$" \
  && "$(systemctl_bounded show --property=InvocationID --value leetplus-langame-daily-worker.service)" == "$SYSTEMD_INVOCATION_ID_SNAPSHOT" \
  && "$(systemctl_bounded show --property=ActiveState --value leetplus-langame-daily-worker.service)" == activating ]] \
  || die 'authorized worker wrapper is not the main process of a fresh activating systemd invocation'
declare -A seen=()
while IFS= read -r env_line; do
  [[ -z "$env_line" || "$env_line" == \#* ]] && continue
  env_key="${env_line%%=*}"
  case "$env_key" in
    DATABASE_URL|APP_ENCRYPTION_KEY|INTEGRATION_ENCRYPTION_KEY|LANGAME_DISCREPANCY_LOG_ROOT|LANGAME_DAILY_WORKER_ENABLED|LANGAME_DAILY_WORKER_LIVE|LANGAME_DAILY_WORKER_TENANT_SLUG|LANGAME_DAILY_WORKER_CANARY|LANGAME_DAILY_SYNC_SCHEDULER_ENABLED|LANGAME_SCHEDULED_HTTP_ENABLED|LANGAME_DAILY_WORKER_DATE) ;;
    *) die "worker env contains an unauthorized key: ${env_key}" ;;
  esac
  env_value="${env_line#*=}"
  [[ "$env_line" == *=* && "$env_key" =~ ^[A-Z][A-Z0-9_]*$ && -z "${seen[$env_key]:-}" && "$env_value" != *$'\r'* && "$env_value" != *$'\n'* ]] || die 'worker env line is malformed or duplicate'
  seen["$env_key"]=1
  printf -v "$env_key" '%s' "$env_value"; export "$env_key"
done < "$ENV_FILE"
for required_key in DATABASE_URL APP_ENCRYPTION_KEY INTEGRATION_ENCRYPTION_KEY LANGAME_DISCREPANCY_LOG_ROOT LANGAME_DAILY_WORKER_ENABLED LANGAME_DAILY_WORKER_LIVE LANGAME_DAILY_WORKER_TENANT_SLUG LANGAME_DAILY_WORKER_CANARY LANGAME_DAILY_SYNC_SCHEDULER_ENABLED LANGAME_SCHEDULED_HTTP_ENABLED; do
  [[ -n "${seen[$required_key]:-}" && -n "${!required_key}" ]] || die "required worker env key is absent or empty: ${required_key}"
done
[[ -d "$ROOT" && ! -L "$ROOT" && "$(stat -c '%U:%G:%a' -- "$ROOT")" == 'root:leetplus-api-runtime:710' ]] || die 'authorization root authority drifted'
# This executable is deliberately group-readable for systemd DynamicUser, but
# it is not a general API-runtime command: the PID-1 InvocationID/MainPID
# attestation above survives ProtectControlGroups' private cgroup namespace.
[[ -L "$UPSTREAM" ]] || die 'active upstream is absent'
target="$(readlink -e -- "$UPSTREAM")"; case "$target" in /etc/nginx/leetplus/upstreams/blue.conf) slot=blue ;; /etc/nginx/leetplus/upstreams/green.conf) slot=green ;; *) die 'active upstream is not a slot' ;; esac
release="$(readlink -e -- "/srv/leetplus/slots/${slot}")"; [[ "$release" =~ ^/srv/leetplus/releases/([0-9a-f]{40})$ ]] || die 'active slot release is unsafe'; release_sha="${BASH_REMATCH[1]}"
tenant="$(value LANGAME_DAILY_WORKER_TENANT_SLUG)"; canary="$(value LANGAME_DAILY_WORKER_CANARY)"; env_sha="$(sha "$ENV_FILE")"
if [[ "$canary" == true ]]; then phase=canary; date_value="$(value LANGAME_DAILY_WORKER_DATE)"; [[ "$date_value" =~ ^20[0-9]{2}-[0-9]{2}-[0-9]{2}$ ]] || die 'canary date is invalid';
elif [[ "$canary" == false ]]; then phase=timer; ! grep -q '^LANGAME_DAILY_WORKER_DATE=' "$ENV_FILE" || die 'timer profile retains canary date'; date_value=''
else die 'canary flag is invalid'; fi

# A root-only pointer selects a bounded, monotonically named attempt receipt.
# The dynamic worker can traverse this directory but cannot list or write it;
# it cannot choose an older permit after a failed attempt or a cutover.
pointer="${ROOT}/active-${phase}.permit"
assert_regular "$pointer"; [[ "$(stat -c '%U:%G:%a:%h' -- "$pointer")" == 'root:leetplus-api-runtime:440:1' ]] || die 'authorization pointer authority drifted'
[[ "$(wc -l < "$pointer" | tr -d '[:space:]')" == 3
  && -z "$(awk -F= 'NF < 2 || seen[$1]++ { print; exit }' "$pointer")"
  && "$(awk -F= '{print $1}' "$pointer" | sort)" == "$(printf '%s\n' RECORD_VERSION PERMIT_PATH PERMIT_SHA256 | sort)" ]] \
  || die 'authorization pointer schema drifted'
grep -F -x 'RECORD_VERSION=1' "$pointer" >/dev/null || die 'authorization pointer version drifted'
permit="$(sed -n 's/^PERMIT_PATH=//p' "$pointer")"
permit_sha="$(sed -n 's/^PERMIT_SHA256=//p' "$pointer")"
[[ "$permit" =~ ^${ROOT}/authorization-${phase}-[1-9][0-9]*-[0-9a-f]{64}\.receipt$ && "$permit_sha" =~ ^[0-9a-f]{64}$ ]] \
  || die 'authorization pointer is malformed'
assert_regular "$permit"; [[ "$(stat -c '%U:%G:%a:%h' -- "$permit")" == 'root:leetplus-api-runtime:440:1' ]] || die 'authorization receipt authority drifted'
[[ "$(sha "$permit")" == "$permit_sha" ]] || die 'authorization pointer receipt digest drifted'
[[ "$(wc -l < "$permit" | tr -d '[:space:]')" == 19
  && -z "$(awk -F= 'NF < 2 || seen[$1]++ { print; exit }' "$permit")"
  && "$(awk -F= '{print $1}' "$permit" | sort)" == "$(printf '%s\n' RECORD_VERSION KIND AUTHORIZATION_PERMITTED PHASE ATTEMPT PLAN_SHA256 RELEASE_SHA TENANT_SLUG WORKER_ENV_SHA256 WORKER_STABLE_ENV_SHA256 AUTH_ENV_SHA256 SAFE_ENV_SHA256 SERVICE_SHA256 TIMER_SHA256 SUCCESSOR_RECEIPT_SHA256 CONTROL_VERIFIER_OUTPUT_SHA256 CANARY_DATE NOT_AFTER_EPOCH PLAN_JSON_SHA256 | sort)" ]] \
  || die 'authorization receipt schema drifted'
grep -F -x 'RECORD_VERSION=1' "$permit" >/dev/null || die 'authorization receipt version drifted'
grep -F -x 'KIND=LEETPLUS_LANGAME_DAILY_WORKER_AUTHORIZATION_V1' "$permit" >/dev/null || die 'authorization receipt kind drifted'
grep -F -x 'AUTHORIZATION_PERMITTED=true' "$permit" >/dev/null || die 'authorization receipt is not permitted'
grep -F -x "PHASE=${phase}" "$permit" >/dev/null || die 'authorization receipt phase drifted'
grep -F -x "RELEASE_SHA=${release_sha}" "$permit" >/dev/null || die 'authorization receipt release drifted'
grep -F -x "TENANT_SLUG=${tenant}" "$permit" >/dev/null || die 'authorization receipt tenant drifted'
grep -F -x "WORKER_ENV_SHA256=${env_sha}" "$permit" >/dev/null || die 'authorization receipt worker-env drifted'
stable_env_sha="$(sed -E '/^LANGAME_DAILY_WORKER_CANARY=|^LANGAME_DAILY_WORKER_DATE=/d' "$ENV_FILE" | sha256sum | awk '{print $1}')"
grep -F -x "WORKER_STABLE_ENV_SHA256=${stable_env_sha}" "$permit" >/dev/null || die 'authorization receipt stable worker-env drifted'
grep -F -x "CANARY_DATE=${date_value}" "$permit" >/dev/null || die 'authorization receipt date drifted'
attempt="$(sed -n 's/^ATTEMPT=//p' "$permit")"; [[ "$attempt" =~ ^[1-9][0-9]*$ ]] || die 'authorization receipt attempt is invalid'
grep -Eq '^PLAN_SHA256=[0-9a-f]{64}$' "$permit" && grep -Eq '^PLAN_JSON_SHA256=[0-9a-f]{64}$' "$permit" || die 'authorization receipt plan digest is invalid'
permit_identity="$(printf '%s:%s:%s:%s' "$phase" "$attempt" "$release_sha" "$env_sha" | sha256sum | awk '{print $1}')"
[[ "$(basename -- "$permit")" == "authorization-${phase}-${attempt}-${permit_identity}.receipt" ]] || die 'authorization receipt filename identity drifted'
not_after="$(sed -n 's/^NOT_AFTER_EPOCH=//p' "$permit")"; [[ "$not_after" =~ ^[0-9]+$ ]] || die 'authorization receipt expiry is invalid'
if [[ "$phase" == canary ]]; then (( not_after > $(date +%s) )) || die 'canary authorization receipt expired'; else [[ "$not_after" == 0 ]] || die 'timer authorization receipt must not carry a finite canary expiry'; fi
assert_regular "$RUNNER"; [[ "$(stat -c '%U:%G:%a:%h' -- "$RUNNER")" == 'root:root:555:1' ]] || die 'active worker runner authority drifted'
exec "$RUNNER" --expected-release-sha "$release_sha"
