#!/usr/bin/env bash
# Behavioral contract test for the root-only Langame worker authority.  It runs
# inside a throw-away Linux container and replaces only that container's
# systemctl client with a deterministic systemd state model.  This exercises
# the production paths, intent/receipt protocol and unit condition semantics
# without touching a host manager or a production root.
set -Eeuo pipefail
IFS=$'\n\t'

repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
command -v docker >/dev/null || { printf 'Langame worker fixture: docker is required\n' >&2; exit 1; }
readonly FIXTURE_IMAGE='node:22.23.2-bookworm@sha256:0557ac14e0d45d02ed563067b82856ca5e7aa3437fa28d98d4350ea9c3d9494a'
docker run --rm --platform linux/amd64 --network none --pids-limit 256 --memory 512m \
  --mount "type=bind,src=${repo},dst=/workspace,readonly" --workdir /workspace \
  --entrypoint /usr/bin/bash "$FIXTURE_IMAGE" -p -s <<'INNER'
set -Eeuo pipefail
IFS=$'\n\t'; umask 0077
readonly sha_a=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
readonly sha_b=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
groupadd --system leetplus-runtime
groupadd --system leetplus-api-runtime
mkdir -p /etc/{leetplus,nginx/leetplus/upstreams,systemd/system} /srv/leetplus/{releases,slots} /var/lib/leetplus/{legacy-drain,deploy-receipts} /run/leetplus-production-control /usr/local/{sbin,libexec/leetplus}
install -d -o root -g root -m 0500 /srv/leetplus/control-bundles /srv/leetplus/control-bundles/scheduler-free-nminus1-v1
chmod 755 /var/lib/leetplus /var/lib/leetplus/{legacy-drain,deploy-receipts}; chmod 700 /run/leetplus-production-control
touch /run/leetplus-production-control/install.lock /var/lib/leetplus/deploy-receipts/cutover.lock
chmod 600 /run/leetplus-production-control/install.lock /var/lib/leetplus/deploy-receipts/cutover.lock
mkdir -p "/srv/leetplus/releases/${sha_b}"; ln -s "/srv/leetplus/releases/${sha_b}" /srv/leetplus/slots/blue
printf 'RELEASE_SHA=%s\n' "$sha_b" >/etc/leetplus/slots.blue.env; chown root:leetplus-runtime /etc/leetplus/slots.blue.env; chmod 440 /etc/leetplus/slots.blue.env
touch /etc/nginx/leetplus/upstreams/blue.conf; ln -s /etc/nginx/leetplus/upstreams/blue.conf /etc/nginx/leetplus/active-upstreams.conf
install -m 444 /workspace/docs/deployment/production-artifact/systemd/leetplus-langame-daily-worker.service /etc/systemd/system/leetplus-langame-daily-worker.service
install -m 444 /workspace/docs/deployment/production-artifact/systemd/leetplus-langame-daily-worker.timer /etc/systemd/system/leetplus-langame-daily-worker.timer
install -m 500 /workspace/docs/deployment/production-artifact/langame-daily-worker-authorization-authority.sh /usr/local/sbin/leetplus-langame-daily-worker-authorization-authority
install -m 555 /workspace/docs/deployment/production-artifact/run-authorized-langame-daily-worker.sh /usr/local/libexec/leetplus/run-authorized-langame-daily-worker.sh
install -m 555 /workspace/docs/deployment/production-artifact/verify-langame-daily-worker-authorization.sh /usr/local/libexec/leetplus/verify-langame-daily-worker-authorization.sh
cat >/etc/leetplus/langame-daily-worker.env <<'EOF'
DATABASE_URL=postgresql://fixture
APP_ENCRYPTION_KEY=fixture
INTEGRATION_ENCRYPTION_KEY=fixture
LANGAME_DISCREPANCY_LOG_ROOT=/var/lib/leetplus/langame
LANGAME_DAILY_WORKER_ENABLED=true
LANGAME_DAILY_WORKER_LIVE=true
LANGAME_DAILY_WORKER_TENANT_SLUG=internal-fixture
LANGAME_DAILY_WORKER_CANARY=true
LANGAME_DAILY_WORKER_DATE=2026-09-04
LANGAME_DAILY_SYNC_SCHEDULER_ENABLED=false
LANGAME_SCHEDULED_HTTP_ENABLED=false
LANGAME_DAILY_WORKER_ACTIVITY_RECOVERY_ENABLED=false
LANGAME_DAILY_WORKER_ACTIVITY_RECOVERY_LIMIT=20
LANGAME_DAILY_WORKER_RETENTION_ENABLED=false
LANGAME_DAILY_WORKER_RETENTION_LIVE=false
EOF
chown root:leetplus-api-runtime /etc/leetplus/langame-daily-worker.env; chmod 640 /etc/leetplus/langame-daily-worker.env
printf 'LANGAME_DAILY_WORKER_AUTHORIZED_TENANT_SLUG=internal-fixture\nLANGAME_DAILY_WORKER_AUTHORIZED_TENANT_CLASS=INTERNAL\n' >/etc/leetplus/langame-daily-worker-authorization.env; chmod 400 /etc/leetplus/langame-daily-worker-authorization.env
printf 'LANGAME_DAILY_SYNC_SCHEDULER_ENABLED=false\nLANGAME_SCHEDULED_HTTP_ENABLED=false\n' >/etc/leetplus/canary-safe.env; chown root:leetplus-runtime /etc/leetplus/canary-safe.env; chmod 440 /etc/leetplus/canary-safe.env
for unit in leetplus-langame-daily-worker.service leetplus-langame-daily-worker.timer; do
  mkdir -p "/etc/systemd/system/${unit}.d"
  printf '[Unit]\nConditionPathExists=!/var/lib/leetplus/legacy-drain/legacy-start-fence\n' >"/etc/systemd/system/${unit}.d/90-leetplus-nminus1-start-fence.conf"
