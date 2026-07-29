# INVITE_SECRET_TRANSPORT_V1

| Поле             | Значение                                                       |
| ---------------- | -------------------------------------------------------------- |
| Версия           | 1.2                                                            |
| Дата             | 29.07.2026                                                     |
| Статус           | `ACCEPTED_ENGINEERING_CHECKPOINT`; exact-head CI/review приняты |
| Schema target    | `CURRENT_170` candidate; locator CI/review ещё не приняты       |
| Release decision | `NO-GO` для external tenant, initial OWNER invite и production |

Этот checkpoint изолирует bearer-secret приглашения от HTTP path и query.
Он закрывает только transport implementation. Он не реализует mailbox
delivery, identity outbox, initial OWNER issue/activation, persisted
`SHARED BETA GO` или право создать учётную запись тестера. Activation locator
реализован отдельно только как локально проверенный schema/application
candidate; он не меняет принятый transport checkpoint и не открывает routes.

## 1. Канонический контракт

Invite token — результат `randomBytes(32).toString("base64url")`: ровно
43 символа из алфавита `[A-Za-z0-9_-]`.

Единственная каноническая ссылка:

```text
https://leetplus.ru/register#invite=<43-char-base64url-token>
```

В production вместо literal origin используется проверенный HTTPS `WEB_URL`.
Между ссылкой из письма и финальным `/register` не допускаются redirect,
link shortener или tracking wrapper.

Fragment не входит в HTTP request target и не передаётся браузером как
`Referer`. На `/register` client gate:

1. один раз читает только exact `#invite=<token>`;
2. синхронно очищает fragment и любой query через
   `history.replaceState(..., "/register")`;
3. только после успешного scrub проверяет текущую сессию;
4. хранит token только в памяти React до preview/accept;
5. очищает его после успешного accept или перед redirect authenticated user.

Ref сохраняет первый capture при повторном вызове effect в React Strict Mode.
Token не записывается в cookie, `localStorage`, `sessionStorage` или server
props. Reload после scrub намеренно теряет token. Отсутствующий, query-based,
дублированный, декодированный или неканонический token даёт fail-closed экран
без fallback.

## 2. Fixed-POST transport

Browser обращается только к same-origin BFF:

```http
POST /api/auth/invites/preview
Content-Type: application/json

{"token":"<token>"}
```

```http
POST /api/auth/invites/accept
Content-Type: application/json

{"token":"<token>","email":"...","fullName":"...","password":"...","confirmPassword":"..."}
```

BFF вызывает только фиксированные API routes:

```text
POST /auth/invites/preview
POST /auth/invites/accept
```

Legacy API/BFF routes с token в path удалены. `GET` preview отсутствует.
Query transport и compatibility fallback отсутствуют.

## 3. Security boundary

BFF до upstream dispatch:

- требует exact JSON media type;
- требует same-origin `Origin`; при наличии `Sec-Fetch-Site` принимает только
  `same-origin`;
- использует `Host` как основную authority boundary, а forwarded host —
  только если `Host` отсутствует;
- ограничивает body до `4096` UTF-8 bytes;
- принимает только allowlisted поля отдельно для preview и accept;
- проверяет canonical 43-character token;
- не строит upstream URL из token и не возвращает token в error body.

API:

- применяет route-scoped streaming JSON parser limit `4 KiB` до controller;
- преобразует expected malformed/oversized parser errors в generic
  `400/413/415` без отражения body и без передачи в общий exception logger;
- принимает invite request только как `application/json`;
- проверяет canonical token до Prisma lookup и hash;
- возвращает единый `INVITE_TOKEN_INVALID` для malformed token;
- не содержит token path parameter;
- отвечает с `Cache-Control: private, no-store`, `Pragma: no-cache`,
  `Referrer-Policy: no-referrer` и `X-Content-Type-Options: nosniff`.

Страница `/register` получает `no-store`, `no-referrer`, `nosniff`,
clickjacking deny и базовый CSP. Текущий CSP ещё не является nonce-based
`script-src` policy; это отдельный production acceptance gate.

## 4. Явный остаточный INTERNAL-контур

Generic invite create/reissue для `customerStage=INTERNAL` по-прежнему
возвращает `registrationUrl` авторизованному tenant actor, а management UI
может показать или скопировать его. URL теперь fragment-only, но response всё
равно раскрывает raw bearer-secret доверенному actor. API и BFF ответы этой
compatibility lane теперь явно `private, no-store`.

Это временная compatibility lane текущей сети, а не verified delivery:

- любой non-`INTERNAL` generic invite issue/reissue остаётся fail-closed;
- initial OWNER shared-beta workflow эту lane не использует;
- обе shared-beta admin route остаются `503`;
- новый external tenant, `User`, `UserInvite`, пароль или письмо не создаются.

Остаток закрывается только encrypted outbox и доставкой непосредственно на
bound mailbox без возврата raw URL Platform Admin или tenant actor.

## 5. Existing invite и rollout

Legacy query-link нельзя автоматически преобразовать: `UserInvite` хранит
только `tokenHash`, из которого raw token не восстанавливается. До deployment
обязательны:

