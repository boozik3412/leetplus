# Controlled Beta-1: production pre-cutover evidence — 20.08.2026

Статус: `BACKUP ACCEPTED / ROLLBACK INPUTS CAPTURED / RUNTIME UNCHANGED / CUTOVER NO-GO`.

Этот PII-free record фиксирует только подготовительные проверки и резервные
копии перед первым artifact cutover. Он не является разрешением на миграцию,
переключение nginx/systemd, создание внешнего tenant или отправку OWNER invite.

## Live baseline

| Проверка                        | Результат                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Legacy checkout SHA             | `7de04ff4ccc814494810730be3fa6bf661097b07`                                                                    |
| История Prisma                  | `153 applied / 4 rolled back / 0 unfinished`                                                                  |
| Последняя применённая migration | `20260804120000_guest_game_max_pending_rewards`                                                               |
| API/Web services                | `active / active`                                                                                             |
| Legacy deploy timer             | `active`; намеренно не отключён до готового rollback-контура                                                  |
| Application DB role             | `leetplus`, OID `16388`, `LOGIN`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOREPLICATION`, `NOBYPASSRLS` |
| Active application DB sessions  | `7`, все под ролью `leetplus` на момент read-only inventory                                                   |
| Публичный Web                   | HTTP `200`                                                                                                    |
| Публичный legacy API `/health`  | HTTP `200`                                                                                                    |
| Свободное место после backup    | `12 735 410 176` bytes                                                                                        |

Legacy API ещё не имеет нового `/version`, `/health/live` и `/health/ready`
контракта. Поэтому его rollback acceptance использует сохранённые legacy units,
exact checkout SHA и отдельный N−1 smoke, а не будущий artifact probe.

Production database и `135/135` application tables принадлежат роли
`leetplus`. Эта роль уже не superuser и не имеет cluster-admin attributes, но
сейчас одновременно является application runtime и владельцем объектов.
Production-history controller требует отдельную временную migration identity;
её lifecycle и возврат новых объектов владельцу `leetplus` должны быть сначала
приняты на restored copy. Пароли и connection strings в evidence не включены.

Read-only inventory legacy scheduler-конфигурации показал один явно включённый
bonus-ledger scheduler и несколько production-default-on scheduler families.
Поэтому старый API нельзя оставлять активным scheduler owner во время schema
upgrade только на основании HTTP N−1 smoke. Перед production окном обязателен
либо отдельный scheduler-compatible N−1 no-effect test, либо доказанный drain
legacy schedulers с hot rollback API, где schedulers и outbound выключены.

## Fresh database backup

Создан новый online PostgreSQL custom-format dump непосредственно перед
подготовкой cutover:

- файл: `leetplus-prod-pre-canary-20260820T172207Z.dump`;
- размер: `1 642 419 828` bytes;
- SHA-256:
  `2afe0254fee19a040534a711e95bae8ded0a013e43a5d79917dc33894ff0f82f`;
- server-side owner/mode: `postgres:postgres / 0600`;
- `pg_restore --list`: `PASS`;
- off-host copy: `PASS`, размер и SHA-256 совпадают.

Отдельно сохранён cluster-globals record:

- файл: `leetplus-prod-pre-canary-20260820T172207Z-globals.sql`;
- размер: `795` bytes;
- SHA-256:
  `58e659460bb99a8ad5f4531726b8cbe9f0abaebaf249a4d3fe256e405582b40c`;
- server-side owner/mode: `root:root / 0600`;
- off-host copy: `PASS`, размер и SHA-256 совпадают.

Локальное backup-хранилище имеет явные ACL только для учётной записи владельца
и `SYSTEM`. Содержимое backup, роли, secrets и tenant data в репозиторий не
копировались.

## Конкретный rollback target

До первого artifact switch сохранены exact legacy unit-файлы API/Web/deploy,
состояния systemd, `nginx -T`, checkout SHA и disk baseline. Root-only архив:

- файл: `pre-canary-runtime-20260820T1745Z.tar.gz`;
- размер: `4 524` bytes;
- SHA-256:
  `21a1593c6f05111d5b479fcc646c7d0fc67f9a9d42d4501a00803cb23a603fd3`;
- server-side и off-host copies: `PASS`.

Это только восстановимые входные данные. Rollback runtime считается принятым
лишь после запуска exact `7de04ff4…` на мигрированной restored copy с
выключенными scheduler/outbound и прохождения критического Tenant A smoke.

## Local production-like acceptance

На отдельном локальном PostgreSQL `16.15`, слушающем только loopback на
неproduction-порту, восстановлена копия production backup. Production host и
production database в этих прогонах не использовались.

Предварительный history rehearsal подтвердил:

- preflight decision: `READY`;
- evidence digest:
  `7bf421196a642ea237273ebff97486a014f3fa7a7621de56998121966566101d`;
- migration tree digest:
  `559057771c8dffa7df1b8f9b0a1585a850dc1ca4413711d6f1a4853d3ab1d153`;
- plan digest:
  `cf448d23a3bdc846424aff0579c67b5f4a57d51ee5b86ce4a517ae93d8c50f6c`;
- exact четыре stale history rows reconciled;
- все `34` новые migrations применены, повторный deploy дал zero pending.

Финальный checksum admission этого предварительного прогона намеренно не
принят: Windows working tree преобразовал historical migration files из LF в
CRLF, тогда как production archive и Prisma history содержат канонические LF
bytes. Это не расхождение production history, а доказанная непригодность
Windows working tree как deploy source. Финальный rehearsal должен повторяться
только из распакованного deterministic CI artifact с проверенным SHA-256.

Exact legacy API `7de04ff4…` реально запущен на уже мигрированной копии с
отключёнными outbound и scheduler effects. Принят результат:

- decision: `PASS`;
- evidence digest:
  `225e7f7408518772973b42734355a7941cd903da19b68ba245409a41aea93b75`;
- `12` HTTP/auth/module probes, включая ассортимент, персонал, геймификацию и
  users/roles;
- reversible write fixture удалён, residue `0`, runtime errors `0`.

Отдельный disposable clone прошёл bounded legacy scheduler compatibility:

- decision: `PASS`;
- evidence digest:
  `7e1bfcdddb53b6caf53d0672c81910cbdcbafce8e8cec01938af6865f64d9d4f`;
- все шесть legacy scheduler families стартовали без Prisma/runtime errors;
- результат явно `authorizesHotSchedulerRollback=false` и
  `requiresProductionDrain=true`.

Последний пункт означает: schema `187` совместима со старым API, но старые
schedulers нельзя оставлять hot во время миграции. Production-порядок обязан
сначала перевести exact legacy rollback slot в scheduler-free режим, доказать
drain его старых scheduler sessions и только затем выполнять migrations.

Preliminary deploy также доказал, что PostgreSQL назначает владельцем новых
таблиц и функций effective `current_user`, а не исходного владельца database.
Production controller поэтому не имеет права выполнять Prisma как временная
migration identity напрямую. Его обновлённый fail-closed контракт требует:

- `session_user` — отдельная temporary `LOGIN NOINHERIT` migration role;
- единственное direct membership этой role — existing object owner, с
  `SET=true`, `INHERIT=false`, `ADMIN=false`;
- `current_user` после canonical connection option — existing object owner;
- database owner и object owner совпадают с exact application runtime role;
- обе identities не имеют superuser/create-db/create-role/replication/
  bypass-RLS attributes.

Таким образом pending objects остаются владельцем `leetplus`, а temporary
migration login после check можно revoke/drop без `REASSIGN OWNED`. Unit
contract принят `18/18`; реальное доказательство ownership и runtime access
должно войти в новый exact-artifact restored-copy replay.

## Stop conditions после preflight

Production migration и switch остаются запрещены, пока одновременно не готовы:

1. новый release SHA, включающий все четыре production fixes из `origin/main`;
2. persistent Langame evidence path вне immutable artifact;
3. root-owned blue/green slots, exact Web/API identity и атомарный nginx rollback;
4. production-safe digest-bound history controller вместо raw Prisma deploy;
5. exact-artifact replay production history controller на свежей restored copy;
6. production scheduler-free handoff и доказанный drain без двойного owner;
7. exact migration-session → existing-object-owner role-switch rehearsal,
   ownership inventory новых объектов и последующий revoke/drop login wrapper;
8. зелёные Fast CI, Full Release Admission и новая restored-copy rehearsal.

После backup production не мигрировался, timer/units/nginx не изменялись,
tenant data, outbound и external invite не создавались.
