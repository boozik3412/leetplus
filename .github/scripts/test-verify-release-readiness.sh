#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

readonly RELEASE_SHA='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
readonly MIGRATION='20260828190000_guest_support_bug_reports'
readonly BRIDGE_SOURCE_MIGRATION='20260820010000_guest_portal_telegram_update_ledger'
readonly CURRENT189_MIGRATION='20260831120000_guest_support_bug_report_input_repair'
readonly REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly PROBE="${REPOSITORY_ROOT}/docs/deployment/production-artifact/verify-release-readiness.sh"
readonly TEST_ROOT="$(mktemp -d)"

cleanup() {
  rm -rf -- "$TEST_ROOT"
}
trap cleanup EXIT

mkdir -p "$TEST_ROOT/bin"
cat > "$TEST_ROOT/bin/curl" <<'CURL'
#!/usr/bin/env bash
set -euo pipefail

output=''
headers=''
write_out=''
url=''
disable_seen=false
noproxy=''
proto=''
proto_redir=''
max_filesize=''
while (($# > 0)); do
  case "$1" in
    --disable)
      disable_seen=true
      shift
      ;;
    --noproxy)
      noproxy="$2"
      shift 2
      ;;
    --proto)
      proto="$2"
      shift 2
      ;;
    --proto-redir)
      proto_redir="$2"
      shift 2
      ;;
    --max-filesize)
      max_filesize="$2"
      shift 2
      ;;
    --output)
      output="$2"
      shift 2
      ;;
    --silent|--show-error)
      shift
      ;;
    --write-out)
      write_out="$2"
      shift 2
      ;;
    --dump-header)
      headers="$2"
      shift 2
      ;;
    --max-time|--connect-timeout|--max-redirs)
      shift 2
      ;;
    *)
      url="$1"
      shift
      ;;
  esac
done

[[ "$disable_seen" == true && "$noproxy" == '*' \
  && "$proto" == '=http,https' && "$proto_redir" == '=http,https' \
  && "$max_filesize" == 1048576 ]] || exit 77
for unsafe_environment_key in \
  HTTP_PROXY HTTPS_PROXY ALL_PROXY NO_PROXY http_proxy https_proxy all_proxy no_proxy \
  NODE_USE_ENV_PROXY NODE_OPTIONS NODE_PATH NODE_EXTRA_CA_CERTS NODE_DEBUG \
  NODE_V8_COVERAGE NODE_COMPILE_CACHE SSLKEYLOGFILE LD_PRELOAD LD_LIBRARY_PATH \
  LD_AUDIT GCONV_PATH LOCPATH OPENSSL_CONF OPENSSL_MODULES GLIBC_TUNABLES \
  MALLOC_CHECK_ MALLOC_PERTURB_ BASH_ENV ENV CURL_HOME CURL_CA_BUNDLE \
  SSL_CERT_FILE SSL_CERT_DIR PRISMA_QUERY_ENGINE_BINARY PRISMA_QUERY_ENGINE_LIBRARY \
  PRISMA_SCHEMA_ENGINE_BINARY PRISMA_FMT_BINARY TMPDIR TMP TEMP XDG_CONFIG_HOME \
  XDG_CACHE_HOME XDG_DATA_HOME NPM_CONFIG_USERCONFIG npm_config_userconfig PNPM_HOME \
  COREPACK_HOME COREPACK_NPM_REGISTRY COREPACK_INTEGRITY_KEYS GIT_CONFIG_GLOBAL \
  GIT_CONFIG_SYSTEM GIT_CONFIG_NOSYSTEM; do
  [[ ! -v "$unsafe_environment_key" ]] || exit 78
done

case "$url" in
  */version)
    printf '%s\n' "${TEST_VERSION_BODY:?}" > "$output"
    status="${TEST_VERSION_STATUS:-200}"
    ;;
  */health/ready)
    printf '%s\n' "${TEST_READY_BODY:?}" > "$output"
    status="${TEST_READY_STATUS:-200}"
    ;;
  */api/release-identity)
    printf '%s\n' "${TEST_WEB_IDENTITY_BODY:?}" > "$output"
    status="${TEST_WEB_IDENTITY_STATUS:-200}"
    ;;
  */_buildManifest.js)
    test "$output" = /dev/null
    status="${TEST_WEB_MANIFEST_STATUS:-200}"
    ;;
  *)
    test "$output" = /dev/null
    status="${TEST_WEB_ROOT_STATUS:-200}"
    ;;
esac
if [[ "${TEST_OVERSIZED_BODY_PATH:-}" == "$url" && "$output" != /dev/null ]]; then
  head -c 1048577 /dev/zero > "$output"
