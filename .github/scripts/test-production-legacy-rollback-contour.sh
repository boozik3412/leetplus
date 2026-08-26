#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'
umask 0022

readonly LEGACY_SHA='7de04ff4ccc814494810730be3fa6bf661097b07'
readonly REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly DEPLOY_ROOT="${REPOSITORY_ROOT}/docs/deployment/production-artifact"
readonly SYSTEMD_ROOT="${DEPLOY_ROOT}/systemd"
readonly TEST_ROOT="$(mktemp -d)"

report_failure() {
  local status=$?
  printf 'legacy rollback fixture: line=%s status=%s command=%q\n' \
    "${BASH_LINENO[0]}" "$status" "$BASH_COMMAND" >&2
  exit "$status"
}

cleanup() {
  if [[ -n "${auth_server_pid:-}" ]]; then
    kill "$auth_server_pid" 2>/dev/null || true
    wait "$auth_server_pid" 2>/dev/null || true
  fi
  rm -rf -- "$TEST_ROOT"
}
trap report_failure ERR
trap cleanup EXIT

if [[ "$(id -u)" == 0 ]]; then
  printf 'legacy rollback fixture requires an unprivileged CI account\n' >&2
  exit 1
fi

preflight="${DEPLOY_ROOT}/preflight-legacy-rollback.sh"
drain_verifier="${DEPLOY_ROOT}/verify-legacy-runtime-drain.sh"
rollback_probe="${DEPLOY_ROOT}/verify-legacy-rollback-readiness.sh"
authenticated_smoke="${DEPLOY_ROOT}/verify-legacy-rollback-authenticated-reads.mjs"
auth_edge="${DEPLOY_ROOT}/legacy-rollback-auth-edge.mjs"
child_preload="${DEPLOY_ROOT}/legacy-rollback-child-loopback.cjs"
egress_script="${DEPLOY_ROOT}/apply-legacy-rollback-egress.sh"
database_fence="${DEPLOY_ROOT}/apply-legacy-database-login-fence.sh"
database_authority_sql="${SYSTEMD_ROOT}/legacy-database-login-fence-authority.sql.example"
activator="${DEPLOY_ROOT}/activate-legacy-rollback-contour.sh"
installer="${DEPLOY_ROOT}/install-legacy-rollback-contour.sh"
safe_overlay="${SYSTEMD_ROOT}/legacy-rollback-safe.env.example"
canary_overlay="${SYSTEMD_ROOT}/canary-safe.env.example"
release_environment="${SYSTEMD_ROOT}/legacy-rollback-7de04ff4.env.example"
unit_manifest_example="${SYSTEMD_ROOT}/legacy-drain-units.conf.example"
api_unit="${SYSTEMD_ROOT}/leetplus-api-rollback@.service"
web_unit="${SYSTEMD_ROOT}/leetplus-web-rollback@.service"
egress_unit="${SYSTEMD_ROOT}/leetplus-rollback-egress.service"
legacy_safe_nginx="${DEPLOY_ROOT}/nginx/legacy-safe.conf.example"
cutover="${DEPLOY_ROOT}/blue-green-cutover.sh"

for required_file in \
  "$preflight" "$drain_verifier" "$rollback_probe" "$authenticated_smoke" "$auth_edge" "$child_preload" "$egress_script" "$database_fence" "$database_authority_sql" "$activator" "$installer" \
  "$safe_overlay" "$canary_overlay" "$release_environment" "$unit_manifest_example" \
  "$api_unit" "$web_unit" "$egress_unit" "$legacy_safe_nginx" "$cutover"; do
  test -f "$required_file"
done

while IFS= read -r canary_assignment; do
  grep -F -x "$canary_assignment" "$safe_overlay" >/dev/null \
    || { printf 'rollback overlay lost canary deny: %s\n' "$canary_assignment" >&2; exit 1; }
done < <(grep -E '^[A-Z0-9_]+=' "$canary_overlay")

for required_value in \
  'GUEST_GAME_PIPELINE_SCHEDULER_ENABLED=false' \
  'GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED=false' \
  'GUEST_GAME_RETENTION_SCHEDULER_ENABLED=false' \
  'LANGAME_DAILY_SYNC_SCHEDULER_ENABLED=false' \
  'REPORT_DIGEST_SCHEDULER_ENABLED=false' \
  'STAFF_TASK_RULES_SCHEDULER_ENABLED=false' \
  'GUEST_GAME_DELIVERY_REAL_SEND_ENABLED=false' \
  'IDENTITY_MAIL_WORKER_REAL_SEND_ENABLED=false' \
  'TENANT_ACTIVATION_OUTBOUND_ENABLED=false' \
  'MAIL_HOST=127.0.0.1' \
  'MAIL_PORT=1' \
  'GUEST_PORTAL_OTP_SMS_ENDPOINT=http://127.0.0.1:1'; do
  grep -F -x "$required_value" "$safe_overlay" >/dev/null
done

for unit in "$api_unit" "$web_unit"; do
  grep -F -x 'Group=leetplus-runtime' "$unit" >/dev/null
  grep -F -x 'Slice=system.slice' "$unit" >/dev/null
  grep -F -x 'EnvironmentFile=/etc/leetplus/rollback-safe.env' "$unit" >/dev/null
  grep -F -x 'KillMode=control-group' "$unit" >/dev/null
  grep -F -x 'RestrictNetworkInterfaces=lo' "$unit" >/dev/null
  grep -F -x 'RestrictAddressFamilies=AF_INET AF_INET6' "$unit" >/dev/null
  if grep -F 'AF_UNIX' "$unit" >/dev/null; then
    printf 'rollback runtime unit retains AF_UNIX outside the inet egress fence\n' >&2
    exit 1
  fi
  grep -F -x 'IPAddressDeny=any' "$unit" >/dev/null
  grep -F -x 'IPAddressAllow=localhost' "$unit" >/dev/null
  grep -F -x 'Requires=leetplus-rollback-egress.service' "$unit" >/dev/null \
    || grep -F 'Requires=' "$unit" | grep -F 'leetplus-rollback-egress.service' >/dev/null
  grep -F -x 'Environment=PATH=/usr/sbin:/usr/bin:/sbin:/bin' "$unit" >/dev/null
  grep -F -x 'UnsetEnvironment=BASH_ENV ENV HTTP_PROXY HTTPS_PROXY ALL_PROXY NO_PROXY http_proxy https_proxy all_proxy no_proxy NODE_USE_ENV_PROXY NODE_OPTIONS NODE_PATH NODE_EXTRA_CA_CERTS NODE_DEBUG NODE_V8_COVERAGE NODE_COMPILE_CACHE SSLKEYLOGFILE LD_PRELOAD LD_LIBRARY_PATH LD_AUDIT GCONV_PATH LOCPATH OPENSSL_CONF OPENSSL_MODULES GLIBC_TUNABLES MALLOC_CHECK_ MALLOC_PERTURB_ CURL_HOME CURL_CA_BUNDLE SSL_CERT_FILE SSL_CERT_DIR PRISMA_QUERY_ENGINE_BINARY PRISMA_QUERY_ENGINE_LIBRARY PRISMA_SCHEMA_ENGINE_BINARY PRISMA_FMT_BINARY TMPDIR TMP TEMP XDG_CONFIG_HOME XDG_CACHE_HOME XDG_DATA_HOME NPM_CONFIG_USERCONFIG npm_config_userconfig PNPM_HOME COREPACK_HOME COREPACK_NPM_REGISTRY COREPACK_INTEGRITY_KEYS GIT_CONFIG_GLOBAL GIT_CONFIG_SYSTEM GIT_CONFIG_NOSYSTEM' "$unit" >/dev/null
  grep -F -x 'SocketBindDeny=any' "$unit" >/dev/null
  if grep -F '/home/admin/leetplus' "$unit" >/dev/null; then
    printf 'rollback unit references the mutable production checkout\n' >&2
    exit 1
  fi
done
grep -F -x 'SocketBindAllow=ipv4:tcp:4300' "$api_unit" >/dev/null
grep -F -x 'SocketBindAllow=ipv4:tcp:4301' "$api_unit" >/dev/null
grep -F -x 'MemoryMax=768M' "$api_unit" >/dev/null
grep -F -x 'TasksMax=128' "$api_unit" >/dev/null
grep -F -x "ExecStart=/usr/bin/node /usr/local/libexec/leetplus/legacy-rollback-auth-edge.mjs --release-sha %i" "$api_unit" >/dev/null
grep -F -x 'SocketBindAllow=ipv4:tcp:3300' "$web_unit" >/dev/null
grep -F -x 'ExecStartPost=/usr/local/libexec/leetplus/apply-legacy-rollback-egress.sh --verify' "$egress_unit" >/dev/null
if grep -E '^(Before|After|Requires|Wants)=.*leetplus-(api|web)-rollback@\.service([[:space:]]|$)' "$egress_unit" >/dev/null; then
  printf 'non-template egress unit references an uninstantiated rollback template\n' >&2
  exit 1
fi
grep -F 'meta skuid ${api_uid} ip daddr 127.0.0.1 tcp dport 5432 ct state new accept' "$egress_script" >/dev/null
grep -F 'meta skuid ${api_uid} ip daddr 127.0.0.1 tcp dport 4301 ct state new accept' "$egress_script" >/dev/null
grep -F 'ip daddr 127.0.0.1 tcp dport 4301 reject' "$egress_script" >/dev/null
grep -F 'meta skuid ${web_uid} ip daddr 127.0.0.1 tcp dport 4300 ct state new accept' "$egress_script" >/dev/null
grep -F '/auth/login' "$authenticated_smoke" >/dev/null
grep -F '/auth/me' "$authenticated_smoke" >/dev/null
grep -F '\getenv tenant_slug LEETPLUS_ORACLE_TENANT_SLUG' "$authenticated_smoke" >/dev/null
grep -F '\getenv canary_email LEETPLUS_ORACLE_CANARY_EMAIL' "$authenticated_smoke" >/dev/null
grep -F 'AND "role" = '\''ADMIN'\'' AND "accessScope" = '\''NETWORK'\''' "$authenticated_smoke" >/dev/null
grep -F -x '      WHERE "tenantId" = (SELECT "id" FROM target_tenant) AND "isActive"),' \
  "$authenticated_smoke" >/dev/null
grep -F 'DATABASE_ORACLE_PII_IN_CHILD_ARGV' "$authenticated_smoke" >/dev/null
if grep -E -- '--set=(tenant_slug|canary_email)=' "$authenticated_smoke" >/dev/null; then
  printf 'authenticated DB oracle exposes tenant/email through psql argv\n' >&2
  exit 1
fi
for read_path in /stores /products/summary /staff/checklist-templates /staff/knowledge-base /staff/team-chat/events /guests/gamification/loot-boxes /guests/gamification/missions /guests/gamification/seasons /users; do
  grep -F "$read_path" "$authenticated_smoke" >/dev/null
done
grep -F -x 'User=leetplus-api-nminus1' "$api_unit" >/dev/null
grep -F -x 'User=leetplus-web-nminus1' "$web_unit" >/dev/null
grep -F "/srv/leetplus/rollback-releases/%i" "$api_unit" >/dev/null
grep -F "/srv/leetplus/rollback-releases/%i" "$web_unit" >/dev/null
grep -F -x '    server 127.0.0.1:4300 max_fails=2 fail_timeout=5s;' "$legacy_safe_nginx" >/dev/null
grep -F -x '    server 127.0.0.1:3300 max_fails=2 fail_timeout=5s;' "$legacy_safe_nginx" >/dev/null
grep -F "FIRST_CUTOVER_ROLLBACK_SHA='${LEGACY_SHA}'" "$cutover" >/dev/null
grep -F 'scheduler-capable legacy.conf is forbidden' "$cutover" >/dev/null
grep -F -- '--require-drain' "$cutover" >/dev/null
if grep -E 'systemctl (start|enable|restart)|nginx_reload|psql' "$installer" >/dev/null; then
  printf 'install-only script contains a runtime/database effect\n' >&2
  exit 1
fi
for symlink_permission_gate in "$installer" "$preflight" "$rollback_probe"; do
  grep -F '! -type l -perm /022' "$symlink_permission_gate" >/dev/null \
    || { printf 'rollback symlink permission boundary is absent: %s\n' "$symlink_permission_gate" >&2; exit 1; }
done

# Minimal exact-source artifact proves both integrity coverage and final-env
# enforcement without using a DB or starting an application.
release_root="${TEST_ROOT}/rollback-releases"
release_directory="${release_root}/${LEGACY_SHA}"
mkdir -p \
  "$release_directory/apps/api/dist" \
  "$release_directory/apps/web/node_modules/next/dist/bin" \
  "$release_directory/apps/web/.next/cache" \
  "$release_directory/apps/web/.next/build/chunks" \
  "$release_directory/apps/web/.next/server/app/(app)/admin"
printf '%s\n' "$LEGACY_SHA" > "$release_directory/.leetplus-source-sha"
printf 'api\n' > "$release_directory/apps/api/dist/main.js"
printf 'next\n' > "$release_directory/apps/web/node_modules/next/dist/bin/next"
printf 'legacy-build\n' > "$release_directory/apps/web/.next/BUILD_ID"
printf 'turbopack chunk\n' > "$release_directory/apps/web/.next/build/chunks/[root-of-the-server]__fixture._.js"
printf 'route group\n' > "$release_directory/apps/web/.next/server/app/(app)/admin/page.js"
printf 'tilde chunk\n' > "$release_directory/apps/web/.next/build/chunks/route~fixture.js"
: > "$release_directory/N_MINUS_ONE_SYMLINKS"
refresh_fixture_manifest() {
  (
    cd -- "$release_directory"
    find . -type f ! -path './N_MINUS_ONE_SHA256SUMS' -print0 \
      | LC_ALL=C sort -z | xargs -0 sha256sum > N_MINUS_ONE_SHA256SUMS
  )
}
refresh_fixture_manifest

