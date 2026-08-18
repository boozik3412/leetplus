# Founder-pilot mail tenant enrollment

Статус:
`EXACT-SHA CI ACCEPTED / CLEAN+SEQUENTIAL POSTGRESQL PASS / PRODUCTION NO-GO`.

## Назначение

Этот controller закрывает операционный разрыв между созданием отдельного
`Tenant B/Store B1` и отправкой его первого email-bound OWNER invite. До его
появления release artifact умел выдать пятифункциональные grants почтовому
worker role, но не содержал безопасного действия для включения ровно одного
pilot tenant.

Контур не создаёт отдельную базу для клиента. Все сети работают в общей SaaS
topology, но каждая сеть имеет собственный `Tenant`; enrollment содержит только
`tenantId`, точную identity worker role/OID, retry policy и digest authority
SMTP provider. Клиенту не нужен USB-ключ или иной дополнительный ключ.

## Контракт

`FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_V1` поддерживает четыре режима:

- `plan` — блокирующая проверка всех предусловий и выдача exact confirmation;
- `apply` — первое включение единственного pilot tenant;
- `check` — read/lock/attest без изменения registry;
- `disable` — CAS-выключение после проверки отсутствия `CLAIMED` outbox.

Каждый запуск связан с:

- точным `CURRENT185`, count `185` и ожидаемой PostgreSQL 16;
- database name и owner session без `SET ROLE`;
- конкретным `Tenant`, `releaseSha` и environment из immutable
  `FounderOperatorBetaActivationCommand`;
- единственным актуальным `OWNER/NETWORK` invite/outbox этого tenant;
- точными mail worker role name/OID и ровно пятью разрешёнными delivery RPC;
- отсутствием relation/column/sequence/CREATE/extra-function grants;
- фиксированной policy `5 attempts / 60s lease / 300s acknowledge /
30s..900s retry`;
- `providerAuthorityDigest`, tenant advisory lock и `SERIALIZABLE` transaction.

Изменение другого tenant невозможно: все state reads и единственный
`INSERT/UPDATE` используют тот же exact `tenantId`. Несколько активных owner
invite, role/release drift, истёкший trial, неподходящий lifecycle или активный
claim переводят операцию в fail-closed.

## Lost response и rollback

Если ответ теряется после возможного commit, controller открывает новую
`SERIALIZABLE` transaction и признаёт успех только при полном совпадении
tenant/role/OID/policy/provider digest и ожидаемого enabled state. Иначе
возвращается `OUTCOME_AMBIGUOUS`, а evidence сохраняется для ручного разбора.

`disable` не удаляет registry row. Оно монотонно увеличивает
`policyRevision`, устанавливает `disabledAt` и оставляет историю привязки.
Повторное включение уже отключённой строки намеренно не выполняется этим V1 и
требует отдельного reviewed решения.

## PII и секреты

CLI не выбирает и не выводит email, имя, invite token, ciphertext, SMTP
password или database URL. Receipt содержит только технические identifiers,
release/role/policy bindings, решение и SHA-256 digests. Временный пароль и
ручное создание `User` этим контуром не поддерживаются.

## Операторский запуск

В release environment задаются:

```text
DATABASE_URL
FOUNDER_PILOT_MAIL_EXPECTED_DATABASE
FOUNDER_PILOT_MAIL_TENANT_ID
FOUNDER_PILOT_MAIL_ENVIRONMENT=production
FOUNDER_PILOT_MAIL_RELEASE_SHA
FOUNDER_PILOT_MAIL_WORKER_ROLE
FOUNDER_PILOT_MAIL_EXPECTED_ROLE_OID
FOUNDER_PILOT_MAIL_PROVIDER_AUTHORITY_DIGEST
FOUNDER_PILOT_MAIL_OPERATION_ID
```

Сначала выполняется:

```text
node packages/database/scripts/founder-pilot-mail-tenant-enrollment.cli.mjs --mode plan
```

Только после сохранения PII-free plan receipt точное поле
`requiredConfirmation` передаётся через `FOUNDER_PILOT_MAIL_CONFIRM`, затем
выполняется `--mode apply`. После запуска worker обязательны `--mode check`,
delivery `SENT`, invite preview/accept и day-0 monitoring. Для аварийной
остановки сначала прекращается polling worker, затем используется exact
`requiredDisableConfirmation` из `check` и `--mode disable`.

## Принято

- adversarial controller matrix: `7/7 PASS`;
- syntax, Prettier, database typecheck и scoped API PostgreSQL lint: `PASS`;
- полный disposable PostgreSQL 16 founder lifecycle: `1/1 PASS`;
- реальный путь fixture теперь использует CLI вместо прямого создания
  `IdentityMailDeliveryTenantEnrollment`;
- после enrollment worker выполнил `PENDING→SENT`, владелец установил свой
  пароль, а disposable database/roles были удалены без residue.

Implementation commit:
`3eef2be1b8a04888908bfd28d5e9c77007bd0449`. Он отправлен в
`codex/open-beta-hardening`. PII-free ACL/migration violation codes добавлены
commit `df6b6465…`; отдельный focused PostgreSQL gate — `f249573d…`.

Полный CI обнаружил не дефект tenant enrollment, а residue предыдущего
PgBouncer fixture: fixture включал PostgreSQL TLS через `ALTER SYSTEM`, но
восстанавливал только `pg_hba.conf`. Commit
`5574821723de22d3d83a51a03f3dbdab639cd53d` теперь сохраняет и возвращает
точный `postgresql.auto.conf`, перезапускает disposable PostgreSQL и удаляет
ровно три fixture-сертификата. Отдельный post-cleanup gate подтвердил
`ssl=off`, после чего тот же founder lifecycle прошёл в последовательном
migration-smoke без ослабления `LOOPBACK_PLAINTEXT` или grant allowlist.

Exact head принят:

- push CI
  [32115334678](https://github.com/boozik3412/leetplus/actions/runs/32115334678)
  и PR CI
  [32115340009](https://github.com/boozik3412/leetplus/actions/runs/32115340009) —
  `4/4 SUCCESS`;
- focused PostgreSQL PR gate
  [32115339918](https://github.com/boozik3412/leetplus/actions/runs/32115339918) —
  `SUCCESS`;
- artifact `9316782148`, `28 481 175` bytes, GitHub digest
  `sha256:a2b0ea21563efb5fc9c1df078a9d0d97afce9f9c8b404d9351457aa7433f0706`;
- downloaded archive SHA-256
  `d360e5b18666ca347ba5b76a6453db9f8414fc8ed3ecf3ff553e2eb9a7849167`
  совпал с outer checksum;
- provenance: CURRENT185/count `185`, founder scripts `8`, runtime enrollment
  scripts `6`, total operational scripts `14`; оба mail tenant enrollment
  source/CLI находятся в archive.

## Что всё ещё блокирует внешний доступ

Этот controller не применён к production и сам по себе не является `GO`.
Перед первым реальным invite обязательны:

1. immutable production backup и изолированная restored copy;
2. прогон exact downloaded artifact на restored copy;
3. создание и attestation production runtime/activation/mail-worker roles;
4. production encryption/SMTP secrets и trusted-SMTP canary;
5. Gate 1MT/2 production-like acceptance текущего `Tenant A/A1..A4`;
6. production deploy в `PREPARE`, recovery point и только затем отдельный
   `Tenant B/Store B1`, persisted GO, controlled activation и этот enrollment.

USB/offline key ceremony остаётся post-beta hardening и в этот список не
входит.
