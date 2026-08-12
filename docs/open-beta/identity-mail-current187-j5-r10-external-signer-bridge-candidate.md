# CURRENT187-J5-R10: disposable external signer bridge

Дата реализации candidate: 13.08.2026.

Статус: `EXACT-SHA CI ACCEPTED / DISPOSABLE EXTERNAL SIGNER / PRODUCTION ROOT FROZEN EMPTY`.

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

## Exact-SHA CI acceptance

R10 принят на exact commit
`8c34895a35bdebc91cf5deba4258adcc709a6b7f`:

- GitHub Actions run `31639146344`: `3/3 SUCCESS`;
- target PgBouncer integration: `4/4 PASS`, `fail=0`, `skipped=0`;
- четвёртый subtest выполнил co-located public J1–J4 runner и production
  file-backed external signer;
- все последующие PostgreSQL/shared-beta gates завершились успешно;
- release artifact ID `9158424615`, digest
  `sha256:9ac538fa08ccf2024e7e1acf54814b00995ec7a84dfd9adbb75c8a62906b00a4`.

Полное доказательство:
[R10 CI evidence](./identity-mail-current187-j5-r10-ci-evidence-2026-08-13.md).

Даже после acceptance R10 не является production root enrollment. Следующие
обязательные этапы: отдельно разрешённая key ceremony и reviewed root
transition, canonical ledger/runtime roles/grants/attestation,
restored-copy apply/repeat/rollback/zero-diff и независимая latest-byte
проверка. Внешний доступ остаётся `NO-GO`.
