# Staff attachment reconciliation controller

| Поле     | Значение                                                                  |
| -------- | ------------------------------------------------------------------------- |
| Статус   | `IMPLEMENTED / LOCAL PG REHEARSAL PASS / PRODUCTION APPLY NOT AUTHORIZED` |
| Версия   | 1.0.0                                                                     |
| Дата     | 24.08.2026                                                                |
| Владелец | LeetPlus engineering                                                      |
| Gate     | `BETA-MOD-STAFF-009`, `BETA-SEC-006`, Gate 1MT                            |

## Решение

Контроллер реализует строго разделённую последовательность:

```text
read-only plan -> human review -> detached approval -> apply -> check
                                                     -> zero-diff replay
                                                     -> exact rollback -> check
```

Production-данные этим checkpoint не изменялись. Наличие контроллера само по
себе не разрешает production apply и не переводит
`STAFF_ATTACHMENT_ACL_MODE` из `SHADOW` в `ENFORCED`.

Реализация:

- `packages/database/scripts/staff-attachment-reconciliation.mjs`;
- `packages/database/scripts/staff-attachment-reconciliation.cli.mjs`;
- `packages/database/scripts/staff-attachment-reconciliation.test.mjs`;
- `packages/database/scripts/staff-attachment-reconciliation.pg.integration.test.mjs`.

Operational runtime состоит ровно из scanner dependency, controller и CLI и
включён в exact allowlist immutable release artifact. Его наличие, SHA256SUMS,
provenance (`staffAttachmentReconciliationScriptCount=3`) и запрет лишних
scripts проверяются artifact integrity gate. Production запрещено запускать из
mutable checkout: только из распакованного artifact того же admitted SHA.

Команда package:

```text
pnpm --filter database db:reconcile:attachment-acl -- <command>
```

## Автоматически допустимый subset

План создаёт action только когда одновременно выполнены все условия:

1. attachment существует и имеет состояние `UNRESOLVED` с валидной before
   image;
2. найден ровно один валидный top-level parent;
3. tenant attachment, source, parent и parent store совпадают;
4. источник однозначен:
   `StaffChatMessageAttachment -> CHAT_RELATION_BACKFILL` либо exact
   `StaffTaskComment.evidenceUrl -> LEGACY_REFERENCE_BACKFILL`;
5. для attachment ещё нет ни BOUND, ни unresolved candidate binding;
6. parent shape не конфликтует и не изменился к моменту apply.

Детерминированные `sourceKey` и binding UUID выводятся из полного locator.
Plan содержит exact before image, поэтому незаметно применить его к другой
строке или после lifecycle drift невозможно.

Контроллер никогда автоматически не изменяет:

- multiple-primary-parent случаи;
- attachment без распознанного primary parent;
- `PENDING`, `BOUND` или `QUARANTINED` lifecycle;
- неразрешённые absolute URL/origin signals;
- missing/cross-tenant/store-conflict источники;
- строки с уже существующим binding.

Они остаются в protected plan как stable review reason codes. Контроллер не
поддерживает auto-quarantine.

## Защитные границы

Plan выполняется на одном connection в `REPEATABLE READ READ ONLY`, bounded
keyset pages по `1 000` строк и с relation cap `100 000`. Ни URL, ни blob,
file name, user PII или credential не записываются в plan.

Каждый plan привязан к:

- exact 40-hex release SHA;
- credential-free database target fingerprint;
- exact database name, PostgreSQL system identifier и session role;
- exact migration count `187` и head
  `20260820010000_guest_portal_telegram_update_ledger`;
- digest фактического attachment schema catalog, enum и trigger definitions;
- точному HTTPS origin allowlist;
- полному sanitized source-graph и inventory digest.

Session role обязан быть `NOINHERIT`, `NOSUPERUSER`, `NOCREATEDB`,
`NOCREATEROLE`, `NOREPLICATION`, `NOBYPASSRLS`. Production controller role
создаётся отдельной reviewed operational change и удаляется после ceremony.
Нельзя использовать `postgres`, owner role или API credential без отдельной
проверки его effective grants.

Apply/rollback выполняются одной короткой `SERIALIZABLE` transaction:

