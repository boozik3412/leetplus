# Standalone initial transport V2: source and operator boundary

Status: **source candidate only**. These source files and disposable checks do
not authorize execution on a host. The production dispatcher owns a future
exact source/admission/baseline/plan and a separate direct GO.

## Order of authority

1. Verify final source SHA/tree, review, final main-push Full and Compose
   admission, standalone source artifact ID/run/attempt and complete bytes.
2. Freeze the full `TRANSPORT_V2` plan, code hashes, invocation, host/boot,
   existing b0 trust-root provenance, native lock and every absent/exact path.
   Sign off-host with the accepted deployment root. No key is copied to a host.
3. Authenticate the operator Node source **before its first instruction**.
   The independently trusted dispatcher takes the immutable reviewed Git blob,
   checks its raw SHA256 against its protected direct-GO record, and passes
   exactly those captured bytes as the `node -e` source. An unsigned target
   path, a target-provided hash or a subsequent self-hash is not this anchor.
4. The Node fence receives one bounded canonical packet on stdin, validates
   deployment-root signature and signed code/tool/input hashes, and compiles
   only the captured approved Python bytes. It uses the fixed loader below;
   it never hashes a path and later executes a re-opened path.
5. Python opens the existing native control lock without `O_CREAT`, matches
   signed device/inode/ctime/owner/mode, acquires exclusive ownership, rereads
   current b0 full 99-file manifest, pointer/active/handoff/pending and all
   parent/leaf preimages, then publishes the durable flat intent as its first
   write. Private staging is fsynced and atomically renamed with no replacement.
6. The resulting request has exactly seven immutable data leaves. It contains
   no INTRO plan or approval. A later separately signed INTRO receives those
   records in memory and publishes them only after its own durable intent.

## Exact invocation ABI

The operator Node source is
`deploy/leetplus-compose/standalone-intro-transport-entry.mjs`. The command
shape is fixed:

```text
/usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC
/usr/bin/node --input-type=module -e <exact captured Node source bytes>
  -- --operation-id <new transport UUID> <protected Node source SHA256>
```

The shell/SSH argv builder must quote each argument safely, retain exact command
bytes, and bound stdin/output. It may not interpolate untrusted code, use an
environment-selected executable, or permit another caller-supplied Node flag.
The command above is an ABI, not a completed operator GO/transcript. A future
dispatcher must first freeze its actual trusted SSH/known-host/tool bytes,
clock/baseline and code capture procedure as an independently reviewed plan.

Stdin is canonical UTF-8 JSON, two spaces and LF, with exact top-level keys:

```text
{ "packet": <signed transport packet>, "transportPythonSourceBase64": <captured code> }
```

The packet keys are exactly `plan`, `approvalEnvelope`, `files`,
`composeControlArchiveBase64`, `sourceArtifactMetadata`,
`composeArtifactMetadata`. `files` contains only:

```text
source.tar.gz
source-receipt.json
final-admission.json
docker-admission.json
intro-entry.mjs
intro-program.py
```

Each file value is canonical base64. The source archive contains the fixed 19
repo-relative source leaves plus root `SHA256SUMS`; the full source map is
validated before a write. The separate Compose control archive proves the
exact INTRO entry/program Git bytes. Neither artifact is executed by transport.
Metadata must match the signed artifact IDs, digests, main branch/SHA and
producing run/attempt. `SOURCE_BYTES_ONLY_NOT_AUTHORIZATION` is not Full authority.

The Python loader is a fixed reviewed stdlib string that establishes Linux
`PDEATHSIG(SIGKILL)`, removes source argv, decodes the same captured buffer and
calls `compile`/`exec`. Its exact SHA256 is
`a44a7637f5d4a89f7ab7084fc1a300c35727fe20b78e44ad4491fbba91191bff`.
The signed `execution.code.pythonLoaderSha256` must equal it. Python source is
at most 65,536 raw bytes, so its base64 argv fits the per-string kernel limit.
The signed packet is bounded to 48 MiB. The outer stdin wrapper, which also
contains captured Python source, is bounded to 48 MiB plus 128 KiB. Root source
archives are at most 16 MiB and regular source leaves at most 2 MiB.

The Node gate enforces one total 180-second deadline including input reads,
120-second native lock wait, crypto children and publication. Its Python child
runs in a separate process group, with parent-death fencing. Crypto children
also have parent-death fencing and a 15-second bound. The independent operator
must still preserve stdout/stderr/exit receipts and a process-group watchdog;
uncertain or interrupted output never authorizes replay.

