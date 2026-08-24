# ACL вложений: модель, миграция и ввод в эксплуатацию

| Поле | Значение |
|---|---|
| Статус | `PRODUCTION SHADOW` / reconciliation controller implemented / external beta `NO-GO` |
| Версия | 0.8.0 |
| Дата | 24.08.2026 |
| Владелец | LeetPlus engineering |
| Backlog | `BETA-MOD-STAFF-009`, `BETA-MOD-COMMS-002`, `BETA-SEC-006` |
| Release decision | `NO-GO` до выполнения activation gates |

Этот документ является рабочим контрактом для устранения IDOR в
`GET /staff/attachments/:id`. Он описывает не только схему данных, но и весь
путь от загрузки файла до его привязки к бизнес-объекту, скачивания,
реклассификации старых ссылок и безопасного отката.

Фактически реализованные файлы, миграции, проверки, ограничения и точные
следующие шаги зафиксированы в
[implementation checkpoint](./attachment-acl-implementation-checkpoint.md).
EXPAND, dual-write, parent adoption и parent-delete guards уже находятся в
production; runtime остаётся в `STAFF_ATTACHMENT_ACL_MODE=SHADOW`.
`ENFORCED` нельзя включать до reviewed reconciliation, повторного zero-diff
inventory и выполнения activation gates: legacy blobs имеют состояние
`UNRESOLVED` и в strict режиме будут корректно закрыты через `404`. `LEGACY` и
`SHADOW` предназначены только для внутреннего перехода; внешний beta в этих
режимах запрещён.

Зафиксированная launch topology: четыре текущих клуба являются четырьмя
`Store` одного `Tenant`. После прохождения gates первый beta tenant получает
полные модули геймификации, ассортимента/товаров, сотрудников, in-app
коммуникаций и users/roles, но только в пределах собственного tenant и
persisted `NETWORK | allowed STORES`.

## 1. Проблема и цель

Исходная production-реализация хранит `StaffAttachment` в tenant, но не хранит
авторитетную связь с объектом, ради которого файл был загружен. Tenant-only
download по `attachment.id + tenantId` допускает same-tenant IDOR: пользователь
одного клуба при знании UUID может получить файл другого клуба той же сети.
Рабочий candidate добавляет parent-aware модель, но ещё не активирован.

Дополнительная проблема: общий attachment route требует
`view_staff_standards`. Это случайно закрывает файлы пользователям, которые
имеют только доступ к коммуникациям, задачам или базе знаний.

Целевой контракт:

1. UUID файла не является полномочием.
2. Tenant-принадлежность обязательна, но сама по себе недостаточна.
3. После привязки доступ к файлу наследуется только от доступного parent
   resource.
4. `NETWORK` не отменяет module capability, audience, membership, status и
   role targeting.
5. `STORES` не получает объект другого клуба даже через membership,
   assignment, creator/uploader или скопированный URL.
6. Неизвестный, чужой, недоступный, просроченный, orphan или quarantined UUID
   одинаково возвращает `404`.
7. Blob загружается из PostgreSQL только после положительного ACL-решения.

## 2. Поддерживаемые parent resources

| Resource kind | Канонический parent | Текущий источник ссылки | Авторитетная политика | Статус checkpoint |
|---|---|---|---|---|
| `CHAT_MESSAGE` | `StaffChatMessage` | `StaffChatMessageAttachment` | channel scope, message audience, membership, live `AccessScope`, communications/reward capability | Реализованы native bind и strict parent reader |
| `STAFF_TASK` | `StaffTask` | comment `evidenceUrl` + `attachmentIds` | persisted participant scope, transaction-client task/shift recheck, `view_staff_tasks`; manager status — `manage_staff_tasks` | Реализован candidate: scoped reads/mutations, parent row-lock recheck, transactional bind, strict parent reader и real PG race/rollback; reference-row serialization/DB invariant, revoke и browser pending |
| `CHECKLIST_RUN` | `StaffChecklistRun` | `answers`, review JSON | run store или явное personal assignment, `view_staff_standards` | Schema + secondary inventory; producer/reader pending |
| `KNOWLEDGE_ARTICLE` | `StaffKnowledgeArticle` | current/version `materials`, внутренние ссылки content | store, status, roleScope, knowledge capability | Schema + secondary inventory; producer/reader pending |
| `SHIFT_REGULATION` | `StaffShiftRegulation` | current/version `attachments` | store, status, roleScope, standards capability | Schema + secondary inventory; producer/reader pending |
| `TRAINING_COURSE` | `StaffTrainingCourse` | `steps[].url` | store, status, roleScope, training capability | Schema + secondary inventory; producer/reader pending |
| `ONBOARDING_PLAN` | `StaffOnboardingPlan` | `steps[].url` | store, status, roleScope, training capability | Schema + secondary inventory; producer/reader pending |

