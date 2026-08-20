#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

readonly RELEASE_SHA='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
readonly MIGRATION='20260820010000_fixture'
readonly REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly DEPLOY_ROOT="${REPOSITORY_ROOT}/docs/deployment/production-artifact"
readonly CUTOVER="${DEPLOY_ROOT}/blue-green-cutover.sh"
readonly PREFLIGHT="${DEPLOY_ROOT}/preflight-release-slot.sh"
readonly SEALER="${DEPLOY_ROOT}/seal-release-artifact.sh"
readonly CACHE_PREPARER="${DEPLOY_ROOT}/prepare-web-slot-cache.sh"
readonly SAFE_OVERLAY="${DEPLOY_ROOT}/systemd/canary-safe.env.example"
readonly TEST_ROOT="$(mktemp -d)"

cleanup() {
  rm -rf -- "$TEST_ROOT"
}
trap cleanup EXIT

if [[ "$(id -u)" == '0' ]]; then
  printf 'blue/green fixture requires an unprivileged CI account\n' >&2
  exit 1
fi

release_root="${TEST_ROOT}/releases"
slot_root="${TEST_ROOT}/slots"
config_root="${TEST_ROOT}/nginx"
state_root="${TEST_ROOT}/state"
bin_root="${TEST_ROOT}/bin"
release_directory="${release_root}/${RELEASE_SHA}"
mkdir -p \
  "$release_directory/apps/api/dist/config" \
  "$release_directory/apps/web/.next/static" \
  "$release_directory/apps/web/.next/cache" \
  "$slot_root" "$config_root/upstreams" "$state_root" "$bin_root"
printf 'api\n' > "$release_directory/apps/api/dist/main.js"
printf 'validator\n' > "$release_directory/apps/api/dist/config/validate-production-environment.cli.js"
printf '%s\n' "$RELEASE_SHA" > "$release_directory/apps/web/.next/BUILD_ID"
printf '{"releaseSha":"%s","databaseMigration":"%s","databaseMigrationCount":1}\n' \
  "$RELEASE_SHA" "$MIGRATION" > "$release_directory/release-provenance.json"
printf 'legacy\n' > "$config_root/upstreams/legacy.conf"
printf 'blue\n' > "$config_root/upstreams/blue.conf"
printf 'INVALID\n' > "$config_root/upstreams/green.conf"
ln -s "$release_directory" "$slot_root/blue"
ln -s "$config_root/upstreams/legacy.conf" "$config_root/active-upstreams.conf"

(
  cd -- "$release_directory"
  find . -type f ! -name SHA256SUMS ! -name HYDRATED_SHA256SUMS -print0 \
    | LC_ALL=C sort -z | xargs -0 sha256sum > SHA256SUMS
  find . -type f ! -name HYDRATED_SHA256SUMS -print0 \
    | LC_ALL=C sort -z | xargs -0 sha256sum > HYDRATED_SHA256SUMS
)

set -a
# shellcheck disable=SC1090
source "$SAFE_OVERLAY"
PORT=4100
WEB_PORT=3100
API_URL=http://127.0.0.1:4100
API_BIND_HOST=127.0.0.1
EXPECTED_DATABASE_MIGRATION="$MIGRATION"
EXPECTED_DATABASE_MIGRATION_COUNT=1
set +a
bash "$PREFLIGHT" \
  --slot blue \
  --release-sha "$RELEASE_SHA" \
  --web-build-id "$RELEASE_SHA" \
  --slot-root "$slot_root" \
  --release-root "$release_root" \
  --unprivileged-test-mode > "$TEST_ROOT/preflight.out"
grep -F -x "RELEASE_SLOT_PREFLIGHT_ACCEPTED_SHA=${RELEASE_SHA}" "$TEST_ROOT/preflight.out" >/dev/null
if FOUNDER_OPERATOR_BETA_MODE=ACTIVE bash "$PREFLIGHT" \
  --slot blue \
  --release-sha "$RELEASE_SHA" \
  --web-build-id "$RELEASE_SHA" \
  --slot-root "$slot_root" \
  --release-root "$release_root" \
  --unprivileged-test-mode > "$TEST_ROOT/unsafe-overlay-rejected.out" 2>&1; then
  printf 'unsafe shadow environment was unexpectedly accepted\n' >&2
  exit 1
