# AccessScope v1: test strategy

| Поле | Значение |
|---|---|
| Статус | Active |
| Версия | 1.0.0 |
| Дата | 27.07.2026 |
| Владелец | LeetPlus engineering / QA |
| Related | `BETA-SEC-003`, `BETA-CUT-003`, `BETA-CUT-008` |

## Fixture topology

Тесты используют синтетические данные:

```text
Tenant A: A1, A2, A3, A4
  ownerNetwork          NETWORK
  managerNetwork        NETWORK
  managerA1A2           STORES[A1,A2]
  employeeA1            STORES[A1]
  unresolved            NULL
  quarantined           STORES[] (authentication denied)
  inactiveA1            STORES[A1], inactive

Tenant B: B1, B2
  ownerB                NETWORK

Invites:
  NETWORK, STORES[A1], STORES[A1,A2], NULL/quarantined, Tenant B
```

Tenant A моделирует topology текущей сети из четырёх клубов, но fixture не
использует production ID или данные.

## Обязательные слои

### 1. Algebra/unit

- normalize/dedupe mode и store IDs;
- missing/unknown scope → deny;
- `NULL` и `STORES[]` → authentication denied, никогда не NETWORK;
- explicit foreign filter → `403`;
- delegation — только subset;
- network-global mutation — только NETWORK;
- direct out-of-scope resource policy → `404`.

### 2. PostgreSQL migration/invariants

На реальном PostgreSQL 16:

- migrations разворачиваются с нуля;
- user–store cross-tenant link отклоняется;
- invite mode/store set сохраняется;
- accept invite создаёт user + access rows атомарно;
- concurrent update/revoke не оставляет расширенный или противоречивый scope;
- expand migration не назначает NETWORK неизвестному аккаунту.

### 3. API two-tenant IDOR matrix

Для list/detail/create/update/delete/aggregate/export проверяются:

- A actor не получает объект Tenant B;
- `managerA1A2` видит ровно A1+A2;
- A3 filter → `403`, A3 UUID → `404`;
- `employeeA1` не создаёт A2/NETWORK invite;
- `NULL` и `STORES[]` не проходят аутентификацию;
- inactive user и suspended tenant не проходят execution policy;
- изменение scope/role действует со старым JWT на следующем запросе.

### 4. Module contracts

Каждая строка adoption matrix получает проверки list, detail, aggregate,
mutation, export/file и jobs/SSE, если surface существует.

Особо проверяются:

- staff assignment, attachments, knowledge and payroll totals;
- chat membership, channel events и SSE reconnect;
- gamification ledger/idempotency, selected club и background deliveries;
- assortment stock/sales totals, imports и exports.

### 5. Web/BFF/browser

- BFF сохраняет status и не подменяет `403/404` на пустой success;
- UI не показывает запрещённые clubs/actions;
- payload users/invites всегда содержит explicit mode;
- deep links и stale client state не обходят серверную проверку;
- network/restricted totals в UI совпадают с API.

## Release gates

До внешнего invite:

1. Ноль cross-tenant/cross-store reveals.
2. NETWORK totals до/после внедрения не изменились.
3. Restricted result равен точной сумме allowed stores.
4. Все новые migrations прошли clean PostgreSQL smoke.
5. Full API tests, API/web typecheck/build и web lint gates зелёные.
6. Обязательные строки adoption matrix имеют `VERIFIED`, test names и evidence
   SHA.
7. Для четырёх текущих клубов выполнена ручная reconciliation.
8. Rollback rehearsal пройден.

Это AccessScope sub-gate: он необходим, но недостаточен. Внешний invite
разрешается только после общего Gate 2 из `OPEN_BETA_BACKLOG.md`, включая OPS,
все пять обязательных модулей, cutover, backup/restore/rollback/alert drills и
семь дней internal alpha.

## Production shadow/canary

Shadow metrics не содержат PII и группируются по module/decision/reason.
Переход к canary начинается с internal network owner, затем с одного клуба,
после чего расширяется на четыре текущих клуба. Внешняя сеть подключается только
после отдельного GO.

## Changelog

- `1.0.0` — исходная test strategy.
