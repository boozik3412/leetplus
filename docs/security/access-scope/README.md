# AccessScope: документация открытого теста

| Поле                           | Значение                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| Статус                         | Active                                                                                              |
| Версия контракта               | 1.16.0                                                                                              |
| Дата                           | 28.07.2026                                                                                          |
| Владелец                       | LeetPlus engineering                                                                                |
| Связанный backlog              | `BETA-SEC-003`, `BETA-SEC-006`, `BETA-IAM-001..003`, `BETA-CUT-001`, `BETA-CUT-003`, `BETA-CUT-008` |
| Исходный baseline              | `eb7ad9ef7d4783c47a7ddb5efbc271e5eb8a2fe2`                                                          |
| Schema-only candidate          | `28724008192442c03f35fcc46ff7de78cdead642` — not deployed                                           |
| Strict application candidate   | `df993a9d04fdb48809868555b0d040d52848e3ee` — not deployed                                           |
| Attachment ACL baseline        | `1207c63cacedba05937d4a96a03a8dfd11751d2e` — not deployed                                           |
| `STAFF_TASK` adoption          | `f0a6bccfdd26d5b782c03f0b23445a3d23080058` — not deployed                                           |
| Recurring actor HTTP           | `cbd7a6b426c4e9fd9e29c085eeb8547d88249ca5` — not deployed                                           |
| Staff task integrity inventory | `56d615437ecfcb90db252016d3e5b83f3f545578` — not run on production                                  |
| Staff task integrity EXPAND    | `dc26568d94d76b886f1d1b79c36b1bd9f00ac401` — 162 migrations / 28 guarded FK; not deployed           |
| Staff reconciliation planner   | `2c74c663780b3f183be708a01431c22efe57a723` — aggregate-only; no apply; not deployed                 |
| Staff snapshot admission       | `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c` — schema v2; synthetic verified; production-like NO-GO   |
| Admission test evidence        | `2341b99937e54cc50d1763a0a794d975816c72ce` — local pinned-path PASS; remote CI pending              |
| Staff proposal dry-run         | `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c` — all 8 fixtures; SYNTHETIC only; no apply; not deployed |

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
9. [План templates/recurring tasks](./v1/staff-task-catalog-adoption-plan.md) —
   route/action/job inventory, подтверждённые cross-store разрывы, безопасная
   materialization policy и следующий implementation slice.
10. [Task catalog: implementation checkpoint](./v1/staff-task-catalog-implementation-checkpoint.md) —
    scoped template CRUD/launch, shared materializer, catalog audit, проверки и
    оставшиеся recurring/scheduler блокеры.
11. [Recurring actor HTTP: implementation checkpoint](./v1/staff-task-recurring-http-implementation-checkpoint.md) —
    scoped Rule CRUD/manual/interactive due, Store/participant lock contract,
    IANA/DST schedule, PostgreSQL race evidence и background containment.
12. [Staff task catalog integrity inventory](./v1/staff-task-integrity-inventory-runbook.md) —
    read-only legacy scan, reason-code gate и порядок
    `INVENTORY → RECONCILE → EXPAND → VALIDATE`.
13. [Staff task integrity EXPAND](./v1/staff-task-integrity-expand-runbook.md) —
    пять concurrent parent indexes, 14 composite + 14 simple compatibility
    `NOT VALID` FK, archive-first/global-existence Store protection, immutable
    parent IDs, staged PostgreSQL smoke и порядок `VALIDATE → CONTRACT`.
14. [Staff task aggregate reconciliation plan](./v1/staff-task-integrity-reconciliation-plan-runbook.md) —
    классификация 43 aggregate codes, exact schema-first gate, actionable cap,
    `contentDigest`/`executionDigest` и безопасный порядок отдельного
    reconciliation.
15. [Staff task snapshot admission](./v1/staff-task-integrity-snapshot-admission-runbook.md) —
    обязательный fail-closed вход для production-like snapshot: PostgreSQL 16,
    exact release/runtime/migration/catalog state, отдельная роль с table
    `SELECT` на восьми relations и пятью разрешёнными колонками `User`, а также
    независимый Ed25519 authority contract.
