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
url=''
while (($# > 0)); do
  case "$1" in
    --output)
      output="$2"
      shift 2
      ;;
    --fail|--silent|--show-error)
      shift
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
    ;;
  */health/ready)
    printf '%s\n' "${TEST_READY_BODY:?}" > "$output"
    ;;
  *)
    test "$output" = /dev/null
    ;;
esac
CURL
chmod 0700 "$TEST_ROOT/bin/curl"

valid_version="{\"service\":\"leetplus-api\",\"release\":{\"sha\":\"${RELEASE_SHA}\"}}"
valid_ready="{\"ok\":true,\"service\":\"leetplus-api\",\"release\":{\"sha\":\"${RELEASE_SHA}\"},\"dependencies\":{\"database\":{\"ok\":true,\"migration\":\"${MIGRATION}\",\"migrationCount\":187}}}"

PATH="$TEST_ROOT/bin:$PATH" TEST_VERSION_BODY="$valid_version" TEST_READY_BODY="$valid_ready" \
  bash "$PROBE" \
    --release-sha "$RELEASE_SHA" \
    --expected-migration "$MIGRATION" \
    --expected-migration-count 187 \
    --api-base-url https://api.example.test/ \
    --web-url https://web.example.test/ > "$TEST_ROOT/accepted.out"

grep -F -x "RELEASE_READINESS_ACCEPTED_SHA=${RELEASE_SHA}" "$TEST_ROOT/accepted.out" > /dev/null

invalid_ready="{\"ok\":true,\"service\":\"leetplus-api\",\"release\":{\"sha\":\"${RELEASE_SHA}\"},\"dependencies\":{\"database\":{\"ok\":true,\"migration\":\"${MIGRATION}\",\"migrationCount\":186}}}"
if PATH="$TEST_ROOT/bin:$PATH" TEST_VERSION_BODY="$valid_version" TEST_READY_BODY="$invalid_ready" \
  bash "$PROBE" \
    --release-sha "$RELEASE_SHA" \
    --expected-migration "$MIGRATION" \
    --expected-migration-count 187 \
    --api-base-url https://api.example.test \
    --web-url https://web.example.test/ > "$TEST_ROOT/rejected.out" 2>&1; then
  printf 'mismatched readiness was unexpectedly accepted\n' >&2
  exit 1
fi

printf 'verify-release-readiness test: PASS\n'