Shift report не создаёт отдельный вид binding: отправленный отчёт становится
store-bound chat message и использует `CHAT_MESSAGE`.

Training/onboarding сейчас принимают URL без attachment widget. Их внутренние
ссылки поддерживаются как отдельные parent kinds, но legacy auto-bind разрешён
только при сильном совпадении tenant и uploader/creator; остальные случаи
quarantined. Внешние `http(s)` ссылки никогда не становятся attachment binding.

## 3. Модель данных

### 3.1. Lifecycle файла

- `PENDING` — файл загружен, но ещё не привязан. Его может скачать только
  активный uploader того же tenant до `pendingExpiresAt`.
- `BOUND` — существует минимум одна активная проверенная привязка.
- `UNRESOLVED` — legacy blob или ссылка ещё не классифицированы. Download
  запрещён; состояние не превращается в `NETWORK` автоматически.
- `QUARANTINED` — файл или legacy-ссылка неоднозначны, противоречат tenant,
  указывают на отсутствующий parent либо требуют ручного решения. Обычный
  download всегда запрещён.

Состояние обязательно. Existing и созданные N-1 приложением blobs получают
default `UNRESOLVED / LEGACY_UNCLASSIFIED`, поэтому будущий strict reader
работает fail-closed.

Pending TTL равен 24 часам. Истечение действует при чтении немедленно и не
зависит от запуска cleanup. Просроченный pending переводится в quarantine;
автоматическое физическое удаление возможно только после отдельной retention
политики и grace period не менее 7 дней.

### 3.2. Binding

`StaffAttachmentBinding` хранит:

- `tenantId`, nullable `attachmentId` и обязательный
  `candidateAttachmentId`;
- top-level `resourceKind`, `resourceId`, SHA-256 `sourceKey`;
- состояние `BOUND | UNRESOLVED | QUARANTINED` и источник;
- автора и время создания;
- reason code и время resolution;
- диагностические snapshot-поля store/audience.

Snapshot-поля помогают reconciliation, но не используются как authority.
Download всегда перечитывает живой top-level parent. Task comment наследует
`StaffTask`; current/history knowledge — `StaffKnowledgeArticle`;
current/history regulation — `StaffShiftRegulation`. Version и JSON slot
фиксируются только в `sourceKey` и никогда не становятся отдельной ACL.

Один файл может иметь несколько `BOUND` bindings. Доступ задаётся объединением:
достаточно одного parent, который пользователь вправе читать. Отзыв одной связи
не отзывает остальные; после отзыва последней download закрывается.

Polymorphic link допустим только вместе с DB-инвариантом. В EXPAND immediate и
deferred PostgreSQL triggers проверяют:

- attachment и parent существуют в одном tenant;
- `resourceKind` поддержан и соответствует таблице parent;
- parent store, если задан, принадлежит тому же tenant;
- `PENDING`, `UNRESOLVED` и `QUARANTINED` не имеют `BOUND` bindings;
- `BOUND` имеет минимум один `BOUND` binding.

Удалённый или изменённый после bind parent не даёт доступ: strict reader
перечитывает его и fail-closed возвращает `404`. Нормализация parent
update/delete в одной транзакции с bindings обязательна до CONTRACT.

`StaffChatMessageAttachment` остаётся в EXPAND как legacy relation. Chat пишет
обе связи в одной транзакции. Удаление старого источника возможно только в
отдельной CONTRACT-миграции после reconciliation.

## 4. Upload и атомарная привязка

Upload разрешён пользователю, у которого есть хотя бы одна capability модуля,
поддерживающего вложения. Намерение клиента не даёт права на download.

При загрузке:

1. Проверяются размер, MIME и имя.
2. Создаётся `PENDING`, `pendingExpiresAt = now() + 24h`.
3. Возвращается opaque ID и URL.
4. В `ENFORCED` чужой pending недоступен даже network owner; переходные
   `LEGACY/SHADOW` временно сохраняют tenant-only legacy read.

Bind выполняется только внутри транзакции изменения parent:

