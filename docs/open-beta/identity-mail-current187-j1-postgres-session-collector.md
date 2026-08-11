# CURRENT187-J1: actual PostgreSQL backend session collector

Дата фиксации: 11.08.2026

Статус: `LOCAL CANDIDATE / ACTUAL POSTGRESQL BACKEND SESSION / DENY-ONLY / CI PENDING / NOT DEPLOYABLE`

## Назначение

CURRENT187-J1 заменяет первую часть synthetic CURRENT187-J реальным
capability-bearing read-only подключением через Prisma к PostgreSQL. Коллектор
предназначен для отдельного запуска от каждого из четырёх production service
account: `APPLICATION`, `COORDINATOR`, `MIGRATION`, `WORKER`.

Код:

- `packages/database/scripts/identity-mail-cluster-postgres-session-collector-current187.mjs`;
- `packages/database/scripts/identity-mail-cluster-postgres-session-collector-current187.test.mjs`;
- `packages/database/scripts/identity-mail-cluster-postgres-session-collector-current187.pg.integration.test.mjs`.

## Что коллектор доказывает

В одной bounded Prisma transaction коллектор сначала выполняет
`SET TRANSACTION READ ONLY`, устанавливает локальные statement/lock/idle
timeouts, затем получает и exact-shape проверяет:

- имя и OID фактической базы;
- `session_user`, `current_user` и их OID;
- фактический `application_name`, backend PID и старт postmaster;
- server/client address и port, доступные PostgreSQL backend;
- server version, recovery и read-only state;
- negotiated TLS flag, version, cipher, bits и доступные `pg_stat_ssl` поля;
- role attributes, connection limit, database privileges, memberships и role
  settings;
- отдельный положительный read-only `SELECT` probe.

Production entrypoint принимает только `environment=production`, отдельное
явное подтверждение и URL с `sslmode=verify-full`, `sslaccept=strict`, exact
role/database/application name и `connection_limit=1`. CI entrypoint принимает
только loopback `*_ci`/`*_test` и `sslmode=disable`.

Receipt не содержит URL, пароль или сырые database/role names. Он содержит
только scoped SHA-256 evidence, exact release/binding digests и сохраняет:

- `authorization=false`;
- `canMutate=false`;
- `canSend=false`;
- `productionRootEnrolled=false`;
- `productionRuntimeAttested=false`;
- `testAccessAuthorized=false`;
- `sharedBetaAccess=false`.

Plain-object clone не проходит process-local brand boundary. Ошибка query,
normalization, timeout или disconnect не возвращает частичное evidence и не
раскрывает исходный exception/credential.

## Граница доказательства

Backend SQL не доказывает весь сетевой маршрут. Поэтому J1 намеренно всегда
возвращает:

- `endpointIdentityAttested=false`;
- `hbaRuleMatched=false`;
- `poolerIdentityObserved=false`;
- `negativeProbePerformed=false`;
- `productionRuntimeAttested=false`.

`inet_server_addr()` и `inet_client_addr()` описывают соединение со стороны
PostgreSQL backend. Они не подтверждают DNS/клиентский socket peer и не
различают заявленный endpoint и PgBouncer перед PostgreSQL. `pg_stat_ssl`
подтверждает negotiated backend TLS, но сам по себе не является независимым
доказательством выбранного server certificate hostname/CA. PostgreSQL также не
сообщает через эту сессию exact matched `pg_hba.conf` rule.

Из этого следует, что J1 нельзя использовать вместо отдельного endpoint
collector, PgBouncer control-plane evidence, HBA/reload attestor и negative
probe runner.

## Локальная приёмка

- standalone syntax/unit: `10/10`;
- общий CURRENT187 acquisition/semantic/policy gate: `52/52`;
- Prettier: green;
- добавлен обязательный PostgreSQL CI integration smoke на фактической Prisma
  backend-сессии одноразовой loopback CI базы;
- локальный PostgreSQL integration не запускался: в рабочей среде отсутствуют
  `DATABASE_URL` и listener на `5432`;
- exact-SHA CI и artifact для J1 ещё не получены;
- production, `Tenant A/A1..A4`, внешний tenant, user и invite не изменялись.

## Оставшийся P0-путь CURRENT187-J

1. Принять exact-SHA CI с реальным PostgreSQL integration smoke J1.
2. Запустить J1 отдельно от production identities `APPLICATION`,
   `COORDINATOR`, `MIGRATION`, `WORKER` и доказать их попарное разделение.
3. Реализовать независимые endpoint/TLS-peer, HBA/reload и PgBouncer collectors,
   а также положительные и отрицательные probes фактического маршрута.
4. Добавить независимый production signer/root, freshness/reload epoch,
   persisted one-time consumption/revocation и lost-response reconciliation.
5. Принять hostile real-topology matrix: wrong CA/hostname, plaintext, `trust`,
   wildcard, collapsed user, wrong DB/role, pool mode и stale reload.
6. Связать только полный branded production J receipt с CURRENT187-F и
   production deploy authority, затем выполнить independent latest-byte review,
   canonical promotion и restored-copy rehearsal.

До выполнения всех пунктов внешний тестовый доступ остаётся `NO-GO`.
