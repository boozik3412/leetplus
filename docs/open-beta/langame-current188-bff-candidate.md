# CURRENT188 dormant Langame Web BFF candidate

## Статус

`DORMANT / NONCANONICAL / NOT ROUTE-WIRED / NO PRODUCTION EFFECTS`.

Файл `apps/web/src/lib/langame-current188-bff-candidate.ts` является чистым
server-side transport-кандидатом. Литеральный флаг
`LANGAME_CURRENT188_BFF_CANDIDATE_ACTIVE` равен `false`; ни один активный Next
Route Handler или UI-компонент его не импортирует. Текущая форма Langame
продолжает использовать legacy settings flow.

## Реально поддерживаемая поверхность

Кандидат отображает пять существующих API-контрактов:

- `POST /api/integrations/langame/onboarding/preview` →
  `POST /integrations/langame/onboarding/preview`;
- `POST /api/integrations/langame/onboarding/activate` →
  `POST /integrations/langame/onboarding/activate`;
- `POST /api/integrations/langame/onboarding/status` →
  `POST /integrations/langame/onboarding/status`;
- `POST /api/integrations/langame/onboarding/reconcile` →
  `POST /integrations/langame/onboarding/reconcile`;
- `POST /api/integrations/langame/onboarding/initial-sync/preflight` →
  `POST /integrations/langame/onboarding/initial-sync/preflight`.

Transport сам читает исходный browser `Request`, принимает только B2B JWT из
HttpOnly cookie, exact same-origin `POST` без query/hash, canonical
`Content-Length`, потоковый JSON до 8 KiB и строго allowlisted поля. Browser
`Authorization`/`Cookie`, произвольный path, generic sync и provider jobs не
пересылаются. Upstream запросы имеют `cache: no-store`, `credentials: omit` и
`redirect: error`; успешный ответ обязан быть exact Nest `201 application/json`.
Наружу возвращается только allowlisted receipt с private/no-store headers, а
ACTIVATE response обязан содержать тот же `receiptId`, который был подготовлен
из запроса. API key и текст upstream-ошибки не отражаются клиенту.

STATUS принимает только exact `storeId`, повторно получает persisted
role/capability/`NETWORK` scope через `FreshStoreScopeService`, требует active
tenant-bound Store, затем читает один deterministic receipt/claim без
credential и provider call. Ответ допускает только `NOT_CONFIGURED`, `PENDING`,
`EXPIRED` или receipt-bound `ACTIVATED`; digest/domain/club/date и nullability
перепроверяются в API и BFF. Adapter отдельно default-off и запрещён в
production (`LANGAME_STAGED_ONBOARDING_STATUS_CURRENT188_ENABLED` не является
production authority). Reconciliation и initial sync в статусе всегда `false`.

RECONCILE принимает тот же exact activation-bound body и повторно вычисляет
tenant/actor/receipt/request/config/store/domain/club HMAC binding. `ACTIVATED`
допускается только при полном совпадении receipt, claim, Store,
IntegrationSource, credential и audit event. `NOT_APPLIED` либо `EXPIRED`
допускаются только при отсутствии activation request/claim/audit evidence;
частичный, неоднозначный или over-broad результат отклоняется. Provider call,
credential read, повторная activation и sync отсутствуют. Adapter отдельно
default-off и production-denied.

INITIAL-SYNC PREFLIGHT принимает exact activation receipt и отдельный
`syncRequestId`, требует `INTEGRATIONS + ASSORTMENT OUTBOUND` entitlements и
повторно сверяет receipt/claim/Store/source/credential/audit до и после сети.
Разрешены ровно три bounded provider `GET`: `/clubs/list`, `/products/list` и
`/goods/list?club_id=<selected>`. После provider reads полномочия NETWORK
повторно подтверждаются до повторной проверки persisted binding. Preflight
возвращает только HMAC-bound counts и digests, не сохраняет provider payload,
не создаёт Product/Inventory/
IntegrationSyncJob и не выполняет provider write. Adapter default-off и
production-denied.

## Явно отсутствующий контракт

Кандидат не выдумывает HTTP-маршрут для последней обязательной стадии:

1. persisted approval и идемпотентный selected-Store initial platform import.

Legacy `POST /integrations/langame/sync` и foundation sync не являются
безопасной заменой этим стадиям. До их реализации UI cutover запрещён.

Legacy `LangameSyncService` теперь также fail-closed внутри service на fresh
persisted `customerStage`: любой `PILOT/BETA/LIVE` manual child получает
`EXTERNAL_LEGACY_LANGAME_SYNC_REQUIRES_CURRENT188` до чтения credential,
provider call, sync job или business mutation. Это закрывает обход, при котором
legacy `Store.upsert` мог автоматически создать все видимые provider clubs либо
sales placeholder вместо exact выбранного и quota-bound Store. `INTERNAL`
контур текущей сети не меняется. Focused service evidence: `12/12 PASS`;
exact SHA `9d66276a…`, CI `31645464017` — `3/3 SUCCESS`, artifact
`sha256:c57f1fb3…fcad358`.

## Проверка

```powershell
pnpm --filter web test:langame-current188-bff-candidate
pnpm --filter web test:pilot-bff-boundary
pnpm --filter web typecheck
```

Status exact-SHA evidence: commit `f5b94c2e…`, CI `31668745439` —
`3/3 SUCCESS`, artifact `sha256:a42d200b…71a5c2`; full API
`3028 passed / 2 todo`, Web status BFF `15/15`. Текущий local reconcile
increment принят exact SHA `4e2c9b29…`, CI `31671722614`, artifact
`sha256:7bea44f8…003b1`: targeted Langame `201/201`, tenant execution
`986/986`, full API `3038 + 2 todo`, Web BFF `17/17`. Текущий local preflight:
targeted Langame API `219/219`, Web BFF `19/19`; exact-SHA CI ещё обязателен.
Stale `PENDING` до прохода expirer проецируется fail-closed как `EXPIRED`.
Текущие проверки также подтверждают, что кандидат остаётся неимпортированным
активными routes и что API содержит ровно fresh-authority `preview`, `activate`
и production-denied `status`/`reconcile`/`initial-sync/preflight` с Nest default
`201`, но не отсутствующий persisted import этап. Для status/reconcile это уже
принято exact-SHA CI; preflight остаётся local до следующего clean SHA.

## Условия активации

Активация возможна только одним reviewed cutover после выполнения всех условий:

1. CURRENT188 включён в reviewed canonical migration lineage;
2. application runtime role имеет только необходимые execute-grants и проходит
   OID/manifest attestation;
3. реализован persisted approval и идемпотентный selected-Store initial import,
   а status/reconcile/preflight получают canonical execute-only grants и
   production authorization;
4. production-like apply/rollback/zero-diff rehearsal зелёный;
5. новый Route Handler и UI импортируют candidate атомарно, а legacy write/sync
   path удаляется или остаётся явно закрытым;
6. A/B browser matrix доказывает isolation `Tenant A/A1..A4 ↔ Tenant B/B1`;
7. принято отдельное release `GO`.

Этот документ не разрешает deployment, provider write, sync или выдачу
тестового доступа.
