# Controlled Beta-1: restored-copy rehearsal, diagnostic record

Статус: `DIAGNOSTIC ONLY / NOT ACCEPTED / PRODUCTION NO-GO`.

Этот record фиксирует фактическую production-history диагностику от
20.08.2026. Он не является разрешением на deploy, не раскрывает PII, secret
values, database URL, host address или имена tenant/клубов.

## Принятые inputs

| Evidence | Значение |
| --- | --- |
| Exact application artifact SHA | `299c5a8b4948ce7483f03a370cb3a3f7d354dc5b` |
| Full Release Admission | [32371530743](https://github.com/boozik3412/leetplus/actions/runs/32371530743), `4/4 SUCCESS` |
| GitHub artifact envelope | `9407707351`, `sha256:f91b0ef6130fdf8148af97efa406a93fb6ce5194b9a10a169543137fde28c774` |
| Backup format | PostgreSQL custom `pg_dump`, local protected storage |
| Backup size | `1 622 980 702` bytes |
| Backup SHA-256 | `6c75e4ec50250501aaf72b3a6655c83e321f5c8960cf93b582011f07da07a58b` |
| `pg_restore --list` | `PASS` |
| Source history | `153 applied / 4 rolled back / 0 unfinished` |
| Source head | `20260804120000_guest_game_max_pending_rewards` |

Exact artifact прошёл outer `.sha256`, gzip, internal `SHA256SUMS`, provenance,
offline frozen hydration и Prisma generate в отдельном rehearsal directory.
Первый hydration attempt выявил отсутствующий locked package в local pnpm store;
partial tree quarantined и не использовался. Fix `4ea2fd46…`, который запрещает
promote при любой ошибке hydration, принят Fast CI
[`32375018977`](https://github.com/boozik3412/leetplus/actions/runs/32375018977)
как `2/2 SUCCESS`. После строго lockfile-bound pre-warm повторная hydration
успешна без runtime/DB effect.

## Что выявила diagnostic copy

Логический restore в отдельную database того же PostgreSQL instance успешно
восстановил source history. Он намеренно **не принимается** как clean
restored-copy lane: контракт требует другой loopback port, отличный от `5432`.

Точный artifact `prisma migrate deploy` на этой diagnostic copy применил
первые 14 pending migrations и остановился на
`20260728150000_tenant_execution_revision_fence`. Отдельная clone-diagnosis
точно показала первичную причину: в production history остались stale
`ReportDigestScheduleRun` со статусом `RUNNING`; canonical migration
сознательно требует их ноль и отказывается с SQLSTATE `55000`.

Это safety guard, а не повод изменять canonical migration или вручную
исправлять production rows. В репозитории есть специальный
`founder-pilot-production-history-rehearsal` controller: на fresh isolated
copy он строит digest-bound plan, повторно проверяет stale rows под lock и
переводит только exact stale `WEEKLY/sentCount=0` rows в маркированный
`FAILED`, до exact Prisma deploy.

## Первый clean isolated attempt

Отдельный PostgreSQL 16 instance на `127.0.0.1:55439` был создан после
удаления двух прежних same-instance diagnostic copies. Fresh restore verified
backup вернул exact source state. V2 preflight принял immutable artifact,
backup, target identity и source migration state как
`READY_FOR_RESTORED_COPY_DATABASE_REHEARSAL`.

Canonical history controller затем построил plan для ровно четырёх stale
`WEEKLY` rows, и после exact digest confirmation на isolated copy:

- materialized sealed 187-migration lane;
- reconciled ровно `4` digest rows;
- вернул `READY_FOR_EXACT_PRISMA_DEPLOY`.

Exact Prisma deploy из accepted artifact применил migrations through
CURRENT185 и остановился на CURRENT186. Rollback-only execution exact
materialized CURRENT186 SQL показал истинную fail-closed причину:
`CURRENT_186 identity mail worker prerequisite is unsafe`.

Это не production-data drift и не defect canonical migration. Materializer
адаптировал digest predecessor worker receipt в CURRENT185 для production
history, но не адаптировал exact corresponding CURRENT186 prerequisite. Такой
drift корректно остановлен before CURRENT186 DDL commit. Controller fix должен
materialize CURRENT186 bound prerequisite with exact source/output SHA and
focused regression test. Existing isolated database с applied CURRENT185 и
unfinished CURRENT186 — diagnostic evidence only; она не может быть accepted
или reused for retry.

## Следующая clean acceptance

1. Принять controller fix в clean SHA и full CI artifact.
2. Удалить только failed isolated database/lane, сохранить PII-free evidence,
   затем восстановить тот же verified backup в fresh target database.
3. Повторить V2 preflight, `plan → digest-confirmed apply`, exact Prisma deploy
   дважды и controller `check` against the new artifact.
4. Принять только `187 applied / 4 historical rolled back / 0 unfinished`,
   zero `RUNNING` digest rows, data zero-drift и controller `check`.
5. Сохранить PII-free receipt и удалить isolated instance/database/lane по
   retention policy. Production deploy, owner invite и external tester до этого
   запрещены.
