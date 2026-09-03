#!/usr/bin/bash -p
#
# Move one completed isolated hydration into a root-only promotion boundary,
# seal it, then atomically publish the sealed directory under releases/<SHA>.
# This script never changes a slot, database, nginx or application runtime. It
# does stop the completed one-shot hydration unit before taking its tree.

[[ "$-" == *p* ]] || {
  printf 'promote-release-artifact: execute the installed script directly with its privileged Bash shebang\n' >&2
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
readonly HYDRATION_STATIC_PROPERTIES=(
  Id LoadState UnitFileState FragmentPath DropInPaths Type RemainAfterExit Slice
  User Group SupplementaryGroups DynamicUser ExecStartPre ExecStart Environment
  EnvironmentFiles PassEnvironment SetLoginEnvironment UnsetEnvironment
  NoNewPrivileges PrivateTmp PrivateDevices
  ProtectSystem ProtectHome ProtectProc ProcSubset ProtectKernelTunables
  ProtectKernelModules ProtectKernelLogs ProtectControlGroups ProtectClock
  ProtectHostname CapabilityBoundingSet AmbientCapabilities LockPersonality
  RestrictRealtime RestrictSUIDSGID SystemCallArchitectures
  RestrictAddressFamilies IPAddressDeny IPAddressAllow ReadOnlyPaths
  ReadWritePaths InaccessiblePaths MemoryPressureWatch MemoryMax MemorySwapMax TasksMax
  CPUQuotaPerSecUSec LimitFSIZE UMask KillMode RootDirectory RootImage
)
readonly HYDRATION_COMPLETED_PROPERTIES=(
  "${HYDRATION_STATIC_PROPERTIES[@]}"
  ActiveState SubState Result ExecMainStatus InvocationID ControlGroup
)

die() {
  printf 'promote-release-artifact: %s\n' "$*" >&2
  exit 1
}

path_is_not_group_or_other_writable() {
  local candidate_mode
  candidate_mode="$(stat -c '%a' -- "$1")" || return 1
  (( (8#$candidate_mode & 8#22) == 0 ))
}

find_has_match() {
  local probe_path find_status
  probe_path="$(mktemp --tmpdir=/run/leetplus-release '.promotion-find.XXXXXX')" \
    || die 'cannot allocate a bounded promotion filesystem inventory probe'
  attestation_temp_files+=("$probe_path")
  set +e
  find "$@" -print0 -quit > "$probe_path"
  find_status=$?
  set -e
  ((find_status == 0)) || die 'required promotion filesystem inventory producer failed'
  [[ -s "$probe_path" ]]
}

release_sha=''
slot=''
inherited_production_control_lock_fd=''
while (($# > 0)); do
  case "$1" in
    --release-sha) release_sha="${2:-}"; shift 2 ;;
    --slot) slot="${2:-}"; shift 2 ;;
    --inherited-production-control-lock-fd)
      inherited_production_control_lock_fd="${2:-}"
      shift 2
      ;;
    --help|-h)
      printf 'Usage: promote-release-artifact.sh --release-sha <sha> --slot blue|green [--inherited-production-control-lock-fd 8]\n'
      exit 0
      ;;
    *) die "unknown argument: $1" ;;
  esac
done

((EUID == 0)) || die 'production promotion must run as root'
PATH='/usr/sbin:/usr/bin:/sbin:/bin'
export PATH
[[ "$release_sha" =~ $RELEASE_SHA_PATTERN ]] || die 'release SHA must be 40 lowercase hexadecimal characters'
[[ "$slot" =~ $SLOT_PATTERN ]] || die 'slot must be blue or green'
[[ -z "$inherited_production_control_lock_fd" \
  || "$inherited_production_control_lock_fd" == '8' ]] \
  || die 'inherited production-control lock descriptor must be exact fd 8'
for command_name in awk basename chmod chown dirname find flock getent grep id ln mktemp mv realpath rm sha256sum stat sync systemctl systemd-analyze timeout; do
  command -v "$command_name" >/dev/null 2>&1 || die "required command is unavailable: $command_name"
done

verify_root_executable() {
  local executable_path="$1"
  local ancestor
  [[ -f "$executable_path" && -x "$executable_path" && ! -L "$executable_path" ]] \
    || die 'installed release sealer is absent or unsafe'
  [[ "$(realpath -e -- "$executable_path")" == "$executable_path" ]] \
    || die 'installed release sealer path traverses a symlink'
  [[ "$(stat -c '%u:%g' -- "$executable_path")" == '0:0' ]] \
    && path_is_not_group_or_other_writable "$executable_path" \
    || die 'installed release sealer must be root:root and non-writable by group/other'

  ancestor="$(dirname -- "$executable_path")"
  while :; do
    [[ -d "$ancestor" && ! -L "$ancestor" \
      && "$(stat -c '%u:%g' -- "$ancestor")" == '0:0' ]] \
      && path_is_not_group_or_other_writable "$ancestor" \
      || die "release sealer ancestor is not root-controlled: ${ancestor}"
    [[ "$ancestor" == '/' ]] && break
    ancestor="$(dirname -- "$ancestor")"
  done
}

verify_root_file() {
  local file_path="$1"
  local label="$2"
  local ancestor
  [[ -f "$file_path" && ! -L "$file_path" ]] || die "${label} is absent or unsafe"
  [[ "$(realpath -e -- "$file_path")" == "$file_path" ]] \
    || die "${label} path traverses a symlink"
  [[ "$(stat -c '%u:%g' -- "$file_path")" == '0:0' ]] \
    && path_is_not_group_or_other_writable "$file_path" \
    || die "${label} must be root:root and non-writable by group/other"

  ancestor="$(dirname -- "$file_path")"
  while :; do
    [[ -d "$ancestor" && ! -L "$ancestor" \
      && "$(stat -c '%u:%g' -- "$ancestor")" == '0:0' ]] \
      && path_is_not_group_or_other_writable "$ancestor" \
      || die "${label} ancestor is not root-controlled: ${ancestor}"
    [[ "$ancestor" == '/' ]] && break
    ancestor="$(dirname -- "$ancestor")"
  done
}

extract_installed_verifier_pin() {
  local receipt="$1"
  awk '
    /^  "installedGenerationVerifierSha256": "[0-9a-f]+",$/ {
      count += 1
      value = $0
      sub(/^  "installedGenerationVerifierSha256": "/, "", value)
      sub(/",$/, "", value)
    }
    END {
      if (count != 1) exit 1
      print value
    }
  ' "$receipt"
}

extract_installed_effective_lane() {
  local receipt="$1"
  awk '
    /^  "effectiveLane": "(L1_RUNTIME|L2_SCHEMA_SECURITY)",$/ {
      count += 1
      value = $0
      sub(/^  "effectiveLane": "/, "", value)
      sub(/",$/, "", value)
    }
    END {
      if (count != 1) exit 1
      print value
    }
  ' "$receipt"
}

extract_installed_impact_receipt_sha256() {
  local receipt="$1"
  awk '
    /^  "impactReceiptSha256": "[0-9a-f]+",$/ {
      count += 1
      value = $0
      sub(/^  "impactReceiptSha256": "/, "", value)
      sub(/",$/, "", value)
    }
    END {
      if (count != 1 || length(value) != 64) exit 1
      print value
    }
  ' "$receipt"
}

validate_installed_generation_attestation() {
  local record="$1"
  local -a lines=()
  local sha256_pattern='^[0-9a-f]{64}$'
  local receipt_sha256 root_manifest_sha256 install_map_sha256
  local installer_sha256 verifier_sha256 stager_sha256 attestor_sha256
  local hydration_unit_sha256 sealer_sha256 promoter_sha256
  local effective_lane impact_receipt_sha256 attested_digest

  [[ -f "$record" && ! -L "$record" \
    && "$(stat -c '%u:%g:%a' -- "$record")" == '0:0:600' \
    && "$(stat -c '%s' -- "$record")" -le 16384 ]] \
    || die 'installed-generation verifier output is absent or unsafe'
  mapfile -t lines < "$record"
  ((${#lines[@]} == 16)) \
    || die 'installed-generation verifier output does not have the exact 16-line schema'
  [[ "${lines[0]}" == 'PRODUCTION_CONTROL_INSTALLED_GENERATION=PASS' \
    && "${lines[1]}" == "PRODUCTION_CONTROL_RELEASE_SHA=${release_sha}" \
    && "${lines[2]}" == "PRODUCTION_CONTROL_RECEIPT_PATH=${production_control_receipt}" \
    && "${lines[13]}" == 'PRODUCTION_CONTROL_INSTALLED_FILE_COUNT=52' \
    && "${lines[14]}" =~ ^PRODUCTION_CONTROL_EFFECTIVE_LANE=(L1_RUNTIME|L2_SCHEMA_SECURITY)$ \
    && "${lines[15]}" =~ ^PRODUCTION_CONTROL_IMPACT_RECEIPT_SHA256=([0-9a-f]{64})$ ]] \
    || die 'installed-generation verifier output identity is malformed'
  [[ "${lines[3]}" =~ ^PRODUCTION_CONTROL_RECEIPT_SHA256=([0-9a-f]{64})$ \
    && "${lines[4]}" =~ ^PRODUCTION_CONTROL_ROOT_MANIFEST_SHA256=([0-9a-f]{64})$ \
    && "${lines[5]}" =~ ^PRODUCTION_CONTROL_INSTALL_MAP_SHA256=([0-9a-f]{64})$ \
    && "${lines[6]}" =~ ^PRODUCTION_CONTROL_INSTALLER_SHA256=([0-9a-f]{64})$ \
    && "${lines[7]}" =~ ^PRODUCTION_CONTROL_VERIFIER_SHA256=([0-9a-f]{64})$ \
    && "${lines[8]}" =~ ^PRODUCTION_CONTROL_STAGER_SHA256=([0-9a-f]{64})$ \
    && "${lines[9]}" =~ ^PRODUCTION_CONTROL_ATTESTOR_SHA256=([0-9a-f]{64})$ \
    && "${lines[10]}" =~ ^PRODUCTION_CONTROL_HYDRATION_UNIT_SHA256=([0-9a-f]{64})$ \
    && "${lines[11]}" =~ ^PRODUCTION_CONTROL_SEALER_SHA256=([0-9a-f]{64})$ \
    && "${lines[12]}" =~ ^PRODUCTION_CONTROL_PROMOTER_SHA256=([0-9a-f]{64})$ ]] \
    || die 'installed-generation verifier output digests are malformed'

  receipt_sha256="${lines[3]#*=}"
  root_manifest_sha256="${lines[4]#*=}"
  install_map_sha256="${lines[5]#*=}"
  installer_sha256="${lines[6]#*=}"
  verifier_sha256="${lines[7]#*=}"
  stager_sha256="${lines[8]#*=}"
  attestor_sha256="${lines[9]#*=}"
  hydration_unit_sha256="${lines[10]#*=}"
  sealer_sha256="${lines[11]#*=}"
  promoter_sha256="${lines[12]#*=}"
  effective_lane="${lines[14]#*=}"
  impact_receipt_sha256="${lines[15]#*=}"
  for attested_digest in \
    "$receipt_sha256" "$root_manifest_sha256" "$install_map_sha256" \
    "$installer_sha256" "$verifier_sha256" "$stager_sha256" \
    "$attestor_sha256" "$hydration_unit_sha256" "$sealer_sha256" \
    "$promoter_sha256"; do
    [[ "$attested_digest" =~ $sha256_pattern ]] \
      || die 'installed-generation verifier emitted an invalid SHA-256 digest'
  done

  [[ "$effective_lane" == "$(extract_installed_effective_lane "$production_control_receipt")" \
    && "$impact_receipt_sha256" == "$(extract_installed_impact_receipt_sha256 "$production_control_receipt")" ]] \
    || die 'installed-generation verifier lane provenance differs from its accepted receipt'

  [[ "$receipt_sha256" == "$(sha256sum -- "$production_control_receipt" | awk '{ print $1 }')" \
    && "$root_manifest_sha256" == "$(sha256sum -- "$production_control_generation_root/SHA256SUMS" | awk '{ print $1 }')" \
    && "$install_map_sha256" == "$(sha256sum -- "$production_control_generation_root/docs/deployment/production-control-authority/production-control-install-map.tsv" | awk '{ print $1 }')" \
    && "$installer_sha256" == "$(sha256sum -- "$production_control_installer" | awk '{ print $1 }')" \
    && "$verifier_sha256" == "$installed_verifier_sha256" \
    && "$stager_sha256" == "$(sha256sum -- "$hydration_stager" | awk '{ print $1 }')" \
    && "$attestor_sha256" == "$(sha256sum -- "$hydration_attestor" | awk '{ print $1 }')" \
    && "$hydration_unit_sha256" == "$(sha256sum -- "$hydration_fragment" | awk '{ print $1 }')" \
    && "$sealer_sha256" == "$(sha256sum -- "$sealer" | awk '{ print $1 }')" \
    && "$promoter_sha256" == "$(sha256sum -- "$production_promoter" | awk '{ print $1 }')" ]] \
    || die 'installed-generation verifier output differs from current installed authority bytes'
}

attestation_value() {
  local record="$1"
  local key="$2"
  local count value
  count="$(awk -F= -v key="$key" '$1 == key { count += 1 } END { print count + 0 }' "$record")"
  [[ "$count" == '1' ]] || return 1
  value="$(awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print }' "$record")"
  [[ "$value" != *$'\r'* && "$value" != *$'\n'* ]] || return 1
  printf '%s' "$value"
}

validate_hydrated_manifest_exact_tree() {
  local artifact_directory="$1"
  /usr/bin/node - "$artifact_directory" <<'NODE' \
    || die 'hydrated artifact manifest path set is not canonical and exact'
const fs = require('node:fs');
const path = require('node:path');
const { TextDecoder } = require('node:util');

const [providedRoot] = process.argv.slice(2);
const root = fs.realpathSync.native(providedRoot);
const manifestName = 'HYDRATED_SHA256SUMS';
const mutableCache = 'apps/web/.next/cache';
const compareUtf8 = (left, right) =>
  Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));

function fail(message) {
  throw new Error(`hydrated manifest exact-tree validation failed: ${message}`);
}

function assertCanonicalPath(relativePath) {
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
  ) fail(`non-canonical path: ${relativePath}`);
}

const actualPaths = [];
let visitedEntries = 0;
function walk(directory, relativeDirectory = '') {
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => compareUtf8(left.name, right.name));
  for (const entry of entries) {
    visitedEntries += 1;
    if (visitedEntries > 1000000) fail('artifact tree exceeds the entry limit');
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
    assertCanonicalPath(relativePath);
    const absolutePath = path.join(root, ...relativePath.split('/'));
    const stat = fs.lstatSync(absolutePath);
    if (stat.isDirectory()) {
      if (relativePath !== mutableCache) walk(absolutePath, relativePath);
      continue;
    }
    if (stat.isFile() && relativePath !== manifestName) {
      if (stat.nlink !== 1) fail(`regular file has an unsafe link count: ${relativePath}`);
      actualPaths.push(`./${relativePath}`);
    }
  }
}
walk(root);
actualPaths.sort(compareUtf8);

const manifestPath = path.join(root, manifestName);
const manifestStat = fs.lstatSync(manifestPath);
if (
  !manifestStat.isFile() ||
  manifestStat.isSymbolicLink() ||
  manifestStat.nlink !== 1 ||
  manifestStat.size === 0 ||
  manifestStat.size > 64 * 1024 * 1024
) fail('manifest is not one bounded regular file');
const manifestBytes = fs.readFileSync(manifestPath);
let manifestText;
try {
  manifestText = new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes);
} catch {
  fail('manifest is not valid UTF-8');
}
if (!manifestText.endsWith('\n') || manifestText.endsWith('\n\n')) {
  fail('manifest does not have canonical complete LF records');
}

const manifestPaths = [];
const seen = new Set();
let priorPath;
for (const line of manifestText.slice(0, -1).split('\n')) {
  const match = /^([0-9a-f]{64})  (\.\/.+)$/u.exec(line);
  if (!match) fail('manifest contains a malformed record');
  const manifestPathValue = match[2];
  const relativePath = manifestPathValue.slice(2);
  assertCanonicalPath(relativePath);
  if (relativePath === manifestName) fail('manifest hashes itself');
  if (seen.has(manifestPathValue)) fail(`manifest duplicates path: ${manifestPathValue}`);
  if (priorPath !== undefined && compareUtf8(priorPath, manifestPathValue) >= 0) {
    fail('manifest path set is not in canonical byte order');
  }
  const absolutePath = path.join(root, ...relativePath.split('/'));
  const stat = fs.lstatSync(absolutePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    fail(`manifest target is not one regular file: ${manifestPathValue}`);
  }
  priorPath = manifestPathValue;
  seen.add(manifestPathValue);
  manifestPaths.push(manifestPathValue);
}

if (
  manifestPaths.length !== actualPaths.length ||
  manifestPaths.some((manifestPathValue, index) => manifestPathValue !== actualPaths[index])
) {
  const manifestSet = new Set(manifestPaths);
  const actualSet = new Set(actualPaths);
  const omitted = actualPaths.find((candidate) => !manifestSet.has(candidate));
  const absent = manifestPaths.find((candidate) => !actualSet.has(candidate));
  fail(
    `manifest does not cover the exact regular-file tree` +
      `${omitted ? `; omitted=${omitted}` : ''}` +
      `${absent ? `; absent=${absent}` : ''}`
  );
}
NODE
  (
    cd -- "$artifact_directory"
    sha256sum --strict --check --quiet HYDRATED_SHA256SUMS
  ) || die 'hydrated artifact manifest digest verification failed'
}

normalize_attestation_publication() {
  local record="$1"
  local record_identity candidate candidate_identity matching_candidate=''
  local matching_count=0
  local link_count candidate_inventory find_status
  [[ -f "$record" && ! -L "$record" ]] || die 'release hydration attestation is absent or unsafe'
  link_count="$(stat -c '%h' -- "$record")"
  [[ "$link_count" == '1' || "$link_count" == '2' ]] \
    || die 'release hydration attestation has an unsafe link count'
  if [[ "$link_count" == '1' ]]; then
    if find_has_match -P "$receipt_root" -maxdepth 1 \
      -name "$(basename -- "$record").new.*"; then
      die 'hydration attestation has an unrelated publication residue'
    fi
    return 0
  fi
  record_identity="$(stat -c '%d:%i' -- "$record")"
  candidate_inventory="$(mktemp --tmpdir=/run/leetplus-release '.promotion-aliases.XXXXXX')" \
    || die 'cannot allocate hydration attestation alias inventory'
  attestation_temp_files+=("$candidate_inventory")
  find_status=0
  find -P "$receipt_root" -maxdepth 1 -type f \
    -name "$(basename -- "$record").new.*" -print0 > "$candidate_inventory" \
    || find_status=$?
  ((find_status == 0)) || die 'hydration attestation alias inventory producer failed'
  while IFS= read -r -d '' candidate; do
    candidate_identity="$(stat -c '%d:%i' -- "$candidate")"
    if [[ "$candidate_identity" == "$record_identity" ]]; then
      matching_candidate="$candidate"
      matching_count=$((matching_count + 1))
    fi
  done < "$candidate_inventory"
  ((matching_count == 1)) || die 'cannot reconcile hydration attestation publication aliases'
  [[ "$(stat -c '%U:%G:%a:%h' -- "$matching_candidate")" == 'root:root:400:2' ]] \
    || die 'hydration attestation publication alias is unsafe'
  rm -- "$matching_candidate"
  sync -f "$receipt_root"
  [[ "$(stat -c '%h' -- "$record")" == '1' ]] \
    || die 'hydration attestation publication was not normalized'
}

validate_publication_attestation() {
  local record="$1"
  local artifact_directory="$2"
  local source_receipt_sha256 hydrated_manifest_sha256
  normalize_attestation_publication "$record"
  [[ "$(stat -c '%U:%G:%a:%h' -- "$record")" == 'root:root:400:1' ]] \
    || die 'release hydration attestation must be root:root mode 0400 with one link'
  awk -F= '
    BEGIN {
      split("RECORD_VERSION RELEASE_SHA RELEASE_SLOT HYDRATION_INVOCATION_ID HYDRATION_SOURCE_RECEIPT_SHA256 HYDRATION_UNIT_SHA256 HYDRATION_STAGER_SHA256 HYDRATION_POLICY_SHA256 HYDRATED_MANIFEST_SHA256 RELEASE_DIRECTORY PUBLICATION_AUTHORIZED RUNTIME_SWITCHED", expected, " ")
    }
    !/^[A-Z0-9_]+=[^\r\n]*$/ { exit 1 }
    { if ($1 != expected[NR] || seen[$1]++) exit 1 }
    END { if (NR != 12) exit 1 }
  ' "$record" || die 'release hydration attestation schema is not canonical'
  [[ "$(attestation_value "$record" RECORD_VERSION)" == '1' \
    && "$(attestation_value "$record" RELEASE_SHA)" == "$release_sha" \
    && "$(attestation_value "$record" RELEASE_SLOT)" == "$slot" \
    && "$(attestation_value "$record" HYDRATION_INVOCATION_ID)" =~ ^[0-9a-f]{32}$ \
    && "$(attestation_value "$record" RELEASE_DIRECTORY)" == "$release_directory" \
    && "$(attestation_value "$record" PUBLICATION_AUTHORIZED)" == 'true' \
    && "$(attestation_value "$record" RUNTIME_SWITCHED)" == 'false' ]] \
    || die 'release hydration attestation authority values are invalid'
  local digest_key digest_value
  for digest_key in HYDRATION_SOURCE_RECEIPT_SHA256 HYDRATION_UNIT_SHA256 \
    HYDRATION_STAGER_SHA256 HYDRATION_POLICY_SHA256 HYDRATED_MANIFEST_SHA256; do
    digest_value="$(attestation_value "$record" "$digest_key")" \
      || die 'release hydration attestation digest is absent'
    [[ "$digest_value" =~ ^[0-9a-f]{64}$ ]] \
      || die 'release hydration attestation digest is invalid'
  done
  [[ -f "$artifact_directory/HYDRATION_SANDBOX_RECEIPT" \
    && ! -L "$artifact_directory/HYDRATION_SANDBOX_RECEIPT" \
    && -f "$artifact_directory/HYDRATED_SHA256SUMS" \
    && ! -L "$artifact_directory/HYDRATED_SHA256SUMS" ]] \
    || die 'attested artifact manifests are absent or unsafe'
  source_receipt_sha256="$(sha256sum -- "$artifact_directory/HYDRATION_SANDBOX_RECEIPT" | awk '{ print $1 }')"
  hydrated_manifest_sha256="$(sha256sum -- "$artifact_directory/HYDRATED_SHA256SUMS" | awk '{ print $1 }')"
  [[ "$(attestation_value "$record" HYDRATION_SOURCE_RECEIPT_SHA256)" == "$source_receipt_sha256" \
    && "$(attestation_value "$record" HYDRATED_MANIFEST_SHA256)" == "$hydrated_manifest_sha256" \
    && "$(attestation_value "$record" HYDRATION_INVOCATION_ID)" == \
      "$(awk -F= '$1 == "INVOCATION_ID" { print $2 }' "$artifact_directory/HYDRATION_SANDBOX_RECEIPT")" ]] \
    || die 'release hydration attestation differs from the exact artifact evidence'
  [[ -f "$promotion_intent" && ! -L "$promotion_intent" ]] \
    || die 'durable promotion intent is absent from published hydration authority'
  validate_promotion_intent "$promotion_intent"
  local bound_key
  for bound_key in RELEASE_SHA RELEASE_SLOT HYDRATION_INVOCATION_ID \
    HYDRATION_SOURCE_RECEIPT_SHA256 HYDRATION_UNIT_SHA256 \
    HYDRATION_STAGER_SHA256 HYDRATION_POLICY_SHA256 HYDRATED_MANIFEST_SHA256 \
    RELEASE_DIRECTORY RUNTIME_SWITCHED; do
    [[ "$(attestation_value "$record" "$bound_key")" == \
      "$(attestation_value "$promotion_intent" "$bound_key")" ]] \
      || die "published hydration authority differs from durable promotion intent: ${bound_key}"
  done
}

cleanup_unpublished_record_temporaries() {
  local record="$1"
  local candidate candidate_count=0 candidate_inventory find_status
  candidate_inventory="$(mktemp --tmpdir=/run/leetplus-release '.promotion-temporaries.XXXXXX')" \
    || die 'cannot allocate unpublished promotion record inventory'
  attestation_temp_files+=("$candidate_inventory")
  find_status=0
  find -P "$receipt_root" -maxdepth 1 -type f \
    -name "$(basename -- "$record").new.*" -print0 > "$candidate_inventory" \
    || find_status=$?
  ((find_status == 0)) || die 'unpublished promotion record inventory producer failed'
  while IFS= read -r -d '' candidate; do
    candidate_count=$((candidate_count + 1))
    ((candidate_count <= 16)) || die 'promotion record has too many unpublished temporaries'
    [[ -f "$candidate" && ! -L "$candidate" \
      && "$(stat -c '%U:%G:%h' -- "$candidate")" == 'root:root:1' \
      && ( "$(stat -c '%a' -- "$candidate")" == '400' \
        || "$(stat -c '%a' -- "$candidate")" == '600' ) ]] \
      || die 'promotion record has an unsafe unpublished temporary'
    rm -- "$candidate"
  done < "$candidate_inventory"
  ((candidate_count == 0)) || sync -f "$receipt_root"
}

publish_publication_attestation() {
  local record="$1"
  local temporary_record="${record}.new.$$"
  local record_fd
  assert_managed_root_boundary
  cleanup_unpublished_record_temporaries "$record"
  [[ ! -e "$record" && ! -L "$record" \
    && ! -e "$temporary_record" && ! -L "$temporary_record" ]] \
    || die 'release hydration attestation publication path already exists'
  set -o noclobber
  exec {record_fd}> "$temporary_record" \
    || die 'cannot create hydration attestation publication temporary'
  set +o noclobber
  {
    printf 'RECORD_VERSION=1\n'
    printf 'RELEASE_SHA=%s\n' "$release_sha"
    printf 'RELEASE_SLOT=%s\n' "$slot"
    printf 'HYDRATION_INVOCATION_ID=%s\n' "$hydration_invocation_id"
    printf 'HYDRATION_SOURCE_RECEIPT_SHA256=%s\n' "$published_source_receipt_sha256"
    printf 'HYDRATION_UNIT_SHA256=%s\n' "$hydration_fragment_sha256"
    printf 'HYDRATION_STAGER_SHA256=%s\n' "$hydration_stager_sha256"
    printf 'HYDRATION_POLICY_SHA256=%s\n' "$hydration_policy_sha256"
    printf 'HYDRATED_MANIFEST_SHA256=%s\n' "$published_hydrated_manifest_sha256"
    printf 'RELEASE_DIRECTORY=%s\n' "$release_directory"
    printf 'PUBLICATION_AUTHORIZED=true\n'
    printf 'RUNTIME_SWITCHED=false\n'
  } >&"$record_fd"
  exec {record_fd}>&-
  chmod 0400 -- "$temporary_record"
  sync -f "$temporary_record"
  ln -T -- "$temporary_record" "$record" \
    || die 'cannot publish hydration attestation exclusively'
  sync -f "$receipt_root"
  rm -- "$temporary_record"
  sync -f "$receipt_root"
  validate_publication_attestation "$record" "$promotion_directory"
  assert_managed_root_boundary
}

validate_promotion_intent() {
  local record="$1"
  local digest_key digest_value
  normalize_attestation_publication "$record"
  [[ "$(stat -c '%U:%G:%a:%h' -- "$record")" == 'root:root:400:1' ]] \
    || die 'promotion intent must be root:root mode 0400 with one link'
  awk -F= '
    BEGIN {
      split("RECORD_VERSION RELEASE_SHA RELEASE_SLOT HYDRATION_UNIT HYDRATION_INVOCATION_ID HYDRATION_SOURCE_RECEIPT_SHA256 HYDRATION_UNIT_SHA256 HYDRATION_STAGER_SHA256 HYDRATION_POLICY_SHA256 HYDRATED_MANIFEST_SHA256 SOURCE_DIRECTORY PROMOTION_DIRECTORY RELEASE_DIRECTORY PROMOTION_AUTHORIZED RUNTIME_SWITCHED", expected, " ")
    }
    !/^[A-Z0-9_]+=[^\r\n]*$/ { exit 1 }
    { if ($1 != expected[NR] || seen[$1]++) exit 1 }
    END { if (NR != 15) exit 1 }
  ' "$record" || die 'promotion intent schema is not canonical'
  [[ "$(attestation_value "$record" RECORD_VERSION)" == '1' \
    && "$(attestation_value "$record" RELEASE_SHA)" == "$release_sha" \
    && "$(attestation_value "$record" RELEASE_SLOT)" == "$slot" \
    && "$(attestation_value "$record" HYDRATION_UNIT)" == "$hydration_unit" \
    && "$(attestation_value "$record" HYDRATION_INVOCATION_ID)" =~ ^[0-9a-f]{32}$ \
    && "$(attestation_value "$record" SOURCE_DIRECTORY)" == "$source_directory" \
    && "$(attestation_value "$record" PROMOTION_DIRECTORY)" == "$promotion_directory" \
    && "$(attestation_value "$record" RELEASE_DIRECTORY)" == "$release_directory" \
    && "$(attestation_value "$record" PROMOTION_AUTHORIZED)" == 'true' \
    && "$(attestation_value "$record" RUNTIME_SWITCHED)" == 'false' ]] \
    || die 'promotion intent authority values are invalid'
  for digest_key in HYDRATION_SOURCE_RECEIPT_SHA256 HYDRATION_UNIT_SHA256 \
    HYDRATION_STAGER_SHA256 HYDRATION_POLICY_SHA256 HYDRATED_MANIFEST_SHA256; do
    digest_value="$(attestation_value "$record" "$digest_key")" \
      || die 'promotion intent digest is absent'
    [[ "$digest_value" =~ ^[0-9a-f]{64}$ ]] \
      || die 'promotion intent digest is invalid'
  done
}

load_promotion_intent_authority() {
  validate_promotion_intent "$promotion_intent"
  hydration_invocation_id="$(attestation_value "$promotion_intent" HYDRATION_INVOCATION_ID)"
  hydration_fragment_sha256="$(attestation_value "$promotion_intent" HYDRATION_UNIT_SHA256)"
  hydration_stager_sha256="$(attestation_value "$promotion_intent" HYDRATION_STAGER_SHA256)"
  hydration_policy_sha256="$(attestation_value "$promotion_intent" HYDRATION_POLICY_SHA256)"
  published_source_receipt_sha256="$(attestation_value "$promotion_intent" HYDRATION_SOURCE_RECEIPT_SHA256)"
  published_hydrated_manifest_sha256="$(attestation_value "$promotion_intent" HYDRATED_MANIFEST_SHA256)"
}

validate_intent_artifact() {
  local artifact_directory="$1"
  local source_receipt_sha256 hydrated_manifest_sha256
  [[ -f "$artifact_directory/HYDRATION_SANDBOX_RECEIPT" \
    && ! -L "$artifact_directory/HYDRATION_SANDBOX_RECEIPT" \
    && -f "$artifact_directory/HYDRATED_SHA256SUMS" \
    && ! -L "$artifact_directory/HYDRATED_SHA256SUMS" ]] \
    || die 'promotion intent artifact evidence is absent or unsafe'
  source_receipt_sha256="$(sha256sum -- "$artifact_directory/HYDRATION_SANDBOX_RECEIPT" | awk '{ print $1 }')"
  hydrated_manifest_sha256="$(sha256sum -- "$artifact_directory/HYDRATED_SHA256SUMS" | awk '{ print $1 }')"
  [[ "$source_receipt_sha256" == "$published_source_receipt_sha256" \
    && "$hydrated_manifest_sha256" == "$published_hydrated_manifest_sha256" \
    && "$(awk -F= '$1 == "INVOCATION_ID" { print $2 }' \
      "$artifact_directory/HYDRATION_SANDBOX_RECEIPT")" == "$hydration_invocation_id" ]] \
    || die 'artifact evidence differs from durable promotion intent'
  validate_hydrated_manifest_exact_tree "$artifact_directory"
}

publish_promotion_intent() {
  local record="$promotion_intent"
  local temporary_record="${record}.new.$$"
  local record_fd
  assert_managed_root_boundary
  cleanup_unpublished_record_temporaries "$record"
  [[ ! -e "$record" && ! -L "$record" \
    && ! -e "$temporary_record" && ! -L "$temporary_record" ]] \
    || die 'promotion intent publication path already exists'
  set -o noclobber
  exec {record_fd}> "$temporary_record" || die 'cannot create promotion intent temporary'
  set +o noclobber
  {
    printf 'RECORD_VERSION=1\n'
    printf 'RELEASE_SHA=%s\n' "$release_sha"
    printf 'RELEASE_SLOT=%s\n' "$slot"
    printf 'HYDRATION_UNIT=%s\n' "$hydration_unit"
    printf 'HYDRATION_INVOCATION_ID=%s\n' "$hydration_invocation_id"
    printf 'HYDRATION_SOURCE_RECEIPT_SHA256=%s\n' "$published_source_receipt_sha256"
    printf 'HYDRATION_UNIT_SHA256=%s\n' "$hydration_fragment_sha256"
    printf 'HYDRATION_STAGER_SHA256=%s\n' "$hydration_stager_sha256"
    printf 'HYDRATION_POLICY_SHA256=%s\n' "$hydration_policy_sha256"
    printf 'HYDRATED_MANIFEST_SHA256=%s\n' "$published_hydrated_manifest_sha256"
    printf 'SOURCE_DIRECTORY=%s\n' "$source_directory"
    printf 'PROMOTION_DIRECTORY=%s\n' "$promotion_directory"
    printf 'RELEASE_DIRECTORY=%s\n' "$release_directory"
    printf 'PROMOTION_AUTHORIZED=true\n'
    printf 'RUNTIME_SWITCHED=false\n'
  } >&"$record_fd"
  exec {record_fd}>&-
  chmod 0400 -- "$temporary_record"
  sync -f "$temporary_record"
  ln -T -- "$temporary_record" "$record" || die 'cannot publish promotion intent exclusively'
  sync -f "$receipt_root"
  rm -- "$temporary_record"
  sync -f "$receipt_root"
  validate_promotion_intent "$record"
  assert_managed_root_boundary
}

systemd_value() {
  local property="$1"
  local unit="$2"
  timeout --foreground --kill-after=5s 15s \
    systemctl show --property="$property" --value "$unit"
}

write_systemd_snapshot() {
  local output_path="$1"
  local unit="$2"
  shift 2
  local command=(systemctl show)
  local property environment_files_count
  for property in "$@"; do
    command+=("--property=${property}")
  done
  timeout --foreground --kill-after=5s 15s "${command[@]}" "$unit" > "$output_path" \
    || die 'cannot acquire the exact effective hydration unit property snapshot'
  environment_files_count="$(grep -c '^EnvironmentFiles=' "$output_path" || true)"
  [[ "$environment_files_count" =~ ^[0-9]+$ && "$environment_files_count" -le 1 ]] \
    || die 'effective hydration snapshot EnvironmentFiles count is malformed'
  if [[ "$environment_files_count" == 0 ]]; then
    # systemctl omits an empty EnvironmentFiles a(sb) property even when it is
    # explicitly requested. Restore the canonical empty property for attestation.
    printf 'EnvironmentFiles=\n' >> "$output_path"
  fi
  chmod 0600 -- "$output_path"
}

attest_static_hydration_policy() {
  local policy_snapshot quiesced_attestation
  policy_snapshot="$(mktemp --tmpdir=/run/leetplus-release '.hydration-policy.XXXXXX')"
  attestation_temp_files+=("$policy_snapshot")
  write_systemd_snapshot \
    "$policy_snapshot" \
    "$hydration_unit" \
    "${HYDRATION_STATIC_PROPERTIES[@]}"
  quiesced_attestation="$(
    /usr/bin/node "$hydration_attestor" \
      --release-sha "$release_sha" \
      --snapshot "$policy_snapshot" \
      --unit-file "$hydration_fragment" \
      --stager-file "$hydration_stager" \
      --phase policy
  )" || die 'quiesced hydration unit policy attestation failed'
  [[ "$(awk 'END { print NR }' <<< "$quiesced_attestation")" == '5' \
    && "$(grep -c "^HYDRATION_SYSTEMD_FRAGMENT_SHA256=${hydration_fragment_sha256}$" \
      <<< "$quiesced_attestation")" == '1' \
    && "$(grep -c "^HYDRATION_STAGER_SHA256=${hydration_stager_sha256}$" \
      <<< "$quiesced_attestation")" == '1' \
    && "$(grep -c "^HYDRATION_SYSTEMD_POLICY_SHA256=${hydration_policy_sha256}$" \
      <<< "$quiesced_attestation")" == '1' ]] \
    || die 'effective hydration policy differs from durable promotion authority'
}

ensure_hydration_invocation_quiesced() {
  local active_state hydration_control_group=''
  timeout --foreground --kill-after=5s 30s systemd-analyze verify "$hydration_fragment" \
    || die 'installed hydration systemd unit fails systemd-analyze verification'
  active_state="$(systemd_value ActiveState "$hydration_unit")"
  case "$active_state" in
    active)
      [[ "$(systemd_value SubState "$hydration_unit")" == 'exited' \
        && "$(systemd_value Result "$hydration_unit")" == 'success' \
        && "$(systemd_value ExecMainStatus "$hydration_unit")" == '0' \
        && "$(systemd_value InvocationID "$hydration_unit")" == "$hydration_invocation_id" ]] \
        || die 'live hydration state differs from durable promotion intent'
      hydration_control_group="$(systemd_value ControlGroup "$hydration_unit")"
      assert_empty_hydration_cgroup "$hydration_control_group"
      timeout --foreground --kill-after=5s 20s systemctl stop "$hydration_unit" \
        || die 'cannot stop completed hydration unit before promotion'
      ;;
    deactivating)
      [[ "$(systemd_value InvocationID "$hydration_unit")" == "$hydration_invocation_id" ]] \
        || die 'deactivating hydration invocation differs from durable promotion intent'
      timeout --foreground --kill-after=5s 20s systemctl stop "$hydration_unit" \
        || die 'cannot reconcile an in-flight hydration stop'
      ;;
    inactive) ;;
    *) die 'hydration unit is neither the completed invocation nor durably inactive' ;;
  esac
  [[ "$(systemd_value ActiveState "$hydration_unit")" == 'inactive' ]] \
    || die 'hydration unit did not become inactive before promotion'
  if [[ -n "$hydration_control_group" \
    && -e "/sys/fs/cgroup${hydration_control_group}/cgroup.procs" ]]; then
    assert_empty_hydration_cgroup "$hydration_control_group"
  fi
  attest_static_hydration_policy
  assert_no_build_identity_processes
}

