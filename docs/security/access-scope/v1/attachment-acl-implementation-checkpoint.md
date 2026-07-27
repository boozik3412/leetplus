# ACL вложений: implementation checkpoint

| Поле | Значение |
|---|---|
| Статус | `IMPLEMENTED_CANDIDATE` / chat + `STAFF_TASK` parent adoption / `NO-GO` |
| Версия | 0.6.0 |
| Дата | 27.07.2026 |
| Release SHA | Не назначен: checkpoint находится в рабочем candidate и не deployed |
| Backlog | `BETA-MOD-STAFF-009`, `BETA-MOD-COMMS-002`, `BETA-SEC-006` |
| Нормативный runbook | [attachment-acl-rollout.md](./attachment-acl-rollout.md) |

Этот документ фиксирует фактическое состояние реализации ACL staff-вложений на
27.07.2026. Он нужен, чтобы после паузы можно было отличить уже реализованное от
проектного контракта и продолжить rollout без предположений.

## 1. Контекст и release decision

- Четыре текущих клуба — четыре `Store` одной сети в одном существующем
  `Tenant`.
- Текущая сеть не делится на четыре tenant и не переносится автоматически.
- Каждая новая независимая сеть для внешнего теста получает отдельный `Tenant`.
- Первый внешний тест должен включать полный контур геймификации, ассортимента и
  товаров, сотрудников, in-app коммуникаций, а также пользователей и роли
  только в пределах своего `Tenant` и разрешённых `Store`.
- ACL вложений является P0-условием этого полного staff/communications scope.
- Текущий checkpoint не deployed и не разрешает выдачу внешних доступов.
- `STAFF_ATTACHMENT_ACL_MODE=ENFORCED` нельзя выпускать даже для текущей сети до
  production-like inventory, контролируемого backfill/reconciliation и
  выполнения activation gates. Причина: все legacy blobs после EXPAND
  классифицируются как `UNRESOLVED` и strict reader корректно вернёт для них
  `404`.
- `LEGACY` и `SHADOW` разрешены только для внутреннего перехода. Внешний beta в
  этих режимах запрещён.

Итоговое решение: `NO-GO`.

## 2. Угроза и авторитетная модель

Закрываемая угроза — same-tenant IDOR: пользователь клуба A знает UUID файла
клуба B той же сети и пытается скачать его через общий
`GET /staff/attachments/:id`.

Целевая цепочка полномочий:

```text
active user
  → persisted AccessScope (NETWORK | allowed STORES)
  → module capability
  → live parent resource
  → parent tenant/store/audience/membership/status/role policy
  → attachment binding
  → blob
```

UUID, `tenantId`, uploader, URL, диагностический `resourceStoreId` и данные JWT
по отдельности не дают права на чтение. Авторитетом после bind является только
живой parent resource. Один blob может иметь несколько parent bindings; доступ
есть, если хотя бы один живой parent доступен actor.

Blob читается из PostgreSQL только после положительного ACL-решения. Foreign,
out-of-scope, orphan, expired, unresolved и quarantined UUID маскируются
одинаковым `404`.

## 3. Архитектура и state machine

### 3.1. Состояния blob

| Состояние | Кто может читать | Допустимый переход | Текущее поведение |
|---|---|---|---|
| `PENDING` | Только exact uploader того же tenant до TTL | `PENDING → BOUND` в parent transaction; `PENDING → QUARANTINED` при истечении | Реализовано, TTL 24 часа |
| `BOUND` | Только через хотя бы один доступный live parent | Может остаться `BOUND`, пока существует хотя бы один `BOUND` binding | Реализован для `CHAT_MESSAGE`; `STAFF_TASK` candidate прошёл focused/full/build и bounded real-PG gates |
| `UNRESOLVED` | Никто | После reconciliation в `BOUND` либо `QUARANTINED` | Fail-closed `404` |
| `QUARANTINED` | Никто в обычном download flow | Только отдельное audited manual resolution | Fail-closed `404` |

