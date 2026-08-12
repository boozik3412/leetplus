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
if [[ -z "${POSTGRES_SERVICE_CONTAINER_ID:-}" ]]; then
  printf 'PostgreSQL service container identity is unavailable.\n' >&2
  exit 65
fi

fixture_root="$(mktemp -d "$RUNNER_TEMP/leetplus-current187-pgbouncer-XXXXXX")"
pooler_hostname="pool.current187.invalid"
database_hostname="db.current187.invalid"
config_path="$fixture_root/pgbouncer.ini"
auth_path="$fixture_root/userlist.txt"
log_path="$fixture_root/pgbouncer.log"
pid_path="$fixture_root/pgbouncer.pid"
ca_key_path="$fixture_root/ca.key"
ca_certificate_path="$fixture_root/ca.crt"
server_key_path="$fixture_root/server.key"
server_csr_path="$fixture_root/server.csr"
server_certificate_path="$fixture_root/server.crt"
server_extensions_path="$fixture_root/server.ext"
client_key_path="$fixture_root/client.key"
client_csr_path="$fixture_root/client.csr"
client_certificate_path="$fixture_root/client.crt"
client_extensions_path="$fixture_root/client.ext"
client_identity_path="$fixture_root/client.p12"
wrong_ca_key_path="$fixture_root/wrong-ca.key"
wrong_ca_certificate_path="$fixture_root/wrong-ca.crt"
original_hba_path="$fixture_root/pg_hba.before.conf"
fixture_hba_path="$fixture_root/pg_hba.fixture.conf"
hosts_backup_path="$fixture_root/hosts.before"
pooler_pid=""
hosts_modified=0
hba_modified=0
roles_created=0

cleanup() {
  local status=$?
  trap - EXIT
  if [[ -n "$pooler_pid" ]] && kill -0 "$pooler_pid" 2>/dev/null; then
    kill "$pooler_pid"
    wait "$pooler_pid" 2>/dev/null || true
  fi
  if [[ $hba_modified -eq 1 && -f "$original_hba_path" ]]; then
    docker cp \
      "$original_hba_path" \
      "$POSTGRES_SERVICE_CONTAINER_ID:/var/lib/postgresql/data/pg_hba.conf" \
      >/dev/null 2>&1 || status=1
    docker exec --user root "$POSTGRES_SERVICE_CONTAINER_ID" sh -ceu '
      chown postgres:postgres /var/lib/postgresql/data/pg_hba.conf
      chmod 600 /var/lib/postgresql/data/pg_hba.conf
    ' >/dev/null 2>&1 || status=1
    docker exec --user postgres "$POSTGRES_SERVICE_CONTAINER_ID" \
      pg_ctl reload -D /var/lib/postgresql/data >/dev/null 2>&1 || status=1
  fi
  if [[ $roles_created -eq 1 ]]; then
    PGPASSWORD=postgres psql \
      --host 127.0.0.1 \
      --port 5432 \
      --username postgres \
      --dbname postgres \
      --set ON_ERROR_STOP=1 \
      --command 'DROP ROLE IF EXISTS lp_application, lp_coordinator, lp_migration, lp_worker, lp_wrong' \
      >/dev/null 2>&1 || status=1
  fi
  if [[ $status -ne 0 && -f "$log_path" ]]; then
    sed -n '1,200p' "$log_path" >&2
  fi
  if [[ $hosts_modified -eq 1 && -f "$hosts_backup_path" ]]; then
    sudo tee /etc/hosts <"$hosts_backup_path" >/dev/null
  fi
  if [[ "$fixture_root" == "$RUNNER_TEMP"/leetplus-current187-pgbouncer-* ]]; then
    rm -rf -- "$fixture_root"
  fi
  exit "$status"
}
trap cleanup EXIT

cp /etc/hosts "$hosts_backup_path"
printf '127.0.0.1 %s %s\n' "$pooler_hostname" "$database_hostname" | \
  sudo tee -a /etc/hosts >/dev/null
hosts_modified=1

openssl genpkey \
  -algorithm RSA \
  -pkeyopt rsa_keygen_bits:2048 \
  -out "$ca_key_path" >/dev/null 2>&1
openssl req \
  -new \
  -x509 \
  -key "$ca_key_path" \
  -out "$ca_certificate_path" \
  -days 1 \
  -sha256 \
  -subj '/CN=LeetPlus CURRENT187 disposable CA' \
  -addext 'basicConstraints=critical,CA:TRUE' \
  -addext 'keyUsage=critical,keyCertSign,cRLSign' \
  -addext 'subjectKeyIdentifier=hash'

openssl genpkey \
  -algorithm RSA \
  -pkeyopt rsa_keygen_bits:2048 \
  -out "$server_key_path" >/dev/null 2>&1
openssl req \
  -new \
  -key "$server_key_path" \
  -out "$server_csr_path" \
  -sha256 \
  -subj '/CN=127.0.0.1'
