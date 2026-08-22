#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'
umask 0077

readonly REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly PREPARER="${REPOSITORY_ROOT}/docs/deployment/production-artifact/prepare-web-slot-cache.sh"
readonly RELEASE_SHA='1111111111111111111111111111111111111111'
readonly TEST_ROOT="$(mktemp -d)"
lock_holder_pid=''

if ! command -v flock >/dev/null 2>&1; then
  printf 'PREPARE_WEB_SLOT_CACHE_FIXTURE_SKIPPED_NO_FLOCK=true\n'
  rm -rf -- "$TEST_ROOT"
  exit 0
fi

cleanup() {
  if [[ -n "$lock_holder_pid" ]]; then
    touch "$TEST_ROOT/release-lock" 2>/dev/null || true
    wait "$lock_holder_pid" 2>/dev/null || true
  fi
  rm -rf -- "$TEST_ROOT"
}
trap cleanup EXIT

mkdir -p "$TEST_ROOT/bin"
cat > "$TEST_ROOT/bin/systemctl" <<'SYSTEMCTL'
#!/usr/bin/env bash
set -euo pipefail
[[ "${1:-}" == show && "${2:-}" == --no-pager \
  && "${3:-}" == 'leetplus-web@blue.service' ]] || exit 64
count=0
[[ ! -f "${TEST_SYSTEMCTL_COUNT:?}" ]] || count="$(<"$TEST_SYSTEMCTL_COUNT")"
count=$((count + 1))
printf '%s\n' "$count" > "$TEST_SYSTEMCTL_COUNT"
if [[ "${TEST_RACE_AT:-0}" == "$count" ]]; then
  printf '%s\n' \
    'ActiveState=active' 'SubState=running' 'MainPID=99999' \
    'ControlGroup=/system.slice/leetplus-web@blue.service' \
    'UnitFileState=enabled' 'NeedDaemonReload=no'
else
  printf '%s\n' \
    'ActiveState=inactive' 'SubState=dead' 'MainPID=0' \
    'ControlGroup=/system.slice/leetplus-web@blue.service' \
    'UnitFileState=enabled' 'NeedDaemonReload=no'
fi
SYSTEMCTL
chmod 0700 "$TEST_ROOT/bin/systemctl"

prepare_fixture() {
  local root="$1"
  mkdir -p \
    "$root/cache" "$root/markers" "$root/state" \
    "$root/cgroup/system.slice/leetplus-web@blue.service"
  : > "$root/cgroup/system.slice/leetplus-web@blue.service/cgroup.procs"
  : > "$root/systemctl.count"
}

run_preparer() {
  local root="$1"
  shift
  PATH="$TEST_ROOT/bin:$PATH" TEST_SYSTEMCTL_COUNT="$root/systemctl.count" "$@" \
    /usr/bin/bash -p "$PREPARER" \
      --slot blue --release-sha "$RELEASE_SHA" \
      --cache-root "$root/cache" --marker-root "$root/markers" \
      --cutover-state-root "$root/state" --cgroup-root "$root/cgroup" \
      --service-user fixture-web --unprivileged-test-mode
}

valid_root="$TEST_ROOT/valid"
prepare_fixture "$valid_root"
run_preparer "$valid_root" env > "$valid_root/out"
grep -F -x 'WEB_CACHE_PREPARED_SLOT=blue' "$valid_root/out" >/dev/null
test "$(tr -d '\r\n' < "$valid_root/markers/blue.sha")" = "$RELEASE_SHA"
test -d "$valid_root/cache/leetplus-web-blue"
run_preparer "$valid_root" env > "$valid_root/retry.out"
grep -F -x 'WEB_CACHE_ALREADY_PREPARED_SLOT=blue' "$valid_root/retry.out" >/dev/null

race_root="$TEST_ROOT/race"
prepare_fixture "$race_root"
if run_preparer "$race_root" env TEST_RACE_AT=3 > "$race_root/out" 2>&1; then
  printf 'cache preparer accepted a concurrent Web unit start\n' >&2
  exit 1