1. повторная database/schema attestation;
2. non-blocking transaction advisory lock;
3. attachment locks в стабильном порядке;
4. повторная проверка exact before/after и отсутствия чужих bindings;
5. повторная проверка primary graph и authoritative parent scope;
6. bulk parameterized insert/update или exact delete/restore;
7. `SET CONSTRAINTS ALL IMMEDIATE` для deferred lifecycle/parent guards;
8. durable aggregate-only `PlatformAdminAuditEvent`;
9. zero-diff reread до commit.

Если commit завершился, а клиент потерял ответ, повторный apply сверяет durable
audit и exact after state и возвращает `RECONCILED` без DML. Rollback требует
точный apply audit, удаляет только bindings из данного plan, восстанавливает
полную before image и создаёт отдельный rollback audit. После rollback старый
plan повторно применить нельзя.

## Protected artifacts

Plan содержит tenant/attachment/resource UUID и поэтому хранится только в
защищённом evidence root. Все input/output должны быть непосредственными
детьми одного root. Контроллер:

- запрещает symlink/reparse ancestry;
- на Linux требует owner и exact `0700` root / `0600` files;
- на Windows требует exact protected DACL текущего пользователя, SYSTEM и
  Administrators;
- создаёт output через exclusive create и никогда не перезаписывает файл;
- fsync-ит файл и, где поддерживается, каталог;
- повторно проверяет file/root identity до и после I/O.

Для этого bounded workflow защищённый JSON ограничен `16 MiB`. Capacity test
материализует worst-case plan для текущего production inventory из `5 446`
attachments; прежний общий `4 MiB` предел был недостаточен и теперь остаётся
default только для других access-scope артефактов. Превышение `16 MiB`
fail-closed останавливает workflow до любого database effect.

Stdout содержит только plan digest, counts, artifact digest и decision. Raw
identifiers и database URL туда не попадают.

## Команды rehearsal

Сначала отдельно вычислить credential-free fingerprint через существующий
read-only scanner:

```powershell
$env:DATABASE_URL = 'postgresql://REDACTED@127.0.0.1:55449/leetplus_attachment_review?schema=public'
pnpm --filter database db:inventory:attachment-acl -- --print-database-fingerprint
```

Затем задать process-local значения, не выводя credential:

```powershell
$env:STAFF_ATTACHMENT_RECONCILIATION_EVIDENCE_ROOT = 'C:\absolute\protected-root'
$env:STAFF_ATTACHMENT_RECONCILIATION_TARGET = 'staging'
$env:STAFF_ATTACHMENT_RECONCILIATION_RELEASE_SHA = 'REPLACE_EXACT_40_HEX'
$env:STAFF_ATTACHMENT_RECONCILIATION_EXPECTED_DATABASE_FINGERPRINT = 'REPLACE_SHA256'
$env:STAFF_ATTACHMENT_RECONCILIATION_EXPECTED_DATABASE_NAME = 'leetplus_attachment_review'
$env:STAFF_ATTACHMENT_RECONCILIATION_EXPECTED_SYSTEM_IDENTIFIER = 'REPLACE_EXACT_DIGITS'
$env:STAFF_ATTACHMENT_RECONCILIATION_EXPECTED_ROLE = 'leetplus_attachment_writer'
```

Создать read-only plan:

```powershell
pnpm --filter database db:reconcile:attachment-acl -- plan `
  --output C:\absolute\protected-root\plan.json
```

Оператор вручную сравнивает plan digest, action count, review count, все review
reason codes и exact action list. Эти значения нельзя автоматически передавать
из plan в approval command.

```powershell
pnpm --filter database db:reconcile:attachment-acl -- approve `
  --plan C:\absolute\protected-root\plan.json `
  --direction APPLY `
  --confirm-plan-digest REPLACE_EXACT_SHA256 `
  --confirm-action-count REPLACE_EXACT_COUNT `
  --confirm-review-count REPLACE_EXACT_COUNT `
  --confirm I_ACCEPT_EXACT_STAFF_ATTACHMENT_RECONCILIATION_APPLY `
  --output C:\absolute\protected-root\apply-approval.json

pnpm --filter database db:reconcile:attachment-acl -- apply `
  --plan C:\absolute\protected-root\plan.json `
  --approval C:\absolute\protected-root\apply-approval.json `
  --output C:\absolute\protected-root\apply-receipt.json

pnpm --filter database db:reconcile:attachment-acl -- check `
  --plan C:\absolute\protected-root\plan.json `
  --direction APPLY `
  --output C:\absolute\protected-root\apply-check.json
```

