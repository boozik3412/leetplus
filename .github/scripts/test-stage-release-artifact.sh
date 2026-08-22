#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

readonly RELEASE_SHA='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
readonly REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly STAGER="${REPOSITORY_ROOT}/docs/deployment/production-artifact/stage-release-artifact.sh"
readonly TEST_ROOT="$(mktemp -d)"

cleanup() {
  local test_status=$?

  # Successful fixtures deliberately restore their release directories to
  # read-only modes. Make only this mktemp-owned tree removable before the
  # EXIT trap deletes it, while preserving any earlier test failure.
  chmod -R u+w -- "$TEST_ROOT" 2>/dev/null || true
  if ! rm -rf -- "$TEST_ROOT"; then
    printf 'stage-release-artifact test: failed to remove test root: %s\n' "$TEST_ROOT" >&2
    if (( test_status == 0 )); then
      test_status=1
    fi
  fi

  return "$test_status"
}
trap cleanup EXIT

pack_artifact() {
  local fixture_root="$1"
  local inbox="$2"
  local archive="$3"

  mkdir -p "$inbox"
  rm -f -- "$archive" "${archive}.sha256"
  (
    cd -- "$fixture_root"
    tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner -czf "$archive" .
  )
  (
    cd -- "$inbox"
    sha256sum --text "$(basename -- "$archive")" > "$(basename -- "$archive").sha256"
  )
}

make_artifact() {
  local fixture_root="$1"
  local inbox="$2"
  local archive="$3"

  mkdir -p \
    "$fixture_root/apps/api/dist" \
    "$fixture_root/apps/web/.next" \
    "$fixture_root/apps/web/public" \
    "$fixture_root/nested-receipts" \
    "$fixture_root/packages/database/prisma" \
    "$inbox"
  printf 'api' > "$fixture_root/apps/api/dist/main.js"
  printf '{}' > "$fixture_root/apps/api/package.json"
  printf 'build-id' > "$fixture_root/apps/web/.next/BUILD_ID"
  printf '{}' > "$fixture_root/apps/web/package.json"
  cat > "$fixture_root/packages/database/package.json" <<'JSON'
{"name":"database","scripts":{"preinstall":"node -e \"require('node:fs').writeFileSync(process.env.LIFECYCLE_MARKER,'executed')\""}}
JSON
  printf 'generator client { provider = "prisma-client-js" }\n' > "$fixture_root/packages/database/prisma/schema.prisma"
  printf 'lockfileVersion: "9.0"\n' > "$fixture_root/pnpm-lock.yaml"
  printf 'packages:\n  - apps/*\n' > "$fixture_root/pnpm-workspace.yaml"
  printf 'nested source byte\n' > "$fixture_root/nested-receipts/HYDRATED_SHA256SUMS"
  printf '{"releaseSha":"%s","nodeVersion":"22","pnpmVersion":"10.33.2","databaseMigration":"20260820010000_fixture","databaseMigrationCount":1}\n' "$RELEASE_SHA" > "$fixture_root/release-provenance.json"
  (
    cd -- "$fixture_root"
    find . -type f ! -name SHA256SUMS -print0 \
      | LC_ALL=C sort -z \
      | xargs -0 sha256sum --text > SHA256SUMS
  )
  pack_artifact "$fixture_root" "$inbox" "$archive"
}

