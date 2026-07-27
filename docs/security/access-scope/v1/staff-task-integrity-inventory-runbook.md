# Staff task catalog integrity: inventory и DB-invariant runbook

| Поле                  | Значение                                                                            |
| --------------------- | ----------------------------------------------------------------------------------- |
| Статус                | Inventory и DB EXPAND implementation candidates; production inventory не выполнялся |
| Версия                | 1.1.0                                                                               |
| Дата                  | 27.07.2026                                                                          |
| Backlog               | `BETA-MOD-STAFF-003`, `BETA-SEC-003`, `BETA-CUT-001`                                |
| Candidate SHA         | `56d615437ecfcb90db252016d3e5b83f3f545578` — not deployed                           |
| Предыдущий checkpoint | [Recurring actor HTTP](./staff-task-recurring-http-implementation-checkpoint.md)    |
| Следующий checkpoint  | [StaffTask integrity EXPAND](./staff-task-integrity-expand-runbook.md)              |

Документ задаёт безопасный порядок проверки legacy-данных `StaffTask`,
`StaffTaskTemplate`, `StaffTaskRecurringRule` и
`StaffTaskRecurringRuleRun` до добавления same-tenant ограничений базы данных.
Он не разрешает автоматическое исправление данных, production migration,
включение scheduler или выдачу внешнего доступа.

## 1. Зафиксированный контекст

- четыре текущих клуба — четыре `Store` одного существующего `Tenant`;
- текущий `tenantId` сохраняется;
- независимая внешняя сеть получает отдельный `Tenant`;
- первый внешний тест включает целиком геймификацию, ассортимент/товары,
  сотрудников, in-app коммуникации и users/roles только в своём
  tenant/разрешённых Store;
- recurring actor HTTP является implementation candidate;
- scheduler и all-tenant scheduled HTTP не зарегистрированы и остаются
  `NO-GO`.

## 2. Зачем нужен отдельный inventory

Простые внешние ключи по глобальному `id` подтверждают существование parent
row, но не подтверждают совпадение `tenantId`. Кроме того,
`Store.onDelete=SetNull` способен превратить store-bound шаблон, правило или
задачу в tenant-global resource.

Перед schema enforcement необходимо отдельно доказать:

1. отсутствие cross-tenant ссылок;
2. совместимость Store у Rule, Template и созданной Task;
3. корректность assignee и его persisted `NETWORK | STORES` scope;
4. отсутствие неприемлемых active global/inactive references;
5. состояние stale/failed scheduler journal;
6. объём записей, на которые повлияет будущая политика физического удаления
   Store.

## 3. Safety contract scanner

Каноническая команда:

```text
pnpm --filter database db:inventory:staff-task-integrity -- --pretty
```

Перед ней оператор задаёт:

```text
STAFF_TASK_INTEGRITY_INVENTORY_TARGET=development|staging|production
STAFF_TASK_INTEGRITY_INVENTORY_CONFIRM=run-staff-task-integrity-inventory
```

Для production дополнительно требуется exact attestation, напечатанная
командой `--help`. Она не хранится в runbook execution evidence. Оператор не
должен копировать `DATABASE_URL`, production ID или полный JSON-дамп в git.

Exit contract:

- `0` — scan завершён, blocking findings нет; review findings возможны;
- `1` — ошибка CLI/env/safety contract/БД;
- `2` — scan завершён, найдено хотя бы одно blocking состояние.

Scanner обязан:

- требовать явный target и отдельное подтверждение запуска;
- для production требовать дополнительную точную attestation;
- использовать одно соединение;
- принудительно включать PostgreSQL
  `default_transaction_read_only=on`;
- выполнять все запросы в одной `REPEATABLE READ` snapshot transaction;
- проверять внутри transaction, что `transaction_read_only=on`;
- иметь ограниченные `lock_timeout`, `statement_timeout` и общий transaction
  timeout;
- возвращать только aggregate counts и стабильные reason codes;
- не возвращать UUID, email, имена, URL, токены, database URL или свободный
  текст из строк;
- не выполнять `INSERT`, `UPDATE`, `DELETE`, DDL, backfill или auto-fix;
- отличать ошибку контракта/БД, blocking findings и review-only findings.

`--help`, `--self-test` и test suite не должны читать БД или требовать
credentials.

## 4. Классы находок

### Blocking до reconciliation

