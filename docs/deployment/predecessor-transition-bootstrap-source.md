# Independent predecessor transition bootstrap: source packet

Status: **source design and primitive implementation; production HOLD**. The
frozen external-controller PR248 stays at da7. This follow-up lives separately
under `deploy/transition-bootstrap`, outside `control.tar.gz`. It is not wired
into either generic controller handoff. No production installer, CLI, key
enrollment or complete live observer is provided by these source primitives.

## 29 September independent initial trust and V2 public-only installer

Fresh dispatcher read-only inventory found the fixed production-control
installer/verifier/generation/receipt paths absent. A broad production-control
install would publish operational files and reload systemd; it is outside an
inert bootstrap scope. The separate A-owned INITIAL_INERT_ONLY predecessor
route is therefore the proposed first trust step. It must install only an
immutable source generation and its minimal verifier, two dormant bootstrap
entrypoints, layout marker and exact lock/audit records under its own signed
plan, receipts and direct dispatcher GO. This is still source design, not
installed authority.

The new `install_predecessor_bootstrap.py` consumes that first step through a
fixed minimal verifier at
`/usr/local/libexec/leetplus/verify-installed-standalone-intro.mjs`.
Its `stage-request` action first receives a closed canonical seven-leaf request
as bounded captured stdin (plan, approval, archive and four public roots),
checks the deployment-root V2 signature and full admitted generation, then
publishes a flat intent before any request directory write. The root-private
request is staged with no-overwrite atomic rename and an exact external receipt.
`reconcile-request` classifies intent-only and partial publication, and can
publish only a missing receipt after verifying a complete exact postimage under
its own recovery scope. `prepare`/`apply` require this staged intent and receipt;
no operator-prewritten request is accepted as an independent authority.
The wrapper then verifies the
deployment-root-signed **V2** public-only plan/approval with existing host
Node and the bound host identity, then hashes the verifier bytes against the
signed `installerAuthority`. Verifier stdout must be one bounded canonical
JSON object binding exact source release, intro plan/receipt, immutable full
generation manifest/receipt and verifier hash. The wrapper independently
opens these protected receipts and full manifest by same-fd bounded reads,
rehashes its own installed entry and the complete 14-leaf source bundle plus
privileged helper, and compiles six import modules only after those checks.
`installerAuthority` is a closed six-SHA object in the V2 signed plan; V1
approval/receipt/enrollment bytes cannot substitute.

The existing bundle installer then checks source admission, accepted A or
bridge predecessor, host/core/native pending/locks, deployment signature and
exact plan before any public-only bundle staging. Its first install write is a
flat, no-overwrite intent in trusted persistent state; the audit directory and
copies follow. Reconciliation distinguishes intent-only, partial audit,
pending staging, foreign/dangling final and exact installed postimage without
replaying apply. A missing audit receipt may be published only after full
installed enrollment verification under a separately scoped recovery action.
The immutable intent and installed receipt remain the authority for lost-response reconciliation.
Installer audit UUID roots use the existing trusted Compose state, separate
from the intro audit namespace. No private key is read by the host installer,
no controller pointer changes and no candidate code may install itself.

The historical broad production-control 75/63 source artifact and any future
expanded map are distinct from this inert introduction. Full installed-path
negative tests, independent review, exact artifact transport and an actual
approved intro effect are prerequisites before V2 bundle install may be
planned. Source CI and bundle bytes are not installed-path proof.

### Closed source producer

`build-standalone-intro-source.py` reads only regular blobs from the exact
checked-out Git commit. The separate artifact
`leetplus-standalone-intro-source-<SHA>-<RUN>-<ATTEMPT>` contains
`source.tar.gz`, `source-receipt.json` and outer `SHA256SUMS`. The deterministic
USTAR/gzip archive contains exactly the 19 source leaves needed by the inert
generation plus its own root SHA256SUMS; it keeps original repository-relative
paths without a payload prefix. Owner/group/mtime are zero and transport modes
are 0400. The root manifest closes every other archive leaf and is sorted by
UTF-8 byte order; directories are derived from those paths on installation.