### 3.2. Состояния binding

`StaffAttachmentBinding` хранит `tenantId`, nullable `attachmentId`,
`candidateAttachmentId`, `resourceKind`, `resourceId`, state, source,
SHA-256 `sourceKey`, автора/resolution и диагностический store snapshot.

Поддерживаемые schema-level kinds:

- `CHAT_MESSAGE`;
- `STAFF_TASK`;
- `CHECKLIST_RUN`;
- `KNOWLEDGE_ARTICLE`;
- `SHIFT_REGULATION`;
- `TRAINING_COURSE`;
- `ONBOARDING_PLAN`.

`resourceStoreId` не является authority. Trigger получает tenant/store из
живого top-level parent и обновляет snapshot. Cross-tenant blob, creator,
parent или store отвергаются на уровне PostgreSQL.

### 3.3. Инварианты и конкурентность

- `PENDING`, `UNRESOLVED`, `QUARANTINED` не могут иметь `BOUND` binding.
- `BOUND` обязан иметь минимум один same-tenant `BOUND` binding.
- BOUND binding обязан ссылаться на существующие blob и поддерживаемый parent
  одного tenant.
- Bind сериализуется через `SELECT ... FOR UPDATE` по blob в стабильном порядке.
- Delete binding также сначала блокирует blob. Это закрывает write-skew, когда
  две транзакции одновременно пытаются удалить последние две разные связи и
  каждая видит ещё незафиксированную связь другой транзакции.
- Deferred constraint проверяет соответствие lifecycle и числа bindings на
  commit, поэтому parent, binding и transition выполняются атомарно.

## 4. Что фактически реализовано

### 4.1. Schema и миграции

- `packages/database/prisma/schema.prisma`
  - enums lifecycle/resource/source;
  - поля lifecycle в `StaffAttachment`;
  - many-to-many `StaffAttachmentBinding` и relations.
- `packages/database/prisma/migrations/20260727110000_staff_attachment_acl_expand/migration.sql`
  - fail-closed lifecycle, binding table, FK/checks/triggers и deferred
    cardinality invariant.
- `packages/database/prisma/migrations/20260727111000_staff_attachment_state_reconcile_index/migration.sql`
  - online reconcile index.
- `packages/database/prisma/migrations/20260727112000_staff_attachment_pending_expiry_index/migration.sql`
  - partial online pending-expiry index.
- `packages/database/prisma/migrations/20260727113000_staff_attachment_acl_invariant_hardening/migration.sql`
  - same-tenant deferred assertion и serialization concurrent binding delete.

После добавления этих файлов release artifact содержит 155 миграций; ожидаемая
latest migration:
`20260727113000_staff_attachment_acl_invariant_hardening`.

### 4.2. API runtime

- `apps/api/src/staff/staff-attachment-bindings.service.ts`
  - единый generic atomic binder для поддерживаемых parent kinds и
    compatibility wrapper для chat;
  - tenant/uploader/state/TTL validation под row lock;
  - новый `StaffAttachmentBinding`, а для chat дополнительно dual-write в
    legacy `StaffChatMessageAttachment`;
  - compare-and-set `PENDING → BOUND`;
  - один плохой ID откатывает parent mutation и все bindings.
- `apps/api/src/staff/staff-attachments.service.ts`
  - upload создаёт `PENDING` с TTL 24 часа;
  - download управляется process-wide
    `STAFF_ATTACHMENT_ACL_MODE=LEGACY|SHADOW|ENFORCED`;
  - `SHADOW` вычисляет strict decision, пишет privacy-safe mismatch и сохраняет
    legacy response без lifecycle mutation;
  - в `ENFORCED` download сначала читает metadata, затем проверяет ACL и только
    после этого читает blob;
  - используется `REPEATABLE READ`;
  - expired pending переводится в `QUARANTINED/PENDING_EXPIRED` только в
    `ENFORCED`;
  - strict decision закрывает `UNRESOLVED`, `QUARANTINED`, orphan и неизвестные
    kinds; решение становится авторитетным только в `ENFORCED`;
  - для `BOUND` реализован `CHAT_MESSAGE`, а `STAFF_TASK` parent reader добавлен
    в рабочий candidate и проходит проверку.