1. Повторно загрузить live user и `AccessScope`.
2. Проверить capability и current/next parent scope.
3. Заблокировать attachment через `SELECT ... FOR UPDATE`.
4. Проверить tenant, uploader, `PENDING` и TTL.
5. Создать/изменить parent и все bindings.
6. Выполнить compare-and-set `PENDING → BOUND`.
7. Закоммитить всё либо откатить всё.

Неизвестные или недоступные attachment IDs не отбрасываются молча: один
ошибочный ID отменяет всю parent mutation. Обычный client flow не может
повторно привязать уже `BOUND` UUID к новой audience; для этого нужен
отдельный network-level audited workflow либо новый upload/clone.

Для task evidence authoritative intent передаётся как ID только свежего upload.
Server формирует canonical `/staff/attachments/<id>`, создаёт comment и
`STAFF_TASK` binding в одной транзакции. Произвольный internal attachment URL
без `attachmentIds` не создаёт binding и не расширяет доступ.

## 5. Download authorization

Process-wide `STAFF_ATTACHMENT_ACL_MODE` управляет только download decision и
TTL quarantine; schema и dual-write продолжают работать во всех режимах.

| Mode | Поведение |
|---|---|
| `LEGACY` | Сохраняет tenant-only read без strict evaluation. Только краткий внутренний переход |
| `SHADOW` | Вычисляет strict decision, безопасно логирует strict deny/error, но возвращает legacy result и не quarantine expired pending |
| `ENFORCED` | Делает strict parent ACL авторитетным и переводит expired pending в `QUARANTINED/PENDING_EXPIRED` |

Production требует явный mode; local/test default — `ENFORCED`, CI production
startup contract — `SHADOW`. Mismatch event не содержит attachment/user/tenant
UUID, URL, имён файлов или PII. `LEGACY/SHADOW` не являются beta-ready.

Strict-алгоритм `GET` и будущего `HEAD/Range`, авторитетный только в
`ENFORCED`:

1. `JwtAuthGuard` перечитывает active user и persisted `AccessScope`.
2. Service читает metadata по `id + tenantId`, но не поле blob.
3. Для `PENDING` разрешает только exact uploader до TTL.
4. Для любого состояния, кроме `BOUND`, возвращает `404`.
5. Загружает все `BOUND` bindings.
6. Для каждого kind применяет authoritative parent predicate и module
   capability.
7. Разрешает download, если доступен хотя бы один parent.
8. Только после этого отдельным запросом читает blob.
9. Unknown kind, stale/orphan link или ошибка проверки работают fail-closed.

Capability для generic route — это `anyOf`:

- `view_communications`;
- `view_staff_shift_workspace`;
- `view_staff_tasks`;
- `view_staff_standards`;
- `view_staff_training`;
- `view_staff_knowledge`;
- `approve_guest_game_rewards`.

Наличие capability позволяет начать проверку, но никогда не заменяет parent
ACL. Пользователь без любой attachment-related capability получает `403`;
direct UUID после прохождения этой границы — `404`.

## 6. Точные parent policies

### Chat

- Используются те же predicates, что для channel/message API.
- `NETWORK` actor с manager-level системной ролью (`OWNER`, `ADMIN`,
  `MANAGER`, `STANDARDS_MANAGER`) видит non-gamification `CUSTOM` без
  membership; gamification `CUSTOM` всегда требует membership.
- `STORES` actor видит `CUSTOM` только через membership; membership не
  расширяет allowed stores или message audience.
- `STORES` не видит store B message даже как member.
- Null-store message для `STORES` закрыт до появления явного
  `NETWORK_BROADCAST`.

### Task comment

- Store task доступна только в allowed stores.
- Null-store task для `STORES` доступна только exact assignee или
  нормализованному observer.
- Creator и строка в JSON не расширяют доступ.
- В рабочем candidate этот predicate применяется к task list/export/direct
  paths и повторно используется strict attachment reader.
- Participant target не выводится из staff profile или client payload:
  authoritative source — persisted `STORES` subset пользователя и конкретный
  task store; platform admins исключены.
- Direct create требует один store у task и assigned shift. Direct update
  проверяет equality до и повторно после parent lock. Read fail-closed скрывает
  shift вне actor `allowedStoreIds`.
- `STORES` не может выполнять structural PATCH null-store task. Exact
  assignee/observer сохраняет comment и разрешённые self-service status
  transitions, но не получает structural или network-level полномочия.
- Managerial approve/cancel/return/status actions требуют
  `manage_staff_tasks`; одной manager-like role недостаточно.
- Update и comment берут row lock на top-level task и после lock повторяют
  visibility, store/shift/participant и status checks.
