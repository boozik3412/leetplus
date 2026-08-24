# Gate 1MT: production attachment inventory — 24.08.2026

Статус:
`BASE + RESIDUAL PRODUCTION RECONCILIATION PASS / RESTORED-COPY BROWSER PASS / LIVE CANARY REQUIRED / EXTERNAL BETA NO-GO`.

## Решение

Production-схема и DB-level parent-delete guard соответствуют `CURRENT_187`.
Первый exact reconciliation subset уже применён: `4 416` unique-parent rows
переведены в `BOUND` и получили ровно `4 416` bindings. Apply/check/replay и
независимый integrity postflight прошли без drift и downtime.

Owner-approved residual subset и полная restored-copy production-build
archive/delete/orphan/cross-tenant browser-матрица завершены. До process-wide
`ENFORCED` остаются immutable application deployment, exact live tenant/store
canary, fresh observability/rollback evidence и отдельное mode-switch approval,
поэтому внешний доступ остаётся `NO-GO`.

Production работал и продолжает работать в `STAFF_ATTACHMENT_ACL_MODE=SHADOW`.
Это сохраняет совместимость для текущих сотрудников, но не является режимом
авторизации внешнего beta.

## Production update после base apply

Exact production plan:

```text
plan digest:       825c14610e26229d53d5225f78df2c094fad2be0fa0a8d884f9d6658b8df04f9
actions:           4 416
review rows:       1 050
apply:             PASS / APPLIED / zeroDiff=true
independent check: PASS / CHECKED / zeroDiff=true
replay:            PASS / RECONCILED / zeroDiff=true
```

Postflight:

| Метрика                        | Значение |
| ------------------------------ | -------: |
| `BOUND` attachments            |  `4 416` |
| `BOUND` bindings               |  `4 416` |
| Distinct bound attachments     |  `4 416` |
| `UNRESOLVED`                   |  `1 030` |
| `PENDING`                      |     `20` |
| attachment/binding/scope drift |      `0` |
| health-monitor failures        |      `0` |
| temporary production role left |      `0` |

Platform-admin login, tenant context, dashboard и `/staff/shift-workspace`
прошли production browser canary без console/RSC failures. Web и API после
удаления временной роли отвечали `200`.

## Residual restored-copy proposal

Отдельный residual contract не выбирает один из нескольких parents. Он
сохраняет все существующие нормализованные chat relations и предлагает
карантин только для blobs без primary parent; физическое удаление запрещено.

Свежая restored-copy rehearsal post-base состояния дала:

| Решение                                    | Значение |
| ------------------------------------------ | -------: |
| Bind all normalized parents                |      309 |
| Bindings к этим существующим parents       |      795 |
| Quarantine legacy no-parent, blob retained |      721 |
| Non-expired `PENDING`, без изменения       |       20 |
| Residual action count                      |  `1 030` |
| Remaining review after apply               |       20 |

Lifecycle `plan → apply → replay → check → rollback → replay → check` прошёл
`PASS`; после apply копия имела `4 725 BOUND`, `5 211 bindings`, `721
QUARANTINED`, `20 PENDING` и drift `0`. Этот rehearsal был prerequisite для
отдельной live ceremony ниже.

## Production update после residual apply

Residual ceremony использовала admitted controller artifact
`7efcaeff5de06ee8657a13c98c205bba1adc5f9c` и exact owner approval:

```text
plan digest:          eb4a21a0ed5b4bb2123a2c32a88e104554af4b57fbb655fc4d48f0049fc8bcaf
source graph digest:  15dbe2056c94900c89beea36953df18f337c755f87045cb74bb6d7f8d06d8185
action set digest:    defaaeed54ad2c42b854f991843850f7e780ba91166dc37cdd4c6397501203c6
actions:              1 050
bindings:               795
quarantine:             741
review/PENDING:           10
apply:                 PASS / APPLIED / zeroDiff=true
check:                 PASS / CHECKED / zeroDiff=true
replay:                PASS / RECONCILED / zeroDiff=true
```

