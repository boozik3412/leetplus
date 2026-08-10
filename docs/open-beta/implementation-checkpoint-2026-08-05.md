# Open beta implementation checkpoint — 05.08.2026

## Решение на момент checkpoint

`SHARED BETA: NO-GO`.

Этот статус означает, что инженерные кандидаты разрешено проверять только в
локальных/CI disposable-средах. Он не разрешает production deployment,
production root enrollment, создание внешнего tenant, учётной записи тестера
или отправку initial OWNER invite.

Неизменные факты:

- production остаётся на `CURRENT179/179`;
- четыре действующих клуба остаются четырьмя `Store A1..A4` одной сети
  `Tenant A`; split или перенос данных не выполнялся;
- внешний design partner всегда должен получить отдельный логический
  `Tenant B/Store B1` в общем data plane;
- контакт внешнего тестера хранится только вне git и не добавлен ни в
  `Tenant A`, ни в production;
- предложенный ранее временный пароль не создавался и не сохранялся: первый
  OWNER должен сам задать пароль через mailbox-bound activation;
- production, SMTP, Telegram delivery и unattended Langame sync не включались.

## Реализовано и принято локально

### CURRENT186: database duty-role boundary

- Candidate охватывает application/coordinator/worker разделение, exact
  role-name/OID binding, tenant-first lock order, fresh-state transitions,
  rollback, emergency containment, lost-response recovery и runtime
  attestation v2.
- Epoch appender переведён на `SECURITY INVOKER`: APPLY вызывает его через
  transaction-local schema-owner role, rollback/emergency — от database owner.
  Coordinator/worker не получили дополнительных полномочий.
- Predecessor CURRENT180–185 gates, foundation `15/15`, catalog `24/24`,
  deployment `48/48`, runtime attestation `16/16` и lint — `PASS`.
- Два последовательных полных PostgreSQL 16 acceptance run: `28/28` за
  `325.812 s` и `28/28` за `320.49 s`; residue до, между и после прогонов —
  `0 databases / 0 roles / 0 sessions`.
- Финальные pins: definition
  `2ac0ff62303d899a70b7600749fcd895f184523ef9dc9fc74d9b60a44eca9109`,
  migration
  `7a1a0453b883d6bbf8640eff8c39b007376286b0f21d31f766771fead65a93dd`,
  186-row manifest
  `3bbf04f88643d94076be96c3ae714c441454e6a7fcd6107af5bd194dca579ed6`.
- Статус: `ENGINEERING ACCEPTED / NONCANONICAL / NOT DEPLOYABLE`.

### CURRENT187 A–H: cluster/application admission foundation

- A: три независимых Ed25519 purpose domain, exact canonical shapes,
  frozen-empty production roots и synthetic loopback test roots — `13/13 PASS`.
- B: pure exhaustive cluster planner, unknown/missing/unread/partial/OID drift
  deny и PII-free deny-only receipt — `15/15 PASS`.
- C: bounded read-only acquisition через отдельный LOGIN в каждую connectable
  non-template БД, два `pg_database` snapshot и 24 catalog surface, включая
  all-grantee ACL, ownership, default ACL, RLS/policies и definitions —
  `12/12 PASS`.
- D: отдельная Ed25519 DDL-fence authority связывает exact acquisition,
  universe/final snapshots, fence и release policy — `11/11 PASS`.
- E: append-only consumption/revocation ledger с byte-exact lost-response
  replay, раздельными execute-only consumer/revoker roles, FORCE RLS и
  root→envelope→attestation→operation→nonce lock-chain — общий static/unit
  gate `25/25 PASS`; PostgreSQL hostile acceptance `1/1 PASS`. После
  независимого review expiry перенесён на fresh clock после всей lock-chain;
  отдельный fixture доказывает reject команды, истёкшей во время ожидания,
  и нулевой residue. SQL SHA-256:
  `dd5f4db5aecef2c537251bc5262063c1012a1383aec0d0137e7d8b9536f8bb63`.
- Disposable PostgreSQL 16 two-database acceptance C повторно принят:
  `1/1 PASS`; residue database/role/session — `0/0/0`.
