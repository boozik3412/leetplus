# CURRENT191 Langame initial-sync approval ledger candidate

Status: `DORMANT / NONCANONICAL / NOT_DEPLOYABLE / NO BUSINESS IMPORT`.

This successor candidate is outside both `prisma/migrations` and the frozen
CURRENT180-CURRENT190 `migration-candidates` inventory. It has no application
or PUBLIC grants and does not modify Product, InventorySnapshot,
IntegrationSyncJob, provider state, or production configuration.

It persists only a short-lived, PII-free preflight receipt after CURRENT188
activation and a one-time explicit owner approval. Exact request replay is
read-only; changed replay, stale authority, binding drift, expiry and
cross-tenant access fail closed. Approval rows and audit rows are append-only.

Both record and confirmation re-check a consumed, unrevoked, unexpired tenant
`GO`, an active `NETWORK` actor, and the exact CURRENT188 activation, Store,
source and credential binding under locks. Confirmation cannot rely on the
earlier preflight snapshot. Only exact `PENDING_CONFIRMATION -> CONFIRMED` or
`PENDING_CONFIRMATION -> EXPIRED` transitions are admitted.

Approval inherits the original preflight `expiresAt` as its exact
`validUntil`; confirmation never extends the 15-minute provider-read window.

The candidate deliberately has no claim/import/complete RPC. A later slice
must add runtime roles, deterministic plan consumption, atomic selected-Store
business writes and lost-response reconciliation before any route can be
enabled.
