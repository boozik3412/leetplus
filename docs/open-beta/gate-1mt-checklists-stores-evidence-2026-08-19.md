# Gate 1MT: staff checklists STORES adoption — 19.08.2026

Статус: `ENGINEERING PASS / NOT DEPLOYED / PRODUCTION NO-GO`.

## Решение

Шаблоны чек-листов, выполнения и отчёты переведены с обязательного
`NETWORK`-доступа на единую server-authoritative `NETWORK | STORES` policy.
Exact implementation commit
`70d8301d204141c7d4d07c83c2752737f18aaa7d` связывает catalog, detail,
create/update/delete, запуск, ответы, review, report/export, reference
catalogs и attachment download со fresh persisted store scope.

Пользователь `STORES(B1)` управляет только шаблонами и выполнениями B1,
читает совместимый активный сетевой шаблон только для чтения и не видит B2.
Пользователь `STORES(B2)` получает симметричный контур. Чужой Store filter
отклоняется `403`, а mutation чужого или сетевого ресурса скрывается `404`.
Это приёмка на disposable локальном PostgreSQL, а не production deployment.
Tenant A/A1–A4, production, SMTP, Telegram и внешний tester не изменялись.

## Принятая policy

### NETWORK

- сохраняет tenant-wide каталог шаблонов, выполнений и отчётов;
- может создавать сетевые и store-specific шаблоны;
- управляет любым same-tenant шаблоном и выполнением;
- attachment reader следует authority родительского шаблона или выполнения.

### STORES

- каждое обращение начинает с fresh persisted store scope;
- управляет только ресурсом с непустым `storeId` из `allowedStoreIds`;
- создаёт шаблон и выполнение только для явно разрешённого Store;
- не может создать, изменить или удалить сетевой/чужой шаблон;
- видит совместимый активный сетевой шаблон read-only;
- list/report/export фильтруются до totals и группировок;
- reference selectors возвращают только разрешённые Store, сотрудников,
  смены, регламенты и шаблоны;
- answers/review/comment/attachment mutations повторяют authority выполнения;
- attachment download разрешается только через ту же parent policy.

## Автоматическая приёмка

```text
Focused API policy/service/manifest: 5 suites, 59/59 PASS
Web cookie/BFF boundary:             16/16 PASS
Full API Jest:                       162 suites, 3192 PASS, 2 todo
API typecheck:                       PASS
Web typecheck:                       PASS
Targeted API/Web ESLint:             PASS
API production build:               PASS
Web production build:               205/205 pages PASS
Local PostgreSQL 16 matrix:          13/13 PASS
git diff --check:                    PASS
```

PostgreSQL fixture выполнялась в отдельной test database локального
disposable PostgreSQL 16. Матрица включила `NETWORK`, `STORES(B1)`,
`STORES(B2)`, собственные и чужие templates/runs, активный network template,
create/update/delete/filter/report/export/review/answers/attachments и
adversarial cross-store access. Для реализации schema migration не
потребовалась.

Exact push GitHub Actions run
[`32223728916`](https://github.com/boozik3412/leetplus/actions/runs/32223728916)
принял implementation SHA: `Application checks`, `PostgreSQL migration smoke`,
`Authority root trust gate` и `Release artifact API child process` завершились
`4/4 SUCCESS`.

## Production-build browser A/B

Изолированный production-build контур использовал synthetic Tenant B, Store
B1/B2 и двух `CLUB_MANAGER/STORES`. Outbound был отключён.

| Проверка                                                          | Результат |
| ----------------------------------------------------------------- | --------- |
| B1 увидел свой draft и активный network template                  | `PASS`    |
| Template B2 отсутствовал в B1 catalog                             | `PASS`    |
| Network template открылся read-only                               | `PASS`    |
| Собственный B1 template открылся в editor                         | `PASS`    |
| Новый template/run по умолчанию получил B1                        | `PASS`    |
| STORES selectors не предложили `Вся сеть` или B2                  | `PASS`    |
| B1 увидел только выполнение и отчёт B1                            | `PASS`    |
| B2 увидел свой template/run/report и network template, но не B1   | `PASS`    |
| Foreign Store query завершился fail-closed                        | `PASS`    |
| Чистая acceptance-вкладка не имела console errors/warnings        | `PASS`    |
| Локальные API/Web/PostgreSQL listeners после проверки отсутствуют | `PASS`    |

После проверки browser, Next и Nest были остановлены. Exact test database
удалена, PostgreSQL остановлен, ports освобождены. Внешняя disposable
PostgreSQL directory не удалена из-за локального safety-policy ограничения;
она остановлена и не содержит тестовой database. Репозиторная `.tmp` не
изменялась. Соединение с production PostgreSQL не использовалось.

## Что закрыто и что осталось

Checklists/templates закрывают последнюю ранее network-only staff parent
family. Это не означает готовность всего модуля `STAFF`: остаются
archive/delete/orphan browser matrix для attachments,
tests/assessments/readiness, control/ratings/motivation/discipline, salary
planning, tenant-aware jobs и полный role journey.

Для общего открытого теста также остаются полный gamification/assortment
adoption, Telegram/public guest, controlled outbound, Gate 2 текущей сети и
production `PREPARE/GO`. Поэтому этот `PASS` не меняет общий `NO-GO`.
