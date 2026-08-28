#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'
umask 0077

readonly RELEASE_SHA='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
readonly REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly VERIFIER="${REPOSITORY_ROOT}/docs/deployment/production-control-authority/verify-production-control-artifact.mjs"
readonly SOURCE_ALLOWLIST="${REPOSITORY_ROOT}/docs/deployment/production-control-authority/production-control-payload.allowlist"
readonly ARTIFACT_ALLOWLIST='docs/deployment/production-control-authority/production-control-payload.allowlist'
readonly INNER_MANIFEST='docs/deployment/production-artifact/CONTROL_BUNDLE_SHA256SUMS'
readonly INNER_INSTALLER='docs/deployment/production-artifact/install-legacy-rollback-contour.sh'
readonly AUTHORITY='docs/deployment/production-control-authority/leetplus-install-scheduler-free-nminus1-v1'
readonly INSTALL_AUTHORITY='docs/deployment/production-control-authority/leetplus-install-production-control-v1'
readonly INSTALL_MAP='docs/deployment/production-control-authority/production-control-install-map.tsv'
readonly INSTALLED_VERIFIER='docs/deployment/production-control-authority/verify-installed-production-control-generation.mjs'
readonly DATABASE_FENCE_AUTHORITY='docs/deployment/production-artifact/systemd/legacy-database-login-fence-authority.sql.example'
readonly FORBIDDEN_PATH='docs/deployment/production-artifact/nginx/legacy.conf.example'
readonly CLEAN_PATH='/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
readonly FIXTURE_NODE_INPUT="${LEETPLUS_FIXTURE_NODE:-$(command -v node)}"
readonly FIXTURE_NODE="$(realpath -e -- "$FIXTURE_NODE_INPUT")"
readonly TEST_ROOT="$(mktemp -d)"

die() {
  printf 'test-production-control-artifact-integrity: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  case "$TEST_ROOT" in
    /tmp/*|/private/tmp/*)
      [[ -d "$TEST_ROOT" && ! -L "$TEST_ROOT" ]] && rm -rf -- "$TEST_ROOT"
      ;;
    *)
      printf 'refusing unsafe fixture cleanup: %s\n' "$TEST_ROOT" >&2
      ;;
  esac
}
trap cleanup EXIT

for command_name in awk cp dirname grep head ln mkdir mkfifo mktemp mv realpath rm sed sort tail; do
  command -v "$command_name" >/dev/null 2>&1 \
    || die "missing fixture command: ${command_name}"
done
[[ -x /usr/bin/env ]] || die 'fixed /usr/bin/env is required'
[[ -f "$FIXTURE_NODE" && ! -L "$FIXTURE_NODE" && -x "$FIXTURE_NODE" ]] \
  || die 'fixture Node path must be an exact regular executable'
grep -F -x "$DATABASE_FENCE_AUTHORITY" "$SOURCE_ALLOWLIST" >/dev/null \
  || die 'payload allowlist omits the database login fence authority'
for required_outer_authority in "$INSTALL_AUTHORITY" "$INSTALL_MAP" "$INSTALLED_VERIFIER"; do
  grep -F -x "$required_outer_authority" "$SOURCE_ALLOWLIST" >/dev/null \
    || die "payload allowlist omits required install authority: ${required_outer_authority}"
done
[[ "$(grep -c -F "  ./systemd/${DATABASE_FENCE_AUTHORITY##*/}" \
  "${REPOSITORY_ROOT}/${INNER_MANIFEST}")" == '1' ]] \
  || die 'inner control manifest omits the database login fence authority'
[[ "$(awk -F '\t' '$1 == "docs/deployment/production-artifact/blue-green-cutover.sh" \
  && $2 == "/usr/local/sbin/leetplus-blue-green-cutover" { print $3 }' \
  "${REPOSITORY_ROOT}/${INSTALL_MAP}")" == '0500' ]] \
  || die 'production-control cutover authority mode is not exact 0500'