expect_manifest_rejected() {
  local label="$1"
  local fixture_root="$2"
  local inbox="${TEST_ROOT}/${label}-inbox"
  local archive="${inbox}/leetplus-release-${RELEASE_SHA}.tar.gz"
  local output_root="${TEST_ROOT}/${label}-staged"
  mkdir -p "$output_root"
  pack_artifact "$fixture_root" "$inbox" "$archive"
  if bash "$STAGER" \
    --release-sha "$RELEASE_SHA" \
    --artifact "$archive" \
    --artifact-sha256 "${archive}.sha256" \
    --output-root "$output_root" \
    --unprivileged-test-mode > "${TEST_ROOT}/${label}-rejected.out" 2>&1; then
    printf '%s manifest attack was unexpectedly accepted\n' "$label" >&2
    exit 1
  fi
  test ! -e "${output_root}/${RELEASE_SHA}"
  test ! -e "${output_root}/.untrusted-test-${RELEASE_SHA}"
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
  --output-root "$stage_root" \
  --unprivileged-test-mode > "${TEST_ROOT}/accepted.out"

test_stage_directory="${stage_root}/.untrusted-test-${RELEASE_SHA}"
test -f "${test_stage_directory}/apps/api/dist/main.js"
test -f "${test_stage_directory}/SHA256SUMS"
test -f "${test_stage_directory}/UNTRUSTED_TEST_STAGE"
test ! -e "${stage_root}/${RELEASE_SHA}"
test ! -e "${test_stage_directory}/node_modules"
grep -F -x "STAGED_RELEASE_SHA=${RELEASE_SHA}" "${TEST_ROOT}/accepted.out" > /dev/null
grep -F -x 'STAGED_RELEASE_TRUST=UNTRUSTED_TEST_ONLY' "${TEST_ROOT}/accepted.out" > /dev/null

production_mode_root="${TEST_ROOT}/production-mode-staged"
mkdir -p "$production_mode_root"
if bash "$STAGER" \
  --release-sha "$RELEASE_SHA" \
  --artifact "$archive" \
  --artifact-sha256 "${archive}.sha256" \
  --output-root "$production_mode_root" > "${TEST_ROOT}/non-privileged-bash-rejected.out" 2>&1; then
  printf 'production mode under non-privileged Bash was unexpectedly accepted\n' >&2
  exit 1
fi
grep -F -x \
  'stage-release-artifact: production staging must execute the installed script directly with /usr/bin/bash -p' \
  "${TEST_ROOT}/non-privileged-bash-rejected.out" > /dev/null

if bash -p "$STAGER" \
  --release-sha "$RELEASE_SHA" \
  --artifact "$archive" \
  --artifact-sha256 "${archive}.sha256" \
  --output-root "$production_mode_root" > "${TEST_ROOT}/mutable-stager-rejected.out" 2>&1; then
  printf 'mutable repository stager was unexpectedly accepted as production authority\n' >&2
  exit 1
fi
grep -F -x \
  'stage-release-artifact: production staging authority is not the exact root-owned installed stager' \
  "${TEST_ROOT}/mutable-stager-rejected.out" > /dev/null

unlisted_fixture_root="${TEST_ROOT}/unlisted-fixture"
cp -a -- "$fixture_root" "$unlisted_fixture_root"
printf 'not covered by the root manifest\n' > "$unlisted_fixture_root/unlisted.txt"
expect_manifest_rejected unlisted "$unlisted_fixture_root"

duplicate_fixture_root="${TEST_ROOT}/duplicate-fixture"
cp -a -- "$fixture_root" "$duplicate_fixture_root"
head -n 1 "$duplicate_fixture_root/SHA256SUMS" >> "$duplicate_fixture_root/SHA256SUMS"
expect_manifest_rejected duplicate "$duplicate_fixture_root"

unsorted_fixture_root="${TEST_ROOT}/unsorted-fixture"
cp -a -- "$fixture_root" "$unsorted_fixture_root"
awk 'NR == 1 { first = $0; next } NR == 2 { print; print first; next } { print }' \
  "$fixture_root/SHA256SUMS" > "$unsorted_fixture_root/SHA256SUMS"
expect_manifest_rejected unsorted "$unsorted_fixture_root"

traversal_fixture_root="${TEST_ROOT}/traversal-fixture"
cp -a -- "$fixture_root" "$traversal_fixture_root"
printf '%064d  ../outside\n' 0 >> "$traversal_fixture_root/SHA256SUMS"
expect_manifest_rejected traversal "$traversal_fixture_root"

control_fixture_root="${TEST_ROOT}/control-fixture"
cp -a -- "$fixture_root" "$control_fixture_root"
printf '%064d  ./control\tname\n' 0 >> "$control_fixture_root/SHA256SUMS"
expect_manifest_rejected control "$control_fixture_root"

control_archive_fixture_root="${TEST_ROOT}/control-archive-fixture"
cp -a -- "$fixture_root" "$control_archive_fixture_root"
printf 'unsafe archive member\n' > "${control_archive_fixture_root}/archive-control"$'\t'"member"
(
  cd -- "$control_archive_fixture_root"
  find . -type f ! -path './SHA256SUMS' -print0 \
    | LC_ALL=C sort -z \
    | xargs -0 sha256sum --text > SHA256SUMS
)
expect_manifest_rejected control-archive "$control_archive_fixture_root"
grep -F -x \
  'stage-release-artifact: archive contains an escaped control or backslash path' \
  "${TEST_ROOT}/control-archive-rejected.out" >/dev/null

duplicate_archive_inbox="${TEST_ROOT}/duplicate-archive-inbox"
duplicate_archive="${duplicate_archive_inbox}/leetplus-release-${RELEASE_SHA}.tar.gz"
duplicate_archive_output="${TEST_ROOT}/duplicate-archive-staged"
mkdir -p "$duplicate_archive_inbox" "$duplicate_archive_output"
(
  cd -- "$fixture_root"
  tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner \
    -czf "$duplicate_archive" . ./apps/api/dist/main.js
)
(
  cd -- "$duplicate_archive_inbox"
  sha256sum --text "$(basename -- "$duplicate_archive")" \
    > "$(basename -- "$duplicate_archive").sha256"
)
if bash "$STAGER" \
  --release-sha "$RELEASE_SHA" \
  --artifact "$duplicate_archive" \
  --artifact-sha256 "${duplicate_archive}.sha256" \
  --output-root "$duplicate_archive_output" \
  --unprivileged-test-mode > "${TEST_ROOT}/duplicate-archive-rejected.out" 2>&1; then
  printf 'archive with a duplicate regular member was unexpectedly accepted\n' >&2
  exit 1
fi
grep -F -x \
  'stage-release-artifact: archive paths are non-canonical or duplicated' \
  "${TEST_ROOT}/duplicate-archive-rejected.out" >/dev/null

failing_pnpm_root="${TEST_ROOT}/failing-pnpm-bin"
mkdir -p "$failing_pnpm_root"
printf '%s\n' '#!/usr/bin/env bash' 'exit 73' > "${failing_pnpm_root}/pnpm"
cat > "${failing_pnpm_root}/id" <<'ID'
#!/usr/bin/env bash
if [[ "${1:-}" == '-un' ]]; then
  printf 'leetplus-build\n'
else
  /usr/bin/id "$@"
fi
ID
chmod 0700 "${failing_pnpm_root}/pnpm" "${failing_pnpm_root}/id"
hydration_stage_root="${TEST_ROOT}/hydration-staged"
mkdir -p "$hydration_stage_root"
if env -u DATABASE_URL -u JWT_SECRET -u GUEST_PORTAL_JWT_SECRET \
  -u APP_ENCRYPTION_KEY -u INTEGRATION_ENCRYPTION_KEY -u SYNC_SERVICE_TOKEN -u LANGAME_API_KEY \
  -u NODE_OPTIONS -u NODE_PATH -u NODE_EXTRA_CA_CERTS -u NODE_USE_ENV_PROXY \
  -u NODE_V8_COVERAGE -u NODE_COMPILE_CACHE \
  -u LD_PRELOAD -u LD_LIBRARY_PATH -u LD_AUDIT -u GCONV_PATH -u LOCPATH \
  -u OPENSSL_CONF -u OPENSSL_MODULES \
  -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u NO_PROXY \
  -u http_proxy -u https_proxy -u all_proxy -u no_proxy \
  -u BASH_ENV -u ENV \
  -u NPM_CONFIG_USERCONFIG -u npm_config_userconfig \
  -u NPM_CONFIG_GLOBALCONFIG -u npm_config_globalconfig \
  -u NPM_CONFIG_NODE_OPTIONS -u npm_config_node_options \
  -u NPM_CONFIG_SCRIPT_SHELL -u npm_config_script_shell \
  -u PNPM_HOME -u COREPACK_HOME -u SSL_CERT_FILE -u SSL_CERT_DIR \
  -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_SYSTEM \
  -u INVOCATION_ID \
  PATH="${failing_pnpm_root}:${PATH}" bash "$STAGER" \
  --release-sha "$RELEASE_SHA" \
  --artifact "$archive" \
  --artifact-sha256 "${archive}.sha256" \
  --output-root "$hydration_stage_root" \
  --hydrate --unprivileged-test-mode > "${TEST_ROOT}/hydration-rejected.out" 2>&1; then
  printf 'failed offline hydration was unexpectedly accepted\n' >&2
  exit 1
fi
test ! -e "${hydration_stage_root}/${RELEASE_SHA}"
test -d "$(find "$hydration_stage_root" -mindepth 1 -maxdepth 1 -type d -name ".${RELEASE_SHA}.untrusted-test-staging.*" -print -quit)"

successful_pnpm_root="${TEST_ROOT}/successful-pnpm-bin"
mkdir -p "$successful_pnpm_root"
cat > "${successful_pnpm_root}/pnpm" <<'PNPM'
#!/usr/bin/env bash
if [[ "$#" == '1' && "$1" == '--version' ]]; then
  printf '10.33.2\n'
  exit 0
fi
printf '%s\n' "$*" >> "${PNPM_FIXTURE_LOG:-/dev/null}"
if [[ "${1:-}" == 'install' ]]; then
  [[ "$*" == 'install --prod --offline --frozen-lockfile --ignore-scripts --side-effects-cache-readonly --package-import-method=copy --store-dir /srv/leetplus/pnpm-store' ]]
  for module_root in \
    node_modules apps/api/node_modules apps/web/node_modules packages/database/node_modules; do
    [[ -d "$module_root" && ! -L "$module_root" && -w "$module_root" ]]
  done
  [[ " $* " == *' --ignore-scripts '* ]] \
    || printf 'executed\n' > "${LIFECYCLE_MARKER:?}"
  exit 0
fi
[[ "$*" == '--filter database db:generate' ]]
PNPM
chmod 0700 "${successful_pnpm_root}/pnpm"

successful_hydration_root="${TEST_ROOT}/successful-hydration-staged"
successful_pnpm_log="${TEST_ROOT}/successful-pnpm.log"
lifecycle_marker="${TEST_ROOT}/dependency-lifecycle-executed"
readonly_fixture_root="${TEST_ROOT}/readonly-hydration-fixture"
readonly_inbox="${TEST_ROOT}/readonly-hydration-inbox"
readonly_archive="${readonly_inbox}/leetplus-release-${RELEASE_SHA}.tar.gz"
cp -a -- "$fixture_root" "$readonly_fixture_root"
for readonly_parent in \
  "$readonly_fixture_root" \
  "$readonly_fixture_root/apps/api" \
  "$readonly_fixture_root/apps/web" \
  "$readonly_fixture_root/packages/database"; do
  chmod 0550 -- "$readonly_parent"
done
pack_artifact "$readonly_fixture_root" "$readonly_inbox" "$readonly_archive"
mkdir -p "$successful_hydration_root"
env -u DATABASE_URL -u JWT_SECRET -u GUEST_PORTAL_JWT_SECRET \
  -u APP_ENCRYPTION_KEY -u INTEGRATION_ENCRYPTION_KEY -u SYNC_SERVICE_TOKEN -u LANGAME_API_KEY \
  -u NODE_OPTIONS -u NODE_PATH -u NODE_EXTRA_CA_CERTS -u NODE_USE_ENV_PROXY \
  -u NODE_V8_COVERAGE -u NODE_COMPILE_CACHE \
  -u LD_PRELOAD -u LD_LIBRARY_PATH -u LD_AUDIT -u GCONV_PATH -u LOCPATH \
  -u OPENSSL_CONF -u OPENSSL_MODULES \
  -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u NO_PROXY \
  -u http_proxy -u https_proxy -u all_proxy -u no_proxy \
  -u BASH_ENV -u ENV \
  -u NPM_CONFIG_USERCONFIG -u npm_config_userconfig \
  -u NPM_CONFIG_GLOBALCONFIG -u npm_config_globalconfig \
  -u NPM_CONFIG_NODE_OPTIONS -u npm_config_node_options \
  -u NPM_CONFIG_SCRIPT_SHELL -u npm_config_script_shell \
  -u PNPM_HOME -u COREPACK_HOME -u SSL_CERT_FILE -u SSL_CERT_DIR \
  -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_SYSTEM \
  -u INVOCATION_ID \
  PNPM_FIXTURE_LOG="$successful_pnpm_log" \
  LIFECYCLE_MARKER="$lifecycle_marker" \
  PATH="${successful_pnpm_root}:${PATH}" bash "$STAGER" \
  --release-sha "$RELEASE_SHA" \
  --artifact "$readonly_archive" \
  --artifact-sha256 "${readonly_archive}.sha256" \
  --output-root "$successful_hydration_root" \
  --hydrate --unprivileged-test-mode > "${TEST_ROOT}/successful-hydration.out"
successful_hydration_release="${successful_hydration_root}/.untrusted-test-${RELEASE_SHA}"
grep -F -x \
  'install --prod --offline --frozen-lockfile --ignore-scripts --side-effects-cache-readonly --package-import-method=copy --store-dir /srv/leetplus/pnpm-store' \
  "$successful_pnpm_log" >/dev/null
grep -F -x -- '--filter database db:generate' "$successful_pnpm_log" >/dev/null
[[ "$(awk 'END { print NR }' "$successful_pnpm_log")" == '2' ]]
test ! -e "$lifecycle_marker"
case "${OSTYPE:-}" in
  msys*|cygwin*) ;;
  *)
    for restored_parent in \
      "$successful_hydration_release" \
      "$successful_hydration_release/apps/api" \
      "$successful_hydration_release/apps/web" \
      "$successful_hydration_release/packages/database"; do
      restored_mode="$(stat -c '%a' -- "$restored_parent")"
      [[ "$((8#$restored_mode & 8#200))" == '0' ]]
    done
    ;;
