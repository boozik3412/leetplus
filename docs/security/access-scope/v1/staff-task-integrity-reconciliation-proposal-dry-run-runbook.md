# Staff task integrity: SYNTHETIC reconciliation proposal dry-run

| Поле                  | Значение                                                                        |
| --------------------- | ------------------------------------------------------------------------------- |
| Статус                | `IMPLEMENTED_CANDIDATE`; только `SYNTHETIC`; не deployed                        |
| Версия                | 1.0.0                                                                           |
| Дата                  | 27.07.2026                                                                      |
| Backlog               | `BETA-MOD-STAFF-003`, `BETA-SEC-003`, `BETA-CUT-001`                            |
| Candidate SHA         | `dee25393ae7bff171bdd74a49f2d01cdef9ce4ee` — not deployed                       |
| Report schema version | 1                                                                               |
| Требуемая DB schema   | `EXPAND_162`; latest `20260727131000_staff_task_integrity_expand`               |
| Обязательный допуск   | [Snapshot admission](./staff-task-integrity-snapshot-admission-runbook.md)      |
| Агрегированный вход   | [Reconciliation planner](./staff-task-integrity-reconciliation-plan-runbook.md) |
| Apply support         | Отсутствует                                                                     |

Этот runbook описывает узкий row-level proposal dry-run для восьми
детерминированных StaffTask integrity reason codes. Инструмент повторно
выполняет точный snapshot admission, открывает отдельный read-only snapshot и
возвращает только HMAC-псевдонимизированные предложения очистить nullable
reference. Он не изменяет строки, не выбирает новое значение reference и не
разрешает будущий apply.

Candidate предназначен только для harness-managed одноразовой синтетической
PostgreSQL 16 fixture. `PRODUCTION_LIKE`, production process, remote target,
произвольная локальная копия и самостоятельный операторский запуск остаются
`NO-GO`.

## 1. Зафиксированный продуктовый контекст

- четыре текущих клуба остаются четырьмя `Store` одной сети внутри одного
  существующего `Tenant`;
- текущий `tenantId` сохраняется;
- каждая независимая внешняя сеть получает отдельный `Tenant`;
- первая внешняя invite-only когорта после полного Gate 2 получает полные
  геймификацию, ассортимент/товары, сотрудников, in-app коммуникации и
  users/roles только внутри своего tenant и разрешённых Store;
- этот dry-run не меняет module entitlement, не выполняет cutover и не
  приближает production автоматически;
- production-like admission/inventory/planner/dry-run, reconciliation apply,
  zero-diff, `VALIDATE`, `CONTRACT`, deployment и внешний beta-доступ остаются
  `PENDING / NO-GO`.

## 2. Разрешённая команда

Каноническая команда:

```text
pnpm --filter database db:dry-run:staff-task-integrity-reconciliation-proposals -- --pretty
```

Offline contract checks:

```text
pnpm --filter database check:staff-task-integrity-reconciliation-proposal-dry-run
node packages/database/scripts/staff-task-integrity-reconciliation-proposal-dry-run.mjs --self-test
```

Полный PostgreSQL rehearsal выполняется только на выделенном disposable
PostgreSQL 16:

```text
$env:DATABASE_URL="<disposable local/CI PostgreSQL 16 URL>"
$env:RELEASE_SHA="<exact clean 40-character lowercase Git SHA>"
$env:STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_SMOKE_CONFIRM="run-staff-task-integrity-snapshot-admission-smoke"
pnpm --filter database db:smoke:staff-task-integrity-snapshot-admission
```

Последняя команда создаёт и уничтожает тестовые database/role/fixture и не
предназначена для общей локальной или production БД. Реальный dry-run должен
запускаться только самим smoke/CI harness, который создаёт подписанный
provenance manifest и database marker. Копировать внутренние значения manifest,
nonce или ключи в ручную команду запрещено.

## 3. Runtime и provenance contract

Кроме полного окружения
[snapshot admission](./staff-task-integrity-snapshot-admission-runbook.md)
обязательны:

```text
STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_CONFIRM=
  run-staff-task-integrity-reconciliation-proposal-dry-run
STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_HMAC_KEY=
  <32..4096 UTF-8 bytes>
STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_PROVENANCE_HMAC_KEY=
  <harness-owned 32..4096 UTF-8 bytes>
STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_PROVENANCE_MANIFEST=
  <canonical base64url signed manifest>
```