set -a
# shellcheck disable=SC1090
source "$safe_overlay"
# shellcheck disable=SC1090
source "$release_environment"
NODE_ENV=production
JWT_SECRET='fixture-only-strong-jwt-secret-00000000000000000000000000000000'
DATABASE_URL='postgresql://leetplus_legacy_rollback:fixture@127.0.0.1:5432/leetplus?schema=public&options=-c%20role%3Dleetplus&application_name=leetplus-nminus1-http-7de04ff4'
set +a
unset HTTP_PROXY HTTPS_PROXY ALL_PROXY NO_PROXY \
  http_proxy https_proxy all_proxy no_proxy NODE_USE_ENV_PROXY NODE_OPTIONS NODE_PATH \
  NODE_EXTRA_CA_CERTS NODE_DEBUG NODE_V8_COVERAGE NODE_COMPILE_CACHE SSLKEYLOGFILE \
  LD_PRELOAD LD_LIBRARY_PATH LD_AUDIT GCONV_PATH LOCPATH OPENSSL_CONF OPENSSL_MODULES \
  GLIBC_TUNABLES MALLOC_CHECK_ MALLOC_PERTURB_ CURL_HOME CURL_CA_BUNDLE SSL_CERT_FILE SSL_CERT_DIR \
  PRISMA_QUERY_ENGINE_BINARY PRISMA_QUERY_ENGINE_LIBRARY PRISMA_SCHEMA_ENGINE_BINARY PRISMA_FMT_BINARY \
  TMPDIR TMP TEMP XDG_CONFIG_HOME XDG_CACHE_HOME XDG_DATA_HOME NPM_CONFIG_USERCONFIG \
  npm_config_userconfig PNPM_HOME COREPACK_HOME COREPACK_NPM_REGISTRY COREPACK_INTEGRITY_KEYS \
  GIT_CONFIG_GLOBAL GIT_CONFIG_SYSTEM GIT_CONFIG_NOSYSTEM
/usr/bin/bash -p "$preflight" --release-sha "$LEGACY_SHA" --api-runtime \
  --release-root "$release_root" --safe-environment "$safe_overlay" --unprivileged-test-mode \
  > "$TEST_ROOT/preflight.out"
grep -F -x "LEGACY_ROLLBACK_PREFLIGHT_ACCEPTED_SHA=${LEGACY_SHA}" "$TEST_ROOT/preflight.out" >/dev/null
unsafe_manifest_path="$release_directory/apps/api/dist/unsafe|path.js"
printf 'unsafe manifest path\n' > "$unsafe_manifest_path"
refresh_fixture_manifest
if /usr/bin/bash -p "$preflight" --release-sha "$LEGACY_SHA" --api-runtime \
  --release-root "$release_root" --safe-environment "$safe_overlay" --unprivileged-test-mode \
  > "$TEST_ROOT/unsafe-manifest-path.out" 2>&1; then
  printf 'preflight accepted a manifest path outside the explicit safe alphabet\n' >&2
  exit 1
fi
grep -F 'rollback integrity manifest contains an unsafe or malformed entry' \
  "$TEST_ROOT/unsafe-manifest-path.out" >/dev/null
rm -- "$unsafe_manifest_path"
refresh_fixture_manifest
valid_fixture_jwt_secret="$JWT_SECRET"
for rejected_jwt_secret in '__UNSET__' 'leetplus-dev-jwt-secret-change-before-production' 'too-short'; do
  if [[ "$rejected_jwt_secret" == '__UNSET__' ]]; then
    unset JWT_SECRET
  else
    JWT_SECRET="$rejected_jwt_secret"
    export JWT_SECRET
  fi
  if /usr/bin/bash -p "$preflight" --release-sha "$LEGACY_SHA" --api-runtime \
    --release-root "$release_root" --safe-environment "$safe_overlay" --unprivileged-test-mode \
    > "$TEST_ROOT/rejected-jwt-secret.out" 2>&1; then
    printf 'preflight accepted absent/default/short JWT secret\n' >&2
    exit 1
  fi
  grep -F 'rollback API JWT_SECRET is absent, weak or equal to the legacy public fallback' \
    "$TEST_ROOT/rejected-jwt-secret.out" >/dev/null
  if grep -F "$rejected_jwt_secret" "$TEST_ROOT/rejected-jwt-secret.out" >/dev/null; then
    printf 'preflight leaked rejected JWT secret\n' >&2
    exit 1
  fi
done
JWT_SECRET="$valid_fixture_jwt_secret"
export JWT_SECRET
unset valid_fixture_jwt_secret rejected_jwt_secret
printf 'nested manifest-name collision\n' > "$release_directory/apps/api/dist/N_MINUS_ONE_SHA256SUMS"
if /usr/bin/bash -p "$preflight" --release-sha "$LEGACY_SHA" --api-runtime \
  --release-root "$release_root" --safe-environment "$safe_overlay" --unprivileged-test-mode \
  > "$TEST_ROOT/nested-manifest-name.out" 2>&1; then
  printf 'preflight excluded a nested N_MINUS_ONE_SHA256SUMS basename\n' >&2
  exit 1
fi
grep -F 'rollback integrity manifest does not cover the exact regular-file set' \
  "$TEST_ROOT/nested-manifest-name.out" >/dev/null
rm -f -- "$release_directory/apps/api/dist/N_MINUS_ONE_SHA256SUMS"
for removed_safe_key in \
  STAFF_TASK_RULES_SCHEDULED_HTTP_ENABLED \
  GUEST_GAME_REWARD_MATERIALIZER_ENABLED \
  GUEST_GAME_LEDGER_FALLBACK_KILL_SWITCH; do
  incomplete_overlay="$TEST_ROOT/rollback-safe-without-${removed_safe_key}.env"
  awk -F= -v key="$removed_safe_key" '$1 != key { print }' "$safe_overlay" > "$incomplete_overlay"
  if /usr/bin/bash -p "$preflight" --release-sha "$LEGACY_SHA" --api-runtime \
    --release-root "$release_root" --safe-environment "$incomplete_overlay" --unprivileged-test-mode \
    > "$TEST_ROOT/missing-${removed_safe_key}.out" 2>&1; then
    printf 'preflight accepted incomplete final overlay without %s\n' "$removed_safe_key" >&2
    exit 1
  fi
  grep -F 'final safety overlay does not match the exact complete deny schema' \
    "$TEST_ROOT/missing-${removed_safe_key}.out" >/dev/null
done
if GUEST_GAME_RETENTION_SCHEDULER_ENABLED=true /usr/bin/bash -p "$preflight" \
  --release-sha "$LEGACY_SHA" --api-runtime --release-root "$release_root" \
  --safe-environment "$safe_overlay" --unprivileged-test-mode \
  > "$TEST_ROOT/unsafe-preflight.out" 2>&1; then
  printf 'preflight accepted an enabled legacy scheduler\n' >&2
  exit 1
fi
if DATABASE_URL='postgresql://leetplus_legacy_rollback:fixture@127.0.0.1:5544/wrong?schema=public&options=-c%20role%3Dleetplus%20-c%20search_path%3Dpublic&application_name=leetplus-nminus1-http-7de04ff4&pool_timeout=1' \
  /usr/bin/bash -p "$preflight" --release-sha "$LEGACY_SHA" --api-runtime \
  --release-root "$release_root" --safe-environment "$safe_overlay" --unprivileged-test-mode \
  > "$TEST_ROOT/wrong-database-preflight.out" 2>&1; then
  printf 'preflight accepted a noncanonical DB/port/options target\n' >&2
  exit 1
fi
if HTTP_PROXY='http://127.0.0.1:9999' /usr/bin/bash -p "$preflight" \
  --release-sha "$LEGACY_SHA" --api-runtime --release-root "$release_root" \
  --safe-environment "$safe_overlay" --unprivileged-test-mode \
  > "$TEST_ROOT/proxy-preflight.out" 2>&1; then
  printf 'preflight accepted a proxy bypass\n' >&2
  exit 1
fi
if OPENSSL_CONF="$TEST_ROOT/forged-openssl.cnf" /usr/bin/bash -p "$preflight" \
  --release-sha "$LEGACY_SHA" --api-runtime --release-root "$release_root" \
  --safe-environment "$safe_overlay" --unprivileged-test-mode \
  > "$TEST_ROOT/openssl-preflight.out" 2>&1; then
  printf 'preflight accepted an inherited OPENSSL_CONF loader override\n' >&2
  exit 1
fi
grep -F 'rollback unit inherited forbidden injection environment: OPENSSL_CONF' \
  "$TEST_ROOT/openssl-preflight.out" >/dev/null
for hostile_key in PRISMA_QUERY_ENGINE_LIBRARY TMPDIR COREPACK_HOME GLIBC_TUNABLES; do
  if /usr/bin/env "${hostile_key}=${TEST_ROOT}/forged" /usr/bin/bash -p "$preflight" \
    --release-sha "$LEGACY_SHA" --api-runtime --release-root "$release_root" \
    --safe-environment "$safe_overlay" --unprivileged-test-mode \
    > "$TEST_ROOT/${hostile_key}-preflight.out" 2>&1; then
    printf 'preflight accepted inherited %s\n' "$hostile_key" >&2
    exit 1
  fi
  grep -F "rollback unit inherited forbidden injection environment: ${hostile_key}" \
    "$TEST_ROOT/${hostile_key}-preflight.out" >/dev/null
done

# Root-owned smoke credentials can never cross a proxy boundary, and generic
# JSON 200 responses cannot satisfy route-specific data oracles.
auth_credentials="$TEST_ROOT/auth-smoke.env"
auth_database_oracle="$TEST_ROOT/auth-database-oracle.json"
tenant_id_digest="$(printf %s 'tenant-1' | sha256sum | awk '{ print $1 }')"
store_ids_digest="$(printf '%s\n' store-1 store-2 store-3 store-4 | sha256sum | awk '{ print $1 }')"
printf '%s\n' \
  'EMAIL=canary@example.test' \
  'PASSWORD=fixture-password' \
  'TENANT_SLUG=demo' \
  "EXPECTED_TENANT_ID_SHA256=${tenant_id_digest}" \
  "EXPECTED_STORE_IDS_SHA256=${store_ids_digest}" \
  'MIN_ASSORTMENT_TOTAL_SKU=1' \
  'MIN_STAFF_ROWS=1' \
  'MIN_GAMIFICATION_CONFIG_ITEMS=1' > "$auth_credentials"