fi
if [[ "$headers" != /dev/null ]]; then
  if [[ "${TEST_OVERSIZED_HEADERS_PATH:-}" == "$url" ]]; then
    head -c 65537 /dev/zero > "$headers"
  else
    printf 'HTTP/1.1 %s Fixture\r\nCache-Control: %s\r\n\r\n' \
      "$status" "${TEST_CACHE_CONTROL:-private, no-store, max-age=0}" > "$headers"
  fi
fi
printf '%s\n' "$url" >> "${TEST_CURL_LOG:?}"
test "$write_out" = '%{http_code}'
printf '%s' "$status"
CURL
chmod 0700 "$TEST_ROOT/bin/curl"

valid_version="{\"service\":\"leetplus-api\",\"release\":{\"sha\":\"${RELEASE_SHA}\"}}"
valid_ready="{\"ok\":true,\"service\":\"leetplus-api\",\"release\":{\"sha\":\"${RELEASE_SHA}\"},\"dependencies\":{\"database\":{\"ok\":true,\"migration\":\"${MIGRATION}\",\"migrationCount\":188}}}"
valid_bridge_ready="{\"ok\":true,\"service\":\"leetplus-api\",\"release\":{\"sha\":\"${RELEASE_SHA}\"},\"dependencies\":{\"database\":{\"ok\":true,\"migration\":\"${BRIDGE_SOURCE_MIGRATION}\",\"migrationCount\":187,\"compatibility\":{\"mode\":\"GUEST_SUPPORT_SCHEMA_FORWARD_BRIDGE\",\"targetMigration\":\"${MIGRATION}\",\"targetMigrationCount\":188}}}}"
valid_current189_bridge_ready="{\"ok\":true,\"service\":\"leetplus-api\",\"release\":{\"sha\":\"${RELEASE_SHA}\"},\"dependencies\":{\"database\":{\"ok\":true,\"migration\":\"${MIGRATION}\",\"migrationCount\":188,\"compatibility\":{\"mode\":\"GUEST_SUPPORT_SCHEMA_FORWARD_BRIDGE\",\"targetMigration\":\"${CURRENT189_MIGRATION}\",\"targetMigrationCount\":189}}}}"
valid_web_identity="{\"ok\":true,\"release\":{\"sha\":\"${RELEASE_SHA}\",\"webBuildId\":\"${RELEASE_SHA}\"}}"

PATH="$TEST_ROOT/bin:$PATH" TEST_VERSION_BODY="$valid_version" TEST_READY_BODY="$valid_ready" TEST_WEB_IDENTITY_BODY="$valid_web_identity" TEST_CURL_LOG="$TEST_ROOT/curl.log" \
  /usr/bin/bash -p "$PROBE" \
    --release-sha "$RELEASE_SHA" \
    --expected-migration "$MIGRATION" \
    --expected-migration-count 188 \
    --expected-web-build-id "$RELEASE_SHA" \
    --api-base-url https://api.example.test/ \
    --web-url https://web.example.test/ \
    --unprivileged-test-mode > "$TEST_ROOT/accepted.out"

grep -F -x "RELEASE_READINESS_ACCEPTED_SHA=${RELEASE_SHA}" "$TEST_ROOT/accepted.out" > /dev/null
grep -F -x 'RELEASE_READINESS_ACCEPTED_DATABASE_STATE=EXACT_TARGET' "$TEST_ROOT/accepted.out" > /dev/null
grep -F -x "RELEASE_READINESS_OBSERVED_MIGRATION=${MIGRATION}" "$TEST_ROOT/accepted.out" > /dev/null
grep -F -x 'RELEASE_READINESS_OBSERVED_MIGRATION_COUNT=188' "$TEST_ROOT/accepted.out" > /dev/null
grep -F -x "https://web.example.test/_next/static/${RELEASE_SHA}/_buildManifest.js" "$TEST_ROOT/curl.log" > /dev/null
grep -F -x 'https://web.example.test/api/release-identity' "$TEST_ROOT/curl.log" > /dev/null

PATH="$TEST_ROOT/bin:$PATH" TEST_VERSION_BODY="$valid_version" TEST_READY_BODY="$valid_bridge_ready" TEST_WEB_IDENTITY_BODY="$valid_web_identity" TEST_CURL_LOG="$TEST_ROOT/bridge-curl.log" \
  /usr/bin/bash -p "$PROBE" \
    --release-sha "$RELEASE_SHA" \
    --expected-migration "$MIGRATION" \
    --expected-migration-count 188 \
    --expected-web-build-id "$RELEASE_SHA" \
    --api-base-url https://api.example.test/ \
    --web-url https://web.example.test/ \
    --unprivileged-test-mode > "$TEST_ROOT/bridge-accepted.out"

