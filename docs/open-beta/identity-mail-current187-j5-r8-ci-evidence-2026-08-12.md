# CURRENT187-J5-R8 exact-SHA CI evidence

Дата приёмки: 12.08.2026.

Статус: `ACCEPTED / ACTUAL J4 MTLS / NO PRODUCTION EFFECT / NOT DEPLOYABLE`.

## Release identity

- commit: `8917cd4b14f7b015c9512f18bdc6304bf43b74f8`;
- branch: `codex/open-beta-hardening`;
- workflow: `CI`;
- run: [`31624262449`](https://github.com/boozik3412/leetplus/actions/runs/31624262449);
- conclusion: `3/3 SUCCESS`;
- completed: `2026-08-12T18:01:22Z`.

## SHA-bound artifact

- artifact ID: `9152790153`;
- name: `leetplus-release-8917cd4b14f7b015c9512f18bdc6304bf43b74f8`;
- digest:
  `sha256:101e956ba192dd46cc6065043f78961bff875a3402c7932bf1e9035b73504cca`;
- size: `16,275,601` bytes;
- expiry: `2026-09-11T17:56:19Z`;
- expired at acceptance: `false`.

## Accepted actual evidence

The PostgreSQL job created a one-run CA and separate server/client certificates,
enabled TLS on the disposable PostgreSQL service, and started PgBouncer 1.22.0
with client and server `verify-full`.

Target TAP executed without skip:

- actual public J4 collector returned a strict production-origin receipt;
- application login was denied access to the PgBouncer admin console;
- a TLS client without a client certificate was rejected;
- result: `3 tests / 3 pass / 0 fail / 0 skipped`.

The receipt assertion excludes client certificate/key PEM, their raw SHA-256,
fixture usernames/passwords and database name. PgBouncer observed TLS 1.3 from
the client and established TLS 1.3 to PostgreSQL. Every later step in the same
PostgreSQL job also passed, including mail/provider, identity, tenant shell,
activation, AccessScope, assortment, team-chat and CRM isolation checks.

Application checks and Authority root trust gate both completed `SUCCESS`.

## Failed-run audit trail

Four predecessor runs are negative diagnostics and are not acceptance evidence:

- `31619118015` (`cae1a205…`): ambient `PGOPTIONS` reached PgBouncer readiness;
- `31620377877` (`bdddabcd…`): missing explicit digest-helper mode argument;
- `31621608778` (`eabcae29…`): production loopback-host guard correctly denied;
- `31622898891` (`c4c4663b…`): immutable TLS options exposed an actual
  node-postgres adapter incompatibility.

The accepted successor removes `PGOPTIONS` only at the PgBouncer boundary,
uses a temporary restored hostname mapping without weakening the production
loopback guard, and copies immutable internal TLS fields to a fresh driver-owned
options record.

## Deliberate non-claim

R8 proves actual J4 only. It does not yet gather strict J1/J2 for four service
purposes plus J3/J4 in one process and does not feed that chain into the
production connection-probe runner. Protected production signer/key/root,
canonical ledger/runtime roles and restored-copy apply/rollback/zero-diff remain
mandatory.

Production, current four-club network, external tenant/tester, invites and
providers were not changed. External beta access remains `NO-GO`.
