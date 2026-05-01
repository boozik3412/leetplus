# LeetPlus

LeetPlus — SaaS-система для управления ассортиментом компьютерных клубов и сетей клубов. Продукт помогает видеть продажи товаров, остатки, прибыльность, риски дефицита, рекомендации к заказу и качество выкладки по всей сети в едином интерфейсе.

## Текущий статус

На 01.05.2026 приложение развернуто в production на VDS и доступно по домену `https://leetplus.ru`.

- web: `https://leetplus.ru`
- api: `https://api.leetplus.ru`
- ветка production: `main`
- автообновление VDS: включено, сервер проверяет `origin/main` каждую минуту через `leetplus-deploy.timer`
- SSL: выпущен Let's Encrypt сертификат для `leetplus.ru`, `www.leetplus.ru`, `api.leetplus.ru`
- временные demo/seed-товары удалены из production-БД
- LAngame-данные загружены по активным источникам; в админ-панели видны 3 источника, 6 клубов, 1360 товаров и 84440 продаж
- известный текущий нюанс: по `46.langamepro.ru` товары, остатки и продажи загрузились, но job помечен `FAILED`, потому что внешний LAngame API вернул `500 Internal Server Error` на этапе получения общей выручки клуба

## Что уже реализовано

### Дашборд

- KPI по выручке, прибыли, списаниям, остаткам и риску `out-of-stock`
- динамика продаж в деньгах и штуках по 8 сегментам выбранного периода
- быстрый запуск синхронизации прямо с дашборда
- ТОП SKU по выручке
- переходы из KPI-блоков в соответствующие разделы системы
- поддержка сетевой группировки SKU через канонические товары

### Отчёты

- рекомендации по ассортименту и пополнению
- исключения из OOS-рекомендаций с типами `Сделать услугой` и `В исключение`
- `Риск out-of-stock`
- `Товары без продаж` с переключателями `7 / 14 / 21` дней
- `Остатки и потребность`
- ABC-анализ с переключением между выручкой и прибылью
- ТОП SKU
- SKU с низкой маржой
- полные табличные страницы для ключевых отчётов
- экспорт отчётов в `CSV` и `XLSX`
- экспорт полных таблиц в `Excel`, `1C` и `PDF`
- отправка отчётов на email

### Справочники и операции

- категории
- поставщики
- клубы
- товары
- inline-редактирование товаров
- сортировка, фильтры и отдельное окно для полной товарной таблицы

### Импорт данных

- импорт товаров из CSV
- импорт продаж, остатков, списаний и возвратов из CSV
- предварительная проверка CSV перед загрузкой
- шаблоны CSV на странице `/import`
- история и служебные маршруты импорта на backend

### Интеграции и утилиты

- подключение `LAngame Public API`
- ручная синхронизация из интерфейса
- сервисный endpoint для плановой синхронизации на VDS
- валидация доменов LAngame: домены вводятся через `, ` или каждый с новой строки, без протокола и пути
- синхронизация длинных периодов дробится на интервалы до 365 дней для совместимости с LAngame API
- утилита умного парсинга товаров между клубами
- подтверждение/отклонение найденных групп
- создание канонических SKU для сетевой отчётности

### Доступ и мультиарендность

- регистрация и вход
- подтверждение email
- tenant-scoped данные
- роли пользователей внутри tenant

## Технологии

- monorepo: `pnpm workspaces`
- frontend: `Next.js 16`, `React 19`, `TypeScript`, `Tailwind CSS 4`
- backend: `NestJS 11`, `TypeScript`
- database: `PostgreSQL`, `Prisma 6.19.3`
- email для разработки: `Mailpit`
- интеграция: `LAngame Public API`

`Redis` поднят как инфраструктурный сервис в `docker-compose.yml`, но на текущем этапе не является обязательной частью прикладной логики.

## Структура репозитория

```text
apps/
  api/      NestJS API
  web/      Next.js web app
packages/
  database/ Prisma schema, migrations, seed
```

## Локальная разработка

### База данных

