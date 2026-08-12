#!/usr/bin/env bash
set -Eeuo pipefail

required_confirmation="run-current187-pgbouncer-control-plane-protocol-integration-e2e"
if [[ "${IDENTITY_MAIL_PGBOUNCER_CURRENT187_E2E_CONFIRM:-}" != "$required_confirmation" ]]; then
  printf 'CURRENT187 PgBouncer fixture confirmation is absent.\n' >&2
  exit 64
fi

if [[ -z "${RUNNER_TEMP:-}" || ! -d "$RUNNER_TEMP" ]]; then
  printf 'RUNNER_TEMP is unavailable.\n' >&2
  exit 65
fi

fixture_root="$(mktemp -d "$RUNNER_TEMP/leetplus-current187-pgbouncer-XXXXXX")"
config_path="$fixture_root/pgbouncer.ini"
auth_path="$fixture_root/userlist.txt"
log_path="$fixture_root/pgbouncer.log"
pid_path="$fixture_root/pgbouncer.pid"
pooler_pid=""

cleanup() {
  local status=$?
  trap - EXIT
  if [[ -n "$pooler_pid" ]] && kill -0 "$pooler_pid" 2>/dev/null; then
    kill "$pooler_pid"
    wait "$pooler_pid" 2>/dev/null || true
  fi
  if [[ $status -ne 0 && -f "$log_path" ]]; then
    sed -n '1,200p' "$log_path" >&2
  fi
  if [[ "$fixture_root" == "$RUNNER_TEMP"/leetplus-current187-pgbouncer-* ]]; then
    rm -rf -- "$fixture_root"
  fi
  exit "$status"
}
trap cleanup EXIT

PGPASSWORD=postgres psql \
  --host 127.0.0.1 \
  --port 5432 \
  --username postgres \
  --dbname postgres \
  --set ON_ERROR_STOP=1 \
  <<'SQL'
CREATE ROLE lp_application LOGIN PASSWORD 'current187-ci-application-only';
SQL

cat >"$auth_path" <<'AUTH'
"lp_pool_stats" "current187-ci-stats-only"
"lp_application" "current187-ci-application-only"
AUTH

cat >"$config_path" <<CONFIG
[databases]
leetplus_ci = host=127.0.0.1 port=5432 dbname=leetplus_ci

[pgbouncer]
listen_addr = 127.0.0.1
listen_port = 16432
unix_socket_dir =
auth_type = scram-sha-256
auth_file = $auth_path
stats_users = lp_pool_stats
pool_mode = transaction
max_client_conn = 500
default_pool_size = 20
max_prepared_statements = 0
server_reset_query_always = 0
client_tls_sslmode = disable
server_tls_sslmode = disable
ignore_startup_parameters = extra_float_digits
logfile = $log_path
pidfile = $pid_path
CONFIG

chmod 600 "$auth_path" "$config_path"
pgbouncer -q "$config_path" &
pooler_pid=$!

ready=0
for _ in $(seq 1 50); do
  if pg_isready \
    --host 127.0.0.1 \
    --port 16432 \
    --username lp_pool_stats \
    --dbname pgbouncer >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.1
done
if [[ $ready -ne 1 ]]; then
  printf 'Disposable PgBouncer did not become ready.\n' >&2
  exit 66
fi

pnpm --filter database \
  test:integration:identity-mail-cluster-pgbouncer-current187
