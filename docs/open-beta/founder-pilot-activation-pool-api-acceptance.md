# Founder pilot: dedicated activation pool and API acceptance

Статус:
`EXACT-SHA CI ACCEPTED / LOCAL UNIT 60/60 + POSTGRESQL HTTP PASS / PRODUCTION NO-GO`.

Этот этап связывает уже принятую least-privilege роль
`leetplus_founder_beta_activation_runtime` с production-кодом API. Он не
включает внешний маршрут сам по себе: `FOUNDER_OPERATOR_BETA_MODE` по умолчанию
остаётся `DISABLED`, а создание tenant/GO и вызов activation доступны только
аутентифицированному Platform Admin.

## Runtime-инварианты

`FounderOperatorBetaActivationDatabaseService` создаёт отдельный Prisma client
только из `FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_URL`. Основной
`DATABASE_URL` не может использовать activation role.

Перед каждым callback внутри той же database-транзакции выполняется fresh
session admission. До activation RPC должны одновременно совпасть:

- `session_user` и `current_user` — exact activation role;
- `current_database()` — exact database из dedicated URL;
- при TLS URL — активный TLS 1.2 или TLS 1.3 по собственной строке
  `pg_stat_ssl`/`pg_backend_pid()`;
- production `ACTIVE` URL — только `sslmode=verify-full`;
- bounded Prisma options — `schema=public`, `connection_limit=2`,
  `pool_timeout=5`, `connect_timeout=5`, без дополнительных параметров.

Mismatch, malformed result или query failure возвращает только безопасный
`FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_SESSION_INVALID` до бизнес-effect.
URL, пароль, driver error и PostgreSQL error text в ответ не попадают. При
остановке модуля dedicated client отсоединяется и ссылка на pool очищается.

## PostgreSQL + HTTP acceptance

Existing disposable PostgreSQL fixture теперь обязан:

1. создать отдельную database и применить канонические миграции;
2. создать exact activation role и минимальные grants;
3. оставить primary Prisma client под другой ролью/authority;
4. создать production `FounderOperatorBetaActivationDatabaseService` из exact
   dedicated URL;
5. поднять настоящий Nest `AdminController` и выполнить HTTP `POST
/admin/shared-beta/tenants/:tenantId/activate`;
6. получить `ACTIVATED`, затем direct service replay `REPLAYED`;
7. подтвердить immutable command, `OWNER/NETWORK`, 30-day trial, единственный
   `HOLD→PENDING`, отсутствие plaintext email/token/ciphertext в response;
8. закрыть HTTP app и оба Prisma pool, удалить disposable database и role,
   подтвердить zero database residue.

CI уже содержит отдельный PostgreSQL 16 шаг `Verify founder-operator beta
activation transaction`; поэтому exact commit будет принят только если этот
реальный fixture пройдёт вместе с unit/typecheck/lint и общей release matrix.

Implementation SHA
`5199563561683ae2d9fce4c08aa5d991cf6d2fe3` принят push CI
`32068262701` и PR CI `32068266758` attempt `2` как `3/3 SUCCESS`. В обоих
run actual PostgreSQL + HTTP activation step завершён успешно. Первая попытка
PR-run была отменена после 46-минутного зависания на внешней установке
disposable PgBouncer; повтор прошёл без изменения commit. Push artifact
`9301062934`, digest
`sha256:ed1db27f3bd483668564bd6806952d97405b053612a868c089c2a4281b3316e7`.

## Что этот этап не доказывает

- он не использует immutable production backup или скачанный release artifact;
- локальный CI PostgreSQL fixture не заменяет production HBA/certificate;
- Nest test application не равен полному child process из собранного artifact;
- SMTP real-send, invite accept/revoke/reissue и Gate 1MT/2 не закрыты;
- production, текущие четыре клуба и внешний тестер не изменяются.

Следующая приёмка после exact-SHA CI: полный API child process из release
artifact на isolated restored copy, затем apply/replay/rollback и SMTP barrier.
