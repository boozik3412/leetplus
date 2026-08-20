#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

readonly RELEASE_SHA='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
readonly REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly STAGER="${REPOSITORY_ROOT}/docs/deployment/production-artifact/stage-release-artifact.sh"
readonly TEST_ROOT="$(mktemp -d)"

cleanup() {
  rm -rf -- "$TEST_ROOT"
}
trap cleanup EXIT

make_artifact() {
  local fixture_root="$1"
  local inbox="$2"
  local archive="$3"

  mkdir -p \
    "$fixture_root/apps/api/dist" \
    "$fixture_root/apps/web/.next" \
    "$fixture_root/apps/web/public" \
    "$fixture_root/packages/database/prisma" \
    "$inbox"
  printf 'api' > "$fixture_root/apps/api/dist/main.js"
  printf '{}' > "$fixture_root/apps/api/package.json"
  printf 'build-id' > "$fixture_root/apps/web/.next/BUILD_ID"
  printf '{}' > "$fixture_root/apps/web/package.json"
  printf '{}' > "$fixture_root/packages/database/package.json"
  printf 'generator client { provider = "prisma-client-js" }\n' > "$fixture_root/packages/database/prisma/schema.prisma"
  printf 'lockfileVersion: "9.0"\n' > "$fixture_root/pnpm-lock.yaml"
  printf 'packages:\n  - apps/*\n' > "$fixture_root/pnpm-workspace.yaml"
  printf '{"releaseSha":"%s","databaseMigration":"20260820010000_fixture","databaseMigrationCount":1}\n' "$RELEASE_SHA" > "$fixture_root/release-provenance.json"
  (
    cd -- "$fixture_root"
    find . -type f ! -name SHA256SUMS -print0 \
      | LC_ALL=C sort -z \
      | xargs -0 sha256sum > SHA256SUMS
    tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner -czf "$archive" .
  )
  (
    cd -- "$inbox"
    sha256sum "$(basename -- "$archive")" > "$(basename -- "$archive").sha256"
  )
}

fixture_root="${TEST_ROOT}/fixture"
inbox="${TEST_ROOT}/inbox"
archive="${inbox}/leetplus-release-${RELEASE_SHA}.tar.gz"
stage_root="${TEST_ROOT}/staged"
mkdir -p "$stage_root"
make_artifact "$fixture_root" "$inbox" "$archive"

bash "$STAGER" \
  --release-sha "$RELEASE_SHA" \
  --artifact "$archive" \
  --artifact-sha256 "${archive}.sha256" \
  --output-root "$stage_root" > "${TEST_ROOT}/accepted.out"

test -f "${stage_root}/${RELEASE_SHA}/apps/api/dist/main.js"
test -f "${stage_root}/${RELEASE_SHA}/SHA256SUMS"
test ! -e "${stage_root}/${RELEASE_SHA}/node_modules"
grep -F -x "STAGED_RELEASE_SHA=${RELEASE_SHA}" "${TEST_ROOT}/accepted.out" > /dev/null

printf 'corruption' >> "$archive"
negative_stage_root="${TEST_ROOT}/negative-staged"
mkdir -p "$negative_stage_root"
if bash "$STAGER" \
  --release-sha "$RELEASE_SHA" \
  --artifact "$archive" \
  --artifact-sha256 "${archive}.sha256" \
  --output-root "$negative_stage_root" > "${TEST_ROOT}/rejected.out" 2>&1; then
  printf 'corrupted artifact was unexpectedly accepted\n' >&2
  exit 1
fi
test ! -e "${negative_stage_root}/${RELEASE_SHA}"

printf 'stage-release-artifact test: PASS\n'
