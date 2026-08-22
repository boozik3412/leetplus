# Staff task integrity: SYNTHETIC reconciliation proposal dry-run

| Поле                  | Значение                                                                        |
| --------------------- | ------------------------------------------------------------------------------- |
| Статус                | Historical `IMPLEMENTED_CANDIDATE`; только `SYNTHETIC`; не deployed             |
| Версия                | 1.3.0                                                                           |
| Дата                  | 28.07.2026                                                                      |
| Backlog               | `BETA-MOD-STAFF-003`, `BETA-SEC-003`, `BETA-CUT-001`                            |
| Historical SHA        | `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c`; не current candidate evidence       |
| Current candidate SHA | Не назначен; новый SHA требует полного повторного evidence                       |
| Report schema version | 1                                                                               |
| Admission schema      | 2                                                                               |
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
запускаться только самим smoke/CI harness, который создаёт
HMAC-аутентифицированный synthetic provenance manifest и database marker.
Копировать внутренние значения manifest, nonce или ключи в ручную команду
запрещено.

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
  <canonical base64url HMAC-authenticated synthetic manifest>
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

Synthetic HMAC provenance подтверждает владение harness-ключом, но не является
независимой аттестацией происхождения данных, если caller сам контролирует
environment и database `COMMENT`. Поэтому текущий HMAC contract достаточен
только для изолированного CI/disposable harness и не является Gate 2
production-like authority.

Отдельная verify-only Ed25519 authority boundary уже реализована: она связывает
release/artifact, snapshot state, approval, TTL и database marker с
асимметрично подписанным manifest, а admission report использует schema `2`.
Pinned root set намеренно пуст. Пока reviewed public root не зарегистрирован,
нет независимого signer и approved acquisition workflow, любой
`PRODUCTION_LIKE` запуск fail-closed отклоняется и остаётся `NO-GO`.

## 4. Release authority

Dry-run наследует admission release authority:

- runtime source и migration manifest читаются из exact Git commit blobs;
- migration names, порядок и SHA-256 сверяются с применёнными миграциями;
- worktree mutation не может подменить проверяемый release;
- admission source, smoke, aggregate planner, proposal dry-run, inventory и
  migration directory входят в release source manifest;
- historical evidence запускалось из clean checkout exact
  `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c`; новый запуск обязан использовать
  новый exact reviewed current candidate SHA.

Новый commit требует нового `RELEASE_SHA`, повторного contract test и
PostgreSQL smoke. Старое evidence нельзя переносить на новый SHA.

## 5. Транзакционный алгоритм

1. Разобрать runtime contract и проверить synthetic provenance.
2. Выполнить полный prerequisite snapshot admission и криптографически
   проверить его report.
3. Открыть вторую `READ ONLY REPEATABLE READ` transaction.
4. Получить фиксированный cluster advisory lock. Конкурирующий dry-run
   отклоняется.
5. В начале transaction получить `ACCESS SHARE` на фиксированную логическую
   границу из девяти relations в замороженном порядке. Для восьми relations
   выполняется `LOCK TABLE`, а для `User` lock приобретается без чтения строк
   через `SELECT "id" FROM ONLY public."User" WHERE false`:

```text
public._prisma_migrations
public."StaffTask"
public."StaffTaskRecurringRule"
public."StaffTaskRecurringRuleRun"
public."StaffTaskTemplate"
public."Store"
public."Tenant"
public."User" — no-row SELECT lock
public."UserStoreAccess"
```

Admission-role имеет table-level `SELECT` только к остальным восьми relations.
Для `User` разрешены ровно пять колонок:
`id`, `tenantId`, `isPlatformAdmin`, `isActive`, `accessScope`. Любой
table-level `User SELECT`, дополнительная column privilege, `GRANT OPTION` или
доступ через `PUBLIC` отклоняет admission. Это сохраняет логическую
девятиреляционную границу, не раскрывая остальные поля `User`.

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

Historical evidence для runtime SHA
`044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c`:

- proposal dry-run contract suite: `14/14` — `PASS`;
- aggregate planner suite: `11/11` — `PASS`;
- inventory suite: `9/9` — `PASS`;
- authority suite: `9/9` — `PASS`;
- admission suite: `18/18` — `PASS`;
- database typecheck, Prisma validate и diff/format checks — `PASS`;
- реальный PostgreSQL 16.13 disposable rehearsal: `23` scenarios — `PASS`.

Historical test-evidence SHA
`2341b99937e54cc50d1763a0a794d975816c72ce`
добавляет public-only pre-signed pinned-path test: admission suite `19/19`,
`LOCAL PASS` в isolated child.

