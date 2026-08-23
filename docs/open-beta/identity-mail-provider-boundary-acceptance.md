# Identity mail provider boundary acceptance

Статус:
`ENGINEERING_ACCEPTED (DORMANT DETERMINISTIC HARNESS) / NOT DEPLOYED / SHARED BETA NO-GO`.

Документ фиксирует обязательный шлюз между защищённым initial-OWNER workflow,
PostgreSQL outbox и SMTP-провайдером. Он не разрешает отправку приглашений,
production wiring worker v2, enrollment production-root или создание внешнего
tenant.

## 1. Инвариант доставки

Для одного `outboxId + leaseVersion + providerAttemptKey` допустим не более чем
один вызов SMTP boundary в одном durable attempt. Порядок необратим:

1. worker получает tenant-bound lease;
2. PostgreSQL атомарно сохраняет provider marker и стирает persisted
   `secretCiphertext`;
3. только после подтверждённого `MARKED` выполняется SMTP `send`;
4. подтверждённая приёмка провайдером завершается replay-safe `SENT`;
5. любой неизвестный результат после входа в provider boundary запрещает blind
   retry и переводит delivery в `RECONCILIATION_REQUIRED` либо оставляет её для
   консервативного reaper/reconcile.

Получатель, raw invite token, ciphertext, SMTP password и provider response не
могут попадать в worker result, structured log или persisted diagnostic receipt.

Это гарантия `at-most-one SMTP invocation per durable attempt`, а не
`exactly-once email delivery`. После передачи SMTP `DATA` сервер мог принять
письмо, а клиент — потерять ответ `250`; обычный SMTP и стабильный `Message-ID`
не предоставляют idempotency/status-lookup contract. Такой исход всегда
считается неоднозначным и требует reconcile. Истинный exactly-once возможен
только с provider API, поддерживающим idempotency key либо status lookup.

## 2. Уже реализованные барьеры

- `identity_initial_owner_mail_provider_mark_v2` и
  `identity_initial_owner_mail_complete_v2` принимают exact tenant/lease/provider
  identity и возвращают byte-equivalent durable replay для совпадающего
  запроса;
- конфликтующий replay отклоняется, а непереиспользуемый marker возвращает
  явный `HANDOFF`;
- application adapter повторяет неизвестный DB response ровно один раз тем же
  SQL и теми же значениями, затем возвращает typed ambiguity;
- SMTP вызывается только после `MARKED`; `CANCELED` и `HANDOFF` не вызывают
  provider;
- неизвестный SMTP outcome и неизвестный `SENT` acknowledgement не запускают
  повторную SMTP-отправку;
- после каждого claim локальный ciphertext зануляется в `finally`;
- per-tenant admission проверяется в БД на каждом cycle/claim/settlement через
  enrollment state, state revision, provider authority и tenant-first lock;
- process-wide запуск требует тройного explicit enable, точного canary allowlist,
  pinned database/role/migration/release и строгого SMTP/TLS config;
- graceful drain допускает завершение уже выданного lease, но запрещает новые
  claims; emergency containment снимает runtime authority и требует отдельного
  zero-inflight barrier.
- обычный `assertReady()` dormant CURRENT184 adapter после проверки
  диагностического receipt всегда завершает вызов ошибкой
  `IDENTITY_MAIL_WORKER_V2_CANDIDATE_NOT_DEPLOYABLE`; `authorization=false` и
  `canSend=false` больше нельзя случайно интерпретировать как рабочее разрешение;
- отдельный `assertDiagnosticReady()` используется только test-wrapper'ом
  acceptance harness. Candidate по-прежнему не импортируется CLI/Nest DI и не
  имеет production config switch.

## 3. Принятое локальное evidence

На checkpoint 05.08.2026 принят единый deterministic harness
`identity-mail-provider-lost-response.acceptance.spec.ts`, который соединяет:

- реальный `IdentityMailWorkerService`;
- реальный dormant `PrismaIdentityMailWorkerV2CandidateRepository` через
  test-only diagnostic admission wrapper;
- реальный `StrictIdentityMailSmtpProvider` с deterministic transport;
- transaction fixture, который сначала сохраняет durable mutation, завершает
  callback, а затем теряет response на внешней границе `$transaction`. Это
  моделирует `COMMIT -> connection response lost`, а не rollback/error до commit.

Harness доказывает:

- один lost response на `provider_mark_v2` приводит к exact второму SQL/value
  replay и затем ровно к одному `sendMail`;
- один lost response на `complete_v2` приводит к exact replay completion, но не
  к повторному `sendMail`;
- provider-mark и completion имеют по два byte-equivalent request, один durable
  transition и terminal `SENT`;
- transport error после имитированной provider acceptance даёт
  `RECONCILIATION_REQUIRED`, останавливает цикл и при следующем cycle не вызывает
  SMTP повторно;
- emergency kill инъецируется в `before claim`, `after claim`, `after marker`,
  `during SMTP`, `after provider acceptance` и `during completion`;
