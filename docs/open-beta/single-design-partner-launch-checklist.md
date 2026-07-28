# Optional isolation launch checklist: `SINGLE_DESIGN_PARTNER_V1`

| Поле        | Значение                                                      |
| ----------- | ------------------------------------------------------------- |
| Версия      | 1.4                                                           |
| Дата        | 28.07.2026                                                    |
| Статус      | `NO-GO`; checklist не выполнен                                |
| Область     | Contingency/enterprise isolation, Tenant D/Store D1           |
| Не меняется | Current production Tenant A с четырьмя Store A1..A4           |
| Решение     | Отдельный `DESIGN_PARTNER GO` после всех обязательных пунктов |

Этот checklist является исполнимым дополнением к
[профилю доступа](./single-design-partner-access-profile.md) и Gate 1DP из
[`OPEN_BETA_BACKLOG.md`](../../OPEN_BETA_BACKLOG.md). Галочки в документе не
заменяют protected evidence и approval.

Эта lane не является основным путём первого внешнего теста и не имеет
назначенного календарного окна. Любой failed check сохраняет `NO-GO`;
Gate 1DP не заменяет Gate 1MT/Gate 2 shared beta.

Текущая граница реализации:

- `IMPLEMENTED_CANDIDATE`: `status`, fail-closed `provision` в пустую отдельную
  БД, idempotent `rotate-invite` и emergency `suspend`;
- `IMPLEMENTED_CANDIDATE`: API startup-проверка обязательного isolated overlay
  и database topology, запрет generic Platform Admin activation для
  provisioned DP tenant;
- `NOT IMPLEMENTED`: persisted stage/cohort/surface entitlements, authoritative
  expiry, reviewed activation flow, session revoke и развёрнутый isolated
  runtime;
- следствие: invitation URL пока нельзя передавать клубу, а credentials
  остаются `NO-GO`.

## A. Scope, owners и topology

- [ ] Named partner, legal/data owner, primary/backup support и engineering
      owner назначены.
- [ ] Срок доступа, active test windows, retention и offboarding условия
      согласованы.
- [ ] Protected topology record подтверждает:

  ```text
  current production = Tenant A / Store A1..A4
  isolated partner = Tenant D / Store D1
  ```

- [ ] Tenant A и A1..A4 не копируются, не переносятся и не доступны partner
      environment.
- [ ] D1 не добавлен и не может быть добавлен в Tenant A.
- [ ] В git/evidence нет production ID, email, phone, database URL, token,
      secret или raw export.
- [ ] У партнёра нет конфликтующего user email другого tenant; иначе
      onboarding остановлен.

## B. Physical environment isolation

- [ ] Partner web развёрнут отдельным process/service и endpoint.
- [ ] Partner API развёрнут отдельным process/service и endpoint.
- [ ] Создан отдельный PostgreSQL database/cluster.
- [ ] Migration/provisioning identity отделена от runtime identity: первая
      временно имеет только необходимые DDL/provisioning права и не
      используется приложением.
- [ ] Runtime PostgreSQL role не является owner/superuser, имеет `NOINHERIT`,
      не имеет `CREATE`, DDL, role membership или grant option; exact grants
      зафиксированы evidence по
      [runtime-role contract](./design-partner-database-role-contract.md);
      synthetic CI smoke не заменяет проверку фактической deployment-role.
- [ ] Control-plane grants запечатаны: runtime не меняет Tenant lifecycle,
      provisioning/rotation/suspend receipt или bootstrap OWNER override;
      receipt audit append-only, signed invite token hash immutable, expiry
      может только сокращаться, acceptance выполняется CAS. Broad
      all-application-table DML baseline не принимается как Gate evidence.
- [ ] Созданы отдельные JWT, invite, PII, HMAC, encryption, integration и
      scheduler secrets без production fallback.
- [ ] Partner runtime не содержит production database URL/service token и не
      имеет network route к production PostgreSQL.
- [ ] Storage использует отдельный namespace и credentials; если нет —
      attachments entitlement `OFF`.
- [ ] Egress allowlist пуст либо содержит только явно одобренные partner
      endpoints.
- [ ] Schedulers, all-tenant routes, queue consumers и recurring background
      execution не зарегистрированы либо технически disabled.