cat >"$server_extensions_path" <<'SERVER_EXTENSIONS'
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=IP:127.0.0.1,DNS:localhost,DNS:pool.current187.invalid,DNS:db.current187.invalid
SERVER_EXTENSIONS
openssl x509 \
  -req \
  -in "$server_csr_path" \
  -CA "$ca_certificate_path" \
  -CAkey "$ca_key_path" \
  -CAcreateserial \
  -out "$server_certificate_path" \
  -days 1 \
  -sha256 \
  -extfile "$server_extensions_path"

openssl genpkey \
  -algorithm RSA \
  -pkeyopt rsa_keygen_bits:2048 \
  -out "$client_key_path" >/dev/null 2>&1
openssl req \
  -new \
  -key "$client_key_path" \
  -out "$client_csr_path" \
  -sha256 \
  -subj '/CN=lp-current187-fixture-client'
cat >"$client_extensions_path" <<'CLIENT_EXTENSIONS'
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=clientAuth
CLIENT_EXTENSIONS
openssl x509 \
  -req \
  -in "$client_csr_path" \
  -CA "$ca_certificate_path" \
  -CAkey "$ca_key_path" \
  -CAserial "$fixture_root/ca.srl" \
  -out "$client_certificate_path" \
  -days 1 \
  -sha256 \
  -extfile "$client_extensions_path"
chmod 600 "$ca_key_path" "$server_key_path" "$client_key_path"
openssl verify \
  -purpose sslserver \
  -CAfile "$ca_certificate_path" \
  "$server_certificate_path" >/dev/null
openssl verify \
  -purpose sslclient \
  -CAfile "$ca_certificate_path" \
  "$client_certificate_path" >/dev/null
openssl pkcs12 \
  -export \
  -out "$client_identity_path" \
  -inkey "$client_key_path" \
  -in "$client_certificate_path" \
  -certfile "$ca_certificate_path" \
  -passout pass: >/dev/null 2>&1
openssl genpkey \
  -algorithm RSA \
  -pkeyopt rsa_keygen_bits:2048 \
  -out "$wrong_ca_key_path" >/dev/null 2>&1
openssl req \
  -new \
  -x509 \
  -key "$wrong_ca_key_path" \
  -out "$wrong_ca_certificate_path" \
  -days 1 \
  -sha256 \
  -subj '/CN=LeetPlus CURRENT187 wrong disposable CA' \
  -addext 'basicConstraints=critical,CA:TRUE' \
  -addext 'keyUsage=critical,keyCertSign,cRLSign'
chmod 600 "$client_identity_path" "$wrong_ca_key_path"

docker cp \
  "$ca_certificate_path" \
  "$POSTGRES_SERVICE_CONTAINER_ID:/var/lib/postgresql/data/current187-ca.crt"
docker cp \
  "$server_certificate_path" \
  "$POSTGRES_SERVICE_CONTAINER_ID:/var/lib/postgresql/data/current187-server.crt"
docker cp \
  "$server_key_path" \
  "$POSTGRES_SERVICE_CONTAINER_ID:/var/lib/postgresql/data/current187-server.key"
docker exec --user root "$POSTGRES_SERVICE_CONTAINER_ID" sh -ceu '
  chown postgres:postgres \
    /var/lib/postgresql/data/current187-ca.crt \
    /var/lib/postgresql/data/current187-server.crt \
    /var/lib/postgresql/data/current187-server.key
  chmod 600 /var/lib/postgresql/data/current187-server.key
'
docker exec --interactive --user postgres "$POSTGRES_SERVICE_CONTAINER_ID" \
  psql --dbname postgres --set ON_ERROR_STOP=1 <<'SQL'
ALTER SYSTEM SET ssl = 'on';
ALTER SYSTEM SET ssl_ca_file = 'current187-ca.crt';
ALTER SYSTEM SET ssl_cert_file = 'current187-server.crt';
ALTER SYSTEM SET ssl_key_file = 'current187-server.key';
SQL
docker restart "$POSTGRES_SERVICE_CONTAINER_ID" >/dev/null

postgres_ready=0
for _ in $(seq 1 100); do
  if PGPASSWORD=postgres \
    PGSSLMODE=verify-full \
    PGSSLROOTCERT="$ca_certificate_path" \
    psql \
      --host 127.0.0.1 \
      --port 5432 \
      --username postgres \
      --dbname postgres \
      --tuples-only \
      --no-align \
      --command 'SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()' \
      2>/dev/null | grep -qx t; then
    postgres_ready=1
    break
  fi
  sleep 0.1
done
if [[ $postgres_ready -ne 1 ]]; then
  printf 'Disposable PostgreSQL TLS endpoint did not become ready.\n' >&2
  exit 66
fi

PGPASSWORD=postgres psql \
  --host 127.0.0.1 \
  --port 5432 \
  --username postgres \
  --dbname postgres \
  --set ON_ERROR_STOP=1 \
