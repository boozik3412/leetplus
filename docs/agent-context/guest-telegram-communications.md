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

## Автосценарии

1. Режим «Автоматически» на той же вкладке: правило вместо группы гостей.
   Хранится в `mechanicConfig.telegram.automation` (`trigger`, `days`,
   `enabled`, отметки включения и последнего запуска), без миграции.
   Правила: `LAPSED` (нет визита N дней, 7–180), `NO_SECOND_VISIT` (один день
   визитов, первый N дней назад, 2–60), `REWARD_EXPIRING` (незабранная
   награда в кошельке сгорает в ближайшие N дней, 1–14; к тексту добавляется
   её название и дата).
2. Визиты — `GuestSession.startedAt` гостя; клубы кампании фильтруют по клубу
   последнего визита (для наград — по клубу награды). Ловятся только свежие
   случаи: окно `[N, N+14]` дней, давние потеряшки при включении не получают
   сообщение. Сотрудники, отключённые гости и `DO_NOT_CONTACT` не входят.
3. Один раз на случай: `sourceKey = campaign:<id>:auto:<случай>:profile:<id>`
   (случай — дата последнего визита, `second-visit` или id награды).
   Вернулся и снова пропал — новый случай.
4. Ставит в очередь `bonus-ledger-worker` (`runTelegramAutomationsOnce` после
   бонусов): только кампании `RUNNING` в своих датах, не чаще раза в 30 минут
   на кампанию, с 12 до 21 по времени сети, не больше 300 за запуск,
   с проверкой admission `COMMUNICATIONS/OUTBOUND`. Отметки запуска пишутся
   `jsonb_set`, чтобы не затереть текст, сохранённый в кабинете.
   Лимит «одно рекламное сообщение в 3 дня» общий с ручными рассылками;
   напоминание о награде его не ждёт.
5. Включение (`POST …/telegram/automation`, fresh NETWORK scope) требует
   сохранённого текста и переводит черновик/запланированную кампанию в
   `RUNNING`; при включённом правиле ручная отправка закрыта. Форма кампании
   (`PATCH /marketing/campaigns/:id`) не может ни стереть, ни создать
   `mechanicConfig.telegram`.

## Оценка визита

1. Включает сеть на странице «Оценки визитов» (`/marketing/visit-ratings`,
   `POST /marketing/visit-ratings/settings`, fresh NETWORK scope). Настройка —
   `GuestVisitRatingSettings` (нет строки — выключено).
2. `bonus-ledger-worker` (`runVisitRatingAsksOnce` после автосценариев), не
   чаще раза в 5 минут на сеть, с 11 до 22 по времени сети, до 300 за запуск:
   берёт последнюю сессию гостя (`GuestSession`), закончившуюся 30 минут – 6
   часов назад и длиной от 20 минут; гостя с чатом бота, не сотрудника, не
   отписанного и не «не связываться»; не чаще раза в 7 дней на профиль и один
   раз на сессию (уникальность `tenantId + guestSessionId`).
3. В одной транзакции пишет `GuestVisitRating` (score пустой) и
   `VISIT_RATING` в очередь с кнопками 1–5 (`bot:rate:<ratingId>:<n>`, хелперы
   в `guest-portal/guest-visit-rating-callback.ts`).
4. Кнопку принимает public webhook (`telegramWebhookVisitRatingResponse`):
   только чат, которому ушёл вопрос, в течение недели; повторное нажатие
   меняет оценку. После 1–3 бот просит написать, что не так, и даёт кнопку
   «Написать клубу» — текст гостя становится обычным обращением TELEGRAM.
5. Отчёт (`GET /marketing/visit-ratings?days=7|30|90`): средняя, доля
   ответивших, распределение, клубы от худшего к лучшему, последние оценки
   1–3 со ссылкой на гостя. STORES-пользователь видит только свои клубы.

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
| Оценка визита | `apps/api/src/guest-communications/guest-visit-rating.ts` (проход worker), `guest-visit-rating.service.ts` + `marketing-visit-rating.controller.ts` (отчёт, настройка), ответ в `guest-portal.service.ts`, экран `apps/web/src/components/marketing-visit-ratings-panel.tsx` |
| Автосценарии | `apps/api/src/guest-communications/guest-telegram-automation.ts` (правила, SQL, проход worker), запуск в `guest-gamification/guest-bonus-ledger-worker.cli.ts`, карточка `apps/web/src/components/marketing-campaign-telegram-automation.tsx` |

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
pnpm --filter api exec jest --runInBand --runTestsByPath src/guest-communications/guest-telegram-outbox.service.spec.ts src/guest-communications/guest-telegram-campaign.service.spec.ts src/guest-communications/guest-telegram-automation.spec.ts src/guest-communications/guest-visit-rating.spec.ts src/guest-communications/guest-visit-rating.service.spec.ts src/guest-portal/guest-visit-rating-callback.spec.ts src/marketing/marketing-telegram-config.spec.ts src/guest-portal/telegram-outbox-sender.spec.ts src/guest-portal/guest-support-telegram.spec.ts src/support/support-guest-replies.spec.ts src/guest-portal/guest-portal.service.spec.ts src/runtime/runtime-boundary.spec.ts
```