cat > "$auth_database_oracle" <<'AUTH_DATABASE_ORACLE'
{
  "channelIds": ["channel-1"],
  "checklistIds": ["row-1"],
  "checklistNetworkIds": ["row-1"],
  "customRoles": [{"id":"role-1","name":"Club operator","permissions":["view_dashboard"]}],
  "databaseAddress": "127.0.0.1",
  "databaseName": "leetplus",
  "databasePort": 5432,
  "databaseReadOnly": true,
  "databaseSystemIdentifier": "1234567890123456",
  "invites": [{"accessScope":"STORES","customRoleId":"role-1","id":"invite-1","role":"CLUB_ADMINISTRATOR","storeIds":["store-1"]}],
  "knowledgeIds": ["kb-1"],
  "knowledgeNetworkIds": ["kb-1"],
  "lootBoxIds": [],
  "missionIds": ["mission-1"],
  "activeProductCount": 1,
  "roleOverrides": [],
  "seasonIds": [],
  "sessionUser": "leetplus_drain_audit",
  "storeIds": ["store-1", "store-2", "store-3", "store-4"],
  "tenantId": "tenant-1",
  "tenantSlug": "demo",
  "users": [
    {"accessScope":"NETWORK","customRoleId":null,"id":"user-1","isActive":true,"isPlatformAdmin":false,"role":"ADMIN","storeIds":[]},
    {"accessScope":"STORES","customRoleId":null,"id":"user-2","isActive":true,"isPlatformAdmin":false,"role":"MANAGER","storeIds":["store-1"]},
    {"accessScope":"STORES","customRoleId":"role-1","id":"user-3","isActive":true,"isPlatformAdmin":false,"role":"CLUB_ADMINISTRATOR","storeIds":["store-2"]},
    {"accessScope":"NETWORK","customRoleId":null,"id":"user-4","isActive":true,"isPlatformAdmin":false,"role":"OWNER","storeIds":[]}
  ]
}
AUTH_DATABASE_ORACLE
auth_port_file="$TEST_ROOT/auth-port"
auth_request_log="$TEST_ROOT/auth-requests.log"
auth_scenario_file="$TEST_ROOT/auth-scenario"
auth_security_baseline="$TEST_ROOT/auth-security-baseline.env"
cat > "$TEST_ROOT/auth-server.mjs" <<'AUTH_SERVER'
import { createServer } from 'node:http';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const [portFile, requestLog, scenarioFile, securityBaselineFile] = process.argv.slice(2);
const stores = Array.from({ length: 4 }, (_, index) => ({
  id: `store-${index + 1}`,
  name: `Store ${index + 1}`,
  isActive: true,
  tenantId: 'tenant-1',
}));
const capabilityKeys = [
  'view_dashboard', 'view_reports', 'view_assortment_reports', 'export_reports',
  'manage_assortment_reports', 'view_assortment_products', 'view_assortment_catalog',
  'view_assortment_stores', 'view_guests', 'export_guests', 'manage_guest_crm',
  'view_guest_gamification', 'manage_guest_game_rules', 'approve_guest_game_rewards',
  'operate_guest_game_ledger',
  'view_guest_game_pii', 'view_marketing', 'manage_marketing', 'view_communications',
  'manage_communications', 'view_staff', 'view_staff_shift_workspace', 'view_staff_tasks',
  'manage_staff_tasks', 'view_staff_standards', 'manage_staff_standards',
  'view_staff_training', 'manage_staff_training', 'view_staff_knowledge',
  'view_staff_control', 'manage_staff_control', 'view_staff_directory',
  'manage_staff_directory', 'view_staff_salary', 'manage_staff_salary',
  'edit_staff_knowledge', 'review_staff_knowledge', 'publish_staff_knowledge',
  'manage_users', 'manage_integrations', 'run_sync', 'import_guest_foundation',
  'import_data', 'use_utilities',
  'edit_products', 'edit_catalog', 'edit_stores',
];
const capabilityOptions = capabilityKeys.map((key) => ({
  key, label: `Label ${key}`, description: `Description ${key}`,
}));
const roleOptions = [
  'ADMIN', 'MANAGER', 'CLUB_MANAGER', 'MARKETER', 'STANDARDS_MANAGER', 'BUYER',
  'SENIOR_ADMINISTRATOR', 'CLUB_ADMINISTRATOR', 'TRAINEE',
].map((role) => ({
  role, label: `Label ${role}`, description: `Description ${role}`,
  permissions: ['view_dashboard'], isOverridden: false, updatedAt: null,
}));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
writeFileSync(securityBaselineFile, [
  `EXPECTED_ROLE_OPTIONS_SHA256=${sha256(JSON.stringify(roleOptions.map(({ description, isOverridden, label, permissions, role }) => ({ description, isOverridden, label, permissions, role }))))}`,
  `EXPECTED_CAPABILITY_OPTIONS_SHA256=${sha256(JSON.stringify(capabilityOptions.map(({ description, key, label }) => ({ description, key, label }))))}`,
  '',
].join('\n'));
const staffBase = {
  filters: {},
  summary: { total: 0, draft: 0, active: 0, archived: 0 },
  accessScope: 'NETWORK',
  rows: [],
  stores,
};
const server = createServer((request, response) => {
  appendFileSync(requestLog, `${request.method} ${request.url}\n`);
  response.setHeader('content-type', 'application/json');
  const scenario = readFileSync(scenarioFile, 'utf8').trim();
  const scopeFields = (surface) => {
    if (scenario === 'legacy-scope-omitted' || scenario === 'legacy-staff-scope-omitted') return {};
    if (scenario === 'partial-login-scope' && surface === 'login') return { accessScope: 'NETWORK' };
    if (scenario === 'partial-me-scope' && surface === 'me') return { allowedStoreIds: [] };
    return { accessScope: 'NETWORK', allowedStoreIds: [] };
  };
  let payload;
  if (request.url === '/auth/login') {
    payload = {
      accessToken: 'x'.repeat(32),
      user: {
        email: 'canary@example.test', tenantSlug: 'demo', tenantId: 'tenant-1',
        role: scenario === 'wrong-canary-role' ? 'OWNER' : 'ADMIN',
        ...scopeFields('login'), isPlatformAdmin: false,
      },
    };
  } else if (!request.headers.authorization) {
    if (!(scenario === 'unauthenticated-critical-read' && request.url === '/products/summary')) {
      response.statusCode = 401;
      response.end(JSON.stringify({ message: 'Unauthorized' }));
      return;
    }
  } else if (request.url === '/auth/me') {
    payload = {
      tenantSlug: 'demo', tenantId: scenario === 'missing-tenant' ? undefined : 'tenant-1',
      role: 'ADMIN', ...scopeFields('me'), isPlatformAdmin: false,
    };
  } else if (request.url === '/stores') {
    payload = scenario === 'wrong-store-baseline'
      ? stores.map((store, index) => index === 0 ? { ...store, id: 'store-x' } : store)
      : stores;
  } else if (request.url === '/products/summary') {
    payload = scenario === 'empty-assortment'
      ? { totalSku: 0, operationalActiveSku: 0, categorizedSku: 0, suppliedSku: 0 }
      : scenario === 'inactive-product-inflation'
        ? { totalSku: 2, operationalActiveSku: 1, categorizedSku: 1, suppliedSku: 1 }
        : { totalSku: 1, operationalActiveSku: 1, categorizedSku: 1, suppliedSku: 1 };
  } else if (request.url.startsWith('/staff/checklist-templates')) {
    const checklistRows = scenario === 'foreign-staff'
      ? [{ id: 'row-1', title: 'Foreign', store: { id: 'foreign', name: 'Foreign', isActive: true } }]
      : scenario === 'empty-staff'
        ? []
        : [{ id: 'row-1', title: 'Checklist', store: null }];
    payload = {
      ...staffBase,
      rows: checklistRows,
      summary: { total: checklistRows.length, draft: 0, active: checklistRows.length, archived: 0 },
      publishedRegulations: [],
    };
  } else if (request.url === '/staff/knowledge-base') {
    const knowledgeRows = [{ id: 'kb-1', title: 'Knowledge', store: null }];
    payload = {
      ...staffBase,
      rows: knowledgeRows,
      settings: {}, articleSuggestions: [],
      summary: { total: 1, published: 1, draft: 0, archived: 0 },
    };
  } else if (request.url === '/staff/team-chat/events') {
    const channel = {
      id: 'channel-1', updatedAt: '2026-08-21T00:00:00.000Z',
      messagesCount: 0, unreadCount: 0, mentionUnreadCount: 0,
      pinnedCount: 0, lastMessageAt: null,
    };
    const liveState = {
      generatedAt: '2026-08-21T00:00:00.000Z', activeChannelId: null,
      summary: {
        channels: scenario === 'empty-chat' ? 0 : 1,
        messages: 0, pinned: 0, unread: 0,
      },
      channels: scenario === 'empty-chat' ? [] : [channel],
    };
    response.setHeader('content-type', 'text/event-stream');
    response.end(`event: team-chat-state\nretry: 5000\ndata: ${JSON.stringify(liveState)}\n\n`);
    return;
  } else if (request.url === '/guests/gamification/loot-boxes') {
    payload = [];
  } else if (request.url === '/guests/gamification/missions') {
    payload = scenario === 'empty-game' ? [] : [{ id: 'mission-1' }];
  } else if (request.url === '/guests/gamification/seasons') {
    payload = [];
  } else if (request.url === '/users') {
    const visibleStores = scenario === 'duplicate-users-stores'
      ? [stores[0], stores[0], stores[2], stores[3]]
      : stores;
    const canaryAdmin = {
      id: 'user-1', email: 'canary@example.test', role: 'ADMIN',
      customRoleId: null, customRole: null,
      permissions: scenario === 'wrong-user-permission' ? ['view_reports'] : ['view_dashboard'],
      isActive: true, isPlatformAdmin: false, scope: 'NETWORK', stores: [],
    };
    const owner = {
      id: 'user-4', email: 'owner@example.test', role: 'OWNER',
      customRoleId: null, customRole: null, permissions: capabilityKeys,
      isActive: true, isPlatformAdmin: false, scope: 'NETWORK', stores: [],
    };
    const scopedUser = {
      id: 'user-2', email: 'manager@example.test',
      role: scenario === 'wrong-user-role' ? 'BUYER' : 'MANAGER',
      customRoleId: null, customRole: null,
      permissions: ['view_dashboard'], isActive: true, isPlatformAdmin: false,
      scope: 'STORES', stores: scenario === 'foreign-user-store'
        ? [{ id: 'foreign', name: 'Foreign', isActive: true }]
        : [stores[0]],
    };
    const customRole = {
      id: scenario === 'foreign-custom-role' ? 'foreign-role' : 'role-1',
      name: 'Club operator', permissions: ['view_dashboard'],
    };
    const customUser = {
      id: 'user-3', email: 'operator@example.test', role: 'CLUB_ADMINISTRATOR',
      customRoleId: 'role-1', customRole, permissions: ['view_dashboard'],
      isActive: true, isPlatformAdmin: false, scope: 'STORES', stores: [stores[1]],
    };
    const invite = {
      id: scenario === 'foreign-invite' ? 'foreign-invite' : 'invite-1',
      role: 'CLUB_ADMINISTRATOR', customRoleId: 'role-1', customRole,
      scope: 'STORES', stores: [stores[0]],
    };
    const visibleRoleOptions = roleOptions.map((role, index) =>
      scenario === 'wrong-role-option-permission' && index === 0
        ? { ...role, permissions: ['view_reports'] }
        : role);
    const visibleCapabilities = capabilityOptions.map((capability, index) =>
      scenario === 'wrong-capability-catalog' && index === 0
        ? { ...capability, key: 'forged_capability' }
        : capability);
    payload = {
      users: [canaryAdmin, scopedUser, customUser, owner], stores: visibleStores,
      roleOptions: visibleRoleOptions,
      customRoles: [customRole], invites: [invite],
      capabilityOptions: visibleCapabilities,
    };
  } else {
    payload = {};
  }
  if (scenario === 'legacy-staff-scope-omitted' &&
    (request.url.startsWith('/staff/checklist-templates') || request.url === '/staff/knowledge-base')) {
    delete payload.accessScope;
  }
  if (scenario === 'wrong-staff-scope' &&
    (request.url.startsWith('/staff/checklist-templates') || request.url === '/staff/knowledge-base')) {
    payload.accessScope = 'GLOBAL';
  }
  response.end(JSON.stringify(payload));
});
server.listen(0, '127.0.0.1', () => writeFileSync(portFile, String(server.address().port)));
AUTH_SERVER
: > "$auth_request_log"
printf 'valid\n' > "$auth_scenario_file"
node "$TEST_ROOT/auth-server.mjs" "$auth_port_file" "$auth_request_log" "$auth_scenario_file" "$auth_security_baseline" &
auth_server_pid=$!
for _ in 1 2 3 4 5; do
  [[ -s "$auth_port_file" && -s "$auth_security_baseline" ]] && break
  sleep 1
done
test -s "$auth_port_file"
test -s "$auth_security_baseline"
cat "$auth_security_baseline" >> "$auth_credentials"
auth_url="http://127.0.0.1:$(cat "$auth_port_file")"
if HTTP_PROXY='http://127.0.0.1:9999' node "$authenticated_smoke" \
  --unprivileged-test-mode --base-url "$auth_url" --credentials "$auth_credentials" --database-oracle "$auth_database_oracle" \
  > "$TEST_ROOT/auth-proxy.out" 2>&1; then
  printf 'authenticated smoke accepted a hostile proxy environment\n' >&2
  exit 1
fi
test ! -s "$auth_request_log"
printf 'missing-tenant\n' > "$auth_scenario_file"
if node "$authenticated_smoke" --unprivileged-test-mode --base-url "$auth_url" \
  --credentials "$auth_credentials" --database-oracle "$auth_database_oracle" > "$TEST_ROOT/auth-missing-tenant.out" 2>&1; then
  printf 'authenticated smoke accepted /auth/me without tenant identity\n' >&2
  exit 1
fi
grep -F 'AUTH_ME_SCOPE_INVALID' "$TEST_ROOT/auth-missing-tenant.out" >/dev/null

printf 'legacy-scope-omitted\n' > "$auth_scenario_file"
node "$authenticated_smoke" --unprivileged-test-mode --base-url "$auth_url" \
  --credentials "$auth_credentials" --database-oracle "$auth_database_oracle" \
  > "$TEST_ROOT/auth-legacy-scope-omitted.out"
grep -F -x 'LEGACY_ROLLBACK_AUTHENTICATED_READS_STORE_COUNT=4' \
  "$TEST_ROOT/auth-legacy-scope-omitted.out" >/dev/null

printf 'legacy-staff-scope-omitted\n' > "$auth_scenario_file"
node "$authenticated_smoke" --unprivileged-test-mode --base-url "$auth_url" \
  --credentials "$auth_credentials" --database-oracle "$auth_database_oracle" \
  > "$TEST_ROOT/auth-legacy-staff-scope-omitted.out"
grep -F -x 'LEGACY_ROLLBACK_AUTHENTICATED_READS_STORE_COUNT=4' \
  "$TEST_ROOT/auth-legacy-staff-scope-omitted.out" >/dev/null

printf 'wrong-staff-scope\n' > "$auth_scenario_file"
if node "$authenticated_smoke" --unprivileged-test-mode --base-url "$auth_url" \
  --credentials "$auth_credentials" --database-oracle "$auth_database_oracle" \
  > "$TEST_ROOT/auth-wrong-staff-scope.out" 2>&1; then
  printf 'authenticated smoke accepted an unknown staff report scope\n' >&2
  exit 1
fi
grep -F 'STAFF_ORACLE_STAFF_CHECKLIST_TEMPLATES_INVALID' \
  "$TEST_ROOT/auth-wrong-staff-scope.out" >/dev/null

printf 'partial-login-scope\n' > "$auth_scenario_file"
if node "$authenticated_smoke" --unprivileged-test-mode --base-url "$auth_url" \
  --credentials "$auth_credentials" --database-oracle "$auth_database_oracle" \
  > "$TEST_ROOT/auth-partial-login-scope.out" 2>&1; then
  printf 'authenticated smoke accepted a partially emitted login scope\n' >&2
  exit 1
fi
grep -F 'LOGIN_SCOPE_INVALID' "$TEST_ROOT/auth-partial-login-scope.out" >/dev/null

printf 'partial-me-scope\n' > "$auth_scenario_file"
if node "$authenticated_smoke" --unprivileged-test-mode --base-url "$auth_url" \
  --credentials "$auth_credentials" --database-oracle "$auth_database_oracle" \
  > "$TEST_ROOT/auth-partial-me-scope.out" 2>&1; then
  printf 'authenticated smoke accepted a partially emitted /auth/me scope\n' >&2
  exit 1
fi
grep -F 'AUTH_ME_SCOPE_INVALID' "$TEST_ROOT/auth-partial-me-scope.out" >/dev/null

printf 'wrong-canary-role\n' > "$auth_scenario_file"
if node "$authenticated_smoke" --unprivileged-test-mode --base-url "$auth_url" \
  --credentials "$auth_credentials" --database-oracle "$auth_database_oracle" > "$TEST_ROOT/auth-wrong-canary-role.out" 2>&1; then
  printf 'authenticated smoke accepted an OWNER credential in place of the ADMIN canary\n' >&2
  exit 1
fi
grep -F 'LOGIN_SCOPE_INVALID' "$TEST_ROOT/auth-wrong-canary-role.out" >/dev/null

printf 'unauthenticated-critical-read\n' > "$auth_scenario_file"
if node "$authenticated_smoke" --unprivileged-test-mode --base-url "$auth_url" \
  --credentials "$auth_credentials" --database-oracle "$auth_database_oracle" > "$TEST_ROOT/auth-public-critical-read.out" 2>&1; then
  printf 'authenticated smoke accepted a public critical tenant read\n' >&2
  exit 1
fi
grep -F 'UNAUTHENTICATED_READ_ASSORTMENT_SUMMARY_EXPOSED' \
  "$TEST_ROOT/auth-public-critical-read.out" >/dev/null

printf 'wrong-store-baseline\n' > "$auth_scenario_file"
if node "$authenticated_smoke" --unprivileged-test-mode --base-url "$auth_url" \
  --credentials "$auth_credentials" --database-oracle "$auth_database_oracle" > "$TEST_ROOT/auth-wrong-store-baseline.out" 2>&1; then
  printf 'authenticated smoke accepted a store set outside the pinned baseline\n' >&2
  exit 1
fi
grep -F 'STORES_TOPOLOGY_INVALID' "$TEST_ROOT/auth-wrong-store-baseline.out" >/dev/null

