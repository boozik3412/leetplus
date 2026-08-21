# Current network access-scope classification

Status: restored-copy-only admission controller. Production execution is not
implemented and remains fail-closed.

## Purpose

The current four clubs stay inside the existing single tenant/network. Before
the current release can run with enforced access scopes, every active user with
`User.accessScope IS NULL` must receive one explicit classification:

- `NETWORK` with an empty `storeIds` list; or
- `STORES` with the exact non-empty list of active store IDs.

No subject is inferred from role. In particular, the platform administrator is
never classified automatically and must be present in a separate explicit
platform confirmation set.

The workflow supports the single-founder operating model. It does not require
an offline/USB signing key. Its detached approval protects against accidental
execution by requiring the founder to compare and re-enter the exact plan and
platform-confirmation digests. It is not a substitute for independent approval
when a second release operator is added later.

## Safety boundary

The controller accepts only a target that satisfies all of these conditions:

- mode is exactly `RESTORED_COPY`;
- TCP host is exactly `127.0.0.1`;
- port is explicit and is not `5432`;
- database name starts with `leetplus_scope_` or `leetplus_restored_`;
- the URL, database, role, server address, port and PostgreSQL
  `system_identifier` match the reviewed target manifest;
- the session role is `NOINHERIT`, has no memberships or members, has no role
  settings, owns no database/schema/relation/type/routine, and is a
  non-superuser without `CREATEDB`, `CREATEROLE`, `REPLICATION` or `BYPASSRLS`;
- both direct and effective privileges (including privileges received through
  `PUBLIC`) across every non-system schema, relation, column, sequence,
  routine and type exactly match the column-scoped controller allowlist;
- there are no other client sessions in the target database.

The raw restored source, production database and production services are not
valid targets. There is deliberately no production switch or override flag.

Secrets and the raw tenant ID are read only from named environment variables.
They are not CLI arguments, receipt fields or stdout fields. Subjects are
represented by HMAC-SHA-256 digests. Emails, names, raw user IDs, password
hashes and credentials are neither selected nor emitted.

## Artifacts

The stages are strictly ordered:

1. `inventory` captures the active subject/store state and aggregate counts.
2. A human creates an exact classification manifest.
3. `plan` binds the manifest to the immutable inventory, records exact prior
   rows and creates deterministic desired rows.
4. `approve` creates a detached apply or rollback approval after exact digest
   confirmation.
5. `apply` or `rollback` performs a bounded serializable transaction.
6. `check` independently verifies the durable database audit and exact state.

Every input and output must be a direct child of one pre-created protected
evidence root. The controller rejects symlink/reparse ancestry, verifies the
root owner and permissions/ACL, binds root and file identities before and after
I/O, creates outputs with `O_EXCL`, flushes each file and never overwrites an
existing path.

On POSIX, the required modes are exactly `0700` for the root and `0600` for
files, and the directory is fsynced. Windows does not implement POSIX modes and
Node may not provide a directory handle that can be fsynced. On Windows the
controller instead verifies an exact protected NTFS DACL for the current user,
SYSTEM and Administrators, flushes the file, and reports either
`DIRECTORY_FSYNC_VERIFIED` or the honest
`DIRECTORY_FSYNC_UNAVAILABLE_WIN32`. The latter is not a claim of crash-durable
directory-entry persistence; copy and hash the completed bundle on a second
volume before accepting it as retained evidence.

The apply transaction takes a tenant-scoped advisory lock, invokes one
source-pinned `SECURITY DEFINER` lock function, then re-reads the state with the
column-scoped writer. The function locks the tenant, all tenant users and all
store rows with `FOR UPDATE`, then locks existing `UserStoreAccess` rows in a
deterministic order. Its owner is a `NOLOGIN`/`NOINHERIT` role with no members;
the writer receives only `EXECUTE`, never `UPDATE` on `Tenant`, `Store` or
`UserStoreAccess`. The store lock conflicts with ordinary `UPDATE isActive`;
any inventory drift fails before DML. The same
transaction updates `User.accessScope`, replaces the classified users' store
links and writes an idempotent `PlatformAdminAuditEvent`. Statement, lock and
idle-in-transaction timeouts bound the operation.

If the commit succeeds but its client response is lost, the next run validates
the durable audit and exact target state, then emits a `RECONCILED`/zero-diff
receipt without repeating mutations.

## Disposable-clone contract

Clone only the already restored local source on the isolated PG16 listener.
Validate the two database names before invoking PostgreSQL utilities so neither
is interpreted as SQL or a broad target:

