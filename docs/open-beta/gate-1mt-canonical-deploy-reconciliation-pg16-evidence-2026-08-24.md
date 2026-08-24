# Gate 1MT: canonical deploy and reconciliation PostgreSQL evidence — 24.08.2026

Статус: `LOCAL PG16 PASS / PRODUCTION UNCHANGED / EXTERNAL BETA NO-GO`.

## Root cause

`20260731120000_identity_mail_delivery_release_head` и canonical migration
history не были повреждены. Git blobs и LF-normalized working manifest `1..178`
оба дают:

```text
7f9867971a39e010b2dac03be18fc083dabe67b98d1d6ed15a0cc4540a8cfd14
```

Локальный digest `ba9ca94c…` появился потому, что старый Windows checkout
содержал `150` исторических `migration.sql` с CRLF. Raw `prisma migrate deploy`
записал checksums этих platform-specific bytes в `_prisma_migrations`.
`.gitattributes` уже задавал `eol=lf`, поэтому Linux CI и fresh checkout не
воспроизводили сбой.

Migration SQL не изменялись и альтернативный digest не был разрешён.

## Исправление deploy boundary

`pnpm --filter database db:deploy` теперь вызывает
`canonical-prisma-deploy.mjs`. Перед Prisma он:

1. fail-closed проверяет symlink-free schema/migration topology;
2. читает каждый migration как strict UTF-8, запрещает NUL;
3. материализует отдельное дерево с canonical LF bytes;
4. выводит только count/head/manifest digest и число нормализованных файлов;
5. всегда удаляет одноразовый artifact после завершения Prisma.

Скрипт включён в exact runtime artifact allowlist. Operational script count
увеличен с `26` до `27`; provenance, adversarial verifier и hydration authority
pin обновлены вместе. Unit/contract suite: `3/3 PASS`.

## Clean PostgreSQL 16.15 result

На новом loopback-only кластере с trust только внутри одноразовой fixture:

```text
migration count:                  187
migration head:                   20260820010000_guest_portal_telegram_update_ledger
normalized Windows files:         150
canonical full manifest digest:   4b4005f714615bc8137ef252a1b9ba5e2597ec0eac769228064d18ec6f2cd155
CURRENT179 preterminal digest:     7f9867971a39e010b2dac03be18fc083dabe67b98d1d6ed15a0cc4540a8cfd14
second deploy:                     no-op PASS
```

Никакие terminal assertions не пропускались.

## Attachment reconciliation lifecycle

Из чистой схемы создан отдельный disposable clone с одним `UNRESOLVED`
attachment и единственным валидным chat parent. Изолированная non-superuser,
`NOINHERIT/NOBYPASSRLS` writer-role прошла:

```text
plan → apply → lost-response replay → apply check
     → rollback → rollback replay → rollback check
```

Результат: `1/1 PASS`; финал — `UNRESOLVED | LEGACY_UNCLASSIFIED | 0 bindings`.
Первый deny-run вернул `42501` до writes и выявил отсутствующие точечные
function/row-lock grants. Повторный run прошёл только после `EXECUTE` на exact
resolver/assert functions и column-level `UPDATE("updatedAt")` на chat
parent/channel, требуемого PostgreSQL для `FOR KEY SHARE`. Whole-table parent
`UPDATE` не выдавался.

## Ограничения и следующий gate

Этот run доказывает clean history и controller lifecycle, но его attachment row
синтетический. Исторический production-backup rehearsal от 20–21.08 привязан к
`f4e8d79d…` и не является evidence нового SHA.

До production apply обязательны:

1. зелёные Fast CI и Full Release Admission на одном новом exact SHA;
2. immutable artifact handoff этого SHA;
3. свежий production backup и restored-copy replay этого artifact;
4. exact temporary role/effective-grant audit и доказанное revoke/drop;
5. owner-reviewed action/review set и отдельное approval exact plan digest;
6. post-apply zero-diff inventory и production-build archive/delete/orphan
   browser matrix.

Созданный для проверки PostgreSQL cluster остановлен и удалён. Workspace
`.tmp/`, production code, data, config и текущие пользовательские доступы не
изменялись.
