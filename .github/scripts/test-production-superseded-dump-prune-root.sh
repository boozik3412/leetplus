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
readonly CONFIRMATION='I_ACCEPT_RETIRE_THREE_SUPERSEDED_DUMPS_FOR_CURRENT191'
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
  local root operation_root
  root="$(mktemp -d '/tmp/leetplus-superseded-dump-prune-test.XXXXXX')"
  fixture_roots+=("$root")
  [[ "$(realpath -e -- "$root")" == "$root" \
    && "$(stat -c '%u:%g:%a' -- "$root")" == '0:0:700' ]] \
    || die 'new fixture root identity is invalid'

  install -d -o root -g root -m 0700 \
    "$root/run/leetplus-production-control" \
    "$root/var/lib/leetplus/deploy-receipts" \
    "$root/var/lib/leetplus/deploy-receipts/release-orchestrator" \
    "$root/var/lib/postgresql/current191-d5d9b60c-9b2434aa" \
    "$root/var/lib/postgresql/pre-current191-fa21bbe-20260909T102434Z" \
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

  chmod 0400 "$root/control.release" "$root/database.state" "$operation_root/final.json"
  chmod 0600 "$root/run/leetplus-production-control/install.lock" \
    "$root/var/lib/leetplus/deploy-receipts/release-orchestrator/orchestrator.lock" \
    "$root/var/lib/postgresql/current191-d5d9b60c-9b2434aa/leetplus.dump" \
    "$root/var/lib/postgresql/pre-current191-fa21bbe-20260909T102434Z/leetplus.dump" \
    "$root/var/lib/postgresql/pre-current191-fa21bbe-20260909T102434Z/globals.sql"
  chmod 0400 "$root/srv/leetplus/release-preparation/54babfaf-b97181ea/database.dump"
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

readonly ZERO_SHA256='0000000000000000000000000000000000000000000000000000000000000000'

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

printf 'CURRENT191_SUPERSEDED_DUMP_PRUNE_ROOT_FIXTURE=PASS\n'
