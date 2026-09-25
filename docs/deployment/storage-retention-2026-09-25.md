# LeetPlus backup and rehearsal storage retention

Status: **source-only proposal**. It does not install a controller, change the
scheduled Windows task, or authorize deletion on `1337s`. The production
dispatcher owns the shared server effect boundary and is currently running a
separate A→bridge preparation. No storage cleanup may overlap that operation.

## Recovery copies

The owner has asked to retain two recovery copies. The working interpretation
for planning is **one current encrypted generation on `1337s` and one matching,
verified generation off host**: two physical copies in separate failure
domains. This is an assumption until the owner confirms the copy semantics;
no deletion is authorized by it. The read-only
`scripts/storage/plan_backup_exports.py` requires an explicit
`--keep-generations 1|2` and never chooses a count by default. If the owner
means two historical generations at each location, the plan must use `2`
instead of `1` and be reviewed again. A
server export is not removable merely because it is old. Every retained
generation must have a matching off-host SHA-256/size verification receipt, and
the server `latest.json` must name the newest export. The future effect plan
must independently hash bytes, prove decrypt/restore ability and protect
backups bound to an active or accepted operation. A missing proof yields HOLD.

`daily-backup.py` continues to create encrypted exports and the latest pointer
without deleting older files. The backup creator must not prune exports before
the off-host transfer and restore evidence have completed. The new planner is
read-only; its `CANDIDATE_PREVIEW_ONLY` decision is not a deletion GO. It
accepts an explicit protected-name set and holds when a protected historical
backup would exceed the selected count. Apply requires a separate exact file
list, plan digest, current host/controller/backup/operation baseline, one effect
owner, direct user GO in the dispatcher task, per-file receipts and a fresh
postcheck. Do not reuse any release or cache-cleanup GO.

## Off-host pull and temporary files

The installed Windows pull currently tries `192.168.1.137` and fails before
SSH key exchange in a direct read-only probe. The same existing backup-only
key, known-hosts pin and `HostKeyAlias=188.234.220.76` read `/latest.json`
successfully through `188.234.220.76`. The source `pull-backup.py` now uses that
public route. This does not weaken host-key checking, change the backup user,
decrypt during transfer, or alter API/Web/worker egress.

The source also removes only the current pull's UUID `.incoming` directory
after the SCP child has exited. It first rejects a symlink, foreign path or
unexpected child; an abnormal directory is preserved for investigation.
Existing old `.incoming` directories are not swept by the scheduled task.
After a separate reviewed installation, verify the exact installed script,
Windows task principal/ACL, a full authenticated ciphertext pull, fresh
`backup-status.json`, and one restored-copy check. The existing retention
routine must not be made more aggressive until the copy-count choice and
protected backup set are frozen in that installation plan.

## Restored-copy and operation payloads

The current production PostgreSQL data is `/srv/leetplus/data/postgres`.
Historical `/srv/leetplus-migration` and `/srv/leetplus-operations` database
copies are not live primary data. They still carry recovery and audit bindings.
For each operation, preserve immutable plan/intent/evidence/receipt and
explicitly pinned predecessor inode/backup inputs. Only after terminal state,
backup coverage, no mounts/open handles, owner sign-off and exact path/inode
preflight may its bulk clone payload enter a retirement plan. The September 11
migration data-only candidate list is a separate draft; five exited restore
containers must be named in any GO that retires their mounted directories.

At the observed September 25 snapshot, 41 server exports occupied 148.64 GiB;
22 large operation clone payloads occupied 261.34 GiB, while their other
operation metadata was about 0.12 GiB. Without a backup-export policy and a
terminal clone-payload policy, daily exports and each restored-copy rehearsal
will refill the same filesystem. Neither historical age nor a stopped
container alone proves that a path is safe to delete.

## Acceptance boundaries

Source tests cover the public pinned backup route, exact operation-owned
staging cleanup, and fail-closed backup-retention previews. Source/CI success
does not establish installation or production acceptance. Before any
deployment, read the full operation `ERROR_LOG.md`, run the applicable
admission checks, preserve stdout/stderr/exit for each gate, and obtain a
separate exact GO for install and each destructive cleanup effect. Verify
serving controller, GREEN/BLUE/data identities, worker timers/grants, current
backup and off-host restore evidence after the effect.
