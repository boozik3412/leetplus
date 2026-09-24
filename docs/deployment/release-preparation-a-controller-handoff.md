# Variant A serving-controller handoff

Production checkpoint 24.09.2026: target `88010292246249c94ba66ecbab64e4d51ad84d8c`
is the **serving controller** after separately approved native operation
`63b58306-a711-4a0c-ba8c-07b3d9979e9c`; independent signed-authority,
process-continuity, public/API/Web, contour and ordinary worker/network checks
passed. The application remains GREEN f97/gen10 with BLUE3c3 rollback and
data399/CURRENT191. The historical source-only description below explains why
the narrow transition was needed; it is not the current production status.
[Exact production evidence and remaining speed pilot](release-preparation-a-production-2026-09-24.md).

Historical source checkpoint, 23.09.2026: this successor contract was not yet
an installed controller, a production approval, or an application release.

PR #226 merged the Variant A preparation code as exact main `6def91d4…`.
Read-only production inventory at 10:13 UTC still observed the serving
controller `02acca249783cf47c0a24897203d51a206e1c5b2`, manifest
`5ee7133885692b4c6e86ab680b4040770c985cee4c3381fb372302041232fcad`;
active GREEN `f97af35d…` generation 10, BLUE `3c3dc4ac…` rollback, data
`399876b5…`, no pending controller handoff. The active record was unchanged
during the read. This is an inventory, not public browser or worker acceptance.

## Why the ordinary handoff stops

`control_handoff.py` deliberately requires byte-identical `orchestrator.mjs`
for a controller-only switch. The installed old manifest and actual root-only
file both have SHA-256 `c6fd054d39175266ac0603759423f4fe039294c2a42b03f0b8bd12a8f280aa58`.
Variant A added an evidence-expiry guard to the native five-phase engine;
its reviewed orchestrator SHA-256 is
`c4d13a76d1f97f41dc575d37c5da588b9ba3634b1a053f6b194a86623e8861c4`.
The other six COMPATIBLE leaves match the installed generation exactly. A
generic controller-only plan would therefore fail before any handoff effect.

## Narrow successor contract

Only an ordinary `CONTROL_HANDOFF` from old release `02acca2497…` and old
manifest `5ee71338…` may carry
`LEETPLUS_VARIANT_A_ORCHESTRATOR_HANDOFF_V1`. It requires the exact old/new
orchestrator bytes above, old `control.mjs` `136d7c01…`, new `control.mjs`
`4e39b9e8…`, and new preparation runner `9b02c697…`. The signed nested
transition also repeats the full old/new release SHAs and old/new installed
manifest SHA-256 values. The target release and manifest are dynamic until
the follow-up source is merged and its exact-main artifact is admitted; they
are never guessed from this document.

Python planning/apply validates the installed manifests and archive bytes.
Independent JS authority and recovery validation, plus the offline signer,
reject any different nested field, source, effect scope, or resource-profile
bootstrap combination. The remaining runtime/worker contracts and units retain
the original byte-strict comparison. Historical signed plans remain valid;
new prepared plans enforce their original evidence expiry. No new production
phase executor is created.

## Activation boundary

1. Verify the follow-up merge SHA has successful exact-main Fast and Full
   admission. Authenticate its immutable Compose admission, control archive,
   release manifest and all staged control files. Independently compare the
   live old manifest/active generation with a fresh read-only snapshot.
2. Prepare an exact scope for stage-only installation and fresh authenticated
   backup/restored-copy evidence. These have their own production preparation
   boundary and must not be run merely to test source code. Stage-only never
   switches the serving pointer or application.
3. From those actual receipts, call the staged
   `control-handoff.sh plan --old-sha <02acca> --new-sha <admitted-main-sha>
   --admission-sha256 <digest> --evidence <root-owned-canonical.json>`.
   Review its immutable plan, old/new manifest hashes, full active/rollback/
   data snapshot, container IDs/PIDs, timer states, provider policy and
   `orchestratorTransition`. Its result is `PREPARED_NOT_AUTHORIZATION`.
4. Obtain a separate GO for that exact plan digest; sign with the existing
   offline Ed25519 root and run only the staged `control-handoff.sh apply`.
   The canonical controller owns the atomic pointer/retry-unit effects and
   receipt/recovery. No app, database, nginx, worker grant or timer transition
   belongs to this handoff. A manual accepted rollback needs its own signed
   receipt-bound approval.
5. Confirm serving pointer and manifest, unchanged GREEN/BLUE/data identities,
   healthy public API/Web, original timer/grant state, and an ordinary worker
   receipt. Only then can Variant A preparation use the controller capability
   `preparationEvidenceExpiryEnforced`.

Read the complete operation `ERROR_LOG.md` before every production command or
retry. Reconcile a completed step instead of repeating its effect. Source,
CI, staging, accepted handoff and verified runtime are distinct statuses.
