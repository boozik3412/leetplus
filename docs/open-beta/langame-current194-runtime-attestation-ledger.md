# CURRENT194: persisted Langame runtime-attestation ledger

Status: `EXACT-SHA CI ACCEPTED / DORMANT / PRODUCTION DENIED`.

CURRENT193 verifies a short-lived Ed25519-signed runtime receipt and proves the
exact execute-only PostgreSQL role boundary. CURRENT194 persists the lifecycle
of that receipt so a lost database response cannot cause a second independent
authorization and an operator can revoke an issued receipt deterministically.

## Persisted state machine

- an owner-only registrar writes one exact payload, catalog receipt, execution
  plan, release SHA, database identity, role identities, signing key and
  five-minute validity window;
- the fixed runtime role can consume the receipt once through a single
  `SECURITY DEFINER` function;
- an exact retry after a lost response returns the persisted result, while a
  changed request is rejected;
- an owner-only revoker can move `ACTIVE` or `CONSUMED` to terminal `REVOKED`;
- an attempted consume after expiry persists terminal `EXPIRED`;
- lifecycle events are append-only and direct updates/deletes are rejected by
  transition guards.

Registration re-attests the live database and role OIDs, negative role
attributes, zero memberships/ownership/default grants, database/schema ACL,
zero direct table/sequence authority and exactly four callable routines: the
three CURRENT192 RPCs plus the CURRENT194 consume RPC. PUBLIC function execute
remains revoked.

## Authority boundary

The successor migration grants nothing. It does not create a runtime role,
does not enroll a signing root, does not register an API/BFF/UI route and does
not make the CURRENT192 application coordinator deployable. The disposable SQL
matrix creates and grants the fixed role only inside a transaction that is
rolled back, and verifies zero role residue afterwards.

Production, the existing `Tenant A/A1..A4`, external tester accounts and
mailbox invites are outside this candidate. Every launch/effect flag remains
false until a separate reviewed runtime provider, canonical restored-copy
rehearsal, controlled internal alpha and `SHARED-BETA-GO` are accepted.

## Acceptance evidence

- checksum-bound noncanonical successor and static contract;
- positive register, exact register replay, consume, exact consume replay,
  revoke and exact revoke replay;
- rejection of changed replay and direct ledger mutation;
- denial of runtime table reads and absence of TEMP/schema/role/table/sequence
  authority inherited from CURRENT193;
- disposable rollback and zero runtime-role residue;
- exact SHA `0578e5e432bdea4e4df9fa8144cffebd0bf7cf67` completed GitHub
  Actions run `31688314546` as `3/3 SUCCESS` on 13.08.2026;
- the accepted PostgreSQL job includes CURRENT192 atomic import, corrected
  CURRENT193 role boundary and CURRENT194 register/consume/expiry/revoke/replay;
- artifact ID `9176620158`, digest
  `sha256:9e0a8a9b6045e51451c3338f28927cbef496076d408797ac5bb11cc2d69fa62c`.

The synthetic provider foundation additionally consumes only a branded
CURRENT193 `SYNTHETIC_CI` verification, retries the same frozen register/consume
spec once after a lost response, exposes only exact `claimCurrent192`,
`executeCurrent192` and `reconcileCurrent192` RPCs, and drains to zero in-flight
work before closing its injected runtime driver. The CURRENT194 Prisma adapter
constructs two separate clients only behind an explicit loopback-CI admission:
an owner registrar and the fixed execute-only runtime role. Before registration
it re-attests exact database, role names and OIDs on both live sessions, exposes
no arbitrary SQL method, and will not execute CURRENT192 before the persisted
receipt is consumed. Unit coverage is `8/8`; the actual disposable-clone
PostgreSQL acceptance is wired into CI and remains pending for the next exact
SHA. Both production entry points still fail closed, and no production root,
credential, role or grant is enrolled.

## Next implementation steps

1. Accept the actual separate-owner/runtime Prisma client matrix on an exact CI
   SHA, including disposable role/database cleanup and zero residue.
2. Add production TLS peer pinning plus process startup/revoke/credential-rotation and ambiguous-response
   reconciliation tests with zero in-flight work at shutdown.
3. Run canonical restored-copy apply/repeat/rollback/zero-diff rehearsal.
4. Only after the common launch gates, run the four-club internal alpha and
   issue a mailbox-bound OWNER invite for a separate tester tenant.