```powershell
$pgBin = 'C:\Users\ALIENWARE\LeetPlus-Tools\PostgreSQL-16.15-binaries\pgsql\bin'
$rawDatabase = 'REPLACE_WITH_EXACT_RAW_RESTORED_DATABASE'
$cloneDatabase = 'leetplus_scope_f4_review'
$adminRole = 'REPLACE_WITH_LOCAL_REHEARSAL_ADMIN_ROLE'

if ($rawDatabase -notmatch '^leetplus_[a-z0-9_]{3,80}$') { throw 'raw database name rejected' }
if ($cloneDatabase -notmatch '^leetplus_scope_[a-z0-9_]{3,80}$') { throw 'clone database name rejected' }
if ($adminRole -notmatch '^[a-z_][a-z0-9_]{2,80}$') { throw 'admin role name rejected' }

$env:PGPASSWORD = 'SET_THE_EXISTING_LOCAL_REHEARSAL_ADMIN_PASSWORD_IN_THIS_PROCESS'
& "$pgBin\createdb.exe" -h 127.0.0.1 -p 55449 -U $adminRole `
  --maintenance-db postgres --template $rawDatabase $cloneDatabase
if ($LASTEXITCODE -ne 0) { throw 'exact disposable clone failed' }
```

`createdb --template` must fail if the source has another session; do not
terminate source sessions automatically. Never use a production database as
`$rawDatabase`. Do not alter `pg_hba.conf`, weaken SCRAM or enable trust to make
this command work.

Create the classifier login without putting its password in the command line:

```powershell
& "$pgBin\createuser.exe" -h 127.0.0.1 -p 55449 -U $adminRole `
  --login --no-inherit --no-superuser --no-createdb --no-createrole `
  --no-replication `
  --pwprompt leetplus_scope_writer
if ($LASTEXITCODE -ne 0) { throw 'classifier role creation failed' }
```

After all receipts are captured, remove only the two exact targets:

```powershell
if ($cloneDatabase -ne 'leetplus_scope_f4_review') { throw 'clone target drift' }
if ('leetplus_scope_writer' -notmatch '^leetplus_scope_[a-z0-9_]{3,80}$') { throw 'role target drift' }

& "$pgBin\dropdb.exe" -h 127.0.0.1 -p 55449 -U $adminRole `
  --maintenance-db postgres --if-exists $cloneDatabase
if ($LASTEXITCODE -ne 0) { throw 'exact clone removal failed' }

& "$pgBin\dropuser.exe" -h 127.0.0.1 -p 55449 -U $adminRole `
  --if-exists leetplus_scope_writer
if ($LASTEXITCODE -ne 0) { throw 'exact role removal failed' }

& "$pgBin\dropuser.exe" -h 127.0.0.1 -p 55449 -U $adminRole `
  --if-exists leetplus_scope_lock_owner
if ($LASTEXITCODE -ne 0) { throw 'exact lock-owner removal failed' }

Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
```

The final admin query must report database count `0`, role count `0` across
both exact temporary roles, and no client session for the exact clone. Store
only these counts and their evidence digest, never the admin password or
connection URL.

## One-time restored-copy role

Create a dedicated login on the disposable clone with a strong temporary
password. Do not use `postgres`, a production runtime role or a production
secret. Apply the following only to the disposable clone. It removes ambient
`PUBLIC` authority and grants the exact column-scoped controller allowlist:

```sql
ALTER ROLE leetplus_scope_writer NOINHERIT NOSUPERUSER NOCREATEDB
  NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE leetplus_scope_writer RESET ALL;

CREATE ROLE leetplus_scope_lock_owner NOLOGIN NOINHERIT NOSUPERUSER
  NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE leetplus_scope_lock_owner RESET ALL;

REVOKE CONNECT, TEMPORARY
  ON DATABASE leetplus_scope_f4_review FROM PUBLIC;
GRANT CONNECT ON DATABASE leetplus_scope_f4_review TO leetplus_scope_writer;

DO $scope_acl$
DECLARE
  candidate RECORD;
