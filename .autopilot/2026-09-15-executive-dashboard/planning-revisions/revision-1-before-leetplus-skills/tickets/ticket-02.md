# 02 — Рабочая оперативная API сводка из сохранённых данных

**Требования:** R02, R03, R04, R05, R06, R07, R08, R09, R10, R11, R15, R16, R18, R20
**Blocked by:** 01
**Волна:** 2
**Зона:** apps/api/src/dashboard/
**Status:** ready

## Из брифа

> «реализуй первый вариант»
> «По доработкам согласен»
> «Услуги и продажи; пополнения отдельно (рекомендую)»

## Спецификация

Читайте spec.md: «Истории и приёмка», «Математика и источники», «API и модульные границы», «Обязательный точный визуальный эталон», «Визуальные и эксплуатационные условия».

## Что должно заработать

Подключить01кnew authenticated primary/secondaryGET под существующимDashboardController. Реальныеоперативныеагрегатыпоразрешеннойвыборке, безполного3месячногоCRM. API доступендоWeb, integration testsпоказываютнастоящие scoped queries.

Критерии:
- ResolveFreshStoreScope передчтениембизнесданных, strictrequestnormalization/allowedStoreIds/capabilitygates. Неослаблятьexistingguards.
- Подключить новые GET изspec, сохранитьlegacysummaryдляassortment. Primary boundedпоdate/store, минимумполей; осторожноеисточниковоепокрытиепоStore/day, не толькоразрешениеполученныхсессий.
- Деньгиclassifiedпоисходнымsemantics. ClubRevenueFact изplusвстаромimportнеявляетсяоказаннымидоходами! Неиспользоватьlegacymax+topup snapshot для новогоKPI. Еслинетдоказательств service-vs-product разделения, honestpartial/null,невыдумыватьsourceпротокол.
- Visits/activeguests exactperiodбез90дневногораздувания. Commonstore resolverиспользуетполныйtenanttopology, затемscope; неrewritesource IDs/times/eligibility.
- CapacityтолькоsavedcomputerCount/даты; никаких syncComputerCountsForTenant изGET. Аномалиивернутьnullablemetric,неcrash.
- Secondary sharedAssortmentHealth + scopedCRMсчетчикикогданеобходимыидоступны; missing/failedне0. НетCRMполнойсводки.
- Primary/secondaryодинаковыйscope/asOf, результатынепубликуютчужиеaggregatecounts. Authfailureнебизнесfallback.
- Service public-boundaryтестыcoverage/permissions/multipleclubs/read-only/money. Существующиеdashboardтестысохранить; DIfixturesобновитьявно.