- F: stable role/current-ACL/default-ACL/catalog fingerprints связаны с exact
  purpose-bound deployment envelope; exact-SHA CI `31391874407` — `3/3 PASS`.
- G: pure secret-free semantic risk-facts extractor валидирует 12 exact
  catalog surfaces и считает privileged role attributes, LOGIN, memberships,
  settings, ownership, current/default ACL, `PUBLIC`/grantable grants и
  effective privileges. Per-database digest агрегируется в
  `clusterCatalogDigest`; focused checkpoint `7/7 PASS`, exact-SHA CI
  `31397844858` на `3804792e…` — `3/3 PASS`.
- H: четвёртый independent Ed25519 purpose подписывает exact secret-free
  semantic allowlist document; branded evaluator связывает cluster/universe,
  review evidence и CURRENT187-G facts, а F требует exact matched H receipt.
  Authority `13/13`, acquisition/risk/allowlist/policy `24/24`, DDL fence
  `11/11`, полный disposable rehearsal `163/163`. Статус до exact-SHA CI:
  `IMPLEMENTED LOCALLY / DENY-ONLY / PRE-GREEN / NOT DEPLOYABLE`; все
  authority/effect/test-access flags остаются false.
- Все receipts по-прежнему deny-only. Host-side fence executor,
  HBA/TLS/pooler/service-account evidence, production roots и hostile
  concurrent multi-DB matrix ещё не закрыты.

### Protected initial OWNER application coordinator

- Реализован dormant/test-only coordinator поверх shell provisioning с exact
  persisted GO identifiers, tenant/slug locks, fresh re-read, bounded
  `SERIALIZABLE` transaction и ciphertext zeroing.
- Production discriminator отклоняется, activation HTTP route остаётся
  unconditional `503`, runtime DI/enrollment отсутствуют.
- Focused evidence: `38/38 PASS`; это не готовый delivery path.

### CURRENT188: staged Langame onboarding

- `NETWORK`-only preview выполняет ровно один bounded read-only `/clubs/list`
  запрос на allowlisted Langame domain с timeout `5s`; до authority проверки
  tenant/DB/provider I/O отсутствуют.
- Реализован digest/HMAC-bound encrypted staged receipt с exact
  tenant/store/domain/club confirmation, global external-club claim,
  one-time activation replay и owner-only expiry, который стирает ciphertext.
- Реализован activation adapter к sealed CURRENT188 RPC: он повторно требует
  fresh `NETWORK`, нормализует точный Store/domain/club, сам вычисляет
  HMAC-binding и activation request digest, принимает только exact allowlisted
  receipt и поддерживает byte-equivalent replay. Adapter имеет отдельный
  default-off flag и безусловно отклоняет production environment.
- Staging/activation не выполняют HTTP sync и не включают unattended jobs.
- Candidate остаётся `NONCANONICAL / NOT_DEPLOYABLE`, без PUBLIC/application
  grants; production activation route остаётся `503`, локальный adapter не
  является разрешением deployment или sync.
- Foundation: `6/6 PASS`; targeted API: `180/180 PASS`; disposable PG16 smoke
  с replay/cross-tenant/cross-club/stale/expiry/lost-response cases — `PASS`.
- Dormant Web BFF candidate поддерживает только реально существующие
  `onboarding/preview` и `onboarding/activate`, берёт JWT только из HttpOnly
  cookie, ограничивает JSON 8 KiB и проецирует exact safe receipts. Candidate
  `12/12 PASS`, не импортирован активными routes. Кандидат принимает исходный
  same-origin `Request`, exact POST URL без query/hash и bounded 8 KiB stream;
  ACTIVATE response связан с request `receiptId` и exact Nest `201`. Status,
  reconcile и initial
  read-only sync зафиксированы как отсутствующие API contracts; generic sync
  не используется как подмена.

### CURRENT189: tenant-owned employee invitations

- Отдельный mailbox-bound employee invite contract покрывает issue, semantic
  replay, reissue, revoke, delivery claim/mark/terminal completion и
  acceptance gate без возврата raw token/URL tenant actor.
