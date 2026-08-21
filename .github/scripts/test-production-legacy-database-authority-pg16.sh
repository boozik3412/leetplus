#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'
umask 0077

[[ "${CI:-}" == true && "${GITHUB_ACTIONS:-}" == true ]] || {
  printf 'PG16 authority fixture is CI-only\n' >&2
  exit 1
}
[[ "$(id -u)" != 0 ]] || {
  printf 'PG16 authority fixture must run as the unprivileged runner\n' >&2
  exit 1
}

readonly REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly DEPLOY_ROOT="${REPOSITORY_ROOT}/docs/deployment/production-artifact"
readonly AUTHORITY_SQL="${DEPLOY_ROOT}/systemd/legacy-database-login-fence-authority.sql.example"
readonly FENCE="${DEPLOY_ROOT}/apply-legacy-database-login-fence.sh"
readonly TEST_ROOT="$(mktemp -d)"
trap 'rm -rf -- "$TEST_ROOT"' EXIT

for command_name in docker psql pg_isready sha256sum; do
  command -v "$command_name" >/dev/null 2>&1 || {
    printf 'missing PG16 fixture command: %s\n' "$command_name" >&2
    exit 1
  }
done
[[ "$(psql --version)" == psql\ \(PostgreSQL\)\ 16.* ]] || {
  printf 'PG16 authority fixture requires PostgreSQL client 16\n' >&2
  exit 1
}

export PGPASSWORD=postgres
for _ in {1..30}; do
  pg_isready -h 127.0.0.1 -p 5432 -U postgres -d leetplus >/dev/null 2>&1 && break
  sleep 1
done
pg_isready -h 127.0.0.1 -p 5432 -U postgres -d leetplus >/dev/null

psql_admin=(psql -h 127.0.0.1 -p 5432 -U postgres -d leetplus --no-psqlrc --set=ON_ERROR_STOP=1)
"${psql_admin[@]}" <<'SQL'
CREATE ROLE leetplus LOGIN PASSWORD 'application-fixture';
CREATE ROLE leetplus_legacy_rollback LOGIN PASSWORD 'rollback-fixture';
CREATE ROLE leetplus_fence_authority NOLOGIN;
CREATE ROLE leetplus_role_fencer LOGIN PASSWORD 'fencer-fixture';
CREATE ROLE leetplus_drain_audit LOGIN PASSWORD 'audit-fixture';

CREATE TABLE public."Tenant" ("id" text PRIMARY KEY, "slug" text NOT NULL UNIQUE);
CREATE TABLE public."Store" ("id" text PRIMARY KEY, "tenantId" text NOT NULL);
CREATE TABLE public."Product" ("id" text PRIMARY KEY, "tenantId" text NOT NULL);
CREATE TABLE public."User" ("id" text PRIMARY KEY, "tenantId" text NOT NULL, "email" text NOT NULL,
  "role" text NOT NULL, "isActive" boolean NOT NULL, "isPlatformAdmin" boolean NOT NULL);
CREATE TABLE public."UserStoreAccess" ("id" text PRIMARY KEY);
CREATE TABLE public."UserAccessRole" ("id" text PRIMARY KEY, "tenantId" text NOT NULL);
CREATE TABLE public."UserInvite" ("id" text PRIMARY KEY, "tenantId" text NOT NULL,
  "acceptedAt" timestamptz, "revokedAt" timestamptz, "expiresAt" timestamptz NOT NULL, "createdAt" timestamptz NOT NULL);
CREATE TABLE public."StaffChecklistTemplate" ("id" text PRIMARY KEY, "tenantId" text NOT NULL,
  "storeId" text, "status" text NOT NULL, "updatedAt" timestamptz NOT NULL);
CREATE TABLE public."StaffKnowledgeArticle" ("id" text PRIMARY KEY, "tenantId" text NOT NULL,
  "storeId" text, "status" text NOT NULL, "folder" text NOT NULL, "category" text NOT NULL, "updatedAt" timestamptz NOT NULL);