Live drift policy разрешила только новые valid `BOUND` с существующими
bindings либо non-expired `PENDING` вне approved action set. Immediate live
plan подтвердил exact source graph/action set: missing/changed/unapproved
actions `0`, signal review `0`.

Final production postflight:

| Метрика                                 | Значение |
| --------------------------------------- | -------: |
| Total attachments                       |  `5 515` |
| `BOUND`                                 |  `4 764` |
| `PENDING`                               |     `10` |
| `UNRESOLVED`                            |      `0` |
| `QUARANTINED`                           |    `741` |
| Total/BOUND bindings                    |  `5 250` |
| Distinct bound attachments              |  `4 764` |
| Residual actions after apply            |      `0` |
| Core attachment/binding invariants      |      `0` |
| Expired pending                         |      `0` |
| Unfinished migrations / invalid indexes |  `0 / 0` |

Физического удаления blob/source не было. Temporary writer role, tunnel и
runtime junction удалены. Application runtime остался `e26a924b…`, mode —
`SHADOW`; deploy/restart не выполнялся.

Exact `7efcaeff…` затем прошёл полную restored-copy production-build browser
matrix `5/5`; см.
[archive/delete/orphan evidence](./gate-1mt-attachment-archive-delete-orphan-browser-evidence-2026-08-24.md).

## Base release binding

