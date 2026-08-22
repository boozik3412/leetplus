# CURRENT194: persisted Langame runtime-attestation ledger

Status: `RESTART RECOVERY EXACT-SHA CI ACCEPTED / DORMANT / PRODUCTION DENIED`.

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
PostgreSQL acceptance completed on exact SHA
`2a5811e031afbc7a87f1b794fe6b913e01a2c864`: GitHub Actions run
`31692243774` finished `3/3 SUCCESS`, including the exact owner/runtime Prisma
step, artifact ID `9178145263`, digest
`sha256:8a336bb0108295fd38ecec8ac5b1a041e1053ccbf48c5372f385c69c757910f2`.

The composed bootstrap verifies the signed CURRENT193 receipt before creating
a separate Prisma pair, persisted CURRENT194 register/consume and the bounded
provider session. It creates no clients before signature verification and
closes both clients after rejected or ambiguous startup. Exact SHA
`e829f3036006aa7dc83ec7a7138a08c82fa060d2` completed GitHub Actions run
`31694281914` as `3/3 SUCCESS`; artifact ID `9178952687`, digest
`sha256:1db3c8e772f0d5600f6ee2aa1be560fe10f148b686354ba250fc74f72633afc7`.

The next local lifecycle layer adds `revokeAndDrain`: it rejects new work,
waits for exact zero in-flight, invokes only the owner-side revoke with the
same frozen spec on a lost response, and closes both clients even when the
response remains ambiguous. The runtime role receives no revoke grant. The
combined static/unit gate is `32/32`; its disposable PostgreSQL fixture rotates
both passwords, proves stale credentials fail, opens a new signed bootstrap,
and checks terminal ledger state and zero residue. Exact SHA
`01cd9e456d5ff4b4878245f0c4bc365bcffcd68d` completed GitHub Actions run
`31697571300` as `3/3 SUCCESS`; artifact ID `9180219464`, digest
`sha256:2062ba99b6c7a81e6072fadd7cf03fb089c17482be4bc7976bc50b38bf49b271`.
All production entry points still fail closed, and no production root,
credential, role or grant is enrolled.

The accepted lifecycle evidence was then recorded on exact SHA
`ed2ea410fad1685c7b7c46a6241bf932d0fbddd7`: GitHub Actions run
`31698913278` completed `3/3 SUCCESS`; artifact ID `9180745285`, digest
`sha256:f73c8241f480aca54112888f8b32bb0fc23b62aacb99e4ef582e3808bf9f1782`.

The next local restart-reconciliation foundation uses a new owner-only
adapter. Its exact configuration contains only the expected database, owner
role and owner URL; the object exposes only `recoverRevokeCurrent194` and
`close`, and rejects any runtime URL or client. The composed recovery verifies
the signed CURRENT193 attestation again, binds the database/role names and OIDs,
payload digest, revoke request digest and reason digest, then repeats only the
fixed terminal revoke RPC. The actual disposable PostgreSQL fixture reopens
this separate owner-only path and observes the persisted replay. The focused
CURRENT194 gate is locally `36/36`, including malformed-request cleanup;
CURRENT193 remains `17/17`.

Exact SHA `9baa29c39bd3a0023be287478327a8b492604d13` completed GitHub
Actions run `31700945915` as `3/3 SUCCESS`. The PostgreSQL job exercised the
fresh owner-only adapter against the persisted terminal row after the original
session had closed. Artifact ID `9181448914`, digest
`sha256:57fb23ac3078761a3ed6631936a902744bcca4c314d21b06a7f93f27420ddba6`.

The exact-SHA CURRENT194 foundation deliberately remains production-denied. It
does not persist or sign the revoke intent supplied by the caller, so it is not
by itself sufficient proof for unattended production recovery after a process
crash.

The local CURRENT195 successor now adds an independent short-lived Ed25519
revoke-intent envelope and makes a new recovery path accept only its branded
verified receipt. The actual PostgreSQL fixture uses that path. CURRENT195 does
not yet persist the signed intent and its production root registry remains
empty, so the production decision is unchanged; see
[CURRENT195 signed revoke intent](./langame-current195-signed-revoke-intent.md).

## Next implementation steps

1. Persist the exact signed revoke intent, then bind the owner-only restart
   reconciler to its branded durable ledger receipt.
2. Add production TLS peer pinning for the owner and runtime connections.
3. Run canonical restored-copy apply/repeat/rollback/zero-diff rehearsal.
4. Only after the common launch gates, run the four-club internal alpha and
   issue a mailbox-bound OWNER invite for a separate tester tenant.
