# CURRENT193: Langame initial-sync runtime boundary

Status: `LOCAL FOUNDATION + DISPOSABLE MATRIX / CI PENDING / PRODUCTION DENIED`.

CURRENT192 proves the atomic database transition and its lost-response
coordinator, but it deliberately grants no runtime authority. CURRENT193 must
make that authority narrow, independently observable and revocable before any
route can be registered.

## Required topology

- a dedicated PostgreSQL LOGIN role is used only by the initial-sync worker;
- the role is `NOINHERIT`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`,
  `NOREPLICATION` and `NOBYPASSRLS`;
- it owns no database, schema, relation, sequence, routine or type and has no
  role memberships;
- it has `CONNECT` to the selected database, `USAGE` on `public` and `EXECUTE`
  on exactly the CURRENT192 claim, execute and reconcile functions;
- it has no direct table or sequence privilege and no execute privilege on the
  two guard functions or unrelated routines;
- PUBLIC remains revoked and all three callable routines remain
  `SECURITY DEFINER` with exact `pg_catalog, public` search path;
- the ordinary API Prisma connection is not an acceptable substitute for the
  dedicated runtime role.

## Admission and attestation

Worker startup must fail closed until a fresh catalog acquisition binds all of
the following to one database identity and release SHA:

1. exact role OID and negative role attributes;
2. zero memberships and zero owned objects across all relevant catalogs;
3. exact database/schema/function ACLs and absence of table/sequence/default
   privileges;
4. exact CURRENT192 routine definitions, owners, `prosecdef` flags and
   `proconfig` search paths;
5. `current_user`, `session_user`, database OID/name and TLS/pooler/service
   identity evidence;
6. CURRENT192 migration checksum
   `cc40b3fadd5f0e8f3e131838a52d68d972f45c0ee4755784be3c86a3127361f3`;
7. a short-lived signed runtime receipt with one-time persisted consumption
   and independent revocation.

The application coordinator may receive a database adapter only after this
receipt is verified and consumed. A cloned receipt, stale catalog snapshot,
role OID drift, changed routine body/owner/ACL, ambiguous response or
revocation must stop before claim.

## Acceptance sequence

1. Pure exact grants/catalog planner with production roots frozen empty.
2. Disposable PostgreSQL role matrix: positive three-function execution and
   negative table/sequence/unrelated-function/DDL/cross-database probes.
3. Signed attestation authority plus persisted consume/revoke/lost-response
   ledger.
4. Dedicated application runtime client; remove broad `PrismaService` from the
   CURRENT192 coordinator boundary.
5. Process lifecycle matrix: startup, drain, credential rotation, revoke,
   ambiguous disconnect and zero in-flight shutdown.
6. Canonical restored-copy apply/repeat/rollback/zero-diff rehearsal.

None of these steps registers HTTP/BFF/UI routes, changes production, touches
the existing four-club tenant or permits a tester invitation. Those actions
remain behind the common `SHARED-BETA-GO`.

## Local evidence

- pure planner/catalog matcher: `9/9` static and adversarial checks;
- independent Ed25519 verifier: `8/8`; exact branded catalog receipt, release,
  database/role OIDs and CURRENT192 checksum are signed for at most five
  minutes; clone, attacker-root, signature/digest/timeline/context drift fail
  closed;
- branded plan and receipt reject clones, proxies, accessors and catalog drift;
- rollback-only SQL creates the fixed role, removes inherited PUBLIC authority,
  grants exactly three CURRENT192 functions and proves denial of direct table,
  sequence, guard-function, schema DDL, TEMP and role-escalation operations;
- production root registry is empty and every receipt keeps
  `productionExecutionAllowed=false`.

The actual PostgreSQL matrix is wired into CI but is not accepted until its
exact commit SHA completes all three jobs and publishes a reproducible artifact.
