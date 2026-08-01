# Protected mail-worker tenant enrollment

Контракт: `PROTECTED_MAIL_WORKER_TENANT_ENROLLMENT_V1`
Backlog: `BETA-IAM-004K`
Версия документа: `0.4`
Дата: `30.07.2026`
Статус: `FOUNDATION_IMPLEMENTED / READ_ONLY_PREFLIGHT_IMPLEMENTED /
NOT_DEPLOYED / EXTERNAL_PILOT_NO-GO`

## 1. Назначение

Этот checkpoint вводит отдельную operator-only границу включения
identity-mail worker для ровно одного tenant. Он нужен до отправки первого
`OWNER + NETWORK` invite внешнему клубу.

Целевая topology не меняется:

- четыре текущих клуба остаются `Tenant A / Store A1..A4`;
- первый внешний клуб создаётся отдельно как `Tenant B / Store B1`;
- worker и SMTP могут быть общими для нескольких tenant;
- настройки, роли, данные и delivery policy каждого tenant остаются
  tenant-scoped;
- добавление Tenant B не должно менять provider authority уже принятого
  Tenant A.

## 2. Граница текущего slice

Текущий slice не создаёт migration, enrollment row, роль, SMTP credentials,
production marker, tenant, пользователя или invite. Он содержит только
неавторизующий `--check`; `apply/rollback` отсутствуют.

Реализуется только безопасный фундамент:

1. полный worker config разделён на независимые
   `providerAuthorityDigest` и `runtimeConfigDigest`;
2. claim, reap и provider marker передают в PostgreSQL только
   `providerAuthorityDigest`; readiness получает по `tenantId` PII-free
   enrollment receipt и сравнивает его authority digest с ожидаемым в
   приложении;
3. `runtimeConfigDigest` остаётся process-level evidence и не сохраняется в
   enrollment/outbox;
4. future ceremony proposal имеет строгий PII/secret-free parser, но явно
   возвращает `authorization=false` и `canMutate=false`;
5. production registry остаётся пустым по умолчанию.
6. read-only preflight сопоставляет proposal с независимо прочитанными
   database/role/release/tenant/enrollment/drain evidence, но всегда возвращает
   `authorization=false` и `canMutate=false`.

Исторические SQL-функции и их positional signatures не переименовываются:
они checksum/prosrc-pinned. Их аргумент с историческим именем
`p_worker_config_digest` семантически и фактически получает только
`providerAuthorityDigest`. Исторический семиаргументный `complete_v1` authority
digest не принимает: он завершает уже выданную lease по CAS. Безопасная
ротация поэтому требует `DRAINING`, немедленного запрета новых claims и
доказанного zero-`CLAIMED` перед сменой authority.

Существующая строка enrollment, если она была создана со старым full-config
digest, после обновления fail-closed перестанет совпадать. Dual-accept
запрещён. Перед rollout registry должен быть доказанно пуст; при ненулевом
registry требуется отдельная rotate ceremony, а не автоматическая перезапись.

## 3. Два независимых digest

### 3.1. `providerAuthorityDigest`

Domain discriminator: `IDENTITY_MAIL_PROVIDER_AUTHORITY_V1`.

Digest связывает:

- expected database name;
- worker role name;
- обязательность TLS текущей database session;
- database connect/socket timeouts;
- exact migration head и migration count;
- exact release SHA;
- public web origin;
- encryption key version и SHA-256 fingerprint без raw key;
- AAD environment;
- SMTP host, port, TLS mode и server name;
- digest SMTP username и keyed HMAC SMTP password без raw credential;
- sender, Message-ID domain и SMTP timeouts.

Изменение database/release/role, crypto или SMTP authority требует отдельной
rotate ceremony. Dual-accept старого и нового digest запрещён.

### 3.2. `runtimeConfigDigest`

Domain discriminator: `IDENTITY_MAIL_RUNTIME_CONFIG_V1`.

Digest связывает:

- `providerAuthorityDigest`;
- canonical sorted tenant allowlist;
- real-send/live-canary flags;
- poll interval;
- lease, batch, attempts и retry policy;
- health host/port.

Добавление tenant и изменение allowlist, poll, batch, `leaseMs`,
`maxAttempts`, `baseRetryMs` или `maxRetryMs` меняет runtime digest, но не
provider authority существующего tenant. Из SMTP
connection/greeting/socket timeouts вычисляется только process-side
`minimumAcknowledgeSeconds`; сами timeouts входят в provider authority.
Persisted `acknowledgeSeconds` — отдельное подписанное поле tenant delivery
policy, и readiness принимает его только в bounded диапазоне и не меньше
process minimum. Весь подписанный delivery policy отдельно проверяется DB
enrollment readiness.