The receipt contract is `LEETPLUS_STANDALONE_INITIAL_SOURCE_V1`, with decision
`SOURCE_BYTES_ONLY_NOT_AUTHORIZATION`. It binds fixed repository, source Git
commit and tree SHA, workflow/event/ref, run/attempt, archive/raw manifest/source-map hashes
and the complete 19-file map. Even a main-push source receipt cannot replace
the final Full admission or Compose admission: the signed INTRO plan must bind
their exact raw bytes, artifact IDs, parent run/attempt and the source archive
transport independently. The initial-intro primitive is a separately bound
Compose leaf, not a generation import or a hidden archive entry.

The dormant standalone installer and later RPC use the introduced persistent
`/var/lib/leetplus-compose/standalone-install.lock` followed by the existing
native control lock. This avoids silently losing installer serialization on
reboot; no fallback to a volatile `/run` lock or lock creation by prepare is
permitted. The initial signed intro operation owns the first lock creation.
Accepted A and broad production-control lock contracts are unchanged.

The trusted launcher captures all 14 admitted bundle leaves by same-fd reads
after verifying enrollment, sends the exact bytes through a sealed memory fd,
and starts isolated Python with a fixed in-memory loader. The RPC host compiles
its eight effect-capable Python dependencies from that capture in dependency
order. Its Node CLI, protocol and two authority modules are linked from
captured bytes as data URLs; no child executes an installed source pathname.
Accepted predecessor inventory likewise captures `control_handoff.py` and the
six JavaScript leaves reachable from its snapshot and authority routines:
`control-handoff-runtime.mjs`, `orchestrator.mjs`,
`worker-continuation.mjs`, `worker-authority.mjs`,
`control-handoff-authority.mjs` and `contract.mjs`. The observer compiles the
Python buffer, links each fixed JS import from captured data URLs, and injects
a narrow stdin-preserving Node callback for runtime, forward, rollback and
recovery validation. A filename hash
followed by another pathname import is not source authority. This is a source
candidate and needs the complete Linux fixture and installed-path acceptance.

After public-only bundle installation, a separate signed runtime-provision
action on the installed launcher consumes one canonical request from stdin.
Its deployment-root approval binds the exact host, bundle/installer receipt,
request command and bytes, fresh fixed path preimages and native lock inodes.
A flat intent in existing Compose state precedes creation of the private
transition state root, requests/operations/attempts directories, persistent
transition lock and immutable request; a terminal receipt binds their postimage.
Every request placement has a fresh placement UUID and signed plan. A new
operation request cannot appear as an unsigned file. Read-only reconciliation
classifies intent-only, partial, torn and exact postimages; explicit recovery
can publish only a missing terminal receipt after the complete exact postimage.

The RPC host verifies the terminal signed placement lineage before handling a
request. `observe`, `plan-v1` and `prepare` write no persistent attempt state.
Its watchdog and child stderr use process pipes/anonymous memory. The
dispatcher captures command stdout/stderr/exit externally; effectful native
actions still rely on their own signed intent, locks and receipts. Runtime
provisioning is a distinct future dispatcher effect/GO; this source change
performs no host operation.

## Trust and independent packaging

The accepted b0 controller has no verifier capable of admitting the bridge's
changed privileged executor. The bridge deliberately cannot admit the external
successor's changed renderer, launcher, runtime entrypoint and units. Neither
target may install or certify its own bootstrap verifier.

Prepare a separate exact-source bundle containing protocol.mjs,
native_boundary.py and only the two pure permit validators from
deploy/leetplus-compose. Preserve their source directory structure and relative
imports. Every package leaf and descriptor has an independently measured digest;
the package imports no staged target implementation. An independent authority
must admit and install this standalone bundle and public roots by exact bytes.
That privileged root-enrollment operation needs its own installer source,
review, receipts and direct dispatcher GO. The runtime bootstrap may only use a
previously accepted protected admission/enrollment record; caller-supplied roots
or self-generated package descriptors are not operational authority.

Use separate public-only permit, execution, rollback and zero-effect recovery
root identities in the
protected enrollment. No private key enters the host adapter, source test or
application container. The existing narrow prepare permit is not an execution
approval. `protocol.mjs` adds a domain-separated signed exact-plan execution
command and a different receipt-bound rollback command, each at most 30 minutes.
The operational signer is intentionally absent until its own reviewed authority
boundary is ready; tests use ephemeral keys only.

## Observation boundary before target callbacks

