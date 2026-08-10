# CURRENT186 identity-mail duty-role runtime boundary V2 candidate

Status: `IMPLEMENTED_CANDIDATE / ENGINEERING_ACCEPTED / NONCANONICAL / NOT_DEPLOYABLE`.

This directory is a disposable-rehearsal artifact above the exact frozen
CURRENT185 candidate. It remains outside `prisma/migrations`; it grants no
production or shared-beta authority. Production remains `CURRENT179/179`. The
four current clubs, which belong to one existing network, and the external
tester are unchanged. Test access remains `NO-GO`.

## Boundary and authority scope

CURRENT186 provides database-local enforcement only. Every helper, appender,
controller receipt and attestation states these exact boundaries:

```text
authorityScope = CURRENT_DATABASE_ONLY
crossDatabaseAuthorityControlled = false
futureCreatorDefaultPrivilegesControlled = false
applicationRoleAllowlistBound = false
productionApplyAuthorized = false
```

It creates no PostgreSQL role, credential, trust root, tenant, SMTP authority
or production admission. A separate privileged controller receives already
created role name+OID identities and applies the disposable role/ownership/ACL
transition. Passwords, password hashes and connection URLs are neither inputs
nor receipt fields.

The deployment identity is the exact current database owner name/OID and must
also be `session_user` for every ACL-epoch append. The appender's effective
`current_user` is reason-aware:

- `APPLY` / `ROTATE`: exact schema-owner role;
- `ROLLBACK`: exact deployment/database-owner role after exact restoration;
- `EMERGENCY_CONTAINMENT`: exact deployment/database-owner role after the
  complete duty-role ACL surface has been contained.

The appender is deliberately `SECURITY INVOKER`. APPLY/ROTATE performs an
explicit transaction-local switch to the exact `NOLOGIN` schema owner before
calling it; ROLLBACK and EMERGENCY call it as the deployment/database owner.
This keeps the appender usable after emergency containment removes every
direct schema-owner support grant, without retaining a hidden privilege or
granting appender execution to either LOGIN runtime role.

## Exact protected database surface

The candidate protects exactly nine relations, 22 owner routines, 21 enabled
non-internal triggers, 110 constraints and 56 indexes. The nine relations are:

1. `_prisma_migrations`;
2. `IdentityMailDeliveryEvent`;
3. `IdentityMailOutbox`;
4. `IdentityMailDeliveryTenantEnrollment`;
5. `IdentityMailDeliveryTenantEnrollmentCommand`;
6. `IdentityMailDeliveryTenantEnrollmentEvent`;
7. `IdentityMailDutyRoleManifestEvidenceV2`;
8. `IdentityMailDutyRoleManifestRevocationV2`;
9. `IdentityMailDutyRoleAclEpochV1`.

The definition manifest sorts each exact routine, trigger, constraint and
index identity and its normalized definition digest. The epoch immutable guard
is named exactly
`identity_mail_duty_role_acl_epoch_immutable_guard_v1`; a differently named
`...acl_immutable_guard...` routine is not part of this contract.

Security mode is pinned per routine. The coordinator driver uses
`SECURITY DEFINER` for its owner-only transition. The epoch appender,
`identity_mail_duty_role_live_assert_v1` and immutable guards use
`SECURITY INVOKER`; their caller identity is part of the transition contract.
Not all 22 routines are `SECURITY DEFINER`. Exact owner, signature,
proconfig/search path, volatility, parallel mode,
default/variadic/overload surface, ACL and definition bytes are verified for
every routine; `PUBLIC` receives no candidate runtime authority.

## Duty roles and comprehensive ownership inventory

The intended least-privilege split is:

- `NOLOGIN NOINHERIT` owner: exact control-plane ownership only;
- `LOGIN NOINHERIT` coordinator: `CONNECT`, schema `USAGE` and `EXECUTE` only
  on the four-TEXT coordinator driver;
- `LOGIN NOINHERIT` worker: `CONNECT`, schema `USAGE` and `EXECUTE` only on the
  five CURRENT184 worker-v2 RPCs.

The schema owner additionally receives the exact worker support surface:

- `35` column-level `SELECT` authorities: `12` release-marker columns, `6`
  `Tenant` columns, `12` `UserInvite` columns and `5` `IdentityEmailClaim`
  columns;