fi

if EXPECTED_DATABASE_MIGRATION_COUNT=2 bash "$PREFLIGHT" \
  --slot blue \
  --release-sha "$RELEASE_SHA" \
  --web-build-id "$RELEASE_SHA" \
  --slot-root "$slot_root" \
  --release-root "$release_root" \
  --unprivileged-test-mode > "$TEST_ROOT/provenance-mismatch-rejected.out" 2>&1; then
  printf 'mismatched slot migration provenance was unexpectedly accepted\n' >&2
  exit 1
fi
service_user="$(id -un)"
bash "$SEALER" \
  --release-sha "$RELEASE_SHA" \
  --release-root "$release_root" \
  --service-user "$service_user" \
  --dry-run > "$TEST_ROOT/seal.out"
grep -F -x "RELEASE_SEAL_DRY_RUN_SHA=${RELEASE_SHA}" "$TEST_ROOT/seal.out" >/dev/null
ln "$release_directory/apps/api/dist/main.js" "$release_directory/apps/api/dist/shared-main.js"
if bash "$SEALER" \
  --release-sha "$RELEASE_SHA" \
  --release-root "$release_root" \
  --service-user "$service_user" \
  --dry-run > "$TEST_ROOT/hardlink-rejected.out" 2>&1; then
  printf 'multiply-linked release file was unexpectedly accepted\n' >&2
  exit 1
fi
rm -- "$release_directory/apps/api/dist/shared-main.js"

cache_marker_fixture="$TEST_ROOT/cache-markers"
mkdir -p "$cache_marker_fixture"
printf '%s\n' "$RELEASE_SHA" > "$cache_marker_fixture/blue.sha"
env -i PATH="$PATH" bash -c '
  set -a
  source "$1"
  PORT=4100
  WEB_PORT=3100
  API_URL=http://127.0.0.1:4100
  API_BIND_HOST=127.0.0.1
  EXPECTED_DATABASE_MIGRATION="$2"
  EXPECTED_DATABASE_MIGRATION_COUNT=1
  NODE_ENV=production
  set +a
  exec bash "$3" \
    --slot blue --release-sha "$4" --web-build-id "$4" \
    --slot-root "$5" --release-root "$6" --cache-marker-root "$7" \
    --web-runtime --require-web-cache-bind --unprivileged-test-mode
' fixture "$SAFE_OVERLAY" "$MIGRATION" "$PREFLIGHT" "$RELEASE_SHA" "$slot_root" "$release_root" "$cache_marker_fixture" \
  > "$TEST_ROOT/web-preflight.out"
grep -F -x 'RELEASE_SLOT_PREFLIGHT_WEB_RUNTIME=true' "$TEST_ROOT/web-preflight.out" >/dev/null

cat > "$bin_root/systemctl" <<'SYSTEMCTL'
#!/usr/bin/env bash
set -euo pipefail
printf 'systemctl %s\n' "$*" >> "${TEST_COMMAND_LOG:?}"
case "${1:-}" in
  is-active) exit 0 ;;
  is-enabled) exit 0 ;;
  reload) exit 0 ;;
  show) printf '%s\n' "${TEST_WEB_STATE:-inactive}"; exit 0 ;;
  *) exit 70 ;;
esac
SYSTEMCTL

cat > "$bin_root/nginx" <<'NGINX'
#!/usr/bin/env bash
set -euo pipefail
printf 'nginx %s\n' "$*" >> "${TEST_COMMAND_LOG:?}"
active_target="$(realpath -e -- "${TEST_ACTIVE_LINK:?}")"
if grep -F 'INVALID' "$active_target" >/dev/null; then
  exit 71
fi
NGINX

