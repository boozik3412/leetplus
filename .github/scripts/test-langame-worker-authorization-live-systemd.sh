#!/usr/bin/bash -p
# Exercises the actual PID-1 execution path used by the Langame worker. This
# runs only on an explicitly acknowledged disposable GitHub Actions host.
[[ $- == *p* ]] || { printf 'Langame worker live-systemd fixture requires Bash -p\n' >&2; exit 1; }
fixture_ci="${CI-}"; fixture_github_actions="${GITHUB_ACTIONS-}"; fixture_confirm="${LANGAME_WORKER_LIVE_SYSTEMD_FIXTURE_CONFIRM-}"
fixture_node_input="${LEETPLUS_FIXTURE_NODE-}"
while IFS= read -r name; do unset "$name" 2>/dev/null || true; done < <(compgen -e); unset name
PATH='/usr/sbin:/usr/bin:/sbin:/bin'; LANG=C.UTF-8; LC_ALL=C.UTF-8; TZ=UTC; export PATH LANG LC_ALL TZ
set -Eeuo pipefail; IFS=$'\n\t'; umask 0077

readonly ACK='run-bounded-root-langame-worker-live-systemd-fixture'
readonly ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly SERVICE='leetplus-langame-daily-worker.service'
readonly TIMER='leetplus-langame-daily-worker.timer'
readonly SERVICE_PATH="/etc/systemd/system/${SERVICE}"
readonly TIMER_PATH="/etc/systemd/system/${TIMER}"
readonly FENCE='/var/lib/leetplus/legacy-drain/legacy-start-fence'
readonly AUTH_ROOT='/var/lib/leetplus/langame-worker-authorizations'
readonly ENV_FILE='/etc/leetplus/langame-daily-worker.env'
readonly SHA='1111111111111111111111111111111111111111'
readonly RELEASE="/srv/leetplus/releases/${SHA}"
readonly MARKER='/var/lib/leetplus/langame-sync/live-systemd-wrapper-ran'
readonly TIMER_STAMP='/var/lib/systemd/timers/stamp-leetplus-langame-daily-worker.timer'
readonly WRAPPER='/usr/local/libexec/leetplus/run-authorized-langame-daily-worker.sh'
readonly RUNNER='/usr/local/libexec/leetplus/run-active-langame-daily-worker.sh'