esac
grep -E \
  '^[0-9a-f]{64}  \./nested-receipts/HYDRATED_SHA256SUMS$' \
  "$successful_hydration_release/HYDRATED_SHA256SUMS" >/dev/null
(
  cd -- "$successful_hydration_release"
  sha256sum --strict --check --quiet HYDRATED_SHA256SUMS
)

lifecycle_regressed_stager="${TEST_ROOT}/lifecycle-regressed-stage-release-artifact.sh"
cp -- "$STAGER" "$lifecycle_regressed_stager"
sed -i 's/ --ignore-scripts \\/ \\/' "$lifecycle_regressed_stager"
grep -F 'pnpm install --prod --offline --frozen-lockfile \' \
  "$lifecycle_regressed_stager" >/dev/null
if grep -F -- '--ignore-scripts' "$lifecycle_regressed_stager" >/dev/null; then
  printf 'lifecycle regression fixture did not remove --ignore-scripts\n' >&2
  exit 1
fi
lifecycle_regressed_root="${TEST_ROOT}/lifecycle-regressed-hydration-staged"
lifecycle_regressed_marker="${TEST_ROOT}/dependency-lifecycle-regression-executed"
mkdir -p "$lifecycle_regressed_root"
env -u DATABASE_URL -u JWT_SECRET -u GUEST_PORTAL_JWT_SECRET \
  -u APP_ENCRYPTION_KEY -u INTEGRATION_ENCRYPTION_KEY -u SYNC_SERVICE_TOKEN -u LANGAME_API_KEY \
  -u NODE_OPTIONS -u NODE_PATH -u NODE_EXTRA_CA_CERTS -u NODE_USE_ENV_PROXY \
  -u NODE_V8_COVERAGE -u NODE_COMPILE_CACHE \
  -u LD_PRELOAD -u LD_LIBRARY_PATH -u LD_AUDIT -u GCONV_PATH -u LOCPATH \
  -u OPENSSL_CONF -u OPENSSL_MODULES \
  -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u NO_PROXY \
  -u http_proxy -u https_proxy -u all_proxy -u no_proxy \
  -u BASH_ENV -u ENV \
  -u NPM_CONFIG_USERCONFIG -u npm_config_userconfig \
  -u NPM_CONFIG_GLOBALCONFIG -u npm_config_globalconfig \
  -u NPM_CONFIG_NODE_OPTIONS -u npm_config_node_options \
  -u NPM_CONFIG_SCRIPT_SHELL -u npm_config_script_shell \
  -u PNPM_HOME -u COREPACK_HOME -u SSL_CERT_FILE -u SSL_CERT_DIR \
  -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_SYSTEM \
  -u INVOCATION_ID \
  PNPM_FIXTURE_LOG=/dev/null \
  LIFECYCLE_MARKER="$lifecycle_regressed_marker" \
  PATH="${successful_pnpm_root}:${PATH}" bash "$lifecycle_regressed_stager" \
  --release-sha "$RELEASE_SHA" \
  --artifact "$archive" \
  --artifact-sha256 "${archive}.sha256" \
  --output-root "$lifecycle_regressed_root" \
  --hydrate --unprivileged-test-mode > "${TEST_ROOT}/lifecycle-regressed.out"
