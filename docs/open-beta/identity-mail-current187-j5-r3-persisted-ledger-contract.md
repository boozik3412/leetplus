# CURRENT187-J5-R3: persisted probe ledger contract

Дата фиксации: 12.08.2026.

Статус: `EXACT-SHA CI ACCEPTED / NONCANONICAL POSTGRESQL CANDIDATE / NOT DEPLOYED`.

## Результат

J5-R3 добавляет переносимый deny-only контракт для одноразового потребления и
отзыва independently signed J5 connection-probe envelope. Контракт отделён от
signer, verifier, runner и будущего PostgreSQL executor и сам не имеет
database, filesystem-write, network, process, environment, deploy, tenant,
invite или provider capability.

Он принимает только exact J5 envelope вместе с process-branded verification
receipt, связывает их через canonical JSON и отдельные digest domains и
формирует:

- one-time consumption command с exact `operationId`, `nonce`, release,
  cluster, universe, matrix, envelope, public-root и timeline binding;
- revocation command для трёх непересекающихся scope: `ENVELOPE`, `MATRIX` и
  `ROOT`;
- точную проекцию аргументов будущего execute-only PostgreSQL RPC;
- проверяемое присоединение byte-exact persisted consumption/revocation
  receipt без выдачи runtime или launch authority.

Все receipt сохраняют `testAccessAuthorized=false`, `sharedBetaAccess=false` и
`productionRootEnrolled=false`. Production verification root остаётся
frozen-empty.

## Fail-closed границы

- Raw или cloned verifier receipt не принимается.
- Envelope, payload, matrix, root, release, operation, nonce и timeline нельзя
  заменить или переиспользовать между командами.
- Expired envelope не превращается в consumption command.
- Duplicate, reordered или иным образом изменённый persisted receipt должен
  быть отклонён до появления какого-либо эффекта.
- Revocation требует точной confirmation phrase и различает exact scope
  digest.
- Proxy, accessor, sparse и extra-key входы отклоняются без исполнения
  пользовательских getter.
- Replay/lost-response может завершиться только присоединением того же
  byte-exact receipt; текущий модуль не выполняет повторную запись сам.

## Локальная приёмка

- J5-R3 contract: `6/6 PASS`;
- combined J5 verifier/runner/signer/ledger: `32/32 PASS`;
- aggregate CURRENT187 gate: `111/111 PASS`;
- syntax checks: `PASS`.

Noncanonical PostgreSQL candidate добавлен вне `prisma/migrations`. Он содержит
три append-only таблицы, FORCE RLS, owner-only policies, отдельные exact-OID
consumer/revoker/runtime роли и execute-only consume/revoke RPC. Статическая
приёмка candidate: `7/7 PASS`; combined J5: `39/39`; aggregate CURRENT187:
`118/118`. Exact SHA `1f7ef47c…` принят CI `31606012609` как `3/3 SUCCESS`;
actual PostgreSQL hostile fixture — `1/1 PASS`, postflight
`databases/roles/sessions = 0/0/0`, artifact `sha256:0fc0908b…8972`.

## Что этот этап не закрывает

J5-R3 пока не является canonical или production PostgreSQL ledger. Candidate
находится вне canonical migrations. Не проведены external key ceremony, OS
ACL/HSM/KMS attestation, reviewed production root enrollment, production-like
four-service run и binding branded persisted J5 receipt в
CURRENT187-F/deploy authority.

Поэтому production, `Tenant A/A1..A4`, внешний tenant/tester, invites и
providers не изменялись. Решение по внешнему тесту остаётся `NO-GO`.

## Следующий этап

1. Провести независимую latest-byte проверку SQL/RLS/RPC и test harness.
2. Выполнить production-like branded J1–J4 four-service rehearsal без
   production effects.
3. Провести external key ceremony/ACL-HSM attestation и reviewed production
   root enrollment отдельным решением.
4. Только после этих проверок рассматривать canonical promotion и binding
   persisted J5 receipt в CURRENT187-F/deploy authority.
