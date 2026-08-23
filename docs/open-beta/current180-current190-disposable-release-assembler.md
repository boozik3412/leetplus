# CURRENT180–CURRENT190 in-memory release assembler

## Решение

Статус: `IN_MEMORY_ASSEMBLER_READY / EFFECTFUL_RUNNER_NOT_IMPLEMENTED / NO_DEPLOY`.

Этот slice проверяет и собирает canonical CURRENT001–179 вместе с frozen
CURRENT180–190 только в памяти процесса. Он не создаёт временные директории и
файлы, не выполняет cleanup, не подключается к PostgreSQL, не запускает Prisma
или дочерние процессы, не вызывает сеть/providers и не меняет роли, grants,
routes, canonical migrations, production или данные клубов.

Effectful filesystem materializer намеренно удалён из доверенной границы. Это
устраняет cross-platform path/symlink/junction TOCTOU и неоднозначность
владения cleanup. Будущий PostgreSQL runner обязан иметь собственный отдельно
проверенный контракт materialization и database lifecycle; текущий assembler не
разрешает runner consumption или внешний тестовый доступ.

## Файлы

- Allow-manifest:
  `packages/database/release-rehearsals/current180-current190/disposable-assembly-allow-manifest.json`.
- Assembler:
  `packages/database/scripts/current180-current190-disposable-release-assembler.mjs`.
- Focused tests:
  `packages/database/scripts/current180-current190-disposable-release-assembler.test.mjs`.

Allow contract: `CURRENT180_CURRENT190_DISPOSABLE_ASSEMBLY_ALLOW_V2`.

Plan contract: `CURRENT180_CURRENT190_DISPOSABLE_ASSEMBLY_PLAN_V2`.

Artifact contract: `CURRENT180_CURRENT190_FROZEN_IN_MEMORY_ARTIFACT_V1`.

## Состав артефакта

Schema lane содержит ровно 190 миграций в лексическом порядке:

1. 179 canonical migrations до
   `20260731120000_identity_mail_delivery_release_head` включительно;
2. frozen CURRENT180–186;
3. reviewed CURRENT187 proposal
   `20260805010000_identity_mail_cluster_application_admission_current187`;
4. frozen CURRENT188–190.

In-memory artifact содержит 192 frozen entries: `schema.prisma`, normalized
`migrations/migration_lock.toml` и 190 `migration.sql` entries. Каждый entry
содержит immutable UTF-8/LF string, byte length, logical path, SHA-256 и
source-kind. Никакой output path в API или результате нет.

Auxiliary CURRENT187-E
`20260805050000_identity_mail_ddl_fence_ledger_current187` всегда исключён. Это
самостоятельный synthetic evidence lane, который не может попасть в Prisma
schema lane.

## Политика байтов и provenance

Canonical SQL и migration lock могут иметь только один последовательный стиль:
LF или CRLF. Допустимый CRLF нормализуется в LF. Lone CR и смешанный LF/CRLF
fail-closed.

Frozen CURRENT180–190 принимаются только byte-for-byte: UTF-8, LF, без BOM,
NUL и CR. Их преобразование обозначено отдельно как
`BYTE_EXACT_COPY_ONLY`; canonical normalization больше не маскируется этим
термином.

До каждого read/list и после него assembler проверяет repository path через
`lstat` и `realpath`: ожидаемый тип, real non-symlink leaf, точное положение
внутри real repository root. Path traversal, alias и source symlink/junction
блокируются. После чтения дополнительно проверяются закреплённые raw или
normalized hashes.

Assembler не импортирует и не исполняет прежний refreeze verifier/planner/
blocker. Он read-only проверяет их exact source SHA и статический no-effects
boundary. Это исключает скрытый эффект при ESM import. Три закреплённых source
SHA включены в plan:

- refreeze verifier:
  `e0ba9d0f49a46f560b520b25f74d1318e666c03966549308aaca96cf4d51d336`;
- materialization planner:
  `b5dc5a6f42a5eca3708bc6bb9a8a5e5f2f2e2d8b829da1affa5fbe9c8ced8bd6`;
- rehearsal blocker:
  `2bda04a60becf778d0b14a072af11472bd7c1a545168d644f2e21c66476810d1`.

Test-only read/list/path-info callbacks всегда помечают
`externalEffectsUnverified=true` и `callerSuppliedEffectsUnverified=true`.
Нулевые effect flags относятся только к assembler implementation; write
callback отсутствует.

Все публичные options сначала проверяются через `isProxy` и own property
descriptors. Proxy и accessor/getter options отклоняются без вызова caller
trap/getter, поэтому no-effects boundary не зависит от исполняемого кода во
входном объекте.

## Закреплённая целостность