The future trusted adapter must independently reproduce:

- b0 or bridge complete admitted predecessor inventory, installed manifest,
  existing verifier and exact serving pointer;
- target exact-main producing-attempt admission, archive, release manifest,
  complete file inventory and every critical privileged leaf;
- own package/admission/enrollment/public-root identities;
- `/etc/machine-id` identity and complete active-state record;
- application/data/nginx/grant/timer/provider/container/network-refresh/firewall
  protected inventories, including process IDs and starts, not just names;
- no unresolved application/handoff intent, no orphan external container,
  verified original worker state, and unchanged root/network unit identities;
- exact fresh backup, authenticated off-host restored-copy, boot/resource
  baseline and rollback evidence with bounded freshness.

Only admitted predecessor-side observation code may produce expected permit
values. It can use fully reverified immutable predecessor libraries, including
the accepted application-history verifier. The target is inspected as bytes;
no target import, callback, signer, renderer or plan generator is reachable.
`verify_flat_inventory` rejects every added, removed, mutated, symlink, hardlink
and nonregular leaf before any target code is reachable. It checks secure root
ancestors, origin inode and bounded reads. Protocol protected-state fields
explicitly cover application, data, nginx, workers, timers, provider policy,
containers, network-refresh unit and firewall; absent evidence cannot be zero.

## Native lock and effect window

Acquire existing regular root-owned locks in this fixed order:

1. `/var/lib/leetplus-compose/standalone-install.lock` (introduced persistent standalone lock; accepted A/production-control locks are unchanged);
2. `/var/lib/leetplus-compose/control.lock`;
3. independently installed standalone transition singleton.

Prepare uses shared first/second locks and an exclusive transition singleton;
apply/rollback uses exclusive locks throughout. Bound total acquisition to 120s.
Never create a missing native lock. Verify the opened inode equals the path
after acquisition. The source `NativeBoundary` implements those primitives and
requires an independently implemented quiescence observer. It does not trust
test-side callbacks as live acceptance and does not call Docker/systemd itself.

Preparation returns only `PREPARED_NOT_AUTHORIZATION`. Execution independently
re-observes host/predecessor/target, verifies the exact plan and new execution
signature, durably publishes exclusive/fsynced intent, atomically CAS-renames
the one core pointer, fsyncs its directory, and proves unchanged protected state
before an immutable receipt. The new systemd units stay dormant/uninstalled;
no daemon reload, service restart, timer stop, grant rewrite, provider or data
effect is part of this transition.

## Lost response and rollback

No automatic forward retry is permitted after an intent. Reconciliation without
another pointer effect
revalidates historical signatures at the intent's authorization time and checks
the same immutable intent/plan/envelopes. A predecessor pointer with no receipt
is `NO_EFFECT_RECORDED_NO_RETRY`; foreign pointer or protected-state drift is
manual reconciliation. An exact target pointer with unchanged protected state
may publish the same operation's recovered receipt without another CAS.
Expired approval does not authorize a missing pointer effect.

A separately signed `NO_EFFECT` command can terminalize only a confirmed exact
old-pointer forward intent, or exact new-pointer rollback intent, with unchanged
protected state. It binds the pending intent digest and, for rollback, the
accepted forward receipt. Its `CANCELED_NO_EFFECT` record closes that operation
without another CAS; a future effect requires a fresh operation and approval.
The native publisher writes and fsyncs a same-directory temporary, then uses
Linux `renameat2(RENAME_NOREPLACE)` and directory fsync. Interrupted unpublished
temporary bytes are never authority; exact secure residue is recoverable under
the exclusive locks. Complete final records are never overwritten.
The pointer CAS uses a fixed unpublished symlink; a crash before rename can
leave that name. The signed zero-effect terminalizer binds its expected source
pointer and temporary target, removes only that exact root-owned symlink under
the same locks, fsyncs the parent, and then publishes the terminal record.
Foreign pointer residue remains HOLD.

Rollback requires a fresh signature binding the exact accepted forward receipt,
unchanged protected state and reverse pointer CAS. Its own durable intent and
receipt have a separate lineage. Lost rollback response can only reconcile its
observed exact postimage; it cannot repeat CAS. Historical terminal receipts
remain accepted records after legitimate later generations, while every future
effect starts with fresh installed/root/source/host observations.

