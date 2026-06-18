# План разработки Telegram Mini App для геймификации

Дата: 2026-06-17

Статус: реализовано в коде. Основной Telegram-вход через contact-share уже был готов; этот документ фиксирует спроектированный и реализованный слой TG Mini App поверх существующего гостевого игрового контура.

Обновление для VDS-разделения: Mini App поддерживает edge-режим, при котором отдельная Telegram VDS валидирует `initData` по bot token локально и передает в основной API только `telegramUserId/authDate` с `GUEST_GAME_TG_EDGE_SHARED_SECRET`. Это позволяет основной VDS работать без Telegram bot token для Mini App.

## Итог реализации

- Добавлен публичный маршрут `/game/app` для Telegram Mini App без employee-cookie.
- Добавлен API exchange `POST /guest-portal/telegram-mini-app/session`: он валидирует Telegram `initData`, проверяет `hash/auth_date`, ищет подтвержденный `GuestGameProfile` и выдает обычный guest-token только в scoped tenant/store контексте.
- Web proxy выставляет HttpOnly `leetplus_guest_token`, поэтому frontend не хранит token напрямую и дальше читает существующий `GET /guest-portal/session/game-summary`.
- Mini App UI собран в `apps/web/src/app/game/app` по готовому mobile/TG макету: sticky topbar, XP/level/progress, события, квесты, батлпасс, награды, лутбоксы, профиль, промокод и bottom navigation.
- Для Telegram identity с несколькими клубами реализован безопасный club selection перед выпуском scoped guest session.
- После успешного Telegram contact-share бот возвращает кнопку `web_app` для открытия Mini App.
- Guest Game Hub получил readiness-пункт `TELEGRAM_MINI_APP`, а runbook `docs/deployment/telegram-auth.md` описывает env, QA и rollback без раскрытия токенов, raw phone, raw chat id или Telegram update.

## Контекст

- Основной вход участника уже идет через `/play -> Telegram-бот -> contact-share -> GuestGameProfile -> guest-token`.
- `/play/game` уже работает как легкий публичный игровой экран по `GET /guest-portal/session/game-summary`.
- Готовый визуальный макет Mini App лежит локально: `C:\Users\ALIENWARE\Documents\New project\gamification-club-home-mobile-app-mockup.html`.
- Mini App должна переиспользовать отдельный `GuestGameProfile`, не создавать общий `Guest` публичной регистрацией и не возвращать raw phone, raw chat id, raw Telegram update, bot token или Langame payload во frontend/readiness/logs.

## Маршрут и границы

Рекомендуемый маршрут для Telegram WebApp: `/game/app`.

- `/game/auth` остается публичной точкой выбора игрового входа.
- `/play` остается совместимым публичным маршрутом регистрации и fallback-авторизации.
- `/play/game` остается совместимым игровым экраном после обычной web-регистрации.
- `/game/app` становится отдельной Mini App поверх Telegram `initData` и того же guest-token cookie, чтобы UI и QA Telegram WebView не смешивались с desktop/web fallback.

Технически для `/game/app` нужно добавить public proxy-доступ, потому что маршрут должен открываться без employee-cookie.

## Архитектура

1. Frontend `/game/app` получает `window.Telegram.WebApp.initData`, вызывает web proxy endpoint и не хранит Telegram raw data в localStorage.
2. Web proxy вызывает API exchange endpoint и при успешном ответе выставляет HttpOnly `leetplus_guest_token`, как уже делают `otp/verify`, `telegram-auth/status`, `user-call-auth/status` и `incoming-call-last4/verify`.
3. API валидирует Telegram `initData` по Bot Token, проверяет `hash`, `auth_date` и TTL, затем ищет подтвержденный `GuestGameProfile` по Telegram identity.
4. Если профиль не найден или телефон еще не подтвержден, API возвращает безопасный `AUTH_REQUIRED` с действием открыть `/game/auth` или deep link бота; phone-less профиль не создается.
5. Если у Telegram-пользователя есть несколько доступных клубов/профилей, API возвращает безопасный список клубов для выбора, а выпуск guest-token происходит после выбора tenant/store scope.
6. После получения guest-token Mini App читает существующий `GET /guest-portal/session/game-summary` и рендерит mobile-first главный экран.

## План разработки

### Этап 0. Аудит перед кодом

- Проверить актуальные контракты `guest-portal.service.ts`, `guest-gamification.service.ts`, `/play`, `/play/game`, `/game/auth`, Prisma-модели `GuestGameProfile`, link challenges и proxy public routes.
- Зафиксировать окончательный API path для exchange endpoint. Рекомендуемый вариант: `POST /guest-portal/telegram-mini-app/session`.
- Уточнить, можно ли использовать текущий `telegramIdentity` формат для поиска профиля без миграции, или нужен отдельный hash/alias слой для Mini App.

### Этап 1. Backend: Telegram initData session exchange

- Добавить DTO и сервисную функцию проверки Telegram Mini App `initData`.
- Проверять подпись, свежесть `auth_date`, отсутствие повторного доверия к неподписанным полям и сценарий пустого/битого `initData`.
- Находить только уже подтвержденный игровой профиль с телефоном/согласием; не создавать общий `Guest`.
- Возвращать статусы `CONFIRMED`, `AUTH_REQUIRED`, `CLUB_SELECTION_REQUIRED`, `EXPIRED`, `FAILED`.
- В успешном ответе выдавать обычный guest-token и safe portal/game summary bootstrap без raw Telegram данных.
- Покрыть unit/regression тестами валидный initData, неверный hash, просроченный auth_date, неподтвержденный Telegram-профиль, несколько клубов и отсутствие raw phone/chat id в ответе.