Опциональный cap:

```text
STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_MAX_CASES=1..10000
```

Default — `1000`. Thresholds inventory также могут задаваться через
`STAFF_TASK_INTEGRITY_STALE_STARTED_MINUTES`,
`STAFF_TASK_INTEGRITY_FAILED_WINDOW_DAYS` и
`STAFF_TASK_INTEGRITY_FAILED_THRESHOLD`.

Fail-closed требования:

- admission classification обязана быть только `SYNTHETIC`, state — только
  `EXPAND_162`, PostgreSQL — только major 16;
- `NODE_ENV=production`, `PRODUCTION_LIKE` и не-loopback host отклоняются;
- `DATABASE_URL` не принимает caller-supplied options; допустим только
  `schema=public`;
- `RELEASE_SHA` является exact clean 40-character lowercase Git SHA;
- admission HMAC, dry-run report HMAC и provenance HMAC — три разные сильные
  ключа;
- manifest имеет профиль `STAFF_TASK_INTEGRITY_DISPOSABLE_V1`, exact fixture
  contract digest, release SHA, database identity, случайный creation nonce и
  срок жизни не более двух часов;
- тот же creation nonce обязан присутствовать с фиксированным prefix в
  harness-created database `COMMENT`; cryptographic manifest binding
  проверяется отдельно, любое несовпадение отклоняется;
- время допускается только в пределах manifest TTL и с ограниченным clock
  skew;
- неизвестный CLI argument, включая `--apply`, отклоняется;
- rendered report больше 8 MiB отклоняется целиком; partial evidence не
  выводится.

Provenance подтверждает владение harness-ключом, но не является независимой
аттестацией происхождения данных, если caller сам контролирует environment и
database `COMMENT`. Поэтому текущий contract достаточен только для
изолированного CI/disposable harness. Для production-like границы потребуется
отдельный out-of-band ключ либо асимметричная подпись с pinned verifier.

## 4. Release authority

Dry-run наследует admission release authority:

- runtime source и migration manifest читаются из exact Git commit blobs;
- migration names, порядок и SHA-256 сверяются с применёнными миграциями;
- worktree mutation не может подменить проверяемый release;
- admission source, smoke, aggregate planner, proposal dry-run, inventory и
  migration directory входят в release source manifest;
- candidate запускается только из clean checkout exact
  `dee25393ae7bff171bdd74a49f2d01cdef9ce4ee`.

Новый commit требует нового `RELEASE_SHA`, повторного contract test и
PostgreSQL smoke. Старое evidence нельзя переносить на новый SHA.

## 5. Транзакционный алгоритм

1. Разобрать runtime contract и проверить synthetic provenance.
2. Выполнить полный prerequisite snapshot admission и криптографически
   проверить его report.
3. Открыть вторую `READ ONLY REPEATABLE READ` transaction.
4. Получить фиксированный cluster advisory lock. Конкурирующий dry-run
   отклоняется.
5. В начале transaction взять `ACCESS SHARE` lock на все девять разрешённых
   relations:

```text
public._prisma_migrations
public."Tenant"
public."Store"
public."User"
public."UserStoreAccess"
public."StaffTaskTemplate"
public."StaffTaskRecurringRule"
public."StaffTaskRecurringRuleRun"
public."StaffTask"
```

6. Повторно проверить PostgreSQL 16, transaction mode, database identity,
   exact migration names/checksums, schema/catalog/trigger state, RLS и
   privilege contract admission-role.
7. Повторно проверить database provenance marker внутри того же snapshot.
8. Построить полный aggregate planner по 43 reason codes.
9. Применить cap до получения row evidence. Row SQL использует
   `LIMIT maxCases + 1`.
10. Получить строки только для восьми `proposal` reason codes.
11. Проверить точное равенство aggregate counts и row-level counts; любое
    расхождение отклонить.
12. Объединить две причины для одного
    `StaffTaskRecurringRule.lastCreatedTaskId` в один proposal с отсортированным
    набором `reasonCodes`.
13. Повторно проверить provenance и TTL перед формированием report.
14. Сформировать HMAC-псевдонимизированное evidence, проверить report integrity
    и только затем вывести report.

