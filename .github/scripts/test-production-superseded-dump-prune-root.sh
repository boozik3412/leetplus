#!/usr/bin/bash -p
# Behavioral contract test for the exact three-file CURRENT191 retirement
# authority. Every effect is confined to a separately validated /tmp fixture.

[[ $- == *p* ]] || {
  printf 'current191 retirement fixture: Bash privileged mode is required\n' >&2
  exit 1
}

[[ ${EUID:-99999} -eq 0 ]] || {
  printf 'current191 retirement fixture: root is required\n' >&2
  exit 1
}
[[ "${CI:-}" == true && "${GITHUB_ACTIONS:-}" == true \
  && "${CURRENT191_RETIREMENT_TEST_CONFIRM:-}" == 'run-current191-retirement-root-fixture' ]] || {
  printf 'current191 retirement fixture: exact CI acknowledgement is required\n' >&2
  exit 1
}

set -Eeuo pipefail
IFS=$'\n\t'
umask 0077

readonly RELEASE_SHA='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
readonly SUCCESSOR_RELEASE_SHA='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
readonly CONFIRMATION='I_ACCEPT_RETIRE_THREE_SUPERSEDED_DUMPS_FOR_CURRENT191'
readonly DEF5174_CONFIRMATION='I_ACCEPT_RETIRE_EXACT_DEF5174_DUMP_FOR_CURRENT191'
readonly FIXTURE_CONFIRMATION='run-bounded-root-current191-retirement-fixture'
readonly REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly AUTHORITY="${REPOSITORY_ROOT}/docs/deployment/production-artifact/prune-three-superseded-dumps.sh"
readonly SOURCE_DATABASE_STATE='190|20260908090000_initial_owner_invite_link_mode|0|0'

declare -a fixture_roots=()
new_fixture_root=''

die() {
  printf 'current191 retirement fixture: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  local root resolved
  for root in "${fixture_roots[@]}"; do
    [[ -d "$root" && ! -L "$root" ]] || continue
    resolved="$(realpath -e -- "$root")"
    [[ "$resolved" == "$root" \
      && "$resolved" =~ ^/tmp/leetplus-superseded-dump-prune-test\.[A-Za-z0-9_-]+$ ]] \
      || { printf 'current191 retirement fixture: refusing unsafe cleanup target: %s\n' "$root" >&2; continue; }
    rm -rf -- "$resolved"
  done
}
trap cleanup EXIT

for required_command in awk chmod cmp dirname env find grep install ln mktemp realpath rm sha256sum stat unlink; do
  command -v "$required_command" >/dev/null 2>&1 \
    || die "missing fixture command: ${required_command}"
done
[[ -f "$AUTHORITY" && ! -L "$AUTHORITY" ]] || die 'retirement authority source is absent'

