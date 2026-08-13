# CURRENT195: signed Langame revoke-intent foundation

Status: `FOUNDATION + LEDGER + LIFECYCLE ACCEPTED / NONAUTHORIZING / PRODUCTION ROOTS EMPTY`.

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

## Accepted signed-foundation evidence

- standalone CURRENT195 verifier: `8/8` locally;
- composed CURRENT194/CURRENT195 static and unit gate: `38/38` locally;
- CURRENT193 regression: `17/17` locally;
- the mandatory PostgreSQL CI fixture now exercises
  `signed intent -> owner-only fresh connection -> persisted CURRENT194 replay`.
- exact SHA: `fb2d945d8a4c7c1b88eb1af0932eeb113fd68bbf`;
- GitHub CI run `31705296426`: `3/3 SUCCESS`;
- artifact `9183244096`, digest
  `sha256:a9f8d947a32f2e9cafa74104ef653953a934986e53a0ba2713b608228b79ffc0`.

## Accepted persisted-ledger successor

The next noncanonical candidate now persists the already verified envelope in
an owner-only `LangameRuntimeRevokeIntentV1` ledger before the terminal effect.
It records append-only `REGISTERED`, `APPLIED` and `EXPIRED` events. Apply locks
and reloads the exact intent, re-attests the live database/owner identity and
atomically invokes the CURRENT194 revoke routine. A lost register/apply response
can be retried only with the exact branded intent/receipt. Local static and
Prisma gates are `12/12`.

The persisted-ledger acceptance is bound to exact SHA
`a62a09d35d776f4fafc5947ae95395b07f7b6da2`. GitHub CI run `31709298574`
completed `3/3 SUCCESS`, including the actual PostgreSQL ledger smoke. Artifact
`9184903219` has digest
`sha256:02b0cd9b6ce08104e3fc6a9317bbc4afaa8d1fb8c0f4677f4000bb1e704eadc7`.

This is not yet a production coordinator. PostgreSQL does not verify Ed25519;
it persists an envelope already verified by the capability-free application
boundary. The production root registry is empty and all production entry
points remain denied. Production, the existing four-club tenant, external
tester account and owner invite are unchanged.

The accepted successor lifecycle persists the exact branded intent before it
starts provider drain, waits for zero in-flight work, closes the runtime session
without calling the raw CURRENT194 revoke path and only then applies the
persisted intent. The database independently rejects apply while the exact
consumed-attestation runtime role still has a live client backend. A fresh
owner-only process can re-register the identical persisted envelope and finish
apply after a lost process response or restart. Local lifecycle gates are
`42/42`; exact SHA `d7005bbc5eb7037baf662f46575a8fa29ca974b6` is accepted by
GitHub CI run `31716117207` as `3/3 SUCCESS`. The actual PostgreSQL fixture
proved live-runtime DB denial followed by drain and fresh-process recovery to
`APPLIED`. Artifact `9187713149` has digest
`sha256:ecd3190578a6a15c583a7776d8be77cacc3e7ba978cada7c79ced8e1c5183e09`.

## Next implementation steps

1. Add protected production signer/root enrollment and TLS peer pinning only
   after separate review.
2. Run canonical restored-copy apply/repeat/rollback/zero-diff rehearsal before
   any production or tester effect.