Локально проект ожидает один источник PostgreSQL. В текущем процессе разработки используется PostgreSQL вне Docker, обычно в WSL.

`docker-compose.yml` поднимает только вспомогательные сервисы:

- `redis`
- `mailpit`

Проверка подключения к БД:

```powershell
wsl env PGPASSWORD=leetplus_password psql -h 127.0.0.1 -U leetplus -d leetplus -c "select 1;"
```

### Переменные окружения

Базовый пример лежит в `.env.example`.

Минимальный набор для запуска:

```env
DATABASE_URL="postgresql://leetplus:leetplus_password@127.0.0.1:5432/leetplus?schema=public"
JWT_SECRET="change_me_in_production"
APP_ENCRYPTION_KEY="change_me_32_plus_chars_in_production"
WEB_URL="http://localhost:3000"
API_URL="http://localhost:4000"
NEXT_PUBLIC_API_URL="http://localhost:4000"
```

Дополнительно для почты и сервисной синхронизации:

```env
MAIL_HOST="localhost"
MAIL_PORT="1025"
MAIL_FROM="LeetPlus <no-reply@leetplus.ru>"
SYNC_SERVICE_TOKEN="change_me_for_cron"
```

`APP_ENCRYPTION_KEY` нужно задать до первого сохранения реальных ключей интеграции. Если заменить его без ротации, сохранённые API-ключи нельзя будет расшифровать.

Сгенерировать ключ:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Установка и запуск

Установка зависимостей:

```powershell
pnpm install
```

### Текущий репозиторий

- локальное имя проекта: `leetplus`
- основной remote: `origin`
- URL репозитория: `https://github.com/boozik3412/leetplus.git`
- основная ветка: `main`
- тип репозитория: monorepo с приложениями `apps/web`, `apps/api` и пакетом `packages/database`

Если проект клонируется заново, базовая последовательность выглядит так:

```powershell
git clone https://github.com/boozik3412/leetplus.git
cd leetplus
pnpm install
```

## Production / VDS

Продакшн-развертывание доступно по адресам:

- web: `https://leetplus.ru`
- www: `https://www.leetplus.ru`
- api: `https://api.leetplus.ru`

Инфраструктура:

- VDS: Ubuntu 24.04 LTS
- приложение на сервере: `/home/admin/leetplus`
- web: Next.js, systemd unit `leetplus-web.service`, порт `127.0.0.1:3000`
- api: NestJS, systemd unit `leetplus-api.service`, порт `4000`
- reverse proxy: `nginx`
- database: PostgreSQL 16
- cache/service dependency: Redis
- SSL: Let's Encrypt certificate for `leetplus.ru`, `www.leetplus.ru`, `api.leetplus.ru`
- nginx proxy timeout: 15 минут для длинных ручных синхронизаций

DNS-записи `leetplus.ru`, `www.leetplus.ru` и `api.leetplus.ru` должны указывать на VDS. Если в браузере видна заглушка хостинга, сначала проверить DNS-кэш провайдера или локальной машины:

```powershell
Resolve-DnsName leetplus.ru -Type A
Resolve-DnsName api.leetplus.ru -Type A
```

Быстрая проверка продакшна:

```powershell
curl -I https://leetplus.ru/login
curl https://api.leetplus.ru/dashboard/summary
```

Автообновление настроено через systemd timer `leetplus-deploy.timer`. Скрипт `/usr/local/bin/leetplus-deploy.sh` на VDS проверяет `origin/main`, при наличии нового коммита выполняет:

```bash
git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm --filter database db:generate
pnpm --filter database db:deploy
pnpm build
systemctl restart leetplus-api.service
systemctl restart leetplus-web.service
```

Запуск защищён через `flock`, чтобы два деплоя не выполнялись параллельно. Git на VDS настроен с `safe.directory=/home/admin/leetplus` для работы systemd-сервиса.

Ручная проверка сервисов на VDS:

```bash
systemctl status leetplus-api.service
systemctl status leetplus-web.service
systemctl status leetplus-deploy.timer
```

Запуск web и api вместе:

```powershell
pnpm dev
```

