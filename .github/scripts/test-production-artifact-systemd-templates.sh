#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

readonly REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly TEMPLATE_ROOT="${REPOSITORY_ROOT}/docs/deployment/production-artifact/systemd"
readonly ROOT_ENV_EXAMPLE="${REPOSITORY_ROOT}/.env.example"
readonly DESIGN_PARTNER_SAFETY_OVERLAY="${REPOSITORY_ROOT}/docs/open-beta/design-partner-runtime.env.example"

api_unit="${TEMPLATE_ROOT}/leetplus-api.service"
web_unit="${TEMPLATE_ROOT}/leetplus-web.service"
migration_unit="${TEMPLATE_ROOT}/leetplus-release-migrate@.service"
hydration_unit="${TEMPLATE_ROOT}/leetplus-release-hydrate@.service"
recovery_unit="${TEMPLATE_ROOT}/leetplus-blue-green-recovery.service"
recovery_watchdog_unit="${TEMPLATE_ROOT}/leetplus-blue-green-recovery-watchdog.service"
recovery_timer="${TEMPLATE_ROOT}/leetplus-blue-green-recovery.timer"
nginx_recovery_dropin="${TEMPLATE_ROOT}/nginx.service.d/leetplus-blue-green-recovery.conf"
hydration_tmpfiles="${TEMPLATE_ROOT}/tmpfiles.d/leetplus-release.conf"
release_environment="${TEMPLATE_ROOT}/release.env.example"
slot_api_unit="${TEMPLATE_ROOT}/leetplus-api@.service"
slot_web_unit="${TEMPLATE_ROOT}/leetplus-web@.service"
safe_overlay="${TEMPLATE_ROOT}/canary-safe.env.example"
slot_preflight="${REPOSITORY_ROOT}/docs/deployment/production-artifact/preflight-release-slot.sh"
cache_preparer="${REPOSITORY_ROOT}/docs/deployment/production-artifact/prepare-web-slot-cache.sh"
release_promoter="${REPOSITORY_ROOT}/docs/deployment/production-artifact/promote-release-artifact.sh"
store_stager="${REPOSITORY_ROOT}/docs/deployment/production-artifact/stage-pnpm-store.sh"
blue_environment="${TEMPLATE_ROOT}/blue.env.example"
green_environment="${TEMPLATE_ROOT}/green.env.example"
web_runtime_environment="${TEMPLATE_ROOT}/web-runtime.env.example"
blue_nginx="${REPOSITORY_ROOT}/docs/deployment/production-artifact/nginx/blue.conf.example"
green_nginx="${REPOSITORY_ROOT}/docs/deployment/production-artifact/nginx/green.conf.example"

for required_file in \
  "$api_unit" "$web_unit" "$migration_unit" "$hydration_unit" "$release_environment" \
  "$slot_api_unit" "$slot_web_unit" "$safe_overlay" "$slot_preflight" "$cache_preparer" "$release_promoter" "$store_stager" "$blue_environment" "$green_environment" "$web_runtime_environment" "$blue_nginx" "$green_nginx" "$recovery_unit" "$recovery_watchdog_unit" "$recovery_timer" "$nginx_recovery_dropin" "$hydration_tmpfiles"; do
  test -f "$required_file"
done

for candidate_nginx in "$blue_nginx" "$green_nginx"; do
  grep -F -x '    server 127.0.0.1:4000 backup;' "$candidate_nginx" > /dev/null
  grep -F -x '    server 127.0.0.1:3000 backup;' "$candidate_nginx" > /dev/null
done

for slot_unit in "$slot_api_unit" "$slot_web_unit"; do
  grep -F -x 'Group=leetplus-runtime' "$slot_unit" > /dev/null
  grep -F -x 'EnvironmentFile=/etc/leetplus/slots/%i.env' "$slot_unit" > /dev/null
  grep -F -x 'EnvironmentFile=/etc/leetplus/canary-safe.env' "$slot_unit" > /dev/null
  grep -F 'ExecStartPre=/usr/local/libexec/leetplus/preflight-release-slot.sh --slot %i' "$slot_unit" > /dev/null
  grep -F -x 'ReadOnlyPaths=/srv/leetplus/releases /srv/leetplus/slots' "$slot_unit" > /dev/null
  grep -F -x 'ProtectSystem=strict' "$slot_unit" > /dev/null
  grep -F -x 'ProtectProc=invisible' "$slot_unit" > /dev/null
  grep -F -x 'ProcSubset=pid' "$slot_unit" > /dev/null
  grep -F -x 'RestrictNetworkInterfaces=lo' "$slot_unit" > /dev/null
  grep -F -x 'IPAddressDeny=any' "$slot_unit" > /dev/null
  grep -F -x 'IPAddressAllow=localhost' "$slot_unit" > /dev/null
  grep -F -x 'Before=nginx.service' "$slot_unit" > /dev/null
  grep -F -x 'WantedBy=multi-user.target' "$slot_unit" > /dev/null
  if grep -E '/home/admin/leetplus|ExecStart=.*/srv/leetplus/current|Restart=always' "$slot_unit" > /dev/null; then
    printf 'slot unit is coupled to mutable/single-instance runtime: %s\n' "$slot_unit" >&2
    exit 1
  fi
