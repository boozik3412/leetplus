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

Exact CURRENT185 implementation
`5ee3228931f92d282f82a3607117f3955b973962` принят GitHub Actions
[`30742082348`](https://github.com/boozik3412/leetplus/actions/runs/30742082348):
новый CURRENT185 gate, authority-root gate, application checks и PostgreSQL
migration smoke — green; CURRENT183 и CURRENT184 PostgreSQL steps также green.

## Почему доступ всё ещё `NO-GO`

Существующий enrollment authority V1 связывает worker role name/OID, но не
связывает enrollment coordinator role name/OID и exact duty-role grants. Его
нельзя незаметно расширить новыми полями. Отдельный signed duty-role manifest и
exact grants catalog уже реализованы как dormant boundary, однако authority V2
и successor manifest, pin-ящий exact V2 artifact/release, ещё отсутствуют.

До внешнего `Tenant B/Store B1` обязательны:

1. enrollment authority V2 и successor signed duty-role manifest, связывающие
   database identity, coordinator/worker role name и OID, exact grants digest и
   exact V2 release/candidate chain;
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

## Целевая двухуровневая RPC-модель

Sealed importer и runtime coordinator нельзя объединять в одну выданную роль:
PostgreSQL не умеет проверять application `WeakSet` brand или Ed25519, поэтому
роль с доступом к raw import RPC смогла бы подделать JSON/digest.

Целевой контракт разделяется так:

1. owner-only importer без runtime grant сохраняет уже проверенные branded
   manifest и command вместе с исходными canonical bytes и signature evidence;
2. enrollment-coordinator получает только
   `identity_mail_tenant_enrollment_drive_command_v2(TEXT, TEXT, TEXT, TEXT)` —
   tenant, command, authorization-envelope digest и duty-manifest digest;
3. driver загружает immutable command и active non-revoked manifest из ledger,
   под tenant lock повторно сверяет `SESSION_USER` name/OID и свежий ACL
   digest, затем idempotently выполняет lifecycle;
4. первый `ROTATE/DISABLE` может только зафиксировать `DRAINING` и вернуть
   `PENDING_ZERO_INFLIGHT`; последующий exact вызов либо повторяет pending, либо
   при zero inflight завершает transition; terminal replay возвращает
   сохранённый receipt;
5. rollback является отдельной подписанной command с
   `intent=ROLLBACK/rollbackOfCommandId`, а не параметром runtime-вызова.

Receipt обязан различать `BEGIN_DRAIN`, `WAIT_ZERO_INFLIGHT`, `FINALIZE` и
`TERMINAL_REPLAY`: одного boolean `replayed` для multi-step lifecycle
недостаточно.

Нельзя применять CURRENT180–184 поверх live CURRENT179 без этой церемонии:
candidate prerequisites требуют owner-only ACL, тогда как текущий runtime уже
имеет grants. Широкий `REVOKE` из disposable fixture также нельзя переносить в
production; допустимы только вычисленный manifest и адресные изменения.

Production остаётся `CURRENT179/179`. Текущие четыре клуба остаются одной сетью
`Tenant A/Store A1..A4`; внешний tenant, OWNER account/invite и SMTP не
создаются.

Связанный следующий boundary:
[CURRENT185 exact duty-role grants и signed manifest](./identity-mail-current185-duty-role-authority.md).