16. [Staff task SYNTHETIC proposal dry-run](./v1/staff-task-integrity-reconciliation-proposal-dry-run-runbook.md) —
    disposable harness-fixture, повторный admission, read-only
    row evidence только для восьми proposal codes и явный запрет
    standalone/production-like/apply.

Release evidence хранится в `evidence/<release-sha>/`. Evidence не содержит
секретов, токенов, email, телефонов или необработанных production ID.
Будущий production-like signed authority manifest и acquisition/restore
evidence хранятся отдельно в access-controlled protected storage; обычный
release evidence содержит только opaque reference.

## Текущая стадия

`DESIGN ACCEPTED → IMPLEMENTED CANDIDATE / EXPAND + CHAT/TASK PARENT ADOPTION`.

До завершения классификации существующих аккаунтов и модульной матрицы решение
для внешнего доступа остаётся `NO-GO`. Отсутствующий или противоречивый scope
обрабатывается fail-closed.

`EXPAND` schema и strict application — два отдельных activation шага. Текущий
candidate нельзя передавать в auto-deploy как единый production bundle:
сначала применяется schema-only migration, затем выполняется явная
классификация, и только при нуле unresolved active subjects включается strict
reader.

Текущий общий schema candidate содержит 162 миграции, latest —
`20260727131000_staff_task_integrity_expand`; attachment ACL checkpoint
завершается миграцией
`20260727113000_staff_attachment_acl_invariant_hardening`. Native bind и
parent-aware reader реализованы для chat и новых shift-report uploads.
`STAFF_TASK` list/export/direct scope, transactional comment evidence bind и
strict parent reader реализованы как рабочий candidate. Participant targeting
использует authoritative persisted store scope и конкретный task store,
platform admins исключены. Direct create требует один store у task и shift, а
direct update проверяет equality до и повторно после lock; read fail-closed
скрывает shift вне actor `allowedStoreIds`. Structural PATCH null-store task
для `STORES` запрещён, но exact assignee/observer сохраняет разрешённые
comment/self-service status действия. Update/comment блокируют parent row и
повторяют scope checks после lock; manager-only status требует
`manage_staff_tasks`. Обычный create начинает task только в `OPEN`; assignment
labels принадлежат серверу. Grouped/`ANY_OF` нельзя переназначить через
single-assignee PATCH или лишить candidate observer membership.
Template CRUD/launch также имеет bounded candidate: scoped rows/count/summary
и options, fresh persisted scope, parent lock/recheck, ACTIVE/bound Store
policy, shared task materializer и атомарный catalog audit. Recurring actor
HTTP также имеет bounded candidate: scoped report/CRUD/manual launch,
Rule/Template lock/recheck, server-time interactive due и atomic
Run/Task/Rule/audits. In-process scheduler и scheduled all-tenant controller
не зарегистрированы, default-off и остаются `NO-GO`.
Для `CHECKLIST_RUN`, `KNOWLEDGE_ARTICLE`, `SHIFT_REGULATION`,
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

Финальный task candidate прошёл focused CI 21 suite / 302 tests, включая 63
task test, full API 74 suite / 1 526 passed / 2 todo, API boundary
lint/typecheck/build, web lint/typecheck и webpack production build на 203
страницы. Clean PostgreSQL прогон применил все 155 migrations; attachment
smoke подтвердил реальный `STAFF_TASK` binding/derived store, а отдельная
integration suite — A1→A2 scope race и два rollback-сценария, 3/3. Временные
schema удалены.

DB/read invariant для legacy A-task/B-shift, когда оба store входят в scope
multi-store actor, ещё отсутствует. Его schema enforcement и inventory
существующих mismatch являются отдельным обязательным evidence gap.

Recurring actor candidate прошёл focused CI 27 suites / 375 tests, full API
80 suites / 1 599 passed / 2 todo и real PostgreSQL transaction security
2 suites / 8 tests. Пять recurring race-сценариев подтверждают фактическую
блокировку и post-wait rollback для Template, Store и participant revoke.
Scheduler/all-tenant route не зарегистрированы; tenant-global timezone,
production-like legacy reconciliation, DB validation/deploy и browser
evidence остаются `NO-GO`.