- Все mutation используют единый tenant lock; command time снимается после
  полной relevant row-lock chain. `terminalAckDigest` обязателен для exact
  `SENT`/`RECONCILIATION_REQUIRED` lost-response replay, а acceptance повторно
  проверяет custom role и активные Store своего tenant.
- Frozen SQL SHA-256:
  `4bbf4d49847b82731aa2e235796b4b1a898914768c1f4f4e2cb7a8b084e5c751`.
  Отдельные employee envelope config и mail template запрещают reuse
  initial-owner/application secrets и сохраняют token только во fragment URL.
  Dormant employee-only provider/repository/worker adapter добавляет exact
  mark/complete lost-response replay, no-resend reconciliation, bounded scan,
  `ACTIVE/DRAINING/KILLED` и buffer zeroization без Nest/CLI/startup wiring.
  Отдельный dormant runtime boundary добавляет strict employee-only
  SMTP/envelope/provider-authority config, PII-free loopback health/readiness,
  bounded run loop, graceful `SIGTERM -> DRAINING`, emergency `KILLED` и
  zero-inflight/provider-close-exactly-once semantics без startup activation.
  Static `10/10`, application/worker/runtime API `12 suites / 142 tests`,
  lint/typecheck и независимый
  fresh PostgreSQL 16 apply/smoke/race `2/2` прошли; disposable DB удалена.
- Dormant Nest HTTP candidate фиксирует exact `POST/PATCH/DELETE /users/invites`,
  обязательное равенство `Idempotency-Key == body.requestId`, 8 KiB body и
  private receipts; он отсутствует во всех modules. Dormant Web candidate
  добавляет cookie-only bearer, same-origin, bounded streaming и exact
  issue/reissue/revoke response binding без email/token/URL/ciphertext.
  Focused controller `15/15`, Web `8/8`, ESLint и API/Web typecheck прошли;
  legacy routes и Gate 1MT остаются `BLOCKED`.
  Candidate и legacy controller имеют три одинаковые route decorator; module
  registration запрещена до атомарного replace/delegate и no-duplicate AST
  cutover gate.
- Candidate остаётся `NONCANONICAL / NOT_DEPLOYABLE`: runtime grants/attestation,
  real SMTP credentials, executable/module startup, routes, production и внешний
  tester не активировались.

### CURRENT190: persisted public guest sessions

- Candidate вводит persisted `sid/ver/jti`, tenant/store/profile/guest binding,
  fresh six-entitlement admission, atomic rotation/revoke и tenant-scoped media
  assertion. JWT больше не требует `phoneHash` или другого стабильного
  phone-derived outward correlator.
- Central strict validation закрывает SQL `NULL`/malformed bypass; rotation
  требует одинаковую live phone-binding, audit FK tenant-aware, terminal revoke
  работает даже при suspended/inactive/disabled state и не оживает после
  reactivation.
- Frozen SQL SHA-256:
  `d23c0e8fbdfddd0eb9ec7a73d877e7bbcde8c170683247a66f43530cca3867d5`.
  Static `11/11`, persisted session + Platform Admin revoke orchestration
  `3 suites / 36 tests`, PostgreSQL lock/fence `7/7`, zero `40P01`/deadlock и
  zero residue приняты.
- Separate sealed tenant-wide administrative revoke-all теперь ставит
  persistent fence, выполняет bounded `1..500` batches, пишет PII-free
  audit-complete receipts и допускает только exact replay. Issue/rotation до
  fence завершаются и затем отзываются; ожидающие после fence получают `42501`.
- Dormant Platform Admin revoke-all coordinator реализован с fresh-authority
  re-attestation, deterministic HMAC-bound batches, strict cumulative receipt
  validation и одним bounded lost-response replay. У него нет decorator,
  controller, CLI или module registration.
