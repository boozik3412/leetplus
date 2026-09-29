# Current plan: simple production releases

Status 29.09.2026: the legacy controller chain (A → bridge → B, standalone
intro/transport, transition bootstrap, dispatcher) is stopped and frozen.
Production releases move to `lp` ([deploy/simple/README.md](deploy/simple/README.md)).

1. Install `lp` on the host; first release of current `main` through
   `lp deploy`, with the previous slot kept as instant rollback.
2. `lp adopt --yes`: bonus/daily worker timers and host boot run through `lp`.
3. Migration step in `lp` (dump → `prisma migrate deploy` → deploy) and remove
   the fixed 191-migration requirement from `image-metadata.mjs`/`health.cjs`.
4. Move the nightly restore check and backup pruning to a schedule; clean up
   old rehearsal/operation data on the host (with the owner's approval).
5. Trim CI: the five required checks gate releases; Full admission becomes
   optional/nightly.