created_runtime=false; created_api=false; created_system_node=false
system_node_root=''; system_node_root_device_inode=''; system_node_stage=''; system_node_stage_device_inode=''; system_node_claim=''; system_node_digest=''
die() { printf 'Langame worker live-systemd fixture: %s\n' "$*" >&2; exit 1; }
bounded_systemctl() { timeout --foreground --kill-after=2s 12s systemctl "$@"; }
assert_zero_processes() {
  local unit="$1" property value cgroup
  for property in MainPID ControlPID ExecMainPID; do
    value="$(systemctl show -p "$property" --value "$unit")"
    [[ "$value" == 0 ]] || die "${unit} retained ${property}=${value}"
  done
  cgroup="$(systemctl show -p ControlGroup --value "$unit")"
  [[ -z "$cgroup" || ! -d "/sys/fs/cgroup${cgroup}" || -z "$(find "/sys/fs/cgroup${cgroup}" -type f -name cgroup.procs -exec awk 'NF { print; exit }' {} + 2>/dev/null)" ]] || die "${unit} retained a cgroup process"
}
cleanup() {
  local original_status=$? cleanup_status=0 current_stage_device_inode='' current_root_device_inode=''
  trap - EXIT
  set +e
  bounded_systemctl disable --now "$TIMER"
  bounded_systemctl stop "$SERVICE"
  systemctl reset-failed "$SERVICE" "$TIMER"
  rm -f -- "$WRAPPER" "$RUNNER" "$SERVICE_PATH" "$TIMER_PATH" /etc/systemd/system/leetplus-langame-discrepancy-audit-preflight.service
  rm -rf -- "/etc/systemd/system/${SERVICE}.d" "/etc/systemd/system/${TIMER}.d" "$AUTH_ROOT" "$RELEASE"
  rm -f -- "$FENCE" "$ENV_FILE" /etc/leetplus/slots/blue.env /etc/nginx/leetplus/active-upstreams.conf /etc/nginx/leetplus/upstreams/blue.conf "$MARKER" "$TIMER_STAMP" /srv/leetplus/slots/blue
  rmdir -- /srv/leetplus/slots /srv/leetplus/releases /srv/leetplus /var/lib/leetplus/langame-sync /var/lib/leetplus/legacy-drain /var/lib/leetplus /etc/nginx/leetplus/upstreams /etc/nginx/leetplus /etc/nginx /etc/leetplus /usr/local/libexec/leetplus 2>/dev/null || true
  if [[ "$created_system_node" == true ]]; then
    # Move the global name atomically into the fixture's private directory
    # before inspecting or deleting it. A concurrent replacement is restored,
    # never unlinked as though it were the file published by this fixture.
    mv -T -n -- /usr/bin/node "$system_node_claim"
    if [[ -f "$system_node_claim" && ! -L "$system_node_claim" \
      && -f "$system_node_stage" && ! -L "$system_node_stage" \
      && "$system_node_claim" -ef "$system_node_stage" \
      && "$(stat -c '%d:%i' -- "$system_node_claim")" == "$system_node_stage_device_inode" \
      && "$(sha256sum -- "$system_node_claim" | awk '{print $1}')" == "$system_node_digest" ]]; then
      rm -f -- "$system_node_claim"
    else
      if [[ -e "$system_node_claim" || -L "$system_node_claim" ]]; then
        mv -T -n -- "$system_node_claim" /usr/bin/node
      fi
      printf 'Langame worker live-systemd fixture: preserved unexpected /usr/bin/node replacement\n' >&2
      cleanup_status=1
    fi
  fi
  if [[ -n "$system_node_stage" && ( -e "$system_node_stage" || -L "$system_node_stage" ) ]]; then
    if [[ -f "$system_node_stage" && ! -L "$system_node_stage" ]]; then
      current_stage_device_inode="$(stat -c '%d:%i' -- "$system_node_stage")"
    fi
    if [[ "$current_stage_device_inode" == "$system_node_stage_device_inode" ]]; then
      rm -f -- "$system_node_stage"
    else
      printf 'Langame worker live-systemd fixture: refusing to remove replaced Node staging file\n' >&2
      cleanup_status=1
    fi
  fi
  if [[ -n "$system_node_root" && ( -e "$system_node_root" || -L "$system_node_root" ) ]]; then
    if [[ -d "$system_node_root" && ! -L "$system_node_root" ]]; then
      current_root_device_inode="$(stat -c '%d:%i' -- "$system_node_root")"
    fi
    if [[ "$current_root_device_inode" == "$system_node_root_device_inode" ]]; then
      rmdir -- "$system_node_root" || cleanup_status=1
    else
      printf 'Langame worker live-systemd fixture: refusing to remove replaced Node staging directory\n' >&2
      cleanup_status=1
    fi
  fi
  systemctl daemon-reload
  [[ "$created_api" == true ]] && groupdel leetplus-api-runtime
  [[ "$created_runtime" == true ]] && groupdel leetplus-runtime
  ((original_status != 0)) && exit "$original_status"
  exit "$cleanup_status"
}
trap cleanup EXIT

