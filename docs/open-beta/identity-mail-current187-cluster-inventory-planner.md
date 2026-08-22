# CURRENT187-B pure cluster inventory planner

| Поле                    | Значение                                                |
| ----------------------- | ------------------------------------------------------- |
| Slice                   | `CURRENT187_B_PURE_CLUSTER_INVENTORY_PLANNER_ONLY`      |
| Predecessor             | CURRENT187-A pure authority contract                    |
| Статус                  | `NONCANONICAL / PRE-GREEN / DENY-ONLY / NOT DEPLOYABLE` |
| Production target       | неизменно `CURRENT179/179`                              |
| Внешний тестовый доступ | `NO-GO`                                                 |

## Реализованная граница

CURRENT187-B — чистая функция нормализации и планирования. Она принимает уже
собранные data-only evidence, не открывает соединения и не читает файловую
систему, окружение, Prisma, Nest, provider или secret manager.

Планировщик:

- pin-ит digest `system_identifier`, версии PostgreSQL/control/catalog,
  topology и endpoint;
- требует exact baseline всех non-template databases и отдельный exact
  baseline templates;
- не разрешает пропустить `postgres` либо служебную non-template БД по имени,
  prefix или owner;
- сравнивает initial/final cluster snapshots по name, OID, owner name/OID,
  `datallowconn`, connection limit, encoding и locale/provider;
- требует ровно одно scan-evidence для каждой non-template БД;
- считает unknown/missing database, partial snapshot/scan, unread connectable
  catalog, identity mismatch и concurrent catalog drift отказом;
- допускает non-connectable non-template БД только когда она явно присутствует
  в baseline с `datallowconn=false` и имеет отдельное
  `NON_CONNECTABLE_PROVEN` evidence;
- нормализует порядок записей и выпускает domain-separated SHA-256 digests;
- не возвращает database/owner/system identifier в receipt и сохраняет шесть
  deny-флагов.

Даже при `inventoryStatus=MATCHED` receipt утверждает только совпадение чистой
проекции:

```text
authorization=false
canMutate=false
canSend=false
testAccessAuthorized=false
sharedBetaAccess=false
productionRootEnrolled=false
liveClusterScanVerified=false
externalDdlFenceAttested=false
```

Malformed shape, getter, proxy, symbol, sparse/oversized array и production
discriminator отклоняются исключением. Семантические расхождения возвращают
immutable branded receipt с безопасными reason codes, без отражения входных
идентификаторов.

## Что этот slice намеренно не доказывает

CURRENT187-B сам по себе не является live scanner. CURRENT187-C теперь
формирует его exact input через два `pg_database` snapshot, отдельные реальные
LOGIN-подключения и full catalog projection в loopback disposable PostgreSQL.
CURRENT187-D добавил post-acquisition integration: только independently signed,
WeakSet-branded receipt с exact acquisition/universe/final-snapshot/fence
binding может изменить `externalDdlFenceAttested` на `true`. Caller boolean,
clone или receipt от другого acquisition отклоняется. Поэтому незакрыты:

1. persisted consumption/revocation независимой DDL-fence attestation и
   production root enrollment;
2. TLS, HBA, pooler и service-account mapping attestation;
3. signed baseline и policy evaluator поверх полученных catalog digests;
4. hostile multi-database PostgreSQL matrix с concurrent create/drop/recreate,
   ACL/default-ACL drift и fault injection;
5. подписанная authority/ledger consumption, provider recovery и
   production-like rehearsal.

Реализация acquisition и её отдельная PG acceptance описаны в
`identity-mail-current187-read-only-cluster-acquisition.md`, а независимый
fence verifier — в
`identity-mail-current187-independent-ddl-fence-attestation.md`. До всей CURRENT187
Definition of Green production, текущие четыре клуба одной сети, внешний
tester account и invite не изменяются.

## Проверка

```powershell
pnpm --filter database check:identity-mail-cluster-inventory-current187-planner
```

CI запускает этот gate непосредственно после CURRENT187-A authority contract.
