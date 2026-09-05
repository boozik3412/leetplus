# Store background execution production recovery

Статус: **production activation and Langame empty-page repair completed; repeatable rollback remains available**

Актуально на: **06.09.2026**

## Назначение

Этот runbook включает или аварийно выключает одну точную store-bound identity,
которую unattended workers используют внутри одного tenant. Операция не
запускает worker, не меняет правила геймификации и не выдаёт награды сама по
себе.

Контур: `workers / control plane`. HTTP-команда принадлежит platform-admin
поверхности corporate runtime:

```text
POST /api/admin/tenants/:tenantId/stores/:storeId/background-execution
```

Public guest и обычный tenant user не имеют доступа к маршруту. Для `ENABLE`
допускается только `ACTIVE + INTERNAL` tenant и точный активный Store с
`gamificationEnabled=true`. `DISABLE` остаётся доступным как уменьшающая
полномочия аварийная операция после смены tenant stage/status.

## Контракт команды

```json
{
  "action": "ENABLE",
  "expectedExecutionRevision": 4,
  "confirmation": "demo:STORE_UUID:ENABLE",
  "reason": "Restore autonomous gamification worker identity",
  "requestId": "store-bg-20260906-01",
  "supportTicket": "LP-BUG-2F3F9F62"
}
```

- `expectedExecutionRevision` — CAS fence; stale значение не меняет Store.
- `confirmation` — точное `tenant_slug:store_id:operation`.
- `requestId` — persisted idempotency key внутри tenant.
- `reason` обязателен; `supportTicket` может быть пустым.
- SHA запущенного API берётся из validated `RELEASE_SHA`, а не из запроса.

В одной DB-транзакции команда повторно читает точный Tenant/Store, выполняет
CAS-update только поля `backgroundExecutionEnabled`, проверяет trigger-owned
увеличение `Store.executionRevision` ровно на один и создаёт
`PlatformAdminAuditEvent` с before/after, actor, reason, request ID и release
SHA. Повтор той же команды возвращает `replayed=true`; переиспользование
request ID для другой цели или состояние, изменившееся после первой команды,
завершается конфликтом.

## Production порядок

1. Подтвердить active/rollback readiness, exact schema и admitted active SHA.
2. Остановить только частый bonus-ledger timer; текущий public/corporate
   runtime оставить доступным.
3. Read-only получить exact Store ID, `executionRevision`, activity и
   gamification flag. Не включать несколько Store без отдельной причины: один
   Store является минимальной runtime identity tenant, а фактический store
   scope правил остаётся в `storeIds`/Langame domain evidence.
4. Выполнить один `ENABLE` через маршрут выше и сохранить audit event ID.
5. Запустить один bounded worker canary. Для ledger fallback сначала проверить
   exact profile/session/fact и нулевую replay collision gate.
6. Проверить origin receipt, event, entitlement/reward/wallet и отсутствие
   duplicate keys. Для бонусной награды отдельно проверить ledger/provider
   terminal status; lootbox entitlement не должен создавать bonus write.
7. Повторить тот же worker pass и доказать нулевой новый effect.
8. Вернуть `leetplus-bonus-ledger-worker.timer` в `enabled + active(waiting)` и
   проверить минимум два автоматических tick.
9. Проверить public/corporate health, active release, rollback и unresolved
   worker queues.

## Production результат 06.09.2026

- Store activation/control-plane baseline:
  `43d447a3c3bd08dcf496f783771c28130e13c82a` (PR #146);
- текущий admitted/runtime SHA:
  `94f9462ecf3b77b610b8d2ce73fcc68be7625eac` (PR #147), Fast
  `33997351479`, Full `33997351444`;
- active blue, hot-rollback green `43d447a3…`, schema exact
  `CURRENT_189/189`;
- tenant `demo`, Store `5b07123f-9db7-453c-9a03-ccd75aa1cf49`:
  `backgroundExecutionEnabled=true`, revision `0 -> 1`;
- audit event: `07b471ca-83f4-45a1-995a-d1a6ce7d4715`; повтор exact команды
  вернул `replayed=true` без новой revision;
- canary fact `6df3d604-1e75-4ff5-b423-628e92d3bba8`, Langame session
  `548185`: receipt `PROCESSED`, один event, один reward intent, одна reward и
  один `AVAILABLE` lootbox entitlement; повторный cursor-pass вернул duplicate,
  `createdEvents=0`, `createdRewards=0`;
- `leetplus-bonus-ledger-worker.timer` возвращён в enabled/active, штатные
  проходы выполняют bounded recovery, autonomous `PARTIAL` continuation и
  ledger fallback без переноса scheduler authority в API.
- follow-up operation `413f9c4b-504e-4cbe-b044-b47aa5598bb9` устранила
  ложный `RETRY` после пустой ISO-страницы: точный `PRODUCT_EXPENSE` source
  завершён (`page=16`, `rows=3000`), а `TRANSACTION PARTIAL` автоматически
  продолжен через `PENDING nextPage=41`; глобально `RETRY=0`, `FAILED=0` и
  unresolved bonus-ledger backlog равен `0`.

## Откат

Если canary или postflight не проходит, выполнить `DISABLE` новым request ID и
с текущей `executionRevision`, затем оставить timer выключенным до анализа.
Public/corporate runtime не откатывается из-за одной store-identity операции.
Если причиной является новый runtime, использовать штатный blue/green
orchestrator и сохранённый hot rollback; ручная правка nginx, slot links или
release bytes запрещена.