attestation_temp_files=()
cleanup_attestation_temp_files() {
  local path
  for path in "${attestation_temp_files[@]}"; do
    rm -f -- "$path"
  done
}
trap cleanup_attestation_temp_files EXIT

assert_empty_hydration_cgroup() {
  local control_group="$1"
  local expected_control_group="/system.slice/leetplus-release-hydrate@${release_sha}.service"
  local live_pid=''
  local procs_path="/sys/fs/cgroup${expected_control_group}/cgroup.procs"
  [[ -z "$control_group" || "$control_group" == "$expected_control_group" ]] \
    || die 'hydration unit cgroup identity is unexpected'
  # systemd may prune a completed oneshot cgroup before ControlGroup is read.
  # An absent canonical cgroup has no process list; the global UID fence below
  # still rejects any surviving build-identity process in another cgroup.
  if [[ ! -e "$procs_path" && ! -L "$procs_path" ]]; then
    return 0
  fi
  [[ -f "$procs_path" && ! -L "$procs_path" ]] \
    || die 'hydration unit cgroup process list is unavailable'
  # cgroup.procs is a virtual kernel file and normally reports st_size=0 even
  # while it contains PIDs. Read it; metadata size is not quiescence evidence.
  if IFS= read -r live_pid < "$procs_path"; then
    [[ "$live_pid" =~ ^[1-9][0-9]*$ ]] \
      || die 'hydration cgroup process list contains malformed data'
    die "hydration cgroup still contains process ${live_pid}"
  fi
}

