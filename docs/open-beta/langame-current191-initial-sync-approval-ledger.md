# CURRENT191 Langame initial-sync approval ledger

Статус: `EXACT-SHA CI ACCEPTED / DORMANT SUCCESSOR / NONCANONICAL / NOT DEPLOYED`.

## Назначение

Ledger отделяет read-only provider preflight от будущего первого импорта. Он
сохраняет только PII-free digests, exact tenant/Store/source/credential target,
counts и короткоживущий approval state. Сам import отсутствует.

Кандидат намеренно расположен в
`packages/database/successor-candidates/20260813010000_langame_initial_sync_approval_current191`,
а не в canonical `prisma/migrations` и не в frozen `migration-candidates`
CURRENT180–190. Поэтому он не изменяет принятый release manifest и не получает
deploy authority.

## Состояния и операции

```text
CURRENT188 activated binding
        |
        v
PENDING_CONFIRMATION --confirm--> CONFIRMED
        |
        +--------------expire----> EXPIRED
```

- `record_preflight`: 15-минутная exact/idempotent запись;
- `confirm`: одно подтверждение, changed replay запрещён;
- approval `validUntil` точно наследует исходный `preflight.expiresAt` и не
  продлевает 15-минутное окно provider read-set;
- `expire`: bounded `1..1000`, `FOR UPDATE SKIP LOCKED`;
- approval и audit rows append-only;
- preflight binding immutable;
- допустимы только точные terminal transitions, назначенные соответствующему
  SECURITY DEFINER writer.

## Fresh authorization

И запись, и подтверждение повторно проверяют под блокировками:

- active tenant в `PILOT | BETA | LIVE` и допустимый onboarding status;
- consumed, unrevoked и unexpired tenant `GO`;
- active `NETWORK` actor внутри того же tenant;
- consumed CURRENT188 receipt и exact claim;
- совпадение activation request/config/binding;
- active Store с тем же Langame domain/club/source;
- active source и encrypted credential без env fallback;
- exact `ACTIVATED` audit, включая timestamp связи.

Подтверждение не доверяет ранее сохранённому snapshot: вся связь проверяется
заново непосредственно перед append approval.

## Отсутствующая власть

Кандидат:

- не имеет PUBLIC/application grants;
- не импортирован Prisma schema;
- не создаёт Product, InventorySnapshot или IntegrationSyncJob;
- не вызывает Langame и не меняет provider;
- не подключён к Nest module, route, Web BFF, UI или scheduler;
- не может применяться в production.

## Acceptance

Static foundation проверяет checksum, successor lineage, PII-free schema,
fresh authority/binding, exact transitions, owner-only ACL и отсутствие
business/provider effects.

Disposable PostgreSQL smoke применяет CURRENT188 + CURRENT191 после canonical
migrations и затем в одной rollback-only fixture проверяет:

- preflight и exact replay;
- cross-tenant deny;
- revoke `GO` между preflight и confirm;
- credential drift между preflight и confirm;
- approval и exact/changed replay;
- append-only guards;
- bounded expiry;
- отсутствие Product/IntegrationSyncJob effects.

Exact SHA `56f24216d787fbee57457f655b066d8727a8dcb5` принят CI
`31680337637` как `3/3 SUCCESS`; evidence и artifact зафиксированы отдельно.
Следующий отдельный этап — one-shot claim/import/complete/reconcile с
execute-only runtime roles и selected-Store atomic business writes. Только
затем возможны canonical promotion, production-like rehearsal и atomic
route/UI cutover.
