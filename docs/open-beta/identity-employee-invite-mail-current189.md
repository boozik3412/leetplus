# CURRENT189: приглашения сотрудников внешнего tenant

Статус: `ENGINEERING ACCEPTED FOUNDATION / NONCANONICAL / NOT DEPLOYABLE / ROUTE CLOSED`.

Дата фиксации: 05.08.2026.

CURRENT189 формирует отдельный безопасный контур, через который владелец внешнего
клуба или сети сможет приглашать своих сотрудников. Контур не создаёт пользователя
напрямую, не принимает временный пароль и не возвращает raw token, ссылку регистрации,
e-mail или ciphertext в HTTP-safe receipt.

Этот документ не разрешает production deployment, создание внешнего tenant,
регистрацию тестера или отправку почты. Production, текущая сеть из четырёх клубов и
данные внешнего тестера не изменялись.

## 1. Зафиксированный продуктовый поток

1. Первый владелец отдельной сети получает защищённое initial-owner приглашение и сам
   задаёт пароль.
2. После входа активный `NETWORK OWNER` с действующим `manage_users` создаёт
   mailbox-bound приглашения сотрудников только внутри своего tenant.
3. Приглашение содержит роль и либо весь контур сети (`NETWORK`), либо непустой набор
   активных клубов этого tenant (`STORES`). Роль `OWNER` через этот поток запрещена:
   для неё нужен отдельный owner-transfer workflow.
4. Raw token существует только внутри отдельного AES-256-GCM envelope и durable
   outbox. Клиент получает только идентификатор приглашения, статус доставки и срок
   действия.
5. Preview и accept разрешаются только после terminal `SENT`, при совпадении token
   hash, текущего `IdentityEmailClaim`, provenance issue command и активного tenant.
6. Reissue создаёт новый immutable invite, не расширяет прежний store scope, отзывает
   предыдущий invite и стирает его ciphertext. Revoke освобождает identity claim и
   закрывает доставку.

Прямой `POST /users` остаётся запрещённым для всех tenant. Ранее предложенный
временный пароль нигде не создаётся и не сохраняется: получатель приглашения
задаёт свой пароль самостоятельно.

## 2. Реализованная foundation

### Application-кандидаты

- отдельный `EmployeeInviteSecretEnvelope` с собственным AAD domain и шаблоном
  `EMPLOYEE_USER_INVITE`; initial-owner envelope не изменён;
- dormant/test-only `EmployeeInviteDeliveryCoordinator` для issue, reissue и revoke;
- fresh `NETWORK OWNER` recheck, `manage_users`, exact tenant/slug/zero-store binding,
  delegation по роли/custom role/store и fail-closed production discriminator;
- отдельный `PrismaEmployeeInviteDeliveryDriver` с `READ COMMITTED`, tenant-first
  advisory lock, statement/lock timeout и exact CURRENT189 RPC;
- dormant preview/accept `EmployeeInviteDeliveryGateCandidate`, который принимает
  только точный boolean `SENT` от CURRENT189 RPC;
- dormant `EmployeeInviteMailWorkerCurrent189` и отдельный
  `StrictEmployeeInviteMailProviderCurrent189`: worker использует exact
  claim/mark/complete/reap receipts, общий tenant lock и свежий `READ COMMITTED`
  snapshot, а provider принимает только namespace
  `<employee-invite-...@domain>` и не расширяет initial-owner SMTP provider;
- provider mark и terminal complete имеют bounded byte-equivalent replay после
  потерянного DB response; после durable marker повторный SMTP send запрещён,
  ambiguous outcome переводится в `RECONCILIATION_REQUIRED`;
- local control реализует `ACTIVE/DRAINING/KILLED`: `DRAINING` оставляет только
  DB reaper, `KILLED` не начинает новую работу, а подтверждённый provider accept
  всё равно получает terminal completion;
- dormant process boundary добавляет bounded `1..100` run loop, обработку
  `SIGINT/SIGTERM` как `ACTIVE -> DRAINING`, отдельный emergency `KILLED` seam,
  zero-inflight barrier перед `provider.close()` и exactly-once close;
- strict runtime parser принимает только `isolated-test`, точный
  `NOT_DEPLOYABLE` candidate и три согласованных activation flags. Он использует
  отдельные employee SMTP/envelope/database domains, HMAC/HKDF-bound provider
  authority, exact database identity/TLS options и отклоняет reuse initial-owner,
  JWT и application secrets;