done
printf 'activation\n' >/var/lib/leetplus/legacy-drain/activation.receipt; chmod 600 /var/lib/leetplus/legacy-drain/activation.receipt
printf 'drain-evidence\n' >/var/lib/leetplus/legacy-drain/manifest-successor-drain-verification.v1; printf 'control-evidence\n' >/var/lib/leetplus/legacy-drain/manifest-successor-control-verification.v1; chmod 600 /var/lib/leetplus/legacy-drain/manifest-successor-*.v1
cat >/var/lib/leetplus/legacy-drain/manifest-successor.receipt <<EOF
RECORD_VERSION=1
LEGACY_DRAIN_MANIFEST_SUCCESSOR_ACCEPTED=true
PREVIOUS_ACTIVATION_RECEIPT_SHA256=$(sha256sum /var/lib/leetplus/legacy-drain/activation.receipt | awk '{print $1}')
PREVIOUS_UNIT_MANIFEST_SHA256=89930527907a1bf993c9b4db9165c8f8ba305d81be985264ecd3b5fa4ff86b13
UNIT_MANIFEST_SHA256=d6e7b4fe8e0aeb9a77caae62d2fb4ed9322e6383148934c5e26ff3f9126120dd
CONTROL_RELEASE_SHA=${sha_a}
CONTROL_VERIFIER_OUTPUT_SHA256=$(sha256sum /var/lib/leetplus/legacy-drain/manifest-successor-control-verification.v1 | awk '{print $1}')
PLAN_SHA256=1111111111111111111111111111111111111111111111111111111111111111
SUCCESSOR_VERIFIER_OUTPUT_SHA256=$(sha256sum /var/lib/leetplus/legacy-drain/manifest-successor-drain-verification.v1 | awk '{print $1}')
NO_ROUTE_DATABASE_OR_UNIT_STATE_EFFECTS=true
ACCEPTED_AT=2026-09-04T00:00:00Z
CONTROLLER=LEGACY_DRAIN_MANIFEST_SUCCESSOR_V1
EOF
chmod 400 /var/lib/leetplus/legacy-drain/manifest-successor.receipt
cat >/usr/local/libexec/leetplus/verify-installed-production-control-generation.mjs <<EOF
const expectedEnvironment = {
  PATH: '/usr/sbin:/usr/bin:/sbin:/bin',
  LANG: 'C.UTF-8',
  LC_ALL: 'C.UTF-8',
  TZ: 'UTC',
};
const actualNames = Object.keys(process.env).sort();
const expectedNames = Object.keys(expectedEnvironment).sort();
if (
  actualNames.length !== expectedNames.length ||
  actualNames.some((name, index) => name !== expectedNames[index]) ||
  Object.entries(expectedEnvironment).some(([name, value]) => process.env[name] !== value)
) {
  console.error('fixture control verifier received a noncanonical environment');
  process.exit(1);
}
console.log('PRODUCTION_CONTROL_INSTALLED_GENERATION=PASS'); console.log('PRODUCTION_CONTROL_RELEASE_SHA=${sha_b}');
EOF
chmod 555 /usr/local/libexec/leetplus/verify-installed-production-control-generation.mjs
printf '#!/usr/bin/bash\nprintf "LANGAME_DAILY_WORKER_AUTHORIZATION=PASS releaseSha=%s tenantSlug=internal-fixture\\n"\n' "$sha_b" >/srv/leetplus/control-bundles/scheduler-free-nminus1-v1/verify-legacy-runtime-drain.sh; chmod 400 /srv/leetplus/control-bundles/scheduler-free-nminus1-v1/verify-legacy-runtime-drain.sh
printf '#!/usr/bin/bash\nprintf "historical frozen drain verifier must not be used by worker authority\\n" >&2\nexit 97\n' >/usr/local/libexec/leetplus/verify-legacy-runtime-drain.sh; chmod 555 /usr/local/libexec/leetplus/verify-legacy-runtime-drain.sh
install -d -o root -g leetplus-api-runtime -m 0710 /var/lib/leetplus/langame-worker-authorizations
cp /usr/bin/systemctl /usr/bin/systemctl.real
cat >/usr/bin/systemctl <<'EOF'
#!/usr/bin/bash
set -euo pipefail
state=/run/langame-fixture; mkdir -p "$state"; unit="${!#}"; prop=''
for arg in "$@"; do [[ "$arg" == --property=* ]] && prop="${arg#--property=}"; done
mode="$(cat "$state/mode" 2>/dev/null || printf success)"; enabled="$(cat "$state/timer-enabled" 2>/dev/null || printf 0)"; service_active="$(cat "$state/service-active" 2>/dev/null || printf inactive)"
case "$1" in
 daemon-reload) exit 0;;
 is-failed) if [[ "$unit" == leetplus-langame-daily-worker.service && "$service_active" == failed ]]; then printf 'failed\n'; exit 0; fi; printf 'inactive\n'; exit 1;;
 is-active) [[ "$unit" == leetplus-api@blue.service || "$unit" == leetplus-web@blue.service ]] && exit 0; [[ "$unit" == leetplus-langame-daily-worker.timer && "$enabled" == 1 ]] && exit 0; exit 3;;
 is-enabled) [[ "$unit" == leetplus-langame-daily-worker.timer && "$enabled" == 1 ]] && exit 0; exit 1;;
 start) if [[ "$unit" == leetplus-langame-daily-worker.service ]]; then if grep -F -x 'LANGAME_DAILY_WORKER_CANARY=false' /etc/leetplus/langame-daily-worker.env >/dev/null; then n="$(cat "$state/timer-profile-starts" 2>/dev/null || printf 0)"; printf '%s\n' "$((n + 1))" >"$state/timer-profile-starts"; fi; if [[ "$mode" == stale ]]; then :; else started="$(cat "$state/start-monotonic" 2>/dev/null || printf 0)"; printf '%s\n' "$((started + 10))" >"$state/start-monotonic"; if [[ "$mode" == failure ]]; then printf 'fresh-failure\n' >"$state/invocation"; printf failure >"$state/result"; printf failed >"$state/service-active"; elif grep -F -x 'RemainAfterExit=yes' "/etc/systemd/system/${unit}.d/91-leetplus-langame-worker-authorization.conf" >/dev/null 2>&1; then printf 'fresh-success\n' >"$state/invocation"; printf success >"$state/result"; printf active >"$state/service-active"; touch "$state/canary-remain-after-exit-seen"; else printf 'fresh-success\n' >"$state/invocation"; printf success >"$state/result"; printf inactive >"$state/service-active"; fi; fi; fi; exit 0;;
 enable) printf 1 >"$state/timer-enabled"; if [[ "$unit" == leetplus-langame-daily-worker.timer ]]; then n="$(cat "$state/timer-profile-starts" 2>/dev/null || printf 0)"; printf '%s\n' "$((n + 1))" >"$state/timer-profile-starts"; started="$(cat "$state/start-monotonic" 2>/dev/null || printf 0)"; printf '%s\n' "$((started + 10))" >"$state/start-monotonic"; if [[ "$mode" == timer-fire-failure ]]; then printf timer-fire-failure >"$state/invocation"; printf failure >"$state/result"; printf failed >"$state/service-active"; else printf timer-fire-success >"$state/invocation"; printf success >"$state/result"; printf inactive >"$state/service-active"; fi; fi; exit 0;;
 disable) printf 0 >"$state/timer-enabled"; exit 0;;
 stop) if [[ "$unit" == leetplus-langame-daily-worker.service && "$service_active" == active ]]; then printf inactive >"$state/service-active"; fi; exit 0;;
 reset-failed) if [[ "$unit" == leetplus-langame-daily-worker.service ]]; then printf inactive >"$state/service-active"; if [[ "$mode" == failure || "$mode" == timer-fire-failure ]]; then printf success >"$state/mode"; printf success >"$state/result"; fi; fi; exit 0;;
 show) case "$prop" in
   FragmentPath) [[ "$unit" == *.timer ]] && printf '%s\n' /etc/systemd/system/leetplus-langame-daily-worker.timer || printf '%s\n' /etc/systemd/system/leetplus-langame-daily-worker.service;;
   InvocationID) cat "$state/invocation" 2>/dev/null || printf old;;
   ExecMainStartTimestampMonotonic) if [[ "$mode" == gc-success && -e "$state/gc-collected" ]]; then printf ''; else cat "$state/start-monotonic" 2>/dev/null || printf 0; fi;;
   ExecMainExitTimestampMonotonic) started="$(cat "$state/start-monotonic" 2>/dev/null || printf 0)"; if ((started > 0)); then printf '%s' "$((started + 1))"; else printf 0; fi;;
   ActiveState) if [[ "$unit" == leetplus-langame-daily-worker.service && "$mode" == deactivating ]]; then printf deactivating; elif [[ "$unit" == leetplus-langame-daily-worker.service && "$mode" == gc-success ]]; then if [[ -e "$state/gc-collected" ]]; then printf inactive >"$state/service-active"; printf inactive; else touch "$state/gc-observed"; printf active; fi; elif [[ "$unit" == leetplus-langame-daily-worker.service ]]; then printf '%s' "$service_active"; elif [[ "$unit" == *.timer && "$enabled" == 1 ]]; then printf active; else printf inactive; fi;;
   SubState) if [[ "$unit" == leetplus-langame-daily-worker.service && "$mode" == deactivating ]]; then printf stop-sigterm; elif [[ "$unit" == leetplus-langame-daily-worker.service && "$mode" == gc-success && ! -e "$state/gc-collected" ]]; then touch "$state/gc-collected"; printf running; elif [[ "$unit" == leetplus-langame-daily-worker.service && "$service_active" == active && -e "$state/canary-remain-after-exit-seen" ]]; then printf exited; elif [[ "$unit" == leetplus-langame-daily-worker.service && "$service_active" == failed ]]; then printf failed; elif [[ "$unit" == *.timer && "$enabled" == 1 ]]; then printf waiting; else printf dead; fi;;
   Result) if [[ "$mode" == gc-success && -e "$state/gc-collected" ]]; then printf ''; else cat "$state/result" 2>/dev/null || printf success; fi;;
   ExecMainStatus) printf 0;;
   MainPID|ControlPID) if [[ "$unit" == leetplus-langame-daily-worker.timer && "$mode" == timer-pid-residue ]]; then printf 4242; elif [[ "$unit" == leetplus-langame-daily-worker.timer ]]; then printf ''; elif [[ "$unit" == leetplus-langame-daily-worker.service && "$mode" == pid-residue ]]; then printf 4242; else printf 0; fi;;
   ExecMainPID) if [[ "$unit" == leetplus-langame-daily-worker.timer && "$mode" == timer-pid-residue ]]; then printf 4242; elif [[ "$unit" == leetplus-langame-daily-worker.timer ]]; then printf ''; elif [[ "$unit" == leetplus-langame-daily-worker.service && ( "$mode" == pid-residue || "$mode" == historical-exec-pid ) ]]; then printf 2147483646; elif [[ "$unit" == leetplus-langame-daily-worker.service && "$mode" == live-historical-exec-pid ]]; then printf 1; elif [[ "$unit" == leetplus-langame-daily-worker.service && "$mode" == malformed-exec-pid ]]; then printf invalid; else printf 0; fi;;
   UnitFileState) [[ "$unit" == *.timer ]] && { [[ "$enabled" == 1 ]] && printf enabled || printf disabled; } || printf static;;
   ControlGroup) printf '\n';;
   DropInPaths) for f in "/etc/systemd/system/${unit}.d/90-leetplus-nminus1-start-fence.conf" "/etc/systemd/system/${unit}.d/91-leetplus-langame-worker-authorization.conf"; do [[ -f "$f" ]] && printf '%s ' "$f"; done; printf '\n';;
 esac; exit 0;;
 *) exit 0;; esac
