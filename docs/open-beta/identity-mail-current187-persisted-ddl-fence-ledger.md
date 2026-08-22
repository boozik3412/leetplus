# CURRENT187-E: persisted consumption и revocation ledger для DDL fence

Дата фиксации: 05.08.2026.

Статус: `IMPLEMENTED / DENY-ONLY / SYNTHETIC-CI / NONCANONICAL / NOT_DEPLOYABLE`.

CURRENT187-E закрывает узкий инженерный разрыв после CURRENT187-D: процессный
receipt независимой Ed25519-attestation теперь можно один раз записать в
append-only PostgreSQL ledger, безопасно повторить после lost response и
отозвать по envelope, attestation или signing-root digest.

Этот slice не выдаёт тестовый доступ, не создаёт tenant или пользователя, не
подключает клуб, не вызывает Langame/Telegram/SMTP и не разрешает production
apply. Текущая сеть `Tenant A/A1..A4`, внешний тестер и production не менялись.

## Что реализовано

Pure data-only модуль строит из WeakSet-branded CURRENT187-D receipt два
канонических command bundle:

1. consumption с exact binding на `operationId`, `nonce`, envelope,
   attestation, signing-root fingerprint, purpose/trust-domain, release,
   cluster, final snapshot и DDL-fence state;
2. revocation с отдельным purpose/trust-domain и exact scope `ENVELOPE`,
   `ATTESTATION` либо `ROOT`.

Модуль принимает обратно persisted receipts только при совпадении command и
всех deny-only полей. Успешная проверка создаёт новый непереносимый brand;
clone не сохраняет доверие.

SQL-кандидат находится вне `prisma/migrations` и создаёт:

- `Current187DdlFenceLedgerPolicy` с точными name+OID owner/consumer/revoker/
  application-runtime roles;
- `Current187DdlFenceConsumptionLedger` с независимой уникальностью
  `operationId`, `nonce`, `envelopeDigest` и `commandDigest`;
- `Current187DdlFenceRevocationLedger` с уникальностью `eventId` и пары
  `scope/scopeDigest`;
- execute-only consume/revoke RPC для двух разных duty roles.

Все три таблицы append-only: UPDATE, DELETE и TRUNCATE блокируются триггером.
На них включены `ENABLE ROW LEVEL SECURITY` и `FORCE ROW LEVEL SECURITY`; по
одной policy адресовано только точному table/function-owner role, разрешённому
при установке. `PUBLIC`, consumer, revoker и application-runtime не имеют
прямого table DML. Consumer может вызвать только consume RPC, revoker — только
revoke RPC, application-runtime — ни один из этих RPC.

## Replay, conflicts и revocation race

Перед любым чтением существующей строки RPC берут transaction-scoped advisory
locks в едином порядке:

```text
root -> envelope -> attestation -> operation -> nonce -> FOR UPDATE
```

Revocation использует тот же namespace для своего scope. Поэтому возможны
только два безопасных результата гонки:

- consume завершился первым, после чего revoke записан и все дальнейшие
  consume-replay отклоняются;
- revoke завершился первым, и consume сразу отклоняется.

Время валидности повторно читается только после получения всей lock-chain.
Отдельный PostgreSQL fixture удерживает root lock до истечения команды и
подтверждает `55000` и нулевой persisted residue после освобождения lock.

Exact lost-response retry возвращает сохранённый `receiptCanonicalJson` byte
for byte. Повтор с изменённым operation, nonce, envelope, event или scope
завершается `23505`. Expired или revoked command завершается `55000`, включая
ранее успешно consumed command после последующего revoke.

## Данные receipt

Ledger хранит только UUID, SHA-256 digests, ограниченные технические ids,
timestamps, transaction id и явные deny flags. CHECK constraints и
application verifier запрещают email, URL, PEM/key material, password, secret,
token и provider identifiers. Неизменные флаги:

```text
authorization=false
canApply=false
canMutate=false
canSend=false
testAccessAuthorized=false
sharedBetaAccess=false
productionRootEnrolled=false
noncanonical=true
syntheticLoopbackCiOnly=true
```

`persistedConsumptionVerified=true` или `persistedRevocationVerified=true`
означает только успешную запись и проверку этого deny-only CI ledger. Это не
эквивалент `SHARED BETA GO`.

## Как воспроизвести

Unit/foundation проверки не требуют базы:

```bash
node --test \
  scripts/identity-mail-ddl-fence-attestation-current187-authority.test.mjs \
  scripts/identity-mail-ddl-fence-ledger-current187.test.mjs \
  scripts/identity-mail-ddl-fence-ledger-current187-foundation.test.mjs
```

Реальный PostgreSQL acceptance запускается только при exact confirmation,
loopback `DATABASE_URL` к отдельной `*_ci`/`*_test` admin-БД и доступном
`psql` (либо `PSQL_BIN`):

```bash
IDENTITY_MAIL_DDL_FENCE_LEDGER_CURRENT187_PG_E2E_CONFIRM=run-current187e-ddl-fence-ledger-postgres-e2e \
DATABASE_URL=postgresql://...@127.0.0.1:5432/leetplus_ci \
node --test scripts/identity-mail-ddl-fence-ledger-current187.pg.integration.test.mjs
```

Fixture сам создаёт БД вида `lp_c187e_<12 hex>_ci` и четыре случайные LOGIN
roles, применяет candidate от имени unprivileged database owner, выполняет
hostile matrix и удаляет БД/roles. Он проверяет zero residue и не обращается к
существующим tenant/application таблицам.

Текущий SHA-256 SQL candidate:
`dd5f4db5aecef2c537251bc5262063c1012a1383aec0d0137e7d8b9536f8bb63`.

## Что остаётся заблокированным

До production admission по-прежнему нужны отдельные решения:

1. production root enrollment и независимая ceremony ротации/отзыва;
2. подтверждённые HBA/TLS/pooler/service-account mappings и runtime role
   attestation на целевом кластере;
3. predecessor resolution и reviewed canonical migration;
4. production-like apply/rollback/zero-diff rehearsal;
5. provider mark/complete lost-response и общий launch decision.

До закрытия этих gates внешний тестовый доступ остаётся `NO-GO`.
