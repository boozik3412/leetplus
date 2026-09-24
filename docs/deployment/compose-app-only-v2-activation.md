# Variant B activation and comparative pilot

Status: **HOLD — source candidate, no production activation**. This document
describes the exact evidence and ownership needed to activate the B controller
after A is accepted. It is not a GO packet or permission to run a server effect.

## Dependency and single effect owner

1. Accept A documentation PR #239 and repair PR #241 on exact main with Fast,
   required PR checks and Full admission. Independently finish A's separate
   controller-only production handoff and installed-path acceptance. A repair
   merged as `b0cbf3a4f302b299762fa055f3bffe0376a91182` and exact-main
   Full run `35997208370` passed. Its production controller installation is
   a separate operation and must be verified before B activation.
2. B PR #240 is rebased on that accepted main. Run exact combined-SHA tests and
   CI for every new B head. Review the A/V1 and B/V2 job graphs: unknown, mixed and L2 candidates
   must retain the complete original V1 path. A successful B source test or
   draft PR does not establish an admitted app artifact.
3. Assign the production dispatcher as the one effect owner. Before any server
   command, read the complete `deploy-evidence/<operation>/ERROR_LOG.md`, check
   all current operations, timers and worker singleton locks, and freeze exact
   release, controller, active/rollback/data, host and approval identities.
   Keep stdout, stderr, exit and immutable receipts for every command. A
   completed effect is reconciled, never repeated after a lost response.

## Required controller handoff before B can run

The currently reviewed handoff authority recognizes only pinned A transitions.
It rejects B's changed control/orchestrator/runner/observer files. A B-only
controller source cannot authorize its own installation: its final release and
install-manifest hashes would depend on the authorization code itself. An
independent review reproduced this self-authorization gap and rejected a
local B v3 patch before publication. Prepare a predecessor-side signed
exact-target transition permit, or a separately admitted and installed bridge
controller, whose authority is fixed before B target bytes are accepted. It
must bind:

- exact installed A predecessor release and manifest SHA;
- every old and new privileged/runtime leaf digest that changes in B;
- exact target B release and admitted V1 control archive/manifest;
- unchanged application, data, nginx, worker grants/timers, network policy and
  systemd units, with `applicationRestartAllowed=false`,
  `timersMayBeStopped=false`, and rollback bound to the accepted receipt.

Negative fixtures must reject each altered digest, wrong predecessor, pending
handoff, legacy fallback, forged approval and replay, including simultaneous
top-level and nested target changes and changed authority leaves. After
exact-main Fast and Full success, stage only through the installed A controller,
review the native
handoff plan and fresh backup/restored-copy evidence, then obtain a *new*
exact-plan GO. The GO consumed for the A handoff cannot be reused. Confirm
the serving pointer, six existing container IDs/PIDs, PG/Redis/dataRelease,
current generation, both grants and four timers remain unchanged. B's
`appOnlyV2BaselineCertification` capability may be trusted only after that
accepted installed-path check.

## First application pilot

The installed B controller can certify an app-only candidate only if its
source impact base equals the currently accepted active app SHA. If production
remains on GREEN `f97af35d…` while main is newer, first make a separately
admitted **full V1** application release on the intended base. Use A's fresh
backup, authenticated off-host copy, restored CURRENT191 clone, browser/API
acceptance, resource/cooldown, exact signed plan, worker continuation, five
native phases and hot rollback. This base release has its own GO and is not a
B speed pilot.

For a later exact display-only change:

1. Reverify the main-push impact and candidate receipts; require every changed
   file to be a modification in the B exact allowlist and preserve its parsed
   client-component structure except JSX text and inert display attributes.
   Any unknown, auth,
   scope, schema, ACL, control, worker, provider, dependency or mixed change
   returns to full L2/V1. The CI AppBundle and admission must bind API/Web
   image IDs, current schema inputs, real both-slot API/guest/corporate/worker
   negatives, TLS/network matrix and isolated Docker29 archive inventory.
2. Download the exact V2 admission and API/Web-only archive by run/attempt and
   GitHub transport digest into the root-private fixed app-download directory.
   Reconcile a lost transfer from complete bytes; do not rerun it blindly.
3. Run V2 preparation under its existing global lock. Recheck installed
   controller, active generation and workers; preserve the **fresh encrypted
   backup, off-host authenticated decrypt, full restored-copy rehearsal,
   browser/API and resource/cooldown** requirements. The installed controller
   certifies unchanged PG/Redis, primary DB identity, all 191 migrations and
   checksums, ACL, active state and readiness, then publishes immutable V2
   app/data evidence with one V2 native plan. The runner ends at
   `PREPARED_NOT_AUTHORIZATION` and produces the exact V2 GO packet.
4. Obtain a separate GO for that immutable V2 plan SHA and expiry. The offline
   signer retains the V1 approval envelope bound to the complete V2 plan hash,
   host/action and the earlier of preparation/baseline expiry. Native
   `apply/resume` alone owns HYDRATE → BIND → SMOKE → CUTOVER → POSTCHECK,
   with the A V2 worker-continuation policy. If a phase response is lost,
   inspect the existing intent/evidence/receipt and live state before resume.
   Expiry never authorizes a new phase; rollback uses the accepted hot slot.
5. Independently verify public API/Web, authenticated tenant/guest negatives,
   target and rollback readiness, unchanged PG/Redis/data admission, original
   timer states and ordinary worker receipts. Only then record production
   `VERIFIED`. Natural phone/Telegram login remains a separate canary when
   its route is in the release scope.

No shorter backup/recovery policy is chosen here. Reuse of a recovery point
needs an owner-selected age/RPO, regular restore proof, fresh compatibility
evidence and another reviewed contract. The first B pilot retains full restore.

## Measurement and decision

Record UTC `request → code-ready → PR-ready → merged → admitted → prepared →
GO → applied → verified`, exact SHA, trusted lane and reason for every wait.
Separate CI critical path, preparation, user/window wait, native apply,
postcheck, diagnosis/retry and rollback. Compare completed eligible B cases
with measured A application releases on the same definitions. The 15–30
minute goal is a hypothesis for a ready window and timely GO; source/CI PASS,
a controller handoff or one successful pilot cannot prove it. Pilot ten
eligible cases and report each timeline, p50/p95 and exclusions without
claiming an SLA.
