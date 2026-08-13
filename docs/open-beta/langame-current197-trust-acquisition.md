# CURRENT197 — protected public-root и TLS acquisition

## Статус

`LOCAL HARDENED SUCCESSOR / DENY-ONLY / PRODUCTION PROPOSAL UNAVAILABLE / EXTERNAL BETA NO-GO`

Дата: 13.08.2026.

CURRENT197 связывает принятый CURRENT196 proposal с фактически прочитанными
public-root/CA bytes и TLS peer observation. Это production-capable collector,
но его production entry требует exact branded CURRENT196 receipt с
`verificationMode=PINNED_PRODUCTION`. Текущий CURRENT196 production bootstrap
registry frozen-empty и такой receipt создать невозможно, поэтому production
entry прекращает работу до filesystem, DNS или TLS.

Production, `Tenant A / A1..A4`, внешний tenant, tester account и invite не
изменены.

## Protected file acquisition

Collector принимает только три разные absolute path:

- CURRENT193 runtime-attestation public SPKI PEM;
- CURRENT195 revoke-intent public SPKI PEM;
- TLS CA certificate PEM.

Для каждого файла выполняются:

- `lstat → realpath → lstat → open → fstat → bounded descriptor read → overflow
probe → fstat → lstat`;
- запрет symlink и hardlink, проверка regular file, size, device/inode и
  неизменности до/после чтения;
- production-запрет repository и system-temp roots;
- canonical Ed25519 SPKI PEM и exact CURRENT196 fingerprint для обоих roots;
- разные root byte digests/fingerprints;
- exact signed SHA-256 CA bytes.

Ни source path, ни PEM bytes не входят в receipt.

## TLS peer acquisition

Production dependency выполняет только TLS handshake — HTTP/API request не
отправляется. До соединения collector:

- требует production hostname внутри `.langame.ru` или `.langamepro.ru`;
- получает bounded DNS address set и запрещает private, loopback, link-local,
  documentation и multicast addresses;
- соединяется с exact выбранным IP, сохраняя signed `serverName`;
- включает `rejectUnauthorized=true`, signed CA и minimum TLS `1.2/1.3`.

После handshake повторно проверяются authorization, hostname, remote IP/port,
protocol/cipher, leaf DER SHA-256, leaf SPKI SHA-256, exact certificate validity
и текущее время. Proposal проверяется до любого I/O и повторно после handshake.

## Receipt и authority boundary

Branded receipt фиксирует candidate/enrollment/release/artifact/config binding,
public-root fingerprints и byte digests, CA/leaf/SPKI digests, DNS-set digest,
полный TLS observation digest, TLS protocol и collection time. Переносимый
receipt digest включает database/release/root/config provenance и observation
digest. Receipt не содержит IP-массив, paths, PEM, secrets или полный proposal.

Все разрешающие поля остаются закрытыми:

- `authorization=false`;
- `canEnrollProductionRoots=false`;
- `canConnectNetwork=false`;
- `canMutate=false`;
- `productionExecutionAllowed=false`;
- `productionRootEnrolled=false`;
- `testAccessAuthorized=false`;
- `sharedBetaAccess=false`.

Synthetic entry доступна только для loopback CI, `_ci` database и exact
confirmation. Test dependencies нельзя передать production entry.

## Локальное evidence

- CURRENT197 focused suite с actual disposable TLS-only handshake и
  CA-substitution negative и IP policy adversarial matrix: `13/13 PASS`;
- composed CURRENT196/CURRENT197: `25/25 PASS`;
- syntax checks: `PASS`.

Покрыты exact positive receipt, production-before-I/O deny, cloned proposal,
synthetic widening, root substitution, hardlink, CA drift, DNS duplicate/invalid,
TLS authorization/hostname/certificate/SPKI/protocol/address/validity drift,
proposal expiry before I/O, accessor zero-call и отсутствие DB/HTTP/secret/signer
authority.

Exact implementation commit:
`83e3a72522ce1b93c46d50d8169390468305330d`.

GitHub Actions run
[`31732110067`](https://github.com/boozik3412/leetplus/actions/runs/31732110067)
завершён `3/3 SUCCESS`:

- Application checks — `SUCCESS`, включая actual TLS-only CURRENT197 gate;
- Authority root trust gate — `SUCCESS`;
- PostgreSQL migration smoke — `SUCCESS`.

SHA-bound release artifact: ID `9193973557`, имя
`leetplus-release-83e3a72522ce1b93c46d50d8169390468305330d`, digest
`sha256:8c77b16b9697d9db505cca37afe099cfeccaf895036bf91e70bde936f0c1e82c`.

Post-acceptance latest-byte review обнаружил P1: expanded IPv4-mapped IPv6 мог
обойти строковую private-address policy. Hardened successor использует два
family-separated binary `BlockList`, отдельно запрещает mapped IPv4, NAT64,
Teredo, 6to4 и остальные явно non-global ranges. Старый exact SHA остаётся
исторически принятым, но superseded для CURRENT197; successor exact-SHA CI ещё
не принят. Disposable fixture использует собственную CA и loopback TLS server и
не является live production evidence.

## Что остаётся до тестового доступа

1. Принять hardened CURRENT197 successor exact-SHA CI и latest-byte review.
2. Внести offline bootstrap public root CURRENT196 отдельным reviewed immutable
   release change — не через API/env/database.
3. Реализовать one-time append-only enrollment/rotation/revocation ledger.
4. Зафиксировать protected signer custody/ACL либо HSM/KMS.
5. Провести отдельно разрешённую `PRODUCTION ROOT ENROLLMENT GO` ceremony.
6. После этого пройти restored-copy apply/repeat/rollback/zero-diff,
   production-like admission, cutover текущей сети и Gate 2 первого внешнего
   tenant.

CURRENT197 не является root enrollment, deployment GO, cutover GO или
test-access GO.