done

grep -F -x 'WorkingDirectory=/srv/leetplus/slots/%i' "$slot_api_unit" > /dev/null
grep -F -x 'User=leetplus-api-%i' "$slot_api_unit" > /dev/null
grep -F -x 'EnvironmentFile=/etc/leetplus/runtime.env' "$slot_api_unit" > /dev/null
grep -F 'ExecStartPre=/usr/bin/node /srv/leetplus/slots/%i/apps/api/dist/config/validate-production-environment.cli.js' "$slot_api_unit" > /dev/null
grep -F -- '--api-runtime' "$slot_api_unit" > /dev/null
grep -F -x 'ExecStart=/usr/bin/node /srv/leetplus/slots/%i/apps/api/dist/main.js' "$slot_api_unit" > /dev/null
grep -F -x 'ReadWritePaths=/var/lib/leetplus/langame-sync' "$slot_api_unit" > /dev/null
grep -F -x 'LogsDirectory=leetplus/api-%i' "$slot_api_unit" > /dev/null
grep -F -x 'LogsDirectoryMode=0750' "$slot_api_unit" > /dev/null
if grep -F -x 'ReadWritePaths=/var/lib/leetplus /var/log/leetplus' "$slot_api_unit" > /dev/null; then
  printf 'API slot retains broad deployment-state write access\n' >&2
  exit 1
fi
grep -F -x 'WorkingDirectory=/srv/leetplus/slots/%i/apps/web' "$slot_web_unit" > /dev/null
grep -F -x 'User=leetplus-web-%i' "$slot_web_unit" > /dev/null
grep -F -x 'Requires=leetplus-api@%i.service' "$slot_web_unit" > /dev/null
grep -F -x 'EnvironmentFile=/etc/leetplus/web-runtime.env' "$slot_web_unit" > /dev/null
if grep -F -x 'EnvironmentFile=/etc/leetplus/runtime.env' "$slot_web_unit" > /dev/null \
  || grep -F 'validate-production-environment.cli.js' "$slot_web_unit" > /dev/null; then
  printf 'Web slot inherits API secrets or API-only validator\n' >&2
  exit 1
fi
grep -F 'ExecStart=/usr/bin/node /srv/leetplus/slots/%i/apps/web/node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${WEB_PORT}' "$slot_web_unit" > /dev/null
grep -F -- '--web-runtime' "$slot_web_unit" > /dev/null
grep -F -- '--require-web-cache-bind' "$slot_web_unit" > /dev/null
if grep -F -- '--require-web-cache-bind' "$slot_api_unit" > /dev/null; then
  printf 'API slot must not receive the Web-only cache bind preflight\n' >&2
  exit 1
fi
grep -F -x 'CacheDirectory=leetplus-web-%i' "$slot_web_unit" > /dev/null
grep -F -x 'BindPaths=/var/cache/leetplus-web-%i:/srv/leetplus/slots/%i/apps/web/.next/cache' "$slot_web_unit" > /dev/null
grep -F -x 'ReadWritePaths=/var/cache/leetplus-web-%i' "$slot_web_unit" > /dev/null
grep -F -x 'InaccessiblePaths=/etc/leetplus/runtime.env' "$slot_web_unit" > /dev/null
grep -F 'cache_release_marker="${cache_marker_root}/${slot}.sha"' "$slot_preflight" > /dev/null
grep -F "Web slot must be stopped before cache preparation" "$cache_preparer" > /dev/null
grep -F 'WEB_CACHE_OLD_DATA_DELETED=false' "$cache_preparer" > /dev/null
grep -F -x 'User=leetplus-build' "$hydration_unit" > /dev/null
grep -F -x 'IPAddressDeny=any' "$hydration_unit" > /dev/null
grep -F -x 'RestrictAddressFamilies=AF_UNIX' "$hydration_unit" > /dev/null
grep -F -x 'KillMode=control-group' "$hydration_unit" > /dev/null
grep -F '/usr/bin/flock --exclusive --no-fork /run/leetplus-release/hydration.lock' "$hydration_unit" > /dev/null
grep -F -- '--hydrate' "$hydration_unit" > /dev/null
grep -F 'production promotion must run as root' "$release_promoter" > /dev/null
grep -F 'HYDRATION_SANDBOX_RECEIPT' "$release_promoter" > /dev/null
grep -F 'assert_empty_hydration_cgroup' "$release_promoter" > /dev/null
grep -F 'systemctl stop "$hydration_unit"' "$release_promoter" > /dev/null
grep -F "another hydration or promotion operation holds the global lock" "$release_promoter" > /dev/null
grep -F -x 'f /run/leetplus-release/hydration.lock 0660 root leetplus-build -' "$hydration_tmpfiles" > /dev/null
grep -F -x 'ExecStart=/usr/local/sbin/leetplus-blue-green-cutover recover-before-nginx' "$recovery_unit" > /dev/null
grep -F -x 'Before=nginx.service' "$recovery_unit" > /dev/null
grep -F -x 'ExecStart=/usr/local/sbin/leetplus-blue-green-cutover recover-pending' "$recovery_watchdog_unit" > /dev/null
if grep -F -x 'Before=nginx.service' "$recovery_watchdog_unit" > /dev/null; then
  printf 'post-start recovery watchdog is incorrectly ordered before nginx\n' >&2
  exit 1
