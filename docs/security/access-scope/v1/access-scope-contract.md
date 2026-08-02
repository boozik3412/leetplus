# AccessScope contract v1

| Поле | Значение |
|---|---|
| Статус | Active for implementation |
| Версия | 1.0.0 |
| Дата | 27.07.2026 |
| Владелец | LeetPlus engineering |
| Related | `BETA-SEC-003`, `BETA-SEC-006`, `BETA-IAM-001..003` |

Термины `MUST`, `MUST NOT`, `SHOULD` и `MAY` ниже нормативны.

## 1. Каноническая модель

```text
AuthenticatedUser
  tenantId
  accessScope = NETWORK | STORES
  allowedStoreIds = [] | [storeId...]
```

- `NETWORK` MUST иметь пустой persisted allow-list и означает все Store
  исключительно собственного tenant.
- `STORES` MUST использовать persisted allow-list. В runtime v1 список MUST
  быть непустым. `STORES[]` допустим только как database quarantine и MUST
  завершать аутентификацию отказом; он никогда не повышается до `NETWORK`.
- Повторяющиеся, неизвестные и cross-tenant Store MUST приводить к deny и
  диагностическому событию.
- Отсутствующий mode MUST приводить к deny.
- JWT MAY содержать диагностический snapshot mode, но API MUST NOT использовать
  его как источник полномочий.

## 2. Классы ресурсов

| Класс | Правило |
|---|---|
| `TENANT_GLOBAL` | read/write только `NETWORK`, если отдельное правило не задаёт безопасную проекцию |
| `SINGLE_STORE` | store обязан входить в effective scope |
| `MULTI_STORE` | все связанные store обязаны входить в scope |
| `DERIVED_AGGREGATE` | сначала фильтруются исходные rows, затем считается aggregate |
| `USER_STAFF` | target scope должен быть подмножеством actor scope |
| `FILE` | проверяется parent resource и store при каждой выдаче/скачивании |
| `BACKGROUND_SSE` | scope фиксируется server-side, не принимается из client payload |
| `PUBLIC_GUEST` | отдельная guest policy; B2B scope не обходится |

Membership, assignee, creator, role и capability MUST NOT расширять scope.

## 3. HTTP и query semantics

- List без store filter возвращает ровно все разрешённые клубы.
- Явный filter с чужим или запрещённым store возвращает `403`; сервер не должен
  молча урезать filter, иначе отчёт выглядит полным, хотя он неполон.
- Direct UUID существующего out-of-scope объекта возвращает `404`, чтобы не
  раскрывать его существование.
- Общий implementation MUST использовать разные adapters: явный requested
  filter проверяется с `403`, а store родительского direct resource — с `404`.
  Один helper с единой HTTP-семантикой для обоих случаев запрещён.
- Cross-tenant объект всегда возвращает `404`.
- `STORES` не видит tenant-global или `storeId = null` facts без отдельной
  безопасной проекции.
- Write во множество клубов разрешён, только если каждый target store входит в
  actor scope.
- Tenant-global mutation доступна только `NETWORK`.
- Export, download, preview, count и total MUST применять те же filters, что и
  основной список.

## 4. Делегирование users, roles и invites

- `NETWORK` actor может выдать `NETWORK` или непустой `STORES` собственного
  tenant.
- `STORES` actor не может выдать `NETWORK`.
- `STORES` actor может выдать только `STORES`, являющийся подмножеством его
  allow-list.
- Actor не может редактировать, отзывать или деактивировать target с более
  широким scope.
- Самоизменение scope запрещено через обычный users API.
- Создание/изменение tenant-global custom roles и system-role overrides требует
  `NETWORK` плюс соответствующую capability.
- Принятие invite MUST атомарно сохранить exact mode и exact store set.
- Invite MUST быть привязан к email и использовать невосстанавливаемый opaque
  bearer token, от которого хранится только hash.
- Любое изменение invite MUST ротировать token; update, cancel и accept MUST
  конкурировать через conditional claim/CAS, а общий users list MUST NOT
  возвращать registration URL.

## 5. Аудит

Security decision SHOULD фиксировать:

- actor/user ID;
- tenant ID;
- persisted mode;
- effective и requested store IDs;
- capability, route/action и resource class;
- allow/deny и machine-readable reason;
- request/trace ID;
- release SHA.

Логи MUST NOT содержать raw invite token, пароль, телефон, email или ключ
интеграции.

## 6. Fail-closed причины

Минимальный набор reason codes:

- `SCOPE_MISSING`;
- `SCOPE_UNKNOWN`;
- `NETWORK_WITH_STORE_ROWS`;
- `STORES_WITHOUT_STORE_ROWS`;
- `STORE_SCOPE_CROSS_TENANT`;
- `STORE_FILTER_FORBIDDEN`;
- `TARGET_SCOPE_BROADER_THAN_ACTOR`;
- `TENANT_GLOBAL_REQUIRES_NETWORK`;
- `RESOURCE_OUT_OF_SCOPE`.

## 7. Definition of Done одной поверхности

Surface не получает `VERIFIED`, пока не проверены применимые:

- list, detail и counts;
- aggregate и dashboard totals;
- create/update/delete;
- export/file;
- scheduler/queue/SSE;
- cross-tenant и cross-store negative cases;
- немедленное применение изменения scope.

## Changelog

- `1.0.0` — исходный нормативный контракт.