[[ "$fixture_ci" == true && "$fixture_github_actions" == true && "$fixture_confirm" == "$ACK" ]] || die 'explicit GitHub Actions fixture confirmation is required'
((EUID == 0)) || die 'root is required'
[[ "$(ps -p 1 -o comm= | tr -d ' ')" == systemd ]] || die 'a real systemd PID 1 is required'
for binary in install mkdir mktemp rm rmdir systemctl timeout stat find awk grep groupadd groupdel getent ps tr readlink realpath sha256sum sed date chown chmod ln touch cat mv; do command -v "$binary" >/dev/null || die "missing ${binary}"; done
if [[ ! -e /usr/bin/node && ! -L /usr/bin/node ]]; then
  [[ -n "$fixture_node_input" ]] || die 'an exact fixture Node source is required'
  fixture_node="$(realpath -e -- "$fixture_node_input")"
  [[ "$fixture_node" == "$fixture_node_input" && -f "$fixture_node" && ! -L "$fixture_node" && -x "$fixture_node" ]] \
    || die 'fixture Node source is not one canonical regular executable'
  case "$fixture_node" in
    /opt/hostedtoolcache/node/22.*/x64/bin/node) ;;
    *) die 'fixture Node source is outside the exact GitHub Actions Node 22 authority' ;;
  esac
  [[ "$("$fixture_node" -p 'process.versions.node.split(".")[0]')" == 22 ]] \
    || die 'fixture Node source is not Node 22 authority'
  fixture_node_identity="$(stat -c '%d:%i:%s:%Y:%Z' -- "$fixture_node")"
  fixture_node_digest="$(sha256sum -- "$fixture_node" | awk '{print $1}')"
  system_node_root="$(mktemp -d -p /usr/bin '.leetplus-langame-node.XXXXXXXX')"
  system_node_root_device_inode="$(stat -c '%d:%i' -- "$system_node_root")"
  [[ "$(stat -c '%u:%g:%a:%h' -- "$system_node_root")" == '0:0:700:2' ]] \
    || die 'fixture Node staging directory is not private root authority'
  system_node_stage="${system_node_root}/node"
  system_node_claim="${system_node_root}/published"
  install -o root -g root -m 0555 -- "$fixture_node" "$system_node_stage"
  system_node_stage_device_inode="$(stat -c '%d:%i' -- "$system_node_stage")"
  system_node_digest="$fixture_node_digest"
  [[ "$(stat -c '%d:%i:%s:%Y:%Z' -- "$fixture_node")" == "$fixture_node_identity" \
    && "$(sha256sum -- "$fixture_node" | awk '{print $1}')" == "$fixture_node_digest" \
    && "$(stat -c '%d:%i' -- "$system_node_stage")" == "$system_node_stage_device_inode" \
    && "$(stat -c '%u:%g:%a:%h' -- "$system_node_stage")" == '0:0:555:1' \
    && "$(sha256sum -- "$system_node_stage" | awk '{print $1}')" == "$fixture_node_digest" ]] \
    || die 'fixture Node snapshot changed during root-owned staging'
  ln -T -- "$system_node_stage" /usr/bin/node \
    || die 'atomic exclusive publication of fixture /usr/bin/node failed'
  created_system_node=true
  [[ "$system_node_stage" -ef /usr/bin/node \
    && "$(stat -c '%u:%g:%a:%h' -- /usr/bin/node)" == '0:0:555:2' \
    && "$(sha256sum -- /usr/bin/node | awk '{print $1}')" == "$fixture_node_digest" ]] \
    || die 'fixture Node publication identity or digest drifted'
else
  [[ -f /usr/bin/node && ! -L /usr/bin/node \
    && "$(stat -c '%u:%g:%h' -- /usr/bin/node)" == '0:0:1' \
    && -z "$(find -P /usr/bin/node -maxdepth 0 -perm /022 -print -quit)" ]] \
    || die 'existing /usr/bin/node is not immutable root authority'
fi
[[ "$(/usr/bin/node -p 'process.versions.node.split(".")[0]')" == 22 ]] \
  || die 'fixture requires exact /usr/bin/node major 22'
