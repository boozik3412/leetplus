export const CURRENT187_CONTROL_IDENTITY_SQL = `
/* current187:control_identity */
SELECT
  control.system_identifier::text AS "systemIdentifier",
  current_setting('server_version_num')::integer AS "serverVersionNum",
  control.catalog_version_no::integer AS "catalogVersionNo",
  control.pg_control_version::integer AS "controlVersion",
  current_database()::text AS "databaseName",
  session_user::text AS "sessionUser",
  current_user::text AS "currentUser",
  pg_catalog.host(inet_server_addr())::text AS "serverAddress",
  inet_server_port()::integer AS "serverPort",
  role_entry.rolcanlogin AS "scannerCanLogin",
  role_entry.rolsuper AS "scannerSuperuser",
  role_entry.rolcreaterole AS "scannerCreateRole",
  role_entry.rolcreatedb AS "scannerCreateDatabase",
  role_entry.rolreplication AS "scannerReplication",
  role_entry.rolbypassrls AS "scannerBypassRls"
FROM pg_catalog.pg_control_system() AS control
JOIN pg_catalog.pg_roles AS role_entry
  ON role_entry.rolname = session_user
`;

export const CURRENT187_BACKEND_IDENTITY_SQL = `
/* current187:backend_identity */
SELECT
  current_database()::text AS "databaseName",
  database_entry.oid::text AS "databaseOid",
  session_user::text AS "sessionUser",
  current_user::text AS "currentUser",
  pg_catalog.host(inet_server_addr())::text AS "serverAddress",
  inet_server_port()::integer AS "serverPort",
  role_entry.rolcanlogin AS "scannerCanLogin",
  role_entry.rolsuper AS "scannerSuperuser",
  role_entry.rolcreaterole AS "scannerCreateRole",
  role_entry.rolcreatedb AS "scannerCreateDatabase",
  role_entry.rolreplication AS "scannerReplication",
  role_entry.rolbypassrls AS "scannerBypassRls"
FROM pg_catalog.pg_database AS database_entry
JOIN pg_catalog.pg_roles AS role_entry
  ON role_entry.rolname = session_user
WHERE database_entry.datname = current_database()
`;

export const CURRENT187_DATABASE_SNAPSHOT_SQL = `
/* current187:database_snapshot */
SELECT
  database_entry.datname::text AS "name",
  database_entry.oid::text AS "oid",
  owner_entry.rolname::text AS "ownerName",
  owner_entry.oid::text AS "ownerOid",
  database_entry.datallowconn AS "datallowconn",
  database_entry.datconnlimit::integer AS "connectionLimit",
  pg_catalog.pg_encoding_to_char(database_entry.encoding)::text AS "encoding",
  CASE database_entry.datlocprovider
    WHEN 'i' THEN 'icu'
    WHEN 'b' THEN 'builtin'
    ELSE 'libc'
  END::text AS "localeProvider",
  database_entry.datcollate::text AS "collate",
  database_entry.datctype::text AS "ctype",
  database_entry.datistemplate AS "isTemplate"
FROM pg_catalog.pg_database AS database_entry
JOIN pg_catalog.pg_roles AS owner_entry
  ON owner_entry.oid = database_entry.datdba
ORDER BY database_entry.datname, database_entry.oid
`;

const ROLE_SURFACE_SQL = `
/* current187:surface:roles */
SELECT pg_catalog.jsonb_build_object(
  'name', role_entry.rolname,
  'oid', role_entry.oid::text,
  'superuser', role_entry.rolsuper,
  'inherit', role_entry.rolinherit,
  'createRole', role_entry.rolcreaterole,
  'createDatabase', role_entry.rolcreatedb,
  'canLogin', role_entry.rolcanlogin,
  'replication', role_entry.rolreplication,
  'bypassRls', role_entry.rolbypassrls,
  'connectionLimit', role_entry.rolconnlimit,
  'validUntil', role_entry.rolvaliduntil,
  'config', role_entry.rolconfig
)::text AS evidence
FROM pg_catalog.pg_roles AS role_entry
WHERE role_entry.rolname !~ '^pg_'
ORDER BY role_entry.rolname, role_entry.oid
`;

const MEMBERSHIP_SURFACE_SQL = `
/* current187:surface:memberships */
WITH direct_memberships AS (
  SELECT pg_catalog.jsonb_build_object(
    'kind', 'DIRECT',
    'memberName', member_entry.rolname,
    'memberOid', member_entry.oid::text,
    'roleName', role_entry.rolname,
    'roleOid', role_entry.oid::text,
    'grantorName', grantor_entry.rolname,
    'grantorOid', grantor_entry.oid::text,
    'adminOption', membership_entry.admin_option,
    'inheritOption', membership_entry.inherit_option,
    'setOption', membership_entry.set_option
  )::text AS evidence
  FROM pg_catalog.pg_auth_members AS membership_entry
  JOIN pg_catalog.pg_roles AS member_entry
    ON member_entry.oid = membership_entry.member
  JOIN pg_catalog.pg_roles AS role_entry
    ON role_entry.oid = membership_entry.roleid
  JOIN pg_catalog.pg_roles AS grantor_entry
    ON grantor_entry.oid = membership_entry.grantor
), effective_memberships AS (
  SELECT pg_catalog.jsonb_build_object(
    'kind', 'EFFECTIVE',
    'memberName', member_entry.rolname,
    'memberOid', member_entry.oid::text,
    'roleName', role_entry.rolname,
    'roleOid', role_entry.oid::text,
    'member', pg_catalog.pg_has_role(member_entry.oid, role_entry.oid, 'MEMBER'),
    'usage', pg_catalog.pg_has_role(member_entry.oid, role_entry.oid, 'USAGE'),
    'set', pg_catalog.pg_has_role(member_entry.oid, role_entry.oid, 'SET')
  )::text AS evidence
  FROM pg_catalog.pg_roles AS member_entry
  CROSS JOIN pg_catalog.pg_roles AS role_entry
  WHERE member_entry.rolname !~ '^pg_'
)
SELECT evidence FROM direct_memberships
UNION ALL
SELECT evidence FROM effective_memberships
ORDER BY evidence
`;

