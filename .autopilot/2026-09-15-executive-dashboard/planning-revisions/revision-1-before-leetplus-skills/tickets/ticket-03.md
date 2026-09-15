# 03 — Первый визуальный вариант и согласованные переходы

**Требования:** R01, R02, R03, R05, R06, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19, R20
**Blocked by:** 01
**Волна:** 2
**Зона:** apps/web/src/app/(app)/dashboard/, apps/web/src/components/executive-*, apps/web/src/lib/dashboard-executive*, apps/web/src/lib/assortment-report-query*, apps/web/src/app/(app)/assortment/dashboard/page.tsx, apps/web/src/components/dashboard-filters.tsx
**Status:** ready

## Из брифа

> «реализуй первый вариант»
> «По доработкам согласен»
> «Услуги и продажи; пополнения отдельно (рекомендую)»

## Спецификация

Читайте spec.md: «Истории и приёмка», «Математика и источники», «API и модульные границы», «Обязательный точный визуальный эталон», «Визуальные и эксплуатационные условия».

## Что должно заработать

Встроить выбранный01макетвсуществующийNextapp иподключитьреальные01/02DTO. Правильныепереходычастьфичи. ОсновныеданныеSSR/streaming, интерактивныетолькоchart/filter/disclosure. Соседнийассортиментсохранить; общиефильтрыулучшатьопциональнымрежимом,неперестилизациейвсегопродукта.

Критерии:
- Точные reference PNGdesktop/mobileиHTML01 просмотрены; geometry/layout, Phosphor/systemfont иsidebarучтены. Никакихdemofacts вruntime.
- 5KPIиstate/reason/coverage; partialmoneyневыглядитconfirmed; пустойстатуснеподменяет0;сравнениенеизcomputedдругогоохвата.
- Графиквыручка/визиты/предыдущийпериод, holesне0, accessibleальтернатива; clubtableсnullableячейкамииданнымиподвыборкой.
- До3доказанныхприоритетов: currentdataquality/stock/visitdecline/CRM; неfixed35%правилои нестарыйсмешанныйДеньгивриске.
- Primaryполучается отдельноотoperations, иошибкаsecondaryнеблокируетоснову; top sourcepanelcollapsed, раскрытиебезsync.
- Числоваядетализацияиспользуеттотжеcore поStore/day. Existing revenue-by-clubобновитьнаэтотконтракт, rawdiagnosticsотделитьотподтвержденногоитога. Неотправлятьоперативныйvisitcountв3monthCRMкакравнозначныйreport.
- Всеаналитическиессылкисохраняютperiod/store/asOf. Исправитьdashboard→assortment07–13.09, поддержатьcanonicalиlegacyaliases, test реальныхURL/принимаемыхpageparams.
- RefreshscreenповторяетGET, existingRefreshTodayлишьявноеотдельноепровайдерадействие; никакогоновогосинхроэкшена.
- 1440/944/390, keyboard/aria/escape/focus/типичныеerror/loading/empty/partial; действительныедатыиклубывшапке,неellipsisдляосновныхзначений.
- Typecheck/lint/build, meaningfuladaptertests. Новыепакеты,sourceglobalstyles,APIкод не менять. ЕслиUIнуженнедостающийbackendfield—rootконтракт.
