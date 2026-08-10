# CURRENT187-C read-only PostgreSQL acquisition adapter

| Поле                    | Значение                                                                         |
| ----------------------- | -------------------------------------------------------------------------------- |
| Slice                   | `CURRENT187_C_READ_ONLY_POSTGRES_ACQUISITION_ADAPTER`                            |
| Predecessor             | CURRENT187-A authority contract и CURRENT187-B pure planner                      |
| Статус                  | `NONCANONICAL / PRE-GREEN / DENY-ONLY / NOT DEPLOYABLE`                          |
| Runtime profile         | только explicit loopback `NODE_ENV=test`, `environment=ci`, база `*_ci`/`*_test` |
| Production target       | неизменно `CURRENT179/179`                                                       |
| Внешний тестовый доступ | `NO-GO`                                                                          |

## Что реализовано

Adapter выполняет bounded acquisition в следующем порядке:

1. Открывает отдельную сессию scanner identity и запускает
   `REPEATABLE READ READ ONLY` с локальными `statement_timeout` и
   `lock_timeout`.
2. Читает `system_identifier`, PostgreSQL/control/catalog version, фактические
   `SESSION_USER`/`CURRENT_USER`, адрес и порт backend.
3. Снимает первый полный `pg_database` snapshot, включая templates и все
   non-template databases.
4. До per-DB scan сравнивает universe с exact baseline. Unknown/missing DB
   прекращает acquisition до дальнейших подключений.
5. Подключается настоящим LOGIN scanner отдельно к каждой connectable
   allowlisted non-template БД.
6. В одной read-only snapshot transaction снимает и хеширует 24 catalog
   surfaces.
7. Повторно читает cluster identity и полный `pg_database` universe.
8. Передаёт два снимка и per-DB evidence в CURRENT187-B. OID/owner/locale/
   `datallowconn` drift, partial evidence и временные ошибки дают deny.

Scanner обязан быть exact `LOGIN` без `SUPERUSER`, `CREATEDB`, `CREATEROLE`,
`REPLICATION` и `BYPASSRLS`. Фактический backend обязан быть loopback. Remote,
production, system database, неверное подтверждение или отсутствующий
`NODE_ENV=test` отклоняются до первого подключения.

## Catalog coverage

Per-database digest включает:

- все non-system роли, их атрибуты и настройки;
- direct membership и effective `MEMBER`/`USAGE`/`SET` graph;
- owner dependencies из `pg_shdepend`;
- database, schema, relation, column, type, routine и default ACL через
  `aclexplode`, включая `PUBLIC`, grantor и grant option;
- effective privileges всех non-system roles на database/schema/relation/
  sequence/column/type/routine;
- relations, columns, defaults/generated/identity, sequences, types/domains;
- view/partition/index, routine/aggregate, trigger и constraint definitions;
- `relrowsecurity`, `relforcerowsecurity` и exact RLS policy expressions;
- extensions и extension-owned objects;
- role/database settings и session-affecting configuration.

Raw rows и definitions существуют только внутри bounded acquisition и не
попадают в receipt. Receipt содержит domain-separated SHA-256 digests, counts
и безопасные reason codes. Password, URL, email, token, ciphertext, provider
payload, database/role names и `system_identifier` не отражаются наружу.

## Неизменная deny-only граница

Даже успешный `acquisitionStatus=ACQUIRED` означает только, что read-only
evidence получен и CURRENT187-B не нашёл расхождений:

```text
authorization=false
canMutate=false
canSend=false
testAccessAuthorized=false
sharedBetaAccess=false
productionRootEnrolled=false
externalDdlFenceAttested=false
topologyExternallyAttested=false
```

Adapter намеренно принимает только
`CURRENT187_EXTERNAL_DDL_FENCE_DECLARATION_V1` со статусом
`DECLARED_UNVERIFIED`. Он не захватывает advisory/DDL lock и не выдаёт
attestation за внешнюю инфраструктуру. После завершения acquisition отдельный
CURRENT187-D verifier может приложить только independently signed branded
receipt, exact-bound к `acquisitionDigest`, database universe, финальному
snapshot, fence epoch/state и release policy. Исходный receipt остаётся
неизменным; новый receipt сохраняет predecessor digest и все deny-флаги.

