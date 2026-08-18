# Gate 1MT: restored-copy PostgreSQL evidence — 18.08.2026

## Решение

PostgreSQL-срез Gate 1MT для согласованного beta scope принят на одноразовых
клонах чистой restored copy production backup. Это закрывает database/service
A/B matrix для ассортимента, командного чата, CRM-коммуникаций,
пользователей/ролей и файловых вложений, но само по себе не разрешает
production deployment или выдачу внешнего OWNER invite.

Production, исходная restored copy и текущий tenant из четырёх клубов не
изменялись.

## Provenance

- исполнявшийся commit:
  `8881d3a8d74088196747250f66772dcc5abc9d00`;
- release candidate, к которому привязана restored copy:
  `3f325acc2428b1e3c3797075b218efeb454fae91`;
- CI artifact: `9321380247`;
- artifact archive SHA-256:
  `adb75120f35ca54bbd80924f467c78296d425f3c94de86f437998b9046b5b7f4`;
- source template: `leetplus_restored_founder_clean_a1`;
- одноразовый клон: `leetplus_gate1mt_test_8881d3a8`;
- PostgreSQL: isolated loopback `127.0.0.1:55439`, не production port;
- migration state источника: CURRENT185, `185 applied / 4 rolled back /
0 unfinished`.

Дополнительный HTTP/BFF/browser-срез выполнен на exact implementation commit
`771bbd5fa73e0be3b41d74dbb107495824987554` и одноразовом клоне
`leetplus_gate1mt_browser_test_d2f89b7b` того же clean template.

File/attachment PostgreSQL slice добавлен exact commit
`e6e8d2aa4e5655fa55a715b0d71dc7d2c848a036` и выполнен на одноразовом клоне
`leetplus_gate1mt_attachment_test_800b246d`.

Latest assortment candidates `230d62b1…`, `d3a2d8b6…`, `58410b37…`,
`f59c32fc…`, `3e0389b4…` и `94db1fdd…` добавили в существующую suite
двенадцать реальных
PostgreSQL-проверок: категории, поставщики, product CSV,
inventory/sales/stock-movement CSV, все локальные варианты
отчётов, CSV/XLSX exports, OOS exclusions и recommendation state. Exact
bytes `f59c32fc…` дали два последовательных зелёных прогона на отдельном
чистом PostgreSQL 16.14 после canonical LF migration deploy и два — на disposable
клоне `leetplus_gate1mt_assortment_test_reports_a4` clean
production-backup copy. Restored-copy матрица после report extension была
`29/29`: два дополнительных test проводят те же services через
реальный Nest HTTP controller и RolesGuard, а новый test доказывает atomic
RecommendationState materialization при четырёх параллельных report reads.

Team-chat SSE extension exact `ccf81a28…`/`dfe5e0f8…` добавил real Nest HTTP
проверку поверх restored-copy clone. Fresh authority теперь завершается до
фиксации SSE `200`: cross-store/cross-tenant channel возвращает `404`, stale
persisted scope — `401`; разрешённый A1/B1 stream содержит только свой channel.
Два последовательных run дали `4/4 + 4/4`, все `156` table counts совпали с
source, exact disposable DB удалена. После SSE матрица была `30/30`.
[Полное SSE evidence](./gate-1mt-team-chat-sse-evidence-2026-08-18.md).

Attachment parent extension exact `abb8a667…` добавил fresh
NETWORK/capability/exact-parent reader для `CHECKLIST_RUN`,
`KNOWLEDGE_ARTICLE`, `SHIFT_REGULATION`, `TRAINING_COURSE` и
`ONBOARDING_PLAN`. Exact bytes дважды прошли `4/4 + 4/4`; все `156` table
counts совпали с source, disposable DB residue `0`. Текущая матрица —
`31/31`.
[Полное attachment evidence](./gate-1mt-attachment-parent-evidence-2026-08-18.md).

## Выполненная матрица

| Контур                      | Набор                                                  |      Результат |
| --------------------------- | ------------------------------------------------------ | -------------: |
| Ассортимент и Store scope   | `pilot-assortment-store-scope.pg.integration-spec.ts`  |   `15/15 PASS` |
| Командный чат и fresh scope | `pilot-team-chat-fresh-scope.pg.integration-spec.ts`   |     `4/4 PASS` |
| CRM-коммуникации            | `pilot-crm-communications.pg.integration-spec.ts`      |     `4/4 PASS` |
| Пользователи и роли         | `pilot-users-roles-fresh-scope.pg.integration-spec.ts` |     `4/4 PASS` |
| Файловые вложения staff     | `pilot-staff-attachments-scope.pg.integration-spec.ts` |     `4/4 PASS` |
| **Итого**                   | **5 PostgreSQL suites**                                | **31/31 PASS** |

Матрица включает Tenant A/Tenant B, network scope, Store A1/A2 и Store B1,
cross-tenant deny, cross-store deny, stale authority и допустимые операции
внутри собственной сети/клуба.

## Latest assortment extension

