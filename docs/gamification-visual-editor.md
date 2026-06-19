# Визуальный редактор геймификации

Дата: 19.06.2026

## Назначение

Визуальный редактор в `/guests/gamification` позволяет оператору сети настраивать гостевую главную страницу игрового модуля через preview, не выходя из бизнес-раздела. Текущий рабочий интерфейс остается режимом `Расширенные настройки`, а новый режим `Визуальный редактор` показывает безопасный preview выбранного клуба и инспектор выбранного блока.

Редактор работает по схеме `черновик -> публикация`: изменения сохраняются в draft и не меняют live-правила до явной публикации.

## Данные и границы безопасности

- `GuestGameVisualDraft` хранит tenant/store scope, payload редактора, статус, дату публикации и audit-поля.
- `GuestGameSeason.storeIds` задает клубную область Battle Pass; пустой список означает весь tenant.
- `GuestGamePromoCard` хранит события и акции гостевой главной страницы без блока коллабораций.
- Preview строится для demo-гостя выбранного клуба, не требует guest-token, не пишет игровые события и не раскрывает raw phone, токены или Langame payload.
- Опубликованные promo/check-in/Battle Pass данные попадают в общий `GET /guest-portal/session/game-summary`, поэтому web guest home и Telegram Mini App получают одну модель данных.

## API

- `GET /guests/gamification/visual-editor/draft?id=&storeId=` - получить существующий draft или собрать его из live-правил выбранного клуба.
- `PATCH /guests/gamification/visual-editor/draft` - сохранить черновик.
- `POST /guests/gamification/visual-editor/draft/publish` - валидировать и применить draft в live-правила.
- `GET /guests/gamification/visual-editor/preview?id=&storeId=` - получить безопасный preview-summary.
- `GET /guests/gamification/promo-cards` - получить текущие promo cards.

## Что редактируется в v1

- Battle Pass: количество уровней, XP на уровень, награды уровней, главный приз сезона и клубная область.
- Лутбоксы: карточки, награда, условие получения и лимит на гостя.
- Квесты: тип, триггер, цель прогресса, XP, награда и шаги цепочки.
- События/акции: label, title, description, tag, period, status, target anchor.
- Чек-ин: включение/выключение и обязательная награда в XP или бонусах.

## Правила публикации

- Публикация блокируется, если включен чек-ин без выбранной награды.
- Чек-ин публикуется как управляемое правило `CHECK_IN`.
- Гостевая кнопка чек-ина показывается только при активном check-in rule для выбранного клуба.
- Battle Pass, лутбоксы, квесты и promo cards применяются tenant-scoped и store-scoped, без live-запросов в Langame.

## Проверки

- API regression: draft preview не меняет live-правила.
- API regression: check-in validation требует XP или bonus reward.
- Сборки: `pnpm --filter api build`, `pnpm --filter web build`, `pnpm --filter database db:generate`.
- Полный старый spec `guest-gamification.service.spec.ts` сейчас содержит не связанные с редактором ожидания с битой кодировкой русских строк; новые visual-editor тесты проходят отдельно.
