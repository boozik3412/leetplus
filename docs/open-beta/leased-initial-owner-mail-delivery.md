# Leased initial-owner mail delivery

Контракт: `LEASED_INITIAL_OWNER_MAIL_DELIVERY_V1`
Backlog: `BETA-IAM-004J`
Версия документа: `0.5`
Дата: `30.07.2026`
Статус: `LOCAL_ACCEPTANCE_COMPLETE / EXACT_SHA_CI_PENDING / NOT_DEPLOYED /
EXTERNAL_PILOT_NO-GO`

## 1. Назначение

Этот checkpoint добавляет доставку единственного bootstrap-приглашения
первого владельца внешней сети. Он не меняет модель продукта:

- одна сеть является отдельным `Tenant`;
- клубы сети являются tenant-scoped `Store`;
- первый владелец получает `OWNER + NETWORK`;
- последующие пользователи, роли, клубы и интеграции создаются владельцем
  только внутри его tenant;
- существующие четыре клуба остаются одной текущей сетью и не смешиваются с
  tenant внешнего тестировщика.

Обычные приглашения пользователей существующего tenant не становятся
initial-owner delivery jobs и продолжают использовать свой действующий
контракт.

## 2. Закрытая по умолчанию граница

004J не включает и не разрешает:

- production SMTP credentials;
- production worker role или tenant enrollment;
- HTTP route для создания внешнего tenant или отправки приглашения;
- реальный email тестировщику;
- production deployment;
- решение `SHARED BETA GO`.

Worker является отдельным процессом. Он не импортируется в `AppModule`, не
работает как Nest scheduler и не использует общий `DATABASE_URL` или
fail-open настройки существующего `MailModule`.

## 3. Состояния outbox

Допустимый набор:

```text
HOLD
PENDING
CLAIMED
RETRY
SENT
DEAD
CANCELED
RECONCILIATION_REQUIRED
```

Миграция enum выполняется отдельно. Новые labels нельзя использовать в той же
PostgreSQL-транзакции, в которой они были добавлены.

| Переход | Кто и при каких условиях |
|---|---|
| `HOLD -> PENDING` | Только уже принятый activation coordinator `CURRENT_174` |
| `PENDING/RETRY -> CLAIMED` | Только enrolled worker, live invite, `FOR UPDATE SKIP LOCKED`, новый lease/CAS |
| `CLAIMED -> RETRY` | Только доказанная ошибка до provider marker и при наличии attempt budget |
| `CLAIMED -> DEAD` | Исчерпан budget до marker либо есть доказательство `definitive not sent` |
| `PENDING/RETRY/CLAIMED -> CANCELED` | Invite отозван/истек и provider marker отсутствует |
| `CLAIMED -> CLAIMED + provider marker` | Ciphertext удаляется атомарно до commit marker |
| `CLAIMED + marker -> SENT` | SMTP/provider подтвердил прием; сохраняются только bounded digests |
| `CLAIMED + marker -> RECONCILIATION_REQUIRED` | Timeout, reset, crash, истекший lease или неоднозначный результат |
| `RECONCILIATION_REQUIRED -> SENT/DEAD` | Только отдельная owner-only reconciliation ceremony |

`RECONCILIATION_REQUIRED -> RETRY` запрещен. Повторная отправка после
неоднозначного provider outcome требует отдельного reissue, нового invite и
нового outbox.

## 4. Secret lifetime

Raw invite token:

1. хранится только как AES-256-GCM envelope с AAD;
2. читается worker только через точный `SECURITY DEFINER` claim RPC;
3. расшифровывается только в памяти процесса;
4. включается только во fragment URL вида
   `https://<public-origin>/register#invite=<token>`;
5. не попадает в HTTP query, БД-события, логи, health, provider receipt или
   отчет;
6. ciphertext удаляется в той же транзакции, которая фиксирует
   provider-attempt marker, то есть до сетевого SMTP-вызова.