grep -F -x 'RELEASE_READINESS_ACCEPTED_DATABASE_STATE=GUEST_SUPPORT_SCHEMA_FORWARD_BRIDGE' \
  "$TEST_ROOT/bridge-accepted.out" > /dev/null
grep -F -x "RELEASE_READINESS_OBSERVED_MIGRATION=${BRIDGE_SOURCE_MIGRATION}" \
  "$TEST_ROOT/bridge-accepted.out" > /dev/null
grep -F -x 'RELEASE_READINESS_OBSERVED_MIGRATION_COUNT=187' \
  "$TEST_ROOT/bridge-accepted.out" > /dev/null

PATH="$TEST_ROOT/bin:$PATH" TEST_VERSION_BODY="$valid_version" TEST_READY_BODY="$valid_current189_bridge_ready" TEST_WEB_IDENTITY_BODY="$valid_web_identity" TEST_CURL_LOG="$TEST_ROOT/current189-bridge-curl.log" \
  /usr/bin/bash -p "$PROBE" \
    --release-sha "$RELEASE_SHA" \
    --expected-migration "$CURRENT189_MIGRATION" \
    --expected-migration-count 189 \
    --expected-web-build-id "$RELEASE_SHA" \
    --api-base-url https://api.example.test/ \
    --web-url https://web.example.test/ \
    --unprivileged-test-mode > "$TEST_ROOT/current189-bridge-accepted.out"

grep -F -x 'RELEASE_READINESS_ACCEPTED_DATABASE_STATE=GUEST_SUPPORT_SCHEMA_FORWARD_BRIDGE' \
  "$TEST_ROOT/current189-bridge-accepted.out" > /dev/null
grep -F -x "RELEASE_READINESS_OBSERVED_MIGRATION=${MIGRATION}" \
  "$TEST_ROOT/current189-bridge-accepted.out" > /dev/null
grep -F -x 'RELEASE_READINESS_OBSERVED_MIGRATION_COUNT=188' \
  "$TEST_ROOT/current189-bridge-accepted.out" > /dev/null

invalid_current189_bridge_source_count="{\"ok\":true,\"service\":\"leetplus-api\",\"release\":{\"sha\":\"${RELEASE_SHA}\"},\"dependencies\":{\"database\":{\"ok\":true,\"migration\":\"${MIGRATION}\",\"migrationCount\":187,\"compatibility\":{\"mode\":\"GUEST_SUPPORT_SCHEMA_FORWARD_BRIDGE\",\"targetMigration\":\"${CURRENT189_MIGRATION}\",\"targetMigrationCount\":189}}}}"
if PATH="$TEST_ROOT/bin:$PATH" TEST_VERSION_BODY="$valid_version" TEST_READY_BODY="$invalid_current189_bridge_source_count" TEST_WEB_IDENTITY_BODY="$valid_web_identity" TEST_CURL_LOG="$TEST_ROOT/curl.log" \
  /usr/bin/bash -p "$PROBE" \
    --release-sha "$RELEASE_SHA" \
    --expected-migration "$CURRENT189_MIGRATION" \
    --expected-migration-count 189 \
    --expected-web-build-id "$RELEASE_SHA" \
    --api-base-url https://api.example.test \
    --web-url https://web.example.test/ \
    --unprivileged-test-mode > "$TEST_ROOT/current189-bridge-source-count-rejected.out" 2>&1; then
  printf 'CURRENT_189 bridge with an invalid source count was unexpectedly accepted\n' >&2
  exit 1
fi

bridge_with_extra_evidence="{\"ok\":true,\"service\":\"leetplus-api\",\"release\":{\"sha\":\"${RELEASE_SHA}\"},\"dependencies\":{\"database\":{\"ok\":true,\"migration\":\"${BRIDGE_SOURCE_MIGRATION}\",\"migrationCount\":187,\"compatibility\":{\"mode\":\"GUEST_SUPPORT_SCHEMA_FORWARD_BRIDGE\",\"targetMigration\":\"${MIGRATION}\",\"targetMigrationCount\":188,\"unexpected\":true}}}}"
if PATH="$TEST_ROOT/bin:$PATH" TEST_VERSION_BODY="$valid_version" TEST_READY_BODY="$bridge_with_extra_evidence" TEST_WEB_IDENTITY_BODY="$valid_web_identity" TEST_CURL_LOG="$TEST_ROOT/curl.log" \
  /usr/bin/bash -p "$PROBE" \
    --release-sha "$RELEASE_SHA" \
    --expected-migration "$MIGRATION" \
    --expected-migration-count 188 \
    --expected-web-build-id "$RELEASE_SHA" \
    --api-base-url https://api.example.test \
    --web-url https://web.example.test/ \
    --unprivileged-test-mode > "$TEST_ROOT/bridge-extra-evidence-rejected.out" 2>&1; then
  printf 'bridge readiness with an extended compatibility envelope was unexpectedly accepted\n' >&2
  exit 1