setup_fixture() {
  local root operation_root postgres_device
  root="$(mktemp -d '/tmp/leetplus-superseded-dump-prune-test.XXXXXX')"
  fixture_roots+=("$root")
  [[ "$(realpath -e -- "$root")" == "$root" \
    && "$(stat -c '%u:%g:%a' -- "$root")" == '0:0:700' ]] \
    || die 'new fixture root identity is invalid'

  install -d -o root -g root -m 0700 \
    "$root/run/leetplus-production-control" \
    "$root/etc/systemd/system.control" \
    "$root/run/systemd/system.control" \
    "$root/run/systemd/transient" \
    "$root/run/systemd/generator.early" \
    "$root/etc/systemd/system" \
    "$root/etc/systemd/system.attached" \
    "$root/run/systemd/system" \
    "$root/run/systemd/system.attached" \
    "$root/run/systemd/generator" \
    "$root/usr/local/lib/systemd/system" \
    "$root/usr/lib/systemd/system" \
    "$root/run/systemd/generator.late" \
    "$root/var/lib/leetplus/deploy-receipts" \
    "$root/var/lib/leetplus/deploy-receipts/release-orchestrator" \
    "$root/var/lib/leetplus/recovery-evidence" \
    "$root/var/lib/leetplus/operator-handoff" \
    "$root/var/lib/postgresql/current191-d5d9b60c-9b2434aa" \
    "$root/var/lib/postgresql/pre-current191-fa21bbe-20260909T102434Z" \
    "$root/var/lib/postgresql/pre-current191-a05d2a50-20260910T022100Z" \
    "$root/var/lib/leetplus/backups/pre-rollout-def5174f-20260908t130000z" \
    "$root/srv/leetplus/release-preparation/54babfaf-b97181ea" \
    "$root/srv/leetplus/recovery-backups"
  operation_root="$root/var/lib/leetplus/deploy-receipts/release-orchestrator/11111111-1111-4111-8111-111111111111"
  install -d -o root -g root -m 0700 "$operation_root"

  printf '%s\n' "$RELEASE_SHA" > "$root/control.release"
  printf '%s\n' "$SOURCE_DATABASE_STATE" > "$root/database.state"
  printf '{}\n' > "$operation_root/final.json"
  printf 'fixture-lock\n' > "$root/run/leetplus-production-control/install.lock"
  printf 'orchestrator-lock\n' > "$root/var/lib/leetplus/deploy-receipts/release-orchestrator/orchestrator.lock"
  printf 'old-current191\n' > "$root/var/lib/postgresql/current191-d5d9b60c-9b2434aa/leetplus.dump"
  printf 'old-preparation\n' > "$root/srv/leetplus/release-preparation/54babfaf-b97181ea/database.dump"
  printf 'old-recovery\n' > "$root/srv/leetplus/recovery-backups/leetplus-before-langame-recovery-20260827T1600Z.dump"
  printf 'fresh-current191\n' > "$root/var/lib/postgresql/pre-current191-fa21bbe-20260909T102434Z/leetplus.dump"
  printf 'fresh-globals\n' > "$root/var/lib/postgresql/pre-current191-fa21bbe-20260909T102434Z/globals.sql"
  printf 'new-current191\n' > "$root/var/lib/postgresql/pre-current191-a05d2a50-20260910T022100Z/leetplus.dump"
  printf 'new-globals\n' > "$root/var/lib/postgresql/pre-current191-a05d2a50-20260910T022100Z/globals.sql"
  printf 'superseded-def5174\n' > "$root/var/lib/leetplus/backups/pre-rollout-def5174f-20260908t130000z/leetplus.dump"
  printf 'retained-manifest\n' > "$root/var/lib/leetplus/backups/pre-rollout-def5174f-20260908t130000z/manifest.json"
  postgres_device="$(stat -c '%d' -- "$root/var/lib/postgresql")"
  printf 'DATABASE_BYTES=100\nAVAILABLE_BYTES=3000000000\nPOSTGRES_DEVICE=%s\n' \
    "$postgres_device" > "$root/def5174-capacity.state"

  chmod 0400 "$root/control.release" "$root/database.state" "$root/def5174-capacity.state" \
    "$operation_root/final.json"
  chmod 0600 "$root/run/leetplus-production-control/install.lock" \
    "$root/var/lib/leetplus/deploy-receipts/release-orchestrator/orchestrator.lock" \
    "$root/var/lib/postgresql/current191-d5d9b60c-9b2434aa/leetplus.dump" \
    "$root/var/lib/postgresql/pre-current191-fa21bbe-20260909T102434Z/leetplus.dump" \
    "$root/var/lib/postgresql/pre-current191-fa21bbe-20260909T102434Z/globals.sql" \
    "$root/var/lib/postgresql/pre-current191-a05d2a50-20260910T022100Z/leetplus.dump" \
    "$root/var/lib/postgresql/pre-current191-a05d2a50-20260910T022100Z/globals.sql"
  chmod 0400 "$root/srv/leetplus/release-preparation/54babfaf-b97181ea/database.dump"
  chmod 0400 \
    "$root/var/lib/leetplus/backups/pre-rollout-def5174f-20260908t130000z/leetplus.dump" \
    "$root/var/lib/leetplus/backups/pre-rollout-def5174f-20260908t130000z/manifest.json"
  chmod 0664 "$root/srv/leetplus/recovery-backups/leetplus-before-langame-recovery-20260827T1600Z.dump"
  new_fixture_root="$root"
}

invoke() {
  local root="$1"
  shift
  /usr/bin/env -i \
    CI=true \
    GITHUB_ACTIONS=true \
    LEETPLUS_SUPERSEDED_DUMP_PRUNE_FIXTURE_CONFIRM="$FIXTURE_CONFIRMATION" \
    PATH=/usr/sbin:/usr/bin:/sbin:/bin \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    TZ=UTC \
    /usr/bin/bash -p "$AUTHORITY" "$@" --fixture-root "$root"
}

