# Canonical simple safe external Langame onboarding

## Статус и граница

`CANONICAL SOURCE CONTRACT / PRODUCTION GO REQUIRED`.

Это единственный поддерживаемый onboarding Langame для tenant с
`customerStage=PILOT | BETA | LIVE`. Он заменяет цепочку staged
`CURRENT188`/CURRENT191–202 как путь подключения внешнего клиента. Исторические
документы и candidates сохранены только как evidence; они не являются route,
migration или production authority.

Контракт не меняет существующий `INTERNAL` tenant сети `1337`: его legacy
settings, manual sync и worker-профиль остаются изолированным compatibility
контуром. Нельзя использовать этот контур для обхода правил внешнего tenant.

## Пользовательский путь

1. OWNER/ADMIN в своём fresh `NETWORK` scope указывает API key и один или
   несколько Langame domains.
2. Web вызывает same-origin preview
   `POST /api/integrations/langame/settings/preview`; BFF передаёт его только в
   `POST /integrations/langame/settings/preview`.
3. Preview нормализует domains, использует переданный либо уже сохранённый key и
   выполняет только bounded read `/clubs/list`. Он не сохраняет credential,
   source, Store, sync job или provider business data.
4. Если домен вернул ровно один допустимый club, он выбирается автоматически.
   Если клубов несколько, пользователь должен явно выбрать каждый club, который
   принадлежит его сети. Нулевой, невалидный или недоступный список отклоняет
   весь запрос; скрытый выбор «всех доступных клубов» отсутствует.
5. После выбора Web вызывает `PUT /api/integrations/langame/settings`, который
   проксируется в `PUT /integrations/langame/settings`.

`PUT /settings` не доверяет preview и заново получает список клубов с теми же
bounded limits. Он повторно проверяет fresh tenant/actor scope, выбранные
domain/club пары и целевой Store, затем в одной DB transaction сохраняет
credential, active IntegrationSource и точные Store bindings. Повторный запрос
идемпотентно обновляет уже привязанный Store; конфликт или drift целиком
откатывает transaction.

Если выбран ровно один club и у tenant на момент начала transaction есть ровно
один active unbound Store, сервис может привязать этот Store автоматически.
Ранее связанный Store не становится auto-candidate только из-за смены выбора:
это защищает от незаметной перепривязки. Во всех остальных случаях Store
создаётся для выбранного club либо пользователь явно выбирает допустимый Store.
Один Store нельзя связать с двумя выбранными clubs.

Некорректная форма request body, невалидный или неоднозначный элемент
`/clubs/list`, превышение лимита либо изменение upstream-списка между preview и
commit отклоняются до business writes. Provider payload не считается доверенным
только потому, что HTTP-запрос завершился успешно.

## Identity и изоляция

Store identity имеет глобальную уникальность:

```text
(externalProvider, externalDomain, externalClubId)
```

Migration `20260908180000_external_langame_simple_onboarding` добавляет этот
unique index. До записи сервис также ищет чужую tenant-привязку; database
constraint остаётся окончательной race-safe границей. Конфликт возвращается как
`LANGAME_CLUB_ALREADY_CONNECTED`, не раскрывая tenant-владельца.

Source и Store всегда tenant-scoped. Настройка одного внешнего tenant не может
переиспользовать credential, domain, club или Store другого tenant.

## Допустимые эффекты после подключения

Для external tenant разрешён только ручной Langame sync и только по уже
persisted exact Store bindings. Он не должен discover-ить, создавать или
подключать другие clubs. Изменение списка domains/клубов проходит снова через
preview и revalidation `PUT /settings`.

Следующие пути для external tenant остаются denied до отдельного reviewed
контракта и production GO:

- scheduled/daily Langame sync и любые unattended worker/replay paths;
- guest foundation sync (`/integrations/langame/guests/foundation/*`);
- generic sync без persisted exact Store binding, provider writes и auto-import
  всех доступных clubs;
- перенос INTERNAL permits, timers или credentials во внешний tenant.

После успешного settings-save Web в рамках того же пользовательского действия
запускает `BACKFILL` с `trigger=MANUAL`. Этот первичный импорт использует только
что сохранённые exact Store bindings; он не является unattended job. Ошибка
импорта не откатывает уже подтверждённое подключение: UI сообщает, что
настройки сохранены, и предлагает повторить синхронизацию. Guest foundation,
scheduler и background jobs при этом не запускаются. Наличие source migration,
зелёного CI или UI не является production activation.

## Schema и rollout

Canonical schema target — `CURRENT_191`, `migrationCount=191`, latest
`20260908180000_external_langame_simple_onboarding`. Единственный допустимый
переход от admitted `CURRENT_190/190` выполняет exact external-Langame
`CURRENT191` signed schema controller:
`packages/database/scripts/external-langame-current191-production-upgrade.cli.mjs`.
Его signed plan связывает один release SHA, source `190`, target `191`,
migration head/count и оба slot receipts; shell, ручной Prisma apply или иной
controller не являются заменой. Поддерживаемая последовательность CLI —
`inventory → plan → approve → apply → check`; применяемый plan должен быть
подтверждён своим exact SHA-256 и отдельным Ed25519 approval.
Перед production plan тот же controller обязательно запускается в режиме
`rehearse --target restored-copy` на изолированной восстановленной копии. Этот
режим отвергает production database name, стандартный port/socket и не принимает
production approval как основание для эффекта.

До database effect blue и green обязаны работать как dual-target candidate
одного exact `CURRENT_191` release с
`GUEST_SUPPORT_SCHEMA_BRIDGE_MODE=ALLOW_CURRENT_190`, `COMBINED` runtime и
`GUEST_BUG_REPORTING_MODE=OFF`. Этот bridge допускает только exact пару
`CURRENT_190 → CURRENT_191`; он не является общим N/N+1 режимом и не разрешает
external onboarding на schema ниже `CURRENT_191`.

После dual-target readiness signed controller применяет migration
транзакционно. Частичный apply, другой head/count, потерянная signature,
несовпавший slot receipt или незавершённая migration останавливают rollout до
effect. Только после committed schema `CURRENT_191/191` bridge выключается
контролируемо по одному слоту: сначала inactive slot переводится в
`GUEST_SUPPORT_SCHEMA_BRIDGE_MODE=OFF`, проверяется и становится active, затем
бывший active/текущий rollback slot переводится в `OFF` и отдельно проверяется.
Final postcheck допускается лишь когда оба exact slot receipts подтверждают
`CURRENT_191/191` и `OFF`. Нельзя оставить bridge включённым на active или
rollback slot.

Перед production activation обязательны exact artifact/SHA, backup и
restored-copy rehearsal, migration admission, loopback/public smoke, controlled
rollout и отдельное `GO`. При любой несовместимости schema, bridge, scope или
identity binding маршрут fail-closed; previous admitted slot остаётся rollback
целью.