const ROLE_SETTING_SURFACE_SQL = `
/* current187:surface:role_database_settings */
SELECT pg_catalog.jsonb_build_object(
  'roleName', COALESCE(role_entry.rolname, 'ALL'),
  'roleOid', setting_entry.setrole::text,
  'databaseName', COALESCE(database_entry.datname, 'ALL'),
  'databaseOid', setting_entry.setdatabase::text,
  'setting', setting_value.value
)::text AS evidence
FROM pg_catalog.pg_db_role_setting AS setting_entry
LEFT JOIN pg_catalog.pg_roles AS role_entry
  ON role_entry.oid = setting_entry.setrole
LEFT JOIN pg_catalog.pg_database AS database_entry
  ON database_entry.oid = setting_entry.setdatabase
CROSS JOIN LATERAL pg_catalog.unnest(setting_entry.setconfig) AS setting_value(value)
ORDER BY setting_entry.setrole, setting_entry.setdatabase, setting_value.value
`;

const OWNED_OBJECT_SURFACE_SQL = `
/* current187:surface:owned_objects */
SELECT pg_catalog.jsonb_build_object(
  'databaseName', database_entry.datname,
  'databaseOid', dependency_entry.dbid::text,
  'ownerName', owner_entry.rolname,
  'ownerOid', dependency_entry.refobjid::text,
  'classOid', dependency_entry.classid::text,
  'objectOid', dependency_entry.objid::text,
  'objectSubId', dependency_entry.objsubid,
  'dependencyType', dependency_entry.deptype,
  'identity', pg_catalog.pg_describe_object(
    dependency_entry.classid,
    dependency_entry.objid,
    dependency_entry.objsubid
  )
)::text AS evidence
FROM pg_catalog.pg_shdepend AS dependency_entry
JOIN pg_catalog.pg_roles AS owner_entry
  ON owner_entry.oid = dependency_entry.refobjid
LEFT JOIN pg_catalog.pg_database AS database_entry
  ON database_entry.oid = dependency_entry.dbid
WHERE dependency_entry.refclassid = 'pg_catalog.pg_authid'::pg_catalog.regclass
  AND dependency_entry.deptype = 'o'
  AND dependency_entry.dbid IN (0, (
    SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database()
  ))
ORDER BY dependency_entry.refobjid, dependency_entry.classid, dependency_entry.objid, dependency_entry.objsubid
`;

const DATABASE_SECURITY_SURFACE_SQL = `
/* current187:surface:database_security */
WITH current_database_entry AS (
  SELECT *
  FROM pg_catalog.pg_database
  WHERE datname = current_database()
), direct_acl AS (
  SELECT pg_catalog.jsonb_build_object(
    'kind', 'DIRECT',
    'databaseName', database_entry.datname,
    'databaseOid', database_entry.oid::text,
    'ownerName', owner_entry.rolname,
    'ownerOid', owner_entry.oid::text,
    'granteeName', CASE
      WHEN acl_entry.grantee = 0 THEN 'PUBLIC'
      ELSE grantee_entry.rolname
    END,
    'granteeOid', acl_entry.grantee::text,
    'grantorName', grantor_entry.rolname,
    'grantorOid', acl_entry.grantor::text,
    'privilege', acl_entry.privilege_type,
    'grantable', acl_entry.is_grantable
  )::text AS evidence
  FROM current_database_entry AS database_entry
  JOIN pg_catalog.pg_roles AS owner_entry ON owner_entry.oid = database_entry.datdba
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(database_entry.datacl, pg_catalog.acldefault('d', database_entry.datdba))
  ) AS acl_entry
  LEFT JOIN pg_catalog.pg_roles AS grantee_entry ON grantee_entry.oid = acl_entry.grantee
  JOIN pg_catalog.pg_roles AS grantor_entry ON grantor_entry.oid = acl_entry.grantor
), effective_acl AS (
  SELECT pg_catalog.jsonb_build_object(
    'kind', 'EFFECTIVE',
    'databaseName', database_entry.datname,
    'databaseOid', database_entry.oid::text,
    'roleName', role_entry.rolname,
    'roleOid', role_entry.oid::text,
    'connect', pg_catalog.has_database_privilege(role_entry.oid, database_entry.oid, 'CONNECT'),
    'create', pg_catalog.has_database_privilege(role_entry.oid, database_entry.oid, 'CREATE'),
    'temporary', pg_catalog.has_database_privilege(role_entry.oid, database_entry.oid, 'TEMPORARY')
  )::text AS evidence
  FROM current_database_entry AS database_entry
  CROSS JOIN pg_catalog.pg_roles AS role_entry
  WHERE role_entry.rolname !~ '^pg_'
)
SELECT evidence FROM direct_acl
UNION ALL
SELECT evidence FROM effective_acl
ORDER BY evidence
`;

const SCHEMA_SURFACE_SQL = `
/* current187:surface:schemas */
SELECT pg_catalog.jsonb_build_object(
  'name', namespace_entry.nspname,
  'oid', namespace_entry.oid::text,
  'ownerName', owner_entry.rolname,
  'ownerOid', owner_entry.oid::text
)::text AS evidence
FROM pg_catalog.pg_namespace AS namespace_entry
JOIN pg_catalog.pg_roles AS owner_entry ON owner_entry.oid = namespace_entry.nspowner
WHERE namespace_entry.nspname !~ '^pg_toast'
  AND namespace_entry.nspname !~ '^pg_temp_'
ORDER BY namespace_entry.nspname, namespace_entry.oid
`;