fi
grep -F 'Web slot must be stopped with no MainPID' "$race_root/out" >/dev/null
test ! -e "$race_root/markers/blue.sha"

for identity_drift in TEST_CACHE_FOREIGN_UID_PROCESS TEST_CACHE_NSS_DRIFT; do
  identity_root="$TEST_ROOT/${identity_drift}"
  prepare_fixture "$identity_root"
  if run_preparer "$identity_root" env "${identity_drift}=true" > "$identity_root/out" 2>&1; then
    printf 'cache preparer accepted identity drift: %s\n' "$identity_drift" >&2
    exit 1
  fi
  test ! -e "$identity_root/markers/blue.sha"
done

symlink_quarantine_root="$TEST_ROOT/quarantine-symlink"
prepare_fixture "$symlink_quarantine_root"
mkdir -p "$symlink_quarantine_root/outside"
ln -s "$symlink_quarantine_root/outside" "$symlink_quarantine_root/cache/leetplus-web-retired"
if run_preparer "$symlink_quarantine_root" env > "$symlink_quarantine_root/out" 2>&1; then
  printf 'cache preparer accepted a symlinked quarantine root\n' >&2
  exit 1
fi
grep -F 'cache quarantine root is not a canonical real directory' "$symlink_quarantine_root/out" >/dev/null
test -z "$(find "$symlink_quarantine_root/outside" -mindepth 1 -print -quit)"

mounted_quarantine_root="$TEST_ROOT/quarantine-mount"
prepare_fixture "$mounted_quarantine_root"
printf '%s\n' "$mounted_quarantine_root/cache/leetplus-web-retired/nested" \
  > "$mounted_quarantine_root/mounts"
if run_preparer "$mounted_quarantine_root" env \
  TEST_CACHE_MOUNT_INVENTORY_FILE="$mounted_quarantine_root/mounts" \
  > "$mounted_quarantine_root/out" 2>&1; then
  printf 'cache preparer accepted a nested quarantine mount\n' >&2
  exit 1
fi
grep -F 'cache authority contains an exact/nested mount' "$mounted_quarantine_root/out" >/dev/null

for lock_attack in symlink hardlink; do
  unsafe_lock_root="$TEST_ROOT/lock-${lock_attack}"
  prepare_fixture "$unsafe_lock_root"
  printf 'sentinel\n' > "$unsafe_lock_root/lock-target"
  chmod 0600 "$unsafe_lock_root/lock-target"
  if [[ "$lock_attack" == symlink ]]; then
    ln -s "$unsafe_lock_root/lock-target" "$unsafe_lock_root/state/cutover.lock"
  else
    ln "$unsafe_lock_root/lock-target" "$unsafe_lock_root/state/cutover.lock"
  fi
  if run_preparer "$unsafe_lock_root" env > "$unsafe_lock_root/out" 2>&1; then
    printf 'cache preparer accepted a %sed shared lock\n' "$lock_attack" >&2
    exit 1
  fi
  test "$(<"$unsafe_lock_root/lock-target")" = sentinel
done

lock_root="$TEST_ROOT/lock"
prepare_fixture "$lock_root"
(
  exec 9>> "$lock_root/state/cutover.lock"
  flock -x 9
  touch "$TEST_ROOT/lock-held"
  while [[ ! -e "$TEST_ROOT/release-lock" ]]; do sleep 0.05; done
) &
lock_holder_pid=$!
for _ in {1..100}; do
  [[ -e "$TEST_ROOT/lock-held" ]] && break
  sleep 0.05
done
test -e "$TEST_ROOT/lock-held"
if run_preparer "$lock_root" env > "$lock_root/out" 2>&1; then
  printf 'cache preparer did not share the deployment cutover lock\n' >&2
  exit 1
fi
grep -F 'another blue/green/cache operation holds the deployment lock' "$lock_root/out" >/dev/null
touch "$TEST_ROOT/release-lock"
wait "$lock_holder_pid"
lock_holder_pid=''

printf 'prepare Web slot cache fixture: PASS\n'