- loopback-only `/health` и `/ready` возвращают только release SHA, mode,
  readiness/liveness, bounded inflight и completed cycle count. Tenant, mailbox,
  token, URL, ciphertext и provider credentials в health state отсутствуют;
- ciphertext зануляется в `finally`; ответы и детерминированные ошибки не содержат
  e-mail, token, URL или provider secret;
- ни coordinator, ни acceptance gate, ни employee worker/provider/runtime не
  зарегистрированы в Nest modules, route, CLI, scheduler, package startup или
  production process.

Legacy `cancelInvite` дополнительно закрыт для внешнего tenant тем же verified-delivery
барьером, что create/update. Guard выполняется до `UserInvite.findFirst`, identity
assert/release и транзакции, поэтому будущий CURRENT189 outbox нельзя отменить через
старый DELETE path.

### PostgreSQL migration candidate

Candidate:
`20260805030000_identity_employee_invite_mail_boundary_current189`.

Contract: `IDENTITY_EMPLOYEE_INVITE_CURRENT189_V1`.

Migration SHA-256:
`4bbf4d49847b82731aa2e235796b4b1a898914768c1f4f4e2cb7a8b084e5c751`.

Созданы отдельные NONCANONICAL relations:

- `IdentityEmployeeInviteIssueCommandV1`;
- `IdentityEmployeeMailOutboxV1`;
- `IdentityEmployeeInviteRevokeCommandV1`;
- `IdentityEmployeeMailDeliveryEventV1`;
- `IdentityEmployeeMailTenantEnrollmentV1`.

Для всех пяти relations включены `ENABLE/FORCE ROW LEVEL SECURITY`; tenant связывается
transaction-local GUC. PUBLIC/table/function grants отсутствуют, в конце candidate
выполняется явный `REVOKE ALL`.

Issue/reissue/revoke используют общий lock domain
`leetplus:identity-mail-tenant:v1:<tenantId>` с seed `180`, а затем canonical e-mail
lock. DB повторно проверяет:

- tenant `ACTIVE`, customer stage `PILOT/BETA/LIVE`, onboarding
  `ONBOARDING/READY/ACTIVE` и действующий trial;
- текущий `USERS_ROLES` entitlement с read/write;
- активного неплатформенного `NETWORK OWNER` без store links;
- effective `manage_users`: при наличии `UserRoleOverride(OWNER)` capability обязана
  присутствовать в persisted permissions;
- роль, custom role и каждый активный store внутри того же tenant.

Unkeyed `SHA256(canonical email)` и колонка `recipientDigest` намеренно удалены.
Mailbox сверяется непосредственно с защищённым `UserInvite` внутри
`SECURITY DEFINER`; PII не выходит в receipt, audit event или application result.

### Идемпотентность между процессами

Ключ команды — `tenantId + actorUserId + requestId`. Новый процесс неизбежно создаёт
другие UUID, raw token, token hash и ciphertext. Повтор не сравнивает это новое
случайное secret material с сохранённым.

Вместо этого SQL проверяет тот же semantic `requestDigest`, operation, previous invite,
canonical mailbox, full name, role/custom role, scope/stores и expiry, после чего
возвращает persisted command/invite/outbox receipt. Сохранённый `UserInvite.tokenHash`
при этом обязан совпадать с сохранённой provenance-командой. Изменённый digest или
mailbox отклоняется как replay mismatch.

Таким образом поддержаны оба случая:

- потерян ответ БД внутри одного coordinator — повторяется byte-identical input;
- клиент/процесс повторил тот же request после commit — новый token/cipher/UUID
  уничтожаются, а наружу возвращается исходный persisted receipt.

### Provider state machine

Отдельные CURRENT189 RPC реализуют:

- tenant-enrolled claim через exact `session_user + role OID + provider authority
digest` и `FOR UPDATE SKIP LOCKED`;
- `ACTIVE/DRAINING`: DRAINING запрещает новый claim;
- provider mark с replay-safe marker и обязательным стиранием ciphertext до SMTP
  attempt;
- terminal complete `SENT`, pre-provider `RETRY/DEAD` и post-provider ambiguity
  `RECONCILIATION_REQUIRED`;