Staff task integrity inventory реализован отдельным candidate
`56d615437ecfcb90db252016d3e5b83f3f545578`. Он проверяет 43 aggregate
same-tenant/store/assignee/schedule/run/deletion reason code в одной
read-only `REPEATABLE READ` snapshot, не возвращает row identifiers и
различает ошибки (`1`) и blocking findings (`2`). На inventory checkpoint
clean schema со всеми 156 миграциями дала `PASS`; локальная намеренно
cross-tenant fixture дала
`BLOCKED` без утечки ID. Production/production-like scan и reconciliation не
выполнялись, поэтому это implementation evidence, а не разрешение внешнего
доступа.

Same-tenant StaffTask catalog EXPAND также реализован как неприменённый
candidate: пять composite parent keys создаются отдельными concurrent
миграциями, затем 14 composite FK вводятся как `NOT VALID`. Три Store FK
используют composite `RESTRICT` и фиксируют archive-first lifecycle. Под
прежними именами также остаются три temporary simple Store
`RESTRICT/RESTRICT NOT VALID`: они не дают legacy cross-tenant row потерять
global-existence защиту и получить dangling `storeId`. Одиннадцать
соответствующих non-Store FK swap/re-add’ятся как `NOT VALID`: delete actions
сохраняются, но `ON UPDATE` становится `RESTRICT`. Store/User/Template/Rule/
Task identifiers считаются immutable; N/N-1 runtime compatibility не включает
ID update или старый seed. Prisma 6.19 представляет parent keys и Store
relations, а также явный `onUpdate: Restrict` 11 simple non-Store relations.
Manual composite drift включает 10 partial-`SET NULL` и один Run→Rule
`CASCADE`; `NOT VALID`/coexistence всех 14 simple compatibility FK остаётся
DB-native contract. Exact fresh-162 Prisma diff предлагает ровно 14 security
DROP: 11 non-Store composite и три temporary simple Store FK; 11 simple
non-Store FK он больше не меняет. Unrelated pre-existing ADD/index-rename
drift учитывается отдельно. Diff запускается внутри staged smoke через
`--from-schema-datasource`/scoped env без URL или пароля в argv. Offline
self-test защищает 28 FK от DROP/RENAME/ALTER, `DROP NOT NULL`
contract-колонок, trigger/`session_replication_role` bypass и запрещает
destructive table/column DDL, DROP/ALTER пяти parent indexes, DROP SCHEMA и
неожиданные migration directory names. Exact artifact guard отдельно фиксирует
пять one-statement `CREATE UNIQUE INDEX CONCURRENTLY` и финальную transaction
с timeouts/lock order/`28 ADD + 14 DROP + 28 NOT VALID`; разрешены только
create-only SQL review, `db push` запрещён.
Staged real PostgreSQL smoke теперь начинает с populated legacy baseline 156,
затем применяет ровно шесть migrations `157..162`. Все пять concurrent indexes
строятся на заполненных parent-таблицах; сохраняются 14 legacy rows и проходят
прежние проверки каталога 14 composite + 14 simple compatibility FK,
14 отклонённых новых invalid writes, три same-tenant и три legacy Store delete
protections, delete actions, benign updates, пять отклонённых parent UUID,
пять tenant moves и `prismaDriftDrops=14`.