### Этап 2. Web proxy и route

- Добавить Next route proxy для Mini App exchange, который выставляет `leetplus_guest_token` cookie при `CONFIRMED`.
- Открыть `/game/app` в `proxy.ts` как публичный guest route.
- Добавить page/client `apps/web/src/app/game/app`, который умеет состояния loading, auth required, club selection, ready, error.
- Не тянуть тяжелые desktop-компоненты и не делать waterfall: exchange и summary должны стартовать рано, независимые запросы - параллельно.

### Этап 3. Mini App UI по макету

- Перенести макет в React/Tailwind как code-native UI, не как iframe/скриншот.
- Сохранить mobile-first ширину, `viewport-fit=cover`, safe-area, sticky topbar, темную палитру, радиусы до 8px, горизонтальные swipe-ленты и bottom navigation.
- Поднять квесты выше вторичных блоков: `Главная -> События -> Квесты -> Батлпасс -> Награды/лутбоксы -> Профиль`.
- Использовать данные `game-summary`: XP/level/progress, featured missions, battle pass levels, rewards, bonus history, referral, profile и next actions.
- Реализовать bottom navigation `Главная / Квесты / Награды / Профиль` через якоря/scroll и активное состояние.
- Добавить Telegram WebApp lifecycle: `ready()`, `expand()`, theme/safe-area handling и graceful fallback в обычном браузере.

### Этап 4. Бот и readiness

- После успешного contact-share возвращать в Telegram reply кнопку открытия Mini App через `web_app.url`.
- Добавить env/readiness для Mini App URL и Bot Token без вывода значений секретов.
- Обновить `docs/deployment/telegram-auth.md`: как включить кнопку Mini App, как проверить `/game/app` внутри Telegram, как откатить на `/play`.
- В Guest Game Hub добавить отдельный readiness-пункт `TELEGRAM_MINI_APP`, чтобы оператор видел route, bot menu/button readiness, initData validation и следующий QA-шаг.

### Этап 5. QA и запуск

- Targeted API tests: `guest-portal.service.spec.ts` для initData exchange.
- Targeted web tests или Playwright smoke: mobile viewport 390x844, Telegram WebView mock, отсутствие horizontal overflow, работоспособность bottom nav, загрузка summary, auth-required state.
- Проверить, что raw phone/chat id/secrets не появляются в API response, readiness, console logs и документации.
- Запустить `lint/build` после кода; для UI дополнительно browser/Playwright fidelity QA по мобильному viewport.
- Production rollout: сначала `/game/app` hidden behind bot button/env, затем тест на клубе 1337, затем включение Mini App-кнопки в основном Telegram-входе.

## Бэклог

| ID | Статус | Задача | Acceptance criteria |
| --- | --- | --- | --- |
| TG-MINI-01 | Готово | Утвердить `/game/app` как отдельный route Mini App и открыть его в public proxy. | `/game/app` открывается без employee-cookie, `/game/auth`, `/play` и `/play/game` сохраняют текущую роль. |
| TG-MINI-02 | Готово | Реализовать API exchange `initData -> guest-token`. | Валидный Telegram `initData` для подтвержденного профиля выдает guest-token; неверный/просроченный initData отклоняется; общий `Guest` не создается. |
| TG-MINI-03 | Готово | Добавить web proxy exchange с установкой HttpOnly guest cookie. | Frontend не видит token напрямую, после exchange существующий `session/game-summary` работает без нового auth-контракта. |
| TG-MINI-04 | Готово | Собрать `/game/app` UI по mobile/TG макету. | Видны sticky club/level header, XP/level/progress, события, квесты, батлпасс, награды, профиль, промокод, история наград и bottom nav без horizontal overflow. |
| TG-MINI-05 | Готово | Подключить club selection для нескольких профилей/клубов. | Если Telegram identity связан с несколькими клубами, гость выбирает клуб из безопасного списка, затем получает scoped guest session. |
| TG-MINI-06 | Готово | Добавить Mini App кнопку в Telegram reply/menu после contact-share. | После подтверждения телефона бот предлагает открыть Mini App; raw chat id не возвращается в браузер и не пишется в docs/logs. |
| TG-MINI-07 | Готово | Добавить readiness/diagnostics `TELEGRAM_MINI_APP` в Guest Game Hub. | Оператор видит включенность route, наличие URL/token, статус initData validation, следующий QA-шаг и runbook без секретов. |
| TG-MINI-08 | Готово | Покрыть backend/frontend тестами и мобильной QA. | Есть tests для initData validation и mobile browser smoke; `lint/build` проходят перед merge/deploy. |

## Не входит в первый этап

- MAX Mini App до подтвержденного API-контракта и юридической подготовки.
- Live-запросы в Langame из Mini App.
- Создание общего `Guest` из Telegram `initData` без подтвержденного телефона.
- Хранение raw Telegram update, raw phone, raw chat id или bot token во frontend, readiness или документации.
