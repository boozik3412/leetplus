# CURRENT185: sealed boundary подписанного enrollment coordinator

| Поле | Значение |
| --- | --- |
| Статус | `DORMANT_APPLICATION_BOUNDARY / NOT_DEPLOYABLE` |
| Контракт | `IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_V1` |
| Операция | `ACCEPT_VERIFIED_IDENTITY_MAIL_TENANT_ENROLLMENT_COMMAND_CURRENT185` |
| Предшественник | `CURRENT184/184` |
| SQL предшественника | `d889537c9c0e6c8d6862062fd5cd1a45f5f26409993cb3cbba64446dfe71c424` |
| Production authority | `false` |
| Runtime/DI/CLI/DB wiring | отсутствуют |

## Решение

CURRENT185 вводит только sealed application-side bridge между существующим
pinned Ed25519 verifier и будущим owner-owned PostgreSQL RPC. Это намеренно
малый fail-closed слой: он не создаёт SQL candidate, роль, grant, production
root, DB client, Nest provider, CLI-команду или runtime credential.

Persistable является только результат `PINNED`-проверки из того же экземпляра
authority-модуля. Plain object, clone, prototype forgery и валидный
`SYNTHETIC`-результат до owner-owned gateway не доходят.

## Capability boundary

Owner-owned RPC передаётся только как capability, созданная
`createIdentityMailTenantEnrollmentOwnerOwnedRpcCurrent185`:

- capability заморожена и помечена process-local `WeakSet` brand;
- в ней ровно один собственный data-property
  `acceptVerifiedIdentityMailTenantEnrollmentCommand`;
- plain, inherited, accessor, extra-key, symbol-key и proxy-wrapped объекты
  отклоняются без чтения getter/trap;
- handler вызывается с исходной branded capability как `this`.

Публичная структура не считается доказательством полномочий. Brand является
границей внедрения capability, а не заменой PostgreSQL role/grant enforcement.

## Exact command import

Bridge получает из authority-модуля замороженное отображение ровно из 52
аргументов БД. Allowlist колонок закреплён независимо в тесте. Gateway request
также заморожен и связывает:

- `commandId` и равный ему `operationId`;
- `requestId`, `tenantId`;
- `authorizationEnvelopeDigest`;
- contract и operation CURRENT185;
- исходный branded `databaseArguments` без повторной сборки полей.

Gateway обязан вернуть exact plain-object receipt без accessor, symbol и
дополнительных полей. Receipt принимается только при совпадении command,
request, tenant и envelope digest, а также при
`authorization=true`, `canMutate=true`, `decision=ACCEPTED` и
`candidateStatus=NOT_DEPLOYABLE`. Наружу возвращается отдельная замороженная и
брендированная проекция.

## Lost-response contract

Повтор разрешён только для process-local branded
`IdentityMailTenantEnrollmentOwnerOwnedRpcLostResponseError`:

1. первая попытка использует один exact frozen request;
2. после потерянного ответа выполняется ровно один повтор с тем же object
   identity;
3. любой второй исход ошибки превращается в typed ambiguous outcome с
   PII-free operation identity;
4. обычная ошибка не повторяется;
5. строка или поле `code`, имитирующие lost response, полномочий на retry не
   дают.

Это контракт вызова будущего crash-idempotent DB RPC. Сам persisted operation
ledger этим slice ещё не реализован.

## Evidence

- coordinator checks: `14/14 PASS`;
- source-purity gate фиксирует единственный разрешённый import и запрещает
  production roots, env/config lookup, SQL grants, Prisma/Nest/PG/HTTP clients и
  runtime wiring;
- CURRENT184 принят на exact implementation
  `db154b412a9469f49fab6b27ad2e333426cdfa7f` в GitHub Actions
  [`30740155651`](https://github.com/boozik3412/leetplus/actions/runs/30740155651):
  application checks, authority-root gate и PostgreSQL migration smoke зелёные;
  CURRENT183 и CURRENT184 PostgreSQL suites — по `3/3 PASS`.

Remote CURRENT185 evidence появляется только после CI на exact commit,
содержащем этот документ и boundary. Локальные проверки не заменяют его.

## Почему доступ всё ещё `NO-GO`

Существующий enrollment authority V1 связывает worker role name/OID, но не
связывает enrollment coordinator role name/OID и exact duty-role grants. Его
нельзя незаметно расширить новыми полями: нужен новый versioned signature
domain/profile либо отдельный подписанный duty-role manifest с собственной
историей ключей.

До внешнего `Tenant B/Store B1` обязательны:

1. signed duty-role manifest и enrollment authority V2, связывающие database
   identity, coordinator/worker role name и OID, exact grants digest и exact
   release/candidate chain;
2. owner-owned crash-idempotent begin/resume/finalize/rollback ledger и RPC;
3. отдельные `NOLOGIN` schema owner, application runtime, activation
   coordinator, enrollment coordinator и worker-v2 роли с минимальными grants;
4. расширенная runtime attestation: role OID, membership в обе стороны,
   `rolconfig`, database settings, ownership/default ACL и global routine ACL с
   точным grantor и отсутствием лишних grantee;
5. producer/activation v2, `DRAINING` settlement-only, zero-secret,
   zero-inflight и production-history backfill;
6. production-like stop-v1 → snapshot → targeted revoke → apply → targeted
   grant → start-v2, затем rollback и zero-diff rehearsal;
7. отдельные решения `PRODUCTION DEPLOY GO` и `SHARED BETA GO`.

Нельзя применять CURRENT180–184 поверх live CURRENT179 без этой церемонии:
candidate prerequisites требуют owner-only ACL, тогда как текущий runtime уже
имеет grants. Широкий `REVOKE` из disposable fixture также нельзя переносить в
production; допустимы только вычисленный manifest и адресные изменения.

Production остаётся `CURRENT179/179`. Текущие четыре клуба остаются одной сетью
`Tenant A/Store A1..A4`; внешний tenant, OWNER account/invite и SMTP не
создаются.
