# Роли, обязательные права и tenant-контекст администратора платформы

| Поле                | Значение                                   |
| ------------------- | ------------------------------------------ |
| Статус              | `DEPLOYED BASELINE / ADMITTED LANDING CANDIDATE` |
| Версия              | 1.1.0                                      |
| Дата                | 28.08.2026                                 |
| Владелец            | LeetPlus engineering / operations          |
| Production baseline | `8d49f2d7fa3b35c2f5bd87a4e4b7fc522f4324a4` |
| Landing candidate   | `359e5aeb1a7e0b53197747ef781adaf166baf6d3`; production deploy pending |

Документ фиксирует фактическую deployed-модель доступа после открытия
коммуникаций для всех системных ролей, восстановления рабочих разделов
администраторов и введения явного tenant-контекста для администратора
платформы. Карта домашних маршрутов ниже уже merged и admitted, но станет
production baseline только после отдельного deploy и canary.

## Источники полномочий

Доступ определяется не одной ролью, а пересечением нескольких независимых
ограничений:

1. Системная роль, custom role или tenant-level override задаёт capability.
2. Persisted `AccessScope` задаёт охват внутри tenant: вся сеть (`NETWORK`) или
   явный непустой список клубов (`STORES`).
3. Fresh scope перечитывается из PostgreSQL на защищённых запросах. Старый JWT,
   пустой `STORES` и противоречивый scope завершаются отказом.
4. Module entitlement, состояние tenant и parent-resource policy могут только
   сузить доступ.

Capability никогда не расширяет tenant или список разрешённых клубов. Право
`manage_*` также не отменяет проверки fresh scope и parent resource.

## Матрица системных ролей по умолчанию

Обозначения: `R` — просмотр, `RW` — просмотр и предусмотренные capability
изменения, `—` — модуль не входит в стандартный набор роли. `RW` является
верхней границей capability, а не безусловным разрешением любой операции.

| Роль                   | Dashboard и отчёты                | Гости, gamification, marketing | Коммуникации | Персонал                                                                                                | Users | Интеграции и sync | Данные, товары, utilities |
| ---------------------- | --------------------------------- | ------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------- | ----- | ----------------- | ------------------------- |
| `OWNER`                | `RW`                              | `RW`                           | `RW`         | `RW`                                                                                                    | `RW`  | `RW`              | `RW`                      |
| `ADMIN`                | `RW`                              | `RW`                           | `RW`         | `RW`                                                                                                    | `RW`  | `RW`              | `RW`                      |
| `MANAGER`              | `RW`                              | `RW`                           | `RW`         | `RW`                                                                                                    | `RW`  | `—`               | `RW`                      |
| `BUYER`                | отчёты и ассортимент `R`, export  | `—`                            | `R`          | `—`                                                                                                     | `—`   | `—`               | products `RW`, utilities  |
| `MARKETER`             | dashboard и assortment report `R` | `RW`                           | `R`          | `—`                                                                                                     | `—`   | `—`               | `—`                       |
| `CLUB_MANAGER`         | `RW`                              | `RW`                           | `RW`         | `RW`                                                                                                    | `—`   | `—`               | `—`                       |
| `STANDARDS_MANAGER`    | dashboard `R`                     | `—`                            | `RW`         | все разделы `R`; задачи, регламенты, обучение, контроль, справочник, зарплата и knowledge workflow `RW` | `RW`  | `—`               | `—`                       |
| `SENIOR_ADMINISTRATOR` | `—`                               | подтверждение игровых наград   | `RW`         | все разделы `R`; задачи и обучение `RW`                                                                 | `—`   | `—`               | `—`                       |
| `CLUB_ADMINISTRATOR`   | `—`                               | подтверждение игровых наград   | `RW`         | все разделы `R`; задачи и обучение `RW`                                                                 | `—`   | `—`               | `—`                       |
| `TRAINEE`              | `—`                               | `—`                            | `RW`         | смена, задачи, регламенты, обучение и база знаний `R`; обучение `RW`                                    | `—`   | `—`               | `—`                       |

`view_staff` является родительской capability для read-доступа к дочерним
разделам персонала. Поэтому роли с этой capability видят дочерние разделы, но
не получают соответствующие `manage_staff_*` автоматически.

## Обязательный минимум при custom role и role override

Если у пользователя есть custom role или для системной роли задан tenant-level
override, его разрешения объединяются с обязательным минимумом. Этот минимум
нельзя снять пустым или урезанным override.

| Роль                                           | Непонижаемый минимум                                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `OWNER`                                        | коммуникации `R`; knowledge `R/edit/review/publish`                                                 |
| `ADMIN`                                        | коммуникации `R`; `view_staff`; задачи, регламенты и knowledge `R`; knowledge `edit/review/publish` |
| `MANAGER`                                      | коммуникации `R`; knowledge `R/edit/review/publish`                                                 |
| `BUYER`, `MARKETER`, `CLUB_MANAGER`, `TRAINEE` | коммуникации `R`                                                                                    |
| `STANDARDS_MANAGER`                            | весь стандартный набор роли                                                                         |
| `SENIOR_ADMINISTRATOR`, `CLUB_ADMINISTRATOR`   | коммуникации `R`; `view_staff`; задачи, регламенты и knowledge `R`                                  |

`view_communications` является обязательным минимумом для каждой системной
роли. `manage_communications` не является глобальным минимумом: оно остаётся
в стандартном наборе только тех ролей, которым разрешены действия записи.

