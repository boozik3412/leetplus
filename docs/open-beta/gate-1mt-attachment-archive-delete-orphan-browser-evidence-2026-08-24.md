# Gate 1MT: attachment archive/delete/orphan browser matrix — 24.08.2026

Статус:
`RESTORED-COPY PRODUCTION-BUILD PASS / LIVE CANARY PENDING / PRODUCTION SHADOW / EXTERNAL BETA NO-GO`.

## Вердикт

Exact immutable release `7efcaeff5de06ee8657a13c98c205bba1adc5f9c`
прошёл полную пятисценарную browser-матрицу staff attachments на fresh clone
production backup с `STAFF_ATTACHMENT_ACL_MODE=ENFORCED`:

- `upload → bind → download → remove reference → quarantine → 404`;
- опубликованный parent доступен сотруднику своего Store, но после archive
  возвращает hidden `404`;
- delete parent атомарно снимает binding, quarantines blob и оставляет `404`;
- attachment без живого parent/binding возвращает hidden `404`;
- пользователь другого tenant получает hidden `404` к живому BOUND attachment.

Production application и конфигурация этим прогоном не менялись. Production
API до и после церемонии работал на SHA `e26a924b7e9c2e181ce33757545e8b1c15a7a9e9`,
режим attachment ACL остался `SHADOW`; deployment/restart и переключение
`SHADOW → ENFORCED` не выполнялись.

## Пререквизиты

Матрица выполнялась после отдельного production residual apply на том же
controller release `7efcaeff…`:

```text
actions:                      1 050
attachments bound:             309
bindings created:               795
attachments quarantined:        741
non-expired PENDING retained:     10
apply/check/replay:             PASS / zeroDiff=true
post-apply residual actions:       0
BOUND without binding:             0
non-BOUND with BOUND binding:       0
```

Ни один blob или source reference физически не удалялся. Temporary writer role,
database tunnel и runtime dependency junction были удалены после зелёного
postflight. Production runtime оставался `SHADOW` на всём окне.

## Изолированный контур

- source: fresh verified production dump, SHA-256
  `e0f0031837aabe698e1d399e78c7a273a3c052cc56daabca04eda9b9df16b7c5`;
- PostgreSQL `16.15`, loopback-only disposable cluster;
- schema: `CURRENT_187`, `187` successful migrations, `0` unfinished;
- source inventory: `5 515` attachments, `157` public tables;
- API/Web: compiled admitted artifact `7efcaeff…`;
- runtime manifest SHA-256
  `3dc968748786cbc5c6c117568cbc52a87f8865162b65499344c1a25a577184f2`;
- runtime archive SHA-256
  `150eb63eff149c7a7db9e6970ae7f3e99554653fd4ba4a08167c57a1c088a377`;
- `ACCESS_SCOPE_ENFORCEMENT_MODE=ENFORCED`;
- `STAFF_ATTACHMENT_ACL_MODE=ENFORCED`;
- schedulers, monitoring, provider outbound и founder activation отключены;
- только синтетические tenants, stores и users.

Встроенная browser-сессия не подключилась за три bounded timeout. Согласно
frontend-testing fallback матрица продолжена в real headed Chromium через
Playwright CLI. Это не изменило target, release bytes или проверяемый journey.

## Browser journey

| Проверка                                                                  | Результат          |
| ------------------------------------------------------------------------- | ------------------ |
| NETWORK OWNER вошёл через штатную cookie-сессию                           | `PASS`             |
| STORES employee своего Store вошёл и попал в staff workspace              | `PASS`             |
| Employee другого tenant вошёл в отдельной cookie-сессии                   | `PASS`             |
| Upload BFF вернул canonical same-origin locator                           | `PASS`, HTTP `200` |
| Parent create создал exact `SHIFT_REGULATION` binding                     | `PASS`, HTTP `200` |
| OWNER download совпал с source bytes                                      | `PASS`, HTTP `200` |
| Same-Store employee до archive скачал живой BOUND blob                    | `PASS`, HTTP `200` |
| Same-Store employee после archive получил hidden `404`                    | `PASS`             |
| NETWORK OWNER сохранил доступ к archived parent до delete                 | `PASS`, HTTP `200` |
| Delete parent завершился атомарно                                         | `PASS`, HTTP `200` |
| Download после delete вернул hidden `404`                                 | `PASS`             |
| Remove last native reference завершился                                   | `PASS`, HTTP `200` |
| Download после remove вернул hidden `404`                                 | `PASS`             |
| Quarantined no-parent fixture вернул hidden `404`                         | `PASS`             |
| Попытка создать `BOUND` без BOUND binding отклонена deferred DB invariant | `PASS`             |
| Foreign-tenant employee к живому BOUND blob получил hidden `404`          | `PASS`             |
| Accepted positive/negative sessions: console errors/warnings              | `0/0`              |
| Unexpected page network failures                                          | `0`                |

