#!/usr/bin/bash -p
#
# Verify a running LeetPlus artifact release without mutating it.
#
# This probe has no database, systemd, filesystem-switch or secret capability.
# It checks only already exposed API/Web HTTP contracts.

[[ $- == *p* ]] || { printf 'verify-release-readiness: privileged Bash mode is required\n' >&2; exit 1; }
LEETPLUS_BOOTSTRAP_TEST_PATH=''
LEETPLUS_BOOTSTRAP_IS_TEST=false
declare -a LEETPLUS_BOOTSTRAP_TEST_ENVIRONMENT=()
for LEETPLUS_BOOTSTRAP_ARGUMENT in "$@"; do
  if [[ "$LEETPLUS_BOOTSTRAP_ARGUMENT" == '--unprivileged-test-mode' && EUID -ne 0 ]]; then
    LEETPLUS_BOOTSTRAP_IS_TEST=true
    LEETPLUS_BOOTSTRAP_TEST_PATH="${PATH:-}"
    break
  fi
done
unset LEETPLUS_BOOTSTRAP_ARGUMENT
if [[ "$LEETPLUS_BOOTSTRAP_IS_TEST" == true ]]; then
  while IFS= read -r LEETPLUS_INHERITED_ENVIRONMENT_NAME; do
    [[ "$LEETPLUS_INHERITED_ENVIRONMENT_NAME" == TEST_* || "$LEETPLUS_INHERITED_ENVIRONMENT_NAME" == LEETPLUS_TEST_* ]] \
      && LEETPLUS_BOOTSTRAP_TEST_ENVIRONMENT+=("${LEETPLUS_INHERITED_ENVIRONMENT_NAME}=${!LEETPLUS_INHERITED_ENVIRONMENT_NAME}")
  done < <(compgen -e)
fi
while IFS= read -r LEETPLUS_INHERITED_ENVIRONMENT_NAME; do
  unset "$LEETPLUS_INHERITED_ENVIRONMENT_NAME" 2>/dev/null || true
done < <(compgen -e)
unset LEETPLUS_INHERITED_ENVIRONMENT_NAME
PATH='/usr/sbin:/usr/bin:/sbin:/bin'
LANG='C.UTF-8'
LC_ALL='C.UTF-8'
TZ='UTC'
export PATH LANG LC_ALL TZ
if [[ "$LEETPLUS_BOOTSTRAP_IS_TEST" == true ]]; then
  for LEETPLUS_BOOTSTRAP_TEST_ASSIGNMENT in "${LEETPLUS_BOOTSTRAP_TEST_ENVIRONMENT[@]}"; do export "$LEETPLUS_BOOTSTRAP_TEST_ASSIGNMENT"; done
fi
unset LEETPLUS_BOOTSTRAP_IS_TEST LEETPLUS_BOOTSTRAP_TEST_ENVIRONMENT LEETPLUS_BOOTSTRAP_TEST_ASSIGNMENT

set -euo pipefail
IFS=$'\n\t'

readonly RELEASE_SHA_PATTERN='^[0-9a-f]{40}$'
readonly MIGRATION_PATTERN='^[0-9]{14}_[a-z0-9_]+$'
readonly SAFE_PATH='/usr/sbin:/usr/bin:/sbin:/bin'
readonly MAX_BODY_BYTES=1048576
readonly MAX_HEADER_BYTES=65536

usage() {
  cat <<'USAGE'
Usage:
  verify-release-readiness.sh \
    --release-sha <40-lowercase-hex> \
    --expected-migration <migration-name> \
    --expected-migration-count <positive-integer> \
    --expected-web-build-id <same-40-lowercase-hex> \
    --api-base-url <http(s)-url> \
    --web-url <http(s)-url>

The API must expose /version and /health/ready. The probe accepts only an
exact release SHA and either the expected completed migration name/count or
one of the explicitly admitted guest-support forward-compatibility envelopes:
CURRENT_187 -> CURRENT_188 or CURRENT_188 -> CURRENT_189. It also requires an
HTTP-success Web response and the exact Next.js BUILD_ID static manifest. It
performs no write or restart operation. Tests may add
--unprivileged-test-mode; root may not use that mode.
USAGE
}

die() {
  printf 'verify-release-readiness: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command is unavailable: $1"
}

fetch_exact_2xx() {
  local url="$1"
  local output="$2"
  local label="$3"
  local headers="${4:-/dev/null}"
  local status

  status="$(curl --disable --noproxy '*' --proto '=http,https' --proto-redir '=http,https' \
    --silent --show-error --connect-timeout 3 --max-time 10 --max-redirs 0 \
    --max-filesize "$MAX_BODY_BYTES" \
    --output "$output" --dump-header "$headers" --write-out '%{http_code}' "$url")" \
    || die "${label} request failed"
  [[ "$status" =~ ^2[0-9][0-9]$ ]] \
    || die "${label} returned non-2xx HTTP status: ${status:-missing}"
  if [[ "$output" != /dev/null ]]; then
    [[ -f "$output" && ! -L "$output" && "$(stat -c '%s' -- "$output")" -le "$MAX_BODY_BYTES" ]] \
      || die "${label} response body exceeded the bounded parser input"
  fi
  if [[ "$headers" != /dev/null ]]; then
    [[ -f "$headers" && ! -L "$headers" && "$(stat -c '%s' -- "$headers")" -le "$MAX_HEADER_BYTES" ]] \
      || die "${label} response headers exceeded the bounded parser input"
  fi
}

