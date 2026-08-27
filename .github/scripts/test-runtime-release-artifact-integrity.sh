#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

readonly RELEASE_SHA='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
readonly DATABASE_MIGRATION='20260820010000_fixture'
readonly REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly STAGER="${REPOSITORY_ROOT}/docs/deployment/production-artifact/stage-release-artifact.sh"
readonly EXTRACTOR="${REPOSITORY_ROOT}/.github/scripts/extract-runtime-release-artifact.py"
readonly VERIFIER="${REPOSITORY_ROOT}/.github/scripts/verify-runtime-release-artifact.mjs"
readonly HYDRATION_AUTHORITY="${REPOSITORY_ROOT}/.github/scripts/hydrate-runtime-release-artifact-ci.sh"
readonly RELEASE_ADMISSION_WORKFLOW="${REPOSITORY_ROOT}/.github/workflows/ci.yml"
readonly TEST_ROOT="$(mktemp -d)"
readonly OPERATIONAL_SCRIPTS=(
  canonical-prisma-deploy.mjs
  current-network-access-scope-classification.cli.mjs
  current-network-access-scope-classification.mjs
  current-release-restored-copy-runtime-acceptance.cli.mjs
  current-release-restored-copy-runtime-acceptance.mjs
  founder-pilot-activation-role-deployment.cli.mjs
  founder-pilot-activation-role-deployment.mjs
  founder-pilot-activation-role-network-acceptance.cli.mjs
  founder-pilot-activation-role-network-acceptance.mjs
  founder-pilot-mail-tenant-enrollment.cli.mjs
  founder-pilot-mail-tenant-enrollment.mjs
  founder-pilot-production-history-production.cli.mjs
  founder-pilot-production-history-production.mjs
  founder-pilot-production-history-rehearsal.cli.mjs
  founder-pilot-production-history-rehearsal.mjs
  founder-pilot-restored-copy-preflight.cli.mjs
  founder-pilot-restored-copy-preflight.mjs
  identity-mail-worker-enrollment.cli.mjs
  identity-mail-worker-enrollment.mjs
  run-current-release-restored-copy-acceptance.sh
  runtime-function-enrollment.cli.mjs
  runtime-function-enrollment.mjs
  shared-beta-admission-provenance-catalog.mjs
  staff-attachment-backfill-dry-run.mjs
  staff-attachment-reconciliation.cli.mjs
  staff-attachment-reconciliation.mjs
  staff-task-integrity-migration-state.mjs
  telegram-update-ledger-runtime-acl-reconciliation.cli.mjs
  telegram-update-ledger-runtime-acl-reconciliation.mjs
)

cleanup() {
  rm -rf -- "$TEST_ROOT"
}
trap cleanup EXIT

assert_reviewed_authority_pin() {
  local label="$1"
  local source_path="$2"
  local variable_name="$3"
  local source_sha256 expected_declaration declaration_count
  source_sha256="$(sha256sum -- "$source_path" | awk '{ print $1 }')"
  expected_declaration="readonly ${variable_name}='${source_sha256}'"
  declaration_count="$(grep -F -c -x \
    "$expected_declaration" \
    "$HYDRATION_AUTHORITY" || true)"
  if [[ "$declaration_count" != '1' ]]; then
    printf '%s hydration authority pin is stale or non-unique\n' "$label" >&2
    exit 1
  fi
}

assert_reviewed_authority_pin \
  'release stager' "$STAGER" 'RELEASE_STAGER_AUTHORITY_SHA256'
assert_reviewed_authority_pin \
  'runtime extractor' "$EXTRACTOR" 'RUNTIME_EXTRACTOR_AUTHORITY_SHA256'
assert_reviewed_authority_pin \
  'runtime verifier' "$VERIFIER" 'RUNTIME_VERIFIER_AUTHORITY_SHA256'

expected_hydration_authority_sha256="$(sha256sum -- "$HYDRATION_AUTHORITY" | awk '{ print $1 }')"
expected_workflow_authority_declaration="          helper_sha256='${expected_hydration_authority_sha256}'"
workflow_authority_declaration_count="$(grep -F -c -x \
  "$expected_workflow_authority_declaration" \
  "$RELEASE_ADMISSION_WORKFLOW" || true)"
