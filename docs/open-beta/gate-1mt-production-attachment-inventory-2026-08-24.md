# Gate 1MT: production attachment inventory — 24.08.2026

Статус:
`PRODUCTION READ-ONLY INVENTORY PASS / RECONCILIATION REQUIRED / EXTERNAL BETA NO-GO`.

## Решение

Production-схема и DB-level parent-delete guard соответствуют `CURRENT_187`,
но legacy attachment graph ещё не готов к process-wide `ENFORCED`.
Read-only inventory обнаружил `5 446 UNRESOLVED` attachment rows, поэтому до
audited reconciliation/backfill, повторного zero-diff inventory и полной
archive/delete/orphan browser-матрицы внешний доступ остаётся `NO-GO`.

Production работал и продолжает работать в `STAFF_ATTACHMENT_ACL_MODE=SHADOW`.
Это сохраняет совместимость для текущих сотрудников, но не является режимом
авторизации внешнего beta.

## Release binding

| Evidence | Значение |
| --- | --- |
| Exact release SHA | `ddd10931f084d9f53f4893910ebda1f05df37f87` |
| Fast CI | [`32698634700`](https://github.com/boozik3412/leetplus/actions/runs/32698634700) — `SUCCESS` |
| Full Release Admission | [`32698634619`](https://github.com/boozik3412/leetplus/actions/runs/32698634619) — `6/6 SUCCESS` |
| Scanner Git blob | `c11a3a4f317e1bf12f2b9fc709a6cc5a9fdcba7c` |
| Database target fingerprint | `166b80c79a57a88bd525bba7ac8190d853d12e9622e0786f83d090580741dc00` |

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

| Метрика | Значение |
| --- | ---: |
| Attachment rows | `5 466` |
| `UNRESOLVED` | `5 446` |
| `PENDING` | `20` |
| `BOUND` | `0` |
| Source rows scanned | `6 539` |
| Valid normalized relation occurrences | `5 211` |
| Unique recognized existing attachments | `4 725` |
| Unique primary-parent candidates | `4 416` |
| Multiple-primary-parent review candidates | `309` |
| Existing attachments without recognized reference | `741` |
| Missing attachment candidates | `0` |
| Absolute reference signals requiring review | `243` |

Три последовательных snapshot дали одинаковые aggregates: с пустым HTTPS
origin allowlist, с `https://leetplus.ru` и с двумя canonical public origins
`https://leetplus.ru,https://api.leetplus.ru`. Последние `243` сигнала не
стали valid references и поэтому не могут автоматически расширять authority.

`4 416` unique-parent candidates являются только кандидатами плана. Aggregate
inventory не разрешает создавать bindings. `309` multiple-parent, `741`
unreferenced, `243` URL-review и lifecycle `20 PENDING` требуют отдельной
row-level церемонии и owner-approved решения.

## Protected evidence

Root-only evidence сохранено на production-сервере:

| Snapshot | SHA-256 |
| --- | --- |
| `/var/lib/leetplus/gate-1mt-evidence/attachment-parent-delete-trigger-inventory-ddd10931-20260824T082300Z.json` | `35e0f5266eb199abdd22ec7160948f8389db60598a7fa431b010b4ccc91ecc1b2` |
| `/var/lib/leetplus/gate-1mt-evidence/attachment-inventory-ddd10931-20260824T081643Z.json` | `64b3771a0abc0767e941f3e72ce6543cbbb441fe6cb1460fa5a0cacb3ed32b9e` |
| `/var/lib/leetplus/gate-1mt-evidence/attachment-inventory-leetplus-origin-ddd10931-20260824T081716Z.json` | `0a83ca6f38fe065cbc2df9d7479759ec9c57f25bfdf54e4651752fcef989600e` |
| `/var/lib/leetplus/gate-1mt-evidence/attachment-inventory-public-origins-ddd10931-20260824T081750Z.json` | `9157320e7f0a6f79f37395dad7e4a6e2d5cf28ddd8a1aa554c75599666dc24b4` |

Evidence directory имеет mode `0700`, JSON и checksum files — `0600`, owner
`root:root`.

## Следующий gate

1. Реализовать отдельный idempotent reconciliation tool:
   `dry-run → immutable reviewed plan → explicit apply → rollback/zero-diff`.
2. Запретить автоматическое решение multiple-parent, URL-review и orphan
   случаев; для каждого нужен stable reason code и owner decision.
3. Определить и проверить lifecycle для существующих `PENDING` rows.
4. Повторить production inventory до нуля unexplained/review findings.
5. Только затем выполнить production-build archive/delete/orphan browser
   matrix и tenant/store canary перед process-wide `ENFORCED`.

Ни этот inventory, ни будущий backfill сами по себе не разрешают создание
внешнего tenant, отправку SMTP или выдачу tester invite.
