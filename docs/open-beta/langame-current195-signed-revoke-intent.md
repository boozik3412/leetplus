# CURRENT195: signed Langame revoke-intent foundation

Status: `LOCAL ENGINEERING FOUNDATION / NONAUTHORIZING / PRODUCTION ROOTS EMPTY`.

CURRENT194 can reconcile an exact terminal revoke after a lost database
response through a fresh owner-only connection. CURRENT195 removes the caller's
ability to supply those revoke fields directly to the new recovery path: a
short-lived Ed25519 envelope binds the exact CURRENT193 attestation and the
complete revoke request before the owner-only adapter is created.

## Exact binding

The signed payload includes:

- CURRENT193 attestation ID, payload digest, signing key and public-key
  fingerprint;
- release SHA, database name/OID and schema-owner role name/OID;
- CURRENT194 contract identifier;
- intent ID, revoke request ID, request digest and reason digest;
- independent CURRENT195 signing key, purpose/trust domain and a maximum
  five-minute validity window.

Verification requires a process-local branded CURRENT193 receipt. Cloned or
plain-object receipts, a receipt from another signer, changed database/role
identity, release SHA, payload or request digest, attacker root, proxy,
accessor, extra field, future/expired/overlong timeline and non-loopback/non-CI
context all fail closed.

The verifier has no signer, filesystem, database, process, network or arbitrary
SQL capability. The production root registry is frozen empty. The composed
synthetic recovery verifies CURRENT193 and CURRENT195 before opening the
owner-only Prisma connection; runtime credentials and runtime RPCs are absent.

## Evidence and boundary

- standalone CURRENT195 verifier: `8/8` locally;
- composed CURRENT194/CURRENT195 static and unit gate: `38/38` locally;
- CURRENT193 regression: `17/17` locally;
- the mandatory PostgreSQL CI fixture now exercises
  `signed intent -> owner-only fresh connection -> persisted CURRENT194 replay`.

This is not yet a durable production coordinator. The signed envelope is not
persisted by a CURRENT195 PostgreSQL ledger, the production root registry is
empty, and all production entry points remain denied. Production, the existing
four-club tenant, external tester account and owner invite are unchanged.

## Next implementation steps

1. Add a noncanonical owner-only CURRENT195 PostgreSQL intent ledger with
   append-only audit, exact register/apply replay and post-lock freshness.
2. Bind the owner recovery adapter to the branded persisted intent receipt,
   with bounded double-lost-response reconciliation.
3. Add protected production signer/root enrollment and TLS peer pinning only
   after separate review.
4. Run canonical restored-copy apply/repeat/rollback/zero-diff rehearsal before
   any production or tester effect.