Следующим bounded candidate реализован aggregate-only reconciliation planner
`2c74c663780b3f183be708a01431c22efe57a723`. Он использует одно соединение и
одну `READ ONLY REPEATABLE READ` transaction, требует exact
target/confirmation, production attestation, 40-hex release SHA, HMAC и
expected database name. Ожидаемое имя связано с target и сравнивается с
фактическим `current_database()` внутри snapshot; оба имени не выводятся.
Domain-separated HMAC `databaseIdentityDigest` дополнительно связывает
evidence с database name, PostgreSQL `system_identifier` и database OID без
вывода raw identity.
Полный каталог из 43 reason codes классифицирован как `8 proposal +
29 operator + 6 review`; `TASK_ASSIGNEE_GLOBAL_SCOPE_INVALID` является
`BLOCKING`. Schema-first gate требует exact
`162/latest/unfinished 0 + 14 composite exact + 14 simple exact +
0 expected-FK mismatch + 0 unexpected protected FK + 5 indexes exact +
0 index mismatch` и `databaseIdentityMatched=true`. Exits — `0/1/2/3`,
actionable cap исключает review-only counts. Proposal не является
authorization, apply path отсутствует, output aggregate-only без
identifiers/database names. Инвариант
`summary.inventoryExecuted === schema.ready` проверяется fail-closed.
`contentDigest` стабилен по content, `executionDigest` привязан к
`generatedAt`; оба не являются row-stable checksum или CAS authorization.
Contract suite, clean real PostgreSQL planner и adversarial disposable-clone
smoke для дополнительного конфликтующего FK/неверного index contract прошли;
`schema=pg_catalog` также fail-closed отклоняется до inventory.

Следующим обязательным checkpoint реализован
[StaffTask snapshot admission](./v1/staff-task-integrity-snapshot-admission-runbook.md)
`044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c` —
`IMPLEMENTED_CANDIDATE`, not deployed. Он допускает только изолированную
loopback PostgreSQL 16 копию в точном `BASELINE_156` либо `EXPAND_162`,
сверяет ordered migration names/checksums и фактический runtime content с
exact Git blobs, FK/index/trigger catalog и отдельную `LOGIN NOINHERIT` роль.
Её logical allowlist из девяти relations реализован как table `SELECT` на
восьми relations и ровно пять колонок `User`:
`id, tenantId, isPlatformAdmin, isActive, accessScope`. Table-wide/extra/
missing/renamed/grant-option/`PUBLIC` grants и `SELECT * FROM User`
отклоняются; write, DDL, TEMP, membership и ownership отсутствуют.

Report schema v2 отделяет caller HMAC от production-like authority. HMAC
служит только для integrity/pseudonymization. Для `PRODUCTION_LIKE` требуется
canonical base64url Ed25519 manifest, exact-release pinned public root,
nonce-bound DB/approval digests, exact DB comment marker и mandatory freshness.
Legacy `EXPECTED_IDENTITY_DIGEST` как production-like authority запрещён.
Runtime bytes admission/smoke/authority/planner/proposal/inventory сверяются с
Git blobs exact release. Положительный production-like report дополнительно
привязан к private same-process evidence и не является standalone
transferable audit proof; аудит опирается на protected signed manifest.

Authority envelope подписывает `expectedState`, поэтому `BASELINE_156` и
`EXPAND_162` требуют двух отдельных envelope. После migrations `157..162`
signer выпускает новый `EXPAND_162` envelope с новым nonce-bound binding, DB
marker заменяется его digest до второго admission, а protected evidence хранит
обе state-specific bundle и marker-rotation attestation. Baseline marker reuse
запрещён.

Runtime admission candidate остаётся
`044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c`; отдельное test evidence commit —
`2341b99937e54cc50d1763a0a794d975816c72ce`. Admission tests 19/19, authority
tests 9/9, offline/integrated smoke self-test 46 и real PostgreSQL 16.13 smoke
23 scenarios прошли, включая
`baseline 156 → ровно шесть migrations → expand 162`,
privilege/tamper/privacy/cleanup guards. Pinned production-like roots в этом
release намеренно пусты, поэтому production-like запуск fail-closed остаётся
`NO-GO`.

Следующим bounded candidate реализован
[StaffTask SYNTHETIC proposal dry-run](./v1/staff-task-integrity-reconciliation-proposal-dry-run-runbook.md)
`044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c` — not deployed. Он допускает
только harness-created `SYNTHETIC EXPAND_162` disposable fixture,
повторно проверяет admission/release/migrations/catalog/RLS/privileges внутри
read-only `REPEATABLE READ` snapshot, заранее получает `ACCESS SHARE` locks и
формирует unlinkable HMAC-псевдонимизированные
`REFERENCE_CLEAR_CANDIDATE` только для точных восьми proposal codes.
Все 29 operator + 6 review codes остаются aggregate-only; apply path
отсутствует. Real PostgreSQL 16.13 smoke покрывает все восемь proposal codes,
семь case rows и coalescing двух last-task причин с aggregate/reason parity,
unlinkability и запретом raw identifiers.

