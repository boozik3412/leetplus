#!/usr/bin/env bash
#
# Verify and stage one exact LeetPlus release artifact.
#
# This script deliberately has no database, systemd, network-download or
# symlink-switch capability. It can prepare a verified immutable directory;
# migration, runtime switch and rollback remain separately reviewed operations.

set -euo pipefail
IFS=$'\n\t'

if ((EUID == 0)); then
  PATH='/usr/sbin:/usr/bin:/sbin:/bin'
  export PATH
fi

readonly RELEASE_SHA_PATTERN='^[0-9a-f]{40}$'

usage() {
  cat <<'USAGE'
Usage:
  stage-release-artifact.sh \
    --release-sha <40-lowercase-hex> \
    --artifact <leetplus-release-<sha>.tar.gz> \
    --artifact-sha256 <artifact>.sha256 \
    --output-root <existing-absolute-directory> \
    [--pnpm-store-dir /srv/leetplus/pnpm-store] \
    [--hydrate]

Verifies the outer artifact checksum, gzip stream, archive paths, absence of
symlinks/node_modules, internal SHA256SUMS and release provenance. It then
atomically moves the verified tree to <output-root>/<sha>.

--hydrate additionally runs a copy-only locked, offline production dependency
install and Prisma generate inside that new directory, rejects shared hardlinks,
then writes a complete post-hydration runtime checksum manifest.
It never reads runtime secrets, connects to PostgreSQL, switches a live release
or restarts systemd.
USAGE
}

die() {
  printf 'stage-release-artifact: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command is unavailable: $1"
}

is_regular_nonsymlink() {
  [[ -f "$1" && ! -L "$1" ]]
}

release_sha=''
artifact=''
artifact_sha256=''
output_root=''
hydrate=false
unprivileged_test_mode=false
pnpm_store_dir='/srv/leetplus/pnpm-store'

