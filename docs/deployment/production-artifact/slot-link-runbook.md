# Release slot-link authority runbook

`bind-release-slot.sh` is the only supported writer for
`/srv/leetplus/slots/blue` and `/srv/leetplus/slots/green`. It binds one slot to
an exact, already promoted and sealed `/srv/leetplus/releases/<40sha>` tree. It
does not migrate PostgreSQL, operate nginx, prepare Web cache, or start/stop an
application unit.

Manual `ln`, `unlink`, `mv`, editing a receipt, or deleting an outstanding
intent is not a recovery procedure. Stop and use `reconcile` with the same
installed helper.

## Install the authority

Install only the reviewed file from the exact release commit. The installed
copy and every ancestor must be root-owned and non-writable by group/other.

```bash
install -o root -g root -m 0755 \
  docs/deployment/production-artifact/bind-release-slot.sh \
  /usr/local/sbin/leetplus-bind-release-slot

install -d -o root -g root -m 0755 \
  /srv/leetplus /srv/leetplus/releases /srv/leetplus/slots
install -d -o root -g root -m 0700 \
  /var/lib/leetplus/deploy-receipts \
  /var/lib/leetplus/deploy-receipts/slot-links
```

The helper is Linux/root-only, must enter through its privileged Bash shebang,
scrubs the inherited environment, then restores only fixed
`PATH=/usr/sbin:/usr/bin:/sbin:/bin`, locale and timezone values. `/usr`, both
trusted binary directories, `/srv`, `/srv/leetplus`, both release/slot
roots, `/var/lib/leetplus`, and both receipt roots must be real root-controlled
directories. Release and slot roots must be on the same filesystem.

Before the first bind, the target must already have passed artifact checksum,
isolated hydration, promotion, and sealing. The helper independently verifies:

- exact lowercase 40-character SHA path and canonical in-root target;
- the exact release/slot filesystem identity and absence of release-local
  mountpoints;
- `SHA256SUMS`, `HYDRATED_SHA256SUMS`, canonical
  `HYDRATED_SYMLINKS.json`, the exact no-egress
  `HYDRATION_SANDBOX_RECEIPT`, provenance SHA, migration metadata, and Web
  `BUILD_ID`;
- exact external root-only
  `/var/lib/leetplus/deploy-receipts/release-hydration-attestation-<SHA>.receipt`:
  its hydration-origin slot must be exactly `blue` or `green`, while its release
  path, systemd policy/unit/stager digests and invocation must match the inner
  hydration receipt and hydrated manifest. The sealed artifact is shared and
  may be bound to either reviewed runtime slot; every destination bind still
  receives its own slot-scoped durable intent and receipt. Missing, partial,
  mutable, multiply-linked or drifted evidence makes the release unbindable;
- canonical, sorted, duplicate-free manifest paths: source `SHA256SUMS` must
  be a subset of the hydrated manifest, while `HYDRATED_SHA256SUMS` must cover
  the exact full set of regular files in the sealed tree except itself;
- an exact UTF-8 byte-sorted symlink topology: every link has one canonical
  in-root relative path and relative normalized raw target, and add/remove/
  retarget drift is rejected. The topology file is itself covered by
  `HYDRATED_SHA256SUMS`, and its direct SHA-256 is persisted in intent and
  receipt records;
- root ownership, `leetplus-runtime` group, exact `0550` directory modes and
  exact `0440` or `0550` regular-file modes (with no setuid, setgid, or sticky
  bits), absence of special or multiply-linked files, and containment of every
  release symlink;
- read/search access for the exact blue/green API and Web service identities.

## Bind an inactive slot

The normal path is an inactive candidate slot. Verify both units are stopped,
then bind the exact promoted release:

```bash
systemctl is-active leetplus-api@blue.service || true
systemctl is-active leetplus-web@blue.service || true

/usr/local/sbin/leetplus-bind-release-slot bind \
  --slot blue \
  --release-sha <exact-40-character-sha>
```

The helper acquires one protected global lock, records an O_EXCL durable intent,
fsyncs the intent and journal directory, creates a temporary exact symlink,
fsyncs the slot directory, and atomically renames it onto the slot. Only after
revalidating the exact effect does it publish an O_EXCL accepted receipt and
remove the completed intent.

The durable intent stores the SHA-256 of both requested and prior hydration
attestation receipts. Reconcile and rollback re-read those root-only receipts;
policy/invocation evidence cannot be replaced between validation and effect.

Record `SLOT_LINK_ACCEPTED_RECEIPT` in the release evidence. Do not infer
success only from a symlink or from a disconnected shell exit status.

## Lost response or host/process interruption

If the command was interrupted, timed out, or the operator lost its response,
do not repeat `bind` and do not modify the link. Run:

```bash
/usr/local/sbin/leetplus-bind-release-slot reconcile --slot blue
```

`reconcile` requires exactly one protected intent. It accepts only two states:
the exact prior receipt-bound state or the exact requested release. In the
first case it performs the missing atomic effect; in the second it only seals
the missing accepted receipt. Any third state is drift and fails closed.

An interruption after receipt publication but before intent cleanup is also
safe: reconciliation checks that the receipt is bound to the exact intent,
checks the effect, and removes the completed intent. Starting another bind or
rollback while an intent exists is prohibited.

Each accepted receipt is also atomically recorded in a protected per-slot
`blue.latest`/`green.latest` index before intent cleanup. Therefore a response
lost after cleanup is still resolved by the same `reconcile --slot` command;
it returns the exact latest receipt only after rechecking its digest and the
current receipt-bound slot state.

## Receipt-bound rollback

Rollback accepts only an unmodified accepted `BIND` receipt emitted by this
authority. The current link and both releases must still match the fingerprints
inside that receipt, and the receipt must be the slot's protected latest
authority record. A stale but otherwise valid historical receipt is refused.

```bash
/usr/local/sbin/leetplus-bind-release-slot rollback \
  --receipt /var/lib/leetplus/deploy-receipts/slot-links/<exact-bind-receipt>
```

The rollback gets its own durable intent and O_EXCL receipt. It restores only
the exact recorded prior release, or removes the link only when the receipt
proves that the prior state was `ABSENT`. A receipt cannot be rolled back twice.
If its response is lost, use the same `reconcile --slot <slot>` command.

This filesystem rollback is separate from nginx rollback and does not stop,
restart, or redirect a process. Follow the canary/cutover runbook for runtime
ordering.

## Active-slot prohibition

The helper accepts a slot only when both exact API and Web instance units have
`LoadState=masked`, `UnitFileState=masked`, `ActiveState=inactive`,
`SubState=dead`, `MainPID=0`, an exact root-owned `/etc/systemd/system/<unit>`
symlink to `/dev/null`, and no process in an extant unit cgroup. It checks this
twice, including immediately before the atomic link effect. There is no
command-line override. The release workflow must stop and mask both instance
units before bind or rollback and may unmask them only after the accepted slot
receipt has been verified. This keeps a live or dependency-restarted process
from observing a different release through its existing slot path.

## Acceptance fixture

Fast CI runs the root-only disposable Linux fixture:

```bash
bash .github/scripts/test-production-artifact-slot-link.sh
```

It covers initial bind, retarget and unconditional active-slot refusal,
normal rollback, rollback reuse refusal, interruption after bind/rollback
effects, lost-response reconciliation, out-of-root symlink refusal, symlink
add/remove/retarget drift, and sealed release fingerprint drift. It uses only a root-owned
`/tmp/leetplus-slot-link-fixture.*` tree and never addresses production paths,
systemd, nginx, network, or PostgreSQL.