- bounded reaper `1..100`;
- replay provider mark/complete после потерянного DB response.

DB foundation теперь имеет отдельный dormant application adapter, строгий
employee-only SMTP transport boundary и неактивируемый импортом process/runtime
boundary. Runtime role/grants, attestation, реальные SMTP credentials/endpoint,
Nest/package startup и production activation не подключены.

### Freshness and terminal replay invariants

- Every CURRENT189 mutation first acquires the common tenant advisory lock.
  Authority rows are then locked in deterministic order. The command clock is
  sampled only after the complete relevant row-lock chain, including the
  mailbox lock for preview/accept. A decision therefore cannot reuse time from
  before an advisory, Tenant, entitlement, User, invite, custom-role or Store
  lock wait.
- `terminalAckDigest` is durable terminal evidence. Exact lost-response replay
  of `SENT` requires the same provider receipt and terminal acknowledgement;
  exact replay of provider-ambiguous `RECONCILIATION_REQUIRED` requires the
  same terminal acknowledgement. Changed acknowledgements fail closed.
- The SENT acceptance assertion binds the delivery event request digest to the
  persisted lease version, provider receipt and terminal acknowledgement. At
  acceptance time it also rechecks that the custom role still belongs to the
  tenant and that every delegated Store still exists, is active and belongs to
  that tenant.
- `outboxStatus=PENDING` in an issue replay is deliberately the immutable
  original command receipt, not a live status projection. A separately
  authorized projection must be used for current delivery state.

## 3. Принятое evidence

- API application/worker/runtime: `12 suites / 142 tests PASS`: прежние
  `6 suites / 83 tests` для envelope,
  coordinator, acceptance gate и legacy cancel guard плюс `3 suites / 30 tests`
  для отдельного provider/repository/worker adapter и `3 suites / 29 tests` для
  strict config, PII-free health/readiness и process signal boundary;
- worker evidence покрывает happy path, exact lost-response replay provider mark
  и complete, ambiguous SMTP без blind resend, ACTIVE/DRAINING/KILLED boundaries,
  bounded CANCELED scan, cross-tenant/extended receipt reject, buffer zeroization
  и отсутствие mailbox/token/SMTP secret в logs/results;
- runtime evidence покрывает signal-before-claim, SIGTERM after durable mark,
  SIGTERM after provider acceptance, emergency kill after mark, bounded empty
  loop, failure cleanup, zero-inflight close и provider close exactly once;
- отдельная employee-envelope конфигурация требует собственный exact 32-byte
  key/version/AAD без fallback и отклоняет reuse initial-owner/JWT/app/
  integration/fingerprint secrets; отдельный employee mail template использует
  только fragment URL `/register#invite=...`, deterministic message id и не
  раскрывает роль, scope или Store assignment;
- API production typecheck: `PASS`;
- targeted ESLint для новых/изменённых файлов: `PASS` с `--max-warnings 0`;
- static database foundation: `10/10 PASS`;
- свежий PostgreSQL 16 clone от canonical CURRENT179: migration apply `PASS`;
- PostgreSQL smoke: `BEGIN / DO / ROLLBACK`, `PASS`, без fixture residue.
- independent-client PostgreSQL acceptance: `2/2 PASS`; it proves semantic
  replay after a committed-but-lost response, fresh `ACTIVE/DRAINING` state,
  fresh invite expiry after a non-empty advisory wait, and fresh trial time
  after an observed real `Tenant FOR UPDATE` row-lock wait;
- dormant Nest HTTP candidate: `15/15 PASS`; Web BFF candidate: `8/8 PASS`.
  Оба кандидата fail-closed, не зарегистрированы в runtime и описаны в
  [employee-invite-current189-http-bff-candidate.md](employee-invite-current189-http-bff-candidate.md).
  Web evidence рекурсивно подтверждает отсутствие импорта кандидата во всех
  активных `apps/web/src/app/**/route.ts`, а API evidence запрещает регистрацию
  candidate controller, пока его три route-декоратора пересекаются с legacy
  `UsersController`.

PG smoke проверяет persisted OWNER override deny/allow, semantic replay с другим
token hash/ciphertext/UUID, reject изменённого digest/mailbox, issue/reissue/revoke,
identity claim release, provider mark/complete replay, pending/SENT/revoked acceptance
gate, ambiguous outcome, retry с сохранённым зашифрованным payload и DRAINING fence.

