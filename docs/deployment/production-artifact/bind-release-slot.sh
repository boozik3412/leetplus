#!/usr/bin/bash -p
#
# Root-authoritative, receipt-bound publication of one immutable release into a
# blue/green runtime slot. This script changes only one slot symlink and its
# protected journal. It never starts/stops systemd, changes nginx or touches a
# database.

[[ "$-" == *p* ]] || {
  printf 'bind-release-slot: execute the installed script directly with its privileged Bash shebang\n' >&2
  exit 1
}
while IFS= read -r inherited_environment_name; do
  unset "$inherited_environment_name" 2>/dev/null || true
done < <(compgen -e)
PATH='/usr/sbin:/usr/bin:/sbin:/bin'
LANG='C.UTF-8'
LC_ALL='C.UTF-8'
TZ='UTC'
export PATH LANG LC_ALL TZ

set -euo pipefail
IFS=$'\n\t'
umask 0077

readonly RELEASE_SHA_PATTERN='^[0-9a-f]{40}$'
readonly SLOT_PATTERN='^(blue|green)$'
readonly OPERATION_ID_PATTERN='^[0-9]{8}T[0-9]{6}\.[0-9]{9}Z-[0-9]+$'

die() {
  printf 'bind-release-slot: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage:
  bind-release-slot.sh bind \
    --slot blue|green \
    --release-sha <40-lowercase-hex>

  bind-release-slot.sh reconcile --slot blue|green

  bind-release-slot.sh rollback \
    --receipt /var/lib/leetplus/deploy-receipts/slot-links/<bind-receipt>

Production execution is Linux/root-only. The helper accepts only exact sealed
/srv/leetplus/releases/<SHA> targets and atomically controls only
/srv/leetplus/slots/blue|green. A slot is changed only while both matching API
and Web units are inactive or failed; there is no operator override. A lost
response is continued only with `reconcile`; rollback accepts only an exact
receipt emitted by this helper.
USAGE
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command is unavailable: $1"
}

record_value() {
  local record="$1"
  local key="$2"
  local count
  local value
  count="$(awk -F= -v key="$key" '$1 == key { count += 1 } END { print count + 0 }' "$record")"
  [[ "$count" == '1' ]] || return 1
  value="$(awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print }' "$record")"
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || return 1
  printf '%s' "$value"
}

assert_record_schema() {
  local record="$1"
  local expected_kind="$2"
  awk -F= -v expected_kind="$expected_kind" '
    function common(key) {
      return key == "RECORD_VERSION" || key == "RECORD_KIND" || key == "OPERATION" ||
        key == "OPERATION_ID" || key == "SLOT" || key == "REQUESTED_RELEASE_SHA" ||
        key == "REQUESTED_TARGET" || key == "REQUESTED_SHA256SUMS_SHA256" ||
        key == "REQUESTED_HYDRATED_SHA256SUMS_SHA256" || key == "REQUESTED_SYMLINK_MANIFEST_SHA256" ||
        key == "REQUESTED_PROVENANCE_SHA256" || key == "REQUESTED_HYDRATION_ATTESTATION_SHA256" ||
        key == "PRIOR_STATE" || key == "PRIOR_RELEASE_SHA" || key == "PRIOR_TARGET" ||
        key == "PRIOR_SHA256SUMS_SHA256" || key == "PRIOR_HYDRATED_SHA256SUMS_SHA256" ||
        key == "PRIOR_SYMLINK_MANIFEST_SHA256" ||
        key == "PRIOR_PROVENANCE_SHA256" || key == "PRIOR_HYDRATION_ATTESTATION_SHA256" ||
        key == "SOURCE_RECEIPT_SHA256" ||
        key == "ACTIVE_SLOT_SAFE_MODE" || key == "CREATED_AT";
    }
    !/^[A-Z0-9_]+=[^\r\n]*$/ { exit 1 }
    {
      key = $1;
      if (seen[key]++) exit 1;
      if (!common(key) && !(expected_kind == "SLOT_LINK_RECEIPT" &&
        (key == "INTENT_SHA256" || key == "EFFECT_STATE" || key == "ACCEPTED_AT"))) exit 1;
      count += 1;
    }
    END {
      expected_count = expected_kind == "SLOT_LINK_INTENT" ? 23 : 26;
      if (count != expected_count) exit 1;
      for (key in seen) {
        if (key == "RECORD_KIND" && seen[key] != 1) exit 1;
      }
    }
  ' "$record" || die 'journal record has a malformed or non-canonical schema'
}

assert_latest_record_schema() {
  local record="$1"
  awk -F= '
    function allowed(key) {
      return key == "RECORD_VERSION" || key == "RECORD_KIND" || key == "SLOT" ||
        key == "OPERATION_ID" || key == "RECEIPT_PATH" || key == "RECEIPT_SHA256" ||
        key == "UPDATED_AT";
    }
    !/^[A-Z0-9_]+=[^\r\n]*$/ { exit 1 }
    {
      if (!allowed($1) || seen[$1]++) exit 1;
      count += 1;
    }
    END { if (count != 7) exit 1 }
  ' "$record" || die 'latest-receipt index schema is invalid'
}

publish_record_exclusive() {
  local final_path="$1"
  local generator="$2"
  local temporary_path="${final_path}.new.$$"
  local record_fd

  [[ ! -e "$final_path" && ! -L "$final_path" ]] || die "journal record already exists: ${final_path}"
  [[ ! -e "$temporary_path" && ! -L "$temporary_path" ]] || die 'journal temporary path already exists'

  set -o noclobber
  exec {record_fd}> "$temporary_path" || die 'cannot create journal temporary record exclusively'
  set +o noclobber
  "$generator" >&"$record_fd"
  exec {record_fd}>&-
  chmod 0600 -- "$temporary_path"
  sync -f "$temporary_path"

  # link(2) publication is O_EXCL: `ln` cannot replace an existing receipt or
  # intent. A crash after this point leaves a complete durable final record.
  ln -T -- "$temporary_path" "$final_path" || die 'cannot publish journal record exclusively'
  sync -d "$(dirname -- "$final_path")"
  if [[ "$fixture_mode" == true ]]; then
    if [[ "$fixture_abort_after_intent_record_link" == true && "$final_path" == *.intent ]]; then
      printf 'bind-release-slot: fixture interruption after exclusive intent publication\n' >&2
      exit 87
    fi
    if [[ "$fixture_abort_after_receipt_record_link" == true && "$final_path" == *.receipt ]]; then
      printf 'bind-release-slot: fixture interruption after exclusive receipt publication\n' >&2
      exit 88
    fi
  fi
  rm -- "$temporary_path"
  sync -d "$(dirname -- "$final_path")"
}

remove_completed_intent() {
  local intent_path="$1"
  rm -- "$intent_path"
  sync -d "$state_root"
}

normalize_exclusive_publication() {
  local final_path="$1"
  local final_identity
  local link_count
  local candidate
  local candidate_identity
  local matching_temporary=''
  local matching_count=0

  [[ -f "$final_path" && ! -L "$final_path" ]] || die 'published journal record is absent or unsafe'
  link_count="$(stat -c '%h' -- "$final_path")"
  [[ "$link_count" == '1' || "$link_count" == '2' ]] || die 'published journal record has an unsafe link count'
  [[ "$link_count" == '2' ]] || return 0

  final_identity="$(stat -c '%d:%i' -- "$final_path")"
  while IFS= read -r -d '' candidate; do
    candidate_identity="$(stat -c '%d:%i' -- "$candidate")"
    if [[ "$candidate_identity" == "$final_identity" ]]; then
      matching_temporary="$candidate"
      matching_count=$((matching_count + 1))
    fi
  done < <(find -P "$state_root" -maxdepth 1 -type f \
    -name "$(basename -- "$final_path").new.*" -print0)
  ((matching_count == 1)) || die 'cannot reconcile an incomplete exclusive journal publication'
  [[ "$(stat -c '%u:%g:%a:%h' -- "$matching_temporary")" == '0:0:600:2' ]] \
    || die 'journal publication temporary alias is unsafe'
  rm -- "$matching_temporary"
  sync -d "$state_root"
  [[ "$(stat -c '%h' -- "$final_path")" == '1' ]] || die 'journal publication normalization did not persist'
}

cleanup_unpublished_journal_temporaries() {
  local candidate
  local candidate_name
  local final_path
  local candidate_identity
  local final_identity
  local removed=false
  while IFS= read -r -d '' candidate; do
    candidate_name="$(basename -- "$candidate")"
    [[ "$candidate_name" =~ ^(blue|green)-[0-9]{8}T[0-9]{6}\.[0-9]{9}Z-[0-9]+\.(bind|rollback)\.(intent|receipt)\.new\.[0-9]+$ \
      || "$candidate_name" =~ ^(blue|green)\.latest\.new\.[0-9]+$ ]] \
      || die 'protected journal contains an unrecognized publication temporary'
    [[ -f "$candidate" && ! -L "$candidate" \
      && "$(stat -c '%u:%g:%a' -- "$candidate")" == '0:0:600' ]] \
      || die 'journal publication temporary is unsafe'
    final_path="${candidate%.new.*}"
    if [[ -e "$final_path" || -L "$final_path" ]]; then
      [[ -f "$final_path" && ! -L "$final_path" ]] || die 'journal publication target is unsafe'
      candidate_identity="$(stat -c '%d:%i' -- "$candidate")"
      final_identity="$(stat -c '%d:%i' -- "$final_path")"
      if [[ "$candidate_identity" == "$final_identity" ]]; then
        normalize_exclusive_publication "$final_path"
        removed=true
        continue
      fi
    fi
    [[ "$(stat -c '%h' -- "$candidate")" == '1' ]] \
      || die 'unpublished journal temporary has an unsafe link count'
    rm -- "$candidate"
    removed=true
  done < <(find -P "$state_root" -maxdepth 1 -name '*.new.*' -print0)
  if [[ "$removed" == true ]]; then
    sync -d "$state_root"
  fi
}

