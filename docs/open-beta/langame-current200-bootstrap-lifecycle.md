# CURRENT200: public bootstrap-root lifecycle planner

| Поле                           | Значение                                  |
| ------------------------------ | ----------------------------------------- |
| Статус                         | `IMPLEMENTED LOCALLY / DENY-ONLY / NO-GO` |
| Дата                           | 14.08.2026                                |
| Production root                | отсутствует                               |
| Production / Tenant A / tester | не изменялись                             |

Exact-SHA engineering acceptance: `ccf387645e4c9dd56502612ea41130f3bad3ea94`,
[CI run 31767536910](https://github.com/boozik3412/leetplus/actions/runs/31767536910),
release artifact
`leetplus-release-ccf387645e4c9dd56502612ea41130f3bad3ea94`, digest
`sha256:eae83b266e618ee20c6b97d2e32ebc6123bdff8558e1c3c185fbcb4e71da4f33`.

CURRENT200 добавляет детерминированный public-only planner для трёх операций
над immutable CURRENT198 registry:

- первичное добавление единственного `ACTIVE` bootstrap root;
- линейная rotation с `ACTIVE -> RETIRED` и единственным successor;
- emergency revoke активного root без автоматического replacement.

Planner принимает только канонический CURRENT198 registry, публичный Ed25519
SPKI, operation UUID, reason digest и bounded timeline. Он повторно использует
CURRENT198 validation и transition rules, вычисляет exact current/candidate
registry digests, canonical candidate JSON и отдельный operation digest.

## Граница безопасности

- private key не принимается и не создаётся;
- filesystem, process env, network, Prisma и signer authority отсутствуют;
- planner не пишет registry module и не запускает transition verifier;
- все outputs содержат `authorization=false`, `canApply=false`,
  `canEnrollProductionRoots=false`, `productionExecutionAllowed=false`,
  `testAccessAuthorized=false` и `sharedBetaAccess=false`;
- clone output не сохраняет process brand;
- proxy/accessor inputs отклоняются без вызова accessor.

Focused matrix `11/11` покрывает initial enrollment, rotation, revoke, exact
digest binding, CLI parsing/confirmation, descriptor-bound public-key read,
state/timeline/key rejection и отсутствие mutation authority.
CURRENT198 `20/20` и CURRENT199 `19/19` регрессии остаются зелёными.

## Что остаётся

CURRENT200 не является key ceremony или production enrollment. Программная
часть двухконтрольной проверки реализована следующим deny-only контрактом:
[CURRENT201 two-person ceremony](./langame-current201-two-person-bootstrap-ceremony.md).
Фактический этап всё ещё требует внешней/offline генерации private key,
двухконтрольной проверки public fingerprint, защищённого хранения private
material и отдельного reviewed изменения CURRENT198 canonical literal. Затем обязательны exact-parent
transition verification, production-origin CURRENT196–199 registration,
runtime role/grant attestation и production-like apply/rollback/zero-residue
rehearsal.

Owner invite workflow остаётся dormant: его hard-coded `OWNER + NETWORK`, шесть
entitlements, mailbox-bound token и password-at-acceptance уже реализованы, но
route нельзя открывать до принятого production admission и `SHARED BETA GO`.