EOF
chmod 755 /usr/bin/systemctl
cp /usr/bin/date /usr/bin/date.real
cat >/usr/bin/date <<'EOF'
#!/usr/bin/bash
if [[ "$*" == *+%s* ]]; then
  if [[ "$(cat /run/langame-fixture/mode 2>/dev/null || true)" == stale ]]; then
    n=$(cat /run/langame-fixture/clock 2>/dev/null || echo 0); n=$((n+1)); echo "$n" >/run/langame-fixture/clock
    if ((n <= 2)); then echo 100; elif ((n == 3)); then echo 10000; else echo 20000; fi
  else echo 100; fi
else exec /usr/bin/date.real "$@"; fi
EOF
chmod 755 /usr/bin/date
printf '#!/usr/bin/bash\nexit 0\n' >/usr/bin/sleep; chmod 755 /usr/bin/sleep
plan() { /usr/local/sbin/leetplus-langame-daily-worker-authorization-authority plan --phase "$1" | sed -n 's/.*"planSha256":"\([0-9a-f]*\)".*/\1/p'; }
apply() { local p; p="$(plan "$1")"; /usr/local/sbin/leetplus-langame-daily-worker-authorization-authority apply --phase "$1" --plan-sha256 "$p" --action-count 1 --confirm I_ACCEPT_EXACT_LANGAME_DAILY_WORKER_AUTHORIZATION; }
apply_bounded() { local p; p="$(plan "$1")"; timeout --kill-after=1s 5s /usr/local/sbin/leetplus-langame-daily-worker-authorization-authority apply --phase "$1" --plan-sha256 "$p" --action-count 1 --confirm I_ACCEPT_EXACT_LANGAME_DAILY_WORKER_AUTHORIZATION; }
apply canary
/usr/local/sbin/leetplus-langame-daily-worker-authorization-authority check --phase canary
test -e /run/langame-fixture/canary-remain-after-exit-seen
printf gc-success >/run/langame-fixture/mode
rm -f /run/langame-fixture/gc-observed
rm -f /run/langame-fixture/gc-collected
apply canary
/usr/local/sbin/leetplus-langame-daily-worker-authorization-authority check --phase canary
printf success >/run/langame-fixture/mode
rm -f /run/langame-fixture/gc-observed
if /usr/local/libexec/leetplus/run-authorized-langame-daily-worker.sh; then echo 'direct API-runtime wrapper invocation was accepted' >&2; exit 1; fi
printf historical-exec-pid >/run/langame-fixture/mode
/usr/local/sbin/leetplus-langame-daily-worker-authorization-authority check --phase canary
printf live-historical-exec-pid >/run/langame-fixture/mode
if /usr/local/sbin/leetplus-langame-daily-worker-authorization-authority check --phase canary; then echo 'live/reused historical ExecMainPID was accepted' >&2; exit 1; fi
printf malformed-exec-pid >/run/langame-fixture/mode
if /usr/local/sbin/leetplus-langame-daily-worker-authorization-authority check --phase canary; then echo 'malformed historical ExecMainPID was accepted' >&2; exit 1; fi
printf pid-residue >/run/langame-fixture/mode
if /usr/local/sbin/leetplus-langame-daily-worker-authorization-authority check --phase canary; then echo 'PID residue after canary was accepted' >&2; exit 1; fi
printf deactivating >/run/langame-fixture/mode
if /usr/local/sbin/leetplus-langame-daily-worker-authorization-authority check --phase canary; then echo 'deactivating canary was accepted as quiescent' >&2; exit 1; fi
failure_receipts_before="$(find /var/lib/leetplus/langame-worker-authorizations -name 'failed-canary-*.receipt' | wc -l)"
printf failure >/run/langame-fixture/mode
if apply_bounded canary; then
  echo 'failed terminal canary was accepted' >&2; exit 1