Ранние `ACCESS SHARE` locks закрывают окно concurrent DDL/RLS между catalog
check и чтением строк. Advisory lock сериализует этот dry-run на весь кластер.
Ни один lock не превращает evidence в apply authorization.

## 6. Разрешённые row-level proposal

| Reason code                      | Resource                 | Nullable reference      | Proposal                    |
| -------------------------------- | ------------------------ | ----------------------- | --------------------------- |
| `TEMPLATE_CREATOR_CROSS_TENANT`  | `StaffTaskTemplate`      | `createdByUserId`       | `REFERENCE_CLEAR_CANDIDATE` |
| `RULE_TEMPLATE_CROSS_TENANT`     | `StaffTaskRecurringRule` | `templateId`            | `REFERENCE_CLEAR_CANDIDATE` |
| `RULE_CREATOR_CROSS_TENANT`      | `StaffTaskRecurringRule` | `createdByUserId`       | `REFERENCE_CLEAR_CANDIDATE` |
| `RULE_LAST_TASK_CROSS_TENANT`    | `StaffTaskRecurringRule` | `lastCreatedTaskId`     | `REFERENCE_CLEAR_CANDIDATE` |
| `TASK_TEMPLATE_CROSS_TENANT`     | `StaffTask`              | `sourceTemplateId`      | `REFERENCE_CLEAR_CANDIDATE` |
| `TASK_RULE_CROSS_TENANT`         | `StaffTask`              | `sourceRecurringRuleId` | `REFERENCE_CLEAR_CANDIDATE` |
| `TASK_CREATOR_CROSS_TENANT`      | `StaffTask`              | `createdByUserId`       | `REFERENCE_CLEAR_CANDIDATE` |
| `RULE_LAST_TASK_SOURCE_MISMATCH` | `StaffTaskRecurringRule` | `lastCreatedTaskId`     | `REFERENCE_CLEAR_CANDIDATE` |

Все восемь действий означают только «review может рассмотреть очистку nullable
reference». Dry-run:

- не устанавливает новое reference value;
- не предлагает перенос между tenant;
- не меняет business ownership;
- не выбирает строку для автоматической обработки;
- не формирует SQL/DML;
- не поддерживает apply или auto-fix.

Остальные `29 operator` и `6 review` reason codes остаются только aggregate
findings и никогда не получают row-level proposal.

## 7. Privacy и evidence

Каждый case содержит только:

- один или два стабильных `reasonCodes` и символическое действие;
- тип resource и target column;
- HMAC-псевдонимизированный `caseToken`;
- HMAC `preconditionDigest`.

На верхнем уровне report содержит admission/planner/provenance bindings,
`contentDigest` и `executionDigest` без raw identity.

Псевдонимы domain-separated и включают execution-specific,
`generatedAt`-bound nonce. Повторный запуск на тех же строках даёт другие case
tokens, поэтому отчёты нельзя склеивать для восстановления идентичности.
Report не содержит:

- raw database/cluster identity;
- tenant, Store, User, Template, Rule, Task или Run ID;
- имён, email, телефонов, внешних ID;
- database URL, credentials, HMAC keys, nonce или database name;
- свободного row text.

`caseToken`, `preconditionDigest`, `contentDigest` и `executionDigest`:

- не являются row ID;
- не являются checksum production rows;
- не являются compare-and-swap token;
- не являются approval;
- не разрешают apply;
- не заменяют повторный owner-approved invariant check внутри будущей write
  transaction.

## 8. Exit contract

| Exit | Значение                                                                 |
| ---- | ------------------------------------------------------------------------ |
| `0`  | Dry-run завершён; blocking operator/proposal findings отсутствуют        |
| `1`  | CLI, runtime, query, evidence или внутренняя integrity error             |
| `2`  | Есть blocking findings; pseudonymous proposal могут присутствовать       |
| `3`  | Admission/schema/privilege/identity/catalog/RLS/cap gate отклонил запуск |

Exit `0` не означает готовность к apply, `VALIDATE`, deployment или beta.
Любой exit, кроме ожидаемого оператором, является stop condition.

## 9. Полученное evidence

Для exact SHA `dee25393ae7bff171bdd74a49f2d01cdef9ce4ee`:

- dry-run self-test: `20` checks — `PASS`;
- dry-run contract unit suite: `14/14` — `PASS`;
- snapshot admission unit suite: `16/16` — `PASS`;
- admission offline smoke/source guards: `36` checks — `PASS`;
- aggregate planner suite: `11/11` — `PASS`;
- inventory suite: `9/9` — `PASS`;
- database typecheck, Prisma validate и diff/format checks — `PASS`;
- реальный PostgreSQL 16.14 disposable rehearsal: `14` scenarios — `PASS`.

PostgreSQL smoke подтвердил:

- baseline 156 и expand 162 admission из exact commit artifacts;
- exact nine-table SELECT-only role и запрет excess SELECT/DML/DDL/internal FK
  trigger disable;
- planner exits `2/3`;
- dry-run findings exit `2`, cap/RLS/concurrent advisory lock exits `3`;
- signed synthetic provenance и отклонение tampered admission/migration;
- unlinkable case tokens между executions;
- stable content и timestamp-bound execution digests;
- protected output, неизменность source aggregate fingerprint и полный cleanup
  disposable database/role/artifact.

## 10. Известные ограничения и обязательные следующие шаги

Текущий PostgreSQL smoke создаёт положительную row fixture только для
`TEMPLATE_CREATOR_CROSS_TENANT`. Остальные семь predicates и overlap/coalescing
проверены unit-контрактом и zero-row SQL path, но ещё не имеют отдельных
положительных PostgreSQL fixtures. До заявления о полном восьмикодовом
PostgreSQL evidence необходимо:

1. добавить положительную fixture для каждого из восьми reason codes;
2. добавить overlap, где один `lastCreatedTaskId` одновременно получает
   `RULE_LAST_TASK_CROSS_TENANT` и `RULE_LAST_TASK_SOURCE_MISMATCH`;
3. доказать aggregate/row parity и coalescing на реальном PostgreSQL;
4. повторить privacy, cap, tamper, RLS, advisory-lock и cleanup scenarios.

Отдельные production-like блокеры:

- вынести provenance signing из caller-controlled environment в
  out-of-band/asymmetric trust boundary;
- заменить table-wide `User` SELECT на column-scoped privilege либо
  специально спроектированные views;
- спроектировать отдельный idempotent write-инструмент с owner approval,
  immutable input evidence, row lock/recheck, audit, rollback и zero-diff;
- выполнить approved production-like admission, inventory и aggregate planner;
- только затем проектировать production-like row dry-run и apply.

Расширять этот файл или текущий CLI скрытым apply path запрещено. Write phase
должна быть отдельным binary/script, отдельным review и отдельным release
decision.

## 11. Stop conditions

Немедленно остановить запуск при любом из условий:

- target не synthetic disposable fixture;
- release checkout dirty либо `RELEASE_SHA` не совпадает;
- provenance создан не доверенным harness;
- manifest/marker/identity/TTL не совпадают;
- PostgreSQL не major 16 или URL не loopback;
- admission не `ADMITTED` для exact `EXPAND_162`;
- роль имеет лишнюю authority либо RLS включён/изменён;
- migration/catalog/trigger state изменился;
- advisory lock занят;
- aggregate/row counts расходятся;
- cap превышен или report больше 8 MiB;
- найден raw identifier/PII/secret;
- возник запрос на ручной apply, production-like запуск или обход gate.

## 12. Release decision

```text
SYNTHETIC proposal dry-run candidate = IMPLEMENTED_CANDIDATE
SYNTHETIC PostgreSQL rehearsal       = PASS / 14 scenarios
all 8 positive PostgreSQL fixtures   = PENDING
standalone/operator-run dry-run      = NO-GO
PRODUCTION_LIKE dry-run              = PENDING / NO-GO
explicit apply / zero-diff           = PENDING / NO-GO
VALIDATE / CONTRACT / deploy         = PENDING / NO-GO
external beta                        = NO-GO
```

## Changelog

- `1.0.0`, 27.07.2026 — зафиксирован synthetic-only proposal dry-run для
  восьми StaffTask integrity codes: повторный admission, ранние relation locks,
  signed disposable provenance, aggregate/row parity, bounded
  HMAC-псевдонимизированное evidence и явный запрет apply/production-like
  использования.