- [ ] Bot consumer, Telegram edge adapter и Telegram poller имеют отдельные
      enable-флаги `false`; poller имеет
      `GUEST_GAME_TG_EDGE_POLLING_DELETE_WEBHOOK_ON_START=false`.
- [ ] Любое отдельное включение этих процессов требует dry-run и exact
      `https://api-<tenant-slug>.leetplus.ru`; fallback
      `https://api.leetplus.ru` блокируется до startup.
- [ ] Langame/reward/Telegram/SMS/MAX и любой другой outbound mode равен `OFF`.
- [ ] Restart/redeploy smoke подтверждает, что fail-closed defaults не
      изменились.

## C. Candidate, CI и recovery evidence

- [ ] Exact candidate SHA принят review и доступен через `/version`.
- [ ] Frozen install, Prisma validate/generate, API tests/typecheck/build, web
      lint/typecheck/build и migration checks зелёные.
- [ ] Все migrations применены с нуля на ephemeral PostgreSQL.
- [ ] Production-like checks, необходимые exact candidate, используют
      approved authority; synthetic fixture/HMAC не выданы за authorization.
- [ ] `/health/live`, `/health/ready`, web login и version probe зелёные.
- [ ] Anonymous operational B2B routes отвечают `401`.
- [ ] Isolated encrypted backup создан и восстановлен в отдельную test DB.
- [ ] N-1 compatibility либо fix-forward procedure подтверждены.
- [ ] Failed-readiness/application rollback drill пройден.
- [ ] Structured logs содержат request ID, environment alias, tenant alias и
      SHA, но не PII/secrets.
- [ ] Critical test alert доставлен primary и backup owner.

## D. Provisioning и identity

- [ ] Profile `SINGLE_DESIGN_PARTNER_V1` сохранён с revision, reason, start,
      expiry и audit.
- [ ] Idempotent provisioning создал ровно один Tenant D.
- [ ] В Tenant D создан ровно один Store D1.
- [ ] Повтор provisioning не создаёт дубль tenant/store/invite.
- [ ] OWNER invite email-bound, opaque, TTL-bound и хранится только как hash.
- [ ] OWNER получил `NETWORK` только внутри Tenant D.
- [ ] Club actor, если нужен, получил только `STORES[D1]`.
- [ ] Platform Admin не назначается через tenant API/UI.
- [ ] Revoke/expire invite и accept race проверены.
- [ ] Real-PostgreSQL bridge создаёт candidate штатным provisioning workflow и
      на той же неизменённой БД успешно запускает API database admission; два
      независимых hand-written fixtures не засчитываются.
- [ ] Stale token после role/scope/suspend не сохраняет прежние полномочия.
- [ ] `TenantExecutionPolicy` останавливает login, writes, exports и jobs при
      `Tenant D → SUSPENDED`.

### D.1. Точные команды implementation candidate

Сначала скопировать
[`design-partner-manifest.example.json`](../../packages/database/scripts/design-partner-manifest.example.json)
за пределы git и заполнить реальными данными клуба в защищённом месте.
`DATABASE_URL`, manifest и вывод с invite URL не сохранять в shell history,
ticket, CI log или репозиторий.
`DATABASE_URL` здесь принадлежит только migration/provisioning identity.
`DESIGN_PARTNER_MANIFEST_HMAC_KEY` загружается из отдельного secret manager,
не передаётся runtime-процессам и не сохраняется рядом с manifest.
Digest связывает manifest с provisioning evidence и обнаруживает дрейф, но сам
по себе не является `DESIGN_PARTNER GO` или разрешением на activation.
Отдельный HMAC receipt связывает Tenant, Store, invite ID, hash токена и
исходный TTL. Ранний revoke может только сократить TTL; подмена hash либо
продление TTL блокируют следующий status/rotate admission. Rotation receipt
дополнительно связывает уникальный operation ID. API и standalone-процессы
fail-closed отклоняют наличие provisioning HMAC key в runtime environment.

```powershell
$manifestPath = 'C:\secure\leetplus\design-partner-manifest.json'
$env:DATABASE_URL = '<isolated provisioning PostgreSQL URL>'
$env:DESIGN_PARTNER_MANIFEST_HMAC_KEY = '<load from protected secret manager>'

pnpm --filter database design-partner:provision -- status --manifest $manifestPath
```