- cross-tenant Store/User/Template/Rule/Task/Run references;
- несовместимый текущий Store у Rule и linked Template;
- `lastCreatedTask` или Run с Task не от ожидаемого Rule;
- active Rule без Store до появления persisted timezone policy для
  tenant-global schedules;
- active Rule без `nextRunAt`, с отсутствующей или невалидной IANA timezone
  своего Store;
- active Rule у неактивного Store или неактивного Tenant;
- Platform Admin, inactive, unresolved-scope или out-of-store assignee у
  active Rule либо незавершённой Task;
- stale `STARTED` Run;
- повторяющиеся `FAILED` Run выше зафиксированного порога.

Любая такая находка означает, что schema `VALIDATE`, background reactivation и
внешний beta-доступ запрещены.

### Review до migration rehearsal

- active tenant-global Template;
- историческая Task, Store которой отличается от текущего Store изменяемого
  Template/Rule, при сохранённой same-tenant source link;
- количество `StaffTask`, `StaffTaskTemplate` и `StaffTaskRecurringRule`,
  которое сегодня потеряет `storeId` при физическом удалении Store;
- иные допустимые legacy-состояния, которые не нарушают authority, но требуют
  явного business decision.

Review-находка не должна маскироваться как доказательство готовности. Она
добавляется в evidence с owner и решением.

## 5. Безопасный порядок запуска

1. Зафиксировать exact candidate SHA, expected migration revision/count и
   target environment.
2. Сначала выполнить `--help`, `--self-test` и локальный test suite.
3. Выполнить scanner на чистой CI schema; ожидается zero blocking findings.
4. Выполнить scanner на восстановленном production-like snapshot.
5. Сохранить только aggregate JSON, SHA, время, target label и exit code в
   защищённый release evidence.
6. Назначить owner каждому non-zero reason code.
7. Подготовить отдельный idempotent reconciliation tool с dry-run и
   обязательным explicit apply. Scanner не превращается в apply-команду.
8. Повторять scanner после reconciliation до объяснённого zero critical diff.
9. Только затем репетировать EXPAND/VALIDATE migration.

Production запуск выполняется отдельно операционным владельцем после backup и
restore rehearsal. Эта ветка его не выполняет.

## 6. DB-invariant lifecycle

Schema-only EXPAND уже реализован как неприменённый candidate: пять parent
keys создаются concurrent migrations, а 14 composite FK добавляются как
`NOT VALID`. Три Store relations используют composite `RESTRICT`; под
прежними именами также создаются три temporary simple Store
`RESTRICT/RESTRICT NOT VALID`, сохраняющие global existence для legacy
cross-tenant rows. Одиннадцать paired legacy non-Store FK swap/re-add’ятся как
`NOT VALID`: сохраняют delete actions, но используют `ON UPDATE RESTRICT`.
Итого contract содержит 14 composite + 14 simple compatibility `NOT VALID` FK.
Store/User/Template/Rule/Task identifiers immutable; N/N-1 runtime
compatibility не включает их update. Полный migration set содержит 162
migration, latest —
`20260727131000_staff_task_integrity_expand`.

Точный contract, staged smoke, порядок применения и ограничения описаны в
[EXPAND runbook](./staff-task-integrity-expand-runbook.md). Это не отменяет
production-like inventory/reconciliation перед production APPLY и отдельный
`VALIDATE`.

### EXPAND

- добавить parent keys/indexes, необходимые для same-tenant references;
- добавить новые ограничения так, чтобы N-1 приложение продолжало работать;
- критические FK сначала вводить как `NOT VALID`, чтобы новые writes уже
  проверялись, а legacy rows валидировались отдельно;
- заменить три Store `SET NULL` временными simple `RESTRICT` параллельно с
  composite `RESTRICT`, чтобы legacy cross-tenant row не потеряла
  global-existence protection;
- swap/re-add 11 non-Store simple FK с прежними delete actions, но
  `ON UPDATE RESTRICT`; parent identifiers объявить immutable;
- задать короткий `lock_timeout` и bounded `statement_timeout`;
- не совмещать длительную index build/validation с application deployment;
- запретить физическое удаление Store, если существуют store-bound
  Task/Template/Rule; штатная lifecycle-операция — archive/deactivate;
- сохранить audit/provenance links: catalog entities и generated tasks
  архивируются, а не физически удаляются.

Ограничения доступа assignee, зависящие от `isActive`, `isPlatformAdmin` и
`UserStoreAccess`, не являются статическим FK. Они остаются authoritative
application/transaction policy и при необходимости подкрепляются отдельным
constraint-trigger design с concurrency tests.

