# CURRENT183: worker v2 и freshness после tenant-lock

| Поле | Значение |
| --- | --- |
| Контракт | `IDENTITY_MAIL_WORKER_V2_FRESHNESS_PROTOCOL_CANDIDATE_V1` |
| Статус | `IMPLEMENTED_IN_BRANCH / NOT_CANONICAL / NOT_DEPLOYABLE` |
| Каноническая production-схема | `CURRENT179 / 179` |
| Stacked prerequisites | `CURRENT180 -> CURRENT181 -> CURRENT182` |
| Candidate | `20260802010000_identity_mail_worker_v2_freshness_protocol` |
| SQL SHA-256 | `dea22bfccc97d1758d887a2818f931ade089c780350c9618ee319aebb97db63e` |
| Дата | 02.08.2026 |

## 1. Причина изменения

Предыдущая прикладная граница открывала `SERIALIZABLE` transaction, читала
настройки и только затем могла ждать tenant advisory lock. PostgreSQL сохраняет
один transaction snapshot для `SERIALIZABLE`, поэтому защищённый read/RPC после
ожидания мог не увидеть commit держателя lock. Сам lock сериализовал операции,
но не гарантировал свежесть уже выбранного снимка.

Принятый протокол:

```text
bounded READ COMMITTED transaction
  -> statement 1: проверить isolation/read-write и установить локальные timeout
  -> statement 2: получить transaction-scoped tenant advisory lock
  -> statement 3+: выполнить защищённый read/RPC на новом statement snapshot
  -> commit либо полный rollback
```

Lock и защищённый RPC нельзя объединять в один SQL statement: snapshot такого
statement создаётся до возможного ожидания lock. Нельзя также заменять
transaction-scoped lock на session lock: pooled connection может сохранить его
после ошибки или вернуть в pool с чужим состоянием.

Whole-transaction retry ограничен двумя попытками всего. Повторяется только
`P2034`, `40001`, `40P01`, `55P03` или `57014`; после второй ошибки caller
получает типизированное `*_TRANSACTION_RETRY_REQUIRED`. Неизвестная или
бизнес-ошибка не повторяется.

## 2. Реализованные границы

### 2.1. Текущий application/current-worker path

`IdentityEmailClaimService` и текущий
`PrismaIdentityMailWorkerRepository` используют `READ COMMITTED` и exact
порядок `settings -> tenant lock -> protected operation`. Это остаётся
совместимо с canonical `CURRENT179`: migration head/count и пять worker-v1 RPC
не меняются.

CURRENT179 PostgreSQL cross-path fixture дополнен отдельной регрессией:
держатель меняет tenant row под tenant lock, waiter реально наблюдается в
`pg_stat_activity`, а первый read после разблокировки обязан увидеть уже
закоммиченное значение без второй транзакционной попытки.

### 2.2. Dormant worker-v2 adapter

`PrismaIdentityMailWorkerV2CandidateRepository` не зарегистрирован в Nest DI,
не импортируется CLI и не включается конфигурацией. Он закреплён за exact
`CURRENT183/183` и вызывает ровно пять v2 RPC:

1. `identity_mail_delivery_worker_assert_v2`;
2. `identity_initial_owner_mail_claim_v2`;
3. `identity_initial_owner_mail_provider_mark_v2`;
4. `identity_initial_owner_mail_complete_v2`;
5. `identity_initial_owner_mail_reap_v2`.

Для claim/mark/complete/reap `tenantId` всегда является первым аргументом.
Adapter строго проверяет receipts `schemaVersion=2`, exact candidate status,
tenant и lease revision, а также DB-derived
`claimEnrollmentStateRevision`, `claimPolicyRevision` и
`claimProviderAuthorityDigest`. Worker-v1 signatures, reconcile/operator RPC,
relation access и runtime wiring отсутствуют.

### 2.3. Stacked database candidate

CURRENT183 меняет только два owner-controlled routine body:

- `identity_mail_tenant_lock_v1` теперь fail closed требует read-write
  `READ COMMITTED` и bounded statement timeout;
- `identity_mail_delivery_worker_assert_v2` требует exact finished
  `CURRENT183/183` receipt и возвращает только
  `REHEARSAL_READY / NOT_DEPLOYABLE / authorization=false / canSend=false`.