fi
if grep -F -x 'After=network-online.target nginx.service' "$recovery_watchdog_unit" > /dev/null; then
  printf 'post-start recovery watchdog has an nginx job-order cycle\n' >&2
  exit 1
fi
grep -F 'verify_previous_runtime_bounded' "$REPOSITORY_ROOT/docs/deployment/production-artifact/blue-green-cutover.sh" > /dev/null
grep -F -x 'OnUnitInactiveSec=10s' "$recovery_timer" > /dev/null
grep -F -x 'Unit=leetplus-blue-green-recovery-watchdog.service' "$recovery_timer" > /dev/null
grep -F -x 'Requires=leetplus-blue-green-recovery.service' "$nginx_recovery_dropin" > /dev/null
grep -F 'production pnpm store already exists' "$store_stager" > /dev/null
grep -F 'PNPM_STORE_PACKAGE_CODE_EXECUTED=false' "$store_stager" > /dev/null
if grep -F '/var/lib/leetplus' "$slot_web_unit" > /dev/null; then
  printf 'Web slot has unnecessary API mutable-state access\n' >&2
  exit 1
fi

for safe_value in \
  'FOUNDER_OPERATOR_BETA_MODE=DISABLED' \
  'DESIGN_PARTNER_ISOLATED_MODE=false' \
  'GUEST_GAME_PIPELINE_SCHEDULER_ENABLED=false' \
  'LANGAME_DAILY_SYNC_SCHEDULER_ENABLED=false' \
  'REPORT_DIGEST_SCHEDULER_ENABLED=false' \
  'STAFF_TASK_RULES_SCHEDULER_ENABLED=false' \
  'GUEST_GAME_DELIVERY_REAL_SEND_ENABLED=false' \
  'IDENTITY_MAIL_WORKER_REAL_SEND_ENABLED=false' \
  'TENANT_ACTIVATION_OUTBOUND_ENABLED=false'; do
  grep -F -x "$safe_value" "$safe_overlay" > /dev/null
done

# Every effect-style enable switch documented by the application must have an
# explicit fail-closed value in the final shadow-runtime overlay. A newly added
# key therefore fails CI until it is reviewed here, rather than inheriting a
# production default accidentally.
duplicate_overlay_key="$(awk -F= '/^[A-Z0-9_]+=/ { print $1 }' "$safe_overlay" | sort | uniq -d | head -n 1)"
test -z "$duplicate_overlay_key"
while IFS='=' read -r effect_key _; do
  case "$effect_key" in
    *ENABLED|*REAL_SEND_ENABLED|*LIVE_CANARY_ENABLED)
      grep -F -x "${effect_key}=false" "$safe_overlay" > /dev/null || {
        printf 'canary safety overlay does not fail-close documented effect key: %s\n' "$effect_key" >&2
        exit 1
      }
      ;;
  esac
done < "$ROOT_ENV_EXAMPLE"

# Reuse the canonical deny settings. The shared-network shadow deliberately
# differs only in isolation identity: it must be false and has no DP tenant
# slug/domain. Every scheduler, recovery and outbound deny remains identical.
while IFS='=' read -r safety_key safety_value; do
  case "$safety_key" in
    ''|DESIGN_PARTNER_ISOLATED_MODE|DESIGN_PARTNER_TENANT_SLUG|DESIGN_PARTNER_TENANT_DOMAIN) continue ;;
  esac
  grep -F -x "${safety_key}=${safety_value}" "$safe_overlay" > /dev/null || {
    printf 'canary overlay diverges from canonical deny setting: %s\n' "$safety_key" >&2
    exit 1
  }
done < <(grep -E '^[A-Z0-9_]+=' "$DESIGN_PARTNER_SAFETY_OVERLAY")

