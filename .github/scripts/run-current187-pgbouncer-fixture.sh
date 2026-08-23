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
if [[ ! "${POSTGRES_SERVICE_CONTAINER_ID:-}" =~ ^[0-9a-f]{64}$ ]]; then
  printf 'PostgreSQL service container identity is unavailable.\n' >&2
  exit 65
fi

mapfile -t postgres_network_gateways < <(
  docker inspect \
    --format '{{range .NetworkSettings.Networks}}{{.Gateway}}{{"\n"}}{{end}}' \
    "$POSTGRES_SERVICE_CONTAINER_ID" |
    sed '/^[[:space:]]*$/d'
)
if [[ ${#postgres_network_gateways[@]} -ne 1 ]]; then
  printf 'PostgreSQL service must expose exactly one Docker network gateway.\n' >&2
  exit 65
fi
postgres_client_address="${postgres_network_gateways[0]}"
if [[ ! "$postgres_client_address" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  printf 'PostgreSQL service Docker network gateway is not an IPv4 address.\n' >&2
  exit 65
fi
IFS='.' read -r -a postgres_client_octets <<<"$postgres_client_address"
for postgres_client_octet in "${postgres_client_octets[@]}"; do
  if ((10#$postgres_client_octet > 255)); then
    printf 'PostgreSQL service Docker network gateway is outside IPv4 bounds.\n' >&2
    exit 65
  fi
done
postgres_client_cidr="$postgres_client_address/32"

if [[ -z "${HOME:-}" || ! -d "$HOME" ]]; then
  printf 'HOME is unavailable for the external CURRENT187 signer fixture.\n' >&2
  exit 65
fi
fixture_root="$(mktemp -d "$RUNNER_TEMP/leetplus-current187-pgbouncer-XXXXXX")"
if ! signer_root="$(mktemp -d "$HOME/leetplus-current187-signer-XXXXXX")"; then
  rmdir "$fixture_root"
  printf 'External CURRENT187 signer root could not be created.\n' >&2
  exit 65
fi
if ! chmod 700 "$signer_root"; then
  rmdir "$signer_root"
  rmdir "$fixture_root"
  printf 'External CURRENT187 signer root permissions could not be sealed.\n' >&2
  exit 65
fi
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
signer_private_key_path="$signer_root/signer-private.pk8"
signer_public_key_path="$signer_root/signer-public.spki"
signer_key_id="current187-connection-probe-r10-ci-1"
signer_not_before="$(date -u -d '5 minutes ago' '+%Y-%m-%dT%H:%M:%S.000Z')"
signer_not_after="$(date -u -d '30 minutes' '+%Y-%m-%dT%H:%M:%S.000Z')"
original_hba_path="$fixture_root/pg_hba.before.conf"
fixture_hba_path="$fixture_root/pg_hba.fixture.conf"
original_auto_conf_path="$fixture_root/postgresql.auto.conf.before"
hosts_backup_path="$fixture_root/hosts.before"
pooler_pid=""
hosts_modified=0
hba_modified=0
auto_conf_modified=0
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
  if [[ $auto_conf_modified -eq 1 && -f "$original_auto_conf_path" ]]; then
    docker cp \
      "$original_auto_conf_path" \
      "$POSTGRES_SERVICE_CONTAINER_ID:/var/lib/postgresql/data/postgresql.auto.conf" \
      >/dev/null 2>&1 || status=1
    docker exec --user root "$POSTGRES_SERVICE_CONTAINER_ID" sh -ceu '
      chown postgres:postgres /var/lib/postgresql/data/postgresql.auto.conf
      chmod 600 /var/lib/postgresql/data/postgresql.auto.conf
    ' >/dev/null 2>&1 || status=1
    if docker restart "$POSTGRES_SERVICE_CONTAINER_ID" >/dev/null 2>&1; then
      postgres_restored=0
      for _ in $(seq 1 100); do
        if docker exec --user postgres "$POSTGRES_SERVICE_CONTAINER_ID" \
          pg_isready --dbname postgres >/dev/null 2>&1; then
          postgres_restored=1
          break
        fi
        sleep 0.1
      done
      if [[ $postgres_restored -ne 1 ]]; then
        status=1
      else
        docker exec --user root "$POSTGRES_SERVICE_CONTAINER_ID" \
          rm -f -- \
            /var/lib/postgresql/data/current187-ca.crt \
            /var/lib/postgresql/data/current187-server.crt \
            /var/lib/postgresql/data/current187-server.key \
          >/dev/null 2>&1 || status=1
      fi
    else
      status=1
    fi
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
  if [[ "$signer_root" == "$HOME"/leetplus-current187-signer-* ]]; then
    rm -f -- "$signer_private_key_path" "$signer_public_key_path"
    rmdir "$signer_root" || status=1
  else
    status=1
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

openssl genpkey \
  -algorithm ED25519 \
  -outform DER \
  -out "$signer_private_key_path" >/dev/null 2>&1
openssl pkey \
  -in "$signer_private_key_path" \
  -inform DER \
  -pubout \
  -outform DER \
  -out "$signer_public_key_path" >/dev/null 2>&1
chmod 600 "$signer_private_key_path"
chmod 644 "$signer_public_key_path"
signer_public_key_sha256="$(sha256sum "$signer_public_key_path" | awk '{print $1}')"
if [[ ! "$signer_public_key_sha256" =~ ^[0-9a-f]{64}$ ]]; then
  printf 'Disposable CURRENT187 signer public-key pin is invalid.\n' >&2
  exit 66
fi

docker cp \
  "$POSTGRES_SERVICE_CONTAINER_ID:/var/lib/postgresql/data/postgresql.auto.conf" \
  "$original_auto_conf_path"

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
auto_conf_modified=1
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
cat >"$fixture_hba_path" <<HBA
local all all scram-sha-256
hostssl leetplus_ci postgres $postgres_client_cidr scram-sha-256
hostssl leetplus_ci lp_application $postgres_client_cidr scram-sha-256
hostssl leetplus_ci lp_coordinator $postgres_client_cidr scram-sha-256
hostssl leetplus_ci lp_migration $postgres_client_cidr scram-sha-256
hostssl leetplus_ci lp_worker $postgres_client_cidr scram-sha-256
hostssl leetplus_ci lp_wrong $postgres_client_cidr scram-sha-256
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
  CURRENT187_CONNECTION_PROBE_SIGNER_PRIVATE_KEY_PATH="$signer_private_key_path" \
  CURRENT187_CONNECTION_PROBE_SIGNER_PUBLIC_KEY_PATH="$signer_public_key_path" \
  CURRENT187_CONNECTION_PROBE_SIGNER_PUBLIC_KEY_SHA256="$signer_public_key_sha256" \
  CURRENT187_CONNECTION_PROBE_SIGNER_KEY_ID="$signer_key_id" \
  CURRENT187_CONNECTION_PROBE_SIGNER_NOT_BEFORE="$signer_not_before" \
  CURRENT187_CONNECTION_PROBE_SIGNER_NOT_AFTER="$signer_not_after" \
  pnpm --filter database \
    test:integration:identity-mail-cluster-pgbouncer-current187