assert_exact_build_identity() {
  local passwd_record group_record
  local foreign_gid_group foreign_primary_identity foreign_uid_identity
  local passwd_name passwd_secret passwd_uid passwd_gid passwd_gecos passwd_home passwd_shell
  local group_name group_secret group_gid group_members

  [[ "$(getent passwd leetplus-build | awk 'END { print NR }')" == '1' ]] \
    || die 'leetplus-build must resolve to exactly one NSS passwd record'
  passwd_record="$(getent passwd leetplus-build)"
  IFS=: read -r passwd_name passwd_secret passwd_uid passwd_gid passwd_gecos passwd_home passwd_shell \
    <<< "$passwd_record"
  [[ "$passwd_name" == 'leetplus-build' && "$passwd_uid" =~ ^[1-9][0-9]*$ \
    && "$passwd_gid" =~ ^[1-9][0-9]*$ ]] \
    || die 'leetplus-build NSS passwd identity is invalid'
  [[ "$passwd_shell" == '/usr/sbin/nologin' ]] \
    || die 'leetplus-build must use the exact /usr/sbin/nologin shell'
  [[ "$passwd_home" == /* && "$passwd_home" != '/' \
    && ! -e "$passwd_home" && ! -L "$passwd_home" ]] \
    || die 'leetplus-build home path must be absolute, absent and non-root'

  [[ "$(getent group leetplus-build | awk 'END { print NR }')" == '1' ]] \
    || die 'leetplus-build must resolve to exactly one NSS group record'
  group_record="$(getent group leetplus-build)"
  IFS=: read -r group_name group_secret group_gid group_members <<< "$group_record"
  [[ "$group_name" == 'leetplus-build' && "$group_gid" == "$passwd_gid" \
    && -z "$group_members" ]] \
    || die 'leetplus-build primary NSS group is not exact'
  foreign_uid_identity="$(getent passwd | awk -F: -v uid="$passwd_uid" \
    '$3 == uid && $1 != "leetplus-build" { print $1; exit }')"
  [[ -z "$foreign_uid_identity" ]] \
    || die "another NSS identity uses the leetplus-build UID: ${foreign_uid_identity}"
  foreign_primary_identity="$(getent passwd | awk -F: -v gid="$passwd_gid" \
    '$4 == gid && $1 != "leetplus-build" { print $1; exit }')"
  [[ -z "$foreign_primary_identity" ]] \
    || die "another NSS identity uses the leetplus-build primary GID: ${foreign_primary_identity}"
  foreign_gid_group="$(getent group | awk -F: -v gid="$passwd_gid" \
    '$3 == gid && $1 != "leetplus-build" { print $1; exit }')"
  [[ -z "$foreign_gid_group" ]] \
    || die "another NSS group aliases the leetplus-build GID: ${foreign_gid_group}"
  [[ "$(id -u leetplus-build)" == "$passwd_uid" \
    && "$(id -g leetplus-build)" == "$passwd_gid" \
    && "$(id -gn leetplus-build)" == 'leetplus-build' \
    && "$(id -G leetplus-build)" == "$passwd_gid" \
    && "$(id -nG leetplus-build)" == 'leetplus-build' ]] \
    || die 'leetplus-build has an unexpected primary or supplementary NSS group'
}

assert_no_build_identity_processes() {
  local build_uid proc_path proc_status pid uid_fields uid_field
  local real_uid effective_uid saved_uid filesystem_uid
  local inspected_processes=0
  local inventory_started_at=$SECONDS
  build_uid="$(id -u leetplus-build)"
  for proc_path in /proc/[0-9]*; do
    [[ -d "$proc_path" && ! -L "$proc_path" ]] || continue
    inspected_processes=$((inspected_processes + 1))
    ((inspected_processes <= 131072 && SECONDS - inventory_started_at <= 10)) \
      || die 'leetplus-build process fence exceeded its bounded inventory limit'
    pid="${proc_path##*/}"
    [[ "$pid" =~ ^[1-9][0-9]*$ ]] || die 'process inventory returned a malformed PID path'
    proc_status="${proc_path}/status"
    if ! uid_fields="$(awk '$1 == "Uid:" { print $2, $3, $4, $5; found=1; exit } END { if (!found) exit 91 }' \
      "$proc_status" 2>/dev/null)"; then
      [[ ! -e "$proc_path" ]] && continue
      die "cannot inspect a live process while fencing leetplus-build: ${pid}"
    fi
    IFS=' ' read -r real_uid effective_uid saved_uid filesystem_uid <<< "$uid_fields"
    [[ "$real_uid" =~ ^[0-9]+$ && "$effective_uid" =~ ^[0-9]+$ \
      && "$saved_uid" =~ ^[0-9]+$ && "$filesystem_uid" =~ ^[0-9]+$ ]] \
      || die "live process has malformed UID fields while fencing leetplus-build: ${pid}"
    for uid_field in "$real_uid" "$effective_uid" "$saved_uid" "$filesystem_uid"; do
      [[ "$uid_field" == "$build_uid" ]] \
        && die "foreign process retains the leetplus-build UID at promotion boundary: ${pid}"
    done
  done
  return 0
}

managed_root_identity_snapshot=''
capture_managed_root_identities() {
  local managed_root
  for managed_root in "$build_root" "$promotion_root" "$release_root" "$receipt_root"; do
    [[ -d "$managed_root" && ! -L "$managed_root" \
      && "$(realpath -e -- "$managed_root")" == "$managed_root" ]] \
      || die "managed promotion root is absent, linked or non-canonical: ${managed_root}"
    printf '%s=%s\n' "$managed_root" "$(stat -c '%d:%i' -- "$managed_root")"
  done
}

assert_no_managed_root_mounts() {
  local mount_status=0
  [[ -r /proc/self/mountinfo ]] || die 'promotion mount inventory is unavailable'
  awk \
    -v build="$build_root" \
    -v promotion="$promotion_root" \
    -v release="$release_root" \
    -v receipts="$receipt_root" \
    -v source_directory="${source_directory:-}" \
    -v promotion_directory="${promotion_directory:-}" \
    -v release_directory="${release_directory:-}" '
      BEGIN {
        roots[1] = build
        roots[2] = promotion
        roots[3] = release
        roots[4] = receipts
        candidates[1] = source_directory
        candidates[2] = promotion_directory
        candidates[3] = release_directory
      }
      {
        lines += 1
        if (lines > 131072 || NF < 10) exit 91
        separator = 0
        for (field = 7; field <= NF; field += 1) {
          if ($field == "-") { separator = field; break }
        }
        if (separator == 0 || separator + 3 > NF) exit 92
        target = $5
        for (root_index = 1; root_index <= 4; root_index += 1) {
          root = roots[root_index]
          if (target == root) exit 93
        }
        if (index(target, receipts "/") == 1) exit 93
        for (candidate_index = 1; candidate_index <= 3; candidate_index += 1) {
          candidate = candidates[candidate_index]
          if (candidate != "" &&
              (target == candidate || index(target, candidate "/") == 1)) exit 93
        }
      }
      END {
        if (lines == 0) exit 94
      }
    ' /proc/self/mountinfo || mount_status=$?
  case "$mount_status" in
    0) ;;
    93) die 'managed promotion boundary contains an exact or candidate/receipt nested mountpoint' ;;
    *) die 'promotion mount inventory is malformed or exceeds its bounded limit' ;;
  esac
}