После committed provider marker автоматическая повторная отправка запрещена
даже если процесс завершился до фактического SMTP-вызова. Это сознательный
fail-closed выбор против двойной доставки.

## 5. PostgreSQL authority

Worker получает отдельный `LOGIN NOINHERIT NOBYPASSRLS` role и отдельный
`IDENTITY_MAIL_WORKER_DATABASE_URL`.

Worker role:

- не владеет объектами;
- не состоит в application/activation/installer roles;
- не имеет прямого table, column, sequence или type access;
- имеет `EXECUTE` только на точные claim/mark/complete/reap RPC;
- может обрабатывать только tenant, для которого существует активный
  DB-enrollment, связанный с точными `session_user` name и OID;
- не создается и не enroll-ится migration-скриптом.

Production enrollment registry изначально пуст. Env allowlist является
дополнительным ограничением, но не заменяет DB-enrollment.

Application runtime получает только PII-free assertion RPC для проверки
`SENT`. Mutation worker RPC и delivery tables ему недоступны.

## 6. Leases, CAS и provider marker

- Claim использует `FOR UPDATE SKIP LOCKED`.
- Каждый claim увеличивает `attempts`, `leaseVersion` и transition revision.
- Raw lease token не хранится: БД сохраняет только SHA-256 digest.
- Все последующие операции сверяют `outboxId`, `leaseVersion`,
  lease-owner digest и lease-token digest.
- Устаревший или чужой lease завершается deterministic conflict.
- Stable `Message-ID` строится из существующего `messageKey`; он является
  correlation key, но не считается provider idempotency guarantee.
- Reaper возвращает в `RETRY/DEAD/CANCELED` только unmarked claim.
- Marked claim при истечении acknowledge window переходит только в
  `RECONCILIATION_REQUIRED`.

Каждый переход создает append-only PII-free event. `UPDATE`, `DELETE` и
`TRUNCATE` event ledger запрещены.

## 7. SMTP и конфигурация

Все параметры обязательны при real-send и не имеют fallback на `MAIL_*`,
`WEB_URL` или общий `DATABASE_URL`:

```text
IDENTITY_MAIL_WORKER_ENABLED
IDENTITY_MAIL_WORKER_REAL_SEND_ENABLED
IDENTITY_MAIL_WORKER_LIVE_CANARY_ENABLED
IDENTITY_MAIL_WORKER_DATABASE_URL
IDENTITY_MAIL_WORKER_EXPECTED_DATABASE
IDENTITY_MAIL_WORKER_EXPECTED_ROLE
IDENTITY_MAIL_WORKER_CANARY_TENANT_IDS
IDENTITY_MAIL_WORKER_POLL_INTERVAL_MS
IDENTITY_MAIL_WORKER_LEASE_MS
IDENTITY_MAIL_WORKER_BATCH_SIZE
IDENTITY_MAIL_WORKER_MAX_ATTEMPTS
IDENTITY_MAIL_WORKER_BASE_RETRY_MS
IDENTITY_MAIL_WORKER_MAX_RETRY_MS
IDENTITY_MAIL_SMTP_HOST
IDENTITY_MAIL_SMTP_PORT
IDENTITY_MAIL_SMTP_TLS_MODE
IDENTITY_MAIL_SMTP_SERVERNAME
IDENTITY_MAIL_SMTP_USERNAME
IDENTITY_MAIL_SMTP_PASSWORD
IDENTITY_MAIL_SMTP_FROM
IDENTITY_MAIL_SMTP_MESSAGE_ID_DOMAIN
IDENTITY_MAIL_SMTP_CONNECTION_TIMEOUT_MS
IDENTITY_MAIL_SMTP_GREETING_TIMEOUT_MS
IDENTITY_MAIL_SMTP_SOCKET_TIMEOUT_MS
IDENTITY_MAIL_PUBLIC_WEB_ORIGIN
IDENTITY_MAIL_WORKER_HEALTH_HOST
IDENTITY_MAIL_WORKER_HEALTH_PORT
IDENTITY_MAIL_WORKER_RELEASE_SHA
IDENTITY_MAIL_WORKER_EXPECTED_MIGRATION
IDENTITY_MAIL_WORKER_EXPECTED_MIGRATION_COUNT
```

