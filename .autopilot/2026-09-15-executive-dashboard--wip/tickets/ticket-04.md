# 04 — Приёмка по ожидаемым данным и документация

**Ревизия:** 2
**Требования:** R01, R02, R03, R04, R05, R06, R07, R08, R09, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19, R20
**Blocked by:** 02, 03
**Волна:** 3
**Зона:** docs/, apps/api/src/tenancy/gate-1mt.postgres.spec.ts, external evidence browser fixtures
**Статус:** ready — пауза снята пользователем

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
