# ТЗ: Telegram-бот и Mini App LeetPlus Game

Дата: 19.06.2026  
Статус: рабочее ТЗ для доработки Telegram edge VDS 1337 и Mini App  
Связанные документы: `README.md`, `CURRENT_1337_HANDOFF.md`, `TRANSFER_SUMMARY.md`, `../telegram-auth.md`

## 1. Цель

Сделать Telegram-бот и Telegram Mini App полноценным входом и интерфейсом игрового модуля LeetPlus, не ломая web-путь `/game/auth -> /game/clubs -> /play/game`.

После последних production-проверок главный UX-инвариант такой:

- на сайте у гостя одна кнопка `Войти через Telegram`, без второй конкурирующей кнопки `Открыть бота`;
- перед открытием Telegram показывается понятное окно с действиями `Продолжить` и `Другой способ входа`;
- после contact-share бот не ведет гостя принудительно только в Mini App;
- после подтверждения телефона бот показывает выбор: `Вернуться на сайт LeetPlus`, `Открыть Mini App`, `Продолжить в боте`;
- Mini App живет на отдельной edge VDS 1337 и является самостоятельным вариантом продолжения, а не обязательным шагом.

## 2. Границы систем

### 2.1. Основная VDS LeetPlus

Остается источником бизнес-логики и данных:

- web `https://leetplus.ru`;
- API `https://api.leetplus.ru`;
- создание Telegram auth challenge;
- проверка challenge и contact-share;
- выпуск HttpOnly `leetplus_guest_token`;
- отдельный `GuestGameProfile`;
- выбор клуба и игровая сессия;
- `GET /guest-portal/session/game-summary`;
- Langame-сверка, reward wallet, bonus ledger;
- Guest Game Hub readiness и аудит.

Основная VDS не должна отправлять Telegram-сообщения напрямую в live polling-схеме.

### 2.2. Edge VDS 1337

Edge VDS `https://tg.leetplus.ru` отвечает только за Telegram-границу:

- `telegram-poller` читает Telegram `getUpdates`;
- `telegram-edge` пересылает safe update в основной API и отправляет safe reply в Telegram;
- `telegram-mini-app-web` обслуживает `/game/app` и proxy `/api/guest-portal/*`;
- публичный Telegram webhook в Bot API должен оставаться пустым;
- `bot-consumer` остается опциональным и до отдельного canary держится в dry-run.

Edge VDS не принимает продуктовых решений и не хардкодит сценарии после contact-share. Он отправляет `replyMarkup`, который вернул основной API, как opaque JSON.

## 3. Основной пользовательский путь

### 3.1. Вход с сайта

1. Гость открывает `/game/auth` или `/play`.
2. Выбирает способ `Telegram-бот`.
3. Подтверждает согласие на участие и обработку телефона.
4. Нажимает единственную CTA `Войти через Telegram`.
5. Сайт показывает информационное окно:
   - что сейчас откроется Telegram;
   - что в боте нужно нажать Start и поделиться телефоном;
   - что после подтверждения можно вернуться на сайт, открыть Mini App или продолжить в боте.
6. В окне доступны действия:
   - `Продолжить` - создать challenge и открыть deep link Telegram;
   - `Другой способ входа` - закрыть окно и переключить гостя на следующий готовый канал.
7. После `Продолжить` web создает одноразовый Telegram handoff и открывает bot deep link.
8. Web продолжает poll status endpoint.
9. После подтверждения телефона web получает guest-token и переводит гостя:
   - на `/game/clubs`, если клуб не выбран;
   - сразу на `/play/game`, если в последней guest-сессии уже был выбран клуб.

### 3.2. Вход в Telegram-боте

1. Бот получает `/start lp_...`.
2. Edge передает safe update в основной API.
3. Основной API проверяет challenge, срок действия, tenant/store scope и возвращает safe reply.
4. Edge отправляет гостю сообщение с кнопкой `Поделиться телефоном`.
5. Бот принимает только contact того же Telegram-пользователя.
6. Основной API активирует или создает отдельный `GuestGameProfile` по `phoneHash`.
7. Для Telegram contact-share клубная Langame-сверка запускается на backend сразу после contact-share, потому что raw phone не возвращается в браузер.
8. После успешного contact-share бот отправляет финальное сообщение с тремя вариантами:
   - `Вернуться на сайт LeetPlus`;
   - `Открыть Mini App`;
   - `Продолжить в боте`.

Mini App не должен открываться сам без выбора гостя.

### 3.3. Возврат на сайт

Кнопка `Вернуться на сайт LeetPlus` ведет на `/game/clubs`. Исходная web-страница или новая вкладка завершают вход через browser status endpoint и HttpOnly guest-token.

Если guest-token уже есть, `/game/clubs` показывает список подключенных клубов LeetPlus Game и подсвечивает последний выбранный клуб.

### 3.4. Продолжение в боте

`Продолжить в боте` оставляет гостя в Telegram-чате. До полноценного bot UI бот должен показывать безопасное состояние и доступные команды:

