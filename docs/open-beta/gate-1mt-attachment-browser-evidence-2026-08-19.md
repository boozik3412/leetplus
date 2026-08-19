# Gate 1MT: production-build staff attachment browser evidence — 19.08.2026

Статус: `OWNER/NETWORK LIFECYCLE PASS / KNOWLEDGE STORES PASS / PRODUCTION NO-GO`.

## Цель

Проверить на изолированной копии production backup настоящий browser flow
`upload → parent save → bind → download → remove reference → quarantine → 404`
для staff knowledge article и доказать, что текущая network-only граница не
имеет STORES side door.

Проверка не была production deployment. Текущий Tenant A/A1–A4, production
roles, SMTP, Telegram и внешний tester не изменялись.

## Обнаруженный и устранённый дефект

Первый disposable run `a1` был отклонён. Web upload BFF возвращал абсолютный
locator вида `http://localhost:3108/api/staff/attachments/<uuid>`, тогда как
fail-closed parent extractor намеренно принимает только канонические
same-origin пути `/api/staff/attachments/<uuid>` и
`/staff/attachments/<uuid>`. Сохранение статьи поэтому завершалось `400
Invalid attachment references`.

Исправление `976483085d411c3e0e1e8512dd493e0db9ef70f6` возвращает относительный
locator и добавляет regression test, запрещающий повторное использование
`request.url`, `new URL(...)` и `.toString()` в upload projection.

Отклонённый клон удалён. Его результат не использован как acceptance evidence.

## Изолированный контур

- source: clean restored-copy template
  `leetplus_restored_founder_clean_a1`;
- accepted disposable database:
  `leetplus_gate1mt_attachment_browser_test_a2`;
- PostgreSQL: loopback `127.0.0.1:55439`;
- schema: `185` applied migrations, `156` public base tables;
- web: production build, `205/205` pages;
- API: compiled Nest artifact, `ACCESS_SCOPE_ENFORCEMENT_MODE=ENFORCED`,
  `STAFF_ATTACHMENT_ACL_MODE=ENFORCED`;
- schedulers, monitoring, outbound и founder activation: disabled;
- browser: real headed Chromium через Playwright CLI.

Fixture содержала только синтетические данные:

- отдельный PILOT tenant;
- `Browser B1` и `Browser B2`;
- `OWNER/NETWORK`;
- `CLUB_MANAGER/STORES(B1)`;
- шесть beta entitlements с read/write enabled и outbound disabled.

## Принятый browser journey

| Проверка                                                                | Результат |
| ----------------------------------------------------------------------- | --------- |
| OWNER вошёл через штатную cookie-сессию                                 | `PASS`    |
| OWNER открыл `/staff/knowledge-base` и выбрал `Browser B1`              | `PASS`    |
| Upload BFF вернул `/api/staff/attachments/<uuid>`                       | `PASS`    |
| Статья сохранилась без `Invalid attachment references`                  | `PASS`    |
| PostgreSQL сохранил attachment и native binding как `BOUND`             | `PASS`    |
| Binding содержит exact `KNOWLEDGE_ARTICLE` и exact B1 Store             | `PASS`    |
| Blob SHA-256 совпал с исходным `apps/web/package.json`                  | `PASS`    |
| Download через preview UI вернул `package.json`, 1650 bytes             | `PASS`    |
| Download SHA-256 совпал с исходником                                    | `PASS`    |
| Удаление материала и повторное сохранение завершились успешно           | `PASS`    |
| Последний native reference перевёл blob в `QUARANTINED`                 | `PASS`    |
| Reason code равен `NATIVE_REFERENCE_REMOVED`                            | `PASS`    |
| Повторный same-origin GET вернул hidden `404 Attachment not found`      | `PASS`    |
| Положительный OWNER journey до намеренного 404: console errors/warnings | `0/0`     |

Проверенный SHA-256 исходного, database blob и browser download:

```text
273bd34a7d4b8a41d078b06b67ab70e82d5d0946bf25bd1e370d6714957b04ea
```

Намеренный negative GET после quarantine создал ожидаемую browser console
запись о `404`; она не учитывается как ошибка положительного journey.

## Историческая STORES negative boundary

Независимая cookie-сессия `CLUB_MANAGER/STORES(B1)` успешно вошла в tenant,
но прямой URL `/staff/knowledge-base` получил штатную Next `404` с чистой
консолью. Это подтверждает отсутствие side door, но не является STORES
adoption этой базы знаний.

Этот deny-only результат был правильным для exact implementation
`97648308…`, но больше не описывает текущий candidate. Knowledge parent и его
attachment reader затем синхронно переведены на store-aware policy в exact
commit `085f8bbdd3115b3ec7a4438e7614c815004dd844`.
[Новая A/B приёмка](./gate-1mt-knowledge-stores-evidence-2026-08-19.md)
подтвердила B1 edit/upload/download и hidden `404` для authenticated B2.

Shift regulations затем также переведены на store-aware parent policy в exact
commit `6ce36a41494e488076c60ac1776b765e24731d5e` и приняты отдельной
[A/B приёмкой](./gate-1mt-shift-regulations-stores-evidence-2026-08-19.md).
Training, onboarding и checklist/templates всё ещё требуют отдельной policy.
Для каждого следующего parent необходимо синхронно расширять attachment
reader; открывать download отдельно от parent запрещено.

## Static acceptance

```text
pilot BFF boundary: 11/11 PASS
web typecheck:       PASS
targeted Web ESLint: PASS
web production build: 205/205 pages PASS
```

Предыдущий exact head `80d1105341dc498d06e26a9587df736230f037e3`
принят GitHub Actions run `32174737412` как `4/4 SUCCESS`, включая application
checks, PostgreSQL migration smoke, authority-root gate и downloaded artifact
API child process. Browser fix будет считаться remote accepted только после
CI exact нового pushed SHA.

## Whole-schema postflight и cleanup

Перед удалением accepted клона сравнены row counts всех `156` public tables с
source. Изменились ровно семь ожидаемых fixture/workflow таблиц:

| Таблица                   | Delta |
| ------------------------- | ----: |
| `Tenant`                  |  `+1` |
| `TenantModuleEntitlement` |  `+6` |
| `Store`                   |  `+2` |
| `User`                    |  `+2` |
| `UserStoreAccess`         |  `+1` |
| `StaffKnowledgeArticle`   |  `+1` |
| `StaffAttachment`         |  `+1` |

Неожиданных table deltas нет. После остановки Chromium, Next и Nest active
database sessions были `0`; exact `a2` database удалена. Совокупный residue
`a1/a2 = 0`. Сгенерированные Playwright artifacts также удалены.

## Остаток до внешнего теста

1. Реализовать и принять STORES parent policy для двух оставшихся staff parent
   families: onboarding и checklists/templates; attachment reader
   должен следовать parent policy.
2. Закрыть archive/delete/orphan-retention browser matrix остальных parent
   kinds.
3. Закрыть tenant-aware background jobs, Telegram/public guest binding и
   controlled outbound canary.
4. Выполнить Gate 2 текущей сети и отдельный production `PREPARE/GO`.
