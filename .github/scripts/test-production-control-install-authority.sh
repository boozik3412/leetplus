#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'
umask 0077

readonly RELEASE_SHA='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
readonly REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly SOURCE_ALLOWLIST="${REPOSITORY_ROOT}/docs/deployment/production-control-authority/production-control-payload.allowlist"
readonly AUTHORITY_SOURCE="${REPOSITORY_ROOT}/docs/deployment/production-control-authority/leetplus-install-production-control-v1"
readonly ARTIFACT_VERIFIER_SOURCE="${REPOSITORY_ROOT}/docs/deployment/production-control-authority/verify-production-control-artifact.mjs"
readonly ARTIFACT_ALLOWLIST='docs/deployment/production-control-authority/production-control-payload.allowlist'
readonly INNER_MANIFEST='docs/deployment/production-artifact/CONTROL_BUNDLE_SHA256SUMS'
readonly INSTALL_MAP='docs/deployment/production-control-authority/production-control-install-map.tsv'
readonly INSTALLED_VERIFIER='/usr/local/libexec/leetplus/verify-installed-production-control-generation.mjs'
readonly CLEAN_PATH='/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
readonly TEST_ROOT="$(mktemp -d)"
readonly SOURCE_NODE="$(realpath -e -- "${LEETPLUS_FIXTURE_NODE:-$(command -v node)}")"

