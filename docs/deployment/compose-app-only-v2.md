# Compose app-only release, B contract

Status: **source merged, production activation HOLD**. B merged as
`df4d00261987ade9ca8e0d90529cdd3867718b67`; exact-main Fast
`36037819135` and Full `36037819225` passed. `LEETPLUS_COMPOSE_APP_BUNDLE_V2` and
`LEETPLUS_COMPOSE_APP_ADMISSION_V2` are separate from the accepted V1
four-image handoff. Their presence in Git or CI does not enable a production
rollout. The current V1 path remains the fallback for all releases that do not
prove this contract.

The integrated source now contains V2 `prepare-app-only`, installed data
certification, versioned runner checkpoints/GO packet, V2 plan validation and
read-only observation. The controller reuses A's signed V1 approval and
HYDRATE→POSTCHECK/worker continuation machinery. The B-capable controller is
**not accepted as installed**. The predecessor bridge source merged as
`bebeb41354da0dd04b218495cbbf5d75ba9f0a85` and passed exact-main Full,
but A→bridge and bridge→B each require a separate installed-path check,
signed exact plan and GO. The bridge issues B's signed exact-target permit
from its own serving root; B validates the predecessor's accepted receipt.
The app-only decision and V2 handoff were correctly skipped for the B merge's
controller/security source change. A future eligible display-only main push
must produce its own exact-main V2 admission.

The artifact slice includes a disposable Docker test that starts both API slots
against a migrated CURRENT191 fixture and checks readiness, release identity,
public guest and negative corporate/worker boundaries. The PR Docker shadow
passed on the merged source head; repeat it after every source change.
Native/restored-copy readiness against the
actual certified data baseline, installed-controller certification and V2
plan/apply integration are required before any B release.

## Identity and lane

`L1_APP_ONLY` is an additional decision over the trusted V1 impact and
release-candidate receipts. The source impact must be exactly one unmixed
`L1_RUNTIME` lane, with a trusted main-push base/head, and every changed file
must be a modification of one exact display-component path in
`.github/scripts/classify-app-only.mjs`. Each candidate must retain its client
directive and the same parsed TSX structure as the accepted base; only JSX
text and inert `aria-label`, `title`, or `alt` string attributes may
change. Imports, comments, executable expressions, server actions and provider
calls therefore fail the B decision and use V1. The B receipt binds both parent receipt
digests and the allowlist digest. New files, removals, renames, docs mixed with
runtime, changed dependencies, and all other paths go through the full
`L2_SCHEMA_SECURITY` route. Diff size conveys no authority.
The optional B jobs cannot invalidate a successful full V1 admission when B
classification, image construction or admission fails; no B admitted artifact
is published from a failed B job.

The app bundle contains only exact API and Web image IDs and an archive of those
images. The manifest binds the source-impact receipt, build time, CURRENT191
schema requirements, Compose contract digest, controller capability and runtime
validation receipts. CI admission requires exact main push/run/workflow identity,
the candidate and impact receipts, authority-root trust, application and
PostgreSQL assortment checks, migration smoke and real image-runtime evidence.
Only real Docker image IDs are admitted. It does not claim a live data baseline.
The app-only archive cannot include PostgreSQL or Redis images.

## Installed data certification

An installed B-capable controller must produce an immutable
`LEETPLUS_COMPOSE_DATA_BASELINE_CERTIFICATION_V1` from its read-only current
state and database probes. It binds the admitted app SHA, host, installed
controller, full active-state digest, generation/slot, existing `dataRelease`
and `dataAdmissionSha256`, PostgreSQL system identity, schema head/count and
unchanged schema/migration inputs, ACL/data configuration, readiness receipt and
an expiry inside the existing four-hour preparation evidence window. CI or an
operator-supplied JSON file cannot certify live data. Any mismatch or expiry
blocks L1; the release is replanned through L2 rather than downgraded in place.

The native `LEETPLUS_COMPOSE_BLUE_GREEN_V2_PLAN` retains V1's signed approval,
backup/rehearsal receipts, secret/network/database bindings, exact Compose
digest, two slots and HYDRATE → BIND → SMOKE → CUTOVER → POSTCHECK sequence. It
adds app admission/archive and certified data baseline digests. The target slot
is formed from admitted API/Web IDs plus the already accepted PG/Redis IDs;
`dataRelease` and `dataAdmissionSha256` stay byte-exact. The active slot is
unchanged during BIND and remains the hot rollback target. The preparation
runner still stops at `PREPARED_NOT_AUTHORIZATION`. A separate, exact-plan GO
and native apply/resume are required, with worker continuation in the same
approved operation. V1 plans remain valid under their original contract.

The read-only installed certifier checks the V2 downloader receipt, root-owned
app bundle/admission bytes, installed controller leaf manifest and candidate
`control.tar.gz` leaf map. It reads the existing V1 data admission and active
state, observes exact live API/PG/Redis image IDs, PostgreSQL system identifier
and all 191 completed migration names/checksums, then compares the active API
source schema/migration bytes. Primary database role/ACL flags and active API
health must pass before it returns a certification *candidate*. The controller
must hold its kernel lock, revalidate the observations and publish the candidate
immutably. This helper does not publish or authorize a plan by itself.

## Checks and recovery policy

The B path must preserve current-schema compatibility, migration manifest,
guest/corporate/worker boundaries, TLS bad-CA/hostname rejection, network
negative probes, both-slot readiness, immutable archive roundtrip and safe
rollback. Historical migration smoke stays in the initial B critical path.
Removing it requires a later versioned certificate for every unchanged schema,
migration, ACL, controller, library and test input, plus full L2 on mismatch.
Fresh encrypted backup, off-host authentication, restored-copy browser/API
acceptance and resource/cooldown evidence also stay mandatory. Reusing a
recovery point requires a separately chosen age/RPO policy and repeated restore
proof; this contract does not choose one.

Before production activation: shadow V2 admission beside V1, exact-SHA CI,
installed-controller capability and dual validation, tampered/stale/mismatched
fixtures, lost-response/resume and busy-worker tests, then one controlled L1
pilot with hot rollback and final worker/postcheck receipts. The dispatcher is
the single production effect owner; A and B activations are serial.

The first B L1 pilot also requires `AppBundle.sourceImpact.baseSha` to equal
the active accepted application SHA. The current GREEN f97 active application
is older than this source branch. If that remains true after A's repairs, a
full V1 application release must first establish the intended base. B cannot
claim L1 authority by comparing only the last main push while older
unreleased changes remain in the candidate.

The exact activation and comparative-pilot sequence is in
[Variant B activation](compose-app-only-v2-activation.md). It names the
predecessor-side signed transition or bridge controller that remains to be
implemented after the A predecessor is accepted and its installed manifest can
be pinned.

## Measurement

The 21 September audit measured 13 successful runtime candidates: Full CI
median 19:08, Fast CI median 11:37, first-runner wait median 4 seconds, while
five native five-phase sequences took 44.8–47.4 seconds. These are dated
baselines, not current production acceptance. For each pilot release record
`request → code-ready → PR-ready → merged → admitted → prepared → GO → applied
→ verified`, with machine time, external waits, repair, rollback and the
trusted lane. Compare at least ten eligible L1 cases with A's measured cases;
report p50/p95 and exclusions separately. The 15–30 minute B target assumes a
ready window and timely GO and remains a hypothesis until comparative pilots.
