# Сообщения о проблемах из игрового модуля

Статус: **production LIVE на CURRENT_188; source repair candidate CURRENT_189**

Актуально на: **31.08.2026**

Фактический production state: active green
`a130c13e8d694b605d86a924b1524a6174ae1b51`, cutover generation 16, exact
`CURRENT_188`, `GUEST_SUPPORT_SCHEMA_BRIDGE_MODE=OFF`,
`GUEST_BUG_REPORTING_MODE=LIVE`. Source repair ещё не развёрнут: production
форма по-прежнему требует 30 символов и multipart envelope с файлом может
получить `Too many parts`. Наличие repair-кода или зелёных локальных тестов не
означает production deployment.

## Назначение

Гость с действующей игровой сессией может открыть форму через иконку жучка,
выбрать тему, описать проблему и приложить один скриншот. После успешной
отправки интерфейс показывает безопасный номер вида `LP-BUG-XXXXXXXX`.

Это первая версия внутренней поддержки. Она не отправляет e-mail, SMS или
Telegram-сообщения, не создаёт `StaffTask` и не вызывает внешние providers.
Обращение атомарно сохраняется в support-owned таблицах PostgreSQL и появляется
в защищённой очереди.

## Runtime-контуры и маршруты

| Субъект          | Web                                                                            | API                                              | Runtime/guard                                                                  |
| ---------------- | ------------------------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| Public guest     | `POST /api/guest-support/bug-report`                                           | `POST /guest-portal/session/support/bug-reports` | `GuestRuntimeModule`, guest JWT и write requirements                           |
| Tenant support   | `/support` и private BFF `/api/support/bug-reports/*`                          | `/support/bug-reports/*`                         | `CorporateRuntimeModule`, corporate JWT, capability и `FreshNetworkScopeGuard` |
| Platform support | `/administration/support-tickets` и private BFF `/api/admin/support-tickets/*` | `/admin/support-tickets/*`                       | `CorporateRuntimeModule`, corporate JWT и `PlatformAdminGuard`                 |

Guest runtime не импортирует corporate `AuthModule`, `SupportModule` или
`StaffModule`. Corporate runtime не регистрирует public guest route. COMBINED
runtime сохраняет оба логических периметра до отдельного split-runtime rollout.

## Темы и данные

Поддерживаются темы:

- игровой модуль;
- задания и боевой пропуск;
- лутбоксы и награды;
- баланс и платежи;
- авторизация и профиль;
- интерфейс и отображение;
- другое.

Описание содержит 20–2000 символов. Сервер добавляет только ограниченную
диагностику: tenant/store/profile identity, masked guest reference, текущий
route без query string, release SHA, класс браузера/устройства, viewport и
timezone. Raw phone, guest JWT, corporate JWT, cookies, provider payloads и
secrets не сохраняются.

## Вложения

- не более одного файла и 5 MiB;
- только JPG, PNG или WebP;
- multipart envelope содержит не более пяти allowlisted текстовых полей и
  одного файла; Busboy `parts` использует отдельный exclusive cap `7`, поэтому
  канонические `5 fields + 1 file` не блокируются как `Too many parts`;
- заявленный MIME обязан совпасть с сигнатурой bytes;
- выполняется структурная проверка и удаление EXIF/text/XMP metadata;
- сохраняются canonical bytes, размер и SHA-256;
- support API отдаёт файл только как `attachment` с `nosniff`, `no-store` и
  sandbox CSP; UI не встраивает содержимое как исполняемый документ.

## Защита от повторов и abuse

- BFF требует точный bounded `Content-Length` и отвергает missing/chunked body
  до multipart parsing;
- допускается только фиксированный набор multipart-полей;
- idempotency scoped по `tenantId + profileId + idempotencyKey`;
- лимиты: 5 новых обращений за скользящий час и 20 за 24 часа на exact профиль;
- count + insert выполняются в serializable transaction с bounded retry;
- feature flag `GUEST_BUG_REPORTING_MODE` принимает только `OFF|LIVE`, default
  и production-safe rollback value — `OFF`.

## Доступ сотрудников

Tenant-очередь видят пользователи с capability `view_support_tickets` в свежем
network scope. Назначение, смена статуса и внутренний комментарий требуют
`manage_support_tickets`. OWNER/ADMIN получают обе capability как обязательный
минимум роли, в том числе при наличии custom role или role override. Это не
изменяет frozen shared-beta provisioning profile и не требует массового
переписывания `UserRoleOverride`. Техническому специалисту capability выдаются
явно через custom role или exact tenant role override. Platform-wide очередь
доступна только platform admin.

