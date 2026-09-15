# 04 — Сквозная приёмка и документация реализации

**Требования:** R01, R02, R03, R04, R05, R06, R07, R08, R09, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19, R20
**Blocked by:** 02, 03
**Волна:** 3
**Зона:** docs/, apps/api/src/tenancy/gate-1mt.postgres.spec.ts, external evidence browser fixtures
**Status:** ready

## Из брифа

> «реализуй первый вариант»
> «По доработкам согласен»
> «Услуги и продажи; пополнения отдельно (рекомендую)»

## Спецификация

Читайте spec.md: «Истории и приёмка», «Математика и источники», «API и модульные границы», «Обязательный точный визуальный эталон», «Визуальные и эксплуатационные условия».

## Что должно заработать

Проверитьинтегрированныйрезультатсогласованнымисценариями, включаяPostgreSQLизоляциюипереходы; записатьфинальныеAPI/UIограничениявдокументацию. Неисправлятьпроизвольныесоседниеподсистемы. Прикодовойрегрессиисообщитьrootдлявладельца,неразмыватьzones.

Критерии:
- Проверкиалиасов/дат/1и2клубовподrealfixture PostgreSQL, negative scopeсохраняется. ЕслисуществующийPGfixtureдостаточен—расширитьузко,не новыйтестовыймонолит.
- SyntheticWebfixtureвexternal evidence показываетполныйavailable/partial/missing/error иреальные01DTO; длявизуальнойсверкииспользоватьмакетныеvalueкакfixture,неappconstants.
- Freshdesktop944mobile390screens,primaryinteractions/contrast/noclip; PNGсравненысreference, design-qa.mdPASSpreservesknownlive-stateintentionaldifferences.
- ПроизводительностьfirstKPI/fullсфактами,непридуманнаяцель; nofullCRMquery. Еслиневыполнимruntimeбезсерверногоразрешения—отдельноисходники/fixtureproofневыдаватьзапрод.
- Обновитьmetriccontract, security/runtime/openbetasource-onlyпараграф дляновогокода, текущийb5productionнепереписыватьпоCI. AGENTSизменениячерезroot INTERFACES.
- Подготовитьreviewable release/acceptancehandoff сsourceSHA/проверками/неполнымиданнымибезsecrets; productioneffectне выполнять.