printf 'empty-assortment\n' > "$auth_scenario_file"
if node "$authenticated_smoke" --unprivileged-test-mode --base-url "$auth_url" \
  --credentials "$auth_credentials" --database-oracle "$auth_database_oracle" > "$TEST_ROOT/auth-empty-assortment.out" 2>&1; then
  printf 'authenticated smoke accepted exact-shaped all-zero assortment data\n' >&2
  exit 1
fi
grep -F 'ASSORTMENT_SUMMARY_SHAPE_INVALID' "$TEST_ROOT/auth-empty-assortment.out" >/dev/null

printf 'inactive-product-inflation\n' > "$auth_scenario_file"
if node "$authenticated_smoke" --unprivileged-test-mode --base-url "$auth_url" \
  --credentials "$auth_credentials" --database-oracle "$auth_database_oracle" \
  > "$TEST_ROOT/auth-inactive-product-inflation.out" 2>&1; then
  printf 'authenticated smoke accepted inactive-product inflation over the DB oracle\n' >&2
  exit 1
fi
grep -F 'ASSORTMENT_SUMMARY_SHAPE_INVALID' \
  "$TEST_ROOT/auth-inactive-product-inflation.out" >/dev/null

printf 'foreign-staff\n' > "$auth_scenario_file"
if node "$authenticated_smoke" --unprivileged-test-mode --base-url "$auth_url" \
  --credentials "$auth_credentials" --database-oracle "$auth_database_oracle" > "$TEST_ROOT/auth-foreign-staff.out" 2>&1; then
  printf 'authenticated smoke accepted a foreign staff row store\n' >&2
  exit 1
fi
grep -F 'STAFF_ORACLE_STAFF_CHECKLIST_TEMPLATES_INVALID' "$TEST_ROOT/auth-foreign-staff.out" >/dev/null

printf 'empty-staff\n' > "$auth_scenario_file"
if node "$authenticated_smoke" --unprivileged-test-mode --base-url "$auth_url" \
  --credentials "$auth_credentials" --database-oracle "$auth_database_oracle" > "$TEST_ROOT/auth-empty-staff.out" 2>&1; then
  printf 'authenticated smoke accepted exact-shaped empty staff data\n' >&2
  exit 1
fi
grep -F 'STAFF_CHECKLIST_DATABASE_ORACLE_INVALID' "$TEST_ROOT/auth-empty-staff.out" >/dev/null

printf 'empty-chat\n' > "$auth_scenario_file"
if node "$authenticated_smoke" --unprivileged-test-mode --base-url "$auth_url" \
  --credentials "$auth_credentials" --database-oracle "$auth_database_oracle" > "$TEST_ROOT/auth-empty-chat.out" 2>&1; then
  printf 'authenticated smoke accepted an empty static communications event\n' >&2
  exit 1
fi
grep -F 'COMMUNICATIONS_LIVE_READ_INVALID' "$TEST_ROOT/auth-empty-chat.out" >/dev/null

printf 'empty-game\n' > "$auth_scenario_file"
if node "$authenticated_smoke" --unprivileged-test-mode --base-url "$auth_url" \
  --credentials "$auth_credentials" --database-oracle "$auth_database_oracle" > "$TEST_ROOT/auth-empty-game.out" 2>&1; then
  printf 'authenticated smoke accepted a static empty gamification object\n' >&2
  exit 1
fi
grep -F 'GAMIFICATION_DATABASE_ORACLE_INVALID' "$TEST_ROOT/auth-empty-game.out" >/dev/null

printf 'duplicate-users-stores\n' > "$auth_scenario_file"
if node "$authenticated_smoke" --unprivileged-test-mode --base-url "$auth_url" \
  --credentials "$auth_credentials" --database-oracle "$auth_database_oracle" > "$TEST_ROOT/auth-duplicate-users-stores.out" 2>&1; then
  printf 'authenticated smoke accepted duplicate /users store topology\n' >&2
  exit 1
fi
grep -F 'USERS_SCOPE_SHAPE_INVALID' "$TEST_ROOT/auth-duplicate-users-stores.out" >/dev/null

printf 'foreign-user-store\n' > "$auth_scenario_file"
if node "$authenticated_smoke" --unprivileged-test-mode --base-url "$auth_url" \
  --credentials "$auth_credentials" --database-oracle "$auth_database_oracle" > "$TEST_ROOT/auth-foreign-user-store.out" 2>&1; then
  printf 'authenticated smoke accepted a foreign nested user store\n' >&2
  exit 1
fi
grep -F 'USERS_SCOPE_SHAPE_INVALID' "$TEST_ROOT/auth-foreign-user-store.out" >/dev/null

printf 'foreign-custom-role\n' > "$auth_scenario_file"
if node "$authenticated_smoke" --unprivileged-test-mode --base-url "$auth_url" \
  --credentials "$auth_credentials" --database-oracle "$auth_database_oracle" > "$TEST_ROOT/auth-foreign-custom-role.out" 2>&1; then
  printf 'authenticated smoke accepted a custom role outside the DB-bound tenant set\n' >&2
  exit 1
fi
grep -F 'USERS_DATABASE_ORACLE_INVALID' "$TEST_ROOT/auth-foreign-custom-role.out" >/dev/null

printf 'foreign-invite\n' > "$auth_scenario_file"
if node "$authenticated_smoke" --unprivileged-test-mode --base-url "$auth_url" \
  --credentials "$auth_credentials" --database-oracle "$auth_database_oracle" > "$TEST_ROOT/auth-foreign-invite.out" 2>&1; then
  printf 'authenticated smoke accepted an invite outside the DB-bound tenant set\n' >&2
  exit 1
fi
grep -F 'USERS_DATABASE_ORACLE_INVALID' "$TEST_ROOT/auth-foreign-invite.out" >/dev/null

for authority_scenario in wrong-user-role wrong-user-permission wrong-role-option-permission wrong-capability-catalog; do
  printf '%s\n' "$authority_scenario" > "$auth_scenario_file"
  if node "$authenticated_smoke" --unprivileged-test-mode --base-url "$auth_url" \
    --credentials "$auth_credentials" --database-oracle "$auth_database_oracle" \
    > "$TEST_ROOT/auth-${authority_scenario}.out" 2>&1; then
    printf 'authenticated smoke accepted authority drift: %s\n' "$authority_scenario" >&2
    exit 1
  fi
done
grep -F 'USERS_DATABASE_AUTHORITY_INVALID' "$TEST_ROOT/auth-wrong-user-role.out" >/dev/null
grep -F 'USER_EFFECTIVE_PERMISSIONS_INVALID' "$TEST_ROOT/auth-wrong-user-permission.out" >/dev/null
grep -F 'USERS_SCOPE_SHAPE_INVALID' "$TEST_ROOT/auth-wrong-role-option-permission.out" >/dev/null
grep -F 'CAPABILITY_CATALOG_INVALID' "$TEST_ROOT/auth-wrong-capability-catalog.out" >/dev/null

printf 'valid\n' > "$auth_scenario_file"
node "$authenticated_smoke" --unprivileged-test-mode --base-url "$auth_url" \
  --credentials "$auth_credentials" --database-oracle "$auth_database_oracle" > "$TEST_ROOT/auth-valid.out"
grep -F -x 'LEGACY_ROLLBACK_AUTHENTICATED_READS_STORE_COUNT=4' "$TEST_ROOT/auth-valid.out" >/dev/null
if grep -F 'demo' "$TEST_ROOT/auth-valid.out" >/dev/null; then
  printf 'authenticated smoke leaked raw tenant identity to stdout\n' >&2
  exit 1
fi
kill "$auth_server_pid"
wait "$auth_server_pid" 2>/dev/null || true
auth_server_pid=''

# Install-only is byte-idempotent in disposable roots and never installs an
# operator DB target/smoke secret from an example.
if [[ "$(uname -s)" != MINGW* ]]; then
install_root="$TEST_ROOT/install"
mkdir -p "$install_root" "$install_root/etc" "$install_root/cutover"
if [[ "${OSTYPE:-}" == msys* ]]; then
  export TEST_INSTALL_MSYS_MODE_COMPAT=true
fi
nss_bin="$TEST_ROOT/nss-bin"
nss_proc="$TEST_ROOT/nss-proc"
mkdir -p "$nss_bin" "$nss_proc/9001" "$nss_proc/9002"
cat > "$nss_proc/9001/status" <<'NSS_STATUS'
Name:	fixture
Uid:	9001	9001	9001	9001
NSS_STATUS
cat > "$nss_proc/9002/status" <<'NSS_VANISH_STATUS'
Name:	vanishing-fixture
Uid:	9002	9002	9002	9002
NSS_VANISH_STATUS
cat > "$nss_bin/getent" <<'NSS_GETENT'
#!/usr/bin/bash -p
set -euo pipefail
case "${1:-}" in
  passwd)
    printf '%s\n' \
      'root:x:0:0:root:/root:/bin/bash' \
      'leetplus-api-nminus1:x:62001:62000::/nonexistent:/usr/sbin/nologin' \
      'leetplus-web-nminus1:x:62002:62000::/nonexistent:/usr/sbin/nologin' \
      'leetplus-api-blue:x:62003:62000::/nonexistent:/usr/sbin/nologin' \
      'leetplus-api-green:x:62004:62000::/nonexistent:/usr/sbin/nologin' \
      'leetplus-web-blue:x:62005:62000::/nonexistent:/usr/sbin/nologin' \
      'leetplus-web-green:x:62006:62000::/nonexistent:/usr/sbin/nologin'
    [[ "${TEST_NSS_DUPLICATE_UID:-false}" != true ]] \
      || printf '%s\n' 'leetplus-api-alias:x:62001:62003::/nonexistent:/usr/sbin/nologin'
    case "${TEST_NSS_FOREIGN_PRIMARY_GID:-}" in
      shared) printf '%s\n' 'foreign-shared:x:62991:62000::/nonexistent:/usr/sbin/nologin' ;;
      api) printf '%s\n' 'foreign-api:x:62992:62001::/nonexistent:/usr/sbin/nologin' ;;
      web) printf '%s\n' 'foreign-web:x:62993:62002::/nonexistent:/usr/sbin/nologin' ;;
      '') ;;
      *) exit 65 ;;
    esac
    ;;
  group)
    printf '%s\n' \
      'root:x:0:' \
      'leetplus-runtime:x:62000:' \
      'leetplus-api-runtime:x:62001:leetplus-api-blue,leetplus-api-green,leetplus-api-nminus1' \
      'leetplus-web-runtime:x:62002:leetplus-web-blue,leetplus-web-green,leetplus-web-nminus1'
    [[ "${TEST_NSS_DUPLICATE_GID:-false}" != true ]] \
      || printf '%s\n' 'leetplus-api-runtime-alias:x:62001:'
    ;;
  *) exit 64 ;;
esac
NSS_GETENT
cat > "$nss_bin/id" <<'NSS_ID'
#!/usr/bin/bash -p
set -euo pipefail
if [[ "${1:-}" == -nG && "${2:-}" == leetplus-api-nminus1 ]]; then
  printf 'leetplus-runtime leetplus-api-runtime\n'
elif [[ "${1:-}" == -nG && "${2:-}" == leetplus-web-nminus1 ]]; then
  printf 'leetplus-runtime leetplus-web-runtime\n'
elif [[ "${1:-}" == -un ]]; then
  /usr/bin/id -un
elif [[ "${1:-}" == -gn ]]; then
  if [[ "$(uname -s)" == MINGW* ]]; then
    # MSYS has no stable group-name mapping; stat reports this exact sentinel.
    printf 'UNKNOWN\n'
  else
    /usr/bin/id -gn
  fi
else
  exec /usr/bin/id "$@"
fi
NSS_ID
cat > "$nss_bin/dd" <<'NSS_DD'
#!/usr/bin/bash -p
set -euo pipefail
declare -a forwarded_arguments=()
input_path=''
for argument in "$@"; do
  if [[ "$argument" == "if=${TEST_PROC_ROOT:-}/9002/status" \
    && "${TEST_NSS_VANISH_PID:-false}" == true ]]; then
    rm -f -- "${TEST_PROC_ROOT:?}/9002/status"
    rmdir -- "${TEST_PROC_ROOT:?}/9002"
    exit 1
  fi
  if [[ "$argument" == if=* ]]; then
    input_path="${argument#if=}"
  fi
  if [[ "$argument" == iflag=nofollow && "$(uname -s)" == MINGW* ]]; then
    continue
  fi
  forwarded_arguments+=("$argument")
done
if [[ "$(uname -s)" == MINGW* ]]; then
  [[ -n "$input_path" && -f "$input_path" && ! -L "$input_path" ]] || exit 66
fi
exec /usr/bin/dd "${forwarded_arguments[@]}"
NSS_DD
chmod 0700 "$nss_bin/getent" "$nss_bin/id" "$nss_bin/dd"
install_arguments=(
  --source-root "$DEPLOY_ROOT"
  --release-root "$release_root"
  --etc-root "$install_root/etc"
  --systemd-root "$install_root/systemd"
  --libexec-root "$install_root/libexec"
  --sbin-root "$install_root/sbin"
  --nginx-root "$install_root/nginx"
  --state-root "$install_root/state"
  --cutover-state-root "$install_root/cutover"
  --unprivileged-test-mode
)
for foreign_primary_group in shared api web; do
  if PATH="$nss_bin:$PATH" TEST_NSS_ATTESTATION=true TEST_PROC_ROOT="$nss_proc" \
    TEST_NSS_FOREIGN_PRIMARY_GID="$foreign_primary_group" \
    /usr/bin/bash -p "$installer" "${install_arguments[@]}" \
      > "$install_root/foreign-primary-${foreign_primary_group}.out" 2>&1; then
    printf 'installer accepted a foreign %s runtime secret-group primary GID\n' "$foreign_primary_group" >&2
    exit 1
  fi
  if ! grep -F 'runtime secret-group reverse primary-GID sets are not exact' \
    "$install_root/foreign-primary-${foreign_primary_group}.out" >/dev/null; then
    printf 'foreign %s primary-GID rejection output:\n' "$foreign_primary_group" >&2
    sed -n '1,80p' "$install_root/foreign-primary-${foreign_primary_group}.out" >&2
    exit 1
  fi