- Legacy A-task/B-shift остаётся возможным для multi-store actor, если оба store
  разрешены: DB/read equality invariant и inventory такого mismatch ещё
  pending и не могут считаться закрытыми текущим API candidate.

### Checklist run

- Store run доступен только в allowed stores.
- Null-store run для `STORES` доступен только exact `assignedToUserId`.
- Reviewer/creator не получают скрытый географический доступ.

### Knowledge и regulations

- Store-bound published parent следует allowed stores и roleScope.
- Null-store published parent требует явной классификации как
  `NETWORK_PUBLISHED` и подходящего roleScope.
- Null-store draft, review и history доступны только `NETWORK`.
- До введения явной audience-классификации перегруженный `storeId = NULL`
  обрабатывается fail-closed.

### Training и onboarding

- Store-bound course/plan следует allowed stores, status и roleScope.
- Null-store published/active material требует явной network audience.
- Произвольно вставленный internal URL не создаёт binding сам по себе:
  привязка выполняется server-side при сохранении parent.

## 7. Инвентаризация и backfill

Read-only scanner уже реализован как
`packages/database/scripts/staff-attachment-backfill-dry-run.mjs`. Он использует
одно read-only PostgreSQL connection и одну `REPEATABLE READ` snapshot
transaction для всех bounded keyset pages. Production требует explicit target
и точную attestation, exact release SHA и независимо проверенный
credential-free database target fingerprint; raw UUID, URL, имена файлов, PII
и credentials не выводятся. Aggregate report затем проходит digest-bound
[`Gate 1MT operational preflight`](../../../open-beta/gate-1mt-operational-preflight.md).

Распознаются только:

- `/staff/attachments/<uuid>`;
- `/api/staff/attachments/<uuid>`;
- absolute HTTPS URL с allow-list production hosts, точным path, без userinfo,
  query и fragment.

Порядок:

1. Снять dry-run отчёт без изменений командой
   `pnpm --filter database db:inventory:attachment-acl`.
2. Нормализовать чистые `StaffChatMessageAttachment` в `CHAT_MESSAGE`.
3. Просканировать как secondary review copies chat body, task
   description/checklist, checklist answers, knowledge current/version,
   regulation current/version, training courses и onboarding plans.
4. Проверить существование attachment/parent и совпадение tenant.
5. Сформировать идемпотентные bindings через
   [reconciliation controller](./staff-attachment-reconciliation-runbook.md).
6. Поместить cross-tenant, orphan, unsupported, conflicting и неоднозначные
   случаи в quarantine с reason code.
7. Повторить scanner; необъяснённых внутренних references должно быть ноль.

Отчёт содержит только aggregate counts, reason codes и resource kinds.
Production UUID, PII, file names, content и URL в release evidence не
сохраняются.

Строки в chat body (включая shift report), task description/checklist,
checklist answers и task-from-chat description считаются вторичными
audit-копиями. Они попадают в отчёт scanner, но никогда не создают ACL binding
и не расширяют доступ.

На checkpoint 24.08.2026 read-only production inventory выполнен: `5 446`
`UNRESOLVED`, `4 416` unique-primary candidates, `309` multiple-parent и `741`
без распознанного reference. Reconciliation controller реализован и прошёл
unit + disposable PostgreSQL apply/zero-diff/rollback. Base production apply
затем закрыл `4 416` unique-parent rows (`4 416` bindings, drift/downtime `0`).
Residual owner-decision contract прошёл fresh restored-copy lifecycle:
`309 → 795` normalized-parent bindings, `721` reversible no-parent quarantine,
`20` non-expired PENDING без изменения. Residual production apply не разрешён
до нового same-SHA admission, fresh plan и отдельного exact approval.

## 8. Phased rollout

Текущий schema artifact содержит 155 миграций. Четыре attachment migrations
идут строго в таком порядке:

1. `20260727110000_staff_attachment_acl_expand`;
2. `20260727111000_staff_attachment_state_reconcile_index`;
3. `20260727112000_staff_attachment_pending_expiry_index`;
4. `20260727113000_staff_attachment_acl_invariant_hardening`.

Вторая и третья migration используют `CREATE INDEX CONCURRENTLY` и выполняются
вне transaction. Timeouts задаются на всё соединение, а не через `SET LOCAL`:

```bash
PGOPTIONS="-c lock_timeout=5000 -c statement_timeout=120000" \
pnpm --filter database db:deploy
```