grep -F -x 'executed' "$lifecycle_regressed_marker" >/dev/null

hostile_pnpm_root="${TEST_ROOT}/hostile-pnpm-bin"
mkdir -p "$hostile_pnpm_root"
cat > "${hostile_pnpm_root}/pnpm" <<'PNPM'
#!/usr/bin/env bash
if [[ "$#" == '1' && "$1" == '--version' ]]; then
  printf '10.33.2\n'
  exit 0
fi
if [[ "${1:-}" == 'install' ]]; then
  [[ "$*" == 'install --prod --offline --frozen-lockfile --ignore-scripts --side-effects-cache-readonly --package-import-method=copy --store-dir /srv/leetplus/pnpm-store' ]]
  exit 0
fi
[[ "$*" == '--filter database db:generate' ]]
case "${HYDRATION_ATTACK:?}" in
  manifest) printf '# hostile generator rewrite\n' >> SHA256SUMS ;;
  sibling) mkdir -- ../hostile-generator-sibling ;;
  *) exit 91 ;;
esac
PNPM
chmod 0700 "${hostile_pnpm_root}/pnpm"

expect_hostile_generator_rejected() {
  local label="$1"
  local attack="$2"
  local expected_message="$3"
  local hostile_root="${TEST_ROOT}/${label}-hydration-staged"
  mkdir -p "$hostile_root"
  if env -u DATABASE_URL -u JWT_SECRET -u GUEST_PORTAL_JWT_SECRET \
    -u APP_ENCRYPTION_KEY -u INTEGRATION_ENCRYPTION_KEY -u SYNC_SERVICE_TOKEN -u LANGAME_API_KEY \
    -u NODE_OPTIONS -u NODE_PATH -u NODE_EXTRA_CA_CERTS -u NODE_USE_ENV_PROXY \
    -u NODE_V8_COVERAGE -u NODE_COMPILE_CACHE \
    -u LD_PRELOAD -u LD_LIBRARY_PATH -u LD_AUDIT -u GCONV_PATH -u LOCPATH \
    -u OPENSSL_CONF -u OPENSSL_MODULES \
    -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u NO_PROXY \
    -u http_proxy -u https_proxy -u all_proxy -u no_proxy \
    -u BASH_ENV -u ENV \
    -u NPM_CONFIG_USERCONFIG -u npm_config_userconfig \
    -u NPM_CONFIG_GLOBALCONFIG -u npm_config_globalconfig \
    -u NPM_CONFIG_NODE_OPTIONS -u npm_config_node_options \
    -u NPM_CONFIG_SCRIPT_SHELL -u npm_config_script_shell \
    -u PNPM_HOME -u COREPACK_HOME -u SSL_CERT_FILE -u SSL_CERT_DIR \
    -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_SYSTEM \
    -u INVOCATION_ID \
    HYDRATION_ATTACK="$attack" \
    PATH="${hostile_pnpm_root}:${PATH}" bash "$STAGER" \
    --release-sha "$RELEASE_SHA" \
    --artifact "$archive" \
    --artifact-sha256 "${archive}.sha256" \
    --output-root "$hostile_root" \
    --hydrate --unprivileged-test-mode > "${TEST_ROOT}/${label}-rejected.out" 2>&1; then
    printf '%s hostile generator was unexpectedly accepted\n' "$label" >&2
    exit 1
  fi
  grep -F -- "$expected_message" "${TEST_ROOT}/${label}-rejected.out" >/dev/null
  test ! -e "${hostile_root}/.untrusted-test-${RELEASE_SHA}"
}