- выбранный клуб или просьбу выбрать клуб на сайте/Mini App;
- уровень и XP, если профиль уже есть;
- ближайший квест или сообщение, что квесты пока не опубликованы;
- доступные действия: `Открыть Mini App`, `Вернуться на сайт`, `Помощь`, `Отписаться`.

Бот не должен показывать raw phone, Langame payload, internal ids, токены, debug stack или причину provider-ошибки.

### 3.5. Mini App

Mini App открывается только по явному действию гостя.

Первый экран строится по макету `gamification-club-home-mobile-app-mockup.html`:

- mobile-first, не сжатый desktop;
- `viewport-fit=cover` и safe-area для iOS/TG WebView;
- липкий верх с клубом и уровнем;
- нижняя app-навигация: `Главная`, `Квесты`, `Награды`, `Профиль`;
- квесты выше вторичных блоков;
- баннеры и Battle Pass горизонтальными swipe-лентами;
- профиль, промокод и история наград отдельным нижним блоком.

Если Telegram identity связана с несколькими `GuestGameProfile`, Mini App сначала показывает выбор клуба. Scoped guest-session выпускается только после выбора tenant/store.

## 4. Требования к Telegram-боту

### 4.1. Транспорт

- Основной live-режим: long polling через `telegram-poller`.
- На старте poller вызывает `deleteWebhook(drop_pending_updates=false)`.
- Публичный webhook в Bot API должен быть пустым.
- Должен работать ровно один poller на bot token.
- `offset` хранится в persistent state `GUEST_GAME_TG_EDGE_POLLING_STATE_PATH`.
- Повтор Telegram update должен быть идемпотентным.

### 4.2. Команды

Минимальный набор:

- `/start lp_...` - старт auth challenge;
- `/start` без payload - показать входные варианты и ссылки;
- `/help` - краткая помощь;
- `/stop`, `/unsubscribe`, `/cancel`, `стоп`, `отписаться` - отписка от коммуникаций.

Желательный следующий набор после базового запуска:

- `Профиль`;
- `Квесты`;
- `Награды`;
- `Клуб`;
- `Открыть Mini App`;
- `Вернуться на сайт`.

### 4.3. Contact-share

- Contact принимается только если `contact.user_id` совпадает с Telegram user id отправителя.
- Номер нормализуется на backend.
- Raw phone не возвращается в frontend и не логируется.
- В `GuestGameProfile` и событиях используется `phoneHash` и безопасные маски.
- После contact-share основной API возвращает финальный `replyMarkup` с выбором сайта, Mini App и бота.

### 4.4. Reply contract

Основной API возвращает edge безопасный payload:

- `text`;
- `replyMarkup`;
- безопасные metadata для логов;
- без bot token, raw phone, raw update, raw chat id, Langame payload.

Поддерживаемые виды `replyMarkup`:

- `reply_keyboard` с `request_contact=true`;
- `inline_keyboard` с `url`;
- `inline_keyboard` с `web_app.url`.

Edge отправляет payload как есть и не подменяет кнопки своим старым Mini App-only сценарием.

## 5. Требования к Mini App

### 5.1. Авторизация

- Mini App получает Telegram `initData`.
- Edge валидирует `initData` по bot token.
- Edge передает в основной API shared-secret assertion.
- Основной API ищет только подтвержденный `GuestGameProfile`.
- Если профиля нет, Mini App показывает мягкое состояние: нужно вернуться в бот и поделиться телефоном.
- После успешного exchange выставляется HttpOnly `leetplus_guest_token`.

### 5.2. Данные

Mini App читает только безопасные endpoints:

- `GET /guest-portal/session/game-summary`;
- `GET /guest-portal/gamification/clubs`;
- `POST /guest-portal/session/select-club`;
- будущие safe endpoints квестов, наград и профиля.

Запрещено отдавать в Mini App:

- raw phone;
- raw Telegram `initData`;
- raw chat id;
- bot token;
- shared secret;
- Langame request/response payload;
- X-Request-Token Langame;
- внутренние provider errors.

### 5.3. Экраны

MVP Mini App:

- `Главная`: клуб, уровень, XP, баннеры, активные квесты, Battle Pass, ближайшие награды.
- `Квесты`: список заданий, прогресс, дедлайн, статус авто/ручной проверки.
- `Награды`: готовые награды, промокоды, лутбоксы, история bonus ledger.
- `Профиль`: выбранный клуб, уровень, ранг, safe phone mask, согласия, выход/отписка.
- `Выбор клуба`: если клуб не выбран или доступно несколько клубов.

Все состояния должны иметь empty-state: нет клуба, нет квестов, нет наград, профиль еще не связан с Langame.

### 5.4. Навигация

- Bottom navigation должна оставаться доступной на iOS/Android Telegram WebView.
- Safe-area не должна перекрывать CTA.
- Не должно быть horizontal overflow.
- Все внешние переходы должны быть явными: сайт, бот, Mini App.

## 6. Langame и клубная связка

