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
- [ ] EXPAND revision/count: `162`, latest —
      `20260727131000_staff_task_integrity_expand`; final cutover count/revision
      обновлены после отдельного VALIDATE/CONTRACT.
- [ ] EXPAND source checkpoint:
      `dc26568d94d76b886f1d1b79c36b1bd9f00ac401` — не production deployment.
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
- [ ] Все пять StaffTask parent indexes существуют в ожидаемой schema,
      unique/valid/ready и имеют точный порядок `(tenantId, id)`.
- [ ] Все 14 same-tenant StaffTask catalog FK присутствуют как `NOT VALID` и
      уже отклоняют новые invalid writes.
- [ ] Одиннадцать paired legacy non-Store FK swap/re-add’ены как `NOT VALID`:
      прежние delete actions сохранены, `ON UPDATE RESTRICT` подтверждён.
- [ ] Три legacy Store FK под прежними именами существуют как temporary
      simple `RESTRICT/RESTRICT NOT VALID`; прежняя `SET NULL` семантика
      отсутствует.
- [ ] Каталог содержит ровно 14 composite + 14 simple compatibility
      `NOT VALID` FK.
- [ ] Все 14 legacy invalid rows после EXPAND проходят benign non-FK update;
      migration не замораживает их до reconciliation.
- [ ] Три temporary Store FK блокируют удаление Store даже для legacy
      cross-tenant row и не допускают dangling `storeId`.
- [ ] Production-like StaffTask inventory имеет `blockingTotal=0`; выполнены
      отдельные reconciliation dry-run, explicit apply и zero-diff dry-run.
- [ ] Все 14 same-tenant FK валидированы отдельным управляемым шагом;
      `convalidated=true` подтверждён по каждому constraint.
- [ ] Prisma schema содержит `onUpdate: Restrict` для 11 simple non-Store
      relations; exact destructive diff содержит только 11 non-Store
      composite + три simple Store FK, а unrelated ADD/index-rename drift
      классифицирован отдельно.
- [ ] Staged smoke получил `prismaDriftDrops=14` через
      `--from-schema-datasource` и scoped env; database URL/пароль отсутствуют
      в argv.
- [ ] Операционный `NOT VALID`/coexistence contract всех 14 simple FK сверён с
      `staff-task-integrity-expand-runbook.md`, хотя Prisma не отражает
      `convalidated`.
- [ ] Offline self-test/future-migration guard защищает все 28 DB-native FK от
      DROP/RENAME и запрещает destructive table/column DDL, DROP/ALTER пяти
      parent indexes, DROP SCHEMA и неожиданные migration directory names.
- [ ] Migration создана create-only и прошла ручной SQL review.
- [ ] Пять parent UUID update и пять parent `tenantId` move сценариев
      отклонены; identifiers и tenant ownership immutable.
- [ ] `prisma db push` не используется; N-1 rollback не запускает старый seed
      или identifier updates.
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
- [ ] StaffTask catalog revision равна
      `20260727131000_staff_task_integrity_expand`; все 28 FK прошли
      post-apply catalog check.
- [ ] Pre-CONTRACT evidence подтверждает все 14 simple compatibility
      `NOT VALID` FK и зелёный 28-FK guard.
- [ ] Отдельный CONTRACT после N-1 window удалил ровно 14 simple FK и перевёл
      guard manifest на 14 surviving composite FK.
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
необъяснимом reward/ledger расхождении, отклонении exact Prisma drift,
ошибке future-migration DDL guard или недоставленном critical alert.