## 4. Что остаётся до открытия тестового доступа

CURRENT189 нельзя подключать к route частично. Для перевода `users/roles` из BLOCKED
в verified необходимо последовательно закрыть:

1. Разрешить predecessor chain и канонизировать migration только через отдельный
   apply/rollback/zero-diff rehearsal. Сейчас metadata остаётся
   `authorization=false`, `productionApplyAuthorized=false`.
2. Создать отдельные least-privilege application и employee-worker роли, exact
   function grants, name/OID enrollment и подписанную runtime attestation. Table grants
   не выдавать.
3. После принятия runtime role/grants вынести уже реализованный strict parser и
   health/process boundary в отдельно ревьюируемый executable artifact. Сейчас
   импорт не регистрирует signal handler, timer, Nest provider или startup;
   initial-owner key уже запрещён как fallback/reuse.
4. После runtime role/grants и conditional startup gate пройти production-like
   acceptance с отдельными реальными employee SMTP credentials/endpoint. Dormant
   adapter уже покрывает lost mark/complete response, drain, kill, retry,
   reconciliation, bounded scan и PII-free results на strict fake transport.
5. Подключить coordinator атомарно ко всем трём внешним операциям:
   `POST /users/invites`, reissue и `DELETE /users/invites/:id`. Candidate
   controller должен заменить либо делегировать legacy handlers одним release;
   exact no-duplicate AST gate обязан доказать отсутствие двух controller для
   одного method/path. Legacy raw
   `registrationUrl` допустим только в изолированном INTERNAL режиме и не должен
   появляться в external response/UI.
6. Подключить `EmployeeInviteDeliveryGate` к обоим auth paths: public preview и
   повторной проверке внутри acceptance transaction. До этого employee invite нельзя
   принимать даже при наличии `UserInvite`.
7. Обновить UI: idempotency `requestId`, статус доставки, reissue/revoke и отсутствие
   кнопки копирования raw invite URL.
8. Пройти cross-tenant PostgreSQL A/A1/A2 ↔ B/B1 acceptance, HTTP route manifest,
   browser flow и production-like canary rehearsal.
9. Только после GO создать отдельный `Tenant B/Store B1`, отправить initial-owner
   mailbox invite реальному тестеру и дать владельцу самостоятельно настроить клуб,
   роли и сотрудников.

До выполнения всех пунктов route/module остаются закрытыми, production не изменяется,
а создание тестовой учётной записи или временного пароля запрещено.

## 5. Команды воспроизведения

```powershell
pnpm --filter api test -- --runInBand src/users/users.access-scope.spec.ts src/users/employee-invite-secret-envelope.spec.ts src/users/employee-invite-delivery-coordinator.spec.ts src/auth/employee-invite-delivery-gate.candidate.spec.ts
pnpm --filter api test:ci:employee-invite-worker-current189
pnpm --filter api test:ci:employee-invite-runtime-current189
pnpm --filter api test:ci:employee-invite-current189-http-candidate
pnpm --filter web test:employee-invite-current189-bff-candidate
pnpm --filter api typecheck
pnpm --filter web typecheck
pnpm --filter api exec eslint --max-warnings 0 src/users/employee-invite-secret-envelope.ts src/users/employee-invite-secret-envelope.spec.ts src/users/employee-invite-delivery-coordinator.ts src/users/employee-invite-delivery-coordinator.spec.ts src/auth/employee-invite-delivery-gate.candidate.ts src/auth/employee-invite-delivery-gate.candidate.spec.ts src/users/users.service.ts src/users/users.access-scope.spec.ts
pnpm --filter api lint:ci:employee-invite-worker-current189
pnpm --filter api lint:ci:employee-invite-runtime-current189
pnpm --filter api lint:ci:employee-invite-current189-http-candidate
node --test packages/database/scripts/identity-employee-invite-mail-current189-foundation.test.mjs
pnpm --filter api exec jest --config ./test/jest-pg-integration.json --ci --runInBand --runTestsByPath test/identity-employee-invite-current189.pg.integration-spec.ts
```

PostgreSQL smoke запускается только в disposable clone после применения migration
candidate и всегда завершает fixture-транзакцию `ROLLBACK`.