- Candidate HTTP controller теперь фиксирует persisted
  `POST /guest-portal/session/logout` со стабильным `Idempotency-Key` и
  bearer-bound `GET /guest-portal/session/media/:id` с tenant/id/size/signature
  validation и private/no-store `StreamableFile`. AST gate доказывает отсутствие
  регистрации во всех Nest modules; runtime routes остаются закрыты.
- Canonical migration/runtime grants и production-like rehearsal обязательны
  до promotion; legacy ID-only public media остаётся активным legacy boundary
  и явно `BLOCKED` до атомарного cutover.
- Отдельная dormant application policy инвентаризирует все 30 controller
  handlers: `READ=2`, `WRITE=10`, `OUTBOUND=9`, `PUBLIC_BOOTSTRAP=9`.
  Unknown/outbound/bootstrap и persisted rotation fail-closed; policy не
  зарегистрирована в production controller/module. Unit + AST policy gate:
  `2 suites / 41 tests`; dormant application/controller/media gate:
  `3 suites / 32 tests`. Logout и protected media реализованы только как
  unregistered candidates и остаются promotion blockers.
- Web BFF cutover также подготовлен только как dormant pure candidate:
  persisted logout требует exact idempotency key и удаляет HttpOnly cookie
  только после `REVOKED`; media/error bodies bounded, signature/private headers
  проверяются. Candidate `6/6`, BFF inventory `4/4`, cookie transport `2/2` и
  Web typecheck зелёные; active Route Handler candidate не импортирует.

### CURRENT180–190 release composition admission

- Новый read-only detector закрепляет canonical CURRENT179/179, полные
  metadata/SQL SHA всех 11 candidates, семь CURRENT187 tooling SHA и шесть
  предыдущих foundation gates. Candidate-set digest:
  `1623309f985a40d933b3d52cbfd98ba3bf9438350c0f59f9a21b4c0c0524e3f4`.
- Disposable rehearsal корректно остановлен до database connection: Prisma
  lexical order ставит CURRENT187 после CURRENT190; CURRENT180–185 и CURRENT187
  имеют несовместимые DB-name guards; CURRENT187–190 содержат unresolved
  predecessors; required contracts CURRENT187/188 не материализованы; duty-role
  name/OID не привязаны; прежние foundation inventories отвергают новый set.
- Detector `13/13 PASS`, включён в CI и не содержит deploy/database/provider
  clients. Он не меняет canonical migrations, roles/grants, routes, production,
  текущие клубы или tester.
- Следующий read-only planner принят `18/18 PASS`: schema lane теперь имеет
  порядок CURRENT180→190 с новым reserved CURRENT187 admission anchor, а
  CURRENT187-E закреплён только как auxiliary synthetic evidence и никогда не
  входит в Prisma chain. Default/reviewed plan digests
  `d0ebbcbc…/fb258265…`; все authorization/effects остаются false.
- Planner дополнительно требует, чтобы будущий anchor SQL сам явно содержал
  новый `IDENTITY_MAIL_CLUSTER_APPLICATION_ADMISSION_CURRENT187_V1` и исходный
  verifier `CURRENT187_CLUSTER_APPLICATION_ADMISSION_V1`; запись в
  `_prisma_migrations`, dynamic SQL и migrate-resolve spoof запрещены. Exact
  reviewed anchor SHA входит в plan digest; arbitrary reader/root разрешены
  только test-only entrypoint с unverified external effects. Сам planner не
  принимает manifest/assembler и запрещает прямое копирование candidates.
- Proposal-only CURRENT187 anchor и immutable refreeze manifest теперь
  реализованы вне `migration-candidates`/canonical Prisma chain. Anchor SQL
  `dee4995d…` выполняет только exact CURRENT186 read-only check и `ROLLBACK`;
  manifest `184d1cfb…` закрепляет raw bytes десяти schema migrations, отдельный
  CURRENT187-E auxiliary lane и reviewed plan `fb258265…`. Verifier `17/17`
  повторно доказывает `ASSEMBLY_FORBIDDEN`; `.gitattributes` фиксирует LF для
  raw-hashed candidate/proposal text при Windows `core.autocrlf=true`.

### Gate 1MT HTTP inventory

