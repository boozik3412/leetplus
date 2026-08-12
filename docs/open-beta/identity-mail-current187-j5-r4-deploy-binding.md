# CURRENT187-J5-R4: persisted probe → deploy authority binding

Дата фиксации: 12.08.2026.

Статус: `EXACT-SHA CI ACCEPTED / SYNTHETIC DENY-ONLY / NOT DEPLOYABLE`.

## Результат

J5-R4 добавляет отдельную fail-closed границу между branded persisted J5
consumption receipt и signed `CURRENT187_PRODUCTION_DEPLOY_GO_V1` authority.
Сам immutable deploy contract не меняется: binder выпускает отдельный branded
successor receipt, который переносит пять точных probe-полей:

- `connectionProbeEnvelopeDigest`;
- `connectionProbeMatrixDigest`;
- `connectionProbePersistedReceiptDigest`;
- `connectionProbePublicKeyFingerprint`;
- `connectionProbeVerificationReceiptDigest`.

Binder принимает только process-branded persisted J5 receipt и только branded
CURRENT187 authority receipt. Он связывает источники по `releaseSha`,
`clusterIdentityDigest` и `databaseUniverseDigest`, а затем включает все пять
J5-дайджестов и digest исходного authority payload в новый receipt. Scope drift
даёт `SCOPE_BINDING_DENIED` с точным reason code; clone любого входного receipt
отклоняется до вычисления результата. Неизменность старого deploy contract
дополнительно охраняется существующим refreeze manifest.

Matched receipt намеренно остаётся deny-only:

- `authorization=false`;
- `canApply=false`;
- `canMutate=false`;
- `canSend=false`;
- `deploymentGoConsumable=false`;
- `productionBindingSatisfied=false`;
- `productionRootEnrolled=false`;
- `productionRuntimeAttested=false`;
- `testAccessAuthorized=false`;
- `sharedBetaAccess=false`.

Текущий источник является synthetic CI receipt из noncanonical J5-R3 ledger,
поэтому успешный structural match имеет статус
`SCOPE_BOUND_DENY_ONLY`, а не production GO.

## Локальная приёмка

- J5 verifier/runner/signer/ledger/R4: `42/42 PASS`;
- aggregate CURRENT187 acquisition gate: `121/121 PASS`;
- admission authority contract: `13/13 PASS`;
- database typecheck: `PASS`;
- capability isolation: database/network/filesystem-write/process/env/tenant/
  invite/provider authority отсутствует.

Exact SHA `5fca5a9d1007e21b03b81fa5da29b52a042d6611` принят GitHub CI
`31609394804`: `3/3 SUCCESS`. SHA-bound artifact digest —
`sha256:396d7e78d13eb15691e3ff917335e9321d6a0618c8c934c3a9d1b595f174dce1`.
Полное evidence:
[CURRENT187-J5-R4 CI](./identity-mail-current187-j5-r4-ci-evidence-2026-08-12.md).

## Что этап не закрывает

R4 пока не потребляется CURRENT187-F policy evaluator и не является
deployment authority. Также не выполнены:

- actual branded production-like J1–J4 four-service execution;
- production key ceremony и OS ACL/KMS/HSM attestation;
- reviewed production public-root enrollment;
- canonical production persisted ledger и runtime role/grants;
- production restored-copy apply/rollback/zero-diff rehearsal;
- Gate 1MT, Gate 2 и protected `SHARED BETA GO`.

Production, `Tenant A/A1..A4`, внешний tenant/tester, invites и providers не
изменялись. Внешний тестовый доступ остаётся `NO-GO`.

## Следующий этап

1. Добавить R4 receipt как обязательный branded input successor policy после
   CURRENT187-F, сохранив legacy F deny-only и non-consumable.
2. Построить production-like branded J1–J4 rehearsal без production effects.
3. Только после независимой проверки и external key ceremony рассматривать
   canonical ledger/root enrollment и deploy GO.