- `4` carrier-column `UPDATE` authorities on `Tenant.id`, `UserInvite.id`,
  `IdentityEmailClaim.emailCanonical` and `IdentityMailDeliveryEvent.id`,
  required by PostgreSQL row-lock semantics;
- one database-owner-granted `EXECUTE` authority on
  `identity_email_claim_lock_v1(text)`.

There is no table-level `SELECT` on the marker, `Tenant`, `UserInvite` or
`IdentityEmailClaim`, and no table-level `UPDATE` on `Tenant`, `UserInvite`,
`IdentityEmailClaim` or `IdentityMailDeliveryEvent`. The delivery-event table
keeps its pre-existing bounded `INSERT` and `SELECT` authorities. APPLY and
ROLLBACK revoke the observed table, column and helper ACLs before restoring
this exact profile; live assertion rejects an omitted privilege, a wider table
grant, a wrong grantor/grantee or grant option.

The definition manifest protects `23` routines: the `22` schema-owner routines
plus the database-owner-controlled claim-lock helper. The helper's OID, owner,
`prosrc`, `proconfig`, full definition and ACL are catalog-bound; it is not
transferred to the schema-owner role.

Both LOGIN roles must have zero unexpected memberships, grant options,
relation/column/sequence/type authority, ownership, settings, `CREATE` or
`TEMP`. The live catalog and controller inventory all object families in which
a duty-role principal can own or retain authority:

```text
DATABASE
SCHEMA
CLASS/RELATION
ROUTINE
TYPE
LANGUAGE
FOREIGN_DATA_WRAPPER
FOREIGN_SERVER
TABLESPACE
LARGE_OBJECT
EXTENSION
COLLATION
CONVERSION
OPERATOR
OPERATOR_CLASS
OPERATOR_FAMILY
TEXT_SEARCH_CONFIGURATION
TEXT_SEARCH_DICTIONARY
STATISTICS
EVENT_TRIGGER
PUBLICATION
SUBSCRIPTION
USER_MAPPING
PREPARED_TRANSACTION
```

The direct-duty ACL receipt domain is
`LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_DIRECT_DUTY_ACL_CURRENT186_V1`; its sorted
rows include kind, identity, grantor OID, grantee OID, privilege and grantable.
The pinned PostgreSQL 16 `PUBLIC` baseline digest is
`ad50619e4ea13c2923f089fa4e6ac003cb56da160a30e40d61359ac034097117`.

## Epoch ledger and 39-key durable recovery evidence

`IdentityMailDutyRoleAclEpochV1` is append-only under the shared ACL advisory
lock. Every transition is `N+1`; history is never rewound or deleted. Active
`APPLY`/`ROTATE` epochs contain an exact 39-key canonical payload. The payload
binds all four role name/OID pairs, deployment/database/context identities,
definition/grant/owner/catalog digests, operation evidence and the exact
`EPOCH_COLUMN_CANONICAL_JSON_V1` storage profile.

The full canonical UTF-8 before-image has exactly 20 top-level keys and is
stored once in the immutable
`beforeCatalogCanonicalJson` epoch column with PostgreSQL `EXTENDED` TOAST
storage. It is bounded to 4 MiB and bound to its exact schema/profile,
PostgreSQL `PUBLIC` baseline and before-catalog digest. It is mandatory for
`APPLY`/`ROTATE`; inactive epochs require both the profile and sidecar to be
null. This avoids a second hex copy while preserving byte-exact recovery. The
appender independently recomputes the apply receipt and epoch payload rather
than accepting caller-selected digests.

Exact `APPLY` lost-response recovery runs before ordinary preflight. A replay
with the same operation id reads the persisted epoch, decodes the durable
before-image, recomputes the plan, target catalog, apply receipt and complete
39-key epoch payload, and returns success only when every canonical byte is
identical. A row with incomplete or mismatched evidence is not treated as
success. `ROLLBACK` restores this persisted exact before-image and appends a
compensating epoch; it never deletes a pre-existing role.

Rollback also compares a persisted digest/count inventory of every non-system
routine before DDL, again under the ACL lock, and in the final catalog. The
inventory covers full `pg_proc` definition state without ACL, `pg_aggregate`,
and owner bindings outside the exact protected owner-transfer set. New,
dropped, replaced, or unexpectedly re-owned routines therefore fail closed;
planned CURRENT186 owner transfers remain covered by their exact object/OID
bindings.

