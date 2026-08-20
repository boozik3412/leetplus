#!/usr/bin/env bash
#
# Verify a running LeetPlus artifact release without mutating it.
#
# This probe has no database, systemd, filesystem-switch or secret capability.
# It checks only already exposed API/Web HTTP contracts.

set -euo pipefail
IFS=$'\n\t'

readonly RELEASE_SHA_PATTERN='^[0-9a-f]{40}$'
readonly MIGRATION_PATTERN='^[0-9]{14}_[a-z0-9_]+$'

usage() {
  cat <<'USAGE'
Usage:
  verify-release-readiness.sh \
    --release-sha <40-lowercase-hex> \
    --expected-migration <migration-name> \
    --expected-migration-count <positive-integer> \
    --api-base-url <http(s)-url> \
    --web-url <http(s)-url>

The API must expose /version and /health/ready. The probe accepts only an
exact release SHA, expected completed migration name/count and an HTTP-success
Web response. It performs no write or restart operation.
USAGE
}

die() {
  printf 'verify-release-readiness: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command is unavailable: $1"
}

release_sha=''
expected_migration=''
expected_migration_count=''
api_base_url=''
web_url=''

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
    --help|-h)
      usage
      exit 0
      ;;
    *)
      die "unknown argument: $1"
      ;;
  esac
done

[[ "$release_sha" =~ $RELEASE_SHA_PATTERN ]] || die 'release SHA must be 40 lowercase hexadecimal characters'
[[ "$expected_migration" =~ $MIGRATION_PATTERN ]] || die 'expected migration name is invalid'
[[ "$expected_migration_count" =~ ^[1-9][0-9]*$ ]] || die 'expected migration count must be a positive integer'
[[ "$api_base_url" =~ ^https?://[^/?#[:space:]]+(/[^?#[:space:]]*)?$ ]] || die 'API base URL must be an absolute http(s) URL without query or fragment'
[[ "$web_url" =~ ^https?://[^[:space:]]+$ ]] || die 'Web URL must be an absolute http(s) URL'

require_command curl
require_command mktemp
require_command node

version_file="$(mktemp)"
ready_file="$(mktemp)"
cleanup() {
  rm -f -- "$version_file" "$ready_file"
}
trap cleanup EXIT

api_base_url="${api_base_url%/}"
curl --fail --silent --show-error --max-time 10 --output "$version_file" "${api_base_url}/version"
curl --fail --silent --show-error --max-time 10 --output "$ready_file" "${api_base_url}/health/ready"
curl --fail --silent --show-error --max-time 10 --output /dev/null "$web_url"

node - "$release_sha" "$expected_migration" "$expected_migration_count" "$version_file" "$ready_file" <<'NODE'
const fs = require('node:fs');
const [releaseSha, expectedMigration, expectedMigrationCount, versionPath, readyPath] = process.argv.slice(2);
function readJson(filePath, label) {
  let value;
  try { value = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { throw new Error(`${label} response is not valid JSON`); }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} response is not an object`);
  return value;
}
const version = readJson(versionPath, 'version');
const ready = readJson(readyPath, 'readiness');
if (
  version.service !== 'leetplus-api' ||
  version.release?.sha !== releaseSha ||
  ready.ok !== true ||
  ready.service !== 'leetplus-api' ||
  ready.release?.sha !== releaseSha ||
  ready.dependencies?.database?.ok !== true ||
  ready.dependencies.database.migration !== expectedMigration ||
  ready.dependencies.database.migrationCount !== Number(expectedMigrationCount)
) throw new Error('running release readiness contract does not match expected evidence');
NODE

printf 'RELEASE_READINESS_ACCEPTED_SHA=%s\n' "$release_sha"
printf 'RELEASE_READINESS_ACCEPTED_MIGRATION=%s\n' "$expected_migration"
printf 'RELEASE_READINESS_ACCEPTED_MIGRATION_COUNT=%s\n' "$expected_migration_count"
