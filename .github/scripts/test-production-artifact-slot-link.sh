#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

trap 'status=$?; if [[ "$-" == *e* ]]; then printf "slot-link fixture: line=%s status=%s command=%q\n" "$LINENO" "$status" "$BASH_COMMAND" >&2; exit "$status"; fi' ERR

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
SLOT_LINK_HELPER="${REPOSITORY_ROOT}/docs/deployment/production-artifact/bind-release-slot.sh"
SEALER="${REPOSITORY_ROOT}/docs/deployment/production-artifact/seal-release-artifact.sh"
SHA_A='1111111111111111111111111111111111111111'
SHA_B='2222222222222222222222222222222222222222'

if ((EUID != 0)); then
  command -v sudo >/dev/null 2>&1 || {
    printf 'test-production-artifact-slot-link: passwordless sudo is required\n' >&2
    exit 1
  }
  fixture_node_binary="$(command -v node)"
  [[ "$fixture_node_binary" == /* ]] || {
    printf 'test-production-artifact-slot-link: Node binary is not absolute\n' >&2
    exit 1
  }
  exec sudo -n env "LEETPLUS_FIXTURE_NODE=${fixture_node_binary}" bash "$0" "$@"
fi

fixture_node_binary="${LEETPLUS_FIXTURE_NODE:-$(command -v node)}"
fixture_node_binary="$(realpath -e -- "$fixture_node_binary")"

grep -F -x '#!/usr/bin/bash -p' "$SLOT_LINK_HELPER" >/dev/null
grep -F '[[ "$-" == *p* ]]' "$SLOT_LINK_HELPER" >/dev/null
grep -F "PATH='/usr/sbin:/usr/bin:/sbin:/bin'" "$SLOT_LINK_HELPER" >/dev/null
if /usr/bin/bash "$SLOT_LINK_HELPER" --help >/dev/null 2>&1; then
  printf 'slot-link fixture: authority accepted non-privileged Bash mode\n' >&2
  exit 1
fi

fixture_service_user="${SUDO_USER:-nobody}"
if [[ "$fixture_service_user" == 'root' ]] || ! getent passwd "$fixture_service_user" >/dev/null; then
  fixture_service_user='nobody'
fi
fixture_service_gid="$(id -g "$fixture_service_user")"

TEST_ROOT="$(mktemp -d /tmp/leetplus-slot-link-fixture.XXXXXXXX)"
mounted_release_path=''
replaced_system_node=false
original_system_node_present=false
cleanup() {
  if [[ -n "$mounted_release_path" ]] && mountpoint -q -- "$mounted_release_path"; then
    umount -- "$mounted_release_path"
  fi
  if [[ "$replaced_system_node" == true ]]; then
    rm -f -- '/usr/bin/node'
    if [[ "$original_system_node_present" == true ]]; then
      mv -- "$TEST_ROOT/system-node.original" '/usr/bin/node'
    fi
  fi
  case "$TEST_ROOT" in
    /tmp/leetplus-slot-link-fixture.*) rm -rf -- "$TEST_ROOT" ;;
    *) printf 'refusing unsafe fixture cleanup: %s\n' "$TEST_ROOT" >&2; return 1 ;;
  esac
}
trap cleanup EXIT

chmod 0755 -- "$TEST_ROOT"
if [[ ! -f /usr/bin/node || -L /usr/bin/node \
  || "$(stat -c '%u:%g' -- /usr/bin/node 2>/dev/null || true)" != '0:0' \
  || "$(/usr/bin/node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)" != '22' ]]; then
  if [[ -e /usr/bin/node || -L /usr/bin/node ]]; then
    mv -- /usr/bin/node "$TEST_ROOT/system-node.original"
    original_system_node_present=true
  fi
  replaced_system_node=true
  install -o root -g root -m 0755 "$fixture_node_binary" /usr/bin/node
fi
[[ -f /usr/bin/node && ! -L /usr/bin/node \
  && "$(stat -c '%u:%g' -- /usr/bin/node)" == '0:0' \
  && "$(/usr/bin/node -p 'process.versions.node.split(".")[0]')" == '22' ]] || {
  printf 'slot-link fixture: could not provision exact root-owned /usr/bin/node major 22\n' >&2
  exit 1
}
install -d -m 0700 "$TEST_ROOT/cgroup-predicate"
: > "$TEST_ROOT/cgroup-predicate/empty.cgroup.procs"
[[ -z "$(find -P "$TEST_ROOT/cgroup-predicate" -type f -name '*.cgroup.procs' -exec awk 'NF { found=1; exit } END { exit(found ? 0 : 1) }' {} \; -print -quit)" ]]
printf '%s\n' "$$" > "$TEST_ROOT/cgroup-predicate/live.cgroup.procs"
[[ "$(find -P "$TEST_ROOT/cgroup-predicate" -type f -name '*.cgroup.procs' -exec awk 'NF { found=1; exit } END { exit(found ? 0 : 1) }' {} \; -print -quit)" == "$TEST_ROOT/cgroup-predicate/live.cgroup.procs" ]]
install -d -o root -g root -m 0755 \
  "$TEST_ROOT/srv" \
  "$TEST_ROOT/srv/leetplus" \
  "$TEST_ROOT/srv/leetplus/releases" \
  "$TEST_ROOT/srv/leetplus/slots" \
  "$TEST_ROOT/var" \
  "$TEST_ROOT/var/lib" \
  "$TEST_ROOT/var/lib/leetplus" \
  "$TEST_ROOT/var/lib/leetplus/deploy-receipts"
install -d -o root -g root -m 0700 \
  "$TEST_ROOT/var/lib/leetplus/deploy-receipts/slot-links"
chmod 0700 -- "$TEST_ROOT/var/lib/leetplus/deploy-receipts"

create_sealed_release() {
  local sha="$1"
  local release="$TEST_ROOT/srv/leetplus/releases/$sha"
  install -d -o root -g "$fixture_service_gid" -m 0550 \
    "$release/apps/api/dist/config" \
    "$release/apps/web/.next/static" \
    "$release/apps/web/.next/cache"
  printf 'console.log("api %s");\n' "$sha" > "$release/apps/api/dist/main.js"
  printf 'console.log("validate %s");\n' "$sha" > "$release/apps/api/dist/config/validate-production-environment.cli.js"
  printf '%s\n' "$sha" > "$release/apps/web/.next/BUILD_ID"
  printf 'static-%s\n' "$sha" > "$release/apps/web/.next/static/runtime.js"
  printf '{"releaseSha":"%s","databaseMigration":"20260820000000_slot_link_fixture","databaseMigrationCount":187}\n' \
    "$sha" > "$release/release-provenance.json"
  printf '{"links":[],"version":1}\n' > "$release/HYDRATED_SYMLINKS.json"
  {
    printf 'RECORD_VERSION=1\n'
    printf 'RELEASE_SHA=%s\n' "$sha"
    printf 'SANDBOX=SYSTEMD_IP_DENY_ANY_V1\n'
    printf 'INVOCATION_ID=0123456789abcdef0123456789abcdef\n'
    printf 'PNPM_STORE_LOCKFILE_SHA256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n'
    printf 'PNPM_STORE_MANIFEST_SHA256=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n'
    printf 'PNPM_STORE_RECEIPT_SHA256=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc\n'
  } > "$release/HYDRATION_SANDBOX_RECEIPT"
  (
    cd -- "$release"
    LC_ALL=C find . -type f ! -name SHA256SUMS ! -name HYDRATED_SHA256SUMS \
      ! -name HYDRATED_SYMLINKS.json -print0 \
      | LC_ALL=C sort -z \
      | xargs -0 sha256sum > SHA256SUMS
    LC_ALL=C find . -type f ! -name HYDRATED_SHA256SUMS -print0 \
      | LC_ALL=C sort -z \
      | xargs -0 sha256sum > HYDRATED_SHA256SUMS
  )
  chown -hR "root:${fixture_service_gid}" -- "$release"
  find -P "$release" -type d -exec chmod 0550 -- {} +
  find -P "$release" -type f -exec chmod 0440 -- {} +
}

create_sealed_release "$SHA_A"
create_sealed_release "$SHA_B"

# Sealing owns the recursive ownership effect, so it must reject a nested
# bind mount before manifest reads, chmod or chown can cross that boundary.
seal_mount_source="$TEST_ROOT/seal-mount-source"
mounted_release_path="$TEST_ROOT/srv/leetplus/releases/$SHA_A/nested-mount"
install -d -o root -g root -m 0755 "$seal_mount_source" "$mounted_release_path"
printf 'must-not-be-chowned\n' > "$seal_mount_source/outside.txt"
mount --bind "$seal_mount_source" "$mounted_release_path"
if /usr/bin/bash -p "$SEALER" \
  --release-sha "$SHA_A" \
  --release-root "$TEST_ROOT/srv/leetplus/releases" \
  --service-user "$fixture_service_user" \
  --dry-run > "$TEST_ROOT/seal-nested-mount-rejected.out" 2>&1; then
  printf 'sealer accepted a nested bind mount\n' >&2
  exit 1
fi
if ! grep -F 'release contains an exact or nested mountpoint' \
  "$TEST_ROOT/seal-nested-mount-rejected.out" >/dev/null; then
  printf 'slot-link fixture: nested-mount rejection diagnostic differs; Output=' >&2
  awk '{ printf "%s%s", separator, $0; separator=" | " } END { print "" }' \
    "$TEST_ROOT/seal-nested-mount-rejected.out" >&2
  exit 1
fi
[[ "$(stat -c '%u:%g' -- "$seal_mount_source/outside.txt")" == '0:0' ]]
umount -- "$mounted_release_path"
mounted_release_path=''
rmdir -- "$TEST_ROOT/srv/leetplus/releases/$SHA_A/nested-mount"
/usr/bin/bash -p "$SEALER" \
  --release-sha "$SHA_A" \
  --release-root "$TEST_ROOT/srv/leetplus/releases" \
  --service-user "$fixture_service_user" \
  --dry-run > "$TEST_ROOT/seal-mount-free-accepted.out"
grep -F -x "RELEASE_SEAL_DRY_RUN_SHA=${SHA_A}" \
  "$TEST_ROOT/seal-mount-free-accepted.out" >/dev/null

# SHA_B exercises a valid internal symlink whose raw target is bound by the
# dedicated topology manifest and, transitively, by HYDRATED_SHA256SUMS.
release_b="$TEST_ROOT/srv/leetplus/releases/$SHA_B"
ln -s -- 'apps/api/dist/main.js' "$release_b/runtime-api-link"
chmod 0640 -- "$release_b/HYDRATED_SYMLINKS.json" "$release_b/HYDRATED_SHA256SUMS"
printf '{"links":[{"path":"runtime-api-link","target":"apps/api/dist/main.js"}],"version":1}\n' \
  > "$release_b/HYDRATED_SYMLINKS.json"
(
  cd -- "$release_b"
  LC_ALL=C find . -type f ! -name HYDRATED_SHA256SUMS -print0 \
    | LC_ALL=C sort -z | xargs -0 sha256sum > HYDRATED_SHA256SUMS
)
chown -h "root:${fixture_service_gid}" "$release_b/runtime-api-link" \
  "$release_b/HYDRATED_SYMLINKS.json" "$release_b/HYDRATED_SHA256SUMS"
chmod 0440 -- "$release_b/HYDRATED_SYMLINKS.json" "$release_b/HYDRATED_SHA256SUMS"

create_hydration_attestation() {
  local sha="$1"
  local origin_slot="${2:-blue}"
  local release="$TEST_ROOT/srv/leetplus/releases/$sha"
  local record="$TEST_ROOT/var/lib/leetplus/deploy-receipts/release-hydration-attestation-${sha}.receipt"
  local source_receipt_sha256 hydrated_manifest_sha256
  source_receipt_sha256="$(sha256sum -- "$release/HYDRATION_SANDBOX_RECEIPT" | awk '{ print $1 }')"
  hydrated_manifest_sha256="$(sha256sum -- "$release/HYDRATED_SHA256SUMS" | awk '{ print $1 }')"
  {
    printf 'RECORD_VERSION=1\n'
    printf 'RELEASE_SHA=%s\n' "$sha"
    printf 'RELEASE_SLOT=%s\n' "$origin_slot"
    printf 'HYDRATION_INVOCATION_ID=0123456789abcdef0123456789abcdef\n'
    printf 'HYDRATION_SOURCE_RECEIPT_SHA256=%s\n' "$source_receipt_sha256"
    printf 'HYDRATION_UNIT_SHA256=dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd\n'
    printf 'HYDRATION_STAGER_SHA256=eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee\n'
    printf 'HYDRATION_POLICY_SHA256=ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff\n'
    printf 'HYDRATED_MANIFEST_SHA256=%s\n' "$hydrated_manifest_sha256"
    printf 'RELEASE_DIRECTORY=%s\n' "$release"
    printf 'PUBLICATION_AUTHORIZED=true\n'
    printf 'RUNTIME_SWITCHED=false\n'
  } > "$record"
  chown root:root -- "$record"
  chmod 0400 -- "$record"
}

create_hydration_attestation "$SHA_A"
create_hydration_attestation "$SHA_B"

common=(
  --fixture-root "$TEST_ROOT"
  --fixture-service-user "$fixture_service_user"
  --fixture-node "$fixture_node_binary"
  --fixture-units-state inactive
)

expect_blue_bind_rejected() {
  local label="$1"
  if /usr/bin/bash -p "$SLOT_LINK_HELPER" bind --slot blue --release-sha "$SHA_A" "${common[@]}" \
    > "$TEST_ROOT/${label}.out" 2>&1; then
    printf 'slot-link fixture: unsafe release was accepted (%s)\n' "$label" >&2
    exit 1
  fi
  [[ -z "$(find -P "$TEST_ROOT/var/lib/leetplus/deploy-receipts/slot-links" \
    -maxdepth 1 -name 'blue-*.intent' -print -quit)" ]]
  [[ ! -e "$TEST_ROOT/srv/leetplus/slots/blue" && ! -L "$TEST_ROOT/srv/leetplus/slots/blue" ]]
}

assert_fixture_status() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  local output_path="$4"
  [[ "$actual" == "$expected" ]] && return 0
  printf 'slot-link fixture: %s status differs; expected=%s actual=%s; Output=' \
    "$label" "$expected" "$actual" >&2
  if [[ -f "$output_path" ]]; then
    awk '{ printf "%s%s", separator, $0; separator=" | " } END { print "" }' \
      "$output_path" >&2
  else
    printf '<missing>\n' >&2
  fi
  exit 1
}

attestation_a="$TEST_ROOT/var/lib/leetplus/deploy-receipts/release-hydration-attestation-${SHA_A}.receipt"
rm -- "$attestation_a"
expect_blue_bind_rejected missing-hydration-attestation
create_hydration_attestation "$SHA_A"

attestation_alias="$TEST_ROOT/var/lib/leetplus/deploy-receipts/release-hydration-attestation-${SHA_A}.receipt.partial-alias"
ln -- "$attestation_a" "$attestation_alias"
expect_blue_bind_rejected multiply-linked-hydration-attestation
rm -- "$attestation_alias"

chmod 0600 -- "$attestation_a"
sed -i 's/^PUBLICATION_AUTHORIZED=true$/PUBLICATION_AUTHORIZED=false/' "$attestation_a"
chmod 0400 -- "$attestation_a"
expect_blue_bind_rejected unauthorized-hydration-publication
rm -- "$attestation_a"
create_hydration_attestation "$SHA_A"

chmod 0600 -- "$attestation_a"
sed -i 's/^RELEASE_SLOT=blue$/RELEASE_SLOT=legacy/' "$attestation_a"
chmod 0400 -- "$attestation_a"
expect_blue_bind_rejected invalid-hydration-origin-slot
rm -- "$attestation_a"
create_hydration_attestation "$SHA_A"

# A valid attestation digest is captured in the durable slot intent. Replacing
# the root-only record after intent publication must make reconciliation fail.
set +e
env NODE_OPTIONS='--require=/definitely-absent/leetplus-bind-injection.cjs' \
  NODE_PATH='/definitely-absent/leetplus-node-path' \
  HTTP_PROXY='http://127.0.0.1:9' http_proxy='http://127.0.0.1:9' \
  /usr/bin/bash -p "$SLOT_LINK_HELPER" bind --slot blue --release-sha "$SHA_A" \
  --fixture-abort-after-intent-record-link "${common[@]}" > "$TEST_ROOT/attestation-intent-crash.out" 2>&1
attestation_intent_status=$?
set -e
assert_fixture_status attestation-intent 87 "$attestation_intent_status" \
  "$TEST_ROOT/attestation-intent-crash.out"
chmod 0600 -- "$attestation_a"
sed -i 's/^HYDRATION_POLICY_SHA256=ffffffff/HYDRATION_POLICY_SHA256=aaaaaaaa/' "$attestation_a"
chmod 0400 -- "$attestation_a"
if /usr/bin/bash -p "$SLOT_LINK_HELPER" reconcile --slot blue "${common[@]}" \
  > "$TEST_ROOT/attestation-drift-reconcile.out" 2>&1; then
  printf 'slot-link fixture: hydration attestation drift crossed durable intent\n' >&2
  exit 1
fi
rm -- "$TEST_ROOT/var/lib/leetplus/deploy-receipts/slot-links/blue-"*.bind.intent
create_hydration_attestation "$SHA_A"

set +e
/usr/bin/bash -p "$SLOT_LINK_HELPER" bind --slot blue --release-sha "$SHA_A" \
  --fixture-abort-after-intent-record-link "${common[@]}" > "$TEST_ROOT/intent-publication-crash.out" 2>&1
intent_publication_crash_status=$?
set -e
assert_fixture_status intent-publication 87 "$intent_publication_crash_status" \
  "$TEST_ROOT/intent-publication-crash.out"
[[ ! -e "$TEST_ROOT/srv/leetplus/slots/blue" && ! -L "$TEST_ROOT/srv/leetplus/slots/blue" ]]
intent_after_publication_crash="$(find -P "$TEST_ROOT/var/lib/leetplus/deploy-receipts/slot-links" \
  -maxdepth 1 -type f -name 'blue-*.bind.intent' -print -quit)"
[[ "$(stat -c '%h' -- "$intent_after_publication_crash")" == '2' ]]
bind_a_output="$(/usr/bin/bash -p "$SLOT_LINK_HELPER" reconcile --slot blue "${common[@]}")"
bind_a_receipt="$(awk -F= '$1 == "SLOT_LINK_ACCEPTED_RECEIPT" { print $2 }' <<< "$bind_a_output")"
[[ -f "$bind_a_receipt" && "$(stat -c '%u:%g:%a:%h' -- "$bind_a_receipt")" == '0:0:600:1' ]]
[[ "$(realpath -e -- "$TEST_ROOT/srv/leetplus/slots/blue")" == "$TEST_ROOT/srv/leetplus/releases/$SHA_A" ]]
/usr/bin/bash -p "$SLOT_LINK_HELPER" reconcile --slot blue "${common[@]}" > "$TEST_ROOT/post-response-reconcile.out"
grep -F -x "SLOT_LINK_RECONCILED_LATEST_RECEIPT=${bind_a_receipt}" "$TEST_ROOT/post-response-reconcile.out" >/dev/null

# Hydration attests the immutable artifact and records which reviewed slot
# performed that operation. Each runtime destination still gets its own
# durable slot-link authority, so the same sealed SHA can safely satisfy a
# dual-slot schema bridge without rewriting the root-only hydration receipt.
green_bind_output="$(/usr/bin/bash -p "$SLOT_LINK_HELPER" bind --slot green \
  --release-sha "$SHA_A" "${common[@]}")"
green_bind_receipt="$(awk -F= '$1 == "SLOT_LINK_ACCEPTED_RECEIPT" { print $2 }' \
  <<< "$green_bind_output")"
[[ -f "$green_bind_receipt" \
  && "$(stat -c '%u:%g:%a:%h' -- "$green_bind_receipt")" == '0:0:600:1' ]]
[[ "$(realpath -e -- "$TEST_ROOT/srv/leetplus/slots/green")" \
  == "$TEST_ROOT/srv/leetplus/releases/$SHA_A" ]]

set +e
/usr/bin/bash -p "$SLOT_LINK_HELPER" bind --slot blue --release-sha "$SHA_B" \
  --fixture-abort-after-temporary-link "${common[@]}" > "$TEST_ROOT/temporary-link-crash.out" 2>&1
temporary_link_crash_status=$?
set -e
assert_fixture_status temporary-link 89 "$temporary_link_crash_status" \
  "$TEST_ROOT/temporary-link-crash.out"
[[ "$(realpath -e -- "$TEST_ROOT/srv/leetplus/slots/blue")" == "$TEST_ROOT/srv/leetplus/releases/$SHA_A" ]]
[[ -n "$(find -P "$TEST_ROOT/srv/leetplus/slots" -maxdepth 1 -type l -name 'blue.next.*' -print -quit)" ]]
bind_b_output="$(/usr/bin/bash -p "$SLOT_LINK_HELPER" reconcile --slot blue "${common[@]}")"
bind_b_receipt="$(awk -F= '$1 == "SLOT_LINK_ACCEPTED_RECEIPT" { print $2 }' <<< "$bind_b_output")"
[[ "$(realpath -e -- "$TEST_ROOT/srv/leetplus/slots/blue")" == "$TEST_ROOT/srv/leetplus/releases/$SHA_B" ]]

/usr/bin/bash -p "$SLOT_LINK_HELPER" rollback --receipt "$bind_b_receipt" "${common[@]}" > "$TEST_ROOT/rollback-normal.out"
[[ "$(realpath -e -- "$TEST_ROOT/srv/leetplus/slots/blue")" == "$TEST_ROOT/srv/leetplus/releases/$SHA_A" ]]
if /usr/bin/bash -p "$SLOT_LINK_HELPER" rollback --receipt "$bind_b_receipt" "${common[@]}" > "$TEST_ROOT/rollback-reuse.out" 2>&1; then
  printf 'slot-link fixture: one accepted bind receipt was rolled back twice\n' >&2
  exit 1
fi

active_common=(
  --fixture-root "$TEST_ROOT"
  --fixture-service-user "$fixture_service_user"
  --fixture-node "$fixture_node_binary"
  --fixture-units-state active
)
if /usr/bin/bash -p "$SLOT_LINK_HELPER" bind --slot blue --release-sha "$SHA_B" "${active_common[@]}" > "$TEST_ROOT/active-refusal.out" 2>&1; then
  printf 'slot-link fixture: active slot changed\n' >&2
  exit 1
fi
if /usr/bin/bash -p "$SLOT_LINK_HELPER" bind --slot blue --release-sha "$SHA_B" \
  --active-slot-safe-mode "${active_common[@]}" > "$TEST_ROOT/active-override-refusal.out" 2>&1; then
  printf 'slot-link fixture: removed active-slot override was accepted\n' >&2
  exit 1
fi
set +e
/usr/bin/bash -p "$SLOT_LINK_HELPER" bind --slot blue --release-sha "$SHA_B" \
  --fixture-abort-after-receipt-record-link \
  "${common[@]}" > "$TEST_ROOT/receipt-publication-crash.out" 2>&1
receipt_publication_crash_status=$?
set -e
assert_fixture_status receipt-publication 88 "$receipt_publication_crash_status" \
  "$TEST_ROOT/receipt-publication-crash.out"
safe_receipt_with_alias="$(find -P "$TEST_ROOT/var/lib/leetplus/deploy-receipts/slot-links" \
  -maxdepth 1 -type f -name 'blue-*.bind.receipt' -links 2 -print -quit)"
[[ -n "$safe_receipt_with_alias" ]]
/usr/bin/bash -p "$SLOT_LINK_HELPER" reconcile --slot blue "${common[@]}" > "$TEST_ROOT/receipt-publication-reconcile.out"
safe_bind_receipt="$safe_receipt_with_alias"
[[ -f "$safe_bind_receipt" ]]
[[ "$(stat -c '%h' -- "$safe_bind_receipt")" == '1' ]]

set +e
/usr/bin/bash -p "$SLOT_LINK_HELPER" bind --slot blue --release-sha "$SHA_A" \
  --fixture-abort-after-effect "${common[@]}" > "$TEST_ROOT/bind-crash.out" 2>&1
bind_crash_status=$?
set -e
assert_fixture_status bind-effect 86 "$bind_crash_status" \
  "$TEST_ROOT/bind-crash.out"
[[ "$(realpath -e -- "$TEST_ROOT/srv/leetplus/slots/blue")" == "$TEST_ROOT/srv/leetplus/releases/$SHA_A" ]]
[[ "$(find -P "$TEST_ROOT/var/lib/leetplus/deploy-receipts/slot-links" -maxdepth 1 -type f -name 'blue-*.bind.intent' | wc -l)" == '1' ]]
reconcile_bind_output="$(/usr/bin/bash -p "$SLOT_LINK_HELPER" reconcile --slot blue "${common[@]}")"
crash_bind_receipt="$(awk -F= '$1 == "SLOT_LINK_ACCEPTED_RECEIPT" { print $2 }' <<< "$reconcile_bind_output")"
[[ -f "$crash_bind_receipt" ]]
[[ -z "$(find -P "$TEST_ROOT/var/lib/leetplus/deploy-receipts/slot-links" -maxdepth 1 -type f -name 'blue-*.intent' -print -quit)" ]]

set +e
/usr/bin/bash -p "$SLOT_LINK_HELPER" rollback --receipt "$crash_bind_receipt" \
  --fixture-abort-after-effect "${common[@]}" > "$TEST_ROOT/rollback-crash.out" 2>&1
rollback_crash_status=$?
set -e
assert_fixture_status rollback-effect 86 "$rollback_crash_status" \
  "$TEST_ROOT/rollback-crash.out"
[[ "$(realpath -e -- "$TEST_ROOT/srv/leetplus/slots/blue")" == "$TEST_ROOT/srv/leetplus/releases/$SHA_B" ]]
/usr/bin/bash -p "$SLOT_LINK_HELPER" reconcile --slot blue "${common[@]}" > "$TEST_ROOT/rollback-reconcile.out"
[[ -z "$(find -P "$TEST_ROOT/var/lib/leetplus/deploy-receipts/slot-links" -maxdepth 1 -type f -name 'blue-*.intent' -print -quit)" ]]

# A slot path outside releases/<40sha> is never adopted as a prior state.
rm -- "$TEST_ROOT/srv/leetplus/slots/blue"
ln -s -- "$TEST_ROOT/srv/leetplus" "$TEST_ROOT/srv/leetplus/slots/blue"
if /usr/bin/bash -p "$SLOT_LINK_HELPER" bind --slot blue --release-sha "$SHA_A" "${common[@]}" > "$TEST_ROOT/traversal-refusal.out" 2>&1; then
  printf 'slot-link fixture: out-of-root prior symlink was accepted\n' >&2
  exit 1
fi
rm -- "$TEST_ROOT/srv/leetplus/slots/blue"

# Preserve the valid pair so every negative case proves one isolated failure.
negative_release="$TEST_ROOT/srv/leetplus/releases/$SHA_A"
negative_backup="$TEST_ROOT/negative-manifest-backup"
install -d -o root -g root -m 0700 "$negative_backup"
cp -- "$negative_release/SHA256SUMS" "$negative_backup/SHA256SUMS"
cp -- "$negative_release/HYDRATED_SHA256SUMS" "$negative_backup/HYDRATED_SHA256SUMS"
cp -- "$negative_release/HYDRATED_SYMLINKS.json" "$negative_backup/HYDRATED_SYMLINKS.json"

restore_negative_manifests() {
  cp -- "$negative_backup/SHA256SUMS" "$negative_release/SHA256SUMS"
  cp -- "$negative_backup/HYDRATED_SHA256SUMS" "$negative_release/HYDRATED_SHA256SUMS"
  cp -- "$negative_backup/HYDRATED_SYMLINKS.json" "$negative_release/HYDRATED_SYMLINKS.json"
  chown "root:${fixture_service_gid}" \
    "$negative_release/SHA256SUMS" "$negative_release/HYDRATED_SHA256SUMS" \
    "$negative_release/HYDRATED_SYMLINKS.json"
  chmod 0440 -- "$negative_release/SHA256SUMS" "$negative_release/HYDRATED_SHA256SUMS" \
    "$negative_release/HYDRATED_SYMLINKS.json"
}

regenerate_negative_hydrated_manifest() {
  chmod 0640 -- "$negative_release/HYDRATED_SHA256SUMS"
  (
    cd -- "$negative_release"
    LC_ALL=C find . -type f ! -name HYDRATED_SHA256SUMS -print0 \
      | LC_ALL=C sort -z \
      | xargs -0 sha256sum > HYDRATED_SHA256SUMS
  )
  chown "root:${fixture_service_gid}" "$negative_release/HYDRATED_SHA256SUMS"
  chmod 0440 -- "$negative_release/HYDRATED_SHA256SUMS"
}

# sha256sum --check alone accepts an unlisted file; the hydrated manifest must
# cover the exact regular-file tree.
printf 'unlisted\n' > "$negative_release/unlisted.txt"
chown "root:${fixture_service_gid}" "$negative_release/unlisted.txt"
chmod 0440 -- "$negative_release/unlisted.txt"
expect_blue_bind_rejected unlisted-regular-file
rm -- "$negative_release/unlisted.txt"

# Removing one valid line still leaves every listed digest valid.
chmod 0640 -- "$negative_release/HYDRATED_SHA256SUMS"
awk '$2 != "./apps/api/dist/main.js"' "$negative_backup/HYDRATED_SHA256SUMS" \
  > "$negative_release/HYDRATED_SHA256SUMS"
chown "root:${fixture_service_gid}" "$negative_release/HYDRATED_SHA256SUMS"
chmod 0440 -- "$negative_release/HYDRATED_SHA256SUMS"
expect_blue_bind_rejected incomplete-hydrated-manifest
restore_negative_manifests

# Duplicate manifest paths remain digest-valid but are not canonical.
chmod 0640 -- "$negative_release/SHA256SUMS"
head -n 1 "$negative_release/SHA256SUMS" >> "$negative_release/SHA256SUMS"
chmod 0440 -- "$negative_release/SHA256SUMS"
regenerate_negative_hydrated_manifest
expect_blue_bind_rejected duplicate-manifest-path
restore_negative_manifests

# Absolute and parent-traversing entries are forbidden even when their digests
# resolve to real files.
printf 'absolute\n' > "$TEST_ROOT/absolute-proof"
absolute_digest="$(sha256sum -- "$TEST_ROOT/absolute-proof" | awk '{ print $1 }')"
chmod 0640 -- "$negative_release/SHA256SUMS"
printf '%s  %s\n' "$absolute_digest" "$TEST_ROOT/absolute-proof" >> "$negative_release/SHA256SUMS"
chmod 0440 -- "$negative_release/SHA256SUMS"
regenerate_negative_hydrated_manifest
expect_blue_bind_rejected absolute-manifest-path
restore_negative_manifests

printf 'traversal\n' > "$TEST_ROOT/srv/leetplus/releases/traversal-proof"
traversal_digest="$(sha256sum -- "$TEST_ROOT/srv/leetplus/releases/traversal-proof" | awk '{ print $1 }')"
chmod 0640 -- "$negative_release/SHA256SUMS"
printf '%s  ../traversal-proof\n' "$traversal_digest" >> "$negative_release/SHA256SUMS"
chmod 0440 -- "$negative_release/SHA256SUMS"
regenerate_negative_hydrated_manifest
expect_blue_bind_rejected parent-traversal-manifest-path
restore_negative_manifests
rm -- "$TEST_ROOT/srv/leetplus/releases/traversal-proof"

# sha256sum follows an internal symlink; the authority must require a direct
# regular-file manifest entry.
ln -s -- "$negative_release/apps/api/dist/main.js" "$negative_release/link-to-main"
link_digest="$(sha256sum -- "$negative_release/link-to-main" | awk '{ print $1 }')"
chmod 0640 -- "$negative_release/SHA256SUMS"
printf '%s  ./link-to-main\n' "$link_digest" >> "$negative_release/SHA256SUMS"
chmod 0440 -- "$negative_release/SHA256SUMS"
regenerate_negative_hydrated_manifest
expect_blue_bind_rejected manifest-symlink-entry
restore_negative_manifests
rm -- "$negative_release/link-to-main"

# A symlink added after hydration is not part of the accepted topology.
ln -s -- 'apps/api/dist/main.js' "$negative_release/topology-link"
expect_blue_bind_rejected unmanifested-symlink
rm -- "$negative_release/topology-link"

# A topology manifest cannot claim a link that is absent.
chmod 0640 -- "$negative_release/HYDRATED_SYMLINKS.json"
printf '{"links":[{"path":"topology-link","target":"apps/api/dist/main.js"}],"version":1}\n' \
  > "$negative_release/HYDRATED_SYMLINKS.json"
chmod 0440 -- "$negative_release/HYDRATED_SYMLINKS.json"
regenerate_negative_hydrated_manifest
expect_blue_bind_rejected missing-manifested-symlink
restore_negative_manifests

# Retargeting a correctly manifested link changes no regular file; the exact
# topology comparison must still reject it.
ln -s -- 'apps/web/.next/BUILD_ID' "$negative_release/topology-link"
chmod 0640 -- "$negative_release/HYDRATED_SYMLINKS.json"
printf '{"links":[{"path":"topology-link","target":"apps/api/dist/main.js"}],"version":1}\n' \
  > "$negative_release/HYDRATED_SYMLINKS.json"
chmod 0440 -- "$negative_release/HYDRATED_SYMLINKS.json"
regenerate_negative_hydrated_manifest
expect_blue_bind_rejected retargeted-manifested-symlink
rm -- "$negative_release/topology-link"
restore_negative_manifests

# Exact mode validation rejects extra owner-write/execute and special bits.
chmod 0640 -- "$negative_release/release-provenance.json"
expect_blue_bind_rejected writable-file-mode
chmod 0440 -- "$negative_release/release-provenance.json"

chmod 0750 -- "$negative_release/apps/api/dist"
expect_blue_bind_rejected extra-directory-mode
chmod 0550 -- "$negative_release/apps/api/dist"

chmod 2440 -- "$negative_release/apps/api/dist/main.js"
expect_blue_bind_rejected setgid-file-mode
chmod 0440 -- "$negative_release/apps/api/dist/main.js"

# Content drift remains fail-closed after the path-set/mode gates.
chmod 0640 -- "$negative_release/release-provenance.json"
printf 'x' >> "$negative_release/release-provenance.json"
chmod 0440 -- "$negative_release/release-provenance.json"
expect_blue_bind_rejected content-drift

printf 'PRODUCTION_ARTIFACT_SLOT_LINK_FIXTURE=PASS\n'
printf 'PRODUCTION_ARTIFACT_SLOT_LINK_DURABLE_INTENT=true\n'
printf 'PRODUCTION_ARTIFACT_SLOT_LINK_LOST_RESPONSE_RECONCILED=true\n'
printf 'PRODUCTION_ARTIFACT_SLOT_LINK_RECEIPT_BOUND_ROLLBACK=true\n'
printf 'PRODUCTION_ARTIFACT_SLOT_LINK_CANONICAL_MANIFEST_COVERAGE=true\n'
printf 'PRODUCTION_ARTIFACT_SLOT_LINK_SYMLINK_TOPOLOGY_BOUND=true\n'
printf 'PRODUCTION_ARTIFACT_SLOT_LINK_EXACT_SEAL_MODES=true\n'
printf 'PRODUCTION_ARTIFACT_SLOT_LINK_HYDRATION_ATTESTATION_REQUIRED=true\n'
printf 'PRODUCTION_ARTIFACT_SLOT_LINK_HYDRATION_ATTESTATION_INTENT_BOUND=true\n'
