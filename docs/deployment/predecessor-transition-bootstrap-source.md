# Independent predecessor transition bootstrap: source packet

Status: **source design and primitive implementation; production HOLD**. The
frozen external-controller PR248 stays at da7. This follow-up lives separately
under `deploy/transition-bootstrap`, outside `control.tar.gz`. It is not wired
into either generic controller handoff. No production installer, CLI, key
enrollment or complete live observer is provided by these source primitives.

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

1. `/run/leetplus-production-control/install.lock`;
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