for path in "$SERVICE_PATH" "$TIMER_PATH" "/etc/systemd/system/${SERVICE}.d" "/etc/systemd/system/${TIMER}.d" "$AUTH_ROOT" "$ENV_FILE" /etc/leetplus /etc/nginx/leetplus /srv/leetplus /var/lib/leetplus "$WRAPPER" "$RUNNER" "$TIMER_STAMP"; do [[ ! -e "$path" && ! -L "$path" ]] || die "fixture root is not clean at ${path}"; done
if ! getent group leetplus-runtime >/dev/null; then groupadd --system leetplus-runtime; created_runtime=true; fi
if ! getent group leetplus-api-runtime >/dev/null; then groupadd --system leetplus-api-runtime; created_api=true; fi

install -d -o root -g root -m 0755 /etc/leetplus /etc/nginx/leetplus/upstreams /srv/leetplus/releases /srv/leetplus/slots /var/lib/leetplus/legacy-drain /usr/local/libexec/leetplus
install -d -o root -g leetplus-api-runtime -m 0710 "$AUTH_ROOT"
install -d -o root -g leetplus-api-runtime -m 2770 /var/lib/leetplus/langame-sync
install -d -o root -g leetplus-runtime -m 0755 "$RELEASE/apps/api/dist/integrations"
ln -s "$RELEASE" /srv/leetplus/slots/blue
printf 'RELEASE_SHA=%s\n' "$SHA" >/etc/leetplus/slots/blue.env; chown root:leetplus-runtime /etc/leetplus/slots/blue.env; chmod 0440 /etc/leetplus/slots/blue.env
touch /etc/nginx/leetplus/upstreams/blue.conf; chmod 0444 /etc/nginx/leetplus/upstreams/blue.conf
ln -s /etc/nginx/leetplus/upstreams/blue.conf /etc/nginx/leetplus/active-upstreams.conf
cat >"$RELEASE/apps/api/dist/integrations/langame-daily-worker.cli.js" <<'EOF'
'use strict';
const fs = require('node:fs');
fs.appendFileSync('/var/lib/leetplus/langame-sync/live-systemd-wrapper-ran', `${process.env.INVOCATION_ID}\n`, { mode: 0o600 });
EOF
chown root:leetplus-runtime "$RELEASE/apps/api/dist/integrations/langame-daily-worker.cli.js"; chmod 0555 "$RELEASE/apps/api/dist/integrations/langame-daily-worker.cli.js"
cat >"$ENV_FILE" <<'EOF'
DATABASE_URL=postgresql://fixture
APP_ENCRYPTION_KEY=fixture-app-key
INTEGRATION_ENCRYPTION_KEY=fixture-integration-key
LANGAME_DISCREPANCY_LOG_ROOT=/var/lib/leetplus/langame-sync
LANGAME_DAILY_WORKER_ENABLED=true
LANGAME_DAILY_WORKER_LIVE=true
LANGAME_DAILY_WORKER_TENANT_SLUG=fixture-tenant
LANGAME_DAILY_WORKER_CANARY=true
LANGAME_DAILY_WORKER_DATE=2026-09-04
LANGAME_DAILY_SYNC_SCHEDULER_ENABLED=false
LANGAME_SCHEDULED_HTTP_ENABLED=false
EOF
chown root:leetplus-api-runtime "$ENV_FILE"; chmod 0640 "$ENV_FILE"
install -o root -g root -m 0444 "$ROOT/docs/deployment/production-artifact/systemd/leetplus-langame-daily-worker.service" "$SERVICE_PATH"
install -o root -g root -m 0444 "$ROOT/docs/deployment/production-artifact/systemd/leetplus-langame-daily-worker.timer" "$TIMER_PATH"
install -o root -g root -m 0555 "$ROOT/docs/deployment/production-artifact/run-authorized-langame-daily-worker.sh" "$WRAPPER"
install -o root -g root -m 0555 "$ROOT/docs/deployment/production-artifact/run-active-langame-daily-worker.sh" "$RUNNER"
cat >/etc/systemd/system/leetplus-langame-discrepancy-audit-preflight.service <<'EOF'
[Service]
Type=oneshot
ExecStart=/usr/bin/true
EOF
for unit in "$SERVICE" "$TIMER"; do
  install -d -o root -g root -m 0755 "/etc/systemd/system/${unit}.d"
  printf '[Unit]\nConditionPathExists=!%s\n' "$FENCE" >"/etc/systemd/system/${unit}.d/90-leetplus-nminus1-start-fence.conf"
