# Founder pilot: activation-role network acceptance

Статус:
`EXACT-SHA CI ACCEPTED / UNIT 7/7 + SYNTHETIC TLS/SCRAM PASS / PRODUCTION NO-GO`.

Контракт `FOUNDER_PILOT_ACTIVATION_ROLE_NETWORK_ACCEPTANCE_V1` принимает только
сетевую границу dedicated роли `leetplus_founder_beta_activation_runtime` на
изолированной restored copy. Он не запускает API, не вызывает activation wrapper,
не создаёт tenant/invite и не разрешает внешний доступ.

## Что проверяется

Один запуск обязан доказать одновременно:

- fresh exact role attestation до и после всех сетевых probe с тем же receipt и
  catalog digest;
- ровно один предшествующий `hostssl` allow для exact target database, exact
  роли и `127.0.0.1/32` с `scram-sha-256`;
- следующий role-scoped `hostssl all ... reject` для любой другой database;
- role-scoped `hostnossl all ... reject` для plaintext;
- CA bytes совпадают с отдельно поданным SHA-256, TLS peer certificate принят
  стандартным `tls.checkServerIdentity` для exact endpoint;
- runtime session использует TLS 1.2/1.3, exact role/database/host/port;
- correct secret входит, изменённый secret получает PostgreSQL `28P01`;
- exact существующая другая database и plaintext получают `28000`;
- роль имеет только ожидаемые CONNECT/USAGE/wrapper EXECUTE, не получает
  CREATE/TEMP и не может читать `public."Tenant"` напрямую;
- receipt не содержит URL, password, file path, PEM bytes или PostgreSQL error
  text.

Любой unknown error, HBA parse error, broad preceding match, catalog drift,
wrong error code или clone test-adapter возвращает `BLOCKED_MANUAL`.

## CLI

```powershell
$env:FOUNDER_PILOT_RESTORED_COPY_DATABASE_URL = 'postgresql://<owner>:<secret>@127.0.0.1:<non-5432>/<restored-target>'
$env:FOUNDER_PILOT_ACTIVATION_ROLE_DATABASE_URL = 'postgresql://leetplus_founder_beta_activation_runtime:<secret>@127.0.0.1:<same-port>/<same-target>'
pnpm --filter database founder-pilot:activation-role-network -- `
  --manifest 'C:\absolute\protected\manifest.json' `
  --operation-id '<same-uuid-v4-as-role-receipt>' `
  --receipt 'C:\absolute\protected\activation-role-receipt.json' `
  --ca 'C:\absolute\protected\ca.crt' `
  --ca-sha256 '<64-lowercase-hex>' `
  --denied-database '<existing-other-database>'
Remove-Item Env:FOUNDER_PILOT_ACTIVATION_ROLE_DATABASE_URL
Remove-Item Env:FOUNDER_PILOT_RESTORED_COPY_DATABASE_URL
```

`--denied-database` должен указывать существующую другую database: иначе отказ
`3D000` не доказывает HBA isolation и не принимается вместо `28000`.

## Synthetic PostgreSQL evidence 18.08.2026

Одноразовый PostgreSQL 16.13 был поднят только на `127.0.0.1:55441`. Exact Git
archive accepted release `032bacbf4c052bd4f3a8a575687e324bae5edaf3`
развернул все `183` migrations; попытка использовать CRLF Windows working tree
была корректно отклонена historical CURRENT179 manifest guard и не считалась
evidence.

После read-only preflight и exact role apply принят результат:

```text
ACTIVATION_ROLE_NETWORK_ACCEPTED
TLSv1.3 / TLS_AES_256_GCM_SHA384
correct SCRAM login = PASS
wrong secret = 28P01
other database = 28000
plaintext = 28000
direct Tenant read = 42501
pre/post role attestation = identical
```

PII-free digests:

- network evidence:
  `5674b09f8719ada6d9e6ab2bae008a7cdf292eafe07b321d758c7238be0edd7b`;
- HBA catalog:
  `74cc934b17c9110e406c154072e7ddad1e4c51163dacb92c7dd92e3b03fa8cc0`;
- certificate:
  `409345cc920b3a812edd7ac418baaea0da51c39e0f4c8320228dccc172bb4e1f`.

Implementation SHA
`821b2fbd62a098141664ca4c1b3970125e05eeff` принят push CI
`32065667436` и PR CI `32065674292` как `3/3 SUCCESS`. Release artifact
`9300127232` имеет имя
`leetplus-release-821b2fbd62a098141664ca4c1b3970125e05eeff` и digest
`sha256:f2cca9b58af07abcf92fb06e8e9b1d8e1ae47d4b5abf781f94e2feef791d1e41`.

После acceptance exact role controller выполнил rollback. Role count `0`,
исходные `PUBLIC TEMPORARY=true` и `public CREATE=false` восстановлены, other
sessions `0`; cluster остановлен, port/process/temp-root `0`. Synthetic CA/key,
role secret, dump, archive, manifest, receipt и debug evidence удалены без
возможности восстановления.

## Что ещё не принято

- immutable production backup и independently obtained checksum;
- скачанный release artifact вместо локального `git archive`;
- PgBouncer/dedicated pool session identity, transaction pooling и drain;
- live API process, который использует только dedicated pool URL;
- activation wrapper call с synthetic GO/tenant fixture;
- production role/secret/HBA/certificate и любой внешний tenant/invite.
