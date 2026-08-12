# CURRENT187-J5-R9: co-located public collector runner candidate

Дата: 12.08.2026.

Статус: `IMPLEMENTED LOCALLY / CI ACCEPTANCE REQUIRED / NO PRODUCTION EFFECT`.

## Цель

Собрать в одном disposable PostgreSQL/PgBouncer контуре и в одном Node.js
процессе непрерывную strict production-origin цепочку:

1. четыре public J1 PostgreSQL session receipt для `APPLICATION`,
   `COORDINATOR`, `MIGRATION`, `WORKER`;
2. четыре public J2 endpoint/TLS peer receipt, связанные с соответствующими J1;
3. один public J3 HBA/reload receipt;
4. один public J4 PgBouncer control-plane receipt, связанный с J2 application и
   J3;
5. production `runCurrent187ConnectionProbeMatrix` с четырьмя положительными,
   двадцатью сетевыми отрицательными и двенадцатью control-policy проверками.

## Реализация

- disposable CA подписывает отдельные server/client certificates;
- PostgreSQL и PgBouncer используют TLS `verify-full`;
- J2 и connection-probe runner получили exact bounded client-certificate и
  PKCS#8 private-key input contract с отдельными SHA-256 bindings;
- synthetic paths требуют четыре exact `null` и не могут принять client key;
- runner передаёт client credential только TLS-клиенту и не включает PEM,
  исходные hashes, URL, роли, базы или пароли в receipt;
- fixture временно устанавливает узкий `pg_hba.conf`, а `trap` восстанавливает
  точные исходные bytes, reload и удаляет disposable роли;
- два временных DNS имени привязаны к loopback только на время fixture, после
  чего `/etc/hosts` восстанавливается;
- production collectors вызываются через публичные entrypoints; test-only
  dependency seams не используются для R9 acceptance.

## Локальная проверка

- connection-probe runner unit: `11/11 PASS`;
- actual synthetic wire/TLS runner: `2/2 PASS`;
- J2 unit: `10/10 PASS`;
- J2 actual SSLRequest/TLS harness: `1/1 PASS`;
- aggregate CURRENT187: `126/126 PASS`;
- database TypeScript typecheck: `PASS`;
- immutable refreeze: `17/17 PASS`;
- disposable assembler: `21/21 PASS`;
- shell syntax, Node syntax, Prettier и `git diff --check`: `PASS`.

Локальная Windows-среда не содержит PgBouncer/PostgreSQL service-container
топологии GitHub Actions. Поэтому новый co-located public-collector тест не
считается принятым до `3/3 SUCCESS` на exact commit SHA и публикации SHA-bound
artifact.

## Обязательные CI assertions

- все четыре J1 и J2 имеют strict production-origin brand;
- J3 и J4 имеют strict production-origin brand и одну exact cluster/release
  binding;
- production runner возвращает `4 positive / 20 network negative / 12 control
negative`, без skip;
- serialized receipt не содержит PEM, private key, пароли, URL, hostname,
  database или role names;
- HBA и временные role изменения очищены до следующих PostgreSQL gates;
- все последующие shared-beta и isolation gates остаются green.

## Не является разрешением доступа

Даже успешный R9 не включает production signer/key/root, не канонизирует
CURRENT187 ledgers/runtime roles и не заменяет restored-copy
apply/rollback/zero-diff rehearsal и независимую проверку. Production, текущая
сеть из четырёх клубов, внешний tenant, тестер, приглашения и провайдеры этим
этапом не изменяются. До закрытия следующих gates действует `NO-GO`.