if [[ "$workflow_authority_declaration_count" != '1' ]]; then
  printf 'release admission hydration controller pin is stale or non-unique\n' >&2
  exit 1
fi

write_manifest() {
  local root="$1"
  (
    cd -- "$root"
    find . -type f ! -path './SHA256SUMS' -print0 \
      | LC_ALL=C sort -z \
      | xargs -0 sha256sum --text > SHA256SUMS
  )
}

canonical_root() {
  node -e 'process.stdout.write(require("node:fs").realpathSync.native(process.argv[1]))' "$1"
}

make_runtime_root() {
  local root="$1"
  local script_name
  mkdir -p \
    "$root/apps/api/dist" \
    "$root/apps/web/.next" \
    "$root/apps/web/public" \
    "$root/packages/database/prisma/migrations/$DATABASE_MIGRATION" \
    "$root/packages/database/scripts"
  printf 'api\n' > "$root/apps/api/dist/main.js"
  printf '{"name":"api","private":true}\n' > "$root/apps/api/package.json"
  printf '%s\n' "$RELEASE_SHA" > "$root/apps/web/.next/BUILD_ID"
  printf 'export default {};\n' > "$root/apps/web/next.config.ts"
  printf '{"name":"web","private":true}\n' > "$root/apps/web/package.json"
  printf 'public asset\n' > "$root/apps/web/public/asset.txt"
  printf '{"name":"leetplus","private":true,"packageManager":"pnpm@10.33.2"}\n' \
    > "$root/package.json"
  printf 'lockfileVersion: 9.0\n' > "$root/pnpm-lock.yaml"
  printf 'packages:\n  - "apps/*"\n  - "packages/*"\n' > "$root/pnpm-workspace.yaml"
  printf '{"name":"database","private":true,"scripts":{"db:deploy":"node scripts/canonical-prisma-deploy.mjs"}}\n' \
    > "$root/packages/database/package.json"
  printf 'generator client { provider = "prisma-client-js" }\n' \
    > "$root/packages/database/prisma/schema.prisma"
  printf 'provider = "postgresql"\n' \
    > "$root/packages/database/prisma/migrations/migration_lock.toml"
  printf 'SELECT 1;\n' \
    > "$root/packages/database/prisma/migrations/$DATABASE_MIGRATION/migration.sql"
  for script_name in "${OPERATIONAL_SCRIPTS[@]}"; do
    printf '// %s\n' "$script_name" > "$root/packages/database/scripts/$script_name"
  done
  cat > "$root/release-provenance.json" <<JSON
{
  "releaseSha": "${RELEASE_SHA}",
  "nodeVersion": "22",
  "pnpmVersion": "10.33.2",
  "databaseMigration": "${DATABASE_MIGRATION}",
  "databaseMigrationCount": 1,
  "runtimePackageManifestsIncluded": true,
  "canonicalPrismaDeployScriptsIncluded": true,
  "canonicalPrismaDeployScriptCount": 1,
  "founderPilotOperationalScriptsIncluded": true,
  "founderPilotOperationalScriptCount": 12,
  "runtimeEnrollmentOperationalScriptsIncluded": true,
  "runtimeEnrollmentOperationalScriptCount": 8,
  "currentReleaseRuntimeAcceptanceScriptsIncluded": true,
  "currentReleaseRuntimeAcceptanceScriptCount": 3,
  "currentNetworkAccessScopeClassificationScriptsIncluded": true,
  "currentNetworkAccessScopeClassificationScriptCount": 2,
  "staffAttachmentReconciliationScriptsIncluded": true,
  "staffAttachmentReconciliationScriptCount": 3,
  "operationalScriptCount": 29,
  "webPublicAssetsIncluded": true
}
JSON
  write_manifest "$root"
}

expect_rejected() {
  local label="$1"
  local root="$2"
  local expected_message="$3"
  local resolved_root
  resolved_root="$(canonical_root "$root")"
  if node "$VERIFIER" \
    --release-root "$resolved_root" \
    --expected-release-sha "$RELEASE_SHA" > "${TEST_ROOT}/${label}.out" 2>&1; then
    printf '%s runtime artifact was unexpectedly accepted\n' "$label" >&2
    exit 1
  fi
  grep -F -- "$expected_message" "${TEST_ROOT}/${label}.out" > /dev/null
}