CREATE TABLE public."GuestGameLootBox" ("id" text PRIMARY KEY, "tenantId" text NOT NULL);
CREATE TABLE public."GuestGameMission" ("id" text PRIMARY KEY, "tenantId" text NOT NULL);
CREATE TABLE public."GuestGameSeason" ("id" text PRIMARY KEY, "tenantId" text NOT NULL);
CREATE TABLE public."StaffChatChannel" ("id" text PRIMARY KEY, "tenantId" text NOT NULL,
  "name" text NOT NULL, "isArchived" boolean NOT NULL);
CREATE TABLE public."StaffChatChannelMember" ("id" text PRIMARY KEY, "channelId" text NOT NULL, "userId" text NOT NULL);
SQL
"${psql_admin[@]}" --file "$AUTHORITY_SQL" >/dev/null

system_identifier="$("${psql_admin[@]}" --tuples-only --no-align --command='SELECT system_identifier FROM pg_catalog.pg_control_system()')"
[[ "$system_identifier" =~ ^[1-9][0-9]{15,24}$ ]]
cat > "$TEST_ROOT/pg_service.conf" <<'PGSERVICE'
[leetplus-drain-fence]
host=127.0.0.1
port=5432
dbname=leetplus
user=leetplus_role_fencer
password=fencer-fixture
sslmode=disable
PGSERVICE
cat > "$TEST_ROOT/database-target.conf" <<TARGET
DATABASE_NAME=leetplus
DATABASE_SERVER_ADDRESS=127.0.0.1
DATABASE_SERVER_PORT=5432
DATABASE_SYSTEM_IDENTIFIER=${system_identifier}
AUDIT_SESSION_USER=leetplus_drain_audit
FENCE_SESSION_USER=leetplus_role_fencer
FENCE_AUTHORITY_ROLE=leetplus_fence_authority
FENCE_FUNCTION_SCHEMA=leetplus_ops
FENCE_FUNCTION_NAME=apply_nminus1_legacy_login_fence
TARGET

run_fence() {
  env -u PGPASSWORD PATH="$PATH" /usr/bin/bash -p "$FENCE" \
    --pg-service-file "$TEST_ROOT/pg_service.conf" \
    --pg-service leetplus-drain-fence \
    --database-target "$TEST_ROOT/database-target.conf" \
    --unprivileged-test-mode
}
legacy_login() {
  "${psql_admin[@]}" --tuples-only --no-align --command="SELECT rolcanlogin FROM pg_catalog.pg_roles WHERE rolname='leetplus'"
}
reset_legacy_login() { "${psql_admin[@]}" --command='ALTER ROLE leetplus LOGIN' >/dev/null; }

psql_fencer_tcp=(
  psql -h 127.0.0.1 -p 5432 -U leetplus_role_fencer -d leetplus
  --no-psqlrc --set=ON_ERROR_STOP=1
)
expect_direct_fence_rejected() {
  local label="$1"
  local arguments="$2"
  if env PGPASSWORD=fencer-fixture "${psql_fencer_tcp[@]}" \
    --command="SELECT leetplus_ops.apply_nminus1_legacy_login_fence(${arguments})" \
    >"$TEST_ROOT/${label}.out" 2>&1; then
    printf 'direct database fence negative was unexpectedly accepted: %s\n' "$label" >&2
    exit 1
  fi
  [[ "$(legacy_login)" == t ]] || {
    printf 'direct database fence negative mutated the legacy login: %s\n' "$label" >&2
    exit 1
  }
}

# Every nullable function argument must make the complete target predicate
# fail closed. Plain `IF NOT (predicate)` treats SQL NULL as neither true nor
# false and used to reach ALTER ROLE; `IS NOT TRUE` must reject all five cases.
expect_direct_fence_rejected null-database \
  "NULL::text, '127.0.0.1', 5432, '${system_identifier}', 'leetplus_role_fencer'"
expect_direct_fence_rejected null-address \
  "'leetplus', NULL::text, 5432, '${system_identifier}', 'leetplus_role_fencer'"
expect_direct_fence_rejected null-port \
  "'leetplus', '127.0.0.1', NULL::integer, '${system_identifier}', 'leetplus_role_fencer'"