done
installer_dropin_directory="$install_root/systemd/leetplus-api-rollback@.service.d"
mkdir -p "$installer_dropin_directory"
chmod 0777 "$installer_dropin_directory"
if PATH="$nss_bin:$PATH" TEST_NSS_ATTESTATION=true TEST_PROC_ROOT="$nss_proc" \
  /usr/bin/bash -p "$installer" "${install_arguments[@]}" \
    > "$install_root/writable-persistent-fence-directory.out" 2>&1; then
  printf 'installer accepted a writable persistent-fence directory\n' >&2
  exit 1
fi
if ! grep -F 'persistent-fence directory authority is unsafe' \
  "$install_root/writable-persistent-fence-directory.out" >/dev/null; then
  printf 'writable persistent-fence rejection output:\n' >&2
  sed -n '1,80p' "$install_root/writable-persistent-fence-directory.out" >&2
  exit 1
fi
rm -rf -- "$install_root/cutover/test-runtime-masks"
rm -f -- "$install_root/cutover/scheduler-free-control-install.preparing"
chmod 0755 "$installer_dropin_directory"
rmdir "$installer_dropin_directory"

install -d -m 0755 "$installer_dropin_directory"
installer_mount_inventory="$install_root/persistent-fence-mounts"
printf '%s\n' "$installer_dropin_directory/nested" > "$installer_mount_inventory"
if PATH="$nss_bin:$PATH" TEST_NSS_ATTESTATION=true TEST_PROC_ROOT="$nss_proc" \
  TEST_INSTALL_DESTINATION_MOUNT_INVENTORY_FILE="$installer_mount_inventory" \
  /usr/bin/bash -p "$installer" "${install_arguments[@]}" \
    > "$install_root/mounted-persistent-fence-directory.out" 2>&1; then
  printf 'installer accepted a nested persistent-fence mount\n' >&2
  exit 1
fi
if ! grep -F 'persistent-fence directory contains an exact/nested mount' \
  "$install_root/mounted-persistent-fence-directory.out" >/dev/null; then
  printf 'mounted persistent-fence rejection output:\n' >&2
  sed -n '1,80p' "$install_root/mounted-persistent-fence-directory.out" >&2
  exit 1
fi
rm -rf -- "$install_root/cutover/test-runtime-masks"
rm -f -- "$install_root/cutover/scheduler-free-control-install.preparing"
rmdir "$installer_dropin_directory"
mkdir -p "$install_root/cutover/test-runtime-masks"
printf '/dev/null\n' > "$install_root/cutover/test-runtime-masks/leetplus-api-rollback@.service"
if PATH="$nss_bin:$PATH" TEST_NSS_ATTESTATION=true TEST_PROC_ROOT="$nss_proc" \
  /usr/bin/bash -p "$installer" "${install_arguments[@]}" \
  > "$install_root/preexisting-runtime-mask.out" 2>&1; then
  printf 'installer accepted a pre-existing operator runtime mask as its own\n' >&2
  exit 1
fi
grep -F 'pre-existing runtime mask is not owned by this control-install operation' \
  "$install_root/preexisting-runtime-mask.out" >/dev/null
test ! -e "$install_root/cutover/scheduler-free-control-install.preparing"
test ! -e "$install_root/cutover/scheduler-free-control-install.fence"
test ! -e "$install_root/cutover/scheduler-free-control-install.intent"
rm -rf -- "$install_root/cutover/test-runtime-masks"
if PATH="$nss_bin:$PATH" TEST_NSS_ATTESTATION=true TEST_PROC_ROOT="$nss_proc" \
  TEST_NSS_VANISH_PID=true \
  TEST_INSTALL_FAIL_AFTER_FIRST_PERSISTENT_FENCE=true \
  /usr/bin/bash -p "$installer" "${install_arguments[@]}" \
  > "$install_root/mid-fence-reboot.out" 2>&1; then
  printf 'installer did not expose the mid-persistent-fence reboot boundary\n' >&2
  exit 1
fi
test ! -e "$install_root/cutover/scheduler-free-control-install.fence"
test ! -e "$install_root/cutover/scheduler-free-control-install.intent"
test -f "$install_root/cutover/scheduler-free-control-install.preparing"
test -d "$install_root/cutover/test-runtime-masks"
test ! -e "$install_root/libexec/legacy-rollback-auth-edge.mjs"
rm -rf -- "$install_root/cutover/test-runtime-masks"
if PATH="$nss_bin:$PATH" TEST_NSS_ATTESTATION=true TEST_PROC_ROOT="$nss_proc" \
  TEST_INSTALL_SIMULATE_UNIT_ACTIVE=true \
  /usr/bin/bash -p "$installer" "${install_arguments[@]}" \
  > "$install_root/mid-fence-reboot-active.out" 2>&1; then
  printf 'installer accepted a restarted old unit after a pre-commit mid-fence reboot\n' >&2
  exit 1
fi
test ! -e "$install_root/cutover/scheduler-free-control-install.fence"
test ! -e "$install_root/cutover/scheduler-free-control-install.intent"
test ! -e "$install_root/libexec/legacy-rollback-auth-edge.mjs"
if PATH="$nss_bin:$PATH" TEST_NSS_ATTESTATION=true TEST_PROC_ROOT="$nss_proc" \
  TEST_INSTALL_FAIL_AFTER_FENCE_SYNC=true \
  /usr/bin/bash -p "$installer" "${install_arguments[@]}" \
  > "$install_root/fence-record-reboot.out" 2>&1; then
  printf 'installer did not expose the post-fence-commit/pre-intent reboot boundary\n' >&2
  exit 1
fi
test -f "$install_root/cutover/scheduler-free-control-install.fence"
test ! -e "$install_root/cutover/scheduler-free-control-install.intent"
test -f "$install_root/cutover/scheduler-free-control-install.preparing"
test -d "$install_root/cutover/test-runtime-masks"
test ! -e "$install_root/libexec/legacy-rollback-auth-edge.mjs"
if PATH="$nss_bin:$PATH" TEST_NSS_ATTESTATION=true TEST_PROC_ROOT="$nss_proc" \
  TEST_INSTALL_FAIL_AFTER_INTENT_SYNC=true \
  /usr/bin/bash -p "$installer" "${install_arguments[@]}" \
  > "$install_root/intent-lost-response.out" 2>&1; then
  printf 'installer did not expose the post-intent-fsync failpoint\n' >&2
  exit 1
fi
if [[ ! -f "$install_root/cutover/scheduler-free-control-install.intent" ]]; then
  tail -n 200 "$install_root/intent-lost-response.out" >&2
  printf 'installer failed before publishing the durable control-install intent\n' >&2
  exit 1
fi
test ! -e "$install_root/libexec/legacy-rollback-auth-edge.mjs"
PATH="$nss_bin:$PATH" TEST_NSS_ATTESTATION=true TEST_PROC_ROOT="$nss_proc" \
  /usr/bin/bash -p "$installer" "${install_arguments[@]}" > "$install_root/first.out"
test ! -e "$install_root/cutover/scheduler-free-control-install.intent"
test ! -e "$install_root/cutover/scheduler-free-control-install.fence"
test ! -e "$install_root/cutover/scheduler-free-control-install.preparing"
test ! -e "$install_root/cutover/test-runtime-masks"
installed_digest_before="$(find "$install_root" -type f ! -name first.out -print0 \
  | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum | awk '{ print $1 }')"
if TEST_INSTALL_STALE_MANAGER=true /usr/bin/bash -p "$installer" "${install_arguments[@]}" \
  > "$install_root/stale-manager-no-drift.out" 2>&1; then
  printf 'zero-drift installer accepted a stale effective systemd generation\n' >&2
  exit 1
fi
grep -F 'effective loaded control generation is stale after daemon-reload' \
  "$install_root/stale-manager-no-drift.out" >/dev/null
rm -- "$install_root/stale-manager-no-drift.out"
/usr/bin/bash -p "$installer" "${install_arguments[@]}" > "$install_root/second.out"
installed_digest_after="$(find "$install_root" -type f ! -name first.out ! -name second.out -print0 \
  | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum | awk '{ print $1 }')"
[[ "$installed_digest_before" == "$installed_digest_after" ]] \
  || { printf 'install-only rerun changed installed control bytes\n' >&2; exit 1; }
test ! -e "$install_root/etc/leetplus/legacy-drain-database-target.conf"
test ! -e "$install_root/etc/leetplus/legacy-rollback-smoke.env"
cmp -s "$auth_edge" "$install_root/libexec/legacy-rollback-auth-edge.mjs" \
  || { printf 'installer did not install the exact rollback auth edge\n' >&2; exit 1; }
cmp -s "$child_preload" "$install_root/libexec/legacy-rollback-child-loopback.cjs" \
  || { printf 'installer did not install the exact rollback child loopback preload\n' >&2; exit 1; }
cmp -s "$database_authority_sql" "$install_root/libexec/legacy-database-login-fence-authority.sql" \
  || { printf 'installer did not install the exact rollback database authority SQL\n' >&2; exit 1; }
rm -- "$install_root/libexec/legacy-rollback-auth-edge.mjs"
if TEST_INSTALL_SIMULATE_UNIT_ACTIVE=true \
  /usr/bin/bash -p "$installer" "${install_arguments[@]}" \
  > "$install_root/active-unit.out" 2>&1; then
  printf 'installer mutated a drifting generation while a protected unit was active\n' >&2
  exit 1
fi
test ! -e "$install_root/libexec/legacy-rollback-auth-edge.mjs"
test ! -e "$install_root/cutover/scheduler-free-control-install.intent"
grep -F 'protected rollback unit is active' "$install_root/active-unit.out" >/dev/null
TEST_INSTALL_SIMULATE_RESTART_DURING_MUTATION=true \
  /usr/bin/bash -p "$installer" "${install_arguments[@]}" \
  > "$install_root/restart-fenced.out"
grep -F 'LEGACY_ROLLBACK_CONTROL_INSTALL_SIMULATED_RESTART_BLOCKED=true' \
  "$install_root/restart-fenced.out" >/dev/null
test ! -e "$install_root/cutover/scheduler-free-control-install.intent"
test ! -e "$install_root/cutover/scheduler-free-control-install.fence"
test ! -e "$install_root/cutover/scheduler-free-control-install.preparing"
test ! -e "$install_root/cutover/test-runtime-masks"
lost_response_destination="$install_root/libexec/legacy-rollback-auth-edge.mjs"
lost_response_marker="$install_root/lost-response.marker"
rm -- "$lost_response_destination"
if TEST_INSTALL_FAIL_AFTER_MV_DESTINATION="$lost_response_destination" \
  TEST_INSTALL_FAIL_AFTER_MV_MARKER="$lost_response_marker" \
  /usr/bin/bash -p "$installer" "${install_arguments[@]}" \
  > "$install_root/lost-response.out" 2>&1; then
  printf 'installer did not expose the post-rename/pre-fsync failpoint\n' >&2
  exit 1
fi
test -f "$lost_response_marker"
cmp -s "$auth_edge" "$lost_response_destination" \
  || { printf 'installer lost-response effect bytes are not exact\n' >&2; exit 1; }
test -f "$install_root/cutover/scheduler-free-control-install.intent"
test -f "$install_root/cutover/scheduler-free-control-install.preparing"
test -f "$install_root/cutover/scheduler-free-control-install.fence"
test -d "$install_root/cutover/test-runtime-masks"
for protected_unit in \
  'leetplus-api-rollback@.service' \
  "leetplus-api-rollback@${LEGACY_SHA}.service" \
  'leetplus-web-rollback@.service' \
  "leetplus-web-rollback@${LEGACY_SHA}.service" \
  leetplus-rollback-egress.service \
  leetplus-blue-green-recovery.service \
  leetplus-blue-green-recovery-watchdog.service \
  leetplus-blue-green-recovery.timer; do
  test -f "$install_root/cutover/test-runtime-masks/$protected_unit"
  test -f "$install_root/systemd/$protected_unit.d/90-leetplus-control-install-fence.conf"
done
/usr/bin/bash -p "$installer" "${install_arguments[@]}" > "$install_root/lost-response-retry.out"
cmp -s "$auth_edge" "$lost_response_destination" \
  || { printf 'installer did not reconcile a matching post-rename effect\n' >&2; exit 1; }
test ! -e "$install_root/cutover/scheduler-free-control-install.intent"
test ! -e "$install_root/cutover/scheduler-free-control-install.fence"
test ! -e "$install_root/cutover/scheduler-free-control-install.preparing"
test ! -e "$install_root/cutover/test-runtime-masks"
for nss_drift in UID GID; do
  if PATH="$nss_bin:$PATH" TEST_NSS_ATTESTATION=true TEST_PROC_ROOT="$nss_proc" \
    /usr/bin/env "TEST_NSS_DUPLICATE_${nss_drift}=true" \
      /usr/bin/bash -p "$installer" "${install_arguments[@]}" \
    > "$install_root/duplicate-${nss_drift}.out" 2>&1; then
    printf 'installer accepted a duplicate rollback NSS %s alias\n' "$nss_drift" >&2
    exit 1
  fi
done
grep -F 'UID is not uniquely bound' "$install_root/duplicate-UID.out" >/dev/null
grep -F 'supplementary group GID/member contract is not exact' "$install_root/duplicate-GID.out" >/dev/null
fi

# Database target identity is checked by the server inside the same transaction
# before the only ALTER statement. A wrong target aborts the psql operation;
# no client-side post-commit comparison is relied upon for mutation safety.
fence_test_root="$TEST_ROOT/database-fence"
mkdir -p "$fence_test_root/bin"
printf '[fixture]\n' > "$fence_test_root/pg_service.conf"
cat > "$fence_test_root/database-target.conf" <<'FENCE_TARGET'
DATABASE_NAME=leetplus
DATABASE_SERVER_ADDRESS=127.0.0.1
DATABASE_SERVER_PORT=5432
DATABASE_SYSTEM_IDENTIFIER=1234567890123456789
AUDIT_SESSION_USER=leetplus_drain_audit
FENCE_SESSION_USER=leetplus_role_fencer
FENCE_AUTHORITY_ROLE=leetplus_fence_authority
FENCE_FUNCTION_SCHEMA=leetplus_ops
FENCE_FUNCTION_NAME=apply_nminus1_legacy_login_fence
FENCE_TARGET
cat > "$fence_test_root/bin/psql" <<'FENCE_PSQL'
#!/usr/bin/env bash
set -euo pipefail
cat > "${TEST_FENCE_SQL_LOG:?}"
[[ "${TEST_FENCE_WRONG_TARGET:-false}" != true ]] || exit 42
[[ "${TEST_FENCE_EXTRA_MEMBER:-false}" != true ]] || exit 43
printf 'leetplus|127.0.0.1|5432|1234567890123456789|leetplus_role_fencer|true\n'
FENCE_PSQL
chmod 0700 "$fence_test_root/bin/psql"
PATH="$fence_test_root/bin:$PATH" TEST_FENCE_SQL_LOG="$fence_test_root/fence.sql" \
  /usr/bin/bash -p "$database_fence" --pg-service-file "$fence_test_root/pg_service.conf" \
    --pg-service fixture --database-target "$fence_test_root/database-target.conf" \
    --unprivileged-test-mode > "$fence_test_root/accepted.out"
