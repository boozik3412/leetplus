# Provider refresh and serving-controller handoff

Status15.09.2026: **source candidate, not production deployment**. The last
verified application is blueb5c033/generation5, rollbackgreen05cad9cd;
dataRelease and installed controller are399876 until actual handoff acceptance.
USER_CALL/executive application code is not implicitly deployed by this operation.

### Snapshot ordering repair, 16.09.2026 (source only)

The prepared d7d799dd controller has not been activated. Read-only production
inspection exposed nondeterministic Docker `Mounts` ordering: unchanged
containers produced different configuration hashes. The successor fingerprint
sorts this unordered collection by unique canonical absolute POSIX `Destination`
and sorts JSON object keys, retaining every configuration and mount field.
Duplicate/malformed destinations fail closed. Other arrays (including `Env`,
`Cmd` and `HostConfig.Binds`) remain order-sensitive; PID/start/image/grant checks
are unchanged. Never retry until a random old fingerprint happens to match.

The signed-plan/receipt JSON serializer is unchanged. Previously prepared plans
are not rewritten or reinterpreted with the new fingerprint: this fix requires
new exact-main admission, a new native plan and separate exact-plan GO. No source
file may be patched into an already installed controller. Before signing, verify
the operator/host time basis; do not backdate approvals, enlarge their lifetime
or change machine clocks as an implicit deployment step.

## Reliability boundary

Only exact `network --operation refresh` shares the global controller lock with
ordinary workers/backups. It additionally owns exclusive `network-refresh.lock`.
The shell and Node policy must agree, and Node verifies both actual kernel
FLOCK owners/inodes. Concurrent refreshes are rejected; app deployment,
installation and other network mutation retain the exclusive lock. A refresh
waits at most20seconds for an exclusive operation; conflict exits75.

The existing refresh timer remains15minutes. Its oneshot service retries failures
after30seconds, bounded to five starts in10minutes, with90seconds per start.
The next ordinary timer activation may try again after the rate-limit window.
Approved provider hostnames, public-IP validation,3600second address TTL, atomic
set swaps and default-deny firewall rules remain unchanged. This covers the
whole reviewed provider policy, not a hard-coded tenant or club.

`network --operation status` is read-only and reports actual set counts and
minimum TTL, plus the last aggregate observation. Empty/missing sets are
`UNAVAILABLE`;15minutes or less remaining is `AT_RISK`; a failed refresh with
otherwise fresh addresses is `DEGRADED`. Refresh failures expose an allowlisted
reason code in the native journal, without tokens or provider payloads. This
does not install a new external notification channel or weaken network authority.

## Controller-only installation

1. Obtain exact-main Fast and Full admission, independently verify the trusted
   run and immutable `docker-admission.json`, `control.tar.gz`, `release.json`.
   Stage only those reviewed files under the exact root-owned inbox SHA.
2. Run the admitted installer with `--stage-only`. It writes a separate immutable
   controller root and manifest but changes no command symlink, unit, runtime,
   database, worker grant or active state. Never use preparation replacement
   against an enrolled serving system.
3. Produce canonical root-owned evidence with `decision=PASS`, exact target
   `releaseSha`, authenticated `backupSha256` and actual `rehearsalSha256`.
   These are measured evidence, not placeholders authorizing a skipped gate.
4. Use the staged, isolated `control-handoff.sh plan` entrypoint with exact old
   SHA, new SHA, admission digest and evidence path. It verifies accepted app
   history, old/new admitted archives and manifests, unchanged execution
   contracts, active app/data/config/grant hashes, container IDs/PIDs/start times,
   nginx and firewall state. The output is `PREPARED_NOT_AUTHORIZATION`.
5. After separate production GO for that exact plan, sign it on Windows with the
   existing DPAPI-protected deployment key using `sign-control-handoff` and
   `GO <operationId> <planSha256>`. No private key goes to Linux.
6. Run staged `control-handoff.sh apply --operation <id> --approval <file>`.
   It waits up to120seconds for the existing exclusive lock **before** publishing
   effects. It does not stop/start/disable timers or kill an active worker. A
   busy window is a safe failure before changes, not permission to force drain.
