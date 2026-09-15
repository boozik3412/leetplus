# Provider network reliability and zero-planned-app-downtime controller update

Status: PR208 initial Fast/Compose CI PASS; final interrupted/expired-handoff recovery regressions added, follow-up CI pending; not deployed. Base f07005b5; serving application b5/gen5, data/controller399876 until verified handoff. Switching waits for the actual exclusive lock without stopping any timer.

1. Implement an exact refresh-only shared control lock plus separate exclusive refresh singleton; attest both real kernel locks and reject mixed/unknown options.
2. Preserve approved host policy, public-IP filtering,3600s TTL and atomic set swaps. Add bounded service retries and machine-readable remaining TTL/last result before expiry; no external notification credentials.
3. Add stage-only installer and signed serving handoff plan/apply/rollback with exact manifests, state/grant/container continuity, durable intent/receipt, preserved rollback bytes and a single atomic core pointer. Thin unchanged delegating network/backup launchers may stay in their older immutable generation.
4. Rehearse policy/root flock concurrency, DNS failures/old-set preservation, handoff drift/crash/rollback and unchanged app processes. Run all independent local gates as a bounded batch; add new gates to existing Compose CI.
5. Update security/open-beta/runbook sections, review and obtain exact-main Fast+Full admitted bundle. Do not implicitly deploy USER_CALL or executive UI.
6. Under coordinated owner-approved exact host plan, stage and switch controller only; preserve app/data/worker grants. Verify public health, provider reachability, real refresh during worker, multiple timer cycles and rollback readiness. Record actual offline, not a promised zero.

Production changes require complete operation ERROR_LOG review and fresh preconditions. Tests/CI may pass while production remains old; report these states separately.