fi

exact_target_with_bridge="{\"ok\":true,\"service\":\"leetplus-api\",\"release\":{\"sha\":\"${RELEASE_SHA}\"},\"dependencies\":{\"database\":{\"ok\":true,\"migration\":\"${MIGRATION}\",\"migrationCount\":188,\"compatibility\":{\"mode\":\"GUEST_SUPPORT_SCHEMA_FORWARD_BRIDGE\",\"targetMigration\":\"${MIGRATION}\",\"targetMigrationCount\":188}}}}"
if PATH="$TEST_ROOT/bin:$PATH" TEST_VERSION_BODY="$valid_version" TEST_READY_BODY="$exact_target_with_bridge" TEST_WEB_IDENTITY_BODY="$valid_web_identity" TEST_CURL_LOG="$TEST_ROOT/curl.log" \
  /usr/bin/bash -p "$PROBE" \
    --release-sha "$RELEASE_SHA" \
    --expected-migration "$MIGRATION" \
    --expected-migration-count 188 \
    --expected-web-build-id "$RELEASE_SHA" \
    --api-base-url https://api.example.test \
    --web-url https://web.example.test/ \
    --unprivileged-test-mode > "$TEST_ROOT/exact-target-with-bridge-rejected.out" 2>&1; then
  printf 'exact target carrying stale bridge evidence was unexpectedly accepted\n' >&2
  exit 1
fi

invalid_ready="{\"ok\":true,\"service\":\"leetplus-api\",\"release\":{\"sha\":\"${RELEASE_SHA}\"},\"dependencies\":{\"database\":{\"ok\":true,\"migration\":\"${MIGRATION}\",\"migrationCount\":186}}}"
if PATH="$TEST_ROOT/bin:$PATH" TEST_VERSION_BODY="$valid_version" TEST_READY_BODY="$invalid_ready" TEST_WEB_IDENTITY_BODY="$valid_web_identity" TEST_CURL_LOG="$TEST_ROOT/curl.log" \
  /usr/bin/bash -p "$PROBE" \
    --release-sha "$RELEASE_SHA" \
    --expected-migration "$MIGRATION" \
    --expected-migration-count 188 \
    --expected-web-build-id "$RELEASE_SHA" \
    --api-base-url https://api.example.test \
    --web-url https://web.example.test/ \
    --unprivileged-test-mode > "$TEST_ROOT/rejected.out" 2>&1; then
  printf 'mismatched readiness was unexpectedly accepted\n' >&2
  exit 1
fi

if PATH="$TEST_ROOT/bin:$PATH" TEST_VERSION_BODY="$valid_version" TEST_READY_BODY="$valid_ready" TEST_WEB_IDENTITY_BODY="$valid_web_identity" TEST_CURL_LOG="$TEST_ROOT/curl.log" \
  /usr/bin/bash -p "$PROBE" \
    --release-sha "$RELEASE_SHA" \
    --expected-migration "$MIGRATION" \
    --expected-migration-count 188 \
    --expected-web-build-id "$(printf 'b%.0s' {1..40})" \
    --api-base-url https://api.example.test \
    --web-url https://web.example.test/ \
    --unprivileged-test-mode > "$TEST_ROOT/web-id-rejected.out" 2>&1; then
  printf 'mismatched Web BUILD_ID was unexpectedly accepted\n' >&2
  exit 1
fi

if PATH="$TEST_ROOT/bin:$PATH" TEST_VERSION_BODY="$valid_version" TEST_READY_BODY="$valid_ready" TEST_WEB_IDENTITY_BODY="$valid_web_identity" \
  TEST_WEB_MANIFEST_STATUS=302 TEST_CURL_LOG="$TEST_ROOT/curl.log" \
  /usr/bin/bash -p "$PROBE" \
    --release-sha "$RELEASE_SHA" \
    --expected-migration "$MIGRATION" \
    --expected-migration-count 188 \
    --expected-web-build-id "$RELEASE_SHA" \
    --api-base-url https://api.example.test \
    --web-url https://web.example.test/ \
    --unprivileged-test-mode > "$TEST_ROOT/web-redirect-rejected.out" 2>&1; then
  printf 'redirecting Web BUILD_ID manifest was unexpectedly accepted\n' >&2
  exit 1
