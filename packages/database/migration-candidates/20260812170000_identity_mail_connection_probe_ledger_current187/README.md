# CURRENT187-J5-R3 PostgreSQL connection-probe ledger candidate

Status: `NONCANONICAL / DENY-ONLY / SYNTHETIC-CI / NOT_DEPLOYABLE`.

This directory is deliberately outside `prisma/migrations`. Installation is
restricted to a confirmed disposable database named `lp_c187j5l_<12 hex>_ci`
and binds the exact database owner plus separate unprivileged consumer,
revoker, and application-runtime role names and OIDs.

The candidate persists an append-only, one-time connection-probe envelope
consumption stream and an append-only revocation stream with exact
`ENVELOPE`, `MATRIX`, and `ROOT` scopes. Both RPCs reconstruct application
canonical JSON from validated scalar values, reject duplicate-key or reordered
documents, and return byte-identical stored receipts for exact replay after a
lost response.

Consume and revoke acquire transaction-scoped advisory locks in the same order:
root, envelope, and matrix; consume then locks operation and nonce. New-effect
freshness and revocation checks occur only after the complete lock chain.

All tables use forced RLS with an owner-only policy and append-only triggers.
Duty roles receive no table DML. The consumer receives execute only on consume;
the revoker receives execute only on revoke; the application-runtime role
receives neither. Receipts are bounded, secret-free, noncanonical, and keep all
launch/effect flags false.

This candidate does not enroll a production root, create tenant/tester access,
authorize deployment, activate a route, contact a provider, or mutate
production. Canonical promotion remains blocked on hostile PostgreSQL
acceptance, independent review, external key ceremony and OS/HSM attestation,
reviewed root enrollment, production-like topology evidence, and binding into
CURRENT187-F/deploy authority.