<<'SQL'
CREATE ROLE lp_application LOGIN PASSWORD 'current187-ci-application-only' CONNECTION LIMIT 5;
CREATE ROLE lp_coordinator LOGIN PASSWORD 'current187-ci-coordinator-only' CONNECTION LIMIT 5;
CREATE ROLE lp_migration LOGIN PASSWORD 'current187-ci-migration-only' CONNECTION LIMIT 5;
CREATE ROLE lp_worker LOGIN PASSWORD 'current187-ci-worker-only' CONNECTION LIMIT 5;
CREATE ROLE lp_wrong LOGIN PASSWORD 'current187-ci-wrong-only' CONNECTION LIMIT 1;
SQL
roles_created=1

docker cp \
  "$POSTGRES_SERVICE_CONTAINER_ID:/var/lib/postgresql/data/pg_hba.conf" \
  "$original_hba_path"
cat >"$fixture_hba_path" <<'HBA'
local all all scram-sha-256
hostssl leetplus_ci postgres 127.0.0.1/32 scram-sha-256
hostssl leetplus_ci lp_application 127.0.0.1/32 scram-sha-256
hostssl leetplus_ci lp_coordinator 127.0.0.1/32 scram-sha-256
hostssl leetplus_ci lp_migration 127.0.0.1/32 scram-sha-256
hostssl leetplus_ci lp_worker 127.0.0.1/32 scram-sha-256
hostssl leetplus_ci lp_wrong 127.0.0.1/32 scram-sha-256
HBA
docker cp \
  "$fixture_hba_path" \
  "$POSTGRES_SERVICE_CONTAINER_ID:/var/lib/postgresql/data/pg_hba.conf"
docker exec --user root "$POSTGRES_SERVICE_CONTAINER_ID" sh -ceu '
  chown postgres:postgres /var/lib/postgresql/data/pg_hba.conf
  chmod 600 /var/lib/postgresql/data/pg_hba.conf
'
hba_modified=1
docker exec --user postgres "$POSTGRES_SERVICE_CONTAINER_ID" \
  pg_ctl reload -D /var/lib/postgresql/data >/dev/null

hba_ready=0
for _ in $(seq 1 50); do
  if PGPASSWORD=postgres \
    PGSSLMODE=verify-full \
    PGSSLROOTCERT="$ca_certificate_path" \
    psql \
      --host "$database_hostname" \
      --port 5432 \
      --username postgres \
      --dbname leetplus_ci \
      --tuples-only \
      --no-align \
      --command "SELECT count(*) FROM pg_hba_file_rules WHERE error IS NULL" \
      2>/dev/null | grep -qx 7; then
    hba_ready=1
    break
  fi
  sleep 0.1
done
if [[ $hba_ready -ne 1 ]]; then
  printf 'Disposable PostgreSQL narrow HBA policy did not become ready.\n' >&2
  exit 66
fi

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
client_tls_ca_file = $ca_certificate_path
client_tls_cert_file = $server_certificate_path
client_tls_key_file = $server_key_path
client_tls_sslmode = verify-full
server_tls_ca_file = $ca_certificate_path
server_tls_sslmode = verify-full
ignore_startup_parameters = extra_float_digits
logfile = $log_path
pidfile = $pid_path
CONFIG

chmod 600 "$auth_path" "$config_path"
pgbouncer -q "$config_path" &
pooler_pid=$!

ready=0
for _ in $(seq 1 50); do
  if env \
    -u PGOPTIONS \
    PGPASSWORD=current187-ci-stats-only \
    PGSSLMODE=verify-full \
    PGSSLROOTCERT="$ca_certificate_path" \
    PGSSLCERT="$client_certificate_path" \
    PGSSLKEY="$client_key_path" \
    psql \
    --host 127.0.0.1 \
    --port 16432 \
    --username lp_pool_stats \
    --dbname pgbouncer \
    --command 'SHOW VERSION' >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.1
done
if [[ $ready -ne 1 ]]; then
  printf 'Disposable PgBouncer did not become ready.\n' >&2
  exit 66
fi

env \
  -u PGOPTIONS \
  CURRENT187_PGBOUNCER_CA_CERTIFICATE_PATH="$ca_certificate_path" \
  CURRENT187_PGBOUNCER_CLIENT_CERTIFICATE_PATH="$client_certificate_path" \
  CURRENT187_PGBOUNCER_CLIENT_PRIVATE_KEY_PATH="$client_key_path" \
  CURRENT187_PGBOUNCER_CLIENT_IDENTITY_PATH="$client_identity_path" \
  CURRENT187_PGBOUNCER_DATABASE_HOSTNAME="$database_hostname" \
  CURRENT187_PGBOUNCER_HOSTNAME="$pooler_hostname" \
  CURRENT187_PGBOUNCER_SERVER_CERTIFICATE_PATH="$server_certificate_path" \
  CURRENT187_PGBOUNCER_WRONG_CA_CERTIFICATE_PATH="$wrong_ca_certificate_path" \
  pnpm --filter database \
    test:integration:identity-mail-cluster-pgbouncer-current187