done

# Full 3-key pointer and 19-key receipt: the exact production wrapper must
# consume this synthetic record before it can hand off to the active runner.
env_sha="$(sha256sum "$ENV_FILE" | awk '{print $1}')"
stable_sha="$(sed -E '/^LANGAME_DAILY_WORKER_CANARY=|^LANGAME_DAILY_WORKER_DATE=/d' "$ENV_FILE" | sha256sum | awk '{print $1}')"
permit_id="$(printf '%s:%s:%s:%s' canary 1 "$SHA" "$env_sha" | sha256sum | awk '{print $1}')"
permit="$AUTH_ROOT/authorization-canary-1-${permit_id}.receipt"
cat >"$permit" <<EOF
RECORD_VERSION=1
KIND=LEETPLUS_LANGAME_DAILY_WORKER_AUTHORIZATION_V1
AUTHORIZATION_PERMITTED=true
PHASE=canary
ATTEMPT=1
PLAN_SHA256=$(printf 'a%.0s' {1..64})
RELEASE_SHA=${SHA}
TENANT_SLUG=fixture-tenant
WORKER_ENV_SHA256=${env_sha}
WORKER_STABLE_ENV_SHA256=${stable_sha}
AUTH_ENV_SHA256=$(printf 'b%.0s' {1..64})
SAFE_ENV_SHA256=$(printf 'c%.0s' {1..64})
SERVICE_SHA256=$(sha256sum "$SERVICE_PATH" | awk '{print $1}')
TIMER_SHA256=$(sha256sum "$TIMER_PATH" | awk '{print $1}')
SUCCESSOR_RECEIPT_SHA256=$(printf 'd%.0s' {1..64})
CONTROL_VERIFIER_OUTPUT_SHA256=$(printf 'e%.0s' {1..64})
CANARY_DATE=2026-09-04
NOT_AFTER_EPOCH=$(( $(date +%s) + 600 ))
PLAN_JSON_SHA256=$(printf 'f%.0s' {1..64})
EOF
chown root:leetplus-api-runtime "$permit"; chmod 0440 "$permit"
permit_sha="$(sha256sum "$permit" | awk '{print $1}')"
cat >"$AUTH_ROOT/active-canary.permit" <<EOF
RECORD_VERSION=1
PERMIT_PATH=${permit}
PERMIT_SHA256=${permit_sha}
EOF
chown root:leetplus-api-runtime "$AUTH_ROOT/active-canary.permit"; chmod 0440 "$AUTH_ROOT/active-canary.permit"

touch "$FENCE"; chmod 0600 "$FENCE"
systemctl daemon-reload
[[ "$(systemctl show -p UnitFileState --value "$SERVICE")" == static ]] || die 'service is not static before authorization'
[[ "$(systemctl show -p UnitFileState --value "$TIMER")" == disabled ]] || die 'timer is not disabled before authorization'
bounded_systemctl start "$SERVICE"
[[ "$(systemctl show -p ActiveState --value "$SERVICE")" == inactive ]] || die 'legacy fence did not prevent service start'

# The explicit 91 condition resets the inherited 90 fence only when the exact
# immutable authorization receipt exists; keep the legacy marker present so
# this exercises the real production override semantics.
for unit in "$SERVICE" "$TIMER"; do
  cat >"/etc/systemd/system/${unit}.d/91-leetplus-langame-worker-authorization.conf" <<EOF