- `apps/api/src/staff/staff-team-chat.service.ts`
  - create/update message выполняют bind внутри той же parent transaction;
  - attachment reader повторно применяет live channel и message audience;
  - проверяется непротиворечивость `STORE` channel/message.
- `apps/api/src/staff/staff-shift-reports.service.ts`
  - явный `AccessScope` для draft/send и выбора смены;
  - direct foreign shift не получает tenant-wide fallback;
  - новый файл shift report привязывается к созданному chat message в общей
    транзакции и поэтому использует `CHAT_MESSAGE`.
- `apps/api/src/staff/staff-tasks.service.ts`
  - list, quick/summary/groups, export и direct mutation применяют persisted
    `AccessScope`;
  - запрещённый explicit store filter возвращает `403`, а скрытый direct UUID
    для update/comment — `404`;
  - `STORES` видит store-bound task только в `allowedStoreIds`, а null-store
    task — только как exact assignee или нормализованный observer;
  - participant target для `STORES` обязан быть authoritative persisted
    `STORES` subset actor и иметь доступ к конкретному task store; platform
    admins исключены из participant selector/assignment;
  - direct create требует один store у task и assigned shift; direct update
    повторяет application-level equality check через transaction client после
    parent lock; read fail-closed скрывает shift вне actor
    `allowedStoreIds`;
  - create/update не назначают запрещённый store; structural PATCH null-store
    task для `STORES` запрещён, но exact assignee/observer сохраняет
    comment/self-service status actions;
  - managerial status transitions требуют `manage_staff_tasks`; одной роли
    недостаточно;
  - create начинает task только в `OPEN`; assignment labels server-owned;
    grouped task нельзя переназначить single-assignee PATCH, а candidate
    `ANY_OF` нельзя удалить из observers;
  - update/comment блокируют top-level task через `FOR UPDATE` и после lock
    повторяют visibility, store/shift/final-participant и status checks через
    transaction client;
  - task comment и `STAFF_TASK` binding создаются в одной transaction;
  - helper для attachment reader повторно применяет live task predicate и
    `view_staff_tasks`.
- `apps/api/src/auth/roles.guard.ts`
  - generic attachment route принимает union только attachment-related view
    capabilities; capability открывает parent ACL check, но не заменяет его.
- `apps/api/src/staff/staff.module.ts`
  - binder зарегистрирован как provider.
- `apps/api/src/config/environment-validation.ts`
  - production требует явный `STAFF_ATTACHMENT_ACL_MODE`;
  - допустимы только `LEGACY`, `SHADOW`, `ENFORCED`;
  - local/test без значения используют default `ENFORCED`.

Capability union текущего generic route:

- `view_communications`;
- `view_staff_shift_workspace`;
- `view_staff_tasks`;
- `view_staff_standards`;
- `view_staff_training`;
- `view_staff_knowledge`;
- `approve_guest_game_rewards`.

Управляющие capabilities учитываются общей capability-моделью как право чтения,
если такая иерархия уже задана. Нерелевантная capability не открывает route.

### 4.3. Web compatibility

`apps/web/src/components/staff-shift-report-editor.tsx` сохраняет legacy
attachments из draft в отображении и теле отчёта, но отправляет в
`attachmentIds` только файлы, загруженные в текущем editor session. Поэтому
legacy `UNRESOLVED` UUID не попадают в atomic binder и не ломают отправку
отчёта. Текстовая копия legacy URL не создаёт binding и не является
полномочием.