const SCHEMA_ACL_SURFACE_SQL = `
/* current187:surface:schema_acl_all_grantees */
SELECT pg_catalog.jsonb_build_object(
  'schemaName', namespace_entry.nspname,
  'schemaOid', namespace_entry.oid::text,
  'ownerOid', namespace_entry.nspowner::text,
  'granteeName', CASE WHEN acl_entry.grantee = 0 THEN 'PUBLIC' ELSE grantee_entry.rolname END,
  'granteeOid', acl_entry.grantee::text,
  'grantorName', grantor_entry.rolname,
  'grantorOid', acl_entry.grantor::text,
  'privilege', acl_entry.privilege_type,
  'grantable', acl_entry.is_grantable
)::text AS evidence
FROM pg_catalog.pg_namespace AS namespace_entry
CROSS JOIN LATERAL pg_catalog.aclexplode(
  COALESCE(namespace_entry.nspacl, pg_catalog.acldefault('n', namespace_entry.nspowner))
) AS acl_entry
LEFT JOIN pg_catalog.pg_roles AS grantee_entry ON grantee_entry.oid = acl_entry.grantee
JOIN pg_catalog.pg_roles AS grantor_entry ON grantor_entry.oid = acl_entry.grantor
WHERE namespace_entry.nspname !~ '^pg_toast'
  AND namespace_entry.nspname !~ '^pg_temp_'
ORDER BY namespace_entry.nspname, acl_entry.grantee, acl_entry.privilege_type
`;

const RELATION_SURFACE_SQL = `
/* current187:surface:relations */
SELECT pg_catalog.jsonb_build_object(
  'schemaName', namespace_entry.nspname,
  'name', relation_entry.relname,
  'oid', relation_entry.oid::text,
  'kind', relation_entry.relkind,
  'persistence', relation_entry.relpersistence,
  'ownerName', owner_entry.rolname,
  'ownerOid', owner_entry.oid::text,
  'rowSecurity', relation_entry.relrowsecurity,
  'forceRowSecurity', relation_entry.relforcerowsecurity,
  'replicaIdentity', relation_entry.relreplident,
  'isPartition', relation_entry.relispartition,
  'partitionKey', CASE
    WHEN relation_entry.relkind = 'p' THEN pg_catalog.pg_get_partkeydef(relation_entry.oid)
    ELSE NULL
  END,
  'partitionBound', pg_catalog.pg_get_expr(relation_entry.relpartbound, relation_entry.oid, true),
  'definition', CASE
    WHEN relation_entry.relkind IN ('v', 'm') THEN pg_catalog.pg_get_viewdef(relation_entry.oid, true)
    ELSE NULL
  END
)::text AS evidence
FROM pg_catalog.pg_class AS relation_entry
JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = relation_entry.relnamespace
JOIN pg_catalog.pg_roles AS owner_entry ON owner_entry.oid = relation_entry.relowner
WHERE namespace_entry.nspname !~ '^pg_toast'
  AND namespace_entry.nspname !~ '^pg_temp_'
  AND relation_entry.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
ORDER BY namespace_entry.nspname, relation_entry.relname, relation_entry.oid
`;

const RELATION_ACL_SURFACE_SQL = `
/* current187:surface:relation_acl_all_grantees */
SELECT pg_catalog.jsonb_build_object(
  'schemaName', namespace_entry.nspname,
  'relationName', relation_entry.relname,
  'relationOid', relation_entry.oid::text,
  'relationKind', relation_entry.relkind,
  'ownerOid', relation_entry.relowner::text,
  'granteeName', CASE WHEN acl_entry.grantee = 0 THEN 'PUBLIC' ELSE grantee_entry.rolname END,
  'granteeOid', acl_entry.grantee::text,
  'grantorName', grantor_entry.rolname,
  'grantorOid', acl_entry.grantor::text,
  'privilege', acl_entry.privilege_type,
  'grantable', acl_entry.is_grantable
)::text AS evidence
FROM pg_catalog.pg_class AS relation_entry
JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = relation_entry.relnamespace
CROSS JOIN LATERAL pg_catalog.aclexplode(
  COALESCE(
    relation_entry.relacl,
    pg_catalog.acldefault(
      CASE WHEN relation_entry.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END,
      relation_entry.relowner
    )
  )
) AS acl_entry
LEFT JOIN pg_catalog.pg_roles AS grantee_entry ON grantee_entry.oid = acl_entry.grantee
JOIN pg_catalog.pg_roles AS grantor_entry ON grantor_entry.oid = acl_entry.grantor
WHERE namespace_entry.nspname !~ '^pg_toast'
  AND namespace_entry.nspname !~ '^pg_temp_'
  AND relation_entry.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
ORDER BY namespace_entry.nspname, relation_entry.relname, acl_entry.grantee, acl_entry.privilege_type
`;

