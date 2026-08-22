# CURRENT185 identity-mail enrollment evidence ledger V2 candidate

Status: `IMPLEMENTED_CANDIDATE_NOT_CANONICAL / NOT_DEPLOYABLE /
NO_APPLY_AUTHORIZATION`.

This directory is a disposable-rehearsal artifact above the exact frozen
CURRENT184 candidate. It remains outside `prisma/migrations`; production stays
on canonical CURRENT179/179.

The candidate version-expands the empty dormant enrollment-command ledger to
the exact V2/69 evidence contract, adds immutable Manifest V2 and manifest
revocation evidence, and exposes one database-owner-only two-`TEXT` importer.
It stores canonical PII-free evidence and returns replayable original import
receipt metadata. Exact replay is checked before command/manifest expiry so a
lost committed response can be recovered after the signed windows close.

Normalized `migration.sql` SHA-256:
`2c8752ec4f92addabd21ace9be8071aea1e62be45887abb2c4944de2f96657e6`.

The prerequisite and postcondition pin the exact final name/type/null/default
column manifests for all three ledger relations, the ordered source and
referenced attribute shards of both command-to-manifest composite foreign
keys, and the owner-only catalog metadata plus body digests of every retained
CURRENT184 worker V2 RPC. The importer name is exclusive in `public`: no
overload, variadic form or default argument is accepted.

Both prerequisite and postcondition also pin the retained
`identity_mail_tenant_lock_v1(text)` as the only routine with that name,
including its exact owner-only ACL, owner, body digest, argument name, return
type, language, invoker/security flags, volatility, parallel safety, search
path, and absence of overloads, defaults, or variadic arguments.

The postcondition pins all eight foreign keys reachable from the three
evidence relations as one exact catalog matrix: source and referenced
relations, ordered `conkey`/`confkey`, simple match, restrictive update/delete
actions, validation, and exact deferrable/deferred flags. Extra or missing
foreign keys fail the count boundary.

The command and manifest relations also have a transaction-local importer
context trigger. This is an anti-accident fence for the current same-owner
rehearsal, not an authorization boundary against the database owner: a database
owner can change owned objects or custom settings by definition. Promotion
therefore still requires a separate `NOLOGIN` schema/table owner and runtime
roles without direct relation DML.

Migration apply is intentionally non-idempotent. If the client loses the
response after SQL `COMMIT` but before Prisma marks its receipt finished, the
only supported recovery is to discard and recreate the disposable rehearsal
database. Do not rerun this candidate and do not use it as a production
apply/rollback rehearsal artifact.

The candidate deliberately does **not** add the four-`TEXT` phaseful driver,
roles, grants, runtime wiring, worker activation, trust roots, SMTP behavior,
or production apply authority. The database does not repeat Ed25519 or live
catalog grants verification; those proofs arrive only through the sealed
application composition bundle and are persisted as immutable evidence.

The exact SHA is pinned independently by `candidate.json` and the CURRENT185
foundation checker.