## Проверки

Unit gate:

```powershell
$env:NODE_ENV='test'
pnpm --filter database check:identity-mail-cluster-acquisition-current187
```

Отдельная opt-in PostgreSQL 16 acceptance создаёт две disposable БД и
least-privilege scanner role, сканирует весь non-template universe и проверяет
zero database/role/session residue:

```powershell
$env:NODE_ENV='test'
$env:IDENTITY_MAIL_CLUSTER_ACQUISITION_CURRENT187_PG_E2E_CONFIRM='run-current187-read-only-cluster-acquisition-postgres-e2e'
pnpm --filter database test:integration:identity-mail-cluster-acquisition-current187:pg
```

Test harness может выполнять fixture `CREATE/DROP` только в подтверждённом
loopback `*_ci`/`*_test` cluster. Сам acquisition adapter исполняет только
`BEGIN ... READ ONLY`, `SET LOCAL`, catalog `SELECT/WITH`, `COMMIT` и аварийный
`ROLLBACK`.

## CURRENT187-F: stable signed policy binding

Acquisition дополнен стабильными scoped fingerprints для role bindings,
current ACL, default ACL и полного per-database catalog. В отличие от
операционного scan evidence они не включают timestamps и transport evidence.
Новый pure evaluator принимает только branded acquisition с independently
signed DDL-fence receipt и branded purpose-bound deployment envelope, после
чего сравнивает exact cluster/database/live-scan/fence/policy bindings.

Результат `BINDINGS_MATCHED` остаётся deny-only. Он не анализирует, безопасно ли
само содержимое catalog, не потребляет deployment GO и не является production
runtime attestation. Контракт и оставшиеся ограничения описаны в
[CURRENT187-F signed cluster policy binding](./identity-mail-current187-signed-policy-binding.md).

## CURRENT187-G: semantic risk facts

Acquisition теперь перед удалением raw catalog rows передаёт двенадцать exact
canonical role/ACL surfaces в pure extractor. Наружу выходят только counts и
category digests; raw names/OID/settings/identities в receipt не попадают.
Per-database semantic digest агрегируется planner и входит в
`clusterCatalogDigest`, уже связанный CURRENT187-F с signed envelope.

Это только факты, а не allowlist: `policyAllowlistEvaluated=false`, решение
safe/GO отсутствует. Полный контракт:
[CURRENT187-G semantic risk facts](./identity-mail-current187-semantic-risk-facts.md).

## Оставшиеся блокеры CURRENT187

1. Persisted consumption/revocation CURRENT187-D, production root enrollment
   и реальный host-side executor запрета migration/creator LOGIN и
   cluster/database DDL. Synthetic signed verifier уже реализован deny-only.
2. Host/control-plane HBA evidence, TLS peer, pooler mapping/reload epoch и
   correlated positive/negative network probes.
3. Signed allowlist/baseline и append-only consumption/revocation ledger;
   текущий baseline остаётся caller input и поэтому receipt deny-only.
4. Hostile PostgreSQL matrix: unknown third DB во время scan, drop/recreate,
   non-connectable DB, second-DB ACL/default-ACL drift, fault injection и
   повторный zero-residue proof.
5. Independently approved signed semantic allowlist и fail-closed evaluator
   поверх risk facts CURRENT187-G. Извлечение privileged role attributes,
   memberships, ownership, current/default ACL и effective privileges уже
   реализовано deny-only, но semantic approval намеренно отсутствует.
6. Provider mark/complete recovery, outbound kill-switch evidence и
   production-like apply/rollback/emergency rehearsal.

До закрытия этих пунктов и остальных launch gates production, текущие четыре
клуба одной сети, tester account и owner invite не изменяются.