`apps/web/src/components/staff-task-history.tsx` хранит ID только свежего upload
текущей формы и передаёт его в `attachmentIds`, пока пользователь не изменил
evidence URL вручную. Canonical relative attachment URL отображается через BFF,
а произвольное редактирование URL сбрасывает pending binding intent.

### 4.4. Tests, tooling и CI

- `apps/api/src/staff/staff-attachment-bindings.service.spec.ts`;
- `apps/api/src/staff/staff-attachments.service.spec.ts`;
- `apps/api/src/staff/staff-shift-reports.access-scope.spec.ts`;
- `apps/api/src/staff/staff-tasks.service.spec.ts`;
- `apps/api/src/staff/staff-tasks.access-scope.spec.ts`;
- расширенные
  `apps/api/src/staff/staff-team-chat.service.spec.ts`,
  `apps/api/src/auth/roles.guard.spec.ts`;
- `packages/database/scripts/staff-attachment-acl-smoke.mjs`;
  - дополнительно создаёт реальный `STAFF_TASK` binding и проверяет derived
    parent store на clean schema;
- `packages/database/scripts/staff-attachment-backfill-dry-run.mjs`;
- команды в `packages/database/package.json`:
  `db:smoke:attachment-acl`, `db:inventory:attachment-acl`,
  `check:attachment-inventory`;
- focused boundary lint/tests и PostgreSQL smoke/inventory включены в
  `.github/workflows/ci.yml`.
- production startup contract в CI явно использует
  `STAFF_ATTACHMENT_ACL_MODE=SHADOW`.
- attachment service tests покрывают `LEGACY`, `SHADOW`, `ENFORCED`, включая
  отсутствие quarantine в `SHADOW`; scanner contract запускает parser/source
  `--self-test`.

## 5. Runtime flow

### 5.1. Rollout mode

Mode управляет download decision и TTL quarantine, но не отключает schema или
dual-write новых chat/shift/task attachments.

| Mode | Read decision | Strict evaluation | Expired pending | Допустимое применение |
|---|---|---|---|---|
| `LEGACY` | Tenant-only legacy read | Не выполняется | Не quarantine при чтении | Только краткий внутренний переход |
| `SHADOW` | Возвращает legacy result | Выполняется; strict deny/error логируется безопасным mismatch event | Не quarantine при чтении | Internal inventory/reconciliation/canary preparation |
| `ENFORCED` | Только strict parent-aware result | Авторитетен | Переводится в `QUARANTINED/PENDING_EXPIRED` | Только после adoption, backfill и успешного canary |

В `SHADOW` event содержит только mode, legacy/strict decisions, стабильный
reason code, lifecycle state, resource kinds и release SHA. Attachment, user и
tenant UUID, URL, имя файла и PII не логируются.

Production startup fail-closed требует явное значение. Local/test default —
`ENFORCED`; CI production startup contract использует `SHADOW`. Ни `LEGACY`, ни
`SHADOW` не разрешают внешний beta.

### 5.2. Upload

1. Guard требует хотя бы одну attachment-related capability.
2. API валидирует наличие файла, лимит 5 MiB, нормализует имя и MIME.
3. Создаёт blob как `PENDING`, exact uploader, TTL 24 часа.
4. Возвращает opaque ID/URL и `pendingExpiresAt`.
5. В `ENFORCED` до bind файл может прочитать только uploader до TTL;
   `LEGACY/SHADOW` временно сохраняют tenant-only legacy read.

### 5.3. Atomic bind для chat/shift/task evidence

1. Parent service проверяет live user, capability, `AccessScope` и live parent
   policy: channel/audience/store для chat либо authoritative
   task/store/participant policy и разрешённую shift.
2. Task update/comment в PostgreSQL transaction блокирует top-level parent
   через `FOR UPDATE` и повторяет scope/status checks после lock.
