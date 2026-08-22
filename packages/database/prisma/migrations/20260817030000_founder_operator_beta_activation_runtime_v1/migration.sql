-- Dedicated execute-only runtime boundary for founder beta activation.
-- The cluster role is deliberately provisioned outside Prisma migrations.

ALTER FUNCTION public."founder_operator_beta_tenant_activate_v2"(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT, TEXT, TEXT, TEXT, BYTEA, TIMESTAMP(3) WITH TIME ZONE
)
RENAME TO "founder_operator_beta_tenant_activate_unattested_private_v2";

CREATE FUNCTION public."founder_operator_beta_activation_runtime_assert_v1"()
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  required_role_name CONSTANT TEXT :=
    'leetplus_founder_beta_activation_runtime';
  required_function_oid OID :=
    'public."founder_operator_beta_tenant_activate_v2"(
      TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
      TEXT, TEXT, TEXT, TEXT, BYTEA, TIMESTAMP(3) WITH TIME ZONE
    )'::REGPROCEDURE::OID;
  session_role_oid OID;
  role_record pg_catalog.pg_roles%ROWTYPE;
  membership_count BIGINT;
  role_setting_count BIGINT;
  owned_object_count BIGINT;
  direct_relation_acl_count BIGINT;
  direct_routine_execute_count BIGINT;
  direct_routine_grant_option_count BIGINT;
  direct_required_function_count BIGINT;
  public_required_function_execute_count BIGINT;
  effective_security_definer_count BIGINT;
  effective_required_security_definer_count BIGINT;