- Зафиксированы все `294` handler согласованного pilot scope.
- Текущий статический срез: `240` проходят, `54` явно `BLOCKED`;
  все `21` outbound handler остаются `BLOCKED/OFF`.
- Разбивка: gamification `77/117`, assortment `57/66`, staff `83/84`,
  communications `18/18`, users/roles `5/9`.
- Единый fresh DB-backed `allowedStoreIds` resolver принят для 26 assortment
  reads. Ещё 31 NETWORK-only assortment mutation требует fresh DB NETWORK
  assertion и имеют exact route-to-service binding test.
- Update/archive клуба требуют fresh NETWORK; обычный store create внешнего
  tenant runtime-закрыт до отдельного provisioning/quota workflow. Все
  assortment outbound остаются OFF.
- Exact CURRENT179 PostgreSQL A/A1/A2 ↔ B/B1 assortment fixture принят:
  `1 suite / 3 tests PASS`, включая store lifecycle и external-create deny;
  финальный residue `0 tenants / 0 users`.
- Exact CURRENT179 PostgreSQL team-chat fixture принят отдельно:
  `1 suite / 3 tests PASS` для report/SSE, create/update/read-receipt,
  cross-store/cross-tenant IDOR и stale JWT; финальный residue
  `0 tenants / 0 users / 0 fixture messages`.
- Staff-контур расширен до `83/84`: 55 legacy routes и 5 salary routes имеют
  exact route-to-`FreshNetworkScopeGuard` boundary; прежние 23 STAFF и 10
  COMMUNICATIONS routes дополнительно re-attest `NETWORK/STORES` через fresh
  DB guard. Scheduled `1` и store-scoped доступ к NETWORK-only routes остаются
  закрытыми. Team chat дополнительно перечитывает persisted tenant/store scope
  внутри service для всех 7 user paths до Prisma; report/SSE explicit Store
  проверяется по fresh authority. Объединённый focused gate:
  `15 suites / 154 tests PASS`; lint и production typecheck — `PASS`.
- Ровно 8 CRM contact-task handlers переведены в `COMMUNICATIONS`: GET требует
  `view_communications`, POST/PATCH — `manage_communications`, а entitlement
  HTTP policy совпадает с manifest. Из-за отсутствия store binding они
  намеренно NETWORK-only и каждый имеет fresh DB guard; broad CRM/leads не
  открыт. Tenant-bound selector/target/update denial покрыт отдельным gate
  `6 suites / 162 tests PASS`; outbound не открывался.
- Exact CURRENT179 CRM communications PostgreSQL fixture принята отдельно:
  `1 suite / 4 tests PASS`. Реальные `FreshNetworkScopeGuard` и
  `GuestsService` проверяют все восемь service paths для A/A1/A2↔B/B1,
  tenant-isolated task/report/export/user/event reads, create/update,
  cross-tenant guest/task denial, полный STORES deny и stale
  `NETWORK -> STORES` deny до side effects. Финальный residue:
  `0 tenants / 0 users / 0 fixture tasks / 0 fixture events`.
- Внутренний gamification кабинет временно доступен только fresh NETWORK
  subject; STORES, public guest journey, Telegram/outbound и scheduled jobs
  остаются заблокированы. Далее нужны STORES staff/communications и расширение
  PostgreSQL A/A1/A2 ↔ B/B1 fixtures на остальные pilot surfaces.
- Web BFF inventory отдельно закрепляет `130` защищённых route-файлов / `158`
  handlers пилотных модулей и supporting integrations. Каждый handler обязан
  использовать authenticated proxy либо явный cookie-to-Bearer admission;
  защищённый upstream не может использовать public/force cache. Для всего
  `/api/:path*` добавлен defensive private/no-store policy. Focused BFF gate:
  `4/4 PASS`. Legacy public media и mixed guest-portal catch-all остаются
  явно видимыми public boundaries и не считаются принятыми до CURRENT190 wiring.
