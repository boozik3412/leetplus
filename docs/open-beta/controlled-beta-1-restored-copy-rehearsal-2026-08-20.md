# Controlled Beta-1: restored-copy rehearsal, diagnostic record

Статус: `FINAL RESTORED-COPY REHEARSAL ACCEPTED / PRODUCTION NO-GO`.

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

Следующий clean replay с этим fix дошёл до CURRENT187, а второй Prisma deploy
подтвердил zero pending migrations. Final controller check снова корректно
fail-closed: его runtime pin ожидал pre-CURRENT187 function digest, тогда как
exact CURRENT187 migration materializes independently inventory-accepted
digest `a7dd1703…`. Final migration manifest уже совпал; требуется только
исправить этот stale controller pin с отдельным regression test и повторить
replay against a new accepted artifact. Existing 187-migration copy остаётся
diagnostic evidence only и не является release acceptance.

## Final clean acceptance

Controller fixes приняты exact application SHA
`d157764254507ead76231a913c1ffa3b5f445ef5`:

- Fast CI [32383168039](https://github.com/boozik3412/leetplus/actions/runs/32383168039):
  `2/2 SUCCESS`;
- Full Release Admission
  [32383465076](https://github.com/boozik3412/leetplus/actions/runs/32383465076):
  `4/4 SUCCESS`;
- downloaded raw artifact SHA-256:
  `0c8d7202e6afd5b58556b4a74b45842ef7e98fff34358cb00132d1665bafabb9`.

Fresh isolated restore of the same verified backup then passed the whole exact
sequence:

1. V2 preflight `READY_FOR_RESTORED_COPY_DATABASE_REHEARSAL`, evidence digest
   `cdc7c5fcdf60436bf466034079283d6d92e9b7342c7ab636662255a1757780c0b`.
2. Digest-bound plan `ef5d03d39c8974f4312de9986729016fa50e97b169bc83aa7baa965c46053e57`
   found and reconciled exactly four allowed stale `WEEKLY` rows only on the
   isolated copy.
3. The first exact Prisma deploy applied 34 pending migrations; the second
   returned `No pending migrations to apply`.
4. Controller `check` returned `PRODUCTION_HISTORY_REHEARSAL_VERIFIED` with
   `187 applied / 4 historical rolled back / 0 unfinished`, zero `RUNNING`
   digest rows, materialized tree digest
   `31c526a555f6a15d52f5e4d7b50697a2fee93c742a7ef76ab7dd31dab8e475ba2`,
   preterminal manifest `094f3ad34ef8846f6088f51d5fb9491ff89af4509b60063453c22af07466d99b`
   and CURRENT187 worker digest
   `a7dd17037ceaccb294953dce145e0fcc589fb2646962db724d919c24ba87c53c`.

The accepted 187-migration copy is retained only as receipt evidence until its
declared deletion deadline. It contains no production service, worker, SMTP,
Telegram or Langame process and cannot authorize a production deploy.
Production database, runtime roles, current four-club network and external
testers remain unchanged.

## Follow-on runtime-role gate

A separate fresh restore was subsequently used for the runtime-role lifecycle.
The initial 153-migration preflight was preserved as baseline evidence, then
the exact history lane advanced that isolated copy to 187 before the wrapper-
dependent role controller was invoked. The accepted `plan → apply → check →
rollback → reconcile` evidence, including its remaining production limits, is
recorded separately in
[the runtime-role rehearsal](./controlled-beta-1-runtime-role-rehearsal-2026-08-20.md).

The next gate is now a SHA-bound production canary and runtime admission. It
must still prove production HBA/TLS/SCRAM, dedicated pool behaviour, live API
session restrictions and rollback before one OWNER invite for Tenant B/Store B1
can be considered.