invoke_abort_after_first_unlink() {
  local root="$1"
  shift
  /usr/bin/env -i \
    CI=true \
    GITHUB_ACTIONS=true \
    LEETPLUS_SUPERSEDED_DUMP_PRUNE_FIXTURE_CONFIRM="$FIXTURE_CONFIRMATION" \
    LEETPLUS_SUPERSEDED_DUMP_PRUNE_FIXTURE_ABORT_AFTER_FIRST_UNLINK=1 \
    PATH=/usr/sbin:/usr/bin:/sbin:/bin \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    TZ=UTC \
    /usr/bin/bash -p "$AUTHORITY" "$@" --fixture-root "$root"
}

target_one() { printf '%s/var/lib/postgresql/current191-d5d9b60c-9b2434aa/leetplus.dump' "$1"; }
target_two() { printf '%s/srv/leetplus/release-preparation/54babfaf-b97181ea/database.dump' "$1"; }
target_three() { printf '%s/srv/leetplus/recovery-backups/leetplus-before-langame-recovery-20260827T1600Z.dump' "$1"; }
preserved_dump() { printf '%s/var/lib/postgresql/pre-current191-fa21bbe-20260909T102434Z/leetplus.dump' "$1"; }
state_root() { printf '%s/var/lib/leetplus/deploy-receipts/superseded-dump-retirement/current191-capacity-retirement-20260910' "$1"; }
def5174_target() { printf '%s/var/lib/leetplus/backups/pre-rollout-def5174f-20260908t130000z/leetplus.dump' "$1"; }
def5174_manifest() { printf '%s/var/lib/leetplus/backups/pre-rollout-def5174f-20260908t130000z/manifest.json' "$1"; }
fresh_second_dump() { printf '%s/var/lib/postgresql/pre-current191-a05d2a50-20260910T022100Z/leetplus.dump' "$1"; }
def5174_state_root() { printf '%s/var/lib/leetplus/deploy-receipts/superseded-dump-retirement/current191-def5174-retirement-20260910' "$1"; }

write_def5174_capacity_state() {
  local root="$1" database_bytes="$2" available_bytes="$3" postgres_device="$4"
  chmod 0600 -- "$root/def5174-capacity.state"
  printf 'DATABASE_BYTES=%s\nAVAILABLE_BYTES=%s\nPOSTGRES_DEVICE=%s\n' \
    "$database_bytes" "$available_bytes" "$postgres_device" > "$root/def5174-capacity.state"
  chmod 0400 -- "$root/def5174-capacity.state"
}

write_fixture_control_release() {
  local root="$1" release_sha="$2"
  chmod 0600 -- "$root/control.release"
  printf '%s\n' "$release_sha" > "$root/control.release"
  chmod 0400 -- "$root/control.release"
}

plan_digest() {
  local root="$1" output
  output="$(invoke "$root" plan --control-release-sha "$RELEASE_SHA")"
  printf '%s\n' "$output" | grep -F -x 'CURRENT191_CAPACITY_RETIREMENT_PLAN=PASS' >/dev/null \
    || die 'plan did not report PASS'
  printf '%s\n' "$output" | awk -F= '$1 == "CURRENT191_CAPACITY_RETIREMENT_PLAN_SHA256" { print $2 }'
}

apply_exact() {
  local root="$1" digest="$2"
  invoke "$root" apply \
    --control-release-sha "$RELEASE_SHA" \
    --plan-sha256 "$digest" \
    --confirm "$CONFIRMATION"
}

plan_digest_def5174() {
  local root="$1" output
  output="$(invoke "$root" plan --retirement-set def5174-pre-rollout --control-release-sha "$RELEASE_SHA")"
  printf '%s\n' "$output" | grep -F -x 'CURRENT191_DEF5174_RETIREMENT_PLAN=PASS' >/dev/null \
    || die 'def5174 plan did not report PASS'
  printf '%s\n' "$output" | awk -F= '$1 == "CURRENT191_DEF5174_RETIREMENT_PLAN_SHA256" { print $2 }'
}