- Guest auth/select response теперь не раскрывает JWT в browser-readable JSON:
  BFF удаляет top-level `token`, переносит его только в `HttpOnly`,
  `SameSite=Lax`, production-`Secure` cookie с max-age один час и возвращает
  private/no-store response. Telegram club-select продолжает по cookie и
  повторному summary. Focused transport gate `2/2 PASS`; server-side logout
  revoke и tenant-scoped media остаются открыты до CURRENT190 application wiring.
- Web production build больше не скачивает Geist/Geist Mono с Google во время
  сборки: root layout использует локальный системный sans/mono stack. Статический
  reproducibility gate `1/1`, focused lint, web typecheck и полный Next.js build
  с CI-подобным `NEXT_PUBLIC_API_URL` проходят; собраны все `205` страниц.

### Provider lost-response engineering acceptance

- Добавлен deterministic harness, соединяющий actual worker service, dormant
  CURRENT184 v2 adapter и strict SMTP provider.
- Потеря ответа моделируется после durable transaction callback/commit boundary
  отдельно для provider marker и completion; exact replay сохраняет один SMTP
  invocation и один terminal transition.
- Ambiguous SMTP outcome переводится в reconciliation и не вызывает blind retry
  в следующем cycle.
- Приняты safe-boundary injections: before/after claim, after marker, during
  SMTP, after acceptance и during completion; global graceful drain и
  per-tenant `ACTIVE -> DRAINING -> KILLED` изолированы.
- Локальный ciphertext buffer зануляется, persisted ciphertext после marker и
  process-local inflight/transactions после terminal outcome равны нулю; evidence
  не содержит recipient, raw token или SMTP password.
- CURRENT184 обычный `assertReady()` теперь всегда завершает вызов
  `*_CANDIDATE_NOT_DEPLOYABLE`; test-only wrapper использует отдельную
  diagnostic readiness. CLI, production и SMTP wiring не менялись.
- Статус только `ENGINEERING_ACCEPTED / DORMANT / NOT DEPLOYED`. Обычный SMTP
  гарантирует at-most-one invocation, но не exactly-once delivery после
  неоднозначного server `250`; для этого нужен provider idempotency/status API.
- Новый focused CI gate выполнен дважды подряд: `5 suites / 101 tests PASS` в
  каждом прогоне; полный identity-mail gate — `15 suites / 452 tests PASS`;
  typecheck, worker/PG-seam lint и CURRENT184 static foundation `26/26` зелёные.

### CURRENT180–190 refreeze и in-memory assembly

- Proposal-only CURRENT187 anchor, immutable refreeze manifest и exact
  CURRENT180–190 schema lane прошли independent latest-byte review:
  P0/P1/P2 = `0`. CURRENT187-E остаётся в отдельном auxiliary lane и
  не входит в Prisma history.
- V2 assembler собирает только immutable in-memory artifact из
  `schema.prisma`, migration lock и exact 190 migrations. Он не умеет
  писать в filesystem, запускать процесс, подключаться к БД/сети
  или выдавать production/deploy authority.
- Закреплены exact plan digest `426a73b1…`, 192-entry digest
  `c32c9720…`, artifact envelope `8750ebd4…` и 190-migration manifest
  `61c9de5a…`. Caller-owned Proxy/accessor отклоняются без вызова.
- Focused assembler gate: `21/21 PASS`; общий blocker/planner/refreeze/
  assembler gate: `69/69 PASS`. Package script и CI step подключены.
- Read-only local PostgreSQL preflight подтвердил PostgreSQL `16.14`,
  exact `179/179`, head `20260731120000_identity_mail_delivery_release_head`,
  manifest `33301854…`, ноль unfinished/rolled-back rows, tenants, users,
  enrollments и claimed outbox. Database owner совпадает с owners
  обязательных relations и `identity_email_claim_lock_v1`; посторонних
  source sessions нет.
- На этом checkpoint эти доказательства ещё не разрешали DB apply. Требуемый
  `DISPOSABLE_POSTGRESQL_REHEARSAL_ONLY` contract и reviewed lifecycle runner
  теперь приняты в отдельном актуальном разделе ниже; production authority это
  по-прежнему не выдаёт.

