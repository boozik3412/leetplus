# Gate 1MT: staff attachment parent coverage — 18.08.2026

## Вердикт

Read authorization для всех семи `StaffAttachmentResourceKind` принят на
restored-copy clone. Exact implementation:
`abb8a667c986fb92c1a8da475f764733b1c395c1`.

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

## Приёмка

Static/local:

```text
StaffAttachmentsService unit: 26/26 PASS
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

## Postflight

Для обоих exact-commit прогонов:

- fixture cleanup завершён;
- все `156` public table counts target точно совпали с source;
- count diff: `0`;
- active target sessions перед drop: `0`;
- exact disposable database удалена;
- database residue: `0`.

После этого Gate 1MT PostgreSQL matrix составляет `31/31`:

| Slice                                           |        Результат |
| ----------------------------------------------- | ---------------: |
| Ассортимент/reports/import/export               |          `15/15` |
| Team chat, включая real HTTP SSE                |            `4/4` |
| CRM communications                              |            `4/4` |
| Users/roles                                     |            `4/4` |
| Staff attachments, все семь reader parent kinds |            `4/4` |
| **Итого**                                       | **`31/31 PASS`** |

## Что ещё не закрыто

Reader coverage не равна полной file workflow readiness. До внешнего beta
остаются:

1. native atomic binding при create/update пяти новых parent kinds; сейчас
   generic binder и database invariants приняты, но UI/service writers ещё не
   все вызывают его;
2. корректные STORES visibility policies самих checklist/knowledge/regulation/
   training/onboarding workspaces, после чего network-only file deny можно
   безопасно сузить;
3. production-build upload/download/browser matrix и revoke/move/archive race;
4. tenant-aware jobs, Telegram/public guest binding, controlled outbound,
   Gate 2 и production `PREPARE`.