[Unit]
ConditionPathExists=
ConditionPathExists=${permit}
EOF
done
mv -- "$permit" "${permit}.hidden"
systemctl daemon-reload
bounded_systemctl start "$TIMER"
[[ "$(systemctl show -p ActiveState --value "$TIMER")" == inactive ]] || die 'missing permit did not prevent timer start'
mv -- "${permit}.hidden" "$permit"
systemctl daemon-reload

# Valid files cannot make a direct caller look like PID 1's fresh MainPID.
if INVOCATION_ID=00000000000000000000000000000000 "$WRAPPER" >/dev/null 2>&1; then die 'direct wrapper invocation was accepted'; fi
before="$(systemctl show -p InvocationID --value "$SERVICE")"
bounded_systemctl start "$SERVICE"
after="$(systemctl show -p InvocationID --value "$SERVICE")"
[[ -n "$after" && "$after" != "$before" && "$(systemctl show -p Result --value "$SERVICE")" == success && "$(systemctl show -p ExecMainStatus --value "$SERVICE")" == 0 ]] || die 'authorized wrapper/runner did not obtain a fresh successful invocation'
assert_zero_processes "$SERVICE"
[[ -f "$MARKER" && ! -L "$MARKER" && "$(stat -c '%G:%a:%h' "$MARKER")" == 'leetplus-api-runtime:600:1' ]] || die 'synthetic Node entrypoint did not run under the systemd wrapper path'
[[ "$(tr -d '\n' < "$MARKER")" == "$after" ]] || die 'Node entrypoint did not receive systemd InvocationID through both wrappers'

# Force one deterministic missed-elapse activation. The production controller
# no longer performs a timer-profile service preflight before this point, so a
# Persistent=true catch-up remains the only timer-profile invocation.
rm -f -- "$MARKER"
install -o root -g root -m 0644 /dev/null "$TIMER_STAMP"
touch -d '2020-01-01 00:00:00 UTC' "$TIMER_STAMP"
before_timer_invocation="$(systemctl show -p InvocationID --value "$SERVICE")"
bounded_systemctl enable --now "$TIMER"
[[ "$(systemctl show -p UnitFileState --value "$TIMER")" == enabled && "$(systemctl show -p ActiveState --value "$TIMER")" == active && "$(systemctl show -p SubState --value "$TIMER")" == waiting ]] || die 'authorized timer is not enabled active(waiting)'
assert_zero_processes "$TIMER"
for _ in {1..20}; do
  [[ -f "$MARKER" && "$(systemctl show -p ActiveState --value "$SERVICE")" == inactive ]] && break
  sleep 1
done
[[ "$(systemctl show -p ActiveState --value "$SERVICE")" == inactive && "$(systemctl show -p Result --value "$SERVICE")" == success ]] || die 'persistent timer left a failed or in-flight service'
after_timer_invocation="$(systemctl show -p InvocationID --value "$SERVICE")"
[[ -n "$after_timer_invocation" && "$after_timer_invocation" != "$before_timer_invocation" && "$(wc -l < "$MARKER" | tr -d '[:space:]')" == 1 ]] || die 'missed persistent timer did not execute exactly one timer-profile worker'
assert_zero_processes "$SERVICE"
bounded_systemctl disable --now "$TIMER"
rm -f -- "/etc/systemd/system/${SERVICE}.d/91-leetplus-langame-worker-authorization.conf" "/etc/systemd/system/${TIMER}.d/91-leetplus-langame-worker-authorization.conf" "$AUTH_ROOT/active-canary.permit"
systemctl daemon-reload
bounded_systemctl start "$SERVICE"
[[ "$(systemctl show -p ActiveState --value "$SERVICE")" == inactive ]] || die 'service starts after authorization cleanup despite absent 91 permit'
assert_zero_processes "$SERVICE"
assert_zero_processes "$TIMER"
printf 'LANGAME_WORKER_AUTHORITY_LIVE_SYSTEMD_FIXTURE=PASS\n'