const COLUMN_SURFACE_SQL = `
/* current187:surface:columns */
SELECT pg_catalog.jsonb_build_object(
  'schemaName', namespace_entry.nspname,
  'relationName', relation_entry.relname,
  'relationOid', relation_entry.oid::text,
  'name', attribute_entry.attname,
  'number', attribute_entry.attnum,
  'typeOid', attribute_entry.atttypid::text,
  'typeModifier', attribute_entry.atttypmod,
  'notNull', attribute_entry.attnotnull,
  'identity', attribute_entry.attidentity,
  'generated', attribute_entry.attgenerated,
  'storage', attribute_entry.attstorage,
  'compression', attribute_entry.attcompression,
  'collationOid', attribute_entry.attcollation::text,
  'defaultExpression', pg_catalog.pg_get_expr(default_entry.adbin, default_entry.adrelid, true)
)::text AS evidence
FROM pg_catalog.pg_attribute AS attribute_entry
JOIN pg_catalog.pg_class AS relation_entry ON relation_entry.oid = attribute_entry.attrelid
JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = relation_entry.relnamespace
LEFT JOIN pg_catalog.pg_attrdef AS default_entry
  ON default_entry.adrelid = attribute_entry.attrelid
 AND default_entry.adnum = attribute_entry.attnum
WHERE attribute_entry.attnum > 0
  AND NOT attribute_entry.attisdropped
  AND namespace_entry.nspname !~ '^pg_toast'
  AND namespace_entry.nspname !~ '^pg_temp_'
  AND relation_entry.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
ORDER BY namespace_entry.nspname, relation_entry.relname, attribute_entry.attnum
`;

const COLUMN_ACL_SURFACE_SQL = `
/* current187:surface:column_acl_all_grantees */
SELECT pg_catalog.jsonb_build_object(
  'schemaName', namespace_entry.nspname,
  'relationName', relation_entry.relname,
  'relationOid', relation_entry.oid::text,
  'columnName', attribute_entry.attname,
  'columnNumber', attribute_entry.attnum,
  'granteeName', CASE WHEN acl_entry.grantee = 0 THEN 'PUBLIC' ELSE grantee_entry.rolname END,
  'granteeOid', acl_entry.grantee::text,
  'grantorName', grantor_entry.rolname,
  'grantorOid', acl_entry.grantor::text,
  'privilege', acl_entry.privilege_type,
  'grantable', acl_entry.is_grantable
)::text AS evidence
FROM pg_catalog.pg_attribute AS attribute_entry
JOIN pg_catalog.pg_class AS relation_entry ON relation_entry.oid = attribute_entry.attrelid
JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = relation_entry.relnamespace
CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS acl_entry
LEFT JOIN pg_catalog.pg_roles AS grantee_entry ON grantee_entry.oid = acl_entry.grantee
JOIN pg_catalog.pg_roles AS grantor_entry ON grantor_entry.oid = acl_entry.grantor
WHERE attribute_entry.attnum > 0
  AND NOT attribute_entry.attisdropped
  AND namespace_entry.nspname !~ '^pg_toast'
  AND namespace_entry.nspname !~ '^pg_temp_'
ORDER BY namespace_entry.nspname, relation_entry.relname, attribute_entry.attnum, acl_entry.grantee, acl_entry.privilege_type
`;

const SEQUENCE_SURFACE_SQL = `
/* current187:surface:sequences */
SELECT pg_catalog.jsonb_build_object(
  'schemaName', namespace_entry.nspname,
  'name', relation_entry.relname,
  'oid', relation_entry.oid::text,
  'dataTypeOid', sequence_entry.seqtypid::text,
  'start', sequence_entry.seqstart::text,
  'increment', sequence_entry.seqincrement::text,
  'maximum', sequence_entry.seqmax::text,
  'minimum', sequence_entry.seqmin::text,
  'cache', sequence_entry.seqcache::text,
  'cycle', sequence_entry.seqcycle
)::text AS evidence
FROM pg_catalog.pg_sequence AS sequence_entry
JOIN pg_catalog.pg_class AS relation_entry ON relation_entry.oid = sequence_entry.seqrelid
JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = relation_entry.relnamespace
WHERE namespace_entry.nspname !~ '^pg_toast'
  AND namespace_entry.nspname !~ '^pg_temp_'
ORDER BY namespace_entry.nspname, relation_entry.relname, relation_entry.oid
`;

const TYPE_SURFACE_SQL = `
/* current187:surface:types */
SELECT pg_catalog.jsonb_build_object(
  'schemaName', namespace_entry.nspname,
  'name', type_entry.typname,
  'oid', type_entry.oid::text,
  'ownerName', owner_entry.rolname,
  'ownerOid', owner_entry.oid::text,
  'kind', type_entry.typtype,
  'category', type_entry.typcategory,
  'relationOid', type_entry.typrelid::text,
  'elementOid', type_entry.typelem::text,
  'baseTypeOid', type_entry.typbasetype::text,
  'notNull', type_entry.typnotnull,
  'default', type_entry.typdefault,
  'collationOid', type_entry.typcollation::text
)::text AS evidence
FROM pg_catalog.pg_type AS type_entry
JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = type_entry.typnamespace
JOIN pg_catalog.pg_roles AS owner_entry ON owner_entry.oid = type_entry.typowner
WHERE namespace_entry.nspname !~ '^pg_toast'
  AND namespace_entry.nspname !~ '^pg_temp_'
ORDER BY namespace_entry.nspname, type_entry.typname, type_entry.oid
`;

const TYPE_ACL_SURFACE_SQL = `
/* current187:surface:type_acl_all_grantees */
SELECT pg_catalog.jsonb_build_object(
  'schemaName', namespace_entry.nspname,
  'typeName', type_entry.typname,
  'typeOid', type_entry.oid::text,
  'ownerOid', type_entry.typowner::text,
  'granteeName', CASE WHEN acl_entry.grantee = 0 THEN 'PUBLIC' ELSE grantee_entry.rolname END,
  'granteeOid', acl_entry.grantee::text,
  'grantorName', grantor_entry.rolname,
  'grantorOid', acl_entry.grantor::text,
  'privilege', acl_entry.privilege_type,
  'grantable', acl_entry.is_grantable
)::text AS evidence
FROM pg_catalog.pg_type AS type_entry
JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = type_entry.typnamespace
CROSS JOIN LATERAL pg_catalog.aclexplode(
  COALESCE(type_entry.typacl, pg_catalog.acldefault('T', type_entry.typowner))
) AS acl_entry
LEFT JOIN pg_catalog.pg_roles AS grantee_entry ON grantee_entry.oid = acl_entry.grantee
JOIN pg_catalog.pg_roles AS grantor_entry ON grantor_entry.oid = acl_entry.grantor
WHERE namespace_entry.nspname !~ '^pg_toast'
  AND namespace_entry.nspname !~ '^pg_temp_'
ORDER BY namespace_entry.nspname, type_entry.typname, acl_entry.grantee, acl_entry.privilege_type
`;