BEGIN
  FOR candidate IN
    SELECT namespace.nspname AS schema_name
    FROM pg_catalog.pg_namespace AS namespace
    WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
      AND namespace.nspname NOT LIKE 'pg_toast%'
      AND namespace.nspname NOT LIKE 'pg_temp_%'
    ORDER BY namespace.nspname
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE ALL ON SCHEMA %I FROM PUBLIC', candidate.schema_name
    );
    EXECUTE pg_catalog.format(
      'REVOKE ALL ON SCHEMA %I FROM %I',
      candidate.schema_name, 'leetplus_scope_writer'
    );
    EXECUTE pg_catalog.format(
      'REVOKE ALL ON SCHEMA %I FROM %I',
      candidate.schema_name, 'leetplus_scope_lock_owner'
    );
    EXECUTE pg_catalog.format(
      'REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM PUBLIC',
      candidate.schema_name
    );
    EXECUTE pg_catalog.format(
      'REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM %I',
      candidate.schema_name, 'leetplus_scope_writer'
    );
    EXECUTE pg_catalog.format(
      'REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM %I',
      candidate.schema_name, 'leetplus_scope_lock_owner'
    );
    EXECUTE pg_catalog.format(
      'REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM PUBLIC',
      candidate.schema_name
    );
    EXECUTE pg_catalog.format(
      'REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM %I',
      candidate.schema_name, 'leetplus_scope_writer'
    );
    EXECUTE pg_catalog.format(
      'REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM %I',
      candidate.schema_name, 'leetplus_scope_lock_owner'
    );
    EXECUTE pg_catalog.format(
      'REVOKE ALL ON ALL ROUTINES IN SCHEMA %I FROM PUBLIC',
      candidate.schema_name
    );
    EXECUTE pg_catalog.format(
      'REVOKE ALL ON ALL ROUTINES IN SCHEMA %I FROM %I',
      candidate.schema_name, 'leetplus_scope_writer'
    );
    EXECUTE pg_catalog.format(
      'REVOKE ALL ON ALL ROUTINES IN SCHEMA %I FROM %I',
      candidate.schema_name, 'leetplus_scope_lock_owner'
    );
  END LOOP;

  FOR candidate IN
    SELECT namespace.nspname AS schema_name, type_row.typname AS type_name
    FROM pg_catalog.pg_type AS type_row
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = type_row.typnamespace
    WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
      AND namespace.nspname NOT LIKE 'pg_toast%'
      AND namespace.nspname NOT LIKE 'pg_temp_%'
      AND type_row.typisdefined
      AND type_row.typtype IN ('b', 'c', 'd', 'e', 'm', 'r')
      AND NOT (type_row.typcategory = 'A' AND type_row.typelem <> 0)
    ORDER BY namespace.nspname, type_row.typname
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE ALL ON TYPE %I.%I FROM PUBLIC',
      candidate.schema_name, candidate.type_name
    );
    EXECUTE pg_catalog.format(
      'REVOKE ALL ON TYPE %I.%I FROM %I',
      candidate.schema_name, candidate.type_name, 'leetplus_scope_writer'
    );
    EXECUTE pg_catalog.format(
      'REVOKE ALL ON TYPE %I.%I FROM %I',
      candidate.schema_name, candidate.type_name,
      'leetplus_scope_lock_owner'
    );
  END LOOP;
END
$scope_acl$;

GRANT USAGE ON SCHEMA public TO leetplus_scope_writer;
GRANT USAGE ON TYPE public."UserAccessScope", public."UserRole"
  TO leetplus_scope_writer;

GRANT USAGE ON SCHEMA public TO leetplus_scope_lock_owner;
GRANT SELECT ("id"), UPDATE ("id") ON public."Tenant"
  TO leetplus_scope_lock_owner;
GRANT SELECT ("id", "tenantId"), UPDATE ("id") ON public."Store"
  TO leetplus_scope_lock_owner;
GRANT SELECT ("id", "tenantId"), UPDATE ("id") ON public."User"
  TO leetplus_scope_lock_owner;
GRANT SELECT ("id", "userId", "storeId"), UPDATE ("id")
  ON public."UserStoreAccess" TO leetplus_scope_lock_owner;

CREATE FUNCTION public.leetplus_current_network_access_scope_lock_v1(
  target_tenant_id TEXT
) RETURNS void
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY DEFINER
SET search_path TO pg_catalog, pg_temp
AS $trusted_lock$
BEGIN
  PERFORM 1
  FROM public."Tenant" AS network_tenant
  WHERE network_tenant."id" = target_tenant_id
  FOR UPDATE;

  PERFORM 1
  FROM public."User" AS subject
  WHERE subject."tenantId" = target_tenant_id
  ORDER BY subject."id" COLLATE "C"
  FOR UPDATE;

  PERFORM 1
  FROM public."Store" AS store
  WHERE store."tenantId" = target_tenant_id
  ORDER BY store."id" COLLATE "C"
  FOR UPDATE;

  PERFORM 1
  FROM public."UserStoreAccess" AS access
  INNER JOIN public."User" AS subject ON subject."id" = access."userId"
  WHERE subject."tenantId" = target_tenant_id
  ORDER BY access."userId" COLLATE "C", access."storeId" COLLATE "C",
    access."id" COLLATE "C"
  FOR UPDATE OF access;
