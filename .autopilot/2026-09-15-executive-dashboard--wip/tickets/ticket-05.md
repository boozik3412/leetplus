# 05 — Исправления итоговой приёмки состояния остатков

**Требования:** R05, R06, R15, R16, R19
**Blocked by:** 03
**Зона:** apps/web/src/components/executive-dashboard.tsx; при необходимости только существующий shared metric presentation
**Статус:** done — wrapper and child safeguards reviewed, static gates passed

## Основание

Actual-Next acceptance04: fixture stale имеет ненулевое health.data, но wrapper operations.assortment.state/reason не показаны. Старые остатки выглядят текущими и создают приоритет «Пополнить позиции без остатка». Evidence: deploy-evidence/executive-dashboard-20260915/full-ui-qa/acceptance-runs/stale/result.json и full-acceptance/README.md. Это продолжение пользовательских требований к честной свежести/показателям и трём подтверждённым действиям, не новый продуктовый scope.

## Результат и приёмка

- При наличии data всё равно отображать применимые wrapper state/reason (особенно STALE, FAILED, MISSING); сохранять дату действительного наблюдения, не переименовывать cutoff в дату остатков.
- Старое значение допустимо как явно прошлое. STALE/FAILED/MISSING источник не создаёт подтверждённую текущую бизнес-рекомендацию пополнить товар. Доступны объяснение/чтение и соответствующее роли действие, без provider effects.
- PARTIAL свежие подтверждённые позиции не теряются автоматически: видимый контекст неполноты и только обоснованные действия по известным данным.
- Основные KPI при проблеме secondary остаются; full AVAILABLE fixture сохраняет подтверждённый OOS-приоритет и значения.
- Исправить уже наблюдённую подпись «1 товарных позиций»: нормальное склонение позиции/позиций для0/1/2/5/11/21 без новой библиотеки.
- Только необходимая UI правка; source/auth/API/wire/roles не менять. После scoped lint/typecheck/build frozen UI передать QA владельцу04 для повторов stale/full, не дублировать весь зелёный набор.

Исполнитель читает prompts/executor.md, AGENTS и leetplus-dashboard-ux, ux-writing, design-system, ui-quality. Вернуть compact STATUS/FILES/TESTS/INTERFACES/REQUIREMENTS/CONCERNS/BLOCKERS. Root делает review/commit, сам автор не коммитит.