3. В той же transaction создаётся/изменяется message или task comment.
4. Binder дедуплицирует IDs, сортированно блокирует exact same-tenant blobs.
5. Каждый blob обязан быть `PENDING`, принадлежать actor и не быть просроченным.
6. Создаётся `CHAT_MESSAGE` или `STAFF_TASK` binding; chat также сохраняет
   legacy relation, а task comment — canonical evidence URL.
7. Все blobs переводятся compare-and-set в `BOUND`.
8. Любое расхождение вызывает rollback всей parent mutation.

### 5.4. Download

1. `JwtAuthGuard` перечитывает persisted scope active user.
2. RolesGuard проверяет attachment-related capability union.
3. Service находит metadata только по `id + tenantId`, не выбирая blob.
4. В `LEGACY` strict evaluation пропускается и сохраняется tenant-only read.
5. В `SHADOW` вычисляется strict decision, но клиенту возвращается legacy
   result; strict deny/error создаёт privacy-safe mismatch, expired pending не
   меняет состояние.
6. В `ENFORCED` `PENDING` разрешён только exact uploader до TTL, а expired
   pending переводится в quarantine.
7. Для `BOUND` берутся только `BOUND` bindings; рассматриваются adopted
   `CHAT_MESSAGE` и candidate `STAFF_TASK` parents.
8. Parent service перечитывает live channel/message либо task, scope,
   assignment/observer policy и не показывает shift вне actor allowed stores.
9. При хотя бы одном доступном parent отдельный запрос читает blob.
10. Иначе возвращается одинаковый `404`.

### 5.5. Текущая CUSTOM chat semantics

- `NETWORK` actor с manager-level системной ролью
  (`OWNER`, `ADMIN`, `MANAGER`, `STANDARDS_MANAGER`) видит
  non-gamification `CUSTOM` channels без membership.
- Gamification `CUSTOM` channel даже для такого actor требует membership.
- `STORES` actor видит `CUSTOM` channel только через membership; membership не
  расширяет его allowed stores и message audience.
- `STORE` channel доступен только для allowed store, а message.storeId обязан
  совпасть с channel.storeId.

Это текущая реализованная политика. Изменение её смысла требует отдельного
решения/ADR и синхронного изменения chat API и attachment ACL.

## 6. Read-only inventory scanner

`packages/database/scripts/staff-attachment-backfill-dry-run.mjs`:

- всегда включает PostgreSQL `default_transaction_read_only=on`;
- использует одно соединение и одну read-only `REPEATABLE READ` snapshot
  transaction для всех bounded keyset pages;
- не создаёт, не обновляет и не удаляет application data;
- принимает только exact relative
  `/staff/attachments/<uuid>`, `/api/staff/attachments/<uuid>` и exact absolute
  HTTPS URL из allowlist;
- отвергает userinfo, query, fragment, не-HTTPS и неточные path;
- считает нормализованную chat relation и exact task-comment evidence
  первичными кандидатами;
- chat message body, task description/checklist, checklist answers и recursive
  knowledge/regulation/training/onboarding references считает только secondary
  review evidence;
- различает unique primary parent, legitimate multiple primary parents,
  duplicate copy и secondary-only reference;
- выводит только агрегаты и стабильные reason codes — без raw UUID, URL, имён
  файлов, PII или credentials.

Команда:

```bash
STAFF_ATTACHMENT_BACKFILL_TARGET=staging \
pnpm --filter database db:inventory:attachment-acl -- --pretty
```

Для production обязательно одновременно:

```text
STAFF_ATTACHMENT_BACKFILL_TARGET=production
STAFF_ATTACHMENT_BACKFILL_PRODUCTION_ATTESTATION=
  I_ATTEST_THIS_IS_A_READ_ONLY_PRODUCTION_ATTACHMENT_INVENTORY
```

Значение attestation передаётся одной строкой. `DATABASE_URL` обязателен, но
никогда не сохраняется в evidence. Scanner не является apply-backfill:
положительный отчёт сам по себе не меняет lifecycle и bindings.