assert_managed_root_boundary() {
  local current_identity
  assert_no_managed_root_mounts
  current_identity="$(capture_managed_root_identities)"
  [[ -z "$managed_root_identity_snapshot" \
    || "$current_identity" == "$managed_root_identity_snapshot" ]] \
    || die 'managed promotion root identity changed across the locked operation'
}

build_root='/srv/leetplus/release-builds'
promotion_root='/srv/leetplus/release-promotions'
release_root='/srv/leetplus/releases'
receipt_root='/var/lib/leetplus/deploy-receipts'
sealer='/usr/local/sbin/leetplus-seal-release-artifact'
production_promoter='/usr/local/sbin/leetplus-promote-release-artifact'
hydration_attestor='/usr/local/libexec/leetplus/verify-release-hydration-systemd.mjs'
hydration_fragment='/etc/systemd/system/leetplus-release-hydrate@.service'
hydration_stager='/usr/local/libexec/leetplus/stage-release-artifact.sh'
hydration_lock='/run/leetplus-release/hydration.lock'
production_control_run_root='/run/leetplus-production-control'
production_control_install_lock="${production_control_run_root}/install.lock"
production_control_generation_root="/srv/leetplus/production-control-generations/${release_sha}"
production_control_receipt="${receipt_root}/production-control/production-control-generation-${release_sha}.receipt.json"
production_control_installer='/usr/local/sbin/leetplus-install-production-control-v1'
installed_generation_verifier='/usr/local/libexec/leetplus/verify-installed-production-control-generation.mjs'
for trusted_root in "$build_root" "$promotion_root" "$release_root"; do
  [[ -d "$trusted_root" && ! -L "$trusted_root" ]] || die "required root is absent or unsafe: ${trusted_root}"