Candidate проверяет exact CURRENT182 predecessor manifest, доступен только в
подтверждённой disposable БД `lp_imtec_<32hex>_ci`, не создаёт relation/role,
не изменяет enrollment/outbox data и не выдаёт ни одного non-owner grant.
CURRENT180 mutation guards сохранены.

## 3. PostgreSQL acceptance matrix

Матрица выполняется только на автоматически созданной disposable PostgreSQL
БД со stacked schema `179 -> 180 -> 181 -> 182 -> 183` и отдельной
`LOGIN NOINHERIT` worker role. Роль получает `EXECUTE` только на пять v2 RPC;
у неё нет v1/helper/reconcile, table, column или sequence privileges,
membership, ownership либо role settings.

Обязательные непустые случаи:

| Enrollment | Outbox | Результат |
| --- | --- | --- |
| `ACTIVE` | `PENDING` | один `CLAIMED`; receipt фиксирует exact state/policy/provider binding |
| `ACTIVE` | `HOLD` | `EMPTY`; строка остаётся `HOLD` без lease |
| `DRAINING` | `PENDING` | readiness fail closed `42501`; новый claim запрещён, строка не меняется |
| `DRAINING` | `HOLD` | readiness fail closed `42501`; строка не меняется |

Freshness race отдельно удерживает тот же tenant lock, меняет enrollment из
`ACTIVE` в `DRAINING` и commit-ит изменение, пока настоящий v2 adapter ждёт
advisory lock. Первый защищённый RPC после ожидания обязан увидеть новое
состояние и fail closed с `42501`, не claim-ив `PENDING`; параллельный другой
tenant продолжает работу. Acceptance также требует zero `40P01`,
неизменный `pg_stat_database.deadlocks`, rollback/cleanup БД и роли.

Поскольку signed enrollment coordinator ещё отсутствует, начальные
ACTIVE/DRAINING/outbox строки создаются только test-owner внутри disposable БД
с локальным диагностическим bypass trigger/FK enforcement. Это допустимый
state-machine/ACL/concurrency fixture, но не доказательство production
authority, signed `ENABLE/BEGIN_DRAIN` или promotion.

## 4. Проверки

Локально:

```text
pnpm --filter database check:identity-mail-worker-v2-freshness-current183-foundation
pnpm --filter api test:ci:identity-mail-worker
pnpm --filter api typecheck
pnpm --filter api lint:ci:identity-mail-worker
pnpm --filter api lint:ci:identity-mail-worker-pg
pnpm --filter api test:integration:identity-mail-worker-v2-current183:pg
```

Foundation validator проверяет exact SQL SHA, predecessor manifest, READ
COMMITTED helper, CURRENT183 readiness, zero grant/role/DML/schema mutation и
отсутствие guard-bypass coordinator. PostgreSQL matrix требует явного
test-only confirmation environment и безопасного PostgreSQL 16 `DATABASE_URL`.

Локальный foundation result: `COMPLIANT`, `21/21`. Exact SQL SHA закреплён
не только metadata-файлом, но и самим статическим gate; metadata repin не
разрешает дополнительный `CREATE`, `ALTER`, `DO` или иной schema drift.

## 5. Что это не разрешает

CURRENT183 и diagnostic matrix не являются:

- signed coordinator для `ENABLE`, `BEGIN_DRAIN`, `RESUME`, `FINALIZE` или
  compensating rollback;
- production backfill либо zero-secret/zero-inflight finalize;
- решением P2 lost-response для provider mark/complete;
- runtime grant/start-v2 или production migration;
- `PRODUCTION DEPLOY GO`, `SHARED BETA GO`, Tenant B, OWNER account/invite,
  SMTP send либо тестовым доступом.

До promotion нужны independent Ed25519 authority, реальные coordinator RPC и
signed ACTIVE/DRAINING transitions, event-backed replay/handoff, production-like
stop-v1/apply/grant/start-v2/rollback/zero-diff, затем отдельные release
решения. До этого production остаётся на `CURRENT179/179`, а четыре текущих
клуба остаются `Store A1..A4` одного `Tenant A`.
