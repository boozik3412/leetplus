#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'
umask 0077

readonly REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly VERIFIER="${REPOSITORY_ROOT}/docs/deployment/production-artifact/verify-pnpm-store-integrity.mjs"
readonly PRODUCER="${REPOSITORY_ROOT}/docs/deployment/production-artifact/stage-pnpm-store.sh"
readonly CONSUMER="${REPOSITORY_ROOT}/docs/deployment/production-artifact/stage-release-artifact.sh"
readonly STORE_WORKFLOW="${REPOSITORY_ROOT}/.github/workflows/build-trusted-pnpm-store.yml"
readonly LOCKFILE_SHA='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
readonly BUNDLE_SHA='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

die() {
  printf 'test-production-pnpm-store-integrity: %s\n' "$*" >&2
  exit 1
}

[[ "${CI:-}" == 'true' && "${GITHUB_ACTIONS:-}" == 'true' ]] \
  || die 'fixture is restricted to an explicit GitHub Actions boundary'

if ((EUID != 0)); then
  command -v sudo >/dev/null 2>&1 || die 'passwordless sudo is required'
  fixture_node="$(command -v node)"
  [[ "$fixture_node" == /* ]] || die 'fixture Node path must be absolute'
  exec sudo -n env \
    CI=true \
    GITHUB_ACTIONS=true \
    "LEETPLUS_FIXTURE_NODE=${fixture_node}" \
    bash "$0" "$@"
fi

for command_name in bash chmod chown find getent grep install ln mkfifo mktemp mount mountpoint realpath rm sed stat umount; do
  command -v "$command_name" >/dev/null 2>&1 || die "missing fixture command: ${command_name}"
done
fixture_node="${LEETPLUS_FIXTURE_NODE:-$(command -v node)}"
fixture_node="$(realpath -e -- "$fixture_node")"
[[ -f "$fixture_node" && ! -L "$fixture_node" && -x "$fixture_node" \
  && "$($fixture_node -p 'process.versions.node.split(".")[0]')" == '22' ]] \
  || die 'fixture requires an exact executable Node major 22'

TEST_ROOT="$(mktemp -d /tmp/leetplus-pnpm-store-integrity.XXXXXXXX)"
mounted_path=''
cleanup() {
  set +e
  if [[ -n "$mounted_path" && "$mounted_path" == "$TEST_ROOT"/* \
    && -d "$mounted_path" && ! -L "$mounted_path" ]] \
    && mountpoint -q -- "$mounted_path"; then
    umount -- "$mounted_path"
  fi
  case "$TEST_ROOT" in
    /tmp/leetplus-pnpm-store-integrity.*)
      [[ "$(realpath -m -- "$TEST_ROOT")" == "$TEST_ROOT" ]] && rm -rf -- "$TEST_ROOT"
      ;;
    *) printf 'refusing unsafe fixture cleanup: %s\n' "$TEST_ROOT" >&2 ;;
  esac
}
trap cleanup EXIT

create_store() {
  local label="$1"
  STORE_PATH="${TEST_ROOT}/${label}/store"
  install -d -o root -g root -m 0550 \
    "$STORE_PATH/v10/files/aa" \
    "$STORE_PATH/v10/index/bb" \
    "$STORE_PATH/.leetplus-tools/pnpm/10.17.1/bin" \
    "$STORE_PATH/.leetplus-tools/pnpm/10.17.1/dist"
  find -P "$STORE_PATH" -xdev -type d -exec chmod 0550 -- {} +
  printf 'package-%s\n' "$label" > "$STORE_PATH/v10/files/aa/content"
  printf 'index-%s\n' "$label" > "$STORE_PATH/v10/index/bb/package-index"
  printf '{"version":"10.17.1"}\n' \
    > "$STORE_PATH/.leetplus-tools/pnpm/10.17.1/package.json"
  printf 'fixture runtime entry\n' \
    > "$STORE_PATH/.leetplus-tools/pnpm/10.17.1/bin/pnpm.cjs"
  printf 'fixture runtime distribution\n' \
    > "$STORE_PATH/.leetplus-tools/pnpm/10.17.1/dist/pnpm.cjs"
  find -P "$STORE_PATH" -xdev -type f -exec chown root:root -- {} +
  find -P "$STORE_PATH" -xdev -type f -exec chmod 0440 -- {} +
  "$fixture_node" "$VERIFIER" prepare \
    --store-root "$STORE_PATH" \
    --lockfile-sha256 "$LOCKFILE_SHA" \
    --node-major 22 \
    --pnpm-version 10.17.1 \
    --bundle-sha256 "$BUNDLE_SHA" \
    > "${TEST_ROOT}/${label}.prepare.out"
  find -P "$STORE_PATH" -xdev -type d -exec chmod 0550 -- {} +
  find -P "$STORE_PATH" -xdev -type f -exec chmod 0440 -- {} +
  chown -hR root:root -- "$STORE_PATH"
}

verify_store() {
  "$fixture_node" "$VERIFIER" verify \
    --store-root "$STORE_PATH" \
    --lockfile-sha256 "$LOCKFILE_SHA" \
    --node-major 22 \
    --pnpm-version 10.17.1
}

expect_rejected() {
  local label="$1"
  if verify_store > "${TEST_ROOT}/${label}.out" 2>&1; then
    die "adversarial pnpm store was accepted: ${label}"
  fi
}

create_store valid
verify_store > "$TEST_ROOT/valid.verify.out"
grep -F -x 'PNPM_STORE_INTEGRITY=PASS' "$TEST_ROOT/valid.verify.out" >/dev/null
grep -E -x 'PNPM_STORE_MANIFEST_SHA256=[0-9a-f]{64}' \
  "$TEST_ROOT/valid.verify.out" >/dev/null

create_store missing-index
chmod 0750 -- "$STORE_PATH/v10"
rm -rf -- "$STORE_PATH/v10/index"
chmod 0550 -- "$STORE_PATH/v10"
expect_rejected missing-required-index
grep -F 'required pnpm store directory is absent: v10/index' \
  "$TEST_ROOT/missing-required-index.out" >/dev/null

create_store symlink
ln -s -- 'v10/files/aa/content' "$STORE_PATH/adversarial-link"
expect_rejected symlink

create_store hardlink
ln -- "$STORE_PATH/v10/files/aa/content" "$STORE_PATH/adversarial-hardlink"
expect_rejected hardlink

create_store special
mkfifo -- "$STORE_PATH/adversarial-fifo"
expect_rejected special-entry

create_store owner
adversarial_owner='nobody'
getent passwd "$adversarial_owner" >/dev/null || adversarial_owner='daemon'
chown "$adversarial_owner" -- "$STORE_PATH/v10/files/aa/content"
expect_rejected non-root-owner

create_store writable
chmod 0460 -- "$STORE_PATH/v10/files/aa/content"
expect_rejected group-writable

create_store unlisted
printf 'not in the complete manifest\n' > "$STORE_PATH/unlisted"
chown root:root -- "$STORE_PATH/unlisted"
chmod 0440 -- "$STORE_PATH/unlisted"
expect_rejected unlisted-file

create_store drift
chmod 0640 -- "$STORE_PATH/v10/files/aa/content"
printf 'drift\n' >> "$STORE_PATH/v10/files/aa/content"
chmod 0440 -- "$STORE_PATH/v10/files/aa/content"
expect_rejected content-drift

create_store receipt
chmod 0600 -- "$STORE_PATH/LEETPLUS_STORE_RECEIPT"
sed -i 's/^STORE_MANIFEST_SHA256=[0-9a-f]\{64\}$/STORE_MANIFEST_SHA256=0000000000000000000000000000000000000000000000000000000000000000/' \
  "$STORE_PATH/LEETPLUS_STORE_RECEIPT"
chmod 0400 -- "$STORE_PATH/LEETPLUS_STORE_RECEIPT"
expect_rejected receipt-manifest-drift

create_store nested-mount
mount_source="${TEST_ROOT}/mount-source"
install -d -o root -g root -m 0755 "$mount_source" "$STORE_PATH/nested"
printf 'outside\n' > "$mount_source/outside"
mount --bind "$mount_source" "$STORE_PATH/nested"
mounted_path="$STORE_PATH/nested"
expect_rejected nested-mount
umount -- "$mounted_path"
mounted_path=''

# Both producer and consumer must use the one receipt-bound verifier; a fixture
# that tests only the helper but is not wired into either side is insufficient.
grep -F "/usr/local/libexec/leetplus/verify-pnpm-store-integrity.mjs" "$PRODUCER" >/dev/null
grep -F "/usr/local/libexec/leetplus/verify-pnpm-store-integrity.mjs" "$CONSUMER" >/dev/null
grep -F -- '--bundle-sha256 "$expected_digest"' "$PRODUCER" >/dev/null
grep -F 'PNPM_STORE_RECEIPT_SHA256' "$CONSUMER" >/dev/null
grep -F '.leetplus-tools/pnpm/${expected_pnpm_version}' "$CONSUMER" >/dev/null
grep -F 'pnpm_command=(/usr/bin/node "$pnpm_runtime_entry")' "$CONSUMER" >/dev/null
grep -F 'node_modules/.leetplus-pnpm-install-store' "$CONSUMER" >/dev/null
grep -F 'ln -s -- "$trusted_store_files"' "$CONSUMER" >/dev/null
grep -F 'ln -s -- "$trusted_store_index"' "$CONSUMER" >/dev/null
grep -F 'for trusted_store_component_name in files index' "$CONSUMER" >/dev/null
grep -F 'rm -rf -- "$install_store_dir"' "$CONSUMER" >/dev/null
grep -F 'assert_trusted_store_unchanged' "$CONSUMER" >/dev/null
grep -F '.leetplus-tools/pnpm/$PNPM_VERSION' "$STORE_WORKFLOW" >/dev/null
grep -F 'pnpm runtime source contains a link or special entry' "$STORE_WORKFLOW" >/dev/null
grep -F -- '--no-preserve=ownership,mode,timestamps,links' "$STORE_WORKFLOW" >/dev/null
grep -F 'copied pnpm runtime contains a shared hardlink' "$STORE_WORKFLOW" >/dev/null
grep -F 'production-like store wrapper changed the trusted pnpm CAS' "$STORE_WORKFLOW" >/dev/null

printf 'PRODUCTION_PNPM_STORE_INTEGRITY_FIXTURE=PASS\n'
printf 'PRODUCTION_PNPM_STORE_ROOT_OWNERSHIP_BOUND=true\n'
printf 'PRODUCTION_PNPM_STORE_SAME_DEVICE_BOUND=true\n'
printf 'PRODUCTION_PNPM_STORE_NO_LINKS_SPECIALS_OR_NESTED_MOUNTS=true\n'
printf 'PRODUCTION_PNPM_STORE_COMPLETE_DIGEST_RECEIPT_BEFORE_PNPM=true\n'
