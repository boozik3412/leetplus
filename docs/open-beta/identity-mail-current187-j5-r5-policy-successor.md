# CURRENT187-J5-R5: F + persisted probe policy successor

Дата фиксации: 12.08.2026.

Статус: `EXACT-SHA CI ACCEPTED / SYNTHETIC DENY-ONLY / NOT DEPLOYABLE`.

## Результат

R5 добавляет отдельный pure successor policy поверх двух уже существующих
неизменяемых границ:

1. exact process-branded CURRENT187-F cluster-policy receipt;
2. exact process-branded CURRENT187-J5-R4 persisted-probe binding receipt.

Successor требует успешные deny-only статусы обоих receipts и точное совпадение
их `sourceAuthorityPayloadDigest`. Поэтому persisted J5 evidence нельзя
скомбинировать с CURRENT187-F evaluation, построенным для другого подписанного
deploy authority, даже если release, cluster и database universe совпадают.

Plain clone, Proxy и неверная arity отклоняются до чтения caller-controlled
полей. Разные branded authority payloads дают
`CURRENT187_CLUSTER_POLICY_SUCCESSOR_AUTHORITY_MISMATCH` и
`SUCCESSOR_BINDINGS_DENIED`.

Успешная композиция имеет статус
`SUCCESSOR_BINDINGS_MATCHED_DENY_ONLY`, но неизменно сохраняет:

- `authorization=false`;
- `canApply=false`;
- `canMutate=false`;
- `canSend=false`;
- `deploymentGoConsumable=false`;
- `productionBindingSatisfied=false`;
- `productionRootEnrolled=false`;
- `productionRuntimeAttested=false`;
- `testAccessAuthorized=false`;
- `sharedBetaAccess=false`;
- `syntheticOnly=true`.

CURRENT187-F, R4 и frozen deploy authority не изменяются задним числом. R5 не
имеет database, network, filesystem, process, environment, tenant, invite или
provider capabilities.

## Локальная приёмка

- acquisition/policy suite: `21/21 PASS`;
- aggregate CURRENT187: `124/124 PASS`;
- database typecheck: `PASS`;
- immutable refreeze: `17/17 PASS`;
- frozen assembler: `21/21 PASS`;
- scoped Prettier и `git diff --check`: `PASS`.

Exact SHA `603e09bf4598fe895053d3b05416f921eb75ddc3` принят GitHub Actions
run `31612439527`: все `3/3` jobs завершены `SUCCESS`. Artifact ID
`9148162637`, digest
`sha256:d1fe9df4ff02d6ecc900eb6c68b920aaa93b931cf1f8bf21646262c5c4f68a11`.
Полная фиксация: [R5 CI evidence](./identity-mail-current187-j5-r5-ci-evidence-2026-08-12.md).

## Что этап не закрывает

R5 принимает только synthetic/noncanonical J5-R4 и потому не является
production policy или deployment GO. Обязательны:

- actual branded production-like J1–J4 execution для четырёх service paths;
- external key ceremony и OS ACL/KMS/HSM attestation;
- reviewed production root enrollment;
- canonical J5 ledger, execute-only roles/grants и runtime attestation;
- production restored-copy apply/rollback/zero-diff rehearsal;
- Gate 1MT, Gate 2 и отдельный protected `SHARED BETA GO`.

Production, текущая сеть из четырёх клубов, внешний tenant/tester, invites и
providers не изменялись. Внешний тестовый доступ остаётся `NO-GO`.

## Следующий этап

Построить production-like branded four-service rehearsal без production
effects. После независимой проверки результата отдельно провести key ceremony,
canonical ledger/root enrollment и restored-copy rehearsal.