diff -u \
  <(grep -E '^[A-Z0-9_]+=' "$safe_overlay" | LC_ALL=C sort) \
  <(sed -n '/^# BEGIN CANARY_SAFE_REQUIRED_SETTINGS$/,/^# END CANARY_SAFE_REQUIRED_SETTINGS$/p' "$slot_preflight" \
    | grep -E '^[A-Z0-9_]+=' | LC_ALL=C sort)

grep -F -x 'PORT=4100' "$blue_environment" > /dev/null
grep -F -x 'API_BIND_HOST=127.0.0.1' "$blue_environment" > /dev/null
grep -F -x 'WEB_PORT=3100' "$blue_environment" > /dev/null
grep -F -x 'API_URL=http://127.0.0.1:4100' "$blue_environment" > /dev/null
grep -F -x 'PORT=4200' "$green_environment" > /dev/null
grep -F -x 'API_BIND_HOST=127.0.0.1' "$green_environment" > /dev/null
grep -F -x 'WEB_PORT=3200' "$green_environment" > /dev/null
grep -F -x 'API_URL=http://127.0.0.1:4200' "$green_environment" > /dev/null
for slot_environment in "$blue_environment" "$green_environment"; do
  grep -F -x 'WEB_BUILD_ID=<same-exact-40-character-release-sha>' "$slot_environment" > /dev/null
  for required_key in RELEASE_SHA WEB_BUILD_ID EXPECTED_DATABASE_MIGRATION EXPECTED_DATABASE_MIGRATION_COUNT BUILD_TIME; do
    grep -E "^${required_key}=" "$slot_environment" > /dev/null
  done
done

grep -F -x 'NODE_ENV=production' "$web_runtime_environment" > /dev/null
if grep -E '(^|_)(DATABASE_URL|JWT_SECRET|PASSWORD|TOKEN|SECRET|HMAC_KEY|ENCRYPTION_KEY|API_KEY)=' "$web_runtime_environment" > /dev/null; then
  printf 'Web runtime example contains an API/provider credential\n' >&2
  exit 1
fi

for runtime_unit in "$api_unit" "$web_unit"; do
  grep -F -x 'User=admin' "$runtime_unit" > /dev/null
  grep -F -x 'Group=admin' "$runtime_unit" > /dev/null
  grep -F -x 'EnvironmentFile=/etc/leetplus/runtime.env' "$runtime_unit" > /dev/null
  grep -F -x 'EnvironmentFile=/etc/leetplus/release.env' "$runtime_unit" > /dev/null
  grep -F -x 'NoNewPrivileges=true' "$runtime_unit" > /dev/null
  grep -F -x 'PrivateTmp=true' "$runtime_unit" > /dev/null
  if grep -F '/home/admin/leetplus' "$runtime_unit" > /dev/null; then
    printf 'runtime template retains legacy mutable checkout path: %s\n' "$runtime_unit" >&2
    exit 1
  fi
done

grep -F -x 'WorkingDirectory=/srv/leetplus/current' "$api_unit" > /dev/null
grep -F 'DEPRECATED FOR FIRST ARTIFACT CUTOVER' "$api_unit" > /dev/null
grep -F -x 'ExecStart=/usr/bin/pnpm --filter api start:prod' "$api_unit" > /dev/null
grep -F -x 'WorkingDirectory=/srv/leetplus/current/apps/web' "$web_unit" > /dev/null
grep -F 'DEPRECATED FOR FIRST ARTIFACT CUTOVER' "$web_unit" > /dev/null
grep -F -x 'ExecStart=/srv/leetplus/current/apps/web/node_modules/.bin/next start --hostname 127.0.0.1 --port 3000' "$web_unit" > /dev/null

grep -F -x 'User=admin' "$migration_unit" > /dev/null
grep -F -x 'Group=admin' "$migration_unit" > /dev/null
grep -F -x 'WorkingDirectory=/srv/leetplus/releases/%i' "$migration_unit" > /dev/null
grep -F -x 'EnvironmentFile=/etc/leetplus/runtime.env' "$migration_unit" > /dev/null
grep -F -x 'EnvironmentFile=/etc/leetplus/release-env/%i.env' "$migration_unit" > /dev/null
grep -F -x 'ExecStart=/usr/bin/pnpm --filter database db:deploy' "$migration_unit" > /dev/null
grep -F 'REHEARSAL ONLY' "$migration_unit" > /dev/null
if grep -E '(^|[[:space:]])(git|curl|wget|pnpm install|build)([[:space:]]|$)' "$migration_unit" > /dev/null; then
  printf 'migration template has mutable acquisition/build capability\n' >&2
  exit 1
fi

for required_key in RELEASE_SHA WEB_BUILD_ID EXPECTED_DATABASE_MIGRATION EXPECTED_DATABASE_MIGRATION_COUNT BUILD_TIME; do
  grep -E "^${required_key}=" "$release_environment" > /dev/null
done

printf 'production artifact systemd template test: PASS\n'