| Объект                             | SHA-256 / digest                                                   |
| ---------------------------------- | ------------------------------------------------------------------ |
| Refreeze manifest                  | `184d1cfb46b1443a8487329382fdf2937656a8dd3ac15cbddad617009cefda98` |
| Reviewed materialization plan      | `fb2582650a839a8fbe637fadfc671a680e0d944d6c96b9d9831c0c985cec721d` |
| V2 allow-manifest                  | `3d82c33872712376f375ddf276d9b794a410190f034dc250ed6f11a54535f4eb` |
| Canonical 179-manifest             | `3330185424ca669c18f39c2da5aa1e49f942500c0c85185c9125930e02df9431` |
| Normalized migration lock          | `99836963713b4f5b269ad49af0ed3d7b0b2e336115c2f92dc9ac683d139d0900` |
| Assembled 190-migration manifest   | `61c9de5adc0e4673c6eedb69d7d8f42933fc075398fa0ecf1cb2e2ff365e4f55` |
| V2 assembly plan                   | `426a73b1e10b5960b57e67ea55287d06c02ca501677efd638b4a8b246f8d75a1` |
| 192-entry manifest                 | `c32c9720a60f16b802d32a9e9e964c8d8a9125047beeb3f569fac8b90baebbaa` |
| Frozen in-memory artifact envelope | `8750ebd4dff1726ab0736029735aa65f4ace08ecf3894a2a99d3eb1814673092` |
| CURRENT190 head SQL                | `d23c0e8fbdfddd0eb9ec7a73d877e7bbcde8c170683247a66f43530cca3867d5` |

Любой drift manifest, inspection-chain source, repository provenance,
canonical set/manifest, migration lock или frozen source переводит inspection в
`DISPOSABLE_ASSEMBLY_SOURCE_DRIFT_BLOCKED`.

## Граница полномочий

Разрешены только read-only inspection и frozen in-memory assembly.

Всегда запрещены filesystem materialization/cleanup, caller-supplied output
path, database connection/apply, process spawn, network/provider calls,
role/grant mutation, route activation, deploy, production mutation,
`prisma migrate resolve` и изменение canonical/candidate/proposal sources.

Даже успешно собранный результат имеет статус
`FROZEN_IN_MEMORY_ARTIFACT_ASSEMBLED_NOT_RUNNABLE`,
`runnerConsumptionAuthorized=false` и `productionApplyAuthorized=false`.

## Проверка

```powershell
node --check packages/database/scripts/current180-current190-disposable-release-assembler.mjs
node --check packages/database/scripts/current180-current190-disposable-release-assembler.test.mjs
node --test packages/database/scripts/current180-current190-disposable-release-assembler.test.mjs
```

Зафиксированный focused result: `21/21 PASS`. Покрыты exact order/hashes,
CURRENT187-E exclusion, raw frozen bytes, consistent canonical normalization,
lone CR, mixed EOL, deterministic plan/artifact, manifest/canonical/frozen/
inspection-chain drift, source symlink provenance, immutable result, exact
contract/digest, rejection output arguments, zero-invocation Proxy/accessor
options и отсутствие filesystem-write/DB/process/network/provider imports или
calls.

Тесты не создают файлов и директорий, не используют repository `.tmp` и не
оставляют OS-temp residue.

## Следующий обязательный slice

P0 — отдельный PostgreSQL rehearsal runner. До реализации он не имеет права
потреблять in-memory artifact. Его контракт обязан:

1. принимать только loopback disposable database и отдельный rehearsal
   authority без production credentials;
2. самостоятельно и безопасно материализовать exact 192 entries, проверяя
   entry manifest и artifact envelope до запуска Prisma;
3. учитывать ownership guards: source clone с новым per-run owner не проходит
   CURRENT180/CURRENT185/CURRENT186; нужен либо проверенный owner parity с
   исходным CURRENT179 clone, либо полный CURRENT001–190 deploy из `template0`
   под одной уникальной role;
4. применять CURRENT180–186 в working database имени
   `lp_imtec_<32 hex>_ci`, затем безопасно переименовать её в допустимый release
   target `lp_c180190_<32 hex>_ci`; прямого пересечения name guards нет;
5. доказать поведение CURRENT187, чей exact source завершается `ROLLBACK`:
   корректная finished Prisma receipt плюс materialized postconditions либо
   полный fail-closed; synthetic success запрещён;
6. выполнить fresh apply, rollback rehearsal, re-apply и zero-diff;
7. не использовать manual `_prisma_migrations` writes, `migrate resolve` или
   подделку predecessor evidence;
8. удалять только созданные runner-owned disposable resources и сохранять
   подписанную evidence без секретов.

P1 — после зелёного DB rehearsal отдельно доказать runtime role/grant
attestation, head-pinned application startup/readiness и dormant-to-enabled
route admission. Только затем возможны controlled pilot cutover и приглашение
владельца нового клуба.