die() {
  printf 'test-production-control-install-authority: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  case "$TEST_ROOT" in
    /tmp/*|/private/tmp/*)
      [[ -d "$TEST_ROOT" && ! -L "$TEST_ROOT" ]] && rm -rf -- "$TEST_ROOT"
      ;;
    *) printf 'refusing unsafe fixture cleanup: %s\n' "$TEST_ROOT" >&2 ;;
  esac
}
trap cleanup EXIT

for command_name in basename cd chmod cp dirname find grep gzip install ln mkdir mktemp mv realpath rm sed sha256sum sort stat tar; do
  command -v "$command_name" >/dev/null 2>&1 \
    || die "missing fixture command: ${command_name}"
done
[[ -f "$SOURCE_NODE" && ! -L "$SOURCE_NODE" && -x "$SOURCE_NODE" ]] \
  || die 'fixture Node source must be an exact regular executable'
fixture_node="$SOURCE_NODE"
if ((EUID == 0)); then
  node_source_identity="$(stat -c '%d:%i:%s:%Y:%Z' -- "$SOURCE_NODE")"
  node_source_digest="$(sha256sum -- "$SOURCE_NODE" | sed 's/[[:space:]].*$//')"
  cp --reflink=never -- "$SOURCE_NODE" "$TEST_ROOT/node22"
  chmod 0500 -- "$TEST_ROOT/node22"
  [[ "$(stat -c '%d:%i:%s:%Y:%Z' -- "$SOURCE_NODE")" == "$node_source_identity" \
    && "$(sha256sum -- "$SOURCE_NODE" | sed 's/[[:space:]].*$//')" == "$node_source_digest" \
    && "$(sha256sum -- "$TEST_ROOT/node22" | sed 's/[[:space:]].*$//')" == "$node_source_digest" \
    && "$(stat -c '%u:%g:%a:%h' -- "$TEST_ROOT/node22")" == '0:0:500:1' ]] \
    || die 'privileged fixture Node snapshot is not stable root authority'
  fixture_node="$TEST_ROOT/node22"
fi
readonly FIXTURE_NODE="$fixture_node"
unset fixture_node node_source_identity node_source_digest

clean_node() {
  /usr/bin/env -i \
    PATH="$CLEAN_PATH" \
    LANG='C.UTF-8' \
    LC_ALL='C.UTF-8' \
    TZ='UTC' \
    "$FIXTURE_NODE" "$@"
}

[[ "$(clean_node -p 'process.versions.node.split(".")[0]')" == '22' ]] \
  || die 'fixture requires exact Node.js major 22'

sha256_file() {
  sha256sum -- "$1" | sed 's/[[:space:]].*$//'
}

write_root_manifest() {
  local root="$1"
  clean_node - "$root" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const root = fs.realpathSync.native(process.argv[2]);
const compare = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const files = [];
const walk = (directory, prefix = '') => {
  for (const name of fs.readdirSync(directory).sort(compare)) {
    const relative = prefix ? `${prefix}/${name}` : name;
    if (relative === 'SHA256SUMS') continue;
    const absolute = path.join(directory, name);
    const stat = fs.lstatSync(absolute);
    if (stat.isDirectory()) walk(absolute, relative);
    else if (stat.isFile() || stat.isSymbolicLink()) files.push(relative);
  }
};
walk(root);
files.sort(compare);
const records = files.map((relative) => {
  const bytes = fs.readFileSync(path.join(root, ...relative.split('/')));
  return `${crypto.createHash('sha256').update(bytes).digest('hex')}  ./${relative}`;
});
fs.writeFileSync(path.join(root, 'SHA256SUMS'), `${records.join('\n')}\n`, {
  encoding: 'utf8', mode: 0o440,
});
NODE
}

write_provenance() {
  local root="$1"
  local allowlist_digest inner_digest node_digest payload_count
  allowlist_digest="$(sha256_file "$root/$ARTIFACT_ALLOWLIST")"
  inner_digest="$(sha256_file "$root/$INNER_MANIFEST")"
  node_digest="$(clean_node -e \
    'const c=require("node:crypto"),f=require("node:fs");process.stdout.write(c.createHash("sha256").update(f.readFileSync(process.execPath)).digest("hex"))')"
  payload_count="$(clean_node -e \
    'const f=require("node:fs");process.stdout.write(String(f.readFileSync(process.argv[1],"utf8").slice(0,-1).split("\n").length))' \
    "$root/$ARTIFACT_ALLOWLIST")"
  printf '%s\n' \
    '{' \
    '  "schemaVersion": 1,' \
    '  "artifactKind": "leetplus-production-control",' \
    "  \"releaseSha\": \"${RELEASE_SHA}\"," \
    '  "nodeMajor": 22,' \
    "  \"nodeExecutableSha256\": \"${node_digest}\"," \
    "  \"payloadAllowlistSha256\": \"${allowlist_digest}\"," \
    "  \"payloadFileCount\": ${payload_count}," \
    "  \"controlBundleManifestSha256\": \"${inner_digest}\"" \
    '}' > "$root/production-control-provenance.json"
}

make_artifact_tree() {
  local root="$1"
  local listed source target
  install -d -m 0700 -- "$root"
  while IFS= read -r listed; do
    [[ -n "$listed" ]] || die 'allowlist contains an empty line'
    source="${REPOSITORY_ROOT}/${listed}"
    target="${root}/${listed}"
    [[ -f "$source" && ! -L "$source" ]] \
      || die "allowlisted source is absent or linked: ${listed}"
    install -d -m 0700 -- "$(dirname -- "$target")"
    cp -- "$source" "$target"
  done < "$SOURCE_ALLOWLIST"
  write_provenance "$root"
  write_root_manifest "$root"
  find "$root" -type f -exec chmod 0440 {} +
}

build_archive() {
  local tree="$1"
  local output="$2"
  local member_list="${output}.members"
  (
    cd -- "$tree"
    find . \( -type f -o -type l \) -printf '%P\n' | LC_ALL=C sort > "$member_list"
    tar \
      --create \
      --file "${output}.tar" \
      --format=ustar \
      --sort=name \
      --mtime='@0' \
      --owner=0 \
      --group=0 \
      --numeric-owner \
      --mode='u=r,g=r,o=' \
      --no-recursion \
      --verbatim-files-from \
      --files-from="$member_list"
  )
  gzip --no-name --best --stdout -- "${output}.tar" > "$output"
  chmod 0440 -- "$output"
}

write_admission() {
  local inbox="$1"
  local archive_digest="$2"
  local receipt="${inbox}/leetplus-release-admission-${RELEASE_SHA}.json"
  clean_node - "$receipt" "$archive_digest" "$RELEASE_SHA" <<'NODE'
const fs = require('node:fs');
const [receipt, controlDigest, releaseSha] = process.argv.slice(2);
const record = {
  schemaVersion: 1,
  admission: 'PASS',
  releaseSha,
  runId: '123456',
  runAttempt: '1',
  repository: 'boozik3412/leetplus',
  repositoryId: '987654',
  workflowRef: 'boozik3412/leetplus/.github/workflows/ci.yml@refs/heads/main',
  workflowSha: releaseSha,
  runtimeArtifactName: `leetplus-release-${releaseSha}-handoff-payload-123456-1`,
  runtimeArchiveSha256: 'b'.repeat(64),
  productionControlArtifactName:
    `leetplus-production-control-${releaseSha}-handoff-payload-123456-1`,
  productionControlArchiveSha256: controlDigest,
  runtimeArtifactId: '1001',
  runtimeTransportDigest: 'c'.repeat(64),
  productionControlArtifactId: '1002',
  productionControlTransportDigest: 'd'.repeat(64),
};
fs.writeFileSync(receipt, `${JSON.stringify(record, null, 2)}\n`, {
  encoding: 'utf8', mode: 0o440,
});
NODE
  (
    cd -- "$inbox"
    sha256sum --text "$(basename -- "$receipt")" > "$(basename -- "$receipt").sha256"
  )
  chmod 0440 -- "$receipt" "${receipt}.sha256"
}

prepare_fixture_root() {
  local root="$1"
  local archive="$2"
  local archive_digest
  local inbox="${root}/srv/leetplus/production-control-inbox"
  install -d -m 0700 -- "$root" "$root/usr/local/sbin" "$inbox"
  install -m 0500 -- "$AUTHORITY_SOURCE" \
    "$root/usr/local/sbin/leetplus-install-production-control-v1"
  install -m 0440 -- "$archive" \
    "$inbox/leetplus-production-control-${RELEASE_SHA}.tar.gz"
  archive_digest="$(sha256_file "$inbox/leetplus-production-control-${RELEASE_SHA}.tar.gz")"
  printf '%s  %s\n' "$archive_digest" \
    "leetplus-production-control-${RELEASE_SHA}.tar.gz" \
    > "$inbox/leetplus-production-control-${RELEASE_SHA}.tar.gz.sha256"
  chmod 0440 -- "$inbox/leetplus-production-control-${RELEASE_SHA}.tar.gz.sha256"
  write_admission "$inbox" "$archive_digest"
}

run_installer() {
  local root="$1"
  shift
  BASH_ENV='/fixture-must-not-be-read' \
  DATABASE_URL='postgresql://fixture-secret-must-be-scrubbed' \
  HTTP_PROXY='http://fixture-proxy-must-be-scrubbed.invalid' \
  NODE_OPTIONS='--no-warnings' \
  CI=true \
  LEETPLUS_FIXTURE_NODE="$FIXTURE_NODE" \
  LEETPLUS_PRODUCTION_CONTROL_FIXTURE_CONFIRMATION='install-production-control-v1' \
    "$root/usr/local/sbin/leetplus-install-production-control-v1" \
      --release-sha "$RELEASE_SHA" \
      --unprivileged-test-mode \
      --fixture-root "$root" \
      "$@"
}

run_installed_verifier() {
  local root="$1"
  /usr/bin/env -i \
    PATH="$CLEAN_PATH" \
    LANG='C.UTF-8' \
    LC_ALL='C.UTF-8' \
    TZ='UTC' \
    LEETPLUS_PRODUCTION_CONTROL_FIXTURE_CONFIRMATION='verify-installed-production-control-generation' \
    "$FIXTURE_NODE" "$root/$INSTALLED_VERIFIER" \
      --release-sha "$RELEASE_SHA" \
      --fixture-root "$root"
}

expect_installer_rejected() {
  local label="$1"
  local root="$2"
  local message="$3"
  if run_installer "$root" > "$TEST_ROOT/${label}.out" 2>&1; then
    die "adversarial installer input was accepted: ${label}"
  fi
  grep -F -- "$message" "$TEST_ROOT/${label}.out" >/dev/null \
    || { printf '%s rejection output:\n' "$label" >&2; sed -n '1,60p' "$TEST_ROOT/${label}.out" >&2; exit 1; }
}

artifact_tree="$TEST_ROOT/artifact-tree"
archive="$TEST_ROOT/leetplus-production-control-${RELEASE_SHA}.tar.gz"
make_artifact_tree "$artifact_tree"
build_archive "$artifact_tree" "$archive"

accepted_root="$TEST_ROOT/accepted-root"
prepare_fixture_root "$accepted_root" "$archive"
run_installer "$accepted_root" > "$TEST_ROOT/accepted.out"
grep -F -x 'PRODUCTION_CONTROL_INSTALL=PASS' "$TEST_ROOT/accepted.out" >/dev/null
grep -F -x 'PRODUCTION_CONTROL_INSTALLED_GENERATION=PASS' "$TEST_ROOT/accepted.out" >/dev/null
grep -F -x 'PRODUCTION_CONTROL_INSTALLED_FILE_COUNT=46' "$TEST_ROOT/accepted.out" >/dev/null
[[ -f "$accepted_root/var/lib/leetplus/deploy-receipts/production-control/production-control-generation-${RELEASE_SHA}.receipt.json" \
  && ! -e "$accepted_root/var/lib/leetplus/deploy-receipts/production-control/production-control-generation-${RELEASE_SHA}.intent.json" ]] \
  || die 'accepted install did not finalize the exact durable receipt state'
run_installed_verifier "$accepted_root" > "$TEST_ROOT/accepted-verify.out"
grep -F -x 'PRODUCTION_CONTROL_INSTALLED_GENERATION=PASS' \
  "$TEST_ROOT/accepted-verify.out" >/dev/null
run_installer "$accepted_root" > "$TEST_ROOT/reconciled.out"
grep -F -x 'PRODUCTION_CONTROL_INSTALL_RECONCILED=true' \
  "$TEST_ROOT/reconciled.out" >/dev/null

fault_root="$TEST_ROOT/fault-root"
prepare_fixture_root "$fault_root" "$archive"
if run_installer "$fault_root" --fixture-abort-after 5 \
  > "$TEST_ROOT/fault.out" 2>&1; then
  die 'fixture fault during install-map publication was unexpectedly accepted'
fi
grep -F 'fixture-requested interruption during install-map publication' \
  "$TEST_ROOT/fault.out" >/dev/null
[[ -f "$fault_root/var/lib/leetplus/deploy-receipts/production-control/production-control-generation-${RELEASE_SHA}.intent.json" \
  && ! -e "$fault_root/var/lib/leetplus/deploy-receipts/production-control/production-control-generation-${RELEASE_SHA}.receipt.json" ]] \
  || die 'interrupted install did not preserve exact intent without receipt'
run_installer "$fault_root" > "$TEST_ROOT/fault-recovered.out"
grep -F -x 'PRODUCTION_CONTROL_INSTALL=PASS' "$TEST_ROOT/fault-recovered.out" >/dev/null

drift_target="$accepted_root/usr/local/libexec/leetplus/verify-release-hydration-systemd.mjs"
chmod 0755 -- "$drift_target"
printf '\n// fixture drift\n' >> "$drift_target"
chmod 0555 -- "$drift_target"
if run_installed_verifier "$accepted_root" > "$TEST_ROOT/installed-drift.out" 2>&1; then
  die 'installed attestor digest drift was accepted'
fi
grep -F 'installed destination digest drift' "$TEST_ROOT/installed-drift.out" >/dev/null

receipt_drift_root="$TEST_ROOT/receipt-drift-root"
prepare_fixture_root "$receipt_drift_root" "$archive"
run_installer "$receipt_drift_root" > /dev/null
receipt="$receipt_drift_root/var/lib/leetplus/deploy-receipts/production-control/production-control-generation-${RELEASE_SHA}.receipt.json"
chmod 0600 -- "$receipt"
sed -i 's/"archiveSha256": "/"archiveSha256": "0/' "$receipt"
chmod 0400 -- "$receipt"
if run_installed_verifier "$receipt_drift_root" > "$TEST_ROOT/receipt-drift.out" 2>&1; then
  die 'installed-generation receipt pin drift was accepted'
fi
grep -F 'installed generation receipt has malformed admission digests' \
  "$TEST_ROOT/receipt-drift.out" >/dev/null

corrupt_root="$TEST_ROOT/corrupt-root"
prepare_fixture_root "$corrupt_root" "$archive"
corrupt_archive="$corrupt_root/srv/leetplus/production-control-inbox/leetplus-production-control-${RELEASE_SHA}.tar.gz"
chmod 0640 -- "$corrupt_archive"
printf 'corruption' >> "$corrupt_archive"
chmod 0440 -- "$corrupt_archive"
corrupt_digest="$(sha256_file "$corrupt_archive")"
printf '%s  %s\n' "$corrupt_digest" "$(basename -- "$corrupt_archive")" \
  > "${corrupt_archive}.sha256"
chmod 0440 -- "${corrupt_archive}.sha256"
expect_installer_rejected \
  corrupt-archive \
  "$corrupt_root" \
  'final admission receipt does not bind the exact admitted release/control archive'

symlink_root="$TEST_ROOT/symlink-root"
prepare_fixture_root "$symlink_root" "$archive"
symlink_archive="$symlink_root/srv/leetplus/production-control-inbox/leetplus-production-control-${RELEASE_SHA}.tar.gz"
mv -- "$symlink_archive" "${symlink_archive}.real"
ln -s -- "$(basename -- "${symlink_archive}.real")" "$symlink_archive"
expect_installer_rejected \
  symlink-archive \
  "$symlink_root" \
  'production-control archive is not exact regular authority mode 0440'

linked_tree="$TEST_ROOT/linked-tree"
cp -a -- "$artifact_tree" "$linked_tree"
ln -s -- 'README.md' "$linked_tree/docs/deployment/production-artifact/unlisted-link"
linked_archive="$TEST_ROOT/linked.tar.gz"
build_archive "$linked_tree" "$linked_archive"
linked_root="$TEST_ROOT/linked-root"
prepare_fixture_root "$linked_root" "$linked_archive"
expect_installer_rejected \
  linked-member \
  "$linked_root" \
  'tar member is not one link-free regular file'

map_drift_tree="$TEST_ROOT/map-drift-tree"
cp -a -- "$artifact_tree" "$map_drift_tree"
chmod 0640 -- "$map_drift_tree/$INSTALL_MAP"
printf 'docs/deployment/production-artifact/README.md\t/usr/local/share/leetplus/unreviewed\t0444\n' \
  >> "$map_drift_tree/$INSTALL_MAP"
chmod 0440 -- "$map_drift_tree/$INSTALL_MAP"
write_provenance "$map_drift_tree"
write_root_manifest "$map_drift_tree"
find "$map_drift_tree" -type f -exec chmod 0440 {} +
map_drift_archive="$TEST_ROOT/map-drift.tar.gz"
build_archive "$map_drift_tree" "$map_drift_archive"
map_drift_root="$TEST_ROOT/map-drift-root"
prepare_fixture_root "$map_drift_root" "$map_drift_archive"
expect_installer_rejected \
  map-drift \
  "$map_drift_root" \
  'shipped artifact verifier rejected the private generation'

mode_drift_root="$TEST_ROOT/mode-drift-root"
prepare_fixture_root "$mode_drift_root" "$archive"
install -d -m 0755 -- "$mode_drift_root/run/leetplus-production-control"
expect_installer_rejected \
  managed-directory-mode-drift \
  "$mode_drift_root" \
  'managed production-control directory mode drift'

printf 'production control install authority fixture: PASS\n'