Production authenticated read-smoke обязан принимать эти две capability как
часть exact текущего каталога. Их отсутствие в application response либо в
immutable smoke allowlist является fail-closed deployment drift и блокирует
cutover до создания durable intent.

Каждое создание, изменение и комментарий записываются в отдельный support audit
ledger. Tenant API всегда добавляет `tenantId` в read/update/comment/download;
несуществующий или cross-tenant объект возвращается как not found.

## Source repair CURRENT_189

Additive migration:
`20260831120000_guest_support_bug_report_input_repair` (`CURRENT_189`, 189
applied после rollout). Она только ослабляет check длины описания с `30..2000`
до `20..2000` и перевыпускает fail-closed identity-mail worker receipt на exact
новый head. Существующие обращения не переписываются и не удаляются.

API и Web используют одну и ту же границу `20..2000`; controller сохраняет
независимые limits `files=1`, `fields=5`, `fileSize=5 MiB`, `fieldSize=4 KiB` и
`parts=7`. Регрессионный HTTP test обязан принимать ровно пять полей плюс JPG и
отвергать шестое текстовое поле. Database check отдельно принимает 20 символов
и отвергает 19.

Production остаётся на `CURRENT_188` до exact-SHA CI/admission, rehearsal на
копии production, отдельного контролируемого schema upgrade и обычного
blue/green cutover. Дормантный noncanonical proposal, исторически помеченный
как `CURRENT189 employee invite`, этим repair не активируется и перед любой
будущей canonical promotion должен быть заново rebased/refrozen относительно
фактического head.

Первый restored-copy acceptance корректно завершился `FAIL` до production
effect: database oracle сравнивал `/products` со всеми 1489 строками `Product`,
тогда как контракт endpoint возвращает 1238 активных товаров. Разница — 251
архивный `isActive=false` товар. Oracle теперь использует тот же активный scope,
а regression фиксирует SQL-предикат. Это не меняет данные и не скрывает
расхождение активного каталога; новый exact-SHA rehearsal обязан пройти заново.

Следующий exact-SHA rehearsal также остановился до production effect с
`CURRENT_RELEASE_CROSS_TENANT_USER_REFERENCE`. Read-only разбор всех 103
tenant-scoped foreign keys к `User` подтвердил ноль реальных cross-tenant
ссылок. Причиной были исторические ссылки на platform-admin этого же tenant,
которого `/users` корректно скрывает от tenant owner. Acceptance oracle теперь
разделяет visible user set и полный tenant reference set: это разрешает только
same-tenant ссылку, не добавляет platform-admin в API-каталог и сохраняет
fail-closed отказ для настоящего foreign user ID. Регрессионный тест покрывает
обе стороны границы; production остаётся неизменённым до нового admission.

Для rollout CURRENT_189 добавлен отдельный режим
`GUEST_SUPPORT_SCHEMA_BRIDGE_MODE=ALLOW_CURRENT_188`. Его контракт:

- source — exact `20260828190000_guest_support_bug_reports`, count `188`;
- target — exact
  `20260831120000_guest_support_bug_report_input_repair`, count `189`;
- только `API_RUNTIME_ROLE=COMBINED` и
  `GUEST_BUG_REPORTING_MODE=OFF`;
- target release identity обязана быть exact CURRENT_189;
- после применения migration readiness становится exact CURRENT_189 без
  compatibility evidence; затем bridge обязан вернуться в `OFF`, а reporting —
  в `LIVE`.

Перед DDL оба blue/green slot заменяются одним independently admitted
target-189 SHA и проверяются через этот bridge. Старый CURRENT_188 runtime после
DDL не является rollback authority. Миграция выполняется под production-control
install lock и blue/green cutover lock при остановленном bonus-ledger timer;
после exact-189 postflight timer возвращается в автономный режим. Исторический
`ALLOW_CURRENT_187` остаётся отдельным контрактом только для 187→188 и не
расширяется.

## Историческое включение CURRENT_188

Additive migration:
`20260828190000_guest_support_bug_reports` (`CURRENT_188`, 188 applied).
Она создаёт только новые enum/table/index/FK/check objects и перевыпускает
identity-mail readiness receipt на exact новый head. Удаление или изменение
существующих business rows не выполняется.

Production сейчас может находиться на `CURRENT_187`, тогда как admitted artifact
ожидает `CURRENT_188`. Поэтому rollout выполняется двумя cutover, без окна 502 и
без запуска нового кода с доступной гостю записью до появления таблиц:

1. получить green Fast CI + Full Release Admission одного exact SHA и проверить
   SHA-bound runtime/control artifacts и final admission receipt;
