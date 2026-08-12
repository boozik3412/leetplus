# CURRENT187-J5-R3 PostgreSQL exact-SHA CI evidence — 12.08.2026

Статус: `EXACT-SHA CI ACCEPTED / NONCANONICAL POSTGRESQL CANDIDATE / DENY-ONLY / NOT DEPLOYABLE`.

## Принятый candidate

- exact commit SHA: `1f7ef47c13dc29001d9d6a893e21dfd5bdc6a284`;
- branch: `codex/open-beta-hardening`;
- GitHub Actions run: `31606012609`;
- run URL: <https://github.com/boozik3412/leetplus/actions/runs/31606012609>;
- Authority root trust gate: `SUCCESS`;
- Application checks: `SUCCESS`;
- PostgreSQL migration smoke: `SUCCESS`;
- обязательный шаг `Verify CURRENT187 persisted connection probe ledger replay, scoped revocation and expiry races`: `SUCCESS`;
- actual PostgreSQL test: `1/1 PASS`, `0` failed, duration `4.47s`;
- normalized candidate SQL SHA-256:
  `7b68fd84ae71e07cadcbb3740ad6a273a0f5a1b904bd9fdc62eaa2537a8cfe4c`;
- release artifact:
  `leetplus-release-1f7ef47c13dc29001d9d6a893e21dfd5bdc6a284`;
- artifact ID: `9145530091`;
- artifact digest:
  `sha256:0fc0908b5f5faebb43cce421110fa94101b7e3be97efa62678bc1a960ecc8972`;
- artifact expiry: `2026-09-11T14:29:07Z`.

## Что принято

Exact-SHA CI принял noncanonical PostgreSQL candidate и actual disposable
PostgreSQL acceptance harness. Проверены:

- exact unprivileged consumer, revoker и runtime role names/OID без membership;
- три append-only relation, `FORCE ROW LEVEL SECURITY` и owner-only policy;
- execute-only consume/revoke RPC и отсутствие table authority у duty roles;
- общий lock order `ROOT → ENVELOPE → MATRIX → OPERATION → NONCE`;
- byte-exact lost-response replay consumption и revocation receipt;
- конкурентный duplicate consume и consume/revoke race без deadlock;
- `ENVELOPE`, `MATRIX` и `ROOT` revocation scopes;
- freshness после ожидания lock для consume и revoke;
- отказ duplicate-key/reordered JSON, identity conflict и scope mismatch;
- запрет `UPDATE`, `DELETE` и `TRUNCATE` даже владельцу;
- cleanup одноразовой БД, трёх ролей и всех сессий с postflight
  `databases=0`, `roles=0`, `sessions=0`.

Локально для exact source приняты static candidate `7/7`, combined J5 `39/39`,
aggregate CURRENT187 `118/118`, database typecheck и diff checks.

## Граница доказательства

Candidate остаётся вне `prisma/migrations`, использует synthetic loopback CI
profile и не является canonical или production ledger. Он не содержит и не
разрешает:

- production key ceremony, OS ACL/KMS/HSM и reviewed public-root enrollment;
- production-like branded J1–J4 four-service execution;
- branded persisted J5 receipt binding в CURRENT187-F/deploy authority;
- production runtime-role enrollment и deploy GO;
- tenant activation, OWNER invite, tester account или provider effects.

Все authority/access/effect flags остаются false. Production, текущая сеть
`Tenant A/A1..A4`, внешний tenant/tester, invites и providers не изменялись.
Внешний тестовый доступ остаётся `NO-GO`.