### VALIDATE

- inventory на том же snapshot/rehearsal dataset даёт zero blocking findings;
- все новые constraints присутствуют и ещё до validation отклоняют invalid
  writes;
- `VALIDATE CONSTRAINT` выполняется отдельным управляемым шагом;
- проверены lock duration, long transactions, replication/backup health и
  N/N-1 compatibility;
- Prisma schema/migration drift объяснён и проверен.
- future-migration guard подтверждает отсутствие DROP всех 28 DB-native FK;
  migration создаётся create-only с ручным SQL review, `db push` запрещён.

### CONTRACT

Старые простые FK, временные triggers/indexes и compatibility code удаляются
только после staging/canary evidence. Rollback приложения не должен требовать
отката уже принятого same-tenant ограничения и не должен запускать старый seed
или обновлять immutable parent identifiers.

## 7. Evidence template

```text
release_sha:
target:
executed_at:
database_revision:
migration_count:
scanner_report_schema_version:
scanner_exit_code:
blocking_total:
review_total:
reason_counts:
operator:
evidence_location:
decision: NO-GO | RECONCILE | READY_FOR_EXPAND_REHEARSAL
```

В evidence запрещены production identifiers и credentials. Для текущей сети
допустима только формулировка `Tenant A / Store A1..A4`.

## 8. Implementation evidence

Для inventory candidate
`56d615437ecfcb90db252016d3e5b83f3f545578` и текущего EXPAND candidate
`dc26568d94d76b886f1d1b79c36b1bd9f00ac401` подтверждено:

- syntax/help/self-test и Node contract suite — 9/9;
- Prisma schema validation и database script typecheck — pass;
- исходный inventory checkpoint — clean PostgreSQL 156/156 migrations;
- текущий полный clean path — 162/162 migrations;
- реальный clean scan — 43 reason code, `PASS`, zero blocking/review;
- намеренная cross-tenant Template→Store fixture — `BLOCKED`, exit `2`;
- после безопасной reconciliation той же fixture остался только review
  Store-deletion candidate и exit `0`;
- оба отчёта не содержали fixture Tenant/Store/Template identifiers;
- обе временные test schema удалены; `public` не изменялся;
- независимый read-only review не нашёл P0/P1.
- staged real PostgreSQL EXPAND smoke подтвердил пять parent indexes,
  14 composite + 14 simple compatibility `NOT VALID` FK, 14 benign legacy
  updates, 14 отклонённых новых invalid writes, три Store
  `RESTRICT`/archive-first, три legacy Store delete protection, пять UUID и
  пять tenant move rejection сценариев;
- offline self-test проверил safe target, migration partition и
  расширенный future-migration DDL guard; scoped Prisma drift внутри smoke
  подтвердил `prismaDriftDrops=14` без credentials в argv.

Неавтоматизированные остатки P2:

- CI выполняет реальный clean scan, но ещё не создаёт fixtures для каждого из
  43 SQL predicate;
- `REPEATED_FAILED_RUN` пока означает threshold всех `FAILED` за окно, а не
  только последнюю непрерывную серию; production owner должен принять
  семантику или изменить её до использования как release gate.

Production и production-like inventory не выполнялись.

## 9. Exit criteria

Inventory slice считается реализованным, когда:

1. command contract и source-safety tests обязательны в application CI;
2. clean PostgreSQL migration job выполняет реальный read-only scanner;
3. scanner доказывает одну `REPEATABLE READ` read-only snapshot;
4. blocking/review result детерминирован и не раскрывает row identifiers;
5. clean-schema smoke зелёный;
6. production-like запуск и reconciliation остаются отдельными явными
   операционными шагами.

Это повышает только readiness к production-like EXPAND/VALIDATE rehearsal.
Внешний beta остаётся `NO-GO` до полного Gate 2.

## 10. Changelog

- `1.1.0`, 27.07.2026 — связан реализованный schema-only EXPAND candidate:
  162 migrations, пять concurrent parent indexes, 14 composite + 14 simple
  compatibility `NOT VALID` FK, immutable parent IDs,
  global-existence/expanded DDL guards, scoped Prisma drift и staged
  PostgreSQL smoke;
  production-like reconciliation/VALIDATE/deploy остаются pending.
- `1.0.0`, 27.07.2026 — создан guarded read-only inventory contract.
