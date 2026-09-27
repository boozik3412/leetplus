# Disposable Linux stage acceptance

Status: **NOT RUN — SOURCE ARTIFACT ONLY**.

This directory contains a byte-exact copy of stage source SHA-256
`828cc35c78df40d061c6f2330ed9143d9a6e09b9fc900f2c161029e7177c8e0a`
and a standard-library acceptance runner. The source is compiled and executed
from the same already hashed bytes without a pathname reread or bytecode cache.
Historical focused references are
control test `d2d6b0c387074010ab0e855bd2990779337043a6739a7b14390cdab2f87d8336`
and observer test `29c1df6eab9db78e04892096b7b80515ea5abfd820d7204fb83321e23e73b941`.

Run only as root on a disposable, non-production Linux host:

Create one pre-existing root-owned mode-0700 immediate `/tmp` result directory
named `leetplus-stage-acceptance-results-<32 lowercase hex>`, then run:

```bash
python3 -I -B run_linux_stage_acceptance.py \
  --output /tmp/leetplus-stage-acceptance-results-<32hex>/linux-stage-acceptance-result.json
```

The output parent is opened with `O_DIRECTORY|O_NOFOLLOW`, identity-checked
against its pathname, and the fixed result leaf is created relative to that
directory descriptor with `O_EXCL|O_NOFOLLOW`, file-fsynced and dir-fsynced.
System/LeetPlus roots, symlink parents, nested arbitrary `/tmp` descendants and
any alternate basename are rejected.

The runner rejects non-root execution, hostname `1337s` and machine identity SHA-256 `de72d444…`.
Each case runs in a bounded subprocess and writes only under a parent-created,
nonce-authorized mode-0700 case directory below one `/tmp/leetplus-stage-acceptance-batch-*`
root. The parent inventories and path-guards each owned case root, removes it on
all outcomes, then removes the empty batch. It exercises the real pinned `stage()` and native
SIGALRM/setitimer, O_EXCL, O_NOFOLLOW, fsync and flock paths with safely injected
temporary roots, lock, baseline and metadata validators. The result file is
exclusive mode 0400 and preserves per-case raw JSON, source/fixture hashes,
platform identity, inode observations and cleanup results.

Acceptance cases: complete success; prewrite deadline with no mkdir; timeout
after exact root and D leaf; lock contention and post-error release; symlink
rejection through a real `O_NOFOLLOW` open; O_EXCL collision with original-byte
hash; modified-content rejection; inode-mismatch rejection. A standalone
`--child` invocation cannot target an arbitrary absolute directory: exact batch/case
naming, root ownership/mode, parent PID and a one-use nonce marker are required
before the child writes. No native LeetPlus lock, `/run` root, Docker, unshare,
socket or network operation is used.

This package has not run on Linux. A PASS would support only disposable stage
mechanics for the pinned source bytes. It does not authorize installation,
server staging, diagnostic launch, production work or reuse of any prior GO.
The receipt lists every patched surface. Native effect syscalls and the exact
source root-UID metadata helpers are acceptance scope. Production fixed-path
baseline validation remains safely injected and is explicitly not accepted.
Calls by the exact source to `sync_dir(/run)` are redirected
to the owned temporary parent while still exercising the real fsync helper.
