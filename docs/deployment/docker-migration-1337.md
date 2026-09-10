# LeetPlus: Docker migration to 1337

Status: preparation only; d53684a0 control installed but image hydration rejected
before DB/application startup. No target site is serving. The original image
archive used classic-store config IDs and an incomplete untagged OCI index;
target containerd correctly rejected that identity mismatch.

Successor image packaging uses pinned Docker29.1.3/containerd, named single-platform
images and a fresh independent daemon import/run check for all four exact image
IDs. Its archive-roundtrip receipt is part of admission. Do not switch the target
daemon storage backend or substitute loaded hashes. A control successor may
replace command links only through `--previous-prepared-control-sha`, with every
predecessor file verified and no preparation receipt, project container, operation,
worker grant or accepted runtime. Installed generations remain immutable.

Current authorization: preparation only. Do not switch DNS or public nginx,
stop source API/Web/worker services, promote a standby, or enable target live
workers. The actual migration is a separate user-authorized operation.

Source SSH hardening completed on 10.09.2026: exposed root password rotated,
password/keyboard-interactive SSH disabled, fresh key login verified. Main is
now protected by required Fast CI checks and PRs, including administrators;
force pushes and branch deletion are disabled. These do not change the serving
application. The encrypted off-host backup passed authentication and inner
dump/global checksums; database/runtime restore acceptance is a separate gate.

The source is CURRENT191 COMBINED on Ubuntu 24.04 / PostgreSQL16.13. The target
is Ubuntu26.04 server 1337, LAN192.168.1.137 / public188.234.220.76. Domains
stay unchanged. The accepted maintenance budget is 30 minutes; source VDS is
retained for 14 days. Daily encrypted backups go to the operator's Windows
computer. No UPS is available; this move does not provide site availability.

## Runtime contract

`deploy/leetplus-compose/contract.mjs` renders exact image-ID-bound Compose
JSON. Production ports are loopback13100/13200 for Web and14100/14200 for API.
PostgreSQL/Redis have no published ports. Web uses only its slot's internal
API network; API/data/worker traffic is separated. Rehearsal uses a different
project, root, subnets and ports, without an external egress network.
Rehearsal ports are23100/23200 and24100/24200. Its project firewall also denies
access to host services. This prevents an internal Docker network from using
an unrelated host proxy as an outbound path.

Database transport uses the native Prisma6 contract: `sslmode=require`,
`sslcert=/run/secrets/db-ca.pem`, `sslaccept=strict`. CI must verify a real TLS
connection and reject both a wrong CA and wrong hostname. libpq's similarly
named URL options are not substituted. API uses the non-owner `leetplus_runtime`
role with four connections per slot; each worker has two bounded connections.

API/Web restart on failure but are started after a Docker daemon reboot only
by the accepted-state boot controller, after the project network fence. Data
services keep normal restart behavior. Worker/backup singleton locks are
separate; shared control locks prevent them from starving normal application
recovery. A merely prepared application operation is not worker authority.

`PRODUCTION_NETWORK_PROFILE=HOST_LOOPBACK` is the unchanged default. Explicit
`DOCKER_BRIDGE` is restricted to the reviewed COMBINED contract with enforced
ACL and disabled in-process schedulers. The flag is not namespace authority:
the installed host controller must attest Docker identities and effective
port/network/mount/secret/privilege/resource configuration.

The supplied image build is CI-only. Immutable `release.json` binds source
SHA, build time and CURRENT191 inside both API and Web images. Secrets are
mounted role-specific JSON files, outside images and Git. Web receives no
database, JWT, integration or worker secrets. The singleton workers use the
existing dedicated CLI module graphs; they are not API schedulers.

## Release authority

PR/manual Compose validation is non-deployable. Deployment needs the same
exact-main Fast/Full admission, image/archive transport bindings, an installed
control generation and a signed host/plan/action-bound approval. The candidate
five-phase controller preserves immutable intent/evidence/receipt records and
requires reconciliation after a lost response. BOOTSTRAP additionally requires
evidence of source fencing, final LSN replay and target promotion.

The current candidate is not permission to install or run the old systemd
controllers against Docker. Namespace/network, source-to-target migration,
worker permits, signed rehearsal, backup and production acceptance must all
be verified before deployment. Never edit historical source receipts to make
the target appear enrolled. Do not weaken existing controllers on the VDS.

## Data and rollback

Retain PG16.13 and source-compatible glibc2.39/en_US.UTF-8. The host's PG18 and
Alpine database images are not physical-restore targets. Preserve the complete
cluster and mixed owners/ACL; CURRENT191 is not re-applied and historical
rolled-back migration records are retained. Blob attachments live in the DB.
Preserve encryption/HMAC/AAD key versions and discrepancy data separately.

Rehearse on an isolated copy with all provider writes denied. Prepare a standby
over SSH with bounded WAL retention before the maintenance window. Drain both
workers, pause the existing single Telegram poller without replacing its offset,
fence all source writes, replay final LSN and stop the old primary before target
promotion. DNS TTL reduction precedes the window; stale-DNS clients use the old
Nginx as a temporary TLS/SNI-verified proxy to the fixed target IP.

Before target writes, host rollback may restore the fenced source. After target
writes, only application blue/green rollback is immediate; host rollback needs
an explicit reverse transfer of the latest database. Neither checksums nor
wal_log_hints are enabled on the source, so pg_rewind is not assumed available.

## Acceptance

Verify exact API/Web release, migration191 and unfinished0; tenant/store and
attachment negative matrix; corporate and guest auth; provider connectivity;
one worker owner and no duplicate external effects; restored-copy parity;
interrupted deploy/reconcile and nginx rollback; encrypted off-host restore.
Use the working network's persisted identity (display1337, slugdemo), not an
empty same-name tenant. Separate SSH credential and main-branch protection
hardening from application data changes. No production state is claimed by
this document until receipt-backed acceptance has completed.