done
[[ -d "$receipt_root" && ! -L "$receipt_root" \
  && "$(realpath -e -- "$receipt_root")" == "$receipt_root" \
  && "$(stat -c '%U:%G:%a' -- "$receipt_root")" == 'root:root:700' ]] \
  || die 'deployment receipt root must be root:root mode 0700'
receipt_ancestor="$receipt_root"
while :; do
  [[ -d "$receipt_ancestor" && ! -L "$receipt_ancestor" \
    && "$(stat -c '%u:%g' -- "$receipt_ancestor")" == '0:0' ]] \
    && path_is_not_group_or_other_writable "$receipt_ancestor" \
    || die "deployment receipt ancestor is not root-controlled: ${receipt_ancestor}"
  [[ "$receipt_ancestor" == '/' ]] && break
  receipt_ancestor="$(dirname -- "$receipt_ancestor")"
done
verify_root_executable "$sealer"
verify_root_file "$production_promoter" 'installed release promoter'
verify_root_file "$hydration_attestor" 'installed hydration systemd attestor'
verify_root_file "$hydration_fragment" 'installed hydration systemd unit fragment'
verify_root_file "$hydration_stager" 'installed hydration stager'
[[ "$(realpath -e -- "$0")" == "$production_promoter" ]] \
  || die 'production promoter must execute from its exact installed authority path'