1. aggregate inventory всех live invites и сроков без выгрузки raw identity;
2. поиск historical proxy/APM access logs с token-bearing path/query;
3. revoke всех потенциально раскрытых или несовместимых invites;
4. reissue только через принятый delivery workflow;
5. коммуникация получателям, что старые ссылки более недействительны.

Включать query fallback ради совместимости запрещено. Client scrub не
исправляет уже состоявшуюся утечку: старый `/register?invite=...` отправляет
query в первом HTTP request до запуска React. Production access/error/APM
logging для `/register` обязан постоянно omit/redact query string, а
token-bearing legacy path patterns — raw request target, включая все будущие
переходы по старым ссылкам.

## 6. Не входит в checkpoint

Не реализованы:

- sealed issue-by-locator, который создаёт initial OWNER invite;
- encrypted leased `IdentityMailOutbox`;
- verified SMTP/provider delivery, resend и delivery reconciliation;
- protected initial OWNER issue/reissue/revoke/resend;
- persisted release-gate/admission decision и trial activation;
- session revoke, password reset и полный B2B auth hardening;
- production deployment и создание тестовой учётной записи.

Email verification (`confirm-email`) использует отдельный legacy token flow и
не входит в `INVITE_SECRET_TRANSPORT_V1`.

### MIGRATION_170_ACTIVATION_LOCATOR

Migration `20260729233000_identity_activation_locator` реализована как
`CURRENT_170` candidate. Она добавляет в `IdentityEmailClaim` immutable opaque
UUID `workflowLocator`: для initial OWNER он равен server-generated
reservation UUID и не меняется при transition `INVITE → USER`.

Новый sealed
`identity_email_claim_assert_invite_locator_v1(locator, tenant, subject,
revision)`:

- находит только exact `INVITE` claim без передачи raw e-mail caller'ом;
- соблюдает порядок
  `bounded lookup → canonical e-mail advisory lock → SELECT ... FOR UPDATE`;
- после lock повторно проверяет tenant/type/subject/revision;
- возвращает exact PII-free receipt без email, HMAC, token, URL или ciphertext;
- не даёт runtime table/column `SELECT` на `IdentityEmailClaim`.

Application allowlist кандидата содержит семь RPC: две guest-game, четыре
прежние identity writer RPC и locator assert. Shell replay использует
persisted `ownerIdentity.reservationId`, но locator остаётся только correlation
key, не authority и не заменяет persisted GO.

Migration не создаёт `UserInvite`, token, outbox, trial или письмо и не
включает admin route. Локальный PostgreSQL 16 upgrade/ACL/concurrency evidence
получен, но exact committed SHA, CI, independent review и новый release-bound
inventory ещё не приняты. Поэтому принятые `CURRENT_169` artifact/admission
evidence сохраняются только как historical prerequisite и должны быть заново
собраны для `CURRENT_170`. Полный контракт:
[identity activation locator](./identity-activation-locator.md).

## 7. Production acceptance

До deploy оператор обязан подтвердить:

- direct HTTPS final-origin link, HSTS и отсутствие redirect/shortener/tracker;
- proxy перезаписывает `Host`/forwarded headers, ограничивает vhost и invite
  request body; direct API не получает обходной публичный route;
- proxy, WAF, APM, error tracker и request tracing не пишут invite body;
- access/error/APM logs постоянно omit/redact query для `/register` и raw
  request target token-bearing legacy paths; client scrub не считается этим
  контролем;
- старые token-path/query access logs найдены, защищены и обработаны по
  incident/revoke процедуре;
- на `/register` отсутствуют analytics, session replay и third-party scripts;
  принят nonce/hash-based CSP или документирован эквивалентный контроль;
- synthetic canary token не обнаруживается в access/application/audit/APM
  logs, metrics labels, traces, browser storage и error responses;
- Gmail, Outlook, Telegram desktop/mobile, iOS/Android и copy/paste сохраняют
  fragment до финального origin;
- browser E2E проверяет valid, malformed, query-only, reload-after-scrub,
  authenticated-session, expired/revoked token и successful accept;
- rate limit и bounded proxy/body/parser limits действуют на обе fixed POST
  route.

## 8. Evidence engineering checkpoint

Локально на 29.07.2026:

- focused API: `4 suites / 68 passed`;
- dedicated fixed-route/body-limit e2e: `1 suite / 6 passed`;
- full API regression: `101 suites / 1958 passed / 2 todo`;
- web fragment/parser/request-boundary/projection runtime: `7/7 passed`;
- API production build: `PASS`;
- web typecheck: `PASS`;
- web lint: `0 errors`, baseline `30 warnings`;
- web production build with CI `NEXT_PUBLIC_API_URL`: `PASS`;
- manual browser smoke: fragment очищается до preview, query игнорируется,
  reload после scrub fail-closed, valid preview не оставляет hash.

Implementation exact-head
`f09383563bbcc22e11e0e67ca597360cf8996f4b` принят GitHub CI
[`30488598755`](https://github.com/boozik3412/leetplus/actions/runs/30488598755)
(`run #43`), `3/3 PASS`: Application `90700487213`, PostgreSQL 16
`90700487216`, Authority root `90700487264`. Финальный independent review —
`PASS` без actionable P0/P1/P2.

Этот engineering checkpoint не является production-like admission, не
разрешает deployment, initial OWNER invite или внешний pilot и не меняет
общий `NO-GO`.