expect_direct_fence_rejected null-system-identifier \
  "'leetplus', '127.0.0.1', 5432, NULL::text, 'leetplus_role_fencer'"
expect_direct_fence_rejected null-session-user \
  "'leetplus', '127.0.0.1', 5432, '${system_identifier}', NULL::text"

# The GitHub PostgreSQL 16 service exposes TCP to the runner, but its real Unix
# socket remains inside the service container. Prove that the connection really
# has NULL inet identity and that this cannot satisfy the pinned TCP target.
postgres_service_containers="$(
  docker ps --filter status=running --filter publish=5432 --format '{{.ID}}'
)" || {
  printf 'cannot enumerate the PostgreSQL 16 service container\n' >&2
  exit 1
}
[[ "$postgres_service_containers" =~ ^[0-9a-f]{12,64}$ ]] || {
  printf 'PostgreSQL 16 service container identity is absent or ambiguous\n' >&2
  exit 1
}
socket_identity="$(
  docker exec --env PGPASSWORD=fencer-fixture "$postgres_service_containers" \
    psql -h /var/run/postgresql -p 5432 -U leetplus_role_fencer -d leetplus \
      --no-psqlrc --set=ON_ERROR_STOP=1 --tuples-only --no-align \
      --command="SELECT inet_server_addr() IS NULL, inet_server_port() IS NULL, session_user"
)" || {
  printf 'cannot establish the real PostgreSQL 16 Unix-socket negative\n' >&2
  exit 1
}
[[ "$socket_identity" == 't|t|leetplus_role_fencer' ]] || {
  printf 'PostgreSQL 16 Unix-socket identity probe is not exact\n' >&2
  exit 1
}
if docker exec --env PGPASSWORD=fencer-fixture "$postgres_service_containers" \
  psql -h /var/run/postgresql -p 5432 -U leetplus_role_fencer -d leetplus \
    --no-psqlrc --set=ON_ERROR_STOP=1 \
    --command="SELECT leetplus_ops.apply_nminus1_legacy_login_fence('leetplus', '127.0.0.1', 5432, '${system_identifier}', 'leetplus_role_fencer')" \
    >"$TEST_ROOT/unix-socket.out" 2>&1; then
  printf 'Unix-socket database fence was unexpectedly accepted as the TCP target\n' >&2
  exit 1
fi
[[ "$(legacy_login)" == t ]] || {
  printf 'Unix-socket database fence negative mutated the legacy login\n' >&2
  exit 1
}

# Wrong cluster identity must abort inside the same server transaction before
# the SECURITY DEFINER mutation executes.
sed "s/DATABASE_SYSTEM_IDENTIFIER=.*/DATABASE_SYSTEM_IDENTIFIER=9999999999999999/" \
  "$TEST_ROOT/database-target.conf" > "$TEST_ROOT/wrong-target.conf"
if env -u PGPASSWORD PATH="$PATH" /usr/bin/bash -p "$FENCE" \
  --pg-service-file "$TEST_ROOT/pg_service.conf" --pg-service leetplus-drain-fence \
  --database-target "$TEST_ROOT/wrong-target.conf" --unprivileged-test-mode \
  >"$TEST_ROOT/wrong-target.out" 2>&1; then
  printf 'wrong-target fence was unexpectedly accepted\n' >&2
  exit 1
fi
[[ "$(legacy_login)" == t ]]

# A fencer-owned non-system object is an authority drift, not an admissible
# extension of the role. The legacy login must remain untouched.
"${psql_admin[@]}" --command='CREATE SCHEMA hostile_fencer AUTHORIZATION leetplus_role_fencer' >/dev/null
if run_fence >"$TEST_ROOT/hostile-owner.out" 2>&1; then
  printf 'fencer-owned hostile schema was unexpectedly accepted\n' >&2
  exit 1
fi
[[ "$(legacy_login)" == t ]]
"${psql_admin[@]}" --command='DROP SCHEMA hostile_fencer' >/dev/null