assert_exact_build_identity
[[ -x /usr/bin/node && ! -L /usr/bin/node \
  && "$(realpath -e -- /usr/bin/node)" == '/usr/bin/node' \
  && "$(stat -c '%u:%g' -- /usr/bin/node)" == '0:0' \
  && -z "$(find -P /usr/bin/node -maxdepth 0 -perm /022 -print -quit)" \
  && "$(/usr/bin/node -p 'process.versions.node.split(".")[0]')" == '22' ]] \
  || die 'production hydration attestation requires exact root-owned /usr/bin/node major 22'
[[ -d "$production_control_run_root" && ! -L "$production_control_run_root" \
  && "$(realpath -e -- "$production_control_run_root")" == "$production_control_run_root" \
  && "$(stat -c '%U:%G:%a' -- "$production_control_run_root")" == 'root:root:700' ]] \
  || die 'production-control runtime root must be root:root mode 0700'
[[ -f "$production_control_install_lock" && ! -L "$production_control_install_lock" \
  && "$(stat -c '%U:%G:%a:%h' -- "$production_control_install_lock")" == 'root:root:600:1' ]] \
  || die 'production-control install lock must be root:root mode 0600 with one link'
install_lock_identity="$(stat -c '%d:%i' -- "$production_control_install_lock")"
if [[ "$inherited_production_control_lock_fd" == '8' ]]; then
  [[ -e /proc/self/fd/8 \
    && "$(stat -Lc '%d:%i' -- /proc/self/fd/8)" == "$install_lock_identity" ]] \
    || die 'inherited production-control lock descriptor differs from the validated path'
  exec 7<&8