grep -F -x \
  'add_install_file 0500 "${source_root}/blue-green-cutover.sh" "${sbin_root}/leetplus-blue-green-cutover"' \
  "${REPOSITORY_ROOT}/${INNER_INSTALLER}" >/dev/null \
  || die 'N-1 and production-control cutover authority modes are inconsistent'

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
clean_node -e '
  const fs = require("node:fs");
  const source = fs.readFileSync(process.argv[1], "utf8");
  const authority = source.indexOf("if (requireRootAuthority) assertRootAuthority(root);");
  const firstArtifactWalk = source.indexOf("const actualFiles = walkTree(root)");
  if (authority < 0 || firstArtifactWalk < 0 || authority > firstArtifactWalk) {
    throw new Error("root authority must precede every artifact walk/read/hash");
  }
' "$VERIFIER"

sha256_file() {
  clean_node -e '
    const crypto = require("node:crypto");
    const fs = require("node:fs");
    process.stdout.write(crypto.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"));
  ' "$1"
}

node_executable_sha256() {
  clean_node -e '
    const crypto = require("node:crypto");
    const fs = require("node:fs");
    process.stdout.write(
      crypto.createHash("sha256").update(fs.readFileSync(process.execPath)).digest("hex"),
    );
  '
}

canonical_root() {
  clean_node -e \
    'process.stdout.write(require("node:fs").realpathSync.native(process.argv[1]))' \
    "$1"
}

write_root_manifest() {
  local root="$1"
  clean_node -e '
    const crypto = require("node:crypto");
    const fs = require("node:fs");
    const path = require("node:path");
    const root = fs.realpathSync.native(process.argv[1]);
    const compare = (left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right));
    const files = [];
    const walk = (directory, prefix = "") => {
      for (const name of fs.readdirSync(directory).sort(compare)) {
        const relative = prefix ? `${prefix}/${name}` : name;
        if (relative === "SHA256SUMS") continue;
        const absolute = path.join(directory, name);
        const stat = fs.lstatSync(absolute);
        if (stat.isDirectory()) walk(absolute, relative);
        else if (stat.isFile()) files.push(relative);
      }
    };
    walk(root);
    files.sort(compare);
    const lines = files.map((relative) => {
      const digest = crypto.createHash("sha256")
        .update(fs.readFileSync(path.join(root, ...relative.split("/"))))
        .digest("hex");
      return `${digest}  ./${relative}`;
    });
    fs.writeFileSync(path.join(root, "SHA256SUMS"), `${lines.join("\n")}\n`, { mode: 0o600 });
  ' "$root"
}

