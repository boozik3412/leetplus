# CURRENT180–CURRENT190 immutable refreeze proposal

## Решение

Статус:
`REFREEZE_VERIFIED_NOT_DEPLOYABLE / PROPOSAL ONLY / ASSEMBLY DENIED`.

Proposal закрепляет точный источник будущей disposable сборки, но не добавлен
в `packages/database/prisma/migrations` или `migration-candidates`, не создаёт
release artifact и не разрешает PostgreSQL apply, роли, grants, routes,
provider calls, production или tester access.

## CURRENT187 anchor proposal

Каталог:
`packages/database/release-proposals/current180-current190/20260805010000_identity_mail_cluster_application_admission_current187`.

- `migration.sql` имеет SHA-256
  `dee4995dfd5e66994ad1d50a4631e0c2496db2bc6abca79b9b9a9f4acb4ba5d3`;
- `candidate.json` имеет SHA-256
  `dce3b85321938bb610e79f86b852a9e7bf9e03ed0585aa37d3542b5b5ff28874`;
- contract:
  `IDENTITY_MAIL_CLUSTER_APPLICATION_ADMISSION_CURRENT187_V1`;
- source verifier:
  `CURRENT187_CLUSTER_APPLICATION_ADMISSION_V1`;
- exact predecessor: CURRENT186, count `186`, head checksum `83c5df30…`,
  manifest digest `cf354d5b…`;
- status и все authority/effect flags остаются false/`NOT_DEPLOYABLE`.

SQL выполняет только read-only проверку exact completed CURRENT186 history под
короткими timeout и всегда завершает собственную transaction через `ROLLBACK`.
Он не выполняет DDL/DML, не пишет `_prisma_migrations`, не создаёт роли/grants и
не содержит provider/network I/O. Это проверяемый proposal, а не durable
materialized migration.

## Immutable refreeze manifest

`packages/database/release-proposals/current180-current190/refreeze-manifest.json`
имеет SHA-256
`184d1cfb46b1443a8487329382fdf2937656a8dd3ac15cbddad617009cefda98`.

Manifest закрепляет:

- logical и lexical schema lane CURRENT180→190;
- raw SHA каждого `README.md`, `candidate.json` и `migration.sql` источника;
- directory digest каждого source candidate;
- exact anchor bytes и reviewed planner digest `fb258265…`;
- CURRENT187-E только в отдельном
  `SEPARATE_LP_C187E_LOOPBACK_CI_ONLY` auxiliary evidence lane;
- все predecessor evidence как `resolved=false` и external-only;
- все authorization/effects как false.

Для воспроизводимости raw-byte hashes `.gitattributes` теперь закрепляет
`eol=lf` для candidate JSON/README и всех release-proposal JSON/SQL/Markdown.
Это устраняет различия Windows checkout при `core.autocrlf=true`.

## Verifier

Read-only verifier
`packages/database/scripts/current180-current190-release-refreeze-manifest.mjs`:

1. проверяет exact manifest SHA до доверия его содержимому;
2. запрещает лишние/пропавшие файлы в source directories;
3. проверяет все raw bytes, metadata, порядок и predecessor gates;
4. передаёт exact anchor proposal в hardened materialization planner;
5. сверяет reviewed plan digest и обе lanes;
6. повторно доказывает, что assembly assertion всегда завершается deny.

Public path использует только builtin content reads. Для manifest и всех
schema/auxiliary lane source paths он запрещает symlink/junction в любом
компоненте пути и доказывает `realpath` containment внутри repository. Вложенный
planner отдельно остаётся content-digest-bound и не включён в этот более узкий
path-provenance claim. Test-only dependency injection помечена
`externalEffectsUnverified=true`. Verifier не импортирует writer, database,
process, network или provider client.

```powershell
pnpm --filter database check:current180-current190-release-rehearsal-blocker
pnpm --filter database check:current180-current190-release-materialization-planner
pnpm --filter database check:current180-current190-release-refreeze-manifest
```

Evidence: blocker `13/13 PASS`, planner `18/18 PASS`, refreeze verifier
`17/17 PASS`; `node --check`, Prettier и `git diff --check` — PASS. Public
verification rejects accessors/proxies without invoking caller code, requires
the exact four-entry predecessor graph and verifies manifest/lane source paths
through component-wise `lstat` plus `realpath` containment.

Latest independently reviewed implementation SHA-256:

- planner: `b5dc5a6f42a5eca3708bc6bb9a8a5e5f2f2e2d8b829da1affa5fbe9c8ced8bd6`;
- verifier: `e0ba9d0f49a46f560b520b25f74d1318e666c03966549308aaca96cf4d51d336`;
- verifier tests: `460e914d10e2145c7c2efdef7a606227f4db74067e3fbf0cfe60f0efb070454a`.

Independent latest-byte review: `P0/P1/P2 = 0`. Это разрешает только
интеграцию proposal в CI как `NOT_DEPLOYABLE / ASSEMBLY DENIED`.

## Что остаётся

Proposal не является release evidence, пока весь набор не зафиксирован одним
reviewed commit SHA. После независимого review следующий отдельный slice —
disposable assembler, который материализует временную копию schema lane и
выполняет apply/rollback/re-apply/zero-diff только на loopback PostgreSQL.

Production-like restored snapshot, live role/OID admission, canonical release,
production deploy и внешний доступ остаются последующими отдельными gates.
