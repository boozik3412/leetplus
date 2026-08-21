#!/usr/bin/bash -p
# Irreversible first-cutover fence. A narrowly callable, source-pinned
# PostgreSQL 16 SECURITY DEFINER function owns the only ALTER ROLE authority.

[[ $- == *p* ]] || { printf 'apply-legacy-database-login-fence: privileged Bash mode is required\n' >&2; exit 1; }
LEETPLUS_BOOTSTRAP_TEST_PATH=''
LEETPLUS_BOOTSTRAP_IS_TEST=false
declare -a LEETPLUS_BOOTSTRAP_TEST_ENVIRONMENT=()
for LEETPLUS_BOOTSTRAP_ARGUMENT in "$@"; do
  if [[ "$LEETPLUS_BOOTSTRAP_ARGUMENT" == '--unprivileged-test-mode' && EUID -ne 0 ]]; then
    LEETPLUS_BOOTSTRAP_IS_TEST=true
    LEETPLUS_BOOTSTRAP_TEST_PATH="${PATH:-}"
    break
  fi
done
unset LEETPLUS_BOOTSTRAP_ARGUMENT
if [[ "$LEETPLUS_BOOTSTRAP_IS_TEST" == true ]]; then
  while IFS= read -r LEETPLUS_INHERITED_ENVIRONMENT_NAME; do
    [[ "$LEETPLUS_INHERITED_ENVIRONMENT_NAME" == TEST_* || "$LEETPLUS_INHERITED_ENVIRONMENT_NAME" == LEETPLUS_TEST_* ]] \
      && LEETPLUS_BOOTSTRAP_TEST_ENVIRONMENT+=("${LEETPLUS_INHERITED_ENVIRONMENT_NAME}=${!LEETPLUS_INHERITED_ENVIRONMENT_NAME}")
  done < <(compgen -e)
fi
while IFS= read -r LEETPLUS_INHERITED_ENVIRONMENT_NAME; do
  unset "$LEETPLUS_INHERITED_ENVIRONMENT_NAME" 2>/dev/null || true
done < <(compgen -e)
unset LEETPLUS_INHERITED_ENVIRONMENT_NAME
PATH='/usr/sbin:/usr/bin:/sbin:/bin'
LANG='C.UTF-8'
LC_ALL='C.UTF-8'
TZ='UTC'
export PATH LANG LC_ALL TZ
if [[ "$LEETPLUS_BOOTSTRAP_IS_TEST" == true ]]; then
  for LEETPLUS_BOOTSTRAP_TEST_ASSIGNMENT in "${LEETPLUS_BOOTSTRAP_TEST_ENVIRONMENT[@]}"; do export "$LEETPLUS_BOOTSTRAP_TEST_ASSIGNMENT"; done
fi
unset LEETPLUS_BOOTSTRAP_IS_TEST LEETPLUS_BOOTSTRAP_TEST_ENVIRONMENT LEETPLUS_BOOTSTRAP_TEST_ASSIGNMENT

set -euo pipefail
IFS=$'\n\t'
umask 0077

die() { printf 'apply-legacy-database-login-fence: %s\n' "$*" >&2; exit 1; }

pg_service_file='/etc/leetplus/pg_service.conf'
pg_service='leetplus-drain-fence'
database_target='/etc/leetplus/legacy-drain-database-target.conf'
test_mode=false
while (($# > 0)); do
  case "$1" in
    --pg-service-file) pg_service_file="${2:-}"; shift 2 ;;
    --pg-service) pg_service="${2:-}"; shift 2 ;;
    --database-target) database_target="${2:-}"; shift 2 ;;
    --unprivileged-test-mode) test_mode=true; shift ;;
    *) die "unknown argument: $1" ;;
  esac
done
if [[ "$test_mode" == true ]]; then
  ((EUID != 0)) || die 'unprivileged test mode is forbidden for root'
  PATH="$LEETPLUS_BOOTSTRAP_TEST_PATH"
  export PATH