## Versioned signed schemas

Only these new domains are accepted as complete first-write authority:

```text
LEETPLUS_STANDALONE_INTRO_TRANSPORT_V2_PLAN
LEETPLUS_STANDALONE_INTRO_TRANSPORT_V2_APPROVAL
LEETPLUS_STANDALONE_INTRO_TRANSPORT_V2_INTENT
LEETPLUS_STANDALONE_INTRO_TRANSPORT_V2_RECEIPT
```

V1 is historical source evidence and has no fallback into V2. The V2 plan's
mandatory closed `execution` object has exactly 13 keys and binds code, fixed invocation, host/boot,
accepted predecessor, native lock, fixed raw public root, parent/leaf preimages,
private/generated destination maps, byte/time budgets and the complete effect
map. Machine-readable exact schemas are extracted from the reviewed code for
each frozen head. No optional/wildcard execution object is supported.

Effects are only private source snapshot and audit publication. Every broader
effect is explicitly false: candidate execution, controller pointer, restart,
systemd unit, daemon reload, database/data, timer, worker grant, provider and
private-key transport. Current public guest, corporate and worker roles remain
separate and unchanged.

The terminal receipt binds raw plan/approval/intent, the pre-effect flat intent,
entire signed execution object, source+Compose producer metadata, protected
entry/program inode/size/mode and complete source/parent/predecessor postimages.
It is written to the request and then the audit root. An approval is checked
again against the exact `authorizedAt` sampled after the lock wait and the last
signature child, immediately before the first durable flat intent. INTRO has
the same timestamp fence. Any loss before both exact terminal publications is
classified by read-only reconciliation; original staging is never replayed.

## Failure and recovery

- Existing request, staging, audit operation or flat intent is not adopted.
- No-replace publication cannot overwrite a foreign or partial destination.
- Expired, wrong-domain, altered-code, wrong-root or wrong-preimage approval
  stops before intent.
- Lost response, torn write, staging residue or one missing terminal receipt
  stops all further phases. Do not call stage again to discover status.
- Read-only reconcile distinguishes a partial request, contradictory bytes, a
  complete request receipt with missing audit receipt, and two exact terminal
  receipts. It compares the original signed timely chain and every retained
  postimage. It performs no receipt repair, deletion or forward effect.
- The complete-request/missing-audit case may use a **separate** approved
  `TRANSPORT_FINALIZE_V1` operation with a new UUID and exact current code,
  host/boot, root, native lock, request/audit directory identities and original
  plan/approval/intent/request receipt digests. Its independent captured Node
  gate is `standalone-intro-transport-finalize-entry.mjs`. That gate requires
  pre-first-instruction dispatcher authentication, a new root signature and
  fixed `node -e -- --operation-id <new UUID> <gate SHA256>` invocation. It
  receives canonical `{ "packet": { "finalizePlan": ..., "finalizeApprovalEnvelope": ... },
  "transportPythonSourceBase64": ... }` on stdin.
- The finalize map permits exactly two no-replace writes: a durable root-private
  flat `FINALIZE_V1_INTENT`, keyed by the **original** transport UUID so no
  second recovery UUID can bypass an uncertain attempt, followed by the exact
  original request receipt bytes at the one missing original audit path.
  It creates no parent, request/source leaf, controller effect or replacement.
  Its fresh approval is checked against the new `authorizedAt` immediately
  before that first write and again before audit publication. Lost output or a
  crash after the new intent is classified with read-only `reconcile-finalize`,
  never by another finalize run.
- Any cleanup/quarantine/recovery is a new exact dispatcher operation with its
  own reviewed map, baseline and direct GO. The finalize operation also
  requires that separate direct GO. Historical UUID9afc is excluded.

## Verification and limits

The disposable Linux fixture remaps every host path into a new private temp
tree. It derives accepted b0's complete 99-file manifest from immutable Git
blobs, tests real kernel flock/inode checks and atomic no-replace publication,
and signs only ephemeral local fixture values. No shared host, provider,
production root, Docker, systemd or production key is used.

Green source CI and source review prove only this checked code/fixture scope.
They do not prove operator first-execution trust, final artifact admission,
installed receipt acceptance, a serving transition or production completion.