END
$trusted_lock$;

ALTER FUNCTION public.leetplus_current_network_access_scope_lock_v1(TEXT)
  OWNER TO leetplus_scope_lock_owner;
REVOKE ALL
  ON FUNCTION public.leetplus_current_network_access_scope_lock_v1(TEXT)
  FROM PUBLIC;
GRANT EXECUTE
  ON FUNCTION public.leetplus_current_network_access_scope_lock_v1(TEXT)
  TO leetplus_scope_writer;

GRANT SELECT ("id") ON public."Tenant" TO leetplus_scope_writer;
GRANT SELECT ("id", "isActive") ON public."Store"
  TO leetplus_scope_writer;
GRANT SELECT (
  "id", "tenantId", "role", "accessScope", "isActive",
  "isPlatformAdmin", "updatedAt"
) ON public."User" TO leetplus_scope_writer;
GRANT SELECT ("id", "userId", "storeId", "createdAt")
  ON public."UserStoreAccess" TO leetplus_scope_writer;
GRANT SELECT (
  "action", "requestId", "targetType", "targetId", "reason",
  "before", "after", "metadata"
) ON public."PlatformAdminAuditEvent"
  TO leetplus_scope_writer;
GRANT UPDATE ("accessScope", "updatedAt") ON public."User"
  TO leetplus_scope_writer;
GRANT INSERT, DELETE ON public."UserStoreAccess"
  TO leetplus_scope_writer;
GRANT INSERT ON public."PlatformAdminAuditEvent"
  TO leetplus_scope_writer;
GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system()
  TO leetplus_scope_writer;
```

The attestation fails if this role owns any object, can `SET ROLE`, receives an
extra grant directly or through `PUBLIC`, can write another `User` column, can
execute a routine or use a sequence outside the exact allowlist, can access an
extra schema such as `extra_schema.secret`, or can use any user-defined type
except `public."UserAccessScope"` and `public."UserRole"`. Do not make the
classifier the clone database owner. Do not run DDL while the rehearsal is in
progress; the attestation is re-evaluated at every database stage. The lock
owner may own only the one reviewed function. It cannot log in or be granted to
any member. Its exact column grants exist solely so PostgreSQL can take row
locks inside the source-pinned function; the writer cannot assume this role.
PostgreSQL function ownership already carries implicit grant authority, so the
ACL comparison ignores the owner's representation-specific self entry and
requires the writer's non-grantable `EXECUTE` entry to be the only non-owner
entry.

Revoke the login and drop the exact disposable clone after evidence capture.
Record the absence check separately. Do not change authentication on the raw
restored source merely to make the rehearsal convenient.

## Full-CI PostgreSQL lock gate

The unit/fake-adapter suite is intentionally runnable without a database, but
Full CI must also execute the conditional PostgreSQL fixture in
`current-network-access-scope-classification.test.mjs`. The fixture accepts
only an explicitly confirmed loopback PostgreSQL 16 maintenance endpoint whose
database and login are both `postgres`:

```text
ACCESS_SCOPE_CLASSIFICATION_PG_E2E_CONFIRM=
  RUN_CURRENT_NETWORK_ACCESS_SCOPE_CLASSIFICATION_PG_E2E
ACCESS_SCOPE_CLASSIFICATION_PG_E2E_ADMIN_DATABASE_URL=
  postgresql://postgres:CI_ONLY_PASSWORD@127.0.0.1:5432/postgres