accepted_root="${TEST_ROOT}/accepted"
make_runtime_root "$accepted_root"
accepted_root_canonical="$(canonical_root "$accepted_root")"
node "$VERIFIER" \
  --release-root "$accepted_root_canonical" \
  --expected-release-sha "$RELEASE_SHA" > "${TEST_ROOT}/accepted.out"
grep -F -x 'RUNTIME_RELEASE_ARTIFACT_INTEGRITY=PASS' "${TEST_ROOT}/accepted.out" > /dev/null
grep -F -x "RUNTIME_RELEASE_SHA=${RELEASE_SHA}" "${TEST_ROOT}/accepted.out" > /dev/null
grep -F -x 'RUNTIME_RELEASE_OPERATIONAL_SCRIPT_COUNT=29' "${TEST_ROOT}/accepted.out" > /dev/null

unexpected_script_root="${TEST_ROOT}/unexpected-script"
cp -a -- "$accepted_root" "$unexpected_script_root"
printf 'unexpected\n' > "$unexpected_script_root/packages/database/scripts/unexpected.mjs"
write_manifest "$unexpected_script_root"
expect_rejected \
  unexpected-script \
  "$unexpected_script_root" \
  'operational script identity set is not exact; unexpected=packages/database/scripts/unexpected.mjs'

missing_script_root="${TEST_ROOT}/missing-script"
cp -a -- "$accepted_root" "$missing_script_root"
rm -- "$missing_script_root/packages/database/scripts/staff-task-integrity-migration-state.mjs"
write_manifest "$missing_script_root"
expect_rejected \
  missing-script \
  "$missing_script_root" \
  'operational script identity set is not exact; missing=packages/database/scripts/staff-task-integrity-migration-state.mjs'

unlisted_root="${TEST_ROOT}/unlisted"
cp -a -- "$accepted_root" "$unlisted_root"
printf 'unlisted\n' > "$unlisted_root/unlisted.txt"
expect_rejected \
  unlisted \
  "$unlisted_root" \
  'root SHA256SUMS path set differs from the regular-file tree; unlisted=./unlisted.txt'

empty_directory_root="${TEST_ROOT}/empty-directory"
cp -a -- "$accepted_root" "$empty_directory_root"
mkdir -- "$empty_directory_root/unlisted-empty"
expect_rejected \
  empty-directory \
  "$empty_directory_root" \
  'runtime directory set differs from manifest-derived parent directories; unlisted=./unlisted-empty'

missing_core_root="${TEST_ROOT}/missing-core"
cp -a -- "$accepted_root" "$missing_core_root"
rm -- "$missing_core_root/apps/api/package.json"
write_manifest "$missing_core_root"
expect_rejected \
  missing-core \
  "$missing_core_root" \
  'required runtime path is missing: ./apps/api/package.json'

raw_deploy_root="${TEST_ROOT}/raw-deploy"
cp -a -- "$accepted_root" "$raw_deploy_root"
node -e \
  'const fs = require("node:fs"); const file = process.argv[1]; const value = JSON.parse(fs.readFileSync(file, "utf8")); value.scripts["db:deploy"] = "prisma migrate deploy"; fs.writeFileSync(file, `${JSON.stringify(value)}\n`);' \
  "$raw_deploy_root/packages/database/package.json"
write_manifest "$raw_deploy_root"
expect_rejected \
  raw-deploy \
  "$raw_deploy_root" \
  'database deploy command is not the exact canonical artifact boundary'

extra_provenance_root="${TEST_ROOT}/extra-provenance"
cp -a -- "$accepted_root" "$extra_provenance_root"
node -e \
  'const fs = require("node:fs"); const file = process.argv[1]; const value = JSON.parse(fs.readFileSync(file, "utf8")); value.unexpected = true; fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);' \
  "$extra_provenance_root/release-provenance.json"
write_manifest "$extra_provenance_root"
expect_rejected \
  extra-provenance \
  "$extra_provenance_root" \
  'release provenance key set is not exact; unexpected=unexpected'

wrong_provenance_root="${TEST_ROOT}/wrong-provenance"
cp -a -- "$accepted_root" "$wrong_provenance_root"
node -e \
  'const fs = require("node:fs"); const file = process.argv[1]; const value = JSON.parse(fs.readFileSync(file, "utf8")); value.nodeVersion = "21"; fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);' \
  "$wrong_provenance_root/release-provenance.json"
