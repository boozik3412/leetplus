# CURRENT191 deterministic Langame initial sync plan

Статус: `DORMANT PURE PLANNER / NO DB / NO PROVIDER WRITE / NOT DEPLOYED`.

CURRENT191 — следующий application-only шаг после принятого CURRENT188
provider-read preflight. Он не является миграцией и ничего не активирует.

Pure planner принимает только exact selected-Store target, HMAC-bound approval/
read-set digests и свежие product/goods rows. Он:

- требует совпадения counts с preflight receipt;
- принимает только plain data records без accessors/symbols/лишних полей;
- нормализует положительные provider IDs, product state, безопасные имена и
  bounded целые остатки;
- отклоняет duplicates и inventory вне product set;
- сортирует actions независимо от provider order;
- формирует immutable product/inventory plan и SHA-256 digest полного плана;
- сериализует canonical plan bytes только из process-local branded plan;
  structural clone/подделка не может перейти в execution boundary;
- всегда возвращает `providerWritesStarted=false`,
  `platformWritesStarted=false`, `productionImportAllowed=false`.

Planner не является authorization receipt. Persisted one-time approval уже
принят отдельно на CURRENT191 exact SHA `56f24216…`. Следующий обязательный
этап — dormant CURRENT192 atomic selected-Store import с claim/complete/
reconcile, затем отдельные canonical runtime grants.