## 7. Последовательность миграций и безопасный запуск

Миграции должны применяться строго по порядку:

| № | Migration | Транзакционность | Назначение |
|---|---|---|---|
| 1 | `20260727110000_staff_attachment_acl_expand` | Явный `BEGIN/COMMIT` | Types, columns, table, checks, resolver/triggers |
| 2 | `20260727111000_staff_attachment_state_reconcile_index` | Вне transaction | `CREATE INDEX CONCURRENTLY` для state/reconciliation |
| 3 | `20260727112000_staff_attachment_pending_expiry_index` | Вне transaction | `CREATE INDEX CONCURRENTLY` для pending cleanup |
| 4 | `20260727113000_staff_attachment_acl_invariant_hardening` | Явный `BEGIN/COMMIT` | Tenant/cardinality hardening и delete serialization |

Для всего deploy session задаются connection-level timeouts через `PGOPTIONS`,
потому что `SET LOCAL` нельзя добавлять в migration с
`CREATE INDEX CONCURRENTLY`:

```bash
PGOPTIONS="-c lock_timeout=5000 -c statement_timeout=120000" \
pnpm --filter database db:deploy
```

CI использует эти же значения. Перед продолжением обязательно проверить, что
оба concurrent indexes готовы и валидны:

```sql
SELECT
  index_class.relname AS index_name,
  index_meta.indisready,
  index_meta.indisvalid
FROM pg_index AS index_meta
JOIN pg_class AS index_class
  ON index_class.oid = index_meta.indexrelid
WHERE index_class.relname IN (
  'staff_attachment_tenant_state_created_idx',
  'staff_attachment_pending_expiry_idx'
)
ORDER BY index_class.relname;
```

Обе строки должны иметь `indisready = true` и `indisvalid = true`.

### Восстановление после сбоя concurrent index

1. Остановить rollout; не включать application candidate.
2. Зафиксировать exact failed migration и состояние `_prisma_migrations`.
3. Проверить два индекса запросом выше.
4. Если failed migration оставила exact index с `indisvalid = false` или
   `indisready = false`, удалить только этот индекс командой
   `DROP INDEX CONCURRENTLY IF EXISTS "<exact_index_name>"` вне transaction.
5. После review пометить только exact failed migration как rolled back штатным
   `prisma migrate resolve --rolled-back <migration_name>`.
6. Повторить `db:deploy` с session `PGOPTIONS`.
7. Повторно проверить оба флага, latest/count и attachment DB smoke.

Нельзя удалять schema columns/table при таком восстановлении и нельзя считать
миграцию успешной только по наличию index name.

## 8. Выполненные проверки

На текущем рабочем candidate получены следующие результаты:

- focused CI: 21 suite, 302/302 tests — pass;
- task service/access-scope: 63/63 tests — pass;
- full API: 74 suite, 1 526 passed, 2 todo, 1 528 total — pass;
- API boundary lint — pass;
- API production typecheck — pass;
- API production build — pass;
- web lint — pass;
- web typecheck — pass;
- web webpack production build: 203 pages — pass;
- чистая PostgreSQL schema: все 155 migrations — pass;
- exact migration state: latest
  `20260727113000_staff_attachment_acl_invariant_hardening`, count 155 — pass;
- attachment ACL PostgreSQL smoke — pass, включая ready/valid indexes,
  same-tenant checks, deferred atomic bind, tenant mutation rejection и
  реальную гонку двух соединений при удалении последних bindings, а также
  реальный `STAFF_TASK` binding и derived task store;
- отдельная real PostgreSQL suite подтвердила A1→A2 scope race, rollback
  комментария/audit/binding для foreign uploader и expired attachment — 3/3;
- временные test schema после проверок удалены.

