# CURRENT192 atomic Langame initial-sync execution

Статус: `IMPLEMENTED LOCALLY / DORMANT SUCCESSOR / NONCANONICAL / NOT DEPLOYED`.

## Назначение

CURRENT192 — отдельная execution-граница после принятого CURRENT191 approval.
Она не вызывает Langame: provider rows уже прочитаны bounded preflight и
преобразованы pure planner. В PostgreSQL передаются точные canonical UTF-8
bytes плана; DB независимо вычисляет SHA-256 и требует совпадения с одним
неистёкшим approval.

```text
CURRENT191 CONFIRMED
        |
        v
CURRENT192 CLAIMED --atomic execute--> COMPLETED
        |
        +----------stale reconcile---> EXPIRED
```

## Запись данных

Одна транзакция:

1. блокирует tenant и execution claim;
2. заново проверяет active tenant, consumed/unrevoked/unexpired GO, active
   NETWORK actor, CURRENT191 approval/preflight и полный CURRENT188
   receipt/claim/Store/source/credential/ACTIVATED binding;
3. проверяет exact canonical plan envelope, target, authorization, counts,
   ordering, IDs, names, state и inventory subset;
4. upsert-ит только Langame products указанного tenant/domain;
5. upsert-ит только UTC snapshot выбранного Store/club;
6. записывает terminal `COMPLETED` receipt и audit в той же транзакции.

Сохраняются ручные `article`, purchase/sale prices, category, supplier,
facing, assortment role, mandatory flag и canonical grouping существующего
товара. Отсутствующие в первом read-set товары не деактивируются. Collision с
чужим article или foreign/manual inventory snapshot отклоняет всю транзакцию.

## Replay и lost response

- claim одноразовый для approval и связан digest raw token без хранения token;
- exact claim/execute replay возвращает тот же receipt;
- changed replay запрещён;
- `reconcile` после потерянного ответа различает `CLAIMED`, `COMPLETED` и
  истёкший невыполненный `EXPIRED`;
- platform writes не могут зафиксироваться без `COMPLETED`, потому что DML и
  terminal transition атомарны.

Dormant application coordinator также default-off и production-denied. Он
принимает только process-local branded plan, повторяет неоднозначный claim
ровно один раз, а после неоднозначного execute сначала вызывает durable
reconcile. Execute retry допустим только когда `CLAIMED` доказывает отсутствие
committed business writes; после второго неоднозначного результата без
terminal receipt coordinator требует operator review.

## Отсутствующая власть

CURRENT192:

- находится только в `successor-candidates`;
- не импортирован Prisma schema;
- не имеет PUBLIC/application/runtime grants;
- coordinator не подключён к Nest module, route, BFF, UI или scheduler;
- не вызывает provider и не создаёт обычный IntegrationSyncJob;
- не может выполняться в production.

До принятия этапа необходимы PostgreSQL smoke, независимый review, exact-SHA
CI/artifact. После этого остаются execute-only runtime role/grants/attestation,
application coordinator с lost-response handling, canonical promotion,
production-like apply/rollback rehearsal и controlled pilot cutover.
