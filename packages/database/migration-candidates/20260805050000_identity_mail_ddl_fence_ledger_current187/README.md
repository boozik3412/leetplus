# CURRENT187-E persisted DDL-fence ledger candidate

Status: `NONCANONICAL / DENY-ONLY / SYNTHETIC-CI / NOT_DEPLOYABLE`.

This directory is deliberately outside `prisma/migrations`. The SQL can run
only in a disposable loopback database named `lp_c187e_<12 hex>_ci`, with an
explicit rehearsal confirmation and exact unprivileged owner, consumer,
revoker and application-runtime role OIDs. It does not authorize a production
apply, application route, tester account, provider call or shared-beta access.

The candidate persists two append-only streams:

- one exact CURRENT187-D signed-attestation consumption per operation id,
  nonce and envelope digest;
- one exact revocation per event id and envelope, attestation or root scope.

Exact retries return the stored receipt text byte for byte. Changed identity
replays fail with `23505`; expired or revoked consumption fails with `55000`.
Consume and revoke share transaction-scoped advisory locks in the order root,
envelope, attestation, operation and nonce; an existing row is locked only
after those advisory locks. Expiry is evaluated from a fresh wall-clock read
after the complete lock chain, so a command that expires while waiting cannot
be consumed. This prevents a revocation or expiry boundary from crossing a
consumption unnoticed.

All three tables use forced RLS with one policy addressed only to the resolved
table/function-owner role. `PUBLIC`, the application-runtime role and both
duty roles have no table DML. The consumer receives execute only on the consume
RPC; the revoker receives execute only on the revoke RPC. Receipts contain
digests and deny flags, not signatures, PEM, email, credentials, URLs or
provider identifiers.

Canonical promotion remains blocked on production root enrollment, reviewed
runtime role/HBA evidence, predecessor resolution, a canonical migration and a
separately authorized production-like apply/rollback/zero-diff rehearsal.