"${psql_admin[@]}" --command='GRANT SELECT ON public."Tenant" TO leetplus_role_fencer' >/dev/null
if run_fence >"$TEST_ROOT/hostile-grant.out" 2>&1; then
  printf 'fencer data grant was unexpectedly accepted\n' >&2
  exit 1
fi
[[ "$(legacy_login)" == t ]]
"${psql_admin[@]}" --command='REVOKE SELECT ON public."Tenant" FROM leetplus_role_fencer' >/dev/null

"${psql_admin[@]}" --command='CREATE SCHEMA hostile_effective; GRANT USAGE ON SCHEMA hostile_effective TO leetplus_role_fencer' >/dev/null
if run_fence >"$TEST_ROOT/hostile-schema-grant.out" 2>&1; then
  printf 'fencer effective access to an extra schema was unexpectedly accepted\n' >&2
  exit 1
fi
[[ "$(legacy_login)" == t ]]
"${psql_admin[@]}" --command='REVOKE USAGE ON SCHEMA hostile_effective FROM leetplus_role_fencer; DROP SCHEMA hostile_effective' >/dev/null

"${psql_admin[@]}" --command='CREATE SEQUENCE leetplus_ops.hostile_sequence; GRANT USAGE ON SEQUENCE leetplus_ops.hostile_sequence TO leetplus_role_fencer' >/dev/null
if run_fence >"$TEST_ROOT/hostile-sequence-grant.out" 2>&1; then
  printf 'fencer sequence privilege outside the exact authority was unexpectedly accepted\n' >&2
  exit 1
fi
[[ "$(legacy_login)" == t ]]
"${psql_admin[@]}" --command='DROP SEQUENCE leetplus_ops.hostile_sequence' >/dev/null

"${psql_admin[@]}" --command="CREATE TYPE leetplus_ops.hostile_type AS ENUM ('hostile')" >/dev/null
if run_fence >"$TEST_ROOT/hostile-type.out" 2>&1; then
  printf 'effective use of an extra authority-schema type was unexpectedly accepted\n' >&2
  exit 1
fi
[[ "$(legacy_login)" == t ]]
"${psql_admin[@]}" --command='DROP TYPE leetplus_ops.hostile_type' >/dev/null

"${psql_admin[@]}" --command="CREATE FUNCTION leetplus_ops.hostile_function() RETURNS integer LANGUAGE sql AS 'SELECT 1'" >/dev/null
if run_fence >"$TEST_ROOT/hostile-function.out" 2>&1; then
  printf 'effective execution of an extra authority-schema function was unexpectedly accepted\n' >&2
  exit 1
fi
[[ "$(legacy_login)" == t ]]
"${psql_admin[@]}" --command='DROP FUNCTION leetplus_ops.hostile_function()' >/dev/null

"${psql_admin[@]}" --command='GRANT SELECT ON public."Tenant" TO leetplus_fence_authority' >/dev/null
if run_fence >"$TEST_ROOT/hostile-authority-grant.out" 2>&1; then
  printf 'NOLOGIN fence authority data privilege was unexpectedly accepted\n' >&2
  exit 1
fi
[[ "$(legacy_login)" == t ]]
"${psql_admin[@]}" --command='REVOKE SELECT ON public."Tenant" FROM leetplus_fence_authority' >/dev/null

"${psql_admin[@]}" --command='CREATE ROLE hostile_schema_grantee NOLOGIN; GRANT USAGE ON SCHEMA leetplus_ops TO hostile_schema_grantee' >/dev/null
if run_fence >"$TEST_ROOT/hostile-schema-acl.out" 2>&1; then
  printf 'extra authority-schema ACL grantee was unexpectedly accepted\n' >&2
  exit 1
fi
[[ "$(legacy_login)" == t ]]
"${psql_admin[@]}" --command='REVOKE USAGE ON SCHEMA leetplus_ops FROM hostile_schema_grantee; DROP ROLE hostile_schema_grantee' >/dev/null

"${psql_admin[@]}" --command='ALTER ROLE leetplus_role_fencer SUPERUSER' >/dev/null
if run_fence >"$TEST_ROOT/superuser-drift.out" 2>&1; then
  printf 'superuser fencer drift was unexpectedly accepted\n' >&2
  exit 1
