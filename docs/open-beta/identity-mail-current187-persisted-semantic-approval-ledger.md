# CURRENT187-I — persisted semantic approval ledger

Статус на 10.08.2026:
`LOCAL POSTGRESQL ACCEPTED / POLICY GATE ENFORCED / DENY-ONLY / NONCANONICAL / NOT DEPLOYABLE`.

## Зачем нужен этот слой

CURRENT187-H доказывает, что independent authority подписал exact semantic
allowlist для конкретных cluster, database universe, review evidence и risk
facts. Одной подписи недостаточно: без durable consumption ledger один и тот
же approval можно повторно использовать, а revoke и expiry могут гоняться с
consumption.

CURRENT187-I вводит обязательный промежуточный контракт. Policy F больше не
принимает сырой H receipt и требует брендированный persisted I receipt.

## Реализовано

- Authority receipt явно различает `PINNED_PRODUCTION` и
  `SYNTHETIC_LOOPBACK_CI` verification provenance.
- H receipt передаёт exact signed `operationId`, `nonce`, authority
  issue/verify/expiry, signing key identity, document approval/expiry и все
  необходимые digests без PII и secret material.
- Consumption command связывает approval, evaluation, document, root,
  cluster, database universe, review и semantic facts в один canonical
  digest-bound bundle.
- Consumption проверяет свежесть и authority envelope, и allowlist document на
  явном времени.
- Revocation поддерживает scopes `APPROVAL`, `DOCUMENT`, `EVALUATION` и
  `ROOT` с отдельными event/actor/reason digests.
- Persisted consumption/revocation receipts принимаются только как exact
  data-only JSON, проверяются по command digest, transaction id, deny-only
  flags и module brand; clone/replay вне бренда не проходит.
- Policy F требует `persistedConsumptionVerified=true`; raw H, JSON clone и
  forged database receipt fail closed.
- CURRENT187 tooling/refreeze/assembly digests обновлены byte-exact; весь
  release lane остаётся nondeployable и deny-only.
- Noncanonical migration candidate `20260810190000_identity_mail_semantic_approval_ledger_current187`
  создаёт append-only consumption/revocation streams, `FORCE RLS`, owner-only
  policies и отдельные execute-only consume/revoke RPC.
- Оба RPC реконструируют exact canonical JSON из уже проверенных scalar fields:
  reordered JSON и duplicate-key substitution с пересчитанным digest
  отклоняются как `22023`.
- Общий lock order — `root → approval → document → evaluation`; consume затем
  берёт `operation → nonce`. Expiry проверяется свежим `clock_timestamp()` после
  полного ожидания locks.

## Локальное evidence

- Authority + acquisition/policy/ledger focused suites: `31/31`.
- Candidate static contract: `7/7`.
- Rehearsal blocker/planner/refreeze/assembler/contract и CURRENT187 focused
  acceptance: `133/133`.
- Официальный последовательный rehearsal script зелёный: materializer `24/24`,
  journal `24/24`, runner `14/14`, runtime `27/27`, а также SQL/coordinator и
  operator CLI suites.
- Production, tenant, stores, users, invites, providers и external APIs не
  изменялись.
- Foundation exact SHA `340e6f05d3ae0051eff9e64581968759248163d5`
  принят CI run `31411596083` как `3/3 SUCCESS`; artifact digest
  `sha256:95afdce0d00a1cda1a482af082df0fd0478935714fa6efdf48b82270fd931ee3`.
- Два независимых локальных PostgreSQL `16.13` hostile run прошли `1/1`:
  exact replay/conflict, все четыре revoke scope, consume↔revoke race,
  consumption и revocation expiry-during-lock-wait, role/ACL и append-only
  attacks, а также reordered/duplicate-key noncanonical JSON. После каждого
  run disposable DB/roles/sessions: `0/0/0`.

## Что ещё не реализовано

Candidate намеренно не является canonical migration и не может выдать
production-authorized receipt. До повышения статуса обязательны:

1. независимая latest-byte security review нового SQL и fixture;
2. exact-head CI, где новый hostile PostgreSQL step выполняется на финальных
   bytes;
3. production root enrollment и отдельно подписанный deployment GO;
4. exact LOGIN/HBA/TLS/pooler/service-account/runtime role attestation;
5. reviewed canonical promotion и restored-copy apply/repeat/rollback/zero-diff
   rehearsal без production mutation.

## Влияние на открытый тест

Статус внешнего доступа остаётся `NO-GO`. CURRENT187-I закрывает application
policy от неперсистированного semantic approval, но не является production
root, deployment GO или `SHARED BETA GO` и не создаёт `Tenant B/Store B1` либо
OWNER invite.
