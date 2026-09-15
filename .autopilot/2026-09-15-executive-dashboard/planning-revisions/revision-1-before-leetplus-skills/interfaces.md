# Общие интерфейсы и правила

## Границы, решённые в спецификации

| Модуль | Владеет | Выставляет | Прячет |
|---|---|---|---|
| executive core | Период/comparison, DTO, чистая математика и состояния | resolveExecutivePeriod + buildExecutiveSummary(input), стабильные wire DTO | Классификация денег/сессий/coverage, агрегация |
| executive loader/API | Fresh tenant/store scope и bounded чтения | GET /dashboard/executive-summary и GET /dashboard/executive-operations | Prisma queries, topology/source proof/capabilities; no provider effects |
| summary Web | Макет1, фильтры, charts/детали | /dashboard и существующая денежная детализация | Formatting/URL adapters/local disclosure, не копия бизнесформул |
| report transitions | Canonical period/store/asOf передача | существующие URL/параметры/переходы | legacy alias normalization, не смена определенияCRM |

Швы: публичный pure engine; API loader с FreshStoreScope; HTTP DTO; Web scopeadapter + реальный browser переход. Новые public signatures согласуются здесь до изменения потребителей. Если seam отсутствует, сообщить root; не создавать второй двигатель/формулу.

## Рабочая среда

- Единственный checkout: C:/Users/ALIENWARE/Documents/New project/leetplus-assortment-action-center; branch codex/executive-dashboard-20260915; base696c3486614b4f3084018a0f89974bf78384a552. Свои ветки/worktrees/commits не создавать.
- Stack Nest11/Prisma6/Next16.2.4/React19.2.4/Recharts3/Phosphor/pnpm10.33.2; зависимости ужеустановлены. Нет установкипакетов/миграций без root.
- Root AGENTS и apps/web/AGENTS обязательны. Перед API/data/scope/integration читать полностью docs/security/runtime-security-contours.md. Nextguide читать из apps/web/node_modules/next/dist/docs; продукт существующий, не scaffold.
- Пользователь выбрал вариант1; точные reference PNG/HTML вspec. Не переноситьдемоданные/фиктивныйbadge«подтверждено» вruntime.
- Пользователь подтвердил: главная Выручка — услуги и продажи, пополнения отдельно. Нельзя считать всеnegative/неизвестныетипы услугами; нельзя max(global)vsperclub. Неоднозначность→partial/nullсreason/basis, без двойногоучета.
- Не изменять schema,migrations,providerwrites,workerprofile,network/Auth/guest-game/reward/ledger,source-vs-settlementbinding. Все новые GET read-only, даже при missing computerCount.
- У backend только FreshStoreScopeService.resolveRequestedStoreIds, re-readauthority. Нет расширенияк чужимклубам, tenant, CRMcapabilities. Unknownscopeddetailsнепубликуютсчетчикичужихклубов.
- Сохранять существующий трёхмесячный CRMконтракт; основнаястраницанеиспользуетполный GuestsSummary.
- Root owns .autopilot/AGENTS markers/git/release; исполнители пишуттолькосвоизоны. Не писатьinterfaces.md самостоятельно — вернутькороткийINTERFACESблок.
- Любые productionдействия/чтения выполняет root с собственнымжурналом; агентамсервер/учётныеданныене нужны. Не вызыватьsync/auth/provider.
- Tests: pnpm.cmd --filter api exec jest --runInBand --runTestsByPath src/<file>.spec.ts; API types: pnpm.cmd --filter api exec tsc --noEmit -p tsconfig.build.json; Web: pnpm.cmd --filter web typecheck; build: pnpm.cmd --filter web build; scoped eslint через pnpm.cmd --filter api/web exec eslint <paths>.
- Tests/logs/выходныеартефакты: C:/Users/ALIENWARE/Documents/New project/deploy-evidence/executive-dashboard-20260915. Перед retry и productionкомандой читатьполный ERROR_LOG.md; дописыватьcause+changedcondition, затемповтор. Каждыйgateимеетсвойstdout/stderr/exit. Не запускатьполныесьютыпараллельноавторами, root группирует.
- Browser: CUA ранееошибка Codex auth token is unavailable; пользователь явноразрешил локальный Chromium. Не повторять permission; Playwright ужеесть. SyntheticUIserver/fixture должныбытьлокальными/явнопомеченными. Нетнастоящихтокеноввtrace/storageState/логах.

## Wire contract — закрепить в01

ExecutiveMetric{value:number|null,state:AVAILABLE|PARTIAL|STALE|MISSING|FAILED|UNKNOWN,reason:string|null,coverage:{covered,total,percent},asOf:string|null,basis?:string}. ExecutiveGrowthMetric{current:ExecutiveMetric,previous:ExecutiveMetric,deltaPercent:number|null,deltaPoints:number|null}. Использовать nullable state, не truthyvalue; confirmed0валиден.

Primary response: scope{tenantName,period,from,to,comparisonFrom,comparisonTo,selectedStoreIds,asOf}; kpis{revenue,visits,incomePerVisit,loadPercent,productRevenue}; productShare,activeGuests,gameRevenue,topups; stores[]; trend[]; sources[]. Опциональные детали DTO определяет01 и передаётroot доAPI/UI.
Secondary response: same scope, assortmentHealth(existing shared summary), CRM ready/partial/missing counters только когда доказанsame scope идоступ, sourcequality. До3приоритетовизcurrentcore+operations, выводитliveодноименныепереходы.

Primary не вызываетполныйDashboardSummary илиGuestSummary. Secondary использует existingAssortmentHealthLoaderбезменыегоформул/coverage. UI можетиспользоватьSSR/Suspense для independentsecondary или existingprivateBFF pattern, безсекретоввclient.