else
  exec 7<> "$production_control_install_lock"
fi
[[ "$(stat -Lc '%d:%i' -- /proc/self/fd/7)" == "$install_lock_identity" ]] \
  || die 'opened production-control install lock differs from the validated path'
flock -n 7 || die 'another production-control install or promotion operation holds the install lock'
[[ "$(stat -c '%d:%i:%U:%G:%a:%h' -- "$production_control_install_lock")" == \
    "${install_lock_identity}:root:root:600:1" \
  && "$(stat -Lc '%d:%i' -- /proc/self/fd/7)" == "$install_lock_identity" ]] \
  || die 'production-control install lock identity changed across acquisition'

[[ -f "$production_control_receipt" && ! -L "$production_control_receipt" \
  && "$(realpath -e -- "$production_control_receipt")" == "$production_control_receipt" \
  && "$(stat -c '%U:%G:%a:%h' -- "$production_control_receipt")" == 'root:root:400:1' \
  && "$(stat -c '%s' -- "$production_control_receipt")" -le 65536 ]] \
  || die 'installed production-control generation receipt is absent or unsafe'
verify_root_file "$installed_generation_verifier" 'installed production-control generation verifier'
[[ "$(stat -c '%U:%G:%a:%h' -- "$installed_generation_verifier")" == 'root:root:555:1' ]] \
  || die 'installed production-control generation verifier must be root:root mode 0555 with one link'
installed_verifier_sha256="$(extract_installed_verifier_pin "$production_control_receipt")" \
  || die 'installed-generation receipt lacks one canonical verifier digest pin'
[[ "$installed_verifier_sha256" =~ ^[0-9a-f]{64}$ \
  && "$(sha256sum -- "$installed_generation_verifier" | awk '{ print $1 }')" == \
    "$installed_verifier_sha256" ]] \
  || die 'installed generation verifier differs from its accepted receipt pin'

installed_generation_stdout="$(mktemp --tmpdir="$production_control_run_root" '.promotion-generation.XXXXXX')" \
  || die 'cannot allocate installed-generation verifier output'
installed_generation_stderr="$(mktemp --tmpdir="$production_control_run_root" '.promotion-generation-error.XXXXXX')" \
  || die 'cannot allocate installed-generation verifier error output'
attestation_temp_files+=("$installed_generation_stdout" "$installed_generation_stderr")
set +e
/usr/bin/env -i \
  PATH='/usr/sbin:/usr/bin:/sbin:/bin' \
  LANG='C.UTF-8' \
  LC_ALL='C.UTF-8' \
  TZ='UTC' \
  /usr/bin/node "$installed_generation_verifier" \
    --release-sha "$release_sha" \
    --require-root-authority \
    > "$installed_generation_stdout" \
    2> "$installed_generation_stderr"
installed_generation_status=$?
set -e
((installed_generation_status == 0)) \
  || die 'installed production-control generation verification failed'
[[ ! -s "$installed_generation_stderr" ]] \
  || die 'installed production-control generation verifier emitted unexpected stderr'
validate_installed_generation_attestation "$installed_generation_stdout"

[[ -f "$hydration_lock" && ! -L "$hydration_lock" \
  && "$(stat -c '%U:%G:%a' -- "$hydration_lock")" == 'root:leetplus-build:660' ]] \
  || die 'global hydration/promotion lock must be root:leetplus-build mode 0660'
[[ -d /run/leetplus-release && ! -L /run/leetplus-release \
  && "$(stat -c '%U:%G:%a' -- /run/leetplus-release)" == 'root:leetplus-build:750' ]] \
  || die 'hydration lock parent must be root:leetplus-build mode 0750'
assert_no_managed_root_mounts
managed_root_identity_snapshot="$(capture_managed_root_identities)"
exec 8<> "$hydration_lock"
flock -n 8 || die 'another hydration or promotion operation holds the global lock'
assert_managed_root_boundary
[[ "$(stat -c '%U' -- "$promotion_root")" == 'root' \
  && "$(stat -c '%G' -- "$promotion_root")" == 'leetplus-runtime' \
  && "$(stat -c '%a' -- "$promotion_root")" == '710' ]] \
  || die 'promotion root must be root:leetplus-runtime mode 0710'
[[ "$(stat -c '%U:%G' -- "$release_root")" == 'root:root' ]] \
  && path_is_not_group_or_other_writable "$release_root" \
  || die 'release root must be root:root and non-writable by group/other'
[[ "$(stat -c '%d' -- "$build_root")" == "$(stat -c '%d' -- "$promotion_root")" \
  && "$(stat -c '%d' -- "$promotion_root")" == "$(stat -c '%d' -- "$release_root")" ]] \
  || die 'build, promotion and release roots must share one filesystem for atomic rename'
assert_managed_root_boundary

source_directory="${build_root}/${release_sha}"
promotion_directory="${promotion_root}/${release_sha}"
release_directory="${release_root}/${release_sha}"
promotion_attestation_receipt="${receipt_root}/release-hydration-attestation-${release_sha}.receipt"
hydration_unit="leetplus-release-hydrate@${release_sha}.service"
promotion_intent="${receipt_root}/release-promotion-intent-${release_sha}.receipt"
assert_managed_root_boundary

validate_hydration_artifact_shape() {
  local artifact_directory="$1"
  local receipt="${artifact_directory}/HYDRATION_SANDBOX_RECEIPT"
  [[ -f "$receipt" && ! -L "$receipt" \
    && -f "$artifact_directory/HYDRATED_SHA256SUMS" \
    && ! -L "$artifact_directory/HYDRATED_SHA256SUMS" ]] \
    || die 'isolated hydration evidence is absent or unsafe'
  awk -F= -v sha="$release_sha" '
    BEGIN {
      split("RECORD_VERSION RELEASE_SHA SANDBOX INVOCATION_ID PNPM_STORE_LOCKFILE_SHA256 PNPM_STORE_MANIFEST_SHA256 PNPM_STORE_RECEIPT_SHA256", expected, " ")
    }
    !/^[A-Z0-9_]+=[^\r\n]*$/ { exit 1 }
    { if ($1 != expected[NR] || seen[$1]++) exit 1; values[$1] = $2 }
    END {
      if (NR != 7 || values["RECORD_VERSION"] != "1" || values["RELEASE_SHA"] != sha ||
          values["SANDBOX"] != "SYSTEMD_IP_DENY_ANY_V1" ||
          values["INVOCATION_ID"] !~ /^[0-9a-f]{32}$/ ||
          values["PNPM_STORE_LOCKFILE_SHA256"] !~ /^[0-9a-f]{64}$/ ||
          values["PNPM_STORE_MANIFEST_SHA256"] !~ /^[0-9a-f]{64}$/ ||
          values["PNPM_STORE_RECEIPT_SHA256"] !~ /^[0-9a-f]{64}$/) exit 1
    }
  ' "$receipt" || die 'isolated hydration receipt schema is not canonical'
  if find_has_match -P "$artifact_directory" -xdev -type f -links +1; then
    die 'hydrated artifact contains multiply-linked files'
  fi
  if find_has_match -P "$artifact_directory" -xdev ! -type d ! -type f ! -type l; then
    die 'hydrated artifact contains a special filesystem entry'
  fi
  validate_hydrated_manifest_exact_tree "$artifact_directory"
}

