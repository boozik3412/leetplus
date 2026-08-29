#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

die() {
  printf 'test-current188-legacy-production-executor-pg16: %s\n' "$*" >&2
  exit 1
}

[[ "${EUID}" -eq 0 ]] || die 'root authority is required'
[[ "${NODE_ENV:-}" == 'test' ]] || die 'NODE_ENV=test is required'
[[ "${CI_RELEASE_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || die 'exact CI release SHA is required'
[[ "${GITHUB_WORKSPACE:-}" == /* ]] || die 'exact GITHUB_WORKSPACE is required'
[[ "${NODE_BIN:-}" == /* ]] || die 'exact NODE_BIN is required'

readonly pg_bin='/usr/lib/postgresql/16/bin'
readonly pg_port='55432'
readonly pg_socket='/var/run/postgresql'
readonly lane_parent='/var/lib/leetplus/current188-legacy-lanes'
readonly test_file="${GITHUB_WORKSPACE}/packages/database/scripts/founder-pilot-current188-legacy-ownership-upgrade.pg.integration.test.mjs"

for executable in initdb pg_ctl pg_isready psql; do
  [[ -x "${pg_bin}/${executable}" ]] || die "PostgreSQL 16 ${executable} is unavailable"
done
[[ -x "$NODE_BIN" ]] || die 'Node executable is unavailable'
[[ -f "$test_file" && ! -L "$test_file" ]] || die 'exact integration test is unavailable'
[[ -d '/var/lib/postgresql' && ! -L '/var/lib/postgresql' ]] || die 'PostgreSQL home is invalid'
[[ -d "$pg_socket" && ! -L "$pg_socket" ]] || die 'PostgreSQL socket directory is invalid'
[[ ! -S "${pg_socket}/.s.PGSQL.${pg_port}" ]] || die 'isolated PostgreSQL socket is already occupied'

install -d -o root -g root -m 0755 "$lane_parent"
lane_parent_real="$(realpath -e -- "$lane_parent")"
[[ "$lane_parent_real" == "$lane_parent" ]] || die 'lane parent is not canonical'

data_root="$(mktemp -d '/var/lib/postgresql/current188-production-executor-pg16.XXXXXXXX')"
data_root_real="$(realpath -e -- "$data_root")"
[[ "$data_root_real" == /var/lib/postgresql/current188-production-executor-pg16.* ]] \
  || die 'temporary PostgreSQL root escaped its authority boundary'
chown postgres:postgres "$data_root_real"
chmod 0700 "$data_root_real"

started=false
cleanup() {
  local cleanup_status=0
  if [[ "$started" == true ]]; then
    runuser -u postgres -- \
      "${pg_bin}/pg_ctl" -D "$data_root_real" -m immediate -w stop \
      >/dev/null 2>&1 || cleanup_status=1
  fi
  if [[ "$data_root_real" == /var/lib/postgresql/current188-production-executor-pg16.* ]]; then
    rm -rf --one-file-system -- "$data_root_real" || cleanup_status=1
  else
    cleanup_status=1
  fi
  return "$cleanup_status"
}
trap cleanup EXIT

runuser -u postgres -- \
  "${pg_bin}/initdb" \
    --auth-host=trust \
    --auth-local=peer \
    --encoding=UTF8 \
    --locale=C.UTF-8 \
    --no-sync \
    -D "$data_root_real" \
    >/dev/null
runuser -u postgres -- \
  "${pg_bin}/pg_ctl" \
    -D "$data_root_real" \
    -l "${data_root_real}/postgres.log" \
    -o "-p ${pg_port} -k ${pg_socket} -h 127.0.0.1" \
    -w start \
    >/dev/null
started=true
runuser -u postgres -- \
  "${pg_bin}/pg_isready" -h "$pg_socket" -p "$pg_port" -d postgres \
  >/dev/null

env -i \
  CI_RELEASE_SHA="$CI_RELEASE_SHA" \
  DATABASE_URL="postgresql://postgres:test@127.0.0.1:${pg_port}/leetplus_ci?schema=public" \
  FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_PG_E2E_CONFIRM='run-founder-pilot-current188-legacy-ownership-postgres-e2e' \
  FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_PRODUCTION_EXECUTOR_E2E='run-exact-production-executor' \
  HOME='/root' \
  LANG='C.UTF-8' \
  LC_ALL='C.UTF-8' \
  NODE_ENV='test' \
  PATH="$(dirname "$NODE_BIN"):/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  TZ='UTC' \
  "$NODE_BIN" --test "$test_file"

unit_residue='pending'
cgroup_residue='pending'
for _attempt in $(seq 1 50); do
  unit_residue="$(
    systemctl list-units \
      --all \
      --no-legend \
      --no-pager \
      --plain \
      'current188-upgrade-control-*' \
      | sed '/^[[:space:]]*$/d'
  )"
  cgroup_residue="$(
    find /sys/fs/cgroup/system.slice \
      -maxdepth 1 \
      -type d \
      -name 'current188-upgrade-control-*.service' \
      -print \
      -quit
  )"
  [[ -z "$unit_residue" && -z "$cgroup_residue" ]] && break
  sleep 0.1
done
[[ -z "$unit_residue" ]] || die 'transient production-executor unit residue remains'
[[ -z "$cgroup_residue" ]] || die 'production-executor cgroup residue remains'