Remote CI evidence для pinned path ещё pending. Тест использует
экспериментальный Node 22 module mock в изолированном child-процессе; это P2 и
не является production root enrollment.

PostgreSQL smoke подтвердил:

- baseline 156 и expand 162 admission schema `2` из exact commit artifacts;
- exact logical nine-relation boundary: table-level `SELECT` к восьми
  relations, только пять разрешённых `User` columns, замороженный lock order,
  запрет excess SELECT/DML/DDL/`GRANT OPTION`/`PUBLIC`/internal FK trigger
  disable;
- planner exits `2/3`;
- восемь proposal codes дают восемь proposal occurrences и семь уникальных
  cases; две причины для одного `lastCreatedTaskId` coalesce в один case;
- aggregate/row parity: `10` blocking occurrences (`8 proposal + 2 operator`)
  и `2 review`;
- cap `9` отклоняет запуск, cap `10` допускает findings; dry-run findings exit
  `2`, cap/RLS/concurrent advisory lock exits `3`;
- HMAC-аутентифицированный synthetic provenance и отклонение tampered
  admission/migration;
- unlinkable case tokens между executions и отсутствие raw identifiers/PII в
  case/report;
- stable content и timestamp-bound execution digests;
- protected output, неизменность source aggregate fingerprint и полный cleanup
  disposable database/role/artifact.

## 10. Известные ограничения и обязательные следующие шаги

Synthetic PostgreSQL fixture matrix для всех восьми proposal codes, overlap,
coalescing, aggregate/row parity, cap boundary, privacy и unlinkability
проверена. Это закрывает только disposable harness evidence и не повышает
release decision до production-like.

Отдельные production-like блокеры:

- выполнить P0 reviewed Ed25519 public-root enrollment отдельным release
  change;
- реализовать P0 independent operational signer и approved snapshot
  acquisition/marker
  workflow вне caller-controlled environment;
- выполнить production-like admission schema `2` и сохранить защищённое
  подписанное authority evidence;
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
SYNTHETIC PostgreSQL rehearsal       = PASS / 23 scenarios
all 8 proposal codes + coalescing    = PASS / SYNTHETIC only
Ed25519 authority verifier/marker    = IMPLEMENTED / roots empty
pinned-path verifier test            = LOCAL PASS / remote CI pending
standalone/operator-run dry-run      = NO-GO
PRODUCTION_LIKE dry-run              = PENDING / NO-GO
apply / rollback / zero-diff         = PENDING / NO-GO
VALIDATE / CONTRACT / deploy         = PENDING / NO-GO
external beta                        = NO-GO
```

## Changelog

- `1.3.0`, 28.07.2026 — прежние runtime/test SHA помечены historical.
  `SYNTHETIC EXPAND_162` остаётся нормативным состоянием disposable harness,
  но новый запуск требует exact current candidate SHA и повторного evidence.
- `1.2.0`, 28.07.2026 — runtime candidate остаётся
  `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c`; test evidence
  `2341b99937e54cc50d1763a0a794d975816c72ce` подтверждает authority `9/9`,
  admission `19/19` и public-only pre-signed pinned-path `LOCAL PASS` в isolated
  child. Remote CI evidence pending; experimental Node 22 module mock — P2.
  Production roots пусты; root enrollment, operational signer и approved
  acquisition остаются P0, production-like dry-run — fail-closed `NO-GO`.
- `1.1.0`, 28.07.2026 — exact candidate
  `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c` прошёл реальный PostgreSQL
  16.13 smoke `23` scenarios: все восемь proposal-кодов, восемь occurrences,
  семь уникальных cases, двухпричинный last-task coalescing, aggregate/row
  parity (`10 blocking`, `2 review`), cap boundary `9/10`, privacy и
  unlinkability. Authority boundary переведена на admission schema `2`;
  реализованы exact eight-table + five-column `User` ACL, frozen lock order и
  verify-only Ed25519/marker foundation. Pinned roots пусты, поэтому
  root enrollment, signer/acquisition, production-like admission/dry-run,
  apply/rollback/zero-diff,
  `VALIDATE`/`CONTRACT`/deploy и внешний beta остаются `NO-GO`.
- `1.0.0`, 27.07.2026 — зафиксирован synthetic-only proposal dry-run для
  восьми StaffTask integrity codes: повторный admission, ранние relation locks,
  signed disposable provenance, aggregate/row parity, bounded
  HMAC-псевдонимизированное evidence и явный запрет apply/production-like
  использования.
