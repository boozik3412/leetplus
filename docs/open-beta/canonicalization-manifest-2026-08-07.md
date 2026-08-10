# Open beta canonicalization manifest — 07.08.2026

## Назначение

Этот manifest фиксирует перевод accumulated open-beta worktree в один clean
candidate SHA. Он не является production deploy GO и не разрешает tester
invite.

## Исходное состояние после `git fetch --prune origin`

- repository: `boozik3412/leetplus`;
- branch: `codex/open-beta-hardening`;
- pre-canonicalization HEAD:
  `23cd1470c330da027fcd259a9186d77870e9e7d6`;
- fetched `origin/main`:
  `ca215571b5465857eadf548b0bd6305b2de47b7a`;
- fetched `origin/codex/open-beta-hardening` совпадал с исходным HEAD;
- divergence относительно `origin/main`: behind `30`, ahead `130`;
- draft PR: `#1 Harden LeetPlus for shared multi-tenant beta`;
- worktree до staging: `103` modified и `166` untracked status entries, плюс
  этот manifest.

## Граница snapshot

В candidate входят только явно перечисленные изменённые/новые файлы open-beta,
IAM, tenant/store scope, CURRENT180–190, API/Web/CI и документации.

Не входят и не должны индексироваться:

- repository `.tmp/` — не читался и исключён из staging;
- coordinator private/public keys — находятся вне repository;
- локальные PostgreSQL data/log directories — находятся вне repository;
- default OS temp legacy evidence — не переносится в Git;
- пустой task-local Prisma `jiti` cache — находится вне repository.

Inventory перед staging:

- `280` candidate files;
- общий размер около `6.88 MB`;
- только source/config/docs extensions: TypeScript, MJS/MTS, SQL, JSON,
  Markdown, YAML, CSS, `.env.example` и `.gitattributes`;
- private-key/token/AWS/OpenAI pattern hits: `0`;
- credential URL/literal hits проверены как example, loopback CI или test/spec
  fixtures; значения секретов в evidence не выводились.

## Локальная приёмка до canonicalization

- CURRENT180–190 aggregate gate: `163/163 PASS`;
- independent latest-byte audit: `P0=0`, `P1=0`;
- Prisma schema validation, database/API/Web typecheck: `PASS`;
- focused API regression: `39 suites / 747 tests PASS`;
- focused Web BFF/release regressions: `33/33 PASS`;
- два PostgreSQL 16.13 цикла:
  `DISPOSABLE_POSTGRESQL_REHEARSAL_COMPLETED_ZERO_DIFF_ZERO_RESIDUE`;
- финальный cluster residue: `0`;
- source: `179` finished, `0` unfinished/rolled back;
- локальный rehearsal PostgreSQL после проверки штатно остановлен, data
  directory сохранён.

## Стратегия синхронизации

1. Stage только explicit candidate paths.
2. Проверить staged path count, diff/check и отсутствие excluded paths.
3. Создать snapshot commit и отдельную recovery branch на его SHA.
4. Слить fetched `origin/main` обычным merge commit, не переписывая 130
   существующих branch commits.
5. Разрешить конфликты с приоритетом сохранения open-beta security invariants и
   новых upstream исправлений.
6. Пройти локальные canonical checks и получить clean final SHA.
7. Push текущей ветки, обновить draft PR и принять новый GitHub CI artifact.

## Финальный результат

- accumulated worktree сохранён snapshot-коммитом
  `b42a799bc18b5f8aa802baba98d39232203463ae`;
- создана recovery branch
  `codex/open-beta-hardening-pre-sync-20260807`;
- `origin/main` (`ca215571b5465857eadf548b0bd6305b2de47b7a`) влит merge-коммитом
  `4ff8f0a72e3beb473fcbaaef53b7281bbc6eeabd` без переписывания истории;
- divergence относительно `origin/main`: behind `0`;
- новая upstream-миграция
  `20260804120000_guest_game_max_pending_rewards` принята как canonical head
  № `180`; dormant release lane `CURRENT180..CURRENT190` перезаморожен поверх
  неё без переименования исторических source directories;
- устаревшие прямые CI-запуски frozen foundation/smoke tools заменены единым
  blocker/refreeze/assembler/rehearsal gate, который продолжает проверять их
  exact source hashes;
- CI production-startup contract ожидает canonical head № `180`;
- Web build ID привязан к exact `CI_RELEASE_SHA`/`RELEASE_SHA`;
- CI формирует deterministic tar.gz из API/Web/Prisma outputs, включает
  `release-provenance.json` и per-file `SHA256SUMS`, публикует внешний SHA256 и
  сохраняет artifact 30 дней.

Финальный candidate SHA намеренно не записывается внутрь этого файла: SHA
коммита не может содержать собственное значение. Его authoritative значение
публикуется как `CI_RELEASE_SHA` внутри `release-provenance.json`, имени GitHub
artifact и CI log exact-checkout gate.

До зелёного GitHub CI и появления скачиваемого artifact состояние остаётся
`CANONICALIZATION IN PROGRESS / PRODUCTION DENIED`.