const ROUTINE_SURFACE_SQL = `
/* current187:surface:routines_and_definitions */
SELECT pg_catalog.jsonb_build_object(
  'schemaName', namespace_entry.nspname,
  'name', procedure_entry.proname,
  'oid', procedure_entry.oid::text,
  'identityArguments', pg_catalog.pg_get_function_identity_arguments(procedure_entry.oid),
  'result', pg_catalog.pg_get_function_result(procedure_entry.oid),
  'kind', procedure_entry.prokind,
  'language', language_entry.lanname,
  'ownerName', owner_entry.rolname,
  'ownerOid', owner_entry.oid::text,
  'securityDefiner', procedure_entry.prosecdef,
  'leakproof', procedure_entry.proleakproof,
  'strict', procedure_entry.proisstrict,
  'volatility', procedure_entry.provolatile,
  'parallel', procedure_entry.proparallel,
  'config', procedure_entry.proconfig,
  'definition', CASE
    WHEN procedure_entry.prokind = 'a' THEN NULL
    ELSE pg_catalog.pg_get_functiondef(procedure_entry.oid)
  END,
  'aggregateDefinition', CASE
    WHEN aggregate_entry.aggfnoid IS NULL THEN NULL
    ELSE pg_catalog.jsonb_build_object(
      'kind', aggregate_entry.aggkind,
      'numberDirectArgs', aggregate_entry.aggnumdirectargs,
      'transitionFunctionOid', aggregate_entry.aggtransfn::text,
      'finalFunctionOid', aggregate_entry.aggfinalfn::text,
      'combineFunctionOid', aggregate_entry.aggcombinefn::text,
      'serialFunctionOid', aggregate_entry.aggserialfn::text,
      'deserializeFunctionOid', aggregate_entry.aggdeserialfn::text,
      'movingTransitionFunctionOid', aggregate_entry.aggmtransfn::text,
      'movingInverseFunctionOid', aggregate_entry.aggminvtransfn::text,
      'movingFinalFunctionOid', aggregate_entry.aggmfinalfn::text,
      'sortOperatorOid', aggregate_entry.aggsortop::text,
      'transitionTypeOid', aggregate_entry.aggtranstype::text,
      'transitionSpace', aggregate_entry.aggtransspace,
      'movingTransitionTypeOid', aggregate_entry.aggmtranstype::text,
      'movingTransitionSpace', aggregate_entry.aggmtransspace,
      'initialValue', aggregate_entry.agginitval,
      'movingInitialValue', aggregate_entry.aggminitval
    )
  END
)::text AS evidence
FROM pg_catalog.pg_proc AS procedure_entry
JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = procedure_entry.pronamespace
JOIN pg_catalog.pg_roles AS owner_entry ON owner_entry.oid = procedure_entry.proowner
JOIN pg_catalog.pg_language AS language_entry ON language_entry.oid = procedure_entry.prolang
LEFT JOIN pg_catalog.pg_aggregate AS aggregate_entry ON aggregate_entry.aggfnoid = procedure_entry.oid
WHERE namespace_entry.nspname !~ '^pg_toast'
  AND namespace_entry.nspname !~ '^pg_temp_'
ORDER BY namespace_entry.nspname, procedure_entry.proname, procedure_entry.oid
`;

const ROUTINE_ACL_SURFACE_SQL = `
/* current187:surface:routine_acl_all_grantees */
SELECT pg_catalog.jsonb_build_object(
  'schemaName', namespace_entry.nspname,
  'routineName', procedure_entry.proname,
  'routineOid', procedure_entry.oid::text,
  'identityArguments', pg_catalog.pg_get_function_identity_arguments(procedure_entry.oid),
  'ownerOid', procedure_entry.proowner::text,
  'granteeName', CASE WHEN acl_entry.grantee = 0 THEN 'PUBLIC' ELSE grantee_entry.rolname END,
  'granteeOid', acl_entry.grantee::text,
  'grantorName', grantor_entry.rolname,
  'grantorOid', acl_entry.grantor::text,
  'privilege', acl_entry.privilege_type,
  'grantable', acl_entry.is_grantable
)::text AS evidence
FROM pg_catalog.pg_proc AS procedure_entry
JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = procedure_entry.pronamespace
CROSS JOIN LATERAL pg_catalog.aclexplode(
  COALESCE(procedure_entry.proacl, pg_catalog.acldefault('f', procedure_entry.proowner))
) AS acl_entry
LEFT JOIN pg_catalog.pg_roles AS grantee_entry ON grantee_entry.oid = acl_entry.grantee
JOIN pg_catalog.pg_roles AS grantor_entry ON grantor_entry.oid = acl_entry.grantor
WHERE namespace_entry.nspname !~ '^pg_toast'
  AND namespace_entry.nspname !~ '^pg_temp_'
ORDER BY namespace_entry.nspname, procedure_entry.proname, procedure_entry.oid, acl_entry.grantee, acl_entry.privilege_type
`;

