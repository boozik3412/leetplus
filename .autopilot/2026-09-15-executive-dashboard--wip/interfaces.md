# Интерфейсы и правила v2

План обновлён по новым навыкам. Реализация на паузе. Этот файл заменяет прежнюю схему чисто серверного первого шага.

## Обязательные навыки по зонам

- Все авторы метрик: C:/Users/ALIENWARE/.codex/skills/leetplus-dashboard-ux/SKILL.md и references/metric-contracts.md.
- UI/пояснения: C:/Users/ALIENWARE/.codex/skills/leetplus-ux-writing/SKILL.md и references/copy-and-states.md.
- Компоненты/тема: C:/Users/ALIENWARE/.codex/skills/leetplus-design-system/SKILL.md и references/theme-and-components.md.
- Приёмка: C:/Users/ALIENWARE/.codex/skills/leetplus-ui-quality/SKILL.md и references/acceptance-matrix.md.

Предметные contracts находятся в spec.md, UI_CONTRACTS.md, ACCEPTANCE.md. Скиллы не расширяют пользовательский объём до всего frontend.

## Границы и будущие стабильные интерфейсы

| Модуль | Владеет | Выставляет | Прячет |
|---|---|---|---|
| Scope/metric contract | Одинаковый период, разрешённые клубы, сравнение, cutoff и определение метрики | Проверяемый контекст и typed metric metadata | Нормализацию legacy aliases, основания коэффициента и coverage |
| Executive data | Чтение и классификация сохранённых фактов, агрегаты по клубам/дням | Основные показатели и независимые вторичные данные | Prisma, источник/дедупликацию/полноту; не возвращает сырые PII |
| Metric/filter presentation | Единое отображение данных и запросов, тексты/действия по роли | Совместимые карточка, источник, фильтр, детали | Formatting и применимые interaction states; не считает бизнесформулы |
| Executive page | Выбранная композиция1 и рабочий маршрут руководителя | /dashboard, сопоставимые графики/таблица/приоритеты | Управление последним запросом и применение поддерживаемых URL |
| Drill-down adapters | Связь значения со строками и восстановление контекста | Работающие маршруты/детали того же grain | Несовместимые параметры не уходят незаметно |

Семантический контракт: value:number|null, unit/definition/grain, фактическое data state, reason, coverage с указанием основания, source dates и asOf. Реальный DTO сверить с существующими типами, не навязывать universal enum. current/previous + absoluteDelta/percentDelta/pointsDelta определяют сравнение; процент может бытьnull при базе0.

Loading/refresh/error запроса и data state независимы. AppliedScope связан с принятым результатом. Поздний ответ не меняет последний выбор. Все детали используют этот же контекст; при изменении данных между запросами нельзя молча смешивать поколения.

Primary/secondary остаются логическими частями для скорости и независимости ошибок. Candidate URLs /dashboard/executive-summary и /dashboard/executive-operations пока не являются установленным transport contract. В01 закрепить минимальный реальный контракт/метод публичной границы и передать root. До параллельного02/03 интерфейс должен быть конкретным; не писать два разных API по догадке.

## Первый сквозной срез

Товарная выручка выбрана потому, что её сохранённые факты уже имеют дату/клуб/сумму/отмену и не требуют подменять смысл услуг или мощности. Срез охватывает query/доказательство данных, actual app component, общий выбор клубов, статус/пояснение и соответствующую детализацию. Проверка идёт через реальные компоненты/сервис на разрешённой fixture, а не через прежний standalone HTML.

Контрактные states остальных KPI могут проверяться на typed fixture, но01 не отмечает готовыми их расчёты. Общий helper не должен дублировать existing DashboardFilters или существующее state-представление; извлечь только действительно совместимое поведение. UI-часть01 не меняет всю страницу до интеграции03.

Результат01: закреплённые signatures и context, перечень изменённых общих компонентов/потребителей и способ проверки. После него02 пишет backend-расчёты,03 использует общий контракт и примитивы. Изменение общей границы согласуется root до правки; нельзя одновременно править одну зону.

## Общие правила исполнения

- Checkout: C:/Users/ALIENWARE/Documents/New project/leetplus-assortment-action-center; branch codex/executive-dashboard-20260915; исходная база696c3486614b4f3084018a0f89974bf78384a552. Свои worktree/ветки/commits не создавать.
- Прочитать действующие AGENTS.md; перед данными/scope/auth/integration — полностью docs/security/runtime-security-contours.md. Источник production не выводить из ветки/merge.
- Сохраняются Nest/Prisma/Next16.2.4/React19.2.4/Phosphor/Recharts/Tailwind и .dark. Установленные версии перепроверить. Для Next читать node_modules/next/dist/docs.
- Состояние запроса и состояние данных различаются. Исходный enum интерпретируется по конкретному полю API; generic mapping по названию недостаточен.
- Все GET только читают сохранённые данные. Нет syncComputerCounts, provider calls, backfill, reward/ledger effects, изменения ролей, schema, migration или network/control.
- FreshStoreScope и capabilities проверяются сервером. Client scopeKey/requestId — контекст отображения, не authorization token. Не раскрывать чужие counts или скрытые ресурсы через причины/подсказки.
- Оперативная сводка не подменяется полным трёхмесячным CRM; legacy CRM сохраняет смысл.
- Не писать .autopilot/interfaces/state самостоятельно: root обновляет контракты по возвращённому INTERFACES-блоку. Не менять соседние zones.
- Evidence: C:/Users/ALIENWARE/Documents/New project/deploy-evidence/executive-dashboard-20260915. Полный ERROR_LOG читать перед retry/production-командой; append cause/changed condition; каждый gate имеет отдельные stdout/stderr/exit.
- Агентам не выполнять production/auth/sync. Старые JWT/окна CANARY не переиспользовать. Кодовые агенты сейчас не запущены.
- API test: pnpm.cmd --filter api exec jest --runInBand --runTestsByPath src/<file>.spec.ts; API typecheck: pnpm.cmd --filter api exec tsc --noEmit -p tsconfig.build.json.
- Web: pnpm.cmd --filter web typecheck; pnpm.cmd --filter web build; scoped lint через pnpm.cmd --filter api/web exec eslint <paths>.
- Browser выбирается действующим процессом; ранее пользователь явно разрешил локальный Chromium. Новый рендер/стенд проверять заново, не считать старый порт или55проверокHTML доказательством продукта.
