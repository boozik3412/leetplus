# CURRENT180 tenant-enrollment control-plane candidate

Status: `IMPLEMENTED_CANDIDATE_NOT_CANONICAL / NOT_DEPLOYABLE /
NO_APPLY_AUTHORIZATION`.

This directory is a review and PostgreSQL-rehearsal artifact. It is
intentionally outside `prisma/migrations`; the canonical schema target remains
`CURRENT_179` with 179 migrations.

The candidate adds only a dormant database foundation:

- explicit `ACTIVE / DRAINING / DISABLED` enrollment state;
- a persisted, immutable command whose Ed25519 authorization envelope binds
  the proposal, tenant, transition, previous and target configuration,
  database identity, release marker, release SHA, actor and expiry;
- an append-only, tenant-wide event chain with monotonic revisions and a
  non-branching `NULLS NOT DISTINCT` predecessor key;
- owner-only relations and functions;
- statement-level guards that reject every command, event or enrollment write
  with SQLSTATE `55000`.

It deliberately contains no apply, resume, finalize or rollback RPC, creates
no worker/application grant, inserts no enrollment and sends no email. The
existing worker v1 remains pinned to `CURRENT_179` and is expected to fail
closed on a disposable database after this candidate is rehearsed.

## Integrity

Machine-readable bindings are in `candidate.json`. The exact SQL SHA-256 is:

```text
e84ba3c4e9e61d1d759b82a33fc22c853471fb0ef908546e755699d0d264f683
```

The SQL accepts only the exact completed CURRENT179 manifest, an empty tenant
enrollment registry and zero `CLAIMED` identity-mail outbox rows. A legacy
enrollment row, including a disabled row, must reject the whole migration
without schema or business-data residue.

## Promotion boundary

Do not copy this directory into `prisma/migrations` and do not run it against a
production database. Promotion must be a separate atomic change that also
ships worker v2/runtime attestation, the producer/worker tenant advisory-lock
protocol, the DRAINING barrier, signed apply/rollback/zero-diff evidence and a
production-like rehearsal.

Only the dedicated static contract and numeric-loopback PostgreSQL 16 smoke
may execute this artifact before that promotion decision.

## Rehearsal diagnostic

The candidate keeps its own explicit transaction envelope. When a prerequisite
rejects inside Prisma `migrate deploy`, Prisma currently surfaces the later
transaction-aborted `25P02` and can leave the failed receipt `logs` empty
instead of preserving the original `55000`. The dedicated smoke therefore
proves the exact `55000` by executing the unchanged prerequisite block inside
a rollback-only diagnostic transaction, then separately proves the Prisma
failed-receipt and explicit `migrate resolve --rolled-back` path. This is a
rehearsal diagnostic limitation, not an authorization or apply path.
