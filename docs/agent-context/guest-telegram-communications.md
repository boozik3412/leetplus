# Связь с гостями через Telegram-бот

Дата контракта: 12.11.2026. Читать перед изменением входящих сообщений гостей
в бот, ответов сотрудников в Telegram, очереди `GuestTelegramOutboxMessage` и
будущих рассылок через бот. Границы контуров —
`docs/security/runtime-security-contours.md` (разделы поддержки и «Очередь
сообщений гостям через Telegram-бот»).

## Как идёт сообщение

1. Гость пишет боту свободный текст (или нажимает «Написать клубу» в меню).
   Poller передаёт update в `/guest-portal/telegram/webhook`.
2. `GuestPortalService.recordTelegramGuestMessage` находит активный профиль по
   `telegramIdentity = chat:<id>` и последний подтверждённый клуб, проверяет
   admission и вызывает `GuestSupportService.recordTelegramMessage`.
3. Сообщение становится обращением `kind = TELEGRAM` в очереди «Поддержка»
   (`/support`) или комментарием гостя в последнем открытом TELEGRAM-обращении.
   Гость получает подтверждение только на новое/переоткрытое обращение.
4. Публичный ответ сотрудника (`visibility: PUBLIC` или «Решено с ответом»)
   в `SupportTicketsService.publishReply` ставит `SUPPORT_REPLY` в
   `GuestTelegramOutboxMessage` (`sourceKey = support-comment:<id>`).
5. `telegram-poller` (`telegram-outbox-sender.ts`) забирает очередь через
   `/guests/communications/telegram-outbox/claim`, отправляет `sendMessage`
   через свой proxy и отчитывается в `…/report`. Статус доставки виден под
   ответом в карточке обращения.

## Где что живёт

| Слой | Место |
| --- | --- |
| Очередь, claim/report | `apps/api/src/guest-communications/guest-telegram-outbox.service.ts`, controller рядом |
| Приём текста из бота | `apps/api/src/guest-portal/guest-portal.service.ts` (`recordTelegramGuestMessage`, `telegramWebhookGuestMessageKey`) |
| Обращение/комментарий | `apps/api/src/guest-portal/guest-support.service.ts` (`recordTelegramMessage`) |
| Постановка ответа | `apps/api/src/support/support-tickets.service.ts` (`publishReply`) |
| Отправка с edge | `apps/api/src/guest-portal/telegram-outbox-sender.ts`, цикл в `telegram-edge-poller.cli.ts` |
| Экран | `apps/web/src/components/staff-support-tickets-workspace.tsx` (бейдж «Telegram», статус доставки) |

## Правила

- Включается двумя вещами: `GUEST_BUG_REPORTING_MODE=LIVE` (приём) и
  одинаковым токеном `GUEST_TELEGRAM_OUTBOX_TOKEN` (API) /
  `GUEST_GAME_TG_EDGE_OUTBOX_TOKEN` (edge) для отправки.
- Ответ на обращение отправляется и отписавшемуся от новостей гостю: это
  ответ на его вопрос. Строки `CAMPAIGN` для `UNSUBSCRIBED`/`DENIED`
  пропускаются при claim.
- Новый вид сообщения — новый `kind` и свой `sourceKey`; таблицу не дублировать.
- Guest-код не импортирует corporate support; общие константы — в
  `guest-portal/guest-support-thread.ts`.

## Проверка

```bash
pnpm --filter api exec jest --runInBand --runTestsByPath src/guest-communications/guest-telegram-outbox.service.spec.ts src/guest-portal/telegram-outbox-sender.spec.ts src/guest-portal/guest-support-telegram.spec.ts src/support/support-guest-replies.spec.ts src/guest-portal/guest-portal.service.spec.ts src/runtime/runtime-boundary.spec.ts
```
