# AccessScope: документация открытого теста

| Поле | Значение |
|---|---|
| Статус | Active |
| Версия контракта | 1.2.0 |
| Дата | 27.07.2026 |
| Владелец | LeetPlus engineering |
| Связанный backlog | `BETA-SEC-003`, `BETA-SEC-006`, `BETA-IAM-001..003`, `BETA-CUT-001`, `BETA-CUT-003`, `BETA-CUT-008` |
| Исходный baseline | `eb7ad9ef7d4783c47a7ddb5efbc271e5eb8a2fe2` |
| Schema-only candidate | `28724008192442c03f35fcc46ff7de78cdead642` — not deployed |
| Strict application candidate | `df993a9d04fdb48809868555b0d040d52848e3ee` — not deployed |
| Attachment ACL checkpoint | Working candidate, exact SHA pending — not deployed |

Это каноническая документация server-side области доступа для перехода LeetPlus к
invite-only открытому тесту. Она отвечает на вопросы:

- кто может работать со всей сетью, а кто — только с выбранными клубами;
- где хранится это решение и почему JWT не является источником истины;
- как безопасно классифицировать текущую сеть из четырёх клубов;
- в каком порядке подключать users/roles, персонал, коммуникации, геймификацию и
  ассортимент;
- какие проверки обязательны до выдачи внешнего доступа.

## Зафиксированный контекст

- Четыре текущих клуба — четыре `Store` одного существующего `Tenant`.
- Они не разделяются на четыре tenant и не переносятся в новую сеть.
- Текущий `tenantId` и данные клубов сохраняются.
- Production и operational tenant не изменяются автоматически из этой ветки.
- Каждая новая независимая сеть получает отдельный `Tenant`.
- Первый внешний тест остаётся invite-only.

## Пакет документов

1. [ADR: источник полномочий](./v1/adr-0001-access-scope-authority.md) — почему
   выбран persisted `NETWORK | STORES`.
2. [Нормативный контракт](./v1/access-scope-contract.md) — обязательное поведение
   API, списков, detail, агрегатов, файлов и фоновых процессов.
3. [Runbook миграции и отката](./v1/migration-rollout-rollback-runbook.md) —
   preflight, expand, классификация, shadow, enforce и rollback.
4. [Матрица внедрения по модулям](./v1/module-adoption-matrix.md) — surfaces,
   порядок и критерии `VERIFIED`.
5. [Стратегия тестирования](./v1/test-strategy.md) — topology двух tenant,
   негативные сценарии и release gates.
6. [План внедрения для персонала и коммуникаций](./v1/staff-communications-adoption-plan.md) —
   `INVENTORY` девяти staff/attachments/chat surfaces, attachment backfill,
   порядок внедрения и exit criteria.
7. [ACL вложений: модель, миграция и ввод в эксплуатацию](./v1/attachment-acl-rollout.md) —
   lifecycle файла, parent-aware authorization, EXPAND/dual-write/backfill,
   quarantine, activation gates и rollback.
8. [ACL вложений: implementation checkpoint](./v1/attachment-acl-implementation-checkpoint.md) —
   фактически реализованные schema/runtime flows, 155 migrations, проверки,
   текущие ограничения и точные следующие шаги.

Release evidence хранится в `evidence/<release-sha>/`. Evidence не содержит
секретов, токенов, email, телефонов или необработанных production ID.

## Текущая стадия

`DESIGN ACCEPTED → IMPLEMENTED CANDIDATE / EXPAND + PARTIAL DUAL-WRITE`.

До завершения классификации существующих аккаунтов и модульной матрицы решение
для внешнего доступа остаётся `NO-GO`. Отсутствующий или противоречивый scope
обрабатывается fail-closed.

`EXPAND` schema и strict application — два отдельных activation шага. Текущий
candidate нельзя передавать в auto-deploy как единый production bundle:
сначала применяется schema-only migration, затем выполняется явная
классификация, и только при нуле unresolved active subjects включается strict
reader.

Для attachment ACL schema candidate содержит 155 миграций, latest —
`20260727113000_staff_attachment_acl_invariant_hardening`. Native bind и
parent-aware reader реализованы для chat и новых shift-report uploads. Для
`STAFF_TASK`, `CHECKLIST_RUN`, `KNOWLEDGE_ARTICLE`, `SHIFT_REGULATION`,
`TRAINING_COURSE`, `ONBOARDING_PLAN` producer/reader adoption остаётся pending.
Read-only inventory реализован, apply-backfill отсутствует. Поэтому
`STAFF_ATTACHMENT_ACL_MODE=ENFORCED` нельзя активировать до
inventory/backfill/reconciliation; внешний доступ остаётся `NO-GO`.

Для безопасного перехода реализован process-wide
`STAFF_ATTACHMENT_ACL_MODE=LEGACY|SHADOW|ENFORCED`: `LEGACY` сохраняет
tenant-only read, `SHADOW` вычисляет strict decision и безопасно логирует
mismatch, но отдаёт legacy result без quarantine expired pending, `ENFORCED`
делает parent ACL и TTL quarantine авторитетными. Production требует явный
mode; local/test default — `ENFORCED`, CI startup contract — `SHADOW`.
`LEGACY/SHADOW` допустимы только внутри закрытого перехода и запрещают внешний
beta; `ENFORCED` разрешён только после adoption, backfill и canary.

Inventory scanner выполняет весь scan в одной read-only `REPEATABLE READ`
snapshot transaction. Secondary review coverage включает chat body, task
description/checklist, checklist answers и остальные rich-text/JSON sources;
secondary copies не создают полномочий или automatic binding.

Четыре текущих клуба по-прежнему являются четырьмя `Store` одного `Tenant`.
Первый внешний тест после прохождения gates включает полные модули
геймификации, ассортимента, сотрудников, коммуникаций и users/roles только в
пределах собственного tenant/allowed stores.

## Управление версиями

- Изменение смысла `NETWORK`, `STORES` или правил видимости — новая major-версия
  контракта и новый ADR.
- Дополнение поверхности теми же правилами — minor-версия.
- Исправление формулировок и ссылок — patch-версия.
- ADR не переписывается задним числом: новое решение supersedes старое.
- Runbook, матрица и тест-стратегия обновляются вместе с реализацией.

## Changelog

- `1.2.0`, 27.07.2026 — зафиксированы attachment rollout modes, beta gates,
  safe shadow semantics и единый RepeatableRead inventory snapshot с secondary
  copies.
- `1.1.0`, 27.07.2026 — добавлен attachment ACL implementation checkpoint:
  155 migrations, partial chat/shift dual-write, read-only inventory, rollout
  ограничения и `NO-GO` до backfill/parent adoption.
- `1.0.0`, 27.07.2026 — принят persisted AccessScope, зафиксированы topology,
  безопасная миграция, порядок модулей и release gates.
