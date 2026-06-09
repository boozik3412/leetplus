# Langame Public API

Последняя проверка: 2026-06-09.

Актуальная документация: https://46.langamepro.ru/public_api/doc

Документация отдает OpenAPI 3.0 внутри HTML в `<script id="swagger-data" type="application/json">`.
При проектировании интеграций Langame сначала сверяйся с этой страницей и затем проверяй фактический ответ endpoint через диагностику или прямой запрос с ключом.

## Авторизация

- Большинство read-only методов используют `Standalone` / `X-API-KEY`.
- `/public_api/routes` требует `api_key` в query string и также поддерживается нашим клиентом с header `X-API-KEY`.
- Прямой вызов `https://46.langamepro.ru/public_api/routes` без ключа возвращает `400 Validation failed`, поле `api_key` обязательно.
- В LeetPlus production безопасная проверка маршрутов идет через `/integrations/langame/routes-diagnostics`; endpoint доступен только OWNER/ADMIN и не раскрывает ключ.

## Маршруты Из Документации

На 2026-06-09 документация содержит 32 маршрута: 30 GET и 2 POST.

| Method | Path | Группа | Назначение |
| --- | --- | --- | --- |
| GET | `/balances/list` | Балансы | Список пополнений баланса гостями |
| GET | `/clubs/list` | Клубы | Список клубов |
| GET | `/config/list` | Глобальная конфигурация | Получить конфигурацию |
| GET | `/global/linking_pc_by_type/list` | Общие настройки | Привязка ПК по типам |
| GET | `/global/types_of_pc_in_clubs/list` | Общие настройки | Типы ПК в клубах |
| GET | `/goods/list` | Остатки по складам | Остатки по складам |
| POST | `/guests/search` | Гости | Поиск гостей |
| GET | `/guests/balance` | Гости | Балансы пользователей |
| GET | `/guests/bonus_balance` | Гости | Бонусные балансы пользователей |
| GET | `/guests/{guest_id}` | Гости | Получить гостя по ID |
| GET | `/guests/groups` | Гости | Группы пользователей |
| GET | `/guests/list` | Гости | Список пользователей |
| GET | `/guests/logs` | Гости | Логи пользователей |
| GET | `/guests/sessions` | Гости | Сессии пользователей |
| POST | `/pc/manage` | Компьютеры | Управление компьютерами |
| GET | `/products/arrival` | Товары | Поступления товаров |
| GET | `/products/expense` | Товары | Продажи товаров |
| GET | `/products/list` | Товары | Список товаров |
| GET | `/puf/profiles/list` | Конфигурация личных файлов пользователя | Список профилей |
| GET | `/routes` | Маршруты | Список маршрутов, доступных по API-ключу |
| GET | `/tariffs/by_days/list` | Тарифы | Группы типов дней к дате |
| GET | `/tariffs/groups/list` | Тарифы | Типы групп для тарифа |
| GET | `/tariffs/time_period/list` | Тарифы | Тарифы |
| GET | `/tariffs/types_groups/list` | Тарифы | Типы групп тарифов |
| GET | `/transactions/list` | Транзакции | Лог операций с деньгами |
| GET | `/users/list` | Администраторы и пользователи | Получить список всех пользователей |
| GET | `/ver/get_po` | Версии переменных | Файлы для админ ПО |
| GET | `/ver/get_adminconsole` | Версии переменных | Конфигурация для админ ПО |
| GET | `/ver/get_terminal` | Версии переменных | Конфигурация для терминала |
| GET | `/all_operations_log/list` | Рабочее пространство управляющего | Лог операций |
| GET | `/log_cash_transaction/list` | Рабочее пространство управляющего | Лог кассовых операций |
| GET | `/working_shifts/list` | Рабочее пространство управляющего | Список смен и их информация |

## Важные DTO Для Блока Персонала

`UsersListResponseDTO`:

- `id`, `email`, `username`, `admin_status`, `verified`, `comment`, `registered`, `last_login`
- `phone`, `birthday`, `work_schedule`, `identity_document`, `identity_document_data`
- `guest_id`, `work_point`

`WorkingShiftsListResponseDTO`:

- `id`, `list_clubs_id`, `user_id`
- `date_start`, `date_stop`
- `start`, `nal`, `beznal`, `refunds_nal`, `refunds_beznal`
- `mobile_pay`, `yandex_pay`, `incass`, `middle_check`, `message`

`TransactionsListResponseDTO`:

- `id`, `date_update`, `working_shift_id`, `list_clubs_id`, `guest_id`, `session_id`, `UUID`
- `balance`, `bonus_balance`, `payment_1C`, `admin`, `cancel`, `Beznal`, `mobile`, `soft`, `comment`

`AllOperationsLogListResponseDTO`:

- `date_normal`, `date`, `time`, `club_id`, `club_name`, `type`, `name`, `source`, `form`, `sum`
- `date_fiscal`, `fn_number`, `fiscal_number`

`LogCashTransactionResponseDTO`:

- `date`, `Beznal`, `type`, `name`, `price`, `count`, `admin`, `sum`, `comment`

`GuestsSessionsResponseDTO`:

- `id`, `guest_id`, `date_start`, `date_stop`, `UUID`
- `normal_stop`, `expand`, `create_by_rezerv`, `packet`

## Что Это Дает Персоналу

- Для автоматического определения текущей смены администратора нужны `working_shifts.user_id`, `date_start`, `date_stop`, `list_clubs_id` и связь с `/users/list`.
- Для понятной заявки на привязку нужен кандидат из Langame: `user_id`, ФИО или username/email из `/users/list`, клуб/точка `work_point`, открытая смена из `/working_shifts/list`.
- Для выручки смены нужны кассовые поля смены, транзакции, операции и продажи товаров: `working_shift_id`, `list_clubs_id`, суммы, типы оплаты, возвраты, отмены.
- Для гостей на смене нужны `guests/sessions` и связь по времени смены, клубу и `guest_id`.
- Для контроля ПК и загрузки полезны `/global/types_of_pc_in_clubs/list`, `/global/linking_pc_by_type/list`; write-route `/pc/manage` пока использовать только после отдельного подтверждения безопасного write-сценария.

## Замечания По Контракту

- В документации 2026-06-09 у `/working_shifts/list` указаны только `page` и `page_limit`. Текущий клиент LeetPlus отправляет также `date_from/date_to`; это нужно перепроверять на фактических ответах production-источников, потому что прежняя интеграция работала с датами.
- Все новые интеграции должны логировать только техническую диагностику и маскировать ключи/секреты. Сырые значения payload не выводить в UI без явной необходимости.
