# CURRENT_187 → CURRENT_188 legacy mixed-owner controller

Статус: **production candidate; effect только после exact-SHA admission и
отдельного GO**

Актуально на: **29.08.2026**

## Почему нужен отдельный controller

Фактическая production-база имеет историческую mixed-owner topology: часть
объектов схемы public принадлежит роли приложения, часть — postgres. Функция
identity_mail_delivery_worker_assert_v1(TEXT) также принадлежит postgres.
Обычный CURRENT_188 controller правильно блокирует такую базу, потому что его
контракт рассчитан на единый migration owner.

Этот одноразовый controller допускает только фактически наблюдаемое состояние
187 applied / 4 rolled back / 0 unfinished и только миграцию
20260828190000_guest_support_bug_reports с SHA-256
c40d5eeb84cc980053af48b56385bf48882ee355aec718a442dab855ea33eb9b.
Он не нормализует владельцев и не является универсальным privileged migration
runner.

## Fail-closed контракт

- admitted release SHA, архив, materialized tree, PostgreSQL system identifier,
  database/host/port и OID/attributes всех значимых ролей входят в manifest;
- source snapshot закрепляет пообъектный digest всех исторических
  class/proc/type: kind, OID, name/signature, owner name/OID и raw ACL;
- role memberships и активные database identities также закрепляются exact
  digest/list;
- plan строится только против `DUAL_BRIDGE_N_MINUS_ONE` topology. Active и
  rollback slot должны быть независимо аттестованы как target-188 release
  artifacts и одновременно показывать exact CURRENT_187 compatibility:
  COMBINED + GUEST_BUG_REPORTING_MODE=OFF +
  GUEST_SUPPORT_SCHEMA_BRIDGE_MODE=ALLOW_CURRENT_187;
- signed bridge section закрепляет для обоих slot release/hydration/slot-link
  authority, systemd invocation, loopback authenticated reads и source
  readiness, а также exact checksum `c40d5eeb…` target migration bytes; active
  slot дополнительно обязан совпадать с установленной production-control
  generation этого же SHA;
- plan подписывается detached Ed25519 ключом, а SPKI SHA-256 передаётся
  независимым protected pin;
- root-owned blue/green lock и PostgreSQL advisory lock удерживаются от live
  сверки до final postcheck;
- `/run/leetplus-production-control/install.lock` берётся вместе с blue/green
  lock и удерживается до проверки обоих slot после effect; control generation,
  verifier и unit bytes нельзя заменить внутри подписанного окна DDL;
- signed runtime-safety section закрепляет SHA-256 active API unit template,
  canary worker-off environment, immutable legacy-drain activation receipt,
  verifier и полный systemd unit inventory. Эти доказательства повторно
  снимаются под blue/green lock непосредственно перед DDL и входят в digest
  подписанного плана;
- migration выполняется локально через Unix socket от OS/database identity
  postgres; manifest закрепляет socket directory, порт и PostgreSQL system
  identifier, а тот же psql session сверяет их до начала DDL. Пароль
  суперпользователя не создаётся и не передаётся;
- privileged executor не принимает произвольный Prisma CLI или команду. Он
  исполняет только единственный встроенный checksum-pinned SQL body миграции
  и сам атомарно записывает exact Prisma migration receipt. Запрещены
  ALTER OWNER, REASSIGN OWNED, ALTER DEFAULT PRIVILEGES и любые другие
  изменения исторической topology;
- materialized lane обязан называться по tree digest, до privileged execution
  принадлежать root и не быть writable для group/other; executor переводит
  его в root:postgres 0550/0440, оставляя postgres только право чтения;
- psql запускается в transient systemd cgroup с RuntimeMaxSec, KillMode=
  control-group и сетевым запретом. При timeout/overflow контроллер убивает
  весь cgroup, подтверждает его пустоту и только затем возвращает результат;
- exact catalog postcheck закрепляет не только имена, но и типы/defaults
  колонок, определения/флаги индексов и constraints, а также security,
  language, return type, config, volatility, strict/leakproof/parallel
  свойства изменённой worker function. Канонический PostgreSQL 16 catalog
  digest: `3aeb4f73b99b849ff90dccb27600fb0b2d9ab17d75e7c33afd05d179ddf18d88`;
- body и comment identity-mail readiness function обязаны точно перейти с
  CURRENT_187 на CURRENT_188, сохранив OID, owner и отсутствие PUBLIC EXECUTE;
- intent/response каждой effect-фазы попадает в exclusive fsynced JSONL
  journal.

## Единственные допустимые состояния