## Что ещё обязательно до первого внешнего клуба

Порядок нельзя переставлять или обходить ручным созданием пользователя:

1. Довести CURRENT187 до Engineering Green: принять CURRENT187-H exact-SHA CI,
   добавить persisted semantic-approval consumption/revocation/expiry/replay,
   host-side DDL fence executor, HBA/TLS/pooler probes, signed baseline/policy
   ledger, hostile multi-DB race matrix и independent review.
2. Перенести локально принятый provider recovery в канонический release и
   production-like restored-snapshot PG rehearsal; добавить DB aggregate
   zero-inflight/zero-secret-bearing finalize barrier, signed runtime kill state
   и process-level SIGTERM/SIGKILL recovery acceptance.
3. Завершить production role/OID enrollment и attestation для application,
   activation coordinator, enrollment coordinator, worker v2 и reconcile
   operator с exact grants и zero table DML там, где положено.
4. Закрыть Gate 1MT для всего согласованного модуля: gamification,
   assortment/products, staff целиком, communications, users/roles и
   supporting integrations; пройти A/A1..A4 ↔ B/B1 IDOR matrix для API, BFF,
   files, exports, jobs, SSE, Telegram и browser journeys.
5. Consolidate schema lane CURRENT180–190 в один reviewed canonical release,
   сохранив CURRENT187-E только в отдельном auxiliary evidence lane; выполнить
   production-like backup/restore, apply, lost-response replay, rollback,
   emergency и exact zero-diff rehearsal на staging clone.
6. После отдельных `PRODUCTION ROOT ENROLLMENT GO` и `PRODUCTION DEPLOY GO`
   выполнить controlled production migration/canary и readiness/monitoring
   acceptance. Эти решения сами по себе ещё не разрешают tester access.
7. Перевести существующие четыре клуба in-place как один `Tenant A/A1..A4`,
   закрыть anonymous demo surfaces и выдержать минимум семь стабильных суток
   internal alpha без stop condition.
8. Принять отдельный signed/persisted `SHARED BETA GO`.
9. Только после GO штатный protected workflow создаёт отдельный
   `Tenant B/Store B1`, отправляет mailbox-bound `OWNER + NETWORK` invite,
   OWNER задаёт собственный пароль, выбирает только свой Langame club и
   проходит day-0 smoke. Второй внешний tenant ждёт D1/D7 review первого.

## Критерий «можно выдавать тестовый доступ»

Доступ готов не тогда, когда можно вручную вставить `User`, а когда одновременно
доказаны четыре свойства:

1. отдельный tenant создаётся и активируется атомарно, повторяемо и без
   попадания в текущую сеть;
2. OWNER и созданные им пользователи технически не могут выйти за tenant/store
   scope ни через UI/API, ни через background/Telegram path;
3. Langame credential и выбранный внешний club нельзя прочитать, повторно
   привязать к другой сети или использовать для автоматического write-back;
4. delivery, rollback, emergency stop, audit и support готовы до отправки
   приглашения, а не достраиваются после него.

Плановый ориентир первой friendly external cohort остаётся
`31.08–07.09.2026` только при закрытии всех gates без stop condition. Это
условное окно, а не обещанная дата.

## Дополнение 07.08.2026: fail-closed CURRENT180–190 runner

Отдельный локальный execution foundation для exact release
`CURRENT180..CURRENT190` принят на disposable PostgreSQL; production и tenant
data он не меняет.

- Базовая immutable цепочка повторно зелёная: blocker `13/13`, planner `18/18`,
  refreeze `17/17`, assembler `21/21`, итого `69/69`.
- Planning state-machine проходит `33/33`.
- Полный SQL semantic fingerprint проходит `26/26`: кроме schema/data/sequence
  учитываются column ACL, trigger enablement, inheritance/partitions,
  sequence ownership/dependencies, materialized-view population,
  `pg_db_role_setting`, cluster-global role attributes/password-verifier hashes,
  role memberships, `indisreplident`/`indisclustered` и domain constraints.