cat > "$fence_test_root/expected-accepted.out" <<'FENCE_ACCEPTED'
LEGACY_DATABASE_LOGIN_FENCE_ACCEPTED=true
LEGACY_DATABASE_LOGIN_ROLE=leetplus
LEGACY_DATABASE_LOGIN_FENCE_AUTHORITY=leetplus_fence_authority
FENCE_ACCEPTED
cmp -s "$fence_test_root/expected-accepted.out" "$fence_test_root/accepted.out" \
  || { printf 'database fence helper output contract is not exact\n' >&2; exit 1; }
precondition_line="$(grep -n -m1 'SELECT 1 / CASE WHEN (' "$fence_test_root/fence.sql" | cut -d: -f1)"
function_call_line="$(grep -n -m1 '^SELECT leetplus_ops.apply_nminus1_legacy_login_fence(' "$fence_test_root/fence.sql" | cut -d: -f1)"
commit_line="$(grep -n -m1 '^COMMIT;' "$fence_test_root/fence.sql" | cut -d: -f1)"
[[ "$precondition_line" =~ ^[1-9][0-9]*$ && "$function_call_line" =~ ^[1-9][0-9]*$ \
  && "$commit_line" =~ ^[1-9][0-9]*$ && precondition_line -lt function_call_line \
  && function_call_line -lt commit_line ]] \
  || { printf 'database fence SQL does not order source-pinned precondition -> definer call -> COMMIT\n' >&2; exit 1; }
grep -F "fn.prosrc = \$leetplus_expected_source\$" "$fence_test_root/fence.sql" >/dev/null
if PATH="$fence_test_root/bin:$PATH" TEST_FENCE_SQL_LOG="$fence_test_root/wrong-target.sql" \
  TEST_FENCE_WRONG_TARGET=true \
  /usr/bin/bash -p "$database_fence" --pg-service-file "$fence_test_root/pg_service.conf" \
    --pg-service fixture --database-target "$fence_test_root/database-target.conf" \
    --unprivileged-test-mode > "$fence_test_root/wrong-target.out" 2>&1; then
  printf 'database fence accepted a wrong production target\n' >&2
  exit 1
fi
grep -F 'database login fence transaction failed or timed out' "$fence_test_root/wrong-target.out" >/dev/null
if PATH="$fence_test_root/bin:$PATH" TEST_FENCE_SQL_LOG="$fence_test_root/extra-member.sql" \
  TEST_FENCE_EXTRA_MEMBER=true \
  /usr/bin/bash -p "$database_fence" --pg-service-file "$fence_test_root/pg_service.conf" \
    --pg-service fixture --database-target "$fence_test_root/database-target.conf" \
    --unprivileged-test-mode > "$fence_test_root/extra-member.out" 2>&1; then
  printf 'database fence accepted an extra reverse role member\n' >&2
  exit 1
fi
grep -F 'database login fence transaction failed or timed out' "$fence_test_root/extra-member.out" >/dev/null

# Exact-table verification rejects an earlier unconditional accept even when
# every required UID/global rule remains present.
egress_bin="$TEST_ROOT/egress-bin"
mkdir -p "$egress_bin"
cat > "$egress_bin/nft" <<'NFT_STUB'
#!/usr/bin/env bash
set -euo pipefail
cat <<'RULES'
table inet leetplus_nminus1 {
  chain output {
    type filter hook output priority 0; policy accept;
RULES
if [[ "${TEST_EGRESS_EXTRA_ACCEPT:-false}" == true ]]; then
  printf '    accept\n'
fi
cat <<'RULES'
    meta skuid 12345 ct state 0x2,0x4 accept
    meta skuid 12345 ip daddr 127.0.0.1 tcp dport 5432 ct state 0x8 accept
    meta skuid 12345 ip daddr 127.0.0.1 tcp dport 4301 ct state 0x8 accept
    ip daddr 127.0.0.1 tcp dport 4301 reject with icmp 3
    meta skuid 12345 reject
    meta skuid 12346 ct state 0x2,0x4 accept
    meta skuid 12346 ip daddr 127.0.0.1 tcp dport 4300 ct state 0x8 accept
    meta skuid 12346 reject
  }
}
RULES
NFT_STUB
chmod 0700 "$egress_bin/nft"
PATH="$egress_bin:$PATH" /usr/bin/bash -p "$egress_script" --verify --unprivileged-test-mode \
  --api-uid 12345 --web-uid 12346 > "$TEST_ROOT/egress.out"
if PATH="$egress_bin:$PATH" TEST_EGRESS_EXTRA_ACCEPT=true \
  /usr/bin/bash -p "$egress_script" --verify --unprivileged-test-mode \
    --api-uid 12345 --web-uid 12346 > "$TEST_ROOT/egress-extra.out" 2>&1; then
  printf 'egress verifier accepted an extra unconditional rule\n' >&2
  exit 1
fi

# Git for Windows may emulate `ln -s` as a regular file when native symlink
# creation is unavailable. Static/preflight coverage still runs locally; the
# route/drain behavioral matrix remains mandatory on the Linux Fast CI runner.
printf 'symlink-target\n' > "$TEST_ROOT/symlink-target"
ln -s "$TEST_ROOT/symlink-target" "$TEST_ROOT/symlink-probe"
if [[ ! -L "$TEST_ROOT/symlink-probe" ]]; then
  printf 'LEGACY_ROLLBACK_BEHAVIORAL_FIXTURE_SKIPPED_NO_NATIVE_SYMLINK=true\n'
  printf 'production legacy scheduler-free rollback contour test: PASS\n'
  exit 0
fi
rm -f -- "$TEST_ROOT/symlink-probe" "$TEST_ROOT/symlink-target"

bin_root="${TEST_ROOT}/bin"
mkdir -p "$bin_root"
activation_drain_verifier="$bin_root/verify-legacy-runtime-drain.sh"
cp "$drain_verifier" "$activation_drain_verifier"
real_find="$(command -v find)"
export TEST_REAL_FIND="$real_find"

cat > "$bin_root/find" <<'FIND'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == *'cgroup.procs'* ]]; then
  if [[ "${TEST_FIND_FAIL_CGROUP:-false}" == true \
    || ("${TEST_FIND_FAIL_AFTER_FENCE:-false}" == true \
      && -f "${TEST_STATE_ROOT:?}/legacy-start-fence") ]]; then
    exit 92
  fi
fi
exec "${TEST_REAL_FIND:?}" "$@"
FIND

cat > "$bin_root/systemctl" <<'SYSTEMCTL'
#!/usr/bin/env bash
set -euo pipefail
command_name="${1:-}"
shift || true
printf 'systemctl %s %s\n' "$command_name" "$*" >> "${TEST_COMMAND_LOG:?}"
sanitize() { tr '@.-' '___' <<< "$1" | tr -d '\r\n'; }
unit="${!#:-}"
state_key="$(sanitize "$unit")"
case "$command_name" in
  list-unit-files)
    [[ "${TEST_SYSTEMCTL_HANG:-false}" != true ]] || { sleep 30; exit 0; }
    printf '%s enabled\n' \
      leetplus-api.service leetplus-web.service leetplus-deploy.timer \
      leetplus-rollback-egress.service \
      leetplus-api-rollback@7de04ff4ccc814494810730be3fa6bf661097b07.service \
      leetplus-web-rollback@7de04ff4ccc814494810730be3fa6bf661097b07.service
    if [[ "${TEST_UNKNOWN_UNIT:-false}" == true ]]; then
      printf 'leetplus-unknown-scheduler.timer enabled\n'
    fi
    ;;
  list-units)
    printf '%s loaded active running fixture\n' \
      leetplus-api.service leetplus-web.service leetplus-deploy.timer \
      leetplus-rollback-egress.service \
      leetplus-api-rollback@7de04ff4ccc814494810730be3fa6bf661097b07.service \
      leetplus-web-rollback@7de04ff4ccc814494810730be3fa6bf661097b07.service
    if [[ "${TEST_UNKNOWN_LOADED_UNIT:-false}" == true ]]; then
      printf 'leetplus-transient-scheduler.service loaded active running fixture\n'
    fi
    ;;
  show)
    property="${1#--property=}"
    case "$property" in
      LoadState) printf 'loaded\n' ;;
      MainPID)
        if [[ "$unit" == 'nginx.service' ]]; then
          printf '5000\n'
        elif [[ "$unit" == 'leetplus-api.service' && -f "${TEST_STATE_ROOT}/active-${state_key}" ]]; then
          printf '4242\n'
        else
          printf '0\n'
        fi
        ;;
      ControlPID|ExecMainPID) printf '0\n' ;;
      ControlGroup)
        case "$unit" in
          leetplus-api.service) printf '/legacy-api\n' ;;
          leetplus-web.service) printf '/legacy-web\n' ;;
          leetplus-deploy.timer) printf '/legacy-deploy\n' ;;
          *) printf '\n' ;;
        esac
        ;;
      DropInPaths)
        if [[ "$unit" == 'nginx.service' ]]; then
          printf '%s/nginx.service.d/leetplus-blue-green-recovery.conf\n' "${TEST_SYSTEMD_ROOT:?}"
        elif [[ "$unit" == leetplus-api.service || "$unit" == leetplus-web.service \
          || "$unit" == leetplus-deploy.timer || "$unit" == leetplus-deploy.service \
          || "$unit" == leetplus-guest-game-bot-consumer.timer \
          || "$unit" == leetplus-guest-game-bot-consumer.service ]]; then
          printf '%s/%s.d/90-leetplus-nminus1-start-fence.conf\n' "${TEST_SYSTEMD_ROOT:?}" "$unit"
        else
          printf '\n'
        fi
        ;;
      NeedDaemonReload) printf 'no\n' ;;
      *) printf '\n' ;;
    esac
    ;;
  is-active)
    [[ "$unit" == 'leetplus-rollback-egress.service' ]] && exit 0
    [[ "$unit" == 'leetplus-blue-green-recovery.timer' ]] && exit 0
    [[ "$unit" == leetplus-*-rollback@* ]] && exit 0
    test -f "${TEST_STATE_ROOT}/active-${state_key}"
    ;;
  is-enabled)
    [[ "$unit" == 'leetplus-rollback-egress.service' ]] && exit 0
    [[ "$unit" == 'leetplus-blue-green-recovery.service' || "$unit" == 'leetplus-blue-green-recovery.timer' ]] && exit 0
    [[ "$unit" == leetplus-*-rollback@* ]] && exit 0
    test -f "${TEST_STATE_ROOT}/enabled-${state_key}"
    ;;
  disable)
    rm -f -- "${TEST_STATE_ROOT}/active-${state_key}" "${TEST_STATE_ROOT}/enabled-${state_key}"
    if [[ "$unit" == 'leetplus-api.service' ]]; then
      rm -f -- "${TEST_PROC_ROOT}/4242/stat"
      : > "${TEST_CGROUP_ROOT}/legacy-api/cgroup.procs"
    fi
    ;;
  reload)
    [[ "$unit" != 'nginx.service' ]] || rm -f -- "${TEST_PROC_ROOT:?}/5001/stat"
    exit 0
    ;;
  daemon-reload) exit 0 ;;
  start)
    dropin="${TEST_SYSTEMD_ROOT:?}/${unit}.d/90-leetplus-nminus1-start-fence.conf"
    if [[ -f "${TEST_STATE_ROOT:?}/legacy-start-fence" && -f "$dropin" ]]; then
      exit 1
    fi
    : > "${TEST_STATE_ROOT}/active-${state_key}"
    ;;
  *) printf 'unexpected systemctl command: %s\n' "$command_name" >&2; exit 91 ;;
esac
SYSTEMCTL

cat > "$bin_root/nginx" <<'NGINX'
#!/usr/bin/env bash
set -euo pipefail
[[ "$*" == '-t' ]]
NGINX

cat > "$bin_root/curl" <<'CURL'
#!/usr/bin/env bash
set -euo pipefail
printf '200'
CURL

cat > "$bin_root/psql" <<'PSQL'
#!/usr/bin/env bash
set -euo pipefail
cat >/dev/null
[[ "${TEST_PSQL_HANG:-false}" != true ]] || { sleep 30; exit 0; }
if [[ "${TEST_DB_DIRTY:-false}" == true ]]; then
  printf '1|1|0|0|1|1|1|2|0|0|1|1|1|1|0|0|1|leetplus|127.0.0.1|5432|1234567890123456789|leetplus_drain_audit\n'
elif [[ "${TEST_DB_IDENTITY_WRONG:-false}" == true ]]; then
  printf '0|0|0|0|1|1|1|2|0|0|1|1|1|1|0|0|1|leetplus|127.0.0.1|5432|9999999999999999999|leetplus_drain_audit\n'
elif [[ "${TEST_DB_EXTRA_MEMBER:-false}" == true ]]; then
  printf '0|0|0|0|1|1|1|3|1|1|1|1|1|1|0|0|1|leetplus|127.0.0.1|5432|1234567890123456789|leetplus_drain_audit\n'
else
  printf '0|0|0|0|1|1|1|2|0|0|1|1|1|1|0|0|1|leetplus|127.0.0.1|5432|1234567890123456789|leetplus_drain_audit\n'
fi
PSQL

cat > "$bin_root/database-fence" <<'DATABASE_FENCE'
#!/usr/bin/env bash
set -euo pipefail
printf 'database-fence %s\n' "$*" >> "${TEST_COMMAND_LOG:?}"
fence_effect_marker="${TEST_STATE_ROOT:?}/database-fence-effect-applied.fixture"
if [[ "${TEST_DATABASE_FENCE_LOST_RESPONSE_ONCE:-false}" == true && ! -f "$fence_effect_marker" ]]; then
  : > "$fence_effect_marker"
  exit 86