1. SOURCE_187 — целевой migration row и support-объекты отсутствуют.
2. MIGRATED_188_NO_RUNTIME_ACL — миграция полностью закончена, catalog exact,
   новые enum ещё имеют только ожидаемый default PUBLIC USAGE, а runtime grants
   отсутствуют.
3. FINAL_188_EXACT_ACL — migration/catalog/function/ownership exact, PUBLIC
   grants отсутствуют, runtime имеет только указанную ниже матрицу.

Unfinished Prisma row, лишний support object, частичный ACL, owner/OID/role
drift или иной catalog delta дают BLOCKED_MANUAL.

## Минимальный runtime ACL

| Объект                       | Прямые права переходной роли leetplus_runtime |
| ---------------------------- | --------------------------------------------- |
| GuestSupportTicket           | SELECT, INSERT, UPDATE                        |
| GuestSupportAttachment       | SELECT, INSERT                                |
| GuestSupportTicketComment    | SELECT, INSERT                                |
| GuestSupportTicketAuditEvent | SELECT, INSERT                                |
| GuestSupportAttachmentState  | USAGE                                         |
| GuestSupportTicketStatus     | USAGE                                         |

ACL-фаза выполняется одной транзакцией. Сначала отзываются все права PUBLIC и
старые прямые права runtime на новых объектах, затем выдаётся только эта
матрица. DELETE, TRUNCATE, REFERENCES, TRIGGER, schema CREATE, ownership,
membership и worker-function EXECUTE не выдаются.

Это временный COMBINED ACL. Он не переносится автоматически на будущие
раздельные guest/corporate database roles.

## Recovery

Обычное effect-окно плана не превышает часа. Подписанный manifest отдельно
задаёт bounded recovery window не более 24 часов:

- из exact SOURCE_187 после окончания effect-окна новый effect запрещён;
- из exact MIGRATED_188_NO_RUNTIME_ACL можно завершить только ACL-фазу;
- из exact FINAL_188_EXACT_ACL повторный apply возвращает zero-effect recovered
  success;
- неоднозначный ответ допускает не более одного повтора и только после новой
  exact inspection.

Таким образом, уже совершившаяся migration не требует создавать новую
неподписанную authority для восстановления.

## Порядок production rollout

1. Fast CI и Full Release Admission должны быть зелёными на новом exact SHA.
2. Этот же SHA сначала запускается и атомарно становится active bridge runtime
   при CURRENT_187, reporting OFF. Второй slot также переводится на independently
   bound target-188 artifact и проходит тот же compatibility/authenticated
   smoke; старый CURRENT_187 artifact перестаёт быть rollback authority до DDL.
3. Ручные old-SHA leetplus-user-call-\* sidecar units выводятся из routing,
   останавливаются, disable/remove; USER_CALL остаётся на admitted main slot.
4. Identity-mail, guest-game-bot и остальные delivery/scheduler workers
   drained, disabled/start-fenced; active worker sessions отсутствуют.
5. Выполняются inventory → plan → approve → apply → check с contract
   `FOUNDER_PILOT_CURRENT188_LEGACY_MIXED_OWNERSHIP_V2` и confirmation
   `I_ACCEPT_CURRENT188_LEGACY_MIXED_OWNERSHIP_V2`.
6. Сразу перед DDL controller повторно сверяет оба slot; после DDL оба обязаны
   показать exact 188/188 без active compatibility evidence. Только затем
   reporting переводится в LIVE, выполняются negative/guest/tenant/platform QA
   и atomic cutover готового runtime.

После schema effect rollback target — заранее проверенный CURRENT_188 rollback
bridge slot. Старый CURRENT_187 runtime возвращать нельзя. Операционный kill
switch — GUEST_BUG_REPORTING_MODE=OFF; schema rollback не выполняется.

## Команды и admission

    node packages/database/scripts/founder-pilot-current188-legacy-ownership-upgrade.cli.mjs --help
    pnpm --filter database check:founder-pilot-current188-legacy-ownership-upgrade
    pnpm --filter database test:integration:founder-pilot-current188-legacy-ownership-upgrade:pg

CLI поддерживает inventory, plan, approve, apply, check. Manifest, plan,
approval, private key и journal находятся в root-controlled каталоге вне
checkout/release. Production apply дополнительно требует exact confirmation и
independent SPKI pin. Full Release Admission выполняет PostgreSQL 16 проверку
в двух независимых вариантах: полный mixed-owner CURRENT_187 catalog/ACL
fixture и isolated host cluster, на котором root запускает именно production
systemd/psql executor. Оба варианта проверяют migration, минимальный ACL,
semantic catalog postcheck, replay и cleanup disposable database/roles;
production-executor gate дополнительно подтверждает exact Unix socket/port/
system identifier и отсутствие потомков transient cgroup.