cat > "$bin_root/curl" <<'CURL'
#!/usr/bin/env bash
set -euo pipefail
printf 'curl %s\n' "$*" >> "${TEST_COMMAND_LOG:?}"
url="${!#}"
if [[ "${TEST_FAIL_ROLLBACK_SMOKE:-false}" == true && "$url" == https://* ]]; then
  exit 74
fi
if [[ "${TEST_FAIL_PREVIOUS:-false}" == true \
  && ( "$url" == 'http://127.0.0.1:4000/health' || "$url" == 'http://127.0.0.1:3000/' ) ]]; then
  printf '503'
else
  printf '200'
fi
CURL

cat > "$TEST_ROOT/probe" <<'PROBE'
#!/usr/bin/env bash
set -euo pipefail
printf 'probe %s\n' "$*" >> "${TEST_COMMAND_LOG:?}"
if [[ "${TEST_FAIL_PUBLIC:-false}" == true && "$*" == *'https://'* ]]; then
  exit 72
fi
PROBE
chmod 0700 "$bin_root/systemctl" "$bin_root/nginx" "$bin_root/curl" "$TEST_ROOT/probe"

cache_test_root="$TEST_ROOT/cache"
cache_marker_test_root="$TEST_ROOT/cache-authority"
mkdir -p "$cache_test_root" "$cache_marker_test_root"
if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$TEST_ROOT/cache-commands.log" TEST_WEB_STATE=active \
  bash "$CACHE_PREPARER" --slot blue --release-sha "$RELEASE_SHA" \
    --cache-root "$cache_test_root" --marker-root "$cache_marker_test_root" --service-user "$(id -un)" --unprivileged-test-mode \
    > "$TEST_ROOT/cache-active-rejected.out" 2>&1; then
  printf 'cache reset while Web slot was active was unexpectedly accepted\n' >&2
  exit 1
fi
PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$TEST_ROOT/cache-commands.log" \
  bash "$CACHE_PREPARER" --slot blue --release-sha "$RELEASE_SHA" \
    --cache-root "$cache_test_root" --marker-root "$cache_marker_test_root" --service-user "$(id -un)" --unprivileged-test-mode \
    > "$TEST_ROOT/cache-prepared.out"
test "$(tr -d '\r\n' < "$cache_marker_test_root/blue.sha")" = "$RELEASE_SHA"
printf 'stale\n' > "$cache_test_root/leetplus-web-blue/stale-entry"
replacement_sha="$(printf 'b%.0s' {1..40})"
PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$TEST_ROOT/cache-commands.log" \
  bash "$CACHE_PREPARER" --slot blue --release-sha "$replacement_sha" \
    --cache-root "$cache_test_root" --marker-root "$cache_marker_test_root" --service-user "$(id -un)" --unprivileged-test-mode \
    > "$TEST_ROOT/cache-replaced.out"
test "$(tr -d '\r\n' < "$cache_marker_test_root/blue.sha")" = "$replacement_sha"
test -n "$(find "$cache_test_root/leetplus-web-retired" -mindepth 1 -maxdepth 1 -type d -print -quit)"

common_arguments=(
  --release-sha "$RELEASE_SHA"
  --expected-migration "$MIGRATION"
  --expected-migration-count 1
  --expected-web-build-id "$RELEASE_SHA"
  --loopback-api-url http://127.0.0.1:4100
  --loopback-web-url http://127.0.0.1:3100
  --public-api-url https://api.example.test
  --public-web-url https://web.example.test
  --watchdog-seconds 5
  --config-root "$config_root"
  --state-root "$state_root"
  --probe "$TEST_ROOT/probe"
  --unprivileged-test-mode
)

command_log="$TEST_ROOT/commands.log"
# A dead N-1 is rejected while the active link still points to legacy. The
# candidate is never made externally routable when rollback itself is unsafe.
if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" TEST_FAIL_PREVIOUS=true \
  bash "$CUTOVER" switch --slot blue "${common_arguments[@]}" > "$TEST_ROOT/dead-previous-rejected.out" 2>&1; then
  printf 'switch with a dead previous runtime was unexpectedly accepted\n' >&2
  exit 1
fi
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/legacy.conf"
test -z "$(find "$state_root" -maxdepth 1 -type f \( -name '*.intent' -o -name '*.receipt' \) -print -quit)"

PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  bash "$CUTOVER" switch --slot blue "${common_arguments[@]}" > "$TEST_ROOT/switch.out"
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/blue.conf"
receipt="$(find "$state_root" -maxdepth 1 -type f -name '*.receipt' -print -quit)"
test -n "$receipt"
grep -F -x 'BLUE_GREEN_OLD_PROCESSES_STOPPED=false' "$TEST_ROOT/switch.out" >/dev/null
test "$(grep -c 'https://api.example.test' "$command_log")" -ge 3
if grep -E 'systemctl (stop|restart|disable)' "$command_log" >/dev/null; then
  printf 'cutover attempted to stop or restart a process\n' >&2
  exit 1
fi

PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  bash "$CUTOVER" rollback --receipt "$receipt" \
    --config-root "$config_root" --state-root "$state_root" --probe "$TEST_ROOT/probe" \
    --unprivileged-test-mode > "$TEST_ROOT/rollback.out"
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/legacy.conf"
grep -F -x 'BLUE_GREEN_ROLLBACK_SERVING_CONFIRMED=true' "$TEST_ROOT/rollback.out" >/dev/null

# Replaying the accepted receipt after the link has already been restored must
# still validate and reload nginx. This closes the crash-after-link/before-
# reload recovery gap: disk state alone is never treated as loaded state.
reloads_before_retry="$(grep -c 'systemctl reload nginx.service' "$command_log")"
PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  bash "$CUTOVER" rollback --receipt "$receipt" \
    --config-root "$config_root" --state-root "$state_root" --probe "$TEST_ROOT/probe" \
    --unprivileged-test-mode > "$TEST_ROOT/idempotent-rollback.out"
reloads_after_retry="$(grep -c 'systemctl reload nginx.service' "$command_log")"
test "$reloads_after_retry" -eq "$((reloads_before_retry + 1))"

# A handled interruption immediately after the atomic link effect is guarded
# by an EXIT rollback. The durable intent is archived only after exact N-1 is
# restored and publicly confirmed.
if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  LEETPLUS_TEST_ABORT_AFTER_LINK=true \
  bash "$CUTOVER" switch --slot blue "${common_arguments[@]}" > "$TEST_ROOT/exit-guard.out" 2>&1; then
  printf 'fixture-requested post-link interruption was unexpectedly accepted\n' >&2
  exit 1
fi
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/legacy.conf"
test -n "$(find "$state_root" -maxdepth 1 -type f -name '*.recovered' -print -quit)"
test -z "$(find "$state_root" -maxdepth 1 -type f -name '*.intent' -print -quit)"

# A failure after mv but before directory fsync leaves the candidate link on
# disk. The EXIT guard must observe the explicit atomic_link failure, restore
# N-1, and must never report an accepted switch.
rm -f "$state_root/.fixture-after-link-mv-fired"
if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  LEETPLUS_TEST_FAIL_PHASE=after-link-mv \
  bash "$CUTOVER" switch --slot blue "${common_arguments[@]}" > "$TEST_ROOT/link-mv-fault.out" 2>&1; then
  printf 'post-link durability fault was unexpectedly accepted\n' >&2
  exit 1
fi
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/legacy.conf"
test -z "$(find "$state_root" -maxdepth 1 -type f -name '*.intent' -print -quit)"

# Intent archival failure is not success. The exact previous link remains
# restored, the outstanding intent stays durable, and recover-pending can
# finish it idempotently on the next watchdog invocation.
rm -f "$state_root/.fixture-before-archive-mv-fired"
if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  LEETPLUS_TEST_ABORT_AFTER_LINK=true LEETPLUS_TEST_FAIL_PHASE=before-archive-mv \
  bash "$CUTOVER" switch --slot blue "${common_arguments[@]}" > "$TEST_ROOT/archive-fault.out" 2>&1; then
  printf 'intent archival fault was unexpectedly accepted\n' >&2
  exit 1
fi
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/legacy.conf"
test -n "$(find "$state_root" -maxdepth 1 -type f -name '*.intent' -print -quit)"
PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  bash "$CUTOVER" recover-pending \
    --config-root "$config_root" --state-root "$state_root" --probe "$TEST_ROOT/probe" \
    --unprivileged-test-mode > "$TEST_ROOT/archive-fault-recovered.out"
test -z "$(find "$state_root" -maxdepth 1 -type f -name '*.intent' -print -quit)"

# A crash-recovery intent (written before the link effect) is independently
# sufficient to restore the exact previous target.
intent="$state_root/crash-recovery.intent"
{
  printf 'RECORD_VERSION=2\n'
  printf 'RELEASE_SHA=%s\n' "$RELEASE_SHA"
  printf 'SLOT=blue\n'
  printf 'PREVIOUS_TARGET=%s\n' "$config_root/upstreams/legacy.conf"
  printf 'PREVIOUS_SHA256=%s\n' "$(sha256sum "$config_root/upstreams/legacy.conf" | awk '{ print $1 }')"
  printf 'PREVIOUS_RUNTIME_KIND=LEGACY\n'
  printf 'PREVIOUS_SLOT=legacy\n'
  printf 'PREVIOUS_API_UNIT=leetplus-api.service\n'
  printf 'PREVIOUS_WEB_UNIT=leetplus-web.service\n'
  printf 'PREVIOUS_API_URL=http://127.0.0.1:4000\n'
  printf 'PREVIOUS_WEB_URL=http://127.0.0.1:3000\n'
  printf 'PREVIOUS_RELEASE_SHA=LEGACY_UNVERSIONED\n'
  printf 'PREVIOUS_MIGRATION=LEGACY_UNVERSIONED\n'
  printf 'PREVIOUS_MIGRATION_COUNT=0\n'
  printf 'PREVIOUS_WEB_BUILD_ID=LEGACY_UNVERSIONED\n'
  printf 'ACTIVATED_TARGET=%s\n' "$config_root/upstreams/blue.conf"
  printf 'ACTIVATED_SHA256=%s\n' "$(sha256sum "$config_root/upstreams/blue.conf" | awk '{ print $1 }')"
  printf 'INTENT_RECORDED_AT=fixture\n'
} > "$intent"
chmod 0600 "$intent"
ln -s "$config_root/upstreams/blue.conf" "$config_root/active-upstreams.conf.next"
mv -Tf "$config_root/active-upstreams.conf.next" "$config_root/active-upstreams.conf"
PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  bash "$CUTOVER" recover-pending \
    --config-root "$config_root" --state-root "$state_root" --probe "$TEST_ROOT/probe" \
    --unprivileged-test-mode > "$TEST_ROOT/intent-rollback.out"
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/legacy.conf"
recovered_intent="${intent%.intent}.recovered"
test -f "$recovered_intent"

# Loss of external visibility is fail-closed, but only after the exact previous
# link has been restored and gracefully reloaded.
intent="$state_root/rollback-smoke.intent"
cp "$recovered_intent" "$intent"
chmod 0600 "$intent"
ln -s "$config_root/upstreams/blue.conf" "$config_root/active-upstreams.conf.next"
mv -Tf "$config_root/active-upstreams.conf.next" "$config_root/active-upstreams.conf"
if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" TEST_FAIL_ROLLBACK_SMOKE=true \
  bash "$CUTOVER" rollback --receipt "$intent" \
    --config-root "$config_root" --state-root "$state_root" --probe "$TEST_ROOT/probe" \
    --unprivileged-test-mode > "$TEST_ROOT/rollback-smoke-rejected.out" 2>&1; then
  printf 'rollback without public serving evidence was unexpectedly accepted\n' >&2
  exit 1
fi
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/legacy.conf"
grep -F -x 'BLUE_GREEN_ROLLBACK_SERVING_CONFIRMED=false' "$TEST_ROOT/rollback-smoke-rejected.out" >/dev/null
mv "$intent" "${intent%.intent}.rollback-evidence-unconfirmed"

# Receipt targets outside config_root/upstreams are rejected even when their
# files and digests are otherwise valid.
outside_target="$TEST_ROOT/outside.conf"
printf 'outside\n' > "$outside_target"
unsafe_intent="$state_root/unsafe-target.intent"
{
  printf 'RECORD_VERSION=2\n'
  printf 'RELEASE_SHA=%s\n' "$RELEASE_SHA"
  printf 'SLOT=blue\n'
  printf 'PREVIOUS_TARGET=%s\n' "$outside_target"
  printf 'PREVIOUS_SHA256=%s\n' "$(sha256sum "$outside_target" | awk '{ print $1 }')"
  printf 'PREVIOUS_RUNTIME_KIND=LEGACY\n'
  printf 'PREVIOUS_SLOT=legacy\n'
  printf 'PREVIOUS_API_UNIT=leetplus-api.service\n'
  printf 'PREVIOUS_WEB_UNIT=leetplus-web.service\n'
  printf 'PREVIOUS_API_URL=http://127.0.0.1:4000\n'
  printf 'PREVIOUS_WEB_URL=http://127.0.0.1:3000\n'
  printf 'PREVIOUS_RELEASE_SHA=LEGACY_UNVERSIONED\n'
  printf 'PREVIOUS_MIGRATION=LEGACY_UNVERSIONED\n'
  printf 'PREVIOUS_MIGRATION_COUNT=0\n'
  printf 'PREVIOUS_WEB_BUILD_ID=LEGACY_UNVERSIONED\n'
  printf 'ACTIVATED_TARGET=%s\n' "$config_root/upstreams/blue.conf"
  printf 'ACTIVATED_SHA256=%s\n' "$(sha256sum "$config_root/upstreams/blue.conf" | awk '{ print $1 }')"
  printf 'INTENT_RECORDED_AT=fixture\n'
} > "$unsafe_intent"
chmod 0600 "$unsafe_intent"
ln -s "$config_root/upstreams/blue.conf" "$config_root/active-upstreams.conf.next"
mv -Tf "$config_root/active-upstreams.conf.next" "$config_root/active-upstreams.conf"
if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  bash "$CUTOVER" rollback --receipt "$unsafe_intent" \
    --config-root "$config_root" --state-root "$state_root" --probe "$TEST_ROOT/probe" \
    --unprivileged-test-mode > "$TEST_ROOT/unsafe-target-rejected.out" 2>&1; then
  printf 'rollback accepted an upstream target outside the reviewed root\n' >&2
  exit 1
fi
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/blue.conf"
ln -s "$config_root/upstreams/legacy.conf" "$config_root/active-upstreams.conf.next"
mv -Tf "$config_root/active-upstreams.conf.next" "$config_root/active-upstreams.conf"
mv "$unsafe_intent" "${unsafe_intent%.intent}.rejected"

# A broken nginx slot must never replace the legacy target.
if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  bash "$CUTOVER" switch --slot green "${common_arguments[@]}" > "$TEST_ROOT/nginx-rejected.out" 2>&1; then
  printf 'invalid nginx candidate was unexpectedly accepted\n' >&2
  exit 1
fi
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/legacy.conf"
test -n "$(find "$state_root" -maxdepth 1 -type f -name "*-${RELEASE_SHA}-green.recovered" -print -quit)"

# A public watchdog failure after reload must gracefully restore legacy.
printf 'blue\n' > "$config_root/upstreams/green.conf"
if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" TEST_FAIL_PUBLIC=true \
  bash "$CUTOVER" switch --slot green "${common_arguments[@]}" > "$TEST_ROOT/watchdog-rejected.out" 2>&1; then
  printf 'failed public watchdog was unexpectedly accepted\n' >&2
  exit 1
fi
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/legacy.conf"

grep -F "PATH='/usr/sbin:/usr/bin:/sbin:/bin'" "$CUTOVER" >/dev/null
grep -F "public API URL must be pinned to https://api.leetplus.ru" "$CUTOVER" >/dev/null
grep -F 'sync -f "$intent_path"' "$CUTOVER" >/dev/null
grep -F 'candidate full nginx configuration failed private-namespace validation' "$CUTOVER" >/dev/null
grep -F 'cutover_exit_guard' "$CUTOVER" >/dev/null
grep -F 'recover-pending' "$CUTOVER" >/dev/null
grep -F "state root mode must be 0700" "$CUTOVER" >/dev/null
grep -F "outside the reviewed upstream root" "$CUTOVER" >/dev/null
grep -F "production release root must be an exact reviewed release/promotions root" "$SEALER" >/dev/null
grep -F "production slot root cannot be overridden" "$PREFLIGHT" >/dev/null
if grep -E 'systemctl (stop|restart|disable)' "$command_log" >/dev/null; then
  printf 'blue/green lifecycle attempted to stop or restart an old process\n' >&2
  exit 1
fi

printf 'production artifact blue/green test: PASS\n'
