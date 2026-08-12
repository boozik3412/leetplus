# CURRENT187-J5-R2: protected signer boundary

Дата фиксации: 12.08.2026

Статус: `ENGINEERING ACCEPTED LOCALLY / FILE-BACKED SIGNER FOUNDATION / DENY-ONLY / ROOT NOT ENROLLED`.

## Назначение

R2 отделяет выполнение connection-probe matrix от подписи результата. Runner
не имеет filesystem/private-key capability, а signer не имеет database,
network, process, environment, deploy, tenant, invite или provider capability.
Signer принимает только точный process-branded J5-R1 receipt и формирует exact
J5 Ed25519 envelope.

## Production boundary

Production loader требует:

- разные canonical absolute PKCS8 private-key и SPKI public-key файлы;
- Ed25519 key pair и точный SHA-256 public-key pin;
- файлы вне repository и system temp;
- отсутствие symlink и hardlink;
- bounded file size и descriptor/fstat/reopen identity checks;
- private-key mode без group/other permissions на POSIX;
- повторную проверку inode/device и byte digest перед и после подписи;
- purpose-bound key ID и canonical bounded root validity interval.

Публичный authority object не содержит private key, private-key bytes или
private-key path. Все capabilities явно false. Signer связывает envelope с
exact runner `releaseSha`, cluster/universe, operation/nonce, host-control,
J3/J4, artifact/transcript и четырьмя ordered service results.

## Локальная приёмка

- signer adversarial tests: `6/6 PASS`;
- J5 verifier + runner + signer: `26/26 PASS`;
- aggregate CURRENT187: `105/105 PASS`;
- database typecheck: `PASS`;
- syntax, Prettier и `git diff --check`: `PASS`.

Проверены valid sign→verify, clone rejection, production/test authority
separation, external file-backed key loading, public pin mismatch, repository
key rejection, byte drift, future/inactive root, proxy/accessor zero-call и
capability-source scan.

## Что это не разрешает

Production root registry J5 остаётся frozen-empty. В рамках R2 не создавались
production key, HSM/KMS identity, secret, root transition или deployment
configuration. До production enrollment обязательны:

1. отдельная key-generation/rotation ceremony вне repository;
2. OS service identity и ACL attestation (для Windows — отдельный DACL proof;
   для Linux — owner/mode/mount proof) либо HSM/KMS-backed signer;
3. независимая сверка public SPKI SHA-256 и reviewed root transition;
4. persisted one-time consumption/revocation с expiry/replay/lost-response;
5. binding branded verified J5 receipt в CURRENT187-F/deploy authority;
6. production-like branded J1–J4 run, latest-byte review и restored-copy
   rehearsal.

Production, `Tenant A/A1..A4`, внешний tenant/tester, invites и providers не
изменялись. Внешний доступ остаётся `NO-GO`.
