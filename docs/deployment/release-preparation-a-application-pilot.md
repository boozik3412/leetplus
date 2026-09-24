# Variant A application release pilot

Status 24.09.2026: the serving controller `88010292246249c94ba66ecbab64e4d51ad84d8c`
has passed its separately approved controller-only handoff. The active application
remains GREEN `f97af35d…`/generation 10. No application release has yet measured
the proposed 45–60 minute end-to-end target. This protocol is a measurement and
preparation plan, not a release plan, production GO or permission to repeat the
completed controller handoff.

A source audit found that the installed controller's intent-only native resume
can repeat an ambiguous phase, and that the plan-bound worker continuation has
no native executor. Admit and activate reviewed repairs before using Variant A
for an application pilot; the existing controller handoff does not cover them.

## First controlled application release

The release owner selects one real, independently needed application change and
records its issue, exact main SHA, release-impact lane and owner before starting
production preparation. The first comparison should use an ordinary eligible
application release; a documentation-only change or controller-only handoff is
not an application pilot. A schema, security, provider, worker or control change
uses its full special path and is measured in its own lane. Do not change the
current admission, backup, restored-copy, browser/API, resource or worker gates
to make a candidate fit the target time.

1. Confirm the chosen main SHA has successful exact-main Fast and Full admission,
   including both release-critical checks, and bind the admitted Compose artifact,
   release manifest, image IDs and controller digest. Record the source and
   artifact IDs in a new operation's evidence journal.
2. Independently confirm serving controller, active/rollback/data releases,
   generation, grants, timer states and worker-idle status. Name one effect owner
   and check for other release/support writers. Agree the reviewer and intended
   window before obtaining short-lived proof.
3. Use the existing versioned downloader, off-host receipt adapter and preparation
   runner in a fresh root-private operation directory. Preserve each immutable
   intent, receipt and separate stdout/stderr/exit result. A lost response is
   reconciled against the real receipt/state; uncertainty stops the operation.
   The runner's terminal result must be `PREPARED_NOT_AUTHORIZATION` with an
   immutable native plan and original evidence expiry.
4. Review the exact native plan, rollback slot and worker continuation, then
   obtain a separate GO bound to its digest and validity window. Only native
   `apply`/`resume` may perform HYDRATE, BIND, SMOKE, CUTOVER and POSTCHECK.
   Run the read-only `release-observer.mjs` on the root-owned operation directory
   at its supported 5–10 second interval. Preserve its JSON lines as observation
   evidence; `APPLIED` still requires independent acceptance.
5. Verify the public browser and Web/API identity, authenticated corporate and
   guest contours with negative cross-contour requests, active/rollback/data
   continuity, original timers/grants and ordinary worker execution. Record a
   separately timestamped `VERIFIED` decision only after these checks pass.
   Stop on drift, expired evidence, busy worker or ambiguous effect; journal the
   changed condition before any allowed retry.

The release owner must prepare the exact candidate plan and ask for its own
production approval after the admitted SHA and fresh evidence exist. The GO for
the 24.09 controller handoff was consumed and cannot authorize this release.

## Evidence and measurement

Use [the pilot record template](release-preparation-a-pilot-record.template.json)
for each attempted release, including stopped and rolled-back attempts. Every
stage timestamp needs a UTC source and a basis: producer timestamp, immutable
receipt publication time, or observer detection time. Keep all three when
available. Do not substitute observer detection for producer completion or a
green CI run for production verification. The native observer emits `PREPARED`,
`GO`, `APPLIED` or `ROLLED_BACK` and explicit wait reasons; the acceptance owner
adds the independent `VERIFIED` evidence.

Set each stage's `basis` to `PRODUCER_TIMESTAMP`,
`IMMUTABLE_RECEIPT_PUBLICATION`, or `OBSERVER_DETECTION`, and copy its `at`
value into the matching `producerAt`, `publishedAt`, or `detectedAt` field.
Record wait intervals with exact `reason`, `startedAt`, `endedAt`, and `evidence`:
`ADMISSION`, `REVIEWER_OR_USER_WINDOW`, `BACKUP_OR_OFFHOST`, `RESTORE`,
`BROWSER_OR_API`, `RESOURCE_OR_COOLDOWN`, `BUSY_WORKER`,
`DIAGNOSIS_OR_REPAIR`, or `OTHER`. Intervals may overlap and must not be summed
as if they were serial. The offline validator/report reads only local records:

```text
node scripts/ci/release-a-pilot-ledger.mjs <record.json> [record.json ...]
```

It rejects false `VERIFIED` records without a native receipt, exact approval,
worker-continuation evidence and a separate independent acceptance reference.
It computes the three lead-time views and reports per-lane p50/p95 only after
ten verified records. It validates record structure and arithmetic; it does not
authenticate the referenced production receipts or grant release authority.

The primary comparison is `merged → verified` for a real application release.
Also report `request → verified`, `admitted → verified`, and intervals between
every adjacent stage. Attribute waits to admission, reviewer/user window,
backup/off-host, restore, browser/API, resource/cooldown, busy worker and
diagnosis/repair using the operation journal; show overlapping work rather than
adding overlapping durations. Compare with the two historical application
releases in the operations-workspace `deploy-evidence/release-speed-audit-20260921/REPORT.md`, retaining their
different evidence quality. The first release gives one observed value, not a
measured p95 or a promise of 45–60 minutes.

Continue for ten comparable application releases, grouped by lane. Report p50
and p95 only with the sample count and observed range, and include failures and
rollbacks separately. Variant A's safety criteria are zero replayed accepted
effects, zero new classes of critical errors discovered only after merge, and
verified restoration of the original worker schedule/grants in the same release.
The 45–60 minute target and initial p95 ≤90 minutes are evaluation targets,
not acceptance evidence or a relaxed production gate.