apply_exact_def5174() {
  local root="$1" digest="$2"
  invoke "$root" apply \
    --retirement-set def5174-pre-rollout \
    --control-release-sha "$RELEASE_SHA" \
    --plan-sha256 "$digest" \
    --confirm "$DEF5174_CONFIRMATION"
}

readonly ZERO_SHA256='0000000000000000000000000000000000000000000000000000000000000000'

# The def5174 production gates operate only on isolated fixture roots in CI.
# A clean inventory passes, while either reference class, filesystem identity
# drift or insufficient restored-copy reserve fails before a plan is published.
systemd_fixture_roots=(
  etc/systemd/system.control
  run/systemd/system.control
  run/systemd/transient
  run/systemd/generator.early
  etc/systemd/system
  etc/systemd/system.attached
  run/systemd/system
  run/systemd/system.attached
  run/systemd/generator
  usr/local/lib/systemd/system
  usr/lib/systemd/system
  run/systemd/generator.late
)
for systemd_fixture_relative in "${systemd_fixture_roots[@]}"; do
  setup_fixture
  root_def_systemd_ref="$new_fixture_root"
  systemd_fixture_file="${root_def_systemd_ref}/${systemd_fixture_relative}/def5174-reference.service"
  printf 'ExecStart=/usr/bin/printf %s\n' "$(def5174_target "$root_def_systemd_ref")" \
    > "$systemd_fixture_file"
  chmod 0400 -- "$systemd_fixture_file"
  if invoke "$root_def_systemd_ref" plan --retirement-set def5174-pre-rollout \
    --control-release-sha "$RELEASE_SHA" >/dev/null; then
    die "def5174 systemd reference was accepted in ${systemd_fixture_relative}"
  fi
  [[ -f "$(def5174_target "$root_def_systemd_ref")" \
    && ! -e "$(def5174_state_root "$root_def_systemd_ref")/plan.v1" ]] \
    || die "def5174 systemd-reference rejection changed effect state for ${systemd_fixture_relative}"
done

setup_fixture
root_def_state_ref="$new_fixture_root"
printf 'TARGET=%s\n' "$(def5174_target "$root_def_state_ref")" \
  > "$root_def_state_ref/var/lib/leetplus/operator-handoff/def5174-reference.txt"
chmod 0400 -- "$root_def_state_ref/var/lib/leetplus/operator-handoff/def5174-reference.txt"
if invoke "$root_def_state_ref" plan --retirement-set def5174-pre-rollout \
  --control-release-sha "$RELEASE_SHA" >/dev/null; then
  die 'def5174 external state reference was accepted'
fi
[[ -f "$(def5174_target "$root_def_state_ref")" \
  && ! -e "$(def5174_state_root "$root_def_state_ref")/plan.v1" ]] \
  || die 'def5174 state-reference rejection changed effect state'

setup_fixture
root_def_extension_ref="$new_fixture_root"
printf 'TARGET=%s\n' "$(def5174_target "$root_def_extension_ref")" \
  > "$root_def_extension_ref/var/lib/leetplus/operator-handoff/def5174-reference.dump"
chmod 0400 -- "$root_def_extension_ref/var/lib/leetplus/operator-handoff/def5174-reference.dump"
if invoke "$root_def_extension_ref" plan --retirement-set def5174-pre-rollout \
  --control-release-sha "$RELEASE_SHA" >/dev/null; then
  die 'def5174 reference in a dump-named file was accepted'
fi
[[ -f "$(def5174_target "$root_def_extension_ref")" \
  && ! -e "$(def5174_state_root "$root_def_extension_ref")/plan.v1" ]] \
  || die 'def5174 dump-extension rejection changed effect state'

setup_fixture
root_def_basename_ref="$new_fixture_root"
install -d -o root -g root -m 0700 -- \
  "$root_def_basename_ref/var/lib/leetplus/operator-handoff/pre-rollout-def5174f-20260908t130000z"
printf 'TARGET=%s\n' "$(def5174_target "$root_def_basename_ref")" > \
  "$root_def_basename_ref/var/lib/leetplus/operator-handoff/pre-rollout-def5174f-20260908t130000z/reference.txt"
chmod 0400 -- \
  "$root_def_basename_ref/var/lib/leetplus/operator-handoff/pre-rollout-def5174f-20260908t130000z/reference.txt"
