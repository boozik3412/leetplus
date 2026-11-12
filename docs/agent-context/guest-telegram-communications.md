# Связь с гостями через Telegram-бот

Дата контракта: 12.11.2026. Читать перед изменением входящих сообщений гостей
в бот, ответов сотрудников в Telegram, очереди `GuestTelegramOutboxMessage` и
рассылок кампаний через бот. Границы контуров —
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

## Рассылки кампаний

1. В карточке кампании вкладка «Telegram»: тип (новость клуба или акция),
   текст до 1500 символов, необязательная https-кнопка. Черновик хранится в
   `MarketingCampaign.mechanicConfig.telegram`.
2. Получатели — гости группы кампании с активным профилем и чатом
   `chat:<id>`; по одному сообщению на гостя и на чат. Исключаются: уже
   получившие эту кампанию, отписавшиеся (`phoneConsentStatus`
   `UNSUBSCRIBED|DENIED`), для акций — без `promoConsentStatus = GRANTED`,
   и получавшие любую рассылку за последние 3 дня.
3. Send ставит `CAMPAIGN_NEWS` или `CAMPAIGN_PROMO` в ту же очередь; claim
   ещё раз проверяет отписку и согласие на акции. Под сообщением всегда
   кнопка отписки («Отписаться» для новостей, «Не присылать акции» для акций).
4. Доставка (`SENT`) пишет контакт в журнал CRM, поэтому кампания видна во
   вкладке «Эффект» без ручных отметок.
5. Согласие на акции гость даёт сам: «Акции клуба» в меню бота или
   «Присылать акции клуба» после входа.

## Где что живёт

| Слой | Место |
| --- | --- |
| Очередь, claim/report | `apps/api/src/guest-communications/guest-telegram-outbox.service.ts`, controller рядом |
| Приём текста из бота | `apps/api/src/guest-portal/guest-portal.service.ts` (`recordTelegramGuestMessage`, `telegramWebhookGuestMessageKey`) |
| Обращение/комментарий | `apps/api/src/guest-portal/guest-support.service.ts` (`recordTelegramMessage`) |
| Постановка ответа | `apps/api/src/support/support-tickets.service.ts` (`publishReply`) |
| Отправка с edge | `apps/api/src/guest-portal/telegram-outbox-sender.ts`, цикл в `telegram-edge-poller.cli.ts` |
| Экран | `apps/web/src/components/staff-support-tickets-workspace.tsx` (бейдж «Telegram», статус доставки) |
| Рассылка кампании | `apps/api/src/guest-communications/guest-telegram-campaign.service.ts`, `marketing-campaign-telegram.controller.ts` |
| Согласие на акции в боте | `guest-portal.service.ts` (`telegramWebhookPromoResponse`, `telegramBotPromoChoice`) |
| Вкладка «Telegram» | `apps/web/src/components/marketing-campaign-telegram-panel.tsx`, `app/(app)/marketing/campaigns/[id]/page.tsx` |

## Правила

- Включается двумя вещами: `GUEST_BUG_REPORTING_MODE=LIVE` (приём) и
  одинаковым токеном `GUEST_TELEGRAM_OUTBOX_TOKEN` (API) /
  `GUEST_GAME_TG_EDGE_OUTBOX_TOKEN` (edge) для отправки.
- Ответ на обращение отправляется и отписавшемуся от новостей гостю: это
  ответ на его вопрос. Строки `CAMPAIGN_*` для `UNSUBSCRIBED`/`DENIED`
  пропускаются при claim, `CAMPAIGN_PROMO` — ещё и без согласия на акции.
- Согласие при входе в игру не покрывает рекламу (ст. 18 38-ФЗ): акции только
  по `promoConsentStatus = GRANTED`, его меняет только гость в боте.
- Новый вид сообщения — новый `kind` и свой `sourceKey`; таблицу не дублировать.
- Guest-код не импортирует corporate support; общие константы — в
  `guest-portal/guest-support-thread.ts`.

## Проверка

```bash
pnpm --filter api exec jest --runInBand --runTestsByPath src/guest-communications/guest-telegram-outbox.service.spec.ts src/guest-communications/guest-telegram-campaign.service.spec.ts src/guest-portal/telegram-outbox-sender.spec.ts src/guest-portal/guest-support-telegram.spec.ts src/support/support-guest-replies.spec.ts src/guest-portal/guest-portal.service.spec.ts src/runtime/runtime-boundary.spec.ts
```
