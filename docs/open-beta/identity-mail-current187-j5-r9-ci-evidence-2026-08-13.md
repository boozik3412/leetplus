# CURRENT187-J5-R9 exact-SHA CI evidence

Дата приёмки: 13.08.2026.

Статус: `ACCEPTED / CO-LOCATED PUBLIC J1-J4 RUNNER / NO PRODUCTION EFFECT`.

## Release identity

- commit: `677a37c23b359bd9f3f39893e6a65f5a915f9495`;
- branch: `codex/open-beta-hardening`;
- workflow: `CI`;
- run: [`31635286090`](https://github.com/boozik3412/leetplus/actions/runs/31635286090);
- conclusion: `3/3 SUCCESS`;
- completed: `2026-08-12T20:14:21Z` (`13.08.2026` Asia/Yekaterinburg).

## SHA-bound artifact

- artifact ID: `9156904169`;
- name: `leetplus-release-677a37c23b359bd9f3f39893e6a65f5a915f9495`;
- digest:
  `sha256:c0ade8bdf47b849348ef81131a182882a260ebd2c73f25057949cdda006a7595`;
- size: `16,275,669` bytes;
- expiry: `2026-09-11T20:05:10Z`;
- expired at acceptance: `false`.

## Accepted co-located evidence

Один disposable Linux-контур создал одноразовый CA, отдельные server/client
certificates, включил PostgreSQL TLS и PgBouncer client/server `verify-full`,
установил узкий HBA для exact Docker gateway `/32` и пять временных ролей.

Один Node.js процесс через public production entrypoints собрал:

- четыре strict production-origin J1 PostgreSQL session receipt;
- четыре связанные strict production-origin J2 endpoint/TLS receipt;
- strict production-origin J3 HBA/reload receipt;
- связанный strict production-origin J4 PgBouncer control-plane receipt;
- production runner receipt для `4 positive + 20 network negative + 12 control
  negative` проверок.

Target integration завершился `4/4 PASS`, `0 fail`, `0 skipped`. Отдельно
подтверждены stats-only console, запрет application-доступа к admin console и
отказ mTLS-клиенту без client certificate. Serialized receipt не содержит PEM,
raw credential hashes, URL, hostname, database, role names или passwords.

После scoped cleanup тот же PostgreSQL job успешно прошёл OWNER invite,
trusted-TLS SMTP worker, identity claims, staff catalog, assortment, team-chat
и CRM tenant/store isolation gates. Это доказывает восстановление исходного HBA,
удаление временных ролей и отсутствие fixture residue, мешающего последующим
shared-beta проверкам.

## Rejected predecessor audit trail

Пять predecessor runs являются отрицательной диагностикой и не используются как
acceptance evidence:

- `31628351357` (`c16e9ef7…`): HBA ошибочно ожидал loopback client вместо exact
  Docker service gateway;
- `31629832321` (`109b0580…`): `statement_timeout` попадал в PgBouncer startup
  parameters до целевой negative dimension;
- `31631152931` (`2603309c…`): `pg@8.16.3` заменял отдельный TLS server name
  DNS-именем socket host, поэтому `WRONG_HOSTNAME` неожиданно подключался;
- `31632443003` (`91bfdf98…`): следующий rejected outcome был fail-closed, но
  ещё не имел bounded scenario/error-code диагностики;
- `31633944547` (`c4f04c24…`): exact diagnosis показал допустимый HBA-first
  `COORDINATOR/WRONG_DATABASE/28000` вместо `3D000`.

Accepted successor использует один exact IP socket endpoint, отдельное TLS
server name, не передаёт `statement_timeout` при connect и принимает `28000`
только для изолированного `WRONG_DATABASE` scenario. Actual harness закрепляет
обе допустимые database-denial ветки `3D000` и `28000`.

## Deliberate non-claim

R9 закрывает co-located public collector/runner topology gate. Он не включает
protected production signer/key/root, не канонизирует CURRENT187 ledgers и
runtime roles, не заменяет restored-copy apply/repeat/rollback/zero-diff и
независимую latest-byte проверку.

Production, текущая сеть из четырёх клубов, внешний tenant/tester, invites и
providers не изменялись. External beta access остаётся `NO-GO`.