`pilot-assortment-store-scope.pg.integration-spec.ts` расширен с `3/3` до
`15/15` без test-only service substitutes:

- `CategoriesService`: NETWORK-only list, cross-tenant update/merge deny,
  допустимый same-tenant merge с проверкой переноса Product и stale JWT/DB
  scope deny;
- `SuppliersService`: NETWORK-only list/create/update/archive,
  cross-tenant update/archive deny и stale JWT/DB scope deny.
- `ProductCsvImportService`: STORES deny, same-article isolation между
  tenant, tenant-bound category/supplier lookup, invalid foreign reference
  rejection и stale JWT/DB scope deny;
- `FactCsvImportService`: NETWORK-only inventory/sales/stock-movement imports,
  exact Store/Product binding внутри tenant, foreign Store/article rejection,
  zero cross-tenant facts и stale JWT/DB scope deny.
- `ReportsService`: A1/A2/B1 assortment и sales reads ограничены fresh scope;
  explicit foreign Store filters запрещены;
- `ReportsExportService`: sales-detail CSV содержит только разрешённые Store и
  tenant rows, а stale Store binding блокирует export до выдачи файла.
- все локальные `ReportsService` variants проверены для A1 и NETWORK:
  operational, turnover, matrix, plan/fact, sales detail, SKU, suppliers,
  replenishment, new products и LFL; A2/B1 не проникают в Store scope,
  B1 не проникает в Tenant A NETWORK scope;
- все локальные `ReportsExportService` variants проверены в CSV и
  XLSX: comprehensive, LFL, sales detail, replenishment и product movement;
  XLSX повторно читается ExcelJS и проверяется по ячейкам;
- OOS exclusions и recommendation state проверены на NETWORK-only
  mutation, cross-tenant deny и раздельное состояние одинакового
  recommendation key в Tenant A/Tenant B.
- четыре параллельных operational report reads дают одинаковые recommendation
  keys и ровно одну persisted `RecommendationState` на key; Prisma `P2002`
  устранён atomic `upsert`.

Два последовательных clean current-head прогона и два последовательных
restored-copy прогона завершились `12/12 + 12/12 PASS` каждый.
Restored-copy postflight: `0 fixture tenants / 0 fixture users / 0 import
jobs / 0 sales facts / 0 stock movements / 0 OOS exclusions / 0
recommendation states`; target/source core counts совпали:
`3 tenants / 4 stores / 30 users / 1483 products / 51257 guests`. Exact
disposable database удалена, database residue `0`. Production, clean
restored-copy source и текущая сеть не изменялись.

## Report HTTP/BFF extension

Exact implementation `3e0389b4…` поднимает `ReportsController` через
настоящий Nest HTTP adapter поверх тех же PostgreSQL services:

- OWNER/NETWORK Tenant A проходит все одиннадцать report GET без B1;
- OWNER/NETWORK Tenant B видит B1 и не видит A1/A2;
- CLUB_MANAGER/STORES(A1) получает только A1 через свой
  `view_reports` capability;
- CSV и XLSX стримятся с attachment headers, XLSX после HTTP снова
  читается ExcelJS и не содержит foreign tenant rows;
- OOS create/delete и recommendation state проходят RolesGuard и
  tenant authority; cross-tenant delete блокируется, STORES mutation получает
  `403`;
- Web BFF export переведён на единый `proxyFileRequest` с safe
  disposition и private/no-store; OOS/recommendation routes используют
  cookie-backed `proxyJsonRequest`, private/no-store и URL-encoding динамических
  id/key. Static BFF acceptance расширена до `9/9`: все двенадцать report page
  loaders выполняются шестью bounded группами ровно по два вызова.

Два последовательных restored-copy прогона на клоне
`leetplus_gate1mt_reports_http_test_a1` дали `14/14 + 14/14`. После concurrency
regression два последовательных прогона exact `94db1fdd…` на отдельном clean
клоне дали `15/15 + 15/15`.
Target/source counts семи затронутых таблиц совпали
`3/30/0/106897/0/8/1212`; core counts совпали
`3/4/30/1483/51257`. После exact database/session preflight клон удалён,
database residue `0`.

## HTTP/BFF/browser-срез

В production-сборке локально были подняты настоящий Nest API и два web-origin,
чтобы cookie сессии `OWNER/NETWORK` и `CLUB_MANAGER/STORES(B1)` не
пересекались. В одноразовом клоне создана синтетическая независимая сеть B с
двумя Store, двумя пользователями, двумя раздельными товарами и exact six-row
beta profile (`read/write=ON`, `outbound=OFF`).

| Проверка                                                                                                                                          | Результат                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| OWNER: dashboard, gamification, assortment/products, staff, regulations, checklists, knowledge, training/assessments, communications, users/roles | `PASS`                                                                           |
| STORES(B1): dashboard и каталог содержат только B1; B2 и настоящий Tenant A отсутствуют                                                           | `PASS`                                                                           |
| Явный product filter по B2 или Tenant A                                                                                                           | штатный `404`, данных нет                                                        |
| STORES staff navigation                                                                                                                           | store-aware tasks/directory/communications видимы; tenant-wide workspaces скрыты |
| Прямой STORES URL к checklists/regulations/knowledge/training                                                                                     | штатный `404` до upstream data call; RSC error отсутствует                       |

