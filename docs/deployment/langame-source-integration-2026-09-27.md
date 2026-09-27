# Langame source integration proposal, 27 September 2026

Status: **reviewable source merge proposal; main merges not authorized by this
packet; production HOLD**. The user's forwarded agreement concerned the earlier
A operation. The dispatcher delegated preparation here, not a new merge or
production effect. This document contains concrete source gates for an operator
with separately established source-merge authorization.

## Frozen source candidates

GitHub read on this checkpoint found current main
`5b22ff2ffd655760b1c98e2f42052b2bccb61039` and these open, mergeable draft PRs:

| Order | PR | Exact head | Current base | Reported PR checks |
| --- | --- | --- | --- | --- |
| 1 | [#246](https://github.com/boozik3412/leetplus/pull/246) | `948dde610555d7954b74376d8c2e4a3ca0064cc2` | `main` | 7 SUCCESS |
| 2 | [#247](https://github.com/boozik3412/leetplus/pull/247) | `22f9d9a80d797a0f69ae89efe9a26f0d04ea508d` | `codex/langame-permission-continuation` | 10 SUCCESS |
| 3 | [#248](https://github.com/boozik3412/leetplus/pull/248) | `da7d8e002bd89f62440046824f464000e384b1b6` | `codex/langame-external-worker` | 8 SUCCESS |

App247 source Full run
[36327181810](https://github.com/boozik3412/leetplus/actions/runs/36327181810)
and controller248 source Full run
[36327257439](https://github.com/boozik3412/leetplus/actions/runs/36327257439)
completed SUCCESS. The focused actual PostgreSQL run
[36326832362](https://github.com/boozik3412/leetplus/actions/runs/36326832362)
passed 5/5. Dispatcher reported independent app22 security P0=0/P1=0;
independent controller app22-to-da7 review found no new P0/P1. These are dated
source checkpoints; re-read live PR heads, gates, review and main before action.

## Ordered source operation

1. Freeze a short source release-train window. Reproduce all three exact heads
   and the current main. If main changed, compare its complete intervening diff;
   unknown or mixed changes require a new integration decision. If a PR head
   changed, invalidate that PR's review and source test reuse until the changed
   diff has a fresh decision. Record the old/new heads and reviewed scope.
2. Once source-merge authority exists, clear draft and merge #246 with
   `--match-head-commit 948dde610555d7954b74376d8c2e4a3ca0064cc2`. Capture the
   server-returned merge SHA and verify both parents/tree. Do not invent that
   SHA from the feature head, title, CI run or local simulated merge.
3. Retarget #247 to `main` after #246 merges. Re-read head, changed file list,
   merge base and mergeability. Require the resulting diff to contain only the
   accepted external app scope; dependent partial-sync changes must be in its
   base. Let required PR checks recompute for the new base. Any resolution or
   head update needs fresh relevant review and gates. Then merge with exact
   match-head `22f9d9a8...` (or its explicitly re-reviewed replacement).
4. Retarget #248 to `main` after #247 merges. Verify the resulting diff is only
   the accepted controller scope and that apps/api and runtime-entry remain the
   accepted app dependency. Recompute required checks, record reviewer scope,
   and merge with exact match-head `da7d8e00...` (or re-reviewed replacement).
5. For every returned main merge SHA, collect its exact main-push Fast and Full
   results. A missing, failed, manual, branch or canceled job does not become
   PASS. Stop integration on a concrete failure; record stdout/stderr/exit,
   diagnose the failing scope and changed condition before rerun. Do not deploy
   intermediate merges. Source Full on feature22/da7 remains historical.

Commands above describe a proposal. This task does not execute `pr ready`,
retarget or merge without the corresponding source-merge authorization.

## Final exact-main artifact packet

For the final **actual merge commit**, preserve the producing run ID and
attempt, event `push`, ref `refs/heads/main`, repository and exact workflow
ref/SHA. Verify checked HEAD equals release SHA and event `before` equals the
trusted impact base/ancestor. Require the release-candidate receipt decision
`EXACT_MAIN_PUSH_DEPLOYABLE_CANDIDATE`, effective L2 lane and digest bindings.

Download producing-attempt artifacts through the existing admitted-bundle
workflow. Independently verify SHA256SUMS, release/admission/control provenance,
API/Web image identities, required optional capability proof, control archive,
installed-manifest projection, complete flat file map and critical-leaf map.
Record exact paths, sizes and SHA-256 for every artifact; leave unknown values
explicitly absent until measured. Require the independent artifact verification
receipt to reproduce that same commit/tree, lane, workflow and payload.

The final operational packet must bind these exact measurements, reviewed
standalone adapter admission/enrollment, fresh host baseline, backup/off-host
authenticated restore and rollback receipts. Source integration never supplies
serving-controller acceptance, tenant LIVE authority, provider egress, CANARY,
TIMER, or a production GO. New standalone bootstrap source is a separate
follow-up, outside the frozen #248 payload and source review.

## Changed-head decision record

Record, per affected PR: old accepted head, new head, old/new base, full changed
diff digest, exact reviewer result, named test commands/environment/fixtures,
run/attempt/check identities, and final actual merge SHA. Reuse a passed check
only if its checked scope, code, dependencies, fixture and environment remain
the same. A docs-only follow-up is not authority to silently substitute a new
controller archive or changed standalone adapter byte.