if invoke "$root_def_basename_ref" plan --retirement-set def5174-pre-rollout \
  --control-release-sha "$RELEASE_SHA" >/dev/null; then
  die 'def5174 reference in a same-basename directory was accepted'
fi
[[ -f "$(def5174_target "$root_def_basename_ref")" \
  && ! -e "$(def5174_state_root "$root_def_basename_ref")/plan.v1" ]] \
  || die 'def5174 same-basename rejection changed effect state'

setup_fixture
root_def_systemd_symlink="$new_fixture_root"
ln -s -- "$(def5174_target "$root_def_systemd_symlink")" \
  "$root_def_systemd_symlink/etc/systemd/system/def5174-reference.service"
if invoke "$root_def_systemd_symlink" plan --retirement-set def5174-pre-rollout \
  --control-release-sha "$RELEASE_SHA" >/dev/null; then
  die 'def5174 systemd symlink escaping reviewed roots was accepted'
fi
[[ -f "$(def5174_target "$root_def_systemd_symlink")" \
  && ! -e "$(def5174_state_root "$root_def_systemd_symlink")/plan.v1" ]] \
  || die 'def5174 systemd-symlink rejection changed effect state'

setup_fixture
root_def_state_symlink="$new_fixture_root"
ln -s -- "$(def5174_manifest "$root_def_state_symlink")" \
  "$root_def_state_symlink/var/lib/leetplus/operator-handoff/def5174-reference"
if invoke "$root_def_state_symlink" plan --retirement-set def5174-pre-rollout \
  --control-release-sha "$RELEASE_SHA" >/dev/null; then
  die 'def5174 state symlink was accepted'
fi
[[ -f "$(def5174_target "$root_def_state_symlink")" \
  && ! -e "$(def5174_state_root "$root_def_state_symlink")/plan.v1" ]] \
  || die 'def5174 state-symlink rejection changed effect state'

setup_fixture
root_def_device="$new_fixture_root"
def_actual_device="$(stat -c '%d' -- "$root_def_device/var/lib/postgresql")"
write_def5174_capacity_state "$root_def_device" 100 3000000000 "$((def_actual_device + 1))"
if invoke "$root_def_device" plan --retirement-set def5174-pre-rollout \
  --control-release-sha "$RELEASE_SHA" >/dev/null; then
  die 'def5174 different-filesystem evidence was accepted'
fi
[[ -f "$(def5174_target "$root_def_device")" \
  && ! -e "$(def5174_state_root "$root_def_device")/plan.v1" ]] \
  || die 'def5174 filesystem rejection changed effect state'

setup_fixture
root_def_reserve="$new_fixture_root"
def_actual_device="$(stat -c '%d' -- "$root_def_reserve/var/lib/postgresql")"
write_def5174_capacity_state "$root_def_reserve" 100 1 "$def_actual_device"
if invoke "$root_def_reserve" plan --retirement-set def5174-pre-rollout \
  --control-release-sha "$RELEASE_SHA" >/dev/null; then
  die 'def5174 insufficient restored-copy reserve was accepted'
fi
[[ -f "$(def5174_target "$root_def_reserve")" \
  && ! -e "$(def5174_state_root "$root_def_reserve")/plan.v1" ]] \
  || die 'def5174 reserve rejection changed effect state'

# plan is nonauthorizing; wrong digest and unknown arguments cannot delete.
setup_fixture
root_wrong_digest="$new_fixture_root"
digest_wrong_digest="$(plan_digest "$root_wrong_digest")"
[[ "$digest_wrong_digest" =~ ^[0-9a-f]{64}$ ]] || die 'plan digest is malformed'
for target in "$(target_one "$root_wrong_digest")" "$(target_two "$root_wrong_digest")" "$(target_three "$root_wrong_digest")"; do
  [[ -f "$target" ]] || die 'plan deleted a reviewed target'
done
if invoke "$root_wrong_digest" apply --control-release-sha "$RELEASE_SHA" \
  --plan-sha256 "$ZERO_SHA256" --confirm "$CONFIRMATION"; then
  die 'wrong plan digest was accepted'
fi
if invoke "$root_wrong_digest" check --control-release-sha "$RELEASE_SHA" --unexpected; then
  die 'unknown argument was accepted'
fi
for target in "$(target_one "$root_wrong_digest")" "$(target_two "$root_wrong_digest")" "$(target_three "$root_wrong_digest")"; do
  [[ -f "$target" ]] || die 'negative apply changed a reviewed target'