else
  ((EUID == 0)) || die 'production database fence requires root'
  [[ "$pg_service_file" == '/etc/leetplus/pg_service.conf' && "$pg_service" == 'leetplus-drain-fence' \
    && "$database_target" == '/etc/leetplus/legacy-drain-database-target.conf' ]] \
    || die 'production database-fence inputs cannot be overridden'
fi
unset LEETPLUS_BOOTSTRAP_TEST_PATH

for command_name in awk env psql stat timeout; do
  command -v "$command_name" >/dev/null 2>&1 || die "required command is unavailable: ${command_name}"
done
for protected_file in "$pg_service_file" "$database_target"; do
  [[ -f "$protected_file" && ! -L "$protected_file" ]] || die "protected file is absent or symlinked: ${protected_file}"
  if [[ "$test_mode" == false ]]; then
    [[ "$(stat -c '%U:%G:%a:%h' -- "$protected_file")" == 'root:root:600:1' ]] \
      || die "protected file must be root:root mode 0600 and single-linked: ${protected_file}"
  fi
done

declare -A target=()
while IFS='=' read -r key value; do
  [[ -z "$key" || "$key" == \#* ]] && continue
  [[ "$key" =~ ^[A-Z][A-Z0-9_]*$ && "$value" =~ ^[A-Za-z0-9_.:-]+$ && -z "${target[$key]:-}" ]] \
    || die 'database target file is malformed'
  target[$key]="$value"
done < "$database_target"
[[ "${target[DATABASE_NAME]:-}" == leetplus \
  && "${target[DATABASE_SERVER_ADDRESS]:-}" == 127.0.0.1 \
  && "${target[DATABASE_SERVER_PORT]:-}" == 5432 \
  && "${target[DATABASE_SYSTEM_IDENTIFIER]:-}" =~ ^[1-9][0-9]{15,24}$ \
  && "${target[FENCE_SESSION_USER]:-}" == leetplus_role_fencer \
  && "${target[FENCE_AUTHORITY_ROLE]:-}" == leetplus_fence_authority \
  && "${target[FENCE_FUNCTION_SCHEMA]:-}" == leetplus_ops \
  && "${target[FENCE_FUNCTION_NAME]:-}" == apply_nminus1_legacy_login_fence \
  && ${#target[@]} == 9 ]] \
  || die 'database fence target identity is incomplete or noncanonical'

result="$(timeout --foreground --kill-after=3s 30s env \
  PGCONNECT_TIMEOUT=5 \
  PGOPTIONS='-c statement_timeout=15000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=15000' \
  PGSERVICEFILE="$pg_service_file" PGSERVICE="$pg_service" \
  psql --no-psqlrc --set=ON_ERROR_STOP=1 --tuples-only --no-align \
    --set=expected_database="${target[DATABASE_NAME]}" \
    --set=expected_address="${target[DATABASE_SERVER_ADDRESS]}" \
    --set=expected_port="${target[DATABASE_SERVER_PORT]}" \
    --set=expected_system="${target[DATABASE_SYSTEM_IDENTIFIER]}" \
    --set=expected_user="${target[FENCE_SESSION_USER]}" <<'SQL'
BEGIN;
SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('leetplus:nminus1:legacy-login-fence:v2', 0));
SELECT 1 / CASE WHEN (
  session_user::text = :'expected_user'
  AND (
    SELECT count(*) FROM pg_catalog.pg_roles
    WHERE rolname = 'leetplus'
      AND rolinherit AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
      AND NOT rolreplication AND NOT rolbypassrls
      AND rolconnlimit = -1 AND rolvaliduntil IS NULL AND rolconfig IS NULL
  ) = 1
  AND (
    SELECT count(*) FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles member_role ON member_role.oid = membership.member
    WHERE member_role.rolname = 'leetplus'
  ) = 0
  AND (
    SELECT count(*) FROM pg_catalog.pg_roles
    WHERE rolname = 'leetplus_legacy_rollback'
      AND rolcanlogin AND NOT rolinherit AND NOT rolsuper
      AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls
      AND rolconnlimit = 20 AND rolvaliduntil IS NULL AND rolconfig IS NULL
  ) = 1
  AND (
    SELECT count(*) FROM pg_catalog.pg_roles
    WHERE rolname = 'leetplus_fence_authority'
      AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper
      AND NOT rolcreatedb AND rolcreaterole AND NOT rolreplication AND NOT rolbypassrls
      AND rolconnlimit = 0 AND rolvaliduntil IS NULL AND rolconfig IS NULL
  ) = 1
  AND (
    SELECT count(*) FROM pg_catalog.pg_roles
    WHERE rolname = 'leetplus_role_fencer'
      AND rolcanlogin AND NOT rolinherit AND NOT rolsuper
      AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls
      AND rolconnlimit = 1 AND rolvaliduntil IS NULL AND rolconfig IS NULL
  ) = 1
  AND (
    SELECT count(*) FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles parent_role ON parent_role.oid = membership.roleid
    JOIN pg_catalog.pg_roles member_role ON member_role.oid = membership.member
    WHERE parent_role.rolname = 'leetplus'
      AND member_role.rolname = 'leetplus_legacy_rollback'
      AND NOT membership.admin_option AND NOT membership.inherit_option AND membership.set_option
  ) = 1
  AND (
    SELECT count(*) FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles parent_role ON parent_role.oid = membership.roleid
    JOIN pg_catalog.pg_roles member_role ON member_role.oid = membership.member
    WHERE parent_role.rolname = 'leetplus'
      AND member_role.rolname = 'leetplus_fence_authority'
      AND membership.admin_option AND NOT membership.inherit_option AND NOT membership.set_option
  ) = 1
  AND (
    SELECT count(*) FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles parent_role ON parent_role.oid = membership.roleid
    WHERE parent_role.rolname = 'leetplus'
  ) = 2
  AND (
    SELECT count(*) FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles member_role ON member_role.oid = membership.member
    WHERE member_role.rolname = 'leetplus_legacy_rollback'
  ) = 1
  AND (
    SELECT count(*) FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles member_role ON member_role.oid = membership.member
    WHERE member_role.rolname = 'leetplus_fence_authority'
  ) = 1
  AND (
    SELECT count(*) FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles member_role ON member_role.oid = membership.member
    WHERE member_role.rolname = 'leetplus_role_fencer'
  ) = 0
  AND (
    SELECT count(*) FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles parent_role ON parent_role.oid = membership.roleid
    WHERE parent_role.rolname IN ('leetplus_fence_authority', 'leetplus_role_fencer')
  ) = 0
  AND (
    SELECT count(*)
    FROM pg_catalog.pg_proc fn
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = fn.pronamespace
    JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = fn.proowner
    JOIN pg_catalog.pg_language language ON language.oid = fn.prolang
    WHERE namespace.nspname = 'leetplus_ops'
      AND namespace.nspowner = owner_role.oid
      AND owner_role.rolname = 'leetplus_fence_authority'
      AND fn.proname = 'apply_nminus1_legacy_login_fence'
      AND pg_catalog.pg_get_function_identity_arguments(fn.oid) =
        'expected_database text, expected_address text, expected_port integer, expected_system_identifier text, expected_session_user text'
      AND pg_catalog.format_type(fn.prorettype, NULL) = 'text'
      AND fn.prosecdef AND fn.provolatile = 'v' AND fn.proparallel = 'u'
      AND fn.prokind = 'f' AND language.lanname = 'plpgsql'
      AND fn.proconfig = ARRAY['search_path=pg_catalog']::text[]
      AND fn.prosrc = $leetplus_expected_source$
DECLARE
  observed_system_identifier text;
BEGIN
  SELECT system_identifier::text
  INTO STRICT observed_system_identifier
  FROM pg_catalog.pg_control_system();

  IF (
    current_database() = expected_database
    AND pg_catalog.inet_server_addr()::text = expected_address
    AND pg_catalog.inet_server_port() = expected_port
    AND observed_system_identifier = expected_system_identifier
    AND session_user::text = expected_session_user
    AND current_user::text = 'leetplus_fence_authority'
    AND expected_session_user = 'leetplus_role_fencer'
    AND (
      SELECT count(*)
      FROM pg_catalog.pg_roles
      WHERE rolname = 'leetplus'
        AND rolinherit AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
        AND NOT rolreplication AND NOT rolbypassrls
        AND rolconnlimit = -1 AND rolvaliduntil IS NULL AND rolconfig IS NULL
    ) = 1
    AND (
      SELECT count(*)
      FROM pg_catalog.pg_auth_members membership
      JOIN pg_catalog.pg_roles member_role ON member_role.oid = membership.member
      WHERE member_role.rolname = 'leetplus'
    ) = 0
    AND (
      SELECT count(*)
      FROM pg_catalog.pg_roles
      WHERE rolname = 'leetplus_legacy_rollback'
        AND rolcanlogin AND NOT rolinherit AND NOT rolsuper
        AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls
        AND rolconnlimit = 20 AND rolvaliduntil IS NULL AND rolconfig IS NULL
    ) = 1
    AND (
      SELECT count(*)
      FROM pg_catalog.pg_auth_members membership
      JOIN pg_catalog.pg_roles parent_role ON parent_role.oid = membership.roleid
      JOIN pg_catalog.pg_roles member_role ON member_role.oid = membership.member
      WHERE parent_role.rolname = 'leetplus'
        AND member_role.rolname = 'leetplus_legacy_rollback'
        AND NOT membership.admin_option
        AND NOT membership.inherit_option
        AND membership.set_option
    ) = 1
    AND (
      SELECT count(*)
      FROM pg_catalog.pg_roles
      WHERE rolname = 'leetplus_fence_authority'
        AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper
        AND NOT rolcreatedb AND rolcreaterole AND NOT rolreplication AND NOT rolbypassrls
        AND rolconnlimit = 0 AND rolvaliduntil IS NULL AND rolconfig IS NULL
    ) = 1
    AND (
      SELECT count(*)
      FROM pg_catalog.pg_roles
      WHERE rolname = 'leetplus_role_fencer'
        AND rolcanlogin AND NOT rolinherit AND NOT rolsuper
        AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls
        AND rolconnlimit = 1 AND rolvaliduntil IS NULL AND rolconfig IS NULL
    ) = 1
    AND (
      SELECT count(*)
      FROM pg_catalog.pg_auth_members membership
      JOIN pg_catalog.pg_roles parent_role ON parent_role.oid = membership.roleid
      JOIN pg_catalog.pg_roles member_role ON member_role.oid = membership.member
      WHERE parent_role.rolname = 'leetplus'
        AND member_role.rolname = 'leetplus_fence_authority'
        AND membership.admin_option
        AND NOT membership.inherit_option
        AND NOT membership.set_option
    ) = 1
    AND (
      SELECT count(*)
      FROM pg_catalog.pg_auth_members membership
      JOIN pg_catalog.pg_roles parent_role ON parent_role.oid = membership.roleid
      WHERE parent_role.rolname = 'leetplus'
    ) = 2
    AND (
      SELECT count(*)
      FROM pg_catalog.pg_auth_members membership
      JOIN pg_catalog.pg_roles member_role ON member_role.oid = membership.member
      WHERE member_role.rolname = 'leetplus_legacy_rollback'
    ) = 1
    AND (
      SELECT count(*)
      FROM pg_catalog.pg_auth_members membership
      JOIN pg_catalog.pg_roles member_role ON member_role.oid = membership.member
      WHERE member_role.rolname = 'leetplus_fence_authority'
    ) = 1
    AND (
      SELECT count(*)
      FROM pg_catalog.pg_auth_members membership
      JOIN pg_catalog.pg_roles member_role ON member_role.oid = membership.member
      WHERE member_role.rolname = 'leetplus_role_fencer'
    ) = 0
    AND (
      SELECT count(*)
      FROM pg_catalog.pg_auth_members membership
      JOIN pg_catalog.pg_roles parent_role ON parent_role.oid = membership.roleid
      WHERE parent_role.rolname IN ('leetplus_fence_authority', 'leetplus_role_fencer')
    ) = 0
    AND NOT pg_catalog.has_database_privilege('leetplus_role_fencer', current_database(), 'TEMPORARY')
    AND NOT pg_catalog.has_database_privilege('leetplus_role_fencer', current_database(), 'CREATE')
    AND pg_catalog.has_database_privilege('leetplus_role_fencer', current_database(), 'CONNECT')
    AND NOT pg_catalog.has_database_privilege('leetplus_fence_authority', current_database(), 'CONNECT')
    AND NOT pg_catalog.has_database_privilege('leetplus_fence_authority', current_database(), 'TEMPORARY')
    AND NOT pg_catalog.has_database_privilege('leetplus_fence_authority', current_database(), 'CREATE')
    AND NOT pg_catalog.has_schema_privilege('leetplus_role_fencer', 'public', 'USAGE')
    AND NOT pg_catalog.has_schema_privilege('leetplus_role_fencer', 'public', 'CREATE')
    AND pg_catalog.has_schema_privilege('leetplus_role_fencer', 'leetplus_ops', 'USAGE')
    AND NOT pg_catalog.has_schema_privilege('leetplus_role_fencer', 'leetplus_ops', 'CREATE')
    AND pg_catalog.has_schema_privilege('leetplus_fence_authority', 'leetplus_ops', 'USAGE')
    AND pg_catalog.has_schema_privilege('leetplus_fence_authority', 'leetplus_ops', 'CREATE')
    AND (
      SELECT count(*) FROM pg_catalog.pg_namespace namespace
      WHERE namespace.nspname NOT LIKE 'pg_%' AND namespace.nspname <> 'information_schema'
        AND namespace.nspname <> 'leetplus_ops'
        AND (pg_catalog.has_schema_privilege('leetplus_role_fencer', namespace.oid, 'USAGE')
          OR pg_catalog.has_schema_privilege('leetplus_role_fencer', namespace.oid, 'CREATE'))
    ) = 0
    AND (
      SELECT count(*) FROM pg_catalog.pg_namespace namespace
      WHERE namespace.nspname NOT LIKE 'pg_%' AND namespace.nspname <> 'information_schema'
        AND namespace.nspname <> 'leetplus_ops'
        AND (pg_catalog.has_schema_privilege('leetplus_fence_authority', namespace.oid, 'USAGE')
          OR pg_catalog.has_schema_privilege('leetplus_fence_authority', namespace.oid, 'CREATE'))
    ) = 0
    AND (
      SELECT count(*) FROM pg_catalog.pg_database database
      JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = database.datdba
      WHERE owner_role.rolname IN ('leetplus_fence_authority', 'leetplus_role_fencer')
    ) = 0
    AND (
      SELECT count(*) FROM pg_catalog.pg_namespace namespace
      JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = namespace.nspowner
      WHERE owner_role.rolname = 'leetplus_role_fencer'
        OR (owner_role.rolname = 'leetplus_fence_authority' AND namespace.nspname <> 'leetplus_ops')
    ) = 0
    AND (
      SELECT count(*) FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = relation.relowner
      WHERE owner_role.rolname IN ('leetplus_fence_authority', 'leetplus_role_fencer')
    ) = 0
    AND (
      SELECT count(*) FROM pg_catalog.pg_type type
      JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = type.typowner
      WHERE owner_role.rolname IN ('leetplus_fence_authority', 'leetplus_role_fencer')
    ) = 0
    AND (
      SELECT count(*) FROM pg_catalog.pg_proc function
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = function.pronamespace
      JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = function.proowner
      WHERE owner_role.rolname = 'leetplus_role_fencer'
        OR (owner_role.rolname = 'leetplus_fence_authority'
          AND NOT (namespace.nspname = 'leetplus_ops' AND function.proname = 'apply_nminus1_legacy_login_fence'
            AND pg_catalog.pg_get_function_identity_arguments(function.oid) =
              'expected_database text, expected_address text, expected_port integer, expected_system_identifier text, expected_session_user text'))
    ) = 0
    AND (
      SELECT count(*) FROM pg_catalog.pg_default_acl default_acl
      JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = default_acl.defaclrole
      WHERE owner_role.rolname IN ('leetplus_fence_authority', 'leetplus_role_fencer')
    ) = 0
    AND (
      SELECT count(*) FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
      CROSS JOIN (VALUES ('leetplus_fence_authority'), ('leetplus_role_fencer')) AS inspected_role(role_name)
      WHERE namespace.nspname NOT LIKE 'pg_%' AND namespace.nspname <> 'information_schema'
        AND relation.relkind IN ('r', 'v', 'm', 'f', 'p')
        AND pg_catalog.has_table_privilege(inspected_role.role_name, relation.oid,
          'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    ) = 0
    AND (
      SELECT count(*) FROM pg_catalog.pg_class sequence_relation
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = sequence_relation.relnamespace
      CROSS JOIN (VALUES ('leetplus_fence_authority'), ('leetplus_role_fencer')) AS inspected_role(role_name)
      WHERE namespace.nspname NOT LIKE 'pg_%' AND namespace.nspname <> 'information_schema'
        AND sequence_relation.relkind = 'S'
        AND (pg_catalog.has_sequence_privilege(inspected_role.role_name, sequence_relation.oid, 'USAGE')
          OR pg_catalog.has_sequence_privilege(inspected_role.role_name, sequence_relation.oid, 'SELECT')
          OR pg_catalog.has_sequence_privilege(inspected_role.role_name, sequence_relation.oid, 'UPDATE'))
    ) = 0
    AND (
      SELECT count(*) FROM pg_catalog.pg_type type
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = type.typnamespace
      CROSS JOIN (VALUES ('leetplus_fence_authority'), ('leetplus_role_fencer')) AS inspected_role(role_name)
      WHERE namespace.nspname NOT LIKE 'pg_%' AND namespace.nspname <> 'information_schema'
        AND pg_catalog.has_schema_privilege(inspected_role.role_name, namespace.oid, 'USAGE')
        AND pg_catalog.has_type_privilege(inspected_role.role_name, type.oid, 'USAGE')
    ) = 0
    AND (
      SELECT count(*) FROM pg_catalog.pg_proc function
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = function.pronamespace
      CROSS JOIN (VALUES ('leetplus_fence_authority'), ('leetplus_role_fencer')) AS inspected_role(role_name)
      WHERE namespace.nspname NOT LIKE 'pg_%' AND namespace.nspname <> 'information_schema'
        AND NOT (namespace.nspname = 'leetplus_ops' AND function.proname = 'apply_nminus1_legacy_login_fence'
          AND pg_catalog.pg_get_function_identity_arguments(function.oid) =
            'expected_database text, expected_address text, expected_port integer, expected_system_identifier text, expected_session_user text')
        AND pg_catalog.has_schema_privilege(inspected_role.role_name, namespace.oid, 'USAGE')
        AND pg_catalog.has_function_privilege(inspected_role.role_name, function.oid, 'EXECUTE')
    ) = 0
    AND (
      SELECT count(*) FROM pg_catalog.pg_proc function
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = function.pronamespace
      WHERE function.prosecdef AND namespace.nspname NOT LIKE 'pg_%'
        AND NOT (namespace.nspname = 'leetplus_ops' AND function.proname = 'apply_nminus1_legacy_login_fence'
          AND pg_catalog.pg_get_function_identity_arguments(function.oid) =
            'expected_database text, expected_address text, expected_port integer, expected_system_identifier text, expected_session_user text')
        AND pg_catalog.has_function_privilege('leetplus_role_fencer', function.oid, 'EXECUTE')
    ) = 0
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'database fence target or least-privilege authority mismatch';
  END IF;

  EXECUTE 'ALTER ROLE leetplus NOLOGIN';

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_roles
    WHERE rolname = 'leetplus' AND NOT rolcanlogin
      AND rolinherit AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
      AND NOT rolreplication AND NOT rolbypassrls
      AND rolconnlimit = -1 AND rolvaliduntil IS NULL AND rolconfig IS NULL
  ) <> 1 THEN
    RAISE EXCEPTION 'database fence postcondition mismatch';
  END IF;

  RETURN pg_catalog.concat_ws('|',
    current_database(),
    pg_catalog.inet_server_addr()::text,
    pg_catalog.inet_server_port()::text,
    observed_system_identifier,
    session_user::text,
    'true'
  );
END
$leetplus_expected_source$
  ) = 1
  AND (
    SELECT count(*)
    FROM pg_catalog.pg_proc fn
    CROSS JOIN LATERAL pg_catalog.aclexplode(pg_catalog.coalesce(fn.proacl, pg_catalog.acldefault('f', fn.proowner))) acl
    JOIN pg_catalog.pg_roles grantee ON grantee.oid = acl.grantee
    JOIN pg_catalog.pg_roles grantor ON grantor.oid = acl.grantor
    WHERE fn.oid = 'leetplus_ops.apply_nminus1_legacy_login_fence(text,text,integer,text,text)'::regprocedure
      AND acl.privilege_type = 'EXECUTE' AND NOT acl.is_grantable
      AND grantor.rolname = 'leetplus_fence_authority'
      AND grantee.rolname IN ('leetplus_fence_authority', 'leetplus_role_fencer')
  ) = 2
  AND (
    SELECT count(*)
    FROM pg_catalog.pg_proc fn
    CROSS JOIN LATERAL pg_catalog.aclexplode(pg_catalog.coalesce(fn.proacl, pg_catalog.acldefault('f', fn.proowner))) acl
    WHERE fn.oid = 'leetplus_ops.apply_nminus1_legacy_login_fence(text,text,integer,text,text)'::regprocedure
  ) = 2
  AND (
    SELECT count(*)
    FROM pg_catalog.pg_namespace namespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(pg_catalog.coalesce(namespace.nspacl, pg_catalog.acldefault('n', namespace.nspowner))) acl
    LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid = acl.grantee
    JOIN pg_catalog.pg_roles grantor ON grantor.oid = acl.grantor
    WHERE namespace.nspname = 'leetplus_ops'
      AND grantor.rolname = 'leetplus_fence_authority'
      AND ((grantee.rolname = 'leetplus_fence_authority' AND acl.privilege_type IN ('USAGE', 'CREATE'))
        OR (grantee.rolname = 'leetplus_role_fencer' AND acl.privilege_type = 'USAGE'))
  ) = 3
  AND (
    SELECT count(*)
    FROM pg_catalog.pg_namespace namespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(pg_catalog.coalesce(namespace.nspacl, pg_catalog.acldefault('n', namespace.nspowner))) acl
    WHERE namespace.nspname = 'leetplus_ops'
  ) = 3
  AND (
    SELECT count(*)
    FROM pg_catalog.pg_proc fn
    CROSS JOIN LATERAL pg_catalog.aclexplode(pg_catalog.coalesce(fn.proacl, pg_catalog.acldefault('f', fn.proowner))) acl
    JOIN pg_catalog.pg_roles grantee ON grantee.oid = acl.grantee
    WHERE fn.oid = 'pg_catalog.pg_control_system()'::regprocedure
      AND grantee.rolname = 'leetplus_fence_authority'
      AND acl.privilege_type = 'EXECUTE' AND NOT acl.is_grantable
  ) = 1
) THEN 1 ELSE 0 END;
SELECT leetplus_ops.apply_nminus1_legacy_login_fence(
  :'expected_database', :'expected_address', :'expected_port'::integer,
  :'expected_system', :'expected_user'
);
SELECT 1 / CASE WHEN (
  session_user::text = :'expected_user'
  AND (SELECT count(*) FROM pg_catalog.pg_roles
    WHERE rolname = 'leetplus' AND NOT rolcanlogin
      AND rolinherit AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
      AND NOT rolreplication AND NOT rolbypassrls
      AND rolconnlimit = -1 AND rolvaliduntil IS NULL AND rolconfig IS NULL) = 1
  AND (SELECT count(*) FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles member_role ON member_role.oid = membership.member
    WHERE member_role.rolname = 'leetplus') = 0
  AND (
    SELECT count(*) FROM pg_catalog.pg_roles
    WHERE rolname = 'leetplus_fence_authority'
      AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper
      AND NOT rolcreatedb AND rolcreaterole AND NOT rolreplication AND NOT rolbypassrls
      AND rolconnlimit = 0 AND rolvaliduntil IS NULL AND rolconfig IS NULL
  ) = 1
  AND (
    SELECT count(*) FROM pg_catalog.pg_roles
    WHERE rolname = 'leetplus_role_fencer'
      AND rolcanlogin AND NOT rolinherit AND NOT rolsuper
      AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls
      AND rolconnlimit = 1 AND rolvaliduntil IS NULL AND rolconfig IS NULL
  ) = 1
  AND (
    SELECT count(*) FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles parent_role ON parent_role.oid = membership.roleid
    JOIN pg_catalog.pg_roles member_role ON member_role.oid = membership.member
    WHERE parent_role.rolname = 'leetplus'
      AND member_role.rolname = 'leetplus_fence_authority'
      AND membership.admin_option AND NOT membership.inherit_option AND NOT membership.set_option
  ) = 1
  AND (
    SELECT count(*) FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles parent_role ON parent_role.oid = membership.roleid
    WHERE parent_role.rolname = 'leetplus'
  ) = 2
  AND (
    SELECT count(*) FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles member_role ON member_role.oid = membership.member
    WHERE member_role.rolname = 'leetplus_legacy_rollback'
  ) = 1
  AND (
    SELECT count(*) FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles member_role ON member_role.oid = membership.member
    WHERE member_role.rolname = 'leetplus_fence_authority'
  ) = 1
  AND (
    SELECT count(*) FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles member_role ON member_role.oid = membership.member
    WHERE member_role.rolname = 'leetplus_role_fencer'
  ) = 0
  AND (
    SELECT count(*) FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles parent_role ON parent_role.oid = membership.roleid
    WHERE parent_role.rolname IN ('leetplus_fence_authority', 'leetplus_role_fencer')
  ) = 0
) THEN 1 ELSE 0 END;
COMMIT;
SQL
)" || die 'database login fence transaction failed or timed out'
result="$(awk -F'|' 'NF == 6 { last = $0 } END { print last }' <<< "$result")"
IFS='|' read -r observed_database observed_address observed_port observed_system observed_user observed_fenced <<< "$result"
[[ "$observed_database" == "${target[DATABASE_NAME]}" \
  && "$observed_address" == "${target[DATABASE_SERVER_ADDRESS]}" \
  && "$observed_port" == "${target[DATABASE_SERVER_PORT]}" \
  && "$observed_system" == "${target[DATABASE_SYSTEM_IDENTIFIER]}" \
  && "$observed_user" == "${target[FENCE_SESSION_USER]}" \
  && "$observed_fenced" == true ]] \
  || die 'database login fence target/role attestation failed'

printf 'LEGACY_DATABASE_LOGIN_FENCE_ACCEPTED=true\n'
printf 'LEGACY_DATABASE_LOGIN_ROLE=leetplus\n'
printf 'LEGACY_DATABASE_LOGIN_FENCE_AUTHORITY=leetplus_fence_authority\n'