`status` должен вернуть `READY_TO_PROVISION`, `emptyTenantDatabase=true` и
`initialTenantStatus=SUSPENDED`. Это подтверждает только пустую БД, но не
физическую изоляцию; отдельный infrastructure evidence остаётся обязательным.

Provision выполняется только непосредственно перед контролируемым onboarding
окном. Перед командой API и standalone-процессы этого контура остановлены;
после команды обязателен restart с isolated overlay и повторный
readiness/database-admission smoke. Непосредственно перед restart оператор
повторяет HMAC-authenticated `status`; runtime startup без provisioning key
дополнительно проверяет exact receipt IDs, SHA-256 shapes и запрет продления
signed expiry. Audit/invite columns должны быть недоступны для ручного
изменения runtime-ролью вне штатных application paths. Это закрывает окно между
проверкой пустой БД и уже запущенным обычным API. Invite URL выводится один раз,
а TTL равен минимуму из 72 часов и `accessExpiresAt`.

Все пары `KEY=value` из
[`design-partner-runtime.env.example`](./design-partner-runtime.env.example)
должны быть экспортированы в process environment CLI и будущего API. Ниже
`<tenant-slug>` — exact slug из manifest:

```powershell
$env:WEB_URL = 'https://<tenant-slug>.leetplus.ru'
$env:DESIGN_PARTNER_CONFIRMATION = 'PROVISION <tenant-slug>'

pnpm --filter database design-partner:provision -- provision --manifest $manifestPath

Remove-Item Env:DESIGN_PARTNER_CONFIRMATION
Remove-Item Env:DESIGN_PARTNER_MANIFEST_HMAC_KEY
Remove-Item Env:DATABASE_URL
Remove-Item Env:WEB_URL
```

API не запускается из этого operator shell. Service manager создаёт чистый
process environment и отдельно inject-ит restricted runtime `DATABASE_URL`;
migration/provisioning URL и manifest HMAC key в API environment запрещены.

Ожидаемый результат — `PROVISIONED_SUSPENDED`: Tenant `SUSPENDED`, Store
inactive, gamification `false`, integrations отсутствуют. Пока tenant
`SUSPENDED`, API не разрешает принять invite. CLI намеренно не содержит
`activate`; generic Platform Admin activation для provisioning marker также
запрещена. Не передавать URL партнёру до отдельного reviewed activation flow и
раздела H.

Потерянная или истёкшая ссылка восстанавливается без ручного SQL. Новый
operation ID создаётся один раз на операторскую операцию и делает повтор
идемпотентным; повтор с тем же ID не инвалидирует уже выданную новую ссылку:

```powershell
$env:DATABASE_URL = '<isolated provisioning PostgreSQL URL>'
$env:DESIGN_PARTNER_MANIFEST_HMAC_KEY = '<load from protected secret manager>'
$env:WEB_URL = 'https://<tenant-slug>.leetplus.ru'
$env:DESIGN_PARTNER_ROTATION_REQUEST_ID = '<new opaque operation id>'
$env:DESIGN_PARTNER_OPERATION_REASON = '<why this invitation is rotated>'
$env:DESIGN_PARTNER_OPERATION_TICKET = '<protected operation/ticket reference>'
$env:DESIGN_PARTNER_CONFIRMATION = 'ROTATE_INVITE <tenant-slug>'

pnpm --filter database design-partner:provision -- rotate-invite --manifest $manifestPath

Remove-Item Env:DESIGN_PARTNER_CONFIRMATION
Remove-Item Env:DESIGN_PARTNER_ROTATION_REQUEST_ID
Remove-Item Env:DESIGN_PARTNER_OPERATION_REASON
Remove-Item Env:DESIGN_PARTNER_OPERATION_TICKET
Remove-Item Env:DESIGN_PARTNER_MANIFEST_HMAC_KEY
Remove-Item Env:DATABASE_URL
Remove-Item Env:WEB_URL
```

Результат первой операции — `INVITE_ROTATED` с one-time URL. Повтор того же
request ID возвращает `INVITE_ROTATION_ALREADY_APPLIED` без URL и без создания
нового invite. Причина и ticket относятся к текущей операции и не изменяют
подписанный исходный manifest.

