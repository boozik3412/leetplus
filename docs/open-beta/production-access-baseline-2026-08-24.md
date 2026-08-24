# Production access baseline — 24.08.2026

| Поле                          | Значение                                            |
| ----------------------------- | --------------------------------------------------- |
| Статус                        | `DEPLOYED / VERIFIED`                               |
| PR                            | [#7](https://github.com/boozik3412/leetplus/pull/7) |
| Merge SHA                     | `8d49f2d7fa3b35c2f5bd87a4e4b7fc522f4324a4`          |
| Production data migration     | не выполнялась                                      |
| Решение по дублирующим tenant | отдельное подтверждение обязательно                 |

Документ фиксирует восстановленный production-доступ сотрудников, текущую
привязку пользовательского cohort к рабочей сети и правила выбора tenant для
администратора платформы. Персональные данные, production UUID и credentials
здесь намеренно не приводятся.

## Что было исправлено

До baseline сохранённая platform-admin cookie могла открыть `/dashboard` без
поддерживаемого tenant store scope. `/auth/me` отвечал `200`, а dashboard
получал `401 Fresh tenant store scope is required` и показывал системную
ошибку. Затем сменные роли со scope `STORES` попадали в network-only workspace
`/staff/shift-workspace`, который штатно завершался `404`; временная защита
направляла их вместо домашней страницы в список личных задач.

Текущий baseline:

- platform admin без tenant-контекста попадает в `/administration`;
- выбор tenant создаёт подписанный контекст только выбранной сети;
- `SENIOR_ADMINISTRATOR`, `CLUB_ADMINISTRATOR` и `TRAINEE` открывают домашнюю
  страницу рабочей смены по маршруту `/staff/shift-workspace` как при `NETWORK`,
  так и при `STORES` scope;
- при `STORES` страница смены получает только профиль текущего сотрудника и
  данные его Langame-смены в привязанном клубе; tenant-wide отчёт сотрудников
  остаётся под `NETWORK`-ограничением;
- личные задачи остаются отдельным пунктом «Мои задачи» по маршруту
  `/staff/tasks?view=my&status=all`;
- коммуникации доступны всем ролям;
- `ADMIN`, `SENIOR_ADMINISTRATOR` и `CLUB_ADMINISTRATOR` сохраняют read-доступ
  к задачам, регламентам и базе знаний даже при custom role или override;
- empty tenant не маскируется под рабочую сеть: UI показывает badge, slug и
  предупреждение о пустом dashboard.

Полная capability-модель описана в
[матрице ролей и tenant-контекста](../security/access-scope/v1/role-capabilities-and-platform-tenant-context.md).

## Текущая карта production tenant

В production существуют три tenant с одинаковым отображаемым названием.
Рабочие данные не потеряны: они находятся в одном каноническом tenant.

| Назначение                | Name   | Slug     |                  Users | Stores | Products | Sales facts |              Langame |
| ------------------------- | ------ | -------- | ---------------------: | -----: | -------: | ----------: | -------------------: |
| Каноническая рабочая сеть | `1337` | `demo`   | 28 всего / 26 активных |      4 |    1 485 |     108 226 | 3 активных источника |
| Пустой duplicate          | `1337` | `club-a` |       1 активный OWNER |      0 |        0 |           0 |                    0 |
| Пустой duplicate          | `1337` | `1337`   |       1 активный OWNER |      0 |        0 |           0 |                    0 |

Для операционной работы нужно выбирать карточку `Рабочая сеть` со slug
`demo`. Slug `1337` на скриншоте пустого dashboard означал выбор другого,
пустого tenant с тем же display name.

## Привязка текущих пользователей

Hotfix не переносил и не удалял пользователей. Операционный employee cohort
остаётся в канонической сети `demo`:

| Роль и scope                    | Активные | Неактивные |
| ------------------------------- | -------: | ---------: |
| `OWNER / NETWORK`               |        2 |          0 |
| `MANAGER / NETWORK`             |        1 |          0 |
| `STANDARDS_MANAGER / NETWORK`   |        1 |          0 |
| `SENIOR_ADMINISTRATOR / STORES` |        4 |          0 |
| `CLUB_ADMINISTRATOR / NETWORK`  |        1 |          0 |
| `CLUB_ADMINISTRATOR / STORES`   |       17 |          2 |
| **Итого**                       |   **26** |      **2** |

В production cohort сейчас отсутствуют `ADMIN`, `BUYER`, `MARKETER`,
`CLUB_MANAGER` и `TRAINEE`. Один `STANDARDS_MANAGER` использует tenant-level
role override; обязательный минимум предотвращает случайное снятие
коммуникаций и его стандартного рабочего контура.

Известные data-quality наблюдения, не исправленные этим deployment:

- у двух неактивных User остаются активные StaffMember/assignment записи;
- у одной записи User и StaffMember различаются между
  `CLUB_ADMINISTRATOR` и `SENIOR_ADMINISTRATOR`.

Эти строки требуют отдельной сверки и не должны исправляться массовым
переносом tenant.

## Проверка администратором платформы

1. Открыть `/administration`.
2. В списке сетей найти `1337`, badge `Рабочая сеть`, slug `demo` и четыре
   Stores.
3. Нажать `Войти в рабочую сеть`.
4. Убедиться, что компактная кнопка `PA` показывает `demo`.
5. Проверить `/dashboard`, `/communications`, `/staff/tasks` и нужный
   бизнес-раздел.
6. Для смены сети нажать `PA`, вернуться в `/administration` и выбрать другую
   карточку. Одновременно активен только один tenant-контекст.

Если dashboard рабочей сети показывает нули только за выбранный период, нужно
отдельно проверить период, Langame sync и наличие revenue snapshot. Это другой
класс проблемы, чем выбор пустого tenant.

## Доставка и evidence

- PR `#7` слит 24.08.2026; Fast CI `32692322613` завершился `2/2 SUCCESS`.
- Focused API regression прошёл `794` tests; API и Web проверки сборки зелёные.
- После deployment web и API оставались healthy, новых error-level production
  logs не обнаружено; browser smoke для platform admin и employee routes
  пройден.
- Перед deployment создан protected server backup reference
  `communications-admin-access-20260824T050614Z`, связанный с полным DB
  snapshot reference `platform-admin-tenant-context-20260824T083000Z`.
- Схема и строки БД этим изменением не менялись; rollback runtime не требует
  обратной data migration.

## Что намеренно не выполнено

Пустые tenant `club-a` и `1337` не архивированы, не объединены и не удалены.
Их cleanup может затронуть owner identities, audit history и будущие tenant
references, поэтому требует отдельного inventory, business confirmation,
backup и проверяемого rollback.
