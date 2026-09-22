# Variant A: activation and comparative pilot

This change automates the existing release order. Source implementation, local
checks, GitHub enablement, controller installation and production acceptance
are separate outcomes. Neither a PR nor a successful fixture authorizes a
production operation. L1 gates, exact-main admission, legacy dependencies,
independent data identity and the hot rollback slot remain required.

## Baseline and ownership

Development starts at remote main `4136da468183c20e504ac8fdcf88edd9547f0ca5`.
Read-only inventory on 2026-09-22 at 11:05:32 UTC observed active blue
`3c3dc4ac4d1a73fdf9a1a6da5427212adfa9af80`, generation 9; green
`7eadfd3e4468182730dbded4798fe5f0df8c9236`; serving controller
`02acca249783cf47c0a24897203d51a206e1c5b2`; data release
`399876b560b4ac611eae35ee425d99422fb140b9`. Six containers were running;
the four named daily, bonus, network-refresh and backup timers were enabled.
The active record stayed byte-identical during the read. This is inventory,
not a new browser/API or natural login acceptance. Re-read before activation.
Local audit evidence is `deploy-evidence/release-preparation-a-20260922` in
the outer operations workspace.

One designated release operator owns production effects. Preparation can invoke
only the existing controllers within an independently approved preparation
scope. Native `apply`/`resume` alone own HYDRATE, BIND, SMOKE, CUTOVER and
POSTCHECK. Worker continuation uses the existing worker authority under its
exact signed plan policy. Concurrent ticket recovery, data repair or release
operations must finish or yield ownership before this release starts.

## Enable the PR checks

1. Review the PR and require both new critical jobs to pass on its exact SHA.
   Check names are documented in [critical CI checks](release-critical-checks.md).
   Preserve the existing three required checks and their GitHub app bindings.
2. GET the complete main branch protection, effective rulesets and all check-run
   pages for the verified SHA. Save the responses and UTC collection time.