```

The URL above is schematic; never commit a real password. Run the existing
`check:current-network-access-scope-classification` package script with both
values injected by the disposable CI service. A Full-CI acceptance log must
show the PostgreSQL case as passed, not skipped.

The fixture fails if its exact database or any of its four exact roles already exists. It
creates `leetplus_scope_lock_e2e`, proves that the writer cannot directly
`UPDATE` or `SELECT ... FOR UPDATE` on `Store`, proves that the reviewed definer
function can take the lock, observes SQLSTATE `55P03` for an adversarial
concurrent `Store.isActive` update, and then proves the update succeeds after
rollback. It also exercises `extra_schema.secret` ownership and `PUBLIC` grant
failures, plus a chained function ACL whose second grantor is not the function
owner. Finally it drops only its exact database and four exact roles and
asserts zero residual objects. This CI fixture is not the restored-copy replay
and does not authorize production execution.

## Protected evidence root

On Windows, create a brand-new directory at a canonical long path. Disable ACL
inheritance and allow only the current user, SYSTEM and local Administrators.
Do not reuse a shared, synced or previously populated directory:

```powershell
$evidenceRoot = 'C:\Users\ALIENWARE\LeetPlus-Rehearsals\access-scope-f4-review'
if (Test-Path -LiteralPath $evidenceRoot) { throw 'evidence root already exists' }
New-Item -ItemType Directory -Path $evidenceRoot | Out-Null
$evidenceRoot = (Resolve-Path -LiteralPath $evidenceRoot).Path
$currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value

& icacls.exe $evidenceRoot /inheritance:r
if ($LASTEXITCODE -ne 0) { throw 'cannot protect evidence root' }
& icacls.exe $evidenceRoot /grant:r `
  "*${currentSid}:(OI)(CI)F" `
  '*S-1-5-18:(OI)(CI)F' `
  '*S-1-5-32-544:(OI)(CI)F'
if ($LASTEXITCODE -ne 0) { throw 'cannot install exact evidence DACL' }

$env:ACCESS_SCOPE_EVIDENCE_ROOT = $evidenceRoot
```

The controller re-reads the DACL for the root and every file. Any additional
ACE, inherited root ACE, deny ACE, non-owner root, missing Full Control, short
path alias, junction or symlink blocks the command. All input files—including
the target and classification manifests—must be direct children of this root.

On POSIX, pre-create a canonical non-symlink directory owned by the current UID
and set exactly `chmod 0700`; input files must be owned by the same UID with
exactly `chmod 0600`.

## Target manifest

Use an absolute JSON path and exact values collected from the disposable clone:

```json
{
  "contractVersion": "CURRENT_NETWORK_ACCESS_SCOPE_RESTORED_COPY_TARGET_V1",
  "databaseName": "leetplus_scope_f4_review",
  "expectedSystemIdentifier": "REPLACE_WITH_EXACT_SYSTEM_IDENTIFIER",
  "host": "127.0.0.1",
  "mode": "RESTORED_COPY",
  "port": 55449,
  "roleName": "leetplus_scope_writer"
}
```

Set process-local environment values without logging them:

```powershell
$env:ACCESS_SCOPE_EVIDENCE_ROOT = 'C:\absolute\protected-access-scope-evidence'
$env:ACCESS_SCOPE_DATABASE_URL = 'postgresql://leetplus_scope_writer:REDACTED@127.0.0.1:55449/leetplus_scope_f4_review'
$env:ACCESS_SCOPE_SUBJECT_HMAC_KEY = 'hex:REPLACE_WITH_AT_LEAST_32_RANDOM_BYTES'
$env:ACCESS_SCOPE_TENANT_ID = 'demo'
```

The HMAC key is a short-lived evidence-pseudonymization secret, not a customer
hardware key. Use the same value through inventory, apply/check and rollback,
then remove it from the process environment.

## Inventory

From `packages/database`:

```powershell
node scripts/current-network-access-scope-classification.cli.mjs inventory `
  --target C:\absolute\evidence\target.json `
  --output C:\absolute\evidence\inventory.json
```

Review these fail-closed facts:

- exactly four active store IDs are present;
- the tenant and target identity digests are pinned;
- every active null-scope subject is present as an opaque digest;
- the platform administrator is distinguishable only through
  `isPlatformAdmin: true` and is still unresolved;
- no email, name or raw user ID appears.

## Classification manifest

Create a separate file. `networkStoreIds` must list the exact four active store
IDs from inventory. Every unresolved subject must appear exactly once. A
`STORES` entry must list its exact store IDs; a `NETWORK` entry must use `[]`.
The platform list must contain exactly every classified platform administrator.

