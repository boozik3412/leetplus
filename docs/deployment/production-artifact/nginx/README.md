# Atomic blue/green nginx routing

The active nginx configuration includes exactly one symlink:
`/etc/nginx/leetplus/active-upstreams.conf`. It initially targets a reviewed
`legacy.conf` (API `127.0.0.1:4000`, Web `127.0.0.1:3000`). Candidate slots use
different loopback ports. The live site proxies to the stable upstream names
`leetplus_api` and `leetplus_web`; it never embeds a candidate port directly.
For this first legacy-to-artifact cutover each candidate upstream also retains
the already-hot legacy port as nginx `backup`. New requests can therefore fall
back while the exact-identity watchdog rejects the failed candidate and restores
the legacy include. A future slot-to-slot release must generate the backup from
its exact reviewed N-1 slot; these first-cutover examples must not be reused
unchanged.

Install `active-upstreams.include.conf.example` once at nginx `http` scope,
with the active link already pointing to `legacy.conf`, then run `nginx -t`
and gracefully reload. This bootstrap must leave the legacy response unchanged
before any candidate is started.

`blue-green-cutover.sh switch` accepts a slot only after both instance units
are active and the loopback API SHA/migration plus exact Web BUILD_ID pass. It
first validates the real host config with the candidate include in a private
mount namespace, then atomically changes the link, requires `nginx -t`, gracefully reloads, and runs a
bounded public watchdog with three consecutive exact-identity successes. Any
failure restores the exact previous regular file
and reloads it. It never stops the old slot or legacy units.

The successful switch writes a root-only receipt. `rollback --receipt ...`
will restore that exact previous target only when the active link still points
to the receipt's activated target; a stale receipt cannot overwrite a later
deployment. A pre-effect `.intent` is also a valid crash-recovery record. After
restoring/reloading, rollback must additionally receive HTTP success from
`https://api.leetplus.ru/health` and `https://leetplus.ru/`; lack of network
evidence leaves the exact link and old processes restored but reports failure.
Keep the old processes hot until the explicit acceptance/soak period ends.
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
