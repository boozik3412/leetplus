# CURRENT187-J5-R4 — exact-SHA CI evidence

Дата приёмки: 12.08.2026.

Статус: `EXACT-SHA CI ACCEPTED / SYNTHETIC DENY-ONLY / NOT DEPLOYABLE`.

## Принятый исходный код

- commit: `5fca5a9d1007e21b03b81fa5da29b52a042d6611`;
- branch: `codex/open-beta-hardening`;
- GitHub Actions run:
  [31609394804](https://github.com/boozik3412/leetplus/actions/runs/31609394804);
- результат: `3/3 SUCCESS` — `Authority root trust gate`, `Application checks`,
  `PostgreSQL migration smoke`.

## SHA-bound artifact

- name: `leetplus-release-5fca5a9d1007e21b03b81fa5da29b52a042d6611`;
- artifact ID: `9146866153`;
- digest:
  `sha256:396d7e78d13eb15691e3ff917335e9321d6a0618c8c934c3a9d1b595f174dce1`;
- expiration: `2026-09-11T15:04:30Z`;
- на момент приёмки `expired=false`.

## Принятые проверки

Application checks подтвердили:

- database typecheck;
- aggregate CURRENT187 acquisition gate, включающий syntax и `121/121` tests;
- immutable CURRENT180–CURRENT190 refreeze proposal;
- frozen in-memory CURRENT180–CURRENT190 assembler;
- полный API/web lint, test, typecheck и build pipeline;
- создание и загрузку SHA-bound release artifact.

PostgreSQL migration smoke подтвердил полный disposable migration/rehearsal
pipeline. Целевой шаг
`Verify CURRENT187 persisted connection probe ledger replay, scoped revocation and expiry races`
завершился `SUCCESS` с `2026-08-12T15:08:58Z` по `2026-08-12T15:09:03Z`.

Локальная приёмка exact committed bytes перед push:

- J5 verifier/runner/signer/ledger/R4: `42/42 PASS`;
- aggregate CURRENT187 acquisition: `121/121 PASS`;
- admission authority: `13/13 PASS`;
- immutable refreeze: `17/17 PASS`;
- frozen assembler: `21/21 PASS`;
- database typecheck и scoped Prettier: `PASS`.

## Граница результата

R4 принят только как отдельный branded successor receipt рядом с неизменным
deploy authority. Он связывает persisted J5 и verified deploy authority по
release/cluster/database-universe и переносит точные probe digests, но всегда
возвращает:

- `authorization=false`;
- `canApply=false`;
- `canMutate=false`;
- `canSend=false`;
- `deploymentGoConsumable=false`;
- `productionBindingSatisfied=false`;
- `testAccessAuthorized=false`;
- `sharedBetaAccess=false`.

CURRENT187-F ещё не требует R4; production roots frozen-empty, ledger
noncanonical, production-like four-service execution и key ceremony не
выполнены. Production, текущая сеть из четырёх клубов, внешний tenant/tester,
invites и providers не изменялись. Внешний тестовый доступ остаётся `NO-GO`.