В ходе прогона закрыты две UI-границы:

- STORES assortment переведён в read-only и больше не загружает network-only
  categories/suppliers; edit controls отсутствуют;
- все staff pages, чьи API-контроллеры временно защищены
  `FreshNetworkScopeGuard`, используют единый `requireNetworkScopedUser`, а
  `canAccessPath` не показывает их STORES-пользователю.

Проверки exact implementation:

```text
pilot BFF policy:       7/7 PASS
users/roles BFF:        5/5 PASS
invite transport:       7/7 PASS
web typecheck:          PASS
web production build:   PASS (205 pages)
web lint:               0 errors / 30 pre-existing warnings
browser OWNER/STORES:   PASS
```

HTTP surface manifest после fresh source-binding recheck содержит exact
`295` routes: `241 ALLOW / 54 BLOCKED`. `POST /stores` больше не несёт ложный
`NETWORK_SCOPE_NOT_ASSERTED`: production service начинает с fresh
`assertNetwork`, а для `PILOT` tenant по-прежнему возвращает `409` и требует
dedicated provisioning/quota workflow. Focused boundary —
`15 suites / 159 tests PASS`.

## Production-build report/browser acceptance

Exact implementation `94db1fdd20f816c785fb4153cbaccca37890f94d`
закрывает report/download/mutation journey на отдельном restored-copy clone:

- production-build `/reports` загружается без RSC/render error и без `P2037`;
- CSV/XLSX download возвращает `200`, private/no-store и safe attachment
  headers; XLSX содержит ровно 11 ожидаемых sheets;
- recommendation status mutation возвращает `PATCH 200`;
- OOS exclusion проходит `POST 200 → DELETE 200`, persisted residue равен нулю;
- browser console: `0 errors / 0 warnings`;
- whole-schema postflight сравнил `156` public tables: только десять ожидаемых
  fixture/workflow deltas, неожиданных изменений нет;
- перед exact drop активных sessions нет, database residue после drop равен
  `0`.

В ходе acceptance устранены Prisma `P2002` race атомарным
`RecommendationState.upsert` и `P2037` connection exhaustion ограничением SSR
fan-out до шести групп по два loader. Полный отчёт:
[production-build report browser evidence](./gate-1mt-report-browser-evidence-2026-08-18.md).

## Postflight и cleanup

После тестов:

```text
fixture tenants = 0
fixture users = 0
target core rows = 3 tenants / 4 stores / 30 users / 1483 products / 51257 guests
source core rows = 3 tenants / 4 stores / 30 users / 1483 products / 51257 guests
disposable database residue = 0
```

Для browser-клона перед cleanup было подтверждено ровно
`1 tenant / 2 stores / 2 users / 2 products / 6 entitlements`. Его core counts
были `4/6/32/1485/51257`, source template остался
`3/4/30/1483/51257`; после exact `DROP DATABASE ... WITH (FORCE)` database
residue равен `0`.

Attachment-клон после двух успешных прогонов подтвердил fixture residue
`0 tenants / 0 users / 0 attachments / 0 bindings`; его core counts точно
совпали с source template (`3/4/30/1483/51257`). Exact disposable database
удалена, database residue равен `0`.

Assortment HTTP-клон `leetplus_gate1mt_reports_http_test_a1` после двух
успешных `14/14` прогонов подтвердил exact equality семи
затронутых table counts; его core counts
точно совпали с clean source (`3/4/30/1483/51257`). Перед удалением проверены
exact database name и zero sessions; после `dropdb --force` database residue
равен `0`.

Accepted report/browser-клон `leetplus_gate1mt_reports_browser_test_a3`
сравнён с source по всем `156` public tables. Изменились только десять
ожидаемых fixture/workflow tables; временный `ProductOosExclusion` удалён и
вернулся к source count. Перед exact drop активных sessions не было, после
drop database residue равен `0`.

Пароль PostgreSQL не выводился и не сохранялся в Git. Одноразовая БД была
удалена только после проверки отсутствия fixture-данных и совпадения ключевых
контрольных агрегатов с источником.

## Что этот gate не закрывает

До первого внешнего клуба остаются:

1. controlled outbound email/digest canary: report browser/download/mutation
   journey закрыт, но send actions были выключены и не вызывались;
2. STORES adoption пяти network-only staff parents, remaining attachment
   archive/orphan browser matrix, background jobs, Telegram, public guest
   binding и outbound fail-closed matrix; native writer/lifecycle/races и
   OWNER upload/bind/download/unbind/quarantine browser flow уже приняты;
3. Gate 2 текущей сети A1–A4 и стабильное internal-alpha окно;
4. production `PREPARE`: roles, secrets, monitoring, rollback и controlled SMTP
   canary;
5. отдельный persisted GO, создание Tenant B/Store B1 и mailbox-bound OWNER
   invite.