fi
if [[ "${TEST_DATABASE_FENCE_STALE_TWO_LINE_OUTPUT:-false}" == true ]]; then
  printf 'LEGACY_DATABASE_LOGIN_FENCE_ACCEPTED=true\n'
  printf 'LEGACY_DATABASE_LOGIN_ROLE=leetplus\n'
  exit 0
fi
printf 'LEGACY_DATABASE_LOGIN_FENCE_ACCEPTED=true\n'
printf 'LEGACY_DATABASE_LOGIN_ROLE=leetplus\n'
printf 'LEGACY_DATABASE_LOGIN_FENCE_AUTHORITY=leetplus_fence_authority\n'
DATABASE_FENCE

cat > "$bin_root/rollback-probe" <<'PROBE'
#!/usr/bin/env bash
set -euo pipefail
printf 'rollback-probe %s\n' "$*" >> "${TEST_COMMAND_LOG:?}"
[[ "${TEST_AUTH_SMOKE_FAIL:-false}" != true ]] || exit 1
if [[ -n "${TEST_TAMPER_TARGET:-}" ]]; then
  printf 'tampered-after-first-attestation\n' >> "$TEST_TAMPER_TARGET"
fi
printf 'LEGACY_ROLLBACK_READY=true\n'
PROBE

cat > "$bin_root/ss" <<'SS'
#!/usr/bin/env bash
set -euo pipefail
[[ "${TEST_SS_HANG:-false}" != true ]] || { sleep 30; exit 0; }
if [[ "${TEST_CONNECTION_DIRTY:-false}" == true ]]; then
  printf 'ESTAB 0 0 127.0.0.1:4000 127.0.0.1:53000\n'
fi
SS

cat > "$bin_root/pgrep" <<'PGREP'
#!/usr/bin/env bash
set -euo pipefail
if [[ -f "${TEST_PROC_ROOT:?}/5001/stat" ]]; then
  printf '5001\n'
  exit 0
fi
exit 1
PGREP

for command_name in mount unshare; do
  cat > "$bin_root/$command_name" <<'STUB'