const DEFAULT_ACL_SURFACE_SQL = `
/* current187:surface:default_acl_all_grantees */
SELECT pg_catalog.jsonb_build_object(
  'ownerName', owner_entry.rolname,
  'ownerOid', default_entry.defaclrole::text,
  'schemaName', namespace_entry.nspname,
  'schemaOid', default_entry.defaclnamespace::text,
  'objectType', default_entry.defaclobjtype,
  'granteeName', CASE WHEN acl_entry.grantee = 0 THEN 'PUBLIC' ELSE grantee_entry.rolname END,
  'granteeOid', acl_entry.grantee::text,
  'grantorName', grantor_entry.rolname,
  'grantorOid', acl_entry.grantor::text,
  'privilege', acl_entry.privilege_type,
  'grantable', acl_entry.is_grantable
)::text AS evidence
FROM pg_catalog.pg_default_acl AS default_entry
JOIN pg_catalog.pg_roles AS owner_entry ON owner_entry.oid = default_entry.defaclrole
LEFT JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = default_entry.defaclnamespace
CROSS JOIN LATERAL pg_catalog.aclexplode(default_entry.defaclacl) AS acl_entry
LEFT JOIN pg_catalog.pg_roles AS grantee_entry ON grantee_entry.oid = acl_entry.grantee
JOIN pg_catalog.pg_roles AS grantor_entry ON grantor_entry.oid = acl_entry.grantor
ORDER BY default_entry.defaclrole, default_entry.defaclnamespace, default_entry.defaclobjtype, acl_entry.grantee, acl_entry.privilege_type
`;

const POLICY_SURFACE_SQL = `
/* current187:surface:rls_policies */
SELECT pg_catalog.jsonb_build_object(
  'schemaName', namespace_entry.nspname,
  'relationName', relation_entry.relname,
  'relationOid', relation_entry.oid::text,
  'name', policy_entry.polname,
  'permissive', policy_entry.polpermissive,
  'command', policy_entry.polcmd,
  'roles', ARRAY(
    SELECT COALESCE(role_entry.rolname, 'PUBLIC')
    FROM pg_catalog.unnest(policy_entry.polroles) AS policy_role(role_oid)
    LEFT JOIN pg_catalog.pg_roles AS role_entry ON role_entry.oid = policy_role.role_oid
    ORDER BY COALESCE(role_entry.rolname, 'PUBLIC')
  ),
  'usingExpression', pg_catalog.pg_get_expr(policy_entry.polqual, policy_entry.polrelid, true),
  'checkExpression', pg_catalog.pg_get_expr(policy_entry.polwithcheck, policy_entry.polrelid, true)
)::text AS evidence
FROM pg_catalog.pg_policy AS policy_entry
JOIN pg_catalog.pg_class AS relation_entry ON relation_entry.oid = policy_entry.polrelid
JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = relation_entry.relnamespace
WHERE namespace_entry.nspname !~ '^pg_toast'
  AND namespace_entry.nspname !~ '^pg_temp_'
ORDER BY namespace_entry.nspname, relation_entry.relname, policy_entry.polname
`;

const TRIGGER_SURFACE_SQL = `
/* current187:surface:triggers_and_definitions */
SELECT pg_catalog.jsonb_build_object(
  'schemaName', namespace_entry.nspname,
  'relationName', relation_entry.relname,
  'relationOid', relation_entry.oid::text,
  'name', trigger_entry.tgname,
  'oid', trigger_entry.oid::text,
  'functionOid', trigger_entry.tgfoid::text,
  'enabled', trigger_entry.tgenabled,
  'internal', trigger_entry.tgisinternal,
  'definition', pg_catalog.pg_get_triggerdef(trigger_entry.oid, true)
)::text AS evidence
FROM pg_catalog.pg_trigger AS trigger_entry
JOIN pg_catalog.pg_class AS relation_entry ON relation_entry.oid = trigger_entry.tgrelid
JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = relation_entry.relnamespace
WHERE namespace_entry.nspname !~ '^pg_toast'
  AND namespace_entry.nspname !~ '^pg_temp_'
ORDER BY namespace_entry.nspname, relation_entry.relname, trigger_entry.tgname, trigger_entry.oid
`;

const CONSTRAINT_SURFACE_SQL = `
/* current187:surface:constraints_and_definitions */
SELECT pg_catalog.jsonb_build_object(
  'schemaName', namespace_entry.nspname,
  'relationName', relation_entry.relname,
  'relationOid', constraint_entry.conrelid::text,
  'name', constraint_entry.conname,
  'oid', constraint_entry.oid::text,
  'type', constraint_entry.contype,
  'deferrable', constraint_entry.condeferrable,
  'deferred', constraint_entry.condeferred,
  'validated', constraint_entry.convalidated,
  'parentOid', constraint_entry.conparentid::text,
  'definition', pg_catalog.pg_get_constraintdef(constraint_entry.oid, true)
)::text AS evidence
FROM pg_catalog.pg_constraint AS constraint_entry
JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = constraint_entry.connamespace
LEFT JOIN pg_catalog.pg_class AS relation_entry ON relation_entry.oid = constraint_entry.conrelid
WHERE namespace_entry.nspname !~ '^pg_toast'
  AND namespace_entry.nspname !~ '^pg_temp_'
ORDER BY namespace_entry.nspname, relation_entry.relname, constraint_entry.conname, constraint_entry.oid
`;