Real send требует одновременного точного `true` для трех enable flags,
непустой env canary allowlist и совпадающий активный DB-enrollment.

Worker не принимает произвольные параметры PostgreSQL URL:

- exact loopback использует только `127.0.0.1` либо `[::1]`,
  `schema=public`, `connect_timeout=5` и `socket_timeout=30`;
- remote endpoint дополнительно обязан иметь ровно `sslmode=require` и
  `sslaccept=strict`; `prefer`, `disable`, `verify-full`,
  `accept_invalid_certs`, дубликаты и дополнительные query options
  отклоняются до подключения;
- readiness проверяет TLS именно текущей backend-сессии через
  `pg_stat_ssl`; для remote обязательны `ssl=true`, version и cipher;
- worker role не может иметь effective `CREATE` или `TEMPORARY` на database,
  в том числе транзитивно через `PUBLIC` или membership.

Mail encryption key, percent-decoded worker DB password и SMTP password
обязаны быть попарно различными и не совпадать с независимыми секретами
основного приложения. Проверка выполняется до создания Prisma client, health
server и SMTP provider; reason/log не содержат секреты. Retry-настройки
ограничены DB-контрактом: `base <= 3600 s`, `max <= 86400 s`. Суммарное
минимальное SMTP acknowledge window обязано быть в диапазоне `10..900 s`.

SMTP:

- только verified STARTTLS или implicit TLS;
- `rejectUnauthorized=true`;
- minimum TLS 1.2;
- обязательный server name;
- запрещены file/URL access в шаблоне;
- bounded connection, greeting и socket timeouts;
- raw provider error/response не логируется.

Health слушает только `127.0.0.1` и публикует только bounded
`service/release/ok/reasonCode`, без tenant, email, очереди, токена или
конфигурации. При `SIGINT/SIGTERM` health синхронно становится
`503 / IDENTITY_MAIL_WORKER_STOPPING`: новые claim RPC больше не начинаются,
но уже полученный lease намеренно завершается как graceful drain. DB socket
timeout ограничивает ожидание зависшего in-flight запроса.

## 8. SENT barrier

Preview и acceptance initial `OWNER + NETWORK` invite при
`Tenant.onboardingStatus=OWNER_INVITED` разрешаются только если связанный
outbox:

- относится к тому же tenant/invite/token hash;
- имеет `status=SENT`;
- имеет committed provider marker и exact terminal event;
- имеет `secretCiphertext=NULL`;
- не отозван и не истек.

Preview вызывает PII-free assertion RPC. Acceptance повторяет assertion внутри
своей транзакции до создания `User`. Дополнительный PostgreSQL trigger не
разрешает `acceptedAt: NULL -> value`, если initial-owner outbox не `SENT`.

## 9. Текущий implementation candidate

Identity-mail checkpoint — immutable `CURRENT_176`; `CURRENT_178` является
промежуточным merged `origin/main` prerequisite, а текущий общий terminal
release candidate — `CURRENT_179` /
`20260731120000_identity_mail_delivery_release_head`:

- `CURRENT_175` содержит только additive enum expansion;
- `CURRENT_176` содержит delivery state machine, enrollment/event relations,
  worker RPC, application `SENT` assertion и acceptance trigger;
- `CURRENT_176` берёт `ACCESS EXCLUSIVE` lock и fail-closed отклоняет любой
  pre-existing outbox: старый ciphertext был создан с AAD schema v1 и должен
  быть безопасно перевыпущен, а не прочитан consumer v2;
