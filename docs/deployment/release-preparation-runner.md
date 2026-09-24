# Durable release preparation runner

`preparation-runner.mjs` implements Variant A up to an immutable native plan. It
does not authorize or apply a release. Native `apply` and `resume` remain the
only owners of HYDRATE, BIND, SMOKE, CUTOVER and POSTCHECK. Existing worker
authority remains the owner of grant/timer continuation under the exact policy
bound into the plan; preparation never performs those effects.

The serving controller accepted on 24.09 uses the earlier V1 worker policy.
The V2 repair described here is a source candidate until a new exact-main
admission, separately approved controller handoff and installed-path checks.
The runner has no timer, unit, automatic GO or approval signer.

## Sequence and ownership

One preparation operation uses a root-private state directory and the following
fixed order:

1. Wait for `download-admitted-bundle.mjs` to publish an exact successful
   main/push Full artifact and `LEETPLUS_RELEASE_DOWNLOAD_V1` receipt. Stream
   hashes bind `release.json`, `docker-admission.json`, `images.tar.gz`,
   `control.tar.gz`, `transport-validation.json`, `archive-roundtrip.json` and
   `network-validation.json`. Admission, image identities and all three
   validation results are rechecked locally. The receipt must also match the
   frozen downloader-input digest, run ID/attempt, expected artifact ID, remote
   evidence digest and download intent digest.
2. Use the currently serving controller's attested `install-control.py
   --stage-only` to publish the admitted candidate control without changing the
   serving pointer or systemd, then attest every installed candidate byte.
3. Load the admitted images. A lost response is accepted only if read-only
   image inspection finds every exact image ID; otherwise the operation stops
   as uncertain without repeating `docker load`.
4. Recheck the serving controller, full active-state digest, generation,
   active release, machine identity and native worker singleton locks, then ask
   the installed controller for one fresh encrypted application backup.
5. Wait for the Windows/off-host owner to authenticate the encrypted bytes,
   decrypt and inspect the exact capsule, and return the dump, globals,
   source-capsule and an enriched restore manifest to the fixed Linux evidence
   root. The runner neither transfers nor invents these bytes. The restore
   manifest must contain `sourceReleaseSha`; omission is a hard failure.
6. Attest `/usr/local/lib/leetplus-compose/<release-sha>` against its immutable
   install manifest, every installed file, the exact downloaded admission and
   admitted control archive. At the fixed `/srv/leetplus-migration/rehearsal`
   root, call the existing
   `prepare-files.py` with the source capsule extracted from that fresh backup,
   then call `restore-rehearsal.py` with the dump/globals/manifest bound to the
   same authenticated backup.
7. Wait for the existing reviewed bounded restored-clone browser-window
   controller to publish
   `LEETPLUS_REHEARSAL_BROWSER_API_ACCEPTANCE_V1`. It binds the exact restore
   receipt plus the paths and independently verified digests of the clone-window
   start receipt, browser result, API result and cleanup receipt. It makes no
   production/public-serving claim and leaves zero clone processes.
8. Run API and contour acceptance. An `API_6G_V1` release invokes
   `run-resource-rehearsal.py` exactly once; that controller owns the API run,
   bounded resource window and cooldown. The runner validates the resulting
   resource/cooldown receipt and never follows it with a second acceptance
   run. A release without a resource profile invokes `accept-rehearsal.py`.
9. Recheck host/controller/generation/active release, current grant/profile/
   timer bindings and worker-idle state,
   call native `prepare` once, and discover the resulting random operation UUID.
   Before reporting ready, publish the exact immutable `backup.json` and
   `rehearsal.json` bytes into that native operation directory. Their digests
   are already part of the native request and plan.

Receipt-wait polling is fixed by the frozen input to 5–10 seconds and an exact
deadline. Each receipt separates `producerCompletedAt` from `detectedAt` and
labels `producerCompletionTimeBasis`. Native producer timestamps are retained;
older receipts without timestamps use an explicitly labelled publication-mtime
proxy. A pre-existing image cache has unknown completion time, not an invented
current completion timestamp. Deadline expiry returns an explicit
blocked error; it never becomes PASS and does not extend an approval or
freshness window. The authenticated backup's original `effectiveExpiresAt` is a
separate hard boundary; a later polling deadline cannot extend it.
The operation start is immutable and the deadline may be at most four hours
later. Before every new unattempted effect, the runner checks the earlier of
that deadline and the authenticated backup expiry. After expiry it permits only
read-only reconciliation.

## Durable state and crash behavior

Every phase publishes a pre-effect intent, then an immutable receipt containing
the frozen input digest, intent digest and previous-receipt digest. Publication
uses a same-directory fsynced temporary file plus atomic no-replace link and a
directory fsync. On startup, the complete receipt chain and phase order are
validated before any work. Large archives, dumps and capsules are SHA-256
hashed in 1 MiB blocks rather than read into Node memory.

Each child invocation records separate immutable `.stdout`, `.stderr` and
`.exit.json` files. A nonzero exit, signal or executor failure remains a
failure even when stdout resembles a successful result.

A global kernel `flock` on
`/var/lib/leetplus-compose/preparation-runner.lock` excludes clients even when
they use different operation directories. The CLI re-execs itself through a
fixed `flock --no-fork` bootstrap and verifies the exact process, device and
inode in `/proc/locks`. This lock is separate from the native
`/var/lib/leetplus-compose/control.lock`; the runner never holds the native
exclusive lock while starting a native controller subprocess.

After a lost response, the runner examines the controller's real receipt or
observable exact state. Effects with a complete receipt reconcile. Effects
whose existing controller has no complete resume/reconcile evidence stop with
an explicit uncertain/blocked error and are not replayed. This includes a
partially completed preparation, backup, restore or acceptance.

For a lost native-prepare response, every immutable native plan is compared to
the complete canonical request, not a subset. The match also requires the
random operation ID/directory, exact host, installed controller digest, full
previous active-state digest, generation and rollout action. Zero matches is
blocked; multiple matches is ambiguous and blocked. The runner never calls
native `prepare` again after an uncertain attempt.

## Input contract

Run as Linux root on the controller host:

```text
/usr/bin/node /usr/local/lib/leetplus-compose/<candidate-sha>/preparation-runner.mjs \
  /root/release-preparation-input.json \
  /var/lib/leetplus-compose/preparations/<release-sha>
