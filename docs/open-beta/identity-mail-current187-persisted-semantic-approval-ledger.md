# CURRENT187-I — persisted semantic approval ledger

Статус на 10.08.2026:
`FOUNDATION IMPLEMENTED / POLICY GATE ENFORCED / DATABASE LEDGER PENDING / DENY-ONLY / NONCANONICAL / NOT DEPLOYABLE`.

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

## Локальное evidence

- Authority + acquisition/policy/ledger focused suites: `31/31`.
- Rehearsal blocker/planner/refreeze/assembler/contract и CURRENT187 focused
  acceptance: `133/133`.
- Официальный последовательный rehearsal script зелёный: materializer `24/24`,
  journal `24/24`, runner `14/14`, runtime `27/27`, а также SQL/coordinator и
  operator CLI suites.
- Production, tenant, stores, users, invites, providers и external APIs не
  изменялись.

## Что ещё не реализовано

Foundation намеренно не может выдать рабочий persisted receipt без
PostgreSQL. До повышения статуса обязательны:

1. отдельный noncanonical migration candidate с append-only consumption и
   revocation tables;
2. `FORCE RLS`, owner-only table access и раздельные execute-only consumer и
   revoker roles;
3. RPC consumption/revocation с lock order
   `root → approval → document → evaluation → operation → nonce`;
4. fresh `clock_timestamp()` после полного ожидания locks;
5. byte-exact lost-response replay, conflict detection и one-time uniqueness;
6. hostile PostgreSQL matrix для replay, expiry-during-wait, revoke/consume
   races, cross-scope revocation, role/ACL attacks и zero residue;
7. независимая latest-byte review и exact-head CI evidence.

## Влияние на открытый тест

Статус внешнего доступа остаётся `NO-GO`. CURRENT187-I закрывает application
policy от неперсистированного semantic approval, но не является production
root, deployment GO или `SHARED BETA GO` и не создаёт `Tenant B/Store B1` либо
OWNER invite.
