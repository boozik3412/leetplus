# Disposable Linux capture mechanics acceptance

Status: **NOT RUN — SOURCE ARTIFACT ONLY**.

This package contains four byte-exact source copies and a standard-library
root-only disposable Linux runner:

- capture `c333a935e5924b79b86afb7617ac7597db66e2fae23d0872f45e97659bd23939`
- D `73801b0d24b5896eaf327a64be5f79c6d04f3fb16fca3310d40ccd9942dcc919`
- P `b158a288a3b8df29212c6d0f86888d8b2874004d38a50b3f359a472cd933381a`
- stage `828cc35c78df40d061c6f2330ed9143d9a6e09b9fc900f2c161029e7177c8e0a`

It verifies all four hashes before creating its batch and records them in the
receipt. It rejects hostname
`1337s`, production machine identity `de72d444…`, non-Linux and nonroot before
writes.

Create one pre-existing root-owned mode-0700 immediate `/tmp` directory named
`leetplus-capture-acceptance-results-<32 lowercase hex>`, then run:

```bash
python3 -I -B run_linux_capture_acceptance.py \
  --output /tmp/leetplus-capture-acceptance-results-<32hex>/result.json
```

The runner owns one literal-`/tmp` sticky-root-validated batch and nonce-bound
case roots. Children reject arbitrary roots through exact batch/case naming,
parent PID, nonce and device/inode marker. Parent kill/waits only owned process
groups, inventories and guarded-removes only owned roots on all paths. Result
publication uses a stable root-private parent dirfd and fixed `result.json`
with O_EXCL/O_NOFOLLOW plus file/dir fsync.

It compiles the exact checked capture bytes from memory. D, P and stage are
copy-byte verified only; this fixture does not execute them or claim their
runtime acceptance. The earlier stage CI receipt remains the separate evidence
for stage mechanics.

Selected capture mechanics use
the real source functions: selectors, SIGALRM masking, Popen close_fds/session,
full output, prefix/cap, nonzero, timeout/kill/wait/residue scan, nonblocking
flock and immutable intent/terminal publication with truth timestamp. Dummy
fixture-owned Python commands replace the real D unshare command and this patch
is explicit per case. No general network, provider, Docker, native lock, `/run`,
old UUID9afc or LeetPlus path is used.

The audit case exercises the capture source's exclusive audit writer. Two
additional cases call the real `capture_once` on a disposable case root. They
inject a reviewed byte-exact D module with a dummy local child command and
temporary D root prefix; they inject a narrow disposable baseline, P collector
and source metadata, and redirect only `/run` directory fsync to the owned
temporary root. They use the real source native-style flock helper, Linux
SIGALRM/selector/Popen/process-group path, O_EXCL/fsync writer and pure D
terminal derivation. The success case requires unlock before terminal create,
matching terminal/phase SHA and a publication completion timestamp after the
exclusive-create timestamp. The failure case injects LOCK_UN uncertainty and
requires intent-only `RECOVERY_REQUIRED` with no terminal. Every patched
surface is listed per case in the receipt. Production baseline/P/tool/source
metadata and the real D netns command are not accepted by these injected cases.

An optional fixed `unshare --net ... /usr/bin/true` capability check is recorded
separately. Denial is `SKIP_NOT_ACCEPTED`, has no workaround and is not a gate
for capture mechanics.

No Linux execution has occurred. A successful fixture run would emit
`DISPOSABLE_MECHANICS_PASS_NOT_NETNS_ACCEPTANCE`: it would accept only the
selected disposable mechanics and injected orchestration for these exact
bytes. The real D unshare/netlink child, production path/baseline/P/tool
identity, native LeetPlus lock, isolation, server capture and browser remain
unaccepted. The receipt is not production authority, PR, merge, main update
or release.
