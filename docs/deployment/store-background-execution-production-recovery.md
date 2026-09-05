# Store background execution production recovery

Статус: **audited platform-admin control plane implemented; production GO is a separate effect**

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

## Откат

Если canary или postflight не проходит, выполнить `DISABLE` новым request ID и
с текущей `executionRevision`, затем оставить timer выключенным до анализа.
Public/corporate runtime не откатывается из-за одной store-identity операции.
Если причиной является новый runtime, использовать штатный blue/green
orchestrator и сохранённый hot rollback; ручная правка nginx, slot links или
release bytes запрещена.
