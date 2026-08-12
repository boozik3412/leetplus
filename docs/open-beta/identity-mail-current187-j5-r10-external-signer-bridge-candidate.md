# CURRENT187-J5-R10: disposable external signer bridge

Дата реализации candidate: 13.08.2026.

Статус: `LOCAL CANDIDATE / EXACT-SHA CI PENDING / PRODUCTION ROOT FROZEN EMPTY`.

## Цель

Соединить принятый R9 public-collector runner с уже реализованным production
file-backed signer entrypoint, не регистрируя тестовый ключ как production root
и не создавая ложного разрешения на deployment или внешний доступ.

## Контур

В disposable Linux CI fixture:

1. вне repository и system temp создаётся отдельный каталог с mode `0700`;
2. OpenSSL создаёт одноразовую Ed25519 пару в canonical PKCS8 DER/SPKI DER;
3. private key получает mode `0600`, public key — `0644`;
4. SHA-256 public SPKI передаётся signer loader как независимый exact pin;
5. production file-backed signer принимает exact branded R9 runner receipt и
   подписывает production-environment J5 envelope;
6. подпись независимо проверяется public SPKI;
7. pinned production verifier обязан завершиться
   `CURRENT187_CONNECTION_PROBE_AUTHORITY_NOT_ENROLLED`, потому что production
   root registry остаётся frozen-empty;
8. trap удаляет ровно два известных key-файла и пустой signer-каталог. Любой
   неожиданный residue превращает fixture в failure.

## Обязательные инварианты

- private key и его путь не входят в authority, envelope или runner receipt;
- public key path также не входит в сериализуемый результат;
- signer не получает database/network/deploy/tenant/provider authority;
- R9 receipt сохраняет `productionRuntimeAttested=false`,
  `testAccessAuthorized=false`, `sharedBetaAccess=false`;
- disposable root не добавляется в
  `PINNED_CURRENT187_CONNECTION_PROBE_PRODUCTION_ROOTS`;
- candidate не изменяет production, текущую сеть `Tenant A/A1..A4`, внешний
  tenant, tester account, invite или provider state.

## Локальный preflight

- connection-probe/J5 focused gate: `43/43 PASS`;
- integration source: Node syntax `PASS`;
- shell fixture: Git Bash syntax `PASS`;
- integration без explicit Linux fixture confirmation: `4/4 SKIP`, что не
  считается acceptance evidence;
- `git diff --check`: `PASS`.

## Условия приёмки

R10 может быть принят только на exact commit SHA, если GitHub CI завершит
`3/3 SUCCESS`, целевая PgBouncer integration выполнит `4/4 PASS` без skip и
последующие PostgreSQL/shared-beta gates останутся зелёными после scoped
cleanup. До этого статус — candidate.

Даже после acceptance R10 не является production root enrollment. Следующие
обязательные этапы: отдельно разрешённая key ceremony и reviewed root
transition, canonical ledger/runtime roles/grants/attestation,
restored-copy apply/repeat/rollback/zero-diff и независимая latest-byte
проверка. Внешний доступ остаётся `NO-GO`.
