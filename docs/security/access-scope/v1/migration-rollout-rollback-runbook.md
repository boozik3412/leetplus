# Runbook: migration, rollout и rollback AccessScope v1

| Поле | Значение |
|---|---|
| Статус | Active draft; production execution prohibited without approval |
| Версия | 1.0.0 |
| Дата | 27.07.2026 |
| Владелец | LeetPlus engineering / operations |
| Related | `BETA-CUT-001`, `BETA-CUT-003`, `BETA-CUT-008` |

Этот runbook не разрешает deployment сам по себе. Для production нужны
утверждённый candidate SHA, backup/restore evidence, окно работ и явный GO.

## 0. Preconditions

До миграции зафиксировать в release evidence:

- deployed SHA и полный список Prisma migrations;
- tenant текущей сети и ровно четыре принадлежащих ему Store;
- отсутствие cross-tenant `UserStoreAccess`;
- список active/inactive users, roles, store links и pending invites;
- checksum числа пользователей и привязок по каждому из четырёх клубов;
- backup и доказанный restore rehearsal;
- N-1 compatibility либо отдельный порядок остановки старого приложения.

Реальные ID, email и токены не коммитятся. Evidence содержит hashes/counts и
ссылку на защищённое операционное хранилище.

## 1. EXPAND

`EXPAND` выпускается как отдельный schema-only release. После применения
миграции продолжает работать прежняя версия приложения; strict reader из
следующего release запрещено включать, пока каждый active user и pending invite
не классифицирован. Если текущий auto-deploy не умеет разделять migration и
application activation, этот rollout через него запрещён.

1. Добавить enum `NETWORK | STORES`.
2. Добавить nullable persisted mode к `User` и `UserInvite`.
3. Добавить same-tenant database invariant для user–store.
4. Выполнить preflight/backfill/DDL в одной PostgreSQL-транзакции с locks до
   preflight; timeout или нарушение invariant должны откатывать весь migration.
5. Проверить, что migration можно безопасно повторить через стандартный
   Prisma recovery process после устранения причины отказа.

На этой фазе production rows не получают NETWORK автоматически.

## 2. CLASSIFY и DUAL-READ/SHADOW

Классификация выполняется для существующих записей:

- есть store rows → кандидат `STORES` с exact set;
- нет store rows → `UNRESOLVED`, а не автоматический `NETWORK`;
- `OWNER` утверждает каждый действительно сетевой аккаунт;
- неутверждённый аккаунт остаётся `NULL`/quarantined и не может
  аутентифицироваться; после решения он получает явный `NETWORK` либо непустой
  `STORES`;
- pending invite классифицируется тем же способом либо отзывается; legacy
  signed-ID и invite без email обязательно отзываются и перевыпускаются как
  email-bound opaque token.

Classification-команда сначала работает в dry-run и пишет обезличенный manifest.
Runtime `SHADOW` может записать mismatch/`SCOPE_MISSING`, но не авторизует
`NULL`: shadow path не расширяет доступ. Новые create/invite flows записывают
mode явно только после классификации и перед включением strict application
release.

Обязательная ручная проверка текущей сети:

- все четыре Store остаются в исходном tenant;
- каждый club manager имеет только ожидаемые Store;
- network users утверждены поимённо ответственным OWNER вне репозитория;
- totals network owner до/после совпадают;
- restricted totals равны сумме разрешённых клубов.

## 3. ENFORCE по модулям

Порядок:

1. users, roles, invites;
2. staff, attachments, knowledge base, training и communications;
3. gamification, guest linkage, wallet, ledger и deliveries;
4. assortment, products, imports, reports и exports;
5. supporting dashboard, stores, settings, sync и diagnostics.

До модульного rollout необходимо реализовать tenant/module feature switch:
`OFF → SHADOW → ENFORCED`. В текущем candidate такого общего switch ещё нет.
Переход разрешён только после заполнения
[module adoption matrix](./module-adoption-matrix.md).

## 4. CONTRACT

После нулевого mismatch и `VERIFIED` обязательных поверхностей:

- mode становится `NOT NULL`;
- завершаются database constraints;
- удаляется legacy inference по пустому списку;
- удаляется dual-read;
- обновляются expected latest migration/count и deployment contract.

## Stop conditions

Немедленно остановить rollout при:

- любой cross-tenant или cross-store выдаче;
- unknown/missing scope у active request;
- расхождении totals;
- росте 401/403/404/5xx вне согласованного окна;
- утечке через export/file/SSE;
- выполнении background job с клиентским или устаревшим scope.

При инциденте writes/jobs соответствующего модуля замораживаются до анализа.

## Rollback

1. Переключить реализованный модуль `ENFORCED → SHADOW` либо вернуть
   совместимый application artifact; отсутствие switch является stop condition.
2. Не выполнять destructive down migration.
3. Сохранить mode, access rows и audit evidence.
4. Исправить misclassification отдельной транзакцией с change record.
5. При подозрении на утечку отозвать активные сессии/JWT cookies доступным
   механизмом и выполнить incident procedure; полноценный session-revoke
   workflow остаётся отдельной задачей.
6. Повторить проверки отдельно для каждого из четырёх текущих клубов.

Rollback приложения допустим только если N-1 заранее доказан совместимым с
expand-schema. Если N-1 использует небезопасный empty-list inference, rollback
выполняется с остановкой внешнего доступа.

## Post-deploy verification

- `/health/live`, `/health/ready`, `/version`;
- current migration revision/count;
- login NETWORK и STORES actors;
- users list/invite delegation;
- чужой store filter → `403`;
- чужой UUID → `404`;
- totals каждого клуба и всей сети;
- audit reason/release SHA;
- отсутствие PII и tokens в логах.

## Changelog

- `1.0.0` — исходный phased runbook.