## Пользовательские маршруты

- Домашний маршрут выбирается по рабочему контуру роли: `OWNER`, `ADMIN`,
  `MANAGER` и `CLUB_MANAGER` открывают `/dashboard`; `BUYER` —
  `/assortment/dashboard`; `MARKETER` — `/marketing`; `STANDARDS_MANAGER` —
  `/staff`; сменные роли — `/staff/shift-workspace`. Platform admin без
  подписанного tenant-контекста всегда открывает `/administration`.
- Сохранённый `returnTo=/dashboard` не отменяет специализированный домашний
  маршрут. Прямой вход на `/dashboard` также перенаправляется до загрузки
  dashboard API, поэтому роль не получает системный RSC-экран из-за
  недоступной зависимости страницы.
- Домашний маршрут является product/navigation policy и может быть строже
  отдельной capability. Он не расширяет права: после redirect каждый API
  запрос независимо проходит module entitlement, fresh scope и resource
  policy.
- `/communications`, `/staff/team-chat` и `/staff/notifications` доступны при
  `view_communications`; роль больше не перенаправляет пользователя только в
  чат или только в уведомления.
- Главная страница `SENIOR_ADMINISTRATOR`, `CLUB_ADMINISTRATOR` и `TRAINEE`
  ведёт на `/staff/shift-workspace` в обоих режимах scope. При `STORES` API
  возвращает только текущего сотрудника и его смену в серверно определённом
  привязанном клубе; клиент не может выбрать другой клуб или сотрудника.
- Для `SENIOR_ADMINISTRATOR`, `CLUB_ADMINISTRATOR` и `TRAINEE` пункт задач в
  навигации называется «Мои задачи» и ведёт на
  `/staff/tasks?view=my&status=all`.
- Прямой URL не обходит capability, fresh scope или row-level policy API.

## Два режима администратора платформы

Администратор платформы не получает неограниченный cross-tenant доступ одним
запросом. Он работает в одном из двух явных состояний:

| Состояние        | Назначение                                             | Tenant-data                            |
| ---------------- | ------------------------------------------------------ | -------------------------------------- |
| Control plane    | `/administration`, выбор сети, диагностика и lifecycle | запрещены до выбора tenant             |
| Tenant workspace | обычные tenant-маршруты после выбора сети              | выбранный tenant как `OWNER + NETWORK` |

Порядок безопасного входа:

1. Сохранённая platform-admin сессия без выбранного tenant направляется на
   `/administration`.
2. Кнопка входа в сеть вызывает `POST /auth/tenant-context` с конкретным
   tenant. Backend проверяет свежие `isActive` и `isPlatformAdmin`, существование
   tenant и выпускает подписанную сессию с `platformTenantContext=true`.
3. В tenant-контексте platform admin получает роль `OWNER`, scope `NETWORK` и
   стандартный набор OWNER capability только для выбранной сети.
4. Компактная кнопка `PA` показывает slug выбранной сети. Нажатие вызывает
   `DELETE /auth/tenant-context`, очищает выбранный контекст и возвращает на
   `/administration`.

На каждом защищённом tenant-запросе API повторно проверяет platform-admin
аккаунт, tenant, slug, `OWNER`, `NETWORK`, пустой store allow-list и точный
набор OWNER capability. Несовпадение завершается `401`, а не расширением
доступа.

## Диагностика пустого dashboard

Отображаемое имя tenant не является уникальным операторским ориентиром. При
выборе сети нужно проверять одновременно:

- badge `Рабочая сеть` или `Пустая сеть`;
- slug;
- количество Stores, Products и Sales;
- наличие активного Langame source.

Сеть считается рабочей в интерфейсе, если есть хотя бы один Store, Product,
SalesFact или активный Langame source. Рабочие сети сортируются выше пустых,
затем — по количеству продаж и клубов. Пустой dashboard после выбора tenant с
нулевыми счётчиками является ожидаемым отображением пустого tenant, а не
признаком потери данных в другой сети.

## Инварианты безопасности

- Нельзя выдавать platform admin tenant-доступ без явного подписанного выбора.
- Нельзя использовать display name как идентификатор сети.
- Нельзя превращать пустой `STORES` в `NETWORK`.
- Нельзя переносить пользователей между tenant как часть исправления
  навигации или capability.
- Архивация и слияние дублирующих tenant требуют отдельного подтверждённого
  data-change с backup, dry-run и rollback.

## Проверки и delivery state

- deployed baseline `8d49f2d7...`:
  - focused API regression: `794` tests;
  - API и Web lint/typecheck/build: `PASS`;
  - Fast CI run `32692322613`: `2/2 SUCCESS`;
  - production browser smoke: platform-admin tenant switch, dashboard,
    communications и employee navigation — `PASS`;
  - миграции БД и перенос пользователей в этом изменении отсутствуют.
- role-aware landing candidate `359e5aeb...`:
  - landing matrix `14/14`, pilot BFF `22/22`, release build boundary `12/12`;
  - Web lint/typecheck/build и локальный browser scenario
    `STANDARDS_MANAGER → /staff` — `PASS`;
  - Fast CI `33136172976` и Full Release Admission `33136173010` — `SUCCESS`;
  - production deploy и real-account canary — `PENDING`.

Полное evidence и production-canary checklist:
[role-aware corporate landing 28.08.2026](../../../open-beta/role-aware-corporate-landing-evidence-2026-08-28.md).