expect_hostile_generator_rejected \
  manifest-rewrite manifest \
  'artifact-controlled hydration mutated trusted source SHA256SUMS identity or digest'
expect_hostile_generator_rejected \
  sibling-create sibling \
  'hydration build root contains a sibling or missing authority entry'
test -d "${TEST_ROOT}/sibling-create-hydration-staged/hostile-generator-sibling"

regressed_stager="${TEST_ROOT}/regressed-stage-release-artifact.sh"
cp -- "$STAGER" "$regressed_stager"
sed -i \
  "s/! -path '\.\/HYDRATED_SHA256SUMS'/! -name HYDRATED_SHA256SUMS/" \
  "$regressed_stager"
grep -F -- '-type f ! -name HYDRATED_SHA256SUMS -print0' "$regressed_stager" >/dev/null
regressed_hydration_root="${TEST_ROOT}/regressed-hydration-staged"
mkdir -p "$regressed_hydration_root"
if env -u DATABASE_URL -u JWT_SECRET -u GUEST_PORTAL_JWT_SECRET \
  -u APP_ENCRYPTION_KEY -u INTEGRATION_ENCRYPTION_KEY -u SYNC_SERVICE_TOKEN -u LANGAME_API_KEY \
  -u NODE_OPTIONS -u NODE_PATH -u NODE_EXTRA_CA_CERTS -u NODE_USE_ENV_PROXY \
  -u NODE_V8_COVERAGE -u NODE_COMPILE_CACHE \
  -u LD_PRELOAD -u LD_LIBRARY_PATH -u LD_AUDIT -u GCONV_PATH -u LOCPATH \
  -u OPENSSL_CONF -u OPENSSL_MODULES \
  -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u NO_PROXY \
  -u http_proxy -u https_proxy -u all_proxy -u no_proxy \
  -u BASH_ENV -u ENV \
  -u NPM_CONFIG_USERCONFIG -u npm_config_userconfig \
  -u NPM_CONFIG_GLOBALCONFIG -u npm_config_globalconfig \
  -u NPM_CONFIG_NODE_OPTIONS -u npm_config_node_options \
  -u NPM_CONFIG_SCRIPT_SHELL -u npm_config_script_shell \
  -u PNPM_HOME -u COREPACK_HOME -u SSL_CERT_FILE -u SSL_CERT_DIR \
  -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_SYSTEM \
  -u INVOCATION_ID \
  PATH="${successful_pnpm_root}:${PATH}" bash "$regressed_stager" \
  --release-sha "$RELEASE_SHA" \
  --artifact "$archive" \
  --artifact-sha256 "${archive}.sha256" \
  --output-root "$regressed_hydration_root" \
  --hydrate --unprivileged-test-mode > "${TEST_ROOT}/regressed-hydration-rejected.out" 2>&1; then
  printf 'hydrated manifest basename-wide exclusion regression was unexpectedly accepted\n' >&2
  exit 1
