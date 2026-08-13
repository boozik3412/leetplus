# CURRENT194: persisted Langame runtime-attestation ledger

Status: `LOCAL FOUNDATION / CI PENDING / DORMANT / PRODUCTION DENIED`.

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
- exact-SHA CI and artifact evidence: pending.

## Next implementation steps

1. Accept CURRENT192, corrected CURRENT193 and CURRENT194 on one exact CI SHA.
2. Add the dedicated attested runtime database provider; it must verify the
   signed receipt, persist registration, consume through the fixed role and
   inject only the narrow CURRENT192 SQL port.
3. Add process startup/drain/revoke/credential-rotation and ambiguous-response
   reconciliation tests with zero in-flight work at shutdown.
4. Run canonical restored-copy apply/repeat/rollback/zero-diff rehearsal.
5. Only after the common launch gates, run the four-club internal alpha and
   issue a mailbox-bound OWNER invite for a separate tester tenant.