capture_completed_hydration_authority() {
  local completed_snapshot completed_attestation hydration_control_group
  hydration_invocation_id="$(awk -F= '$1 == "INVOCATION_ID" { print $2 }' \
    "$source_directory/HYDRATION_SANDBOX_RECEIPT")"
  timeout --foreground --kill-after=5s 30s systemd-analyze verify "$hydration_fragment" \
    || die 'installed hydration systemd unit fails systemd-analyze verification'
  completed_snapshot="$(mktemp --tmpdir=/run/leetplus-release '.hydration-completed.XXXXXX')"
  attestation_temp_files+=("$completed_snapshot")
  write_systemd_snapshot \
    "$completed_snapshot" \
    "$hydration_unit" \
    "${HYDRATION_COMPLETED_PROPERTIES[@]}"
  completed_attestation="$(
    /usr/bin/node "$hydration_attestor" \
      --release-sha "$release_sha" \
      --snapshot "$completed_snapshot" \
      --unit-file "$hydration_fragment" \
      --stager-file "$hydration_stager" \
      --phase completed \
      --expected-invocation-id "$hydration_invocation_id"
  )" || die 'effective completed hydration unit attestation failed'
  [[ "$(awk 'END { print NR }' <<< "$completed_attestation")" == '6' \
    && "$(grep -c '^HYDRATION_SYSTEMD_POLICY_VERSION=1$' <<< "$completed_attestation")" == '1' \
    && "$(grep -c "^HYDRATION_SYSTEMD_UNIT=${hydration_unit}$" <<< "$completed_attestation")" == '1' \
    && "$(grep -c '^HYDRATION_SYSTEMD_FRAGMENT_SHA256=[0-9a-f]\{64\}$' \
      <<< "$completed_attestation")" == '1' \
    && "$(grep -c '^HYDRATION_STAGER_SHA256=[0-9a-f]\{64\}$' \
      <<< "$completed_attestation")" == '1' \
    && "$(grep -c '^HYDRATION_SYSTEMD_POLICY_SHA256=[0-9a-f]\{64\}$' \
      <<< "$completed_attestation")" == '1' \
    && "$(grep -c "^HYDRATION_SYSTEMD_INVOCATION_ID=${hydration_invocation_id}$" \
      <<< "$completed_attestation")" == '1' ]] \
    || die 'hydration systemd attestation record is malformed'
  hydration_fragment_sha256="$(awk -F= '$1 == "HYDRATION_SYSTEMD_FRAGMENT_SHA256" { print $2 }' \
    <<< "$completed_attestation")"
  hydration_stager_sha256="$(awk -F= '$1 == "HYDRATION_STAGER_SHA256" { print $2 }' \
    <<< "$completed_attestation")"
  hydration_policy_sha256="$(awk -F= '$1 == "HYDRATION_SYSTEMD_POLICY_SHA256" { print $2 }' \
    <<< "$completed_attestation")"
  [[ "$(systemd_value ActiveState "$hydration_unit")" == 'active' \
    && "$(systemd_value SubState "$hydration_unit")" == 'exited' \
    && "$(systemd_value Result "$hydration_unit")" == 'success' \
    && "$(systemd_value ExecMainStatus "$hydration_unit")" == '0' \
    && "$(systemd_value InvocationID "$hydration_unit")" == "$hydration_invocation_id" ]] \
    || die 'hydration unit is not the exact successful completed invocation'
  hydration_control_group="$(systemd_value ControlGroup "$hydration_unit")"
  assert_empty_hydration_cgroup "$hydration_control_group"
  assert_no_build_identity_processes
  published_source_receipt_sha256="$(sha256sum -- \
    "$source_directory/HYDRATION_SANDBOX_RECEIPT" | awk '{ print $1 }')"
  published_hydrated_manifest_sha256="$(sha256sum -- \
    "$source_directory/HYDRATED_SHA256SUMS" | awk '{ print $1 }')"
  assert_managed_root_boundary
  publish_promotion_intent
  assert_managed_root_boundary
}

seal_and_authorize_promotion() {
  validate_intent_artifact "$promotion_directory"
  assert_managed_root_boundary
  "$sealer" \
    --release-sha "$release_sha" \
    --release-root "$promotion_root" \
    --service-user "leetplus-api-${slot}"
  assert_managed_root_boundary
  validate_intent_artifact "$promotion_directory"
  if [[ -f "$promotion_attestation_receipt" && ! -L "$promotion_attestation_receipt" ]]; then
    validate_publication_attestation "$promotion_attestation_receipt" "$promotion_directory"
  else
    [[ ! -e "$promotion_attestation_receipt" && ! -L "$promotion_attestation_receipt" ]] \
      || die 'hydration publication authority path is unsafe'
    publish_publication_attestation "$promotion_attestation_receipt"
  fi
  assert_managed_root_boundary
}

print_promotion_result() {
  local reconciled="$1"
  printf 'PROMOTED_RELEASE_SHA=%s\n' "$release_sha"
  printf 'PROMOTED_RELEASE_SLOT=%s\n' "$slot"
  printf 'PROMOTED_RELEASE_DIRECTORY=%s\n' "$release_directory"
  printf 'PROMOTED_RELEASE_RUNTIME_SWITCHED=false\n'
  [[ "$reconciled" == true ]] \
    && printf 'PROMOTED_RELEASE_PUBLICATION_RECONCILED=true\n'
  printf 'PROMOTED_HYDRATION_INVOCATION_ID=%s\n' "$hydration_invocation_id"
  printf 'PROMOTED_HYDRATION_UNIT_SHA256=%s\n' "$hydration_fragment_sha256"
  printf 'PROMOTED_HYDRATION_STAGER_SHA256=%s\n' "$hydration_stager_sha256"
  printf 'PROMOTED_HYDRATION_POLICY_SHA256=%s\n' "$hydration_policy_sha256"
  printf 'PROMOTED_HYDRATION_ATTESTATION_RECEIPT=%s\n' "$promotion_attestation_receipt"
}

for managed_release_path in "$source_directory" "$promotion_directory" "$release_directory"; do
  [[ ! -e "$managed_release_path" && ! -L "$managed_release_path" ]] && continue
  [[ -d "$managed_release_path" && ! -L "$managed_release_path" \
    && "$(realpath -e -- "$managed_release_path")" == "$managed_release_path" ]] \
    || die "managed release state path is unsafe: ${managed_release_path}"
done
state_count=0
[[ -d "$source_directory" ]] && state_count=$((state_count + 1))
[[ -d "$promotion_directory" ]] && state_count=$((state_count + 1))
[[ -d "$release_directory" ]] && state_count=$((state_count + 1))
((state_count == 1)) || die 'promotion has no unique source/promotion/release state'

intent_recovery=false
if [[ -f "$promotion_intent" && ! -L "$promotion_intent" ]]; then
  load_promotion_intent_authority
  intent_recovery=true
else
  [[ ! -e "$promotion_intent" && ! -L "$promotion_intent" ]] \
    || die 'promotion intent path is unsafe'
fi

if [[ -d "$release_directory" ]]; then
  [[ "$intent_recovery" == true \
    && -f "$promotion_attestation_receipt" && ! -L "$promotion_attestation_receipt" ]] \
    || die 'final release lacks its durable intent or publication authority'
  validate_intent_artifact "$release_directory"
  validate_publication_attestation "$promotion_attestation_receipt" "$release_directory"
  "$sealer" --release-sha "$release_sha" --release-root "$release_root" \
    --service-user "leetplus-api-${slot}" --dry-run >/dev/null \
    || die 'reconciled final release is no longer exactly sealed'
  assert_managed_root_boundary
  sync -f "$promotion_root"
  sync -f "$release_root"
  assert_managed_root_boundary
  print_promotion_result true
  exit 0
fi

if [[ -d "$source_directory" ]]; then
  # Never parse or hash builder-owned bytes while any process can still write
  # as the build identity. The completed-unit/cgroup attestation follows, and a
  # second fence remains immediately before the namespace-crossing rename.
  assert_no_build_identity_processes
  [[ "$(stat -c '%U' -- "$source_directory")" == 'leetplus-build' ]] \
    || die 'hydrated build is not owned by leetplus-build'
  validate_hydration_artifact_shape "$source_directory"
  if [[ "$intent_recovery" == false ]]; then
    [[ ! -e "$promotion_attestation_receipt" && ! -L "$promotion_attestation_receipt" ]] \
      || die 'publication authority exists before durable promotion intent'
    capture_completed_hydration_authority
    load_promotion_intent_authority
  fi
  ensure_hydration_invocation_quiesced
  validate_intent_artifact "$source_directory"
  assert_managed_root_boundary
  assert_no_build_identity_processes
  mv -T -- "$source_directory" "$promotion_directory"
  chown root:root -- "$promotion_directory"
  chmod 0700 -- "$promotion_directory"
  sync -f "$build_root"
  sync -f "$promotion_root"
  assert_managed_root_boundary
else
  [[ "$intent_recovery" == true ]] \
    || die 'promotion quarantine exists without durable promotion intent'
  ensure_hydration_invocation_quiesced
  artifact_owner="$(stat -c '%U' -- "$promotion_directory")"
  [[ "$artifact_owner" == 'leetplus-build' || "$artifact_owner" == 'root' ]] \
    || die 'promotion quarantine has an unexpected owner during recovery'
  chown root:root -- "$promotion_directory"
  chmod 0700 -- "$promotion_directory"
  sync -f "$promotion_root"
  assert_managed_root_boundary
fi

validate_hydration_artifact_shape "$promotion_directory"
validate_intent_artifact "$promotion_directory"
seal_and_authorize_promotion
"$sealer" --release-sha "$release_sha" --release-root "$promotion_root" \
  --service-user "leetplus-api-${slot}" --dry-run >/dev/null \
  || die 'sealed promotion failed final dry-run verification'
assert_managed_root_boundary
mv -T -- "$promotion_directory" "$release_directory"
sync -f "$promotion_root"
sync -f "$release_root"
assert_managed_root_boundary
validate_intent_artifact "$release_directory"
validate_publication_attestation "$promotion_attestation_receipt" "$release_directory"
print_promotion_result "$intent_recovery"