else
  failed_rc="$?"
  [[ "$failed_rc" != 124 && "$failed_rc" != 137 ]] || { echo 'failed terminal canary did not fail immediately' >&2; exit 1; }
fi
test ! -e /var/lib/leetplus/langame-worker-authorizations/active-canary.permit
test ! -e /etc/systemd/system/leetplus-langame-daily-worker.service.d/91-leetplus-langame-worker-authorization.conf
failure_receipts_after="$(find /var/lib/leetplus/langame-worker-authorizations -name 'failed-canary-*.receipt' | wc -l)"
test "$failure_receipts_after" = "$((failure_receipts_before + 1))"
printf stale >/run/langame-fixture/mode
if apply canary; then echo 'failed canary was accepted' >&2; exit 1; fi
test ! -e /etc/systemd/system/leetplus-langame-daily-worker.service.d/91-leetplus-langame-worker-authorization.conf
test "$(cat /run/langame-fixture/timer-enabled 2>/dev/null || echo 0)" = 0
test -n "$(find /var/lib/leetplus/langame-worker-authorizations -name 'failed-canary-*.receipt' -print -quit)"
sed -i '/LANGAME_DAILY_WORKER_CANARY=/c\LANGAME_DAILY_WORKER_CANARY=false' /etc/leetplus/langame-daily-worker.env
sed -i '/LANGAME_DAILY_WORKER_DATE=/d' /etc/leetplus/langame-daily-worker.env
sed -i '/LANGAME_DAILY_WORKER_ACTIVITY_RECOVERY_ENABLED=/c\LANGAME_DAILY_WORKER_ACTIVITY_RECOVERY_ENABLED=true' /etc/leetplus/langame-daily-worker.env
sed -i '/LANGAME_DAILY_WORKER_RETENTION_ENABLED=/c\LANGAME_DAILY_WORKER_RETENTION_ENABLED=true' /etc/leetplus/langame-daily-worker.env
printf timer-fire-failure >/run/langame-fixture/mode
printf 0 >/run/langame-fixture/timer-profile-starts
if apply timer; then echo 'failed immediate timer invocation was accepted' >&2; exit 1; fi
test "$(cat /run/langame-fixture/timer-profile-starts)" = 1
test ! -e /etc/systemd/system/leetplus-langame-daily-worker.service.d/91-leetplus-langame-worker-authorization.conf
test ! -e /var/lib/leetplus/langame-worker-authorizations/active-timer.permit
test "$(cat /run/langame-fixture/timer-enabled 2>/dev/null || echo 0)" = 0
printf success >/run/langame-fixture/mode
printf 0 >/run/langame-fixture/timer-profile-starts
apply timer
test "$(cat /run/langame-fixture/timer-profile-starts)" = 1
printf historical-exec-pid >/run/langame-fixture/mode
/usr/local/sbin/leetplus-langame-daily-worker-authorization-authority check --phase timer
printf live-historical-exec-pid >/run/langame-fixture/mode
if /usr/local/libexec/leetplus/verify-langame-daily-worker-authorization.sh; then echo 'timer verifier accepted live/reused historical ExecMainPID' >&2; exit 1; fi
printf malformed-exec-pid >/run/langame-fixture/mode
if /usr/local/libexec/leetplus/verify-langame-daily-worker-authorization.sh; then echo 'timer verifier accepted malformed historical ExecMainPID' >&2; exit 1; fi
printf timer-pid-residue >/run/langame-fixture/mode
if /usr/local/libexec/leetplus/verify-langame-daily-worker-authorization.sh; then echo 'timer verifier accepted timer PID residue' >&2; exit 1; fi
printf historical-exec-pid >/run/langame-fixture/mode
printf '# tamper\n' >>/etc/systemd/system/leetplus-langame-daily-worker.timer.d/91-leetplus-langame-worker-authorization.conf
if /usr/local/sbin/leetplus-langame-daily-worker-authorization-authority check --phase timer; then echo 'tampered authorization was accepted' >&2; exit 1; fi
sed -i '$d' /etc/systemd/system/leetplus-langame-daily-worker.timer.d/91-leetplus-langame-worker-authorization.conf
revoke_plan="$(/usr/local/sbin/leetplus-langame-daily-worker-authorization-authority revoke-plan | sed -n 's/.*"planSha256":"\([0-9a-f]*\)".*/\1/p')"
/usr/local/sbin/leetplus-langame-daily-worker-authorization-authority revoke-apply --plan-sha256 "$revoke_plan" --action-count 1 --confirm I_ACCEPT_EXACT_LANGAME_DAILY_WORKER_REVOCATION
/usr/local/sbin/leetplus-langame-daily-worker-authorization-authority revoke-check
test ! -e /var/lib/leetplus/langame-worker-authorizations/active-timer.permit
test ! -e /etc/systemd/system/leetplus-langame-daily-worker.timer.d/91-leetplus-langame-worker-authorization.conf
test "$(cat /run/langame-fixture/timer-enabled 2>/dev/null || echo 0)" = 0
printf 'LANGAME_WORKER_AUTHORITY_DISPOSABLE_FIXTURE=PASS\n'
INNER