После deploy оба concurrent index обязаны иметь `indisready=true` и
`indisvalid=true`. Если failed migration оставила invalid index, rollout
останавливается: точный invalid index удаляется через
`DROP INDEX CONCURRENTLY` вне transaction, только exact failed Prisma migration
после review помечается `--rolled-back`, затем deploy повторяется с
`PGOPTIONS`. Полная процедура и проверочный SQL приведены в
[implementation checkpoint](./attachment-acl-implementation-checkpoint.md#7-последовательность-миграций-и-безопасный-запуск).

### Phase A — EXPAND schema

- Статус checkpoint: реализовано в candidate, clean-schema smoke пройден;
  production-like rehearsal/deploy не выполнялись.
- Добавить обязательное fail-closed lifecycle и binding table.
- Добавить FK, индексы, idempotency unique по `sourceKey` и deferred
  lifecycle invariants.
- Не запускать backfill или JSON scan внутри DDL migration.
- Не включать strict download.
- Проверить migration с нуля и на production-like snapshot.

### Phase B — dual-write

- Статус checkpoint: реализовано для chat, новых shift-report uploads и нового
  task-comment evidence; process-wide runtime modes и safe shadow mismatch
  реализованы, application не deployed.
- Все новые uploads создаются `PENDING`.
- Chat, shift reports и task comments транзакционно создают legacy
  representation и binding.
- В `SHADOW` вычислять strict decision и логировать безопасный mismatch без
  изменения legacy response или lifecycle.

### Phase C — parent adoption

- Статус checkpoint: `CHAT_MESSAGE` реализован; `STAFF_TASK` list/export/direct
  scope, authoritative participant validation, transaction-client shift
  recheck после parent lock, comment
  evidence bind и strict reader реализованы как candidate; focused/DB checks
  пройдены. `CHECKLIST_RUN`, `KNOWLEDGE_ARTICLE`,
  `SHIFT_REGULATION`, `TRAINING_COURSE`, `ONBOARDING_PLAN` pending.
- Завершить task templates/recurring/background paths и применить
  `AccessScope` к checklists, knowledge и regulations.
- Добавить DB invariant и legacy inventory для task/shift store equality.
- Подключить bind к каждой parent mutation.
- Запустить dry-run scanner и исправить producer paths.

### Phase D — reconciliation

- Статус checkpoint: production read-only inventory и controller реализованы;
  production plan/review/apply и clean-history rehearsal pending.
- Backfill всех поддерживаемых legacy references.
- Quarantine всех неоднозначных случаев.
- Подтвердить ноль необъяснённых внутренних references и ноль tenant mismatch.

### Phase E — strict shadow и enforce

- Статус checkpoint: process-wide `LEGACY/SHADOW/ENFORCED` реализованы;
  production-like shadow run, tenant/store canary и activation pending.
- `SHADOW` сравнивает legacy и parent-aware решения, но возвращает legacy,
  логирует privacy-safe mismatch и не quarantine expired pending.
- После нуля unexplained mismatches включить `ENFORCED` internal canary.
- Проверить A1/A2/B, old JWT revoke, browser/BFF/SSE и нагрузку.

### Phase F — CONTRACT

- Статус checkpoint: не начато.
- Убрать legacy download decision и старые producer paths.
- Сделать lifecycle обязательным.
- Удалять `StaffChatMessageAttachment` только отдельной миграцией после
  rollback window.

## 9. Stop conditions и rollback

Немедленно остановить rollout при:

- cross-tenant binding;
- доступе A1 к A2/B;
- `BOUND` без `BOUND` binding;
- необъяснённом росте `QUARANTINED`;
- расхождении parent API и attachment ACL;
- заметной потере валидных вложений;
- migration lock timeout или unfinished migration.

Rollback EXPAND не удаляет новые колонки/таблицу. Откатывается только на заранее
проверенный schema-compatible application artifact, а данные сохраняются для
fix-forward. До внешнего beta переключение `ENFORCED → SHADOW/LEGACY` допустимо
только при полном отключении внешних пользователей и зафиксированном security
exception. После внешней активации возврат к tenant-only download запрещён;
безопасный аварийный режим — deny download, а не `SHADOW/LEGACY`.

## 10. Обязательные проверки

### Unit/API

- own/other/expired/null-uploader pending;
- `LEGACY/SHADOW/ENFORCED`, safe mismatch payload и отсутствие quarantine в
  `SHADOW`;
- bound/unresolved/quarantine/orphan/unknown kind;
- A1/A2/B для каждого kind;
- multiple bindings и revoke one/all;
- custom chat member вне store;
- personal task/checklist исключения;
- knowledge/regulation published vs draft/history;
- scope downgrade со старым JWT;
- partial bind rollback и concurrent claim;
- identical `404` для foreign/out-of-scope UUID;
- private/no-store, MIME allow-list и content disposition.

### Real PostgreSQL

- same-tenant trigger и cross-tenant rejection;
- deferred lifecycle cardinality;
- parent existence/kind validation;
- idempotent backfill;
- parent delete/orphan;
- concurrent CAS;
- rollback parent + binding.

### CI commands

- `db:smoke:attachment-acl`;
- `db:inventory:attachment-acl`;
- `check:attachment-inventory`;
- focused attachment ACL tests;
- PostgreSQL attachment IDOR suite с двумя tenant и stores A1/A2/B1.

Fixtures используют случайный prefix, production guard, confirmation env и
обязательный cleanup в `finally`.

Scanner contract дополнительно проверяет `--self-test`, единый
`REPEATABLE READ` snapshot и secondary sources chat body, task
description/checklist и checklist answers.

Финальный `STAFF_TASK` candidate прошёл:

- focused CI: 21 suite / 302 tests;
- task service/access-scope: 63 tests;
- full API: 74 suite / 1 526 passed / 2 todo;
- API boundary lint, production typecheck и production build;
- web lint, typecheck и webpack production build, 203 pages;
- clean PostgreSQL deploy всех 155 migrations и attachment ACL smoke с
  реальным `STAFF_TASK` binding и проверкой derived store; временная schema
  удалена;
- real PostgreSQL task security integration: A1→A2 race, foreign-uploader
  rollback и expired rollback — 3/3; временная schema удалена.

Pending: полная production-like A1/A2/B API/BFF/browser/file integration,
revoke/delete, остальные parent kinds, inventory/backfill и canary.

## 11. Activation gates

`ENFORCED` не включается, пока одновременно не выполнено:

1. EXPAND и N-1 compatibility проверены.
2. Все producer paths используют атомарный bind.
3. Parent modules применяют live `AccessScope`.
4. Dry-run/backfill идемпотентны.
5. Unexplained internal references = 0.
6. Cross-tenant references = 0.
7. Все unresolved решения либо исправлены, либо явно quarantined.
8. Unit, real PostgreSQL, API/BFF/browser tests зелёные.
9. Canary и rollback drill завершены.
10. Evidence привязано к exact release SHA.

До выполнения всех десяти условий `BETA-MOD-STAFF-009` остаётся `В работе`, а
выдача внешних доступов — `NO-GO`.

В особенности нельзя объединять schema EXPAND и `ENFORCED` application в один
auto-deploy: legacy blobs имеют `UNRESOLVED`, а runtime reader пока поддерживает
только adopted `CHAT_MESSAGE` и candidate `STAFF_TASK`; остальные parent kinds
ещё pending. Внешний beta запрещён как в `LEGACY`, так и в `SHADOW`.

## 12. Changelog

- `0.8.0`, 24.08.2026 — зафиксированы production `SHADOW` и aggregate
  inventory; добавлен digest-bound controller с detached approval,
  serializable apply, durable audit, zero-diff replay и exact rollback.
- `0.7.0`, 27.07.2026 — final participants и shift повторно проверяются через
  transaction client после parent lock; добавлены regression-тесты и явно
  зафиксирован residual reference-row race до DB/write-contract hardening.
- `0.6.0`, 27.07.2026 — task candidate прошёл full API и API/web production
  builds; добавлены real PostgreSQL A1→A2/rollback evidence, OPEN-only create
  и server-owned assignment labels.
- `0.5.0`, 27.07.2026 — финализирован `STAFF_TASK` scope candidate:
  authoritative participant policy, application-level task/shift recheck,
  fail-closed structural mutations, parent row-lock/recheck, capability-gated
  managerial status и подтверждённые focused/clean-PostgreSQL checks. Full
  suite/build, legacy task/shift DB/read invariant, revoke/delete и real A1/A2
  integration pending.
- `0.4.0`, 27.07.2026 — зафиксирован `STAFF_TASK` adoption candidate:
  persisted task scope для list/export/direct paths, transactional comment
  evidence binding и strict task parent reader; verification, revoke и
  production-like A1/A2/B evidence остаются открыты.
- `0.3.0`, 27.07.2026 — добавлены process-wide rollout modes, safe shadow
  semantics и единый RepeatableRead inventory snapshot.