### 3.3. Запрещённые данные

Ни canonical payload, ни logs/health/receipt не содержат:

- raw `DATABASE_URL` или database password;
- raw encryption key;
- raw SMTP username/password;
- recipient email;
- invite token, URL fragment или ciphertext;
- provider response body.

## 4. Целевая state machine

Текущий boolean `enabled` недостаточен для безопасного multi-tenant rollout.
Следующая additive migration должна ввести явное состояние:

```text
ACTIVE
DRAINING
DISABLED
```

| Переход                     | Условие                                                                       |
| --------------------------- | ----------------------------------------------------------------------------- |
| absent/`DISABLED -> ACTIVE` | signed `ENABLE`, exact release/database/role/provider authority, revision CAS |
| `ACTIVE -> DRAINING`        | signed `DISABLE` или начало `ROTATE`; новые claims запрещаются сразу          |
| `DRAINING -> DISABLED`      | claimed work отсутствует; expired leases reaped/quarantined                   |
| `DRAINING -> ACTIVE`        | rotate завершён, claimed work отсутствует, новая authority/policy принята     |

Rollback не удаляет event/enrollment и не уменьшает revision. Он повторно
принимает предыдущую authority/policy как новую монотонную revision.

Восстановление после crash выбирает модель exact persisted-request replay.
Apply-слой обязан до первого `ACTIVE -> DRAINING` сохранить неизменяемую
command identity:

```text
(tenantId, action, requestId, contentDigest)
```

Только повтор той же уже проверенной и сохранённой команды может
возобновить drain и завершить переход из `DRAINING`. Новый proposal, другой
`requestId`, action либо `contentDigest` из `DRAINING` отклоняется. Contract
parser поэтому намеренно не принимает `DRAINING` как исходное состояние
нового proposal; фактический resume/finalize остаётся обязанностью будущего
transactional apply-слоя. Истечение исходного proposal после его атомарного
принятия не блокирует завершение уже persisted команды: restart повторно
проверяет сохранённую подпись, marker provenance и exact command identity, но
не создаёт новое authorization.

Единый lock order для будущих RPC:

```text
tenant advisory lock
  -> tenant enrollment row
  -> tenant outbox rows
  -> invite / tenant / claim rows
```

Provider completion, claim и reap не могут брать эти блокировки в обратном
порядке.

## 5. Future proposal contract

Contract-only parser принимает exact-key proposal
`PROTECTED_MAIL_WORKER_TENANT_ENROLLMENT_V1` для действий:

```text
ENABLE
ROTATE
DISABLE
```

Proposal связывает:

- UUID `requestId` и `tenantId`;
- expected database name/OID;
- expected worker role name/OID;
- exact release SHA и deployment-marker digest;
- provider authority и runtime config digests;
- expected/next monotonic revision;
- bounded delivery policy;
- expected current state;
- bounded requested/expires timestamps.

Parser:

- отклоняет extra/missing keys;
- отклоняет неверные UUID/SHA/digest/OID/policy/time window;
- требует `nextRevision = expectedRevision + 1`;
- допускает `ENABLE` только из `ABSENT|DISABLED`, а `ROTATE|DISABLE` только из
  `ACTIVE`;
- возвращает deterministic `contentDigest`;
- не проверяет production signature и поэтому никогда не авторизует mutation.

## 6. Read-only preflight

Контракт `PROTECTED_MAIL_WORKER_TENANT_ENROLLMENT_PREFLIGHT_V1` является
inspection gate, а не ceremony допуска. CLI принимает только:

```text
node scripts/identity-mail-tenant-enrollment-preflight.cli.mjs \
  --check --proposal-file <canonical-json-path>
```

Файл proposal должен быть regular UTF-8 без BOM/NUL, не больше `64 KiB` и
содержать canonical JSON без whitespace, duplicate или trailing fields.
Shape, срок и transition проверяются до импорта Prisma: malformed/expired
proposal не открывает database connection.

Target provider authority и пять policy-параметров берутся из отдельного
operator environment, а не копируются из proposal:

```text
IDENTITY_MAIL_TENANT_ENROLLMENT_PROVIDER_AUTHORITY_DIGEST
IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_ACKNOWLEDGE_SECONDS
IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_BASE_RETRY_SECONDS
IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_LEASE_SECONDS
IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_MAX_ATTEMPTS
IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_MAX_RETRY_SECONDS
```