- application runtime allowlist расширен до восьми RPC только за счёт
  PII-free assertion; шесть worker-only routines исключены;
- отдельный worker enrollment выдаёт ровно пять RPC и не создаёт роль или
  tenant enrollment;
- CLI worker не зарегистрирован в `AppModule`.

`identity_mail_outbox_delivery_guard_v1` обрабатывает database-owned insert
отдельно: разрешает только точный initial-owner `HOLD` и атомарно устанавливает
`updatedAt=createdAt`. Строгий `updatedAt >= createdAt` invariant поэтому
сохраняется и для прямого issue RPC, и для activation coordinator. SHA-256
миграции `CURRENT_176`:
`36e0c3b54a667ff613704e372daa6e2e7f4fd68df91cc15a7df5720740e929ce`.

Runtime/readiness/enrollment/CI требуют exact release head
`20260731120000_identity_mail_delivery_release_head`, count `179`. Terminal
migration имеет SHA-256
`c394060fbf979c567403976c8e906dc67b3bd840aea9fa9550e1d939d04af519`;
нормализованный manifest всех `179` migrations —
`3330185424ca669c18f39c2da5aa1e49f942500c0c85185c9125930e02df9431`.

Fail-closed preterminal contract использует отдельный canonical digest первых
`178` завершённых migrations:
`7f9867971a39e010b2dac03be18fc083dabe67b98d1d6ed15a0cc4540a8cfd14`.
Строки сортируются по `migration_name` в `C` collation, каждая кодируется как
`<migration_name> <checksum>\n`, весь UTF-8 payload хешируется SHA-256.
Terminal precondition вычисляет этот digest до изменения schema, а
`identity_mail_delivery_worker_assert_v1` повторяет проверку при каждом
readiness-вызове и возвращает exact поле `preterminalManifestDigest`.
Следовательно, изменение checksum любой migration `1..178` блокирует и
установку terminal head, и уже enrolled worker.

Release artifact обязан сохранять canonical LF bytes migration-файлов.
Прямой deploy из Windows checkout с CRLF намеренно не проходит exact checksum
boundary; PostgreSQL integration fixtures создают временный LF-normalized
artifact и удаляют его после проверки.
Historical structural и rollback assertions всё ещё отдельно проверяют
точную границу `CURRENT_176`; `CURRENT_177/178` проверяются как immutable
case-reward prerequisite, а worker matrix запускается только после terminal
`CURRENT_179`.

До подключения producer/admin route rolling deploy обязан получить явный
persisted AAD/envelope schema discriminator либо доказанный producer fence.
Текущий zero-row migration guard защищает upgrade, но сам по себе не
разрешает смешанную запись producer v1 после перехода consumer на AAD v2.

Финально локально подтверждено:

- clean PostgreSQL 16 deploy `179/179`;
- three-history PostgreSQL 16 rehearsal — `PASS`: identity branch проходит
  `174 → 175 → 176 → 177 → 178 → 179` с раздельными
  expand/synthetic-application/contract wave, актуальный `origin/main` получает `26`
  отсутствующих identity migrations перед terminal `179`, clean history
  разворачивается до exact `179/179`;
- terminal tamper matrix — `1/1/1/1/1`: fail-closed отклонены неверный
  checksum ранней pre-176 миграции, неверный checksum `CURRENT_176`, hostile
  worker `EXECUTE`, подмена owner и подмена тела worker assertion;
- post-terminal readiness заново проверяет canonical manifest digest `1..178`:
  ранний checksum drift получает `55000` без tenant state effects, после
  восстановления тот же enrollment возвращает `READY`;
- real PostgreSQL owner issue и shared activation на release head
  `CURRENT_179` — по `1/1 PASS`;
- worker PostgreSQL 16 + `LOGIN NOINHERIT` RPC-only role + trusted TLS fake
  SMTP acceptance — `1/1 PASS`; три независимых tenant-сценария завершаются
  как `SENT`, pre-provider `RETRY` и post-provider
  `RECONCILIATION_REQUIRED`;
