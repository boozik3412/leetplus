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
readonly TIMER_ENV_TEMP='/etc/leetplus/langame-daily-worker.timer.env.tmp'
readonly SHA='1111111111111111111111111111111111111111'
readonly RELEASE="/srv/leetplus/releases/${SHA}"
readonly MARKER='/var/lib/leetplus/langame-sync/live-systemd-wrapper-ran'
readonly WRAPPER='/usr/local/libexec/leetplus/run-authorized-langame-daily-worker.sh'
readonly RUNNER='/usr/local/libexec/leetplus/run-active-langame-daily-worker.sh'
readonly MANAGER_ISOLATION_CANARY='leetplus-langame-manager-isolation-canary.service'
readonly MANAGER_ISOLATION_USER='lp-langame-isolate'
readonly WRONG_UNIT_CANARY='leetplus-langame-worker-wrong-unit-canary.service'
readonly WRONG_UNIT_USER='lp-langame-wrong'

created_runtime=false; created_api=false; created_system_node=false
system_node_root=''; system_node_root_device_inode=''; system_node_stage=''; system_node_stage_device_inode=''; system_node_claim=''; system_node_digest=''
die() { printf 'Langame worker live-systemd fixture: %s\n' "$*" >&2; exit 1; }
bounded_systemctl() { timeout --foreground --kill-after=2s 12s systemctl "$@"; }
bounded_systemd_run() { timeout --foreground --kill-after=4s 30s systemd-run --expand-environment=no "$@"; }
start_worker_or_report() {
  if bounded_systemctl start "$SERVICE"; then return 0; fi
  report_worker_state
  die 'authorized systemd worker invocation failed'
}
report_worker_state() {
  printf 'Langame worker live-systemd fixture: service state follows\n' >&2
  bounded_systemctl show --no-pager \
    -p LoadState -p ActiveState -p SubState -p Result -p ExecMainStatus \
    -p InvocationID -p ExecMainStartTimestampMonotonic -p ExecMainExitTimestampMonotonic \
    -p MainPID -p ControlPID -p ExecMainPID "$SERVICE" >&2 || true
  bounded_systemctl --no-pager --full status "$SERVICE" >&2 || true
  timeout --foreground --kill-after=2s 12s journalctl --no-pager --output=short-precise --unit "$SERVICE" --lines=80 >&2 || true
}
read_marker_invocation() {
  local line_count invocation
  [[ -f "$MARKER" && ! -L "$MARKER" && "$(stat -c '%G:%a:%h' "$MARKER")" == 'leetplus-api-runtime:600:1' ]] \
    || { report_worker_state; die 'synthetic Node entrypoint did not publish one safe marker'; }
  line_count="$(wc -l < "$MARKER" | tr -d '[:space:]')"
  invocation="$(tr -d '\n' < "$MARKER")"
  [[ "$line_count" == 1 && "$invocation" =~ ^[0-9a-f]{32}$ ]] \
    || { printf 'markerLineCount=%s markerInvocation=%s\n' "$line_count" "$invocation" >&2; report_worker_state; die 'synthetic Node entrypoint marker is not one exact InvocationID'; }
  printf '%s' "$invocation"
}
transient_unit_is_absent() {
  local unit="$1"
  for _ in {1..40}; do
    [[ "$(bounded_systemctl show -p LoadState --value "$unit")" == not-found ]] && return 0
    sleep 0.1
  done
  return 1
}
run_dynamic_manager_isolation_canary() {
  if ! bounded_systemd_run --quiet --wait --collect --unit="$MANAGER_ISOLATION_CANARY" \
    --property=Type=exec \
    --property=DynamicUser=yes \
    --property=User="$MANAGER_ISOLATION_USER" \
    --property=NoNewPrivileges=yes \
    --property=PrivateDevices=yes \
    --property=PrivateNetwork=yes \
    --property=PrivateTmp=yes \
    --property=ProtectControlGroups=yes \
    --property=ProtectHome=yes \
    --property=ProtectProc=invisible \
    --property=ProtectSystem=strict \
    --property=ProcSubset=pid \
    --property=RestrictAddressFamilies=AF_UNIX \
    --property=RestrictNamespaces=yes \
    --property='InaccessiblePaths=/run/dbus /run/systemd/private' \
    /usr/bin/bash -p -ceu '
      fail() {
        printf "Langame isolation canary: %s; pid=%s invocation=%s\n" "$1" "$$" "${INVOCATION_ID:-unset}" >&2
        printf "Langame isolation canary: /proc/self/cgroup=" >&2
        while IFS= read -r record; do printf "<%s>" "$record" >&2; done < /proc/self/cgroup
        printf "\n" >&2
        exit 41
      }
      (( EUID != 0 ))
      readonly expected="/system.slice/leetplus-langame-manager-isolation-canary.service"
      mapfile -t cgroups < /proc/self/cgroup
      [[ "${#cgroups[@]}" == 1 && "${cgroups[0]}" == "0::${expected}" ]] || fail "cgroup record mismatch"
      mapfile -t pids < "/sys/fs/cgroup${expected}/cgroup.procs"
      [[ "${#pids[@]}" == 1 && "${pids[0]}" == "$$" ]] || fail "cgroup is not singleton"
      [[ "${INVOCATION_ID:-}" =~ ^[0-9a-f]{32}$ ]] || fail "InvocationID is invalid"
      "$1" -e "$2"
      mapfile -t pids < "/sys/fs/cgroup${expected}/cgroup.procs"
      [[ "${#pids[@]}" == 1 && "${pids[0]}" == "$$" ]] || fail "cgroup did not return to singleton after transport probes"
    ' langame-isolation-canary /usr/bin/node '
      const net = require("node:net");
      const deniedCodes = new Set(["EACCES", "EPERM", "ENOENT", "ENOTSOCK", "ENXIO", "ECONNREFUSED"]);
      function assertDenied(path) {
        return new Promise((resolve, reject) => {
          let finished = false;
          let timer;
          const socket = net.createConnection({ path });
          const finish = (denied, error) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            socket.destroy();
            if (denied) resolve(); else reject(error);
          };
          timer = setTimeout(() => finish(false, new Error(`manager transport probe timed out: ${path}`)), 1000);
          socket.once("connect", () => finish(false, new Error(`manager transport accepted a connection: ${path}`)));
          socket.once("error", (error) => {
            if (deniedCodes.has(error.code)) finish(true);
            else finish(false, new Error(`manager transport returned unexpected ${error.code || "UNKNOWN"}: ${path}`));
          });
        });
      }
      (async () => {
        for (const path of ["/run/dbus/system_bus_socket", "/run/systemd/private"]) await assertDenied(path);
      })().catch((error) => {
        console.error(`Langame isolation canary: ${error.message}`);
        process.exitCode = 41;
      });
    '; then
    systemctl --no-pager --full status "$MANAGER_ISOLATION_CANARY" >&2 || true
    journalctl --no-pager --output=short-precise --unit "$MANAGER_ISOLATION_CANARY" --lines=80 >&2 || true
    die 'DynamicUser cgroup proof or system-manager isolation failed'
  fi
  transient_unit_is_absent "$MANAGER_ISOLATION_CANARY" \
    || die 'DynamicUser isolation canary left a transient unit'
}
assert_zero_processes() {
  local unit="$1" property value exec_main_pid cgroup
  # ExecMainPID is historical terminal metadata for a completed oneshot on
  # systemd 255. It blocks only while its exact /proc identity is live; PID
  # reuse is deliberately conservative. MainPID/ControlPID and the cgroup are
  # the primary live-process boundary.
  for property in MainPID ControlPID; do
    value="$(systemctl show -p "$property" --value "$unit")"
    [[ "$value" == 0 ]] || die "${unit} retained ${property}=${value}"
  done
  exec_main_pid="$(systemctl show -p ExecMainPID --value "$unit")"
  if [[ -n "$exec_main_pid" && "$exec_main_pid" != 0 ]]; then
    [[ "$exec_main_pid" =~ ^[1-9][0-9]*$ ]] || die "${unit} exposes invalid historical ExecMainPID=${exec_main_pid}"
    [[ ! -e "/proc/${exec_main_pid}" ]] || die "${unit} historical ExecMainPID is still live or reused: ${exec_main_pid}"
  fi
  cgroup="$(systemctl show -p ControlGroup --value "$unit")"
  [[ -z "$cgroup" || ! -d "/sys/fs/cgroup${cgroup}" || -z "$(find "/sys/fs/cgroup${cgroup}" -type f -name cgroup.procs -exec awk 'NF { print; exit }' {} + 2>/dev/null)" ]] || die "${unit} retained a cgroup process"
}
cleanup() {
  local original_status=$? cleanup_status=0 current_stage_device_inode='' current_root_device_inode=''
  trap - EXIT
  set +e
  bounded_systemctl disable --now "$TIMER"
  bounded_systemctl stop "$SERVICE" "$MANAGER_ISOLATION_CANARY" "$WRONG_UNIT_CANARY"
  systemctl reset-failed "$SERVICE" "$TIMER" "$MANAGER_ISOLATION_CANARY" "$WRONG_UNIT_CANARY"
  rm -f -- "$WRAPPER" "$RUNNER" "$SERVICE_PATH" "$TIMER_PATH" /etc/systemd/system/leetplus-langame-discrepancy-audit-preflight.service
  rm -rf -- "/etc/systemd/system/${SERVICE}.d" "/etc/systemd/system/${TIMER}.d" "$AUTH_ROOT" "$RELEASE"
  rm -f -- "$FENCE" "$ENV_FILE" "$TIMER_ENV_TEMP" /etc/leetplus/slots/blue.env /etc/nginx/leetplus/active-upstreams.conf /etc/nginx/leetplus/upstreams/blue.conf "$MARKER" /srv/leetplus/slots/blue
  rmdir -- /srv/leetplus/slots /srv/leetplus/releases /srv/leetplus /var/lib/leetplus/langame-sync /var/lib/leetplus/legacy-drain /var/lib/leetplus /etc/nginx/leetplus/upstreams /etc/nginx/leetplus /etc/nginx /etc/leetplus/slots /etc/leetplus /usr/local/libexec/leetplus 2>/dev/null || true
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
[[ "$fixture_ci" == true && "$fixture_github_actions" == true && "$fixture_confirm" == "$ACK" ]] \
  || die 'explicit disposable GitHub Actions fixture confirmation is required'
((EUID == 0)) || die 'root is required'
[[ "$(ps -p 1 -o comm= | tr -d ' ')" == systemd ]] || die 'a real systemd PID 1 is required'
for binary in install mkdir mktemp rm rmdir systemctl systemd-run journalctl timeout stat find awk grep groupadd groupdel getent id ps tr readlink realpath sha256sum sed date chown chmod ln touch cat mv sleep dirname; do command -v "$binary" >/dev/null || die "missing ${binary}"; done
systemd-run --help | grep -F -- '--expand-environment=BOOL' >/dev/null \
  || die 'systemd-run lacks literal-argument transport required by the fixture'
for dynamic_user in "$MANAGER_ISOLATION_USER" "$WRONG_UNIT_USER"; do
  [[ "$dynamic_user" =~ ^[a-z_][a-z0-9_-]{0,30}$ ]] \
    || die "fixture DynamicUser name is outside the portable systemd limit: ${dynamic_user}"
done

# Refuse foreign state before cleanup is armed. A failed cleanliness check must
# never stop or remove a pre-existing unit/path that belongs to another task.
for path in \
  "$SERVICE_PATH" "$TIMER_PATH" \
  "/etc/systemd/system/${SERVICE}.d" "/etc/systemd/system/${TIMER}.d" \
  /etc/systemd/system/leetplus-langame-discrepancy-audit-preflight.service \
  "$AUTH_ROOT" "$ENV_FILE" "$TIMER_ENV_TEMP" /etc/leetplus /etc/nginx/leetplus /srv/leetplus \
  /var/lib/leetplus "$WRAPPER" "$RUNNER"; do
  [[ ! -e "$path" && ! -L "$path" ]] || die "fixture root is not clean at ${path}"
done
for unit in \
  "$SERVICE" "$TIMER" leetplus-langame-discrepancy-audit-preflight.service \
  "$MANAGER_ISOLATION_CANARY" "$WRONG_UNIT_CANARY"; do
  [[ "$(bounded_systemctl show -p LoadState --value "$unit")" == not-found ]] \
    || die "fixture unit already exists: ${unit}"
done
trap cleanup EXIT

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
run_dynamic_manager_isolation_canary
if ! getent group leetplus-runtime >/dev/null; then groupadd --system leetplus-runtime; created_runtime=true; fi
if ! getent group leetplus-api-runtime >/dev/null; then groupadd --system leetplus-api-runtime; created_api=true; fi

install -d -o root -g root -m 0755 /etc/leetplus/slots /etc/nginx/leetplus/upstreams /srv/leetplus/releases /srv/leetplus/slots /var/lib/leetplus/legacy-drain /usr/local/libexec/leetplus
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
const net = require('node:net');
const expectedCgroup = '/system.slice/leetplus-langame-daily-worker.service';
if (fs.readFileSync('/proc/self/cgroup', 'utf8') !== `0::${expectedCgroup}\n`) {
  throw new Error('worker cgroup identity drifted after wrapper exec');
}
const members = fs.readFileSync(`/sys/fs/cgroup${expectedCgroup}/cgroup.procs`, 'utf8').trim().split('\n');
if (members.length !== 1 || members[0] !== String(process.pid)) {
  throw new Error('worker is not the singleton cgroup process after wrapper exec');
}
const deniedCodes = new Set(['EACCES', 'EPERM', 'ENOENT', 'ENOTSOCK', 'ENXIO', 'ECONNREFUSED']);
function assertDenied(path) {
  return new Promise((resolve, reject) => {
    let finished = false;
    let timer;
    const socket = net.createConnection({ path });
    const finish = (denied, error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      socket.destroy();
      if (denied) resolve(); else reject(error);
    };
    timer = setTimeout(() => finish(false, new Error(`manager transport probe timed out: ${path}`)), 1000);
    socket.once('connect', () => finish(false, new Error(`manager transport accepted a connection: ${path}`)));
    socket.once('error', (error) => {
      if (deniedCodes.has(error.code)) finish(true);
      else finish(false, new Error(`manager transport returned unexpected ${error.code || 'UNKNOWN'}: ${path}`));
    });
  });
}
(async () => {
  for (const path of ['/run/dbus/system_bus_socket', '/run/systemd/private']) await assertDenied(path);
  fs.appendFileSync('/var/lib/leetplus/langame-sync/live-systemd-wrapper-ran', `${process.env.INVOCATION_ID}\n`, { mode: 0o600 });
})().catch((error) => {
  console.error(`Langame worker transport assertion failed: ${error.message}`);
  process.exitCode = 41;
});
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

# Valid files cannot make a direct caller enter the exact root-managed worker
# cgroup as its singleton process.
if INVOCATION_ID=00000000000000000000000000000000 "$WRAPPER" >/dev/null 2>&1; then die 'direct wrapper invocation was accepted'; fi
set +e
wrong_unit_output="$(bounded_systemd_run --quiet --wait --collect --pipe --unit="$WRONG_UNIT_CANARY" \
  --property=Type=exec \
  --property=DynamicUser=yes \
  --property=User="$WRONG_UNIT_USER" \
  --property=NoNewPrivileges=yes \
  "$WRAPPER" 2>&1)"
wrong_unit_status=$?
set -e
if [[ "$wrong_unit_status" != 1 \
  || "$wrong_unit_output" != *'caller is outside the exact Langame worker systemd unit'* ]]; then
  printf 'wrong-unit canary status=%s output=%s\n' "$wrong_unit_status" "$wrong_unit_output" >&2
  die 'wrong-unit canary did not reach the exact wrapper cgroup denial'
fi
transient_unit_is_absent "$WRONG_UNIT_CANARY" \
  || die 'wrong-unit denial canary left a transient unit'
start_worker_or_report
if [[ "$(systemctl show -p ActiveState --value "$SERVICE")" != inactive \
  || "$(systemctl show -p SubState --value "$SERVICE")" != dead \
  || "$(systemctl show -p Result --value "$SERVICE")" != success \
  || "$(systemctl show -p ExecMainStatus --value "$SERVICE")" != 0 ]]; then
  report_worker_state
  die 'authorized wrapper/runner did not reach a successful terminal state'
fi
assert_zero_processes "$SERVICE"
canary_invocation="$(read_marker_invocation)"

# Transition to the exact persistent timer profile. A canary pointer or a 91
# drop-in naming the canary receipt must not authorize CANARY=false.
rm -f -- "$MARKER"
sed -E '/^LANGAME_DAILY_WORKER_DATE=/d; s/^LANGAME_DAILY_WORKER_CANARY=true$/LANGAME_DAILY_WORKER_CANARY=false/' "$ENV_FILE" > "$TIMER_ENV_TEMP"
chown root:leetplus-api-runtime "$TIMER_ENV_TEMP"; chmod 0640 "$TIMER_ENV_TEMP"
if [[ "$(grep -c '^LANGAME_DAILY_WORKER_CANARY=false$' "$TIMER_ENV_TEMP" || true)" != 1 ]] \
  || grep -q '^LANGAME_DAILY_WORKER_DATE=' "$TIMER_ENV_TEMP"; then
  die 'timer worker profile rewrite is not exact'
fi
mv -T -- "$TIMER_ENV_TEMP" "$ENV_FILE"
timer_env_sha="$(sha256sum "$ENV_FILE" | awk '{print $1}')"
timer_stable_sha="$(sed -E '/^LANGAME_DAILY_WORKER_CANARY=|^LANGAME_DAILY_WORKER_DATE=/d' "$ENV_FILE" | sha256sum | awk '{print $1}')"
[[ "$timer_stable_sha" == "$stable_sha" && "$timer_env_sha" != "$env_sha" ]] \
  || die 'timer worker profile stable/full digest transition is invalid'
if bounded_systemctl start "$SERVICE"; then
  report_worker_state
  die 'canary authorization unexpectedly accepted the timer worker profile'
fi
[[ ! -e "$MARKER" && ! -L "$MARKER" ]] \
  || die 'rejected canary-to-timer transition executed the worker entrypoint'
assert_zero_processes "$SERVICE"
bounded_systemctl reset-failed "$SERVICE"

timer_permit_id="$(printf '%s:%s:%s:%s' timer 1 "$SHA" "$timer_env_sha" | sha256sum | awk '{print $1}')"
timer_permit="$AUTH_ROOT/authorization-timer-1-${timer_permit_id}.receipt"
cat >"$timer_permit" <<EOF
RECORD_VERSION=1
KIND=LEETPLUS_LANGAME_DAILY_WORKER_AUTHORIZATION_V1
AUTHORIZATION_PERMITTED=true
PHASE=timer
ATTEMPT=1
PLAN_SHA256=$(printf '1%.0s' {1..64})
RELEASE_SHA=${SHA}
TENANT_SLUG=fixture-tenant
WORKER_ENV_SHA256=${timer_env_sha}
WORKER_STABLE_ENV_SHA256=${timer_stable_sha}
AUTH_ENV_SHA256=$(printf '2%.0s' {1..64})
SAFE_ENV_SHA256=$(printf '3%.0s' {1..64})
SERVICE_SHA256=$(sha256sum "$SERVICE_PATH" | awk '{print $1}')
TIMER_SHA256=$(sha256sum "$TIMER_PATH" | awk '{print $1}')
SUCCESSOR_RECEIPT_SHA256=$(printf '4%.0s' {1..64})
CONTROL_VERIFIER_OUTPUT_SHA256=$(printf '5%.0s' {1..64})
CANARY_DATE=
NOT_AFTER_EPOCH=0
PLAN_JSON_SHA256=$(printf '6%.0s' {1..64})
EOF
chown root:leetplus-api-runtime "$timer_permit"; chmod 0440 "$timer_permit"
timer_permit_sha="$(sha256sum "$timer_permit" | awk '{print $1}')"
cat >"$AUTH_ROOT/active-timer.permit" <<EOF
RECORD_VERSION=1
PERMIT_PATH=${timer_permit}
PERMIT_SHA256=${timer_permit_sha}
EOF
chown root:leetplus-api-runtime "$AUTH_ROOT/active-timer.permit"; chmod 0440 "$AUTH_ROOT/active-timer.permit"
for unit in "$SERVICE" "$TIMER"; do
  cat >"/etc/systemd/system/${unit}.d/91-leetplus-langame-worker-authorization.conf" <<EOF
[Unit]
ConditionPathExists=
ConditionPathExists=${timer_permit}
EOF
done
cat >"/etc/systemd/system/${TIMER}.d/92-leetplus-langame-fixture-schedule.conf" <<'EOF'
[Timer]
OnCalendar=
OnCalendar=2099-01-01 00:00:00 UTC
OnActiveSec=2s
Persistent=false
AccuracySec=1s
RandomizedDelaySec=0
EOF
chmod 0644 "/etc/systemd/system/${TIMER}.d/92-leetplus-langame-fixture-schedule.conf"
systemctl daemon-reload

# Exercise one deterministic timer-to-service activation without waiting for
# the production unit's legitimate 90-second calendar coalescing window. The
# exact production schedule remains pinned by the static template regression.
bounded_systemctl enable --now "$TIMER"
[[ "$(systemctl show -p UnitFileState --value "$TIMER")" == enabled && "$(systemctl show -p ActiveState --value "$TIMER")" == active && "$(systemctl show -p SubState --value "$TIMER")" == waiting ]] || die 'authorized timer is not enabled active(waiting)'
assert_zero_processes "$TIMER"
for _ in {1..20}; do
  [[ -f "$MARKER" && "$(systemctl show -p ActiveState --value "$SERVICE")" == inactive ]] && break
  sleep 1
done
if [[ "$(systemctl show -p ActiveState --value "$SERVICE")" != inactive \
  || "$(systemctl show -p SubState --value "$SERVICE")" != dead \
  || "$(systemctl show -p Result --value "$SERVICE")" != success \
  || "$(systemctl show -p ExecMainStatus --value "$SERVICE")" != 0 ]]; then
  report_worker_state
  die 'persistent timer left a failed or in-flight service'
fi
timer_invocation="$(read_marker_invocation)"
[[ "$timer_invocation" != "$canary_invocation" ]] \
  || { report_worker_state; die 'timer did not prove a fresh timer-profile invocation'; }
assert_zero_processes "$SERVICE"
bounded_systemctl disable --now "$TIMER"
bounded_systemctl stop "$SERVICE"
bounded_systemctl reset-failed "$SERVICE" "$TIMER"
[[ "$(systemctl show -p ActiveState --value "$SERVICE")" == inactive \
  && "$(systemctl show -p SubState --value "$SERVICE")" == dead \
  && "$(systemctl show -p ActiveState --value "$TIMER")" == inactive \
  && "$(systemctl show -p UnitFileState --value "$TIMER")" == disabled ]] \
  || die 'worker service/timer were not quiescent before authorization cleanup'
assert_zero_processes "$SERVICE"
assert_zero_processes "$TIMER"
rm -f -- "/etc/systemd/system/${SERVICE}.d/91-leetplus-langame-worker-authorization.conf" "/etc/systemd/system/${TIMER}.d/91-leetplus-langame-worker-authorization.conf" "$AUTH_ROOT/active-canary.permit" "$AUTH_ROOT/active-timer.permit"
systemctl daemon-reload
[[ ! -e "$AUTH_ROOT/active-canary.permit" && ! -L "$AUTH_ROOT/active-canary.permit" \
  && ! -e "$AUTH_ROOT/active-timer.permit" && ! -L "$AUTH_ROOT/active-timer.permit" \
  && ! -e "/etc/systemd/system/${SERVICE}.d/91-leetplus-langame-worker-authorization.conf" \
  && ! -e "/etc/systemd/system/${TIMER}.d/91-leetplus-langame-worker-authorization.conf" ]] \
  || die 'authorization pointer or drop-in remained after revocation'
rm -f -- "$MARKER"
bounded_systemctl start "$SERVICE"
[[ "$(systemctl show -p ActiveState --value "$SERVICE")" == inactive ]] || die 'service starts after authorization cleanup despite absent 91 permit'
bounded_systemctl start "$TIMER"
[[ "$(systemctl show -p ActiveState --value "$TIMER")" == inactive \
  && "$(systemctl show -p UnitFileState --value "$TIMER")" == disabled \
  && ! -e "$MARKER" && ! -L "$MARKER" ]] \
  || die 'service or timer executed after authorization cleanup despite the retained legacy fence'
assert_zero_processes "$SERVICE"
assert_zero_processes "$TIMER"
printf 'LANGAME_WORKER_AUTHORITY_LIVE_SYSTEMD_FIXTURE=PASS\n'
