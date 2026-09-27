# External Langame set-1 controller successor

Status: **source-only candidate; production HOLD**. The app writer is owned by
the separate external-worker source task. This controller branch was based on
main `5b22ff2ffd655760b1c98e2f42052b2bccb61039`; a combined image and
runtime admission must be rebuilt from a later exact main commit after the app
changes pass their own review and merge. No release, signing key, provider call
or server state is changed by this source packet.

## Boundaries

- The two accepted bonus and internal Langame workers keep their V2 policy,
  signatures, grants, timers and runtime paths. `workerSetV3.legacy` must be
  byte-identical to that accepted V2 policy.
- `LANGAME_EXTERNAL_SET1_V1` is an optional release and image capability. It
  appears only when the dedicated compiled CLI and the real non-root runtime
  entrypoint pass the disabled-profile, network-none image gate. Historical
  releases without the marker retain their original Compose bytes.
- A capable release renders a third worker service in a dormant Compose
  profile. It creates no grant or timer authority. A separate accepted app
  POSTCHECK, public-only external worker root enrollment, signed CANARY
  enrollment, bounded canary run, and signed TIMER enrollment are required
  before the third daily timer can run.
- The external profile is exact for tenant `8cc79086-ed43-44fa-83d3-20207ec48758`,
  source `94a3842b-847e-4c4d-89b0-7cb8976a9f17`, Store
  `ecee16ef-f0cb-4307-b079-e2f0303c3a16`, domain `1171.langame.ru`, club `1`.
  Prisma has a one-connection pool. The separate app-side advisory-lock client
  uses one additional PostgreSQL connection. The worker has no Redis or SMTP
  egress and no reward/guest-game authority.
- The worker signs grants and enrollment with a separate Ed25519 root at
  `/etc/leetplus-compose/external-worker-root.pem`. The deployment root may
  authorize only the public-only enrollment of that root. The admin tenant
  approval root is separately pinned as single-line DER SPKI base64 in the
  API profile; no private key enters a container.
- Native TIMER injects one frozen previous-completed `Asia/Yekaterinburg`
  business date and UUID after checking the static secret. The exact app CLI
  emits one compact JSON terminal line. A durable ambiguous intent forbids a
  blind provider retry. An already completed run replays with exit 75 and
  `NO_NEW_EFFECT`; that is not counted as another success.
- Every native run freezes its exact Docker container ID before provider work.
  Attached timeouts stop that ID; systemd `ExecStopPost` independently holds
  the external singleton and can stop it even when a global writer wins after
  the parent is killed. Global writers and handoff reject a running orphan.
  The external process has a 300-second setup budget, 2700-second attached run,
  a separate 600-second stop window and immutable cleanup receipts. Foreign
  IDs, ambiguous intents or daemon cleanup failures require reconciliation.

## Rollout and rollback

The first capable app rollout carries V3 `ABSENT_AUTHORITY` and leaves the
third worker dormant. A later signed native enrollment installs only the
external service, timer, secret, grant and exact source-IP fence. CANARY keeps
the timer disabled. TIMER requires the accepted CANARY enrollment plus the
same tenant/source/Store/revision's native canary intent, result and receipt;
permission-partial results with no failed scope can be accepted. The approved
timer is enabled last, after signed profile/grant and network postimages.

Future capable-to-capable app rollouts keep all three workers under one
exclusive controller window. V3 stages signed N+1/N+2 grants. Rollback to an
unmarked release removes the external grant and disables its timer before
publishing the rollback receipt. An expired enrollment intent with no receipt
is reported as `RECOVERY_REQUIRED_EXPIRED_UNRECEIPTED`; it cannot mint a late
success or execute a missing effect. The old/missing enrollment pointer makes
the external run fail closed pending a separately approved recovery plan.

The network fence owns only `.42.22` → PostgreSQL 5432 and `.43.22` → the
bounded `1171.langame.ru` IPv4 set on TLS 443. Exact source hooks precede the
existing project hook; the original project rules and original worker addresses
are not modified. The external network has its own rollback to the original
DOCKER-USER hook inventory. Rehearsal and installed Docker acceptance must
prove the combined hook order before any enrollment GO.

## Predecessor authority and production holds

The accepted Variant A source is b0; bridge source is `bebeb413…`. The normal
b0→bridge handoff does not independently pin changed privileged bridge bytes
before target code runs. The ordinary bridge→successor handoff rejects this
controller's changed renderer, launcher, runtime entrypoint and unit bytes.
Standalone source validators and negative fixtures are documented in
[A-to-bridge authority audit](a-to-bridge-authority-audit.md) and
[bridge-to-successor authority](bridge-external-successor-authority.md).
Neither verifier is installed or accepted on the server. Each transition needs
its own independently reviewed predecessor-side installer, exact-byte permit,
signer/root provenance, immutable plan and a direct GO to the production
dispatcher. Old GO text, merged source or green CI cannot substitute for that.

The app PR #247 is a source dependency, not a production release. Its newest
revision and independent security acceptance must be confirmed before the
controller branch is rebased and the combined Linux image/PG/browser gates run.
No native enrollment, timer, provider or public-root effect is authorized by
this source packet.

## Local verification scope

Focused source suites exercise optional marker and old Compose rendering,
signed profiles and separate roots, real-entrypoint proof schema, V3 forward
and rollback, canary evidence, idempotent/expired enrollment classification,
exact external firewall hooks and source-only predecessor negative proofs.
The Windows local Node/Python suites do not run Docker image builds, Linux
flock/systemd, PostgreSQL advisory-lock contention or a real Langame call.
Those are release gates for the combined exact source and must precede any
operational plan.

At this source checkpoint, the Windows Node suite passed 221 tests with two
platform skips; the Python suite passed 154 with four platform skips. Shell
syntax passed under Git Bash. These numbers are local source checks, not a
combined exact-main CI or an installed runtime receipt.