| Evidence                    | Значение                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| Exact release SHA           | `ddd10931f084d9f53f4893910ebda1f05df37f87`                                                       |
| Fast CI                     | [`32698634700`](https://github.com/boozik3412/leetplus/actions/runs/32698634700) — `SUCCESS`     |
| Full Release Admission      | [`32698634619`](https://github.com/boozik3412/leetplus/actions/runs/32698634619) — `6/6 SUCCESS` |
| Scanner Git blob            | `c11a3a4f317e1bf12f2b9fc709a6cc5a9fdcba7c`                                                       |
| Database target fingerprint | `166b80c79a57a88bd525bba7ac8190d853d12e9622e0786f83d090580741dc00`                               |

Перед подключением server-side scanner blob был независимо сопоставлен с
тем же файлом из admitted Git tree. Локальный `--self-test` прошёл `PASS`.

## Safety contract

Каждый scan использовал:

- explicit production attestation и exact release SHA;
- отдельно вычисленный credential-free database fingerprint;
- одно PostgreSQL connection;
- `default_transaction_read_only=on`;
- одну `REPEATABLE READ` snapshot;
- bounded keyset pages и statement/transaction timeouts;
- aggregate-only JSON без UUID, URL, file name, credentials или PII.

Scanner подтвердил `databaseSessionReadOnly=true`,
`snapshotConsistent=true`, `rawIdentifiersEmitted=false`,
`rawUrlsEmitted=false` и `fileNamesEmitted=false`. Application data не
создавались, не обновлялись и не удалялись. После проверки API и Web остались
`active`.

## Production trigger inventory

В отдельной `READ ONLY` transaction проверены все семь exact constraint
triggers:

- `CHAT_MESSAGE`;
- `STAFF_TASK`;
- `CHECKLIST_RUN`;
- `KNOWLEDGE_ARTICLE`;
- `SHIFT_REGULATION`;
- `TRAINING_COURSE`;
- `ONBOARDING_PLAN`.

Для каждого результата одновременно подтверждены exact parent table,
`DEFERRABLE INITIALLY DEFERRED`, enabled state, exact
`assert_staff_attachment_parent_delete()` и exact resource-kind argument.

```text
trigger contract:           7/7 PASS
unexpected/missing count:   0
PUBLIC function EXECUTE:    0
completed migrations:       187
migration head:             20260820010000_guest_portal_telegram_update_ledger
unfinished migrations:      0
```

## Aggregate attachment result

| Метрика                                           | Значение |
| ------------------------------------------------- | -------: |
| Attachment rows                                   |  `5 466` |
| `UNRESOLVED`                                      |  `5 446` |
| `PENDING`                                         |     `20` |
| `BOUND`                                           |      `0` |
| Source rows scanned                               |  `6 539` |
| Valid normalized relation occurrences             |  `5 211` |
| Unique recognized existing attachments            |  `4 725` |
| Unique primary-parent candidates                  |  `4 416` |
| Multiple-primary-parent review candidates         |    `309` |
| Existing attachments without recognized reference |    `741` |
| Missing attachment candidates                     |      `0` |
| Absolute reference signals requiring review       |    `243` |

Три последовательных snapshot дали одинаковые aggregates: с пустым HTTPS
origin allowlist, с `https://leetplus.ru` и с двумя canonical public origins
`https://leetplus.ru,https://api.leetplus.ru`. Последние `243` сигнала не
стали valid references и поэтому не могут автоматически расширять authority.

На момент snapshot `4 416` unique-parent rows, `309` multiple-parent, `741`
unreferenced и lifecycle `20 PENDING` требовали отдельной row-level ceremony;
aggregate inventory сам по себе bindings не разрешал. Последующие base и
residual owner-approved ceremonies завершены с final `0 UNRESOLVED`, `741`
reversible quarantine и `10` non-expired `PENDING`. `243` historical URL-review
signals не использовались как authority и post-apply signal review равен `0`.

## Protected evidence

Root-only evidence сохранено на production-сервере:

| Snapshot                                                                                                        | SHA-256                                                             |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `/var/lib/leetplus/gate-1mt-evidence/attachment-parent-delete-trigger-inventory-ddd10931-20260824T082300Z.json` | `35e0f5266eb199abdd22ec7160948f8389db60598a7fa431b010b4ccc91ecc1b2` |
| `/var/lib/leetplus/gate-1mt-evidence/attachment-inventory-ddd10931-20260824T081643Z.json`                       | `64b3771a0abc0767e941f3e72ce6543cbbb441fe6cb1460fa5a0cacb3ed32b9e`  |
| `/var/lib/leetplus/gate-1mt-evidence/attachment-inventory-leetplus-origin-ddd10931-20260824T081716Z.json`       | `0a83ca6f38fe065cbc2df9d7479759ec9c57f25bfdf54e4651752fcef989600e`  |
| `/var/lib/leetplus/gate-1mt-evidence/attachment-inventory-public-origins-ddd10931-20260824T081750Z.json`        | `9157320e7f0a6f79f37395dad7e4a6e2d5cf28ddd8a1aa554c75599666dc24b4`  |

Evidence directory имеет mode `0700`, JSON и checksum files — `0600`, owner
`root:root`.

## Следующий gate

1. Base/residual production apply, check, zero-diff replay и restored-copy
   archive/delete/orphan/cross-tenant browser matrix завершены.
2. Оставить `10` non-expired `PENDING` штатному bind/TTL lifecycle и проверить
   отсутствие `PENDING_EXPIRED` drift перед live canary.
3. Развернуть admitted application candidate `7efcaeff…` immutable release
   operation вместо текущего runtime `e26a924b…`; reconciliation artifact сам
   по себе deployment не выполнял.
4. Зафиксировать exact production tenant/store fingerprints и выполнить
   controlled live browser canary с fresh observability и rollback evidence.
5. Отдельным approval решить `STAFF_ATTACHMENT_ACL_MODE=SHADOW → ENFORCED`.
6. Только после этого продолжить остальные Gate 1MT jobs/Telegram/public-guest/
   outbound и Gate 2; tester invite всё ещё запрещён.

Ни этот inventory, ни будущий backfill сами по себе не разрешают создание
внешнего tenant, отправку SMTP или выдачу tester invite.
