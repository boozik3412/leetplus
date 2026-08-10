# CURRENT187-I persisted semantic approval ledger candidate

Status: `NONCANONICAL / DENY-ONLY / SYNTHETIC-CI / NOT_DEPLOYABLE`.

This directory is deliberately outside `prisma/migrations`. The SQL can run
only over a loopback server connection to a disposable database named
`lp_c187i_<12 hex>_ci`, with an explicit rehearsal confirmation, the exact
database owner and exact unprivileged consumer, revoker and application-runtime
role OIDs. It does not authorize a production apply, application route, tester
account, provider call or shared-beta access.

The candidate persists two append-only streams:

- one exact signed semantic approval consumption per operation id, nonce and
  approval digest;
- one exact revocation per event id and approval, document, evaluation or root
  scope.

Exact retries return the stored receipt text byte for byte. Changed identity
replays fail with `23505`; expired or revoked consumption fails with `55000`.
Both RPCs reconstruct the exact canonical JSON from validated scalar fields;
reordered documents and duplicate-key substitution fail with `22023` even when
the caller recomputes a matching digest for the noncanonical bytes.
Consume and revoke share transaction-scoped advisory locks in the order root,
approval, document and evaluation. Consumption then locks operation and nonce.
Fresh `clock_timestamp()` state is read only after the complete shared lock
chain, so expiry or revocation cannot cross a waiting consumption unnoticed.

All three tables use forced RLS with one owner-only policy. `PUBLIC`, the
application-runtime role and both duty roles have no table DML. The consumer
receives execute only on the consume RPC; the revoker receives execute only on
the revoke RPC. Receipts contain only bounded digests, canonical timestamps,
transaction ids and deny flags.

Canonical promotion remains blocked on production root enrollment, reviewed
runtime role/HBA evidence, predecessor resolution, hostile PostgreSQL
acceptance, a canonical migration and a separately authorized production-like
apply/rollback/zero-diff rehearsal.