Эти проверки подтверждают candidate, но не заменяют production-like inventory,
backfill, parent adoption, browser/BFF IDOR suite и canary. Evidence ещё не
привязано к exact release SHA.

## 9. Что ещё не реализовано

P0 остаётся открытым по следующим причинам:

1. Есть только read-only inventory; idempotent apply-backfill/reconciliation
   command отсутствует.
2. Production-like inventory текущего tenant с четырьмя клубами не выполнен.
3. `STAFF_TASK` authoritative scope, locked mutations, comment evidence bind и
   strict parent reader прошли focused/full/build и bounded real-PG checks, но
   ещё требуют revoke/delete semantics и полной production-like A1/A2/B
   API/BFF/browser/file integration.
4. `CHECKLIST_RUN`, `KNOWLEDGE_ARTICLE`, `SHIFT_REGULATION`,
   `TRAINING_COURSE`, `ONBOARDING_PLAN` присутствуют в schema, но producer
   binding и authoritative runtime reader для них ещё не подключены.
5. Legacy/current checklist attachments, rich-text/JSON и копии URL только
   инвентаризируются; они не получают связь автоматически.
6. Нет полного audited manual resolution/quarantine operator workflow.
7. Нет retention cleanup/grace-period job и отдельного delete/revoke workflow.
8. Нет `HEAD/Range` implementation с тем же ACL.
9. Process-wide `LEGACY/SHADOW/ENFORCED` и безопасный shadow mismatch event
   реализованы, но нет tenant/store-specific canary, агрегированного mismatch
   gate и rollback drill.
10. Нет полной real PostgreSQL + API/BFF/browser suite на topology
    Tenant A/Store A1/A2 и Tenant B/Store B1 для каждого parent kind.
11. Нет DB/read equality invariant и inventory для legacy A-task/B-shift,
    когда оба store входят в allowed scope multi-store actor. API equality
    recheck защищает только direct create/update.
12. Transaction-client recheck не сериализует последующее конкурентное
    изменение `GuestWorkingShift.storeId`, `User` или `UserStoreAccess`.
    Reference-row locks/единый write protocol либо DB invariant и отдельный
    real PostgreSQL race test остаются P1.

Следовательно, `ENFORCED` нельзя деплоить перед inventory/backfill: он ожидаемо
закроет legacy `UNRESOLVED` files, а unsupported parent kinds останутся
недоступны. `LEGACY/SHADOW` могут использоваться только внутри закрытого
переходного контура и не разрешают внешний beta.

## 10. Rollout и rollback

### Rollout

1. Зафиксировать reviewed candidate в exact SHA и сформировать evidence
   directory.
2. Отдельно применить четыре EXPAND migrations на staging/production-like
   snapshot с `PGOPTIONS`; strict application не выпускать.
3. Проверить count 155, latest migration, ready/valid indexes, schema/defaults,
   N-1 compatibility и DB smoke.
4. Запустить read-only inventory текущего tenant; сохранить только безопасные
   aggregates/reason codes.
5. Реализовать отдельный idempotent apply/reconciliation command с
   `dry-run → review → explicit apply`, quarantine и повторным zero-diff run.
6. Добавить task/shift DB invariant + legacy inventory, revoke и полную
   A1/A2/B API/BFF/browser/file integration для `STAFF_TASK`, затем подключить
   atomic bind и live parent ACL ко всем оставшимся kinds.
7. Добиться нуля cross-tenant references и нуля необъяснённых internal
   references; ambiguous cases явно quarantine.
8. Выполнить two-tenant/two-store API/BFF/browser/file regression.
9. Включить process-wide `SHADOW`, собрать безопасные mismatch metrics, затем
   провести управляемый `ENFORCED` internal canary на одном из четырёх Store и
   расширить до 4/4 только при нуле mismatch.
10. Провести rollback drill и только после этого рассматривать внешний pilot.

### Rollback

- В EXPAND schema не удаляется: откатывается application artifact/dual-write,
  данные сохраняются для fix-forward.