done

# A successor generation cannot resume an incomplete predecessor operation.
# Terminal compatibility is deliberately unavailable until all three immutable
# predecessor records exist and the reviewed targets are already absent.
setup_fixture
root_incomplete_successor="$new_fixture_root"
digest_incomplete_successor="$(plan_digest "$root_incomplete_successor")"
write_fixture_control_release "$root_incomplete_successor" "$SUCCESSOR_RELEASE_SHA"
if invoke "$root_incomplete_successor" apply \
  --control-release-sha "$SUCCESSOR_RELEASE_SHA" \
  --plan-sha256 "$digest_incomplete_successor" --confirm "$CONFIRMATION"; then
  die 'successor generation resumed an incomplete predecessor operation'
fi
[[ ! -e "$(state_root "$root_incomplete_successor")/apply.intent.v1" ]] \
  || die 'incomplete predecessor rejection published an intent'
for target in "$(target_one "$root_incomplete_successor")" \
  "$(target_two "$root_incomplete_successor")" "$(target_three "$root_incomplete_successor")"; do
  [[ -f "$target" ]] || die 'incomplete predecessor rejection changed a reviewed target'
done

# Any post-plan byte/metadata drift fails before intent and before deletion.
setup_fixture
root_drift="$new_fixture_root"
digest_drift="$(plan_digest "$root_drift")"
printf 'tamper\n' >> "$(target_two "$root_drift")"
if apply_exact "$root_drift" "$digest_drift"; then
  die 'post-plan target drift was accepted'
fi
[[ ! -e "$(state_root "$root_drift")/apply.intent.v1" \
  && -f "$(target_one "$root_drift")" && -f "$(target_three "$root_drift")" ]] \
  || die 'drift failure crossed the effect boundary'

# Symlinks and nonterminal rollout state fail closed during plan.
setup_fixture
root_symlink="$new_fixture_root"
unlink -- "$(target_three "$root_symlink")"
ln -s -- "$(preserved_dump "$root_symlink")" "$(target_three "$root_symlink")"
if invoke "$root_symlink" plan --control-release-sha "$RELEASE_SHA" >/dev/null; then
  die 'symlink target was accepted'
fi

setup_fixture
root_unresolved="$new_fixture_root"
unlink -- "$root_unresolved/var/lib/leetplus/deploy-receipts/release-orchestrator/11111111-1111-4111-8111-111111111111/final.json"
if invoke "$root_unresolved" plan --control-release-sha "$RELEASE_SHA" >/dev/null; then
  die 'nonterminal rollout state was accepted'
fi

root_open=""
setup_fixture
root_open="$new_fixture_root"
exec 9< "$(target_one "$root_open")"
if invoke "$root_open" plan --control-release-sha "$RELEASE_SHA" >/dev/null; then
  die 'open retirement target was accepted'
fi
exec 9<&-

setup_fixture
root_preserved_drift="$new_fixture_root"
printf 'tamper\n' >> "$(preserved_dump "$root_preserved_drift")"
if invoke "$root_preserved_drift" plan --control-release-sha "$RELEASE_SHA" >/dev/null; then
  die 'drifted preserved recovery dump was accepted'
fi

# Exact apply removes only the compiled targets, preserves recovery bytes,
# publishes root-only records and is effect-free on replay.
setup_fixture
root_success="$new_fixture_root"
digest_success="$(plan_digest "$root_success")"
apply_output="$(apply_exact "$root_success" "$digest_success")"
printf '%s\n' "$apply_output" | grep -F -x 'CURRENT191_CAPACITY_RETIREMENT=PASS' >/dev/null \
  || die 'exact apply did not report PASS'
for target in "$(target_one "$root_success")" "$(target_two "$root_success")" "$(target_three "$root_success")"; do
  [[ ! -e "$target" && ! -L "$target" ]] || die 'exact target remains after apply'
done
[[ "$(sha256sum "$(preserved_dump "$root_success")" | awk '{ print $1 }')" == \
  '6011e179018f6e16d63920502b32db5cfb6c7118c3aa7cb0c8d529bb75ca758f' ]] \
  || die 'preserved recovery dump changed'