Обязательный runtime overlay:
[`design-partner-runtime.env.example`](./design-partner-runtime.env.example).
Он добавляется к обычной production-конфигурации отдельного контура и
проверяется API startup при `DESIGN_PARTNER_ISOLATED_MODE=true`. Startup
разрешает только пустую tenant DB до provisioning либо один exact
`SUSPENDED` Tenant с одним inactive Store и provisioning marker. Наличие файла
не заменяет проверку DNS, process, database role, network route и secrets.

Emergency DB stop допускает истёкший manifest:

```powershell
$env:DATABASE_URL = '<isolated provisioning PostgreSQL URL>'
$env:DESIGN_PARTNER_MANIFEST_HMAC_KEY = '<load from protected secret manager>'
$env:DESIGN_PARTNER_OPERATION_REASON = '<incident or controlled stop reason>'
$env:DESIGN_PARTNER_OPERATION_TICKET = '<protected incident/ticket reference>'
$env:DESIGN_PARTNER_CONFIRMATION = 'SUSPEND <tenant-slug>'

pnpm --filter database design-partner:provision -- suspend --manifest $manifestPath

Remove-Item Env:DESIGN_PARTNER_CONFIRMATION
Remove-Item Env:DESIGN_PARTNER_OPERATION_REASON
Remove-Item Env:DESIGN_PARTNER_OPERATION_TICKET
Remove-Item Env:DESIGN_PARTNER_MANIFEST_HMAC_KEY
Remove-Item Env:DATABASE_URL
```

Команда выключает Tenant, все Store, active integration source/credential и
pending invites. Она не является полной stop sequence: процессы/jobs нужно
остановить отдельно, active sessions отозвать, затем подтвердить control smoke
и сохранить evidence.

## E. Isolation и first coherent slice

- [ ] Ephemeral fixture содержит два независимых tenant и минимум два Store;
      production Tenant A не используется как test fixture.
- [ ] Cross-tenant/store negative tests зелёные для list, detail, aggregate,
      mutation, export, file, BFF, SSE и job применительно к включённым
      surfaces.
- [ ] Forbidden Store filter даёт `403`, hidden/cross-tenant UUID — `404`.
- [ ] Missing/unknown scope, `STORES[]`, contradictory и cross-tenant access
      rows fail-closed.
- [ ] Actor не может выдать роль/capability/scope шире собственного.
- [ ] DP-S0: login, users/roles, Store D1, support и feedback приняты.
- [ ] Все обязательные начальные slices `DP-S1..DP-S4` — ассортимент целиком,
      сотрудники целиком, in-app коммуникации и геймификация — имеют:
  - [ ] exact route/action/job/file inventory;
  - [ ] entitlement, capability, resource class, PII и audit owner;
  - [ ] status `VERIFIED`, runtime `ENFORCED`;
  - [ ] accepted CI/PG/browser evidence SHA;
  - [ ] отдельные read/write/outbound modes;
  - [ ] проверенный module kill switch.
- [ ] Не входящие в `DP-S0..DP-S4` navigation/API/BFF/job paths скрыты и deny
      fail-closed.
- [ ] `SHADOW` не используется как partner authorization.
- [ ] Staff recurring scheduler и all-tenant execution остаются `OFF`.
- [ ] Reward/Langame/Telegram outbound остаются `OFF`.

## F. Feedback, support и incident readiness

- [ ] Partner знает support channel, active test window и emergency contact.
- [ ] Feedback form/channel сохраняет category, severity, role, route, request
      ID и SHA без auto-PII.
- [ ] Screenshot только opt-in.
- [ ] Workflow
      `NEW → TRIAGED → ACCEPTED/DECLINED → PLANNED → FIXED → VERIFIED → CLOSED`
      доступен owners.
- [ ] Daily active-window triage и weekly product review запланированы.
- [ ] `SEV0` и `SEV1` templates проверены тестовым incident.
- [ ] Critical acknowledgement target зафиксирован: 30 минут в active window,
      2 рабочих часа вне него.