Exact synthetic DB
`lp_snapshot_admission_ci_<16 lowercase hex>` и approval reference
`synthetic:` являются доверенной декларацией harness/оператора, а не
автоматическим proof происхождения данных или Gate 2. Signer/key custody,
production-like acquisition и public-root enrollment остаются P0.

Public-only pre-signed fixture без private signing material на test evidence
commit `2341b99937e54cc50d1763a0a794d975816c72ce` локально прошла end-to-end
positive pinned path: pinned wrapper, marker/nonce-bound identity, private
same-process report evidence, marker/expiry, detached-report и preload negative
cases. Fixture исполняется только в изолированном child process с direct-entry
realpath guard; production root registry на диске остаётся пустым. Remote CI
для этого commit ещё pending. Экспериментальный Node 22
`--experimental-test-module-mocks` остаётся P2 test-infra risk и не является
частью production authority.

Выполнены `SYNTHETIC` rehearsal и локальный public-only test-only pinned-path.
Production-like acquisition/restore/admission, inventory/planner/row dry-run,
reconciliation apply, `VALIDATE`, `CONTRACT`, deployment и production cutover
не выполнялись; remote CI evidence также ещё не получен.

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

- `1.16.0`, 28.07.2026 — runtime admission candidate сохранён на
  `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c`, test evidence отделено commit
  `2341b99937e54cc50d1763a0a794d975816c72ce`. Public-only pre-signed fixture
  без private signing material локально прошла isolated-child positive pinned
  path и negative marker/expiry/detached-report/preload cases; admission tests
  теперь 19/19, authority 9/9. Production root registry остаётся пустым,
  `PRODUCTION_LIKE` — `NO-GO`; signer/acquisition/root enrollment остаются P0,
  remote CI pending. Experimental Node 22 module mocks отмечены как P2
  test-infra risk. Требование двух state-bound envelope и marker rotation
  сохранено.
- `1.15.0`, 28.07.2026 — admission/report schema v2 и SYNTHETIC proposal
  rehearsal привязаны к
  `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c`. Role contract сужен до table
  `SELECT` на восьми relations и exact
  `User(id, tenantId, isPlatformAdmin, isActive, accessScope)`; отклоняются
  table-wide/extra/missing/renamed/grant-option/`PUBLIC` grants и `SELECT *`.
  Добавлен verify-only production-like boundary: canonical base64url Ed25519
  manifest, exact-release pinned roots, nonce-bound DB/approval digests, DB
  comment marker, mandatory freshness, exact runtime/Git-blob binding и
  private same-process positive-report evidence. Legacy production-like HMAC
  identity запрещён; HMAC остаётся только integrity/pseudonymization.
  Пройдены admission 18/18, authority 9/9, smoke self-test 46 и real
  PostgreSQL 16.13 smoke 23 scenarios со всеми восьмью proposal codes и
  coalescing. Synthetic markers — trusted harness/operator declaration, не
  Gate 2 proof. Pinned roots пока пусты; signer/acquisition/root enrollment —
  P0, production-like/apply/deploy/external beta остаются `NO-GO`.
- `1.14.0`, 27.07.2026 — добавлен строго SYNTHETIC StaffTask proposal dry-run
  candidate `dee25393ae7bff171bdd74a49f2d01cdef9ce4ee`: signed disposable
  harness provenance, повторный admission, ранние relation locks, exact
  `8 proposal / 29 operator / 6 review`, bounded unlinkable HMAC evidence и
  no-apply boundary. Пройдены self-test 20, unit 14/14 и PostgreSQL 16.14
  smoke 14 scenarios; оставшиеся 7 positive fixtures + coalescing,
  production-like trust boundary и column-scoped `User` evidence — P1.
  Production-like/standalone/apply/deploy/external beta остаются `NO-GO`.