- до provider marker kill даёт terminal `DEAD` без SMTP; после marker, но до
  SMTP — `RECONCILIATION_REQUIRED` без SMTP; после входа в SMTP подтверждённая
  acceptance обязательно завершается `SENT`, потому что отменить уже начатую
  отправку безопасно невозможно;
- global graceful drain завершает ровно уже выданный lease и не берёт следующий;
  global kill до cycle даёт zero DB/SMTP calls;
- per-tenant `ACTIVE -> DRAINING -> KILLED` не блокирует ACTIVE tenant:
  `DRAINING` допускает только DB reaper, `KILLED` — ни readiness, ни reap, ни
  claim, тогда как другой tenant продолжает работу;
- после terminal/reconciliation сценариев: process-local inflight `0`, открытых
  transaction `0`, persisted ciphertext после marker `0`, reusable retry `0`,
  локальный 71-byte ciphertext buffer заполнен нулями;
- evidence/result/log не содержат recipient, raw token и SMTP password; после
  `close + disconnect` transport закрыт, claim bindings очищены и session fixture
  показывает `0`.

Дополнительное compositional evidence остаётся действующим:

- CURRENT184 foundation содержит replay provenance, exact partial uniqueness и
  reject-матрицу для ослабления ACTIVE/DRAINING authority;
- disposable PostgreSQL fixture доказывает равенство повторного provider marker
  и completion receipt, конфликтующий replay, `HANDOFF` и tenant-bound
  least-privilege execution.

Focused gate:

```text
pnpm --filter api test:ci:identity-mail-provider-boundary
pnpm --filter api lint:ci:identity-mail-worker
pnpm --filter api typecheck
```

Локально focused gate выполнен два раза подряд: каждый прогон
`5 suites / 101 tests PASS`. Полный identity-mail worker gate после изменений:
`15 suites / 452 tests PASS`; API typecheck, worker lint, PostgreSQL-seam lint и
CURRENT184 static foundation `26/26` — `PASS`.

## 4. Разница между graceful drain и emergency stop

`SIGINT/SIGTERM` существующего CLI остаётся graceful process stop: readiness
немедленно снимается, новые reap/claim не начинаются, а уже возвращённый lease
заканчивает marker/SMTP/settlement. Этот legacy path и его тесты не изменены.

Dormant control-path вводит монотонные режимы:

- `ACTIVE` — readiness, SMTP verify, reap и claim;
- `DRAINING` — только DB reaper, без новых claims и новых SMTP boundary;
- `KILLED` — новая работа для tenant полностью запрещена.

Emergency kill не может безопасно прервать уже начатый SMTP call. До marker он
закрывает lease как permanent pre-provider `DEAD`; после marker до SMTP переводит
его в reconciliation; во время/после SMTP worker обязан дождаться результата и
выполнить terminal completion либо quarantine. Физический `SIGKILL` такой
гарантии не даёт и остаётся recovery/reaper сценарием будущего process-level
acceptance.

## 5. Что ещё обязательно до promotion и tester invite

Локальный work item `PROVIDER-LOST-RESPONSE` закрыт как engineering acceptance,
но не как production acceptance. Ещё обязательны:

1. Канонический объединённый release вместо stacked CURRENT180–CURRENT188.
2. Production-like restored-snapshot PostgreSQL rehearsal для полного
   lost-response/reconcile/reaper пути, apply/rollback и zero-diff.
3. DB-enforced aggregate barrier под tenant lock: zero unmarked claims, zero
   marked claims, zero secret-bearing rows и zero reusable pending/retry до
   окончательного tenant disable/finalize.
4. Signed runtime binding exact role/OID, release marker, migration digest,
   provider authority, canary tenant set и kill-switch state. Production roots
   до отдельного enrollment остаются пустыми.
5. Process-level shutdown coordinator: tracked in-flight promise/counter,
   bounded grace timeout, awaited SMTP close/DB disconnect, SIGTERM child-process
   test и отдельный SIGKILL recovery test.
6. Gate 1MT, Gate 2 на `Tenant A/A1..A4`, стабильный internal alpha и отдельный
   persisted `SHARED BETA GO`.

Термин `zero-secret` в этом checkpoint означает zero persisted secret-bearing
row после marker, zero mutable ciphertext bytes после обработки и zero disclosure
в evidence/logs. Он не означает недоказуемое стирание immutable JS strings из
heap; raw token/message lifetime нужно дополнительно сокращать либо изолировать
sender в короткоживущем процессе, если потребуется строгая memory-erasure модель.

## 6. Решение

Два последовательных focused запуска должны оставаться зелёными. Их receipt
намеренно содержит `testAccessAuthorized=false/sharedBetaAccess=false`.

Даже этот статус отдельно не разрешает production deployment или tester invite:
после него остаются Gate 1MT, canonical promotion, production-like rehearsal,
Gate 2 на `Tenant A/A1..A4` и отдельный persisted `SHARED BETA GO`.
