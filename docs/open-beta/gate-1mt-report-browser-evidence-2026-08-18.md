# Gate 1MT: production-build report browser evidence — 18.08.2026

## Решение

Production-build browser journey для отчётов, скачивания файлов и безопасных
операционных mutations принят на одноразовом клоне clean restored copy.
Проверка закрывает ранее открытый report/browser-срез Gate 1MT, но не включает
реальную отправку email/digest и сама по себе не разрешает production deploy
или выдачу внешнего OWNER invite.

Production, source template `leetplus_restored_founder_clean_a1` и текущий
Tenant A с четырьмя Store не изменялись. Все unattended schedulers и outbound
entitlements во время принятого прогона были выключены.

## Provenance

- exact implementation commit:
  `94db1fdd20f816c785fb4153cbaccca37890f94d`;
- PostgreSQL: isolated loopback `127.0.0.1:55439`;
- source template: `leetplus_restored_founder_clean_a1`;
- accepted disposable database:
  `leetplus_gate1mt_reports_browser_test_a3`;
- migration state: CURRENT185, `185 applied / 4 rolled back / 0 unfinished`;
- API: compiled Nest `dist/main.js`;
- Web: Next.js production build, `205` pages;
- browser driver: real Chromium через Playwright CLI;
- synthetic owner: отдельный `OWNER/NETWORK` Tenant B; credentials были
  локальными одноразовыми fixtures и не сохранялись в Git.

Промежуточные прогоны не засчитывались: один был отклонён после обнаружения
включённого guest-game monitor, другой выявил concurrency defects `P2002` и
`P2037`. Их одноразовые базы удалены. В accepted run все schedulers, включая
`GUEST_GAME_MONITORING_ENABLED`, были явно выключены.

## Исправленные дефекты

### RecommendationState create race

Параллельные SSR-запросы к operational report могли одновременно выполнить
`findFirst → create` и получить Prisma `P2002` на unique
`RecommendationState(tenantId, recommendationKey)`. Workflow state теперь
создаётся и обновляется атомарным Prisma `upsert`; reappearance semantics
сохранена.

Real PostgreSQL regression запускает четыре параллельных operational report
read, проверяет одинаковые recommendation keys и ровно одну persisted state
на каждый key.

### Неограниченный SSR fan-out

Страница `/reports` запускала двенадцать server loaders одним
`Promise.all`. Несколько API endpoints дополнительно распараллеливают Prisma
queries, из-за чего production build мог получить `P2037: too many database
connections`. Loaders сгруппированы в шесть независимых блоков по два: полезная
параллельность сохранена, максимальный page-level fan-out ограничен.

Static BFF boundary фиксирует все двенадцать loaders и шесть групп ровно по
два вызова.

## Принятые автоматические проверки

| Проверка                                  |                                  Результат |
| ----------------------------------------- | -----------------------------------------: |
| `ReportsService` unit                     |                               `11/11 PASS` |
| Restored-copy assortment/PostgreSQL suite | `15/15 PASS`, два последовательных прогона |
| Pilot Web BFF boundary                    |                                 `9/9 PASS` |
| API typecheck                             |                                     `PASS` |
| Web typecheck                             |                                     `PASS` |
| API pilot HTTP surface lint               |                                     `PASS` |
| Targeted Web lint                         |                                     `PASS` |
| API production build                      |                                     `PASS` |
| Web production build                      |                        `PASS`, `205` pages |

После PostgreSQL integration suite все `156` public table counts совпали с
source template: fixture residue равен нулю.

## Принятый browser journey

| Действие                                        | Результат                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| OWNER login и переход `/dashboard → /reports`   | `PASS`                                                             |
| Полная report page с двенадцатью server loaders | `PASS`, без RSC/render error                                       |
| CSV download                                    | `200`, `6 969` bytes, `16` fixture matches                         |
| XLSX download                                   | `200`, `18 691` bytes, `11` ожидаемых sheets, `16` fixture matches |
| Recommendation status `NEW → IN_PROGRESS`       | `PATCH 200`                                                        |
| Создать OOS exclusion                           | `POST 200`                                                         |
| Удалить то же OOS exclusion                     | `DELETE 200`, список снова пуст                                    |
| Browser console                                 | `0 errors / 0 warnings`                                            |

Обе выгрузки получили `Cache-Control: private, no-store, max-age=0`,
`Pragma: no-cache`, `X-Content-Type-Options: nosniff`,
`Cross-Origin-Resource-Policy: same-origin`, безопасный `Content-Disposition`
и корректный `Content-Type`. XLSX повторно прочитан ExcelJS; листы:

1. `Сводка`;
2. `Общий отчет по продажам`;
3. `Рекомендации`;
4. `Риск OOS`;
5. `Без продаж`;
6. `Потребность`;
7. `ABC`;
8. `ТОП SKU`;
9. `ТОП поставщики`;
10. `Группы ассортимента`;
11. `Низкая маржа`.

## Whole-schema postflight

После browser journey сравнены row counts всех `156` public tables source и
target. Отличались только десять заранее ожидаемых fixture/workflow tables:

| Таблица                   | Delta |
| ------------------------- | ----: |
| `Category`                |  `+1` |
| `InventorySnapshot`       |  `+4` |
| `Product`                 |  `+2` |
| `RecommendationState`     |  `+2` |
| `SalesFact`               |  `+4` |
| `Store`                   |  `+2` |
| `Supplier`                |  `+1` |
| `Tenant`                  |  `+1` |
| `TenantModuleEntitlement` |  `+6` |
| `User`                    |  `+1` |

`ProductOosExclusion` вернулся к source count после DELETE. Неожиданных table
deltas нет. Перед удалением подтверждено `0` активных sessions к exact database;
после `DROP DATABASE` подтверждён database residue `0`.

## Что остаётся до внешнего клуба

1. Remaining Gate 1MT negative/adoption matrix: остальные file parents,
   background jobs, SSE, Telegram и public guest binding.
2. Controlled production SMTP canary для outbound report/email/digest; browser
   run не нажимал send и не создавал внешних эффектов.
3. Production `PREPARE`: exact roles/secrets, readiness, monitoring, session
   drain и rollback drill.
4. Gate 2 на текущем Tenant A/A1–A4 и минимум семь стабильных суток internal
   alpha.
5. Отдельный persisted GO, Tenant B/Store B1, controlled ACTIVE activation и
   mailbox-bound OWNER invite с self-set password.
