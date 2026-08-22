# CURRENT195 Langame signed revoke-intent ledger

Dormant noncanonical successor. It persists an already verified short-lived
CURRENT195 Ed25519 revoke intent before the owner-only terminal effect, records
append-only registration/application/expiry events and makes the apply call
exactly replayable after a lost response or process restart.

PostgreSQL does not enroll or verify a signing root. The application verifier
must supply a process-local branded CURRENT195 receipt; the ledger independently
rechecks the bound CURRENT194 attestation, database/owner identity, freshness and
digest/identifier separation. The migration grants no runtime, application,
route, deployment or production authority.