## Six-mode privileged controller

The controller supports exactly six modes:

1. `check`: read-only live inspection;
2. `plan`: PII-free canonical before/after plan;
3. `apply`: one bounded transaction under the common ACL lock;
4. `rollback`: exact before-image restoration plus epoch `N+1`;
5. `attest`: fresh live-catalog verification after commit;
6. `emergency`: terminal containment without automatic LOGIN restoration.

Apply reacquires fresh role/OID/catalog state after waiting for the lock, then
performs exact ownership/revoke/grant operations, live postcondition, epoch
append and commit in one transaction. No HTTP, HSM or secret-manager call is
allowed inside that transaction.

The four-reference `SECURITY DEFINER` enrollment driver accepts only immutable
CURRENT185 evidence and always takes the tenant lock before the common ACL
lock:

```text
BEGIN_DRAIN -> WAIT_ZERO_INFLIGHT -> FINALIZE
             \-> TERMINAL_REPLAY
```

An accepted drain may settle only from fresh state under both locks and only
after zero secret-bearing, HOLD/PENDING/RETRY and CLAIMED outbox rows.

## Emergency containment protocol

Every phase-one attempt acquires the same ACL epoch/advisory lock before DDL.
Phase one atomically applies `NOLOGIN`, global and per-database `RESET ALL`,
direct database `CONNECT` revoke, and bidirectional membership revoke for the
owner, coordinator and worker roles.

An untyped or lost phase-one response is retried at most three times. If commit
cannot be established after the third attempt, the terminal decision is
`CURRENT186_DUTY_ROLE_EMERGENCY_PHASE1_UNCONFIRMED`; no false emergency epoch
is appended and the controller does not continue through a normal attestation
path.

After confirmed phase one, the controller terminates and polls live sessions.
A fresh database postcondition and final zero-session recheck are mandatory
before appending the emergency epoch. Any nonzero session or false termination
result leaves the system contained but unattested. All three duty roles remain
terminal `NOLOGIN`; reactivation requires a separate explicitly authorized
ceremony.

## Acceptance status and residual boundaries

Engineering acceptance and refreeze completed on 2026-08-05. The final frozen
bytes passed CURRENT180..CURRENT185 predecessor gates, CURRENT186 foundation
`15/15`, catalog `24/24`, deployment `48/48`, runtime attestation `16/16` and
focused ESLint. Two independent PostgreSQL 16 runs passed the complete `28/28`
matrix in `325.812 s` and `320.49 s`; each run started and ended with zero
disposable databases, roles and sessions (`0/0/0`). The CURRENT185 regression
also compares the exact row-level provenance of all `16` command rows and `14`
unique manifest rows, rather than accepting aggregate counts alone.

The current 23/21/110/56 definition surface does not yet claim exhaustive
definition coverage for `pg_attribute` column metadata, column defaults or RLS
policy definitions. That coverage is a required follow-up. Provider
`mark/complete` lost-response recovery and cluster/application admission are
also outside `CURRENT_DATABASE_ONLY` and remain CURRENT187/follow-up blockers.

## Final engineering-refreeze artifact pins

The CURRENT186 engineering candidate is bound to these exact PostgreSQL 16
artifacts:

- definition manifest:
  `2ac0ff62303d899a70b7600749fcd895f184523ef9dc9fc74d9b60a44eca9109`;
- normalized `migration.sql` SHA-256:
  `7a1a0453b883d6bbf8640eff8c39b007376286b0f21d31f766771fead65a93dd`;
- completed 186-row migration-manifest digest:
  `3bbf04f88643d94076be96c3ae714c441454e6a7fcd6107af5bd194dca579ed6`;
- exhaustive system `PUBLIC` ACL baseline:
  `ad50619e4ea13c2923f089fa4e6ac003cb56da160a30e40d61359ac034097117`.

These pins authorize no deployment, production mutation or test access.
Canonical promotion remains blocked by CURRENT187 cluster/application
admission, the remaining provider/restore integration gates and a signed
production-like apply/rollback/emergency/zero-diff rehearsal pass.
