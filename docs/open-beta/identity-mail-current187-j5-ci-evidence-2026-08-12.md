# CURRENT187-J5 signed matrix exact-SHA CI evidence — 12.08.2026

Статус: `EXACT-SHA CI ACCEPTED / SYNTHETIC SIGNED CONTRACT / DENY-ONLY / NOT DEPLOYABLE`.

## Принятый candidate

- exact commit SHA: `1ccc7b320e897cc9b1f63c2d0de1097b53f103d1`;
- branch: `codex/open-beta-hardening`;
- GitHub Actions run: `31594459396` (`run #128`);
- run URL: <https://github.com/boozik3412/leetplus/actions/runs/31594459396>;
- Authority root trust gate: `SUCCESS`;
- Application checks: `SUCCESS`;
- PostgreSQL migration smoke: `SUCCESS`;
- release artifact:
  `leetplus-release-1ccc7b320e897cc9b1f63c2d0de1097b53f103d1`;
- artifact ID: `9140727030`;
- artifact digest:
  `sha256:442f19bb2c2ad9786ac1a5f62e7d03425b5854359356dc6d095437f300addd97`.

## Что принято

Exact-SHA gate принимает independent Ed25519 verification contract для четырёх
service purposes и полной матрицы из 4 положительных и 32 отрицательных
outcomes. Проверены exact ordering, service identity separation, глобальная
уникальность negative evidence, release/cluster/universe/J3/J4/transcript
bindings, пятиминутная свежесть и fail-closed frozen-empty production root.

Локальная приёмка candidate до push: J5 `10/10 PASS`, aggregate CURRENT187
`89/89 PASS`, database typecheck и Prettier `PASS`.

## Граница доказательства

Этот run принимает verifier и synthetic signed payload contract, но не
production probe execution. Candidate не содержит production private key,
signer/HSM, enrolled public root, persisted one-time consumption/revocation или
CURRENT187-F/deploy binding. Все receipts сохраняют `authorization=false`,
`canMutate=false`, `canSend=false`, `productionRuntimeAttested=false`,
`testAccessAuthorized=false`, `sharedBetaAccess=false`.

Production, текущая сеть `Tenant A/A1..A4`, внешний tenant/tester, invites и
providers не изменялись. Внешний тестовый доступ остаётся `NO-GO`.