fi
grep -F 'Web BUILD_ID manifest returned non-2xx HTTP status: 302' "$TEST_ROOT/web-redirect-rejected.out" >/dev/null

if PATH="$TEST_ROOT/bin:$PATH" TEST_VERSION_BODY="$valid_version" TEST_READY_BODY="$valid_ready" \
  TEST_WEB_IDENTITY_BODY="$valid_web_identity" TEST_CACHE_CONTROL=public,max-age=3600 TEST_CURL_LOG="$TEST_ROOT/curl.log" \
  /usr/bin/bash -p "$PROBE" \
    --release-sha "$RELEASE_SHA" \
    --expected-migration "$MIGRATION" \
    --expected-migration-count 188 \
    --expected-web-build-id "$RELEASE_SHA" \
    --api-base-url https://api.example.test \
    --web-url https://web.example.test/ \
    --unprivileged-test-mode > "$TEST_ROOT/web-cacheable-identity-rejected.out" 2>&1; then
  printf 'cacheable dynamic Web identity was unexpectedly accepted\n' >&2
  exit 1
fi

mkdir -p "$TEST_ROOT/curl-home"
printf -- '--proxy http://127.0.0.1:9999\n' > "$TEST_ROOT/curl-home/.curlrc"
hostile_log="$TEST_ROOT/hostile-environment-curl.log"
HTTP_PROXY=http://127.0.0.1:9999 \
NODE_OPTIONS=--definitely-invalid \
CURL_HOME="$TEST_ROOT/curl-home" \
PATH="$TEST_ROOT/bin:$PATH" \
TEST_VERSION_BODY="$valid_version" TEST_READY_BODY="$valid_ready" \
TEST_WEB_IDENTITY_BODY="$valid_web_identity" TEST_CURL_LOG="$hostile_log" \
  /usr/bin/bash -p "$PROBE" \
    --release-sha "$RELEASE_SHA" \
    --expected-migration "$MIGRATION" \
    --expected-migration-count 188 \
    --expected-web-build-id "$RELEASE_SHA" \
    --api-base-url https://api.example.test \
    --web-url https://web.example.test \
    --unprivileged-test-mode > "$TEST_ROOT/hostile-environment-accepted.out"
grep -F -x "RELEASE_READINESS_ACCEPTED_SHA=${RELEASE_SHA}" \
  "$TEST_ROOT/hostile-environment-accepted.out" >/dev/null

if PATH="$TEST_ROOT/bin:$PATH" TEST_VERSION_BODY="$valid_version" TEST_READY_BODY="$valid_ready" \
  TEST_WEB_IDENTITY_BODY="$valid_web_identity" TEST_CURL_LOG="$TEST_ROOT/curl.log" \
  TEST_OVERSIZED_BODY_PATH=https://api.example.test/version \
  /usr/bin/bash -p "$PROBE" \
    --release-sha "$RELEASE_SHA" \
    --expected-migration "$MIGRATION" \
    --expected-migration-count 188 \
    --expected-web-build-id "$RELEASE_SHA" \
    --api-base-url https://api.example.test \
    --web-url https://web.example.test \
    --unprivileged-test-mode > "$TEST_ROOT/oversized-body-rejected.out" 2>&1; then
  printf 'chunked oversized readiness body was unexpectedly accepted\n' >&2
  exit 1
fi
grep -F 'response body exceeded the bounded parser input' \
  "$TEST_ROOT/oversized-body-rejected.out" >/dev/null

if PATH="$TEST_ROOT/bin:$PATH" TEST_VERSION_BODY="$valid_version" TEST_READY_BODY="$valid_ready" \
  TEST_WEB_IDENTITY_BODY="$valid_web_identity" TEST_CURL_LOG="$TEST_ROOT/curl.log" \
  TEST_OVERSIZED_HEADERS_PATH=https://web.example.test/api/release-identity \
  /usr/bin/bash -p "$PROBE" \
    --release-sha "$RELEASE_SHA" \
    --expected-migration "$MIGRATION" \
    --expected-migration-count 188 \
    --expected-web-build-id "$RELEASE_SHA" \
    --api-base-url https://api.example.test \
    --web-url https://web.example.test \
    --unprivileged-test-mode > "$TEST_ROOT/oversized-headers-rejected.out" 2>&1; then
  printf 'oversized readiness headers were unexpectedly accepted\n' >&2
  exit 1
fi
grep -F 'response headers exceeded the bounded parser input' \
  "$TEST_ROOT/oversized-headers-rejected.out" >/dev/null

printf 'verify-release-readiness test: PASS\n'