2. сделать backup, восстановить его в изолированную PostgreSQL 16 copy и пройти
   exact checksum-pinned database path `187 -> 188`, repeat/catalog check и
   обычный restored-copy acceptance. Production `V2 plan/apply` здесь не
   подменяется: его live bridge-attestation возможна только после реального
   первого cutover;
3. запустить inactive slot с release identity `CURRENT_188`, но с
   `GUEST_BUG_REPORTING_MODE=OFF` и
   `GUEST_SUPPORT_SCHEMA_BRIDGE_MODE=ALLOW_CURRENT_187`; readiness принимает
   только exact чистый `CURRENT_187` и публикует явную compatibility evidence;
   tenant/platform support API в этом режиме отвечает safe not found до любого
   запроса к отсутствующим support tables, а Web-страницы очередей возвращают
   пользователя в соответствующий dashboard;
   API slot одновременно обязан пройти exact `guest-user-call-live.env`
   attestation, чтобы публичный Callcheck можно было переключить с временного
   old-SHA sidecar до schema effect без окна недоступности;
4. пройти loopback/public read-only canary и атомарно переключить трафик на этот
   bridge slot. До schema effect предыдущий slot также обязан быть заменён на
   independently admitted target-188 artifact, пройти hydration/slot-link,
   unit/env/Web identity и authenticated read-smoke и работать при фактической
   БД CURRENT_187 только через тот же explicit bridge. Старый CURRENT_187
   artifact не остаётся rollback target;
5. для фактической production mixed-owner topology применить только подписанный
   checksum-pinned
   `FOUNDER_PILOT_CURRENT188_LEGACY_MIXED_OWNERSHIP_V2` controller. До любого
   database effect он берёт тот же root-owned cutover lock, проверяет активный
   nginx target, непросроченный accepted receipt/index с `CONSUMED=false`,
   отсутствие cutover/slot-link intent и exact active + rollback runtime.
   Для обоих slot он закрепляет target-188 provenance, hydration/slot-link
   receipts, systemd invocation, environment/Web identity, authenticated smoke,
   exact target migration checksum, `COMBINED + OFF + ALLOW_CURRENT_187` и live
   readiness `187 -> target 188`; active production-control generation обязана
   совпадать с controller SHA. Production-control install lock удерживается
   вместе с blue/green lock до post-effect проверки, поэтому control generation
   не может смениться во время DDL. Подписанный plan закрепляет эту
   `DUAL_BRIDGE_N_MINUS_ONE` topology, production database/role identity и
   пообъектный digest исторических OID/owner/ACL. Controller
   допускает ровно `187 applied / 4 rolled back / 0 unfinished`, выполняет
   одну целевую миграцию локально от `postgres`, не меняет исторических
   owners, одной транзакцией отзывает PUBLIC grants и выдаёт runtime только
   минимальный support ACL. Под тем же lock он проверяет readiness `188/188`,
   body/comment worker function, таблицы, enum, constraints, indexes,
   неизменность ownership digest и exact ACL. Под тем же lock оба slot обязаны
   перейти в exact `CURRENT_188` readiness без active compatibility evidence;
6. убедиться, что active и rollback bridge после изменения БД готовы уже как
   exact `CURRENT_188`. Перезапустить candidate slot с
   `GUEST_BUG_REPORTING_MODE=LIVE` и
   `GUEST_SUPPORT_SCHEMA_BRIDGE_MODE=OFF`;
7. пройти negative contour matrix, guest submit/idempotency/invalid-file,
   tenant/platform isolation canary, затем второй atomic cutover и bounded soak.

Executable production controller и команды описаны в
[CURRENT_188 legacy mixed-owner controller](../open-beta/founder-pilot-current188-legacy-mixed-owner-upgrade-controller.md).
Строгий
[CURRENT_188 V3 controller](../open-beta/founder-pilot-current188-production-upgrade-controller.md)
остаётся для базы с единым migration owner и на текущей mixed-owner production
топологии обязан блокироваться до effect.
Bridge не является общим допуском N/N+1: он принимает только одну пару
`187 -> 188`, только `COMBINED` runtime и только при выключенной отправке багов.
После второго cutover значение обязано вернуться в `OFF`.

Rollback приложения не требует schema rollback: additive objects остаются, а
после перехода схемы rollback target — первый bridge slot того же admitted SHA,
который уже прошёл exact `CURRENT_188` readiness. Старый `CURRENT_187` runtime
нельзя возвращать после миграции, потому что его exact-head readiness справедливо
откажет. Операционный kill switch — вернуть
`GUEST_BUG_REPORTING_MODE=OFF` и перезапустить active API; форма исчезает из
следующего game-summary, create route отвечает safe not found. Уже сохранённые
обращения не удаляются.
