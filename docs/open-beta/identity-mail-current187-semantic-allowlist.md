# CURRENT187-H: independently signed semantic allowlist

## Статус

`ENGINEERING ACCEPTED / DENY-ONLY / NONCANONICAL / NOT DEPLOYABLE`.

Exact implementation `e91b641fe305e4fc9cc8224c22d561874df96827` принят GitHub
Actions run `31403020215`: `3/3 SUCCESS`. SHA-bound artifact digest —
`sha256:94eb8908abaa68075c19ebce90f4b4bb0eac79d1bd026577a4b33f4da14c61b7`.
Подробное evidence:
[CURRENT187-H CI](./identity-mail-current187-h-ci-evidence-2026-08-10.md).

CURRENT187-H реализует вторую половину semantic boundary: независимо
подписанный документ разрешённого состояния сравнивается с exact secret-free
risk facts CURRENT187-G. Совпадение даёт только `MATCHED_DENY_ONLY` и позволяет
CURRENT187-F подтвердить `BINDINGS_MATCHED`; оно не является deployment GO,
production authority или разрешением тестового доступа.

Production, текущий `Tenant A/Store A1..A4`, внешний тестер, account, пароль и
invite этим slice не изменялись.

## Граница доверия

Для semantic approval введён четвёртый независимый Ed25519 purpose domain:

- purpose: `CURRENT187_SEMANTIC_ALLOWLIST_APPROVAL_V1`;
- profile: отдельный semantic-allowlist authority profile;
- exact binding: `clusterIdentityDigest`, `databaseUniverseDigest`,
  `environment`, `reviewEvidenceDigest`, `semanticAllowlistDocumentDigest`,
  `semanticRiskFactsDigest`;
- production environment обязателен;
- production registry остаётся frozen-empty до отдельного reviewed root
  enrollment.

Ключ semantic approval не заменяет root-enrollment или deploy-GO ключи и не
может подписывать их purpose domains.

## Документ allowlist

Документ является secret-free exact data-only структурой. Он связывает:

- contract/schema/kind/profile/slice и `policyRevision`;
- exact cluster identity и database universe;
- digest независимо проверенного review evidence;
- exact digest semantic risk facts CURRENT187-G;
- canonical `approvedAt` и `validUntil` с максимальным сроком 90 дней.

Digest документа имеет отдельный domain separator. Неизвестные поля, Proxy,
accessor, неканоническое время, неверный срок или несовпадающий digest
отклоняются fail-closed.

## Evaluator

Evaluator принимает только:

1. process-branded receipt cluster planner;
2. process-branded independently verified semantic authority receipt;
3. exact allowlist document;
4. свежий canonical verification time.

Он повторно проверяет purpose/environment, digest документа, cluster identity,
database universe, semantic facts, review evidence и временное окно. Результат
— deeply frozen process-branded receipt со статусом:

- `MATCHED_DENY_ONLY`, если все exact bindings совпали;
- `DENIED`, если найдено любое расхождение.

Даже успешный receipt сохраняет все authority/effect flags false, включая
`deploymentGoConsumable=false`, `testAccessAuthorized=false` и
`sharedBetaAccess=false`.

## Связь с CURRENT187-F

`evaluateCurrent187ClusterPolicy` теперь требует третьим аргументом exact
branded semantic-allowlist receipt. `BINDINGS_MATCHED` невозможен, если receipt
не подтверждает тот же `semanticRiskFactsDigest`, `clusterIdentityDigest` и
`databaseUniverseDigest`. Clone/replay и drift facts/cluster/universe
отклоняются до любого deployment decision.

## Проверки

Локально приняты:

- admission authority: `13/13`;
- acquisition/risk-facts/allowlist/policy: `24/24`;
- DDL-fence authority: `11/11`;
- blocker/planner/refreeze/assembler: `13/13`, `18/18`, `17/17`, `21/21`;
- полный disposable CURRENT180–190 rehearsal: `163/163`.

Exact-SHA CI и SHA-bound artifact зафиксированы; это принимает H как
engineering foundation, но не меняет deny-only решение.

## Что остаётся

1. Persisted one-time consumption/revocation/expiry/replay для semantic
   approval, отдельно от DDL-fence ledger.
2. Независимый latest-byte security review без P0/P1.
3. Production root enrollment и отдельный deploy GO.
4. Host-side DDL fence executor, TLS/HBA/pooler/service-account/runtime
   attestation и infrastructure/provider recovery closure.
5. Canonical promotion и production-like restored-copy
   apply/repeat/rollback/zero-diff rehearsal.
6. Только после остальных Gate 1MT/Gate 2 условий — создание отдельного
   `Tenant B/Store B1` и mailbox-bound OWNER invite.