Проверенный remove-reference файл:

```text
bytes:           49
source SHA-256:  dee22c5e98f83580faa31d8cbbf3c1c5863d4bb1303b081e6042c8f2750bf6b7
download SHA-256:dee22c5e98f83580faa31d8cbbf3c1c5863d4bb1303b081e6042c8f2750bf6b7
```

Один ранний exploratory `page.fetch` negative run создал ожидаемую browser
console запись для HTTP `404` и был исключён. Accepted cross-tenant flow был
повторён в fresh session через authenticated browser request context и завершён
с `0` console errors/warnings. Отдельный screenshot hidden `404` не входит в
нулевой console budget accepted run.

## PostgreSQL postflight

```text
migrations:                              187
unfinished migrations:                    0
invalid indexes:                          0
matrix attachments:                       4
matrix attachments QUARANTINED:           4
matrix BOUND bindings:                    0
quarantined no-parent fixtures:            1
BOUND without BOUND binding:              0
non-BOUND with BOUND binding:              0
dangling BOUND parent bindings:            0
synthetic outbound entitlements enabled:   0
synthetic identity-mail outbox rows:        0
synthetic guest-game deliveries:            0
synthetic activation commands:              0
```

Whole-schema comparison source ↔ test изменила ровно десять ожидаемых fixture/
workflow tables: `Tenant`, `TenantModuleEntitlement`, `Store`, `User`,
`UserStoreAccess`, `StaffMember`, `StaffAttachment`, `StaffShiftRegulation`,
`StaffChatChannel`, `StaffChatMessage`. `StaffAttachmentBinding` вернулся к
source count: все disposable bindings были сняты штатными lifecycle flows.

## Production availability и cleanup

Один первый 15-second public Web probe истёк по timeout. Немедленные независимые
повторы подтвердили `https://leetplus.ru/ = 200`, `/login = 200`, HTTP→HTTPS
`301`, API health `200`; application downtime не наблюдался. Candidate
`7efcaeff…` в application runtime не разворачивался.

После проверки:

- все пять Chromium sessions закрыты;
- API/Web processes остановлены;
- disposable PostgreSQL остановлен, его data directory удалён;
- временные dependency junctions удалены;
- runtime artifact повторно прошёл integrity verifier на `5 036` regular files;
- production и retained recovery backup не изменялись.

Protected off-repo evidence bundle содержит:

| Файл                                          | SHA-256                                                            |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `browser-evidence.json`                       | `701ea502934ea637b93deb159cd22f7d80ebe4e208b109dd998621d98f826cc7` |
| `matrix-summary.json`                         | `14c29c4091c73a46c15d59c4efc7f26ad3a584538de3608e201ce922ce670536` |
| `accepted-positive-bound-catalog.png`         | `4c12c55163759b512084a2b7fdcbfd94cc660aea99c1f5d666f05d32543d10f3` |
| `accepted-remove-reference-final-catalog.png` | `dbc30feb0f6915fd821f5d339aab98e575fbcb8be148895684d41e9573634d90` |
| `expected-hidden-404-visual.png`              | `c159cb664d98868e85c01d6cba017c837ec2d62b98a08851968effbd56693c46` |

## Что закрыто и что осталось

Этот run закрывает manual/restored-copy production-build
`archive/delete/orphan/cross-tenant` engineering matrix для staff attachments.
Он не является live production browser evidence для operational preflight:
tenant/store fingerprints синтетические и намеренно не совпадают с production
manifest.

До process-wide `ENFORCED` остаются отдельные gates:

1. immutable deployment admitted application candidate `7efcaeff…` вместо
   текущего runtime `e26a924b…`;
2. exact production tenant/store fingerprint binding;
3. controlled live canary с fresh browser/observability evidence и rollback
   window;
4. отдельное явное решение `SHADOW → ENFORCED`;
5. остальные Gate 1MT jobs/Telegram/public-guest/outbound и Gate 2.

Поэтому внешний beta остаётся `NO-GO`.