- fake SMTP integration проверяет trusted TLS, stable Message-ID,
  fragment-only URL, untrusted CA, hostname mismatch и plaintext downgrade;
- worker enrollment smoke — `5` RPC, `9` denied, database
  `CREATE/TEMP=false`, schema `USAGE=1/CREATE=0`, direct
  relation/column/sequence privileges `0`, registry rows `0`, temp-table
  rejection `42501`;
- general runtime enrollment — `8` application RPC, denied
  worker/pending/admission/runtime-release RPC `6/13/9/20`, `14` sealed
  tables, `291` columns и `2` types закрыты для runtime/PUBLIC;
- delivery static `13/13`, worker enrollment `37/37`, runtime enrollment
  `16/16`, legacy identity inventory `20/20`, pending enum `3/3`;
- catalog inventory: relations `11/11`, columns `177/177` (identity
  `154/154`), constraints `83/83`, indexes `48/48`, functions `46/46`, enum
  labels `15/15`, triggers `9/9`, RI triggers `56/56`;
- API worker-focused `13 suites / 363 tests` и full
  `113 suites / 2394 passed / 2 todo`;
- merged gamification regression — `5 suites / 486 tests`;
- Prisma validate/generate, database/API typecheck, mandatory target lint,
  API build и `git diff --check`;
- web lint — `0 errors / 30 warnings`, web typecheck — pass; локальный web
  build заблокирован только DNS-доступом к `fonts.googleapis.com`, поэтому
  production build должен быть доказан exact-SHA GitHub CI;
- raw private-key headers — `0`: тестовый ключ хранится как PKCS#8 DER
  base64 и преобразуется в PEM только в памяти;
- cleanup residue three-history/tamper rehearsal — `0`; временные PostgreSQL
  databases/roles/sessions после cleanup — `0/0/0`;
- pre-merge независимый review — `P0=0, P1=0, P2=0`; merged re-review
  обнаружил scope-gap и docs drift, оба исправлены, финальный verdict ожидается.

Ранее найденные revoke/expiry/attempt-budget, ACL/readiness, SQL `NULL`,
missing-outbox, encryption-key binding, recipient-AAD и real-fixture gaps
закрыты и повторно проверены. До engineering acceptance остаются candidate
commit и exact-SHA CI `3/3 PASS`; локальный результат не разрешает deploy.

## 10. Обязательное evidence

Engineering acceptance требует:

- clean deploy `179/179`;
- identity-branch, актуальный `origin/main` и clean migration histories до
  terminal `CURRENT_179`, с отдельным intermediate-176 assertion и раздельной
  expand/application/contract wave;
- exact terminal migration/manifest SHA, canonical preterminal digest
  `7f9867971a39e010b2dac03be18fc083dabe67b98d1d6ed15a0cc4540a8cfd14`
  и tamper matrix `1/1/1/1/1`;
- enum migration isolation;
- concurrent worker claim с единственным winner;
- stale lease/CAS rejection;
- pre-marker retry и post-marker quarantine;
- ciphertext erase до SMTP;
- reaper, expiry, revoke и attempt-budget matrix;
- hostile app/worker/bystander/PUBLIC ACL matrix;
- two-tenant canary isolation;
- preview/accept deny для всех состояний кроме `SENT`;
- обычное member invite без регрессии;
- fake SMTP с trusted TLS;
- отказ при untrusted certificate, hostname mismatch и plaintext downgrade;
- stable Message-ID и fragment-only URL;
- automated secret/PII log scan;
- exact-SHA CI `3/3 PASS`;
- независимый review без P0/P1/P2.

Даже после engineering acceptance статус остается
`NOT_DEPLOYED / EXTERNAL_PILOT_NO-GO`, пока отдельно не завершены
production-like rehearsal, production root/role enrollment, SMTP operational
acceptance, deployment и launch decision.
