# Role-aware corporate landing — evidence 28.08.2026

| Поле | Значение |
| --- | --- |
| Статус | `MERGED / ADMITTED / NOT DEPLOYED` |
| PR | [#63](https://github.com/boozik3412/leetplus/pull/63) |
| Admitted implementation SHA | `359e5aeb1a7e0b53197747ef781adaf166baf6d3` |
| Fast CI | [33136172976](https://github.com/boozik3412/leetplus/actions/runs/33136172976) — `2/2 SUCCESS` |
| Full Release Admission | [33136173010](https://github.com/boozik3412/leetplus/actions/runs/33136173010) — `6/6 SUCCESS` |
| Production data/schema effect | отсутствует |

Документ фиксирует successor корпоративной маршрутизации после авторизации.
Он не является свидетельством production deployment: до отдельного cutover
production продолжает использовать предыдущий runtime.

## Причина изменения

Общий fallback отправлял любую tenant-роль, кроме сменных, на `/dashboard`.
Из-за этого специализированная роль могла успешно пройти `/auth/me`, а затем
попасть на страницу, составные API-зависимости которой не поддерживают её
рабочий контур. В частности, `STANDARDS_MANAGER` вместо Staff Hub получал
ошибку рендера dashboard. Сохранённый `returnTo=/dashboard` повторял сбой при
следующих входах.

Это навигационный дефект, а не основание расширять capability или tenant/store
scope. Исправление не переносит пользователей, не меняет роли и не ослабляет
fresh-scope проверки.

## Каноническая карта домашних маршрутов

| Эффективная роль/контекст | Домашний маршрут |
| --- | --- |
| `OWNER`, `ADMIN`, `MANAGER`, `CLUB_MANAGER` | `/dashboard` |
| `BUYER` | `/assortment/dashboard` |
| `MARKETER` | `/marketing` |
| `STANDARDS_MANAGER` | `/staff` |
| `SENIOR_ADMINISTRATOR`, `CLUB_ADMINISTRATOR`, `TRAINEE` | `/staff/shift-workspace` |
| Platform admin без подписанного tenant-контекста | `/administration` |
| Platform admin в подписанном tenant-контексте | маршрут эффективной роли `OWNER` |

Карта определяет только безопасную стартовую страницу. Доступ к любому
следующему маршруту по-прежнему определяется capability, module entitlement,
fresh `NETWORK | STORES` scope и resource policy.

## Двойная защита

1. После login/восстановления сессии сервер выбирает домашний маршрут по
   эффективной роли.
2. Сохранённый `/dashboard` или `/dashboard/*` в `returnTo` игнорируется для
   роли со специализированным домашним маршрутом. Разрешённый deep link в её
   рабочем контуре сохраняется.
3. Прямой запрос `/dashboard` повторно вычисляет landing до загрузки
   `dashboard/summary` и `stores`. Неподходящая роль перенаправляется, поэтому
   системный RSC error не становится экраном после входа.
4. Redirect не считается authorization: API продолжает fail-closed проверять
   полномочия и scope каждого запроса.

## Проверки admitted implementation

- role landing unit matrix: `14/14 PASS`;
- pilot BFF boundary: `22/22 PASS`;
- release build boundary: `12/12 PASS`;
- Web changed-file lint, typecheck и production build: `PASS`;
- production build сгенерировал `206/206` страниц;
- browser scenario с синтетическим `STANDARDS_MANAGER / NETWORK`:
  `/login?returnTo=/dashboard → /staff`, затем прямой
  `/dashboard → /staff`; Staff Hub отрисован без error overlay и console
  errors;
- Fast CI и Full Release Admission завершены на одном exact implementation
  SHA; release artifact, production-control candidate и immutable handoff
  зелёные.

## Production canary после отдельного deploy approval

- проверить корпоративный вход по одной внутренней учётной записи каждой
  реально представленной роли;
- для `STANDARDS_MANAGER` подтвердить login со stale
  `returnTo=/dashboard`, прямой `/dashboard` и открытие `/staff`;
- для сменной роли проверить `/staff/shift-workspace` отдельно при `NETWORK` и
  `STORES`;
- для owner/manager подтвердить, что `/dashboard` продолжает загружаться;
- для platform admin проверить control plane без контекста и один явно
  выбранный tenant-контекст;
- убедиться, что в production logs нет новых `401`, RSC digest и redirect loop;
- rollback выполняется заменой runtime на предыдущий admitted artifact; data
  rollback не требуется.

