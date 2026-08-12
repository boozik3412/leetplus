# CURRENT187-J5: independently signed connection-probe matrix

Дата фиксации: 12.08.2026

Статус: `ENGINEERING ACCEPTED LOCALLY / SYNTHETIC SIGNED CONTRACT / DENY-ONLY / NOT DEPLOYABLE`.

## Назначение

J1–J4 наблюдают backend session, endpoint/TLS, HBA file catalog и PgBouncer
control plane, но сами не доказывают, что запрещённые реальные соединения были
отклонены. J5 вводит отдельный purpose-bound Ed25519 trust domain для
подписанного результата connection matrix.

Матрица содержит четыре строго упорядоченных service purpose:

1. `APPLICATION` — `POOLER` + `TRANSACTION`;
2. `COORDINATOR` — `DIRECT_DATABASE` + `SESSION`;
3. `MIGRATION` — `DIRECT_DATABASE` + `SESSION`;
4. `WORKER` — `DIRECT_DATABASE` + `SESSION`.

Для каждого purpose обязателен положительный `ALLOWED` probe с `VERIFY_FULL`,
безопасным HBA (`scram-sha-256` либо `cert`) и digest bindings к J1/J2,
application name, backend identity, HBA rule, pooler mapping, secret reference и
allowed operations.

## Обязательные negative probes

Каждый service purpose содержит ровно восемь сценариев в фиксированном порядке:

- `WRONG_ROLE → AUTHENTICATION_REJECTED`;
- `WRONG_DATABASE → DATABASE_ACCESS_REJECTED`;
- `PLAINTEXT_TRANSPORT → TLS_REQUIRED_REJECTED`;
- `WRONG_CA → CA_VERIFICATION_REJECTED`;
- `WRONG_HOSTNAME → HOSTNAME_VERIFICATION_REJECTED`;
- `STALE_HBA_RELOAD → STALE_CONTROL_PLANE_REJECTED`;
- `WRONG_POOL_MODE → POOL_MODE_POLICY_REJECTED`;
- `POOLER_USER_COLLAPSE → SERVICE_IDENTITY_COLLAPSE_REJECTED`.

Пропуск, перестановка, неизвестный сценарий, `ALLOWED` вместо ожидаемого deny,
нулевой digest или неполный service set отклоняются fail closed.

## Authority и freshness

- signature algorithm: Ed25519;
- независимые `purpose/profile/trustDomain`;
- signature покрывает весь canonical payload, включая cluster, database
  universe, exact release SHA, J3/J4 control receipts, runner/transcript,
  operation UUID, nonce и все 36 probe outcomes;
- максимальная signed lifetime: пять минут;
- допустимый future clock skew: 30 секунд;
- service-account separation обязательна для application name, backend,
  pooler mapping, positive probe и secret reference;
- все 32 negative evidence digest глобально различны между service purpose;
- plain clone не пересекает process-local receipt brand.

Production registry намеренно frozen-empty. Production verifier поэтому
возвращает `CURRENT187_CONNECTION_PROBE_AUTHORITY_NOT_ENROLLED`; verifier source
не содержит signer/private key, filesystem, network, process, Prisma или
environment capability. Test-only envelope подписывается исключительно в
adversarial test harness и принимается только в explicit loopback CI context.

## Локальная приёмка

- J5 adversarial tests: `10/10 PASS`;
- aggregate CURRENT187 gate: `89/89 PASS`;
- database typecheck: `PASS`;
- syntax и Prettier: `PASS`.

Все receipts сохраняют `authorization=false`, `canMutate=false`,
`canSend=false`, `productionRuntimeAttested=false`,
`testAccessAuthorized=false`, `sharedBetaAccess=false`.

## Что ещё требуется

J5 сейчас является подписываемым verification contract, а не production probe
runner. До повышения статуса обязательны:

1. capability-bearing runner, который фактически выполняет все 36 probes в
   production-like/production topology и формирует secret-free transcript;
2. независимый protected signer/HSM и reviewed production public-root
   enrollment;
3. persisted one-time consumption/revocation, expiry/replay и lost-response
   reconciliation;
4. binding branded J5 receipt в CURRENT187-F/deploy authority;
5. independent latest-byte review и restored-copy rehearsal.

Production, текущая сеть из четырёх клубов, внешний tenant/tester, invites и
providers не изменялись. Внешний доступ остаётся `NO-GO`.
