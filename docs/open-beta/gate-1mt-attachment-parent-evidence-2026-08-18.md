# Gate 1MT: staff attachment parent coverage — 18.08.2026

## Вердикт

Read authorization для всех семи `StaffAttachmentResourceKind` и native atomic
binding для пяти content parent kinds приняты на restored-copy clones. Exact
reader implementation:
`abb8a667c986fb92c1a8da475f764733b1c395c1`; exact writer implementation:
`fc07e959d6beab79a98c4bbd8c41e8ddf09b98de`.

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
5. выполняет exact `tenantId + parent id` lookup в той же repeatable-read
   транзакции;
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

## Приёмка

Static/local:

```text
StaffAttachmentsService unit: 26/26 PASS
Writer/binder focused unit:      24/24 PASS
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
подстановке attachment другого tenant.

## Postflight

Для обоих exact-commit прогонов:

- fixture cleanup завершён;
- все `156` public table counts target точно совпали с source;
- count diff: `0`;
- active target sessions перед drop: `0`;
- exact disposable database удалена;
- database residue: `0`.

После этого Gate 1MT PostgreSQL matrix составляет `32/32`:

| Slice                                      |        Результат |
| ------------------------------------------ | ---------------: |
| Ассортимент/reports/import/export          |          `15/15` |
| Team chat, включая real HTTP SSE           |            `4/4` |
| CRM communications                         |            `4/4` |
| Users/roles                                |            `4/4` |
| Staff attachments, reader + native writers |            `5/5` |
| **Итого**                                  | **`32/32 PASS`** |

## Что ещё не закрыто

Reader coverage не равна полной file workflow readiness. До внешнего beta
остаются:

1. корректные STORES visibility policies самих checklist/knowledge/regulation/
   training/onboarding workspaces, после чего network-only file deny можно
   безопасно сузить;
2. production-build upload→create/update→download browser matrix;
3. reference removal, parent delete/archive/move, orphan retention и
   конкурентные bind/unbind/rebind races;
4. tenant-aware jobs, Telegram/public guest binding, controlled outbound,
   Gate 2 и production `PREPARE`.
