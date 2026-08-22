# CURRENT187-F: signed cluster policy binding

## Статус

`ENGINEERING ACCEPTED / PRE-GREEN / DENY-ONLY / NONCANONICAL / NOT DEPLOYABLE`.

CURRENT187-C уже получает read-only multi-database catalog evidence, но его
операционный `scanEvidenceDigest` включает время и backend evidence. Такой digest
нельзя использовать как стабильный baseline для repeat scan. CURRENT187-F
добавляет отдельную стабильную fingerprint-проекцию и связывает её с
purpose-bound `CURRENT187_PRODUCTION_DEPLOY_GO_V1` envelope.

Production roots остаются frozen-empty. Этот slice не выполняет enrollment,
consumption, database mutation, network probe, provider call, route activation,
создание tenant/user или отправку invite.

## Реализованная граница

Для каждой connectable non-template database acquisition теперь отдельно
вычисляет:

- полный `catalogDigest` по всем 24 поверхностям;
- `roleBindingsDigest` по roles, memberships, role/database settings,
  ownership и effective privileges;
- `currentAclPolicyDigest` по database/schema/relation/column/type/routine ACL
  и effective privileges;
- `defaultAclPolicyDigest` по полной `pg_default_acl` projection.

Planner строит отсортированные cluster-wide digests:

- `perDatabaseCatalogDigest`;
- `roleBindingsDigest`;
- `currentAclPolicyDigest`;
- `defaultAclPolicyDigest`;
- `clusterCatalogDigest`.

Они включают pseudonymous `databaseIdentityDigest`, но исключают timestamps и
transport `scanEvidenceDigest`. Поэтому exact повторный scan одинакового
catalog даёт те же policy fingerprints, а изменение соответствующей catalog
surface меняет только связанный scoped digest и полный catalog digest.

`evaluateCurrent187ClusterPolicy()` принимает только:

1. process-branded acquisition receipt с независимо подписанным DDL-fence
   attestation;
2. process-branded purpose-bound deployment authority receipt.

Он сравнивает cluster identity, database universe, live acquisition, DDL-fence
attestation и все четыре policy/catalog fingerprints. Clone, JSON replay,
другая purpose authority или drift дают fail-closed reject/deny.

Положительный результат называется `BINDINGS_MATCHED`, но всё равно содержит:

```text
authorization=false
canMutate=false
canSend=false
deploymentGoConsumable=false
persistedConsumptionVerified=false
productionRootEnrolled=false
productionRuntimeAttested=false
testAccessAuthorized=false
sharedBetaAccess=false
```

## Что этот slice намеренно не доказывает

Fingerprint equality не является semantic allowlist evaluator. CURRENT187-F не
решает, безопасно ли конкретное содержимое `pg_roles`, ACL или default ACL; он
только доказывает, что signed envelope относится к exact read-only snapshot.
До Engineering Green всё ещё обязательны:

- semantic evaluator опасных role attributes, memberships, ownership,
  current/default ACL и system privilege baseline: deterministic secret-free
  risk-facts extraction уже реализован CURRENT187-G, но independently signed
  allowlist и решение safe/deny ещё отсутствуют;
- independently approved/persisted production allowlist и root enrollment;
- host-side DDL fence executor;
- actual TCP/TLS/HBA/pooler/service-account positive и negative probes;
- persisted deployment GO consumption/revocation и lost-response replay;
- hostile concurrent topology matrix;
- provider recovery/kill-switch и production-like rehearsal.

CURRENT187-J5-R4 уже добавляет отдельный synthetic deny-only successor receipt,
который связывает branded persisted connection-probe evidence с этим immutable
deploy authority по release/cluster/database-universe. CURRENT187-J5-R5 локально
композирует exact branded F и R4 receipts через общий authority payload digest,
не меняя CURRENT187-F или frozen deploy contract. R5 остаётся synthetic
deny-only и не снимает ни один production gate.

## Локальная проверка

На текущем рабочем tree:

```powershell
pnpm --filter database check:identity-mail-cluster-inventory-current187-planner
pnpm --filter database check:identity-mail-cluster-acquisition-current187
pnpm --filter database check:identity-mail-ddl-fence-attestation-current187
```

Результат: planner `16/16`, acquisition/policy binding `15/15`, independent
DDL-fence authority `11/11`. Exact SHA
`b64abfe5c5d86a00ed657a96790a4395a11db21d` принят GitHub CI `31391874407`:
`3/3 SUCCESS`; SHA-bound artifact digest —
`sha256:e623fd73130d8a3fc52e3d350b9ff2f50dd87a2e65321465a21369e2a974d51d`.
Полное evidence: [CURRENT187-F CI](./identity-mail-current187-f-ci-evidence-2026-08-10.md).

Production, `Tenant A/Store A1..A4`, внешний tester, account, password и invite
не изменялись.
