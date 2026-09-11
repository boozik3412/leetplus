# LeetPlus: Docker migration to 1337

Current state on11.09.2026: **SERVING_ON_TARGET**. Exact
`399876b560b4ac611eae35ee425d99422fb140b9` is active green with healthy blue
rollback, accepted Compose generation2. Target1337 is LAN192.168.1.137 /
public188.234.220.76; PostgreSQL16.13 is the only primary, CURRENT191.
Source168.222.143.243 is now a verified HTTPS forwarder. Its PostgreSQL and
four app units are persistently masked/stopped; both worker timers are disabled.
Root/www/api A records point to the target, TTL300. Do not repeat the cutover.

See [actual operations, acceptance and backup receipts](docker-migration-completion-2026-09-11.md).
[PREPARED_NOT_SERVING ae0d results](docker-migration-prepared-2026-09-11.md)
are historical preparation evidence, superseded by the admitted399876 rehearsal
and actual11September cutover. Final TLS validation fixed the native strict-CA
worker parser; compatibility preserved PG/API/Web Europe/Moscow, worker UTC,
PostgreSQL en_US.UTF-8/English search, API4GiB/Web1GiB and daily45min/bonus16min.

The measured website/API maintenance was763seconds, within the30-minute budget.
Retain the old VDS as proxy with fenced database/apps for14days, until at least
25.09.2026 16:54 Asia/Yekaterinburg. Deletion is a separate decision. The target
has no UPS; this move does not provide high availability. Host-global timezone
and unrelated target applications/certificates are unchanged.

## Runtime and network contract

`deploy/leetplus-compose/contract.mjs` renders exact image-ID-bound Compose JSON.
Production loopback ports are13100/13200 for Web and14100/14200 for API.
Rehearsal has a separate root/project/database, ports23100/23200 and24100/24200,
different authentication secrets and no provider authority.

Docker29 does not actually publish ports when every attached bridge is internal.
Per-slot ingress bridges therefore use explicit host loopback publication and
the project V2 firewall. The data bridge stays internal; PG/Redis have no
published ports. Web may reach only its own API. Only declared API/worker data
identities may reach PG5432/Redis6379. Host proxy/SSH, other-slot and unapproved
outbound paths are denied. API/worker provider gateway has explicit priority1.
Do not copy Web's egress restrictions onto provider-capable API/worker traffic.

The host controller verifies actual NetworkSettings publication, network/IP and
gateway identities, immutable images, non-root users/supplementary groups,
read-only roots, resource bounds and minimal mounts. A flag or HostConfig alone
is not network authority. Scoped network services/refresh timer are enabled;
they never flush global or unrelated Docker rules.

`HOST_LOOPBACK` remains the normal default; `DOCKER_BRIDGE` is restricted to the
reviewed COMBINED contract with ENFORCED tenant/file ACL and disabled API
schedulers. The dormant corporate/guest split is not activated. Public guest,
corporate tenant and worker/control-plane authority remain distinct.

Database transport uses Prisma6 native `sslmode=require`,
`sslcert=/run/secrets/db-ca.pem`, `sslaccept=strict`. API uses the non-owner
`leetplus_runtime` role with four connections; each worker has two. Generated
secret/audit file modes are explicitly applied after caller umask0077.
Stopped creation uses `compose up --no-start --no-deps`.

## Release and data authority

PR/manual image validation is not deployment admission. Exact-main Fast/Full,
immutable handoff and a separately signed host/plan/action approval are required.
CI uses pinned Docker29.1.3/containerd, exports four named images, and imports/runs
their exact IDs in a second clean daemon. Admission binds this receipt, actual
network/create tests and positive/wrong-CA/wrong-host Prisma TLS evidence.

The five-phase controller retains immutable HYDRATE/BIND/SMOKE/CUTOVER/POSTCHECK
intent/evidence/receipt chains; a lost response requires reconciliation.
BOOTSTRAP also requires real source-fencing, final-LSN replay and promotion
evidence. No such GO or migration receipt is created by preparation.

The plan separately binds `dataRelease` and `dataAdmissionSha256`. Initial
bootstrap uses its admitted bundle; subsequent application blue/green updates
retain the accepted PG/Redis set even if CI built new data-image candidates.
Manifest and actual container identities are checked; app rollout cannot replace
the data baseline. Data upgrades require a separate operation. Backup archives
include current app bundles and the independently accepted data bundle.

API/Web restart on failure. Host boot starts only an accepted application state
after network-fence verification; a prepared application is not worker authority.
Worker grants bind host, active release/generation, exact tenant and profile.
Separate singleton locks and a shared control lock preserve those boundaries.

`retire-preparation.py` can archive only an unserved preparation: no accepted
state, pending operation or worker grant; verified old files/images; a live
unpromoted standby and unchanged source identity. It stops/removes only exact
project containers and empty rehearsal bridges, archives old generated files,
and retains standby data for fresh preparation. Existing installed generations
and historical receipts are preserved. It has no VDS/DNS/promotion effect.

## Backup and operational acceptance

Daily encrypted backup is enabled at06:00 Asia/Yekaterinburg; the Windows reader
runs at07:00 and user logon. SFTP is restricted to read-only encrypted exports.
Private backup/deployment keys remain under Windows DPAPI custody. A stale,
paused or disconnected standby is rejected as a fresh backup source. Nominal
off-host RPO24h requires the Windows computer to be available.

Actual preparation acceptance includes CURRENT191/unfinished0, mixed-owner and
runtime-privilege preservation, both API/Web release identities, corporate/guest
auth, exact tenant store oracle and cross-contour denials, unchanged game/ledger
counts, real network denials and a full encrypted off-host SQL restore.
Wait for **both API and Web** readiness before manual acceptance; an early Web
startup reset is not authority to fake success or repeat a full restore.

## Cutover procedure executed on11.09.2026 and rollback boundaries

The sequence below describes the completed transfer; do not replay it on the
accepted target. A later host move requires a new current-data operation.

Before the maintenance window, recheck exact source runtime/configuration,
backup age, standby identity/streaming/lag, credentials and TLS. Preserve all
data encryption/HMAC versions. Keep PG16.13 and source-compatible
glibc2.39/en_US.UTF-8; host PG18/Alpine are not physical-restore substitutes.

During the separately authorized transfer: fence source HTTP writes, drain both
source workers and pause the single existing Telegram poller; preserve its newest
offset. Stop both source app slots, record/replay final LSN and stop the source
primary before promotion. Run signed target bootstrap/TLS/auth acceptance, then
activate the verified old-VDS HTTPS proxy and switch only root/www/api A records.
Resume the same poller with a fresh user canary, and issue new worker authority.
ACME renewal was enrolled and its dry-run passed after DNS propagation.
Keep `/srv/leetplus` root:www-data0710 and its `acme` child root:www-data0750;
secrets/data/backups remain root:root0700. Native preparation's private0700
defaults require this explicit public-webroot provisioning before issuance.
The exact hook, permissions checks and certificate receipt are in the completion report.

Before target writes, rollback may restore the fenced source. After target
writes, immediate rollback is application-only on the current target database;
host rollback requires a reverse transfer of the latest data. Source checksums
and wal_log_hints are off, so pg_rewind is not assumed available. Never restore
an old poller offset or run two writers/consumers.

The preparation replication login expires24.09.2026 16:46:57UTC; its tunnel is
already stopped/disabled and no renewal is needed for the completed transfer.
Any future data transfer needs newly reviewed authority. Source server deletion
remains a separate decision after the agreed14-day retention period and review
of the mail/FTP DNS dependencies that still point to it.