```json
{
  "classifications": [
    {
      "accessScope": "NETWORK",
      "storeIds": [],
      "subjectDigest": "REPLACE_WITH_64_HEX_SUBJECT_DIGEST"
    }
  ],
  "contractVersion": "CURRENT_NETWORK_ACCESS_SCOPE_CLASSIFICATION_V1",
  "inventoryDigest": "REPLACE_WITH_INVENTORY_DIGEST",
  "networkStoreIds": [
    "REPLACE_STORE_1",
    "REPLACE_STORE_2",
    "REPLACE_STORE_3",
    "REPLACE_STORE_4"
  ],
  "platformAdminSubjectDigests": [
    "REPLACE_WITH_EXPLICIT_PLATFORM_SUBJECT_DIGEST"
  ],
  "tenantDigest": "REPLACE_WITH_TENANT_DIGEST"
}
```

The file above is schematic: the real manifest must include all unresolved
subjects, not only the one example entry.

Build the plan:

```powershell
node scripts/current-network-access-scope-classification.cli.mjs plan `
  --inventory C:\absolute\evidence\inventory.json `
  --classifications C:\absolute\evidence\classifications.json `
  --output C:\absolute\evidence\plan.json
```

Review the complete prior/desired state, four store IDs, aggregate before/after
counts and the separate `platformConfirmationDigest`.

## Detached apply approval and execution

Copy the exact `planDigest` and `platformConfirmationDigest` from the reviewed
plan. Do not pipe them from the plan command into approval automatically.

```powershell
node scripts/current-network-access-scope-classification.cli.mjs approve `
  --plan C:\absolute\evidence\plan.json `
  --direction APPLY `
  --confirm-plan-digest REPLACE_EXACT_PLAN_DIGEST `
  --confirm-platform-digest REPLACE_EXACT_PLATFORM_DIGEST `
  --confirm I_ACCEPT_EXACT_ACCESS_SCOPE_APPLY `
  --output C:\absolute\evidence\apply-approval.json

node scripts/current-network-access-scope-classification.cli.mjs apply `
  --target C:\absolute\evidence\target.json `
  --plan C:\absolute\evidence\plan.json `
  --approval C:\absolute\evidence\apply-approval.json `
  --output C:\absolute\evidence\apply-receipt.json

node scripts/current-network-access-scope-classification.cli.mjs check `
  --target C:\absolute\evidence\target.json `
  --plan C:\absolute\evidence\plan.json `
  --direction APPLY `
  --output C:\absolute\evidence\apply-check.json
```

Run `apply` a second time with a new receipt path. The accepted result must say
`disposition: RECONCILED`, `zeroDiff: true`; database mutation count is zero.

## Exact rollback

Create a distinct rollback approval by manually confirming the same two plan
digests and the rollback phrase:

```powershell
node scripts/current-network-access-scope-classification.cli.mjs approve `
  --plan C:\absolute\evidence\plan.json `
  --direction ROLLBACK `
  --confirm-plan-digest REPLACE_EXACT_PLAN_DIGEST `
  --confirm-platform-digest REPLACE_EXACT_PLATFORM_DIGEST `
  --confirm I_ACCEPT_EXACT_ACCESS_SCOPE_ROLLBACK `
  --output C:\absolute\evidence\rollback-approval.json

node scripts/current-network-access-scope-classification.cli.mjs rollback `
  --target C:\absolute\evidence\target.json `
  --plan C:\absolute\evidence\plan.json `
  --approval C:\absolute\evidence\rollback-approval.json `
  --output C:\absolute\evidence\rollback-receipt.json

node scripts/current-network-access-scope-classification.cli.mjs check `
  --target C:\absolute\evidence\target.json `
  --plan C:\absolute\evidence\plan.json `
  --direction ROLLBACK `
  --output C:\absolute\evidence\rollback-check.json
```

Rollback restores the exact prior `accessScope`, `updatedAt` and every prior
`UserStoreAccess` ID, store ID and `createdAt`. A rollback without the durable
apply audit is refused. Re-apply after rollback requires a newly reviewed plan;
the old plan cannot be replayed.

## Acceptance and remaining production gate

Restored-copy acceptance requires:

- focused test suite green;
- Full-CI PostgreSQL exact-grant/concurrency fixture passed without a skip;
- inventory/plan/apply/check/zero-diff/rollback/check receipts;
- no PII or secrets in any artifact or stdout;
- exact evidence-root identity/protection on every command; on Windows, a
  second-volume copy plus SHA-256 index when directory fsync is unavailable;
- exact aggregate and full-state digests before, after and after rollback;
- durable apply and rollback audit rows;
- the disposable database, temporary role and processes removed with an
  independent absence receipt.

Even a fully accepted rehearsal does not authorize a production mutation. A
production-capable controller, production target/role attestation, fresh backup
and rollback window must be reviewed separately before the four-club network is
classified on production.
