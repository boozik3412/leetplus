# CURRENT188 dormant Langame Web BFF candidate

## Статус

`DORMANT / NONCANONICAL / NOT ROUTE-WIRED / NO PRODUCTION EFFECTS`.

Файл `apps/web/src/lib/langame-current188-bff-candidate.ts` является чистым
server-side transport-кандидатом. Литеральный флаг
`LANGAME_CURRENT188_BFF_CANDIDATE_ACTIVE` равен `false`; ни один активный Next
Route Handler или UI-компонент его не импортирует. Текущая форма Langame
продолжает использовать legacy settings flow.

## Реально поддерживаемая поверхность

Кандидат отображает только три существующих API-контракта:

- `POST /api/integrations/langame/onboarding/preview` →
  `POST /integrations/langame/onboarding/preview`;
- `POST /api/integrations/langame/onboarding/activate` →
  `POST /integrations/langame/onboarding/activate`;
- `POST /api/integrations/langame/onboarding/status` →
  `POST /integrations/langame/onboarding/status`.

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

## Явно отсутствующие контракты

Кандидат не выдумывает HTTP-маршруты для двух оставшихся обязательных стадий:

1. tenant/receipt-bound reconcile;
2. отдельно подтверждаемый initial read-only sync.

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

Focused candidate evidence: Web `15/15 PASS`; API staged service `22/22`,
policy/service/role slice `160/160`, targeted Langame suite `191/191`;
targeted lint и API typecheck зелёные. Stale `PENDING` до прохода expirer
проецируется fail-closed как `EXPIRED`.
CI также проверяет, что кандидат остаётся неимпортированным активными routes и
что API содержит ровно fresh-authority `preview`, `activate` и
production-denied `status` с Nest default `201`, но не отсутствующие
reconcile/initial-sync стадии.

## Условия активации

Активация возможна только одним reviewed cutover после выполнения всех условий:

1. CURRENT188 включён в reviewed canonical migration lineage;
2. application runtime role имеет только необходимые execute-grants и проходит
   OID/manifest attestation;
3. реализованы exact reconcile и отдельно подтверждаемый initial read-only
   sync, а status получает canonical execute-only grants и production
   authorization;
4. production-like apply/rollback/zero-diff rehearsal зелёный;
5. новый Route Handler и UI импортируют candidate атомарно, а legacy write/sync
   path удаляется или остаётся явно закрытым;
6. A/B browser matrix доказывает isolation `Tenant A/A1..A4 ↔ Tenant B/B1`;
7. принято отдельное release `GO`.

Этот документ не разрешает deployment, provider write, sync или выдачу
тестового доступа.
