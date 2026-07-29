# INVITE_SECRET_TRANSPORT_V1

| Поле             | Значение                                                       |
| ---------------- | -------------------------------------------------------------- |
| Версия           | 1.0                                                            |
| Дата             | 29.07.2026                                                     |
| Статус           | `IMPLEMENTED_CANDIDATE`; exact-head CI/review ещё pending       |
| Schema target    | `CURRENT_169`; migration и runtime RPC allowlist не изменялись |
| Release decision | `NO-GO` для external tenant, initial OWNER invite и production |

Этот checkpoint изолирует bearer-secret приглашения от HTTP path и query.
Он закрывает только transport implementation. Он не реализует mailbox
delivery, identity outbox, activation locator, initial OWNER activation,
persisted `SHARED BETA GO` или право создать учётную запись тестера.

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

- privacy-safe activation locator;
- encrypted leased `IdentityMailOutbox`;
- verified SMTP/provider delivery, resend и delivery reconciliation;
- protected initial OWNER issue/reissue/revoke/resend;
- persisted release-gate/admission decision и trial activation;
- session revoke, password reset и полный B2B auth hardening;
- production deployment и создание тестовой учётной записи.

Email verification (`confirm-email`) использует отдельный legacy token flow и
не входит в `INVITE_SECRET_TRANSPORT_V1`.

### MIGRATION_170_ACTIVATION_LOCATOR

Решение о migration `170` ещё не принято. Schema-neutral locator сейчас
невозможен без ослабления границы:

- `IdentityEmailClaim` адресуется по `emailCanonical`;
- shell сохраняет reservation UUID/HMAC evidence, но не raw email;
- все текущие sealed identity RPC требуют raw email;
- runtime имеет zero table `SELECT` на `IdentityEmailClaim`.

Full-table или column-wide runtime `SELECT` fallback запрещён. Если будет
принят новый sealed locator/outbox primitive, schema target станет
`CURRENT_170`, а inventory, release artifact и admission evidence
`CURRENT_169` должны быть заново собраны и привязаны к новому exact head.

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

## 8. Evidence кандидата

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

Full regression/build, independent review, exact commit SHA и GitHub CI
фиксируются отдельно до перевода backlog item в `Готово`. Эти evidence не
являются production-like admission и не меняют общий `NO-GO`.