release_sha=''
expected_migration=''
expected_migration_count=''
expected_web_build_id=''
api_base_url=''
web_url=''
unprivileged_test_mode=false

while (($# > 0)); do
  case "$1" in
    --release-sha)
      (($# >= 2)) || die '--release-sha requires a value'
      release_sha="$2"
      shift 2
      ;;
    --expected-migration)
      (($# >= 2)) || die '--expected-migration requires a value'
      expected_migration="$2"
      shift 2
      ;;
    --expected-migration-count)
      (($# >= 2)) || die '--expected-migration-count requires a value'
      expected_migration_count="$2"
      shift 2
      ;;
    --expected-web-build-id)
      (($# >= 2)) || die '--expected-web-build-id requires a value'
      expected_web_build_id="$2"
      shift 2
      ;;
    --api-base-url)
      (($# >= 2)) || die '--api-base-url requires a value'
      api_base_url="$2"
      shift 2
      ;;
    --web-url)
      (($# >= 2)) || die '--web-url requires a value'
      web_url="$2"
      shift 2
      ;;
    --unprivileged-test-mode)
      unprivileged_test_mode=true
      shift
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

if [[ "$unprivileged_test_mode" == true ]]; then
  ((EUID != 0)) || die 'unprivileged test mode is forbidden for root'
  PATH="$LEETPLUS_BOOTSTRAP_TEST_PATH"
  export PATH
else
  ((EUID == 0)) || die 'production readiness verification must run as root'
fi
unset LEETPLUS_BOOTSTRAP_TEST_PATH

# The trusted caller starts this script through /usr/bin/bash -p under env -i. Scrub
# again before curl/Node so no proxy, curl config, loader or Node injection can
# influence either the serving evidence or the root JSON parser.
for unsafe_environment_key in \
  HTTP_PROXY HTTPS_PROXY ALL_PROXY NO_PROXY \
  http_proxy https_proxy all_proxy no_proxy \
  NODE_USE_ENV_PROXY NODE_OPTIONS NODE_PATH NODE_EXTRA_CA_CERTS NODE_DEBUG \
  NODE_V8_COVERAGE NODE_COMPILE_CACHE SSLKEYLOGFILE LD_PRELOAD LD_LIBRARY_PATH \
  LD_AUDIT GCONV_PATH LOCPATH OPENSSL_CONF OPENSSL_MODULES GLIBC_TUNABLES \
  MALLOC_CHECK_ MALLOC_PERTURB_ BASH_ENV ENV \
  CURL_HOME CURL_CA_BUNDLE SSL_CERT_FILE SSL_CERT_DIR \
  PRISMA_QUERY_ENGINE_BINARY PRISMA_QUERY_ENGINE_LIBRARY PRISMA_SCHEMA_ENGINE_BINARY PRISMA_FMT_BINARY \
  TMPDIR TMP TEMP XDG_CONFIG_HOME XDG_CACHE_HOME XDG_DATA_HOME \
  NPM_CONFIG_USERCONFIG npm_config_userconfig PNPM_HOME COREPACK_HOME COREPACK_NPM_REGISTRY COREPACK_INTEGRITY_KEYS \
  GIT_CONFIG_GLOBAL GIT_CONFIG_SYSTEM GIT_CONFIG_NOSYSTEM; do
  unset "$unsafe_environment_key"
done
LC_ALL=C
LANG=C
TZ=UTC
export LC_ALL LANG TZ

[[ "$release_sha" =~ $RELEASE_SHA_PATTERN ]] || die 'release SHA must be 40 lowercase hexadecimal characters'
[[ "$expected_migration" =~ $MIGRATION_PATTERN ]] || die 'expected migration name is invalid'
[[ "$expected_migration_count" =~ ^[1-9][0-9]*$ ]] || die 'expected migration count must be a positive integer'
[[ "$expected_web_build_id" == "$release_sha" ]] || die 'expected Web BUILD_ID must equal the exact release SHA'
[[ "$api_base_url" =~ ^https?://[^/?#[:space:]]+(/[^?#[:space:]]*)?$ ]] || die 'API base URL must be an absolute http(s) URL without query or fragment'
[[ "$web_url" =~ ^https?://[^[:space:]]+$ ]] || die 'Web URL must be an absolute http(s) URL'

require_command curl
require_command mktemp
require_command node
require_command stat

version_file="$(mktemp)"
ready_file="$(mktemp)"
web_identity_file="$(mktemp)"
web_identity_headers="$(mktemp)"
cleanup() {
  rm -f -- "$version_file" "$ready_file" "$web_identity_file" "$web_identity_headers"
}
trap cleanup EXIT

api_base_url="${api_base_url%/}"
fetch_exact_2xx "${api_base_url}/version" "$version_file" 'API version'
fetch_exact_2xx "${api_base_url}/health/ready" "$ready_file" 'API readiness'
web_url="${web_url%/}"
fetch_exact_2xx "$web_url/" /dev/null 'Web root'
# This dynamic no-store endpoint is the authoritative live Web identity. The
# immutable static asset below remains a useful asset-serving smoke only; it
# cannot by itself prove that nginx/CDN reached the current Web process.
fetch_exact_2xx "$web_url/api/release-identity" "$web_identity_file" \
  'Web release identity' "$web_identity_headers"
tr -d '\r' < "$web_identity_headers" | awk '
  {
    line = tolower($0)
    if (line ~ /^cache-control:/ && line ~ /(^|[,[:space:]])no-store([,[:space:]]|$)/) found = 1
  }
  END { exit(found == 1 ? 0 : 1) }
' || die 'Web release identity response is not explicitly no-store'
fetch_exact_2xx \
  "${web_url}/_next/static/${expected_web_build_id}/_buildManifest.js" \
  /dev/null \
  'Web BUILD_ID manifest'

node - \
  "$release_sha" \
  "$expected_migration" \
  "$expected_migration_count" \
  "$expected_web_build_id" \
  "$version_file" \
  "$ready_file" \
  "$web_identity_file" <<'NODE'
const fs = require('node:fs');
const [releaseSha, expectedMigration, expectedMigrationCount, expectedWebBuildId, versionPath, readyPath, webIdentityPath] = process.argv.slice(2);
function readJson(filePath, label) {
  let value;
  try { value = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { throw new Error(`${label} response is not valid JSON`); }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} response is not an object`);
  return value;
}
const version = readJson(versionPath, 'version');
const ready = readJson(readyPath, 'readiness');
const webIdentity = readJson(webIdentityPath, 'Web release identity');
const database = ready.dependencies?.database;
const expectedMigrationCountNumber = Number(expectedMigrationCount);
const exactTargetAccepted =
  database?.migration === expectedMigration &&
  database?.migrationCount === expectedMigrationCountNumber &&
  database?.compatibility === undefined;
const bridge = database?.compatibility;
const bridgeKeys = bridge && typeof bridge === 'object' && !Array.isArray(bridge)
  ? Object.keys(bridge).sort().join(',')
  : '';
const admittedGuestSupportForwardBridges = [
  {
    sourceMigration: '20260820010000_guest_portal_telegram_update_ledger',
    sourceMigrationCount: 187,
    targetMigration: '20260828190000_guest_support_bug_reports',
    targetMigrationCount: 188,
  },
  {
    sourceMigration: '20260828190000_guest_support_bug_reports',
    sourceMigrationCount: 188,
    targetMigration: '20260831120000_guest_support_bug_report_input_repair',
    targetMigrationCount: 189,
  },
];
const guestSupportForwardBridgeAccepted =
  bridgeKeys === 'mode,targetMigration,targetMigrationCount' &&
  bridge.mode === 'GUEST_SUPPORT_SCHEMA_FORWARD_BRIDGE' &&
  bridge.targetMigration === expectedMigration &&
  bridge.targetMigrationCount === expectedMigrationCountNumber &&
  admittedGuestSupportForwardBridges.some((candidate) =>
    database?.migration === candidate.sourceMigration &&
    database?.migrationCount === candidate.sourceMigrationCount &&
    expectedMigration === candidate.targetMigration &&
    expectedMigrationCountNumber === candidate.targetMigrationCount
  );
if (
  version.service !== 'leetplus-api' ||
  version.release?.sha !== releaseSha ||
  ready.ok !== true ||
  ready.service !== 'leetplus-api' ||
  ready.release?.sha !== releaseSha ||
  database?.ok !== true ||
  (!exactTargetAccepted && !guestSupportForwardBridgeAccepted) ||
  webIdentity.ok !== true ||
  webIdentity.release?.sha !== releaseSha ||
  webIdentity.release?.webBuildId !== expectedWebBuildId
) throw new Error('running release readiness contract does not match expected evidence');
process.stdout.write(
  `RELEASE_READINESS_ACCEPTED_DATABASE_STATE=${guestSupportForwardBridgeAccepted
    ? 'GUEST_SUPPORT_SCHEMA_FORWARD_BRIDGE'
    : 'EXACT_TARGET'}\n` +
  `RELEASE_READINESS_OBSERVED_MIGRATION=${database.migration}\n` +
  `RELEASE_READINESS_OBSERVED_MIGRATION_COUNT=${database.migrationCount}\n`,
);
NODE

printf 'RELEASE_READINESS_ACCEPTED_SHA=%s\n' "$release_sha"
printf 'RELEASE_READINESS_ACCEPTED_MIGRATION=%s\n' "$expected_migration"
printf 'RELEASE_READINESS_ACCEPTED_MIGRATION_COUNT=%s\n' "$expected_migration_count"
printf 'RELEASE_READINESS_ACCEPTED_WEB_BUILD_ID=%s\n' "$expected_web_build_id"
