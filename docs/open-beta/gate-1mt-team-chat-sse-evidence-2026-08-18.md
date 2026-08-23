# Gate 1MT: доказательства изоляции team-chat SSE — 18.08.2026

## Вердикт

Team-chat SSE slice принят локально на production-like restored copy и в
production Web build. Он закрывает transport, HTTP и persisted tenant/store
authority для `GET /staff/team-chat/events`, но сам по себе не разрешает
внешний доступ и не меняет release decision `NO-GO`.

Implementation:

- Web/BFF boundary:
  `ccf81a28395b3d159ba137f60120ac261d521b93`;
- API pre-header authorization:
  `dfe5e0f807e7a9cff36ca0a30dec7909a0ccb040`.

Production и текущий Tenant A с четырьмя клубами не изменялись.

## Найденная и устранённая ошибка

Первый диагностический HTTP-прогон был отклонён: контроллер создавал
Observable из уже запущенного Promise, поэтому Nest мог зафиксировать `200`
и SSE headers до завершения асинхронной проверки канала. Deny затем попадал в
открытый event stream вместо HTTP `404/401`.

Контроллер теперь сначала `await`-ит `getLiveState` и только после успешной
fresh-authority проверки создаёт однособытийный SSE stream. Следовательно:

- hidden cross-store/cross-tenant channel возвращает HTTP `404` до stream;
- stale persisted scope возвращает HTTP `401` до stream;
- разрешённый канал возвращает `200 text/event-stream`;
- каждый reconnect снова проходит JWT, role и fresh store-scope guards.

## Web/BFF boundary

`/api/staff/team-chat/events` теперь:

- требует cookie-сессию и локально возвращает `401` без неё;
- принимает только один корректный UUID `channelId`;
- отклоняет неизвестные selectors, duplicate `channelId` и malformed UUID
  ответом `400` до upstream request;
- передаёт upstream только exact allowlisted query и `AbortSignal`;
- на success и error использует `private, no-store`, `Vary: Cookie,
Authorization`, `nosniff`, `no-referrer` и same-origin resource policy;
- не устанавливает hop-by-hop `Connection` header.

Focused Web acceptance:

```text
pilot-bff-boundary:       10/10 PASS
targeted Web ESLint:      PASS
Web production typecheck PASS
Web production build:    PASS (205 pages)
```

Production-build Web был подключён к локальному mock upstream только для
проверки transport boundary. До валидного UUID upstream получил `0` запросов;
валидный selector породил ровно один cookie-to-Bearer request с
`Accept: text/event-stream`. Браузер получил один `team-chat-state`, все
requests завершились `200`, console содержала `0 errors / 0 warnings`.

Mock upstream не заменяет API isolation evidence ниже.

## Real API/PostgreSQL HTTP matrix

Настоящий Nest HTTP adapter, реальный `RolesGuard`,
`FreshStoreScopeGuard`, `StaffTeamChatController` и
`StaffTeamChatService` были подняты над disposable clone
`leetplus_gate1mt_team_chat_sse_test_a1` от clean restored-copy source.
JWT guard в fixture заменялся только для помещения текущего persisted fixture
user в request; tenant/store/role/capability проверки оставались production.

Принятые случаи:

| Субъект/запрос                    | HTTP и данные            |
| --------------------------------- | ------------------------ |
| STORES(A1) → channel A1           | `200 SSE`, только A1     |
| STORES(A1) → channel A2           | `404` до открытия stream |
| STORES(A1) → channel B1           | `404` до открытия stream |
| NETWORK(B) → channel B1           | `200 SSE`, только B1     |
| stale STORES(A1), DB scope уже A2 | `401` до открытия stream |

Focused API acceptance:

```text
staff team-chat unit:                    22/22 PASS
restored-copy team-chat PostgreSQL/HTTP: 4/4 PASS
repeat restored-copy run:                4/4 PASS
targeted API ESLint:                     PASS
API production typecheck:                PASS
API production build:                    PASS
```

## Postflight

- все `156` public table counts target после обоих прогонов точно совпали с
  clean source;
- changed table count: `0`;
- перед удалением target активных sessions: `0`;
- exact disposable database удалена;
- database residue: `0`;
- browser automation residue текущего прогона удалён;
- legacy/user-owned `.tmp` не изменялся.

После этого Gate 1MT restored-copy PostgreSQL matrix составляет `30/30`:

| Slice                             |        Результат |
| --------------------------------- | ---------------: |
| Ассортимент/reports/import/export |          `15/15` |
| Team chat, включая real HTTP SSE  |            `4/4` |
| CRM communications                |            `4/4` |
| Users/roles                       |            `4/4` |
| Staff attachments                 |            `3/3` |
| **Итого**                         | **`30/30 PASS`** |

## Незакрытая граница

Этот gate не проверяет и не включает:

1. остальные attachment parent kinds и file download/read paths;
2. tenant-aware background jobs и schedulers;
3. shared Telegram/public guest binding и dedupe/routing;
4. controlled outbound email/digest canary;
5. Gate 2 текущей сети A1–A4, production `PREPARE`, persisted beta `GO` и
   создание Tenant B/Store B1 с mailbox-bound OWNER invite.
