# LeetPlus

LeetPlus — SaaS-приложение для управления ассортиментом компьютерных клубов. Цель проекта: помогать сетям клубов видеть продажи, остатки, прибыльность, риски out-of-stock, рекомендации по пополнению и влияние списаний/возвратов.

## Стек

- Monorepo: `pnpm workspaces`
- Frontend: `Next.js`, `React`, `TypeScript`, `Tailwind CSS`
- Backend: `NestJS`, `TypeScript`
- Database: `PostgreSQL`, `Prisma 6.19.3`
- Cache/infra: `Redis`
- Email dev: `Mailpit` или `maildev`
- Интеграция: `LAngame Public API`

## Структура

```text
apps/
  api/      NestJS API
  web/      Next.js web app
packages/
  database/ Prisma schema, migrations, seed
```

## Локальная база данных

В проекте используется один локальный вариант БД: PostgreSQL в WSL.

Docker больше не поднимает PostgreSQL, чтобы не путать источники данных. В `docker-compose.yml` оставлены только вспомогательные сервисы:

- `redis`
- `mailpit`

Проверить БД:

```powershell
wsl env PGPASSWORD=leetplus_password psql -h 127.0.0.1 -U leetplus -d leetplus -c "select 1;"
```

## Переменные окружения

Пример лежит в `.env.example`.

Минимально нужны:

```env
DATABASE_URL="postgresql://leetplus:leetplus_password@127.0.0.1:5432/leetplus?schema=public"
JWT_SECRET="change_me_in_development"
APP_ENCRYPTION_KEY="change_me_32_plus_chars_in_production"
NEXT_PUBLIC_API_URL="http://localhost:4000"
```

Для LAngame API ключ не нужно хранить в репозитории. Пользователь может сохранить ключ через UI в `/settings`; backend сохранит его в БД в зашифрованном виде.

`APP_ENCRYPTION_KEY` обязателен для production. Его нужно задать до первого сохранения реальных API-ключей пользователей. Если ключ потерять или заменить без процедуры ротации, сохранённые API-ключи нельзя будет расшифровать.

Сгенерировать ключ:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Установка

```powershell
pnpm install
```

## Миграции и Prisma

Локальная разработка:

```powershell
pnpm --filter database db:migrate
```

Production/VDS:

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

## Seed

Seed создаёт demo tenant, справочники, товары, магазины, продажи, остатки, списания и возвраты.

```powershell
pnpm --filter database db:seed
```

Тестовый пользователь:

```text
Логин: 123@123.ru
Пароль: 12345678
Роль: OWNER
Tenant: demo
```

## Запуск

Запуск API и Web вместе:

```powershell
pnpm dev
```

Отдельно:

```powershell
pnpm dev:api
pnpm dev:web
```

Обычно:

- Web: `http://localhost:3000`
- API: `http://localhost:4000`

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

## Основные возможности

- Авторизация и email verification
- Tenant-scoped данные
- CRUD справочников: категории, поставщики, товары, клубы
- CSV импорт:
  - товары
  - продажи
  - остатки
  - списания/возвраты
- CSV-шаблоны на странице `/import`
- Dashboard с KPI
- Отчёты:
  - ассортимент
  - операции
  - ABC-анализ
  - ТОП SKU
  - ТОП поставщиков
  - остатки и потребность
- CSV/XLSX экспорт отчётов
- Email-отправка отчётов
- LAngame integration settings и ручная синхронизация

## LAngame API

Документация:

```text
https://443.langame.ru/public_api/doc
```

Базовый URL для домена:

```text
https://<domain>/public_api
```

Авторизация:

```text
Header: X-API-KEY
```

Ключевые методы:

- `GET /clubs/list` — клубы/точки
- `GET /products/list` — товары
- `GET /goods/list?club_id=...` — остатки
- `GET /products/expense?page_limit=&page=&date_from=&date_to=` — продажи товаров
- `GET /products/arrival?page_limit=&page=` — поступления
- `GET /transactions/list` — денежные операции
- `GET /log_cash_transaction/list` — кассовые операции
- `GET /all_operations_log/list` — общий лог операций

Подключение выполняется на странице `/settings`:

1. Вставить API-ключ.
2. Указать домены клубов построчно.
3. Сохранить настройки.
4. Запустить синхронизацию.

Данные LAngame сохраняются строго в рамках текущего `tenantId`.

## Домены текущей сети

```text
1337.langame.ru      Екатеринбург, ул. Радищева, 12
443.langame.ru       Екатеринбург, ул. Родонитовая, 33
46.langamepro.ru     Ижевск, ул. Пушкинская, 217
46.langamepro.ru     Ижевск, ул. Холмогорова, 43
```

Адрес `Холмогорова, 43` взят из LAngame API и используется как источник истины.

## Multi-tenancy и доступы

`Tenant` — сеть клубов. Пользователь принадлежит одному tenant и видит только данные своей сети.

`Store` — конкретный клуб/точка. Для LAngame хранятся:

- `externalProvider`
- `externalDomain`
- `externalClubId`
- `integrationSourceId`

`IntegrationCredential` хранит зашифрованный API-ключ tenant.

`IntegrationSource` хранит домены/источники интеграции tenant.

## Production/VDS checklist

Перед деплоем:

1. Настроить production `.env`.
2. Сгенерировать и сохранить постоянный `APP_ENCRYPTION_KEY`.
3. Настроить PostgreSQL на VDS или managed PostgreSQL.
4. Выполнить:

```powershell
pnpm --filter database db:deploy
pnpm --filter database db:generate
```

5. Настроить SMTP.
6. Настроить reverse proxy и HTTPS.
7. Настроить backup PostgreSQL.
8. Проверить `api build`, `web build`, миграции и login.

## Важные правила

- Не коммитить `.env` и реальные API-ключи.
- Не менять Prisma на v7 без отдельного решения.
- Не поднимать вторую PostgreSQL в Docker локально, чтобы не путать данные.
- Для production не менять `APP_ENCRYPTION_KEY` без процедуры ротации.
