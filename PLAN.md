# Current plan: simple production releases

Status 29.09.2026: production releases go through `lp`
([deploy/simple/README.md](deploy/simple/README.md)); the legacy controller
chain (A → bridge → B, standalone intro/transport, transition bootstrap,
dispatcher) is stopped and frozen.

Done:

1. `lp` installed on host 1337; workers and host boot run through `lp`.
2. Migration step in `lp` (dump → one transaction per migration with runtime
   grant check → deploy), `DATABASE_AHEAD` readiness for rollback safety, no
   fixed migration count in image builds.
3. Host cleanup of stale rehearsal/operation data and daily retention
   (`lp cleanup`).

Next:

4. Trim CI: the five required checks gate releases; Full admission becomes
   optional/nightly.
5. Move the nightly backup and network refresh off the legacy controller into
   `lp`, and drop release image bundles from the nightly backup.