- `1.13.0`, 27.07.2026 — добавлен обязательный StaffTask snapshot admission
  candidate `7d67333b22f171c6e79f723190647cdd2454b128`: PostgreSQL 16, exact
  `BASELINE_156 | EXPAND_162`, Git-blob migration manifest/catalog и
  девятитабличная SELECT-only role. Локально подтверждены 16 unit,
  34 offline smoke и 9 real PostgreSQL scenarios; production-like запуск,
  remote CI и внешний beta остаются `NO-GO`.
- `1.12.0`, 27.07.2026 — reconciliation contract усилен schema-first exact
  gate, скрытой expected/actual database identity binding,
  `contentDigest`/`executionDigest` и adversarial disposable-clone smoke для
  неверного FK/index; EXPAND guard фиксирует exact migration artifacts и
  дополнительные DDL bypass. Apply/authorization отсутствуют, внешний beta
  остаётся `NO-GO`.
- `1.11.0`, 27.07.2026 — добавлен aggregate-only reconciliation planner:
  classification `8 proposal + 29 operator + 6 review`, exact schema gate,
  exits `0/1/2/3`, actionable cap и HMAC evidence с явным
  запретом использовать proposal/HMAC evidence как apply authorization; EXPAND smoke
  усилен populated baseline `156 → 157..162`.
- `1.10.0`, 27.07.2026 — добавлен schema-only StaffTask integrity EXPAND:
  162 migrations, пять concurrent parent indexes, 14 composite + 14 simple
  compatibility `NOT VALID` FK, archive-first/global-existence protection,
  immutable parent IDs, expanded DDL guard, scoped Prisma drift и staged
  PostgreSQL smoke; production-like reconciliation/VALIDATE/deploy остаются
  `NO-GO`.
- `1.9.0`, 27.07.2026 — добавлен guarded staff task integrity inventory:
  43 reason code, read-only RepeatableRead, deterministic exit gate,
  clean-schema CI и runbook будущих same-tenant/Store deletion constraints.
- `1.8.0`, 27.07.2026 — recurring P1 закрыты Store/participant locks,
  scoped mutation projections, sparse PATCH и Store IANA/DST schedule;
  PostgreSQL race suite включён в обязательный CI.
- `1.7.0`, 27.07.2026 — recurring Rule actor HTTP переведён на persisted
  scope, Rule/Template locks, shared materializer и atomic interactive due;
  scheduler/all-tenant route удалены из runtime graph и оставлены `NO-GO`.
- `1.6.0`, 27.07.2026 — final participant/business-policy checks переведены
  на transaction client, добавлены два regression-теста и явно отделён
  application recheck от ещё не реализованного reference-row/DB invariant.
- `1.5.0`, 27.07.2026 — зафиксированы full API/build gates, real PostgreSQL
  A1→A2/rollback integration, защита начального status и server-owned task
  labels; добавлен inventory/план внедрения templates и recurring rules.
- `1.4.0`, 27.07.2026 — уточнён финальный `STAFF_TASK` candidate: authoritative
  participant scope, application-level task/shift recheck после parent lock,
  fail-closed null-task mutations, capability-gated status transitions и
  подтверждённые focused/DB проверки; full suite/build, legacy task/shift
  invariant, revoke и real A1/A2 integration остаются открыты.
- `1.3.0`, 27.07.2026 — зафиксирован `STAFF_TASK` adoption candidate:
  persisted scope для task list/export/direct paths, transactional comment
  evidence binding и strict task parent reader; verification/revoke и
  production-like A1/A2/B evidence остаются открыты.
- `1.2.0`, 27.07.2026 — зафиксированы attachment rollout modes, beta gates,
  safe shadow semantics и единый RepeatableRead inventory snapshot с secondary
  copies.
- `1.1.0`, 27.07.2026 — добавлен attachment ACL implementation checkpoint:
  155 migrations, partial chat/shift dual-write, read-only inventory, rollout
  ограничения и `NO-GO` до backfill/parent adoption.
- `1.0.0`, 27.07.2026 — принят persisted AccessScope, зафиксированы topology,
  безопасная миграция, порядок модулей и release gates.