for record in "$(state_root "$root_success")/plan.v1" \
  "$(state_root "$root_success")/apply.intent.v1" \
  "$(state_root "$root_success")/apply.receipt.v1"; do
  [[ "$(stat -c '%u:%g:%a:%h' -- "$record")" == '0:0:400:1' ]] \
    || die 'published record authority is invalid'
done
receipt_sha_before="$(sha256sum "$(state_root "$root_success")/apply.receipt.v1" | awk '{ print $1 }')"
check_output="$(invoke "$root_success" check --control-release-sha "$RELEASE_SHA")"
printf '%s\n' "$check_output" | grep -F -x 'CURRENT191_CAPACITY_RETIREMENT=PASS' >/dev/null \
  || die 'check did not accept the terminal receipt'
replay_output="$(apply_exact "$root_success" "$digest_success")"
printf '%s\n' "$replay_output" | grep -F -x \
  "CURRENT191_CAPACITY_RETIREMENT_RECEIPT_SHA256=${receipt_sha_before}" >/dev/null \
  || die 'apply replay did not return the identical receipt'
[[ "$(sha256sum "$(state_root "$root_success")/apply.receipt.v1" | awk '{ print $1 }')" == "$receipt_sha_before" ]] \
  || die 'apply replay changed the receipt'

# A successor control generation may only verify/replay the predecessor's
# already terminal immutable receipt. It must return the same receipt and can
# never re-enter the unlink path.
write_fixture_control_release "$root_success" "$SUCCESSOR_RELEASE_SHA"
successor_check_output="$(invoke "$root_success" check --control-release-sha "$SUCCESSOR_RELEASE_SHA")"
printf '%s\n' "$successor_check_output" | grep -F -x 'CURRENT191_CAPACITY_RETIREMENT=PASS' >/dev/null \
  || die 'successor generation rejected the historical terminal check'
successor_replay_output="$(invoke "$root_success" apply \
  --control-release-sha "$SUCCESSOR_RELEASE_SHA" \
  --plan-sha256 "$digest_success" --confirm "$CONFIRMATION")"
printf '%s\n' "$successor_replay_output" | grep -F -x \
  "CURRENT191_CAPACITY_RETIREMENT_RECEIPT_SHA256=${receipt_sha_before}" >/dev/null \
  || die 'successor generation did not return the historical terminal receipt'
[[ "$(sha256sum "$(state_root "$root_success")/apply.receipt.v1" | awk '{ print $1 }')" == "$receipt_sha_before" ]] \
  || die 'successor terminal replay changed the historical receipt'

# A simulated lost response after the first unlink continues only from the
# durable intent and reaches the same terminal contract.
setup_fixture
root_recovery="$new_fixture_root"
digest_recovery="$(plan_digest "$root_recovery")"
if invoke_abort_after_first_unlink "$root_recovery" apply \
  --control-release-sha "$RELEASE_SHA" \
  --plan-sha256 "$digest_recovery" \
  --confirm "$CONFIRMATION"; then
  die 'fixture interruption unexpectedly returned success'
fi
[[ -f "$(state_root "$root_recovery")/apply.intent.v1" \
  && ! -e "$(target_one "$root_recovery")" \
  && -f "$(target_two "$root_recovery")" \
  && -f "$(target_three "$root_recovery")" \
  && ! -e "$(state_root "$root_recovery")/apply.receipt.v1" ]] \
  || die 'fixture interruption did not stop at the reviewed recovery point'
apply_exact "$root_recovery" "$digest_recovery" >/dev/null
invoke "$root_recovery" check --control-release-sha "$RELEASE_SHA" >/dev/null
for target in "$(target_one "$root_recovery")" "$(target_two "$root_recovery")" "$(target_three "$root_recovery")"; do
  [[ ! -e "$target" && ! -L "$target" ]] || die 'recovery left a reviewed target present'
done

# The def5174 set is a separate one-file effect. It preserves both reviewed
# recovery pairs and every uncompiled sibling, binds its own records and is
# replay-safe after a lost response following the single unlink.
setup_fixture
root_def_negative="$new_fixture_root"
digest_def_negative="$(plan_digest_def5174 "$root_def_negative")"
[[ -f "$(def5174_target "$root_def_negative")" ]] || die 'def5174 plan deleted its target'
if invoke "$root_def_negative" apply --retirement-set def5174-pre-rollout \
  --control-release-sha "$RELEASE_SHA" --plan-sha256 "$digest_def_negative" \
  --confirm "$CONFIRMATION"; then
  die 'def5174 apply accepted the old confirmation'
