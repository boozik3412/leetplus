#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

readonly REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly TEMPLATE_ROOT="${REPOSITORY_ROOT}/docs/deployment/production-artifact/systemd"

api_unit="${TEMPLATE_ROOT}/leetplus-api.service"
web_unit="${TEMPLATE_ROOT}/leetplus-web.service"
migration_unit="${TEMPLATE_ROOT}/leetplus-release-migrate@.service"
release_environment="${TEMPLATE_ROOT}/release.env.example"

for required_file in "$api_unit" "$web_unit" "$migration_unit" "$release_environment"; do
  test -f "$required_file"
done

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
grep -F -x 'ExecStart=/usr/bin/pnpm --filter api start:prod' "$api_unit" > /dev/null
grep -F -x 'WorkingDirectory=/srv/leetplus/current/apps/web' "$web_unit" > /dev/null
grep -F -x 'ExecStart=/srv/leetplus/current/apps/web/node_modules/.bin/next start --hostname 127.0.0.1 --port 3000' "$web_unit" > /dev/null

grep -F -x 'User=admin' "$migration_unit" > /dev/null
grep -F -x 'Group=admin' "$migration_unit" > /dev/null
grep -F -x 'WorkingDirectory=/srv/leetplus/releases/%i' "$migration_unit" > /dev/null
grep -F -x 'EnvironmentFile=/etc/leetplus/runtime.env' "$migration_unit" > /dev/null
grep -F -x 'EnvironmentFile=/etc/leetplus/release-env/%i.env' "$migration_unit" > /dev/null
grep -F -x 'ExecStart=/usr/bin/pnpm --filter database db:deploy' "$migration_unit" > /dev/null
if grep -E '(^|[[:space:]])(git|curl|wget|pnpm install|build)([[:space:]]|$)' "$migration_unit" > /dev/null; then
  printf 'migration template has mutable acquisition/build capability\n' >&2
  exit 1
fi

for required_key in RELEASE_SHA EXPECTED_DATABASE_MIGRATION EXPECTED_DATABASE_MIGRATION_COUNT BUILD_TIME; do
  grep -E "^${required_key}=" "$release_environment" > /dev/null
done

printf 'production artifact systemd template test: PASS\n'