write_provenance() {
  local root="$1"
  local allowlist_digest inner_digest node_digest payload_count
  allowlist_digest="$(sha256_file "$root/$ARTIFACT_ALLOWLIST")"
  inner_digest="$(sha256_file "$root/$INNER_MANIFEST")"
  node_digest="$(node_executable_sha256)"
  payload_count="$(clean_node -e '
    const fs = require("node:fs");
    const lines = fs.readFileSync(process.argv[1], "utf8").slice(0, -1).split("\n");
    process.stdout.write(String(lines.length));
  ' "$root/$ARTIFACT_ALLOWLIST")"
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

make_artifact() {
  local root="$1"
  local listed_path source_path target_path
  mkdir -p -- "$root"
  while IFS= read -r listed_path; do
    [[ -n "$listed_path" ]] || die 'source allowlist contains an empty line'
    source_path="${REPOSITORY_ROOT}/${listed_path}"
    target_path="${root}/${listed_path}"
    [[ -f "$source_path" && ! -L "$source_path" ]] \
      || die "allowlisted source is absent or linked: ${listed_path}"
    mkdir -p -- "$(dirname -- "$target_path")"
    cp -- "$source_path" "$target_path"
  done < "$SOURCE_ALLOWLIST"
  write_provenance "$root"
  write_root_manifest "$root"
}

verify_artifact() {
  local root="$1"
  clean_node "$VERIFIER" \
    --artifact-root "$(canonical_root "$root")" \
    --expected-release-sha "$RELEASE_SHA"
}

expect_rejected() {
  local label="$1"
  local root="$2"
  local expected_message="$3"
  if verify_artifact "$root" > "${TEST_ROOT}/${label}.out" 2>&1; then
    die "adversarial production control artifact was accepted: ${label}"
  fi
  grep -F -- "$expected_message" "${TEST_ROOT}/${label}.out" >/dev/null \
    || { printf '%s rejection output:\n' "$label" >&2; sed -n '1,40p' "${TEST_ROOT}/${label}.out" >&2; exit 1; }
}

accepted_root="${TEST_ROOT}/accepted"
make_artifact "$accepted_root"
verify_artifact "$accepted_root" > "${TEST_ROOT}/accepted.out"
grep -F -x 'PRODUCTION_CONTROL_ARTIFACT_INTEGRITY=PASS' \
  "${TEST_ROOT}/accepted.out" >/dev/null
grep -F -x "PRODUCTION_CONTROL_RELEASE_SHA=${RELEASE_SHA}" \
  "${TEST_ROOT}/accepted.out" >/dev/null
grep -F -x 'PRODUCTION_CONTROL_PAYLOAD_FILE_COUNT=58' \
  "${TEST_ROOT}/accepted.out" >/dev/null
grep -F -x "PRODUCTION_CONTROL_NODE_SHA256=$(node_executable_sha256)" \
  "${TEST_ROOT}/accepted.out" >/dev/null
grep -F -x \
  'PRODUCTION_CONTROL_INNER_MANIFEST_SHA256=527e76991ce50639c3ceb30e310ed9be979f8c9017a1eba537e047c86feae483' \
  "${TEST_ROOT}/accepted.out" >/dev/null
if clean_node "$VERIFIER" \
  --artifact-root "$(canonical_root "$accepted_root")" \
  --expected-release-sha "$RELEASE_SHA" \
  --require-root-authority \
  > "${TEST_ROOT}/non-authoritative-root.out" 2>&1; then
  die 'ordinary writable fixture tree was accepted as root authority'
fi

extra_root="${TEST_ROOT}/extra"
cp -a -- "$accepted_root" "$extra_root"
printf 'unlisted extra\n' > "$extra_root/unlisted-control-byte"
write_root_manifest "$extra_root"
expect_rejected \
  extra \
  "$extra_root" \
  'payload allowlist versus artifact tree path set is not exact; unexpected=unlisted-control-byte'

missing_root="${TEST_ROOT}/missing"
cp -a -- "$accepted_root" "$missing_root"
rm -- "$missing_root/docs/deployment/production-artifact/README.md"
write_root_manifest "$missing_root"
expect_rejected \
  missing \
  "$missing_root" \
  'payload allowlist versus artifact tree path set is not exact; missing=docs/deployment/production-artifact/README.md'

oversized_root="${TEST_ROOT}/oversized"
cp -a -- "$accepted_root" "$oversized_root"
clean_node -e '
  const fs = require("node:fs");
  const descriptor = fs.openSync(process.argv[1], "w", 0o600);
  try {
    fs.writeSync(descriptor, Buffer.alloc(17 * 1024 * 1024, 0x61));
  } finally {
    fs.closeSync(descriptor);
  }
' "$oversized_root/unlisted-oversized-byte"
write_root_manifest "$oversized_root"
expect_rejected \
  oversized \
  "$oversized_root" \
  'root SHA256SUMS target unlisted-oversized-byte exceeds the bounded regular-file size'

retargeted_root="${TEST_ROOT}/retargeted-inner-member"
cp -a -- "$accepted_root" "$retargeted_root"
readme_digest="$(sha256_file "$retargeted_root/docs/deployment/production-artifact/README.md")"
{
  printf '%s  ./README.md\n' "$readme_digest"
  tail -n +2 "$retargeted_root/$INNER_MANIFEST"
} > "$retargeted_root/$INNER_MANIFEST.new"
mv -- "$retargeted_root/$INNER_MANIFEST.new" "$retargeted_root/$INNER_MANIFEST"
retargeted_inner_digest="$(sha256_file "$retargeted_root/$INNER_MANIFEST")"
sed -E -i \
  "s/(EXPECTED_CONTROL_MANIFEST_SHA256=')[0-9a-f]{64}(')/\\1${retargeted_inner_digest}\\2/" \
  "$retargeted_root/$AUTHORITY"
write_provenance "$retargeted_root"
write_root_manifest "$retargeted_root"
expect_rejected \
  retargeted-inner-member \
  "$retargeted_root" \
  'inner control manifest path set is not exact; unexpected=README.md; missing=activate-legacy-rollback-contour.sh'

pin_drift_root="${TEST_ROOT}/pin-drift"
cp -a -- "$accepted_root" "$pin_drift_root"
sed -E -i \
  "s/(EXPECTED_CONTROL_MANIFEST_SHA256=')[0-9a-f]{64}(')/\\1$(printf '0%.0s' {1..64})\\2/" \
  "$pin_drift_root/$AUTHORITY"
write_root_manifest "$pin_drift_root"
expect_rejected \
  pin-drift \
  "$pin_drift_root" \
  'control authority launcher manifest pin does not match the inner manifest'

forbidden_root="${TEST_ROOT}/forbidden"
cp -a -- "$accepted_root" "$forbidden_root"
cp -- "${REPOSITORY_ROOT}/${FORBIDDEN_PATH}" "$forbidden_root/$FORBIDDEN_PATH"
printf '%s\n' "$FORBIDDEN_PATH" >> "$forbidden_root/$ARTIFACT_ALLOWLIST"
LC_ALL=C sort -o \
  "$forbidden_root/$ARTIFACT_ALLOWLIST" \
  "$forbidden_root/$ARTIFACT_ALLOWLIST"
write_provenance "$forbidden_root"
write_root_manifest "$forbidden_root"
expect_rejected \
  forbidden \
  "$forbidden_root" \
  "payload contains an explicitly forbidden path: ${FORBIDDEN_PATH}"

duplicate_allowlist_root="${TEST_ROOT}/duplicate-allowlist"
cp -a -- "$accepted_root" "$duplicate_allowlist_root"
head -n 1 "$duplicate_allowlist_root/$ARTIFACT_ALLOWLIST" \
  >> "$duplicate_allowlist_root/$ARTIFACT_ALLOWLIST"
write_root_manifest "$duplicate_allowlist_root"
expect_rejected \
  duplicate-allowlist \
  "$duplicate_allowlist_root" \
  'payload allowlist contains a duplicate path'

unsorted_allowlist_root="${TEST_ROOT}/unsorted-allowlist"
cp -a -- "$accepted_root" "$unsorted_allowlist_root"
{
  sed -n '2p' "$accepted_root/$ARTIFACT_ALLOWLIST"
  sed -n '1p' "$accepted_root/$ARTIFACT_ALLOWLIST"
  tail -n +3 "$accepted_root/$ARTIFACT_ALLOWLIST"
} > "$unsorted_allowlist_root/$ARTIFACT_ALLOWLIST"
write_root_manifest "$unsorted_allowlist_root"
expect_rejected \
  unsorted-allowlist \
  "$unsorted_allowlist_root" \
  'payload allowlist paths are not in canonical byte order'

duplicate_manifest_root="${TEST_ROOT}/duplicate-root-manifest"
cp -a -- "$accepted_root" "$duplicate_manifest_root"
head -n 1 "$duplicate_manifest_root/SHA256SUMS" \
  >> "$duplicate_manifest_root/SHA256SUMS"
expect_rejected \
  duplicate-root-manifest \
  "$duplicate_manifest_root" \
  'root SHA256SUMS contains a duplicate path'

unsorted_manifest_root="${TEST_ROOT}/unsorted-root-manifest"
cp -a -- "$accepted_root" "$unsorted_manifest_root"
{
  sed -n '2p' "$accepted_root/SHA256SUMS"
  sed -n '1p' "$accepted_root/SHA256SUMS"
  tail -n +3 "$accepted_root/SHA256SUMS"
} > "$unsorted_manifest_root/SHA256SUMS"
expect_rejected \
  unsorted-root-manifest \
  "$unsorted_manifest_root" \
  'root SHA256SUMS paths are not in canonical byte order'

traversal_root="${TEST_ROOT}/traversal"
cp -a -- "$accepted_root" "$traversal_root"
printf '%064d  ./../outside\n' 0 >> "$traversal_root/SHA256SUMS"
expect_rejected \
  traversal \
  "$traversal_root" \
  'root SHA256SUMS path has an unsafe component'

corrupt_root="${TEST_ROOT}/digest-corruption"
cp -a -- "$accepted_root" "$corrupt_root"
printf 'digest corruption\n' >> "$corrupt_root/docs/deployment/production-artifact/README.md"
expect_rejected \
  digest-corruption \
  "$corrupt_root" \
  'root SHA256SUMS digest mismatch: docs/deployment/production-artifact/README.md'

symlink_root="${TEST_ROOT}/symlink"
cp -a -- "$accepted_root" "$symlink_root"
if ln -s -- 'README.md' \
  "$symlink_root/docs/deployment/production-artifact/adversarial-link" 2>/dev/null \
  && [[ -L "$symlink_root/docs/deployment/production-artifact/adversarial-link" ]]; then
  expect_rejected \
    symlink \
    "$symlink_root" \
    'artifact entry is not a regular file: docs/deployment/production-artifact/adversarial-link'
fi

hardlink_root="${TEST_ROOT}/hardlink"
cp -a -- "$accepted_root" "$hardlink_root"
if ln -- \
  "$hardlink_root/docs/deployment/production-artifact/README.md" \
  "$hardlink_root/docs/deployment/production-artifact/adversarial-hardlink" 2>/dev/null; then
  expect_rejected \
    hardlink \
    "$hardlink_root" \
    'artifact regular file has shared hardlinks'
fi

special_root="${TEST_ROOT}/special"
cp -a -- "$accepted_root" "$special_root"
if [[ "$(clean_node -p 'process.platform')" == 'linux' ]] \
  && mkfifo -- "$special_root/docs/deployment/production-artifact/adversarial-fifo" 2>/dev/null \
  && [[ -p "$special_root/docs/deployment/production-artifact/adversarial-fifo" ]]; then
  expect_rejected \
    special \
    "$special_root" \
    'artifact entry is not a regular file: docs/deployment/production-artifact/adversarial-fifo'
fi

symlink_target="${TEST_ROOT}/symlink-ancestor-target"
symlink_alias="${TEST_ROOT}/symlink-ancestor-alias"
mkdir -p -- "$symlink_target"
cp -a -- "$accepted_root" "$symlink_target/artifact"
if ln -s -- "$symlink_target" "$symlink_alias" 2>/dev/null \
  && [[ -L "$symlink_alias" ]]; then
  if clean_node "$VERIFIER" \
    --artifact-root "$symlink_alias/artifact" \
    --expected-release-sha "$RELEASE_SHA" \
    > "${TEST_ROOT}/symlink-ancestor.out" 2>&1; then
    die 'artifact under a symlinked ancestor was unexpectedly accepted'
  fi
  grep -F \
    'artifact root and every ancestor must be canonical and symlink-free' \
    "${TEST_ROOT}/symlink-ancestor.out" >/dev/null
fi

wrong_release_root="${TEST_ROOT}/wrong-release"
cp -a -- "$accepted_root" "$wrong_release_root"
if clean_node "$VERIFIER" \
  --artifact-root "$(canonical_root "$wrong_release_root")" \
  --expected-release-sha 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' \
  > "${TEST_ROOT}/wrong-release.out" 2>&1; then
  die 'artifact with mismatched release provenance was unexpectedly accepted'
fi
grep -F \
  'production control provenance is not the exact canonical expected record' \
  "${TEST_ROOT}/wrong-release.out" >/dev/null

malformed_node_root="${TEST_ROOT}/malformed-node-digest"
cp -a -- "$accepted_root" "$malformed_node_root"
clean_node -e '
  const fs = require("node:fs");
  const target = `${process.argv[1]}/production-control-provenance.json`;
  const record = JSON.parse(fs.readFileSync(target, "utf8"));
  record.nodeExecutableSha256 = "not-a-sha256";
  fs.writeFileSync(target, `${JSON.stringify(record, null, 2)}\n`);
' "$malformed_node_root"
write_root_manifest "$malformed_node_root"
expect_rejected \
  malformed-node-digest \
  "$malformed_node_root" \
  'production control provenance has no exact Node executable digest'

printf 'production control artifact integrity fixture: PASS\n'