fi
[[ "$(legacy_login)" == t ]]
"${psql_admin[@]}" --command='ALTER ROLE leetplus_role_fencer NOSUPERUSER' >/dev/null

"${psql_admin[@]}" --command="CREATE ROLE hostile_fence_member LOGIN PASSWORD 'hostile-fixture'" >/dev/null
"${psql_admin[@]}" --command='GRANT leetplus_fence_authority TO hostile_fence_member WITH ADMIN FALSE, INHERIT FALSE, SET TRUE' >/dev/null
if run_fence >"$TEST_ROOT/reverse-member-drift.out" 2>&1; then
  printf 'reverse authority membership drift was unexpectedly accepted\n' >&2
  exit 1
fi
[[ "$(legacy_login)" == t ]]
"${psql_admin[@]}" --command='REVOKE leetplus_fence_authority FROM hostile_fence_member; DROP ROLE hostile_fence_member' >/dev/null

"${psql_admin[@]}" --command="ALTER ROLE leetplus_role_fencer SET application_name = 'forged'" >/dev/null
if run_fence >"$TEST_ROOT/role-config-drift.out" 2>&1; then
  printf 'fencer role configuration drift was unexpectedly accepted\n' >&2
  exit 1
fi
[[ "$(legacy_login)" == t ]]
"${psql_admin[@]}" --command='ALTER ROLE leetplus_role_fencer RESET ALL' >/dev/null

"${psql_admin[@]}" --command='ALTER ROLE leetplus SUPERUSER' >/dev/null
if run_fence >"$TEST_ROOT/legacy-superuser-drift.out" 2>&1; then
  printf 'elevated legacy application role was unexpectedly accepted\n' >&2
  exit 1
fi
[[ "$(legacy_login)" == t ]]
"${psql_admin[@]}" --command='ALTER ROLE leetplus NOSUPERUSER' >/dev/null

"${psql_admin[@]}" --command='CREATE ROLE hostile_legacy_parent NOLOGIN; GRANT hostile_legacy_parent TO leetplus' >/dev/null
if run_fence >"$TEST_ROOT/legacy-direct-membership-drift.out" 2>&1; then
  printf 'legacy application role direct membership drift was unexpectedly accepted\n' >&2
  exit 1
fi
[[ "$(legacy_login)" == t ]]
"${psql_admin[@]}" --command='REVOKE hostile_legacy_parent FROM leetplus; DROP ROLE hostile_legacy_parent' >/dev/null

"${psql_admin[@]}" --command="ALTER ROLE leetplus SET application_name = 'forged-legacy'" >/dev/null
if run_fence >"$TEST_ROOT/legacy-config-drift.out" 2>&1; then
  printf 'legacy application role configuration drift was unexpectedly accepted\n' >&2
  exit 1
fi
[[ "$(legacy_login)" == t ]]
"${psql_admin[@]}" --command='ALTER ROLE leetplus RESET ALL' >/dev/null

before_authority="$("${psql_admin[@]}" --tuples-only --no-align --command="SELECT rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolconnlimit,rolconfig IS NULL FROM pg_roles WHERE rolname IN ('leetplus_fence_authority','leetplus_role_fencer') ORDER BY rolname")"
run_fence > "$TEST_ROOT/accepted.out"
grep -F -x 'LEGACY_DATABASE_LOGIN_FENCE_ACCEPTED=true' "$TEST_ROOT/accepted.out" >/dev/null
[[ "$(legacy_login)" == f ]]
after_authority="$("${psql_admin[@]}" --tuples-only --no-align --command="SELECT rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolconnlimit,rolconfig IS NULL FROM pg_roles WHERE rolname IN ('leetplus_fence_authority','leetplus_role_fencer') ORDER BY rolname")"
[[ "$before_authority" == "$after_authority" ]] || {
  printf 'authority attributes drifted during accepted fence\n' >&2
  exit 1
}

reset_legacy_login
printf 'production legacy database authority PG16 fixture: PASS\n'
