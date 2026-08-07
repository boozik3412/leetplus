# CURRENT187 cluster/application admission threat model

| Поле              | Значение                                                          |
| ----------------- | ----------------------------------------------------------------- |
| Contract          | `CURRENT187_CLUSTER_APPLICATION_ADMISSION_V1`                     |
| Slice             | `CURRENT187-A / PRE_GREEN_AUTHORITY_CONTRACT_ONLY`                |
| Predecessor       | принятый и refrozen CURRENT186                                    |
| Статус            | `DESIGN_FROZEN_FOR_PURE_VERIFIER / NONCANONICAL / NOT_DEPLOYABLE` |
| Production target | неизменно `CURRENT179/179`                                        |
| Test access       | `NO-GO`                                                           |

## Что защищаем

CURRENT187 должен доказать, что один immutable release подключается к одному
exact PostgreSQL cluster через ожидаемые application/migration/creator/owner/
scanner/coordinator/worker identities и не получает неучтённую authority ни в
одной non-template database, HBA/pooler route либо future default ACL.

Каждый pre-Green результат обязан оставаться deny-only:

```text
authorization=false
canMutate=false
canSend=false
testAccessAuthorized=false
sharedBetaAccess=false
productionRootEnrolled=false
```

Успешный pure verifier не является persisted GO, root enrollment, deployment,
SMTP permission, tenant provisioning или owner invite.

## Trust domains

Назначения криптографически разделены и не взаимозаменяемы:

1. `CURRENT187_PRE_GREEN_ROOT_BOOTSTRAP_REHEARSAL_V1` — synthetic root только
   для exact loopback CI/disposable context;
2. `CURRENT187_PRODUCTION_ROOT_ENROLLMENT_GO_V1` — первоначальный production
   enrollment, подписанный независимым offline bootstrap authority;
3. `CURRENT187_PRODUCTION_DEPLOY_GO_V1` — отдельный deployment GO, связанный с
   уже persisted enrollment receipt и fresh live scan;
4. отдельный revocation/retirement domain для enrolled roots.

Технический DDL fence использует ещё один независимый purpose/trust domain:
`CURRENT187_TECHNICAL_DDL_FENCE_ATTESTATION_V1`. Его production registry также
frozen-empty; synthetic root разрешён только exact loopback CI и не
взаимозаменяем с application/scanner authority.

Production registries в pre-Green коде frozen-empty. Caller, environment,
config file, database row общего назначения, prototype chain или mutable export
не могут добавить root. Первое наполнение offline bootstrap registry возможно
только отдельным reviewed immutable release artifact после Engineering Green.

## Границы доверия

- Pure verifier принимает только exact data-only records, canonical JSON,
  SHA-256 digests, Ed25519 signatures, bounded timeline и purpose-bound
  key/fingerprint. Getter, proxy, symbol, custom prototype, extra/missing key и
  non-canonical value отклоняются.
- Verified values получают непереносимый WeakSet brand; shallow/deep clone не
  сохраняет доверие.
- Synthetic verification разрешён только при exact `NODE_ENV=test`,
  `environment=ci`, loopback endpoint и non-production database name с
  `_ci|test`. Он никогда не обращается к БД, сети, Prisma, Nest, provider либо
  secret manager.
- Persisted one-time consumption, nonce uniqueness, revocation и lost-response
  replay не заявляются до отдельного append-only PostgreSQL ledger slice.
- CURRENT187-D до ledger обеспечивает только bounded process-local replay:
  byte-exact envelope возвращает тот же receipt, а reuse operation/nonce с
  другим envelope fail-closed. Receipt сохраняет
  `persistedConsumptionVerified=false`.

## Основные угрозы и fail-closed ответ

| Угроза                                    | Обязательный ответ                                                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Root self-enrollment/рекурсия             | initial enrollment GO проверяет отдельный offline bootstrap authority, а не enroll-имые ключи                        |
| Purpose confusion                         | разные domains/payload schemas; подпись bootstrap/enrollment/deploy/revoke не переносится                            |
| Caller/env root injection                 | frozen-empty production registries и отсутствие runtime setter/config path                                           |
| Replay либо lost response                 | до ledger — deny-only; после ledger — unique operation/nonce/envelope и byte-exact receipt replay                    |
| Подмена cluster                           | pin `system_identifier`, version/control/catalog identity, topology и endpoint digest                                |
| Скрытая вторая БД                         | два cluster snapshots под DDL fence и scan всех non-template databases                                               |
| DDL race между scan и consume             | technical fence epoch, disabled migration/creator principals, fresh scan перед consume                               |
| Role-name reuse                           | exact name+OID+attributes+membership/ownership/default-ACL binding                                                   |
| `SET ROLE` вместо настоящего identity     | actual TCP/TLS LOGIN и exact backend `SESSION_USER/CURRENT_USER`                                                     |
| HBA/pooler ambiguity                      | external host/control-plane attestation, reload epoch, correlated audit/log evidence и positive/negative probes      |
| Default `PUBLIC EXECUTE` будущих routines | exact creator-scoped `pg_default_acl` policy и live creator fixture                                                  |
| Неполный catalog                          | full columns/default/generated/identity/RLS plus routine/trigger/constraint/index definitions; unread surface = deny |
| Unknown grantee/owner/membership          | all-grantee direct/effective expansion и deny любого неразрешённого edge                                             |
| Provider ambiguous handoff                | отдельный provider mark/complete replay и kill-switch evidence; иначе `canSend=false`                                |
| Receipt с PII/secret                      | запрет email, URL, password, token, ciphertext, provider payload и secret material в result/log/audit                |

## Роли ceremony

Allowlist различает как минимум application runtime, migration executor, object
creator, database/deployment owner, admission scanner, identity-mail owner,
coordinator и worker. Scanner read-only и не совпадает с mutating principals.
CURRENT186 privileged apply требует прямой bounded session database owner;
`SET ROLE` и membership не заменяют его. После ceremony временная LOGIN/
authority отзывается по подписанному плану.

## Pre-Green acceptance

До любого database candidate pure slice обязан доказать:

- frozen-empty production roots и невозможность caller/env injection;
- three-purpose cross-use denial;
- strict shape/prototype/getter/proxy/symbol rejection;
- Ed25519/fingerprint/digest/nonce/timeline mutation matrix;
- exact loopback-CI synthetic allow и production/remote/system-DB denial;
- шесть неизменных deny flags и отсутствие PII/secret;
- отсутствие Prisma/Nest/database/network/SMTP/provider I/O по source scan;
- потерю brand у клона verified result.

Затем отдельные slices реализуют persisted ledger, cluster scanner, external
HBA/pooler attestor, DDL fence, hostile multi-DB PostgreSQL acceptance и
production-like rehearsal. Ни один из них сам по себе не разрешает внешний
тест: `SHARED BETA GO` остаётся отдельным launch gate после Gate 1MT и Gate 2.

Production, четыре клуба одной текущей сети и внешний тестер этим документом
не изменяются.