Повторный apply с новым output path обязан вернуть `RECONCILED`,
`zeroDiff=true`. Exact rollback требует отдельного approval с direction
`ROLLBACK`, ручного повторного ввода тех же digest/counts и фразы
`I_ACCEPT_EXACT_STAFF_ATTACHMENT_RECONCILIATION_ROLLBACK`.

## Least-privilege role boundary

Disposable PostgreSQL 16.15 rehearsal подтвердила, что одной таблицы DML
недостаточно. Apply-role должна иметь только перечисленные возможности:

- `CONNECT`, но не `CREATEDB`, `CREATEROLE`, `SUPERUSER`, `INHERIT`,
  `REPLICATION` или `BYPASSRLS`;
- `USAGE` на `public` и `SELECT` на exact migration, attachment, binding,
  audit и seven-parent graph relations, которые читает controller;
- column-level `UPDATE` только state-полей `StaffAttachment`, `INSERT/DELETE`
  на `StaffAttachmentBinding` и `INSERT` на `PlatformAdminAuditEvent`;
- `EXECUTE` только на
  `resolve_staff_attachment_resource_scope(StaffAttachmentResourceKind,text)`
  и `assert_staff_attachment_state(text)`;
- для каждого auto-action — минимальный grant `UPDATE("updatedAt")`, необходимый
  PostgreSQL для `FOR KEY SHARE`: на `StaffTask` либо одновременно на
  `StaffChatMessage` и `StaffChatChannel`; при ненулевом `resourceStoreId` такой
  же column grant нужен на exact `Store`. Whole-table `UPDATE` запрещён.
  `createdByUserId` в controller contract всегда `NULL`, поэтому row-lock grant
  на `User` этому workflow не выдаётся.

Эта роль является одноразовой maintenance capability: credential не монтируется
в API/worker, действует только на reviewed window, после final check grants
отзываются, role удаляется, а zero effective-grant audit сохраняется в evidence.
Первый rehearsal специально завершился `42501` до writes при отсутствии
resolver grant; после добавления только точечных function/row-lock прав полный
lifecycle прошёл. Это fail-closed поведение обязательно сохранить.

## Production stop conditions

Production plan разрешён как read-only операция только после зелёных Fast CI и
Full Release Admission на одном exact SHA и независимой проверки immutable
artifact handoff для этого SHA.
Production apply остаётся запрещён до одновременного выполнения условий:

1. свежий проверенный backup и измеренное rollback window;
2. restored-copy rehearsal на фактической production history;
3. отдельный least-privilege controller role и exact effective-grant audit;
4. review всех actions и review reasons владельцем данных;
5. отдельное явное разрешение на один exact plan digest;
6. отсутствие активных deploy/migration/background maintenance операций;
7. `STAFF_ATTACHMENT_ACL_MODE=SHADOW` сохраняется на время backfill;
8. после apply выполнены check, повторный zero-diff inventory и browser
   archive/delete/orphan matrix.

Немедленная остановка при database/schema/source graph drift, extra binding,
lock/statement timeout, deferred-trigger failure, audit drift, partial response
без последующего `RECONCILED`, росте multiple-parent/cross-tenant findings или
любом воздействии на текущий доступ сотрудников.

## Проверки checkpoint

- unit/contract suite: `9/9 PASS`;
- runtime release artifact identity/provenance adversarial test: `PASS`;
- real disposable PostgreSQL: plan, apply, lost-response replay, apply check,
  rollback, rollback replay и rollback check — `PASS`;
- после rollback: `1 UNRESOLVED`, `0 bindings`, exact apply/rollback audit по
  одной строке;
- disposable PostgreSQL остановлен и удалён;
- production application/data/config не изменялись.

Clean-schema blocker закрыт без изменения уже применённых migration SQL.
Причиной были `150` CRLF-файлов в старом Windows working tree; Git/LF manifest
`1..178` всё время оставался каноническим `7f986797…`. `db:deploy` теперь
материализует отдельный symlink-free UTF-8/LF Prisma artifact. Реальный clean
PostgreSQL 16.15 deploy применил `187/187`, дошёл до
`20260820010000_guest_portal_telegram_update_ledger`, подтвердил CURRENT179
preterminal digest `7f986797…`, а повторный deploy был no-op. Existing
production-history rehearsal `f4e8d79d…` остаётся историческим evidence и не
заменяет fresh-backup rehearsal нового exact SHA перед production apply.