## Source evidence and remaining installation work

### Follow-up adapter source after PR249

The next stacked source branch adds `inventory.py`, `host_observer.py`,
`authority.py`, `enrollment.py`, `bundle_installer.py`,
`canonical_lineage.py` and `canonical_lineage_native.py`. This is still a
candidate, not an installed host adapter. Full flat target leaves, immutable
manifest, exact-main admission and archive are read independently before any
target import. The only controller module the live observer may load is the
fully attested serving b0 or bridge predecessor, for its accepted application
history snapshot. Protected-state fields bind its active record, application,
data, nginx, grants, timers, provider policy, six containers, refresh unit and
firewall. The separate bundle enrollment verifier requires a deployment-root
signed installer plan, timely intent, receipt, exact bundle file map, four
distinct public-only roots and exact host identity.

The frozen controllers' continuity guard accepts only its canonical V1 handoff
lineage. A standalone pointer receipt is insufficient. The adapter source now
builds a V1 `CONTROL_HANDOFF` plan with a signed cross-link to the standalone
plan. Before core pointer CAS it must durably publish that plan, deployment-root
approval, global pending marker, `apply-main.intent.json` and a frozen V1
receipt. After CAS it can publish the V1 receipt and CAS the handoff active
pointer; an interrupted target can use the V1 pending lineage without a second
pointer effect. Reverse CAS needs a separate deployment-root receipt-bound
rollback approval and restores the exact prior V1 pointer. Root/Linux fixtures
exercise ordinary, lost-response and reverse lineage in disposable `/run`.

The next source layer adds `rpc_host.py` and `cli.mjs` to bind the pure Node
protocol to native root-only observations and effects over bounded, single-child
JSON RPC. The host owns ordered locks for the entire callback window and reads
public roots from the verified enrollment. Requests are canonical root-owned
files scoped to one exact UUID; only the admitted bundle's Node/Python files
may be launched. `offline_sign.py` prepares one exact, domain-separated
signature from Windows DPAPI custody after public-key match, linked plan or
receipt checks and an exact dispatcher confirmation phrase. This phrase is
not proof of message origin; the dispatcher must retain the direct user GO.

Neither CLI nor installer is installed or accepted by the dispatcher. Exact
Linux installed-path tests, native storage provisioning, signer provenance and
install/recovery/rollback host rehearsals are still required. The installer can
stage one closed bundle+enrollment tree and
atomically rename it into a protected final path; incomplete staging is HOLD
for separately signed recovery. It cannot install itself or infer a direct GO
from source review. No production effect is authorized by this follow-up.

JS fixtures cover both exact predecessor paths, mutated privileged leaves,
foreign host, signatures/expiry, durable intent ordering, lost responses before
and after CAS, protected timer drift and receipt-bound rollback. Native root
fixtures use disposable `/run/leetplus-transition-source-*` trees and real
Linux flock contention. Windows skips those native fixtures honestly.

Remaining source-to-operational gates are explicit: implement and independently
review the complete host observer and its protocol/native binding; implement a
separately admitted protected bundle/root installer; verify root/signature
provenance and package bytes; run disposable and actual installed-path negative
mutation/foreign-host/lost-response/lock gates; then prepare a fresh exact
production plan with backup/restored-copy/rollback and direct dispatcher GO.
These files supply reusable protocol and native primitives, not a completed
host authority. No old A, bridge, application or forwarded GO applies.

The separately admitted launcher candidate
`docs/deployment/production-artifact/trusted_predecessor_bootstrap_launcher.py`
resides outside the candidate bundle. It verifies the deployment-root-signed
installer plan, timely intent, terminal receipt, exact-main source admission,
closed full file map and four distinct public key identities before importing
any candidate Python module. The root host independently rechecks plan-bound
pointer direction and exact permit/execution/rollback/zero-effect schema before
CAS or pointer-temporary recovery. It durably records request, bounded RPC
stdout/stderr, exit and cleanup status. A separate process-group watchdog kills
both Python lock owner and Node child on hard timeout or abnormal parent death;
normal authority rejection closes the watchdog with an explicit completion
byte. These are source contracts and disposable fixtures, not an installed
launcher, enrolled key or accepted host transition.