- [ ] Partner notification, status update и closure templates готовы.
- [ ] Каждый incident/fix/retest будет привязан к exact SHA.

## G. Kill-switch и rollback drill

- [ ] `outbound OFF` выполняется без deploy.
- [ ] Module write entitlement переводится в `OFF` без deploy.
- [ ] Partner jobs/processes можно остановить отдельно от production.
- [ ] Pending invites и active sessions отзываются.
- [ ] Tenant D переводится в `SUSPENDED`.
- [ ] Control smoke подтверждает, что Tenant A/A1..A4 не изменились.
- [ ] Audit/evidence сохраняются после application rollback.
- [ ] Destructive down migration отсутствует в процедуре.
- [ ] Restore выполняется только по отдельному incident decision.
- [ ] Owner и фактическое recovery time записаны.

Обязательный stop sequence:

```text
outbound OFF
  → module writes OFF
  → jobs/processes stop
  → sessions/invites revoke
  → Tenant D SUSPENDED
  → evidence capture
  → rollback or fix-forward
```

## H. `DESIGN_PARTNER GO`

- [ ] Разделы A–G завершены без accepted security exception.
- [ ] Нет открытого cross-tenant/store/PII или data-integrity finding.
- [ ] Нет недоступного kill switch, backup, restore или rollback.
- [ ] Protected GO record содержит:
  - [ ] environment identity и exact release SHA;
  - [ ] Tenant D/Store D1 aliases;
  - [ ] profile/entitlement revision;
  - [ ] полный список активных surfaces и modes;
  - [ ] start/expiry и active test window;
  - [ ] partner, support, engineering и rollback owners;
  - [ ] evidence references;
  - [ ] approver, decision time и stop conditions.
- [ ] Отдельный approver принял `DESIGN_PARTNER GO`.

До последней галочки credentials не выдаются.

## I. Day-0 activation

- [ ] Credentials переданы только согласованному OWNER безопасным каналом.
- [ ] OWNER принял invite и сменил initial credential, если применимо.
- [ ] Login показывает только Tenant D/Store D1.
- [ ] Deep links и stale client state не открывают выключенные surfaces.
- [ ] Первый accepted module workflow пройден вместе с partner.
- [ ] Feedback с day-0 route/request ID/SHA получен и закрыт.
- [ ] Outbound и schedulers повторно подтверждены как `OFF`.
- [ ] Kill-switch smoke выполнен без потери partner data.
- [ ] Day-0 evidence принято owner.

## J. Progressive activation

Для каждой следующей surface создаётся отдельная запись:

```text
surface:
release_sha:
evidence_ref:
adoption_status: VERIFIED
runtime_mode: ENFORCED
read_mode:
write_mode:
outbound_mode: OFF
entitlement_revision:
canary_window:
kill_switch_verified:
owner:
approver:
decision: GO | NO-GO
```

- [ ] Surface не активируется пакетно вместе с несвязанными surfaces.
- [ ] Новый deploy не включает entitlement автоматически.
- [ ] Write mode получает отдельный `GO` после read acceptance.
- [ ] Outbound mode получает отдельный store-level canary, reconciliation и
      `OUTBOUND GO`.
- [ ] Любой failed check возвращает surface в `OFF`, не расширяя другие.

## K. Stop, offboarding и promotion

Немедленно выполнить stop sequence при:

- cross-tenant/store/PII reveal;
- scope или entitlement bypass;
- доступе к surface ниже `VERIFIED + ENFORCED`;
- связи с production Tenant A;
- неожиданном scheduler/outbound execution;
- lost/duplicate reward или data corruption;
- failed alert, suspend, revoke, backup или rollback;
- SHA/schema/readiness mismatch.

По завершении выбрать одно решение:

- [ ] `EXTEND`: новая expiry, тот же один partner и отдельный approval;
- [ ] `SUSPEND`: доступ остановлен до нового GO;
- [ ] `OFFBOARD`: sessions/invites revoked, integrations off, export/retention
      выполнены;
- [ ] `PROMOTE`: только после Gate 2, с новой entitlement revision и новым
      cohort measurement window.

DP-1 не закрывает Gate 2/Gate 3, не заменяет internal alpha Tenant A/A1..A4 и
не разрешает подключение второго внешнего клуба.