Запуск по отдельности:

```powershell
pnpm dev:web
pnpm dev:api
```

Обычно используются адреса:

- web: `http://localhost:3000`
- api: `http://localhost:4000`
- mailpit: `http://localhost:8025`

## Prisma, миграции и seed

Локальная разработка:

```powershell
pnpm --filter database db:migrate
```

Production / VDS:

```powershell
pnpm --filter database db:deploy
```

Генерация Prisma Client:

```powershell
pnpm --filter database db:generate
```

Проверка статуса миграций:

```powershell
pnpm --filter database exec prisma migrate status
```

Demo seed:

```powershell
pnpm --filter database db:seed
```

Seed создаёт demo tenant, справочники, товары, клубы, продажи, остатки, списания и возвраты.

Тестовый пользователь:

```text
Логин: 123@123.ru
Пароль: 12345678
Роль: OWNER
Tenant: demo
```

## Проверки

Все workspace:

```powershell
pnpm lint
pnpm build
```

API:

```powershell
pnpm --filter api lint
pnpm --filter api test
pnpm --filter api test:e2e
pnpm --filter api build
```

Web:

```powershell
pnpm --filter web lint
pnpm --filter web build
```

## LAngame

Подключение выполняется через `/settings`:

1. Указать API-ключ.
2. Добавить домены клубов.
3. Сохранить настройки.
4. Запустить синхронизацию.

Домены клубов вводятся одним из двух способов:

- через запятую с пробелом: `1337.langame.ru, 443.langame.ru`
- каждый домен с новой строки

В доменах не нужно указывать `https://` и путь `/public_api`; приложение нормализует домен и само формирует базовый URL вида `https://<domain>/public_api`.

Ключ сохраняется на backend в зашифрованном виде и привязывается к текущему `tenant`.

Базовый URL домена:

```text
https://<domain>/public_api
```

Заголовок авторизации:

```text
X-API-KEY
```

Ключевые методы, используемые интеграцией:

- `GET /clubs/list`
- `GET /products/list`
- `GET /goods/list?club_id=...`
- `GET /products/expense?page_limit=&page=&date_from=&date_to=`
- `GET /products/arrival?page_limit=&page=`
- `GET /transactions/list`
- `GET /log_cash_transaction/list`
- `GET /all_operations_log/list`

### Текущий статус LAngame

На production подключены источники:

- `1337.langame.ru`
- `443.langame.ru`
- `46.langamepro.ru`

После очистки demo-данных товары и факты в production формируются из LAngame API. Последняя ручная синхронизация успешно загрузила товары, остатки и продажи по всем источникам. Для `46.langamepro.ru` внешний API LAngame вернул `500 Internal Server Error` на этапе `/all_operations_log/list`, поэтому sync job отображается как `FAILED`, хотя основные товарные данные по этому источнику уже сохранены.

### Плановая синхронизация

Для cron и сервисных вызовов предусмотрен endpoint:

```text
POST /integrations/langame/scheduled/sync
Header: x-sync-service-token: <SYNC_SERVICE_TOKEN>
```

Поддерживаемые режимы:

- `QUICK`
- `INVENTORY`
- `CATALOG`
- `BACKFILL`
- `FULL`

Пример вызова:

```powershell
curl -X POST "https://api.example.ru/integrations/langame/scheduled/sync" `
  -H "x-sync-service-token: <SYNC_SERVICE_TOKEN>" `
  -H "Content-Type: application/json" `
  -d "{\"mode\":\"QUICK\"}"
```

## Модель доступа

`Tenant` — сеть клубов. Пользователь принадлежит одному tenant и видит только данные своей сети.

`Store` — конкретный клуб внутри сети.

Для интеграции по клубам сохраняются внешние идентификаторы и домены, а tenant-уровневые ключи лежат в зашифрованном виде.

## Важные правила

- не коммитить `.env` и реальные API-ключи
- не менять Prisma на `v7` без отдельного решения
- не поднимать вторую PostgreSQL в Docker локально
- не менять `APP_ENCRYPTION_KEY` без процедуры ротации
