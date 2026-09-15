# 04 — Приёмка по ожидаемым данным и документация

**Ревизия:** 2
**Требования:** R01, R02, R03, R04, R05, R06, R07, R08, R09, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19, R20
**Blocked by:** 02, 03
**Волна:** 3
**Зона:** docs/, apps/api/test/pilot-assortment-store-scope.pg.integration-spec.ts, external evidence browser fixtures
**Статус:** done — PG16/16, docs and Q01–Q18 evidence completed with source limits

## Из брифа

> «реализуй первый вариант»
> «Услуги и продажи; пополнения отдельно (рекомендую)»
> «с учетом обновления новых навыков переосмысли задачу»

## Результат

Сквозная проверка изменённого приложения по ACCEPTANCE.md и документация действительных результатов/ограничений. Не считать источники, фикстуры, реальнуюсессию иproductionоднимуровнемдоказательства.

## Применить

leetplus-ui-quality/acceptance-matrix, leetplus-dashboard-ux/metric-contracts, leetplus-ux-writing/copy-and-states иleetplus-design-system/theme-and-components; spec9.

## Приёмка

- Q01–Q18 получают expected/actual иevidence. Подтверждены числа, составстрок, порядок, destination/возврат, поздниеответы; наличияhandler/aria/toast недостаточно.
- На actual app сdeterministicfixture проверены distinct sizes клубов,0/null/partial/stale/error, role restriction, историческиепереходы иинактивныеисторическиепродажи.
- Сохранены ипросмотреныfreshscreens на1440/944/390, применимыетемы; контрастизмереннареальныхфонах,клавиатура проверенавручную/инструментом. ПолныйWCAGclaim не делать.
- ExistingPostgreSQLизоляциярасширяетсяузко при необходимости, auth/role права неослабляются. Browserfixtureне хранитJWT/секреты/PII.
- FirstKPI/full latency измерены иописанысобъёмом/средой. Недоступное NOT_RUN/SKIPPED/BLOCKED спричиной, неPASS.
- Новаяприёмка неприсваиваетсебе55проверок standaloneHTML; теостаютсяисториеймакета.
- Документы/APIконтракт/security/openbeta фиксируютsource/currentproductionраздельно; прошлоеb5состояниенеменяетсяпотому чтоCIзелёный. AGENTS-измененияпередатьroot.
- Подготовить конкретныйhandoff безсерверныхeffects. Любойкодовыйдефект передатьвладельцу зоны, невыполнять произвольныйрефакторингдругихподсистем.

Исполнитель читает C:/Users/ALIENWARE/.codex/skills/autopilot/prompts/executor.md передпервойправкой ивозвращает краткий STATUS/FILES/TESTS/INTERFACES/REQUIREMENTS/CONCERNS/BLOCKERS. Пауза снята пользователем; запуск по зависимостям и команде root.

## Подготовленные реальные тестовые инструменты

Root создал отдельный PostgreSQL16.13 fixture на127.0.0.1:55495: C:/Users/ALIENWARE/Documents/New project/deploy-evidence/executive-dashboard-20260915/pg-fixture. Canonical schema применена, production и прошлый fixture55494 не менялись. README содержит opt-in flag и точную команду существующего PG набора. Не создавать поверх него другой кластер и не менять production connection; проверить identity перед использованием.

Full actual-Next fixture подготовлен в evidence/executive-dashboard-20260915/full-ui-qa:4321 API,4322 Web. Локальный fixture login выдаёт подписанный короткий test JWT с одноразовым process key; это только изолированный presentation/role fixture и не production auth canary. Не менять app proxy/guards. После freeze03 использовать единственную согласованную Web build, актуальные scripts/README и запрет non-loopback requests.
## Поэтапный запуск приёмки

После freeze03 и стабильного wire из01 можно параллельно выполнять браузерную часть04 на явно синтетическом actual-Next стенде. Это не является приёмкой ещё проверяемого02. Новые PG executive assertions и финальные current-state документы завершаются только после API freeze/принятия02; source API-файлы в ходе browser QA не меняются. Root проверяет результаты двух частей отдельно. Это уточнение порядка внутренних проверок, без изменения пользовательских требований.
