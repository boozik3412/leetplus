#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

readonly RELEASE_SHA='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
readonly MIGRATION='20260820010000_guest_portal_telegram_update_ledger'
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
while (($# > 0)); do
  case "$1" in
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
    --max-time)
      shift 2
      ;;
    *)
      url="$1"
      shift
      ;;
  esac
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
if [[ "$headers" != /dev/null ]]; then
  printf 'HTTP/1.1 %s Fixture\r\nCache-Control: %s\r\n\r\n' \
    "$status" "${TEST_CACHE_CONTROL:-private, no-store, max-age=0}" > "$headers"
fi
printf '%s\n' "$url" >> "${TEST_CURL_LOG:?}"
test "$write_out" = '%{http_code}'
printf '%s' "$status"
CURL
chmod 0700 "$TEST_ROOT/bin/curl"

valid_version="{\"service\":\"leetplus-api\",\"release\":{\"sha\":\"${RELEASE_SHA}\"}}"
valid_ready="{\"ok\":true,\"service\":\"leetplus-api\",\"release\":{\"sha\":\"${RELEASE_SHA}\"},\"dependencies\":{\"database\":{\"ok\":true,\"migration\":\"${MIGRATION}\",\"migrationCount\":187}}}"
valid_web_identity="{\"ok\":true,\"release\":{\"sha\":\"${RELEASE_SHA}\",\"webBuildId\":\"${RELEASE_SHA}\"}}"

PATH="$TEST_ROOT/bin:$PATH" TEST_VERSION_BODY="$valid_version" TEST_READY_BODY="$valid_ready" TEST_WEB_IDENTITY_BODY="$valid_web_identity" TEST_CURL_LOG="$TEST_ROOT/curl.log" \
  bash "$PROBE" \
    --release-sha "$RELEASE_SHA" \
    --expected-migration "$MIGRATION" \
    --expected-migration-count 187 \
    --expected-web-build-id "$RELEASE_SHA" \
    --api-base-url https://api.example.test/ \
    --web-url https://web.example.test/ > "$TEST_ROOT/accepted.out"

grep -F -x "RELEASE_READINESS_ACCEPTED_SHA=${RELEASE_SHA}" "$TEST_ROOT/accepted.out" > /dev/null
grep -F -x "https://web.example.test/_next/static/${RELEASE_SHA}/_buildManifest.js" "$TEST_ROOT/curl.log" > /dev/null
grep -F -x 'https://web.example.test/api/release-identity' "$TEST_ROOT/curl.log" > /dev/null

invalid_ready="{\"ok\":true,\"service\":\"leetplus-api\",\"release\":{\"sha\":\"${RELEASE_SHA}\"},\"dependencies\":{\"database\":{\"ok\":true,\"migration\":\"${MIGRATION}\",\"migrationCount\":186}}}"
if PATH="$TEST_ROOT/bin:$PATH" TEST_VERSION_BODY="$valid_version" TEST_READY_BODY="$invalid_ready" TEST_WEB_IDENTITY_BODY="$valid_web_identity" TEST_CURL_LOG="$TEST_ROOT/curl.log" \
  bash "$PROBE" \
    --release-sha "$RELEASE_SHA" \
    --expected-migration "$MIGRATION" \
    --expected-migration-count 187 \
    --expected-web-build-id "$RELEASE_SHA" \
    --api-base-url https://api.example.test \
    --web-url https://web.example.test/ > "$TEST_ROOT/rejected.out" 2>&1; then
  printf 'mismatched readiness was unexpectedly accepted\n' >&2
  exit 1
fi

if PATH="$TEST_ROOT/bin:$PATH" TEST_VERSION_BODY="$valid_version" TEST_READY_BODY="$valid_ready" TEST_WEB_IDENTITY_BODY="$valid_web_identity" TEST_CURL_LOG="$TEST_ROOT/curl.log" \
  bash "$PROBE" \
    --release-sha "$RELEASE_SHA" \
    --expected-migration "$MIGRATION" \
    --expected-migration-count 187 \
    --expected-web-build-id "$(printf 'b%.0s' {1..40})" \
    --api-base-url https://api.example.test \
    --web-url https://web.example.test/ > "$TEST_ROOT/web-id-rejected.out" 2>&1; then
  printf 'mismatched Web BUILD_ID was unexpectedly accepted\n' >&2
  exit 1
fi

if PATH="$TEST_ROOT/bin:$PATH" TEST_VERSION_BODY="$valid_version" TEST_READY_BODY="$valid_ready" TEST_WEB_IDENTITY_BODY="$valid_web_identity" \
  TEST_WEB_MANIFEST_STATUS=302 TEST_CURL_LOG="$TEST_ROOT/curl.log" \
  bash "$PROBE" \
    --release-sha "$RELEASE_SHA" \
    --expected-migration "$MIGRATION" \
    --expected-migration-count 187 \
    --expected-web-build-id "$RELEASE_SHA" \
    --api-base-url https://api.example.test \
    --web-url https://web.example.test/ > "$TEST_ROOT/web-redirect-rejected.out" 2>&1; then
  printf 'redirecting Web BUILD_ID manifest was unexpectedly accepted\n' >&2
  exit 1
fi
grep -F 'Web BUILD_ID manifest returned non-2xx HTTP status: 302' "$TEST_ROOT/web-redirect-rejected.out" >/dev/null

if PATH="$TEST_ROOT/bin:$PATH" TEST_VERSION_BODY="$valid_version" TEST_READY_BODY="$valid_ready" \
  TEST_WEB_IDENTITY_BODY="$valid_web_identity" TEST_CACHE_CONTROL=public,max-age=3600 TEST_CURL_LOG="$TEST_ROOT/curl.log" \
  bash "$PROBE" \
    --release-sha "$RELEASE_SHA" \
    --expected-migration "$MIGRATION" \
    --expected-migration-count 187 \
    --expected-web-build-id "$RELEASE_SHA" \
    --api-base-url https://api.example.test \
    --web-url https://web.example.test/ > "$TEST_ROOT/web-cacheable-identity-rejected.out" 2>&1; then
  printf 'cacheable dynamic Web identity was unexpectedly accepted\n' >&2
  exit 1
fi

printf 'verify-release-readiness test: PASS\n'
