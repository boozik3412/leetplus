# CURRENT187-J5-R1 exact-SHA CI evidence — 12.08.2026

Статус: `EXACT-SHA CI ACCEPTED / ACTUAL DISPOSABLE WIRE+TLS FIXTURE / DENY-ONLY / NOT DEPLOYABLE`.

## Принятый candidate

- exact commit SHA: `e4789e29e1072fe81d43d31543a53bb88afb7d7d`;
- branch: `codex/open-beta-hardening`;
- GitHub Actions run: `31597872402`;
- run URL: <https://github.com/boozik3412/leetplus/actions/runs/31597872402>;
- Authority root trust gate: `SUCCESS`;
- Application checks: `SUCCESS`;
- PostgreSQL migration smoke: `SUCCESS`;
- обязательный шаг `Verify CURRENT187 actual negative connection probe matrix`:
  `SUCCESS`;
- release artifact:
  `leetplus-release-e4789e29e1072fe81d43d31543a53bb88afb7d7d`;
- artifact ID: `9142149284`;
- artifact digest:
  `sha256:1fb76259ee66dd9b45219a6d8651ec0c1853dfb7583e3fd29a9d1731f3fdd85f`;
- artifact expiry: `2026-09-11T12:54:19Z`.

## Что принято

Exact-SHA CI принял capability-bearing runner contract и disposable actual
PostgreSQL wire/TLS harness. Проверены:

- process-local fail-closed binding четырёх J1/J2 service identities и общего
  J3/J4 control-plane evidence;
- 4 положительных receipt bindings;
- 20 реальных TCP connection attempts;
- 4 plaintext rejects;
- 16 PostgreSQL SSLRequest/TLS attempts;
- 8 post-handshake PostgreSQL error responses;
- 12 non-mutating stale-HBA/pool-mode/identity-collapse policy evaluations;
- exact isolation role/database/transport/CA/hostname dimensions;
- отсутствие URL, credentials, CA, host, database и raw error text в receipt;
- runner `10/10 PASS`, combined J5 `20/20 PASS`, integration `1/1 PASS`,
  aggregate CURRENT187 `99/99 PASS`, database typecheck и formatting `PASS`.

## Граница доказательства

Harness использует disposable PostgreSQL wire/TLS fixture и synthetic
test-context receipts. Он не является четырёхсервисной production-like
PostgreSQL/HBA/PgBouncer topology и не доказывает production J1–J4 chain.
Candidate не содержит и не включает:

- protected production signer/HSM и enrolled production public root;
- persisted one-time consumption/revocation, expiry/replay и lost-response
  reconciliation для J5;
- branded J5 receipt binding в CURRENT187-F/deploy authority;
- production-like restored-copy rehearsal и independent latest-byte review;
- production deployment, tenant activation, invite или provider send.

Все receipts сохраняют `authorization=false`, `canMutate=false`,
`canSend=false`, `productionRuntimeAttested=false`,
`testAccessAuthorized=false`, `sharedBetaAccess=false`.

Production, текущая сеть `Tenant A/A1..A4`, внешний tenant/tester, invites,
Langame/Telegram/SMTP providers и пользовательские данные не изменялись.
Внешний тестовый доступ остаётся `NO-GO`.