assert_root_controlled_directory() {
  local path="$1"
  [[ -d "$path" && ! -L "$path" ]] || die "protected directory is absent or unsafe: ${path}"
  [[ "$(stat -c '%u:%g' -- "$path")" == '0:0' ]] || die "protected directory is not root:root: ${path}"
  [[ -z "$(find -P "$path" -maxdepth 0 -perm /022 -print -quit)" ]] \
    || die "protected directory is group/other-writable: ${path}"
}

assert_production_ancestors() {
  local path
  for path in / /srv /srv/leetplus "$release_root" "$slot_root" /var /var/lib /var/lib/leetplus /var/lib/leetplus/deploy-receipts "$state_root"; do
    assert_root_controlled_directory "$path"
  done
}

assert_installed_authority() {
  local installed_path='/usr/local/sbin/leetplus-bind-release-slot'
  local ancestor
  [[ "${BASH_SOURCE[0]}" == "$installed_path" ]] \
    || die 'production slot-link authority must run from its exact installed path'
  [[ -f "$installed_path" && ! -L "$installed_path" && -x "$installed_path" \
    && "$(realpath -e -- "$installed_path")" == "$installed_path" \
    && "$(stat -c '%u:%g' -- "$installed_path")" == '0:0' \
    && -z "$(find -P "$installed_path" -maxdepth 0 -perm /022 -print -quit)" ]] \
    || die 'installed slot-link authority is not a trusted root executable'
  ancestor="$(dirname -- "$installed_path")"
  while :; do
    assert_root_controlled_directory "$ancestor"
    [[ "$ancestor" == '/' ]] && break
    ancestor="$(dirname -- "$ancestor")"
  done
}

assert_fixture_root() {
  [[ "$fixture_root" =~ ^/tmp/leetplus-slot-link-fixture\.[A-Za-z0-9_-]+$ ]] \
    || die 'fixture root must be an exact /tmp/leetplus-slot-link-fixture.* path'
  [[ -d "$fixture_root" && ! -L "$fixture_root" ]] || die 'fixture root is absent or unsafe'
  [[ "$(stat -c '%u:%g:%a' -- "$fixture_root")" == '0:0:755' ]] \
    || die 'fixture root must be root:root mode 0755'
  for path in "$fixture_root/srv" "$fixture_root/srv/leetplus" "$release_root" "$slot_root" \
    "$fixture_root/var" "$fixture_root/var/lib" "$fixture_root/var/lib/leetplus" \
    "$fixture_root/var/lib/leetplus/deploy-receipts" "$state_root"; do
    assert_root_controlled_directory "$path"
  done
}

validate_hydration_attestation() {
  local sha="$1"
  local release_directory="$2"
  local record="${hydration_receipt_root}/release-hydration-attestation-${sha}.receipt"
  local digest_key digest_value
  local invocation_id source_receipt_sha256 hydrated_manifest_sha256

  [[ -f "$record" && ! -L "$record" \
    && "$(realpath -e -- "$record")" == "$record" \
    && "$(stat -c '%u:%g:%a:%h' -- "$record")" == '0:0:400:1' ]] \
    || die 'release has no exact root-only hydration attestation receipt'
  awk -F= '
    BEGIN {
      split("RECORD_VERSION RELEASE_SHA RELEASE_SLOT HYDRATION_INVOCATION_ID HYDRATION_SOURCE_RECEIPT_SHA256 HYDRATION_UNIT_SHA256 HYDRATION_STAGER_SHA256 HYDRATION_POLICY_SHA256 HYDRATED_MANIFEST_SHA256 RELEASE_DIRECTORY PUBLICATION_AUTHORIZED RUNTIME_SWITCHED", expected, " ")
    }
    !/^[A-Z0-9_]+=[^\r\n]*$/ { exit 1 }
    { if ($1 != expected[NR] || seen[$1]++) exit 1 }
    END { if (NR != 12) exit 1 }
  ' "$record" || die 'release hydration attestation schema is not canonical'
  [[ "$(record_value "$record" RECORD_VERSION)" == '1' \
    && "$(record_value "$record" RELEASE_SHA)" == "$sha" \
    && "$(record_value "$record" RELEASE_SLOT)" == "$slot" \
    && "$(record_value "$record" RELEASE_DIRECTORY)" == "$release_directory" \
    && "$(record_value "$record" PUBLICATION_AUTHORIZED)" == 'true' \
    && "$(record_value "$record" RUNTIME_SWITCHED)" == 'false' ]] \
    || die 'release hydration attestation authority values are invalid'
  invocation_id="$(record_value "$record" HYDRATION_INVOCATION_ID)" \
    || die 'release hydration invocation identity is absent'
  [[ "$invocation_id" =~ ^[0-9a-f]{32}$ ]] \
    || die 'release hydration invocation identity is invalid'
  for digest_key in HYDRATION_SOURCE_RECEIPT_SHA256 HYDRATION_UNIT_SHA256 \
    HYDRATION_STAGER_SHA256 HYDRATION_POLICY_SHA256 HYDRATED_MANIFEST_SHA256; do
    digest_value="$(record_value "$record" "$digest_key")" \
      || die 'release hydration attestation digest is absent'
    [[ "$digest_value" =~ ^[0-9a-f]{64}$ ]] \
      || die 'release hydration attestation digest is invalid'
  done
  source_receipt_sha256="$(sha256sum -- "$release_directory/HYDRATION_SANDBOX_RECEIPT" | awk '{ print $1 }')"
  hydrated_manifest_sha256="$(sha256sum -- "$release_directory/HYDRATED_SHA256SUMS" | awk '{ print $1 }')"
  [[ "$(record_value "$record" HYDRATION_SOURCE_RECEIPT_SHA256)" == "$source_receipt_sha256" \
    && "$(record_value "$record" HYDRATED_MANIFEST_SHA256)" == "$hydrated_manifest_sha256" \
    && "$(record_value "$record" HYDRATION_INVOCATION_ID)" == \
      "$(record_value "$release_directory/HYDRATION_SANDBOX_RECEIPT" INVOCATION_ID)" ]] \
    || die 'release hydration attestation is not bound to the exact artifact evidence'
  validated_release_hydration_attestation_sha256="$(sha256sum -- "$record" | awk '{ print $1 }')"
}

