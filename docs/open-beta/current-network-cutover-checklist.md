# Cutover-чеклист текущей сети: один Tenant, четыре Store

| Поле            | Значение                                           |
| --------------- | -------------------------------------------------- |
| Статус          | Template; execution prohibited without explicit GO |
| Топология       | 1 operational Tenant / 4 Store                     |
| Метод           | In-place, без смены `tenantId`                     |
| External access | Запрещён до успешного Gate 2                       |

Реальные ID, email, домены интеграций, токены и database URLs в этот файл не
вносятся. Для них используется защищённая операционная запись; здесь
сохраняются alias, checksum, counts и ссылка на неё.

## A. Release identity и authority

- [ ] Candidate branch clean.
- [ ] Full candidate SHA:
- [ ] `origin/main` relation зафиксирован:
- [ ] Migration revision/count:
- [ ] API/web/edge показывают тот же SHA/build time.
- [ ] Required CI checks зелёные.
- [ ] Release decision owner и change window назначены.

## B. Topology manifest

- [ ] Protected operational record reference:
- [ ] Tenant alias/fingerprint:
- [ ] Store count равен `4`.
- [ ] Store aliases/fingerprints и Langame mapping checksums зафиксированы.
- [ ] Все четыре Store принадлежат одному ожидаемому Tenant.
- [ ] У всех четырёх Store задан и проверен валидный IANA `timeZone`; UTC
      fallback отсутствует в принятом recurring schedule.
- [ ] Cross-tenant `UserStoreAccess` count равен `0`.
- [ ] Staff task integrity inventory выполнен на восстановленном snapshot:
      `blockingTotal=0`; каждый review reason code имеет owner/решение.
- [ ] Template/Rule/Task/Run inventory evidence содержит только aggregate
      counts и alias `Tenant A / Store A1..A4`, без production ID.
- [ ] Public/QR/Telegram links проинвентаризированы.
- [ ] План slug/domain rename и redirect/alias утверждён.

## C. Operational demo separation

- [ ] Anonymous operational B2B endpoints отвечают `401`.
- [ ] Fixed fallback на operational `demo` отсутствует.
- [ ] Если нужен public demo, он создан отдельно как synthetic tenant.
- [ ] Public demo не содержит PII, integration IDs, real revenue/cost/stock.
- [ ] Heavy public projections имеют pagination/rate limit.

## D. Users, roles и invitations

- [ ] Active/inactive user counts по role сохранены.
- [ ] Каждый active user классифицирован как `NETWORK` или непустой `STORES`.
- [ ] Unresolved active users count равен `0`.
- [ ] NETWORK users утверждены OWNER.
- [ ] Club managers имеют только ожидаемые Store.
- [ ] Platform Admin среди tenant users отсутствует.
- [ ] Pending invites классифицированы либо отозваны.
- [ ] Legacy/known QA credentials отозваны; sessions rotated/revoked.
- [ ] OWNER, network manager, club manager и employee acceptance пройдены.

## E. Data и integrations

- [ ] Backup непосредственно перед изменением успешен.
- [ ] Restore rehearsal в отдельную БД успешен; RPO/RTO записаны.
- [ ] Schema-only EXPAND rehearsal успешен с timeout/lock evidence.
- [ ] Same-tenant StaffTask catalog constraints вводятся только после
      zero-blocking inventory и отдельного reconciliation dry-run.
- [ ] Физическое удаление Store блокируется при store-bound
      Task/Template/Rule; штатный путь — deactivate/archive.
- [ ] `_prisma_migrations` без pending/failed/unfinished rows.
- [ ] Langame domains и четыре store mappings сверены.
- [ ] Initial sync/backfill и freshness checks готовы.
- [ ] SKU, stock, operations и revenue control totals сохранены.
- [ ] Guest identity/reward/ledger reconciliation не имеет unresolved P0.

## F. Module acceptance

- [ ] `OPEN_BETA_FULL_OPERATIONS_V1` подготовлен.
- [ ] Gamification — admin, guest, Telegram, ledger и store canary.
- [ ] Assortment — catalog, facts, imports, reports и exports, 4/4 stores.
- [ ] Staff — control, tasks, regulations, KB, training, discipline, salary.
- [ ] Staff recurring actor path — sparse PATCH, Store timezone, pause/revoke и
      Template/Store/participant race acceptance пройдены; background выключен.
- [ ] Staff recurring legacy integrity — scanner exit `0`,
      `blockingTotal=0`, review findings приняты; stale `STARTED` и
      repeated-`FAILED` разобраны.
- [ ] Communications — chat, mentions, receipts, notifications, contact tasks.
- [ ] Users/roles — delegation, revoke и scope работают сразу.
- [ ] Attachments `ENFORCED`; inventory/backfill/reconciliation zero-diff.
- [ ] Marketing/full CRM/billing/public registration deny проверен.

## G. Operations

- [ ] `/health/live`, `/health/ready`, `/version` проверены внешним probe.
- [ ] Scheduler owner единственный; heartbeat/reclaim проверены.
- [ ] Langame timeout/retry/reconciliation envelope включён.
- [ ] Structured logs/request ID/tenant/source/SHA доступны оператору.
- [ ] Alerts дошли ответственному тестовым событием.
- [ ] N-1 либо fix-forward strategy доказана.
- [ ] Failed-readiness rollback drill успешен.
- [ ] Support owner, incident channel и on-call contacts назначены вне git.

## H. Dry-run и cutover

- [ ] Dry-run не изменил production state.
- [ ] Контрольные counts/checksums до cutover сохранены.
- [ ] Application writes/jobs остановлены либо совместимы с фазой.
- [ ] Schema EXPAND применена и проверена.
- [ ] Accounts/invites классифицированы.
- [ ] Strict application candidate активирован по плану.
- [ ] Модули переведены `SHADOW → ENFORCED` только при zero mismatch.
- [ ] Operational tenant переименован без смены `tenantId`.
- [ ] Public links/QR/Telegram проверены после rename.
- [ ] Контрольные counts/totals после cutover совпадают.
- [ ] Post-deploy browser/API/file/job smoke зелёный.

## I. Internal alpha и решение о внешнем pilot

- [ ] Семь последовательных дней без launch-blocking P0/P1 incident.
- [ ] Нет cross-tenant/store/PII incident.
- [ ] Scheduled sync success ≥98%, freshness ≤24h.
- [ ] Revenue/operations divergence ≤1% либо исключение утверждено.
- [ ] Нет lost sync, duplicate reward или unresolved critical alert.
- [ ] Feedback и incidents привязаны к release SHA.
- [ ] Итоговое решение `GO/NO-GO`, дата и approver сохранены в release evidence.

## Stop conditions

Cutover немедленно останавливается при cross-scope выдаче, unknown active scope,
несовпадении tenant/store topology, повреждении totals, failed backup/restore,
неожиданном migration lock, недоступном rollback, attachment mismatch,
необъяснимом reward/ledger расхождении или недоставленном critical alert.