- Гость геймификации хранится отдельно в `GuestGameProfile`.
- Публичная авторизация не создает общий `Guest`.
- Связь с общей базой гостей появляется позже через обычный Langame snapshot/foundation sync по подтвержденному `phoneHash`.
- Langame-сверка выполняется отдельно для каждого клуба, потому что баланс, бонусы и геймификация могут отличаться.
- Для Telegram contact-share backend запускает сверку сразу после подтверждения contact.
- Сверка идемпотентна на пару `profileId+storeId`.
- Повторный вход не должен заново дергать Langame, если уже есть saved match event.

## 7. Безопасность и приватность

- Не коммитить `.env`, bot token, sync token, SSH credentials.
- Не логировать raw phone, raw Telegram update, raw chat id, Langame payload.
- Все внешние tokens живут только на нужной VDS:
  - bot token на 1337;
  - Langame tokens на основной VDS;
  - shared secret синхронно на основной VDS и 1337.
- Edge принимает ответы только от основного API.
- Основной API принимает Telegram updates только с внутренним secret header.
- Mini App assertion должен иметь TTL и подпись.
- Отписка через бот должна блокировать будущие Telegram-доставки.

## 8. Наблюдаемость

Guest Game Hub должен показывать без секретов:

- readiness `Telegram update consumer (polling edge)`;
- readiness `TELEGRAM_MINI_APP`;
- режим polling/webhook;
- наличие required env;
- last update/canary status;
- next QA action.

Логи edge:

- update id;
- тип safe update;
- status основного API;
- факт replySent;
- aggregate error code.

Логи не должны содержать raw message/contact.

## 9. Приемочные критерии

### 9.1. Web

- На `/game/auth` и `/play` у Telegram-метода видна одна CTA `Войти через Telegram`.
- После клика открывается информационное окно.
- `Другой способ входа` переключает гостя на fallback.
- `Продолжить` создает challenge и открывает Telegram.
- Нет второй кнопки `Открыть бота`.

### 9.2. Бот

- `/start lp_...` приводит к запросу contact-share.
- Contact от другого Telegram user id отклоняется.
- После корректного contact-share бот показывает три варианта продолжения.
- Mini App не открывается принудительно.
- `Вернуться на сайт LeetPlus` ведет на `/game/clubs`.
- `Открыть Mini App` открывает `https://tg.leetplus.ru/game/app`.
- `Продолжить в боте` оставляет гостя в боте и показывает безопасное состояние.

### 9.3. Mini App

- Открывается внутри Telegram WebView.
- Валидирует `initData` на edge.
- Получает guest-token через основной API.
- Если доступно несколько клубов, сначала показывает выбор клуба.
- Главная страница соответствует mobile-first макету.
- Нет horizontal overflow и перекрытия safe-area.
- История наград и bonus ledger показываются без raw phone/token/payload.

### 9.4. Edge/VDS

- `./telegram-webhook-remote.sh info` показывает пустой webhook.
- `telegram-poller` работает один.
- `telegram-edge` отправляет `replyMarkup` из основного API без хардкода Mini App-only кнопки.
- `telegram-mini-app-web` отвечает на `/game/app`.
- `/api/guest-portal/gamification/clubs` через edge proxy возвращает HTTP 200.

## 10. Тесты и проверки

Обязательные перед merge/deploy:

```bash
pnpm --filter api test -- guest-portal.service.spec.ts telegram-edge-adapter.spec.ts telegram-edge-poller.cli.spec.ts --runInBand
pnpm --filter api build
pnpm --filter web build
pnpm --filter api lint
pnpm --filter web lint
```

Для Mini App дополнительно:

- mobile/TG WebView smoke с mocked Telegram initData;
- проверка safe-area;
- проверка выбора клуба;
- проверка пустых состояний;
- проверка отсутствия raw data в сетевых ответах.

Production canary:

```text
/game/auth -> Telegram -> /start lp_... -> contact-share
ожидаемо: TELEGRAM_AUTH_START status=AWAITING_CONTACT replySent=true
ожидаемо: TELEGRAM_AUTH_CONTACT status=CONFIRMED replySent=true
ожидаемо в Telegram: сайт + Mini App + бот
ожидаемо на сайте: /game/clubs или /play/game
```

## 11. Rollback

- На 1337 включить `GUEST_GAME_TG_EDGE_DRY_RUN=true`.
- Перезапустить `telegram-edge`, `telegram-poller`, `telegram-mini-app-web`.
- Для отключения Mini App убрать `GUEST_GAME_TELEGRAM_MINI_APP_URL` на основной VDS.
- Для остановки Telegram-входа остановить `telegram-poller` или убрать `GUEST_GAME_TELEGRAM_WEBHOOK_SECRET` на основной VDS.
- Web fallback должен оставаться доступен через звонок пользователя на номер и SMS-код.

## 12. Вне рамок этого ТЗ

- Реальный Telegram broadcast/reward delivery через `bot-consumer` без dry-run.
- Массовые маркетинговые рассылки.
- Langame write API вне bonus ledger.
- Полноценный админский конструктор bot-сценариев.
- Платежи, депозиты и денежный баланс в Mini App как отдельная wallet-фича.