validate_release() {
  local sha="$1"
  local expected_directory="${release_root}/${sha}"
  local actual_directory
  local runtime_cache_mount
  local special_entry
  local shared_inode
  local unexpected_owner
  local unexpected_group
  local writable_entry
  local link_path
  local link_target
  local service_user

  [[ "$sha" =~ $RELEASE_SHA_PATTERN ]] || die 'release record contains an invalid SHA'
  [[ -d "$expected_directory" && ! -L "$expected_directory" ]] || die "exact release is absent or unsafe: ${sha}"
  actual_directory="$(realpath -e -- "$expected_directory")"
  [[ "$actual_directory" == "$expected_directory" ]] || die 'release path traverses a symlink'
  [[ "$(basename -- "$actual_directory")" == "$sha" && "$(dirname -- "$actual_directory")" == "$release_root" ]] \
    || die 'release target is outside the exact release root'
  [[ "$(stat -c '%d' -- "$actual_directory")" == "$(stat -c '%d' -- "$release_root")" \
    && "$(stat -c '%d' -- "$actual_directory")" == "$(stat -c '%d' -- "$slot_root")" ]] \
    || die 'exact release and slot roots are not on the same filesystem'
  awk -v release="$actual_directory" '
    $5 == release || index($5, release "/") == 1 { found = 1 }
    END { exit found ? 1 : 0 }
  ' /proc/self/mountinfo || die 'sealed release contains an exact or nested mountpoint'

  runtime_cache_mount="${actual_directory}/apps/web/.next/cache"
  [[ -d "$runtime_cache_mount" && ! -L "$runtime_cache_mount" ]] \
    || die 'release Web cache placeholder is absent or unsafe'

  for relative_path in \
    SHA256SUMS HYDRATED_SHA256SUMS HYDRATED_SYMLINKS.json HYDRATION_SANDBOX_RECEIPT release-provenance.json \
    apps/api/dist/main.js apps/api/dist/config/validate-production-environment.cli.js \
    apps/web/.next/BUILD_ID; do
    [[ -f "${actual_directory}/${relative_path}" && ! -L "${actual_directory}/${relative_path}" ]] \
      || die "sealed release is missing a required regular file: ${relative_path}"
  done
  [[ -d "${actual_directory}/apps/web/.next/static" && ! -L "${actual_directory}/apps/web/.next/static" ]] \
    || die 'sealed release is missing Web static assets'

  special_entry="$(find -P "$actual_directory" -xdev ! -type d ! -type f ! -type l -print -quit)"
  [[ -z "$special_entry" ]] || die 'sealed release contains a special filesystem entry'
  shared_inode="$(find -P "$actual_directory" -xdev -type f -links +1 -print -quit)"
  [[ -z "$shared_inode" ]] || die 'sealed release contains a multiply-linked regular file'

  while IFS= read -r -d '' link_path; do
    link_target="$(realpath -e -- "$link_path")" || die 'sealed release contains a dangling symlink'
    case "$link_target" in
      "$actual_directory"|"$actual_directory"/*) ;;
      *) die 'sealed release contains a symlink escaping the release' ;;
    esac
  done < <(find -P "$actual_directory" -xdev -type l -print0)

  unexpected_owner="$(find -P "$actual_directory" -xdev \
    \( -type d -o -type f -o -type l \) ! -user root -print -quit)"
  [[ -z "$unexpected_owner" ]] || die 'sealed release contains a non-root-owned entry'
  writable_entry="$(find -P "$actual_directory" -xdev \
    \( -type d -o -type f \) -perm /022 -print -quit)"
  [[ -z "$writable_entry" ]] || die 'sealed release is group/other-writable'

  if [[ "$fixture_mode" == false ]]; then
    getent group leetplus-runtime >/dev/null || die 'leetplus-runtime group is absent'
    unexpected_group="$(find -P "$actual_directory" -xdev \
      \( -type d -o -type f -o -type l \) ! -group leetplus-runtime -print -quit)"
    [[ -z "$unexpected_group" ]] || die 'sealed release group is not leetplus-runtime'
  fi

  # sha256sum(1) proves only the entries it was given. The authority must also
  # prove that both manifests have one canonical safe path-set and that the
  # hydrated manifest covers the complete sealed regular-file tree. Node is an
  # already pinned production runtime and lets this check avoid lossy shell
  # word splitting while retaining sha256sum for the content verification.
  if ! "$node_binary" - "$actual_directory" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const [releaseRoot] = process.argv.slice(2);
const shaManifestName = 'SHA256SUMS';
const hydratedManifestName = 'HYDRATED_SHA256SUMS';
const symlinkManifestName = 'HYDRATED_SYMLINKS.json';
const mutableCache = 'apps/web/.next/cache';
const compareUtf8Bytes = (left, right) =>
  Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));

function fail(message) {
  throw new Error(message);
}

function exactMode(stat) {
  return Number(stat.mode & 0o7777n);
}

const releaseStat = fs.lstatSync(releaseRoot, { bigint: true });
if (!releaseStat.isDirectory() || exactMode(releaseStat) !== 0o550) {
  fail('sealed release root mode must be exactly 0550');
}
const releaseDevice = releaseStat.dev;
const actualRegularPaths = new Set();
const actualSymlinks = [];

function assertCanonicalComponents(relativePath) {
  const components = relativePath.split('/');
  if (
    components.length === 0 ||
    components.some((component) =>
      component.length === 0 ||
      component === '.' ||
      component === '..' ||
      component !== component.normalize('NFC') ||
      /[\\\u0000-\u001f\u007f]/u.test(component)
    )
  ) {
    fail(`release path is not canonical: ${relativePath}`);
  }
}

function walk(directory, relativeDirectory = '') {
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => compareUtf8Bytes(left.name, right.name));
  for (const entry of entries) {
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
    assertCanonicalComponents(relativePath);
    const absolutePath = path.join(releaseRoot, ...relativePath.split('/'));
    const stat = fs.lstatSync(absolutePath, { bigint: true });
    if (stat.dev !== releaseDevice) fail(`release entry crosses a filesystem boundary: ${relativePath}`);
    if (stat.isDirectory()) {
      if (exactMode(stat) !== 0o550) fail(`sealed directory mode is not exactly 0550: ${relativePath}`);
      if (relativePath === mutableCache) {
        if (fs.readdirSync(absolutePath).length !== 0) fail('mutable Web cache placeholder is not empty');
        continue;
      }
      walk(absolutePath, relativePath);
      continue;
    }
    if (stat.isFile()) {
      const mode = exactMode(stat);
      if (mode !== 0o440 && mode !== 0o550) {
        fail(`sealed regular-file mode is not exactly 0440 or 0550: ${relativePath}`);
      }
      if (relativePath !== hydratedManifestName) actualRegularPaths.add(`./${relativePath}`);
      continue;
    }
    if (stat.isSymbolicLink()) {
      const target = fs.readlinkSync(absolutePath, 'utf8');
      if (
        target.length === 0 ||
        target !== target.normalize('NFC') ||
        path.posix.isAbsolute(target) ||
        path.posix.normalize(target) !== target ||
        /[\\\u0000-\u001f\u007f]/u.test(target)
      ) fail(`sealed symlink target is not canonical: ${relativePath}`);
      const resolved = fs.realpathSync.native(absolutePath);
      if (resolved !== releaseRoot && !resolved.startsWith(`${releaseRoot}${path.sep}`)) {
        fail(`sealed symlink escapes the release: ${relativePath}`);
      }
      actualSymlinks.push({ path: relativePath, target });
      continue;
    }
    fail(`sealed release contains a non-canonical entry type: ${relativePath}`);
  }
}

walk(releaseRoot);

function parseManifest(manifestName) {
  const manifestPath = path.join(releaseRoot, manifestName);
  const text = fs.readFileSync(manifestPath, 'utf8');
  if (!text.endsWith('\n') || text.includes('\r') || text.slice(0, -1).includes('\n\n')) {
    fail(`${manifestName} does not have canonical LF records`);
  }
  const lines = text.slice(0, -1).split('\n');
  if (lines.length === 0 || lines.some((line) => line.length === 0)) fail(`${manifestName} is empty or sparse`);
  const paths = [];
  const seen = new Set();
  for (const line of lines) {
    const match = /^([0-9a-f]{64})  (\.\/.+)$/u.exec(line);
    if (!match) fail(`${manifestName} contains a malformed or non-canonical record`);
    const manifestPathValue = match[2];
    const relativePath = manifestPathValue.slice(2);
    assertCanonicalComponents(relativePath);
    if (seen.has(manifestPathValue)) fail(`${manifestName} contains a duplicate path: ${manifestPathValue}`);
    seen.add(manifestPathValue);
    const absolutePath = path.join(releaseRoot, ...relativePath.split('/'));
    const stat = fs.lstatSync(absolutePath, { bigint: true });
    if (!stat.isFile()) fail(`${manifestName} entry is not a regular file: ${manifestPathValue}`);
    if (stat.dev !== releaseDevice) fail(`${manifestName} entry crosses a filesystem boundary: ${manifestPathValue}`);
    if (fs.realpathSync.native(absolutePath) !== absolutePath) {
      fail(`${manifestName} entry traverses a symlink: ${manifestPathValue}`);
    }
    paths.push(manifestPathValue);
  }
  const sortedPaths = [...paths].sort(compareUtf8Bytes);
  if (paths.some((entry, index) => entry !== sortedPaths[index])) fail(`${manifestName} path-set is not sorted`);
  return { paths, set: seen };
}

const sourceManifest = parseManifest(shaManifestName);
const hydratedManifest = parseManifest(hydratedManifestName);
for (const forbidden of [
  `./${shaManifestName}`,
  `./${hydratedManifestName}`,
  `./${symlinkManifestName}`,
]) {
  if (sourceManifest.set.has(forbidden)) fail(`${shaManifestName} must not hash a manifest file`);
}
for (const manifestPathValue of sourceManifest.paths) {
  if (manifestPathValue === `./${mutableCache}` || manifestPathValue.startsWith(`./${mutableCache}/`)) {
    fail(`${shaManifestName} contains mutable Web cache content`);
  }
  if (!hydratedManifest.set.has(manifestPathValue)) {
    fail(`${shaManifestName} path is absent from the hydrated full-tree manifest: ${manifestPathValue}`);
  }
}
if (hydratedManifest.set.has(`./${hydratedManifestName}`)) {
  fail(`${hydratedManifestName} must not hash itself`);
}
if (!hydratedManifest.set.has(`./${symlinkManifestName}`)) {
  fail(`${hydratedManifestName} must bind the symlink topology manifest`);
}
if (hydratedManifest.paths.length !== actualRegularPaths.size) {
  fail(`${hydratedManifestName} does not cover the exact regular-file count`);
}
for (const actualPath of actualRegularPaths) {
  if (!hydratedManifest.set.has(actualPath)) fail(`${hydratedManifestName} omits regular file: ${actualPath}`);
}
for (const manifestPathValue of hydratedManifest.paths) {
  if (!actualRegularPaths.has(manifestPathValue)) fail(`${hydratedManifestName} lists a non-authoritative file: ${manifestPathValue}`);
}

actualSymlinks.sort((left, right) =>
  compareUtf8Bytes(left.path, right.path) || compareUtf8Bytes(left.target, right.target));
const symlinkManifestPath = path.join(releaseRoot, symlinkManifestName);
const symlinkManifestStat = fs.lstatSync(symlinkManifestPath, { bigint: true });
if (!symlinkManifestStat.isFile() || symlinkManifestStat.isSymbolicLink()) {
  fail('symlink topology manifest is absent or unsafe');
}
const symlinkManifestText = fs.readFileSync(symlinkManifestPath, 'utf8');
const canonicalSymlinkManifest = `${JSON.stringify({ links: actualSymlinks, version: 1 })}\n`;
if (symlinkManifestText !== canonicalSymlinkManifest) {
  fail('symlink topology differs from the hydrated authority manifest');
}
NODE
  then
    die 'sealed release manifest path-set, coverage or exact mode validation failed'
  fi

  (
    cd -- "$actual_directory"
    sha256sum --strict --check --quiet SHA256SUMS
    sha256sum --strict --check --quiet HYDRATED_SHA256SUMS
  ) || die 'sealed release checksum manifest verification failed'

  [[ "$(grep -c '^RECORD_VERSION=1$' "$actual_directory/HYDRATION_SANDBOX_RECEIPT")" == '1' \
    && "$(grep -c "^RELEASE_SHA=${sha}$" "$actual_directory/HYDRATION_SANDBOX_RECEIPT")" == '1' \
    && "$(grep -c '^SANDBOX=SYSTEMD_IP_DENY_ANY_V1$' "$actual_directory/HYDRATION_SANDBOX_RECEIPT")" == '1' \
    && "$(grep -c '^INVOCATION_ID=[0-9a-f]\{32\}$' "$actual_directory/HYDRATION_SANDBOX_RECEIPT")" == '1' \
    && "$(grep -c '^PNPM_STORE_LOCKFILE_SHA256=[0-9a-f]\{64\}$' "$actual_directory/HYDRATION_SANDBOX_RECEIPT")" == '1' \
    && "$(grep -c '^PNPM_STORE_MANIFEST_SHA256=[0-9a-f]\{64\}$' "$actual_directory/HYDRATION_SANDBOX_RECEIPT")" == '1' \
    && "$(grep -c '^PNPM_STORE_RECEIPT_SHA256=[0-9a-f]\{64\}$' "$actual_directory/HYDRATION_SANDBOX_RECEIPT")" == '1' \
    && "$(awk 'END { print NR }' "$actual_directory/HYDRATION_SANDBOX_RECEIPT")" == '7' ]] \
    || die 'release hydration sandbox receipt is invalid'

  validate_hydration_attestation "$sha" "$actual_directory"

  "$node_binary" - "$actual_directory/release-provenance.json" "$sha" "$actual_directory/apps/web/.next/BUILD_ID" <<'NODE'
const fs = require('node:fs');
const [provenancePath, expectedSha, buildIdPath] = process.argv.slice(2);
const provenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8'));
const buildId = fs.readFileSync(buildIdPath, 'utf8').trim();
if (provenance.releaseSha !== expectedSha) throw new Error('release provenance SHA mismatch');
if (!/^\d{14}_[a-z0-9_]+$/u.test(provenance.databaseMigration)) throw new Error('release provenance migration is invalid');
if (!Number.isSafeInteger(provenance.databaseMigrationCount) || provenance.databaseMigrationCount < 1) throw new Error('release provenance migration count is invalid');
if (buildId !== expectedSha) throw new Error('Web BUILD_ID differs from exact release SHA');
NODE

  if [[ "$fixture_mode" == true ]]; then
    service_user="$fixture_service_user"
    runuser -u "$service_user" -- test -r "$actual_directory/apps/api/dist/main.js" \
      || die 'fixture service identity cannot read API runtime'
    runuser -u "$service_user" -- test -r "$actual_directory/apps/web/.next/BUILD_ID" \
      || die 'fixture service identity cannot read Web runtime'
  else
    for service_user in "leetplus-api-${slot}" "leetplus-web-${slot}"; do
      getent passwd "$service_user" >/dev/null || die "slot service identity is absent: ${service_user}"
      runuser -u "$service_user" -- test -r "$actual_directory/apps/api/dist/main.js" \
        || die "slot service identity cannot read API runtime: ${service_user}"
      runuser -u "$service_user" -- test -r "$actual_directory/apps/web/.next/BUILD_ID" \
        || die "slot service identity cannot read Web runtime: ${service_user}"
      runuser -u "$service_user" -- test -x "$actual_directory/apps/api/dist" \
        || die "slot service identity cannot search API runtime: ${service_user}"
      runuser -u "$service_user" -- test -x "$actual_directory/apps/web/.next" \
        || die "slot service identity cannot search Web runtime: ${service_user}"
    done
  fi

  validated_release_sha256sums_sha256="$(sha256sum -- "$actual_directory/SHA256SUMS" | awk '{ print $1 }')"
  validated_release_hydrated_sha256sums_sha256="$(sha256sum -- "$actual_directory/HYDRATED_SHA256SUMS" | awk '{ print $1 }')"
  validated_release_symlink_manifest_sha256="$(sha256sum -- "$actual_directory/HYDRATED_SYMLINKS.json" | awk '{ print $1 }')"
  validated_release_provenance_sha256="$(sha256sum -- "$actual_directory/release-provenance.json" | awk '{ print $1 }')"
}

assert_release_fingerprints() {
  local sha="$1"
  local expected_sha256sums="$2"
  local expected_hydrated="$3"
  local expected_symlinks="$4"
  local expected_provenance="$5"
  local expected_hydration_attestation="$6"
  validate_release "$sha"
  [[ "$validated_release_sha256sums_sha256" == "$expected_sha256sums" \
    && "$validated_release_hydrated_sha256sums_sha256" == "$expected_hydrated" \
    && "$validated_release_symlink_manifest_sha256" == "$expected_symlinks" \
    && "$validated_release_provenance_sha256" == "$expected_provenance" \
    && "$validated_release_hydration_attestation_sha256" == "$expected_hydration_attestation" ]] \
    || die 'receipt-bound release fingerprint changed'
}

assert_slot_runtime_fenced() {
  local api_state
  local control_group
  local cgroup_root
  local web_state
  local unit
  local load_state
  local main_pid
  local mask_path
  local sub_state
  local unit_file_state

  if [[ "$fixture_mode" == true ]]; then
    [[ "$fixture_units_state" == 'inactive' ]] \
      || die 'fixture slot runtime is not fenced and inactive'
    return 0
  fi

  for unit in "leetplus-api@${slot}.service" "leetplus-web@${slot}.service"; do
    load_state="$(timeout --foreground --kill-after=2s 8s systemctl show --property=LoadState --value "$unit")" \
      || die "cannot inspect slot unit: ${unit}"
    unit_file_state="$(timeout --foreground --kill-after=2s 8s systemctl show --property=UnitFileState --value "$unit")" \
      || die "cannot inspect slot unit-file state: ${unit}"
    api_state="$(timeout --foreground --kill-after=2s 8s systemctl show --property=ActiveState --value "$unit")" \
      || die "cannot inspect slot unit active state: ${unit}"
    sub_state="$(timeout --foreground --kill-after=2s 8s systemctl show --property=SubState --value "$unit")" \
      || die "cannot inspect slot unit substate: ${unit}"
    main_pid="$(timeout --foreground --kill-after=2s 8s systemctl show --property=MainPID --value "$unit")" \
      || die "cannot inspect slot unit PID: ${unit}"
    control_group="$(timeout --foreground --kill-after=2s 8s systemctl show --property=ControlGroup --value "$unit")" \
      || die "cannot inspect slot unit cgroup: ${unit}"
    [[ "$load_state" == 'masked' && "$unit_file_state" == 'masked' \
      && "$api_state" == 'inactive' && "$sub_state" == 'dead' && "$main_pid" == '0' ]] \
      || die "slot unit is not masked, inactive and process-free: ${unit}"
    mask_path="/etc/systemd/system/${unit}"
    [[ -L "$mask_path" && "$(realpath -- "$mask_path")" == '/dev/null' \
      && "$(stat -c '%u:%g' -- "$mask_path")" == '0:0' ]] \
      || die "slot unit does not have an exact root-owned /dev/null mask: ${unit}"
    if [[ -n "$control_group" ]]; then
      [[ "$control_group" == /* && "$control_group" != *'..'* ]] \
        || die "slot unit cgroup identity is invalid: ${unit}"
      cgroup_root="/sys/fs/cgroup${control_group}"
      if [[ -e "$cgroup_root" ]]; then
        [[ -d "$cgroup_root" && ! -L "$cgroup_root" ]] \
          || die "slot unit cgroup path is unsafe: ${unit}"
        [[ -z "$(find -P "$cgroup_root" -type f -name cgroup.procs -exec awk 'NF { found=1; exit } END { exit(found ? 0 : 1) }' {} \; -print -quit)" ]] \
          || die "slot unit cgroup still contains processes: ${unit}"
      fi
    fi
  done
}

assert_runtime_policy() {
  assert_slot_runtime_fenced
}

capture_current_slot() {
  current_state='ABSENT'
  current_release_sha=''
  current_target=''
  current_sha256sums_sha256=''
  current_hydrated_sha256sums_sha256=''
  current_symlink_manifest_sha256=''
  current_provenance_sha256=''
  current_hydration_attestation_sha256=''

  if [[ -e "$slot_path" && ! -L "$slot_path" ]]; then
    die 'slot path exists but is not a symlink'
  fi
  if [[ -L "$slot_path" ]]; then
    [[ "$(stat -c '%u:%g' -- "$slot_path")" == '0:0' ]] || die 'slot symlink is not root-owned'
    current_target="$(realpath -e -- "$slot_path")" || die 'slot symlink is dangling'
    [[ "$(dirname -- "$current_target")" == "$release_root" ]] || die 'slot symlink escapes the exact release root'
    current_release_sha="$(basename -- "$current_target")"
    [[ "$current_release_sha" =~ $RELEASE_SHA_PATTERN ]] || die 'slot symlink target is not an exact release SHA'
    validate_release "$current_release_sha"
    current_state='BOUND'
    current_sha256sums_sha256="$validated_release_sha256sums_sha256"
    current_hydrated_sha256sums_sha256="$validated_release_hydrated_sha256sums_sha256"
    current_symlink_manifest_sha256="$validated_release_symlink_manifest_sha256"
    current_provenance_sha256="$validated_release_provenance_sha256"
    current_hydration_attestation_sha256="$validated_release_hydration_attestation_sha256"
  fi
}

atomic_bind_slot() {
  local target="$1"
  local temporary_link="${slot_path}.next.${operation_id}"
  if [[ -e "$temporary_link" || -L "$temporary_link" ]]; then
    [[ -L "$temporary_link" \
      && "$(stat -c '%u:%g' -- "$temporary_link")" == '0:0' \
      && "$(realpath -e -- "$temporary_link")" == "$target" ]] \
      || die 'outstanding atomic slot link does not match the durable intent'
  else
    ln -s -- "$target" "$temporary_link"
  fi
  sync -d "$slot_root"
  if [[ "$fixture_mode" == true && "$fixture_abort_after_temporary_link" == true ]]; then
    printf 'bind-release-slot: fixture interruption after durable temporary slot link\n' >&2
    exit 89
  fi
  mv -T -- "$temporary_link" "$slot_path"
  sync -d "$slot_root"
  [[ -L "$slot_path" && "$(realpath -e -- "$slot_path")" == "$target" ]] \
    || die 'atomic slot link effect did not bind the exact requested release'
}

atomic_remove_slot() {
  [[ -L "$slot_path" ]] || die 'receipt-bound slot link to remove is absent'
  rm -- "$slot_path"
  sync -d "$slot_root"
  [[ ! -e "$slot_path" && ! -L "$slot_path" ]] || die 'slot link removal did not persist'
}

generate_intent_record() {
  printf 'RECORD_VERSION=1\n'
  printf 'RECORD_KIND=SLOT_LINK_INTENT\n'
  printf 'OPERATION=%s\n' "$operation"
  printf 'OPERATION_ID=%s\n' "$operation_id"
  printf 'SLOT=%s\n' "$slot"
  printf 'REQUESTED_RELEASE_SHA=%s\n' "$requested_release_sha"
  printf 'REQUESTED_TARGET=%s\n' "$requested_target"
  printf 'REQUESTED_SHA256SUMS_SHA256=%s\n' "$requested_sha256sums_sha256"
  printf 'REQUESTED_HYDRATED_SHA256SUMS_SHA256=%s\n' "$requested_hydrated_sha256s_sha256"
  printf 'REQUESTED_SYMLINK_MANIFEST_SHA256=%s\n' "$requested_symlink_manifest_sha256"
  printf 'REQUESTED_PROVENANCE_SHA256=%s\n' "$requested_provenance_sha256"
  printf 'REQUESTED_HYDRATION_ATTESTATION_SHA256=%s\n' "$requested_hydration_attestation_sha256"
  printf 'PRIOR_STATE=%s\n' "$prior_state"
  printf 'PRIOR_RELEASE_SHA=%s\n' "$prior_release_sha"
  printf 'PRIOR_TARGET=%s\n' "$prior_target"
  printf 'PRIOR_SHA256SUMS_SHA256=%s\n' "$prior_sha256s_sha256"
  printf 'PRIOR_HYDRATED_SHA256SUMS_SHA256=%s\n' "$prior_hydrated_sha256s_sha256"
  printf 'PRIOR_SYMLINK_MANIFEST_SHA256=%s\n' "$prior_symlink_manifest_sha256"
  printf 'PRIOR_PROVENANCE_SHA256=%s\n' "$prior_provenance_sha256"
  printf 'PRIOR_HYDRATION_ATTESTATION_SHA256=%s\n' "$prior_hydration_attestation_sha256"
  printf 'SOURCE_RECEIPT_SHA256=%s\n' "$source_receipt_sha256"
  printf 'ACTIVE_SLOT_SAFE_MODE=%s\n' "$active_slot_safe_mode"
  printf 'CREATED_AT=%s\n' "$created_at"
}

generate_receipt_record() {
  printf 'RECORD_VERSION=1\n'
  printf 'RECORD_KIND=SLOT_LINK_RECEIPT\n'
  printf 'OPERATION=%s\n' "$operation"
  printf 'OPERATION_ID=%s\n' "$operation_id"
  printf 'SLOT=%s\n' "$slot"
  printf 'REQUESTED_RELEASE_SHA=%s\n' "$requested_release_sha"
  printf 'REQUESTED_TARGET=%s\n' "$requested_target"
  printf 'REQUESTED_SHA256SUMS_SHA256=%s\n' "$requested_sha256sums_sha256"
  printf 'REQUESTED_HYDRATED_SHA256SUMS_SHA256=%s\n' "$requested_hydrated_sha256s_sha256"
  printf 'REQUESTED_SYMLINK_MANIFEST_SHA256=%s\n' "$requested_symlink_manifest_sha256"
  printf 'REQUESTED_PROVENANCE_SHA256=%s\n' "$requested_provenance_sha256"
  printf 'REQUESTED_HYDRATION_ATTESTATION_SHA256=%s\n' "$requested_hydration_attestation_sha256"
  printf 'PRIOR_STATE=%s\n' "$prior_state"
  printf 'PRIOR_RELEASE_SHA=%s\n' "$prior_release_sha"
  printf 'PRIOR_TARGET=%s\n' "$prior_target"
  printf 'PRIOR_SHA256SUMS_SHA256=%s\n' "$prior_sha256s_sha256"
  printf 'PRIOR_HYDRATED_SHA256SUMS_SHA256=%s\n' "$prior_hydrated_sha256s_sha256"
  printf 'PRIOR_SYMLINK_MANIFEST_SHA256=%s\n' "$prior_symlink_manifest_sha256"
  printf 'PRIOR_PROVENANCE_SHA256=%s\n' "$prior_provenance_sha256"
  printf 'PRIOR_HYDRATION_ATTESTATION_SHA256=%s\n' "$prior_hydration_attestation_sha256"
  printf 'SOURCE_RECEIPT_SHA256=%s\n' "$source_receipt_sha256"
  printf 'ACTIVE_SLOT_SAFE_MODE=%s\n' "$active_slot_safe_mode"
  printf 'CREATED_AT=%s\n' "$created_at"
  printf 'INTENT_SHA256=%s\n' "$intent_sha256"
  printf 'EFFECT_STATE=%s\n' "$effect_state"
  printf 'ACCEPTED_AT=%s\n' "$accepted_at"
}

load_intent() {
  local record="$1"
  local value
  assert_record_schema "$record" SLOT_LINK_INTENT
  [[ "$(record_value "$record" RECORD_VERSION)" == '1' ]] || die 'intent record version is unsupported'
  [[ "$(record_value "$record" RECORD_KIND)" == 'SLOT_LINK_INTENT' ]] || die 'journal record is not a slot-link intent'
  operation="$(record_value "$record" OPERATION)" || die 'intent operation is absent'
  [[ "$operation" == 'BIND' || "$operation" == 'ROLLBACK' ]] || die 'intent operation is invalid'
  operation_id="$(record_value "$record" OPERATION_ID)" || die 'intent operation id is absent'
  [[ "$operation_id" =~ $OPERATION_ID_PATTERN ]] || die 'intent operation id is invalid'
  value="$(record_value "$record" SLOT)" || die 'intent slot is absent'
  [[ "$value" == "$slot" ]] || die 'intent slot differs from requested reconcile slot'
  requested_release_sha="$(record_value "$record" REQUESTED_RELEASE_SHA)" || die 'intent requested SHA is absent'
  requested_target="$(record_value "$record" REQUESTED_TARGET)" || die 'intent requested target is absent'
  requested_sha256sums_sha256="$(record_value "$record" REQUESTED_SHA256SUMS_SHA256)" || die 'intent requested manifest fingerprint is absent'
  requested_hydrated_sha256sums_sha256="$(record_value "$record" REQUESTED_HYDRATED_SHA256SUMS_SHA256)" || die 'intent requested hydrated fingerprint is absent'
  requested_symlink_manifest_sha256="$(record_value "$record" REQUESTED_SYMLINK_MANIFEST_SHA256)" || die 'intent requested symlink fingerprint is absent'
  requested_provenance_sha256="$(record_value "$record" REQUESTED_PROVENANCE_SHA256)" || die 'intent requested provenance fingerprint is absent'
  requested_hydration_attestation_sha256="$(record_value "$record" REQUESTED_HYDRATION_ATTESTATION_SHA256)" || die 'intent requested hydration attestation fingerprint is absent'
  prior_state="$(record_value "$record" PRIOR_STATE)" || die 'intent prior state is absent'
  prior_release_sha="$(record_value "$record" PRIOR_RELEASE_SHA)" || die 'intent prior SHA is absent'
  prior_target="$(record_value "$record" PRIOR_TARGET)" || die 'intent prior target is absent'
  prior_sha256sums_sha256="$(record_value "$record" PRIOR_SHA256SUMS_SHA256)" || die 'intent prior manifest fingerprint is absent'
  prior_hydrated_sha256sums_sha256="$(record_value "$record" PRIOR_HYDRATED_SHA256SUMS_SHA256)" || die 'intent prior hydrated fingerprint is absent'
  prior_symlink_manifest_sha256="$(record_value "$record" PRIOR_SYMLINK_MANIFEST_SHA256)" || die 'intent prior symlink fingerprint is absent'
  prior_provenance_sha256="$(record_value "$record" PRIOR_PROVENANCE_SHA256)" || die 'intent prior provenance fingerprint is absent'
  prior_hydration_attestation_sha256="$(record_value "$record" PRIOR_HYDRATION_ATTESTATION_SHA256)" || die 'intent prior hydration attestation fingerprint is absent'
  source_receipt_sha256="$(record_value "$record" SOURCE_RECEIPT_SHA256)" || die 'intent source receipt fingerprint is absent'
  active_slot_safe_mode="$(record_value "$record" ACTIVE_SLOT_SAFE_MODE)" || die 'intent active-slot mode is absent'
  created_at="$(record_value "$record" CREATED_AT)" || die 'intent creation time is absent'

  [[ "$requested_release_sha" =~ $RELEASE_SHA_PATTERN \
    && "$requested_target" == "${release_root}/${requested_release_sha}" ]] || die 'intent requested release binding is invalid'
  for value in "$requested_sha256sums_sha256" "$requested_hydrated_sha256sums_sha256" "$requested_symlink_manifest_sha256" "$requested_provenance_sha256" "$requested_hydration_attestation_sha256"; do
    [[ "$value" =~ ^[0-9a-f]{64}$ ]] || die 'intent requested fingerprint is invalid'
  done
  [[ "$prior_state" == 'ABSENT' || "$prior_state" == 'BOUND' ]] || die 'intent prior state is invalid'
  if [[ "$prior_state" == 'ABSENT' ]]; then
    [[ -z "$prior_release_sha$prior_target$prior_sha256sums_sha256$prior_hydrated_sha256sums_sha256$prior_symlink_manifest_sha256$prior_provenance_sha256$prior_hydration_attestation_sha256" ]] \
      || die 'ABSENT prior state contains release data'
  else
    [[ "$prior_release_sha" =~ $RELEASE_SHA_PATTERN \
      && "$prior_target" == "${release_root}/${prior_release_sha}" ]] || die 'intent prior release binding is invalid'
    for value in "$prior_sha256sums_sha256" "$prior_hydrated_sha256sums_sha256" "$prior_symlink_manifest_sha256" "$prior_provenance_sha256" "$prior_hydration_attestation_sha256"; do
      [[ "$value" =~ ^[0-9a-f]{64}$ ]] || die 'intent prior fingerprint is invalid'
    done
  fi
  if [[ "$operation" == 'BIND' ]]; then
    [[ -z "$source_receipt_sha256" ]] || die 'bind intent unexpectedly has a source receipt'
  else
    [[ "$source_receipt_sha256" =~ ^[0-9a-f]{64}$ ]] || die 'rollback intent has no exact source receipt fingerprint'
  fi
  [[ "$active_slot_safe_mode" == false ]] || die 'intent contains a forbidden active-slot override'
  [[ "$created_at" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{9}Z$ ]] \
    || die 'intent creation time is invalid'
}

assert_effect_state() {
  local desired="$1"
  capture_current_slot
  if [[ "$desired" == 'REQUESTED' ]]; then
    [[ "$current_state" == 'BOUND' && "$current_release_sha" == "$requested_release_sha" \
      && "$current_target" == "$requested_target" \
      && "$current_sha256sums_sha256" == "$requested_sha256sums_sha256" \
      && "$current_hydrated_sha256sums_sha256" == "$requested_hydrated_sha256sums_sha256" \
      && "$current_symlink_manifest_sha256" == "$requested_symlink_manifest_sha256" \
      && "$current_provenance_sha256" == "$requested_provenance_sha256" \
      && "$current_hydration_attestation_sha256" == "$requested_hydration_attestation_sha256" ]] \
      || die 'slot is not in the exact receipt-bound requested state'
  elif [[ "$prior_state" == 'ABSENT' ]]; then
    [[ "$current_state" == 'ABSENT' ]] || die 'slot is not in the exact receipt-bound absent prior state'
  else
    [[ "$current_state" == 'BOUND' && "$current_release_sha" == "$prior_release_sha" \
      && "$current_target" == "$prior_target" \
      && "$current_sha256sums_sha256" == "$prior_sha256sums_sha256" \
      && "$current_hydrated_sha256sums_sha256" == "$prior_hydrated_sha256sums_sha256" \
      && "$current_symlink_manifest_sha256" == "$prior_symlink_manifest_sha256" \
      && "$current_provenance_sha256" == "$prior_provenance_sha256" \
      && "$current_hydration_attestation_sha256" == "$prior_hydration_attestation_sha256" ]] \
      || die 'slot is not in the exact receipt-bound prior state'
  fi
}

generate_latest_record() {
  printf 'RECORD_VERSION=1\n'
  printf 'RECORD_KIND=SLOT_LINK_LATEST\n'
  printf 'SLOT=%s\n' "$slot"
  printf 'OPERATION_ID=%s\n' "$operation_id"
  printf 'RECEIPT_PATH=%s\n' "$latest_receipt_path"
  printf 'RECEIPT_SHA256=%s\n' "$latest_receipt_sha256"
  printf 'UPDATED_AT=%s\n' "$latest_updated_at"
}

update_latest_receipt() {
  local receipt_path="$1"
  local latest_path="${state_root}/${slot}.latest"
  local temporary_path="${latest_path}.new.$$"
  local latest_fd

  [[ -f "$receipt_path" && ! -L "$receipt_path" ]] || die 'cannot index an unsafe accepted receipt'
  if [[ -e "$latest_path" || -L "$latest_path" ]]; then
    [[ -f "$latest_path" && ! -L "$latest_path" \
      && "$(stat -c '%u:%g:%a:%h' -- "$latest_path")" == '0:0:600:1' ]] \
      || die 'existing latest-receipt index is unsafe'
  fi
  [[ ! -e "$temporary_path" && ! -L "$temporary_path" ]] || die 'latest-receipt temporary path already exists'
  latest_receipt_path="$receipt_path"
  latest_receipt_sha256="$(sha256sum -- "$receipt_path" | awk '{ print $1 }')"
  latest_updated_at="$(date -u +%Y-%m-%dT%H:%M:%S.%NZ)"
  set -o noclobber
  exec {latest_fd}> "$temporary_path" || die 'cannot create latest-receipt index exclusively'
  set +o noclobber
  generate_latest_record >&"$latest_fd"
  exec {latest_fd}>&-
  chmod 0600 -- "$temporary_path"
  sync -f "$temporary_path"
  mv -T -- "$temporary_path" "$latest_path"
  sync -d "$state_root"
}

read_latest_receipt() {
  local latest_path="${state_root}/${slot}.latest"
  local indexed_operation_id
  local indexed_receipt
  local indexed_sha256
  local updated_at
  [[ -f "$latest_path" && ! -L "$latest_path" \
    && "$(stat -c '%u:%g:%a:%h' -- "$latest_path")" == '0:0:600:1' ]] \
    || die 'slot has no safe latest-receipt index'
  assert_latest_record_schema "$latest_path"
  [[ "$(record_value "$latest_path" RECORD_VERSION)" == '1' \
    && "$(record_value "$latest_path" RECORD_KIND)" == 'SLOT_LINK_LATEST' \
    && "$(record_value "$latest_path" SLOT)" == "$slot" ]] \
    || die 'latest-receipt index authority is invalid'
  indexed_operation_id="$(record_value "$latest_path" OPERATION_ID)" || die 'latest-receipt operation id is absent'
  indexed_receipt="$(record_value "$latest_path" RECEIPT_PATH)" || die 'latest-receipt path is absent'
  indexed_sha256="$(record_value "$latest_path" RECEIPT_SHA256)" || die 'latest-receipt fingerprint is absent'
  updated_at="$(record_value "$latest_path" UPDATED_AT)" || die 'latest-receipt update time is absent'
  [[ "$indexed_operation_id" =~ $OPERATION_ID_PATTERN \
    && "$indexed_sha256" =~ ^[0-9a-f]{64}$ \
    && "$updated_at" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{9}Z$ ]] \
    || die 'latest-receipt index values are invalid'
  [[ "$indexed_receipt" == "$state_root/${slot}-${indexed_operation_id}.bind.receipt" \
    || "$indexed_receipt" == "$state_root/${slot}-${indexed_operation_id}.rollback.receipt" ]] \
    || die 'latest-receipt path is outside its exact slot authority'
  [[ -f "$indexed_receipt" && ! -L "$indexed_receipt" \
    && "$(stat -c '%u:%g:%a:%h' -- "$indexed_receipt")" == '0:0:600:1' ]] \
    || die 'latest accepted receipt is absent or unsafe'
  [[ "$(sha256sum -- "$indexed_receipt" | awk '{ print $1 }')" == "$indexed_sha256" ]] \
    || die 'latest accepted receipt fingerprint changed'
  printf '%s' "$indexed_receipt"
}

publish_effect_receipt() {
  local intent_path="$1"
  local receipt_path="$2"
  intent_sha256="$(sha256sum -- "$intent_path" | awk '{ print $1 }')"
  accepted_at="$(date -u +%Y-%m-%dT%H:%M:%S.%NZ)"
  if [[ "$operation" == 'BIND' ]]; then
    effect_state='REQUESTED_BOUND'
  else
    effect_state='PRIOR_RESTORED'
  fi
  publish_record_exclusive "$receipt_path" generate_receipt_record
  update_latest_receipt "$receipt_path"
  remove_completed_intent "$intent_path"
  printf 'SLOT_LINK_ACCEPTED_OPERATION=%s\n' "$operation"
  printf 'SLOT_LINK_ACCEPTED_SLOT=%s\n' "$slot"
  printf 'SLOT_LINK_ACCEPTED_RELEASE_SHA=%s\n' "$requested_release_sha"
  printf 'SLOT_LINK_ACCEPTED_RECEIPT=%s\n' "$receipt_path"
}

apply_intent_effect() {
  local intent_path="$1"
  local receipt_path="$2"

  assert_runtime_policy
  assert_release_fingerprints "$requested_release_sha" "$requested_sha256sums_sha256" \
    "$requested_hydrated_sha256sums_sha256" "$requested_symlink_manifest_sha256" \
    "$requested_provenance_sha256" "$requested_hydration_attestation_sha256"
  if [[ "$prior_state" == 'BOUND' ]]; then
    assert_release_fingerprints "$prior_release_sha" "$prior_sha256sums_sha256" \
      "$prior_hydrated_sha256sums_sha256" "$prior_symlink_manifest_sha256" \
      "$prior_provenance_sha256" "$prior_hydration_attestation_sha256"
  fi

  capture_current_slot
  # Recheck the durable systemd masks, inactive process state and empty cgroups
  # after the potentially long tree verification and immediately before any
  # link effect. A normal systemd start cannot cross this boundary while the
  # exact instance masks remain installed.
  assert_runtime_policy
  if [[ "$operation" == 'BIND' ]]; then
    if [[ "$current_state" == 'BOUND' && "$current_target" == "$requested_target" ]]; then
      assert_effect_state REQUESTED
    elif [[ "$current_state" == "$prior_state" \
      && "$current_release_sha" == "$prior_release_sha" \
      && "$current_target" == "$prior_target" ]]; then
      atomic_bind_slot "$requested_target"
    else
      die 'slot drifted outside both receipt-bound states; refusing improvisation'
    fi
    assert_effect_state REQUESTED
  else
    if [[ "$prior_state" == 'ABSENT' && "$current_state" == 'ABSENT' ]]; then
      :
    elif [[ "$prior_state" == 'BOUND' && "$current_state" == 'BOUND' && "$current_target" == "$prior_target" ]]; then
      assert_effect_state PRIOR
    elif [[ "$current_state" == 'BOUND' && "$current_target" == "$requested_target" ]]; then
      assert_effect_state REQUESTED
      if [[ "$prior_state" == 'ABSENT' ]]; then
        atomic_remove_slot
      else
        atomic_bind_slot "$prior_target"
      fi
    else
      die 'slot drifted outside both receipt-bound states; refusing improvisation'
    fi
    assert_effect_state PRIOR
  fi

  if [[ "$fixture_abort_after_effect" == true ]]; then
    printf 'bind-release-slot: fixture interruption after atomic slot effect\n' >&2
    exit 86
  fi
  publish_effect_receipt "$intent_path" "$receipt_path"
}

load_receipt_authority() {
  local record="$1"
  local expected_operation="${2:-}"
  local basename_value
  local accepted_timestamp
  local calculated_intent_sha256
  local parsed_operation
  local stored_intent_sha256
  local value
  assert_record_schema "$record" SLOT_LINK_RECEIPT
  [[ "$(record_value "$record" RECORD_VERSION)" == '1' \
    && "$(record_value "$record" RECORD_KIND)" == 'SLOT_LINK_RECEIPT' ]] \
    || die 'journal record is not an accepted slot-link receipt'
  parsed_operation="$(record_value "$record" OPERATION)" || die 'receipt operation is absent'
  [[ "$parsed_operation" == 'BIND' || "$parsed_operation" == 'ROLLBACK' ]] \
    || die 'receipt operation is invalid'
  [[ -z "$expected_operation" || "$parsed_operation" == "$expected_operation" ]] \
    || die 'receipt operation differs from the required authority'
  if [[ "$parsed_operation" == 'BIND' ]]; then
    [[ "$(record_value "$record" EFFECT_STATE)" == 'REQUESTED_BOUND' ]] \
      || die 'bind receipt has an invalid effect state'
  else
    [[ "$(record_value "$record" EFFECT_STATE)" == 'PRIOR_RESTORED' ]] \
      || die 'rollback receipt has an invalid effect state'
  fi
  operation_id="$(record_value "$record" OPERATION_ID)" || die 'receipt operation id is absent'
  [[ "$operation_id" =~ $OPERATION_ID_PATTERN ]] || die 'receipt operation id is invalid'
  slot="$(record_value "$record" SLOT)" || die 'receipt slot is absent'
  [[ "$slot" =~ $SLOT_PATTERN ]] || die 'receipt slot is invalid'
  basename_value="$(basename -- "$record")"
  if [[ "$parsed_operation" == 'BIND' ]]; then
    [[ "$basename_value" == "${slot}-${operation_id}.bind.receipt" ]] \
      || die 'bind receipt filename does not match its authority record'
  else
    [[ "$basename_value" == "${slot}-${operation_id}.rollback.receipt" ]] \
      || die 'rollback receipt filename does not match its authority record'
  fi
  requested_release_sha="$(record_value "$record" REQUESTED_RELEASE_SHA)" || die 'receipt requested SHA is absent'
  requested_target="$(record_value "$record" REQUESTED_TARGET)" || die 'receipt requested target is absent'
  requested_sha256sums_sha256="$(record_value "$record" REQUESTED_SHA256SUMS_SHA256)" || die 'receipt requested fingerprint is absent'
  requested_hydrated_sha256sums_sha256="$(record_value "$record" REQUESTED_HYDRATED_SHA256SUMS_SHA256)" || die 'receipt requested hydrated fingerprint is absent'
  requested_symlink_manifest_sha256="$(record_value "$record" REQUESTED_SYMLINK_MANIFEST_SHA256)" || die 'receipt requested symlink fingerprint is absent'
  requested_provenance_sha256="$(record_value "$record" REQUESTED_PROVENANCE_SHA256)" || die 'receipt requested provenance fingerprint is absent'
  requested_hydration_attestation_sha256="$(record_value "$record" REQUESTED_HYDRATION_ATTESTATION_SHA256)" || die 'receipt requested hydration attestation fingerprint is absent'
  prior_state="$(record_value "$record" PRIOR_STATE)" || die 'receipt prior state is absent'
  prior_release_sha="$(record_value "$record" PRIOR_RELEASE_SHA)" || die 'receipt prior SHA is absent'
  prior_target="$(record_value "$record" PRIOR_TARGET)" || die 'receipt prior target is absent'
  prior_sha256sums_sha256="$(record_value "$record" PRIOR_SHA256SUMS_SHA256)" || die 'receipt prior fingerprint is absent'
  prior_hydrated_sha256sums_sha256="$(record_value "$record" PRIOR_HYDRATED_SHA256SUMS_SHA256)" || die 'receipt prior hydrated fingerprint is absent'
  prior_symlink_manifest_sha256="$(record_value "$record" PRIOR_SYMLINK_MANIFEST_SHA256)" || die 'receipt prior symlink fingerprint is absent'
  prior_provenance_sha256="$(record_value "$record" PRIOR_PROVENANCE_SHA256)" || die 'receipt prior provenance fingerprint is absent'
  prior_hydration_attestation_sha256="$(record_value "$record" PRIOR_HYDRATION_ATTESTATION_SHA256)" || die 'receipt prior hydration attestation fingerprint is absent'
  source_receipt_sha256="$(record_value "$record" SOURCE_RECEIPT_SHA256)" || die 'receipt source fingerprint is absent'
  active_slot_safe_mode="$(record_value "$record" ACTIVE_SLOT_SAFE_MODE)" || die 'receipt active-slot mode is absent'
  created_at="$(record_value "$record" CREATED_AT)" || die 'receipt creation time is absent'
  stored_intent_sha256="$(record_value "$record" INTENT_SHA256)" || die 'receipt intent fingerprint is absent'
  accepted_timestamp="$(record_value "$record" ACCEPTED_AT)" || die 'receipt acceptance time is absent'
  [[ "$stored_intent_sha256" =~ ^[0-9a-f]{64}$ ]] || die 'receipt intent fingerprint is invalid'
  if [[ "$parsed_operation" == 'BIND' ]]; then
    [[ -z "$source_receipt_sha256" ]] || die 'accepted bind receipt unexpectedly has a source receipt'
  else
    [[ "$source_receipt_sha256" =~ ^[0-9a-f]{64}$ ]] || die 'rollback receipt has no source receipt fingerprint'
  fi
  [[ "$active_slot_safe_mode" == false ]] || die 'receipt contains a forbidden active-slot override'
  [[ "$created_at" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{9}Z$ ]] \
    || die 'receipt creation time is invalid'
  [[ "$accepted_timestamp" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{9}Z$ ]] \
    || die 'receipt acceptance time is invalid'
  [[ "$requested_release_sha" =~ $RELEASE_SHA_PATTERN && "$requested_target" == "${release_root}/${requested_release_sha}" ]] \
    || die 'receipt requested release binding is invalid'
  for value in "$requested_sha256sums_sha256" "$requested_hydrated_sha256sums_sha256" "$requested_symlink_manifest_sha256" "$requested_provenance_sha256" "$requested_hydration_attestation_sha256"; do
    [[ "$value" =~ ^[0-9a-f]{64}$ ]] || die 'receipt requested fingerprint is invalid'
  done
  [[ "$prior_state" == 'ABSENT' || "$prior_state" == 'BOUND' ]] || die 'receipt prior state is invalid'
  if [[ "$prior_state" == 'ABSENT' ]]; then
    [[ -z "$prior_release_sha$prior_target$prior_sha256sums_sha256$prior_hydrated_sha256sums_sha256$prior_symlink_manifest_sha256$prior_provenance_sha256$prior_hydration_attestation_sha256" ]] \
      || die 'receipt ABSENT state contains prior release data'
  else
    [[ "$prior_release_sha" =~ $RELEASE_SHA_PATTERN && "$prior_target" == "${release_root}/${prior_release_sha}" ]] \
      || die 'receipt prior release binding is invalid'
    for value in "$prior_sha256sums_sha256" "$prior_hydrated_sha256sums_sha256" "$prior_symlink_manifest_sha256" "$prior_provenance_sha256" "$prior_hydration_attestation_sha256"; do
      [[ "$value" =~ ^[0-9a-f]{64}$ ]] || die 'receipt prior fingerprint is invalid'
    done
  fi
  operation="$parsed_operation"
  calculated_intent_sha256="$(generate_intent_record | sha256sum | awk '{ print $1 }')"
  [[ "$calculated_intent_sha256" == "$stored_intent_sha256" ]] \
    || die 'accepted receipt is not bound to its exact durable intent'
}

mode="${1:-}"
[[ "$mode" == 'bind' || "$mode" == 'reconcile' || "$mode" == 'rollback' ]] || {
  usage >&2
  exit 1
}
shift

slot=''
release_sha=''
receipt=''
active_slot_safe_mode=false
fixture_mode=false
fixture_root=''
fixture_units_state='inactive'
fixture_abort_after_effect=false
fixture_abort_after_intent_record_link=false
fixture_abort_after_receipt_record_link=false
fixture_abort_after_temporary_link=false
fixture_service_user=''
fixture_node=''

while (($# > 0)); do
  case "$1" in
    --slot) slot="${2:-}"; shift 2 ;;
    --release-sha) release_sha="${2:-}"; shift 2 ;;
    --receipt) receipt="${2:-}"; shift 2 ;;
    --fixture-root) fixture_mode=true; fixture_root="${2:-}"; shift 2 ;;
    --fixture-units-state) fixture_units_state="${2:-}"; shift 2 ;;
    --fixture-abort-after-effect) fixture_abort_after_effect=true; shift ;;
    --fixture-abort-after-intent-record-link) fixture_abort_after_intent_record_link=true; shift ;;
    --fixture-abort-after-receipt-record-link) fixture_abort_after_receipt_record_link=true; shift ;;
    --fixture-abort-after-temporary-link) fixture_abort_after_temporary_link=true; shift ;;
    --fixture-service-user) fixture_service_user="${2:-}"; shift 2 ;;
    --fixture-node) fixture_node="${2:-}"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

[[ "$(uname -s)" == 'Linux' ]] || die 'slot-link authority is Linux-only'
((EUID == 0)) || die 'slot-link authority must run as root'

for command_name in awk basename chmod date dirname find flock getent grep ln mv realpath rm runuser sha256sum stat sync systemctl timeout uname; do
  require_command "$command_name"
done

if [[ "$fixture_mode" == true ]]; then
  [[ "$fixture_units_state" == 'inactive' || "$fixture_units_state" == 'active' ]] \
    || die 'fixture unit state must be active or inactive'
  [[ -n "$fixture_service_user" ]] || die 'fixture service user is required'
  getent passwd "$fixture_service_user" >/dev/null || die 'fixture service user does not exist'
  [[ "$fixture_node" == /* ]] || die 'fixture Node binary must be absolute'
  fixture_node="$(realpath -e -- "$fixture_node")"
  [[ -f "$fixture_node" && ! -L "$fixture_node" && -x "$fixture_node" ]] \
    || die 'fixture Node binary must resolve to an executable regular file'
  node_binary="$fixture_node"
  fixture_root="$(realpath -e -- "$fixture_root")"
  release_root="${fixture_root}/srv/leetplus/releases"
  slot_root="${fixture_root}/srv/leetplus/slots"
  hydration_receipt_root="${fixture_root}/var/lib/leetplus/deploy-receipts"
  state_root="${fixture_root}/var/lib/leetplus/deploy-receipts/slot-links"
  assert_fixture_root
else
  [[ -z "$fixture_root$fixture_service_user$fixture_node" \
    && "$fixture_units_state" == 'inactive' \
    && "$fixture_abort_after_effect" == false \
    && "$fixture_abort_after_intent_record_link" == false \
    && "$fixture_abort_after_receipt_record_link" == false \
    && "$fixture_abort_after_temporary_link" == false ]] \
    || die 'fixture controls are forbidden in production mode'
  node_binary='/usr/bin/node'
  [[ -f "$node_binary" && ! -L "$node_binary" && -x "$node_binary" \
    && "$(stat -c '%u:%g' -- "$node_binary")" == '0:0' \
    && -z "$(find -P "$node_binary" -maxdepth 0 -perm /022 -print -quit)" ]] \
    || die 'trusted production Node binary is absent or unsafe'
  release_root='/srv/leetplus/releases'
  slot_root='/srv/leetplus/slots'
  hydration_receipt_root='/var/lib/leetplus/deploy-receipts'
  state_root='/var/lib/leetplus/deploy-receipts/slot-links'
  assert_root_controlled_directory /usr
  assert_root_controlled_directory /usr/bin
  assert_root_controlled_directory /usr/sbin
  assert_installed_authority
  assert_production_ancestors
fi

release_root="$(realpath -e -- "$release_root")"
slot_root="$(realpath -e -- "$slot_root")"
hydration_receipt_root="$(realpath -e -- "$hydration_receipt_root")"
state_root="$(realpath -e -- "$state_root")"
[[ "$(stat -c '%d' -- "$release_root")" == "$(stat -c '%d' -- "$slot_root")" ]] \
  || die 'release and slot roots must be on the same filesystem'

lock_path="${state_root}/slot-link.lock"
if [[ ! -e "$lock_path" && ! -L "$lock_path" ]]; then
  set -o noclobber
  : > "$lock_path" || die 'cannot create protected slot-link lock'
  set +o noclobber
  chmod 0600 -- "$lock_path"
  sync -f "$lock_path"
  sync -d "$state_root"
fi
[[ -f "$lock_path" && ! -L "$lock_path" && "$(stat -c '%u:%g:%a' -- "$lock_path")" == '0:0:600' ]] \
  || die 'slot-link lock is unsafe'
exec 9<> "$lock_path"
flock -n 9 || die 'another slot-link operation holds the authority lock'
cleanup_unpublished_journal_temporaries

if [[ "$mode" == 'bind' ]]; then
  [[ "$slot" =~ $SLOT_PATTERN ]] || die 'slot must be blue or green'
  [[ "$release_sha" =~ $RELEASE_SHA_PATTERN ]] || die 'release SHA must be 40 lowercase hexadecimal characters'
  [[ -z "$receipt" ]] || die 'bind does not accept a rollback receipt'
elif [[ "$mode" == 'reconcile' ]]; then
  [[ "$slot" =~ $SLOT_PATTERN ]] || die 'reconcile requires blue or green slot'
  [[ -z "$release_sha$receipt" ]] || die 'reconcile accepts only the slot identity'
  [[ "$active_slot_safe_mode" == false ]] \
    || die 'reconcile cannot use an active-slot override'
else
  [[ -n "$receipt" && -z "$slot$release_sha" ]] || die 'rollback accepts only one source receipt'
fi

if [[ "$mode" != 'rollback' ]]; then
  slot_path="${slot_root}/${slot}"
fi

if [[ "$mode" == 'bind' ]]; then
  outstanding_intent="$(find -P "$state_root" -maxdepth 1 -name "${slot}-*.intent" -print -quit)"
  [[ -z "$outstanding_intent" ]] || die 'slot has an outstanding intent; run reconcile instead of starting a new operation'
  assert_runtime_policy
  validate_release "$release_sha"
  requested_release_sha="$release_sha"
  requested_target="${release_root}/${release_sha}"
  requested_sha256sums_sha256="$validated_release_sha256sums_sha256"
  requested_hydrated_sha256sums_sha256="$validated_release_hydrated_sha256sums_sha256"
  requested_symlink_manifest_sha256="$validated_release_symlink_manifest_sha256"
  requested_provenance_sha256="$validated_release_provenance_sha256"
  requested_hydration_attestation_sha256="$validated_release_hydration_attestation_sha256"
  capture_current_slot
  [[ "$current_target" != "$requested_target" ]] || die 'slot already points to the exact requested release'
  prior_state="$current_state"
  prior_release_sha="$current_release_sha"
  prior_target="$current_target"
  prior_sha256sums_sha256="$current_sha256sums_sha256"
  prior_hydrated_sha256sums_sha256="$current_hydrated_sha256sums_sha256"
  prior_symlink_manifest_sha256="$current_symlink_manifest_sha256"
  prior_provenance_sha256="$current_provenance_sha256"
  prior_hydration_attestation_sha256="$current_hydration_attestation_sha256"
  source_receipt_sha256=''
  operation='BIND'
  operation_id="$(date -u +%Y%m%dT%H%M%S.%NZ)-$$"
  created_at="$(date -u +%Y-%m-%dT%H:%M:%S.%NZ)"
  intent_path="${state_root}/${slot}-${operation_id}.bind.intent"
  receipt_path="${state_root}/${slot}-${operation_id}.bind.receipt"
  publish_record_exclusive "$intent_path" generate_intent_record
  apply_intent_effect "$intent_path" "$receipt_path"
  exit 0
fi

if [[ "$mode" == 'rollback' ]]; then
  rollback_active_slot_safe_mode="$active_slot_safe_mode"
  [[ "$receipt" == /* ]] || die 'rollback receipt path must be absolute'
  [[ -f "$receipt" && ! -L "$receipt" ]] || die 'rollback receipt must be a regular non-symlink file'
  receipt="$(realpath -e -- "$receipt")"
  case "$receipt" in "$state_root"/*) ;; *) die 'rollback receipt is outside the protected slot-link state root' ;; esac
  [[ "$(stat -c '%u:%g:%a:%h' -- "$receipt")" == '0:0:600:1' ]] || die 'rollback receipt ownership/mode/link count is unsafe'
  load_receipt_authority "$receipt" BIND
  latest_authoritative_receipt="$(read_latest_receipt)" || die 'cannot resolve the latest authoritative slot receipt'
  [[ "$latest_authoritative_receipt" == "$receipt" ]] \
    || die 'rollback source is not the latest authoritative slot receipt'
  active_slot_safe_mode="$rollback_active_slot_safe_mode"
  slot_path="${slot_root}/${slot}"
  outstanding_intent="$(find -P "$state_root" -maxdepth 1 -name "${slot}-*.intent" -print -quit)"
  [[ -z "$outstanding_intent" ]] || die 'slot has an outstanding intent; run reconcile instead of starting rollback'
  rollback_receipt_path="${state_root}/${slot}-${operation_id}.rollback.receipt"
  [[ ! -e "$rollback_receipt_path" && ! -L "$rollback_receipt_path" ]] \
    || die 'this bind receipt already has a rollback result'
  assert_runtime_policy
  assert_effect_state REQUESTED
  source_receipt_sha256="$(sha256sum -- "$receipt" | awk '{ print $1 }')"
  operation='ROLLBACK'
  created_at="$(date -u +%Y-%m-%dT%H:%M:%S.%NZ)"
  intent_path="${state_root}/${slot}-${operation_id}.rollback.intent"
  publish_record_exclusive "$intent_path" generate_intent_record
  apply_intent_effect "$intent_path" "$rollback_receipt_path"
  exit 0
fi

mapfile -d '' pending_intents < <(find -P "$state_root" -maxdepth 1 -name "${slot}-*.intent" -print0)
if ((${#pending_intents[@]} == 0)); then
  latest_authoritative_receipt="$(read_latest_receipt)" || die 'reconcile found neither an intent nor a valid latest receipt'
  load_receipt_authority "$latest_authoritative_receipt"
  slot_path="${slot_root}/${slot}"
  if [[ "$operation" == 'BIND' ]]; then
    assert_effect_state REQUESTED
  else
    assert_effect_state PRIOR
  fi
  printf 'SLOT_LINK_RECONCILED_LATEST_RECEIPT=%s\n' "$latest_authoritative_receipt"
  exit 0
fi
((${#pending_intents[@]} == 1)) || die 'reconcile requires at most one outstanding intent for the slot'
intent_path="${pending_intents[0]}"
normalize_exclusive_publication "$intent_path"
[[ "$(stat -c '%u:%g:%a:%h' -- "$intent_path")" == '0:0:600:1' ]] || die 'intent ownership/mode/link count is unsafe'
load_intent "$intent_path"
slot_path="${slot_root}/${slot}"
if [[ "$operation" == 'BIND' ]]; then
  [[ "$(basename -- "$intent_path")" == "${slot}-${operation_id}.bind.intent" ]] || die 'bind intent filename does not match its record'
  receipt_path="${state_root}/${slot}-${operation_id}.bind.receipt"
else
  [[ "$(basename -- "$intent_path")" == "${slot}-${operation_id}.rollback.intent" ]] || die 'rollback intent filename does not match its record'
  receipt_path="${state_root}/${slot}-${operation_id}.rollback.receipt"
fi

if [[ -e "$receipt_path" || -L "$receipt_path" ]]; then
  normalize_exclusive_publication "$receipt_path"
  [[ -f "$receipt_path" && ! -L "$receipt_path" && "$(stat -c '%u:%g:%a:%h' -- "$receipt_path")" == '0:0:600:1' ]] \
    || die 'published receipt is unsafe'
  assert_record_schema "$receipt_path" SLOT_LINK_RECEIPT
  [[ "$(record_value "$receipt_path" RECORD_VERSION)" == '1' \
    && "$(record_value "$receipt_path" RECORD_KIND)" == 'SLOT_LINK_RECEIPT' \
    && "$(record_value "$receipt_path" OPERATION)" == "$operation" \
    && "$(record_value "$receipt_path" OPERATION_ID)" == "$operation_id" \
    && "$(record_value "$receipt_path" SLOT)" == "$slot" \
    && "$(record_value "$receipt_path" INTENT_SHA256)" == "$(sha256sum -- "$intent_path" | awk '{ print $1 }')" ]] \
    || die 'published receipt does not match the outstanding intent'
  expected_receipt_operation="$operation"
  load_receipt_authority "$receipt_path" "$expected_receipt_operation"
  if [[ "$operation" == 'BIND' ]]; then
    assert_effect_state REQUESTED
  else
    assert_effect_state PRIOR
  fi
  update_latest_receipt "$receipt_path"
  remove_completed_intent "$intent_path"
  printf 'SLOT_LINK_RECONCILED_EXISTING_RECEIPT=%s\n' "$receipt_path"
  exit 0
fi

apply_intent_effect "$intent_path" "$receipt_path"
