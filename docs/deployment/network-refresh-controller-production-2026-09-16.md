# Network-refresh controller production checkpoint — 16 September 2026

## Accepted controller, unchanged application

The native signed handoff was accepted at **08:15:02.621 UTC** (13:15 Yekaterinburg).
This is a controller-only update, not an application rollout or external-beta GO.

| Identity                   | Accepted value                                                     |
| -------------------------- | ------------------------------------------------------------------ |
| Serving controller         | `892b25b9fe5ebc8d0c20a7874a77ac312b7a0978`                         |
| Controller manifest SHA256 | `4f1c48734d827cd54fc50c6eb576a43c82de978cd538bf8505fa04bf84c33496` |
| Operation                  | `b3da9232-4dcf-4acd-8f94-d00141dedc53`                             |
| Plan SHA256                | `19ccab10b42a43cfdfee498409be17cfbd35de0e0886dc7d22a75b4b98fce457` |
| Accepted receipt SHA256    | `f99487e1142f69666fd00be72e3a828c0f1f9b7a7103104f18bcba91a95a989a` |
| Application                | blue `b5c03360941e1e5d59fe83f334b8dc29c2eced3b`, generation5       |
| Hot rollback application   | green `05cad9cd1611c014453603475e8e1ba4c953f839`                   |
| PG/Redis dataRelease       | `399876b560b4ac611eae35ee425d99422fb140b9`                         |

Exact-main Fast35068523966 passed 3/3 and Full35068524012 passed 9/9, including both
final handoffs. The single shared bundle and all 68 controller files were independently
verified against exact git bytes. Machine admission lane is `L1_RUNTIME` for the
last test-only delta; this must not be relabeled or used to skip the separately
required cumulative controller/app acceptance procedure.

After separate user GO, the existing DPAPI-protected Windows key signed only this
plan; no private key left Windows. Native apply used its bounded 120-second exclusive
window, switched the core pointer and reviewed refresh-service retry bytes, then
renewed the same provider sets. No app/data image was uploaded or loaded for this
controller update. No planned API/Web/PG restart, timer stop, worker kill, grant,
profile, resource-limit, schema or application-data mutation was performed.

## Measured checks

- Independent 08:16:12 UTC postcheck validated signed receipt/pointer/manifest, serving
  controller 892b, no pending/rollback record and exact equality of the complete
  approved app/data/config/grant/process/firewall snapshot. Timers remained enabled.
- Finite public sampling during the switch: **720 API/Web samples, 0 failures** over
  360 seconds, ending 08:20:11.618 UTC. All responses retained application b5 identity.
  This is measured sampling, not proof of every request or a natural guest login.
- Ordinary bonus worker started 08:15:44.596 and completed 08:17:54.263 UTC with PASS
  on original grant `b3850ae9-8348-4cb5-9d12-0b88b6459339`, appb5/generation5.
  Receipt `fc24a705-a20f-4c38-a75a-872ee1cda157` has SHA256
  `0bac13c17633e07fc1fff3204458c8ae4470d866715626e03675b08debf35450`.
- First ordinary refresh ran at 08:29:49–08:29:50 UTC, exit 0, no retries; observation
  `REFRESH_OK/HEALTHY` renewed TTL to 3599 seconds. It overlapped the ordinary bonus worker
  08:28:47.349–08:30:36.504, which also passed on the original grant. Worker receipt
  `8b92366a-579f-4d77-bbf3-bd38bd0ee8a2` SHA256 is
  `2cb445a69ef261a6e8fddacd5b09baaab5ddc03cde4ede426c909fe2192c8c4d`.
  The second ordinary refresh also passed at 08:44:49–08:44:50 UTC, exit 0 with
  no retries, invocation `c9eecea9c6ed4780a9be641212a10def`. It overlapped another
  successful ordinary worker, 08:42:31.223–08:44:53.427 UTC, receipt
  `b3b7ae8b-847f-4463-95b4-81d77d2756c8`, SHA256
  `7a48f693b8a65a053e8e76807ea3d2fed7f83bdaa660474958c4ffe0ef0af151`.
  Both cycles renewed TTL to 3599 seconds. No timer was manually triggered;
  the failed 08:14:49 record predates acceptance.