- До внешнего beta внутренний rollback из `ENFORCED` в `SHADOW/LEGACY`
  допускается только при полном отключении внешних пользователей и
  зафиксированном security exception.
- После включения strict reader запрещено возвращаться к tenant-only download.
  Для внешнего beta безопасный аварийный режим — deny attachment download, а не
  `SHADOW/LEGACY`.
- Cross-tenant binding, A1→A2/B доступ, invalid index, migration timeout,
  unexplained quarantine spike или потеря валидных файлов немедленно
  останавливают rollout.
- Schema contraction и удаление legacy relation допускаются только отдельной
  CONTRACT migration после полного reconciliation и rollback window.

## 11. Точные следующие шаги разработки

1. Провести независимый review текущего candidate, присвоить exact SHA и
   обновить evidence.
2. Реализовать apply/reconciliation tool отдельно от read-only scanner; добавить
   production guard, explicit attestation, idempotency и transaction batches.
3. Завершить `STAFF_TASK` candidate: templates/recurring/background paths по
   [отдельному плану](./staff-task-catalog-adoption-plan.md), task/shift DB
   invariant + legacy inventory, revoke/delete semantics и production-like
   A1/A2/B API/BFF/file tests.
4. Подключить `CHECKLIST_RUN`: answer/evidence normalization, live run
   store/assignment predicate и legacy reconciliation.
5. Подключить `KNOWLEDGE_ARTICLE` и `SHIFT_REGULATION`: current/version links,
   status, roleScope, store/network audience и history/draft policy.
6. Подключить `TRAINING_COURSE` и `ONBOARDING_PLAN`: server-side bind internal
   URLs, status/roleScope/audience, запрет auto-bind внешних URL.
7. Добавить delete/revoke, manual quarantine resolution и retention cleanup.
8. Запустить production-like inventory/backfill на копии текущего tenant из
   четырёх Store; повторный dry-run должен дать ноль unexplained references.
9. Использовать реализованные process-wide modes для shadow evidence; добавить
   tenant/store canary orchestration, mismatch aggregate gate и
   browser/BFF/Range/SSE regression.
10. Провести schema-only rehearsal, canary одного Store, затем 4/4 internal
    alpha. До успешного завершения этих шагов внешний доступ остаётся
    `NO-GO`.

## 12. Changelog

- `0.6.0`, 27.07.2026 — final participant/business-policy recheck перенесён
  на transaction client; добавлены regression tests для store move и второго
  shift read; task 63/63, focused 21/302, full API 74/1 526/2 todo; честно
  зафиксирован residual reference-row race до DB/write-contract hardening.
- `0.5.0`, 27.07.2026 — full API 74/1 524/2 todo, API/web production builds,
  focused 21/300 и task 61 пройдены; real PostgreSQL A1→A2 и rollback 3/3;
  создание task ограничено OPEN, assignment labels стали server-owned.
- `0.4.0`, 27.07.2026 — финализирован authoritative `STAFF_TASK` scope:
  persisted participant subset + concrete task store, platform-admin exclusion,
  application-level task/shift recheck, fail-closed null-task mutations,
  parent row lock/recheck и `manage_staff_tasks` для managerial status. Focused CI
  21/283, task tests 44 и clean-155 PostgreSQL task-binding smoke пройдены;
  full suite/build, legacy task/shift DB/read invariant, revoke и real A1/A2
  integration pending.
- `0.3.0`, 27.07.2026 — зафиксирован `STAFF_TASK` candidate: persisted scope
  для list/export/direct task paths, transactional comment evidence binding,
  strict task parent reader и web fresh-upload intent. Verification,
  revoke/delete и production-like A1/A2/B evidence остаются открыты.
- `0.2.0`, 27.07.2026 — зафиксированы rollout modes, safe shadow semantics и
  единый RepeatableRead inventory snapshot.