#!/usr/bin/env bash
exit 0
STUB
done
chmod 0700 "$bin_root"/*

reset_fixture() {
  local fixture_root="$1"
  rm -rf -- "$fixture_root"
  mkdir -p \
    "$fixture_root/config/upstreams" "$fixture_root/state" \
    "$fixture_root/deployment-state" \
    "$fixture_root/systemd/nginx.service.d" \
    "$fixture_root/cgroup/legacy-api" "$fixture_root/cgroup/legacy-web" "$fixture_root/cgroup/legacy-deploy" \
    "$fixture_root/proc/4242" "$fixture_root/proc/5001"
  printf 'legacy\n' > "$fixture_root/config/upstreams/legacy.conf"
  cp "$DEPLOY_ROOT/nginx/legacy-safe.conf.example" "$fixture_root/config/upstreams/legacy-safe.conf"
  cat > "$fixture_root/systemd/nginx.service.d/leetplus-blue-green-recovery.conf" <<'RECOVERY_DROPIN'
[Unit]
Requires=leetplus-blue-green-recovery.service
After=leetplus-blue-green-recovery.service

# nginx may not start/reload a boot-persistent candidate link until outstanding
# pre-effect intent recovery has restored and syntax-checked the exact N-1 link.
RECOVERY_DROPIN
  ln -s "$fixture_root/config/upstreams/legacy.conf" "$fixture_root/config/active-upstreams.conf"
  cat > "$fixture_root/units.conf" <<'UNITS'
REQUIRED_DRAIN leetplus-api.service
REQUIRED_DRAIN leetplus-web.service
REQUIRED_DRAIN leetplus-deploy.timer
OPTIONAL_DRAIN leetplus-deploy.service
OPTIONAL_DRAIN leetplus-guest-game-bot-consumer.timer
OPTIONAL_DRAIN leetplus-guest-game-bot-consumer.service
SAFE leetplus-api-rollback@7de04ff4ccc814494810730be3fa6bf661097b07.service
SAFE leetplus-web-rollback@7de04ff4ccc814494810730be3fa6bf661097b07.service
SAFE leetplus-rollback-egress.service
UNITS
  printf '[leetplus-drain-audit]\n' > "$fixture_root/pg_service.conf"
  cat > "$fixture_root/database-target.conf" <<'TARGET'
DATABASE_NAME=leetplus
DATABASE_SERVER_ADDRESS=127.0.0.1
DATABASE_SERVER_PORT=5432
DATABASE_SYSTEM_IDENTIFIER=1234567890123456789
AUDIT_SESSION_USER=leetplus_drain_audit
FENCE_SESSION_USER=leetplus_role_fencer
FENCE_AUTHORITY_ROLE=leetplus_fence_authority
FENCE_FUNCTION_SCHEMA=leetplus_ops
FENCE_FUNCTION_NAME=apply_nminus1_legacy_login_fence
TARGET
  printf '4242 (legacy api) S 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 999\n' > "$fixture_root/proc/4242/stat"
  printf '5001 (nginx worker) S 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 888\n' > "$fixture_root/proc/5001/stat"
  printf '4242\n' > "$fixture_root/cgroup/legacy-api/cgroup.procs"
  : > "$fixture_root/cgroup/legacy-web/cgroup.procs"
  : > "$fixture_root/cgroup/legacy-deploy/cgroup.procs"
  for unit in leetplus-api.service leetplus-web.service leetplus-deploy.timer; do
    key="$(tr '@.-' '___' <<< "$unit" | tr -d '\r\n')"
    : > "$fixture_root/state/active-${key}"
    : > "$fixture_root/state/enabled-${key}"
  done
}

run_activation() {
  local fixture_root="$1"
  shift
  local verifier_arguments=(
    --unit-manifest "$fixture_root/units.conf"
    --process-snapshot "$fixture_root/state/legacy-processes.snapshot"
    --pg-service-file "$fixture_root/pg_service.conf"
    --pg-service fixture
    --database-target "$fixture_root/database-target.conf"
    --fence-marker "$fixture_root/state/legacy-start-fence"
    --systemd-root "$fixture_root/systemd"
    --cgroup-root "$fixture_root/cgroup"
    --proc-root "$fixture_root/proc"
    --settle-seconds 1
    --clean-samples 1
    --command-timeout-seconds 1
    --psql-timeout-seconds 1
    --unprivileged-test-mode
  )
  local arguments=(
    --config-root "$fixture_root/config"
    --state-root "$fixture_root/state"
    --deployment-state-root "$fixture_root/deployment-state"
    --systemd-root "$fixture_root/systemd"
    --unit-manifest "$fixture_root/units.conf"
    --cgroup-root "$fixture_root/cgroup"
    --proc-root "$fixture_root/proc"
    --rollback-probe "$bin_root/rollback-probe"
    --drain-verifier "$activation_drain_verifier"
    --database-fence "$bin_root/database-fence"
    --public-api-url https://api.example.test
    --public-web-url https://web.example.test
    --watchdog-seconds 5
    --connection-drain-seconds 1
    --connection-clean-samples 1
    --unprivileged-test-mode
  )
  if [[ -n "${TEST_FAULT_AFTER:-}" ]]; then
    arguments+=(--fault-after "$TEST_FAULT_AFTER")
  fi
  for argument in "${verifier_arguments[@]}"; do
    arguments+=(--drain-verifier-argument "$argument")
  done
  arguments+=(
    --database-fence-argument --unprivileged-test-mode
  )
  PATH="$bin_root:$PATH" \
    TEST_COMMAND_LOG="$fixture_root/commands.log" \
    TEST_STATE_ROOT="$fixture_root/state" \
    TEST_PROC_ROOT="$fixture_root/proc" \
    TEST_CGROUP_ROOT="$fixture_root/cgroup" \
    TEST_SYSTEMD_ROOT="$fixture_root/systemd" \
    "$@" /usr/bin/bash -p "$activator" "${arguments[@]}"
}

symlink_lock_root="${TEST_ROOT}/activation-symlink-lock"
reset_fixture "$symlink_lock_root"
printf 'do-not-touch\n' > "$symlink_lock_root/lock-sentinel"
ln -s "$symlink_lock_root/lock-sentinel" "$symlink_lock_root/deployment-state/cutover.lock"
if run_activation "$symlink_lock_root" env > "$symlink_lock_root/activation.out" 2>&1; then
  printf 'activation accepted a symlinked shared cutover lock\n' >&2
  exit 1
fi
grep -F -x 'do-not-touch' "$symlink_lock_root/lock-sentinel" >/dev/null

hardlink_lock_root="${TEST_ROOT}/activation-hardlink-lock"
reset_fixture "$hardlink_lock_root"
printf 'do-not-touch\n' > "$hardlink_lock_root/lock-sentinel"
ln "$hardlink_lock_root/lock-sentinel" "$hardlink_lock_root/state/activation.lock"
if run_activation "$hardlink_lock_root" env > "$hardlink_lock_root/activation.out" 2>&1; then
  printf 'activation accepted a hard-linked private activation lock\n' >&2
  exit 1
fi
grep -F -x 'do-not-touch' "$hardlink_lock_root/lock-sentinel" >/dev/null

symlink_dropin_root="${TEST_ROOT}/activation-symlink-dropin"
reset_fixture "$symlink_dropin_root"
mkdir -p "$symlink_dropin_root/outside-dropin"
ln -s "$symlink_dropin_root/outside-dropin" "$symlink_dropin_root/systemd/leetplus-api.service.d"
if run_activation "$symlink_dropin_root" env > "$symlink_dropin_root/activation.out" 2>&1; then
  printf 'activation accepted a symlinked start-fence drop-in directory\n' >&2
  exit 1
fi
if ! grep -F 'legacy unit drop-in directory is symlinked: leetplus-api.service' \
  "$symlink_dropin_root/activation.out" >/dev/null; then
  printf 'symlinked start-fence rejection output:\n' >&2
  sed -n '1,80p' "$symlink_dropin_root/activation.out" >&2
  exit 1
fi
test -z "$(find "$symlink_dropin_root/outside-dropin" -mindepth 1 -print -quit)"

writable_dropin_root="${TEST_ROOT}/activation-writable-dropin"
reset_fixture "$writable_dropin_root"
mkdir -p "$writable_dropin_root/systemd/leetplus-api.service.d"
chmod 0777 "$writable_dropin_root/systemd/leetplus-api.service.d"
if run_activation "$writable_dropin_root" env > "$writable_dropin_root/activation.out" 2>&1; then
  printf 'activation accepted a writable start-fence drop-in directory\n' >&2
  exit 1
fi
if ! grep -F 'legacy start-fence drop-in directory authority is unsafe' \
  "$writable_dropin_root/activation.out" >/dev/null; then
  printf 'writable start-fence rejection output:\n' >&2
  sed -n '1,80p' "$writable_dropin_root/activation.out" >&2
  exit 1
fi

mounted_dropin_root="${TEST_ROOT}/activation-mounted-dropin"
reset_fixture "$mounted_dropin_root"
mkdir -p "$mounted_dropin_root/systemd/leetplus-api.service.d"
printf '%s\n' "$mounted_dropin_root/systemd/leetplus-api.service.d/nested" \
  > "$mounted_dropin_root/mounts"
if run_activation "$mounted_dropin_root" env \
  TEST_ACTIVATION_MOUNT_INVENTORY_FILE="$mounted_dropin_root/mounts" \
  > "$mounted_dropin_root/activation.out" 2>&1; then
  printf 'activation accepted a nested start-fence mount\n' >&2
  exit 1
fi
if ! grep -F 'legacy start-fence directory contains an exact/nested mount' \
  "$mounted_dropin_root/activation.out" >/dev/null; then
  printf 'mounted start-fence rejection output:\n' >&2
  sed -n '1,80p' "$mounted_dropin_root/activation.out" >&2
  exit 1
fi
! grep -F 'dropin_path}.new.$$' "$activator" >/dev/null

success_root="${TEST_ROOT}/activation-success"
reset_fixture "$success_root"
run_activation "$success_root" env > "$success_root/activation.out"
test "$(realpath -e -- "$success_root/config/active-upstreams.conf")" = "$success_root/config/upstreams/legacy-safe.conf"
test -f "$success_root/state/activation.receipt"
test -f "$success_root/state/activation.intent"
test -f "$success_root/state/legacy-start-fence"
test -f "$success_root/state/legacy-database-login-fence.marker"
grep -F -x 'LEGACY_RUNTIME_DRAIN_ACCEPTED=true' "$success_root/state/activation.receipt" >/dev/null
grep -F 'systemctl disable --now leetplus-api.service' "$success_root/commands.log" >/dev/null
grep -F 'systemctl disable --now leetplus-deploy.timer' "$success_root/commands.log" >/dev/null
for absent_optional_unit in \
  leetplus-deploy.service \
  leetplus-guest-game-bot-consumer.timer \
  leetplus-guest-game-bot-consumer.service; do
  test -f "$success_root/systemd/$absent_optional_unit.d/90-leetplus-nminus1-start-fence.conf"
  if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$success_root/commands.log" \
    TEST_STATE_ROOT="$success_root/state" TEST_SYSTEMD_ROOT="$success_root/systemd" \
    TEST_PROC_ROOT="$success_root/proc" TEST_CGROUP_ROOT="$success_root/cgroup" \
    systemctl start "$absent_optional_unit"; then
    printf 'an optional unit installed after cutover bypassed its durable start fence: %s\n' \
      "$absent_optional_unit" >&2
    exit 1
  fi
done
if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$success_root/commands.log" \
  TEST_STATE_ROOT="$success_root/state" TEST_SYSTEMD_ROOT="$success_root/systemd" \
  TEST_PROC_ROOT="$success_root/proc" TEST_CGROUP_ROOT="$success_root/cgroup" \
  systemctl start leetplus-api.service; then
  printf 'durably fenced legacy unit was manually startable\n' >&2
  exit 1
fi

# An unknown installed LeetPlus unit blocks before any route or stop effect.
unknown_root="${TEST_ROOT}/activation-unknown"
reset_fixture "$unknown_root"
if run_activation "$unknown_root" env TEST_UNKNOWN_UNIT=true > "$unknown_root/activation.out" 2>&1; then
  printf 'activation accepted an unclassified unit\n' >&2
  exit 1
fi
test "$(realpath -e -- "$unknown_root/config/active-upstreams.conf")" = "$unknown_root/config/upstreams/legacy.conf"
test ! -e "$unknown_root/state/activation.intent"

# A loaded/generated transient unit is part of the same closed inventory.
loaded_unknown_root="${TEST_ROOT}/activation-loaded-unknown"
reset_fixture "$loaded_unknown_root"
if run_activation "$loaded_unknown_root" env TEST_UNKNOWN_LOADED_UNIT=true > "$loaded_unknown_root/activation.out" 2>&1; then
  printf 'activation accepted an unclassified loaded/transient unit\n' >&2
  exit 1
fi
test "$(realpath -e -- "$loaded_unknown_root/config/active-upstreams.conf")" = "$loaded_unknown_root/config/upstreams/legacy.conf"

# Cgroup PID evidence is accepted only after the bounded producer exits
# successfully. Partial/failed output cannot omit a legacy process before the
# durable intent, or turn a failed post-fence drain into a clean sample.
cgroup_find_fail_root="${TEST_ROOT}/activation-cgroup-find-fail"
reset_fixture "$cgroup_find_fail_root"
if run_activation "$cgroup_find_fail_root" env TEST_FIND_FAIL_CGROUP=true \
  > "$cgroup_find_fail_root/activation.out" 2>&1; then
  printf 'activation accepted a failed cgroup PID producer\n' >&2
  exit 1
fi
grep -F 'cgroup PID inventory failed or returned partial output' \
  "$cgroup_find_fail_root/activation.out" >/dev/null
test "$(realpath -e -- "$cgroup_find_fail_root/config/active-upstreams.conf")" \
  = "$cgroup_find_fail_root/config/upstreams/legacy.conf"
test ! -e "$cgroup_find_fail_root/state/activation.intent"

drain_find_fail_root="${TEST_ROOT}/activation-drain-find-fail"
reset_fixture "$drain_find_fail_root"
if run_activation "$drain_find_fail_root" env TEST_FIND_FAIL_AFTER_FENCE=true \
  > "$drain_find_fail_root/activation.out" 2>&1; then
  printf 'activation accepted a failed post-fence cgroup drain producer\n' >&2
  exit 1
fi
grep -F 'bounded settling expired before units/processes/database sessions were all clean' \
  "$drain_find_fail_root/activation.out" >/dev/null
test "$(realpath -e -- "$drain_find_fail_root/config/active-upstreams.conf")" \
  = "$drain_find_fail_root/config/upstreams/legacy-safe.conf"
test ! -e "$drain_find_fail_root/state/activation.receipt"

# Operational inputs are re-attested after acquiring the shared deployment
# lock and again before route/helper effects. Writable ancestry, multiply-linked
# bytes and a deterministic between-attestations replacement all fail before
# the legacy route is changed.
writable_root="${TEST_ROOT}/activation-writable-parent"
reset_fixture "$writable_root"
chmod 0777 "$writable_root/config"
if run_activation "$writable_root" env > "$writable_root/activation.out" 2>&1; then
  printf 'activation accepted a group/other-writable nginx parent\n' >&2
  exit 1
fi
grep -F 'operational directory is symlinked or group/other-writable' "$writable_root/activation.out" >/dev/null
test ! -e "$writable_root/state/activation.intent"

hardlink_root="${TEST_ROOT}/activation-hardlinked-target"
reset_fixture "$hardlink_root"
rm -- "$hardlink_root/config/upstreams/legacy-safe.conf"
ln "$hardlink_root/config/upstreams/legacy.conf" "$hardlink_root/config/upstreams/legacy-safe.conf"
if run_activation "$hardlink_root" env > "$hardlink_root/activation.out" 2>&1; then
  printf 'activation accepted a multiply-linked nginx target\n' >&2
  exit 1
fi
grep -F 'operational file is not canonical/nonwritable/single-linked' "$hardlink_root/activation.out" >/dev/null
test ! -e "$hardlink_root/state/activation.intent"

toctou_root="${TEST_ROOT}/activation-toctou"
reset_fixture "$toctou_root"
if run_activation "$toctou_root" env \
  TEST_TAMPER_TARGET="$toctou_root/config/upstreams/legacy-safe.conf" \
  > "$toctou_root/activation.out" 2>&1; then
  printf 'activation accepted an operational target changed between attestations\n' >&2
  exit 1
fi
grep -F 'operational file changed during activation' "$toctou_root/activation.out" >/dev/null
test "$(realpath -e -- "$toctou_root/config/active-upstreams.conf")" = "$toctou_root/config/upstreams/legacy.conf"

# The scheduler-free activator and normal blue/green cutover share the exact
# deployment lock. A holder representing either operator blocks the other
# before intent or routing effects.
shared_lock_root="${TEST_ROOT}/activation-shared-lock"
reset_fixture "$shared_lock_root"
exec 7> "$shared_lock_root/deployment-state/cutover.lock"
chmod 0600 "$shared_lock_root/deployment-state/cutover.lock"
flock -n 7
if run_activation "$shared_lock_root" env > "$shared_lock_root/held-lock.out" 2>&1; then
  printf 'activation ignored an existing blue/green deployment lock\n' >&2
  exit 1
fi
grep -F 'another blue/green or scheduler-free activation holds the deployment lock' "$shared_lock_root/held-lock.out" >/dev/null
test ! -e "$shared_lock_root/state/activation.intent"
flock -u 7
exec 7>&-

reverse_lock_root="${TEST_ROOT}/activation-reverse-shared-lock"
reset_fixture "$reverse_lock_root"
run_activation "$reverse_lock_root" env TEST_SYSTEMCTL_HANG=true \
  > "$reverse_lock_root/activation.out" 2>&1 &
activation_pid=$!
for _ in 1 2 3 4 5 6 7 8 9 10; do
  [[ -s "$reverse_lock_root/commands.log" ]] && break
  sleep 0.2
done
if flock -n "$reverse_lock_root/deployment-state/cutover.lock" -c true; then
  kill "$activation_pid" 2>/dev/null || true
  wait "$activation_pid" 2>/dev/null || true
  printf 'blue/green-style contender acquired the activator deployment lock\n' >&2
  exit 1
fi
if wait "$activation_pid"; then
  printf 'hanging reverse-lock activation unexpectedly completed\n' >&2
  exit 1
fi

# Static health/Web 200 are insufficient when authenticated tenant reads fail.
auth_fail_root="${TEST_ROOT}/activation-auth-fail"
reset_fixture "$auth_fail_root"
if run_activation "$auth_fail_root" env TEST_AUTH_SMOKE_FAIL=true > "$auth_fail_root/activation.out" 2>&1; then
  printf 'activation accepted static health without authenticated reads\n' >&2
  exit 1
fi
test "$(realpath -e -- "$auth_fail_root/config/active-upstreams.conf")" = "$auth_fail_root/config/upstreams/legacy.conf"
! grep -F 'systemctl disable --now' "$auth_fail_root/commands.log" >/dev/null

# Old backend sockets block stops even after the safe route is accepted.
connection_root="${TEST_ROOT}/activation-old-connection"
reset_fixture "$connection_root"
if run_activation "$connection_root" env TEST_CONNECTION_DIRTY=true > "$connection_root/activation.out" 2>&1; then
  printf 'activation stopped legacy with an old backend connection\n' >&2
  exit 1
fi
test "$(realpath -e -- "$connection_root/config/active-upstreams.conf")" = "$connection_root/config/upstreams/legacy-safe.conf"
test -f "$connection_root/state/routed-publicly.marker"
test ! -e "$connection_root/state/legacy-start-fence"
! grep -F 'systemctl disable --now' "$connection_root/commands.log" >/dev/null

# If DB sessions survive after old units stop, migration is blocked but the
# already-verified scheduler-free HTTP route remains serving.
dirty_root="${TEST_ROOT}/activation-dirty-db"
reset_fixture "$dirty_root"
if run_activation "$dirty_root" env TEST_DB_DIRTY=true > "$dirty_root/activation.out" 2>&1; then
  printf 'activation accepted surviving legacy DB sessions\n' >&2
  exit 1
fi
test "$(realpath -e -- "$dirty_root/config/active-upstreams.conf")" = "$dirty_root/config/upstreams/legacy-safe.conf"
test -f "$dirty_root/state/activation.intent"
test ! -e "$dirty_root/state/activation.receipt"
grep -F -x 'ROUTED_PUBLICLY=true' "$dirty_root/state/routed-publicly.marker" >/dev/null

# Wrong server/system identity cannot satisfy an otherwise clean DB audit.
identity_root="${TEST_ROOT}/activation-wrong-db-identity"
reset_fixture "$identity_root"
if run_activation "$identity_root" env TEST_DB_IDENTITY_WRONG=true > "$identity_root/activation.out" 2>&1; then
  printf 'activation accepted the wrong PostgreSQL target identity\n' >&2
  exit 1
fi
test ! -e "$identity_root/state/activation.receipt"

# An additional direct/nested LOGIN identity can otherwise SET ROLE through
# the legacy chain while pg_stat_activity.usename remains the session user.
extra_member_root="${TEST_ROOT}/activation-extra-db-member"
reset_fixture "$extra_member_root"
if run_activation "$extra_member_root" env TEST_DB_EXTRA_MEMBER=true > "$extra_member_root/activation.out" 2>&1; then
  printf 'activation accepted an extra reverse member of the legacy database role\n' >&2
  exit 1
fi
grep -F 'legacy database drain pending:' "$extra_member_root/activation.out" >/dev/null
test ! -e "$extra_member_root/state/activation.receipt"

# A stale two-line helper contract must never advance to the irreversible start
# fence. A committed-but-lost helper response is recoverable because the helper
# is idempotent and the next activation re-attests the exact three-line result.
stale_fence_output_root="${TEST_ROOT}/activation-stale-database-fence-output"
reset_fixture "$stale_fence_output_root"
if run_activation "$stale_fence_output_root" env TEST_DATABASE_FENCE_STALE_TWO_LINE_OUTPUT=true \
  > "$stale_fence_output_root/activation.out" 2>&1; then
  printf 'activation accepted the stale two-line database-fence contract\n' >&2
  exit 1
fi
grep -F 'database fence helper output schema is not exact' \
  "$stale_fence_output_root/activation.out" >/dev/null
test ! -e "$stale_fence_output_root/state/legacy-start-fence"
test ! -e "$stale_fence_output_root/state/activation.receipt"

lost_fence_response_root="${TEST_ROOT}/activation-lost-database-fence-response"
reset_fixture "$lost_fence_response_root"
if run_activation "$lost_fence_response_root" env TEST_DATABASE_FENCE_LOST_RESPONSE_ONCE=true \
  > "$lost_fence_response_root/first.out" 2>&1; then
  printf 'activation accepted a lost database-fence helper response\n' >&2
  exit 1
fi
grep -F 'legacy database login fence failed' "$lost_fence_response_root/first.out" >/dev/null
test -f "$lost_fence_response_root/state/database-fence-effect-applied.fixture"
test ! -e "$lost_fence_response_root/state/legacy-database-login-fence.marker"
test ! -e "$lost_fence_response_root/state/legacy-start-fence"
run_activation "$lost_fence_response_root" env TEST_DATABASE_FENCE_LOST_RESPONSE_ONCE=true \
  > "$lost_fence_response_root/resumed.out"
test -f "$lost_fence_response_root/state/activation.receipt"
cmp -s "$fence_test_root/expected-accepted.out" \
  "$lost_fence_response_root/state/legacy-database-login-fence.marker" \
  || { printf 'lost database-fence response did not reconcile to the canonical helper result\n' >&2; exit 1; }
test "$(grep -F -c 'database-fence --unprivileged-test-mode' \
  "$lost_fence_response_root/commands.log")" = 2

# Every journal boundary is deterministic and resumes without routing back to
# scheduler-capable legacy after the durable public marker.
for crash_phase in intent link reload routed connections dropins database-fence fence stop drain receipt; do
  crash_root="${TEST_ROOT}/activation-crash-${crash_phase}"
  reset_fixture "$crash_root"
  if TEST_FAULT_AFTER="$crash_phase" run_activation "$crash_root" env > "$crash_root/first.out" 2>&1; then
    printf 'fault injection unexpectedly completed: %s\n' "$crash_phase" >&2
    exit 1
  fi
  if [[ "$crash_phase" == database-fence ]]; then
    test -f "$crash_root/state/legacy-database-login-fence.marker"
    cmp -s "$fence_test_root/expected-accepted.out" \
      "$crash_root/state/legacy-database-login-fence.marker" \
      || { printf 'crash-after-database-fence persisted a noncanonical helper result\n' >&2; exit 1; }
  fi
  run_activation "$crash_root" env > "$crash_root/resumed.out"
  test -f "$crash_root/state/activation.receipt"
  test "$(realpath -e -- "$crash_root/config/active-upstreams.conf")" = "$crash_root/config/upstreams/legacy-safe.conf"
  if [[ "$crash_phase" == database-fence ]]; then
    test "$(grep -F -c 'database-fence --unprivileged-test-mode' "$crash_root/commands.log")" = 2
    cmp -s "$fence_test_root/expected-accepted.out" \
      "$crash_root/state/legacy-database-login-fence.marker" \
      || { printf 'database-fence resume replaced the canonical helper result\n' >&2; exit 1; }
  fi
done

# Hanging children are killed within reviewed bounds.
hang_root="${TEST_ROOT}/activation-hanging-psql"
reset_fixture "$hang_root"
hang_started=$SECONDS
if run_activation "$hang_root" env TEST_PSQL_HANG=true > "$hang_root/activation.out" 2>&1; then
  printf 'activation accepted a hanging PostgreSQL audit\n' >&2
  exit 1
fi
((SECONDS - hang_started < 15)) || { printf 'hanging PostgreSQL audit was not bounded\n' >&2; exit 1; }

systemctl_hang_root="${TEST_ROOT}/activation-hanging-systemctl"
reset_fixture "$systemctl_hang_root"
hang_started=$SECONDS
if run_activation "$systemctl_hang_root" env TEST_SYSTEMCTL_HANG=true > "$systemctl_hang_root/activation.out" 2>&1; then
  printf 'activation accepted a hanging systemctl inventory\n' >&2
  exit 1
fi
((SECONDS - hang_started < 20)) || { printf 'hanging systemctl inventory was not bounded\n' >&2; exit 1; }

printf 'production legacy scheduler-free rollback contour test: PASS\n'