- Новый persistent Ed25519 coordinator отделён от ephemeral journal signer.
  Coordinator проходит `6/6`, journal — `24/24`; scoped adversarial review
  P0/P1=`0`: attacker-generated origin substitution, temp/repository keys,
  same-inode key drift и POSIX private-key permissions fail-closed.
- Operator keygen и runner CLI проходят `6/6`; CLI принимает только exact
  loopback profile, attempts `1/2`, explicit coordinator paths/public SHA и
  полную confirmation phrase. Приватные bytes и source URL в diagnostic не
  выводятся.
- Materializer проходит `24/24`: все path reads descriptor-bounded, exact
  tree/bytes/inode provenance связан с coordinator-signed recovery locator;
  partial cleanup и lost unlink/rmdir responses восстанавливаются fail-closed.
- Runtime adapter проходит `27/27`: pinned Node/Prisma/schema inode, isolated
  child environment с canonical verified Windows system root, source
  `READ ONLY`, session-scoped advisory lock, generic prior-run ownership-marker
  admission, exact-owned cleanup и hard quarantine после непроверенного child exit.
- Runner проходит текущую fake-runtime matrix `14/14`: journal intent до effect,
  bounded lost-response reconciliation, exact lock-receipt identity, source и
  target semantic fingerprints, repeat deploy/zero-diff, rollback/drop и
  fail-closed janitor с signed source-zero-diff phase gate.
- CI получил отдельный последовательный gate; финальный локальный gate выполнил
  `163` test executions без ошибок. LF закреплён для всех rehearsal `.mjs`,
  чтобы byte evidence не зависело от Windows checkout conversion.

Coordinator-signed materializer/journal discovery и rehydration, fresh one-shot
whole-tree execution-byte binding, public-only restart verifier и lost-response
reconciliation при advisory unlock завершены. Crash inspector выполняет
filesystem cleanup только после exhaustive доказательства `TARGET_ABSENT`; при
exact-owned, foreign или ambiguous target сохраняет evidence и не восстанавливает
DB mutation authority. Renamed current/prior-run DB обнаруживается по exact
ownership marker; filesystem evidence удаляется только после fresh equality с
подписанным `SOURCE_ZERO_DIFF_VERIFIED` fingerprint.

Локальный source preflight на PostgreSQL `16.13` по `127.0.0.1:55432` повторно подтвердил
`179` finished migrations, head
`20260731120000_identity_mail_delivery_release_head`, `0` unfinished,
`0` rolled back и отсутствие `lp_c180190_*`/`lp_imtec_*` databases. После него
приняты два новых независимых цикла:

- attempt 1: run token `05c5990b42918ec8e9d7fb26ad44089c`, runner receipt
  `49f22f51e8bb72d716e50381dbbd52b08005c2525d7ea7ce2efe08cca2573d07`;
- attempt 2: run token `c5a0bc6fc2f2ede68d4326c7fd2b6be2`, runner receipt
  `fd142b051b7eea56ff2683259adff14fb77c858d4d03ae964c95e85655119aee`.

Оба завершились `DISPOSABLE_POSTGRESQL_REHEARSAL_COMPLETED_ZERO_DIFF_ZERO_RESIDUE`,
дали один source fingerprint
`03e04ef19ad731c5eb4f66977a4572db4da655278b84dce00d7565075bb7357b`,
подтвердили отсутствие target DB, artifact root и journal root. Восемь старых
pre-coordinator root от 06.08 сохранены как legacy evidence и не считались
принадлежащими новым runs. Отдельный postflight подтвердил cluster residue `0`,
source `179/0`; пустой обычный Prisma `jiti` cache в task temp оставлен, потому
что host safety guard запретил нерекурсивное удаление. Он не является signed
artifact/journal residue. Финальный независимый latest-byte аудит: `P0=0`,
`P1=0`.

Это закрывает локальный disposable rehearsal, но не является production
deployment authority и не разрешает внешний tester invite. Следующий P0 — exact
candidate SHA/artifact, canonical promotion, runtime roles/grants/attestation и
signed restored-copy production-like rehearsal.