fi
grep -F \
  'hydrated manifest exact-tree validation failed: manifest does not cover the exact regular-file tree; omitted=./nested-receipts/HYDRATED_SHA256SUMS' \
  "${TEST_ROOT}/regressed-hydration-rejected.out" >/dev/null
test ! -e "${regressed_hydration_root}/.untrusted-test-${RELEASE_SHA}"

injected_stage_root="${TEST_ROOT}/injected-staged"
mkdir -p "$injected_stage_root"
if env -u DATABASE_URL -u JWT_SECRET -u GUEST_PORTAL_JWT_SECRET \
  -u APP_ENCRYPTION_KEY -u INTEGRATION_ENCRYPTION_KEY -u SYNC_SERVICE_TOKEN -u LANGAME_API_KEY \
  -u NODE_PATH -u NODE_EXTRA_CA_CERTS -u NODE_USE_ENV_PROXY \
  -u NODE_V8_COVERAGE -u NODE_COMPILE_CACHE \
  -u LD_PRELOAD -u LD_LIBRARY_PATH -u LD_AUDIT -u GCONV_PATH -u LOCPATH \
  -u OPENSSL_CONF -u OPENSSL_MODULES \
  -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u NO_PROXY \
  -u http_proxy -u https_proxy -u all_proxy -u no_proxy \
  -u BASH_ENV -u ENV \
  -u NPM_CONFIG_USERCONFIG -u npm_config_userconfig \
  -u NPM_CONFIG_GLOBALCONFIG -u npm_config_globalconfig \
  -u NPM_CONFIG_NODE_OPTIONS -u npm_config_node_options \
  -u NPM_CONFIG_SCRIPT_SHELL -u npm_config_script_shell \
  -u PNPM_HOME -u COREPACK_HOME -u SSL_CERT_FILE -u SSL_CERT_DIR \
  -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_SYSTEM \
  -u INVOCATION_ID \
  NODE_OPTIONS='--require=/tmp/adversarial-hydration-hook.cjs' \
  PATH="${failing_pnpm_root}:${PATH}" bash "$STAGER" \
  --release-sha "$RELEASE_SHA" \
  --artifact "$archive" \
  --artifact-sha256 "${archive}.sha256" \
  --output-root "$injected_stage_root" \
  --hydrate --unprivileged-test-mode > "${TEST_ROOT}/environment-injection-rejected.out" 2>&1; then
  printf 'hydration with NODE_OPTIONS injection was unexpectedly accepted\n' >&2
  exit 1