В текущем bounded slice `DATABASE_URL` допускает только exact numeric
`127.0.0.1` или `[::1]`, safe non-system database и единственный
`schema=public`. Remote host, `localhost`, normalized IPv4 alias, fragment,
duplicate/extra option и любой TLS downgrade отклоняются до Prisma. Поэтому
production-like check запускается локально на целевом DB host; remote
strict-TLS transport и его фактическое TLS evidence должны приниматься
отдельным последующим контрактом, а не неявным fallback.

Один `READ ONLY REPEATABLE READ` snapshot проверяет:

- PostgreSQL 16, database name/OID, exact `CURRENT_179` и count `179`;
- exact worker role name/OID, non-privileged attributes, database/schema ACL,
  zero table/column/sequence access, ровно пять разрешённых delivery RPC;
- только указанный tenant, его legacy enrollment и число `CLAIMED`;
- текущий unrevoked/unexpired deployment marker, build/challenge/database/
  actual-context bindings и exact release SHA;
- independently configured provider authority и bounded delivery policy.

Отчёт содержит только PII/secret-free projection, sorted findings и
deterministic digests. `MATCHED` означает только отсутствие расхождений в
прочитанном snapshot. Он не является подписью, persisted decision или
разрешением на mutation. Следующие controls всегда перечислены как deferred:

```text
APPLY_ROLLBACK
INDEPENDENT_SIGNATURE
PERSISTED_REQUEST_REPLAY
RUNTIME_CONFIG_DIGEST
STATE_EVENT_MIGRATION
```

`runtimeConfigDigest` намеренно не сравнивается с самим собой: `CURRENT_179`
не содержит независимого database source этого process-level evidence.
CLI возвращает exit `0` только для `MATCHED`, exit `2` для успешно
сформированного `BLOCKED` report и exit `1` для contract/I/O/database error.
Ни один из этих кодов не является apply authorization.

Обязательный static/unit gate:

```text
pnpm --filter database check:identity-mail-tenant-enrollment-preflight
```

PostgreSQL gate требует явного test-confirmation, клонирует только loopback
`*_ci` database в случайную disposable `*_ci`, проверяет один `DISABLED` и
один `ABSENT` tenant, zero-diff protected relations/source и удаляет только
повторно проверенный clone:

```text
pnpm --filter database db:smoke:identity-mail-tenant-enrollment-preflight
```

Текущий PostgreSQL gate намеренно подтверждает fail-closed путь `BLOCKED` при
отсутствующих exact worker role и release marker. Позитивный real-PostgreSQL
путь `MATCHED` с точной ролью, пятью RPC и актуальным marker пока покрыт
unit/mock-контрактом и остаётся обязательным отдельным gate до реализации
apply и production-like rehearsal.

## 7. Что требуется до apply

Следующие bounded slices обязаны добавить отдельно:

1. additive schema/event migration с `ACTIVE/DRAINING/DISABLED`;
2. append-only PII-free enrollment event ledger;
3. operator CLI с раздельными `--check`, `--apply`, `--rollback` и exact
   confirmation;
4. независимую подпись proposal и привязку к реально установленному
   deployment marker/DB identity;
5. exact role name/OID, database name/OID и hostile ACL admission;
6. request idempotency и optimistic revision;
7. persisted-command-before-drain и exact same-request resume/finalize после
   crash;
8. two-tenant PostgreSQL 16 tests, включая одновременный drain/claim/reap;
9. zero-diff повтор, stale revision, wrong SHA/DB/role/config и rollback;
10. production-like rehearsal на disposable clone;
11. отдельный production `GO` на одну точную mutation.

Role-level enrollment и tenant-level enrollment являются разными ceremony.
Приложение не создаёт worker role и не получает полномочия изменять registry.

## 8. Acceptance matrix

До engineering acceptance 004K обязательны:

- Tenant B не меняет provider authority Tenant A;
- разные allowlist/poll/batch/policy меняют только runtime digest;
- SMTP/crypto/release/database/role drift меняет authority digest;
- runtime digest никогда не попадает в DB worker RPC;
- production registry по умолчанию пуст;
- disable немедленно блокирует новый claim и сохраняет deterministic
  drain/reap/reconciliation;
- check/apply/rollback/zero-diff проходят на disposable PostgreSQL 16;
- hostile PUBLIC/direct table/column/sequence/function/database ACL
  fail-closed;
- receipt/event не содержат PII или secrets;
- independent review не имеет P0/P1/P2;
- exact-SHA GitHub CI проходит `3/3`.

## 9. Release decision

Текущий slice не разрешает production deploy или внешний доступ.
Реальный email тестировщика, пароль, Tenant B, Store B1 и owner invite не
сохраняются и не создаются. До завершения 004K, 004L и отдельного
`SHARED BETA GO` статус остаётся:

```text
NOT_DEPLOYED / EXTERNAL_PILOT_NO-GO
```