3. Supply `{protection, checkRuns, headSha, additions}` to
   `node scripts/ci/propose-required-checks.mjs input.json proposal.json`.
   The tool rejects a skipped, absent, failed, stale-head or non-Actions check.
   It emits a reviewable PATCH for only `required_status_checks`, retaining
   `strict` and every existing app binding. It performs no network operation.
   An unbound GET `app_id:null` becomes PATCH `app_id:-1`, preserving any-app
   semantics without GitHub automatically selecting a recent app, per the
   [GitHub status-check API](https://docs.github.com/en/rest/branches/branch-protection#update-status-check-protection).
4. Immediately before applying the reviewed proposal, re-fetch and compare
   its complete baseline digest. Any drift requires a fresh proposal. Apply
   only the emitted body to the emitted subresource; do not PUT a reconstructed
   whole protection object. Re-read protection and rulesets and prove all
   unrelated settings stayed identical. No implementation test applies this
   production repository setting automatically.
5. Merge through the protected PR. Exact-main Full runs again and must admit
   the resulting merge SHA. PR success cannot substitute for this receipt.

## Activate preparation and perform a release

Two local adapters remove the historical acquisition/restore-manifest repair
steps. `download-admitted-bundle.mjs` takes a JSON input with contract
`LEETPLUS_RELEASE_DOWNLOAD_V1`, `releaseSha`, independently verified
`admissionSha256`, `runId`, `runAttempt` and `artifactId`, plus a new private
acquisition directory. It checks the exact successful main/push Full attempt
and artifact identity through GitHub, then downloads into its `bundle/`
subdirectory and verifies seven admission-bound files with streaming hashes.
The immutable `download-receipt.json` binds the original intent and remote
metadata. Restart with the same input and directory: complete bytes are
reconciled; partial or unproven transfer stays blocked without a second transfer.
The once-only transfer guarantee is per frozen acquisition directory; creating
another directory deliberately starts another acquisition and is not a resume.

`derive-rehearsal-inputs.py --verification <native-verification.json>
--capsule <authenticated-capsule.tar> --preparation-input <input.json>
--output <verified-private-directory/derived>` consumes the existing off-host
decrypt/verifier result. It does not decrypt, download, restore a database or
perform retention. It rechecks the authenticated capsule, source native
plan/final, active generation, controller, profiles and worker envelopes,
then derives `sourceReleaseSha` from the actual source slot. Its output contains
dump/globals, enriched restore manifest, minimal config capsule, normalized
backup verification and `restore-import.json`. The import receipt names exact
leaves under `/srv/leetplus-migration/rehearsal/input`; the existing controlled
transfer copies these bytes and receipts there. The Linux runner independently
hashes them before restore. Never upload the private capsule or raw profiles
to GitHub or ordinary task evidence.

1. Read the complete operation `ERROR_LOG.md`, check concurrent operations, and
   capture source, serving controller, active/rollback/data identities,
   generation, original timers and worker profile/grant digests independently.
2. Build a concrete controller installation or handoff plan from the exact
   admitted artifact. Review immutable old/new control manifests, unchanged
   runtime/data/network/timer identities and the existing rollback procedure.
   Obtain the specific production GO before controller installation. Keep
   the serving controller until its canonical handoff succeeds.
   The accepted controller must advertise `preparationEvidenceExpiryEnforced`:
   native plan validation, approval validation and the offline signer all bind
   `preparationEvidenceExpiresAt`. A later signature cannot extend the original
   credential/evidence window. The old controller is not a compatible executor
   for an A plan merely because it ignores extra JSON fields.
3. Agree the ready window before collecting short-lived evidence. Prepare the
   exact input for [the runner](release-preparation-runner.md), including
   admitted digests, restore and off-host paths, original worker policy and
   bounded deadlines. Preparation effects such as backup and disposable
   restored-copy resources require their concrete operational scope; this
   implementation request alone is not authorization to start them.
4. Run preparation and retain its durable records. On a lost response inspect
   receipts, never issue an unchanged effect again. Ambiguous non-resumable
   controller work remains blocked for reconciliation. Do not replace a
   controller receipt with an operator-written PASS.
5. Review the immutable `PREPARED_NOT_AUTHORIZATION` GO packet. Its exact native
   plan digest includes worker continuation. Obtain that exact GO and sign
   within the existing validity window. Neither copying a packet nor elapsed
   time grants authority. A new plan digest needs its own GO; unchanged status
   text on the same authorized scope does not require another question.
6. Execute the native apply/resume sequence under its existing locks and
   authorization. Do not build a second production phase executor. Restore
   the original schedules through their existing exact worker-grant process
   and verify ordinary execution in the same operation.
7. Collect independent public browser, authenticated API, auth/network
   negatives, active/rollback/data continuity and ordinary worker evidence.
   Only then mark the release VERIFIED and production-accepted.

## Observation and measurement

`release-observer.mjs` accepts a native operation directory, immutable GO
packet, trusted approval public key and bounded deadline in milliseconds.
Filesystem observation runs on Linux against the canonical native operation
directory. Receipts and packet must be root-owned immutable `0400` files with
trusted ancestors; copied user-writable histories are not accepted as native
completion evidence. The key must also be root-owned and non-writable by others.
It observes every five seconds, validates the native plan, approval signature
and receipt chain, and records PREPARED, GO, APPLIED or ROLLED_BACK with the
reason for waiting. It never executes a production phase. A terminal native
receipt remains APPLIED pending independent browser/API/worker acceptance.

Record actual controller completion timestamps where provided and detection
timestamps separately. Old native receipts have no completion timestamp;
the observer labels their filesystem mtime as a publication proxy instead of
inventing a precise execution time. A deadline is an observation timeout, not
evidence that the underlying command failed. Expired unfinished authorization
fails closed; a validly signed terminal history remains inspectable.

For ten comparable releases retain request, code-ready, PR-ready, merged,
admitted, prepared, GO, applied and independently verified timestamps, lane,
and wait reasons (runner queue, admission, user window, backup, off-host,
restore, acceptance, resource cooldown, busy worker, diagnosis or repair).
Compare p50/p95 lead time with the 2026-09-21 audit, separating machine work
from waiting and repair. Count accepted effects repeated after interruption
(required zero) and critical errors first discovered after merge. Record
unsuccessful releases too. The 45–60 minute target is unproven until this pilot;
ten observations do not establish a durable SLA.
