# CURRENT188 dormant Langame Web BFF candidate

## Статус

`DORMANT / NONCANONICAL / NOT ROUTE-WIRED / NO PRODUCTION EFFECTS`.

Файл `apps/web/src/lib/langame-current188-bff-candidate.ts` является чистым
server-side transport-кандидатом. Литеральный флаг
`LANGAME_CURRENT188_BFF_CANDIDATE_ACTIVE` равен `false`; ни один активный Next
Route Handler или UI-компонент его не импортирует. Текущая форма Langame
продолжает использовать legacy settings flow.

## Реально поддерживаемая поверхность

Кандидат отображает только два уже существующих API-контракта:

- `POST /api/integrations/langame/onboarding/preview` →
  `POST /integrations/langame/onboarding/preview`;
- `POST /api/integrations/langame/onboarding/activate` →
  `POST /integrations/langame/onboarding/activate`.

Transport сам читает исходный browser `Request`, принимает только B2B JWT из
HttpOnly cookie, exact same-origin `POST` без query/hash, canonical
`Content-Length`, потоковый JSON до 8 KiB и строго allowlisted поля. Browser
`Authorization`/`Cookie`, произвольный path, generic sync и provider jobs не
пересылаются. Upstream запросы имеют `cache: no-store`, `credentials: omit` и
`redirect: error`; успешный ответ обязан быть exact Nest `201 application/json`.
Наружу возвращается только allowlisted receipt с private/no-store headers, а
ACTIVATE response обязан содержать тот же `receiptId`, который был подготовлен
из запроса. API key и текст upstream-ошибки не отражаются клиенту.

## Явно отсутствующие контракты

Кандидат не выдумывает HTTP-маршруты для трёх обязательных стадий:

1. tenant/receipt-bound staged status;
2. tenant/receipt-bound reconcile;
3. отдельно подтверждаемый initial read-only sync.

Legacy `POST /integrations/langame/sync` и foundation sync не являются
безопасной заменой этим стадиям. До их реализации UI cutover запрещён.

## Проверка

```powershell
pnpm --filter web test:langame-current188-bff-candidate
pnpm --filter web test:pilot-bff-boundary
pnpm --filter web typecheck
```

Focused candidate evidence: `12/12 PASS`. CI также проверяет, что кандидат
остаётся неимпортированным активными routes и что API содержит ровно `preview`
и `activate` с Nest default `201`, но не отсутствующие стадии.

## Условия активации

Активация возможна только одним reviewed cutover после выполнения всех условий:

1. CURRENT188 включён в reviewed canonical migration lineage;
2. application runtime role имеет только необходимые execute-grants и проходит
   OID/manifest attestation;
3. реализованы exact status, reconcile и отдельно подтверждаемый initial
   read-only sync;
4. production-like apply/rollback/zero-diff rehearsal зелёный;
5. новый Route Handler и UI импортируют candidate атомарно, а legacy write/sync
   path удаляется или остаётся явно закрытым;
6. A/B browser matrix доказывает isolation `Tenant A/A1..A4 ↔ Tenant B/B1`;
7. принято отдельное release `GO`.

Этот документ не разрешает deployment, provider write, sync или выдачу
тестового доступа.