const INDEX_SURFACE_SQL = `
/* current187:surface:indexes_and_definitions */
SELECT pg_catalog.jsonb_build_object(
  'schemaName', namespace_entry.nspname,
  'relationName', relation_entry.relname,
  'relationOid', index_entry.indrelid::text,
  'indexName', index_relation.relname,
  'indexOid', index_entry.indexrelid::text,
  'unique', index_entry.indisunique,
  'primary', index_entry.indisprimary,
  'valid', index_entry.indisvalid,
  'ready', index_entry.indisready,
  'replicaIdentity', index_entry.indisreplident,
  'definition', pg_catalog.pg_get_indexdef(index_entry.indexrelid, 0, true)
)::text AS evidence
FROM pg_catalog.pg_index AS index_entry
JOIN pg_catalog.pg_class AS relation_entry ON relation_entry.oid = index_entry.indrelid
JOIN pg_catalog.pg_class AS index_relation ON index_relation.oid = index_entry.indexrelid
JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = relation_entry.relnamespace
WHERE namespace_entry.nspname !~ '^pg_toast'
  AND namespace_entry.nspname !~ '^pg_temp_'
ORDER BY namespace_entry.nspname, relation_entry.relname, index_relation.relname, index_entry.indexrelid
`;

const EXTENSION_SURFACE_SQL = `
/* current187:surface:extensions */
SELECT pg_catalog.jsonb_build_object(
  'name', extension_entry.extname,
  'oid', extension_entry.oid::text,
  'ownerName', owner_entry.rolname,
  'ownerOid', owner_entry.oid::text,
  'schemaName', namespace_entry.nspname,
  'schemaOid', extension_entry.extnamespace::text,
  'relocatable', extension_entry.extrelocatable,
  'version', extension_entry.extversion,
  'configuration', extension_entry.extconfig,
  'condition', extension_entry.extcondition
)::text AS evidence
FROM pg_catalog.pg_extension AS extension_entry
JOIN pg_catalog.pg_roles AS owner_entry ON owner_entry.oid = extension_entry.extowner
JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = extension_entry.extnamespace
ORDER BY extension_entry.extname, extension_entry.oid
`;

const EXTENSION_OBJECT_SURFACE_SQL = `
/* current187:surface:extension_owned_objects */
SELECT pg_catalog.jsonb_build_object(
  'extensionName', extension_entry.extname,
  'extensionOid', extension_entry.oid::text,
  'classOid', dependency_entry.classid::text,
  'objectOid', dependency_entry.objid::text,
  'objectSubId', dependency_entry.objsubid,
  'identity', pg_catalog.pg_describe_object(
    dependency_entry.classid,
    dependency_entry.objid,
    dependency_entry.objsubid
  )
)::text AS evidence
FROM pg_catalog.pg_depend AS dependency_entry
JOIN pg_catalog.pg_extension AS extension_entry ON extension_entry.oid = dependency_entry.refobjid
WHERE dependency_entry.refclassid = 'pg_catalog.pg_extension'::pg_catalog.regclass
  AND dependency_entry.deptype = 'e'
ORDER BY extension_entry.extname, dependency_entry.classid, dependency_entry.objid, dependency_entry.objsubid
`;