fi
grep -F -x \
  'stage-release-artifact: test hydration inherited a forbidden environment variable: NODE_OPTIONS' \
  "${TEST_ROOT}/environment-injection-rejected.out" >/dev/null
test ! -e "${injected_stage_root}/${RELEASE_SHA}"

find_failed_stager="${TEST_ROOT}/find-failed-stage-release-artifact.sh"
cp -- "$STAGER" "$find_failed_stager"
sed -i \
  's/^  find "\$@" -print0 -quit > "\$probe_path"$/  false > "\$probe_path"/' \
  "$find_failed_stager"
grep -F -x '  false > "$probe_path"' "$find_failed_stager" >/dev/null
find_failed_stage_root="${TEST_ROOT}/find-failed-staged"
mkdir -p "$find_failed_stage_root"
if bash "$find_failed_stager" \
  --release-sha "$RELEASE_SHA" \
  --artifact "$archive" \
  --artifact-sha256 "${archive}.sha256" \
  --output-root "$find_failed_stage_root" \
  --unprivileged-test-mode > "${TEST_ROOT}/find-failed-rejected.out" 2>&1; then
  printf 'failed filesystem inventory producer was unexpectedly accepted\n' >&2
  exit 1
fi
grep -F -x \
  'stage-release-artifact: required filesystem inventory producer failed' \
  "${TEST_ROOT}/find-failed-rejected.out" >/dev/null
test ! -e "${find_failed_stage_root}/.untrusted-test-${RELEASE_SHA}"

printf 'corruption' >> "$archive"
negative_stage_root="${TEST_ROOT}/negative-staged"
mkdir -p "$negative_stage_root"
if bash "$STAGER" \
  --release-sha "$RELEASE_SHA" \
  --artifact "$archive" \
  --artifact-sha256 "${archive}.sha256" \
  --output-root "$negative_stage_root" \
  --unprivileged-test-mode > "${TEST_ROOT}/rejected.out" 2>&1; then
  printf 'corrupted artifact was unexpectedly accepted\n' >&2
  exit 1
fi
test ! -e "${negative_stage_root}/${RELEASE_SHA}"

printf 'stage-release-artifact test: PASS\n'
