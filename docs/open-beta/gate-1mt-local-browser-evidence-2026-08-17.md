# Gate 1MT — локальное browser/store-scope evidence, 17.08.2026

## Вердикт

`PARTIAL PASS / NOT A SHARED-BETA GO`.

На синтетической локальной копии подтверждены запуск полного API/Web контура,
доступ владельца к согласованным модулям, ограничение пользователя одним Store
и invite-only выдача доступа сотруднику. Проверка не является production-like
A/B matrix, не закрывает Gate 1MT и не разрешает внешний доступ.

## Изолированная среда

- PostgreSQL 16 на отдельном loopback-порту, не связанном с production;
- отдельная база, полученная из полностью мигрированного локального шаблона;
- синтетический `Tenant Browser-Beta` и два синтетических Store;
- синтетические владелец сети и пользователь со scope одного Store;
- API прошёл реальный Nest bootstrap и вернул положительные `/health` и
  `/health/ready`;
- production, текущий `Tenant A/A1..A4` и внешний тестер не изменялись.

Локальные email, пароли, JWT, invite token и database URL в evidence не
сохраняются.

## Принятая browser matrix

| Проверка | Результат |
| --- | --- |
| Login владельца синтетической сети | `PASS` |
| Геймификация | `PASS` на открытие authenticated workspace |
| Ассортимент и dashboard | `PASS` |
| Товары | `PASS`, синтетический список загружен |
| Сотрудники | `PASS` |
| Регламенты смены | `PASS` |
| База знаний | `PASS` |
| Коммуникации | `PASS` |
| Пользователи и роли | `PASS` |
| Пользователь со scope одного Store видит только разрешённый Store | `PASS` |
| Прямой URL с ID запрещённого Store не расширяет scope | `PASS` |
| Store-scoped пользователь не видит владельца сети и запрещённый Store в users/roles | `PASS` |
| Создание новой учётной записи вручную с паролем отсутствует | `PASS` |
| Персональное email-bound приглашение в разрешённый Store | `PASS` |
| Preview приглашения без раскрытия token в URL/query | `PASS` |
| Accept: новый сотрудник сам задаёт пароль | `PASS` через реальный API/PostgreSQL |
| Созданный сотрудник сохранил `STORES` и ровно один разрешённый Store | `PASS` |
| Fresh login созданного сотрудника сохраняет роль/scope/Store | `PASS` |
| Повторный accept использованного invite | `REJECTED` |

Во время проверки browser console не содержала ошибок приложения. Dev-only
Next.js overlay не является частью production bundle и не учитывался как
продуктовый дефект.

## Изменение invite workflow

Компонент пользователей переведён в invite-only режим:

- удалён переключатель ручного создания пользователя;
- удалён новый-account `POST /api/users` из UI;
- email приглашения обязателен;
- новый сотрудник получает персональную ссылку и задаёт пароль сам;
- password input остаётся только в административном редактировании уже
  существующей учётной записи;
- boundary test запрещает возврат ручного new-account path.

Локальный реальный запрос создал active invite только для разрешённого Store.
Затем public preview и accept создали пользователя с ролью сотрудника,
`STORES` scope и ровно одним разрешённым Store; пароль был задан получателем в
accept payload. Fresh login вернул ту же роль/scope/Store, повторный accept был
отклонён. SMTP/outbound в этой проверке не выполнялся: ссылка была
получена внутри авторизованного локального UI.

## Автоматические проверки

- `web test:pilot-bff-boundary`: `4/4 PASS`;
- `web test:users-roles-bff-boundary`: `5/5 PASS`;
- `web typecheck`: `PASS`;
- полный `web lint`: `0 errors`, `30` известных warnings вне этого diff;
- `git diff --check`: `PASS`.

Implementation SHA: `15b9e3ac878f01e04c76efc3942d4d0cfe87d7a1`.
GitHub CI
[run 32040816369](https://github.com/boozik3412/leetplus/actions/runs/32040816369),
attempt 2: `3/3 SUCCESS`. Первый attempt завершился GitHub infrastructure
ошибкой `429 → 502` при скачивании pinned action до checkout; повторный job
прошёл без изменения SHA. Release artifact `9292006557`, digest
`sha256:edb072f72b97924440dc4b8f8f36ea61b04e543a030f80e84f8a84859561b06a`.

## Что эта проверка не закрывает

1. Production-like два tenant: `A/A1..A4` и `B/B1` на восстановленной копии.
2. Background jobs, Telegram, SSE, files/exports и unattended integrations.
3. Runtime role/grant enrollment и restore/apply/replay/rollback rehearsal.
4. Реальную SMTP-доставку, `SENT` barrier, accept/reissue/revoke/suspend.
5. Gate 2 и семидневную internal alpha текущей сети.
6. Production deploy, создание внешнего Tenant B и owner invite тестеру.

Поэтому итог остаётся `NO-GO` для внешнего доступа, но browser/store-scope и
invite-only UI больше не являются полностью непроверенными: они имеют
изолированное локальное partial evidence.