fi
[[ -f "$(def5174_target "$root_def_negative")" \
  && ! -e "$(def5174_state_root "$root_def_negative")/apply.intent.v1" ]] \
  || die 'negative def5174 apply crossed the effect boundary'

setup_fixture
root_def_drift="$new_fixture_root"
digest_def_drift="$(plan_digest_def5174 "$root_def_drift")"
printf 'tamper\n' >> "$(def5174_target "$root_def_drift")"
if apply_exact_def5174 "$root_def_drift" "$digest_def_drift"; then
  die 'def5174 post-plan drift was accepted'
fi
[[ -f "$(def5174_target "$root_def_drift")" \
  && ! -e "$(def5174_state_root "$root_def_drift")/apply.intent.v1" ]] \
  || die 'def5174 drift failure crossed the effect boundary'

setup_fixture
root_def_success="$new_fixture_root"
old_preserved_sha="$(sha256sum "$(preserved_dump "$root_def_success")" | awk '{print $1}')"
fresh_preserved_sha="$(sha256sum "$(fresh_second_dump "$root_def_success")" | awk '{print $1}')"
digest_def_success="$(plan_digest_def5174 "$root_def_success")"
def_apply_output="$(apply_exact_def5174 "$root_def_success" "$digest_def_success")"
printf '%s\n' "$def_apply_output" | grep -F -x 'CURRENT191_DEF5174_RETIREMENT=PASS' >/dev/null \
  || die 'def5174 exact apply did not report PASS'
[[ ! -e "$(def5174_target "$root_def_success")" && ! -L "$(def5174_target "$root_def_success")" \
  && -f "$(def5174_manifest "$root_def_success")" ]] \
  || die 'def5174 exact apply changed the wrong path'
[[ "$(sha256sum "$(preserved_dump "$root_def_success")" | awk '{print $1}')" == "$old_preserved_sha" \
  && "$(sha256sum "$(fresh_second_dump "$root_def_success")" | awk '{print $1}')" == "$fresh_preserved_sha" ]] \
  || die 'def5174 apply changed a preserved recovery dump'
def_receipt="$(def5174_state_root "$root_def_success")/apply.receipt.v1"
def_receipt_sha="$(sha256sum "$def_receipt" | awk '{print $1}')"
def_check_output="$(invoke "$root_def_success" check --retirement-set def5174-pre-rollout --control-release-sha "$RELEASE_SHA")"
printf '%s\n' "$def_check_output" | grep -F -x 'CURRENT191_DEF5174_RETIREMENT=PASS' >/dev/null \
  || die 'def5174 check rejected the terminal receipt'
def_replay_output="$(apply_exact_def5174 "$root_def_success" "$digest_def_success")"
printf '%s\n' "$def_replay_output" | grep -F -x \
  "CURRENT191_DEF5174_RETIREMENT_RECEIPT_SHA256=${def_receipt_sha}" >/dev/null \
  || die 'def5174 replay did not return the identical receipt'

setup_fixture
root_def_recovery="$new_fixture_root"
digest_def_recovery="$(plan_digest_def5174 "$root_def_recovery")"
if invoke_abort_after_first_unlink "$root_def_recovery" apply \
  --retirement-set def5174-pre-rollout \
  --control-release-sha "$RELEASE_SHA" \
  --plan-sha256 "$digest_def_recovery" \
  --confirm "$DEF5174_CONFIRMATION"; then
  die 'def5174 interruption unexpectedly returned success'
fi
[[ -f "$(def5174_state_root "$root_def_recovery")/apply.intent.v1" \
  && ! -e "$(def5174_target "$root_def_recovery")" \
  && ! -e "$(def5174_state_root "$root_def_recovery")/apply.receipt.v1" ]] \
  || die 'def5174 interruption did not stop at the reviewed recovery point'
apply_exact_def5174 "$root_def_recovery" "$digest_def_recovery" >/dev/null
invoke "$root_def_recovery" check --retirement-set def5174-pre-rollout \
  --control-release-sha "$RELEASE_SHA" >/dev/null

printf 'CURRENT191_SUPERSEDED_DUMP_PRUNE_ROOT_FIXTURE=PASS\n'
