# 01 — Сквозной пилот: товарная выручка, фильтр и объяснение

**Ревизия:** 2
**Требования:** R02, R03, R05, R06, R12, R17, R19, R20
**Blocked by:** —
**Волна:** 1
**Зона:** shared executive contract/product-revenue service slice, apps/web/src/components/metric-*, apps/web/src/lib/metric-presentation*, apps/web/src/components/dashboard-filters.tsx
**Статус:** done — source, static gates, independent review and bounded actual-component QA passed

## Из брифа

> «реализуй первый вариант»
> «Услуги и продажи; пополнения отдельно (рекомендую)»
> «с учетом обновления новых навыков переосмысли задачу»

## Результат

Один рабочий путь «сохранённые продажи → сервис/DTO → настоящая карточка → фильтр клубов → объяснение и соответствующая детализация». Это завершённый подэтап для товарной выручки, а не объявление готовыми всех KPI. Примитивы остальных состояний проверяются без фиктивных runtime-расчётов.

## Применить

Все четыре новых LeetPlus-навыка по interfaces.md. Прочитать spec v2 разделы3–5 и8, UI_CONTRACTS.md, Q01/Q02/Q05/Q07/Q09/Q11/Q13/Q15–Q17 из ACCEPTANCE.md.

## Приёмка

- Определены метрика/единица/grain/coverage/destination. Товарная выручка учитывает правильную популяцию и отмены; отсутствие cost не скрывает revenue.
- Контекст query/ответа/карточки/детализации одинаков; сценарийA+B даёт14000товарнойвыручки истрокиA+B.
- Проверены confirmed0/null/partial/stale/requesterror как разные состояния. Значимые объяснения рядом с числом, действие доступно роли.
- Использован или совместимо расширен существующий фильтр; Back/reload и позднийответ не показывают старое значение под новой выборкой.
- Shared component roles работают в .dark/light, есть keyboard/focus; не введена новая библиотека/тема/генератор токенов.
- Срез работает в actual app components и публичной service boundary на deterministic fixture. Прежний HTML не является этой приёмкой.
- До02/03 возвращён root конкретный INTERFACES-блок. Остальные R02/R07/R09 ивесьэкран остаютсяpending; не расширятьзавершениеза пределыпилота.

Исполнитель читает C:/Users/ALIENWARE/.codex/skills/autopilot/prompts/executor.md передпервойправкой ивозвращает краткий STATUS/FILES/TESTS/INTERFACES/REQUIREMENTS/CONCERNS/BLOCKERS. Пауза снята пользователем; запуск по зависимостям и команде root.