const EFFECTIVE_PRIVILEGE_SURFACE_SQL = `
/* current187:surface:effective_object_privileges */
WITH role_entries AS (
  SELECT oid, rolname
  FROM pg_catalog.pg_roles
  WHERE rolname !~ '^pg_'
), schema_privileges AS (
  SELECT pg_catalog.jsonb_build_object(
    'kind', 'SCHEMA',
    'roleName', role_entry.rolname,
    'roleOid', role_entry.oid::text,
    'schemaName', namespace_entry.nspname,
    'objectOid', namespace_entry.oid::text,
    'usage', pg_catalog.has_schema_privilege(role_entry.oid, namespace_entry.oid, 'USAGE'),
    'create', pg_catalog.has_schema_privilege(role_entry.oid, namespace_entry.oid, 'CREATE')
  )::text AS evidence
  FROM role_entries AS role_entry
  CROSS JOIN pg_catalog.pg_namespace AS namespace_entry
  WHERE namespace_entry.nspname !~ '^pg_toast'
    AND namespace_entry.nspname !~ '^pg_temp_'
), relation_privileges AS (
  SELECT pg_catalog.jsonb_build_object(
    'kind', CASE WHEN relation_entry.relkind = 'S' THEN 'SEQUENCE' ELSE 'RELATION' END,
    'roleName', role_entry.rolname,
    'roleOid', role_entry.oid::text,
    'schemaName', namespace_entry.nspname,
    'objectName', relation_entry.relname,
    'objectOid', relation_entry.oid::text,
    'select', pg_catalog.has_table_privilege(role_entry.oid, relation_entry.oid, 'SELECT'),
    'insert', CASE WHEN relation_entry.relkind = 'S' THEN false ELSE pg_catalog.has_table_privilege(role_entry.oid, relation_entry.oid, 'INSERT') END,
    'update', pg_catalog.has_table_privilege(role_entry.oid, relation_entry.oid, 'UPDATE'),
    'delete', CASE WHEN relation_entry.relkind = 'S' THEN false ELSE pg_catalog.has_table_privilege(role_entry.oid, relation_entry.oid, 'DELETE') END,
    'truncate', CASE WHEN relation_entry.relkind = 'S' THEN false ELSE pg_catalog.has_table_privilege(role_entry.oid, relation_entry.oid, 'TRUNCATE') END,
    'references', CASE WHEN relation_entry.relkind = 'S' THEN false ELSE pg_catalog.has_table_privilege(role_entry.oid, relation_entry.oid, 'REFERENCES') END,
    'trigger', CASE WHEN relation_entry.relkind = 'S' THEN false ELSE pg_catalog.has_table_privilege(role_entry.oid, relation_entry.oid, 'TRIGGER') END,
    'usage', CASE WHEN relation_entry.relkind = 'S' THEN pg_catalog.has_sequence_privilege(role_entry.oid, relation_entry.oid, 'USAGE') ELSE false END
  )::text AS evidence
  FROM role_entries AS role_entry
  CROSS JOIN pg_catalog.pg_class AS relation_entry
  JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = relation_entry.relnamespace
  WHERE namespace_entry.nspname !~ '^pg_toast'
    AND namespace_entry.nspname !~ '^pg_temp_'
    AND relation_entry.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
), column_privileges AS (
  SELECT pg_catalog.jsonb_build_object(
    'kind', 'COLUMN',
    'roleName', role_entry.rolname,
    'roleOid', role_entry.oid::text,
    'schemaName', namespace_entry.nspname,
    'relationName', relation_entry.relname,
    'relationOid', relation_entry.oid::text,
    'columnName', attribute_entry.attname,
    'columnNumber', attribute_entry.attnum,
    'select', pg_catalog.has_column_privilege(role_entry.oid, relation_entry.oid, attribute_entry.attnum, 'SELECT'),
    'insert', pg_catalog.has_column_privilege(role_entry.oid, relation_entry.oid, attribute_entry.attnum, 'INSERT'),
    'update', pg_catalog.has_column_privilege(role_entry.oid, relation_entry.oid, attribute_entry.attnum, 'UPDATE'),
    'references', pg_catalog.has_column_privilege(role_entry.oid, relation_entry.oid, attribute_entry.attnum, 'REFERENCES')
  )::text AS evidence
  FROM role_entries AS role_entry
  CROSS JOIN pg_catalog.pg_attribute AS attribute_entry
  JOIN pg_catalog.pg_class AS relation_entry ON relation_entry.oid = attribute_entry.attrelid
  JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = relation_entry.relnamespace
  WHERE attribute_entry.attnum > 0
    AND NOT attribute_entry.attisdropped
    AND namespace_entry.nspname !~ '^pg_toast'
    AND namespace_entry.nspname !~ '^pg_temp_'
    AND relation_entry.relkind IN ('r', 'p', 'v', 'm', 'f')
), routine_privileges AS (
  SELECT pg_catalog.jsonb_build_object(
    'kind', 'ROUTINE',
    'roleName', role_entry.rolname,
    'roleOid', role_entry.oid::text,
    'schemaName', namespace_entry.nspname,
    'objectName', procedure_entry.proname,
    'objectOid', procedure_entry.oid::text,
    'execute', pg_catalog.has_function_privilege(role_entry.oid, procedure_entry.oid, 'EXECUTE')
  )::text AS evidence
  FROM role_entries AS role_entry
  CROSS JOIN pg_catalog.pg_proc AS procedure_entry
  JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = procedure_entry.pronamespace
  WHERE namespace_entry.nspname !~ '^pg_toast'
    AND namespace_entry.nspname !~ '^pg_temp_'
), type_privileges AS (
  SELECT pg_catalog.jsonb_build_object(
    'kind', 'TYPE',
    'roleName', role_entry.rolname,
    'roleOid', role_entry.oid::text,
    'schemaName', namespace_entry.nspname,
    'objectName', type_entry.typname,
    'objectOid', type_entry.oid::text,
    'usage', pg_catalog.has_type_privilege(role_entry.oid, type_entry.oid, 'USAGE')
  )::text AS evidence
  FROM role_entries AS role_entry
  CROSS JOIN pg_catalog.pg_type AS type_entry
  JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = type_entry.typnamespace
  WHERE namespace_entry.nspname !~ '^pg_toast'
    AND namespace_entry.nspname !~ '^pg_temp_'
)
SELECT evidence FROM schema_privileges
UNION ALL SELECT evidence FROM relation_privileges
UNION ALL SELECT evidence FROM column_privileges
UNION ALL SELECT evidence FROM routine_privileges
UNION ALL SELECT evidence FROM type_privileges
ORDER BY evidence
`;

export const CURRENT187_PER_DATABASE_CATALOG_SURFACES = Object.freeze(
  [
    ["roles", ROLE_SURFACE_SQL],
    ["memberships", MEMBERSHIP_SURFACE_SQL],
    ["roleDatabaseSettings", ROLE_SETTING_SURFACE_SQL],
    ["ownedObjects", OWNED_OBJECT_SURFACE_SQL],
    ["databaseSecurity", DATABASE_SECURITY_SURFACE_SQL],
    ["schemas", SCHEMA_SURFACE_SQL],
    ["schemaAclAllGrantees", SCHEMA_ACL_SURFACE_SQL],
    ["relations", RELATION_SURFACE_SQL],
    ["relationAclAllGrantees", RELATION_ACL_SURFACE_SQL],
    ["columns", COLUMN_SURFACE_SQL],
    ["columnAclAllGrantees", COLUMN_ACL_SURFACE_SQL],
    ["sequences", SEQUENCE_SURFACE_SQL],
    ["types", TYPE_SURFACE_SQL],
    ["typeAclAllGrantees", TYPE_ACL_SURFACE_SQL],
    ["routinesAndDefinitions", ROUTINE_SURFACE_SQL],
    ["routineAclAllGrantees", ROUTINE_ACL_SURFACE_SQL],
    ["defaultAclAllGrantees", DEFAULT_ACL_SURFACE_SQL],
    ["rlsPolicies", POLICY_SURFACE_SQL],
    ["triggersAndDefinitions", TRIGGER_SURFACE_SQL],
    ["constraintsAndDefinitions", CONSTRAINT_SURFACE_SQL],
    ["indexesAndDefinitions", INDEX_SURFACE_SQL],
    ["extensions", EXTENSION_SURFACE_SQL],
    ["extensionOwnedObjects", EXTENSION_OBJECT_SURFACE_SQL],
    ["effectiveObjectPrivileges", EFFECTIVE_PRIVILEGE_SURFACE_SQL],
  ].map(([name, sql]) => Object.freeze({ name, sql })),
);
