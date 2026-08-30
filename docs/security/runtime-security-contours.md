# Runtime и security-контуры LeetPlus

Статус: **канонический current-state contract**

Актуально на: **30.08.2026**
Runtime implementation baseline:
`d8c97649d155f1fc9994ea12b80ab2b3f54285b3` (PR #87; включает отдельный
bonus-ledger worker поверх production repair USER_CALL, inline loot-box open,
exact CURRENT188 attachment-helper enrollment и guest Battle Pass/store-scope
repair)

Этот документ обязателен перед изменениями авторизации, post-login routing,
access scope, публичного игрового входа, управления геймификацией, интеграций,
background jobs и production deployment. Его цель — не дать строгому
fail-closed правилу одного контура снова сломать другой контур.

## Текущее состояние

| Область                  | Состояние                                                                                                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime implementation   | Dedicated bonus-ledger worker слит PR [#87](https://github.com/boozik3412/leetplus/pull/87), merge SHA `d8c97649d155f1fc9994ea12b80ab2b3f54285b3`                                  |
| Admission merge SHA      | [Fast CI](https://github.com/boozik3412/leetplus/actions/runs/33305732947) и [Full Release Admission](https://github.com/boozik3412/leetplus/actions/runs/33305732938) — `SUCCESS` |
| Production API topology  | active green exact `d8c97649…`, generation 14, `COMBINED`, schema `CURRENT_188`, bridge `OFF`, reporting `LIVE`; hot rollback blue `6ec3a5f1…`, оба slot active                    |
| Split-runtime deployment | `DORMANT / NOT INSTALLED`; нужен отдельный production GO                                                                                                                           |
| Corporate landing        | role-aware successor входит в active `6ec3a5f1…`; real-account canary остаётся отдельной проверкой                                                                                 |
| Внешний open beta        | `NO-GO` до оставшихся Gate 1MT/2 и controlled production rollout                                                                                                                   |

Слияние в `main`, наличие собранных `corporate-main.js`/`guest-main.js` или
зелёный CI не доказывают production deployment. Фактический production runtime,
env, systemd, nginx и database roles проверяются отдельно.

## Три независимых контура

| Контур            | Public guest                                                                             | Corporate tenant                                                                               | Workers / control plane                                              |
| ----------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------- |
| Назначение        | массовый вход и игра гостей                                                              | управление сетью и игровыми правилами сотрудниками                                             | scheduled/replay/delivery/integration работа                         |
| Web               | `/game/auth`, `/game/clubs`, `/game`, `/game/rewards`, совместимые `/play*`, `/game/app` | `/dashboard`, `/gamification`, `/staff*`, `/marketing`, `/assortment*`, `/administration`      | операторские runbooks/CLI, не public Web session                     |
| API               | `/guest-portal`, `/guest-portal/*`, `/public/guest-game/media*`                          | `/auth*`, `/dashboard*`, `/stores*`, `/staff*`, `/guests/gamification*` и остальные B2B routes | service-token/scheduled endpoints и отдельные runners                |
| Identity          | `GuestGameProfile`, guest JWT/HttpOnly cookie, подтверждённый `phoneHash`                | corporate JWT, effective role/capabilities, fresh `NETWORK                                     | STORES` scope                                                        | отдельная service/runtime identity, tenant execution admission |
| Secrets           | guest JWT/referral/provider + нужные integration encryption keys                         | corporate JWT/identity/invite + B2B integration keys; guest JWT запрещён                       | только exact worker/provider secret set                              |
| Конкурентность    | сотни разных guest sessions должны исполняться параллельно                               | B2B rate/scope policy не влияет на public guest                                                | bounded leases/batches, без регистрации scheduler в public guest API |
| Process candidate | `guest-main` / `GuestRuntimeModule`                                                      | `corporate-main` / `CorporateRuntimeModule`                                                    | отдельные units/runners по rollout contract                          |

Критическое различие: `/guests/gamification*` — это корпоративное управление
игровым модулем. Оно должно остаться доступно tenant-ролям в corporate runtime.
Публичный игровой вход и gameplay используют `/guest-portal*` и не должны
импортировать корпоративную авторизацию. Название домена `guest-gamification`
в коде само по себе не определяет runtime-контур; определяет субъект и HTTP
contract.

### Production USER_CALL continuity

Публичный вход по SMS.ru Callcheck — пользовательский request path, а не worker.
Для текущего `COMBINED` blue/green runtime он включается только API-only файлом
`/etc/leetplus/guest-user-call-live.env`, установленным и проверенным exact
production-control generation. Профиль разрешает только `USER_CALL`, provider
`SMS_RU_CALLCHECK`, canonical `https://sms.ru` и timeout `8000`; API key остаётся
в API runtime secret set. Web не загружает этот файл. Все scheduler/delivery/
materializer switches остаются fail-closed в `canary-safe.env`.

Ручные `leetplus-user-call-api.service`/`leetplus-user-call-web.service` не
являются допустимым постоянным контуром: они не имеют immutable same-SHA,
schema-bridge и rollback authority. Перед `CURRENT_188` они должны быть
переключены на admitted slot без разрыва публичного входа, остановлены,
disabled и удалены из systemd inventory. Помечать такой sidecar `SAFE` нельзя.

### Autonomous bonus-ledger worker

Langame bonus accrual относится только к workers/control-plane contour. В
production встроенный `GuestBonusLedgerSchedulerService` обязан оставаться
выключенным в обоих одновременно активных blue/green API slot. Единственный
допустимый автономный владелец — отдельный
`leetplus-bonus-ledger-worker.timer`/oneshot service:

- runner разрешает active nginx slot на каждом tick, сверяет slot env с
  immutable release SHA и запускает CLI из этого exact release;
- worker имеет отдельный минимальный `/etc/leetplus/bonus-ledger-worker.env`,
  не загружает широкий API runtime env, не регистрирует HTTP controllers и не
  импортируется public guest runtime;
- systemd запрещает overlap одного oneshot unit; database claim generation,
  row locks и idempotency key остаются второй exactly-once границей;
- live fail-closed требует exact tenant, worker enable, `DRY_RUN=false` и
  `LANGAME_BONUS_ACCRUAL_ENABLED=true`; canary ограничен одной exact reward;
- tenant-wide scheduled pass может не задавать один `storeId`, но только внутри
  worker/control-plane path: перед каждым provider write claimed entry повторно
  проходит `TENANT_STORE_SYSTEM` identity с exact `entry.storeId`; запись без
  store остаётся заблокированной без Langame write. Corporate/manual dispatch
  без exact `storeId` по-прежнему отклоняется до claim;
- staff/test accrual override в production остаётся `false`: такие записи
  отменяются до provider write и не попадают на реальные балансы сотрудников;
- pre-dispatch ошибки используют bounded retry, а неоднозначный внешний POST
  остаётся `RECONCILIATION_REQUIRED` без автоматического повтора.

Установка unit/runner выполняется только exact production-control artifact с
отдельно закреплённым install-map digest. Само наличие файлов в `main` или
установка control generation не включает timer. Production activation требует
one-item canary, сверку Langame balance before/after и отдельный GO; rollback —
`systemctl disable --now leetplus-bonus-ledger-worker.timer` без переключения
public/corporate runtime.

### Runtime repair contract 29–30.08.2026

- `USER_CALL` остаётся обычным public API request path. Advisory transaction
  lock обязан возвращать Prisma-поддерживаемый scalar (`::text AS
  "lockResult"`); запрос, возвращающий PostgreSQL `void`, запрещён, потому что
  превращает корректный provider flow в HTTP 500 до создания challenge.
- Автономный reward materializer и inline reward claim имеют разные controls.
  Безопасный обычный API overlay — `GUEST_GAME_REWARD_MATERIALIZER_ENABLED=false`
  и `GUEST_GAME_REWARD_MATERIALIZER_KILL_SWITCH=false`: scheduler не запускается,
  а уже заработанный кейс можно открыть вручную. `KILL_SWITCH=true` допустим
  только как аварийная остановка всех новых claim, а не как постоянный
  fail-closed default.
- Application runtime role получает `EXECUTE` ровно на десять зарегистрированных
  функций CURRENT188. В этот allowlist входят
  `assert_staff_attachment_state(text)` и
  `resolve_staff_attachment_resource_scope("StaffAttachmentResourceKind",text)`,
  необходимые вызывающим их attachment triggers. Гранты выдаются только
  `leetplus_runtime`, без `GRANT OPTION`; `PUBLIC` execute остаётся отозванным.
- Эти две исторические `SECURITY INVOKER` функции до runtime enrollment могут
  иметь только legacy-состояние без function-local `search_path`. Exact
  controller в одной транзакции закрепляет для них
  `pg_catalog, public, pg_temp` (с `pg_temp` строго последним) и только затем
  выдаёт `EXECUTE`. Любой иной pre-existing `search_path`, а также `CREATE` на
  `public` у runtime role, блокирует операцию. Для остальных 56 функций
  сохраняется точное требование `search_path=pg_catalog`.
- Runtime grant repair выполняется только versioned exact controller из
  admitted artifact. Ручной широкий `GRANT EXECUTE ON ALL FUNCTIONS` запрещён.
- Пока background materializer выключен, parked entitlement/reward rows не
  дренируются автоматически. Повтор exact пользовательского open/claim после
  снятия emergency kill switch безопасен благодаря idempotency intent/effect и
  является предпочтительным recovery для отдельного доступного кейса.

Production runtime repair rollout завершён 30.08.2026 на exact admitted SHA
`ca3f332f…`. Следующий UI/state rollout выполнен на exact admitted SHA
`6ec3a5f1…` без изменения схемы и security-контуров:

- active nginx upstream — blue, rollback green `ca3f332f…` оставлен активным;
- canonical API overlay подтверждён как materializer scheduler `false`,
  emergency kill switch `false`, USER_CALL `true/SMS_RU_CALLCHECK`;
- exact enrollment закрепил `search_path=pg_catalog, public, pg_temp` и
  `EXECUTE` для `leetplus_runtime` только у двух attachment helpers; `PUBLIC`
  execute остался `false`;
- production postflight: public API/Web ready, runtime advisory-lock cast
  исполняется, отрицательный USER_CALL status path возвращает контролируемый
  `400`, после cutover нет `P2010`/PostgreSQL `void` deserialize errors;
- staff QA через штатные login + signed tenant context прошёл upload/download
  одного 34-byte attachment (`200/200`);
- entitlement гостя `***6035` для `КЕЙС «УТРО»` остался `AVAILABLE`,
  `<unconsumed>`, wallet `PENDING`; QA намеренно не открывал кейс от имени
  пользователя.
- guest Battle Pass больше не использует onboarding fallback как реальный
  сезон: API сохраняет tenant/status/period/store scope, а Web рендерит блок
  только для активного сезона с уровнями;
- onboarding-шаг «Активность в клубе» закрывается только подтверждённым
  `CHECK_IN`; произвольная сессия или другое game event не засчитываются;
- редактор сохраняет смену club scope с безопасным remap category по
  единственному semantic name, выводит backend-ошибку у действия сохранения и
  показывает способ выдачи наград в сохранённой карточке.

## Техническая поддержка игрового модуля

Support-функциональность следует тем же трём границам и не образует четвёртый
смешанный контур:

- public guest отправляет обращение только через
  `/guest-portal/session/support/bug-reports`; identity — guest JWT и exact
  `GuestGameProfile`, rate/idempotency scoped по tenant + profile;
- tenant user работает только с `/support/bug-reports*` после corporate JWT,
  support capability и `FreshNetworkScopeGuard`;
- platform-wide `/admin/support-tickets*` требует `PlatformAdminGuard`;
- guest process пишет только support-owned tables и не импортирует corporate
  auth, staff tasks, notifications или outbound transports;
- вложение ограничено одним JPG/PNG/WebP до 5 MiB, проверяется по bytes,
  очищается от metadata и выдаётся только как private attachment;
- runtime flag `GUEST_BUG_REPORTING_MODE=OFF|LIVE` fail-closed и по умолчанию
  равен `OFF`.
- единственный schema bridge допускает exact `CURRENT_187 -> CURRENT_188`
  только для `COMBINED` runtime при `GUEST_BUG_REPORTING_MODE=OFF`; любой другой
  head/count, unfinished migration, split runtime или `LIVE` блокирует startup/
  readiness. Это переходный deployment-контракт, а не разрешение читать
  отсутствующие support tables.
- фактическая production schema имеет историческую mixed-owner topology.
  Единственный допустимый переход — same-SHA signed legacy controller с
  пообъектным OID/owner/ACL digest, migration от локальной postgres identity,
  неизменностью всех исторических owners и минимальным ACL только новых
  support-объектов. Универсальная owner normalization запрещена.
- до database effect active и rollback slot образуют только explicit
  `DUAL_BRIDGE_N_MINUS_ONE`: каждый обязан быть independently admitted
  target-188 artifact с release provenance, hydration/slot-link receipt,
  exact target migration checksum, API/Web invocation, authenticated DB-bound
  smoke и reporting OFF. Старый
  CURRENT_187 artifact не является rollback authority. Active slot и
  production-control generation обязаны принадлежать одному exact SHA;
  подписанный plan закрепляет доказательства обоих slot;
- production-control `install.lock` и blue/green cutover lock удерживаются одним
  authority window от финальной dual-slot сверки до post-effect проверки;
  замена control generation или runtime bytes во время DDL запрещена;
- под тем же root-owned cutover lock непосредственно перед DDL оба slot снова
  подтверждают actual database CURRENT_187 и единственную compatibility
  `187 -> 188`; сразу после DDL оба обязаны подтвердить exact CURRENT_188 без
  active compatibility evidence. До этого reporting LIVE запрещён.

Bug-report schema rollout завершён 29.08.2026, runtime repair и последующий
Battle Pass/store-scope repair — 30.08.2026. Active blue `6ec3a5f1…` работает
на exact CURRENT188 с bridge `OFF` и reporting `LIVE`; hot rollback green
`ca3f332f…` остаётся exact CURRENT188 и
активным. Это не меняет split-runtime решение: production по-прежнему
`COMBINED`, а три логических security-контура сохраняются guards/module
boundaries.

Подробный контракт и rollout:
[`docs/support/guest-bug-reporting.md`](../support/guest-bug-reporting.md).

## Инварианты публичного игрового входа

1. Нет общего application-wide лимита одновременно авторизующихся гостей.
   Anti-abuse лимит может быть scoped по exact phone/store/tenant/channel, но
   не превращается в глобальный mutex, cleanup или corporate throttle.
2. `USER_CALL` reservation и advisory lock ограничены exact
   `tenant + store + phoneHash + channel`. Создание/переиспользование профиля
   сериализуется только по текущему challenge.
3. Provider call выполняется вне database transaction и имеет bounded timeout.
   Повторный status poll одного challenge объединяется DB lease; разные
   challenge исполняются независимо.
4. Cleanup не делает глобальный `updateMany` по challenge других пользователей.
   Повторное подтверждение не создаёт второй profile, consent или referral.
5. Public guest request не требует corporate cookie/JWT, staff role,
   `FreshStoreScope` или `FreshNetworkScope`. Ошибка корпоративного входа не
   должна блокировать `/guest-portal*`.
6. Public registration создаёт/использует `GuestGameProfile`, а не общий
   `Guest`. Связь с сохранённым Langame guest появляется только после
   подтверждённого `phoneHash` и безопасной сверки.
7. Raw phone, provider token/API id, raw Telegram update/chat id и Langame
   payload не возвращаются в браузер и не попадают в readiness/audit.

## Инварианты корпоративного входа

Маршрут после login — часть безопасного UX, но не замена authorization:

| Effective role/context                                  | Поддерживаемый landing                  |
| ------------------------------------------------------- | --------------------------------------- |
| `OWNER`, `ADMIN`, `MANAGER`, `CLUB_MANAGER`             | `/dashboard`                            |
| `BUYER`                                                 | `/assortment/dashboard`                 |
| `MARKETER`                                              | `/marketing`                            |
| `STANDARDS_MANAGER`                                     | `/staff`                                |
| `SENIOR_ADMINISTRATOR`, `CLUB_ADMINISTRATOR`, `TRAINEE` | `/staff/shift-workspace`                |
| Platform admin без подписанного tenant-контекста        | `/administration`                       |
| Platform admin с подписанным tenant-контекстом          | landing effective tenant role (`OWNER`) |

- Stale `returnTo=/dashboard` не отменяет специализированный landing.
- Прямой `/dashboard` проверяет landing до запросов `stores` и
  `dashboard/summary`.
- Нельзя чинить неверный redirect расширением capability, tenant scope или
  cross-tenant доступа.
- Сохранённая platform-admin сессия не является tenant-контекстом. Tenant
  выбирается явно и подписывается.

## Game administration и background jobs

- `CorporateGuestGamificationModule` сохраняет tenant-authenticated
  `/guests/gamification*`, media management и controlled game jobs в corporate
  process, но не регистрирует public guest media controller.
- `GuestRuntimeModule` регистрирует только public guest portal/media и
  health/version. Он не импортирует `AuthModule`, `StaffModule`, broad
  `IntegrationsModule`, `GuestPortalModule` или полный
  `GuestGamificationModule`.
- Нужный guest bonus signal в public process — explicit no-op. Public request
  не должен запускать автономный ledger/sync/materializer scheduler.
- Worker endpoints остаются за service token, tenant execution admission,
  rollout flags, bounded batch/lease и отдельной observability.

## Langame и outbound network boundary

1. Web runtime остаётся localhost-only.
2. API/worker может требовать reviewed TCP/DNS egress к Langame, SMTP, SMS.ru
   и другим явно принятым providers. Копирование Web sandbox на API 27.08.2026
   остановило Langame/check-in и не должно повторяться.
3. Каждый dedicated runtime получает только свой dependency allowlist; egress
   не означает доступ ко всем secret sets.
4. Для shared Langame domain fact без `club_id` допустима domain routing только
   когда правило охватывает все активные клубы этого domain. Partial store
   scope остаётся fail-closed.
5. Provider timeout/retry/idempotency оцениваются отдельно от database lock и
   HTTP concurrency.

## Split-runtime successor в source

На merge SHA `88719342...` реализованы:

- роли `COMBINED | CORPORATE | GUEST` и exact entrypoint assertion;
- fail-closed HTTP perimeter до body parser;
- взаимоисключающие production secret allowlists;
- разные service identities и health/version;
- dedicated PostgreSQL roles `leetplus_api_corporate` и
  `leetplus_api_guest`, verified TLS и bounded Prisma pools;
- отдельные dormant systemd UID/slices, blue/green ports и nginx upstreams без
  fallback между guest и corporate;
- CI boundary tests для module graph, HTTP, env, database URL и deployment
  candidate.

`COMBINED` сохранён только как совместимый текущий entrypoint до controlled
cutover. Он не является целевой долгосрочной изоляцией.

Полный deployment candidate:
[`docs/deployment/guest-runtime-pool-candidate/README.md`](../deployment/guest-runtime-pool-candidate/README.md).

## Что произошло 27–28.08.2026

| Изменение                                             | Зафиксированный урок                                                                                                                                                                                                                                                   |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR #53/#54/#55/#61 — systemd 255 и production-control | Проверять effective runtime semantics, stale PID/cgroup и serializer формы; verifier обязан остановиться до nginx mutation, но не отвергать безопасную canonical форму ОС.                                                                                             |
| PR #56/#57 — guided OWNER onboarding                  | Invite-bound owner сам задаёт пароль и получает явные шаги замены временных названий/часового пояса/API credentials; это не меняет employee/platform-admin landing.                                                                                                    |
| PR #59 — восстановление API egress                    | Web localhost policy нельзя переносить на API: Langame/check-in требуют reviewed outbound.                                                                                                                                                                             |
| PR #60 — shared Langame domain routing                | Отсутствующий `club_id` не повод расширять store scope; domain fallback допустим только для правила на все клубы domain.                                                                                                                                               |
| PR #63/#64 — role-aware landing                       | Строгий API scope должен сочетаться с поддерживаемым landing; неверный redirect не чинится расширением прав.                                                                                                                                                           |
| PR #65 — logical guest auth isolation                 | Locks, cleanup, provider timeout и poll dedupe должны быть challenge-scoped; корпоративный auth contour не ограничивает public guest concurrency.                                                                                                                      |
| PR #66 — process/module/runtime isolation             | Public guest, B2B game administration и workers требуют разных module graphs, secret sets, pools и resource identities.                                                                                                                                                |
| PR #67 — current-context fixation                     | Source/admission и фактический production state фиксируются раздельно; green admission не является автоматическим deploy.                                                                                                                                              |
| USER_CALL production handoff                          | Пользовательский Callcheck допускается только через exact API activation profile; ручной old-SHA sidecar должен быть выведен до schema migration.                                                                                                                      |
| Blue/green post-auth watchdog                         | Stateful authenticated smoke выполняется после трёх последовательных public readiness samples; bounded probe children не наследуют cutover lock, поэтому ни ingress cooldown, ни переживший deadline descendant не обнуляют/блокируют доказанную runtime-стабильность. |

## Проверка перед изменением пересекающей области

1. Назвать субъект: public guest, tenant user, platform admin или worker.
2. Назвать exact route prefix и runtime owner из таблицы выше.
3. Проверить, не импортируется ли широкий module/guard/secret другого контура.
4. Проверить landing всех затронутых ролей до первого restricted API fetch.
5. Для lock/rate limit/cleanup указать exact scope key и доказать параллельность
   двух разных guest challenges.
6. Для provider/integration указать timeout, idempotency и нужный egress без
   удержания DB transaction.
7. Проверить both-way negative boundary: guest runtime отвергает B2B route,
   corporate runtime отвергает public guest route до body parsing.
8. Отдельно зафиксировать source state и фактический production state; не
   переносить слово `deployed` из CI/merge evidence.
9. Если boundary меняется, обновить этот документ, open-beta status и
   deployment runbook в том же PR.

## Оставшиеся production gates для split runtime

1. Создать и rehearsal-проверить разные DB roles/ACL и общий connection budget.
2. Включить обе API units/env/nginx bytes в production-control install map,
   digest attestation, preflight, watchdog, recovery receipt и atomic rollback.
3. На одном admitted SHA проверить loopback health/version и обе отрицательные
   route matrix.
4. Провести параллельный canary сотен guest sessions вместе с `/auth/me` и
   критическими B2B reads; отдельно проверить provider timeout и pool
   exhaustion.
5. Проверить независимый отказ каждого process и rollback на `COMBINED` N-1.
6. Получить отдельный явный production GO. До этого не устанавливать units, не
   менять nginx/DB ACL и не считать split runtime активным.
