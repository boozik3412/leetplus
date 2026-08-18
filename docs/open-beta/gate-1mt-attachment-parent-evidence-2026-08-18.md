# Gate 1MT: staff attachment parent coverage — 18–19.08.2026

## Вердикт

Read authorization для всех семи `StaffAttachmentResourceKind` и native atomic
binding/lifecycle для пяти content parent kinds приняты на restored-copy clones. Exact
reader implementation:
`abb8a667c986fb92c1a8da475f764733b1c395c1`; exact writer implementation:
`fc07e959d6beab79a98c4bbd8c41e8ddf09b98de`; exact lifecycle implementation:
`f2e9e6ca2d4804fe62ca1d51b04ef60abd8d7fcf`; exact PostgreSQL race
evidence: `7928b7f869a571174c532bb92f060ff37cb589d0`; exact direct subject-revoke
implementation: `c5b86abadeca5bc55e5f5b231eda3a37ad0a49fc`; exact custom/system-role
authority implementation: `bc8fffd268b4bcab8b81847d005136e5fe1a31ad`.
Production-build OWNER browser implementation:
`976483085d411c3e0e1e8512dd493e0db9ef70f6`.

Принятые parent kinds:

- `CHAT_MESSAGE`;
- `STAFF_TASK`;
- `CHECKLIST_RUN`;
- `KNOWLEDGE_ARTICLE`;
- `SHIFT_REGULATION`;
- `TRAINING_COURSE`;
- `ONBOARDING_PLAN`.

Этот slice не включает production deployment и не разрешает внешний доступ.
Production и текущий Tenant A/A1–A4 не изменялись.

## Реализованная граница

Для пяти ранее fail-closed parent kinds reader теперь:

1. загружает только tenant-scoped metadata без blob bytes;
2. проверяет capability соответствующего staff-модуля;
3. повторно получает persisted role/custom-role/capabilities и access scope;
4. разрешает эти временно network-only workspaces только при fresh `NETWORK`;
5. в `ENFORCED` режиме до metadata берёт exact tenant-scoped shared row lock
   на subject и attachment, затем общий transaction-scoped advisory lock на
   custom/system-role authority и выполняет `tenantId + parent id` lookup в той
   же read-committed транзакции;
6. загружает blob bytes только после положительного решения.

Capability mapping:

| Parent kind         | Capability             |
| ------------------- | ---------------------- |
| `CHECKLIST_RUN`     | `view_staff_standards` |
| `SHIFT_REGULATION`  | `view_staff_standards` |
| `KNOWLEDGE_ARTICLE` | `view_staff_knowledge` |
| `TRAINING_COURSE`   | `view_staff_training`  |
| `ONBOARDING_PLAN`   | `view_staff_training`  |

`STORES` намеренно получает hidden `404`: соответствующие workspaces всё ещё
защищены `FreshNetworkScopeGuard`, и attachment download не должен становиться
обходом этой границы. Stale persisted authority завершается `401` до parent и
blob reads. Чужой tenant не проходит начальный metadata selector.

## Native writer boundary

`SHIFT_REGULATION`, `KNOWLEDGE_ARTICLE`, `TRAINING_COURSE`,
`ONBOARDING_PLAN` create/update и `CHECKLIST_RUN` answers update теперь вызывают
один `StaffAttachmentBindingsService` внутри той же Prisma transaction, что и
запись parent. Если ссылка не принадлежит exact tenant/uploader, просрочена или
уже привязана к другому parent, parent write откатывается целиком.

Extractor принимает только точные относительные
`/staff/attachments/<uuid>` и `/api/staff/attachments/<uuid>`, ограничивает
глубину, количество узлов, длину строки и число ссылок. Malformed route-like,
absolute origin substitution, cyclic и accessor-bearing values завершаются
fail-closed до binding. Обычные внешние URL не превращаются в local binding.

Повторное сохранение уже `BOUND` файла разрешено только при существующем exact
`tenantId + resourceKind + resourceId` binding. Mixed replay создаёт binding и
выполняет `PENDING→BOUND` только для новых файлов; перенос BOUND-файла к другому
parent запрещён.

Lifecycle extension синхронизирует полный набор native references внутри той
же parent transaction. Удалённая из parent ссылка удаляет только exact
`source=NATIVE` binding; если других `BOUND` bindings нет, blob атомарно
переходит `BOUND→QUARANTINED` с `NATIVE_REFERENCE_REMOVED` и больше не
скачивается. Если другой parent всё ещё связан с blob, состояние остаётся
`BOUND`. Status-only update сохраняет существующие ссылки. Удаление shift
regulation сначала блокирует parent row, снимает native bindings и только затем
удаляет parent; несогласованное количество затронутых строк завершает всю
транзакцию fail-closed.

## Приёмка

Static/local:

```text
StaffAttachmentsService unit: 26/26 PASS
Writer/binder focused unit:      24/24 PASS
Final attachment-focused unit:   49/49 PASS
Role/attachment focused unit:    56/56 PASS
targeted API ESLint:           PASS
API production typecheck:     PASS
API production build:         PASS
```

Restored-copy PostgreSQL fixture создала по одному настоящему A1 parent каждого
нового kind, загрузила отдельный PENDING blob и привязала его production
`StaffAttachmentBindingsService`. Для каждого файла принято:

- Tenant A NETWORK OWNER читает exact bytes;
- Tenant A STORES(A1) не получает network-only parent bytes;
- Tenant B NETWORK OWNER не получает чужие metadata/bytes;
- binding trigger подтверждает exact tenant/store parent identity.

Exact implementation bytes дважды прошли `4/4 + 4/4` на двух отдельных клонах
clean restored-copy source.

Writer extension дважды прошёл `5/5 + 5/5` на двух новых disposable клонах.
Реальные service calls создали и привязали файлы всех пяти kinds, подтвердили
same-parent replay без второго binding и доказали rollback parent create при
подстановке attachment другого tenant. На exact lifecycle bytes те же два
fresh-clone прогона дополнительно подтвердили status-only retention, снятие
training reference с `BOUND→QUARANTINED` и недоступным reader, а также
shift-regulation delete с удалением binding и quarantine последнего blob.

Race extension дважды прошёл `6/6 + 6/6` на следующих fresh restored-copy
клонах. Две настоящие createCourse transactions конкурировали за один PENDING
blob под наблюдаемым PostgreSQL row lock: ровно одна создала parent/binding,
вторая fail-closed откатила parent. Два updateCourse одновременно выполняли
remove и replacement одного parent: обе операции сериализовались, финальные
parent steps совпали с единственным BOUND binding, старый blob остался
QUARANTINED, а его повторная привязка к новому parent была отклонена.

Direct subject-revoke extension дважды прошёл `7/7 + 7/7`. В `ENFORCED`
режиме download до metadata берёт один PostgreSQL `FOR SHARE` lock на exact
tenant-scoped `User + StaffAttachment`; lifecycle/user writers используют
конфликтующие row locks. В fixture `isActive=false` был записан и удержан до
старта download: reader реально заблокировался, после commit повторно увидел
неактивного subject, вернул `Unauthorized` без bytes и не повредил binding.

Custom/system-role capability-revoke extension дважды прошёл `8/8 + 8/8`.
Reader и реальные `updateAccessRole`/`updateSystemRole` workflows используют
один exact tenant+role transaction-scoped advisory key. В fixture custom role
и впервые созданный system override удерживали permission revoke до старта
download; reader наблюдаемым образом ждал lock, после commit перечитал fresh
permissions, вернул `Unauthorized` без bytes. Первый технический прогон выявил
и устранил Prisma `void`-deserialization (`pg_advisory_xact_lock(...)::text`),
второй — некорректную fixture-role; оба неуспешных клона прошли полный
zero-diff postflight и были удалены до accepted прогонов.

Production-build browser extension принят на fresh restored-copy clone для
`KNOWLEDGE_ARTICLE`: upload BFF вернул канонический относительный locator,
parent save создал exact B1 native binding, PostgreSQL blob и browser download
совпали с исходником по SHA-256, remove+save перевёл последнюю ссылку в
`QUARANTINED`, а повторный GET вернул hidden `404`. Whole-schema postflight
проверил все `156` таблиц; изменились только семь ожидаемых fixture/workflow
таблиц, disposable database residue `0`. Отдельная STORES(B1) сессия получила
штатный `404` на network-only parent без ошибок console.
[Полный browser-отчёт](./gate-1mt-attachment-browser-evidence-2026-08-19.md).

## Postflight

Для всех принятых disposable прогонов:

- fixture cleanup завершён;
- все `156` public table counts target точно совпали с source;
- count diff: `0`;
- active target sessions перед drop: `0`;
- exact disposable database удалена;
- database residue: `0`.

После этого Gate 1MT PostgreSQL matrix составляет `35/35`:

| Slice                                              |        Результат |
| -------------------------------------------------- | ---------------: |
| Ассортимент/reports/import/export                  |          `15/15` |
| Team chat, включая real HTTP SSE                   |            `4/4` |
| CRM communications                                 |            `4/4` |
| Users/roles                                        |            `4/4` |
| Staff attachments, reader + writer/lifecycle/races |            `8/8` |
| **Итого**                                          | **`35/35 PASS`** |

## Что ещё не закрыто

Reader coverage не равна полной file workflow readiness. До внешнего beta
остаются:

1. корректные STORES visibility policies самих checklist/knowledge/regulation/
   training/onboarding workspaces, после чего network-only file deny можно
   безопасно сузить;
2. archive/delete/orphan-retention browser matrix для остальных parent kinds;
3. tenant-aware jobs, Telegram/public guest binding, controlled outbound,
   Gate 2 и production `PREPARE`.