write_manifest "$wrong_provenance_root"
expect_rejected \
  wrong-provenance \
  "$wrong_provenance_root" \
  'release provenance field is not exact: nodeVersion'

node_modules_root="${TEST_ROOT}/node-modules"
cp -a -- "$accepted_root" "$node_modules_root"
mkdir -p -- "$node_modules_root/apps/api/node_modules/package"
printf 'forbidden\n' > "$node_modules_root/apps/api/node_modules/package/index.js"
write_manifest "$node_modules_root"
expect_rejected \
  node-modules \
  "$node_modules_root" \
  'forbidden runtime artifact path: ./apps/api/node_modules'

next_cache_root="${TEST_ROOT}/next-cache"
cp -a -- "$accepted_root" "$next_cache_root"
mkdir -p -- "$next_cache_root/apps/web/.next/cache"
printf 'forbidden\n' > "$next_cache_root/apps/web/.next/cache/cache.bin"
write_manifest "$next_cache_root"
expect_rejected \
  next-cache \
  "$next_cache_root" \
  'forbidden runtime artifact path: ./apps/web/.next/cache'

next_dev_root="${TEST_ROOT}/next-dev"
cp -a -- "$accepted_root" "$next_dev_root"
mkdir -p -- "$next_dev_root/apps/web/.next/dev"
printf 'forbidden\n' > "$next_dev_root/apps/web/.next/dev/dev.bin"
write_manifest "$next_dev_root"
expect_rejected \
  next-dev \
  "$next_dev_root" \
  'forbidden runtime artifact path: ./apps/web/.next/dev'

duplicate_root="${TEST_ROOT}/duplicate"
cp -a -- "$accepted_root" "$duplicate_root"
head -n 1 "$duplicate_root/SHA256SUMS" >> "$duplicate_root/SHA256SUMS"
expect_rejected \
  duplicate \
  "$duplicate_root" \
  'root SHA256SUMS contains a duplicate path'

unsorted_root="${TEST_ROOT}/unsorted"
cp -a -- "$accepted_root" "$unsorted_root"
awk 'NR == 1 { first = $0; next } NR == 2 { print; print first; next } { print }' \
  "$accepted_root/SHA256SUMS" > "$unsorted_root/SHA256SUMS"
expect_rejected \
  unsorted \
  "$unsorted_root" \
  'root SHA256SUMS paths are not in canonical byte order'

traversal_root="${TEST_ROOT}/traversal"
cp -a -- "$accepted_root" "$traversal_root"
printf '%064d  ../outside\n' 0 >> "$traversal_root/SHA256SUMS"
expect_rejected \
  traversal \
  "$traversal_root" \
  'root SHA256SUMS line is not canonical'

control_root="${TEST_ROOT}/control"
cp -a -- "$accepted_root" "$control_root"
printf '%064d  ./control\tname\n' 0 >> "$control_root/SHA256SUMS"
expect_rejected \
  control \
  "$control_root" \
  'manifest path is not canonical UTF-8'

corrupt_root="${TEST_ROOT}/corrupt"
cp -a -- "$accepted_root" "$corrupt_root"
printf 'corruption\n' >> "$corrupt_root/apps/api/dist/main.js"
expect_rejected \
  corrupt \
  "$corrupt_root" \
  'root SHA256SUMS digest mismatch: ./apps/api/dist/main.js'

symlink_target="${TEST_ROOT}/symlink-target"
symlink_alias="${TEST_ROOT}/symlink-alias"
mkdir -p "$symlink_target"
cp -a -- "$accepted_root" "$symlink_target/release"
if ln -s -- "$symlink_target" "$symlink_alias" 2>/dev/null \
  && test -L "$symlink_alias"; then
  if node "$VERIFIER" \
    --release-root "$symlink_alias/release" \
    --expected-release-sha "$RELEASE_SHA" > "${TEST_ROOT}/symlink-ancestor.out" 2>&1; then
    printf 'runtime artifact under a symlinked ancestor was unexpectedly accepted\n' >&2
    exit 1
  fi
  grep -F \
    'release root and every ancestor must be canonical and symlink-free' \
    "${TEST_ROOT}/symlink-ancestor.out" > /dev/null
fi

printf 'runtime release artifact integrity test: PASS\n'