7. Under the short exclusive window, revalidate the snapshot, publish immutable
   phase intents, CAS only the refresh service retry bytes and atomically switch
   `/usr/local/sbin/leetplus-compose`. Reload systemd configuration without
   restarting services. Renew the same approved provider sets, verify unchanged
   app/data/config/grant/firewall state, and publish the accepted authority.

The unchanged `network.sh` and `backup.sh` launchers can remain in their older
immutable roots: both delegate through the stable main command, and byte identity
with the target launchers is required. There is one core-pointer switch, not a
three-command partially switched controller generation.

The operation never changes `active.json`, application/data images, nginx routing,
database rows/schema, profile identity, reward state or worker grants. Public
guest/corporate/worker execution remains separate. No API/Web/PG restart is part
of this plan. Actual request continuity and unchanged process identities must be
measured; source tests alone are not a zero-downtime claim.

## Crash recovery and rollback

Every effect has a prior root-owned immutable intent. First apply requires exact
old preimages; a resumed step can recognize its exact afterimage only when that
intent already exists. Unknown pointer/unit/config drift stops without adoption.
If the process stops after the initial apply intent but before the pending marker,
retry may recreate that marker only with exact untouched preimages and no phase
intents. Once an unfinished forward approval expires, its timely signed intent
permits only owned-effect undo/abort, never forward activation or a backdated
receipt. The operation terminates `ROLLED_BACK / EXPIRED_BEFORE_ACCEPTANCE`;
a new activation requires a fresh plan and GO.
Accepted terminal replay performs no old effect, even after newer legitimate
application history; a pending accepted receipt completes its pointer/marker only.

Ordinary lifecycle under a new controller requires either an application plan
bound to that controller or a signed, receipted controller handoff. Between the
atomic main switch and final receipt, a timely signed switch intent plus the
actual new main/unit postimages provides explicitly **provisional** lifecycle
authority. This is not a fabricated completion receipt. Operational app deployment
stays fenced until reconciliation. Pending network installation is allowed only
from the existing network boot unit's actual kernel cgroup, with independently
validated signed application history; a manual CLI receives no such permission.
A changed app/PID/config snapshot requires
operator investigation; never rewrite it to manufacture unchanged-process proof.

Before acceptance, a failed postcheck reverses only this operation's proven
main/unit effects, preserving application/data and current provider-set contents.
An interrupted undo remains pending until its exact state is reconciled.

Manual rollback after acceptance requires a **separate** signed
`CONTROL_ROLLBACK` approval bound to the exact forward receipt. Use
`sign-control-rollback --receipt <accepted receipt>` with
`ROLLBACK <operationId> <planSha256> <receiptSha256>`, then the staged
`control-handoff.sh rollback` command. A forward approval is not rollback
authority. Changed app/data/grant state prevents reverse CAS; no database or
application rollback is implied.

Old/new controller archives, admissions, manifests and all handoff records are
kept under `/var/lib/leetplus-compose/control-handoffs/<id>`. The existing
encrypted backup captures this subtree, making controller-only recovery
self-contained without deploying the target application's image bundle.
The concurrently replaced `network-refresh.json` diagnostic record and its exact
temporary files are excluded from backup; authority/configuration records remain
included. This avoids a new archive stat/open race during concurrent refresh.

## Acceptance and reporting

- Run `node --test deploy/leetplus-compose/*.test.mjs`; the GitHub Linux gate
  executes the real root FLOCK fixture, while Windows records its explicit skip.
- Rehearse signature/active-chain drift, unsafe files, first-apply/replay,
  crash-before-pending/after-unit/main, expired-intent undo, boot-only network
  authority, owned undo and separate manual rollback.
- Verify public API/Web, both slot identities and unchanged container process
  identities while switching; probe provider HTTPS without creating paid calls.
- Observe multiple actual automatic refreshes while an ordinary worker runs,
  and at least one normal worker receipt on the preserved signed grant. Existing
  valid guest call confirmation is separate from an HTTP-only provider probe.
- Report application SHA/generation, **installed controller SHA**, and dataRelease
  separately. `status.controller` identifies the executing/serving controller;
  it must not be confused with the application in `status.active`.

Before every retry or production command, read the complete operation ERROR_LOG,
record the failure/cause/changed condition and reconcile completed effects instead
of repeating them. Do not use direct symlink/unit edits as an operational shortcut.