while (($# > 0)); do
  case "$1" in
    --release-sha)
      (($# >= 2)) || die '--release-sha requires a value'
      release_sha="$2"
      shift 2
      ;;
    --artifact)
      (($# >= 2)) || die '--artifact requires a value'
      artifact="$2"
      shift 2
      ;;
    --artifact-sha256)
      (($# >= 2)) || die '--artifact-sha256 requires a value'
      artifact_sha256="$2"
      shift 2
      ;;
    --output-root)
      (($# >= 2)) || die '--output-root requires a value'
      output_root="$2"
      shift 2
      ;;
    --hydrate)
      hydrate=true
      shift
      ;;
    --unprivileged-test-mode)
      unprivileged_test_mode=true
      shift
      ;;
    --pnpm-store-dir)
      (($# >= 2)) || die '--pnpm-store-dir requires a value'
      pnpm_store_dir="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      die "unknown argument: $1"
      ;;
  esac
done

if [[ "$hydrate" == true && "$unprivileged_test_mode" == false ]]; then
  PATH='/usr/sbin:/usr/bin:/sbin:/bin'
  export PATH
fi

if [[ "$hydrate" == true ]]; then
  ((EUID != 0)) || die 'hydration must never execute package/project code as root'
  [[ "$(id -un)" == 'leetplus-build' ]] \
    || die 'hydration must run as the dedicated leetplus-build identity'
  for sensitive_key in DATABASE_URL JWT_SECRET GUEST_PORTAL_JWT_SECRET APP_ENCRYPTION_KEY INTEGRATION_ENCRYPTION_KEY SYNC_SERVICE_TOKEN LANGAME_API_KEY; do
    [[ -z "${!sensitive_key:-}" ]] \
      || die "hydration inherited a forbidden runtime secret: ${sensitive_key}"
  done
  if [[ "$unprivileged_test_mode" == true ]]; then
    [[ -z "${INVOCATION_ID:-}" ]] || die 'test hydration mode cannot impersonate a systemd invocation'
  else
    [[ "$pnpm_store_dir" == '/srv/leetplus/pnpm-store' ]] \
      || die 'production hydration pnpm store path cannot be overridden'
    [[ "${LEETPLUS_HYDRATION_SANDBOX:-}" == 'SYSTEMD_IP_DENY_ANY_V1' ]] \
      || die 'hydration has no reviewed no-egress sandbox marker'
    [[ "${INVOCATION_ID:-}" =~ ^[0-9a-f]{32}$ ]] \
      || die 'hydration is not running in a systemd invocation'
    grep -Eq '/leetplus-release-hydrate@[^/]+\.service($|/)' /proc/self/cgroup \
      || die 'hydration is outside the reviewed systemd unit cgroup'
  fi
fi

[[ "$release_sha" =~ $RELEASE_SHA_PATTERN ]] || die 'release SHA must be 40 lowercase hexadecimal characters'
[[ -n "$artifact" && -n "$artifact_sha256" && -n "$output_root" ]] || {
  usage >&2
  exit 1
}

for command_name in awk basename chmod dirname find grep gzip id mktemp mv node realpath rm sha256sum sort stat tar xargs; do
  require_command "$command_name"
done

artifact="$(realpath -e -- "$artifact")"
artifact_sha256="$(realpath -e -- "$artifact_sha256")"
output_root="$(realpath -e -- "$output_root")"

is_regular_nonsymlink "$artifact" || die 'artifact must be a regular non-symlink file'
is_regular_nonsymlink "$artifact_sha256" || die 'artifact checksum must be a regular non-symlink file'
[[ -d "$output_root" && ! -L "$output_root" && "$output_root" != '/' ]] || die 'output root must be an existing non-root directory, not a symlink'

artifact_name="$(basename -- "$artifact")"
[[ "$artifact_name" == "leetplus-release-${release_sha}.tar.gz" ]] || die 'artifact file name is not bound to release SHA'
[[ "$(basename -- "$artifact_sha256")" == "${artifact_name}.sha256" ]] || die 'checksum file name is not bound to artifact'

release_directory="${output_root}/${release_sha}"
[[ ! -e "$release_directory" && ! -L "$release_directory" ]] || die 'release directory already exists; refusing overwrite'

checksum_directory="$(dirname -- "$artifact_sha256")"
(
  cd -- "$checksum_directory"
  checksum_file="$(basename -- "$artifact_sha256")"
  expected_digest="$(sha256sum -- "$artifact" | awk '{ print $1 }')"
  checksum_line_count="$(awk 'NF { count += 1 } END { print count + 0 }' "$checksum_file")"
  matching_checksum_line_count="$(awk -v digest="$expected_digest" -v artifact_name="$artifact_name" '
    $1 == digest && ($2 == artifact_name || $2 == "*" artifact_name) { count += 1 }
    END { print count + 0 }
  ' "$checksum_file")"
  [[ "$checksum_line_count" == '1' && "$matching_checksum_line_count" == '1' ]] || die 'checksum file must contain exactly the expected artifact checksum line'
  sha256sum --strict --check "$(basename -- "$artifact_sha256")" --status
) || die 'outer artifact checksum verification failed'

gzip --test -- "$artifact" || die 'gzip stream verification failed'

archive_listing="$(mktemp "${output_root}/.${release_sha}.listing.XXXXXX")"
archive_type_listing="$(mktemp "${output_root}/.${release_sha}.types.XXXXXX")"
staging_directory=''
cleanup_listing() {
  rm -f -- "$archive_listing" "$archive_type_listing"
}
trap cleanup_listing EXIT

LC_ALL=C tar --quoting-style=escape -tzf "$artifact" > "$archive_listing" || die 'cannot list artifact archive'
grep -Eq '(^/|(^|/)\.\.(/|$))' "$archive_listing" && die 'archive contains an unsafe path'
grep -Eq '(^|/)node_modules(/|$)' "$archive_listing" && die 'artifact embeds node_modules'
LC_ALL=C tar --quoting-style=escape -tvzf "$artifact" > "$archive_type_listing" \
  || die 'cannot inspect artifact archive member types'
awk 'substr($0, 1, 1) != "-" && substr($0, 1, 1) != "d" { exit 1 }' "$archive_type_listing" \
  || die 'artifact contains a non-regular, non-directory member'

staging_directory="$(mktemp -d "${output_root}/.${release_sha}.staging.XXXXXX")"
tar -xzf "$artifact" \
  --no-same-owner \
  --no-same-permissions \
  --warning=no-unknown-keyword \
  -C "$staging_directory" || die "artifact extraction failed; retained $staging_directory for inspection"

(
  cd -- "$staging_directory"
  find . ! -type d ! -type f -print -quit | grep -q . \
    && die 'extracted artifact contains a non-regular, non-directory entry'
  find . -path './node_modules' -prune -o -type d -name node_modules -print -quit | grep -q . && die 'extracted artifact contains node_modules'
  sha256sum --strict --check --quiet SHA256SUMS || die 'internal SHA256SUMS verification failed'
  node - "$release_sha" <<'NODE'
const fs = require('node:fs');

const [releaseSha] = process.argv.slice(2);
const provenance = JSON.parse(fs.readFileSync('release-provenance.json', 'utf8'));
const requiredFiles = [
  'apps/api/dist/main.js',
  'apps/api/package.json',
  'apps/web/.next/BUILD_ID',
  'apps/web/package.json',
  'packages/database/package.json',
  'packages/database/prisma/schema.prisma',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
];

if (provenance.releaseSha !== releaseSha) {
  throw new Error('release-provenance SHA mismatch');
}
if (!Number.isSafeInteger(provenance.databaseMigrationCount) || provenance.databaseMigrationCount < 1) {
  throw new Error('release-provenance migration count is invalid');
}
if (typeof provenance.databaseMigration !== 'string' || !/^\d{14}_[a-z0-9_]+$/u.test(provenance.databaseMigration)) {
  throw new Error('release-provenance migration name is invalid');
}
if (typeof provenance.nodeVersion !== 'string' || !/^\d+$/u.test(provenance.nodeVersion)) {
  throw new Error('release-provenance Node major is invalid');
}
if (typeof provenance.pnpmVersion !== 'string' || !/^\d+\.\d+\.\d+$/u.test(provenance.pnpmVersion)) {
  throw new Error('release-provenance pnpm version is invalid');
}
for (const requiredFile of requiredFiles) {
  const stat = fs.statSync(requiredFile);
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(`required release file is absent or empty: ${requiredFile}`);
  }
}
if (!fs.statSync('apps/web/public').isDirectory()) {
  throw new Error('release web public directory is absent');
}
NODE
)

if [[ "$hydrate" == true ]]; then
  require_command pnpm
  actual_node_major="$(node -p 'process.versions.node.split(".")[0]')"
  actual_pnpm_version="$(pnpm --version)"
  expected_node_major="$(node -p 'require(process.argv[1]).nodeVersion' "$staging_directory/release-provenance.json")"
  expected_pnpm_version="$(node -p 'require(process.argv[1]).pnpmVersion' "$staging_directory/release-provenance.json")"
  [[ "$actual_node_major" == "$expected_node_major" ]] || die 'hydration Node major differs from release provenance'
  [[ "$actual_pnpm_version" == "$expected_pnpm_version" ]] || die 'hydration pnpm version differs from release provenance'
  if [[ "$unprivileged_test_mode" == false ]]; then
    [[ -d "$pnpm_store_dir" && ! -L "$pnpm_store_dir" ]] || die 'trusted pnpm store is absent or unsafe'
    pnpm_store_dir="$(realpath -e -- "$pnpm_store_dir")"
    [[ "$(stat -c '%U' -- "$pnpm_store_dir")" == 'root' ]] || die 'trusted pnpm store must be root-owned'
    [[ -z "$(find -P "$pnpm_store_dir" -xdev \( -type d -o -type f \) -perm /022 -print -quit)" ]] \
      || die 'trusted pnpm store is group/other-writable'
    store_receipt="${pnpm_store_dir}/LEETPLUS_STORE_RECEIPT"
    [[ -f "$store_receipt" && ! -L "$store_receipt" ]] || die 'trusted pnpm store receipt is absent'
    lockfile_sha="$(sha256sum "$staging_directory/pnpm-lock.yaml" | awk '{ print $1 }')"
    grep -F -x "LOCKFILE_SHA256=${lockfile_sha}" "$store_receipt" >/dev/null || die 'pnpm store lockfile receipt mismatch'
    grep -F -x "NODE_MAJOR=${expected_node_major}" "$store_receipt" >/dev/null || die 'pnpm store Node receipt mismatch'
    grep -F -x "PNPM_VERSION=${expected_pnpm_version}" "$store_receipt" >/dev/null || die 'pnpm store version receipt mismatch'
  fi
  if ! (
    cd -- "$staging_directory"
    pnpm install --prod --offline --frozen-lockfile --ignore-scripts \
      --package-import-method=copy --store-dir "$pnpm_store_dir" || exit 1
    pnpm --filter database db:generate || exit 1
    sha256sum --strict --check --quiet SHA256SUMS || exit 1
    test -z "$(find -P . -xdev -type f -links +1 -print -quit)" || exit 1
    test -z "$(find -P . -xdev ! -type d ! -type f ! -type l -print -quit)" || exit 1
    if [[ "$unprivileged_test_mode" == false ]]; then
      {
        printf 'RECORD_VERSION=1\n'
        printf 'RELEASE_SHA=%s\n' "$release_sha"
        printf 'SANDBOX=SYSTEMD_IP_DENY_ANY_V1\n'
        printf 'INVOCATION_ID=%s\n' "$INVOCATION_ID"
        printf 'PNPM_STORE_LOCKFILE_SHA256=%s\n' "$lockfile_sha"
      } > HYDRATION_SANDBOX_RECEIPT
      chmod 0440 HYDRATION_SANDBOX_RECEIPT
    fi
    find -P . -xdev \
      -path './apps/web/.next/cache' -prune -o \
      -type f ! -name HYDRATED_SHA256SUMS -print0 \
      | LC_ALL=C sort -z \
      | xargs -0 sha256sum > HYDRATED_SHA256SUMS
    sha256sum --strict --check --quiet HYDRATED_SHA256SUMS || exit 1
  ); then
    die "locked offline hydration failed; retained $staging_directory for inspection"
  fi
fi

mv -- "$staging_directory" "$release_directory"
staging_directory=''

printf 'STAGED_RELEASE_SHA=%s\n' "$release_sha"
printf 'STAGED_RELEASE_DIRECTORY=%s\n' "$release_directory"
printf 'STAGED_RELEASE_HYDRATED=%s\n' "$hydrate"
printf 'NEXT_STEP=reviewed migration and runtime switch; this script performed neither\n'