```

The input contract is `LEETPLUS_RELEASE_PREPARATION_V1`. It contains canonical
absolute paths for:

- the seven downloaded files and `downloadReceipt` listed above;
- `offhostReceipt`, `backupVerificationReceipt`, `restoreImportReceipt` and
  `browserReceipt` (these paths may be absent initially and are polled).

The input also binds `downloadInputSha256` and the expected `downloadArtifactId`.

Controller executables are not configurable input. The serving command is the
fixed `/usr/local/sbin/leetplus-compose`; candidate helpers are the attested
fixed directory `/usr/local/lib/leetplus-compose/<release-sha>`.

It also contains `targetSlot`, `wait.pollIntervalMs`, `wait.deadline`, and a
`nativeRequest`. The request must include exact `blue` and `green` release
objects plus these two signed-plan payloads:

- `preparationGuard`: contract `LEETPLUS_PREPARATION_GUARD_V1`, machine-ID
  digest, installed controller-manifest digest, full active-state digest,
  generation and active slot;
- `workerContinuation`: contract `LEETPLUS_WORKER_CONTINUATION_V2`, owner
  `NATIVE_WORKER_CONTROLLER`, exact original states of the two timers, both
  signed original TIMER grant envelopes and both profile digests. It freezes
  unsigned forward grant bodies for the target release/generation N+1 and
  rollback grant bodies for the previous release/generation N+2. Four new grant
  IDs are allocated in the immutable input before preparation; a restart cannot
  generate different IDs. Mode, host, tenant, secret profile, issuedAt and
  expiry remain identical to the original grant. V1 is rejected for a new
  application preparation.

The exact timers are `leetplus-compose-bonus.timer` and
`leetplus-compose-daily.timer`. Each preflight validates the signed envelope
through the canonical worker authority against current active state, host,
public key and current profile bytes, then checks timer active/substate and
unit-file state. Renewal may only change the release/generation binding while
preserving the original tenant, profile and expiry.
Native prepare also stores the two exact worker profile files as immutable
root-private `0400` operation evidence bound to the plan's profile digests.
The observer reads those snapshots for historical APPLIED/ROLLED_BACK records;
later legitimate profile rotation must not rewrite past evidence.

After a separate exact-plan GO, the existing offline root signs only those
four plan-bound grant bodies with `sign-worker`. The operator stages the signed
envelopes as root-owned immutable `0400` files named
`worker-forward-<worker>.json` and `worker-rollback-<worker>.json` inside the
native operation directory. Native preflight verifies every signature and
exact body before the first application effect. The exclusive native control
lock excludes worker runs during CUTOVER/POSTCHECK. CUTOVER stops only the two
original timers, switches the application and binds forward grants; POSTCHECK
restores the original timer states and publishes a plan-bound continuation
receipt. Worker runs remain fenced until terminal native history and this
receipt agree. An accepted N+2 rollback uses only the frozen rollback grants.
Ambiguous partial effects stop for reconciliation; no old grant is silently
reused after generation changes.

The off-host chain is accepted only when all three receipts bind the fresh
encrypted SHA/size/capture timestamp and plaintext SHA. The authenticated
verification must bind the guarded host identity, serving-controller digest,
full active-state digest, active application and generation, and it must remain
inside its unchanged `effectiveExpiresAt`. The restore
import must bind the manifest, dump, globals and source capsule by path, size
and digest. These restore inputs are intentionally unavailable during initial
download/stage and cannot be supplied from an older operation.
The import paths are fixed below `/srv/leetplus-migration/rehearsal/input`; its
receipt binds the normalized verification bytes and the derivation identity of
the original verification, full plaintext capsule and canonical preparation
input. The enriched manifest source release must equal the authenticated active
application.

The runner rejects approval, expiry and TTL-extension fields. It does not
accept a command template, arbitrary executable, URL, shell fragment or
provider credential in its input.

## Output boundary

After one final revalidation of every underlying admitted/evidence byte,
candidate control, staged image identity, readiness deadline, authenticated
backup expiry, host/generation and worker-idle guard, success atomically
publishes `go-packet.json` and returns exactly the observer-facing packet contract
`LEETPLUS_RELEASE_PREPARATION_V1_GO_PACKET` with:

- `decision: PREPARED_NOT_AUTHORIZATION`;
- `inputSha256`;
- `nativePlanSha256` and `nativeOperationId`;
- the plan-bound `workerContinuation` object;
- `preparationEvidenceExpiresAt`, also bound into the native plan;
- `preparedAt` from the durable native-prepare phase receipt.

This packet proves only that preparation produced one exact native plan and
placed its immutable backup/rehearsal evidence. It is not a signature, GO,
fresh approval, deployment, worker continuation result or production
acceptance. A later GO must bind the unchanged plan. Approval TTL is never
extended by this workflow.
The runner requires a serving controller that advertises native preparation
expiry enforcement. Approval expiry cannot exceed the evidence expiry, and
native preflight plus every five-phase transition rechecks that bound.

## Tests and current limitation

The disposable test harness covers an advancing-clock restart, existing
complete native plan, lost responses at image load/preparation/backup/restore/
acceptance/native prepare, invalid manifests and receipt order, expired waits,
generation drift, a busy native worker, concurrent clients and command-output
separation. It also asserts that the 6 GiB resource controller is invoked once.

The test controllers and evidence are local fixtures. They do not prove an
installed Linux controller, GitHub connectivity, Windows ACL/authentication,
multi-gigabyte production transfer, a real restored-clone browser run, or
production readiness.
Activation still requires an installed-path rehearsal with the real downloader
and external receipt adapters, followed by independent review. No production
operation was run for this implementation.
