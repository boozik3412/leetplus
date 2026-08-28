# Сообщения о проблемах из игрового модуля

Статус: **production candidate; default OFF**

Актуально на: **28.08.2026**

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

Описание содержит 30–2000 символов. Сервер добавляет только ограниченную
диагностику: tenant/store/profile identity, masked guest reference, текущий
route без query string, release SHA, класс браузера/устройства, viewport и
timezone. Raw phone, guest JWT, corporate JWT, cookies, provider payloads и
secrets не сохраняются.

## Вложения

- не более одного файла и 5 MiB;
- только JPG, PNG или WebP;
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

Каждое создание, изменение и комментарий записываются в отдельный support audit
ledger. Tenant API всегда добавляет `tenantId` в read/update/comment/download;
несуществующий или cross-tenant объект возвращается как not found.

## Миграция и включение

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
4. пройти loopback/public read-only canary и атомарно переключить трафик на этот
   bridge slot. Предыдущий `CURRENT_187` slot остаётся точным N-1;
5. применить только подписанный checksum-pinned
   `FOUNDER_PILOT_PRODUCTION_HISTORY_187_TO_188_V2` controller. До любого
   database effect он берёт тот же root-owned cutover lock, проверяет активный
   nginx target, непросроченный accepted receipt/index с `CONSUMED=false`,
   отсутствие pending intent, exact release/slot/systemd/environment identity,
   `COMBINED + OFF + ALLOW_CURRENT_187` и live readiness `187 -> target 188`.
   Эта attestation входит в подписанный plan вместе с production database
   identity. Controller допускает ровно
   `187 applied / 4 rolled back / 0 unfinished`, одну целевую миграцию и после
   deploy под тем же lock проверяет readiness `188/188`, таблицы, enum,
   constraints, indexes, owner/runtime fingerprint и отсутствие PUBLIC grants;
6. убедиться, что active bridge после изменения БД готов уже как exact
   `CURRENT_188`. Запустить второй slot с `GUEST_BUG_REPORTING_MODE=LIVE` и
   `GUEST_SUPPORT_SCHEMA_BRIDGE_MODE=OFF`;
7. пройти negative contour matrix, guest submit/idempotency/invalid-file,
   tenant/platform isolation canary, затем второй atomic cutover и bounded soak.

Executable controller и команды описаны в
[CURRENT_188 production upgrade controller](../open-beta/founder-pilot-current188-production-upgrade-controller.md).
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
