# Atomic blue/green nginx routing

The active nginx configuration includes exactly one symlink:
`/etc/nginx/leetplus/active-upstreams.conf`. Before the first artifact switch it
must target reviewed `legacy-safe.conf`: exact SHA
`7de04ff4ccc814494810730be3fa6bf661097b07` on dedicated API/Web users and
loopback ports `4300/3300`, with every scheduler and outbound path fail-closed.
Port `4300` is the reviewed auth-edge MainPID, not the exact legacy binary.
The legacy child is forced to `127.0.0.1:4301`, is reachable only by the API
UID through the exact nft fence, and is never an nginx upstream.
Candidate slots use `4100/3100` or `4200/3200`. The live site proxies to the
stable upstream names `leetplus_api` and `leetplus_web`; it never embeds a
candidate port directly. A candidate config contains exactly one API server
and one Web server and has no per-upstream `backup`: one-sided failure must
surface as a bounded serving failure until the watchdog or operator atomically
restores the whole previous pair. This prevents mixed candidate/N-1 routing.
Scheduler-capable `4000/3000` is never a hot rollback target after the
scheduler-free activation boundary.

Install `active-upstreams.include.conf.example` once at nginx `http` scope.
The separate scheduler-free activation runbook first validates the edge's
public allowlist, unauthenticated denial matrix and authenticated critical reads
on `4300/3300`, atomically routes `legacy-safe.conf`, drains the
old nginx worker generation and backend connections, applies persistent systemd
and database start fences, stops/disables all classified scheduler-capable
units, and records bounded zero-session/transaction evidence. Only its accepted
receipt permits the later artifact switch.

`blue-green-cutover.sh switch` accepts a slot only after both instance units
are active and the loopback API SHA/migration plus exact Web BUILD_ID pass.
Active/enabled and HTTP alone are insufficient: it pins installed API/Web
template digests, rejects every drop-in, and attests effective identity,
ExecStart/EnvironmentFiles, final safety overlay, capability/network/filesystem
sandbox, exact NSS groups, safe PATH plus loader/Node/proxy/curl env scrub,
live InvocationID/MainPID/cgroup and exact loopback listener ownership. Pinned
nginx/preflight/readiness bytes and an in-cgroup non-loopback connect denial
(`EACCES`/`EPERM`) are mandatory; declarative properties alone are not accepted
as live no-egress evidence.
The same contract and unchanged invocation are rechecked during every watchdog
sample. It
first validates the real host config with the candidate include in a private
mount namespace, then atomically changes the link, requires `nginx -t`, gracefully reloads, and runs a
bounded public watchdog with three consecutive exact-identity successes. Any
failure restores the exact previous regular file and reloads it. It never
starts, unmasks or routes the fenced scheduler-capable legacy units.

The successful switch writes a root-only, schema-exact receipt with a monotonic
`GENERATION` and an atomic latest-generation index. The UTC timestamp in the
filename is metadata, never ordering authority. `rollback --receipt ...`
accepts only the latest unconsumed generation
and restores its exact previous target when the active link still matches the
record. A crash after accepted-receipt durability but before index replacement
is reconciled under the shared deployment lock only when exactly one newer,
schema-exact monotonic successor matches the live target, including after a
backward host-clock adjustment. Superseded or consumed receipts
have no rollback authority. Acceptance/recovery phase markers use a fsynced
whole-record temp and atomic replacement, never append-in-place; a torn temp
leaves the original exact intent authoritative and is reconciled under the same
lock. A pre-effect `.intent` is a separate crash-recovery
record. After
restoring/reloading, rollback must additionally receive HTTP success from
`https://api.leetplus.ru/health` and `https://leetplus.ru/`; lack of network
evidence leaves the exact link and old processes restored but reports failure.
Keep the scheduler-free N-1 pair hot until the explicit acceptance/soak period
ends; the old scheduler-capable pair remains durably fenced and drained.
Handled termination runs an EXIT rollback guard. An unhandled `SIGKILL` or host
loss leaves the durable `.intent`: the pre-nginx recovery unit restores and
validates N-1 without submitting a recursive nginx job, while the independent
post-start timer starts/reloads nginx if needed, confirms public serving and
archives the intent. Nginx requires the pre-start unit; a new switch rejects any
outstanding intent.

Production invocation is intentionally fully pinned:

```bash
sudo /usr/local/sbin/leetplus-blue-green-cutover switch \
  --slot blue \
  --release-sha <exact-40-character-sha> \
  --expected-migration <exact-migration> \
  --expected-migration-count <count> \
  --expected-web-build-id <same-exact-40-character-sha> \
  --loopback-api-url http://127.0.0.1:4100 \
  --loopback-web-url http://127.0.0.1:3100 \
  --public-api-url https://api.leetplus.ru \
  --public-web-url https://leetplus.ru \
  --watchdog-seconds 30

sudo /usr/local/sbin/leetplus-blue-green-cutover rollback \
  --receipt /var/lib/leetplus/deploy-receipts/<exact-intent-or-receipt>
```

For `green`, the only permitted loopback pair is `4200/3200`.