BEGIN
  IF session_user <> required_role_name THEN
    RAISE EXCEPTION 'Founder beta activation runtime role is not admitted'
      USING ERRCODE = '42501';
  END IF;

  SELECT role.*
  INTO role_record
  FROM pg_catalog.pg_roles AS role
  WHERE role.rolname = session_user;

  session_role_oid := role_record.oid;

  IF session_role_oid IS NULL
     OR role_record.rolcanlogin IS NOT TRUE
     OR role_record.rolinherit IS NOT FALSE
     OR role_record.rolsuper IS NOT FALSE
     OR role_record.rolcreaterole IS NOT FALSE
     OR role_record.rolcreatedb IS NOT FALSE
     OR role_record.rolreplication IS NOT FALSE
     OR role_record.rolbypassrls IS NOT FALSE
     OR role_record.rolconfig IS NOT NULL
  THEN
    RAISE EXCEPTION 'Founder beta activation runtime role attributes drifted'
      USING ERRCODE = '42501';
  END IF;

  SELECT pg_catalog.count(*)
  INTO membership_count
  FROM pg_catalog.pg_auth_members AS membership
  WHERE membership.roleid = session_role_oid
     OR membership.member = session_role_oid
     OR membership.grantor = session_role_oid;

  SELECT pg_catalog.count(*)
  INTO role_setting_count
  FROM pg_catalog.pg_db_role_setting AS setting
  WHERE setting.setrole = session_role_oid;

  SELECT pg_catalog.count(*)
  INTO owned_object_count
  FROM (
    SELECT relation.oid
    FROM pg_catalog.pg_class AS relation
    WHERE relation.relowner = session_role_oid
    UNION ALL
    SELECT routine.oid
    FROM pg_catalog.pg_proc AS routine
    WHERE routine.proowner = session_role_oid
    UNION ALL
    SELECT type.oid
    FROM pg_catalog.pg_type AS type
    WHERE type.typowner = session_role_oid
    UNION ALL
    SELECT namespace.oid
    FROM pg_catalog.pg_namespace AS namespace
    WHERE namespace.nspowner = session_role_oid
  ) AS owned;

  SELECT pg_catalog.count(*)
  INTO direct_relation_acl_count
  FROM pg_catalog.pg_class AS relation
  CROSS JOIN LATERAL pg_catalog.aclexplode(relation.relacl) AS privilege
  WHERE privilege.grantee = session_role_oid;

  SELECT
    pg_catalog.count(*) FILTER (
      WHERE privilege.privilege_type = 'EXECUTE'
    ),
    pg_catalog.count(*) FILTER (
      WHERE privilege.privilege_type = 'EXECUTE'
        AND privilege.is_grantable
    ),
    pg_catalog.count(*) FILTER (
      WHERE privilege.privilege_type = 'EXECUTE'
        AND routine.oid = required_function_oid
    )
  INTO
    direct_routine_execute_count,
    direct_routine_grant_option_count,
    direct_required_function_count
  FROM pg_catalog.pg_proc AS routine
  CROSS JOIN LATERAL pg_catalog.aclexplode(routine.proacl) AS privilege
  WHERE privilege.grantee = session_role_oid;

  SELECT pg_catalog.count(*)
  INTO public_required_function_execute_count
  FROM pg_catalog.pg_proc AS routine
  CROSS JOIN LATERAL pg_catalog.aclexplode(routine.proacl) AS privilege
  WHERE routine.oid = required_function_oid
    AND privilege.grantee = 0
    AND privilege.privilege_type = 'EXECUTE';

  SELECT
    pg_catalog.count(*),
    pg_catalog.count(*) FILTER (WHERE routine.oid = required_function_oid)
  INTO
    effective_security_definer_count,
    effective_required_security_definer_count
  FROM pg_catalog.pg_proc AS routine
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = routine.pronamespace
  WHERE namespace.nspname = 'public'
    AND routine.prosecdef
    AND pg_catalog.has_function_privilege(
      session_user,
      routine.oid,
      'EXECUTE'
    );

  IF membership_count <> 0
     OR role_setting_count <> 0
     OR owned_object_count <> 0
     OR direct_relation_acl_count <> 0
     OR direct_routine_execute_count <> 1
     OR direct_routine_grant_option_count <> 0
     OR direct_required_function_count <> 1
     OR public_required_function_execute_count <> 0
     OR effective_security_definer_count <> 1
     OR effective_required_security_definer_count <> 1
     OR NOT pg_catalog.has_database_privilege(
       session_user,
       pg_catalog.current_database(),
       'CONNECT'
     )
     OR pg_catalog.has_database_privilege(
       session_user,
       pg_catalog.current_database(),
       'CREATE'
     )
     OR pg_catalog.has_database_privilege(
       session_user,
       pg_catalog.current_database(),
       'TEMPORARY'
     )
     OR NOT pg_catalog.has_schema_privilege(session_user, 'public', 'USAGE')
     OR pg_catalog.has_schema_privilege(session_user, 'public', 'CREATE')
  THEN
    RAISE EXCEPTION 'Founder beta activation runtime privileges drifted'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION public."founder_operator_beta_tenant_activate_v2"(
  candidate_activation_command_id TEXT,
  expected_go_id TEXT,
  expected_tenant_id TEXT,
  activation_request_id TEXT,
  activation_request_digest TEXT,
  expected_release_sha TEXT,
  expected_environment TEXT,
  activated_by_user_id TEXT,
  issue_request_id TEXT,
  issue_request_digest TEXT,
  candidate_issue_command_id TEXT,
  candidate_invite_id TEXT,
  candidate_outbox_id TEXT,
  candidate_message_key TEXT,
  candidate_token_hash TEXT,
  candidate_secret_ciphertext BYTEA,
  candidate_invite_expires_at TIMESTAMP(3) WITH TIME ZONE
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  PERFORM public."founder_operator_beta_activation_runtime_assert_v1"();
  RETURN public."founder_operator_beta_tenant_activate_unattested_private_v2"(
    candidate_activation_command_id,
    expected_go_id,
    expected_tenant_id,
    activation_request_id,
    activation_request_digest,
    expected_release_sha,
    expected_environment,
    activated_by_user_id,
    issue_request_id,
    issue_request_digest,
    candidate_issue_command_id,
    candidate_invite_id,
    candidate_outbox_id,
    candidate_message_key,
    candidate_token_hash,
    candidate_secret_ciphertext,
    candidate_invite_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public."founder_operator_beta_tenant_activate_v2"(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
    TEXT, TEXT, TEXT, TEXT, BYTEA, TIMESTAMP(3) WITH TIME ZONE
  )
FROM PUBLIC;
REVOKE ALL ON FUNCTION
  public."founder_operator_beta_tenant_activate_unattested_private_v2"(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
    TEXT, TEXT, TEXT, TEXT, BYTEA, TIMESTAMP(3) WITH TIME ZONE
  )
FROM PUBLIC;
REVOKE ALL ON FUNCTION
  public."founder_operator_beta_activation_runtime_assert_v1"()
FROM PUBLIC;

COMMENT ON FUNCTION
  public."founder_operator_beta_tenant_activate_v2"(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
    TEXT, TEXT, TEXT, TEXT, BYTEA, TIMESTAMP(3) WITH TIME ZONE
  )
IS 'Founder beta activation wrapper requiring the exact live least-privilege session role. Runtime EXECUTE is granted only by reviewed external enrollment.';
COMMENT ON FUNCTION
  public."founder_operator_beta_tenant_activate_unattested_private_v2"(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
    TEXT, TEXT, TEXT, TEXT, BYTEA, TIMESTAMP(3) WITH TIME ZONE
  )
IS 'Private v2 activation implementation. Direct runtime EXECUTE is forbidden.';