- Fresh encrypted post-handoff backup completed 08:22:22 UTC; captured
  08:19:47.207 UTC as `backup-20260916T081947Z.lpbackup`, 4,096,543,435 bytes, SHA256
  `8b99167f55db79b87af0f3b95ff0e554d13451a8159b50182bb9809bf376489c`.
  Off-host bytes passed 08:29:46.544 UTC; authenticated decrypt/controller authority
  and input checks passed 08:30:02.719 UTC. Plaintext SHA256:
  `e83b681412edc943335070764f8ac4e2ace98aaf853e9c2a35383c7b5d261706`.
  The archived plan/approval/receipt/pointer/new controller archive/admission/manifest
  and unchanged secret/grant hashes were verified. No previous backup was deleted.

Private rehearsal inputs are retained at
`C:\LeetPlusBackups\controller-handoff-892b-20260916-private`; dump 2,435,507,062 bytes
has SHA256 `baae15d9bacfe435f1d714982f90a8f00c3c15cbf9d6c31db58a5987b8c2f6b5`;
globals 2,745 bytes SHA256 `6f33d7fdade54bafed17bb1de64767d5f0fe7395578f7474ed9f1e80895f7935`.
This is authenticated input preparation, **not a newly executed database restore**.
The subsequent app owner must perform actual isolated restored-copy acceptance.

Final 08:46:50–08:46:55 UTC checks again validated the signed controller authority,
absence of pending state and complete unchanged approved snapshot. Public API/Web
and provider HEAD from both API slots returned 200. Network state was HEALTHY,
sets 6/2 with minimum TTL 3479 seconds. All six process identities remained as in
the approved post-OOM plan; blue API used 224.9 MiB of its unchanged 4 GiB limit.
The controller acceptance and backup gates are closed. The separately coordinated
application rollout may proceed under its own plan/authority; the checkpoint above
is time-specific and must be refreshed before its effects.

Evidence root: `deploy-evidence/network-refresh-control-20260915`, including the
append-only ERROR_LOG, exact plan/approval/native audit, accepted-postcheck,
apply-continuity, ordinary-cycle and post-handoff backup records. Read the complete
journal before any retry or production command; reconcile accepted effects rather
than repeating them.

## Separate incidents and limits

The old unsigned 62a88f6d plan was never applied. Docker Mounts order caused false
configuration drift; the successor sorts only that unordered collection and JSON
object keys, retains every field and order-sensitive array, and rejects malformed
or duplicate mount destinations. Historical signed JSON records were not rewritten.

At 07:04:53 UTC, **before this handoff**, api-blue hit its 4 GiB cgroup limit and Docker
automatically restarted it at 07:04:54. The new plan explicitly binds PID 494209 and
restartCount 1. The handoff did not cause this event or change memory limits; the
specific request responsible for that allocation remains unproven. Application
acceptance must observe resource behavior within the existing limits.

Windows operator time was independently found 18h47m behind. After explicit user
permission and administrator confirmation, native W32Time synchronization with the
existing `time.windows.com` configuration succeeded 07:19 UTC and was cross-checked
against server/TLS time before signing. Earlier local timestamps remain historical
and untrusted; no approval was backdated and no production clock was changed.

Public guest, corporate tenant and worker boundaries, approved provider policy,
public-address validation, TTL3600, atomic swaps and default-deny remain unchanged.
New executive/USER_CALL application code in source892b is **not deployed by this
controller handoff**. A separate app rollout requires the accepted controller
checkpoint, fresh backup/off-host proof, actual restored-copy acceptance and its
own authorized plan. Manual controller rollback after acceptance requires a
separate receipt-bound approval; no database rollback is implied.
